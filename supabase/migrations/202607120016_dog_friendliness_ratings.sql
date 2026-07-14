begin;

-- One current Dog-Friendliness Rating per Member+Place. Four independently nullable Dimension
-- score columns (null = "not applicable") rather than four rows or a sentinel value.
create table private.dog_friendliness_ratings (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  place_id uuid not null references private.places(id) on delete restrict,
  welcome_score integer,
  clarity_score integer,
  comfort_score integer,
  thoughtfulness_score integer,
  created_at timestamptz not null default now(),
  rated_at timestamptz not null default now(),
  last_request_id uuid not null,
  excluded_at timestamptz,
  excluded_by uuid references auth.users(id) on delete set null,
  excluded_reason text,
  excluded_kind text,
  exclusion_request_id uuid,
  constraint dog_friendliness_ratings_member_place_key unique (member_id, place_id),
  constraint dog_friendliness_rating_welcome_score_check check (
    welcome_score is null or welcome_score between 1 and 5
  ),
  constraint dog_friendliness_rating_clarity_score_check check (
    clarity_score is null or clarity_score between 1 and 5
  ),
  constraint dog_friendliness_rating_comfort_score_check check (
    comfort_score is null or comfort_score between 1 and 5
  ),
  constraint dog_friendliness_rating_thoughtfulness_score_check check (
    thoughtfulness_score is null or thoughtfulness_score between 1 and 5
  ),
  constraint dog_friendliness_rating_has_dimension_check check (
    welcome_score is not null
    or clarity_score is not null
    or comfort_score is not null
    or thoughtfulness_score is not null
  ),
  constraint dog_friendliness_rating_exclusion_kind_check check (
    excluded_kind is null or excluded_kind in ('abuse', 'fraud', 'duplication')
  ),
  constraint dog_friendliness_rating_exclusion_shape_check check (
    (excluded_at is null) = (excluded_by is null)
    and (excluded_at is null) = (excluded_reason is null)
    and (excluded_at is null) = (excluded_kind is null)
    and (excluded_at is null) = (exclusion_request_id is null)
  )
);

create index dog_friendliness_ratings_place_eligible_idx
  on private.dog_friendliness_ratings (place_id, rated_at)
  where excluded_at is null;

alter table private.dog_friendliness_ratings enable row level security;

-- Append-only replacement/eligibility history. Every submit, update, Moderator exclusion, and
-- Moderator reinstatement is its own row with a full Dimension-score snapshot.
create table private.dog_friendliness_rating_events (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  place_id uuid not null references private.places(id) on delete restrict,
  event_kind text not null check (event_kind in ('submitted', 'updated', 'excluded', 'reinstated')),
  welcome_score integer,
  clarity_score integer,
  comfort_score integer,
  thoughtfulness_score integer,
  reason text,
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint dog_friendliness_rating_event_reason_shape_check check (
    (event_kind in ('submitted', 'updated') and reason is null)
    or (event_kind in ('excluded', 'reinstated') and reason is not null)
  ),
  constraint dog_friendliness_rating_events_member_place_request_key
    unique (member_id, place_id, request_id)
);

create index dog_friendliness_rating_events_lookup_idx
  on private.dog_friendliness_rating_events (member_id, place_id, occurred_at desc);

alter table private.dog_friendliness_rating_events enable row level security;

create function private.reject_dog_friendliness_rating_event_mutation()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'private.dog_friendliness_rating_events is append-only';
end;
$$;

create trigger dog_friendliness_rating_events_reject_row_mutation
before update or delete on private.dog_friendliness_rating_events
for each row execute function private.reject_dog_friendliness_rating_event_mutation();

create trigger dog_friendliness_rating_events_reject_truncate
before truncate on private.dog_friendliness_rating_events
for each statement execute function private.reject_dog_friendliness_rating_event_mutation();

