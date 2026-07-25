begin;

-- Tiered Achievement collections.
--
-- Four count-based Achievements become four collections of three tiers each, visible while locked
-- so the gaps themselves show the Member what is ahead. The six bespoke Achievements stay absent
-- until earned.
--
-- A tier is an ordinary definition key inside a collection, which is what keeps the immutable
-- unlock ledger, its one-unlock-per-key index and per-unlock version pinning working untouched.

-- Precondition. The reshape below rewrites criteria in place at version 1, which the catalogue's
-- own contract reserves for a new version. That is safe only while no unlock pins a version, so the
-- assumption is enforced rather than trusted: a deploy against a populated ledger fails loudly here
-- instead of silently mis-evaluating a pinned definition.
do $$
begin
  if exists (select 1 from private.achievement_unlocks) then
    raise exception using
      errcode = '55000',
      message = 'Tiered collections rewrite achievement_definitions.criteria at version 1, which is only safe while the unlock ledger is empty. Existing unlocks found; migrate them deliberately instead.';
  end if;
end;
$$;

-- A collection's bilingual copy lives once, here, rather than being repeated across its three tier
-- rows with no constraint keeping the copies equal. A tier derives its own display copy from this
-- name plus a tier label, so tier rows carry no copy at all.
create table private.achievement_collections (
  key text primary key,
  name_is text not null check (btrim(name_is) <> ''),
  name_en text not null check (btrim(name_en) <> ''),
  description_is text not null check (btrim(description_is) <> ''),
  description_en text not null check (btrim(description_en) <> '')
);

revoke all on private.achievement_collections from public, anon, authenticated, service_role;
alter table private.achievement_collections enable row level security;

insert into private.achievement_collections (key, name_is, name_en, description_is, description_en)
values
  (
    'explorer_places', 'Staðir', 'Places',
    'Mismunandi staðir sem þú hefur innritað þig á.',
    'Distinct Places you have checked in at.'
  ),
  (
    'place_categories', 'Flokkar', 'Categories',
    'Flokkar staða sem þú hefur innritað þig á.',
    'Categories of Place you have checked in at.'
  ),
  (
    'municipalities', 'Sveitarfélög', 'Municipalities',
    'Sveitarfélög þar sem þú hefur innritað þig.',
    'Municipalities where you have checked in.'
  ),
  (
    'contributions', 'Framlög', 'Contributions',
    'Framlög frá þér sem umsjónarmaður hefur staðfest.',
    'Contributions of yours confirmed by a Moderator.'
  );

alter table private.achievement_definitions
  add column collection text references private.achievement_collections(key) on delete restrict,
  add column tier text,
  alter column name_is drop not null,
  alter column name_en drop not null,
  alter column description_is drop not null,
  alter column description_en drop not null;

-- locked_visibility carried no information that "collection is not null" does not already carry,
-- and keeping it meant keeping a second place for the same fact to disagree. Dropping the column
-- also drops the two check constraints that referenced it.
alter table private.achievement_definitions drop column locked_visibility;

alter table private.achievement_definitions
  drop constraint achievement_definitions_progress_kind_check;

-- The four count-based keys are replaced rather than adopted. Adoption was considered and rejected:
-- with the ledger asserted empty it bought no referential safety, and it would have left two naming
-- conventions plus a key ("explorer_ten_places") hardcoding a threshold it no longer owns.
--
-- This runs before the constraints below rather than after, because the three old exploration keys
-- already carry a progress_kind while belonging to no collection, which is precisely the state the
-- tier-metric constraint exists to forbid.
delete from private.achievement_definitions
where key in (
  'explorer_ten_places',
  'category_curious',
  'capital_region_wanderer',
  'first_accepted_contribution'
);

