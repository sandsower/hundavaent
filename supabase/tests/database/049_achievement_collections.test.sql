begin;

create extension if not exists pgtap with schema extensions;

select plan(45);

-- Tiered Achievement collections: four count-based collections of three tiers each, visible when
-- locked, plus the six bespoke Achievements that stay absent until earned.
--
-- Not covered here, deliberately: the migration's empty-ledger precondition. It raises 55000 when
-- private.achievement_unlocks is non-empty, and by the time any test runs the migration has already
-- applied, so the assertion cannot be re-triggered in-place. Its correctness is structural.

-- Structural surface ------------------------------------------------------------------------

select has_table('private', 'achievement_collections', 'Collections carry each collection''s bilingual copy once');
select has_function(
  'private', 'member_achievement_metrics', array['uuid', 'timestamptz', 'integer'],
  'A single-pass metric read exists'
);
select has_function(
  'private', 'evaluate_bespoke_achievement_criteria', array['text', 'uuid', 'timestamptz', 'integer'],
  'Bespoke criteria evaluation is named for its narrowed scope'
);
select hasnt_function(
  'private', 'evaluate_achievement_criteria', array['text', 'uuid', 'timestamptz', 'integer', 'integer'],
  'The old per-key evaluator is gone rather than left as a footgun for tier keys'
);
select hasnt_function(
  'private', 'get_member_achievement_progress', array['uuid', 'timestamptz', 'integer'],
  'Progress no longer duplicates the metric queries'
);
select hasnt_column(
  'private', 'achievement_definitions', 'locked_visibility',
  'locked_visibility is dropped; collection is not null is the single source of locked visibility'
);
select has_column('private', 'achievement_definitions', 'collection', 'Definitions carry their collection');
select has_column('private', 'achievement_definitions', 'tier', 'Definitions carry their tier');
select col_is_null(
  'private', 'achievement_definitions', 'name_is',
  'Tier rows carry no bespoke copy, so the copy columns are nullable'
);

select is(
  (select count(*) from private.achievement_collections),
  4::bigint,
  'Exactly four collections are seeded'
);

-- Catalogue ---------------------------------------------------------------------------------

select is(
  (select count(*) from private.achievement_definitions where collection is not null),
  12::bigint,
  'Twelve tier definitions exist'
);

select set_eq(
  $$select key from private.achievement_definitions where collection is not null$$,
  $$values
    ('explorer_places_bronze'), ('explorer_places_silver'), ('explorer_places_gold'),
    ('place_categories_bronze'), ('place_categories_silver'), ('place_categories_gold'),
    ('municipalities_bronze'), ('municipalities_silver'), ('municipalities_gold'),
    ('contributions_bronze'), ('contributions_silver'), ('contributions_gold')$$,
  'Every tier key follows the <collection>_<tier> convention'
);

select results_eq(
  $$select definition.collection, definition.tier, (definition.criteria ->> 'threshold')::integer
    from private.achievement_definitions as definition
    where definition.collection is not null
    order by definition.collection, (definition.criteria ->> 'threshold')::integer$$,
  $$values
    ('contributions', 'bronze', 1), ('contributions', 'silver', 3), ('contributions', 'gold', 10),
    ('explorer_places', 'bronze', 5), ('explorer_places', 'silver', 10), ('explorer_places', 'gold', 15),
    ('municipalities', 'bronze', 2), ('municipalities', 'silver', 3), ('municipalities', 'gold', 4),
    ('place_categories', 'bronze', 2), ('place_categories', 'silver', 3), ('place_categories', 'gold', 4)$$,
  'Thresholds match the approved catalogue'
);

select set_eq(
  $$select key from private.achievement_definitions where collection is null$$,
  $$values
    ('first_favourite'), ('first_rating'), ('first_checkin'),
    ('sustained_quality_contributor'), ('six_month_member'), ('one_year_member')$$,
  'The six bespoke Achievements survive untouched'
);

select is(
  (select count(*) from private.achievement_definitions
    where collection is not null
      and (name_is is not null or name_en is not null
        or description_is is not null or description_en is not null)),
  0::bigint,
  'No tier row carries bespoke copy; a tier derives its copy from its collection and tier'
);

