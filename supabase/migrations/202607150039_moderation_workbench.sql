begin;

create type private.moderation_target_kind as enum (
  'candidate_place',
  'place_suggestion',
  'place_flag'
);

create type private.candidate_review_status as enum (
  'pending',
  'needs_information',
  'rejected',
  'published'
);

create type private.candidate_review_event_kind as enum (
  'pending',
  'needs_information',
  'rejected',
  'reopened',
  'published'
);

alter table private.place_suggestions
  add column version bigint not null default 1 check (version > 0);

alter table private.place_flags
  add column version bigint not null default 1 check (version > 0);

create function private.bump_moderation_subject_version()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger place_suggestions_bump_version
before update on private.place_suggestions
for each row execute function private.bump_moderation_subject_version();

create trigger place_flags_bump_version
before update on private.place_flags
for each row execute function private.bump_moderation_subject_version();

revoke execute on function private.bump_moderation_subject_version()
  from public, anon, authenticated, service_role;

create table private.moderation_drafts (
  id uuid primary key default extensions.gen_random_uuid(),
  target_kind private.moderation_target_kind not null,
  candidate_place_id uuid references private.places(id) on delete restrict,
  suggestion_id uuid references private.place_suggestions(id) on delete restrict,
  flag_id uuid references private.place_flags(id) on delete restrict,
  current_version bigint not null default 0 check (current_version >= 0),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint moderation_draft_target_shape check (
    (target_kind = 'candidate_place' and candidate_place_id is not null
      and suggestion_id is null and flag_id is null)
    or (target_kind = 'place_suggestion' and suggestion_id is not null
      and candidate_place_id is null and flag_id is null)
    or (target_kind = 'place_flag' and flag_id is not null
      and candidate_place_id is null and suggestion_id is null)
  )
);

create unique index moderation_drafts_candidate_unique
  on private.moderation_drafts (candidate_place_id)
  where candidate_place_id is not null;

create unique index moderation_drafts_suggestion_unique
  on private.moderation_drafts (suggestion_id)
  where suggestion_id is not null;

create unique index moderation_drafts_flag_unique
  on private.moderation_drafts (flag_id)
  where flag_id is not null;

