begin;

create extension if not exists pgtap with schema extensions;

alter table private.locations alter column geometry_precision set default 'moderator_confirmed_point';
alter table private.locations alter column geometry_source set default 'Moderation draft test fixture';

select no_plan();

select has_function(
  'public',
  'resolve_place_suggestion',
  array[
    'uuid', 'text', 'bigint', 'bigint', 'text', 'text', 'text', 'jsonb',
    'uuid', 'uuid', 'uuid', 'boolean', 'uuid'
  ],
  'Suggestion resolution requires both optimistic versions'
);

select has_function(
  'public',
  'resolve_place_flag',
  array[
    'uuid', 'text', 'bigint', 'bigint', 'text', 'text', 'text', 'jsonb',
    'jsonb', 'jsonb', 'uuid'
  ],
  'Correction and Report resolution requires both optimistic versions'
);

select ok(
  to_regprocedure(
    'public.resolve_place_suggestion(uuid,text,text,text,text,jsonb,uuid,uuid,uuid,boolean,uuid)'
  ) is null,
  'The unversioned Suggestion resolver is no longer public'
);

select ok(
  to_regprocedure(
    'public.resolve_place_flag(uuid,text,text,text,text,jsonb,jsonb,jsonb,uuid)'
  ) is null,
  'The unversioned Correction and Report resolver is no longer public'
);

insert into auth.users (id, email)
values
  ('93300000-0000-4000-8000-000000000001', 'draft-consumption-member@example.invalid'),
  ('93300000-0000-4000-8000-000000000002', 'draft-consumption-moderator@example.invalid');

insert into private.member_accounts (user_id)
values
  ('93300000-0000-4000-8000-000000000001'),
  ('93300000-0000-4000-8000-000000000002');

insert into security.role_grants (user_id, role)
values
  ('93300000-0000-4000-8000-000000000001', 'member'),
  ('93300000-0000-4000-8000-000000000002', 'moderator');

insert into private.operators (id, name)
values ('93310000-0000-4000-8000-000000000001', 'Correction operator');

insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude
)
values (
  '93320000-0000-4000-8000-000000000001', 'Correctiongata 1', 'Reykjavik', '101',
  'reykjavik', 64.1466, -21.9426
);

insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, phone, version,
  published_at, created_by
)
values (
  '93330000-0000-4000-8000-000000000001',
  '93310000-0000-4000-8000-000000000001',
  '93320000-0000-4000-8000-000000000001',
  'dog_access_destination', 'published', 'cafe', '+354 555 0100', 1,
  '2026-07-01T00:00:00Z', '93300000-0000-4000-8000-000000000002'
);

insert into private.place_translations (place_id, locale, name, description)
values
  ('93330000-0000-4000-8000-000000000001', 'is', 'Leiðrétting', 'Lýsing'),
  ('93330000-0000-4000-8000-000000000001', 'en', 'Correction', 'Description');

insert into private.access_conditions (
  id, place_id, access_area, restraint_condition, permission_requirement, created_by, created_at
)
values (
  '93370000-0000-4000-8000-000000000001',
  '93330000-0000-4000-8000-000000000001',
  'indoors', 'leash_required', 'standing_permission',
  '93300000-0000-4000-8000-000000000002', '2026-07-01T00:00:00Z'
);

insert into private.verifications (
  id, access_condition_id, status, verified_by, verified_at, freshness_until
)
values (
  '93371000-0000-4000-8000-000000000001',
  '93370000-0000-4000-8000-000000000001',
  'verified', '93300000-0000-4000-8000-000000000002',
  '2026-07-01T00:00:00Z', '2030-07-01T00:00:00Z'
);

insert into private.place_suggestions (id, member_id, request_id, proposal)
values (
  '93340000-0000-4000-8000-000000000001',
  '93300000-0000-4000-8000-000000000001',
  '93341000-0000-4000-8000-000000000001',
  '{
    "purpose":"dog_access_destination",
    "operator_name":"Original suggestion operator",
    "category":"cafe",
    "location":{
      "address_line":"Suggestiongata 1",
      "locality":"Reykjavik",
      "postal_code":"101",
      "municipality":"reykjavik",
      "latitude":64.147,
      "longitude":-21.943
    },
    "translations":{
      "is":{"name":"Upprunaleg tillaga","description":"Upprunaleg lýsing."},
      "en":{"name":"Original suggestion","description":"Original description."}
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
      "source_url":"https://example.invalid/suggestion",
      "source_label":"Suggestion source",
      "observed_at":"2026-07-01T00:00:00Z",
      "explanation":"Dogs are explicitly allowed.",
      "source_metadata":{}
    }
  }'::jsonb
);

