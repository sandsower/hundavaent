begin;

alter table private.places
  add column created_by uuid references auth.users(id) on delete restrict;

create index places_created_by_idx
  on private.places (created_by)
  where created_by is not null;

create function public.create_candidate_place(
  command_payload jsonb,
  command_request_id uuid
)
returns table (
  place_id uuid,
  version bigint
)
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
  operator_name text;
  address_line text;
  locality text;
  postal_code text;
  municipality text;
  latitude_value double precision;
  longitude_value double precision;
  category_value text;
  website_value text;
  phone_value text;
  opening_hours_value jsonb;
  name_is text;
  description_is text;
  name_en text;
  description_en text;
  evidence_kind_value text;
  evidence_source_url text;
  evidence_source_citation text;
  evidence_source_label text;
  evidence_observed_at timestamptz;
  evidence_metadata jsonb;
  access_area_value text;
  restraint_value text;
  dog_eligibility_value jsonb;
  availability_window_value jsonb;
  permission_value text;
begin
  if command_request_id is null then
    raise exception using errcode = '22023', message = 'Request ID is required';
  end if;

  if command_payload is null or jsonb_typeof(command_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Candidate command must be an object';
  end if;

  operator_name := nullif(btrim(command_payload #>> '{operator,name}'), '');
  address_line := nullif(btrim(command_payload #>> '{location,address_line}'), '');
  locality := nullif(btrim(command_payload #>> '{location,locality}'), '');
  postal_code := nullif(btrim(command_payload #>> '{location,postal_code}'), '');
  municipality := nullif(btrim(command_payload #>> '{location,municipality}'), '');
  category_value := nullif(btrim(command_payload ->> 'category'), '');
  website_value := nullif(btrim(command_payload ->> 'website_url'), '');
  phone_value := nullif(btrim(command_payload ->> 'phone'), '');
  name_is := nullif(btrim(command_payload #>> '{translations,is,name}'), '');
  description_is := nullif(btrim(command_payload #>> '{translations,is,description}'), '');
  name_en := nullif(btrim(command_payload #>> '{translations,en,name}'), '');
  description_en := nullif(btrim(command_payload #>> '{translations,en,description}'), '');
  evidence_kind_value := nullif(btrim(command_payload #>> '{evidence,kind}'), '');
  evidence_source_url := nullif(btrim(command_payload #>> '{evidence,source_url}'), '');
  evidence_source_citation := nullif(btrim(command_payload #>> '{evidence,source_citation}'), '');
  evidence_source_label := nullif(btrim(command_payload #>> '{evidence,source_label}'), '');
  access_area_value := nullif(btrim(command_payload #>> '{access_condition,access_area}'), '');
  restraint_value := nullif(
    btrim(command_payload #>> '{access_condition,restraint_condition}'),
    ''
  );
  permission_value := nullif(
    btrim(command_payload #>> '{access_condition,permission_requirement}'),
    ''
  );

  if operator_name is null
    or address_line is null
    or locality is null
    or postal_code is null
    or municipality is null
    or category_value is null
    or name_is is null
    or description_is is null
    or name_en is null
    or description_en is null
    or evidence_kind_value is null
    or evidence_source_label is null
    or access_area_value is null
    or restraint_value is null
    or permission_value is null
  then
    raise exception using errcode = '22023', message = 'Candidate command is incomplete';
  end if;

  if evidence_source_url is null and evidence_source_citation is null then
    raise exception using errcode = '22023', message = 'Evidence source is required';
  end if;

  if not private.is_capital_region_municipality(municipality) then
    raise exception using errcode = '22023', message = 'Location is outside the capital region';
  end if;

  if category_value <> all (
    array[
      'restaurant',
      'cafe',
      'bar',
      'shop',
      'shopping_centre',
      'accommodation',
      'park',
      'recreation',
      'culture',
      'service',
      'other'
    ]::text[]
  ) then
    raise exception using errcode = '22023', message = 'Place category is invalid';
  end if;

  if evidence_kind_value <> all (
    array[
      'official_website',
      'venue_representative',
      'member_report',
      'direct_observation',
      'public_record',
      'other'
    ]::text[]
  ) then
    raise exception using errcode = '22023', message = 'Evidence kind is invalid';
  end if;

  if access_area_value <> all (array['indoors', 'outdoors', 'designated_area']::text[]) then
    raise exception using errcode = '22023', message = 'Access Area is invalid';
  end if;

  if restraint_value <> all (
    array['leash_required', 'off_leash_permitted', 'carrier_required']::text[]
  ) then
    raise exception using errcode = '22023', message = 'Restraint Condition is invalid';
  end if;

  if permission_value <> all (
    array['standing_permission', 'ask_on_arrival', 'advance_approval']::text[]
  ) then
    raise exception using errcode = '22023', message = 'Permission Requirement is invalid';
  end if;

  latitude_value := (command_payload #>> '{location,latitude}')::double precision;
  longitude_value := (command_payload #>> '{location,longitude}')::double precision;
  evidence_observed_at := (command_payload #>> '{evidence,observed_at}')::timestamptz;

  if latitude_value is null or longitude_value is null or evidence_observed_at is null then
    raise exception using errcode = '22023', message = 'Candidate coordinates and observation time are required';
  end if;

  opening_hours_value := coalesce(command_payload -> 'opening_hours', '{}'::jsonb);
  evidence_metadata := coalesce(command_payload #> '{evidence,source_metadata}', '{}'::jsonb);
  dog_eligibility_value := coalesce(
    command_payload #> '{access_condition,dog_eligibility}',
    '{"scope":"all_dogs"}'::jsonb
  );
  availability_window_value := coalesce(
    command_payload #> '{access_condition,availability_window}',
    '{}'::jsonb
  );

  if jsonb_typeof(opening_hours_value) is distinct from 'object'
    or jsonb_typeof(evidence_metadata) is distinct from 'object'
    or jsonb_typeof(dog_eligibility_value) is distinct from 'object'
    or jsonb_typeof(availability_window_value) is distinct from 'object'
  then
    raise exception using errcode = '22023', message = 'Structured Candidate fields must be objects';
  end if;

  insert into private.operators (name)
  values (operator_name)
  returning id into created_operator_id;

  insert into private.locations (
    address_line,
    locality,
    postal_code,
    country_code,
    municipality,
    latitude,
    longitude
  )
  values (
    address_line,
    locality,
    postal_code,
    'IS',
    municipality,
    latitude_value,
    longitude_value
  )
  returning id into created_location_id;

  insert into private.places (
    operator_id,
    location_id,
    purpose,
    lifecycle,
    category,
    website_url,
    phone,
    opening_hours,
    version,
    created_by
  )
  values (
    created_operator_id,
    created_location_id,
    'dog_access_destination',
    'candidate',
    category_value::private.place_category,
    website_value,
    phone_value,
    opening_hours_value,
    1,
    actor_id
  )
  returning id into created_place_id;

  insert into private.place_translations (place_id, locale, name, description)
  values
    (created_place_id, 'is', name_is, description_is),
    (created_place_id, 'en', name_en, description_en);

  insert into private.evidence (
    place_id,
    kind,
    source_url,
    source_citation,
    source_label,
    observed_at,
    recorded_by,
    source_metadata
  )
  values (
    created_place_id,
    evidence_kind_value::private.evidence_kind,
    evidence_source_url,
    evidence_source_citation,
    evidence_source_label,
    evidence_observed_at,
    actor_id,
    evidence_metadata
  )
  returning id into created_evidence_id;

  insert into private.access_conditions (
    place_id,
    revision,
    access_area,
    restraint_condition,
    dog_eligibility,
    availability_window,
    permission_requirement,
    created_by
  )
  values (
    created_place_id,
    1,
    access_area_value::private.access_area,
    restraint_value::private.restraint_condition,
    dog_eligibility_value,
    availability_window_value,
    permission_value::private.permission_requirement,
    actor_id
  );

  perform private.append_audit_event(
    'place.candidate_created',
    'place',
    created_place_id,
    command_request_id,
    jsonb_build_object('version', 1, 'category', category_value)
  );

  return query select created_place_id, 1::bigint;
end;
$$;

revoke execute on function public.create_candidate_place(jsonb, uuid)
  from public, anon, service_role;

grant execute on function public.create_candidate_place(jsonb, uuid)
  to authenticated;

comment on function public.create_candidate_place(jsonb, uuid) is
  'Creates one complete private Candidate Place, Evidence, Access Condition, translations, and Audit Event as the authenticated Moderator.';

create function public.get_moderation_place_review(requested_place_id uuid)
returns table (
  place_id uuid,
  version bigint,
  lifecycle text,
  operator_name text,
  category text,
  address_line text,
  locality text,
  postal_code text,
  municipality text,
  name_is text,
  description_is text,
  name_en text,
  description_en text,
  access_condition_id uuid,
  access_area text,
  restraint_condition text,
  permission_requirement text,
  evidence_ids uuid[],
  evidence_count bigint
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
    place_record.id,
    place_record.version,
    place_record.lifecycle::text,
    operator_record.name,
    place_record.category::text,
    location_record.address_line,
    location_record.locality,
    location_record.postal_code,
    location_record.municipality,
    translations.name_is,
    translations.description_is,
    translations.name_en,
    translations.description_en,
    access_condition.id,
    access_condition.access_area::text,
    access_condition.restraint_condition::text,
    access_condition.permission_requirement::text,
    evidence_records.evidence_ids,
    cardinality(evidence_records.evidence_ids)::bigint
  from private.places as place_record
  join private.operators as operator_record
    on operator_record.id = place_record.operator_id
  join private.locations as location_record
    on location_record.id = place_record.location_id
  cross join lateral (
    select
      max(translation.name) filter (where translation.locale = 'is') as name_is,
      max(translation.description) filter (where translation.locale = 'is') as description_is,
      max(translation.name) filter (where translation.locale = 'en') as name_en,
      max(translation.description) filter (where translation.locale = 'en') as description_en
    from private.place_translations as translation
    where translation.place_id = place_record.id
  ) as translations
  left join lateral (
    select condition_record.*
    from private.access_conditions as condition_record
    where condition_record.place_id = place_record.id
      and condition_record.superseded_at is null
    order by condition_record.revision desc, condition_record.created_at desc
    limit 1
  ) as access_condition on true
  cross join lateral (
    select coalesce(
      array_agg(evidence_record.id order by evidence_record.observed_at desc),
      array[]::uuid[]
    ) as evidence_ids
    from private.evidence as evidence_record
    where evidence_record.place_id = place_record.id
  ) as evidence_records
  where place_record.id = requested_place_id;
end;
$$;

revoke execute on function public.get_moderation_place_review(uuid)
  from public, anon, service_role;

grant execute on function public.get_moderation_place_review(uuid)
  to authenticated;

comment on function public.get_moderation_place_review(uuid) is
  'Returns one fixed private publication-review projection to an authenticated Moderator.';

create function public.verify_and_publish_place(
  command_payload jsonb,
  command_request_id uuid
)
returns table (
  place_id uuid,
  verification_id uuid,
  version bigint,
  published_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  requested_place_id uuid;
  expected_place_version bigint;
  requested_access_condition_id uuid;
  selected_evidence_ids uuid[];
  requested_freshness_until timestamptz;
  requested_decision_metadata jsonb;
  place_record private.places%rowtype;
  publication_time timestamptz := statement_timestamp();
  created_verification_id uuid;
  published_version bigint;
begin
  if command_request_id is null then
    raise exception using errcode = '22023', message = 'Request ID is required';
  end if;

  if command_payload is null or jsonb_typeof(command_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Publication command must be an object';
  end if;

  if nullif(btrim(command_payload ->> 'place_id'), '') is null
    or nullif(btrim(command_payload ->> 'expected_version'), '') is null
    or nullif(btrim(command_payload ->> 'access_condition_id'), '') is null
    or nullif(btrim(command_payload ->> 'freshness_until'), '') is null
  then
    raise exception using errcode = '22023', message = 'Publication command is incomplete';
  end if;

  if jsonb_typeof(command_payload -> 'evidence_ids') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Evidence identifiers must be an array';
  end if;

  requested_decision_metadata := coalesce(
    command_payload -> 'decision_metadata',
    '{}'::jsonb
  );

  if jsonb_typeof(requested_decision_metadata) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Decision metadata must be an object';
  end if;

  begin
    requested_place_id := (command_payload ->> 'place_id')::uuid;
    expected_place_version := (command_payload ->> 'expected_version')::bigint;
    requested_access_condition_id := (command_payload ->> 'access_condition_id')::uuid;
    requested_freshness_until := (command_payload ->> 'freshness_until')::timestamptz;

    select coalesce(array_agg(evidence_value::uuid), array[]::uuid[])
    into selected_evidence_ids
    from jsonb_array_elements_text(command_payload -> 'evidence_ids') as evidence_value;
  exception
    when invalid_text_representation
      or numeric_value_out_of_range
      or invalid_datetime_format
      or datetime_field_overflow
    then
      raise exception using errcode = '22023', message = 'Publication command identifiers are invalid';
  end;

  if expected_place_version < 1 then
    raise exception using errcode = '22023', message = 'Expected version is invalid';
  end if;

  if coalesce(cardinality(selected_evidence_ids), 0) = 0 then
    raise exception using errcode = '22023', message = 'At least one Evidence record is required';
  end if;

  if requested_freshness_until <= publication_time then
    raise exception using errcode = '22023', message = 'Verification freshness must be in the future';
  end if;

  select place_value.*
  into place_record
  from private.places as place_value
  where place_value.id = requested_place_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Candidate Place was not found';
  end if;

  if place_record.version <> expected_place_version then
    raise exception using errcode = '40001', message = 'Place version conflict';
  end if;

  if place_record.lifecycle <> 'candidate'::private.place_lifecycle then
    raise exception using errcode = '55000', message = 'Place is not a Candidate';
  end if;

  if not exists (
    select 1
    from private.locations as location_record
    where location_record.id = place_record.location_id
      and private.is_capital_region_municipality(location_record.municipality)
  ) then
    raise exception using errcode = '22023', message = 'Capital-region Location is required';
  end if;

  if not exists (
    select 1
    from private.operators as operator_record
    where operator_record.id = place_record.operator_id
      and btrim(operator_record.name) <> ''
  ) then
    raise exception using errcode = '22023', message = 'Operator is required';
  end if;

  if (
    select count(distinct translation.locale)
    from private.place_translations as translation
    where translation.place_id = requested_place_id
      and translation.locale in ('is'::private.locale_code, 'en'::private.locale_code)
      and btrim(translation.name) <> ''
      and btrim(translation.description) <> ''
  ) <> 2 then
    raise exception using errcode = '22023', message = 'Both Place translations are required';
  end if;

  if not exists (
    select 1
    from private.access_conditions as access_condition
    where access_condition.id = requested_access_condition_id
      and access_condition.place_id = requested_place_id
      and access_condition.superseded_at is null
  ) then
    raise exception using errcode = '22023', message = 'Current Access Condition is required';
  end if;

  if (
    select count(distinct evidence_record.id)
    from private.evidence as evidence_record
    where evidence_record.id = any (selected_evidence_ids)
      and evidence_record.place_id = requested_place_id
  ) <> (
    select count(distinct selected_evidence_id)
    from unnest(selected_evidence_ids) as selected_evidence_id
  ) then
    raise exception using errcode = '22023', message = 'Every Evidence record must exist';
  end if;

  insert into private.verifications (
    access_condition_id,
    status,
    verified_by,
    verified_at,
    freshness_until,
    decision_metadata
  )
  values (
    requested_access_condition_id,
    'verified',
    actor_id,
    publication_time,
    requested_freshness_until,
    requested_decision_metadata
  )
  returning id into created_verification_id;

  insert into private.verification_evidence (verification_id, evidence_id)
  select created_verification_id, selected_evidence_id
  from unnest(selected_evidence_ids) as selected_evidence_id
  group by selected_evidence_id;

  update private.places as place_to_publish
  set
    lifecycle = 'published',
    version = place_to_publish.version + 1,
    published_at = publication_time,
    updated_at = publication_time
  where place_to_publish.id = requested_place_id
  returning place_to_publish.version into published_version;

  perform private.append_audit_event(
    'place.verified',
    'place',
    requested_place_id,
    command_request_id,
    jsonb_build_object(
      'version', expected_place_version,
      'verification_id', created_verification_id,
      'access_condition_id', requested_access_condition_id
    )
  );

  perform private.append_audit_event(
    'place.published',
    'place',
    requested_place_id,
    command_request_id,
    jsonb_build_object(
      'version', published_version,
      'previous_lifecycle', 'candidate',
      'lifecycle', 'published',
      'verification_id', created_verification_id
    )
  );

  return query
  select
    requested_place_id,
    created_verification_id,
    published_version,
    publication_time;
end;
$$;

revoke execute on function public.verify_and_publish_place(jsonb, uuid)
  from public, anon, service_role;

grant execute on function public.verify_and_publish_place(jsonb, uuid)
  to authenticated;

comment on function public.verify_and_publish_place(jsonb, uuid) is
  'Atomically verifies one current Access Condition and publishes its complete Candidate Place as the authenticated Moderator.';

commit;
