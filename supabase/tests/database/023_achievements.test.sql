begin;

create extension if not exists pgtap with schema extensions;

create extension if not exists dblink with schema extensions;

select plan(72);

-- Structural surface ------------------------------------------------------------------------

select has_table('private', 'achievement_policy', 'Fail-closed Achievement policy singleton exists');
select has_table('private', 'achievement_definitions', 'Versioned Achievement catalogue exists');
select has_table('private', 'achievement_unlocks', 'Immutable unlock ledger exists');
select has_table('private', 'achievement_recalculations', 'Internal recalculation record exists');
select has_function('public', 'get_achievement_feature_status', array[]::text[], 'Public feature-status read exists');
select has_function('public', 'get_my_achievements', array[]::text[], 'Caller-only catalogue read exists');
select has_function(
  'public', 'get_moderation_member_achievements', array['uuid'], 'Moderator-only oversight read exists'
);
select has_function(
  'public', 'configure_achievement_policy', array['text', 'integer', 'boolean'],
  'The policy is configured, never hard-coded'
);
select has_function(
  'public', 'recalculate_member_achievements', array['uuid', 'uuid'], 'Moderator-triggered recalculation exists'
);
select has_function(
  'private', 'detach_member_achievements', array['uuid'], 'Account deletion has a private cleanup seam'
);

select ok(
  not has_table_privilege('authenticated', 'private.achievement_unlocks', 'select,insert,update,delete'),
  'Members cannot bypass the RPC surface to read or mutate unlock rows directly'
);
select ok(
  not has_function_privilege(
    'authenticated', 'private.detach_member_achievements(uuid)', 'execute'
  ),
  'account-deletion must explicitly adopt the cleanup seam before using it'
);

-- Fixtures: a ten-Place catalogue spanning all five category groups and six municipalities -----

insert into private.operators (id, name)
values ('92000000-0000-4000-8000-000000000001', 'Achievement fixture operator');

insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude,
  geometry_precision, geometry_source
)
values
  ('94000000-0000-4000-8000-000000000001', 'Afrekssgata 1', 'Reykjavík', '101', 'reykjavik', 64.101, -21.901, 'moderator_confirmed_point', 'Reviewed database test fixture'),
  ('94000000-0000-4000-8000-000000000002', 'Afrekssgata 2', 'Reykjavík', '101', 'reykjavik', 64.102, -21.902, 'moderator_confirmed_point', 'Reviewed database test fixture'),
  ('94000000-0000-4000-8000-000000000003', 'Afrekssgata 3', 'Reykjavík', '101', 'reykjavik', 64.103, -21.903, 'moderator_confirmed_point', 'Reviewed database test fixture'),
  ('94000000-0000-4000-8000-000000000004', 'Afrekssgata 4', 'Kópavogur', '200', 'kopavogur', 64.104, -21.904, 'moderator_confirmed_point', 'Reviewed database test fixture'),
  ('94000000-0000-4000-8000-000000000005', 'Afrekssgata 5', 'Kópavogur', '200', 'kopavogur', 64.105, -21.905, 'moderator_confirmed_point', 'Reviewed database test fixture'),
  ('94000000-0000-4000-8000-000000000006', 'Afrekssgata 6', 'Seltjarnarnes', '170', 'seltjarnarnes', 64.106, -21.906, 'moderator_confirmed_point', 'Reviewed database test fixture'),
  ('94000000-0000-4000-8000-000000000007', 'Afrekssgata 7', 'Seltjarnarnes', '170', 'seltjarnarnes', 64.107, -21.907, 'moderator_confirmed_point', 'Reviewed database test fixture'),
  ('94000000-0000-4000-8000-000000000008', 'Afrekssgata 8', 'Garðabær', '210', 'gardabaer', 64.108, -21.908, 'moderator_confirmed_point', 'Reviewed database test fixture'),
  ('94000000-0000-4000-8000-000000000009', 'Afrekssgata 9', 'Hafnarfjörður', '220', 'hafnarfjordur', 64.109, -21.909, 'moderator_confirmed_point', 'Reviewed database test fixture'),
  ('94000000-0000-4000-8000-000000000010', 'Afrekssgata 10', 'Mosfellsbær', '270', 'mosfellsbaer', 64.110, -21.910, 'moderator_confirmed_point', 'Reviewed database test fixture');

