begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_function(
  'private',
  'credit_spaced_member_places',
  array['uuid', 'timestamp with time zone', 'integer', 'timestamp with time zone'],
  'Impact and Achievement exploration share one anti-burst credit primitive'
);
select has_function(
  'public',
  'get_my_impact_record',
  array['text'],
  'Members have one caller-owned private impact projection'
);

select ok(
  has_function_privilege('authenticated', 'public.get_my_impact_record(text)', 'execute')
  and not has_function_privilege('anon', 'public.get_my_impact_record(text)', 'execute')
  and not has_function_privilege('service_role', 'public.get_my_impact_record(text)', 'execute'),
  'Only authenticated Members can read their private impact record'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.credit_spaced_member_places(uuid,timestamp with time zone,integer,timestamp with time zone)',
    'execute'
  ),
  'Members cannot invoke the private anti-burst primitive directly'
);
select ok(
  position(
    'points'
    in lower(pg_get_functiondef('public.get_my_impact_record(text)'::regprocedure))
  ) = 0
  and position(
    'leaderboard'
    in lower(pg_get_functiondef('public.get_my_impact_record(text)'::regprocedure))
  ) = 0,
  'The impact projection does not introduce a points or comparison model'
);

insert into auth.users (id, email)
values
  ('94800000-0000-4000-8000-000000000001', 'impact-one@example.invalid'),
  ('94800000-0000-4000-8000-000000000002', 'impact-two@example.invalid'),
  ('94800000-0000-4000-8000-000000000003', 'impact-moderator@example.invalid');

insert into private.member_accounts (user_id, created_at)
values
  ('94800000-0000-4000-8000-000000000001', '2026-01-01T12:00:00Z'),
  ('94800000-0000-4000-8000-000000000002', '2026-02-01T12:00:00Z');

insert into security.role_grants (user_id, role)
values
  ('94800000-0000-4000-8000-000000000001', 'member'),
  ('94800000-0000-4000-8000-000000000002', 'member'),
  ('94800000-0000-4000-8000-000000000003', 'moderator');

insert into private.operators (id, name)
values ('94810000-0000-4000-8000-000000000001', 'Impact fixture operator');

insert into private.locations (
  id,
  address_line,
  locality,
  postal_code,
  municipality,
  latitude,
  longitude,
  geometry_precision,
  geometry_source
)
values
  (
    '94820000-0000-4000-8000-000000000001',
    'Áhrifagata 1',
    'Reykjavík',
    '101',
    'reykjavik',
    64.1466,
    -21.9426,
    'moderator_confirmed_point',
    'Impact fixture'
  ),
  (
    '94820000-0000-4000-8000-000000000002',
    'Áhrifagata 2',
    'Reykjavík',
    '102',
    'reykjavik',
    64.1467,
    -21.9427,
    'moderator_confirmed_point',
    'Impact fixture'
  ),
  (
    '94820000-0000-4000-8000-000000000003',
    'Áhrifagata 3',
    'Kópavogur',
    '200',
    'kopavogur',
    64.111,
    -21.91,
    'moderator_confirmed_point',
    'Impact fixture'
  ),
  (
    '94820000-0000-4000-8000-000000000004',
    'Áhrifagata 4',
    'Kópavogur',
    '201',
    'kopavogur',
    64.112,
    -21.911,
    'moderator_confirmed_point',
    'Impact fixture'
  );

insert into private.places (
  id,
  operator_id,
  location_id,
  purpose,
  lifecycle,
  category,
  version,
  published_at
)
values
  (
    '94830000-0000-4000-8000-000000000001',
    '94810000-0000-4000-8000-000000000001',
    '94820000-0000-4000-8000-000000000001',
    'impact_cafe',
    'published',
    'cafe',
    1,
    '2026-01-01T00:00:00Z'
  ),
  (
    '94830000-0000-4000-8000-000000000002',
    '94810000-0000-4000-8000-000000000001',
    '94820000-0000-4000-8000-000000000002',
    'impact_shop',
    'inactive',
    'shop',
    2,
    '2026-01-01T00:00:00Z'
  ),
  (
    '94830000-0000-4000-8000-000000000003',
    '94810000-0000-4000-8000-000000000001',
    '94820000-0000-4000-8000-000000000003',
    'impact_park',
    'published',
    'park',
    1,
    '2026-01-01T00:00:00Z'
  ),
  (
    '94830000-0000-4000-8000-000000000004',
    '94810000-0000-4000-8000-000000000001',
    '94820000-0000-4000-8000-000000000004',
    'impact_successor',
    'published',
    'shop',
    1,
    '2026-01-01T00:00:00Z'
  );

