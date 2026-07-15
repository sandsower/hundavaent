begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

select has_table('private', 'auth_pending_intents', 'Pending authentication intents are private');
select has_table(
  'private',
  'pending_member_rating_completions',
  'Pre-authentication ratings have an explicit integration queue'
);
select has_function(
  'public',
  'create_auth_pending_intent',
  array['text', 'uuid', 'integer'],
  'Visitors can create a bounded continuation'
);
select has_function(
  'public',
  'activate_current_member_with_intent',
  array['text', 'text', 'text'],
  'Member activation and pending completion have one atomic command'
);
select has_function(
  'public',
  'get_auth_pending_intent',
  array['text', 'text'],
  'A continuation token can recover its safe display context'
);
select has_function(
  'public',
  'complete_auth_pending_intent',
  array['text', 'text'],
  'Activated Members can complete a continuation'
);
select ok(
  has_function_privilege(
    'anon',
    'public.create_auth_pending_intent(text,uuid,integer)',
    'execute'
  ),
  'Anonymous visitors can create a continuation'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.activate_current_member_with_intent(text,text,text)',
    'execute'
  ),
  'An authenticated callback can invoke the atomic command'
);
select ok(
  has_function_privilege('anon', 'public.get_auth_pending_intent(text,text)', 'execute'),
  'Anonymous recovery can resolve only a presented continuation token'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.complete_auth_pending_intent(text,text)',
    'execute'
  ),
  'Anonymous visitors cannot complete a continuation'
);
select ok(
  not has_table_privilege('authenticated', 'private.auth_pending_intents', 'select'),
  'Members cannot enumerate pending intents'
);

insert into auth.users (id)
values
  ('74300000-0000-4000-8000-000000000001'),
  ('74300000-0000-4000-8000-000000000002');

insert into private.member_accounts (user_id)
values
  ('74300000-0000-4000-8000-000000000001'),
  ('74300000-0000-4000-8000-000000000002');

set local role anon;

select set_config(
  'test.favourite_intent',
  public.create_auth_pending_intent(
    'favourite',
    '30000000-0000-4000-8000-000000000003',
    null
  ),
  true
);

select throws_ok(
  $$select public.create_auth_pending_intent(
    'unknown',
    '30000000-0000-4000-8000-000000000003',
    null
  )$$,
  '22023',
  'Valid pending authentication action required',
  'Unsupported action values are rejected'
);

reset role;

select is(
  (select count(*) from private.member_accounts),
  2::bigint,
  'Requesting an authentication continuation creates no Member'
);

select set_config('request.jwt.claim.sub', '74300000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (
    select completion_status
    from public.complete_auth_pending_intent(
      current_setting('test.favourite_intent'),
      'complete-favourite'
    )
  ),
  'completed'::text,
  'The activated Member completes the pending Favorite'
);

select is(
  (
    select completion_status
    from public.complete_auth_pending_intent(
      current_setting('test.favourite_intent'),
      'replay-favourite'
    )
  ),
  'completed'::text,
  'A same-Member callback replay returns the original completion'
);

reset role;

select is(
  (
    select count(*)
    from private.member_favourites
    where user_id = '74300000-0000-4000-8000-000000000001'
      and place_id = '30000000-0000-4000-8000-000000000003'
  ),
  1::bigint,
  'Favorite completion is idempotent'
);

select set_config('request.jwt.claim.sub', '74300000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(
  (
    select count(*)
    from public.complete_auth_pending_intent(
      current_setting('test.favourite_intent'),
      'wrong-member'
    )
  ),
  0::bigint,
  'A different Member cannot claim a consumed continuation'
);

reset role;
set local role anon;

select set_config(
  'test.rating_intent',
  public.create_auth_pending_intent(
    'rating',
    '30000000-0000-4000-8000-000000000003',
    2
  ),
  true
);

select set_config(
  'test.expired_intent',
  public.create_auth_pending_intent(
    'favourite',
    '30000000-0000-4000-8000-000000000003',
    null
  ),
  true
);

reset role;

update private.auth_pending_intents
set expires_at = statement_timestamp() - interval '1 second'
where token_hash = extensions.digest(
  convert_to(current_setting('test.expired_intent'), 'UTF8'),
  'sha256'
);

select set_config('request.jwt.claim.sub', '74300000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (
    select completion_status
    from public.complete_auth_pending_intent(
      current_setting('test.rating_intent'),
      'complete-rating'
    )
  ),
  'queued'::text,
  'A selected rating is preserved for the inline-rating integration'
);

select is(
  (
    select count(*)
    from public.complete_auth_pending_intent(
      current_setting('test.expired_intent'),
      'expired-favourite'
    )
  ),
  0::bigint,
  'An expired continuation performs no action'
);

reset role;

select is(
  (
    select overall_rating
    from private.pending_member_rating_completions
    where member_id = '74300000-0000-4000-8000-000000000001'
      and place_id = '30000000-0000-4000-8000-000000000003'
  ),
  2,
  'The exact pre-authentication rating survives completion'
);

select is(
  (
    select count(*)
    from private.member_favourites
    where user_id = '74300000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'The expired Favorite changed no state'
);

select * from finish();

rollback;
