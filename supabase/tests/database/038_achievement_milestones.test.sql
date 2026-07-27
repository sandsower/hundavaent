begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- Locked visibility is no longer a column of its own: belonging to a collection is the single
-- source of truth for it, and 048 covers that surface. This file keeps what it alone proves - the
-- eligibility boundary, version pinning, claim-once semantics and the disabled sentinel.
select has_column(
  'private',
  'achievement_definitions',
  'progress_kind',
  'Achievement definitions designate their private progress calculation'
);
select has_column(
  'private',
  'achievement_policy',
  'eligibility_started_at',
  'Achievement policy records the immutable first-activation boundary'
);
select has_function(
  'private',
  'member_achievement_metrics',
  array['uuid', 'timestamp with time zone', 'integer'],
  'Achievement progress has one durable-source private seam'
);
select has_function(
  'public',
  'get_my_achievement_status',
  array[]::text[],
  'The account indicator has a non-consuming caller-only status read'
);
select has_function(
  'public',
  'claim_my_achievement_celebrations',
  array[]::text[],
  'The intended experience has a separate atomic celebration claim'
);

select ok(
  has_function_privilege('authenticated', 'public.get_my_achievement_status()', 'execute')
  and has_function_privilege(
    'authenticated',
    'public.claim_my_achievement_celebrations()',
    'execute'
  )
  and not has_function_privilege('anon', 'public.get_my_achievement_status()', 'execute')
  and not has_function_privilege(
    'anon',
    'public.claim_my_achievement_celebrations()',
    'execute'
  ),
  'Only authenticated Members can inspect or claim private Achievement state'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'private.achievement_definitions',
    'select'
  )
  and not has_table_privilege(
    'authenticated',
    'private.achievement_unlocks',
    'select,update'
  ),
  'The new member reads do not grant direct catalogue or unlock access'
);

insert into private.operators (id, name)
values ('78200000-0000-4000-8000-000000000001', 'Milestone fixture operator');

insert into private.locations (
  id,
  address_line,
  locality,
  postal_code,
  municipality,
  latitude,
  longitude,
  geometry_precision,
  geometry_source
)
values
  (
    '78210000-0000-4000-8000-000000000001',
    'Slóð 1',
    'Reykjavík',
    '101',
    'reykjavik',
    64.11,
    -21.91,
    'moderator_confirmed_point',
    'Milestone database fixture'
  ),
  (
    '78210000-0000-4000-8000-000000000002',
    'Slóð 2',
    'Kópavogur',
    '200',
    'kopavogur',
    64.12,
    -21.92,
    'moderator_confirmed_point',
    'Milestone database fixture'
  ),
  (
    '78210000-0000-4000-8000-000000000003',
    'Slóð 3',
    'Hafnarfjörður',
    '220',
    'hafnarfjordur',
    64.13,
    -21.93,
    'moderator_confirmed_point',
    'Milestone database fixture'
  );

insert into private.places (
  id,
  operator_id,
  location_id,
  purpose,
  lifecycle,
  category,
  published_at
)
values
  (
    '78220000-0000-4000-8000-000000000001',
    '78200000-0000-4000-8000-000000000001',
    '78210000-0000-4000-8000-000000000001',
    'dog_access_destination',
    'published',
    'restaurant',
    now()
  ),
  (
    '78220000-0000-4000-8000-000000000002',
    '78200000-0000-4000-8000-000000000001',
    '78210000-0000-4000-8000-000000000002',
    'dog_access_destination',
    'published',
    'shop',
    now()
  ),
  (
    '78220000-0000-4000-8000-000000000003',
    '78200000-0000-4000-8000-000000000001',
    '78210000-0000-4000-8000-000000000003',
    'dog_access_destination',
    'published',
    'park',
    now()
  );

insert into auth.users (id)
values
  ('78230000-0000-4000-8000-000000000001'),
  ('78230000-0000-4000-8000-000000000002'),
  ('78230000-0000-4000-8000-000000000003');

insert into private.member_accounts (user_id)
values
  ('78230000-0000-4000-8000-000000000001'),
  ('78230000-0000-4000-8000-000000000002'),
  ('78230000-0000-4000-8000-000000000003');

insert into security.role_grants (user_id, role)
values
  ('78230000-0000-4000-8000-000000000001', 'member'),
  ('78230000-0000-4000-8000-000000000002', 'member'),
  ('78230000-0000-4000-8000-000000000003', 'member');

