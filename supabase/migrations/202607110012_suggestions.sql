begin;

create type private.suggestion_status as enum (
  'submitted',
  'needs_information',
  'accepted',
  'duplicate',
  'rejected'
);

create table private.suggestion_abuse_policy (
  singleton boolean primary key default true check (singleton),
  policy_version text not null check (btrim(policy_version) <> ''),
  submission_window interval not null check (submission_window > interval '0 seconds'),
  maximum_submissions integer not null check (maximum_submissions > 0),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table private.place_suggestions (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  request_id uuid not null,
  proposal jsonb not null check (jsonb_typeof(proposal) = 'object'),
  status private.suggestion_status not null default 'submitted',
  candidate_place_id uuid references private.places(id) on delete restrict,
  duplicate_place_id uuid references private.places(id) on delete restrict,
  reviewed_proposal jsonb check (
    reviewed_proposal is null or jsonb_typeof(reviewed_proposal) = 'object'
  ),
  operator_identity_place_id uuid references private.places(id) on delete restrict,
  location_identity_place_id uuid references private.places(id) on delete restrict,
  resolution_request_id uuid,
  submitted_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (member_id, request_id),
  constraint place_suggestion_resolution_shape check (
    (status in ('submitted', 'needs_information') and resolved_at is null)
    or (status in ('accepted', 'duplicate', 'rejected') and resolved_at is not null)
  ),
  constraint place_suggestion_candidate_shape check (
    (status = 'accepted' and candidate_place_id is not null)
    or (status <> 'accepted' and candidate_place_id is null)
  ),
  constraint place_suggestion_duplicate_shape check (
    (status = 'duplicate' and duplicate_place_id is not null)
    or (status <> 'duplicate' and duplicate_place_id is null)
  ),
  constraint place_suggestion_review_shape check (
    (status = 'accepted' and reviewed_proposal is not null)
    or (
      status <> 'accepted'
      and reviewed_proposal is null
      and operator_identity_place_id is null
      and location_identity_place_id is null
    )
  )
);

create index place_suggestions_member_time_idx
  on private.place_suggestions (member_id, submitted_at desc);

create index place_suggestions_queue_idx
  on private.place_suggestions (status, submitted_at)
  where status in ('submitted', 'needs_information');

create table private.suggestion_status_events (
  id uuid primary key default extensions.gen_random_uuid(),
  suggestion_id uuid not null references private.place_suggestions(id) on delete restrict,
  status private.suggestion_status not null,
  member_reason_is text,
  member_reason_en text,
  private_note text,
  moderator_id uuid references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  constraint suggestion_member_reasons_together check (
    (member_reason_is is null and member_reason_en is null)
    or (
      nullif(btrim(member_reason_is), '') is not null
      and nullif(btrim(member_reason_en), '') is not null
    )
  ),
  constraint suggestion_event_actor_check check (
    (status = 'submitted' and moderator_id is null)
    or (status <> 'submitted' and moderator_id is not null)
  )
);

create unique index suggestion_status_events_one_terminal_idx
  on private.suggestion_status_events (suggestion_id)
  where status in ('accepted', 'duplicate', 'rejected');

create index suggestion_status_events_history_idx
  on private.suggestion_status_events (suggestion_id, occurred_at desc);

create function private.reject_suggestion_status_event_mutation()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'Suggestion status history is append-only';
end;
$$;

create trigger suggestion_status_events_reject_row_mutation
before update or delete on private.suggestion_status_events
for each row execute function private.reject_suggestion_status_event_mutation();

create trigger suggestion_status_events_reject_truncate
before truncate on private.suggestion_status_events
for each statement execute function private.reject_suggestion_status_event_mutation();

create table private.contributions (
  id uuid primary key default extensions.gen_random_uuid(),
  suggestion_id uuid not null unique references private.place_suggestions(id) on delete restrict,
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  confirmed_by uuid not null references auth.users(id) on delete restrict,
  confirmation_request_id uuid not null unique,
  kind text not null default 'accepted_suggestion' check (kind = 'accepted_suggestion'),
  confirmed_at timestamptz not null default now()
);

create index contributions_member_time_idx
  on private.contributions (member_id, confirmed_at desc);

alter table private.suggestion_abuse_policy enable row level security;
alter table private.place_suggestions enable row level security;
alter table private.suggestion_status_events enable row level security;
alter table private.contributions enable row level security;

create function security.require_member()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null
    or not security.has_role('member'::security.app_role)
    or not exists (
      select 1 from private.member_accounts as account
      where account.user_id = actor_id
    )
  then
    raise exception using errcode = '42501', message = 'Member activation required';
  end if;

  return actor_id;
end;
$$;

create function private.validate_place_suggestion(proposal jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  category_value text;
  access_area_value text;
  restraint_value text;
  permission_value text;
  evidence_kind_value text;
  municipality_value text;
  latitude_value double precision;
  longitude_value double precision;
begin
  if proposal is null or jsonb_typeof(proposal) <> 'object' then
    raise exception using errcode = '22023', message = 'Suggestion must be a structured object';
  end if;

  if proposal ->> 'purpose' <> 'dog_access_destination' then
    raise exception using errcode = '22023', message = 'Suggestion purpose is excluded pending excluded-purpose';
  end if;

  if jsonb_typeof(proposal -> 'purpose') is distinct from 'string'
    or jsonb_typeof(proposal -> 'operator_name') is distinct from 'string'
    or jsonb_typeof(proposal -> 'category') is distinct from 'string'
    or jsonb_typeof(proposal -> 'location') is distinct from 'object'
    or jsonb_typeof(proposal #> '{location,address_line}') is distinct from 'string'
    or jsonb_typeof(proposal #> '{location,locality}') is distinct from 'string'
    or jsonb_typeof(proposal #> '{location,postal_code}') is distinct from 'string'
    or jsonb_typeof(proposal #> '{location,municipality}') is distinct from 'string'
    or jsonb_typeof(proposal #> '{location,latitude}') is distinct from 'number'
    or jsonb_typeof(proposal #> '{location,longitude}') is distinct from 'number'
    or jsonb_typeof(proposal -> 'translations') is distinct from 'object'
    or jsonb_typeof(proposal #> '{translations,is}') is distinct from 'object'
    or jsonb_typeof(proposal #> '{translations,en}') is distinct from 'object'
    or jsonb_typeof(proposal #> '{translations,is,name}') is distinct from 'string'
    or jsonb_typeof(proposal #> '{translations,is,description}') is distinct from 'string'
    or jsonb_typeof(proposal #> '{translations,en,name}') is distinct from 'string'
    or jsonb_typeof(proposal #> '{translations,en,description}') is distinct from 'string'
    or (
      proposal -> 'website_url' is not null
      and jsonb_typeof(proposal -> 'website_url') not in ('string', 'null')
    )
    or (
      proposal -> 'phone' is not null
      and jsonb_typeof(proposal -> 'phone') not in ('string', 'null')
    )
    or jsonb_typeof(proposal -> 'opening_hours') is distinct from 'object'
    or jsonb_typeof(proposal -> 'dog_amenities') is distinct from 'array'
    or jsonb_typeof(proposal -> 'access_condition') is distinct from 'object'
    or jsonb_typeof(proposal #> '{access_condition,access_area}') is distinct from 'string'
    or jsonb_typeof(proposal #> '{access_condition,restraint_condition}') is distinct from 'string'
    or jsonb_typeof(proposal #> '{access_condition,permission_requirement}') is distinct from 'string'
    or jsonb_typeof(proposal #> '{access_condition,dog_eligibility}') is distinct from 'object'
    or jsonb_typeof(proposal #> '{access_condition,availability_window}') is distinct from 'object'
    or (
      proposal #> '{access_condition,access_area_note}' is not null
      and jsonb_typeof(proposal #> '{access_condition,access_area_note}') not in ('string', 'null')
    )
    or (
      proposal #> '{access_condition,restraint_note}' is not null
      and jsonb_typeof(proposal #> '{access_condition,restraint_note}') not in ('string', 'null')
    )
    or jsonb_typeof(proposal -> 'evidence') is distinct from 'object'
    or jsonb_typeof(proposal #> '{evidence,kind}') is distinct from 'string'
    or jsonb_typeof(proposal #> '{evidence,source_label}') is distinct from 'string'
    or jsonb_typeof(proposal #> '{evidence,observed_at}') is distinct from 'string'
    or jsonb_typeof(proposal #> '{evidence,explanation}') is distinct from 'string'
    or jsonb_typeof(proposal #> '{evidence,source_metadata}') is distinct from 'object'
    or (
      proposal #> '{evidence,source_url}' is not null
      and jsonb_typeof(proposal #> '{evidence,source_url}') not in ('string', 'null')
    )
    or (
      proposal #> '{evidence,source_citation}' is not null
      and jsonb_typeof(proposal #> '{evidence,source_citation}') not in ('string', 'null')
    )
  then
    raise exception using errcode = '22023', message = 'Suggestion structured fields are invalid';
  end if;

  category_value := nullif(btrim(proposal ->> 'category'), '');
  access_area_value := nullif(btrim(proposal #>> '{access_condition,access_area}'), '');
  restraint_value := nullif(btrim(proposal #>> '{access_condition,restraint_condition}'), '');
  permission_value := nullif(btrim(proposal #>> '{access_condition,permission_requirement}'), '');
  evidence_kind_value := nullif(btrim(proposal #>> '{evidence,kind}'), '');
  municipality_value := nullif(btrim(proposal #>> '{location,municipality}'), '');

  if nullif(btrim(proposal ->> 'operator_name'), '') is null
    or category_value is null
    or nullif(btrim(proposal #>> '{location,address_line}'), '') is null
    or nullif(btrim(proposal #>> '{location,locality}'), '') is null
    or nullif(btrim(proposal #>> '{location,postal_code}'), '') is null
    or municipality_value is null
    or nullif(btrim(proposal #>> '{translations,is,name}'), '') is null
    or nullif(btrim(proposal #>> '{translations,is,description}'), '') is null
    or nullif(btrim(proposal #>> '{translations,en,name}'), '') is null
    or nullif(btrim(proposal #>> '{translations,en,description}'), '') is null
    or access_area_value is null
    or restraint_value is null
    or permission_value is null
    or evidence_kind_value is null
    or nullif(btrim(proposal #>> '{evidence,source_label}'), '') is null
    or nullif(btrim(proposal #>> '{evidence,observed_at}'), '') is null
    or nullif(btrim(proposal #>> '{evidence,explanation}'), '') is null
    or (
      nullif(btrim(proposal #>> '{evidence,source_url}'), '') is null
      and nullif(btrim(proposal #>> '{evidence,source_citation}'), '') is null
    )
  then
    raise exception using errcode = '22023', message = 'Suggestion is incomplete';
  end if;

  if category_value <> all (
    array['restaurant','cafe','bar','shop','shopping_centre','accommodation','park','recreation','culture','service','other']::text[]
  ) then
    raise exception using errcode = '22023', message = 'Suggestion category is invalid';
  end if;

  if access_area_value <> all (array['indoors','outdoors','designated_area','other_bounded']::text[])
    or restraint_value <> all (array['leash_required','off_leash_permitted','carrier_required','other_sourced']::text[])
    or permission_value <> all (array['standing_permission','ask_on_arrival','advance_approval']::text[])
  then
    raise exception using errcode = '22023', message = 'Suggestion access details are invalid';
  end if;

  if evidence_kind_value <> all (
    array['official_website','venue_representative','member_report','direct_observation','public_record','other']::text[]
  ) then
    raise exception using errcode = '22023', message = 'Suggestion Evidence kind is invalid';
  end if;

  if (
      nullif(btrim(proposal #>> '{evidence,source_url}'), '') is not null
      and proposal #>> '{evidence,source_url}' !~* '^https?://[^[:space:]]+$'
    ) or (
      nullif(btrim(proposal #>> '{evidence,source_url}'), '') is null
      and (
        jsonb_typeof(proposal #> '{evidence,source_citation}') <> 'string'
        or nullif(btrim(proposal #>> '{evidence,source_citation}'), '') is null
      )
    )
  then
    raise exception using errcode = '22023', message = 'Suggestion Evidence source is invalid';
  end if;

  if not private.is_capital_region_municipality(municipality_value)
    or proposal #>> '{location,postal_code}' !~ '^[0-9]{3}$'
  then
    raise exception using errcode = '22023', message = 'Suggestion Location is invalid';
  end if;

  if jsonb_typeof(coalesce(proposal -> 'opening_hours', '{}'::jsonb)) <> 'object'
    or jsonb_typeof(proposal #> '{access_condition,dog_eligibility}') <> 'object'
    or jsonb_typeof(proposal #> '{access_condition,availability_window}') <> 'object'
    or coalesce(proposal #> '{access_condition,dog_eligibility}', '{}'::jsonb)
      <> '{"scope":"all_dogs"}'::jsonb
    or not private.jsonb_has_only_keys(
      coalesce(proposal #> '{access_condition,availability_window}', '{}'::jsonb),
      array['days', 'startsAt', 'endsAt', 'startsOn', 'endsOn', 'notes']
    )
    or (
      proposal #> '{access_condition,availability_window,days}' is not null
      and not private.jsonb_is_weekday_array(
        proposal #> '{access_condition,availability_window,days}'
      )
    )
    or (
      proposal #>> '{access_condition,availability_window,startsAt}' is not null
      and proposal #>> '{access_condition,availability_window,startsAt}'
        !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
    )
    or (
      proposal #>> '{access_condition,availability_window,endsAt}' is not null
      and proposal #>> '{access_condition,availability_window,endsAt}'
        !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
    )
    or (
      proposal #>> '{access_condition,availability_window,startsOn}' is not null
      and not private.is_iso_date(
        proposal #>> '{access_condition,availability_window,startsOn}'
      )
    )
    or (
      proposal #>> '{access_condition,availability_window,endsOn}' is not null
      and not private.is_iso_date(
        proposal #>> '{access_condition,availability_window,endsOn}'
      )
    )
    or (
      proposal #>> '{access_condition,availability_window,startsOn}' is not null
      and proposal #>> '{access_condition,availability_window,endsOn}' is not null
      and proposal #>> '{access_condition,availability_window,startsOn}'
        > proposal #>> '{access_condition,availability_window,endsOn}'
    )
    or (
      proposal #> '{access_condition,availability_window,notes}' is not null
      and (
        jsonb_typeof(proposal #> '{access_condition,availability_window,notes}') <> 'string'
        or nullif(btrim(proposal #>> '{access_condition,availability_window,notes}'), '') is null
      )
    )
    or (
      access_area_value = 'other_bounded'
      and nullif(btrim(proposal #>> '{access_condition,access_area_note}'), '') is null
    )
    or (
      restraint_value = 'other_sourced'
      and nullif(btrim(proposal #>> '{access_condition,restraint_note}'), '') is null
    )
    or not private.jsonb_is_string_array(coalesce(proposal -> 'dog_amenities', '[]'::jsonb))
    or jsonb_typeof(coalesce(proposal #> '{evidence,source_metadata}', '{}'::jsonb)) <> 'object'
  then
    raise exception using errcode = '22023', message = 'Suggestion structured fields are invalid';
  end if;

  latitude_value := (proposal #>> '{location,latitude}')::double precision;
  longitude_value := (proposal #>> '{location,longitude}')::double precision;
  perform (proposal #>> '{evidence,observed_at}')::timestamptz;

  if latitude_value::text in ('NaN', 'Infinity', '-Infinity')
    or longitude_value::text in ('NaN', 'Infinity', '-Infinity')
    or latitude_value not between -90 and 90
    or longitude_value not between -180 and 180
  then
    raise exception using errcode = '22023', message = 'Suggestion coordinates are invalid';
  end if;
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'Suggestion structured fields are invalid';
end;
$$;

create function private.suggestion_candidate_payload(proposal jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'operator', jsonb_build_object('name', proposal ->> 'operator_name'),
    'location', proposal -> 'location',
    'category', proposal -> 'category',
    'website_url', proposal -> 'website_url',
    'phone', proposal -> 'phone',
    'opening_hours', coalesce(proposal -> 'opening_hours', '{}'::jsonb),
    'translations', proposal -> 'translations',
    'dog_amenities', coalesce(proposal -> 'dog_amenities', '[]'::jsonb),
    'evidence', (proposal -> 'evidence') - 'explanation',
    'access_condition', proposal -> 'access_condition'
  );
$$;

create function private.is_eligible_suggestion_place_match(
  proposal jsonb,
  requested_place_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.places as place
    join private.locations as location_record on location_record.id = place.location_id
    where place.id = requested_place_id
      and (
        (
          lower(btrim(location_record.address_line)) =
            lower(btrim(proposal #>> '{location,address_line}'))
          and location_record.postal_code = proposal #>> '{location,postal_code}'
        )
        or extensions.st_dwithin(
          location_record.coordinates,
          extensions.st_setsrid(
            extensions.st_makepoint(
              (proposal #>> '{location,longitude}')::double precision,
              (proposal #>> '{location,latitude}')::double precision
            ),
            4326
          )::extensions.geography,
          50
        )
      )
  );
$$;

create function public.configure_suggestion_abuse_policy(
  requested_policy_version text,
  requested_submission_window_seconds integer,
  requested_maximum_submissions integer,
  requested_enabled boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(requested_policy_version), '') is null
    or requested_submission_window_seconds <= 0
    or requested_maximum_submissions <= 0
  then
    raise exception using errcode = '22023', message = 'Suggestion abuse policy is invalid';
  end if;

  insert into private.suggestion_abuse_policy (
    singleton,
    policy_version,
    submission_window,
    maximum_submissions,
    enabled,
    updated_at
  ) values (
    true,
    btrim(requested_policy_version),
    make_interval(secs => requested_submission_window_seconds),
    requested_maximum_submissions,
    requested_enabled,
    statement_timestamp()
  )
  on conflict (singleton) do update set
    policy_version = excluded.policy_version,
    submission_window = excluded.submission_window,
    maximum_submissions = excluded.maximum_submissions,
    enabled = excluded.enabled,
    updated_at = excluded.updated_at;
end;
$$;

create function private.create_suggestion_candidate(
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

create function public.submit_place_suggestion(
  command_proposal jsonb,
  command_request_id uuid
)
returns table (
  suggestion_id uuid,
  status text,
  submitted_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  policy_record private.suggestion_abuse_policy%rowtype;
  existing_record private.place_suggestions%rowtype;
  created_record private.place_suggestions%rowtype;
begin
  if command_request_id is null then
    raise exception using errcode = '22023', message = 'Suggestion request ID is required';
  end if;

  select suggestion.* into existing_record
  from private.place_suggestions as suggestion
  where suggestion.member_id = actor_id and suggestion.request_id = command_request_id;

  if found then
    return query select existing_record.id, existing_record.status::text, existing_record.submitted_at;
    return;
  end if;

  select policy.* into policy_record
  from private.suggestion_abuse_policy as policy
  where policy.singleton and policy.enabled;

  if not found then
    raise exception using errcode = '55000', message = 'Suggestion abuse policy is not configured';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('place-suggestion:' || actor_id::text, 0)
  );

  -- A same-request transaction may have committed while this transaction waited for the
  -- per-Member lock. Recheck under the lock before rate counting or inserting.
  select suggestion.* into existing_record
  from private.place_suggestions as suggestion
  where suggestion.member_id = actor_id and suggestion.request_id = command_request_id;

  if found then
    return query select existing_record.id, existing_record.status::text, existing_record.submitted_at;
    return;
  end if;

  if (
    select count(*)
    from private.place_suggestions as recent
    where recent.member_id = actor_id
      and recent.submitted_at > statement_timestamp() - policy_record.submission_window
  ) >= policy_record.maximum_submissions then
    raise exception using errcode = '54000', message = 'Suggestion rate limit reached';
  end if;

  perform private.validate_place_suggestion(command_proposal);

  insert into private.place_suggestions (member_id, request_id, proposal)
  values (actor_id, command_request_id, command_proposal)
  returning * into created_record;

  insert into private.suggestion_status_events (suggestion_id, status)
  values (created_record.id, 'submitted');

  return query select created_record.id, created_record.status::text, created_record.submitted_at;
end;
$$;

create function public.list_my_place_suggestions(
  cursor_submitted_at timestamptz default null,
  cursor_suggestion_id uuid default null,
  requested_limit integer default 20
)
returns table (
  suggestion_id uuid,
  status text,
  name_is text,
  name_en text,
  category text,
  locality text,
  member_reason_is text,
  member_reason_en text,
  candidate_place_id uuid,
  duplicate_place_id uuid,
  submitted_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  page_size integer := least(greatest(coalesce(requested_limit, 20), 1), 51);
begin
  if (cursor_submitted_at is null) <> (cursor_suggestion_id is null) then
    raise exception using errcode = '22023', message = 'Suggestion history cursor is invalid';
  end if;

  return query
  select
    suggestion.id,
    suggestion.status::text,
    suggestion.proposal #>> '{translations,is,name}',
    suggestion.proposal #>> '{translations,en,name}',
    suggestion.proposal ->> 'category',
    suggestion.proposal #>> '{location,locality}',
    latest.member_reason_is,
    latest.member_reason_en,
    suggestion.candidate_place_id,
    suggestion.duplicate_place_id,
    suggestion.submitted_at,
    suggestion.updated_at
  from private.place_suggestions as suggestion
  left join lateral (
    select event.member_reason_is, event.member_reason_en
    from private.suggestion_status_events as event
    where event.suggestion_id = suggestion.id
      and event.member_reason_is is not null
    order by event.occurred_at desc, event.id desc
    limit 1
  ) as latest on true
  where suggestion.member_id = actor_id
    and (
      cursor_submitted_at is null
      or (suggestion.submitted_at, suggestion.id) < (cursor_submitted_at, cursor_suggestion_id)
    )
  order by suggestion.submitted_at desc, suggestion.id desc
  limit page_size;
end;
$$;

create function public.list_moderation_place_suggestions(
  cursor_queue_rank integer default null,
  cursor_submitted_at timestamptz default null,
  cursor_suggestion_id uuid default null,
  requested_limit integer default 20
)
returns table (
  suggestion_id uuid,
  member_id uuid,
  status text,
  operator_name text,
  name_is text,
  name_en text,
  category text,
  address_line text,
  locality text,
  submitted_at timestamptz,
  updated_at timestamptz,
  queue_rank integer
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
  if (cursor_queue_rank is null or cursor_submitted_at is null or cursor_suggestion_id is null)
    and not (cursor_queue_rank is null and cursor_submitted_at is null and cursor_suggestion_id is null)
  then
    raise exception using errcode = '22023', message = 'Suggestion queue cursor is invalid';
  end if;

  return query
  select queue.*
  from (
    select
      suggestion.id,
      suggestion.member_id,
      suggestion.status::text,
      suggestion.proposal ->> 'operator_name',
      suggestion.proposal #>> '{translations,is,name}',
      suggestion.proposal #>> '{translations,en,name}',
      suggestion.proposal ->> 'category',
      suggestion.proposal #>> '{location,address_line}',
      suggestion.proposal #>> '{location,locality}',
      suggestion.submitted_at,
      suggestion.updated_at,
      case suggestion.status when 'submitted' then 0 when 'needs_information' then 1 else 2 end
    from private.place_suggestions as suggestion
  ) as queue (
    suggestion_id, member_id, status, operator_name, name_is, name_en, category,
    address_line, locality, submitted_at, updated_at, queue_rank
  )
  where cursor_queue_rank is null
    or (queue.queue_rank, queue.submitted_at, queue.suggestion_id)
      > (cursor_queue_rank, cursor_submitted_at, cursor_suggestion_id)
  order by queue.queue_rank, queue.submitted_at, queue.suggestion_id
  limit page_size;
end;
$$;

create function public.get_moderation_place_suggestion(requested_suggestion_id uuid)
returns table (
  suggestion_id uuid,
  member_id uuid,
  status text,
  operator_name text,
  name_is text,
  name_en text,
  category text,
  address_line text,
  locality text,
  submitted_at timestamptz,
  updated_at timestamptz,
  proposal jsonb,
  reviewed_proposal jsonb,
  private_note text,
  contribution_id uuid,
  operator_identity_place_id uuid,
  location_identity_place_id uuid
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
    suggestion.id,
    suggestion.member_id,
    suggestion.status::text,
    coalesce(suggestion.reviewed_proposal, suggestion.proposal) ->> 'operator_name',
    coalesce(suggestion.reviewed_proposal, suggestion.proposal) #>> '{translations,is,name}',
    coalesce(suggestion.reviewed_proposal, suggestion.proposal) #>> '{translations,en,name}',
    coalesce(suggestion.reviewed_proposal, suggestion.proposal) ->> 'category',
    coalesce(suggestion.reviewed_proposal, suggestion.proposal) #>> '{location,address_line}',
    coalesce(suggestion.reviewed_proposal, suggestion.proposal) #>> '{location,locality}',
    suggestion.submitted_at,
    suggestion.updated_at,
    suggestion.proposal,
    suggestion.reviewed_proposal,
    latest.private_note,
    contribution.id,
    suggestion.operator_identity_place_id,
    suggestion.location_identity_place_id
  from private.place_suggestions as suggestion
  left join lateral (
    select event.private_note
    from private.suggestion_status_events as event
    where event.suggestion_id = suggestion.id and event.private_note is not null
    order by event.occurred_at desc, event.id desc
    limit 1
  ) as latest on true
  left join private.contributions as contribution on contribution.suggestion_id = suggestion.id
  where suggestion.id = requested_suggestion_id;
end;
$$;

create function public.list_suggestion_place_matches_for_payload(requested_proposal jsonb)
returns table (
  place_id uuid,
  lifecycle text,
  operator_name text,
  name_is text,
  name_en text,
  address_line text,
  locality text,
  same_operator boolean,
  exact_location boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_moderator();
  if requested_proposal is null or jsonb_typeof(requested_proposal) <> 'object' then
    raise exception using errcode = '22023', message = 'Reviewed proposal is invalid';
  end if;
  perform private.validate_place_suggestion(requested_proposal);

  return query
  select
    place.id,
    place.lifecycle::text,
    operator_record.name,
    translations.name_is,
    translations.name_en,
    location_record.address_line,
    location_record.locality,
    lower(btrim(operator_record.name)) = lower(btrim(requested_proposal ->> 'operator_name')),
    lower(btrim(location_record.address_line)) = lower(btrim(requested_proposal #>> '{location,address_line}'))
      and location_record.postal_code = requested_proposal #>> '{location,postal_code}'
  from private.places as place
  join private.operators as operator_record on operator_record.id = place.operator_id
  join private.locations as location_record on location_record.id = place.location_id
  cross join lateral (
    select
      max(translation.name) filter (where translation.locale = 'is') as name_is,
      max(translation.name) filter (where translation.locale = 'en') as name_en
    from private.place_translations as translation
    where translation.place_id = place.id
  ) as translations
  where private.is_eligible_suggestion_place_match(requested_proposal, place.id)
  order by
    9 desc,
    8 desc,
    place.lifecycle,
    place.created_at desc,
    place.id
  limit 25;
end;
$$;

create function public.list_suggestion_place_matches(requested_suggestion_id uuid)
returns table (
  place_id uuid,
  lifecycle text,
  operator_name text,
  name_is text,
  name_en text,
  address_line text,
  locality text,
  same_operator boolean,
  exact_location boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  proposal_value jsonb;
begin
  perform security.require_moderator();
  select suggestion.proposal into proposal_value
  from private.place_suggestions as suggestion
  where suggestion.id = requested_suggestion_id;

  if not found then
    raise exception using errcode = '22023', message = 'Suggestion was not found';
  end if;

  return query
  select
    place.id,
    place.lifecycle::text,
    operator_record.name,
    translations.name_is,
    translations.name_en,
    location_record.address_line,
    location_record.locality,
    lower(btrim(operator_record.name)) = lower(btrim(proposal_value ->> 'operator_name')),
    lower(btrim(location_record.address_line)) = lower(btrim(proposal_value #>> '{location,address_line}'))
      and location_record.postal_code = proposal_value #>> '{location,postal_code}'
  from private.places as place
  join private.operators as operator_record on operator_record.id = place.operator_id
  join private.locations as location_record on location_record.id = place.location_id
  cross join lateral (
    select
      max(translation.name) filter (where translation.locale = 'is') as name_is,
      max(translation.name) filter (where translation.locale = 'en') as name_en
    from private.place_translations as translation
    where translation.place_id = place.id
  ) as translations
  where private.is_eligible_suggestion_place_match(proposal_value, place.id)
  order by
    9 desc,
    8 desc,
    place.lifecycle,
    place.created_at desc,
    place.id
  limit 25;
end;
$$;

create function public.resolve_place_suggestion(
  requested_suggestion_id uuid,
  requested_outcome text,
  member_reason_is text,
  member_reason_en text,
  private_note text,
  moderator_candidate_payload jsonb,
  requested_duplicate_place_id uuid,
  requested_operator_identity_place_id uuid,
  requested_location_identity_place_id uuid,
  confirm_useful boolean,
  command_request_id uuid
)
returns table (
  suggestion_id uuid,
  status text,
  candidate_place_id uuid,
  duplicate_place_id uuid,
  contribution_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  suggestion_record private.place_suggestions%rowtype;
  candidate_id uuid;
  candidate_command jsonb;
begin
  if requested_suggestion_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Suggestion resolution identifiers are required';
  end if;

  if requested_outcome <> all (array['needs_information','accepted','duplicate','rejected']::text[]) then
    raise exception using errcode = '22023', message = 'Suggestion outcome is invalid';
  end if;

  if nullif(btrim(member_reason_is), '') is null
    or nullif(btrim(member_reason_en), '') is null
  then
    raise exception using errcode = '22023', message = 'Bilingual Member-safe outcome reason is required';
  end if;

  select suggestion.* into suggestion_record
  from private.place_suggestions as suggestion
  where suggestion.id = requested_suggestion_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Suggestion was not found';
  end if;

  if suggestion_record.status::text = requested_outcome
    and suggestion_record.resolution_request_id = command_request_id
  then
    return query select suggestion_record.id, suggestion_record.status::text,
      suggestion_record.candidate_place_id, suggestion_record.duplicate_place_id, null::uuid;
    return;
  end if;

  if suggestion_record.status in ('accepted','duplicate','rejected') then
    -- A distinct errcode from the abuse-policy-unavailable case (55000) so the
    -- application layer can map this to a 409 conflict instead of a 503.
    raise exception using errcode = '55006', message = 'Suggestion outcome is final';
  end if;

  if confirm_useful then
    raise exception using errcode = '22023', message = 'Use the separate Contribution confirmation command';
  end if;

  if requested_outcome = 'duplicate' then
    if requested_duplicate_place_id is null
      or not private.is_eligible_suggestion_place_match(
        suggestion_record.proposal,
        requested_duplicate_place_id
      )
    then
      raise exception using errcode = '22023', message = 'Reviewed duplicate Place is required';
    end if;
  elsif requested_duplicate_place_id is not null then
    raise exception using errcode = '22023', message = 'Duplicate Place is valid only for duplicate outcome';
  end if;

  if requested_outcome = 'accepted' then
    if moderator_candidate_payload is null then
      raise exception using errcode = '22023', message = 'Reviewed Candidate payload is required';
    end if;
    perform private.validate_place_suggestion(moderator_candidate_payload);

    if requested_operator_identity_place_id is not null
      and not private.is_eligible_suggestion_place_match(
        moderator_candidate_payload,
        requested_operator_identity_place_id
      )
    then
      raise exception using errcode = '22023', message = 'Reviewed Operator identity is invalid';
    end if;

    if requested_location_identity_place_id is not null
      and not private.is_eligible_suggestion_place_match(
        moderator_candidate_payload,
        requested_location_identity_place_id
      )
    then
      raise exception using errcode = '22023', message = 'Reviewed Location identity is invalid';
    end if;

    candidate_command := private.suggestion_candidate_payload(moderator_candidate_payload);
    candidate_id := private.create_suggestion_candidate(
      candidate_command,
      command_request_id,
      actor_id,
      requested_operator_identity_place_id,
      requested_location_identity_place_id
    );
  elsif moderator_candidate_payload is not null
    or requested_operator_identity_place_id is not null
    or requested_location_identity_place_id is not null
  then
    raise exception using errcode = '22023', message = 'Candidate review data is valid only for accepted outcome';
  end if;

  update private.place_suggestions as suggestion
  set
    status = requested_outcome::private.suggestion_status,
    candidate_place_id = candidate_id,
    duplicate_place_id = requested_duplicate_place_id,
    reviewed_proposal = case when requested_outcome = 'accepted' then moderator_candidate_payload else null end,
    operator_identity_place_id = requested_operator_identity_place_id,
    location_identity_place_id = requested_location_identity_place_id,
    resolution_request_id = command_request_id,
    resolved_at = case
      when requested_outcome = 'needs_information' then null
      else statement_timestamp()
    end,
    updated_at = statement_timestamp()
  where suggestion.id = requested_suggestion_id;

  insert into private.suggestion_status_events (
    suggestion_id,
    status,
    member_reason_is,
    member_reason_en,
    private_note,
    moderator_id
  ) values (
    requested_suggestion_id,
    requested_outcome::private.suggestion_status,
    btrim(member_reason_is),
    btrim(member_reason_en),
    nullif(btrim(private_note), ''),
    actor_id
  );

  perform private.append_audit_event(
    'suggestion.' || requested_outcome,
    'suggestion',
    requested_suggestion_id,
    command_request_id,
    jsonb_strip_nulls(jsonb_build_object(
      'previous_status', suggestion_record.status::text,
      'status', requested_outcome,
      'candidate_place_id', candidate_id,
      'duplicate_place_id', requested_duplicate_place_id,
      'operator_identity_place_id', requested_operator_identity_place_id,
      'location_identity_place_id', requested_location_identity_place_id,
      'proposal_corrected', moderator_candidate_payload is distinct from suggestion_record.proposal
    ))
  );

  return query select requested_suggestion_id, requested_outcome, candidate_id,
    requested_duplicate_place_id, null::uuid;
end;
$$;

create function public.confirm_suggestion_contribution(
  requested_suggestion_id uuid,
  command_request_id uuid
)
returns table (
  contribution_id uuid,
  confirmed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  suggestion_record private.place_suggestions%rowtype;
  contribution_record private.contributions%rowtype;
begin
  if requested_suggestion_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Contribution confirmation identifiers are required';
  end if;

  select suggestion.* into suggestion_record
  from private.place_suggestions as suggestion
  where suggestion.id = requested_suggestion_id
  for update;

  if not found or suggestion_record.status <> 'accepted' then
    raise exception using errcode = '22023', message = 'Only an accepted Suggestion can create a Contribution';
  end if;

  select contribution.* into contribution_record
  from private.contributions as contribution
  where contribution.suggestion_id = requested_suggestion_id;

  if found then
    return query select contribution_record.id, contribution_record.confirmed_at;
    return;
  end if;

  insert into private.contributions (
    suggestion_id,
    member_id,
    confirmed_by,
    confirmation_request_id
  ) values (
    requested_suggestion_id,
    suggestion_record.member_id,
    actor_id,
    command_request_id
  )
  returning * into contribution_record;

  perform private.append_audit_event(
    'suggestion.contribution_confirmed',
    'suggestion',
    requested_suggestion_id,
    command_request_id,
    jsonb_build_object('contribution_id', contribution_record.id)
  );

  return query select contribution_record.id, contribution_record.confirmed_at;
end;
$$;

revoke all on private.suggestion_abuse_policy from public, anon, authenticated, service_role;
revoke all on private.place_suggestions from public, anon, authenticated, service_role;
revoke all on private.suggestion_status_events from public, anon, authenticated, service_role;
revoke all on private.contributions from public, anon, authenticated, service_role;

revoke execute on function security.require_member()
  from public, anon, authenticated, service_role;
revoke execute on function private.validate_place_suggestion(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.suggestion_candidate_payload(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.is_eligible_suggestion_place_match(jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.reject_suggestion_status_event_mutation()
  from public, anon, authenticated, service_role;
revoke execute on function public.configure_suggestion_abuse_policy(text, integer, integer, boolean)
  from public, anon, authenticated;
revoke execute on function private.create_suggestion_candidate(jsonb, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.submit_place_suggestion(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.list_my_place_suggestions(timestamptz, uuid, integer)
  from public, anon, service_role;
revoke execute on function public.list_moderation_place_suggestions(integer, timestamptz, uuid, integer)
  from public, anon, service_role;
revoke execute on function public.get_moderation_place_suggestion(uuid)
  from public, anon, service_role;
revoke execute on function public.list_suggestion_place_matches(uuid)
  from public, anon, service_role;
revoke execute on function public.list_suggestion_place_matches_for_payload(jsonb)
  from public, anon, service_role;
revoke execute on function public.resolve_place_suggestion(uuid, text, text, text, text, jsonb, uuid, uuid, uuid, boolean, uuid)
  from public, anon, service_role;
revoke execute on function public.confirm_suggestion_contribution(uuid, uuid)
  from public, anon, service_role;

grant execute on function public.submit_place_suggestion(jsonb, uuid) to authenticated;
grant execute on function public.list_my_place_suggestions(timestamptz, uuid, integer) to authenticated;
grant execute on function public.list_moderation_place_suggestions(integer, timestamptz, uuid, integer)
  to authenticated;
grant execute on function public.get_moderation_place_suggestion(uuid) to authenticated;
grant execute on function public.list_suggestion_place_matches(uuid) to authenticated;
grant execute on function public.list_suggestion_place_matches_for_payload(jsonb) to authenticated;
grant execute on function public.resolve_place_suggestion(uuid, text, text, text, text, jsonb, uuid, uuid, uuid, boolean, uuid)
  to authenticated;
grant execute on function public.confirm_suggestion_contribution(uuid, uuid)
  to authenticated;
grant execute on function public.configure_suggestion_abuse_policy(text, integer, integer, boolean)
  to service_role;

comment on table private.place_suggestions is
  'Caller-private structured community leads that never establish Place identity before Moderator acceptance.';
comment on table private.contributions is
  'Moderator-confirmed useful accepted Suggestion outcomes, unique per Suggestion.';
comment on table private.suggestion_abuse_policy is
  'Explicit configurable Suggestion abuse boundary. No row means production submission fails closed pending suggestion-abuse.';
comment on function public.configure_suggestion_abuse_policy(text, integer, integer, boolean) is
  'Service-role-only configuration boundary. Production values remain undefined until suggestion-abuse is approved.';
comment on function public.resolve_place_suggestion(uuid, text, text, text, text, jsonb, uuid, uuid, uuid, boolean, uuid) is
  'Resolves a private Suggestion and optionally creates one normal Candidate. Contribution credit is a separate action.';
comment on function public.confirm_suggestion_contribution(uuid, uuid) is
  'Idempotently confirms useful value only after a Suggestion has been accepted.';

commit;
