begin;

create extension if not exists pgtap with schema extensions;

alter table private.locations alter column geometry_precision set default 'moderator_confirmed_point';
alter table private.locations alter column geometry_source set default 'Reviewed database test fixture';

select plan(92);

select has_function(
  'public',
  'configure_suggestion_abuse_policy',
  array['text', 'integer', 'integer', 'boolean'],
  'The abuse policy has one explicit configuration boundary'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.configure_suggestion_abuse_policy(text,integer,integer,boolean)',
    'execute'
  ),
  'Members cannot configure production abuse thresholds'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.configure_suggestion_abuse_policy(text,integer,integer,boolean)',
    'execute'
  ),
  'Only the service role can configure test or approved production policy values'
);

select has_function(
  'public',
  'submit_place_suggestion',
  array['jsonb', 'uuid'],
  'Members submit one structured private Suggestion command'
);

select has_function(
  'public',
  'list_my_place_suggestions',
  array['timestamp with time zone', 'uuid', 'integer'],
  'Members have one caller-scoped outcome projection'
);

select has_function(
  'public',
  'list_moderation_place_suggestions',
  array['integer', 'timestamp with time zone', 'uuid', 'integer'],
  'Moderators have one private queue projection'
);

select has_function(
  'public',
  'get_moderation_place_suggestion',
  array['uuid'],
  'Moderators fetch complete proposal details separately from the bounded queue'
);

select has_function(
  'public',
  'list_suggestion_place_matches',
  array['uuid'],
  'Moderators can inspect identity candidates without automatic merging'
);

select has_function(
  'public',
  'list_suggestion_place_matches_for_payload',
  array['jsonb'],
  'Moderators can refresh identity candidates against corrected proposal details'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.list_suggestion_place_matches_for_payload(jsonb)',
    'execute'
  ),
  'Anonymous callers cannot query corrected-proposal identity matches'
);

select has_function(
  'public',
  'resolve_place_suggestion',
  array[
    'uuid', 'text', 'bigint', 'bigint', 'text', 'text', 'text', 'jsonb',
    'uuid', 'uuid', 'uuid', 'boolean', 'uuid'
  ],
  'Moderators resolve Suggestions through one atomic command'
);

create function pg_temp.resolve_place_suggestion(
  requested_suggestion_id uuid,
  requested_outcome text,
  member_reason_is text,
  member_reason_en text,
  private_note text,
  reviewed_payload jsonb,
  requested_duplicate_place_id uuid,
  requested_operator_identity_place_id uuid,
  requested_location_identity_place_id uuid,
  confirm_useful boolean,
  command_request_id uuid
)
returns table (
  suggestion_id uuid,
  status text,
  candidate_place_id uuid,
  duplicate_place_id uuid,
  contribution_id uuid
)
language plpgsql
as $$
declare
  current_item_version bigint;
  current_draft_version bigint;
begin
  select detail.item_version, detail.draft_version
  into current_item_version, current_draft_version
  from public.get_moderation_place_suggestion(requested_suggestion_id) detail;

  if reviewed_payload is not null then
    select saved.draft_version into current_draft_version
    from public.save_place_suggestion_moderation_draft(
      requested_suggestion_id,
      current_item_version,
      current_draft_version,
      'proposal',
      reviewed_payload,
      gen_random_uuid()
    ) saved;
  end if;

  return query
  select * from public.resolve_place_suggestion(
    requested_suggestion_id,
    requested_outcome,
    current_item_version,
    current_draft_version,
    member_reason_is,
    member_reason_en,
    private_note,
    null,
    requested_duplicate_place_id,
    requested_operator_identity_place_id,
    requested_location_identity_place_id,
    confirm_useful,
    command_request_id
  );
end;
$$;

select has_function(
  'public',
  'confirm_suggestion_contribution',
  array['uuid', 'uuid'],
  'Contribution confirmation is a separate post-acceptance command'
);

select ok(
  not has_function_privilege('anon', 'public.submit_place_suggestion(jsonb,uuid)', 'execute'),
  'Anonymous callers cannot submit Suggestions'
);

select ok(
  has_function_privilege('authenticated', 'public.submit_place_suggestion(jsonb,uuid)', 'execute'),
  'Authenticated Members can reach the identity-enforced submission boundary'
);

insert into auth.users (id, email)
values
  ('75000000-0000-4000-8000-000000000001', 'member-one@example.invalid'),
  ('75000000-0000-4000-8000-000000000002', 'member-two@example.invalid'),
  ('75000000-0000-4000-8000-000000000003', 'suggestions-moderator@example.invalid');

insert into private.member_accounts (user_id)
values
  ('75000000-0000-4000-8000-000000000001'),
  ('75000000-0000-4000-8000-000000000002'),
  ('75000000-0000-4000-8000-000000000003');

