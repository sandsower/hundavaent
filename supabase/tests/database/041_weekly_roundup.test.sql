begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_table(
  'private',
  'member_roundup_preferences',
  'Weekly roundup preferences have one private Member-owned source'
);
select has_function(
  'public',
  'get_current_member_roundup_preferences',
  array[]::text[],
  'Members can load only their own explicit roundup preferences'
);
select has_function(
  'public',
  'save_current_member_roundup_preferences',
  array['text[]', 'text[]', 'text', 'boolean'],
  'Members can save an explicit privacy-minimal roundup preference'
);
select has_function(
  'public',
  'get_current_member_weekly_roundup',
  array[]::text[],
  'Members can load their private completed-week roundup'
);
select has_function(
  'private',
  'detach_member_roundup_preferences',
  array['uuid'],
  'Account deletion has a private roundup cleanup seam'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.member_roundup_preferences',
    'select,insert,update,delete'
  )
  and not has_table_privilege(
    'service_role',
    'private.member_roundup_preferences',
    'select,insert,update,delete'
  ),
  'No application role can inspect or mutate roundup preferences directly'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_current_member_roundup_preferences()',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.save_current_member_roundup_preferences(text[],text[],text,boolean)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.get_current_member_weekly_roundup()',
    'execute'
  ),
  'Authenticated Members can reach only the caller-owned roundup functions'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_current_member_roundup_preferences()',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.save_current_member_roundup_preferences(text[],text[],text,boolean)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.get_current_member_weekly_roundup()',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.get_current_member_weekly_roundup()',
    'execute'
  ),
  'Visitors and service-role callers cannot inspect a Member roundup'
);

select is(
  (select count(*) from private.member_roundup_preferences),
  0::bigint,
  'Deployment starts without inferred or backfilled roundup preferences'
);
select ok(
  position(
    'member_favourites'
    in pg_get_functiondef('public.get_current_member_weekly_roundup()'::regprocedure)
  ) = 0,
  'Roundup selection does not consult Favorites'
);
select ok(
  position(
    'check_ins'
    in pg_get_functiondef('public.get_current_member_weekly_roundup()'::regprocedure)
  ) = 0,
  'Roundup selection does not consult Check-ins'
);
select ok(
  position(
    'member_qualifying_activity'
    in pg_get_functiondef('public.get_current_member_weekly_roundup()'::regprocedure)
  ) = 0,
  'Roundup selection does not consult weekly activity history'
);

insert into auth.users (id, email)
values
  ('94700000-0000-4000-8000-000000000001', 'roundup-one@example.invalid'),
  ('94700000-0000-4000-8000-000000000002', 'roundup-two@example.invalid');

insert into private.member_accounts (user_id)
values
  ('94700000-0000-4000-8000-000000000001'),
  ('94700000-0000-4000-8000-000000000002');

insert into security.role_grants (user_id, role)
values
  ('94700000-0000-4000-8000-000000000001', 'member'),
  ('94700000-0000-4000-8000-000000000002', 'member');

insert into private.operators (id, name)
values ('94710000-0000-4000-8000-000000000001', 'Weekly roundup fixture operator');

insert into private.locations (
  id,
  address_line,
  locality,
  postal_code,
  municipality,
  latitude,
  longitude,
  geometry_precision,
  geometry_source,
  created_at,
  updated_at
)
values
  (
    '94720000-0000-4000-8000-000000000001',
    'Vikugata 1',
    'Reykjavík',
    '101',
    'reykjavik',
    64.1466,
    -21.9426,
    'moderator_confirmed_point',
    'Weekly roundup fixture',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z'
  ),
  (
    '94720000-0000-4000-8000-000000000002',
    'Vikugata 2',
    'Kópavogur',
    '200',
    'kopavogur',
    64.111,
    -21.91,
    'moderator_confirmed_point',
    'Weekly roundup fixture',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z'
  ),
  (
    '94720000-0000-4000-8000-000000000003',
    'Vikugata 3',
    'Hafnarfjörður',
    '220',
    'hafnarfjordur',
    64.067,
    -21.95,
    'moderator_confirmed_point',
    'Weekly roundup fixture',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z'
  ),
  (
    '94720000-0000-4000-8000-000000000004',
    'Vikugata 4',
    'Reykjavík',
    '105',
    'reykjavik',
    64.14,
    -21.9,
    'municipality_anchor_pending_geocode',
    'Geometry still pending',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z'
  );

