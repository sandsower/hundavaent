begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select set_eq(
  $$select milestone from private.reached_contribution_milestones(49)$$,
  $$select null::integer where false$$,
  'Contribution continuation starts after Platinum, not before 50'
);

select set_eq(
  $$select milestone from private.reached_contribution_milestones(500)$$,
  $$values (50), (100), (250), (500)$$,
  'Continuation milestones are 50, 100, 250, then every 250'
);

insert into auth.users (id)
values
  ('c5000000-0000-4000-8000-000000000001'),
  ('c5000000-0000-4000-8000-000000000002');

insert into private.member_accounts (user_id)
values ('c5000000-0000-4000-8000-000000000001');

insert into security.role_grants (user_id, role)
values ('c5000000-0000-4000-8000-000000000001', 'member');

insert into private.achievement_policy (
  singleton, policy_version, credit_spacing_minutes, enabled, eligibility_started_at
)
values (true, 'continuation-test-v1', 15, true, now() - interval '1 year');

insert into private.place_suggestions (
  id, member_id, request_id, proposal, submitted_at
)
select
  md5('continuation-suggestion-' || number)::uuid,
  'c5000000-0000-4000-8000-000000000001',
  md5('continuation-request-' || number)::uuid,
  '{}'::jsonb,
  now() - interval '2 days' + make_interval(mins => number)
from generate_series(1, 50) as number;

insert into private.contributions (
  suggestion_id, member_id, confirmed_by, confirmation_request_id, confirmed_at
)
select
  md5('continuation-suggestion-' || number)::uuid,
  'c5000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000002',
  md5('continuation-confirmation-' || number)::uuid,
  now() - interval '1 day' + make_interval(mins => number)
from generate_series(1, 50) as number;

select is(
  (select count(*) from private.achievement_unlocks
    where member_id = 'c5000000-0000-4000-8000-000000000001'
      and achievement_key = 'contributions_platinum'),
  1::bigint,
  'Twenty-five confirmed Contributions still unlock Platinum'
);

select results_eq(
  $$select collection, milestone
    from private.achievement_collection_continuations
    where member_id = 'c5000000-0000-4000-8000-000000000001'$$,
  $$values ('contributions', 50)$$,
  'The fiftieth confirmed Contribution records one continuation milestone'
);

select set_config(
  'request.jwt.claim.sub',
  'c5000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select is(
  (select has_unread from public.get_my_achievement_status()),
  true,
  'An unread continuation keeps the account Achievement indicator active'
);

select results_eq(
  $$select current_value, total_value, next_milestone
    from public.get_my_achievement_collection_progress()
    where collection = 'contributions'$$,
  $$values (50, null::integer, 100)$$,
  'Live Contribution progress continues beyond Platinum toward the next milestone'
);

select results_eq(
  $$select collection, milestone
    from public.claim_my_achievement_continuations()$$,
  $$values ('contributions', 50)$$,
  'The reached milestone can be claimed once'
);

select is(
  (select count(*) from public.claim_my_achievement_continuations()),
  0::bigint,
  'A second claim returns no duplicate celebration'
);

reset role;

update private.contributions
set revoked_at = now(),
  revoked_by = 'c5000000-0000-4000-8000-000000000002',
  revoked_reason = 'Continuation persistence test',
  revocation_request_id = extensions.gen_random_uuid()
where member_id = 'c5000000-0000-4000-8000-000000000001';

select is(
  (select count(*) from private.achievement_collection_continuations
    where member_id = 'c5000000-0000-4000-8000-000000000001'
      and milestone = 50),
  1::bigint,
  'Revocation never removes a milestone already reached'
);

select * from finish();

rollback;
