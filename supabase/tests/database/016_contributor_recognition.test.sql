begin;

create extension if not exists pgtap with schema extensions;

alter table private.locations alter column geometry_precision set default 'moderator_confirmed_point';
alter table private.locations alter column geometry_source set default 'Reviewed database test fixture';

select plan(79);

-- Function surface -----------------------------------------------------------------------------

select has_function(
  'public',
  'configure_contributor_status_policy',
  array['text', 'integer', 'integer', 'integer', 'integer', 'integer', 'boolean'],
  'The Trusted Contributor qualification policy has one explicit configuration boundary'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.configure_contributor_status_policy(text,integer,integer,integer,integer,integer,boolean)',
    'execute'
  ),
  'Members cannot configure the Trusted Contributor qualification policy'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.configure_contributor_status_policy(text,integer,integer,integer,integer,integer,boolean)',
    'execute'
  ),
  'Only the service role can configure the Trusted Contributor qualification policy'
);

select has_function('public', 'get_my_contributor_status', array[]::text[],
  'A Member has one private status projection');
select has_function('public', 'get_moderation_contributor_status', array['uuid'],
  'A Moderator has one full-detail status projection');
select has_function('public', 'list_moderation_contributor_evidence', array['uuid'],
  'A Moderator has one evidence-history projection');
select has_function('public', 'list_member_contributor_priority', array['uuid[]'],
  'A Moderator has one batched queue-priority projection');
select has_function('public', 'revoke_contribution', array['uuid', 'text', 'uuid'],
  'A Moderator can reverse Contribution credit');
select has_function('public', 'record_member_conduct_flag', array['uuid', 'text', 'text', 'uuid', 'uuid'],
  'A Moderator can record an abuse or fraud signal independent of any one Contribution');
select has_function('public', 'clear_member_conduct_flag', array['uuid', 'text', 'uuid'],
  'A Moderator can clear a previously recorded conduct flag');
select has_function(
  'public', 'recalculate_member_contributor_status', array['uuid', 'uuid'],
  'A Moderator can force a fresh status observation'
);

select ok(
  not has_function_privilege('anon', 'public.get_my_contributor_status()', 'execute'),
  'Anonymous callers cannot read any contributor status'
);
select ok(
  has_function_privilege('authenticated', 'public.get_my_contributor_status()', 'execute'),
  'Authenticated Members can reach the identity-enforced status boundary'
);
select ok(
  not has_function_privilege(
    'anon', 'public.get_moderation_contributor_status(uuid)', 'execute'
  ),
  'Anonymous callers cannot read Moderator contributor detail'
);

-- Private tables are never directly reachable ---------------------------------------------------

select ok(
  not has_table_privilege('anon', 'private.contributor_status_policy', 'select'),
  'Anonymous callers cannot read the qualification policy table directly'
);
select ok(
  not has_table_privilege('authenticated', 'private.member_conduct_flags', 'select'),
  'Authenticated callers cannot read the conduct-flag ledger directly'
);
select ok(
  not has_table_privilege('authenticated', 'private.contributor_status_observations', 'select'),
  'Authenticated callers cannot read the status-observation ledger directly'
);

-- Fixtures ----------------------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('75000000-0000-4000-8000-0000000000a1', 'trusted-candidate@example.invalid'),
  ('75000000-0000-4000-8000-0000000000b1', 'volume-gamer@example.invalid'),
  ('75000000-0000-4000-8000-0000000000c1', 'flagged-member@example.invalid'),
  ('75000000-0000-4000-8000-0000000000d1', 'no-history-member@example.invalid'),
  ('75000000-0000-4000-8000-0000000000e1', 'revocation-member@example.invalid'),
  ('75000000-0000-4000-8000-0000000000f1', 'wiring-member@example.invalid'),
  ('75000000-0000-4000-8000-0000000000f0', 'contributor-moderator@example.invalid');

insert into private.member_accounts (user_id)
values
  ('75000000-0000-4000-8000-0000000000a1'),
  ('75000000-0000-4000-8000-0000000000b1'),
  ('75000000-0000-4000-8000-0000000000c1'),
  ('75000000-0000-4000-8000-0000000000d1'),
  ('75000000-0000-4000-8000-0000000000e1'),
  ('75000000-0000-4000-8000-0000000000f1'),
  ('75000000-0000-4000-8000-0000000000f0');

insert into security.role_grants (user_id, role)
values
  ('75000000-0000-4000-8000-0000000000a1', 'member'),
  ('75000000-0000-4000-8000-0000000000b1', 'member'),
  ('75000000-0000-4000-8000-0000000000c1', 'member'),
  ('75000000-0000-4000-8000-0000000000d1', 'member'),
  ('75000000-0000-4000-8000-0000000000e1', 'member'),
  ('75000000-0000-4000-8000-0000000000f1', 'member'),
  ('75000000-0000-4000-8000-0000000000f0', 'member'),
  ('75000000-0000-4000-8000-0000000000f0', 'moderator');

