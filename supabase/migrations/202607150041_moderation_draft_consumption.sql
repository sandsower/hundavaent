begin;

create function private.jsonb_deep_merge(base_value jsonb, patch_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(base_value) = 'object' and jsonb_typeof(patch_value) = 'object' then (
      select jsonb_object_agg(
        coalesce(base_entry.key, patch_entry.key),
        case
          when base_entry.key is null then patch_entry.value
          when patch_entry.key is null then base_entry.value
          else private.jsonb_deep_merge(base_entry.value, patch_entry.value)
        end
      )
      from jsonb_each(base_value) base_entry
      full join jsonb_each(patch_value) patch_entry using (key)
    )
    else patch_value
  end;
$$;

revoke execute on function private.jsonb_deep_merge(jsonb, jsonb)
  from public, anon, authenticated, service_role;

create function private.place_flag_resolution_baseline(requested_flag_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  flag_record private.place_flags%rowtype;
  place_version bigint;
  verification_record private.verifications%rowtype;
  application_value jsonb;
  dispute_value jsonb;
  transition_value jsonb;
begin
  select flag.* into flag_record
  from private.place_flags flag
  where flag.id = requested_flag_id;

  if not found then
    raise exception using errcode = '22023', message = 'Correction or Report was not found';
  end if;

  select place.version into place_version
  from private.places place
  where place.id = flag_record.place_id;

  if flag_record.kind = 'correction' and flag_record.target_kind = 'place_field' then
    application_value := jsonb_build_object(
      'expected_version', place_version,
      'field_value', flag_record.proposed_value
    );
  elsif flag_record.kind = 'correction' and flag_record.target_kind = 'access_condition' then
    select verification.* into verification_record
    from private.verifications verification
    where verification.access_condition_id = flag_record.access_condition_id
      and verification.superseded_at is null;

    application_value := jsonb_build_object(
      'expected_verification_id', verification_record.id,
      'replacement_condition', flag_record.proposed_value,
      'evidence', flag_record.evidence,
      'verified_at', statement_timestamp(),
      'freshness_until', verification_record.freshness_until
    );
  end if;

  if flag_record.target_kind = 'access_condition' then
    if verification_record.id is null then
      select verification.* into verification_record
      from private.verifications verification
      where verification.access_condition_id = flag_record.access_condition_id
        and verification.superseded_at is null;
    end if;
    dispute_value := jsonb_build_object(
      'expected_verification_id', verification_record.id,
      'reason', flag_record.explanation,
      'evidence', flag_record.evidence
    );
  end if;

  transition_value := jsonb_build_object(
    'expected_version', place_version,
    'decision_notes', flag_record.explanation
  );

  return jsonb_build_object(
    'application_payload', application_value,
    'dispute_command', dispute_value,
    'transition_command', transition_value
  );
end;
$$;

revoke execute on function private.place_flag_resolution_baseline(uuid)
  from public, anon, authenticated, service_role;

drop function public.save_place_suggestion_moderation_draft(uuid, bigint, bigint, text, jsonb, uuid);

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
  current_payload jsonb;
  complete_payload jsonb;
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
  if requested_section_id not in (
    'identity', 'location', 'translations', 'hours-and-amenities',
    'access-condition', 'evidence', 'proposal'
  ) then
    raise exception using errcode = '22023', message = 'Suggestion draft section is invalid';
  end if;

  select draft.payload into current_payload
  from private.moderation_drafts draft
  where draft.suggestion_id = requested_suggestion_id
  for update;

  complete_payload := case
    when requested_section_id = 'proposal' then requested_payload
    else private.jsonb_deep_merge(
      coalesce(current_payload, suggestion_record.proposal),
      requested_payload
    )
  end;
  perform private.validate_place_suggestion(complete_payload);

  return query select * from private.save_moderation_draft(
    'place_suggestion', requested_suggestion_id, expected_draft_version,
    requested_section_id, complete_payload, command_request_id, actor_id
  );
end;
$$;

drop function public.save_place_flag_moderation_draft(uuid, bigint, bigint, text, jsonb, uuid);

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
  current_payload jsonb;
  complete_payload jsonb;
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
  if requested_section_id not in (
    'application', 'dispute', 'transition', 'resolution', 'proposed-change'
  ) then
    raise exception using errcode = '22023', message = 'Correction or Report draft section is invalid';
  end if;
  if jsonb_typeof(requested_payload) is distinct from 'object'
    or exists (
      select 1 from jsonb_object_keys(requested_payload) key
      where key not in ('application_payload', 'dispute_command', 'transition_command')
    )
  then
    raise exception using errcode = '22023', message = 'Correction or Report draft is invalid';
  end if;

  select draft.payload into current_payload
  from private.moderation_drafts draft
  where draft.flag_id = requested_flag_id
  for update;

  complete_payload := case
    when requested_section_id = 'resolution' then requested_payload
    else private.jsonb_deep_merge(
      coalesce(current_payload, private.place_flag_resolution_baseline(requested_flag_id)),
      requested_payload
    )
  end;

  if exists (
      select 1 from jsonb_object_keys(complete_payload) key
      where key not in ('application_payload', 'dispute_command', 'transition_command')
    )
    or exists (
      select 1
      from jsonb_each(complete_payload) entry
      where entry.value <> 'null'::jsonb and jsonb_typeof(entry.value) <> 'object'
    )
  then
    raise exception using errcode = '22023', message = 'Correction or Report draft is invalid';
  end if;

  return query select * from private.save_moderation_draft(
    'place_flag', requested_flag_id, expected_draft_version,
    requested_section_id, complete_payload, command_request_id, actor_id
  );
end;
$$;

drop function public.resolve_place_suggestion(
  uuid, text, text, text, text, jsonb, uuid, uuid, uuid, boolean, uuid
);

create function public.resolve_place_suggestion(
  requested_suggestion_id uuid,
  requested_outcome text,
  expected_item_version bigint,
  expected_draft_version bigint,
  member_reason_is text,
  member_reason_en text,
  private_note text,
  moderator_candidate_payload jsonb,
  requested_duplicate_place_id uuid,
  requested_operator_identity_place_id uuid,
  requested_location_identity_place_id uuid,
  confirm_useful boolean,
  command_request_id uuid
)
returns table (
  suggestion_id uuid,
  status text,
  candidate_place_id uuid,
  duplicate_place_id uuid,
  contribution_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  suggestion_record private.place_suggestions%rowtype;
  current_draft_version bigint;
  effective_proposal jsonb;
  candidate_id uuid;
  candidate_command jsonb;
begin
  if requested_suggestion_id is null or command_request_id is null
    or expected_item_version is null or expected_item_version < 0
    or expected_draft_version is null or expected_draft_version < 0
  then
    raise exception using errcode = '22023', message = 'Suggestion resolution identifiers are required';
  end if;
  if requested_outcome <> all (
    array['needs_information', 'accepted', 'duplicate', 'rejected']::text[]
  ) then
    raise exception using errcode = '22023', message = 'Suggestion outcome is invalid';
  end if;

  select suggestion.* into suggestion_record
  from private.place_suggestions suggestion
  where suggestion.id = requested_suggestion_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Suggestion was not found';
  end if;

  if suggestion_record.resolution_request_id = command_request_id
    and suggestion_record.status::text = requested_outcome
  then
    return query select suggestion_record.id, suggestion_record.status::text,
      suggestion_record.candidate_place_id, suggestion_record.duplicate_place_id,
      contribution.id
    from (values (1)) ignored(value)
    left join private.contributions contribution
      on contribution.suggestion_id = suggestion_record.id;
    return;
  end if;

  if suggestion_record.version <> expected_item_version then
    raise exception using errcode = '40001', message = 'Moderation item changed';
  end if;

  select draft.current_version, draft.payload
  into current_draft_version, effective_proposal
  from private.moderation_drafts draft
  where draft.suggestion_id = requested_suggestion_id
  for update;
  current_draft_version := coalesce(current_draft_version, 0);
  effective_proposal := coalesce(effective_proposal, suggestion_record.proposal);

  if current_draft_version <> expected_draft_version then
    raise exception using errcode = '40001', message = 'Moderation draft changed';
  end if;
  if suggestion_record.status in ('accepted', 'duplicate', 'rejected') then
    raise exception using errcode = '55006', message = 'Suggestion outcome is final';
  end if;
  if moderator_candidate_payload is not null then
    raise exception using errcode = '22023', message = 'Legacy inline moderation content is not accepted';
  end if;
  if confirm_useful then
    raise exception using errcode = '22023', message = 'Use the separate Contribution confirmation command';
  end if;

  if requested_outcome = 'accepted' then
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

  if requested_outcome = 'duplicate' then
    if requested_duplicate_place_id is null
      or not private.is_eligible_suggestion_place_match(
        effective_proposal, requested_duplicate_place_id
      )
    then
      raise exception using errcode = '22023', message = 'Reviewed duplicate Place is required';
    end if;
  elsif requested_duplicate_place_id is not null then
    raise exception using errcode = '22023', message = 'Duplicate Place is valid only for duplicate outcome';
  end if;

  if requested_outcome = 'accepted' then
    perform private.validate_place_suggestion(effective_proposal);

    if requested_operator_identity_place_id is not null
      and not private.is_eligible_suggestion_place_match(
        effective_proposal, requested_operator_identity_place_id
      )
    then
      raise exception using errcode = '22023', message = 'Reviewed Operator identity is invalid';
    end if;
    if requested_location_identity_place_id is not null
      and not private.is_eligible_suggestion_place_match(
        effective_proposal, requested_location_identity_place_id
      )
    then
      raise exception using errcode = '22023', message = 'Reviewed Location identity is invalid';
    end if;

    candidate_command := private.suggestion_candidate_payload(effective_proposal);
    candidate_id := private.create_suggestion_candidate(
      candidate_command,
      command_request_id,
      actor_id,
      requested_operator_identity_place_id,
      requested_location_identity_place_id
    );
  elsif requested_operator_identity_place_id is not null
    or requested_location_identity_place_id is not null
  then
    raise exception using errcode = '22023', message = 'Candidate review data is valid only for accepted outcome';
  end if;

  update private.place_suggestions suggestion
  set status = requested_outcome::private.suggestion_status,
    candidate_place_id = candidate_id,
    duplicate_place_id = requested_duplicate_place_id,
    reviewed_proposal = case when requested_outcome = 'accepted' then effective_proposal end,
    operator_identity_place_id = requested_operator_identity_place_id,
    location_identity_place_id = requested_location_identity_place_id,
    resolution_request_id = command_request_id,
    resolved_at = case when requested_outcome = 'needs_information' then null else statement_timestamp() end,
    updated_at = statement_timestamp()
  where suggestion.id = requested_suggestion_id;

  insert into private.suggestion_status_events (
    suggestion_id, status, member_reason_is, member_reason_en, private_note, moderator_id
  ) values (
    requested_suggestion_id,
    requested_outcome::private.suggestion_status,
    nullif(btrim(member_reason_is), ''),
    nullif(btrim(member_reason_en), ''),
    nullif(btrim(private_note), ''),
    actor_id
  );

  perform private.append_audit_event(
    'suggestion.' || requested_outcome,
    'suggestion',
    requested_suggestion_id,
    command_request_id,
    jsonb_strip_nulls(jsonb_build_object(
      'previous_status', suggestion_record.status::text,
      'status', requested_outcome,
      'candidate_place_id', candidate_id,
      'duplicate_place_id', requested_duplicate_place_id,
      'operator_identity_place_id', requested_operator_identity_place_id,
      'location_identity_place_id', requested_location_identity_place_id,
      'proposal_corrected', effective_proposal is distinct from suggestion_record.proposal,
      'draft_version', current_draft_version
    ))
  );

  return query select requested_suggestion_id, requested_outcome, candidate_id,
    requested_duplicate_place_id, null::uuid;
end;
$$;

drop function public.resolve_place_flag(
  uuid, text, text, text, text, jsonb, jsonb, jsonb, uuid
);

create function public.resolve_place_flag(
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

drop function public.get_moderation_place_suggestion(uuid);

create function public.get_moderation_place_suggestion(requested_suggestion_id uuid)
returns table (
  suggestion_id uuid,
  member_id uuid,
  status text,
  operator_name text,
  name_is text,
  name_en text,
  category text,
  address_line text,
  locality text,
  submitted_at timestamptz,
  updated_at timestamptz,
  proposal jsonb,
  reviewed_proposal jsonb,
  private_note text,
  contribution_id uuid,
  operator_identity_place_id uuid,
  location_identity_place_id uuid,
  item_version bigint,
  draft_version bigint,
  draft_payload jsonb,
  draft_updated_by uuid,
  draft_updated_at timestamptz
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
    suggestion.id,
    suggestion.member_id,
    suggestion.status::text,
    effective.payload ->> 'operator_name',
    effective.payload #>> '{translations,is,name}',
    effective.payload #>> '{translations,en,name}',
    effective.payload ->> 'category',
    effective.payload #>> '{location,address_line}',
    effective.payload #>> '{location,locality}',
    suggestion.submitted_at,
    suggestion.updated_at,
    suggestion.proposal,
    suggestion.reviewed_proposal,
    latest.private_note,
    contribution.id,
    suggestion.operator_identity_place_id,
    suggestion.location_identity_place_id,
    suggestion.version,
    coalesce(draft.current_version, 0),
    draft.payload,
    draft.updated_by,
    draft.updated_at
  from private.place_suggestions suggestion
  left join private.moderation_drafts draft on draft.suggestion_id = suggestion.id
  cross join lateral (
    select coalesce(suggestion.reviewed_proposal, draft.payload, suggestion.proposal) payload
  ) effective
  left join lateral (
    select event.private_note
    from private.suggestion_status_events event
    where event.suggestion_id = suggestion.id and event.private_note is not null
    order by event.occurred_at desc, event.id desc
    limit 1
  ) latest on true
  left join private.contributions contribution on contribution.suggestion_id = suggestion.id
  where suggestion.id = requested_suggestion_id;
end;
$$;

drop function public.get_moderation_place_flag(uuid);

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
  current_verification_status text,
  current_verification_verified_at timestamptz,
  current_verification_freshness_until timestamptz,
  current_verification_evidence jsonb,
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
  updated_at timestamptz,
  item_version bigint,
  draft_version bigint,
  draft_payload jsonb,
  draft_updated_by uuid,
  draft_updated_at timestamptz
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
    verification_record.status::text,
    verification_record.verified_at,
    verification_record.freshness_until,
    (
      select jsonb_agg(jsonb_build_object(
        'kind', evidence_record.kind,
        'sourceUrl', evidence_record.source_url,
        'sourceCitation', evidence_record.source_citation,
        'sourceLabel', evidence_record.source_label,
        'observedAt', evidence_record.observed_at
      ) order by evidence_record.observed_at desc, evidence_record.source_label, evidence_record.id)
      from private.verification_evidence verification_link
      join private.evidence evidence_record on evidence_record.id = verification_link.evidence_id
      where verification_link.verification_id = verification_record.id
    ),
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
    flag.updated_at,
    flag.version,
    coalesce(draft.current_version, 0),
    draft.payload,
    draft.updated_by,
    draft.updated_at
  from private.place_flags flag
  left join private.places place_record on place_record.id = flag.place_id
  left join private.verifications verification_record
    on verification_record.access_condition_id = flag.access_condition_id
    and verification_record.superseded_at is null
  left join private.moderation_drafts draft on draft.flag_id = flag.id
  cross join lateral (
    select
      max(translation.name) filter (where translation.locale = 'is') name_is,
      max(translation.name) filter (where translation.locale = 'en') name_en
    from private.place_translations translation
    where translation.place_id = flag.place_id
  ) translations
  left join lateral (
    select event.private_note
    from private.place_flag_status_events event
    where event.flag_id = flag.id and event.private_note is not null
    order by event.occurred_at desc, event.id desc
    limit 1
  ) latest on true
  left join private.contributions contribution on contribution.place_flag_id = flag.id
  where flag.id = requested_flag_id;
end;
$$;

revoke execute on function public.save_place_suggestion_moderation_draft(
  uuid, bigint, bigint, text, jsonb, uuid
) from public, anon, service_role;
revoke execute on function public.save_place_flag_moderation_draft(
  uuid, bigint, bigint, text, jsonb, uuid
) from public, anon, service_role;
revoke execute on function public.resolve_place_suggestion(
  uuid, text, bigint, bigint, text, text, text, jsonb, uuid, uuid, uuid, boolean, uuid
) from public, anon, service_role;
revoke execute on function public.resolve_place_flag(
  uuid, text, bigint, bigint, text, text, text, jsonb, jsonb, jsonb, uuid
) from public, anon, service_role;
revoke execute on function public.get_moderation_place_suggestion(uuid)
  from public, anon, service_role;
revoke execute on function public.get_moderation_place_flag(uuid)
  from public, anon, service_role;

grant execute on function public.save_place_suggestion_moderation_draft(
  uuid, bigint, bigint, text, jsonb, uuid
) to authenticated;
grant execute on function public.save_place_flag_moderation_draft(
  uuid, bigint, bigint, text, jsonb, uuid
) to authenticated;
grant execute on function public.resolve_place_suggestion(
  uuid, text, bigint, bigint, text, text, text, jsonb, uuid, uuid, uuid, boolean, uuid
) to authenticated;
grant execute on function public.resolve_place_flag(
  uuid, text, bigint, bigint, text, text, text, jsonb, jsonb, jsonb, uuid
) to authenticated;
grant execute on function public.get_moderation_place_suggestion(uuid) to authenticated;
grant execute on function public.get_moderation_place_flag(uuid) to authenticated;

comment on function public.resolve_place_suggestion(
  uuid, text, bigint, bigint, text, text, text, jsonb, uuid, uuid, uuid, boolean, uuid
) is 'Resolves a Suggestion from its locked canonical draft snapshot with strict optimistic concurrency.';

comment on function public.resolve_place_flag(
  uuid, text, bigint, bigint, text, text, text, jsonb, jsonb, jsonb, uuid
) is 'Resolves a Correction or Report from its locked canonical draft envelope with strict optimistic concurrency.';

commit;
