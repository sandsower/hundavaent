begin;

create extension if not exists pgtap with schema extensions;

alter table private.locations alter column geometry_precision set default 'moderator_confirmed_point';
alter table private.locations alter column geometry_source set default 'Reviewed database test fixture';

select no_plan();

-- Function surface and privileges ---------------------------------------------------------------

select has_function(
  'public', 'register_place_media', array['jsonb', 'uuid'],
  'Moderators register one uploaded Storage object as Evidence or a candidate Photo'
);
select has_function(
  'public', 'get_moderation_place_media', array['uuid'],
  'Moderators list every Place media row including retired'
);
select has_function(
  'public', 'approve_place_media', array['jsonb', 'uuid'],
  'Moderators approve a photo with complete licensing metadata'
);
select has_function(
  'public', 'reject_place_media', array['jsonb', 'uuid'],
  'Moderators reject a pending photo'
);
select has_function(
  'public', 'retire_place_media', array['jsonb', 'uuid'],
  'Moderators retire Evidence or a Photo of any approval state'
);
select has_function(
  'public', 'list_published_place_photos', array['uuid'],
  'Anyone can list approved photos for a currently published Place'
);
select has_function(
  'public', 'list_published_place_primary_photos', array['uuid[]'],
  'Anyone can batch-list approved primary photos for published Places'
);

select ok(
  not has_function_privilege('anon', 'public.register_place_media(jsonb,uuid)', 'execute'),
  'Anonymous callers cannot register Place media'
);
select ok(
  not has_function_privilege('anon', 'public.get_moderation_place_media(uuid)', 'execute'),
  'Anonymous callers cannot list moderation Place media'
);
select ok(
  not has_function_privilege('anon', 'public.approve_place_media(jsonb,uuid)', 'execute'),
  'Anonymous callers cannot approve Place media'
);
select ok(
  not has_function_privilege('service_role', 'public.register_place_media(jsonb,uuid)', 'execute'),
  'The service role cannot register Place media - it must run as an authenticated Moderator'
);
select ok(
  has_function_privilege('authenticated', 'public.register_place_media(jsonb,uuid)', 'execute'),
  'Authenticated callers can reach the role-enforced registration boundary'
);
select ok(
  has_function_privilege('anon', 'public.list_published_place_photos(uuid)', 'execute'),
  'Anonymous Visitors can reach the public photo listing boundary'
);
select ok(
  has_function_privilege(
    'anon', 'public.list_published_place_primary_photos(uuid[])', 'execute'
  ),
  'Anonymous Visitors can reach the batched primary photo boundary'
);
select ok(
  not has_table_privilege('authenticated', 'private.place_media', 'select'),
  'Place media rows are unreachable outside security-definer functions'
);
select ok(
  not has_table_privilege('service_role', 'private.place_media', 'select'),
  'The service role cannot use Place media rows as an unrestricted query surface'
);

-- Storage bucket configuration -------------------------------------------------------------------

select is(
  (select public from storage.buckets where id = 'place-evidence'), false,
  'The Evidence bucket is private'
);
select is(
  (select public from storage.buckets where id = 'place-photos'), false,
  'The Photos bucket is private - nothing is public-endpoint reachable regardless of approval'
);

-- Fixtures -----------------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('79000000-0000-4000-8000-000000000001', 'media-moderator@example.invalid'),
  ('79000000-0000-4000-8000-000000000002', 'media-member@example.invalid'),
  ('79000000-0000-4000-8000-000000000003', 'media-venue-rep@example.invalid');
insert into private.member_accounts (user_id) values
  ('79000000-0000-4000-8000-000000000001'),
  ('79000000-0000-4000-8000-000000000002'),
  ('79000000-0000-4000-8000-000000000003');
insert into security.role_grants (user_id, role) values
  ('79000000-0000-4000-8000-000000000001', 'member'),
  ('79000000-0000-4000-8000-000000000001', 'moderator'),
  ('79000000-0000-4000-8000-000000000002', 'member'),
  ('79000000-0000-4000-8000-000000000003', 'member'),
  ('79000000-0000-4000-8000-000000000003', 'venue_representative');

insert into private.operators (id, name) values
  ('79100000-0000-4000-8000-000000000001', 'Media operator');
insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude
) values
  ('79200000-0000-4000-8000-000000000001', 'Media Street 1', 'Reykjavík', '101', 'reykjavik', 64.15, -21.95);