insert into private.place_translations (place_id, locale, name, description)
values
  (
    '94830000-0000-4000-8000-000000000001',
    'is',
    'Áhrifakaffi',
    'Prófunarstaður fyrir áhrif.'
  ),
  (
    '94830000-0000-4000-8000-000000000001',
    'en',
    'Impact Cafe',
    'Impact record fixture.'
  ),
  (
    '94830000-0000-4000-8000-000000000002',
    'is',
    'Gamla búðin',
    'Óvirkur prófunarstaður.'
  ),
  (
    '94830000-0000-4000-8000-000000000002',
    'en',
    'Old Shop',
    'Inactive impact fixture.'
  ),
  (
    '94830000-0000-4000-8000-000000000003',
    'is',
    'Áhrifagarður',
    'Prófunargarður fyrir áhrif.'
  ),
  (
    '94830000-0000-4000-8000-000000000003',
    'en',
    'Impact Park',
    'Impact park fixture.'
  ),
  (
    '94830000-0000-4000-8000-000000000004',
    'is',
    'Nýja búðin',
    'Arftaki prófunarstaðar.'
  ),
  (
    '94830000-0000-4000-8000-000000000004',
    'en',
    'New Shop',
    'Successor impact fixture.'
  );

insert into private.place_identity_transitions (
  id,
  predecessor_place_id,
  successor_place_id,
  kind,
  predecessor_version,
  request_id,
  decided_by,
  decided_at,
  decision_notes
)
values (
  '94840000-0000-4000-8000-000000000001',
  '94830000-0000-4000-8000-000000000002',
  '94830000-0000-4000-8000-000000000004',
  'move',
  1,
  '94840000-0000-4000-8000-000000000002',
  '94800000-0000-4000-8000-000000000003',
  '2026-06-01T12:00:00Z',
  'The fixture shop moved.'
);

insert into private.check_ins (
  id,
  member_id,
  place_id,
  proximity_confirmed,
  request_id,
  checked_in_at
)
values
  (
    '94850000-0000-4000-8000-000000000001',
    '94800000-0000-4000-8000-000000000001',
    '94830000-0000-4000-8000-000000000001',
    'unknown',
    '94850000-0000-4000-8000-000000000011',
    '2026-06-01T10:00:00Z'
  ),
  (
    '94850000-0000-4000-8000-000000000002',
    '94800000-0000-4000-8000-000000000001',
    '94830000-0000-4000-8000-000000000002',
    'unknown',
    '94850000-0000-4000-8000-000000000012',
    '2026-06-01T10:05:00Z'
  ),
  (
    '94850000-0000-4000-8000-000000000003',
    '94800000-0000-4000-8000-000000000001',
    '94830000-0000-4000-8000-000000000003',
    'unknown',
    '94850000-0000-4000-8000-000000000013',
    '2026-06-01T10:20:00Z'
  );

insert into private.dog_friendliness_ratings (
  id,
  member_id,
  place_id,
  overall_score,
  last_request_id,
  rated_at
)
values
  (
    '94860000-0000-4000-8000-000000000001',
    '94800000-0000-4000-8000-000000000001',
    '94830000-0000-4000-8000-000000000001',
    5,
    '94860000-0000-4000-8000-000000000011',
    '2026-06-08T12:00:00Z'
  ),
  (
    '94860000-0000-4000-8000-000000000002',
    '94800000-0000-4000-8000-000000000001',
    '94830000-0000-4000-8000-000000000003',
    2,
    '94860000-0000-4000-8000-000000000012',
    '2026-06-08T12:05:00Z'
  );

update private.dog_friendliness_ratings
set
  excluded_at = '2026-06-09T12:00:00Z',
  excluded_by = '94800000-0000-4000-8000-000000000003',
  excluded_reason = 'Fixture exclusion',
  excluded_kind = 'duplication',
  exclusion_request_id = '94860000-0000-4000-8000-000000000013'
where id = '94860000-0000-4000-8000-000000000002';

insert into private.dog_friendliness_rating_events (
  id,
  member_id,
  place_id,
  event_kind,
  overall_score,
  actor_id,
  request_id,
  occurred_at
)
values (
  '94861000-0000-4000-8000-000000000001',
  '94800000-0000-4000-8000-000000000001',
  '94830000-0000-4000-8000-000000000001',
  'submitted',
  5,
  '94800000-0000-4000-8000-000000000001',
  '94861000-0000-4000-8000-000000000011',
  '2026-06-08T12:00:00Z'
);

