begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

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
  array['text', 'bigint', 'text'],
  'The editor reads one capability-checked workspace projection'
);
select has_function(
  'public',
  'get_interface_translation_revision',
  array['bigint', 'text', 'bigint', 'text'],
  'The editor can inspect one capability-checked historical revision'
);
select has_function(
  'public',
  'save_interface_translation_draft',
  array['text', 'text', 'text', 'bigint', 'bigint', 'text', 'bigint', 'text'],
  'The editor saves one optimistic per-locale draft'
);
select has_function(
  'public',
  'publish_interface_translation_drafts',
  array['bigint', 'bigint', 'text', 'bigint', 'text'],
  'The editor publishes every shared draft atomically'
);
select has_function(
  'public',
  'restore_interface_translation_revision',
  array['bigint', 'bigint', 'text', 'bigint', 'text'],
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
  'retire_previous_interface_translation_capability',
  array['text'],
  'Deployment operations can retire the overlap after a healthy release'
);
select has_function(
  'public',
  'sync_interface_translation_inventory',
  array['jsonb', 'text'],
  'Deployment operations synchronize the developer-owned key inventory'
);

select is(
  private.interface_translation_change_count(
    '{"is":{"kept":"Same","removed":"Old","updated":"Before"},"en":{"kept":"Same","removed":"Old","updated":"Before"}}'::jsonb,
    '{"is":{"added":"New","kept":"Same","updated":"After"},"en":{"added":"New","kept":"Same","updated":"After"}}'::jsonb
  ),
  3,
  'Change counting handles additions, removals, and bilingual edits once per key'
);

create temporary table test_interface_translation_catalogues (
  previous_catalogues jsonb not null,
  next_catalogues jsonb not null
) on commit drop;

insert into test_interface_translation_catalogues (
  previous_catalogues,
  next_catalogues
)
select
  catalogue,
  jsonb_set(
    catalogue,
    array['en', 'key.2500'],
    to_jsonb('Changed'::text),
    false
  )
from (
  select jsonb_build_object(
    'is', jsonb_object_agg(key_name, to_jsonb(value) order by key_name),
    'en', jsonb_object_agg(key_name, to_jsonb(value) order by key_name)
  ) as catalogue
  from (
    select
      'key.' || lpad(series_value::text, 4, '0') as key_name,
      repeat('x', 256) as value
    from generate_series(1, 5000) as series(series_value)
  ) as catalogue_entries
) as large_catalogue;

set local statement_timeout = '2s';

select is(
  (
    select private.interface_translation_change_count(
      previous_catalogues,
      next_catalogues
    )
    from test_interface_translation_catalogues
  ),
  1,
  'Large catalogue change counting stays within the publication timeout budget'
);

set local statement_timeout = 0;

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
    'public.save_interface_translation_draft(text,text,text,bigint,bigint,text,bigint,text)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.save_interface_translation_draft(text,text,text,bigint,bigint,text,bigint,text)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.save_interface_translation_draft(text,text,text,bigint,bigint,text,bigint,text)',
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
    'public.retire_previous_interface_translation_capability(text)',
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
    'public.retire_previous_interface_translation_capability(text)',
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
  canonical_message text
)
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

grant execute on function public.test_interface_translation_proof(text)
  to anon, authenticated, service_role;

create function public.test_interface_translation_value_hash(requested_value text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(convert_to(requested_value, 'UTF8'), 'sha256'),
    'hex'
  );
$$;

grant execute on function public.test_interface_translation_value_hash(text)
  to anon, authenticated, service_role;

create function public.test_interface_translation_draft_generation()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select publication.draft_generation
  from private.interface_translation_publication as publication
  where publication.singleton;
$$;

grant execute on function public.test_interface_translation_draft_generation()
  to anon, authenticated, service_role;

