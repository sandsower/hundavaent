begin;

create extension if not exists pgtap with schema extensions;

alter table private.locations alter column geometry_precision set default 'moderator_confirmed_point';
alter table private.locations alter column geometry_source set default 'Reviewed database test fixture';

select plan(30);

select has_function(
  'public',
  'verify_and_publish_place',
  array['jsonb', 'uuid'],
  'Publication has one structured command function'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.verify_and_publish_place(jsonb,uuid)',
    'execute'
  ),
  'Anonymous callers cannot execute publication'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.verify_and_publish_place(jsonb,uuid)',
    'execute'
  ),
  'Authenticated callers can reach the role-enforced publication boundary'
);

select has_function(
  'public',
  'get_moderation_place_review',
  array['uuid'],
  'Moderation review has one fixed caller-scoped function'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_moderation_place_review(uuid)',
    'execute'
  ),
  'Authenticated callers can reach the role-enforced review boundary'
);

insert into auth.users (id)
values
  ('73000000-0000-4000-8000-000000000001'),
  ('73000000-0000-4000-8000-000000000002');

insert into security.role_grants (user_id, role)
values ('73000000-0000-4000-8000-000000000001', 'moderator');

insert into private.operators (id, name)
values ('13000000-0000-4000-8000-000000000001', 'Publication contract operator');

insert into private.locations (
  id,
  address_line,
  locality,
  postal_code,
  country_code,
  municipality,
  latitude,
  longitude
)
values
  (
    '23000000-0000-4000-8000-000000000001',
    'Útgáfugata 1',
    'Reykjavík',
    '101',
    'IS',
    'reykjavik',
    64.1466,
    -21.9426
  ),
  (
    '23000000-0000-4000-8000-000000000002',
    'Þýðingargata 2',
    'Reykjavík',
    '105',
    'IS',
    'reykjavik',
    64.1374,
    -21.9117
  ),
  (
    '23000000-0000-4000-8000-000000000003',
    'Skilyrðisgata 3',
    'Reykjavík',
    '107',
    'IS',
    'reykjavik',
    64.1423,
    -21.9555
  ),
  (
    '23000000-0000-4000-8000-000000000004',
    'Bakfærslugata 4',
    'Kópavogur',
    '200',
    'IS',
    'kopavogur',
    64.111,
    -21.907
  );

insert into private.places (
  id,
  operator_id,
  location_id,
  purpose,
  lifecycle,
  category,
  version
)
values
  (
    '33000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000001',
    'dog_access_destination',
    'candidate',
    'restaurant',
    1
  ),
  (
    '33000000-0000-4000-8000-000000000002',
    '13000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000002',
    'dog_access_destination',
    'candidate',
    'cafe',
    1
  ),
  (
    '33000000-0000-4000-8000-000000000003',
    '13000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000003',
    'dog_access_destination',
    'candidate',
    'park',
    1
  ),
  (
    '33000000-0000-4000-8000-000000000004',
    '13000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000004',
    'dog_access_destination',
    'candidate',
    'shop',
    1
  );

insert into private.place_translations (place_id, locale, name, description)
values
  (
    '33000000-0000-4000-8000-000000000001',
    'is',
    'Útgáfustaður',
    'Fullgerður staður fyrir útgáfusamning.'
  ),
  (
    '33000000-0000-4000-8000-000000000001',
    'en',
    'Publication Place',
    'Complete Place for the publication contract.'
  ),
  (
    '33000000-0000-4000-8000-000000000002',
    'is',
    'Ófullgerð þýðing',
    'Staður sem vantar enska þýðingu.'
  ),
  (
    '33000000-0000-4000-8000-000000000003',
    'is',
    'Skilyrðislaus staður',
    'Staður sem vantar aðgangsskilyrði.'
  ),
  (
    '33000000-0000-4000-8000-000000000003',
    'en',
    'Conditionless Place',
    'A Place without an Access Condition.'
  ),
  (
    '33000000-0000-4000-8000-000000000004',
    'is',
    'Bakfærslustaður',
    'Staður sem sannar bakfærslu færslu.'
  ),
  (
    '33000000-0000-4000-8000-000000000004',
    'en',
    'Rollback Place',
    'A Place that proves transaction rollback.'
  );

