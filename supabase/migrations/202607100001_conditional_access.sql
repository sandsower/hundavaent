begin;

create function private.jsonb_is_string_array(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'array'
    and not exists (select 1 from jsonb_array_elements(value) item where jsonb_typeof(item) <> 'string')
$$;

create function private.jsonb_is_weekday_array(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'array'
    and jsonb_array_length(value) > 0
    and not exists (
      select 1 from jsonb_array_elements(value) item
      where jsonb_typeof(item) <> 'number'
        or (item #>> '{}')::numeric % 1 <> 0
        or (item #>> '{}')::integer not between 1 and 7
    )
    and jsonb_array_length(value) = (
      select count(distinct item #>> '{}') from jsonb_array_elements(value) item
    )
$$;

create function private.jsonb_has_only_keys(value jsonb, allowed_keys text[])
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(value) key where not (key = any(allowed_keys))
    )
$$;

create function private.is_iso_date(value text)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if value !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  return to_char(value::date, 'YYYY-MM-DD') = value;
exception when others then return false;
end;
$$;

alter type private.access_area add value if not exists 'other_bounded';
alter type private.restraint_condition add value if not exists 'other_sourced';

commit;

begin;

alter table private.places
  add column dog_amenities jsonb not null default '[]'::jsonb
    check (private.jsonb_is_string_array(dog_amenities));

alter table private.access_conditions
  add column access_area_note text,
  add column restraint_note text,
  add constraint access_area_note_required_check check (
    access_area <> 'other_bounded'::private.access_area
    or nullif(btrim(access_area_note), '') is not null
  ),
  add constraint restraint_note_required_check check (
    restraint_condition <> 'other_sourced'::private.restraint_condition
    or nullif(btrim(restraint_note), '') is not null
  ),
  add constraint dog_eligibility_shape_check check (
    (dog_eligibility ->> 'maximumWeightKg') is null or (
      jsonb_typeof(dog_eligibility -> 'maximumWeightKg') = 'number'
      and (dog_eligibility ->> 'maximumWeightKg')::numeric > 0)
  ),
  add constraint dog_eligibility_maximum_dogs_check check (
    (dog_eligibility ->> 'maximumDogs') is null or (
      jsonb_typeof(dog_eligibility -> 'maximumDogs') = 'number'
      and (dog_eligibility ->> 'maximumDogs')::numeric % 1 = 0
      and (dog_eligibility ->> 'maximumDogs')::integer > 0)
  ),
  add constraint dog_eligibility_notes_check check (
    (dog_eligibility -> 'notes') is null or (
      jsonb_typeof(dog_eligibility -> 'notes') = 'string'
      and nullif(btrim(dog_eligibility ->> 'notes'), '') is not null)
  ),
  add constraint dog_eligibility_keys_check check (
    private.jsonb_has_only_keys(
      dog_eligibility,
      array['scope', 'maximumWeightKg', 'maximumDogs', 'notes']
    )
  ),
  add constraint dog_eligibility_scope_check check (
    (dog_eligibility ->> 'scope' = 'all_dogs'
      and not (dog_eligibility ?| array['maximumWeightKg', 'maximumDogs', 'notes']))
    or
    (dog_eligibility ->> 'scope' = 'restricted'
      and dog_eligibility ?| array['maximumWeightKg', 'maximumDogs', 'notes'])
  ),
  add constraint availability_window_shape_check check (
    private.jsonb_has_only_keys(
      availability_window,
      array['days', 'startsAt', 'endsAt', 'startsOn', 'endsOn', 'notes']
    )
    and
    ((availability_window ->> 'startsAt') is null or (availability_window ->> 'startsAt') ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
    and ((availability_window ->> 'endsAt') is null or (availability_window ->> 'endsAt') ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
    and ((availability_window -> 'days') is null or private.jsonb_is_weekday_array(availability_window -> 'days'))
    and ((availability_window ->> 'startsOn') is null or private.is_iso_date(availability_window ->> 'startsOn'))
    and ((availability_window ->> 'endsOn') is null or private.is_iso_date(availability_window ->> 'endsOn'))
    and ((availability_window -> 'notes') is null or (
      jsonb_typeof(availability_window -> 'notes') = 'string'
      and nullif(btrim(availability_window ->> 'notes'), '') is not null))
    and ((availability_window ->> 'startsOn') is null
      or (availability_window ->> 'endsOn') is null
      or (availability_window ->> 'startsOn') <= (availability_window ->> 'endsOn'))
  );

drop function public.list_published_places(text);
drop function public.get_published_place_profile(uuid, text);
drop function public.get_moderation_place_review(uuid);
drop function public.create_candidate_place(jsonb, uuid);
drop function public.verify_and_publish_place(jsonb, uuid);

create function public.create_candidate_place(
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
        'dog_eligibility', 'availability_window', 'permission_requirement'
      ]
    )
      or jsonb_typeof(condition -> 'dog_eligibility') is distinct from 'object'
      or jsonb_typeof(condition -> 'availability_window') is distinct from 'object'
    then
      raise exception using errcode = '22023', message = 'Access Condition shape is invalid';
    end if;
    insert into private.access_conditions (
      place_id, revision, access_area, access_area_note, restraint_condition, restraint_note,
      dog_eligibility, availability_window, permission_requirement, created_by
    ) values (
      created_place_id, 1, (condition ->> 'access_area')::private.access_area,
      nullif(btrim(condition ->> 'access_area_note'), ''),
      (condition ->> 'restraint_condition')::private.restraint_condition,
      nullif(btrim(condition ->> 'restraint_note'), ''),
      coalesce(condition -> 'dog_eligibility', '{"scope":"all_dogs"}'::jsonb),
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

create function public.get_moderation_place_review(requested_place_id uuid)
returns table (
  place_id uuid, version bigint, lifecycle text, operator_name text, category text,
  address_line text, locality text, postal_code text, municipality text,
  name_is text, description_is text, name_en text, description_en text,
  access_conditions jsonb, evidence_records jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_moderator();
  return query
  select place_record.id, place_record.version, place_record.lifecycle::text,
    operator_record.name, place_record.category::text, location_record.address_line,
    location_record.locality, location_record.postal_code, location_record.municipality,
    translations.name_is, translations.description_is, translations.name_en, translations.description_en,
    coalesce(conditions.records, '[]'::jsonb), coalesce(evidence.records, '[]'::jsonb)
  from private.places place_record
  join private.operators operator_record on operator_record.id = place_record.operator_id
  join private.locations location_record on location_record.id = place_record.location_id
  cross join lateral (
    select max(name) filter (where locale = 'is') name_is,
      max(description) filter (where locale = 'is') description_is,
      max(name) filter (where locale = 'en') name_en,
      max(description) filter (where locale = 'en') description_en
    from private.place_translations translation_record
    where translation_record.place_id = place_record.id
  ) translations
  cross join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'accessArea', c.access_area, 'accessAreaNote', c.access_area_note,
      'restraintCondition', c.restraint_condition, 'restraintNote', c.restraint_note,
      'dogEligibility', c.dog_eligibility, 'availabilityWindow', c.availability_window,
      'permissionRequirement', c.permission_requirement
    ) order by c.created_at, c.id) records
    from private.access_conditions c where c.place_id = place_record.id and c.superseded_at is null
  ) conditions
  cross join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'kind', e.kind, 'sourceUrl', e.source_url,
      'sourceCitation', e.source_citation, 'sourceLabel', e.source_label,
      'observedAt', e.observed_at
    ) order by e.observed_at desc, e.id) records
    from private.evidence e where e.place_id = place_record.id
  ) evidence
  where place_record.id = requested_place_id;
end;
$$;

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
  expected_place_version bigint := (command_payload ->> 'expected_version')::bigint;
  condition_verification jsonb;
  requested_condition_ids uuid[];
  requested_freshness_until timestamptz := (command_payload ->> 'freshness_until')::timestamptz;
  place_record private.places%rowtype;
  condition_id uuid;
  condition_evidence_ids uuid[];
  evidence_id uuid;
  created_verification_id uuid;
  created_verification_ids uuid[] := array[]::uuid[];
  publication_time timestamptz := statement_timestamp();
begin
  if command_request_id is null or jsonb_typeof(command_payload -> 'condition_verifications') is distinct from 'array'
    or jsonb_array_length(command_payload -> 'condition_verifications') = 0
  then raise exception using errcode = '22023', message = 'Publication command is incomplete'; end if;
  select array_agg((item ->> 'access_condition_id')::uuid order by item ->> 'access_condition_id')
    into requested_condition_ids
    from jsonb_array_elements(command_payload -> 'condition_verifications') item;

  select place_value.* into place_record
  from private.places as place_value
  where place_value.id = requested_place_id
  for update;
  if not found then raise exception using errcode = '22023', message = 'Place not found'; end if;
  if place_record.version <> expected_place_version then raise exception using errcode = '40001', message = 'Place version conflict'; end if;
  if place_record.lifecycle <> 'candidate' then raise exception using errcode = '55000', message = 'Place is not a Candidate'; end if;
  if requested_freshness_until <= publication_time then raise exception using errcode = '22023', message = 'Freshness must be in the future'; end if;
  if (
    select count(distinct translation_record.locale)
    from private.place_translations as translation_record
    where translation_record.place_id = requested_place_id
      and translation_record.locale in ('is'::private.locale_code, 'en'::private.locale_code)
      and btrim(translation_record.name) <> '' and btrim(translation_record.description) <> ''
  ) <> 2 then
    raise exception using errcode = '22023', message = 'Both Place translations are required';
  end if;
  if (select count(distinct condition_record.id) from private.access_conditions condition_record
      where condition_record.id = any(requested_condition_ids)
        and condition_record.place_id = requested_place_id and condition_record.superseded_at is null)
      <> cardinality(requested_condition_ids)
  then raise exception using errcode = '22023', message = 'Current Access Condition is required'; end if;
  if (select count(*) from private.access_conditions condition_record
      where condition_record.place_id = requested_place_id and condition_record.superseded_at is null)
      <> cardinality(requested_condition_ids)
  then raise exception using errcode = '22023', message = 'Every current Access Condition is required'; end if;
  for condition_verification in select value from jsonb_array_elements(command_payload -> 'condition_verifications') loop
    condition_id := (condition_verification ->> 'access_condition_id')::uuid;
    if jsonb_typeof(condition_verification -> 'evidence_ids') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'Per-condition Evidence selection is required';
    end if;
    select array_agg(value::uuid) into condition_evidence_ids
      from jsonb_array_elements_text(condition_verification -> 'evidence_ids');
    if coalesce(cardinality(condition_evidence_ids), 0) = 0 then
      raise exception using errcode = '22023', message = 'At least one Evidence record is required';
    end if;
    if (select count(distinct evidence_record.id) from private.evidence evidence_record
        where evidence_record.id = any(condition_evidence_ids)
          and evidence_record.place_id = requested_place_id) <> cardinality(condition_evidence_ids)
    then raise exception using errcode = '22023', message = 'Every Evidence record must exist'; end if;
    insert into private.verifications (
      access_condition_id, status, verified_by, verified_at, freshness_until, decision_metadata
    ) values (
      condition_id, 'verified', actor_id, publication_time, requested_freshness_until,
      coalesce(command_payload -> 'decision_metadata', '{}'::jsonb)
    ) returning id into created_verification_id;
    created_verification_ids := array_append(created_verification_ids, created_verification_id);
    foreach evidence_id in array condition_evidence_ids loop
      insert into private.verification_evidence (verification_id, evidence_id)
      values (created_verification_id, evidence_id);
    end loop;
  end loop;

  update private.places as place_to_publish
  set lifecycle = 'published', published_at = publication_time,
    version = place_to_publish.version + 1, updated_at = publication_time
  where place_to_publish.id = requested_place_id;
  perform private.append_audit_event('place.verified', 'place', requested_place_id, command_request_id,
    jsonb_build_object('version', expected_place_version + 1, 'verification_ids', created_verification_ids, 'condition_ids', requested_condition_ids));
  perform private.append_audit_event('place.published', 'place', requested_place_id, command_request_id,
    jsonb_build_object('version', expected_place_version + 1, 'verification_ids', created_verification_ids));
  return query select requested_place_id, created_verification_ids,
    expected_place_version + 1, publication_time;
exception when invalid_text_representation or check_violation or not_null_violation then
  raise exception using errcode = '22023', message = 'Publication command is invalid';
end;
$$;

create function public.list_published_places(requested_locale text)
returns table (
  place_id uuid, name text, category text, locality text, latitude double precision,
  longitude double precision, access_condition_count bigint, access_area text,
  restraint_condition text, permission_requirement text, access_conditions jsonb,
  simple_access_summary boolean, verified_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  with eligible as (
    select p.id place_id, c.id condition_id, c.access_area::text access_area,
      c.restraint_condition::text restraint_condition,
      c.permission_requirement::text permission_requirement,
      (c.dog_eligibility = '{"scope":"all_dogs"}'::jsonb
        and c.availability_window = '{}'::jsonb
        and c.access_area_note is null
        and c.restraint_note is null
        and c.access_area <> 'other_bounded'::private.access_area
        and c.restraint_condition <> 'other_sourced'::private.restraint_condition) simple_summary,
      v.verified_at
    from private.places p
    join private.access_conditions c on c.place_id = p.id and c.superseded_at is null
    join private.verifications v on v.access_condition_id = c.id and v.status = 'verified'
      and v.superseded_at is null
    where p.lifecycle = 'published'
      and exists (select 1 from private.verification_evidence ve where ve.verification_id = v.id)
  ), aggregated as (
    select place_id, count(*) access_condition_count, max(verified_at) verified_at,
      case when count(*) = 1 then max(access_area) end access_area,
      case when count(*) = 1 then max(restraint_condition) end restraint_condition,
      case when count(*) = 1 then max(permission_requirement) end permission_requirement,
      jsonb_agg(jsonb_build_object(
        'accessArea', access_area,
        'restraintCondition', restraint_condition,
        'permissionRequirement', permission_requirement
      ) order by access_area, restraint_condition, permission_requirement, condition_id) access_conditions,
      count(*) = 1 and bool_and(simple_summary) simple_access_summary
    from eligible group by place_id
  )
  select p.id, t.name, p.category::text, l.locality, l.latitude, l.longitude,
    a.access_condition_count, a.access_area, a.restraint_condition,
    a.permission_requirement, a.access_conditions, a.simple_access_summary, a.verified_at
  from private.places p join aggregated a on a.place_id = p.id
  join private.locations l on l.id = p.location_id
  join private.place_translations t on t.place_id = p.id and t.locale =
    case when requested_locale = 'en' then 'en'::private.locale_code else 'is'::private.locale_code end
  order by t.name, p.id;
$$;

create function public.get_published_place_profile(requested_place_id uuid, requested_locale text)
returns table (
  place_id uuid, name text, description text, category text, address_line text, locality text,
  postal_code text, latitude double precision, longitude double precision, website_url text,
  phone text, opening_hours jsonb, dog_amenities jsonb, access_condition_id uuid,
  access_area text, access_area_note text, restraint_condition text, restraint_note text,
  dog_eligibility jsonb, availability_window jsonb, permission_requirement text,
  evidence_sources jsonb, verified_at timestamptz, freshness_until timestamptz
)
language sql stable security definer set search_path = '' as $$
  select p.id, t.name, t.description, p.category::text, l.address_line, l.locality,
    l.postal_code, l.latitude, l.longitude, p.website_url, p.phone, p.opening_hours,
    p.dog_amenities, c.id, c.access_area::text, c.access_area_note,
    c.restraint_condition::text, c.restraint_note, c.dog_eligibility,
    c.availability_window, c.permission_requirement::text,
    (select jsonb_agg(jsonb_build_object(
      'kind', e.kind, 'sourceUrl', e.source_url, 'sourceCitation', e.source_citation,
      'sourceLabel', e.source_label, 'observedAt', e.observed_at
    ) order by e.observed_at desc, e.source_label, e.id) from private.verification_evidence ve join private.evidence e on e.id = ve.evidence_id
      where ve.verification_id = v.id) evidence_sources,
    v.verified_at, v.freshness_until
  from private.places p
  join private.place_translations t on t.place_id = p.id and t.locale =
    case when requested_locale = 'en' then 'en'::private.locale_code else 'is'::private.locale_code end
  join private.locations l on l.id = p.location_id
  join private.access_conditions c on c.place_id = p.id and c.superseded_at is null
  join private.verifications v on v.access_condition_id = c.id and v.status = 'verified'
    and v.superseded_at is null
  where p.id = requested_place_id and p.lifecycle = 'published'
    and exists (select 1 from private.verification_evidence ve where ve.verification_id = v.id)
  order by c.created_at, c.id;
$$;

revoke execute on function public.create_candidate_place(jsonb, uuid) from public, anon, service_role;
revoke execute on function public.get_moderation_place_review(uuid) from public, anon, service_role;
revoke execute on function public.verify_and_publish_place(jsonb, uuid) from public, anon, service_role;
grant execute on function public.create_candidate_place(jsonb, uuid) to authenticated;
grant execute on function public.get_moderation_place_review(uuid) to authenticated;
grant execute on function public.verify_and_publish_place(jsonb, uuid) to authenticated;
revoke execute on function public.list_published_places(text) from public, service_role;
revoke execute on function public.get_published_place_profile(uuid, text) from public, service_role;
grant execute on function public.list_published_places(text) to anon, authenticated;
grant execute on function public.get_published_place_profile(uuid, text) to anon, authenticated;

commit;
