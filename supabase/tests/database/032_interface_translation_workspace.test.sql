begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_table(
  'private',
  'interface_translation_keys',
  'Interface translation keys have private deployment-managed persistence'
);
select has_table(
  'private',
  'interface_translation_drafts',
  'Shared interface translation drafts have private persistence'
);
select has_table(
  'private',
  'interface_translation_revisions',
  'Published interface translation revisions have private persistence'
);
select has_table(
  'private',
  'interface_translation_publication',
  'The current interface translation revision has one private pointer'
);
select has_table(
  'private',
  'interface_translation_capabilities',
  'The workspace capability remains behind the private schema boundary'
);

select has_function(
  'public',
  'get_published_interface_translations',
  array['text'],
  'The public runtime reads one locale snapshot'
);
select has_function(
  'public',
  'get_interface_translation_workspace',
  array['text', 'text'],
  'The editor reads one capability-checked workspace projection'
);
select has_function(
  'public',
  'get_interface_translation_revision',
  array['bigint', 'text', 'text'],
  'The editor can inspect one capability-checked historical revision'
);
select has_function(
  'public',
  'save_interface_translation_draft',
  array['text', 'text', 'text', 'bigint', 'bigint', 'text', 'text'],
  'The editor saves one optimistic per-locale draft'
);
select has_function(
  'public',
  'publish_interface_translation_drafts',
  array['bigint', 'text', 'text'],
  'The editor publishes every shared draft atomically'
);
select has_function(
  'public',
  'restore_interface_translation_revision',
  array['bigint', 'bigint', 'text', 'text'],
  'The editor restores history through a new forward revision'
);
select has_function(
  'public',
  'configure_interface_translation_capability',
  array['text'],
  'Deployment operations can rotate the workspace capability'
);
select has_function(
  'public',
  'sync_interface_translation_inventory',
  array['jsonb', 'text'],
  'Deployment operations synchronize the developer-owned key inventory'
);

select ok(
  has_function_privilege(
    'anon',
    'public.get_published_interface_translations(text)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.get_published_interface_translations(text)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.get_published_interface_translations(text)',
    'execute'
  ),
  'Public callers, but not the application service role, can read the safe live snapshot'
);

