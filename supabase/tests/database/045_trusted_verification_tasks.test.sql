begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_function(
  'public',
  'list_trusted_verification_tasks',
  array['text', 'integer'],
  'Trusted Contributors have one private task-list command'
);
select has_function(
  'public',
  'submit_trusted_verification_task',
  array['text', 'jsonb', 'jsonb', 'text', 'uuid'],
  'Trusted task evidence enters one idempotent submission command'
);
select has_function(
  'public',
  'list_my_trusted_verification_submissions',
  array['text', 'integer'],
  'Members retain a private Trusted Verification outcome history'
);
select has_function(
  'public',
  'get_my_trusted_verification_feedback',
  array[]::text[],
  'Confirmed Trusted Verification work has a caller-owned unread projection'
);
select has_trigger(
  'private',
  'place_flags',
  'place_flags_guard_superseded_trusted_verification',
  'Superseded Trusted Verification work is guarded at the moderation write boundary'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.list_trusted_verification_tasks(text,integer)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.list_trusted_verification_tasks(text,integer)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.list_trusted_verification_tasks(text,integer)',
    'execute'
  ),
  'Only authenticated callers can attempt to list Trusted Verification tasks'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'private.trusted_verification_submissions',
    'select'
  )
  and not has_table_privilege(
    'authenticated',
    'private.trusted_verification_feedback_receipts',
    'select'
  ),
  'Trusted Verification storage is never directly exposed to Members'
);
select ok(
  position(
    'leaderboard'
    in lower(pg_get_functiondef(
      'public.list_trusted_verification_tasks(text,integer)'::regprocedure
    ))
  ) = 0
  and position(
    'claim'
    in lower(pg_get_functiondef(
      'public.list_trusted_verification_tasks(text,integer)'::regprocedure
    ))
  ) = 0,
  'Task ordering introduces neither a leaderboard nor a public claim mechanic'
);

insert into auth.users (id, email)
values
  ('94900000-0000-4000-8000-000000000001', 'trusted-one@example.invalid'),
  ('94900000-0000-4000-8000-000000000002', 'trusted-two@example.invalid'),
  ('94900000-0000-4000-8000-000000000003', 'trusted-three@example.invalid'),
  ('94900000-0000-4000-8000-000000000004', 'ordinary@example.invalid'),
  ('94900000-0000-4000-8000-000000000005', 'moderator@example.invalid');

insert into private.member_accounts (user_id)
values
  ('94900000-0000-4000-8000-000000000001'),
  ('94900000-0000-4000-8000-000000000002'),
  ('94900000-0000-4000-8000-000000000003'),
  ('94900000-0000-4000-8000-000000000004');

insert into security.role_grants (user_id, role)
values
  ('94900000-0000-4000-8000-000000000001', 'member'),
  ('94900000-0000-4000-8000-000000000002', 'member'),
  ('94900000-0000-4000-8000-000000000003', 'member'),
  ('94900000-0000-4000-8000-000000000004', 'member'),
  ('94900000-0000-4000-8000-000000000005', 'moderator');

insert into private.operators (id, name)
values ('94910000-0000-4000-8000-000000000001', 'Trusted task fixture operator');

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
    '94920000-0000-4000-8000-000000000001',
    'Traustgata 1',
    'Reykjavík',
    '101',
    'reykjavik',
    64.1466,
    -21.9426,
    'moderator_confirmed_point',
    'Trusted task fixture'
  ),
  (
    '94920000-0000-4000-8000-000000000002',
    'Traustgata 2',
    'Kópavogur',
    '200',
    'kopavogur',
    64.111,
    -21.91,
    'moderator_confirmed_point',
    'Trusted task fixture'
  ),
  (
    '94920000-0000-4000-8000-000000000003',
    'Traustgata 3',
    'Reykjavík',
    '102',
    'reykjavik',
    64.1467,
    -21.9427,
    'moderator_confirmed_point',
    'Trusted task fixture'
  ),
  (
    '94920000-0000-4000-8000-000000000004',
    'Traustgata 4',
    'Garðabær',
    '210',
    'gardabaer',
    64.09,
    -21.9,
    'moderator_confirmed_point',
    'Trusted task fixture'
  );

