begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select has_column('private', 'dog_friendliness_ratings', 'overall_score', 'Current Ratings have an explicit overall score');
select col_not_null('private', 'dog_friendliness_ratings', 'overall_score', 'Overall score is required');
select has_column('private', 'dog_friendliness_rating_events', 'overall_score', 'Rating history snapshots overall');
select has_function('public', 'save_inline_dog_friendliness_rating', array['uuid','integer','integer','integer','integer','integer','uuid','boolean','text','text'], 'Inline autosave RPC exists');
select has_function('public', 'apply_pending_member_rating', array['uuid'], 'Pending pre-auth Rating application exists');
select ok(
  has_function_privilege('authenticated', 'public.save_inline_dog_friendliness_rating(uuid,integer,integer,integer,integer,integer,uuid,boolean,text,text)', 'execute'),
  'Members can autosave Ratings'
);
select ok(
  not has_function_privilege('anon', 'public.save_inline_dog_friendliness_rating(uuid,integer,integer,integer,integer,integer,uuid,boolean,text,text)', 'execute'),
  'Visitors cannot autosave Ratings'
);
select is((select minimum_eligible_count from private.dog_friendliness_summary_policy where singleton), 5, 'Public threshold is five');
select is((select recency_window from private.dog_friendliness_summary_policy where singleton), interval '12 months', 'Public cohort rolls over twelve months');
select is((select enabled from private.dog_friendliness_summary_policy where singleton), true, 'Inline public summary policy is active');

select ok(
  not has_function_privilege('anon', 'public.get_my_dog_friendliness_rating(uuid)', 'execute'),
  'Visitors cannot read a Member Rating'
);
select ok(
  has_function_privilege('authenticated', 'public.get_my_dog_friendliness_rating(uuid)', 'execute'),
  'Members can read their own Rating'
);
select ok(
  not has_function_privilege('service_role', 'public.get_my_dog_friendliness_rating(uuid)', 'execute'),
  'The service role cannot use the Member Rating reader'
);
select ok(
  has_function_privilege('anon', 'public.get_dog_friendliness_summary(uuid)', 'execute'),
  'Visitors can read the public aggregate'
);
select ok(
  has_function_privilege('authenticated', 'public.get_dog_friendliness_summary(uuid)', 'execute'),
  'Members can read the public aggregate'
);
select ok(
  not has_function_privilege('service_role', 'public.get_dog_friendliness_summary(uuid)', 'execute'),
  'The service role has no public-summary capability'
);
select ok(
  not has_function_privilege('anon', 'public.list_moderation_dog_friendliness_ratings(uuid)', 'execute'),
  'Visitors cannot invoke the moderation Rating reader'
);
select ok(
  has_function_privilege('authenticated', 'public.list_moderation_dog_friendliness_ratings(uuid)', 'execute'),
  'Authenticated moderators can invoke the guarded moderation Rating reader'
);
select ok(
  not has_function_privilege('service_role', 'public.list_moderation_dog_friendliness_ratings(uuid)', 'execute'),
  'The service role cannot invoke the moderation Rating reader'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'private.pending_member_rating_completions'::regclass
      and tgname = 'pending_member_rating_completions_serialize_insert'
      and not tgisinternal
  ),
  'Pending Rating insertion shares a serialization lock with application'
);

insert into auth.users (id, email) values
  ('7a000000-0000-4000-8000-000000000001', 'inline-pending-member@example.invalid');
insert into private.member_accounts (user_id) values
  ('7a000000-0000-4000-8000-000000000001');
insert into security.role_grants (user_id, role) values
  ('7a000000-0000-4000-8000-000000000001', 'member');
insert into private.pending_member_rating_completions (
  member_id, place_id, overall_rating, request_id, created_at
) values
  (
    '7a000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003', 2, 'pending-older', '2026-07-15T10:00:00Z'
  ),
  (
    '7a000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003', 5, 'pending-newest', '2026-07-15T10:01:00Z'
  );

select set_config('request.jwt.claim.sub', '7a000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  (select overall_score from public.apply_pending_member_rating('30000000-0000-4000-8000-000000000003')),
  5,
  'The newest visible pending Rating wins'
);
reset role;

select is(
  (
    select overall_score from private.dog_friendliness_ratings
    where member_id = '7a000000-0000-4000-8000-000000000001'
      and place_id = '30000000-0000-4000-8000-000000000003'
  ),
  5,
  'Applying pending state persists the newest score'
);
select is(
  (
    select count(*)::bigint from private.pending_member_rating_completions
    where member_id = '7a000000-0000-4000-8000-000000000001'
      and place_id = '30000000-0000-4000-8000-000000000003'
      and applied_at is not null
  ),
  2::bigint,
  'Only the selected newest row and already-visible superseded rows are consumed'
);

insert into private.pending_member_rating_completions (
  member_id, place_id, overall_rating, request_id, created_at
) values (
  '7a000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003', 4, 'pending-after-application', '2026-07-15T10:02:00Z'
);
select ok(
  (
    select applied_at is null from private.pending_member_rating_completions
    where member_id = '7a000000-0000-4000-8000-000000000001'
      and place_id = '30000000-0000-4000-8000-000000000003'
      and request_id = 'pending-after-application'
  ),
  'A pending row inserted after application remains unconsumed'
);

select set_config('request.jwt.claim.sub', '7a000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  (select overall_score from public.apply_pending_member_rating('30000000-0000-4000-8000-000000000003')),
  4,
  'The next application consumes later pending state'
);
reset role;
select is(
  (
    select overall_score from private.dog_friendliness_ratings
    where member_id = '7a000000-0000-4000-8000-000000000001'
      and place_id = '30000000-0000-4000-8000-000000000003'
  ),
  4,
  'Later pending state becomes the current Rating'
);
select ok(
  (
    select applied_at is not null from private.pending_member_rating_completions
    where member_id = '7a000000-0000-4000-8000-000000000001'
      and place_id = '30000000-0000-4000-8000-000000000003'
      and request_id = 'pending-after-application'
  ),
  'The later pending row is marked applied only after it is saved'
);

select * from finish();
rollback;
