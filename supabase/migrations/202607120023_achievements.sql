begin;

-- Private, non-competitive recognition of exploration and useful Contribution outcomes (achievement).
-- Fail-closed by construction: no enabled private.achievement_policy row means no unlock is ever
-- evaluated and every member-facing RPC reports the feature as disabled. Mirrors the fail-closed
-- shape of private.contributor_status_policy (contributor-recognition) and private.check_in_policy (private-check-in).
create table private.achievement_policy (
  singleton boolean primary key default true check (singleton),
  policy_version text not null check (btrim(policy_version) <> ''),
  credit_spacing_minutes integer not null check (credit_spacing_minutes > 0),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

revoke all on private.achievement_policy from public, anon, authenticated, service_role;
alter table private.achievement_policy enable row level security;

-- Versioned Achievement catalogue. criteria carries only numeric thresholds; the evaluation shape
-- per key is fixed SQL in private.evaluate_achievement_criteria. Changing a threshold ships a new
-- version rather than rewriting an earned instance's recorded copy and criteria.
create table private.achievement_definitions (
  key text not null,
  version integer not null check (version > 0),
  achievement_group text not null check (
    achievement_group in ('participation', 'exploration', 'contribution_quality', 'longevity')
  ),
  display_order integer not null check (display_order > 0),
  name_is text not null check (btrim(name_is) <> ''),
  name_en text not null check (btrim(name_en) <> ''),
  description_is text not null check (btrim(description_is) <> ''),
  description_en text not null check (btrim(description_en) <> ''),
  criteria jsonb not null default '{}'::jsonb check (jsonb_typeof(criteria) = 'object'),
  created_at timestamptz not null default now(),
  primary key (key, version)
);

create unique index achievement_definitions_display_order_idx
  on private.achievement_definitions (display_order, version);

revoke all on private.achievement_definitions from public, anon, authenticated, service_role;
alter table private.achievement_definitions enable row level security;

-- Immutable unlock ledger. A Member earns each achievement_key at most once ever: the evaluator
-- only considers keys with no existing unlock row (any version) for that member, so a later
-- version bump cannot award a second badge for the same key. notified_at is null until the
-- Member's Achievements view acknowledges it - the private "newly earned" indicator.
create table private.achievement_unlocks (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  achievement_key text not null,
  definition_version integer not null,
  earned_at timestamptz not null default now(),
  notified_at timestamptz,
  foreign key (achievement_key, definition_version)
    references private.achievement_definitions(key, version) on delete restrict,
  unique (member_id, achievement_key, definition_version)
);

create index achievement_unlocks_member_idx
  on private.achievement_unlocks (member_id, earned_at desc);

-- Every earning-defining column is immutable. The sole permitted mutation is the private
-- notified_at acknowledgment transitioning once from null to non-null - the "newly earned"
-- indicator's seen-state - never re-settable and never touching any other column.
create function private.reject_achievement_unlock_update()
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
  then
    raise exception using
      errcode = '55000',
      message = 'Achievement unlocks are immutable once earned; only the private notified_at acknowledgment may be set once, from null';
  end if;

  return new;
end;
$$;

create trigger achievement_unlocks_reject_update
before update on private.achievement_unlocks
for each row execute function private.reject_achievement_unlock_update();

create trigger achievement_unlocks_reject_truncate
before truncate on private.achievement_unlocks
for each statement execute function private.reject_achievement_unlock_update();

revoke all on private.achievement_unlocks from public, anon, authenticated, service_role;
alter table private.achievement_unlocks enable row level security;

-- Internal, moderator-visible-only record that a fresh recomputation of an already-earned
-- Achievement's criteria no longer holds. The unlock row itself is never mutated or removed:
-- Achievements persist visually once earned, per the catalogue proposal's global rule.
create table private.achievement_recalculations (
  id uuid primary key default extensions.gen_random_uuid(),
  unlock_id uuid not null references private.achievement_unlocks(id) on delete cascade,
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  achievement_key text not null,
  definition_version integer not null,
  reason text not null check (btrim(reason) <> ''),
  triggering_event text not null check (btrim(triggering_event) <> ''),
  evaluated_at timestamptz not null default now()
);

create index achievement_recalculations_unlock_idx
  on private.achievement_recalculations (unlock_id, evaluated_at desc);

revoke all on private.achievement_recalculations from public, anon, authenticated, service_role;
alter table private.achievement_recalculations enable row level security;

-- Maps the 11-value private.place_category enum onto the product spec's 5 "Initial Place
-- Categories" for category_curious. 'service' and 'other' have no more specific home in that
-- 5-category taxonomy and are grouped into the public/cultural catch-all bucket.
create function private.place_category_group(category private.place_category)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case category
    when 'restaurant'::private.place_category then 'food_and_drink'
    when 'cafe'::private.place_category then 'food_and_drink'
    when 'bar'::private.place_category then 'food_and_drink'
    when 'shop'::private.place_category then 'shops_and_shopping_centres'
    when 'shopping_centre'::private.place_category then 'shops_and_shopping_centres'
    when 'park'::private.place_category then 'parks_and_outdoor'
    when 'recreation'::private.place_category then 'parks_and_outdoor'
    when 'accommodation'::private.place_category then 'accommodation'
    when 'culture'::private.place_category then 'public_and_cultural'
    when 'service'::private.place_category then 'public_and_cultural'
    when 'other'::private.place_category then 'public_and_cultural'
  end;
$$;

comment on function private.place_category_group(private.place_category) is
  'achievement judgment-call grouping of the 11-value place category enum onto the product spec''s 5 Initial Place Categories, for category_curious only.';

-- Distinct-Place Check-in credit with the 15-minute anti-gaming spacing rule: a newly-seen Place
-- only counts toward exploration Achievements if its first Check-in is at least spacing_minutes
-- after the previously counted Place's first Check-in, blocking a rapid click-through spree
-- across many Place Profiles in one sitting. Shared by explorer_ten_places, category_curious, and
-- capital_region_wanderer exactly as the catalogue proposal specifies.
create function private.credit_spaced_places(
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
  place_row record;
  last_counted timestamptz := null;
  spacing interval := make_interval(mins => spacing_minutes);
begin
  for place_row in (
    select check_in.place_id as candidate_place_id, min(check_in.checked_in_at) as first_at
    from private.check_ins as check_in
    where check_in.member_id = target_member_id
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

comment on function private.credit_spaced_places(uuid, timestamptz, integer) is
  'Distinct checked-in Places credited toward exploration Achievements, deliberately not a distance or speed check since Check-ins never read device location.';

-- Durable qualifying-activity timestamps for the longevity Achievements' distinct-active-month
-- requirement: Favourite saved, Rating recorded (excluding moderator-excluded Ratings),
-- Check-in recorded, and Contribution confirmed (excluding revoked Contributions).
create function private.member_activity_event_times(
  target_member_id uuid,
  window_start timestamptz,
  window_end timestamptz
)
returns table (occurred_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select favourite.created_at
  from private.member_favourites as favourite
  where favourite.user_id = target_member_id
    and favourite.created_at between window_start and window_end
  union all
  select rating.created_at
  from private.dog_friendliness_ratings as rating
  where rating.member_id = target_member_id
    and rating.excluded_at is null
    and rating.created_at between window_start and window_end
  union all
  select check_in.checked_in_at
  from private.check_ins as check_in
  where check_in.member_id = target_member_id
    and check_in.checked_in_at between window_start and window_end
  union all
  select contribution.confirmed_at
  from private.contributions as contribution
  where contribution.member_id = target_member_id
    and contribution.revoked_at is null
    and contribution.confirmed_at between window_start and window_end;
$$;

-- Pure, reproducible per-key criteria evaluation, recomputed from durable rows at check time -
-- never a stored counter. as_of is an explicit parameter throughout so tests can inject fixture
-- times for the six/twelve month longevity criteria rather than sleeping. sustained_quality_
-- contributor deliberately ignores as_of: Trusted Contributor status is never cached and is
-- always read live, matching contributor-recognition's own contract.
create function private.evaluate_achievement_criteria(
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
  member_created_at timestamptz;
  result boolean := false;
begin
  -- requested_version pins the evaluation to one definition's thresholds: recalculation checks an
  -- unlock against the version it was earned under, so a later threshold bump can never write a
  -- misleading "no longer qualifies" record against an unlock that still satisfies its own terms.
  -- Null (the default) evaluates the latest version - the not-yet-earned unlock path.
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
          and favourite.created_at <= as_of
      ) into result;
    when 'first_rating' then
      select exists (
        select 1
        from private.dog_friendliness_ratings as rating
        where rating.member_id = target_member_id
          and rating.excluded_at is null
          and rating.created_at <= as_of
      ) into result;
    when 'first_checkin' then
      select exists (
        select 1
        from private.check_ins as check_in
        where check_in.member_id = target_member_id
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
      select count(distinct location.municipality) >= (criteria ->> 'distinct_municipalities')::integer
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
          and contribution.confirmed_at <= as_of
      ) into result;
    when 'sustained_quality_contributor' then
      select (status.status = 'trusted_contributor')
      from private.compute_contributor_status(target_member_id) as status
      into result;
    when 'six_month_member' then
      select member_account.created_at into member_created_at
      from private.member_accounts as member_account
      where member_account.user_id = target_member_id;

      if member_created_at is not null then
        select
          as_of >= member_created_at + make_interval(months => (criteria ->> 'months_elapsed')::integer)
          and (
            select count(distinct date_trunc('month', activity.occurred_at))
            from private.member_activity_event_times(
              target_member_id,
              member_created_at,
              member_created_at + make_interval(months => (criteria ->> 'months_elapsed')::integer)
            ) as activity
          ) >= (criteria ->> 'distinct_active_months')::integer
        into result;
      end if;
    when 'one_year_member' then
      select member_account.created_at into member_created_at
      from private.member_accounts as member_account
      where member_account.user_id = target_member_id;

      if member_created_at is not null then
        select
          as_of >= member_created_at + make_interval(months => (criteria ->> 'months_elapsed')::integer)
          and (
            select count(distinct date_trunc('month', activity.occurred_at))
            from private.member_activity_event_times(
              target_member_id,
              member_created_at,
              member_created_at + make_interval(months => (criteria ->> 'months_elapsed')::integer)
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

comment on function private.evaluate_achievement_criteria(text, uuid, timestamptz, integer, integer) is
  'Recomputes one Achievement''s criteria from durable rows at check time. Never reads a stored counter, so retries and concurrent events cannot double-count.';

-- Shared entry point for every unlock-eligibility touch point (table triggers below) and for
-- moderator-triggered recalculation (public.recalculate_member_achievements). Also the seam a
-- future scheduled monthly tick for the longevity Achievements would call; no scheduler is built
-- here. Fail-closed: a missing or disabled policy row makes this a no-op.
create function private.evaluate_achievement_unlocks(
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
  where policy.singleton and policy.enabled;

  if not found then
    return;
  end if;

  -- Negative-signal touch points only: a positive-signal event (favourite saved, rating
  -- recorded, check-in recorded, contribution confirmed) can only ever increase qualification,
  -- so there is nothing to recheck on an already-earned Achievement.
  if reason in ('contribution_revoked', 'rating_excluded', 'conduct_flag_recorded', 'moderator_recalculation') then
    for definition_row in (
      select unlock.id as unlock_id, unlock.achievement_key, unlock.definition_version
      from private.achievement_unlocks as unlock
      where unlock.member_id = target_member_id
    ) loop
      qualifies := private.evaluate_achievement_criteria(
        definition_row.achievement_key, target_member_id, as_of,
        policy_record.credit_spacing_minutes, definition_row.definition_version
      );

      if not qualifies then
        insert into private.achievement_recalculations (
          unlock_id, member_id, achievement_key, definition_version, reason, triggering_event
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
      definition_row.key, target_member_id, as_of,
      policy_record.credit_spacing_minutes, definition_row.version
    );

    if qualifies then
      insert into private.achievement_unlocks (member_id, achievement_key, definition_version)
      values (target_member_id, definition_row.key, definition_row.version)
      on conflict (member_id, achievement_key, definition_version) do nothing;
    end if;
  end loop;
end;
$$;

comment on function private.evaluate_achievement_unlocks(uuid, text, timestamptz) is
  'Fail-closed Achievement unlock evaluation. No enabled private.achievement_policy row is a no-op. Called from touch-point triggers, public.recalculate_member_achievements, and reserved as the seam for a future scheduled monthly tick.';

-- Touch point: Favourite saved.
create function private.evaluate_achievements_after_favourite()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.evaluate_achievement_unlocks(new.user_id, 'favourite_saved', statement_timestamp());
  return new;
end;
$$;

create trigger achievements_after_favourite_insert
after insert on private.member_favourites
for each row execute function private.evaluate_achievements_after_favourite();

-- Touch point: Rating recorded / removed (excluded) / reinstated.
create function private.evaluate_achievements_after_rating()
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
    reason := 'rating_recorded';
  elsif new.excluded_at is not null and old.excluded_at is null then
    reason := 'rating_excluded';
  elsif new.excluded_at is null and old.excluded_at is not null then
    reason := 'rating_reinstated';
  else
    reason := 'rating_recorded';
  end if;

  perform private.evaluate_achievement_unlocks(new.member_id, reason, statement_timestamp());
  return new;
end;
$$;

create trigger achievements_after_rating_change
after insert or update on private.dog_friendliness_ratings
for each row execute function private.evaluate_achievements_after_rating();

-- Touch point: Check-in recorded.
create function private.evaluate_achievements_after_check_in()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.evaluate_achievement_unlocks(new.member_id, 'check_in_recorded', statement_timestamp());
  return new;
end;
$$;

create trigger achievements_after_check_in_insert
after insert on private.check_ins
for each row execute function private.evaluate_achievements_after_check_in();

-- Touch point: Contribution confirmed / revoked. A private.contributions row is only ever
-- inserted at confirmation time (accepted_suggestion, applied_correction, or confirmed_report
-- alike), so a single table-level trigger covers all three Contribution sources uniformly.
-- Revocation is one-way in the shipped contributor-recognition surface: public.revoke_contribution only ever sets
-- revoked_at (raising 55006 when already revoked) and no RPC or UI path clears it, so - unlike
-- Ratings, which have a real reinstatement command - there is deliberately no
-- contribution_reinstated positive signal here.
create function private.evaluate_achievements_after_contribution()
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
  return new;
end;
$$;

create trigger achievements_after_contribution_change
after insert or update on private.contributions
for each row execute function private.evaluate_achievements_after_contribution();

-- Touch point: conduct flag recorded / cleared.
create function private.evaluate_achievements_after_conduct_flag()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reason text;
begin
  if new.flag_kind = 'flag_cleared' then
    reason := 'conduct_flag_cleared';
  else
    reason := 'conduct_flag_recorded';
  end if;

  perform private.evaluate_achievement_unlocks(new.member_id, reason, statement_timestamp());
  return new;
end;
$$;

create trigger achievements_after_conduct_flag_insert
after insert on private.member_conduct_flags
for each row execute function private.evaluate_achievements_after_conduct_flag();

-- Ungranted account-deletion cleanup seam. This migration intentionally grants and invokes no
-- account-deletion policy; achievement_recalculations rows cascade via unlock_id's
-- on delete cascade.
create function private.detach_member_achievements(requested_member_id uuid)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  removed_count bigint;
begin
  delete from private.achievement_unlocks as unlock
  where unlock.member_id = requested_member_id;

  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

revoke execute on function private.detach_member_achievements(uuid)
  from public, anon, authenticated, service_role;

comment on function private.detach_member_achievements(uuid) is
  'Ungranted account-deletion cleanup seam. This migration intentionally grants and invokes no account-deletion policy.';

-- Always-safe public read: is the Achievement feature enabled at all. Mirrors
-- public.get_check_in_policy's fail-closed boolean shape.
create function public.get_achievement_feature_status()
returns table (enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select policy.enabled from private.achievement_policy as policy where policy.singleton),
    false
  );
$$;

-- Caller-only Achievement catalogue read. Deliberately excludes any count, ratio, or partial-
-- progress figure - only locked (earned_at is null), earned, and newly-earned (is_new) states.
-- When the policy is disabled, returns a single { enabled: false, ... null } row so the client
-- never renders a catalogue while the feature is dark. As a side effect, marks every previously-
-- unseen earned row's notified_at, so is_new reflects exactly what is new to this one response.
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
  is_new boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  policy_enabled boolean;
  newly_seen text[];
begin
  select policy.enabled into policy_enabled
  from private.achievement_policy as policy
  where policy.singleton;

  if not found or not policy_enabled then
    return query select
      false, null::text, null::text, null::integer,
      null::text, null::text, null::text, null::text,
      null::timestamptz, false;
    return;
  end if;

  select array_agg(unlock.achievement_key) into newly_seen
  from private.achievement_unlocks as unlock
  where unlock.member_id = actor_id
    and unlock.notified_at is null;

  update private.achievement_unlocks as unlock
  set notified_at = statement_timestamp()
  where unlock.member_id = actor_id
    and unlock.notified_at is null;

  return query
  select
    true,
    latest.key,
    latest.achievement_group,
    latest.display_order,
    latest.name_is,
    latest.name_en,
    latest.description_is,
    latest.description_en,
    unlock.earned_at,
    coalesce(latest.key = any (newly_seen), false)
  from (
    select
      definition.key as key,
      definition.achievement_group as achievement_group,
      definition.display_order as display_order,
      definition.name_is as name_is,
      definition.name_en as name_en,
      definition.description_is as description_is,
      definition.description_en as description_en,
      row_number() over (partition by definition.key order by definition.version desc) as rank
    from private.achievement_definitions as definition
  ) as latest
  left join private.achievement_unlocks as unlock
    on unlock.member_id = actor_id and unlock.achievement_key = latest.key
  where latest.rank = 1
  order by latest.display_order;
end;
$$;

-- Moderator-only oversight of a Member's unlocks plus their internal recalculation history -
-- the only place a reversal-triggered "would no longer qualify" finding is ever visible.
create function public.get_moderation_member_achievements(requested_member_id uuid)
returns table (
  achievement_key text,
  definition_version integer,
  earned_at timestamptz,
  notified_at timestamptz,
  recalculation_reason text,
  recalculation_triggering_event text,
  recalculation_evaluated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_moderator();

  return query
  select
    unlock.achievement_key,
    unlock.definition_version,
    unlock.earned_at,
    unlock.notified_at,
    recalculation.reason,
    recalculation.triggering_event,
    recalculation.evaluated_at
  from private.achievement_unlocks as unlock
  left join private.achievement_recalculations as recalculation
    on recalculation.unlock_id = unlock.id
  where unlock.member_id = requested_member_id
  order by unlock.earned_at desc, recalculation.evaluated_at desc;
end;
$$;

-- Service-role-only configuration boundary. Achievements ship dark pending explicit
-- owner-approved catalogue and persistence-policy approval.
create function public.configure_achievement_policy(
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
  insert into private.achievement_policy (
    singleton, policy_version, credit_spacing_minutes, enabled, updated_at
  ) values (
    true, requested_policy_version, requested_credit_spacing_minutes, requested_enabled, now()
  )
  on conflict (singleton) do update set
    policy_version = excluded.policy_version,
    credit_spacing_minutes = excluded.credit_spacing_minutes,
    enabled = excluded.enabled,
    updated_at = now();
end;
$$;

-- Moderator-triggered full recalculation, mirroring recalculate_member_contributor_status.
-- Also the manual analogue of the scheduled-monthly-tick seam documented on
-- private.evaluate_achievement_unlocks.
create function public.recalculate_member_achievements(
  requested_member_id uuid,
  command_request_id uuid
)
returns void
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

  perform private.evaluate_achievement_unlocks(
    requested_member_id, 'moderator_recalculation', statement_timestamp()
  );
end;
$$;

revoke execute on function public.get_achievement_feature_status()
  from public, anon, service_role;
revoke execute on function public.get_my_achievements()
  from public, anon, service_role;
revoke execute on function public.get_moderation_member_achievements(uuid)
  from public, anon, service_role;
revoke execute on function public.configure_achievement_policy(text, integer, boolean)
  from public, anon, authenticated;
revoke execute on function public.recalculate_member_achievements(uuid, uuid)
  from public, anon, service_role;

grant execute on function public.get_achievement_feature_status() to authenticated, anon;
grant execute on function public.get_my_achievements() to authenticated;
grant execute on function public.get_moderation_member_achievements(uuid) to authenticated;
grant execute on function public.configure_achievement_policy(text, integer, boolean) to service_role;
grant execute on function public.recalculate_member_achievements(uuid, uuid) to authenticated;

-- Seed the approved-pending ten-item catalogue
-- at version 1. No policy row is inserted here, so the feature ships disabled by default.
insert into private.achievement_definitions (
  key, version, achievement_group, display_order,
  name_is, name_en, description_is, description_en, criteria
) values
  (
    'first_favourite', 1, 'participation', 1,
    'Fyrsta uppáhaldið', 'First Favourite',
    'Þú vistaðir þinn fyrsta stað sem uppáhald.', 'You saved your first Place as a Favourite.',
    '{}'::jsonb
  ),
  (
    'first_rating', 1, 'participation', 2,
    'Fyrsta einkunnin', 'First Rating',
    'Þú skráðir þína fyrstu hundvænleikaeinkunn.', 'You recorded your first Dog-Friendliness Rating.',
    '{}'::jsonb
  ),
  (
    'first_checkin', 1, 'participation', 3,
    'Fyrsta innritunin', 'First Check-in',
    'Þú skráðir þína fyrstu innritun á stað.', 'You recorded your first Check-in at a Place.',
    '{}'::jsonb
  ),
  (
    'explorer_ten_places', 1, 'exploration', 4,
    'Staðakönnuður', 'Place Explorer',
    'Þú innritaðir þig á 10 mismunandi staði.', 'You checked in at 10 distinct Places.',
    '{"distinct_places": 10}'::jsonb
  ),
  (
    'category_curious', 1, 'exploration', 5,
    'Forvitinn um flokka', 'Category Curious',
    'Þú innritaðir þig á staði í a.m.k. fjórum af fimm flokkum.',
    'You checked in at Places across at least four of the five initial categories.',
    '{"distinct_categories": 4, "total_categories": 5}'::jsonb
  ),
  (
    'capital_region_wanderer', 1, 'exploration', 6,
    'Flakkari höfuðborgarsvæðisins', 'Capital Region Wanderer',
    'Þú innritaðir þig á staði í a.m.k. þremur sveitarfélögum.',
    'You checked in at Places across at least three municipalities.',
    '{"distinct_municipalities": 3}'::jsonb
  ),
  (
    'first_accepted_contribution', 1, 'contribution_quality', 7,
    'Fyrsta staðfesta framlagið', 'First Confirmed Contribution',
    'Framlag frá þér var staðfest sem gagnlegt af umsjónarmanni.',
    'A submission of yours was confirmed by a Moderator as a useful Contribution.',
    '{}'::jsonb
  ),
  (
    'sustained_quality_contributor', 1, 'contribution_quality', 8,
    'Viðurkenndur fyrir gæði', 'Recognized for Quality',
    'Þú náðir stöðu treysts framlagsaðila fyrir viðvarandi, nákvæm framlög.',
    'You reached Trusted Contributor status through sustained, accurate Contributions.',
    '{}'::jsonb
  ),
  (
    'six_month_member', 1, 'longevity', 9,
    'Hálft ár í hópnum', 'Six Months In',
    'Þú hefur verið meðlimur í sex mánuði og tekið virkan þátt.',
    'You have been a Member for six months with sustained activity.',
    '{"months_elapsed": 6, "distinct_active_months": 3}'::jsonb
  ),
  (
    'one_year_member', 1, 'longevity', 10,
    'Heilt ár í hópnum', 'One Year In',
    'Þú hefur verið meðlimur í heilt ár og tekið virkan þátt reglulega.',
    'You have been a Member for a full year with regular sustained activity.',
    '{"months_elapsed": 12, "distinct_active_months": 6}'::jsonb
  );

comment on table private.achievement_policy is
  'Versioned, service-role-only configurable Achievement engine switch. No enabled row means no unlock evaluation ever runs and every member-facing RPC reports the feature as disabled.';
comment on table private.achievement_definitions is
  'Versioned Achievement catalogue: key, criteria thresholds, and bilingual copy. An earned instance keeps displaying the definition_version it satisfied at unlock time.';
comment on table private.achievement_unlocks is
  'Immutable per-member-per-key unlock ledger. Achievements persist visually once earned; a later criteria reversal is recorded only in private.achievement_recalculations, never applied here.';
comment on table private.achievement_recalculations is
  'Internal, moderator-visible-only record that a fresh recomputation of an earned Achievement''s criteria no longer holds. Never mutates or removes the unlock row.';
comment on function public.get_my_achievements() is
  'Returns the caller''s own catalogue view only: locked, earned, and newly-earned states, deliberately excluding any count, ratio, or partial-progress figure.';
comment on function public.configure_achievement_policy(text, integer, boolean) is
  'Service-role-only configuration boundary. Achievements ship dark pending explicit owner-approved catalogue and persistence-policy decisions.';

commit;
