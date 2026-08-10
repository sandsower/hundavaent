begin;

create type private.interface_translation_access_level as enum (
  'translator',
  'translation_owner'
);

create table private.interface_translation_access (
  email text primary key,
  access_level private.interface_translation_access_level not null,
  granted_at timestamptz not null default statement_timestamp(),
  constraint interface_translation_access_email_check check (
    email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and length(email) <= 320
  )
);

insert into private.interface_translation_access (email, access_level)
values ('victor.val.mtz@gmail.com', 'translation_owner');

create table private.interface_translation_packages (
  id uuid primary key default extensions.gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete restrict,
  page_id text not null check (
    page_id ~ '^/[^[:space:]]*$' and length(page_id) <= 240
  ),
  context_path text not null check (
    context_path ~ '^/[^[:space:]]*$' and length(context_path) <= 1024
  ),
  base_revision_number bigint not null
    references private.interface_translation_revisions(revision_number) on delete restrict,
  status text not null default 'draft' check (
    status in (
      'draft',
      'submitted',
      'revision_requested',
      'approved',
      'exported',
      'discarded'
    )
  ),
  version bigint not null default 1 check (version > 0),
  review_note text check (review_note is null or length(review_note) <= 2000),
  reviewed_by uuid references auth.users(id) on delete restrict,
  candidate_revision_number bigint unique
    references private.interface_translation_revisions(revision_number) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  exported_at timestamptz,
  constraint interface_translation_package_review_check check (
    (status <> 'revision_requested' or nullif(btrim(review_note), '') is not null)
    and (status not in ('approved', 'exported') or candidate_revision_number is not null)
  )
);

create unique index interface_translation_one_editable_package_per_author_idx
  on private.interface_translation_packages (author_id)
  where status in ('draft', 'revision_requested');

create index interface_translation_review_queue_idx
  on private.interface_translation_packages (submitted_at, id)
  where status = 'submitted';

create table private.interface_translation_package_entries (
  package_id uuid not null
    references private.interface_translation_packages(id) on delete cascade,
  key text not null
    references private.interface_translation_keys(key) on delete restrict,
  baseline_is text not null check (length(baseline_is) <= 10000),
  baseline_en text not null check (length(baseline_en) <= 10000),
  draft_is text not null check (length(draft_is) <= 10000),
  draft_en text not null check (length(draft_en) <= 10000),
  version bigint not null default 1 check (version > 0),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (package_id, key)
);

create index interface_translation_package_entries_key_idx
  on private.interface_translation_package_entries (key, updated_at desc);

