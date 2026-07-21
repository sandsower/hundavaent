begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_function(
  'public',
  'list_moderation_queue_summary',
  array[]::text[],
  'Moderation exposes one lightweight queue-summary projection'
);

select ok(
  not has_function_privilege('anon', 'public.list_moderation_queue_summary()', 'execute'),
  'Anonymous callers cannot execute the moderation queue summary'
);

select ok(
  not has_function_privilege('service_role', 'public.list_moderation_queue_summary()', 'execute'),
  'The service role cannot execute the moderation queue summary as a privileged bypass'
);

select ok(
  has_function_privilege('authenticated', 'public.list_moderation_queue_summary()', 'execute'),
  'Authenticated callers can reach the role-enforced moderation queue summary'
);

insert into auth.users (id, email)
values
  ('92800000-0000-4000-8000-000000000001', 'workspace-member@example.invalid'),
  ('92800000-0000-4000-8000-000000000002', 'workspace-moderator@example.invalid');

insert into private.member_accounts (user_id)
values
  ('92800000-0000-4000-8000-000000000001'),
  ('92800000-0000-4000-8000-000000000002');

insert into security.role_grants (user_id, role)
values
  ('92800000-0000-4000-8000-000000000001', 'member'),
  ('92800000-0000-4000-8000-000000000002', 'member'),
  ('92800000-0000-4000-8000-000000000002', 'moderator');

insert into private.operators (id, name)
values
  ('92810000-0000-4000-8000-000000000001', 'Workspace queue operator 1'),
  ('92810000-0000-4000-8000-000000000002', 'Workspace queue operator 2'),
  ('92810000-0000-4000-8000-000000000003', 'Workspace queue operator 3'),
  ('92810000-0000-4000-8000-000000000004', 'Workspace queue operator 4'),
  ('92810000-0000-4000-8000-000000000005', 'Workspace queue operator 5'),
  ('92810000-0000-4000-8000-000000000006', 'Workspace queue operator 6'),
  ('92810000-0000-4000-8000-000000000007', 'Workspace queue operator 7'),
  ('92810000-0000-4000-8000-000000000008', 'Workspace queue operator 8'),
  ('92810000-0000-4000-8000-000000000009', 'Workspace queue operator 9');

insert into private.locations (
  id,
  address_line,
  locality,
  postal_code,
  municipality,
  latitude,
  longitude
)
values
  (
    '92820000-0000-4000-8000-000000000001',
    'Queue Street 1',
    'Reykjavik',
    '101',
    'reykjavik',
    64.1466,
    -21.9426
  ),
  (
    '92820000-0000-4000-8000-000000000002',
    'Queue Street 2',
    'Reykjavik',
    '101',
    'reykjavik',
    64.1476,
    -21.9436
  ),
  (
    '92820000-0000-4000-8000-000000000003',
    'Queue Street 3',
    'Reykjavik',
    '101',
    'reykjavik',
    64.1486,
    -21.9446
  );

insert into private.places (
  id,
  operator_id,
  location_id,
  purpose,
  lifecycle,
  category,
  published_at,
  created_by
)
values
  (
    '92830000-0000-4000-8000-000000000001',
    '92810000-0000-4000-8000-000000000001',
    '92820000-0000-4000-8000-000000000001',
    'dog_access_destination',
    'candidate',
    'cafe',
    null,
    '92800000-0000-4000-8000-000000000002'
  ),
  (
    '92830000-0000-4000-8000-000000000002',
    '92810000-0000-4000-8000-000000000001',
    '92820000-0000-4000-8000-000000000002',
    'dog_access_destination',
    'published',
    'restaurant',
    '2026-07-13T00:00:00Z',
    '92800000-0000-4000-8000-000000000002'
  ),
  (
    '92830000-0000-4000-8000-000000000003',
    '92810000-0000-4000-8000-000000000001',
    '92820000-0000-4000-8000-000000000003',
    'dog_access_destination',
    'inactive',
    'shop',
    null,
    '92800000-0000-4000-8000-000000000002'
  );

insert into private.place_suggestions (
  id,
  member_id,
  request_id,
  proposal,
  status,
  resolved_at
)
values
  (
    '92840000-0000-4000-8000-000000000001',
    '92800000-0000-4000-8000-000000000001',
    '92841000-0000-4000-8000-000000000001',
    '{}'::jsonb,
    'submitted',
    null
  ),
  (
    '92840000-0000-4000-8000-000000000002',
    '92800000-0000-4000-8000-000000000001',
    '92841000-0000-4000-8000-000000000002',
    '{}'::jsonb,
    'submitted',
    null
  ),
  (
    '92840000-0000-4000-8000-000000000003',
    '92800000-0000-4000-8000-000000000001',
    '92841000-0000-4000-8000-000000000003',
    '{}'::jsonb,
    'submitted',
    null
  ),
  (
    '92840000-0000-4000-8000-000000000004',
    '92800000-0000-4000-8000-000000000001',
    '92841000-0000-4000-8000-000000000004',
    '{}'::jsonb,
    'needs_information',
    null
  ),
  (
    '92840000-0000-4000-8000-000000000005',
    '92800000-0000-4000-8000-000000000001',
    '92841000-0000-4000-8000-000000000005',
    '{}'::jsonb,
    'rejected',
    '2026-07-13T00:00:00Z'
  );

