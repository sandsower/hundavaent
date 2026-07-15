begin;

create extension if not exists pgtap with schema extensions;

alter table private.locations alter column geometry_precision set default 'moderator_confirmed_point';
alter table private.locations alter column geometry_source set default 'Reviewed database test fixture';

select plan(83);

-- Schema surface -------------------------------------------------------------------------------

select has_table('private', 'dog_friendliness_ratings', 'Rating persistence exists');
select has_table(
  'private',
  'dog_friendliness_rating_events',
  'Append-only Rating replacement history exists'
);
select has_table(
  'private',
  'dog_friendliness_summary_policy',
  'Fail-closed Summary policy singleton exists'
);
select has_function(
  'public',
  'submit_dog_friendliness_rating',
  -- Extended by private-rating-note (Private Rating Notes) with three trailing optional parameters; the
  -- original 6-argument callers documented below keep working via PostgREST's named-argument
  -- calling convention and Postgres default-parameter resolution.
  array['uuid', 'integer', 'integer', 'integer', 'integer', 'uuid', 'boolean', 'text', 'text'],
  'Member submit/update command exists'
);
select has_function(
  'public',
  'get_my_dog_friendliness_rating',
  array['uuid'],
  'Member own-Rating read exists'
);
select has_function(
  'public',
  'get_dog_friendliness_summary',
  array['uuid'],
  'Public Summary read exists'
);
select has_function(
  'public',
  'exclude_dog_friendliness_rating',
  array['uuid', 'uuid', 'text', 'text', 'uuid'],
  'Moderator exclusion command exists'
);
select has_function(
  'public',
  'reinstate_dog_friendliness_rating',
  array['uuid', 'uuid', 'text', 'uuid'],
  'Moderator reinstatement command exists'
);
select has_function(
  'public',
  'configure_dog_friendliness_summary_policy',
  array['text', 'integer', 'integer', 'boolean'],
  'Service-role-only policy configuration exists'
);
select has_function(
  'public',
  'list_moderation_dog_friendliness_ratings',
  array['uuid'],
  'Moderator-only unaggregated Rating listing exists'
);

-- Privilege boundaries ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'private.dog_friendliness_ratings', 'select,insert,update,delete'),
  'Visitors cannot inspect or mutate Rating rows'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'private.dog_friendliness_ratings',
    'select,insert,update,delete'
  ),
  'Members cannot bypass caller-owned Rating RPCs'
);
select ok(
  not has_table_privilege(
    'service_role',
    'private.dog_friendliness_ratings',
    'select,insert,update,delete'
  ),
  'The service role cannot use Rating rows as an unrestricted query surface'
);
select ok(
  not has_function_privilege('anon', 'public.submit_dog_friendliness_rating(uuid,integer,integer,integer,integer,uuid,boolean,text,text)', 'execute'),
  'Visitors cannot submit Ratings'
);
select ok(
  has_function_privilege('authenticated', 'public.submit_dog_friendliness_rating(uuid,integer,integer,integer,integer,uuid,boolean,text,text)', 'execute'),
  'Authenticated callers can attempt to submit a Rating'
);
select ok(
  has_function_privilege('anon', 'public.get_dog_friendliness_summary(uuid)', 'execute'),
  'Visitors can read the public Summary'
);
select ok(
  not has_function_privilege('authenticated', 'public.configure_dog_friendliness_summary_policy(text,integer,integer,boolean)', 'execute'),
  'Members cannot configure the Summary policy'
);
select ok(
  not has_function_privilege('service_role', 'public.configure_dog_friendliness_summary_policy(text,integer,integer,boolean)', 'execute') = false,
  'The service role can configure the Summary policy'
);

-- Table-level integrity, bypassing the RPC boundary -----------------------------------------------

select ok(
  not exists (
    select 1
    from pg_constraint
    where conrelid = 'private.dog_friendliness_ratings'::regclass
      and conname = 'dog_friendliness_rating_has_dimension_check'
  ),
  'Optional categories may all remain null when overall is present'
);

-- Fixture identities -------------------------------------------------------------------------------

