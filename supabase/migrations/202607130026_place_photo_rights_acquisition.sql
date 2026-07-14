begin;

-- photo-rights: approve a fail-closed photography rights policy and make acquired candidates auditable.

create type private.place_photo_rights_basis as enum (
  'explicit_permission',
  'cc0',
  'public_domain',
  'cc_by',
  'cc_by_sa',
  'official_reuse'
);

create type private.place_photo_people_review as enum (
  'unknown',
  'no_prominent_people',
  'permission_documented'
);

alter table private.place_media
  add column rights_basis private.place_photo_rights_basis,
  add column rights_evidence_reference text
    check (rights_evidence_reference is null or btrim(rights_evidence_reference) <> ''),
  add column license_url text check (license_url is null or license_url ~ '^https?://'),
  add column attribution_text text
    check (attribution_text is null or btrim(attribution_text) <> ''),
  add column attribution_url text check (attribution_url is null or attribution_url ~ '^https?://'),
  add column content_sha256 text
    check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  add column people_review private.place_photo_people_review,
  add column is_primary boolean not null default false;

comment on column private.place_media.source_url is
  'Evidence source URL for screenshots or the canonical source page for a photo.';
comment on column private.place_media.rights_evidence_reference is
  'Private audit reference proving the selected rights basis, such as a Commons revision or permission record.';
comment on column private.place_media.attribution_text is
  'Public display attribution associated with this photo.';
comment on column private.place_media.content_sha256 is
  'Lowercase SHA-256 of the stored display bytes, used for acquisition deduplication.';

alter table private.place_media
  drop constraint place_media_approval_requires_metadata_check;

alter table private.place_media
  add constraint place_media_approval_requires_metadata_check check (
    approval_state <> 'approved' or (
      kind = 'photo' and
      photographer_or_uploader is not null and
      source_or_capture_date is not null and
      license_reference is not null and
      alt_text_is is not null and
      alt_text_en is not null and
      approved_by is not null and
      approved_at is not null and
      rights_basis is not null and
      rights_evidence_reference is not null and
      attribution_text is not null and
      people_review in (
        'no_prominent_people'::private.place_photo_people_review,
        'permission_documented'::private.place_photo_people_review
      ) and
      (
        rights_basis = 'explicit_permission'::private.place_photo_rights_basis or
        (
          rights_basis in (
            'cc0'::private.place_photo_rights_basis,
            'public_domain'::private.place_photo_rights_basis,
            'cc_by'::private.place_photo_rights_basis,
            'cc_by_sa'::private.place_photo_rights_basis,
            'official_reuse'::private.place_photo_rights_basis
          ) and
          source_url is not null and
          license_url is not null
        )
      )
    )
  ) not valid,
  add constraint place_media_primary_state_check check (
    not is_primary or (
      kind = 'photo' and
      approval_state = 'approved' and
      retired_at is null
    )
  ),
  add constraint place_media_photo_rights_only_check check (
    kind = 'photo' or (
      rights_basis is null and
      rights_evidence_reference is null and
      license_url is null and
      attribution_text is null and
      attribution_url is null and
      content_sha256 is null and
      people_review is null and
      not is_primary
    )
  );

create unique index place_media_content_sha256_unique
  on private.place_media (content_sha256)
  where kind = 'photo' and content_sha256 is not null;

create unique index place_media_one_primary_photo_per_place
  on private.place_media (place_id)
  where kind = 'photo'
    and approval_state = 'approved'
    and retired_at is null
    and is_primary;

-- Retiring a primary atomically clears primary state before the table check is evaluated.
create function private.clear_retired_place_media_primary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.retired_at is not null then
    new.is_primary := false;
  end if;
  return new;
end;
$$;

create trigger clear_retired_place_media_primary
before update of retired_at on private.place_media
for each row execute function private.clear_retired_place_media_primary();

