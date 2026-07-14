begin;

create extension if not exists pgtap with schema extensions;

alter table private.locations alter column geometry_precision set default 'moderator_confirmed_point';
alter table private.locations alter column geometry_source set default 'Reviewed database test fixture';

select plan(12);

select has_table('private', 'evidence', 'Evidence persistence exists');
select has_table('private', 'access_conditions', 'Access Condition persistence exists');
select has_table('private', 'verifications', 'Verification persistence exists');
select has_table('private', 'verification_evidence', 'Verification-to-Evidence links exist');

insert into private.operators (id, name)
values ('12000000-0000-4000-8000-000000000001', 'Access fixture operator');

insert into private.locations (
  id,
  address_line,
  locality,
  postal_code,
  municipality,
  latitude,
  longitude
)
values (
  '22000000-0000-4000-8000-000000000001',
  'Hundagata 1',
  'Reykjavík',
  '101',
  'reykjavik',
  64.1466,
  -21.9426
);

insert into private.places (
  id,
  operator_id,
  location_id,
  purpose,
  category
)
values (
  '32000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'dog_access_destination',
  'park'
);

insert into private.evidence (
  id,
  place_id,
  kind,
  source_url,
  source_label,
  observed_at
)
values (
  '52000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  'official_website',
  'https://example.invalid/access',
  'Official Place website',
  '2026-07-09T10:00:00Z'
);

select is(
  (
    select count(*)
    from private.verification_evidence
    where evidence_id = '52000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'Recording Evidence does not create a Verification'
);

select throws_ok(
  $$
    insert into private.evidence (place_id, kind, source_label, observed_at)
    values (
      '32000000-0000-4000-8000-000000000001',
      'direct_observation',
      'Source-free observation',
      now()
    )
  $$,
  '23514',
  null,
  'Evidence requires a URL or citation'
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
values (
  '42000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  'outdoors',
  'leash_required',
  '{"scope":"all_dogs"}'::jsonb,
  '{}'::jsonb,
  'standing_permission'
);

select is(
  (
    select dog_eligibility ->> 'scope'
    from private.access_conditions
    where id = '42000000-0000-4000-8000-000000000001'
  ),
  'all_dogs'::text,
  'Access Condition retains structured Dog Eligibility'
);

select is(
  (
    select jsonb_typeof(availability_window)
    from private.access_conditions
    where id = '42000000-0000-4000-8000-000000000001'
  ),
  'object'::text,
  'Access Condition retains a structured Availability Window'
);

select is(
  (
    select permission_requirement::text
    from private.access_conditions
    where id = '42000000-0000-4000-8000-000000000001'
  ),
  'standing_permission'::text,
  'Access Condition retains a Permission Requirement'
);

select throws_ok(
  $$
    insert into private.access_conditions (
      place_id,
      access_area,
      restraint_condition,
      dog_eligibility,
      permission_requirement
    )
    values (
      '32000000-0000-4000-8000-000000000001',
      'indoors',
      'leash_required',
      '[]'::jsonb,
      'standing_permission'
    )
  $$,
  '23514',
  null,
  'Dog Eligibility cannot collapse into an unstructured value'
);

insert into private.verifications (
  id,
  access_condition_id,
  status,
  verified_at,
  freshness_until
)
values (
  '62000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001',
  'verified',
  '2026-07-09T11:00:00Z',
  '2027-01-09T11:00:00Z'
);

insert into private.verification_evidence (verification_id, evidence_id)
values (
  '62000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001'
);

select is(
  (
    select count(*)
    from private.verification_evidence
    where verification_id = '62000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'Verification links to supporting Evidence without embedding it'
);

select throws_ok(
  $$
    insert into private.verifications (
      access_condition_id,
      status,
      verified_at,
      freshness_until
    )
    values (
      '42000000-0000-4000-8000-000000000001',
      'verified',
      '2026-08-09T11:00:00Z',
      '2027-02-09T11:00:00Z'
    )
  $$,
  '23505',
  null,
  'One Access Condition cannot have two current Verifications'
);

select * from finish();

rollback;