insert into private.place_flags (
  id,
  member_id,
  kind,
  place_id,
  target_kind,
  target_field,
  current_value_snapshot,
  report_reason,
  explanation,
  evidence,
  status,
  request_id,
  resolved_at
)
values
  (
    '92850000-0000-4000-8000-000000000001',
    '92800000-0000-4000-8000-000000000001',
    'report',
    '92830000-0000-4000-8000-000000000002',
    'place_field',
    'phone',
    '{}'::jsonb,
    'inaccurate',
    'Submitted queue fixture',
    '{}'::jsonb,
    'submitted',
    '92851000-0000-4000-8000-000000000001',
    null
  ),
  (
    '92850000-0000-4000-8000-000000000002',
    '92800000-0000-4000-8000-000000000001',
    'report',
    '92830000-0000-4000-8000-000000000002',
    'place_field',
    'phone',
    '{}'::jsonb,
    'inaccurate',
    'Needs-information queue fixture',
    '{}'::jsonb,
    'needs_information',
    '92851000-0000-4000-8000-000000000002',
    null
  ),
  (
    '92850000-0000-4000-8000-000000000003',
    '92800000-0000-4000-8000-000000000001',
    'report',
    '92830000-0000-4000-8000-000000000002',
    'place_field',
    'phone',
    '{}'::jsonb,
    'inaccurate',
    'Resolved queue fixture',
    '{}'::jsonb,
    'rejected',
    '92851000-0000-4000-8000-000000000003',
    '2026-07-13T00:00:00Z'
  );

select set_config('request.jwt.claim.sub', '92800000-0000-4000-8000-000000000001', true);
set local role authenticated;

select throws_ok(
  $$ select * from public.list_moderation_queue_summary() $$,
  '42501',
  'Moderator role required',
  'A non-Moderator cannot inspect moderation queue totals'
);

reset role;
select set_config('request.jwt.claim.sub', '92800000-0000-4000-8000-000000000002', true);
set local role authenticated;

select results_eq(
  $$ select queue_id from public.list_moderation_queue_summary() $$,
  $$
    values
      ('suggestions'::text),
      ('corrections-and-reports'::text),
      ('candidate-places'::text)
  $$,
  'The summary returns every implemented moderation queue once in stable workspace order'
);

select is(
  (select count(*) from public.list_moderation_queue_summary()),
  3::bigint,
  'The summary returns exactly the three implemented moderation queues'
);

select is(
  (
    select pg_typeof(actionable_count)::text
    from public.list_moderation_queue_summary()
    where queue_id = 'suggestions'
  ),
  'bigint'::text,
  'Queue totals use the database count type without narrowing'
);

-- Exact predicate oracles read the private source tables as the test owner. The summary itself
-- still enforces the Moderator identity preserved in the request claim.
reset role;

select is(
  (
    select actionable_count
    from public.list_moderation_queue_summary()
    where queue_id = 'suggestions'
  ),
  (select count(*) from private.place_suggestions where status = 'submitted'),
  'Suggestions count only submitted records as actionable'
);

select is(
  (
    select actionable_count
    from public.list_moderation_queue_summary()
    where queue_id = 'corrections-and-reports'
  ),
  (
    select count(*)
    from private.place_flags
    where status = 'submitted'
  ),
  'Corrections and Reports keep deferred information requests out of the actionable count'
);

select is(
  (
    select deferred_count
    from public.list_moderation_queue_summary()
    where queue_id = 'corrections-and-reports'
  ),
  (
    select count(*)
    from private.place_flags
    where status = 'needs_information'
  ),
  'Corrections and Reports count information requests in the deferred filter'
);

select is(
  (
    select actionable_count
    from public.list_moderation_queue_summary()
    where queue_id = 'candidate-places'
  ),
  (select count(*) from private.places where lifecycle = 'candidate'),
  'Candidate Places count only unpublished Candidate lifecycle records as actionable'
);

select set_config(
  'test.moderation_workspace_suggestion_count',
  (
    select actionable_count::text
    from public.list_moderation_queue_summary()
    where queue_id = 'suggestions'
  ),
  true
);

set local role authenticated;

select lives_ok(
  $$
    select * from public.resolve_place_suggestion(
      '92840000-0000-4000-8000-000000000002',
      'needs_information',
      1,
      0,
      'Frekari upplýsinga er þörf.',
      'More information is required.',
      null,
      null,
      null,
      null,
      null,
      false,
      '92842000-0000-4000-8000-000000000001'
    )
  $$,
  'A needs-information outcome succeeds for the queue-count transition fixture'
);

select is(
  (
    select actionable_count
    from public.list_moderation_queue_summary()
    where queue_id = 'suggestions'
  ),
  current_setting('test.moderation_workspace_suggestion_count')::bigint - 1,
  'A needs-information outcome removes the Suggestion from the default actionable count'
);

select lives_ok(
  $$
    select * from public.resolve_place_suggestion(
      '92840000-0000-4000-8000-000000000003',
      'rejected',
      1,
      0,
      'Tillögunni var hafnað.',
      'The Suggestion was rejected.',
      null,
      null,
      null,
      null,
      null,
      false,
      '92842000-0000-4000-8000-000000000002'
    )
  $$,
  'A terminal outcome succeeds for the queue-count transition fixture'
);

select is(
  (
    select actionable_count
    from public.list_moderation_queue_summary()
    where queue_id = 'suggestions'
  ),
  current_setting('test.moderation_workspace_suggestion_count')::bigint - 2,
  'A terminal outcome also removes the Suggestion from the actionable count'
);

reset role;

select * from finish();

rollback;
