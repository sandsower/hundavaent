begin;

alter function public.update_candidate_place_location(jsonb, uuid)
  rename to update_moderated_place_location;

create or replace function public.update_moderated_place_location(
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
  if place_record.lifecycle not in ('candidate', 'published') then
    raise exception using errcode = '55000', message = 'Place cannot be corrected';
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
  requested_place_id uuid := (command_payload ->> 'place_id')::uuid;
  place_lifecycle private.place_lifecycle;
begin
  perform security.require_moderator();

  select place_record.lifecycle into place_lifecycle
  from private.places as place_record
  where place_record.id = requested_place_id;

  if place_lifecycle is distinct from 'candidate'::private.place_lifecycle then
    raise exception using errcode = '55000', message = 'Place is not a Candidate';
  end if;

  return query
  select corrected.place_id, corrected.geometry_precision, corrected.version
  from public.update_moderated_place_location(
    command_payload,
    command_request_id
  ) as corrected;
exception
  when invalid_text_representation then
    raise exception using errcode = '22023', message = 'Location correction is invalid';
end;
$$;

revoke execute on function public.update_moderated_place_location(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.update_candidate_place_location(jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.update_moderated_place_location(jsonb, uuid) to authenticated;
grant execute on function public.update_candidate_place_location(jsonb, uuid) to authenticated;

comment on function public.update_moderated_place_location(jsonb, uuid) is
  'Moderator-only, version-checked, audited correction of Candidate or Published Place location and geometry quality.';
comment on function public.update_candidate_place_location(jsonb, uuid) is
  'Backward-compatible Candidate-only wrapper around update_moderated_place_location.';

commit;
