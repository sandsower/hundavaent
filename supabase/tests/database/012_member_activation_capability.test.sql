begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into private.member_activation_capabilities (secret)
values ('local-member-activation-capability-secret-v1')
on conflict (singleton)
do update set secret = excluded.secret;

insert into auth.users (id, email, email_confirmed_at)
values
  ('74200000-0000-4000-8000-000000000001', 'zero@example.invalid', now()),
  ('74200000-0000-4000-8000-000000000002', 'facebook@example.invalid', now()),
  ('74200000-0000-4000-8000-000000000003', 'multiple@example.invalid', now()),
  ('74200000-0000-4000-8000-000000000004', 'policy@example.invalid', now()),
  ('74200000-0000-4000-8000-000000000005', ' Valid@Example.Invalid ', now()),
  ('74200000-0000-4000-8000-000000000006', 'rollback@example.invalid', now()),
  ('74200000-0000-4000-8000-000000000007', 'missing@example.invalid', now()),
  ('74200000-0000-4000-8000-000000000008', 'blank@example.invalid', now()),
  ('74200000-0000-4000-8000-000000000009', 'canonical@example.invalid', now());

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    '74210000-0000-4000-8000-000000000001',
    'facebook-provider-1',
    '74200000-0000-4000-8000-000000000002',
    '{"email":"facebook@example.invalid"}'::jsonb,
    'facebook',
    now(),
    now(),
    now()
  ),
  (
    '74210000-0000-4000-8000-000000000002',
    'multiple-email-provider',
    '74200000-0000-4000-8000-000000000003',
    '{"email":"multiple@example.invalid"}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '74210000-0000-4000-8000-000000000003',
    'multiple-facebook-provider',
    '74200000-0000-4000-8000-000000000003',
    '{"email":"multiple@example.invalid"}'::jsonb,
    'facebook',
    now(),
    now(),
    now()
  ),
  (
    '74210000-0000-4000-8000-000000000004',
    'policy-email-provider',
    '74200000-0000-4000-8000-000000000004',
    '{"email":"policy@example.invalid"}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '74210000-0000-4000-8000-000000000005',
    'valid-email-provider',
    '74200000-0000-4000-8000-000000000005',
    '{"email":"valid@example.invalid"}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '74210000-0000-4000-8000-000000000006',
    'rollback-email-provider',
    '74200000-0000-4000-8000-000000000006',
    '{"email":"rollback@example.invalid"}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '74210000-0000-4000-8000-000000000007',
    'missing-email-provider',
    '74200000-0000-4000-8000-000000000007',
    '{}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '74210000-0000-4000-8000-000000000008',
    'blank-email-provider',
    '74200000-0000-4000-8000-000000000008',
    '{"email":"   "}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '74210000-0000-4000-8000-000000000009',
    'mismatched-email-provider',
    '74200000-0000-4000-8000-000000000009',
    '{"email":"different@example.invalid"}'::jsonb,
    'email',
    now(),
    now(),
    now()
  );

select set_config('request.jwt.claim.sub', '74200000-0000-4000-8000-000000000001', true);
set local role authenticated;

select throws_ok(
  $$select public.activate_current_member(repeat('0', 64), 'zero-identity')$$,
  '42501',
  'Approved verified identities required',
  'A direct authenticated RPC call with zero identities is denied'
);

reset role;
select set_config('request.jwt.claim.sub', '74200000-0000-4000-8000-000000000007', true);
set local role authenticated;
select throws_ok(
  $$select public.activate_current_member(repeat('0', 64), 'missing-identity-email')$$,
  '42501',
  'Approved verified identities required',
  'An approved identity without an email is denied'
);

reset role;
select set_config('request.jwt.claim.sub', '74200000-0000-4000-8000-000000000008', true);
set local role authenticated;
select throws_ok(
  $$select public.activate_current_member(repeat('0', 64), 'blank-identity-email')$$,
  '42501',
  'Approved verified identities required',
  'An approved identity with a blank email is denied'
);

reset role;
select set_config('request.jwt.claim.sub', '74200000-0000-4000-8000-000000000009', true);
set local role authenticated;
select throws_ok(
  $$select public.activate_current_member(repeat('0', 64), 'mismatched-identity-email')$$,
  '42501',
  'Approved verified identities required',
  'An approved identity with a different email is denied'
);

reset role;
select set_config('request.jwt.claim.sub', '74200000-0000-4000-8000-000000000002', true);
set local role authenticated;

