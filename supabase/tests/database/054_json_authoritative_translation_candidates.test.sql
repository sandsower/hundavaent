begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_table(
  'private',
  'interface_translation_source_candidate',
  'Reviewed source candidates use a pointer separate from the deployed mirror'
);
select has_table(
  'private',
  'interface_translation_source_applications',
  'Applied candidates retain immutable deployment provenance'
);
select has_function(
  'public',
  'sync_interface_translation_inventory_from_source',
  array['jsonb', 'text'],
  'Deployment publishes JSON without a database-authored baseline gate'
);
select has_function(
  'public',
  'ready_interface_translation_drafts_for_source',
  array['bigint', 'bigint', 'text', 'bigint', 'text'],
  'Review can make drafts ready for source without publishing them'
);
select has_function(
  'public',
  'get_ready_interface_translation_source',
  array['text', 'bigint', 'text'],
  'The authenticated import command can read the latest source candidate'
);
select has_function(
  'public',
  'restore_interface_translation_revision_to_drafts',
  array['bigint', 'bigint', 'text', 'bigint', 'text'],
  'History restoration creates drafts instead of changing live copy'
);
select has_function(
  'public',
  'mark_interface_translation_source_candidate_applied',
  array[]::text[],
  'Deployment records a candidate only after JSON contains its changes'
);

select public.configure_interface_translation_capability(
  'local-interface-translation-capability-secret-v1'
);

select *
from public.sync_interface_translation_inventory_from_source(
  '{"is":{"site.name":"Hundavænt","welcome":"Velkomin {name}"},"en":{"site.name":"Hundavænt","welcome":"Welcome {name}"}}'::jsonb,
  'json-authority-bootstrap'
);

create function public.test_json_authority_proof(canonical_message text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.hmac(
      canonical_message,
      'local-interface-translation-capability-secret-v1',
      'sha256'
    ),
    'hex'
  );
$$;

insert into private.interface_translation_drafts (key, locale, value)
values ('welcome', 'en', 'Hello {name}');

update private.interface_translation_publication
set draft_generation = 1
where singleton;

select lives_ok(
  format(
    $sql$
      select * from public.ready_interface_translation_drafts_for_source(
        %s,
        1,
        'ready-source-1',
        %s,
        %L
      )
    $sql$,
    (select revision_number from private.interface_translation_publication where singleton),
    extract(epoch from statement_timestamp())::bigint,
    public.test_json_authority_proof(
      'interface-translations-v3:ready_source:ready-source-1:' ||
      (extract(epoch from statement_timestamp())::bigint)::text || ':' ||
      (select revision_number from private.interface_translation_publication where singleton)::text ||
      ':1'
    )
  ),
  'Reviewing drafts creates a source candidate'
);

select is(
  (
    select revision.catalogues #>> '{en,welcome}'
    from private.interface_translation_publication as publication
    join private.interface_translation_revisions as revision
      on revision.revision_number = publication.revision_number
    where publication.singleton
  ),
  'Welcome {name}',
  'A source candidate does not change the deployed database mirror'
);

select is(
  (
    select revision.catalogues #>> '{en,welcome}'
    from private.interface_translation_source_candidate as candidate
    join private.interface_translation_revisions as revision
      on revision.revision_number = candidate.revision_number
    where candidate.singleton
  ),
  'Hello {name}',
  'The candidate contains the reviewed draft'
);

select is_empty(
  $$ select * from private.interface_translation_drafts $$,
  'Ready drafts leave the editable queue only after the immutable candidate exists'
);

select is(
  (
    select response.candidate #>> '{candidateCatalogues,en,welcome}'
    from public.get_ready_interface_translation_source(
      'read-source-1',
      extract(epoch from statement_timestamp())::bigint,
      public.test_json_authority_proof(
        'interface-translations-v3:read_source_candidate:read-source-1:' ||
        (extract(epoch from statement_timestamp())::bigint)::text
      )
    ) as response(candidate)
  ),
  'Hello {name}',
  'The signed import projection returns the candidate catalogue'
);

