begin;

-- Candidate draft materialization already supports reconciling an empty Evidence array.
-- Remove only the older readiness guard that prevented that supported loop from running.
do $migration$
declare
  function_definition text;
  evidence_count_guard constant text :=
    E'    or jsonb_array_length(requested_payload -> ''evidence_records'') = 0\n';
begin
  select pg_get_functiondef(
    'private.materialize_candidate_draft(uuid,jsonb,uuid)'::regprocedure
  )
  into function_definition;

  if strpos(function_definition, evidence_count_guard) = 0 then
    raise exception 'Expected Candidate draft Evidence guard was not found';
  end if;

  execute replace(function_definition, evidence_count_guard, '');
end;
$migration$;

-- Keep every still-granted discovery projection consistent with rationale-only publication.
-- The exact replacements remove only the legacy Evidence eligibility predicates.
do $migration$
declare
  target_function regprocedure;
  function_definition text;
  updated_definition text;
  one_line_guard constant text :=
    E'      and exists (select 1 from private.verification_evidence ve where ve.verification_id = v.id)\n';
  profile_one_line_guard constant text :=
    E'    and exists (select 1 from private.verification_evidence ve where ve.verification_id = v.id)\n';
  multi_line_guard constant text :=
    E'    and exists (\n      select 1 from private.verification_evidence ve where ve.verification_id = v.id\n    )\n';
begin
  foreach target_function in array array[
    'private.list_published_places_pre_geometry(text)'::regprocedure,
    'private.get_published_place_profile_pre_geometry(uuid,text)'::regprocedure,
    'public.list_published_places_v2(text)'::regprocedure,
    'public.get_published_place_profile_v2(uuid,text)'::regprocedure
  ]
  loop
    select pg_get_functiondef(target_function) into function_definition;
    updated_definition := replace(
      replace(
        replace(function_definition, one_line_guard, ''),
        profile_one_line_guard,
        ''
      ),
      multi_line_guard,
      ''
    );

    if updated_definition = function_definition then
      raise exception 'Expected Evidence discovery guard was not found in %', target_function;
    end if;

    execute updated_definition;
  end loop;
end;
$migration$;

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
  )
$$;

create or replace function private.verify_and_publish_place_pre_geometry(
  command_payload jsonb,
  command_request_id uuid
)
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
  publication_reason text := nullif(btrim(command_payload ->> 'publication_reason'), '');
  place_record private.places%rowtype;
  condition_id uuid;
  condition_evidence_ids uuid[];
  evidence_id uuid;
  created_verification_id uuid;
  created_verification_ids uuid[] := array[]::uuid[];
  publication_time timestamptz := statement_timestamp();
begin
  if command_request_id is null
    or jsonb_typeof(command_payload -> 'publication_reason') is distinct from 'string'
    or publication_reason is null
    or jsonb_typeof(command_payload -> 'condition_verifications') is distinct from 'array'
    or jsonb_array_length(command_payload -> 'condition_verifications') = 0
  then
    raise exception using errcode = '22023', message = 'Publication command is incomplete';
  end if;

  select array_agg((item ->> 'access_condition_id')::uuid order by item ->> 'access_condition_id')
  into requested_condition_ids
  from jsonb_array_elements(command_payload -> 'condition_verifications') item;

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
  if requested_freshness_until <= publication_time then
    raise exception using errcode = '22023', message = 'Freshness must be in the future';
  end if;
  if (
    select count(distinct translation_record.locale)
    from private.place_translations as translation_record
    where translation_record.place_id = requested_place_id
      and translation_record.locale in ('is'::private.locale_code, 'en'::private.locale_code)
      and btrim(translation_record.name) <> ''
      and btrim(translation_record.description) <> ''
  ) <> 2 then
    raise exception using errcode = '22023', message = 'Both Place translations are required';
  end if;
  if (
    select count(distinct condition_record.id)
    from private.access_conditions condition_record
    where condition_record.id = any(requested_condition_ids)
      and condition_record.place_id = requested_place_id
      and condition_record.superseded_at is null
  ) <> cardinality(requested_condition_ids) then
    raise exception using errcode = '22023', message = 'Current Access Condition is required';
  end if;
  if (
    select count(*)
    from private.access_conditions condition_record
    where condition_record.place_id = requested_place_id
      and condition_record.superseded_at is null
  ) <> cardinality(requested_condition_ids) then
    raise exception using errcode = '22023', message = 'Every current Access Condition is required';
  end if;

  for condition_verification in
    select value from jsonb_array_elements(command_payload -> 'condition_verifications')
  loop
    condition_id := (condition_verification ->> 'access_condition_id')::uuid;
    if jsonb_typeof(condition_verification -> 'evidence_ids') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'Evidence selection must be an array';
    end if;

    select coalesce(array_agg(value::uuid), array[]::uuid[])
    into condition_evidence_ids
    from jsonb_array_elements_text(condition_verification -> 'evidence_ids');

    if (
      select count(distinct evidence_record.id)
      from private.evidence evidence_record
      where evidence_record.id = any(condition_evidence_ids)
        and evidence_record.place_id = requested_place_id
    ) <> cardinality(condition_evidence_ids) then
      raise exception using errcode = '22023', message = 'Every Evidence record must exist';
    end if;

    insert into private.verifications (
      access_condition_id,
      status,
      verified_by,
      verified_at,
      freshness_until,
      decision_metadata
    ) values (
      condition_id,
      'verified',
      actor_id,
      publication_time,
      requested_freshness_until,
      coalesce(command_payload -> 'decision_metadata', '{}'::jsonb)
    )
    returning id into created_verification_id;

    created_verification_ids := array_append(created_verification_ids, created_verification_id);

    foreach evidence_id in array condition_evidence_ids loop
      insert into private.verification_evidence (verification_id, evidence_id)
      values (created_verification_id, evidence_id);
    end loop;
  end loop;

  update private.places as place_to_publish
  set lifecycle = 'published',
    published_at = publication_time,
    version = place_to_publish.version + 1,
    updated_at = publication_time
  where place_to_publish.id = requested_place_id;

  perform private.append_audit_event(
    'place.verified',
    'place',
    requested_place_id,
    command_request_id,
    jsonb_build_object(
      'version', expected_place_version + 1,
      'verification_ids', created_verification_ids,
      'condition_ids', requested_condition_ids,
      'publication_reason', publication_reason
    )
  );
  perform private.append_audit_event(
    'place.published',
    'place',
    requested_place_id,
    command_request_id,
    jsonb_build_object(
      'version', expected_place_version + 1,
      'verification_ids', created_verification_ids,
      'publication_reason', publication_reason
    )
  );

  return query
  select requested_place_id, created_verification_ids,
    expected_place_version + 1, publication_time;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Publication command is invalid';
