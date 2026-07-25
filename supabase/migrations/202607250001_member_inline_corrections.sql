begin;

-- 1. Seed the Correction and Report abuse policy ---------------------------------------------
--
-- private.place_flag_abuse_policy is a singleton config row that create_place_flag refuses to
-- work without. Until now it was written only by the end-to-end test harness, so Corrections
-- and Reports failed with 55000 in every other environment. Seeding it here makes the feature
-- reachable; configure_place_flag_abuse_policy remains available for tuning without a deploy,
-- and do-nothing keeps any environment that already tuned its own values.

insert into private.place_flag_abuse_policy (
  singleton,
  policy_version,
  submission_window,
  maximum_submissions,
  maximum_open,
  merge_window,
  enabled,
  updated_at
) values (
  true,
  'member-inline-contribution-v1',
  make_interval(secs => 3600),
  20,
  15,
  make_interval(secs => 900),
  true,
  statement_timestamp()
)
on conflict (singleton) do nothing;

-- 2. Narrow the duplicate-claim merge predicate ----------------------------------------------
--
-- The merge folds a repeated same-Member submission into the open item instead of creating a
-- duplicate-flood row, but it keyed only on the target, not on what was actually claimed. A
-- Member who revised a Correction inside the merge window received the first item's id back and
-- their revision was silently discarded. Comparing proposed_value makes the predicate fold only
-- genuinely identical claims, which is what the comment already promised, and is what makes the
-- widened merge window above safe.

create or replace function private.create_place_flag(
  requested_kind private.place_flag_kind,
  command_payload jsonb,
  actor_id uuid,
  command_request_id uuid
)
returns table (flag_id uuid, status text, submitted_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  policy_record private.place_flag_abuse_policy%rowtype;
  existing_record private.place_flags%rowtype;
  merged_record private.place_flags%rowtype;
  created_record private.place_flags%rowtype;
  target_kind_value private.place_flag_target_kind := (command_payload ->> 'target_kind')::private.place_flag_target_kind;
  target_field_value private.place_field := nullif(command_payload ->> 'target_field', '')::private.place_field;
  requested_place_id uuid := (command_payload ->> 'place_id')::uuid;
  requested_condition_id uuid := nullif(command_payload ->> 'access_condition_id', '')::uuid;
  requested_proposed_value jsonb := case
    when requested_kind = 'correction' then command_payload -> 'proposed_value'
    else null
  end;
  snapshot jsonb;
begin
  if command_request_id is null or actor_id is null then
    raise exception using errcode = '22023', message = 'Correction or Report command is invalid';
  end if;

  -- Mirrors the per-Member advisory lock ordering used by Suggestion submission so concurrent
  -- same-Member submissions serialize instead of racing past the idempotency lookup.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('place-flag:' || actor_id::text, 0)
  );

  select flag.* into existing_record
  from private.place_flags flag
  where flag.member_id = actor_id and flag.request_id = command_request_id;

  if found then
    return query select existing_record.id, existing_record.status::text, existing_record.submitted_at;
    return;
  end if;

  select policy.* into policy_record
  from private.place_flag_abuse_policy policy
  where policy.singleton and policy.enabled;

  if not found then
    raise exception using errcode = '55000', message = 'Correction and Report abuse policy is not configured';
  end if;

  if (
    select count(*)
    from private.place_flags recent
    where recent.member_id = actor_id
      and recent.status in ('submitted', 'needs_information')
  ) >= policy_record.maximum_open then
    raise exception using errcode = '54000', message = 'Too many open Corrections and Reports';
  end if;

  if (
    select count(*)
    from private.place_flags recent
    where recent.member_id = actor_id
      and recent.submitted_at > statement_timestamp() - policy_record.submission_window
  ) >= policy_record.maximum_submissions then
    raise exception using errcode = '54000', message = 'Correction and Report rate limit reached';
  end if;

  -- A repeated same-Member, same-claim submission inside the merge window joins the existing
  -- open item instead of creating a duplicate-flood row. A revised claim is a different claim,
  -- so proposed_value participates in the predicate and a revision creates its own item.
  select flag.* into merged_record
  from private.place_flags flag
  where flag.member_id = actor_id
    and flag.place_id = requested_place_id
    and flag.kind = requested_kind
    and flag.target_kind = target_kind_value
    and flag.target_field is not distinct from target_field_value
    and flag.access_condition_id is not distinct from requested_condition_id
    and flag.proposed_value is not distinct from requested_proposed_value
    and flag.status in ('submitted', 'needs_information')
    and flag.submitted_at > statement_timestamp() - policy_record.merge_window
  order by flag.submitted_at desc
  limit 1;

  if found then
    return query select merged_record.id, merged_record.status::text, merged_record.submitted_at;
    return;
  end if;

  if target_kind_value = 'place_field' then
    snapshot := private.snapshot_place_field(requested_place_id, target_field_value);
  else
    snapshot := private.snapshot_access_condition(requested_condition_id, requested_place_id);
  end if;

  if snapshot is null then
    raise exception using errcode = '22023', message = 'Correction or Report target was not found';
  end if;

  insert into private.place_flags (
    member_id, kind, place_id, target_kind, target_field, access_condition_id,
    current_value_snapshot, proposed_value, report_reason, is_safety_concern,
    successor_place_id, explanation, evidence, request_id
  ) values (
    actor_id, requested_kind, requested_place_id, target_kind_value, target_field_value,
    requested_condition_id, snapshot,
    requested_proposed_value,
    case when requested_kind = 'report'
      then (command_payload ->> 'report_reason')::private.report_reason
      else null
    end,
    coalesce((command_payload ->> 'is_safety_concern')::boolean, false) and requested_kind = 'report',
    nullif(command_payload ->> 'successor_place_id', '')::uuid,
    btrim(command_payload ->> 'explanation'),
    command_payload -> 'evidence',
    command_request_id
  ) returning * into created_record;

  insert into private.place_flag_status_events (flag_id, status)
  values (created_record.id, 'submitted');

  return query select created_record.id, created_record.status::text, created_record.submitted_at;
