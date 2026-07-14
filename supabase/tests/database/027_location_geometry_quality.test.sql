begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_type(
  'private', 'location_geometry_precision',
  'Location geometry uses a closed precision vocabulary'
);
select has_column(
  'private', 'locations', 'geometry_precision',
  'Locations retain first-class geometry precision'
);
select has_column(
  'private', 'locations', 'geometry_source',
  'Locations retain geometry provenance'
);
select ok(
  not exists (
    select 1 from private.locations
    where geometry_precision is null or nullif(btrim(geometry_source), '') is null
  ),
  'The migration leaves every existing Location with complete geometry quality metadata'
);
select has_function(
  'public', 'update_candidate_place_location', array['jsonb', 'uuid'],
  'Moderators have one audited Candidate location-correction command'
);
select has_function(
  'public', 'quarantine_place_pending_geometry', array['jsonb', 'uuid'],
  'Moderators have one audited pending-geometry quarantine command'
);
select ok(
  not has_function_privilege(
    'anon', 'public.update_candidate_place_location(jsonb,uuid)', 'execute'
  ),
  'Anonymous callers cannot correct Candidate geometry'
);
select ok(
  not has_function_privilege(
    'service_role', 'public.quarantine_place_pending_geometry(jsonb,uuid)', 'execute'
  ),
  'The service role cannot bypass audited quarantine'
);

insert into auth.users (id, email)
values ('b7000000-0000-4000-8000-000000000001', 'geometry-moderator@example.invalid');
insert into private.member_accounts (user_id)
values ('b7000000-0000-4000-8000-000000000001');
insert into security.role_grants (user_id, role)
values
  ('b7000000-0000-4000-8000-000000000001', 'member'),
  ('b7000000-0000-4000-8000-000000000001', 'moderator');

insert into private.member_favourites (user_id, place_id)
values (
  'b7000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003'
);
insert into private.check_ins (id, member_id, place_id, proximity_confirmed, request_id)
values (
  'b7600000-0000-4000-8000-000000000001',
  'b7000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003', 'unknown',
  'b7900000-0000-4000-8000-000000000010'
);
insert into private.place_media (
  id, place_id, kind, storage_bucket, storage_object_path, mime_type, byte_size,
  width_px, height_px, source_url, photographer_or_uploader, source_or_capture_date,
  license_reference, alt_text_is, alt_text_en, approval_state, approved_by, approved_at,
  uploaded_by, request_id, rights_basis, rights_evidence_reference, license_url,
  attribution_text, people_review, content_sha256
) values (
  'b7700000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003', 'photo', 'place-photos',
  'geometry-quality/published.jpg', 'image/jpeg', 4096, 1600, 1000,
  'https://example.invalid/published-photo', 'Geometry Photographer', '2026-07-01',
  'CC BY 4.0', 'Staðfest mynd', 'Verified photo', 'approved',
  'b7000000-0000-4000-8000-000000000001', statement_timestamp(),
  'b7000000-0000-4000-8000-000000000001',
  'b7900000-0000-4000-8000-000000000011', 'cc_by',
  'Geometry test rights evidence', 'https://creativecommons.org/licenses/by/4.0/',
  'Geometry Photographer, CC BY 4.0', 'no_prominent_people', repeat('b', 64)
);
insert into storage.objects (bucket_id, name, owner)
values (
  'place-photos', 'geometry-quality/published.jpg',
  'b7000000-0000-4000-8000-000000000001'
);

select is(
  (
    select count(*) from public.list_published_places('en')
    where place_id = '30000000-0000-4000-8000-000000000003'
  ),
  1::bigint,
  'The verified fixture is discoverable before an audited geometry quarantine'
);
set local role anon;
select is(
  (
    select count(*)::integer from storage.objects
    where bucket_id = 'place-photos'
      and name = 'geometry-quality/published.jpg'
  ),
  1,
  'Storage RLS exposes an approved photo only while its Place is discoverable'
);
reset role;