create function public.test_interface_translation_save_proof(
  command_request_id text,
  command_issued_at bigint,
  requested_key text,
  requested_locale text,
  expected_publication_revision bigint,
  expected_draft_version bigint,
  requested_value text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.test_interface_translation_proof(
    'interface-translations-v2:save_draft:' || command_request_id || ':' ||
      command_issued_at::text || ':' || requested_key || ':' || requested_locale || ':' ||
      coalesce(expected_publication_revision, 0)::text || ':' || expected_draft_version::text || ':' ||
      public.test_interface_translation_value_hash(requested_value)
  );
$$;

grant execute on function public.test_interface_translation_save_proof(
  text,
  bigint,
  text,
  text,
  bigint,
  bigint,
  text
) to anon, authenticated, service_role;

create function public.test_interface_translation_publish_proof(
  command_request_id text,
  command_issued_at bigint,
  expected_publication_revision bigint,
  expected_draft_generation bigint
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.test_interface_translation_proof(
    'interface-translations-v2:publish:' || command_request_id || ':' ||
      command_issued_at::text || ':' || coalesce(expected_publication_revision, 0)::text || ':' ||
      expected_draft_generation::text
  );
$$;

grant execute on function public.test_interface_translation_publish_proof(text, bigint, bigint, bigint)
  to anon, authenticated, service_role;

create function public.test_interface_translation_restore_proof(
  command_request_id text,
  command_issued_at bigint,
  requested_revision_number bigint,
  expected_publication_revision bigint
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.test_interface_translation_proof(
    'interface-translations-v2:restore:' || command_request_id || ':' ||
      command_issued_at::text || ':' || requested_revision_number::text || ':' ||
      coalesce(expected_publication_revision, 0)::text
  );
$$;

grant execute on function public.test_interface_translation_restore_proof(text, bigint, bigint, bigint)
  to anon, authenticated, service_role;

select extensions.dblink_connect(
  'translation_setup',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);

select is(
  extensions.dblink_exec(
    'translation_setup',
    $setup$
      do $block$
      begin
        perform public.configure_interface_translation_capability(
          'local-interface-translation-capability-secret-v1'
        );
        perform public.sync_interface_translation_inventory(
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
        );
      end
      $block$;
    $setup$
  ),
  'DO',
  'A committed deployment session provisions the capability and initial inventory'
);

select extensions.dblink_disconnect('translation_setup');

select set_config(
  'test.translation_command_issued_at',
  floor(extract(epoch from statement_timestamp()))::bigint::text,
  true
);
select set_config(
  'test.initial_translation_draft_generation',
  public.test_interface_translation_draft_generation()::text,
  true
);

select extensions.dblink_connect(
  'translation_late_save',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);
select extensions.dblink_connect(
  'translation_stale_publish',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);

select is(
  extensions.dblink_exec(
    'translation_late_save',
    $seed_draft$
      do $block$
      declare
        issued_at bigint := floor(extract(epoch from statement_timestamp()))::bigint;
        publication_revision bigint;
        proof text;
        value_hash text := encode(
          extensions.digest(convert_to('Draft {name}', 'UTF8'), 'sha256'),
          'hex'
        );
      begin
        select revision_number into publication_revision
        from private.interface_translation_publication
        where singleton;
        proof := encode(
          extensions.hmac(
            'interface-translations-v2:save_draft:race-seed:' || issued_at::text ||
              ':greeting:en:' || publication_revision::text || ':0:' || value_hash,
            'local-interface-translation-capability-secret-v1',
            'sha256'
          ),
          'hex'
        );
        perform public.save_interface_translation_draft(
          'greeting',
          'en',
          'Draft {name}',
          publication_revision,
          0,
          'race-seed',
          issued_at,
          proof
        );
      end
      $block$;
    $seed_draft$
  ),
  'DO',
  'An independent editor session commits the reviewed draft batch'
);

select is(
  public.test_interface_translation_draft_generation(),
  current_setting('test.initial_translation_draft_generation')::bigint + 1,
  'The first effective save advances the monotonic draft generation'
);

select is(
  extensions.dblink_exec(
    'translation_late_save',
    $late_save$
      do $block$
      declare
        issued_at bigint := floor(extract(epoch from statement_timestamp()))::bigint;
        publication_revision bigint;
        proof text;
        value_hash text := encode(
          extensions.digest(convert_to('Late {name}', 'UTF8'), 'sha256'),
          'hex'
        );
      begin
        select revision_number into publication_revision
        from private.interface_translation_publication
        where singleton;
        proof := encode(
          extensions.hmac(
            'interface-translations-v2:save_draft:race-late-save:' || issued_at::text ||
              ':greeting:en:' || publication_revision::text || ':1:' || value_hash,
            'local-interface-translation-capability-secret-v1',
            'sha256'
          ),
          'hex'
        );
        perform public.save_interface_translation_draft(
          'greeting',
          'en',
          'Late {name}',
          publication_revision,
          1,
          'race-late-save',
          issued_at,
          proof
        );
      end
      $block$;
    $late_save$
  ),
  'DO',
  'A second session commits a late save after the first session reviewed generation one'
);

select throws_ok(
  $$
    select extensions.dblink_exec(
      'translation_stale_publish',
      $stale_publish$
        do $block$
        declare
          issued_at bigint := floor(extract(epoch from statement_timestamp()))::bigint;
          publication_revision bigint;
          proof text;
          reviewed_draft_generation bigint;
        begin
          select revision_number, draft_generation - 1
          into publication_revision, reviewed_draft_generation
          from private.interface_translation_publication
          where singleton;
          proof := encode(
            extensions.hmac(
              'interface-translations-v2:publish:race-stale-publish:' || issued_at::text || ':' ||
                publication_revision::text || ':' || reviewed_draft_generation::text,
              'local-interface-translation-capability-secret-v1',
              'sha256'
            ),
            'hex'
          );
          perform public.publish_interface_translation_drafts(
            publication_revision,
            reviewed_draft_generation,
            'race-stale-publish',
            issued_at,
            proof
          );
        end
        $block$;
      $stale_publish$
    )
  $$,
  '40001',
  'Interface translation drafts changed',
  'A publish reviewed before a late save cannot absorb the later edit'
);

select ok(
  public.test_interface_translation_draft_generation() =
    current_setting('test.initial_translation_draft_generation')::bigint + 2
  and (
    select value = 'Late {name}'
    from private.interface_translation_drafts
    where key = 'greeting' and locale = 'en'
  )
  and (
    select messages ->> 'greeting' = 'Hello {name}'
    from public.get_published_interface_translations('en')
  ),
  'The rejected stale publish preserves the late draft and original public snapshot'
);

select is(
  extensions.dblink_exec(
    'translation_late_save',
    $revert_race$
      do $block$
      declare
        issued_at bigint := floor(extract(epoch from statement_timestamp()))::bigint;
        publication_revision bigint;
        proof text;
        value_hash text := encode(
          extensions.digest(convert_to('Hello {name}', 'UTF8'), 'sha256'),
          'hex'
        );
      begin
        select revision_number into publication_revision
        from private.interface_translation_publication
        where singleton;
        proof := encode(
          extensions.hmac(
            'interface-translations-v2:save_draft:race-revert:' || issued_at::text ||
              ':greeting:en:' || publication_revision::text || ':2:' || value_hash,
            'local-interface-translation-capability-secret-v1',
            'sha256'
          ),
          'hex'
        );
        perform public.save_interface_translation_draft(
          'greeting',
          'en',
          'Hello {name}',
          publication_revision,
          2,
          'race-revert',
          issued_at,
          proof
        );
      end
      $block$;
    $revert_race$
  ),
  'DO',
  'The independent editor deliberately reverts the late draft'
);

select is(
  public.test_interface_translation_draft_generation(),
  current_setting('test.initial_translation_draft_generation')::bigint + 3,
  'An effective revert advances the same monotonic draft generation'
);

select extensions.dblink_disconnect('translation_late_save');
select extensions.dblink_disconnect('translation_stale_publish');

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
  $$select public.get_interface_translation_workspace(
    'read-invalid',
    current_setting('test.translation_command_issued_at')::bigint,
    repeat('0', 64)
  )$$,
  '42501',
  'Valid interface translation capability required',
  'A direct caller without a valid proof cannot inspect drafts or history'
);

select throws_ok(
  $$select public.get_interface_translation_workspace(
    'read-expired',
    current_setting('test.translation_command_issued_at')::bigint - 301,
    public.test_interface_translation_proof(
      'interface-translations-v2:read_workspace:read-expired:' ||
        (current_setting('test.translation_command_issued_at')::bigint - 301)::text
    )
  )$$,
  '42501',
  'Valid interface translation capability required',
  'An otherwise valid proof expires after the five-minute command window'
);

select ok(
  (
    select workspace ?& array[
      'currentRevision',
      'draftGeneration',
      'publishedAt',
      'pendingCount',
      'entries',
      'revisions'
    ]
    from (
      select public.get_interface_translation_workspace(
        'read-initial',
        current_setting('test.translation_command_issued_at')::bigint,
        public.test_interface_translation_proof(
          'interface-translations-v2:read_workspace:read-initial:' ||
            current_setting('test.translation_command_issued_at')
        )
      ) as workspace
    ) as projection
  ),
  'The workspace returns the fixed current, entry, pending, and revision shape'
);

select is(
  (
    select entry #>> '{draft,en}'
    from jsonb_array_elements(
      public.get_interface_translation_workspace(
        'read-effective-draft',
        current_setting('test.translation_command_issued_at')::bigint,
        public.test_interface_translation_proof(
          'interface-translations-v2:read_workspace:read-effective-draft:' ||
            current_setting('test.translation_command_issued_at')
        )
      ) -> 'entries'
    ) as entry
    where entry ->> 'key' = 'greeting'
  ),
  'Hello {name}'::text,
  'An untouched editor field receives its effective published value instead of null'
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
      current_setting('test.translation_command_issued_at')::bigint,
      repeat('0', 64)
    )
  $$,
  '42501',
  'Valid interface translation capability required',
  'A direct anonymous caller cannot mutate a draft without the server capability'
);

select throws_ok(
  $$
    select *
    from public.save_interface_translation_draft(
      'greeting',
      'en',
      'Substituted {name}',
      current_setting('test.initial_translation_revision')::bigint,
      0,
      'save-argument-bound',
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_save_proof(
        'save-argument-bound',
        current_setting('test.translation_command_issued_at')::bigint,
        'greeting',
        'en',
        current_setting('test.initial_translation_revision')::bigint,
        0,
        'Original {name}'
      )
    )
  $$,
  '42501',
  'Valid interface translation capability required',
  'A valid proof cannot be reused after substituting a command argument'
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
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_save_proof(
        'save-placeholder-invalid',
        current_setting('test.translation_command_issued_at')::bigint,
        'greeting',
        'en',
        current_setting('test.initial_translation_revision')::bigint,
        0,
        'Hi'
      )
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
      public.test_interface_translation_draft_generation(),
      'publish-placeholder-invalid',
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_publish_proof(
        'publish-placeholder-invalid',
        current_setting('test.translation_command_issued_at')::bigint,
        current_setting('test.initial_translation_revision')::bigint,
        public.test_interface_translation_draft_generation()
      )
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
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_save_proof(
        'save-placeholder-fixed',
        current_setting('test.translation_command_issued_at')::bigint,
        'greeting',
        'en',
        current_setting('test.initial_translation_revision')::bigint,
        1,
        'Hi {name}'
      )
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
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_save_proof(
        'save-stale-draft',
        current_setting('test.translation_command_issued_at')::bigint,
        'greeting',
        'en',
        current_setting('test.initial_translation_revision')::bigint,
        0,
        'Out-of-order {name}'
      )
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
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_save_proof(
        'save-icelandic',
        current_setting('test.translation_command_issued_at')::bigint,
        'greeting',
        'is',
        current_setting('test.initial_translation_revision')::bigint,
        0,
        'Sæl {name}'
      )
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
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_save_proof(
        'save-empty',
        current_setting('test.translation_command_issued_at')::bigint,
        'plain',
        'en',
        current_setting('test.initial_translation_revision')::bigint,
        0,
        ''
      )
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
      public.test_interface_translation_draft_generation(),
      'publish-empty',
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_publish_proof(
        'publish-empty',
        current_setting('test.translation_command_issued_at')::bigint,
        current_setting('test.initial_translation_revision')::bigint,
        public.test_interface_translation_draft_generation()
      )
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
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_save_proof(
        'revert-empty',
        current_setting('test.translation_command_issued_at')::bigint,
        'plain',
        'en',
        current_setting('test.initial_translation_revision')::bigint,
        1,
        'Unchanged'
      )
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
      public.test_interface_translation_draft_generation(),
      'publish-stale',
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_publish_proof(
        'publish-stale',
        current_setting('test.translation_command_issued_at')::bigint,
        999999,
        public.test_interface_translation_draft_generation()
      )
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
      public.test_interface_translation_draft_generation(),
      'publish-v2',
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_publish_proof(
        'publish-v2',
        current_setting('test.translation_command_issued_at')::bigint,
        current_setting('test.initial_translation_revision')::bigint,
        public.test_interface_translation_draft_generation()
      )
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
  (
    select change_count
    from private.interface_translation_revisions
    where revision_number = current_setting('test.published_translation_revision')::bigint
  ),
  1,
  'Publishing counts the one changed key rather than its two changed locale fields'
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
      public.test_interface_translation_draft_generation(),
      'publish-v2',
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_publish_proof(
        'publish-v2',
        current_setting('test.translation_command_issued_at')::bigint,
        current_setting('test.initial_translation_revision')::bigint,
        public.test_interface_translation_draft_generation()
      )
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
        current_setting('test.translation_command_issued_at')::bigint,
        public.test_interface_translation_proof(
          'interface-translations-v2:read_revision:read-v2:' ||
            current_setting('test.translation_command_issued_at') || ':' ||
            current_setting('test.published_translation_revision')
        )
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
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_save_proof(
        'save-before-forced-failure',
        current_setting('test.translation_command_issued_at')::bigint,
        'site.name',
        'en',
        current_setting('test.published_translation_revision')::bigint,
        0,
        'Hundavænt live'
      )
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
      public.test_interface_translation_draft_generation(),
      'publish-forced-failure',
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_publish_proof(
        'publish-forced-failure',
        current_setting('test.translation_command_issued_at')::bigint,
        current_setting('test.published_translation_revision')::bigint,
        public.test_interface_translation_draft_generation()
      )
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
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_save_proof(
        'revert-forced-failure-draft',
        current_setting('test.translation_command_issued_at')::bigint,
        'site.name',
        'en',
        current_setting('test.published_translation_revision')::bigint,
        1,
        'Hundavænt'
      )
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
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_save_proof(
        'save-before-restore',
        current_setting('test.translation_command_issued_at')::bigint,
        'new.key',
        'en',
        current_setting('test.inventory_translation_revision')::bigint,
        0,
        'New draft'
      )
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
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_restore_proof(
        'restore-with-drafts',
        current_setting('test.translation_command_issued_at')::bigint,
        current_setting('test.initial_translation_revision')::bigint,
        current_setting('test.inventory_translation_revision')::bigint
      )
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
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_save_proof(
        'revert-before-restore',
        current_setting('test.translation_command_issued_at')::bigint,
        'new.key',
        'en',
        current_setting('test.inventory_translation_revision')::bigint,
        1,
        'New'
      )
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
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_restore_proof(
        'restore-v1',
        current_setting('test.translation_command_issued_at')::bigint,
        current_setting('test.initial_translation_revision')::bigint,
        current_setting('test.inventory_translation_revision')::bigint
      )
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
      current_setting('test.translation_command_issued_at')::bigint,
      repeat('0', 64)
    )
  $$,
  '42501',
  'Valid interface translation capability required',
  'A direct caller cannot restore history without the server capability'
);

