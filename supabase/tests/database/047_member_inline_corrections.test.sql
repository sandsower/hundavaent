begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- The abuse policy is seeded, not left to the test harness -------------------------------------
--
-- Before the Phase 1 migration the singleton row existed only in end-to-end setup, so Corrections
-- and Reports failed closed with 55000 in every other environment.

select ok(
  (
    select policy.enabled and policy.maximum_submissions = 20 and policy.maximum_open = 15
      and policy.submission_window = make_interval(secs => 3600)
      and policy.merge_window = make_interval(secs => 900)
    from private.place_flag_abuse_policy policy
    where policy.singleton
  ),
  'The Correction and Report abuse policy ships enabled with the Phase 1 thresholds'
);

-- Fixtures --------------------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('97000000-0000-4000-8000-000000000001', 'inline-correction-member@example.invalid'),
  ('97000000-0000-4000-8000-000000000002', 'inline-correction-moderator@example.invalid');
insert into private.member_accounts (user_id) values
  ('97000000-0000-4000-8000-000000000001'),
  ('97000000-0000-4000-8000-000000000002');
insert into security.role_grants (user_id, role) values
  ('97000000-0000-4000-8000-000000000001', 'member'),
  ('97000000-0000-4000-8000-000000000002', 'member'),
  ('97000000-0000-4000-8000-000000000002', 'moderator');

insert into private.operators (id, name) values
  ('97100000-0000-4000-8000-000000000001', 'Inline correction operator');
insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude,
  geometry_precision, geometry_source
) values
  (
    '97200000-0000-4000-8000-000000000001', 'Taumgata 1', 'Reykjavík', '101', 'reykjavik',
    64.15, -21.95, 'moderator_confirmed_point', 'Reviewed database test fixture'
  ),
  (
    '97200000-0000-4000-8000-000000000002', 'Taumgata 2', 'Reykjavík', '101', 'reykjavik',
    64.16, -21.96, 'moderator_confirmed_point', 'Reviewed database test fixture'
  );

insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, version, published_at, created_by
) values
  (
    '97300000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000001',
    '97200000-0000-4000-8000-000000000001', 'dog_access_destination', 'published', 'cafe', 1,
    '2026-01-01T00:00:00Z', '97000000-0000-4000-8000-000000000002'
  ),
  (
    '97300000-0000-4000-8000-000000000002', '97100000-0000-4000-8000-000000000001',
    '97200000-0000-4000-8000-000000000002', 'candidate_materialization', 'candidate', 'cafe', 1,
    null, '97000000-0000-4000-8000-000000000002'
  );
insert into private.place_translations (place_id, locale, name, description) values
  ('97300000-0000-4000-8000-000000000001', 'is', 'Taumkaffihús', 'Upprunaleg lýsing.'),
  ('97300000-0000-4000-8000-000000000001', 'en', 'Leash Cafe', 'Original description.'),
  ('97300000-0000-4000-8000-000000000002', 'is', 'Frambjóðandi', 'Upprunaleg lýsing.'),
  ('97300000-0000-4000-8000-000000000002', 'en', 'Candidate', 'Original description.');

-- The Published Place carries restricted eligibility, which is exactly the shape no validated
-- write path could store before this phase.
insert into private.access_conditions (
  id, place_id, access_area, restraint_condition, dog_eligibility, availability_state,
  availability_window, permission_requirement, created_by, created_at
) values
  (
    '97400000-0000-4000-8000-000000000001', '97300000-0000-4000-8000-000000000001', 'indoors',
    'leash_required', '{"scope":"restricted","maximumWeightKg":10}'::jsonb, 'not_stated', '{}'::jsonb,
    'standing_permission', '97000000-0000-4000-8000-000000000002', '2026-01-01T00:00:00Z'
  ),
  (
    '97400000-0000-4000-8000-000000000002', '97300000-0000-4000-8000-000000000002', 'indoors',
    'leash_required', '{"scope":"all_dogs"}'::jsonb, 'not_stated', '{}'::jsonb,
    'standing_permission', '97000000-0000-4000-8000-000000000002', '2026-01-01T00:00:00Z'
  );

insert into private.evidence (
  id, place_id, kind, source_url, source_label, observed_at, recorded_by
) values
  (
    '97500000-0000-4000-8000-000000000001', '97300000-0000-4000-8000-000000000001',
    'official_website', 'https://example.invalid/leash-cafe', 'Original policy',
    '2026-01-01T00:00:00Z', '97000000-0000-4000-8000-000000000002'
  ),
  (
    '97500000-0000-4000-8000-000000000002', '97300000-0000-4000-8000-000000000002',
    'official_website', 'https://example.invalid/candidate', 'Candidate policy',
    '2026-01-01T00:00:00Z', '97000000-0000-4000-8000-000000000002'
  );