insert into security.role_grants (user_id, role)
values
  ('75000000-0000-4000-8000-000000000001', 'member'),
  ('75000000-0000-4000-8000-000000000002', 'member'),
  ('75000000-0000-4000-8000-000000000003', 'member'),
  ('75000000-0000-4000-8000-000000000003', 'moderator');

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.submit_place_suggestion(
      '{"purpose":"dog_access_destination"}'::jsonb,
      '85000000-0000-4000-8000-000000000001'
    )
  $$,
  '55000',
  'Suggestion abuse policy is not configured',
  'Production submission fails closed while suggestion-abuse policy is unresolved'
);

reset role;
set local role service_role;
select public.configure_suggestion_abuse_policy('test-only-v1', 3600, 2, true);
reset role;

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.submit_place_suggestion(
      '{"purpose":"veterinary_clinic"}'::jsonb,
      '85000000-0000-4000-8000-000000000002'
    )
  $$,
  '22023',
  'Suggestion purpose is excluded pending excluded-purpose',
  'Excluded pet-service purposes are not approximated as service or other'
);

select ok(
  (
    select
      result.status = 'submitted'
      and result.qualifying_action_recorded
      and result.activated_current_week
    from public.submit_place_suggestion(
      '{
        "purpose":"dog_access_destination",
        "operator_name":"Hundavænt suggestion operator",
        "category":"cafe",
        "location":{
          "address_line":"Tillögugata 15",
          "locality":"Reykjavík",
          "postal_code":"101",
          "municipality":"reykjavik",
          "latitude":64.1466,
          "longitude":-21.9426
        },
        "translations":{
          "is":{"name":"Tillögukaffi","description":"Tillaga um hundvænt kaffihús."},
          "en":{"name":"Suggestion cafe","description":"A proposed dog-friendly cafe."}
        },
        "opening_hours":{},
        "dog_amenities":[],
        "access_condition":{
          "access_area":"outdoors",
          "restraint_condition":"leash_required",
          "dog_eligibility":{"scope":"all_dogs"},
          "availability_window":{"days":[1,2,3,4,5]},
          "permission_requirement":"standing_permission"
        },
        "evidence":{
          "kind":"member_report",
          "source_url":"https://example.invalid/suggestion-source",
          "source_label":"Member supplied source",
          "observed_at":"2026-07-11T09:00:00Z",
          "explanation":"The source explicitly permits dogs outdoors."
          ,"source_metadata":{}
        }
      }'::jsonb,
      '85000000-0000-4000-8000-000000000003'
    ) as result
  ),
  'A complete structured Suggestion is qualifying activity and activates the current week'
);

select is(
  (select count(*) from public.list_my_place_suggestions()),
  1::bigint,
  'The submitting Member sees one private acknowledgement'
);

select is(
  (select status from public.list_my_place_suggestions() limit 1),
  'submitted'::text,
  'The initial private outcome is submitted'
);

select ok(
  (
    select
      result.status = 'submitted'
      and not result.qualifying_action_recorded
      and not result.activated_current_week
    from public.submit_place_suggestion(
      '{"purpose":"dog_access_destination"}'::jsonb,
      '85000000-0000-4000-8000-000000000003'
    ) as result
  ),
  'A repeated Suggestion request returns the existing result without another qualifying action'
);

reset role;

select is(
  (select count(*) from private.place_suggestions where request_id = '85000000-0000-4000-8000-000000000003'),
  1::bigint,
  'A repeated submission with the same request ID does not create a duplicate Suggestion'
);

select is(
  (
    select count(*)
    from private.suggestion_status_events as event
    join private.place_suggestions as suggestion on suggestion.id = event.suggestion_id
    where suggestion.request_id = '85000000-0000-4000-8000-000000000003'
      and event.status = 'submitted'
  ),
  1::bigint,
  'A repeated submission with the same request ID does not duplicate the submitted status event'
);

select throws_ok(
  $$
    select private.validate_place_suggestion(
      jsonb_set(
        (select proposal from private.place_suggestions where request_id = '85000000-0000-4000-8000-000000000003'),
        '{access_condition,availability_window,days}',
        '[8]'::jsonb
      )
    )
  $$,
  '22023',
  'Suggestion structured fields are invalid',
  'Database validation rejects malformed Availability Window weekdays'
);

select throws_ok(
  $$
    select private.validate_place_suggestion(
      jsonb_set(
        (select proposal from private.place_suggestions where request_id = '85000000-0000-4000-8000-000000000003'),
        '{access_condition,access_area}',
        '"other_bounded"'::jsonb
      )
    )
  $$,
  '22023',
  'Suggestion structured fields are invalid',
  'Other bounded access requires its sourced area note'
);

