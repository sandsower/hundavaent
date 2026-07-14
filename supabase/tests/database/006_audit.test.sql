begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_table('private', 'audit_events', 'Audit Event persistence exists');

select has_function(
  'private',
  'append_audit_event',
  array['text', 'text', 'uuid', 'uuid', 'jsonb'],
  'Audit Events have one caller-derived append boundary'
);

insert into auth.users (id)
values
  ('71000000-0000-4000-8000-000000000001'),
  ('71000000-0000-4000-8000-000000000002');

insert into security.role_grants (user_id, role)
values ('71000000-0000-4000-8000-000000000001', 'moderator');

select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$
    select private.append_audit_event(
      'place.candidate_created',
      'place',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000001',
      '{"version":1}'::jsonb
    )
  $$,
  'A Moderator can append a safe Audit Event'
);

select is(
  (
    select actor_id
    from private.audit_events
    where request_id = '81000000-0000-4000-8000-000000000001'
  ),
  '71000000-0000-4000-8000-000000000001'::uuid,
  'Audit actor is captured from the caller JWT context'
);

select is(
  (
    select change_summary
    from private.audit_events
    where request_id = '81000000-0000-4000-8000-000000000001'
  ),
  '{"version":1}'::jsonb,
  'Audit Event stores only the supplied safe change summary'
);

select throws_ok(
  $$
    update private.audit_events
    set action = 'tampered'
    where request_id = '81000000-0000-4000-8000-000000000001'
  $$,
  '55000',
  'Audit Events are append-only',
  'Audit Events cannot be updated'
);

select throws_ok(
  $$
    delete from private.audit_events
    where request_id = '81000000-0000-4000-8000-000000000001'
  $$,
  '55000',
  'Audit Events are append-only',
  'Audit Events cannot be deleted'
);

select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-4000-8000-000000000002',
  true
);

select throws_ok(
  $$
    select private.append_audit_event(
      'place.candidate_created',
      'place',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000002',
      '{}'::jsonb
    )
  $$,
  '42501',
  'Moderator role required',
  'A Visitor cannot append an Audit Event'
);

select ok(
  not has_table_privilege('anon', 'private.audit_events', 'select'),
  'Anonymous callers cannot read Audit Events'
);

select * from finish();

rollback;
