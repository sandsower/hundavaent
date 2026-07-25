begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

-- Fixtures --------------------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('98000000-0000-4000-8000-000000000001', 'hatch-member@example.invalid'),
  ('98000000-0000-4000-8000-000000000002', 'hatch-other-member@example.invalid'),
  ('98000000-0000-4000-8000-000000000003', 'hatch-moderator@example.invalid');
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
  ('98100000-0000-4000-8000-000000000001', 'Hatch operator');
insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude,
  geometry_precision, geometry_source
) values
  (
    '98200000-0000-4000-8000-000000000001', 'Lykilgata 1', 'Reykjavík', '101', 'reykjavik',
    64.15, -21.95, 'moderator_confirmed_point', 'Reviewed database test fixture'
  ),
  (
    '98200000-0000-4000-8000-000000000002', 'Lykilgata 2', 'Reykjavík', '101', 'reykjavik',
    64.16, -21.96, 'moderator_confirmed_point', 'Reviewed database test fixture'
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
  ('98300000-0000-4000-8000-000000000001', 'is', 'Lykilkaffi', 'Upprunaleg lýsing.'),
  ('98300000-0000-4000-8000-000000000001', 'en', 'Key Cafe', 'Original description.'),
  ('98300000-0000-4000-8000-000000000002', 'is', 'Lykilgarður', 'Upprunaleg lýsing.'),
  ('98300000-0000-4000-8000-000000000002', 'en', 'Key Park', 'Original description.');

insert into private.access_conditions (
  id, place_id, access_area, restraint_condition, dog_eligibility, availability_state,
  availability_window, permission_requirement, created_by, created_at
) values (
  '98400000-0000-4000-8000-000000000001', '98300000-0000-4000-8000-000000000001', 'indoors',
  'leash_required', '{"scope":"all_dogs"}'::jsonb, 'not_stated', '{}'::jsonb,
  'standing_permission', '98000000-0000-4000-8000-000000000003', '2026-01-01T00:00:00Z'
);

-- A flag against an Access Condition snapshots it, and the snapshot reads through a live
-- verification, so the Condition needs one before any Report can name it.
insert into private.evidence (
  id, place_id, kind, source_url, source_label, observed_at, recorded_by
) values (
  '98500000-0000-4000-8000-000000000001', '98300000-0000-4000-8000-000000000001',
  'official_website', 'https://example.invalid/key-cafe', 'Original policy',
  '2026-01-01T00:00:00Z', '98000000-0000-4000-8000-000000000003'
);
insert into private.verifications (
  id, access_condition_id, status, verified_by, verified_at, freshness_until
) values (
  '98600000-0000-4000-8000-000000000001', '98400000-0000-4000-8000-000000000001', 'verified',
  '98000000-0000-4000-8000-000000000003', '2026-01-01T00:00:00Z', '2030-01-01T00:00:00Z'
);
insert into private.verification_evidence (verification_id, evidence_id) values
  ('98600000-0000-4000-8000-000000000001', '98500000-0000-4000-8000-000000000001');

-- The omitted-locale hatch --------------------------------------------------------------------
--
-- A one-language Correction omits the other locale's key entirely and names it in needs_review.
-- The both-locales-no-flag shape has to stay valid, because every existing caller and the
-- Moderator apply path write it.

select lives_ok(
  $$ select private.validate_place_field_value('name', '{"is":"Lykilkaffi","needs_review":"en"}'::jsonb) $$,
  'A name written only in Icelandic, naming English for review, is accepted'
);

select lives_ok(
  $$ select private.validate_place_field_value('name', '{"en":"Key Cafe","needs_review":"is"}'::jsonb) $$,
  'A name written only in English, naming Icelandic for review, is accepted'
);

select lives_ok(
  $$ select private.validate_place_field_value('name', '{"is":"Lykilkaffi","en":"Key Cafe"}'::jsonb) $$,
  'The both-locales shape every existing caller writes is still accepted'
);

select lives_ok(
  $$ select private.validate_place_field_value('description', '{"is":"Ný lýsing.","needs_review":"en"}'::jsonb) $$,
  'The hatch applies to description as well as name, which un-orphans description Corrections'
);

select lives_ok(
  $$ select private.validate_place_field_value('description', '{"is":"Ný lýsing.","en":"A new description."}'::jsonb) $$,
  'The both-locales description shape is still accepted'
);

select throws_ok(
  $$ select private.validate_place_field_value('name', '{"is":"Lykilkaffi","en":"Key Cafe","needs_review":"en"}'::jsonb) $$,
  '22023', null,
  'A needs_review naming a locale the value also writes is a contradiction, not a hatch'
);

select throws_ok(
  $$ select private.validate_place_field_value('name', '{"is":"Lykilkaffi","needs_review":"fr"}'::jsonb) $$,
  '22023', null,
  'needs_review naming a locale the product does not have is rejected'
);

select throws_ok(
  $$ select private.validate_place_field_value('name', '{"is":"Lykilkaffi","needs_review":null}'::jsonb) $$,
  '22023', null,
  'A present but null needs_review is rejected rather than read as no flag'
);

select throws_ok(
  $$ select private.validate_place_field_value('name', '{"is":"Lykilkaffi","needs_review":2}'::jsonb) $$,
  '22023', null,
  'A needs_review that is not a locale string is rejected'
);

select throws_ok(
  $$ select private.validate_place_field_value('name', '{"needs_review":"en"}'::jsonb) $$,
  '22023', null,
  'A flag with no written locale at all proposes nothing and is rejected'
);

select throws_ok(
  $$ select private.validate_place_field_value('name', '{"is":"   ","needs_review":"en"}'::jsonb) $$,
  '22023', null,
  'A blank written locale is rejected, so the hatch cannot blank a published name'
);

select throws_ok(
  $$ select private.validate_place_field_value('name', '{"is":"Lykilkaffi","needs_review":"en","note":"x"}'::jsonb) $$,
  '22023', null,
  'A key outside the locale vocabulary is still rejected'
);

select throws_ok(
  $$ select private.validate_place_field_value('name', '{"is":"Lykilkaffi","en":"   "}'::jsonb) $$,
  '22023', null,
  'The unflagged both-locales rule is unchanged: an empty locale is still invalid'
);

select throws_ok(
  $$ select private.validate_place_field_value('website_url', '{"value":"https://example.invalid","needs_review":"en"}'::jsonb) $$,
  '22023', null,
  'A field with no locales gains no needs_review key'
);

-- The hatch survives the Correction command path -----------------------------------------------

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select lives_ok(
  $$
    select * from public.submit_place_correction(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000001',
        'target_kind', 'place_field',
        'target_field', 'name',
        'explanation', 'The sign outside says Lykilkaffihus now.',
        'evidence', jsonb_build_object(
          'kind', 'member_report',
          'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:00:00Z',
          'source_url', null,
          'source_citation', 'Correction to the place name, reported from the place card.',
          'source_metadata', jsonb_build_object(
            'submissionProfile', 'inline-v1', 'surface', 'place-card',
            'memberNoteProvided', true
          )
        ),
        'proposed_value', jsonb_build_object('is', 'Lykilkaffihús', 'needs_review', 'en')
      ),
      '98700000-0000-4000-8000-000000000001'
    )
  $$,
  'A one-language name Correction reaches the flag table through the command path'
);

