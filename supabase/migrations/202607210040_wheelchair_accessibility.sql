begin;

create type private.wheelchair_accessibility as enum (
  'accessible',
  'not_accessible',
  'unknown'
);

alter table private.places
  add column wheelchair_accessibility private.wheelchair_accessibility
  not null default 'unknown';

alter function public.create_candidate_place(jsonb, uuid) set schema private;
alter function private.create_candidate_place(jsonb, uuid)
  rename to create_candidate_place_pre_wheelchair_accessibility;

revoke execute on function private.create_candidate_place_pre_wheelchair_accessibility(jsonb, uuid)
  from public, anon, authenticated, service_role;

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
  requested_accessibility private.wheelchair_accessibility;
  created_place_id uuid;
  created_version bigint;
begin
  perform security.require_moderator();

  requested_accessibility :=
    coalesce(command_payload ->> 'wheelchair_accessibility', 'unknown')
      ::private.wheelchair_accessibility;

  select candidate.place_id, candidate.version
  into created_place_id, created_version
  from private.create_candidate_place_pre_wheelchair_accessibility(
    command_payload,
    command_request_id
  ) as candidate;

  update private.places
  set wheelchair_accessibility = requested_accessibility
  where id = created_place_id
    and wheelchair_accessibility is distinct from requested_accessibility;

  return query select created_place_id, created_version;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using
      errcode = '22023',
      message = 'Candidate wheelchair accessibility is invalid';
end;
$$;

create function public.update_place_wheelchair_accessibility(
  command_payload jsonb,
  command_request_id uuid
)
returns table (
  place_id uuid,
  wheelchair_accessibility text,
  version bigint
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
  requested_accessibility private.wheelchair_accessibility;
  place_record private.places%rowtype;
  next_version bigint;
begin
  if command_request_id is null or jsonb_typeof(command_payload) is distinct from 'object' then
    raise exception using
      errcode = '22023',
      message = 'Wheelchair accessibility update is incomplete';
  end if;

  requested_place_id := (command_payload ->> 'place_id')::uuid;
  expected_place_version := (command_payload ->> 'expected_version')::bigint;
  requested_accessibility :=
    (command_payload ->> 'wheelchair_accessibility')::private.wheelchair_accessibility;

  if requested_place_id is null
    or expected_place_version is null
    or expected_place_version < 1
    or requested_accessibility is null
  then
    raise exception using
      errcode = '22023',
      message = 'Wheelchair accessibility update is incomplete';
  end if;

  select place_value.* into place_record
  from private.places as place_value
  where place_value.id = requested_place_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Place not found';
  end if;
  if place_record.version <> expected_place_version then
    raise exception using errcode = '40001', message = 'Place version conflict';
  end if;
  if place_record.lifecycle = 'inactive' then
    raise exception using errcode = '55000', message = 'Inactive Place cannot be updated';
  end if;

  if place_record.wheelchair_accessibility = requested_accessibility then
    return query
      select requested_place_id, requested_accessibility::text, place_record.version;
    return;
  end if;

  next_version := place_record.version + 1;
  update private.places
  set wheelchair_accessibility = requested_accessibility,
    version = next_version,
    updated_at = statement_timestamp()
  where id = requested_place_id;

  perform private.append_audit_event(
    'place.wheelchair_accessibility_updated',
    'place',
    requested_place_id,
    command_request_id,
    jsonb_build_object(
      'version', next_version,
      'previous_wheelchair_accessibility', place_record.wheelchair_accessibility,
      'wheelchair_accessibility', requested_accessibility,
      'actor_id', actor_id
    )
  );

  return query select requested_place_id, requested_accessibility::text, next_version;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using
      errcode = '22023',
      message = 'Wheelchair accessibility update is invalid';
end;
$$;

create function public.get_moderation_place_review_v2(requested_place_id uuid)
returns table (
  place_id uuid, version bigint, lifecycle text, wheelchair_accessibility text,
  operator_name text, category text, address_line text, locality text, postal_code text,
  municipality text, latitude double precision, longitude double precision,
  geometry_precision text, geometry_source text, name_is text, description_is text,
  name_en text, description_en text, access_conditions jsonb, evidence_records jsonb
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
    place_record.wheelchair_accessibility::text, operator_record.name,
    place_record.category::text, location_record.address_line, location_record.locality,
    location_record.postal_code, location_record.municipality, location_record.latitude,
    location_record.longitude, location_record.geometry_precision::text,
    location_record.geometry_source, translations.name_is, translations.description_is,
    translations.name_en, translations.description_en,
    coalesce(conditions.records, '[]'::jsonb), coalesce(evidence.records, '[]'::jsonb)
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

create function public.list_published_places_v3(requested_locale text)
returns table (
  place_id uuid, name text, category text, locality text, latitude double precision,
  longitude double precision, wheelchair_accessibility text,
  access_condition_count bigint, access_area text, restraint_condition text,
  permission_requirement text, access_conditions jsonb, simple_access_summary boolean
)
language sql
stable
security definer
set search_path = ''
as $$
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
      ) order by access_area, restraint_condition, permission_requirement, condition_id)
        access_conditions,
      count(*) = 1 and bool_and(simple_summary) simple_access_summary
    from eligible
    group by place_id
  )
  select p.id, coalesce(t_requested.name, t_english.name), p.category::text,
    l.locality, l.latitude, l.longitude, p.wheelchair_accessibility::text,
    a.access_condition_count, a.access_area, a.restraint_condition,
    a.permission_requirement, a.access_conditions, a.simple_access_summary
  from private.places p
  join aggregated a on a.place_id = p.id
  join private.locations l on l.id = p.location_id
  left join private.place_translations t_requested on t_requested.place_id = p.id
    and t_requested.locale = case when requested_locale = 'is'
      then 'is'::private.locale_code else 'en'::private.locale_code end
  left join private.place_translations t_english on t_english.place_id = p.id
    and t_english.locale = 'en'::private.locale_code
  where coalesce(t_requested.name, t_english.name) is not null
    and private.has_publishable_geometry(p.id)
  order by coalesce(t_requested.name, t_english.name), p.id;
