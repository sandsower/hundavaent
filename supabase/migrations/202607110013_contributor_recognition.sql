begin;

-- Versioned, service-role-only configurable Trusted Contributor qualification policy. Mirrors the
-- fail-closed shape of private.suggestion_abuse_policy: no row (or enabled = false) means Trusted
-- Contributor status can never be reached anywhere, pending explicit owner approval and configuration.
-- Base Contributor status is a hardcoded domain invariant (at least one net Contribution) and does not
-- depend on this policy at all.
create table private.contributor_status_policy (
  singleton boolean primary key default true check (singleton),
  policy_version text not null check (btrim(policy_version) <> ''),
  trusted_minimum_net_accepted integer not null check (trusted_minimum_net_accepted > 0),
  trusted_window interval not null check (trusted_window > interval '0 seconds'),
  trusted_minimum_distinct_months integer not null check (trusted_minimum_distinct_months > 0),
  trusted_minimum_distinct_subjects integer not null check (trusted_minimum_distinct_subjects > 0),
  trusted_maximum_revoked_in_window integer not null check (trusted_maximum_revoked_in_window >= 0),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Source-agnostic signals denormalized directly onto the Contribution row so the trust engine never
-- needs to know whether a Contribution came from a Suggestion (missing-place-suggestion), a Report (correction-and-report), or a future
-- kind. subject_place_id lets diversity be computed without joining any submission-kind table.
alter table private.contributions
  add column subject_place_id uuid references private.places(id) on delete restrict,
  add column revoked_at timestamptz,
  add column revoked_by uuid references auth.users(id) on delete restrict,
  add column revoked_reason text,
  add column revocation_request_id uuid;

alter table private.contributions
  add constraint contribution_revocation_shape check (
    (
      revoked_at is null
      and revoked_by is null
      and revoked_reason is null
      and revocation_request_id is null
    )
    or (
      revoked_at is not null
      and revoked_by is not null
      and revocation_request_id is not null
      and nullif(btrim(revoked_reason), '') is not null
    )
  );

create index contributions_member_active_time_idx
  on private.contributions (member_id, confirmed_at desc)
  where revoked_at is null;

-- One-time backfill for Contribution rows confirmed before this migration. Executed once here, not
-- part of the live derivation path, so the read path stays fully suggestion-agnostic going forward.
update private.contributions as contribution
set subject_place_id = suggestion.candidate_place_id
from private.place_suggestions as suggestion
where suggestion.id = contribution.suggestion_id
  and contribution.subject_place_id is null;

-- Append-only conduct-flag ledger for abuse/fraud signals that are not tied to one specific
-- Contribution (for example a serious false report that never became a Contribution). A flag is
-- cleared by inserting a new 'flag_cleared' row that references it, never by mutating the original row.
create table private.member_conduct_flags (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  flag_kind text not null check (flag_kind in ('fraud', 'abuse', 'policy_violation', 'flag_cleared')),
  reason text not null check (btrim(reason) <> ''),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  related_contribution_id uuid references private.contributions(id) on delete restrict,
  cleared_flag_id uuid references private.member_conduct_flags(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  constraint conduct_flag_clear_shape check (
    (flag_kind = 'flag_cleared' and cleared_flag_id is not null)
    or (flag_kind <> 'flag_cleared' and cleared_flag_id is null)
  ),
  unique (member_id, request_id)
);

create index member_conduct_flags_member_time_idx
  on private.member_conduct_flags (member_id, recorded_at desc);

create function private.reject_conduct_flag_mutation()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'Conduct flags are append-only';
end;
$$;

create trigger member_conduct_flags_reject_row_mutation
before update or delete on private.member_conduct_flags
for each row execute function private.reject_conduct_flag_mutation();

create trigger member_conduct_flags_reject_truncate
before truncate on private.member_conduct_flags
for each statement execute function private.reject_conduct_flag_mutation();

-- Append-only audit-facing observation log. This is never the source of truth for status - it is a
-- durable record of what private.compute_contributor_status returned at moderator-attributable touch
-- points, so "an audit event explains every status transition" holds without caching status anywhere.
create table private.contributor_status_observations (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  status text not null check (status in ('none', 'contributor', 'trusted_contributor')),
  policy_version text,
  trigger_reason text not null check (
    trigger_reason in (
      'contribution_confirmed',
      'contribution_revoked',
      'conduct_flag_recorded',
      'conduct_flag_cleared',
      'recalculation'
    )
  ),
  request_id uuid not null,
  observed_at timestamptz not null default now(),
  unique (member_id, request_id)
);

create index contributor_status_observations_member_time_idx
  on private.contributor_status_observations (member_id, observed_at desc);

create function private.reject_contributor_status_observation_mutation()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'Contributor status observations are append-only';
end;
$$;

create trigger contributor_status_observations_reject_row_mutation
before update or delete on private.contributor_status_observations
for each row execute function private.reject_contributor_status_observation_mutation();

create trigger contributor_status_observations_reject_truncate
before truncate on private.contributor_status_observations
for each statement execute function private.reject_contributor_status_observation_mutation();

alter table private.contributor_status_policy enable row level security;
alter table private.member_conduct_flags enable row level security;
alter table private.contributor_status_observations enable row level security;

create function private.has_active_conduct_flag(target_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.member_conduct_flags as flag
    where flag.member_id = target_member_id
      and flag.flag_kind <> 'flag_cleared'
      and not exists (
        select 1
        from private.member_conduct_flags as clearing
        where clearing.flag_kind = 'flag_cleared'
          and clearing.cleared_flag_id = flag.id
      )
  );
$$;

-- Pure, reproducible derivation. No status is ever stored: every read recomputes the tier from
-- private.contributions, private.member_conduct_flags, and the current policy row. Only
-- private.contributions is consulted for volume/recency/diversity - never any submission-kind table.
create function private.compute_contributor_status(target_member_id uuid)
returns table (
  status text,
  policy_version text,
  net_accepted_total integer,
  net_accepted_in_window integer,
  distinct_subjects_in_window integer,
  distinct_months_in_window integer,
  revoked_in_window integer,
  has_active_flag boolean,
  first_net_accepted_at timestamptz,
  window_since timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  policy_record private.contributor_status_policy%rowtype;
  total_count integer;
  window_start timestamptz;
  window_count integer;
  window_subjects integer;
  window_months integer;
  window_revoked integer;
  active_flag boolean;
  first_confirmed_at timestamptz;
  window_earliest timestamptz;
  resolved_status text;
begin
  select count(*), min(contribution.confirmed_at)
  into total_count, first_confirmed_at
  from private.contributions as contribution
  where contribution.member_id = target_member_id
    and contribution.revoked_at is null;

  active_flag := private.has_active_conduct_flag(target_member_id);
  resolved_status := case when coalesce(total_count, 0) >= 1 then 'contributor' else 'none' end;

  select policy.* into policy_record
  from private.contributor_status_policy as policy
  where policy.singleton and policy.enabled;

  if found and resolved_status = 'contributor' and not active_flag then
    window_start := now() - policy_record.trusted_window;

    select
      count(*),
      count(distinct contribution.subject_place_id) filter (where contribution.subject_place_id is not null),
      count(distinct date_trunc('month', contribution.confirmed_at)),
      min(contribution.confirmed_at)
    into window_count, window_subjects, window_months, window_earliest
    from private.contributions as contribution
    where contribution.member_id = target_member_id
      and contribution.revoked_at is null
      and contribution.confirmed_at >= window_start;

    select count(*)
    into window_revoked
    from private.contributions as contribution
    where contribution.member_id = target_member_id
      and contribution.revoked_at is not null
      and contribution.revoked_at >= window_start;

    if window_count >= policy_record.trusted_minimum_net_accepted
      and window_subjects >= policy_record.trusted_minimum_distinct_subjects
      and window_months >= policy_record.trusted_minimum_distinct_months
      and window_revoked <= policy_record.trusted_maximum_revoked_in_window
    then
      resolved_status := 'trusted_contributor';
    end if;
  else
    window_count := 0;
    window_subjects := 0;
    window_months := 0;
    window_revoked := 0;
    window_earliest := null;
  end if;

  return query select
    resolved_status,
    policy_record.policy_version,
    coalesce(total_count, 0),
    coalesce(window_count, 0),
    coalesce(window_subjects, 0),
    coalesce(window_months, 0),
    coalesce(window_revoked, 0),
    active_flag,
    first_confirmed_at,
    window_earliest;
end;
$$;

-- Appends an observation (and audit event) only when the computed tier differs from the Member's most
-- recent observation, or none exists yet and the tier is not 'none'. Actor is always the invoking
-- Moderator, so this can only be called from moderator-attributable command paths.
create function private.observe_contributor_status(
  target_member_id uuid,
  reason text,
  command_request_id uuid
)
returns table (status text, policy_version text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  computed record;
  previous_status text;
begin
  select derived.status, derived.policy_version
  into computed
  from private.compute_contributor_status(target_member_id) as derived;

  select observation.status into previous_status
  from private.contributor_status_observations as observation
  where observation.member_id = target_member_id
  order by observation.observed_at desc, observation.id desc
  limit 1;

  if previous_status is distinct from computed.status
    and (previous_status is not null or computed.status <> 'none')
  then
    insert into private.contributor_status_observations (
      member_id, status, policy_version, trigger_reason, request_id
    ) values (
      target_member_id, computed.status, computed.policy_version, reason, command_request_id
    )
    on conflict (member_id, request_id) do nothing;

    perform private.append_audit_event(
      'contributor.status_changed',
      'member_account',
      target_member_id,
      command_request_id,
      jsonb_strip_nulls(jsonb_build_object(
        'previous_status', previous_status,
        'status', computed.status,
        'policy_version', computed.policy_version,
        'trigger_reason', reason
      ))
    );
  end if;

  return query select computed.status, computed.policy_version;
end;
$$;

-- Redefines missing-place-suggestion's confirm_suggestion_contribution with the identical signature. Adds source-agnostic
-- subject_place_id denormalization and a contributor-status observation after confirmation.
create or replace function public.confirm_suggestion_contribution(
  requested_suggestion_id uuid,
  command_request_id uuid
)
returns table (
  contribution_id uuid,
  confirmed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  suggestion_record private.place_suggestions%rowtype;
  contribution_record private.contributions%rowtype;
begin
  if requested_suggestion_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Contribution confirmation identifiers are required';
  end if;

  select suggestion.* into suggestion_record
  from private.place_suggestions as suggestion
  where suggestion.id = requested_suggestion_id
  for update;

  if not found or suggestion_record.status <> 'accepted' then
    raise exception using errcode = '22023', message = 'Only an accepted Suggestion can create a Contribution';
  end if;

  select contribution.* into contribution_record
  from private.contributions as contribution
  where contribution.suggestion_id = requested_suggestion_id;

  if found then
    return query select contribution_record.id, contribution_record.confirmed_at;
    return;
  end if;

  insert into private.contributions (
    suggestion_id,
    member_id,
    confirmed_by,
    confirmation_request_id,
    subject_place_id
  ) values (
    requested_suggestion_id,
    suggestion_record.member_id,
    actor_id,
    command_request_id,
    suggestion_record.candidate_place_id
  )
  returning * into contribution_record;

  perform private.append_audit_event(
    'suggestion.contribution_confirmed',
    'suggestion',
    requested_suggestion_id,
    command_request_id,
    jsonb_build_object('contribution_id', contribution_record.id)
  );

  perform private.observe_contributor_status(
    suggestion_record.member_id,
    'contribution_confirmed',
    command_request_id
  );

  return query select contribution_record.id, contribution_record.confirmed_at;
end;
$$;

create function public.revoke_contribution(
  requested_contribution_id uuid,
  reason text,
  command_request_id uuid
)
returns table (contribution_id uuid, revoked_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  contribution_record private.contributions%rowtype;
begin
  if requested_contribution_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Contribution revocation identifiers are required';
  end if;

  if nullif(btrim(reason), '') is null then
    raise exception using errcode = '22023', message = 'A revocation reason is required';
  end if;

  select contribution.* into contribution_record
  from private.contributions as contribution
  where contribution.id = requested_contribution_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Contribution was not found';
  end if;

  if contribution_record.revoked_at is not null then
    if contribution_record.revocation_request_id = command_request_id then
      return query select contribution_record.id, contribution_record.revoked_at;
      return;
    end if;
    raise exception using errcode = '55006', message = 'Contribution is already revoked';
  end if;

  update private.contributions as contribution
  set
    revoked_at = statement_timestamp(),
    revoked_by = actor_id,
    revoked_reason = btrim(reason),
    revocation_request_id = command_request_id
  where contribution.id = requested_contribution_id
  returning contribution.* into contribution_record;

  perform private.append_audit_event(
    'contributor.contribution_revoked',
    'contribution',
    requested_contribution_id,
    command_request_id,
    jsonb_build_object('member_id', contribution_record.member_id, 'reason', btrim(reason))
  );

  perform private.observe_contributor_status(
    contribution_record.member_id,
    'contribution_revoked',
    command_request_id
  );

  return query select contribution_record.id, contribution_record.revoked_at;
end;
$$;

create function public.record_member_conduct_flag(
  requested_member_id uuid,
  flag_kind text,
  reason text,
  related_contribution_id uuid,
  command_request_id uuid
)
returns table (flag_id uuid, recorded_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  flag_record private.member_conduct_flags%rowtype;
begin
  if requested_member_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Conduct flag identifiers are required';
  end if;

  if flag_kind <> all (array['fraud', 'abuse', 'policy_violation']::text[]) then
    raise exception using errcode = '22023', message = 'Conduct flag kind is invalid';
  end if;

  if nullif(btrim(reason), '') is null then
    raise exception using errcode = '22023', message = 'A conduct flag reason is required';
  end if;

  if not exists (
    select 1 from private.member_accounts as member where member.user_id = requested_member_id
  ) then
    raise exception using errcode = '22023', message = 'Member was not found';
  end if;

  if related_contribution_id is not null and not exists (
    select 1
    from private.contributions as contribution
    where contribution.id = related_contribution_id
      and contribution.member_id = requested_member_id
  ) then
    raise exception using errcode = '22023', message = 'Related Contribution does not belong to this Member';
  end if;

  insert into private.member_conduct_flags (
    member_id, flag_kind, reason, recorded_by, request_id, related_contribution_id
  ) values (
    requested_member_id, flag_kind, btrim(reason), actor_id, command_request_id, related_contribution_id
  )
  on conflict (member_id, request_id) do nothing
  returning * into flag_record;

  if not found then
    select * into flag_record
    from private.member_conduct_flags as flag
    where flag.member_id = requested_member_id and flag.request_id = command_request_id;
  else
    perform private.append_audit_event(
      'contributor.conduct_flag_recorded',
      'member_account',
      requested_member_id,
      command_request_id,
      jsonb_build_object('flag_id', flag_record.id, 'flag_kind', flag_kind)
    );

    perform private.observe_contributor_status(
      requested_member_id,
      'conduct_flag_recorded',
      command_request_id
    );
  end if;

  return query select flag_record.id, flag_record.recorded_at;
end;
$$;

create function public.clear_member_conduct_flag(
  requested_flag_id uuid,
  reason text,
  command_request_id uuid
)
returns table (flag_id uuid, cleared_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  original_flag private.member_conduct_flags%rowtype;
  clearing_record private.member_conduct_flags%rowtype;
begin
  if requested_flag_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Conduct flag clearance identifiers are required';
  end if;

  if nullif(btrim(reason), '') is null then
    raise exception using errcode = '22023', message = 'A clearance reason is required';
  end if;

  select flag.* into original_flag
  from private.member_conduct_flags as flag
  where flag.id = requested_flag_id;

  if not found or original_flag.flag_kind = 'flag_cleared' then
    raise exception using errcode = '22023', message = 'Conduct flag was not found';
  end if;

  select clearing.* into clearing_record
  from private.member_conduct_flags as clearing
  where clearing.flag_kind = 'flag_cleared' and clearing.cleared_flag_id = requested_flag_id;

  if found then
    if clearing_record.request_id = command_request_id then
      return query select clearing_record.id, clearing_record.recorded_at;
      return;
    end if;
    raise exception using errcode = '55006', message = 'Conduct flag is already cleared';
  end if;

  insert into private.member_conduct_flags (
    member_id, flag_kind, reason, recorded_by, request_id, cleared_flag_id
  ) values (
    original_flag.member_id, 'flag_cleared', btrim(reason), actor_id, command_request_id, requested_flag_id
  )
  on conflict (member_id, request_id) do nothing
  returning * into clearing_record;

  if not found then
    select * into clearing_record
    from private.member_conduct_flags as flag
    where flag.member_id = original_flag.member_id and flag.request_id = command_request_id;
  else
    perform private.append_audit_event(
      'contributor.conduct_flag_cleared',
      'member_account',
      original_flag.member_id,
      command_request_id,
      jsonb_build_object('cleared_flag_id', requested_flag_id)
    );

    perform private.observe_contributor_status(
      original_flag.member_id,
      'conduct_flag_cleared',
      command_request_id
    );
  end if;

  return query select clearing_record.id, clearing_record.recorded_at;
end;
$$;

create function public.recalculate_member_contributor_status(
  requested_member_id uuid,
  command_request_id uuid
)
returns table (status text, policy_version text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform security.require_moderator();

  if requested_member_id is null or command_request_id is null then
    raise exception using errcode = '22023', message = 'Recalculation identifiers are required';
  end if;

  if not exists (
    select 1 from private.member_accounts as member where member.user_id = requested_member_id
  ) then
    raise exception using errcode = '22023', message = 'Member was not found';
  end if;

  return query
  select observation.status, observation.policy_version
  from private.observe_contributor_status(requested_member_id, 'recalculation', command_request_id)
    as observation;
end;
$$;

-- Private, non-gameable status view. Callers receive only a tier and a "since" timestamp - never a
-- count, ratio, or "N more needed" figure, per the human interrupt against volume-incentive displays.
create function public.get_my_contributor_status()
returns table (status text, policy_version text, status_since timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  computed record;
begin
  select derived.status, derived.policy_version, derived.first_net_accepted_at, derived.window_since
  into computed
  from private.compute_contributor_status(actor_id) as derived;

  return query select
    computed.status,
    computed.policy_version,
    case
      when computed.status = 'trusted_contributor' then computed.window_since
      when computed.status = 'contributor' then computed.first_net_accepted_at
      else null
    end;
end;
$$;

-- Full detail for a Moderator reviewing one Member's evidence history and prioritization signal.
create function public.get_moderation_contributor_status(requested_member_id uuid)
returns table (
  status text,
  policy_version text,
  net_accepted_total integer,
  net_accepted_in_window integer,
  distinct_subjects_in_window integer,
  distinct_months_in_window integer,
  revoked_in_window integer,
  has_active_flag boolean,
  first_net_accepted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_moderator();
  if requested_member_id is null then
    raise exception using errcode = '22023', message = 'Member identifier is required';
  end if;

  return query
  select
    derived.status,
    derived.policy_version,
    derived.net_accepted_total,
    derived.net_accepted_in_window,
    derived.distinct_subjects_in_window,
    derived.distinct_months_in_window,
    derived.revoked_in_window,
    derived.has_active_flag,
    derived.first_net_accepted_at
  from private.compute_contributor_status(requested_member_id) as derived;
end;
$$;

create function public.list_moderation_contributor_evidence(requested_member_id uuid)
returns table (
  contribution_id uuid,
  subject_place_id uuid,
  confirmed_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  flag_id uuid,
  flag_kind text,
  flag_reason text,
  flag_recorded_at timestamptz,
  flag_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_moderator();
  if requested_member_id is null then
    raise exception using errcode = '22023', message = 'Member identifier is required';
  end if;

  return query
  select * from (
    select
      contribution.id as contribution_id,
      contribution.subject_place_id as subject_place_id,
      contribution.confirmed_at as confirmed_at,
      contribution.revoked_at as revoked_at,
      contribution.revoked_reason as revoked_reason,
      null::uuid as flag_id,
      null::text as flag_kind,
      null::text as flag_reason,
      null::timestamptz as flag_recorded_at,
      null::boolean as flag_active
    from private.contributions as contribution
    where contribution.member_id = requested_member_id
    union all
    select
      null::uuid as contribution_id,
      null::uuid as subject_place_id,
      null::timestamptz as confirmed_at,
      null::timestamptz as revoked_at,
      null::text as revoked_reason,
      flag.id as flag_id,
      flag.flag_kind as flag_kind,
      flag.reason as flag_reason,
      flag.recorded_at as flag_recorded_at,
      (
        flag.flag_kind <> 'flag_cleared'
        and not exists (
          select 1 from private.member_conduct_flags as clearing
          where clearing.flag_kind = 'flag_cleared' and clearing.cleared_flag_id = flag.id
        )
      ) as flag_active
    from private.member_conduct_flags as flag
    where flag.member_id = requested_member_id
  ) as evidence
  order by evidence.confirmed_at desc nulls last, evidence.flag_recorded_at desc nulls last;
end;
$$;

-- Lightweight, batched signal used only to apply a bounded, in-page reorder of the existing Moderator
-- Suggestion queue. Never used to change which page or cursor a Suggestion is fetched under.
create function public.list_member_contributor_priority(requested_member_ids uuid[])
returns table (member_id uuid, status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_moderator();
  if requested_member_ids is null or array_length(requested_member_ids, 1) is null then
    return;
  end if;

  return query
  select requested.member_id, derived.status
  from (select distinct t.member_id from unnest(requested_member_ids) as t (member_id)) as requested
  cross join lateral private.compute_contributor_status(requested.member_id) as derived;
end;
$$;

create function public.configure_contributor_status_policy(
  requested_policy_version text,
  requested_trusted_minimum_net_accepted integer,
  requested_trusted_window_seconds integer,
  requested_trusted_minimum_distinct_months integer,
  requested_trusted_minimum_distinct_subjects integer,
  requested_trusted_maximum_revoked_in_window integer,
  requested_enabled boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(requested_policy_version), '') is null
    or requested_trusted_minimum_net_accepted <= 0
    or requested_trusted_window_seconds <= 0
    or requested_trusted_minimum_distinct_months <= 0
    or requested_trusted_minimum_distinct_subjects <= 0
    or requested_trusted_maximum_revoked_in_window < 0
  then
    raise exception using errcode = '22023', message = 'Contributor status policy is invalid';
  end if;

  insert into private.contributor_status_policy (
    singleton,
    policy_version,
    trusted_minimum_net_accepted,
    trusted_window,
    trusted_minimum_distinct_months,
    trusted_minimum_distinct_subjects,
    trusted_maximum_revoked_in_window,
    enabled,
    updated_at
  ) values (
    true,
    btrim(requested_policy_version),
    requested_trusted_minimum_net_accepted,
    make_interval(secs => requested_trusted_window_seconds),
    requested_trusted_minimum_distinct_months,
    requested_trusted_minimum_distinct_subjects,
    requested_trusted_maximum_revoked_in_window,
    requested_enabled,
    statement_timestamp()
  )
  on conflict (singleton) do update set
    policy_version = excluded.policy_version,
    trusted_minimum_net_accepted = excluded.trusted_minimum_net_accepted,
    trusted_window = excluded.trusted_window,
    trusted_minimum_distinct_months = excluded.trusted_minimum_distinct_months,
    trusted_minimum_distinct_subjects = excluded.trusted_minimum_distinct_subjects,
    trusted_maximum_revoked_in_window = excluded.trusted_maximum_revoked_in_window,
    enabled = excluded.enabled,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on private.contributor_status_policy from public, anon, authenticated, service_role;
revoke all on private.member_conduct_flags from public, anon, authenticated, service_role;
revoke all on private.contributor_status_observations from public, anon, authenticated, service_role;

revoke execute on function private.has_active_conduct_flag(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.compute_contributor_status(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.observe_contributor_status(uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.reject_conduct_flag_mutation()
  from public, anon, authenticated, service_role;
revoke execute on function private.reject_contributor_status_observation_mutation()
  from public, anon, authenticated, service_role;

revoke execute on function public.confirm_suggestion_contribution(uuid, uuid)
  from public, anon, service_role;
revoke execute on function public.revoke_contribution(uuid, text, uuid)
  from public, anon, service_role;
revoke execute on function public.record_member_conduct_flag(uuid, text, text, uuid, uuid)
  from public, anon, service_role;
revoke execute on function public.clear_member_conduct_flag(uuid, text, uuid)
  from public, anon, service_role;
revoke execute on function public.recalculate_member_contributor_status(uuid, uuid)
  from public, anon, service_role;
revoke execute on function public.get_my_contributor_status()
  from public, anon, service_role;
revoke execute on function public.get_moderation_contributor_status(uuid)
  from public, anon, service_role;
revoke execute on function public.list_moderation_contributor_evidence(uuid)
  from public, anon, service_role;
revoke execute on function public.list_member_contributor_priority(uuid[])
  from public, anon, service_role;
revoke execute on function public.configure_contributor_status_policy(
  text, integer, integer, integer, integer, integer, boolean
) from public, anon, authenticated;

grant execute on function public.confirm_suggestion_contribution(uuid, uuid) to authenticated;
grant execute on function public.revoke_contribution(uuid, text, uuid) to authenticated;
grant execute on function public.record_member_conduct_flag(uuid, text, text, uuid, uuid) to authenticated;
grant execute on function public.clear_member_conduct_flag(uuid, text, uuid) to authenticated;
grant execute on function public.recalculate_member_contributor_status(uuid, uuid) to authenticated;
grant execute on function public.get_my_contributor_status() to authenticated;
grant execute on function public.get_moderation_contributor_status(uuid) to authenticated;
grant execute on function public.list_moderation_contributor_evidence(uuid) to authenticated;
grant execute on function public.list_member_contributor_priority(uuid[]) to authenticated;
grant execute on function public.configure_contributor_status_policy(
  text, integer, integer, integer, integer, integer, boolean
) to service_role;

comment on table private.contributor_status_policy is
  'Versioned, service-role-only configurable Trusted Contributor qualification policy. No enabled row means Trusted Contributor status is unreachable pending explicit owner approval.';
comment on table private.member_conduct_flags is
  'Append-only abuse/fraud signal ledger, independent of any specific Contribution. A flag is cleared by inserting a new flag_cleared row, never by mutation.';
comment on table private.contributor_status_observations is
  'Append-only audit trail of computed contributor status transitions. Never the source of truth: status is always recomputed live from private.contributions.';
comment on function private.compute_contributor_status(uuid) is
  'Pure, reproducible Contributor/Trusted Contributor derivation from private.contributions alone plus the current policy. Never joins any submission-kind table.';
comment on function public.confirm_suggestion_contribution(uuid, uuid) is
  'Idempotently confirms useful value only after a Suggestion has been accepted, denormalizing subject_place_id and observing the resulting contributor status.';
comment on function public.revoke_contribution(uuid, text, uuid) is
  'Moderator-only reversal of a Contribution''s credit, preserving the historical row for audit.';
comment on function public.get_my_contributor_status() is
  'Returns only the caller''s current tier and a since-date, deliberately excluding any numeric progress toward the next tier.';
comment on function public.configure_contributor_status_policy(
  text, integer, integer, integer, integer, integer, boolean
) is
  'Service-role-only configuration boundary. Trusted Contributor status ships dark pending explicit owner-approved thresholds.';

commit;
