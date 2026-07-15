begin;

create extension if not exists pgtap with schema extensions;

alter table private.locations alter column geometry_precision set default 'moderator_confirmed_point';
alter table private.locations alter column geometry_source set default 'Reviewed database test fixture';

select no_plan();

-- Function surface and privileges ---------------------------------------------------------------

select has_function(
  'public', 'configure_place_flag_abuse_policy',
  array['text', 'integer', 'integer', 'integer', 'integer', 'boolean'],
  'The abuse policy has one explicit configuration boundary'
);
select has_function(
  'public', 'submit_place_correction', array['jsonb', 'uuid'],
  'Members submit one structured private Correction command'
);
select has_function(
  'public', 'submit_place_report', array['jsonb', 'uuid'],
  'Members submit one structured private Report command'
);
select has_function(
  'public', 'list_my_place_flags', array['timestamp with time zone', 'uuid', 'integer'],
  'Members have one caller-scoped outcome projection'
);
select has_function(
  'public', 'list_moderation_place_flags',
  array['integer', 'timestamp with time zone', 'uuid', 'integer'],
  'Moderators have one private queue projection'
);
select has_function(
  'public', 'get_moderation_place_flag', array['uuid'],
  'Moderators fetch complete Correction/Report detail separately from the bounded queue'
);
select has_function(
  'public', 'list_related_place_flags', array['uuid'],
  'Moderators can inspect claim-grouped Correction/Report siblings without automatic merging'
);
select has_function(
  'public', 'resolve_place_flag',
  array['uuid', 'text', 'text', 'text', 'text', 'jsonb', 'jsonb', 'jsonb', 'uuid'],
  'Moderators resolve Corrections and Reports through one atomic command'
);
select has_function(
  'public', 'confirm_place_flag_contribution', array['uuid', 'uuid'],
  'Contribution confirmation is a separate post-resolution command'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.configure_place_flag_abuse_policy(text,integer,integer,integer,integer,boolean)',
    'execute'
  ),
  'Members cannot configure production abuse thresholds'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.configure_place_flag_abuse_policy(text,integer,integer,integer,integer,boolean)',
    'execute'
  ),
  'Only the service role can configure test or approved production policy values'
);
select ok(
  not has_function_privilege('anon', 'public.submit_place_correction(jsonb,uuid)', 'execute'),
  'Anonymous callers cannot submit Corrections'
);
select ok(
  not has_function_privilege('anon', 'public.submit_place_report(jsonb,uuid)', 'execute'),
  'Anonymous callers cannot submit Reports'
);
select ok(
  has_function_privilege('authenticated', 'public.submit_place_correction(jsonb,uuid)', 'execute'),
  'Authenticated Members can reach the identity-enforced Correction boundary'
);
select ok(
  not has_table_privilege('authenticated', 'private.place_flags', 'select'),
  'Correction and Report rows are unreachable outside security-definer functions'
);
select ok(
  not has_table_privilege('authenticated', 'private.place_flag_status_events', 'select'),
  'Status history is unreachable outside security-definer functions'
);

-- Fixtures -----------------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('76000000-0000-4000-8000-000000000001', 'flag-member-one@example.invalid'),
  ('76000000-0000-4000-8000-000000000002', 'flag-member-two@example.invalid'),
  ('76000000-0000-4000-8000-000000000003', 'flag-moderator@example.invalid');
insert into private.member_accounts (user_id) values
  ('76000000-0000-4000-8000-000000000001'),
  ('76000000-0000-4000-8000-000000000002'),
  ('76000000-0000-4000-8000-000000000003');
insert into security.role_grants (user_id, role) values
  ('76000000-0000-4000-8000-000000000001', 'member'),
  ('76000000-0000-4000-8000-000000000002', 'member'),
  ('76000000-0000-4000-8000-000000000003', 'member'),
  ('76000000-0000-4000-8000-000000000003', 'moderator');

insert into private.operators (id, name) values
  ('76100000-0000-4000-8000-000000000001', 'Flag operator');
insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude
) values
  ('76200000-0000-4000-8000-000000000001', 'Flag Street 1', 'Reykjavík', '101', 'reykjavik', 64.15, -21.95);
insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, phone, website_url, version,
  published_at, created_by
) values (
  '76300000-0000-4000-8000-000000000001', '76100000-0000-4000-8000-000000000001',
  '76200000-0000-4000-8000-000000000001', 'dog_access_destination', 'published', 'cafe',
  '+354 555 0100', 'https://example.invalid/flag-cafe', 1, '2026-01-01T00:00:00Z',
  '76000000-0000-4000-8000-000000000003'
);
insert into private.place_translations (place_id, locale, name, description) values
  ('76300000-0000-4000-8000-000000000001', 'is', 'Flögguð kaffihús', 'Upprunaleg lýsing.'),
  ('76300000-0000-4000-8000-000000000001', 'en', 'Flagged Cafe', 'Original description.');
