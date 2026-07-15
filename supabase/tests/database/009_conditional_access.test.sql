begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

insert into auth.users (id) values ('74000000-0000-4000-8000-000000000001');
insert into security.role_grants (user_id, role)
values ('74000000-0000-4000-8000-000000000001', 'moderator');

select set_config('request.jwt.claim.sub', '74000000-0000-4000-8000-000000000001', true);
set local role authenticated;

create temporary table conditional_candidate as
select * from public.create_candidate_place(
  '{
    "operator":{"name":"Conditional access operator"},
    "location":{"address_line":"Skilyrðagata 10","locality":"Reykjavík","postal_code":"101","municipality":"reykjavik","latitude":64.1466,"longitude":-21.9426,"geometry_precision":"moderator_confirmed_point","geometry_source":"Moderator-confirmed conditional-access fixture"},
    "category":"cafe",
    "opening_hours":{"monday":["09:00-18:00"]},
    "dog_amenities":["water_bowl"],
    "translations":{"is":{"name":"Skilyrðastaður","description":"Tvö ólík aðgangsskilyrði."},"en":{"name":"Conditional Place","description":"Two distinct access conditions."}},
    "evidence_records":[
      {"kind":"official_website","source_url":"https://example.invalid/indoor","source_label":"Indoor policy","observed_at":"2026-07-09T10:00:00Z"},
      {"kind":"public_record","source_citation":"Outdoor rule 4","source_label":"Outdoor policy","observed_at":"2026-07-08T10:00:00Z"}
    ],
    "access_conditions":[
      {"access_area":"indoors","restraint_condition":"carrier_required","dog_eligibility":{"scope":"restricted","maximumWeightKg":10},"availability_state":"limited","availability_window":{"days":[1,2,3,4,5],"endsAt":"17:00","startsOn":"2026-06-01","endsOn":"2026-08-31"},"permission_requirement":"standing_permission"},
      {"access_area":"outdoors","restraint_condition":"leash_required","dog_eligibility":{"scope":"all_dogs"},"availability_state":"not_stated","availability_window":{},"permission_requirement":"ask_on_arrival"}
    ]
  }'::jsonb,
  '84000000-0000-4000-8000-000000000001'
);

reset role;

select is(
  (select count(*) from private.access_conditions where place_id = (select place_id from conditional_candidate)),
  2::bigint,
  'Candidate creation retains multiple Access Conditions'
);

select is(
  (select dog_amenities from private.places where id = (select place_id from conditional_candidate)),
  '["water_bowl"]'::jsonb,
  'Dog Amenities remain factual Place data'
);

insert into private.evidence (place_id, kind, source_url, source_label, observed_at)
values (
  (select place_id from conditional_candidate), 'member_report',
  'https://example.invalid/contradiction', 'Contradictory unverified report', '2026-07-10T10:00:00Z'
);

create temporary table condition_ids as
select id, access_area::text area
from private.access_conditions
where place_id = (select place_id from conditional_candidate);

create temporary table evidence_ids as
select id, source_label
from private.evidence
where place_id = (select place_id from conditional_candidate);

grant select on condition_ids, evidence_ids, conditional_candidate to authenticated;

set local role authenticated;

select is(
  (select evidence_record - 'id'
   from public.get_moderation_place_review((select place_id from conditional_candidate)) review,
     jsonb_array_elements(review.evidence_records) evidence_record
   where evidence_record ->> 'sourceLabel' = 'Indoor policy'),
  jsonb_build_object(
    'kind', 'official_website',
    'sourceUrl', 'https://example.invalid/indoor',
    'sourceCitation', null,
    'sourceLabel', 'Indoor policy',
    'observedAt', '2026-07-09T10:00:00Z'::timestamptz
  ),
  'Moderation review retains complete Evidence provenance for condition mapping'
);

