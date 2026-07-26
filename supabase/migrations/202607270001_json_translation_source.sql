begin;

create function public.sync_interface_translation_inventory_from_source(
  requested_catalogues jsonb,
  expected_workspace_revision bigint,
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
  created_catalogues jsonb;
  created_change_count integer;
  created_published_at timestamptz;
  created_revision_number bigint;
  current_catalogues jsonb;
  current_change_count integer;
  current_published_at timestamptz;
  current_revision_kind text;
  current_revision_number bigint;
  english_keys text[];
  icelandic_keys text[];
  locale_keys text[];
  value_record record;
begin
  perform private.require_interface_translation_request_id(command_request_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('interface-translations', 0)
  );

  select
    revision.catalogues,
    revision.change_count,
    revision.kind,
    revision.published_at,
    revision.revision_number
  into
    current_catalogues,
    current_change_count,
    current_revision_kind,
    current_published_at,
    current_revision_number
  from private.interface_translation_publication as publication
  join private.interface_translation_revisions as revision
    on revision.revision_number = publication.revision_number
  where publication.singleton
  for update of publication;

  select
    revision.catalogues,
    revision.revision_number,
    revision.published_at,
    revision.change_count
  into
    created_catalogues,
    created_revision_number,
    created_published_at,
    created_change_count
  from private.interface_translation_revisions as revision
  where revision.request_id = command_request_id and revision.kind = 'inventory_sync';

  if found then
    if created_catalogues is distinct from requested_catalogues then
      raise exception using
        errcode = '22023',
        message = 'Interface translation request ID already used for different catalogues';
    end if;
    if current_revision_number = created_revision_number then
      return query select created_revision_number, created_published_at, created_change_count;
      return;
    end if;
    raise exception using
      errcode = '40001',
      message = 'Published interface translations changed after JSON synchronization';
  end if;

  if current_revision_number is not null
      and current_revision_kind <> 'inventory_sync'
      and expected_workspace_revision is distinct from current_revision_number then
    raise exception using
      errcode = '40001',
      message = 'Published interface translations changed after JSON synchronization';
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

  perform private.validate_interface_translation_catalogues(requested_catalogues);

  if current_catalogues is not null
    and requested_catalogues = current_catalogues
    and current_revision_kind = 'inventory_sync' then
    return query select current_revision_number, current_published_at, current_change_count;
    return;
  end if;

  created_change_count := private.interface_translation_change_count(
    coalesce(current_catalogues, '{"is":{},"en":{}}'::jsonb),
    requested_catalogues
  );

  insert into private.interface_translation_revisions (
    request_id,
    kind,
    catalogues,
    change_count
  ) values (
    command_request_id,
    'inventory_sync',
    requested_catalogues,
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

comment on function public.sync_interface_translation_inventory_from_source(jsonb, bigint, text) is
  'Publishes the exact reviewed JSON catalogues unless a newer unsynchronized workspace revision exists.';

revoke execute on function public.sync_interface_translation_inventory_from_source(jsonb, bigint, text)
  from public, anon, authenticated;
grant execute on function public.sync_interface_translation_inventory_from_source(jsonb, bigint, text)
  to service_role;

commit;
