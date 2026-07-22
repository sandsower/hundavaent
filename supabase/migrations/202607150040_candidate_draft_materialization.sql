begin;

create function private.current_candidate_place_payload(requested_place_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'operator', jsonb_build_object('name', operator.name),
    'location', jsonb_build_object(
      'address_line', location.address_line,
      'locality', location.locality,
      'postal_code', location.postal_code,
      'municipality', location.municipality,
      'latitude', location.latitude,
      'longitude', location.longitude,
      'geometry_precision', location.geometry_precision,
      'geometry_source', location.geometry_source
    ),
    'category', place.category,
    'website_url', place.website_url,
    'phone', place.phone,
    'opening_hours', place.opening_hours,
    'dog_amenities', place.dog_amenities,
    'translations', jsonb_build_object(
      'is', jsonb_build_object(
        'name', translation_is.name,
        'description', translation_is.description
      ),
      'en', jsonb_build_object(
        'name', translation_en.name,
        'description', translation_en.description
      )
    ),
    'access_conditions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', condition.id,
          'access_area', condition.access_area,
          'access_area_note', condition.access_area_note,
          'restraint_condition', condition.restraint_condition,
          'restraint_note', condition.restraint_note,
          'dog_eligibility', condition.dog_eligibility,
          'availability_state', condition.availability_state,
          'availability_window', condition.availability_window,
          'permission_requirement', condition.permission_requirement
        ) order by condition.id
      )
      from private.access_conditions condition
      where condition.place_id = place.id and condition.superseded_at is null
    ), '[]'::jsonb),
    'evidence_records', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', evidence.id,
          'kind', evidence.kind,
          'source_url', evidence.source_url,
          'source_citation', evidence.source_citation,
          'source_label', evidence.source_label,
          'observed_at', evidence.observed_at,
          'source_metadata', evidence.source_metadata
        ) order by evidence.id
      )
      from private.evidence evidence
      where evidence.place_id = place.id
    ), '[]'::jsonb)
  )
  from private.places place
  join private.operators operator on operator.id = place.operator_id
  join private.locations location on location.id = place.location_id
  join private.place_translations translation_is
    on translation_is.place_id = place.id and translation_is.locale = 'is'
  join private.place_translations translation_en
    on translation_en.place_id = place.id and translation_en.locale = 'en'
  where place.id = requested_place_id and place.lifecycle = 'candidate';
$$;

revoke execute on function private.current_candidate_place_payload(uuid)
  from public, anon, authenticated, service_role;

create function private.reopen_candidate_review_on_lifecycle_reversion()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reopened boolean := false;
  reopened_at timestamptz := statement_timestamp();