alter table private.achievement_definitions
  add constraint achievement_definitions_tier_check
    check (tier is null or tier in ('bronze', 'silver', 'gold')),
  add constraint achievement_definitions_collection_tier_check
    check ((collection is null) = (tier is null)),
  add constraint achievement_definitions_progress_kind_check
    check (
      progress_kind is null
      or progress_kind in (
        'credited_places',
        'credited_categories',
        'credited_municipalities',
        'confirmed_contributions'
      )
    ),
  add constraint achievement_definitions_tier_metric_check
    check ((collection is not null) = (progress_kind is not null)),
  add constraint achievement_definitions_tier_threshold_check
    check (collection is null or jsonb_exists(criteria, 'threshold')),
  add constraint achievement_definitions_copy_shape_check
    check (
      (
        collection is not null
        and name_is is null
        and name_en is null
        and description_is is null
        and description_en is null
      )
      or (
        collection is null
        and name_is is not null
        and name_en is not null
        and description_is is not null
        and description_en is not null
      )
    );

create unique index achievement_definitions_collection_tier_idx
  on private.achievement_definitions (collection, tier, version)
  where collection is not null;

-- Thresholds are chosen so that no tier depends on complete taxonomy coverage. place_categories
-- stops at 4 of 5 so it never requires an accommodation Check-in, municipalities stops at 4 of 7 so
-- it never requires Kjósarhreppur or Seltjarnarnes, and contributions silver sits below the Trusted
-- Contributor threshold of 5 so the tier ladder steps around that status rather than shadowing it.
-- explorer_places gold is deliberately conservative at 15 pending a known published-Place count.
insert into private.achievement_definitions (
  key, version, achievement_group, display_order, collection, tier, progress_kind, criteria
) values
  ('explorer_places_bronze', 1, 'exploration', 11, 'explorer_places', 'bronze', 'credited_places', '{"threshold": 5}'::jsonb),
  ('explorer_places_silver', 1, 'exploration', 12, 'explorer_places', 'silver', 'credited_places', '{"threshold": 10}'::jsonb),
  ('explorer_places_gold', 1, 'exploration', 13, 'explorer_places', 'gold', 'credited_places', '{"threshold": 15}'::jsonb),
  ('place_categories_bronze', 1, 'exploration', 14, 'place_categories', 'bronze', 'credited_categories', '{"threshold": 2}'::jsonb),
  ('place_categories_silver', 1, 'exploration', 15, 'place_categories', 'silver', 'credited_categories', '{"threshold": 3}'::jsonb),
  ('place_categories_gold', 1, 'exploration', 16, 'place_categories', 'gold', 'credited_categories', '{"threshold": 4}'::jsonb),
  ('municipalities_bronze', 1, 'exploration', 17, 'municipalities', 'bronze', 'credited_municipalities', '{"threshold": 2}'::jsonb),
  ('municipalities_silver', 1, 'exploration', 18, 'municipalities', 'silver', 'credited_municipalities', '{"threshold": 3}'::jsonb),
  ('municipalities_gold', 1, 'exploration', 19, 'municipalities', 'gold', 'credited_municipalities', '{"threshold": 4}'::jsonb),
  ('contributions_bronze', 1, 'contribution_quality', 20, 'contributions', 'bronze', 'confirmed_contributions', '{"threshold": 1}'::jsonb),
  ('contributions_silver', 1, 'contribution_quality', 21, 'contributions', 'silver', 'confirmed_contributions', '{"threshold": 3}'::jsonb),
  ('contributions_gold', 1, 'contribution_quality', 22, 'contributions', 'gold', 'confirmed_contributions', '{"threshold": 10}'::jsonb);

