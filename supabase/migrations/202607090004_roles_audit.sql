begin;

create table security.role_grants (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role security.app_role not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint role_grant_revocation_time_check check (
    revoked_at is null or revoked_at >= granted_at
  )
);

create unique index role_grants_one_active_role_idx
  on security.role_grants (user_id, role)
  where revoked_at is null;

create index role_grants_active_user_idx
  on security.role_grants (user_id)
  where revoked_at is null;

alter table security.role_grants enable row level security;

create function security.current_actor_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select auth.uid();
$$;

create function security.has_role(required_role security.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from security.role_grants as grant_record
    where grant_record.user_id = auth.uid()
      and grant_record.role = required_role
      and grant_record.revoked_at is null
  );
$$;

create function security.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select security.has_role('moderator'::security.app_role);
$$;

create function security.require_moderator()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or not security.has_role('moderator'::security.app_role) then
    raise exception using
      errcode = '42501',
      message = 'Moderator role required';
  end if;

  return actor_id;
end;
$$;

create table private.audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (btrim(action) <> ''),
  subject_type text not null check (btrim(subject_type) <> ''),
  subject_id uuid not null,
  request_id uuid not null,
  occurred_at timestamptz not null default now(),
  change_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(change_summary) = 'object')
);

create index audit_events_actor_time_idx
  on private.audit_events (actor_id, occurred_at desc);

create index audit_events_subject_time_idx
  on private.audit_events (subject_type, subject_id, occurred_at desc);

create index audit_events_request_idx
  on private.audit_events (request_id);

alter table private.audit_events enable row level security;

create function private.reject_audit_mutation()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Audit Events are append-only';
end;
$$;

create trigger audit_events_reject_update_delete
before update or delete on private.audit_events
for each row execute function private.reject_audit_mutation();

create trigger audit_events_reject_truncate
before truncate on private.audit_events
for each statement execute function private.reject_audit_mutation();

create function private.append_audit_event(
  event_action text,
  event_subject_type text,
  event_subject_id uuid,
  event_request_id uuid,
  event_change_summary jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  event_id uuid;
begin
  if event_action is null or btrim(event_action) = '' then
    raise exception using errcode = '22023', message = 'Audit action is required';
  end if;

  if event_subject_type is null or btrim(event_subject_type) = '' then
    raise exception using errcode = '22023', message = 'Audit subject type is required';
  end if;

  if event_subject_id is null or event_request_id is null then
    raise exception using errcode = '22023', message = 'Audit subject and request identifiers are required';
  end if;

  if event_change_summary is null or jsonb_typeof(event_change_summary) <> 'object' then
    raise exception using errcode = '22023', message = 'Audit change summary must be an object';
  end if;

  insert into private.audit_events (
    actor_id,
    action,
    subject_type,
    subject_id,
    request_id,
    change_summary
  )
  values (
    actor_id,
    event_action,
    event_subject_type,
    event_subject_id,
    event_request_id,
    event_change_summary
  )
  returning id into event_id;

  return event_id;
end;
$$;

revoke all on security.role_grants from public, anon, authenticated, service_role;
revoke all on private.audit_events from public, anon, authenticated, service_role;

revoke execute on function security.current_actor_id()
  from public, anon, authenticated, service_role;
revoke execute on function security.has_role(security.app_role)
  from public, anon, authenticated, service_role;
revoke execute on function security.is_moderator()
  from public, anon, authenticated, service_role;
revoke execute on function security.require_moderator()
  from public, anon, authenticated, service_role;
revoke execute on function private.reject_audit_mutation()
  from public, anon, authenticated, service_role;
revoke execute on function private.append_audit_event(text, text, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

comment on table security.role_grants is
  'Database-backed application roles associated with Supabase Auth identities.';

comment on function security.current_actor_id() is
  'Returns the caller identity from Supabase JWT context without accepting a spoofable actor argument.';

comment on function security.require_moderator() is
  'Returns the authenticated Moderator identity or raises insufficient privilege.';

comment on table private.audit_events is
  'Append-only record of privileged domain actions with caller-derived actor identity.';

commit;
