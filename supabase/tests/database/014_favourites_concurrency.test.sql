begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(4);

-- "db" is the Supabase CLI's stable Docker network alias for the local Postgres container,
-- resolvable regardless of the per-worktree config.toml project_id (unlike the project-specific
-- container name, which breaks whenever an isolated worktree stack renames the project).
select extensions.dblink_connect(
  'favourite_add',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);
select extensions.dblink_connect(
  'lifecycle_change',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);

select is(
  extensions.dblink_exec(
    'favourite_add',
    $setup$
      delete from private.member_favourites
      where user_id = '76000000-0000-4000-8000-000000000006';
      delete from security.role_grants
      where user_id = '76000000-0000-4000-8000-000000000006';
      delete from private.member_accounts
      where user_id = '76000000-0000-4000-8000-000000000006';
      delete from auth.users
      where id = '76000000-0000-4000-8000-000000000006';
      update private.places
      set lifecycle = 'published'
      where id = '30000000-0000-4000-8000-000000000003';
      insert into auth.users (id)
      values ('76000000-0000-4000-8000-000000000006');
      insert into private.member_accounts (user_id)
      values ('76000000-0000-4000-8000-000000000006');
      insert into security.role_grants (user_id, role)
      values ('76000000-0000-4000-8000-000000000006', 'member');
    $setup$
  ),
  'INSERT 0 1',
  'The independent Favourite session has a committed Member fixture'
);

select ok(
  extensions.dblink_send_query(
    'favourite_add',
    $add$
      do $block$
      begin
        perform set_config(
          'request.jwt.claim.sub',
          '76000000-0000-4000-8000-000000000006',
          true
        );
        perform set_config('role', 'authenticated', true);
        perform public.set_current_favourite(
          '30000000-0000-4000-8000-000000000003',
          true
        );
        perform pg_sleep(1);
      end
      $block$;
    $add$
  ) = 1,
  'The Favourite add starts in an independent database session'
);

select pg_sleep(0.2);

select extensions.dblink_send_query(
  'lifecycle_change',
  $lifecycle$
    update private.places
    set lifecycle = 'inactive'
    where id = '30000000-0000-4000-8000-000000000003';
  $lifecycle$
);

select pg_sleep(0.2);

select is(
  extensions.dblink_is_busy('lifecycle_change'),
  1,
  'A concurrent lifecycle change waits while Favourite eligibility and persistence are atomic'
);

select *
from extensions.dblink_get_result('favourite_add', false) as result(status text);
select *
from extensions.dblink_get_result('lifecycle_change', false) as result(status text);
select *
from extensions.dblink_get_result('favourite_add', false) as result(status text);
select *
from extensions.dblink_get_result('lifecycle_change', false) as result(status text);

select ok(
  (
    select count(*) = 1
    from private.member_favourites
    where user_id = '76000000-0000-4000-8000-000000000006'
      and place_id = '30000000-0000-4000-8000-000000000003'
  )
  and (
    select lifecycle = 'inactive'::private.place_lifecycle
    from private.places
    where id = '30000000-0000-4000-8000-000000000003'
  ),
  'The add commits before the waiting lifecycle transition and remains a removable saved history row'
);

select extensions.dblink_exec(
  'favourite_add',
  $cleanup$
    delete from private.member_favourites
    where user_id = '76000000-0000-4000-8000-000000000006';
    delete from security.role_grants
    where user_id = '76000000-0000-4000-8000-000000000006';
    delete from private.member_accounts
    where user_id = '76000000-0000-4000-8000-000000000006';
    delete from auth.users
    where id = '76000000-0000-4000-8000-000000000006';
    update private.places
    set lifecycle = 'published'
    where id = '30000000-0000-4000-8000-000000000003';
  $cleanup$
);

select extensions.dblink_disconnect('favourite_add');
select extensions.dblink_disconnect('lifecycle_change');

select * from finish();

rollback;
