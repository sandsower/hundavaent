begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_table(
  'private',
  'member_place_first_saves',
  'Weekly rhythm has one private immutable first-save source'
);
select has_function(
  'private',
  'reykjavik_week_bounds',
  array['timestamp with time zone'],
  'Reykjavík calendar boundaries have one database definition'
);
select has_function(
  'public',
  'get_current_member_weekly_rhythm',
  array[]::text[],
  'Members can load the current private week'
);
select has_function(
  'public',
  'list_current_member_weekly_rhythm',
  array[]::text[],
  'Members can load the eight-week private trail'
);
select is(
  (select count(*) from private.member_place_first_saves),
  0::bigint,
  'Deployment starts recognition empty and does not backfill pre-launch Favourite state'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'private.member_place_first_saves',
    'select,insert,update,delete'
  ),
  'Members cannot inspect or mutate first-save facts directly'
);
select ok(
  not has_table_privilege(
    'service_role',
    'private.member_place_first_saves',
    'select,insert,update,delete'
  ),
  'The service role has no unrestricted first-save data surface'
);
select ok(
  not has_function_privilege('anon', 'public.get_current_member_weekly_rhythm()', 'execute')
  and not has_function_privilege(
    'anon',
    'public.list_current_member_weekly_rhythm()',
    'execute'
  ),
  'Visitors cannot inspect a weekly rhythm'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_current_member_weekly_rhythm()',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.list_current_member_weekly_rhythm()',
    'execute'
  ),
  'Authenticated callers can reach the caller-owned weekly reads'
);

select is(
  (
    select bounds.starts_on
    from private.reykjavik_week_bounds('2026-01-04T23:59:59.999999Z') as bounds
  ),
  date '2025-12-29',
  'The final instant on Reykjavík Sunday belongs to the preceding Monday'
);
select is(
  (
    select bounds.ends_on
    from private.reykjavik_week_bounds('2026-01-04T23:59:59.999999Z') as bounds
  ),
  date '2026-01-04',
  'The inclusive display boundary ends on Reykjavík Sunday'
);
select is(
  (
    select bounds.starts_on
    from private.reykjavik_week_bounds('2026-01-05T00:00:00Z') as bounds
  ),
  date '2026-01-05',
  'Exactly midnight on Reykjavík Monday starts a new calendar week'
);
select is(
  (
    select bounds.ends_at - bounds.starts_at
    from private.reykjavik_week_bounds('2026-07-23T12:00:00Z') as bounds
  ),
  interval '7 days',
  'The half-open Reykjavík week contains exactly seven local days'
);

insert into auth.users (id)
values
  ('76700000-0000-4000-8000-000000000001'),
  ('76700000-0000-4000-8000-000000000002');

insert into private.member_accounts (user_id)
values
  ('76700000-0000-4000-8000-000000000001'),
  ('76700000-0000-4000-8000-000000000002');

insert into security.role_grants (user_id, role)
values
  ('76700000-0000-4000-8000-000000000001', 'member'),
  ('76700000-0000-4000-8000-000000000002', 'member');

update private.verifications
set freshness_until = greatest(
  verified_at + interval '1 second',
  statement_timestamp() - interval '1 second'
)
where id = '60000000-0000-4000-8000-000000000003';