insert into private.place_flags (
  id, member_id, kind, place_id, target_kind, target_field, access_condition_id,
  current_value_snapshot, proposed_value, report_reason, explanation, evidence, request_id
)
values (
  '93350000-0000-4000-8000-000000000001',
  '93300000-0000-4000-8000-000000000001', 'correction',
  '93330000-0000-4000-8000-000000000001', 'place_field', 'phone', null,
  '{"value":"+354 555 0100"}'::jsonb,
  '{"value":"+354 555 0199"}'::jsonb,
  null,
  'The phone number changed.',
  '{
    "kind":"direct_observation",
    "source_url":"https://example.invalid/correction",
    "source_label":"Called the venue",
    "observed_at":"2026-07-15T00:00:00Z",
    "source_metadata":{}
  }'::jsonb,
  '93351000-0000-4000-8000-000000000001'
), (
  '93350000-0000-4000-8000-000000000002',
  '93300000-0000-4000-8000-000000000001', 'report',
  '93330000-0000-4000-8000-000000000001', 'access_condition', null,
  '93370000-0000-4000-8000-000000000001',
  '{"access_area":"indoors","restraint_condition":"leash_required"}'::jsonb,
  null,
  'inaccurate',
  'The posted access condition is inaccurate.',
  '{
    "kind":"member_report",
    "source_url":"https://example.invalid/report",
    "source_label":"Member report",
    "observed_at":"2026-07-15T00:00:00Z",
    "source_metadata":{}
  }'::jsonb,
  '93351000-0000-4000-8000-000000000002'
);

select set_config('request.jwt.claim.sub', '93300000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (
    select draft_version
    from public.save_place_suggestion_moderation_draft(
      '93340000-0000-4000-8000-000000000001', 1, 0, 'translations',
      '{"translations":{"en":{"name":"Reviewed suggestion"}}}'::jsonb,
      '93360000-0000-4000-8000-000000000001'
    )
  ),
  1::bigint,
  'A Suggestion section edit creates draft version one'
);

reset role;

select ok(
  (
    select payload ?& array[
      'purpose', 'operator_name', 'category', 'location', 'translations', 'opening_hours',
      'dog_amenities', 'access_condition', 'evidence'
    ]
      and payload #>> '{translations,en,name}' = 'Reviewed suggestion'
      and payload #>> '{translations,is,name}' = 'Upprunaleg tillaga'
    from private.moderation_drafts
    where suggestion_id = '93340000-0000-4000-8000-000000000001'
  ),
  'Suggestion drafts persist a complete canonical proposal snapshot'
);

set local role authenticated;

select throws_ok(
  $$
    select * from public.resolve_place_suggestion(
      '93340000-0000-4000-8000-000000000001', 'accepted', 1, 0,
      null, null, null, null, null, null, null, false,
      '93360000-0000-4000-8000-000000000002'
    )
  $$,
  '40001',
  'Moderation draft changed',
  'A stale Suggestion draft version rejects the entire resolution'
);

select throws_ok(
  $$
    select * from public.resolve_place_suggestion(
      '93340000-0000-4000-8000-000000000001', 'accepted', 1, 1,
      null, null, null, '{"purpose":"dog_access_destination"}'::jsonb,
      null, null, null, false,
      '93360000-0000-4000-8000-000000000003'
    )
  $$,
  '22023',
  'Legacy inline moderation content is not accepted',
  'Suggestion resolution rejects the old inline payload bypass'
);

create temporary table suggestion_resolution as
select * from public.resolve_place_suggestion(
  '93340000-0000-4000-8000-000000000001', 'accepted', 1, 1,
  null, null, null, null, null, null, null, false,
  '93360000-0000-4000-8000-000000000004'
);

select is(
  (select status from suggestion_resolution),
  'accepted',
  'Suggestion acceptance is frictionless when the locked draft is ready'
);

select results_eq(
  $$
    select status, candidate_place_id
    from public.resolve_place_suggestion(
      '93340000-0000-4000-8000-000000000001', 'accepted', 1, 1,
      null, null, null, null, null, null, null, false,
      '93360000-0000-4000-8000-000000000004'
    )
  $$,
  $$ select status, candidate_place_id from suggestion_resolution $$,
  'An exact Suggestion retry wins before terminal and version guards'
);

reset role;

select is(
  (
    select reviewed_proposal #>> '{translations,en,name}'
    from private.place_suggestions
    where id = '93340000-0000-4000-8000-000000000001'
  ),
  'Reviewed suggestion',
  'Suggestion acceptance consumes the locked draft snapshot'
);

