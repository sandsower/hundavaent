-- Forward-only hardening of missing-place-suggestion suggestion functions.
-- Migration 202607110012 is already applied in production (in its reviewed form), so these
-- redefinitions ship as a new migration; they add a same-request recheck under the
-- per-Member advisory lock and refine the payload place-match lookup.

begin;

create or replace function public.submit_place_suggestion(
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

create or replace function public.list_suggestion_place_matches_for_payload(requested_proposal jsonb)
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

revoke execute on function public.list_suggestion_place_matches_for_payload(jsonb)
  from public, anon, service_role;
grant execute on function public.list_suggestion_place_matches_for_payload(jsonb)
  to authenticated;

commit;