end;
$$;

-- 3. Accept the dog eligibility shapes access_conditions already stores -----------------------
--
-- The shared Access Condition value validator required dog_eligibility to be exactly
-- {"scope":"all_dogs"}, while private.access_conditions has always permitted a restricted scope
-- carrying maximumWeightKg, maximumDogs or notes. Restricted eligibility is therefore
-- renderable, parseable, translated and form-editable, but no validated write path could store
-- it: a Moderator typing a weight limit into their own form had it rejected by the database,
-- and a Member could not correct a size-restricted Place at all. The predicate below mirrors the
-- table constraints so the validator and the table agree.

create function private.is_valid_dog_eligibility(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(value) = 'object'
    and private.jsonb_has_only_keys(value, array['scope', 'maximumWeightKg', 'maximumDogs', 'notes'])
    and (
      (value ->> 'scope' = 'all_dogs'
        and not (value ?| array['maximumWeightKg', 'maximumDogs', 'notes']))
      or (value ->> 'scope' = 'restricted'
        and value ?| array['maximumWeightKg', 'maximumDogs', 'notes'])
    )
    and (
      (value ->> 'maximumWeightKg') is null or (
        jsonb_typeof(value -> 'maximumWeightKg') = 'number'
        and (value ->> 'maximumWeightKg')::numeric > 0)
    )
    and (
      (value ->> 'maximumDogs') is null or (
        jsonb_typeof(value -> 'maximumDogs') = 'number'
        and (value ->> 'maximumDogs')::numeric % 1 = 0
        and (value ->> 'maximumDogs')::integer > 0)
    )
    and (
      (value -> 'notes') is null or (
        jsonb_typeof(value -> 'notes') = 'string'
        and nullif(btrim(value ->> 'notes'), '') is not null)
    );
$$;

revoke execute on function private.is_valid_dog_eligibility(jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.validate_access_condition_value_pre_access_availability(value jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  access_area_value text;
  restraint_value text;
  permission_value text;
begin
  if value is null or jsonb_typeof(value) <> 'object'
    or not private.jsonb_has_only_keys(
      value,
      array[
        'access_area', 'access_area_note', 'restraint_condition', 'restraint_note',
        'dog_eligibility', 'availability_window', 'permission_requirement'
      ]
    )
    or jsonb_typeof(value -> 'access_area') is distinct from 'string'
    or jsonb_typeof(value -> 'restraint_condition') is distinct from 'string'
    or jsonb_typeof(value -> 'permission_requirement') is distinct from 'string'
    or jsonb_typeof(value -> 'dog_eligibility') is distinct from 'object'
    or jsonb_typeof(value -> 'availability_window') is distinct from 'object'
    or (
      value -> 'access_area_note' is not null
      and jsonb_typeof(value -> 'access_area_note') not in ('string', 'null')
    )
    or (
      value -> 'restraint_note' is not null
      and jsonb_typeof(value -> 'restraint_note') not in ('string', 'null')
    )
  then
    raise exception using errcode = '22023', message = 'Access Condition value is invalid';
  end if;

  access_area_value := nullif(btrim(value ->> 'access_area'), '');
  restraint_value := nullif(btrim(value ->> 'restraint_condition'), '');
  permission_value := nullif(btrim(value ->> 'permission_requirement'), '');

  if access_area_value is null
    or access_area_value <> all (array['indoors','outdoors','designated_area','other_bounded']::text[])
    or restraint_value is null
    or restraint_value
      <> all (array['leash_required','off_leash_permitted','carrier_required','other_sourced']::text[])
    or permission_value is null
    or permission_value <> all (array['standing_permission','ask_on_arrival','advance_approval']::text[])
    or not private.is_valid_dog_eligibility(coalesce(value -> 'dog_eligibility', '{}'::jsonb))
    or not private.jsonb_has_only_keys(
      coalesce(value -> 'availability_window', '{}'::jsonb),
      array['days', 'startsAt', 'endsAt', 'startsOn', 'endsOn', 'notes']
    )
    or (
      value #> '{availability_window,days}' is not null
      and not private.jsonb_is_weekday_array(value #> '{availability_window,days}')
    )
    or (
      value #>> '{availability_window,startsAt}' is not null
      and value #>> '{availability_window,startsAt}' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
    )
    or (
      value #>> '{availability_window,endsAt}' is not null
      and value #>> '{availability_window,endsAt}' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
    )
    or (
      value #>> '{availability_window,startsOn}' is not null
      and not private.is_iso_date(value #>> '{availability_window,startsOn}')
    )
    or (
      value #>> '{availability_window,endsOn}' is not null
      and not private.is_iso_date(value #>> '{availability_window,endsOn}')
    )
    or (
      access_area_value = 'other_bounded'
      and nullif(btrim(value ->> 'access_area_note'), '') is null
    )
    or (
      restraint_value = 'other_sourced'
      and nullif(btrim(value ->> 'restraint_note'), '') is null
    )
  then
    raise exception using errcode = '22023', message = 'Access Condition value is invalid';
  end if;
end;
$$;

comment on function private.is_valid_dog_eligibility(jsonb) is
  'Mirrors the private.access_conditions dog_eligibility constraints so validated write paths accept every eligibility shape the table stores.';

commit;
