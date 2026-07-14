begin;

-- Place media: Evidence screenshots and public Place photography.
--
-- Two asset classes share one table (`private.place_media`), discriminated by `kind`, because
-- they share every structural concern (Place linkage, storage object, uploader, retirement,
-- audit) and only diverge on provenance vs. licensing fields and on approval semantics. They
-- never share a bucket or a publication path: evidence objects live in `place-evidence`, which
-- no role but a signed-in Moderator can ever read; photo objects live in `place-photos`, whose
-- objects are unreadable until an approval join succeeds. An Evidence screenshot row is
-- structurally incapable of ever reaching `approval_state = 'approved'` (see
-- place_media_evidence_never_public_check below), so there is no code path that "flips a flag"
-- to publish a screenshot.

create type private.place_media_kind as enum ('evidence_screenshot', 'photo');
create type private.place_media_approval_state as enum ('pending', 'approved', 'rejected');

create table private.place_media (
  id uuid primary key default extensions.gen_random_uuid(),
  place_id uuid not null references private.places(id) on delete cascade,
  kind private.place_media_kind not null,

  storage_bucket text not null check (storage_bucket in ('place-evidence', 'place-photos')),
  storage_object_path text not null check (btrim(storage_object_path) <> ''),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 15728640),
  width_px integer not null check (width_px > 0),
  height_px integer not null check (height_px > 0),

  -- Evidence provenance: required, and only meaningful, for kind = 'evidence_screenshot'.
  source_url text check (source_url is null or source_url ~ '^https?://'),
  captured_at timestamptz,
  captured_by uuid references auth.users(id) on delete set null,

  -- Photo licensing metadata: required before approval, and only meaningful, for kind = 'photo'.
  photographer_or_uploader text
    check (photographer_or_uploader is null or btrim(photographer_or_uploader) <> ''),
  source_or_capture_date date,
  license_reference text check (license_reference is null or btrim(license_reference) <> ''),
  alt_text_is text check (alt_text_is is null or btrim(alt_text_is) <> ''),
  alt_text_en text check (alt_text_en is null or btrim(alt_text_en) <> ''),

  approval_state private.place_media_approval_state not null default 'pending',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,

  uploaded_by uuid not null references auth.users(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  request_id uuid not null,
  mutation_request_id uuid,

  retired_at timestamptz,
  retired_by uuid references auth.users(id) on delete set null,

  constraint place_media_bucket_matches_kind_check check (
    (kind = 'evidence_screenshot' and storage_bucket = 'place-evidence') or
    (kind = 'photo' and storage_bucket = 'place-photos')
  ),
  constraint place_media_evidence_provenance_check check (
    kind <> 'evidence_screenshot' or (
      source_url is not null and captured_at is not null and captured_by is not null
    )
  ),
  constraint place_media_evidence_never_public_check check (
    kind <> 'evidence_screenshot' or approval_state = 'pending'
  ),
  constraint place_media_approval_requires_metadata_check check (
    approval_state <> 'approved' or (
      kind = 'photo' and
      photographer_or_uploader is not null and
      source_or_capture_date is not null and
      license_reference is not null and
      alt_text_is is not null and
      alt_text_en is not null and
      approved_by is not null and
      approved_at is not null
    )
  ),
  constraint place_media_retirement_actor_check check (
    (retired_at is null) = (retired_by is null)
  ),
  unique (storage_bucket, storage_object_path)
);

create index place_media_place_kind_idx
  on private.place_media (place_id, kind);

create index place_media_public_photo_idx
  on private.place_media (place_id)
  where kind = 'photo' and approval_state = 'approved' and retired_at is null;

-- Unique, not just indexed: the advisory lock in register_place_media (below) serializes
-- concurrent calls from the same actor so the check-then-insert idempotency read never races
-- itself, but the UNIQUE constraint is the schema-level backstop that makes a duplicate
-- (uploaded_by, request_id) row impossible even if that invariant is ever violated by a future
-- code path that does not take the lock.
create unique index place_media_uploader_request_idx
  on private.place_media (uploaded_by, request_id);

alter table private.place_media enable row level security;

revoke all on private.place_media from public, anon, authenticated, service_role;

comment on table private.place_media is
  'Evidence screenshots and public Place photography. Kind is fixed at insert time; an Evidence row can never reach approval_state = approved (see place_media_evidence_never_public_check).';