select is(
  (select count(*)
    from private.achievement_definitions as definition
    join private.achievement_definitions as higher
      on higher.collection = definition.collection
      and higher.tier = 'gold'
      and definition.tier = 'bronze'
    where (definition.criteria ->> 'threshold')::integer
      >= (higher.criteria ->> 'threshold')::integer),
  0::bigint,
  'Bronze is strictly below gold in every collection, so a member cannot skip a rung'
);

-- Constraints -------------------------------------------------------------------------------

select throws_ok(
  $$insert into private.achievement_definitions
      (key, version, achievement_group, display_order, collection, tier, progress_kind, criteria)
    values ('bad_no_collection', 1, 'exploration', 91, null, 'bronze', 'credited_places', '{"threshold": 1}')$$,
  '23514',
  null,
  'A tier without a collection is rejected'
);

select throws_ok(
  $$insert into private.achievement_definitions
      (key, version, achievement_group, display_order, collection, tier, progress_kind, criteria)
    values ('bad_no_metric', 1, 'exploration', 92, 'explorer_places', 'bronze', null, '{"threshold": 1}')$$,
  '23514',
  null,
  'A tier without a metric is rejected'
);

select throws_ok(
  $$insert into private.achievement_definitions
      (key, version, achievement_group, display_order, collection, tier, progress_kind, criteria,
       name_is, name_en, description_is, description_en)
    values ('bad_tier_copy', 1, 'exploration', 93, 'explorer_places', 'bronze', 'credited_places',
      '{"threshold": 1}', 'Nafn', 'Name', 'Lysing', 'Description')$$,
  '23514',
  null,
  'A tier carrying bespoke copy is rejected'
);

select throws_ok(
  $$insert into private.achievement_definitions
      (key, version, achievement_group, display_order, collection, tier, progress_kind, criteria)
    values ('bad_tier_value', 1, 'exploration', 94, 'explorer_places', 'platinum', 'credited_places', '{"threshold": 1}')$$,
  '23514',
  null,
  'An unknown tier name is rejected'
);

select throws_ok(
  $$insert into private.achievement_definitions
      (key, version, achievement_group, display_order, collection, tier, progress_kind, criteria)
    values ('bad_no_threshold', 1, 'exploration', 95, 'explorer_places', 'bronze', 'credited_places', '{}')$$,
  '23514',
  null,
  'A tier whose criteria carries no threshold is rejected'
);

-- Fixtures ----------------------------------------------------------------------------------

insert into private.operators (id, name)
values ('a2000000-0000-4000-8000-000000000001', 'Collection fixture operator');

insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude,
  geometry_precision, geometry_source
)
values
  ('a4000000-0000-4000-8000-000000000001', 'Safngata 1', 'Reykjavík', '101', 'reykjavik', 64.121, -21.921, 'moderator_confirmed_point', 'Reviewed database test fixture'),
  ('a4000000-0000-4000-8000-000000000002', 'Safngata 2', 'Reykjavík', '101', 'reykjavik', 64.122, -21.922, 'moderator_confirmed_point', 'Reviewed database test fixture'),
  ('a4000000-0000-4000-8000-000000000003', 'Safngata 3', 'Kópavogur', '200', 'kopavogur', 64.123, -21.923, 'moderator_confirmed_point', 'Reviewed database test fixture'),
  ('a4000000-0000-4000-8000-000000000004', 'Safngata 4', 'Garðabær', '210', 'gardabaer', 64.124, -21.924, 'moderator_confirmed_point', 'Reviewed database test fixture'),
  ('a4000000-0000-4000-8000-000000000005', 'Safngata 5', 'Hafnarfjörður', '220', 'hafnarfjordur', 64.125, -21.925, 'moderator_confirmed_point', 'Reviewed database test fixture');

insert into private.places (id, operator_id, location_id, purpose, lifecycle, category, published_at)
values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'dog_access_destination', 'published', 'restaurant', now()),
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002', 'dog_access_destination', 'published', 'park', now()),
  ('a3000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003', 'dog_access_destination', 'published', 'shop', now()),
  ('a3000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004', 'dog_access_destination', 'published', 'culture', now()),
  ('a3000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000005', 'dog_access_destination', 'published', 'cafe', now());

