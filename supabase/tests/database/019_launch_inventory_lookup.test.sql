begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_function(
  'public',
  'get_moderation_place_by_lead_id',
  array['text'],
  'Launch-inventory ingestion has one lead-id lookup function'
);

select ok(
  not has_function_privilege('anon', 'public.get_moderation_place_by_lead_id(text)', 'execute'),
  'Anonymous callers cannot execute the lead-id lookup'
);

select ok(
  not has_function_privilege('service_role', 'public.get_moderation_place_by_lead_id(text)', 'execute'),
  'The service role cannot execute the lead-id lookup - it must run as an authenticated Moderator'
);

select ok(
  has_function_privilege('authenticated', 'public.get_moderation_place_by_lead_id(text)', 'execute'),
  'Authenticated callers can reach the role-enforced lookup boundary'
);

insert into auth.users (id)
values
  ('73000000-0000-4000-8000-000000000001'),
  ('73000000-0000-4000-8000-000000000002');

insert into security.role_grants (user_id, role)
values ('73000000-0000-4000-8000-000000000001', 'moderator');

select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select throws_ok(
  $$ select public.get_moderation_place_by_lead_id('any-lead') $$,
  '42501',
  'Moderator role required',
  'A non-Moderator cannot use the lead-id lookup'
);

reset role;

select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select throws_ok(
  $$ select public.get_moderation_place_by_lead_id('') $$,
  '22023',
  'Lead identifier is required',
  'An empty lead identifier is rejected'
);

select is(
  (select public.get_moderation_place_by_lead_id('no-such-lead-was-ever-ingested')),
  null::uuid,
  'A leadId with no matching Evidence returns null, not an error'
);

select lives_ok(
  $$
    select *
    from public.create_candidate_place(
      '{
        "operator":{"name":"Launch-inventory lookup fixture operator"},
        "location":{
          "address_line":"Uppflettigata 1",
          "locality":"Reykjavík",
          "postal_code":"101",
          "municipality":"reykjavik",
          "latitude":64.1466,
          "longitude":-21.9426,
          "geometry_precision":"official_address_point",
          "geometry_source":"HMS Staðfangaskrá fixture coordinate"
        },
        "category":"cafe",
        "website_url":null,
        "phone":null,
        "opening_hours":{},
        "translations":{
          "is":{"name":"Uppflettistaður","description":"Íslensk lýsing."},
          "en":{"name":"Lookup fixture place","description":"English description."}
        },
        "evidence_records":[{
          "kind":"other",
          "source_url":"https://example.invalid/launch-inventory-lookup-fixture",
          "source_citation":null,
          "source_label":"Launch-inventory lookup fixture",
          "observed_at":"2026-07-12T10:00:00Z",
          "source_metadata":{"leadId":"pgtap-lookup-fixture"}
        }],
        "access_conditions":[{
          "access_area":"indoors",
          "restraint_condition":"leash_required",
          "dog_eligibility":{"scope":"all_dogs"},
          "availability_window":{},
          "permission_requirement":"standing_permission"
        }]
      }'::jsonb,
      '83000000-0000-4000-8000-000000000001'
    )
  $$,
  'A Moderator can create a Candidate carrying a leadId in Evidence source_metadata'
);

reset role;

select is(
  public.get_moderation_place_by_lead_id('pgtap-lookup-fixture'),
  (
    select place_record.id
    from private.places as place_record
    where place_record.created_by = '73000000-0000-4000-8000-000000000001'
  ),
  'The lookup finds the Place that carries a matching leadId in its Evidence'
);

select * from finish();

rollback;
