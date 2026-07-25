begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

-- Fixtures --------------------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('97000000-0000-4000-8000-000000000001', 'report-member@example.invalid'),
  ('97000000-0000-4000-8000-000000000002', 'report-other-member@example.invalid'),
  ('97000000-0000-4000-8000-000000000003', 'report-moderator@example.invalid');
insert into private.member_accounts (user_id) values
  ('97000000-0000-4000-8000-000000000001'),
  ('97000000-0000-4000-8000-000000000002'),
  ('97000000-0000-4000-8000-000000000003');
insert into security.role_grants (user_id, role) values
  ('97000000-0000-4000-8000-000000000001', 'member'),
  ('97000000-0000-4000-8000-000000000002', 'member'),
  ('97000000-0000-4000-8000-000000000003', 'member'),
  ('97000000-0000-4000-8000-000000000003', 'moderator');

insert into private.operators (id, name) values
  ('97100000-0000-4000-8000-000000000001', 'Report operator');
insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude,
  geometry_precision, geometry_source
) values
  (
    '97200000-0000-4000-8000-000000000001', 'Strandgata 1', 'Hafnarfjörður', '220', 'hafnarfjordur',
    64.07, -21.96, 'moderator_confirmed_point', 'Reviewed database test fixture'
  ),
  (
    '97200000-0000-4000-8000-000000000002', 'Strandgata 2', 'Hafnarfjörður', '220', 'hafnarfjordur',
    64.08, -21.97, 'moderator_confirmed_point', 'Reviewed database test fixture'
  );

insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, version, published_at, created_by
) values
  (
    '97300000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000001',
    '97200000-0000-4000-8000-000000000001', 'dog_access_destination', 'published', 'cafe', 1,
    '2026-01-01T00:00:00Z', '97000000-0000-4000-8000-000000000003'
  ),
  (
    '97300000-0000-4000-8000-000000000002', '97100000-0000-4000-8000-000000000001',
    '97200000-0000-4000-8000-000000000002', 'dog_access_destination', 'candidate', 'park', 1,
    null, '97000000-0000-4000-8000-000000000003'
  );
insert into private.place_translations (place_id, locale, name, description) values
  ('97300000-0000-4000-8000-000000000001', 'is', 'Strandkaffi', 'Upprunaleg lýsing.'),
  ('97300000-0000-4000-8000-000000000001', 'en', 'Shore Cafe', 'Original description.'),
  ('97300000-0000-4000-8000-000000000002', 'is', 'Strandgarður', 'Upprunaleg lýsing.'),
  ('97300000-0000-4000-8000-000000000002', 'en', 'Shore Park', 'Original description.');

insert into private.access_conditions (
  id, place_id, access_area, restraint_condition, dog_eligibility, availability_state,
  availability_window, permission_requirement, created_by, created_at
) values (
  '97400000-0000-4000-8000-000000000001', '97300000-0000-4000-8000-000000000001', 'indoors',
  'leash_required', '{"scope":"all_dogs"}'::jsonb, 'not_stated', '{}'::jsonb,
  'standing_permission', '97000000-0000-4000-8000-000000000003', '2026-01-01T00:00:00Z'
);

-- Reads that cross into the private schema while the session is standing in for a Member. The
-- test drives the real RPCs under the authenticated role, and those reads are the fixture
-- bookkeeping around them, not part of what is under test.