insert into private.places (
  id,
  operator_id,
  location_id,
  purpose,
  lifecycle,
  category,
  version,
  published_at,
  created_at,
  updated_at,
  created_by
)
values
  (
    '94730000-0000-4000-8000-000000000001',
    '94710000-0000-4000-8000-000000000001',
    '94720000-0000-4000-8000-000000000001',
    'roundup_new_place',
    'published',
    'cafe',
    1,
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z',
    '94700000-0000-4000-8000-000000000001'
  ),
  (
    '94730000-0000-4000-8000-000000000002',
    '94710000-0000-4000-8000-000000000001',
    '94720000-0000-4000-8000-000000000002',
    'roundup_updated_place',
    'published',
    'park',
    2,
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z',
    '94700000-0000-4000-8000-000000000001'
  ),
  (
    '94730000-0000-4000-8000-000000000003',
    '94710000-0000-4000-8000-000000000001',
    '94720000-0000-4000-8000-000000000003',
    'roundup_wrong_municipality',
    'published',
    'cafe',
    1,
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z',
    '94700000-0000-4000-8000-000000000001'
  ),
  (
    '94730000-0000-4000-8000-000000000004',
    '94710000-0000-4000-8000-000000000001',
    '94720000-0000-4000-8000-000000000004',
    'roundup_unpublishable_geometry',
    'published',
    'cafe',
    1,
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z',
    '94700000-0000-4000-8000-000000000001'
  );

update private.places as place_record
set
  published_at = case
    when place_record.id in (
      '94730000-0000-4000-8000-000000000001',
      '94730000-0000-4000-8000-000000000003',
      '94730000-0000-4000-8000-000000000004'
    ) then bounds.starts_at - interval '3 days'
    else place_record.published_at
  end,
  updated_at = case
    when place_record.id = '94730000-0000-4000-8000-000000000002'
      then bounds.starts_at - interval '2 days'
    when place_record.id in (
      '94730000-0000-4000-8000-000000000001',
      '94730000-0000-4000-8000-000000000003',
      '94730000-0000-4000-8000-000000000004'
    ) then bounds.starts_at - interval '3 days'
    else place_record.updated_at
  end
from private.reykjavik_week_bounds(statement_timestamp()) as bounds
where place_record.id in (
  '94730000-0000-4000-8000-000000000001',
  '94730000-0000-4000-8000-000000000002',
  '94730000-0000-4000-8000-000000000003',
  '94730000-0000-4000-8000-000000000004'
);

insert into private.place_translations (
  place_id,
  locale,
  name,
  description,
  created_at,
  updated_at
)
values
  (
    '94730000-0000-4000-8000-000000000001',
    'is',
    'Nýja kaffihúsið',
    'Nýtt í vikunni.',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z'
  ),
  (
    '94730000-0000-4000-8000-000000000001',
    'en',
    'New Cafe',
    'New this week.',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z'
  ),
  (
    '94730000-0000-4000-8000-000000000002',
    'is',
    'Uppfærði garðurinn',
    'Uppfærður í vikunni.',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z'
  ),
  (
    '94730000-0000-4000-8000-000000000002',
    'en',
    'Updated Park',
    'Updated this week.',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z'
  ),
  (
    '94730000-0000-4000-8000-000000000003',
    'is',
    'Rangur bær',
    'Á ekki að birtast.',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z'
  ),
  (
    '94730000-0000-4000-8000-000000000003',
    'en',
    'Wrong Municipality',
    'Must not appear.',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z'
  ),
  (
    '94730000-0000-4000-8000-000000000004',
    'is',
    'Óstaðfest staðsetning',
    'Á ekki að birtast.',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z'
  ),
  (
    '94730000-0000-4000-8000-000000000004',
    'en',
    'Unconfirmed Geometry',
    'Must not appear.',
    '2025-01-01T00:00:00Z',
    '2025-01-01T00:00:00Z'
  );

insert into private.access_conditions (
  id,
  place_id,
  access_area,
  restraint_condition,
  dog_eligibility,
  availability_state,
  availability_window,
  permission_requirement,
  created_by
)
values
  (
    '94740000-0000-4000-8000-000000000001',
    '94730000-0000-4000-8000-000000000001',
    'indoors',
    'leash_required',
    '{"scope":"all_dogs"}',
    'not_stated',
    '{}',
    'standing_permission',
    '94700000-0000-4000-8000-000000000001'
  ),
  (
    '94740000-0000-4000-8000-000000000002',
    '94730000-0000-4000-8000-000000000002',
    'outdoors',
    'leash_required',
    '{"scope":"all_dogs"}',
    'not_stated',
    '{}',
    'standing_permission',
    '94700000-0000-4000-8000-000000000001'
  ),
  (
    '94740000-0000-4000-8000-000000000003',
    '94730000-0000-4000-8000-000000000003',
    'indoors',
    'leash_required',
    '{"scope":"all_dogs"}',
    'not_stated',
    '{}',
    'standing_permission',
    '94700000-0000-4000-8000-000000000001'
  ),
  (
    '94740000-0000-4000-8000-000000000004',
    '94730000-0000-4000-8000-000000000004',
    'indoors',
    'leash_required',
    '{"scope":"all_dogs"}',
    'not_stated',
    '{}',
    'standing_permission',
    '94700000-0000-4000-8000-000000000001'
  );

