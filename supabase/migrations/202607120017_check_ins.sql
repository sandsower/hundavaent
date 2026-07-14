begin;

create type private.check_in_proximity_status as enum (
  'confirmed',
  'not_confirmed',
  'unknown'
);

create table private.check_ins (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  place_id uuid not null references private.places(id) on delete restrict,
  proximity_confirmed private.check_in_proximity_status not null default 'unknown',
  request_id uuid not null,
  checked_in_at timestamptz not null default now(),
  unique (member_id, request_id)
);

create index check_ins_member_place_recent_idx
  on private.check_ins (member_id, place_id, checked_in_at desc);

create table private.check_in_policy (
  singleton boolean primary key default true check (singleton),
  policy_version text not null check (btrim(policy_version) <> ''),
  proximity_assist_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table private.check_ins enable row level security;
alter table private.check_in_policy enable row level security;

-- The rolling 24-hour duplicate window and Place-lifecycle recheck happen inside one advisory-locked
-- transaction. No parameter on this function, or on any other function in this migration, is shaped
-- to carry a coordinate, an accuracy figure, or a computed distance: the proximity decision is
-- computed entirely in the browser (see src/lib/check-ins/proximity.ts) and only the resulting
-- tri-state string ever reaches this boundary. checked_in_at is always the server's own now(); there
-- is no client-supplied timestamp parameter, so a skewed device clock cannot influence the stored
-- Check-in time.
create function public.record_check_in(
  requested_place_id uuid,
  requested_proximity_status text,
  command_request_id uuid
)
returns table (
  check_in_id uuid,
  place_id uuid,
  proximity_confirmed text,
  checked_in_at timestamptz,
  already_checked_in boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  proximity_value private.check_in_proximity_status;
  existing_record private.check_ins%rowtype;
  locked_lifecycle private.place_lifecycle;
  created_record private.check_ins%rowtype;
begin
  if requested_place_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Place and request ID are required';
  end if;

  begin
    proximity_value := coalesce(nullif(requested_proximity_status, ''), 'unknown')
      ::private.check_in_proximity_status;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'Proximity status is invalid';
  end;

  select check_in.* into existing_record
  from private.check_ins as check_in
  where check_in.member_id = actor_id and check_in.request_id = command_request_id;

  if found then
    return query select
      existing_record.id,
      existing_record.place_id,
      existing_record.proximity_confirmed::text,
      existing_record.checked_in_at,
      true;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('check-in:' || actor_id::text || ':' || requested_place_id::text, 0)
  );

  -- A same-request transaction may have committed while this transaction waited for the
  -- per-Member-per-Place lock. Recheck the exact request-id replay before the rolling window.
  select check_in.* into existing_record
  from private.check_ins as check_in
  where check_in.member_id = actor_id and check_in.request_id = command_request_id;

  if found then
    return query select
      existing_record.id,
      existing_record.place_id,
      existing_record.proximity_confirmed::text,
      existing_record.checked_in_at,
      true;
    return;
  end if;

  select check_in.* into existing_record
  from private.check_ins as check_in
  where check_in.member_id = actor_id
    and check_in.place_id = requested_place_id
    and check_in.checked_in_at > statement_timestamp() - interval '24 hours'
  order by check_in.checked_in_at desc
  limit 1;

  if found then
    return query select
      existing_record.id,
      existing_record.place_id,
      existing_record.proximity_confirmed::text,
      existing_record.checked_in_at,
      true;
    return;
  end if;

  select place_record.lifecycle
  into locked_lifecycle
  from private.places as place_record
  where place_record.id = requested_place_id
  for update;

  if not found or locked_lifecycle is distinct from 'published'::private.place_lifecycle then
    raise exception using errcode = '22023', message = 'Published Place required';
  end if;

  insert into private.check_ins (member_id, place_id, proximity_confirmed, request_id)
  values (actor_id, requested_place_id, proximity_value, command_request_id)
  returning * into created_record;

  return query select
    created_record.id,
    created_record.place_id,
    created_record.proximity_confirmed::text,
    created_record.checked_in_at,
    false;
end;
$$;

create function public.get_current_check_in_status(requested_place_id uuid)
returns table (
  has_recent_check_in boolean,
  checked_in_at timestamptz,
  proximity_confirmed text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  existing_record private.check_ins%rowtype;
begin
  if requested_place_id is null then
    raise exception using errcode = '22023', message = 'Place is required';
  end if;

  select check_in.* into existing_record
  from private.check_ins as check_in
  where check_in.member_id = actor_id
    and check_in.place_id = requested_place_id
    and check_in.checked_in_at > statement_timestamp() - interval '24 hours'
  order by check_in.checked_in_at desc
  limit 1;

  if not found then
    return query select false, null::timestamptz, null::text;
    return;
  end if;

  return query select true, existing_record.checked_in_at, existing_record.proximity_confirmed::text;
end;
$$;

create function public.get_check_in_policy()
returns table (proximity_assist_enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select policy.proximity_assist_enabled
      from private.check_in_policy as policy
      where policy.singleton
    ),
    false
  );
$$;

create function public.configure_check_in_policy(
  requested_policy_version text,
  requested_proximity_assist_enabled boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(requested_policy_version), '') is null
    or requested_proximity_assist_enabled is null
  then
    raise exception using errcode = '22023', message = 'Check-in policy is invalid';
  end if;

  insert into private.check_in_policy (
    singleton,
    policy_version,
    proximity_assist_enabled,
    updated_at
  ) values (
    true,
    btrim(requested_policy_version),
    requested_proximity_assist_enabled,
    now()
  )
  on conflict (singleton) do update set
    policy_version = excluded.policy_version,
    proximity_assist_enabled = excluded.proximity_assist_enabled,
    updated_at = now();
end;
$$;

-- Support access is always scoped to one already-known Check-in id and requires a non-empty
-- reason; there is no listing or bulk-read RPC. Every call is itself an audited action, satisfying
-- "authorized operational roles (explicit support need) can access a Check-in" as a provable,
-- narrow, and logged exception rather than a standing broad read.
create function public.get_support_check_in(
  requested_check_in_id uuid,
  support_reason text,
  command_request_id uuid
)
returns table (
  check_in_id uuid,
  member_id uuid,
  place_id uuid,
  proximity_confirmed text,
  checked_in_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  found_record private.check_ins%rowtype;
begin
  perform security.require_moderator();

  if nullif(btrim(support_reason), '') is null then
    raise exception using errcode = '22023', message = 'A support reason is required';
  end if;

  if requested_check_in_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Check-in and request ID are required';
  end if;

  select check_in.* into found_record
  from private.check_ins as check_in
  where check_in.id = requested_check_in_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Check-in not found';
  end if;

  perform private.append_audit_event(
    'check_in.support_access',
    'check_in',
    found_record.id,
    command_request_id,
    jsonb_build_object('member_id', found_record.member_id, 'reason', btrim(support_reason))
  );

  return query select
    found_record.id,
    found_record.member_id,
    found_record.place_id,
    found_record.proximity_confirmed::text,
    found_record.checked_in_at;
end;
$$;

create function private.detach_member_check_ins(requested_member_id uuid)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  removed_count bigint;
begin
  delete from private.check_ins as check_in
  where check_in.member_id = requested_member_id;

  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

revoke all on private.check_ins from public, anon, authenticated, service_role;
revoke all on private.check_in_policy from public, anon, authenticated, service_role;

revoke execute on function private.detach_member_check_ins(uuid)
  from public, anon, authenticated, service_role;

revoke execute on function public.record_check_in(uuid, text, uuid)
  from public, anon, service_role;
revoke execute on function public.get_current_check_in_status(uuid)
  from public, anon, service_role;
revoke execute on function public.get_check_in_policy()
  from public, anon, service_role;
revoke execute on function public.configure_check_in_policy(text, boolean)
  from public, anon, authenticated;
revoke execute on function public.get_support_check_in(uuid, text, uuid)
  from public, anon, service_role;

grant execute on function public.record_check_in(uuid, text, uuid) to authenticated;
grant execute on function public.get_current_check_in_status(uuid) to authenticated;
grant execute on function public.get_check_in_policy() to authenticated;
grant execute on function public.configure_check_in_policy(text, boolean) to service_role;
grant execute on function public.get_support_check_in(uuid, text, uuid) to authenticated;

comment on table private.check_ins is
  'Private, explicit, Member-initiated visit records. No public timeline, count, or history is ever derived from this table.';
comment on table private.check_in_policy is
  'Fail-closed singleton gating the optional one-time proximity assist. No row means the assist is disabled everywhere.';
comment on function public.record_check_in(uuid, text, uuid) is
  'Idempotently records a private Check-in from a client-computed tri-state proximity decision; never accepts a coordinate, accuracy, distance, or client timestamp.';
comment on function public.get_support_check_in(uuid, text, uuid) is
  'Narrow, reason-required, audited Moderator read of exactly one Check-in. No listing or bulk-read surface exists.';
comment on function private.detach_member_check_ins(uuid) is
  'Ungranted account-deletion cleanup seam. This migration intentionally grants and invokes no account-deletion policy.';

commit;
