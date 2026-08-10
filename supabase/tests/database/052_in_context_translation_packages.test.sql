begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select ok(
  not has_table_privilege(
    'authenticated',
    'private.interface_translation_access',
    'select,insert,update,delete'
  ),
  'Translation access allowlist stays private'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.interface_translation_packages',
    'select,insert,update,delete'
  ),
  'Translation packages stay private'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.interface_translation_package_entries',
    'select,insert,update,delete'
  ),
  'Translation package entries stay private'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_my_interface_translation_access()',
    'execute'
  ),
  'Authenticated callers can inspect only their own translation capability'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_my_interface_translation_workspace(text)',
    'execute'
  ),
  'Authenticated translators can request their private workspace projection'
);

insert into auth.users (id, email, email_confirmed_at) values
  (
    'a9100000-0000-4000-8000-000000000001',
    'victor.val.mtz@gmail.com',
    statement_timestamp()
  ),
  (
    'a9100000-0000-4000-8000-000000000002',
    'translator@example.invalid',
    statement_timestamp()
  ),
  (
    'a9100000-0000-4000-8000-000000000003',
    'ordinary@example.invalid',
    statement_timestamp()
  );

insert into private.interface_translation_access (email, access_level) values
  ('translator@example.invalid', 'translator');

insert into private.interface_translation_keys (
  key,
  bundled_is,
  bundled_en,
  active
) values (
  'nav.about',
  'Um Hundavænt',
  'About Hundavænt',
  true
)
on conflict (key) do update set
  bundled_is = excluded.bundled_is,
  bundled_en = excluded.bundled_en,
  active = true;

insert into private.interface_translation_revisions (
  request_id,
  kind,
  catalogues,
  change_count
) values (
  'translation-package-test-inventory',
  'inventory_sync',
  '{"is":{"nav.about":"Um Hundavænt"},"en":{"nav.about":"About Hundavænt"}}'::jsonb,
  1
)
on conflict (request_id) do nothing;

insert into private.interface_translation_publication (
  singleton,
  revision_number,
  draft_generation,
  updated_at
)
select true, revision_number, 0, statement_timestamp()
from private.interface_translation_revisions
where request_id = 'translation-package-test-inventory'
on conflict (singleton) do update set
  revision_number = excluded.revision_number,
  draft_generation = 0,
  updated_at = excluded.updated_at;

create temporary table translation_package_test_state (
  package_id uuid,
  other_package_id uuid,
  package_version bigint,
  publication_revision bigint,
  candidate_revision bigint
) on commit drop;

grant select, update on translation_package_test_state to authenticated;

insert into translation_package_test_state (publication_revision)
select revision_number
from private.interface_translation_publication
where singleton;

set local role authenticated;

select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000003', true);

select is(
  public.get_my_interface_translation_access(),
  null,
  'An ordinary authenticated account has no translation capability'
);

select throws_ok(
  $$select public.start_interface_translation_package('/about', '/en/about', 'ordinary-start')$$,
  '42501',
  'Interface translation access required',
  'An ordinary account cannot start a package'
);

select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000001', true);

select is(
  public.get_my_interface_translation_access() ->> 'role',
  'translation_owner',
  'The initial allowlisted account is a translation owner'
);

select is(
  public.get_my_interface_translation_access() ->> 'canTranslate',
  'true',
  'Translation owner capability implies translator capability'
);

select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000002', true);

select is(
  public.get_my_interface_translation_access() ->> 'role',
  'translator',
  'A translator allowlist entry grants translator capability'
);

with started as (
  select public.start_interface_translation_package(
    '/about',
    '/en/about',
    'translator-start-about'
  ) as package
)
update translation_package_test_state
set
  package_id = (select (package ->> 'id')::uuid from started),
  package_version = (select (package ->> 'version')::bigint from started);

select is(
  public.get_my_interface_translation_package(
    (select package_id from translation_package_test_state)
  ) ->> 'status',
  'draft',
  'A translator starts a private page-level draft package'
);

select throws_ok(
  $$select public.start_interface_translation_package('/account', '/en/account', 'translator-start-other')$$,
  '55000',
  'Finish the current page draft before starting another',
  'A translator cannot start a second editable page draft'
);

with saved as (
  select public.save_interface_translation_package_entry(
    (select package_id from translation_package_test_state),
    'nav.about',
    'Um okkur',
    'About us',
    0,
    'translator-save-about'
  ) as entry
)
update translation_package_test_state
set package_version = (select (entry ->> 'packageVersion')::bigint from saved);

select is(
  public.get_my_interface_translation_package(
    (select package_id from translation_package_test_state)
  ) #>> '{entries,0,draft,en}',
  'About us',
  'Bilingual package autosave persists the draft value'
);

select throws_ok(
  format(
    'select public.save_interface_translation_package_entry(%L, %L, %L, %L, %s, %L)',
    (select package_id from translation_package_test_state),
    'nav.about',
    'Um okkur aftur',
    'About us again',
    0,
    'translator-stale-save'
  ),
  '40001',
  'Translation package entry changed',
  'Stale autosave versions are rejected'
);

