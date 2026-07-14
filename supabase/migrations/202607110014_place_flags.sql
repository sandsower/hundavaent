begin;

create type private.place_flag_kind as enum ('correction', 'report');

create type private.place_flag_status as enum (
  'submitted',
  'needs_information',
  'applied',
  'confirmed_useful',
  'dispute_opened',
  'place_inactivated',
  'rejected'
);

create type private.place_flag_target_kind as enum ('place_field', 'access_condition');

create type private.place_field as enum (
  'name',
  'description',
  'website_url',
  'phone',
  'opening_hours',
  'dog_amenities'
);

create type private.report_reason as enum (
  'inaccurate',
  'unsafe',
  'misleading',
  'obsolete',
  'closed',
  'moved',
  'successor_place'
);

create table private.place_flag_abuse_policy (
  singleton boolean primary key default true check (singleton),
  policy_version text not null check (btrim(policy_version) <> ''),
  submission_window interval not null check (submission_window > interval '0 seconds'),
  maximum_submissions integer not null check (maximum_submissions > 0),
  maximum_open integer not null check (maximum_open > 0),
  merge_window interval not null check (merge_window > interval '0 seconds'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table private.place_flags (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  kind private.place_flag_kind not null,
  place_id uuid not null references private.places(id) on delete restrict,
  target_kind private.place_flag_target_kind not null,
  target_field private.place_field,
  access_condition_id uuid references private.access_conditions(id) on delete restrict,
  current_value_snapshot jsonb not null check (jsonb_typeof(current_value_snapshot) = 'object'),
  proposed_value jsonb check (proposed_value is null or jsonb_typeof(proposed_value) = 'object'),
  report_reason private.report_reason,
  is_safety_concern boolean not null default false,
  successor_place_id uuid references private.places(id) on delete restrict,
  explanation text not null check (btrim(explanation) <> ''),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  status private.place_flag_status not null default 'submitted',
  applied_access_condition_id uuid references private.access_conditions(id) on delete restrict,
  dispute_id uuid references private.access_disputes(id) on delete restrict,
  transition_id uuid references private.place_identity_transitions(id) on delete restrict,
  request_id uuid not null,
  resolution_request_id uuid,
  submitted_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (member_id, request_id),
  constraint place_flag_target_shape check (
    (target_kind = 'place_field' and target_field is not null and access_condition_id is null)
    or (target_kind = 'access_condition' and access_condition_id is not null and target_field is null)
  ),
  constraint place_flag_kind_shape check (
    (
      kind = 'correction' and proposed_value is not null and report_reason is null
      and not is_safety_concern and successor_place_id is null
    )
    or (kind = 'report' and proposed_value is null and report_reason is not null)
  ),
  constraint place_flag_successor_shape check (
    successor_place_id is null or report_reason = 'successor_place'
  ),
  constraint place_flag_successor_not_self check (
    successor_place_id is distinct from place_id
  ),
  constraint place_flag_resolution_shape check (
    (status in ('submitted', 'needs_information') and resolved_at is null)
    or (
      status in ('applied', 'confirmed_useful', 'dispute_opened', 'place_inactivated', 'rejected')
      and resolved_at is not null
    )
  ),
  constraint place_flag_applied_shape check (
    (
      status = 'applied' and target_kind = 'access_condition' and applied_access_condition_id is not null
    )
    or (
      not (status = 'applied' and target_kind = 'access_condition')
      and applied_access_condition_id is null
    )
  ),
  constraint place_flag_dispute_shape check (
    (status = 'dispute_opened') = (dispute_id is not null)
  ),
  constraint place_flag_transition_shape check (
    (status = 'place_inactivated') = (transition_id is not null)
  ),
  constraint place_flag_outcome_kind_shape check (
    (status = 'applied' and kind = 'correction')
    or (status = 'confirmed_useful' and kind = 'report')
    or status not in ('applied', 'confirmed_useful')
  ),
  constraint place_flag_outcome_target_shape check (
    (status = 'dispute_opened' and target_kind = 'access_condition') or status <> 'dispute_opened'
  )
);

create index place_flags_member_time_idx
  on private.place_flags (member_id, submitted_at desc);

create index place_flags_queue_idx
  on private.place_flags (status, submitted_at);

create index place_flags_claim_idx
  on private.place_flags (place_id, target_kind, target_field, access_condition_id, submitted_at desc);

create index place_flags_member_claim_open_idx
  on private.place_flags (member_id, place_id, kind, target_kind, target_field, access_condition_id)
  where status in ('submitted', 'needs_information');

create table private.place_flag_status_events (
  id uuid primary key default extensions.gen_random_uuid(),
  flag_id uuid not null references private.place_flags(id) on delete restrict,
  status private.place_flag_status not null,
  member_reason_is text,
  member_reason_en text,
  private_note text,
  moderator_id uuid references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  constraint place_flag_member_reasons_together check (
    (member_reason_is is null and member_reason_en is null)
    or (
      nullif(btrim(member_reason_is), '') is not null
      and nullif(btrim(member_reason_en), '') is not null
    )
  ),
  constraint place_flag_event_actor_check check (
    (status = 'submitted' and moderator_id is null)
    or (status <> 'submitted' and moderator_id is not null)
  )
);

create unique index place_flag_status_events_one_terminal_idx
  on private.place_flag_status_events (flag_id)
  where status in ('applied', 'confirmed_useful', 'dispute_opened', 'place_inactivated', 'rejected');

create index place_flag_status_events_history_idx
  on private.place_flag_status_events (flag_id, occurred_at desc);

create function private.reject_place_flag_status_event_mutation()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'Correction and Report status history is append-only';
end;
$$;

create trigger place_flag_status_events_reject_row_mutation
before update or delete on private.place_flag_status_events
for each row execute function private.reject_place_flag_status_event_mutation();

create trigger place_flag_status_events_reject_truncate
before truncate on private.place_flag_status_events
for each statement execute function private.reject_place_flag_status_event_mutation();

-- Contributions become polymorphic over their originating Suggestion or Correction/Report so
-- both accepted Suggestions and applied Corrections / confirmed-useful Reports share one
-- Contribution ledger instead of two competing implementations.
alter table private.contributions alter column suggestion_id drop not null;
alter table private.contributions add column place_flag_id uuid
  references private.place_flags(id) on delete restrict;
create unique index contributions_place_flag_unique
  on private.contributions (place_flag_id)
  where place_flag_id is not null;
alter table private.contributions drop constraint contributions_kind_check;
alter table private.contributions add constraint contributions_kind_check check (
  kind in ('accepted_suggestion', 'applied_correction', 'confirmed_report')
);
alter table private.contributions add constraint contributions_source_shape check (
  (suggestion_id is not null and place_flag_id is null)
  or (suggestion_id is null and place_flag_id is not null)
);
alter table private.contributions add constraint contributions_kind_source_shape check (
  (kind = 'accepted_suggestion' and suggestion_id is not null)
  or (kind = 'applied_correction' and place_flag_id is not null)
  or (kind = 'confirmed_report' and place_flag_id is not null)
);

alter table private.place_flag_abuse_policy enable row level security;
alter table private.place_flags enable row level security;
alter table private.place_flag_status_events enable row level security;

-- Reused validation helpers ---------------------------------------------------------------

create function private.snapshot_place_field(
  requested_place_id uuid,
  requested_field private.place_field
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  place_record private.places%rowtype;
  name_is text;
  name_en text;
  description_is text;
  description_en text;
begin
  select place.* into place_record
  from private.places place
  where place.id = requested_place_id and place.lifecycle = 'published';

  if not found then
    return null;
  end if;

  case requested_field
    when 'name' then
      select
        max(translation.name) filter (where translation.locale = 'is'),
        max(translation.name) filter (where translation.locale = 'en')
      into name_is, name_en
      from private.place_translations translation
      where translation.place_id = place_record.id;
      if name_is is null or name_en is null then return null; end if;
      return jsonb_build_object('is', name_is, 'en', name_en);
    when 'description' then
      select
        max(translation.description) filter (where translation.locale = 'is'),
        max(translation.description) filter (where translation.locale = 'en')
      into description_is, description_en
      from private.place_translations translation
      where translation.place_id = place_record.id;
      if description_is is null or description_en is null then return null; end if;
      return jsonb_build_object('is', description_is, 'en', description_en);
    when 'website_url' then
      return jsonb_build_object('value', place_record.website_url);
    when 'phone' then
      return jsonb_build_object('value', place_record.phone);
    when 'opening_hours' then
      return jsonb_build_object('value', place_record.opening_hours);
    when 'dog_amenities' then
      return jsonb_build_object('value', place_record.dog_amenities);
    else
      return null;
  end case;
end;
$$;

create function private.snapshot_access_condition(
  requested_condition_id uuid,
  requested_place_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'access_area', condition.access_area,
    'access_area_note', condition.access_area_note,
    'restraint_condition', condition.restraint_condition,
    'restraint_note', condition.restraint_note,
    'dog_eligibility', condition.dog_eligibility,
    'availability_window', condition.availability_window,
    'permission_requirement', condition.permission_requirement
  )
  from private.access_conditions condition
  join private.verifications verification
    on verification.access_condition_id = condition.id and verification.superseded_at is null
  where condition.id = requested_condition_id
    and condition.place_id = requested_place_id
    and condition.superseded_at is null
    and verification.status = 'verified';
$$;

create function private.validate_place_flag_evidence(evidence jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if evidence is null
    or jsonb_typeof(evidence) <> 'object'
    or not private.jsonb_has_only_keys(
      evidence,
      array['kind', 'source_url', 'source_citation', 'source_label', 'observed_at', 'source_metadata']
    )
    or jsonb_typeof(evidence -> 'kind') is distinct from 'string'
    or jsonb_typeof(evidence -> 'source_label') is distinct from 'string'
    or jsonb_typeof(evidence -> 'observed_at') is distinct from 'string'
    or (
      evidence -> 'source_url' is not null
      and jsonb_typeof(evidence -> 'source_url') not in ('string', 'null')
    )
    or (
      evidence -> 'source_citation' is not null
      and jsonb_typeof(evidence -> 'source_citation') not in ('string', 'null')
    )
    or (
      evidence -> 'source_metadata' is not null
      and jsonb_typeof(evidence -> 'source_metadata') <> 'object'
    )
  then
    raise exception using errcode = '22023', message = 'Evidence structured fields are invalid';
  end if;

  if nullif(btrim(evidence ->> 'kind'), '')
      <> all (
        array['official_website','venue_representative','member_report','direct_observation','public_record','other']::text[]
      )
    or nullif(btrim(evidence ->> 'source_label'), '') is null
    or (
      nullif(btrim(evidence ->> 'source_url'), '') is null
      and nullif(btrim(evidence ->> 'source_citation'), '') is null
    )
    or (
      nullif(btrim(evidence ->> 'source_url'), '') is not null
      and evidence ->> 'source_url' !~* '^https?://[^[:space:]]+$'
    )
  then
    raise exception using errcode = '22023', message = 'Evidence source is invalid';
  end if;

  perform (evidence ->> 'observed_at')::timestamptz;
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'Evidence structured fields are invalid';
end;
$$;

create function private.validate_place_field_value(
  requested_field private.place_field,
  value jsonb
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if value is null or jsonb_typeof(value) <> 'object' then
    raise exception using errcode = '22023', message = 'Correction value is invalid';
  end if;

  case requested_field
    when 'name', 'description' then
      if not private.jsonb_has_only_keys(value, array['is', 'en'])
        or nullif(btrim(value ->> 'is'), '') is null
        or nullif(btrim(value ->> 'en'), '') is null
      then
        raise exception using errcode = '22023', message = 'Correction value is invalid';
      end if;
    when 'website_url' then
      if not private.jsonb_has_only_keys(value, array['value'])
        or (
          value -> 'value' is not null
          and jsonb_typeof(value -> 'value') not in ('string', 'null')
        )
        or (
          jsonb_typeof(value -> 'value') = 'string'
          and value ->> 'value' !~ '^https?://\S+$'
        )
      then
        raise exception using errcode = '22023', message = 'Correction value is invalid';
      end if;
    when 'phone' then
      if not private.jsonb_has_only_keys(value, array['value'])
        or (
          value -> 'value' is not null
          and jsonb_typeof(value -> 'value') not in ('string', 'null')
        )
        or (
          jsonb_typeof(value -> 'value') = 'string'
          and nullif(btrim(value ->> 'value'), '') is null
        )
      then
        raise exception using errcode = '22023', message = 'Correction value is invalid';
      end if;
    when 'opening_hours' then
      if not private.jsonb_has_only_keys(value, array['value'])
        or jsonb_typeof(coalesce(value -> 'value', '{}'::jsonb)) <> 'object'
      then
        raise exception using errcode = '22023', message = 'Correction value is invalid';
      end if;
    when 'dog_amenities' then
      if not private.jsonb_has_only_keys(value, array['value'])
        or not private.jsonb_is_string_array(coalesce(value -> 'value', '[]'::jsonb))
      then
        raise exception using errcode = '22023', message = 'Correction value is invalid';
      end if;
  end case;
end;
$$;

create function private.validate_access_condition_value(value jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  access_area_value text;
  restraint_value text;
  permission_value text;
begin
  if value is null or jsonb_typeof(value) <> 'object'
    or not private.jsonb_has_only_keys(
      value,
      array[
        'access_area', 'access_area_note', 'restraint_condition', 'restraint_note',
        'dog_eligibility', 'availability_window', 'permission_requirement'
      ]
    )
    or jsonb_typeof(value -> 'access_area') is distinct from 'string'
    or jsonb_typeof(value -> 'restraint_condition') is distinct from 'string'
    or jsonb_typeof(value -> 'permission_requirement') is distinct from 'string'
    or jsonb_typeof(value -> 'dog_eligibility') is distinct from 'object'
    or jsonb_typeof(value -> 'availability_window') is distinct from 'object'
    or (
      value -> 'access_area_note' is not null
      and jsonb_typeof(value -> 'access_area_note') not in ('string', 'null')
    )
    or (
      value -> 'restraint_note' is not null
      and jsonb_typeof(value -> 'restraint_note') not in ('string', 'null')
    )
  then
    raise exception using errcode = '22023', message = 'Access Condition value is invalid';
  end if;

  access_area_value := nullif(btrim(value ->> 'access_area'), '');
  restraint_value := nullif(btrim(value ->> 'restraint_condition'), '');
  permission_value := nullif(btrim(value ->> 'permission_requirement'), '');

  if access_area_value is null
    or access_area_value <> all (array['indoors','outdoors','designated_area','other_bounded']::text[])
    or restraint_value is null
    or restraint_value
      <> all (array['leash_required','off_leash_permitted','carrier_required','other_sourced']::text[])
    or permission_value is null
    or permission_value <> all (array['standing_permission','ask_on_arrival','advance_approval']::text[])
    or coalesce(value -> 'dog_eligibility', '{}'::jsonb) <> '{"scope":"all_dogs"}'::jsonb
    or not private.jsonb_has_only_keys(
      coalesce(value -> 'availability_window', '{}'::jsonb),
      array['days', 'startsAt', 'endsAt', 'startsOn', 'endsOn', 'notes']
    )
    or (
      value #> '{availability_window,days}' is not null
      and not private.jsonb_is_weekday_array(value #> '{availability_window,days}')
    )
    or (
      value #>> '{availability_window,startsAt}' is not null
      and value #>> '{availability_window,startsAt}' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
    )
    or (
      value #>> '{availability_window,endsAt}' is not null
      and value #>> '{availability_window,endsAt}' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
    )
    or (
      value #>> '{availability_window,startsOn}' is not null
      and not private.is_iso_date(value #>> '{availability_window,startsOn}')
    )
    or (
      value #>> '{availability_window,endsOn}' is not null
      and not private.is_iso_date(value #>> '{availability_window,endsOn}')
    )
    or (
      access_area_value = 'other_bounded'
      and nullif(btrim(value ->> 'access_area_note'), '') is null
    )
    or (
      restraint_value = 'other_sourced'
      and nullif(btrim(value ->> 'restraint_note'), '') is null
    )
  then
    raise exception using errcode = '22023', message = 'Access Condition value is invalid';
  end if;
end;
$$;

create function private.validate_place_flag_command(
  requested_kind private.place_flag_kind,
  command_payload jsonb
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  target_kind_value text;
  target_field_value text;
begin
  if command_payload is null or jsonb_typeof(command_payload) <> 'object'
    or jsonb_typeof(command_payload -> 'place_id') is distinct from 'string'
    or jsonb_typeof(command_payload -> 'target_kind') is distinct from 'string'
    or jsonb_typeof(command_payload -> 'explanation') is distinct from 'string'
    or jsonb_typeof(command_payload -> 'evidence') is distinct from 'object'
  then
    raise exception using errcode = '22023', message = 'Correction or Report command is incomplete';
  end if;

  if nullif(btrim(command_payload ->> 'explanation'), '') is null then
    raise exception using errcode = '22023', message = 'A private explanation is required';
  end if;

  perform private.validate_place_flag_evidence(command_payload -> 'evidence');

  target_kind_value := command_payload ->> 'target_kind';
  if target_kind_value = 'place_field' then
    target_field_value := command_payload ->> 'target_field';
    if target_field_value
      <> all (array['name','description','website_url','phone','opening_hours','dog_amenities']::text[])
      or command_payload ->> 'access_condition_id' is not null
    then
      raise exception using errcode = '22023', message = 'Correction or Report target is invalid';
    end if;
  elsif target_kind_value = 'access_condition' then
    if jsonb_typeof(command_payload -> 'access_condition_id') is distinct from 'string'
      or command_payload ->> 'target_field' is not null
    then
      raise exception using errcode = '22023', message = 'Correction or Report target is invalid';
    end if;
    perform (command_payload ->> 'access_condition_id')::uuid;
  else
    raise exception using errcode = '22023', message = 'Correction or Report target is invalid';
  end if;

  perform (command_payload ->> 'place_id')::uuid;

  if requested_kind = 'correction' then
    if jsonb_typeof(command_payload -> 'proposed_value') is distinct from 'object' then
      raise exception using errcode = '22023', message = 'A proposed Correction value is required';
    end if;
    if target_kind_value = 'place_field' then
      perform private.validate_place_field_value(
        (command_payload ->> 'target_field')::private.place_field,
        command_payload -> 'proposed_value'
      );
    else
      perform private.validate_access_condition_value(command_payload -> 'proposed_value');
    end if;
  else
    if jsonb_typeof(command_payload -> 'report_reason') is distinct from 'string'
      or nullif(btrim(command_payload ->> 'report_reason'), '')
        <> all (
          array['inaccurate','unsafe','misleading','obsolete','closed','moved','successor_place']::text[]
        )
      or jsonb_typeof(coalesce(command_payload -> 'is_safety_concern', 'false'::jsonb)) <> 'boolean'
      or (
        command_payload -> 'successor_place_id' is not null
        and jsonb_typeof(command_payload -> 'successor_place_id') not in ('string', 'null')
      )
      or (
        command_payload ->> 'successor_place_id' is not null
        and command_payload ->> 'report_reason' <> 'successor_place'
      )
    then
      raise exception using errcode = '22023', message = 'Report structured fields are invalid';
    end if;
    if nullif(btrim(command_payload ->> 'successor_place_id'), '') is not null then
      perform (command_payload ->> 'successor_place_id')::uuid;
    end if;
  end if;
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'Correction or Report command is invalid';
end;
$$;

create function private.create_place_flag(
  requested_kind private.place_flag_kind,
  command_payload jsonb,
  actor_id uuid,
  command_request_id uuid
)
returns table (flag_id uuid, status text, submitted_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  policy_record private.place_flag_abuse_policy%rowtype;
  existing_record private.place_flags%rowtype;
  merged_record private.place_flags%rowtype;
  created_record private.place_flags%rowtype;
  target_kind_value private.place_flag_target_kind := (command_payload ->> 'target_kind')::private.place_flag_target_kind;
  target_field_value private.place_field := nullif(command_payload ->> 'target_field', '')::private.place_field;
  requested_place_id uuid := (command_payload ->> 'place_id')::uuid;
  requested_condition_id uuid := nullif(command_payload ->> 'access_condition_id', '')::uuid;
  snapshot jsonb;
begin
  if command_request_id is null or actor_id is null then
    raise exception using errcode = '22023', message = 'Correction or Report command is invalid';
  end if;

  -- Mirrors the per-Member advisory lock ordering used by Suggestion submission so concurrent
  -- same-Member submissions serialize instead of racing past the idempotency lookup.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('place-flag:' || actor_id::text, 0)
  );

  select flag.* into existing_record
  from private.place_flags flag
  where flag.member_id = actor_id and flag.request_id = command_request_id;

  if found then
    return query select existing_record.id, existing_record.status::text, existing_record.submitted_at;
    return;
  end if;

  select policy.* into policy_record
  from private.place_flag_abuse_policy policy
  where policy.singleton and policy.enabled;

  if not found then
    raise exception using errcode = '55000', message = 'Correction and Report abuse policy is not configured';
  end if;

  if (
    select count(*)
    from private.place_flags recent
    where recent.member_id = actor_id
      and recent.status in ('submitted', 'needs_information')
  ) >= policy_record.maximum_open then
    raise exception using errcode = '54000', message = 'Too many open Corrections and Reports';
  end if;

  if (
    select count(*)
    from private.place_flags recent
    where recent.member_id = actor_id
      and recent.submitted_at > statement_timestamp() - policy_record.submission_window
  ) >= policy_record.maximum_submissions then
    raise exception using errcode = '54000', message = 'Correction and Report rate limit reached';
  end if;

  -- A repeated same-Member, same-claim submission inside the merge window joins the existing
  -- open item instead of creating a duplicate-flood row.
  select flag.* into merged_record
  from private.place_flags flag
  where flag.member_id = actor_id
    and flag.place_id = requested_place_id
    and flag.kind = requested_kind
    and flag.target_kind = target_kind_value
    and flag.target_field is not distinct from target_field_value
    and flag.access_condition_id is not distinct from requested_condition_id
    and flag.status in ('submitted', 'needs_information')
    and flag.submitted_at > statement_timestamp() - policy_record.merge_window
  order by flag.submitted_at desc
  limit 1;

  if found then
    return query select merged_record.id, merged_record.status::text, merged_record.submitted_at;
    return;
  end if;

  if target_kind_value = 'place_field' then
    snapshot := private.snapshot_place_field(requested_place_id, target_field_value);
  else
    snapshot := private.snapshot_access_condition(requested_condition_id, requested_place_id);
  end if;

  if snapshot is null then
    raise exception using errcode = '22023', message = 'Correction or Report target was not found';
  end if;

  insert into private.place_flags (
    member_id, kind, place_id, target_kind, target_field, access_condition_id,
    current_value_snapshot, proposed_value, report_reason, is_safety_concern,
    successor_place_id, explanation, evidence, request_id
  ) values (
    actor_id, requested_kind, requested_place_id, target_kind_value, target_field_value,
    requested_condition_id, snapshot,
    case when requested_kind = 'correction' then command_payload -> 'proposed_value' else null end,
    case when requested_kind = 'report'
      then (command_payload ->> 'report_reason')::private.report_reason
      else null
    end,
    coalesce((command_payload ->> 'is_safety_concern')::boolean, false) and requested_kind = 'report',
    nullif(command_payload ->> 'successor_place_id', '')::uuid,
    btrim(command_payload ->> 'explanation'),
    command_payload -> 'evidence',
    command_request_id
  ) returning * into created_record;

  insert into private.place_flag_status_events (flag_id, status)
  values (created_record.id, 'submitted');

  return query select created_record.id, created_record.status::text, created_record.submitted_at;
end;
$$;

-- Public commands ---------------------------------------------------------------------------

create function public.configure_place_flag_abuse_policy(
  requested_policy_version text,
  requested_submission_window_seconds integer,
  requested_maximum_submissions integer,
  requested_maximum_open integer,
  requested_merge_window_seconds integer,
  requested_enabled boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(requested_policy_version), '') is null
    or requested_submission_window_seconds <= 0
    or requested_maximum_submissions <= 0
    or requested_maximum_open <= 0
    or requested_merge_window_seconds <= 0
  then
    raise exception using errcode = '22023', message = 'Correction and Report abuse policy is invalid';
  end if;

  insert into private.place_flag_abuse_policy (
    singleton, policy_version, submission_window, maximum_submissions, maximum_open,
    merge_window, enabled, updated_at
  ) values (
    true, btrim(requested_policy_version), make_interval(secs => requested_submission_window_seconds),
    requested_maximum_submissions, requested_maximum_open,
    make_interval(secs => requested_merge_window_seconds), requested_enabled, statement_timestamp()
  )
  on conflict (singleton) do update set
    policy_version = excluded.policy_version,
    submission_window = excluded.submission_window,
    maximum_submissions = excluded.maximum_submissions,
    maximum_open = excluded.maximum_open,
    merge_window = excluded.merge_window,
    enabled = excluded.enabled,
    updated_at = excluded.updated_at;
end;
$$;

create function public.submit_place_correction(
  command_payload jsonb,
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
begin
  perform private.validate_place_flag_command('correction'::private.place_flag_kind, command_payload);
  return query select * from private.create_place_flag(
    'correction'::private.place_flag_kind, command_payload, actor_id, command_request_id
  );
end;
$$;

create function public.submit_place_report(
  command_payload jsonb,
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
begin
  perform private.validate_place_flag_command('report'::private.place_flag_kind, command_payload);
  return query select * from private.create_place_flag(
    'report'::private.place_flag_kind, command_payload, actor_id, command_request_id
  );
end;
$$;

create function public.list_my_place_flags(
  cursor_submitted_at timestamptz default null,
  cursor_flag_id uuid default null,
  requested_limit integer default 20
)
returns table (
  flag_id uuid,
  kind text,
  status text,
  place_name_is text,
  place_name_en text,
  target_kind text,
  target_field text,
  report_reason text,
  member_reason_is text,
  member_reason_en text,
  submitted_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  page_size integer := least(greatest(coalesce(requested_limit, 20), 1), 51);
begin
  if (cursor_submitted_at is null) <> (cursor_flag_id is null) then
    raise exception using errcode = '22023', message = 'Correction and Report history cursor is invalid';
  end if;

  return query
  select
    flag.id,
    flag.kind::text,
    flag.status::text,
    translations.name_is,
    translations.name_en,
    flag.target_kind::text,
    flag.target_field::text,
    flag.report_reason::text,
    latest.member_reason_is,
    latest.member_reason_en,
    flag.submitted_at,
    flag.updated_at
  from private.place_flags flag
  cross join lateral (
    select
      max(translation.name) filter (where translation.locale = 'is') as name_is,
      max(translation.name) filter (where translation.locale = 'en') as name_en
    from private.place_translations translation
    where translation.place_id = flag.place_id
  ) as translations
  left join lateral (
    select event.member_reason_is, event.member_reason_en
    from private.place_flag_status_events event
    where event.flag_id = flag.id and event.member_reason_is is not null
    order by event.occurred_at desc, event.id desc
    limit 1
  ) as latest on true
  where flag.member_id = actor_id
    and (
      cursor_submitted_at is null
      or (flag.submitted_at, flag.id) < (cursor_submitted_at, cursor_flag_id)
    )
  order by flag.submitted_at desc, flag.id desc
  limit page_size;
end;
$$;

create function public.list_moderation_place_flags(
  cursor_priority integer default null,
  cursor_submitted_at timestamptz default null,
  cursor_flag_id uuid default null,
  requested_limit integer default 20
)
returns table (
  flag_id uuid,
  member_id uuid,
  kind text,
  status text,
  place_id uuid,
  place_name_is text,
  place_name_en text,
  target_kind text,
  target_field text,
  access_condition_id uuid,
  report_reason text,
  is_safety_concern boolean,
  submitted_at timestamptz,
  updated_at timestamptz,
  priority integer
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
  if (cursor_priority is null or cursor_submitted_at is null or cursor_flag_id is null)
    and not (cursor_priority is null and cursor_submitted_at is null and cursor_flag_id is null)
  then
    raise exception using errcode = '22023', message = 'Correction and Report queue cursor is invalid';
  end if;

  return query
  select queue.*
  from (
    select
      flag.id,
      flag.member_id,
      flag.kind::text,
      flag.status::text,
      flag.place_id,
      translations.name_is,
      translations.name_en,
      flag.target_kind::text,
      flag.target_field::text,
      flag.access_condition_id,
      flag.report_reason::text,
      flag.is_safety_concern,
      flag.submitted_at,
      flag.updated_at,
      case
        when flag.is_safety_concern and flag.status in ('submitted', 'needs_information') then 0
        when flag.status in ('submitted', 'needs_information') then 1
        else 2
      end
    from private.place_flags flag
    cross join lateral (
      select
        max(translation.name) filter (where translation.locale = 'is') as name_is,
        max(translation.name) filter (where translation.locale = 'en') as name_en
      from private.place_translations translation
      where translation.place_id = flag.place_id
    ) as translations
  ) as queue (
    flag_id, member_id, kind, status, place_id, place_name_is, place_name_en, target_kind,
    target_field, access_condition_id, report_reason, is_safety_concern, submitted_at, updated_at,
    priority
  )
  where cursor_priority is null
    or (queue.priority, queue.submitted_at, queue.flag_id) > (cursor_priority, cursor_submitted_at, cursor_flag_id)
  order by queue.priority, queue.submitted_at, queue.flag_id
  limit page_size;
end;
$$;

create function public.get_moderation_place_flag(requested_flag_id uuid)
returns table (
  flag_id uuid,
  member_id uuid,
  kind text,
  status text,
  place_id uuid,
  place_name_is text,
  place_name_en text,
  target_kind text,
  target_field text,
  access_condition_id uuid,
  current_value_snapshot jsonb,
  current_live_value jsonb,
  current_place_version bigint,
  current_verification_id uuid,
  proposed_value jsonb,
  report_reason text,
  is_safety_concern boolean,
  successor_place_id uuid,
  explanation text,
  evidence jsonb,
  private_note text,
  applied_access_condition_id uuid,
  dispute_id uuid,
  transition_id uuid,
  contribution_id uuid,
  submitted_at timestamptz,
  updated_at timestamptz
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
    flag.id,
    flag.member_id,
    flag.kind::text,
    flag.status::text,
    flag.place_id,
    translations.name_is,
    translations.name_en,
    flag.target_kind::text,
    flag.target_field::text,
    flag.access_condition_id,
    flag.current_value_snapshot,
    case
      when flag.target_kind = 'place_field'
        then private.snapshot_place_field(flag.place_id, flag.target_field)
      else private.snapshot_access_condition(flag.access_condition_id, flag.place_id)
    end,
    place_record.version,
    verification_record.id,
    flag.proposed_value,
    flag.report_reason::text,
    flag.is_safety_concern,
    flag.successor_place_id,
    flag.explanation,
    flag.evidence,
    latest.private_note,
    flag.applied_access_condition_id,
    flag.dispute_id,
    flag.transition_id,
    contribution.id,
    flag.submitted_at,
    flag.updated_at
  from private.place_flags flag
  left join private.places place_record on place_record.id = flag.place_id
  left join private.verifications verification_record
    on verification_record.access_condition_id = flag.access_condition_id
    and verification_record.superseded_at is null
  cross join lateral (
    select
      max(translation.name) filter (where translation.locale = 'is') as name_is,
      max(translation.name) filter (where translation.locale = 'en') as name_en
    from private.place_translations translation
    where translation.place_id = flag.place_id
  ) as translations
  left join lateral (
    select event.private_note
    from private.place_flag_status_events event
    where event.flag_id = flag.id and event.private_note is not null
    order by event.occurred_at desc, event.id desc
    limit 1
  ) as latest on true
  left join private.contributions contribution on contribution.place_flag_id = flag.id
  where flag.id = requested_flag_id;
end;
$$;

create function public.list_related_place_flags(requested_flag_id uuid)
returns table (
  flag_id uuid,
  kind text,
  status text,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  origin private.place_flags%rowtype;
begin
  perform security.require_moderator();
  select flag.* into origin from private.place_flags flag where flag.id = requested_flag_id;
  if not found then
    raise exception using errcode = '22023', message = 'Correction or Report was not found';
  end if;

  return query
  select flag.id, flag.kind::text, flag.status::text, flag.submitted_at
  from private.place_flags flag
  where flag.id <> requested_flag_id
    and flag.place_id = origin.place_id
    and flag.target_kind = origin.target_kind
    and flag.target_field is not distinct from origin.target_field
    and flag.access_condition_id is not distinct from origin.access_condition_id
  order by flag.submitted_at desc
  limit 25;
end;
$$;

create function public.resolve_place_flag(
  requested_flag_id uuid,
  requested_outcome text,
  member_reason_is text,
  member_reason_en text,
  private_note text,
  application_payload jsonb,
  dispute_command jsonb,
  transition_command jsonb,
  command_request_id uuid
)
returns table (
  flag_id uuid,
  status text,
  applied_access_condition_id uuid,
  dispute_id uuid,
  transition_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  flag_record private.place_flags%rowtype;
  place_row private.places%rowtype;
  condition_row private.access_conditions%rowtype;
  verification_row private.verifications%rowtype;
  new_condition_id uuid;
  new_verification_id uuid;
  new_evidence_id uuid;
  result_dispute_id uuid;
  result_transition_id uuid;
  occurred_at timestamptz := statement_timestamp();
begin
  if requested_flag_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Resolution identifiers are required';
  end if;

  if requested_outcome <> all (
    array['needs_information','applied','confirmed_useful','dispute_opened','place_inactivated','rejected']::text[]
  ) then
    raise exception using errcode = '22023', message = 'Resolution outcome is invalid';
  end if;

  if nullif(btrim(member_reason_is), '') is null or nullif(btrim(member_reason_en), '') is null then
    raise exception using errcode = '22023', message = 'Bilingual Member-safe outcome reason is required';
  end if;

  select flag.* into flag_record
  from private.place_flags flag
  where flag.id = requested_flag_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Correction or Report was not found';
  end if;

  if flag_record.status::text = requested_outcome and flag_record.resolution_request_id = command_request_id then
    return query select flag_record.id, flag_record.status::text, flag_record.applied_access_condition_id,
      flag_record.dispute_id, flag_record.transition_id;
    return;
  end if;

  if flag_record.status in ('applied', 'confirmed_useful', 'dispute_opened', 'place_inactivated', 'rejected') then
    raise exception using errcode = '55006', message = 'Correction or Report outcome is final';
  end if;

  if requested_outcome = 'applied' and flag_record.kind <> 'correction' then
    raise exception using errcode = '22023', message = 'Only a Correction can be applied';
  end if;
  if requested_outcome = 'confirmed_useful' and flag_record.kind <> 'report' then
    raise exception using errcode = '22023', message = 'Only a Report can be confirmed useful';
  end if;
  if requested_outcome = 'dispute_opened' and flag_record.target_kind <> 'access_condition' then
    raise exception using errcode = '22023', message = 'A dispute requires an Access Condition target';
  end if;

  if requested_outcome = 'applied' then
    if flag_record.target_kind = 'place_field' then
      if application_payload is null
        or jsonb_typeof(application_payload -> 'field_value') is distinct from 'object'
        or (application_payload ->> 'expected_version') is null
      then
        raise exception using errcode = '22023', message = 'Application command is incomplete';
      end if;
      perform private.validate_place_field_value(flag_record.target_field, application_payload -> 'field_value');

      select place.* into place_row from private.places place where place.id = flag_record.place_id for update;
      if not found
        or place_row.version <> (application_payload ->> 'expected_version')::bigint
        or place_row.lifecycle <> 'published'
      then
        raise exception using errcode = '40001', message = 'Place state changed';
      end if;

      if flag_record.target_field = 'name' then
        update private.place_translations
        set name = case locale
          when 'is'::private.locale_code then btrim(application_payload #>> '{field_value,is}')
          else btrim(application_payload #>> '{field_value,en}') end,
          updated_at = occurred_at
        where place_id = place_row.id;
      elsif flag_record.target_field = 'description' then
        update private.place_translations
        set description = case locale
          when 'is'::private.locale_code then btrim(application_payload #>> '{field_value,is}')
          else btrim(application_payload #>> '{field_value,en}') end,
          updated_at = occurred_at
        where place_id = place_row.id;
      elsif flag_record.target_field = 'website_url' then
        update private.places
        set website_url = nullif(btrim(application_payload #>> '{field_value,value}'), '')
        where id = place_row.id;
      elsif flag_record.target_field = 'phone' then
        update private.places
        set phone = nullif(btrim(application_payload #>> '{field_value,value}'), '')
        where id = place_row.id;
      elsif flag_record.target_field = 'opening_hours' then
        update private.places
        set opening_hours = coalesce(application_payload #> '{field_value,value}', '{}'::jsonb)
        where id = place_row.id;
      elsif flag_record.target_field = 'dog_amenities' then
        update private.places
        set dog_amenities = coalesce(application_payload #> '{field_value,value}', '[]'::jsonb)
        where id = place_row.id;
      end if;

      update private.places set version = version + 1, updated_at = occurred_at where id = place_row.id;

      perform private.append_audit_event(
        'place.corrected', 'place', place_row.id, command_request_id,
        jsonb_build_object('field', flag_record.target_field, 'flag_id', flag_record.id, 'version', place_row.version + 1)
      );
    else
      if application_payload is null
        or jsonb_typeof(application_payload -> 'replacement_condition') is distinct from 'object'
        or jsonb_typeof(application_payload -> 'evidence') is distinct from 'object'
        or (application_payload ->> 'expected_verification_id') is null
        or (application_payload ->> 'verified_at') is null
        or (application_payload ->> 'freshness_until') is null
      then
        raise exception using errcode = '22023', message = 'Application command is incomplete';
      end if;
      perform private.validate_access_condition_value(application_payload -> 'replacement_condition');
      perform private.validate_place_flag_evidence(application_payload -> 'evidence');
      if (application_payload ->> 'freshness_until')::timestamptz <= (application_payload ->> 'verified_at')::timestamptz then
        raise exception using errcode = '22023', message = 'Freshness boundary must follow Verification';
      end if;

      select place.* into place_row from private.places place where place.id = flag_record.place_id for update;
      if not found or place_row.lifecycle <> 'published' then
        raise exception using errcode = '40001', message = 'Owning Place is not published';
      end if;

      select condition.* into condition_row
      from private.access_conditions condition
      where condition.id = flag_record.access_condition_id and condition.place_id = place_row.id
      for update;
      if not found or condition_row.superseded_at is not null then
        raise exception using errcode = '40001', message = 'Access Condition state changed';
      end if;

      select verification.* into verification_row
      from private.verifications verification
      where verification.access_condition_id = condition_row.id and verification.superseded_at is null
      for update;
      if not found
        or verification_row.id <> (application_payload ->> 'expected_verification_id')::uuid
        or verification_row.status <> 'verified'
      then
        raise exception using errcode = '40001', message = 'Verification state changed';
      end if;

      new_evidence_id := private.record_lifecycle_evidence(place_row.id, application_payload -> 'evidence', actor_id);

      update private.verifications set superseded_at = occurred_at where id = verification_row.id;
      update private.access_conditions set superseded_at = occurred_at where id = condition_row.id;

      insert into private.access_conditions (
        place_id, revision, supersedes_condition_id, access_area, access_area_note,
        restraint_condition, restraint_note, dog_eligibility, availability_window,
        permission_requirement, created_by, created_at
      ) values (
        condition_row.place_id, condition_row.revision + 1, condition_row.id,
        (application_payload #>> '{replacement_condition,access_area}')::private.access_area,
        nullif(btrim(application_payload #>> '{replacement_condition,access_area_note}'), ''),
        (application_payload #>> '{replacement_condition,restraint_condition}')::private.restraint_condition,
        nullif(btrim(application_payload #>> '{replacement_condition,restraint_note}'), ''),
        coalesce(application_payload #> '{replacement_condition,dog_eligibility}', '{"scope":"all_dogs"}'::jsonb),
        coalesce(application_payload #> '{replacement_condition,availability_window}', '{}'::jsonb),
        (application_payload #>> '{replacement_condition,permission_requirement}')::private.permission_requirement,
        actor_id, occurred_at
      ) returning id into new_condition_id;

      insert into private.verifications (
        access_condition_id, status, verified_by, verified_at, freshness_until, decision_metadata,
        command_request_id
      ) values (
        new_condition_id, 'verified', actor_id, (application_payload ->> 'verified_at')::timestamptz,
        (application_payload ->> 'freshness_until')::timestamptz,
        jsonb_build_object('flag_id', flag_record.id), command_request_id
      ) returning id into new_verification_id;

      insert into private.verification_evidence (verification_id, evidence_id)
      values (new_verification_id, new_evidence_id);

      perform private.append_audit_event(
        'access.corrected', 'access_condition', new_condition_id, command_request_id,
        jsonb_build_object(
          'flag_id', flag_record.id, 'displaced_condition_id', condition_row.id,
          'verification_id', new_verification_id, 'evidence_id', new_evidence_id
        )
      );
    end if;
  elsif requested_outcome = 'dispute_opened' then
    if dispute_command is null
      or nullif(btrim(dispute_command ->> 'reason'), '') is null
      or jsonb_typeof(dispute_command -> 'evidence') is distinct from 'object'
      or (dispute_command ->> 'expected_verification_id') is null
    then
      raise exception using errcode = '22023', message = 'Dispute command is incomplete';
    end if;
    select dispute.dispute_id into result_dispute_id
    from public.open_access_dispute(
      jsonb_build_object(
        'access_condition_id', flag_record.access_condition_id,
        'expected_verification_id', dispute_command ->> 'expected_verification_id',
        'reason', btrim(dispute_command ->> 'reason'),
        'opened_at', occurred_at,
        'evidence', dispute_command -> 'evidence'
      ),
      command_request_id
    ) as dispute (dispute_id, disputed_verification_id, opened_at);
  elsif requested_outcome = 'place_inactivated' then
    if transition_command is null
      or nullif(btrim(transition_command ->> 'decision_notes'), '') is null
      or (transition_command ->> 'expected_version') is null
    then
      raise exception using errcode = '22023', message = 'Inactivation command is incomplete';
    end if;
    select transition.transition_id into result_transition_id
    from public.transition_place_identity(
      jsonb_build_object(
        'place_id', flag_record.place_id,
        'expected_version', (transition_command ->> 'expected_version')::bigint,
        'kind', 'inactive',
        'decided_at', occurred_at,
        'decision_notes', btrim(transition_command ->> 'decision_notes')
      ),
      command_request_id
    ) as transition (transition_id, predecessor_place_id, successor_place_id, transition_kind, predecessor_version);
  end if;

  update private.place_flags
  set
    status = requested_outcome::private.place_flag_status,
    applied_access_condition_id = new_condition_id,
    dispute_id = result_dispute_id,
    transition_id = result_transition_id,
    resolution_request_id = command_request_id,
    resolved_at = case when requested_outcome = 'needs_information' then null else occurred_at end,
    updated_at = occurred_at
  where id = requested_flag_id;

  insert into private.place_flag_status_events (
    flag_id, status, member_reason_is, member_reason_en, private_note, moderator_id
  ) values (
    requested_flag_id, requested_outcome::private.place_flag_status, btrim(member_reason_is),
    btrim(member_reason_en), nullif(btrim(private_note), ''), actor_id
  );

  perform private.append_audit_event(
    'place_flag.' || requested_outcome, 'place_flag', requested_flag_id, command_request_id,
    jsonb_strip_nulls(jsonb_build_object(
      'previous_status', flag_record.status::text,
      'status', requested_outcome,
      'applied_access_condition_id', new_condition_id,
      'dispute_id', result_dispute_id,
      'transition_id', result_transition_id
    ))
  );

  return query select requested_flag_id, requested_outcome, new_condition_id, result_dispute_id, result_transition_id;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Resolution command is invalid';
end;
$$;

create function public.confirm_place_flag_contribution(
  requested_flag_id uuid,
  command_request_id uuid
)
returns table (contribution_id uuid, confirmed_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  flag_record private.place_flags%rowtype;
  contribution_record private.contributions%rowtype;
begin
  if requested_flag_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Contribution confirmation identifiers are required';
  end if;

  select flag.* into flag_record
  from private.place_flags flag
  where flag.id = requested_flag_id
  for update;

  if not found or flag_record.status not in ('applied', 'confirmed_useful') then
    raise exception using errcode = '22023', message = 'Only an applied Correction or confirmed-useful Report can create a Contribution';
  end if;

  select contribution.* into contribution_record
  from private.contributions contribution
  where contribution.place_flag_id = requested_flag_id;

  if found then
    return query select contribution_record.id, contribution_record.confirmed_at;
    return;
  end if;

  insert into private.contributions (
    place_flag_id, member_id, confirmed_by, confirmation_request_id, kind, subject_place_id
  )
  values (
    requested_flag_id, flag_record.member_id, actor_id, command_request_id,
    case flag_record.kind when 'correction' then 'applied_correction' else 'confirmed_report' end,
    flag_record.place_id
  )
  returning * into contribution_record;

  perform private.append_audit_event(
    'place_flag.contribution_confirmed', 'place_flag', requested_flag_id, command_request_id,
    jsonb_build_object('contribution_id', contribution_record.id)
  );

  return query select contribution_record.id, contribution_record.confirmed_at;
end;
$$;

revoke all on private.place_flag_abuse_policy from public, anon, authenticated, service_role;
revoke all on private.place_flags from public, anon, authenticated, service_role;
revoke all on private.place_flag_status_events from public, anon, authenticated, service_role;

revoke execute on function private.snapshot_place_field(uuid, private.place_field)
  from public, anon, authenticated, service_role;
revoke execute on function private.snapshot_access_condition(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.validate_place_flag_evidence(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.validate_place_field_value(private.place_field, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.validate_access_condition_value(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.validate_place_flag_command(private.place_flag_kind, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.create_place_flag(private.place_flag_kind, jsonb, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.reject_place_flag_status_event_mutation()
  from public, anon, authenticated, service_role;

revoke execute on function public.configure_place_flag_abuse_policy(text, integer, integer, integer, integer, boolean)
  from public, anon, authenticated;
revoke execute on function public.submit_place_correction(jsonb, uuid) from public, anon, service_role;
revoke execute on function public.submit_place_report(jsonb, uuid) from public, anon, service_role;
revoke execute on function public.list_my_place_flags(timestamptz, uuid, integer) from public, anon, service_role;
revoke execute on function public.list_moderation_place_flags(integer, timestamptz, uuid, integer)
  from public, anon, service_role;
revoke execute on function public.get_moderation_place_flag(uuid) from public, anon, service_role;
revoke execute on function public.list_related_place_flags(uuid) from public, anon, service_role;
revoke execute on function public.resolve_place_flag(uuid, text, text, text, text, jsonb, jsonb, jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.confirm_place_flag_contribution(uuid, uuid) from public, anon, service_role;

grant execute on function public.submit_place_correction(jsonb, uuid) to authenticated;
grant execute on function public.submit_place_report(jsonb, uuid) to authenticated;
grant execute on function public.list_my_place_flags(timestamptz, uuid, integer) to authenticated;
grant execute on function public.list_moderation_place_flags(integer, timestamptz, uuid, integer) to authenticated;
grant execute on function public.get_moderation_place_flag(uuid) to authenticated;
grant execute on function public.list_related_place_flags(uuid) to authenticated;
grant execute on function public.resolve_place_flag(uuid, text, text, text, text, jsonb, jsonb, jsonb, uuid)
  to authenticated;
grant execute on function public.confirm_place_flag_contribution(uuid, uuid) to authenticated;
grant execute on function public.configure_place_flag_abuse_policy(text, integer, integer, integer, integer, boolean)
  to service_role;

comment on table private.place_flags is
  'Caller-private Corrections (proposed change) and Reports (investigation signal) against a specific Place field or Access Condition. Sensitive Evidence and reporter identity never leave Moderator-gated projections.';
comment on table private.place_flag_abuse_policy is
  'Explicit configurable Correction/Report abuse boundary (pending cap, window cap, merge window). No enabled row means production submission fails closed pending correction-abuse.';
comment on function public.configure_place_flag_abuse_policy(text, integer, integer, integer, integer, boolean) is
  'Service-role-only configuration boundary. Production values remain undefined until correction-abuse is approved.';
comment on function public.resolve_place_flag(uuid, text, text, text, text, jsonb, jsonb, jsonb, uuid) is
  'Resolves a Correction or Report through one atomic outcome, composing the existing freshness-and-identity dispute and identity-transition commands rather than duplicating them.';
comment on function public.confirm_place_flag_contribution(uuid, uuid) is
  'Idempotently confirms Contribution credit only after an applied Correction or a confirmed-useful Report.';

commit;
