begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_function(
  'private',
  'list_meaningful_retention_cohorts',
  array['timestamp with time zone', 'integer'],
  'Cohort retention has a deterministic private test seam'
);
select has_function(
  'private',
  'get_rolling_four_week_engagement',
  array['timestamp with time zone', 'integer'],
  'Rolling engagement has a deterministic private test seam'
);
select has_function(
  'public',
  'get_member_retention_report',
  array[]::text[],
  'Operators have one aggregate retention report RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_member_retention_report()',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.get_member_retention_report()',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.get_member_retention_report()',
    'execute'
  ),
  'Only the service role can request aggregate retention reporting'
);
select ok(
  not has_table_privilege(
    'service_role',
    'private.member_qualifying_activity',
    'select'
  ),
  'Reporting does not grant the service role raw member activity'
);

insert into auth.users (id)
select ('76900000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid
from generate_series(1, 6) as series;

insert into private.member_accounts (user_id)
select ('76900000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid
from generate_series(1, 6) as series;

insert into auth.users (id)
select ('76900000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid
from generate_series(20, 28) as series;

insert into private.member_accounts (user_id)
select ('76900000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid
from generate_series(20, 28) as series;

insert into private.check_ins (
  member_id,
  place_id,
  proximity_confirmed,
  request_id,
  checked_in_at
)
select
  ('76900000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  '30000000-0000-4000-8000-000000000003',
  'unknown',
  extensions.gen_random_uuid(),
  '2026-05-04T12:00:00Z'::timestamptz
from generate_series(1, 6) as series;

insert into private.check_ins (
  member_id,
  place_id,
  proximity_confirmed,
  request_id,
  checked_in_at
)
select
  ('76900000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  '30000000-0000-4000-8000-000000000003',
  'unknown',
  extensions.gen_random_uuid(),
  case
    when series <= 23 then '2026-03-02T12:00:00Z'::timestamptz
    else '2026-04-06T12:00:00Z'::timestamptz
  end
from generate_series(20, 28) as series;

insert into private.check_ins (
  member_id,
  place_id,
  proximity_confirmed,
  request_id,
  checked_in_at
)
select
  ('76900000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  '30000000-0000-4000-8000-000000000003',
  'unknown',
  extensions.gen_random_uuid(),
  case
    when series <= 23 then '2026-03-23T12:00:00Z'::timestamptz
    else '2026-04-27T12:00:00Z'::timestamptz
  end
from generate_series(20, 28) as series;

insert into private.check_ins (
  member_id,
  place_id,
  proximity_confirmed,
  request_id,
  checked_in_at
)
select
  ('76900000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  '30000000-0000-4000-8000-000000000003',
  'unknown',
  extensions.gen_random_uuid(),
  case
    when series <= 4 then '2026-05-25T12:00:00Z'::timestamptz
    else '2026-05-11T12:00:00Z'::timestamptz
  end
from generate_series(1, 6) as series;

select is(
  (
    select cohort.cohort_member_count
    from private.list_meaningful_retention_cohorts(
      '2026-06-08T12:00:00Z',
      5
    ) as cohort
    where cohort.cohort_starts_on = date '2026-05-04'
  ),
  6::bigint,
  'The cohort is anchored to each Member first qualifying week'
);
select is(
  (
    select cohort.retained_member_count
    from private.list_meaningful_retention_cohorts(
      '2026-06-08T12:00:00Z',
      5
    ) as cohort
    where cohort.cohort_starts_on = date '2026-05-04'
  ),
  4::bigint,
  'Retention requires another active week and Week 4 activity'
);
select is(
  (
    select cohort.retention_rate
    from private.list_meaningful_retention_cohorts(
      '2026-06-08T12:00:00Z',
      5
    ) as cohort
    where cohort.cohort_starts_on = date '2026-05-04'
  ),
  0.6667::numeric,
  'Visible cohort retention is rounded to four decimals'
);

select ok(
  (
    select cohort.suppressed
      and cohort.cohort_member_count is null
      and cohort.retained_member_count is null
      and cohort.retention_rate is null
    from private.list_meaningful_retention_cohorts(
      '2026-06-08T12:00:00Z',
      5
    ) as cohort
    where cohort.cohort_starts_on = date '2026-03-02'
  ),
  'A four-Member cohort suppresses every numeric value'
);
select ok(
  (
    select not cohort.suppressed
      and cohort.cohort_member_count = 5
      and cohort.retained_member_count = 5
      and cohort.retention_rate = 1
    from private.list_meaningful_retention_cohorts(
      '2026-06-08T12:00:00Z',
      5
    ) as cohort
    where cohort.cohort_starts_on = date '2026-04-06'
  ),
  'A five-Member cohort exposes only aggregate retention values'
);

select ok(
  (
    select report ? 'schemaVersion'
      and report ? 'cohorts'
      and report ? 'rollingFourWeek'
      and report ? 'guardrails'
      and not report::text ~* '(member_id|request_id|place_id|email)'
    from public.get_member_retention_report() as report
  ),
  'The operational report exposes only aggregate, privacy-filtered fields'
);
select is(
  (
    select jsonb_array_length(report -> 'cohorts')
    from public.get_member_retention_report() as report
  ),
  12,
  'The public report always returns exactly twelve cohort slots'
);
select is(
  (
    select jsonb_array_length(report -> 'guardrails' -> 'signals')
    from public.get_member_retention_report() as report
  ),
  7,
  'The public report always returns all seven guardrail kinds'
);

insert into private.check_ins (
  member_id,
  place_id,
  proximity_confirmed,
  request_id,
  checked_in_at
)
select
  ('76900000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  '30000000-0000-4000-8000-000000000003',
  'unknown',
  extensions.gen_random_uuid(),
  (
    bounds.starts_on - case when occurrence = 1 then 14 else 7 end
  ) + time '12:00'
from generate_series(1, 4) as series
cross join generate_series(1, 2) as occurrences(occurrence)
cross join private.reykjavik_week_bounds(statement_timestamp()) as bounds;

select ok(
  (
    select (report -> 'rollingFourWeek' ->> 'suppressed')::boolean
      and report -> 'rollingFourWeek' -> 'engagedMemberCount' = 'null'::jsonb
    from public.get_member_retention_report() as report
  ),
  'Four engaged Members remain suppressed in the rolling aggregate'
);

insert into private.check_ins (
  member_id,
  place_id,
  proximity_confirmed,
  request_id,
  checked_in_at
)
select
  '76900000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000003',
  'unknown',
  extensions.gen_random_uuid(),
  (
    bounds.starts_on - case when occurrence = 1 then 14 else 7 end
  ) + time '12:00'
from generate_series(1, 2) as occurrences(occurrence)
cross join private.reykjavik_week_bounds(statement_timestamp()) as bounds;

select ok(
  (
    select not (report -> 'rollingFourWeek' ->> 'suppressed')::boolean
      and (report -> 'rollingFourWeek' ->> 'engagedMemberCount')::integer = 5
    from public.get_member_retention_report() as report
  ),
  'Five engaged Members expose the rolling aggregate'
);

select ok(
  (
    select bool_and(
      (signal ->> 'suppressed')::boolean
      and signal -> 'eventCount' = 'null'::jsonb
    )
    from public.get_member_retention_report() as report
    cross join lateral jsonb_array_elements(
      report -> 'guardrails' -> 'signals'
    ) as signals(signal)
  ),
  'Every empty guardrail is suppressed without leaking an event count'
);

insert into private.activity_integrity_observations (
  member_id,
  source_kind,
  source_id,
  signal_kind,
  request_id,
  observed_at
)
select
  ('76900000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  'rating',
  extensions.gen_random_uuid(),
  'request_replay',
  extensions.gen_random_uuid(),
  bounds.starts_on::timestamp at time zone 'Atlantic/Reykjavik' - interval '1 day'
from generate_series(1, 4) as series
cross join private.reykjavik_week_bounds(statement_timestamp()) as bounds;

select ok(
  (
    select (signal ->> 'suppressed')::boolean
      and signal -> 'eventCount' = 'null'::jsonb
    from public.get_member_retention_report() as report
    cross join lateral jsonb_array_elements(
      report -> 'guardrails' -> 'signals'
    ) as signals(signal)
    where signal ->> 'kind' = 'replayed_requests'
  ),
  'Four affected Members suppress replay guardrail counts'
);

insert into private.activity_integrity_observations (
  member_id,
  source_kind,
  source_id,
  signal_kind,
  request_id,
  observed_at
)
select
  '76900000-0000-4000-8000-000000000005',
  'rating',
  extensions.gen_random_uuid(),
  'request_replay',
  extensions.gen_random_uuid(),
  bounds.starts_on::timestamp at time zone 'Atlantic/Reykjavik' - interval '1 day'
from private.reykjavik_week_bounds(statement_timestamp()) as bounds;

select ok(
  (
    select not (signal ->> 'suppressed')::boolean
      and (signal ->> 'eventCount')::integer = 5
    from public.get_member_retention_report() as report
    cross join lateral jsonb_array_elements(
      report -> 'guardrails' -> 'signals'
    ) as signals(signal)
    where signal ->> 'kind' = 'replayed_requests'
  ),
  'Five affected Members expose only the aggregate replay count'
);

insert into private.member_conduct_flags (
  id,
  member_id,
  flag_kind,
  reason,
  recorded_by,
  request_id,
  recorded_at
)
select
  ('76910000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  ('76900000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  'policy_violation',
  'Reporting threshold fixture',
  '76900000-0000-4000-8000-000000000001',
  extensions.gen_random_uuid(),
  '2020-01-01T12:00:00Z'
from generate_series(1, 5) as series;

select ok(
  (
    select not (signal ->> 'suppressed')::boolean
      and (signal ->> 'eventCount')::integer = 5
    from public.get_member_retention_report() as report
    cross join lateral jsonb_array_elements(
      report -> 'guardrails' -> 'signals'
    ) as signals(signal)
    where signal ->> 'kind' = 'active_conduct_flags'
  ),
  'Five old but uncleared conduct flags remain visible as an aggregate'
);

insert into private.member_conduct_flags (
  member_id,
  flag_kind,
  reason,
  recorded_by,
  request_id,
  cleared_flag_id
) values (
  '76900000-0000-4000-8000-000000000001',
  'flag_cleared',
  'Reporting threshold fixture cleared',
  '76900000-0000-4000-8000-000000000001',
  extensions.gen_random_uuid(),
  '76910000-0000-4000-8000-000000000001'
);

select ok(
  (
    select (signal ->> 'suppressed')::boolean
      and signal -> 'eventCount' = 'null'::jsonb
    from public.get_member_retention_report() as report
    cross join lateral jsonb_array_elements(
      report -> 'guardrails' -> 'signals'
    ) as signals(signal)
    where signal ->> 'kind' = 'active_conduct_flags'
  ),
  'Clearing one of five conduct flags returns the aggregate below the privacy threshold'
);

select * from finish();

rollback;
