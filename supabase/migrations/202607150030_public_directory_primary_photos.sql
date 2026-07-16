begin;

create function public.list_published_place_primary_photos(requested_place_ids uuid[])
returns table (
  place_id uuid,
  media_id uuid,
  storage_bucket text,
  storage_object_path text,
  width_px integer,
  height_px integer,
  alt_text_is text,
  alt_text_en text,
  rights_basis text,
  source_url text,
  license_reference text,
  license_url text,
  attribution_text text,
  attribution_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    media.place_id,
    media.id,
    media.storage_bucket,
    media.storage_object_path,
    media.width_px,
    media.height_px,
    media.alt_text_is,
    media.alt_text_en,
    media.rights_basis::text,
    media.source_url,
    media.license_reference,
    media.license_url,
    media.attribution_text,
    media.attribution_url
  from private.place_media media
  join private.places place on place.id = media.place_id
  where media.place_id = any(requested_place_ids)
    and media.kind = 'photo'
    and media.approval_state = 'approved'
    and media.is_primary
    and media.retired_at is null
    and place.lifecycle = 'published'::private.place_lifecycle
  order by media.place_id;
$$;

revoke execute on function public.list_published_place_primary_photos(uuid[])
  from public, service_role;
grant execute on function public.list_published_place_primary_photos(uuid[])
  to anon, authenticated;

comment on function public.list_published_place_primary_photos(uuid[]) is
  'Public batched projection of approved primary photos for published Places.';

commit;
