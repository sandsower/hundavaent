begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- Depth classification -------------------------------------------------------

select has_function(
  'private',
  'qualifying_activity_depth',
  array['text'],
  'Qualifying activity has one shared depth classifier'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.qualifying_activity_depth(text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.qualifying_activity_depth(text)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'private.qualifying_activity_depth(text)',
    'execute'
  ),
  'The depth classifier stays inside the security-definer reporting path'
);

select is(
  private.qualifying_activity_depth('favourite'),
  'shallow',
  'A saved Favourite is shallow, self-asserted activity'
);
select is(
  private.qualifying_activity_depth('check_in'),
  'shallow',
  'A Check-in is shallow, self-asserted activity'
);
select is(
  private.qualifying_activity_depth('rating'),
  'deep',
  'A Dog-Friendliness Rating is reviewable contribution work'
);
select is(
  private.qualifying_activity_depth('suggestion'),
  'deep',
  'A Suggestion is reviewable contribution work'
);
select is(
  private.qualifying_activity_depth('nonsense_source'),
  'unclassified',
  'An unknown source never silently joins either series'
);

-- Drift guards: a source added to the qualifying view without a deliberate depth
-- decision must fail here rather than quietly vanish from both reported series.
select is(
  (
    select count(*)
    from unnest(array['favourite', 'check_in', 'rating', 'suggestion']) as source(kind)
    where private.qualifying_activity_depth(source.kind) = 'unclassified'
  ),
  0::bigint,
  'Every literal qualifying source in the view carries a depth'
);
select is(
  (
    select count(*)
    from unnest(enum_range(null::private.place_flag_kind)) as source(kind)
    where private.qualifying_activity_depth(source.kind::text) <> 'deep'
  ),
  0::bigint,
  'Every Place flag kind is reviewable contribution work'
);

-- Fixtures --------------------------------------------------------------------