create table private.interface_translation_package_events (
  id bigint generated always as identity primary key,
  package_id uuid not null
    references private.interface_translation_packages(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (
    action in ('created', 'submitted', 'returned', 'approved', 'discarded')
  ),
  request_id text not null check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  note text check (note is null or length(note) <= 2000),
  occurred_at timestamptz not null default statement_timestamp(),
  unique (actor_id, request_id)
);

alter table private.interface_translation_access enable row level security;
alter table private.interface_translation_packages enable row level security;
alter table private.interface_translation_package_entries enable row level security;
alter table private.interface_translation_package_events enable row level security;

create function private.current_interface_translation_actor(required_owner boolean default false)
returns table (
  user_id uuid,
  email text,
  access_level private.interface_translation_access_level
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  return query
  select auth_user.id, lower(auth_user.email), access.access_level
  from auth.users as auth_user
  join private.interface_translation_access as access
    on access.email = lower(auth_user.email)
  where auth_user.id = actor_id
    and auth_user.email_confirmed_at is not null
    and (not required_owner or access.access_level = 'translation_owner');

  if not found then
    raise exception using
      errcode = '42501',
      message = case
        when required_owner then 'Interface translation owner access required'
        else 'Interface translation access required'
      end;
  end if;
end;
$$;

create function private.validate_interface_translation_package_request_id(request_id text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if request_id is null or request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode = '22023', message = 'Valid request identifier required';
  end if;
end;
$$;

create function private.interface_translation_package_projection(requested_package_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', package.id,
    'pageId', package.page_id,
    'contextPath', package.context_path,
    'baseRevision', package.base_revision_number,
    'status', package.status,
    'version', package.version,
    'reviewNote', package.review_note,
    'createdAt', package.created_at,
    'updatedAt', package.updated_at,
    'submittedAt', package.submitted_at,
    'reviewedAt', package.reviewed_at,
    'approvedAt', package.approved_at,
    'exportedAt', package.exported_at,
    'candidateRevision', package.candidate_revision_number,
    'author', jsonb_build_object(
      'id', package.author_id,
      'label', coalesce(author.email, package.author_id::text)
    ),
    'reviewer', case
      when package.reviewed_by is null then null
      else jsonb_build_object(
        'id', package.reviewed_by,
        'label', coalesce(reviewer.email, package.reviewed_by::text)
      )
    end,
    'entries', coalesce(entries.value, '[]'::jsonb)
  )
  from private.interface_translation_packages as package
  join auth.users as author on author.id = package.author_id
  left join auth.users as reviewer on reviewer.id = package.reviewed_by
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'key', entry.key,
        'baseline', jsonb_build_object('is', entry.baseline_is, 'en', entry.baseline_en),
        'draft', jsonb_build_object('is', entry.draft_is, 'en', entry.draft_en),
        'version', entry.version,
        'changedBy', coalesce(editor.email, entry.updated_by::text),
        'changedAt', entry.updated_at,
        'complete', nullif(btrim(entry.draft_is), '') is not null
          and nullif(btrim(entry.draft_en), '') is not null
          and private.interface_translation_placeholders(entry.draft_is)
            = private.interface_translation_placeholders(entry.baseline_is)
          and private.interface_translation_placeholders(entry.draft_en)
            = private.interface_translation_placeholders(entry.baseline_en)
      ) order by entry.key
    ) as value
    from private.interface_translation_package_entries as entry
    join auth.users as editor on editor.id = entry.updated_by
    where entry.package_id = package.id
  ) as entries on true
  where package.id = requested_package_id;
$$;

create function public.get_my_interface_translation_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'role', access.access_level::text,
    'canTranslate', true,
    'canReview', access.access_level = 'translation_owner',
    'actor', jsonb_build_object('id', access.user_id, 'label', access.email)
  )
  from auth.users as auth_user
  join private.interface_translation_access as allowlist
    on allowlist.email = lower(auth_user.email)
  cross join lateral (
    select auth_user.id as user_id,
      lower(auth_user.email) as email,
      allowlist.access_level
  ) as access
  where auth_user.id = auth.uid()
    and auth_user.email_confirmed_at is not null;
$$;

