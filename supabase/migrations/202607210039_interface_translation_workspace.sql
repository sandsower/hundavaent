begin;

create table private.interface_translation_keys (
  key text primary key,
  bundled_is text not null,
  bundled_en text not null,
  active boolean not null default true,
  synced_at timestamptz not null default statement_timestamp(),
  constraint interface_translation_key_format_check check (
    key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'
  ),
  constraint interface_translation_bundled_is_check check (
    nullif(btrim(bundled_is), '') is not null and length(bundled_is) <= 10000
  ),
  constraint interface_translation_bundled_en_check check (
    nullif(btrim(bundled_en), '') is not null and length(bundled_en) <= 10000
  )
);

create table private.interface_translation_drafts (
  key text not null references private.interface_translation_keys(key) on delete cascade,
  locale private.locale_code not null,
  value text not null check (length(value) <= 10000),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (key, locale)
);

create table private.interface_translation_revisions (
  revision_number bigint generated always as identity primary key,
  request_id text not null unique
    check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  kind text not null check (kind in ('inventory_sync', 'publish', 'restore')),
  catalogues jsonb not null check (
    jsonb_typeof(catalogues) = 'object'
    and jsonb_typeof(catalogues -> 'is') = 'object'
    and jsonb_typeof(catalogues -> 'en') = 'object'
  ),
  restored_from_revision_number bigint
    references private.interface_translation_revisions(revision_number) on delete restrict,
  change_count integer not null check (change_count >= 0),
  published_at timestamptz not null default statement_timestamp()
);

create table private.interface_translation_publication (
  singleton boolean primary key default true check (singleton),
  revision_number bigint not null
    references private.interface_translation_revisions(revision_number) on delete restrict,
  draft_generation bigint not null default 0 check (draft_generation >= 0),
  updated_at timestamptz not null default statement_timestamp()
);

create table private.interface_translation_capabilities (
  singleton boolean primary key default true check (singleton),
  secret text not null check (length(secret) >= 32),
  configured_at timestamptz not null default statement_timestamp()
);

alter table private.interface_translation_keys enable row level security;
alter table private.interface_translation_drafts enable row level security;
alter table private.interface_translation_revisions enable row level security;
alter table private.interface_translation_publication enable row level security;
alter table private.interface_translation_capabilities enable row level security;

create function private.reject_interface_translation_revision_mutation()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Interface translation revisions are append-only';
end;
$$;

create trigger interface_translation_revisions_reject_update_delete
before update or delete on private.interface_translation_revisions
for each row execute function private.reject_interface_translation_revision_mutation();

create trigger interface_translation_revisions_reject_truncate
before truncate on private.interface_translation_revisions
for each statement execute function private.reject_interface_translation_revision_mutation();

create function private.interface_translation_placeholders(message text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array_agg(token_match[1] order by token_match[1]),
    array[]::text[]
  )
  from pg_catalog.regexp_matches(message, '\{[^{}]+\}', 'g') as token_match;
$$;

create function private.interface_translation_change_count(
  previous_catalogues jsonb,
  next_catalogues jsonb
)
returns integer
language sql
immutable
set search_path = ''
as $$
  with catalogue_keys as (
    select key_name
    from pg_catalog.jsonb_object_keys(coalesce(previous_catalogues -> 'is', '{}'::jsonb))
      as previous_is(key_name)
    union
    select key_name
    from pg_catalog.jsonb_object_keys(coalesce(previous_catalogues -> 'en', '{}'::jsonb))
      as previous_en(key_name)
    union
    select key_name
    from pg_catalog.jsonb_object_keys(coalesce(next_catalogues -> 'is', '{}'::jsonb))
      as next_is(key_name)
    union
    select key_name
    from pg_catalog.jsonb_object_keys(coalesce(next_catalogues -> 'en', '{}'::jsonb))
      as next_en(key_name)
  )
  select count(*)::integer
  from catalogue_keys
  where previous_catalogues #> array['is', key_name]
      is distinct from next_catalogues #> array['is', key_name]
    or previous_catalogues #> array['en', key_name]
      is distinct from next_catalogues #> array['en', key_name];
$$;