insert into private.operators (id, name)
values ('15000000-0000-4000-8000-000000000001', 'Contributor fixture operator');

insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude
)
values
  ('25000000-0000-4000-8000-000000000001', 'Framlagsgata 1', 'Reykjavík', '101', 'reykjavik', 64.14, -21.94),
  ('25000000-0000-4000-8000-000000000002', 'Framlagsgata 2', 'Reykjavík', '101', 'reykjavik', 64.15, -21.94),
  ('25000000-0000-4000-8000-000000000003', 'Framlagsgata 3', 'Reykjavík', '101', 'reykjavik', 64.16, -21.94),
  ('25000000-0000-4000-8000-000000000004', 'Framlagsgata 4', 'Reykjavík', '101', 'reykjavik', 64.17, -21.94),
  ('25000000-0000-4000-8000-000000000005', 'Framlagsgata 5', 'Reykjavík', '101', 'reykjavik', 64.18, -21.94);

-- Five distinct Places (one Location each) so the same operator can hold several simultaneously
-- active subjects without tripping places_active_continuity_unique (one active Place per
-- operator/location/purpose).
insert into private.places (id, operator_id, location_id, purpose, lifecycle, category)
select
  place_id,
  '15000000-0000-4000-8000-000000000001',
  location_id,
  'dog_access_destination',
  'candidate',
  'cafe'
from (
  values
    ('35000000-0000-4000-8000-000000000001'::uuid, '25000000-0000-4000-8000-000000000001'::uuid),
    ('35000000-0000-4000-8000-000000000002'::uuid, '25000000-0000-4000-8000-000000000002'::uuid),
    ('35000000-0000-4000-8000-000000000003'::uuid, '25000000-0000-4000-8000-000000000003'::uuid),
    ('35000000-0000-4000-8000-000000000004'::uuid, '25000000-0000-4000-8000-000000000004'::uuid),
    ('35000000-0000-4000-8000-000000000005'::uuid, '25000000-0000-4000-8000-000000000005'::uuid)
) as fixture_places (place_id, location_id);

-- Helper: one accepted, resolved fixture Suggestion per Contribution row below.
insert into private.place_suggestions (
  id, member_id, request_id, proposal, status, candidate_place_id, reviewed_proposal, resolved_at
)
select
  suggestion_id,
  member_id,
  suggestion_id,
  '{"fixture": true}'::jsonb,
  'accepted',
  place_id,
  '{"fixture": true}'::jsonb,
  now()
