begin;

create extension if not exists pgtap with schema extensions;

alter table private.locations alter column geometry_precision set default 'moderator_confirmed_point';
alter table private.locations alter column geometry_source set default 'Reviewed database test fixture';

select no_plan();

select has_type(
  'private', 'place_photo_rights_basis',
  'Photo rights use a closed, reviewable basis vocabulary'
);
select has_type(
  'private', 'place_photo_people_review',
  'Photo approval records a fail-closed people review'
);
select has_function(
  'public', 'get_photo_acquisition_inventory', array[]::text[],
  'Moderators can list every Place for photo acquisition'
);
select is(
  (
    select constraint_record.convalidated
    from pg_catalog.pg_constraint constraint_record
    join pg_catalog.pg_class table_record on table_record.oid = constraint_record.conrelid
    join pg_catalog.pg_namespace schema_record on schema_record.oid = table_record.relnamespace
    where schema_record.nspname = 'private'
      and table_record.relname = 'place_media'
      and constraint_record.conname = 'place_media_approval_requires_metadata_check'
  ),
  false,
  'The stricter approval constraint preserves legacy approvals while enforcing new writes'
);
select ok(
  not has_function_privilege('anon', 'public.get_photo_acquisition_inventory()', 'execute'),
  'Anonymous callers cannot list acquisition inventory'
);
select ok(
  not has_function_privilege('service_role', 'public.get_photo_acquisition_inventory()', 'execute'),
  'The service role cannot bypass the Moderator acquisition boundary'
);

insert into auth.users (id, email) values
  ('a6000000-0000-4000-8000-000000000001', 'photo-rights-moderator@example.invalid');
insert into private.member_accounts (user_id) values
  ('a6000000-0000-4000-8000-000000000001');
insert into security.role_grants (user_id, role) values
  ('a6000000-0000-4000-8000-000000000001', 'member'),
  ('a6000000-0000-4000-8000-000000000001', 'moderator');

insert into private.operators (id, name) values
  ('a6100000-0000-4000-8000-000000000001', 'Rights-safe operator');
insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude
) values
  ('a6200000-0000-4000-8000-000000000001', 'Rights Street 1', 'Reykjavík', '101',
    'reykjavik', 64.1466, -21.9426);

insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, website_url, version,
  published_at, created_by
) values
  (
    'a6300000-0000-4000-8000-000000000001',
    'a6100000-0000-4000-8000-000000000001',
    'a6200000-0000-4000-8000-000000000001',
    'rights_safe_published', 'published', 'cafe', 'https://venue.example.invalid', 1,
    '2026-07-01T00:00:00Z', 'a6000000-0000-4000-8000-000000000001'
  ),
  (
    'a6300000-0000-4000-8000-000000000002',
    'a6100000-0000-4000-8000-000000000001',
    'a6200000-0000-4000-8000-000000000001',
    'rights_safe_candidate', 'candidate', 'park', null, 1,
    null, 'a6000000-0000-4000-8000-000000000001'
  );
insert into private.place_translations (place_id, locale, name, description) values
  ('a6300000-0000-4000-8000-000000000001', 'is', 'Réttindakaffi', 'Lýsing.'),
  ('a6300000-0000-4000-8000-000000000001', 'en', 'Rights Cafe', 'Description.'),
  ('a6300000-0000-4000-8000-000000000002', 'is', 'Réttindagarður', 'Lýsing.'),
  ('a6300000-0000-4000-8000-000000000002', 'en', 'Rights Park', 'Description.');

