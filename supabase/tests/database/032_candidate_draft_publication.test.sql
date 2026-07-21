begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

insert into auth.users (id, email)
values ('93200000-0000-4000-8000-000000000001', 'draft-publication@example.invalid');

insert into security.role_grants (user_id, role)
values ('93200000-0000-4000-8000-000000000001', 'moderator');

insert into private.operators (id, name)
values ('93210000-0000-4000-8000-000000000001', 'Shared operator');

insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude,
  geometry_precision, geometry_source
)
values (
  '93220000-0000-4000-8000-000000000001', 'Originalgata 1', 'Reykjavik', '101',
  'reykjavik', 64.1466, -21.9426, 'moderator_confirmed_point', 'Original fixture'
);

insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, version, created_by
)
values
  (
    '93230000-0000-4000-8000-000000000001',
    '93210000-0000-4000-8000-000000000001',
    '93220000-0000-4000-8000-000000000001',
    'dog_access_destination', 'candidate', 'cafe', 1,
    '93200000-0000-4000-8000-000000000001'
  ),
  (
    '93230000-0000-4000-8000-000000000002',
    '93210000-0000-4000-8000-000000000001',
    '93220000-0000-4000-8000-000000000001',
    'shared_sibling', 'candidate', 'cafe', 1,
    '93200000-0000-4000-8000-000000000001'
  );

insert into private.place_translations (place_id, locale, name, description)
values
  ('93230000-0000-4000-8000-000000000001', 'is', 'Upprunalegur', 'Upprunaleg lýsing'),
  ('93230000-0000-4000-8000-000000000001', 'en', 'Original', 'Original description'),
  ('93230000-0000-4000-8000-000000000002', 'is', 'Systkini', 'Óbreytt'),
  ('93230000-0000-4000-8000-000000000002', 'en', 'Sibling', 'Unchanged');

insert into private.access_conditions (
  id, place_id, access_area, restraint_condition, dog_eligibility,
  availability_state, availability_window, permission_requirement, created_by
)
values (
  '93240000-0000-4000-8000-000000000001',
  '93230000-0000-4000-8000-000000000001',
  'indoors', 'leash_required', '{"scope":"all_dogs"}', 'not_stated', '{}',
  'ask_on_arrival', '93200000-0000-4000-8000-000000000001'
);

insert into private.evidence (
  id, place_id, kind, source_url, source_label, observed_at, recorded_by
)
values (
  '93250000-0000-4000-8000-000000000001',
  '93230000-0000-4000-8000-000000000001',
  'official_website', 'https://example.invalid/original', 'Original source',
  '2026-07-01T00:00:00Z', '93200000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub', '93200000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (
    select draft_version
    from public.save_candidate_place_moderation_draft(
      '93230000-0000-4000-8000-000000000001', 1, 0, 'identity-and-access',
      '{
        "operator":{"name":"Edited operator"},
        "location":{"address_line":"Editedgata 2","geometry_source":"Moderator edit"},
        "category":"restaurant",
        "website_url":"https://example.invalid/edited",
        "phone":"555-0101",
        "translations":{
          "is":{"name":"Breyttur","description":"Breytt lýsing"},
          "en":{"name":"Edited","description":"Edited description"}
        },
        "access_conditions":[
          {
            "id":"93240000-0000-4000-8000-000000000001",
            "access_area":"indoors",
            "access_area_note":null,
            "restraint_condition":"leash_required",
            "restraint_note":null,
            "dog_eligibility":{"scope":"all_dogs"},
            "availability_state":"not_stated",
            "availability_window":{},
            "permission_requirement":"standing_permission"
          },
          {
            "access_area":"outdoors",
            "access_area_note":null,
            "restraint_condition":"off_leash_permitted",
            "restraint_note":null,
            "dog_eligibility":{"scope":"all_dogs"},
            "availability_state":"not_stated",
            "availability_window":{},
            "permission_requirement":"standing_permission"
          }
        ],
        "evidence_records":[
          {
            "id":"93250000-0000-4000-8000-000000000001",
            "kind":"official_website",
            "source_url":"https://example.invalid/edited",
            "source_citation":null,
            "source_label":"Edited source",
            "observed_at":"2026-07-15T00:00:00Z",
            "source_metadata":{}
          },
          {
            "kind":"public_record",
            "source_url":null,
            "source_citation":"Rule 7",
            "source_label":"New source",
            "observed_at":"2026-07-16T00:00:00Z",
            "source_metadata":{}
          }
        ]
      }'::jsonb,
      '93260000-0000-4000-8000-000000000001'
    )
  ),
  1::bigint,
  'A partial section edit creates Candidate draft version one'
);

reset role;

