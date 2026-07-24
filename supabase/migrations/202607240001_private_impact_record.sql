begin;

-- One anti-burst primitive serves every private projection that credits distinct Place exploration.
-- Callers choose the eligibility boundary explicitly so the permanent impact record can include the
-- Member's full durable history while Achievements retain their immutable launch boundary.
create function private.credit_spaced_member_places(
  target_member_id uuid,
  as_of timestamptz,
  spacing_minutes integer,
  since_at timestamptz
)
returns table (place_id uuid, first_seen_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  place_row record;
  last_counted timestamptz := null;
  spacing interval;
begin
  if target_member_id is null
    or as_of is null
    or since_at is null
    or spacing_minutes is null
    or spacing_minutes <= 0
  then
    raise exception using errcode = '22023', message = 'Place-credit boundary is invalid';
  end if;

  spacing := make_interval(mins => spacing_minutes);

  for place_row in (
    select
      check_in.place_id as candidate_place_id,
      min(check_in.checked_in_at) as first_at
    from private.check_ins as check_in
    where check_in.member_id = target_member_id
      and check_in.checked_in_at >= since_at
      and check_in.checked_in_at <= as_of
    group by check_in.place_id
    order by min(check_in.checked_in_at), check_in.place_id
  ) loop
    if last_counted is null or place_row.first_at - last_counted >= spacing then
      last_counted := place_row.first_at;
      place_id := place_row.candidate_place_id;
      first_seen_at := place_row.first_at;
      return next;
    end if;
  end loop;

  return;
end;
$$;

-- Preserve the Achievement engine's future-only eligibility contract while delegating the actual
-- anti-burst sequence to the shared primitive above.
create or replace function private.credit_spaced_places(
  target_member_id uuid,
  as_of timestamptz,
  spacing_minutes integer
)
returns table (place_id uuid, first_seen_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eligibility_start timestamptz;
begin
  select policy.eligibility_started_at into eligibility_start
  from private.achievement_policy as policy
  where policy.singleton
    and policy.enabled
    and policy.eligibility_started_at is not null;

  if not found then
    return;
  end if;

  return query
  select credited.place_id, credited.first_seen_at
  from private.credit_spaced_member_places(
    target_member_id,
    as_of,
    spacing_minutes,
    eligibility_start
  ) as credited;
end;
$$;

-- A caller-owned, read-only impact projection. Every value is recomputed from its durable source:
-- normalized qualifying activity, Check-ins, current eligible Ratings, submissions, Contributions,
-- and public Place identity. It deliberately contains no score, balance, rank, comparison, or
-- audience-reach estimate.
create function public.get_my_impact_record(requested_locale text)
returns table (
  member_since timestamptz,
  active_weeks integer,
  active_months integer,
  credited_places integer,
  credited_category_groups integer,
  credited_municipalities integer,
  valid_ratings integer,
  submissions_total integer,
  pending_submissions integer,
  rejected_submissions integer,
  resolved_without_contribution integer,
  confirmed_contributions integer,
  revoked_contributions integer,
  recent_outcomes jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  locale_value private.locale_code;
  account_created_at timestamptz;
  spacing_minutes integer;
  calculated_active_weeks integer;
  calculated_active_months integer;
  calculated_credited_places integer;
  calculated_credited_categories integer;
  calculated_credited_municipalities integer;
  calculated_valid_ratings integer;
  calculated_submissions_total integer;
  calculated_pending_submissions integer;
  calculated_rejected_submissions integer;
  calculated_resolved_without_contribution integer;
  calculated_confirmed_contributions integer;
  calculated_revoked_contributions integer;
  calculated_recent_outcomes jsonb;
begin
  if requested_locale is null or requested_locale not in ('is', 'en') then
    raise exception using errcode = '22023', message = 'Supported impact locale required';
  end if;
  locale_value := requested_locale::private.locale_code;

  select account.created_at
  into account_created_at
  from private.member_accounts as account
  where account.user_id = actor_id;

  if account_created_at is null then
    raise exception using errcode = '42501', message = 'Member activation required';
  end if;

  -- The established Achievement policy owns the spacing value. The fail-closed fallback matches
  -- the original 15-minute policy so impact integrity does not disappear while Achievements are dark.
  select coalesce(
    (
      select policy.credit_spacing_minutes
      from private.achievement_policy as policy
      where policy.singleton
    ),
    15
  )
  into spacing_minutes;

  select
    count(distinct activity.week_starts_on)::integer,
    count(
      distinct date_trunc('month', activity.occurred_at at time zone 'Atlantic/Reykjavik')
    )::integer
  into calculated_active_weeks, calculated_active_months
  from private.member_qualifying_activity as activity
  where activity.member_id = actor_id;

  select
    count(*)::integer,
    count(distinct private.place_category_group(place_record.category))::integer,
    count(distinct location_record.municipality)::integer
  into
    calculated_credited_places,
    calculated_credited_categories,
    calculated_credited_municipalities
  from private.credit_spaced_member_places(
    actor_id,
    statement_timestamp(),
    spacing_minutes,
    account_created_at
  ) as credited
  join private.places as place_record on place_record.id = credited.place_id
  join private.locations as location_record on location_record.id = place_record.location_id;

  select count(*)::integer
  into calculated_valid_ratings
  from private.dog_friendliness_ratings as rating
  where rating.member_id = actor_id
    and rating.excluded_at is null;

  with owned_submissions as (
    select
      suggestion.id as submission_id,
      'suggestion'::text as source_kind,
      suggestion.status::text as status,
      contribution.id as contribution_id
    from private.place_suggestions as suggestion
    left join private.contributions as contribution
      on contribution.suggestion_id = suggestion.id
    where suggestion.member_id = actor_id

    union all

    select
      flag.id,
      flag.kind::text,
      flag.status::text,
      contribution.id
    from private.place_flags as flag
    left join private.contributions as contribution
      on contribution.place_flag_id = flag.id
    where flag.member_id = actor_id
  )
  select
    count(*)::integer,
    count(*) filter (
      where submission.status in ('submitted', 'needs_information')
    )::integer,
    count(*) filter (where submission.status = 'rejected')::integer,
    count(*) filter (
      where submission.status not in ('submitted', 'needs_information', 'rejected')
        and submission.contribution_id is null
    )::integer
  into
    calculated_submissions_total,
    calculated_pending_submissions,
    calculated_rejected_submissions,
    calculated_resolved_without_contribution
  from owned_submissions as submission;

  select
    count(*) filter (where contribution.revoked_at is null)::integer,
    count(*) filter (where contribution.revoked_at is not null)::integer
  into calculated_confirmed_contributions, calculated_revoked_contributions
  from private.contributions as contribution
  where contribution.member_id = actor_id;

  select coalesce(
    jsonb_agg(outcome.payload order by outcome.activity_at desc, outcome.contribution_id),
    '[]'::jsonb
  )
  into calculated_recent_outcomes
  from (
    select
      contribution.id as contribution_id,
      coalesce(contribution.revoked_at, contribution.confirmed_at) as activity_at,
      jsonb_build_object(
        'contribution_id', contribution.id,
        'kind', contribution.kind,
        'state', case when contribution.revoked_at is null then 'confirmed' else 'revoked' end,
        'confirmed_at', contribution.confirmed_at,
        'revoked_at', contribution.revoked_at,
        'subject_place_id', contribution.subject_place_id,
        'place_name', translation_record.name,
        'availability', case
          when place_record.id is null then 'unavailable'
          when place_record.lifecycle = 'inactive'::private.place_lifecycle then 'inactive'
          when private.is_place_discoverable(place_record.id) then 'available'
          else 'unavailable'
        end,
        'successor_place_id', successor.successor_place_id,
        'successor_name', successor.successor_name,
        'successor_available', coalesce(successor.successor_available, false),
        'suggestion_id', contribution.suggestion_id,
        'place_flag_id', contribution.place_flag_id
      ) as payload
    from private.contributions as contribution
    left join private.places as place_record
      on place_record.id = contribution.subject_place_id
    left join private.place_translations as translation_record
      on translation_record.place_id = place_record.id
     and translation_record.locale = locale_value
    left join lateral private.get_place_identity_successor(
      place_record.id,
      locale_value::text
    ) as successor on place_record.id is not null
    where contribution.member_id = actor_id
    order by
      coalesce(contribution.revoked_at, contribution.confirmed_at) desc,
      contribution.id
    limit 6
  ) as outcome;

  return query
  select
    account_created_at,
    coalesce(calculated_active_weeks, 0),
    coalesce(calculated_active_months, 0),
    coalesce(calculated_credited_places, 0),
    coalesce(calculated_credited_categories, 0),
    coalesce(calculated_credited_municipalities, 0),
    coalesce(calculated_valid_ratings, 0),
    coalesce(calculated_submissions_total, 0),
    coalesce(calculated_pending_submissions, 0),
    coalesce(calculated_rejected_submissions, 0),
    coalesce(calculated_resolved_without_contribution, 0),
    coalesce(calculated_confirmed_contributions, 0),
    coalesce(calculated_revoked_contributions, 0),
    coalesce(calculated_recent_outcomes, '[]'::jsonb);
end;
$$;

revoke execute on function private.credit_spaced_member_places(
  uuid,
  timestamptz,
  integer,
  timestamptz
) from public, anon, authenticated, service_role;
revoke execute on function public.get_my_impact_record(text)
  from public, anon, service_role;
grant execute on function public.get_my_impact_record(text) to authenticated;

comment on function private.credit_spaced_member_places(uuid, timestamptz, integer, timestamptz) is
  'Shared private anti-burst sequence for credited distinct Place exploration. The caller supplies its own explicit eligibility boundary.';
comment on function public.get_my_impact_record(text) is
  'Caller-only permanent impact projection derived from durable activity, exploration, Rating, submission, Contribution, and Place identity sources without a points model or public profile.';

commit;