insert into private.verifications (
  id,
  access_condition_id,
  status,
  verified_by,
  verified_at,
  freshness_until
)
values
  (
    '94750000-0000-4000-8000-000000000001',
    '94740000-0000-4000-8000-000000000001',
    'verified',
    '94700000-0000-4000-8000-000000000001',
    statement_timestamp() - interval '1 day',
    statement_timestamp() + interval '30 days'
  ),
  (
    '94750000-0000-4000-8000-000000000002',
    '94740000-0000-4000-8000-000000000002',
    'verified',
    '94700000-0000-4000-8000-000000000001',
    statement_timestamp() - interval '1 day',
    statement_timestamp() + interval '30 days'
  ),
  (
    '94750000-0000-4000-8000-000000000003',
    '94740000-0000-4000-8000-000000000003',
    'verified',
    '94700000-0000-4000-8000-000000000001',
    statement_timestamp() - interval '1 day',
    statement_timestamp() + interval '30 days'
  ),
  (
    '94750000-0000-4000-8000-000000000004',
    '94740000-0000-4000-8000-000000000004',
    'verified',
    '94700000-0000-4000-8000-000000000001',
    statement_timestamp() - interval '1 day',
    statement_timestamp() + interval '30 days'
  );

select set_config('request.jwt.claim.sub', '94700000-0000-4000-8000-000000000001', true);
set local role authenticated;

select results_eq(
  $$
    select configured, municipalities, categories, roundup_locale, email_interest
    from public.get_current_member_roundup_preferences()
  $$,
  $$ values (false, array[]::text[], array[]::text[], 'is'::text, false) $$,
  'An unconfigured Member receives one private default projection without inferred choices'
);

select throws_ok(
  $$
    select * from public.save_current_member_roundup_preferences(
      array['akureyri'],
      array[]::text[],
      'is',
      false
    )
  $$,
  '22023',
  'One or more supported municipalities are required',
  'Preferences reject municipalities outside the explicit capital-region list'
);
select throws_ok(
  $$
    select * from public.save_current_member_roundup_preferences(
      array['reykjavik', 'reykjavik'],
      array[]::text[],
      'is',
      false
    )
  $$,
  '22023',
  'Municipalities must be unique',
  'Preferences reject duplicate municipalities instead of hiding input mistakes'
);
select throws_ok(
  $$
    select * from public.save_current_member_roundup_preferences(
      array['reykjavik'],
      array['dog_spa'],
      'is',
      false
    )
  $$,
  '22023',
  'Place categories are invalid',
  'Preferences reject category values outside the public Place vocabulary'
);
select throws_ok(
  $$
    select * from public.save_current_member_roundup_preferences(
      array['reykjavik'],
      array[]::text[],
      'de',
      false
    )
  $$,
  '22023',
  'Roundup language is invalid',
  'Preferences reject unsupported roundup languages'
);

select results_eq(
  $$
    select configured, municipalities, categories, roundup_locale, email_interest
    from public.save_current_member_roundup_preferences(
      array['reykjavik', 'kopavogur'],
      array[]::text[],
      'en',
      true
    )
  $$,
  $$
    values (
      true,
      array['kopavogur', 'reykjavik']::text[],
      array[]::text[],
      'en'::text,
      true
    )
  $$,
  'Saving preferences canonicalizes explicit selections and records email interest without sending'
);

select results_eq(
  $$
    select
      place_name,
      category,
      municipality,
      recommendation_reason,
      recommendation_rank
    from public.get_current_member_weekly_roundup()
    where place_id is not null
    order by recommendation_rank
  $$,
  $$
    values
      ('New Cafe'::text, 'cafe'::text, 'reykjavik'::text, 'newly_published'::text, 1),
      ('Updated Park'::text, 'park'::text, 'kopavogur'::text, 'updated'::text, 2)
  $$,
  'The completed-week roundup is deterministic, localized, filtered, and public-eligible'
);
select is(
  (
    select week_ends_on - week_starts_on
    from public.get_current_member_weekly_roundup()
    limit 1
  ),
  6,
  'The displayed completed Reykjavík week spans Monday through Sunday inclusively'
);

