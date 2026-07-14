begin;

create type private.location_geometry_precision as enum (
  'moderator_confirmed_point',
  'official_address_point',
  'official_representative_centroid',
  'municipality_anchor_pending_geocode'
);

alter table private.locations
  add column geometry_precision private.location_geometry_precision,
  add column geometry_source text;

with inferred as (
  select
    place_record.location_id,
    case
      when bool_or(
        evidence_record.source_metadata ->> 'geometryPrecision'
          = 'municipality_anchor_pending_geocode'
        or evidence_record.source_metadata ->> 'geometryNeeded' = 'true'
      ) then 'municipality_anchor_pending_geocode'::private.location_geometry_precision
      when bool_or(
        evidence_record.source_metadata ->> 'geometryPrecision' = 'official_address_point'
      ) then 'official_address_point'::private.location_geometry_precision
      when bool_or(
        evidence_record.source_metadata ->> 'geometryPrecision'
          in ('official_representative_centroid', 'geoservice_polygon_centroid')
      ) then 'official_representative_centroid'::private.location_geometry_precision
      else 'municipality_anchor_pending_geocode'::private.location_geometry_precision
    end as geometry_precision,
    coalesce(
      max(nullif(btrim(evidence_record.source_metadata ->> 'geometryNote'), '')),
      max(nullif(btrim(evidence_record.source_url), '')),
      max(evidence_record.source_label)
    ) as geometry_source
  from private.places as place_record
  join private.evidence as evidence_record on evidence_record.place_id = place_record.id
  where evidence_record.source_metadata ?| array['geometryPrecision', 'geometryNeeded']
  group by place_record.location_id
)
update private.locations as location_record
set geometry_precision = inferred.geometry_precision,
  geometry_source = inferred.geometry_source
from inferred
where location_record.id = inferred.location_id;

update private.locations
set geometry_precision = 'municipality_anchor_pending_geocode',
  geometry_source = 'Geometry pending Moderator review'
where geometry_precision is null;

alter table private.locations
  alter column geometry_precision set default 'municipality_anchor_pending_geocode',
  alter column geometry_precision set not null,
  alter column geometry_source set default 'Geometry pending Moderator review',
  alter column geometry_source set not null,
  add constraint locations_geometry_source_present_check check (btrim(geometry_source) <> '');

create function private.has_publishable_geometry(requested_place_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.places as place_record
    join private.locations as location_record on location_record.id = place_record.location_id
    where place_record.id = requested_place_id
      and location_record.geometry_precision
        <> 'municipality_anchor_pending_geocode'::private.location_geometry_precision
      and nullif(btrim(location_record.geometry_source), '') is not null
  )
$$;

create or replace function private.is_place_discoverable(requested_place_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_publishable_geometry(requested_place_id) and exists (
    select 1
    from private.places as place_record
    join private.access_conditions as access_condition
      on access_condition.place_id = place_record.id
     and access_condition.superseded_at is null
    join private.verifications as verification
      on verification.access_condition_id = access_condition.id
     and verification.status = 'verified'::private.verification_status
     and verification.superseded_at is null
    where place_record.id = requested_place_id
      and place_record.lifecycle = 'published'::private.place_lifecycle
      and exists (
        select 1
        from private.verification_evidence as evidence_link
        where evidence_link.verification_id = verification.id
      )
  )
$$;

-- The Storage SELECT policy calls this predicate directly, so the object boundary must enforce
-- the same Place publication contract as discovery. Filtering the photo-list RPC alone would
-- leave a previously exposed object readable after its Place is quarantined.
create or replace function private.is_approved_photo_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.place_media as media
    where media.storage_bucket = 'place-photos'
      and media.storage_object_path = object_name
      and media.kind = 'photo'
      and media.approval_state = 'approved'
      and media.retired_at is null
      and private.has_publishable_geometry(media.place_id)
      and exists (
        select 1
        from private.places as place_record
        where place_record.id = media.place_id
          and place_record.lifecycle = 'published'::private.place_lifecycle
      )
  )
