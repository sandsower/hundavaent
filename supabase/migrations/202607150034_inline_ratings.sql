begin;

-- VIB-35 intentionally changes the Rating contract before launch. Refuse to reinterpret
-- production data if the stated no-user premise is no longer true.
do $$
begin
  if exists (select 1 from private.dog_friendliness_ratings)
    or exists (select 1 from private.dog_friendliness_rating_events) then
    raise exception using
      errcode = '55000',
      message = 'Inline Rating migration requires an empty Rating store and event ledger';
  end if;
end
$$;

alter table private.dog_friendliness_ratings
  add column overall_score integer;

alter table private.dog_friendliness_ratings
  add constraint dog_friendliness_rating_overall_score_check check (overall_score between 1 and 5),
  alter column overall_score set not null;

-- Overall is the only required v1 score. Category scores are optional enrichment and may all be
-- null, so the pre-launch requirement for at least one category no longer applies.
alter table private.dog_friendliness_ratings
  drop constraint dog_friendliness_rating_has_dimension_check;

alter table private.dog_friendliness_rating_events
  add column overall_score integer;

alter table private.dog_friendliness_rating_events
  add constraint dog_friendliness_rating_event_overall_score_check check (
    overall_score is null or overall_score between 1 and 5
  );

-- A note no longer needs a forced classification. Classification remains optional private
-- moderator metadata for legacy/report workflows and is never needed by the inline Member UI.
alter table private.dog_friendliness_ratings
  drop constraint dog_friendliness_rating_private_note_shape_check;

alter table private.dog_friendliness_ratings
  add constraint dog_friendliness_rating_private_note_shape_check check (
    (private_note is null and private_note_classification is null and private_note_updated_at is null)
    or (private_note is not null and private_note_updated_at is not null)
  );

-- Existing exclusion/reinstatement/report-link RPCs append through this seam. Snapshot the
-- current overall score when they do not supply it explicitly.
create function private.complete_rating_event_overall_score()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  if new.overall_score is null then
    select rating.overall_score
    into new.overall_score
    from private.dog_friendliness_ratings as rating
    where rating.member_id = new.member_id and rating.place_id = new.place_id;
  end if;
  if new.overall_score is null then
    raise exception using errcode = '23502', message = 'Rating event overall score is required';
  end if;
  return new;
end;
$$;

create trigger dog_friendliness_rating_events_complete_overall
before insert on private.dog_friendliness_rating_events
for each row execute function private.complete_rating_event_overall_score();

revoke execute on function private.complete_rating_event_overall_score()
from public, anon, authenticated, service_role;

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
  excluded boolean,
  private_note text,
  private_note_classification text,
  private_note_updated_at timestamptz,
  linked_report_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  submitting_member_id uuid := security.require_member();
  existing private.dog_friendliness_ratings%rowtype;
  existing_found boolean;
  result private.dog_friendliness_ratings%rowtype;
  scores_unchanged boolean;
  resolved_note text;
  resolved_note_classification text;
  resolved_note_updated_at timestamptz;
  event_kind text;
