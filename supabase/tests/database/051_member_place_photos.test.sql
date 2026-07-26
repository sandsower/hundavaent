begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

-- Fixtures --------------------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('98000000-0000-4000-8000-000000000001', 'photo-member@example.invalid'),
  ('98000000-0000-4000-8000-000000000002', 'photo-other-member@example.invalid'),
  ('98000000-0000-4000-8000-000000000003', 'photo-moderator@example.invalid'),
  ('98000000-0000-4000-8000-000000000004', 'photo-visitor@example.invalid');
insert into private.member_accounts (user_id) values
  ('98000000-0000-4000-8000-000000000001'),
  ('98000000-0000-4000-8000-000000000002'),
  ('98000000-0000-4000-8000-000000000003');
insert into security.role_grants (user_id, role) values
  ('98000000-0000-4000-8000-000000000001', 'member'),
  ('98000000-0000-4000-8000-000000000002', 'member'),
  ('98000000-0000-4000-8000-000000000003', 'member'),
  ('98000000-0000-4000-8000-000000000003', 'moderator');

insert into private.operators (id, name) values
  ('98100000-0000-4000-8000-000000000001', 'Photo operator');
insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude,
  geometry_precision, geometry_source
) values
  (
    '98200000-0000-4000-8000-000000000001', 'Ljosmyndargata 1', 'Reykjavík', '101', 'reykjavik',
    64.14, -21.94, 'moderator_confirmed_point', 'Reviewed database test fixture'
  ),
  (
    '98200000-0000-4000-8000-000000000002', 'Ljosmyndargata 2', 'Reykjavík', '101', 'reykjavik',
    64.15, -21.95, 'moderator_confirmed_point', 'Reviewed database test fixture'
  );

insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, version, published_at, created_by
) values
  (
    '98300000-0000-4000-8000-000000000001', '98100000-0000-4000-8000-000000000001',
    '98200000-0000-4000-8000-000000000001', 'dog_access_destination', 'published', 'cafe', 1,
    '2026-01-01T00:00:00Z', '98000000-0000-4000-8000-000000000003'
  ),
  (
    '98300000-0000-4000-8000-000000000002', '98100000-0000-4000-8000-000000000001',
    '98200000-0000-4000-8000-000000000002', 'dog_access_destination', 'published', 'park', 1,
    '2026-01-01T00:00:00Z', '98000000-0000-4000-8000-000000000003'
  );
insert into private.place_translations (place_id, locale, name, description) values
  ('98300000-0000-4000-8000-000000000001', 'is', 'Myndakaffi', 'Upprunaleg lýsing.'),
  ('98300000-0000-4000-8000-000000000001', 'en', 'Photo Cafe', 'Original description.'),
  ('98300000-0000-4000-8000-000000000002', 'is', 'Myndagarður', 'Upprunaleg lýsing.'),
  ('98300000-0000-4000-8000-000000000002', 'en', 'Photo Park', 'Original description.');

-- Storage objects are inserted directly, exactly as 022_place_media does: this SQL-only suite
-- cannot call the Storage HTTP API, and the object-exists check reads storage.objects either way.
insert into storage.objects (bucket_id, name, owner) values
  ('place-photos', '98300000-0000-4000-8000-000000000001/member-uploads/a1.jpg', null),
  ('place-photos', '98300000-0000-4000-8000-000000000001/member-uploads/a2.jpg', null),
  ('place-photos', '98300000-0000-4000-8000-000000000001/member-uploads/a3.jpg', null),
  ('place-photos', '98300000-0000-4000-8000-000000000002/member-uploads/b1.jpg', null),
  ('place-photos', '98300000-0000-4000-8000-000000000002/member-uploads/b2.jpg', null),
  ('place-photos', '98300000-0000-4000-8000-000000000002/member-uploads/nobody.jpg', null),
  ('place-photos', '98300000-0000-4000-8000-000000000001/approved.jpg', null),
  ('place-photos', '98300000-0000-4000-8000-000000000001/member-uploads/retired.jpg', null);

-- 1. The policy singleton and its configuration boundary ----------------------------------------