insert into private.places (
  id,
  operator_id,
  location_id,
  purpose,
  lifecycle,
  category,
  dog_amenities,
  version,
  published_at
)
values
  (
    '94930000-0000-4000-8000-000000000001',
    '94910000-0000-4000-8000-000000000001',
    '94920000-0000-4000-8000-000000000001',
    'stale_access',
    'published',
    'cafe',
    '["water_bowl"]',
    3,
    statement_timestamp() - interval '1 year'
  ),
  (
    '94930000-0000-4000-8000-000000000002',
    '94910000-0000-4000-8000-000000000001',
    '94920000-0000-4000-8000-000000000002',
    'missing_amenities',
    'published',
    'park',
    '[]',
    5,
    statement_timestamp() - interval '1 year'
  ),
  (
    '94930000-0000-4000-8000-000000000003',
    '94910000-0000-4000-8000-000000000001',
    '94920000-0000-4000-8000-000000000003',
    'candidate_private',
    'candidate',
    'shop',
    '[]',
    1,
    null
  ),
  (
    '94930000-0000-4000-8000-000000000004',
    '94910000-0000-4000-8000-000000000001',
    '94920000-0000-4000-8000-000000000004',
    'trusted_history_subject',
    'published',
    'shop',
    '["water_bowl"]',
    1,
    statement_timestamp() - interval '1 year'
  );

insert into private.place_translations (place_id, locale, name, description)
select
  fixture.place_id,
  locale.value::private.locale_code,
  case locale.value
    when 'is' then fixture.name_is
    else fixture.name_en
  end,
  case locale.value
    when 'is' then 'Örugg opinber prófunarlýsing.'
    else 'Safe public fixture description.'
  end
from (
  values
    (
      '94930000-0000-4000-8000-000000000001'::uuid,
      'Gamla aðgengið',
      'Stale Access'
    ),
    (
      '94930000-0000-4000-8000-000000000002'::uuid,
      'Vantar aðstöðu',
      'Missing Amenities'
    ),
    (
      '94930000-0000-4000-8000-000000000003'::uuid,
      'Einkaframbjóðandi',
      'Private Candidate'
    ),
    (
      '94930000-0000-4000-8000-000000000004'::uuid,
      'Traustsaga',
      'Trusted History'
    )
) as fixture(place_id, name_is, name_en)
cross join (values ('is'), ('en')) as locale(value);

insert into private.access_conditions (
  id,
  place_id,
  access_area,
  restraint_condition,
  dog_eligibility,
  availability_window,
  permission_requirement,
  created_by
)
values
  (
    '94940000-0000-4000-8000-000000000001',
    '94930000-0000-4000-8000-000000000001',
    'indoors',
    'leash_required',
    '{"scope":"all_dogs"}',
    '{}',
    'standing_permission',
    '94900000-0000-4000-8000-000000000005'
  ),
  (
    '94940000-0000-4000-8000-000000000002',
    '94930000-0000-4000-8000-000000000002',
    'outdoors',
    'off_leash_permitted',
    '{"scope":"all_dogs"}',
    '{}',
    'standing_permission',
    '94900000-0000-4000-8000-000000000005'
  ),
  (
    '94940000-0000-4000-8000-000000000004',
    '94930000-0000-4000-8000-000000000004',
    'indoors',
    'leash_required',
    '{"scope":"all_dogs"}',
    '{}',
    'standing_permission',
    '94900000-0000-4000-8000-000000000005'
  );