begin
  if requested_place_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Place and request identifiers are required';
  end if;
  if requested_overall_score is null or requested_overall_score not between 1 and 5 then
    raise exception using errcode = '22023', message = 'Overall score must be between 1 and 5';
  end if;
  if (requested_welcome_score is not null and requested_welcome_score not between 1 and 5)
    or (requested_clarity_score is not null and requested_clarity_score not between 1 and 5)
    or (requested_comfort_score is not null and requested_comfort_score not between 1 and 5)
    or (requested_thoughtfulness_score is not null and requested_thoughtfulness_score not between 1 and 5)
  then
    raise exception using errcode = '22023', message = 'Optional scores must be between 1 and 5';
  end if;
  if not private.is_place_discoverable(requested_place_id) then
    raise exception using errcode = '22023', message = 'Ratable Place required';
  end if;

  select rating.* into existing
  from private.dog_friendliness_ratings as rating
  where rating.member_id = submitting_member_id and rating.place_id = requested_place_id
  for update;
  existing_found := found;

  scores_unchanged := existing_found
    and existing.overall_score = requested_overall_score
    and existing.welcome_score is not distinct from requested_welcome_score
    and existing.clarity_score is not distinct from requested_clarity_score
    and existing.comfort_score is not distinct from requested_comfort_score
    and existing.thoughtfulness_score is not distinct from requested_thoughtfulness_score;

  if requested_update_private_note then
    resolved_note := nullif(btrim(coalesce(requested_private_note, '')), '');
    if resolved_note is not null
      and requested_overall_score > 2
      and coalesce(requested_welcome_score <= 2, false) is false
      and coalesce(requested_clarity_score <= 2, false) is false
      and coalesce(requested_comfort_score <= 2, false) is false
      and coalesce(requested_thoughtfulness_score <= 2, false) is false
    then
      raise exception using errcode = '22023', message = 'A private note requires a low score';
    end if;
    resolved_note_updated_at := case when resolved_note is null then null else statement_timestamp() end;
    if requested_private_note_classification is not null
      and requested_private_note_classification not in ('subjective', 'inaccurate_info', 'safety_concern')
    then
      raise exception using errcode = '22023', message = 'Private note classification is invalid';
    end if;
    resolved_note_classification := case
      when resolved_note is null then null else requested_private_note_classification
    end;
  end if;

  if existing_found
    and existing.last_request_id = command_request_id
    and scores_unchanged
    and (not requested_update_private_note or resolved_note is not distinct from existing.private_note)
  then
    return query select existing.id, existing.place_id, existing.overall_score,
      existing.welcome_score, existing.clarity_score, existing.comfort_score,
      existing.thoughtfulness_score, existing.rated_at, existing.excluded_at is not null,
      existing.private_note, existing.private_note_classification,
      existing.private_note_updated_at, existing.linked_report_id;
    return;
  end if;

  if exists (
    select 1 from private.dog_friendliness_rating_events as event
    where event.member_id = submitting_member_id
      and event.place_id = requested_place_id
      and event.request_id = command_request_id
  ) then
    raise exception using errcode = '55006', message = 'Rating request identifier was already used';
  end if;

  event_kind := case
    when not existing_found then 'submitted'
    when scores_unchanged and requested_update_private_note then 'note_updated'
    else 'updated'
  end;

  insert into private.dog_friendliness_ratings (
    member_id, place_id, overall_score, welcome_score, clarity_score, comfort_score,
    thoughtfulness_score, rated_at, last_request_id, private_note,
    private_note_classification, private_note_updated_at
  ) values (
    submitting_member_id, requested_place_id, requested_overall_score,
    requested_welcome_score, requested_clarity_score, requested_comfort_score,
    requested_thoughtfulness_score, statement_timestamp(), command_request_id,
    case when requested_update_private_note then resolved_note else null end,
    case when requested_update_private_note then resolved_note_classification else null end,
    case when requested_update_private_note then resolved_note_updated_at else null end
  )
  on conflict on constraint dog_friendliness_ratings_member_place_key do update set
    overall_score = excluded.overall_score,
    welcome_score = excluded.welcome_score,
    clarity_score = excluded.clarity_score,
    comfort_score = excluded.comfort_score,
    thoughtfulness_score = excluded.thoughtfulness_score,
    rated_at = case when event_kind = 'note_updated' then dog_friendliness_ratings.rated_at else excluded.rated_at end,
    last_request_id = excluded.last_request_id,
    private_note = case when requested_update_private_note then excluded.private_note else dog_friendliness_ratings.private_note end,
    private_note_classification = case when requested_update_private_note then excluded.private_note_classification else dog_friendliness_ratings.private_note_classification end,
    private_note_updated_at = case when requested_update_private_note then excluded.private_note_updated_at else dog_friendliness_ratings.private_note_updated_at end
  returning * into result;

  insert into private.dog_friendliness_rating_events (
    member_id, place_id, event_kind, overall_score, welcome_score, clarity_score,
    comfort_score, thoughtfulness_score, actor_id, request_id, private_note,
    private_note_classification
  ) values (
    submitting_member_id, requested_place_id, event_kind, result.overall_score,
    result.welcome_score, result.clarity_score, result.comfort_score,
    result.thoughtfulness_score, submitting_member_id, command_request_id,
    result.private_note, result.private_note_classification
  );

  return query select result.id, result.place_id, result.overall_score,
    result.welcome_score, result.clarity_score, result.comfort_score,
    result.thoughtfulness_score, result.rated_at, result.excluded_at is not null,
    result.private_note, result.private_note_classification,
    result.private_note_updated_at, result.linked_report_id;