select throws_ok(
  $$select private.validate_place_suggestion((select proposal from private.place_suggestions where request_id = '85000000-0000-4000-8000-000000000003') #- '{location,latitude}')$$,
  '22023', 'Suggestion structured fields are invalid',
  'Database validation rejects a missing latitude'
);

select throws_ok(
  $$select private.validate_place_suggestion(jsonb_set((select proposal from private.place_suggestions where request_id = '85000000-0000-4000-8000-000000000003'), '{location,latitude}', 'null'))$$,
  '22023', 'Suggestion structured fields are invalid',
  'Database validation rejects a null latitude'
);

select throws_ok(
  $$select private.validate_place_suggestion(jsonb_set((select proposal from private.place_suggestions where request_id = '85000000-0000-4000-8000-000000000003'), '{location,latitude}', '"north"'))$$,
  '22023', 'Suggestion structured fields are invalid',
  'Database validation rejects a non-numeric latitude'
);

select throws_ok(
  $$select private.validate_place_suggestion(jsonb_set((select proposal from private.place_suggestions where request_id = '85000000-0000-4000-8000-000000000003'), '{location,latitude}', '"NaN"'))$$,
  '22023', 'Suggestion structured fields are invalid',
  'Database validation rejects a non-finite latitude representation'
);

select throws_ok(
  $$select private.validate_place_suggestion((select proposal from private.place_suggestions where request_id = '85000000-0000-4000-8000-000000000003') #- '{location,longitude}')$$,
  '22023', 'Suggestion structured fields are invalid',
  'Database validation rejects a missing longitude'
);

select throws_ok(
  $$select private.validate_place_suggestion(jsonb_set((select proposal from private.place_suggestions where request_id = '85000000-0000-4000-8000-000000000003'), '{location,longitude}', 'null'))$$,
  '22023', 'Suggestion structured fields are invalid',
  'Database validation rejects a null longitude'
);

select throws_ok(
  $$select private.validate_place_suggestion(jsonb_set((select proposal from private.place_suggestions where request_id = '85000000-0000-4000-8000-000000000003'), '{location,longitude}', '"west"'))$$,
  '22023', 'Suggestion structured fields are invalid',
  'Database validation rejects a non-numeric longitude'
);

select throws_ok(
  $$select private.validate_place_suggestion(jsonb_set((select proposal from private.place_suggestions where request_id = '85000000-0000-4000-8000-000000000003'), '{evidence,source_url}', '42'))$$,
  '22023', 'Suggestion structured fields are invalid',
  'Database validation rejects a non-string Evidence URL'
);

select throws_ok(
  $$select private.validate_place_suggestion(jsonb_set((select proposal from private.place_suggestions where request_id = '85000000-0000-4000-8000-000000000003'), '{evidence,source_url}', '"ftp://example.invalid/source"'))$$,
  '22023', 'Suggestion Evidence source is invalid',
  'Database validation rejects an FTP Evidence URL'
);

select throws_ok(
  $$select private.validate_place_suggestion(jsonb_set((select proposal from private.place_suggestions where request_id = '85000000-0000-4000-8000-000000000003'), '{evidence,source_url}', '"javascript:alert(1)"'))$$,
  '22023', 'Suggestion Evidence source is invalid',
  'Database validation rejects a script Evidence URL'
);

select throws_ok(
  $$select private.validate_place_suggestion(jsonb_set(jsonb_set((select proposal from private.place_suggestions where request_id = '85000000-0000-4000-8000-000000000003'), '{evidence,source_url}', 'null'), '{evidence,source_citation}', 'null'))$$,
  '22023', 'Suggestion is incomplete',
  'Citation-only Evidence requires a non-empty citation'
);

select throws_ok(
  $$select private.validate_place_suggestion(jsonb_set((select proposal from private.place_suggestions where request_id = '85000000-0000-4000-8000-000000000003'), '{evidence,observed_at}', '99'))$$,
  '22023', 'Suggestion structured fields are invalid',
  'Database validation rejects a non-string observed time'
);

select throws_ok(
  $$update private.suggestion_status_events set occurred_at = occurred_at where status = 'submitted'$$,
  '55000', 'Suggestion status history is append-only',
  'Suggestion status history rejects updates'
);

select throws_ok(
  $$delete from private.suggestion_status_events where status = 'submitted'$$,
  '55000', 'Suggestion status history is append-only',
  'Suggestion status history rejects deletes'
);

select throws_ok(
  $$truncate private.suggestion_status_events$$,
  '55000', 'Suggestion status history is append-only',
  'Suggestion status history rejects truncation'
);

select is(
  (
    select candidate_place_id
    from private.place_suggestions
    where request_id = '85000000-0000-4000-8000-000000000003'
  ),
  null::uuid,
  'Submission does not create a Candidate Place'
);

set local role authenticated;

select is(
  (
    select count(*)
    from public.list_published_places('en')
    where name = 'Suggestion cafe'
  ),
  0::bigint,
  'Submission is absent from public discovery'
);

select lives_ok(
  $$
    select * from public.submit_place_suggestion(
      '{
        "purpose":"dog_access_destination",
        "operator_name":"Second lead",
        "category":"park",
        "location":{"address_line":"Garðgata 1","locality":"Reykjavík","postal_code":"105","municipality":"reykjavik","latitude":64.14,"longitude":-21.91},
        "translations":{"is":{"name":"Garður","description":"Tillaga."},"en":{"name":"Garden","description":"Suggestion."}},
        "opening_hours":{},
        "dog_amenities":[],
        "access_condition":{"access_area":"outdoors","restraint_condition":"leash_required","dog_eligibility":{"scope":"all_dogs"},"availability_window":{},"permission_requirement":"standing_permission"},
        "evidence":{"kind":"direct_observation","source_citation":"Skoðað á staðnum","source_label":"Direct observation","observed_at":"2026-07-11T09:00:00Z","explanation":"Sign at entrance.","source_metadata":{}}
      }'::jsonb,
      '85000000-0000-4000-8000-000000000004'
    )
  $$,
  'The explicit test policy permits a normal second submission'
);

select throws_ok(
  $$
    select * from public.submit_place_suggestion(
      '{"purpose":"dog_access_destination"}'::jsonb,
      '85000000-0000-4000-8000-000000000005'
    )
  $$,
  '54000',
  'Suggestion rate limit reached',
  'The configured test policy constrains repetitive submissions'
);

reset role;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (select count(*) from public.list_my_place_suggestions()),
  0::bigint,
  'Another Member cannot see private Suggestions'
);

