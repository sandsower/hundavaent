begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

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
  'The versioned profile keeps the bounded access-information field during rollout'
);

select ok(
  position('''[]''::jsonb' in pg_get_functiondef(
    'public.get_published_place_profile_v2(uuid,text)'::regprocedure
  )) > 0
  and position('jsonb_agg(source_url' in pg_get_functiondef(
    'public.get_published_place_profile_v2(uuid,text)'::regprocedure
  )) = 0,
  'The public profile keeps Evidence source URLs out of visitor-facing links'
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
  not exists (
    select 1
    from (
      values
        ('private.create_candidate_place_pre_geometry(jsonb,uuid)'::regprocedure),
        ('private.create_suggestion_candidate(jsonb,uuid,uuid,uuid,uuid)'::regprocedure),
        ('public.resolve_access_dispute(jsonb,uuid)'::regprocedure),
        ('public.resolve_place_flag(uuid,text,bigint,bigint,text,text,text,jsonb,jsonb,jsonb,uuid)'::regprocedure)
    ) as writer(procedure_id)
    where position('availability_state' in pg_get_functiondef(writer.procedure_id)) = 0
      or position('resolve_access_availability' in pg_get_functiondef(writer.procedure_id)) = 0
  ),
  'Every Access Condition writer inserts resolved timing state directly'
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

select is(
  (select count(*) from pg_trigger
    where tgrelid = 'private.access_conditions'::regclass and not tgisinternal),
  0::bigint,
  'Access timing has no table-wide trigger or hidden insert bridge'
);

select is(
  (select provolatile::text from pg_proc
    where oid = 'private.resolve_access_availability(jsonb)'::regprocedure),
  'i',
  'Availability defaulting is a pure immutable resolver'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.create_candidate_place_pre_geometry(jsonb,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.create_suggestion_candidate(jsonb,uuid,uuid,uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.resolve_access_availability(jsonb)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.validate_access_condition_value(jsonb)',
    'execute'
  ),
  'Private writer and validation primitives preserve their restricted ACLs'
);

select * from finish();

rollback;