insert into private.places (id, operator_id, location_id, purpose, lifecycle, category, published_at)
values
  ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'dog_access_destination', 'published', 'restaurant', now()),
  ('93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000002', 'dog_access_destination', 'published', 'cafe', now()),
  ('93000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000003', 'dog_access_destination', 'published', 'bar', now()),
  ('93000000-0000-4000-8000-000000000004', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000004', 'dog_access_destination', 'published', 'shop', now()),
  ('93000000-0000-4000-8000-000000000005', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000005', 'dog_access_destination', 'published', 'shopping_centre', now()),
  ('93000000-0000-4000-8000-000000000006', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000006', 'dog_access_destination', 'published', 'park', now()),
  ('93000000-0000-4000-8000-000000000007', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000007', 'dog_access_destination', 'published', 'recreation', now()),
  ('93000000-0000-4000-8000-000000000008', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000008', 'dog_access_destination', 'published', 'accommodation', now()),
  ('93000000-0000-4000-8000-000000000009', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000009', 'dog_access_destination', 'published', 'culture', now()),
  ('93000000-0000-4000-8000-000000000010', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000010', 'dog_access_destination', 'published', 'service', now());

-- Places 001 and 002 additionally carry a verified Access Condition, since Favourites and Ratings
-- (unlike Check-ins) require full Place discoverability, not merely a Published lifecycle.
insert into private.access_conditions (
  id, place_id, revision, access_area, restraint_condition, dog_eligibility, availability_window,
  permission_requirement, created_at
)
values
  (
    '97000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 1,
    'outdoors', 'leash_required', '{"scope":"all_dogs"}'::jsonb, '{}'::jsonb,
    'standing_permission', now()
  ),
  (
    '97000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000002', 1,
    'outdoors', 'leash_required', '{"scope":"all_dogs"}'::jsonb, '{}'::jsonb,
    'standing_permission', now()
  );

insert into private.evidence (
  id, place_id, kind, source_url, source_label, observed_at, source_metadata, created_at
)
values
  (
    '97000000-0000-4000-8000-000000000011', '93000000-0000-4000-8000-000000000001',
    'official_website', 'https://example.invalid/achievement-fixture-place-1', 'Fixture website',
    now(), '{}'::jsonb, now()
  ),
  (
    '97000000-0000-4000-8000-000000000012', '93000000-0000-4000-8000-000000000002',
    'official_website', 'https://example.invalid/achievement-fixture-place-2', 'Fixture website',
    now(), '{}'::jsonb, now()
  );

insert into private.verifications (
  id, access_condition_id, status, verified_at, freshness_until, decision_metadata, created_at
)
values
  (
    '97000000-0000-4000-8000-000000000021', '97000000-0000-4000-8000-000000000001',
    'verified', now(), now() + interval '50 years', '{}'::jsonb, now()
  ),
  (
    '97000000-0000-4000-8000-000000000022', '97000000-0000-4000-8000-000000000002',
    'verified', now(), now() + interval '50 years', '{}'::jsonb, now()
  );

insert into private.verification_evidence (verification_id, evidence_id)
values
  ('97000000-0000-4000-8000-000000000021', '97000000-0000-4000-8000-000000000011'),
  ('97000000-0000-4000-8000-000000000022', '97000000-0000-4000-8000-000000000012');

-- Fixtures: Members ------------------------------------------------------------------------

insert into auth.users (id)
values
  ('95000000-0000-4000-8000-000000000001'), -- M1: earns the full catalogue
  ('95000000-0000-4000-8000-000000000002'), -- BX: 9 distinct Places (explorer boundary)
  ('95000000-0000-4000-8000-000000000003'), -- BCAT: 3 of 5 category groups (category boundary)
  ('95000000-0000-4000-8000-000000000004'), -- BMUNI: 2 municipalities (municipality boundary)
  ('95000000-0000-4000-8000-000000000005'), -- B3: 10 Places in one burst (spacing boundary)
  ('95000000-0000-4000-8000-000000000006'), -- BTRUST: contributor but not yet trusted
  ('95000000-0000-4000-8000-000000000007'), -- R1: contribution reversal
  ('95000000-0000-4000-8000-000000000008'), -- R2: rating reversal
  ('95000000-0000-4000-8000-000000000009'), -- R3: conduct-flag gating
  ('95000000-0000-4000-8000-00000000000a'), -- OTHER: zero achievements, cross-read denial
  ('95000000-0000-4000-8000-00000000000b'), -- MOD1: moderator
  ('95000000-0000-4000-8000-00000000000c'), -- V1: venue representative
  ('95000000-0000-4000-8000-00000000000e'); -- FRESH: brand-new member, longevity boundary
-- C1 (...00d), the concurrency member, is deliberately NOT seeded here: the race section's
-- independent dblink session creates and commits it itself. Seeding it in this never-committed
-- outer transaction would leave an uncommitted users_pkey entry that the dblink session's own
-- insert of the same id must wait on - an undetectable cross-session deadlock (this transaction
-- waits on dblink_exec, the dblink session waits on this transaction's xid).

insert into private.member_accounts (user_id)
values
  ('95000000-0000-4000-8000-000000000001'),
  ('95000000-0000-4000-8000-000000000002'),
  ('95000000-0000-4000-8000-000000000003'),
  ('95000000-0000-4000-8000-000000000004'),
  ('95000000-0000-4000-8000-000000000005'),
  ('95000000-0000-4000-8000-000000000006'),
  ('95000000-0000-4000-8000-000000000007'),
  ('95000000-0000-4000-8000-000000000008'),
  ('95000000-0000-4000-8000-000000000009'),
  ('95000000-0000-4000-8000-00000000000a'),
  ('95000000-0000-4000-8000-00000000000b'),
  ('95000000-0000-4000-8000-00000000000c'),
  ('95000000-0000-4000-8000-00000000000e');

insert into security.role_grants (user_id, role)
values
  ('95000000-0000-4000-8000-000000000001', 'member'),
  ('95000000-0000-4000-8000-000000000002', 'member'),
  ('95000000-0000-4000-8000-000000000003', 'member'),
  ('95000000-0000-4000-8000-000000000004', 'member'),
  ('95000000-0000-4000-8000-000000000005', 'member'),
  ('95000000-0000-4000-8000-000000000006', 'member'),
  ('95000000-0000-4000-8000-000000000007', 'member'),
  ('95000000-0000-4000-8000-000000000008', 'member'),
  ('95000000-0000-4000-8000-000000000009', 'member'),
  ('95000000-0000-4000-8000-00000000000a', 'member'),
  ('95000000-0000-4000-8000-00000000000b', 'moderator'),
  ('95000000-0000-4000-8000-00000000000c', 'venue_representative'),
  ('95000000-0000-4000-8000-00000000000e', 'member');

-- Fail-closed default: qualifying activity exists, but no policy row has ever been configured ---

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select public.set_current_favourite('93000000-0000-4000-8000-000000000001', true);
reset role;

select is(
  (select enabled from public.get_achievement_feature_status()),
  false,
  'The Achievement feature reports disabled with no policy row ever configured'
);

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  (select enabled from public.get_my_achievements() limit 1),
  false,
  'The caller catalogue read itself reports disabled rather than surfacing any catalogue entry'
);
select is(
  (select count(*) from public.get_my_achievements()),
  1::bigint,
  'A disabled response is exactly one row, never the ten-item catalogue'
);
reset role;

select is(
  (select count(*) from private.achievement_unlocks),
  0::bigint,
  'No unlock exists anywhere despite a fully-qualifying Favourite, proving the touch-point trigger no-oped'
);

-- Enable the policy without backfilling M1's historical Favourite -----------------------------
--
-- private.achievement_policy is a singleton row. This whole file is one open, never-committed
-- transaction until the final rollback, so if this transaction itself inserted that row, it would
-- hold that row's lock for the rest of the file - deadlocking the concurrency section further
-- down, which also needs to touch that same singleton from an independent dblink session. Instead,
-- a short-lived dblink connection calls the real public.configure_achievement_policy RPC (proving
-- the RPC itself works, as postgres superuser bypassing the service-role grant check the same way
-- the grant boundary is separately proven below) and commits for real, so this transaction only
-- ever reads the policy afterward and never contends with the later concurrency dblink sessions.
select extensions.dblink_connect(
  'achievement_policy_setup',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);
select is(
  extensions.dblink_exec(
    'achievement_policy_setup',
    $policy$do $inner$ begin perform public.configure_achievement_policy('achievement-test-v1', 1, true); end $inner$;$policy$
  ),
  'DO',
  'An independent session enables the Achievement engine for the remainder of this file'
);
select extensions.dblink_disconnect('achievement_policy_setup');

select ok(
  not has_function_privilege(
    'authenticated', 'public.configure_achievement_policy(text,integer,boolean)', 'execute'
  ),
  'Members cannot configure the Achievement policy'
);

select private.evaluate_achievement_unlocks(
  '95000000-0000-4000-8000-000000000001'::uuid, 'no_backfill_after_enable', now()
);

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'first_favourite'
  ),
  0::bigint,
  'First activation does not backfill the Favourite saved while Achievements were disabled'
);

-- The remaining catalogue criteria tests need a deliberately old eligibility boundary so their
-- injected six- and twelve-month timelines remain deterministic.
-- This direct private fixture is unavailable to application roles and does not model production
-- activation, which is already proven future-only above.
select extensions.dblink_connect(
  'achievement_policy_fixture',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);
select is(
  extensions.dblink_exec(
    'achievement_policy_fixture',
    $fixture$
      delete from private.achievement_policy where singleton;
      insert into private.achievement_policy (
        singleton,
        policy_version,
        credit_spacing_minutes,
        eligibility_started_at,
        enabled
      )
      values (
        true,
        'achievement-test-historical-fixture-v1',
        1,
        statement_timestamp() - interval '2 years',
        true
      );
    $fixture$
  ),
  'INSERT 0 1',
  'The deterministic criteria fixture uses an explicit historical eligibility boundary'
);
select extensions.dblink_disconnect('achievement_policy_fixture');

select private.evaluate_achievement_unlocks(
  '95000000-0000-4000-8000-000000000001'::uuid,
  'eligible_fixture_recalculation',
  now()
);

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'first_favourite'
  ),
  1::bigint,
  'Activity inside the explicit eligibility boundary remains eligible'
);

-- Replay/idempotency: calling the evaluator again never duplicates an existing unlock -----------

select private.evaluate_achievement_unlocks(
  '95000000-0000-4000-8000-000000000001'::uuid, 'replay_check', now()
);
select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'first_favourite'
  ),
  1::bigint,
  'Replaying evaluation for an already-earned Achievement never inserts a second row'
);

-- M1: first_rating -----------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select public.submit_dog_friendliness_rating(
  '93000000-0000-4000-8000-000000000001', 5, 5, 5, 5, extensions.gen_random_uuid()
);
reset role;

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'first_rating'
  ),
  1::bigint,
  'M1''s first Dog-Friendliness Rating unlocks first_rating'
);
select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-00000000000a' and achievement_key = 'first_rating'
  ),
  0::bigint,
  'A Member who has never rated has not unlocked first_rating'
);