-- A published Place (photos here can become publicly listable once approved).
insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, version, published_at, created_by
) values (
  '79300000-0000-4000-8000-000000000001', '79100000-0000-4000-8000-000000000001',
  '79200000-0000-4000-8000-000000000001', 'dog_access_destination', 'published', 'cafe', 1,
  '2026-01-01T00:00:00Z', '79000000-0000-4000-8000-000000000001'
);
insert into private.place_translations (place_id, locale, name, description) values
  ('79300000-0000-4000-8000-000000000001', 'is', 'Myndakaffihús', 'Lýsing.'),
  ('79300000-0000-4000-8000-000000000001', 'en', 'Media Cafe', 'Description.');

-- A Candidate Place (evidence screenshots attach here; never publicly listable).
insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, version, created_by
) values (
  '79300000-0000-4000-8000-000000000002', '79100000-0000-4000-8000-000000000001',
  '79200000-0000-4000-8000-000000000001', 'dog_access_destination_candidate', 'candidate', 'cafe', 1,
  '79000000-0000-4000-8000-000000000001'
);
insert into private.place_translations (place_id, locale, name, description) values
  ('79300000-0000-4000-8000-000000000002', 'is', 'Frambodskaffihús', 'Lýsing.'),
  ('79300000-0000-4000-8000-000000000002', 'en', 'Candidate Cafe', 'Description.');

-- Storage objects are inserted directly (bypassing the Storage HTTP API, which this SQL-only
-- test suite cannot call) to simulate an already-uploaded object that register_place_media can
-- validate against.
insert into storage.objects (bucket_id, name, owner) values
  ('place-evidence', '79300000-0000-4000-8000-000000000002/evidence-one.png',
    '79000000-0000-4000-8000-000000000001'),
  ('place-photos', '79300000-0000-4000-8000-000000000001/photo-one.jpg',
    '79000000-0000-4000-8000-000000000001'),
  ('place-photos', '79300000-0000-4000-8000-000000000001/photo-two.jpg',
    '79000000-0000-4000-8000-000000000001');

-- Authorization: only a Moderator can register or read Place media -----------------------------

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok(
  $$
    select * from public.register_place_media(
      jsonb_build_object(
        'place_id', '79300000-0000-4000-8000-000000000002', 'kind', 'evidence_screenshot',
        'storage_object_path', '79300000-0000-4000-8000-000000000002/evidence-one.png',
        'mime_type', 'image/png', 'byte_size', 1024, 'width_px', 400, 'height_px', 300,
        'source_url', 'https://example.invalid/source', 'captured_at', '2026-07-12T00:00:00Z'
      ),
      '79900000-0000-4000-8000-000000000001'
    )
  $$,
  '42501', 'Moderator role required', 'A Member cannot register Place media'
);
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'place-evidence'
      and name = '79300000-0000-4000-8000-000000000002/evidence-one.png'),
  0,
  'A Member cannot read an Evidence object through Storage RLS'
);
reset role;

set local role anon;
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'place-evidence'
      and name = '79300000-0000-4000-8000-000000000002/evidence-one.png'),
  0,
  'An anonymous Visitor cannot read an Evidence object through Storage RLS - there is no approval-adjacent state that ever exposes Evidence publicly'
);
reset role;

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select throws_ok(
  $$
    select * from public.get_moderation_place_media('79300000-0000-4000-8000-000000000001')
  $$,
  '42501', 'Moderator role required', 'A Venue Representative cannot list moderation Place media'
);
reset role;

-- Registration: Evidence screenshot -----------------------------------------------------------

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'place-evidence'
      and name = '79300000-0000-4000-8000-000000000002/evidence-one.png'),
  1,
  'A Moderator can read an Evidence object through Storage RLS'
);

select lives_ok(
  $$
    select * from public.register_place_media(
      jsonb_build_object(
        'place_id', '79300000-0000-4000-8000-000000000002', 'kind', 'evidence_screenshot',
        'storage_object_path', '79300000-0000-4000-8000-000000000002/evidence-one.png',
        'mime_type', 'image/png', 'byte_size', 1024, 'width_px', 400, 'height_px', 300,
        'source_url', 'https://example.invalid/source', 'captured_at', '2026-07-12T00:00:00Z'
      ),
      '79900000-0000-4000-8000-000000000002'
    )
  $$,
  'A Moderator can register an Evidence screenshot with source URL and capture time'
);

