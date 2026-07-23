begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(3);

select extensions.dblink_connect(
  'weekly_rhythm_lock_holder',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);
select extensions.dblink_connect(
  'weekly_rhythm_contender',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);

select extensions.dblink_exec(
  'weekly_rhythm_lock_holder',
  $setup$
    delete from private.member_place_first_saves
    where member_id = '76700000-0000-4000-8000-000000000010';
    delete from private.member_favourites
    where user_id = '76700000-0000-4000-8000-000000000010';
    delete from security.role_grants
    where user_id = '76700000-0000-4000-8000-000000000010';
    delete from private.member_accounts
    where user_id = '76700000-0000-4000-8000-000000000010';
    delete from auth.users
    where id = '76700000-0000-4000-8000-000000000010';
    insert into auth.users (id)
    values ('76700000-0000-4000-8000-000000000010');
    insert into private.member_accounts (user_id)
    values ('76700000-0000-4000-8000-000000000010');
    insert into security.role_grants (user_id, role)
    values ('76700000-0000-4000-8000-000000000010', 'member');
  $setup$
);

select ok(
  extensions.dblink_send_query(
    'weekly_rhythm_lock_holder',
    $holder$
      do $block$
      begin
        perform pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(
            '76700000-0000-4000-8000-000000000010',
            7737001
          )
        );
        perform pg_sleep(1);
      end
      $block$;
    $holder$
  ) = 1,
  'An independent transaction holds the Member weekly-rhythm serialization lock'
);

select pg_sleep(0.2);

select ok(
  extensions.dblink_send_query(
    'weekly_rhythm_contender',
    $contender$
      do $block$
      begin
        perform set_config(
          'request.jwt.claim.sub',
          '76700000-0000-4000-8000-000000000010',
          true
        );
        perform set_config('role', 'authenticated', true);
        perform public.set_current_favourite(
          '30000000-0000-4000-8000-000000000001',
          false
        );
      end
      $block$;
    $contender$
  ) = 1,
  'A different-Place Favourite mutation starts in another session'
);

select pg_sleep(0.2);

select is(
  extensions.dblink_is_busy('weekly_rhythm_contender'),
  1,
  'All Favourite mutations for one Member serialize even when they target different Places'
);

select *
from extensions.dblink_get_result('weekly_rhythm_lock_holder', false) as result(status text);
select *
from extensions.dblink_get_result('weekly_rhythm_contender', false) as result(status text);
select *
from extensions.dblink_get_result('weekly_rhythm_lock_holder', false) as result(status text);
select *
from extensions.dblink_get_result('weekly_rhythm_contender', false) as result(status text);

select extensions.dblink_exec(
  'weekly_rhythm_lock_holder',
  $cleanup$
    delete from private.member_place_first_saves
    where member_id = '76700000-0000-4000-8000-000000000010';
    delete from private.member_favourites
    where user_id = '76700000-0000-4000-8000-000000000010';
    delete from security.role_grants
    where user_id = '76700000-0000-4000-8000-000000000010';
    delete from private.member_accounts
    where user_id = '76700000-0000-4000-8000-000000000010';
    delete from auth.users
    where id = '76700000-0000-4000-8000-000000000010';
  $cleanup$
);

select extensions.dblink_disconnect('weekly_rhythm_lock_holder');
select extensions.dblink_disconnect('weekly_rhythm_contender');

select * from finish();

rollback;
