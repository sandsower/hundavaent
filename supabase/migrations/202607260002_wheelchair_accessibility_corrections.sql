begin;

-- Wheelchair accessibility Corrections ----------------------------------------------------------
--
-- 202607260001 added `wheelchair_accessibility` to private.place_field. This migration teaches
-- the four functions that enumerate that vocabulary what the new field means:
--
-- * validate_place_flag_command names the field in its target list, which is what lets the
--   command past the gate at all. The body is byte for byte what 202607250008 created, plus the
--   one array entry.
-- * snapshot_place_field records the published state, as text, in the `value` envelope every
--   scalar field uses. Without a branch the CASE falls through to null and the submit path
--   refuses a claim the vocabulary now invites.
-- * validate_place_field_value accepts exactly the three definite states. `unknown` is not a
--   proposable fact: a Member who does not know proposes nothing, and a Moderator who wants the
--   explicit-unknown state has update_place_wheelchair_accessibility for it.
-- * resolve_place_flag applies the accepted value to private.places, inside the same
--   version-checked update every other place-field application rides. The body is byte for byte
--   what 202607250007 created, plus the one elsif.

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
      <> all (array[
        'name','description','website_url','phone','opening_hours','dog_amenities',
        'wheelchair_accessibility'
      ]::text[])
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