create function public.get_my_interface_translation_package(requested_package_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor record;
  package_record private.interface_translation_packages%rowtype;
begin
  select * into actor from private.current_interface_translation_actor(false);
  select * into package_record
  from private.interface_translation_packages as package
  where package.id = requested_package_id;

  if not found then return null; end if;
  if package_record.author_id <> actor.user_id
    and (
      actor.access_level <> 'translation_owner'
      or package_record.status not in ('submitted', 'approved', 'exported')
    ) then
    raise exception using errcode = '42501', message = 'Translation package access denied';
  end if;

  return private.interface_translation_package_projection(requested_package_id);
end;
$$;

create function public.get_my_interface_translation_workspace(requested_page_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  access jsonb;
  actor record;
  active_package_id uuid;
  current_revision bigint;
  approved_history jsonb;
begin
  if requested_page_id is null
    or requested_page_id !~ '^/[^[:space:]]*$'
    or length(requested_page_id) > 240 then
    raise exception using errcode = '22023', message = 'Valid translation page identifier required';
  end if;

  select * into actor from private.current_interface_translation_actor(false);
  access := public.get_my_interface_translation_access();

  select publication.revision_number into current_revision
  from private.interface_translation_publication as publication
  where publication.singleton;

  select package.id into active_package_id
  from private.interface_translation_packages as package
  where package.author_id = actor.user_id
    and package.status in ('draft', 'revision_requested');

  select coalesce(jsonb_agg(history.value order by history.key), '[]'::jsonb)
  into approved_history
  from (
    select distinct on (entry.key)
      entry.key,
      jsonb_build_object(
        'key', entry.key,
        'changedBy', coalesce(author.email, package.author_id::text),
        'changedAt', entry.updated_at,
        'approvedBy', coalesce(reviewer.email, package.reviewed_by::text),
        'approvedAt', package.approved_at,
        'exportedAt', package.exported_at,
        'complete', true
      ) as value
    from private.interface_translation_package_entries as entry
    join private.interface_translation_packages as package on package.id = entry.package_id
    join auth.users as author on author.id = package.author_id
    left join auth.users as reviewer on reviewer.id = package.reviewed_by
    where package.status in ('approved', 'exported')
    order by entry.key, package.approved_at desc nulls last
  ) as history;

  return jsonb_build_object(
    'access', access,
    'pageId', requested_page_id,
    'currentRevision', current_revision,
    'activePackage', case
      when active_package_id is null then null
      else private.interface_translation_package_projection(active_package_id)
    end,
    'approvedHistory', approved_history
  );
end;
$$;

create function public.start_interface_translation_package(
  requested_page_id text,
  requested_context_path text,
  command_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor record;
  current_revision bigint;
  existing_package_id uuid;
  created_package_id uuid;
begin
  perform private.validate_interface_translation_package_request_id(command_request_id);
  if requested_page_id is null
    or requested_page_id !~ '^/[^[:space:]]*$'
    or length(requested_page_id) > 240 then
    raise exception using errcode = '22023', message = 'Valid translation page identifier required';
  end if;
  if requested_context_path is null
    or requested_context_path !~ '^/[^[:space:]]*$'
    or length(requested_context_path) > 1024 then
    raise exception using errcode = '22023', message = 'Valid local context path required';
  end if;

  select * into actor from private.current_interface_translation_actor(false);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('interface-translations:' || actor.user_id::text, 0)
  );

  select event.package_id into existing_package_id
  from private.interface_translation_package_events as event
  where event.actor_id = actor.user_id and event.request_id = command_request_id;
  if found then return private.interface_translation_package_projection(existing_package_id); end if;

  select package.id into existing_package_id
  from private.interface_translation_packages as package
  where package.author_id = actor.user_id
    and package.status in ('draft', 'revision_requested')
  for update;

  if existing_package_id is not null then
    if exists (
      select 1 from private.interface_translation_packages
      where id = existing_package_id and page_id = requested_page_id
    ) then
      return private.interface_translation_package_projection(existing_package_id);
    end if;
    raise exception using
      errcode = '55000',
      message = 'Finish the current page draft before starting another';
  end if;

  select publication.revision_number into current_revision
  from private.interface_translation_publication as publication
  where publication.singleton;
  if current_revision is null then
    raise exception using errcode = '55000', message = 'Interface translation inventory unavailable';
  end if;

  insert into private.interface_translation_packages (
    author_id,
    page_id,
    context_path,
    base_revision_number
  ) values (
    actor.user_id,
    requested_page_id,
    requested_context_path,
    current_revision
  ) returning id into created_package_id;

  insert into private.interface_translation_package_events (
    package_id,
    actor_id,
    action,
    request_id
  ) values (
    created_package_id,
    actor.user_id,
    'created',
    command_request_id
  );

  return private.interface_translation_package_projection(created_package_id);
end;
$$;

create function public.save_interface_translation_package_entry(
  requested_package_id uuid,
  requested_key text,
  requested_value_is text,
  requested_value_en text,
  expected_entry_version bigint,
  command_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor record;
  package_record private.interface_translation_packages%rowtype;
  baseline_is text;
  baseline_en text;
  current_entry_version bigint;
  next_entry_version bigint;
  next_package_version bigint;
begin
  perform private.validate_interface_translation_package_request_id(command_request_id);
  if requested_value_is is null or requested_value_en is null
    or length(requested_value_is) > 10000 or length(requested_value_en) > 10000
    or expected_entry_version is null or expected_entry_version < 0 then
    raise exception using errcode = '22023', message = 'Valid bilingual translation draft required';
  end if;

  select * into actor from private.current_interface_translation_actor(false);
  select * into package_record
  from private.interface_translation_packages as package
  where package.id = requested_package_id
  for update;

  if not found or package_record.author_id <> actor.user_id then
    raise exception using errcode = '42501', message = 'Translation package access denied';
  end if;
  if package_record.status not in ('draft', 'revision_requested') then
    raise exception using
      errcode = '55000',
      message = 'Only an editable translation package can be changed';
  end if;

  select
    revision.catalogues #>> array['is', requested_key],
    revision.catalogues #>> array['en', requested_key]
  into baseline_is, baseline_en
  from private.interface_translation_revisions as revision
  join private.interface_translation_keys as translation_key
    on translation_key.key = requested_key and translation_key.active
  where revision.revision_number = package_record.base_revision_number;

  if baseline_is is null or baseline_en is null then
    raise exception using errcode = '22023', message = 'Active interface translation key required';
  end if;

  select entry.version into current_entry_version
  from private.interface_translation_package_entries as entry
  where entry.package_id = requested_package_id and entry.key = requested_key
  for update;
  current_entry_version := coalesce(current_entry_version, 0);

  if current_entry_version <> expected_entry_version then
    raise exception using errcode = '40001', message = 'Translation package entry changed';
  end if;

  if requested_value_is = baseline_is and requested_value_en = baseline_en then
    delete from private.interface_translation_package_entries
    where package_id = requested_package_id and key = requested_key;
    next_entry_version := 0;
  else
    insert into private.interface_translation_package_entries (
      package_id,
      key,
      baseline_is,
      baseline_en,
      draft_is,
      draft_en,
      version,
      updated_by,
      updated_at
    ) values (
      requested_package_id,
      requested_key,
      baseline_is,
      baseline_en,
      requested_value_is,
      requested_value_en,
      current_entry_version + 1,
      actor.user_id,
      statement_timestamp()
    )
    on conflict (package_id, key) do update set
      draft_is = excluded.draft_is,
      draft_en = excluded.draft_en,
      version = excluded.version,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
    returning version into next_entry_version;
  end if;

  update private.interface_translation_packages as package
  set
    version = package.version + 1,
    updated_at = statement_timestamp(),
    review_note = case when package.status = 'revision_requested' then package.review_note else null end
  where package.id = requested_package_id
  returning version into next_package_version;

  return jsonb_build_object(
    'packageId', requested_package_id,
    'key', requested_key,
    'entryVersion', next_entry_version,
    'packageVersion', next_package_version,
    'changed', next_entry_version > 0,
    'changedBy', actor.email,
    'changedAt', statement_timestamp()
  );
end;
$$;

create function public.submit_interface_translation_package(
  requested_package_id uuid,
  expected_package_version bigint,
  command_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor record;
  package_record private.interface_translation_packages%rowtype;
  replayed_package_id uuid;
begin
  perform private.validate_interface_translation_package_request_id(command_request_id);
  select * into actor from private.current_interface_translation_actor(false);

  select event.package_id
  into replayed_package_id
  from private.interface_translation_package_events as event
  where event.actor_id = actor.user_id and event.request_id = command_request_id;
  if found then
    if replayed_package_id <> requested_package_id then
      raise exception using
        errcode = '22023',
        message = 'Request identifier belongs to a different translation package';
    end if;
    return private.interface_translation_package_projection(replayed_package_id);
  end if;

  select * into package_record
  from private.interface_translation_packages as package
  where package.id = requested_package_id
  for update;

  if not found or package_record.author_id <> actor.user_id then
    raise exception using errcode = '42501', message = 'Translation package access denied';
  end if;
  if package_record.status not in ('draft', 'revision_requested') then
    raise exception using errcode = '55000', message = 'Editable translation package required';
  end if;
  if package_record.version <> expected_package_version then
    raise exception using errcode = '40001', message = 'Translation package changed';
  end if;
  if package_record.base_revision_number is distinct from (
    select revision_number from private.interface_translation_publication where singleton
  ) then
    raise exception using errcode = '40001', message = 'Interface translation deployment changed';
  end if;
  if not exists (
    select 1 from private.interface_translation_package_entries
    where package_id = requested_package_id
  ) then
    raise exception using errcode = '22023', message = 'Translation package changes required';
  end if;
  if exists (
    select 1
    from private.interface_translation_package_entries as entry
    where entry.package_id = requested_package_id
      and (
        nullif(btrim(entry.draft_is), '') is null
        or nullif(btrim(entry.draft_en), '') is null
        or private.interface_translation_placeholders(entry.draft_is)
          <> private.interface_translation_placeholders(entry.baseline_is)
        or private.interface_translation_placeholders(entry.draft_en)
          <> private.interface_translation_placeholders(entry.baseline_en)
      )
  ) then
    raise exception using errcode = '22023', message = 'Complete valid bilingual translations required';
  end if;

  update private.interface_translation_packages as package
  set
    status = 'submitted',
    version = package.version + 1,
    submitted_at = statement_timestamp(),
    updated_at = statement_timestamp(),
    reviewed_by = null,
    reviewed_at = null,
    review_note = null
  where package.id = requested_package_id;

  insert into private.interface_translation_package_events (
    package_id,
    actor_id,
    action,
    request_id
  ) values (
    requested_package_id,
    actor.user_id,
    'submitted',
    command_request_id
  );

  return private.interface_translation_package_projection(requested_package_id);
end;
$$;

create function public.list_interface_translation_review_packages()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor record;
  result jsonb;
begin
  select * into actor from private.current_interface_translation_actor(true);
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', package.id,
        'pageId', package.page_id,
        'contextPath', package.context_path,
        'status', package.status,
        'version', package.version,
        'submittedAt', package.submitted_at,
        'author', coalesce(author.email, package.author_id::text),
        'changeCount', (
          select count(*)
          from private.interface_translation_package_entries as entry
          where entry.package_id = package.id
        )
      ) order by package.submitted_at, package.id
    ),
    '[]'::jsonb
  ) into result
  from private.interface_translation_packages as package
  join auth.users as author on author.id = package.author_id
  where package.status = 'submitted';
  return result;
end;
$$;

create function public.review_interface_translation_package(
  requested_package_id uuid,
  requested_decision text,
  requested_note text,
  expected_package_version bigint,
  command_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor record;
  package_record private.interface_translation_packages%rowtype;
  current_catalogues jsonb;
  current_revision bigint;
  next_catalogues jsonb;
  entry record;
  created_revision bigint;
  created_change_count integer;
  replayed_package_id uuid;
begin
  perform private.validate_interface_translation_package_request_id(command_request_id);
  if requested_decision not in ('return', 'approve') then
    raise exception using errcode = '22023', message = 'Valid package review decision required';
  end if;
  if requested_decision = 'return'
    and nullif(btrim(requested_note), '') is null then
    raise exception using errcode = '22023', message = 'A return note is required';
  end if;
  if requested_note is not null and length(requested_note) > 2000 then
    raise exception using errcode = '22023', message = 'Return note is too long';
  end if;

  select * into actor from private.current_interface_translation_actor(true);
  select event.package_id
  into replayed_package_id
  from private.interface_translation_package_events as event
  where event.actor_id = actor.user_id and event.request_id = command_request_id;
  if found then
    if replayed_package_id <> requested_package_id then
      raise exception using
        errcode = '22023',
        message = 'Request identifier belongs to a different translation package';
    end if;
    return private.interface_translation_package_projection(replayed_package_id);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('interface-translations', 0)
  );
  select * into package_record
  from private.interface_translation_packages as package
  where package.id = requested_package_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Translation package required';
  end if;
  if package_record.status <> 'submitted' then
    raise exception using errcode = '55000', message = 'Submitted translation package required';
  end if;
  if package_record.version <> expected_package_version then
    raise exception using errcode = '40001', message = 'Translation package changed';
  end if;

  if requested_decision = 'return' then
    update private.interface_translation_packages as package
    set
      status = 'revision_requested',
      version = package.version + 1,
      review_note = btrim(requested_note),
      reviewed_by = actor.user_id,
      reviewed_at = statement_timestamp(),
      updated_at = statement_timestamp()
    where package.id = requested_package_id;

    insert into private.interface_translation_package_events (
      package_id,
      actor_id,
      action,
      request_id,
      note
    ) values (
      requested_package_id,
      actor.user_id,
      'returned',
      command_request_id,
      btrim(requested_note)
    );
    return private.interface_translation_package_projection(requested_package_id);
  end if;

  select publication.revision_number, revision.catalogues
  into current_revision, current_catalogues
  from private.interface_translation_publication as publication
  join private.interface_translation_revisions as revision
    on revision.revision_number = publication.revision_number
  where publication.singleton
  for update of publication;

  if current_revision is distinct from package_record.base_revision_number then
    raise exception using errcode = '40001', message = 'Interface translation deployment changed';
  end if;
  if exists (
    select 1
    from private.interface_translation_source_candidate as candidate
    left join private.interface_translation_source_applications as application
      on application.candidate_revision_number = candidate.revision_number
    where candidate.singleton and application.candidate_revision_number is null
  ) then
    raise exception using
      errcode = '55000',
      message = 'Export the approved translation package before approving another';
  end if;

  next_catalogues := current_catalogues;
  for entry in
    select *
    from private.interface_translation_package_entries
    where package_id = requested_package_id
    order by key
  loop
    next_catalogues := jsonb_set(
      jsonb_set(next_catalogues, array['is', entry.key], to_jsonb(entry.draft_is), false),
      array['en', entry.key],
      to_jsonb(entry.draft_en),
      false
    );
  end loop;

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
    current_revision,
    created_change_count
  ) returning revision_number into created_revision;

  insert into private.interface_translation_source_candidate (
    singleton,
    revision_number,
    updated_at
  ) values (
    true,
    created_revision,
    statement_timestamp()
  )
  on conflict (singleton) do update set
    revision_number = excluded.revision_number,
    updated_at = excluded.updated_at;

  update private.interface_translation_packages as package
  set
    status = 'approved',
    version = package.version + 1,
    review_note = null,
    reviewed_by = actor.user_id,
    reviewed_at = statement_timestamp(),
    approved_at = statement_timestamp(),
    updated_at = statement_timestamp(),
    candidate_revision_number = created_revision
  where package.id = requested_package_id;

  insert into private.interface_translation_package_events (
    package_id,
    actor_id,
    action,
    request_id
  ) values (
    requested_package_id,
    actor.user_id,
    'approved',
    command_request_id
  );

  return private.interface_translation_package_projection(requested_package_id);
