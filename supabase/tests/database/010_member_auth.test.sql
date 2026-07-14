begin;

create extension if not exists pgtap with schema extensions;

select plan(51);

select has_table('private', 'member_accounts', 'Private Member Account persistence exists');
select has_table('private', 'member_auth_events', 'Private Member auth audit persistence exists');
select has_table(
  'private',
  'account_deletion_requests',
  'Private account deletion request persistence exists'
);

select has_function(
  'public',
  'get_current_member_account',
  array[]::text[],
  'The caller has one private account projection'
);
select has_function(
  'public',
  'get_current_user_roles',
  array[]::text[],
  'The caller has one private role projection'
);
select has_function(
  'public',
  'record_member_auth_event',
  array['text', 'text'],
  'Auth events have one restricted command'
);
select has_function(
  'public',
  'begin_current_account_deletion',
  array['text', 'text', 'text'],
  'Account deletion has one caller-owned command'
);
select has_function(
  'private',
  'backfill_active_moderator_members',
  array[]::text[],
  'The migration has one repeatable active-Moderator Member backfill'
);
select has_function(
  'public',
  'provision_moderator',
  array['uuid'],
  'Production operations have one atomic Moderator provisioning command'
);

select ok(
  not has_function_privilege('anon', 'public.get_current_member_account()', 'execute'),
  'Anonymous callers cannot inspect a Member account'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.begin_current_account_deletion(text,text,text)',
    'execute'
  ),
  'Anonymous callers cannot begin deletion'
);
select ok(
  has_function_privilege('service_role', 'public.provision_moderator(uuid)', 'execute'),
  'The service role can invoke atomic Moderator provisioning'
);
select ok(
  not has_function_privilege('authenticated', 'public.provision_moderator(uuid)', 'execute'),
  'Ordinary authenticated callers cannot provision Moderators'
);

insert into auth.users (id)
values ('73900000-0000-4000-8000-000000000001');

insert into security.role_grants (user_id, role)
values ('73900000-0000-4000-8000-000000000001', 'moderator');

select private.backfill_active_moderator_members();