select has_table(
  'private', 'place_media_member_policy',
  'The Member photo policy has a table of its own rather than hard-coded numbers'
);

select throws_ok(
  $$ insert into private.place_media_member_policy (singleton) values (false) $$,
  '23514', null,
  'The policy is a singleton: a second, differently keyed row is refused'
);

insert into private.place_media_member_policy default values;
select is(
  (
    select pending_per_place || '/' || uploads_per_window || '/'
      || (extract(epoch from submission_window))::integer || '/' || byte_limit || '/' || enabled
    from private.place_media_member_policy
  ),
  '3/10/3600/8388608/false',
  'The column defaults record the approved values, and enabled is false so nothing is live by accident'
);
delete from private.place_media_member_policy;

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select throws_ok(
  $$ select public.configure_place_media_member_policy(3, 10, 3600, 8388608, true) $$,
  '42501', null,
  'Not even a Moderator can configure the policy from the application role'
);
reset role;

set local role anon;
select throws_ok(
  $$ select public.configure_place_media_member_policy(3, 10, 3600, 8388608, true) $$,
  '42501', null,
  'An anonymous Visitor cannot configure the policy'
);
reset role;

select throws_ok(
  $$ select public.configure_place_media_member_policy(0, 10, 3600, 8388608, true) $$,
  '22023', 'Member photo policy is invalid',
  'A policy value that permits nothing is refused rather than stored'
);

select public.configure_place_media_member_policy(9, 9, 60, 1024, false);
select public.configure_place_media_member_policy(2, 3, 3600, 8388608, false);
select is(
  (
    select count(*)::integer || ':' || pending_per_place || '/' || uploads_per_window || '/'
      || byte_limit || '/' || enabled
    from private.place_media_member_policy
    group by pending_per_place, uploads_per_window, byte_limit, enabled
  ),
  '1:2/3/8388608/false',
  'Configuring twice replaces the singleton in place rather than accumulating rows'
);

-- 2. Member submission --------------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$
    select * from public.submit_place_photo(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000001',
        'storage_object_path', '98300000-0000-4000-8000-000000000001/member-uploads/a1.jpg',
        'mime_type', 'image/jpeg', 'byte_size', 1024, 'width_px', 640, 'height_px', 480
      ),
      '98900000-0000-4000-8000-000000000001'
    )
  $$,
  '42501', null,
  'An anonymous Visitor cannot submit a photo'
);
reset role;

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select throws_ok(
  $$
    select * from public.submit_place_photo(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000001',
        'storage_object_path', '98300000-0000-4000-8000-000000000001/member-uploads/a1.jpg',
        'mime_type', 'image/jpeg', 'byte_size', 1024, 'width_px', 640, 'height_px', 480
      ),
      '98900000-0000-4000-8000-000000000002'
    )
  $$,
  '42501', 'Member activation required',
  'A signed-in Visitor who never activated a Member account cannot submit a photo'
);
reset role;

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.submit_place_photo(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000001',
        'storage_object_path', '98300000-0000-4000-8000-000000000001/member-uploads/a1.jpg',
        'mime_type', 'image/jpeg', 'byte_size', 1024, 'width_px', 640, 'height_px', 480
      ),
      '98900000-0000-4000-8000-000000000003'
    )
  $$,
  '55000', 'Member photo policy is not configured',
  'A policy that exists but is disabled fails closed rather than defaulting to permissive'
);

reset role;
select public.configure_place_media_member_policy(2, 3, 3600, 8388608, true);
set local role authenticated;

select lives_ok(
  $$
    select * from public.submit_place_photo(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000001',
        'storage_object_path', '98300000-0000-4000-8000-000000000001/member-uploads/a1.jpg',
        'mime_type', 'image/jpeg', 'byte_size', 1024, 'width_px', 640, 'height_px', 480
      ),
      '98900000-0000-4000-8000-000000000010'
    )
  $$,
  'A Member submits a photo of a published Place'
);

