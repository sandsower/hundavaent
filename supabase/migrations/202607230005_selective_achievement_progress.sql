begin;

-- Locked Achievement presentation is versioned with the catalogue.
-- The default is surprise so a newly inserted definition cannot leak before its presentation
-- policy is deliberately chosen.
alter table private.achievement_definitions
  add column locked_visibility text not null default 'surprise',
  add column progress_kind text;

-- Eligibility starts only when the service-role launch boundary first enables Achievements.
-- Keeping the timestamp on the policy makes launch future-only without rewriting durable activity.
alter table private.achievement_policy
  add column eligibility_started_at timestamptz;

create function private.reject_achievement_eligibility_start_change()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  if old.eligibility_started_at is not null
    and new.eligibility_started_at is distinct from old.eligibility_started_at
  then
    raise exception using
      errcode = '55000',
      message = 'Achievement eligibility start is immutable once set';
  end if;

  return new;
end;
$$;

create trigger achievement_policy_reject_eligibility_start_change
before update on private.achievement_policy
for each row execute function private.reject_achievement_eligibility_start_change();

create or replace function public.configure_achievement_policy(
  requested_policy_version text,
  requested_credit_spacing_minutes integer,
  requested_enabled boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into private.achievement_policy as policy (
    singleton,
    policy_version,
    credit_spacing_minutes,
    enabled,
    eligibility_started_at,
    updated_at
  ) values (
    true,
    requested_policy_version,
    requested_credit_spacing_minutes,
    requested_enabled,
    case when requested_enabled then statement_timestamp() end,
    statement_timestamp()
  )
  on conflict (singleton) do update set
    policy_version = excluded.policy_version,
    credit_spacing_minutes = excluded.credit_spacing_minutes,
    enabled = excluded.enabled,
    eligibility_started_at = coalesce(
      policy.eligibility_started_at,
      excluded.eligibility_started_at
    ),
    updated_at = statement_timestamp();
end;
$$;

alter table private.achievement_definitions
  add constraint achievement_definitions_locked_visibility_check
    check (locked_visibility in ('milestone', 'surprise')),
  add constraint achievement_definitions_progress_kind_check
    check (
      progress_kind is null
      or progress_kind in (
        'credited_places',
        'credited_categories',
        'credited_municipalities'
      )
    ),
  add constraint achievement_definitions_milestone_progress_check
    check (
      (locked_visibility = 'milestone' and progress_kind is not null)
      or (locked_visibility = 'surprise' and progress_kind is null)
    );

update private.achievement_definitions
set
  locked_visibility = 'milestone',
  progress_kind = case key
    when 'explorer_ten_places' then 'credited_places'
    when 'category_curious' then 'credited_categories'
    when 'capital_region_wanderer' then 'credited_municipalities'
  end
where key in (
  'explorer_ten_places',
  'category_curious',
  'capital_region_wanderer'
);

-- The original contract states that a Member earns each key once ever.
-- Make that invariant structural rather than relying only on evaluator control flow.
create unique index achievement_unlocks_member_key_idx
  on private.achievement_unlocks (member_id, achievement_key);

create index achievement_unlocks_unread_member_idx
  on private.achievement_unlocks (member_id)
  where notified_at is null;

-- Ignore Check-ins from before first activation.
-- Filtering before the per-Place minimum lets a post-activation revisit become that Place's
-- first eligible Check-in without treating its historical visit as progress.
create or replace function private.credit_spaced_places(
  target_member_id uuid,
  as_of timestamptz,
  spacing_minutes integer
)
returns table (place_id uuid, first_seen_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eligibility_start timestamptz;
  place_row record;
  last_counted timestamptz := null;
  spacing interval := make_interval(mins => spacing_minutes);
begin
  select policy.eligibility_started_at into eligibility_start
  from private.achievement_policy as policy
  where policy.singleton
    and policy.enabled
    and policy.eligibility_started_at is not null;

  if not found then
    return;
  end if;

  for place_row in (
    select check_in.place_id as candidate_place_id, min(check_in.checked_in_at) as first_at
    from private.check_ins as check_in
    where check_in.member_id = target_member_id
      and check_in.checked_in_at >= eligibility_start
      and check_in.checked_in_at <= as_of
    group by check_in.place_id
    order by min(check_in.checked_in_at)
  ) loop
    if last_counted is null or place_row.first_at - last_counted >= spacing then
      last_counted := place_row.first_at;
      place_id := place_row.candidate_place_id;
      first_seen_at := place_row.first_at;
      return next;
    end if;
  end loop;
  return;
end;
$$;

-- Re-pin every criterion to the immutable first-activation boundary.
-- This prevents a post-launch event from awarding an Achievement using pre-launch history.
create or replace function private.evaluate_achievement_criteria(
  achievement_key text,
  target_member_id uuid,
  as_of timestamptz,
  spacing_minutes integer,
  requested_version integer default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  criteria jsonb;
  eligibility_start timestamptz;
  member_created_at timestamptz;
  effective_membership_start timestamptz;
  contributor_policy private.contributor_status_policy%rowtype;
  contribution_window_start timestamptz;
  contribution_count integer;
  contribution_subjects integer;
  contribution_months integer;
  revoked_count integer;
  result boolean := false;
begin
  select policy.eligibility_started_at into eligibility_start
  from private.achievement_policy as policy
  where policy.singleton
    and policy.enabled
    and policy.eligibility_started_at is not null;

  if not found or as_of < eligibility_start then
    return false;
  end if;

  select definition.criteria into criteria
  from private.achievement_definitions as definition
  where definition.key = achievement_key
    and (requested_version is null or definition.version = requested_version)
  order by definition.version desc
  limit 1;

  if criteria is null then
    return false;
  end if;

  case achievement_key
    when 'first_favourite' then
      select exists (
        select 1
        from private.member_favourites as favourite
        where favourite.user_id = target_member_id
          and favourite.created_at >= eligibility_start
          and favourite.created_at <= as_of
      ) into result;
    when 'first_rating' then
      select exists (
        select 1
        from private.dog_friendliness_ratings as rating
        where rating.member_id = target_member_id
          and rating.excluded_at is null
          and rating.created_at >= eligibility_start
          and rating.created_at <= as_of
      ) into result;
    when 'first_checkin' then
      select exists (
        select 1
        from private.check_ins as check_in
        where check_in.member_id = target_member_id
          and check_in.checked_in_at >= eligibility_start
          and check_in.checked_in_at <= as_of
      ) into result;
    when 'explorer_ten_places' then
      select count(*) >= (criteria ->> 'distinct_places')::integer
      from private.credit_spaced_places(target_member_id, as_of, spacing_minutes)
      into result;
    when 'category_curious' then
      select count(distinct private.place_category_group(place.category))
          >= (criteria ->> 'distinct_categories')::integer
      from private.credit_spaced_places(target_member_id, as_of, spacing_minutes) as spaced
      join private.places as place on place.id = spaced.place_id
      into result;
    when 'capital_region_wanderer' then
      select count(distinct location.municipality)
          >= (criteria ->> 'distinct_municipalities')::integer
      from private.credit_spaced_places(target_member_id, as_of, spacing_minutes) as spaced
      join private.places as place on place.id = spaced.place_id
      join private.locations as location on location.id = place.location_id
      into result;
    when 'first_accepted_contribution' then
      select exists (
        select 1
        from private.contributions as contribution
        where contribution.member_id = target_member_id
          and contribution.revoked_at is null
          and contribution.confirmed_at >= eligibility_start
          and contribution.confirmed_at <= as_of
      ) into result;
    when 'sustained_quality_contributor' then
      select policy.* into contributor_policy
      from private.contributor_status_policy as policy
      where policy.singleton and policy.enabled;

      if found and not private.has_active_conduct_flag(target_member_id) then
        contribution_window_start := greatest(
          eligibility_start,
          as_of - contributor_policy.trusted_window
        );

        select
          count(*),
          count(distinct contribution.subject_place_id)
            filter (where contribution.subject_place_id is not null),
          count(distinct date_trunc('month', contribution.confirmed_at))
        into contribution_count, contribution_subjects, contribution_months
        from private.contributions as contribution
        where contribution.member_id = target_member_id
          and contribution.revoked_at is null
          and contribution.confirmed_at >= contribution_window_start
          and contribution.confirmed_at <= as_of;

        select count(*) into revoked_count
        from private.contributions as contribution
        where contribution.member_id = target_member_id
          and contribution.revoked_at is not null
          and contribution.revoked_at >= contribution_window_start
          and contribution.revoked_at <= as_of;

        result :=
          contribution_count >= contributor_policy.trusted_minimum_net_accepted
          and contribution_subjects >= contributor_policy.trusted_minimum_distinct_subjects
          and contribution_months >= contributor_policy.trusted_minimum_distinct_months
          and revoked_count <= contributor_policy.trusted_maximum_revoked_in_window;
      end if;
    when 'six_month_member' then
      select member_account.created_at into member_created_at
      from private.member_accounts as member_account
      where member_account.user_id = target_member_id;

      if member_created_at is not null then
        effective_membership_start := greatest(member_created_at, eligibility_start);
        select
          as_of >= effective_membership_start
            + make_interval(months => (criteria ->> 'months_elapsed')::integer)
          and (
            select count(distinct date_trunc('month', activity.occurred_at))
            from private.member_activity_event_times(
              target_member_id,
              effective_membership_start,
              effective_membership_start
                + make_interval(months => (criteria ->> 'months_elapsed')::integer)
            ) as activity
          ) >= (criteria ->> 'distinct_active_months')::integer
        into result;
      end if;
    when 'one_year_member' then
      select member_account.created_at into member_created_at
      from private.member_accounts as member_account
      where member_account.user_id = target_member_id;

      if member_created_at is not null then
        effective_membership_start := greatest(member_created_at, eligibility_start);
        select
          as_of >= effective_membership_start
            + make_interval(months => (criteria ->> 'months_elapsed')::integer)
          and (
            select count(distinct date_trunc('month', activity.occurred_at))
            from private.member_activity_event_times(
              target_member_id,
              effective_membership_start,
              effective_membership_start
                + make_interval(months => (criteria ->> 'months_elapsed')::integer)
            ) as activity
          ) >= (criteria ->> 'distinct_active_months')::integer
        into result;
      end if;
    else
      result := false;
  end case;

  return coalesce(result, false);
end;
$$;

-- Match the structural one-unlock-per-key invariant when concurrent evaluators straddle a
-- definition-version change.
create or replace function private.evaluate_achievement_unlocks(
  target_member_id uuid,
  reason text,
  as_of timestamptz default now()
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  policy_record private.achievement_policy%rowtype;
  has_flag boolean;
  definition_row record;
  qualifies boolean;
begin
  select policy.* into policy_record
  from private.achievement_policy as policy
  where policy.singleton
    and policy.enabled
    and policy.eligibility_started_at is not null;

  if not found or as_of < policy_record.eligibility_started_at then
    return;
  end if;

  if reason in (
    'contribution_revoked',
    'rating_excluded',
    'conduct_flag_recorded',
    'moderator_recalculation'
  ) then
    for definition_row in (
      select unlock.id as unlock_id, unlock.achievement_key, unlock.definition_version
      from private.achievement_unlocks as unlock
      where unlock.member_id = target_member_id
    ) loop
      qualifies := private.evaluate_achievement_criteria(
        definition_row.achievement_key,
        target_member_id,
        as_of,
        policy_record.credit_spacing_minutes,
        definition_row.definition_version
      );

      if not qualifies then
        insert into private.achievement_recalculations (
          unlock_id,
          member_id,
          achievement_key,
          definition_version,
          reason,
          triggering_event
        ) values (
          definition_row.unlock_id,
          target_member_id,
          definition_row.achievement_key,
          definition_row.definition_version,
          'Recomputed criteria no longer satisfied; the badge persists per the Achievement persistence policy.',
          reason
        );
      end if;
    end loop;
  end if;

  has_flag := private.has_active_conduct_flag(target_member_id);

  if has_flag then
    return;
  end if;

  for definition_row in (
    select definition.key, definition.version
    from private.achievement_definitions as definition
    where definition.version = (
      select max(other.version)
      from private.achievement_definitions as other
      where other.key = definition.key
    )
    and not exists (
      select 1
      from private.achievement_unlocks as unlock
      where unlock.member_id = target_member_id
        and unlock.achievement_key = definition.key
    )
  ) loop
    qualifies := private.evaluate_achievement_criteria(
      definition_row.key,
      target_member_id,
      as_of,
      policy_record.credit_spacing_minutes,
      definition_row.version
    );

    if qualifies then
      insert into private.achievement_unlocks (
        member_id,
        achievement_key,
        definition_version
      )
      values (
        target_member_id,
        definition_row.key,
        definition_row.version
      )
      on conflict (member_id, achievement_key) do nothing;
    end if;
  end loop;
end;
$$;

-- Tighten the immutable trigger so even a null-to-null no-op update is rejected.
create or replace function private.reject_achievement_unlock_update()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception using
      errcode = '55000',
      message = 'Achievement unlocks are immutable once earned; only deletion (account-deletion cleanup) is permitted';
  end if;

  if new.id is distinct from old.id
    or new.member_id is distinct from old.member_id
    or new.achievement_key is distinct from old.achievement_key
    or new.definition_version is distinct from old.definition_version
    or new.earned_at is distinct from old.earned_at
    or old.notified_at is not null
    or new.notified_at is null
  then
    raise exception using
      errcode = '55000',
      message = 'Achievement unlocks are immutable once earned; only the private notified_at acknowledgment may be set once, from null';
  end if;

  return new;
end;
$$;

-- Progress is recomputed from the same credited Place sequence used by unlock evaluation.
-- It is never stored and therefore cannot drift from durable Check-ins or the anti-burst rule.
create function private.get_member_achievement_progress(
  target_member_id uuid,
  as_of timestamptz,
  spacing_minutes integer
)
returns table (
  achievement_key text,
  progress_kind text,
  current_value integer,
  target_value integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  definition_row record;
  calculated_current integer;
  calculated_target integer;
begin
  for definition_row in (
    select
      definition.key,
      definition.progress_kind,
      definition.criteria
    from private.achievement_definitions as definition
    where definition.version = (
      select max(other.version)
      from private.achievement_definitions as other
      where other.key = definition.key
    )
      and definition.locked_visibility = 'milestone'
    order by definition.display_order, definition.key
  ) loop
    calculated_current := 0;
    calculated_target := case definition_row.progress_kind
      when 'credited_places' then
        (definition_row.criteria ->> 'distinct_places')::integer
      when 'credited_categories' then
        (definition_row.criteria ->> 'distinct_categories')::integer
      when 'credited_municipalities' then
        (definition_row.criteria ->> 'distinct_municipalities')::integer
    end;

    case definition_row.progress_kind
      when 'credited_places' then
        select count(*)::integer into calculated_current
        from private.credit_spaced_places(
          target_member_id,
          as_of,
          spacing_minutes
        );
      when 'credited_categories' then
        select count(distinct private.place_category_group(place.category))::integer
        into calculated_current
        from private.credit_spaced_places(
          target_member_id,
          as_of,
          spacing_minutes
        ) as spaced
        join private.places as place on place.id = spaced.place_id;
      when 'credited_municipalities' then
        select count(distinct location.municipality)::integer
        into calculated_current
        from private.credit_spaced_places(
          target_member_id,
          as_of,
          spacing_minutes
        ) as spaced
        join private.places as place on place.id = spaced.place_id
        join private.locations as location on location.id = place.location_id;
      else
        continue;
    end case;

    achievement_key := definition_row.key;
    progress_kind := definition_row.progress_kind;
    current_value := least(calculated_current, calculated_target);
    target_value := calculated_target;
    return next;
  end loop;
end;
$$;

revoke execute on function private.get_member_achievement_progress(
  uuid,
  timestamptz,
  integer
) from public, anon, authenticated, service_role;
revoke execute on function private.reject_achievement_eligibility_start_change()
  from public, anon, authenticated, service_role;

-- The catalogue is now a pure read.
-- It returns every earned entry plus no more than two started exploration milestones.
-- The original columns are retained for migration-first deployment compatibility.
drop function public.get_my_achievements();

create function public.get_my_achievements()
returns table (
  enabled boolean,
  achievement_key text,
  achievement_group text,
  display_order integer,
  name_is text,
  name_en text,
  description_is text,
  description_en text,
  earned_at timestamptz,
  is_new boolean,
  entry_kind text,
  progress_kind text,
  progress_current integer,
  progress_target integer
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
    return query select
      false,
      null::text,
      null::text,
      null::integer,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz,
      false,
      null::text,
      null::text,
      null::integer,
      null::integer;
    return;
  end if;

  return query
  with earned as (
    select
      true as enabled,
      definition.key as achievement_key,
      definition.achievement_group,
      definition.display_order,
      definition.name_is,
      definition.name_en,
      definition.description_is,
      definition.description_en,
      unlock.earned_at,
      false as is_new,
      'earned'::text as entry_kind,
      null::text as progress_kind,
      null::integer as progress_current,
      null::integer as progress_target
    from private.achievement_unlocks as unlock
    join private.achievement_definitions as definition
      on definition.key = unlock.achievement_key
      and definition.version = unlock.definition_version
    where unlock.member_id = actor_id
  ),
  milestone_candidates as (
    select
      true as enabled,
      definition.key as achievement_key,
      definition.achievement_group,
      definition.display_order,
      definition.name_is,
      definition.name_en,
      definition.description_is,
      definition.description_en,
      null::timestamptz as earned_at,
      false as is_new,
      'milestone'::text as entry_kind,
      progress.progress_kind,
      progress.current_value as progress_current,
      progress.target_value as progress_target,
      row_number() over (
        order by
          progress.current_value::numeric / progress.target_value desc,
          definition.display_order,
          definition.key
      ) as relevance_rank
    from private.get_member_achievement_progress(
      actor_id,
      statement_timestamp(),
      policy_record.credit_spacing_minutes
    ) as progress
    join private.achievement_definitions as definition
      on definition.key = progress.achievement_key
      and definition.version = (
        select max(other.version)
        from private.achievement_definitions as other
        where other.key = progress.achievement_key
      )
    where progress.current_value > 0
      and progress.current_value < progress.target_value
      and not exists (
        select 1
        from private.achievement_unlocks as unlock
        where unlock.member_id = actor_id
          and unlock.achievement_key = progress.achievement_key
      )
  ),
  visible as (
    select
      earned.enabled,
      earned.achievement_key,
      earned.achievement_group,
      earned.display_order,
      earned.name_is,
      earned.name_en,
      earned.description_is,
      earned.description_en,
      earned.earned_at,
      earned.is_new,
      earned.entry_kind,
      earned.progress_kind,
      earned.progress_current,
      earned.progress_target
    from earned
    union all
    select
      candidate.enabled,
      candidate.achievement_key,
      candidate.achievement_group,
      candidate.display_order,
      candidate.name_is,
      candidate.name_en,
      candidate.description_is,
      candidate.description_en,
      candidate.earned_at,
      candidate.is_new,
      candidate.entry_kind,
      candidate.progress_kind,
      candidate.progress_current,
      candidate.progress_target
    from milestone_candidates as candidate
    where candidate.relevance_rank <= 2
  )
  select
    visible.enabled,
    visible.achievement_key,
    visible.achievement_group,
    visible.display_order,
    visible.name_is,
    visible.name_en,
    visible.description_is,
    visible.description_en,
    visible.earned_at,
    visible.is_new,
    visible.entry_kind,
    visible.progress_kind,
    visible.progress_current,
    visible.progress_target
  from visible
  order by visible.display_order, visible.achievement_key;

  if not found then
    return query select
      true,
      null::text,
      null::text,
      null::integer,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz,
      false,
      null::text,
      null::text,
      null::integer,
      null::integer;
  end if;
end;
$$;

-- Header and account navigation may call this freely.
-- It exposes one boolean and never consumes the unread state.
create function public.get_my_achievement_status()
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
  select
    policy.enabled and policy.eligibility_started_at is not null
  into policy_enabled
  from private.achievement_policy as policy
  where policy.singleton;

  policy_enabled := coalesce(policy_enabled, false);

  return query
  select
    policy_enabled,
    policy_enabled and exists (
      select 1
      from private.achievement_unlocks as unlock
      where unlock.member_id = actor_id
        and unlock.notified_at is null
    );
end;
$$;

-- Only the mounted Achievement experience calls this through a POST action.
-- The Member-specific advisory lock and UPDATE predicate make concurrent claims exactly once.
create function public.claim_my_achievement_celebrations()
returns table (
  achievement_key text,
  achievement_group text,
  display_order integer,
  name_is text,
  name_en text,
  description_is text,
  description_en text,
  earned_at timestamptz
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
  -- The row lock serializes claims with the service-role configuration update.
  -- A disable that commits first makes this claim return nothing; a claim that locks first
  -- completes before the disable can become visible.
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
    pg_catalog.hashtextextended('achievement-claim:' || actor_id::text, 0)
  );

  return query
  with claimed as (
    update private.achievement_unlocks as unlock
    set notified_at = statement_timestamp()
    where unlock.member_id = actor_id
      and unlock.notified_at is null
    returning
      unlock.achievement_key,
      unlock.definition_version,
      unlock.earned_at
  )
  select
    definition.key,
    definition.achievement_group,
    definition.display_order,
    definition.name_is,
    definition.name_en,
    definition.description_is,
    definition.description_en,
    claimed.earned_at
  from claimed
  join private.achievement_definitions as definition
    on definition.key = claimed.achievement_key
    and definition.version = claimed.definition_version
  order by definition.display_order, definition.key;
end;
$$;

revoke execute on function public.get_my_achievements()
  from public, anon, service_role;
revoke execute on function public.get_my_achievement_status()
  from public, anon, service_role;
revoke execute on function public.claim_my_achievement_celebrations()
  from public, anon, service_role;

grant execute on function public.get_my_achievements() to authenticated;
grant execute on function public.get_my_achievement_status() to authenticated;
grant execute on function public.claim_my_achievement_celebrations() to authenticated;

comment on column private.achievement_definitions.locked_visibility is
  'Versioned private presentation policy. milestone may be selectively surfaced with progress; surprise remains absent until earned.';
comment on column private.achievement_definitions.progress_kind is
  'Closed progress calculation vocabulary for selectively surfaced milestones. Null for every surprise Achievement.';
comment on column private.achievement_policy.eligibility_started_at is
  'Immutable first-enable boundary. Durable activity before this instant is never counted toward Achievement progress or unlocks.';
comment on function private.get_member_achievement_progress(uuid, timestamptz, integer) is
  'Recomputes private milestone progress from the same anti-burst credited Place sequence used by unlock criteria.';
comment on function public.get_my_achievements() is
  'Pure caller-only read returning earned Achievements and at most two relevant locked milestones. Surprise definitions never leave the database before earning.';
comment on function public.get_my_achievement_status() is
  'Pure caller-only account-indicator read. Returns only enabled and has_unread and never acknowledges an unlock.';
comment on function public.claim_my_achievement_celebrations() is
  'Atomic caller-only claim used by the mounted Achievement experience. Policy changes serialize through the policy row, and each unread unlock can be returned for celebration exactly once.';

commit;
