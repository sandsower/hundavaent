begin;

-- The apply path refuses the omitted-locale hatch --------------------------------------------
--
-- 202607250004 taught validate_place_field_value to accept a name or description Correction that
-- writes one locale and names the other in `needs_review`. That rule is right for a Member's
-- claim and wrong for what a Moderator applies: the apply path writes both locale rows from
-- `field_value`, so a payload carrying the flag has nothing to write for the locale it named.
--
-- Nothing made that refusal a stated rule. 202607250006 stopped the draft baseline from carrying
-- the flag forward, which closes the path a Moderator reaches by default, but a draft that writes
-- `needs_review` back into the application payload still arrives at validate_place_field_value,
-- which accepts it, and lands on the place_translations NOT NULL constraint. The claim is refused
-- by accident, with a message about the command rather than about the shape, and only because the
-- published columns happen to be non-nullable.
--
-- resolve_place_flag is therefore recreated verbatim with one guard added, immediately before the
-- value validator runs on a place-field application. Everything else in the body is byte for byte
-- what 202607150041 created.

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
) is 'Resolves a Correction or Report from its locked canonical draft envelope with strict optimistic concurrency. A place-field application carrying the omitted-locale flag is refused: the hatch is a Member claim, and applying it would publish a half-translated Place field.';

commit;
