begin;

create type private.access_availability as enum ('whenever_open', 'limited', 'not_stated');

alter table private.access_conditions
  add column availability_state private.access_availability;

update private.access_conditions
set availability_state = 'limited'
where availability_window <> '{}'::jsonb;

update private.access_conditions
set availability_state = 'not_stated'
where availability_window = '{}'::jsonb;

create function private.resolve_access_availability(condition_value jsonb)
returns private.access_availability
language plpgsql immutable set search_path = '' as $$
declare
  requested_state text := nullif(btrim(condition_value ->> 'availability_state'), '');
  requested_window jsonb := coalesce(condition_value -> 'availability_window', '{}'::jsonb);
begin
  if jsonb_typeof(condition_value) is distinct from 'object'
    or jsonb_typeof(requested_window) is distinct from 'object'
  then
    raise exception using errcode = '22023', message = 'Access timing state is invalid';
  end if;
  requested_state := coalesce(
    requested_state,
    case when requested_window = '{}'::jsonb then 'not_stated' else 'limited' end
  );
  if requested_state not in ('whenever_open', 'limited', 'not_stated')
    or (requested_state = 'limited' and requested_window = '{}'::jsonb)
    or (requested_state <> 'limited' and requested_window <> '{}'::jsonb)
  then
    raise exception using errcode = '22023', message = 'Access timing state is invalid';
  end if;
  return requested_state::private.access_availability;
end;
$$;

revoke execute on function private.resolve_access_availability(jsonb)
  from public, anon, authenticated, service_role;

alter table private.access_conditions
  alter column availability_state set not null,
  alter column availability_state set default 'not_stated';

alter table private.access_conditions
  add constraint access_availability_consistency_check check (
    (availability_state = 'limited' and availability_window <> '{}'::jsonb)
    or (availability_state = 'whenever_open' and availability_window = '{}'::jsonb)
    or (availability_state = 'not_stated' and availability_window = '{}'::jsonb)
  );