select ok(
  has_function_privilege(
    'anon',
    'public.save_interface_translation_draft(text,text,text,bigint,bigint,text,text)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.save_interface_translation_draft(text,text,text,bigint,bigint,text,text)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.save_interface_translation_draft(text,text,text,bigint,bigint,text,text)',
    'execute'
  ),
  'Proof-checked draft commands work with either public caller role and have no service bypass'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.configure_interface_translation_capability(text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.sync_interface_translation_inventory(jsonb,text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.configure_interface_translation_capability(text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.sync_interface_translation_inventory(jsonb,text)',
    'execute'
  ),
  'Only controlled deployment operations configure the capability and key inventory'
);

select ok(
  not has_table_privilege(
    'anon',
    'private.interface_translation_keys',
    'select,insert,update,delete'
  )
  and not has_table_privilege(
    'authenticated',
    'private.interface_translation_drafts',
    'select,insert,update,delete'
  )
  and not has_table_privilege(
    'service_role',
    'private.interface_translation_revisions',
    'select,insert,update,delete'
  )
  and not has_table_privilege(
    'service_role',
    'private.interface_translation_capabilities',
    'select,insert,update,delete'
  ),
  'No application role can bypass the reviewed translation RPC boundary through tables'
);

create function public.test_interface_translation_proof(
  requested_operation text,
  command_request_id text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.hmac(
      'interface-translations-v1:' || requested_operation || ':' || command_request_id,
      'local-interface-translation-capability-secret-v1',
      'sha256'
    ),
    'hex'
  );
$$;

grant execute on function public.test_interface_translation_proof(text, text)
  to anon, authenticated, service_role;

set local role service_role;

select lives_ok(
  $$
    select public.configure_interface_translation_capability(
      'local-interface-translation-capability-secret-v1'
    )
  $$,
  'The service role can provision a strong workspace capability'
);

select lives_ok(
  $$
    select *
    from public.sync_interface_translation_inventory(
      '{
        "is": {
          "greeting": "Halló {name}",
          "plain": "Óbreytt",
          "site.name": "Hundavænt"
        },
        "en": {
          "greeting": "Hello {name}",
          "plain": "Unchanged",
          "site.name": "Hundavænt"
        }
      }'::jsonb,
      'inventory-v1'
    )
  $$,
  'The first deployment inventory creates the initial published snapshot'
);

reset role;

select set_config(
  'test.initial_translation_revision',
  (select revision_number::text from private.interface_translation_publication where singleton),
  true
);

select is(
  (select count(*) from private.interface_translation_keys where active),
  3::bigint,
  'The initial inventory activates every supplied key exactly once'
);

set local role anon;

select is(
  (
    select messages ->> 'greeting'
    from public.get_published_interface_translations('en')
  ),
  'Hello {name}'::text,
  'Anonymous runtime reads the published English catalogue without seeing workspace state'
);

select throws_ok(
  $$select public.get_interface_translation_workspace('read-invalid', repeat('0', 64))$$,
  '42501',
  'Valid interface translation capability required',
  'A direct caller without a valid proof cannot inspect drafts or history'
);

select ok(
  (
    select workspace ?& array[
      'currentRevision',
      'publishedAt',
      'pendingCount',
      'entries',
      'revisions'
    ]
    from (
      select public.get_interface_translation_workspace(
        'read-initial',
        public.test_interface_translation_proof('read_workspace', 'read-initial')
      ) as workspace
    ) as projection
  ),
  'The workspace returns the fixed current, entry, pending, and revision shape'
);

select throws_ok(
  $$
    select *
    from public.save_interface_translation_draft(
      'greeting',
      'en',
      'Unsafe',
      current_setting('test.initial_translation_revision')::bigint,
      0,
      'save-invalid-proof',
      repeat('0', 64)
    )
  $$,
  '42501',
  'Valid interface translation capability required',
  'A direct anonymous caller cannot mutate a draft without the server capability'
);

select is(
  (
    select draft_version
    from public.save_interface_translation_draft(
      'greeting',
      'en',
      'Hi',
      current_setting('test.initial_translation_revision')::bigint,
      0,
      'save-placeholder-invalid',
      public.test_interface_translation_proof('save_draft', 'save-placeholder-invalid')
    )
  ),
  1::bigint,
  'An incomplete value can remain safely in a shared draft'
);

select throws_ok(
  $$
    select *
    from public.publish_interface_translation_drafts(
      current_setting('test.initial_translation_revision')::bigint,
      'publish-placeholder-invalid',
      public.test_interface_translation_proof('publish', 'publish-placeholder-invalid')
    )
  $$,
  '22023',
  'Interface translation placeholders must match the bundled contract',
  'Publishing rejects a draft that removes a required placeholder'
);

select is(
  (
    select messages ->> 'greeting'
    from public.get_published_interface_translations('en')
  ),
  'Hello {name}'::text,
  'A rejected publication leaves the public snapshot unchanged'
);

select is(
  (
    select draft_version
    from public.save_interface_translation_draft(
      'greeting',
      'en',
      'Hi {name}',
      current_setting('test.initial_translation_revision')::bigint,
      1,
      'save-placeholder-fixed',
      public.test_interface_translation_proof('save_draft', 'save-placeholder-fixed')
    )
  ),
  2::bigint,
  'A later autosave advances the optimistic draft version'
);

select throws_ok(
  $$
    select *
    from public.save_interface_translation_draft(
      'greeting',
      'en',
      'Out-of-order {name}',
      current_setting('test.initial_translation_revision')::bigint,
      0,
      'save-stale-draft',
      public.test_interface_translation_proof('save_draft', 'save-stale-draft')
    )
  $$,
  '40001',
  'Interface translation draft changed',
  'An out-of-order autosave cannot overwrite a newer shared draft'
);

select is(
  (
    select pending_count
    from public.save_interface_translation_draft(
      'greeting',
      'is',
      'Sæl {name}',
      current_setting('test.initial_translation_revision')::bigint,
      0,
      'save-icelandic',
      public.test_interface_translation_proof('save_draft', 'save-icelandic')
    )
  ),
  2::bigint,
  'Icelandic and English are equal first-class draft fields'
);

select is(
  (
    select draft_version
    from public.save_interface_translation_draft(
      'plain',
      'en',
      '',
      current_setting('test.initial_translation_revision')::bigint,
      0,
      'save-empty',
      public.test_interface_translation_proof('save_draft', 'save-empty')
    )
  ),
  1::bigint,
  'A missing value can be represented and reviewed as a draft'
);

select throws_ok(
  $$
    select *
    from public.publish_interface_translation_drafts(
      current_setting('test.initial_translation_revision')::bigint,
      'publish-empty',
      public.test_interface_translation_proof('publish', 'publish-empty')
    )
  $$,
  '22023',
  'Published interface translations must be non-empty',
  'Publishing rejects a missing translation value'
);

select is(
  (
    select draft_version
    from public.save_interface_translation_draft(
      'plain',
      'en',
      'Unchanged',
      current_setting('test.initial_translation_revision')::bigint,
      1,
      'revert-empty',
      public.test_interface_translation_proof('save_draft', 'revert-empty')
    )
  ),
  0::bigint,
  'Saving the published value removes that field from the draft batch'
);

select throws_ok(
  $$
    select *
    from public.publish_interface_translation_drafts(
      999999,
      'publish-stale',
      public.test_interface_translation_proof('publish', 'publish-stale')
    )
  $$,
  '40001',
  'Interface translation publication changed',
  'A stale editor cannot publish over a newer live revision'
);

select lives_ok(
  $$
    select *
    from public.publish_interface_translation_drafts(
      current_setting('test.initial_translation_revision')::bigint,
      'publish-v2',
      public.test_interface_translation_proof('publish', 'publish-v2')
    )
  $$,
  'A complete placeholder-safe batch publishes atomically'
);

reset role;

select set_config(
  'test.published_translation_revision',
  (select revision_number::text from private.interface_translation_publication where singleton),
  true
);

select is(
  (select count(*) from private.interface_translation_drafts),
  0::bigint,
  'Successful publication clears the complete shared draft batch'
);

select is(
  (
    select catalogues #>> '{en,greeting}'
    from private.interface_translation_revisions
    where revision_number = current_setting('test.published_translation_revision')::bigint
  ),
  'Hi {name}'::text,
  'The published revision contains the reviewed English value'
);

select is(
  (
    select catalogues #>> '{is,greeting}'
    from private.interface_translation_revisions
    where revision_number = current_setting('test.published_translation_revision')::bigint
  ),
  'Sæl {name}'::text,
  'The same atomic revision contains the reviewed Icelandic value'
);

set local role anon;

select is(
  (
    select revision_number
    from public.publish_interface_translation_drafts(
      current_setting('test.initial_translation_revision')::bigint,
      'publish-v2',
      public.test_interface_translation_proof('publish', 'publish-v2')
    )
  ),
  current_setting('test.published_translation_revision')::bigint,
  'Retrying a completed publish request is idempotent even with its original expectation'
);

select ok(
  (
    select revision ? 'catalogues' and revision ->> 'kind' = 'publish'
    from (
      select public.get_interface_translation_revision(
        current_setting('test.published_translation_revision')::bigint,
        'read-v2',
        public.test_interface_translation_proof('read_workspace', 'read-v2')
      ) as revision
    ) as projection
  ),
  'A proof-checked editor can inspect a complete immutable revision'
);

select is(
  (
    select draft_version
    from public.save_interface_translation_draft(
      'site.name',
      'en',
      'Hundavænt live',
      current_setting('test.published_translation_revision')::bigint,
      0,
      'save-before-forced-failure',
      public.test_interface_translation_proof('save_draft', 'save-before-forced-failure')
    )
  ),
  1::bigint,
  'A draft is ready for the forced atomicity failure proof'
);

reset role;

create function pg_temp.force_interface_translation_pointer_failure()
returns trigger
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = 'Forced translation pointer failure';
end;
$$;

create trigger interface_translation_contract_force_pointer_failure
before update on private.interface_translation_publication
for each row execute function pg_temp.force_interface_translation_pointer_failure();

set local role anon;

select throws_ok(
  $$
    select *
    from public.publish_interface_translation_drafts(
      current_setting('test.published_translation_revision')::bigint,
      'publish-forced-failure',
      public.test_interface_translation_proof('publish', 'publish-forced-failure')
    )
  $$,
  'P0001',
  'Forced translation pointer failure',
  'A failure after revision insertion aborts the whole publication transaction'
);

reset role;

select is(
  (
    select count(*)
    from private.interface_translation_revisions
    where request_id = 'publish-forced-failure'
  ),
  0::bigint,
  'A failed pointer switch leaves no orphan published revision'
);

select is(
  (select count(*) from private.interface_translation_drafts),
  1::bigint,
  'A failed publication preserves its draft for a safe retry'
);

drop trigger interface_translation_contract_force_pointer_failure
  on private.interface_translation_publication;

set local role anon;

select is(
  (
    select draft_version
    from public.save_interface_translation_draft(
      'site.name',
      'en',
      'Hundavænt',
      current_setting('test.published_translation_revision')::bigint,
      1,
      'revert-forced-failure-draft',
      public.test_interface_translation_proof('save_draft', 'revert-forced-failure-draft')
    )
  ),
  0::bigint,
  'The preserved failed draft can be explicitly reverted'
);

reset role;

set local role service_role;

select throws_ok(
  $$
    select *
    from public.sync_interface_translation_inventory(
      '{
        "is": {"bad": "Halló {name}"},
        "en": {"bad": "Hello"}
      }'::jsonb,
      'inventory-invalid-placeholders'
    )
  $$,
  '22023',
  'Bundled interface translation placeholders must match',
  'Deployment cannot establish incompatible bundled placeholder contracts'
);

