begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

insert into auth.users (id, email)
values (
  '93600000-0000-4000-8000-000000000001',
  'rationale-publication@example.invalid'
);

insert into security.role_grants (user_id, role)
values ('93600000-0000-4000-8000-000000000001', 'moderator');

insert into private.member_accounts (user_id)
values ('93600000-0000-4000-8000-000000000001');

insert into private.operators (id, name)
values ('93610000-0000-4000-8000-000000000001', 'Rationale-only operator');

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
values (
  '93620000-0000-4000-8000-000000000001',
  'Röksemdagata 1',
  'Reykjavík',
  '101',
  'reykjavik',
  64.1466,
  -21.9426,
  'moderator_confirmed_point',
  'Moderator positioned the Place'
);

insert into private.places (
  id,
  operator_id,
  location_id,
  purpose,
  lifecycle,
  category,
  version,
  created_by
)
values (
  '93630000-0000-4000-8000-000000000001',
  '93610000-0000-4000-8000-000000000001',
  '93620000-0000-4000-8000-000000000001',
  'dog_access_destination',
  'candidate',
  'cafe',
  1,
  '93600000-0000-4000-8000-000000000001'
);

insert into private.place_translations (place_id, locale, name, description)
values
  (
    '93630000-0000-4000-8000-000000000001',
    'is',
    'Röksemdastaður',
    'Staður sem stjórnandi hefur yfirfarið.'
  ),
  (
    '93630000-0000-4000-8000-000000000001',
    'en',
    'Rationale Place',
    'A Place reviewed by a Moderator.'
  );

insert into private.access_conditions (
  id,
  place_id,
  access_area,
  restraint_condition,
  dog_eligibility,
  availability_state,
  availability_window,
  permission_requirement,
  created_by
)
values (
  '93640000-0000-4000-8000-000000000001',
  '93630000-0000-4000-8000-000000000001',
  'indoors',
  'leash_required',
  '{"scope":"all_dogs"}',
  'not_stated',
  '{}',
  'standing_permission',
  '93600000-0000-4000-8000-000000000001'
);

select set_config(
  'request.jwt.claim.sub',
  '93600000-0000-4000-8000-000000000001',
  true
);

set local role authenticated;

select is(
  (
    select draft_version
    from public.save_candidate_place_moderation_draft(
      '93630000-0000-4000-8000-000000000001',
      1,
      0,
      'evidence_records',
      '{"evidence_records":[]}'::jsonb,
      '93660000-0000-4000-8000-000000000010'
    )
  ),
  1::bigint,
  'A Moderator may intentionally save an empty optional Evidence section'
);

select results_eq(
  $$
    select readiness_state, readiness_issues
    from public.get_moderation_place_review_v2(
      '93630000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values ('ready'::text, '[]'::jsonb) $$,
  'A Candidate without structured Evidence is ready for Moderator publication'
);

select results_eq(
  $$
    select readiness_state, readiness_issue_count
    from public.list_moderation_candidate_places(
      'actionable',
      null::timestamptz,
      null::uuid,
      20
    )
    where place_id = '93630000-0000-4000-8000-000000000001'
  $$,
  $$ values ('ready'::text, 0) $$,
  'The Candidate inbox does not treat missing Evidence as blocking'
);

select throws_ok(
  $$
    select *
    from public.verify_and_publish_place(
      '{
        "place_id":"93630000-0000-4000-8000-000000000001",
        "expected_version":1,
        "expected_item_version":1,
        "expected_draft_version":1,
        "freshness_until":"2099-01-01T00:00:00Z",
        "publication_reason":{"reason":"reviewed"},
        "decision_metadata":{"source":"moderation_workbench"}
      }'::jsonb,
      '93660000-0000-4000-8000-000000000000'
    )
  $$,
  '22023',
  'Publication command is incomplete',
  'Publication requires a free-text rationale rather than structured metadata'
);