-- Every countable metric, computed in one pass.
--
-- credit_spaced_places is a row-by-row loop over the Member's whole Check-in history, and it runs
-- from a trigger on every Favourite, Rating, Check-in and Contribution write. The three tiers of a
-- collection share one metric, so evaluating tiers one definition at a time would run that loop
-- nine times per event where once is enough. The spaced CTE is explicitly materialized to guarantee
-- the single pass, and the category and municipality counts are derived from that same credited set.
create function private.member_achievement_metrics(
  target_member_id uuid,
  as_of timestamptz,
  spacing_minutes integer
)
returns table (progress_kind text, metric_value integer)
language sql
stable
security definer
set search_path = ''
as $$
  with eligibility as materialized (
    select policy.eligibility_started_at as started_at
    from private.achievement_policy as policy
    where policy.singleton
      and policy.enabled
      and policy.eligibility_started_at is not null
  ),
  spaced as materialized (
    select credited.place_id
    from private.credit_spaced_places(target_member_id, as_of, spacing_minutes) as credited
  ),
  spaced_place as materialized (
    select place.category, location.municipality
    from spaced
    join private.places as place on place.id = spaced.place_id
    join private.locations as location on location.id = place.location_id
  )
  select 'credited_places'::text, (select count(*)::integer from spaced)
  where exists (select 1 from eligibility)
  union all
  select
    'credited_categories'::text,
    (
      select count(distinct private.place_category_group(spaced_place.category))::integer
      from spaced_place
    )
  where exists (select 1 from eligibility)
  union all
  select
    'credited_municipalities'::text,
    (select count(distinct spaced_place.municipality)::integer from spaced_place)
  where exists (select 1 from eligibility)
  union all
  select
    'confirmed_contributions'::text,
    (
      select count(*)::integer
      from private.contributions as contribution, eligibility
      where contribution.member_id = target_member_id
        and contribution.revoked_at is null
        and contribution.confirmed_at >= eligibility.started_at
        and contribution.confirmed_at <= as_of
    )
  where exists (select 1 from eligibility);
$$;

revoke execute on function private.member_achievement_metrics(uuid, timestamptz, integer)
  from public, anon, authenticated, service_role;

comment on function private.member_achievement_metrics(uuid, timestamptz, integer) is
  'Every countable Achievement metric from a single credited-Place pass. Returns no rows while the feature is disabled or eligibility has never started.';

