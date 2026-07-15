begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

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
    in pg_get_function_result('public.list_published_places(text)'::regprocedure)
  ) > 0,
  'The compact directory exposes structured access conditions'
);

select ok(
  position(
    'verified_at'
    in pg_get_function_result('public.list_published_places(text)'::regprocedure)
  ) = 0,
  'The compact directory does not expose public verification timestamps'
);

select ok(
  position(
    'access_information_urls jsonb'
    in pg_get_function_result('public.get_published_place_profile(uuid,text)'::regprocedure)
  ) > 0,
  'The profile exposes deduplicated access-information links'
);

select ok(
  position(
    'evidence_sources'
    in pg_get_function_result('public.get_published_place_profile(uuid,text)'::regprocedure)
  ) = 0,
  'The profile does not expose the internal Evidence contract'
);

select * from finish();

rollback;
