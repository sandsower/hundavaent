begin;

create table private.trusted_verification_submissions (
  id uuid primary key default extensions.gen_random_uuid(),
  task_id text not null check (btrim(task_id) <> ''),
  task_kind text not null check (task_kind in ('access_freshness', 'dog_amenities')),
  flag_id uuid not null unique references private.place_flags(id) on delete restrict,
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  request_id uuid not null,
  submitted_at timestamptz not null default statement_timestamp(),
  accepted_at timestamptz,
  superseded_at timestamptz,
  superseded_by_submission_id uuid
    references private.trusted_verification_submissions(id) on delete restrict,
  unique (member_id, request_id),
  unique (member_id, task_id),
  constraint trusted_verification_acceptance_shape check (
    accepted_at is null or superseded_at is null
  ),
  constraint trusted_verification_supersession_shape check (
    (superseded_at is null and superseded_by_submission_id is null)
    or (
      superseded_at is not null
      and superseded_by_submission_id is not null
      and superseded_by_submission_id <> id
    )
  )
);

create unique index trusted_verification_one_accepted_task_idx
  on private.trusted_verification_submissions (task_id)
  where accepted_at is not null;

create index trusted_verification_member_time_idx
  on private.trusted_verification_submissions (member_id, submitted_at desc, id);

create index trusted_verification_task_idx
  on private.trusted_verification_submissions (task_id, submitted_at, id);

create table private.trusted_verification_feedback_receipts (
  member_id uuid primary key references private.member_accounts(user_id) on delete restrict,
  read_through_confirmed_at timestamptz not null,
  updated_at timestamptz not null default statement_timestamp()
);

alter table private.trusted_verification_submissions enable row level security;
alter table private.trusted_verification_feedback_receipts enable row level security;

create function private.require_live_trusted_contributor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  live_status text;
begin
  select contributor.status
  into live_status
  from private.compute_contributor_status(actor_id) as contributor;

  if live_status is distinct from 'trusted_contributor' then
    raise exception using
      errcode = '42501',
      message = 'Current Trusted Contributor status required';
  end if;

  return actor_id;
end;
$$;

