begin;

create extension if not exists pgtap with schema extensions;

alter table private.locations alter column geometry_precision set default 'moderator_confirmed_point';
alter table private.locations alter column geometry_source set default 'Reviewed database test fixture';

select plan(36);

select has_function(
  'public',
  'list_personal_places',
  array['text', 'text', 'integer', 'timestamp with time zone', 'uuid'],
  'The combined Favourite/visited/map projection exists'
);
select has_function(
  'public',
  'list_personal_check_ins',
  array['text', 'integer', 'timestamp with time zone', 'uuid'],
  'The chronological Check-in log exists'
);
select has_function(
  'private',
  'get_place_identity_successor',
  array['uuid', 'text'],
  'A single-hop successor lookup exists'
);

select ok(
  not has_function_privilege('anon', 'public.list_personal_places(text,text,integer,timestamptz,uuid)', 'execute'),
  'Visitors cannot list personal Places'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.list_personal_places(text,text,integer,timestamptz,uuid)',
    'execute'
  ),
  'Authenticated callers can list their own personal Places'
);
select ok(
  not has_function_privilege('anon', 'public.list_personal_check_ins(text,integer,timestamptz,uuid)', 'execute'),
  'Visitors cannot list personal Check-ins'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.list_personal_check_ins(text,integer,timestamptz,uuid)',
    'execute'
  ),
  'Authenticated callers can list their own Check-in history'
);
select ok(
  not has_function_privilege('service_role', 'public.list_personal_places(text,text,integer,timestamptz,uuid)', 'execute'),
  'The service role cannot use the personal-history RPCs as an unrestricted query surface'
);

-- The map must display Place Locations, never a captured Member coordinate. There is no
-- coordinate column anywhere in private.check_ins (proven in 018_check_ins.test.sql); this proves
-- the new personal-history surface only ever selects latitude/longitude from private.locations by
-- construction (there is no other coordinate-shaped source it could read from).
select is(
  (
    select count(*)
    from information_schema.parameters
    where specific_schema = 'public'
      and specific_name like 'list_personal_places_%'
      and parameter_mode in ('IN', 'INOUT')
      and (parameter_name ilike '%latitude%' or parameter_name ilike '%longitude%')
  ),
  0::bigint,
  'list_personal_places accepts no coordinate input parameter (latitude/longitude are only ever read from Place Location and returned, never accepted)'
);

insert into auth.users (id)
values
  ('84000000-0000-4000-8000-000000000001'),
  ('84000000-0000-4000-8000-000000000002'),
  ('84000000-0000-4000-8000-000000000003'),
  ('84000000-0000-4000-8000-000000000004');

insert into private.member_accounts (user_id)
values
  ('84000000-0000-4000-8000-000000000001'),
  ('84000000-0000-4000-8000-000000000002');

insert into security.role_grants (user_id, role)
values
  ('84000000-0000-4000-8000-000000000001', 'member'),
  ('84000000-0000-4000-8000-000000000002', 'member'),
  ('84000000-0000-4000-8000-000000000004', 'moderator');

-- Fixture: an identity-transition pair sharing one Location (a 'new_operator' transition), so the
-- successor-resolution edge case ("predecessor and successor sharing one Location") is exercised
-- against a real private.place_identity_transitions row rather than a synthetic shortcut.
insert into private.operators (id, name)
values
  ('85000000-0000-4000-8000-000000000001', 'Personal history predecessor operator'),
  ('85000000-0000-4000-8000-000000000002', 'Personal history successor operator');

insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude
) values (
  '86000000-0000-4000-8000-000000000001', 'Sögugata 14', 'Reykjavík', '101', 'reykjavik', 64.147, -21.933
);

insert into private.places (id, operator_id, location_id, purpose, lifecycle, category, version, published_at)
values
  (
    '87000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001',
    '86000000-0000-4000-8000-000000000001', 'dog_access_destination', 'published', 'cafe', 1,
    '2026-01-01T00:00:00Z'
  ),
  (
    '87000000-0000-4000-8000-000000000002', '85000000-0000-4000-8000-000000000002',
    '86000000-0000-4000-8000-000000000001', 'dog_access_destination', 'candidate', 'cafe', 1, null
  );