insert into private.access_conditions (
  id,
  place_id,
  access_area,
  restraint_condition,
  dog_eligibility,
  availability_window,
  permission_requirement
)
values
  (
    '43000000-0000-4000-8000-000000000001',
    '33000000-0000-4000-8000-000000000001',
    'outdoors',
    'leash_required',
    '{"scope":"all_dogs"}'::jsonb,
    '{}'::jsonb,
    'standing_permission'
  ),
  (
    '43000000-0000-4000-8000-000000000002',
    '33000000-0000-4000-8000-000000000002',
    'indoors',
    'leash_required',
    '{"scope":"all_dogs"}'::jsonb,
    '{}'::jsonb,
    'ask_on_arrival'
  ),
  (
    '43000000-0000-4000-8000-000000000004',
    '33000000-0000-4000-8000-000000000004',
    'designated_area',
    'carrier_required',
    '{"scope":"restricted","notes":"carrier-trained dogs only"}'::jsonb,
    '{}'::jsonb,
    'advance_approval'
  );

insert into private.evidence (
  id,
  place_id,
  kind,
  source_url,
  source_citation,
  source_label,
  observed_at,
  recorded_by
)
values
  (
    '53000000-0000-4000-8000-000000000001',
    '33000000-0000-4000-8000-000000000001',
    'official_website',
    'https://example.invalid/publication-place/dog-access',
    null,
    'Official publication Place website',
    '2026-07-09T10:00:00Z',
    '73000000-0000-4000-8000-000000000001'
  ),
  (
    '53000000-0000-4000-8000-000000000004',
    '33000000-0000-4000-8000-000000000004',
    'direct_observation',
    null,
    'Moderator observed the dog-access sign in person.',
    'Rollback observation',
    '2026-07-09T10:00:00Z',
    '73000000-0000-4000-8000-000000000001'
  );

create function pg_temp.force_publication_audit_failure()
returns trigger
language plpgsql
as $$
begin
  if new.request_id = '83000000-0000-4000-8000-000000000006'::uuid then
    raise exception using errcode = 'P0001', message = 'Forced publication audit failure';
  end if;

  return new;
end;
$$;

create trigger publication_contract_force_audit_failure
before insert on private.audit_events
for each row execute function pg_temp.force_publication_audit_failure();

select set_config(
  'request.jwt.claim.sub',
  '73000000-0000-4000-8000-000000000002',
  true
);

set local role authenticated;

select throws_ok(
  $$
    select *
    from public.verify_and_publish_place(
      '{
        "place_id":"33000000-0000-4000-8000-000000000001",
        "expected_version":1,
        "condition_verifications":[{"access_condition_id":"43000000-0000-4000-8000-000000000001","evidence_ids":["53000000-0000-4000-8000-000000000001"]}],
        "freshness_until":"2099-01-01T00:00:00Z",
        "decision_metadata":{"basis":"contract"}
      }'::jsonb,
      '83000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'Moderator role required',
  'An authenticated non-Moderator cannot verify or publish'
);

select throws_ok(
  $$
    select *
    from public.get_moderation_place_review(
      '33000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'Moderator role required',
  'An authenticated non-Moderator cannot inspect a Candidate review'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  '73000000-0000-4000-8000-000000000001',
  true
);

set local role authenticated;

select is(
  (
    select jsonb_array_length(evidence_records)::bigint
    from public.get_moderation_place_review(
      '33000000-0000-4000-8000-000000000001'
    )
  ),
  1::bigint,
  'A Moderator review recovers the Candidate and its associated Evidence'
);

select throws_ok(
  $$
    select *
    from public.verify_and_publish_place(
      '{
        "place_id":"33000000-0000-4000-8000-000000000002",
        "expected_version":1,
        "condition_verifications":[{"access_condition_id":"43000000-0000-4000-8000-000000000002","evidence_ids":["53000000-0000-4000-8000-000000000001"]}],
        "freshness_until":"2099-01-01T00:00:00Z",
        "decision_metadata":{}
      }'::jsonb,
      '83000000-0000-4000-8000-000000000002'
    )
  $$,
  '22023',
  'Both Place translations are required',
  'Publication rejects a missing English translation'
);

