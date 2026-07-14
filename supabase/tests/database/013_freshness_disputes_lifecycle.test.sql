begin;

create extension if not exists pgtap with schema extensions;

alter table private.locations alter column geometry_precision set default 'moderator_confirmed_point';
alter table private.locations alter column geometry_source set default 'Reviewed database test fixture';

select no_plan();

insert into auth.users (id) values
  ('75000000-0000-4000-8000-000000000001'),
  ('75000000-0000-4000-8000-000000000002');
insert into security.role_grants (user_id, role) values
  ('75000000-0000-4000-8000-000000000001', 'moderator'),
  ('75000000-0000-4000-8000-000000000002', 'member');

insert into private.operators (id, name) values
  ('75100000-0000-4000-8000-000000000001', 'Lifecycle operator'),
  ('75100000-0000-4000-8000-000000000002', 'Successor operator');
insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude
) values
  ('75200000-0000-4000-8000-000000000001', 'Trust Street 1', 'Reykjavík', '101', 'reykjavik', 64.146, -21.94),
  ('75200000-0000-4000-8000-000000000002', 'Trust Street 2', 'Reykjavík', '101', 'reykjavik', 64.147, -21.941),
  ('75200000-0000-4000-8000-000000000003', 'Trust Street 3', 'Reykjavík', '101', 'reykjavik', 64.148, -21.942),
  ('75200000-0000-4000-8000-000000000004', 'Trust Street 4', 'Reykjavík', '101', 'reykjavik', 64.149, -21.943);

insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, version, published_at, created_by
) values
  ('75300000-0000-4000-8000-000000000001', '75100000-0000-4000-8000-000000000001', '75200000-0000-4000-8000-000000000001', 'dog_access_destination', 'published', 'cafe', 2, '2026-01-01T00:00:00Z', '75000000-0000-4000-8000-000000000001'),
  ('75300000-0000-4000-8000-000000000002', '75100000-0000-4000-8000-000000000001', '75200000-0000-4000-8000-000000000002', 'dog_access_destination', 'published', 'park', 2, '2026-01-01T00:00:00Z', '75000000-0000-4000-8000-000000000001');
insert into private.place_translations (place_id, locale, name, description) values
  ('75300000-0000-4000-8000-000000000001', 'is', 'Traust kaffihús', 'Skilyrt aðgengi.'),
  ('75300000-0000-4000-8000-000000000001', 'en', 'Trust Cafe', 'Conditional access.'),
  ('75300000-0000-4000-8000-000000000002', 'is', 'Traust garður', 'Opinbert útisvæði.'),
  ('75300000-0000-4000-8000-000000000002', 'en', 'Trust Park', 'Official outdoor area.');

insert into private.access_conditions (
  id, place_id, access_area, restraint_condition, permission_requirement, created_by, created_at
) values
  ('75400000-0000-4000-8000-000000000001', '75300000-0000-4000-8000-000000000001', 'indoors', 'carrier_required', 'standing_permission', '75000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z'),
  ('75400000-0000-4000-8000-000000000002', '75300000-0000-4000-8000-000000000001', 'outdoors', 'leash_required', 'ask_on_arrival', '75000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z'),
  ('75400000-0000-4000-8000-000000000003', '75300000-0000-4000-8000-000000000002', 'outdoors', 'off_leash_permitted', 'standing_permission', '75000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z');

insert into private.evidence (
  id, place_id, kind, source_url, source_label, observed_at, recorded_by
) values
  ('75500000-0000-4000-8000-000000000001', '75300000-0000-4000-8000-000000000001', 'official_website', 'https://example.invalid/cafe', 'Original cafe policy', '2026-01-01T00:00:00Z', '75000000-0000-4000-8000-000000000001'),
  ('75500000-0000-4000-8000-000000000002', '75300000-0000-4000-8000-000000000002', 'public_record', 'https://example.invalid/park', 'Official park rule', '2026-01-01T00:00:00Z', '75000000-0000-4000-8000-000000000001');

insert into private.verifications (
  id, access_condition_id, status, verified_by, verified_at, freshness_until
) values
  ('75600000-0000-4000-8000-000000000001', '75400000-0000-4000-8000-000000000001', 'verified', '75000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', '2030-01-01T00:00:00Z'),
  ('75600000-0000-4000-8000-000000000002', '75400000-0000-4000-8000-000000000002', 'verified', '75000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', '2030-01-01T00:00:00Z'),
  ('75600000-0000-4000-8000-000000000003', '75400000-0000-4000-8000-000000000003', 'verified', '75000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', '2030-01-01T00:00:00Z');