insert into auth.users (id)
values
  ('a5000000-0000-4000-8000-000000000001'), -- SPREAD: five spaced Check-ins
  ('a5000000-0000-4000-8000-000000000002'), -- BURST: five Check-ins inside one spacing window
  ('a5000000-0000-4000-8000-000000000003'), -- FRESH: no activity at all
  ('a5000000-0000-4000-8000-000000000004'), -- CONTRIB: confirmed and revoked Contributions
  ('a5000000-0000-4000-8000-000000000005'), -- FLAGGED: qualifying activity plus a conduct flag
  ('a5000000-0000-4000-8000-000000000006'); -- BESPOKE: earns a surprise Achievement

insert into private.member_accounts (user_id)
values
  ('a5000000-0000-4000-8000-000000000001'),
  ('a5000000-0000-4000-8000-000000000002'),
  ('a5000000-0000-4000-8000-000000000003'),
  ('a5000000-0000-4000-8000-000000000004'),
  ('a5000000-0000-4000-8000-000000000005'),
  ('a5000000-0000-4000-8000-000000000006');

insert into security.role_grants (user_id, role)
values
  ('a5000000-0000-4000-8000-000000000001', 'member'),
  ('a5000000-0000-4000-8000-000000000002', 'member'),
  ('a5000000-0000-4000-8000-000000000003', 'member'),
  ('a5000000-0000-4000-8000-000000000004', 'member'),
  ('a5000000-0000-4000-8000-000000000005', 'member'),
  ('a5000000-0000-4000-8000-000000000006', 'member');

-- The policy row is written directly rather than through the RPC: 023 already proves the RPC and
-- its grant boundary, and this file runs no independent dblink session to contend with.
-- Eligibility starts a year ago so the fixture activity below all falls after the boundary.
insert into private.achievement_policy (
  singleton, policy_version, credit_spacing_minutes, enabled, eligibility_started_at
)
values (true, 'collection-test-v1', 15, true, now() - interval '1 year');

-- SPREAD: five Places, each an hour apart, so all five earn credit.
insert into private.check_ins (member_id, place_id, request_id, checked_in_at)
values
  ('a5000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', extensions.gen_random_uuid(), now() - interval '10 hours'),
  ('a5000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', extensions.gen_random_uuid(), now() - interval '9 hours'),
  ('a5000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', extensions.gen_random_uuid(), now() - interval '8 hours'),
  ('a5000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000004', extensions.gen_random_uuid(), now() - interval '7 hours'),
  ('a5000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000005', extensions.gen_random_uuid(), now() - interval '6 hours');

-- BURST: five Places inside a single 15-minute window, so only the first earns credit.
insert into private.check_ins (member_id, place_id, request_id, checked_in_at)
values
  ('a5000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001', extensions.gen_random_uuid(), now() - interval '10 hours'),
  ('a5000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002', extensions.gen_random_uuid(), now() - interval '10 hours' + interval '2 minutes'),
  ('a5000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000003', extensions.gen_random_uuid(), now() - interval '10 hours' + interval '4 minutes'),
  ('a5000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000004', extensions.gen_random_uuid(), now() - interval '10 hours' + interval '6 minutes'),
  ('a5000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000005', extensions.gen_random_uuid(), now() - interval '10 hours' + interval '8 minutes');

-- Metrics -----------------------------------------------------------------------------------

select is(
  (select metric_value from private.member_achievement_metrics(
    'a5000000-0000-4000-8000-000000000001', now(), 15) where progress_kind = 'credited_places'),
  5,
  'Five spaced Places all earn credit'
);

select is(
  (select metric_value from private.member_achievement_metrics(
    'a5000000-0000-4000-8000-000000000002', now(), 15) where progress_kind = 'credited_places'),
  1,
  'Five Places inside one spacing window earn credit once'
);

select is(
  (select metric_value from private.member_achievement_metrics(
    'a5000000-0000-4000-8000-000000000001', now(), 15) where progress_kind = 'credited_categories'),
  4,
  'Categories are counted from the same credited Place set'
);

select is(
  (select metric_value from private.member_achievement_metrics(
    'a5000000-0000-4000-8000-000000000001', now(), 15) where progress_kind = 'credited_municipalities'),
  4,
  'Municipalities are counted from the same credited Place set'
);

