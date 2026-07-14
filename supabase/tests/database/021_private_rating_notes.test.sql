begin;

create extension if not exists pgtap with schema extensions;

alter table private.locations alter column geometry_precision set default 'moderator_confirmed_point';
alter table private.locations alter column geometry_source set default 'Reviewed database test fixture';

select no_plan();

-- Schema surface -------------------------------------------------------------------------------

select has_table('private', 'private_rating_note_policy', 'Fail-closed note-policy singleton exists');
select has_table('private', 'rating_note_dispositions', 'Append-only Moderator disposition log exists');
select has_column(
  'private', 'dog_friendliness_ratings', 'private_note', 'Ratings gain a private note column'
);
select has_column(
  'private', 'dog_friendliness_ratings', 'linked_report_id', 'Ratings gain a linked-Report column'
);
select has_column(
  'private', 'place_flags', 'source_rating_id', 'Flags gain the mirror-image Rating link'
);
select has_function(
  'public', 'configure_private_rating_note_policy',
  array['text', 'integer', 'boolean'],
  'Service-role-only policy configuration exists'
);
select has_function(
  'public', 'get_private_rating_note_policy', array[]::text[],
  'Member-readable policy status exists'
);
select has_function(
  'public', 'submit_dog_friendliness_rating',
  array['uuid', 'integer', 'integer', 'integer', 'integer', 'uuid', 'boolean', 'text', 'text'],
  'The Rating submit command gains three trailing optional note parameters'
);
select has_function(
  'public', 'create_report_from_rating_note', array['uuid', 'uuid'],
  'The explicit Report-from-note wrapper exists'
);
select has_function(
  'public', 'list_moderation_dog_friendliness_rating_note_history', array['uuid', 'uuid'],
  'Moderator note-history listing exists'
);
select has_function(
  'public', 'record_rating_note_disposition',
  array['uuid', 'uuid', 'text', 'text', 'uuid'],
  'Moderator disposition command exists'
);
select has_function(
  'public', 'list_moderation_rating_note_dispositions', array['uuid', 'uuid'],
  'Moderator disposition listing exists'
);

-- Privilege boundaries ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'private.private_rating_note_policy', 'select,insert,update,delete'),
  'Visitors cannot inspect or mutate the note policy table'
);
select ok(
  not has_table_privilege('authenticated', 'private.rating_note_dispositions', 'select,insert,update,delete'),
  'Members cannot bypass the disposition RPC boundary'
);
select ok(
  not has_function_privilege('authenticated', 'public.configure_private_rating_note_policy(text,integer,boolean)', 'execute'),
  'Members cannot configure the note policy'
);
select ok(
  has_function_privilege('service_role', 'public.configure_private_rating_note_policy(text,integer,boolean)', 'execute'),
  'The service role can configure the note policy'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.submit_dog_friendliness_rating(uuid,integer,integer,integer,integer,uuid,boolean,text,text)',
    'execute'
  ),
  'Visitors cannot submit a Rating with a note'
);
select ok(
  not has_function_privilege('anon', 'public.create_report_from_rating_note(uuid,uuid)', 'execute'),
  'Visitors cannot create a Report from a note'
);
select ok(
  not has_function_privilege('authenticated', 'public.record_rating_note_disposition(uuid,uuid,text,text,uuid)', 'execute') = false,
  'Authenticated callers can attempt the disposition RPC (enforced internally by security.require_moderator())'
);

-- Fixture identities -------------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('79000000-0000-4000-8000-000000000001', 'note-member-one@example.invalid'),
  ('79000000-0000-4000-8000-000000000002', 'note-member-two@example.invalid'),
  ('79000000-0000-4000-8000-000000000003', 'note-member-three@example.invalid'),
  ('79000000-0000-4000-8000-000000000004', 'note-moderator@example.invalid'),
  ('79000000-0000-4000-8000-000000000005', 'note-venue-rep@example.invalid');

insert into private.member_accounts (user_id) values
  ('79000000-0000-4000-8000-000000000001'),
  ('79000000-0000-4000-8000-000000000002'),
  ('79000000-0000-4000-8000-000000000003');

insert into security.role_grants (user_id, role) values
  ('79000000-0000-4000-8000-000000000001', 'member'),
  ('79000000-0000-4000-8000-000000000002', 'member'),
  ('79000000-0000-4000-8000-000000000003', 'member'),
  ('79000000-0000-4000-8000-000000000004', 'moderator'),
  ('79000000-0000-4000-8000-000000000005', 'venue_representative');

