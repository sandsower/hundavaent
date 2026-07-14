begin;

create extension if not exists pgtap with schema extensions;

select plan(47);

select has_table('private', 'check_ins', 'Private Check-in persistence exists');
select has_table('private', 'check_in_policy', 'Fail-closed Check-in policy singleton exists');
select has_function(
  'public',
  'record_check_in',
  array['uuid', 'text', 'uuid'],
  'Check-in recording accepts only a Place, a client-computed proximity string, and a request ID'
);
select has_function(
  'public',
  'get_current_check_in_status',
  array['uuid'],
  'The caller can read their own current Check-in status for a Place'
);
select has_function('public', 'get_check_in_policy', array[]::text[], 'Policy readability exists');
select has_function(
  'public',
  'configure_check_in_policy',
  array['text', 'boolean'],
  'The policy is configured, never hard-coded'
);
select has_function(
  'public',
  'get_support_check_in',
  array['uuid', 'text', 'uuid'],
  'A narrow, reason-required Moderator read exists'
);
select has_function(
  'private',
  'detach_member_check_ins',
  array['uuid'],
  'Account deletion has a private cleanup seam'
);

-- The proximity decision is computed entirely client-side (src/lib/check-ins/proximity.ts) and
-- only a tri-state string ever reaches the database. Prove structurally that no coordinate,
-- accuracy, or distance-shaped column or parameter exists anywhere in this migration's surface.
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'private'
      and table_name in ('check_ins', 'check_in_policy')
      and (
        column_name ilike '%latitude%'
        or column_name ilike '%longitude%'
        or column_name ilike '%accuracy%'
        or column_name ilike '%distance%'
        or column_name ilike '%coordinate%'
      )
  ),
  0::bigint,
  'Check-in persistence has no coordinate, accuracy, or distance column'
);
select is(
  (
    select count(*)
    from information_schema.parameters
    where specific_schema = 'public'
      and specific_name like 'record_check_in_%'
      and (
        parameter_name ilike '%latitude%'
        or parameter_name ilike '%longitude%'
        or parameter_name ilike '%accuracy%'
        or parameter_name ilike '%distance%'
        or parameter_name ilike '%coordinate%'
      )
  ),
  0::bigint,
  'Check-in recording accepts no coordinate, accuracy, or distance parameter'
);

select ok(
  not has_table_privilege('anon', 'private.check_ins', 'select,insert,update,delete'),
  'Visitors cannot inspect or mutate Check-in rows'
);
select ok(
  not has_table_privilege('authenticated', 'private.check_ins', 'select,insert,update,delete'),
  'Members cannot bypass the caller-owned RPC surface'
);
select ok(
  not has_table_privilege('service_role', 'private.check_ins', 'select,insert,update,delete'),
  'The service role cannot use Check-in rows as an unrestricted query surface'
);
select ok(
  not has_function_privilege('anon', 'public.record_check_in(uuid,text,uuid)', 'execute'),
  'Visitors cannot record a Check-in'
);
select ok(
  has_function_privilege('authenticated', 'public.record_check_in(uuid,text,uuid)', 'execute'),
  'Authenticated callers can record a Check-in'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.configure_check_in_policy(text,boolean)',
    'execute'
  ),
  'Members cannot configure the Check-in policy'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.configure_check_in_policy(text,boolean)',
    'execute'
  ),
  'Only the service role configures the Check-in policy'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.detach_member_check_ins(uuid)',
    'execute'
  ),
  'Members cannot invoke the deferred account cleanup seam'
);
select ok(
  not has_function_privilege('service_role', 'private.detach_member_check_ins(uuid)', 'execute'),
  'account-deletion must explicitly adopt the cleanup seam before using it'
);

select is(
  (select proximity_assist_enabled from public.get_check_in_policy()),
  false,
  'The proximity assist ships disabled fail-closed with no policy row configured'
);

insert into auth.users (id)
values
  ('77000000-0000-4000-8000-000000000001'),
  ('77000000-0000-4000-8000-000000000002'),
  ('77000000-0000-4000-8000-000000000003'),
  ('77000000-0000-4000-8000-000000000004');

insert into private.member_accounts (user_id)
values
  ('77000000-0000-4000-8000-000000000001'),
  ('77000000-0000-4000-8000-000000000002');

