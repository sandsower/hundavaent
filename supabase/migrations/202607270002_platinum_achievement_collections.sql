begin;

-- The fourth tier completes each collection. Going Places is the only moving target: its percentage
-- uses the larger of the published catalogue or the Gold threshold, so Platinum can never leapfrog
-- Gold while the catalogue is still small.
alter table private.achievement_definitions
  drop constraint achievement_definitions_tier_check,
  drop constraint achievement_definitions_progress_kind_check;

alter table private.achievement_definitions
  add constraint achievement_definitions_tier_check
    check (tier is null or tier in ('bronze', 'silver', 'gold', 'platinum')),
  add constraint achievement_definitions_progress_kind_check
    check (
      progress_kind is null
      or progress_kind in (
        'credited_places',
        'credited_place_coverage',
        'credited_categories',
        'credited_municipalities',
        'confirmed_contributions'
      )
    );

update private.achievement_collections
set
  name_is = case key
    when 'explorer_places' then 'Á ferðinni'
    when 'place_categories' then 'Fjölbreytt spor'
    when 'municipalities' then 'Víða farið'
    when 'contributions' then 'Leggja loppu til'
  end,
  name_en = case key
    when 'explorer_places' then 'Going Places'
    when 'place_categories' then 'Mixing It Up'
    when 'municipalities' then 'Covering Ground'
    when 'contributions' then 'Lending a Paw'
  end,
  description_is = case key
    when 'explorer_places' then 'Mismunandi staðir sem þú hefur heimsótt.'
    when 'place_categories' then 'Fjölbreytni staða sem þú hefur heimsótt.'
    when 'municipalities' then 'Sveitarfélög þar sem þú hefur heimsótt staði.'
    when 'contributions' then 'Framlög frá þér sem umsjónarmaður hefur staðfest.'
  end,
  description_en = case key
    when 'explorer_places' then 'Different places you have visited.'
    when 'place_categories' then 'Different kinds of places you have visited.'
    when 'municipalities' then 'Municipalities where you have visited places.'
    when 'contributions' then 'Contributions of yours confirmed by a Moderator.'
  end;

-- Move the existing tier rows out of the unique display-order range before assigning the final
-- four-tier sequence. Bespoke Achievements keep positions 1 through 10.
update private.achievement_definitions
set display_order = display_order + 100
where collection is not null;

update private.achievement_definitions
set display_order = case key
  when 'explorer_places_bronze' then 11
  when 'explorer_places_silver' then 12
  when 'explorer_places_gold' then 13
  when 'place_categories_bronze' then 15
  when 'place_categories_silver' then 16
  when 'place_categories_gold' then 17
  when 'municipalities_bronze' then 19
  when 'municipalities_silver' then 20
  when 'municipalities_gold' then 21
  when 'contributions_bronze' then 23
  when 'contributions_silver' then 24
  when 'contributions_gold' then 25
end
where collection is not null;

insert into private.achievement_definitions (
  key, version, achievement_group, display_order, collection, tier, progress_kind, criteria
) values
  (
    'explorer_places_platinum', 1, 'exploration', 14, 'explorer_places', 'platinum',
    'credited_place_coverage', '{"threshold": 100}'::jsonb
  ),
  (
    'place_categories_platinum', 1, 'exploration', 18, 'place_categories', 'platinum',
    'credited_categories', '{"threshold": 5}'::jsonb
  ),
  (
    'municipalities_platinum', 1, 'exploration', 22, 'municipalities', 'platinum',
    'credited_municipalities', '{"threshold": 7}'::jsonb
  ),
  (
    'contributions_platinum', 1, 'contribution_quality', 26, 'contributions', 'platinum',
    'confirmed_contributions', '{"threshold": 25}'::jsonb
  );

-- A close first visit no longer disqualifies a Place forever. The loop now considers every
-- Check-in in chronological order and credits the first eligible event for each Place. A later
-- revisit can therefore earn credit without weakening the spacing rule.
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
  check_in_row record;
  credited_place_ids uuid[] := array[]::uuid[];
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

  for check_in_row in (
    select
      check_in.place_id as candidate_place_id,
      check_in.checked_in_at as candidate_at
    from private.check_ins as check_in
    where check_in.member_id = target_member_id
      and check_in.checked_in_at >= eligibility_start
      and check_in.checked_in_at <= as_of
    order by check_in.checked_in_at, check_in.place_id, check_in.request_id
  ) loop
    if not (check_in_row.candidate_place_id = any (credited_place_ids))
      and (last_counted is null or check_in_row.candidate_at - last_counted >= spacing)
    then
      credited_place_ids := array_append(credited_place_ids, check_in_row.candidate_place_id);
      last_counted := check_in_row.candidate_at;
      place_id := check_in_row.candidate_place_id;
      first_seen_at := check_in_row.candidate_at;
      return next;
    end if;
  end loop;
  return;
end;
$$;

comment on function private.credit_spaced_places(uuid, timestamptz, integer) is
  'Distinct checked-in Places credited toward exploration Achievements. Rapid activity is spaced, while a later eligible revisit can credit a previously skipped Place.';

create or replace function private.member_achievement_metrics(
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
    select place.id, place.category, place.lifecycle, location.municipality
    from spaced
    join private.places as place on place.id = spaced.place_id
    join private.locations as location on location.id = place.location_id
  ),
  published_totals as materialized (
    select
      count(*)::integer as total,
      (select count(*)::integer
       from spaced_place
       where spaced_place.lifecycle = 'published'::private.place_lifecycle) as credited
    from private.places as place
    where place.lifecycle = 'published'::private.place_lifecycle
  )
  select 'credited_places'::text, (select count(*)::integer from spaced)
  where exists (select 1 from eligibility)
  union all
  select
    'credited_place_coverage'::text,
    (
      select floor(
        100.0 * published_totals.credited
        / greatest(published_totals.total, 15)
      )::integer
      from published_totals
    )
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

comment on function private.member_achievement_metrics(uuid, timestamptz, integer) is
  'Every countable Achievement metric from one credited-Place pass, including live published-Place coverage for Platinum.';

comment on column private.achievement_definitions.tier is
  'bronze, silver, gold or platinum within a collection. Null for bespoke Achievements.';

commit;