reset role;
select is(
  (
    select media.kind::text || '/' || media.storage_bucket || '/' || media.approval_state::text
      || '/' || (media.uploaded_by = '98000000-0000-4000-8000-000000000001')::text
    from private.place_media media
    where media.request_id = '98900000-0000-4000-8000-000000000010'
  ),
  'photo/place-photos/pending/true',
  'Kind, bucket, pending state and uploader are fixed by the function, not carried by the payload'
);
set local role authenticated;

select is(
  (
    select media_id from public.submit_place_photo(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000001',
        'storage_object_path', '98300000-0000-4000-8000-000000000001/member-uploads/a2.jpg',
        'mime_type', 'image/jpeg', 'byte_size', 2048, 'width_px', 320, 'height_px', 240
      ),
      '98900000-0000-4000-8000-000000000010'
    )
  ),
  (
    select media_id from public.list_my_place_photos('98300000-0000-4000-8000-000000000001')
    where storage_object_path = '98300000-0000-4000-8000-000000000001/member-uploads/a1.jpg'
  ),
  'A replayed request id returns the row the first call created, whatever the payload now says'
);

reset role;
select is(
  (select count(*)::integer from private.place_media
    where request_id = '98900000-0000-4000-8000-000000000010'),
  1,
  'The replay created no second row'
);
set local role authenticated;

select throws_ok(
  $$
    select * from public.submit_place_photo(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000001',
        'storage_object_path', '98300000-0000-4000-8000-000000000001/member-uploads/never.jpg',
        'mime_type', 'image/jpeg', 'byte_size', 1024, 'width_px', 640, 'height_px', 480
      ),
      '98900000-0000-4000-8000-000000000011'
    )
  $$,
  '22023', 'Uploaded object was not found in Storage',
  'A path with no object behind it cannot be registered'
);

select throws_ok(
  $$
    select * from public.submit_place_photo(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000009',
        'storage_object_path', '98300000-0000-4000-8000-000000000001/member-uploads/a2.jpg',
        'mime_type', 'image/jpeg', 'byte_size', 1024, 'width_px', 640, 'height_px', 480
      ),
      '98900000-0000-4000-8000-000000000012'
    )
  $$,
  '22023', 'Place was not found',
  'A photo of a Place that does not exist is refused'
);

select throws_ok(
  $$
    select * from public.submit_place_photo(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000001',
        'storage_object_path', '98300000-0000-4000-8000-000000000001/member-uploads/a2.jpg',
        'mime_type', 'image/jpeg'
      ),
      '98900000-0000-4000-8000-000000000013'
    )
  $$,
  '22023', 'Photo submission command is incomplete',
  'A payload missing its measured size and dimensions is refused'
);

select throws_ok(
  $$
    select * from public.submit_place_photo(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000001',
        'storage_object_path', '98300000-0000-4000-8000-000000000001/member-uploads/a2.jpg',
        'mime_type', 'image/jpeg', 'byte_size', 8388609, 'width_px', 640, 'height_px', 480
      ),
      '98900000-0000-4000-8000-000000000014'
    )
  $$,
  '54000', 'Photo exceeds the size limit',
  'The byte cap is enforced in the database too, not only by the endpoint that answers 413'
);

select lives_ok(
  $$
    select * from public.submit_place_photo(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000001',
        'storage_object_path', '98300000-0000-4000-8000-000000000001/member-uploads/a2.jpg',
        'mime_type', 'image/jpeg', 'byte_size', 2048, 'width_px', 320, 'height_px', 240
      ),
      '98900000-0000-4000-8000-000000000015'
    )
  $$,
  'A second photo of the same Place is accepted while the pending cap has room'
);

select throws_ok(
  $$
    select * from public.submit_place_photo(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000001',
        'storage_object_path', '98300000-0000-4000-8000-000000000001/member-uploads/a3.jpg',
        'mime_type', 'image/jpeg', 'byte_size', 2048, 'width_px', 320, 'height_px', 240
      ),
      '98900000-0000-4000-8000-000000000016'
    )
  $$,
  '54000', 'Too many photos already awaiting review',
  'A third pending photo of the same Place is refused by the per-Place cap'
);