insert into private.access_conditions (
  id, place_id, access_area, restraint_condition, permission_requirement, created_by, created_at
) values
  ('76400000-0000-4000-8000-000000000001', '76300000-0000-4000-8000-000000000001', 'indoors',
   'leash_required', 'standing_permission', '76000000-0000-4000-8000-000000000003', '2026-01-01T00:00:00Z'),
  ('76400000-0000-4000-8000-000000000002', '76300000-0000-4000-8000-000000000001', 'outdoors',
   'off_leash_permitted', 'ask_on_arrival', '76000000-0000-4000-8000-000000000003', '2026-01-01T00:00:00Z');
insert into private.evidence (
  id, place_id, kind, source_url, source_label, observed_at, recorded_by
) values (
  '76500000-0000-4000-8000-000000000001', '76300000-0000-4000-8000-000000000001', 'official_website',
  'https://example.invalid/flag-cafe', 'Original policy', '2026-01-01T00:00:00Z',
  '76000000-0000-4000-8000-000000000003'
);
insert into private.verifications (
  id, access_condition_id, status, verified_by, verified_at, freshness_until
) values
  ('76600000-0000-4000-8000-000000000001', '76400000-0000-4000-8000-000000000001', 'verified',
   '76000000-0000-4000-8000-000000000003', '2026-01-01T00:00:00Z', '2030-01-01T00:00:00Z'),
  ('76600000-0000-4000-8000-000000000002', '76400000-0000-4000-8000-000000000002', 'verified',
   '76000000-0000-4000-8000-000000000003', '2026-01-01T00:00:00Z', '2030-01-01T00:00:00Z');
insert into private.verification_evidence (verification_id, evidence_id) values
  ('76600000-0000-4000-8000-000000000001', '76500000-0000-4000-8000-000000000001'),
  ('76600000-0000-4000-8000-000000000002', '76500000-0000-4000-8000-000000000001');

-- Fail-closed abuse boundary -------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok(
  $$
    select * from public.submit_place_correction(
      jsonb_build_object(
        'place_id', '76300000-0000-4000-8000-000000000001', 'target_kind', 'place_field',
        'target_field', 'phone', 'explanation', 'The phone number changed.',
        'evidence', jsonb_build_object(
          'kind', 'direct_observation', 'source_label', 'Called the venue',
          'observed_at', '2026-07-11T09:00:00Z', 'source_url', 'https://example.invalid/proof',
          'source_citation', null, 'source_metadata', '{}'::jsonb
        ),
        'proposed_value', jsonb_build_object('value', '+354 555 0199')
      ),
      '86000000-0000-4000-8000-000000000001'
    )
  $$,
  '55000', null,
  'Correction submission fails closed while the abuse policy is unconfigured'
);
reset role;

select lives_ok(
  $$select public.configure_place_flag_abuse_policy('test-policy', 3600, 10, 3, 3600, true)$$,
  'Service role configures a test-only abuse policy: 10 per hour, 3 pending, 1h merge window'
);

-- Forbidden-role checks ------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok(
  $$select * from public.list_moderation_place_flags()$$,
  '42501', null, 'A Member cannot open the Moderator queue'
);
select throws_ok(
  $$select * from public.get_moderation_place_flag('00000000-0000-4000-8000-000000000000')$$,
  '42501', null, 'A Member cannot fetch Moderator-only Correction/Report detail'
);
select throws_ok(
  $$select * from public.list_related_place_flags('00000000-0000-4000-8000-000000000000')$$,
  '42501', null, 'A Member cannot list claim-related Correction/Report siblings'
);
select throws_ok(
  $$
    select * from public.resolve_place_flag(
      '00000000-0000-4000-8000-000000000000', 'rejected', 'Ástæða', 'Reason', null, null, null, null,
      '86000000-0000-4000-8000-000000000002'
    )
  $$,
  '42501', null, 'A Member cannot resolve a Correction or Report'
);
select throws_ok(
  $$
    select * from public.confirm_place_flag_contribution(
      '00000000-0000-4000-8000-000000000000', '86000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501', null, 'A Member cannot confirm Contribution credit'
);
reset role;

-- Member submission: Reports on Access Conditions (member two) ---------------------------------

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (select status from public.submit_place_report(
    jsonb_build_object(
      'place_id', '76300000-0000-4000-8000-000000000001', 'target_kind', 'access_condition',
      'access_condition_id', '76400000-0000-4000-8000-000000000001',
      'explanation', 'A dog was turned away despite the posted policy.',
      'evidence', jsonb_build_object(
        'kind', 'member_report', 'source_label', 'Witnessed in person',
        'observed_at', '2026-07-11T11:00:00Z', 'source_url', null,
        'source_citation', 'Personal visit on 2026-07-11', 'source_metadata', '{}'::jsonb
      ),
      'report_reason', 'unsafe', 'is_safety_concern', true
    ),
    '86000000-0000-4000-8000-000000000010'
  )),
  'submitted',
  'A Member can file a Safety Concern Report against an Access Condition'
);

