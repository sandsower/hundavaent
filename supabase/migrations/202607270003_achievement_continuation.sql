begin;

-- Contribution recognition continues after Platinum without inventing more metal tiers. Reached
-- milestones are durable and acknowledged exactly once, just like Achievement unlocks.
create table private.achievement_collection_continuations (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  collection text not null references private.achievement_collections(key) on delete restrict,
  milestone integer not null check (milestone > 0),
  reached_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (member_id, collection, milestone),
  check (
    collection <> 'contributions'
    or milestone in (50, 100)
    or (milestone >= 250 and milestone % 250 = 0)
  )
);

create index achievement_collection_continuations_unread_idx
  on private.achievement_collection_continuations (member_id, reached_at)
  where notified_at is null;

revoke all on private.achievement_collection_continuations
  from public, anon, authenticated, service_role;
alter table private.achievement_collection_continuations enable row level security;

create function private.reject_achievement_continuation_update()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.member_id is distinct from old.member_id
    or new.collection is distinct from old.collection
    or new.milestone is distinct from old.milestone
    or new.reached_at is distinct from old.reached_at
    or old.notified_at is not null
    or new.notified_at is null
  then
    raise exception using
      errcode = '55000',
      message = 'Achievement continuation records are immutable; only notified_at may be set once';
  end if;

  return new;
end;
$$;

create trigger achievement_continuations_reject_update
before update on private.achievement_collection_continuations
for each row execute function private.reject_achievement_continuation_update();

create function private.reached_contribution_milestones(confirmed_count integer)
returns table (milestone integer)
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select 50 where confirmed_count >= 50
  union all
  select 100 where confirmed_count >= 100
  union all
  select generated::integer
  from generate_series(250, confirmed_count, 250) as generated
  where confirmed_count >= 250
  order by 1;
$$;