select lives_ok(
  $$
    select * from public.submit_place_correction(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000001',
        'target_kind', 'place_field',
        'target_field', 'phone',
        'explanation', 'The number on the door is different.',
        'evidence', jsonb_build_object(
          'kind', 'member_report',
          'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:05:00Z',
          'source_url', null,
          'source_citation', 'Correction to the phone number, reported from the place card.',
          'source_metadata', '{}'::jsonb
        ),
        'proposed_value', jsonb_build_object('value', '+354 555 0199')
      ),
      '98700000-0000-4000-8000-000000000002'
    )
  $$,
  'A phone Correction is accepted, and is the one that will be resolved'
);

select lives_ok(
  $$
    select * from public.submit_place_report(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000001',
        'target_kind', 'access_condition',
        'access_condition_id', '98400000-0000-4000-8000-000000000001',
        'explanation', 'The place looks permanently closed.',
        'evidence', jsonb_build_object(
          'kind', 'member_report', 'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:10:00Z', 'source_url', null,
          'source_citation', 'Observed in person.', 'source_metadata', '{}'::jsonb
        ),
        'report_reason', 'closed', 'is_safety_concern', false
      ),
      '98700000-0000-4000-8000-000000000003'
    )
  $$,
  'A Report on the Access Condition is accepted'
);