select is(
  (
    select member_reason_is is null and member_reason_en is null
    from private.suggestion_status_events
    where suggestion_id = '93340000-0000-4000-8000-000000000001'
      and status = 'accepted'
  ),
  true,
  'Routine Suggestion acceptance does not fabricate Member-safe reasons'
);

set local role authenticated;

select is(
  (
    select draft_version
    from public.save_place_flag_moderation_draft(
      '93350000-0000-4000-8000-000000000001', 1, 0, 'application',
      '{"application_payload":{"field_value":{"value":"+354 555 0177"}}}'::jsonb,
      '93360000-0000-4000-8000-000000000005'
    )
  ),
  1::bigint,
  'A Correction section edit creates draft version one'
);

reset role;

select results_eq(
  $$
    select payload #>> '{application_payload,expected_version}',
      payload #>> '{application_payload,field_value,value}'
    from private.moderation_drafts
    where flag_id = '93350000-0000-4000-8000-000000000001'
  $$,
  $$ values ('1'::text, '+354 555 0177'::text) $$,
  'Correction drafts merge section edits into a complete action-ready envelope'
);

set local role authenticated;

select throws_ok(
  $$
    select * from public.resolve_place_flag(
      '93350000-0000-4000-8000-000000000001', 'applied', 1, 0,
      null, null, null, null, null, null,
      '93360000-0000-4000-8000-000000000006'
    )
  $$,
  '40001',
  'Moderation draft changed',
  'A stale Correction draft version rejects the entire resolution'
);

create temporary table flag_resolution as
select * from public.resolve_place_flag(
  '93350000-0000-4000-8000-000000000001', 'applied', 1, 1,
  null, null, null, null, null, null,
  '93360000-0000-4000-8000-000000000007'
);

select is(
  (select status from flag_resolution),
  'applied',
  'Correction application is frictionless when the locked draft is ready'
);

select results_eq(
  $$
    select status, applied_access_condition_id
    from public.resolve_place_flag(
      '93350000-0000-4000-8000-000000000001', 'applied', 1, 1,
      null, null, null, null, null, null,
      '93360000-0000-4000-8000-000000000007'
    )
  $$,
  $$ select status, applied_access_condition_id from flag_resolution $$,
  'An exact Correction retry wins before terminal and version guards'
);

reset role;

select is(
  (
    select phone from private.places
    where id = '93330000-0000-4000-8000-000000000001'
  ),
  '+354 555 0177',
  'Correction resolution consumes the locked draft envelope'
);

select is(
  (
    select member_reason_is is null and member_reason_en is null
    from private.place_flag_status_events
    where flag_id = '93350000-0000-4000-8000-000000000001'
      and status = 'applied'
  ),
  true,
  'Routine Correction application does not fabricate Member-safe reasons'
);

set local role authenticated;

select is(
  (
    select draft_version
    from public.save_place_flag_moderation_draft(
      '93350000-0000-4000-8000-000000000002', 1, 0, 'dispute',
      jsonb_build_object(
        'dispute_command', jsonb_build_object(
          'expected_verification_id', '93371000-0000-4000-8000-000000000001',
          'reason', 'The current verification conflicts with direct observation.',
          'evidence', jsonb_build_object(
            'kind', 'direct_observation',
            'source_url', 'https://example.invalid/dispute',
            'source_citation', null,
            'source_label', 'Dispute source',
            'observed_at', '2026-07-15T12:00:00Z',
            'source_metadata', '{}'::jsonb
          )
        )
      ),
      '93360000-0000-4000-8000-000000000008'
    )
  ),
  1::bigint,
  'A Report dispute edit creates draft version one'
);

reset role;

select is(
  (
    select payload #> '{dispute_command,evidence,source_metadata}'
    from private.moderation_drafts
    where flag_id = '93350000-0000-4000-8000-000000000002'
  ),
  '{}'::jsonb,
  'Deep draft merging preserves an empty evidence metadata object'
);

set local role authenticated;

create temporary table dispute_resolution as
select * from public.resolve_place_flag(
  '93350000-0000-4000-8000-000000000002', 'dispute_opened', 1, 1,
  'Málið var opnað eftir yfirferð.', 'The dispute was opened after review.',
  null, null, null, null,
  '93360000-0000-4000-8000-000000000009'
);

select is(
  (select status from dispute_resolution),
  'dispute_opened',
  'A dispute decision consumes evidence with empty source metadata'
);

select ok(
  (select dispute_id is not null from dispute_resolution),
  'A successful dispute decision records the opened dispute'
);

select * from finish();

rollback;