select throws_ok(
  format(
    'select * from public.verify_and_publish_place(%L::jsonb, %L::uuid)',
    jsonb_build_object(
      'place_id', (select place_id from conditional_candidate),
      'expected_version', 1,
      'condition_verifications', jsonb_build_array(
        jsonb_build_object(
          'access_condition_id', (select id from condition_ids where area = 'indoors'),
          'evidence_ids', jsonb_build_array((select id from evidence_ids where source_label = 'Indoor policy'))
        )
      ),
      'freshness_until', '2099-01-01T00:00:00Z'
    )::text,
    '84000000-0000-4000-8000-000000000003'
  ),
  '22023', null,
  'Publication rejects a strict subset of current Access Conditions'
);

reset role;

select is(
  (select count(*) from private.verifications verification_record
    join private.access_conditions condition_record on condition_record.id = verification_record.access_condition_id
    where condition_record.place_id = (select place_id from conditional_candidate)),
  0::bigint,
  'Rejected subset publication leaves no partial Verifications'
);

select is(
  (select lifecycle::text from private.places where id = (select place_id from conditional_candidate)),
  'candidate'::text,
  'Rejected subset publication leaves the Place private as a Candidate'
);

set local role authenticated;

select lives_ok(
  format(
    'select * from public.verify_and_publish_place(%L::jsonb, %L::uuid)',
    jsonb_build_object(
      'place_id', (select place_id from conditional_candidate),
      'expected_version', 1,
      'condition_verifications', jsonb_build_array(
        jsonb_build_object(
          'access_condition_id', (select id from condition_ids where area = 'indoors'),
          'evidence_ids', jsonb_build_array((select id from evidence_ids where source_label = 'Indoor policy'))
        ),
        jsonb_build_object(
          'access_condition_id', (select id from condition_ids where area = 'outdoors'),
          'evidence_ids', jsonb_build_array((select id from evidence_ids where source_label = 'Outdoor policy'))
        )
      ),
      'freshness_until', '2099-01-01T00:00:00Z'
    )::text,
    '84000000-0000-4000-8000-000000000002'
  ),
  'A Moderator atomically verifies multiple conditions with explicit Evidence mappings'
);

reset role;

select is(
  (select access_condition_count from public.list_published_places('en') where place_id = (select place_id from conditional_candidate)),
  2::bigint,
  'Public discovery reports the complete condition count'
);

select is(
  (select simple_access_summary from public.list_published_places('en') where place_id = (select place_id from conditional_candidate)),
  false,
  'A complex or multiple-condition summary cannot imply it includes every restriction'
);

select is(
  (select access_conditions from public.list_published_places('en') where place_id = (select place_id from conditional_candidate)),
  '[
    {"accessArea":"indoors","restraintCondition":"carrier_required","permissionRequirement":"standing_permission","dogEligibility":{"scope":"restricted","maximumWeightKg":10},"availabilityState":"limited","availabilityWindow":{"days":[1,2,3,4,5],"endsAt":"17:00","endsOn":"2026-08-31","startsOn":"2026-06-01"}},
    {"accessArea":"outdoors","restraintCondition":"leash_required","permissionRequirement":"ask_on_arrival","dogEligibility":{"scope":"all_dogs"},"availabilityState":"not_stated","availabilityWindow":{}}
  ]'::jsonb,
  'A multi-condition Place exposes correlated verified condition dimensions for discovery matching'
);

select is(
  (select jsonb_build_array(access_area, restraint_condition, permission_requirement)
   from public.list_published_places('en') where place_id = (select place_id from conditional_candidate)),
  '[null,null,null]'::jsonb,
  'Multi-condition discovery dimensions do not create a misleading concise summary'
);

select is(
  (select count(*) from public.get_published_place_profile((select place_id from conditional_candidate), 'en')),
  2::bigint,
  'The public floating-card projection contains every verified condition'
);

select is(
  (select access_information_urls
   from public.get_published_place_profile((select place_id from conditional_candidate), 'en')
   where access_area = 'indoors'),
  '["https://example.invalid/indoor"]'::jsonb,
  'Indoor access exposes its relevant access-information link'
);

select is(
  (select access_information_urls
   from public.get_published_place_profile((select place_id from conditional_candidate), 'en')
   where access_area = 'outdoors'),
  '[]'::jsonb,
  'A condition without a public link does not expose internal provenance'
);