insert into private.verification_evidence (verification_id, evidence_id) values
  ('75600000-0000-4000-8000-000000000001', '75500000-0000-4000-8000-000000000001'),
  ('75600000-0000-4000-8000-000000000002', '75500000-0000-4000-8000-000000000001'),
  ('75600000-0000-4000-8000-000000000003', '75500000-0000-4000-8000-000000000002');

select throws_ok(
  $$select * from public.schedule_reconfirmation_due('2026-07-01T00:00:00Z', '75700000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'Anonymous callers cannot run the freshness scheduler'
);

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok(
  $$select * from public.schedule_reconfirmation_due('2026-07-01T00:00:00Z', '75700000-0000-4000-8000-000000000002')$$,
  '42501', null,
  'Members cannot run the freshness scheduler'
);
select throws_ok(
  $$select * from public.reconfirm_access_condition('{}'::jsonb, '75700000-0000-4000-8000-000000000009')$$,
  '42501', null,
  'Members cannot reconfirm an Access Condition'
);
select throws_ok(
  $$select * from public.open_access_dispute('{}'::jsonb, '75700000-0000-4000-8000-000000000010')$$,
  '42501', null,
  'Members cannot open an Access Dispute'
);
select throws_ok(
  $$select * from public.resolve_access_dispute('{}'::jsonb, '75700000-0000-4000-8000-000000000011')$$,
  '42501', null,
  'Members cannot resolve an Access Dispute'
);
select throws_ok(
  $$select * from public.transition_place_identity('{}'::jsonb, '75700000-0000-4000-8000-000000000012')$$,
  '42501', null,
  'Members cannot transition Place identity'
);
reset role;

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select ok(
  (select
    position('order by place_record.id' in function_source.definition) > 0
    and position(
      'order by condition_record.place_id, condition_record.id' in function_source.definition
    ) > 0
    and position(
      'order by condition_record.place_id, condition_record.id, verification_record.id'
      in function_source.definition
    ) > 0
   from (
     select pg_get_functiondef(
       'public.schedule_reconfirmation_due(timestamptz,uuid)'::regprocedure
     ) as definition
   ) function_source),
  'The batch scheduler documents deterministic Place, Condition, and Verification lock ordering'
);

select is(
  (select count(*) from public.schedule_reconfirmation_due('2026-06-30T23:59:59Z', '75700000-0000-4000-8000-000000000003')),
  0::bigint,
  'The controlled clock does not mark information due before its boundary'
);
select is(
  (select count(*) from public.schedule_reconfirmation_due('2026-07-01T00:00:00Z', '75700000-0000-4000-8000-000000000004')),
  2::bigint,
  'Commercial conditions become due after six months'
);
select is(
  (select count(*) from public.schedule_reconfirmation_due('2026-12-31T23:59:59Z', '75700000-0000-4000-8000-000000000005')),
  0::bigint,
  'Official outdoor information is not due before one year'
);
select is(
  (select count(*) from public.schedule_reconfirmation_due('2027-01-01T00:00:00Z', '75700000-0000-4000-8000-000000000006')),
  1::bigint,
  'Official outdoor information becomes due annually'
);
select is(
  (select count(*) from public.schedule_reconfirmation_due('2028-01-01T00:00:00Z', '75700000-0000-4000-8000-000000000007')),
  1::bigint,
  'A delayed scheduler run catches another eligible published Verification'
);
select is(
  (select count(*) from public.schedule_reconfirmation_due('2028-01-01T00:00:00Z', '75700000-0000-4000-8000-000000000008')),
  0::bigint,
  'A repeated delayed scheduler run is idempotent'
);
select is(
  (select access_condition_count from public.list_published_places('en')
    where place_id = '75300000-0000-4000-8000-000000000001'),
  2::bigint,
  'Reconfirmation Due does not remove verified conditions from discovery'
);

-- Continue as the test owner so private history can be asserted directly.
-- The retained JWT claim still exercises Moderator authorization inside every command.
reset role;

create temporary table first_dispute as
select * from public.open_access_dispute(
  jsonb_build_object(
    'access_condition_id', '75400000-0000-4000-8000-000000000001',
    'expected_verification_id', '75600000-0000-4000-8000-000000000001',
    'opened_at', '2026-07-02T00:00:00Z',
    'reason', 'Dogs were refused indoors',
    'evidence', jsonb_build_object(
      'kind', 'direct_observation',
      'source_citation', 'Moderator visit 2026-07-02',
      'source_label', 'Contradicting visit',
      'observed_at', '2026-07-02T00:00:00Z'
    )
  ),
  '75800000-0000-4000-8000-000000000001'
);

select is(
  (select status::text from private.verifications
    where id = (select disputed_verification_id from first_dispute)),
  'disputed',
  'Opening a dispute appends a disputed Verification'
);
select is(
  (select access_condition_count from public.list_published_places('en')
    where place_id = '75300000-0000-4000-8000-000000000001'),
  1::bigint,
  'A disputed condition immediately stops satisfying public discovery'
);
select is(
  (select access_area from public.list_published_places('en')
    where place_id = '75300000-0000-4000-8000-000000000001'),
  'outdoors',
  'Another independently verified condition keeps the Place discoverable'
);
select is(
  (select count(*) from private.access_dispute_evidence
    where dispute_id = (select dispute_id from first_dispute)),
  2::bigint,
  'A dispute preserves supporting and contradicting Evidence'
);
select lives_ok(
  $$select * from public.open_access_dispute(
    jsonb_build_object(
      'access_condition_id', '75400000-0000-4000-8000-000000000001',
      'expected_verification_id', '75600000-0000-4000-8000-000000000001',
      'opened_at', '2026-07-02T00:00:00Z',
      'reason', 'Dogs were refused indoors',
      'evidence', jsonb_build_object(
        'kind', 'direct_observation', 'source_citation', 'Repeat',
        'source_label', 'Repeat', 'observed_at', '2026-07-02T00:00:00Z'
      )
    ),
    '75800000-0000-4000-8000-000000000001'
  )$$,
  'Repeating a dispute request is idempotent'
);
select is(
  (select count(*) from private.evidence
    where place_id = '75300000-0000-4000-8000-000000000001'),
  2::bigint,
  'An idempotent dispute retry does not duplicate Evidence'
);

create temporary table second_dispute as
select * from public.open_access_dispute(
  jsonb_build_object(
    'access_condition_id', '75400000-0000-4000-8000-000000000002',
    'expected_verification_id', '75600000-0000-4000-8000-000000000002',
    'opened_at', '2026-07-03T00:00:00Z',
    'reason', 'Outdoor access was refused',
    'evidence', jsonb_build_object(
      'kind', 'member_report', 'source_url', 'https://example.invalid/report',
      'source_label', 'Contradicting report', 'observed_at', '2026-07-03T00:00:00Z'
    )
  ),
  '75800000-0000-4000-8000-000000000002'
);

select is(
  (select count(*) from public.list_published_places('en')
    where place_id = '75300000-0000-4000-8000-000000000001'),
  0::bigint,
  'A Place with no verified condition leaves normal discovery'
);
select is(
  (select public_status from public.get_public_place_status(
    '75300000-0000-4000-8000-000000000001', 'en')),
  'access_under_review',
  'A safe direct-profile status remains while all access is disputed'
);
select throws_ok(
  $$select * from public.reconfirm_access_condition(
    jsonb_build_object(
      'access_condition_id', '75400000-0000-4000-8000-000000000002',
      'expected_verification_id', '75600000-0000-4000-8000-000000000002',
      'verified_at', '2026-07-04T00:00:00Z', 'freshness_until', '2027-01-04T00:00:00Z',
      'evidence', jsonb_build_object(
        'kind', 'official_website', 'source_url', 'https://example.invalid/new',
        'source_label', 'New policy', 'observed_at', '2026-07-04T00:00:00Z'
      )
    ), '75800000-0000-4000-8000-000000000003'
  )$$,
  '40001', null,
  'Reconfirmation safely rejects a stale expected Verification'
);

select lives_ok(
  format(
    'select * from public.resolve_access_dispute(%L::jsonb, %L::uuid)',
    jsonb_build_object(
      'dispute_id', (select dispute_id from first_dispute),
      'outcome', 'dismissed', 'resolved_at', '2026-07-04T00:00:00Z',
      'freshness_until', '2027-01-04T00:00:00Z',
      'resolution_notes', 'Venue confirmed the published condition',
      'evidence', jsonb_build_object(
        'kind', 'venue_representative', 'source_citation', 'Email confirmation',
        'source_label', 'Resolution confirmation', 'observed_at', '2026-07-04T00:00:00Z'
      )
    )::text,
    '75900000-0000-4000-8000-000000000001'
  ),
  'Dismissing a contradiction restores the original condition atomically'
);
select is(
  (select access_condition_count from public.list_published_places('en')
    where place_id = '75300000-0000-4000-8000-000000000001'),
  1::bigint,
  'A resolved condition returns to public discovery'
);
select is(
  (select count(*) from private.verification_evidence verification_link
    where verification_link.verification_id = (
      select resolution_verification_id from private.access_disputes
      where id = (select dispute_id from first_dispute)
    )),
  2::bigint,
  'Original supporting and resolution Evidence support the restored public Verification'
);
select ok(
  exists (
    select 1
    from public.get_published_place_profile(
      '75300000-0000-4000-8000-000000000001', 'en'
    ) profile,
    jsonb_array_elements(profile.evidence_sources) evidence_source
    where profile.access_condition_id = '75400000-0000-4000-8000-000000000001'
      and evidence_source ->> 'sourceLabel' = 'Original cafe policy'
  )
  and exists (
    select 1
    from public.get_published_place_profile(
      '75300000-0000-4000-8000-000000000001', 'en'
    ) profile,
    jsonb_array_elements(profile.evidence_sources) evidence_source
    where profile.access_condition_id = '75400000-0000-4000-8000-000000000001'
      and evidence_source ->> 'sourceLabel' = 'Resolution confirmation'
  )
  and not exists (
    select 1
    from public.get_published_place_profile(
      '75300000-0000-4000-8000-000000000001', 'en'
    ) profile,
    jsonb_array_elements(profile.evidence_sources) evidence_source
    where profile.access_condition_id = '75400000-0000-4000-8000-000000000001'
      and evidence_source ->> 'sourceLabel' = 'Contradicting visit'
  ),
  'Dismissal restores complete public provenance without exposing contradicting Evidence'
);
select is(
  (select status::text
    from private.freshness_tasks
    where verification_id = '75600000-0000-4000-8000-000000000001'),
  'due',
  'Dispute dismissal does not complete the displaced Verification freshness task'
);
select is(
  (select array_agg(stance::text order by stance::text)
    from private.access_dispute_evidence
    where dispute_id = (select dispute_id from first_dispute)),
  array['contradicting', 'resolution', 'supporting']::text[],
  'Supporting, contradicting, and resolution Evidence remain in the private dispute record'
);
select lives_ok(
  format(
    'select * from public.resolve_access_dispute(%L::jsonb, %L::uuid)',
    jsonb_build_object(
      'dispute_id', (select dispute_id from first_dispute),
      'outcome', 'dismissed', 'resolved_at', '2026-07-04T00:00:00Z',
      'freshness_until', '2027-01-04T00:00:00Z',
      'resolution_notes', 'Venue confirmed the published condition',
      'evidence', jsonb_build_object(
        'kind', 'venue_representative', 'source_citation', 'Email confirmation',
        'source_label', 'Resolution confirmation', 'observed_at', '2026-07-04T00:00:00Z'
      )
    )::text,
    '75900000-0000-4000-8000-000000000001'
  ),
  'Repeating a resolution request returns its original result'
);
select is(
  (select count(*) from private.evidence
    where place_id = '75300000-0000-4000-8000-000000000001'),
  4::bigint,
  'An idempotent resolution retry does not duplicate Evidence'
);

select lives_ok(
  format(
    'select * from public.resolve_access_dispute(%L::jsonb, %L::uuid)',
    jsonb_build_object(
      'dispute_id', (select dispute_id from second_dispute),
      'outcome', 'confirmed', 'resolved_at', '2026-07-05T00:00:00Z',
      'freshness_until', '2027-01-05T00:00:00Z',
      'resolution_notes', 'Outdoor access now requires advance approval',
      'replacement_condition', jsonb_build_object(
        'access_area', 'outdoors', 'restraint_condition', 'leash_required',
        'dog_eligibility', jsonb_build_object('scope', 'all_dogs'),
        'availability_window', '{}'::jsonb,
        'permission_requirement', 'advance_approval'
      ),
      'evidence', jsonb_build_object(
        'kind', 'official_website', 'source_url', 'https://example.invalid/replacement',
        'source_label', 'Replacement policy', 'observed_at', '2026-07-05T00:00:00Z'
      )
    )::text,
    '75900000-0000-4000-8000-000000000002'
  ),
  'Confirming a contradiction replaces and verifies the condition atomically'
);
select ok(
  (select superseded_at is not null from private.access_conditions
    where id = '75400000-0000-4000-8000-000000000002'),
  'The contradicted condition remains as superseded history'
);
select is(
  (select access_condition_count from public.list_published_places('en')
    where place_id = '75300000-0000-4000-8000-000000000001'),
  2::bigint,
  'Atomic replacement restores the complete verified public projection'
);
select is(
  (select count(*) from private.verification_evidence verification_link
    where verification_link.verification_id = (
      select resolution_verification_id from private.access_disputes
      where id = (select dispute_id from second_dispute)
    )),
  1::bigint,
  'Only resolution Evidence supports the verified replacement condition'
);
select ok(
  exists (
    select 1
    from public.get_published_place_profile(
      '75300000-0000-4000-8000-000000000001', 'en'
    ) profile,
    jsonb_array_elements(profile.evidence_sources) evidence_source
    where profile.permission_requirement = 'advance_approval'
      and evidence_source ->> 'sourceLabel' = 'Replacement policy'
  )
  and not exists (
    select 1
    from public.get_published_place_profile(
      '75300000-0000-4000-8000-000000000001', 'en'
    ) profile,
    jsonb_array_elements(profile.evidence_sources) evidence_source
    where profile.permission_requirement = 'advance_approval'
      and evidence_source ->> 'sourceLabel' in ('Original cafe policy', 'Contradicting report')
  ),
  'Confirmed replacement exposes only Evidence that supports the replacement facts'
);
select is(
  (select status::text
    from private.freshness_tasks
    where verification_id = '75600000-0000-4000-8000-000000000002'),
  'due',
  'Confirmed replacement does not complete the displaced Verification freshness task'
);
select is(
  (select array_agg(stance::text order by stance::text)
    from private.access_dispute_evidence
    where dispute_id = (select dispute_id from second_dispute)),
  array['contradicting', 'resolution', 'supporting']::text[],
  'The confirmed dispute also preserves every private Evidence stance'
);
select is(
  (select count(*) from private.verifications verification_record
    join private.access_conditions condition_record
      on condition_record.id = verification_record.access_condition_id
    where condition_record.place_id = '75300000-0000-4000-8000-000000000001'),
  6::bigint,
  'Every displaced, disputed, and resolved Verification remains in history'
);

select lives_ok(
  $$select * from public.reconfirm_access_condition(
    jsonb_build_object(
      'access_condition_id', '75400000-0000-4000-8000-000000000003',
      'expected_verification_id', '75600000-0000-4000-8000-000000000003',
      'verified_at', '2027-01-02T00:00:00Z', 'freshness_until', '2028-01-02T00:00:00Z',
      'evidence', jsonb_build_object(
        'kind', 'public_record', 'source_citation', 'Annual rule 2027',
        'source_label', 'Annual reconfirmation', 'observed_at', '2027-01-02T00:00:00Z'
      )
    ), '75900000-0000-4000-8000-000000000003'
  )$$,
  'A Moderator can reconfirm unchanged information with new Evidence'
);
select is(
  (select status::text from private.freshness_tasks
    where verification_id = '75600000-0000-4000-8000-000000000003'),
  'completed',
  'Reconfirmation completes the due task without deleting it'
);
select is(
  (select count(*) from private.verification_evidence
    where verification_id = (
      select id from private.verifications
      where access_condition_id = '75400000-0000-4000-8000-000000000003'
        and superseded_at is null
    )),
  2::bigint,
  'Reconfirmation preserves prior Evidence when the source later becomes unavailable'
);
select lives_ok(
  $$select * from public.reconfirm_access_condition(
    jsonb_build_object(
      'access_condition_id', '75400000-0000-4000-8000-000000000003',
      'expected_verification_id', '75600000-0000-4000-8000-000000000003',
      'verified_at', '2027-01-02T00:00:00Z', 'freshness_until', '2028-01-02T00:00:00Z',
      'evidence', jsonb_build_object(
        'kind', 'public_record', 'source_citation', 'Annual rule 2027',
        'source_label', 'Annual reconfirmation', 'observed_at', '2027-01-02T00:00:00Z'
      )
    ), '75900000-0000-4000-8000-000000000003'
  )$$,
  'Repeating a reconfirmation request returns its original result'
);
select is(
  (select count(*) from private.evidence
    where place_id = '75300000-0000-4000-8000-000000000002'),
  2::bigint,
  'An idempotent reconfirmation retry does not duplicate Evidence'
);

reset role;

-- Identity transitions use distinct fixture Places so each invariant is isolated.
insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, version, published_at, created_by
) values
  ('75300000-0000-4000-8000-000000000010', '75100000-0000-4000-8000-000000000001', '75200000-0000-4000-8000-000000000001', 'move_case', 'published', 'shop', 1, '2026-01-01', '75000000-0000-4000-8000-000000000001'),
  ('75300000-0000-4000-8000-000000000011', '75100000-0000-4000-8000-000000000001', '75200000-0000-4000-8000-000000000002', 'move_case', 'candidate', 'shop', 1, null, '75000000-0000-4000-8000-000000000001'),
  ('75300000-0000-4000-8000-000000000012', '75100000-0000-4000-8000-000000000001', '75200000-0000-4000-8000-000000000001', 'operator_case', 'published', 'shop', 1, '2026-01-01', '75000000-0000-4000-8000-000000000001'),
  ('75300000-0000-4000-8000-000000000013', '75100000-0000-4000-8000-000000000002', '75200000-0000-4000-8000-000000000001', 'operator_case', 'candidate', 'shop', 1, null, '75000000-0000-4000-8000-000000000001'),
  ('75300000-0000-4000-8000-000000000014', '75100000-0000-4000-8000-000000000001', '75200000-0000-4000-8000-000000000001', 'old_purpose', 'published', 'shop', 1, '2026-01-01', '75000000-0000-4000-8000-000000000001'),
  ('75300000-0000-4000-8000-000000000015', '75100000-0000-4000-8000-000000000001', '75200000-0000-4000-8000-000000000001', 'new_purpose', 'candidate', 'culture', 1, null, '75000000-0000-4000-8000-000000000001'),
  ('75300000-0000-4000-8000-000000000016', '75100000-0000-4000-8000-000000000001', '75200000-0000-4000-8000-000000000003', 'move_case', 'published', 'shop', 1, '2026-01-01', '75000000-0000-4000-8000-000000000001'),
  ('75300000-0000-4000-8000-000000000017', '75100000-0000-4000-8000-000000000001', '75200000-0000-4000-8000-000000000004', 'move_case', 'published', 'shop', 1, '2026-01-01', '75000000-0000-4000-8000-000000000001'),
  ('75300000-0000-4000-8000-000000000018', '75100000-0000-4000-8000-000000000001', '75200000-0000-4000-8000-000000000004', 'move_case', 'inactive', 'shop', 1, null, '75000000-0000-4000-8000-000000000001'),
  ('75300000-0000-4000-8000-000000000019', '75100000-0000-4000-8000-000000000002', '75200000-0000-4000-8000-000000000003', 'dog_access_destination', 'candidate', 'park', 1, null, '75000000-0000-4000-8000-000000000001');