select is(
  (
    select count(*)
    from private.member_accounts
    where user_id = '73900000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'A pre-existing active Moderator is backfilled into a private Member account'
);

select is(
  (
    select count(*)
    from security.role_grants
    where user_id = '73900000-0000-4000-8000-000000000001'
      and role = 'member'
      and revoked_at is null
  ),
  1::bigint,
  'A pre-existing active Moderator is backfilled with one active Member role'
);

select is(
  (
    select count(*)
    from security.role_grants
    where user_id = '73900000-0000-4000-8000-000000000001'
      and role = 'moderator'
      and revoked_at is null
  ),
  1::bigint,
  'The Moderator backfill preserves the active Moderator role'
);

insert into auth.users (id)
values ('73900000-0000-4000-8000-000000000002');

set local role service_role;

select lives_ok(
  $$select public.provision_moderator('73900000-0000-4000-8000-000000000002')$$,
  'The production command atomically provisions an existing Auth user as Moderator and Member'
);

reset role;

select is(
  (
    select count(*)
    from private.member_accounts
    where user_id = '73900000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'Atomic Moderator provisioning creates one private Member account'
);

select is(
  (
    select count(*)
    from security.role_grants
    where user_id = '73900000-0000-4000-8000-000000000002'
      and role = 'member'
      and revoked_at is null
  ),
  1::bigint,
  'Atomic Moderator provisioning creates one active Member role'
);

select is(
  (
    select count(*)
    from security.role_grants
    where user_id = '73900000-0000-4000-8000-000000000002'
      and role = 'moderator'
      and revoked_at is null
  ),
  1::bigint,
  'Atomic Moderator provisioning creates one active Moderator role'
);

insert into auth.users (id)
values
  ('74000000-0000-4000-8000-000000000001'),
  ('74000000-0000-4000-8000-000000000002');

select is(
  (
    select count(*)
    from private.member_accounts
    where user_id in (
      '74000000-0000-4000-8000-000000000001',
      '74000000-0000-4000-8000-000000000002'
    )
  ),
  0::bigint,
  'Raw Auth identity insertion does not activate an application Member account'
);

select is(
  (
    select count(*)
    from security.role_grants
    where user_id = '74000000-0000-4000-8000-000000000001'
      and role = 'member'
      and revoked_at is null
  ),
  0::bigint,
  'Raw Auth identity insertion does not grant the application Member role'
);

select set_config('request.jwt.claim.sub', '74000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select throws_ok(
  $$select public.record_member_auth_event('session.signed_in', 'unactivated-auth-user')$$,
  '42501',
  'Member activation required',
  'An authenticated but unactivated Auth user cannot write Member events'
);

select throws_ok(
  $$select * from public.begin_current_account_deletion('unactivated-delete', 'en', 'member-deletion-v1')$$,
  '42501',
  'Member activation required',
  'An authenticated but unactivated Auth user cannot create Member deletion state'
);

reset role;

select set_config('request.jwt.claim.sub', '74000000-0000-4000-8000-000000000001', true);
reset role;

insert into private.member_accounts (user_id)
values ('74000000-0000-4000-8000-000000000001');

insert into security.role_grants (user_id, role)
values ('74000000-0000-4000-8000-000000000001', 'member');

set local role authenticated;

select is(
  (select member_id from public.get_current_member_account()),
  '74000000-0000-4000-8000-000000000001'::uuid,
  'The account projection returns only the caller'
);

select is(
  (select count(*) from public.get_current_user_roles()),
  1::bigint,
  'The caller sees only their active application roles'
);

select lives_ok(
  $$select public.record_member_auth_event('session.sign_out_requested', 'member-auth-test-1')$$,
  'An authenticated Member can record the allowed sign-out request event'
);

select throws_ok(
  $$select public.record_member_auth_event('provider.profile_saved', 'member-auth-test-2')$$,
  '22023',
  'Unsupported auth event',
  'Provider-profile-shaped auth events are rejected'
);

select lives_ok(
  $$
    select *
    from public.begin_current_account_deletion('member-delete-test-1', 'is', 'member-deletion-v1')
  $$,
  'An authenticated Member can begin account deletion'
);

select lives_ok(
  $$
    select *
    from public.begin_current_account_deletion('member-delete-test-2', 'is', 'member-deletion-v1')
  $$,
  'Repeating account deletion is idempotent'
);

select throws_ok(
  $$
    select *
    from public.create_candidate_place(
      '{}'::jsonb,
      '84000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'Moderator role required',
  'A Member cannot invoke a Moderator-only operation'
);

reset role;

insert into auth.users (id)
values
  ('74100000-0000-4000-8000-000000000001'),
  ('74100000-0000-4000-8000-000000000002'),
  ('74100000-0000-4000-8000-000000000003'),
  ('74100000-0000-4000-8000-000000000004');

insert into private.member_accounts (user_id)
values
  ('74100000-0000-4000-8000-000000000001'),
  ('74100000-0000-4000-8000-000000000002'),
  ('74100000-0000-4000-8000-000000000003'),
  ('74100000-0000-4000-8000-000000000004');

insert into security.role_grants (user_id, role)
values
  ('74100000-0000-4000-8000-000000000001', 'member'),
  ('74100000-0000-4000-8000-000000000002', 'member'),
  ('74100000-0000-4000-8000-000000000002', 'moderator'),
  ('74100000-0000-4000-8000-000000000003', 'member'),
  ('74100000-0000-4000-8000-000000000003', 'trusted_contributor'),
  ('74100000-0000-4000-8000-000000000004', 'member'),
  ('74100000-0000-4000-8000-000000000004', 'venue_representative');

select set_config('request.jwt.claim.sub', '74100000-0000-4000-8000-000000000001', true);
set local role authenticated;

select ok(public.has_current_user_role('member'), 'A Member has the stored Member role');
select ok(
  not public.has_current_user_role('moderator'),
  'A Member is denied the mismatched Moderator role'
);
select ok(
  not public.has_current_user_role('trusted_contributor'),
  'A Member is denied the mismatched Trusted Contributor role'
);
select ok(
  not public.has_current_user_role('venue_representative'),
  'A Member is denied the mismatched Venue Representative role'
);

reset role;
select set_config('request.jwt.claim.sub', '74100000-0000-4000-8000-000000000002', true);
set local role authenticated;

select ok(public.has_current_user_role('member'), 'A Moderator retains the stored Member role');
select ok(public.has_current_user_role('moderator'), 'A Moderator has the stored Moderator role');
select ok(
  not public.has_current_user_role('trusted_contributor'),
  'A Moderator is denied the mismatched Trusted Contributor role'
);
select ok(
  not public.has_current_user_role('venue_representative'),
  'A Moderator is denied the mismatched Venue Representative role'
);

reset role;
select set_config('request.jwt.claim.sub', '74100000-0000-4000-8000-000000000003', true);
set local role authenticated;

select ok(
  public.has_current_user_role('member'),
  'A Trusted Contributor retains the stored Member role'
);
select ok(
  not public.has_current_user_role('moderator'),
  'A Trusted Contributor is denied the mismatched Moderator role'
);
select ok(
  public.has_current_user_role('trusted_contributor'),
  'A Trusted Contributor has the stored Trusted Contributor role'
);
select ok(
  not public.has_current_user_role('venue_representative'),
  'A Trusted Contributor is denied the mismatched Venue Representative role'
);

reset role;
select set_config('request.jwt.claim.sub', '74100000-0000-4000-8000-000000000004', true);
set local role authenticated;

select ok(
  public.has_current_user_role('member'),
  'A Venue Representative retains the stored Member role'
);
select ok(
  not public.has_current_user_role('moderator'),
  'A Venue Representative is denied the mismatched Moderator role'
);
select ok(
  not public.has_current_user_role('trusted_contributor'),
  'A Venue Representative is denied the mismatched Trusted Contributor role'
);
select ok(
  public.has_current_user_role('venue_representative'),
  'A Venue Representative has the stored Venue Representative role'
);

reset role;

select is(
  (
    select count(*)
    from private.account_deletion_requests
    where user_id = '74000000-0000-4000-8000-000000000001'
      and status = 'requested'
  ),
  1::bigint,
  'Only one open deletion request exists per Member'
);

select is(
  (
    select disclosure_version
    from private.account_deletion_requests
    where user_id = '74000000-0000-4000-8000-000000000001'
  ),
  'member-deletion-v1',
  'The approved disclosure version is stored without ambiguous parameter binding'
);

select is(
  (
    select count(*)
    from private.member_auth_events
    where user_id = '74000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'Only approved minimal auth events are persisted'
);

set local role anon;

select throws_ok(
  $$select * from public.get_current_member_account()$$,
  '42501',
  null,
  'A Visitor is denied direct execution of a Member-only RPC'
);

reset role;

select * from finish();

rollback;