end;
$$;

-- Compatibility wrapper for the pre-launch form and its regression suite. New application code
-- uses save_inline_dog_friendliness_rating and always supplies overall explicitly.
drop function public.submit_dog_friendliness_rating(
  uuid, integer, integer, integer, integer, uuid, boolean, text, text
);

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
  id uuid, place_id uuid, welcome_score integer, clarity_score integer,
  comfort_score integer, thoughtfulness_score integer, rated_at timestamptz,
  excluded boolean, private_note text, private_note_classification text,
  private_note_updated_at timestamptz, linked_report_id uuid
)
language plpgsql volatile security definer set search_path = '' as $$
declare
  resolved_overall integer := coalesce(
    requested_welcome_score,
    requested_clarity_score,
    requested_comfort_score,
    requested_thoughtfulness_score
  );
  note_policy private.private_rating_note_policy%rowtype;
  note_requested boolean := requested_update_private_note
    and nullif(btrim(coalesce(requested_private_note, '')), '') is not null;
begin
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
    raise exception using errcode = '22023', message = 'Thoughtfulness score must be between 1 and 5';
  end if;
  if resolved_overall is null then
    raise exception using errcode = '22023', message = 'At least one Dimension must be scored';
  end if;
  if note_requested then
    select policy.* into note_policy
    from private.private_rating_note_policy as policy
    where policy.singleton and policy.enabled;
    if not found then
      raise exception using errcode = '22023', message = 'Private Rating Notes are not available';
    end if;
    if resolved_overall > note_policy.low_score_threshold
      and coalesce(requested_welcome_score <= note_policy.low_score_threshold, false) is false
      and coalesce(requested_clarity_score <= note_policy.low_score_threshold, false) is false
      and coalesce(requested_comfort_score <= note_policy.low_score_threshold, false) is false
      and coalesce(requested_thoughtfulness_score <= note_policy.low_score_threshold, false) is false
    then
      raise exception using errcode = '22023', message = 'A Private Rating Note requires a qualifying low score';
    end if;
    if requested_private_note_classification is null
      or requested_private_note_classification not in ('subjective', 'inaccurate_info', 'safety_concern')
    then
      raise exception using errcode = '22023', message = 'A Private Rating Note classification is required';
    end if;
  end if;
  return query
  select saved.id, saved.place_id, saved.welcome_score, saved.clarity_score,
    saved.comfort_score, saved.thoughtfulness_score, saved.rated_at, saved.excluded,
    saved.private_note, requested_private_note_classification,
    saved.private_note_updated_at, saved.linked_report_id
  from public.save_inline_dog_friendliness_rating(
    requested_place_id, resolved_overall, requested_welcome_score, requested_clarity_score,
    requested_comfort_score, requested_thoughtfulness_score, command_request_id,
    requested_update_private_note, requested_private_note, requested_private_note_classification
  ) as saved;
end;
$$;

drop function public.get_my_dog_friendliness_rating(uuid);

