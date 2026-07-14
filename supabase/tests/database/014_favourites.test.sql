begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

select has_table('private', 'member_favourites', 'Private Favourite persistence exists');
select has_function(
  'public',
  'set_current_favourite',
  array['uuid', 'boolean'],
  'Favourite mutation uses desired state'
);
select has_function(
  'public',
  'list_current_favourite_ids',
  array[]::text[],
  'The caller can load only their Favourite identifiers'
);
select has_function(
  'public',
  'list_current_favourites',
  array['text', 'integer', 'timestamp with time zone', 'uuid'],
  'The saved projection is localized and bounded'
);
select has_function(
  'private',
  'detach_member_favourites',
  array['uuid'],
  'Account deletion has a private cleanup seam'
);

select ok(
  not has_table_privilege('anon', 'private.member_favourites', 'select,insert,update,delete'),
  'Visitors cannot inspect or mutate Favourite rows'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'private.member_favourites',
    'select,insert,update,delete'
  ),
  'Members cannot bypass caller-owned RPCs'
);
select ok(
  not has_table_privilege('service_role', 'private.member_favourites', 'select,insert,update,delete'),
  'The service role cannot use Favourite rows as an unrestricted query surface'
);
select ok(
  not has_function_privilege('anon', 'public.set_current_favourite(uuid,boolean)', 'execute'),
  'Visitors cannot mutate Favourites'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.set_current_favourite(uuid,boolean)',
    'execute'
  ),
  'Authenticated callers can request their desired Favourite state'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.detach_member_favourites(uuid)',
    'execute'
  ),
  'Members cannot invoke the deferred account cleanup seam'
);
select ok(
  not has_function_privilege('service_role', 'private.detach_member_favourites(uuid)', 'execute'),
  'account-deletion must explicitly adopt the cleanup seam before using it'
);

insert into auth.users (id)
values
  ('76000000-0000-4000-8000-000000000001'),
  ('76000000-0000-4000-8000-000000000002'),
  ('76000000-0000-4000-8000-000000000003');

insert into private.member_accounts (user_id)
values
  ('76000000-0000-4000-8000-000000000001'),
  ('76000000-0000-4000-8000-000000000002');

insert into security.role_grants (user_id, role)
values
  ('76000000-0000-4000-8000-000000000001', 'member'),
  ('76000000-0000-4000-8000-000000000002', 'member');

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select throws_ok(
  $$select * from public.set_current_favourite('30000000-0000-4000-8000-000000000003', true)$$,
  '42501',
  'Member activation required',
  'An Auth identity without a Member account cannot save a Place'
);

reset role;
select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select throws_ok(
  $$select * from public.set_current_favourite('30000000-0000-4000-8000-000000000001', true)$$,
  '22023',
  'Discoverable Place required',
  'A Candidate cannot be newly saved'
);
select throws_ok(
  $$select * from public.set_current_favourite('30000000-0000-4000-8000-000000000002', true)$$,
  '22023',
  'Discoverable Place required',
  'A Published but unverified Place cannot be newly saved'
);

reset role;
update private.verifications
set freshness_until = greatest(
  verified_at + interval '1 second',
  statement_timestamp() - interval '1 second'
)
where id = '60000000-0000-4000-8000-000000000003';
set local role authenticated;

select is(
  (
    select count(*)
    from public.list_published_places('en')
    where place_id = '30000000-0000-4000-8000-000000000003'
  ),
  1::bigint,
  'A current verified condition remains publicly discoverable when reconfirmation is due'
);
select is(
  (select is_favourite from public.set_current_favourite(
    '30000000-0000-4000-8000-000000000003',
    true
  )),
  true,
  'Favourite eligibility exactly follows discoverability for a reconfirmation-due Place'
);
select is(
  (select is_favourite from public.set_current_favourite(
    '30000000-0000-4000-8000-000000000003',
    true
  )),
  true,
  'Repeating the same desired state is idempotent'
);
select is(
  (select count(*) from public.list_current_favourite_ids()),
  1::bigint,
  'The caller sees one Favourite identifier after duplicate requests'
);
select is(
  (select availability from public.list_current_favourites('en', 50, null, null)),
  'available',
  'A currently discoverable saved Place is available'
);
select is(
  (select name from public.list_current_favourites('en', 50, null, null)),
  'Published Place',
  'The saved projection uses the requested public translation'
);
select is(
  (select count(*) from public.list_current_favourites('en', 0, null, null)),
  0::bigint,
  'The saved projection honors a bounded zero-sized page'
);

reset role;
select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (select count(*) from public.list_current_favourite_ids()),
  0::bigint,
  'Another Member cannot infer the first Member Favourite'
);
select is(
  (select is_favourite from public.set_current_favourite(
    '30000000-0000-4000-8000-000000000003',
    false
  )),
  false,
  'Removing a Place never mutates another Member Favourite'
);

reset role;

update private.places
set lifecycle = 'inactive'
where id = '30000000-0000-4000-8000-000000000003';

select set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (select availability from public.list_current_favourites('is', 50, null, null)),
  'inactive',
  'An Inactive Place remains distinguishable in saved history'
);
select is(
  (select is_favourite from public.set_current_favourite(
    '30000000-0000-4000-8000-000000000003',
    false
  )),
  false,
  'An Inactive Place can still be removed'
);
select is(
  (select is_favourite from public.set_current_favourite(
    '30000000-0000-4000-8000-000000000003',
    false
  )),
  false,
  'Repeated removal is idempotent'
);

reset role;

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'member_favourites'
      and column_name in ('user_id', 'place_id', 'created_at')
  ),
  3::bigint,
  'Favourite persistence stores only ownership, Place identity, and time'
);
select is(
  (
    select count(*)
    from information_schema.parameters
    where specific_schema = 'public'
      and specific_name like 'list_published_places_%'
      and parameter_mode = 'OUT'
      and parameter_name ilike '%favourite%'
  ),
  0::bigint,
  'Public discovery exposes no Favourite field or count'
);

set local role anon;

select throws_ok(
  $$select * from public.list_current_favourite_ids()$$,
  '42501',
  null,
  'A Visitor cannot query private Favourite identifiers'
);

reset role;

select * from finish();

rollback;
