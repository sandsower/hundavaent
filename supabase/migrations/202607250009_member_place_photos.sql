begin;

-- Member photo submission.
--
-- `private.place_media` was built in 202607120022 for exactly this shape: kind = 'photo',
-- approval_state pending by default, licensing metadata nullable until a Moderator supplies it.
-- What did not exist was a door a Member could walk through: `register_place_media` and
-- `can_write_photo_object()` are both Moderator-only. This migration opens one narrow door and
-- leaves every other one shut.
--
-- The Storage write policies are deliberately untouched. A Member never writes to `place-photos`
-- with their own credentials; the server strips metadata and writes with the service role, which
-- bypasses Storage RLS. If a Member could insert a Storage object directly, the metadata strip
-- would be advisory - a hostile client uploads unstripped bytes, a Moderator approves what looks
-- like an ordinary photo, and an approved photo is served verbatim to `anon`. A home-adjacent
-- photo would then publish its uploader's location.

-- 1. The abuse policy -----------------------------------------------------------------------
--
-- Mirrors `private.place_flag_abuse_policy` (202607110014): a singleton row, a service-role-only
-- configure RPC, and no row inserted here. No enabled row means submission fails closed with
-- 55000 until production is deliberately configured. The column defaults record the approved
-- values (3 pending per Place, 10 per hour, 8 MB) so the schema states them, but the configure
-- RPC still requires every value explicitly: a policy that half-applies is worse than one that
-- refuses.

