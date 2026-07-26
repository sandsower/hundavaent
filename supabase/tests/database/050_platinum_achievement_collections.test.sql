begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select set_eq(
  $$select key || ':' || name_en from private.achievement_collections$$,
  $$values
    ('explorer_places:Going Places'),
    ('place_categories:Mixing It Up'),
    ('municipalities:Covering Ground'),
    ('contributions:Lending a Paw')$$,
  'Collection names use the approved public copy'
);

select is(
  (select count(*) from private.achievement_definitions where tier = 'platinum'),
  4::bigint,
  'Every collection has one Platinum definition'
);

select results_eq(
  $$select collection, progress_kind, (criteria ->> 'threshold')::integer
    from private.achievement_definitions
    where tier = 'platinum'
    order by collection$$,
  $$values
    ('contributions', 'confirmed_contributions', 25),
    ('explorer_places', 'credited_place_coverage', 100),
    ('municipalities', 'credited_municipalities', 7),
    ('place_categories', 'credited_categories', 5)$$,
  'Platinum thresholds match the approved completion rules'
);

select results_eq(
  $$select collection, display_order
    from private.achievement_definitions
    where tier = 'platinum'
    order by display_order$$,
  $$values
    ('explorer_places', 14),
    ('place_categories', 18),
    ('municipalities', 22),
    ('contributions', 26)$$,
  'Platinum closes each collection before the next one begins'
);

-- The seed contains public discovery fixtures. Retire them inside this rolled-back test transaction
-- so the coverage denominator is exactly the catalogue declared below.
update private.places
set lifecycle = 'inactive'
where lifecycle = 'published';

insert into private.operators (id, name)
values ('b2000000-0000-4000-8000-000000000001', 'Platinum fixture operator');

with fixture as (
  select
    number,
    (array[
      'reykjavik', 'kopavogur', 'seltjarnarnes', 'gardabaer',
      'hafnarfjordur', 'mosfellsbaer', 'kjosarhreppur'
    ])[1 + ((number - 1) % 7)] as municipality
  from generate_series(1, 15) as number
)
insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude,
  geometry_precision, geometry_source
)
select
  md5('platinum-location-' || fixture.number)::uuid,
  'Platínugata ' || fixture.number,
  'Höfuðborgarsvæðið',
  lpad((100 + fixture.number)::text, 3, '0'),
  fixture.municipality,
  64.1 + fixture.number / 10000.0,
  -21.9 - fixture.number / 10000.0,
  'moderator_confirmed_point',
  'Platinum database test fixture'
from fixture;

with fixture as (
  select
    number,
    (array[
      'restaurant'::private.place_category,
      'shop'::private.place_category,
      'park'::private.place_category,
      'accommodation'::private.place_category,
      'culture'::private.place_category
    ])[1 + ((number - 1) % 5)] as category
  from generate_series(1, 15) as number
)
insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, published_at
)
select
  md5('platinum-place-' || fixture.number)::uuid,
  'b2000000-0000-4000-8000-000000000001',
  md5('platinum-location-' || fixture.number)::uuid,
  'dog_access_destination',
  'published',
  fixture.category,
  now()
from fixture;

insert into auth.users (id)
values
  ('b5000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000002');

insert into private.member_accounts (user_id)
values
  ('b5000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000002');

insert into security.role_grants (user_id, role)
values
  ('b5000000-0000-4000-8000-000000000001', 'member'),
  ('b5000000-0000-4000-8000-000000000002', 'member');

insert into private.achievement_policy (
  singleton, policy_version, credit_spacing_minutes, enabled, eligibility_started_at
)
values (true, 'platinum-test-v1', 15, true, now() - interval '1 year');

insert into private.check_ins (member_id, place_id, request_id, checked_in_at)
select
  'b5000000-0000-4000-8000-000000000001',
  md5('platinum-place-' || number)::uuid,
  extensions.gen_random_uuid(),
  now() - interval '1 day' + make_interval(mins => number * 20)
from generate_series(1, 15) as number;

select is(
  (select metric_value from private.member_achievement_metrics(
    'b5000000-0000-4000-8000-000000000001', now(), 15
  ) where progress_kind = 'credited_places'),
  15,
  'Fifteen spaced Places reach the Gold floor'
);

select is(
  (select metric_value from private.member_achievement_metrics(
    'b5000000-0000-4000-8000-000000000001', now(), 15
  ) where progress_kind = 'credited_place_coverage'),
  100,
  'Visiting the whole fifteen-Place catalogue reaches full coverage'
);

select is(
  (select metric_value from private.member_achievement_metrics(
    'b5000000-0000-4000-8000-000000000001', now(), 15
  ) where progress_kind = 'credited_categories'),
  5,
  'The fixture covers all five Place varieties'
);

select is(
  (select metric_value from private.member_achievement_metrics(
    'b5000000-0000-4000-8000-000000000001', now(), 15
  ) where progress_kind = 'credited_municipalities'),
  7,
  'The fixture covers all seven municipalities'
);

select set_eq(
  $$select achievement_key from private.achievement_unlocks
    where member_id = 'b5000000-0000-4000-8000-000000000001'
      and achievement_key like '%platinum'$$,
  $$values
    ('explorer_places_platinum'),
    ('place_categories_platinum'),
    ('municipalities_platinum')$$,
  'Completing each bounded exploration collection unlocks its Platinum badge'
);

insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude,
  geometry_precision, geometry_source
)
values (
  md5('platinum-location-16')::uuid,
  'Platínugata 16',
  'Höfuðborgarsvæðið',
  '116',
  'reykjavik',
  64.1016,
  -21.9016,
  'moderator_confirmed_point',
  'Platinum database test fixture'
);

insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, published_at
)
values (
  md5('platinum-place-16')::uuid,
  'b2000000-0000-4000-8000-000000000001',
  md5('platinum-location-16')::uuid,
  'dog_access_destination',
  'published',
  'service',
  now()
);

select is(
  (select metric_value from private.member_achievement_metrics(
    'b5000000-0000-4000-8000-000000000001', now(), 15
  ) where progress_kind = 'credited_place_coverage'),
  93,
  'Publishing a new Place moves live coverage from 100 to 93 percent'
);

select is(
  (select count(*) from private.achievement_unlocks
    where member_id = 'b5000000-0000-4000-8000-000000000001'
      and achievement_key = 'explorer_places_platinum'),
  1::bigint,
  'A moving target never revokes an earned Platinum badge'
);

insert into private.check_ins (member_id, place_id, request_id, checked_in_at)
values
  (
    'b5000000-0000-4000-8000-000000000002',
    md5('platinum-place-1')::uuid,
    extensions.gen_random_uuid(),
    now() - interval '2 hours'
  ),
  (
    'b5000000-0000-4000-8000-000000000002',
    md5('platinum-place-2')::uuid,
    extensions.gen_random_uuid(),
    now() - interval '2 hours' + interval '2 minutes'
  );

select is(
  (select count(*)::integer from private.credit_spaced_places(
    'b5000000-0000-4000-8000-000000000002', now(), 15
  )),
  1,
  'A rapid second Place is not credited immediately'
);

insert into private.check_ins (member_id, place_id, request_id, checked_in_at)
values (
  'b5000000-0000-4000-8000-000000000002',
  md5('platinum-place-2')::uuid,
  extensions.gen_random_uuid(),
  now() - interval '2 hours' + interval '20 minutes'
);

select is(
  (select count(*)::integer from private.credit_spaced_places(
    'b5000000-0000-4000-8000-000000000002', now(), 15
  )),
  2,
  'A later revisit credits a Place that was previously too close'
);

select * from finish();

rollback;
