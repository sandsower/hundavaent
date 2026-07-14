begin;

create type private.account_deletion_status as enum (
  'requested',
  'processing',
  'completed',
  'declined'
);

create table private.member_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.member_auth_events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('session.signed_in', 'session.sign_out_requested')),
  request_id text not null check (btrim(request_id) <> '' and length(request_id) <= 128),
  occurred_at timestamptz not null default now()
);

create index member_auth_events_user_time_idx
  on private.member_auth_events (user_id, occurred_at desc);

create unique index member_auth_events_request_idx
  on private.member_auth_events (user_id, action, request_id);

create table private.account_deletion_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  status private.account_deletion_status not null default 'requested',
  requested_locale private.locale_code not null,
  disclosure_version text not null check (btrim(disclosure_version) <> ''),
  request_id text not null check (btrim(request_id) <> '' and length(request_id) <= 128),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint account_deletion_resolution_time_check check (
    resolved_at is null or resolved_at >= requested_at
  )
);

create unique index account_deletion_one_open_request_idx
  on private.account_deletion_requests (user_id)
  where status in ('requested', 'processing');

alter table private.member_accounts enable row level security;
alter table private.member_auth_events enable row level security;
alter table private.account_deletion_requests enable row level security;

create function private.backfill_active_moderator_members()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into private.member_accounts (user_id, created_at, updated_at)
  select
    role_grant.user_id,
    coalesce(auth_user.created_at, now()),
    coalesce(auth_user.created_at, now())
  from security.role_grants as role_grant
  join auth.users as auth_user on auth_user.id = role_grant.user_id
  where role_grant.role = 'moderator'::security.app_role
    and role_grant.revoked_at is null
  on conflict (user_id) do nothing;

  insert into security.role_grants (user_id, role)
  select role_grant.user_id, 'member'::security.app_role
  from security.role_grants as role_grant
  where role_grant.role = 'moderator'::security.app_role
    and role_grant.revoked_at is null
  on conflict (user_id, role) where revoked_at is null
  do nothing;
end;
$$;

select private.backfill_active_moderator_members();

create function public.provision_moderator(command_user_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  auth_created_at timestamptz;
begin
  select auth_user.created_at
  into auth_created_at
  from auth.users as auth_user
  where auth_user.id = command_user_id;

  if not found then
    raise exception using errcode = '22023', message = 'Existing Auth user required';
  end if;

  insert into private.member_accounts (user_id, created_at, updated_at)
  values (
    command_user_id,
    coalesce(auth_created_at, now()),
    coalesce(auth_created_at, now())
  )
  on conflict (user_id) do nothing;

  insert into security.role_grants (user_id, role)
  values
    (command_user_id, 'member'::security.app_role),
    (command_user_id, 'moderator'::security.app_role)
  on conflict (user_id, role) where revoked_at is null
  do nothing;

  return command_user_id;
end;
$$;

create function public.get_current_member_account()
returns table (
  member_id uuid,
  created_at timestamptz,
  deletion_status text,
  deletion_requested_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    member.user_id,
    member.created_at,
    deletion.status::text,
    deletion.requested_at
  from private.member_accounts as member
  left join lateral (
    select request.status, request.requested_at
    from private.account_deletion_requests as request
    where request.user_id = member.user_id
    order by request.requested_at desc
    limit 1
  ) as deletion on true
  where member.user_id = auth.uid();
$$;

create function public.get_current_user_roles()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select role_grant.role::text
  from security.role_grants as role_grant
  where role_grant.user_id = auth.uid()
    and role_grant.revoked_at is null
  order by role_grant.role::text;
$$;

create function public.record_member_auth_event(
  event_action text,
  event_request_id text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  event_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not exists (
    select 1
    from private.member_accounts as member_account
    where member_account.user_id = actor_id
  ) then
    raise exception using errcode = '42501', message = 'Member activation required';
  end if;

  if event_action <> 'session.sign_out_requested' then
    raise exception using errcode = '22023', message = 'Unsupported auth event';
  end if;

  if event_request_id is null
    or btrim(event_request_id) = ''
    or length(event_request_id) > 128 then
    raise exception using errcode = '22023', message = 'Valid request identifier required';
  end if;

  insert into private.member_auth_events (user_id, action, request_id)
  values (actor_id, event_action, event_request_id)
  returning id into event_id;

  return event_id;
end;
$$;

create function public.begin_current_account_deletion(
  command_request_id text,
  command_locale text,
  command_disclosure_version text
)
returns table (
  deletion_request_id uuid,
  deletion_status text,
  requested_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not exists (
    select 1
    from private.member_accounts as member_account
    where member_account.user_id = actor_id
  ) then
    raise exception using errcode = '42501', message = 'Member activation required';
  end if;

  if command_locale not in ('is', 'en') then
    raise exception using errcode = '22023', message = 'Supported locale required';
  end if;

  if command_request_id is null
    or btrim(command_request_id) = ''
    or length(command_request_id) > 128 then
    raise exception using errcode = '22023', message = 'Valid request identifier required';
  end if;

  if command_disclosure_version is null or btrim(command_disclosure_version) = '' then
    raise exception using errcode = '22023', message = 'Disclosure version required';
  end if;

  return query
  with inserted as (
    insert into private.account_deletion_requests (
      user_id,
      requested_locale,
      disclosure_version,
      request_id
    )
    values (
      actor_id,
      command_locale::private.locale_code,
      command_disclosure_version,
      command_request_id
    )
    on conflict (user_id) where status in ('requested', 'processing')
    do update set user_id = excluded.user_id
    returning id, status, account_deletion_requests.requested_at
  )
  select inserted.id, inserted.status::text, inserted.requested_at
  from inserted;
end;
$$;

revoke all on private.member_accounts from public, anon, authenticated, service_role;
revoke all on private.member_auth_events from public, anon, authenticated, service_role;
revoke all on private.account_deletion_requests from public, anon, authenticated, service_role;

revoke execute on function private.backfill_active_moderator_members()
  from public, anon, authenticated, service_role;
revoke execute on function public.provision_moderator(uuid)
  from public, anon, authenticated;
revoke execute on function public.get_current_member_account()
  from public, anon, service_role;
revoke execute on function public.get_current_user_roles()
  from public, anon, service_role;
revoke execute on function public.record_member_auth_event(text, text)
  from public, anon, service_role;
revoke execute on function public.begin_current_account_deletion(text, text, text)
  from public, anon, service_role;

grant execute on function public.get_current_member_account()
  to authenticated;
grant execute on function public.get_current_user_roles()
  to authenticated;
grant execute on function public.record_member_auth_event(text, text)
  to authenticated;
grant execute on function public.begin_current_account_deletion(text, text, text)
  to authenticated;
grant execute on function public.provision_moderator(uuid)
  to service_role;

comment on table private.member_accounts is
  'Private Hundavaent Member lifecycle keyed by Auth identity without provider profile data.';
comment on table private.member_auth_events is
  'Minimal private session audit events without provider identifiers or profile metadata.';
comment on table private.account_deletion_requests is
  'Private Member deletion requests awaiting an approved operational retention decision.';
comment on function public.get_current_member_account() is
  'Returns only the authenticated caller private Member lifecycle projection.';
comment on function public.get_current_user_roles() is
  'Returns only active application roles for the authenticated caller.';
comment on function public.provision_moderator(uuid) is
  'Atomically provisions the private Member account, Member role, and Moderator role for one existing Auth user.';

commit;
