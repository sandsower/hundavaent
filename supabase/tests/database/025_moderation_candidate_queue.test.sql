begin;

create extension if not exists pgtap with schema extensions;

alter table private.locations alter column geometry_precision set default 'moderator_confirmed_point';
alter table private.locations alter column geometry_source set default 'Reviewed database test fixture';

select plan(15);

select has_function(
  'public',
  'list_moderation_candidate_places',
  array['timestamptz', 'uuid', 'integer'],
  'Moderation has one keyset-paginated Candidate Place queue function'
);

select ok(
  not has_function_privilege(
    'anon', 'public.list_moderation_candidate_places(timestamptz, uuid, integer)', 'execute'
  ),
  'Anonymous callers cannot execute the Candidate queue'
);

select ok(
  not has_function_privilege(
    'service_role', 'public.list_moderation_candidate_places(timestamptz, uuid, integer)', 'execute'
  ),
  'The service role cannot execute the Candidate queue - it must run as an authenticated Moderator'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.list_moderation_candidate_places(timestamptz, uuid, integer)', 'execute'
  ),
  'Authenticated callers can reach the role-enforced Candidate queue'
);

insert into auth.users (id)
values
  ('99100000-0000-4000-8000-000000000001'),
  ('99100000-0000-4000-8000-000000000002');

insert into security.role_grants (user_id, role)
values ('99100000-0000-4000-8000-000000000001', 'moderator');

insert into private.operators (id, name)
values
  ('98200000-0000-4000-8000-000000000001', 'Candidate queue fixture operator 1'),
  ('98200000-0000-4000-8000-000000000002', 'Candidate queue fixture operator 2'),
  ('98200000-0000-4000-8000-000000000003', 'Candidate queue fixture operator 3'),
  ('98200000-0000-4000-8000-000000000004', 'Candidate queue fixture published operator'),
  ('98200000-0000-4000-8000-000000000005', 'Candidate queue fixture inactive operator');

insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude
)
values
  (
    '98300000-0000-4000-8000-000000000001', 'Biðröð staðfestingar 1', 'Reykjavík', '101',
    'reykjavik', 64.140, -21.940
  ),
  (
    '98300000-0000-4000-8000-000000000002', 'Biðröð staðfestingar 2', 'Reykjavík', '101',
    'reykjavik', 64.141, -21.941
  ),
  (
    '98300000-0000-4000-8000-000000000003', 'Biðröð staðfestingar 3', 'Reykjavík', '101',
    'reykjavik', 64.142, -21.942
  ),
  (
    '98300000-0000-4000-8000-000000000004', 'Biðröð staðfestingar 4', 'Reykjavík', '101',
    'reykjavik', 64.143, -21.943
  ),
  (
    '98300000-0000-4000-8000-000000000005', 'Biðröð staðfestingar 5', 'Reykjavík', '101',
    'reykjavik', 64.144, -21.944
  );

-- The three Candidate fixtures are timestamped well before the seeded evaluation Candidate Place
-- (2026-07-09) so ordering assertions below can rely on them sorting first regardless of whatever
-- else the shared seed data contains.
insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, version, published_at, created_at
)
values
  (
    '98100000-0000-4000-8000-000000000001', '98200000-0000-4000-8000-000000000001',
    '98300000-0000-4000-8000-000000000001', 'dog_access_destination', 'candidate', 'cafe', 1,
    null, '2000-01-01T09:00:00Z'
  ),
  (
    '98100000-0000-4000-8000-000000000002', '98200000-0000-4000-8000-000000000002',
    '98300000-0000-4000-8000-000000000002', 'dog_access_destination', 'candidate', 'restaurant', 1,
    null, '2000-01-01T09:05:00Z'
  ),
  (
    '98100000-0000-4000-8000-000000000003', '98200000-0000-4000-8000-000000000003',
    '98300000-0000-4000-8000-000000000003', 'dog_access_destination', 'candidate', 'park', 1,
    null, '2000-01-01T09:10:00Z'
  ),
  (
    '98100000-0000-4000-8000-000000000004', '98200000-0000-4000-8000-000000000004',
    '98300000-0000-4000-8000-000000000004', 'dog_access_destination', 'published', 'shop', 1,
    '2000-01-01T09:15:00Z', '2000-01-01T09:15:00Z'
  ),
  (
    '98100000-0000-4000-8000-000000000005', '98200000-0000-4000-8000-000000000005',
    '98300000-0000-4000-8000-000000000005', 'dog_access_destination', 'inactive', 'bar', 1,
    null, '2000-01-01T09:20:00Z'
  );