insert into private.place_translations (place_id, locale, name, description)
select place_record.id, locale_value.locale::private.locale_code,
  'Identity ' || right(place_record.id::text, 2) || ' ' || locale_value.locale,
  'Identity transition fixture'
from private.places place_record
cross join (values ('is'), ('en')) locale_value(locale)
where place_record.id between '75300000-0000-4000-8000-000000000010' and '75300000-0000-4000-8000-000000000019';

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select * from public.transition_place_identity(
    jsonb_build_object(
      'place_id', '75300000-0000-4000-8000-000000000001', 'expected_version', 2,
      'kind', 'rebrand', 'decided_at', '2026-07-06T00:00:00Z',
      'decision_notes', 'Same Operator, Location, and purpose',
      'names', jsonb_build_object('is', 'Nýtt traust kaffihús', 'en', 'Renamed Trust Cafe')
    ), '76000000-0000-4000-8000-000000000001'
  )$$,
  'A name-only rebrand retains the Place'
);
select is(
  (select name from private.place_translations
    where place_id = '75300000-0000-4000-8000-000000000001' and locale = 'en'),
  'Renamed Trust Cafe',
  'Rebrand changes the public name on the same identity'
);
select is(
  (select previous_identity -> 'names' ->> 'en' from private.place_identity_transitions
    where request_id = '76000000-0000-4000-8000-000000000001'),
  'Trust Cafe',
  'Rebrand history retains the predecessor name'
);
select lives_ok(
  $$select * from public.transition_place_identity(
    jsonb_build_object(
      'place_id', '75300000-0000-4000-8000-000000000001', 'expected_version', 2,
      'kind', 'rebrand', 'decided_at', '2026-07-06T00:00:00Z',
      'decision_notes', 'Same Operator, Location, and purpose',
      'names', jsonb_build_object('is', 'Nýtt traust kaffihús', 'en', 'Renamed Trust Cafe')
    ), '76000000-0000-4000-8000-000000000001'
  )$$,
  'Repeating an identity command returns the original transition'
);
select is(
  (select version from private.places
    where id = '75300000-0000-4000-8000-000000000001'),
  3::bigint,
  'An idempotent identity retry does not increment the Place version again'
);

