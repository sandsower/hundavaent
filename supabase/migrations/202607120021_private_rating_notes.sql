begin;

-- private-rating-note: Private Rating Notes. Additive columns on the dog-friendliness Rating current-row table and its
-- append-only event ledger, reusing the existing dog-friendliness rating seam. A note is 1:1 with
-- the Rating it explains (one current Rating per Member+Place already implies at most one current
-- note), so it lives on the same row rather than a joined table.
alter table private.dog_friendliness_ratings
  add column private_note text,
  add column private_note_classification text,
  add column private_note_updated_at timestamptz,
  add column linked_report_id uuid references private.place_flags(id) on delete restrict,
  add column linked_report_request_id uuid;

alter table private.dog_friendliness_ratings
  add constraint dog_friendliness_rating_private_note_check check (
    private_note is null or btrim(private_note) <> ''
  ),
  add constraint dog_friendliness_rating_private_note_classification_check check (
    private_note_classification is null
    or private_note_classification in ('subjective', 'inaccurate_info', 'safety_concern')
  ),
  add constraint dog_friendliness_rating_private_note_shape_check check (
    (private_note is null) = (private_note_classification is null)
    and (private_note is null) = (private_note_updated_at is null)
  ),
  add constraint dog_friendliness_rating_linked_report_shape_check check (
    (linked_report_id is null) = (linked_report_request_id is null)
  );

-- The append-only event ledger gains matching snapshot columns (the full resulting note state
-- after each event, not just the delta) and two new event kinds: 'note_updated' for an edit that
-- touches only the note (never bumps rated_at, so a note can never move the numeric aggregate's
-- recency context), and 'report_linked' for the explicit Report-creation wrapper below.
alter table private.dog_friendliness_rating_events
  add column private_note text,
  add column private_note_classification text;

-- The original event_kind CHECK was an unnamed inline column constraint; find it by definition
-- rather than assuming Postgres' default naming, so this migration does not depend on an
-- undocumented naming convention holding across Postgres versions.
do $$
declare
  found_constraint text;
begin
  select conname into found_constraint
  from pg_constraint
  where conrelid = 'private.dog_friendliness_rating_events'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%event_kind%'
    and pg_get_constraintdef(oid) not ilike '%reason%';

  if found_constraint is not null then
    execute format('alter table private.dog_friendliness_rating_events drop constraint %I', found_constraint);
  end if;
end
$$;

alter table private.dog_friendliness_rating_events
  add constraint dog_friendliness_rating_events_event_kind_check check (
    event_kind in ('submitted', 'updated', 'excluded', 'reinstated', 'note_updated', 'report_linked')
  );

alter table private.dog_friendliness_rating_events
  drop constraint dog_friendliness_rating_event_reason_shape_check;

alter table private.dog_friendliness_rating_events
  add constraint dog_friendliness_rating_event_reason_shape_check check (
    (event_kind in ('submitted', 'updated', 'note_updated', 'report_linked') and reason is null)
    or (event_kind in ('excluded', 'reinstated') and reason is not null)
  );

