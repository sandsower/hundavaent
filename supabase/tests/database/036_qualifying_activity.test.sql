begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_view(
  'private',
  'member_qualifying_activity',
  'Weekly rhythm has one normalized private qualifying-activity seam'
);
select has_table(
  'private',
  'activity_integrity_observations',
  'Replay and duplicate guardrails use one privacy-minimal private table'
);
select has_function(
  'private',
  'lock_member_qualifying_activity',
  array['uuid'],
  'Every qualifying source shares one member-wide lock'
);
select has_function(
  'private',
  'get_member_qualifying_action_recognition',
  array['uuid', 'text', 'uuid', 'boolean'],
  'Source commands use one authoritative recognition helper'
);
select has_function(
  'private',
  'detach_member_activity_integrity_observations',
  array['uuid'],
  'Account deletion has a narrow integrity cleanup seam'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.member_qualifying_activity',
    'select'
  )
  and not has_table_privilege(
    'service_role',
    'private.member_qualifying_activity',
    'select'
  ),
  'Neither Members nor the service role can inspect normalized member activity directly'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'private.activity_integrity_observations',
    'select,insert,update,delete'
  )
  and not has_table_privilege(
    'service_role',
    'private.activity_integrity_observations',
    'select,insert,update,delete'
  ),
  'Integrity observations have no direct application-role data surface'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.get_member_qualifying_action_recognition(uuid,text,uuid,boolean)',
    'execute'
  ),
  'Members cannot invoke the private recognition primitive'
);

select ok(
  pg_get_function_result(
    'public.record_check_in(uuid,text,uuid)'::regprocedure
  ) like '%qualifying_action_recorded boolean%'
  and pg_get_function_result(
    'public.record_check_in(uuid,text,uuid)'::regprocedure
  ) like '%activated_current_week boolean%',
  'Check-in returns authoritative qualifying-action recognition'
);
select ok(
  pg_get_function_result(
    'public.save_inline_dog_friendliness_rating(uuid,integer,integer,integer,integer,integer,uuid,boolean,text,text)'::regprocedure
  ) like '%qualifying_action_recorded boolean%',
  'Rating returns authoritative qualifying-action recognition'
);
select ok(
  pg_get_function_result(
    'public.submit_place_suggestion(jsonb,uuid)'::regprocedure
  ) like '%qualifying_action_recorded boolean%',
  'Suggestion returns authoritative qualifying-action recognition'
);
select ok(
  pg_get_function_result(
    'public.submit_place_correction(jsonb,uuid)'::regprocedure
  ) like '%qualifying_action_recorded boolean%'
  and pg_get_function_result(
    'public.submit_place_report(jsonb,uuid)'::regprocedure
  ) like '%qualifying_action_recorded boolean%',
  'Correction and Report return authoritative qualifying-action recognition'
);
select ok(
  pg_get_function_arguments(
    'public.submit_place_correction(jsonb,uuid)'::regprocedure
  ) like 'command_payload jsonb, command_request_id uuid%'
  and pg_get_function_arguments(
    'public.submit_place_report(jsonb,uuid)'::regprocedure
  ) like 'command_payload jsonb, command_request_id uuid%',
  'Correction and Report preserve the established command_payload named-argument contract'
);

insert into auth.users (id)
values
  ('76800000-0000-4000-8000-000000000001'),
  ('76800000-0000-4000-8000-000000000002');

insert into private.member_accounts (user_id)
values
  ('76800000-0000-4000-8000-000000000001'),
  ('76800000-0000-4000-8000-000000000002');

insert into security.role_grants (user_id, role)
values
  ('76800000-0000-4000-8000-000000000001', 'member'),
  ('76800000-0000-4000-8000-000000000002', 'member');

insert into private.check_ins (
  id,
  member_id,
  place_id,
  proximity_confirmed,
  request_id,
  checked_in_at
) values (
  '76810000-0000-4000-8000-000000000001',
  '76800000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003',
  'unknown',
  '76820000-0000-4000-8000-000000000001',
  '2026-07-06T12:00:00Z'
);