select throws_ok(
  $$
    select * from public.register_place_media(
      jsonb_build_object(
        'place_id', '79300000-0000-4000-8000-000000000002', 'kind', 'evidence_screenshot',
        'storage_object_path', '79300000-0000-4000-8000-000000000002/evidence-one.png',
        'mime_type', 'image/png', 'byte_size', 1024, 'width_px', 400, 'height_px', 300
      ),
      '79900000-0000-4000-8000-000000000003'
    )
  $$,
  '22023', 'Evidence screenshot requires a source URL and capture time',
  'Evidence registration fails closed without provenance'
);

select throws_ok(
  $$
    select * from public.register_place_media(
      jsonb_build_object(
        'place_id', '79300000-0000-4000-8000-000000000002', 'kind', 'evidence_screenshot',
        'storage_object_path', '79300000-0000-4000-8000-000000000002/never-uploaded.png',
        'mime_type', 'image/png', 'byte_size', 1024, 'width_px', 400, 'height_px', 300,
        'source_url', 'https://example.invalid/source', 'captured_at', '2026-07-12T00:00:00Z'
      ),
      '79900000-0000-4000-8000-000000000004'
    )
  $$,
  '22023', 'Uploaded object was not found in Storage',
  'Registration requires the object to actually exist in Storage'
);

-- Registration: Photo (starts pending, no licensing metadata yet) ------------------------------

select lives_ok(
  $$
    select * from public.register_place_media(
      jsonb_build_object(
        'place_id', '79300000-0000-4000-8000-000000000001', 'kind', 'photo',
        'storage_object_path', '79300000-0000-4000-8000-000000000001/photo-one.jpg',
        'mime_type', 'image/jpeg', 'byte_size', 2048, 'width_px', 1600, 'height_px', 1200
      ),
      '79900000-0000-4000-8000-000000000005'
    )
  $$,
  'A Moderator can register a candidate Photo without licensing metadata yet'
);

select lives_ok(
  $$
    select * from public.register_place_media(
      jsonb_build_object(
        'place_id', '79300000-0000-4000-8000-000000000001', 'kind', 'photo',
        'storage_object_path', '79300000-0000-4000-8000-000000000001/photo-two.jpg',
        'mime_type', 'image/jpeg', 'byte_size', 2048, 'width_px', 1600, 'height_px', 1200
      ),
      '79900000-0000-4000-8000-000000000006'
    )
  $$,
  'A second candidate Photo can be registered'
);

select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'place-photos'
      and name = '79300000-0000-4000-8000-000000000001/photo-one.jpg'),
  1,
  'A Moderator can preview a still-pending Photo object before approving it'
);

reset role;
select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'place-photos'
      and name = '79300000-0000-4000-8000-000000000001/photo-one.jpg'),
  0,
  'A Member cannot read a still-pending Photo object'
);
reset role;

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000001', true);
set local role authenticated;

-- Registration idempotency ---------------------------------------------------------------------

select lives_ok(
  $$
    select * from public.register_place_media(
      jsonb_build_object(
        'place_id', '79300000-0000-4000-8000-000000000001', 'kind', 'photo',
        'storage_object_path', '79300000-0000-4000-8000-000000000001/photo-one.jpg',
        'mime_type', 'image/jpeg', 'byte_size', 2048, 'width_px', 1600, 'height_px', 1200
      ),
      '79900000-0000-4000-8000-000000000005'
    )
  $$,
  'A repeated request id is accepted without error'
);

reset role;

select is(
  (select count(*)::int from private.place_media
    where storage_object_path = '79300000-0000-4000-8000-000000000001/photo-one.jpg'),
  1,
  'A repeated request id returns the existing row instead of creating a duplicate'
);

select id as photo_one_id from private.place_media
where storage_object_path = '79300000-0000-4000-8000-000000000001/photo-one.jpg' \gset
select id as photo_two_id from private.place_media
where storage_object_path = '79300000-0000-4000-8000-000000000001/photo-two.jpg' \gset

-- Approval requires complete metadata -----------------------------------------------------------

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok(
  format(
    $$
      select * from public.approve_place_media(
        jsonb_build_object('media_id', %L, 'photographer_or_uploader', 'A. Person'),
        '79900000-0000-4000-8000-000000000007'
      )
    $$,
    :'photo_one_id'
  ),
  '22023', 'Licensing metadata is incomplete',
  'Approval fails closed without complete licensing metadata'
);
reset role;