insert into private.verifications (
  id, access_condition_id, status, verified_by, verified_at, freshness_until
) values (
  '97600000-0000-4000-8000-000000000001', '97400000-0000-4000-8000-000000000001', 'verified',
  '97000000-0000-4000-8000-000000000002', '2026-01-01T00:00:00Z', '2030-01-01T00:00:00Z'
);
insert into private.verification_evidence (verification_id, evidence_id) values
  ('97600000-0000-4000-8000-000000000001', '97500000-0000-4000-8000-000000000001');

-- Restricted eligibility survives the Correction path -------------------------------------------

select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select lives_ok(
  $$
    select * from public.submit_place_correction(
      jsonb_build_object(
        'place_id', '97300000-0000-4000-8000-000000000001',
        'target_kind', 'access_condition',
        'access_condition_id', '97400000-0000-4000-8000-000000000001',
        'explanation', 'Dogs were off leash in the seating area.',
        'evidence', jsonb_build_object(
          'kind', 'member_report',
          'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:00:00Z',
          'source_url', null,
          'source_citation', 'Restraint condition changed from leash required to off-leash allowed.',
          'source_metadata', jsonb_build_object(
            'submissionProfile', 'inline-v1', 'surface', 'place-card',
            'citationSource', 'synthesized'
          )
        ),
        'proposed_value', jsonb_build_object(
          'access_area', 'indoors', 'access_area_note', null,
          'restraint_condition', 'off_leash_permitted', 'restraint_note', null,
          'dog_eligibility', jsonb_build_object('scope', 'restricted', 'maximumWeightKg', 10),
          'availability_state', 'not_stated', 'availability_window', '{}'::jsonb,
          'permission_requirement', 'standing_permission'
        )
      ),
      '97700000-0000-4000-8000-000000000001'
    )
  $$,
  'A Correction carrying the Place restricted dog eligibility through untouched is accepted'
);

-- The merge predicate folds identical claims only -----------------------------------------------
--
-- Submitting the same claim again inside the merge window must return the first item, while a
-- revised claim must create its own item instead of being silently discarded. Both are asserted
-- after the role is reset, because private.place_flags is unreachable from `authenticated`.

select lives_ok(
  $$
    select * from public.submit_place_correction(
      jsonb_build_object(
        'place_id', '97300000-0000-4000-8000-000000000001',
        'target_kind', 'access_condition',
        'access_condition_id', '97400000-0000-4000-8000-000000000001',
        'explanation', 'Dogs were off leash in the seating area.',
        'evidence', jsonb_build_object(
          'kind', 'member_report',
          'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:05:00Z',
          'source_url', null,
          'source_citation', 'Restraint condition changed from leash required to off-leash allowed.',
          'source_metadata', '{}'::jsonb
        ),
        'proposed_value', jsonb_build_object(
          'access_area', 'indoors', 'access_area_note', null,
          'restraint_condition', 'off_leash_permitted', 'restraint_note', null,
          'dog_eligibility', jsonb_build_object('scope', 'restricted', 'maximumWeightKg', 10),
          'availability_state', 'not_stated', 'availability_window', '{}'::jsonb,
          'permission_requirement', 'standing_permission'
        )
      ),
      '97700000-0000-4000-8000-000000000002'
    )
  $$,
  'A repeated identical claim inside the merge window is accepted'
);

select lives_ok(
  $$
    select * from public.submit_place_correction(
      jsonb_build_object(
        'place_id', '97300000-0000-4000-8000-000000000001',
        'target_kind', 'access_condition',
        'access_condition_id', '97400000-0000-4000-8000-000000000001',
        'explanation', 'A carrier is required after all.',
        'evidence', jsonb_build_object(
          'kind', 'member_report',
          'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:10:00Z',
          'source_url', null,
          'source_citation', 'Restraint condition changed from leash required to carrier required.',
          'source_metadata', '{}'::jsonb
        ),
        'proposed_value', jsonb_build_object(
          'access_area', 'indoors', 'access_area_note', null,
          'restraint_condition', 'carrier_required', 'restraint_note', null,
          'dog_eligibility', jsonb_build_object('scope', 'restricted', 'maximumWeightKg', 10),
          'availability_state', 'not_stated', 'availability_window', '{}'::jsonb,
          'permission_requirement', 'standing_permission'
        )
      ),
      '97700000-0000-4000-8000-000000000003'
    )
  $$,
  'A revised claim inside the merge window is accepted'
);

reset role;