select throws_ok(
  $$
    select * from public.submit_place_correction(
      jsonb_build_object(
        'place_id', '76300000-0000-4000-8000-000000000001', 'target_kind', 'access_condition',
        'access_condition_id', '00000000-0000-4000-8000-000000000000', 'explanation', 'Bogus target.',
        'evidence', jsonb_build_object(
          'kind', 'direct_observation', 'source_label', 'n/a', 'observed_at', '2026-07-11T09:00:00Z',
          'source_url', 'https://example.invalid/x', 'source_citation', null, 'source_metadata', '{}'::jsonb
        ),
        'proposed_value', jsonb_build_object(
          'access_area', 'indoors', 'access_area_note', null, 'restraint_condition', 'leash_required',
          'restraint_note', null, 'dog_eligibility', jsonb_build_object('scope', 'all_dogs'),
          'availability_window', '{}'::jsonb, 'permission_requirement', 'standing_permission'
        )
      ),
      '86000000-0000-4000-8000-000000000011'
    )
  $$,
  '22023', null, 'An Access Condition that does not exist is a target-not-found error'
);
select throws_ok(
  $$
    select * from public.submit_place_report(
      jsonb_build_object(
        'place_id', '76300000-0000-4000-8000-000000000001', 'target_kind', 'place_field',
        'target_field', 'phone', 'explanation', '',
        'evidence', jsonb_build_object(
          'kind', 'direct_observation', 'source_label', 'n/a', 'observed_at', '2026-07-11T09:00:00Z',
          'source_url', 'https://example.invalid/x', 'source_citation', null, 'source_metadata', '{}'::jsonb
        ),
        'report_reason', 'inaccurate', 'is_safety_concern', false
      ),
      '86000000-0000-4000-8000-000000000012'
    )
  $$,
  '22023', null, 'An empty private explanation is rejected'
);
select throws_ok(
  $$
    select * from public.submit_place_report(
      jsonb_build_object(
        'place_id', '76300000-0000-4000-8000-000000000001', 'target_kind', 'place_field',
        'target_field', 'name', 'explanation', 'This place replaced itself.',
        'evidence', jsonb_build_object(
          'kind', 'direct_observation', 'source_label', 'n/a', 'observed_at', '2026-07-11T09:00:00Z',
          'source_url', 'https://example.invalid/x', 'source_citation', null, 'source_metadata', '{}'::jsonb
        ),
        'report_reason', 'successor_place', 'is_safety_concern', false,
        'successor_place_id', '76300000-0000-4000-8000-000000000001'
      ),
      '86000000-0000-4000-8000-000000000013'
    )
  $$,
  '23514', null, 'A Place cannot be reported as its own successor'
);

select is(
  (select status from public.submit_place_correction(
    jsonb_build_object(
      'place_id', '76300000-0000-4000-8000-000000000001', 'target_kind', 'access_condition',
      'access_condition_id', '76400000-0000-4000-8000-000000000002',
      'explanation', 'Off-leash access is no longer offered per the venue.',
      'evidence', jsonb_build_object(
        'kind', 'official_website', 'source_label', 'Updated venue policy page',
        'observed_at', '2026-07-11T09:30:00Z', 'source_url', 'https://example.invalid/updated-policy',
        'source_citation', null, 'source_metadata', '{}'::jsonb
      ),
      'proposed_value', jsonb_build_object(
        'access_area', 'outdoors', 'access_area_note', null, 'restraint_condition', 'leash_required',
        'restraint_note', null, 'dog_eligibility', jsonb_build_object('scope', 'all_dogs'),
        'availability_state', 'whenever_open', 'availability_window', '{}'::jsonb,
        'permission_requirement', 'standing_permission'
      )
    ),
    '86000000-0000-4000-8000-000000000013'
  )),
  'submitted',
  'A Member can propose a Correction to a different Access Condition on the same Place'
);
reset role;

-- Capture flag IDs by request ID as the unrestricted migration role. Subsequent Correction/Report
-- RPC calls always run under `set local role authenticated`, which has no direct grant on
-- `private.*` tables, so IDs are resolved here (client-side psql substitution) rather than as
-- inline subqueries against private tables inside a role-scoped statement.
select id as flag_d from private.place_flags where request_id = '86000000-0000-4000-8000-000000000010' \gset
select id as flag_i from private.place_flags where request_id = '86000000-0000-4000-8000-000000000013' \gset

select ok(
  (
    select jsonb_typeof(flag.current_value_snapshot) = 'object'
      and flag.current_value_snapshot ->> 'restraint_condition' = 'leash_required'
    from private.place_flags flag
    where flag.id = :'flag_d'
  ),
  'The Report snapshot captured the current verified Access Condition value'
);

-- Member submission: Corrections and cap enforcement (member one) ------------------------------

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (select status from public.submit_place_report(
    jsonb_build_object(
      'place_id', '76300000-0000-4000-8000-000000000001', 'target_kind', 'access_condition',
      'access_condition_id', '76400000-0000-4000-8000-000000000001',
      'explanation', 'The signage contradicts what staff told me on site.',
      'evidence', jsonb_build_object(
        'kind', 'direct_observation', 'source_label', 'Photo of the sign',
        'observed_at', '2026-07-11T12:00:00Z', 'source_url', 'https://example.invalid/sign-photo',
        'source_citation', null, 'source_metadata', '{}'::jsonb
      ),
      'report_reason', 'misleading', 'is_safety_concern', false
    ),
    '86000000-0000-4000-8000-000000000020'
  )),
  'submitted',
  'A second, distinct Member can Report the same claim without silently merging with the first Report'
);

