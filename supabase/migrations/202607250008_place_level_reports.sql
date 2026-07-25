-- 1. The place-level flag target ---------------------------------------------------------------
--
-- Postgres refuses to use an enum value in the transaction that added it, so the addition commits
-- on its own before anything below names it. This is the same two-transaction shape
-- 202607100001 used to add 'other_bounded' and 'other_sourced'.

begin;

alter type private.place_flag_target_kind add value if not exists 'place';

commit;

begin;

-- 2. Let a flag address the whole Place -------------------------------------------------------
--
-- place_flag_target_shape forced every flag onto a field or a Condition, so a Member saying "this
-- place is closed" had to first pick a fact the claim is not about. A check constraint cannot be
-- widened in place, so it is dropped and re-added; the re-add revalidates every existing row, and
-- since the new arm only adds a permitted shape no row can fail it.

alter table private.place_flags drop constraint place_flag_target_shape;

alter table private.place_flags add constraint place_flag_target_shape check (
  (target_kind = 'place_field' and target_field is not null and access_condition_id is null)
  or (target_kind = 'access_condition' and access_condition_id is not null and target_field is null)
  or (target_kind = 'place' and target_field is null and access_condition_id is null)
);

-- A Correction proposes a replacement value for one fact, and the whole Place has no single value
-- to replace. Place-level claims are Reports; the constraint says so rather than leaving the apply
-- path to discover it.

alter table private.place_flags drop constraint place_flag_kind_shape;

alter table private.place_flags add constraint place_flag_kind_shape check (
  (
    kind = 'correction' and target_kind <> 'place' and proposed_value is not null
    and report_reason is null and not is_safety_concern and successor_place_id is null
  )
  or (kind = 'report' and proposed_value is null and report_reason is not null)
);

-- 3. The place-level snapshot ------------------------------------------------------------------
--
-- Every flag records what it was raised against, because a Moderator reads the item long after the
-- Place may have moved on. The field and Condition snapshots have carried that since
-- 202607110014; this is the third, and it holds what identifies a Place at report time: its name
-- in both locales, its category and the locality it sat in.

create function private.snapshot_place(requested_place_id uuid)
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
  place_locality text;
begin
  select place.* into place_record
  from private.places place
  where place.id = requested_place_id and place.lifecycle = 'published';

  if not found then
    return null;
  end if;

  select
    max(translation.name) filter (where translation.locale = 'is'),
    max(translation.name) filter (where translation.locale = 'en')
  into name_is, name_en
  from private.place_translations translation
  where translation.place_id = place_record.id;

  if name_is is null or name_en is null then
    return null;
  end if;

  select location.locality into place_locality
  from private.locations location
  where location.id = place_record.location_id;

  if place_locality is null then
    return null;
  end if;

  return jsonb_build_object(
    'name', jsonb_build_object('is', name_is, 'en', name_en),
    'category', place_record.category::text,
    'locality', place_locality
  );
end;
$$;

revoke execute on function private.snapshot_place(uuid)
  from public, anon, authenticated, service_role;

comment on function private.snapshot_place(uuid) is
  'What identified a Place at the moment a place-level Report was raised: its name in both locales, its category and its locality.';

-- 4. Target validation learns the place case ---------------------------------------------------
--
-- Recreated whole rather than patched, because plpgsql resolves names in nested SQL at call time
-- and a partially rewritten body applies clean while every caller fails. Everything outside the
-- new 'place' arm and the Correction guard is the 202607110014 definition verbatim.

create or replace function private.validate_place_flag_command(
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
  elsif target_kind_value = 'place' then
    -- The whole Place carries no field and no Condition. Refused here with 22023 rather than left
    -- to place_flag_target_shape, which reaches a caller as a check violation.
    if command_payload ->> 'target_field' is not null
      or command_payload ->> 'access_condition_id' is not null
    then
      raise exception using errcode = '22023', message = 'Correction or Report target is invalid';
    end if;
  else
    raise exception using errcode = '22023', message = 'Correction or Report target is invalid';
  end if;

  perform (command_payload ->> 'place_id')::uuid;

  if requested_kind = 'correction' then
    -- A Correction proposes a replacement value for one fact, and the whole Place has no single
    -- value to replace. place_flag_kind_shape holds the same rule at the table.
    if target_kind_value = 'place' then
      raise exception using errcode = '22023', message = 'A Correction cannot target the whole Place';
    end if;
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

-- 5. Creation learns the place snapshot --------------------------------------------------------
--
-- Recreated whole for the same reason, from the 202607250002 definition. The only change is the
-- third snapshot branch; the merge predicate, the rate limits and the insert are untouched, and
-- the predicate already keys on report_reason, so a 'closed' Report and an 'unsafe' Report on the
-- same Place are two claims rather than one folded row.

create or replace function private.create_place_flag(
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
  requested_proposed_value jsonb := case
    when requested_kind = 'correction' then command_payload -> 'proposed_value'
    else null
  end;
  requested_report_reason private.report_reason := case
    when requested_kind = 'report' then (command_payload ->> 'report_reason')::private.report_reason
    else null
  end;
  requested_safety_concern boolean :=
    coalesce((command_payload ->> 'is_safety_concern')::boolean, false) and requested_kind = 'report';
  requested_successor_place_id uuid := nullif(command_payload ->> 'successor_place_id', '')::uuid;
  requested_explanation text := btrim(command_payload ->> 'explanation');
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

  -- A repeated same-Member submission inside the merge window joins the existing open item instead
  -- of creating a duplicate-flood row. Every field that defines *what is being claimed* takes part,
  -- so a revision creates its own item: what is proposed, and for a Report what it alleges. Keying
  -- on the target alone silently discarded a revised Correction, and with a fifteen minute window
  -- it would also have swallowed a Report escalated from inaccurate to unsafe.
  --
  -- `explanation` deliberately does not take part. Two submissions proposing the identical value on
  -- the identical target are the same claim however differently they are worded, and
  -- submit_trusted_verification_task depends on that: it detects a Trusted task colliding with an
  -- ordinary Correction by seeing its own submission fold into one.
  select flag.* into merged_record
  from private.place_flags flag
  where flag.member_id = actor_id
    and flag.place_id = requested_place_id
    and flag.kind = requested_kind
    and flag.target_kind = target_kind_value
    and flag.target_field is not distinct from target_field_value
    and flag.access_condition_id is not distinct from requested_condition_id
    and flag.proposed_value is not distinct from requested_proposed_value
    and flag.report_reason is not distinct from requested_report_reason
    and flag.is_safety_concern = requested_safety_concern
    and flag.successor_place_id is not distinct from requested_successor_place_id
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
  elsif target_kind_value = 'access_condition' then
    snapshot := private.snapshot_access_condition(requested_condition_id, requested_place_id);
  else
    snapshot := private.snapshot_place(requested_place_id);
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
    requested_proposed_value,
    requested_report_reason,
    requested_safety_concern,
    requested_successor_place_id,
    requested_explanation,
    command_payload -> 'evidence',
    command_request_id
  ) returning * into created_record;

  insert into private.place_flag_status_events (flag_id, status)
  values (created_record.id, 'submitted');

  return query select created_record.id, created_record.status::text, created_record.submitted_at;
end;
$$;

commit;