-- This durable activity exists before the launch boundary and must never be backfilled.
insert into private.check_ins (
  member_id,
  place_id,
  proximity_confirmed,
  request_id,
  checked_in_at
)
values (
  '78230000-0000-4000-8000-000000000003',
  '78220000-0000-4000-8000-000000000001',
  'unknown',
  '78240000-0000-4000-8000-000000000003',
  '2026-07-20T08:00:00Z'
);

insert into private.achievement_policy (
  singleton,
  policy_version,
  credit_spacing_minutes,
  eligibility_started_at,
  enabled
)
values (
  true,
  'achievement-milestone-test-v1',
  15,
  '2026-07-20T09:00:00Z',
  true
)
on conflict (singleton) do update set
  policy_version = excluded.policy_version,
  credit_spacing_minutes = excluded.credit_spacing_minutes,
  eligibility_started_at = excluded.eligibility_started_at,
  enabled = excluded.enabled;

select throws_ok(
  $$
    update private.achievement_policy
    set eligibility_started_at = eligibility_started_at + interval '1 second'
    where singleton
  $$,
  '55000',
  'Achievement eligibility start is immutable once set',
  'The first-activation eligibility boundary cannot be moved'
);

insert into private.check_ins (
  member_id,
  place_id,
  proximity_confirmed,
  request_id,
  checked_in_at
)
values
  (
    '78230000-0000-4000-8000-000000000001',
    '78220000-0000-4000-8000-000000000001',
    'unknown',
    '78240000-0000-4000-8000-000000000001',
    '2026-07-20T10:00:00Z'
  ),
  (
    '78230000-0000-4000-8000-000000000001',
    '78220000-0000-4000-8000-000000000002',
    'unknown',
    '78240000-0000-4000-8000-000000000002',
    '2026-07-20T10:30:00Z'
  );

select set_config(
  'request.jwt.claim.sub',
  '78230000-0000-4000-8000-000000000003',
  true
);
set local role authenticated;

select ok(
  (
    select count(*) = 16
      and bool_and(enabled)
      and bool_and(entry_kind = 'locked')
      and bool_and(progress_current = 0)
    from public.get_my_achievements()
  ),
  'Pre-activation activity produces neither surfaced progress nor an earned Achievement'
);

reset role;