from (
  values
    ('65000000-0000-4000-8000-00000000a001'::uuid, '75000000-0000-4000-8000-0000000000a1'::uuid, '35000000-0000-4000-8000-000000000001'::uuid),
    ('65000000-0000-4000-8000-00000000a002'::uuid, '75000000-0000-4000-8000-0000000000a1'::uuid, '35000000-0000-4000-8000-000000000002'::uuid),
    ('65000000-0000-4000-8000-00000000a003'::uuid, '75000000-0000-4000-8000-0000000000a1'::uuid, '35000000-0000-4000-8000-000000000003'::uuid),
    ('65000000-0000-4000-8000-00000000a004'::uuid, '75000000-0000-4000-8000-0000000000a1'::uuid, '35000000-0000-4000-8000-000000000001'::uuid),
    ('65000000-0000-4000-8000-00000000a005'::uuid, '75000000-0000-4000-8000-0000000000a1'::uuid, '35000000-0000-4000-8000-000000000002'::uuid),
    ('65000000-0000-4000-8000-00000000b001'::uuid, '75000000-0000-4000-8000-0000000000b1'::uuid, '35000000-0000-4000-8000-000000000005'::uuid),
    ('65000000-0000-4000-8000-00000000b002'::uuid, '75000000-0000-4000-8000-0000000000b1'::uuid, '35000000-0000-4000-8000-000000000005'::uuid),
    ('65000000-0000-4000-8000-00000000b003'::uuid, '75000000-0000-4000-8000-0000000000b1'::uuid, '35000000-0000-4000-8000-000000000005'::uuid),
    ('65000000-0000-4000-8000-00000000b004'::uuid, '75000000-0000-4000-8000-0000000000b1'::uuid, '35000000-0000-4000-8000-000000000005'::uuid),
    ('65000000-0000-4000-8000-00000000b005'::uuid, '75000000-0000-4000-8000-0000000000b1'::uuid, '35000000-0000-4000-8000-000000000005'::uuid),
    ('65000000-0000-4000-8000-00000000b006'::uuid, '75000000-0000-4000-8000-0000000000b1'::uuid, '35000000-0000-4000-8000-000000000005'::uuid),
    ('65000000-0000-4000-8000-00000000c001'::uuid, '75000000-0000-4000-8000-0000000000c1'::uuid, '35000000-0000-4000-8000-000000000001'::uuid),
    ('65000000-0000-4000-8000-00000000c002'::uuid, '75000000-0000-4000-8000-0000000000c1'::uuid, '35000000-0000-4000-8000-000000000002'::uuid),
    ('65000000-0000-4000-8000-00000000c003'::uuid, '75000000-0000-4000-8000-0000000000c1'::uuid, '35000000-0000-4000-8000-000000000003'::uuid),
    ('65000000-0000-4000-8000-00000000c004'::uuid, '75000000-0000-4000-8000-0000000000c1'::uuid, '35000000-0000-4000-8000-000000000001'::uuid),
    ('65000000-0000-4000-8000-00000000c005'::uuid, '75000000-0000-4000-8000-0000000000c1'::uuid, '35000000-0000-4000-8000-000000000002'::uuid),
    ('65000000-0000-4000-8000-00000000e001'::uuid, '75000000-0000-4000-8000-0000000000e1'::uuid, '35000000-0000-4000-8000-000000000001'::uuid),
    ('65000000-0000-4000-8000-00000000e002'::uuid, '75000000-0000-4000-8000-0000000000e1'::uuid, '35000000-0000-4000-8000-000000000002'::uuid),
    ('65000000-0000-4000-8000-00000000e003'::uuid, '75000000-0000-4000-8000-0000000000e1'::uuid, '35000000-0000-4000-8000-000000000003'::uuid),
    ('65000000-0000-4000-8000-00000000e004'::uuid, '75000000-0000-4000-8000-0000000000e1'::uuid, '35000000-0000-4000-8000-000000000001'::uuid),
    ('65000000-0000-4000-8000-00000000e005'::uuid, '75000000-0000-4000-8000-0000000000e1'::uuid, '35000000-0000-4000-8000-000000000002'::uuid),
    ('65000000-0000-4000-8000-00000000e006'::uuid, '75000000-0000-4000-8000-0000000000e1'::uuid, '35000000-0000-4000-8000-000000000003'::uuid),
    ('65000000-0000-4000-8000-00000000f001'::uuid, '75000000-0000-4000-8000-0000000000f1'::uuid, '35000000-0000-4000-8000-000000000004'::uuid)
) as fixture_suggestions (suggestion_id, member_id, place_id);