select is(
  (select status from public.submit_place_correction(
    jsonb_build_object(
      'place_id', '76300000-0000-4000-8000-000000000001', 'target_kind', 'place_field',
      'target_field', 'phone', 'explanation', 'The phone number changed.',
      'evidence', jsonb_build_object(
        'kind', 'direct_observation', 'source_label', 'Called the venue',
        'observed_at', '2026-07-11T09:00:00Z', 'source_url', 'https://example.invalid/proof',
        'source_citation', null, 'source_metadata', '{}'::jsonb
      ),
      'proposed_value', jsonb_build_object('value', '+354 555 0199')
    ),
    '86000000-0000-4000-8000-000000000021'
  )),
  'submitted',
  'A Member can submit a phone-field Correction'
);
select is(
  (select status from public.submit_place_correction(
    jsonb_build_object(
      'place_id', '76300000-0000-4000-8000-000000000001', 'target_kind', 'place_field',
      'target_field', 'phone', 'explanation', 'The phone number changed.',
      'evidence', jsonb_build_object(
        'kind', 'direct_observation', 'source_label', 'Called the venue',
        'observed_at', '2026-07-11T09:00:00Z', 'source_url', 'https://example.invalid/proof',
        'source_citation', null, 'source_metadata', '{}'::jsonb
      ),
      'proposed_value', jsonb_build_object('value', '+354 555 0199')
    ),
    '86000000-0000-4000-8000-000000000021'
  )),
  'submitted',
  'The same request ID is idempotent and returns the same submitted status'
);
select is(
  (select status from public.submit_place_correction(
    jsonb_build_object(
      'place_id', '76300000-0000-4000-8000-000000000001', 'target_kind', 'place_field',
      'target_field', 'phone', 'explanation', 'Confirmed again a few minutes later.',
      'evidence', jsonb_build_object(
        'kind', 'direct_observation', 'source_label', 'Called again',
        'observed_at', '2026-07-11T09:05:00Z', 'source_url', 'https://example.invalid/proof-2',
        'source_citation', null, 'source_metadata', '{}'::jsonb
      ),
      'proposed_value', jsonb_build_object('value', '+354 555 0200')
    ),
    '86000000-0000-4000-8000-000000000022'
  )),
  'submitted',
  'A same-Member, same-claim submission with a new request ID merges into the existing open flag'
);

select is(
  (select status from public.submit_place_correction(
    jsonb_build_object(
      'place_id', '76300000-0000-4000-8000-000000000001', 'target_kind', 'place_field',
      'target_field', 'website_url', 'explanation', 'The website moved.',
      'evidence', jsonb_build_object(
        'kind', 'direct_observation', 'source_label', 'Visited the new site',
        'observed_at', '2026-07-11T09:00:00Z', 'source_url', 'https://example.invalid/new-site',
        'source_citation', null, 'source_metadata', '{}'::jsonb
      ),
      'proposed_value', jsonb_build_object('value', 'https://example.invalid/new')
    ),
    '86000000-0000-4000-8000-000000000023'
  )),
  'submitted',
  'A third distinct claim reaches the configured pending-open cap of 3'
);
select throws_ok(
  $$
    select * from public.submit_place_correction(
      jsonb_build_object(
        'place_id', '76300000-0000-4000-8000-000000000001', 'target_kind', 'place_field',
        'target_field', 'opening_hours', 'explanation', 'Hours changed for the season.',
        'evidence', jsonb_build_object(
          'kind', 'direct_observation', 'source_label', 'Posted sign',
          'observed_at', '2026-07-11T09:00:00Z', 'source_url', 'https://example.invalid/hours',
          'source_citation', null, 'source_metadata', '{}'::jsonb
        ),
        'proposed_value', jsonb_build_object('value', jsonb_build_object('mon', '09:00-17:00'))
      ),
      '86000000-0000-4000-8000-000000000024'
    )
  $$,
  '54000', null, 'A fourth distinct claim is blocked by the pending-open cap'
);
reset role;

select id as flag_j from private.place_flags where request_id = '86000000-0000-4000-8000-000000000020' \gset
select id as flag_a from private.place_flags where request_id = '86000000-0000-4000-8000-000000000021' \gset
select id as flag_b from private.place_flags where request_id = '86000000-0000-4000-8000-000000000023' \gset

select is(
  (select count(*)::int from private.place_flags
    where member_id = '76000000-0000-4000-8000-000000000001' and target_field = 'phone'),
  1,
  'The merge-window duplicate flood did not create a second row'
);

