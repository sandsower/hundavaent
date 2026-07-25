begin;

-- The caller's open flags on one Place ----------------------------------------------------------
--
-- public.list_my_place_flags is a global paginated history with no Place filter and no
-- access_condition_id column, so an inline affordance could not ask "is my Correction on this fact
-- already waiting?" without walking every flag the Member ever sent. This read answers exactly
-- that question and returns only the addressing: what was proposed is not needed to say "pending",
-- and the reader already sees the published value.
--
-- Open is read from the status enum rather than assumed: place_flag_resolution_shape defines
-- submitted and needs_information as the statuses whose resolved_at is null, and every other
-- status carries a resolution.
--
-- report_reason is returned although a Correction never sets one. Phase 3's Report affordances
-- need to tell a pending "closed" from a pending "moved", and the column costs nothing now against
-- a migration later.

create function public.list_my_open_place_flags(requested_place_id uuid)
returns table (
  kind text,
  target_kind text,
  target_field text,
  access_condition_id uuid,
  report_reason text,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := security.require_member();
begin
  if requested_place_id is null then
    raise exception using errcode = '22023', message = 'Place is invalid';
  end if;

  return query
  select
    flag.kind::text,
    flag.target_kind::text,
    flag.target_field::text,
    flag.access_condition_id,
    flag.report_reason::text,
    flag.status::text
  from private.place_flags flag
  where flag.member_id = actor_id
    and flag.place_id = requested_place_id
    and flag.status in ('submitted', 'needs_information')
  order by flag.submitted_at desc, flag.id desc;
end;
$$;

revoke execute on function public.list_my_open_place_flags(uuid) from public, anon, service_role;
grant execute on function public.list_my_open_place_flags(uuid) to authenticated;

comment on function public.list_my_open_place_flags(uuid) is
  'The calling Member own unresolved Corrections and Reports on one Place, addressing only, so an inline affordance can say a change is already pending instead of inviting a second one.';

commit;
