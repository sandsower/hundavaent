begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_type(
  'private',
  'wheelchair_accessibility',
  'Wheelchair accessibility uses a closed factual vocabulary'
);

select is(
  (
    select array_agg(enumlabel::text order by enumsortorder)
    from pg_enum
    where enumtypid = 'private.wheelchair_accessibility'::regtype
  ),
  array['accessible', 'partially_accessible', 'not_accessible', 'unknown']::text[],
  'Wheelchair accessibility has exactly the four approved states'
);

select has_column(
  'private',
  'places',
  'wheelchair_accessibility',
  'Every Place stores wheelchair accessibility'
);

select ok(
  not exists (
    select 1 from private.places where wheelchair_accessibility is null
  ),
  'Existing Places are backfilled to an explicit state'
);

select is(
  (
    select wheelchair_accessibility::text
    from private.places
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  'unknown',
  'Existing Places default to unknown'
);

select has_function(
  'public',
  'update_place_wheelchair_accessibility',
  array['jsonb', 'uuid'],
  'Moderators have one versioned wheelchair accessibility update command'
);

select has_function(
  'public',
  'list_published_places_v3',
  array['text'],
  'The compact public contract includes wheelchair accessibility'
);

select has_function(
  'public',
  'get_published_place_profile_v3',
  array['uuid', 'text'],
  'The public profile contract includes wheelchair accessibility'
);

select has_function(
  'public',
  'get_moderation_place_review_v2',
  array['uuid'],
  'The moderation review exposes wheelchair accessibility'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.update_place_wheelchair_accessibility(jsonb,uuid)',
    'execute'
  ),
  'Anonymous callers cannot update wheelchair accessibility'
);

select ok(
  has_function_privilege(
    'anon',
    'public.list_published_places_v3(text)',
    'execute'
  ),
  'Anonymous callers can read wheelchair accessibility'
);

set local role anon;

select results_eq(
  $$
    select wheelchair_accessibility
    from public.list_published_places_v3('en')
    where place_id = '30000000-0000-4000-8000-000000000003'
  $$,
  $$ values ('unknown'::text) $$,
  'The compact directory returns unknown explicitly'
);

select results_eq(
  $$
    select distinct wheelchair_accessibility
    from public.get_published_place_profile_v3(
      '30000000-0000-4000-8000-000000000003',
      'en'
    )
  $$,
  $$ values ('unknown'::text) $$,
  'The public profile returns unknown explicitly'
);

reset role;

insert into auth.users (id, email)
values
  ('c1000000-0000-4000-8000-000000000001', 'wheelchair-moderator@example.invalid'),
  ('c1000000-0000-4000-8000-000000000002', 'wheelchair-member@example.invalid');

insert into security.role_grants (user_id, role)
values ('c1000000-0000-4000-8000-000000000001', 'moderator');

select set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000002',
  true
);

set local role authenticated;