-- Acquired photos carry their rights metadata at pending registration time.
create function public.register_acquired_place_photo(
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
  registered_record record;
  media_record private.place_media%rowtype;
  rights_value private.place_photo_rights_basis;
  people_value private.place_photo_people_review;
  source_value text;
  evidence_value text;
  license_reference_value text;
  license_url_value text;
  photographer_value text;
  attribution_value text;
  attribution_url_value text;
  content_hash_value text;
  alt_is_value text;
  alt_en_value text;
  source_date_value date;
begin
  if command_payload is null or jsonb_typeof(command_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Acquired photo command is invalid';
  end if;

  if command_payload ->> 'kind' is distinct from 'photo' then
    raise exception using errcode = '22023', message = 'Acquired media must be a photo';
  end if;

  rights_value := nullif(command_payload ->> 'rights_basis', '')::private.place_photo_rights_basis;
  people_value := coalesce(
    nullif(command_payload ->> 'people_review', '')::private.place_photo_people_review,
    'unknown'::private.place_photo_people_review
  );
  source_value := nullif(btrim(command_payload ->> 'source_url'), '');
  evidence_value := nullif(btrim(command_payload ->> 'rights_evidence_reference'), '');
  license_reference_value := nullif(btrim(command_payload ->> 'license_reference'), '');
  license_url_value := nullif(btrim(command_payload ->> 'license_url'), '');
  photographer_value := nullif(btrim(command_payload ->> 'photographer_or_uploader'), '');
  attribution_value := nullif(btrim(command_payload ->> 'attribution_text'), '');
  attribution_url_value := nullif(btrim(command_payload ->> 'attribution_url'), '');
  content_hash_value := nullif(btrim(command_payload ->> 'content_sha256'), '');
  alt_is_value := nullif(btrim(command_payload ->> 'alt_text_is'), '');
  alt_en_value := nullif(btrim(command_payload ->> 'alt_text_en'), '');

  if jsonb_typeof(command_payload -> 'source_or_capture_date') is distinct from 'string' then
    raise exception using errcode = '22023', message = 'Acquired photo rights metadata is incomplete';
  end if;
  source_date_value := (command_payload ->> 'source_or_capture_date')::date;

  if rights_value is null or source_value is null or evidence_value is null
    or license_reference_value is null or license_url_value is null
    or photographer_value is null or attribution_value is null or content_hash_value is null
    or alt_is_value is null or alt_en_value is null or source_date_value is null
  then
    raise exception using errcode = '22023', message = 'Acquired photo rights metadata is incomplete';
  end if;

  if rights_value = 'explicit_permission'::private.place_photo_rights_basis then
    raise exception using errcode = '22023',
      message = 'Explicit-permission photos must be uploaded through Moderator review';
  end if;

  select * into registered_record
  from public.register_place_media(command_payload, command_request_id);

  select media.* into media_record
  from private.place_media media
  where media.id = registered_record.media_id
  for update;

  if media_record.content_sha256 is null then
    update private.place_media
    set
      source_url = source_value,
      rights_basis = rights_value,
      rights_evidence_reference = evidence_value,
      license_reference = license_reference_value,
      license_url = license_url_value,
      photographer_or_uploader = photographer_value,
      attribution_text = attribution_value,
      attribution_url = attribution_url_value,
      source_or_capture_date = source_date_value,
      content_sha256 = content_hash_value,
      alt_text_is = alt_is_value,
      alt_text_en = alt_en_value,
      people_review = people_value
    where id = media_record.id
    returning * into media_record;
  elsif media_record.content_sha256 <> content_hash_value then
    raise exception using errcode = '40001', message = 'Acquired photo retry changed content';
  end if;

  return query select media_record.id, media_record.kind::text,
    media_record.approval_state::text, media_record.uploaded_at;
end;
$$;

-- Replace moderation listing with the complete rights-review record.
drop function public.get_moderation_place_media(uuid);
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
  rights_basis text,
  rights_evidence_reference text,
  license_url text,
  attribution_text text,
  attribution_url text,
  content_sha256 text,
  people_review text,
  is_primary boolean,
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
      media.rights_basis::text, media.rights_evidence_reference, media.license_url,
      media.attribution_text, media.attribution_url, media.content_sha256,
      media.people_review::text, media.is_primary,
      media.alt_text_is, media.alt_text_en,
      media.approval_state::text, media.approved_by, media.approved_at,
      media.uploaded_by, media.uploaded_at, media.retired_at, media.retired_by
    from private.place_media media
    where media.place_id = requested_place_id
    order by media.is_primary desc, media.uploaded_at desc;
end;
$$;

-- Approval merges Moderator corrections with provenance already captured at acquisition time.
create or replace function public.approve_place_media(
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
  rights_value private.place_photo_rights_basis;
  rights_evidence_value text;
  source_value text;
  license_url_value text;
  attribution_value text;
  attribution_url_value text;
  people_value private.place_photo_people_review;
  alt_is_value text;
  alt_en_value text;
  make_primary_value boolean := false;
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

  photographer_value := coalesce(
    nullif(btrim(command_payload ->> 'photographer_or_uploader'), ''),
    media_record.photographer_or_uploader
  );
  license_value := coalesce(
    nullif(btrim(command_payload ->> 'license_reference'), ''),
    media_record.license_reference
  );
  alt_is_value := coalesce(
    nullif(btrim(command_payload ->> 'alt_text_is'), ''),
    media_record.alt_text_is
  );
  alt_en_value := coalesce(
    nullif(btrim(command_payload ->> 'alt_text_en'), ''),
    media_record.alt_text_en
  );
  rights_value := coalesce(
    nullif(command_payload ->> 'rights_basis', '')::private.place_photo_rights_basis,
    media_record.rights_basis
  );
  rights_evidence_value := coalesce(
    nullif(btrim(command_payload ->> 'rights_evidence_reference'), ''),
    media_record.rights_evidence_reference
  );
  source_value := coalesce(
    nullif(btrim(command_payload ->> 'source_url'), ''),
    media_record.source_url
  );
  license_url_value := coalesce(
    nullif(btrim(command_payload ->> 'license_url'), ''),
    media_record.license_url
  );
  attribution_value := coalesce(
    nullif(btrim(command_payload ->> 'attribution_text'), ''),
    media_record.attribution_text
  );
  attribution_url_value := coalesce(
    nullif(btrim(command_payload ->> 'attribution_url'), ''),
    media_record.attribution_url
  );
  people_value := coalesce(
    nullif(command_payload ->> 'people_review', '')::private.place_photo_people_review,
    media_record.people_review
  );

  if command_payload ? 'source_or_capture_date' then
    if jsonb_typeof(command_payload -> 'source_or_capture_date') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'Licensing metadata is incomplete';
    end if;
    license_date := (command_payload ->> 'source_or_capture_date')::date;
  else
    license_date := media_record.source_or_capture_date;
  end if;

  if command_payload ? 'make_primary' then
    if jsonb_typeof(command_payload -> 'make_primary') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'Primary photo choice is invalid';
    end if;
    make_primary_value := (command_payload ->> 'make_primary')::boolean;
  end if;

  if photographer_value is null or license_value is null or alt_is_value is null
    or alt_en_value is null or license_date is null or rights_value is null
    or rights_evidence_value is null or attribution_value is null
  then
    raise exception using errcode = '22023', message = 'Licensing metadata is incomplete';
  end if;

  if people_value is null or people_value = 'unknown'::private.place_photo_people_review then
    raise exception using errcode = '22023', message = 'People review is incomplete';
  end if;

  if rights_value <> 'explicit_permission'::private.place_photo_rights_basis
    and (source_value is null or license_url_value is null)
  then
    raise exception using errcode = '22023', message = 'Reusable license source is incomplete';
  end if;

  if make_primary_value then
    update private.place_media
    set is_primary = false
    where place_id = media_record.place_id
      and kind = 'photo'
      and is_primary
      and id <> media_record.id;
  end if;

  update private.place_media
  set
    photographer_or_uploader = photographer_value,
    source_or_capture_date = license_date,
    license_reference = license_value,
    source_url = source_value,
    rights_basis = rights_value,
    rights_evidence_reference = rights_evidence_value,
    license_url = license_url_value,
    attribution_text = attribution_value,
    attribution_url = attribution_url_value,
    people_review = people_value,
    alt_text_is = alt_is_value,
    alt_text_en = alt_en_value,
    is_primary = case when make_primary_value then true else media_record.is_primary end,
    approval_state = 'approved',
    approved_by = actor_id,
    approved_at = statement_timestamp(),
    mutation_request_id = command_request_id
  where id = requested_media_id
  returning * into media_record;

  perform private.append_audit_event(
    'place_media.photo_approved', 'place_media', media_record.id, command_request_id,
    jsonb_build_object(
      'place_id', media_record.place_id,
      'rights_basis', media_record.rights_basis,
      'is_primary', media_record.is_primary
    )
  );

  return query select media_record.id, media_record.approval_state::text, media_record.approved_at;
end;
$$;

drop function public.list_published_place_photos(uuid);
create function public.list_published_place_photos(requested_place_id uuid)
returns table (
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
  attribution_url text,
  is_primary boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    media.id, media.storage_bucket, media.storage_object_path, media.width_px, media.height_px,
    media.alt_text_is, media.alt_text_en, media.rights_basis::text, media.source_url,
    media.license_reference, media.license_url,
    coalesce(
      media.attribution_text,
      concat_ws(' - ', media.photographer_or_uploader, media.license_reference)
    ),
    media.attribution_url,
    media.is_primary
  from private.place_media media
  join private.places place on place.id = media.place_id
  where media.place_id = requested_place_id
    and media.kind = 'photo'
    and media.approval_state = 'approved'
    and media.retired_at is null
    and place.lifecycle = 'published'::private.place_lifecycle
  order by media.is_primary desc, media.uploaded_at asc;
$$;

create function public.get_photo_acquisition_inventory()
returns table (
  place_id uuid,
  lifecycle text,
  name_is text,
  name_en text,
  website_url text,
  latitude double precision,
  longitude double precision,
  existing_photo_hashes text[],
  existing_photo_source_urls text[]
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
      place.id,
      place.lifecycle::text,
      is_translation.name,
      en_translation.name,
      place.website_url,
      location.latitude,
      location.longitude,
      coalesce(
        array_agg(media.content_sha256 order by media.uploaded_at)
          filter (where media.content_sha256 is not null),
        array[]::text[]
      ),
      coalesce(
        array_agg(media.source_url order by media.uploaded_at)
          filter (where media.source_url is not null and media.kind = 'photo'),
        array[]::text[]
      )
    from private.places place
    join private.locations location on location.id = place.location_id
    join private.place_translations is_translation
      on is_translation.place_id = place.id and is_translation.locale = 'is'::private.locale_code
    join private.place_translations en_translation
      on en_translation.place_id = place.id and en_translation.locale = 'en'::private.locale_code
    left join private.place_media media
      on media.place_id = place.id and media.kind = 'photo' and media.retired_at is null
    group by place.id, place.lifecycle, is_translation.name, en_translation.name,
      place.website_url, location.latitude, location.longitude
    order by place.id;
end;
$$;

revoke execute on function public.register_acquired_place_photo(jsonb, uuid)
  from public, anon, service_role;
revoke execute on function public.get_moderation_place_media(uuid)
  from public, anon, service_role;
revoke execute on function public.list_published_place_photos(uuid)
  from public, service_role;
revoke execute on function public.get_photo_acquisition_inventory()
  from public, anon, service_role;

grant execute on function public.register_acquired_place_photo(jsonb, uuid) to authenticated;
grant execute on function public.get_moderation_place_media(uuid) to authenticated;
grant execute on function public.list_published_place_photos(uuid) to anon, authenticated;
grant execute on function public.get_photo_acquisition_inventory() to authenticated;

comment on function public.register_acquired_place_photo(jsonb, uuid) is
  'Moderator-only registration of an uploaded pending photo with complete machine-readable acquisition provenance.';
comment on function public.get_photo_acquisition_inventory() is
  'Moderator-only inventory of every Place lifecycle with identity, discovery coordinates, and existing photo identities.';
comment on function public.approve_place_media(jsonb, uuid) is
  'Moderator approval merges reviewed rights metadata, requires a completed people review, and can atomically select one primary photo.';
comment on function public.list_published_place_photos(uuid) is
  'Public: approved, active photos and safe attribution metadata for a published Place, primary first. Legacy approvals retain their already-required photographer and license attribution without an invented rights basis.';

commit;
