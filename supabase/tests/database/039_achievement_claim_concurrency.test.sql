begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select no_plan();

select extensions.dblink_connect(
  'achievement_claim_race_a',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);
select extensions.dblink_connect(
  'achievement_claim_race_b',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);

select is(
  extensions.dblink_exec(
    'achievement_claim_race_a',
    $setup$
      delete from private.achievement_unlocks
      where member_id = '78290000-0000-4000-8000-000000000001';
      delete from security.role_grants
      where user_id = '78290000-0000-4000-8000-000000000001';
      delete from private.member_accounts
      where user_id = '78290000-0000-4000-8000-000000000001';
      delete from auth.users
      where id = '78290000-0000-4000-8000-000000000001';
      insert into auth.users (id)
      values ('78290000-0000-4000-8000-000000000001');
      insert into private.member_accounts (user_id)
      values ('78290000-0000-4000-8000-000000000001');
      insert into security.role_grants (user_id, role)
      values ('78290000-0000-4000-8000-000000000001', 'member');
      insert into private.achievement_policy as policy (
        singleton,
        policy_version,
        credit_spacing_minutes,
        eligibility_started_at,
        enabled
      )
      values (
        true,
        'achievement-claim-race-v1',
        15,
        statement_timestamp() - interval '1 day',
        true
      )
      on conflict (singleton) do update set
        policy_version = excluded.policy_version,
        credit_spacing_minutes = excluded.credit_spacing_minutes,
        eligibility_started_at = coalesce(
          policy.eligibility_started_at,
          excluded.eligibility_started_at
        ),
        enabled = excluded.enabled;
      insert into private.achievement_unlocks (
        member_id,
        achievement_key,
        definition_version,
        earned_at
      )
      values (
        '78290000-0000-4000-8000-000000000001',
        'first_favourite',
        1,
        now()
      );
      create or replace function public.test_claim_achievement_with_delay(
        delay_seconds double precision
      )
      returns bigint
      language plpgsql
      volatile
      security definer
      set search_path = ''
      as $function$
      declare
        claimed_count bigint;
      begin
        select count(*) into claimed_count
        from public.claim_my_achievement_celebrations();
        perform pg_catalog.pg_sleep(delay_seconds);
        return claimed_count;
      end;
      $function$;
      revoke all on function public.test_claim_achievement_with_delay(double precision)
        from public, anon, service_role;
      grant execute on function public.test_claim_achievement_with_delay(double precision)
        to authenticated;
      create or replace function public.test_disable_achievements_with_delay(
        delay_seconds double precision
      )
      returns boolean
      language plpgsql
      volatile
      security definer
      set search_path = ''
      as $function$
      begin
        update private.achievement_policy
        set enabled = false, updated_at = statement_timestamp()
        where singleton;
        perform pg_catalog.pg_sleep(delay_seconds);
        return true;
      end;
      $function$;
      revoke all on function public.test_disable_achievements_with_delay(double precision)
        from public, anon, service_role;
      grant execute on function public.test_disable_achievements_with_delay(double precision)
        to authenticated;
    $setup$
  ),
  'GRANT',
  'The independent race session creates one committed unread Achievement fixture'
);

select is(
  extensions.dblink_exec('achievement_claim_race_a', 'set role authenticated'),
  'SET',
  'The first race session uses the authenticated Member boundary'
);
select is(
  extensions.dblink_exec('achievement_claim_race_b', 'set role authenticated'),
  'SET',
  'The second race session uses the authenticated Member boundary'
);

select ok(
  extensions.dblink_send_query(
    'achievement_claim_race_a',
    $claim_a$
      with configured as (
        select set_config(
          'request.jwt.claim.sub',
          '78290000-0000-4000-8000-000000000001',
          false
        )
      )
      select public.test_claim_achievement_with_delay(1)
      from configured
    $claim_a$
  ) = 1,
  'The first celebration claim starts in an independent database session'
);

select pg_sleep(0.2);

select ok(
  extensions.dblink_send_query(
    'achievement_claim_race_b',
    $claim_b$
      with configured as (
        select set_config(
          'request.jwt.claim.sub',
          '78290000-0000-4000-8000-000000000001',
          false
        )
      )
      select public.test_claim_achievement_with_delay(0)
      from configured
    $claim_b$
  ) = 1,
  'The second celebration claim starts while the first transaction is still open'
);

select pg_sleep(0.2);

select is(
  extensions.dblink_is_busy('achievement_claim_race_b'),
  1,
  'The second claimant waits on the same unread Achievement instead of duplicating it'
);