-- Fail-closed, versioned, service-role-only policy. No default row: every read is hidden until
-- an operator explicitly configures and enables a policy (the public-rating-summary approval gate).
create table private.dog_friendliness_summary_policy (
  singleton boolean primary key default true check (singleton),
  policy_version text not null check (btrim(policy_version) <> ''),
  minimum_eligible_count integer not null check (minimum_eligible_count > 0),
  recency_window interval not null check (recency_window > interval '0 seconds'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table private.dog_friendliness_summary_policy enable row level security;

create function public.configure_dog_friendliness_summary_policy(
  requested_policy_version text,
  requested_minimum_eligible_count integer,
  requested_recency_window_seconds integer,
  requested_enabled boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(requested_policy_version), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Dog-Friendliness summary policy version is required';
  end if;

  if requested_minimum_eligible_count is null or requested_minimum_eligible_count <= 0 then
    raise exception using
      errcode = '22023',
      message = 'Dog-Friendliness summary policy threshold is invalid';
  end if;

  if requested_recency_window_seconds is null or requested_recency_window_seconds <= 0 then
    raise exception using
      errcode = '22023',
      message = 'Dog-Friendliness summary policy recency window is invalid';
  end if;

  if requested_enabled is null then
    raise exception using
      errcode = '22023',
      message = 'Dog-Friendliness summary policy enabled flag is required';
  end if;

  insert into private.dog_friendliness_summary_policy (
    singleton, policy_version, minimum_eligible_count, recency_window, enabled, updated_at
  ) values (
    true,
    btrim(requested_policy_version),
    requested_minimum_eligible_count,
    make_interval(secs => requested_recency_window_seconds),
    requested_enabled,
    statement_timestamp()
  )
  on conflict (singleton) do update set
    policy_version = excluded.policy_version,
    minimum_eligible_count = excluded.minimum_eligible_count,
    recency_window = excluded.recency_window,
    enabled = excluded.enabled,
    updated_at = excluded.updated_at;
end;
$$;

-- A Member's own current Rating submission/update. Never touches exclusion columns: once a
-- A Moderator excludes a Rating, and only an explicit reinstatement clears it.
create function public.submit_dog_friendliness_rating(
  requested_place_id uuid,
  requested_welcome_score integer,
  requested_clarity_score integer,
  requested_comfort_score integer,
  requested_thoughtfulness_score integer,
  command_request_id uuid
)
returns table (
  id uuid,
  place_id uuid,
  welcome_score integer,
  clarity_score integer,
  comfort_score integer,
  thoughtfulness_score integer,
  rated_at timestamptz,
  excluded boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- Named to avoid ambiguity with dog_friendliness_rating_events.actor_id in embedded SQL.
  submitting_member_id uuid := security.require_member();
  existing private.dog_friendliness_ratings%rowtype;
  event_kind text;
  result private.dog_friendliness_ratings%rowtype;
begin
  if requested_place_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Place and request identifiers are required';
  end if;

  if requested_welcome_score is not null and requested_welcome_score not between 1 and 5 then
    raise exception using errcode = '22023', message = 'Welcome score must be between 1 and 5';
  end if;

  if requested_clarity_score is not null and requested_clarity_score not between 1 and 5 then
    raise exception using errcode = '22023', message = 'Clarity score must be between 1 and 5';
  end if;

  if requested_comfort_score is not null and requested_comfort_score not between 1 and 5 then
    raise exception using errcode = '22023', message = 'Comfort score must be between 1 and 5';
  end if;

  if requested_thoughtfulness_score is not null and requested_thoughtfulness_score not between 1 and 5 then
    raise exception using
      errcode = '22023',
      message = 'Thoughtfulness score must be between 1 and 5';
  end if;

  if requested_welcome_score is null
    and requested_clarity_score is null
    and requested_comfort_score is null
    and requested_thoughtfulness_score is null then
    raise exception using errcode = '22023', message = 'At least one Dimension must be scored';
  end if;

  if not private.is_place_discoverable(requested_place_id) then
    raise exception using errcode = '22023', message = 'Ratable Place required';
  end if;

  select rating.*
  into existing
  from private.dog_friendliness_ratings as rating
  where rating.member_id = submitting_member_id and rating.place_id = requested_place_id
  for update;

  -- Idempotent replay: the exact same request against the unchanged current row returns the
  -- existing row without an UPDATE, so rated_at (and therefore the trailing-12-month recency
  -- context) is never nudged by a retried command.
  if found
    and existing.last_request_id = command_request_id
    and existing.welcome_score is not distinct from requested_welcome_score
    and existing.clarity_score is not distinct from requested_clarity_score
    and existing.comfort_score is not distinct from requested_comfort_score
    and existing.thoughtfulness_score is not distinct from requested_thoughtfulness_score then
    return query select
      existing.id, existing.place_id, existing.welcome_score, existing.clarity_score,
      existing.comfort_score, existing.thoughtfulness_score, existing.rated_at,
      (existing.excluded_at is not null);
    return;
  end if;

  event_kind := case when found then 'updated' else 'submitted' end;

  -- A request identifier that already produced an event must never mutate state again: a stale
  -- submit command replayed after a later update would otherwise rewrite the current scores
  -- while its event insert silently dedupes, leaving a state change with no history row.
  if exists (
    select 1
    from private.dog_friendliness_rating_events as event
    where event.member_id = submitting_member_id
      and event.place_id = requested_place_id
      and event.request_id = command_request_id
  ) then
    raise exception using
      errcode = '55006',
      message = 'Rating request identifier was already used';
  end if;

  insert into private.dog_friendliness_ratings (
    member_id, place_id, welcome_score, clarity_score, comfort_score, thoughtfulness_score,
    rated_at, last_request_id
  ) values (
    submitting_member_id, requested_place_id, requested_welcome_score, requested_clarity_score,
    requested_comfort_score, requested_thoughtfulness_score, statement_timestamp(), command_request_id
  )
  on conflict on constraint dog_friendliness_ratings_member_place_key do update set
    welcome_score = excluded.welcome_score,
    clarity_score = excluded.clarity_score,
    comfort_score = excluded.comfort_score,
    thoughtfulness_score = excluded.thoughtfulness_score,
    rated_at = excluded.rated_at,
    last_request_id = excluded.last_request_id
  returning * into result;

  insert into private.dog_friendliness_rating_events (
    member_id, place_id, event_kind, welcome_score, clarity_score, comfort_score,
    thoughtfulness_score, actor_id, request_id
  ) values (
    submitting_member_id, requested_place_id, event_kind, requested_welcome_score,
    requested_clarity_score, requested_comfort_score, requested_thoughtfulness_score,
    submitting_member_id, command_request_id
  )
  on conflict on constraint dog_friendliness_rating_events_member_place_request_key do nothing;

  return query select
    result.id, result.place_id, result.welcome_score, result.clarity_score, result.comfort_score,
    result.thoughtfulness_score, result.rated_at, (result.excluded_at is not null);
end;
$$;

create function public.get_my_dog_friendliness_rating(requested_place_id uuid)
returns table (
  id uuid,
  place_id uuid,
  welcome_score integer,
  clarity_score integer,
  comfort_score integer,
  thoughtfulness_score integer,
  rated_at timestamptz,
  excluded boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
begin
  return query
  select
    rating.id, rating.place_id, rating.welcome_score, rating.clarity_score, rating.comfort_score,
    rating.thoughtfulness_score, rating.rated_at, (rating.excluded_at is not null)
  from private.dog_friendliness_ratings as rating
  where rating.member_id = actor_id and rating.place_id = requested_place_id;
end;
$$;

-- Public, privacy-protected read. Callable by anon and authenticated alike. Fail-closed: hidden
-- whenever the Place is not currently discoverable, the policy is unconfigured/disabled, or the
-- eligible cohort has not reached the configured threshold. No count or value is ever returned
-- in any of those cases.
create function public.get_dog_friendliness_summary(requested_place_id uuid)
returns table (
  place_id uuid,
  summary_visible boolean,
  eligible_count integer,
  trailing_twelve_month_count integer,
  dimensions jsonb,
  overall_mean numeric,
  overall_visible boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  policy_record private.dog_friendliness_summary_policy%rowtype;
  computed_eligible_count integer;
  computed_recency_count integer;
  welcome_count integer;
  welcome_mean numeric;
  clarity_count integer;
  clarity_mean numeric;
  comfort_count integer;
  comfort_mean numeric;
  thoughtfulness_count integer;
  thoughtfulness_mean numeric;
  dims jsonb := '[]'::jsonb;
  qualifying_means numeric[] := array[]::numeric[];
  computed_overall numeric;
begin
  if requested_place_id is null or not private.is_place_discoverable(requested_place_id) then
    return query
    select requested_place_id, false, null::integer, null::integer, null::jsonb, null::numeric, false;
    return;
  end if;

  select policy.*
  into policy_record
  from private.dog_friendliness_summary_policy as policy
  where policy.singleton and policy.enabled;

  if not found then
    return query
    select requested_place_id, false, null::integer, null::integer, null::jsonb, null::numeric, false;
    return;
  end if;

  select count(*)
  into computed_eligible_count
  from private.dog_friendliness_ratings as rating
  where rating.place_id = requested_place_id and rating.excluded_at is null;

  if computed_eligible_count < policy_record.minimum_eligible_count then
    return query
    select requested_place_id, false, null::integer, null::integer, null::jsonb, null::numeric, false;
    return;
  end if;

  select count(*)
  into computed_recency_count
  from private.dog_friendliness_ratings as rating
  where rating.place_id = requested_place_id
    and rating.excluded_at is null
    and rating.rated_at >= (statement_timestamp() - policy_record.recency_window);

  -- Raw, un-rounded per-Dimension means. Rounding to the nearest 0.5 is display-only and is
  -- applied exactly once per published value: once for each Dimension mean embedded in the
  -- dimensions JSON, and once for the overall (which averages the RAW means, never the rounded
  -- display values, per the public-rating-summary policy).
  select
    count(rating.welcome_score), avg(rating.welcome_score),
    count(rating.clarity_score), avg(rating.clarity_score),
    count(rating.comfort_score), avg(rating.comfort_score),
    count(rating.thoughtfulness_score), avg(rating.thoughtfulness_score)
  into
    welcome_count, welcome_mean, clarity_count, clarity_mean, comfort_count, comfort_mean,
    thoughtfulness_count, thoughtfulness_mean
  from private.dog_friendliness_ratings as rating
  where rating.place_id = requested_place_id and rating.excluded_at is null;

  if welcome_count >= policy_record.minimum_eligible_count then
    dims :=
      dims
      || jsonb_build_object(
        'dimension', 'welcome', 'applicableCount', welcome_count,
        'mean', round(welcome_mean * 2) / 2
      );
    qualifying_means := qualifying_means || welcome_mean;
  end if;

  if clarity_count >= policy_record.minimum_eligible_count then
    dims :=
      dims
      || jsonb_build_object(
        'dimension', 'clarity', 'applicableCount', clarity_count,
        'mean', round(clarity_mean * 2) / 2
      );
    qualifying_means := qualifying_means || clarity_mean;
  end if;

  if comfort_count >= policy_record.minimum_eligible_count then
    dims :=
      dims
      || jsonb_build_object(
        'dimension', 'comfort', 'applicableCount', comfort_count,
        'mean', round(comfort_mean * 2) / 2
      );
    qualifying_means := qualifying_means || comfort_mean;
  end if;

  if thoughtfulness_count >= policy_record.minimum_eligible_count then
    dims :=
      dims
      || jsonb_build_object(
        'dimension', 'thoughtfulness', 'applicableCount', thoughtfulness_count,
        'mean', round(thoughtfulness_mean * 2) / 2
      );
    qualifying_means := qualifying_means || thoughtfulness_mean;
  end if;

  if array_length(qualifying_means, 1) >= 2 then
    select round(avg(mean_value) * 2) / 2
    into computed_overall
    from unnest(qualifying_means) as mean_value;

    return query
    select
      requested_place_id, true, computed_eligible_count, computed_recency_count, dims, computed_overall, true;
    return;
  end if;

  return query
  select
    requested_place_id, true, computed_eligible_count, computed_recency_count, dims, null::numeric, false;
end;
$$;

-- Moderator-only detail listing for a Place: every current Rating, eligible or excluded, with
-- no aggregation. Used by the exclusion/reinstatement workspace, never exposed publicly.
create function public.list_moderation_dog_friendliness_ratings(requested_place_id uuid)
returns table (
  id uuid,
  member_id uuid,
  welcome_score integer,
  clarity_score integer,
  comfort_score integer,
  thoughtfulness_score integer,
  rated_at timestamptz,
  excluded_at timestamptz,
  excluded_kind text,
  excluded_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
begin
  if requested_place_id is null then
    raise exception using errcode = '22023', message = 'A Place is required';
  end if;

  return query
  select
    rating.id, rating.member_id, rating.welcome_score, rating.clarity_score, rating.comfort_score,
    rating.thoughtfulness_score, rating.rated_at, rating.excluded_at, rating.excluded_kind,
    rating.excluded_reason
  from private.dog_friendliness_ratings as rating
  where rating.place_id = requested_place_id
  order by rating.rated_at desc;
end;
$$;

create function public.exclude_dog_friendliness_rating(
  requested_member_id uuid,
  requested_place_id uuid,
  exclusion_kind text,
  reason text,
  command_request_id uuid
)
returns table (id uuid, excluded_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  rating_record private.dog_friendliness_ratings%rowtype;
begin
  if requested_member_id is null or requested_place_id is null or command_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'Rating exclusion identifiers are required';
  end if;

  if exclusion_kind <> all (array['abuse', 'fraud', 'duplication']::text[]) then
    raise exception using errcode = '22023', message = 'Rating exclusion kind is invalid';
  end if;

  if nullif(btrim(reason), '') is null then
    raise exception using errcode = '22023', message = 'An exclusion reason is required';
  end if;

  select rating.*
  into rating_record
  from private.dog_friendliness_ratings as rating
  where rating.member_id = requested_member_id and rating.place_id = requested_place_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Rating was not found';
  end if;

  if rating_record.excluded_at is not null then
    if rating_record.exclusion_request_id = command_request_id then
      return query select rating_record.id, rating_record.excluded_at;
      return;
    end if;
    raise exception using errcode = '55006', message = 'Rating is already excluded';
  end if;

  -- A request identifier that already produced an event must never mutate state again: a stale
  -- exclusion command replayed after a later reinstatement would otherwise re-exclude the Rating
  -- while its event insert silently dedupes, leaving a state change with no history row.
  if exists (
    select 1
    from private.dog_friendliness_rating_events as event
    where event.member_id = requested_member_id
      and event.place_id = requested_place_id
      and event.request_id = command_request_id
  ) then
    raise exception using
      errcode = '55006',
      message = 'Exclusion request identifier was already used';
  end if;

  update private.dog_friendliness_ratings as rating
  set
    excluded_at = statement_timestamp(),
    excluded_by = actor_id,
    excluded_reason = btrim(reason),
    excluded_kind = exclusion_kind,
    exclusion_request_id = command_request_id
  where rating.member_id = requested_member_id and rating.place_id = requested_place_id
  returning rating.* into rating_record;

  insert into private.dog_friendliness_rating_events (
    member_id, place_id, event_kind, welcome_score, clarity_score, comfort_score,
    thoughtfulness_score, reason, actor_id, request_id
  ) values (
    requested_member_id, requested_place_id, 'excluded', rating_record.welcome_score,
    rating_record.clarity_score, rating_record.comfort_score, rating_record.thoughtfulness_score,
    btrim(reason), actor_id, command_request_id
  )
  on conflict on constraint dog_friendliness_rating_events_member_place_request_key do nothing;

  perform private.append_audit_event(
    'dog_friendliness.rating_excluded',
    'dog_friendliness_rating',
    rating_record.id,
    command_request_id,
    jsonb_build_object(
      'member_id', requested_member_id,
      'place_id', requested_place_id,
      'kind', exclusion_kind,
      'reason', btrim(reason)
    )
  );

  return query select rating_record.id, rating_record.excluded_at;
end;
$$;

create function public.reinstate_dog_friendliness_rating(
  requested_member_id uuid,
  requested_place_id uuid,
  reason text,
  command_request_id uuid
)
returns table (id uuid, reinstated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  rating_record private.dog_friendliness_ratings%rowtype;
  previous_request_id uuid;
  previous_occurred_at timestamptz;
begin
  if requested_member_id is null or requested_place_id is null or command_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'Rating reinstatement identifiers are required';
  end if;

  if nullif(btrim(reason), '') is null then
    raise exception using errcode = '22023', message = 'A reinstatement reason is required';
  end if;

  select rating.*
  into rating_record
  from private.dog_friendliness_ratings as rating
  where rating.member_id = requested_member_id and rating.place_id = requested_place_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Rating was not found';
  end if;

  if rating_record.excluded_at is null then
    select event.request_id, event.occurred_at
    into previous_request_id, previous_occurred_at
    from private.dog_friendliness_rating_events as event
    where event.member_id = requested_member_id
      and event.place_id = requested_place_id
      and event.event_kind = 'reinstated'
    order by event.occurred_at desc
    limit 1;

    if previous_request_id = command_request_id then
      return query select rating_record.id, previous_occurred_at;
      return;
    end if;
    raise exception using errcode = '55006', message = 'Rating is not excluded';
  end if;

  -- A request identifier that already produced an event must never mutate state again: a stale
  -- reinstatement command replayed after the Rating was re-excluded by a different request would
  -- otherwise clear the newer exclusion while its event insert silently dedupes, leaving a state
  -- change with no history row. This mirrors the already-excluded guard in the exclusion path.
  if exists (
    select 1
    from private.dog_friendliness_rating_events as event
    where event.member_id = requested_member_id
      and event.place_id = requested_place_id
      and event.request_id = command_request_id
  ) then
    raise exception using
      errcode = '55006',
      message = 'Reinstatement request identifier was already used';
  end if;

  update private.dog_friendliness_ratings as rating
  set
    excluded_at = null,
    excluded_by = null,
    excluded_reason = null,
    excluded_kind = null,
    exclusion_request_id = null
  where rating.member_id = requested_member_id and rating.place_id = requested_place_id
  returning rating.* into rating_record;

  insert into private.dog_friendliness_rating_events (
    member_id, place_id, event_kind, welcome_score, clarity_score, comfort_score,
    thoughtfulness_score, reason, actor_id, request_id
  ) values (
    requested_member_id, requested_place_id, 'reinstated', rating_record.welcome_score,
    rating_record.clarity_score, rating_record.comfort_score, rating_record.thoughtfulness_score,
    btrim(reason), actor_id, command_request_id
  )
  on conflict on constraint dog_friendliness_rating_events_member_place_request_key do nothing;

  perform private.append_audit_event(
    'dog_friendliness.rating_reinstated',
    'dog_friendliness_rating',
    rating_record.id,
    command_request_id,
    jsonb_build_object(
      'member_id', requested_member_id, 'place_id', requested_place_id, 'reason', btrim(reason)
    )
  );

  return query select rating_record.id, statement_timestamp();
end;
$$;

revoke all on private.dog_friendliness_ratings from public, anon, authenticated, service_role;
revoke all on private.dog_friendliness_rating_events from public, anon, authenticated, service_role;
revoke all on private.dog_friendliness_summary_policy from public, anon, authenticated, service_role;

revoke execute on function public.configure_dog_friendliness_summary_policy(text, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.configure_dog_friendliness_summary_policy(text, integer, integer, boolean)
  to service_role;

revoke execute on function public.submit_dog_friendliness_rating(uuid, integer, integer, integer, integer, uuid)
  from public, anon, service_role;
grant execute on function public.submit_dog_friendliness_rating(uuid, integer, integer, integer, integer, uuid)
  to authenticated;

revoke execute on function public.get_my_dog_friendliness_rating(uuid)
  from public, anon, service_role;
grant execute on function public.get_my_dog_friendliness_rating(uuid)
  to authenticated;

revoke execute on function public.get_dog_friendliness_summary(uuid)
  from public, service_role;
grant execute on function public.get_dog_friendliness_summary(uuid)
  to anon, authenticated;

revoke execute on function public.list_moderation_dog_friendliness_ratings(uuid)
  from public, anon, service_role;
grant execute on function public.list_moderation_dog_friendliness_ratings(uuid)
  to authenticated;

revoke execute on function public.exclude_dog_friendliness_rating(uuid, uuid, text, text, uuid)
  from public, anon, service_role;
grant execute on function public.exclude_dog_friendliness_rating(uuid, uuid, text, text, uuid)
  to authenticated;

revoke execute on function public.reinstate_dog_friendliness_rating(uuid, uuid, text, uuid)
  from public, anon, service_role;
grant execute on function public.reinstate_dog_friendliness_rating(uuid, uuid, text, uuid)
  to authenticated;

comment on table private.dog_friendliness_ratings is
  'One current Member Dog-Friendliness Rating per Place across four independently N/A-able Dimensions.';
comment on table private.dog_friendliness_rating_events is
  'Append-only replacement and eligibility history for Dog-Friendliness Ratings.';
comment on table private.dog_friendliness_summary_policy is
  'Fail-closed singleton policy for the public Dog-Friendliness Summary (public-rating-summary). No row means disabled.';
comment on function public.get_dog_friendliness_summary(uuid) is
  'Privacy-protected public Summary. Returns summary_visible = false with no counts or values whenever the Place is not discoverable, the policy is unconfigured or disabled, or the eligible cohort is below threshold.';
comment on function public.submit_dog_friendliness_rating(uuid, integer, integer, integer, integer, uuid) is
  'Idempotently upserts the authenticated Member current Rating for a discoverable Place. Never clears a Moderator exclusion.';
comment on function public.exclude_dog_friendliness_rating(uuid, uuid, text, text, uuid) is
  'Moderator-only, auditable Rating eligibility exclusion for abuse, fraud, or duplication.';
comment on function public.reinstate_dog_friendliness_rating(uuid, uuid, text, uuid) is
  'Moderator-only, auditable reversal of a Rating eligibility exclusion.';
comment on function public.list_moderation_dog_friendliness_ratings(uuid) is
  'Moderator-only, unaggregated Rating detail for one Place, including excluded Ratings.';

commit;