-- Member-safe listings never leak another Member's rows or private detail ----------------------

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  (select count(*)::int from public.list_my_place_flags()), 3,
  'Member one sees only their own three Corrections and Reports'
);
reset role;

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is(
  (select count(*)::int from public.list_my_place_flags()), 2,
  'Member two sees only their own two Corrections and Reports'
);
reset role;

-- Moderator queue groups related claims without merging them -----------------------------------

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select is(
  (select count(*)::int from public.list_moderation_place_flags()), 5,
  'The Moderator queue lists every submitted claim across both Members'
);
select is(
  (select is_safety_concern from public.list_moderation_place_flags() order by priority limit 1),
  true,
  'The Safety Concern Report sorts first in the queue'
);
select is(
  (select count(*)::int from public.list_related_place_flags(:'flag_d')),
  1,
  'The Safety Concern Report has exactly one related claim on the same Access Condition target'
);
select is(
  (select flag_id from public.list_related_place_flags(:'flag_d')),
  :'flag_j',
  'The related claim is the second, distinct-Member Report on the same target, not a silent merge'
);

select ok(
  (
    select current_live_value -> 'access_area' = current_value_snapshot -> 'access_area'
    from public.get_moderation_place_flag(:'flag_d')
  ),
  'The Moderator detail view compares the submission-time snapshot against the freshly re-fetched live value'
);

-- Moderator detail: current verification freshness and provenance (correction-and-report fast-follow) -----------

select is(
  (select current_verification_status from public.get_moderation_place_flag(:'flag_j')),
  'verified',
  'The Moderator detail view surfaces the current verification status inline for an Access Condition target'
);
select is(
  (select current_verification_verified_at from public.get_moderation_place_flag(:'flag_j')),
  '2026-01-01T00:00:00Z'::timestamptz,
  'The Moderator detail view surfaces the current verification verified-at date inline'
);
select is(
  (select current_verification_freshness_until from public.get_moderation_place_flag(:'flag_j')),
  '2030-01-01T00:00:00Z'::timestamptz,
  'The Moderator detail view surfaces the current verification freshness-until date inline'
);
select is(
  (select current_verification_evidence from public.get_moderation_place_flag(:'flag_j')),
  jsonb_build_array(jsonb_build_object(
    'kind', 'official_website', 'sourceUrl', 'https://example.invalid/flag-cafe',
    'sourceCitation', null, 'sourceLabel', 'Original policy',
    'observedAt', '2026-01-01T00:00:00+00:00'
  )),
  'The Moderator detail view surfaces the current verification provenance rows (source type and date) inline'
);

select is(
  (select current_verification_status from public.get_moderation_place_flag(:'flag_a')),
  null,
  'A Place-field-target Correction has no current verification, so its status is absent'
);
select is(
  (select current_verification_verified_at from public.get_moderation_place_flag(:'flag_a')),
  null,
  'A Place-field-target Correction has no current verification, so its verified-at date is absent'
);
select is(
  (select current_verification_freshness_until from public.get_moderation_place_flag(:'flag_a')),
  null,
  'A Place-field-target Correction has no current verification, so its freshness-until date is absent'
);
select is(
  (select current_verification_evidence from public.get_moderation_place_flag(:'flag_a')),
  null,
  'A Place-field-target Correction has no current verification, so its provenance is absent'
);

reset role;
select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok(
  format($fmt$select * from public.get_moderation_place_flag(%L)$fmt$, :'flag_j'::uuid),
  '42501', null,
  'A Member is still denied the enriched Moderator-only detail view, unchanged by the new freshness fields'
);
reset role;

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000003', true);
set local role authenticated;

-- Resolution: dispute_opened composes the existing freshness-and-identity command --------------------------------

select is(
  (select status from public.resolve_place_flag(
    :'flag_d',
    'dispute_opened', 'Málið er komið í rannsókn hjá stjórnendum.', 'The matter is under Moderator review.',
    'Escalated as a Safety Concern; venue contacted informally.', null,
    jsonb_build_object(
      'expected_verification_id', '76600000-0000-4000-8000-000000000001',
      'reason', 'A Member Report contradicts the currently posted leash policy.',
      'evidence', jsonb_build_object(
        'kind', 'member_report', 'source_label', 'Community Report evidence',
        'observed_at', '2026-07-11T11:00:00Z', 'source_url', null,
        'source_citation', 'Escalated Report bundle', 'source_metadata', '{}'::jsonb
      )
    ),
    null, '87000000-0000-4000-8000-000000000001'
  )),
  'dispute_opened',
  'A Moderator can open an Access Dispute directly from a Report resolution'
);

-- Resolution: applied composes an atomic Access Condition supersede + verify -------------------