select throws_ok(
  $$select * from public.list_moderation_place_suggestions()$$,
  '42501',
  'Moderator role required',
  'A Member cannot inspect the moderation queue'
);

select throws_ok(
  $$select * from public.list_suggestion_place_matches_for_payload('{}'::jsonb)$$,
  '42501',
  'Moderator role required',
  'A Member cannot query corrected-proposal identity matches'
);

select throws_ok(
  $$
    select * from public.confirm_suggestion_contribution(
      '65000000-0000-4000-8000-000000000003',
      '85000000-0000-4000-8000-000000000012'
    )
  $$,
  '42501',
  'Moderator role required',
  'A Member cannot confirm Contribution credit'
);

reset role;

insert into private.operators (id, name)
values ('15000000-0000-4000-8000-000000000001', 'Hundavænt suggestion operator');

insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude
)
values (
  '25000000-0000-4000-8000-000000000001',
  'Tillögugata 15',
  'Reykjavík',
  '101',
  'reykjavik',
  64.1466,
  -21.9426
);

insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category, published_at
)
values (
  '35000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000001',
  'dog_access_destination',
  'inactive',
  'cafe',
  null
);

insert into private.operators (id, name)
values ('15000000-0000-4000-8000-000000000099', 'Unrelated operator');

insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude
)
values (
  '25000000-0000-4000-8000-000000000099',
  'Fjarlæg gata 99',
  'Mosfellsbær',
  '270',
  'mosfellsbaer',
  64.17,
  -21.70
);

insert into private.places (
  id, operator_id, location_id, purpose, lifecycle, category
)
values (
  '35000000-0000-4000-8000-000000000099',
  '15000000-0000-4000-8000-000000000099',
  '25000000-0000-4000-8000-000000000099',
  'dog_access_destination',
  'candidate',
  'service'
);

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select is(
  (select count(*) from public.list_moderation_place_suggestions()),
  2::bigint,
  'A Moderator sees submitted Suggestions in the private queue'
);

reset role;
update private.place_suggestions
set submitted_at = '2026-07-11T09:30:00Z', updated_at = '2026-07-11T09:30:00Z'
where member_id = '75000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (select count(*) from public.list_my_place_suggestions(null, null, 1)),
  1::bigint,
  'Member history enforces the requested page bound'
);

select is(
  (
    with first_page as (
      select * from public.list_my_place_suggestions(null, null, 1)
    )
    select count(*)
    from first_page,
      lateral public.list_my_place_suggestions(
        first_page.submitted_at,
        first_page.suggestion_id,
        1
      ) as second_page
    where second_page.suggestion_id <> first_page.suggestion_id
  ),
  1::bigint,
  'Member cursor crosses an equal-timestamp boundary without duplication'
);

select is(
  (select count(distinct submitted_at) from public.list_my_place_suggestions()),
  1::bigint,
  'Member pagination fixture proves the stable UUID tie-breaker under equal timestamps'
);