select throws_ok(
  $$
    select * from public.update_place_wheelchair_accessibility(
      jsonb_build_object(
        'place_id', '30000000-0000-4000-8000-000000000001',
        'expected_version', 1,
        'wheelchair_accessibility', 'accessible'
      ),
      'c1900000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'Moderator role required',
  'An authenticated non-Moderator cannot update wheelchair accessibility'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000001',
  true
);

set local role authenticated;

select throws_ok(
  $$
    select * from public.update_place_wheelchair_accessibility(
      jsonb_build_object(
        'place_id', '30000000-0000-4000-8000-000000000001',
        'wheelchair_accessibility', 'accessible'
      ),
      'c1900000-0000-4000-8000-000000000006'
    )
  $$,
  '22023',
  'Wheelchair accessibility update is incomplete',
  'A missing expected version is rejected'
);

select throws_ok(
  $$
    select * from public.update_place_wheelchair_accessibility(
      jsonb_build_object(
        'place_id', '30000000-0000-4000-8000-000000000001',
        'expected_version', null,
        'wheelchair_accessibility', 'accessible'
      ),
      'c1900000-0000-4000-8000-000000000007'
    )
  $$,
  '22023',
  'Wheelchair accessibility update is incomplete',
  'A null expected version is rejected'
);

reset role;

select results_eq(
  $$
    select wheelchair_accessibility::text, version
    from private.places
    where id = '30000000-0000-4000-8000-000000000001'
  $$,
  $$ values ('unknown'::text, 1::bigint) $$,
  'Rejected versionless updates leave the Place unchanged'
);

select is(
  (
    select count(*)
    from private.audit_events
    where request_id in (
      'c1900000-0000-4000-8000-000000000006',
      'c1900000-0000-4000-8000-000000000007'
    )
  ),
  0::bigint,
  'Rejected versionless updates do not append Audit Events'
);

set local role authenticated;

select results_eq(
  $$
    select wheelchair_accessibility, version
    from public.update_place_wheelchair_accessibility(
      jsonb_build_object(
        'place_id', '30000000-0000-4000-8000-000000000001',
        'expected_version', 1,
        'wheelchair_accessibility', 'accessible'
      ),
      'c1900000-0000-4000-8000-000000000002'
    )
  $$,
  $$ values ('accessible'::text, 2::bigint) $$,
  'A Moderator can confirm a Candidate as wheelchair accessible'
);

select results_eq(
  $$
    select wheelchair_accessibility, version
    from public.get_moderation_place_review_v2(
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values ('accessible'::text, 2::bigint) $$,
  'Moderation review returns the current state and version'
);

select throws_ok(
  $$
    select * from public.update_place_wheelchair_accessibility(
      jsonb_build_object(
        'place_id', '30000000-0000-4000-8000-000000000001',
        'expected_version', 1,
        'wheelchair_accessibility', 'not_accessible'
      ),
      'c1900000-0000-4000-8000-000000000003'
    )
  $$,
  '40001',
  'Place version conflict',
  'Stale Moderator updates are rejected'
);

select throws_ok(
  $$
    select * from public.update_place_wheelchair_accessibility(
      jsonb_build_object(
        'place_id', '30000000-0000-4000-8000-000000000001',
        'expected_version', 2,
        'wheelchair_accessibility', 'partial'
      ),
      'c1900000-0000-4000-8000-000000000004'
    )
  $$,
  '22023',
  'Wheelchair accessibility update is invalid',
  'Unsupported partial accessibility is rejected'
);

select results_eq(
  $$
    select wheelchair_accessibility, version
    from public.update_place_wheelchair_accessibility(
      jsonb_build_object(
        'place_id', '30000000-0000-4000-8000-000000000003',
        'expected_version', 1,
        'wheelchair_accessibility', 'not_accessible'
      ),
      'c1900000-0000-4000-8000-000000000005'
    )
  $$,
  $$ values ('not_accessible'::text, 2::bigint) $$,
  'A Moderator can update a Published Place'
);

reset role;

set local role anon;

select results_eq(
  $$
    select wheelchair_accessibility
    from public.list_published_places_v3('en')
    where place_id = '30000000-0000-4000-8000-000000000003'
  $$,
  $$ values ('not_accessible'::text) $$,
  'The compact directory reflects a published update immediately'
);

reset role;

select is(
  (
    select count(*)
    from private.audit_events
    where action = 'place.wheelchair_accessibility_updated'
      and request_id in (
        'c1900000-0000-4000-8000-000000000002',
        'c1900000-0000-4000-8000-000000000005'
      )
  ),
  2::bigint,
  'Each changed state appends an immutable Audit Event'
);

select results_eq(
  $$
    select
      change_summary ->> 'previous_wheelchair_accessibility',
      change_summary ->> 'wheelchair_accessibility',
      change_summary ->> 'version'
    from private.audit_events
    where request_id = 'c1900000-0000-4000-8000-000000000005'
  $$,
  $$ values ('unknown'::text, 'not_accessible'::text, '2'::text) $$,
  'The audit event preserves exact before and after states'
);

select * from finish();

rollback;