end;
$$;

create or replace function public.verify_and_publish_place(
  command_payload jsonb,
  command_request_id uuid
)
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
  publication_reason text := nullif(btrim(command_payload ->> 'publication_reason'), '');
  review_record private.candidate_reviews%rowtype;
  place_record private.places%rowtype;
  draft_record private.moderation_drafts%rowtype;
  derived_condition_verifications jsonb;
  enriched_command_payload jsonb;
  result_record record;
begin
  if command_request_id is null
    or jsonb_typeof(command_payload) is distinct from 'object'
    or requested_place_id is null
    or jsonb_typeof(command_payload -> 'publication_reason') is distinct from 'string'
    or publication_reason is null
    or not (command_payload ?& array[
      'expected_version',
      'expected_item_version',
      'expected_draft_version',
      'freshness_until',
      'decision_metadata'
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
    perform private.materialize_candidate_draft(
      requested_place_id,
      draft_record.payload,
      actor_id
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'access_condition_id', condition.id,
        'evidence_ids', '[]'::jsonb
      )
      order by condition.id
    ),
    '[]'::jsonb
  )
  into derived_condition_verifications
  from private.access_conditions condition
  where condition.place_id = requested_place_id
    and condition.superseded_at is null;

  enriched_command_payload := command_payload || jsonb_build_object(
    'condition_verifications',
      coalesce(command_payload -> 'condition_verifications', derived_condition_verifications),
    'decision_metadata',
      coalesce(command_payload -> 'decision_metadata', '{}'::jsonb)
      || jsonb_build_object('publication_reason', publication_reason)
  );

  select publication.* into result_record
  from private.verify_and_publish_place_pre_moderation_workbench(
    enriched_command_payload,
    command_request_id
  ) publication;

  update private.candidate_reviews review
  set status = 'published',
    version = review.version + 1,
    resolution_request_id = command_request_id,
    resolved_at = result_record.published_at,
    updated_at = result_record.published_at
  where review.place_id = requested_place_id;

  insert into private.candidate_review_events (
    place_id,
    event_kind,
    moderator_id,
    request_id,
    occurred_at
  ) values (
    requested_place_id,
    'published',
    actor_id,
    command_request_id,
    result_record.published_at
  );

  return query
  select result_record.place_id,
    result_record.verification_ids,
    result_record.version,
    result_record.published_at;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'Publication command is invalid';
end;
$$;