insert into auth.users (id)
values
  ('78000000-0000-4000-8000-000000000001'),
  ('78000000-0000-4000-8000-000000000002'),
  ('78000000-0000-4000-8000-000000000003'),
  ('78000000-0000-4000-8000-000000000004'),
  ('78000000-0000-4000-8000-000000000005'),
  ('78000000-0000-4000-8000-000000000006'),
  ('78000000-0000-4000-8000-000000000007'),
  ('78000000-0000-4000-8000-000000000008'),
  ('78000000-0000-4000-8000-000000000009'),
  ('78000000-0000-4000-8000-00000000000a'),
  ('78000000-0000-4000-8000-00000000000b'),
  ('78000000-0000-4000-8000-00000000000c'),
  ('78000000-0000-4000-8000-00000000000d');

insert into private.member_accounts (user_id)
values
  ('78000000-0000-4000-8000-000000000001'),
  ('78000000-0000-4000-8000-000000000002'),
  ('78000000-0000-4000-8000-000000000003'),
  ('78000000-0000-4000-8000-000000000004'),
  ('78000000-0000-4000-8000-000000000005'),
  ('78000000-0000-4000-8000-000000000006'),
  ('78000000-0000-4000-8000-000000000009'),
  ('78000000-0000-4000-8000-00000000000a'),
  ('78000000-0000-4000-8000-00000000000b'),
  ('78000000-0000-4000-8000-00000000000c'),
  ('78000000-0000-4000-8000-00000000000d');

insert into security.role_grants (user_id, role)
values
  ('78000000-0000-4000-8000-000000000001', 'member'),
  ('78000000-0000-4000-8000-000000000002', 'member'),
  ('78000000-0000-4000-8000-000000000003', 'member'),
  ('78000000-0000-4000-8000-000000000004', 'member'),
  ('78000000-0000-4000-8000-000000000005', 'member'),
  ('78000000-0000-4000-8000-000000000006', 'member'),
  ('78000000-0000-4000-8000-000000000007', 'moderator'),
  ('78000000-0000-4000-8000-000000000008', 'venue_representative'),
  ('78000000-0000-4000-8000-000000000009', 'member'),
  ('78000000-0000-4000-8000-00000000000a', 'member'),
  ('78000000-0000-4000-8000-00000000000b', 'member'),
  ('78000000-0000-4000-8000-00000000000c', 'member'),
  ('78000000-0000-4000-8000-00000000000d', 'member');

-- A second published+verified Place, isolated from the shared seeded fixture, for the
-- "every Rating marks a different Dimension N/A" aggregate.
insert into private.operators (id, name) values
  ('11000000-0000-4000-8000-000000000001', 'Rating fixture operator');
insert into private.locations (id, address_line, locality, postal_code, municipality, latitude, longitude)
values
  ('21000000-0000-4000-8000-000000000001', 'Einkunnagata 1', 'Reykjavík', '101', 'reykjavik', 64.15, -21.95);
insert into private.places (id, operator_id, location_id, purpose, lifecycle, category, version, published_at)
values
  (
    '31000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    'dog_access_destination', 'published', 'park', 1, '2026-01-01T00:00:00Z'
  );
insert into private.place_translations (place_id, locale, name, description) values
  ('31000000-0000-4000-8000-000000000001', 'is', 'Einkunnagarður', 'Lýsing.'),
  ('31000000-0000-4000-8000-000000000001', 'en', 'Rating Fixture Park', 'Description.');
insert into private.access_conditions (id, place_id, access_area, restraint_condition, permission_requirement)
values
  (
    '41000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001',
    'outdoors', 'off_leash_permitted', 'standing_permission'
  );
insert into private.evidence (id, place_id, kind, source_url, source_label, observed_at) values
  (
    '51000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001',
    'official_website', 'https://example.invalid/rating-fixture-park', 'Official site', '2026-01-01T00:00:00Z'
  );
insert into private.verifications (id, access_condition_id, status, verified_at, freshness_until) values
  (
    '61000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001',
    'verified', '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z'
  );
insert into private.verification_evidence (verification_id, evidence_id) values
  ('61000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001');

-- A third published+verified Place, isolated again, for the fractional-mean rounding aggregate.
insert into private.operators (id, name) values
  ('11000000-0000-4000-8000-000000000002', 'Rounding fixture operator');
insert into private.locations (id, address_line, locality, postal_code, municipality, latitude, longitude)
values
  ('21000000-0000-4000-8000-000000000002', 'Einkunnagata 2', 'Reykjavík', '101', 'reykjavik', 64.151, -21.951);