select lives_ok(
  $$select * from public.transition_place_identity(
    jsonb_build_object(
      'place_id', '75300000-0000-4000-8000-000000000010', 'expected_version', 1,
      'successor_place_id', '75300000-0000-4000-8000-000000000011',
      'kind', 'move', 'decided_at', '2026-07-07T00:00:00Z',
      'decision_notes', 'Same operation moved to a new address'
    ), '76000000-0000-4000-8000-000000000002'
  )$$,
  'A move links a distinct Place at a new Location'
);
select is(
  (select lifecycle::text from private.places
    where id = '75300000-0000-4000-8000-000000000010'),
  'inactive',
  'A moved predecessor becomes inactive without deletion'
);

select throws_ok(
  $$select * from public.transition_place_identity(
    jsonb_build_object(
      'place_id', '75300000-0000-4000-8000-000000000016', 'expected_version', 1,
      'successor_place_id', '75300000-0000-4000-8000-000000000017',
      'kind', 'move', 'decided_at', '2026-07-07T01:00:00Z',
      'decision_notes', 'Published Places are not eligible successors'
    ), '76000000-0000-4000-8000-000000000007'
  )$$,
  '22023', null,
  'An identity transition rejects a published successor'
);
select throws_ok(
  $$select * from public.transition_place_identity(
    jsonb_build_object(
      'place_id', '75300000-0000-4000-8000-000000000016', 'expected_version', 1,
      'successor_place_id', '75300000-0000-4000-8000-000000000018',
      'kind', 'move', 'decided_at', '2026-07-07T02:00:00Z',
      'decision_notes', 'Inactive Places are not eligible successors'
    ), '76000000-0000-4000-8000-000000000008'
  )$$,
  '22023', null,
  'An identity transition rejects an inactive successor'
);
select throws_ok(
  $$select * from public.transition_place_identity(
    jsonb_build_object(
      'place_id', '75300000-0000-4000-8000-000000000016', 'expected_version', 1,
      'successor_place_id', '75300000-0000-4000-8000-000000000011',
      'kind', 'move', 'decided_at', '2026-07-07T03:00:00Z',
      'decision_notes', 'A successor cannot be reused by another predecessor'
    ), '76000000-0000-4000-8000-000000000009'
  )$$,
  '40001', null,
  'A successor can belong to at most one predecessor transition'
);