insert into private.place_suggestions (
  id, member_id, request_id, proposal, submitted_at
)
values
  ('a6000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000004', extensions.gen_random_uuid(), '{}'::jsonb, now() - interval '3 days'),
  ('a6000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000004', extensions.gen_random_uuid(), '{}'::jsonb, now() - interval '2 days');

insert into private.contributions (
  suggestion_id, member_id, confirmed_by, confirmation_request_id, subject_place_id, confirmed_at
)
values
  ('a6000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000004', 'a5000000-0000-4000-8000-000000000001', extensions.gen_random_uuid(), 'a3000000-0000-4000-8000-000000000001', now() - interval '3 days'),
  ('a6000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000004', 'a5000000-0000-4000-8000-000000000001', extensions.gen_random_uuid(), 'a3000000-0000-4000-8000-000000000002', now() - interval '2 days');

select is(
  (select metric_value from private.member_achievement_metrics(
    'a5000000-0000-4000-8000-000000000004', now(), 15) where progress_kind = 'confirmed_contributions'),
  2,
  'Confirmed Contributions are counted'
);

-- Unlocks -----------------------------------------------------------------------------------

select set_eq(
  $$select achievement_key from private.achievement_unlocks
    where member_id = 'a5000000-0000-4000-8000-000000000001'
      and achievement_key like 'explorer_places%'$$,
  $$values ('explorer_places_bronze')$$,
  'Five credited Places unlock bronze and no higher tier'
);

select set_eq(
  $$select achievement_key from private.achievement_unlocks
    where member_id = 'a5000000-0000-4000-8000-000000000004'
      and achievement_key like 'contributions%'$$,
  $$values ('contributions_bronze')$$,
  'Two Contributions unlock bronze but not silver at three'
);

insert into private.place_suggestions (
  id, member_id, request_id, proposal, submitted_at
)
values ('a6000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000004', extensions.gen_random_uuid(), '{}'::jsonb, now() - interval '1 day');

insert into private.contributions (
  suggestion_id, member_id, confirmed_by, confirmation_request_id, subject_place_id, confirmed_at
)
values ('a6000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000004', 'a5000000-0000-4000-8000-000000000001', extensions.gen_random_uuid(), 'a3000000-0000-4000-8000-000000000003', now() - interval '1 day');

select set_eq(
  $$select achievement_key from private.achievement_unlocks
    where member_id = 'a5000000-0000-4000-8000-000000000004'
      and achievement_key like 'contributions%'$$,
  $$values ('contributions_bronze'), ('contributions_silver')$$,
  'A third Contribution adds silver without re-adding bronze'
);

select is(
  (select count(*) from private.achievement_unlocks
    where member_id = 'a5000000-0000-4000-8000-000000000004'
      and achievement_key = 'contributions_bronze'),
  1::bigint,
  'An already-earned tier is never unlocked twice'
);

-- Revoking a Contribution drops the member below silver. The unlock persists and the finding is
-- recorded against the version the unlock was earned under.
update private.contributions
set
  revoked_at = now(),
  revoked_by = 'a5000000-0000-4000-8000-000000000001',
  revoked_reason = 'Fixture revocation',
  revocation_request_id = extensions.gen_random_uuid()
where suggestion_id = 'a6000000-0000-4000-8000-000000000003';

select is(
  (select count(*) from private.achievement_unlocks
    where member_id = 'a5000000-0000-4000-8000-000000000004'
      and achievement_key = 'contributions_silver'),
  1::bigint,
  'A revocation never removes an earned tier'
);

select is(
  (select count(*) from private.achievement_recalculations
    where member_id = 'a5000000-0000-4000-8000-000000000004'
      and achievement_key = 'contributions_silver'),
  1::bigint,
  'Falling below a tier threshold is recorded as a recalculation finding'
);

select is(
  (select recalculation.definition_version
    from private.achievement_recalculations as recalculation
    join private.achievement_unlocks as unlock
      on unlock.member_id = recalculation.member_id
      and unlock.achievement_key = recalculation.achievement_key
    where recalculation.achievement_key = 'contributions_silver'),
  (select definition_version from private.achievement_unlocks
    where member_id = 'a5000000-0000-4000-8000-000000000004'
      and achievement_key = 'contributions_silver'),
  'The finding is pinned to the version the unlock was earned under'
);