select throws_ok(
  format(
    $$ insert into private.place_media (
      place_id, kind, storage_bucket, storage_object_path, mime_type, byte_size,
      width_px, height_px, approval_state, approved_by, approved_at, uploaded_by, request_id
    ) values (
      '79300000-0000-4000-8000-000000000001', 'photo', 'place-photos', 'direct-insert-bad.jpg',
      'image/jpeg', 100, 10, 10, 'approved', %L, now(), %L, '79900000-0000-4000-8000-000000000099'
    ) $$,
    '79000000-0000-4000-8000-000000000001', '79000000-0000-4000-8000-000000000001'
  ),
  '23514',
  'new row for relation "place_media" violates check constraint "place_media_approval_requires_metadata_check"',
  'The place_media_approval_requires_metadata_check CHECK constraint is the schema-level backstop, independent of RPC validation'
);

select throws_ok(
  $$ insert into private.place_media (
    place_id, kind, storage_bucket, storage_object_path, mime_type, byte_size,
    width_px, height_px, source_url, captured_at, captured_by, approval_state, approved_by,
    approved_at, uploaded_by, request_id
  ) values (
    '79300000-0000-4000-8000-000000000002', 'evidence_screenshot', 'place-evidence',
    'direct-insert-evidence-bad.png', 'image/png', 100, 10, 10,
    'https://example.invalid/x', now(), '79000000-0000-4000-8000-000000000001', 'approved',
    '79000000-0000-4000-8000-000000000001', now(), '79000000-0000-4000-8000-000000000001',
    '79900000-0000-4000-8000-000000000098'
  ) $$,
  '23514',
  'new row for relation "place_media" violates check constraint "place_media_approval_requires_metadata_check"',
  'Evidence can never structurally reach approval_state = approved'
);

-- Approval succeeds atomically with complete metadata ------------------------------------------

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select results_eq(
  format(
    $$
      select approval_state from public.approve_place_media(
        jsonb_build_object(
          'media_id', %L,
          'photographer_or_uploader', 'A. Photographer',
          'source_or_capture_date', '2026-06-01',
          'license_reference', 'Owner-supplied, permission on file',
          'rights_basis', 'explicit_permission',
          'rights_evidence_reference', 'Owner-supplied, permission on file',
          'attribution_text', 'A. Photographer',
          'people_review', 'no_prominent_people',
          'make_primary', true,
          'alt_text_is', 'Hundur liggur á gólfi kaffihúss',
          'alt_text_en', 'A dog lies on a cafe floor'
        ),
        '79900000-0000-4000-8000-000000000010'
      )
    $$,
    :'photo_one_id'
  ),
  $$ values ('approved'::text) $$,
  'Approval with complete metadata succeeds atomically'
);

-- Public listing: only approved, non-retired photos of a published Place -----------------------

select results_eq(
  $$
    select storage_object_path from public.list_published_place_photos(
      '79300000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values ('79300000-0000-4000-8000-000000000001/photo-one.jpg'::text) $$,
  'The public photo listing returns only the approved photo, not the still-pending one'
);

select results_eq(
  $$
    select place_id, storage_object_path
    from public.list_published_place_primary_photos(
      array[
        '79300000-0000-4000-8000-000000000001',
        '79300000-0000-4000-8000-000000000002'
      ]::uuid[]
    )
  $$,
  $$ values (
    '79300000-0000-4000-8000-000000000001'::uuid,
    '79300000-0000-4000-8000-000000000001/photo-one.jpg'::text
  ) $$,
  'The batched projection returns only a published Place primary photo'
);

-- The check above passes even vacuously (the Candidate Place has no photo rows at all yet), which
-- does not prove the publication gate in list_published_place_photos is load-bearing. Register and
-- approve a real photo on the Candidate Place so the same assertion is proven against a row that
-- would leak if the `place.lifecycle = 'published'` join were ever dropped from the RPC.
insert into storage.objects (bucket_id, name, owner) values
  ('place-photos', '79300000-0000-4000-8000-000000000002/photo-candidate.jpg',
    '79000000-0000-4000-8000-000000000001');

select * from public.register_place_media(
  jsonb_build_object(
    'place_id', '79300000-0000-4000-8000-000000000002', 'kind', 'photo',
    'storage_object_path', '79300000-0000-4000-8000-000000000002/photo-candidate.jpg',
    'mime_type', 'image/jpeg', 'byte_size', 2048, 'width_px', 1600, 'height_px', 1200
  ),
  '79900000-0000-4000-8000-000000000020'
) \gset candidate_photo_

select * from public.approve_place_media(
  jsonb_build_object(
    'media_id', :'candidate_photo_media_id',
    'photographer_or_uploader', 'A. Photographer',
    'source_or_capture_date', '2026-06-01',
    'license_reference', 'Owner-supplied, permission on file',
    'rights_basis', 'explicit_permission',
    'rights_evidence_reference', 'Owner-supplied, permission on file',
    'attribution_text', 'A. Photographer',
    'people_review', 'no_prominent_people',
    'alt_text_is', 'Hundur á kaffihúsi',
    'alt_text_en', 'A dog at a cafe'
  ),
  '79900000-0000-4000-8000-000000000021'
);

reset role;

select is(
  (select approval_state::text from private.place_media where id = :'candidate_photo_media_id'),
  'approved',
  'The Candidate Place photo really is approved, not merely absent - the leak check below is not vacuous'
);

select is(
  (select count(*)::int from public.list_published_place_photos(
    '79300000-0000-4000-8000-000000000002'
  )),
  0,
  'A Candidate Place never leaks an approved photo through the public listing, even one that is genuinely approved'
);

-- Storage RLS: the approved photo object is now publicly readable -------------------------------

set local role anon;
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'place-photos'
      and name = '79300000-0000-4000-8000-000000000001/photo-one.jpg'),
  1,
  'An anonymous Visitor can read the approved photo object through Storage RLS'
);
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'place-photos'
      and name = '79300000-0000-4000-8000-000000000001/photo-two.jpg'),
  0,
  'An anonymous Visitor cannot read the still-pending photo object through Storage RLS'
);
reset role;