select lives_ok(
  $$select * from public.transition_place_identity(
    jsonb_build_object(
      'place_id', '75300000-0000-4000-8000-000000000012', 'expected_version', 1,
      'successor_place_id', '75300000-0000-4000-8000-000000000013',
      'kind', 'new_operator', 'decided_at', '2026-07-08T00:00:00Z',
      'decision_notes', 'The operator changed at the same Location'
    ), '76000000-0000-4000-8000-000000000003'
  )$$,
  'A new Operator at the same Location creates a successor Place'
);

select lives_ok(
  $$select * from public.transition_place_identity(
    jsonb_build_object(
      'place_id', '75300000-0000-4000-8000-000000000014', 'expected_version', 1,
      'successor_place_id', '75300000-0000-4000-8000-000000000015',
      'kind', 'material_purpose_change', 'decided_at', '2026-07-09T00:00:00Z',
      'decision_notes', 'The destination purpose materially changed'
    ), '76000000-0000-4000-8000-000000000004'
  )$$,
  'A material purpose change creates a successor Place at the same Location'
);

select throws_ok(
  $$select * from public.transition_place_identity(
    jsonb_build_object(
      'place_id', '75300000-0000-4000-8000-000000000002', 'expected_version', 2,
      'successor_place_id', '75300000-0000-4000-8000-000000000019',
      'kind', 'move', 'decided_at', '2026-07-10T00:00:00Z',
      'decision_notes', 'Invalid same-location move'
    ), '76000000-0000-4000-8000-000000000005'
  )$$,
  '22023', null,
  'A move cannot reuse the old Location or silently change Operator'
);

