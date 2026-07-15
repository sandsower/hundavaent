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

create function private.set_access_availability_queue(condition_values jsonb)
returns void
language plpgsql volatile set search_path = '' as $$
declare
  condition_value jsonb;
begin
  if jsonb_typeof(condition_values) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Access timing state is invalid';
  end if;
  for condition_value in select value from jsonb_array_elements(condition_values)
  loop
    perform private.resolve_access_availability(condition_value);
  end loop;
  perform pg_catalog.set_config('hundavaent.access_availability_queue', condition_values::text, true);
  perform pg_catalog.set_config('hundavaent.access_availability_index', '0', true);
end;
$$;

create function private.assign_access_availability()
returns trigger
language plpgsql volatile set search_path = '' as $$
declare
  queued_values jsonb;
  queued_index integer;
  queued_value jsonb;
begin
  queued_values := nullif(
    pg_catalog.current_setting('hundavaent.access_availability_queue', true), ''
  )::jsonb;
  queued_index := coalesce(nullif(
    pg_catalog.current_setting('hundavaent.access_availability_index', true), ''
  )::integer, 0);
  if queued_values is not null and queued_index < jsonb_array_length(queued_values) then
    queued_value := queued_values -> queued_index;
    new.availability_state := private.resolve_access_availability(queued_value);
    if queued_index + 1 = jsonb_array_length(queued_values) then
      perform pg_catalog.set_config('hundavaent.access_availability_queue', '[]', true);
      perform pg_catalog.set_config('hundavaent.access_availability_index', '0', true);
    else
      perform pg_catalog.set_config(
        'hundavaent.access_availability_index', (queued_index + 1)::text, true
      );
    end if;
  else
    new.availability_state := private.resolve_access_availability(jsonb_build_object(
      'availability_state', new.availability_state,
      'availability_window', new.availability_window
    ));
  end if;
  return new;
end;
$$;

create trigger access_conditions_assign_availability
before insert on private.access_conditions
for each row execute function private.assign_access_availability();

comment on function private.set_access_availability_queue(jsonb) is
  'Transaction-local ordered bridge for legacy writers that cannot yet name availability_state.';
comment on function private.assign_access_availability() is
  'Assigns and validates timing inside each Access Condition insert; exhausted queues clear immediately.';

alter table private.access_conditions
  alter column availability_state set not null;

alter table private.access_conditions
  add constraint access_availability_consistency_check check (
    (availability_state = 'limited' and availability_window <> '{}'::jsonb)
    or (availability_state = 'whenever_open' and availability_window = '{}'::jsonb)
    or (availability_state = 'not_stated' and availability_window = '{}'::jsonb)
  );

create or replace function public.create_candidate_place(
  command_payload jsonb,
  command_request_id uuid
)
returns table (place_id uuid, version bigint)
language plpgsql volatile security definer set search_path = '' as $$
declare
  input_conditions jsonb := command_payload -> 'access_conditions';
  requested_precision private.location_geometry_precision;
  requested_source text := nullif(btrim(command_payload #>> '{location,geometry_source}'), '');
  created_place_id uuid;
  created_version bigint;
  legacy_payload jsonb;
begin
  perform security.require_moderator();
  requested_precision := (command_payload #>> '{location,geometry_precision}')
    ::private.location_geometry_precision;
  if requested_source is null then
    raise exception using errcode = '22023', message = 'Location geometry source is required';
  end if;
  if input_conditions is null and command_payload ? 'access_condition' then
    input_conditions := jsonb_build_array(command_payload -> 'access_condition');
  end if;
  perform private.set_access_availability_queue(input_conditions);
  select (command_payload - 'access_condition') || jsonb_build_object(
    'access_conditions',
    jsonb_agg(input.value - 'availability_state' order by input.ordinality)
  )
  into legacy_payload
  from jsonb_array_elements(input_conditions) with ordinality input;
  select candidate.place_id, candidate.version
  into created_place_id, created_version
  from private.create_candidate_place_pre_geometry(
    legacy_payload, command_request_id
  ) as candidate;
  update private.locations as location_record
  set geometry_precision = requested_precision,
    geometry_source = requested_source,
    updated_at = statement_timestamp()
  from private.places as place_record
  where place_record.id = created_place_id
    and location_record.id = place_record.location_id;
  perform private.set_access_availability_queue('[]'::jsonb);
  return query select created_place_id, created_version;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Candidate geometry or access timing is invalid';
end;
$$;

alter function private.create_suggestion_candidate(jsonb, uuid, uuid, uuid, uuid)
  rename to create_suggestion_candidate_pre_access_availability;

create function private.create_suggestion_candidate(
  command_payload jsonb, command_request_id uuid, actor_id uuid,
  operator_identity_place_id uuid, location_identity_place_id uuid
)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  created_place_id uuid;
begin
  perform private.set_access_availability_queue(
    jsonb_build_array(command_payload -> 'access_condition')
  );
  created_place_id := private.create_suggestion_candidate_pre_access_availability(
    command_payload, command_request_id, actor_id,
    operator_identity_place_id, location_identity_place_id
  );
  perform private.set_access_availability_queue('[]'::jsonb);
  return created_place_id;
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

  perform private.set_access_availability_queue(
    case when requested_outcome = 'confirmed'
      then jsonb_build_array(command_payload -> 'replacement_condition')
      else '[]'::jsonb end
  );

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
      restraint_condition, restraint_note, dog_eligibility, availability_window,
      permission_requirement, created_by, created_at
    ) values (
      old_condition.place_id, old_condition.revision + 1, old_condition.id,
      (command_payload #>> '{replacement_condition,access_area}')::private.access_area,
      nullif(btrim(command_payload #>> '{replacement_condition,access_area_note}'), ''),
      (command_payload #>> '{replacement_condition,restraint_condition}')::private.restraint_condition,
      nullif(btrim(command_payload #>> '{replacement_condition,restraint_note}'), ''),
      coalesce(command_payload #> '{replacement_condition,dog_eligibility}', '{"scope":"all_dogs"}'::jsonb),
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
language plpgsql volatile set search_path = '' as $$
begin
  perform private.validate_access_condition_value_pre_access_availability(
    value - 'availability_state'
  );
  perform private.resolve_access_availability(value);
  perform private.set_access_availability_queue(jsonb_build_array(value));
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
