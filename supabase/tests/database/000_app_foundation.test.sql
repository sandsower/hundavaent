begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

select has_schema('private', 'Private domain schema exists');
select has_schema('security', 'Private security schema exists');
select has_extension('postgis', 'PostGIS is available');
select has_extension('pgcrypto', 'Cryptographic UUID support is available');
select has_type('private', 'locale_code', 'Locale vocabulary exists');
select has_type('private', 'place_lifecycle', 'Place lifecycle vocabulary exists');
select has_type('private', 'place_category', 'Place category vocabulary exists');
select has_type('private', 'evidence_kind', 'Evidence vocabulary exists');
select has_type('private', 'access_area', 'Access Area vocabulary exists');
select has_type('private', 'restraint_condition', 'Restraint Condition vocabulary exists');
select has_type('private', 'permission_requirement', 'Permission Requirement vocabulary exists');
select has_type('private', 'verification_status', 'Verification status vocabulary exists');
select has_type('security', 'app_role', 'Application role vocabulary exists');

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'Anonymous callers cannot use the private schema'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'Authenticated callers cannot use the private schema directly'
);

select ok(
  not has_schema_privilege('anon', 'security', 'usage'),
  'Anonymous callers cannot use the security schema'
);

select ok(
  not has_schema_privilege('authenticated', 'security', 'usage'),
  'Authenticated callers cannot use the security schema directly'
);

select ok(
  has_schema_privilege('anon', 'public', 'usage'),
  'Anonymous callers can reach explicitly granted public functions'
);

select ok(
  not has_schema_privilege('anon', 'public', 'create'),
  'Anonymous callers cannot create objects in the public schema'
);

select * from finish();

rollback;
