begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

insert into private.member_activation_capabilities (secret)
values ('local-member-activation-capability-secret-v1')
on conflict (singleton) do update set secret = excluded.secret;

create function public.test_pending_proof(
  subject text,
  action text,
  place_id uuid,
  rating integer,
  request_id text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.hmac(
      'pending:' || subject || ':' || action || ':' || place_id::text || ':' ||
        coalesce(rating::text, '') || ':' || request_id || ':auth-pending-intent-v1',
      'local-member-activation-capability-secret-v1',
      'sha256'
    ),
    'hex'
  )
$$;

grant execute on function public.test_pending_proof(text, text, uuid, integer, text) to anon;

select has_table('private', 'auth_pending_intents', 'Pending authentication intents are private');
select has_table('private', 'pending_member_rating_completions', 'Ratings have a private queue');
select has_function(
  'public',
  'create_auth_pending_intent',
  array['text', 'uuid', 'integer', 'text', 'text', 'text'],
  'Pending intent creation requires a server capability'
);
select has_function('public', 'get_auth_pending_intent', array['text', 'text']);
select has_function('public', 'complete_auth_pending_intent', array['text', 'text']);
select ok(
  has_function_privilege(
    'anon',
    'public.create_auth_pending_intent(text,uuid,integer,text,text,text)',
    'execute'
  ),
  'Anonymous visitors can invoke only the capability-checked creation command'
);
select ok(
  not has_function_privilege('anon', 'public.complete_auth_pending_intent(text,text)', 'execute'),
  'Anonymous visitors cannot complete a continuation'
);
select ok(
  not has_function_privilege('authenticated', 'private.cleanup_auth_pending_intents(integer)', 'execute')
  and not has_function_privilege('service_role', 'private.cleanup_auth_pending_intents(integer)', 'execute'),
  'The retention cleanup seam is not externally callable'
);
select ok(
  not has_function_privilege('authenticated', 'private.cleanup_member_auth_pending_data(uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.cleanup_member_auth_pending_data(uuid)', 'execute'),
  'The deletion cleanup seam is not externally callable'
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
    null,
    repeat('a', 64),
    'create-favourite',
    public.test_pending_proof(
      repeat('a', 64),
      'favourite',
      '30000000-0000-4000-8000-000000000003',
      null,
      'create-favourite'
    )
  ),
  true
);

select throws_ok(
  $$select public.create_auth_pending_intent(
    'favourite',
    '30000000-0000-4000-8000-000000000003',
    null,
    repeat('a', 64),
    'direct-abuse',
    repeat('0', 64)
  )$$,
  '42501',
  'Valid pending authentication capability required',
  'A direct anonymous call without a server proof is denied'
);

reset role;

select is((select count(*) from private.auth_pending_intents), 1::bigint, 'Denied creation stores no row');
select is((select count(*) from private.member_accounts), 2::bigint, 'Requesting a link creates no Member');
select is(length(current_setting('test.favourite_intent')), 43, 'The opaque token has one canonical length');

set local role anon;

select is(
  (select count(*) from public.get_auth_pending_intent(repeat('A', 42), 'en')),
  0::bigint,
  'A non-canonical token is rejected before lookup'
);

reset role;
select set_config('request.jwt.claim.sub', '74300000-0000-4000-8000-000000000001', true);
set local role authenticated;

select ok(
  (
    select
      completion_status = 'completed'
      and first_time_for_place
      and activated_current_week
      and current_week_active
    from public.complete_auth_pending_intent(current_setting('test.favourite_intent'), 'complete-favourite')
  ),
  'The activated Member completes the pending Favorite with authoritative weekly recognition'
);
select is(
  (
    select count(*)
    from public.complete_auth_pending_intent(current_setting('test.favourite_intent'), 'replay-favourite')
  ),
  0::bigint,
  'A consumed continuation is unavailable even to the same Member'
);
select throws_ok(
  $$select * from public.complete_auth_pending_intent(repeat('A', 44), 'malformed')$$,
  '22023',
  'Valid pending intent and request identifier required',
  'Completion accepts only a canonical token'
);

