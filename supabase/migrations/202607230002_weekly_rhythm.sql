begin;

-- A saved Place can be removed from the current Favourite set, but its first successful save is
-- a durable Member fact. Weekly rhythm is derived from these facts instead of stored counters.
create table private.member_place_first_saves (
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  place_id uuid not null references private.places(id) on delete restrict,
  first_saved_at timestamptz not null default statement_timestamp(),
  primary key (member_id, place_id)
);

create index member_place_first_saves_member_time_idx
  on private.member_place_first_saves (member_id, first_saved_at, place_id);

alter table private.member_place_first_saves enable row level security;

create function private.reject_member_place_first_save_mutation()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Member Place first-save facts are immutable';
end;
$$;

create trigger member_place_first_saves_reject_update
before update on private.member_place_first_saves
for each row execute function private.reject_member_place_first_save_mutation();

create trigger member_place_first_saves_reject_truncate
before truncate on private.member_place_first_saves
for each statement execute function private.reject_member_place_first_save_mutation();

-- Calendar boundaries are deliberately calculated in Reykjavík local time. Keeping the conversion
-- in one database function prevents application servers in other time zones from disagreeing.
create function private.reykjavik_week_bounds(as_of timestamptz)
returns table (
  starts_on date,
  ends_on date,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
set search_path = pg_catalog
as $$
  with boundary as (
    select date_trunc('week', as_of at time zone 'Atlantic/Reykjavik')::date as local_start
  )
  select
    boundary.local_start,
    boundary.local_start + 6,
    boundary.local_start::timestamp at time zone 'Atlantic/Reykjavik',
    (boundary.local_start + 7)::timestamp at time zone 'Atlantic/Reykjavik'
  from boundary;
$$;

-- Account deletion already owns this private cleanup seam. Extend it so deletion removes both
-- current Favourite state and the recognition facts that belong solely to that Member.
create or replace function private.detach_member_favourites(requested_member_id uuid)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  removed_count bigint;
  removed_first_save_count bigint;
begin
  delete from private.member_favourites as favourite
  where favourite.user_id = requested_member_id;

  get diagnostics removed_count = row_count;

  delete from private.member_place_first_saves as first_save
  where first_save.member_id = requested_member_id;

  get diagnostics removed_first_save_count = row_count;
  return removed_count + removed_first_save_count;
end;
$$;

-- The return shape gains authoritative recognition metadata. One transaction-scoped advisory lock
-- serializes every Favourite mutation for a Member, including concurrent saves of different Places.
drop function public.set_current_favourite(uuid, boolean);

create function public.set_current_favourite(
  requested_place_id uuid,
  desired_state boolean
)
returns table (
  place_id uuid,
  is_favourite boolean,
  changed_at timestamptz,
  first_time_for_place boolean,
  activated_current_week boolean,
  current_week_starts_on date,
  current_week_ends_on date,
  current_week_active boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  command_time timestamptz := statement_timestamp();
  locked_lifecycle private.place_lifecycle;
  state_changed_at timestamptz;
  recognized_at timestamptz;
  first_time boolean := false;
  activated_week boolean := false;
  week_active boolean := false;
  week_start date;
  week_end date;
  week_start_at timestamptz;
  week_end_at timestamptz;
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

  if requested_place_id is null or desired_state is null then
    raise exception using errcode = '22023', message = 'Place and desired state required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text, 7737001)
  );

  select bounds.starts_on, bounds.ends_on, bounds.starts_at, bounds.ends_at
  into week_start, week_end, week_start_at, week_end_at
  from private.reykjavik_week_bounds(command_time) as bounds;

  if desired_state then
    select place_record.lifecycle
    into locked_lifecycle
    from private.places as place_record
    where place_record.id = requested_place_id
    for update;

    if locked_lifecycle is distinct from 'published'::private.place_lifecycle
      or not private.is_place_discoverable(requested_place_id) then
      raise exception using errcode = '22023', message = 'Discoverable Place required';
    end if;

    insert into private.member_favourites (user_id, place_id, created_at)
    values (actor_id, requested_place_id, command_time)
    on conflict on constraint member_favourites_pkey do nothing
    returning member_favourites.created_at into state_changed_at;

    if state_changed_at is null then
      select favourite.created_at
      into state_changed_at
      from private.member_favourites as favourite
      where favourite.user_id = actor_id
        and favourite.place_id = requested_place_id;
    else
      insert into private.member_place_first_saves (member_id, place_id, first_saved_at)
      values (actor_id, requested_place_id, command_time)
      on conflict on constraint member_place_first_saves_pkey do nothing
      returning member_place_first_saves.first_saved_at into recognized_at;

      first_time := recognized_at is not null;
    end if;
  else
    delete from private.member_favourites as favourite
    where favourite.user_id = actor_id
      and favourite.place_id = requested_place_id
    returning favourite.created_at into state_changed_at;

    state_changed_at := coalesce(state_changed_at, command_time);
  end if;

  select exists (
    select 1
    from private.member_place_first_saves as first_save
    where first_save.member_id = actor_id
      and first_save.first_saved_at >= week_start_at
      and first_save.first_saved_at < week_end_at
  ) into week_active;

  if first_time then
    select count(*) = 1
    into activated_week
    from private.member_place_first_saves as first_save
    where first_save.member_id = actor_id
      and first_save.first_saved_at >= week_start_at
      and first_save.first_saved_at < week_end_at;
  end if;

  return query
  select
    requested_place_id,
    desired_state,
    state_changed_at,
    first_time,
    activated_week,
    week_start,
    week_end,
    week_active;
end;
$$;

create function public.get_current_member_weekly_rhythm()
returns table (
  starts_on date,
  ends_on date,
  active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_bounds as (
    select *
    from private.reykjavik_week_bounds(statement_timestamp())
  )
  select
    bounds.starts_on,
    bounds.ends_on,
    exists (
      select 1
      from private.member_place_first_saves as first_save
      where first_save.member_id = auth.uid()
        and first_save.first_saved_at >= bounds.starts_at
        and first_save.first_saved_at < bounds.ends_at
    )
  from current_bounds as bounds
  where auth.uid() is not null
    and exists (
      select 1
      from private.member_accounts as member_account
      where member_account.user_id = auth.uid()
    );
$$;

create function public.list_current_member_weekly_rhythm()
returns table (
  starts_on date,
  ends_on date,
  current boolean,
  active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_bounds as (
    select *
    from private.reykjavik_week_bounds(statement_timestamp())
  ),
  weeks as (
    select
      (bounds.starts_on - (offsets.weeks_ago * 7))::date as week_start,
      offsets.weeks_ago
    from current_bounds as bounds
    cross join generate_series(7, 0, -1) as offsets(weeks_ago)
  )
  select
    weeks.week_start,
    weeks.week_start + 6,
    weeks.weeks_ago = 0,
    exists (
      select 1
      from private.member_place_first_saves as first_save
      where first_save.member_id = auth.uid()
        and first_save.first_saved_at >=
          weeks.week_start::timestamp at time zone 'Atlantic/Reykjavik'
        and first_save.first_saved_at <
          (weeks.week_start + 7)::timestamp at time zone 'Atlantic/Reykjavik'
    )
  from weeks
  where auth.uid() is not null
    and exists (
      select 1
      from private.member_accounts as member_account
      where member_account.user_id = auth.uid()
    )
  order by weeks.week_start;
$$;

-- Pending Favourite completion uses the same mutation command as an already-signed-in save, so the
-- post-authentication path cannot bypass first-save recognition or manufacture a second activation.
drop function public.complete_auth_pending_intent(text, text);

create function public.complete_auth_pending_intent(
  pending_token text,
  command_request_id text
)
returns table (
  action text,
  place_id uuid,
  overall_rating integer,
  completion_status text,
  first_time_for_place boolean,
  activated_current_week boolean,
  current_week_starts_on date,
  current_week_ends_on date,
  current_week_active boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  intent private.auth_pending_intents%rowtype;
  completed_status text;
  favourite_first_time boolean;
  favourite_activated_week boolean;
  favourite_week_starts_on date;
  favourite_week_ends_on date;
  favourite_week_active boolean;
begin
  if actor_id is null or not exists (
    select 1 from private.member_accounts as member where member.user_id = actor_id
  ) then
    raise exception using errcode = '42501', message = 'Member activation required';
  end if;

  if pending_token is null or pending_token !~ '^[A-Za-z0-9_-]{43}$'
    or command_request_id is null
    or btrim(command_request_id) = ''
    or length(command_request_id) > 128 then
    raise exception using errcode = '22023', message = 'Valid pending intent and request identifier required';
  end if;

  select pending.*
  into intent
  from private.auth_pending_intents as pending
  where pending.token_hash = extensions.digest(convert_to(pending_token, 'UTF8'), 'sha256')
  for update;

  if not found or intent.expires_at <= statement_timestamp() then
    return;
  end if;

  if intent.consumed_at is not null then
    return;
  end if;

  if intent.action = 'favourite' then
    select
      result.first_time_for_place,
      result.activated_current_week,
      result.current_week_starts_on,
      result.current_week_ends_on,
      result.current_week_active
    into
      favourite_first_time,
      favourite_activated_week,
      favourite_week_starts_on,
      favourite_week_ends_on,
      favourite_week_active
    from public.set_current_favourite(intent.place_id, true);
    completed_status := 'completed';
  else
    insert into private.pending_member_rating_completions (
      member_id,
      place_id,
      overall_rating,
      request_id
    ) values (
      actor_id,
      intent.place_id,
      intent.overall_rating,
      command_request_id
    ) on conflict do nothing;
    completed_status := 'queued';
  end if;

  update private.auth_pending_intents as pending
  set
    consumed_at = statement_timestamp(),
    consumed_by = actor_id,
    completion_status = completed_status,
    completion_request_id = command_request_id
  where pending.token_hash = intent.token_hash;

  return query
  select
    intent.action,
    intent.place_id,
    intent.overall_rating,
    completed_status,
    favourite_first_time,
    favourite_activated_week,
    favourite_week_starts_on,
    favourite_week_ends_on,
    favourite_week_active;
end;
$$;

revoke all on private.member_place_first_saves from public, anon, authenticated, service_role;
revoke execute on function private.reject_member_place_first_save_mutation()
  from public, anon, authenticated, service_role;
revoke execute on function private.reykjavik_week_bounds(timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function public.set_current_favourite(uuid, boolean)
  from public, anon, service_role;
revoke execute on function public.get_current_member_weekly_rhythm()
  from public, anon, service_role;
revoke execute on function public.list_current_member_weekly_rhythm()
  from public, anon, service_role;
revoke execute on function public.complete_auth_pending_intent(text, text)
  from public, anon, service_role;

grant execute on function public.set_current_favourite(uuid, boolean)
  to authenticated;
grant execute on function public.get_current_member_weekly_rhythm()
  to authenticated;
grant execute on function public.list_current_member_weekly_rhythm()
  to authenticated;
grant execute on function public.complete_auth_pending_intent(text, text)
  to authenticated;

comment on table private.member_place_first_saves is
  'Immutable caller-owned first successful Place saves, used as the sole source for weekly rhythm.';
comment on function private.reykjavik_week_bounds(timestamptz) is
  'Returns inclusive local calendar dates and half-open instants for one Reykjavík Monday-to-Sunday week.';
comment on function public.set_current_favourite(uuid, boolean) is
  'Idempotently applies Favourite state and returns authoritative first-save and current Reykjavík-week recognition.';
comment on function public.get_current_member_weekly_rhythm() is
  'Returns the caller-owned current Reykjavík week without exposing activity timestamps.';
comment on function public.list_current_member_weekly_rhythm() is
  'Returns exactly eight caller-owned Reykjavík calendar weeks, oldest first, derived from immutable first saves.';
comment on function public.complete_auth_pending_intent(text, text) is
  'Consumes one opaque continuation after Member activation and returns authoritative Favourite recognition when applicable.';

commit;
