begin;

create function public.has_current_user_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case required_role
    when 'member' then security.has_role('member'::security.app_role)
    when 'trusted_contributor' then security.has_role('trusted_contributor'::security.app_role)
    when 'moderator' then security.has_role('moderator'::security.app_role)
    when 'venue_representative' then security.has_role('venue_representative'::security.app_role)
    else false
  end;
$$;

revoke execute on function public.has_current_user_role(text)
  from public, anon, service_role;

grant execute on function public.has_current_user_role(text)
  to authenticated;

comment on function public.has_current_user_role(text) is
  'Returns whether the current authenticated JWT identity has one requested application role without exposing Role Grant rows.';

commit;
