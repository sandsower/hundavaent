begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_function(
  'public',
  'get_moderation_place_review_v2',
  array['uuid'],
  'The combined moderation review projection exists'
);

select ok(
  pg_get_function_result('public.get_moderation_place_review_v2(uuid)'::regprocedure)
    like '%candidate_status text%'
  and pg_get_function_result('public.get_moderation_place_review_v2(uuid)'::regprocedure)
    like '%draft_payload jsonb%'
  and pg_get_function_result('public.get_moderation_place_review_v2(uuid)'::regprocedure)
    like '%readiness_state text%'
  and pg_get_function_result('public.get_moderation_place_review_v2(uuid)'::regprocedure)
    like '%wheelchair_accessibility text%',
  'The combined review preserves workbench and wheelchair fields'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_moderation_place_review_v2(uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.get_moderation_place_review_v2(uuid)',
    'execute'
  ),
  'Only authenticated callers can invoke the combined review projection'
);

select * from finish();

rollback;
