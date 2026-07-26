begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_function(
  'public',
  'sync_interface_translation_inventory_from_source',
  array['jsonb', 'bigint', 'text'],
  'Deployment can publish the reviewed JSON catalogue with a workspace revision guard'
);

select lives_ok(
  $$
    select *
    from public.sync_interface_translation_inventory_from_source(
      '{"is":{"site.name":"Hundavænt","welcome":"Velkomin {name}"},"en":{"site.name":"Hundavænt","welcome":"Welcome {name}"}}'::jsonb,
      28,
      'json-source-bootstrap'
    )
  $$,
  'The source-owned inventory can bootstrap an empty publication'
);

select is(
  (
    select revision.catalogues
    from private.interface_translation_publication as publication
    join private.interface_translation_revisions as revision
      on revision.revision_number = publication.revision_number
    where publication.singleton
  ),
  '{"is":{"site.name":"Hundavænt","welcome":"Velkomin {name}"},"en":{"site.name":"Hundavænt","welcome":"Welcome {name}"}}'::jsonb,
  'Bootstrap publishes the exact JSON catalogue'
);

insert into private.interface_translation_revisions (
  request_id,
  kind,
  catalogues,
  change_count
)
values (
  'workspace-publication',
  'publish',
  '{"is":{"site.name":"Hundavænt","welcome":"Sæl {name}"},"en":{"site.name":"Hundavænt","welcome":"Hello {name}"}}'::jsonb,
  1
);

update private.interface_translation_publication
set revision_number = (
  select revision_number
  from private.interface_translation_revisions
  where request_id = 'workspace-publication'
),
updated_at = statement_timestamp()
where singleton;

select throws_ok(
  $$
    select *
    from public.sync_interface_translation_inventory_from_source(
      '{"is":{"site.name":"Hundavænt","welcome":"Velkomin aftur {name}"},"en":{"site.name":"Hundavænt","welcome":"Welcome back {name}"}}'::jsonb,
      1,
      'stale-json-source'
    )
  $$,
  '40001',
  'Published interface translations changed after JSON synchronization',
  'A newer workspace publication blocks a stale JSON deployment'
);

select lives_ok(
  format(
    $sql$
      select *
      from public.sync_interface_translation_inventory_from_source(
        '{"is":{"site.name":"Hundavænt","welcome":"Velkomin aftur {name}"},"en":{"site.name":"Hundavænt","welcome":"Welcome back {name}"}}'::jsonb,
        %s,
        'current-json-source'
      )
    $sql$,
    (
      select revision_number
      from private.interface_translation_revisions
      where request_id = 'workspace-publication'
    )
  ),
  'A deployment synchronized from the current workspace revision can publish JSON'
);

select is(
  (
    select revision.kind
    from private.interface_translation_publication as publication
    join private.interface_translation_revisions as revision
      on revision.revision_number = publication.revision_number
    where publication.singleton
  ),
  'inventory_sync',
  'A guarded JSON deployment restores source-owned publication provenance'
);

select is(
  (
    select revision.catalogues
    from private.interface_translation_publication as publication
    join private.interface_translation_revisions as revision
      on revision.revision_number = publication.revision_number
    where publication.singleton
  ),
  '{"is":{"site.name":"Hundavænt","welcome":"Velkomin aftur {name}"},"en":{"site.name":"Hundavænt","welcome":"Welcome back {name}"}}'::jsonb,
  'A guarded deployment publishes the exact JSON values instead of preserving workspace drift'
);

select throws_ok(
  $$
    select * from public.sync_interface_translation_inventory_from_source(
      '{"is":{"site.name":"Hundavænt annað","welcome":"Velkomin aftur {name}"},"en":{"site.name":"Hundavænt other","welcome":"Welcome back {name}"}}'::jsonb,
      2,
      'current-json-source'
    )
  $$,
  '22023',
  'Interface translation request ID already used for different catalogues',
  'A request ID cannot be replayed with different source catalogues'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.sync_interface_translation_inventory_from_source(jsonb,bigint,text)',
    'EXECUTE'
  ),
  'Anonymous clients cannot publish the source inventory'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.sync_interface_translation_inventory_from_source(jsonb,bigint,text)',
    'EXECUTE'
  ),
  'The deployment capability can publish the source inventory'
);

select * from finish();

rollback;