create table private.place_media_member_policy (
  singleton boolean primary key default true check (singleton),
  pending_per_place integer not null default 3 check (pending_per_place > 0),
  uploads_per_window integer not null default 10 check (uploads_per_window > 0),
  submission_window interval not null default interval '1 hour'
    check (submission_window > interval '0 seconds'),
  byte_limit integer not null default 8388608 check (byte_limit > 0),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table private.place_media_member_policy enable row level security;

revoke all on private.place_media_member_policy from public, anon, authenticated, service_role;

comment on table private.place_media_member_policy is
  'Explicit configurable Member photo submission boundary (pending per Place, uploads per window, byte cap). No enabled row means production submission fails closed.';

create function public.configure_place_media_member_policy(
  requested_pending_per_place integer,
  requested_uploads_per_window integer,
  requested_submission_window_seconds integer,
  requested_byte_limit integer,
  requested_enabled boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if requested_pending_per_place is null
    or requested_uploads_per_window is null
    or requested_submission_window_seconds is null
    or requested_byte_limit is null
    or requested_enabled is null
    or requested_pending_per_place <= 0
    or requested_uploads_per_window <= 0
    or requested_submission_window_seconds <= 0
    or requested_byte_limit <= 0
  then
    raise exception using errcode = '22023', message = 'Member photo policy is invalid';
  end if;

  insert into private.place_media_member_policy (
    singleton, pending_per_place, uploads_per_window, submission_window, byte_limit, enabled,
    updated_at
  ) values (
    true, requested_pending_per_place, requested_uploads_per_window,
    make_interval(secs => requested_submission_window_seconds), requested_byte_limit,
    requested_enabled, statement_timestamp()
  )
  on conflict (singleton) do update set
    pending_per_place = excluded.pending_per_place,
    uploads_per_window = excluded.uploads_per_window,
    submission_window = excluded.submission_window,
    byte_limit = excluded.byte_limit,
    enabled = excluded.enabled,
    updated_at = excluded.updated_at;
end;
$$;

-- 2. The Member submission RPC --------------------------------------------------------------
--
-- Structurally `register_place_media`, minus everything a Member is not allowed to decide. Kind
-- and bucket are literals here rather than payload fields, so no payload can register Evidence,
-- and `approval_state` is left to its pending default rather than named at all.

create function public.submit_place_photo(
  command_payload jsonb,
  command_request_id uuid
)
returns table (media_id uuid, approval_state text, uploaded_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
  policy_record private.place_media_member_policy%rowtype;
  existing_record private.place_media%rowtype;
  created_record private.place_media%rowtype;
  requested_place_id uuid;
  requested_path text;
  requested_mime text;
  requested_bytes integer;
  requested_width integer;
  requested_height integer;
begin
  if command_request_id is null or command_payload is null
    or jsonb_typeof(command_payload) <> 'object'
  then
    raise exception using errcode = '22023', message = 'Photo submission command is invalid';
  end if;

  -- Same lock namespace as register_place_media, so a Member and a Moderator writing rows for the
  -- same actor still serialize against one another rather than racing the idempotency read.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('place-media:' || actor_id::text, 0)
  );

  select media.* into existing_record
  from private.place_media media
  where media.uploaded_by = actor_id and media.request_id = command_request_id;

  if found then
    return query
      select existing_record.id, existing_record.approval_state::text, existing_record.uploaded_at;
    return;
  end if;

  if jsonb_typeof(command_payload -> 'place_id') is distinct from 'string'
    or jsonb_typeof(command_payload -> 'storage_object_path') is distinct from 'string'
    or jsonb_typeof(command_payload -> 'mime_type') is distinct from 'string'
    or jsonb_typeof(command_payload -> 'byte_size') is distinct from 'number'
    or jsonb_typeof(command_payload -> 'width_px') is distinct from 'number'
    or jsonb_typeof(command_payload -> 'height_px') is distinct from 'number'
  then
    raise exception using errcode = '22023', message = 'Photo submission command is incomplete';
  end if;

  requested_place_id := (command_payload ->> 'place_id')::uuid;
  requested_path := btrim(command_payload ->> 'storage_object_path');
  requested_mime := command_payload ->> 'mime_type';
  requested_bytes := (command_payload ->> 'byte_size')::integer;
  requested_width := (command_payload ->> 'width_px')::integer;
  requested_height := (command_payload ->> 'height_px')::integer;

  if requested_path = '' then
    raise exception using errcode = '22023', message = 'A storage object path is required';
  end if;

  if not exists (select 1 from private.places place where place.id = requested_place_id) then
    raise exception using errcode = '22023', message = 'Place was not found';
  end if;

  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'place-photos' and object.name = requested_path
  ) then
    raise exception using errcode = '22023', message = 'Uploaded object was not found in Storage';
  end if;

  select policy.* into policy_record
  from private.place_media_member_policy policy
  where policy.singleton and policy.enabled;

  if not found then
    raise exception using errcode = '55000', message = 'Member photo policy is not configured';
  end if;

  -- The endpoint refuses an oversized file with 413 before any byte reaches Storage. This is the
  -- backstop for a caller that reached the RPC another way, so it answers in the policy-cap
  -- vocabulary rather than inventing a third one.
  if requested_bytes > policy_record.byte_limit then
    raise exception using errcode = '54000', message = 'Photo exceeds the size limit';
  end if;

  if (
    select count(*)
    from private.place_media media
    where media.uploaded_by = actor_id
      and media.place_id = requested_place_id
      and media.kind = 'photo'
      and media.approval_state = 'pending'
      and media.retired_at is null
  ) >= policy_record.pending_per_place then
    raise exception using errcode = '54000', message = 'Too many photos already awaiting review';
  end if;

  if (
    select count(*)
    from private.place_media media
    where media.uploaded_by = actor_id
      and media.kind = 'photo'
      and media.uploaded_at > statement_timestamp() - policy_record.submission_window
  ) >= policy_record.uploads_per_window then
    raise exception using errcode = '54000', message = 'Photo upload rate limit reached';
  end if;

  insert into private.place_media (
    place_id, kind, storage_bucket, storage_object_path, mime_type, byte_size,
    width_px, height_px, uploaded_by, request_id
  ) values (
    requested_place_id, 'photo', 'place-photos', requested_path, requested_mime,
    requested_bytes, requested_width, requested_height, actor_id, command_request_id
  ) returning * into created_record;

  return query
    select created_record.id, created_record.approval_state::text, created_record.uploaded_at;
end;
$$;

-- 3. The uploader's own view of a photo that is not public yet -------------------------------
--
-- `is_approved_photo_object` is the only gateway onto `place-photos` for an ordinary caller, and
-- by construction it never matches a pending row. A Member who has just submitted a photo would
-- therefore see nothing at all. This is the second gateway: your own photo, in whatever state,
-- until it is retired.
--
-- `uploaded_by` became nullable in 202607150036, and a null uploader is nobody's photo. The
-- explicit null guards say so rather than leaning on `null = null` evaluating to unknown, and
-- `auth.uid()` is null for `anon`, which is the same guard read from the other end.

create function private.is_own_photo_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.place_media media
    where media.storage_bucket = 'place-photos'
      and media.storage_object_path = object_name
      and media.kind = 'photo'
      and media.retired_at is null
      and media.uploaded_by is not null
      and (select auth.uid()) is not null
      and media.uploaded_by = (select auth.uid())
  );