insert into private.place_translations (place_id, locale, name, description)
values
  ('87000000-0000-4000-8000-000000000001', 'is', 'Sögustaður', 'Fyrri lýsing.'),
  ('87000000-0000-4000-8000-000000000001', 'en', 'History Predecessor', 'Original description.'),
  ('87000000-0000-4000-8000-000000000002', 'is', 'Nýr rekstraraðili', 'Ný lýsing.'),
  ('87000000-0000-4000-8000-000000000002', 'en', 'History Successor', 'New description.');

insert into private.access_conditions (id, place_id, access_area, restraint_condition, permission_requirement)
values (
  '88000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001',
  'outdoors', 'leash_required', 'standing_permission'
);

insert into private.evidence (id, place_id, kind, source_url, source_label, observed_at, recorded_by)
values (
  '89000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001',
  'official_website', 'https://example.invalid/personal-history-fixture', 'Fixture source',
  '2026-01-01T00:00:00Z', null
);

insert into private.verifications (id, access_condition_id, status, verified_at, freshness_until)
values (
  '90000000-0000-4000-8000-000000000001', '88000000-0000-4000-8000-000000000001',
  'verified', '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z'
);

insert into private.verification_evidence (verification_id, evidence_id)
values ('90000000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000001');

-- A second, independently discoverable Place with no transition history, used for the
-- "both Favourite and visited many times" edge case and for pagination.
insert into private.operators (id, name)
values ('85000000-0000-4000-8000-000000000003', 'Personal history plain operator');
insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude
) values (
  '86000000-0000-4000-8000-000000000002', 'Ferðagata 2', 'Reykjavík', '105', 'reykjavik', 64.132, -21.902
);
insert into private.places (id, operator_id, location_id, purpose, lifecycle, category, version, published_at)
values (
  '87000000-0000-4000-8000-000000000003', '85000000-0000-4000-8000-000000000003',
  '86000000-0000-4000-8000-000000000002', 'dog_access_destination', 'published', 'park', 1,
  '2026-01-01T00:00:00Z'
);
insert into private.place_translations (place_id, locale, name, description)
values
  ('87000000-0000-4000-8000-000000000003', 'is', 'Margheimsóttur garður', 'Lýsing.'),
  ('87000000-0000-4000-8000-000000000003', 'en', 'Repeat-visit Park', 'Description.');
insert into private.access_conditions (id, place_id, access_area, restraint_condition, permission_requirement)
values (
  '88000000-0000-4000-8000-000000000003', '87000000-0000-4000-8000-000000000003',
  'outdoors', 'off_leash_permitted', 'standing_permission'
);
insert into private.evidence (id, place_id, kind, source_url, source_label, observed_at, recorded_by)
values (
  '89000000-0000-4000-8000-000000000003', '87000000-0000-4000-8000-000000000003',
  'official_website', 'https://example.invalid/personal-history-fixture-park', 'Fixture source',
  '2026-01-01T00:00:00Z', null
);
insert into private.verifications (id, access_condition_id, status, verified_at, freshness_until)
values (
  '90000000-0000-4000-8000-000000000003', '88000000-0000-4000-8000-000000000003',
  'verified', '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z'
);
insert into private.verification_evidence (verification_id, evidence_id)
values ('90000000-0000-4000-8000-000000000003', '89000000-0000-4000-8000-000000000003');

-- Anonymous and unauthenticated denial.
set local role anon;
select throws_ok(
  $$select * from public.list_personal_places('en')$$,
  '42501',
  null,
  'A Visitor cannot list personal Places'
);
select throws_ok(
  $$select * from public.list_personal_check_ins('en')$$,
  '42501',
  null,
  'A Visitor cannot list personal Check-ins'
);
reset role;

select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select throws_ok(
  $$select * from public.list_personal_places('en')$$,
  '42501',
  'Member activation required',
  'An Auth identity without a Member account cannot list personal Places'
);
reset role;

-- Member 1: favourites Place 1 and checks in twice, favourites-and-visits Place 3 (edge case:
-- a Place both Favourite and visited many times).
select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (select count(*) from public.list_personal_places('en')),
  0::bigint,
  'A brand-new Member sees an empty personal-history projection (first-use/empty state)'
);
select is(
  (select count(*) from public.list_personal_check_ins('en')),
  0::bigint,
  'A brand-new Member sees an empty Check-in history'
);