create or replace function public.list_moderation_candidate_places(
  requested_filter text,
  cursor_created_at timestamptz default null,
  cursor_place_id uuid default null,
  requested_limit integer default 20
)
returns table (
  place_id uuid,
  operator_name text,
  category text,
  address_line text,
  locality text,
  municipality text,
  created_at timestamptz,
  candidate_status text,
  item_version bigint,
  draft_version bigint,
  draft_updated_by uuid,
  draft_updated_at timestamptz,
  readiness_state text,
  readiness_issue_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  page_size integer := least(greatest(coalesce(requested_limit, 20), 1), 51);
begin
  perform security.require_moderator();

  if requested_filter not in ('actionable', 'deferred', 'resolved') then
    raise exception using errcode = '22023', message = 'Moderation queue filter is invalid';
  end if;
  if (cursor_created_at is null) <> (cursor_place_id is null) then
    raise exception using errcode = '22023', message = 'Candidate queue cursor is invalid';
  end if;

  return query
  select
    place.id,
    operator_record.name,
    place.category::text,
    location_record.address_line,
    location_record.locality,
    location_record.municipality,
    place.created_at,
    review.status::text,
    review.version,
    coalesce(draft.current_version, 0),
    draft.updated_by,
    draft.updated_at,
    case
      when location_record.geometry_precision = 'municipality_anchor_pending_geocode'
        or location_record.geometry_source is null then 'blocked'
      when not exists (
        select 1
        from private.access_conditions condition
        where condition.place_id = place.id and condition.superseded_at is null
      ) then 'blocked'
      else 'ready'
    end,
    (
      (case
        when location_record.geometry_precision = 'municipality_anchor_pending_geocode'
          or location_record.geometry_source is null then 1
        else 0
      end)
      + (case when not exists (
        select 1
        from private.access_conditions condition
        where condition.place_id = place.id and condition.superseded_at is null
      ) then 1 else 0 end)
    )::integer
  from private.candidate_reviews review
  join private.places place on place.id = review.place_id
  join private.operators operator_record on operator_record.id = place.operator_id
  join private.locations location_record on location_record.id = place.location_id
  left join private.moderation_drafts draft on draft.candidate_place_id = place.id
  where (
      (requested_filter = 'actionable'
        and review.status = 'pending'
        and place.lifecycle = 'candidate')
      or (requested_filter = 'deferred'
        and review.status = 'needs_information'
        and place.lifecycle = 'candidate')
      or (requested_filter = 'resolved' and review.status in ('rejected', 'published'))
    )
    and (
      cursor_created_at is null
      or (place.created_at, place.id) > (cursor_created_at, cursor_place_id)
    )
  order by place.created_at, place.id
  limit page_size;
end;
$$;

create or replace function public.get_moderation_place_review_v2(requested_place_id uuid)
returns table (
  place_id uuid,
  version bigint,
  lifecycle text,
  candidate_status text,
  item_version bigint,
  draft_version bigint,
  draft_payload jsonb,
  draft_updated_by uuid,
  draft_updated_at timestamptz,
  readiness_state text,
  readiness_issues jsonb,
  originating_suggestion_id uuid,
  contributor_id uuid,
  wheelchair_accessibility text,
  operator_name text,
  category text,
  website_url text,
  phone text,
  opening_hours jsonb,
  dog_amenities jsonb,
  address_line text,
  locality text,
  postal_code text,
  municipality text,
  latitude double precision,
  longitude double precision,
  geometry_precision text,
  geometry_source text,
  name_is text,
  description_is text,
  name_en text,
  description_en text,
  access_conditions jsonb,
  evidence_records jsonb
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
    review.place_id,
    review.version,
    review.lifecycle,
    review.candidate_status,
    review.item_version,
    review.draft_version,
    review.draft_payload,
    review.draft_updated_by,
    review.draft_updated_at,
    case
      when jsonb_array_length(review.readiness_issues - 'evidence') = 0 then 'ready'
      else 'blocked'
    end,
    review.readiness_issues - 'evidence',
    review.originating_suggestion_id,
    review.contributor_id,
    place_record.wheelchair_accessibility::text,
    review.operator_name,
    review.category,
    review.website_url,
    review.phone,
    review.opening_hours,
    review.dog_amenities,
    review.address_line,
    review.locality,
    review.postal_code,
    review.municipality,
    review.latitude,
    review.longitude,
    review.geometry_precision,
    review.geometry_source,
    review.name_is,
    review.description_is,
    review.name_en,
    review.description_en,
    review.access_conditions,
    review.evidence_records
  from public.get_moderation_place_review(requested_place_id) as review
  join private.places as place_record on place_record.id = review.place_id;
end;
$$;

create or replace function public.list_published_places_v3(requested_locale text)
returns table (
  place_id uuid,
  name text,
  category text,
  locality text,
  latitude double precision,
  longitude double precision,
  wheelchair_accessibility text,
  access_condition_count bigint,
  access_area text,
  restraint_condition text,
  permission_requirement text,
  access_conditions jsonb,
  simple_access_summary boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select p.id place_id,
      c.id condition_id,
      c.access_area::text access_area,
      c.restraint_condition::text restraint_condition,
      c.permission_requirement::text permission_requirement,
      case
        when c.dog_eligibility ->> 'scope' = 'all_dogs' then 'all_dogs'
        when c.dog_eligibility ? 'maximumWeightKg' then 'small_dogs_only'
        else 'special'
      end dog_eligibility_state,
      c.availability_state::text availability_state,
      (
        c.access_area_note is null
        and c.restraint_note is null
        and c.access_area <> 'other_bounded'::private.access_area
        and c.restraint_condition <> 'other_sourced'::private.restraint_condition
      ) simple_summary
    from private.places p
    join private.access_conditions c
      on c.place_id = p.id and c.superseded_at is null
    join private.verifications v
      on v.access_condition_id = c.id
      and v.status = 'verified'
      and v.superseded_at is null
    where p.lifecycle = 'published'
  ), aggregated as (
    select place_id,
      count(*) access_condition_count,
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
  select p.id,
    coalesce(t_requested.name, t_english.name),
    p.category::text,
    l.locality,
    l.latitude,
    l.longitude,
    p.wheelchair_accessibility::text,
    a.access_condition_count,
    a.access_area,
    a.restraint_condition,
    a.permission_requirement,
    a.access_conditions,
    a.simple_access_summary
  from private.places p
  join aggregated a on a.place_id = p.id
  join private.locations l on l.id = p.location_id
  left join private.place_translations t_requested
    on t_requested.place_id = p.id
    and t_requested.locale = case
      when requested_locale = 'is' then 'is'::private.locale_code
      else 'en'::private.locale_code
    end
  left join private.place_translations t_english
    on t_english.place_id = p.id and t_english.locale = 'en'::private.locale_code
  where coalesce(t_requested.name, t_english.name) is not null
    and private.has_publishable_geometry(p.id)
  order by coalesce(t_requested.name, t_english.name), p.id;
$$;

create or replace function public.get_published_place_profile_v3(
  requested_place_id uuid,
  requested_locale text
)
returns table (
  place_id uuid,
  name text,
  description text,
  category text,
  address_line text,
  locality text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  website_url text,
  phone text,
  wheelchair_accessibility text,
  opening_hours jsonb,
  dog_amenities jsonb,
  access_condition_id uuid,
  access_area text,
  access_area_note text,
  restraint_condition text,
  restraint_note text,
  dog_eligibility jsonb,
  availability_state text,
  availability_window jsonb,
  permission_requirement text,
  access_information_urls jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
    coalesce(t_requested.name, t_english.name),
    coalesce(t_requested.description, t_english.description),
    p.category::text,
    l.address_line,
    l.locality,
    l.postal_code,
    l.latitude,
    l.longitude,
    p.website_url,
    p.phone,
    p.wheelchair_accessibility::text,
    p.opening_hours,
    p.dog_amenities,
    c.id,
    c.access_area::text,
    c.access_area_note,
    c.restraint_condition::text,
    c.restraint_note,
    c.dog_eligibility,
    c.availability_state::text,
    c.availability_window,
    c.permission_requirement::text,
    coalesce((
      select jsonb_agg(source_url order by source_url)
      from (
        select distinct e.source_url source_url
        from private.verification_evidence ve
        join private.evidence e on e.id = ve.evidence_id
        where ve.verification_id = v.id
          and e.source_url is not null
          and e.source_url is distinct from p.website_url
      ) access_links
    ), '[]'::jsonb)
  from private.places p
  left join private.place_translations t_requested
    on t_requested.place_id = p.id
    and t_requested.locale = case
      when requested_locale = 'is' then 'is'::private.locale_code
      else 'en'::private.locale_code
    end
  left join private.place_translations t_english
    on t_english.place_id = p.id and t_english.locale = 'en'::private.locale_code
  join private.locations l on l.id = p.location_id
  join private.access_conditions c
    on c.place_id = p.id and c.superseded_at is null
  join private.verifications v
    on v.access_condition_id = c.id
    and v.status = 'verified'
    and v.superseded_at is null
  where p.id = requested_place_id
    and p.lifecycle = 'published'
    and private.has_publishable_geometry(p.id)
    and coalesce(t_requested.name, t_english.name) is not null
    and coalesce(t_requested.description, t_english.description) is not null
  order by c.created_at, c.id;
$$;

comment on function public.verify_and_publish_place(jsonb, uuid) is
  'Publishes a reviewed Candidate from a required internal Moderator rationale. Structured Evidence is optional and linked automatically when present.';

comment on table private.verification_evidence is
  'Optional supporting Evidence links for a Moderator Verification.';

commit;