reset role;

set local role service_role;

select throws_ok(
  $$
    select *
    from public.sync_interface_translation_inventory(
      jsonb_build_object(
        'is', jsonb_build_object(
          'greeting', 'Halló {name}',
          'new.key', repeat('x', 10001),
          'site.name', 'Hundavænt'
        ),
        'en', jsonb_build_object(
          'greeting', 'Hello {name}',
          'new.key', repeat('x', 10001),
          'site.name', 'Hundavænt'
        )
      ),
      'inventory-over-runtime-limit'
    )
  $$,
  '22023',
  'Valid non-empty interface translation inventory required',
  'Deployment inventory rejects values above the runtime 10,000-character limit'
);

select lives_ok(
  $$
    select *
    from public.sync_interface_translation_inventory(
      jsonb_build_object(
        'is', jsonb_build_object(
          'greeting', 'Halló {name}',
          'new.key', repeat('x', 10000),
          'site.name', 'Hundavænt'
        ),
        'en', jsonb_build_object(
          'greeting', 'Hello {name}',
          'new.key', repeat('x', 10000),
          'site.name', 'Hundavænt'
        )
      ),
      'inventory-at-runtime-limit'
    )
  $$,
  'Deployment inventory accepts values at the runtime 10,000-character limit'
);

reset role;