insert into storage.objects (bucket_id, name, owner) values
  ('place-photos', 'a6300000-0000-4000-8000-000000000001/commons-one.jpg',
    'a6000000-0000-4000-8000-000000000001'),
  ('place-photos', 'a6300000-0000-4000-8000-000000000001/commons-two.jpg',
    'a6000000-0000-4000-8000-000000000001'),
  ('place-photos', 'a6300000-0000-4000-8000-000000000001/duplicate.jpg',
    'a6000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (select count(*)::int from public.get_photo_acquisition_inventory()
    where place_id in (
      'a6300000-0000-4000-8000-000000000001',
      'a6300000-0000-4000-8000-000000000002'
    )),
  2,
  'The acquisition inventory includes published and unpublished Places'
);
select results_eq(
  $$
    select lifecycle, name_en, website_url
    from public.get_photo_acquisition_inventory()
    where place_id in (
      'a6300000-0000-4000-8000-000000000001',
      'a6300000-0000-4000-8000-000000000002'
    )
    order by place_id
  $$,
  $$ values
    ('published'::text, 'Rights Cafe'::text, 'https://venue.example.invalid'::text),
    ('candidate'::text, 'Rights Park'::text, null::text)
  $$,
  'The inventory supplies lifecycle, English identity, and the official website'
);

select * from public.register_acquired_place_photo(
  jsonb_build_object(
    'place_id', 'a6300000-0000-4000-8000-000000000001',
    'kind', 'photo',
    'storage_object_path', 'a6300000-0000-4000-8000-000000000001/commons-one.jpg',
    'mime_type', 'image/jpeg',
    'byte_size', 4096,
    'width_px', 1600,
    'height_px', 1067,
    'source_url', 'https://commons.wikimedia.org/wiki/File:Rights_Cafe.jpg',
    'rights_basis', 'cc_by',
    'rights_evidence_reference', 'Wikimedia Commons revision 123',
    'license_reference', 'CC BY 4.0',
    'license_url', 'https://creativecommons.org/licenses/by/4.0/',
    'photographer_or_uploader', 'Commons Photographer',
    'attribution_text', 'Rights Cafe by Commons Photographer, CC BY 4.0',
    'attribution_url', 'https://commons.wikimedia.org/wiki/User:Photographer',
    'source_or_capture_date', '2026-06-01',
    'content_sha256', repeat('a', 64),
    'alt_text_is', 'Útsýni yfir Réttindakaffi',
    'alt_text_en', 'View of Rights Cafe',
    'people_review', 'unknown'
  ),
  'a6900000-0000-4000-8000-000000000001'
) \gset first_photo_

select is(
  (select rights_basis::text from public.get_moderation_place_media(
    'a6300000-0000-4000-8000-000000000001'
  ) where media_id = :'first_photo_media_id'),
  'cc_by',
  'A pending acquired photo retains its structured rights basis'
);
select is(
  (select content_sha256 from public.get_moderation_place_media(
    'a6300000-0000-4000-8000-000000000001'
  ) where media_id = :'first_photo_media_id'),
  repeat('a', 64),
  'A pending acquired photo retains its stable content identity'
);

select throws_ok(
  format(
    $$
      select * from public.approve_place_media(
        jsonb_build_object('media_id', %L, 'make_primary', true),
        'a6900000-0000-4000-8000-000000000002'
      )
    $$,
    :'first_photo_media_id'
  ),
  '22023', 'People review is incomplete',
  'Approval fails closed while identifiable-people review is unknown'
);

select results_eq(
  format(
    $$
      select approval_state from public.approve_place_media(
        jsonb_build_object(
          'media_id', %L,
          'people_review', 'no_prominent_people',
          'make_primary', true
        ),
        'a6900000-0000-4000-8000-000000000003'
      )
    $$,
    :'first_photo_media_id'
  ),
  $$ values ('approved'::text) $$,
  'A rights-complete and people-reviewed candidate can be approved as primary'
);

select results_eq(
  $$
    select rights_basis, source_url, license_url, attribution_text, is_primary
    from public.list_published_place_photos('a6300000-0000-4000-8000-000000000001')
  $$,
  $$ values (
    'cc_by'::text,
    'https://commons.wikimedia.org/wiki/File:Rights_Cafe.jpg'::text,
    'https://creativecommons.org/licenses/by/4.0/'::text,
    'Rights Cafe by Commons Photographer, CC BY 4.0'::text,
    true
  ) $$,
  'The public listing exposes safe attribution metadata with the primary photo'
);

