begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select no_plan();

select extensions.dblink_connect(
  'qualifying_activity_lock_holder',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);
select extensions.dblink_connect(
  'qualifying_activity_favourite',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);
select extensions.dblink_connect(
  'qualifying_activity_check_in',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);

select is(
  extensions.dblink_exec(
    'qualifying_activity_lock_holder',
    $setup$
      delete from private.activity_integrity_observations
      where member_id = '76a00000-0000-4000-8000-000000000010';
      delete from private.check_ins
      where member_id = '76a00000-0000-4000-8000-000000000010';
      delete from private.member_place_first_saves
      where member_id = '76a00000-0000-4000-8000-000000000010';
      delete from private.member_favourites
      where user_id = '76a00000-0000-4000-8000-000000000010';
      delete from security.role_grants
      where user_id = '76a00000-0000-4000-8000-000000000010';
      delete from private.member_accounts
      where user_id = '76a00000-0000-4000-8000-000000000010';
      delete from auth.users
      where id = '76a00000-0000-4000-8000-000000000010';
      insert into auth.users (id)
      values ('76a00000-0000-4000-8000-000000000010');
      insert into private.member_accounts (user_id)
      values ('76a00000-0000-4000-8000-000000000010');
      insert into security.role_grants (user_id, role)
      values ('76a00000-0000-4000-8000-000000000010', 'member');
    $setup$
  ),
  'INSERT 0 1',
  'Independent sessions share one committed Member fixture'
);

select ok(
  extensions.dblink_send_query(
    'qualifying_activity_lock_holder',
    $holder$
      do $block$
      begin
        perform private.lock_member_qualifying_activity(
          '76a00000-0000-4000-8000-000000000010'
        );
        perform pg_sleep(1);
      end
      $block$;
    $holder$
  ) = 1,
  'An independent transaction holds the shared Member activity lock'
);

select pg_sleep(0.2);

select ok(
  extensions.dblink_send_query(
    'qualifying_activity_favourite',
    $favourite$
      with authenticated_session as materialized (
        select
          set_config(
            'request.jwt.claim.sub',
            '76a00000-0000-4000-8000-000000000010',
            true
          ),
          set_config('role', 'authenticated', true)
      )
      select result.activated_current_week
      from authenticated_session
      cross join lateral public.set_current_favourite(
        '30000000-0000-4000-8000-000000000003',
        true
      ) as result;
    $favourite$
  ) = 1,
  'A Favourite action starts in a second session'
);

select ok(
  extensions.dblink_send_query(
    'qualifying_activity_check_in',
    $check_in$
      with authenticated_session as materialized (
        select
          set_config(
            'request.jwt.claim.sub',
            '76a00000-0000-4000-8000-000000000010',
            true
          ),
          set_config('role', 'authenticated', true)
      )
      select result.activated_current_week
      from authenticated_session
      cross join lateral public.record_check_in(
        '30000000-0000-4000-8000-000000000002',
        'unknown',
        '76a10000-0000-4000-8000-000000000010'
      ) as result;
    $check_in$
  ) = 1,
  'A Check-in action starts in a third session'
);

select pg_sleep(0.2);

select ok(
  extensions.dblink_is_busy('qualifying_activity_favourite') = 1
  and extensions.dblink_is_busy('qualifying_activity_check_in') = 1,
  'Different qualifying sources for one Member both wait on the shared lock'
);

select *
from extensions.dblink_get_result(
  'qualifying_activity_lock_holder',
  false
) as result(status text);

create temporary table pg_temp.qualifying_activity_concurrency_results (
  source_kind text primary key,
  activated_current_week boolean not null
) on commit drop;

insert into pg_temp.qualifying_activity_concurrency_results (
  source_kind,
  activated_current_week
)
select
  'favourite',
  result.activated_current_week
from extensions.dblink_get_result(
  'qualifying_activity_favourite',
  false
) as result(activated_current_week boolean);

insert into pg_temp.qualifying_activity_concurrency_results (
  source_kind,
  activated_current_week
)
select
  'check_in',
  result.activated_current_week
from extensions.dblink_get_result(
  'qualifying_activity_check_in',
  false
) as result(activated_current_week boolean);

select *
from extensions.dblink_get_result(
  'qualifying_activity_lock_holder',
  false
) as result(status text);
select *
from extensions.dblink_get_result(
  'qualifying_activity_favourite',
  false
) as result(activated_current_week boolean);
select *
from extensions.dblink_get_result(
  'qualifying_activity_check_in',
  false
) as result(activated_current_week boolean);

select is(
  (
    select count(*)
    from pg_temp.qualifying_activity_concurrency_results
    where activated_current_week
  ),
  1::bigint,
  'Exactly one concurrent qualifying source activates the current week'
);

select is(
  (
    select count(*)
    from private.member_qualifying_activity
    where member_id = '76a00000-0000-4000-8000-000000000010'
      and source_kind in ('favourite', 'check_in')
  ),
  2::bigint,
  'Both serialized source actions remain genuine normalized activity'
);

select extensions.dblink_exec(
  'qualifying_activity_lock_holder',
  $cleanup$
    delete from private.activity_integrity_observations
    where member_id = '76a00000-0000-4000-8000-000000000010';
    delete from private.check_ins
    where member_id = '76a00000-0000-4000-8000-000000000010';
    delete from private.member_place_first_saves
    where member_id = '76a00000-0000-4000-8000-000000000010';
    delete from private.member_favourites
    where user_id = '76a00000-0000-4000-8000-000000000010';
    delete from security.role_grants
    where user_id = '76a00000-0000-4000-8000-000000000010';
    delete from private.member_accounts
    where user_id = '76a00000-0000-4000-8000-000000000010';
    delete from auth.users
    where id = '76a00000-0000-4000-8000-000000000010';
  $cleanup$
);

select extensions.dblink_disconnect('qualifying_activity_lock_holder');
select extensions.dblink_disconnect('qualifying_activity_favourite');
select extensions.dblink_disconnect('qualifying_activity_check_in');

select * from finish();

rollback;