-- Fail-closed, versioned, service-role-only policy for the low-score note-offer trigger. No
-- default row: every read is hidden (no note prompt, no server-side acceptance of note content)
-- until an operator explicitly configures and enables a policy (the private-rating-note threshold approval
-- gate configured by an operator).
create table private.private_rating_note_policy (
  singleton boolean primary key default true check (singleton),
  policy_version text not null check (btrim(policy_version) <> ''),
  low_score_threshold integer not null check (low_score_threshold between 1 and 5),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table private.private_rating_note_policy enable row level security;

-- Append-only Moderator decision log for escalation and future-anonymized-feedback-use
-- determinations. Eligibility and abuse decisions reuse the existing dog-friendliness
-- exclude/reinstate_dog_friendliness_rating RPCs unchanged; this table only covers the two
-- decision kinds those RPCs cannot express.
create table private.rating_note_dispositions (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  place_id uuid not null references private.places(id) on delete restrict,
  disposition_kind text not null check (
    disposition_kind in ('escalated', 'feedback_use_permitted', 'feedback_use_denied')
  ),
  notes text not null check (btrim(notes) <> ''),
  moderator_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint rating_note_dispositions_member_place_request_key unique (member_id, place_id, request_id)
);

create index rating_note_dispositions_lookup_idx
  on private.rating_note_dispositions (member_id, place_id, occurred_at desc);

alter table private.rating_note_dispositions enable row level security;

create function private.reject_rating_note_disposition_mutation()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'private.rating_note_dispositions is append-only';
end;
$$;

create trigger rating_note_dispositions_reject_row_mutation
before update or delete on private.rating_note_dispositions
for each row execute function private.reject_rating_note_disposition_mutation();

create trigger rating_note_dispositions_reject_truncate
before truncate on private.rating_note_dispositions
for each statement execute function private.reject_rating_note_disposition_mutation();

-- The mirror-image link: which Report (if any) a Rating's note produced. Nullable, additive.
alter table private.place_flags
  add column source_rating_id uuid references private.dog_friendliness_ratings(id) on delete restrict;

-- Policy configuration ------------------------------------------------------------------------

create function public.configure_private_rating_note_policy(
  requested_policy_version text,
  requested_low_score_threshold integer,
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
      message = 'Private Rating Note policy version is required';
  end if;

  if requested_low_score_threshold is null or requested_low_score_threshold not between 1 and 5 then
    raise exception using
      errcode = '22023',
      message = 'Private Rating Note policy threshold is invalid';
  end if;

  if requested_enabled is null then
    raise exception using
      errcode = '22023',
      message = 'Private Rating Note policy enabled flag is required';
  end if;

  insert into private.private_rating_note_policy (
    singleton, policy_version, low_score_threshold, enabled, updated_at
  ) values (
    true, btrim(requested_policy_version), requested_low_score_threshold, requested_enabled,
    statement_timestamp()
  )
  on conflict (singleton) do update set
    policy_version = excluded.policy_version,
    low_score_threshold = excluded.low_score_threshold,
    enabled = excluded.enabled,
    updated_at = excluded.updated_at;
end;
$$;

create function public.get_private_rating_note_policy()
returns table (enabled boolean, low_score_threshold integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  policy_record private.private_rating_note_policy%rowtype;
begin
  select policy.*
  into policy_record
  from private.private_rating_note_policy as policy
  where policy.singleton and policy.enabled;

  if not found then
    return query select false, null::integer;
    return;
  end if;

  return query select true, policy_record.low_score_threshold;
end;
$$;

-- Member commands -----------------------------------------------------------------------------

-- Dropped and recreated: the return row shape changes (four new note/link columns), which
-- `create or replace function` cannot do. Every existing 6-argument caller (positional or
-- PostgREST's named-argument RPC calling convention) keeps compiling and working unchanged
-- because the three new parameters are trailing and default.
drop function if exists public.submit_dog_friendliness_rating(
  uuid, integer, integer, integer, integer, uuid
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
  id uuid,
  place_id uuid,
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
  event_kind text;
  result private.dog_friendliness_ratings%rowtype;
  scores_unchanged boolean;
  note_policy private.private_rating_note_policy%rowtype;
  resolved_note text;
  resolved_classification text;
  resolved_note_updated_at timestamptz;
  is_low_score boolean;
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
  existing_found := found;

  scores_unchanged := existing_found
    and existing.welcome_score is not distinct from requested_welcome_score
    and existing.clarity_score is not distinct from requested_clarity_score
    and existing.comfort_score is not distinct from requested_comfort_score
    and existing.thoughtfulness_score is not distinct from requested_thoughtfulness_score;

  -- Resolve the requested note intent. requested_update_private_note is an explicit flag rather
  -- than inferred from note-text presence, so a Member updating only their scores never silently
  -- clears an existing note by omission, and explicitly clearing a note (text = null with the flag
  -- true) is distinguishable from "the note was not touched this time".
  if requested_update_private_note then
    resolved_note := nullif(btrim(coalesce(requested_private_note, '')), '');

    if resolved_note is not null then
      select policy.*
      into note_policy
      from private.private_rating_note_policy as policy
      where policy.singleton and policy.enabled;

      if not found then
        raise exception using
          errcode = '22023',
          message = 'Private Rating Notes are not available';
      end if;

      is_low_score :=
        (requested_welcome_score is not null and requested_welcome_score <= note_policy.low_score_threshold)
        or (requested_clarity_score is not null and requested_clarity_score <= note_policy.low_score_threshold)
        or (requested_comfort_score is not null and requested_comfort_score <= note_policy.low_score_threshold)
        or (
          requested_thoughtfulness_score is not null
          and requested_thoughtfulness_score <= note_policy.low_score_threshold
        );

      if not is_low_score then
        raise exception using
          errcode = '22023',
          message = 'A Private Rating Note requires a qualifying low score';
      end if;

      if requested_private_note_classification is null
        or requested_private_note_classification
          <> all (array['subjective', 'inaccurate_info', 'safety_concern']::text[])
      then
        raise exception using
          errcode = '22023',
          message = 'A Private Rating Note classification is required';
      end if;

      resolved_classification := requested_private_note_classification;
      resolved_note_updated_at := statement_timestamp();
    else
      resolved_classification := null;
      resolved_note_updated_at := null;
    end if;
  end if;

  -- Idempotent replay: the exact same request against the unchanged current row (scores and, if
  -- requested, note state) returns the existing row without a write, so rated_at (and therefore
  -- the trailing-12-month recency context) is never nudged by a retried command.
  if existing_found
    and existing.last_request_id = command_request_id
    and scores_unchanged
    and (
      not requested_update_private_note
      or (
        resolved_note is not distinct from existing.private_note
        and resolved_classification is not distinct from existing.private_note_classification
      )
    ) then
    return query select
      existing.id, existing.place_id, existing.welcome_score, existing.clarity_score,
      existing.comfort_score, existing.thoughtfulness_score, existing.rated_at,
      (existing.excluded_at is not null), existing.private_note, existing.private_note_classification,
      existing.private_note_updated_at, existing.linked_report_id;
    return;
  end if;

  -- A request identifier that already produced an event must never mutate state again: a stale
  -- submit command replayed after a later update would otherwise rewrite the current row while its
  -- event insert silently dedupes, leaving a state change with no history row.
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

  -- A note-only edit (scores unchanged, note intent explicitly requested) gets its own event kind
  -- and never bumps rated_at, so a note can never move the public Summary's numeric aggregate or
  -- recency context. Every other case (a brand-new submission, or any actual score change)
  -- preserves the exact pre-private-rating-note behavior.
  if not existing_found then
    event_kind := 'submitted';
  elsif scores_unchanged and requested_update_private_note then
    event_kind := 'note_updated';
  else
    event_kind := 'updated';
  end if;

  insert into private.dog_friendliness_ratings (
    member_id, place_id, welcome_score, clarity_score, comfort_score, thoughtfulness_score,
    rated_at, last_request_id, private_note, private_note_classification, private_note_updated_at
  ) values (
    submitting_member_id, requested_place_id, requested_welcome_score, requested_clarity_score,
    requested_comfort_score, requested_thoughtfulness_score, statement_timestamp(), command_request_id,
    case when requested_update_private_note then resolved_note else null end,
    case when requested_update_private_note then resolved_classification else null end,
    case when requested_update_private_note then resolved_note_updated_at else null end
  )
  on conflict on constraint dog_friendliness_ratings_member_place_key do update set
    welcome_score = excluded.welcome_score,
    clarity_score = excluded.clarity_score,
    comfort_score = excluded.comfort_score,
    thoughtfulness_score = excluded.thoughtfulness_score,
    rated_at = case
      when event_kind = 'note_updated' then dog_friendliness_ratings.rated_at
      else excluded.rated_at
    end,
    last_request_id = excluded.last_request_id,
    private_note = case
      when requested_update_private_note then excluded.private_note
      else dog_friendliness_ratings.private_note
    end,
    private_note_classification = case
      when requested_update_private_note then excluded.private_note_classification
      else dog_friendliness_ratings.private_note_classification
    end,
    private_note_updated_at = case
      when requested_update_private_note then excluded.private_note_updated_at
      else dog_friendliness_ratings.private_note_updated_at
    end
  returning * into result;

  insert into private.dog_friendliness_rating_events (
    member_id, place_id, event_kind, welcome_score, clarity_score, comfort_score,
    thoughtfulness_score, actor_id, request_id, private_note, private_note_classification
  ) values (
    submitting_member_id, requested_place_id, event_kind, requested_welcome_score,
    requested_clarity_score, requested_comfort_score, requested_thoughtfulness_score,
    submitting_member_id, command_request_id, result.private_note, result.private_note_classification
  )
  on conflict on constraint dog_friendliness_rating_events_member_place_request_key do nothing;

  return query select
    result.id, result.place_id, result.welcome_score, result.clarity_score, result.comfort_score,
    result.thoughtfulness_score, result.rated_at, (result.excluded_at is not null), result.private_note,
    result.private_note_classification, result.private_note_updated_at, result.linked_report_id;
end;
$$;

drop function if exists public.get_my_dog_friendliness_rating(uuid);

create function public.get_my_dog_friendliness_rating(requested_place_id uuid)
returns table (
  id uuid,
  place_id uuid,
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
    rating.thoughtfulness_score, rating.rated_at, (rating.excluded_at is not null), rating.private_note,
    rating.private_note_classification, rating.private_note_updated_at, rating.linked_report_id
  from private.dog_friendliness_ratings as rating
  where rating.member_id = actor_id and rating.place_id = requested_place_id;
end;
$$;

-- Explicit Report creation from a qualifying note. Composes the existing correction-and-report
-- submit_place_report RPC directly (same transaction and session, so its own abuse policy,
-- merge-window, and idempotency all apply unmodified) rather than re-implementing Report
-- submission. The Member's note becomes the Report's explanation; no new place_flags target
-- vocabulary is introduced, so the linked Report always
-- targets place_field/description as a stable general-purpose anchor.
create function public.create_report_from_rating_note(
  requested_place_id uuid,
  command_request_id uuid
)
returns table (flag_id uuid, status text, submitted_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  rating_record private.dog_friendliness_ratings%rowtype;
  payload jsonb;
  report_reason_value text;
  is_safety boolean;
  new_flag_id uuid;
  new_status text;
  new_submitted_at timestamptz;
  existing_status text;
  existing_submitted_at timestamptz;
begin
  if requested_place_id is null or command_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'Report-from-note identifiers are required';
  end if;

  select rating.*
  into rating_record
  from private.dog_friendliness_ratings as rating
  where rating.member_id = actor_id and rating.place_id = requested_place_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'A Rating was not found';
  end if;

  if rating_record.private_note is null
    or rating_record.private_note_classification not in ('inaccurate_info', 'safety_concern')
  then
    raise exception using
      errcode = '22023',
      message = 'A qualifying Private Rating Note is required to create a linked Report';
  end if;

  -- At most one linked Report per Rating: idempotent replay of the same command returns the
  -- existing link; a genuinely new attempt after one already exists is rejected. A Member with a
  -- separate, new concern can still use the always-available, untouched correction-and-report /report page.
  if rating_record.linked_report_id is not null then
    if rating_record.linked_report_request_id = command_request_id then
      select flag.status::text, flag.submitted_at
      into existing_status, existing_submitted_at
      from private.place_flags as flag
      where flag.id = rating_record.linked_report_id;

      return query select rating_record.linked_report_id, existing_status, existing_submitted_at;
      return;
    end if;
    raise exception using
      errcode = '55006',
      message = 'A linked Report already exists for this Rating';
  end if;

  is_safety := rating_record.private_note_classification = 'safety_concern';
  report_reason_value := case when is_safety then 'unsafe' else 'inaccurate' end;

  -- Built entirely server-side from the Rating's own note; never trusts client-supplied evidence
  -- or target. evidence.source_citation is a fixed descriptive label rather than a second copy of
  -- the note text, so the sensitive free text is stored in exactly one place (explanation).
  payload := jsonb_build_object(
    'place_id', rating_record.place_id::text,
    'target_kind', 'place_field',
    'target_field', 'description',
    'access_condition_id', null,
    'explanation', rating_record.private_note,
    'evidence', jsonb_build_object(
      'kind', 'member_report',
      'source_url', null,
      'source_citation', 'Private Rating Note',
      'source_label', 'Private Rating Note',
      'observed_at', to_char(rating_record.rated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'source_metadata', '{}'::jsonb
    ),
    'report_reason', report_reason_value,
    'is_safety_concern', is_safety,
    'successor_place_id', null
  );

  select report.flag_id, report.status, report.submitted_at
  into new_flag_id, new_status, new_submitted_at
  from public.submit_place_report(payload, command_request_id) as report;

  update private.dog_friendliness_ratings
  set linked_report_id = new_flag_id, linked_report_request_id = command_request_id
  where id = rating_record.id;

  update private.place_flags
  set source_rating_id = rating_record.id
  where id = new_flag_id;

  insert into private.dog_friendliness_rating_events (
    member_id, place_id, event_kind, welcome_score, clarity_score, comfort_score,
    thoughtfulness_score, actor_id, request_id, private_note, private_note_classification
  ) values (
    actor_id, requested_place_id, 'report_linked', rating_record.welcome_score,
    rating_record.clarity_score, rating_record.comfort_score, rating_record.thoughtfulness_score,
    actor_id, command_request_id, rating_record.private_note, rating_record.private_note_classification
  )
  on conflict on constraint dog_friendliness_rating_events_member_place_request_key do nothing;

  return query select new_flag_id, new_status, new_submitted_at;
end;
$$;

-- Moderator read/decision surface --------------------------------------------------------------

drop function if exists public.list_moderation_dog_friendliness_ratings(uuid);

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
  excluded_reason text,
  private_note text,
  private_note_classification text,
  private_note_updated_at timestamptz,
  linked_report_id uuid
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
    rating.excluded_reason, rating.private_note, rating.private_note_classification,
    rating.private_note_updated_at, rating.linked_report_id
  from private.dog_friendliness_ratings as rating
  where rating.place_id = requested_place_id
  order by rating.rated_at desc;
end;
$$;

create function public.list_moderation_dog_friendliness_rating_note_history(
  requested_member_id uuid,
  requested_place_id uuid
)
returns table (
  event_kind text,
  private_note text,
  private_note_classification text,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
begin
  if requested_member_id is null or requested_place_id is null then
    raise exception using
      errcode = '22023',
      message = 'Rating note history identifiers are required';
  end if;

  return query
  select event.event_kind, event.private_note, event.private_note_classification, event.occurred_at
  from private.dog_friendliness_rating_events as event
  where event.member_id = requested_member_id
    and event.place_id = requested_place_id
    and event.event_kind in ('submitted', 'updated', 'note_updated', 'report_linked')
  order by event.occurred_at desc;
end;
$$;

create function public.record_rating_note_disposition(
  requested_member_id uuid,
  requested_place_id uuid,
  disposition_kind text,
  notes text,
  command_request_id uuid
)
returns table (id uuid, occurred_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  rating_record private.dog_friendliness_ratings%rowtype;
  existing_id uuid;
  existing_occurred_at timestamptz;
  new_id uuid;
  new_occurred_at timestamptz;
begin
  if requested_member_id is null or requested_place_id is null or command_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'Rating note disposition identifiers are required';
  end if;

  if disposition_kind is null
    or disposition_kind <> all (array['escalated', 'feedback_use_permitted', 'feedback_use_denied']::text[])
  then
    raise exception using errcode = '22023', message = 'Rating note disposition kind is invalid';
  end if;

  if nullif(btrim(notes), '') is null then
    raise exception using errcode = '22023', message = 'Disposition notes are required';
  end if;

  select rating.*
  into rating_record
  from private.dog_friendliness_ratings as rating
  where rating.member_id = requested_member_id and rating.place_id = requested_place_id;

  if not found or rating_record.private_note is null then
    raise exception using errcode = '22023', message = 'A noted Rating was not found';
  end if;

  select disposition.id, disposition.occurred_at
  into existing_id, existing_occurred_at
  from private.rating_note_dispositions as disposition
  where disposition.member_id = requested_member_id
    and disposition.place_id = requested_place_id
    and disposition.request_id = command_request_id;

  if found then
    return query select existing_id, existing_occurred_at;
    return;
  end if;

  insert into private.rating_note_dispositions as disposition (
    member_id, place_id, disposition_kind, notes, moderator_id, request_id
  ) values (
    requested_member_id, requested_place_id, disposition_kind, btrim(notes), actor_id, command_request_id
  )
  returning disposition.id, disposition.occurred_at into new_id, new_occurred_at;

  -- change_summary carries only identifiers and the disposition kind, never the Member's note
  -- text nor the Moderator's own reasoning, per the sensitive-content handling requirement.
  perform private.append_audit_event(
    'dog_friendliness.rating_note_' || disposition_kind,
    'dog_friendliness_rating',
    rating_record.id,
    command_request_id,
    jsonb_build_object(
      'member_id', requested_member_id, 'place_id', requested_place_id, 'disposition_kind', disposition_kind
    )
  );

  return query select new_id, new_occurred_at;
end;
$$;

create function public.list_moderation_rating_note_dispositions(
  requested_member_id uuid,
  requested_place_id uuid
)
returns table (
  id uuid,
  disposition_kind text,
  notes text,
  moderator_id uuid,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
begin
  if requested_member_id is null or requested_place_id is null then
    raise exception using
      errcode = '22023',
      message = 'Rating note disposition identifiers are required';
  end if;

  return query
  select
    disposition.id, disposition.disposition_kind, disposition.notes, disposition.moderator_id,
    disposition.occurred_at
  from private.rating_note_dispositions as disposition
  where disposition.member_id = requested_member_id and disposition.place_id = requested_place_id
  order by disposition.occurred_at desc;
end;
$$;

-- Grants and RLS-via-revoke ----------------------------------------------------------------------

revoke all on private.private_rating_note_policy from public, anon, authenticated, service_role;
revoke all on private.rating_note_dispositions from public, anon, authenticated, service_role;

revoke execute on function public.configure_private_rating_note_policy(text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.configure_private_rating_note_policy(text, integer, boolean)
  to service_role;

revoke execute on function public.get_private_rating_note_policy()
  from public, anon, service_role;
grant execute on function public.get_private_rating_note_policy()
  to authenticated;

revoke execute on function public.submit_dog_friendliness_rating(
  uuid, integer, integer, integer, integer, uuid, boolean, text, text
) from public, anon, service_role;
grant execute on function public.submit_dog_friendliness_rating(
  uuid, integer, integer, integer, integer, uuid, boolean, text, text
) to authenticated;

revoke execute on function public.get_my_dog_friendliness_rating(uuid)
  from public, anon, service_role;
grant execute on function public.get_my_dog_friendliness_rating(uuid)
  to authenticated;

revoke execute on function public.create_report_from_rating_note(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.create_report_from_rating_note(uuid, uuid)
  to authenticated;

revoke execute on function public.list_moderation_dog_friendliness_ratings(uuid)
  from public, anon, service_role;
grant execute on function public.list_moderation_dog_friendliness_ratings(uuid)
  to authenticated;

revoke execute on function public.list_moderation_dog_friendliness_rating_note_history(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.list_moderation_dog_friendliness_rating_note_history(uuid, uuid)
  to authenticated;

revoke execute on function public.record_rating_note_disposition(uuid, uuid, text, text, uuid)
  from public, anon, service_role;
grant execute on function public.record_rating_note_disposition(uuid, uuid, text, text, uuid)
  to authenticated;

revoke execute on function public.list_moderation_rating_note_dispositions(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.list_moderation_rating_note_dispositions(uuid, uuid)
  to authenticated;

comment on table private.private_rating_note_policy is
  'Fail-closed singleton policy for the Private Rating Note low-score trigger (private-rating-note). No row means disabled.';
comment on table private.rating_note_dispositions is
  'Append-only Moderator escalation/feedback-use decision log for Private Rating Notes.';
comment on column private.dog_friendliness_ratings.private_note is
  'Never public. Visible only to Moderators through security.require_moderator()-gated RPCs.';
comment on function public.submit_dog_friendliness_rating(
  uuid, integer, integer, integer, integer, uuid, boolean, text, text
) is
  'Idempotently upserts the authenticated Member current Rating for a discoverable Place, optionally attaching a Private Rating Note gated by the low-score policy. Never clears a Moderator exclusion.';
comment on function public.create_report_from_rating_note(uuid, uuid) is
  'Explicit, Member-initiated creation of a Report from a qualifying Private Rating Note, composing submit_place_report and linking both rows.';
comment on function public.record_rating_note_disposition(uuid, uuid, text, text, uuid) is
  'Moderator-only, auditable escalation or feedback-use decision for a Private Rating Note.';

commit;