-- Reject a pending photo -----------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select results_eq(
  format(
    $$ select approval_state from public.reject_place_media(
      jsonb_build_object('media_id', %L), '79900000-0000-4000-8000-000000000011'
    ) $$,
    :'photo_two_id'
  ),
  $$ values ('rejected'::text) $$,
  'A pending photo can be rejected'
);

select throws_ok(
  format(
    $$ select * from public.reject_place_media(
      jsonb_build_object('media_id', %L), '79900000-0000-4000-8000-000000000012'
    ) $$,
    :'photo_one_id'
  ),
  '55006', 'An approved photo must be retired, not rejected',
  'An approved photo cannot be rejected directly - it must be retired'
);

-- Retirement hides an approved photo immediately -------------------------------------------------

select results_eq(
  format(
    $$ select retired_at is not null from public.retire_place_media(
      jsonb_build_object('media_id', %L), '79900000-0000-4000-8000-000000000013'
    ) $$,
    :'photo_one_id'
  ),
  $$ values (true) $$,
  'Retiring the approved photo succeeds'
);

select is(
  (select count(*)::int from public.list_published_place_photos(
    '79300000-0000-4000-8000-000000000001'
  )),
  0,
  'A retired photo no longer appears in the public listing'
);

reset role;

set local role anon;
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'place-photos'
      and name = '79300000-0000-4000-8000-000000000001/photo-one.jpg'),
  0,
  'A retired photo object is no longer publicly readable through Storage RLS'
);
reset role;

-- Retirement is idempotent -----------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select lives_ok(
  format(
    $$ select * from public.retire_place_media(
      jsonb_build_object('media_id', %L), '79900000-0000-4000-8000-000000000014'
    ) $$,
    :'photo_one_id'
  ),
  'Retiring an already-retired row is a harmless no-op'
);

-- Moderation listing surfaces everything, including retired and rejected ------------------------

select is(
  (select count(*)::int from public.get_moderation_place_media(
    '79300000-0000-4000-8000-000000000001'
  )),
  2,
  'Moderation listing includes both the retired photo and the rejected photo'
);

reset role;

-- Audit trail ---------------------------------------------------------------------------------

select is(
  (select count(*)::int from private.audit_events
    where action = 'place_media.evidence_captured' and subject_type = 'place_media'),
  1,
  'Evidence capture is audited'
);
select is(
  (select count(*)::int from private.audit_events
    where action = 'place_media.photo_uploaded' and subject_type = 'place_media'),
  3,
  'Photo uploads are audited'
);
select is(
  (select count(*)::int from private.audit_events
    where action = 'place_media.photo_approved' and subject_type = 'place_media'),
  2,
  'Photo approval is audited'
);
select is(
  (select count(*)::int from private.audit_events
    where action = 'place_media.photo_rejected' and subject_type = 'place_media'),
  1,
  'Photo rejection is audited'
);
select is(
  (select count(*)::int from private.audit_events
    where action = 'place_media.photo_retired' and subject_type = 'place_media'),
  1,
  'Photo retirement is audited'
);

select * from finish();

rollback;