-- M1: 10 distinct, month-spaced Check-ins -> first_checkin, explorer_ten_places, category_curious,
-- capital_region_wanderer, six_month_member, and one_year_member all derive from this one fixture.

update private.member_accounts
set created_at = now() - interval '13 months'
where user_id = '95000000-0000-4000-8000-000000000001';

insert into private.check_ins (member_id, place_id, request_id, checked_in_at)
select
  '95000000-0000-4000-8000-000000000001',
  place_id,
  extensions.gen_random_uuid(),
  now() - (month_offset || ' months')::interval
from (
  values
    ('93000000-0000-4000-8000-000000000001'::uuid, 1),
    ('93000000-0000-4000-8000-000000000002'::uuid, 2),
    ('93000000-0000-4000-8000-000000000003'::uuid, 3),
    ('93000000-0000-4000-8000-000000000004'::uuid, 4),
    ('93000000-0000-4000-8000-000000000005'::uuid, 5),
    ('93000000-0000-4000-8000-000000000006'::uuid, 6),
    ('93000000-0000-4000-8000-000000000007'::uuid, 7),
    ('93000000-0000-4000-8000-000000000008'::uuid, 8),
    ('93000000-0000-4000-8000-000000000009'::uuid, 9),
    ('93000000-0000-4000-8000-000000000010'::uuid, 10)
) as fixture (place_id, month_offset);

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'first_checkin'
  ),
  1::bigint,
  'M1''s first Check-in unlocks first_checkin'
);
select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'explorer_ten_places'
  ),
  1::bigint,
  'Ten distinct, adequately-spaced Places unlocks explorer_ten_places'
);
select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'category_curious'
  ),
  1::bigint,
  'Places across all five category groups unlocks category_curious'
);
select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'capital_region_wanderer'
  ),
  1::bigint,
  'Places across six municipalities unlocks capital_region_wanderer'
);
select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'six_month_member'
  ),
  1::bigint,
  'Six months elapsed with activity in three-plus distinct months unlocks six_month_member'
);
select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'one_year_member'
  ),
  1::bigint,
  'Twelve months elapsed with activity in six-plus distinct months unlocks one_year_member'
);

