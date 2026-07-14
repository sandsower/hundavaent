begin;

create extension if not exists pgtap with schema extensions;

alter table private.locations alter column geometry_precision set default 'moderator_confirmed_point';
alter table private.locations alter column geometry_source set default 'Reviewed database test fixture';

select plan(13);

delete from private.verifications
where access_condition_id in (
  select access_condition.id
  from private.access_conditions as access_condition
  where access_condition.place_id in (
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000003'
  )
);

delete from private.access_conditions
where place_id in (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003'
);

delete from private.places
where id in (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003'
);

delete from private.evidence
where id in (
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000003',
  '50000000-0000-4000-8000-000000000004'
);

delete from private.locations
where id in (
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003'
);

delete from private.operators
where id = '10000000-0000-4000-8000-000000000001';

insert into private.operators (id, name)
values ('10000000-0000-4000-8000-000000000001', 'Hundavænt fixture operator');

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
    '20000000-0000-4000-8000-000000000001',
    'Candidategata 1',
    'Reykjavík',
    '101',
    'IS',
    'reykjavik',
    64.1466,
    -21.9426
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'Óstaðfest gata 2',
    'Reykjavík',
    '105',
    'IS',
    'reykjavik',
    64.1374,
    -21.9117
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'Staðfest gata 3',
    'Reykjavík',
    '107',
    'IS',
    'reykjavik',
    64.1423,
    -21.9555
  );

insert into private.places (
  id,
  operator_id,
  location_id,
  purpose,
  lifecycle,
  category,
  website_url,
  phone,
  opening_hours,
  version,
  published_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'dog_access_destination',
    'candidate',
    'restaurant',
    null,
    null,
    '{}'::jsonb,
    1,
    null
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    'dog_access_destination',
    'published',
    'cafe',
    null,
    null,
    '{}'::jsonb,
    1,
    '2026-07-09T11:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000003',
    'dog_access_destination',
    'published',
    'park',
    'https://example.invalid/verified-place',
    '+354 555 0103',
    '{"monday":["09:00-17:00"]}'::jsonb,
    1,
    '2026-07-09T11:00:00Z'
  );

insert into private.place_translations (place_id, locale, name, description)
values
  ('30000000-0000-4000-8000-000000000001', 'is', 'Tillaga að stað', 'Á ekki að birtast.'),
  ('30000000-0000-4000-8000-000000000001', 'en', 'Candidate Place', 'Must not be public.'),
  ('30000000-0000-4000-8000-000000000002', 'is', 'Óstaðfestur staður', 'Á ekki að birtast.'),
  ('30000000-0000-4000-8000-000000000002', 'en', 'Unverified Place', 'Must not be public.'),
  ('30000000-0000-4000-8000-000000000003', 'is', 'Birtur staður', 'Staðfestur hundvænn staður.'),
  ('30000000-0000-4000-8000-000000000003', 'en', 'Published Place', 'A verified dog-friendly Place.');

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
  '40000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000003',
  'outdoors',
  'leash_required',
  '{"scope":"all_dogs"}'::jsonb,
  '{}'::jsonb,
  'standing_permission'
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
  '50000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000003',
  'official_website',
  'https://example.invalid/verified-place/dog-access',
  'Official Place website',
  '2026-07-09T10:00:00Z'
);

insert into private.verifications (
  id,
  access_condition_id,
  status,
  verified_at,
  freshness_until,
  superseded_at
)
values (
  '60000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000003',
  'verified',
  '2026-07-09T11:00:00Z',
  '2030-01-01T00:00:00Z',
  null
);

insert into private.verification_evidence (verification_id, evidence_id)
values (
  '60000000-0000-4000-8000-000000000003',
  '50000000-0000-4000-8000-000000000003'
);

select ok(
  not has_table_privilege('anon', 'private.places', 'select'),
  'Anonymous callers cannot read private Place rows'
);

set local role anon;

select has_function(
  'public',
  'list_published_places',
  array['text'],
  'Public list discovery is exposed through one fixed function'
);

select has_function(
  'public',
  'get_published_place_profile',
  array['uuid', 'text'],
  'Public profile discovery is exposed through one fixed function'
);

select ok(
  has_function_privilege('anon', 'public.list_published_places(text)', 'execute'),
  'Anonymous callers can execute the fixed public list function'
);

select results_eq(
  $$
    select place_id
    from public.list_published_places('is')
    where place_id in (
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003'
    )
    order by place_id
  $$,
  $$values ('30000000-0000-4000-8000-000000000003'::uuid)$$,
  'Only a Published Place with a current Verification is discoverable'
);