select set_config(
  'test.boundary_translation_revision',
  (select revision_number::text from private.interface_translation_publication where singleton),
  true
);

set local role anon;

select is(
  (
    select draft_version
    from public.save_interface_translation_draft(
      'new.key',
      'en',
      repeat('y', 10000),
      current_setting('test.boundary_translation_revision')::bigint,
      0,
      'save-at-runtime-limit',
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_save_proof(
        'save-at-runtime-limit',
        current_setting('test.translation_command_issued_at')::bigint,
        'new.key',
        'en',
        current_setting('test.boundary_translation_revision')::bigint,
        0,
        repeat('y', 10000)
      )
    )
  ),
  1::bigint,
  'Draft saving accepts a value at the runtime 10,000-character limit'
);

select lives_ok(
  $$
    select *
    from public.publish_interface_translation_drafts(
      current_setting('test.boundary_translation_revision')::bigint,
      public.test_interface_translation_draft_generation(),
      'publish-at-runtime-limit',
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_publish_proof(
        'publish-at-runtime-limit',
        current_setting('test.translation_command_issued_at')::bigint,
        current_setting('test.boundary_translation_revision')::bigint,
        public.test_interface_translation_draft_generation()
      )
    )
  $$,
  'Publication validation accepts a value at the runtime 10,000-character limit'
);