select lives_ok(
  $$
    select * from public.submit_place_correction(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000002',
        'target_kind', 'place_field',
        'target_field', 'website_url',
        'explanation', 'The park has a new page.',
        'evidence', jsonb_build_object(
          'kind', 'member_report', 'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:15:00Z', 'source_url', null,
          'source_citation', 'Correction to the website address, reported from the place card.',
          'source_metadata', '{}'::jsonb
        ),
        'proposed_value', jsonb_build_object('value', 'https://example.invalid/key-park')
      ),
      '98700000-0000-4000-8000-000000000004'
    )
  $$,
  'The same Member has an open Correction on a second Place'
);

reset role;
select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select lives_ok(
  $$
    select * from public.submit_place_correction(
      jsonb_build_object(
        'place_id', '98300000-0000-4000-8000-000000000001',
        'target_kind', 'place_field',
        'target_field', 'dog_amenities',
        'explanation', 'There is a water bowl by the door now.',
        'evidence', jsonb_build_object(
          'kind', 'member_report', 'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:20:00Z', 'source_url', null,
          'source_citation', 'Correction to the dog amenities, reported from the place card.',
          'source_metadata', '{}'::jsonb
        ),
        'proposed_value', jsonb_build_object('value', jsonb_build_array('water bowl'))
      ),
      '98700000-0000-4000-8000-000000000005'
    )
  $$,
  'Another Member has an open Correction on the same Place'
);

reset role;

select is(
  (
    select flag.proposed_value from private.place_flags flag
    where flag.request_id = '98700000-0000-4000-8000-000000000001'
  ),
  '{"is":"Lykilkaffihús","needs_review":"en"}'::jsonb,
  'The stored Correction keeps the flagged locale absent rather than blank or guessed'
);

-- A resolved flag is no longer pending ----------------------------------------------------------

update private.place_flags
set status = 'rejected', resolved_at = statement_timestamp()
where request_id = '98700000-0000-4000-8000-000000000002';

-- The pending read -------------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (
    select count(*)
    from public.list_my_open_place_flags('98300000-0000-4000-8000-000000000001')
  ),
  2::bigint,
  'The read returns the caller unresolved flags on the requested Place and nothing else'
);

select ok(
  exists (
    select 1 from public.list_my_open_place_flags('98300000-0000-4000-8000-000000000001') pending
    where pending.kind = 'correction'
      and pending.target_kind = 'place_field'
      and pending.target_field = 'name'
      and pending.access_condition_id is null
      and pending.report_reason is null
      and pending.status = 'submitted'
  ),
  'A pending Correction carries its field and returns a null report reason'
);

select ok(
  exists (
    select 1 from public.list_my_open_place_flags('98300000-0000-4000-8000-000000000001') pending
    where pending.kind = 'report'
      and pending.target_kind = 'access_condition'
      and pending.target_field is null
      and pending.access_condition_id = '98400000-0000-4000-8000-000000000001'
      and pending.report_reason = 'closed'
  ),
  'A pending Report carries its reason and its Access Condition, which Phase 3 reads'
);

select ok(
  not exists (
    select 1 from public.list_my_open_place_flags('98300000-0000-4000-8000-000000000001') pending
    where pending.target_field = 'phone'
  ),
  'A resolved flag is not pending, however recently it was submitted'
);

select ok(
  not exists (
    select 1 from public.list_my_open_place_flags('98300000-0000-4000-8000-000000000001') pending
    where pending.target_field = 'dog_amenities'
  ),
  'Another Member open Correction on the same Place is invisible'
);

select is(
  (
    select count(*)
    from public.list_my_open_place_flags('98300000-0000-4000-8000-000000000002')
  ),
  1::bigint,
  'The read is scoped to one Place, not to everything the Member has open'
);

select ok(
  exists (
    select 1 from public.list_my_open_place_flags('98300000-0000-4000-8000-000000000002') pending
    where pending.target_field = 'website_url' and pending.access_condition_id is null
  ),
  'The second Place returns its own Correction rather than the first Place work'
);

reset role;
select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (
    select count(*)
    from public.list_my_open_place_flags('98300000-0000-4000-8000-000000000001')
  ),
  1::bigint,
  'Each Member sees their own open flags and only their own'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.list_my_open_place_flags('98300000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'A signed-out caller cannot reach the pending read at all'
);

reset role;

select * from finish();

rollback;