select ok(
  not exists (
    select 1 from public.get_published_place_profile((select place_id from conditional_candidate), 'en') profile,
      jsonb_array_elements_text(profile.access_information_urls) access_url
    where access_url = 'https://example.invalid/contradiction'
  ),
  'An unreviewed contradictory link remains private'
);

select throws_ok(
  $$
    insert into private.places (operator_id, location_id, purpose, category, dog_amenities)
    select operator_id, location_id, 'invalid_amenity', category, '["water",42]'::jsonb
    from private.places limit 1
  $$,
  '23514', null,
  'Dog Amenities reject non-string values'
);

select throws_ok(
  $$
    insert into private.access_conditions (
      place_id, access_area, restraint_condition, dog_eligibility, availability_window, permission_requirement
    ) values (
      (select place_id from conditional_candidate), 'indoors', 'leash_required',
      '{"scope":"restricted","maximumDogs":1.5}'::jsonb,
      '{"days":[0,8],"startsOn":"2026-02-30"}'::jsonb, 'standing_permission'
    )
  $$,
  '23514', null,
  'Malformed eligibility and availability cannot persist'
);

select throws_ok(
  $$
    insert into private.access_conditions (
      place_id, access_area, restraint_condition, dog_eligibility, availability_window, permission_requirement
    ) values (
      (select place_id from conditional_candidate), 'other_bounded', 'other_sourced',
      '{"scope":"all_dogs"}'::jsonb, '{}'::jsonb, 'standing_permission'
    )
  $$,
  '23514', null,
  'Other bounded and sourced values require their explicit source text'
);

select throws_ok(
  $$
    insert into private.access_conditions (
      place_id, access_area, restraint_condition, dog_eligibility, availability_window, permission_requirement
    ) values (
      (select place_id from conditional_candidate), 'indoors', 'leash_required',
      '{"scope":"all_dogs","maximumDogs":1}'::jsonb, '{}'::jsonb, 'standing_permission'
    )
  $$,
  '23514', null,
  'All-dogs eligibility cannot carry a hidden limit'
);

select throws_ok(
  $$
    insert into private.access_conditions (
      place_id, access_area, restraint_condition, dog_eligibility, availability_window, permission_requirement
    ) values (
      (select place_id from conditional_candidate), 'indoors', 'leash_required',
      '{"scope":"restricted"}'::jsonb, '{}'::jsonb, 'standing_permission'
    )
  $$,
  '23514', null,
  'Restricted eligibility requires at least one sourced restriction'
);

select throws_ok(
  $$
    insert into private.access_conditions (
      place_id, access_area, restraint_condition, dog_eligibility, availability_window, permission_requirement
    ) values (
      (select place_id from conditional_candidate), 'indoors', 'leash_required',
      '{"scope":"restricted","maximumDogs":1,"unknown":true}'::jsonb,
      '{}'::jsonb, 'standing_permission'
    )
  $$,
  '23514', null,
  'Eligibility rejects unknown keys'
);

select throws_ok(
  $$
    insert into private.access_conditions (
      place_id, access_area, restraint_condition, dog_eligibility, availability_window, permission_requirement
    ) values (
      (select place_id from conditional_candidate), 'outdoors', 'leash_required',
      '{"scope":"all_dogs"}'::jsonb, '{"days":[]}'::jsonb, 'standing_permission'
    )
  $$,
  '23514', null,
  'An otherwise valid Availability Window rejects an empty weekday list'
);

select throws_ok(
  $$
    insert into private.access_conditions (
      place_id, access_area, restraint_condition, dog_eligibility, availability_window, permission_requirement
    ) values (
      (select place_id from conditional_candidate), 'indoors', 'leash_required',
      '{"scope":"all_dogs"}'::jsonb,
      '{"startsOn":"2026-09-01","endsOn":"2026-06-01","unknown":true}'::jsonb,
      'standing_permission'
    )
  $$,
  '23514', null,
  'Availability rejects inverted dates and unknown keys'
);

select * from finish();

rollback;