create temporary table inactive_resolution_dispute as
with target as (
  select condition_record.id as condition_id, verification_record.id as verification_id
  from private.access_conditions condition_record
  join private.verifications verification_record
    on verification_record.access_condition_id = condition_record.id
    and verification_record.status = 'verified'
    and verification_record.superseded_at is null
  where condition_record.place_id = '75300000-0000-4000-8000-000000000001'
    and condition_record.superseded_at is null
  order by condition_record.id
  limit 1
)
select dispute_result.*, target.condition_id
from target
cross join lateral public.open_access_dispute(
  jsonb_build_object(
    'access_condition_id', target.condition_id,
    'expected_verification_id', target.verification_id,
    'opened_at', '2026-07-10T01:00:00Z',
    'reason', 'Open dispute before inactivity',
    'evidence', jsonb_build_object(
      'kind', 'direct_observation',
      'source_citation', 'Pre-inactivity visit',
      'source_label', 'Pre-inactivity contradiction',
      'observed_at', '2026-07-10T01:00:00Z'
    )
  ),
  '76000000-0000-4000-8000-000000000010'
) dispute_result;

create temporary table inactive_verified_target as
select condition_record.id as condition_id, verification_record.id as verification_id
from private.access_conditions condition_record
join private.verifications verification_record
  on verification_record.access_condition_id = condition_record.id
  and verification_record.status = 'verified'
  and verification_record.superseded_at is null
