begin;

create function private.is_capital_region_municipality(value text)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select value = any (
    array[
      'reykjavik',
      'kopavogur',
      'seltjarnarnes',
      'gardabaer',
      'hafnarfjordur',
      'mosfellsbaer',
      'kjosarhreppur'
    ]::text[]
  );
$$;

comment on function private.is_capital_region_municipality(text) is
  'Capital-region municipalities published by SSH: https://www.ssh.is/is/verkefni/svaedisskipulag/gildandi-svaedisskipulag';

create table private.operators (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.locations (
  id uuid primary key default extensions.gen_random_uuid(),
  address_line text not null check (btrim(address_line) <> ''),
  locality text not null check (btrim(locality) <> ''),
  postal_code text not null check (postal_code ~ '^[0-9]{3}$'),
  country_code text not null default 'IS' check (country_code = 'IS'),
  municipality text not null check (private.is_capital_region_municipality(municipality)),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  coordinates extensions.geography(point, 4326)
    generated always as (
      extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
    ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality, address_line, postal_code, latitude, longitude)
);

create table private.places (
  id uuid primary key default extensions.gen_random_uuid(),
  operator_id uuid not null references private.operators(id) on delete restrict,
  location_id uuid not null references private.locations(id) on delete restrict,
  purpose text not null check (btrim(purpose) <> ''),
  lifecycle private.place_lifecycle not null default 'candidate',
  category private.place_category not null,
  website_url text check (website_url is null or website_url ~ '^https?://'),
  phone text check (phone is null or btrim(phone) <> ''),
  opening_hours jsonb not null default '{}'::jsonb check (jsonb_typeof(opening_hours) = 'object'),
  version bigint not null default 1 check (version > 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint places_lifecycle_publication_check check (
    case lifecycle
      when 'candidate' then published_at is null
      when 'published' then published_at is not null
      when 'inactive' then true
    end
  )
);

create unique index places_active_continuity_unique
  on private.places (operator_id, location_id, lower(purpose))
  where lifecycle <> 'inactive';

create table private.place_translations (
  place_id uuid not null references private.places(id) on delete cascade,
  locale private.locale_code not null,
  name text not null check (btrim(name) <> ''),
  description text not null check (btrim(description) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (place_id, locale)
);

create index locations_coordinates_gix
  on private.locations using gist (coordinates);

create index places_lifecycle_idx
  on private.places (lifecycle);

create index places_location_idx
  on private.places (location_id);

create index places_operator_idx
  on private.places (operator_id);

alter table private.operators enable row level security;
alter table private.locations enable row level security;
alter table private.places enable row level security;
alter table private.place_translations enable row level security;

comment on table private.operators is 'Operator responsible for governing a Place.';
comment on table private.locations is 'Physical capital-region address or bounded area occupied by a Place.';
comment on table private.places is 'Independently governed dog-access destination at one Location.';
comment on table private.place_translations is 'Required localized public identity for a Place.';

commit;