create function private.evaluate_contribution_continuations(
  target_member_id uuid,
  as_of timestamptz default now()
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  confirmed_count integer;
begin
  if private.has_active_conduct_flag(target_member_id) then
    return;
  end if;

  select count(*)::integer into confirmed_count
  from private.contributions as contribution
  join private.achievement_policy as policy
    on policy.singleton
    and policy.enabled
    and policy.eligibility_started_at is not null
  where contribution.member_id = target_member_id
    and contribution.revoked_at is null
    and contribution.confirmed_at >= policy.eligibility_started_at
    and contribution.confirmed_at <= as_of;

  insert into private.achievement_collection_continuations (
    member_id,
    collection,
    milestone,
    reached_at
  )
  select
    target_member_id,
    'contributions',
    reached.milestone,
    as_of
  from private.reached_contribution_milestones(coalesce(confirmed_count, 0)) as reached
  on conflict (member_id, collection, milestone) do nothing;
end;
$$;

-- Keep the established trigger seam and add the continuation pass after ordinary badge
-- evaluation. Revocations can produce recalculation findings but never erase reached milestones.
create or replace function private.evaluate_achievements_after_contribution()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reason text;
begin
  if tg_op = 'INSERT' then
    reason := 'contribution_confirmed';
  elsif new.revoked_at is not null and old.revoked_at is null then
    reason := 'contribution_revoked';
  else
    return new;
  end if;

  perform private.evaluate_achievement_unlocks(new.member_id, reason, statement_timestamp());

  if reason = 'contribution_confirmed' then
    perform private.evaluate_contribution_continuations(new.member_id, statement_timestamp());
  end if;

  return new;
end;
$$;

create or replace function private.detach_member_achievements(requested_member_id uuid)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  removed_count bigint;
  continuation_count bigint;
begin
  delete from private.achievement_collection_continuations as continuation
  where continuation.member_id = requested_member_id;
  get diagnostics continuation_count = row_count;

  delete from private.achievement_unlocks as unlock
  where unlock.member_id = requested_member_id;
  get diagnostics removed_count = row_count;

  return removed_count + continuation_count;
end;
$$;

create or replace function public.get_my_achievement_status()
returns table (
  enabled boolean,
  has_unread boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  policy_enabled boolean;
begin
  select policy.enabled and policy.eligibility_started_at is not null
  into policy_enabled
  from private.achievement_policy as policy
  where policy.singleton;

  policy_enabled := coalesce(policy_enabled, false);

  return query
  select
    policy_enabled,
    policy_enabled and (
      exists (
        select 1
        from private.achievement_unlocks as unlock
        where unlock.member_id = actor_id
          and unlock.notified_at is null
      )
      or exists (
        select 1
        from private.achievement_collection_continuations as continuation
        where continuation.member_id = actor_id
          and continuation.notified_at is null
      )
    );
end;
$$;

create function public.get_my_achievement_collection_progress()
returns table (
  collection text,
  progress_kind text,
  current_value integer,
  total_value integer,
  next_milestone integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  policy_record private.achievement_policy%rowtype;
begin
  select policy.* into policy_record
  from private.achievement_policy as policy
  where policy.singleton
    and policy.enabled
    and policy.eligibility_started_at is not null;

  if not found then
    return;
  end if;

  return query
  with metrics as materialized (
    select metric.progress_kind, metric.metric_value
    from private.member_achievement_metrics(
      actor_id,
      statement_timestamp(),
      policy_record.credit_spacing_minutes
    ) as metric
  ),
  place_totals as materialized (
    select
      count(*) filter (
        where place.lifecycle = 'published'::private.place_lifecycle
          and credited.place_id is not null
      )::integer as credited,
      count(*) filter (
        where place.lifecycle = 'published'::private.place_lifecycle
      )::integer as published
    from private.places as place
    left join private.credit_spaced_places(
      actor_id,
      statement_timestamp(),
      policy_record.credit_spacing_minutes
    ) as credited on credited.place_id = place.id
  ),
  contribution_count as (
    select coalesce(
      (select metrics.metric_value from metrics
       where metrics.progress_kind = 'confirmed_contributions'),
      0
    )::integer as value
  )
  select 'explorer_places', 'credited_place_coverage',
    place_totals.credited, place_totals.published, null::integer
  from place_totals
  union all
  select 'place_categories', 'credited_categories',
    coalesce(
      (select metrics.metric_value from metrics
       where metrics.progress_kind = 'credited_categories'),
      0
    ),
    5, null::integer
  union all
  select 'municipalities', 'credited_municipalities',
    coalesce(
      (select metrics.metric_value from metrics
       where metrics.progress_kind = 'credited_municipalities'),
      0
    ),
    7, null::integer
  union all
  select 'contributions', 'confirmed_contributions', contribution_count.value, null::integer,
    case
      when contribution_count.value < 50 then 50
      when contribution_count.value < 100 then 100
      when contribution_count.value < 250 then 250
      else ((contribution_count.value / 250) + 1) * 250
    end
  from contribution_count;
end;
$$;

create function public.claim_my_achievement_continuations()
returns table (
  collection text,
  milestone integer,
  reached_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  policy_record private.achievement_policy%rowtype;
begin
  select policy.* into policy_record
  from private.achievement_policy as policy
  where policy.singleton
  for share;

  if not found
    or not policy_record.enabled
    or policy_record.eligibility_started_at is null
  then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('achievement-continuation-claim:' || actor_id::text, 0)
  );

  return query
  with claimed as (
    update private.achievement_collection_continuations as continuation
    set notified_at = statement_timestamp()
    where continuation.member_id = actor_id
      and continuation.notified_at is null
    returning continuation.collection, continuation.milestone, continuation.reached_at
  )
  select claimed.collection, claimed.milestone, claimed.reached_at
  from claimed
  order by claimed.reached_at, claimed.milestone;
end;
$$;

revoke execute on function public.get_my_achievement_collection_progress()
  from public, anon, service_role;
revoke execute on function public.claim_my_achievement_continuations()
  from public, anon, service_role;

grant execute on function public.get_my_achievement_collection_progress() to authenticated;
grant execute on function public.claim_my_achievement_continuations() to authenticated;

comment on table private.achievement_collection_continuations is
  'Durable, non-tier collection milestones reached after Platinum. The Member sees each celebration exactly once.';
comment on function public.get_my_achievement_collection_progress() is
  'Caller-only live collection totals. Going Places returns a moving published-catalogue numerator and denominator; contributions include the next post-Platinum milestone.';
comment on function public.claim_my_achievement_continuations() is
  'Atomic caller-only claim for unread post-Platinum collection milestones.';

commit;
