begin;

-- personal-history adds no new private table. It composes the existing private.member_favourites (favourites)
-- and private.check_ins (private-check-in) tables through new read-only, Member-scoped RPCs, exactly as the
-- shared Place identity means Favourites, visited Places, the personal
-- map, and the chronological Check-in log are different projections of the same two private
-- sources plus the public Place identity tables. Because no new table is added, the existing
-- account-deletion cleanup seams (private.detach_member_favourites, private.detach_member_check_ins) already
-- cover every private row a Member's personal history can surface; no new seam is required here.

-- Looks up the single most recent identity transition in which the requested Place was retired as
-- a predecessor with a distinct successor Place in private.place_identity_transitions. A
-- rebrand or a plain inactivation never sets successor_place_id, so those transitions never
-- surface here. Only one hop is resolved: if the successor itself was later superseded again, the
-- personal history surface still names the most recent Place the Member's own predecessor
-- transitioned into, honestly presented as "no longer active" rather than silently chased further.
--
-- successor_available: transition_place_identity requires the successor to be a
-- *Candidate* at transition time (successor.lifecycle <> 'candidate' is rejected), so a successor
-- is normally NOT publicly discoverable until a Moderator later verifies and publishes it. The
-- personal-history views must therefore know whether the successor currently has a public
-- profile: when it does not, they show the successor's name honestly without linking into a
-- discovery deep link that would select nothing. is_place_discoverable is the same public-truth
-- predicate the availability projection already uses.
create function private.get_place_identity_successor(
  requested_place_id uuid,
  requested_locale text
)
returns table (
  successor_place_id uuid,
  successor_name text,
  successor_available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    transition_record.successor_place_id,
    translation_record.name,
    private.is_place_discoverable(transition_record.successor_place_id)
  from private.place_identity_transitions as transition_record
  join private.place_translations as translation_record
    on translation_record.place_id = transition_record.successor_place_id
   and translation_record.locale = case
     when requested_locale = 'en' then 'en'::private.locale_code
     else 'is'::private.locale_code
   end
  where transition_record.predecessor_place_id = requested_place_id
    and transition_record.successor_place_id is not null
  order by transition_record.decided_at desc
  limit 1;
$$;

-- One bounded, keyset-paginated, caller-owned projection covering Favourites, visited Places, and
-- the personal map (Places are identified once and the client selects the view). Ordering is by
-- last_activity_at (the more recent of favourited_at and the latest Check-in), then Place id, both
-- server timestamps, so pagination stays stable across timezone and DST boundaries and never
-- relies on client-supplied time. availability reuses the exact three-state model
-- (available/unavailable/inactive) favourites already established for Favourites so the two surfaces
-- never invent a second vocabulary for the same public fact.
create function public.list_personal_places(
  requested_locale text,
  requested_filter text default 'all',
  requested_limit integer default 50,
  requested_before_activity_at timestamptz default null,
  requested_before_place_id uuid default null
)
returns table (
  place_id uuid,
  name text,
  category text,
  locality text,
  latitude double precision,
  longitude double precision,
  is_favourite boolean,
  favourited_at timestamptz,
  visit_count integer,
  first_visited_at timestamptz,
  last_visited_at timestamptz,
  last_activity_at timestamptz,
  availability text,
  successor_place_id uuid,
  successor_name text,
  successor_available boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  normalized_filter text := coalesce(nullif(btrim(requested_filter), ''), 'all');
  -- The upper clamp is 250 (not the paginated views' natural page sizes) because the personal map
  -- deliberately fetches one unpaginated 200-row window plus one extra row to detect truncation.
  effective_limit integer := least(greatest(coalesce(requested_limit, 50), 1), 250);
begin
  if normalized_filter not in ('all', 'favourite', 'visited') then
    raise exception using errcode = '22023', message = 'Personal Place filter is invalid';
  end if;

  return query
  with favourite_activity as (
    select favourite.place_id, favourite.created_at as favourited_at
    from private.member_favourites as favourite
    where favourite.user_id = actor_id
  ),
  visit_activity as (
    select
      check_in.place_id,
      count(*)::integer as visit_count,
      min(check_in.checked_in_at) as first_visited_at,
      max(check_in.checked_in_at) as last_visited_at
    from private.check_ins as check_in
    where check_in.member_id = actor_id
    group by check_in.place_id
  ),
  combined as (
    select
      coalesce(favourite_activity.place_id, visit_activity.place_id) as place_id,
      favourite_activity.favourited_at,
      visit_activity.visit_count,
      visit_activity.first_visited_at,
      visit_activity.last_visited_at,
      greatest(
        coalesce(favourite_activity.favourited_at, '-infinity'::timestamptz),
        coalesce(visit_activity.last_visited_at, '-infinity'::timestamptz)
      ) as last_activity_at
    from favourite_activity
    full outer join visit_activity using (place_id)
  )
  select
    place_record.id,
    translation_record.name,
    place_record.category::text,
    location_record.locality,
    location_record.latitude,
    location_record.longitude,
    combined.favourited_at is not null,
    combined.favourited_at,
    combined.visit_count,
    combined.first_visited_at,
    combined.last_visited_at,
    combined.last_activity_at,
    case
      when place_record.lifecycle = 'inactive'::private.place_lifecycle then 'inactive'
      when private.is_place_discoverable(place_record.id) then 'available'
      else 'unavailable'
    end,
    successor.successor_place_id,
    successor.successor_name,
    successor.successor_available
  from combined
  join private.places as place_record on place_record.id = combined.place_id
  join private.locations as location_record on location_record.id = place_record.location_id
  join private.place_translations as translation_record
    on translation_record.place_id = place_record.id
   and translation_record.locale = case
     when requested_locale = 'en' then 'en'::private.locale_code
     else 'is'::private.locale_code
   end
  left join lateral private.get_place_identity_successor(place_record.id, requested_locale)
    as successor on true
  where (
      normalized_filter = 'all'
      or (normalized_filter = 'favourite' and combined.favourited_at is not null)
      or (normalized_filter = 'visited' and combined.visit_count is not null)
    )
    and (
      requested_before_activity_at is null
      or (combined.last_activity_at, combined.place_id)
        < (requested_before_activity_at, requested_before_place_id)
    )
  order by combined.last_activity_at desc, combined.place_id desc
  limit effective_limit;
end;
$$;

-- The chronological Check-in log: one row per Check-in event (not deduplicated by Place, unlike
-- list_personal_places), ordered by the server-authoritative checked_in_at then Check-in id, both
-- immune to client clock skew or DST shifts. No coordinate ever existed on private.check_ins
-- (private-check-in), so this can only ever surface the Place's own public Location, never a captured Member
-- coordinate.
create function public.list_personal_check_ins(
  requested_locale text,
  requested_limit integer default 50,
  requested_before_checked_in_at timestamptz default null,
  requested_before_check_in_id uuid default null
)
returns table (
  check_in_id uuid,
  place_id uuid,
  name text,
  category text,
  locality text,
  latitude double precision,
  longitude double precision,
  checked_in_at timestamptz,
  availability text,
  successor_place_id uuid,
  successor_name text,
  successor_available boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  effective_limit integer := least(greatest(coalesce(requested_limit, 50), 1), 100);
begin
  return query
  select
    check_in.id,
    place_record.id,
    translation_record.name,
    place_record.category::text,
    location_record.locality,
    location_record.latitude,
    location_record.longitude,
    check_in.checked_in_at,
    case
      when place_record.lifecycle = 'inactive'::private.place_lifecycle then 'inactive'
      when private.is_place_discoverable(place_record.id) then 'available'
      else 'unavailable'
    end,
    successor.successor_place_id,
    successor.successor_name,
    successor.successor_available
  from private.check_ins as check_in
  join private.places as place_record on place_record.id = check_in.place_id
  join private.locations as location_record on location_record.id = place_record.location_id
  join private.place_translations as translation_record
    on translation_record.place_id = place_record.id
   and translation_record.locale = case
     when requested_locale = 'en' then 'en'::private.locale_code
     else 'is'::private.locale_code
   end
  left join lateral private.get_place_identity_successor(place_record.id, requested_locale)
    as successor on true
  where check_in.member_id = actor_id
    and (
      requested_before_checked_in_at is null
      or (check_in.checked_in_at, check_in.id)
        < (requested_before_checked_in_at, requested_before_check_in_id)
    )
  order by check_in.checked_in_at desc, check_in.id desc
  limit effective_limit;
end;
$$;

revoke execute on function private.get_place_identity_successor(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.list_personal_places(text, text, integer, timestamptz, uuid)
  from public, anon, service_role;
revoke execute on function public.list_personal_check_ins(text, integer, timestamptz, uuid)
  from public, anon, service_role;

grant execute on function public.list_personal_places(text, text, integer, timestamptz, uuid)
  to authenticated;
grant execute on function public.list_personal_check_ins(text, integer, timestamptz, uuid)
  to authenticated;

comment on function private.get_place_identity_successor(uuid, text) is
  'Resolves the one most recent successor Place a predecessor was transitioned into, if any, plus whether that successor is currently publicly discoverable (a successor is a Candidate at transition time and has no public profile until published). Never chases a second hop.';
comment on function public.list_personal_places(text, text, integer, timestamptz, uuid) is
  'Bounded, keyset-paginated, caller-owned Favourite/visited Place projection sharing one Place identity across the personal Favourites, visited, and map views. No new private table backs this function.';
comment on function public.list_personal_check_ins(text, integer, timestamptz, uuid) is
  'Bounded, keyset-paginated, caller-owned chronological Check-in log using only the Place public Location, never a captured Member coordinate.';

commit;