reset role;

select is(
  (
    select count(*) from private.member_favourites
    where user_id = '74300000-0000-4000-8000-000000000001'
      and place_id = '30000000-0000-4000-8000-000000000003'
  ),
  1::bigint,
  'Favorite completion is idempotent'
);

set local role anon;
select set_config(
  'test.rating_intent',
  public.create_auth_pending_intent(
    'rating',
    '30000000-0000-4000-8000-000000000003',
    2,
    repeat('b', 64),
    'create-rating',
    public.test_pending_proof(
      repeat('b', 64),
      'rating',
      '30000000-0000-4000-8000-000000000003',
      2,
      'create-rating'
    )
  ),
  true
);
reset role;

select set_config('request.jwt.claim.sub', '74300000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(
  (
    select completion_status
    from public.complete_auth_pending_intent(current_setting('test.rating_intent'), 'complete-rating')
  ),
  'queued'::text,
  'A selected rating is preserved for later application'
);
reset role;

select is(
  (
    select overall_rating from private.pending_member_rating_completions
    where member_id = '74300000-0000-4000-8000-000000000001'
  ),
  2,
  'The exact pre-authentication rating survives completion'
);

select set_config('request.jwt.claim.sub', '74300000-0000-4000-8000-000000000001', true);
set local role authenticated;
select lives_ok(
  $$select * from public.begin_current_account_deletion('delete-member', 'en', 'member-deletion-v1')$$,
  'Account deletion invokes private pending-data cleanup'
);
reset role;

select is(
  (select count(*) from private.pending_member_rating_completions where member_id = '74300000-0000-4000-8000-000000000001'),
  0::bigint,
  'Account deletion removes queued ratings'
);
select is(
  (select count(*) from private.auth_pending_intents where consumed_by = '74300000-0000-4000-8000-000000000001'),
  0::bigint,
  'Account deletion removes consumed pending intents'
);

insert into private.auth_pending_intents (
  token_hash, creator_hash, creation_request_id, action, place_id, expires_at
)
values (
  extensions.digest(convert_to('expired-cleanup-token', 'UTF8'), 'sha256'),
  extensions.digest(convert_to(repeat('c', 64), 'UTF8'), 'sha256'),
  'expired-cleanup',
  'favourite',
  '30000000-0000-4000-8000-000000000003',
  statement_timestamp() - interval '1 minute'
);

select is(private.cleanup_auth_pending_intents(1), 1, 'Bounded cleanup removes one eligible row');
select is(
  (select count(*) from private.auth_pending_intents where creation_request_id = 'expired-cleanup'),
  0::bigint,
  'Expired unconsumed intents are removed'
);

select public.create_auth_pending_intent(
  'favourite',
  '30000000-0000-4000-8000-000000000003',
  null,
  repeat('d', 64),
  'throttle-' || attempt::text,
  public.test_pending_proof(
    repeat('d', 64),
    'favourite',
    '30000000-0000-4000-8000-000000000003',
    null,
    'throttle-' || attempt::text
  )
)
from generate_series(1, 10) as attempt;

select throws_ok(
  $$select public.create_auth_pending_intent(
    'favourite',
    '30000000-0000-4000-8000-000000000003',
    null,
    repeat('d', 64),
    'throttle-11',
    public.test_pending_proof(
      repeat('d', 64),
      'favourite',
      '30000000-0000-4000-8000-000000000003',
      null,
      'throttle-11'
    )
  )$$,
  '54000',
  'Pending authentication rate limit exceeded',
  'A client with ten outstanding intents is throttled'
);

select is(
  (select count(*) from private.auth_pending_intents where creation_request_id like 'throttle-%'),
  10::bigint,
  'Throttling stores no extra intent'
);

select * from finish();

rollback;