select is(
  (
    select name
    from public.list_published_places('en')
    where place_id = '30000000-0000-4000-8000-000000000003'
  ),
  'Published Place'::text,
  'Public discovery localizes the verified Place'
);

select is(
  (
    select count(*)
    from public.get_published_place_profile(
      '30000000-0000-4000-8000-000000000001',
      'is'
    )
  ),
  0::bigint,
  'A direct Candidate profile lookup returns no public row'
);

select is(
  (
    select count(*)
    from public.get_published_place_profile(
      '30000000-0000-4000-8000-000000000002',
      'is'
    )
  ),
  0::bigint,
  'A direct unverified profile lookup returns no public row'
);

reset role;

insert into private.evidence (
  id,
  place_id,
  kind,
  source_url,
  source_label,
  observed_at
)
values (
  '50000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002',
  'official_website',
  'https://example.invalid/non-current-place/dog-access',
  'Official non-current Place website',
  '2026-07-09T10:00:00Z'
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
  '40000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002',
  'indoors',
  'leash_required',
  '{"scope":"all_dogs"}'::jsonb,
  '{}'::jsonb,
  'standing_permission'
);

insert into private.verifications (
  id,
  access_condition_id,
  status,
  verified_at,
  freshness_until
)
values (
  '60000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000002',
  'disputed',
  '2026-07-09T11:00:00Z',
  '2030-01-01T00:00:00Z'
);

insert into private.verification_evidence (verification_id, evidence_id)
values (
  '60000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000002'
);

set local role anon;

select is(
  (
    select count(*)
    from public.get_published_place_profile(
      '30000000-0000-4000-8000-000000000002',
      'is'
    )
  ),
  0::bigint,
  'A disputed Verification cannot make a Place public'
);

reset role;

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
  '40000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000002',
  'outdoors',
  'leash_required',
  '{"scope":"all_dogs"}'::jsonb,
  '{}'::jsonb,
  'standing_permission'
);

insert into private.verifications (
  id,
  access_condition_id,
  status,
  verified_at,
  freshness_until
)
values (
  '60000000-0000-4000-8000-000000000004',
  '40000000-0000-4000-8000-000000000004',
  'verified',
  '2020-01-01T00:00:00Z',
  '2020-02-01T00:00:00Z'
);

insert into private.verification_evidence (verification_id, evidence_id)
values (
  '60000000-0000-4000-8000-000000000004',
  '50000000-0000-4000-8000-000000000002'
);

set local role anon;

select is(
  (
    select count(*)
    from public.get_published_place_profile(
      '30000000-0000-4000-8000-000000000002',
      'is'
    )
  ),
  1::bigint,
  'A Reconfirmation Due Verification remains visible with freshness context'
);

select is(
  (
    select name
    from public.get_published_place_profile(
      '30000000-0000-4000-8000-000000000003',
      'en'
    )
  ),
  'Published Place'::text,
  'The verified Place has a localized public profile'
);

select is(
  (
    select array_agg(field_name order by field_name)
    from public.list_published_places('is') as listed
    cross join lateral jsonb_object_keys(to_jsonb(listed)) as field_name
    where listed.place_id = '30000000-0000-4000-8000-000000000003'
  ),
  array[
    'access_area',
    'access_condition_count',
    'access_conditions',
    'category',
    'latitude',
    'locality',
    'longitude',
    'name',
    'permission_requirement',
    'place_id',
    'restraint_condition',
    'simple_access_summary',
    'verified_at'
  ]::text[],
  'The list projection exposes exactly its reviewed public field allowlist'
);

select is(
  (
    select array_agg(field_name order by field_name)
    from public.get_published_place_profile(
      '30000000-0000-4000-8000-000000000003',
      'is'
    ) as profile
    cross join lateral jsonb_object_keys(to_jsonb(profile)) as field_name
  ),
  array[
    'access_area',
    'access_area_note',
    'access_condition_id',
    'address_line',
    'availability_window',
    'category',
    'description',
    'dog_amenities',
    'dog_eligibility',
    'evidence_sources',
    'freshness_until',
    'latitude',
    'locality',
    'longitude',
    'name',
    'opening_hours',
    'permission_requirement',
    'phone',
    'place_id',
    'postal_code',
    'restraint_condition',
    'restraint_note',
    'verified_at',
    'website_url'
  ]::text[],
  'The profile projection exposes exactly its reviewed public field allowlist'
);

select * from finish();

rollback;