-- BX: nine distinct Places is a non-unlock boundary for explorer_ten_places ---------------------

insert into private.check_ins (member_id, place_id, request_id, checked_in_at)
select
  '95000000-0000-4000-8000-000000000002', place_id, extensions.gen_random_uuid(), now() - (n || ' minutes')::interval
from (
  values
    ('93000000-0000-4000-8000-000000000001'::uuid, 90),
    ('93000000-0000-4000-8000-000000000002'::uuid, 80),
    ('93000000-0000-4000-8000-000000000003'::uuid, 70),
    ('93000000-0000-4000-8000-000000000004'::uuid, 60),
    ('93000000-0000-4000-8000-000000000005'::uuid, 50),
    ('93000000-0000-4000-8000-000000000006'::uuid, 40),
    ('93000000-0000-4000-8000-000000000007'::uuid, 30),
    ('93000000-0000-4000-8000-000000000008'::uuid, 20),
    ('93000000-0000-4000-8000-000000000009'::uuid, 10)
) as fixture (place_id, n);

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000002' and achievement_key = 'explorer_ten_places'
  ),
  0::bigint,
  'Nine distinct Places is below the ten-Place explorer_ten_places threshold'
);

-- BCAT: three of five category groups is a non-unlock boundary for category_curious ------------

insert into private.check_ins (member_id, place_id, request_id, checked_in_at)
select
  '95000000-0000-4000-8000-000000000003', place_id, extensions.gen_random_uuid(), now() - (n || ' minutes')::interval
from (
  values
    ('93000000-0000-4000-8000-000000000001'::uuid, 30), -- food_and_drink
    ('93000000-0000-4000-8000-000000000004'::uuid, 20), -- shops_and_shopping_centres
    ('93000000-0000-4000-8000-000000000006'::uuid, 10)  -- parks_and_outdoor
) as fixture (place_id, n);

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000003' and achievement_key = 'category_curious'
  ),
  0::bigint,
  'Three of five category groups is below the category_curious threshold'
);

-- BMUNI: two municipalities is a non-unlock boundary for capital_region_wanderer ----------------

insert into private.check_ins (member_id, place_id, request_id, checked_in_at)
select
  '95000000-0000-4000-8000-000000000004', place_id, extensions.gen_random_uuid(), now() - (n || ' minutes')::interval
from (
  values
    ('93000000-0000-4000-8000-000000000001'::uuid, 20), -- reykjavik
    ('93000000-0000-4000-8000-000000000004'::uuid, 10)  -- kopavogur
) as fixture (place_id, n);

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000004' and achievement_key = 'capital_region_wanderer'
  ),
  0::bigint,
  'Two municipalities is below the capital_region_wanderer threshold'
);