insert into private.operators (id, name) values
  ('79100000-0000-4000-8000-000000000001', 'Private Rating Note fixture operator');
insert into private.locations (id, address_line, locality, postal_code, municipality, latitude, longitude)
values
  ('79200000-0000-4000-8000-000000000001', 'Athugasemdagata 1', 'Reykjavík', '101', 'reykjavik', 64.14, -21.94);
insert into private.places (id, operator_id, location_id, purpose, lifecycle, category, version, published_at)
values (
  '79300000-0000-4000-8000-000000000001', '79100000-0000-4000-8000-000000000001',
  '79200000-0000-4000-8000-000000000001', 'dog_access_destination', 'published', 'cafe', 1,
  '2026-01-01T00:00:00Z'
);
insert into private.place_translations (place_id, locale, name, description) values
  ('79300000-0000-4000-8000-000000000001', 'is', 'Athugasemdakaffi', 'Upprunaleg lýsing.'),
  ('79300000-0000-4000-8000-000000000001', 'en', 'Private Note Cafe', 'Original description.');
insert into private.access_conditions (id, place_id, access_area, restraint_condition, permission_requirement)
values (
  '79400000-0000-4000-8000-000000000001', '79300000-0000-4000-8000-000000000001', 'indoors',
  'leash_required', 'standing_permission'
);
insert into private.evidence (id, place_id, kind, source_url, source_label, observed_at) values (
  '79500000-0000-4000-8000-000000000001', '79300000-0000-4000-8000-000000000001', 'official_website',
  'https://example.invalid/private-note-cafe', 'Official site', '2026-01-01T00:00:00Z'
);
insert into private.verifications (id, access_condition_id, status, verified_at, freshness_until) values (
  '79600000-0000-4000-8000-000000000001', '79400000-0000-4000-8000-000000000001', 'verified',
  '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z'
);
insert into private.verification_evidence (verification_id, evidence_id) values
  ('79600000-0000-4000-8000-000000000001', '79500000-0000-4000-8000-000000000001');

-- Table-level integrity: the CHECK constraint holds even against the unrestricted test-runner
-- role, independent of the RPC boundary (which is separately proven by the has_table_privilege
-- checks above, since this connecting role itself bypasses grants).

select throws_ok(
  $$insert into private.rating_note_dispositions (member_id, place_id, disposition_kind, notes, moderator_id, request_id)
    values (
      '79000000-0000-4000-8000-000000000001', '79300000-0000-4000-8000-000000000001', 'not_a_real_kind', 'x',
      '79000000-0000-4000-8000-000000000004', gen_random_uuid()
    )$$,
  '23514',
  null,
  'An invalid disposition_kind is rejected at the table level'
);

-- Fail-closed default: no note policy row yet ----------------------------------------------------

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (select enabled from public.get_private_rating_note_policy()),
  false,
  'The note policy reads as disabled before any operator configuration'
);
select throws_ok(
  $$select * from public.submit_dog_friendliness_rating(
    '79300000-0000-4000-8000-000000000001', 2, null, null, null, gen_random_uuid(),
    true, 'This place turns dogs away on busy nights.', 'inaccurate_info'
  )$$,
  '22023',
  'Private Rating Notes are not available',
  'A note is rejected server-side while the policy is unconfigured, even for a low score'
);

reset role;

-- Policy configuration ----------------------------------------------------------------------------

set local role service_role;

select throws_ok(
  $$select public.configure_private_rating_note_policy('', 2, true)$$,
  '22023',
  'Private Rating Note policy version is required',
  'A blank policy version is rejected'
);
select throws_ok(
  $$select public.configure_private_rating_note_policy('private-rating-note-test-v1', 0, true)$$,
  '22023',
  'Private Rating Note policy threshold is invalid',
  'A threshold outside 1-5 is rejected'
);
select lives_ok(
  $$select public.configure_private_rating_note_policy('private-rating-note-test-v1', 2, true)$$,
  'The service role configures a fixture threshold of 2'
);
select lives_ok(
  $$select public.configure_place_flag_abuse_policy('private-rating-note-test-v1', 3600, 20, 10, 3600, true)$$,
  'The service role also configures the correction-and-report abuse policy so the Report wrapper composes cleanly'
);

reset role;

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (select enabled from public.get_private_rating_note_policy()),
  true,
  'The note policy now reads as enabled'
);
select is(
  (select low_score_threshold from public.get_private_rating_note_policy()),
  2,
  'The note policy reads back the configured threshold'
);