where condition_record.place_id = '75300000-0000-4000-8000-000000000001'
  and condition_record.superseded_at is null
order by condition_record.id
limit 1;

update private.verifications verification_record
set freshness_until = '2026-07-10T02:00:00Z'
where verification_record.id = (select verification_id from inactive_verified_target);

select lives_ok(
  $$select * from public.transition_place_identity(
    jsonb_build_object(
      'place_id', '75300000-0000-4000-8000-000000000001', 'expected_version', 3,
      'kind', 'inactive', 'decided_at', '2026-07-11T00:00:00Z',
      'decision_notes', 'The venue closed'
    ), '76000000-0000-4000-8000-000000000006'
  )$$,
  'A Moderator can mark a Place inactive'
);
select lives_ok(
  $$select * from public.schedule_reconfirmation_due(
    '2030-01-01T00:00:00Z', '76000000-0000-4000-8000-000000000011'
  )$$,
  'The batch scheduler safely skips inactive Places'
);
select is(
  (select count(*)
    from private.freshness_tasks
    where verification_id = (select verification_id from inactive_verified_target)),
  0::bigint,
  'An inactive Place cannot gain a Reconfirmation Due task'
);
select throws_ok(
  format(
    'select * from public.reconfirm_access_condition(%L::jsonb, %L::uuid)',
    jsonb_build_object(
      'access_condition_id', (select condition_id from inactive_verified_target),
      'expected_verification_id', (select verification_id from inactive_verified_target),
      'verified_at', '2030-01-02T00:00:00Z',
      'freshness_until', '2030-07-02T00:00:00Z',
      'evidence', jsonb_build_object(
        'kind', 'official_website', 'source_url', 'https://example.invalid/inactive-reconfirm',
        'source_label', 'Inactive reconfirmation', 'observed_at', '2030-01-02T00:00:00Z'
      )
    )::text,
    '76000000-0000-4000-8000-000000000012'
  ),
  '40001', null,
  'Reconfirmation rejects an inactive owning Place'
);
select throws_ok(
  format(
    'select * from public.open_access_dispute(%L::jsonb, %L::uuid)',
    jsonb_build_object(
      'access_condition_id', (select condition_id from inactive_verified_target),
      'expected_verification_id', (select verification_id from inactive_verified_target),
      'opened_at', '2030-01-02T00:00:00Z',
      'reason', 'Attempted inactive dispute',
      'evidence', jsonb_build_object(
        'kind', 'direct_observation', 'source_citation', 'Inactive visit',
        'source_label', 'Inactive contradiction', 'observed_at', '2030-01-02T00:00:00Z'
      )
    )::text,
    '76000000-0000-4000-8000-000000000013'
  ),
  '40001', null,
  'Dispute opening rejects an inactive owning Place'
);
select throws_ok(
  format(
    'select * from public.resolve_access_dispute(%L::jsonb, %L::uuid)',
    jsonb_build_object(
      'dispute_id', (select dispute_id from inactive_resolution_dispute),
      'outcome', 'dismissed',
      'resolved_at', '2030-01-02T00:00:00Z',
      'freshness_until', '2030-07-02T00:00:00Z',
      'resolution_notes', 'Attempted resolution after inactivity',
      'evidence', jsonb_build_object(
        'kind', 'venue_representative', 'source_citation', 'Inactive response',
        'source_label', 'Inactive resolution', 'observed_at', '2030-01-02T00:00:00Z'
      )
    )::text,
    '76000000-0000-4000-8000-000000000014'
  ),
  '40001', null,
  'Dispute resolution fails closed after Place inactivity'
);
select is(
  (select public_status from public.get_public_place_status(
    '75300000-0000-4000-8000-000000000001', 'en')),
  'inactive',
  'Inactive history has a safe direct-profile status'
);
select is(
  (select count(*) from private.evidence
    where place_id = '75300000-0000-4000-8000-000000000001'),
  6::bigint,
  'Inactivity preserves every historical Evidence record'
);
select is(
  (select count(*) from private.place_identity_transitions),
  5::bigint,
  'Every accepted identity decision has an immutable transition record'
);

reset role;

select * from finish();

rollback;