-- Member A: 5 net Contributions, 3 distinct subjects, 3 distinct months -> qualifies for Trusted
-- once a policy exists. Confirmed_at values are backdated directly (the confirm_suggestion_contribution
-- RPC only ever uses "now", so historical spread must be seeded directly for this fixture).
insert into private.contributions (
  suggestion_id, member_id, confirmed_by, confirmation_request_id, subject_place_id, confirmed_at
)
values
  ('65000000-0000-4000-8000-00000000a001', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000a001', '35000000-0000-4000-8000-000000000001', now()),
  ('65000000-0000-4000-8000-00000000a002', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000a002', '35000000-0000-4000-8000-000000000002', now()),
  ('65000000-0000-4000-8000-00000000a003', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000a003', '35000000-0000-4000-8000-000000000003', now() - interval '1 month'),
  ('65000000-0000-4000-8000-00000000a004', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000a004', '35000000-0000-4000-8000-000000000001', now() - interval '2 months'),
  ('65000000-0000-4000-8000-00000000a005', '75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000a005', '35000000-0000-4000-8000-000000000002', now() - interval '2 months');

-- Member B: 6 net Contributions but a single subject and a single month -> raw volume alone.
insert into private.contributions (
  suggestion_id, member_id, confirmed_by, confirmation_request_id, subject_place_id, confirmed_at
)
values
  ('65000000-0000-4000-8000-00000000b001', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000b001', '35000000-0000-4000-8000-000000000005', now()),
  ('65000000-0000-4000-8000-00000000b002', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000b002', '35000000-0000-4000-8000-000000000005', now()),
  ('65000000-0000-4000-8000-00000000b003', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000b003', '35000000-0000-4000-8000-000000000005', now()),
  ('65000000-0000-4000-8000-00000000b004', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000b004', '35000000-0000-4000-8000-000000000005', now()),
  ('65000000-0000-4000-8000-00000000b005', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000b005', '35000000-0000-4000-8000-000000000005', now()),
  ('65000000-0000-4000-8000-00000000b006', '75000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000b006', '35000000-0000-4000-8000-000000000005', now());

-- Member C: same qualifying distribution as Member A, plus an active fraud flag.
insert into private.contributions (
  suggestion_id, member_id, confirmed_by, confirmation_request_id, subject_place_id, confirmed_at
)
values
  ('65000000-0000-4000-8000-00000000c001', '75000000-0000-4000-8000-0000000000c1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000c001', '35000000-0000-4000-8000-000000000001', now()),
  ('65000000-0000-4000-8000-00000000c002', '75000000-0000-4000-8000-0000000000c1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000c002', '35000000-0000-4000-8000-000000000002', now()),
  ('65000000-0000-4000-8000-00000000c003', '75000000-0000-4000-8000-0000000000c1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000c003', '35000000-0000-4000-8000-000000000003', now() - interval '1 month'),
  ('65000000-0000-4000-8000-00000000c004', '75000000-0000-4000-8000-0000000000c1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000c004', '35000000-0000-4000-8000-000000000001', now() - interval '2 months'),
  ('65000000-0000-4000-8000-00000000c005', '75000000-0000-4000-8000-0000000000c1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000c005', '35000000-0000-4000-8000-000000000002', now() - interval '2 months');

-- Member E: same qualifying distribution as Member A, plus one extra Contribution that will be revoked.
insert into private.contributions (
  suggestion_id, member_id, confirmed_by, confirmation_request_id, subject_place_id, confirmed_at
)
values
  ('65000000-0000-4000-8000-00000000e001', '75000000-0000-4000-8000-0000000000e1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000e001', '35000000-0000-4000-8000-000000000001', now()),
  ('65000000-0000-4000-8000-00000000e002', '75000000-0000-4000-8000-0000000000e1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000e002', '35000000-0000-4000-8000-000000000002', now()),
  ('65000000-0000-4000-8000-00000000e003', '75000000-0000-4000-8000-0000000000e1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000e003', '35000000-0000-4000-8000-000000000003', now() - interval '1 month'),
  ('65000000-0000-4000-8000-00000000e004', '75000000-0000-4000-8000-0000000000e1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000e004', '35000000-0000-4000-8000-000000000001', now() - interval '2 months'),
  ('65000000-0000-4000-8000-00000000e005', '75000000-0000-4000-8000-0000000000e1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000e005', '35000000-0000-4000-8000-000000000002', now() - interval '2 months'),
  ('65000000-0000-4000-8000-00000000e006', '75000000-0000-4000-8000-0000000000e1', '75000000-0000-4000-8000-0000000000f0', '65000000-0000-4000-8000-00000000e006', '35000000-0000-4000-8000-000000000003', now());

-- Contributor status is unconditional and volume-based -------------------------------------------

select is(
  (select status from private.compute_contributor_status('75000000-0000-4000-8000-0000000000d1')),
  'none',
  'A Member with no net Contribution has no status'
);

select is(
  (select window_since from private.compute_contributor_status('75000000-0000-4000-8000-0000000000d1')),
  null::timestamptz,
  'No status means no since-date'
);

select is(
  (select status from private.compute_contributor_status('75000000-0000-4000-8000-0000000000a1')),
  'contributor',
  'At least one net Contribution already earns Contributor status, independent of any policy'
);

select is(
  (select status from private.compute_contributor_status('75000000-0000-4000-8000-0000000000b1')),
  'contributor',
  'Volume alone (six Contributions, one subject, one month) also stays Contributor'
);

-- Trusted Contributor status fails closed until an owner-approved policy is configured -----------

select is(
  (select status from private.compute_contributor_status('75000000-0000-4000-8000-0000000000a1')),
  'contributor',
  'Trusted Contributor status is unreachable before any qualification policy is configured'
);

set local role service_role;
select public.configure_achievement_policy('production-shaped-achievements', 30, true);
select public.configure_achievement_policy('production-shaped-achievements-disabled', 30, false);
select public.configure_contributor_status_policy('trust-v1-test', 5, 12, 3, 3, 0, true);
reset role;

select is(
  (select enabled from private.achievement_policy where singleton),
  false,
  'Trusted activation reconciliation does not depend on the separate Achievement policy being enabled'
);

select ok(
  (
    select policy.eligibility_started_at > max(contribution.confirmed_at)
    from private.achievement_policy as policy
    cross join private.contributions as contribution
    where policy.singleton
      and contribution.member_id = '75000000-0000-4000-8000-0000000000a1'
    group by policy.eligibility_started_at
  ),
  'The reconciliation fixture has the production-shaped future-only Achievement eligibility boundary'
);

select is(
  (
    select count(*)
    from private.achievement_unlocks
    where member_id = '75000000-0000-4000-8000-0000000000a1'
      and achievement_key = 'sustained_quality_contributor'
  ),
  1::bigint,
  'Policy activation reconciles a qualifying historical Contributor despite the Achievement boundary'
);

select is(
  (
    select definition_version
    from private.achievement_unlocks
    where member_id = '75000000-0000-4000-8000-0000000000a1'
      and achievement_key = 'sustained_quality_contributor'
  ),
  2,
  'Trusted activation reconciliation records the latest sustained-quality definition'
);

select is(
  (
    select count(*)
    from private.achievement_unlocks
    where member_id = '75000000-0000-4000-8000-0000000000a1'
      and achievement_key <> 'sustained_quality_contributor'
  ),
  0::bigint,
  'Trusted activation reconciliation never unlocks unrelated historical Achievements'
);

select is(
  (
    select count(*)
    from private.member_accounts as member_account
    cross join lateral private.compute_contributor_status(member_account.user_id) as status
    where status.status = 'trusted_contributor'
      and not exists (
        select 1
        from private.achievement_unlocks as unlock
        where unlock.member_id = member_account.user_id
          and unlock.achievement_key = 'sustained_quality_contributor'
      )
  ),
  0::bigint,
  'The production postcondition finds no live Trusted Member missing permanent recognition'
);

select earned_at as reconciled_earned_at
from private.achievement_unlocks
where member_id = '75000000-0000-4000-8000-0000000000a1'
  and achievement_key = 'sustained_quality_contributor' \gset

set local role service_role;
select public.configure_contributor_status_policy('trust-v1-test', 5, 12, 3, 3, 0, true);
reset role;

select results_eq(
  $$
    select count(*), min(earned_at)
    from private.achievement_unlocks
    where member_id = '75000000-0000-4000-8000-0000000000a1'
      and achievement_key = 'sustained_quality_contributor'
  $$,
  format(
    $$values (1::bigint, %L::timestamptz)$$,
    :'reconciled_earned_at'
  ),
  'Replaying Trusted activation preserves the one immutable unlock and its original earned time'
);

select is(
  (select trusted_window from private.contributor_status_policy where singleton),
  interval '12 months',
  'The approved rolling qualification window is represented as exact calendar months'
);

select has_function(
  'public',
  'list_moderation_place_suggestions',
  array['text', 'integer', 'integer', 'timestamp with time zone', 'uuid', 'integer'],
  'The supported Suggestion queue accepts the trust-aware deterministic cursor'
);

select has_function(
  'public',
  'list_moderation_place_flags',
  array['text', 'integer', 'integer', 'timestamp with time zone', 'uuid', 'integer'],
  'The supported Correction and Report queue accepts the trust-aware deterministic cursor'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-0000000000f0', true);

select is(
  (
    select trust_tier
    from public.list_moderation_place_suggestions('resolved', null, null, null, null, 51)
    where member_id = '75000000-0000-4000-8000-0000000000a1'
    limit 1
  ),
  'trusted_contributor',
  'The database queue projects only the current narrow trust tier for priority explanation'
);

select is(
  (
    select trust_tier
    from public.list_moderation_place_suggestions('resolved', null, null, null, null, 51)
    limit 1
  ),
  'trusted_contributor',
  'Trusted submissions sort before ordinary submissions inside the same queue rank and day'
);

select lives_ok(
  $$select count(*) from public.list_moderation_place_flags('actionable', null, null, null, null, 51)$$,
  'The trust-aware Correction and Report queue executes its complete projected row contract'
);

select isnt(
  (
    select suggestion_id
    from public.list_moderation_place_suggestions('resolved', null, null, null, null, 1)
    limit 1
  ),
  (
    with first_page as (
      select *
      from public.list_moderation_place_suggestions('resolved', null, null, null, null, 1)
      limit 1
    )
    select next_page.suggestion_id
    from first_page
    cross join lateral public.list_moderation_place_suggestions(
      'resolved',
      first_page.queue_rank,
      first_page.trust_priority,
      first_page.submitted_at,
      first_page.suggestion_id,
      1
    ) as next_page
    limit 1
  ),
  'The trust-aware cursor advances without duplicating the previous page boundary'
);

reset role;

select is(
  (select status from private.compute_contributor_status('75000000-0000-4000-8000-0000000000a1')),
  'trusted_contributor',
  'Five accepted Contributions across three months and three Places qualify for Trusted status'
);

select is(
  (select status from private.compute_contributor_status('75000000-0000-4000-8000-0000000000b1')),
  'contributor',
  'Raw repetitive volume on one subject and one month cannot earn Trusted status'
);

-- Abuse exclusion overrides otherwise-qualifying history ------------------------------------------

select is(
  (select status from private.compute_contributor_status('75000000-0000-4000-8000-0000000000c1')),
  'trusted_contributor',
  'Member C already qualifies for Trusted status before any conduct flag exists'
);

-- Fetch a Contribution identifier belonging to a different Member than the one being flagged, for
-- the same reason as fraud_flag_id below: private.contributions is never directly reachable as
-- 'authenticated'.
select id as b001_contribution_id
from private.contributions
where suggestion_id = '65000000-0000-4000-8000-00000000b001' \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-0000000000f0', true);

select throws_ok(
  $$
    select * from public.record_member_conduct_flag(
      '75000000-0000-4000-8000-0000000000a1', 'not_a_kind', 'reason', null, '85000000-0000-4000-8000-0000000000f1'
    )
  $$,
  '22023',
  'Conduct flag kind is invalid',
  'An unrecognized conduct flag kind is rejected'
);

select throws_ok(
  format($$
    select * from public.record_member_conduct_flag(
      '75000000-0000-4000-8000-0000000000c1', 'fraud', 'Mismatched Contribution ownership.',
      %L, '85000000-0000-4000-8000-0000000000fd'
    )
  $$, :'b001_contribution_id'),
  '22023',
  'Related Contribution does not belong to this Member',
  'A conduct flag cannot cite a Contribution belonging to a different Member'
);

select lives_ok(
  $$
    select * from public.record_member_conduct_flag(
      '75000000-0000-4000-8000-0000000000c1', 'fraud', 'One serious false report was confirmed.',
      null, '85000000-0000-4000-8000-0000000000f2'
    )
  $$,
  'A Moderator can record a conduct flag independent of any specific Contribution'
);
reset role;

-- Fetch the flag identifier as the superuser: Moderator commands never accept a private row as a
-- direct query argument, so the test captures it here (private.member_conduct_flags is never
-- directly reachable as 'authenticated', per the boundary asserted above).
select id as fraud_flag_id
from private.member_conduct_flags
where member_id = '75000000-0000-4000-8000-0000000000c1' and flag_kind = 'fraud' \gset

select is(
  (select status from private.compute_contributor_status('75000000-0000-4000-8000-0000000000c1')),
  'contributor',
  'An active conduct flag immediately demotes an otherwise-qualifying Member out of Trusted status'
);

select is(
  (
    select count(*) from private.contributor_status_observations
    where member_id = '75000000-0000-4000-8000-0000000000c1'
      and status = 'contributor'
      and trigger_reason = 'conduct_flag_recorded'
  ),
  1::bigint,
  'The trusted-to-Contributor demotion is observed and audited at the moment the flag is recorded'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-0000000000f0', true);
select lives_ok(
  format($$
    select * from public.clear_member_conduct_flag(
      %L,
      'Investigation found the report was legitimate.',
      '85000000-0000-4000-8000-0000000000f3'
    )
  $$, :'fraud_flag_id'),
  'A Moderator can clear a previously recorded conduct flag'
);
reset role;

select is(
  (select status from private.compute_contributor_status('75000000-0000-4000-8000-0000000000c1')),
  'trusted_contributor',
  'Clearing the flag safely recalculates Trusted status from the still-qualifying accepted history'
);

select is(
  (
    select count(*) from private.contributor_status_observations
    where member_id = '75000000-0000-4000-8000-0000000000c1'
      and status = 'trusted_contributor'
      and trigger_reason = 'conduct_flag_cleared'
  ),
  1::bigint,
  'The Contributor-to-Trusted restoration is observed and audited at the moment the flag is cleared'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-0000000000f0', true);
select throws_ok(
  format($$
    select * from public.clear_member_conduct_flag(
      %L,
      'Already cleared retry.',
      '85000000-0000-4000-8000-0000000000f4'
    )
  $$, :'fraud_flag_id'),
  '55006',
  'Conduct flag is already cleared',
  'Clearing an already-cleared flag is rejected'
);
reset role;

-- Replaying clear_member_conduct_flag with the identical request ID is idempotent ----------------
-- (mirrors revoke_contribution's replay pattern above), rather than raising 55006 on the second
-- call just because the Member no longer has any other active conduct flag.

set local role authenticated;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-0000000000f0', true);
select lives_ok(
  $$
    select * from public.record_member_conduct_flag(
      '75000000-0000-4000-8000-0000000000d1', 'abuse', 'Idempotency fixture flag.',
      null, '85000000-0000-4000-8000-0000000000fb'
    )
  $$,
  'A Moderator can record a conduct flag for the idempotency fixture Member'
);
reset role;

select id as idempotency_flag_id
from private.member_conduct_flags
where member_id = '75000000-0000-4000-8000-0000000000d1' and flag_kind = 'abuse' \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-0000000000f0', true);
select flag_id as idempotency_first_flag_id, cleared_at as idempotency_first_cleared_at
from public.clear_member_conduct_flag(
  :'idempotency_flag_id', 'Idempotent clearance replay.', '85000000-0000-4000-8000-0000000000fc'
) \gset

select results_eq(
  format($$
    select flag_id, cleared_at from public.clear_member_conduct_flag(
      %L, 'Idempotent clearance replay.', '85000000-0000-4000-8000-0000000000fc'
    )
  $$, :'idempotency_flag_id'),
  format(
    $$values (%L::uuid, %L::timestamptz)$$,
    :'idempotency_first_flag_id',
    :'idempotency_first_cleared_at'
  ),
  'Replaying clear_member_conduct_flag with the same request ID returns the original result idempotently, even when the Member has no other active flag left'
);
reset role;

-- Reversed outcomes recalculate safely --------------------------------------------------------

select is(
  (select status from private.compute_contributor_status('75000000-0000-4000-8000-0000000000e1')),
  'trusted_contributor',
  'Member E qualifies for Trusted status before any revocation'
);

-- Fetch the Contribution identifier as the superuser, for the same reason as fraud_flag_id above:
-- private.contributions is never directly reachable as 'authenticated'.
select id as e006_contribution_id
from private.contributions
where suggestion_id = '65000000-0000-4000-8000-00000000e006' \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-0000000000f0', true);
select lives_ok(
  format($$
    select * from public.revoke_contribution(
      %L,
      'Duplicate credit was discovered.',
      '85000000-0000-4000-8000-0000000000f5'
    )
  $$, :'e006_contribution_id'),
  'A Moderator can revoke one Contribution''s credit'
);
reset role;

select is(
  (select status from private.compute_contributor_status('75000000-0000-4000-8000-0000000000e1')),
  'contributor',
  'A revoked Contribution within the window blocks Trusted status even though net volume remains high'
);

select is(
  (
    select count(*)
    from private.achievement_unlocks
    where member_id = '75000000-0000-4000-8000-0000000000e1'
      and achievement_key = 'sustained_quality_contributor'
  ),
  1::bigint,
  'Losing live Trusted status never removes the permanent recognition earned at activation'
);

select is(
  (
    select revoked_reason from private.contributions
    where suggestion_id = '65000000-0000-4000-8000-00000000e006'
  ),
  'Duplicate credit was discovered.',
  'The revocation reason is preserved on the historical Contribution row'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-0000000000f0', true);
select throws_ok(
  format($$
    select * from public.revoke_contribution(
      %L,
      'Retry with a different request.',
      '85000000-0000-4000-8000-0000000000f6'
    )
  $$, :'e006_contribution_id'),
  '55006',
  'Contribution is already revoked',
  'A Contribution cannot be revoked twice under a different request'
);

select lives_ok(
  format($$
    select * from public.revoke_contribution(
      %L,
      'Duplicate credit was discovered.',
      '85000000-0000-4000-8000-0000000000f5'
    )
  $$, :'e006_contribution_id'),
  'Replaying the same revocation request is idempotent'
);
reset role;

-- End-to-end wiring through the real Contribution confirmation command ---------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-0000000000f0', true);
select lives_ok(
  $$
    select * from public.confirm_suggestion_contribution(
      '65000000-0000-4000-8000-00000000f001',
      '85000000-0000-4000-8000-0000000000f7'
    )
  $$,
  'The real Contribution confirmation command still works for a fresh Member'
);
reset role;

select is(
  (
    select subject_place_id from private.contributions
    where suggestion_id = '65000000-0000-4000-8000-00000000f001'
  ),
  '35000000-0000-4000-8000-000000000004'::uuid,
  'Confirmation denormalizes subject_place_id from the accepted Suggestion onto the Contribution'
);

select is(
  (
    select count(*) from private.contributor_status_observations
    where member_id = '75000000-0000-4000-8000-0000000000f1'
      and status = 'contributor'
      and trigger_reason = 'contribution_confirmed'
  ),
  1::bigint,
  'The none-to-Contributor transition is observed and audited'
);

select is(
  (
    select count(*) from private.audit_events
    where subject_type = 'member_account'
      and subject_id = '75000000-0000-4000-8000-0000000000f1'
      and action = 'contributor.status_changed'
  ),
  1::bigint,
  'An audit event explains the status transition and its trigger'
);

-- Private, non-gameable Member view ----------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-0000000000a1', true);
select results_eq(
  $$select status, policy_version from public.get_my_contributor_status()$$,
  $$values ('trusted_contributor'::text, 'trust-v1-test'::text)$$,
  'A Member sees only their own tier and the policy version, never a count or ratio'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-0000000000d1', true);
select results_eq(
  $$select status, status_since from public.get_my_contributor_status()$$,
  $$values ('none'::text, null::timestamptz)$$,
  'A Member with no history sees no status and no since-date'
);
reset role;

-- Moderator detail and batched priority ------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-0000000000f0', true);
select is(
  (
    select status from public.get_moderation_contributor_status('75000000-0000-4000-8000-0000000000a1')
  ),
  'trusted_contributor',
  'A Moderator can see full contributor detail for a Member'
);

select is(
  (
    select count(*) from public.list_moderation_contributor_evidence('75000000-0000-4000-8000-0000000000c1')
  ),
  7::bigint,
  'Moderator evidence history includes both the five Contributions and both conduct-flag rows (recorded and cleared)'
);

select is(
  (
    select array_agg(status order by member_id)
    from public.list_member_contributor_priority(array[
      '75000000-0000-4000-8000-0000000000a1'::uuid,
      '75000000-0000-4000-8000-0000000000a1'::uuid,
      '75000000-0000-4000-8000-0000000000d1'::uuid
    ])
  ),
  array['trusted_contributor', 'none']::text[],
  'The batched queue-priority signal deduplicates Member IDs and never changes pagination'
);

select is(
  (select count(*) from public.list_member_contributor_priority(null)),
  0::bigint,
  'A null batch returns no rows instead of raising'
);
reset role;

-- Authorization boundaries ---------------------------------------------------------------------

-- Fetch the Contribution identifier as the superuser, for the same reason as fraud_flag_id above:
-- private.contributions is never directly reachable as 'authenticated'.
select id as a001_contribution_id
from private.contributions
where suggestion_id = '65000000-0000-4000-8000-00000000a001' \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-0000000000a1', true);

select throws_ok(
  $$select * from public.get_moderation_contributor_status('75000000-0000-4000-8000-0000000000a1')$$,
  '42501',
  'Moderator role required',
  'A Member cannot read Moderator contributor detail'
);

select throws_ok(
  $$select * from public.list_moderation_contributor_evidence('75000000-0000-4000-8000-0000000000a1')$$,
  '42501',
  'Moderator role required',
  'A Member cannot read Moderator evidence history'
);

select throws_ok(
  $$select * from public.list_member_contributor_priority(array['75000000-0000-4000-8000-0000000000a1'::uuid])$$,
  '42501',
  'Moderator role required',
  'A Member cannot read the batched queue-priority signal'
);

select throws_ok(
  format($$
    select * from public.revoke_contribution(
      %L,
      'Attempted self-revocation.',
      '85000000-0000-4000-8000-0000000000f8'
    )
  $$, :'a001_contribution_id'),
  '42501',
  'Moderator role required',
  'A Member cannot revoke Contribution credit'
);

select throws_ok(
  $$
    select * from public.record_member_conduct_flag(
      '75000000-0000-4000-8000-0000000000b1', 'fraud', 'Attempted self-service flag.', null,
      '85000000-0000-4000-8000-0000000000f9'
    )
  $$,
  '42501',
  'Moderator role required',
  'A Member cannot record a conduct flag'
);

select throws_ok(
  $$
    select * from public.recalculate_member_contributor_status(
      '75000000-0000-4000-8000-0000000000a1', '85000000-0000-4000-8000-0000000000fa'
    )
  $$,
  '42501',
  'Moderator role required',
  'A Member cannot force a status recalculation'
);
reset role;

set local role anon;
select throws_ok(
  $$select * from public.get_my_contributor_status()$$,
  '42501',
  null,
  'A Visitor cannot read any contributor status'
);
reset role;

-- Append-only ledgers -----------------------------------------------------------------------------

select throws_ok(
  $$update private.member_conduct_flags set reason = reason where flag_kind = 'fraud'$$,
  '55000', 'Conduct flags are append-only',
  'The conduct-flag ledger rejects updates'
);

select throws_ok(
  $$delete from private.member_conduct_flags where flag_kind = 'fraud'$$,
  '55000', 'Conduct flags are append-only',
  'The conduct-flag ledger rejects deletes'
);

select throws_ok(
  $$truncate private.member_conduct_flags$$,
  '55000', 'Conduct flags are append-only',
  'The conduct-flag ledger rejects truncation'
);

select throws_ok(
  $$update private.contributor_status_observations set observed_at = observed_at$$,
  '55000', 'Contributor status observations are append-only',
  'The status-observation ledger rejects updates'
);

select throws_ok(
  $$delete from private.contributor_status_observations$$,
  '55000', 'Contributor status observations are append-only',
  'The status-observation ledger rejects deletes'
);

select * from finish();

rollback;