select lives_ok(
  $$
    select * from public.submit_place_photo(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000002',
        'storage_object_path', '98300000-0000-4000-8000-000000000002/member-uploads/b1.jpg',
        'mime_type', 'image/jpeg', 'byte_size', 2048, 'width_px', 320, 'height_px', 240
      ),
      '98900000-0000-4000-8000-000000000017'
    )
  $$,
  'The per-Place cap is per Place: another Place is still open to the same Member'
);

select throws_ok(
  $$
    select * from public.submit_place_photo(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000002',
        'storage_object_path', '98300000-0000-4000-8000-000000000002/member-uploads/b2.jpg',
        'mime_type', 'image/jpeg', 'byte_size', 2048, 'width_px', 320, 'height_px', 240
      ),
      '98900000-0000-4000-8000-000000000018'
    )
  $$,
  '54000', 'Photo upload rate limit reached',
  'The window cap counts every Place together, so spreading uploads around does not evade it'
);

reset role;

-- Rows the RPC deliberately cannot create: an approved photo, a retired one, and one whose
-- uploader has since been forgotten (202607150036 made uploaded_by nullable).

insert into private.place_media (
  place_id, kind, storage_bucket, storage_object_path, mime_type, byte_size, width_px, height_px,
  photographer_or_uploader, source_or_capture_date, license_reference, rights_basis,
  rights_evidence_reference, attribution_text, people_review, alt_text_is, alt_text_en,
  approval_state, approved_by, approved_at, uploaded_by, request_id
) values (
  '98300000-0000-4000-8000-000000000001', 'photo', 'place-photos',
  '98300000-0000-4000-8000-000000000001/approved.jpg', 'image/jpeg', 4096, 800, 600,
  'Member photo', '2026-07-01', 'Used with permission', 'explicit_permission',
  'Moderator confirmed permission', 'Member photo', 'no_prominent_people', 'Mynd', 'Photo',
  'approved', '98000000-0000-4000-8000-000000000003', '2026-07-02T00:00:00Z',
  '98000000-0000-4000-8000-000000000001', '98900000-0000-4000-8000-000000000020'
);

insert into private.place_media (
  place_id, kind, storage_bucket, storage_object_path, mime_type, byte_size, width_px, height_px,
  uploaded_by, request_id, retired_at, retired_by
) values (
  '98300000-0000-4000-8000-000000000001', 'photo', 'place-photos',
  '98300000-0000-4000-8000-000000000001/member-uploads/retired.jpg', 'image/jpeg', 4096, 800, 600,
  '98000000-0000-4000-8000-000000000001', '98900000-0000-4000-8000-000000000021',
  '2026-07-03T00:00:00Z', '98000000-0000-4000-8000-000000000003'
);

insert into private.place_media (
  place_id, kind, storage_bucket, storage_object_path, mime_type, byte_size, width_px, height_px,
  uploaded_by, request_id
) values (
  '98300000-0000-4000-8000-000000000002', 'photo', 'place-photos',
  '98300000-0000-4000-8000-000000000002/member-uploads/nobody.jpg', 'image/jpeg', 4096, 800, 600,
  null, '98900000-0000-4000-8000-000000000022'
);

-- 3. The Storage read fences --------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  (select count(*)::integer from storage.objects
    where bucket_id = 'place-photos'
      and name = '98300000-0000-4000-8000-000000000001/member-uploads/a1.jpg'),
  1,
  'The uploader can read their own pending photo object, which no approval join would allow'
);
select is(
  (select count(*)::integer from storage.objects
    where bucket_id = 'place-photos'
      and name = '98300000-0000-4000-8000-000000000001/member-uploads/retired.jpg'),
  0,
  'A retired photo stops being readable by its own uploader'
);
select is(
  (select count(*)::integer from storage.objects
    where bucket_id = 'place-photos'
      and name = '98300000-0000-4000-8000-000000000002/member-uploads/nobody.jpg'),
  0,
  'A photo with no uploader is nobody''s photo, not everybody''s'
);
reset role;

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is(
  (select count(*)::integer from storage.objects
    where bucket_id = 'place-photos'
      and name = '98300000-0000-4000-8000-000000000001/member-uploads/a1.jpg'),
  0,
  'Another Member cannot read a pending photo object they did not upload'
);
reset role;