select ok(
  (
    select payload ?& array[
      'operator', 'location', 'category', 'website_url', 'phone', 'opening_hours',
      'dog_amenities', 'translations', 'access_conditions', 'evidence_records'
    ]
      and jsonb_array_length(payload -> 'access_conditions') = 2
      and jsonb_array_length(payload -> 'evidence_records') = 2
      and (payload #>> '{access_conditions,1,id}') is not null
      and (payload #>> '{evidence_records,1,id}') is not null
    from private.moderation_drafts
    where candidate_place_id = '93230000-0000-4000-8000-000000000001'
  ),
  'The saved draft is a complete normalized snapshot with stable child IDs'
);

select is(
  (select name from private.operators where id = '93210000-0000-4000-8000-000000000001'),
  'Shared operator',
  'Saving a draft does not mutate normalized Place data'
);

create temporary table draft_publication_command as
select jsonb_build_object(
  'place_id', '93230000-0000-4000-8000-000000000001',
  'expected_version', 1,
  'expected_item_version', 1,
  'expected_draft_version', 1,
  'condition_verifications', (
    select jsonb_agg(jsonb_build_object(
      'access_condition_id', condition_value ->> 'id',
      'evidence_ids', jsonb_build_array(
        draft.payload #>> '{evidence_records,0,id}',
        draft.payload #>> '{evidence_records,1,id}'
      )
    ) order by condition_value ->> 'id')
    from jsonb_array_elements(draft.payload -> 'access_conditions') condition_value
  ),
  'freshness_until', '2099-01-01T00:00:00Z',
  'decision_metadata', jsonb_build_object('source', 'moderation-workbench')
) payload
from private.moderation_drafts draft
where draft.candidate_place_id = '93230000-0000-4000-8000-000000000001';

grant select on draft_publication_command to authenticated;

set local role authenticated;

select throws_ok(
  $$
    select *
    from public.verify_and_publish_place(
      jsonb_set((select payload from draft_publication_command), '{expected_version}', '2'),
      '93260000-0000-4000-8000-000000000002'
    )
  $$,
  '40001',
  'Place version conflict',
  'A stale Place version rejects the publication transaction'
);

reset role;

select is(
  (select name from private.operators where id = '93210000-0000-4000-8000-000000000001'),
  'Shared operator',
  'A failed publication rolls back draft materialization'
);

set local role authenticated;

create temporary table first_publication as
select *
from public.verify_and_publish_place(
  (select payload from draft_publication_command),
  '93260000-0000-4000-8000-000000000003'
);

select results_eq(
  $$ select version, cardinality(verification_ids) from first_publication $$,
  $$ values (2::bigint, 2) $$,
  'Publishing materializes the full draft and increments the Place version once'
);

select results_eq(
  $$
    select version, published_at
    from public.verify_and_publish_place(
      (select payload from draft_publication_command),
      '93260000-0000-4000-8000-000000000003'
    )
  $$,
  $$ select version, published_at from first_publication $$,
  'An exact publication retry returns the original result without duplicate effects'
);

reset role;

select results_eq(
  $$
    select place.lifecycle::text, place.category::text, place.website_url, place.phone,
      operator.name, location.address_line, location.geometry_source,
      translation.name
    from private.places place
    join private.operators operator on operator.id = place.operator_id
    join private.locations location on location.id = place.location_id
    join private.place_translations translation
      on translation.place_id = place.id and translation.locale = 'en'
    where place.id = '93230000-0000-4000-8000-000000000001'
  $$,
  $$ values (
    'published'::text, 'restaurant'::text, 'https://example.invalid/edited'::text,
    '555-0101'::text, 'Edited operator'::text, 'Editedgata 2'::text,
    'Moderator edit'::text, 'Edited'::text
  ) $$,
  'Publication applies edited identity, location, contact, and translation fields'
);

select is(
  (select name from private.operators where id = '93210000-0000-4000-8000-000000000001'),
  'Shared operator',
  'Copy-on-write leaves the sibling Place operator unchanged'
);

select is(
  (
    select location.address_line
    from private.places place
    join private.locations location on location.id = place.location_id
    where place.id = '93230000-0000-4000-8000-000000000002'
  ),
  'Originalgata 1',
  'Copy-on-write leaves the sibling Place location unchanged'
);

select is(
  (
    select count(*)
    from private.access_conditions
    where place_id = '93230000-0000-4000-8000-000000000001'
      and superseded_at is null
  ),
  2::bigint,
  'Publication reconciles the complete current Access Condition set'
);

select is(
  (
    select count(*)
    from private.evidence
    where place_id = '93230000-0000-4000-8000-000000000001'
      and source_label in ('Edited source', 'New source')
  ),
  2::bigint,
  'Publication reconciles edited and newly added Evidence'
);

select is(
  (
    select count(*)
    from private.verifications verification
    join private.access_conditions condition on condition.id = verification.access_condition_id
    where condition.place_id = '93230000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'An idempotent retry creates no duplicate Verifications'
);

select * from finish();

rollback;