insert into private.verifications (
  id,
  access_condition_id,
  status,
  verified_by,
  verified_at,
  freshness_until
)
values
  (
    '94950000-0000-4000-8000-000000000001',
    '94940000-0000-4000-8000-000000000001',
    'verified',
    '94900000-0000-4000-8000-000000000005',
    statement_timestamp() - interval '11 months',
    statement_timestamp() + interval '10 days'
  ),
  (
    '94950000-0000-4000-8000-000000000002',
    '94940000-0000-4000-8000-000000000002',
    'verified',
    '94900000-0000-4000-8000-000000000005',
    statement_timestamp() - interval '1 month',
    statement_timestamp() + interval '11 months'
  ),
  (
    '94950000-0000-4000-8000-000000000004',
    '94940000-0000-4000-8000-000000000004',
    'verified',
    '94900000-0000-4000-8000-000000000005',
    statement_timestamp() - interval '1 month',
    statement_timestamp() + interval '11 months'
  );

insert into private.evidence (
  id,
  place_id,
  kind,
  source_citation,
  source_label,
  observed_at,
  recorded_by
)
values
  (
    '94960000-0000-4000-8000-000000000001',
    '94930000-0000-4000-8000-000000000001',
    'direct_observation',
    'Initial fixture observation',
    'Fixture source',
    statement_timestamp() - interval '11 months',
    '94900000-0000-4000-8000-000000000005'
  ),
  (
    '94960000-0000-4000-8000-000000000002',
    '94930000-0000-4000-8000-000000000002',
    'direct_observation',
    'Initial fixture observation',
    'Fixture source',
    statement_timestamp() - interval '1 month',
    '94900000-0000-4000-8000-000000000005'
  ),
  (
    '94960000-0000-4000-8000-000000000004',
    '94930000-0000-4000-8000-000000000004',
    'direct_observation',
    'Initial fixture observation',
    'Fixture source',
    statement_timestamp() - interval '1 month',
    '94900000-0000-4000-8000-000000000005'
  );

insert into private.verification_evidence (verification_id, evidence_id)
values
  (
    '94950000-0000-4000-8000-000000000001',
    '94960000-0000-4000-8000-000000000001'
  ),
  (
    '94950000-0000-4000-8000-000000000002',
    '94960000-0000-4000-8000-000000000002'
  ),
  (
    '94950000-0000-4000-8000-000000000004',
    '94960000-0000-4000-8000-000000000004'
  );

insert into private.contributor_status_policy (
  singleton,
  policy_version,
  trusted_minimum_net_accepted,
  trusted_window,
  trusted_minimum_distinct_months,
  trusted_minimum_distinct_subjects,
  trusted_maximum_revoked_in_window,
  enabled
)
values (
  true,
  'trusted-verification-test-v1',
  5,
  interval '12 months',
  3,
  3,
  0,
  true
);

insert into private.place_flag_abuse_policy (
  singleton,
  policy_version,
  submission_window,
  maximum_submissions,
  maximum_open,
  merge_window,
  enabled
)
values (
  true,
  'trusted-verification-test-v1',
  interval '1 day',
  50,
  50,
  interval '1 hour',
  true
);

create temporary table trusted_contribution_seed (
  suggestion_id uuid primary key,
  member_id uuid not null,
  ordinal integer not null,
  subject_place_id uuid not null
) on commit drop;

insert into trusted_contribution_seed (
  suggestion_id,
  member_id,
  ordinal,
  subject_place_id
)
select
  extensions.gen_random_uuid(),
  member.member_id,
  ordinal.value,
  case ordinal.value % 3
    when 1 then '94930000-0000-4000-8000-000000000001'::uuid
    when 2 then '94930000-0000-4000-8000-000000000002'::uuid
    else '94930000-0000-4000-8000-000000000004'::uuid
  end