-- B3: ten distinct Places in one burst - the 15-minute (here, 1-minute) credit-spacing rule blocks
-- explorer_ten_places even though ten raw distinct Check-in rows exist.

insert into private.check_ins (member_id, place_id, request_id, checked_in_at)
select
  '95000000-0000-4000-8000-000000000005', place_id, extensions.gen_random_uuid(), now() - (n || ' seconds')::interval
from (
  values
    ('93000000-0000-4000-8000-000000000001'::uuid, 9),
    ('93000000-0000-4000-8000-000000000002'::uuid, 8),
    ('93000000-0000-4000-8000-000000000003'::uuid, 7),
    ('93000000-0000-4000-8000-000000000004'::uuid, 6),
    ('93000000-0000-4000-8000-000000000005'::uuid, 5),
    ('93000000-0000-4000-8000-000000000006'::uuid, 4),
    ('93000000-0000-4000-8000-000000000007'::uuid, 3),
    ('93000000-0000-4000-8000-000000000008'::uuid, 2),
    ('93000000-0000-4000-8000-000000000009'::uuid, 1),
    ('93000000-0000-4000-8000-000000000010'::uuid, 0)
) as fixture (place_id, n);

select is(
  (
    select count(*) from private.credit_spaced_places(
      '95000000-0000-4000-8000-000000000005'::uuid, now(), 1
    )
  ),
  1::bigint,
  'A rapid click-through burst within the credit-spacing window credits only the first Place'
);
select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000005' and achievement_key = 'explorer_ten_places'
  ),
  0::bigint,
  'The credit-spacing anti-gaming rule blocks explorer_ten_places despite ten raw Check-in rows'
);
select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000005' and achievement_key = 'first_checkin'
  ),
  1::bigint,
  'first_checkin is unaffected by credit spacing - it only needs one Check-in ever'
);

-- FRESH: a brand-new Member is a non-unlock boundary for both longevity Achievements ------------

select is(
  (
    select private.evaluate_achievement_criteria(
      'six_month_member', '95000000-0000-4000-8000-00000000000e'::uuid, now(), 1
    )
  ),
  false,
  'A brand-new Member has not met the six_month_member elapsed-time criterion'
);
select is(
  (
    select private.evaluate_achievement_criteria(
      'one_year_member', '95000000-0000-4000-8000-00000000000e'::uuid, now(), 1
    )
  ),
  false,
  'A brand-new Member has not met the one_year_member elapsed-time criterion'
);

-- Contribution-quality Achievements: fixtures via direct, backdated private.contributions rows,
-- following the same pattern 016_contributor_recognition.test.sql uses. ------------------------

insert into private.place_suggestions (
  id, member_id, request_id, proposal, status, candidate_place_id, reviewed_proposal, resolved_at
)
values
  (
    '96000000-0000-4000-8000-0000000000a1', '95000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-0000000000a1', '{"fixture": true}'::jsonb, 'accepted',
    '93000000-0000-4000-8000-000000000001', '{"fixture": true}'::jsonb, now()
  ),
  (
    '96000000-0000-4000-8000-0000000000a2', '95000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-0000000000a2', '{"fixture": true}'::jsonb, 'accepted',
    '93000000-0000-4000-8000-000000000002', '{"fixture": true}'::jsonb, now()
  ),
  (
    '96000000-0000-4000-8000-0000000000a3', '95000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-0000000000a3', '{"fixture": true}'::jsonb, 'accepted',
    '93000000-0000-4000-8000-000000000003', '{"fixture": true}'::jsonb, now()
  ),
  (
    '96000000-0000-4000-8000-0000000000b1', '95000000-0000-4000-8000-000000000007',
    '96000000-0000-4000-8000-0000000000b1', '{"fixture": true}'::jsonb, 'accepted',
    '93000000-0000-4000-8000-000000000001', '{"fixture": true}'::jsonb, now()
  ),
  (
    '96000000-0000-4000-8000-0000000000c1', '95000000-0000-4000-8000-000000000006',
    '96000000-0000-4000-8000-0000000000c1', '{"fixture": true}'::jsonb, 'accepted',
    '93000000-0000-4000-8000-000000000001', '{"fixture": true}'::jsonb, now()
  );

insert into private.contributions (
  suggestion_id, member_id, confirmed_by, confirmation_request_id, subject_place_id, confirmed_at
)
values
  (
    '96000000-0000-4000-8000-0000000000a1', '95000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-00000000000b', '96000000-0000-4000-8000-0000000000a1',
    '93000000-0000-4000-8000-000000000001', now()
  ),
  (
    '96000000-0000-4000-8000-0000000000a2', '95000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-00000000000b', '96000000-0000-4000-8000-0000000000a2',
    '93000000-0000-4000-8000-000000000002', now()
  ),
  (
    '96000000-0000-4000-8000-0000000000a3', '95000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-00000000000b', '96000000-0000-4000-8000-0000000000a3',
    '93000000-0000-4000-8000-000000000003', now() - interval '40 days'
  );