reset role;

select set_config(
  'test.boundary_published_translation_revision',
  (select revision_number::text from private.interface_translation_publication where singleton),
  true
);

set local role anon;

select is(
  (
    select length(messages ->> 'new.key')
    from public.get_published_interface_translations('en')
  ),
  10000,
  'The exact-limit translation becomes the complete public runtime value'
);

select throws_ok(
  $$
    select *
    from public.save_interface_translation_draft(
      'new.key',
      'en',
      repeat('z', 10001),
      current_setting('test.boundary_published_translation_revision')::bigint,
      0,
      'save-over-runtime-limit',
      current_setting('test.translation_command_issued_at')::bigint,
      public.test_interface_translation_save_proof(
        'save-over-runtime-limit',
        current_setting('test.translation_command_issued_at')::bigint,
        'new.key',
        'en',
        current_setting('test.boundary_published_translation_revision')::bigint,
        0,
        repeat('z', 10001)
      )
    )
  $$,
  '22023',
  'Valid interface translation draft required',
  'Draft saving rejects a value above the runtime 10,000-character limit'
);

reset role;

select lives_ok(
  $$
    select public.configure_interface_translation_capability(
      'local-interface-translation-capability-secret-v2'
    )
  $$,
  'Capability rotation starts an overlap instead of invalidating the active release'
);