select results_eq(
  $$
    select categories
    from public.save_current_member_roundup_preferences(
      array['reykjavik', 'kopavogur'],
      array['restaurant', 'cafe', 'accommodation'],
      'en',
      true
    )
  $$,
  $$
    values (array['accommodation', 'cafe', 'restaurant']::text[])
  $$,
  'Saving multiple categories uses the canonical text order required by the preference constraint'
);

select lives_ok(
  $$
    select * from public.save_current_member_roundup_preferences(
      array['reykjavik', 'kopavogur'],
      array['park'],
      'is',
      true
    )
  $$,
  'A Member can narrow an existing roundup explicitly'
);
select results_eq(
  $$
    select place_name, recommendation_reason, recommendation_rank
    from public.get_current_member_weekly_roundup()
    where place_id is not null
  $$,
  $$ values ('Uppfærði garðurinn'::text, 'updated'::text, 1) $$,
  'Category and language preferences determine the private roundup projection'
);

reset role;

update private.member_roundup_preferences
set
  created_at = statement_timestamp() - interval '2 days',
  email_interest_changed_at = statement_timestamp() - interval '1 day',
  updated_at = statement_timestamp() - interval '1 day'
where member_id = '94700000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub', '94700000-0000-4000-8000-000000000001', true);
set local role authenticated;

select lives_ok(
  $$
    select * from public.save_current_member_roundup_preferences(
      array['reykjavik'],
      array['cafe'],
      'en',
      false
    )
  $$,
  'Email interest can be withdrawn without an email delivery side effect'
);
select ok(
  (
    select
      not preference.email_interest
      and preference.email_interest_changed_at > statement_timestamp() - interval '1 minute'
    from public.get_current_member_roundup_preferences() as preference
  ),
  'Withdrawing email interest records the explicit preference change time'
);
select results_eq(
  $$
    select place_name, recommendation_reason
    from public.get_current_member_weekly_roundup()
    where place_id is not null
  $$,
  $$ values ('New Cafe'::text, 'newly_published'::text) $$,
  'A changed municipality and category selection takes effect without consulting activity history'
);

select lives_ok(
  $$
    select * from public.save_current_member_roundup_preferences(
      array['kjosarhreppur'],
      array[]::text[],
      'is',
      false
    )
  $$,
  'A supported municipality with no weekly matches remains a valid preference'
);
select results_eq(
  $$
    select configured, roundup_locale, place_id, recommendation_rank
    from public.get_current_member_weekly_roundup()
  $$,
  $$ values (true, 'is'::text, null::uuid, null::integer) $$,
  'A configured empty roundup returns one explicit sentinel rather than disappearing'
);

reset role;

select set_config('request.jwt.claim.sub', '94700000-0000-4000-8000-000000000002', true);
set local role authenticated;

select results_eq(
  $$
    select configured, municipalities, categories, roundup_locale, email_interest
    from public.get_current_member_roundup_preferences()
  $$,
  $$ values (false, array[]::text[], array[]::text[], 'is'::text, false) $$,
  'Another Member cannot infer the first Member selections or email interest'
);
select results_eq(
  $$
    select configured, roundup_locale, place_id, recommendation_rank
    from public.get_current_member_weekly_roundup()
  $$,
  $$ values (false, 'is'::text, null::uuid, null::integer) $$,
  'Another Member cannot infer the first Member roundup results'
);

reset role;

select is(
  private.detach_member_roundup_preferences(
    '94700000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'Account cleanup removes the one private roundup preference'
);
select is(
  (
    select count(*)
    from private.member_roundup_preferences
    where member_id = '94700000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'No roundup preference survives the private Member cleanup seam'
);

set local role anon;

select throws_ok(
  $$select * from public.get_current_member_roundup_preferences()$$,
  '42501',
  null,
  'A Visitor cannot inspect roundup preferences'
);
select throws_ok(
  $$
    select * from public.save_current_member_roundup_preferences(
      array['reykjavik'],
      array[]::text[],
      'is',
      false
    )
  $$,
  '42501',
  null,
  'A Visitor cannot create roundup preferences'
);
select throws_ok(
  $$select * from public.get_current_member_weekly_roundup()$$,
  '42501',
  null,
  'A Visitor cannot inspect a Member weekly roundup'
);

reset role;

select * from finish();

rollback;