select lives_ok(
  $$
    select *
    from public.sync_interface_translation_inventory(
      '{
        "is": {
          "greeting": "Halló {name}",
          "new.key": "Nýtt",
          "site.name": "Hundavænt"
        },
        "en": {
          "greeting": "Hello {name}",
          "new.key": "New",
          "site.name": "Hundavænt"
        }
      }'::jsonb,
      'inventory-v3'
    )
  $$,
  'A later deployment can add and retire developer-owned keys'
);

reset role;

select set_config(
  'test.inventory_translation_revision',
  (select revision_number::text from private.interface_translation_publication where singleton),
  true
);

select ok(
  (select active from private.interface_translation_keys where key = 'new.key')
  and not (select active from private.interface_translation_keys where key = 'plain'),
  'Inventory synchronization activates additions and retires removed keys'
);

select is(
  (
    select catalogues #>> '{en,greeting}'
    from private.interface_translation_revisions
    where revision_number = current_setting('test.inventory_translation_revision')::bigint
  ),
  'Hi {name}'::text,
  'Inventory synchronization preserves compatible direct-published copy'
);

set local role anon;

select is(
  (
    select draft_version
    from public.save_interface_translation_draft(
      'new.key',
      'en',
      'New draft',
      current_setting('test.inventory_translation_revision')::bigint,
      0,
      'save-before-restore',
      public.test_interface_translation_proof('save_draft', 'save-before-restore')
    )
  ),
  1::bigint,
  'A current-inventory draft can be saved before restore'
);

