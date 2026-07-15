begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_function(
  'private',
  'promote_verified_official_website',
  array[]::text[],
  'Verified official-site Evidence has one canonical promotion primitive'
);

select has_trigger(
  'private',
  'verification_evidence',
  'promote_verified_official_website',
  'Linking verified Evidence checks for safe canonical Website promotion'
);

insert into private.operators (id, name)
values ('93100000-0000-4000-8000-000000000001', 'Website contract operator');

insert into private.locations (
  id, address_line, locality, postal_code, country_code, municipality, latitude, longitude
)
values (
  '93110000-0000-4000-8000-000000000001',
  'Website Street 1',
  'Reykjavík',
  '101',
  'IS',
  'reykjavik',
  64.1466,
  -21.9426
);

insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, website_url, version, published_at
)
values (
  '93120000-0000-4000-8000-000000000001',
  '93100000-0000-4000-8000-000000000001',
  '93110000-0000-4000-8000-000000000001',
  'dog_access_destination',
  'published',
  'cafe',
  null,
  1,
  '2026-07-15T12:00:00Z'
);

insert into private.access_conditions (
  id, place_id, revision, access_area, restraint_condition, dog_eligibility,
  availability_state, availability_window, permission_requirement
)
values (
  '93130000-0000-4000-8000-000000000001',
  '93120000-0000-4000-8000-000000000001',
  1,
  'indoors',
  'leash_required',
  '{"scope":"all_dogs"}'::jsonb,
  'not_stated',
  '{}'::jsonb,
  'standing_permission'
);

insert into private.evidence (
  id, place_id, kind, source_url, source_label, observed_at
)
values (
  '93140000-0000-4000-8000-000000000001',
  '93120000-0000-4000-8000-000000000001',
  'official_website',
  'https://place.example/',
  'Place website',
  '2026-07-15T12:00:00Z'
);

select is(
  (select website_url from private.places
    where id = '93120000-0000-4000-8000-000000000001'),
  null,
  'Unlinked raw Evidence never becomes a public Website'
);

insert into private.verifications (
  id, access_condition_id, status, verified_at, freshness_until
)
values (
  '93150000-0000-4000-8000-000000000001',
  '93130000-0000-4000-8000-000000000001',
  'verified',
  '2026-07-15T12:05:00Z',
  '2027-01-15T12:05:00Z'
);

insert into private.verification_evidence (verification_id, evidence_id)
values (
  '93150000-0000-4000-8000-000000000001',
  '93140000-0000-4000-8000-000000000001'
);

select is(
  (select website_url from private.places
    where id = '93120000-0000-4000-8000-000000000001'),
  'https://place.example/',
  'Verified official-site Evidence promotes a Website on an already-published Place'
);

insert into private.locations (
  id, address_line, locality, postal_code, country_code, municipality, latitude, longitude
)
values
  (
    '93110000-0000-4000-8000-000000000002', 'Website Street 2', 'Reykjavík', '101',
    'IS', 'reykjavik', 64.1467, -21.9427
  ),
  (
    '93110000-0000-4000-8000-000000000003', 'Website Street 3', 'Reykjavík', '101',
    'IS', 'reykjavik', 64.1468, -21.9428
  ),
  (
    '93110000-0000-4000-8000-000000000004', 'Website Street 4', 'Reykjavík', '101',
    'IS', 'reykjavik', 64.1469, -21.9429
  );

insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, website_url, version, published_at
)
values
  (
    '93120000-0000-4000-8000-000000000002',
    '93100000-0000-4000-8000-000000000001',
    '93110000-0000-4000-8000-000000000002',
    'dog_access_destination', 'candidate', 'cafe', null, 1, null
  ),
  (
    '93120000-0000-4000-8000-000000000003',
    '93100000-0000-4000-8000-000000000001',
    '93110000-0000-4000-8000-000000000003',
    'dog_access_destination', 'published', 'cafe', 'https://curated.example/', 1,
    '2026-07-15T12:00:00Z'
  ),
  (
    '93120000-0000-4000-8000-000000000004',
    '93100000-0000-4000-8000-000000000001',
    '93110000-0000-4000-8000-000000000004',
    'dog_access_destination', 'published', 'cafe', null, 1, '2026-07-15T12:00:00Z'
  );