insert into private.place_suggestions (
  id,
  member_id,
  request_id,
  proposal,
  status,
  candidate_place_id,
  duplicate_place_id,
  reviewed_proposal,
  resolution_request_id,
  submitted_at,
  resolved_at,
  updated_at
)
values
  (
    '94870000-0000-4000-8000-000000000001',
    '94800000-0000-4000-8000-000000000001',
    '94870000-0000-4000-8000-000000000011',
    '{}',
    'accepted',
    '94830000-0000-4000-8000-000000000001',
    null,
    '{}',
    '94870000-0000-4000-8000-000000000021',
    '2026-06-10T09:00:00Z',
    '2026-06-11T09:00:00Z',
    '2026-06-11T09:00:00Z'
  ),
  (
    '94870000-0000-4000-8000-000000000002',
    '94800000-0000-4000-8000-000000000001',
    '94870000-0000-4000-8000-000000000012',
    '{}',
    'accepted',
    '94830000-0000-4000-8000-000000000002',
    null,
    '{}',
    '94870000-0000-4000-8000-000000000022',
    '2026-06-12T09:00:00Z',
    '2026-06-13T09:00:00Z',
    '2026-06-13T09:00:00Z'
  ),
  (
    '94870000-0000-4000-8000-000000000003',
    '94800000-0000-4000-8000-000000000001',
    '94870000-0000-4000-8000-000000000013',
    '{}',
    'rejected',
    null,
    null,
    null,
    '94870000-0000-4000-8000-000000000023',
    '2026-06-14T09:00:00Z',
    '2026-06-15T09:00:00Z',
    '2026-06-15T09:00:00Z'
  ),
  (
    '94870000-0000-4000-8000-000000000004',
    '94800000-0000-4000-8000-000000000001',
    '94870000-0000-4000-8000-000000000014',
    '{}',
    'submitted',
    null,
    null,
    null,
    null,
    '2026-06-16T09:00:00Z',
    null,
    '2026-06-16T09:00:00Z'
  ),
  (
    '94870000-0000-4000-8000-000000000005',
    '94800000-0000-4000-8000-000000000001',
    '94870000-0000-4000-8000-000000000015',
    '{}',
    'duplicate',
    null,
    '94830000-0000-4000-8000-000000000001',
    null,
    '94870000-0000-4000-8000-000000000025',
    '2026-06-17T09:00:00Z',
    '2026-06-18T09:00:00Z',
    '2026-06-18T09:00:00Z'
  );

insert into private.contributions (
  id,
  suggestion_id,
  member_id,
  confirmed_by,
  confirmation_request_id,
  kind,
  confirmed_at,
  subject_place_id
)
values
  (
    '94880000-0000-4000-8000-000000000001',
    '94870000-0000-4000-8000-000000000001',
    '94800000-0000-4000-8000-000000000001',
    '94800000-0000-4000-8000-000000000003',
    '94880000-0000-4000-8000-000000000011',
    'accepted_suggestion',
    '2026-06-11T09:00:00Z',
    '94830000-0000-4000-8000-000000000001'
  ),
  (
    '94880000-0000-4000-8000-000000000002',
    '94870000-0000-4000-8000-000000000002',
    '94800000-0000-4000-8000-000000000001',
    '94800000-0000-4000-8000-000000000003',
    '94880000-0000-4000-8000-000000000012',
    'accepted_suggestion',
    '2026-06-13T09:00:00Z',
    '94830000-0000-4000-8000-000000000002'
  );

update private.contributions
set
  revoked_at = '2026-07-24T09:00:00Z',
  revoked_by = '94800000-0000-4000-8000-000000000003',
  revoked_reason = 'Fixture revocation',
  revocation_request_id = '94880000-0000-4000-8000-000000000013'
where id = '94880000-0000-4000-8000-000000000002';

select set_config(
  'request.jwt.claim.sub',
  '94800000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select is(
  (select member_since from public.get_my_impact_record('en')),
  '2026-01-01T12:00:00Z'::timestamptz,
  'The impact record uses the durable Member creation time'
);
select is(
  (select active_weeks from public.get_my_impact_record('en')),
  3,
  'Active weeks derive from normalized qualifying activity without a streak reset'
);
select is(
  (select active_months from public.get_my_impact_record('en')),
  1,
  'Sustained participation derives distinct active months'
);
select is(
  (select credited_places from public.get_my_impact_record('en')),
  2,
  'Rapid first Check-ins do not inflate credited distinct Places'
);
select is(
  (select credited_category_groups from public.get_my_impact_record('en')),
  2,
  'Category diversity derives only from credited Places'
);
select is(
  (select credited_municipalities from public.get_my_impact_record('en')),
  2,
  'Municipality diversity derives only from credited Places'
);
select is(
  (select valid_ratings from public.get_my_impact_record('en')),
  1,
  'Only current non-excluded Ratings count once'
);
select is(
  (select submissions_total from public.get_my_impact_record('en')),
  5,
  'Submission volume is reported separately from community impact'
);
select is(
  (select pending_submissions from public.get_my_impact_record('en')),
  1,
  'Pending submissions remain visibly pending'
);
select is(
  (select rejected_submissions from public.get_my_impact_record('en')),
  1,
  'Rejected submissions remain visibly rejected'
);
select is(
  (select resolved_without_contribution from public.get_my_impact_record('en')),
  1,
  'Resolved non-rejected work without a confirmed Contribution remains separate'
);
select is(
  (select confirmed_contributions from public.get_my_impact_record('en')),
  1,
  'Only confirmed non-revoked Contributions increase current impact'
);
select is(
  (select revoked_contributions from public.get_my_impact_record('en')),
  1,
  'Revoked Contributions remain an accurate separate history'
);