create or replace function private.snapshot_place_field(
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
    when 'wheelchair_accessibility' then
      return jsonb_build_object('value', place_record.wheelchair_accessibility::text);
    else
      return null;
  end case;
end;
$$;

create or replace function private.validate_place_field_value(
  requested_field private.place_field,
  value jsonb
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  flagged_locale text;
  written_locale text;
begin
  if value is null or jsonb_typeof(value) <> 'object' then
    raise exception using errcode = '22023', message = 'Correction value is invalid';
  end if;

  case requested_field
    when 'name', 'description' then
      if not private.jsonb_has_only_keys(value, array['is', 'en', 'needs_review']) then
        raise exception using errcode = '22023', message = 'Correction value is invalid';
      end if;

      if pg_catalog.jsonb_exists(value, 'needs_review') then
        flagged_locale := value ->> 'needs_review';
        if flagged_locale is null or flagged_locale <> all (array['is', 'en']::text[]) then
          raise exception using errcode = '22023', message = 'Correction value is invalid';
        end if;

        -- A flag naming a locale the value also writes is a contradiction, not a hatch.
        written_locale := case when flagged_locale = 'is' then 'en' else 'is' end;
        if pg_catalog.jsonb_exists(value, flagged_locale)
          or nullif(btrim(value ->> written_locale), '') is null
        then
          raise exception using errcode = '22023', message = 'Correction value is invalid';
        end if;
      elsif nullif(btrim(value ->> 'is'), '') is null
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
    when 'wheelchair_accessibility' then
      -- The three definite states only. `unknown` is the absence of a claim, not a claim, and a
      -- Correction is a claim; the Moderator command keeps the explicit-unknown hatch.
      if not private.jsonb_has_only_keys(value, array['value'])
        or jsonb_typeof(value -> 'value') is distinct from 'string'
        or (value ->> 'value') <> all (
          array['accessible', 'partially_accessible', 'not_accessible']::text[]
        )
      then
        raise exception using errcode = '22023', message = 'Correction value is invalid';
      end if;
  end case;
end;
$$;

comment on function private.validate_place_field_value(private.place_field, jsonb) is
  'Validates a Correction value per Place field. Name and description accept the omitted-locale hatch. Wheelchair accessibility accepts the three definite states; unknown is the Moderator command''s alone.';

create or replace function public.resolve_place_flag(
  requested_flag_id uuid,
  requested_outcome text,
  expected_item_version bigint,
  expected_draft_version bigint,
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
  current_draft_version bigint;
  effective_envelope jsonb;
  effective_application jsonb;
  effective_dispute jsonb;
  effective_transition jsonb;
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
  if requested_flag_id is null or command_request_id is null
    or expected_item_version is null or expected_item_version < 0
    or expected_draft_version is null or expected_draft_version < 0
  then
    raise exception using errcode = '22023', message = 'Resolution identifiers are required';
  end if;
  if requested_outcome <> all (
    array[
      'needs_information', 'applied', 'confirmed_useful', 'dispute_opened',
      'place_inactivated', 'rejected'
    ]::text[]
  ) then
    raise exception using errcode = '22023', message = 'Resolution outcome is invalid';
  end if;

  select flag.* into flag_record
  from private.place_flags flag
  where flag.id = requested_flag_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Correction or Report was not found';
  end if;

  if flag_record.resolution_request_id = command_request_id
    and flag_record.status::text = requested_outcome
  then
    return query select flag_record.id, flag_record.status::text,
      flag_record.applied_access_condition_id, flag_record.dispute_id, flag_record.transition_id;
    return;
  end if;

  if flag_record.version <> expected_item_version then
    raise exception using errcode = '40001', message = 'Moderation item changed';
  end if;

  select draft.current_version, draft.payload
  into current_draft_version, effective_envelope
  from private.moderation_drafts draft
  where draft.flag_id = requested_flag_id
  for update;
  current_draft_version := coalesce(current_draft_version, 0);
  effective_envelope := coalesce(
    effective_envelope,
    private.place_flag_resolution_baseline(requested_flag_id)
  );

  if current_draft_version <> expected_draft_version then
    raise exception using errcode = '40001', message = 'Moderation draft changed';
  end if;
  if flag_record.status in (
    'applied', 'confirmed_useful', 'dispute_opened', 'place_inactivated', 'rejected'
  ) then
    raise exception using errcode = '55006', message = 'Correction or Report outcome is final';
  end if;
  if application_payload is not null or dispute_command is not null or transition_command is not null then
    raise exception using errcode = '22023', message = 'Legacy inline moderation content is not accepted';
  end if;

  if requested_outcome in ('applied', 'confirmed_useful') then
    if (member_reason_is is null) <> (member_reason_en is null)
      or member_reason_is is not null and (
        nullif(btrim(member_reason_is), '') is null
        or nullif(btrim(member_reason_en), '') is null
      )
    then
      raise exception using errcode = '22023', message = 'Bilingual Member-safe outcome reasons must be paired';
    end if;
  elsif nullif(btrim(member_reason_is), '') is null
    or nullif(btrim(member_reason_en), '') is null
  then
    raise exception using errcode = '22023', message = 'Bilingual Member-safe outcome reason is required';
  end if;

  effective_application := effective_envelope -> 'application_payload';
  effective_dispute := effective_envelope -> 'dispute_command';
  effective_transition := effective_envelope -> 'transition_command';

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
      if effective_application is null
        or jsonb_typeof(effective_application -> 'field_value') is distinct from 'object'
        or (effective_application ->> 'expected_version') is null
      then
        raise exception using errcode = '22023', message = 'Application command is incomplete';
      end if;
      -- The omitted-locale hatch is a claim about the Member's own submission: "I read this
      -- card in one language and cannot write the other." It has no meaning on the apply path,
      -- where writing the missing locale is the Moderator work the draft exists for. A payload
      -- that still names an unwritten locale is refused here, by name, before the value
      -- validator is asked anything, because the validator's own rules accept a lone written
      -- locale beside the flag and would let the shape through.
      if pg_catalog.jsonb_exists(effective_application -> 'field_value', 'needs_review') then
        raise exception using errcode = '22023',
          message = 'Application command cannot carry an omitted-locale flag';
      end if;
      perform private.validate_place_field_value(
        flag_record.target_field, effective_application -> 'field_value'
      );

      select place.* into place_row
      from private.places place
      where place.id = flag_record.place_id
      for update;
      if not found
        or place_row.version <> (effective_application ->> 'expected_version')::bigint
        or place_row.lifecycle <> 'published'
      then
        raise exception using errcode = '40001', message = 'Place state changed';
      end if;

      if flag_record.target_field = 'name' then
        update private.place_translations
        set name = case locale
          when 'is'::private.locale_code then btrim(effective_application #>> '{field_value,is}')
          else btrim(effective_application #>> '{field_value,en}')
        end,
          updated_at = occurred_at
        where place_id = place_row.id;
      elsif flag_record.target_field = 'description' then
        update private.place_translations
        set description = case locale
          when 'is'::private.locale_code then btrim(effective_application #>> '{field_value,is}')
          else btrim(effective_application #>> '{field_value,en}')
        end,
          updated_at = occurred_at
        where place_id = place_row.id;
      elsif flag_record.target_field = 'website_url' then
        update private.places
        set website_url = nullif(btrim(effective_application #>> '{field_value,value}'), '')
        where id = place_row.id;
      elsif flag_record.target_field = 'phone' then
        update private.places
        set phone = nullif(btrim(effective_application #>> '{field_value,value}'), '')
        where id = place_row.id;
      elsif flag_record.target_field = 'opening_hours' then
        update private.places
        set opening_hours = coalesce(effective_application #> '{field_value,value}', '{}'::jsonb)
        where id = place_row.id;
      elsif flag_record.target_field = 'dog_amenities' then
        update private.places
        set dog_amenities = coalesce(effective_application #> '{field_value,value}', '[]'::jsonb)
        where id = place_row.id;
      elsif flag_record.target_field = 'wheelchair_accessibility' then
        update private.places
        set wheelchair_accessibility =
          (effective_application #>> '{field_value,value}')::private.wheelchair_accessibility
        where id = place_row.id;
      end if;

      update private.places
      set version = version + 1, updated_at = occurred_at
      where id = place_row.id;

      perform private.append_audit_event(
        'place.corrected', 'place', place_row.id, command_request_id,
        jsonb_build_object(
          'field', flag_record.target_field,
          'flag_id', flag_record.id,
          'version', place_row.version + 1
        )
      );
    else
      if effective_application is null
        or jsonb_typeof(effective_application -> 'replacement_condition') is distinct from 'object'
        or jsonb_typeof(effective_application -> 'evidence') is distinct from 'object'
        or (effective_application ->> 'expected_verification_id') is null
        or (effective_application ->> 'verified_at') is null
        or (effective_application ->> 'freshness_until') is null
      then
        raise exception using errcode = '22023', message = 'Application command is incomplete';
      end if;
      perform private.validate_access_condition_value(
        effective_application -> 'replacement_condition'
      );
      perform private.validate_place_flag_evidence(effective_application -> 'evidence');
      if (effective_application ->> 'freshness_until')::timestamptz
        <= (effective_application ->> 'verified_at')::timestamptz
      then
        raise exception using errcode = '22023', message = 'Freshness boundary must follow Verification';
      end if;

      select place.* into place_row
      from private.places place
      where place.id = flag_record.place_id
      for update;
      if not found or place_row.lifecycle <> 'published' then
        raise exception using errcode = '40001', message = 'Owning Place is not published';
      end if;

      select condition.* into condition_row
      from private.access_conditions condition
      where condition.id = flag_record.access_condition_id
        and condition.place_id = place_row.id
      for update;
      if not found or condition_row.superseded_at is not null then
        raise exception using errcode = '40001', message = 'Access Condition state changed';
      end if;

      select verification.* into verification_row
      from private.verifications verification
      where verification.access_condition_id = condition_row.id
        and verification.superseded_at is null
      for update;
      if not found
        or verification_row.id <> (effective_application ->> 'expected_verification_id')::uuid
        or verification_row.status <> 'verified'
      then
        raise exception using errcode = '40001', message = 'Verification state changed';
      end if;

      new_evidence_id := private.record_lifecycle_evidence(
        place_row.id, effective_application -> 'evidence', actor_id
      );
      update private.verifications set superseded_at = occurred_at where id = verification_row.id;
      update private.access_conditions set superseded_at = occurred_at where id = condition_row.id;

      insert into private.access_conditions (
        place_id, revision, supersedes_condition_id, access_area, access_area_note,
        restraint_condition, restraint_note, dog_eligibility, availability_state,
        availability_window, permission_requirement, created_by, created_at
      ) values (
        condition_row.place_id,
        condition_row.revision + 1,
        condition_row.id,
        (effective_application #>> '{replacement_condition,access_area}')::private.access_area,
        nullif(btrim(effective_application #>> '{replacement_condition,access_area_note}'), ''),
        (effective_application #>> '{replacement_condition,restraint_condition}')::private.restraint_condition,
        nullif(btrim(effective_application #>> '{replacement_condition,restraint_note}'), ''),
        coalesce(
          effective_application #> '{replacement_condition,dog_eligibility}',
          '{"scope":"all_dogs"}'::jsonb
        ),
        private.resolve_access_availability(effective_application -> 'replacement_condition'),
        coalesce(effective_application #> '{replacement_condition,availability_window}', '{}'::jsonb),
        (effective_application #>> '{replacement_condition,permission_requirement}')::private.permission_requirement,
        actor_id,
        occurred_at
      ) returning id into new_condition_id;

      insert into private.verifications (
        access_condition_id, status, verified_by, verified_at, freshness_until,
        decision_metadata, command_request_id
      ) values (
        new_condition_id,
        'verified',
        actor_id,
        (effective_application ->> 'verified_at')::timestamptz,
        (effective_application ->> 'freshness_until')::timestamptz,
        jsonb_build_object('flag_id', flag_record.id),
        command_request_id
      ) returning id into new_verification_id;

      insert into private.verification_evidence (verification_id, evidence_id)
      values (new_verification_id, new_evidence_id);

      perform private.append_audit_event(
        'access.corrected', 'access_condition', new_condition_id, command_request_id,
        jsonb_build_object(
          'flag_id', flag_record.id,
          'displaced_condition_id', condition_row.id,
          'verification_id', new_verification_id,
          'evidence_id', new_evidence_id
        )
      );
    end if;
  elsif requested_outcome = 'dispute_opened' then
    if effective_dispute is null
      or nullif(btrim(effective_dispute ->> 'reason'), '') is null
      or jsonb_typeof(effective_dispute -> 'evidence') is distinct from 'object'
      or (effective_dispute ->> 'expected_verification_id') is null
    then
      raise exception using errcode = '22023', message = 'Dispute command is incomplete';
    end if;
    select dispute.dispute_id into result_dispute_id
    from public.open_access_dispute(
      jsonb_build_object(
        'access_condition_id', flag_record.access_condition_id,
        'expected_verification_id', effective_dispute ->> 'expected_verification_id',
        'reason', btrim(effective_dispute ->> 'reason'),
        'opened_at', occurred_at,
        'evidence', effective_dispute -> 'evidence'
      ),
      command_request_id
    ) dispute(dispute_id, disputed_verification_id, opened_at);
  elsif requested_outcome = 'place_inactivated' then
    if effective_transition is null
      or nullif(btrim(effective_transition ->> 'decision_notes'), '') is null
      or (effective_transition ->> 'expected_version') is null
    then
      raise exception using errcode = '22023', message = 'Inactivation command is incomplete';
    end if;
    select transition.transition_id into result_transition_id
    from public.transition_place_identity(
      jsonb_build_object(
        'place_id', flag_record.place_id,
        'expected_version', (effective_transition ->> 'expected_version')::bigint,
        'kind', 'inactive',
        'decided_at', occurred_at,
        'decision_notes', btrim(effective_transition ->> 'decision_notes')
      ),
      command_request_id
    ) transition(
      transition_id, predecessor_place_id, successor_place_id,
      transition_kind, predecessor_version
    );
  end if;

  update private.place_flags
  set status = requested_outcome::private.place_flag_status,
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
    requested_flag_id,
    requested_outcome::private.place_flag_status,
    nullif(btrim(member_reason_is), ''),
    nullif(btrim(member_reason_en), ''),
    nullif(btrim(private_note), ''),
    actor_id
  );

  perform private.append_audit_event(
    'place_flag.' || requested_outcome,
    'place_flag',
    requested_flag_id,
    command_request_id,
    jsonb_strip_nulls(jsonb_build_object(
      'previous_status', flag_record.status::text,
      'status', requested_outcome,
      'applied_access_condition_id', new_condition_id,
      'dispute_id', result_dispute_id,
      'transition_id', result_transition_id,
      'draft_version', current_draft_version
    ))
  );

  return query select requested_flag_id, requested_outcome, new_condition_id,
    result_dispute_id, result_transition_id;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Resolution command is invalid';
end;
$$;

comment on function public.resolve_place_flag(
  uuid, text, bigint, bigint, text, text, text, jsonb, jsonb, jsonb, uuid
) is 'Resolves a Correction or Report from its locked canonical draft envelope with strict optimistic concurrency. A place-field application carrying the omitted-locale flag is refused, and an applied wheelchair-accessibility Correction writes the Place''s stated accessibility.';

commit;
