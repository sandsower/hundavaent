begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select has_function(
  'public',
  'create_candidate_place',
  array['jsonb', 'uuid'],
  'Candidate creation has one structured command function'
);

select ok(
  not has_function_privilege('anon', 'public.create_candidate_place(jsonb,uuid)', 'execute'),
  'Anonymous callers cannot execute Candidate creation'
);

select ok(
  has_function_privilege('authenticated', 'public.create_candidate_place(jsonb,uuid)', 'execute'),
  'Authenticated callers can reach the role-enforced command boundary'
);

insert into auth.users (id)
values
  ('72000000-0000-4000-8000-000000000001'),
  ('72000000-0000-4000-8000-000000000002');

insert into security.role_grants (user_id, role)
values ('72000000-0000-4000-8000-000000000001', 'moderator');

select set_config(
  'request.jwt.claim.sub',
  '72000000-0000-4000-8000-000000000002',
  true
);

set local role authenticated;

select throws_ok(
  $$
    select *
    from public.create_candidate_place(
      '{}'::jsonb,
      '82000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'Moderator role required',
  'An authenticated non-Moderator cannot create a Candidate'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  '72000000-0000-4000-8000-000000000001',
  true
);

set local role authenticated;

select lives_ok(
  $$
    select *
    from public.create_candidate_place(
      '{
        "operator":{"name":"Hundavænt Candidate operator"},
        "location":{
          "address_line":"Tillögugata 7",
          "locality":"Reykjavík",
          "postal_code":"101",
          "municipality":"reykjavik",
          "latitude":64.1466,
          "longitude":-21.9426,
          "geometry_precision":"moderator_confirmed_point",
          "geometry_source":"Moderator-confirmed Candidate creation fixture"
        },
        "category":"restaurant",
        "website_url":"https://example.invalid/candidate",
        "phone":"+354 555 0107",
        "opening_hours":{},
        "translations":{
          "is":{"name":"Tillögustaður","description":"Íslensk lýsing."},
          "en":{"name":"Candidate venue","description":"English description."}
        },
        "evidence":{
          "kind":"official_website",
          "source_url":"https://example.invalid/candidate/dog-access",
          "source_label":"Official Candidate website",
          "observed_at":"2026-07-09T10:00:00Z",
          "source_metadata":{}
        },
        "access_condition":{
          "access_area":"outdoors",
          "restraint_condition":"leash_required",
          "dog_eligibility":{"scope":"all_dogs"},
          "availability_window":{},
          "permission_requirement":"standing_permission"
        }
      }'::jsonb,
      '82000000-0000-4000-8000-000000000002'
    )
  $$,
  'A Moderator can create a complete Candidate atomically'
);

reset role;

select is(
  (
    select count(*)
    from private.places
    where created_by = '72000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'Candidate creation inserts one Place'
);

select is(
  (
    select lifecycle::text
    from private.places
    where created_by = '72000000-0000-4000-8000-000000000001'
  ),
  'candidate'::text,
  'The new Place starts in Candidate lifecycle'
);

select is(
  (
    select version
    from private.places
    where created_by = '72000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'The new Candidate starts at optimistic version one'
);

select is(
  (
    select created_by
    from private.places
    where created_by = '72000000-0000-4000-8000-000000000001'
  ),
  '72000000-0000-4000-8000-000000000001'::uuid,
  'The Place actor comes from the Moderator JWT'
);

select ok(
  (
    select private.is_capital_region_municipality(location_record.municipality)
      and location_record.geometry_precision = 'moderator_confirmed_point'
      and location_record.geometry_source = 'Moderator-confirmed Candidate creation fixture'
    from private.locations as location_record
    join private.places as place_record on place_record.location_id = location_record.id
    where place_record.created_by = '72000000-0000-4000-8000-000000000001'
  ),
  'Candidate creation persists a capital-region Location with explicit geometry quality'
);

select is(
  (
    select count(*)
    from private.place_translations as translation
    join private.places as place_record on place_record.id = translation.place_id
    where place_record.created_by = '72000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'Candidate creation requires both public translations'
);

select is(
  (
    select recorded_by
    from private.evidence
    where recorded_by = '72000000-0000-4000-8000-000000000001'
  ),
  '72000000-0000-4000-8000-000000000001'::uuid,
  'Evidence records the Moderator actor'
);

select ok(
  (
    select
      created_by = '72000000-0000-4000-8000-000000000001'::uuid
      and access_area = 'outdoors'::private.access_area
      and restraint_condition = 'leash_required'::private.restraint_condition
      and dog_eligibility = '{"scope":"all_dogs"}'::jsonb
      and availability_window = '{}'::jsonb
      and permission_requirement = 'standing_permission'::private.permission_requirement
    from private.access_conditions
    where created_by = '72000000-0000-4000-8000-000000000001'
  ),
  'Candidate creation retains the complete structured Access Condition'
);

select is(
  (
    select count(*)
    from private.verifications as verification
    join private.access_conditions as access_condition
      on access_condition.id = verification.access_condition_id
    where access_condition.created_by = '72000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'Candidate creation never creates a Verification'
);

select ok(
  (
    select
      actor_id = '72000000-0000-4000-8000-000000000001'::uuid
      and action = 'place.candidate_created'
      and subject_type = 'place'
      and request_id = '82000000-0000-4000-8000-000000000002'::uuid
      and change_summary ->> 'version' = '1'
    from private.audit_events
    where request_id = '82000000-0000-4000-8000-000000000002'
  ),
  'Candidate creation appends a safe actor-derived Audit Event'
);

select * from finish();

rollback;