reset role;

select is(
  (
    select count(*)
    from private.verifications as verification
    join private.access_conditions as access_condition
      on access_condition.id = verification.access_condition_id
    where access_condition.place_id = '33000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'Missing translation never creates a Verification'
);

set local role authenticated;

select throws_ok(
  $$
    select *
    from public.verify_and_publish_place(
      '{
        "place_id":"33000000-0000-4000-8000-000000000003",
        "expected_version":1,
        "condition_verifications":[{"access_condition_id":"43000000-0000-4000-8000-000000000003","evidence_ids":["53000000-0000-4000-8000-000000000001"]}],
        "freshness_until":"2099-01-01T00:00:00Z",
        "decision_metadata":{}
      }'::jsonb,
      '83000000-0000-4000-8000-000000000003'
    )
  $$,
  '22023',
  'Current Access Condition is required',
  'Publication rejects a missing current Access Condition'
);

select throws_ok(
  $$
    select *
    from public.verify_and_publish_place(
      '{
        "place_id":"33000000-0000-4000-8000-000000000001",
        "expected_version":2,
        "condition_verifications":[{"access_condition_id":"43000000-0000-4000-8000-000000000001","evidence_ids":["53000000-0000-4000-8000-000000000001"]}],
        "freshness_until":"2099-01-01T00:00:00Z",
        "decision_metadata":{}
      }'::jsonb,
      '83000000-0000-4000-8000-000000000004'
    )
  $$,
  '40001',
  'Place version conflict',
  'Publication rejects a stale expected version'
);

select throws_ok(
  $$
    select *
    from public.verify_and_publish_place(
      '{
        "place_id":"33000000-0000-4000-8000-000000000001",
        "expected_version":1,
        "condition_verifications":[{"access_condition_id":"43000000-0000-4000-8000-000000000001","evidence_ids":[]}],
        "freshness_until":"2099-01-01T00:00:00Z",
        "decision_metadata":{}
      }'::jsonb,
      '83000000-0000-4000-8000-000000000005'
    )
  $$,
  '22023',
  'At least one Evidence record is required',
  'Publication rejects a Verification without Evidence'
);

select throws_ok(
  $$
    select *
    from public.verify_and_publish_place(
      '{
        "place_id":"33000000-0000-4000-8000-000000000001",
        "expected_version":1,
        "condition_verifications":[{"access_condition_id":"43000000-0000-4000-8000-000000000001","evidence_ids":["53000000-0000-4000-8000-000000000004"]}],
        "freshness_until":"2099-01-01T00:00:00Z",
        "decision_metadata":{}
      }'::jsonb,
      '83000000-0000-4000-8000-000000000008'
    )
  $$,
  '22023',
  'Every Evidence record must exist',
  'Publication rejects Evidence associated with a different Place'
);

select throws_ok(
  $$
    select *
    from public.verify_and_publish_place(
      '{
        "place_id":"33000000-0000-4000-8000-000000000004",
        "expected_version":1,
        "condition_verifications":[{"access_condition_id":"43000000-0000-4000-8000-000000000004","evidence_ids":["53000000-0000-4000-8000-000000000004"]}],
        "freshness_until":"2099-01-01T00:00:00Z",
        "decision_metadata":{"basis":"rollback"}
      }'::jsonb,
      '83000000-0000-4000-8000-000000000006'
    )
  $$,
  'P0001',
  'Forced publication audit failure',
  'A late Audit failure rejects the complete publication transaction'
);

reset role;

select ok(
  (
    select lifecycle = 'candidate'::private.place_lifecycle
      and version = 1
      and published_at is null
    from private.places
    where id = '33000000-0000-4000-8000-000000000004'
  ),
  'A failed publication leaves the Place unchanged'
);

select is(
  (
    select count(*)
    from private.verifications as verification
    join private.access_conditions as access_condition
      on access_condition.id = verification.access_condition_id
    where access_condition.place_id = '33000000-0000-4000-8000-000000000004'
  ),
  0::bigint,
  'A failed publication rolls back its Verification'
);

select is(
  (
    select count(*)
    from private.audit_events
    where request_id = '83000000-0000-4000-8000-000000000006'
  ),
  0::bigint,
  'A failed publication rolls back every Audit Event'
);