insert into private.places (id, operator_id, location_id, purpose, lifecycle, category, version, published_at)
values
  (
    '31000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000002',
    'dog_access_destination', 'published', 'cafe', 1, '2026-01-01T00:00:00Z'
  );
insert into private.place_translations (place_id, locale, name, description) values
  ('31000000-0000-4000-8000-000000000002', 'is', 'Námundunarkaffi', 'Lýsing.'),
  ('31000000-0000-4000-8000-000000000002', 'en', 'Rounding Fixture Cafe', 'Description.');
insert into private.access_conditions (id, place_id, access_area, restraint_condition, permission_requirement)
values
  (
    '41000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002',
    'indoors', 'leash_required', 'standing_permission'
  );
insert into private.evidence (id, place_id, kind, source_url, source_label, observed_at) values
  (
    '51000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002',
    'official_website', 'https://example.invalid/rounding-fixture-cafe', 'Official site', '2026-01-01T00:00:00Z'
  );
insert into private.verifications (id, access_condition_id, status, verified_at, freshness_until) values
  (
    '61000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000002',
    'verified', '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z'
  );
insert into private.verification_evidence (verification_id, evidence_id) values
  ('61000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002');

-- Validation, discoverability, and denial ------------------------------------------------------

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select throws_ok(
  $$select * from public.submit_dog_friendliness_rating(
    '30000000-0000-4000-8000-000000000003', 6, null, null, null, gen_random_uuid()
  )$$,
  '22023',
  'Welcome score must be between 1 and 5',
  'An out-of-range score is rejected'
);
select throws_ok(
  $$select * from public.submit_dog_friendliness_rating(
    '30000000-0000-4000-8000-000000000003', null, null, null, null, gen_random_uuid()
  )$$,
  '22023',
  'At least one Dimension must be scored',
  'A Rating with every Dimension N/A is rejected'
);
select throws_ok(
  $$select * from public.submit_dog_friendliness_rating(
    '30000000-0000-4000-8000-000000000001', 4, 4, 4, 4, gen_random_uuid()
  )$$,
  '22023',
  'Ratable Place required',
  'A Candidate Place cannot be rated'
);

reset role;
select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000008', true);
set local role authenticated;

select throws_ok(
  $$select * from public.submit_dog_friendliness_rating(
    '30000000-0000-4000-8000-000000000003', 4, 4, 4, 4, gen_random_uuid()
  )$$,
  '42501',
  'Member activation required',
  'A Venue Representative without Member activation cannot submit a Rating'
);
select throws_ok(
  $$select * from public.exclude_dog_friendliness_rating(
    '78000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
    'fraud', 'test', gen_random_uuid()
  )$$,
  '42501',
  'Moderator role required',
  'A Venue Representative cannot exclude a Rating'
);
select throws_ok(
  $$select * from public.reinstate_dog_friendliness_rating(
    '78000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
    'test', gen_random_uuid()
  )$$,
  '42501',
  'Moderator role required',
  'A Venue Representative cannot reinstate a Rating'
);

reset role;
set local role anon;

select throws_ok(
  $$select * from public.submit_dog_friendliness_rating(
    '30000000-0000-4000-8000-000000000003', 4, 4, 4, 4, gen_random_uuid()
  )$$,
  '42501',
  null,
  'A Visitor cannot submit a Rating'
);
select throws_ok(
  $$select * from public.get_my_dog_friendliness_rating('30000000-0000-4000-8000-000000000003')$$,
  '42501',
  null,
  'A Visitor cannot read a private Rating'
);
select lives_ok(
  $$select * from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003')$$,
  'A Visitor can read the public Summary endpoint'
);

reset role;

-- Fail-closed default: no policy row yet ---------------------------------------------------------

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (
    select welcome_score from public.submit_dog_friendliness_rating(
      '30000000-0000-4000-8000-000000000003', 3, null, 5, 4, '90000000-0000-4000-8000-000000000001'
    )
  ),
  3::integer,
  'Member 1 first Rating is stored (Clarity marked N/A)'
);

reset role;
select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (
    select welcome_score from public.submit_dog_friendliness_rating(
      '30000000-0000-4000-8000-000000000003', 4, 5, 3, 2, '90000000-0000-4000-8000-000000000002'
    )
  ),
  4::integer,
  'Member 2 first Rating is stored'
);

reset role;