select results_eq(
  $$
    select claimed_count
    from extensions.dblink_get_result('achievement_claim_race_a', false)
      as result(claimed_count bigint)
  $$,
  $$ values (1::bigint) $$,
  'Exactly one concurrent caller claims the newly earned Achievement'
);
select results_eq(
  $$
    select claimed_count
    from extensions.dblink_get_result('achievement_claim_race_b', false)
      as result(claimed_count bigint)
  $$,
  $$ values (0::bigint) $$,
  'The overlapping caller receives no duplicate celebration'
);

-- libpq exposes one trailing empty result after each asynchronous query.
-- Drain it before reusing either connection for cleanup.
select *
from extensions.dblink_get_result('achievement_claim_race_a', false)
  as result(claimed_count bigint);
select *
from extensions.dblink_get_result('achievement_claim_race_b', false)
  as result(claimed_count bigint);

reset role;

select is(
  (
    select count(*)
    from private.achievement_unlocks
    where member_id = '78290000-0000-4000-8000-000000000001'
      and achievement_key = 'first_favourite'
      and notified_at is not null
  ),
  1::bigint,
  'The concurrent claims leave one immutable unlock acknowledged once'
);

select is(
  extensions.dblink_exec(
    'achievement_claim_race_a',
    $reset_unread$
      reset role;
      delete from private.achievement_unlocks
      where member_id = '78290000-0000-4000-8000-000000000001';
      insert into private.achievement_unlocks (
        member_id,
        achievement_key,
        definition_version,
        earned_at
      )
      values (
        '78290000-0000-4000-8000-000000000001',
        'first_favourite',
        1,
        now()
      );
      set role authenticated;
    $reset_unread$
  ),
  'SET',
  'A fresh unread fixture is committed before the policy-disable race'
);

select ok(
  extensions.dblink_send_query(
    'achievement_claim_race_a',
    'select public.test_disable_achievements_with_delay(1)'
  ) = 1,
  'A policy disable starts and holds its row lock before commit'
);

select pg_sleep(0.2);

select ok(
  extensions.dblink_send_query(
    'achievement_claim_race_b',
    $claim_after_disable$
      with configured as (
        select set_config(
          'request.jwt.claim.sub',
          '78290000-0000-4000-8000-000000000001',
          false
        )
      )
      select count(*)::bigint
      from configured,
      lateral public.claim_my_achievement_celebrations()
    $claim_after_disable$
  ) = 1,
  'A celebration claim starts while the disabling update is uncommitted'
);

select pg_sleep(0.2);

select is(
  extensions.dblink_is_busy('achievement_claim_race_b'),
  1,
  'The claim waits for the policy update instead of reading stale enabled state'
);

select results_eq(
  $$
    select disabled
    from extensions.dblink_get_result('achievement_claim_race_a', false)
      as result(disabled boolean)
  $$,
  $$ values (true) $$,
  'The policy disable commits successfully'
);
select results_eq(
  $$
    select claimed_count
    from extensions.dblink_get_result('achievement_claim_race_b', false)
      as result(claimed_count bigint)
  $$,
  $$ values (0::bigint) $$,
  'A claim serialized after disable returns no private Achievement payload'
);

select *
from extensions.dblink_get_result('achievement_claim_race_a', false)
  as result(disabled boolean);
select *
from extensions.dblink_get_result('achievement_claim_race_b', false)
  as result(claimed_count bigint);

select is(
  (
    select notified_at
    from private.achievement_unlocks
    where member_id = '78290000-0000-4000-8000-000000000001'
      and achievement_key = 'first_favourite'
  ),
  null::timestamptz,
  'The disabled policy leaves the unread Achievement unconsumed'
);

select extensions.dblink_exec(
  'achievement_claim_race_a',
  $cleanup$
    reset role;
    drop function public.test_claim_achievement_with_delay(double precision);
    drop function public.test_disable_achievements_with_delay(double precision);
    delete from private.achievement_unlocks
    where member_id = '78290000-0000-4000-8000-000000000001';
    delete from security.role_grants
    where user_id = '78290000-0000-4000-8000-000000000001';
    delete from private.member_accounts
    where user_id = '78290000-0000-4000-8000-000000000001';
    delete from auth.users
    where id = '78290000-0000-4000-8000-000000000001';
    delete from private.achievement_policy where singleton;
  $cleanup$
);

select extensions.dblink_disconnect('achievement_claim_race_a');
select extensions.dblink_disconnect('achievement_claim_race_b');

select * from finish();

rollback;