select is(
  (select status from public.resolve_place_flag(
    :'flag_i',
    'applied', 'Leiðréttingin var staðfest og birt.', 'The Correction was verified and published.',
    null,
    jsonb_build_object(
      'expected_verification_id', '76600000-0000-4000-8000-000000000002',
      'replacement_condition', jsonb_build_object(
        'access_area', 'outdoors', 'access_area_note', null, 'restraint_condition', 'leash_required',
        'restraint_note', null, 'dog_eligibility', jsonb_build_object('scope', 'all_dogs'),
        'availability_state', 'whenever_open', 'availability_window', '{}'::jsonb,
        'permission_requirement', 'standing_permission'
      ),
      'evidence', jsonb_build_object(
        'kind', 'official_website', 'source_label', 'Moderator-confirmed policy page',
        'observed_at', '2026-07-11T13:00:00Z', 'source_url', 'https://example.invalid/confirmed-policy',
        'source_citation', null, 'source_metadata', '{}'::jsonb
      ),
      'verified_at', '2026-07-11T13:00:00Z', 'freshness_until', '2027-01-11T13:00:00Z'
    ),
    null, null, '87000000-0000-4000-8000-000000000002'
  )),
  'applied',
  'A Moderator can apply an Access Condition Correction atomically'
);

reset role;

select is(
  (
    select availability_state::text
    from private.access_conditions
    where place_id = '76300000-0000-4000-8000-000000000001'
      and superseded_at is null
      and access_area = 'outdoors'
      and permission_requirement = 'standing_permission'
  ),
  'whenever_open'::text,
  'Applied Correction replacement writes its explicit availability state directly'
);

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000003', true);
set local role authenticated;

-- Resolution: a second, distinct-Member claim on the same target keeps its own outcome ----------

select is(
  (select status from public.resolve_place_flag(
    :'flag_j',
    'rejected', 'Ekki tókst að staðfesta ábendinguna sjálfstætt.',
    'The Report could not be independently substantiated.', 'Venue confirmed the sign is current.', null,
    null, null, '87000000-0000-4000-8000-000000000003'
  )),
  'rejected',
  'The second, distinct-Member Report on the same claim resolves independently of the first'
);

-- Resolution: applied composes a Place-field update under optimistic concurrency ----------------

select is(
  (select status from public.resolve_place_flag(
    :'flag_a',
    'applied', 'Símanúmerið var uppfært.', 'The phone number was updated.', null,
    jsonb_build_object('expected_version', 1, 'field_value', jsonb_build_object('value', '+354 555 0199')),
    null, null, '87000000-0000-4000-8000-000000000004'
  )),
  'applied',
  'A Moderator can apply a Place-field phone Correction'
);
select is(
  (select status from public.resolve_place_flag(
    :'flag_a',
    'applied', 'Símanúmerið var uppfært.', 'The phone number was updated.', null,
    jsonb_build_object('expected_version', 1, 'field_value', jsonb_build_object('value', '+354 555 0199')),
    null, null, '87000000-0000-4000-8000-000000000004'
  )),
  'applied',
  'A repeated resolution with the same request ID and outcome is idempotent'
);
select throws_ok(
  format(
    $fmt$select * from public.resolve_place_flag(
      %L, 'rejected', 'Breytt niðurstaða.', 'Changed outcome.', null, null, null, null,
      '87000000-0000-4000-8000-000000000005'
    )$fmt$,
    :'flag_a'::uuid
  ),
  '55006', null, 'A terminal outcome cannot be rewritten with a different resolution'
);

select is(
  (select contribution_id from public.confirm_place_flag_contribution(
    :'flag_a', '87000000-0000-4000-8000-000000000006'
  )) is not null,
  true,
  'A Moderator confirms Contribution credit for the applied Correction'
);
reset role;

select is(
  (select count(*)::int from private.contributions where place_flag_id = :'flag_a'),
  1,
  'Exactly one Contribution exists for the applied Correction'
);
select is(
  (select kind from private.contributions where place_flag_id = :'flag_a'),
  'applied_correction',
  'The Contribution kind reflects an applied Correction source'
);
select is(
  (select subject_place_id from private.contributions where place_flag_id = :'flag_a'),
  (select place_id from private.place_flags where id = :'flag_a'),
  'A flag Contribution denormalizes the subject Place for trust derivation'
);

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select is(
  (select contribution_id from public.confirm_place_flag_contribution(
    :'flag_a', '87000000-0000-4000-8000-000000000007'
  )),
  (select contribution_id from public.confirm_place_flag_contribution(
    :'flag_a', '87000000-0000-4000-8000-000000000006'
  )),
  'Re-confirming Contribution credit is idempotent and does not create a second Contribution'
);

-- Resolution: rejected surfaces a private Moderator-only note -----------------------------------

select is(
  (select status from public.resolve_place_flag(
    :'flag_b',
    'rejected', 'Vefslóðin er enn rétt.', 'The website address is still correct.',
    'Called the venue to confirm; no change needed.', null, null, null,
    '87000000-0000-4000-8000-000000000008'
  )),
  'rejected',
  'A Moderator can reject a Correction with a private note'
);
select is(
  (select private_note from public.get_moderation_place_flag(:'flag_b')),
  'Called the venue to confirm; no change needed.',
  'The private Moderator note is visible in the Moderator-only detail view'
);
reset role;

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  (select member_reason_en from public.list_my_place_flags() where target_field = 'website_url'),
  'The website address is still correct.',
  'The Member-safe reason is visible to the submitting Member'
);
reset role;

