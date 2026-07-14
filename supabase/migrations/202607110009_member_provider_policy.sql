begin;

create table private.member_provider_policy (
  singleton boolean primary key default true check (singleton),
  provider text not null,
  policy_version text not null,
  established_at timestamptz not null default statement_timestamp(),
  constraint member_provider_policy_supported_tuple_check check (
    provider = 'email' and policy_version = 'member-single-provider-v1'
  )
);

alter table private.member_provider_policy enable row level security;

create table private.member_activation_capabilities (
  singleton boolean primary key default true check (singleton),
  secret text not null check (length(secret) >= 32),
  configured_at timestamptz not null default statement_timestamp()
);

alter table private.member_activation_capabilities enable row level security;

insert into private.member_provider_policy (provider, policy_version)
values ('email', 'member-single-provider-v1');

create function public.get_member_provider_policy()
returns table (provider text, policy_version text)
language sql
stable
security definer
set search_path = ''
as $$
  select policy.provider, policy.policy_version
  from private.member_provider_policy as policy
  where policy.singleton
$$;

revoke execute on function public.get_member_provider_policy()
from public, service_role;

grant execute on function public.get_member_provider_policy()
to anon, authenticated;

create function public.configure_member_activation_capability(command_secret text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if command_secret is null or length(command_secret) < 32 then
    raise exception using errcode = '22023', message = 'Strong activation capability required';
  end if;

  insert into private.member_activation_capabilities (secret, configured_at)
  values (command_secret, statement_timestamp())
  on conflict (singleton)
  do update set
    secret = excluded.secret,
    configured_at = excluded.configured_at;
end;
$$;

create function public.activate_current_member(
  activation_proof text,
  activation_request_id text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  auth_created_at timestamptz;
  capability_secret text;
  identity_count bigint;
  email_identity_count bigint;
  expected_proof text;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not exists (
    select 1
    from private.member_provider_policy as policy
    where policy.singleton
      and policy.provider = 'email'
      and policy.policy_version = 'member-single-provider-v1'
  ) then
    raise exception using errcode = '42501', message = 'Supported Member provider policy required';
  end if;

  if activation_request_id is null
    or btrim(activation_request_id) = ''
    or length(activation_request_id) > 128 then
    raise exception using errcode = '22023', message = 'Valid request identifier required';
  end if;

  if activation_proof is null or activation_proof !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '42501', message = 'Valid callback capability required';
  end if;

  select capability.secret
  into capability_secret
  from private.member_activation_capabilities as capability
  where capability.singleton;

  if capability_secret is null then
    raise exception using errcode = '42501', message = 'Callback capability unavailable';
  end if;

  select auth_user.created_at
  into auth_created_at
  from auth.users as auth_user
  where auth_user.id = actor_id;

  if not found then
    raise exception using errcode = '42501', message = 'Authenticated identity required';
  end if;

  select
    count(*),
    count(*) filter (where identity_record.provider = 'email')
  into identity_count, email_identity_count
  from auth.identities as identity_record
  where identity_record.user_id = actor_id;

  if identity_count <> 1 or email_identity_count <> 1 then
    raise exception using errcode = '42501', message = 'Exactly one approved email identity required';
  end if;

  expected_proof := encode(
    extensions.hmac(
      actor_id::text || ':' || activation_request_id || ':member-single-provider-v1',
      capability_secret,
      'sha256'
    ),
    'hex'
  );

  if activation_proof <> expected_proof then
    raise exception using errcode = '42501', message = 'Valid callback capability required';
  end if;

  insert into private.member_accounts (user_id, created_at, updated_at)
  values (actor_id, coalesce(auth_created_at, now()), coalesce(auth_created_at, now()))
  on conflict (user_id) do nothing;

  insert into security.role_grants (user_id, role)
  values (actor_id, 'member'::security.app_role)
  on conflict (user_id, role) where revoked_at is null
  do nothing;

  insert into private.member_auth_events (user_id, action, request_id)
  values (actor_id, 'session.signed_in', activation_request_id)
  on conflict (user_id, action, request_id) do nothing;

  return actor_id;
end;
$$;

revoke all on private.member_activation_capabilities
from public, anon, authenticated, service_role;

revoke execute on function public.configure_member_activation_capability(text)
from public, anon, authenticated;

revoke execute on function public.activate_current_member(text, text)
from public, anon, service_role;

grant execute on function public.configure_member_activation_capability(text)
to service_role;

grant execute on function public.activate_current_member(text, text)
to authenticated;

comment on table private.member_provider_policy is
  'Singleton, migration-controlled provider boundary. Provider changes require an explicit versioned policy migration.';

comment on function public.get_member_provider_policy() is
  'Returns the versioned tenant provider boundary without exposing mutable Auth configuration.';

comment on table private.member_activation_capabilities is
  'Server-only callback capability material. Values are provisioned outside migrations and never exposed to application callers.';

comment on function public.configure_member_activation_capability(text) is
  'Rotates the server-only Member callback capability through a service-role-only production operation.';

comment on function public.activate_current_member(text, text) is
  'Atomically validates callback capability, provider policy, and exact identity before creating the Member account, role, and signed-in audit.';

commit;