begin
  if old.lifecycle = 'published' and new.lifecycle = 'candidate' then
    update private.candidate_reviews review
    set status = 'pending',
      version = review.version + 1,
      resolution_request_id = null,
      resolved_at = null,
      updated_at = reopened_at
    where review.place_id = new.id and review.status = 'published';
    reopened := found;

    if reopened then
      insert into private.candidate_review_events (
        place_id, event_kind, moderator_id, occurred_at
      ) values (
        new.id, 'reopened', auth.uid(), reopened_at
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger places_reopen_candidate_review_on_lifecycle_reversion
after update of lifecycle on private.places
for each row execute function private.reopen_candidate_review_on_lifecycle_reversion();

revoke execute on function private.reopen_candidate_review_on_lifecycle_reversion()
  from public, anon, authenticated, service_role;

create function private.merge_candidate_draft_payload(base_payload jsonb, patch_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select (base_payload || patch_payload)
    || case when patch_payload ? 'operator' then jsonb_build_object(
      'operator', coalesce(base_payload -> 'operator', '{}'::jsonb) || (patch_payload -> 'operator')
    ) else '{}'::jsonb end
    || case when patch_payload ? 'location' then jsonb_build_object(
      'location', coalesce(base_payload -> 'location', '{}'::jsonb) || (patch_payload -> 'location')
    ) else '{}'::jsonb end
    || case when patch_payload ? 'translations' then jsonb_build_object(
      'translations',
      coalesce(base_payload -> 'translations', '{}'::jsonb)
        || (patch_payload -> 'translations')
        || case when patch_payload #> '{translations,is}' is not null then jsonb_build_object(
          'is', coalesce(base_payload #> '{translations,is}', '{}'::jsonb)
            || (patch_payload #> '{translations,is}')
        ) else '{}'::jsonb end
        || case when patch_payload #> '{translations,en}' is not null then jsonb_build_object(
          'en', coalesce(base_payload #> '{translations,en}', '{}'::jsonb)
            || (patch_payload #> '{translations,en}')
        ) else '{}'::jsonb end
    ) else '{}'::jsonb end;
$$;

revoke execute on function private.merge_candidate_draft_payload(jsonb, jsonb)
  from public, anon, authenticated, service_role;

create function private.normalize_candidate_draft_payload(
  requested_place_id uuid,
  requested_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  normalized_payload jsonb := requested_payload;
  normalized_conditions jsonb := '[]'::jsonb;
  normalized_evidence jsonb := '[]'::jsonb;
  item jsonb;
  item_id uuid;
begin
  if jsonb_typeof(requested_payload) is distinct from 'object'
    or jsonb_typeof(requested_payload -> 'access_conditions') is distinct from 'array'
    or jsonb_typeof(requested_payload -> 'evidence_records') is distinct from 'array'
  then
    raise exception using errcode = '22023', message = 'Candidate draft shape is invalid';
  end if;

  for item in select value from jsonb_array_elements(requested_payload -> 'access_conditions') loop
    item_id := coalesce((item ->> 'id')::uuid, extensions.gen_random_uuid());
    if exists (select 1 from private.access_conditions condition where condition.id = item_id)
      and not exists (
        select 1 from private.access_conditions condition
        where condition.id = item_id and condition.place_id = requested_place_id
          and condition.superseded_at is null
      )
    then
      raise exception using errcode = '22023', message = 'Candidate draft Access Condition is invalid';
    end if;
    normalized_conditions := normalized_conditions || jsonb_build_array(
      (item - 'id') || jsonb_build_object('id', item_id)
    );
  end loop;

  if (
    select count(*) <> count(distinct value ->> 'id')
    from jsonb_array_elements(normalized_conditions)
  ) then
    raise exception using errcode = '22023', message = 'Candidate draft Access Conditions are duplicated';
  end if;

  for item in select value from jsonb_array_elements(requested_payload -> 'evidence_records') loop
    item_id := coalesce((item ->> 'id')::uuid, extensions.gen_random_uuid());
    if exists (select 1 from private.evidence evidence where evidence.id = item_id)
      and not exists (
        select 1 from private.evidence evidence
        where evidence.id = item_id and evidence.place_id = requested_place_id
      )
    then
      raise exception using errcode = '22023', message = 'Candidate draft Evidence is invalid';
    end if;
    normalized_evidence := normalized_evidence || jsonb_build_array(
      (item - 'id') || jsonb_build_object('id', item_id)
    );
  end loop;

  if (
    select count(*) <> count(distinct value ->> 'id')
    from jsonb_array_elements(normalized_evidence)
  ) then
    raise exception using errcode = '22023', message = 'Candidate draft Evidence is duplicated';
  end if;

  return normalized_payload
    || jsonb_build_object('access_conditions', normalized_conditions)
    || jsonb_build_object('evidence_records', normalized_evidence);
exception
  when invalid_text_representation then
    raise exception using errcode = '22023', message = 'Candidate draft child identifier is invalid';
end;
$$;

revoke execute on function private.normalize_candidate_draft_payload(uuid, jsonb)
  from public, anon, authenticated, service_role;

drop function public.save_candidate_place_moderation_draft(
  uuid, bigint, bigint, text, jsonb, uuid
);

create function public.save_candidate_place_moderation_draft(
  requested_place_id uuid,
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
  review_record private.candidate_reviews%rowtype;
  base_payload jsonb;
  complete_payload jsonb;
begin
  if jsonb_typeof(requested_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Candidate draft command is invalid';
  end if;

  select review.* into review_record
  from private.candidate_reviews review
  join private.places place on place.id = review.place_id
  where review.place_id = requested_place_id and place.lifecycle = 'candidate'
  for update of review;
  if not found then
    raise exception using errcode = '22023', message = 'Candidate Place was not found';
  end if;
  if review_record.version <> expected_item_version then
    raise exception using errcode = '40001', message = 'Moderation item changed';
  end if;
  if review_record.status = 'rejected' then
    raise exception using errcode = '55006', message = 'Candidate review is resolved';
  end if;

  select draft.payload into base_payload
  from private.moderation_drafts draft
  where draft.candidate_place_id = requested_place_id;
  base_payload := coalesce(base_payload, private.current_candidate_place_payload(requested_place_id));
  if base_payload is null then
    raise exception using errcode = '22023', message = 'Candidate Place aggregate is incomplete';
  end if;

  complete_payload := private.normalize_candidate_draft_payload(
    requested_place_id,
    private.merge_candidate_draft_payload(base_payload, requested_payload)
  );

  return query select * from private.save_moderation_draft(
    'candidate_place', requested_place_id, expected_draft_version,
    requested_section_id, complete_payload, command_request_id, actor_id
  );
end;
$$;

revoke execute on function public.save_candidate_place_moderation_draft(
  uuid, bigint, bigint, text, jsonb, uuid
) from public, anon, service_role;
grant execute on function public.save_candidate_place_moderation_draft(
  uuid, bigint, bigint, text, jsonb, uuid
) to authenticated;

create function private.materialize_candidate_draft(
  requested_place_id uuid,
  requested_payload jsonb,
  actor_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  place_record private.places%rowtype;
  operator_record private.operators%rowtype;
  location_record private.locations%rowtype;
  requested_operator_id uuid;
  requested_location_id uuid;
  shared_count bigint;
  item jsonb;
  item_id uuid;
  item_exists boolean;
  materialized_at timestamptz := statement_timestamp();
begin
  if not private.jsonb_has_only_keys(
    requested_payload,
    array[
      'operator', 'location', 'category', 'website_url', 'phone', 'opening_hours',
      'dog_amenities', 'translations', 'access_conditions', 'evidence_records'
    ]
  )
    or jsonb_typeof(requested_payload -> 'operator') is distinct from 'object'
    or jsonb_typeof(requested_payload -> 'location') is distinct from 'object'
    or jsonb_typeof(requested_payload -> 'translations') is distinct from 'object'
    or jsonb_typeof(requested_payload -> 'access_conditions') is distinct from 'array'
    or jsonb_array_length(requested_payload -> 'access_conditions') = 0
    or jsonb_typeof(requested_payload -> 'evidence_records') is distinct from 'array'
    or jsonb_array_length(requested_payload -> 'evidence_records') = 0
    or nullif(btrim(requested_payload #>> '{operator,name}'), '') is null
    or nullif(btrim(requested_payload #>> '{location,address_line}'), '') is null
    or nullif(btrim(requested_payload #>> '{location,locality}'), '') is null
    or nullif(btrim(requested_payload #>> '{location,postal_code}'), '') is null
    or nullif(btrim(requested_payload #>> '{location,municipality}'), '') is null
    or nullif(btrim(requested_payload #>> '{location,geometry_source}'), '') is null
    or nullif(btrim(requested_payload #>> '{translations,is,name}'), '') is null
    or nullif(btrim(requested_payload #>> '{translations,is,description}'), '') is null
    or nullif(btrim(requested_payload #>> '{translations,en,name}'), '') is null
    or nullif(btrim(requested_payload #>> '{translations,en,description}'), '') is null
    or jsonb_typeof(requested_payload -> 'opening_hours') is distinct from 'object'
    or jsonb_typeof(requested_payload -> 'dog_amenities') is distinct from 'array'
  then
    raise exception using errcode = '22023', message = 'Candidate draft is not ready to publish';
  end if;

  select place.* into place_record
  from private.places place
  where place.id = requested_place_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Place not found';
  end if;

  select operator.* into operator_record
  from private.operators operator
  where operator.id = place_record.operator_id
  for update;

  select location.* into location_record
  from private.locations location
  where location.id = place_record.location_id
  for update;

  perform 1 from private.access_conditions condition
  where condition.place_id = requested_place_id order by condition.id for update;
  perform 1 from private.evidence evidence
  where evidence.place_id = requested_place_id order by evidence.id for update;

  requested_operator_id := operator_record.id;
  if operator_record.name is distinct from btrim(requested_payload #>> '{operator,name}') then
    select count(*) into shared_count
    from private.places place where place.operator_id = operator_record.id;
    if shared_count = 1 then
      update private.operators
      set name = btrim(requested_payload #>> '{operator,name}'), updated_at = materialized_at
      where id = operator_record.id;
    else
      insert into private.operators (name)
      values (btrim(requested_payload #>> '{operator,name}'))
      returning id into requested_operator_id;
    end if;
  end if;

  requested_location_id := location_record.id;
  if location_record.address_line is distinct from btrim(requested_payload #>> '{location,address_line}')
    or location_record.locality is distinct from btrim(requested_payload #>> '{location,locality}')
    or location_record.postal_code is distinct from btrim(requested_payload #>> '{location,postal_code}')
    or location_record.municipality is distinct from btrim(requested_payload #>> '{location,municipality}')
    or location_record.latitude is distinct from (requested_payload #>> '{location,latitude}')::double precision
    or location_record.longitude is distinct from (requested_payload #>> '{location,longitude}')::double precision
    or location_record.geometry_precision is distinct from
      (requested_payload #>> '{location,geometry_precision}')::private.location_geometry_precision
    or location_record.geometry_source is distinct from btrim(requested_payload #>> '{location,geometry_source}')
  then
    select location.id into requested_location_id
    from private.locations location
    where location.address_line = btrim(requested_payload #>> '{location,address_line}')
      and location.locality = btrim(requested_payload #>> '{location,locality}')
      and location.postal_code = btrim(requested_payload #>> '{location,postal_code}')
      and location.municipality = btrim(requested_payload #>> '{location,municipality}')
      and location.latitude = (requested_payload #>> '{location,latitude}')::double precision
      and location.longitude = (requested_payload #>> '{location,longitude}')::double precision
      and location.geometry_precision =
        (requested_payload #>> '{location,geometry_precision}')::private.location_geometry_precision
      and location.geometry_source = btrim(requested_payload #>> '{location,geometry_source}')
    limit 1;

    if requested_location_id is null then
      select count(*) into shared_count
      from private.places place where place.location_id = location_record.id;
      if shared_count = 1 then
        requested_location_id := location_record.id;
        update private.locations
        set address_line = btrim(requested_payload #>> '{location,address_line}'),
          locality = btrim(requested_payload #>> '{location,locality}'),
          postal_code = btrim(requested_payload #>> '{location,postal_code}'),
          municipality = btrim(requested_payload #>> '{location,municipality}'),
          latitude = (requested_payload #>> '{location,latitude}')::double precision,
          longitude = (requested_payload #>> '{location,longitude}')::double precision,
          geometry_precision =
            (requested_payload #>> '{location,geometry_precision}')::private.location_geometry_precision,
          geometry_source = btrim(requested_payload #>> '{location,geometry_source}'),
          updated_at = materialized_at
        where id = location_record.id;
      else
        insert into private.locations (
          address_line, locality, postal_code, municipality, latitude, longitude,
          geometry_precision, geometry_source
        ) values (
          btrim(requested_payload #>> '{location,address_line}'),
          btrim(requested_payload #>> '{location,locality}'),
          btrim(requested_payload #>> '{location,postal_code}'),
          btrim(requested_payload #>> '{location,municipality}'),
          (requested_payload #>> '{location,latitude}')::double precision,
          (requested_payload #>> '{location,longitude}')::double precision,
          (requested_payload #>> '{location,geometry_precision}')::private.location_geometry_precision,
          btrim(requested_payload #>> '{location,geometry_source}')
        ) returning id into requested_location_id;
      end if;
    end if;
  end if;

  if exists (
    select 1 from private.places sibling
    where sibling.id <> requested_place_id
      and sibling.lifecycle <> 'inactive'
      and sibling.operator_id = requested_operator_id
      and sibling.location_id = requested_location_id
      and lower(sibling.purpose) = lower(place_record.purpose)
  ) then
    raise exception using errcode = '22023', message = 'Candidate identity conflicts with an active Place';
  end if;

  update private.places
  set operator_id = requested_operator_id,
    location_id = requested_location_id,
    category = (requested_payload ->> 'category')::private.place_category,
    website_url = nullif(btrim(requested_payload ->> 'website_url'), ''),
    phone = nullif(btrim(requested_payload ->> 'phone'), ''),
    opening_hours = requested_payload -> 'opening_hours',
    dog_amenities = requested_payload -> 'dog_amenities',
    updated_at = materialized_at
  where id = requested_place_id;

  update private.place_translations
  set name = btrim(requested_payload #>> '{translations,is,name}'),
    description = btrim(requested_payload #>> '{translations,is,description}'),
    updated_at = materialized_at
  where place_id = requested_place_id and locale = 'is';
  update private.place_translations
  set name = btrim(requested_payload #>> '{translations,en,name}'),
    description = btrim(requested_payload #>> '{translations,en,description}'),
    updated_at = materialized_at
  where place_id = requested_place_id and locale = 'en';

  for item in select value from jsonb_array_elements(requested_payload -> 'access_conditions') loop
    if not private.jsonb_has_only_keys(
      item,
      array[
        'id', 'access_area', 'access_area_note', 'restraint_condition', 'restraint_note',
        'dog_eligibility', 'availability_state', 'availability_window', 'permission_requirement'
      ]
    ) then
      raise exception using errcode = '22023', message = 'Candidate draft Access Condition is invalid';
    end if;
    perform private.validate_access_condition_value(item - 'id');
    item_id := (item ->> 'id')::uuid;
    select exists (
      select 1 from private.access_conditions condition
      where condition.id = item_id and condition.place_id = requested_place_id
        and condition.superseded_at is null
    ) into item_exists;
    if item_exists then
      if exists (select 1 from private.verifications where access_condition_id = item_id)
        or exists (select 1 from private.access_disputes where access_condition_id = item_id)
        or exists (
          select 1 from private.place_flags
          where access_condition_id = item_id or applied_access_condition_id = item_id
        )
      then
        if exists (
          select 1 from private.access_conditions condition
          where condition.id = item_id and (
            condition.access_area is distinct from (item ->> 'access_area')::private.access_area
            or condition.access_area_note is distinct from nullif(btrim(item ->> 'access_area_note'), '')
            or condition.restraint_condition is distinct from
              (item ->> 'restraint_condition')::private.restraint_condition
            or condition.restraint_note is distinct from nullif(btrim(item ->> 'restraint_note'), '')
            or condition.dog_eligibility is distinct from item -> 'dog_eligibility'
            or condition.availability_state is distinct from private.resolve_access_availability(item)
            or condition.availability_window is distinct from item -> 'availability_window'
            or condition.permission_requirement is distinct from
              (item ->> 'permission_requirement')::private.permission_requirement
          )
        ) then
          raise exception using errcode = '22023', message = 'Referenced Access Condition cannot be edited';
        end if;
      else
        update private.access_conditions
        set access_area = (item ->> 'access_area')::private.access_area,
          access_area_note = nullif(btrim(item ->> 'access_area_note'), ''),
          restraint_condition = (item ->> 'restraint_condition')::private.restraint_condition,
          restraint_note = nullif(btrim(item ->> 'restraint_note'), ''),
          dog_eligibility = item -> 'dog_eligibility',
          availability_state = private.resolve_access_availability(item),
          availability_window = item -> 'availability_window',
          permission_requirement = (item ->> 'permission_requirement')::private.permission_requirement
        where id = item_id;
      end if;
    else
      if exists (select 1 from private.access_conditions where id = item_id) then
        raise exception using errcode = '22023', message = 'Candidate draft Access Condition is invalid';
      end if;
      insert into private.access_conditions (
        id, place_id, revision, access_area, access_area_note, restraint_condition,
        restraint_note, dog_eligibility, availability_state, availability_window,
        permission_requirement, created_by
      ) values (
        item_id, requested_place_id, 1,
        (item ->> 'access_area')::private.access_area,
        nullif(btrim(item ->> 'access_area_note'), ''),
        (item ->> 'restraint_condition')::private.restraint_condition,
        nullif(btrim(item ->> 'restraint_note'), ''),
        item -> 'dog_eligibility', private.resolve_access_availability(item),
        item -> 'availability_window',
        (item ->> 'permission_requirement')::private.permission_requirement, actor_id
      );
    end if;
  end loop;

  update private.access_conditions condition
  set superseded_at = materialized_at
  where condition.place_id = requested_place_id
    and condition.superseded_at is null
    and not exists (
      select 1
      from jsonb_array_elements(requested_payload -> 'access_conditions') desired_item(value)
      where (desired_item.value ->> 'id')::uuid = condition.id
    );

  for item in select value from jsonb_array_elements(requested_payload -> 'evidence_records') loop
    if not private.jsonb_has_only_keys(
      item,
      array[
        'id', 'kind', 'source_url', 'source_citation', 'source_label',
        'observed_at', 'source_metadata'
      ]
    )
      or nullif(btrim(item ->> 'source_label'), '') is null
      or (nullif(btrim(item ->> 'source_url'), '') is null
        and nullif(btrim(item ->> 'source_citation'), '') is null)
      or jsonb_typeof(item -> 'source_metadata') is distinct from 'object'
    then
      raise exception using errcode = '22023', message = 'Candidate draft Evidence is invalid';
    end if;
    item_id := (item ->> 'id')::uuid;
    select exists (
      select 1 from private.evidence evidence
      where evidence.id = item_id and evidence.place_id = requested_place_id
    ) into item_exists;
    if item_exists then
      if exists (select 1 from private.verification_evidence where evidence_id = item_id)
        or exists (select 1 from private.access_dispute_evidence where evidence_id = item_id)
      then
        if exists (
          select 1 from private.evidence evidence
          where evidence.id = item_id and (
            evidence.kind is distinct from (item ->> 'kind')::private.evidence_kind
            or evidence.source_url is distinct from nullif(btrim(item ->> 'source_url'), '')
            or evidence.source_citation is distinct from nullif(btrim(item ->> 'source_citation'), '')
            or evidence.source_label is distinct from btrim(item ->> 'source_label')
            or evidence.observed_at is distinct from (item ->> 'observed_at')::timestamptz
            or evidence.source_metadata is distinct from item -> 'source_metadata'
          )
        ) then
          raise exception using errcode = '22023', message = 'Referenced Evidence cannot be edited';
        end if;
      else
        update private.evidence
        set kind = (item ->> 'kind')::private.evidence_kind,
          source_url = nullif(btrim(item ->> 'source_url'), ''),
          source_citation = nullif(btrim(item ->> 'source_citation'), ''),
          source_label = btrim(item ->> 'source_label'),
          observed_at = (item ->> 'observed_at')::timestamptz,
          source_metadata = item -> 'source_metadata'
        where id = item_id;
      end if;
    else
      if exists (select 1 from private.evidence where id = item_id) then
        raise exception using errcode = '22023', message = 'Candidate draft Evidence is invalid';
      end if;
      insert into private.evidence (
        id, place_id, kind, source_url, source_citation, source_label,
        observed_at, recorded_by, source_metadata
      ) values (
        item_id, requested_place_id, (item ->> 'kind')::private.evidence_kind,
        nullif(btrim(item ->> 'source_url'), ''),
        nullif(btrim(item ->> 'source_citation'), ''), btrim(item ->> 'source_label'),
        (item ->> 'observed_at')::timestamptz, actor_id, item -> 'source_metadata'
      );
    end if;
  end loop;
exception
  when invalid_text_representation or check_violation or not_null_violation
    or unique_violation or foreign_key_violation then
    raise exception using errcode = '22023', message = 'Candidate draft is invalid';
end;
$$;

revoke execute on function private.materialize_candidate_draft(uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;

drop function public.verify_and_publish_place(jsonb, uuid);

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
  expected_item_version bigint := (command_payload ->> 'expected_item_version')::bigint;
  expected_draft_version bigint := (command_payload ->> 'expected_draft_version')::bigint;
  review_record private.candidate_reviews%rowtype;
  place_record private.places%rowtype;
  draft_record private.moderation_drafts%rowtype;
  result_record record;
begin
  if command_request_id is null or jsonb_typeof(command_payload) is distinct from 'object'
    or requested_place_id is null
    or not (command_payload ?& array[
      'expected_version', 'expected_item_version', 'expected_draft_version',
      'condition_verifications', 'freshness_until', 'decision_metadata'
    ])
    or jsonb_typeof(command_payload -> 'decision_metadata') is distinct from 'object'
  then
    raise exception using errcode = '22023', message = 'Publication command is incomplete';
  end if;

  select review.* into review_record
  from private.candidate_reviews review
  where review.place_id = requested_place_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Candidate review was not found';
  end if;

  if review_record.status = 'published'
    and review_record.resolution_request_id = command_request_id
  then
    return query
    select requested_place_id,
      coalesce(array_agg(verification.id order by verification.id), array[]::uuid[]),
      place.version,
      review_record.resolved_at
    from private.places place
    left join private.access_conditions condition
      on condition.place_id = place.id and condition.superseded_at is null
    left join private.verifications verification
      on verification.access_condition_id = condition.id
      and verification.verified_at = review_record.resolved_at
    where place.id = requested_place_id
    group by place.version;
    return;
  end if;

  if review_record.status not in ('pending', 'needs_information') then
    raise exception using errcode = '55000', message = 'Candidate review is not publishable';
  end if;
  if review_record.version <> expected_item_version then
    raise exception using errcode = '40001', message = 'Moderation item changed';
  end if;

  select place.* into place_record
  from private.places place
  where place.id = requested_place_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Place not found';
  end if;
  if place_record.version <> expected_place_version then
    raise exception using errcode = '40001', message = 'Place version conflict';
  end if;

  select draft.* into draft_record
  from private.moderation_drafts draft
  where draft.candidate_place_id = requested_place_id
  for update;
  if coalesce(draft_record.current_version, 0) <> expected_draft_version then
    raise exception using errcode = '40001', message = 'Moderation draft changed';
  end if;

  if draft_record.id is not null then
    perform private.materialize_candidate_draft(requested_place_id, draft_record.payload, actor_id);
  end if;

  select publication.* into result_record
  from private.verify_and_publish_place_pre_moderation_workbench(
    command_payload, command_request_id
  ) publication;

  update private.candidate_reviews review
  set status = 'published', version = review.version + 1,
    resolution_request_id = command_request_id,
    resolved_at = result_record.published_at,
    updated_at = result_record.published_at
  where review.place_id = requested_place_id;

  insert into private.candidate_review_events (
    place_id, event_kind, moderator_id, request_id, occurred_at
  ) values (
    requested_place_id, 'published', actor_id, command_request_id, result_record.published_at
  );

  return query select result_record.place_id, result_record.verification_ids,
    result_record.version, result_record.published_at;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Publication command is invalid';
end;
$$;

revoke execute on function public.verify_and_publish_place(jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.verify_and_publish_place(jsonb, uuid) to authenticated;

comment on function private.current_candidate_place_payload(uuid) is
  'Returns the complete canonical editable aggregate for a Candidate Place.';
comment on function private.materialize_candidate_draft(uuid, jsonb, uuid) is
  'Reconciles a complete Candidate moderation draft into normalized private rows before publication.';

commit;