reset role;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select is(
  (select count(*) from public.list_moderation_place_suggestions(null, null, null, 1)),
  1::bigint,
  'Moderator queue enforces the requested page bound'
);

select is(
  (
    with first_page as (
      select * from public.list_moderation_place_suggestions(null, null, null, 1)
    )
    select count(*)
    from first_page,
      lateral public.list_moderation_place_suggestions(
        first_page.queue_rank,
        first_page.submitted_at,
        first_page.suggestion_id,
        1
      ) as second_page
    where second_page.suggestion_id <> first_page.suggestion_id
  ),
  1::bigint,
  'Moderator cursor crosses a stable queue boundary without duplication'
);

select ok(
  not exists (
    select 1 from public.list_moderation_place_suggestions()
    where to_jsonb(list_moderation_place_suggestions.*) ? 'proposal'
  ),
  'The bounded Moderator queue does not fetch full proposal details'
);

select ok(
  (select proposal is not null from public.get_moderation_place_suggestion(
    (select suggestion_id from public.list_moderation_place_suggestions() where name_en = 'Suggestion cafe')
  )),
  'The dedicated Moderator detail RPC returns the complete proposal'
);

reset role;
insert into private.operators (id, name)
select ('45000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  'Nearby operator ' || value
from generate_series(1, 30) as value;

insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude
)
select
  ('46000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  'Nálæg gata ' || value,
  'Reykjavík',
  '101',
  'reykjavik',
  64.1466 + value * 0.000001,
  -21.9426
from generate_series(1, 30) as value;

insert into private.places (id, operator_id, location_id, purpose, lifecycle, category)
select
  ('47000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  ('45000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  ('46000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  'dog_access_destination',
  'candidate',
  'cafe'
from generate_series(1, 30) as value;

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select is(
  (
    select count(*) from public.list_suggestion_place_matches(
      (select suggestion_id from public.list_moderation_place_suggestions() where name_en = 'Suggestion cafe')
    )
  ),
  25::bigint,
  'Suggestion Place matches enforce the conservative hard cap'
);

select is(
  (
    select count(*)
    from public.list_suggestion_place_matches_for_payload(
      (select proposal from public.get_moderation_place_suggestion(
        (select suggestion_id from public.list_moderation_place_suggestions() where name_en = 'Suggestion cafe')
      ))
    )
  ),
  25::bigint,
  'Corrected-proposal Place matches preserve the conservative hard cap'
);

select is(
  (
    select count(*)
    from public.list_suggestion_place_matches(
      (select suggestion_id from public.list_moderation_place_suggestions() where name_en = 'Suggestion cafe')
    )
    where exact_location and lifecycle = 'inactive'
  ),
  1::bigint,
  'Duplicate review includes the Inactive Place at the same Location'
);

select is(
  (
    select lifecycle
    from public.list_suggestion_place_matches(
      (select suggestion_id from public.list_moderation_place_suggestions() where name_en = 'Suggestion cafe')
    )
    where exact_location and lifecycle = 'inactive'
  ),
  'inactive'::text,
  'The match preserves predecessor lifecycle for human continuity review'
);

reset role;
insert into private.operators (id, name)
values ('15000000-0000-4000-8000-000000000002', 'Corrected Location operator');

insert into private.locations (
  id, address_line, locality, postal_code, municipality, latitude, longitude
)
values (
  '25000000-0000-4000-8000-000000000002',
  'Leiðrétt gata 16',
  'Reykjavík',
  '101',
  'reykjavik',
  64.155,
  -21.93
);

insert into private.places (id, operator_id, location_id, purpose, lifecycle, category)
values (
  '35000000-0000-4000-8000-000000000002',
  '15000000-0000-4000-8000-000000000002',
  '25000000-0000-4000-8000-000000000002',
  'dog_access_destination',
  'inactive',
  'cafe'
);

insert into private.place_suggestions (id, member_id, request_id, proposal)
select
  '65000000-0000-4000-8000-000000000004',
  member_id,
  '85000000-0000-4000-8000-000000000020',
  jsonb_set(
    jsonb_set(proposal, '{translations,en,name}', '"Corrected identity suggestion"'),
    '{translations,is,name}', '"Leiðrétt auðkennistillaga"'
  )
from private.place_suggestions
where request_id = '85000000-0000-4000-8000-000000000003';

insert into private.suggestion_status_events (suggestion_id, status)
values ('65000000-0000-4000-8000-000000000004', 'submitted');

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select is(
  (
    select place_id
    from public.list_suggestion_place_matches_for_payload(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            (select proposal from public.get_moderation_place_suggestion('65000000-0000-4000-8000-000000000004')),
            '{location,address_line}',
            '"Leiðrétt gata 16"'
          ),
          '{location,latitude}',
          '64.155'
        ),
        '{location,longitude}',
        '-21.93'
      )
    )
    where exact_location
  ),
  '35000000-0000-4000-8000-000000000002'::uuid,
  'A Moderator refresh sees the identity compatible with corrected Location details'
);

