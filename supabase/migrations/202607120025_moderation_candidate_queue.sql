begin;

-- Supports the Moderator hub Candidate queue: an oldest-first keyset-paginated list of the
-- Places still awaiting review, without loading every unpublished Place's full detail.
create index places_candidate_queue_idx
  on private.places (created_at, id)
  where lifecycle = 'candidate';

create function public.list_moderation_candidate_places(
  cursor_created_at timestamptz default null,
  cursor_place_id uuid default null,
  requested_limit integer default 20
)
returns table (
  place_id uuid,
  operator_name text,
  category text,
  address_line text,
  locality text,
  municipality text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  page_size integer := least(greatest(coalesce(requested_limit, 20), 1), 51);
begin
  perform security.require_moderator();
  if (cursor_created_at is null) <> (cursor_place_id is null) then
    raise exception using errcode = '22023', message = 'Candidate queue cursor is invalid';
  end if;

  return query
  select
    place.id,
    operator_record.name,
    place.category::text,
    location_record.address_line,
    location_record.locality,
    location_record.municipality,
    place.created_at
  from private.places as place
  join private.operators as operator_record on operator_record.id = place.operator_id
  join private.locations as location_record on location_record.id = place.location_id
  where place.lifecycle = 'candidate'
    and (
      cursor_created_at is null
      or (place.created_at, place.id) > (cursor_created_at, cursor_place_id)
    )
  order by place.created_at asc, place.id asc
  limit page_size;
end;
$$;

revoke execute on function public.list_moderation_candidate_places(timestamptz, uuid, integer)
  from public, anon, service_role;

grant execute on function public.list_moderation_candidate_places(timestamptz, uuid, integer)
  to authenticated;

comment on function public.list_moderation_candidate_places(timestamptz, uuid, integer) is
  'Moderator-only keyset-paginated queue of unpublished Candidate Places awaiting review, oldest first.';

commit;
