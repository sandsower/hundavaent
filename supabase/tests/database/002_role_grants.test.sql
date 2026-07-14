begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_table('security', 'role_grants', 'Role Grant persistence exists');

select has_function(
  'security',
  'current_actor_id',
  array[]::text[],
  'Actor identity has one caller-derived helper'
);

select has_function(
  'security',
  'is_moderator',
  array[]::text[],
  'Moderator detection has one database helper'
);

select has_function(
  'security',
  'require_moderator',
  array[]::text[],
  'Privileged functions share one Moderator guard'
);

select has_function(
  'public',
  'has_current_user_role',
  array['text'],
  'Authenticated callers have one safe role-check function'
);

select ok(
  not has_function_privilege('anon', 'public.has_current_user_role(text)', 'execute'),
  'Anonymous callers cannot execute the role-check function'
);

insert into auth.users (id)
values
  ('70000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000002');

insert into security.role_grants (user_id, role)
values ('70000000-0000-4000-8000-000000000001', 'moderator');

select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000001',
  true
);

select is(
  security.current_actor_id(),
  '70000000-0000-4000-8000-000000000001'::uuid,
  'Actor identity comes from the caller JWT context'
);

select ok(
  security.is_moderator(),
  'An active Moderator Role Grant is detected'
);

select is(
  security.require_moderator(),
  '70000000-0000-4000-8000-000000000001'::uuid,
  'The Moderator guard returns the safe actor identity'
);

set local role authenticated;

select ok(
  public.has_current_user_role('moderator'),
  'The authenticated Moderator can check only their own role'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000002',
  true
);

select ok(
  not security.is_moderator(),
  'An authenticated Visitor without a Role Grant is not a Moderator'
);

select throws_ok(
  $$select security.require_moderator()$$,
  '42501',
  'Moderator role required',
  'An authenticated Visitor is denied privileged execution'
);

select * from finish();

rollback;