insert into private.access_conditions (
  id, place_id, revision, access_area, restraint_condition, dog_eligibility,
  availability_state, availability_window, permission_requirement
)
values
  (
    '93130000-0000-4000-8000-000000000002',
    '93120000-0000-4000-8000-000000000002',
    1, 'indoors', 'leash_required', '{"scope":"all_dogs"}'::jsonb,
    'not_stated', '{}'::jsonb, 'standing_permission'
  ),
  (
    '93130000-0000-4000-8000-000000000003',
    '93120000-0000-4000-8000-000000000003',
    1, 'indoors', 'leash_required', '{"scope":"all_dogs"}'::jsonb,
    'not_stated', '{}'::jsonb, 'standing_permission'
  ),
  (
    '93130000-0000-4000-8000-000000000004',
    '93120000-0000-4000-8000-000000000004',
    1, 'indoors', 'leash_required', '{"scope":"all_dogs"}'::jsonb,
    'not_stated', '{}'::jsonb, 'standing_permission'
  );

insert into private.evidence (
  id, place_id, kind, source_url, source_label, observed_at
)
values
  (
    '93140000-0000-4000-8000-000000000002',
    '93120000-0000-4000-8000-000000000002',
    'official_website', 'https://candidate.example/', 'Candidate website',
    '2026-07-15T12:10:00Z'
  ),
  (
    '93140000-0000-4000-8000-000000000003',
    '93120000-0000-4000-8000-000000000003',
    'official_website', 'https://replacement.example/', 'Replacement website',
    '2026-07-15T12:10:00Z'
  ),
  (
    '93140000-0000-4000-8000-000000000004',
    '93120000-0000-4000-8000-000000000004',
    'public_record', 'https://records.example/', 'Municipal record',
    '2026-07-15T12:10:00Z'
  );

insert into private.verifications (
  id, access_condition_id, status, verified_at, freshness_until
)
values
  (
    '93150000-0000-4000-8000-000000000002',
    '93130000-0000-4000-8000-000000000002',
    'verified', '2026-07-15T12:15:00Z', '2027-01-15T12:15:00Z'
  ),
  (
    '93150000-0000-4000-8000-000000000003',
    '93130000-0000-4000-8000-000000000003',
    'verified', '2026-07-15T12:15:00Z', '2027-01-15T12:15:00Z'
  ),
  (
    '93150000-0000-4000-8000-000000000004',
    '93130000-0000-4000-8000-000000000004',
    'verified', '2026-07-15T12:15:00Z', '2027-01-15T12:15:00Z'
  );

insert into private.verification_evidence (verification_id, evidence_id)
values
  (
    '93150000-0000-4000-8000-000000000002',
    '93140000-0000-4000-8000-000000000002'
  ),
  (
    '93150000-0000-4000-8000-000000000003',
    '93140000-0000-4000-8000-000000000003'
  ),
  (
    '93150000-0000-4000-8000-000000000004',
    '93140000-0000-4000-8000-000000000004'
  );

select is(
  (select website_url from private.places
    where id = '93120000-0000-4000-8000-000000000002'),
  'https://candidate.example/',
  'Verified official-site Evidence also promotes the Website for an existing Candidate'
);

select is(
  (select website_url from private.places
    where id = '93120000-0000-4000-8000-000000000003'),
  'https://curated.example/',
  'An explicit curated Website takes precedence over later official-site Evidence'
);

select is(
  (select website_url from private.places
    where id = '93120000-0000-4000-8000-000000000004'),
  null,
  'Verified non-official Evidence never becomes a public Website'
);

insert into private.evidence (
  id, place_id, kind, source_url, source_label, observed_at
)
values (
  '93140000-0000-4000-8000-000000000005',
  '93120000-0000-4000-8000-000000000004',
  'official_website',
  'https://cross-place.example/',
  'Website for a different Place',
  '2026-07-15T12:20:00Z'
);

insert into private.verification_evidence (verification_id, evidence_id)
values (
  '93150000-0000-4000-8000-000000000002',
  '93140000-0000-4000-8000-000000000005'
);

select is(
  (select website_url from private.places
    where id = '93120000-0000-4000-8000-000000000004'),
  null,
  'A Verification for another Place cannot promote official-site Evidence'
);

select * from finish();

rollback;