insert into private.dog_friendliness_ratings (
  id,
  member_id,
  place_id,
  overall_score,
  last_request_id,
  rated_at
) values (
  '76830000-0000-4000-8000-000000000001',
  '76800000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003',
  4,
  '76840000-0000-4000-8000-000000000001',
  '2026-07-13T12:00:00Z'
);

insert into private.dog_friendliness_rating_events (
  id,
  member_id,
  place_id,
  event_kind,
  overall_score,
  actor_id,
  request_id,
  occurred_at
) values
  (
    '76850000-0000-4000-8000-000000000001',
    '76800000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003',
    'submitted',
    3,
    '76800000-0000-4000-8000-000000000001',
    '76840000-0000-4000-8000-000000000002',
    '2026-07-13T09:00:00Z'
  ),
  (
    '76850000-0000-4000-8000-000000000002',
    '76800000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003',
    'updated',
    4,
    '76800000-0000-4000-8000-000000000001',
    '76840000-0000-4000-8000-000000000003',
    '2026-07-13T12:00:00Z'
  );

select is(
  (
    select count(*)
    from private.member_qualifying_activity as activity
    where activity.member_id = '76800000-0000-4000-8000-000000000001'
      and activity.source_kind = 'check_in'
  ),
  1::bigint,
  'A genuine Check-in is one normalized qualifying action'
);
select is(
  (
    select count(*)
    from private.member_qualifying_activity as activity
    where activity.member_id = '76800000-0000-4000-8000-000000000001'
      and activity.source_kind = 'rating'
  ),
  1::bigint,
  'Multiple material Rating events for one Place and Reykjavík week normalize to one action'
);

insert into private.activity_integrity_observations (
  member_id,
  source_kind,
  source_id,
  signal_kind,
  request_id,
  observed_at
) values (
  '76800000-0000-4000-8000-000000000001',
  'check_in',
  '76810000-0000-4000-8000-000000000001',
  'duplicate_check_in',
  '76820000-0000-4000-8000-000000000002',
  '2026-07-06T13:00:00Z'
);

select is(
  (
    select count(*)
    from private.member_qualifying_activity as activity
    where activity.member_id = '76800000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'Integrity observations never become qualifying activity'
);
select throws_ok(
  $$
    update private.activity_integrity_observations
    set observed_at = observed_at + interval '1 second'
  $$,
  '55000',
  'Activity integrity observations are immutable',
  'Integrity observations reject mutation'
);

select is(
  private.detach_member_activity_integrity_observations(
    '76800000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'Account deletion can remove caller-owned integrity observations'
);

select set_config(
  'request.jwt.claim.sub',
  '76800000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select is(
  (
    select count(*)
    from public.list_current_member_weekly_rhythm()
  ),
  8::bigint,
  'The source-neutral weekly trail still returns exactly eight weeks'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  '76800000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.save_inline_dog_friendliness_rating(
      '30000000-0000-4000-8000-000000000003',
      4,
      null,
      null,
      null,
      null,
      '76840000-0000-4000-8000-000000000004',
      false,
      null,
      null
    )
  $$,
  'An inline Rating can establish a material request'
);
select lives_ok(
  $$
    select public.save_inline_dog_friendliness_rating(
      '30000000-0000-4000-8000-000000000003',
      4,
      null,
      null,
      null,
      null,
      '76840000-0000-4000-8000-000000000004',
      false,
      null,
      null
    )
  $$,
  'Replaying the exact inline Rating request remains idempotent'
);

reset role;

select is(
  (
    select count(*)::bigint
    from private.activity_integrity_observations as observation
    where observation.member_id = '76800000-0000-4000-8000-000000000002'
      and observation.source_kind = 'rating'
      and observation.request_id = '76840000-0000-4000-8000-000000000004'
      and observation.signal_kind = 'request_replay'
  ),
  1::bigint,
  'An exact inline Rating replay is recorded once for aggregate guardrails'
);

select * from finish();

rollback;