select throws_ok(
  $$
    select * from pg_temp.resolve_place_suggestion(
      '65000000-0000-4000-8000-000000000004',
      'accepted',
      'Leiðrétt staðsetning.',
      'Corrected Location.',
      null,
      jsonb_set(
        jsonb_set(
          jsonb_set(
            (select proposal from public.get_moderation_place_suggestion('65000000-0000-4000-8000-000000000004')),
            '{location,address_line}', '"Leiðrétt gata 16"'
          ),
          '{location,latitude}', '64.155'
        ),
        '{location,longitude}', '-21.93'
      ),
      null,
      '35000000-0000-4000-8000-000000000001',
      '35000000-0000-4000-8000-000000000001',
      false,
      '85000000-0000-4000-8000-000000000021'
    )
  $$,
  '22023', 'Reviewed Operator identity is invalid',
  'A stale original match cannot supply Operator identity after a corrected Location'
);

select throws_ok(
  $$
    select * from pg_temp.resolve_place_suggestion(
      '65000000-0000-4000-8000-000000000004',
      'accepted',
      'Leiðrétt staðsetning.',
      'Corrected Location.',
      null,
      jsonb_set(
        jsonb_set(
          jsonb_set(
            (select proposal from public.get_moderation_place_suggestion('65000000-0000-4000-8000-000000000004')),
            '{location,address_line}', '"Leiðrétt gata 16"'
          ),
          '{location,latitude}', '64.155'
        ),
        '{location,longitude}', '-21.93'
      ),
      null,
      '35000000-0000-4000-8000-000000000002',
      '35000000-0000-4000-8000-000000000001',
      false,
      '85000000-0000-4000-8000-000000000022'
    )
  $$,
  '22023', 'Reviewed Location identity is invalid',
  'A stale original match cannot supply Location identity after a corrected Location'
);

select lives_ok(
  $$
    select * from pg_temp.resolve_place_suggestion(
      '65000000-0000-4000-8000-000000000004',
      'accepted',
      'Leiðrétt staðsetning.',
      'Corrected Location.',
      null,
      jsonb_set(
        jsonb_set(
          jsonb_set(
            (select proposal from public.get_moderation_place_suggestion('65000000-0000-4000-8000-000000000004')),
            '{location,address_line}', '"Leiðrétt gata 16"'
          ),
          '{location,latitude}', '64.155'
        ),
        '{location,longitude}', '-21.93'
      ),
      null,
      '35000000-0000-4000-8000-000000000002',
      '35000000-0000-4000-8000-000000000002',
      false,
      '85000000-0000-4000-8000-000000000023'
    )
  $$,
  'A corrected proposal can reuse identities from a compatible corrected-payload match'
);

reset role;
select is(
  (
    select candidate.operator_id
    from private.place_suggestions as suggestion
    join private.places as candidate on candidate.id = suggestion.candidate_place_id
    where suggestion.id = '65000000-0000-4000-8000-000000000004'
  ),
  '15000000-0000-4000-8000-000000000002'::uuid,
  'Corrected acceptance reuses only the compatible Operator identity'
);

select is(
  (
    select candidate.location_id
    from private.place_suggestions as suggestion
    join private.places as candidate on candidate.id = suggestion.candidate_place_id
    where suggestion.id = '65000000-0000-4000-8000-000000000004'
  ),
  '25000000-0000-4000-8000-000000000002'::uuid,
  'Corrected acceptance reuses only the compatible Location identity'
);

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select lives_ok(
  $$
    select * from pg_temp.resolve_place_suggestion(
      (select suggestion_id from public.list_moderation_place_suggestions() where name_en = 'Garden'),
      'rejected',
      'Ekki nægar heimildir.',
      'Insufficient evidence.',
      'Private moderator note',
      null,
      null,
      null,
      null,
      false,
      '85000000-0000-4000-8000-000000000006'
    )
  $$,
  'A Moderator can reject with separate Member-safe and private reasons'
);

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000001', true);

select is(
  (
    select status from public.list_my_place_suggestions()
    where name_en = 'Garden'
  ),
  'rejected'::text,
  'The Member sees the rejected outcome'
);

select is(
  (
    select member_reason_en from public.list_my_place_suggestions()
    where name_en = 'Garden'
  ),
  'Insufficient evidence.'::text,
  'The Member sees only the safe reason'
);

select ok(
  not exists (
    select 1 from public.list_my_place_suggestions()
    where to_jsonb(list_my_place_suggestions.*) ? 'private_note'
  ),
  'The Member projection has no private moderator-note field'
);