-- Bespoke criteria evaluation, narrowed to the six Achievements that are not tiers.
--
-- Renamed from evaluate_achievement_criteria on purpose: after tier evaluation became set-based, a
-- function still named for the whole catalogue would silently return false for any tier key, which
-- is a footgun. The narrowed name makes the seam visible. spacing_minutes is gone from the
-- signature because no bespoke criterion reads the credited-Place sequence.
create function private.evaluate_bespoke_achievement_criteria(
  achievement_key text,
  target_member_id uuid,
  as_of timestamptz,
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
    and definition.collection is null
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
    when 'six_month_member', 'one_year_member' then
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

revoke execute on function private.evaluate_bespoke_achievement_criteria(
  text, uuid, timestamptz, integer
) from public, anon, authenticated, service_role;

comment on function private.evaluate_bespoke_achievement_criteria(text, uuid, timestamptz, integer) is
  'Recomputes one non-tier Achievement''s criteria from durable rows. Tier evaluation is set-based in private.evaluate_achievement_unlocks and never routes through here.';

-- Tier evaluation is set-based in both directions and reads one metric snapshot.
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
  metrics jsonb;
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

  -- One snapshot, reused by the recalculation pass and the unlock pass below.
  select coalesce(jsonb_object_agg(metric.progress_kind, metric.metric_value), '{}'::jsonb)
  into metrics
  from private.member_achievement_metrics(
    target_member_id,
    as_of,
    policy_record.credit_spacing_minutes
  ) as metric;

  if reason in (
    'contribution_revoked',
    'rating_excluded',
    'conduct_flag_recorded',
    'moderator_recalculation'
  ) then
    -- Tier findings. Each unlock is compared against the threshold of the version it was earned
    -- under, so a later threshold change can never write a misleading finding against an unlock
    -- that still satisfies its own terms.
    insert into private.achievement_recalculations (
      unlock_id,
      member_id,
      achievement_key,
      definition_version,
      reason,
      triggering_event
    )
    select
      unlock.id,
      unlock.member_id,
      unlock.achievement_key,
      unlock.definition_version,
      'Recomputed criteria no longer satisfied; the badge persists per the Achievement persistence policy.',
      reason
    from private.achievement_unlocks as unlock
    join private.achievement_definitions as definition
      on definition.key = unlock.achievement_key
      and definition.version = unlock.definition_version
    where unlock.member_id = target_member_id
      and definition.collection is not null
      and coalesce((metrics ->> definition.progress_kind)::integer, 0)
        < (definition.criteria ->> 'threshold')::integer;

    -- Bespoke findings keep the per-key loop.
    for definition_row in (
      select unlock.id as unlock_id, unlock.achievement_key, unlock.definition_version
      from private.achievement_unlocks as unlock
      join private.achievement_definitions as definition
        on definition.key = unlock.achievement_key
        and definition.version = unlock.definition_version
      where unlock.member_id = target_member_id
        and definition.collection is null
    ) loop
      qualifies := private.evaluate_bespoke_achievement_criteria(
        definition_row.achievement_key,
        target_member_id,
        as_of,
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

  -- Tier unlocks, evaluated against the latest version of each tier definition.
  insert into private.achievement_unlocks (member_id, achievement_key, definition_version)
  select target_member_id, definition.key, definition.version
  from private.achievement_definitions as definition
  where definition.collection is not null
    and definition.version = (
      select max(other.version)
      from private.achievement_definitions as other
      where other.key = definition.key
    )
    and coalesce((metrics ->> definition.progress_kind)::integer, 0)
      >= (definition.criteria ->> 'threshold')::integer
    and not exists (
      select 1
      from private.achievement_unlocks as unlock
      where unlock.member_id = target_member_id
        and unlock.achievement_key = definition.key
    )
  on conflict (member_id, achievement_key) do nothing;

  -- Bespoke unlocks keep the per-key loop.
  for definition_row in (
    select definition.key, definition.version
    from private.achievement_definitions as definition
    where definition.collection is null
      and definition.version = (
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
    qualifies := private.evaluate_bespoke_achievement_criteria(
      definition_row.key,
      target_member_id,
      as_of,
      definition_row.version
    );

    if qualifies then
      insert into private.achievement_unlocks (
        member_id,
        achievement_key,
        definition_version
      ) values (
        target_member_id,
        definition_row.key,
        definition_row.version
      )
      on conflict (member_id, achievement_key) do nothing;
    end if;
  end loop;
end;
$$;

comment on function private.evaluate_achievement_unlocks(uuid, text, timestamptz) is
  'Fail-closed Achievement unlock evaluation. Tiers are evaluated set-based against one metric snapshot; the six bespoke Achievements keep per-key evaluation.';

drop function private.get_member_achievement_progress(uuid, timestamptz, integer);
drop function private.evaluate_achievement_criteria(text, uuid, timestamptz, integer, integer);

-- The catalogue read is uncapped: every tier slot in all three states, plus every earned bespoke
-- Achievement. Presentation caps now live in the callers, which is where the layout constraint
-- actually is. A surprise definition still never leaves the database before it is earned, because
-- the locked branch selects only rows that belong to a collection.
drop function public.get_my_achievements();

create function public.get_my_achievements()
returns table (
  enabled boolean,
  achievement_key text,
  achievement_group text,
  display_order integer,
  collection text,
  tier text,
  collection_name_is text,
  collection_name_en text,
  collection_description_is text,
  collection_description_en text,
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
  metrics jsonb;
begin
  select policy.* into policy_record
  from private.achievement_policy as policy
  where policy.singleton
    and policy.enabled
    and policy.eligibility_started_at is not null;

  if not found then
    return query select
      false,
      null::text, null::text, null::integer,
      null::text, null::text,
      null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text,
      null::timestamptz, false, null::text,
      null::text, null::integer, null::integer;
    return;
  end if;

  select coalesce(jsonb_object_agg(metric.progress_kind, metric.metric_value), '{}'::jsonb)
  into metrics
  from private.member_achievement_metrics(
    actor_id,
    statement_timestamp(),
    policy_record.credit_spacing_minutes
  ) as metric;

  return query
  with earned as (
    select
      definition.key as entry_key,
      definition.achievement_group as entry_group,
      definition.display_order as entry_order,
      definition.collection as entry_collection,
      definition.tier as entry_tier,
      definition.name_is as entry_name_is,
      definition.name_en as entry_name_en,
      definition.description_is as entry_description_is,
      definition.description_en as entry_description_en,
      unlock.earned_at as entry_earned_at,
      'earned'::text as entry_kind,
      null::text as entry_progress_kind,
      null::integer as entry_progress_current,
      null::integer as entry_progress_target
    from private.achievement_unlocks as unlock
    join private.achievement_definitions as definition
      on definition.key = unlock.achievement_key
      and definition.version = unlock.definition_version
    where unlock.member_id = actor_id
  ),
  locked as (
    select
      definition.key,
      definition.achievement_group,
      definition.display_order,
      definition.collection,
      definition.tier,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz,
      'locked'::text,
      definition.progress_kind,
      least(
        coalesce((metrics ->> definition.progress_kind)::integer, 0),
        (definition.criteria ->> 'threshold')::integer
      ),
      (definition.criteria ->> 'threshold')::integer
    from private.achievement_definitions as definition
    where definition.collection is not null
      and definition.version = (
        select max(other.version)
        from private.achievement_definitions as other
        where other.key = definition.key
      )
      and not exists (
        select 1
        from private.achievement_unlocks as unlock
        where unlock.member_id = actor_id
          and unlock.achievement_key = definition.key
      )
  ),
  visible as (
    select * from earned
    union all
    select * from locked
  )
  select
    true,
    visible.entry_key,
    visible.entry_group,
    visible.entry_order,
    visible.entry_collection,
    visible.entry_tier,
    collection.name_is,
    collection.name_en,
    collection.description_is,
    collection.description_en,
    visible.entry_name_is,
    visible.entry_name_en,
    visible.entry_description_is,
    visible.entry_description_en,
    visible.entry_earned_at,
    false,
    visible.entry_kind,
    visible.entry_progress_kind,
    visible.entry_progress_current,
    visible.entry_progress_target
  from visible
  left join private.achievement_collections as collection
    on collection.key = visible.entry_collection
  order by visible.entry_order, visible.entry_key;
end;
$$;

-- The celebration card derives a tier's copy, so the claim must hand back the collection, the tier
-- and the threshold rather than a name the tier row does not carry.
drop function public.claim_my_achievement_celebrations();

create function public.claim_my_achievement_celebrations()
returns table (
  achievement_key text,
  achievement_group text,
  display_order integer,
  collection text,
  tier text,
  collection_name_is text,
  collection_name_en text,
  name_is text,
  name_en text,
  description_is text,
  description_en text,
  progress_kind text,
  progress_target integer,
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
    definition.collection,
    definition.tier,
    collection.name_is,
    collection.name_en,
    definition.name_is,
    definition.name_en,
    definition.description_is,
    definition.description_en,
    definition.progress_kind,
    (definition.criteria ->> 'threshold')::integer,
    claimed.earned_at
  from claimed
  join private.achievement_definitions as definition
    on definition.key = claimed.achievement_key
    and definition.version = claimed.definition_version
  left join private.achievement_collections as collection
    on collection.key = definition.collection
  order by definition.display_order, definition.key;
end;
$$;

revoke execute on function public.get_my_achievements()
  from public, anon, service_role;
revoke execute on function public.claim_my_achievement_celebrations()
  from public, anon, service_role;

grant execute on function public.get_my_achievements() to authenticated;
grant execute on function public.claim_my_achievement_celebrations() to authenticated;

comment on table private.achievement_collections is
  'Bilingual copy for each tiered Achievement collection, held once. Tier definitions carry no copy and derive their display from this name plus a tier label.';
comment on column private.achievement_definitions.collection is
  'The collection a tier belongs to. Null for the bespoke Achievements, and the single source of truth for whether a locked Achievement is visible.';
comment on column private.achievement_definitions.tier is
  'bronze, silver or gold within a collection. Null for the bespoke Achievements.';
comment on function public.get_my_achievements() is
  'Pure caller-only read returning every tier slot in all three states plus every earned bespoke Achievement. Presentation caps belong to the callers. Surprise definitions never leave the database before earning.';
comment on function public.claim_my_achievement_celebrations() is
  'Atomic caller-only claim used by the mounted Achievement experience. Returns the collection, tier and threshold a tier celebration needs to derive its copy.';

commit;
