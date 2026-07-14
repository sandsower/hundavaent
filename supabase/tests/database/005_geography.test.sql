begin;

create extension if not exists pgtap with schema extensions;

alter table private.locations alter column geometry_precision set default 'moderator_confirmed_point';
alter table private.locations alter column geometry_source set default 'Reviewed database test fixture';

select plan(10);

select has_function(
  'private',
  'is_capital_region_municipality',
  array['text'],
  'Capital-region membership has one deterministic helper'
);

select ok(
  private.is_capital_region_municipality('reykjavik'),
  'Reykjavik is inside the capital region'
);

select ok(
  not private.is_capital_region_municipality('akureyri'),
  'Akureyri is outside the capital region'
);

insert into private.operators (id, name)
values ('11000000-0000-4000-8000-000000000001', 'Geography fixture operator');

insert into private.locations (
  id,
  address_line,
  locality,
  postal_code,
  country_code,
  municipality,
  latitude,
  longitude
)
values (
  '21000000-0000-4000-8000-000000000001',
  'Laugavegur 1',
  'Reykjavík',
  '101',
  'IS',
  'reykjavik',
  64.1466,
  -21.9426
);

select is(
  round(extensions.st_x(coordinates::extensions.geometry)::numeric, 4),
  (-21.9426)::numeric,
  'Location longitude generates a PostGIS point'
)
from private.locations
where id = '21000000-0000-4000-8000-000000000001';

select is(
  round(extensions.st_y(coordinates::extensions.geometry)::numeric, 4),
  64.1466::numeric,
  'Location latitude generates a PostGIS point'
)
from private.locations
where id = '21000000-0000-4000-8000-000000000001';

select throws_ok(
  $$
    insert into private.locations (
      address_line,
      locality,
      postal_code,
      country_code,
      municipality,
      latitude,
      longitude
    )
    values ('Hafnarstræti 1', 'Akureyri', '600', 'IS', 'akureyri', 65.6826, -18.0907)
  $$,
  '23514',
  null,
  'A Location outside the capital-region municipalities is rejected'
);

insert into private.places (
  id,
  operator_id,
  location_id,
  purpose,
  category
)
values (
  '31000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'dog_access_destination',
  'restaurant'
);

select is(
  (select version from private.places where id = '31000000-0000-4000-8000-000000000001'),
  1::bigint,
  'A Candidate Place starts at optimistic version one'
);

select is(
  (select lifecycle::text from private.places where id = '31000000-0000-4000-8000-000000000001'),
  'candidate'::text,
  'A new Place starts as a Candidate'
);

select throws_ok(
  $$
    insert into private.places (
      operator_id,
      location_id,
      purpose,
      lifecycle,
      category
    )
    values (
      '11000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      'dog_access_destination',
      'published',
      'restaurant'
    )
  $$,
  '23514',
  null,
  'A Published Place requires a publication timestamp'
);

insert into private.place_translations (place_id, locale, name, description)
values (
  '31000000-0000-4000-8000-000000000001',
  'is',
  'Prófunarstaður',
  'Íslensk lýsing.'
);

select throws_ok(
  $$
    insert into private.place_translations (place_id, locale, name, description)
    values (
      '31000000-0000-4000-8000-000000000001',
      'is',
      'Annað heiti',
      'Önnur lýsing.'
    )
  $$,
  '23505',
  null,
  'A Place has only one translation per locale'
);

select * from finish();

rollback;
