begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_table('private', 'moderation_drafts', 'Moderation has one shared draft-head table');
select has_table(
  'private',
  'moderation_draft_revisions',
  'Moderation preserves immutable draft snapshots'
);
select has_table('private', 'candidate_reviews', 'Candidate review state is separate from Place lifecycle');
select has_table(
  'private',
  'candidate_review_events',
  'Candidate review decisions have an append-only history'
);

select has_function(
  'public',
  'save_candidate_place_moderation_draft',
  array['uuid', 'bigint', 'bigint', 'text', 'jsonb', 'uuid'],
  'Candidate sections save through one version-checked draft command'
);
select has_function(
  'public',
  'save_place_suggestion_moderation_draft',
  array['uuid', 'bigint', 'bigint', 'text', 'jsonb', 'uuid'],
  'Suggestion sections use the shared draft contract'
);
select has_function(
  'public',
  'save_place_flag_moderation_draft',
  array['uuid', 'bigint', 'bigint', 'text', 'jsonb', 'uuid'],
  'Correction and Report sections use the shared draft contract'
);
select has_function(
  'public',
  'decide_candidate_place',
  array['uuid', 'text', 'bigint', 'bigint', 'text', 'text', 'text', 'text', 'uuid'],
  'Candidate deferral, rejection, and reopening share one state command'
);

insert into auth.users (id, email)
values
  ('93100000-0000-4000-8000-000000000001', 'workbench-moderator@example.invalid'),
  ('93100000-0000-4000-8000-000000000002', 'workbench-moderator-two@example.invalid');

insert into security.role_grants (user_id, role)
values
  ('93100000-0000-4000-8000-000000000001', 'moderator'),
  ('93100000-0000-4000-8000-000000000002', 'moderator');

insert into private.member_accounts (user_id)
values ('93100000-0000-4000-8000-000000000001');

insert into private.operators (id, name)
values ('93110000-0000-4000-8000-000000000001', 'Workbench operator');

insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude,
  geometry_precision, geometry_source
)
values (
  '93120000-0000-4000-8000-000000000001', 'Draftgata 1', 'Reykjavik', '101',
  'reykjavik', 64.1466, -21.9426, 'moderator_confirmed_point', 'Workbench fixture'
);

insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, version, created_by, created_at
)
values (
  '93130000-0000-4000-8000-000000000001',
  '93110000-0000-4000-8000-000000000001',
  '93120000-0000-4000-8000-000000000001',
  'dog_access_destination', 'candidate', 'cafe', 1,
  '93100000-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z'
);

insert into private.place_translations (place_id, locale, name, description)
values
  ('93130000-0000-4000-8000-000000000001', 'is', 'Drög', 'Lýsing'),
  ('93130000-0000-4000-8000-000000000001', 'en', 'Draft', 'Description');

insert into private.place_suggestions (id, member_id, request_id, proposal)
values (
  '93160000-0000-4000-8000-000000000001',
  '93100000-0000-4000-8000-000000000001',
  '93161000-0000-4000-8000-000000000001',
  '{
    "purpose":"dog_access_destination",
    "operator_name":"Workbench suggestion",
    "category":"cafe",
    "location":{
      "address_line":"Tillögugata 1",
      "locality":"Reykjavik",
      "postal_code":"101",
      "municipality":"reykjavik",
      "latitude":64.147,
      "longitude":-21.943
    },
    "translations":{
      "is":{"name":"Tillaga","description":"Lýsing."},
      "en":{"name":"Suggestion","description":"Description."}
    },
    "opening_hours":{},
    "dog_amenities":[],
    "access_condition":{
      "access_area":"outdoors",
      "restraint_condition":"leash_required",
      "dog_eligibility":{"scope":"all_dogs"},
      "availability_window":{},
      "permission_requirement":"standing_permission"
    },
    "evidence":{
      "kind":"member_report",
      "source_url":"https://example.invalid/workbench",
      "source_label":"Workbench source",
      "observed_at":"2026-07-01T00:00:00Z",
      "explanation":"Dogs are explicitly allowed.",
      "source_metadata":{}
    }
  }'::jsonb
);

insert into private.place_flags (
  id, member_id, kind, place_id, target_kind, target_field,
  current_value_snapshot, report_reason, explanation, evidence, request_id
)
values (
  '93170000-0000-4000-8000-000000000001',
  '93100000-0000-4000-8000-000000000001', 'report',
  '93130000-0000-4000-8000-000000000001', 'place_field', 'phone',
  '{}'::jsonb, 'inaccurate', 'Workbench report', '{}'::jsonb,
  '93171000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub', '93100000-0000-4000-8000-000000000001', true);
set local role authenticated;