select is(
  (
    select count(*) from private.place_flags flag
    where flag.member_id = '97000000-0000-4000-8000-000000000001'
      and flag.access_condition_id = '97400000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'Two distinct claims and one repeat produce exactly two stored Corrections'
);

select ok(
  not exists (
    select 1 from private.place_flags flag
    where flag.request_id = '97700000-0000-4000-8000-000000000002'
  ),
  'The repeated identical claim folded into the open item instead of creating a row'
);

select is(
  (
    select flag.proposed_value ->> 'restraint_condition' from private.place_flags flag
    where flag.request_id = '97700000-0000-4000-8000-000000000003'
  ),
  'carrier_required',
  'The revised claim is recorded with its own proposed value instead of being silently discarded'
);

select is(
  (
    select flag.proposed_value -> 'dog_eligibility' from private.place_flags flag
    where flag.request_id = '97700000-0000-4000-8000-000000000001'
  ),
  '{"scope":"restricted","maximumWeightKg":10}'::jsonb,
  'The stored Correction keeps the real dog eligibility rather than a hardcoded all_dogs'
);

-- Restricted eligibility survives the Candidate materialization path ----------------------------

select lives_ok(
  $$
    select private.materialize_candidate_draft(
      '97300000-0000-4000-8000-000000000002',
      jsonb_build_object(
        'operator', jsonb_build_object('name', 'Inline correction operator'),
        'location', jsonb_build_object(
          'address_line', 'Taumgata 2', 'locality', 'Reykjavík', 'postal_code', '101',
          'municipality', 'reykjavik', 'latitude', 64.16, 'longitude', -21.96,
          'geometry_precision', 'moderator_confirmed_point',
          'geometry_source', 'Reviewed database test fixture'
        ),
        'category', 'cafe',
        'website_url', null,
        'phone', null,
        'opening_hours', '{}'::jsonb,
        'dog_amenities', '[]'::jsonb,
        'translations', jsonb_build_object(
          'is', jsonb_build_object('name', 'Frambjóðandi', 'description', 'Upprunaleg lýsing.'),
          'en', jsonb_build_object('name', 'Candidate', 'description', 'Original description.')
        ),
        'access_conditions', jsonb_build_array(jsonb_build_object(
          'id', '97400000-0000-4000-8000-000000000002',
          'access_area', 'indoors', 'access_area_note', null,
          'restraint_condition', 'leash_required', 'restraint_note', null,
          'dog_eligibility', jsonb_build_object('scope', 'restricted', 'maximumDogs', 2),
          'availability_state', 'not_stated', 'availability_window', '{}'::jsonb,
          'permission_requirement', 'standing_permission'
        )),
        'evidence_records', jsonb_build_array(jsonb_build_object(
          'id', '97500000-0000-4000-8000-000000000002',
          'kind', 'official_website',
          'source_url', 'https://example.invalid/candidate',
          'source_citation', null,
          'source_label', 'Candidate policy',
          'observed_at', '2026-07-25T09:00:00Z',
          'source_metadata', '{}'::jsonb
        ))
      ),
      '97000000-0000-4000-8000-000000000002'
    )
  $$,
  'A Moderator can materialize the eligibility limits their own form already offers'
);

select is(
  (
    select condition.dog_eligibility from private.access_conditions condition
    where condition.id = '97400000-0000-4000-8000-000000000002'
  ),
  '{"scope":"restricted","maximumDogs":2}'::jsonb,
  'Materialization stores the restricted eligibility rather than rejecting it'
);

-- The relaxed validator still refuses shapes the table refuses --------------------------------

select throws_ok(
  $$
    select private.validate_access_condition_value(jsonb_build_object(
      'access_area', 'indoors', 'access_area_note', null,
      'restraint_condition', 'leash_required', 'restraint_note', null,
      'dog_eligibility', jsonb_build_object('scope', 'restricted'),
      'availability_state', 'not_stated', 'availability_window', '{}'::jsonb,
      'permission_requirement', 'standing_permission'
    ))
  $$,
  '22023', null,
  'A restricted scope carrying no limit at all is still invalid'
);

select throws_ok(
  $$
    select private.validate_access_condition_value(jsonb_build_object(
      'access_area', 'indoors', 'access_area_note', null,
      'restraint_condition', 'leash_required', 'restraint_note', null,
      'dog_eligibility', jsonb_build_object('scope', 'all_dogs', 'maximumDogs', 2),
      'availability_state', 'not_stated', 'availability_window', '{}'::jsonb,
      'permission_requirement', 'standing_permission'
    ))
  $$,
  '22023', null,
  'An all_dogs scope carrying a limit is still invalid'
);

select throws_ok(
  $$
    select private.validate_access_condition_value(jsonb_build_object(
      'access_area', 'indoors', 'access_area_note', null,
      'restraint_condition', 'leash_required', 'restraint_note', null,
      'dog_eligibility', jsonb_build_object('scope', 'restricted', 'maximumWeightKg', 0),
      'availability_state', 'not_stated', 'availability_window', '{}'::jsonb,
      'permission_requirement', 'standing_permission'
    ))
  $$,
  '22023', null,
  'A non-positive weight limit is still invalid'
);

select * from finish();

rollback;