select throws_ok(
  $$select public.activate_current_member(repeat('0', 64), 'facebook-identity')$$,
  '42501',
  'Valid callback capability required',
  'A supported Facebook identity still requires the callback capability'
);

reset role;
select set_config('request.jwt.claim.sub', '74200000-0000-4000-8000-000000000003', true);
set local role authenticated;

select throws_ok(
  $$select public.activate_current_member(repeat('0', 64), 'multiple-identities')$$,
  '42501',
  'Valid callback capability required',
  'Linked email and Facebook identities still require the callback capability'
);

reset role;
delete from private.member_provider_policy where singleton;
select set_config('request.jwt.claim.sub', '74200000-0000-4000-8000-000000000004', true);
set local role authenticated;

select throws_ok(
  $$select public.activate_current_member(repeat('0', 64), 'missing-policy')$$,
  '42501',
  'Supported Member provider policy required',
  'A direct authenticated RPC call without the supported policy is denied'
);

reset role;
insert into private.member_provider_policy (
  policy_version,
  email_enabled,
  facebook_enabled,
  automatic_linking_verified_email
)
values ('member-linked-providers-v2', true, true, true);

select set_config('request.jwt.claim.sub', '74200000-0000-4000-8000-000000000005', true);
set local role authenticated;

select throws_ok(
  $$select public.activate_current_member(repeat('0', 64), 'invalid-proof')$$,
  '42501',
  'Valid callback capability required',
  'An exact email identity still cannot activate without the callback capability'
);

reset role;
select set_config(
  'test.activation_proof',
  encode(
    extensions.hmac(
      '74200000-0000-4000-8000-000000000005:valid-callback:member-linked-providers-v2',
      'local-member-activation-capability-secret-v1',
      'sha256'
    ),
    'hex'
  ),
  true
);
select set_config('request.jwt.claim.sub', '74200000-0000-4000-8000-000000000005', true);
set local role authenticated;

select lives_ok(
  $$
    select public.activate_current_member(
      current_setting('test.activation_proof'),
      'valid-callback'
    )
  $$,
  'The intended callback path activates one exact email identity with a valid proof'
);

reset role;

select is(
  (
    select count(*)
    from private.member_accounts
    where user_id = '74200000-0000-4000-8000-000000000005'
  ),
  1::bigint,
  'The valid callback creates one Member account'
);

select is(
  (
    select count(*)
    from security.role_grants
    where user_id = '74200000-0000-4000-8000-000000000005'
      and role = 'member'
      and revoked_at is null
  ),
  1::bigint,
  'The valid callback creates one active Member role'
);

select is(
  (
    select count(*)
    from private.member_auth_events
    where user_id = '74200000-0000-4000-8000-000000000005'
      and action = 'session.signed_in'
      and request_id = 'valid-callback'
  ),
  1::bigint,
  'The valid callback atomically records the required signed-in event'
);

create function private.force_member_auth_event_failure()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'forced member auth event failure';
end;
$$;

create trigger force_member_auth_event_failure
before insert on private.member_auth_events
for each row execute function private.force_member_auth_event_failure();

select set_config(
  'test.activation_proof',
  encode(
    extensions.hmac(
      '74200000-0000-4000-8000-000000000006:forced-audit-failure:member-linked-providers-v2',
      'local-member-activation-capability-secret-v1',
      'sha256'
    ),
    'hex'
  ),
  true
);
select set_config('request.jwt.claim.sub', '74200000-0000-4000-8000-000000000006', true);
set local role authenticated;

select throws_ok(
  $$
    select public.activate_current_member(
      current_setting('test.activation_proof'),
      'forced-audit-failure'
    )
  $$,
  'P0001',
  'forced member auth event failure',
  'A required signed-in audit failure aborts the atomic activation command'
);

reset role;

select is(
  (
    select count(*)
    from private.member_accounts
    where user_id = '74200000-0000-4000-8000-000000000006'
  ),
  0::bigint,
  'Audit failure rolls back the Member account'
);

select is(
  (
    select count(*)
    from security.role_grants
    where user_id = '74200000-0000-4000-8000-000000000006'
      and role = 'member'
      and revoked_at is null
  ),
  0::bigint,
  'Audit failure rolls back the Member role'
);

select is(
  (
    select count(*)
    from private.member_auth_events
    where user_id = '74200000-0000-4000-8000-000000000006'
  ),
  0::bigint,
  'Audit failure leaves no signed-in event'
);

select * from finish();

rollback;