select is(
  (
    select entry -> 'draft' ->> 'en'
    from jsonb_array_elements(
      public.get_interface_translation_workspace(
        'read-workspace-after-ready',
        extract(epoch from statement_timestamp())::bigint,
        public.test_json_authority_proof(
          'interface-translations-v2:read_workspace:read-workspace-after-ready:' ||
          (extract(epoch from statement_timestamp())::bigint)::text
        )
      ) -> 'entries'
    ) as entries(entry)
    where entry ->> 'key' = 'welcome'
  ),
  'Hello {name}',
  'The workspace keeps the ready candidate as its next editing base after drafts clear'
);

insert into private.interface_translation_drafts (key, locale, value)
values ('site.name', 'is', 'Hundavænt Ísland');
update private.interface_translation_publication
set draft_generation = 2
where singleton;

select lives_ok(
  format(
    $sql$
      select * from public.ready_interface_translation_drafts_for_source(
        %s,
        2,
        'ready-source-2',
        %s,
        %L
      )
    $sql$,
    (select revision_number from private.interface_translation_publication where singleton),
    extract(epoch from statement_timestamp())::bigint,
    public.test_json_authority_proof(
      'interface-translations-v3:ready_source:ready-source-2:' ||
      (extract(epoch from statement_timestamp())::bigint)::text || ':' ||
      (select revision_number from private.interface_translation_publication where singleton)::text ||
      ':2'
    )
  ),
  'A later candidate accumulates the earlier ready values while adding new drafts'
);

select is(
  (
    select revision.catalogues #>> '{en,welcome}'
    from private.interface_translation_source_candidate as candidate
    join private.interface_translation_revisions as revision
      on revision.revision_number = candidate.revision_number
    where candidate.singleton
  ),
  'Hello {name}',
  'Superseding a ready candidate preserves its reviewed changes'
);

select *
from public.sync_interface_translation_inventory_from_source(
  '{"is":{"site.name":"Hundavænt Ísland","welcome":"Velkomin {name}"},"en":{"site.name":"Hundavænt","welcome":"Hello {name}"}}'::jsonb,
  'json-authority-deploy'
);

select lives_ok(
  $$ select public.mark_interface_translation_source_candidate_applied() $$,
  'Deployment marks the current candidate after publishing matching JSON'
);

select is(
  (
    select application.candidate_revision_number
    from private.interface_translation_source_applications as application
  ),
  (
    select candidate.revision_number
    from private.interface_translation_source_candidate as candidate
    where candidate.singleton
  ),
  'Applied provenance links the ready candidate to its deployed mirror revision'
);

select lives_ok(
  format(
    $sql$
      select * from public.restore_interface_translation_revision_to_drafts(
        %s,
        %s,
        'restore-source-1',
        %s,
        %L
      )
    $sql$,
    (select revision_number from private.interface_translation_revisions where request_id = 'json-authority-bootstrap'),
    (select revision_number from private.interface_translation_publication where singleton),
    extract(epoch from statement_timestamp())::bigint,
    public.test_json_authority_proof(
      'interface-translations-v3:restore_to_drafts:restore-source-1:' ||
      (extract(epoch from statement_timestamp())::bigint)::text || ':' ||
      (select revision_number from private.interface_translation_revisions where request_id = 'json-authority-bootstrap')::text || ':' ||
      (select revision_number from private.interface_translation_publication where singleton)::text
    )
  ),
  'Restoring history replaces the draft queue without moving deployed copy'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.publish_interface_translation_drafts(bigint,bigint,text,bigint,text)',
    'execute'
  )
  and has_function_privilege(
    'anon',
    'public.ready_interface_translation_drafts_for_source(bigint,bigint,text,bigint,text)',
    'execute'
  ),
  'Public callers can use proof-checked readiness but cannot invoke the retired live publisher'
);

select * from finish();

rollback;