select throws_ok(
  $$
    select *
    from public.restore_interface_translation_revision(
      current_setting('test.initial_translation_revision')::bigint,
      current_setting('test.inventory_translation_revision')::bigint,
      'restore-with-drafts',
      public.test_interface_translation_proof('restore', 'restore-with-drafts')
    )
  $$,
  '55000',
  'Publish or revert interface translation drafts before restore',
  'Restore cannot silently discard pending shared work'
);

select is(
  (
    select draft_version
    from public.save_interface_translation_draft(
      'new.key',
      'en',
      'New',
      current_setting('test.inventory_translation_revision')::bigint,
      1,
      'revert-before-restore',
      public.test_interface_translation_proof('save_draft', 'revert-before-restore')
    )
  ),
  0::bigint,
  'The editor can deliberately clear work before restoring history'
);

select lives_ok(
  $$
    select *
    from public.restore_interface_translation_revision(
      current_setting('test.initial_translation_revision')::bigint,
      current_setting('test.inventory_translation_revision')::bigint,
      'restore-v1',
      public.test_interface_translation_proof('restore', 'restore-v1')
    )
  $$,
  'A historical snapshot restores through a new atomic publication'
);

reset role;

select set_config(
  'test.restored_translation_revision',
  (select revision_number::text from private.interface_translation_publication where singleton),
  true
);

select ok(
  current_setting('test.restored_translation_revision')::bigint
    > current_setting('test.inventory_translation_revision')::bigint
  and (
    select restored_from_revision_number
    from private.interface_translation_revisions
    where revision_number = current_setting('test.restored_translation_revision')::bigint
  ) = current_setting('test.initial_translation_revision')::bigint,
  'Restore appends a forward revision linked to its historical source'
);

select is(
  (
    select catalogues #>> '{en,greeting}'
    from private.interface_translation_revisions
    where revision_number = current_setting('test.restored_translation_revision')::bigint
  ),
  'Hello {name}'::text,
  'Restore recovers the historical value for a still-active key'
);

select is(
  (
    select catalogues #>> '{en,new.key}'
    from private.interface_translation_revisions
    where revision_number = current_setting('test.restored_translation_revision')::bigint
  ),
  'New'::text,
  'Restore preserves the current bundled value for a key added after the target revision'
);

select ok(
  not (
    select catalogues -> 'en' ? 'plain'
    from private.interface_translation_revisions
    where revision_number = current_setting('test.restored_translation_revision')::bigint
  ),
  'Restore does not resurrect a key retired by the developer inventory'
);

select throws_ok(
  $$
    update private.interface_translation_revisions
    set change_count = 0
    where revision_number = current_setting('test.initial_translation_revision')::bigint
  $$,
  '55000',
  'Interface translation revisions are append-only',
  'Published and historical snapshots cannot be rewritten'
);

set local role anon;

select throws_ok(
  $$select * from public.get_published_interface_translations('de')$$,
  '22023',
  'Supported interface translation locale required',
  'The public runtime rejects unsupported locale input instead of guessing'
);

select throws_ok(
  $$
    select *
    from public.restore_interface_translation_revision(
      current_setting('test.initial_translation_revision')::bigint,
      current_setting('test.restored_translation_revision')::bigint,
      'restore-invalid-proof',
      repeat('0', 64)
    )
  $$,
  '42501',
  'Valid interface translation capability required',
  'A direct caller cannot restore history without the server capability'
);

reset role;

select * from finish();

rollback;