set local role service_role;
select lives_ok(
  $$select public.configure_contributor_status_policy('achievement-test-contributor-v1', 3, 12, 2, 2, 0, true)$$,
  'Policy activation reconciles existing qualifying Members through the sustained-quality Achievement boundary'
);
reset role;

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'first_accepted_contribution'
  ),
  1::bigint,
  'M1''s first confirmed Contribution unlocks first_accepted_contribution'
);
select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'sustained_quality_contributor'
  ),
  1::bigint,
  'Three net-accepted, three-subject, two-month Contributions reach Trusted Contributor status and unlock sustained_quality_contributor'
);

insert into private.contributions (
  suggestion_id, member_id, confirmed_by, confirmation_request_id, subject_place_id, confirmed_at
)
values (
  '96000000-0000-4000-8000-0000000000c1', '95000000-0000-4000-8000-000000000006',
  '95000000-0000-4000-8000-00000000000b', '96000000-0000-4000-8000-0000000000c1',
  '93000000-0000-4000-8000-000000000001', now()
);

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000006' and achievement_key = 'first_accepted_contribution'
  ),
  1::bigint,
  'BTRUST''s single confirmed Contribution unlocks first_accepted_contribution'
);
select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000006' and achievement_key = 'sustained_quality_contributor'
  ),
  0::bigint,
  'A single Contribution reaches Contributor but not Trusted Contributor, so sustained_quality_contributor stays locked'
);

-- Reversal recalculation: the badge persists, the reversal is recorded internally --------------

insert into private.contributions (
  suggestion_id, member_id, confirmed_by, confirmation_request_id, subject_place_id, confirmed_at
)
values (
  '96000000-0000-4000-8000-0000000000b1', '95000000-0000-4000-8000-000000000007',
  '95000000-0000-4000-8000-00000000000b', '96000000-0000-4000-8000-0000000000b1',
  '93000000-0000-4000-8000-000000000001', now()
);

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000007' and achievement_key = 'first_accepted_contribution'
  ),
  1::bigint,
  'R1''s single confirmed Contribution unlocks first_accepted_contribution'
);

select id as r1_contribution_id into temporary table r1_contribution
from private.contributions
where member_id = '95000000-0000-4000-8000-000000000007' and revoked_at is null;

-- The moderator identity only needs to resolve through auth.uid(); the postgres superuser
-- session role can call the RPC directly without a role switch, avoiding a temp-table
-- ownership boundary between roles that has no bearing on the authorization behavior under test
-- (covered separately below).
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-00000000000b', true);
select public.revoke_contribution(
  (select r1_contribution_id from r1_contribution),
  'achievement test: reversed decision',
  extensions.gen_random_uuid()
);

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000007' and achievement_key = 'first_accepted_contribution'
  ),
  1::bigint,
  'Revoking R1''s only Contribution does not remove the already-earned badge'
);
select is(
  (
    select count(*) from private.achievement_recalculations as recalculation
    join private.achievement_unlocks as unlock on unlock.id = recalculation.unlock_id
    where unlock.member_id = '95000000-0000-4000-8000-000000000007'
      and unlock.achievement_key = 'first_accepted_contribution'
      and recalculation.triggering_event = 'contribution_revoked'
  ),
  1::bigint,
  'The reversal is recorded internally as a recalculation, moderator-visible only'
);

-- Rating reversal: same persistence guarantee ---------------------------------------------------

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000008', true);
set local role authenticated;
select public.submit_dog_friendliness_rating(
  '93000000-0000-4000-8000-000000000002', 4, 4, 4, 4, extensions.gen_random_uuid()
);
reset role;

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000008' and achievement_key = 'first_rating'
  ),
  1::bigint,
  'R2''s single Rating unlocks first_rating'
);

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-00000000000b', true);
set local role authenticated;
select public.exclude_dog_friendliness_rating(
  '95000000-0000-4000-8000-000000000008', '93000000-0000-4000-8000-000000000002',
  'fraud', 'achievement test: excluded for fraud', extensions.gen_random_uuid()
);
reset role;

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000008' and achievement_key = 'first_rating'
  ),
  1::bigint,
  'Excluding R2''s only Rating does not remove the already-earned badge'
);
select is(
  (
    select count(*) from private.achievement_recalculations as recalculation
    join private.achievement_unlocks as unlock on unlock.id = recalculation.unlock_id
    where unlock.member_id = '95000000-0000-4000-8000-000000000008'
      and unlock.achievement_key = 'first_rating'
      and recalculation.triggering_event = 'rating_excluded'
  ),
  1::bigint,
  'The Rating exclusion is recorded internally as a recalculation, moderator-visible only'
);

-- Conduct-flag gating: blocks new unlocks while active, re-opens once cleared -------------------

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-00000000000b', true);
set local role authenticated;
select public.record_member_conduct_flag(
  '95000000-0000-4000-8000-000000000009', 'policy_violation', 'achievement test: gating check',
  null, extensions.gen_random_uuid()
);
reset role;

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000009', true);
set local role authenticated;
select public.set_current_favourite('93000000-0000-4000-8000-000000000001', true);
reset role;

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000009'
  ),
  0::bigint,
  'A Member with an active conduct flag earns no new Achievement even with fully-qualifying activity'
);