select set_config('request.jwt.claim.sub', 'b7000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select results_eq(
  $$
    select lifecycle, version
    from public.quarantine_place_pending_geometry(
      jsonb_build_object(
        'place_id', '30000000-0000-4000-8000-000000000003',
        'expected_version', 1,
        'reason', 'Municipality anchor found by launch inventory audit'
      ),
      'b7900000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values ('candidate'::text, 2::bigint) $$,
  'An authenticated Moderator can quarantine newly discovered ambiguous Published geometry'
);

select throws_ok(
  $$
    select * from public.set_current_favourite(
      '30000000-0000-4000-8000-000000000003', true
    )
  $$,
  '22023',
  'Discoverable Place required',
  'Pending geometry cannot be newly favourited'
);
select throws_ok(
  $$
    select * from public.record_check_in(
      '30000000-0000-4000-8000-000000000003', 'unknown',
      'b7900000-0000-4000-8000-000000000012'
    )
  $$,
  '22023',
  'Publishable Place geometry required',
  'Pending geometry cannot receive a new Check-in'
);
select results_eq(
  $$
    select availability, latitude, longitude
    from public.list_personal_places('en')
    where place_id = '30000000-0000-4000-8000-000000000003'
  $$,
  $$ values ('unavailable'::text, null::double precision, null::double precision) $$,
  'Personal Place history withholds pending coordinates'
);
select results_eq(
  $$
    select availability, latitude, longitude
    from public.list_personal_check_ins('en')
    where place_id = '30000000-0000-4000-8000-000000000003'
  $$,
  $$ values ('unavailable'::text, null::double precision, null::double precision) $$,
  'Personal Check-in history withholds pending coordinates'
);

reset role;

select is(
  (
    select count(*) from public.list_published_places('en')
    where place_id = '30000000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'Public discovery hides quarantined pending geometry immediately'
);
select is(
  (
    select count(*) from public.get_published_place_profile(
      '30000000-0000-4000-8000-000000000003', 'en'
    )
  ),
  0::bigint,
  'The public Place profile hides quarantined pending geometry immediately'
);
select is(
  (
    select count(*) from public.list_published_place_photos(
      '30000000-0000-4000-8000-000000000003'
    )
  ),
  0::bigint,
  'Public photography withholds media for pending geometry'
);
set local role anon;
select is(
  (
    select count(*)::integer from storage.objects
    where bucket_id = 'place-photos'
      and name = 'geometry-quality/published.jpg'
  ),
  0,
  'Storage RLS revokes anonymous photo access immediately after geometry quarantine'
);
reset role;
select is(
  (
    select count(*) from private.verifications as verification
    join private.access_conditions as access_condition
      on access_condition.id = verification.access_condition_id
    where access_condition.place_id = '30000000-0000-4000-8000-000000000003'
      and verification.superseded_at is null
  ),
  0::bigint,
  'Quarantine supersedes every current Verification in the same transaction'
);

select is(
  (
    select count(*) from private.audit_events
    where action = 'place.geometry_quarantined'
      and subject_id = '30000000-0000-4000-8000-000000000003'
      and request_id = 'b7900000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'Quarantine appends an immutable audit event'
);
select is(
  (
    select change_summary -> 'superseded_verification_ids' ->> 0
    from private.audit_events
    where action = 'place.geometry_quarantined'
      and request_id = 'b7900000-0000-4000-8000-000000000001'
  ),
  '60000000-0000-4000-8000-000000000003',
  'Quarantine records the superseded Verification identity'
);

set local role authenticated;

select results_eq(
  $$
    select geometry_precision, version
    from public.update_candidate_place_location(
      jsonb_build_object(
        'place_id', '30000000-0000-4000-8000-000000000003',
        'expected_version', 2,
        'address_line', 'Staðfest gata 3',
        'locality', 'Reykjavík',
        'postal_code', '107',
        'municipality', 'reykjavik',
        'latitude', 64.14231,
        'longitude', -21.95551,
        'geometry_precision', 'official_address_point',
        'geometry_source', 'HMS Staðfangaskrá correction 30000003'
      ),
      'b7900000-0000-4000-8000-000000000013'
    )
  $$,
  $$ values ('official_address_point'::text, 3::bigint) $$,
  'A quarantined Place can receive sourced replacement geometry'
);
select results_eq(
  $$
    select version
    from public.verify_and_publish_place(
      jsonb_build_object(
        'place_id', '30000000-0000-4000-8000-000000000003',
        'expected_version', 3,
        'condition_verifications', jsonb_build_array(
          jsonb_build_object(
            'access_condition_id', '40000000-0000-4000-8000-000000000003',
            'evidence_ids', jsonb_build_array('50000000-0000-4000-8000-000000000003')
          )
        ),
        'freshness_until', '2099-01-01T00:00:00Z'
      ),
      'b7900000-0000-4000-8000-000000000014'
    )
  $$,
  $$ values (4::bigint) $$,
  'Correction followed by publication creates a new Verification generation'
);

reset role;

select is(
  (
    select count(*) from private.verifications as verification
    join private.access_conditions as access_condition
      on access_condition.id = verification.access_condition_id
    where access_condition.place_id = '30000000-0000-4000-8000-000000000003'
      and verification.superseded_at is null
  ),
  1::bigint,
  'Re-publication leaves exactly one current Verification'
);
select is(
  (
    select count(*) from public.list_published_place_photos(
      '30000000-0000-4000-8000-000000000003'
    )
  ),
  1::bigint,
  'Corrected and re-published geometry restores public photography'
);
set local role anon;
select is(
  (
    select count(*)::integer from storage.objects
    where bucket_id = 'place-photos'
      and name = 'geometry-quality/published.jpg'
  ),
  1,
  'Storage RLS restores photo access only after correction and re-publication'
);
reset role;

update private.locations
set geometry_precision = 'municipality_anchor_pending_geocode',
  geometry_source = 'Legacy placeholder awaiting Moderator correction'
where id = '20000000-0000-4000-8000-000000000001';

insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, version, created_by
) values (
  'b7300000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'inactive_shared_location_fixture', 'inactive', 'restaurant', 1,
  'b7000000-0000-4000-8000-000000000001'
);

set local role authenticated;

select results_eq(
  $$
    select geometry_precision, version
    from public.update_candidate_place_location(
      jsonb_build_object(
        'place_id', '30000000-0000-4000-8000-000000000001',
        'expected_version', 1,
        'address_line', 'Aðalstræti 16',
        'locality', 'Reykjavík',
        'postal_code', '101',
        'municipality', 'reykjavik',
        'latitude', 64.1475091,
        'longitude', -21.9420614,
        'geometry_precision', 'official_address_point',
        'geometry_source', 'HMS Staðfangaskrá coordinate 10000001'
      ),
      'b7900000-0000-4000-8000-000000000002'
    )
  $$,
  $$ values ('official_address_point'::text, 2::bigint) $$,
  'A Moderator can replace placeholder geometry with sourced official geometry'
);

select results_eq(
  $$
    select latitude, longitude, geometry_precision, geometry_source
    from public.get_moderation_place_review('30000000-0000-4000-8000-000000000001')
  $$,
  $$ values (
    64.1475091::double precision,
    -21.9420614::double precision,
    'official_address_point'::text,
    'HMS Staðfangaskrá coordinate 10000001'::text
  ) $$,
  'Moderation review exposes coordinates, precision, and provenance'
);

reset role;

select is(
  (
    select count(*) from private.audit_events
    where action = 'place.location_corrected'
      and subject_id = '30000000-0000-4000-8000-000000000001'
      and request_id = 'b7900000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'Location correction appends an immutable audit event'
);
select isnt(
  (
    select location_id from private.places
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  (
    select location_id from private.places
    where id = 'b7300000-0000-4000-8000-000000000099'
  ),
  'Copy-on-write preserves an inactive Place that shares the historical Location'
);
select results_eq(
  $$
    select
      change_summary #>> '{previous_location,address_line}',
      change_summary #>> '{previous_location,geometry_source}',
      change_summary #>> '{location,address_line}',
      change_summary #>> '{location,geometry_source}'
    from private.audit_events
    where action = 'place.location_corrected'
      and request_id = 'b7900000-0000-4000-8000-000000000002'
  $$,
  $$ values (
    'Candidategata 1'::text,
    'Legacy placeholder awaiting Moderator correction'::text,
    'Aðalstræti 16'::text,
    'HMS Staðfangaskrá coordinate 10000001'::text
  ) $$,
  'Location correction audit preserves exact before and after snapshots'
);

insert into private.operators (id, name)
values ('b7100000-0000-4000-8000-000000000001', 'Pending geometry fixture');
insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude
) values (
  'b7200000-0000-4000-8000-000000000002', 'Legacy 2', 'Reykjavík', '101',
  'reykjavik', 64.1466, -21.9426
);
select results_eq(
  $$
    select geometry_precision::text, geometry_source
    from private.locations
    where id = 'b7200000-0000-4000-8000-000000000002'
  $$,
  $$ values (
    'municipality_anchor_pending_geocode'::text,
    'Geometry pending Moderator review'::text
  ) $$,
  'Direct and legacy-style Location writes default to non-publishable geometry'
);
insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, version,
  published_at, created_by
) values (
  'b7300000-0000-4000-8000-000000000002',
  'b7100000-0000-4000-8000-000000000001',
  'b7200000-0000-4000-8000-000000000002',
  'legacy_unproven_geometry', 'published', 'park', 1,
  statement_timestamp(), 'b7000000-0000-4000-8000-000000000001'
);
insert into private.place_translations (place_id, locale, name, description)
values
  ('b7300000-0000-4000-8000-000000000002', 'is', 'Arfstaður', 'Ósönnuð staðsetning.'),
  ('b7300000-0000-4000-8000-000000000002', 'en', 'Legacy Place', 'Unproven geometry.');
insert into private.access_conditions (
  id, place_id, revision, access_area, restraint_condition, dog_eligibility,
  availability_window, permission_requirement, created_by
) values (
  'b7400000-0000-4000-8000-000000000002',
  'b7300000-0000-4000-8000-000000000002', 1, 'outdoors', 'leash_required',
  '{"scope":"all_dogs"}', '{}', 'standing_permission',
  'b7000000-0000-4000-8000-000000000001'
);
insert into private.evidence (
  id, place_id, kind, source_url, source_label, observed_at, recorded_by
) values (
  'b7500000-0000-4000-8000-000000000002',
  'b7300000-0000-4000-8000-000000000002', 'public_record',
  'https://example.invalid/legacy', 'Legacy source', statement_timestamp(),
  'b7000000-0000-4000-8000-000000000001'
);
insert into private.verifications (
  id, access_condition_id, status, verified_at, freshness_until, verified_by
) values (
  'b7600000-0000-4000-8000-000000000002',
  'b7400000-0000-4000-8000-000000000002', 'verified', statement_timestamp(),
  '2099-01-01T00:00:00Z',
  'b7000000-0000-4000-8000-000000000001'
);
insert into private.verification_evidence (verification_id, evidence_id)
values (
  'b7600000-0000-4000-8000-000000000002',
  'b7500000-0000-4000-8000-000000000002'
);
select is(
  (
    select count(*) from public.list_published_places('en')
    where place_id = 'b7300000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'A verified Published legacy row stays hidden until its geometry is proven'
);
insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude,
  geometry_precision, geometry_source
) values (
  'b7200000-0000-4000-8000-000000000001', 'Placeholder 1', 'Reykjavík', '101',
  'reykjavik', 64.1466, -21.9426, 'municipality_anchor_pending_geocode',
  'Test municipality anchor'
);
insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, version, created_by
) values (
  'b7300000-0000-4000-8000-000000000001',
  'b7100000-0000-4000-8000-000000000001',
  'b7200000-0000-4000-8000-000000000001',
  'pending_geometry_contract', 'candidate', 'park', 1,
  'b7000000-0000-4000-8000-000000000001'
);
insert into private.place_translations (place_id, locale, name, description)
values
  ('b7300000-0000-4000-8000-000000000001', 'is', 'Biðstaður', 'Óleyst staðsetning.'),
  ('b7300000-0000-4000-8000-000000000001', 'en', 'Pending Place', 'Unresolved location.');
insert into private.access_conditions (
  id, place_id, revision, access_area, restraint_condition, dog_eligibility,
  availability_window, permission_requirement, created_by
) values (
  'b7400000-0000-4000-8000-000000000001',
  'b7300000-0000-4000-8000-000000000001', 1, 'outdoors', 'leash_required',
  '{"scope":"all_dogs"}', '{}', 'standing_permission',
  'b7000000-0000-4000-8000-000000000001'
);
insert into private.evidence (
  id, place_id, kind, source_url, source_label, observed_at, recorded_by
) values (
  'b7500000-0000-4000-8000-000000000001',
  'b7300000-0000-4000-8000-000000000001', 'public_record',
  'https://example.invalid/pending', 'Pending fixture source', '2026-07-13T00:00:00Z',
  'b7000000-0000-4000-8000-000000000001'
);

set local role authenticated;

select throws_ok(
  $$
    select * from public.verify_and_publish_place(
      jsonb_build_object(
        'place_id', 'b7300000-0000-4000-8000-000000000001',
        'expected_version', 1,
        'condition_verifications', jsonb_build_array(
          jsonb_build_object(
            'access_condition_id', 'b7400000-0000-4000-8000-000000000001',
            'evidence_ids', jsonb_build_array('b7500000-0000-4000-8000-000000000001')
          )
        ),
        'freshness_until', '2099-01-01T00:00:00Z'
      ),
      'b7900000-0000-4000-8000-000000000003'
    )
  $$,
  '22023',
  'Location geometry is pending',
  'Publication fails closed before creating Verifications for pending geometry'
);

reset role;

select is(
  (
    select count(*) from private.verifications
    where access_condition_id = 'b7400000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'Rejected pending-geometry publication leaves no partial Verification'
);

select * from finish();

rollback;
