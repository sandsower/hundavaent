insert into private.member_activation_capabilities (secret)
values ('local-member-activation-capability-secret-v1');

insert into private.operators (id, name, created_at, updated_at)
values (
  '10000000-0000-4000-8000-000000000001',
  'Hundavænt fixture operator',
  '2026-07-09T09:00:00Z',
  '2026-07-09T09:00:00Z'
);

insert into private.locations (
  id,
  address_line,
  locality,
  postal_code,
  country_code,
  municipality,
  latitude,
  longitude,
  geometry_precision,
  geometry_source,
  created_at,
  updated_at
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
    -21.9426,
    'moderator_confirmed_point',
    'Local fixture coordinates confirmed for automated tests',
    '2026-07-09T09:00:00Z',
    '2026-07-09T09:00:00Z'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'Óstaðfest gata 2',
    'Reykjavík',
    '105',
    'IS',
    'reykjavik',
    64.1374,
    -21.9117,
    'moderator_confirmed_point',
    'Local fixture coordinates confirmed for automated tests',
    '2026-07-09T09:00:00Z',
    '2026-07-09T09:00:00Z'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'Staðfest gata 3',
    'Reykjavík',
    '107',
    'IS',
    'reykjavik',
    64.1423,
    -21.9555,
    'moderator_confirmed_point',
    'Local fixture coordinates confirmed for automated tests',
    '2026-07-09T09:00:00Z',
    '2026-07-09T09:00:00Z'
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
  published_at,
  created_at,
  updated_at
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
    null,
    '2026-07-09T09:00:00Z',
    '2026-07-09T09:00:00Z'
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
    '2026-07-09T11:00:00Z',
    '2026-07-09T09:00:00Z',
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
    '2026-07-09T11:00:00Z',
    '2026-07-09T09:00:00Z',
    '2026-07-09T11:00:00Z'
  );

insert into private.place_translations (
  place_id,
  locale,
  name,
  description,
  created_at,
  updated_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    'is',
    'Tillaga að stað',
    'Frambjóðandi sem á ekki að birtast.',
    '2026-07-09T09:00:00Z',
    '2026-07-09T09:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000000001',
    'en',
    'Candidate Place',
    'A Candidate that must not be public.',
    '2026-07-09T09:00:00Z',
    '2026-07-09T09:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'is',
    'Óstaðfestur staður',
    'Birtur en óstaðfestur staður sem á ekki að sjást.',
    '2026-07-09T09:00:00Z',
    '2026-07-09T09:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'en',
    'Unverified Place',
    'A Published but unverified Place that must not be public.',
    '2026-07-09T09:00:00Z',
    '2026-07-09T09:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    'is',
    'Birtur staður',
    'Staðfestur hundvænn staður.',
    '2026-07-09T09:00:00Z',
    '2026-07-09T11:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    'en',
    'Published Place',
    'A verified dog-friendly Place.',
    '2026-07-09T09:00:00Z',
    '2026-07-09T11:00:00Z'
  );

insert into private.access_conditions (
  id,
  place_id,
  revision,
  access_area,
  restraint_condition,
  dog_eligibility,
  availability_state,
  availability_window,
  permission_requirement,
  created_at
)
values (
  '40000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000003',
  1,
  'outdoors',
  'leash_required',
  '{"scope":"all_dogs"}'::jsonb,
  'whenever_open',
  '{}'::jsonb,
  'standing_permission',
  '2026-07-09T10:00:00Z'
);

insert into private.evidence (
  id,
  place_id,
  kind,
  source_url,
  source_label,
  observed_at,
  source_metadata,
  created_at
)
values (
  '50000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000003',
  'official_website',
  'https://example.invalid/verified-place/dog-access',
  'Official Place website',
  '2026-07-09T10:00:00Z',
  '{}'::jsonb,
  '2026-07-09T10:00:00Z'
);

insert into private.verifications (
  id,
  access_condition_id,
  status,
  verified_at,
  freshness_until,
  decision_metadata,
  created_at
)
values (
  '60000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000003',
  'verified',
  '2026-07-09T11:00:00Z',
  '2099-01-01T00:00:00Z',
  '{}'::jsonb,
  '2026-07-09T11:00:00Z'
);

insert into private.verification_evidence (verification_id, evidence_id)
values (
  '60000000-0000-4000-8000-000000000003',
  '50000000-0000-4000-8000-000000000003'
);