-- A plain authenticated Member (no Moderator role) is denied at the function boundary.
select set_config('request.jwt.claim.sub', '99100000-0000-4000-8000-000000000002', true);
set local role authenticated;

select throws_ok(
  $$ select * from public.list_moderation_candidate_places() $$,
  '42501',
  'Moderator role required',
  'A non-Moderator cannot list the Candidate queue'
);

reset role;

select set_config('request.jwt.claim.sub', '99100000-0000-4000-8000-000000000001', true);
set local role authenticated;

-- Scoped to the fixture ids rather than an absolute total, so this stays correct regardless of
-- what else the shared seed data contains.
select is(
  (
    select count(*) filter (
      where place_id in (
        '98100000-0000-4000-8000-000000000001',
        '98100000-0000-4000-8000-000000000002',
        '98100000-0000-4000-8000-000000000003'
      )
    )
    from public.list_moderation_candidate_places()
  ),
  3::bigint,
  'All three fixture Candidate Places appear in the Moderator queue'
);

select ok(
  not exists (
    select 1 from public.list_moderation_candidate_places()
    where place_id in (
      '98100000-0000-4000-8000-000000000004',
      '98100000-0000-4000-8000-000000000005'
    )
  ),
  'Published and inactive Places are excluded from the Candidate queue'
);

select is(
  (select place_id from public.list_moderation_candidate_places(null, null, 1)),
  '98100000-0000-4000-8000-000000000001'::uuid,
  'The queue lists the oldest Candidate Place first'
);

select results_eq(
  $$
    select operator_name, category, address_line, locality, municipality
    from public.list_moderation_candidate_places(null, null, 1)
  $$,
  $$
    values (
      'Candidate queue fixture operator 1'::text, 'cafe'::text, 'Biðröð staðfestingar 1'::text,
      'Reykjavík'::text, 'reykjavik'::text
    )
  $$,
  'The queue joins the Operator name and Location fields for the oldest Candidate'
);

select is(
  (select count(*) from public.list_moderation_candidate_places(null, null, 1)),
  1::bigint,
  'The Candidate queue enforces the requested page size'
);

select is(
  (
    select count(*) filter (
      where place_id in (
        '98100000-0000-4000-8000-000000000001',
        '98100000-0000-4000-8000-000000000002',
        '98100000-0000-4000-8000-000000000003'
      )
    )
    from public.list_moderation_candidate_places(null, null, 10000)
  ),
  3::bigint,
  'An oversized page-size request is clamped without erroring, still returning every fixture match'
);

select is(
  (
    with first_page as (
      select * from public.list_moderation_candidate_places(null, null, 1)
    )
    select count(*)
    from first_page,
      lateral public.list_moderation_candidate_places(
        first_page.created_at,
        first_page.place_id,
        1
      ) as second_page
    where second_page.place_id <> first_page.place_id
  ),
  1::bigint,
  'Candidate queue cursor advances to the next Place without duplication'
);

select is(
  (
    with first_page as (
      select * from public.list_moderation_candidate_places(null, null, 1)
    )
    select second_page.place_id
    from first_page,
      lateral public.list_moderation_candidate_places(
        first_page.created_at,
        first_page.place_id,
        1
      ) as second_page
  ),
  '98100000-0000-4000-8000-000000000002'::uuid,
  'The cursor round-trip lands on the next-oldest Candidate Place'
);

select throws_ok(
  $$
    select * from public.list_moderation_candidate_places('2026-01-01T00:00:00Z'::timestamptz, null, 20)
  $$,
  '22023',
  'Candidate queue cursor is invalid',
  'A cursor timestamp without a matching Place id is rejected'
);

select throws_ok(
  $$
    select * from public.list_moderation_candidate_places(
      null, '98100000-0000-4000-8000-000000000001'::uuid, 20
    )
  $$,
  '22023',
  'Candidate queue cursor is invalid',
  'A cursor Place id without a matching timestamp is rejected'
);

reset role;

select * from finish();

rollback;
