begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_function(
  'public',
  'update_moderated_place_location',
  array['jsonb', 'uuid'],
  'Moderators have one location-correction command for reviewable Places'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.update_moderated_place_location(jsonb,uuid)',
    'execute'
  ),
  'Anonymous callers cannot correct Place locations'
);

insert into auth.users (id, email)
values
  ('c2000000-0000-4000-8000-000000000001', 'published-location@example.invalid'),
  ('c2000000-0000-4000-8000-000000000002', 'location-member@example.invalid');

insert into security.role_grants (user_id, role)
values ('c2000000-0000-4000-8000-000000000001', 'moderator');

select set_config(
  'request.jwt.claim.sub',
  'c2000000-0000-4000-8000-000000000002',
  true
);

set local role authenticated;

select throws_ok(
  $$
    select * from public.update_moderated_place_location(
      jsonb_build_object(
        'place_id', '30000000-0000-4000-8000-000000000003',
        'expected_version', 1,
        'address_line', 'Unauthorized correction',
        'locality', 'Reykjavík',
        'postal_code', '107',
        'municipality', 'reykjavik',
        'latitude', 64.1,
        'longitude', -21.9,
        'geometry_precision', 'moderator_confirmed_point',
        'geometry_source', 'Unauthorized correction'
      ),
      'c2900000-0000-4000-8000-000000000000'
    )
  $$,
  '42501',
  'Moderator role required',
  'An authenticated non-Moderator cannot correct a Place location'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  'c2000000-0000-4000-8000-000000000001',
  true
);

set local role authenticated;

select throws_ok(
  $$
    select * from public.update_candidate_place_location(
      jsonb_build_object(
        'place_id', '30000000-0000-4000-8000-000000000003',
        'expected_version', 1,
        'address_line', 'Corrected street 3',
        'locality', 'Reykjavík',
        'postal_code', '107',
        'municipality', 'reykjavik',
        'latitude', 64.14231,
        'longitude', -21.95551,
        'geometry_precision', 'official_address_point',
        'geometry_source', 'Official published-place correction'
      ),
      'c2900000-0000-4000-8000-000000000001'
    )
  $$,
  '55000',
  'Place is not a Candidate',
  'The compatibility command retains its Candidate-only boundary'
);

select results_eq(
  $$
    select geometry_precision, version
    from public.update_moderated_place_location(
      jsonb_build_object(
        'place_id', '30000000-0000-4000-8000-000000000003',
        'expected_version', 1,
        'address_line', 'Corrected street 3',
        'locality', 'Reykjavík',
        'postal_code', '107',
        'municipality', 'reykjavik',
        'latitude', 64.14231,
        'longitude', -21.95551,
        'geometry_precision', 'official_address_point',
        'geometry_source', 'Official published-place correction'
      ),
      'c2900000-0000-4000-8000-000000000002'
    )
  $$,
  $$ values ('official_address_point'::text, 2::bigint) $$,
  'A Moderator can correct a Published Place without reopening it'
);

select throws_ok(
  $$
    select * from public.update_moderated_place_location(
      jsonb_build_object(
        'place_id', '30000000-0000-4000-8000-000000000003',
        'expected_version', 1,
        'address_line', 'Stale correction',
        'locality', 'Reykjavík',
        'postal_code', '107',
        'municipality', 'reykjavik',
        'latitude', 64.1,
        'longitude', -21.9,
        'geometry_precision', 'moderator_confirmed_point',
        'geometry_source', 'Stale correction'
      ),
      'c2900000-0000-4000-8000-000000000003'
    )
  $$,
  '40001',
  'Place version conflict',
  'Published location corrections reject stale versions'
);

reset role;

select results_eq(
  $$
    select lifecycle::text, version
    from private.places
    where id = '30000000-0000-4000-8000-000000000003'
  $$,
  $$ values ('published'::text, 2::bigint) $$,
  'A correction preserves the Published lifecycle and advances the version'
);

select results_eq(
  $$
    select latitude, longitude
    from public.list_published_places_v3('en')
    where place_id = '30000000-0000-4000-8000-000000000003'
  $$,
  $$ values (64.14231::double precision, -21.95551::double precision) $$,
  'The public directory reflects corrected Published coordinates immediately'
);

select results_eq(
  $$
    select
      change_summary #>> '{previous_location,address_line}',
      change_summary #>> '{location,address_line}',
      change_summary #>> '{location,geometry_source}',
      change_summary ->> 'version'
    from private.audit_events
    where action = 'place.location_corrected'
      and request_id = 'c2900000-0000-4000-8000-000000000002'
  $$,
  $$ values (
    'Staðfest gata 3'::text,
    'Corrected street 3'::text,
    'Official published-place correction'::text,
    '2'::text
  ) $$,
  'The audit event preserves exact before and after location state'
);

select * from finish();

rollback;