select set_config('request.jwt.claim.sub', '76700000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (
    select concat_ws(
      ':',
      result.first_time_for_place,
      result.activated_current_week,
      result.current_week_active
    )
    from public.set_current_favourite(
      '30000000-0000-4000-8000-000000000003',
      true
    ) as result
  ),
  'true:true:true',
  'The first successful save creates first-Place and active-week recognition together'
);
select is(
  (
    select result.activated_current_week
    from public.set_current_favourite(
      '30000000-0000-4000-8000-000000000003',
      true
    ) as result
  ),
  false,
  'An idempotent retry cannot activate the same week again'
);
select is(
  (
    select result.first_time_for_place
    from public.set_current_favourite(
      '30000000-0000-4000-8000-000000000003',
      true
    ) as result
  ),
  false,
  'An idempotent retry is not another first save'
);
select is(
  (
    select result.current_week_active
    from public.set_current_favourite(
      '30000000-0000-4000-8000-000000000003',
      false
    ) as result
  ),
  true,
  'Removing current Favourite state does not erase the active-week fact'
);
select is(
  (
    select result.first_time_for_place
    from public.set_current_favourite(
      '30000000-0000-4000-8000-000000000003',
      true
    ) as result
  ),
  false,
  'Removing and resaving cannot manufacture a first-time recognition'
);
select is(
  (
    select result.activated_current_week
    from public.set_current_favourite(
      '30000000-0000-4000-8000-000000000003',
      true
    ) as result
  ),
  false,
  'Removing and resaving cannot manufacture another weekly activation'
);
select is(
  (select count(*) from private.member_place_first_saves),
  1::bigint,
  'Retries and resaves preserve exactly one immutable member and Place fact'
);
select is(
  (select rhythm.active from public.get_current_member_weekly_rhythm() as rhythm),
  true,
  'The current private week derives its active state from the first-save fact'
);
select is(
  (select count(*) from public.list_current_member_weekly_rhythm()),
  8::bigint,
  'The history read always returns exactly eight calendar weeks'
);
select is(
  (
    select count(*)
    from public.list_current_member_weekly_rhythm() as week
    where week.current
  ),
  1::bigint,
  'Exactly one of the eight weeks is current'
);
select ok(
  (
    select bool_and(ordered.starts_on < ordered.next_starts_on)
    from (
      select
        week.starts_on,
        lead(week.starts_on) over (order by week.starts_on) as next_starts_on
      from public.list_current_member_weekly_rhythm() as week
    ) as ordered
    where ordered.next_starts_on is not null
  ),
  'History is ordered from the oldest week to the current week'
);

reset role;

select throws_ok(
  $$
    update private.member_place_first_saves
    set first_saved_at = first_saved_at - interval '7 days'
    where member_id = '76700000-0000-4000-8000-000000000001'
  $$,
  '55000',
  'Member Place first-save facts are immutable',
  'A first-save timestamp cannot be rewritten'
);
select throws_ok(
  $$truncate private.member_place_first_saves$$,
  '55000',
  'Member Place first-save facts are immutable',
  'The first-save source cannot be truncated'
);

select set_config('request.jwt.claim.sub', '76700000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (select rhythm.active from public.get_current_member_weekly_rhythm() as rhythm),
  false,
  'Another Member cannot infer the first Member current activity'
);
select is(
  (
    select count(*)
    from public.list_current_member_weekly_rhythm() as week
    where week.active
  ),
  0::bigint,
  'Another Member cannot infer any active historical week'
);

reset role;

insert into private.member_place_first_saves (member_id, place_id)
values (
  '76700000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub', '76700000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (
    select concat_ws(
      ':',
      result.first_time_for_place,
      result.activated_current_week,
      result.current_week_active
    )
    from public.set_current_favourite(
      '30000000-0000-4000-8000-000000000003',
      true
    ) as result
  ),
  'true:false:true',
  'A second first-time Place in one week is recognized without activating that week twice'
);

reset role;

insert into private.member_place_first_saves (member_id, place_id, first_saved_at)
values (
  '76700000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  (
    select bounds.starts_at - interval '1 day'
    from private.reykjavik_week_bounds(statement_timestamp()) as bounds
  )
);

select set_config('request.jwt.claim.sub', '76700000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (
    select count(*)
    from public.list_current_member_weekly_rhythm() as week
    where week.active
  ),
  2::bigint,
  'Weekly history derives separate active weeks without a counter or weekly ledger'
);

reset role;

select is(
  private.detach_member_favourites('76700000-0000-4000-8000-000000000001'),
  3::bigint,
  'Account cleanup removes current Favourite state and both first-save facts'
);
select is(
  (
    select count(*)
    from private.member_place_first_saves
    where member_id = '76700000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'No weekly rhythm fact survives the private Member cleanup seam'
);
select is(
  private.detach_member_favourites('76700000-0000-4000-8000-000000000002'),
  3::bigint,
  'Cleanup also removes a Member with two first-save facts and one current Favourite'
);

set local role anon;

select throws_ok(
  $$select * from public.get_current_member_weekly_rhythm()$$,
  '42501',
  null,
  'A Visitor cannot call the current-week function'
);
select throws_ok(
  $$select * from public.list_current_member_weekly_rhythm()$$,
  '42501',
  null,
  'A Visitor cannot call the weekly-history function'
);

reset role;

select * from finish();

rollback;