select id as r3_flag_id into temporary table r3_flag
from private.member_conduct_flags
where member_id = '95000000-0000-4000-8000-000000000009' and flag_kind <> 'flag_cleared';

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-00000000000b', true);
select public.clear_member_conduct_flag(
  (select r3_flag_id from r3_flag),
  'achievement test: gating check resolved',
  extensions.gen_random_uuid()
);
reset role;

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-000000000009' and achievement_key = 'first_favourite'
  ),
  1::bigint,
  'Clearing the conduct flag automatically re-evaluates and unlocks the previously-blocked Achievement'
);

-- Unlock-ledger immutability: the reject-mutation trigger enforces the append-only contract -----

-- A distinctly different timestamp: this whole file is one transaction, so now() can equal the
-- freshly-inserted row's default earned_at, which would make the update a no-op instead of a
-- trigger violation.
select throws_ok(
  $$update private.achievement_unlocks set earned_at = now() - interval '1 day'
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'first_favourite'$$,
  '55000',
  'Achievement unlocks are immutable once earned; only the private notified_at acknowledgment may be set once, from null',
  'An unlock''s earned_at can never be rewritten, even by a superuser session'
);
select throws_ok(
  $$update private.achievement_unlocks set member_id = '95000000-0000-4000-8000-00000000000a'
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'first_favourite'$$,
  '55000',
  'Achievement unlocks are immutable once earned; only the private notified_at acknowledgment may be set once, from null',
  'An unlock can never be reassigned to another Member'
);
select throws_ok(
  $$update private.achievement_unlocks set achievement_key = 'first_rating'
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'first_favourite'$$,
  '55000',
  'Achievement unlocks are immutable once earned; only the private notified_at acknowledgment may be set once, from null',
  'An unlock can never be rewritten into a different Achievement'
);
select throws_ok(
  $$update private.achievement_unlocks set definition_version = 99
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'first_favourite'$$,
  '55000',
  'Achievement unlocks are immutable once earned; only the private notified_at acknowledgment may be set once, from null',
  'An unlock''s earning definition version can never be rewritten'
);
select lives_ok(
  $$update private.achievement_unlocks set notified_at = now()
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'first_favourite'
      and notified_at is null$$,
  'The single permitted mutation - the once-only notified_at acknowledgment from null - succeeds'
);
select throws_ok(
  $$update private.achievement_unlocks set notified_at = now()
    where member_id = '95000000-0000-4000-8000-000000000001' and achievement_key = 'first_favourite'$$,
  '55000',
  'Achievement unlocks are immutable once earned; only the private notified_at acknowledgment may be set once, from null',
  'An already-set notified_at acknowledgment can never be re-set'
);
-- Truncating the recalculation table alongside satisfies the FK-reference pre-check, so the
-- rejection proven here is the ledger's own trigger, not an incidental constraint error.
select throws_ok(
  $$truncate private.achievement_recalculations, private.achievement_unlocks$$,
  '55000',
  'Achievement unlocks are immutable once earned; only deletion (account-deletion cleanup) is permitted',
  'The unlock ledger can never be truncated'
);

-- Authorization: member sees own only, no public read, venue rep/other member denial ------------

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  (select count(*) from public.get_my_achievements() where earned_at is not null),
  10::bigint,
  'M1 sees exactly the ten Achievements earned so far in their own catalogue read'
);
reset role;

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-00000000000a', true);
set local role authenticated;
select is(
  (select count(*) from public.get_my_achievements() where earned_at is not null),
  0::bigint,
  'OTHER, who has earned nothing, cannot see any of M1''s earned Achievements through their own read'
);
select is(
  (select count(*) from public.get_my_achievements()),
  1::bigint,
  'OTHER receives only the enabled empty sentinel and cannot discover the locked catalogue'
);
select throws_ok(
  $$select * from public.get_moderation_member_achievements('95000000-0000-4000-8000-000000000001')$$,
  '42501',
  'Moderator role required',
  'A Member cannot use the Moderator-only oversight read, even to inspect another Member'
);
reset role;

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-00000000000c', true);
set local role authenticated;
select throws_ok(
  $$select * from public.get_moderation_member_achievements('95000000-0000-4000-8000-000000000001')$$,
  '42501',
  'Moderator role required',
  'A Venue Representative cannot use the Moderator-only oversight read'
);
reset role;

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-00000000000b', true);
set local role authenticated;
select ok(
  (
    select count(*) from public.get_moderation_member_achievements('95000000-0000-4000-8000-000000000001')
  ) > 0,
  'A Moderator can read a Member''s unlocks and recalculation history through the oversight RPC'
);
reset role;

set local role anon;
select throws_ok(
  $$select * from public.get_my_achievements()$$,
  '42501',
  null,
  'A Visitor cannot read any Member''s Achievement catalogue'
);
select lives_ok(
  $$select * from public.get_achievement_feature_status()$$,
  'A Visitor can safely read the public feature-status boolean, like public.get_check_in_policy'
);
reset role;