select is(
  (select summary_visible from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003')),
  false,
  'The public Summary stays hidden with no policy configured, even with an eligible cohort'
);

-- Policy configuration ----------------------------------------------------------------------------

set local role service_role;

select throws_ok(
  $$select public.configure_dog_friendliness_summary_policy('', 2, 31536000, true)$$,
  '22023',
  'Dog-Friendliness summary policy version is required',
  'A blank policy version is rejected'
);
select throws_ok(
  $$select public.configure_dog_friendliness_summary_policy('e2e-v1', 0, 31536000, true)$$,
  '22023',
  'Dog-Friendliness summary policy threshold is invalid',
  'A non-positive threshold is rejected'
);
select throws_ok(
  $$select public.configure_dog_friendliness_summary_policy('e2e-v1', 2, 0, true)$$,
  '22023',
  'Dog-Friendliness summary policy recency window is invalid',
  'A non-positive recency window is rejected'
);
select lives_ok(
  $$select public.configure_dog_friendliness_summary_policy('e2e-v1', 2, 31536000, false)$$,
  'The policy can be configured while disabled'
);

reset role;

select is(
  (select summary_visible from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003')),
  false,
  'The public Summary stays hidden while the policy is configured but disabled'
);

set local role service_role;
select lives_ok(
  $$select public.configure_dog_friendliness_summary_policy('e2e-v1', 2, 31536000, true)$$,
  'The policy can be enabled with a fixture threshold of 2'
);
reset role;

-- Idempotent replay and update --------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (
    select welcome_score from public.submit_dog_friendliness_rating(
      '30000000-0000-4000-8000-000000000003', 3, null, 5, 4, '90000000-0000-4000-8000-000000000001'
    )
  ),
  3::integer,
  'Replaying the same request id is idempotent'
);

reset role;
select is(
  (
    select count(*)::bigint
    from private.dog_friendliness_rating_events as event
    where event.member_id = '78000000-0000-4000-8000-000000000001'
      and event.place_id = '30000000-0000-4000-8000-000000000003'
  ),
  1::bigint,
  'A replayed identical request id does not append a duplicate event'
);
select is(
  (
    select rating.rated_at
    from private.dog_friendliness_ratings as rating
    where rating.member_id = '78000000-0000-4000-8000-000000000001'
      and rating.place_id = '30000000-0000-4000-8000-000000000003'
  ),
  (
    select event.occurred_at
    from private.dog_friendliness_rating_events as event
    where event.member_id = '78000000-0000-4000-8000-000000000001'
      and event.place_id = '30000000-0000-4000-8000-000000000003'
      and event.request_id = '90000000-0000-4000-8000-000000000001'
  ),
  'An idempotent replay never bumps rated_at, so the recency context is not nudged'
);

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  (
    select welcome_score from public.submit_dog_friendliness_rating(
      '30000000-0000-4000-8000-000000000003', 2, null, 5, 4, '90000000-0000-4000-8000-000000000003'
    )
  ),
  2::integer,
  'A genuine resubmission with a new request id updates the current Rating'
);
select throws_ok(
  $$select * from public.submit_dog_friendliness_rating(
    '30000000-0000-4000-8000-000000000003', 3, null, 5, 4, '90000000-0000-4000-8000-000000000001'
  )$$,
  '55006',
  'Rating request identifier was already used',
  'A stale submit request id replayed after a later update conflicts instead of silently mutating'
);