reset role;
select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select throws_ok(
  $$
    select * from pg_temp.resolve_place_suggestion(
      (select suggestion_id from public.list_moderation_place_suggestions() where name_en = 'Suggestion cafe'),
      'duplicate',
      'Staðurinn er þegar skráður.',
      'This Place is already recorded.',
      null,
      null,
      '35000000-0000-4000-8000-000000000099',
      null,
      null,
      false,
      '85000000-0000-4000-8000-000000000099'
    )
  $$,
  '22023', 'Reviewed duplicate Place is required',
  'An unrelated Place UUID cannot be selected as a duplicate'
);

select lives_ok(
  $$
    select * from pg_temp.resolve_place_suggestion(
      (select suggestion_id from public.list_moderation_place_suggestions() where name_en = 'Suggestion cafe'),
      'duplicate',
      'Staðurinn er þegar skráður.',
      'This Place is already recorded.',
      'Inactive predecessor requires continuity review',
      null,
      '35000000-0000-4000-8000-000000000001',
      null,
      null,
      false,
      '85000000-0000-4000-8000-000000000007'
    )
  $$,
  'A Moderator can resolve a Suggestion as a duplicate without merging continuity'
);

reset role;

select is(
  (
    select duplicate_place_id
    from private.place_suggestions
    where request_id = '85000000-0000-4000-8000-000000000003'
  ),
  '35000000-0000-4000-8000-000000000001'::uuid,
  'Duplicate resolution retains the reviewed Place reference'
);

select is(
  (select count(*) from private.contributions),
  0::bigint,
  'Rejected and duplicate outcomes never create Contribution credit'
);

-- A third submitted lead is inserted directly to isolate accepted conversion from the test rate limit.
insert into private.place_suggestions (id, member_id, request_id, proposal)
select
  '65000000-0000-4000-8000-000000000003',
  '75000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000008',
  proposal
from private.place_suggestions
where request_id = '85000000-0000-4000-8000-000000000003';

insert into private.suggestion_status_events (suggestion_id, status)
values ('65000000-0000-4000-8000-000000000003', 'submitted');

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select throws_ok(
  $$
    select * from pg_temp.resolve_place_suggestion(
      '65000000-0000-4000-8000-000000000003',
      'accepted',
      'Tillagan var samþykkt.',
      'The Suggestion was accepted.',
      null,
      (select proposal from public.get_moderation_place_suggestion('65000000-0000-4000-8000-000000000003')),
      null,
      '35000000-0000-4000-8000-000000000099',
      '35000000-0000-4000-8000-000000000001',
      false,
      '85000000-0000-4000-8000-000000000097'
    )
  $$,
  '22023', 'Reviewed Operator identity is invalid',
  'An unrelated Place UUID cannot supply Operator identity'
);

select throws_ok(
  $$
    select * from pg_temp.resolve_place_suggestion(
      '65000000-0000-4000-8000-000000000003',
      'accepted',
      'Tillagan var samþykkt.',
      'The Suggestion was accepted.',
      null,
      (select proposal from public.get_moderation_place_suggestion('65000000-0000-4000-8000-000000000003')),
      null,
      '35000000-0000-4000-8000-000000000001',
      '35000000-0000-4000-8000-000000000099',
      false,
      '85000000-0000-4000-8000-000000000098'
    )
  $$,
  '22023', 'Reviewed Location identity is invalid',
  'An unrelated Place UUID cannot supply Location identity'
);

select lives_ok(
  $$
    select * from pg_temp.resolve_place_suggestion(
      '65000000-0000-4000-8000-000000000003',
      'accepted',
      'Tillagan var samþykkt.',
      'The Suggestion was accepted.',
      'Identity reviewed as a new continuity',
      jsonb_set(
        jsonb_set(
          jsonb_set(
            (select proposal from public.get_moderation_place_suggestion('65000000-0000-4000-8000-000000000003')),
            '{translations,en,name}',
            '"Corrected suggestion cafe"'
          ),
          '{access_condition,availability_state}',
          '"whenever_open"'
        ),
        '{access_condition,availability_window}',
        '{}'::jsonb
      ),
      null,
      '35000000-0000-4000-8000-000000000001',
      '35000000-0000-4000-8000-000000000001',
      false,
      '85000000-0000-4000-8000-000000000009'
    )
  $$,
  'A Moderator atomically converts an accepted Suggestion into a Candidate'
);

reset role;

select is(
  (
    select reviewed_proposal #>> '{translations,en,name}'
    from private.place_suggestions
    where id = '65000000-0000-4000-8000-000000000003'
  ),
  'Corrected suggestion cafe'::text,
  'Accepted resolution stores the complete corrected proposal'
);