-- Storage buckets. Both are private (public = false): nothing is fetchable through the
-- unauthenticated /object/public/ endpoint. Read access is entirely governed by the
-- storage.objects RLS policies below, so "approved" is enforced by a live join evaluated at
-- signing time, not by whether a path was ever revealed to a browser. A signed URL minted while
-- the join succeeds is a bearer token good until it expires, so takedown latency for an
-- already-issued URL is bounded by that URL's TTL (5 minutes, minted fresh on every render - see
-- signPlaceMediaUrl), not instantaneous.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('place-evidence', 'place-evidence', false, 15728640,
    array['image/png', 'image/jpeg', 'image/webp']),
  ('place-photos', 'place-photos', false, 15728640,
    array['image/png', 'image/jpeg', 'image/webp']);

-- Storage gateway functions. storage.objects RLS policies run as the querying role (anon or
-- authenticated), which has no direct EXECUTE grant on security.is_moderator() or SELECT on
-- private.place_media, so each policy calls a small security-definer gateway function instead
-- (same RLS-via-revoke-plus-gateway shape used everywhere else in this app, applied to Storage).
create function private.can_read_evidence_object()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select security.is_moderator();
$$;

create function private.can_write_evidence_object()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select security.is_moderator();
$$;

create function private.can_write_photo_object()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select security.is_moderator();
$$;

-- A Moderator must be able to preview a still-pending or rejected Photo (to decide whether to
-- approve it) before the public approval-join policy below would ever allow anyone to read it.
create function private.can_read_photo_object()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select security.is_moderator();
$$;

create function private.is_approved_photo_object(object_name text)
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
      and media.approval_state = 'approved'
      and media.retired_at is null
  );
$$;

revoke execute on function private.can_read_evidence_object()
  from public, anon, service_role;
revoke execute on function private.can_write_evidence_object()
  from public, anon, service_role;
revoke execute on function private.can_write_photo_object()
  from public, anon, service_role;
revoke execute on function private.can_read_photo_object()
  from public, anon, service_role;
revoke execute on function private.is_approved_photo_object(text)
  from public, service_role;

grant execute on function private.can_read_evidence_object() to authenticated;
grant execute on function private.can_write_evidence_object() to authenticated;
grant execute on function private.can_write_photo_object() to authenticated;
grant execute on function private.can_read_photo_object() to authenticated;
grant execute on function private.is_approved_photo_object(text) to anon, authenticated;

comment on function private.is_approved_photo_object(text) is
  'The sole approval join gating public photo reads: nothing in place-photos is reachable without a matching approved, non-retired place_media row. Evaluated at signed-URL mint time; an already-issued signed URL remains fetchable until it expires (5-minute TTL), not instantaneously revoked on retirement.';

create policy "moderators_read_evidence_objects"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'place-evidence' and private.can_read_evidence_object());

create policy "moderators_write_evidence_objects"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'place-evidence' and private.can_write_evidence_object());

create policy "moderators_write_photo_objects"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'place-photos' and private.can_write_photo_object());

create policy "moderators_read_photo_objects"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'place-photos' and private.can_read_photo_object());

create policy "public_read_approved_photo_objects"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'place-photos' and private.is_approved_photo_object(name));

-- RPC surface. Every mutation takes (command_payload jsonb, command_request_id uuid) per the
-- app-wide idempotency convention; every mutation starts by deriving the actor through
-- security.require_moderator(), which both authorizes and returns a caller-derived actor id.