insert into private.member_conduct_flags (member_id, flag_kind, reason, recorded_by, request_id)
values (
  'a5000000-0000-4000-8000-000000000005', 'fraud', 'Fixture flag',
  'a5000000-0000-4000-8000-000000000001', extensions.gen_random_uuid()
);

insert into private.check_ins (member_id, place_id, request_id, checked_in_at)
values
  ('a5000000-0000-4000-8000-000000000005', 'a3000000-0000-4000-8000-000000000001', extensions.gen_random_uuid(), now() - interval '5 hours'),
  ('a5000000-0000-4000-8000-000000000005', 'a3000000-0000-4000-8000-000000000002', extensions.gen_random_uuid(), now() - interval '4 hours'),
  ('a5000000-0000-4000-8000-000000000005', 'a3000000-0000-4000-8000-000000000003', extensions.gen_random_uuid(), now() - interval '3 hours'),
  ('a5000000-0000-4000-8000-000000000005', 'a3000000-0000-4000-8000-000000000004', extensions.gen_random_uuid(), now() - interval '2 hours'),
  ('a5000000-0000-4000-8000-000000000005', 'a3000000-0000-4000-8000-000000000005', extensions.gen_random_uuid(), now() - interval '1 hour');

select is(
  (select count(*) from private.achievement_unlocks
    where member_id = 'a5000000-0000-4000-8000-000000000005'),
  0::bigint,
  'An active conduct flag blocks every tier unlock'
);

-- Caller-only read --------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select is(
  (select count(*) from public.get_my_achievements()),
  12::bigint,
  'A member with no activity sees all twelve tier slots and nothing else'
);

select is(
  (select count(*) from public.get_my_achievements() where entry_kind = 'locked'),
  12::bigint,
  'Every slot for an inactive member is locked'
);

select is(
  (select progress_current from public.get_my_achievements()
    where achievement_key = 'explorer_places_bronze'),
  0,
  'A locked tier at zero progress is returned rather than filtered out'
);

select is(
  (select progress_target from public.get_my_achievements()
    where achievement_key = 'explorer_places_bronze'),
  5,
  'A locked tier advertises the threshold that would close it'
);

select is(
  (select count(*) from public.get_my_achievements() where collection is null),
  0::bigint,
  'No surprise definition leaves the database while it is still locked'
);

select isnt(
  (select collection_name_en from public.get_my_achievements()
    where achievement_key = 'explorer_places_bronze'),
  null,
  'The collection''s bilingual name travels with each tier so copy can be derived'
);

reset role;

select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (select entry_kind from public.get_my_achievements()
    where achievement_key = 'explorer_places_bronze'),
  'earned',
  'An earned tier reports itself as earned'
);

select is(
  (select count(*) from public.get_my_achievements()
    where entry_kind = 'earned' and progress_current is not null),
  0::bigint,
  'An earned entry carries no progress figure'
);

reset role;

-- A bespoke Achievement appears only once it is earned. A Check-in is used rather than a Favourite
-- because Favourites require full Place discoverability, not merely a Published lifecycle.
insert into private.check_ins (member_id, place_id, request_id, checked_in_at)
values (
  'a5000000-0000-4000-8000-000000000006', 'a3000000-0000-4000-8000-000000000001',
  extensions.gen_random_uuid(), now() - interval '30 minutes'
);

select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000006', true);
set local role authenticated;

select is(
  (select count(*) from public.get_my_achievements()
    where achievement_key = 'first_checkin' and entry_kind = 'earned'),
  1::bigint,
  'A bespoke Achievement appears once it is earned'
);

select results_eq(
  $$select collection, tier, progress_kind, progress_target
    from public.claim_my_achievement_celebrations()
    where achievement_key = 'first_checkin'$$,
  $$values (null::text, null::text, null::text, null::integer)$$,
  'A bespoke celebration carries no collection, tier or threshold'
);

reset role;

select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select results_eq(
  $$select collection, tier, progress_kind, progress_target
    from public.claim_my_achievement_celebrations()
    where achievement_key = 'explorer_places_bronze'$$,
  $$values ('explorer_places', 'bronze', 'credited_places', 5)$$,
  'A tier celebration carries what the card needs to derive its copy'
);

reset role;

select * from finish();

rollback;