$$;

create function public.get_published_place_profile_v3(
  requested_place_id uuid,
  requested_locale text
)
returns table (
  place_id uuid, name text, description text, category text, address_line text, locality text,
  postal_code text, latitude double precision, longitude double precision, website_url text,
  phone text, wheelchair_accessibility text, opening_hours jsonb, dog_amenities jsonb,
  access_condition_id uuid, access_area text, access_area_note text,
  restraint_condition text, restraint_note text, dog_eligibility jsonb,
  availability_state text, availability_window jsonb, permission_requirement text,
  access_information_urls jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(t_requested.name, t_english.name),
    coalesce(t_requested.description, t_english.description), p.category::text,
    l.address_line, l.locality, l.postal_code, l.latitude, l.longitude, p.website_url,
    p.phone, p.wheelchair_accessibility::text, p.opening_hours, p.dog_amenities,
    c.id, c.access_area::text, c.access_area_note, c.restraint_condition::text,
    c.restraint_note, c.dog_eligibility, c.availability_state::text,
    c.availability_window, c.permission_requirement::text,
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
    and t_requested.locale = case when requested_locale = 'is'
      then 'is'::private.locale_code else 'en'::private.locale_code end
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

revoke execute on function public.create_candidate_place(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.update_place_wheelchair_accessibility(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.get_moderation_place_review_v2(uuid)
  from public, anon, service_role;
revoke execute on function public.list_published_places_v3(text)
  from public, service_role;
revoke execute on function public.get_published_place_profile_v3(uuid, text)
  from public, service_role;

grant execute on function public.create_candidate_place(jsonb, uuid) to authenticated;
grant execute on function public.update_place_wheelchair_accessibility(jsonb, uuid)
  to authenticated;
grant execute on function public.get_moderation_place_review_v2(uuid) to authenticated;
grant execute on function public.list_published_places_v3(text) to anon, authenticated;
grant execute on function public.get_published_place_profile_v3(uuid, text)
  to anon, authenticated;

comment on column private.places.wheelchair_accessibility is
  'Moderator-maintained factual wheelchair accessibility state. Unknown is explicit.';
comment on function public.update_place_wheelchair_accessibility(jsonb, uuid) is
  'Version-checked Moderator update for a Candidate or Published Place wheelchair accessibility fact.';
comment on function public.list_published_places_v3(text) is
  'Compact published directory projection with wheelchair accessibility and bounded dog-access states.';
comment on function public.get_published_place_profile_v3(uuid, text) is
  'Published Place details including wheelchair accessibility without private moderation state.';

commit;