create function private.require_interface_translation_request_id(command_request_id text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if command_request_id is null
    or command_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode = '22023', message = 'Valid request identifier required';
  end if;
end;
$$;

create function private.require_interface_translation_proof(
  command_request_id text,
  command_issued_at bigint,
  canonical_message text,
  command_proof text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  capability_secret text;
  current_epoch_seconds bigint;
  expected_proof text;
begin
  perform private.require_interface_translation_request_id(command_request_id);

  current_epoch_seconds := floor(extract(epoch from statement_timestamp()))::bigint;
  if command_issued_at is null
    or command_issued_at < current_epoch_seconds - 300
    or command_issued_at > current_epoch_seconds + 300
    or canonical_message is null
    or command_proof is null
    or command_proof !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '42501',
      message = 'Valid interface translation capability required';
  end if;

  select capability.secret
  into capability_secret
  from private.interface_translation_capabilities as capability
  where capability.singleton;

  if capability_secret is null then
    raise exception using
      errcode = '42501',
      message = 'Interface translation capability unavailable';
  end if;

  expected_proof := encode(
    extensions.hmac(
      canonical_message,
      capability_secret,
      'sha256'
    ),
    'hex'
  );

  if command_proof <> expected_proof then
    raise exception using
      errcode = '42501',
      message = 'Valid interface translation capability required';
  end if;
end;
$$;

create function private.validate_interface_translation_catalogues(candidate_catalogues jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  active_keys text[];
  english_keys text[];
  icelandic_keys text[];
  key_record record;
  value_en text;
  value_is text;
begin
  if candidate_catalogues is null
    or jsonb_typeof(candidate_catalogues) <> 'object'
    or jsonb_typeof(candidate_catalogues -> 'is') <> 'object'
    or jsonb_typeof(candidate_catalogues -> 'en') <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Complete interface translation catalogues required';
  end if;

  select array_agg(translation_key.key order by translation_key.key)
  into active_keys
  from private.interface_translation_keys as translation_key
  where translation_key.active;

  select array_agg(key_name order by key_name)
  into icelandic_keys
  from jsonb_object_keys(candidate_catalogues -> 'is') as keys(key_name);

  select array_agg(key_name order by key_name)
  into english_keys
  from jsonb_object_keys(candidate_catalogues -> 'en') as keys(key_name);

  if active_keys is null
    or icelandic_keys is distinct from active_keys
    or english_keys is distinct from active_keys then
    raise exception using
      errcode = '22023',
      message = 'Published interface translation keys must match the active inventory';
  end if;

  for key_record in
    select translation_key.key, translation_key.bundled_is, translation_key.bundled_en
    from private.interface_translation_keys as translation_key
    where translation_key.active
    order by translation_key.key
  loop
    if jsonb_typeof(candidate_catalogues #> array['is', key_record.key]) <> 'string'
      or jsonb_typeof(candidate_catalogues #> array['en', key_record.key]) <> 'string' then
      raise exception using
        errcode = '22023',
        message = 'Every active interface translation must be text';
    end if;

    value_is := candidate_catalogues #>> array['is', key_record.key];
    value_en := candidate_catalogues #>> array['en', key_record.key];

    if nullif(btrim(value_is), '') is null
      or nullif(btrim(value_en), '') is null
      or length(value_is) > 10000
      or length(value_en) > 10000 then
      raise exception using
        errcode = '22023',
        message = 'Published interface translations must be non-empty';
    end if;

    if private.interface_translation_placeholders(value_is)
        is distinct from private.interface_translation_placeholders(key_record.bundled_is)
      or private.interface_translation_placeholders(value_en)
        is distinct from private.interface_translation_placeholders(key_record.bundled_en)
      or private.interface_translation_placeholders(value_is)
        is distinct from private.interface_translation_placeholders(value_en) then
      raise exception using
        errcode = '22023',
        message = 'Interface translation placeholders must match the bundled contract';
    end if;
  end loop;
end;
$$;

create function public.configure_interface_translation_capability(command_secret text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if command_secret is null or length(command_secret) < 32 then
    raise exception using
      errcode = '22023',
      message = 'Strong interface translation capability required';
  end if;

  insert into private.interface_translation_capabilities (secret, configured_at)
  values (command_secret, statement_timestamp())
  on conflict (singleton)
  do update set
    secret = excluded.secret,
    configured_at = excluded.configured_at;
end;
$$;

create function public.sync_interface_translation_inventory(
  requested_catalogues jsonb,
  command_request_id text
)
returns table (
  revision_number bigint,
  published_at timestamptz,
  change_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  created_change_count integer;
  created_published_at timestamptz;
  created_revision_number bigint;
  current_catalogues jsonb;
  current_revision_number bigint;
  english_keys text[];
  icelandic_keys text[];
  locale_keys text[];
  next_catalogues jsonb;
  value_record record;
begin
  perform private.require_interface_translation_request_id(command_request_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('interface-translations', 0)
  );

  select
    revision.revision_number,
    revision.published_at,
    revision.change_count
  into created_revision_number, created_published_at, created_change_count
  from private.interface_translation_revisions as revision
  where revision.request_id = command_request_id and revision.kind = 'inventory_sync';

  if found then
    return query select created_revision_number, created_published_at, created_change_count;
    return;
  end if;

  if requested_catalogues is null or jsonb_typeof(requested_catalogues) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Two interface translation catalogues required';
  end if;

  select array_agg(locale_name order by locale_name)
  into locale_keys
  from jsonb_object_keys(requested_catalogues) as locales(locale_name);

  if locale_keys is distinct from array['en', 'is']::text[]
    or jsonb_typeof(requested_catalogues -> 'is') <> 'object'
    or jsonb_typeof(requested_catalogues -> 'en') <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Exactly Icelandic and English interface catalogues required';
  end if;

  select array_agg(key_name order by key_name)
  into icelandic_keys
  from jsonb_object_keys(requested_catalogues -> 'is') as keys(key_name);

  select array_agg(key_name order by key_name)
  into english_keys
  from jsonb_object_keys(requested_catalogues -> 'en') as keys(key_name);

  if icelandic_keys is null or english_keys is distinct from icelandic_keys then
    raise exception using
      errcode = '22023',
      message = 'Icelandic and English inventory keys must match';
  end if;

  for value_record in
    select icelandic.key_name,
      icelandic.value as value_is,
      requested_catalogues -> 'en' -> icelandic.key_name as value_en
    from jsonb_each(requested_catalogues -> 'is') as icelandic(key_name, value)
  loop
    if value_record.key_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'
      or jsonb_typeof(value_record.value_is) <> 'string'
      or jsonb_typeof(value_record.value_en) <> 'string'
      or nullif(btrim(value_record.value_is #>> '{}'), '') is null
      or nullif(btrim(value_record.value_en #>> '{}'), '') is null
      or length(value_record.value_is #>> '{}') > 10000
      or length(value_record.value_en #>> '{}') > 10000 then
      raise exception using
        errcode = '22023',
        message = 'Valid non-empty interface translation inventory required';
    end if;

    if private.interface_translation_placeholders(value_record.value_is #>> '{}')
      is distinct from private.interface_translation_placeholders(value_record.value_en #>> '{}') then
      raise exception using
        errcode = '22023',
        message = 'Bundled interface translation placeholders must match';
    end if;
  end loop;

  select revision.catalogues, revision.revision_number
  into current_catalogues, current_revision_number
  from private.interface_translation_publication as publication
  join private.interface_translation_revisions as revision
    on revision.revision_number = publication.revision_number
  where publication.singleton
  for update of publication;

  update private.interface_translation_keys
  set active = false, synced_at = statement_timestamp()
  where active;

  insert into private.interface_translation_keys (
    key,
    bundled_is,
    bundled_en,
    active,
    synced_at
  )
  select
    icelandic.key_name,
    icelandic.value,
    requested_catalogues -> 'en' ->> icelandic.key_name,
    true,
    statement_timestamp()
  from jsonb_each_text(requested_catalogues -> 'is') as icelandic(key_name, value)
  on conflict (key)
  do update set
    bundled_is = excluded.bundled_is,
    bundled_en = excluded.bundled_en,
    active = true,
    synced_at = excluded.synced_at;

  delete from private.interface_translation_drafts as draft
  using private.interface_translation_keys as translation_key
  where draft.key = translation_key.key and not translation_key.active;

  select jsonb_build_object(
    'is', coalesce(
      jsonb_object_agg(
        translation_key.key,
        case
          when nullif(btrim(current_catalogues #>> array['is', translation_key.key]), '')
              is not null
            and private.interface_translation_placeholders(
              current_catalogues #>> array['is', translation_key.key]
            ) = private.interface_translation_placeholders(translation_key.bundled_is)
            then current_catalogues #>> array['is', translation_key.key]
          else translation_key.bundled_is
        end
        order by translation_key.key
      ),
      '{}'::jsonb
    ),
    'en', coalesce(
      jsonb_object_agg(
        translation_key.key,
        case
          when nullif(btrim(current_catalogues #>> array['en', translation_key.key]), '')
              is not null
            and private.interface_translation_placeholders(
              current_catalogues #>> array['en', translation_key.key]
            ) = private.interface_translation_placeholders(translation_key.bundled_en)
            then current_catalogues #>> array['en', translation_key.key]
          else translation_key.bundled_en
        end
        order by translation_key.key
      ),
      '{}'::jsonb
    )
  )
  into next_catalogues
  from private.interface_translation_keys as translation_key
  where translation_key.active;

  perform private.validate_interface_translation_catalogues(next_catalogues);

  if current_catalogues is not null and next_catalogues = current_catalogues then
    select revision.published_at, revision.change_count
    into created_published_at, created_change_count
    from private.interface_translation_revisions as revision
    where revision.revision_number = current_revision_number;

    return query select current_revision_number, created_published_at, created_change_count;
    return;
  end if;

  created_change_count := private.interface_translation_change_count(
    coalesce(current_catalogues, '{"is":{},"en":{}}'::jsonb),
    next_catalogues
  );

  insert into private.interface_translation_revisions (
    request_id,
    kind,
    catalogues,
    change_count
  ) values (
    command_request_id,
    'inventory_sync',
    next_catalogues,
    created_change_count
  )
  returning
    interface_translation_revisions.revision_number,
    interface_translation_revisions.published_at
  into created_revision_number, created_published_at;

  insert into private.interface_translation_publication (
    singleton,
    revision_number,
    updated_at
  ) values (
    true,
    created_revision_number,
    statement_timestamp()
  )
  on conflict (singleton)
  do update set
    revision_number = excluded.revision_number,
    updated_at = excluded.updated_at;

  return query select created_revision_number, created_published_at, created_change_count;
end;
$$;

create function public.get_published_interface_translations(requested_locale text)
returns table (
  revision_number bigint,
  published_at timestamptz,
  messages jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if requested_locale not in ('is', 'en') then
    raise exception using
      errcode = '22023',
      message = 'Supported interface translation locale required';
  end if;

  return query
  select
    revision.revision_number,
    revision.published_at,
    revision.catalogues -> requested_locale
  from private.interface_translation_publication as publication
  join private.interface_translation_revisions as revision
    on revision.revision_number = publication.revision_number
  where publication.singleton;
end;
$$;

create function public.get_interface_translation_workspace(
  command_request_id text,
  command_issued_at bigint,
  command_proof text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_catalogues jsonb;
  current_draft_generation bigint;
  current_published_at timestamptz;
  current_revision_number bigint;
  entries jsonb;
  pending_count bigint;
  revisions jsonb;
begin
  perform private.require_interface_translation_proof(
    command_request_id,
    command_issued_at,
    'interface-translations-v2:read_workspace:' || command_request_id || ':' ||
      command_issued_at::text,
    command_proof
  );

  select
    revision.catalogues,
    publication.draft_generation,
    revision.published_at,
    revision.revision_number
  into
    current_catalogues,
    current_draft_generation,
    current_published_at,
    current_revision_number
  from private.interface_translation_publication as publication
  join private.interface_translation_revisions as revision
    on revision.revision_number = publication.revision_number
  where publication.singleton;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', translation_key.key,
        'namespace', split_part(translation_key.key, '.', 1),
        'published', jsonb_build_object(
          'is', current_catalogues #>> array['is', translation_key.key],
          'en', current_catalogues #>> array['en', translation_key.key]
        ),
        'draft', jsonb_build_object('is', draft_is.value, 'en', draft_en.value),
        'versions', jsonb_build_object(
          'is', coalesce(draft_is.version, 0),
          'en', coalesce(draft_en.version, 0)
        ),
        'changed', jsonb_build_object(
          'is', draft_is.key is not null,
          'en', draft_en.key is not null
        )
      ) order by translation_key.key
    ),
    '[]'::jsonb
  )
  into entries
  from private.interface_translation_keys as translation_key
  left join private.interface_translation_drafts as draft_is
    on draft_is.key = translation_key.key and draft_is.locale = 'is'
  left join private.interface_translation_drafts as draft_en
    on draft_en.key = translation_key.key and draft_en.locale = 'en'
  where translation_key.active;

  select count(*) into pending_count
  from private.interface_translation_drafts as draft
  join private.interface_translation_keys as translation_key on translation_key.key = draft.key
  where translation_key.active;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'revisionNumber', revision.revision_number,
        'kind', revision.kind,
        'changeCount', revision.change_count,
        'publishedAt', revision.published_at,
        'restoredFromRevisionNumber', revision.restored_from_revision_number
      ) order by revision.revision_number desc
    ),
    '[]'::jsonb
  )
  into revisions
  from private.interface_translation_revisions as revision;

  return jsonb_build_object(
    'currentRevision', current_revision_number,
    'draftGeneration', coalesce(current_draft_generation, 0),
    'publishedAt', current_published_at,
    'pendingCount', pending_count,
    'entries', entries,
    'revisions', revisions
  );
end;
$$;

create function public.get_interface_translation_revision(
  requested_revision_number bigint,
  command_request_id text,
  command_issued_at bigint,
  command_proof text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_interface_translation_proof(
    command_request_id,
    command_issued_at,
    'interface-translations-v2:read_revision:' || command_request_id || ':' ||
      command_issued_at::text || ':' || requested_revision_number::text,
    command_proof
  );

  select jsonb_build_object(
    'revisionNumber', revision.revision_number,
    'kind', revision.kind,
    'changeCount', revision.change_count,
    'publishedAt', revision.published_at,
    'restoredFromRevisionNumber', revision.restored_from_revision_number,
    'catalogues', revision.catalogues
  )
  into result
  from private.interface_translation_revisions as revision
  where revision.revision_number = requested_revision_number;

  if result is null then
    raise exception using
      errcode = '22023',
      message = 'Existing interface translation revision required';
  end if;

  return result;
end;
$$;

create function public.save_interface_translation_draft(
  requested_key text,
  requested_locale text,
  requested_value text,
  expected_publication_revision bigint,
  expected_draft_version bigint,
  command_request_id text,
  command_issued_at bigint,
  command_proof text
)
returns table (
  draft_version bigint,
  pending_count bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_draft_version bigint;
  current_draft_value text;
  current_publication_revision bigint;
  current_value text;
  effective_change boolean := false;
  next_draft_version bigint;
begin
  perform private.require_interface_translation_proof(
    command_request_id,
    command_issued_at,
    'interface-translations-v2:save_draft:' || command_request_id || ':' ||
      command_issued_at::text || ':' || requested_key || ':' || requested_locale || ':' ||
      coalesce(expected_publication_revision, 0)::text || ':' || expected_draft_version::text || ':' ||
      encode(extensions.digest(convert_to(requested_value, 'UTF8'), 'sha256'), 'hex'),
    command_proof
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('interface-translations', 0)
  );

  if requested_locale not in ('is', 'en')
    or requested_value is null
    or length(requested_value) > 10000
    or expected_draft_version is null
    or expected_draft_version < 0 then
    raise exception using
      errcode = '22023',
      message = 'Valid interface translation draft required';
  end if;

  if not exists (
    select 1
    from private.interface_translation_keys as translation_key
    where translation_key.key = requested_key and translation_key.active
  ) then
    raise exception using
      errcode = '22023',
      message = 'Active interface translation key required';
  end if;

  select publication.revision_number
  into current_publication_revision
  from private.interface_translation_publication as publication
  where publication.singleton
  for update;

  if current_publication_revision is null then
    raise exception using
      errcode = '55000',
      message = 'Interface translation inventory unavailable';
  end if;

  if expected_publication_revision is distinct from current_publication_revision then
    raise exception using
      errcode = '40001',
      message = 'Interface translation publication changed';
  end if;

  select draft.version, draft.value
  into current_draft_version, current_draft_value
  from private.interface_translation_drafts as draft
  where draft.key = requested_key
    and draft.locale = requested_locale::private.locale_code
  for update;

  current_draft_version := coalesce(current_draft_version, 0);
  if expected_draft_version <> current_draft_version then
    raise exception using
      errcode = '40001',
      message = 'Interface translation draft changed';
  end if;

  select revision.catalogues #>> array[requested_locale, requested_key]
  into current_value
  from private.interface_translation_revisions as revision
  where revision.revision_number = current_publication_revision;

  if requested_value = current_value then
    delete from private.interface_translation_drafts as draft
    where draft.key = requested_key
      and draft.locale = requested_locale::private.locale_code;
    next_draft_version := 0;
    effective_change := current_draft_version > 0;
  elsif current_draft_version > 0 and requested_value = current_draft_value then
    next_draft_version := current_draft_version;
  else
    insert into private.interface_translation_drafts (
      key,
      locale,
      value,
      version,
      updated_at
    ) values (
      requested_key,
      requested_locale::private.locale_code,
      requested_value,
      1,
      statement_timestamp()
    )
    on conflict (key, locale)
    do update set
      value = excluded.value,
      version = interface_translation_drafts.version + 1,
      updated_at = excluded.updated_at
    returning interface_translation_drafts.version into next_draft_version;
    effective_change := true;
  end if;

  if effective_change then
    update private.interface_translation_publication as publication
    set draft_generation = publication.draft_generation + 1
    where publication.singleton;
  end if;

  return query
  select next_draft_version, count(*)
  from private.interface_translation_drafts as draft
  join private.interface_translation_keys as translation_key on translation_key.key = draft.key
  where translation_key.active;
end;
$$;

create function public.publish_interface_translation_drafts(
  expected_publication_revision bigint,
  expected_draft_generation bigint,
  command_request_id text,
  command_issued_at bigint,
  command_proof text
)
returns table (
  revision_number bigint,
  published_at timestamptz,
  change_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  created_change_count integer;
  created_published_at timestamptz;
  created_revision_number bigint;
  current_catalogues jsonb;
  current_draft_generation bigint;
  current_revision_number bigint;
  next_catalogues jsonb;
begin
  perform private.require_interface_translation_proof(
    command_request_id,
    command_issued_at,
    'interface-translations-v2:publish:' || command_request_id || ':' ||
      command_issued_at::text || ':' || coalesce(expected_publication_revision, 0)::text || ':' ||
      expected_draft_generation::text,
    command_proof
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('interface-translations', 0)
  );

  select revision.revision_number, revision.published_at, revision.change_count
  into created_revision_number, created_published_at, created_change_count
  from private.interface_translation_revisions as revision
  where revision.request_id = command_request_id and revision.kind = 'publish';

  if found then
    return query select created_revision_number, created_published_at, created_change_count;
    return;
  end if;

  select revision.revision_number, revision.catalogues, publication.draft_generation
  into current_revision_number, current_catalogues, current_draft_generation
  from private.interface_translation_publication as publication
  join private.interface_translation_revisions as revision
    on revision.revision_number = publication.revision_number
  where publication.singleton
  for update of publication;

  if current_revision_number is null then
    raise exception using
      errcode = '55000',
      message = 'Interface translation inventory unavailable';
  end if;

  if expected_publication_revision is distinct from current_revision_number then
    raise exception using
      errcode = '40001',
      message = 'Interface translation publication changed';
  end if;

  if expected_draft_generation is distinct from current_draft_generation then
    raise exception using
      errcode = '40001',
      message = 'Interface translation drafts changed';
  end if;

  if not exists (select 1 from private.interface_translation_drafts) then
    raise exception using
      errcode = '22023',
      message = 'Interface translation drafts required';
  end if;

  perform 1 from private.interface_translation_drafts for update;

  select jsonb_build_object(
    'is', jsonb_object_agg(
      translation_key.key,
      coalesce(draft_is.value, current_catalogues #>> array['is', translation_key.key])
      order by translation_key.key
    ),
    'en', jsonb_object_agg(
      translation_key.key,
      coalesce(draft_en.value, current_catalogues #>> array['en', translation_key.key])
      order by translation_key.key
    )
  )
  into next_catalogues
  from private.interface_translation_keys as translation_key
  left join private.interface_translation_drafts as draft_is
    on draft_is.key = translation_key.key and draft_is.locale = 'is'
  left join private.interface_translation_drafts as draft_en
    on draft_en.key = translation_key.key and draft_en.locale = 'en'
  where translation_key.active;

  perform private.validate_interface_translation_catalogues(next_catalogues);
  created_change_count := private.interface_translation_change_count(
    current_catalogues,
    next_catalogues
  );

  insert into private.interface_translation_revisions (
    request_id,
    kind,
    catalogues,
    change_count
  ) values (
    command_request_id,
    'publish',
    next_catalogues,
    created_change_count
  )
  returning
    interface_translation_revisions.revision_number,
    interface_translation_revisions.published_at
  into created_revision_number, created_published_at;

  update private.interface_translation_publication as publication
  set
    revision_number = created_revision_number,
    updated_at = statement_timestamp()
  where publication.singleton;

  delete from private.interface_translation_drafts;

  return query select created_revision_number, created_published_at, created_change_count;
end;
$$;

create function public.restore_interface_translation_revision(
  requested_revision_number bigint,
  expected_current_revision_number bigint,
  command_request_id text,
  command_issued_at bigint,
  command_proof text
)
returns table (
  revision_number bigint,
  published_at timestamptz,
  change_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  created_change_count integer;
  created_published_at timestamptz;
  created_revision_number bigint;
  current_catalogues jsonb;
  current_revision_number bigint;
  next_catalogues jsonb;
  target_catalogues jsonb;
begin
  perform private.require_interface_translation_proof(
    command_request_id,
    command_issued_at,
    'interface-translations-v2:restore:' || command_request_id || ':' ||
      command_issued_at::text || ':' || requested_revision_number::text || ':' ||
      coalesce(expected_current_revision_number, 0)::text,
    command_proof
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('interface-translations', 0)
  );

  select revision.revision_number, revision.published_at, revision.change_count
  into created_revision_number, created_published_at, created_change_count
  from private.interface_translation_revisions as revision
  where revision.request_id = command_request_id and revision.kind = 'restore';

  if found then
    return query select created_revision_number, created_published_at, created_change_count;
    return;
  end if;

  select revision.revision_number, revision.catalogues
  into current_revision_number, current_catalogues
  from private.interface_translation_publication as publication
  join private.interface_translation_revisions as revision
    on revision.revision_number = publication.revision_number
  where publication.singleton
  for update of publication;

  if current_revision_number is null then
    raise exception using
      errcode = '55000',
      message = 'Interface translation inventory unavailable';
  end if;

  if expected_current_revision_number is distinct from current_revision_number then
    raise exception using
      errcode = '40001',
      message = 'Interface translation publication changed';
  end if;

  if exists (select 1 from private.interface_translation_drafts) then
    raise exception using
      errcode = '55000',
      message = 'Publish or revert interface translation drafts before restore';
  end if;

  select revision.catalogues
  into target_catalogues
  from private.interface_translation_revisions as revision
  where revision.revision_number = requested_revision_number;

  if target_catalogues is null then
    raise exception using
      errcode = '22023',
      message = 'Existing interface translation revision required';
  end if;

  select jsonb_build_object(
    'is', jsonb_object_agg(
      translation_key.key,
      case
        when nullif(btrim(target_catalogues #>> array['is', translation_key.key]), '') is not null
          and private.interface_translation_placeholders(
            target_catalogues #>> array['is', translation_key.key]
          ) = private.interface_translation_placeholders(translation_key.bundled_is)
          then target_catalogues #>> array['is', translation_key.key]
        when nullif(btrim(current_catalogues #>> array['is', translation_key.key]), '') is not null
          and private.interface_translation_placeholders(
            current_catalogues #>> array['is', translation_key.key]
          ) = private.interface_translation_placeholders(translation_key.bundled_is)
          then current_catalogues #>> array['is', translation_key.key]
        else translation_key.bundled_is
      end
      order by translation_key.key
    ),
    'en', jsonb_object_agg(
      translation_key.key,
      case
        when nullif(btrim(target_catalogues #>> array['en', translation_key.key]), '') is not null
          and private.interface_translation_placeholders(
            target_catalogues #>> array['en', translation_key.key]
          ) = private.interface_translation_placeholders(translation_key.bundled_en)
          then target_catalogues #>> array['en', translation_key.key]
        when nullif(btrim(current_catalogues #>> array['en', translation_key.key]), '') is not null
          and private.interface_translation_placeholders(
            current_catalogues #>> array['en', translation_key.key]
          ) = private.interface_translation_placeholders(translation_key.bundled_en)
          then current_catalogues #>> array['en', translation_key.key]
        else translation_key.bundled_en
      end
      order by translation_key.key
    )
  )
  into next_catalogues
  from private.interface_translation_keys as translation_key
  where translation_key.active;

  perform private.validate_interface_translation_catalogues(next_catalogues);
  created_change_count := private.interface_translation_change_count(
    current_catalogues,
    next_catalogues
  );

  insert into private.interface_translation_revisions (
    request_id,
    kind,
    catalogues,
    restored_from_revision_number,
    change_count
  ) values (
    command_request_id,
    'restore',
    next_catalogues,
    requested_revision_number,
    created_change_count
  )
  returning
    interface_translation_revisions.revision_number,
    interface_translation_revisions.published_at
  into created_revision_number, created_published_at;

  update private.interface_translation_publication as publication
  set
    revision_number = created_revision_number,
    updated_at = statement_timestamp()
  where publication.singleton;

  return query select created_revision_number, created_published_at, created_change_count;
end;
$$;

revoke all on private.interface_translation_keys
  from public, anon, authenticated, service_role;
revoke all on private.interface_translation_drafts
  from public, anon, authenticated, service_role;
revoke all on private.interface_translation_revisions
  from public, anon, authenticated, service_role;
revoke all on private.interface_translation_publication
  from public, anon, authenticated, service_role;
revoke all on private.interface_translation_capabilities
  from public, anon, authenticated, service_role;

revoke execute on function private.reject_interface_translation_revision_mutation()
  from public, anon, authenticated, service_role;
revoke execute on function private.interface_translation_placeholders(text)
  from public, anon, authenticated, service_role;
revoke execute on function private.interface_translation_change_count(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.require_interface_translation_request_id(text)
  from public, anon, authenticated, service_role;
revoke execute on function private.require_interface_translation_proof(text, bigint, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function private.validate_interface_translation_catalogues(jsonb)
  from public, anon, authenticated, service_role;

revoke execute on function public.configure_interface_translation_capability(text)
  from public, anon, authenticated;
grant execute on function public.configure_interface_translation_capability(text)
  to service_role;

revoke execute on function public.sync_interface_translation_inventory(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.sync_interface_translation_inventory(jsonb, text)
  to service_role;

revoke execute on function public.get_published_interface_translations(text)
  from public, service_role;
grant execute on function public.get_published_interface_translations(text)
  to anon, authenticated;

revoke execute on function public.get_interface_translation_workspace(text, bigint, text)
  from public, service_role;
grant execute on function public.get_interface_translation_workspace(text, bigint, text)
  to anon, authenticated;

revoke execute on function public.get_interface_translation_revision(bigint, text, bigint, text)
  from public, service_role;
grant execute on function public.get_interface_translation_revision(bigint, text, bigint, text)
  to anon, authenticated;

revoke execute on function public.save_interface_translation_draft(
  text,
  text,
  text,
  bigint,
  bigint,
  text,
  bigint,
  text
) from public, service_role;
grant execute on function public.save_interface_translation_draft(
  text,
  text,
  text,
  bigint,
  bigint,
  text,
  bigint,
  text
) to anon, authenticated;

revoke execute on function public.publish_interface_translation_drafts(bigint, bigint, text, bigint, text)
  from public, service_role;
grant execute on function public.publish_interface_translation_drafts(bigint, bigint, text, bigint, text)
  to anon, authenticated;

revoke execute on function public.restore_interface_translation_revision(bigint, bigint, text, bigint, text)
  from public, service_role;
grant execute on function public.restore_interface_translation_revision(bigint, bigint, text, bigint, text)
  to anon, authenticated;

comment on table private.interface_translation_revisions is
  'Immutable published interface catalogue snapshots. Restore always appends a new revision.';
comment on function public.get_published_interface_translations(text) is
  'Public current interface catalogue for one supported locale, with no draft exposure.';
comment on function public.sync_interface_translation_inventory(jsonb, text) is
  'Deployment-only key inventory synchronization that preserves compatible published edits.';
comment on function public.publish_interface_translation_drafts(bigint, bigint, text, bigint, text) is
  'Capability-checked atomic publication of every shared draft after server-side validation.';

commit;