$$;

comment on function private.is_approved_photo_object(text) is
  'The Storage RLS gate for public photo reads. A matching approved, non-retired photo is readable only while its Place is Published with publishable geometry. Already-issued signed URLs retain their five-minute expiry behavior.';

alter function public.create_candidate_place(jsonb, uuid)
  rename to create_candidate_place_pre_geometry;
alter function public.create_candidate_place_pre_geometry(jsonb, uuid)
  set schema private;
revoke execute on function private.create_candidate_place_pre_geometry(jsonb, uuid)
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
  from private.create_candidate_place_pre_geometry(command_payload, command_request_id) as candidate;

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
    raise exception using errcode = '22023', message = 'Candidate geometry quality is invalid';
end;
$$;

alter function public.verify_and_publish_place(jsonb, uuid)
  rename to verify_and_publish_place_pre_geometry;
alter function public.verify_and_publish_place_pre_geometry(jsonb, uuid)
  set schema private;
revoke execute on function private.verify_and_publish_place_pre_geometry(jsonb, uuid)
  from public, anon, authenticated, service_role;

create function public.verify_and_publish_place(command_payload jsonb, command_request_id uuid)
returns table (place_id uuid, verification_ids uuid[], version bigint, published_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  requested_place_id uuid;
  location_precision private.location_geometry_precision;
  location_source text;
begin
  perform security.require_moderator();
  requested_place_id := (command_payload ->> 'place_id')::uuid;

  select location_record.geometry_precision, location_record.geometry_source
  into location_precision, location_source
  from private.places as place_record
  join private.locations as location_record on location_record.id = place_record.location_id
  where place_record.id = requested_place_id;

  if not found then
    raise exception using errcode = '22023', message = 'Place not found';
  end if;
  if location_precision = 'municipality_anchor_pending_geocode'
    or nullif(btrim(location_source), '') is null
  then
    raise exception using errcode = '22023', message = 'Location geometry is pending';
  end if;

  return query
  select publication.place_id, publication.verification_ids,
    publication.version, publication.published_at
  from private.verify_and_publish_place_pre_geometry(
    command_payload, command_request_id
  ) as publication;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Publication command is invalid';
end;
$$;

drop function public.get_moderation_place_review(uuid);

create function public.get_moderation_place_review(requested_place_id uuid)
returns table (
  place_id uuid, version bigint, lifecycle text, operator_name text, category text,
  address_line text, locality text, postal_code text, municipality text,
  latitude double precision, longitude double precision,
  geometry_precision text, geometry_source text,
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

alter function public.list_published_places(text)
  rename to list_published_places_pre_geometry;
alter function public.list_published_places_pre_geometry(text)
  set schema private;
revoke execute on function private.list_published_places_pre_geometry(text)
  from public, anon, authenticated, service_role;

create function public.list_published_places(requested_locale text)
returns table (
  place_id uuid, name text, category text, locality text, latitude double precision,
  longitude double precision, access_condition_count bigint, access_area text,
  restraint_condition text, permission_requirement text, access_conditions jsonb,
  simple_access_summary boolean, verified_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select published_place.*
  from private.list_published_places_pre_geometry(requested_locale) as published_place
  where private.has_publishable_geometry(published_place.place_id)
$$;

alter function public.get_published_place_profile(uuid, text)
  rename to get_published_place_profile_pre_geometry;
alter function public.get_published_place_profile_pre_geometry(uuid, text)
  set schema private;
revoke execute on function private.get_published_place_profile_pre_geometry(uuid, text)
  from public, anon, authenticated, service_role;

create function public.get_published_place_profile(
  requested_place_id uuid,
  requested_locale text
)
returns table (
  place_id uuid, name text, description text, category text, address_line text,
  locality text, postal_code text, latitude double precision, longitude double precision,
  website_url text, phone text, opening_hours jsonb, dog_amenities jsonb,
  access_condition_id uuid, access_area text, access_area_note text,
  restraint_condition text, restraint_note text, dog_eligibility jsonb,
  availability_window jsonb, permission_requirement text, evidence_sources jsonb,
  verified_at timestamptz, freshness_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select published_profile.*
  from private.get_published_place_profile_pre_geometry(
    requested_place_id, requested_locale
  ) as published_profile
  where private.has_publishable_geometry(published_profile.place_id)
$$;

alter function public.record_check_in(uuid, text, uuid)
  rename to record_check_in_pre_geometry;
alter function public.record_check_in_pre_geometry(uuid, text, uuid)
  set schema private;
revoke execute on function private.record_check_in_pre_geometry(uuid, text, uuid)
  from public, anon, authenticated, service_role;

create function public.record_check_in(
  requested_place_id uuid,
  requested_proximity_status text,
  command_request_id uuid
)
returns table (
  check_in_id uuid, place_id uuid, proximity_confirmed text,
  checked_in_at timestamptz, already_checked_in boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform security.require_member();
  if not private.has_publishable_geometry(requested_place_id) then
    raise exception using errcode = '22023', message = 'Publishable Place geometry required';
  end if;
  return query
  select check_in.*
  from private.record_check_in_pre_geometry(
    requested_place_id, requested_proximity_status, command_request_id
  ) as check_in;
end;
$$;

alter function public.list_personal_places(text, text, integer, timestamptz, uuid)
  rename to list_personal_places_pre_geometry;
alter function public.list_personal_places_pre_geometry(text, text, integer, timestamptz, uuid)
  set schema private;
revoke execute on function private.list_personal_places_pre_geometry(
  text, text, integer, timestamptz, uuid
) from public, anon, authenticated, service_role;

create function public.list_personal_places(
  requested_locale text,
  requested_filter text default 'all',
  requested_limit integer default 50,
  requested_before_activity_at timestamptz default null,
  requested_before_place_id uuid default null
)
returns table (
  place_id uuid, name text, category text, locality text,
  latitude double precision, longitude double precision, is_favourite boolean,
  favourited_at timestamptz, visit_count integer, first_visited_at timestamptz,
  last_visited_at timestamptz, last_activity_at timestamptz, availability text,
  successor_place_id uuid, successor_name text, successor_available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select history.place_id, history.name, history.category, history.locality,
    case when private.has_publishable_geometry(history.place_id) then history.latitude end,
    case when private.has_publishable_geometry(history.place_id) then history.longitude end,
    history.is_favourite, history.favourited_at, history.visit_count,
    history.first_visited_at, history.last_visited_at, history.last_activity_at,
    history.availability, history.successor_place_id, history.successor_name,
    history.successor_available
  from private.list_personal_places_pre_geometry(
    requested_locale, requested_filter, requested_limit,
    requested_before_activity_at, requested_before_place_id
  ) as history
$$;

alter function public.list_personal_check_ins(text, integer, timestamptz, uuid)
  rename to list_personal_check_ins_pre_geometry;
alter function public.list_personal_check_ins_pre_geometry(text, integer, timestamptz, uuid)
  set schema private;
revoke execute on function private.list_personal_check_ins_pre_geometry(
  text, integer, timestamptz, uuid
) from public, anon, authenticated, service_role;

create function public.list_personal_check_ins(
  requested_locale text,
  requested_limit integer default 50,
  requested_before_checked_in_at timestamptz default null,
  requested_before_check_in_id uuid default null
)
returns table (
  check_in_id uuid, place_id uuid, name text, category text, locality text,
  latitude double precision, longitude double precision, checked_in_at timestamptz,
  availability text, successor_place_id uuid, successor_name text,
  successor_available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select history.check_in_id, history.place_id, history.name, history.category,
    history.locality,
    case when private.has_publishable_geometry(history.place_id) then history.latitude end,
    case when private.has_publishable_geometry(history.place_id) then history.longitude end,
    history.checked_in_at, history.availability, history.successor_place_id,
    history.successor_name, history.successor_available
  from private.list_personal_check_ins_pre_geometry(
    requested_locale, requested_limit, requested_before_checked_in_at,
    requested_before_check_in_id
  ) as history
$$;

alter function public.list_published_place_photos(uuid)
  rename to list_published_place_photos_pre_geometry;
alter function public.list_published_place_photos_pre_geometry(uuid)
  set schema private;
revoke execute on function private.list_published_place_photos_pre_geometry(uuid)
  from public, anon, authenticated, service_role;

create function public.list_published_place_photos(requested_place_id uuid)
returns table (
  media_id uuid, storage_bucket text, storage_object_path text, width_px integer,
  height_px integer, alt_text_is text, alt_text_en text, rights_basis text,
  source_url text, license_reference text, license_url text, attribution_text text,
  attribution_url text, is_primary boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select photo.*
  from private.list_published_place_photos_pre_geometry(requested_place_id) as photo
  where private.has_publishable_geometry(requested_place_id)
$$;

create function public.update_candidate_place_location(
  command_payload jsonb,
  command_request_id uuid
)
returns table (
  place_id uuid,
  geometry_precision text,
  version bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  requested_place_id uuid := (command_payload ->> 'place_id')::uuid;
  expected_place_version bigint := (command_payload ->> 'expected_version')::bigint;
  requested_precision private.location_geometry_precision :=
    (command_payload ->> 'geometry_precision')::private.location_geometry_precision;
  requested_source text := nullif(btrim(command_payload ->> 'geometry_source'), '');
  place_record private.places%rowtype;
  old_location private.locations%rowtype;
  corrected_location private.locations%rowtype;
  corrected_location_id uuid;
  next_version bigint;
begin
  if command_request_id is null or requested_source is null then
    raise exception using errcode = '22023', message = 'Location correction is incomplete';
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
  if place_record.lifecycle <> 'candidate' then
    raise exception using errcode = '55000', message = 'Place is not a Candidate';
  end if;

  select location_value.* into old_location
  from private.locations as location_value
  where location_value.id = place_record.location_id
  for update;

  if exists (
    select 1 from private.places
    where location_id = old_location.id and id <> requested_place_id
  ) then
    insert into private.locations (
      address_line, locality, postal_code, country_code, municipality, latitude,
      longitude, geometry_precision, geometry_source
    ) values (
      btrim(command_payload ->> 'address_line'), btrim(command_payload ->> 'locality'),
      btrim(command_payload ->> 'postal_code'), 'IS', btrim(command_payload ->> 'municipality'),
      (command_payload ->> 'latitude')::double precision,
      (command_payload ->> 'longitude')::double precision,
      requested_precision, requested_source
    ) returning * into corrected_location;
    corrected_location_id := corrected_location.id;
    update private.places
    set location_id = corrected_location_id
    where id = requested_place_id;
  else
    update private.locations
    set address_line = btrim(command_payload ->> 'address_line'),
      locality = btrim(command_payload ->> 'locality'),
      postal_code = btrim(command_payload ->> 'postal_code'),
      municipality = btrim(command_payload ->> 'municipality'),
      latitude = (command_payload ->> 'latitude')::double precision,
      longitude = (command_payload ->> 'longitude')::double precision,
      geometry_precision = requested_precision,
      geometry_source = requested_source,
      updated_at = statement_timestamp()
    where id = old_location.id;
    corrected_location_id := old_location.id;
  end if;

  if corrected_location.id is null then
    select location_value.* into corrected_location
    from private.locations as location_value
    where location_value.id = corrected_location_id;
  end if;

  next_version := expected_place_version + 1;
  update private.places
  set version = next_version, updated_at = statement_timestamp()
  where id = requested_place_id;

  perform private.append_audit_event(
    'place.location_corrected', 'place', requested_place_id, command_request_id,
    jsonb_build_object(
      'version', next_version,
      'previous_location', jsonb_build_object(
        'id', old_location.id, 'address_line', old_location.address_line,
        'locality', old_location.locality, 'postal_code', old_location.postal_code,
        'municipality', old_location.municipality, 'latitude', old_location.latitude,
        'longitude', old_location.longitude,
        'geometry_precision', old_location.geometry_precision,
        'geometry_source', old_location.geometry_source
      ),
      'location', jsonb_build_object(
        'id', corrected_location.id, 'address_line', corrected_location.address_line,
        'locality', corrected_location.locality, 'postal_code', corrected_location.postal_code,
        'municipality', corrected_location.municipality,
        'latitude', corrected_location.latitude, 'longitude', corrected_location.longitude,
        'geometry_precision', corrected_location.geometry_precision,
        'geometry_source', corrected_location.geometry_source
      ),
      'actor_id', actor_id
    )
  );

  return query select requested_place_id, requested_precision::text, next_version;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Location correction is invalid';
end;
$$;

create function public.quarantine_place_pending_geometry(
  command_payload jsonb,
  command_request_id uuid
)
returns table (place_id uuid, lifecycle text, version bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  requested_place_id uuid := (command_payload ->> 'place_id')::uuid;
  expected_place_version bigint := (command_payload ->> 'expected_version')::bigint;
  quarantine_reason text := nullif(btrim(command_payload ->> 'reason'), '');
  place_record private.places%rowtype;
  old_location private.locations%rowtype;
  quarantined_location private.locations%rowtype;
  superseded_verification_ids uuid[] := '{}'::uuid[];
  next_version bigint;
begin
  if command_request_id is null or quarantine_reason is null then
    raise exception using errcode = '22023', message = 'Geometry quarantine is incomplete';
  end if;

  select place_value.*
  into place_record
  from private.places as place_value
  where place_value.id = requested_place_id
  for update of place_value;
  if not found then
    raise exception using errcode = '22023', message = 'Place not found';
  end if;
  if place_record.version <> expected_place_version then
    raise exception using errcode = '40001', message = 'Place version conflict';
  end if;
  if place_record.lifecycle <> 'published' then
    raise exception using errcode = '55000', message = 'Place is not Published';
  end if;
  select location_value.* into old_location
  from private.locations as location_value
  where location_value.id = place_record.location_id
  for update;

  if exists (
    select 1 from private.places
    where location_id = old_location.id and id <> requested_place_id
  ) then
    insert into private.locations (
      address_line, locality, postal_code, country_code, municipality, latitude,
      longitude, geometry_precision, geometry_source
    ) values (
      old_location.address_line, old_location.locality, old_location.postal_code,
      old_location.country_code, old_location.municipality, old_location.latitude,
      old_location.longitude, 'municipality_anchor_pending_geocode',
      'Geometry quarantined: ' || quarantine_reason
    ) returning * into quarantined_location;
    update private.places
    set location_id = quarantined_location.id
    where id = requested_place_id;
  else
    update private.locations
    set geometry_precision = 'municipality_anchor_pending_geocode',
      geometry_source = 'Geometry quarantined: ' || quarantine_reason,
      updated_at = statement_timestamp()
    where id = old_location.id
    returning * into quarantined_location;
  end if;

  with superseded as (
    update private.verifications as verification
    set superseded_at = statement_timestamp()
    from private.access_conditions as access_condition
    where access_condition.place_id = requested_place_id
      and access_condition.superseded_at is null
      and verification.access_condition_id = access_condition.id
      and verification.superseded_at is null
    returning verification.id
  )
  select coalesce(array_agg(superseded.id order by superseded.id), '{}'::uuid[])
  into superseded_verification_ids
  from superseded;

  next_version := expected_place_version + 1;
  update private.places
  set lifecycle = 'candidate', published_at = null, version = next_version,
    updated_at = statement_timestamp()
  where id = requested_place_id;

  perform private.append_audit_event(
    'place.geometry_quarantined', 'place', requested_place_id, command_request_id,
    jsonb_build_object(
      'version', next_version,
      'previous_lifecycle', 'published',
      'lifecycle', 'candidate',
      'reason', quarantine_reason,
      'previous_location', jsonb_build_object(
        'id', old_location.id, 'address_line', old_location.address_line,
        'locality', old_location.locality, 'postal_code', old_location.postal_code,
        'municipality', old_location.municipality, 'latitude', old_location.latitude,
        'longitude', old_location.longitude,
        'geometry_precision', old_location.geometry_precision,
        'geometry_source', old_location.geometry_source
      ),
      'location', jsonb_build_object(
        'id', quarantined_location.id, 'address_line', quarantined_location.address_line,
        'locality', quarantined_location.locality,
        'postal_code', quarantined_location.postal_code,
        'municipality', quarantined_location.municipality,
        'latitude', quarantined_location.latitude,
        'longitude', quarantined_location.longitude,
        'geometry_precision', quarantined_location.geometry_precision,
        'geometry_source', quarantined_location.geometry_source
      ),
      'superseded_verification_ids', superseded_verification_ids,
      'actor_id', actor_id
    )
  );

  return query select requested_place_id, 'candidate'::text, next_version;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Geometry quarantine is invalid';
end;
$$;

revoke execute on function public.create_candidate_place(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.verify_and_publish_place(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.get_moderation_place_review(uuid)
  from public, anon, service_role;
revoke execute on function public.update_candidate_place_location(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.quarantine_place_pending_geometry(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.record_check_in(uuid, text, uuid)
  from public, anon, service_role;
revoke execute on function public.list_personal_places(
  text, text, integer, timestamptz, uuid
) from public, anon, service_role;
revoke execute on function public.list_personal_check_ins(
  text, integer, timestamptz, uuid
) from public, anon, service_role;
revoke execute on function private.has_publishable_geometry(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.create_candidate_place(jsonb, uuid) to authenticated;
grant execute on function public.verify_and_publish_place(jsonb, uuid) to authenticated;
grant execute on function public.get_moderation_place_review(uuid) to authenticated;
grant execute on function public.update_candidate_place_location(jsonb, uuid) to authenticated;
grant execute on function public.quarantine_place_pending_geometry(jsonb, uuid) to authenticated;
grant execute on function public.record_check_in(uuid, text, uuid) to authenticated;
grant execute on function public.list_personal_places(text, text, integer, timestamptz, uuid)
  to authenticated;
grant execute on function public.list_personal_check_ins(text, integer, timestamptz, uuid)
  to authenticated;

revoke execute on function public.list_published_places(text) from public, service_role;
revoke execute on function public.get_published_place_profile(uuid, text) from public, service_role;
grant execute on function public.list_published_places(text) to anon, authenticated;
grant execute on function public.get_published_place_profile(uuid, text) to anon, authenticated;
revoke execute on function public.list_published_place_photos(uuid) from public, service_role;
grant execute on function public.list_published_place_photos(uuid) to anon, authenticated;

comment on column private.locations.geometry_precision is
  'Reviewable confidence class for persisted WGS84 geometry. Municipality anchors are never publishable.';
comment on column private.locations.geometry_source is
  'Human-readable source or provenance sufficient for Moderator review.';
comment on function public.update_candidate_place_location(jsonb, uuid) is
  'Moderator-only, version-checked, audited correction of Candidate location and geometry quality.';
comment on function public.quarantine_place_pending_geometry(jsonb, uuid) is
  'Moderator-only, version-checked, audited removal of a Published pending-geometry Place from discovery.';

commit;