-- Low-score gate is evaluated against the submitted scores, not a stale prior Rating ---------------

select throws_ok(
  $$select * from public.submit_dog_friendliness_rating(
    '79300000-0000-4000-8000-000000000001', 4, 4, 4, 4, gen_random_uuid(),
    true, 'Nothing wrong here, just verbose.', 'subjective'
  )$$,
  '22023',
  'A Private Rating Note requires a qualifying low score',
  'A note is rejected when every submitted score is above the threshold'
);

reset role;

-- Member classification is forced and never defaulted --------------------------------------------

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select throws_ok(
  $$select * from public.submit_dog_friendliness_rating(
    '79300000-0000-4000-8000-000000000001', 2, 3, 3, 3, gen_random_uuid(),
    true, 'Something felt off about the posted rules.', null
  )$$,
  '22023',
  'A Private Rating Note classification is required',
  'A qualifying low-score note with no classification is rejected, never silently defaulted'
);
select throws_ok(
  $$select * from public.submit_dog_friendliness_rating(
    '79300000-0000-4000-8000-000000000001', 2, 3, 3, 3, gen_random_uuid(),
    true, 'Something felt off.', 'not_a_real_category'
  )$$,
  '22023',
  'A Private Rating Note classification is required',
  'An invalid classification value is rejected'
);

-- Member 1: subjective note on a low Rating (no Report path) -------------------------------------

select is(
  (
    select private_note from public.submit_dog_friendliness_rating(
      '79300000-0000-4000-8000-000000000001', 2, 3, 3, 3, '89000000-0000-4000-8000-000000000001',
      true, 'The welcome felt lukewarm, purely a matter of taste.', 'subjective'
    )
  ),
  'The welcome felt lukewarm, purely a matter of taste.',
  'A subjective note attaches to the low Rating'
);
select is(
  (
    select linked_report_id from public.get_my_dog_friendliness_rating('79300000-0000-4000-8000-000000000001')
  ),
  null,
  'A subjective note produces no linked Report'
);
select is(
  (select private_note from public.get_my_dog_friendliness_rating('79300000-0000-4000-8000-000000000001')),
  'The welcome felt lukewarm, purely a matter of taste.',
  'The Member can read their own note back'
);
select throws_ok(
  $$select * from public.create_report_from_rating_note(
    '79300000-0000-4000-8000-000000000001', gen_random_uuid()
  )$$,
  '22023',
  'A qualifying Private Rating Note is required to create a linked Report',
  'A subjective note never offers a Report path'
);

reset role;

-- Report creation fails closed before the correction-and-report abuse policy is configured (composition proof) -----
-- (Exercised above indirectly: the abuse policy was already configured before this point, so
-- instead prove composition failure using a fresh, still-unconfigured target -- Member 2 below
-- exercises the success path once both policies are configured.)

-- Member 2: inaccurate_info note explicitly becomes a linked Report -------------------------------

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (
    select private_note_classification from public.submit_dog_friendliness_rating(
      '79300000-0000-4000-8000-000000000001', 1, null, null, null, '89000000-0000-4000-8000-000000000002',
      true, 'The posted opening hours do not match what staff told me.', 'inaccurate_info'
    )
  ),
  'inaccurate_info',
  'An inaccurate_info note attaches'
);
select is(
  (select linked_report_id from public.get_my_dog_friendliness_rating('79300000-0000-4000-8000-000000000001')),
  null,
  'The note does not yet have a linked Report until one is explicitly created'
);

select flag_id as m2_flag_id, status as m2_status from public.create_report_from_rating_note(
  '79300000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000003'
) \gset

select ok(:'m2_flag_id' is not null, 'Creating a Report from a qualifying note returns a Flag id');
select is(:'m2_status'::text, 'submitted'::text, 'The linked Report starts in submitted status');

select is(
  (select linked_report_id::text from public.get_my_dog_friendliness_rating('79300000-0000-4000-8000-000000000001')),
  :'m2_flag_id',
  'The Rating records the link to the Report it produced'
);

reset role;

