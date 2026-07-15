begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

select has_column(
  'private',
  'access_conditions',
  'availability_state',
  'Access Conditions record timing explicitly'
);

select col_type_is(
  'private',
  'access_conditions',
  'availability_state',
  'private.access_availability',
  'Timing uses the bounded availability vocabulary'
);

select is(
  (select array_agg(enumlabel::text order by enumsortorder)
   from pg_enum
   where enumtypid = 'private.access_availability'::regtype),
  array['whenever_open', 'limited', 'not_stated']::text[],
  'Timing has exactly the three approved states'
);

select ok(
  position(
    'access_conditions jsonb'
    in pg_get_function_result('public.list_published_places_v2(text)'::regprocedure)
  ) > 0,
  'The compact directory exposes structured access conditions'
);

select ok(
  position(
    'verified_at'
    in pg_get_function_result('public.list_published_places(text)'::regprocedure)
  ) > 0,
  'The v1 directory contract remains available during migrate-before-deploy rollout'
);

select ok(
  position(
    'access_information_urls jsonb'
    in pg_get_function_result('public.get_published_place_profile_v2(uuid,text)'::regprocedure)
  ) > 0,
  'The profile exposes deduplicated access-information links'
);

select ok(
  position(
    'evidence_sources'
    in pg_get_function_result('public.get_published_place_profile(uuid,text)'::regprocedure)
  ) > 0,
  'The v1 profile contract remains available during migrate-before-deploy rollout'
);

select has_function('public', 'list_published_places_v2', array['text'],
  'The compact directory is released as a versioned RPC');

select has_function('public', 'get_published_place_profile_v2', array['uuid', 'text'],
  'The compact profile is released as a versioned RPC');

select ok(
  position('row_number()' in pg_get_functiondef(
    'public.create_candidate_place(jsonb,uuid)'::regprocedure
  )) = 0,
  'Candidate timing is not paired to rows after insertion'
);

select ok(
  position('set_access_availability_queue' in pg_get_functiondef(
    'public.create_candidate_place(jsonb,uuid)'::regprocedure
  )) > 0
  and position('set_access_availability_queue' in pg_get_functiondef(
    'private.create_suggestion_candidate(jsonb,uuid,uuid,uuid,uuid)'::regprocedure
  )) > 0,
  'Candidate and suggestion writers assign timing in insertion order'
);

select throws_ok(
  $$select private.resolve_access_availability(
    '{"availability_state":"not_stated","availability_window":{"days":[1]}}'::jsonb
  )$$,
  '22023',
  'Access timing state is invalid',
  'Not-stated timing cannot carry a window'
);

select throws_ok(
  $$select private.resolve_access_availability(
    '{"availability_state":"limited","availability_window":{}}'::jsonb
  )$$,
  '22023',
  'Access timing state is invalid',
  'Limited timing requires a window'
);

select is(
  private.resolve_access_availability(
    '{"availability_state":"whenever_open","availability_window":{}}'::jsonb
  )::text,
  'whenever_open',
  'Whenever-open timing remains distinct from not stated'
);

select ok(
  position('availabilityWindow' in pg_get_functiondef(
    'public.list_published_places_v2(text)'::regprocedure
  )) = 0
  and position('dogEligibility''' in pg_get_functiondef(
    'public.list_published_places_v2(text)'::regprocedure
  )) = 0,
  'The compact directory does not carry profile-only windows or eligibility objects'
);

select ok(
  position('dogEligibilityState' in pg_get_functiondef(
    'public.list_published_places_v2(text)'::regprocedure
  )) > 0
  and position('availabilityState' in pg_get_functiondef(
    'public.list_published_places_v2(text)'::regprocedure
  )) > 0,
  'The compact directory carries only bounded eligibility and timing states'
);

select ok(
  position('availability_state' in pg_get_functiondef(
    'private.validate_access_condition_value(jsonb)'::regprocedure
  )) > 0,
  'Correction validation accepts and preserves explicit timing state'
);

select ok(
  position('not_stated' in pg_get_constraintdef((
      select oid from pg_constraint
      where conname = 'access_availability_consistency_check'
    ))) > 0
  and position('availability_window = ''{}''::jsonb' in pg_get_constraintdef((
      select oid from pg_constraint
      where conname = 'access_availability_consistency_check'
    ))) > 0,
  'The table constraint rejects windows on not-stated timing'
);

select private.set_access_availability_queue('[
  {"availability_state":"whenever_open","availability_window":{}},
  {"availability_state":"limited","availability_window":{"days":[1]}}
]'::jsonb);

with target_place as (
  select id from private.places order by id limit 1
), inserted as (
  insert into private.access_conditions (
    place_id, revision, access_area, restraint_condition, dog_eligibility,
    availability_window, permission_requirement
  )
  select target_place.id, 901 + input.ordinal, input.access_area::private.access_area,
    'leash_required', '{"scope":"all_dogs"}'::jsonb, input.availability_window,
    'standing_permission'
  from target_place
  cross join (values
    (1, 'indoors', '{}'::jsonb),
    (2, 'outdoors', '{"days":[1]}'::jsonb)
  ) input(ordinal, access_area, availability_window)
  order by input.ordinal
  returning access_area::text, availability_state::text
)
select is(
  (select jsonb_object_agg(access_area, availability_state) from inserted),
  '{"indoors":"whenever_open","outdoors":"limited"}'::jsonb,
  'A multi-condition insert assigns each timing state atomically in input order'
);

select private.set_access_availability_queue('[
  {"availability_state":"not_stated","availability_window":{}},
  {"availability_state":"whenever_open","availability_window":{}}
]'::jsonb);

with target_place as (
  select id from private.places order by id limit 1
), inserted as (
  insert into private.access_conditions (
    place_id, revision, access_area, restraint_condition, dog_eligibility,
    availability_window, permission_requirement
  )
  select target_place.id, 903 + input.ordinal, input.access_area::private.access_area,
    'leash_required', '{"scope":"all_dogs"}'::jsonb, '{}'::jsonb,
    'standing_permission'
  from target_place
  cross join (values (1, 'indoors'), (2, 'outdoors')) input(ordinal, access_area)
  order by input.ordinal
  returning access_area::text, availability_state::text
)
select is(
  (select jsonb_object_agg(access_area, availability_state) from inserted),
  '{"indoors":"not_stated","outdoors":"whenever_open"}'::jsonb,
  'A repeated multi-condition insert does not leak or reorder timing state'
);

select * from finish();

rollback;