insert into auth.users (id)
select ('77000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid
from generate_series(1, 5) as series;
insert into private.member_accounts (user_id)
select ('77000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid
from generate_series(1, 5) as series;

insert into auth.users (id)
select ('77000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid
from generate_series(20, 23) as series;
insert into private.member_accounts (user_id)
select ('77000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid
from generate_series(20, 23) as series;

insert into auth.users (id)
select ('77000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid
from generate_series(40, 44) as series;
insert into private.member_accounts (user_id)
select ('77000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid
from generate_series(40, 44) as series;

-- Cohort 2026-05-04. Every Member is anchored by a Week 1 Check-in, so the cohort
-- denominator is identical across all three series and only depth varies.
insert into private.check_ins (
  member_id, place_id, proximity_confirmed, request_id, checked_in_at
)
select
  ('77000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  '30000000-0000-4000-8000-000000000003',
  'unknown',
  extensions.gen_random_uuid(),
  '2026-05-04T12:00:00Z'::timestamptz
from generate_series(1, 5) as series;

-- Members 1 to 3 return in Week 4 with shallow activity only.
insert into private.check_ins (
  member_id, place_id, proximity_confirmed, request_id, checked_in_at
)
select
  ('77000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  '30000000-0000-4000-8000-000000000003',
  'unknown',
  extensions.gen_random_uuid(),
  '2026-05-25T12:00:00Z'::timestamptz
from generate_series(1, 3) as series;

-- Member 4 returns in Week 4 through reviewable work, and contributes in Week 1 too,
-- so they are retained and deep-retained but never shallow-retained.
insert into private.place_suggestions (
  member_id, request_id, proposal, status, submitted_at
)
select
  '77000000-0000-4000-8000-000000000004'::uuid,
  extensions.gen_random_uuid(),
  '{}'::jsonb,
  'submitted',
  submitted.at
from (
  values
    ('2026-05-04T13:00:00Z'::timestamptz),
    ('2026-05-25T13:00:00Z'::timestamptz)
) as submitted(at);

-- Member 5 never returns.

-- A four-Member cohort that must stay fully suppressed across every series.
insert into private.check_ins (
  member_id, place_id, proximity_confirmed, request_id, checked_in_at
)
select
  ('77000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  '30000000-0000-4000-8000-000000000003',
  'unknown',
  extensions.gen_random_uuid(),
  '2026-04-06T12:00:00Z'::timestamptz
from generate_series(20, 23) as series;

-- Cohort assertions -----------------------------------------------------------

select ok(
  (
    select not cohort.suppressed
      and cohort.cohort_member_count = 5
      and cohort.retained_member_count = 4
      and cohort.retention_rate = 0.8
    from private.list_meaningful_retention_cohorts('2026-06-08T12:00:00Z', 5) as cohort
    where cohort.cohort_starts_on = date '2026-05-04'
  ),
  'Headline retention still counts every depth of qualifying activity'
);

select ok(
  (
    select cohort.shallow_retained_member_count = 3
      and cohort.shallow_retention_rate = 0.6
    from private.list_meaningful_retention_cohorts('2026-06-08T12:00:00Z', 5) as cohort
    where cohort.cohort_starts_on = date '2026-05-04'
  ),
  'Shallow retention excludes a Member who only returned through reviewable work'
);

select ok(
  (
    select cohort.deep_retained_member_count = 1
      and cohort.deep_retention_rate = 0.2
    from private.list_meaningful_retention_cohorts('2026-06-08T12:00:00Z', 5) as cohort
    where cohort.cohort_starts_on = date '2026-05-04'
  ),
  'Deep retention counts only Members whose returning activity enters Moderator review'
);

select ok(
  (
    select cohort.suppressed
      and cohort.cohort_member_count is null
      and cohort.retained_member_count is null
      and cohort.retention_rate is null
      and cohort.shallow_retained_member_count is null
      and cohort.shallow_retention_rate is null
      and cohort.deep_retained_member_count is null
      and cohort.deep_retention_rate is null
    from private.list_meaningful_retention_cohorts('2026-06-08T12:00:00Z', 5) as cohort
    where cohort.cohort_starts_on = date '2026-04-06'
  ),
  'A four-Member cohort suppresses the depth series alongside the headline series'
);

-- Rolling engagement ----------------------------------------------------------

-- Window for as_of 2026-05-25 is [2026-04-27, 2026-05-25).
-- Members 40 to 42 are active in two shallow weeks; 43 and 44 are active in two deep
-- weeks but only one shallow week.
insert into private.check_ins (
  member_id, place_id, proximity_confirmed, request_id, checked_in_at
)
select
  ('77000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  '30000000-0000-4000-8000-000000000003',
  'unknown',
  extensions.gen_random_uuid(),
  week.at
from generate_series(40, 42) as series
cross join (
  values ('2026-05-11T12:00:00Z'::timestamptz), ('2026-05-18T12:00:00Z'::timestamptz)
) as week(at);

insert into private.check_ins (
  member_id, place_id, proximity_confirmed, request_id, checked_in_at
)
select
  ('77000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  '30000000-0000-4000-8000-000000000003',
  'unknown',
  extensions.gen_random_uuid(),
  '2026-05-11T12:00:00Z'::timestamptz
from generate_series(43, 44) as series;

insert into private.place_suggestions (
  member_id, request_id, proposal, status, submitted_at
)
select
  ('77000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  extensions.gen_random_uuid(),
  '{}'::jsonb,
  'submitted',
  week.at
from generate_series(43, 44) as series
cross join (
  values ('2026-05-11T13:00:00Z'::timestamptz), ('2026-05-18T13:00:00Z'::timestamptz)
) as week(at);

select ok(
  (
    select not rolling.suppressed
      and rolling.engaged_member_count = 5
      and rolling.shallow_engaged_member_count = 3
      and rolling.deep_engaged_member_count = 2
    from private.get_rolling_four_week_engagement('2026-05-25T12:00:00Z', 5) as rolling
  ),
  'Rolling engagement separates shallow returners from reviewable contributors'
);

-- Report contract -------------------------------------------------------------

select is(
  (
    select report ->> 'schemaVersion'
    from public.get_member_retention_report() as report
  ),
  'member-retention-report/v2',
  'The aggregate report advertises the depth-aware schema version'
);

select ok(
  (
    select bool_and(
      cohort ?& array[
        'week1StartsOn',
        'week4StartsOn',
        'suppressed',
        'cohortMemberCount',
        'retainedMemberCount',
        'retentionRate',
        'shallowRetainedMemberCount',
        'shallowRetentionRate',
        'deepRetainedMemberCount',
        'deepRetentionRate'
      ]
      and (select count(*) from jsonb_object_keys(cohort)) = 10
    )
    from public.get_member_retention_report() as report
    cross join lateral jsonb_array_elements(report -> 'cohorts') as cohorts(cohort)
  ),
  'Every reported cohort carries exactly the depth-aware field set'
);

select ok(
  (
    select rolling ?& array[
        'windowStartsOn',
        'windowEndsOn',
        'suppressed',
        'engagedMemberCount',
        'shallowEngagedMemberCount',
        'deepEngagedMemberCount'
      ]
      and (select count(*) from jsonb_object_keys(rolling)) = 6
    from public.get_member_retention_report() as report
    cross join lateral (select report -> 'rollingFourWeek') as rollings(rolling)
  ),
  'The rolling aggregate carries exactly the depth-aware field set'
);

select ok(
  (
    select not report::text ~* '(member_id|request_id|place_id|email)'
    from public.get_member_retention_report() as report
  ),
  'Depth reporting still exposes no identifier of any kind'
);

select is(
  (
    select count(*)
    from private.member_qualifying_activity as activity
    where activity.activity_depth = 'unclassified'
  ),
  0::bigint,
  'No qualifying action reaches reporting without a depth'
);

select * from finish();

rollback;