create table private.moderation_draft_revisions (
  draft_id uuid not null references private.moderation_drafts(id) on delete restrict,
  version bigint not null check (version > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  section_id text not null check (btrim(section_id) <> ''),
  authored_by uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (draft_id, version),
  unique (authored_by, request_id)
);

create table private.candidate_reviews (
  place_id uuid primary key references private.places(id) on delete restrict,
  status private.candidate_review_status not null default 'pending',
  version bigint not null default 1 check (version > 0),
  resolution_request_id uuid,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint candidate_review_resolution_shape check (
    (status in ('pending', 'needs_information') and resolved_at is null)
    or (status in ('rejected', 'published') and resolved_at is not null)
  )
);

create index candidate_reviews_queue_idx
  on private.candidate_reviews (status, updated_at, place_id);

create table private.candidate_review_events (
  id uuid primary key default extensions.gen_random_uuid(),
  place_id uuid not null references private.places(id) on delete restrict,
  event_kind private.candidate_review_event_kind not null,
  reason_code text,
  contributor_explanation_is text,
  contributor_explanation_en text,
  private_note text,
  moderator_id uuid references auth.users(id) on delete restrict,
  request_id uuid,
  occurred_at timestamptz not null default now(),
  constraint candidate_review_explanations_together check (
    (contributor_explanation_is is null and contributor_explanation_en is null)
    or (
      nullif(btrim(contributor_explanation_is), '') is not null
      and nullif(btrim(contributor_explanation_en), '') is not null
    )
  ),
  constraint candidate_rejection_reason_check check (
    event_kind <> 'rejected'
    or (
      nullif(btrim(reason_code), '') is not null
      and nullif(btrim(contributor_explanation_is), '') is not null
      and nullif(btrim(contributor_explanation_en), '') is not null
    )
  )
);

create index candidate_review_events_history_idx
  on private.candidate_review_events (place_id, occurred_at desc, id desc);

create unique index candidate_review_events_request_unique
  on private.candidate_review_events (moderator_id, request_id)
  where request_id is not null;

alter table private.suggestion_status_events add column reason_code text;
alter table private.place_flag_status_events add column reason_code text;

alter table private.moderation_drafts enable row level security;
alter table private.moderation_draft_revisions enable row level security;
alter table private.candidate_reviews enable row level security;
alter table private.candidate_review_events enable row level security;

revoke all on private.moderation_drafts from public, anon, authenticated, service_role;
revoke all on private.moderation_draft_revisions from public, anon, authenticated, service_role;
revoke all on private.candidate_reviews from public, anon, authenticated, service_role;
revoke all on private.candidate_review_events from public, anon, authenticated, service_role;

create function private.reject_moderation_history_mutation()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  if tg_table_name = 'moderation_draft_revisions' then
    raise exception using errcode = '55000', message = 'Moderation draft revisions are append-only';
  end if;
  raise exception using errcode = '55000', message = 'Candidate review events are append-only';
end;
$$;

create trigger moderation_draft_revisions_reject_row_mutation
before update or delete on private.moderation_draft_revisions
for each row execute function private.reject_moderation_history_mutation();

create trigger moderation_draft_revisions_reject_truncate
before truncate on private.moderation_draft_revisions
for each statement execute function private.reject_moderation_history_mutation();

create trigger candidate_review_events_reject_row_mutation
before update or delete on private.candidate_review_events
for each row execute function private.reject_moderation_history_mutation();

create trigger candidate_review_events_reject_truncate
before truncate on private.candidate_review_events
for each statement execute function private.reject_moderation_history_mutation();

revoke execute on function private.reject_moderation_history_mutation()
  from public, anon, authenticated, service_role;

create function private.initialize_candidate_review()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  initial_status private.candidate_review_status;
begin
  if new.lifecycle not in ('candidate', 'published') then
    return new;
  end if;

  initial_status := case
    when new.lifecycle = 'published' then 'published'::private.candidate_review_status
    else 'pending'::private.candidate_review_status
  end;

  insert into private.candidate_reviews (place_id, status, resolved_at)
  values (
    new.id,
    initial_status,
    case when initial_status = 'published' then coalesce(new.published_at, statement_timestamp()) end
  )
  on conflict (place_id) do nothing;

  insert into private.candidate_review_events (
    place_id, event_kind, moderator_id, occurred_at
  )
  select
    new.id,
    initial_status::text::private.candidate_review_event_kind,
    new.created_by,
    coalesce(new.created_at, statement_timestamp())
  where not exists (
    select 1 from private.candidate_review_events event where event.place_id = new.id
  );

  return new;
end;
$$;

create trigger places_initialize_candidate_review
after insert on private.places
for each row execute function private.initialize_candidate_review();

revoke execute on function private.initialize_candidate_review()
  from public, anon, authenticated, service_role;

insert into private.candidate_reviews (place_id, status, resolved_at, updated_at)
select
  place.id,
  case when place.lifecycle = 'published'
    then 'published'::private.candidate_review_status
    else 'pending'::private.candidate_review_status
  end,
  case when place.lifecycle = 'published' then coalesce(place.published_at, place.updated_at) end,
  place.updated_at
from private.places place
where place.lifecycle in ('candidate', 'published')
on conflict (place_id) do nothing;

insert into private.candidate_review_events (place_id, event_kind, moderator_id, occurred_at)
select
  review.place_id,
  review.status::text::private.candidate_review_event_kind,
  place.created_by,
  place.created_at
from private.candidate_reviews review
join private.places place on place.id = review.place_id
where not exists (
  select 1 from private.candidate_review_events event where event.place_id = review.place_id
);

create function private.save_moderation_draft(
  requested_target_kind private.moderation_target_kind,
  requested_target_id uuid,
  expected_draft_version bigint,
  requested_section_id text,
  requested_payload jsonb,
  command_request_id uuid,
  actor_id uuid
)
returns table (
  target_id uuid,
  draft_version bigint,
  payload jsonb,
  updated_by uuid,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  draft_record private.moderation_drafts%rowtype;
  existing_revision private.moderation_draft_revisions%rowtype;
  next_version bigint;
  changed_at timestamptz := statement_timestamp();
begin
  if requested_target_id is null or command_request_id is null or actor_id is null
    or expected_draft_version is null or expected_draft_version < 0
    or nullif(btrim(requested_section_id), '') is null
    or jsonb_typeof(requested_payload) is distinct from 'object'
  then
    raise exception using errcode = '22023', message = 'Moderation draft command is invalid';
  end if;

  select revision.* into existing_revision
  from private.moderation_draft_revisions revision
  join private.moderation_drafts draft on draft.id = revision.draft_id
  where revision.authored_by = actor_id
    and revision.request_id = command_request_id
    and draft.target_kind = requested_target_kind
    and case requested_target_kind
      when 'candidate_place' then draft.candidate_place_id = requested_target_id
      when 'place_suggestion' then draft.suggestion_id = requested_target_id
      when 'place_flag' then draft.flag_id = requested_target_id
    end;

  if found then
    return query select requested_target_id, existing_revision.version,
      existing_revision.payload, existing_revision.authored_by, existing_revision.created_at;
    return;
  end if;

  select draft.* into draft_record
  from private.moderation_drafts draft
  where draft.target_kind = requested_target_kind
    and case requested_target_kind
      when 'candidate_place' then draft.candidate_place_id = requested_target_id
      when 'place_suggestion' then draft.suggestion_id = requested_target_id
      when 'place_flag' then draft.flag_id = requested_target_id
    end
  for update;

  if not found then
    if expected_draft_version <> 0 then
      raise exception using errcode = '40001', message = 'Moderation draft changed';
    end if;
    insert into private.moderation_drafts (
      target_kind, candidate_place_id, suggestion_id, flag_id, updated_by
    ) values (
      requested_target_kind,
      case when requested_target_kind = 'candidate_place' then requested_target_id end,
      case when requested_target_kind = 'place_suggestion' then requested_target_id end,
      case when requested_target_kind = 'place_flag' then requested_target_id end,
      actor_id
    ) returning * into draft_record;
  end if;

  if draft_record.current_version <> expected_draft_version then
    raise exception using errcode = '40001', message = 'Moderation draft changed';
  end if;

  next_version := draft_record.current_version + 1;
  insert into private.moderation_draft_revisions (
    draft_id, version, payload, section_id, authored_by, request_id, created_at
  ) values (
    draft_record.id, next_version, requested_payload, btrim(requested_section_id),
    actor_id, command_request_id, changed_at
  );

  update private.moderation_drafts
  set current_version = next_version, payload = requested_payload,
    updated_by = actor_id, updated_at = changed_at
  where id = draft_record.id;

  perform private.append_audit_event(
    'moderation.draft_saved', requested_target_kind::text, requested_target_id,
    command_request_id,
    jsonb_build_object('draft_version', next_version, 'section_id', btrim(requested_section_id))
  );

  return query select requested_target_id, next_version, requested_payload, actor_id, changed_at;
end;
$$;

revoke execute on function private.save_moderation_draft(
  private.moderation_target_kind, uuid, bigint, text, jsonb, uuid, uuid
) from public, anon, authenticated, service_role;

create function public.save_candidate_place_moderation_draft(
  requested_place_id uuid,
  expected_item_version bigint,
  expected_draft_version bigint,
  requested_section_id text,
  requested_payload jsonb,
  command_request_id uuid
)
returns table (
  target_id uuid, draft_version bigint, payload jsonb, updated_by uuid, updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  review_record private.candidate_reviews%rowtype;
begin
  select review.* into review_record
  from private.candidate_reviews review
  join private.places place on place.id = review.place_id
  where review.place_id = requested_place_id and place.lifecycle = 'candidate'
  for update of review;
  if not found then
    raise exception using errcode = '22023', message = 'Candidate Place was not found';
  end if;
  if review_record.version <> expected_item_version then
    raise exception using errcode = '40001', message = 'Moderation item changed';
  end if;
  if review_record.status = 'rejected' then
    raise exception using errcode = '55006', message = 'Candidate review is resolved';
  end if;
  return query select * from private.save_moderation_draft(
    'candidate_place', requested_place_id, expected_draft_version,
    requested_section_id, requested_payload, command_request_id, actor_id
  );
end;
$$;

create function public.save_place_suggestion_moderation_draft(
  requested_suggestion_id uuid,
  expected_item_version bigint,
  expected_draft_version bigint,
  requested_section_id text,
  requested_payload jsonb,
  command_request_id uuid
)
returns table (
  target_id uuid, draft_version bigint, payload jsonb, updated_by uuid, updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  suggestion_record private.place_suggestions%rowtype;
begin
  select suggestion.* into suggestion_record
  from private.place_suggestions suggestion
  where suggestion.id = requested_suggestion_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Suggestion was not found';
  end if;
  if suggestion_record.version <> expected_item_version then
    raise exception using errcode = '40001', message = 'Moderation item changed';
  end if;
  if suggestion_record.status in ('accepted', 'duplicate', 'rejected') then
    raise exception using errcode = '55006', message = 'Suggestion outcome is final';
  end if;
  return query select * from private.save_moderation_draft(
    'place_suggestion', requested_suggestion_id, expected_draft_version,
    requested_section_id, requested_payload, command_request_id, actor_id
  );
end;
$$;

create function public.save_place_flag_moderation_draft(
  requested_flag_id uuid,
  expected_item_version bigint,
  expected_draft_version bigint,
  requested_section_id text,
  requested_payload jsonb,
  command_request_id uuid
)
returns table (
  target_id uuid, draft_version bigint, payload jsonb, updated_by uuid, updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  flag_record private.place_flags%rowtype;
begin
  select flag.* into flag_record
  from private.place_flags flag
  where flag.id = requested_flag_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Correction or Report was not found';
  end if;
  if flag_record.version <> expected_item_version then
    raise exception using errcode = '40001', message = 'Moderation item changed';
  end if;
  if flag_record.status in (
    'applied', 'confirmed_useful', 'dispute_opened', 'place_inactivated', 'rejected'
  ) then
    raise exception using errcode = '55006', message = 'Correction or Report outcome is final';
  end if;
  return query select * from private.save_moderation_draft(
    'place_flag', requested_flag_id, expected_draft_version,
    requested_section_id, requested_payload, command_request_id, actor_id
  );
end;
$$;

create function public.decide_candidate_place(
  requested_place_id uuid,
  requested_outcome text,
  expected_item_version bigint,
  expected_draft_version bigint,
  requested_reason_code text,
  contributor_explanation_is text,
  contributor_explanation_en text,
  requested_private_note text,
  command_request_id uuid
)
returns table (place_id uuid, status text, item_version bigint, draft_version bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  review_record private.candidate_reviews%rowtype;
  current_draft_version bigint;
  next_status private.candidate_review_status;
  event_kind private.candidate_review_event_kind;
  next_version bigint;
  changed_at timestamptz := statement_timestamp();
begin
  if requested_place_id is null or command_request_id is null
    or requested_outcome not in ('needs_information', 'rejected', 'reopen')
  then
    raise exception using errcode = '22023', message = 'Candidate decision is invalid';
  end if;

  select review.* into review_record
  from private.candidate_reviews review
  join private.places place on place.id = review.place_id
  where review.place_id = requested_place_id and place.lifecycle = 'candidate'
  for update of review;
  if not found then
    raise exception using errcode = '22023', message = 'Candidate Place was not found';
  end if;

  if review_record.resolution_request_id = command_request_id then
    select draft.current_version into current_draft_version
    from private.moderation_drafts draft
    where draft.candidate_place_id = requested_place_id;
    current_draft_version := coalesce(current_draft_version, 0);
    return query select review_record.place_id, review_record.status::text,
      review_record.version, current_draft_version;
    return;
  end if;

  if review_record.version <> expected_item_version then
    raise exception using errcode = '40001', message = 'Moderation item changed';
  end if;

  select draft.current_version into current_draft_version
  from private.moderation_drafts draft
  where draft.candidate_place_id = requested_place_id
  for update;
  current_draft_version := coalesce(current_draft_version, 0);
  if current_draft_version <> expected_draft_version then
    raise exception using errcode = '40001', message = 'Moderation draft changed';
  end if;

  if requested_outcome = 'reopen' then
    if review_record.status <> 'rejected' then
      raise exception using errcode = '55006', message = 'Only a rejected Candidate can be reopened';
    end if;
    if requested_reason_code is not null or contributor_explanation_is is not null
      or contributor_explanation_en is not null or requested_private_note is not null
    then
      raise exception using errcode = '22023', message = 'Reopening does not accept resolution details';
    end if;
    next_status := 'pending';
    event_kind := 'reopened';
  elsif requested_outcome = 'rejected' then
    if review_record.status not in ('pending', 'needs_information')
      or nullif(btrim(requested_reason_code), '') is null
      or requested_reason_code not in (
        'insufficient_evidence', 'inaccurate', 'out_of_scope', 'unsafe', 'spam', 'other'
      )
      or nullif(btrim(contributor_explanation_is), '') is null
      or nullif(btrim(contributor_explanation_en), '') is null
    then
      raise exception using errcode = '22023', message = 'Candidate rejection is incomplete';
    end if;
    next_status := 'rejected';
    event_kind := 'rejected';
  else
    if review_record.status not in ('pending', 'needs_information')
      or nullif(btrim(contributor_explanation_is), '') is null
      or nullif(btrim(contributor_explanation_en), '') is null
    then
      raise exception using errcode = '22023', message = 'Information request is incomplete';
    end if;
    next_status := 'needs_information';
    event_kind := 'needs_information';
  end if;

  next_version := review_record.version + 1;
  update private.candidate_reviews review
  set status = next_status, version = next_version,
    resolution_request_id = command_request_id,
    resolved_at = case when next_status = 'rejected' then changed_at end,
    updated_at = changed_at
  where review.place_id = requested_place_id;

  insert into private.candidate_review_events (
    place_id, event_kind, reason_code, contributor_explanation_is,
    contributor_explanation_en, private_note, moderator_id, request_id, occurred_at
  ) values (
    requested_place_id, event_kind, nullif(btrim(requested_reason_code), ''),
    nullif(btrim(contributor_explanation_is), ''),
    nullif(btrim(contributor_explanation_en), ''),
    nullif(btrim(requested_private_note), ''), actor_id, command_request_id, changed_at
  );

  perform private.append_audit_event(
    'candidate.' || event_kind::text, 'place', requested_place_id, command_request_id,
    jsonb_strip_nulls(jsonb_build_object(
      'previous_status', review_record.status::text,
      'status', next_status::text,
      'item_version', next_version,
      'draft_version', current_draft_version,
      'reason_code', nullif(btrim(requested_reason_code), '')
    ))
  );

  return query select requested_place_id, next_status::text, next_version, current_draft_version;
end;
$$;

revoke execute on function public.save_candidate_place_moderation_draft(
  uuid, bigint, bigint, text, jsonb, uuid
) from public, anon, service_role;
revoke execute on function public.save_place_suggestion_moderation_draft(
  uuid, bigint, bigint, text, jsonb, uuid
) from public, anon, service_role;
revoke execute on function public.save_place_flag_moderation_draft(
  uuid, bigint, bigint, text, jsonb, uuid
) from public, anon, service_role;
revoke execute on function public.decide_candidate_place(
  uuid, text, bigint, bigint, text, text, text, text, uuid
) from public, anon, service_role;

grant execute on function public.save_candidate_place_moderation_draft(
  uuid, bigint, bigint, text, jsonb, uuid
) to authenticated;
grant execute on function public.save_place_suggestion_moderation_draft(
  uuid, bigint, bigint, text, jsonb, uuid
) to authenticated;
grant execute on function public.save_place_flag_moderation_draft(
  uuid, bigint, bigint, text, jsonb, uuid
) to authenticated;
grant execute on function public.decide_candidate_place(
  uuid, text, bigint, bigint, text, text, text, text, uuid
) to authenticated;

create function public.list_moderation_candidate_places(
  requested_filter text,
  cursor_created_at timestamptz default null,
  cursor_place_id uuid default null,
  requested_limit integer default 20
)
returns table (
  place_id uuid,
  operator_name text,
  category text,
  address_line text,
  locality text,
  municipality text,
  created_at timestamptz,
  candidate_status text,
  item_version bigint,
  draft_version bigint,
  draft_updated_by uuid,
  draft_updated_at timestamptz,
  readiness_state text,
  readiness_issue_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  page_size integer := least(greatest(coalesce(requested_limit, 20), 1), 51);
begin
  perform security.require_moderator();
  if requested_filter not in ('actionable', 'deferred', 'resolved') then
    raise exception using errcode = '22023', message = 'Moderation queue filter is invalid';
  end if;
  if (cursor_created_at is null) <> (cursor_place_id is null) then
    raise exception using errcode = '22023', message = 'Candidate queue cursor is invalid';
  end if;

  return query
  select
    place.id, operator_record.name, place.category::text,
    location_record.address_line, location_record.locality, location_record.municipality,
    place.created_at, review.status::text, review.version,
    coalesce(draft.current_version, 0), draft.updated_by, draft.updated_at,
    case
      when location_record.geometry_precision = 'municipality_anchor_pending_geocode'
        or location_record.geometry_source is null then 'blocked'
      when not exists (
        select 1 from private.evidence evidence where evidence.place_id = place.id
      ) or not exists (
        select 1 from private.access_conditions condition
        where condition.place_id = place.id and condition.superseded_at is null
      ) then 'blocked'
      else 'ready'
    end,
    (
      (case when location_record.geometry_precision = 'municipality_anchor_pending_geocode'
        or location_record.geometry_source is null then 1 else 0 end)
      + (case when not exists (
        select 1 from private.evidence evidence where evidence.place_id = place.id
      ) then 1 else 0 end)
      + (case when not exists (
        select 1 from private.access_conditions condition
        where condition.place_id = place.id and condition.superseded_at is null
      ) then 1 else 0 end)
    )::integer
  from private.candidate_reviews review
  join private.places place on place.id = review.place_id
  join private.operators operator_record on operator_record.id = place.operator_id
  join private.locations location_record on location_record.id = place.location_id
  left join private.moderation_drafts draft on draft.candidate_place_id = place.id
  where (
      (requested_filter = 'actionable' and review.status = 'pending' and place.lifecycle = 'candidate')
      or (requested_filter = 'deferred' and review.status = 'needs_information' and place.lifecycle = 'candidate')
      or (requested_filter = 'resolved' and review.status in ('rejected', 'published'))
    )
    and (
      cursor_created_at is null
      or (place.created_at, place.id) > (cursor_created_at, cursor_place_id)
    )
  order by place.created_at, place.id
  limit page_size;
end;
$$;

create function public.list_moderation_place_suggestions(
  requested_filter text,
  cursor_queue_rank integer default null,
  cursor_submitted_at timestamptz default null,
  cursor_suggestion_id uuid default null,
  requested_limit integer default 20
)
returns table (
  suggestion_id uuid, member_id uuid, status text, operator_name text,
  name_is text, name_en text, category text, address_line text, locality text,
  submitted_at timestamptz, updated_at timestamptz, queue_rank integer,
  item_version bigint, draft_version bigint, draft_updated_by uuid,
  draft_updated_at timestamptz, readiness_state text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  page_size integer := least(greatest(coalesce(requested_limit, 20), 1), 51);
begin
  perform security.require_moderator();
  if requested_filter not in ('actionable', 'deferred', 'resolved') then
    raise exception using errcode = '22023', message = 'Moderation queue filter is invalid';
  end if;
  if (cursor_queue_rank is null or cursor_submitted_at is null or cursor_suggestion_id is null)
    and not (cursor_queue_rank is null and cursor_submitted_at is null and cursor_suggestion_id is null)
  then
    raise exception using errcode = '22023', message = 'Suggestion queue cursor is invalid';
  end if;
  return query
  select
    suggestion.id, suggestion.member_id, suggestion.status::text,
    coalesce(draft.payload, suggestion.proposal) ->> 'operator_name',
    coalesce(draft.payload, suggestion.proposal) #>> '{translations,is,name}',
    coalesce(draft.payload, suggestion.proposal) #>> '{translations,en,name}',
    coalesce(draft.payload, suggestion.proposal) ->> 'category',
    coalesce(draft.payload, suggestion.proposal) #>> '{location,address_line}',
    coalesce(draft.payload, suggestion.proposal) #>> '{location,locality}',
    suggestion.submitted_at, suggestion.updated_at,
    case when suggestion.status = 'submitted' then 0
      when suggestion.status = 'needs_information' then 1 else 2 end,
    suggestion.version, coalesce(draft.current_version, 0), draft.updated_by, draft.updated_at,
    case when jsonb_typeof(coalesce(draft.payload, suggestion.proposal)) = 'object'
      then 'ready' else 'blocked' end
  from private.place_suggestions suggestion
  left join private.moderation_drafts draft on draft.suggestion_id = suggestion.id
  where (
      (requested_filter = 'actionable' and suggestion.status = 'submitted')
      or (requested_filter = 'deferred' and suggestion.status = 'needs_information')
      or (requested_filter = 'resolved' and suggestion.status in ('accepted', 'duplicate', 'rejected'))
    )
    and (
      cursor_queue_rank is null
      or (
        case when suggestion.status = 'submitted' then 0
          when suggestion.status = 'needs_information' then 1 else 2 end,
        suggestion.submitted_at, suggestion.id
      ) > (cursor_queue_rank, cursor_submitted_at, cursor_suggestion_id)
    )
  order by 12, suggestion.submitted_at, suggestion.id
  limit page_size;
end;
$$;

create function public.list_moderation_place_flags(
  requested_filter text,
  cursor_priority integer default null,
  cursor_submitted_at timestamptz default null,
  cursor_flag_id uuid default null,
  requested_limit integer default 20
)
returns table (
  flag_id uuid, member_id uuid, kind text, status text, place_id uuid,
  place_name_is text, place_name_en text, target_kind text, target_field text,
  access_condition_id uuid, report_reason text, is_safety_concern boolean,
  submitted_at timestamptz, updated_at timestamptz, priority integer,
  item_version bigint, draft_version bigint, draft_updated_by uuid,
  draft_updated_at timestamptz, readiness_state text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  page_size integer := least(greatest(coalesce(requested_limit, 20), 1), 51);
begin
  perform security.require_moderator();
  if requested_filter not in ('actionable', 'deferred', 'resolved') then
    raise exception using errcode = '22023', message = 'Moderation queue filter is invalid';
  end if;
  if (cursor_priority is null or cursor_submitted_at is null or cursor_flag_id is null)
    and not (cursor_priority is null and cursor_submitted_at is null and cursor_flag_id is null)
  then
    raise exception using errcode = '22023', message = 'Correction and Report queue cursor is invalid';
  end if;
  return query
  select
    flag.id, flag.member_id, flag.kind::text, flag.status::text, flag.place_id,
    translations.name_is, translations.name_en, flag.target_kind::text,
    flag.target_field::text, flag.access_condition_id, flag.report_reason::text,
    flag.is_safety_concern, flag.submitted_at, flag.updated_at,
    case when flag.is_safety_concern and flag.status = 'submitted' then 0
      when flag.status = 'submitted' then 1
      when flag.status = 'needs_information' then 2 else 3 end,
    flag.version, coalesce(draft.current_version, 0), draft.updated_by, draft.updated_at,
    case when flag.kind = 'report' or draft.current_version is not null
      then 'ready' else 'needs_attention' end
  from private.place_flags flag
  cross join lateral (
    select max(name) filter (where locale = 'is') name_is,
      max(name) filter (where locale = 'en') name_en
    from private.place_translations translation
    where translation.place_id = flag.place_id
  ) translations
  left join private.moderation_drafts draft on draft.flag_id = flag.id
  where (
      (requested_filter = 'actionable' and flag.status = 'submitted')
      or (requested_filter = 'deferred' and flag.status = 'needs_information')
      or (requested_filter = 'resolved' and flag.status in (
        'applied', 'confirmed_useful', 'dispute_opened', 'place_inactivated', 'rejected'
      ))
    )
    and (
      cursor_priority is null
      or (
        case when flag.is_safety_concern and flag.status = 'submitted' then 0
          when flag.status = 'submitted' then 1
          when flag.status = 'needs_information' then 2 else 3 end,
        flag.submitted_at, flag.id
      ) > (cursor_priority, cursor_submitted_at, cursor_flag_id)
    )
  order by 15, flag.submitted_at, flag.id
  limit page_size;
end;
$$;

drop function public.list_moderation_queue_summary();

create function public.list_moderation_queue_summary()
returns table (
  queue_id text,
  actionable_count bigint,
  deferred_count bigint,
  resolved_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_moderator();
  return query
  select 'suggestions'::text,
    count(*) filter (where status = 'submitted'),
    count(*) filter (where status = 'needs_information'),
    count(*) filter (where status in ('accepted', 'duplicate', 'rejected'))
  from private.place_suggestions
  union all
  select 'corrections-and-reports'::text,
    count(*) filter (where status = 'submitted'),
    count(*) filter (where status = 'needs_information'),
    count(*) filter (where status in (
      'applied', 'confirmed_useful', 'dispute_opened', 'place_inactivated', 'rejected'
    ))
  from private.place_flags
  union all
  select 'candidate-places'::text,
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'needs_information'),
    count(*) filter (where status in ('rejected', 'published'))
  from private.candidate_reviews;
end;
$$;

revoke execute on function public.list_moderation_candidate_places(
  text, timestamptz, uuid, integer
) from public, anon, service_role;
revoke execute on function public.list_moderation_place_suggestions(
  text, integer, timestamptz, uuid, integer
) from public, anon, service_role;
revoke execute on function public.list_moderation_place_flags(
  text, integer, timestamptz, uuid, integer
) from public, anon, service_role;
revoke execute on function public.list_moderation_queue_summary()
  from public, anon, service_role;

grant execute on function public.list_moderation_candidate_places(
  text, timestamptz, uuid, integer
) to authenticated;
grant execute on function public.list_moderation_place_suggestions(
  text, integer, timestamptz, uuid, integer
) to authenticated;
grant execute on function public.list_moderation_place_flags(
  text, integer, timestamptz, uuid, integer
) to authenticated;
grant execute on function public.list_moderation_queue_summary() to authenticated;

drop function public.get_moderation_place_review(uuid);

create function public.get_moderation_place_review(requested_place_id uuid)
returns table (
  place_id uuid,
  version bigint,
  lifecycle text,
  candidate_status text,
  item_version bigint,
  draft_version bigint,
  draft_payload jsonb,
  draft_updated_by uuid,
  draft_updated_at timestamptz,
  readiness_state text,
  readiness_issues jsonb,
  originating_suggestion_id uuid,
  contributor_id uuid,
  operator_name text,
  category text,
  website_url text,
  phone text,
  opening_hours jsonb,
  dog_amenities jsonb,
  address_line text,
  locality text,
  postal_code text,
  municipality text,
  latitude double precision,
  longitude double precision,
  geometry_precision text,
  geometry_source text,
  name_is text,
  description_is text,
  name_en text,
  description_en text,
  access_conditions jsonb,
  evidence_records jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_moderator();
  return query
  with candidate as (
    select
      place.id,
      place.version,
      place.lifecycle,
      review.status,
      review.version item_version,
      draft.current_version draft_version,
      draft.payload draft_payload,
      draft.updated_by draft_updated_by,
      draft.updated_at draft_updated_at,
      operator_record.name operator_name,
      place.category,
      place.website_url,
      place.phone,
      place.opening_hours,
      place.dog_amenities,
      location_record.address_line,
      location_record.locality,
      location_record.postal_code,
      location_record.municipality,
      location_record.latitude,
      location_record.longitude,
      location_record.geometry_precision,
      location_record.geometry_source,
      translations.name_is,
      translations.description_is,
      translations.name_en,
      translations.description_en,
      coalesce(conditions.records, '[]'::jsonb) access_conditions,
      coalesce(evidence.records, '[]'::jsonb) evidence_records,
      origin.suggestion_id,
      origin.member_id
    from private.places place
    join private.candidate_reviews review on review.place_id = place.id
    join private.operators operator_record on operator_record.id = place.operator_id
    join private.locations location_record on location_record.id = place.location_id
    left join private.moderation_drafts draft on draft.candidate_place_id = place.id
    cross join lateral (
      select max(name) filter (where locale = 'is') name_is,
        max(description) filter (where locale = 'is') description_is,
        max(name) filter (where locale = 'en') name_en,
        max(description) filter (where locale = 'en') description_en
      from private.place_translations translation
      where translation.place_id = place.id
    ) translations
    cross join lateral (
      select jsonb_agg(jsonb_build_object(
        'id', condition.id,
        'accessArea', condition.access_area,
        'accessAreaNote', condition.access_area_note,
        'restraintCondition', condition.restraint_condition,
        'restraintNote', condition.restraint_note,
        'dogEligibility', condition.dog_eligibility,
        'availabilityState', condition.availability_state,
        'availabilityWindow', condition.availability_window,
        'permissionRequirement', condition.permission_requirement
      ) order by condition.created_at, condition.id) records
      from private.access_conditions condition
      where condition.place_id = place.id and condition.superseded_at is null
    ) conditions
    cross join lateral (
      select jsonb_agg(jsonb_build_object(
        'id', evidence_record.id,
        'kind', evidence_record.kind,
        'sourceUrl', evidence_record.source_url,
        'sourceCitation', evidence_record.source_citation,
        'sourceLabel', evidence_record.source_label,
        'observedAt', evidence_record.observed_at,
        'sourceMetadata', evidence_record.source_metadata
      ) order by evidence_record.observed_at desc, evidence_record.id) records
      from private.evidence evidence_record where evidence_record.place_id = place.id
    ) evidence
    left join lateral (
      select suggestion.id suggestion_id, suggestion.member_id
      from private.place_suggestions suggestion
      where suggestion.candidate_place_id = place.id
      order by suggestion.resolved_at, suggestion.id
      limit 1
    ) origin on true
    where place.id = requested_place_id
  ), projected as (
    select candidate.*,
      coalesce(candidate.draft_payload #>> '{operator,name}', candidate.operator_name) shown_operator,
      coalesce(candidate.draft_payload ->> 'category', candidate.category::text) shown_category,
      coalesce(candidate.draft_payload ->> 'website_url', candidate.website_url) shown_website,
      coalesce(candidate.draft_payload ->> 'phone', candidate.phone) shown_phone,
      coalesce(candidate.draft_payload -> 'opening_hours', candidate.opening_hours) shown_hours,
      coalesce(candidate.draft_payload -> 'dog_amenities', candidate.dog_amenities) shown_amenities,
      coalesce(candidate.draft_payload #>> '{location,address_line}', candidate.address_line) shown_address,
      coalesce(candidate.draft_payload #>> '{location,locality}', candidate.locality) shown_locality,
      coalesce(candidate.draft_payload #>> '{location,postal_code}', candidate.postal_code) shown_postal,
      coalesce(candidate.draft_payload #>> '{location,municipality}', candidate.municipality) shown_municipality,
      coalesce((candidate.draft_payload #>> '{location,latitude}')::double precision, candidate.latitude) shown_latitude,
      coalesce((candidate.draft_payload #>> '{location,longitude}')::double precision, candidate.longitude) shown_longitude,
      coalesce(candidate.draft_payload #>> '{location,geometry_precision}', candidate.geometry_precision::text) shown_precision,
      coalesce(candidate.draft_payload #>> '{location,geometry_source}', candidate.geometry_source) shown_geometry_source,
      coalesce(candidate.draft_payload #>> '{translations,is,name}', candidate.name_is) shown_name_is,
      coalesce(candidate.draft_payload #>> '{translations,is,description}', candidate.description_is) shown_description_is,
      coalesce(candidate.draft_payload #>> '{translations,en,name}', candidate.name_en) shown_name_en,
      coalesce(candidate.draft_payload #>> '{translations,en,description}', candidate.description_en) shown_description_en,
      coalesce(candidate.draft_payload -> 'access_conditions', candidate.access_conditions) shown_conditions,
      coalesce(candidate.draft_payload -> 'evidence_records', candidate.evidence_records) shown_evidence
    from candidate
  ), with_issues as (
    select projected.*,
      coalesce((
        select jsonb_agg(issue order by issue)
        from (
          select 'operator'::text issue where nullif(btrim(projected.shown_operator), '') is null
          union all select 'location' where projected.shown_precision = 'municipality_anchor_pending_geocode'
            or nullif(btrim(projected.shown_geometry_source), '') is null
          union all select 'icelandic_translation' where nullif(btrim(projected.shown_name_is), '') is null
            or nullif(btrim(projected.shown_description_is), '') is null
          union all select 'english_translation' where nullif(btrim(projected.shown_name_en), '') is null
            or nullif(btrim(projected.shown_description_en), '') is null
          union all select 'access_conditions' where jsonb_typeof(projected.shown_conditions) is distinct from 'array'
            or jsonb_array_length(projected.shown_conditions) = 0
          union all select 'evidence' where jsonb_typeof(projected.shown_evidence) is distinct from 'array'
            or jsonb_array_length(projected.shown_evidence) = 0
        ) issue_rows
      ), '[]'::jsonb) issues
    from projected
  )
  select
    result.id, result.version, result.lifecycle::text, result.status::text,
    result.item_version, coalesce(result.draft_version, 0), result.draft_payload,
    result.draft_updated_by, result.draft_updated_at,
    case when jsonb_array_length(result.issues) = 0 then 'ready' else 'blocked' end,
    result.issues, result.suggestion_id, result.member_id,
    result.shown_operator, result.shown_category,
    result.shown_website, result.shown_phone, result.shown_hours, result.shown_amenities,
    result.shown_address, result.shown_locality, result.shown_postal,
    result.shown_municipality, result.shown_latitude, result.shown_longitude,
    result.shown_precision, result.shown_geometry_source, result.shown_name_is,
    result.shown_description_is, result.shown_name_en, result.shown_description_en,
    result.shown_conditions, result.shown_evidence
  from with_issues result;
end;
$$;

revoke execute on function public.get_moderation_place_review(uuid)
  from public, anon, service_role;
grant execute on function public.get_moderation_place_review(uuid) to authenticated;

alter function public.verify_and_publish_place(jsonb, uuid)
  rename to verify_and_publish_place_pre_moderation_workbench;
alter function public.verify_and_publish_place_pre_moderation_workbench(jsonb, uuid)
  set schema private;
revoke execute on function private.verify_and_publish_place_pre_moderation_workbench(jsonb, uuid)
  from public, anon, authenticated, service_role;

create function public.verify_and_publish_place(command_payload jsonb, command_request_id uuid)
returns table (place_id uuid, verification_ids uuid[], version bigint, published_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  requested_place_id uuid := (command_payload ->> 'place_id')::uuid;
  review_record private.candidate_reviews%rowtype;
  current_draft_version bigint;
  result_record record;
begin
  select review.* into review_record
  from private.candidate_reviews review
  where review.place_id = requested_place_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Candidate review was not found';
  end if;
  if review_record.status not in ('pending', 'needs_information') then
    raise exception using errcode = '55000', message = 'Candidate review is not publishable';
  end if;

  select draft.current_version into current_draft_version
  from private.moderation_drafts draft
  where draft.candidate_place_id = requested_place_id
  for update;
  current_draft_version := coalesce(current_draft_version, 0);
  if command_payload ? 'expected_draft_version'
    and (command_payload ->> 'expected_draft_version')::bigint <> current_draft_version
  then
    raise exception using errcode = '40001', message = 'Moderation draft changed';
  end if;

  select publication.* into result_record
  from private.verify_and_publish_place_pre_moderation_workbench(
    command_payload, command_request_id
  ) publication;

  update private.candidate_reviews review
  set status = 'published', version = review.version + 1,
    resolution_request_id = command_request_id,
    resolved_at = result_record.published_at,
    updated_at = result_record.published_at
  where review.place_id = requested_place_id;

  insert into private.candidate_review_events (
    place_id, event_kind, moderator_id, request_id, occurred_at
  ) values (
    requested_place_id, 'published', actor_id, command_request_id, result_record.published_at
  );

  return query select result_record.place_id, result_record.verification_ids,
    result_record.version, result_record.published_at;
end;
$$;

revoke execute on function public.verify_and_publish_place(jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.verify_and_publish_place(jsonb, uuid) to authenticated;

comment on table private.moderation_drafts is
  'One shared optimistic-concurrency draft head for each moderated Candidate, Suggestion, or Flag.';
comment on table private.moderation_draft_revisions is
  'Immutable complete snapshots of shared moderation drafts.';
comment on table private.candidate_reviews is
  'Candidate moderation state, intentionally separate from public Place lifecycle.';
comment on function public.decide_candidate_place(
  uuid, text, bigint, bigint, text, text, text, text, uuid
) is
  'Defers, rejects, or reopens a Candidate with item and shared-draft conflict protection.';

commit;