-- Kind and target outcome mismatches are rejected, not silently coerced -------------------------

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  (select status from public.submit_place_report(
    jsonb_build_object(
      'place_id', '76300000-0000-4000-8000-000000000001', 'target_kind', 'place_field',
      'target_field', 'name', 'explanation', 'The business appears to have rebranded.',
      'evidence', jsonb_build_object(
        'kind', 'direct_observation', 'source_label', 'Saw the new sign',
        'observed_at', '2026-07-11T14:00:00Z', 'source_url', 'https://example.invalid/sign',
        'source_citation', null, 'source_metadata', '{}'::jsonb
      ),
      'report_reason', 'closed', 'is_safety_concern', false
    ),
    '86000000-0000-4000-8000-000000000030'
  )),
  'submitted',
  'A Member can file a name-field Report'
);
reset role;

select id as flag_e from private.place_flags where request_id = '86000000-0000-4000-8000-000000000030' \gset

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select throws_ok(
  format(
    $fmt$select * from public.resolve_place_flag(
      %L, 'applied', 'Ástæða', 'Reason', null, null, null, null, '87000000-0000-4000-8000-000000000009'
    )$fmt$,
    :'flag_e'::uuid
  ),
  '22023', null, 'Only a Correction can be resolved as applied, not a Report'
);
select throws_ok(
  format(
    $fmt$select * from public.resolve_place_flag(
      %L, 'dispute_opened', 'Ástæða', 'Reason', null, null, null, null,
      '87000000-0000-4000-8000-000000000010'
    )$fmt$,
    :'flag_e'::uuid
  ),
  '22023', null, 'Opening a dispute requires an Access Condition target, not a Place field'
);
select is(
  (select status from public.resolve_place_flag(
    :'flag_e',
    'needs_information', 'Vinsamlegast sendu ljósmynd af nýja skiltinu.',
    'Please share a photo of the new sign.', null, null, null, null, '87000000-0000-4000-8000-000000000011'
  )),
  'needs_information',
  'A Moderator can request more information without closing the claim'
);
reset role;

select ok(
  (select resolved_at is null from private.place_flags where id = :'flag_e'),
  'A needs_information outcome does not set a resolution time'
);

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select is(
  (select status from public.resolve_place_flag(
    :'flag_e',
    'confirmed_useful', 'Ábendingin reyndist gagnleg.', 'The Report supplied useful Evidence.', null,
    null, null, null, '87000000-0000-4000-8000-000000000012'
  )),
  'confirmed_useful',
  'A Moderator can confirm that a Report supplied useful Evidence without any structural mutation'
);
select is(
  (select contribution_id from public.confirm_place_flag_contribution(
    :'flag_e', '87000000-0000-4000-8000-000000000013'
  )) is not null,
  true,
  'A Moderator confirms Contribution credit for the confirmed-useful Report'
);
reset role;

select is(
  (select kind from private.contributions where place_flag_id = :'flag_e'),
  'confirmed_report',
  'The Contribution kind reflects a confirmed-useful Report source'
);

-- Resolution: confirmed_useful requires a Report, not a Correction ------------------------------

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is(
  (select status from public.submit_place_correction(
    jsonb_build_object(
      'place_id', '76300000-0000-4000-8000-000000000001', 'target_kind', 'place_field',
      'target_field', 'dog_amenities', 'explanation', 'A water bowl was added.',
      'evidence', jsonb_build_object(
        'kind', 'direct_observation', 'source_label', 'Saw it on site',
        'observed_at', '2026-07-11T15:00:00Z', 'source_url', 'https://example.invalid/bowl',
        'source_citation', null, 'source_metadata', '{}'::jsonb
      ),
      'proposed_value', jsonb_build_object('value', jsonb_build_array('water_bowl'))
    ),
    '86000000-0000-4000-8000-000000000040'
  )),
  'submitted',
  'A Member can submit a dog-amenities Correction'
);
reset role;

select id as flag_g from private.place_flags where request_id = '86000000-0000-4000-8000-000000000040' \gset

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select throws_ok(
  format(
    $fmt$select * from public.resolve_place_flag(
      %L, 'confirmed_useful', 'Ástæða', 'Reason', null, null, null, null,
      '87000000-0000-4000-8000-000000000014'
    )$fmt$,
    :'flag_g'::uuid
  ),
  '22023', null, 'Only a Report can be resolved as confirmed useful, not a Correction'
);
select is(
  (select status from public.resolve_place_flag(
    :'flag_g',
    'applied', 'Hundabúnaður uppfærður.', 'Dog amenities were updated.', null,
    jsonb_build_object('expected_version', 2, 'field_value', jsonb_build_object('value', jsonb_build_array('water_bowl'))),
    null, null, '87000000-0000-4000-8000-000000000015'
  )),
  'applied',
  'A Moderator can apply the dog-amenities Correction'
);
reset role;