end;
$$;

create function public.discard_interface_translation_package(
  requested_package_id uuid,
  expected_package_version bigint,
  command_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor record;
  package_record private.interface_translation_packages%rowtype;
begin
  perform private.validate_interface_translation_package_request_id(command_request_id);
  select * into actor from private.current_interface_translation_actor(false);
  select * into package_record
  from private.interface_translation_packages as package
  where package.id = requested_package_id
  for update;
  if not found or package_record.author_id <> actor.user_id then
    raise exception using errcode = '42501', message = 'Translation package access denied';
  end if;
  if package_record.status not in ('draft', 'revision_requested') then
    raise exception using errcode = '55000', message = 'Editable translation package required';
  end if;
  if package_record.version <> expected_package_version then
    raise exception using errcode = '40001', message = 'Translation package changed';
  end if;

  update private.interface_translation_packages as package
  set status = 'discarded', version = package.version + 1, updated_at = statement_timestamp()
  where package.id = requested_package_id;
  insert into private.interface_translation_package_events (
    package_id,
    actor_id,
    action,
    request_id
  ) values (
    requested_package_id,
    actor.user_id,
    'discarded',
    command_request_id
  );
  return private.interface_translation_package_projection(requested_package_id);
end;
$$;

create function private.mark_interface_translation_package_exported()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update private.interface_translation_packages as package
  set
    status = 'exported',
    version = package.version + 1,
    exported_at = new.applied_at,
    updated_at = new.applied_at
  where package.candidate_revision_number = new.candidate_revision_number
    and package.status = 'approved';
  return new;
end;
$$;

create trigger interface_translation_source_application_marks_package_exported
after insert or update on private.interface_translation_source_applications
for each row execute function private.mark_interface_translation_package_exported();

revoke all on private.interface_translation_access
  from public, anon, authenticated, service_role;
revoke all on private.interface_translation_packages
  from public, anon, authenticated, service_role;
revoke all on private.interface_translation_package_entries
  from public, anon, authenticated, service_role;
revoke all on private.interface_translation_package_events
  from public, anon, authenticated, service_role;

revoke execute on function private.current_interface_translation_actor(boolean)
  from public, anon, authenticated, service_role;
revoke execute on function private.validate_interface_translation_package_request_id(text)
  from public, anon, authenticated, service_role;
revoke execute on function private.interface_translation_package_projection(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.mark_interface_translation_package_exported()
  from public, anon, authenticated, service_role;

revoke execute on function public.get_my_interface_translation_access()
  from public, anon, service_role;
revoke execute on function public.get_my_interface_translation_package(uuid)
  from public, anon, service_role;
revoke execute on function public.get_my_interface_translation_workspace(text)
  from public, anon, service_role;
revoke execute on function public.start_interface_translation_package(text, text, text)
  from public, anon, service_role;
revoke execute on function public.save_interface_translation_package_entry(
  uuid, text, text, text, bigint, text
) from public, anon, service_role;
revoke execute on function public.submit_interface_translation_package(uuid, bigint, text)
  from public, anon, service_role;
revoke execute on function public.list_interface_translation_review_packages()
  from public, anon, service_role;
revoke execute on function public.review_interface_translation_package(
  uuid, text, text, bigint, text
) from public, anon, service_role;
revoke execute on function public.discard_interface_translation_package(uuid, bigint, text)
  from public, anon, service_role;

grant execute on function public.get_my_interface_translation_access()
  to authenticated;
grant execute on function public.get_my_interface_translation_package(uuid)
  to authenticated;
grant execute on function public.get_my_interface_translation_workspace(text)
  to authenticated;
grant execute on function public.start_interface_translation_package(text, text, text)
  to authenticated;
grant execute on function public.save_interface_translation_package_entry(
  uuid, text, text, text, bigint, text
) to authenticated;
grant execute on function public.submit_interface_translation_package(uuid, bigint, text)
  to authenticated;
grant execute on function public.list_interface_translation_review_packages()
  to authenticated;
grant execute on function public.review_interface_translation_package(
  uuid, text, text, bigint, text
) to authenticated;
grant execute on function public.discard_interface_translation_package(uuid, bigint, text)
  to authenticated;

comment on table private.interface_translation_access is
  'Server-side allowlist for trusted interface Translators and Translation Owners.';
comment on table private.interface_translation_packages is
  'Private page-level interface translation change sets reviewed and exported as a whole.';
comment on table private.interface_translation_package_entries is
  'Bilingual bundle-key changes owned by one private page package.';
comment on table private.interface_translation_package_events is
  'Compact append-only lifecycle audit for package creation, submission, return, approval, and discard.';
comment on function public.review_interface_translation_package(uuid, text, text, bigint, text) is
  'Returns a complete package for revision or approves it into the non-public JSON source candidate.';

commit;
