begin;

-- Qualifying activity is a derived seam over durable domain facts. It is deliberately not an XP,
-- points, streak, or reward ledger, and it never stores a second copy of a Member action.
create table private.activity_integrity_observations (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  source_kind text not null check (
    source_kind in ('check_in', 'rating', 'suggestion', 'correction', 'report')
  ),
  source_id uuid,
  signal_kind text not null check (
    signal_kind in (
      'request_replay',
      'duplicate_check_in',
      'merged_place_flag',
      'rating_no_material_change'
    )
  ),
  request_id uuid not null,
  observed_at timestamptz not null default statement_timestamp(),
  unique (member_id, source_kind, request_id, signal_kind)
);

create index activity_integrity_observations_member_time_idx
  on private.activity_integrity_observations (member_id, observed_at, id);

alter table private.activity_integrity_observations enable row level security;

create function private.reject_activity_integrity_observation_mutation()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Activity integrity observations are immutable';
end;
$$;

create trigger activity_integrity_observations_reject_update
before update on private.activity_integrity_observations
for each row execute function private.reject_activity_integrity_observation_mutation();

create trigger activity_integrity_observations_reject_truncate
before truncate on private.activity_integrity_observations
for each statement execute function private.reject_activity_integrity_observation_mutation();

create function private.record_activity_integrity_observation(
  target_member_id uuid,
  target_source_kind text,
  target_source_id uuid,
  target_signal_kind text,
  target_request_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into private.activity_integrity_observations (
    member_id,
    source_kind,
    source_id,
    signal_kind,
    request_id
  ) values (
    target_member_id,
    target_source_kind,
    target_source_id,
    target_signal_kind,
    target_request_id
  )
  on conflict (member_id, source_kind, request_id, signal_kind) do nothing;
end;
$$;

create function private.detach_member_activity_integrity_observations(
  requested_member_id uuid
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  removed_count bigint;
begin
  delete from private.activity_integrity_observations as observation
  where observation.member_id = requested_member_id;

  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

-- Every qualifying source takes this lock before a source-specific advisory or row lock. Keeping
-- the VIB-37 seed preserves the existing Favourite serialization key.
create function private.lock_member_qualifying_activity(target_member_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  if target_member_id is null then
    raise exception using errcode = '22023', message = 'Member is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_member_id::text, 7737001)
  );
end;
$$;

create index check_ins_member_time_activity_idx
  on private.check_ins (member_id, checked_in_at, id);

create index dog_friendliness_rating_events_member_time_activity_idx
  on private.dog_friendliness_rating_events (member_id, occurred_at, id)
  where event_kind in ('submitted', 'updated');

create view private.member_qualifying_activity
with (security_invoker = true)
as
with ordered_rating_events as (
  select
    event.*,
    lag(event.id) over rating_order as previous_event_id,
    lag(event.overall_score) over rating_order as previous_overall_score,
    lag(event.welcome_score) over rating_order as previous_welcome_score,
    lag(event.clarity_score) over rating_order as previous_clarity_score,
    lag(event.comfort_score) over rating_order as previous_comfort_score,
    lag(event.thoughtfulness_score) over rating_order as previous_thoughtfulness_score
  from private.dog_friendliness_rating_events as event
  where event.event_kind in ('submitted', 'updated')
  window rating_order as (
    partition by event.member_id, event.place_id
    order by event.occurred_at, event.id
  )
),
material_rating_events as (
  select
    event.*,
    date_trunc(
      'week',
      event.occurred_at at time zone 'Atlantic/Reykjavik'
    )::date as week_starts_on
  from ordered_rating_events as event
  where event.previous_event_id is null
    or row(
      event.overall_score,
      event.welcome_score,
      event.clarity_score,
      event.comfort_score,
      event.thoughtfulness_score
    ) is distinct from row(
      event.previous_overall_score,
      event.previous_welcome_score,
      event.previous_clarity_score,
      event.previous_comfort_score,
      event.previous_thoughtfulness_score
    )
),
weekly_rating_events as (
  select
    event.*,
    row_number() over (
      partition by event.member_id, event.place_id, event.week_starts_on
      order by event.occurred_at, event.id
    ) as weekly_ordinal
  from material_rating_events as event
)
select
  save.member_id,
  'favourite'::text as source_kind,
  save.place_id as source_id,
  save.first_saved_at as occurred_at,
  date_trunc(
    'week',
    save.first_saved_at at time zone 'Atlantic/Reykjavik'
  )::date as week_starts_on
from private.member_place_first_saves as save

union all

select
  check_in.member_id,
  'check_in',
  check_in.id,
  check_in.checked_in_at,
  date_trunc(
    'week',
    check_in.checked_in_at at time zone 'Atlantic/Reykjavik'
  )::date
from private.check_ins as check_in

union all

select
  rating.member_id,
  'rating',
  rating.id,
  rating.occurred_at,
  rating.week_starts_on
from weekly_rating_events as rating
where rating.weekly_ordinal = 1

union all

select
  suggestion.member_id,
  'suggestion',
  suggestion.id,
  suggestion.submitted_at,
  date_trunc(
    'week',
    suggestion.submitted_at at time zone 'Atlantic/Reykjavik'
  )::date
from private.place_suggestions as suggestion

union all

select
  flag.member_id,
  flag.kind::text,
  flag.id,
  flag.submitted_at,
  date_trunc(
    'week',
    flag.submitted_at at time zone 'Atlantic/Reykjavik'
  )::date
from private.place_flags as flag;

create function private.get_member_qualifying_action_recognition(
  target_member_id uuid,
  target_source_kind text,
  target_source_id uuid,
  source_was_created boolean
)
returns table (
  qualifying_action_recorded boolean,
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
  command_time timestamptz := statement_timestamp();
  week_start date;
  week_end date;
  week_start_at timestamptz;
  week_end_at timestamptz;
  current_action_count bigint;
  source_is_current boolean := false;
begin
  select bounds.starts_on, bounds.ends_on, bounds.starts_at, bounds.ends_at
  into week_start, week_end, week_start_at, week_end_at
  from private.reykjavik_week_bounds(command_time) as bounds;

  if source_was_created then
    select exists (
      select 1
      from private.member_qualifying_activity as activity
      where activity.member_id = target_member_id
        and activity.source_kind = target_source_kind
        and activity.source_id = target_source_id
        and activity.occurred_at >= week_start_at
        and activity.occurred_at < week_end_at
    ) into source_is_current;
  end if;

  select count(*)
  into current_action_count
  from private.member_qualifying_activity as activity
  where activity.member_id = target_member_id
    and activity.occurred_at >= week_start_at
    and activity.occurred_at < week_end_at;

  return query
  select
    source_is_current,
    source_is_current and current_action_count = 1,
    week_start,
    week_end,
    current_action_count > 0;
end;
$$;

alter function public.set_current_favourite(uuid, boolean)
  rename to set_current_favourite_pre_activity;
alter function public.set_current_favourite_pre_activity(uuid, boolean)
  set schema private;

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
  submitting_member_id uuid := auth.uid();
  favourite_result record;
  recognition record;
begin
  if submitting_member_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not exists (
    select 1
    from private.member_accounts as member_account
    where member_account.user_id = submitting_member_id
  ) then
    raise exception using errcode = '42501', message = 'Member activation required';
  end if;

  if requested_place_id is null or desired_state is null then
    raise exception using errcode = '22023', message = 'Place and desired state required';
  end if;

  perform private.lock_member_qualifying_activity(submitting_member_id);

  select result.*
  into favourite_result
  from private.set_current_favourite_pre_activity(
    requested_place_id,
    desired_state
  ) as result;

  select result.*
  into recognition
  from private.get_member_qualifying_action_recognition(
    submitting_member_id,
    'favourite',
    requested_place_id,
    favourite_result.first_time_for_place
  ) as result;

  return query
  select
    favourite_result.place_id::uuid,
    favourite_result.is_favourite::boolean,
    favourite_result.changed_at::timestamptz,
    favourite_result.first_time_for_place::boolean,
    recognition.activated_current_week::boolean,
    recognition.current_week_starts_on::date,
    recognition.current_week_ends_on::date,
    recognition.current_week_active::boolean;
end;
$$;

alter function public.record_check_in(uuid, text, uuid)
  rename to record_check_in_pre_activity;
alter function public.record_check_in_pre_activity(uuid, text, uuid)
  set schema private;

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
  already_checked_in boolean,
  qualifying_action_recorded boolean,
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
  actor_id uuid := security.require_member();
  check_in_result record;
  recognition record;
  observed_source_id uuid;
  exact_replay boolean := false;
begin
  if requested_place_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Place and request ID are required';
  end if;

  perform private.lock_member_qualifying_activity(actor_id);

  select observation.source_id
  into observed_source_id
  from private.activity_integrity_observations as observation
  where observation.member_id = actor_id
    and observation.source_kind = 'check_in'
    and observation.request_id = command_request_id
  order by observation.observed_at, observation.id
  limit 1;

  if found then
    select
      check_in.id as check_in_id,
      check_in.place_id,
      check_in.proximity_confirmed::text as proximity_confirmed,
      check_in.checked_in_at,
      true as already_checked_in
    into check_in_result
    from private.check_ins as check_in
    where check_in.id = observed_source_id
      and check_in.member_id = actor_id;

    if found then
      select result.*
      into recognition
      from private.get_member_qualifying_action_recognition(
        actor_id,
        'check_in',
        check_in_result.check_in_id,
        false
      ) as result;

      return query
      select
        check_in_result.check_in_id::uuid,
        check_in_result.place_id::uuid,
        check_in_result.proximity_confirmed::text,
        check_in_result.checked_in_at::timestamptz,
        true,
        recognition.qualifying_action_recorded::boolean,
        recognition.activated_current_week::boolean,
        recognition.current_week_starts_on::date,
        recognition.current_week_ends_on::date,
        recognition.current_week_active::boolean;
      return;
    end if;
  end if;

  select exists (
    select 1
    from private.check_ins as check_in
    where check_in.member_id = actor_id
      and check_in.request_id = command_request_id
  ) into exact_replay;

  select result.*
  into check_in_result
  from private.record_check_in_pre_activity(
    requested_place_id,
    requested_proximity_status,
    command_request_id
  ) as result;

  if check_in_result.already_checked_in then
    perform private.record_activity_integrity_observation(
      actor_id,
      'check_in',
      check_in_result.check_in_id,
      case when exact_replay then 'request_replay' else 'duplicate_check_in' end,
      command_request_id
    );
  end if;

  select result.*
  into recognition
  from private.get_member_qualifying_action_recognition(
    actor_id,
    'check_in',
    check_in_result.check_in_id,
    not check_in_result.already_checked_in
  ) as result;

  return query
  select
    check_in_result.check_in_id::uuid,
    check_in_result.place_id::uuid,
    check_in_result.proximity_confirmed::text,
    check_in_result.checked_in_at::timestamptz,
    check_in_result.already_checked_in::boolean,
    recognition.qualifying_action_recorded::boolean,
    recognition.activated_current_week::boolean,
    recognition.current_week_starts_on::date,
    recognition.current_week_ends_on::date,
    recognition.current_week_active::boolean;
end;
$$;

alter function public.submit_place_suggestion(jsonb, uuid)
  rename to submit_place_suggestion_pre_activity;
alter function public.submit_place_suggestion_pre_activity(jsonb, uuid)
  set schema private;

create function public.submit_place_suggestion(
  command_proposal jsonb,
  command_request_id uuid
)
returns table (
  suggestion_id uuid,
  status text,
  submitted_at timestamptz,
  qualifying_action_recorded boolean,
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
  actor_id uuid := security.require_member();
  suggestion_result record;
  recognition record;
  existed_before boolean;
begin
  if command_request_id is null then
    raise exception using errcode = '22023', message = 'Suggestion request ID is required';
  end if;

  perform private.lock_member_qualifying_activity(actor_id);

  select exists (
    select 1
    from private.place_suggestions as suggestion
    where suggestion.member_id = actor_id
      and suggestion.request_id = command_request_id
  ) into existed_before;

  select result.*
  into suggestion_result
  from private.submit_place_suggestion_pre_activity(
    command_proposal,
    command_request_id
  ) as result;

  if existed_before then
    perform private.record_activity_integrity_observation(
      actor_id,
      'suggestion',
      suggestion_result.suggestion_id,
      'request_replay',
      command_request_id
    );
  end if;

  select result.*
  into recognition
  from private.get_member_qualifying_action_recognition(
    actor_id,
    'suggestion',
    suggestion_result.suggestion_id,
    not existed_before
  ) as result;

  return query
  select
    suggestion_result.suggestion_id::uuid,
    suggestion_result.status::text,
    suggestion_result.submitted_at::timestamptz,
    recognition.qualifying_action_recorded::boolean,
    recognition.activated_current_week::boolean,
    recognition.current_week_starts_on::date,
    recognition.current_week_ends_on::date,
    recognition.current_week_active::boolean;
end;
$$;

drop function public.submit_place_correction(jsonb, uuid);
drop function public.submit_place_report(jsonb, uuid);

create function private.submit_place_flag_with_activity(
  requested_kind private.place_flag_kind,
  requested_payload jsonb,
  command_request_id uuid
)
returns table (
  flag_id uuid,
  status text,
  submitted_at timestamptz,
  qualifying_action_recorded boolean,
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
  actor_id uuid := security.require_member();
  flag_result record;
  recognition record;
  observed_source_id uuid;
  existed_before boolean;
  persisted_request_id uuid;
  source_created boolean;
begin
  if command_request_id is null then
    raise exception using errcode = '22023', message = 'Flag request ID is required';
  end if;

  perform private.validate_place_flag_command(requested_kind, requested_payload);
  perform private.lock_member_qualifying_activity(actor_id);

  select observation.source_id
  into observed_source_id
  from private.activity_integrity_observations as observation
  where observation.member_id = actor_id
    and observation.source_kind = requested_kind::text
    and observation.request_id = command_request_id
  order by observation.observed_at, observation.id
  limit 1;

  if found then
    select
      flag.id as flag_id,
      flag.status::text as status,
      flag.submitted_at
    into flag_result
    from private.place_flags as flag
    where flag.id = observed_source_id
      and flag.member_id = actor_id
      and flag.kind = requested_kind;

    if found then
      select result.*
      into recognition
      from private.get_member_qualifying_action_recognition(
        actor_id,
        requested_kind::text,
        flag_result.flag_id,
        false
      ) as result;

      return query
      select
        flag_result.flag_id::uuid,
        flag_result.status::text,
        flag_result.submitted_at::timestamptz,
        recognition.qualifying_action_recorded::boolean,
        recognition.activated_current_week::boolean,
        recognition.current_week_starts_on::date,
        recognition.current_week_ends_on::date,
        recognition.current_week_active::boolean;
      return;
    end if;
  end if;

  select exists (
    select 1
    from private.place_flags as flag
    where flag.member_id = actor_id
      and flag.request_id = command_request_id
  ) into existed_before;

  select result.*
  into flag_result
  from private.create_place_flag(
    requested_kind,
    requested_payload,
    actor_id,
    command_request_id
  ) as result;

  select flag.request_id
  into persisted_request_id
  from private.place_flags as flag
  where flag.id = flag_result.flag_id;

  source_created := not existed_before and persisted_request_id = command_request_id;

  if not source_created then
    perform private.record_activity_integrity_observation(
      actor_id,
      requested_kind::text,
      flag_result.flag_id,
      case when existed_before then 'request_replay' else 'merged_place_flag' end,
      command_request_id
    );
  end if;

  select result.*
  into recognition
  from private.get_member_qualifying_action_recognition(
    actor_id,
    requested_kind::text,
    flag_result.flag_id,
    source_created
  ) as result;

  return query
  select
    flag_result.flag_id::uuid,
    flag_result.status::text,
    flag_result.submitted_at::timestamptz,
    recognition.qualifying_action_recorded::boolean,
    recognition.activated_current_week::boolean,
    recognition.current_week_starts_on::date,
    recognition.current_week_ends_on::date,
    recognition.current_week_active::boolean;
end;
$$;

create function public.submit_place_correction(
  command_payload jsonb,
  command_request_id uuid
)
returns table (
  flag_id uuid,
  status text,
  submitted_at timestamptz,
  qualifying_action_recorded boolean,
  activated_current_week boolean,
  current_week_starts_on date,
  current_week_ends_on date,
  current_week_active boolean
)
language sql
volatile
security definer
set search_path = ''
as $$
  select result.*
  from private.submit_place_flag_with_activity(
    'correction'::private.place_flag_kind,
    command_payload,
    command_request_id
  ) as result;
$$;

create function public.submit_place_report(
  command_payload jsonb,
  command_request_id uuid
)
returns table (
  flag_id uuid,
  status text,
  submitted_at timestamptz,
  qualifying_action_recorded boolean,
  activated_current_week boolean,
  current_week_starts_on date,
  current_week_ends_on date,
  current_week_active boolean
)
language sql
volatile
security definer
set search_path = ''
as $$
  select result.*
  from private.submit_place_flag_with_activity(
    'report'::private.place_flag_kind,
    command_payload,
    command_request_id
  ) as result;
$$;

alter function public.save_inline_dog_friendliness_rating(
  uuid,
  integer,
  integer,
  integer,
  integer,
  integer,
  uuid,
  boolean,
  text,
  text
) rename to save_inline_dog_friendliness_rating_pre_activity;
alter function public.save_inline_dog_friendliness_rating_pre_activity(
  uuid,
  integer,
  integer,
  integer,
  integer,
  integer,
  uuid,
  boolean,
  text,
  text
) set schema private;

create function public.save_inline_dog_friendliness_rating(
  requested_place_id uuid,
  requested_overall_score integer,
  requested_welcome_score integer,
  requested_clarity_score integer,
  requested_comfort_score integer,
  requested_thoughtfulness_score integer,
  command_request_id uuid,
  requested_update_private_note boolean default false,
  requested_private_note text default null,
  requested_private_note_classification text default null
)
returns table (
  id uuid,
  place_id uuid,
  overall_score integer,
  welcome_score integer,
  clarity_score integer,
  comfort_score integer,
  thoughtfulness_score integer,
  rated_at timestamptz,
  private_note text,
  private_note_updated_at timestamptz,
  qualifying_action_recorded boolean,
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
  submitting_member_id uuid := security.require_member();
  existing private.dog_friendliness_ratings%rowtype;
  rating_result record;
  recognition record;
  rating_event record;
  scores_unchanged boolean := false;
  request_was_used boolean := false;
begin
  if requested_place_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Place and request identifiers are required';
  end if;

  perform private.lock_member_qualifying_activity(submitting_member_id);

  select rating.*
  into existing
  from private.dog_friendliness_ratings as rating
  where rating.member_id = submitting_member_id
    and rating.place_id = requested_place_id;

  if found then
    scores_unchanged := existing.overall_score = requested_overall_score
      and existing.welcome_score is not distinct from requested_welcome_score
      and existing.clarity_score is not distinct from requested_clarity_score
      and existing.comfort_score is not distinct from requested_comfort_score
      and existing.thoughtfulness_score is not distinct from requested_thoughtfulness_score;
  end if;

  select exists (
    select 1
    from private.dog_friendliness_rating_events as event
    where event.member_id = submitting_member_id
      and event.place_id = requested_place_id
      and event.request_id = command_request_id
    union all
    select 1
    from private.activity_integrity_observations as observation
    where observation.member_id = submitting_member_id
      and observation.source_kind = 'rating'
      and observation.request_id = command_request_id
  ) into request_was_used;

  if request_was_used and existing.id is not null then
    perform private.record_activity_integrity_observation(
      submitting_member_id,
      'rating',
      existing.id,
      'request_replay',
      command_request_id
    );

    select result.*
    into recognition
    from private.get_member_qualifying_action_recognition(
      submitting_member_id,
      'rating',
      existing.id,
      false
    ) as result;

    return query
    select
      existing.id,
      existing.place_id,
      existing.overall_score,
      existing.welcome_score,
      existing.clarity_score,
      existing.comfort_score,
      existing.thoughtfulness_score,
      existing.rated_at,
      existing.private_note,
      existing.private_note_updated_at,
      recognition.qualifying_action_recorded::boolean,
      recognition.activated_current_week::boolean,
      recognition.current_week_starts_on::date,
      recognition.current_week_ends_on::date,
      recognition.current_week_active::boolean;
    return;
  end if;

  -- Autosave retries with an identical score tuple are true no-ops. They do not advance recency,
  -- append a Rating event, or become eligible to activate another week.
  if existing.id is not null and scores_unchanged and not requested_update_private_note then
    perform private.record_activity_integrity_observation(
      submitting_member_id,
      'rating',
      existing.id,
      'rating_no_material_change',
      command_request_id
    );

    select result.*
    into recognition
    from private.get_member_qualifying_action_recognition(
      submitting_member_id,
      'rating',
      existing.id,
      false
    ) as result;

    return query
    select
      existing.id,
      existing.place_id,
      existing.overall_score,
      existing.welcome_score,
      existing.clarity_score,
      existing.comfort_score,
      existing.thoughtfulness_score,
      existing.rated_at,
      existing.private_note,
      existing.private_note_updated_at,
      recognition.qualifying_action_recorded::boolean,
      recognition.activated_current_week::boolean,
      recognition.current_week_starts_on::date,
      recognition.current_week_ends_on::date,
      recognition.current_week_active::boolean;
    return;
  end if;

  select result.*
  into rating_result
  from private.save_inline_dog_friendliness_rating_pre_activity(
    requested_place_id,
    requested_overall_score,
    requested_welcome_score,
    requested_clarity_score,
    requested_comfort_score,
    requested_thoughtfulness_score,
    command_request_id,
    requested_update_private_note,
    requested_private_note,
    requested_private_note_classification
  ) as result;

  select event.id, event.event_kind
  into rating_event
  from private.dog_friendliness_rating_events as event
  where event.member_id = submitting_member_id
    and event.place_id = requested_place_id
    and event.request_id = command_request_id;

  select result.*
  into recognition
  from private.get_member_qualifying_action_recognition(
    submitting_member_id,
    'rating',
    coalesce(rating_event.id, rating_result.id),
    rating_event.event_kind in ('submitted', 'updated')
  ) as result;

  return query
  select
    rating_result.id::uuid,
    rating_result.place_id::uuid,
    rating_result.overall_score::integer,
    rating_result.welcome_score::integer,
    rating_result.clarity_score::integer,
    rating_result.comfort_score::integer,
    rating_result.thoughtfulness_score::integer,
    rating_result.rated_at::timestamptz,
    rating_result.private_note::text,
    rating_result.private_note_updated_at::timestamptz,
    recognition.qualifying_action_recorded::boolean,
    recognition.activated_current_week::boolean,
    recognition.current_week_starts_on::date,
    recognition.current_week_ends_on::date,
    recognition.current_week_active::boolean;
end;
$$;

alter function public.submit_dog_friendliness_rating(
  uuid,
  integer,
  integer,
  integer,
  integer,
  uuid,
  boolean,
  text,
  text
) rename to submit_dog_friendliness_rating_pre_activity;
alter function public.submit_dog_friendliness_rating_pre_activity(
  uuid,
  integer,
  integer,
  integer,
  integer,
  uuid,
  boolean,
  text,
  text
) set schema private;

create function public.submit_dog_friendliness_rating(
  requested_place_id uuid,
  requested_welcome_score integer,
  requested_clarity_score integer,
  requested_comfort_score integer,
  requested_thoughtfulness_score integer,
  command_request_id uuid,
  requested_update_private_note boolean default false,
  requested_private_note text default null,
  requested_private_note_classification text default null
)
returns table (
  id uuid,
  place_id uuid,
  welcome_score integer,
  clarity_score integer,
  comfort_score integer,
  thoughtfulness_score integer,
  rated_at timestamptz,
  private_note text,
  private_note_updated_at timestamptz,
  qualifying_action_recorded boolean,
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
  submitting_member_id uuid := security.require_member();
  rating_result record;
  recognition record;
  event_record record;
  event_existed_before boolean;
begin
  if requested_place_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Place and request identifiers are required';
  end if;

  perform private.lock_member_qualifying_activity(submitting_member_id);

  select exists (
    select 1
    from private.dog_friendliness_rating_events as event
    where event.member_id = submitting_member_id
      and event.place_id = requested_place_id
      and event.request_id = command_request_id
  ) into event_existed_before;

  select result.*
  into rating_result
  from private.submit_dog_friendliness_rating_pre_activity(
    requested_place_id,
    requested_welcome_score,
    requested_clarity_score,
    requested_comfort_score,
    requested_thoughtfulness_score,
    command_request_id,
    requested_update_private_note,
    requested_private_note,
    requested_private_note_classification
  ) as result;

  select event.id, event.event_kind
  into event_record
  from private.dog_friendliness_rating_events as event
  where event.member_id = submitting_member_id
    and event.place_id = requested_place_id
    and event.request_id = command_request_id;

  if event_existed_before then
    perform private.record_activity_integrity_observation(
      submitting_member_id,
      'rating',
      coalesce(event_record.id, rating_result.id),
      'request_replay',
      command_request_id
    );
  end if;

  select result.*
  into recognition
  from private.get_member_qualifying_action_recognition(
    submitting_member_id,
    'rating',
    coalesce(event_record.id, rating_result.id),
    not event_existed_before and event_record.event_kind in ('submitted', 'updated')
  ) as result;

  return query
  select
    rating_result.id::uuid,
    rating_result.place_id::uuid,
    rating_result.welcome_score::integer,
    rating_result.clarity_score::integer,
    rating_result.comfort_score::integer,
    rating_result.thoughtfulness_score::integer,
    rating_result.rated_at::timestamptz,
    rating_result.private_note::text,
    rating_result.private_note_updated_at::timestamptz,
    recognition.qualifying_action_recorded::boolean,
    recognition.activated_current_week::boolean,
    recognition.current_week_starts_on::date,
    recognition.current_week_ends_on::date,
    recognition.current_week_active::boolean;
end;
$$;

drop function public.apply_pending_member_rating(uuid);

create function public.apply_pending_member_rating(requested_place_id uuid)
returns table (
  applied boolean,
  overall_score integer,
  qualifying_action_recorded boolean,
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
  actor_id uuid := security.require_member();
  pending private.pending_member_rating_completions%rowtype;
  current_rating private.dog_friendliness_ratings%rowtype;
  generated_request_id uuid := extensions.gen_random_uuid();
  saved record;
  recognition record;
begin
  if requested_place_id is null then
    raise exception using errcode = '22023', message = 'A Place is required';
  end if;

  perform private.lock_member_qualifying_activity(actor_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || requested_place_id::text, 0)
  );

  select completion.*
  into pending
  from private.pending_member_rating_completions as completion
  where completion.member_id = actor_id
    and completion.place_id = requested_place_id
    and completion.applied_at is null
  order by completion.created_at desc, completion.request_id desc
  limit 1
  for update;

  if not found then
    select result.*
    into recognition
    from private.get_member_qualifying_action_recognition(
      actor_id,
      'rating',
      requested_place_id,
      false
    ) as result;

    return query
    select
      false,
      null::integer,
      false,
      false,
      recognition.current_week_starts_on::date,
      recognition.current_week_ends_on::date,
      recognition.current_week_active::boolean;
    return;
  end if;

  select rating.*
  into current_rating
  from private.dog_friendliness_ratings as rating
  where rating.member_id = actor_id
    and rating.place_id = requested_place_id;

  select result.*
  into saved
  from public.save_inline_dog_friendliness_rating(
    requested_place_id,
    pending.overall_rating,
    current_rating.welcome_score,
    current_rating.clarity_score,
    current_rating.comfort_score,
    current_rating.thoughtfulness_score,
    generated_request_id,
    false,
    null,
    null
  ) as result;

  update private.pending_member_rating_completions
  set applied_at = statement_timestamp()
  where member_id = actor_id
    and place_id = requested_place_id
    and applied_at is null
    and (created_at, request_id) <= (pending.created_at, pending.request_id);

  return query
  select
    true,
    pending.overall_rating,
    saved.qualifying_action_recorded::boolean,
    saved.activated_current_week::boolean,
    saved.current_week_starts_on::date,
    saved.current_week_ends_on::date,
    saved.current_week_active::boolean;
end;
$$;

alter function public.create_report_from_rating_note(uuid, uuid)
  rename to create_report_from_rating_note_pre_activity;
alter function public.create_report_from_rating_note_pre_activity(uuid, uuid)
  set schema private;

create function public.create_report_from_rating_note(
  requested_place_id uuid,
  command_request_id uuid
)
returns table (
  flag_id uuid,
  status text,
  submitted_at timestamptz,
  qualifying_action_recorded boolean,
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
  actor_id uuid := security.require_member();
  report_result record;
  recognition record;
  linked_before boolean;
  persisted_request_id uuid;
  source_created boolean;
begin
  if requested_place_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Report-from-note identifiers are required';
  end if;

  perform private.lock_member_qualifying_activity(actor_id);

  select exists (
    select 1
    from private.dog_friendliness_ratings as rating
    where rating.member_id = actor_id
      and rating.place_id = requested_place_id
      and rating.linked_report_request_id = command_request_id
  ) into linked_before;

  select result.*
  into report_result
  from private.create_report_from_rating_note_pre_activity(
    requested_place_id,
    command_request_id
  ) as result;

  select flag.request_id
  into persisted_request_id
  from private.place_flags as flag
  where flag.id = report_result.flag_id;

  source_created := not linked_before and persisted_request_id = command_request_id;

  if linked_before then
    perform private.record_activity_integrity_observation(
      actor_id,
      'report',
      report_result.flag_id,
      'request_replay',
      command_request_id
    );
  end if;

  select result.*
  into recognition
  from private.get_member_qualifying_action_recognition(
    actor_id,
    'report',
    report_result.flag_id,
    source_created
  ) as result;

  return query
  select
    report_result.flag_id::uuid,
    report_result.status::text,
    report_result.submitted_at::timestamptz,
    recognition.qualifying_action_recorded::boolean,
    recognition.activated_current_week::boolean,
    recognition.current_week_starts_on::date,
    recognition.current_week_ends_on::date,
    recognition.current_week_active::boolean;
end;
$$;

create or replace function public.get_current_member_weekly_rhythm()
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
      from private.member_qualifying_activity as activity
      where activity.member_id = auth.uid()
        and activity.week_starts_on = bounds.starts_on
    )
  from current_bounds as bounds
  where auth.uid() is not null
    and exists (
      select 1
      from private.member_accounts as account
      where account.user_id = auth.uid()
    );
$$;

create or replace function public.list_current_member_weekly_rhythm()
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
      from private.member_qualifying_activity as activity
      where activity.member_id = auth.uid()
        and activity.week_starts_on = weeks.week_start
    )
  from weeks
  where auth.uid() is not null
    and exists (
      select 1
      from private.member_accounts as account
      where account.user_id = auth.uid()
    )
  order by weeks.week_start;
$$;

create function private.list_meaningful_retention_cohorts(
  as_of timestamptz,
  minimum_cohort_size integer
)
returns table (
  cohort_starts_on date,
  cohort_ends_on date,
  cohort_member_count bigint,
  retained_member_count bigint,
  retention_rate numeric,
  suppressed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_bounds as (
    select bounds.starts_on
    from private.reykjavik_week_bounds(as_of) as bounds
  ),
  first_weeks as (
    select activity.member_id, min(activity.week_starts_on) as cohort_start
    from private.member_qualifying_activity as activity
    group by activity.member_id
  ),
  matured_members as (
    select first_week.member_id, first_week.cohort_start
    from first_weeks as first_week
    cross join current_bounds as bounds
    where first_week.cohort_start + 28 <= bounds.starts_on
  ),
  member_retention as (
    select
      member.member_id,
      member.cohort_start,
      count(distinct activity.week_starts_on) filter (
        where activity.week_starts_on >= member.cohort_start
          and activity.week_starts_on < member.cohort_start + 28
      ) >= 2
      and coalesce(bool_or(
        activity.week_starts_on = member.cohort_start + 21
      ), false) as retained
    from matured_members as member
    left join private.member_qualifying_activity as activity
      on activity.member_id = member.member_id
      and activity.week_starts_on >= member.cohort_start
      and activity.week_starts_on < member.cohort_start + 28
    group by member.member_id, member.cohort_start
  ),
  cohort_counts as (
    select
      member.cohort_start,
      count(*)::bigint as member_count,
      count(*) filter (where member.retained)::bigint as retained_count
    from member_retention as member
    group by member.cohort_start
  )
  select
    cohort.cohort_start,
    cohort.cohort_start + 27,
    case
      when cohort.member_count < minimum_cohort_size then null
      else cohort.member_count
    end,
    case
      when cohort.member_count < minimum_cohort_size then null
      else cohort.retained_count
    end,
    case
      when cohort.member_count < minimum_cohort_size then null
      else round(
        cohort.retained_count::numeric / nullif(cohort.member_count, 0),
        4
      )
    end,
    cohort.member_count < minimum_cohort_size
  from cohort_counts as cohort
  order by cohort.cohort_start;
$$;

create function private.get_rolling_four_week_engagement(
  as_of timestamptz,
  minimum_population_size integer
)
returns table (
  window_starts_on date,
  window_ends_on date,
  active_member_count bigint,
  engaged_member_count bigint,
  engagement_rate numeric,
  suppressed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_bounds as (
    select bounds.starts_on
    from private.reykjavik_week_bounds(as_of) as bounds
  ),
  member_weeks as (
    select
      activity.member_id,
      count(distinct activity.week_starts_on)::bigint as active_weeks
    from private.member_qualifying_activity as activity
    cross join current_bounds as bounds
    where activity.week_starts_on >= bounds.starts_on - 28
      and activity.week_starts_on < bounds.starts_on
    group by activity.member_id
  ),
  totals as (
    select
      count(*)::bigint as active_count,
      count(*) filter (where member.active_weeks >= 2)::bigint as engaged_count
    from member_weeks as member
  )
  select
    bounds.starts_on - 28,
    bounds.starts_on - 1,
    case
      when totals.active_count < minimum_population_size then null
      else totals.active_count
    end,
    case
      when totals.active_count < minimum_population_size then null
      else totals.engaged_count
    end,
    case
      when totals.active_count < minimum_population_size then null
      else round(
        totals.engaged_count::numeric / nullif(totals.active_count, 0),
        4
      )
    end,
    totals.active_count < minimum_population_size
  from current_bounds as bounds
  cross join totals;
$$;

create function public.get_member_retention_report()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with reporting_bounds as (
    select
      bounds.starts_on as reporting_week_start,
      bounds.starts_on - 28 as rolling_start,
      bounds.starts_on::timestamp at time zone 'Atlantic/Reykjavik' as rolling_end_at,
      (bounds.starts_on - 28)::timestamp at time zone 'Atlantic/Reykjavik'
        as rolling_start_at
    from private.reykjavik_week_bounds(statement_timestamp()) as bounds
  ),
  report_cohort_weeks as (
    select
      (bounds.reporting_week_start - 28 - (offsets.weeks_ago * 7))::date
        as cohort_start,
      offsets.weeks_ago
    from reporting_bounds as bounds
    cross join generate_series(11, 0, -1) as offsets(weeks_ago)
  ),
  cohort_values as (
    select
      week.cohort_start,
      coalesce(cohort.suppressed, true) as suppressed,
      cohort.cohort_member_count,
      cohort.retained_member_count,
      cohort.retention_rate
    from report_cohort_weeks as week
    left join private.list_meaningful_retention_cohorts(
      statement_timestamp(),
      5
    ) as cohort
      on cohort.cohort_starts_on = week.cohort_start
    order by week.cohort_start
  ),
  cohort_json as (
    select jsonb_agg(
      jsonb_build_object(
        'week1StartsOn', cohort.cohort_start,
        'week4StartsOn', cohort.cohort_start + 21,
        'suppressed', cohort.suppressed,
        'cohortMemberCount', cohort.cohort_member_count,
        'retainedMemberCount', cohort.retained_member_count,
        'retentionRate', cohort.retention_rate
      ) order by cohort.cohort_start
    ) as value
    from cohort_values as cohort
  ),
  completed_member_weeks as (
    select
      activity.member_id,
      count(distinct activity.week_starts_on)::bigint as active_weeks
    from private.member_qualifying_activity as activity
    cross join reporting_bounds as bounds
    where activity.week_starts_on >= bounds.rolling_start
      and activity.week_starts_on < bounds.reporting_week_start
    group by activity.member_id
  ),
  rolling_values as (
    select
      count(*)::bigint as active_count,
      count(*) filter (where member.active_weeks >= 2)::bigint as engaged_count
    from completed_member_weeks as member
  ),
  raw_guardrails as (
    select
      'duplicate_check_ins'::text as kind,
      observation.member_id,
      observation.id as event_id
    from private.activity_integrity_observations as observation
    cross join reporting_bounds as bounds
    where observation.signal_kind = 'duplicate_check_in'
      and observation.observed_at >= bounds.rolling_start_at
      and observation.observed_at < bounds.rolling_end_at

    union all

    select
      'replayed_requests',
      observation.member_id,
      observation.id
    from private.activity_integrity_observations as observation
    cross join reporting_bounds as bounds
    where observation.signal_kind in (
      'request_replay',
      'merged_place_flag',
      'rating_no_material_change'
    )
      and observation.observed_at >= bounds.rolling_start_at
      and observation.observed_at < bounds.rolling_end_at

    union all

    select
      'rejected_suggestions',
      suggestion.member_id,
      suggestion.id
    from private.place_suggestions as suggestion
    cross join reporting_bounds as bounds
    where suggestion.status = 'rejected'
      and suggestion.resolved_at >= bounds.rolling_start_at
      and suggestion.resolved_at < bounds.rolling_end_at

    union all

    select
      'rejected_corrections_or_reports',
      flag.member_id,
      flag.id
    from private.place_flags as flag
    cross join reporting_bounds as bounds
    where flag.status = 'rejected'
      and flag.resolved_at >= bounds.rolling_start_at
      and flag.resolved_at < bounds.rolling_end_at

    union all

    select
      'revoked_contributions',
      contribution.member_id,
      contribution.id
    from private.contributions as contribution
    cross join reporting_bounds as bounds
    where contribution.revoked_at >= bounds.rolling_start_at
      and contribution.revoked_at < bounds.rolling_end_at

    union all

    select
      'excluded_ratings',
      rating.member_id,
      rating.id
    from private.dog_friendliness_ratings as rating
    cross join reporting_bounds as bounds
    where rating.excluded_at >= bounds.rolling_start_at
      and rating.excluded_at < bounds.rolling_end_at

    union all

    select
      'active_conduct_flags',
      flag.member_id,
      flag.id
    from private.member_conduct_flags as flag
    where flag.flag_kind <> 'flag_cleared'
      and not exists (
        select 1
        from private.member_conduct_flags as clearing
        where clearing.flag_kind = 'flag_cleared'
          and clearing.cleared_flag_id = flag.id
      )
  ),
  guardrail_kinds(kind, ordering) as (
    values
      ('duplicate_check_ins'::text, 1),
      ('replayed_requests', 2),
      ('rejected_suggestions', 3),
      ('rejected_corrections_or_reports', 4),
      ('revoked_contributions', 5),
      ('excluded_ratings', 6),
      ('active_conduct_flags', 7)
  ),
  guardrail_counts as (
    select
      kind.kind,
      kind.ordering,
      count(distinct raw.member_id)::bigint as affected_members,
      count(raw.event_id)::bigint as event_count
    from guardrail_kinds as kind
    left join raw_guardrails as raw on raw.kind = kind.kind
    group by kind.kind, kind.ordering
  ),
  guardrail_json as (
    select jsonb_agg(
      jsonb_build_object(
        'kind', guardrail.kind,
        'suppressed', guardrail.affected_members < 5,
        'eventCount', case
          when guardrail.affected_members < 5 then null
          else guardrail.event_count
        end
      ) order by guardrail.ordering
    ) as value
    from guardrail_counts as guardrail
  )
  select jsonb_build_object(
    'schemaVersion', 'member-retention-report/v1',
    'generatedAt', statement_timestamp(),
    'reportingWeekStartsOn', bounds.reporting_week_start,
    'timeZone', 'Atlantic/Reykjavik',
    'suppressionThreshold', 5,
    'cohorts', cohorts.value,
    'rollingFourWeek', jsonb_build_object(
      'windowStartsOn', bounds.rolling_start,
      'windowEndsOn', bounds.reporting_week_start - 1,
      'suppressed', rolling.active_count < 5,
      'engagedMemberCount', case
        when rolling.active_count < 5 then null
        else rolling.engaged_count
      end
    ),
    'guardrails', jsonb_build_object(
      'windowStartsOn', bounds.rolling_start,
      'windowEndsOn', bounds.reporting_week_start - 1,
      'signals', guardrails.value
    )
  )
  from reporting_bounds as bounds
  cross join cohort_json as cohorts
  cross join rolling_values as rolling
  cross join guardrail_json as guardrails;
$$;

revoke all on private.activity_integrity_observations
  from public, anon, authenticated, service_role;
revoke all on private.member_qualifying_activity
  from public, anon, authenticated, service_role;

revoke execute on function private.reject_activity_integrity_observation_mutation()
  from public, anon, authenticated, service_role;
revoke execute on function private.record_activity_integrity_observation(
  uuid, text, uuid, text, uuid
) from public, anon, authenticated, service_role;
revoke execute on function private.detach_member_activity_integrity_observations(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.lock_member_qualifying_activity(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.get_member_qualifying_action_recognition(
  uuid, text, uuid, boolean
) from public, anon, authenticated, service_role;
revoke execute on function private.submit_place_flag_with_activity(
  private.place_flag_kind, jsonb, uuid
) from public, anon, authenticated, service_role;
revoke execute on function private.list_meaningful_retention_cohorts(
  timestamptz, integer
) from public, anon, authenticated, service_role;
revoke execute on function private.get_rolling_four_week_engagement(
  timestamptz, integer
) from public, anon, authenticated, service_role;

revoke execute on function private.set_current_favourite_pre_activity(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke execute on function private.record_check_in_pre_activity(uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.submit_place_suggestion_pre_activity(jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.save_inline_dog_friendliness_rating_pre_activity(
  uuid, integer, integer, integer, integer, integer, uuid, boolean, text, text
) from public, anon, authenticated, service_role;
revoke execute on function private.submit_dog_friendliness_rating_pre_activity(
  uuid, integer, integer, integer, integer, uuid, boolean, text, text
) from public, anon, authenticated, service_role;
revoke execute on function private.create_report_from_rating_note_pre_activity(uuid, uuid)
  from public, anon, authenticated, service_role;

revoke execute on function public.set_current_favourite(uuid, boolean)
  from public, anon, service_role;
revoke execute on function public.record_check_in(uuid, text, uuid)
  from public, anon, service_role;
revoke execute on function public.submit_place_suggestion(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.submit_place_correction(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.submit_place_report(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.save_inline_dog_friendliness_rating(
  uuid, integer, integer, integer, integer, integer, uuid, boolean, text, text
) from public, anon, service_role;
revoke execute on function public.submit_dog_friendliness_rating(
  uuid, integer, integer, integer, integer, uuid, boolean, text, text
) from public, anon, service_role;
revoke execute on function public.apply_pending_member_rating(uuid)
  from public, anon, service_role;
revoke execute on function public.create_report_from_rating_note(uuid, uuid)
  from public, anon, service_role;
revoke execute on function public.get_current_member_weekly_rhythm()
  from public, anon, service_role;
revoke execute on function public.list_current_member_weekly_rhythm()
  from public, anon, service_role;

grant execute on function public.set_current_favourite(uuid, boolean)
  to authenticated;
grant execute on function public.record_check_in(uuid, text, uuid)
  to authenticated;
grant execute on function public.submit_place_suggestion(jsonb, uuid)
  to authenticated;
grant execute on function public.submit_place_correction(jsonb, uuid)
  to authenticated;
grant execute on function public.submit_place_report(jsonb, uuid)
  to authenticated;
grant execute on function public.save_inline_dog_friendliness_rating(
  uuid, integer, integer, integer, integer, integer, uuid, boolean, text, text
) to authenticated;
grant execute on function public.submit_dog_friendliness_rating(
  uuid, integer, integer, integer, integer, uuid, boolean, text, text
) to authenticated;
grant execute on function public.apply_pending_member_rating(uuid)
  to authenticated;
grant execute on function public.create_report_from_rating_note(uuid, uuid)
  to authenticated;
grant execute on function public.get_current_member_weekly_rhythm()
  to authenticated;
grant execute on function public.list_current_member_weekly_rhythm()
  to authenticated;

revoke execute on function public.get_member_retention_report()
  from public, anon, authenticated;
grant execute on function public.get_member_retention_report()
  to service_role;

comment on table private.member_place_first_saves is
  'Immutable caller-owned first successful Place saves, included in normalized qualifying activity.';
comment on table private.activity_integrity_observations is
  'Privacy-minimal replay and duplicate signals that never qualify weekly activity.';
comment on view private.member_qualifying_activity is
  'Derived normalized qualifying actions over durable domain facts without a points ledger.';
comment on function private.lock_member_qualifying_activity(uuid) is
  'Serializes every qualifying source for one Member before source-specific locks are taken.';
comment on function public.get_current_member_weekly_rhythm() is
  'Returns the caller-owned current Reykjavík week derived from all qualifying source facts.';
comment on function public.list_current_member_weekly_rhythm() is
  'Returns exactly eight caller-owned Reykjavík weeks derived from all qualifying source facts.';
comment on function public.get_member_retention_report() is
  'Returns one service-role-only aggregate report with fixed five-Member privacy suppression.';

commit;
