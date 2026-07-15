begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

select has_table(
  'private',
  'member_provider_policy',
  'Tenant Member provider policy is persistent'
);

select has_table(
  'private',
  'member_activation_capabilities',
  'The callback capability is stored behind the private schema boundary'
);

select has_function(
  'public',
  'get_member_provider_policy',
  array[]::text[],
  'The callback has one fixed provider-policy projection'
);

select has_function(
  'public',
  'activate_current_member',
  array['text', 'text'],
  'The validated callback has one caller-scoped Member activation command'
);

select has_function(
  'public',
  'configure_member_activation_capability',
  array['text'],
  'Production operations have one capability-rotation command'
);

select is(
  (select email_enabled from private.member_provider_policy where singleton),
  true,
  'The tenant policy permits passwordless email'
);

select is(
  (select facebook_enabled from private.member_provider_policy where singleton),
  true,
  'The tenant policy permits Facebook'
);

select is(
  (select automatic_linking_verified_email from private.member_provider_policy where singleton),
  true,
  'The tenant policy permits automatic linking only through verified email'
);

select is(
  (select policy_version from private.member_provider_policy where singleton),
  'member-linked-providers-v2'::text,
  'The tenant provider boundary is explicitly versioned'
);

select ok(
  has_function_privilege('anon', 'public.get_member_provider_policy()', 'execute'),
  'Anonymous callbacks can read the safe provider policy projection'
);

select ok(
  has_function_privilege('authenticated', 'public.get_member_provider_policy()', 'execute'),
  'Authenticated callbacks can read the safe provider policy projection'
);

select ok(
  not has_function_privilege('service_role', 'public.get_member_provider_policy()', 'execute'),
  'The service role has no application-level provider-policy projection grant'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.activate_current_member(text,text)',
    'execute'
  ),
  'An exchanged authenticated callback can activate its own Member'
);

select ok(
  not has_function_privilege('anon', 'public.activate_current_member(text,text)', 'execute'),
  'An unconsumed link cannot invoke Member activation anonymously'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.configure_member_activation_capability(text)',
    'execute'
  ),
  'The service role can rotate the callback capability'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.configure_member_activation_capability(text)',
    'execute'
  ),
  'Ordinary authenticated callers cannot rotate the callback capability'
);

select ok(
  not has_table_privilege('anon', 'private.member_provider_policy', 'select,insert,update,delete'),
  'Anonymous callbacks cannot read or mutate the persistent policy table directly'
);

select ok(
  not has_table_privilege('authenticated', 'private.member_provider_policy', 'select,insert,update,delete'),
  'Members cannot read or mutate the persistent policy table directly'
);

select ok(
  not has_table_privilege('service_role', 'private.member_provider_policy', 'select,insert,update,delete'),
  'The application service role cannot bypass the migration-controlled policy boundary'
);

select throws_ok(
  $$
    update private.member_provider_policy
    set automatic_linking_verified_email = false
    where singleton
  $$,
  '23514',
  null,
  'The linked-provider policy cannot disable its verified-email boundary'
);

select throws_ok(
  $$
    insert into private.member_provider_policy (
      policy_version,
      email_enabled,
      facebook_enabled,
      automatic_linking_verified_email
    ) values ('member-linked-providers-v2', true, true, true)
  $$,
  '23505',
  null,
  'A second active tenant policy cannot be created'
);

select * from finish();

rollback;