reset role;
select is(
  (
    select count(*)::bigint
    from private.dog_friendliness_rating_events as event
    where event.member_id = '78000000-0000-4000-8000-000000000001'
      and event.place_id = '30000000-0000-4000-8000-000000000003'
  ),
  2::bigint,
  'The genuine resubmission appends exactly one more event (submitted, updated)'
);
select is(
  (
    select event_kind from private.dog_friendliness_rating_events as event
    where event.member_id = '78000000-0000-4000-8000-000000000001'
      and event.place_id = '30000000-0000-4000-8000-000000000003'
    order by event.occurred_at desc
    limit 1
  ),
  'updated',
  'The second event is recorded as an update, not a fresh submission'
);
select is(
  (
    select count(*)::bigint from private.dog_friendliness_ratings as rating
    where rating.member_id = '78000000-0000-4000-8000-000000000001'
      and rating.place_id = '30000000-0000-4000-8000-000000000003'
  ),
  1::bigint,
  'Resubmitting never double-counts: exactly one current row per Member and Place'
);
select throws_ok(
  $$insert into private.dog_friendliness_ratings (member_id, place_id, overall_score, welcome_score, last_request_id)
    values ('78000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 4, 4, gen_random_uuid())$$,
  '23505',
  null,
  'The database itself enforces one current Rating per Member and Place'
);

-- Threshold crossing and dimension-level gating (Member 1 final: 2, null, 5, 4; Member 2: 4, 5, 3, 2) --

select is(
  (select summary_visible from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003')),
  true,
  'The public Summary becomes visible once the eligible cohort reaches the configured threshold'
);
select is(
  (select eligible_count from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003')),
  2,
  'The eligible Rating count is exposed once visible'
);
select is(
  (select trailing_twelve_month_count from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003')),
  2,
  'Both fresh Ratings count toward the trailing twelve month context'
);
select is(
  (select jsonb_array_length(dimensions) from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003')),
  3,
  'Clarity falls below the per-Dimension threshold (only Member 2 scored it) and is excluded from the response'
);
select ok(
  not exists (
    select 1
    from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003') as summary,
      jsonb_array_elements(summary.dimensions) as dim
    where dim ->> 'dimension' = 'clarity'
  ),
  'A sub-threshold Dimension never appears in the public response, even as a hidden zero'
);
select is(
  (
    select (dim ->> 'mean')::numeric
    from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003') as summary,
      jsonb_array_elements(summary.dimensions) as dim
    where dim ->> 'dimension' = 'welcome'
  ),
  3.0,
  'Welcome mean (2 and 4) is exactly 3.0'
);
select is(
  (
    select (dim ->> 'mean')::numeric
    from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003') as summary,
      jsonb_array_elements(summary.dimensions) as dim
    where dim ->> 'dimension' = 'comfort'
  ),
  4.0,
  'Comfort mean (5 and 3) is exactly 4.0'
);
select is(
  (select overall_visible from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003')),
  true,
  'At least two qualifying Dimensions produce a visible overall result'
);
select is(
  (select overall_mean from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003')),
  3.0,
  'The explicit overall scores are averaged independently of optional Dimensions'
);

-- "Every Rating marks a different Dimension N/A" (fresh fixture Place, Members 3-6) --------------

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select public.submit_dog_friendliness_rating(
  '31000000-0000-4000-8000-000000000001', null, 4, 4, 4, gen_random_uuid()
);
reset role;

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select public.submit_dog_friendliness_rating(
  '31000000-0000-4000-8000-000000000001', 4, null, 4, 4, gen_random_uuid()
);
reset role;

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000005', true);
set local role authenticated;
select public.submit_dog_friendliness_rating(
  '31000000-0000-4000-8000-000000000001', 4, 4, null, 4, gen_random_uuid()
);
reset role;

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000006', true);
set local role authenticated;
select public.submit_dog_friendliness_rating(
  '31000000-0000-4000-8000-000000000001', 4, 4, 4, null, gen_random_uuid()
);
reset role;

select is(
  (select jsonb_array_length(dimensions) from public.get_dog_friendliness_summary('31000000-0000-4000-8000-000000000001')),
  4,
  'All four Dimensions individually meet the threshold despite each Rating leaving a different one N/A'
);
select is(
  (
    select (dim ->> 'applicableCount')::integer
    from public.get_dog_friendliness_summary('31000000-0000-4000-8000-000000000001') as summary,
      jsonb_array_elements(summary.dimensions) as dim
    where dim ->> 'dimension' = 'welcome'
  ),
  3,
  'Welcome applicable count is three: one of the four Members left it N/A'
);
select is(
  (select overall_mean from public.get_dog_friendliness_summary('31000000-0000-4000-8000-000000000001')),
  4.0,
  'Every qualifying Dimension mean is exactly 4.0, so the overall is exactly 4.0'
);

-- Single display rounding of fractional raw means (Members 9-13, fresh fixture Place) -------------
-- Welcome raw mean 14/5 = 2.8 and Comfort raw mean 17/5 = 3.4. Per the public-rating-summary policy the overall
-- averages the RAW means once: (2.8 + 3.4) / 2 = 3.1, rounded once to 3.0. Averaging the rounded
-- display values instead (3.0 and 3.5) would double-round to 3.5, so this case distinguishes
-- single from double rounding.

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000009', true);
set local role authenticated;
select public.submit_dog_friendliness_rating(
  '31000000-0000-4000-8000-000000000002', 2, null, 3, null, gen_random_uuid()
);
reset role;

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-00000000000a', true);
set local role authenticated;
select public.submit_dog_friendliness_rating(
  '31000000-0000-4000-8000-000000000002', 3, null, 3, null, gen_random_uuid()
);
reset role;

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-00000000000b', true);
set local role authenticated;
select public.submit_dog_friendliness_rating(
  '31000000-0000-4000-8000-000000000002', 3, null, 3, null, gen_random_uuid()
);
reset role;

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-00000000000c', true);
set local role authenticated;
select public.submit_dog_friendliness_rating(
  '31000000-0000-4000-8000-000000000002', 3, null, 4, null, gen_random_uuid()
);
reset role;

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-00000000000d', true);
set local role authenticated;
select public.submit_dog_friendliness_rating(
  '31000000-0000-4000-8000-000000000002', 3, null, 4, null, gen_random_uuid()
);
reset role;

select is(
  (
    select (dim ->> 'mean')::numeric
    from public.get_dog_friendliness_summary('31000000-0000-4000-8000-000000000002') as summary,
      jsonb_array_elements(summary.dimensions) as dim
    where dim ->> 'dimension' = 'welcome'
  ),
  3.0,
  'The Welcome display mean rounds the raw 2.8 once to 3.0'
);
select is(
  (
    select (dim ->> 'mean')::numeric
    from public.get_dog_friendliness_summary('31000000-0000-4000-8000-000000000002') as summary,
      jsonb_array_elements(summary.dimensions) as dim
    where dim ->> 'dimension' = 'comfort'
  ),
  3.5,
  'The Comfort display mean rounds the raw 3.4 once to 3.5'
);
select is(
  (select overall_mean from public.get_dog_friendliness_summary('31000000-0000-4000-8000-000000000002')),
  3.0,
  'The overall averages the RAW Dimension means and rounds once: (2.8 + 3.4) / 2 = 3.1 -> 3.0, never the double-rounded 3.5'
);

-- Moderator exclusion drops the cohort back below threshold, hiding immediately -------------------

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000007', true);
set local role authenticated;

select is(
  (
    select excluded_at is not null from public.exclude_dog_friendliness_rating(
      '78000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
      'fraud', 'Duplicate account signal', '91000000-0000-4000-8000-000000000001'
    )
  ),
  true,
  'A Moderator can exclude a Rating for fraud with an auditable reason'
);
select throws_ok(
  $$select * from public.exclude_dog_friendliness_rating(
    '78000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
    'fraud', 'Duplicate account signal', gen_random_uuid()
  )$$,
  '55006',
  'Rating is already excluded',
  'Excluding an already-excluded Rating under a new request id conflicts'
);
select is(
  (
    select excluded_at from public.exclude_dog_friendliness_rating(
      '78000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
      'fraud', 'Duplicate account signal', '91000000-0000-4000-8000-000000000001'
    )
  ) is not null,
  true,
  'Replaying the exact same exclusion request id is idempotent'
);

reset role;

select is(
  (select summary_visible from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003')),
  false,
  'Excluding one eligible Rating immediately hides the Summary once below threshold, with no freeze'
);

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok(
  $$select * from public.exclude_dog_friendliness_rating(
    '78000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
    'fraud', 'test', gen_random_uuid()
  )$$,
  '42501',
  'Moderator role required',
  'A Member cannot exclude a Rating'
);
reset role;

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000007', true);
set local role authenticated;

select throws_ok(
  $$select * from public.reinstate_dog_friendliness_rating(
    '78000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003',
    'Never was excluded', gen_random_uuid()
  )$$,
  '55006',
  'Rating is not excluded',
  'Reinstating a Rating that was never excluded conflicts'
);
select is(
  (
    select id is not null from public.reinstate_dog_friendliness_rating(
      '78000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
      'Investigation cleared the account', '92000000-0000-4000-8000-000000000001'
    )
  ),
  true,
  'A Moderator can reinstate a wrongly excluded Rating'
);
select lives_ok(
  $$select * from public.reinstate_dog_friendliness_rating(
    '78000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
    'Investigation cleared the account', '92000000-0000-4000-8000-000000000001'
  )$$,
  'Replaying the exact same reinstatement request id is idempotent'
);

-- Stale-request replay guards: a request identifier that already produced an event must never
-- mutate state again, in either direction.
select lives_ok(
  $$select * from public.exclude_dog_friendliness_rating(
    '78000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
    'abuse', 'Second investigation found coordinated activity', '91000000-0000-4000-8000-000000000002'
  )$$,
  'A Moderator can exclude the Rating again under a fresh request id'
);
select throws_ok(
  $$select * from public.reinstate_dog_friendliness_rating(
    '78000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
    'Investigation cleared the account', '92000000-0000-4000-8000-000000000001'
  )$$,
  '55006',
  'Reinstatement request identifier was already used',
  'A stale reinstatement replay after a newer exclusion conflicts instead of silently clearing it'
);

reset role;
select is(
  (
    select rating.excluded_at is not null
    from private.dog_friendliness_ratings as rating
    where rating.member_id = '78000000-0000-4000-8000-000000000001'
      and rating.place_id = '30000000-0000-4000-8000-000000000003'
  ),
  true,
  'The newer exclusion survives the stale reinstatement replay'
);
select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000007', true);
set local role authenticated;

select lives_ok(
  $$select * from public.reinstate_dog_friendliness_rating(
    '78000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
    'Coordinated-activity finding withdrawn', '92000000-0000-4000-8000-000000000002'
  )$$,
  'A fresh reinstatement request id still reinstates normally'
);
select throws_ok(
  $$select * from public.exclude_dog_friendliness_rating(
    '78000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
    'fraud', 'Duplicate account signal', '91000000-0000-4000-8000-000000000001'
  )$$,
  '55006',
  'Exclusion request identifier was already used',
  'A stale exclusion replay after a newer reinstatement conflicts instead of silently re-excluding'
);

reset role;

select is(
  (select summary_visible from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003')),
  true,
  'Reinstating the excluded Rating restores the Summary once the cohort meets threshold again'
);

-- Moderator-only unaggregated listing --------------------------------------------------------------

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000007', true);
set local role authenticated;

select is(
  (
    select count(*)::bigint from public.list_moderation_dog_friendliness_ratings(
      '30000000-0000-4000-8000-000000000003'
    )
  ),
  2::bigint,
  'The Moderator listing shows every current Rating for the Place, reinstated included'
);

reset role;
select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select throws_ok(
  $$select * from public.list_moderation_dog_friendliness_ratings(
    '30000000-0000-4000-8000-000000000003'
  )$$,
  '42501',
  'Moderator role required',
  'A Member cannot list Ratings for moderation'
);
reset role;

set local role anon;
select throws_ok(
  $$select * from public.list_moderation_dog_friendliness_ratings(
    '30000000-0000-4000-8000-000000000003'
  )$$,
  '42501',
  null,
  'A Visitor cannot list Ratings for moderation'
);
reset role;

-- Only the rolling twelve-month cohort can cross the privacy threshold ----------------------------

update private.dog_friendliness_ratings
set rated_at = statement_timestamp() - interval '13 months'
where member_id = '78000000-0000-4000-8000-000000000002'
  and place_id = '30000000-0000-4000-8000-000000000003';

select is(
  (select eligible_count from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003')),
  null,
  'A very old Rating cannot count toward the current eligible threshold'
);
select is(
  (select trailing_twelve_month_count from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003')),
  null,
  'Below-threshold public responses leak neither the recent count nor an aggregate value'
);

-- Place inactivity hides the Summary and blocks further submission -------------------------------

update private.places set lifecycle = 'inactive' where id = '30000000-0000-4000-8000-000000000003';

select is(
  (select summary_visible from public.get_dog_friendliness_summary('30000000-0000-4000-8000-000000000003')),
  false,
  'An Inactive Place hides the Summary regardless of eligible count'
);

select set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok(
  $$select * from public.submit_dog_friendliness_rating(
    '30000000-0000-4000-8000-000000000003', 5, 5, 5, 5, gen_random_uuid()
  )$$,
  '22023',
  'Ratable Place required',
  'A Member cannot rate or edit a Rating on an Inactive Place'
);
select is(
  (select excluded from public.get_my_dog_friendliness_rating('30000000-0000-4000-8000-000000000003')),
  false,
  'A Member retains their own prior Rating even after the Place becomes Inactive'
);
reset role;

select * from finish();

rollback;