with submitted as (
  select public.submit_interface_translation_package(
    (select package_id from translation_package_test_state),
    (select package_version from translation_package_test_state),
    'translator-submit-about'
  ) as package
)
update translation_package_test_state
set package_version = (select (package ->> 'version')::bigint from submitted);

select is(
  public.get_my_interface_translation_package(
    (select package_id from translation_package_test_state)
  ) ->> 'status',
  'submitted',
  'The translator submits the complete page package'
);

select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000001', true);

with started as (
  select public.start_interface_translation_package(
    '/account',
    '/en/account',
    'owner-start-account'
  ) as package
)
update translation_package_test_state
set other_package_id = (select (package ->> 'id')::uuid from started);

select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000002', true);

select throws_ok(
  format(
    'select public.submit_interface_translation_package(%L, %s, %L)',
    (select other_package_id from translation_package_test_state),
    1,
    'translator-submit-about'
  ),
  '22023',
  'Request identifier belongs to a different translation package',
  'A replayed submit request cannot disclose a different author package'
);

select throws_ok(
  format(
    'select public.save_interface_translation_package_entry(%L, %L, %L, %L, %s, %L)',
    (select package_id from translation_package_test_state),
    'nav.about',
    'Læst',
    'Locked',
    1,
    'translator-save-submitted'
  ),
  '55000',
  'Only an editable translation package can be changed',
  'A submitted package is immutable'
);

select throws_ok(
  format(
    'select public.review_interface_translation_package(%L, %L, null, %s, %L)',
    (select package_id from translation_package_test_state),
    'approve',
    (select package_version from translation_package_test_state),
    'translator-approve-about'
  ),
  '42501',
  'Interface translation owner access required',
  'A translator cannot approve a package'
);

select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000001', true);

select throws_ok(
  format(
    'select public.review_interface_translation_package(%L, %L, %L, %s, %L)',
    (select package_id from translation_package_test_state),
    'return',
    ' ',
    (select package_version from translation_package_test_state),
    'owner-return-blank'
  ),
  '22023',
  'A return note is required',
  'Returning a package requires one overall note'
);

with returned as (
  select public.review_interface_translation_package(
    (select package_id from translation_package_test_state),
    'return',
    'Please make the Icelandic title warmer.',
    (select package_version from translation_package_test_state),
    'owner-return-about'
  ) as package
)
update translation_package_test_state
set package_version = (select (package ->> 'version')::bigint from returned);

select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000002', true);

select is(
  public.get_my_interface_translation_package(
    (select package_id from translation_package_test_state)
  ) ->> 'reviewNote',
  'Please make the Icelandic title warmer.',
  'The package carries one overall revision note'
);

with saved as (
  select public.save_interface_translation_package_entry(
    (select package_id from translation_package_test_state),
    'nav.about',
    'Um Hundavænt verkefnið',
    'About Hundavænt',
    1,
    'translator-revise-about'
  ) as entry
)
update translation_package_test_state
set package_version = (select (entry ->> 'packageVersion')::bigint from saved);

with submitted as (
  select public.submit_interface_translation_package(
    (select package_id from translation_package_test_state),
    (select package_version from translation_package_test_state),
    'translator-resubmit-about'
  ) as package
)
update translation_package_test_state
set package_version = (select (package ->> 'version')::bigint from submitted);

select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000001', true);

select is(
  jsonb_array_length(public.list_interface_translation_review_packages()),
  1,
  'The owner review queue lists the submitted package as one unit'
);

with approved as (
  select public.review_interface_translation_package(
    (select package_id from translation_package_test_state),
    'approve',
    null,
    (select package_version from translation_package_test_state),
    'owner-approve-about'
  ) as package
)
update translation_package_test_state
set
  package_version = (select (package ->> 'version')::bigint from approved),
  candidate_revision = (select (package ->> 'candidateRevision')::bigint from approved);

select is(
  public.get_my_interface_translation_package(
    (select package_id from translation_package_test_state)
  ) ->> 'status',
  'approved',
  'Owner approval applies to the complete package'
);

reset role;

select is(
  (select revision_number from private.interface_translation_publication where singleton),
  (select publication_revision from translation_package_test_state),
  'Approval does not change the public translation mirror'
);

select is(
  (
    select revision.catalogues #>> '{is,nav.about}'
    from private.interface_translation_source_candidate as candidate
    join private.interface_translation_revisions as revision
      on revision.revision_number = candidate.revision_number
    where candidate.singleton
  ),
  'Um Hundavænt verkefnið',
  'Approval creates a non-public source candidate with the complete package changes'
);

insert into private.interface_translation_source_applications (
  candidate_revision_number,
  deployed_revision_number
)
select candidate_revision, publication_revision
from translation_package_test_state;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000001', true);

select is(
  public.get_my_interface_translation_package(
    (select package_id from translation_package_test_state)
  ) ->> 'status',
  'exported',
  'Applying the approved source candidate marks its package exported'
);

reset role;

select is(
  (
    select count(*)
    from private.interface_translation_package_events
    where package_id = (select package_id from translation_package_test_state)
  ),
  5::bigint,
  'Package lifecycle transitions retain a compact audit trail'
);

select * from finish();

rollback;