insert into security.role_grants (user_id, role)
values
  ('77000000-0000-4000-8000-000000000001', 'member'),
  ('77000000-0000-4000-8000-000000000002', 'member'),
  ('77000000-0000-4000-8000-000000000004', 'moderator');

select set_config('request.jwt.claim.sub', '77000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select throws_ok(
  $$select * from public.record_check_in('30000000-0000-4000-8000-000000000002', 'unknown', extensions.gen_random_uuid())$$,
  '42501',
  'Member activation required',
  'An Auth identity without a Member account cannot record a Check-in'
);

reset role;
select set_config('request.jwt.claim.sub', '77000000-0000-4000-8000-000000000001', true);
set local role authenticated;

-- Place 30000000-...-000002 is Published but has no verified Access Condition (it fails the
-- Favourites discoverability check in 014_favourites.test.sql). A Check-in only requires the Place
-- to currently be Published, not a full verified Dog Access chain, which this proves directly.
select throws_ok(
  $$select * from public.record_check_in('30000000-0000-4000-8000-000000000001', 'unknown', extensions.gen_random_uuid())$$,
  '22023',
  'Published Place required',
  'A Candidate Place cannot receive a Check-in'
);

select is(
  (
    select proximity_confirmed
    from public.record_check_in('30000000-0000-4000-8000-000000000002', null, extensions.gen_random_uuid())
  ),
  'unknown',
  'Omitting the proximity decision records unknown, matching the no-location path'
);

select throws_ok(
  $$select * from public.record_check_in('30000000-0000-4000-8000-000000000002', 'bogus', extensions.gen_random_uuid())$$,
  '22023',
  'Proximity status is invalid',
  'An unrecognized proximity string is rejected'
);

select is(
  (select has_recent_check_in from public.get_current_check_in_status('30000000-0000-4000-8000-000000000002')),
  true,
  'The caller sees their own current Check-in status'
);

select is(
  (select has_recent_check_in from public.get_current_check_in_status('30000000-0000-4000-8000-000000000003')),
  false,
  'A Place never checked into shows no current Check-in'
);

-- A brand-new Place/Member pair, isolated from the "unknown" Check-in recorded above, so the
-- exact-request-id-replay and rolling-window assertions below observe a clean history.
select is(
  (
    select already_checked_in
    from public.record_check_in(
      '30000000-0000-4000-8000-000000000003',
      'confirmed',
      '78000000-0000-4000-8000-000000000001'
    )
  ),
  false,
  'A first Check-in on a fresh Place is not a duplicate'
);
select is(
  (
    select proximity_confirmed
    from public.record_check_in(
      '30000000-0000-4000-8000-000000000003',
      'confirmed',
      '78000000-0000-4000-8000-000000000001'
    )
  ),
  'confirmed',
  'Exact request-id replay returns the original recorded proximity decision'
);
select is(
  (
    select already_checked_in
    from public.record_check_in(
      '30000000-0000-4000-8000-000000000003',
      'confirmed',
      '78000000-0000-4000-8000-000000000001'
    )
  ),
  true,
  'Exact request-id replay is reported as an existing Check-in (double-submit protection)'
);
select is(
  (
    select count(*)
    from public.record_check_in(
      '30000000-0000-4000-8000-000000000003',
      'confirmed',
      '78000000-0000-4000-8000-000000000001'
    )
  ),
  1::bigint,
  'Exact request-id replay never inserts a second row'
);

select is(
  (
    select proximity_confirmed
    from public.record_check_in(
      '30000000-0000-4000-8000-000000000003',
      'not_confirmed',
      '78000000-0000-4000-8000-000000000002'
    )
  ),
  'confirmed',
  'A duplicate submission within the rolling 24-hour window returns the first recorded decision unchanged'
);
select is(
  (
    select already_checked_in
    from public.record_check_in(
      '30000000-0000-4000-8000-000000000003',
      'not_confirmed',
      '78000000-0000-4000-8000-000000000002'
    )
  ),
  true,
  'A duplicate submission with a different request ID inside the window is reported as already checked in'
);

reset role;
select is(
  (select count(*) from private.check_ins where member_id = '77000000-0000-4000-8000-000000000001'::uuid),
  2::bigint,
  'Two distinct Places yield exactly two stored Check-in rows for this Member'
);