$$;

revoke execute on function private.is_own_photo_object(text) from public, anon, service_role;
grant execute on function private.is_own_photo_object(text) to authenticated;

comment on function private.is_own_photo_object(text) is
  'The uploader gateway onto place-photos: a signed-in caller reads their own non-retired photo object in any approval state. A null uploader is nobody''s photo.';

create policy "uploader_read_own_photo_objects"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'place-photos' and private.is_own_photo_object(name));

-- 4. The Member's own photos on one Place ----------------------------------------------------

create function public.list_my_place_photos(requested_place_id uuid)
returns table (
  media_id uuid,
  storage_object_path text,
  mime_type text,
  approval_state text,
  width_px integer,
  height_px integer,
  uploaded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
begin
  return query
    select
      media.id, media.storage_object_path, media.mime_type, media.approval_state::text,
      media.width_px, media.height_px, media.uploaded_at
    from private.place_media media
    where media.place_id = requested_place_id
      and media.kind = 'photo'
      and media.uploaded_by = actor_id
      and media.retired_at is null
    order by media.uploaded_at desc;
end;
$$;

-- 5. Moderator discovery ---------------------------------------------------------------------
--
-- Which Places are waiting, not what is waiting on them. Review itself already has
-- get_moderation_place_media; this exists only so the work list can find a Place with Member
-- photos on it without scanning every Place.

create function public.list_places_with_pending_photos()
returns table (
  place_id uuid,
  pending_photo_count integer,
  newest_uploaded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
begin
  return query
    select media.place_id, count(*)::integer, max(media.uploaded_at)
    from private.place_media media
    where media.kind = 'photo'
      and media.approval_state = 'pending'
      and media.retired_at is null
    group by media.place_id
    order by max(media.uploaded_at) desc;
end;
$$;

create index place_media_pending_photo_idx
  on private.place_media (place_id, uploaded_at desc)
  where kind = 'photo' and approval_state = 'pending' and retired_at is null;

create index place_media_uploader_photo_idx
  on private.place_media (uploaded_by, place_id)
  where kind = 'photo' and retired_at is null;

-- 6. Grants ----------------------------------------------------------------------------------

revoke execute on function
  public.configure_place_media_member_policy(integer, integer, integer, integer, boolean)
  from public, anon, authenticated;
revoke execute on function public.submit_place_photo(jsonb, uuid) from public, anon, service_role;
revoke execute on function public.list_my_place_photos(uuid) from public, anon, service_role;
revoke execute on function public.list_places_with_pending_photos() from public, anon, service_role;

grant execute on function
  public.configure_place_media_member_policy(integer, integer, integer, integer, boolean)
  to service_role;
grant execute on function public.submit_place_photo(jsonb, uuid) to authenticated;
grant execute on function public.list_my_place_photos(uuid) to authenticated;
grant execute on function public.list_places_with_pending_photos() to authenticated;

comment on function
  public.configure_place_media_member_policy(integer, integer, integer, integer, boolean) is
  'Service-role-only configuration boundary for Member photo submission. Production values remain undefined until they are deliberately set.';

comment on function public.submit_place_photo(jsonb, uuid) is
  'Member registers a Storage object the server has already stripped and written as a pending Photo. Kind and bucket are fixed here, not carried by the payload.';

comment on function public.list_my_place_photos(uuid) is
  'The caller''s own non-retired photos on one Place, in every approval state, for the pending strip.';

comment on function public.list_places_with_pending_photos() is
  'Moderator work list: Places holding pending, non-retired photos, newest submission first.';

commit;
