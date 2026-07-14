begin;

-- Saved Places became its own focused Member surface in the day-to-day UX pass. Preserve the
-- identity-successor context that the former combined personal-history projection exposed, while
-- keeping the successor link conditional on the same public discoverability predicate.
drop function public.list_current_favourites(text, integer, timestamptz, uuid);

create function public.list_current_favourites(
  requested_locale text,
  requested_limit integer default 50,
  requested_before_saved_at timestamptz default null,
  requested_before_place_id uuid default null
)
returns table (
  place_id uuid,
  name text,
  category text,
  locality text,
  saved_at timestamptz,
  availability text,
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
    favourite.place_id,
    translation.name,
    place_record.category::text,
    location_record.locality,
    favourite.created_at,
    case
      when place_record.lifecycle = 'inactive'::private.place_lifecycle then 'inactive'
      when private.is_place_discoverable(place_record.id) then 'available'
      else 'unavailable'
    end,
    successor.successor_place_id,
    successor.successor_name,
    coalesce(successor.successor_available, false)
  from private.member_favourites as favourite
  join private.member_accounts as member_account
    on member_account.user_id = favourite.user_id
  join private.places as place_record
    on place_record.id = favourite.place_id
  join private.locations as location_record
    on location_record.id = place_record.location_id
  join private.place_translations as translation
    on translation.place_id = place_record.id
   and translation.locale = case
     when requested_locale = 'en' then 'en'::private.locale_code
     else 'is'::private.locale_code
   end
  left join lateral private.get_place_identity_successor(place_record.id, requested_locale)
    as successor on true
  where favourite.user_id = auth.uid()
    and (
      requested_before_saved_at is null
      or (favourite.created_at, favourite.place_id)
        < (requested_before_saved_at, requested_before_place_id)
    )
  order by favourite.created_at desc, favourite.place_id desc
  limit least(greatest(coalesce(requested_limit, 50), 0), 100);
$$;

revoke execute on function public.list_current_favourites(text, integer, timestamptz, uuid)
  from public, anon, service_role;
grant execute on function public.list_current_favourites(text, integer, timestamptz, uuid)
  to authenticated;

comment on function public.list_current_favourites(text, integer, timestamptz, uuid) is
  'Returns one bounded caller-owned saved projection with honest successor context and no moderator-only lifecycle detail.';

commit;