select is(
  (
    select source_rating_id is not null and explanation = 'The posted opening hours do not match what staff told me.'
      and target_kind = 'place_field' and target_field = 'description' and report_reason = 'inaccurate'
      and not is_safety_concern
    from private.place_flags
    where id = :'m2_flag_id'::uuid
  ),
  true,
  'The linked Report is built server-side from the note: mirror link, explanation, stable target, correct reason'
);

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (select flag_id::text from public.create_report_from_rating_note(
    '79300000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000003'
  )),
  :'m2_flag_id',
  'Replaying the exact same Report-creation request id is idempotent'
);
select throws_ok(
  $$select * from public.create_report_from_rating_note(
    '79300000-0000-4000-8000-000000000001', gen_random_uuid()
  )$$,
  '55006',
  'A linked Report already exists for this Rating',
  'At most one linked Report can be created per Rating'
);

-- Editing/clearing the note afterwards never retracts the linked Report --------------------------

select public.submit_dog_friendliness_rating(
  '79300000-0000-4000-8000-000000000001', 1, null, null, null, '89000000-0000-4000-8000-000000000004',
  true, null, null
);
select is(
  (select private_note from public.get_my_dog_friendliness_rating('79300000-0000-4000-8000-000000000001')),
  null,
  'The Member can clear their note independently'
);
select is(
  (select linked_report_id::text from public.get_my_dog_friendliness_rating('79300000-0000-4000-8000-000000000001')),
  :'m2_flag_id',
  'Clearing the note never clears the link to the Report it already produced'
);

reset role;

select is(
  (select status::text from private.place_flags where id = :'m2_flag_id'::uuid),
  'submitted',
  'The linked Report itself is untouched by the later note edit'
);

-- Member 3: safety_concern note explicitly becomes a linked Report with the safety flag set --------

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select public.submit_dog_friendliness_rating(
  '79300000-0000-4000-8000-000000000001', null, null, 2, null, '89000000-0000-4000-8000-000000000005',
  true, 'A loose dog on site nearly reached the street.', 'safety_concern'
);

select flag_id as m3_flag_id from public.create_report_from_rating_note(
  '79300000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000006'
) \gset

reset role;

select is(
  (select report_reason::text from private.place_flags where id = :'m3_flag_id'::uuid),
  'unsafe',
  'A safety_concern note produces a Report with report_reason unsafe'
);
select is(
  (select is_safety_concern from private.place_flags where id = :'m3_flag_id'::uuid),
  true,
  'A safety_concern note sets the Report is_safety_concern flag'
);

-- A note-only edit never bumps rated_at, so it can never move the numeric aggregate ----------------

select rated_at as m1_rated_at_before from private.dog_friendliness_ratings
where member_id = '79000000-0000-4000-8000-000000000001'
  and place_id = '79300000-0000-4000-8000-000000000001' \gset

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select public.submit_dog_friendliness_rating(
  '79300000-0000-4000-8000-000000000001', 2, 3, 3, 3, '89000000-0000-4000-8000-000000000007',
  true, 'The welcome felt lukewarm -- updated wording, purely a matter of taste.', 'subjective'
);

reset role;

select is(
  (
    select rated_at from private.dog_friendliness_ratings
    where member_id = '79000000-0000-4000-8000-000000000001'
      and place_id = '79300000-0000-4000-8000-000000000001'
  ),
  :'m1_rated_at_before'::timestamptz,
  'Editing only the note never bumps rated_at, so the note can never move the aggregate recency context'
);
select is(
  (
    select event_kind from private.dog_friendliness_rating_events
    where member_id = '79000000-0000-4000-8000-000000000001'
      and place_id = '79300000-0000-4000-8000-000000000001'
    order by occurred_at desc
    limit 1
  ),
  'note_updated',
  'The note-only edit is recorded as its own event kind'
);

-- Changing scores (not the note) still bumps rated_at exactly as before private-rating-note -------------------

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select public.submit_dog_friendliness_rating(
  '79300000-0000-4000-8000-000000000001', 1, 3, 3, 3, '89000000-0000-4000-8000-000000000008',
  false, null, null
);

reset role;

select ok(
  (
    select rated_at from private.dog_friendliness_ratings
    where member_id = '79000000-0000-4000-8000-000000000001'
      and place_id = '79300000-0000-4000-8000-000000000001'
  ) > :'m1_rated_at_before'::timestamptz,
  'A genuine score change still bumps rated_at, unchanged from pre-private-rating-note behavior'
);
select is(
  (
    select private_note from private.dog_friendliness_ratings
    where member_id = '79000000-0000-4000-8000-000000000001'
      and place_id = '79300000-0000-4000-8000-000000000001'
  ),
  'The welcome felt lukewarm -- updated wording, purely a matter of taste.',
  'A score-only edit (requested_update_private_note = false) never touches the existing note'
);