from (
  values
    ('94900000-0000-4000-8000-000000000001'::uuid),
    ('94900000-0000-4000-8000-000000000002'::uuid),
    ('94900000-0000-4000-8000-000000000003'::uuid)
) as member(member_id)
cross join generate_series(1, 5) as ordinal(value);

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
  seed.suggestion_id,
  seed.member_id,
  extensions.gen_random_uuid(),
  '{}'::jsonb,
  'accepted',
  seed.subject_place_id,
  '{}'::jsonb,
  extensions.gen_random_uuid(),
  statement_timestamp() - interval '4 months',
  statement_timestamp() - interval '3 months',
  statement_timestamp() - interval '3 months'
from trusted_contribution_seed as seed;

insert into private.contributions (
  suggestion_id,
  member_id,
  confirmed_by,
  confirmation_request_id,
  kind,
  subject_place_id,
  confirmed_at
)
select
  seed.suggestion_id,
  seed.member_id,
  '94900000-0000-4000-8000-000000000005',
  extensions.gen_random_uuid(),
  'accepted_suggestion',
  seed.subject_place_id,
  date_trunc('month', statement_timestamp())
    - make_interval(months => ((seed.ordinal - 1) % 3))
    + interval '1 day'
from trusted_contribution_seed as seed;

set local role authenticated;
select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000004', true);