select public.set_current_favourite('87000000-0000-4000-8000-000000000001', true);
select public.set_current_favourite('87000000-0000-4000-8000-000000000003', true);
select public.record_check_in('87000000-0000-4000-8000-000000000003', 'unknown', extensions.gen_random_uuid());

reset role;
-- Advance the second Check-in on Place 3 outside the rolling 24-hour dedupe window used by
-- record_check_in so both Check-ins persist as genuinely distinct visits for the "visited many
-- times" edge case, then re-authenticate as Member 1.
insert into private.check_ins (member_id, place_id, proximity_confirmed, request_id, checked_in_at)
values (
  '84000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000003', 'confirmed',
  extensions.gen_random_uuid(), now() - interval '48 hours'
);

select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (select count(*) from public.list_personal_places('en', 'all')),
  2::bigint,
  'The combined projection lists both the Favourite-only and the favourite-and-visited Place'
);
select is(
  (select count(*) from public.list_personal_places('en', 'favourite')),
  2::bigint,
  'The favourite filter returns every saved Place'
);
select is(
  (select count(*) from public.list_personal_places('en', 'visited')),
  1::bigint,
  'The visited filter returns only the checked-in Place'
);
select is(
  (
    select is_favourite from public.list_personal_places('en', 'all')
    where place_id = '87000000-0000-4000-8000-000000000003'
  ),
  true,
  'A Place both Favourite and visited reports is_favourite true'
);
select is(
  (
    select visit_count from public.list_personal_places('en', 'all')
    where place_id = '87000000-0000-4000-8000-000000000003'
  ),
  2,
  'A Place visited twice reports a visit_count of two'
);
select is(
  (
    select availability from public.list_personal_places('en', 'all')
    where place_id = '87000000-0000-4000-8000-000000000001'
  ),
  'available',
  'A currently discoverable Place is available'
);
select is(
  (
    select latitude from public.list_personal_places('en', 'all')
    where place_id = '87000000-0000-4000-8000-000000000001'
  ),
  64.147::double precision,
  'The map projection exposes the Place Location, never a captured Member coordinate'
);
select is(
  (select count(*) from public.list_personal_check_ins('en')),
  2::bigint,
  'The chronological Check-in log lists both distinct visits'
);
select is(
  (select checked_in_at from public.list_personal_check_ins('en') order by checked_in_at desc limit 1) >
  (select checked_in_at from public.list_personal_check_ins('en') order by checked_in_at desc offset 1 limit 1),
  true,
  'Check-ins are ordered most-recent first by server timestamp'
);

reset role;

-- Moderator applies a 'new_operator' identity transition retiring Place 1 in favour of Place 2,
-- sharing the same Location (the successor-sharing-one-Location edge case).
select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select public.transition_place_identity(
  jsonb_build_object(
    'place_id', '87000000-0000-4000-8000-000000000001',
    'expected_version', 1,
    'kind', 'new_operator',
    'successor_place_id', '87000000-0000-4000-8000-000000000002',
    'decided_at', '2026-07-12T00:00:00Z',
    'decision_notes', 'A new Operator took over the same Location.'
  ),
  extensions.gen_random_uuid()
);
reset role;

select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (
    select availability from public.list_personal_places('en', 'all')
    where place_id = '87000000-0000-4000-8000-000000000001'
  ),
  'inactive',
  'A retired Favourite Place is distinguished as Inactive without exposing moderator-only detail'
);
select is(
  (
    select successor_place_id from public.list_personal_places('en', 'all')
    where place_id = '87000000-0000-4000-8000-000000000001'
  ),
  '87000000-0000-4000-8000-000000000002'::uuid,
  'The Inactive predecessor names its resolved successor Place instead of silently substituting it'
);
select is(
  (
    select successor_name from public.list_personal_places('en', 'all')
    where place_id = '87000000-0000-4000-8000-000000000001'
  ),
  'History Successor',
  'The successor name is localized to the requested locale'
);
select is(
  (
    select successor_place_id from public.list_personal_places('is', 'all')
    where place_id = '87000000-0000-4000-8000-000000000001'
  ),
  '87000000-0000-4000-8000-000000000002'::uuid,
  'Successor resolution works identically in the Icelandic locale'
);
-- transition_place_identity requires the successor to be a Candidate at transition time, so
-- right after the transition the successor has no public profile yet: the projection must say so
-- rather than inviting the UI to link into a discovery deep link that would select nothing.
select is(
  (
    select successor_available from public.list_personal_places('en', 'all')
    where place_id = '87000000-0000-4000-8000-000000000001'
  ),
  false,
  'A still-Candidate successor is reported as not publicly available'
);