create function private.trusted_verification_task_candidates(as_of timestamptz)
returns table (
  task_id text,
  task_kind text,
  place_id uuid,
  place_version bigint,
  access_condition_id uuid,
  verification_id uuid,
  municipality text,
  category text,
  place_name_is text,
  place_name_en text,
  current_value jsonb,
  freshness_until timestamptz,
  urgency_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with translation_pairs as (
    select
      translation.place_id,
      max(translation.name) filter (
        where translation.locale = 'is'::private.locale_code
      ) as name_is,
      max(translation.name) filter (
        where translation.locale = 'en'::private.locale_code
      ) as name_en
    from private.place_translations as translation
    group by translation.place_id
  ),
  access_tasks as (
    select
      'access_freshness:' || condition.id::text || ':' || verification.id::text as task_id,
      'access_freshness'::text as task_kind,
      place_record.id as place_id,
      place_record.version as place_version,
      condition.id as access_condition_id,
      verification.id as verification_id,
      location_record.municipality,
      place_record.category::text as category,
      translations.name_is as place_name_is,
      translations.name_en as place_name_en,
      jsonb_strip_nulls(jsonb_build_object(
        'access_area', condition.access_area,
        'access_area_note', condition.access_area_note,
        'restraint_condition', condition.restraint_condition,
        'restraint_note', condition.restraint_note,
        'dog_eligibility', condition.dog_eligibility,
        'availability_state', condition.availability_state,
        'availability_window', condition.availability_window,
        'permission_requirement', condition.permission_requirement,
        'verified_at', verification.verified_at,
        'freshness_until', verification.freshness_until
      )) as current_value,
      verification.freshness_until,
      verification.freshness_until as urgency_at
    from private.places as place_record
    join private.locations as location_record on location_record.id = place_record.location_id
    join translation_pairs as translations on translations.place_id = place_record.id
    join private.access_conditions as condition
      on condition.place_id = place_record.id
     and condition.superseded_at is null
    join private.verifications as verification
      on verification.access_condition_id = condition.id
     and verification.status = 'verified'::private.verification_status
     and verification.superseded_at is null
    where place_record.lifecycle = 'published'::private.place_lifecycle
      and verification.freshness_until <= as_of + interval '30 days'
      and exists (
        select 1
        from private.verification_evidence as evidence_link
        where evidence_link.verification_id = verification.id
      )
  ),
  amenity_tasks as (
    select
      'dog_amenities:' || place_record.id::text || ':' || place_record.version::text,
      'dog_amenities'::text,
      place_record.id,
      place_record.version,
      null::uuid,
      null::uuid,
      location_record.municipality,
      place_record.category::text,
      translations.name_is,
      translations.name_en,
      jsonb_build_object('dog_amenities', place_record.dog_amenities),
      null::timestamptz,
      place_record.updated_at
    from private.places as place_record
    join private.locations as location_record on location_record.id = place_record.location_id
    join translation_pairs as translations on translations.place_id = place_record.id
    where place_record.lifecycle = 'published'::private.place_lifecycle
      and place_record.dog_amenities = '[]'::jsonb
      and private.is_place_discoverable(place_record.id)
  )
  select * from access_tasks
  union all
  select * from amenity_tasks;
$$;

create function public.list_trusted_verification_tasks(
  requested_locale text,
  requested_limit integer default 24
)
returns table (
  task_id text,
  task_kind text,
  place_id uuid,
  place_name text,
  municipality text,
  category text,
  current_value jsonb,
  freshness_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_live_trusted_contributor();
  locale_value private.locale_code;
  page_size integer := least(greatest(coalesce(requested_limit, 24), 1), 48);
begin
  if requested_locale is null or requested_locale not in ('is', 'en') then
    raise exception using errcode = '22023', message = 'Supported task locale required';
  end if;
  locale_value := requested_locale::private.locale_code;

  return query
  with available as (
    select candidate.*
    from private.trusted_verification_task_candidates(statement_timestamp()) as candidate
    where not exists (
      select 1
      from private.trusted_verification_submissions as submission
      where submission.member_id = actor_id
        and submission.task_id = candidate.task_id
    )
  ),
  diverse as (
    select
      available.*,
      row_number() over (
        partition by available.municipality, available.task_kind
        order by available.urgency_at, available.task_id
      ) as coverage_round
    from available
  )
  select
    diverse.task_id,
    diverse.task_kind,
    diverse.place_id,
    case locale_value
      when 'is'::private.locale_code then diverse.place_name_is
      else diverse.place_name_en
    end,
    diverse.municipality,
    diverse.category,
    diverse.current_value,
    diverse.freshness_until
  from diverse
  order by
    diverse.coverage_round,
    diverse.municipality,
    diverse.task_kind,
    diverse.urgency_at,
    diverse.task_id
  limit page_size;
end;
$$;

create function public.get_trusted_verification_task(
  requested_task_id text,
  requested_locale text
)
returns table (
  task_id text,
  task_kind text,
  place_id uuid,
  place_name text,
  municipality text,
  category text,
  current_value jsonb,
  freshness_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_live_trusted_contributor();
  locale_value private.locale_code;
begin
  if nullif(btrim(requested_task_id), '') is null
    or requested_locale is null
    or requested_locale not in ('is', 'en')
  then
    raise exception using errcode = '22023', message = 'Trusted task lookup is invalid';
  end if;
  locale_value := requested_locale::private.locale_code;

  return query
  select
    candidate.task_id,
    candidate.task_kind,
    candidate.place_id,
    case locale_value
      when 'is'::private.locale_code then candidate.place_name_is
      else candidate.place_name_en
    end,
    candidate.municipality,
    candidate.category,
    candidate.current_value,
    candidate.freshness_until
  from private.trusted_verification_task_candidates(statement_timestamp()) as candidate
  where candidate.task_id = requested_task_id
    and not exists (
      select 1
      from private.trusted_verification_submissions as submission
      where submission.member_id = actor_id
        and submission.task_id = candidate.task_id
    );
end;
$$;

create function private.trusted_verification_week_active(
  target_member_id uuid,
  starts_at timestamptz,
  ends_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from private.member_place_first_saves as first_save
      where first_save.member_id = target_member_id
        and first_save.first_saved_at >= starts_at
        and first_save.first_saved_at < ends_at
    )
    or exists (
      select 1
      from private.trusted_verification_submissions as submission
      where submission.member_id = target_member_id
        and submission.submitted_at >= starts_at
        and submission.submitted_at < ends_at
    );
$$;

alter function public.set_current_favourite(uuid, boolean)
  rename to set_current_favourite_pre_trusted_verification;
alter function public.set_current_favourite_pre_trusted_verification(uuid, boolean)
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
  actor_id uuid := auth.uid();
  was_week_active boolean;
  result_record record;
  week_start_at timestamptz;
  week_end_at timestamptz;
begin
  perform private.lock_member_qualifying_activity(actor_id);

  select bounds.starts_at, bounds.ends_at
  into week_start_at, week_end_at
  from private.reykjavik_week_bounds(statement_timestamp()) as bounds;

  was_week_active := private.trusted_verification_week_active(
    actor_id,
    week_start_at,
    week_end_at
  );

  select result.*
  into result_record
  from private.set_current_favourite_pre_trusted_verification(
    requested_place_id,
    desired_state
  ) as result;

  return query
  select
    result_record.place_id::uuid,
    result_record.is_favourite::boolean,
    result_record.changed_at::timestamptz,
    result_record.first_time_for_place::boolean,
    (
      result_record.first_time_for_place::boolean
      and not was_week_active
      and result_record.current_week_active::boolean
    ),
    result_record.current_week_starts_on::date,
    result_record.current_week_ends_on::date,
    private.trusted_verification_week_active(
      actor_id,
      week_start_at,
      week_end_at
    );
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
    private.trusted_verification_week_active(
      auth.uid(),
      bounds.starts_at,
      bounds.ends_at
    )
  from current_bounds as bounds
  where auth.uid() is not null
    and exists (
      select 1
      from private.member_accounts as member_account
      where member_account.user_id = auth.uid()
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
    private.trusted_verification_week_active(
      auth.uid(),
      weeks.week_start::timestamp at time zone 'Atlantic/Reykjavik',
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

create function public.submit_trusted_verification_task(
  requested_task_id text,
  requested_response jsonb,
  requested_evidence jsonb,
  requested_explanation text,
  command_request_id uuid
)
returns table (
  submission_id uuid,
  flag_id uuid,
  outcome text,
  activated_current_week boolean,
  submitted_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_live_trusted_contributor();
  existing_submission private.trusted_verification_submissions%rowtype;
  candidate_record record;
  response_payload jsonb;
  flag_result record;
  created_submission private.trusted_verification_submissions%rowtype;
  week_start_at timestamptz;
  week_end_at timestamptz;
  was_week_active boolean;
  already_accepted boolean;
  flag_existed_before boolean;
  persisted_flag_request_id uuid;
begin
  if nullif(btrim(requested_task_id), '') is null
    or requested_response is null
    or jsonb_typeof(requested_response) <> 'object'
    or requested_evidence is null
    or jsonb_typeof(requested_evidence) <> 'object'
    or nullif(btrim(requested_explanation), '') is null
    or command_request_id is null
  then
    raise exception using errcode = '22023', message = 'Trusted Verification submission is incomplete';
  end if;

  perform private.validate_place_flag_evidence(requested_evidence);
  perform private.lock_member_qualifying_activity(actor_id);

  select submission.*
  into existing_submission
  from private.trusted_verification_submissions as submission
  where submission.member_id = actor_id
    and submission.request_id = command_request_id;

  if found then
    return query
    select
      existing_submission.id,
      existing_submission.flag_id,
      case
        when existing_submission.accepted_at is not null then 'accepted'
        when existing_submission.superseded_at is not null then 'superseded'
        else 'submitted'
      end,
      false,
      existing_submission.submitted_at;
    return;
  end if;

  select submission.*
  into existing_submission
  from private.trusted_verification_submissions as submission
  where submission.member_id = actor_id
    and submission.task_id = requested_task_id;

  if found then
    return query
    select
      existing_submission.id,
      existing_submission.flag_id,
      'already_handled'::text,
      false,
      existing_submission.submitted_at;
    return;
  end if;

  select candidate.*
  into candidate_record
  from private.trusted_verification_task_candidates(statement_timestamp()) as candidate
  where candidate.task_id = requested_task_id;

  if not found then
    select exists (
      select 1
      from private.trusted_verification_submissions as submission
      where submission.task_id = requested_task_id
        and submission.accepted_at is not null
    )
    into already_accepted;

    return query
    select
      null::uuid,
      null::uuid,
      case when already_accepted then 'already_handled' else 'unavailable' end,
      false,
      statement_timestamp();
    return;
  end if;

  if candidate_record.task_kind = 'access_freshness' then
    if requested_response <> '{"confirmed":true}'::jsonb then
      raise exception using
        errcode = '22023',
        message = 'Access confirmation response is invalid';
    end if;

    response_payload := jsonb_strip_nulls(jsonb_build_object(
      'access_area', candidate_record.current_value -> 'access_area',
      'access_area_note', candidate_record.current_value -> 'access_area_note',
      'restraint_condition', candidate_record.current_value -> 'restraint_condition',
      'restraint_note', candidate_record.current_value -> 'restraint_note',
      'dog_eligibility', candidate_record.current_value -> 'dog_eligibility',
      'availability_window', candidate_record.current_value -> 'availability_window',
      'permission_requirement', candidate_record.current_value -> 'permission_requirement'
    ));
  elsif candidate_record.task_kind = 'dog_amenities' then
    if jsonb_typeof(requested_response -> 'dog_amenities') is distinct from 'array'
      or not private.jsonb_is_string_array(requested_response -> 'dog_amenities')
      or jsonb_array_length(requested_response -> 'dog_amenities') = 0
    then
      raise exception using
        errcode = '22023',
        message = 'Dog amenities response is invalid';
    end if;
    response_payload := jsonb_build_object(
      'value',
      requested_response -> 'dog_amenities'
    );
  else
    raise exception using errcode = '22023', message = 'Trusted task kind is invalid';
  end if;

  select bounds.starts_at, bounds.ends_at
  into week_start_at, week_end_at
  from private.reykjavik_week_bounds(statement_timestamp()) as bounds;

  was_week_active := private.trusted_verification_week_active(
    actor_id,
    week_start_at,
    week_end_at
  );

  select exists (
    select 1
    from private.place_flags as flag
    where flag.member_id = actor_id
      and flag.request_id = command_request_id
  )
  into flag_existed_before;

  select created.*
  into flag_result
  from private.create_place_flag(
    'correction'::private.place_flag_kind,
    jsonb_build_object(
      'place_id', candidate_record.place_id,
      'target_kind', case
        when candidate_record.task_kind = 'access_freshness' then 'access_condition'
        else 'place_field'
      end,
      'target_field', case
        when candidate_record.task_kind = 'dog_amenities' then 'dog_amenities'
        else null
      end,
      'access_condition_id', candidate_record.access_condition_id,
      'proposed_value', response_payload,
      'explanation', btrim(requested_explanation),
      'evidence', requested_evidence
    ),
    actor_id,
    command_request_id
  ) as created;

  select flag.request_id
  into persisted_flag_request_id
  from private.place_flags as flag
  where flag.id = flag_result.flag_id
    and flag.member_id = actor_id;

  if flag_existed_before
    or persisted_flag_request_id is distinct from command_request_id
  then
    raise exception using
      errcode = '55006',
      message = 'Trusted Verification request conflicts with an existing Correction or Report';
  end if;

  insert into private.trusted_verification_submissions (
    task_id,
    task_kind,
    flag_id,
    member_id,
    request_id,
    submitted_at
  ) values (
    requested_task_id,
    candidate_record.task_kind,
    flag_result.flag_id,
    actor_id,
    command_request_id,
    flag_result.submitted_at
  )
  returning * into created_submission;

  return query
  select
    created_submission.id,
    created_submission.flag_id,
    'submitted'::text,
    not was_week_active,
    created_submission.submitted_at;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Trusted Verification submission is invalid';
end;
$$;

create function private.accept_trusted_verification_contribution()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  accepted_submission private.trusted_verification_submissions%rowtype;
  superseded_flag_ids uuid[];
begin
  if new.place_flag_id is null then
    return new;
  end if;

  select submission.*
  into accepted_submission
  from private.trusted_verification_submissions as submission
  where submission.flag_id = new.place_flag_id;

  if not found then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'trusted-verification-task:' || accepted_submission.task_id,
      0
    )
  );

  select submission.*
  into accepted_submission
  from private.trusted_verification_submissions as submission
  where submission.flag_id = new.place_flag_id
  for update;

  if accepted_submission.superseded_at is not null then
    raise exception using
      errcode = '55006',
      message = 'Trusted Verification was superseded';
  end if;

  update private.trusted_verification_submissions as submission
  set accepted_at = new.confirmed_at
  where submission.id = accepted_submission.id
    and submission.accepted_at is null
    and submission.superseded_at is null
  returning submission.* into accepted_submission;

  if not found then
    return new;
  end if;

  with resolved_flags as (
    update private.place_flags as flag
    set
      status = 'rejected'::private.place_flag_status,
      resolution_request_id = new.confirmation_request_id,
      resolved_at = new.confirmed_at,
      updated_at = new.confirmed_at
    from private.trusted_verification_submissions as sibling
    where sibling.task_id = accepted_submission.task_id
      and sibling.id <> accepted_submission.id
      and sibling.accepted_at is null
      and sibling.superseded_at is null
      and flag.id = sibling.flag_id
      and flag.status in (
        'submitted'::private.place_flag_status,
        'needs_information'::private.place_flag_status
      )
    returning flag.id
  )
  select array_agg(resolved_flags.id)
  into superseded_flag_ids
  from resolved_flags;

  if coalesce(array_length(superseded_flag_ids, 1), 0) > 0 then
    insert into private.place_flag_status_events (
      flag_id,
      status,
      member_reason_is,
      member_reason_en,
      private_note,
      moderator_id,
      occurred_at
    )
    select
      sibling_flag_id,
      'rejected'::private.place_flag_status,
      'Önnur staðfesting á sömu staðreynd var samþykkt fyrst.',
      'Another verification of the same fact was accepted first.',
      'Superseded by an accepted Trusted Verification submission.',
      new.confirmed_by,
      new.confirmed_at
    from unnest(superseded_flag_ids) as sibling_flag_id;

    update private.trusted_verification_submissions as sibling
    set
      superseded_at = new.confirmed_at,
      superseded_by_submission_id = accepted_submission.id
    where sibling.flag_id = any(superseded_flag_ids);
  end if;

  return new;
end;
$$;

create trigger contributions_accept_trusted_verification
before insert on private.contributions
for each row execute function private.accept_trusted_verification_contribution();

create function private.guard_superseded_trusted_verification_flag()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
    and exists (
      select 1
      from private.trusted_verification_submissions as submission
      where submission.flag_id = old.id
        and submission.superseded_at is not null
    )
  then
    raise exception using
      errcode = '55006',
      message = 'Trusted Verification was superseded';
  end if;

  return new;
end;
$$;

create trigger place_flags_guard_superseded_trusted_verification
before update of status on private.place_flags
for each row execute function private.guard_superseded_trusted_verification_flag();

create function public.list_my_trusted_verification_submissions(
  requested_locale text,
  requested_limit integer default 30
)
returns table (
  submission_id uuid,
  task_id text,
  task_kind text,
  flag_id uuid,
  place_id uuid,
  place_name text,
  outcome text,
  member_reason text,
  submitted_at timestamptz,
  confirmed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  locale_value private.locale_code;
  page_size integer := least(greatest(coalesce(requested_limit, 30), 1), 60);
begin
  if requested_locale is null or requested_locale not in ('is', 'en') then
    raise exception using errcode = '22023', message = 'Supported history locale required';
  end if;
  locale_value := requested_locale::private.locale_code;

  return query
  select
    submission.id,
    submission.task_id,
    submission.task_kind,
    submission.flag_id,
    flag.place_id,
    translation.name,
    case
      when contribution.revoked_at is not null then 'revoked'
      when submission.accepted_at is not null then 'accepted'
      when submission.superseded_at is not null then 'superseded'
      when flag.status = 'rejected'::private.place_flag_status then 'rejected'
      when flag.status in (
        'applied'::private.place_flag_status,
        'confirmed_useful'::private.place_flag_status,
        'dispute_opened'::private.place_flag_status,
        'place_inactivated'::private.place_flag_status
      ) then 'already_handled'
      when not exists (
        select 1
        from private.trusted_verification_task_candidates(statement_timestamp()) as candidate
        where candidate.task_id = submission.task_id
      ) then 'unavailable'
      else 'submitted'
    end,
    case locale_value
      when 'is'::private.locale_code then outcome_event.member_reason_is
      else outcome_event.member_reason_en
    end,
    submission.submitted_at,
    contribution.confirmed_at
  from private.trusted_verification_submissions as submission
  join private.place_flags as flag on flag.id = submission.flag_id
  join private.place_translations as translation
    on translation.place_id = flag.place_id
   and translation.locale = locale_value
  left join private.contributions as contribution
    on contribution.place_flag_id = flag.id
  left join lateral (
    select event.member_reason_is, event.member_reason_en
    from private.place_flag_status_events as event
    where event.flag_id = flag.id
      and event.member_reason_is is not null
      and event.member_reason_en is not null
    order by event.occurred_at desc, event.id desc
    limit 1
  ) as outcome_event on true
  where submission.member_id = actor_id
  order by submission.submitted_at desc, submission.id
  limit page_size;
end;
$$;

create function public.get_my_trusted_verification_feedback()
returns table (
  has_unread boolean,
  unread_count integer,
  latest_confirmed_at timestamptz,
  latest_task_kind text,
  latest_place_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  read_through timestamptz;
begin
  select receipt.read_through_confirmed_at
  into read_through
  from private.trusted_verification_feedback_receipts as receipt
  where receipt.member_id = actor_id;

  return query
  with unread as (
    select
      contribution.confirmed_at,
      submission.task_kind,
      contribution.subject_place_id
    from private.trusted_verification_submissions as submission
    join private.contributions as contribution
      on contribution.place_flag_id = submission.flag_id
    where submission.member_id = actor_id
      and submission.accepted_at is not null
      and contribution.revoked_at is null
      and contribution.confirmed_at > coalesce(read_through, '-infinity'::timestamptz)
  ),
  latest as (
    select unread.*
    from unread
    order by unread.confirmed_at desc, unread.subject_place_id
    limit 1
  )
  select
    exists (select 1 from unread),
    (select count(*)::integer from unread),
    latest.confirmed_at,
    latest.task_kind,
    latest.subject_place_id
  from (select 1) as singleton
  left join latest on true;
end;
$$;

create function public.mark_my_trusted_verification_feedback_read(
  requested_read_through timestamptz
)
returns table (read_through_confirmed_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  latest_confirmed timestamptz;
  stored_read_through timestamptz;
begin
  if requested_read_through is null then
    raise exception using errcode = '22023', message = 'Feedback boundary required';
  end if;

  select max(contribution.confirmed_at)
  into latest_confirmed
  from private.trusted_verification_submissions as submission
  join private.contributions as contribution
    on contribution.place_flag_id = submission.flag_id
  where submission.member_id = actor_id
    and submission.accepted_at is not null
    and contribution.revoked_at is null
    and contribution.confirmed_at = requested_read_through;

  if latest_confirmed is null then
    raise exception using errcode = '22023', message = 'Feedback boundary was not found';
  end if;

  insert into private.trusted_verification_feedback_receipts (
    member_id,
    read_through_confirmed_at,
    updated_at
  ) values (
    actor_id,
    latest_confirmed,
    statement_timestamp()
  )
  on conflict (member_id) do update set
    read_through_confirmed_at = greatest(
      private.trusted_verification_feedback_receipts.read_through_confirmed_at,
      excluded.read_through_confirmed_at
    ),
    updated_at = statement_timestamp()
  returning trusted_verification_feedback_receipts.read_through_confirmed_at
  into stored_read_through;

  return query select stored_read_through;
end;
$$;

create function public.get_moderation_trusted_verification_context(
  requested_flag_id uuid
)
returns table (
  submission_id uuid,
  task_id text,
  task_kind text,
  outcome text,
  superseded_by_submission_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_moderator();

  return query
  select
    submission.id,
    submission.task_id,
    submission.task_kind,
    case
      when submission.accepted_at is not null then 'accepted'
      when submission.superseded_at is not null then 'superseded'
      else 'submitted'
    end,
    submission.superseded_by_submission_id
  from private.trusted_verification_submissions as submission
  where submission.flag_id = requested_flag_id;
end;
$$;

revoke all on private.trusted_verification_submissions
  from public, anon, authenticated, service_role;
revoke all on private.trusted_verification_feedback_receipts
  from public, anon, authenticated, service_role;

revoke execute on function private.require_live_trusted_contributor()
  from public, anon, authenticated, service_role;
revoke execute on function private.trusted_verification_task_candidates(timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.trusted_verification_week_active(uuid, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function private.set_current_favourite_pre_trusted_verification(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke execute on function private.accept_trusted_verification_contribution()
  from public, anon, authenticated, service_role;
revoke execute on function private.guard_superseded_trusted_verification_flag()
  from public, anon, authenticated, service_role;

revoke execute on function public.set_current_favourite(uuid, boolean)
  from public, anon, service_role;
revoke execute on function public.list_trusted_verification_tasks(text, integer)
  from public, anon, service_role;
revoke execute on function public.get_trusted_verification_task(text, text)
  from public, anon, service_role;
revoke execute on function public.submit_trusted_verification_task(
  text,
  jsonb,
  jsonb,
  text,
  uuid
) from public, anon, service_role;
revoke execute on function public.list_my_trusted_verification_submissions(text, integer)
  from public, anon, service_role;
revoke execute on function public.get_my_trusted_verification_feedback()
  from public, anon, service_role;
revoke execute on function public.mark_my_trusted_verification_feedback_read(timestamptz)
  from public, anon, service_role;
revoke execute on function public.get_moderation_trusted_verification_context(uuid)
  from public, anon, service_role;

grant execute on function public.list_trusted_verification_tasks(text, integer)
  to authenticated;
grant execute on function public.set_current_favourite(uuid, boolean)
  to authenticated;
grant execute on function public.get_trusted_verification_task(text, text)
  to authenticated;
grant execute on function public.submit_trusted_verification_task(
  text,
  jsonb,
  jsonb,
  text,
  uuid
) to authenticated;
grant execute on function public.list_my_trusted_verification_submissions(text, integer)
  to authenticated;
grant execute on function public.get_my_trusted_verification_feedback()
  to authenticated;
grant execute on function public.mark_my_trusted_verification_feedback_read(timestamptz)
  to authenticated;
grant execute on function public.get_moderation_trusted_verification_context(uuid)
  to authenticated;

comment on table private.trusted_verification_submissions is
  'Private task-to-Correction linkage for earned-responsibility verification. Task identity is versioned, retries are caller-idempotent, and only one accepted Contribution may exist per exact task generation.';
comment on function public.list_trusted_verification_tasks(text, integer) is
  'Live-Trusted-only, diverse, noncompetitive projection of stale access and missing dog-amenity facts from published Places. It returns no member, moderation, abuse, Candidate, or support data.';
comment on function public.submit_trusted_verification_task(text, jsonb, jsonb, text, uuid) is
  'Live-Trusted-only evidence command that creates an ordinary moderator-reviewed Correction without directly mutating a Place. Versioned task identity preserves conflict behavior and caller request identity makes retries idempotent.';
comment on function public.list_my_trusted_verification_submissions(text, integer) is
  'Caller-only history with submitted, unavailable, already-handled, accepted, rejected, and superseded outcomes. It preserves prior work after live trust is lost.';
comment on function public.get_my_trusted_verification_feedback() is
  'Caller-only unread summary for newly confirmed Trusted Verification Contributions.';

commit;