create function public.register_place_media(
  command_payload jsonb,
  command_request_id uuid
)
returns table (
  media_id uuid,
  kind text,
  approval_state text,
  uploaded_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  existing_record private.place_media%rowtype;
  created_record private.place_media%rowtype;
  requested_kind private.place_media_kind;
  requested_place_id uuid;
  requested_bucket text;
  requested_path text;
  requested_mime text;
  requested_bytes integer;
  requested_width integer;
  requested_height integer;
  requested_source_url text;
  requested_captured_at timestamptz;
begin
  if command_request_id is null or command_payload is null
    or jsonb_typeof(command_payload) <> 'object'
  then
    raise exception using errcode = '22023', message = 'Place media command is invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('place-media:' || actor_id::text, 0)
  );

  select media.* into existing_record
  from private.place_media media
  where media.uploaded_by = actor_id and media.request_id = command_request_id;

  if found then
    return query
      select existing_record.id, existing_record.kind::text, existing_record.approval_state::text,
        existing_record.uploaded_at;
    return;
  end if;

  if jsonb_typeof(command_payload -> 'place_id') is distinct from 'string'
    or jsonb_typeof(command_payload -> 'kind') is distinct from 'string'
    or jsonb_typeof(command_payload -> 'storage_object_path') is distinct from 'string'
    or jsonb_typeof(command_payload -> 'mime_type') is distinct from 'string'
    or jsonb_typeof(command_payload -> 'byte_size') is distinct from 'number'
    or jsonb_typeof(command_payload -> 'width_px') is distinct from 'number'
    or jsonb_typeof(command_payload -> 'height_px') is distinct from 'number'
  then
    raise exception using errcode = '22023', message = 'Place media command is incomplete';
  end if;

  requested_kind := nullif(command_payload ->> 'kind', '')::private.place_media_kind;
  requested_place_id := (command_payload ->> 'place_id')::uuid;
  requested_path := btrim(command_payload ->> 'storage_object_path');
  requested_mime := command_payload ->> 'mime_type';
  requested_bytes := (command_payload ->> 'byte_size')::integer;
  requested_width := (command_payload ->> 'width_px')::integer;
  requested_height := (command_payload ->> 'height_px')::integer;
  requested_bucket := case requested_kind
    when 'evidence_screenshot' then 'place-evidence'
    when 'photo' then 'place-photos'
  end;

  if requested_path = '' then
    raise exception using errcode = '22023', message = 'A storage object path is required';
  end if;

  if not exists (select 1 from private.places place where place.id = requested_place_id) then
    raise exception using errcode = '22023', message = 'Place was not found';
  end if;

  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = requested_bucket and object.name = requested_path
  ) then
    raise exception using errcode = '22023', message = 'Uploaded object was not found in Storage';
  end if;

  if requested_kind = 'evidence_screenshot' then
    if jsonb_typeof(command_payload -> 'source_url') is distinct from 'string'
      or jsonb_typeof(command_payload -> 'captured_at') is distinct from 'string'
    then
      raise exception using errcode = '22023',
        message = 'Evidence screenshot requires a source URL and capture time';
    end if;

    requested_source_url := btrim(command_payload ->> 'source_url');
    if requested_source_url !~ '^https?://' then
      raise exception using errcode = '22023', message = 'Evidence source URL is invalid';
    end if;

    requested_captured_at := (command_payload ->> 'captured_at')::timestamptz;
  elsif requested_kind is null then
    raise exception using errcode = '22023', message = 'Place media kind is invalid';
  end if;

  insert into private.place_media (
    place_id, kind, storage_bucket, storage_object_path, mime_type, byte_size,
    width_px, height_px, source_url, captured_at, captured_by, uploaded_by, request_id
  ) values (
    requested_place_id, requested_kind, requested_bucket, requested_path, requested_mime,
    requested_bytes, requested_width, requested_height, requested_source_url,
    requested_captured_at,
    case when requested_kind = 'evidence_screenshot' then actor_id else null end,
    actor_id, command_request_id
  ) returning * into created_record;

  perform private.append_audit_event(
    case created_record.kind
      when 'evidence_screenshot' then 'place_media.evidence_captured'
      else 'place_media.photo_uploaded'
    end,
    'place_media', created_record.id, command_request_id,
    jsonb_build_object('place_id', requested_place_id, 'kind', created_record.kind)
  );

  return query
    select created_record.id, created_record.kind::text, created_record.approval_state::text,
      created_record.uploaded_at;
end;
$$;