-- Concurrency: two racing evaluations resolve to exactly one unlock row -------------------------

select extensions.dblink_connect(
  'achievement_race_a',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);
select extensions.dblink_connect(
  'achievement_race_b',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);

-- Note: the setup deliberately never touches ALTER TABLE ... DISABLE/ENABLE TRIGGER. That would
-- need an ACCESS EXCLUSIVE lock on private.check_ins, which would deadlock against the row-level
-- locks this file's own still-open outer transaction already holds on that table from the earlier
-- fixtures above. The Achievement policy is already enabled globally (set once, above, by its own
-- short-lived dblink session), so a plain Check-in insert here would immediately auto-unlock
-- through the normal trigger - leaving nothing to race. Instead this session-local
-- session_replication_role = replica (superuser-only, session-scoped, no table lock at all)
-- suppresses the touch-point trigger for just this one insert, leaving a genuinely qualifying,
-- not-yet-unlocked precondition for the race below.
select is(
  extensions.dblink_exec(
    'achievement_race_a',
    $setup$
      delete from private.achievement_unlocks
      where member_id = '95000000-0000-4000-8000-00000000000d';
      delete from private.check_ins
      where member_id = '95000000-0000-4000-8000-00000000000d';
      delete from security.role_grants
      where user_id = '95000000-0000-4000-8000-00000000000d';
      delete from private.member_accounts
      where user_id = '95000000-0000-4000-8000-00000000000d';
      delete from auth.users
      where id = '95000000-0000-4000-8000-00000000000d';
      insert into auth.users (id)
      values ('95000000-0000-4000-8000-00000000000d');
      insert into private.member_accounts (user_id)
      values ('95000000-0000-4000-8000-00000000000d');
      insert into security.role_grants (user_id, role)
      values ('95000000-0000-4000-8000-00000000000d', 'member');
      set session_replication_role = replica;
      insert into private.check_ins (member_id, place_id, request_id, checked_in_at)
      values (
        '95000000-0000-4000-8000-00000000000d',
        '30000000-0000-4000-8000-000000000003',
        extensions.gen_random_uuid(),
        now()
      );
      set session_replication_role = default;
    $setup$
  ),
  'SET',
  'The independent Achievement race session seeds a fully-qualifying, not-yet-unlocked fixture'
);

select ok(
  extensions.dblink_send_query(
    'achievement_race_a',
    $eval_a$
      do $block$
      begin
        perform private.evaluate_achievement_unlocks(
          '95000000-0000-4000-8000-00000000000d'::uuid, 'concurrency_test_a', now()
        );
        perform pg_sleep(1);
      end
      $block$;
    $eval_a$
  ) = 1,
  'The first concurrent Achievement evaluation starts in an independent database session'
);

select pg_sleep(0.2);

select extensions.dblink_send_query(
  'achievement_race_b',
  $eval_b$
    select private.evaluate_achievement_unlocks(
      '95000000-0000-4000-8000-00000000000d'::uuid, 'concurrency_test_b', now()
    );
  $eval_b$
);

select pg_sleep(0.2);

select is(
  extensions.dblink_is_busy('achievement_race_a'),
  1,
  'The second concurrent evaluation overlaps the first, still holding its transaction open'
);

select *
from extensions.dblink_get_result('achievement_race_a', false) as result(status text);
select *
from extensions.dblink_get_result('achievement_race_b', false) as result(status text);
select *
from extensions.dblink_get_result('achievement_race_a', false) as result(status text);
select *
from extensions.dblink_get_result('achievement_race_b', false) as result(status text);

select is(
  (
    select count(*) from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-00000000000d' and achievement_key = 'first_checkin'
  ),
  1::bigint,
  'Two concurrent evaluations of the same qualifying state resolve to exactly one unlock row'
);

select extensions.dblink_exec(
  'achievement_race_a',
  $cleanup$
    delete from private.achievement_unlocks
    where member_id = '95000000-0000-4000-8000-00000000000d';
    delete from private.check_ins
    where member_id = '95000000-0000-4000-8000-00000000000d';
    delete from security.role_grants
    where user_id = '95000000-0000-4000-8000-00000000000d';
    delete from private.member_accounts
    where user_id = '95000000-0000-4000-8000-00000000000d';
    delete from auth.users
    where id = '95000000-0000-4000-8000-00000000000d';
    delete from private.achievement_policy where singleton;
  $cleanup$
);

select extensions.dblink_disconnect('achievement_race_a');
select extensions.dblink_disconnect('achievement_race_b');

-- Account deletion cleanup seam -------------------------------------------------------------

select is(
  (select private.detach_member_achievements('95000000-0000-4000-8000-000000000001'::uuid)),
  10::bigint,
  'The account-deletion cleanup seam hard-deletes every unlock row for the member'
);
select is(
  (
    select count(*) from private.achievement_recalculations as recalculation
    join private.achievement_unlocks as unlock on unlock.id = recalculation.unlock_id
    where unlock.member_id = '95000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'Recalculation history cascades away with the deleted unlock rows'
);

select * from finish();

rollback;