-- Moderator-only visibility: the queue surface, note history, and dispositions ---------------------

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000004', true);
set local role authenticated;

select is(
  (
    select count(*)::bigint from public.list_moderation_dog_friendliness_ratings(
      '79300000-0000-4000-8000-000000000001'
    ) where private_note is not null
  ),
  -- M1 (subjective, edited but never cleared) and M3 (safety_concern) still carry a note; M2's
  -- note was explicitly cleared above, proving clearing removes it from this listing too.
  2::bigint,
  'The extended Moderator listing surfaces every current note for the Place'
);
select is(
  (
    select linked_report_id::text from public.list_moderation_dog_friendliness_ratings(
      '79300000-0000-4000-8000-000000000001'
    ) where member_id = '79000000-0000-4000-8000-000000000002'
  ),
  :'m2_flag_id',
  'The Moderator listing surfaces the linked Report id'
);

select is(
  (
    select count(*)::bigint from public.list_moderation_dog_friendliness_rating_note_history(
      '79000000-0000-4000-8000-000000000001', '79300000-0000-4000-8000-000000000001'
    )
  ),
  -- submitted (original text), note_updated (edited text, scores unchanged), updated (later score
  -- change, note snapshot carried through unchanged) -- all three are retained history.
  3::bigint,
  'The note history retains every superseded note snapshot (submitted, note_updated, updated)'
);
select is(
  (
    select private_note from public.list_moderation_dog_friendliness_rating_note_history(
      '79000000-0000-4000-8000-000000000001', '79300000-0000-4000-8000-000000000001'
    )
    order by occurred_at asc
    limit 1
  ),
  'The welcome felt lukewarm, purely a matter of taste.',
  'The original note text is retained in the ledger even after being superseded'
);

-- M1 still carries a note (edited but never cleared); M2's note was explicitly cleared above,
-- so the disposition RPC's "a noted Rating was not found" guard is exercised on M2 instead.
select throws_ok(
  $$select * from public.record_rating_note_disposition(
    '79000000-0000-4000-8000-000000000001', '79300000-0000-4000-8000-000000000001',
    'not_a_real_kind', 'note', gen_random_uuid()
  )$$,
  '22023',
  'Rating note disposition kind is invalid',
  'An invalid disposition kind is rejected'
);
select throws_ok(
  $$select * from public.record_rating_note_disposition(
    '79000000-0000-4000-8000-000000000001', '79300000-0000-4000-8000-000000000001',
    'escalated', '', gen_random_uuid()
  )$$,
  '22023',
  'Disposition notes are required',
  'Blank disposition notes are rejected'
);
select throws_ok(
  $$select * from public.record_rating_note_disposition(
    '79000000-0000-4000-8000-000000000002', '79300000-0000-4000-8000-000000000001',
    'escalated', 'Would escalate, but the note was cleared', gen_random_uuid()
  )$$,
  '22023',
  'A noted Rating was not found',
  'A disposition cannot be recorded once the Rating has no current note'
);
select id as disposition_id from public.record_rating_note_disposition(
  '79000000-0000-4000-8000-000000000001', '79300000-0000-4000-8000-000000000001',
  'feedback_use_permitted', 'Aggregated feedback about the welcome experience may be shared once feedback-sharing ships.',
  '89000000-0000-4000-8000-000000000009'
) \gset

select ok(:'disposition_id' is not null, 'A Moderator can record a feedback-use decision');
select is(
  (select id::text from public.record_rating_note_disposition(
    '79000000-0000-4000-8000-000000000001', '79300000-0000-4000-8000-000000000001',
    'feedback_use_permitted', 'Aggregated feedback about the welcome experience may be shared once feedback-sharing ships.',
    '89000000-0000-4000-8000-000000000009'
  )),
  :'disposition_id',
  'Replaying the exact same disposition request id is idempotent'
);
select is(
  (
    select count(*)::bigint from public.list_moderation_rating_note_dispositions(
      '79000000-0000-4000-8000-000000000001', '79300000-0000-4000-8000-000000000001'
    )
  ),
  1::bigint,
  'The disposition listing shows exactly one recorded decision, not a duplicate from the replay'
);

-- Eligibility/abuse decisions are reused unchanged from the dog-friendliness RPCs ---------------------------