create or replace function private.create_candidate_place_pre_geometry(
  command_payload jsonb,
  command_request_id uuid
)
returns table (place_id uuid, version bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  created_operator_id uuid;
  created_location_id uuid;
  created_place_id uuid;
  created_evidence_id uuid;
  condition jsonb;
  conditions jsonb;
  evidence_record jsonb;
  evidence_records jsonb;
  operator_name text := nullif(btrim(command_payload #>> '{operator,name}'), '');
  address_line text := nullif(btrim(command_payload #>> '{location,address_line}'), '');
  locality text := nullif(btrim(command_payload #>> '{location,locality}'), '');
  postal_code text := nullif(btrim(command_payload #>> '{location,postal_code}'), '');
  municipality text := nullif(btrim(command_payload #>> '{location,municipality}'), '');
  category_value text := nullif(btrim(command_payload ->> 'category'), '');
  name_is text := nullif(btrim(command_payload #>> '{translations,is,name}'), '');
  description_is text := nullif(btrim(command_payload #>> '{translations,is,description}'), '');
  name_en text := nullif(btrim(command_payload #>> '{translations,en,name}'), '');
  description_en text := nullif(btrim(command_payload #>> '{translations,en,description}'), '');
begin
  if command_request_id is null or command_payload is null or jsonb_typeof(command_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Candidate command is invalid';
  end if;

  conditions := command_payload -> 'access_conditions';
  if conditions is null and command_payload ? 'access_condition' then
    conditions := jsonb_build_array(command_payload -> 'access_condition');
  end if;
  evidence_records := command_payload -> 'evidence_records';
  if evidence_records is null and command_payload ? 'evidence' then
    evidence_records := jsonb_build_array(command_payload -> 'evidence');
  end if;

  if operator_name is null or address_line is null or locality is null or postal_code is null
    or municipality is null or category_value is null or name_is is null or description_is is null
    or name_en is null or description_en is null
    or jsonb_typeof(conditions) is distinct from 'array' or jsonb_array_length(conditions) = 0
    or jsonb_typeof(evidence_records) is distinct from 'array' or jsonb_array_length(evidence_records) = 0
  then
    raise exception using errcode = '22023', message = 'Candidate command is incomplete';
  end if;

  if not private.is_capital_region_municipality(municipality) then
    raise exception using errcode = '22023', message = 'Location is outside the capital region';
  end if;

  insert into private.operators (name) values (operator_name) returning id into created_operator_id;
  insert into private.locations (
    address_line, locality, postal_code, country_code, municipality, latitude, longitude
  ) values (
    address_line, locality, postal_code, 'IS', municipality,
    (command_payload #>> '{location,latitude}')::double precision,
    (command_payload #>> '{location,longitude}')::double precision
  ) returning id into created_location_id;

  insert into private.places (
    operator_id, location_id, purpose, lifecycle, category, website_url, phone,
    opening_hours, dog_amenities, version, created_by
  ) values (
    created_operator_id, created_location_id, 'dog_access_destination', 'candidate',
    category_value::private.place_category, nullif(btrim(command_payload ->> 'website_url'), ''),
    nullif(btrim(command_payload ->> 'phone'), ''),
    coalesce(command_payload -> 'opening_hours', '{}'::jsonb),
    coalesce(command_payload -> 'dog_amenities', '[]'::jsonb), 1, actor_id
  ) returning id into created_place_id;

  insert into private.place_translations (place_id, locale, name, description)
  values
    (created_place_id, 'is', name_is, description_is),
    (created_place_id, 'en', name_en, description_en);

  for evidence_record in select value from jsonb_array_elements(evidence_records)
  loop
    if not private.jsonb_has_only_keys(
        evidence_record,
        array['kind', 'source_url', 'source_citation', 'source_label', 'observed_at', 'source_metadata']
      )
      or nullif(btrim(evidence_record ->> 'source_label'), '') is null
      or (nullif(btrim(evidence_record ->> 'source_url'), '') is null
        and nullif(btrim(evidence_record ->> 'source_citation'), '') is null)
    then
      raise exception using errcode = '22023', message = 'Evidence source is incomplete';
    end if;
    insert into private.evidence (
      place_id, kind, source_url, source_citation, source_label, observed_at, recorded_by, source_metadata
    ) values (
      created_place_id, (evidence_record ->> 'kind')::private.evidence_kind,
      nullif(btrim(evidence_record ->> 'source_url'), ''),
      nullif(btrim(evidence_record ->> 'source_citation'), ''),
      btrim(evidence_record ->> 'source_label'),
      (evidence_record ->> 'observed_at')::timestamptz, actor_id,
      coalesce(evidence_record -> 'source_metadata', '{}'::jsonb)
    ) returning id into created_evidence_id;
  end loop;

  for condition in select value from jsonb_array_elements(conditions)
  loop
    if not private.jsonb_has_only_keys(
      condition,
      array[
        'access_area', 'access_area_note', 'restraint_condition', 'restraint_note',
        'dog_eligibility', 'availability_state', 'availability_window', 'permission_requirement'
      ]
    )
      or jsonb_typeof(condition -> 'dog_eligibility') is distinct from 'object'
      or jsonb_typeof(condition -> 'availability_window') is distinct from 'object'
    then
      raise exception using errcode = '22023', message = 'Access Condition shape is invalid';
    end if;
    insert into private.access_conditions (
      place_id, revision, access_area, access_area_note, restraint_condition, restraint_note,
      dog_eligibility, availability_state, availability_window, permission_requirement, created_by
    ) values (
      created_place_id, 1, (condition ->> 'access_area')::private.access_area,
      nullif(btrim(condition ->> 'access_area_note'), ''),
      (condition ->> 'restraint_condition')::private.restraint_condition,
      nullif(btrim(condition ->> 'restraint_note'), ''),
      coalesce(condition -> 'dog_eligibility', '{"scope":"all_dogs"}'::jsonb),
      private.resolve_access_availability(condition),
      coalesce(condition -> 'availability_window', '{}'::jsonb),
      (condition ->> 'permission_requirement')::private.permission_requirement, actor_id
    );
  end loop;

  perform private.append_audit_event(
    'place.candidate_created', 'place', created_place_id, command_request_id,
    jsonb_build_object('version', 1, 'category', category_value, 'condition_count', jsonb_array_length(conditions))
  );
  return query select created_place_id, 1::bigint;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Candidate structured information is invalid';
end;
$$;

create or replace function private.create_suggestion_candidate(
  command_payload jsonb,
  command_request_id uuid,
  actor_id uuid,
  operator_identity_place_id uuid,
  location_identity_place_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  operator_id uuid;
  location_id uuid;
  place_id uuid;
  evidence_id uuid;
begin
  if command_request_id is null or actor_id is null then
    raise exception using errcode = '22023', message = 'Candidate command is invalid';
  end if;

  if operator_identity_place_id is null then
    insert into private.operators (name)
    values (btrim(command_payload #>> '{operator,name}'))
    returning id into operator_id;
  else
    select place.operator_id into operator_id
    from private.places as place
    where place.id = operator_identity_place_id;
  end if;

  if location_identity_place_id is null then
    insert into private.locations (
      address_line,
      locality,
      postal_code,
      country_code,
      municipality,
      latitude,
      longitude
    ) values (
      command_payload #>> '{location,address_line}',
      command_payload #>> '{location,locality}',
      command_payload #>> '{location,postal_code}',
      'IS',
      command_payload #>> '{location,municipality}',
      (command_payload #>> '{location,latitude}')::double precision,
      (command_payload #>> '{location,longitude}')::double precision
    ) returning id into location_id;
  else
    select place.location_id into location_id
    from private.places as place
    where place.id = location_identity_place_id;
  end if;

  insert into private.places (
    operator_id,
    location_id,
    purpose,
    lifecycle,
    category,
    website_url,
    phone,
    opening_hours,
    dog_amenities,
    version,
    created_by
  ) values (
    operator_id,
    location_id,
    'dog_access_destination',
    'candidate',
    (command_payload ->> 'category')::private.place_category,
    nullif(btrim(command_payload ->> 'website_url'), ''),
    nullif(btrim(command_payload ->> 'phone'), ''),
    coalesce(command_payload -> 'opening_hours', '{}'::jsonb),
    coalesce(command_payload -> 'dog_amenities', '[]'::jsonb),
    1,
    actor_id
  ) returning id into place_id;

  insert into private.place_translations (place_id, locale, name, description)
  values
    (
      place_id,
      'is',
      command_payload #>> '{translations,is,name}',
      command_payload #>> '{translations,is,description}'
    ),
    (
      place_id,
      'en',
      command_payload #>> '{translations,en,name}',
      command_payload #>> '{translations,en,description}'
    );

  insert into private.evidence (
    place_id,
    kind,
    source_url,
    source_citation,
    source_label,
    observed_at,
    recorded_by,
    source_metadata
  ) values (
    place_id,
    (command_payload #>> '{evidence,kind}')::private.evidence_kind,
    nullif(btrim(command_payload #>> '{evidence,source_url}'), ''),
    nullif(btrim(command_payload #>> '{evidence,source_citation}'), ''),
    command_payload #>> '{evidence,source_label}',
    (command_payload #>> '{evidence,observed_at}')::timestamptz,
    actor_id,
    coalesce(command_payload #> '{evidence,source_metadata}', '{}'::jsonb)
  ) returning id into evidence_id;

  insert into private.access_conditions (
    place_id,
    revision,
    access_area,
    access_area_note,
    restraint_condition,
    restraint_note,
    dog_eligibility,
    availability_state,
    availability_window,
    permission_requirement,
    created_by
  ) values (
    place_id,
    1,
    (command_payload #>> '{access_condition,access_area}')::private.access_area,
    nullif(btrim(command_payload #>> '{access_condition,access_area_note}'), ''),
    (command_payload #>> '{access_condition,restraint_condition}')::private.restraint_condition,
    nullif(btrim(command_payload #>> '{access_condition,restraint_note}'), ''),
    coalesce(command_payload #> '{access_condition,dog_eligibility}', '{"scope":"all_dogs"}'::jsonb),
    private.resolve_access_availability(command_payload -> 'access_condition'),
    coalesce(command_payload #> '{access_condition,availability_window}', '{}'::jsonb),
    (command_payload #>> '{access_condition,permission_requirement}')::private.permission_requirement,
    actor_id
  );

  perform private.append_audit_event(
    'place.candidate_created',
    'place',
    place_id,
    command_request_id,
    jsonb_build_object('version', 1, 'category', command_payload ->> 'category', 'condition_count', 1)
  );

  return place_id;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Candidate structured information is invalid';
end;
$$;

create or replace function public.create_candidate_place(
  command_payload jsonb,
  command_request_id uuid
)
returns table (place_id uuid, version bigint)
language plpgsql volatile security definer set search_path = '' as $$
declare
  requested_precision private.location_geometry_precision;
  requested_source text := nullif(btrim(command_payload #>> '{location,geometry_source}'), '');
  created_place_id uuid;
  created_version bigint;
begin
  perform security.require_moderator();
  requested_precision := (command_payload #>> '{location,geometry_precision}')
    ::private.location_geometry_precision;
  if requested_source is null then
    raise exception using errcode = '22023', message = 'Location geometry source is required';
  end if;
  select candidate.place_id, candidate.version
  into created_place_id, created_version
  from private.create_candidate_place_pre_geometry(
    command_payload, command_request_id
  ) as candidate;
  update private.locations as location_record
  set geometry_precision = requested_precision,
    geometry_source = requested_source,
    updated_at = statement_timestamp()
  from private.places as place_record
  where place_record.id = created_place_id
    and location_record.id = place_record.location_id;
  return query select created_place_id, created_version;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Candidate geometry or access timing is invalid';
end;
$$;

create or replace function public.resolve_access_dispute(
  command_payload jsonb,
  command_request_id uuid
)
returns table (
  dispute_id uuid,
  access_condition_id uuid,
  verification_id uuid,
  resolved_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  requested_dispute_id uuid := (command_payload ->> 'dispute_id')::uuid;
  requested_outcome private.dispute_resolution := (command_payload ->> 'outcome')::private.dispute_resolution;
  requested_resolved_at timestamptz := (command_payload ->> 'resolved_at')::timestamptz;
  requested_freshness_until timestamptz := (command_payload ->> 'freshness_until')::timestamptz;
  dispute_record private.access_disputes%rowtype;
  old_condition private.access_conditions%rowtype;
  owning_place private.places%rowtype;
  locked_disputed_verification private.verifications%rowtype;
  routed_place_id uuid;
  routed_condition_id uuid;
  routed_disputed_verification_id uuid;
  resulting_condition_id uuid;
  created_evidence_id uuid;
  created_verification_id uuid;
begin
  if command_request_id is null or jsonb_typeof(command_payload) is distinct from 'object'
    or nullif(btrim(command_payload ->> 'resolution_notes'), '') is null
    or requested_freshness_until <= requested_resolved_at
  then
    raise exception using errcode = '22023', message = 'Resolution command is incomplete';
  end if;

  select dispute_value.place_id, dispute_value.access_condition_id,
      dispute_value.disputed_verification_id
    into routed_place_id, routed_condition_id, routed_disputed_verification_id
  from private.access_disputes dispute_value
  where dispute_value.id = requested_dispute_id;
  if not found then
    raise exception using errcode = '22023', message = 'Dispute not found';
  end if;

  select place_record.* into owning_place
  from private.places place_record
  where place_record.id = routed_place_id
  for update;

  select condition_record.* into old_condition
  from private.access_conditions condition_record
  where condition_record.id = routed_condition_id
    and condition_record.place_id = routed_place_id
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'Access Condition state changed';
  end if;

  select verification_record.* into locked_disputed_verification
  from private.verifications verification_record
  where verification_record.id = routed_disputed_verification_id
    and verification_record.access_condition_id = routed_condition_id
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'Disputed Verification state changed';
  end if;

  select dispute_value.* into dispute_record
  from private.access_disputes dispute_value
  where dispute_value.id = requested_dispute_id
  for update;
  if not found
    or dispute_record.place_id <> routed_place_id
    or dispute_record.access_condition_id <> routed_condition_id
    or dispute_record.disputed_verification_id <> routed_disputed_verification_id
  then
    raise exception using errcode = '40001', message = 'Dispute state changed';
  end if;
  if dispute_record.status = 'resolved' then
    if dispute_record.resolve_request_id = command_request_id then
      return query select dispute_record.id,
        (select verification_record.access_condition_id from private.verifications verification_record
          where verification_record.id = dispute_record.resolution_verification_id),
        dispute_record.resolution_verification_id, dispute_record.resolved_at;
      return;
    end if;
    raise exception using errcode = '40001', message = 'Dispute is already resolved';
  end if;

  if owning_place.lifecycle <> 'published' then
    raise exception using errcode = '40001', message = 'Owning Place is not published';
  end if;

  created_evidence_id := private.record_lifecycle_evidence(
    dispute_record.place_id, command_payload -> 'evidence', actor_id
  );

  update private.verifications
  set superseded_at = requested_resolved_at
  where id = dispute_record.disputed_verification_id and superseded_at is null;

  if requested_outcome = 'dismissed' then
    resulting_condition_id := old_condition.id;
  else
    if jsonb_typeof(command_payload -> 'replacement_condition') is distinct from 'object' then
      raise exception using errcode = '22023', message = 'Confirmed dispute requires a replacement condition';
    end if;

    update private.access_conditions
    set superseded_at = requested_resolved_at
    where id = old_condition.id and superseded_at is null;

    insert into private.access_conditions (
      place_id, revision, supersedes_condition_id, access_area, access_area_note,
      restraint_condition, restraint_note, dog_eligibility, availability_state, availability_window,
      permission_requirement, created_by, created_at
    ) values (
      old_condition.place_id, old_condition.revision + 1, old_condition.id,
      (command_payload #>> '{replacement_condition,access_area}')::private.access_area,
      nullif(btrim(command_payload #>> '{replacement_condition,access_area_note}'), ''),
      (command_payload #>> '{replacement_condition,restraint_condition}')::private.restraint_condition,
      nullif(btrim(command_payload #>> '{replacement_condition,restraint_note}'), ''),
      coalesce(command_payload #> '{replacement_condition,dog_eligibility}', '{"scope":"all_dogs"}'::jsonb),
      private.resolve_access_availability(command_payload -> 'replacement_condition'),
      coalesce(command_payload #> '{replacement_condition,availability_window}', '{}'::jsonb),
      (command_payload #>> '{replacement_condition,permission_requirement}')::private.permission_requirement,
      actor_id, requested_resolved_at
    ) returning id into resulting_condition_id;
  end if;

  insert into private.verifications (
    access_condition_id, status, verified_by, verified_at, freshness_until,
    decision_metadata, command_request_id
  ) values (
    resulting_condition_id, 'verified', actor_id, requested_resolved_at,
    requested_freshness_until,
    jsonb_build_object(
      'dispute_id', dispute_record.id,
      'outcome', requested_outcome,
      'resolution_notes', btrim(command_payload ->> 'resolution_notes')
    ), command_request_id
  ) returning id into created_verification_id;

  insert into private.verification_evidence (verification_id, evidence_id)
  select created_verification_id, evidence_link.evidence_id
  from private.verification_evidence evidence_link
  where requested_outcome = 'dismissed'
    and evidence_link.verification_id = dispute_record.displaced_verification_id
  union
  select created_verification_id, created_evidence_id;

  insert into private.access_dispute_evidence (dispute_id, evidence_id, stance)
  values (dispute_record.id, created_evidence_id, 'resolution');

  update private.access_disputes
  set status = 'resolved', resolution = requested_outcome,
    resolution_notes = btrim(command_payload ->> 'resolution_notes'), resolved_by = actor_id,
    resolved_at = requested_resolved_at, resolve_request_id = command_request_id,
    resolution_verification_id = created_verification_id
  where id = dispute_record.id;

  perform private.append_audit_event(
    'access.dispute_resolved', 'access_condition', dispute_record.access_condition_id,
    command_request_id,
    jsonb_build_object(
      'dispute_id', dispute_record.id,
      'outcome', requested_outcome,
      'resulting_condition_id', resulting_condition_id,
      'verification_id', created_verification_id,
      'resolution_evidence_id', created_evidence_id
    )
  );

  return query select dispute_record.id, resulting_condition_id,
    created_verification_id, requested_resolved_at;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Resolution command is invalid';
end;
$$;

alter function private.validate_access_condition_value(jsonb)
  rename to validate_access_condition_value_pre_access_availability;

create function private.validate_access_condition_value(value jsonb)
returns void
language plpgsql immutable set search_path = '' as $$
begin
  perform private.validate_access_condition_value_pre_access_availability(
    value - 'availability_state'
  );
  perform private.resolve_access_availability(value);
end;
$$;

revoke execute on function private.validate_access_condition_value(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.resolve_place_flag(
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
        restraint_condition, restraint_note, dog_eligibility, availability_state, availability_window,
        permission_requirement, created_by, created_at
      ) values (
        condition_row.place_id, condition_row.revision + 1, condition_row.id,
        (application_payload #>> '{replacement_condition,access_area}')::private.access_area,
        nullif(btrim(application_payload #>> '{replacement_condition,access_area_note}'), ''),
        (application_payload #>> '{replacement_condition,restraint_condition}')::private.restraint_condition,
        nullif(btrim(application_payload #>> '{replacement_condition,restraint_note}'), ''),
        coalesce(application_payload #> '{replacement_condition,dog_eligibility}', '{"scope":"all_dogs"}'::jsonb),
        private.resolve_access_availability(application_payload -> 'replacement_condition'),
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

create or replace function public.get_moderation_place_review(requested_place_id uuid)
returns table (
  place_id uuid, version bigint, lifecycle text, operator_name text, category text,
  address_line text, locality text, postal_code text, municipality text,
  latitude double precision, longitude double precision,
  geometry_precision text, geometry_source text,
  name_is text, description_is text, name_en text, description_en text,
  access_conditions jsonb, evidence_records jsonb
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform security.require_moderator();
  return query
  select place_record.id, place_record.version, place_record.lifecycle::text,
    operator_record.name, place_record.category::text, location_record.address_line,
    location_record.locality, location_record.postal_code, location_record.municipality,
    location_record.latitude, location_record.longitude,
    location_record.geometry_precision::text, location_record.geometry_source,
    translations.name_is, translations.description_is, translations.name_en,
    translations.description_en, coalesce(conditions.records, '[]'::jsonb),
    coalesce(evidence.records, '[]'::jsonb)
  from private.places as place_record
  join private.operators as operator_record on operator_record.id = place_record.operator_id
  join private.locations as location_record on location_record.id = place_record.location_id
  cross join lateral (
    select max(name) filter (where locale = 'is') name_is,
      max(description) filter (where locale = 'is') description_is,
      max(name) filter (where locale = 'en') name_en,
      max(description) filter (where locale = 'en') description_en
    from private.place_translations as translation_record
    where translation_record.place_id = place_record.id
  ) as translations
  cross join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', condition_record.id,
      'accessArea', condition_record.access_area,
      'accessAreaNote', condition_record.access_area_note,
      'restraintCondition', condition_record.restraint_condition,
      'restraintNote', condition_record.restraint_note,
      'dogEligibility', condition_record.dog_eligibility,
      'availabilityState', condition_record.availability_state,
      'availabilityWindow', condition_record.availability_window,
      'permissionRequirement', condition_record.permission_requirement
    ) order by condition_record.created_at, condition_record.id) records
    from private.access_conditions as condition_record
    where condition_record.place_id = place_record.id
      and condition_record.superseded_at is null
  ) as conditions
  cross join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', evidence_record.id,
      'kind', evidence_record.kind,
      'sourceUrl', evidence_record.source_url,
      'sourceCitation', evidence_record.source_citation,
      'sourceLabel', evidence_record.source_label,
      'observedAt', evidence_record.observed_at
    ) order by evidence_record.observed_at desc, evidence_record.id) records
    from private.evidence as evidence_record
    where evidence_record.place_id = place_record.id
  ) as evidence
  where place_record.id = requested_place_id;
end;
$$;

create function public.list_published_places_v2(requested_locale text)
returns table (
  place_id uuid, name text, category text, locality text, latitude double precision,
  longitude double precision, access_condition_count bigint, access_area text,
  restraint_condition text, permission_requirement text, access_conditions jsonb,
  simple_access_summary boolean
)
language sql stable security definer set search_path = '' as $$
  with eligible as (
    select p.id place_id, c.id condition_id, c.access_area::text access_area,
      c.restraint_condition::text restraint_condition,
      c.permission_requirement::text permission_requirement,
      case
        when c.dog_eligibility ->> 'scope' = 'all_dogs' then 'all_dogs'
        when c.dog_eligibility ? 'maximumWeightKg' then 'small_dogs_only'
        else 'special'
      end dog_eligibility_state,
      c.availability_state::text availability_state,
      (c.access_area_note is null and c.restraint_note is null
        and c.access_area <> 'other_bounded'::private.access_area
        and c.restraint_condition <> 'other_sourced'::private.restraint_condition) simple_summary
    from private.places p
    join private.access_conditions c on c.place_id = p.id and c.superseded_at is null
    join private.verifications v on v.access_condition_id = c.id and v.status = 'verified'
      and v.superseded_at is null
    where p.lifecycle = 'published'
      and exists (select 1 from private.verification_evidence ve where ve.verification_id = v.id)
  ), aggregated as (
    select place_id, count(*) access_condition_count,
      case when count(*) = 1 then max(access_area) end access_area,
      case when count(*) = 1 then max(restraint_condition) end restraint_condition,
      case when count(*) = 1 then max(permission_requirement) end permission_requirement,
      jsonb_agg(jsonb_build_object(
        'accessArea', access_area,
        'restraintCondition', restraint_condition,
        'permissionRequirement', permission_requirement,
        'dogEligibilityState', dog_eligibility_state,
        'availabilityState', availability_state
      ) order by access_area, restraint_condition, permission_requirement, condition_id) access_conditions,
      count(*) = 1 and bool_and(simple_summary) simple_access_summary
    from eligible group by place_id
  )
  select p.id, coalesce(t_requested.name, t_english.name), p.category::text,
    l.locality, l.latitude, l.longitude, a.access_condition_count, a.access_area,
    a.restraint_condition, a.permission_requirement, a.access_conditions,
    a.simple_access_summary
  from private.places p
  join aggregated a on a.place_id = p.id
  join private.locations l on l.id = p.location_id
  left join private.place_translations t_requested on t_requested.place_id = p.id
    and t_requested.locale = case when requested_locale = 'is' then 'is'::private.locale_code else 'en'::private.locale_code end
  left join private.place_translations t_english on t_english.place_id = p.id
    and t_english.locale = 'en'::private.locale_code
  where coalesce(t_requested.name, t_english.name) is not null
    and private.has_publishable_geometry(p.id)
  order by coalesce(t_requested.name, t_english.name), p.id;
$$;

create function public.get_published_place_profile_v2(requested_place_id uuid, requested_locale text)
returns table (
  place_id uuid, name text, description text, category text, address_line text, locality text,
  postal_code text, latitude double precision, longitude double precision, website_url text,
  phone text, opening_hours jsonb, dog_amenities jsonb, access_condition_id uuid,
  access_area text, access_area_note text, restraint_condition text, restraint_note text,
  dog_eligibility jsonb, availability_state text, availability_window jsonb,
  permission_requirement text, access_information_urls jsonb
)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(t_requested.name, t_english.name),
    coalesce(t_requested.description, t_english.description), p.category::text,
    l.address_line, l.locality, l.postal_code, l.latitude, l.longitude, p.website_url,
    p.phone, p.opening_hours, p.dog_amenities, c.id, c.access_area::text,
    c.access_area_note, c.restraint_condition::text, c.restraint_note, c.dog_eligibility,
    c.availability_state::text, c.availability_window, c.permission_requirement::text,
    coalesce((
      select jsonb_agg(source_url order by source_url)
      from (
        select distinct e.source_url source_url
        from private.verification_evidence ve
        join private.evidence e on e.id = ve.evidence_id
        where ve.verification_id = v.id and e.source_url is not null
          and e.source_url is distinct from p.website_url
      ) access_links
    ), '[]'::jsonb)
  from private.places p
  left join private.place_translations t_requested on t_requested.place_id = p.id
    and t_requested.locale = case when requested_locale = 'is' then 'is'::private.locale_code else 'en'::private.locale_code end
  left join private.place_translations t_english on t_english.place_id = p.id
    and t_english.locale = 'en'::private.locale_code
  join private.locations l on l.id = p.location_id
  join private.access_conditions c on c.place_id = p.id and c.superseded_at is null
  join private.verifications v on v.access_condition_id = c.id and v.status = 'verified'
    and v.superseded_at is null
  where p.id = requested_place_id and p.lifecycle = 'published'
    and private.has_publishable_geometry(p.id)
    and coalesce(t_requested.name, t_english.name) is not null
    and coalesce(t_requested.description, t_english.description) is not null
    and exists (select 1 from private.verification_evidence ve where ve.verification_id = v.id)
  order by c.created_at, c.id;
$$;

revoke execute on function public.list_published_places_v2(text) from public, service_role;
revoke execute on function public.get_published_place_profile_v2(uuid, text) from public, service_role;
grant execute on function public.list_published_places_v2(text) to anon, authenticated;
grant execute on function public.get_published_place_profile_v2(uuid, text) to anon, authenticated;

comment on function public.list_published_places_v2(text) is
  'Versioned compact published directory projection with bounded dog-access states.';
comment on function public.get_published_place_profile_v2(uuid, text) is
  'Published place details without internal moderation, evidence, or freshness state.';

commit;
