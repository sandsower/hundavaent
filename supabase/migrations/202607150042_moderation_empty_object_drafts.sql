begin;

create or replace function private.jsonb_deep_merge(base_value jsonb, patch_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(base_value) = 'object' and jsonb_typeof(patch_value) = 'object' then coalesce((
      select jsonb_object_agg(
        coalesce(base_entry.key, patch_entry.key),
        case
          when base_entry.key is null then patch_entry.value
          when patch_entry.key is null then base_entry.value
          else private.jsonb_deep_merge(base_entry.value, patch_entry.value)
        end
      )
      from jsonb_each(base_value) base_entry
      full join jsonb_each(patch_value) patch_entry using (key)
    ), '{}'::jsonb)
    else patch_value
  end;
$$;

revoke execute on function private.jsonb_deep_merge(jsonb, jsonb)
  from public, anon, authenticated, service_role;

commit;
