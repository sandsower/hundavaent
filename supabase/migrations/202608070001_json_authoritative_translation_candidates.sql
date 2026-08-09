begin;

alter table private.interface_translation_revisions
  drop constraint interface_translation_revisions_kind_check;

alter table private.interface_translation_revisions
  add constraint interface_translation_revisions_kind_check
  check (kind in ('inventory_sync', 'publish', 'restore', 'source_ready', 'draft_restore')),
  add column based_on_revision_number bigint
    references private.interface_translation_revisions(revision_number) on delete restrict;

create table private.interface_translation_source_candidate (
  singleton boolean primary key default true check (singleton),
  revision_number bigint not null
    references private.interface_translation_revisions(revision_number) on delete restrict,
  updated_at timestamptz not null default statement_timestamp()
);

create table private.interface_translation_source_applications (
  candidate_revision_number bigint primary key
    references private.interface_translation_revisions(revision_number) on delete restrict,
  deployed_revision_number bigint not null
    references private.interface_translation_revisions(revision_number) on delete restrict,
  applied_at timestamptz not null default statement_timestamp()
);

alter table private.interface_translation_source_candidate enable row level security;
alter table private.interface_translation_source_applications enable row level security;

create function public.sync_interface_translation_inventory_from_source(
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
  current_revision_number bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('interface-translations', 0)
  );

  select publication.revision_number
  into current_revision_number
  from private.interface_translation_publication as publication
  where publication.singleton;

  return query
  select synced.revision_number, synced.published_at, synced.change_count
  from public.sync_interface_translation_inventory_from_source(
    requested_catalogues,
    current_revision_number,
    command_request_id
  ) as synced;
end;
$$;

