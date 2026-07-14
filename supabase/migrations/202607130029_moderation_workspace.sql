begin;

create function public.list_moderation_queue_summary()
returns table (
  queue_id text,
  actionable_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_moderator();

  return query
  select
    'suggestions'::text,
    count(*)
  from private.place_suggestions as suggestion
  where suggestion.status = 'submitted'

  union all

  select
    'corrections-and-reports'::text,
    count(*)
  from private.place_flags as flag
  where flag.status in ('submitted', 'needs_information')

  union all

  select
    'candidate-places'::text,
    count(*)
  from private.places as place
  where place.lifecycle = 'candidate';
end;
$$;

revoke execute on function public.list_moderation_queue_summary()
  from public, anon, service_role;

grant execute on function public.list_moderation_queue_summary()
  to authenticated;

comment on function public.list_moderation_queue_summary() is
  'Moderator-only actionable totals for every implemented moderation workspace queue.';

commit;