select is(
  (
    select count(*)
    from private.achievement_unlocks
    where member_id = '78230000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'The launch boundary does not backfill an unlock from historical activity'
);

insert into private.check_ins (
  member_id,
  place_id,
  proximity_confirmed,
  request_id,
  checked_in_at
)
values (
  '78230000-0000-4000-8000-000000000003',
  '78220000-0000-4000-8000-000000000002',
  'unknown',
  '78240000-0000-4000-8000-000000000004',
  '2026-07-20T11:00:00Z'
);

select set_config(
  'request.jwt.claim.sub',
  '78230000-0000-4000-8000-000000000003',
  true
);
set local role authenticated;

select is(
  (
    select max(progress_current)
    from public.get_my_achievements()
    where entry_kind = 'locked'
      and progress_kind <> 'credited_place_coverage'
  ),
  1,
  'Post-activation activity starts tier progress at one without historical credit'
);
select is(
  (
    select count(*)
    from public.get_my_achievements()
    where achievement_key = 'first_checkin'
      and entry_kind = 'earned'
  ),
  1::bigint,
  'Post-activation activity can earn its participation Achievement'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  '78230000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

-- This Member has two credited Places across two category groups and two municipalities, which
-- closes both bronze tiers whose threshold is two and leaves the other fourteen tiers visibly open.
select is(
  (
    select count(*)
    from public.get_my_achievements()
    where entry_kind = 'locked'
  ),
  14::bigint,
  'Every unearned tier stays visible, so the Member can see the shape of what is ahead'
);
select set_eq(
  $$
    select achievement_key
    from public.get_my_achievements()
    where entry_kind = 'earned'
  $$,
  $$
    values
      ('place_categories_bronze'::text),
      ('municipalities_bronze'::text),
      ('first_checkin'::text)
  $$,
  'Crossing a bronze threshold earns exactly that tier'
);
select is(
  (
    select progress_current
    from public.get_my_achievements()
    where achievement_key = 'place_categories_silver'
  ),
  2,
  'Category progress comes from distinct credited Place category groups'
);
select is(
  (
    select progress_target
    from public.get_my_achievements()
    where achievement_key = 'place_categories_silver'
  ),
  3,
  'Category progress exposes its understandable definition target'
);
select is(
  (
    select progress_current
    from public.get_my_achievements()
    where achievement_key = 'municipalities_silver'
  ),
  2,
  'Municipality progress comes from distinct credited Place municipalities'
);
select is(
  (
    select count(*)
    from public.get_my_achievements()
    where achievement_key in (
      'first_favourite',
      'first_rating',
      'sustained_quality_contributor',
      'six_month_member',
      'one_year_member'
    )
    and earned_at is null
  ),
  0::bigint,
  'Surprise and confidential Trusted Contributor Achievements never leak while locked'
);
select is(
  (
    select progress_current
    from public.get_my_achievements()
    where achievement_key = 'explorer_places_bronze'
  ),
  2,
  'A tier the Member is far from is still shown, with honest progress, rather than being hidden'
);

select is(
  (select has_unread from public.get_my_achievement_status()),
  true,
  'A newly earned Achievement produces a private unread account status'
);

reset role;

select is(
  (
    select notified_at
    from private.achievement_unlocks
    where member_id = '78230000-0000-4000-8000-000000000001'
      and achievement_key = 'first_checkin'
  ),
  null::timestamptz,
  'Reading the account status does not acknowledge the waiting Achievement'
);

set local role authenticated;

select is(
  (
    select count(*)
    from public.get_my_achievements()
    where achievement_key = 'first_checkin'
  ),
  1::bigint,
  'The pure catalogue read still includes the earned Achievement'
);

reset role;

select is(
  (
    select notified_at
    from private.achievement_unlocks
    where member_id = '78230000-0000-4000-8000-000000000001'
      and achievement_key = 'first_checkin'
  ),
  null::timestamptz,
  'Reading the catalogue does not acknowledge the waiting Achievement'
);

insert into private.achievement_definitions (
  key,
  version,
  achievement_group,
  display_order,
  name_is,
  name_en,
  description_is,
  description_en,
  criteria,
  progress_kind
)
select
  definition.key,
  2,
  definition.achievement_group,
  definition.display_order,
  'Nýr texti sem á ekki að sjást',
  'New copy that must not replace the earned version',
  definition.description_is,
  definition.description_en,
  definition.criteria,
  definition.progress_kind
from private.achievement_definitions as definition
where definition.key = 'first_checkin'
  and definition.version = 1;

set local role authenticated;

select is(
  (
    select name_en
    from public.get_my_achievements()
    where achievement_key = 'first_checkin'
  ),
  'First Check-in',
  'An earned Achievement remains pinned to its recorded definition version'
);
-- Three unlocks are waiting: first_checkin plus the two bronze tiers this Member's two credited
-- Places closed. A single claim takes all of them exactly once.
select is(
  (select count(*) from public.claim_my_achievement_celebrations()),
  3::bigint,
  'The intended experience atomically claims every newly earned Achievement once'
);
select is(
  (select count(*) from public.claim_my_achievement_celebrations()),
  0::bigint,
  'A repeated celebration claim cannot return the same Achievement again'
);
select is(
  (select has_unread from public.get_my_achievement_status()),
  false,
  'The account indicator clears after the intended experience claims the Achievement'
);

reset role;

select throws_ok(
  $$
    insert into private.achievement_unlocks (
      member_id,
      achievement_key,
      definition_version,
      earned_at
    )
    values (
      '78230000-0000-4000-8000-000000000001',
      'first_checkin',
      2,
      now()
    )
  $$,
  '23505',
  null,
  'The database structurally enforces one unlock per Member and Achievement key'
);

update private.achievement_policy
set enabled = false
where singleton;

set local role authenticated;

select ok(
  (
    select not enabled and not has_unread
    from public.get_my_achievement_status()
  ),
  'Disabled policy state exposes neither unread state nor catalogue availability'
);
select ok(
  (
    select count(*) = 1
      and bool_and(not enabled)
      and bool_and(achievement_key is null)
      and bool_and(entry_kind is null)
      and bool_and(progress_current is null)
      and bool_and(progress_target is null)
    from public.get_my_achievements()
  ),
  'Disabled policy state returns only a non-leaking sentinel row'
);
select is(
  (select count(*) from public.claim_my_achievement_celebrations()),
  0::bigint,
  'Disabled policy state cannot claim or expose an earned Achievement'
);

reset role;

update private.achievement_policy
set enabled = true
where singleton;

select set_config(
  'request.jwt.claim.sub',
  '78230000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;

select ok(
  (
    select count(*) = 16
      and bool_and(enabled)
      and bool_and(entry_kind = 'locked')
      and bool_and(earned_at is null)
      and bool_and(collection is not null)
    from public.get_my_achievements()
  ),
  'An enabled Member with nothing earned receives the full grid of open tiers, never an empty page'
);

reset role;

select * from finish();

rollback;