-- An out-of-range self-report never blocks or errors, matching the approved proximity policy.
select lives_ok(
  $$
    select set_config('request.jwt.claim.sub', '77000000-0000-4000-8000-000000000002', true);
    set local role authenticated;
    select * from public.record_check_in(
      '30000000-0000-4000-8000-000000000003',
      'not_confirmed',
      extensions.gen_random_uuid()
    );
  $$,
  'An out-of-range proximity decision still succeeds as a private self-report'
);

reset role;
select set_config('request.jwt.claim.sub', '77000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is(
  (select count(*) from public.get_current_check_in_status('30000000-0000-4000-8000-000000000002')),
  1::bigint,
  'Another Member cannot infer the first Member Check-in through their own status read'
);
select is(
  (select has_recent_check_in from public.get_current_check_in_status('30000000-0000-4000-8000-000000000002')),
  false,
  'Another Member has no current Check-in on a Place only the first Member visited'
);

reset role;

-- Place becomes Inactive mid-action: lock-time recheck rejects it even though it was Published
-- when the Member opened the Place Profile. Member 2 has no existing Check-in on Place 000002 (as
-- proven above), so this exercises the lifecycle recheck rather than the duplicate-window path.
update private.places set lifecycle = 'inactive' where id = '30000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub', '77000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok(
  $$select * from public.record_check_in('30000000-0000-4000-8000-000000000002', 'unknown', extensions.gen_random_uuid())$$,
  '22023',
  'Published Place required',
  'A Place that became Inactive before commit rejects a new Check-in with a recoverable error'
);
reset role;
update private.places set lifecycle = 'published' where id = '30000000-0000-4000-8000-000000000002';

-- Moderator support access: narrow, reason-required, and audited. This resolves back to the
-- existing window-deduplicated Check-in on Place 000003 recorded earlier for Member 1.
select set_config('request.jwt.claim.sub', '77000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select check_in_id into temporary table support_target_check_in
from public.record_check_in(
  '30000000-0000-4000-8000-000000000003',
  'confirmed',
  '78000000-0000-4000-8000-000000000003'
);

reset role;
select set_config('request.jwt.claim.sub', '77000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok(
  format(
    $$select * from public.get_support_check_in('%s', 'Support investigation', extensions.gen_random_uuid())$$,
    (select check_in_id from support_target_check_in)
  ),
  '42501',
  'Moderator role required',
  'A Member cannot use the Moderator-only support read, even for their own Check-in'
);

reset role;
select set_config('request.jwt.claim.sub', '77000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select throws_ok(
  format(
    $$select * from public.get_support_check_in('%s', '', extensions.gen_random_uuid())$$,
    (select check_in_id from support_target_check_in)
  ),
  '22023',
  'A support reason is required',
  'A Moderator must supply an explicit non-empty support reason'
);
select is(
  (
    select member_id
    from public.get_support_check_in(
      (select check_in_id from support_target_check_in),
      'Support investigation for a Member complaint',
      '79000000-0000-4000-8000-000000000001'
    )
  ),
  '77000000-0000-4000-8000-000000000001'::uuid,
  'A Moderator with an explicit reason can read exactly one named Check-in'
);

reset role;
select is(
  (
    select count(*)
    from private.audit_events
    where subject_type = 'check_in'
      and action = 'check_in.support_access'
      and request_id = '79000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'Support access to a private Check-in is itself an audited action'
);

-- Fail-closed policy configuration and reconfiguration.
select is(
  (select proximity_assist_enabled from public.get_check_in_policy()),
  false,
  'The proximity assist remains disabled before any explicit configuration'
);
set local role service_role;
select lives_ok(
  $$select public.configure_check_in_policy('e2e-test-only-v1', true)$$,
  'The service role can enable the proximity assist'
);
select throws_ok(
  $$select public.configure_check_in_policy('', true)$$,
  '22023',
  'Check-in policy is invalid',
  'An empty policy version is rejected'
);
reset role;
select is(
  (select proximity_assist_enabled from public.get_check_in_policy()),
  true,
  'The proximity assist reports enabled once explicitly configured'
);

set local role anon;
select throws_ok(
  $$select * from public.record_check_in('30000000-0000-4000-8000-000000000003', 'unknown', extensions.gen_random_uuid())$$,
  '42501',
  null,
  'A Visitor cannot record a Check-in'
);
select throws_ok(
  $$select * from public.get_current_check_in_status('30000000-0000-4000-8000-000000000003')$$,
  '42501',
  null,
  'A Visitor cannot query private Check-in status'
);

reset role;

select * from finish();

rollback;
