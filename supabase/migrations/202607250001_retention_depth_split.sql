begin;

-- Retention has so far weighted every qualifying action identically: a saved Favourite counted
-- exactly as much as a Moderator-confirmed Correction. That made the headline rate unable to show
-- whether member engagement is actually producing the Contributions the corpus depends on, because
-- the cheapest and least verifiable actions can carry the rate on their own.
--
-- Depth splits the same activity stream two ways without changing the retention definition or the
-- cohort denominator, so the existing series stays comparable across the change:
--   shallow - private, self-asserted, cheap to perform, and never reviewed.
--   deep    - enters Moderator review and can become a Contribution.
-- One classifier owns the mapping so the view and both reporting seams cannot drift apart.
create function private.qualifying_activity_depth(source_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when source_kind in ('favourite', 'check_in') then 'shallow'
    when source_kind in ('rating', 'suggestion', 'correction', 'report') then 'deep'
    -- A source added to the qualifying view without a deliberate depth decision lands here rather
    -- than silently joining either series. Database tests assert this branch stays unreachable.
    else 'unclassified'
  end;
$$;

comment on function private.qualifying_activity_depth(text) is
  'Single source of truth for whether a qualifying action is a cheap self-asserted signal or reviewable contribution work. Unknown sources classify as unclassified so drift is visible instead of silently miscounted.';

-- The depth column is appended so every existing consumer that selects named columns is unaffected.
create or replace view private.member_qualifying_activity
with (security_invoker = true)
as
with ordered_rating_events as (
  select
    event.*,
    lag(event.id) over rating_order as previous_event_id,
    lag(event.overall_score) over rating_order as previous_overall_score,
    lag(event.welcome_score) over rating_order as previous_welcome_score,
    lag(event.clarity_score) over rating_order as previous_clarity_score,
    lag(event.comfort_score) over rating_order as previous_comfort_score,
    lag(event.thoughtfulness_score) over rating_order as previous_thoughtfulness_score
  from private.dog_friendliness_rating_events as event
  where event.event_kind in ('submitted', 'updated')
  window rating_order as (
    partition by event.member_id, event.place_id
    order by event.occurred_at, event.id
  )
),
material_rating_events as (
  select
    event.*,
    date_trunc(
      'week',
      event.occurred_at at time zone 'Atlantic/Reykjavik'
    )::date as week_starts_on
  from ordered_rating_events as event
  where event.previous_event_id is null
    or row(
      event.overall_score,
      event.welcome_score,
      event.clarity_score,
      event.comfort_score,
      event.thoughtfulness_score
    ) is distinct from row(
      event.previous_overall_score,
      event.previous_welcome_score,
      event.previous_clarity_score,
      event.previous_comfort_score,
      event.previous_thoughtfulness_score
    )
),
weekly_rating_events as (
  select
    event.*,
    row_number() over (
      partition by event.member_id, event.place_id, event.week_starts_on
      order by event.occurred_at, event.id
    ) as weekly_ordinal
  from material_rating_events as event
)
select
  save.member_id,
  'favourite'::text as source_kind,
  save.place_id as source_id,
  save.first_saved_at as occurred_at,
  date_trunc(
    'week',
    save.first_saved_at at time zone 'Atlantic/Reykjavik'
  )::date as week_starts_on,
  private.qualifying_activity_depth('favourite') as activity_depth
from private.member_place_first_saves as save

union all

select
  check_in.member_id,
  'check_in',
  check_in.id,
  check_in.checked_in_at,
  date_trunc(
    'week',
    check_in.checked_in_at at time zone 'Atlantic/Reykjavik'
  )::date,
  private.qualifying_activity_depth('check_in')
from private.check_ins as check_in

union all

select
  rating.member_id,
  'rating',
  rating.id,
  rating.occurred_at,
  rating.week_starts_on,
  private.qualifying_activity_depth('rating')
from weekly_rating_events as rating
where rating.weekly_ordinal = 1

union all

select
  suggestion.member_id,
  'suggestion',
  suggestion.id,
  suggestion.submitted_at,
  date_trunc(
    'week',
    suggestion.submitted_at at time zone 'Atlantic/Reykjavik'
  )::date,
  private.qualifying_activity_depth('suggestion')
from private.place_suggestions as suggestion

union all

select
  flag.member_id,
  flag.kind::text,
  flag.id,
  flag.submitted_at,
  date_trunc(
    'week',
    flag.submitted_at at time zone 'Atlantic/Reykjavik'
  )::date,
  private.qualifying_activity_depth(flag.kind::text)
from private.place_flags as flag;

-- Both reporting seams gain output columns, so they are dropped and recreated rather than replaced.
drop function private.list_meaningful_retention_cohorts(timestamptz, integer);

-- The cohort anchor and the retention rule are deliberately unchanged: Week 1 is still the Reykjavík
-- week of a Member's first qualifying action of any depth, and retention still requires two active
-- weeks including Week 4. Only the activity considered narrows, so all three series share one
-- denominator and the shallow and deep counts stay directly comparable to the headline count.
-- The series overlap by design - a Member active in both depths is counted in both.
create function private.list_meaningful_retention_cohorts(
  as_of timestamptz,
  minimum_cohort_size integer
)
returns table (
  cohort_starts_on date,
  cohort_ends_on date,
  cohort_member_count bigint,
  retained_member_count bigint,
  retention_rate numeric,
  shallow_retained_member_count bigint,
  shallow_retention_rate numeric,
  deep_retained_member_count bigint,
  deep_retention_rate numeric,
  suppressed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_bounds as (
    select bounds.starts_on
    from private.reykjavik_week_bounds(as_of) as bounds
  ),
  first_weeks as (
    select activity.member_id, min(activity.week_starts_on) as cohort_start
    from private.member_qualifying_activity as activity
    group by activity.member_id
  ),
  matured_members as (
    select first_week.member_id, first_week.cohort_start
    from first_weeks as first_week
    cross join current_bounds as bounds
    where first_week.cohort_start + 28 <= bounds.starts_on
  ),
  member_retention as (
    select
      member.member_id,
      member.cohort_start,
      count(distinct activity.week_starts_on) filter (
        where activity.week_starts_on >= member.cohort_start
          and activity.week_starts_on < member.cohort_start + 28
      ) >= 2
      and coalesce(bool_or(
        activity.week_starts_on = member.cohort_start + 21
      ), false) as retained,
      count(distinct activity.week_starts_on) filter (
        where activity.activity_depth = 'shallow'
      ) >= 2
      and coalesce(bool_or(
        activity.activity_depth = 'shallow'
          and activity.week_starts_on = member.cohort_start + 21
      ), false) as shallow_retained,
      count(distinct activity.week_starts_on) filter (
        where activity.activity_depth = 'deep'
      ) >= 2
      and coalesce(bool_or(
        activity.activity_depth = 'deep'
          and activity.week_starts_on = member.cohort_start + 21
      ), false) as deep_retained
    from matured_members as member
    left join private.member_qualifying_activity as activity
      on activity.member_id = member.member_id
      and activity.week_starts_on >= member.cohort_start
      and activity.week_starts_on < member.cohort_start + 28
    group by member.member_id, member.cohort_start
  ),
  cohort_counts as (
    select
      member.cohort_start,
      count(*)::bigint as member_count,
      count(*) filter (where member.retained)::bigint as retained_count,
      count(*) filter (where member.shallow_retained)::bigint as shallow_count,
      count(*) filter (where member.deep_retained)::bigint as deep_count
    from member_retention as member
    group by member.cohort_start
  )
  select
    cohort.cohort_start,
    cohort.cohort_start + 27,
    case
      when cohort.member_count < minimum_cohort_size then null
      else cohort.member_count
    end,
    case
      when cohort.member_count < minimum_cohort_size then null
      else cohort.retained_count
    end,
    case
      when cohort.member_count < minimum_cohort_size then null
      else round(
        cohort.retained_count::numeric / nullif(cohort.member_count, 0),
        4
      )
    end,
    case
      when cohort.member_count < minimum_cohort_size then null
      else cohort.shallow_count
    end,
    case
      when cohort.member_count < minimum_cohort_size then null
      else round(
        cohort.shallow_count::numeric / nullif(cohort.member_count, 0),
        4
      )
    end,
    case
      when cohort.member_count < minimum_cohort_size then null
      else cohort.deep_count
    end,
    case
      when cohort.member_count < minimum_cohort_size then null
      else round(
        cohort.deep_count::numeric / nullif(cohort.member_count, 0),
        4
      )
    end,
    cohort.member_count < minimum_cohort_size
  from cohort_counts as cohort
  order by cohort.cohort_start;
$$;

comment on function private.list_meaningful_retention_cohorts(timestamptz, integer) is
  'Deterministic cohort retention seam. Shallow and deep series reuse the headline cohort anchor, retention rule, denominator, and suppression rule so only the depth of the counted activity differs.';

drop function private.get_rolling_four_week_engagement(timestamptz, integer);

create function private.get_rolling_four_week_engagement(
  as_of timestamptz,
  minimum_population_size integer
)
returns table (
  window_starts_on date,
  window_ends_on date,
  active_member_count bigint,
  engaged_member_count bigint,
  engagement_rate numeric,
  shallow_engaged_member_count bigint,
  deep_engaged_member_count bigint,
  suppressed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_bounds as (
    select bounds.starts_on
    from private.reykjavik_week_bounds(as_of) as bounds
  ),
  member_weeks as (
    select
      activity.member_id,
      count(distinct activity.week_starts_on)::bigint as active_weeks,
      count(distinct activity.week_starts_on) filter (
        where activity.activity_depth = 'shallow'
      )::bigint as shallow_weeks,
      count(distinct activity.week_starts_on) filter (
        where activity.activity_depth = 'deep'
      )::bigint as deep_weeks
    from private.member_qualifying_activity as activity
    cross join current_bounds as bounds
    where activity.week_starts_on >= bounds.starts_on - 28
      and activity.week_starts_on < bounds.starts_on
    group by activity.member_id
  ),
  totals as (
    select
      count(*)::bigint as active_count,
      count(*) filter (where member.active_weeks >= 2)::bigint as engaged_count,
      count(*) filter (where member.shallow_weeks >= 2)::bigint as shallow_engaged_count,
      count(*) filter (where member.deep_weeks >= 2)::bigint as deep_engaged_count
    from member_weeks as member
  )
  select
    bounds.starts_on - 28,
    bounds.starts_on - 1,
    case
      when totals.active_count < minimum_population_size then null
      else totals.active_count
    end,
    case
      when totals.active_count < minimum_population_size then null
      else totals.engaged_count
    end,
    case
      when totals.active_count < minimum_population_size then null
      else round(
        totals.engaged_count::numeric / nullif(totals.active_count, 0),
        4
      )
    end,
    case
      when totals.active_count < minimum_population_size then null
      else totals.shallow_engaged_count
    end,
    case
      when totals.active_count < minimum_population_size then null
      else totals.deep_engaged_count
    end,
    totals.active_count < minimum_population_size
  from current_bounds as bounds
  cross join totals;
$$;

comment on function private.get_rolling_four_week_engagement(timestamptz, integer) is
  'Deterministic rolling engagement seam. Shallow and deep engagement reuse the headline two-active-week rule and population suppression so only the depth of the counted activity differs.';

create or replace function public.get_member_retention_report()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with reporting_bounds as (
    select
      bounds.starts_on as reporting_week_start,
      bounds.starts_on - 28 as rolling_start,
      bounds.starts_on::timestamp at time zone 'Atlantic/Reykjavik' as rolling_end_at,
      (bounds.starts_on - 28)::timestamp at time zone 'Atlantic/Reykjavik'
        as rolling_start_at
    from private.reykjavik_week_bounds(statement_timestamp()) as bounds
  ),
  report_cohort_weeks as (
    select
      (bounds.reporting_week_start - 28 - (offsets.weeks_ago * 7))::date
        as cohort_start,
      offsets.weeks_ago
    from reporting_bounds as bounds
    cross join generate_series(11, 0, -1) as offsets(weeks_ago)
  ),
  cohort_values as (
    select
      week.cohort_start,
      coalesce(cohort.suppressed, true) as suppressed,
      cohort.cohort_member_count,
      cohort.retained_member_count,
      cohort.retention_rate,
      cohort.shallow_retained_member_count,
      cohort.shallow_retention_rate,
      cohort.deep_retained_member_count,
      cohort.deep_retention_rate
    from report_cohort_weeks as week
    left join private.list_meaningful_retention_cohorts(
      statement_timestamp(),
      5
    ) as cohort
      on cohort.cohort_starts_on = week.cohort_start
    order by week.cohort_start
  ),
  cohort_json as (
    select jsonb_agg(
      jsonb_build_object(
        'week1StartsOn', cohort.cohort_start,
        'week4StartsOn', cohort.cohort_start + 21,
        'suppressed', cohort.suppressed,
        'cohortMemberCount', cohort.cohort_member_count,
        'retainedMemberCount', cohort.retained_member_count,
        'retentionRate', cohort.retention_rate,
        'shallowRetainedMemberCount', cohort.shallow_retained_member_count,
        'shallowRetentionRate', cohort.shallow_retention_rate,
        'deepRetainedMemberCount', cohort.deep_retained_member_count,
        'deepRetentionRate', cohort.deep_retention_rate
      ) order by cohort.cohort_start
    ) as value
    from cohort_values as cohort
  ),
  completed_member_weeks as (
    select
      activity.member_id,
      count(distinct activity.week_starts_on)::bigint as active_weeks,
      count(distinct activity.week_starts_on) filter (
        where activity.activity_depth = 'shallow'
      )::bigint as shallow_weeks,
      count(distinct activity.week_starts_on) filter (
        where activity.activity_depth = 'deep'
      )::bigint as deep_weeks
    from private.member_qualifying_activity as activity
    cross join reporting_bounds as bounds
    where activity.week_starts_on >= bounds.rolling_start
      and activity.week_starts_on < bounds.reporting_week_start
    group by activity.member_id
  ),
  rolling_values as (
    select
      count(*)::bigint as active_count,
      count(*) filter (where member.active_weeks >= 2)::bigint as engaged_count,
      count(*) filter (where member.shallow_weeks >= 2)::bigint as shallow_engaged_count,
      count(*) filter (where member.deep_weeks >= 2)::bigint as deep_engaged_count
    from completed_member_weeks as member
  ),
  raw_guardrails as (
    select
      'duplicate_check_ins'::text as kind,
      observation.member_id,
      observation.id as event_id
    from private.activity_integrity_observations as observation
    cross join reporting_bounds as bounds
    where observation.signal_kind = 'duplicate_check_in'
      and observation.observed_at >= bounds.rolling_start_at
      and observation.observed_at < bounds.rolling_end_at

    union all

    select
      'replayed_requests',
      observation.member_id,
      observation.id
    from private.activity_integrity_observations as observation
    cross join reporting_bounds as bounds
    where observation.signal_kind in (
      'request_replay',
      'merged_place_flag',
      'rating_no_material_change'
    )
      and observation.observed_at >= bounds.rolling_start_at
      and observation.observed_at < bounds.rolling_end_at

    union all

    select
      'rejected_suggestions',
      suggestion.member_id,
      suggestion.id
    from private.place_suggestions as suggestion
    cross join reporting_bounds as bounds
    where suggestion.status = 'rejected'
      and suggestion.resolved_at >= bounds.rolling_start_at
      and suggestion.resolved_at < bounds.rolling_end_at

    union all

    select
      'rejected_corrections_or_reports',
      flag.member_id,
      flag.id
    from private.place_flags as flag
    cross join reporting_bounds as bounds
    where flag.status = 'rejected'
      and flag.resolved_at >= bounds.rolling_start_at
      and flag.resolved_at < bounds.rolling_end_at

    union all

    select
      'revoked_contributions',
      contribution.member_id,
      contribution.id
    from private.contributions as contribution
    cross join reporting_bounds as bounds
    where contribution.revoked_at >= bounds.rolling_start_at
      and contribution.revoked_at < bounds.rolling_end_at

    union all

    select
      'excluded_ratings',
      rating.member_id,
      rating.id
    from private.dog_friendliness_ratings as rating
    cross join reporting_bounds as bounds
    where rating.excluded_at >= bounds.rolling_start_at
      and rating.excluded_at < bounds.rolling_end_at

    union all

    select
      'active_conduct_flags',
      flag.member_id,
      flag.id
    from private.member_conduct_flags as flag
    where flag.flag_kind <> 'flag_cleared'
      and not exists (
        select 1
        from private.member_conduct_flags as clearing
        where clearing.flag_kind = 'flag_cleared'
          and clearing.cleared_flag_id = flag.id
      )
  ),
  guardrail_kinds(kind, ordering) as (
    values
      ('duplicate_check_ins'::text, 1),
      ('replayed_requests', 2),
      ('rejected_suggestions', 3),
      ('rejected_corrections_or_reports', 4),
      ('revoked_contributions', 5),
      ('excluded_ratings', 6),
      ('active_conduct_flags', 7)
  ),
  guardrail_counts as (
    select
      kind.kind,
      kind.ordering,
      count(distinct raw.member_id)::bigint as affected_members,
      count(raw.event_id)::bigint as event_count
    from guardrail_kinds as kind
    left join raw_guardrails as raw on raw.kind = kind.kind
    group by kind.kind, kind.ordering
  ),
  guardrail_json as (
    select jsonb_agg(
      jsonb_build_object(
        'kind', guardrail.kind,
        'suppressed', guardrail.affected_members < 5,
        'eventCount', case
          when guardrail.affected_members < 5 then null
          else guardrail.event_count
        end
      ) order by guardrail.ordering
    ) as value
    from guardrail_counts as guardrail
  )
  select jsonb_build_object(
    'schemaVersion', 'member-retention-report/v2',
    'generatedAt', statement_timestamp(),
    'reportingWeekStartsOn', bounds.reporting_week_start,
    'timeZone', 'Atlantic/Reykjavik',
    'suppressionThreshold', 5,
    'cohorts', cohorts.value,
    'rollingFourWeek', jsonb_build_object(
      'windowStartsOn', bounds.rolling_start,
      'windowEndsOn', bounds.reporting_week_start - 1,
      'suppressed', rolling.active_count < 5,
      'engagedMemberCount', case
        when rolling.active_count < 5 then null
        else rolling.engaged_count
      end,
      'shallowEngagedMemberCount', case
        when rolling.active_count < 5 then null
        else rolling.shallow_engaged_count
      end,
      'deepEngagedMemberCount', case
        when rolling.active_count < 5 then null
        else rolling.deep_engaged_count
      end
    ),
    'guardrails', jsonb_build_object(
      'windowStartsOn', bounds.rolling_start,
      'windowEndsOn', bounds.reporting_week_start - 1,
      'signals', guardrails.value
    )
  )
  from reporting_bounds as bounds
  cross join cohort_json as cohorts
  cross join rolling_values as rolling
  cross join guardrail_json as guardrails;
$$;

comment on function public.get_member_retention_report() is
  'Service-role aggregate retention report. Version 2 adds shallow and deep retention series so engagement work can be judged against Contribution supply rather than undifferentiated activity.';
comment on view private.member_qualifying_activity is
  'Derived normalized qualifying actions over durable domain facts without a points ledger, each classified as shallow self-asserted activity or deep reviewable contribution work.';

-- The recreated seams and the new classifier inherit the same closed posture as everything else in
-- this reporting path: no role may execute them, and the view stays unreadable outside the
-- security-definer functions that aggregate it.
revoke all on private.member_qualifying_activity
  from public, anon, authenticated, service_role;
revoke execute on function private.qualifying_activity_depth(text)
  from public, anon, authenticated, service_role;
revoke execute on function private.list_meaningful_retention_cohorts(timestamptz, integer)
  from public, anon, authenticated, service_role;
revoke execute on function private.get_rolling_four_week_engagement(timestamptz, integer)
  from public, anon, authenticated, service_role;

revoke execute on function public.get_member_retention_report()
  from public, anon, authenticated;
grant execute on function public.get_member_retention_report() to service_role;

commit;
