begin;

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema private authorization postgres;
create schema security authorization postgres;

comment on schema private is
  'Private Hundavaent domain persistence. Public clients must use reviewed functions.';

comment on schema security is
  'Private Hundavaent authorization helpers. Public clients must use reviewed functions.';

revoke all on schema private from public, anon, authenticated, service_role;
revoke all on schema security from public, anon, authenticated, service_role;
revoke create on schema public from public, anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create type private.locale_code as enum (
  'is',
  'en'
);

create type private.place_lifecycle as enum (
  'candidate',
  'published',
  'inactive'
);

create type private.place_category as enum (
  'restaurant',
  'cafe',
  'bar',
  'shop',
  'shopping_centre',
  'accommodation',
  'park',
  'recreation',
  'culture',
  'service',
  'other'
);

create type private.evidence_kind as enum (
  'official_website',
  'venue_representative',
  'member_report',
  'direct_observation',
  'public_record',
  'other'
);

create type private.access_area as enum (
  'indoors',
  'outdoors',
  'designated_area'
);

create type private.restraint_condition as enum (
  'leash_required',
  'off_leash_permitted',
  'carrier_required'
);

create type private.permission_requirement as enum (
  'standing_permission',
  'ask_on_arrival',
  'advance_approval'
);

create type private.verification_status as enum (
  'verified',
  'reconfirmation_due',
  'disputed'
);

create type security.app_role as enum (
  'member',
  'trusted_contributor',
  'moderator',
  'venue_representative'
);

alter default privileges for role postgres in schema private
  revoke all on tables from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema private
  revoke all on sequences from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema security
  revoke all on tables from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema security
  revoke all on sequences from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema security
  revoke execute on functions from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

commit;