create or replace function public.save_interface_translation_draft(
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
      message = 'Interface translation deployment changed';
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

  select (
    case
      when candidate_revision.based_on_revision_number = publication.revision_number
        and application.candidate_revision_number is null
      then candidate_revision.catalogues
      else deployed_revision.catalogues
    end
  ) #>> array[requested_locale, requested_key]
  into current_value
  from private.interface_translation_publication as publication
  join private.interface_translation_revisions as deployed_revision
    on deployed_revision.revision_number = publication.revision_number
  left join private.interface_translation_source_candidate as candidate on candidate.singleton
  left join private.interface_translation_revisions as candidate_revision
    on candidate_revision.revision_number = candidate.revision_number
  left join private.interface_translation_source_applications as application
    on application.candidate_revision_number = candidate_revision.revision_number
  where publication.singleton;

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

create function public.ready_interface_translation_drafts_for_source(
  expected_publication_revision bigint,
  expected_draft_generation bigint,
  command_request_id text,
  command_issued_at bigint,
  command_proof text
)
returns table (
  revision_number bigint,
  ready_at timestamptz,
  change_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  created_change_count integer;
  created_ready_at timestamptz;
  created_revision_number bigint;
  current_catalogues jsonb;
  current_draft_generation bigint;
  current_revision_number bigint;
  next_catalogues jsonb;
  source_catalogues jsonb;
begin
  perform private.require_interface_translation_proof(
    command_request_id,
    command_issued_at,
    'interface-translations-v3:ready_source:' || command_request_id || ':' ||
      command_issued_at::text || ':' || coalesce(expected_publication_revision, 0)::text || ':' ||
      expected_draft_generation::text,
    command_proof
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('interface-translations', 0)
  );

  select revision.revision_number, revision.published_at, revision.change_count
  into created_revision_number, created_ready_at, created_change_count
  from private.interface_translation_revisions as revision
  where revision.request_id = command_request_id and revision.kind = 'source_ready';

  if found then
    return query select created_revision_number, created_ready_at, created_change_count;
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
      message = 'Interface translation deployment changed';
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

  select candidate_revision.catalogues
  into source_catalogues
  from private.interface_translation_source_candidate as candidate
  join private.interface_translation_revisions as candidate_revision
    on candidate_revision.revision_number = candidate.revision_number
  left join private.interface_translation_source_applications as application
    on application.candidate_revision_number = candidate_revision.revision_number
  where candidate.singleton
    and candidate_revision.based_on_revision_number = current_revision_number
    and application.candidate_revision_number is null;

  source_catalogues := coalesce(source_catalogues, current_catalogues);

  select jsonb_build_object(
    'is', jsonb_object_agg(
      translation_key.key,
      coalesce(draft_is.value, source_catalogues #>> array['is', translation_key.key])
      order by translation_key.key
    ),
    'en', jsonb_object_agg(
      translation_key.key,
      coalesce(draft_en.value, source_catalogues #>> array['en', translation_key.key])
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
    based_on_revision_number,
    change_count
  ) values (
    command_request_id,
    'source_ready',
    next_catalogues,
    current_revision_number,
    created_change_count
  )
  returning
    interface_translation_revisions.revision_number,
    interface_translation_revisions.published_at
  into created_revision_number, created_ready_at;

  insert into private.interface_translation_source_candidate (
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

  delete from private.interface_translation_drafts as draft
  where draft.key is not null;

  return query select created_revision_number, created_ready_at, created_change_count;
end;
$$;

create function public.get_ready_interface_translation_source(
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
    'interface-translations-v3:read_source_candidate:' || command_request_id || ':' ||
      command_issued_at::text,
    command_proof
  );

  select jsonb_build_object(
    'candidateRevision', candidate_revision.revision_number,
    'basedOnRevision', candidate_revision.based_on_revision_number,
    'readyAt', candidate_revision.published_at,
    'candidateCatalogues', candidate_revision.catalogues,
    'baseCatalogues', base_revision.catalogues,
    'status', case
      when application.candidate_revision_number is not null then 'applied'
      when candidate_revision.based_on_revision_number = publication.revision_number then 'ready'
      else 'superseded'
    end
  )
  into result
  from private.interface_translation_source_candidate as candidate
  join private.interface_translation_revisions as candidate_revision
    on candidate_revision.revision_number = candidate.revision_number
  join private.interface_translation_revisions as base_revision
    on base_revision.revision_number = candidate_revision.based_on_revision_number
  left join private.interface_translation_source_applications as application
    on application.candidate_revision_number = candidate_revision.revision_number
  join private.interface_translation_publication as publication on publication.singleton
  where candidate.singleton;

  return result;
end;
$$;

create function public.restore_interface_translation_revision_to_drafts(
  requested_revision_number bigint,
  expected_current_revision_number bigint,
  command_request_id text,
  command_issued_at bigint,
  command_proof text
)
returns table (
  revision_number bigint,
  restored_at timestamptz,
  pending_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  created_change_count integer;
  created_revision_number bigint;
  created_restored_at timestamptz;
  current_catalogues jsonb;
  current_revision_number bigint;
  next_pending_count integer;
  restored_catalogues jsonb;
  target_catalogues jsonb;
begin
  perform private.require_interface_translation_proof(
    command_request_id,
    command_issued_at,
    'interface-translations-v3:restore_to_drafts:' || command_request_id || ':' ||
      command_issued_at::text || ':' || requested_revision_number::text || ':' ||
      expected_current_revision_number::text,
    command_proof
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('interface-translations', 0)
  );

  select revision.revision_number, revision.published_at
  into created_revision_number, created_restored_at
  from private.interface_translation_revisions as revision
  where revision.request_id = command_request_id and revision.kind = 'draft_restore';

  if found then
    select count(*)::integer into next_pending_count
    from private.interface_translation_drafts;
    return query select created_revision_number, created_restored_at, next_pending_count;
    return;
  end if;

  select publication.revision_number, revision.catalogues
  into current_revision_number, current_catalogues
  from private.interface_translation_publication as publication
  join private.interface_translation_revisions as revision
    on revision.revision_number = publication.revision_number
  where publication.singleton
  for update of publication;

  if current_revision_number is distinct from expected_current_revision_number then
    raise exception using
      errcode = '40001',
      message = 'Interface translation deployment changed';
  end if;

  if exists (select 1 from private.interface_translation_drafts) then
    raise exception using
      errcode = '55000',
      message = 'Ready or revert interface translation drafts before restore';
  end if;

  select revision.catalogues into target_catalogues
  from private.interface_translation_revisions as revision
  where revision.revision_number = requested_revision_number;

  if target_catalogues is null then
    raise exception using
      errcode = '22023',
      message = 'Interface translation revision required';
  end if;

  select jsonb_build_object(
    'is', coalesce(
      jsonb_object_agg(
        translation_key.key,
        coalesce(
          target_catalogues #>> array['is', translation_key.key],
          current_catalogues #>> array['is', translation_key.key]
        )
      ),
      '{}'::jsonb
    ),
    'en', coalesce(
      jsonb_object_agg(
        translation_key.key,
        coalesce(
          target_catalogues #>> array['en', translation_key.key],
          current_catalogues #>> array['en', translation_key.key]
        )
      ),
      '{}'::jsonb
    )
  )
  into restored_catalogues
  from private.interface_translation_keys as translation_key
  where translation_key.active;

  delete from private.interface_translation_drafts as draft
  where draft.key is not null;

  insert into private.interface_translation_drafts (
    key,
    locale,
    value,
    version,
    updated_at
  )
  select
    translation_key.key,
    locale_value.locale::private.locale_code,
    restored_catalogues #>> array[locale_value.locale, translation_key.key],
    1,
    statement_timestamp()
  from private.interface_translation_keys as translation_key
  cross join (values ('is'), ('en')) as locale_value(locale)
  where translation_key.active
    and restored_catalogues #>> array[locale_value.locale, translation_key.key]
      is distinct from current_catalogues #>> array[locale_value.locale, translation_key.key];

  select count(*)::integer into next_pending_count
  from private.interface_translation_drafts;
  created_change_count := private.interface_translation_change_count(
    current_catalogues,
    restored_catalogues
  );

  insert into private.interface_translation_revisions (
    request_id,
    kind,
    catalogues,
    based_on_revision_number,
    restored_from_revision_number,
    change_count
  ) values (
    command_request_id,
    'draft_restore',
    restored_catalogues,
    current_revision_number,
    requested_revision_number,
    created_change_count
  )
  returning
    interface_translation_revisions.revision_number,
    interface_translation_revisions.published_at
  into created_revision_number, created_restored_at;

  update private.interface_translation_publication as publication
  set draft_generation = publication.draft_generation + 1
  where publication.singleton;

  return query select created_revision_number, created_restored_at, next_pending_count;
end;
$$;

create function public.mark_interface_translation_source_candidate_applied()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  base_catalogues jsonb;
  candidate_catalogues jsonb;
  candidate_revision_number bigint;
  deployed_catalogues jsonb;
  deployed_revision_number bigint;
  locale_value text;
  translation_key text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('interface-translations', 0)
  );

  select
    candidate_revision.revision_number,
    candidate_revision.catalogues,
    base_revision.catalogues,
    deployed_revision.revision_number,
    deployed_revision.catalogues
  into
    candidate_revision_number,
    candidate_catalogues,
    base_catalogues,
    deployed_revision_number,
    deployed_catalogues
  from private.interface_translation_source_candidate as candidate
  join private.interface_translation_revisions as candidate_revision
    on candidate_revision.revision_number = candidate.revision_number
  join private.interface_translation_revisions as base_revision
    on base_revision.revision_number = candidate_revision.based_on_revision_number
  join private.interface_translation_publication as publication on publication.singleton
  join private.interface_translation_revisions as deployed_revision
    on deployed_revision.revision_number = publication.revision_number
  where candidate.singleton;

  if candidate_revision_number is null then return null; end if;

  for locale_value in select unnest(array['is', 'en'])
  loop
    for translation_key in
      select key_name
      from jsonb_object_keys(candidate_catalogues -> locale_value) as keys(key_name)
      where candidate_catalogues #> array[locale_value, key_name]
        is distinct from base_catalogues #> array[locale_value, key_name]
    loop
      if deployed_catalogues #> array[locale_value, translation_key]
        is distinct from candidate_catalogues #> array[locale_value, translation_key] then
        return null;
      end if;
    end loop;
  end loop;

  insert into private.interface_translation_source_applications (
    candidate_revision_number,
    deployed_revision_number,
    applied_at
  ) values (
    candidate_revision_number,
    deployed_revision_number,
    statement_timestamp()
  )
  on conflict on constraint interface_translation_source_applications_pkey
  do update set
    deployed_revision_number = excluded.deployed_revision_number,
    applied_at = excluded.applied_at;

  return candidate_revision_number;
end;
$$;

create or replace function public.get_interface_translation_workspace(
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
  source_candidate jsonb;
  source_catalogues jsonb;
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

  select jsonb_build_object(
    'revisionNumber', revision.revision_number,
    'readyAt', revision.published_at,
    'changeCount', revision.change_count,
    'status', case
      when application.candidate_revision_number is not null then 'applied'
      when revision.based_on_revision_number = publication.revision_number then 'ready'
      else 'superseded'
    end
  )
  into source_candidate
  from private.interface_translation_source_candidate as candidate
  join private.interface_translation_revisions as revision
    on revision.revision_number = candidate.revision_number
  left join private.interface_translation_source_applications as application
    on application.candidate_revision_number = revision.revision_number
  join private.interface_translation_publication as publication on publication.singleton
  where candidate.singleton;

  select candidate_revision.catalogues
  into source_catalogues
  from private.interface_translation_source_candidate as candidate
  join private.interface_translation_revisions as candidate_revision
    on candidate_revision.revision_number = candidate.revision_number
  left join private.interface_translation_source_applications as application
    on application.candidate_revision_number = candidate_revision.revision_number
  where candidate.singleton
    and candidate_revision.based_on_revision_number = current_revision_number
    and application.candidate_revision_number is null;

  source_catalogues := coalesce(source_catalogues, current_catalogues);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', translation_key.key,
        'namespace', split_part(translation_key.key, '.', 1),
        'published', jsonb_build_object(
          'is', current_catalogues #>> array['is', translation_key.key],
          'en', current_catalogues #>> array['en', translation_key.key]
        ),
        'draft', jsonb_build_object(
          'is', coalesce(draft_is.value, source_catalogues #>> array['is', translation_key.key]),
          'en', coalesce(draft_en.value, source_catalogues #>> array['en', translation_key.key])
        ),
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
    'sourceCandidate', source_candidate,
    'entries', entries,
    'revisions', revisions
  );
end;
$$;

revoke execute on function public.sync_interface_translation_inventory_from_source(jsonb, bigint, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.sync_interface_translation_inventory_from_source(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.sync_interface_translation_inventory_from_source(jsonb, text)
  to service_role;

revoke execute on function public.publish_interface_translation_drafts(bigint, bigint, text, bigint, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.restore_interface_translation_revision(bigint, bigint, text, bigint, text)
  from public, anon, authenticated, service_role;

revoke execute on function public.ready_interface_translation_drafts_for_source(bigint, bigint, text, bigint, text)
  from public;
grant execute on function public.ready_interface_translation_drafts_for_source(bigint, bigint, text, bigint, text)
  to anon, authenticated;

revoke execute on function public.get_ready_interface_translation_source(text, bigint, text)
  from public;
grant execute on function public.get_ready_interface_translation_source(text, bigint, text)
  to anon, authenticated;

revoke execute on function public.restore_interface_translation_revision_to_drafts(bigint, bigint, text, bigint, text)
  from public;
grant execute on function public.restore_interface_translation_revision_to_drafts(bigint, bigint, text, bigint, text)
  to anon, authenticated;

revoke execute on function public.mark_interface_translation_source_candidate_applied()
  from public, anon, authenticated;
grant execute on function public.mark_interface_translation_source_candidate_applied()
  to service_role;

revoke all on private.interface_translation_source_candidate
  from public, anon, authenticated, service_role;
revoke all on private.interface_translation_source_applications
  from public, anon, authenticated, service_role;

comment on table private.interface_translation_source_candidate is
  'Points to the latest immutable reviewed catalogue awaiting source import; never controls runtime copy.';
comment on function public.ready_interface_translation_drafts_for_source(bigint, bigint, text, bigint, text) is
  'Snapshots reviewed drafts for source import without changing the deployed JSON mirror.';
comment on function public.get_ready_interface_translation_source(text, bigint, text) is
  'Returns the latest ready candidate and its merge base through the signed private capability.';
comment on function public.restore_interface_translation_revision_to_drafts(bigint, bigint, text, bigint, text) is
  'Restores history into drafts without changing the deployed JSON mirror.';

commit;