select is(
  (
    select translation.name
    from private.place_suggestions as suggestion
    join private.place_translations as translation
      on translation.place_id = suggestion.candidate_place_id and translation.locale = 'en'
    where suggestion.id = '65000000-0000-4000-8000-000000000003'
  ),
  'Corrected suggestion cafe'::text,
  'The corrected proposal is used to create the Candidate atomically'
);

select is(
  (
    select condition.availability_state::text
    from private.place_suggestions as suggestion
    join private.access_conditions as condition
      on condition.place_id = suggestion.candidate_place_id
    where suggestion.id = '65000000-0000-4000-8000-000000000003'
  ),
  'whenever_open'::text,
  'Accepted Suggestion conversion writes its explicit availability state directly'
);

select is(
  (
    select candidate.operator_id
    from private.place_suggestions as suggestion
    join private.places as candidate on candidate.id = suggestion.candidate_place_id
    where suggestion.id = '65000000-0000-4000-8000-000000000003'
  ),
  '15000000-0000-4000-8000-000000000001'::uuid,
  'The accepted Candidate reuses the explicitly selected Operator identity'
);

select is(
  (
    select candidate.location_id
    from private.place_suggestions as suggestion
    join private.places as candidate on candidate.id = suggestion.candidate_place_id
    where suggestion.id = '65000000-0000-4000-8000-000000000003'
  ),
  '25000000-0000-4000-8000-000000000001'::uuid,
  'The accepted Candidate reuses the explicitly selected Location identity'
);

select is(
  (select lifecycle::text from private.places where id = '35000000-0000-4000-8000-000000000001'),
  'inactive'::text,
  'Explicit continuity reuse keeps the inactive predecessor intact'
);

select is(
  (
    select lifecycle::text
    from private.places
    where id = (
      select candidate_place_id from private.place_suggestions
      where id = '65000000-0000-4000-8000-000000000003'
    )
  ),
  'candidate'::text,
  'Accepted conversion creates a private Candidate, not a Published Place'
);

select is(
  (
    select count(*) from public.list_published_places('en')
    where place_id = (
      select candidate_place_id from private.place_suggestions
      where id = '65000000-0000-4000-8000-000000000003'
    )
  ),
  0::bigint,
  'The accepted Candidate remains absent from public discovery before Verification'
);

select is(
  (
    select count(*) from private.contributions
    where suggestion_id = '65000000-0000-4000-8000-000000000003'
      and member_id = '75000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'Acceptance alone does not create Contribution credit'
);

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select lives_ok(
  $$
    select * from public.confirm_suggestion_contribution(
      '65000000-0000-4000-8000-000000000003',
      '85000000-0000-4000-8000-000000000011'
    )
  $$,
  'A Moderator separately confirms useful value after acceptance'
);

reset role;

select is(
  (
    select count(*) from private.contributions
    where suggestion_id = '65000000-0000-4000-8000-000000000003'
      and member_id = '75000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'Only the separate accepted-useful confirmation creates one Contribution'
);

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select lives_ok(
  $$
    select * from pg_temp.resolve_place_suggestion(
      '65000000-0000-4000-8000-000000000003',
      'accepted',
      'Tillagan var samþykkt.',
      'The Suggestion was accepted.',
      'Idempotent retry',
      null,
      null,
      null,
      null,
      false,
      '85000000-0000-4000-8000-000000000009'
    )
  $$,
  'An exact accepted resolution retry is idempotent'
);

reset role;

select is(
  (
    select count(*) from private.contributions
    where suggestion_id = '65000000-0000-4000-8000-000000000003'
  ),
  1::bigint,
  'An accepted retry cannot double-credit a Contribution'
);

select is(
  (
    select count(*) from private.suggestion_status_events
    where suggestion_id = '65000000-0000-4000-8000-000000000003'
      and status = 'accepted'
  ),
  1::bigint,
  'An accepted retry cannot duplicate status history'
);

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000003', true);
set local role authenticated;

select throws_ok(
  $$
    select * from pg_temp.resolve_place_suggestion(
      '65000000-0000-4000-8000-000000000003',
      'rejected',
      'Breytt niðurstaða.',
      'Changed outcome.',
      null,
      null,
      null,
      null,
      null,
      false,
      '85000000-0000-4000-8000-000000000010'
    )
  $$,
  '55006',
  'Suggestion outcome is final',
  'A terminal outcome cannot be rewritten'
);

reset role;

select is(
  (
    select count(*) from private.audit_events
    where subject_type = 'suggestion'
      and subject_id = '65000000-0000-4000-8000-000000000003'
  ),
  2::bigint,
  'Acceptance and Contribution confirmation append separate Moderator audit events'
);

select * from finish();

rollback;