select results_eq(
  $$
    select target_id, draft_version
    from public.save_candidate_place_moderation_draft(
      '93130000-0000-4000-8000-000000000001', 1, 0, 'identity',
      '{"operator":{"name":"Edited operator"},"category":"cafe"}'::jsonb,
      '93140000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values ('93130000-0000-4000-8000-000000000001'::uuid, 1::bigint) $$,
  'The first Candidate edit creates shared draft version one'
);

reset role;

select is(
  (
    select payload #>> '{operator,name}'
    from private.moderation_drafts
    where candidate_place_id = '93130000-0000-4000-8000-000000000001'
  ),
  'Edited operator',
  'The shared draft head contains the saved aggregate'
);

select is(
  (
    select count(*)
    from private.moderation_draft_revisions revision
    join private.moderation_drafts draft on draft.id = revision.draft_id
    where draft.candidate_place_id = '93130000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'The save appends one immutable snapshot'
);

set local role authenticated;

select throws_ok(
  $$
    select * from public.save_candidate_place_moderation_draft(
      '93130000-0000-4000-8000-000000000001', 1, 0, 'identity',
      '{"operator":{"name":"Stale overwrite"}}'::jsonb,
      '93140000-0000-4000-8000-000000000002'
    )
  $$,
  '40001',
  'Moderation draft changed',
  'A stale Moderator cannot overwrite a shared draft'
);

reset role;
select set_config('request.jwt.claim.sub', '93100000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (
    select draft_version
    from public.save_candidate_place_moderation_draft(
      '93130000-0000-4000-8000-000000000001', 1, 1, 'identity',
      '{"operator":{"name":"Second moderator"},"category":"cafe"}'::jsonb,
      '93140000-0000-4000-8000-000000000003'
    )
  ),
  2::bigint,
  'Another Moderator can advance the same shared draft with the current version'
);

select results_eq(
  $$
    select operator_name, candidate_status, item_version, draft_version, readiness_state
    from public.get_moderation_place_review(
      '93130000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values ('Second moderator'::text, 'pending'::text, 1::bigint, 2::bigint, 'blocked'::text) $$,
  'Candidate review projects the shared draft, state versions, and concise readiness'
);

select is(
  (
    select draft_version
    from public.save_place_suggestion_moderation_draft(
      '93160000-0000-4000-8000-000000000001', 1, 0, 'identity',
      '{"operator_name":"Suggestion draft"}'::jsonb,
      '93140000-0000-4000-8000-000000000004'
    )
  ),
  1::bigint,
  'Suggestions save through the same shared optimistic draft mechanism'
);

select is(
  (
    select draft_version
    from public.save_place_flag_moderation_draft(
      '93170000-0000-4000-8000-000000000001', 1, 0, 'proposed-change',
      '{"application_payload":{"field_value":{"value":"555-0100"}}}'::jsonb,
      '93140000-0000-4000-8000-000000000005'
    )
  ),
  1::bigint,
  'Corrections and Reports save through the same shared optimistic draft mechanism'
);

select is(
  (
    select status
    from public.decide_candidate_place(
      '93130000-0000-4000-8000-000000000001', 'rejected', 1, 2,
      'insufficient_evidence', 'Ekki nægar heimildir.', 'Insufficient evidence.',
      'Can be reopened if better evidence arrives.',
      '93150000-0000-4000-8000-000000000001'
    )
  ),
  'rejected',
  'A Candidate can be rejected with a structured reason and explanation'
);

reset role;

select is(
  (
    select lifecycle::text
    from private.places
    where id = '93130000-0000-4000-8000-000000000001'
  ),
  'candidate',
  'Rejecting a Candidate does not delete or inactivate its Place aggregate'
);

set local role authenticated;

select is(
  (
    select count(*)
    from public.list_moderation_candidate_places('resolved', null, null, 20)
    where place_id = '93130000-0000-4000-8000-000000000001'
      and candidate_status = 'rejected'
  ),
  1::bigint,
  'A rejected Candidate moves to the resolved filter'
);

select is(
  (
    select status
    from public.decide_candidate_place(
      '93130000-0000-4000-8000-000000000001', 'reopen', 2, 2,
      null, null, null, null,
      '93150000-0000-4000-8000-000000000002'
    )
  ),
  'pending',
  'A rejected Candidate can be reopened without losing its draft'
);

reset role;

select is(
  (
    select count(*)
    from private.candidate_review_events
    where place_id = '93130000-0000-4000-8000-000000000001'
      and event_kind in ('rejected', 'reopened')
  ),
  2::bigint,
  'Rejection and reopening remain in Candidate history'
);

set local role authenticated;

select is(
  (
    select count(*)
    from public.list_moderation_candidate_places('actionable', null, null, 20)
    where place_id = '93130000-0000-4000-8000-000000000001'
      and candidate_status = 'pending'
  ),
  1::bigint,
  'A reopened Candidate returns to the actionable filter'
);

select ok(
  (
    select actionable_count >= 1 and deferred_count >= 0 and resolved_count >= 0
    from public.list_moderation_queue_summary()
    where queue_id = 'candidate-places'
  ),
  'Queue summaries expose actionable, deferred, and resolved totals'
);

reset role;

select throws_ok(
  $$
    update private.moderation_draft_revisions
    set payload = '{}'::jsonb
  $$,
  '55000',
  'Moderation draft revisions are append-only',
  'Draft history cannot be rewritten'
);

select * from finish();

rollback;
