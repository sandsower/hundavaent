begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select no_plan();

select extensions.dblink_connect(
  'achievement_version_race_a',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);
select extensions.dblink_connect(
  'achievement_version_race_b',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);

select is(
  extensions.dblink_exec(
    'achievement_version_race_a',
    $setup$
      delete from private.achievement_unlocks
      where member_id = '78390000-0000-4000-8000-000000000001';
      delete from private.member_favourites
      where user_id = '78390000-0000-4000-8000-000000000001';
      delete from security.role_grants
      where user_id = '78390000-0000-4000-8000-000000000001';
      delete from private.member_accounts
      where user_id = '78390000-0000-4000-8000-000000000001';
      delete from auth.users
      where id = '78390000-0000-4000-8000-000000000001';
      delete from private.achievement_definitions
      where key = 'first_favourite' and version = 2;
      delete from private.achievement_policy where singleton;

      insert into auth.users (id)
      values ('78390000-0000-4000-8000-000000000001');
      insert into private.member_accounts (user_id)
      values ('78390000-0000-4000-8000-000000000001');
      insert into security.role_grants (user_id, role)
      values ('78390000-0000-4000-8000-000000000001', 'member');

      insert into private.achievement_policy (
        singleton,
        policy_version,
        credit_spacing_minutes,
        eligibility_started_at,
        enabled
      )
      values (
        true,
        'achievement-version-race-v1',
        15,
        statement_timestamp() - interval '1 day',
        false
      );
      insert into private.member_favourites (user_id, place_id)
      values (
        '78390000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000002'
      );
      update private.achievement_policy
      set enabled = true, updated_at = statement_timestamp()
      where singleton;

      create or replace function private.test_delay_version_one_unlock()
      returns trigger
      language plpgsql
      volatile
      set search_path = ''
      as $function$
      begin
        if new.member_id = '78390000-0000-4000-8000-000000000001'
          and new.achievement_key = 'first_favourite'
          and new.definition_version = 1
        then
          perform pg_catalog.pg_sleep(1);
        end if;
        return new;
      end;
      $function$;
      create trigger test_delay_version_one_unlock
      before insert on private.achievement_unlocks
      for each row execute function private.test_delay_version_one_unlock();

      create or replace function public.test_evaluate_version_one()
      returns boolean
      language plpgsql
      volatile
      security definer
      set search_path = ''
      as $function$
      begin
        perform private.evaluate_achievement_unlocks(
          '78390000-0000-4000-8000-000000000001',
          'favourite_saved',
          statement_timestamp()
        );
        return true;
      end;
      $function$;

      create or replace function public.test_publish_version_two_and_evaluate()
      returns boolean
      language plpgsql
      volatile
      security definer
      set search_path = ''
      as $function$
      begin
        insert into private.achievement_definitions (
          key,
          version,
          achievement_group,
          display_order,
          name_is,
          name_en,
          description_is,
          description_en,
          criteria,
          locked_visibility,
          progress_kind
        )
        select
          definition.key,
          2,
          definition.achievement_group,
          definition.display_order,
          definition.name_is,
          definition.name_en,
          definition.description_is,
          definition.description_en,
          definition.criteria,
          definition.locked_visibility,
          definition.progress_kind
        from private.achievement_definitions as definition
        where definition.key = 'first_favourite'
          and definition.version = 1;

        perform private.evaluate_achievement_unlocks(
          '78390000-0000-4000-8000-000000000001',
          'favourite_saved',
          statement_timestamp()
        );
        return true;
      end;
      $function$;
    $setup$
  ),
  'CREATE FUNCTION',
  'The version-race fixture has one qualifying action and two evaluator seams'
);

select ok(
  extensions.dblink_send_query(
    'achievement_version_race_a',
    'select public.test_evaluate_version_one()'
  ) = 1,
  'The version-one evaluator starts in an independent transaction'
);

select pg_sleep(0.2);

select ok(
  extensions.dblink_send_query(
    'achievement_version_race_b',
    'select public.test_publish_version_two_and_evaluate()'
  ) = 1,
  'A definition rollout and version-two evaluation overlap the first insert'
);

select pg_sleep(0.2);

select is(
  extensions.dblink_is_busy('achievement_version_race_a'),
  1,
  'The version-one evaluator remains paused while version two commits'
);

select results_eq(
  $$
    select succeeded
    from extensions.dblink_get_result('achievement_version_race_b', false)
      as result(succeeded boolean)
  $$,
  $$ values (true) $$,
  'The version-two evaluator and its triggering transaction succeed'
);
select results_eq(
  $$
    select succeeded
    from extensions.dblink_get_result('achievement_version_race_a', false)
      as result(succeeded boolean)
  $$,
  $$ values (true) $$,
  'The stale version-one evaluator treats the cross-version conflict as idempotent'
);

select *
from extensions.dblink_get_result('achievement_version_race_a', false)
  as result(succeeded boolean);
select *
from extensions.dblink_get_result('achievement_version_race_b', false)
  as result(succeeded boolean);

-- Drop the committed test trigger before this outer pgTAP transaction reads the target table.
-- Otherwise its AccessShare lock would block the independent cleanup session's DROP TRIGGER.
select is(
  extensions.dblink_exec(
    'achievement_version_race_a',
    $drop_test_seams$
      drop trigger test_delay_version_one_unlock on private.achievement_unlocks;
      drop function private.test_delay_version_one_unlock();
      drop function public.test_evaluate_version_one();
      drop function public.test_publish_version_two_and_evaluate();
    $drop_test_seams$
  ),
  'DROP FUNCTION',
  'The committed race-only trigger and evaluator seams are removed'
);

select is(
  (
    select count(*)
    from private.achievement_unlocks
    where member_id = '78390000-0000-4000-8000-000000000001'
      and achievement_key = 'first_favourite'
  ),
  1::bigint,
  'Concurrent definition versions leave exactly one unlock for the Achievement key'
);
select is(
  (
    select definition_version
    from private.achievement_unlocks
    where member_id = '78390000-0000-4000-8000-000000000001'
      and achievement_key = 'first_favourite'
  ),
  2,
  'The evaluator that commits first records its definition version'
);

select extensions.dblink_exec(
  'achievement_version_race_a',
  $cleanup$
    delete from private.achievement_unlocks
    where member_id = '78390000-0000-4000-8000-000000000001';
    delete from private.member_favourites
    where user_id = '78390000-0000-4000-8000-000000000001';
    delete from security.role_grants
    where user_id = '78390000-0000-4000-8000-000000000001';
    delete from private.member_accounts
    where user_id = '78390000-0000-4000-8000-000000000001';
    delete from auth.users
    where id = '78390000-0000-4000-8000-000000000001';
    delete from private.achievement_definitions
    where key = 'first_favourite' and version = 2;
    delete from private.achievement_policy where singleton;
  $cleanup$
);

select extensions.dblink_disconnect('achievement_version_race_a');
select extensions.dblink_disconnect('achievement_version_race_b');

select * from finish();

rollback;