reset role;
-- Publish the successor with a verified Access Condition chain, making it discoverable.
update private.places
set lifecycle = 'published', published_at = '2026-07-12T00:00:00Z'
where id = '87000000-0000-4000-8000-000000000002';
insert into private.access_conditions (id, place_id, access_area, restraint_condition, permission_requirement)
values (
  '88000000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000002',
  'outdoors', 'leash_required', 'standing_permission'
);
insert into private.evidence (id, place_id, kind, source_url, source_label, observed_at, recorded_by)
values (
  '89000000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000002',
  'official_website', 'https://example.invalid/personal-history-successor', 'Fixture source',
  '2026-07-12T00:00:00Z', null
);
insert into private.verifications (id, access_condition_id, status, verified_at, freshness_until)
values (
  '90000000-0000-4000-8000-000000000002', '88000000-0000-4000-8000-000000000002',
  'verified', '2026-07-12T00:00:00Z', '2099-01-01T00:00:00Z'
);
insert into private.verification_evidence (verification_id, evidence_id)
values ('90000000-0000-4000-8000-000000000002', '89000000-0000-4000-8000-000000000002');

select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  (
    select successor_available from public.list_personal_places('en', 'all')
    where place_id = '87000000-0000-4000-8000-000000000001'
  ),
  true,
  'A published, discoverable successor is reported as publicly available'
);
select is(
  (
    select place_id from public.list_personal_places('en', 'all')
    where place_id = '87000000-0000-4000-8000-000000000003'
  ),
  '87000000-0000-4000-8000-000000000003'::uuid,
  'A Place with no transition history is untouched by successor resolution'
);
select is(
  (
    select successor_place_id from public.list_personal_places('en', 'all')
    where place_id = '87000000-0000-4000-8000-000000000003'
  ),
  null::uuid,
  'A Place never transitioned reports no successor'
);

-- Keyset pagination: fetch one page at a time ordered by last_activity_at desc, place_id desc, and
-- prove the cursor reaches the same total with no duplication or gap regardless of page size.
select is(
  (select count(*) from public.list_personal_places('en', 'all', 1)),
  1::bigint,
  'A page size of one returns exactly one row'
);
select results_eq(
  $$
    with page_one as (
      select place_id, last_activity_at
      from public.list_personal_places('en', 'all', 1)
    )
    select place_id from public.list_personal_places(
      'en', 'all', 10,
      (select last_activity_at from page_one),
      (select place_id from page_one)
    )
    order by place_id
  $$,
  $$
    select place_id
    from public.list_personal_places('en', 'all')
    where place_id <> (select place_id from public.list_personal_places('en', 'all', 1))
    order by place_id
  $$,
  'Keyset pagination past the first page returns exactly the remaining rows with no duplication'
);

-- Privacy: another Member sees nothing of Member 1's activity.
reset role;
select set_config('request.jwt.claim.sub', '84000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is(
  (select count(*) from public.list_personal_places('en')),
  0::bigint,
  'Another Member cannot infer the first Member personal-history projection'
);
select is(
  (select count(*) from public.list_personal_check_ins('en')),
  0::bigint,
  'Another Member cannot infer the first Member Check-in history'
);

reset role;

-- No public leakage: discovery-facing functions expose no personal-history field.
select is(
  (
    select count(*)
    from information_schema.parameters
    where specific_schema = 'public'
      and specific_name like 'list_published_places_%'
      and parameter_mode = 'OUT'
      and (parameter_name ilike '%favourite%' or parameter_name ilike '%visit%' or parameter_name ilike '%check_in%')
  ),
  0::bigint,
  'Public discovery exposes no personal-history field'
);

select * from finish();

rollback;