set local role anon;

select lives_ok(
  format(
    $proof$
      select public.get_interface_translation_workspace(
        'rotation-old-release',
        %s,
        '%s'
      )
    $proof$,
    current_setting('test.translation_command_issued_at')::bigint,
    public.test_interface_translation_proof(
      'interface-translations-v2:read_workspace:rotation-old-release:' ||
        current_setting('test.translation_command_issued_at')
    )
  ),
  'The previous release capability remains valid during deployment'
);

reset role;

select lives_ok(
  $$
    select public.retire_previous_interface_translation_capability(
      'local-interface-translation-capability-secret-v2'
    )
  $$,
  'A healthy deployment can retire the previous release capability'
);

set local role anon;

select throws_ok(
  format(
    $proof$
      select public.get_interface_translation_workspace(
        'rotation-retired-release',
        %s,
        '%s'
      )
    $proof$,
    current_setting('test.translation_command_issued_at')::bigint,
    public.test_interface_translation_proof(
      'interface-translations-v2:read_workspace:rotation-retired-release:' ||
        current_setting('test.translation_command_issued_at')
    )
  ),
  '42501',
  'Valid interface translation capability required',
  'The old release capability is rejected after the healthy deployment retires it'
);

reset role;

select * from finish();

rollback;

begin;

alter table private.interface_translation_revisions disable trigger user;
truncate table
  private.interface_translation_drafts,
  private.interface_translation_publication,
  private.interface_translation_revisions,
  private.interface_translation_keys,
  private.interface_translation_capabilities
restart identity cascade;
alter table private.interface_translation_revisions enable trigger user;

commit;
