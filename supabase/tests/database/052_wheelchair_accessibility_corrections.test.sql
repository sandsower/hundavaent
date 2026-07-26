begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

-- Fixtures --------------------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('aa000000-0000-4000-8000-000000000001', 'wheelchair-member@example.invalid'),
  ('aa000000-0000-4000-8000-000000000002', 'wheelchair-moderator@example.invalid');
insert into private.member_accounts (user_id) values
  ('aa000000-0000-4000-8000-000000000001'),
  ('aa000000-0000-4000-8000-000000000002');
insert into security.role_grants (user_id, role) values
  ('aa000000-0000-4000-8000-000000000001', 'member'),
  ('aa000000-0000-4000-8000-000000000002', 'member'),
  ('aa000000-0000-4000-8000-000000000002', 'moderator');

insert into private.operators (id, name) values
  ('aa100000-0000-4000-8000-000000000001', 'Wheelchair operator');
insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude,
  geometry_precision, geometry_source
) values (
  'aa200000-0000-4000-8000-000000000001', 'Adgengisgata 1', 'Reykjavík', '101', 'reykjavik',
  64.15, -21.95, 'moderator_confirmed_point', 'Reviewed database test fixture'
);
insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, version, published_at, created_by
) values (
  'aa300000-0000-4000-8000-000000000001', 'aa100000-0000-4000-8000-000000000001',
  'aa200000-0000-4000-8000-000000000001', 'dog_access_destination', 'published', 'cafe', 1,
  '2026-01-01T00:00:00Z', 'aa000000-0000-4000-8000-000000000002'
);
insert into private.place_translations (place_id, locale, name, description) values
  ('aa300000-0000-4000-8000-000000000001', 'is', 'Aðgengiskaffi', 'Upprunaleg lýsing.'),
  ('aa300000-0000-4000-8000-000000000001', 'en', 'Access Cafe', 'Original description.');

-- The value vocabulary --------------------------------------------------------------------------

select lives_ok(
  $$ select private.validate_place_field_value('wheelchair_accessibility', '{"value":"accessible"}'::jsonb) $$,
  'An accessible claim is a valid Correction value'
);

select lives_ok(
  $$ select private.validate_place_field_value('wheelchair_accessibility', '{"value":"partially_accessible"}'::jsonb) $$,
  'A partially accessible claim is a valid Correction value'
);

select lives_ok(
  $$ select private.validate_place_field_value('wheelchair_accessibility', '{"value":"not_accessible"}'::jsonb) $$,
  'A not-accessible claim is a valid Correction value'
);

select throws_ok(
  $$ select private.validate_place_field_value('wheelchair_accessibility', '{"value":"unknown"}'::jsonb) $$,
  '22023', null,
  'Unknown is the absence of a claim, so a Correction cannot propose it'
);

select throws_ok(
  $$ select private.validate_place_field_value('wheelchair_accessibility', '{"value":"ramp"}'::jsonb) $$,
  '22023', null,
  'A value outside the accessibility vocabulary is rejected'
);

select throws_ok(
  $$ select private.validate_place_field_value('wheelchair_accessibility', '{"value":"accessible","note":"x"}'::jsonb) $$,
  '22023', null,
  'A key outside the single-value envelope is rejected'
);

select throws_ok(
  $$ select private.validate_place_field_value('wheelchair_accessibility', '{"value":null}'::jsonb) $$,
  '22023', null,
  'A null value is rejected: there is no cleared state, only the Moderator''s explicit unknown'
);

-- A Member raises the claim from the badge ------------------------------------------------------

select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select lives_ok(
  $$
    select * from public.submit_place_correction(
      jsonb_build_object(
        'place_id', 'aa300000-0000-4000-8000-000000000001',
        'target_kind', 'place_field',
        'target_field', 'wheelchair_accessibility',
        'explanation', 'There is a portable ramp at the door but the washroom is upstairs.',
        'evidence', jsonb_build_object(
          'kind', 'member_report',
          'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:00:00Z',
          'source_url', null,
          'source_citation', 'Correction to the wheelchair accessibility, reported from the place card.',
          'source_metadata', jsonb_build_object(
            'submissionProfile', 'inline-v1', 'surface', 'place-card',
            'memberNoteProvided', true
          )
        ),
        'proposed_value', jsonb_build_object('value', 'partially_accessible')
      ),
      'aa700000-0000-4000-8000-000000000001'
    )
  $$,
  'A wheelchair accessibility Correction reaches the flag table through the command path'
);

select throws_ok(
  $$
    select * from public.submit_place_correction(
      jsonb_build_object(
        'place_id', 'aa300000-0000-4000-8000-000000000001',
        'target_kind', 'place_field',
        'target_field', 'wheelchair_accessibility',
        'explanation', 'I am not sure about this place.',
        'evidence', jsonb_build_object(
          'kind', 'member_report',
          'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:05:00Z',
          'source_url', null,
          'source_citation', 'Correction to the wheelchair accessibility, reported from the place card.',
          'source_metadata', '{}'::jsonb
        ),
        'proposed_value', jsonb_build_object('value', 'unknown')
      ),
      'aa700000-0000-4000-8000-000000000002'
    )
  $$,
  '22023', null,
  'A Correction proposing unknown is refused at submit, before any row exists'
);

reset role;

select is(
  (
    select flag.current_value_snapshot from private.place_flags flag
    where flag.request_id = 'aa700000-0000-4000-8000-000000000001'
  ),
  '{"value": "unknown"}'::jsonb,
  'The flag snapshots the published state in the single-value envelope every scalar field uses'
);

-- A Moderator applies it ------------------------------------------------------------------------

select set_config(
  'tests.wheelchair_flag_id',
  (
    select flag.id::text from private.place_flags flag
    where flag.request_id = 'aa700000-0000-4000-8000-000000000001'
  ),
  true
);

select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select lives_ok(
  $$
    select * from public.resolve_place_flag(
      current_setting('tests.wheelchair_flag_id')::uuid,
      'applied', 1, 0, null, null, null, null, null, null,
      'aa700000-0000-4000-8000-000000000003'
    )
  $$,
  'The untouched baseline draft applies the Member''s claim as proposed'
);

reset role;

select is(
  (
    select place.wheelchair_accessibility::text from private.places place
    where place.id = 'aa300000-0000-4000-8000-000000000001'
  ),
  'partially_accessible',
  'Applying the Correction writes the Place''s stated accessibility'
);

select is(
  (
    select place.version from private.places place
    where place.id = 'aa300000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'The application rides the same version bump every place-field application takes'
);

select * from finish();

rollback;