create function pg_temp.flag_id(requested_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select flag.id from private.place_flags flag where flag.request_id = requested_request_id;
$$;

create function pg_temp.place_snapshot(requested_place_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.snapshot_place(requested_place_id);
$$;

create function pg_temp.resolve_place_flag(
  requested_flag_id uuid,
  requested_outcome text,
  member_reason_is text,
  member_reason_en text,
  command_request_id uuid
)
returns table (
  flag_id uuid,
  status text,
  applied_access_condition_id uuid,
  dispute_id uuid,
  transition_id uuid
)
language plpgsql
as $$
declare
  current_item_version bigint;
  current_draft_version bigint;
begin
  select detail.item_version, detail.draft_version
  into current_item_version, current_draft_version
  from public.get_moderation_place_flag(requested_flag_id) detail;

  return query
  select * from public.resolve_place_flag(
    requested_flag_id, requested_outcome, current_item_version, current_draft_version,
    member_reason_is, member_reason_en, null, null, null, null, command_request_id
  );
end;
$$;

-- The target kind and the shapes it may take ----------------------------------------------------

select ok(
  'place' = any (enum_range(null::private.place_flag_target_kind)::text[]),
  'The whole Place is a flag target kind the schema knows'
);

select lives_ok(
  $$
    insert into private.place_flags (
      id, member_id, kind, place_id, target_kind, target_field, access_condition_id,
      current_value_snapshot, report_reason, explanation, evidence, request_id
    ) values (
      '97500000-0000-4000-8000-000000000099', '97000000-0000-4000-8000-000000000002', 'report',
      '97300000-0000-4000-8000-000000000001', 'place', null, null,
      '{"locality":"Hafnarfjörður"}'::jsonb, 'closed', 'Probe.', '{}'::jsonb,
      '97700000-0000-4000-8000-000000000099'
    )
  $$,
  'A Report against the whole Place carries no field and no Condition, and the shape accepts it'
);

delete from private.place_flags where id = '97500000-0000-4000-8000-000000000099';

select throws_ok(
  $$
    insert into private.place_flags (
      member_id, kind, place_id, target_kind, target_field, access_condition_id,
      current_value_snapshot, report_reason, explanation, evidence, request_id
    ) values (
      '97000000-0000-4000-8000-000000000002', 'report', '97300000-0000-4000-8000-000000000001',
      'place', 'name', null, '{}'::jsonb, 'closed', 'Probe.', '{}'::jsonb,
      '97700000-0000-4000-8000-000000000098'
    )
  $$,
  '23514', null,
  'A place target carrying a field is refused: the claim is about the Place, not one fact'
);

select throws_ok(
  $$
    insert into private.place_flags (
      member_id, kind, place_id, target_kind, target_field, access_condition_id,
      current_value_snapshot, report_reason, explanation, evidence, request_id
    ) values (
      '97000000-0000-4000-8000-000000000002', 'report', '97300000-0000-4000-8000-000000000001',
      'place', null, '97400000-0000-4000-8000-000000000001', '{}'::jsonb, 'closed', 'Probe.',
      '{}'::jsonb, '97700000-0000-4000-8000-000000000097'
    )
  $$,
  '23514', null,
  'A place target carrying an Access Condition is refused for the same reason'
);

select throws_ok(
  $$
    insert into private.place_flags (
      member_id, kind, place_id, target_kind, target_field, access_condition_id,
      current_value_snapshot, proposed_value, explanation, evidence, request_id
    ) values (
      '97000000-0000-4000-8000-000000000002', 'correction', '97300000-0000-4000-8000-000000000001',
      'place', null, null, '{}'::jsonb, '{"value":"x"}'::jsonb, 'Probe.', '{}'::jsonb,
      '97700000-0000-4000-8000-000000000096'
    )
  $$,
  '23514', null,
  'A Correction cannot target the whole Place: there is no single value to replace'
);

select throws_ok(
  $$
    insert into private.place_flags (
      member_id, kind, place_id, target_kind, target_field, access_condition_id,
      current_value_snapshot, report_reason, explanation, evidence, request_id
    ) values (
      '97000000-0000-4000-8000-000000000002', 'report', '97300000-0000-4000-8000-000000000001',
      'place_field', null, null, '{}'::jsonb, 'closed', 'Probe.', '{}'::jsonb,
      '97700000-0000-4000-8000-000000000095'
    )
  $$,
  '23514', null,
  'The existing arms are untouched: a place_field target still needs its field'
);

-- The place snapshot ----------------------------------------------------------------------------

select is(
  private.snapshot_place('97300000-0000-4000-8000-000000000001'),
  jsonb_build_object(
    'name', jsonb_build_object('is', 'Strandkaffi', 'en', 'Shore Cafe'),
    'category', 'cafe',
    'locality', 'Hafnarfjörður'
  ),
  'The snapshot holds what identified the Place at report time, in both locales'
);

select is(
  private.snapshot_place('97300000-0000-4000-8000-000000000002'),
  null::jsonb,
  'A Place nobody can read is not a Place anybody can report'
);

-- The command path ------------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select lives_ok(
  $$
    select * from public.submit_place_report(
      jsonb_build_object(
        'place_id', '97300000-0000-4000-8000-000000000001',
        'target_kind', 'place',
        'target_field', null,
        'access_condition_id', null,
        'explanation', 'The gate was chained shut.',
        'evidence', jsonb_build_object(
          'kind', 'member_report', 'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:00:00Z', 'source_url', null,
          'source_citation', 'Reported closed from the place card.',
          'source_metadata', jsonb_build_object(
            'submissionProfile', 'inline-v1', 'surface', 'place-card', 'memberNoteProvided', true
          )
        ),
        'report_reason', 'closed', 'is_safety_concern', false
      ),
      '97700000-0000-4000-8000-000000000001'
    )
  $$,
  'A place-level closed Report reaches the flag table through the command path'
);

reset role;

select ok(
  exists (
    select 1 from private.place_flags flag
    where flag.request_id = '97700000-0000-4000-8000-000000000001'
      and flag.target_kind = 'place'
      and flag.target_field is null
      and flag.access_condition_id is null
      and flag.report_reason = 'closed'
      and not flag.is_safety_concern
      and flag.proposed_value is null
  ),
  'The stored Report addresses the whole Place and alleges rather than proposes'
);

select is(
  (
    select flag.current_value_snapshot from private.place_flags flag
    where flag.request_id = '97700000-0000-4000-8000-000000000001'
  ),
  private.snapshot_place('97300000-0000-4000-8000-000000000001'),
  'The Report records what the Place was when it was raised'
);

set local role authenticated;

select throws_ok(
  $$
    select * from public.submit_place_correction(
      jsonb_build_object(
        'place_id', '97300000-0000-4000-8000-000000000001',
        'target_kind', 'place',
        'explanation', 'Everything is wrong.',
        'evidence', jsonb_build_object(
          'kind', 'member_report', 'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:01:00Z', 'source_url', null,
          'source_citation', 'Probe.', 'source_metadata', '{}'::jsonb
        ),
        'proposed_value', jsonb_build_object('value', 'x')
      ),
      '97700000-0000-4000-8000-000000000090'
    )
  $$,
  '22023', null,
  'The command path refuses a Correction on the whole Place before the constraint has to'
);

select throws_ok(
  $$
    select * from public.submit_place_report(
      jsonb_build_object(
        'place_id', '97300000-0000-4000-8000-000000000001',
        'target_kind', 'place',
        'target_field', 'name',
        'explanation', 'The gate was chained shut.',
        'evidence', jsonb_build_object(
          'kind', 'member_report', 'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:02:00Z', 'source_url', null,
          'source_citation', 'Probe.', 'source_metadata', '{}'::jsonb
        ),
        'report_reason', 'closed'
      ),
      '97700000-0000-4000-8000-000000000089'
    )
  $$,
  '22023', null,
  'A place-level Report naming a field is refused as an invalid target'
);

select throws_ok(
  $$
    select * from public.submit_place_report(
      jsonb_build_object(
        'place_id', '97300000-0000-4000-8000-000000000001',
        'target_kind', 'place',
        'access_condition_id', '97400000-0000-4000-8000-000000000001',
        'explanation', 'The gate was chained shut.',
        'evidence', jsonb_build_object(
          'kind', 'member_report', 'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:03:00Z', 'source_url', null,
          'source_citation', 'Probe.', 'source_metadata', '{}'::jsonb
        ),
        'report_reason', 'closed'
      ),
      '97700000-0000-4000-8000-000000000088'
    )
  $$,
  '22023', null,
  'A place-level Report naming an Access Condition is refused as an invalid target'
);

select throws_ok(
  $$
    select * from public.submit_place_report(
      jsonb_build_object(
        'place_id', '97300000-0000-4000-8000-000000000002',
        'target_kind', 'place',
        'explanation', 'The gate was chained shut.',
        'evidence', jsonb_build_object(
          'kind', 'member_report', 'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:04:00Z', 'source_url', null,
          'source_citation', 'Probe.', 'source_metadata', '{}'::jsonb
        ),
        'report_reason', 'closed'
      ),
      '97700000-0000-4000-8000-000000000087'
    )
  $$,
  '22023', null,
  'An unpublished Place snapshots to nothing, so a Report on it is a target that was not found'
);

-- Reports of different reasons are different claims ---------------------------------------------

select is(
  (
    select report.flag_id from public.submit_place_report(
      jsonb_build_object(
        'place_id', '97300000-0000-4000-8000-000000000001',
        'target_kind', 'place',
        'explanation', 'Still chained shut a day later.',
        'evidence', jsonb_build_object(
          'kind', 'member_report', 'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:05:00Z', 'source_url', null,
          'source_citation', 'Reported closed from the place card.',
          'source_metadata', jsonb_build_object(
            'submissionProfile', 'inline-v1', 'surface', 'place-card', 'memberNoteProvided', true
          )
        ),
        'report_reason', 'closed', 'is_safety_concern', false
      ),
      '97700000-0000-4000-8000-000000000002'
    ) report
  ),
  pg_temp.flag_id('97700000-0000-4000-8000-000000000001'),
  'A repeated closed Report inside the merge window joins the open one instead of flooding'
);

select isnt(
  (
    select report.flag_id from public.submit_place_report(
      jsonb_build_object(
        'place_id', '97300000-0000-4000-8000-000000000001',
        'target_kind', 'place',
        'explanation', 'There is a new sign giving a new address.',
        'evidence', jsonb_build_object(
          'kind', 'member_report', 'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:06:00Z', 'source_url', null,
          'source_citation', 'Reported moved from the place card.',
          'source_metadata', jsonb_build_object(
            'submissionProfile', 'inline-v1', 'surface', 'place-card', 'memberNoteProvided', false
          )
        ),
        'report_reason', 'moved', 'is_safety_concern', false
      ),
      '97700000-0000-4000-8000-000000000003'
    ) report
  ),
  pg_temp.flag_id('97700000-0000-4000-8000-000000000001'),
  'A moved Report is a different claim from a closed one, and the merge predicate says so'
);

select isnt(
  (
    select report.flag_id from public.submit_place_report(
      jsonb_build_object(
        'place_id', '97300000-0000-4000-8000-000000000001',
        'target_kind', 'place',
        'explanation', 'Loose dogs in the yard and no fence.',
        'evidence', jsonb_build_object(
          'kind', 'member_report', 'source_label', 'Member report from the place page',
          'observed_at', '2026-07-25T09:07:00Z', 'source_url', null,
          'source_citation', 'Reported unsafe for dogs from the place card.',
          'source_metadata', jsonb_build_object(
            'submissionProfile', 'inline-v1', 'surface', 'place-card', 'memberNoteProvided', false
          )
        ),
        'report_reason', 'unsafe', 'is_safety_concern', true
      ),
      '97700000-0000-4000-8000-000000000004'
    ) report
  ),
  pg_temp.flag_id('97700000-0000-4000-8000-000000000001'),
  'An escalation to unsafe is its own claim and never folds into the closed one'
);

reset role;

select is(
  (
    select count(*) from private.place_flags flag
    where flag.place_id = '97300000-0000-4000-8000-000000000001'
      and flag.target_kind = 'place'
      and flag.status in ('submitted', 'needs_information')
  ),
  3::bigint,
  'Three reasons on one Place are three open Reports, which is what per-reason suppression needs'
);

select is(
  (
    select array_agg(flag.report_reason::text order by flag.report_reason::text)
      filter (where flag.is_safety_concern)
    from private.place_flags flag
    where flag.place_id = '97300000-0000-4000-8000-000000000001' and flag.target_kind = 'place'
  ),
  array['unsafe'],
  'Only the unsafe Report carries the safety bit, and it carries it without Moderator inference'
);

set local role authenticated;

-- The pending read ------------------------------------------------------------------------------

select is(
  (
    select array_agg(pending.report_reason order by pending.report_reason)
    from public.list_my_open_place_flags('97300000-0000-4000-8000-000000000001') pending
    where pending.target_kind = 'place'
  ),
  array['closed', 'moved', 'unsafe'],
  'The pending read returns every place-level Report with the reason that distinguishes it'
);

select ok(
  not exists (
    select 1 from public.list_my_open_place_flags('97300000-0000-4000-8000-000000000001') pending
    where pending.target_kind = 'place'
      and (pending.target_field is not null or pending.access_condition_id is not null)
  ),
  'A pending place-level Report addresses nothing narrower than the Place'
);

reset role;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (
    select count(*)
    from public.list_my_open_place_flags('97300000-0000-4000-8000-000000000001')
  ),
  0::bigint,
  'Another Member sees none of them: the read stays caller-scoped'
);

-- The Moderation reads --------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select ok(
  exists (
    select 1 from public.list_moderation_place_flags('actionable', null, null, null, null, 50) queue
    where queue.target_kind = 'place'
      and queue.report_reason = 'closed'
      and queue.target_field is null
      and queue.access_condition_id is null
  ),
  'The Moderation queue carries the place-level Report and the reason it was raised for'
);

select ok(
  exists (
    select 1 from public.get_moderation_place_flag(
      pg_temp.flag_id('97700000-0000-4000-8000-000000000001')
    ) detail
    where detail.target_kind = 'place'
      and detail.target_field is null
      and detail.access_condition_id is null
      and detail.proposed_value is null
      and detail.report_reason = 'closed'
  ),
  'The detail read returns the place-level target without a signature change'
);

select is(
  (
    select detail.current_value_snapshot from public.get_moderation_place_flag(
      pg_temp.flag_id('97700000-0000-4000-8000-000000000001')
    ) detail
  ),
  pg_temp.place_snapshot('97300000-0000-4000-8000-000000000001'),
  'A Moderator reads the Place as the Member saw it, not as it stands now'
);

-- Pinned deliberately, because the null is currently a side effect rather than a decision:
-- `get_moderation_place_flag` falls to its Access Condition branch for any target kind that is not
-- `place_field`, and `snapshot_access_condition(null, place_id)` selects zero rows. The behaviour is
-- right - the whole Place addresses no single live value - so this asserts it before a future
-- recreation of the function states it with an explicit case arm.
select is(
  (
    select detail.current_live_value from public.get_moderation_place_flag(
      pg_temp.flag_id('97700000-0000-4000-8000-000000000001')
    ) detail
  ),
  null::jsonb,
  'A whole-Place claim names no live value, because it addresses no single fact'
);

select ok(
  exists (
    select 1 from public.get_moderation_place_flag(
      pg_temp.flag_id('97700000-0000-4000-8000-000000000004')
    ) detail
    where detail.is_safety_concern and detail.report_reason = 'unsafe'
  ),
  'The escalation reaches Moderation on the record rather than in the explanation'
);

-- Resolution ------------------------------------------------------------------------------------

reset role;

select lives_ok(
  $$
    select private.place_flag_resolution_baseline(
      pg_temp.flag_id('97700000-0000-4000-8000-000000000001')
    )
  $$,
  'The resolution baseline does not choke on a target kind it has no branch for'
);

select ok(
  (
    select baseline -> 'application_payload' = 'null'::jsonb
      and baseline -> 'dispute_command' = 'null'::jsonb
      and baseline -> 'transition_command' <> 'null'::jsonb
    from private.place_flag_resolution_baseline(
      pg_temp.flag_id('97700000-0000-4000-8000-000000000001')
    ) baseline
  ),
  'A place-level Report offers no value to apply and no Verification to dispute, only the lifecycle'
);

select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select throws_ok(
  format(
    $fmt$
      select * from pg_temp.resolve_place_flag(
        %L, 'dispute_opened', 'Ástæða', 'Reason', '97800000-0000-4000-8000-000000000001'
      )
    $fmt$,
    pg_temp.flag_id('97700000-0000-4000-8000-000000000001')
  ),
  '22023', null,
  'A dispute still needs an Access Condition target, which the new kind neither gains nor breaks'
);

select is(
  (
    select resolution.status from pg_temp.resolve_place_flag(
      pg_temp.flag_id('97700000-0000-4000-8000-000000000004'),
      'confirmed_useful', null, null, '97800000-0000-4000-8000-000000000002'
    ) resolution
  ),
  'confirmed_useful',
  'A place-level Report can be confirmed useful, which is the outcome a Report is for'
);

select is(
  (
    select resolution.status from pg_temp.resolve_place_flag(
      pg_temp.flag_id('97700000-0000-4000-8000-000000000001'),
      'place_inactivated', 'Staðurinn er lokaður.', 'The place has closed.',
      '97800000-0000-4000-8000-000000000003'
    ) resolution
  ),
  'place_inactivated',
  'A closed Report resolves into the place lifecycle, which is the whole point of raising one'
);

reset role;

select is(
  (
    select place.lifecycle::text from private.places place
    where place.id = '97300000-0000-4000-8000-000000000001'
  ),
  'inactive',
  'The Place the Report was about is the Place the resolution inactivated'
);

select * from finish();

rollback;