select * from public.register_acquired_place_photo(
  jsonb_build_object(
    'place_id', 'a6300000-0000-4000-8000-000000000001',
    'kind', 'photo',
    'storage_object_path', 'a6300000-0000-4000-8000-000000000001/commons-two.jpg',
    'mime_type', 'image/jpeg',
    'byte_size', 5096,
    'width_px', 1600,
    'height_px', 1200,
    'source_url', 'https://commons.wikimedia.org/wiki/File:Rights_Cafe_2.jpg',
    'rights_basis', 'cc0',
    'rights_evidence_reference', 'Wikimedia Commons revision 456',
    'license_reference', 'CC0 1.0',
    'license_url', 'https://creativecommons.org/publicdomain/zero/1.0/',
    'photographer_or_uploader', 'Second Photographer',
    'attribution_text', 'Rights Cafe by Second Photographer, CC0 1.0',
    'attribution_url', 'https://commons.wikimedia.org/wiki/User:Second',
    'source_or_capture_date', '2026-06-02',
    'content_sha256', repeat('b', 64),
    'alt_text_is', 'Inngangur Réttindakaffis',
    'alt_text_en', 'Entrance to Rights Cafe',
    'people_review', 'no_prominent_people'
  ),
  'a6900000-0000-4000-8000-000000000004'
) \gset second_photo_

select * from public.approve_place_media(
  jsonb_build_object('media_id', :'second_photo_media_id', 'make_primary', true),
  'a6900000-0000-4000-8000-000000000005'
);

select is(
  (select count(*)::int from public.get_moderation_place_media(
    'a6300000-0000-4000-8000-000000000001'
  ) where kind = 'photo' and approval_state = 'approved' and retired_at is null and is_primary),
  1,
  'Exactly one active approved photo is primary for a Place'
);
select is(
  (select is_primary from public.get_moderation_place_media(
    'a6300000-0000-4000-8000-000000000001'
  ) where media_id = :'second_photo_media_id'),
  true,
  'Selecting a new primary assigns the requested photo'
);
select is(
  (select is_primary from public.get_moderation_place_media(
    'a6300000-0000-4000-8000-000000000001'
  ) where media_id = :'first_photo_media_id'),
  false,
  'Selecting a new primary atomically clears the previous primary'
);

select throws_ok(
  $$
    select * from public.register_acquired_place_photo(
      jsonb_build_object(
        'place_id', 'a6300000-0000-4000-8000-000000000001',
        'kind', 'photo',
        'storage_object_path', 'a6300000-0000-4000-8000-000000000001/duplicate.jpg',
        'mime_type', 'image/jpeg',
        'byte_size', 4096,
        'width_px', 1600,
        'height_px', 1067,
        'source_url', 'https://commons.wikimedia.org/wiki/File:Duplicate.jpg',
        'rights_basis', 'cc_by',
        'rights_evidence_reference', 'Wikimedia Commons revision 789',
        'license_reference', 'CC BY 4.0',
        'license_url', 'https://creativecommons.org/licenses/by/4.0/',
        'photographer_or_uploader', 'Duplicate Photographer',
        'attribution_text', 'Duplicate by Duplicate Photographer, CC BY 4.0',
        'source_or_capture_date', '2026-06-03',
        'content_sha256', repeat('a', 64),
        'alt_text_is', 'Tvítekin mynd',
        'alt_text_en', 'Duplicate photo',
        'people_review', 'unknown'
      ),
      'a6900000-0000-4000-8000-000000000006'
    )
  $$,
  '23505',
  null,
  'The same photo bytes cannot be registered twice under different object paths'
);

reset role;

select * from finish();
rollback;