select is(
  (select dog_amenities from private.places where id = '76300000-0000-4000-8000-000000000001'),
  jsonb_build_array('water_bowl'),
  'The Place dog amenities reflect the applied Correction'
);
select is(
  (select version from private.places where id = '76300000-0000-4000-8000-000000000001'),
  3::bigint,
  'A second applied Place-field Correction bumps the version again'
);
select is(
  (select phone from private.places where id = '76300000-0000-4000-8000-000000000001'),
  '+354 555 0199',
  'The Place phone number reflects the earlier applied Correction'
);

-- Resolution: place_inactivated composes the existing identity transition ----------------------------------------

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  (select status from public.submit_place_report(
    jsonb_build_object(
      'place_id', '76300000-0000-4000-8000-000000000001', 'target_kind', 'place_field',
      'target_field', 'opening_hours', 'explanation', 'The location is permanently closed.',
      'evidence', jsonb_build_object(
        'kind', 'direct_observation', 'source_label', 'Storefront is empty',
        'observed_at', '2026-07-11T16:00:00Z', 'source_url', 'https://example.invalid/closed',
        'source_citation', null, 'source_metadata', '{}'::jsonb
      ),
      'report_reason', 'closed', 'is_safety_concern', false
    ),
    '86000000-0000-4000-8000-000000000050'
  )),
  'submitted',
  'A Member can Report that a Place has closed'
);
reset role;

select id as flag_h from private.place_flags where request_id = '86000000-0000-4000-8000-000000000050' \gset

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select is(
  (select status from public.resolve_place_flag(
    :'flag_h',
    'place_inactivated', 'Staðurinn hefur verið gerður óvirkur.', 'The Place has been made Inactive.', null,
    null, null,
    jsonb_build_object('expected_version', 3, 'decision_notes', 'Business permanently closed per Member Report.'),
    '87000000-0000-4000-8000-000000000016'
  )),
  'place_inactivated',
  'A Moderator can retire the Place directly from a Report resolution'
);
reset role;

select is(
  (select lifecycle from private.places where id = '76300000-0000-4000-8000-000000000001'),
  'inactive',
  'The Place lifecycle reflects the composed identity transition'
);

-- Composed freshness-and-identity commands leave real linked rows, not just a status label -----------------------

select ok(
  exists (
    select 1 from private.access_disputes dispute
    join private.place_flags flag on flag.dispute_id = dispute.id
    where flag.id = :'flag_d'
      and dispute.access_condition_id = '76400000-0000-4000-8000-000000000001'
      and dispute.status = 'open'
  ),
  'The composed dispute command created a real Access Dispute row linked back to the Report'
);
select ok(
  (select superseded_at is not null from private.verifications
    where id = '76600000-0000-4000-8000-000000000001'),
  'The disputed Access Condition''s prior Verification was superseded'
);
select ok(
  (select restraint_condition = 'leash_required' from private.access_conditions
    where supersedes_condition_id = '76400000-0000-4000-8000-000000000002'),
  'The applied Access Condition Correction created a replacement with the reviewed value'
);
select ok(
  (select superseded_at is not null from private.access_conditions
    where id = '76400000-0000-4000-8000-000000000002'),
  'The original Access Condition was superseded, not mutated in place'
);
select ok(
  exists (
    select 1 from private.place_identity_transitions transition
    join private.place_flags flag on flag.transition_id = transition.id
    where flag.id = :'flag_h'
      and transition.kind = 'inactive'
      and transition.predecessor_place_id = '76300000-0000-4000-8000-000000000001'
  ),
  'The composed inactivation command created a real identity transition row linked back to the Report'
);

-- Append-only status history ----------------------------------------------------------------

select throws_ok(
  format(
    $fmt$update private.place_flag_status_events set private_note = 'tampered' where flag_id = %L$fmt$,
    :'flag_h'::uuid
  ),
  '55000', null,
  'Correction and Report status history cannot be rewritten, even by the migration role'
);

-- Audit trail --------------------------------------------------------------------------------

select is(
  (select count(*) from private.audit_events where action = 'place_flag.dispute_opened'),
  1::bigint, 'Opening a dispute from a Report resolution appends one flag-level audit event'
);
select is(
  (select count(*) from private.audit_events where action = 'access.disputed'),
  1::bigint, 'Opening a dispute appends the underlying Access Condition audit event'
);
select is(
  (select count(*) from private.audit_events where action = 'place_flag.applied'),
  3::bigint, 'Each applied Correction appends one flag-level audit event'
);
select is(
  (select count(*) from private.audit_events where action = 'place.corrected'),
  2::bigint, 'Each applied Place-field Correction appends the underlying Place audit event'
);
select is(
  (select count(*) from private.audit_events where action = 'access.corrected'),
  1::bigint, 'The applied Access Condition Correction appends the underlying Access Condition audit event'
);
select is(
  (select count(*) from private.audit_events where action = 'place_flag.place_inactivated'),
  1::bigint, 'Inactivating a Place from a Report resolution appends one flag-level audit event'
);
select is(
  (select count(*) from private.audit_events where action = 'place.identity_transitioned'),
  1::bigint, 'Inactivation appends the underlying Place identity-transition audit event'
);

select * from finish();