create temporary table publication_result (
  place_id uuid not null,
  verification_ids uuid[] not null,
  version bigint not null,
  published_at timestamptz not null
) on commit drop;

grant insert on publication_result to authenticated;

set local role authenticated;

select lives_ok(
  $$
    insert into publication_result
    select *
    from public.verify_and_publish_place(
      '{
        "place_id":"33000000-0000-4000-8000-000000000001",
        "expected_version":1,
        "condition_verifications":[{"access_condition_id":"43000000-0000-4000-8000-000000000001","evidence_ids":["53000000-0000-4000-8000-000000000001"]}],
        "freshness_until":"2099-01-01T00:00:00Z",
        "decision_metadata":{"basis":"official_source"}
      }'::jsonb,
      '83000000-0000-4000-8000-000000000007'
    )
  $$,
  'A Moderator can verify and publish a complete Candidate atomically'
);

reset role;

select is(
  (select place_id from publication_result),
  '33000000-0000-4000-8000-000000000001'::uuid,
  'Publication returns the published Place identifier'
);

select is(
  (select version from publication_result),
  2::bigint,
  'Publication returns the incremented Place version'
);

select ok(
  (select cardinality(verification_ids) = 1 and published_at is not null from publication_result),
  'Publication returns the new Verification and publication time'
);

select ok(
  (
    select lifecycle = 'published'::private.place_lifecycle
      and version = 2
      and published_at is not null
    from private.places
    where id = '33000000-0000-4000-8000-000000000001'
  ),
  'Publication atomically advances lifecycle, version, and publication time'
);

select ok(
  (
    select
      verification.status = 'verified'::private.verification_status
      and verification.access_condition_id = '43000000-0000-4000-8000-000000000001'::uuid
      and verification.verified_by = '73000000-0000-4000-8000-000000000001'::uuid
      and verification.freshness_until = '2099-01-01T00:00:00Z'::timestamptz
      and verification.decision_metadata = '{"basis":"official_source"}'::jsonb
      and verification.superseded_at is null
    from private.verifications as verification
    where verification.id = (select verification_ids[1] from publication_result)
  ),
  'Publication creates the immutable current Verification from the Moderator decision'
);

select is(
  (
    select count(*)
    from private.verification_evidence
    where verification_id = (select verification_ids[1] from publication_result)
      and evidence_id = '53000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'Publication links every selected Evidence record to the Verification'
);

select is(
  (
    select count(*)
    from private.audit_events
    where request_id = '83000000-0000-4000-8000-000000000007'
  ),
  2::bigint,
  'Publication appends separate Verification and publication Audit Events'
);

select results_eq(
  $$
    select action
    from private.audit_events
    where request_id = '83000000-0000-4000-8000-000000000007'
    order by action
  $$,
  $$values ('place.published'::text), ('place.verified'::text)$$,
  'Publication records the two expected audit actions'
);

select ok(
  (
    select bool_and(
      actor_id = '73000000-0000-4000-8000-000000000001'::uuid
      and subject_type = 'place'
      and subject_id = '33000000-0000-4000-8000-000000000001'::uuid
      and change_summary ? 'version'
      and not change_summary ? 'decision_metadata'
    )
    from private.audit_events
    where request_id = '83000000-0000-4000-8000-000000000007'
  ),
  'Publication audit is actor-derived, Place-scoped, and excludes decision details'
);

reset role;

set local role anon;

select results_eq(
  $$select place_id from public.list_published_places('is') where place_id = '33000000-0000-4000-8000-000000000001'$$,
  $$values ('33000000-0000-4000-8000-000000000001'::uuid)$$,
  'The atomically Published and Verified Place becomes publicly discoverable'
);

reset role;

update private.access_conditions
set access_area_note = 'rear patio only'
where id = '43000000-0000-4000-8000-000000000001';

set local role anon;

select is(
  (select simple_access_summary from public.list_published_places('en')
    where place_id = '33000000-0000-4000-8000-000000000001'),
  false,
  'Any sourced note prevents a concise summary from dropping restrictions'
);

reset role;

select * from finish();

rollback;