reset role;

insert into private.place_suggestions (
  id,
  member_id,
  request_id,
  proposal,
  status,
  candidate_place_id,
  reviewed_proposal,
  resolution_request_id,
  submitted_at,
  resolved_at,
  updated_at
)
select
  ('94870000-0000-4000-8000-' || lpad((series + 100)::text, 12, '0'))::uuid,
  '94800000-0000-4000-8000-000000000001'::uuid,
  ('94871000-0000-4000-8000-' || lpad((series + 100)::text, 12, '0'))::uuid,
  '{}'::jsonb,
  'accepted',
  '94830000-0000-4000-8000-000000000001'::uuid,
  '{}'::jsonb,
  ('94872000-0000-4000-8000-' || lpad((series + 100)::text, 12, '0'))::uuid,
  '2026-06-01T09:00:00Z'::timestamptz + make_interval(days => series),
  '2026-06-02T09:00:00Z'::timestamptz + make_interval(days => series),
  '2026-06-02T09:00:00Z'::timestamptz + make_interval(days => series)
from generate_series(1, 6) as series;

insert into private.contributions (
  id,
  suggestion_id,
  member_id,
  confirmed_by,
  confirmation_request_id,
  kind,
  confirmed_at,
  subject_place_id
)
select
  ('94880000-0000-4000-8000-' || lpad((series + 100)::text, 12, '0'))::uuid,
  ('94870000-0000-4000-8000-' || lpad((series + 100)::text, 12, '0'))::uuid,
  '94800000-0000-4000-8000-000000000001'::uuid,
  '94800000-0000-4000-8000-000000000003'::uuid,
  ('94881000-0000-4000-8000-' || lpad((series + 100)::text, 12, '0'))::uuid,
  'accepted_suggestion',
  '2026-06-10T09:00:00Z'::timestamptz + make_interval(days => series),
  '94830000-0000-4000-8000-000000000001'::uuid
from generate_series(1, 6) as series;

set local role authenticated;

select is(
  (select jsonb_array_length(recent_outcomes) from public.get_my_impact_record('en')),
  6,
  'The impact record returns a bounded concrete outcome history'
);
select is(
  (
    select recent_outcomes -> 0 ->> 'place_name'
    from public.get_my_impact_record('en')
  ),
  'Old Shop',
  'Outcome names follow the requested language'
);
select is(
  (
    select recent_outcomes -> 0 ->> 'availability'
    from public.get_my_impact_record('en')
  ),
  'inactive',
  'Inactive Contribution subjects remain understandable'
);
select is(
  (
    select recent_outcomes -> 0 ->> 'successor_name'
    from public.get_my_impact_record('en')
  ),
  'New Shop',
  'Inactive outcomes retain honest successor context'
);
select is(
  (
    select recent_outcomes -> 0 ->> 'state'
    from public.get_my_impact_record('en')
  ),
  'revoked',
  'A recent revocation outranks six later confirmations by its actual lifecycle time'
);
select throws_ok(
  $$ select * from public.get_my_impact_record(null) $$,
  '22023',
  null,
  'The private projection rejects an absent locale instead of returning ambiguous copy'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '94800000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;

select is(
  (select submissions_total from public.get_my_impact_record('is')),
  0,
  'A Member cannot see another Member''s submissions'
);
select is(
  (select confirmed_contributions from public.get_my_impact_record('is')),
  0,
  'A Member cannot see another Member''s confirmed impact'
);
select is(
  (select jsonb_array_length(recent_outcomes) from public.get_my_impact_record('is')),
  0,
  'A Member cannot see another Member''s contribution outcomes'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;

select throws_ok(
  $$ select * from public.get_my_impact_record('en') $$,
  '42501',
  null,
  'Anonymous callers cannot inspect a private impact record'
);

select * from finish();
rollback;