create function public.get_my_dog_friendliness_rating(requested_place_id uuid)
returns table (
  id uuid, place_id uuid, overall_score integer, welcome_score integer,
  clarity_score integer, comfort_score integer, thoughtfulness_score integer,
  rated_at timestamptz, excluded boolean, private_note text,
  private_note_classification text, private_note_updated_at timestamptz, linked_report_id uuid
)
language plpgsql stable security definer set search_path = '' as $$
declare actor_id uuid := security.require_member();
begin
  return query select rating.id, rating.place_id, rating.overall_score, rating.welcome_score,
    rating.clarity_score, rating.comfort_score, rating.thoughtfulness_score, rating.rated_at,
    rating.excluded_at is not null, rating.private_note, rating.private_note_classification,
    rating.private_note_updated_at, rating.linked_report_id
  from private.dog_friendliness_ratings as rating
  where rating.member_id = actor_id and rating.place_id = requested_place_id;
end;
$$;

drop function public.get_dog_friendliness_summary(uuid);

create function public.get_dog_friendliness_summary(requested_place_id uuid)
returns table (
  place_id uuid, summary_visible boolean, eligible_count integer,
  trailing_twelve_month_count integer, dimensions jsonb, overall_mean numeric,
  overall_visible boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  policy_record private.dog_friendliness_summary_policy%rowtype;
  recent_count integer;
  dims jsonb := '[]'::jsonb;
  overall_value numeric;
begin
  if requested_place_id is null or not private.is_place_discoverable(requested_place_id) then
    return query select requested_place_id, false, null::integer, null::integer,
      null::jsonb, null::numeric, false;
    return;
  end if;
  select policy.* into policy_record
  from private.dog_friendliness_summary_policy as policy
  where policy.singleton and policy.enabled;
  if not found then
    return query select requested_place_id, false, null::integer, null::integer,
      null::jsonb, null::numeric, false;
    return;
  end if;
  select count(*), avg(rating.overall_score)
  into recent_count, overall_value
  from private.dog_friendliness_ratings as rating
  where rating.place_id = requested_place_id
    and rating.excluded_at is null
    and rating.rated_at >= statement_timestamp() - policy_record.recency_window;
  if recent_count < policy_record.minimum_eligible_count then
    return query select requested_place_id, false, null::integer, null::integer,
      null::jsonb, null::numeric, false;
    return;
  end if;
  select coalesce(jsonb_agg(
      jsonb_build_object(
        'dimension', valueset.dimension,
        'applicableCount', valueset.applicable_count,
        'mean', round(valueset.mean_value * 2) / 2
      ) order by valueset.dimension
    ), '[]'::jsonb)
  into dims
    from (
      select 'welcome'::text dimension, count(welcome_score)::integer applicable_count, avg(welcome_score) mean_value
      from private.dog_friendliness_ratings as rating where rating.place_id = requested_place_id and rating.excluded_at is null
        and rating.rated_at >= statement_timestamp() - policy_record.recency_window
      union all
      select 'clarity', count(clarity_score)::integer, avg(clarity_score)
      from private.dog_friendliness_ratings as rating where rating.place_id = requested_place_id and rating.excluded_at is null
        and rating.rated_at >= statement_timestamp() - policy_record.recency_window
      union all
      select 'comfort', count(comfort_score)::integer, avg(comfort_score)
      from private.dog_friendliness_ratings as rating where rating.place_id = requested_place_id and rating.excluded_at is null
        and rating.rated_at >= statement_timestamp() - policy_record.recency_window
      union all
      select 'thoughtfulness', count(thoughtfulness_score)::integer, avg(thoughtfulness_score)
      from private.dog_friendliness_ratings as rating where rating.place_id = requested_place_id and rating.excluded_at is null
        and rating.rated_at >= statement_timestamp() - policy_record.recency_window
    ) as valueset
    where valueset.applicable_count >= policy_record.minimum_eligible_count;
  return query select requested_place_id, true, recent_count, recent_count, dims,
    round(overall_value * 2) / 2, true;
end;
$$;

drop function public.list_moderation_dog_friendliness_ratings(uuid);

create function public.list_moderation_dog_friendliness_ratings(requested_place_id uuid)
returns table (
  id uuid, member_id uuid, overall_score integer, welcome_score integer,
  clarity_score integer, comfort_score integer, thoughtfulness_score integer,
  rated_at timestamptz, excluded_at timestamptz, excluded_kind text,
  excluded_reason text, private_note text, private_note_classification text,
  private_note_updated_at timestamptz, linked_report_id uuid
)
language plpgsql stable security definer set search_path = '' as $$
declare actor_id uuid := security.require_moderator();
begin
  if requested_place_id is null then
    raise exception using errcode = '22023', message = 'A Place is required';
  end if;
  return query select rating.id, rating.member_id, rating.overall_score,
    rating.welcome_score, rating.clarity_score, rating.comfort_score,
    rating.thoughtfulness_score, rating.rated_at, rating.excluded_at,
    rating.excluded_kind, rating.excluded_reason, rating.private_note,
    rating.private_note_classification, rating.private_note_updated_at,
    rating.linked_report_id
  from private.dog_friendliness_ratings as rating
  where rating.place_id = requested_place_id
  order by rating.rated_at desc;
end;
$$;

create function public.apply_pending_member_rating(requested_place_id uuid)
returns table (applied boolean, overall_score integer)
language plpgsql volatile security definer set search_path = '' as $$
declare
  actor_id uuid := security.require_member();
  pending private.pending_member_rating_completions%rowtype;
  current_rating private.dog_friendliness_ratings%rowtype;
  generated_request_id uuid := extensions.gen_random_uuid();
begin
  select completion.* into pending
  from private.pending_member_rating_completions as completion
  where completion.member_id = actor_id
    and completion.place_id = requested_place_id
    and completion.applied_at is null
  order by completion.created_at desc, completion.request_id desc
  limit 1 for update;
  if not found then
    return query select false, null::integer;
    return;
  end if;
  select rating.* into current_rating
  from private.dog_friendliness_ratings as rating
  where rating.member_id = actor_id and rating.place_id = requested_place_id
  for update;
  perform public.save_inline_dog_friendliness_rating(
    requested_place_id, pending.overall_rating,
    current_rating.welcome_score, current_rating.clarity_score,
    current_rating.comfort_score, current_rating.thoughtfulness_score,
    generated_request_id, false, null, null
  );
  update private.pending_member_rating_completions
  set applied_at = statement_timestamp()
  where member_id = actor_id and place_id = requested_place_id and applied_at is null;
  return query select true, pending.overall_rating;
end;
$$;

-- The launch policy is fixed for v1: five current eligible Ratings from the rolling 12 months.
insert into private.dog_friendliness_summary_policy (
  singleton, policy_version, minimum_eligible_count, recency_window, enabled, updated_at
) values (true, 'inline-rating-v1', 5, interval '12 months', true, statement_timestamp())
on conflict (singleton) do update set policy_version = excluded.policy_version,
  minimum_eligible_count = excluded.minimum_eligible_count,
  recency_window = excluded.recency_window, enabled = excluded.enabled,
  updated_at = excluded.updated_at;

revoke execute on function public.save_inline_dog_friendliness_rating(
  uuid, integer, integer, integer, integer, integer, uuid, boolean, text, text
) from public, anon, service_role;
grant execute on function public.save_inline_dog_friendliness_rating(
  uuid, integer, integer, integer, integer, integer, uuid, boolean, text, text
) to authenticated;
revoke execute on function public.submit_dog_friendliness_rating(
  uuid, integer, integer, integer, integer, uuid, boolean, text, text
) from public, anon, service_role;
grant execute on function public.submit_dog_friendliness_rating(
  uuid, integer, integer, integer, integer, uuid, boolean, text, text
) to authenticated;
revoke execute on function public.apply_pending_member_rating(uuid)
from public, anon, service_role;
grant execute on function public.apply_pending_member_rating(uuid) to authenticated;

comment on function public.save_inline_dog_friendliness_rating(
  uuid, integer, integer, integer, integer, integer, uuid, boolean, text, text
) is 'Autosaves one required overall score, nullable explicitly-touched categories, and an optional private low-score note.';
comment on function public.apply_pending_member_rating(uuid) is
  'Atomically applies the newest unconsumed pre-auth overall Rating once without overwriting optional details or notes.';

commit;
