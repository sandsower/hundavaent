begin;

create type private.access_availability as enum ('whenever_open', 'limited', 'not_stated');

alter table private.access_conditions
  add column availability_state private.access_availability not null default 'not_stated';

update private.access_conditions
set availability_state = 'limited'
where availability_window <> '{}'::jsonb;

alter table private.access_conditions
  add constraint access_availability_consistency_check check (
    (availability_state = 'limited' and availability_window <> '{}'::jsonb)
    or (availability_state = 'whenever_open' and availability_window = '{}'::jsonb)
    or availability_state = 'not_stated'
  );

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
  input_conditions jsonb;
  legacy_payload jsonb;
  input_condition_count integer;
  updated_condition_count integer;
begin
  perform security.require_moderator();
  requested_precision := (command_payload #>> '{location,geometry_precision}')
    ::private.location_geometry_precision;
  if requested_source is null then
    raise exception using errcode = '22023', message = 'Location geometry source is required';
  end if;
  input_conditions := command_payload -> 'access_conditions';
  if input_conditions is null and command_payload ? 'access_condition' then
    input_conditions := jsonb_build_array(command_payload -> 'access_condition');
  end if;
  if jsonb_typeof(input_conditions) is distinct from 'array'
    or exists (
      select 1 from jsonb_array_elements(input_conditions) item
      where coalesce(item ->> 'availability_state', 'not_stated') not in ('whenever_open', 'limited', 'not_stated')
        or ((item ->> 'availability_state') = 'limited' and item -> 'availability_window' = '{}'::jsonb)
        or ((item ->> 'availability_state') = 'whenever_open' and item -> 'availability_window' <> '{}'::jsonb)
    )
  then
    raise exception using errcode = '22023', message = 'Access timing state is invalid';
  end if;
  select (command_payload - 'access_condition') || jsonb_build_object(
    'access_conditions',
    jsonb_agg(input.value - 'availability_state' order by input.ordinality)
  )
  into legacy_payload
  from jsonb_array_elements(input_conditions) with ordinality input;

  select candidate.place_id, candidate.version
  into created_place_id, created_version
  from private.create_candidate_place_pre_geometry(legacy_payload, command_request_id) as candidate;

  update private.locations as location_record
  set geometry_precision = requested_precision,
    geometry_source = requested_source,
    updated_at = statement_timestamp()
  from private.places as place_record
  where place_record.id = created_place_id
    and location_record.id = place_record.location_id;

  with stored_conditions as (
    select condition_record.id,
      row_number() over (order by condition_record.created_at, condition_record.id) ordinal
    from private.access_conditions condition_record
    where condition_record.place_id = created_place_id and condition_record.superseded_at is null
  ), input_conditions as (
    select input.value, input.ordinality
    from jsonb_array_elements(input_conditions) with ordinality input
  )
  update private.access_conditions condition_record
  set availability_state = coalesce(
    input_conditions.value ->> 'availability_state', 'not_stated'
  )::private.access_availability
  from stored_conditions
  join input_conditions on input_conditions.ordinality = stored_conditions.ordinal
  where condition_record.id = stored_conditions.id;
  get diagnostics updated_condition_count = row_count;
  input_condition_count := jsonb_array_length(input_conditions);
  if updated_condition_count <> input_condition_count then
    raise exception using errcode = '22023', message = 'Access timing state is incomplete';
  end if;

  return query select created_place_id, created_version;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Candidate geometry or access timing is invalid';
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

drop function public.list_published_places(text);
drop function public.get_published_place_profile(uuid, text);

create function public.list_published_places(requested_locale text)
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
      c.dog_eligibility, c.availability_state::text availability_state,
      c.availability_window,
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
        'dogEligibility', dog_eligibility,
        'availabilityState', availability_state,
        'availabilityWindow', availability_window
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

create function public.get_published_place_profile(requested_place_id uuid, requested_locale text)
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

revoke execute on function public.list_published_places(text) from public, service_role;
revoke execute on function public.get_published_place_profile(uuid, text) from public, service_role;
grant execute on function public.list_published_places(text) to anon, authenticated;
grant execute on function public.get_published_place_profile(uuid, text) to anon, authenticated;

comment on function public.list_published_places(text) is
  'Compact published directory projection with explicit five-dimension dog-access semantics.';
comment on function public.get_published_place_profile(uuid, text) is
  'Published place details without internal moderation, evidence, or freshness state.';

commit;
