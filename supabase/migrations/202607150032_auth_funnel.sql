begin;

alter table private.member_provider_policy
  drop constraint member_provider_policy_supported_tuple_check;

alter table private.member_provider_policy
  add column email_enabled boolean not null default true,
  add column facebook_enabled boolean not null default true,
  add column automatic_linking_verified_email boolean not null default true;

update private.member_provider_policy
set
  policy_version = 'member-linked-providers-v2',
  email_enabled = true,
  facebook_enabled = true,
  automatic_linking_verified_email = true;

alter table private.member_provider_policy drop column provider;

alter table private.member_provider_policy
  add constraint member_provider_policy_supported_tuple_check check (
    policy_version = 'member-linked-providers-v2'
    and email_enabled
    and facebook_enabled
    and automatic_linking_verified_email
  );

drop function public.get_member_provider_policy();

create function public.get_member_provider_policy()
returns table (
  policy_version text,
  email_enabled boolean,
  facebook_enabled boolean,
  automatic_linking_verified_email boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    policy.policy_version,
    policy.email_enabled,
    policy.facebook_enabled,
    policy.automatic_linking_verified_email
  from private.member_provider_policy as policy
  where policy.singleton
$$;

revoke execute on function public.get_member_provider_policy()
from public, service_role;

grant execute on function public.get_member_provider_policy()
to anon, authenticated;

create table private.auth_pending_intents (
  token_hash bytea primary key,
  action text not null check (action in ('favourite', 'rating')),
  place_id uuid not null references private.places(id) on delete cascade,
  overall_rating integer check (
    (action = 'rating' and overall_rating between 1 and 5)
    or (action = 'favourite' and overall_rating is null)
  ),
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default (statement_timestamp() + interval '30 minutes'),
  consumed_at timestamptz,
  consumed_by uuid references private.member_accounts(user_id) on delete restrict,
  completion_status text check (completion_status in ('completed', 'queued')),
  completion_request_id text check (
    completion_request_id is null
    or (btrim(completion_request_id) <> '' and length(completion_request_id) <= 128)
  ),
  constraint auth_pending_intent_lifecycle_check check (
    (consumed_at is null and consumed_by is null and completion_status is null and completion_request_id is null)
    or (consumed_at is not null and consumed_by is not null and completion_status is not null and completion_request_id is not null)
  )
);

create index auth_pending_intents_expiry_idx
  on private.auth_pending_intents (expires_at)
  where consumed_at is null;

create table private.pending_member_rating_completions (
  member_id uuid not null references private.member_accounts(user_id) on delete restrict,
  place_id uuid not null references private.places(id) on delete restrict,
  overall_rating integer not null check (overall_rating between 1 and 5),
  request_id text not null check (btrim(request_id) <> '' and length(request_id) <= 128),
  created_at timestamptz not null default statement_timestamp(),
  applied_at timestamptz,
  primary key (member_id, place_id, request_id)
);

alter table private.auth_pending_intents enable row level security;
alter table private.pending_member_rating_completions enable row level security;

create function public.create_auth_pending_intent(
  requested_action text,
  requested_place_id uuid,
  requested_overall_rating integer default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  raw_token text;
begin
  if requested_action not in ('favourite', 'rating')
    or requested_place_id is null
    or (requested_action = 'favourite' and requested_overall_rating is not null)
    or (requested_action = 'rating' and requested_overall_rating not between 1 and 5) then
    raise exception using errcode = '22023', message = 'Valid pending authentication action required';
  end if;

  if not private.is_place_discoverable(requested_place_id) then
    raise exception using errcode = '22023', message = 'Discoverable Place required';
  end if;

  raw_token := translate(
    encode(extensions.gen_random_bytes(32), 'base64'),
    E'+/=\n',
    '-_'
  );

  insert into private.auth_pending_intents (
    token_hash,
    action,
    place_id,
    overall_rating
  ) values (
    extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'),
    requested_action,
    requested_place_id,
    requested_overall_rating
  );

  return raw_token;
end;
$$;

create function public.complete_auth_pending_intent(
  pending_token text,
  command_request_id text
)
returns table (
  action text,
  place_id uuid,
  overall_rating integer,
  completion_status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  intent private.auth_pending_intents%rowtype;
  completed_status text;
begin
  if actor_id is null or not exists (
    select 1 from private.member_accounts as member where member.user_id = actor_id
  ) then
    raise exception using errcode = '42501', message = 'Member activation required';
  end if;

  if pending_token is null or length(pending_token) < 32
    or command_request_id is null
    or btrim(command_request_id) = ''
    or length(command_request_id) > 128 then
    raise exception using errcode = '22023', message = 'Valid pending intent and request identifier required';
  end if;

  select pending.*
  into intent
  from private.auth_pending_intents as pending
  where pending.token_hash = extensions.digest(convert_to(pending_token, 'UTF8'), 'sha256')
  for update;

  if not found or intent.expires_at <= statement_timestamp() then
    return;
  end if;

  if intent.consumed_at is not null then
    if intent.consumed_by = actor_id then
      return query select intent.action, intent.place_id, intent.overall_rating, intent.completion_status;
    end if;
    return;
  end if;

  if intent.action = 'favourite' then
    insert into private.member_favourites (user_id, place_id)
    values (actor_id, intent.place_id)
    on conflict on constraint member_favourites_pkey do nothing;
    completed_status := 'completed';
  else
    insert into private.pending_member_rating_completions (
      member_id,
      place_id,
      overall_rating,
      request_id
    ) values (
      actor_id,
      intent.place_id,
      intent.overall_rating,
      command_request_id
    ) on conflict do nothing;
    completed_status := 'queued';
  end if;

  update private.auth_pending_intents as pending
  set
    consumed_at = statement_timestamp(),
    consumed_by = actor_id,
    completion_status = completed_status,
    completion_request_id = command_request_id
  where pending.token_hash = intent.token_hash;

  return query select intent.action, intent.place_id, intent.overall_rating, completed_status;
end;
$$;

create function public.get_auth_pending_intent(
  pending_token text,
  requested_locale text
)
returns table (
  action text,
  place_id uuid,
  place_name text,
  overall_rating integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pending.action,
    pending.place_id,
    translation.name,
    pending.overall_rating
  from private.auth_pending_intents as pending
  join private.place_translations as translation
    on translation.place_id = pending.place_id
   and translation.locale = case
     when requested_locale = 'en' then 'en'::private.locale_code
     else 'is'::private.locale_code
   end
  where pending.token_hash = extensions.digest(convert_to(pending_token, 'UTF8'), 'sha256')
    and pending.consumed_at is null
    and pending.expires_at > statement_timestamp()
$$;

create function public.activate_current_member_with_intent(
  activation_proof text,
  activation_request_id text,
  pending_token text
)
returns table (
  member_id uuid,
  action text,
  place_id uuid,
  overall_rating integer,
  completion_status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  activated_member_id uuid;
  completion record;
begin
  activated_member_id := public.activate_current_member(
    activation_proof,
    activation_request_id
  );

  select completed.*
  into completion
  from public.complete_auth_pending_intent(pending_token, activation_request_id) as completed;

  if not found then
    raise exception using errcode = '22023', message = 'Pending authentication action is unavailable';
  end if;

  return query select
    activated_member_id,
    completion.action,
    completion.place_id,
    completion.overall_rating,
    completion.completion_status;
end;
$$;

create or replace function public.activate_current_member(
  activation_proof text,
  activation_request_id text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  auth_created_at timestamptz;
  auth_email text;
  auth_email_confirmed_at timestamptz;
  capability_secret text;
  identity_count bigint;
  unsupported_identity_count bigint;
  mismatched_email_count bigint;
  expected_proof text;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not exists (
    select 1
    from private.member_provider_policy as policy
    where policy.singleton
      and policy.policy_version = 'member-linked-providers-v2'
      and policy.email_enabled
      and policy.facebook_enabled
      and policy.automatic_linking_verified_email
  ) then
    raise exception using errcode = '42501', message = 'Supported Member provider policy required';
  end if;

  if activation_request_id is null
    or btrim(activation_request_id) = ''
    or length(activation_request_id) > 128 then
    raise exception using errcode = '22023', message = 'Valid request identifier required';
  end if;

  if activation_proof is null or activation_proof !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '42501', message = 'Valid callback capability required';
  end if;

  select capability.secret
  into capability_secret
  from private.member_activation_capabilities as capability
  where capability.singleton;

  if capability_secret is null then
    raise exception using errcode = '42501', message = 'Callback capability unavailable';
  end if;

  select auth_user.created_at, lower(auth_user.email), auth_user.email_confirmed_at
  into auth_created_at, auth_email, auth_email_confirmed_at
  from auth.users as auth_user
  where auth_user.id = actor_id;

  if not found or auth_email is null or auth_email_confirmed_at is null then
    raise exception using errcode = '42501', message = 'Verified authenticated email required';
  end if;

  select
    count(*),
    count(*) filter (where identity_record.provider not in ('email', 'facebook')),
    count(*) filter (
      where identity_record.identity_data ? 'email'
        and lower(identity_record.identity_data ->> 'email') <> auth_email
    )
  into identity_count, unsupported_identity_count, mismatched_email_count
  from auth.identities as identity_record
  where identity_record.user_id = actor_id;

  if identity_count < 1 or unsupported_identity_count > 0 or mismatched_email_count > 0 then
    raise exception using errcode = '42501', message = 'Approved verified identities required';
  end if;

  expected_proof := encode(
    extensions.hmac(
      actor_id::text || ':' || activation_request_id || ':member-linked-providers-v2',
      capability_secret,
      'sha256'
    ),
    'hex'
  );

  if activation_proof <> expected_proof then
    raise exception using errcode = '42501', message = 'Valid callback capability required';
  end if;

  insert into private.member_accounts (user_id, created_at, updated_at)
  values (actor_id, coalesce(auth_created_at, now()), coalesce(auth_created_at, now()))
  on conflict (user_id) do nothing;

  insert into security.role_grants (user_id, role)
  values (actor_id, 'member'::security.app_role)
  on conflict (user_id, role) where revoked_at is null do nothing;

  insert into private.member_auth_events (user_id, action, request_id)
  values (actor_id, 'session.signed_in', activation_request_id)
  on conflict (user_id, action, request_id) do nothing;

  return actor_id;
end;
$$;

revoke all on private.auth_pending_intents
from public, anon, authenticated, service_role;
revoke all on private.pending_member_rating_completions
from public, anon, authenticated, service_role;

revoke execute on function public.create_auth_pending_intent(text, uuid, integer)
from public, authenticated, service_role;
revoke execute on function public.get_auth_pending_intent(text, text)
from public, authenticated, service_role;
revoke execute on function public.complete_auth_pending_intent(text, text)
from public, anon, service_role;
revoke execute on function public.activate_current_member_with_intent(text, text, text)
from public, anon, service_role;

grant execute on function public.create_auth_pending_intent(text, uuid, integer)
to anon;
grant execute on function public.get_auth_pending_intent(text, text)
to anon;
grant execute on function public.complete_auth_pending_intent(text, text)
to authenticated;
grant execute on function public.activate_current_member_with_intent(text, text, text)
to authenticated;

comment on function public.create_auth_pending_intent(text, uuid, integer) is
  'Creates one short-lived opaque authentication continuation without storing email or provider profile data.';
comment on function public.complete_auth_pending_intent(text, text) is
  'Consumes one authentication continuation exactly once after canonical Member activation.';
comment on function public.activate_current_member_with_intent(text, text, text) is
  'Atomically activates the canonical Member and consumes the exact pending authentication action.';
comment on table private.pending_member_rating_completions is
  'Integration queue for an overall rating selected before authentication. The inline-rating slice applies and marks these rows.';

commit;