select throws_ok(
  $$
    select *
    from public.verify_and_publish_place(
      '{
        "place_id":"93630000-0000-4000-8000-000000000001",
        "expected_version":1,
        "expected_item_version":1,
        "expected_draft_version":1,
        "freshness_until":"2099-01-01T00:00:00Z",
        "decision_metadata":{"source":"moderation_workbench"}
      }'::jsonb,
      '93660000-0000-4000-8000-000000000001'
    )
  $$,
  '22023',
  'Publication command is incomplete',
  'Publication still requires an internal Moderator rationale'
);

create temporary table rationale_publication as
select *
from public.verify_and_publish_place(
  '{
    "place_id":"93630000-0000-4000-8000-000000000001",
    "expected_version":1,
    "expected_item_version":1,
    "expected_draft_version":1,
    "freshness_until":"2099-01-01T00:00:00Z",
    "publication_reason":"The Place details and access rules have been reviewed.",
    "decision_metadata":{"source":"moderation_workbench"}
  }'::jsonb,
  '93660000-0000-4000-8000-000000000002'
);

select results_eq(
  $$ select version, cardinality(verification_ids) from rationale_publication $$,
  $$ values (2::bigint, 1) $$,
  'A rationale-only decision publishes and verifies every current Access Condition'
);

reset role;

select is(
  (
    select count(*)
    from private.verification_evidence link
    join private.verifications verification on verification.id = link.verification_id
    where verification.access_condition_id = '93640000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'Publication does not fabricate structured Evidence links'
);

select is(
  (
    select decision_metadata ->> 'publication_reason'
    from private.verifications
    where access_condition_id = '93640000-0000-4000-8000-000000000001'
      and superseded_at is null
  ),
  'The Place details and access rules have been reviewed.',
  'The internal Moderator rationale is retained with the Verification'
);

select is(
  (
    select lifecycle::text
    from private.places
    where id = '93630000-0000-4000-8000-000000000001'
  ),
  'published',
  'The Place lifecycle advances to published'
);

select is(
  (
    select count(*)
    from public.list_published_places_v3('en')
    where place_id = '93630000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'The published directory includes a Moderator-approved Place without Evidence'
);

select is(
  (
    select count(*)
    from public.list_published_places_v2('en')
    where place_id = '93630000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'The prior public directory contract remains consistent without Evidence'
);

select is(
  (
    select count(*)
    from public.list_published_places('en')
    where place_id = '93630000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'The original public directory contract remains consistent without Evidence'
);

select is(
  (
    select count(*)
    from public.get_published_place_profile_v3(
      '93630000-0000-4000-8000-000000000001',
      'en'
    )
  ),
  1::bigint,
  'The public profile includes a Moderator-approved Place without Evidence'
);

select is(
  (
    select count(*)
    from public.get_published_place_profile_v2(
      '93630000-0000-4000-8000-000000000001',
      'en'
    )
  ),
  1::bigint,
  'The prior public profile contract remains consistent without Evidence'
);

select is(
  (
    select count(*)
    from public.get_published_place_profile(
      '93630000-0000-4000-8000-000000000001',
      'en'
    )
  ),
  1::bigint,
  'The original public profile contract remains consistent without Evidence'
);

select is(
  position(
    'The Place details and access rules have been reviewed.'
    in (
      select coalesce(jsonb_agg(to_jsonb(profile))::text, '')
      from public.get_published_place_profile_v3(
        '93630000-0000-4000-8000-000000000001',
        'en'
      ) profile
    )
  ),
  0,
  'The internal Moderator rationale is absent from the public profile projection'
);

set local role authenticated;

select results_eq(
  $$
    select is_favourite
    from public.set_current_favourite(
      '93630000-0000-4000-8000-000000000001',
      true
    )
  $$,
  $$ values (true) $$,
  'Member actions treat rationale-only publication as discoverable'
);

reset role;

select * from finish();

rollback;
