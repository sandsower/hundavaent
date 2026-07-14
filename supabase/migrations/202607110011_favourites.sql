begin;

create table private.member_favourites (
  user_id uuid not null references private.member_accounts(user_id) on delete restrict,
  place_id uuid not null references private.places(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create index member_favourites_saved_order_idx
  on private.member_favourites (user_id, created_at desc, place_id desc);

alter table private.member_favourites enable row level security;

create function private.is_place_discoverable(requested_place_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.places as place_record
    join private.access_conditions as access_condition
      on access_condition.place_id = place_record.id
     and access_condition.superseded_at is null
    join private.verifications as verification
      on verification.access_condition_id = access_condition.id
     and verification.status = 'verified'::private.verification_status
     and verification.superseded_at is null
    where place_record.id = requested_place_id
      and place_record.lifecycle = 'published'::private.place_lifecycle
      and exists (
        select 1
        from private.verification_evidence as evidence_link
        where evidence_link.verification_id = verification.id
      )
  );
$$;

create function public.set_current_favourite(
  requested_place_id uuid,
  desired_state boolean
)
returns table (
  place_id uuid,
  is_favourite boolean,
  changed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  locked_lifecycle private.place_lifecycle;
  state_changed_at timestamptz;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not exists (
    select 1
    from private.member_accounts as member_account
    where member_account.user_id = actor_id
  ) then
    raise exception using errcode = '42501', message = 'Member activation required';
  end if;

  if requested_place_id is null or desired_state is null then
    raise exception using errcode = '22023', message = 'Place and desired state required';
  end if;

  if desired_state then
    select place_record.lifecycle
    into locked_lifecycle
    from private.places as place_record
    where place_record.id = requested_place_id
    for update;

    if locked_lifecycle is distinct from 'published'::private.place_lifecycle
      or not private.is_place_discoverable(requested_place_id) then
      raise exception using errcode = '22023', message = 'Discoverable Place required';
    end if;

    insert into private.member_favourites (user_id, place_id)
    values (actor_id, requested_place_id)
    on conflict on constraint member_favourites_pkey
    do update set user_id = excluded.user_id
    returning member_favourites.created_at into state_changed_at;
  else
    delete from private.member_favourites as favourite
    where favourite.user_id = actor_id
      and favourite.place_id = requested_place_id
    returning favourite.created_at into state_changed_at;

    state_changed_at := coalesce(state_changed_at, statement_timestamp());
  end if;

  return query select requested_place_id, desired_state, state_changed_at;
end;
$$;

create function public.list_current_favourite_ids()
returns table (place_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select favourite.place_id
  from private.member_favourites as favourite
  where favourite.user_id = auth.uid()
    and exists (
      select 1
      from private.member_accounts as member_account
      where member_account.user_id = auth.uid()
    )
  order by favourite.place_id;
$$;

create function public.list_current_favourites(
  requested_locale text,
  requested_limit integer default 50,
  requested_before_saved_at timestamptz default null,
  requested_before_place_id uuid default null
)
returns table (
  place_id uuid,
  name text,
  category text,
  locality text,
  saved_at timestamptz,
  availability text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    favourite.place_id,
    translation.name,
    place_record.category::text,
    location_record.locality,
    favourite.created_at,
    case
      when place_record.lifecycle = 'inactive'::private.place_lifecycle then 'inactive'
      when private.is_place_discoverable(place_record.id) then 'available'
      else 'unavailable'
    end
  from private.member_favourites as favourite
  join private.member_accounts as member_account
    on member_account.user_id = favourite.user_id
  join private.places as place_record
    on place_record.id = favourite.place_id
  join private.locations as location_record
    on location_record.id = place_record.location_id
  join private.place_translations as translation
    on translation.place_id = place_record.id
   and translation.locale = case
     when requested_locale = 'en' then 'en'::private.locale_code
     else 'is'::private.locale_code
   end
  where favourite.user_id = auth.uid()
    and (
      requested_before_saved_at is null
      or (favourite.created_at, favourite.place_id)
        < (requested_before_saved_at, requested_before_place_id)
    )
  order by favourite.created_at desc, favourite.place_id desc
  limit least(greatest(coalesce(requested_limit, 50), 0), 100);
$$;

create function private.detach_member_favourites(requested_member_id uuid)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  removed_count bigint;
begin
  delete from private.member_favourites as favourite
  where favourite.user_id = requested_member_id;

  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

revoke all on private.member_favourites from public, anon, authenticated, service_role;
revoke execute on function private.is_place_discoverable(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.detach_member_favourites(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.set_current_favourite(uuid, boolean)
  from public, anon, service_role;
revoke execute on function public.list_current_favourite_ids()
  from public, anon, service_role;
revoke execute on function public.list_current_favourites(text, integer, timestamptz, uuid)
  from public, anon, service_role;

grant execute on function public.set_current_favourite(uuid, boolean)
  to authenticated;
grant execute on function public.list_current_favourite_ids()
  to authenticated;
grant execute on function public.list_current_favourites(text, integer, timestamptz, uuid)
  to authenticated;

comment on table private.member_favourites is
  'Private caller-owned saved Place relationships with no public aggregate meaning.';
comment on function public.set_current_favourite(uuid, boolean) is
  'Idempotently applies the authenticated Member desired Favourite state.';
comment on function public.list_current_favourites(text, integer, timestamptz, uuid) is
  'Returns one bounded caller-owned saved projection without moderator-only lifecycle detail.';
comment on function private.detach_member_favourites(uuid) is
  'Ungraded account-deletion cleanup seam. This migration intentionally grants and invokes no account-deletion policy.';

commit;