create function public.get_moderation_place_media(requested_place_id uuid)
returns table (
  media_id uuid,
  kind text,
  storage_bucket text,
  storage_object_path text,
  mime_type text,
  byte_size integer,
  width_px integer,
  height_px integer,
  source_url text,
  captured_at timestamptz,
  captured_by uuid,
  photographer_or_uploader text,
  source_or_capture_date date,
  license_reference text,
  alt_text_is text,
  alt_text_en text,
  approval_state text,
  approved_by uuid,
  approved_at timestamptz,
  uploaded_by uuid,
  uploaded_at timestamptz,
  retired_at timestamptz,
  retired_by uuid
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
    select
      media.id, media.kind::text, media.storage_bucket, media.storage_object_path,
      media.mime_type, media.byte_size, media.width_px, media.height_px,
      media.source_url, media.captured_at, media.captured_by,
      media.photographer_or_uploader, media.source_or_capture_date, media.license_reference,
      media.alt_text_is, media.alt_text_en,
      media.approval_state::text, media.approved_by, media.approved_at,
      media.uploaded_by, media.uploaded_at, media.retired_at, media.retired_by
    from private.place_media media
    where media.place_id = requested_place_id
    order by media.uploaded_at desc;
end;
$$;

create function public.approve_place_media(
  command_payload jsonb,
  command_request_id uuid
)
returns table (media_id uuid, approval_state text, approved_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  media_record private.place_media%rowtype;
  requested_media_id uuid;
  photographer_value text;
  license_date date;
  license_value text;
  alt_is_value text;
  alt_en_value text;
begin
  if command_request_id is null or command_payload is null
    or jsonb_typeof(command_payload) <> 'object'
    or jsonb_typeof(command_payload -> 'media_id') is distinct from 'string'
  then
    raise exception using errcode = '22023', message = 'Approval command is invalid';
  end if;

  requested_media_id := (command_payload ->> 'media_id')::uuid;

  select media.* into media_record
  from private.place_media media
  where media.id = requested_media_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Place media was not found';
  end if;

  if media_record.kind <> 'photo' then
    raise exception using errcode = '22023', message = 'Only a photo can be approved';
  end if;

  if media_record.retired_at is not null then
    raise exception using errcode = '55006', message = 'Retired photo cannot be approved';
  end if;

  if media_record.approval_state = 'approved'
    and media_record.mutation_request_id = command_request_id
  then
    return query select media_record.id, media_record.approval_state::text, media_record.approved_at;
    return;
  end if;

  if media_record.approval_state = 'rejected' then
    raise exception using errcode = '55006',
      message = 'A rejected photo must be re-uploaded, not approved';
  end if;

  photographer_value := nullif(btrim(command_payload ->> 'photographer_or_uploader'), '');
  license_value := nullif(btrim(command_payload ->> 'license_reference'), '');
  alt_is_value := nullif(btrim(command_payload ->> 'alt_text_is'), '');
  alt_en_value := nullif(btrim(command_payload ->> 'alt_text_en'), '');

  if jsonb_typeof(command_payload -> 'source_or_capture_date') is distinct from 'string' then
    raise exception using errcode = '22023', message = 'Licensing metadata is incomplete';
  end if;
  license_date := (command_payload ->> 'source_or_capture_date')::date;

  if photographer_value is null or license_value is null or alt_is_value is null
    or alt_en_value is null or license_date is null
  then
    raise exception using errcode = '22023', message = 'Licensing metadata is incomplete';
  end if;

  update private.place_media
  set
    photographer_or_uploader = photographer_value,
    source_or_capture_date = license_date,
    license_reference = license_value,
    alt_text_is = alt_is_value,
    alt_text_en = alt_en_value,
    approval_state = 'approved',
    approved_by = actor_id,
    approved_at = statement_timestamp(),
    mutation_request_id = command_request_id
  where id = requested_media_id
  returning * into media_record;

  perform private.append_audit_event(
    'place_media.photo_approved', 'place_media', media_record.id, command_request_id,
    jsonb_build_object('place_id', media_record.place_id)
  );

  return query select media_record.id, media_record.approval_state::text, media_record.approved_at;
end;
$$;

create function public.reject_place_media(
  command_payload jsonb,
  command_request_id uuid
)
returns table (media_id uuid, approval_state text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  media_record private.place_media%rowtype;
  requested_media_id uuid;
begin
  if command_request_id is null or command_payload is null
    or jsonb_typeof(command_payload) <> 'object'
    or jsonb_typeof(command_payload -> 'media_id') is distinct from 'string'
  then
    raise exception using errcode = '22023', message = 'Rejection command is invalid';
  end if;

  requested_media_id := (command_payload ->> 'media_id')::uuid;

  select media.* into media_record
  from private.place_media media
  where media.id = requested_media_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Place media was not found';
  end if;

  if media_record.kind <> 'photo' then
    raise exception using errcode = '22023', message = 'Only a photo can be rejected';
  end if;

  if media_record.retired_at is not null then
    raise exception using errcode = '55006', message = 'Retired photo cannot be rejected';
  end if;

  if media_record.approval_state = 'rejected'
    and media_record.mutation_request_id = command_request_id
  then
    return query select media_record.id, media_record.approval_state::text;
    return;
  end if;

  if media_record.approval_state = 'approved' then
    raise exception using errcode = '55006',
      message = 'An approved photo must be retired, not rejected';
  end if;

  update private.place_media
  set approval_state = 'rejected', mutation_request_id = command_request_id
  where id = requested_media_id
  returning * into media_record;

  perform private.append_audit_event(
    'place_media.photo_rejected', 'place_media', media_record.id, command_request_id,
    jsonb_build_object('place_id', media_record.place_id)
  );

  return query select media_record.id, media_record.approval_state::text;
end;
$$;

create function public.retire_place_media(
  command_payload jsonb,
  command_request_id uuid
)
returns table (media_id uuid, retired_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_moderator();
  media_record private.place_media%rowtype;
  requested_media_id uuid;
begin
  if command_request_id is null or command_payload is null
    or jsonb_typeof(command_payload) <> 'object'
    or jsonb_typeof(command_payload -> 'media_id') is distinct from 'string'
  then
    raise exception using errcode = '22023', message = 'Retirement command is invalid';
  end if;

  requested_media_id := (command_payload ->> 'media_id')::uuid;

  select media.* into media_record
  from private.place_media media
  where media.id = requested_media_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Place media was not found';
  end if;

  if media_record.retired_at is not null then
    return query select media_record.id, media_record.retired_at;
    return;
  end if;

  update private.place_media
  set retired_at = statement_timestamp(), retired_by = actor_id, mutation_request_id = command_request_id
  where id = requested_media_id
  returning * into media_record;

  perform private.append_audit_event(
    case media_record.kind
      when 'evidence_screenshot' then 'place_media.evidence_retired'
      else 'place_media.photo_retired'
    end,
    'place_media', media_record.id, command_request_id,
    jsonb_build_object('place_id', media_record.place_id)
  );

  return query select media_record.id, media_record.retired_at;
end;
$$;

create function public.list_published_place_photos(requested_place_id uuid)
returns table (
  media_id uuid,
  storage_bucket text,
  storage_object_path text,
  width_px integer,
  height_px integer,
  alt_text_is text,
  alt_text_en text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    media.id, media.storage_bucket, media.storage_object_path, media.width_px, media.height_px,
    media.alt_text_is, media.alt_text_en
  from private.place_media media
  join private.places place on place.id = media.place_id
  where media.place_id = requested_place_id
    and media.kind = 'photo'
    and media.approval_state = 'approved'
    and media.retired_at is null
    and place.lifecycle = 'published'::private.place_lifecycle
  order by media.uploaded_at asc;
$$;

revoke execute on function public.register_place_media(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.get_moderation_place_media(uuid)
  from public, anon, service_role;
revoke execute on function public.approve_place_media(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.reject_place_media(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.retire_place_media(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.list_published_place_photos(uuid)
  from public, service_role;

grant execute on function public.register_place_media(jsonb, uuid) to authenticated;
grant execute on function public.get_moderation_place_media(uuid) to authenticated;
grant execute on function public.approve_place_media(jsonb, uuid) to authenticated;
grant execute on function public.reject_place_media(jsonb, uuid) to authenticated;
grant execute on function public.retire_place_media(jsonb, uuid) to authenticated;
grant execute on function public.list_published_place_photos(uuid) to anon, authenticated;

comment on function public.register_place_media(jsonb, uuid) is
  'Moderator registers a Storage object already uploaded to place-evidence or place-photos as Evidence or a candidate Photo.';

comment on function public.get_moderation_place_media(uuid) is
  'Moderator-only listing of every Place media row (including retired) with full provenance and licensing detail.';

comment on function public.approve_place_media(jsonb, uuid) is
  'Moderator records complete licensing metadata and approves a photo atomically; the table CHECK constraint is the final backstop.';

comment on function public.reject_place_media(jsonb, uuid) is
  'Moderator rejects a pending photo. An already-approved photo must be retired, not rejected.';

comment on function public.retire_place_media(jsonb, uuid) is
  'Moderator retires Evidence or a Photo of any approval state. Idempotent.';

comment on function public.list_published_place_photos(uuid) is
  'Public: approved, non-retired photo objects for a currently published Place only.';

commit;