select throws_ok(
  $$select * from public.list_trusted_verification_tasks('en', 24)$$,
  '42501',
  'Current Trusted Contributor status required',
  'An ordinary Member cannot list Trusted Verification tasks'
);
select throws_ok(
  $$
    select * from public.submit_trusted_verification_task(
      'dog_amenities:94930000-0000-4000-8000-000000000002:5',
      '{"dog_amenities":["water_bowl"]}'::jsonb,
      jsonb_build_object(
        'kind', 'direct_observation',
        'source_citation', 'Observed in person',
        'source_label', 'Member observation',
        'observed_at', statement_timestamp()
      ),
      'Observed on site.',
      '94990000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'Current Trusted Contributor status required',
  'An ordinary Member cannot submit through the Trusted surface'
);

select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000001', true);

select is(
  (
    select count(*)::integer
    from public.list_trusted_verification_tasks('en', 24)
    where place_id in (
      '94930000-0000-4000-8000-000000000001',
      '94930000-0000-4000-8000-000000000002',
      '94930000-0000-4000-8000-000000000003'
    )
  ),
  2,
  'A live Trusted Contributor sees only the two approved safe task kinds'
);
select results_eq(
  $$
    select task_kind
    from public.list_trusted_verification_tasks('en', 24)
    where place_id in (
      '94930000-0000-4000-8000-000000000001',
      '94930000-0000-4000-8000-000000000002',
      '94930000-0000-4000-8000-000000000003'
    )
    order by task_kind
  $$,
  $$values ('access_freshness'::text), ('dog_amenities'::text)$$,
  'The task list contains stale access and missing dog amenities only'
);
select is(
  (
    select count(*)::integer
    from public.list_trusted_verification_tasks('en', 24)
    where place_id = '94930000-0000-4000-8000-000000000003'
  ),
  0,
  'Candidate-private Places never appear in the task projection'
);
select is(
  (
    select place_name
    from public.list_trusted_verification_tasks('is', 24)
    where place_id = '94930000-0000-4000-8000-000000000002'
  ),
  'Vantar aðstöðu',
  'The task projection localizes safe public identity without member data'
);

select *
into temporary table trusted_one_amenity_submission
from public.submit_trusted_verification_task(
  'dog_amenities:94930000-0000-4000-8000-000000000002:5',
  '{"dog_amenities":["water_bowl","waste_bags"]}'::jsonb,
  jsonb_build_object(
    'kind', 'direct_observation',
    'source_citation', 'Observed in person',
    'source_label', 'Member observation',
    'observed_at', statement_timestamp()
  ),
  'I confirmed these amenities on site.',
  '94990000-0000-4000-8000-000000000011'
);

select is(
  (select outcome from trusted_one_amenity_submission),
  'submitted',
  'A Trusted task submission enters moderator review'
);
select ok(
  (select activated_current_week from trusted_one_amenity_submission),
  'The first Trusted Verification submission activates the current weekly rhythm'
);
select is(
  (
    select active
    from public.get_current_member_weekly_rhythm()
  ),
  true,
  'Weekly rhythm includes submitted Trusted Verification effort'
);
select results_eq(
  $$
    select first_time_for_place, activated_current_week, current_week_active
    from public.set_current_favourite(
      '94930000-0000-4000-8000-000000000004',
      true
    )
  $$,
  $$values (true, false, true)$$,
  'A later first Favourite remains meaningful without claiming a second weekly activation'
);

reset role;

select is(
  (
    select status::text
    from private.place_flags
    where id = (select flag_id from trusted_one_amenity_submission)
  ),
  'submitted',
  'Submission creates an ordinary moderator-reviewable Correction'
);
select is(
  (
    select dog_amenities
    from private.places
    where id = '94930000-0000-4000-8000-000000000002'
  ),
  '[]'::jsonb,
  'Trusted submission never mutates the published Place directly'
);
select is(
  (
    select count(*)::integer
    from private.trusted_verification_submissions
    where member_id = '94900000-0000-4000-8000-000000000001'
  ),
  1,
  'One durable task linkage is recorded'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000001', true);

select is(
  (
    select outcome
    from public.submit_trusted_verification_task(
      'dog_amenities:94930000-0000-4000-8000-000000000002:5',
      '{"dog_amenities":["water_bowl","waste_bags"]}'::jsonb,
      jsonb_build_object(
        'kind', 'direct_observation',
        'source_citation', 'Observed in person',
        'source_label', 'Member observation',
        'observed_at', statement_timestamp()
      ),
      'Retry of the same observation.',
      '94990000-0000-4000-8000-000000000011'
    )
  ),
  'submitted',
  'A retry with the same request identity replays the original result'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.place_flags
    where member_id = '94900000-0000-4000-8000-000000000001'
  ),
  1,
  'A request retry cannot duplicate the moderation command'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000003', true);

select lives_ok(
  $$
    select * from public.submit_place_correction(
      jsonb_build_object(
        'place_id', '94930000-0000-4000-8000-000000000002',
        'target_kind', 'place_field',
        'target_field', 'dog_amenities',
        'proposed_value', '{"value":["water_bowl"]}'::jsonb,
        'explanation', 'Ordinary correction before a Trusted task.',
        'evidence', jsonb_build_object(
          'kind', 'direct_observation',
          'source_citation', 'Ordinary observation',
          'source_label', 'Member observation',
          'observed_at', statement_timestamp()
        )
      ),
      '94990000-0000-4000-8000-000000000041'
    )
  $$,
  'An ordinary same-target Correction exists before the Trusted task attempt'
);
select throws_ok(
  $$
    select * from public.submit_trusted_verification_task(
      'dog_amenities:94930000-0000-4000-8000-000000000002:5',
      '{"dog_amenities":["water_bowl"]}'::jsonb,
      jsonb_build_object(
        'kind', 'direct_observation',
        'source_citation', 'Trusted observation',
        'source_label', 'Member observation',
        'observed_at', statement_timestamp()
      ),
      'This must not merge into ordinary evidence.',
      '94990000-0000-4000-8000-000000000042'
    )
  $$,
  '55006',
  'Trusted Verification request conflicts with an existing Correction or Report',
  'A Trusted task cannot link to an ordinary same-target merge-window Correction'
);
select throws_ok(
  $$
    select * from public.submit_trusted_verification_task(
      'dog_amenities:94930000-0000-4000-8000-000000000002:5',
      '{"dog_amenities":["water_bowl"]}'::jsonb,
      jsonb_build_object(
        'kind', 'direct_observation',
        'source_citation', 'Trusted observation',
        'source_label', 'Member observation',
        'observed_at', statement_timestamp()
      ),
      'This must not reuse an ordinary request identity.',
      '94990000-0000-4000-8000-000000000041'
    )
  $$,
  '55006',
  'Trusted Verification request conflicts with an existing Correction or Report',
  'A Trusted task cannot link to an ordinary Correction through request-ID reuse'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000002', true);

select *
into temporary table trusted_two_amenity_submission
from public.submit_trusted_verification_task(
  'dog_amenities:94930000-0000-4000-8000-000000000002:5',
  '{"dog_amenities":["water_bowl"]}'::jsonb,
  jsonb_build_object(
    'kind', 'direct_observation',
    'source_citation', 'Second independent observation',
    'source_label', 'Member observation',
    'observed_at', statement_timestamp()
  ),
  'I also checked this Place.',
  '94990000-0000-4000-8000-000000000012'
);

select isnt(
  (select flag_id from trusted_two_amenity_submission),
  (select flag_id from trusted_one_amenity_submission),
  'Different Members retain independently auditable evidence submissions'
);

select *
into temporary table trusted_two_access_submission
from public.submit_trusted_verification_task(
  'access_freshness:94940000-0000-4000-8000-000000000001:94950000-0000-4000-8000-000000000001',
  '{"confirmed":true}'::jsonb,
  jsonb_build_object(
    'kind', 'direct_observation',
    'source_citation', 'Access confirmed on site',
    'source_label', 'Member observation',
    'observed_at', statement_timestamp()
  ),
  'The published access facts are still accurate.',
  '94990000-0000-4000-8000-000000000013'
);

select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000003', true);

select *
into temporary table trusted_three_access_submission
from public.submit_trusted_verification_task(
  'access_freshness:94940000-0000-4000-8000-000000000001:94950000-0000-4000-8000-000000000001',
  '{"confirmed":true}'::jsonb,
  jsonb_build_object(
    'kind', 'official_website',
    'source_url', 'https://example.invalid/access',
    'source_label', 'Official access page',
    'observed_at', statement_timestamp()
  ),
  'The official source still shows the same access rules.',
  '94990000-0000-4000-8000-000000000014'
);

reset role;

update private.place_flags
set
  status = 'applied',
  resolution_request_id = '94990000-0000-4000-8000-000000000021',
  resolved_at = statement_timestamp(),
  updated_at = statement_timestamp()
where id = (select flag_id from trusted_one_amenity_submission);

insert into private.place_flag_status_events (
  flag_id,
  status,
  member_reason_is,
  member_reason_en,
  moderator_id
)
values (
  (select flag_id from trusted_one_amenity_submission),
  'applied',
  'Staðfest af stjórnanda.',
  'Confirmed by a moderator.',
  '94900000-0000-4000-8000-000000000005'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000005', true);

select lives_ok(
  format(
    'select * from public.confirm_place_flag_contribution(%L::uuid, %L::uuid)',
    (select flag_id from trusted_one_amenity_submission),
    '94990000-0000-4000-8000-000000000022'
  ),
  'The established moderator confirmation boundary creates permanent impact'
);

select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000001', true);

select is(
  (
    select outcome
    from public.list_my_trusted_verification_submissions('en', 30)
    where submission_id = (select submission_id from trusted_one_amenity_submission)
  ),
  'accepted',
  'The accepted Member sees concrete confirmed Trusted Verification history'
);
select is(
  (
    select has_unread
    from public.get_my_trusted_verification_feedback()
  ),
  true,
  'A newly confirmed Trusted Verification produces one private unread state'
);
select is(
  (
    select unread_count
    from public.get_my_trusted_verification_feedback()
  ),
  1,
  'The unread projection counts the one newly confirmed outcome'
);

select throws_ok(
  $$select * from public.mark_my_trusted_verification_feedback_read('2999-01-01'::timestamptz)$$,
  '22023',
  'Feedback boundary was not found',
  'A Member cannot acknowledge an unseen future feedback boundary'
);
select lives_ok(
  format(
    'select * from public.mark_my_trusted_verification_feedback_read(%L::timestamptz)',
    (
      select latest_confirmed_at
      from public.get_my_trusted_verification_feedback()
    )
  ),
  'The Member can acknowledge exactly the confirmed outcome they viewed'
);
select is(
  (
    select has_unread
    from public.get_my_trusted_verification_feedback()
  ),
  false,
  'Acknowledgement clears the private unread state without changing impact'
);

select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000002', true);

select is(
  (
    select outcome
    from public.list_my_trusted_verification_submissions('en', 30)
    where submission_id = (select submission_id from trusted_two_amenity_submission)
  ),
  'superseded',
  'A sibling submission is deterministically superseded after one accepted Contribution'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.contributions
    where place_flag_id in (
      (select flag_id from trusted_one_amenity_submission),
      (select flag_id from trusted_two_amenity_submission)
    )
  ),
  1,
  'Concurrent evidence for one task generation grants permanent impact only once'
);
select is(
  (
    select count(*)::integer
    from private.place_flags
    where id = (select flag_id from trusted_two_amenity_submission)
      and status = 'rejected'
  ),
  1,
  'A superseded sibling is terminal and absent from the actionable moderation queue'
);
select throws_ok(
  format(
    'update private.place_flags set status = %L, resolved_at = null where id = %L::uuid',
    'needs_information',
    (select flag_id from trusted_two_amenity_submission)
  ),
  '55006',
  'Trusted Verification was superseded',
  'A stale moderator tab cannot resolve a superseded Trusted Verification item'
);
select throws_ok(
  format(
    $sql$
      insert into private.contributions (
        place_flag_id,
        member_id,
        confirmed_by,
        confirmation_request_id,
        kind,
        subject_place_id
      ) values (
        %L::uuid,
        '94900000-0000-4000-8000-000000000002',
        '94900000-0000-4000-8000-000000000005',
        '94990000-0000-4000-8000-000000000053',
        'applied_correction',
        '94930000-0000-4000-8000-000000000002'
      )
    $sql$,
    (select flag_id from trusted_two_amenity_submission)
  ),
  '55006',
  'Trusted Verification was superseded',
  'A confirmation that loses the exact-task race cannot create duplicate permanent impact'
);

update private.place_flags
set
  status = 'rejected',
  resolution_request_id = '94990000-0000-4000-8000-000000000023',
  resolved_at = statement_timestamp(),
  updated_at = statement_timestamp()
where id = (select flag_id from trusted_two_access_submission);

insert into private.place_flag_status_events (
  flag_id,
  status,
  member_reason_is,
  member_reason_en,
  moderator_id
)
values (
  (select flag_id from trusted_two_access_submission),
  'rejected',
  'Gögnin staðfestu ekki upplýsingarnar.',
  'The evidence did not confirm the information.',
  '94900000-0000-4000-8000-000000000005'
);

update private.verifications
set superseded_at = statement_timestamp()
where id = '94950000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000002', true);

select results_eq(
  $$
    select outcome, member_reason
    from public.list_my_trusted_verification_submissions('en', 30)
    where submission_id = (
      select submission_id from trusted_two_access_submission
    )
  $$,
  $$
    values (
      'rejected'::text,
      'The evidence did not confirm the information.'::text
    )
  $$,
  'Rejected work receives one neutral Member-safe explanation and no impact'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.contributions
    where place_flag_id = (select flag_id from trusted_two_access_submission)
  ),
  0,
  'Rejected Trusted Verification creates no confirmed Contribution'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000003', true);

select is(
  (
    select outcome
    from public.list_my_trusted_verification_submissions('en', 30)
    where submission_id = (select submission_id from trusted_three_access_submission)
  ),
  'unavailable',
  'A changed Place Verification makes an unresolved versioned task unavailable'
);

reset role;

update private.place_flags
set
  status = 'applied',
  applied_access_condition_id = '94940000-0000-4000-8000-000000000001',
  resolution_request_id = '94990000-0000-4000-8000-000000000051',
  resolved_at = statement_timestamp(),
  updated_at = statement_timestamp()
where id = (select flag_id from trusted_three_access_submission);

insert into private.place_flag_status_events (
  flag_id,
  status,
  member_reason_is,
  member_reason_en,
  moderator_id
)
values (
  (select flag_id from trusted_three_access_submission),
  'applied',
  'Staðfest af stjórnanda.',
  'Confirmed by a moderator.',
  '94900000-0000-4000-8000-000000000005'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000005', true);
select lives_ok(
  format(
    'select * from public.confirm_place_flag_contribution(%L::uuid, %L::uuid)',
    (select flag_id from trusted_three_access_submission),
    '94990000-0000-4000-8000-000000000052'
  ),
  'A later accepted sibling can still be confirmed after another sibling was rejected'
);

select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000002', true);
select is(
  (
    select outcome
    from public.list_my_trusted_verification_submissions('en', 30)
    where submission_id = (select submission_id from trusted_two_access_submission)
  ),
  'rejected',
  'A later sibling acceptance preserves an earlier moderator rejection'
);

reset role;
update private.contributor_status_policy set enabled = false where singleton;

set local role authenticated;
select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select * from public.list_trusted_verification_tasks('en', 24)$$,
  '42501',
  'Current Trusted Contributor status required',
  'Losing live trust removes access to new Trusted tasks immediately'
);
select is(
  (
    select outcome
    from public.list_my_trusted_verification_submissions('en', 30)
    where submission_id = (select submission_id from trusted_one_amenity_submission)
  ),
  'accepted',
  'A trust downgrade never erases already confirmed Trusted work'
);
select lives_ok(
  $$
    select * from public.submit_place_correction(
      jsonb_build_object(
        'place_id', '94930000-0000-4000-8000-000000000004',
        'target_kind', 'place_field',
        'target_field', 'website_url',
        'proposed_value', jsonb_build_object('value', 'https://example.invalid/new'),
        'explanation', 'Ordinary correction after trust downgrade.',
        'evidence', jsonb_build_object(
          'kind', 'official_website',
          'source_url', 'https://example.invalid/new',
          'source_label', 'Official website',
          'observed_at', statement_timestamp()
        )
      ),
      '94990000-0000-4000-8000-000000000031'
    )
  $$,
  'Ordinary Correction access remains available after a trust downgrade'
);

select throws_ok(
  format(
    'select * from public.get_moderation_trusted_verification_context(%L::uuid)',
    (select flag_id from trusted_one_amenity_submission)
  ),
  '42501',
  'Moderator role required',
  'Trusted Contributors receive no moderation context or decision capability'
);

select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000005', true);

select is(
  (
    select task_kind
    from public.get_moderation_trusted_verification_context(
      (select flag_id from trusted_one_amenity_submission)
    )
  ),
  'dog_amenities',
  'Moderators can identify the narrow Trusted task context during ordinary review'
);

reset role;
update private.contributions
set
  revoked_at = statement_timestamp(),
  revoked_by = '94900000-0000-4000-8000-000000000005',
  revoked_reason = 'Fixture revocation',
  revocation_request_id = '94990000-0000-4000-8000-000000000061'
where place_flag_id = (select flag_id from trusted_one_amenity_submission);
delete from private.trusted_verification_feedback_receipts
where member_id = '94900000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '94900000-0000-4000-8000-000000000001', true);
select is(
  (
    select outcome
    from public.list_my_trusted_verification_submissions('en', 30)
    where submission_id = (select submission_id from trusted_one_amenity_submission)
  ),
  'revoked',
  'Revoked permanent impact is represented honestly in private Trusted history'
);
select is(
  (select has_unread from public.get_my_trusted_verification_feedback()),
  false,
  'Revoked work never produces an unread confirmation celebration'
);

select * from finish();
rollback;
