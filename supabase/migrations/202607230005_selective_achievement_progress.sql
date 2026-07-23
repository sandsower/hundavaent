begin;

-- Locked Achievement presentation is versioned with the catalogue.
-- The default is surprise so a newly inserted definition cannot leak before its presentation
-- policy is deliberately chosen.
alter table private.achievement_definitions
  add column locked_visibility text not null default 'surprise',
  add column progress_kind text;

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
  where policy.singleton and policy.enabled;

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
  select policy.enabled into policy_enabled
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
  policy_enabled boolean;
begin
  select policy.enabled into policy_enabled
  from private.achievement_policy as policy
  where policy.singleton;

  if not coalesce(policy_enabled, false) then
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
comment on function private.get_member_achievement_progress(uuid, timestamptz, integer) is
  'Recomputes private milestone progress from the same anti-burst credited Place sequence used by unlock criteria.';
comment on function public.get_my_achievements() is
  'Pure caller-only read returning earned Achievements and at most two relevant locked milestones. Surprise definitions never leave the database before earning.';
comment on function public.get_my_achievement_status() is
  'Pure caller-only account-indicator read. Returns only enabled and has_unread and never acknowledges an unlock.';
comment on function public.claim_my_achievement_celebrations() is
  'Atomic caller-only claim used by the mounted Achievement experience. Each unread unlock can be returned for celebration exactly once.';

commit;