set local role anon;
select is(
  (select count(*)::integer from storage.objects
    where bucket_id = 'place-photos'
      and name = '98300000-0000-4000-8000-000000000001/member-uploads/a1.jpg'),
  0,
  'An anonymous Visitor cannot read a pending photo object'
);
select is(
  (select count(*)::integer from storage.objects
    where bucket_id = 'place-photos'
      and name = '98300000-0000-4000-8000-000000000001/approved.jpg'),
  1,
  'The approved-photo read policy still works: the new gateway widened nothing public'
);
select throws_ok(
  $$ select private.is_own_photo_object('98300000-0000-4000-8000-000000000001/approved.jpg') $$,
  '42501', null,
  'An anonymous Visitor cannot call the uploader gateway directly'
);
reset role;

-- 4. The Member's own strip ---------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  (
    select string_agg(storage_object_path, ',' order by storage_object_path)
    from public.list_my_place_photos('98300000-0000-4000-8000-000000000001')
  ),
  '98300000-0000-4000-8000-000000000001/approved.jpg,'
    || '98300000-0000-4000-8000-000000000001/member-uploads/a1.jpg,'
    || '98300000-0000-4000-8000-000000000001/member-uploads/a2.jpg',
  'The caller sees their own photos on the Place in every approval state'
);
select is(
  (
    select count(*)::integer from public.list_my_place_photos('98300000-0000-4000-8000-000000000001')
    where storage_object_path like '%retired.jpg'
  ),
  0,
  'A retired photo has left the strip'
);
select is(
  (
    select count(*)::integer from public.list_my_place_photos('98300000-0000-4000-8000-000000000002')
  ),
  1,
  'The listing is scoped to one Place, and a photo with no uploader is not the caller''s'
);
reset role;

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is(
  (
    select count(*)::integer from public.list_my_place_photos('98300000-0000-4000-8000-000000000001')
  ),
  0,
  'Another Member sees none of the uploader''s photos'
);
reset role;

set local role anon;
select throws_ok(
  $$ select * from public.list_my_place_photos('98300000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'An anonymous Visitor cannot list Member photos'
);
reset role;

-- 5. Moderator discovery ------------------------------------------------------------------------

update private.place_media
set uploaded_at = '2026-07-20T10:00:00Z'
where request_id = '98900000-0000-4000-8000-000000000022';
update private.place_media
set uploaded_at = '2026-07-19T10:00:00Z'
where request_id = '98900000-0000-4000-8000-000000000017';
update private.place_media
set uploaded_at = '2026-07-18T10:00:00Z'
where request_id in (
  '98900000-0000-4000-8000-000000000010', '98900000-0000-4000-8000-000000000015'
);

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select is(
  (select count(*)::integer from public.list_places_with_pending_photos()),
  2,
  'A Moderator sees every Place holding pending photos'
);
select is(
  (select place_id from public.list_places_with_pending_photos() limit 1),
  '98300000-0000-4000-8000-000000000002'::uuid,
  'The Place with the newest submission leads the work list'
);
select is(
  (
    select newest_uploaded_at from public.list_places_with_pending_photos()
    where place_id = '98300000-0000-4000-8000-000000000002'
  ),
  '2026-07-20T10:00:00Z'::timestamptz,
  'The newest submission on a Place is the timestamp the work list sorts by'
);
select is(
  (
    select pending_photo_count from public.list_places_with_pending_photos()
    where place_id = '98300000-0000-4000-8000-000000000001'
  ),
  2,
  'An approved photo and a retired one are not work waiting to be done'
);
select is(
  (
    select pending_photo_count from public.list_places_with_pending_photos()
    where place_id = '98300000-0000-4000-8000-000000000002'
  ),
  2,
  'A pending photo whose uploader is forgotten is still work waiting to be done'
);
reset role;

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok(
  $$ select * from public.list_places_with_pending_photos() $$,
  '42501', 'Moderator role required',
  'A Member cannot read the Moderator work list'
);
reset role;

select * from finish();

rollback;