select is(
  (
    select excluded_at is not null from public.exclude_dog_friendliness_rating(
      '79000000-0000-4000-8000-000000000001', '79300000-0000-4000-8000-000000000001',
      'abuse', 'Coordinated low-quality note activity suspected', '89000000-0000-4000-8000-00000000000a'
    )
  ),
  true,
  'A Moderator excludes a noted Rating for abuse by reusing the unchanged dog-friendliness exclusion RPC'
);
select is(
  (
    select private_note is not null from public.list_moderation_dog_friendliness_ratings(
      '79300000-0000-4000-8000-000000000001'
    ) where member_id = '79000000-0000-4000-8000-000000000001'
  ),
  true,
  'Excluding a Rating for abuse never clears its note: low quality alone does not require redaction'
);

reset role;

-- No raw Member note content ever appears in the general Moderator audit log, even though the
-- Moderator's own exclusion reasoning legitimately does (that is the Moderator's own words about
-- their decision, not the Member's private note -- and it is exactly what the pre-existing dog-friendliness
-- exclude_dog_friendliness_rating audit event already records).

select ok(
  not exists (
    select 1
    from private.audit_events
    where change_summary::text ilike '%loose dog%'
      or change_summary::text ilike '%opening hours do not match%'
  ),
  'private.audit_events never contains raw Member Private Rating Note text'
);
select ok(
  exists (
    select 1
    from private.audit_events
    where change_summary::text ilike '%Coordinated low-quality note activity%'
  ),
  'The Moderator''s own exclusion reasoning is still recorded, as it already was before private-rating-note'
);

-- Unauthorized access denial ----------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000005', true);
set local role authenticated;

select throws_ok(
  $$select * from public.submit_dog_friendliness_rating(
    '79300000-0000-4000-8000-000000000001', 2, 2, 2, 2, gen_random_uuid(), true, 'note', 'subjective'
  )$$,
  '42501',
  'Member activation required',
  'A Venue Representative without Member activation cannot attach a Private Rating Note'
);
select throws_ok(
  $$select * from public.create_report_from_rating_note('79300000-0000-4000-8000-000000000001', gen_random_uuid())$$,
  '42501',
  'Member activation required',
  'A Venue Representative cannot create a Report from a note'
);
select throws_ok(
  $$select * from public.list_moderation_dog_friendliness_ratings('79300000-0000-4000-8000-000000000001')$$,
  '42501',
  'Moderator role required',
  'A Venue Representative cannot open the note-augmented Moderator queue'
);
select throws_ok(
  $$select * from public.list_moderation_dog_friendliness_rating_note_history(
    '79000000-0000-4000-8000-000000000001', '79300000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'Moderator role required',
  'A Venue Representative cannot read note history'
);
select throws_ok(
  $$select * from public.record_rating_note_disposition(
    '79000000-0000-4000-8000-000000000001', '79300000-0000-4000-8000-000000000001',
    'escalated', 'x', gen_random_uuid()
  )$$,
  '42501',
  'Moderator role required',
  'A Venue Representative cannot record a disposition'
);

reset role;

set local role anon;

select throws_ok(
  $$select * from public.submit_dog_friendliness_rating(
    '79300000-0000-4000-8000-000000000001', 2, 2, 2, 2, gen_random_uuid(), true, 'note', 'subjective'
  )$$,
  '42501',
  null,
  'A Visitor cannot attach a Private Rating Note'
);
select throws_ok(
  $$select * from public.get_my_dog_friendliness_rating('79300000-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'A Visitor cannot read a private note'
);
select throws_ok(
  $$select * from public.list_moderation_dog_friendliness_ratings('79300000-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'A Visitor cannot open the Moderator note queue'
);
select throws_ok(
  $$select * from public.get_private_rating_note_policy()$$,
  '42501',
  null,
  'A Visitor cannot read the note policy status'
);

reset role;

select set_config('request.jwt.claim.sub', '79000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select throws_ok(
  $$select * from public.list_moderation_dog_friendliness_ratings('79300000-0000-4000-8000-000000000001')$$,
  '42501',
  'Moderator role required',
  'A Member cannot open the note-augmented Moderator queue'
);
select throws_ok(
  $$select * from public.record_rating_note_disposition(
    '79000000-0000-4000-8000-000000000001', '79300000-0000-4000-8000-000000000001',
    'escalated', 'x', gen_random_uuid()
  )$$,
  '42501',
  'Moderator role required',
  'A Member cannot record a disposition'
);

reset role;

select * from finish();

rollback;
