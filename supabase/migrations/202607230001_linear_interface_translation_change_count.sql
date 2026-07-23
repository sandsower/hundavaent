begin;

create or replace function private.interface_translation_change_count(
  previous_catalogues jsonb,
  next_catalogues jsonb
)
returns integer
language sql
immutable
set search_path = ''
as $$
  with catalogue_keys as (
    select key_name
    from pg_catalog.jsonb_object_keys(coalesce(previous_catalogues -> 'is', '{}'::jsonb))
      as previous_is_keys(key_name)
    union
    select key_name
    from pg_catalog.jsonb_object_keys(coalesce(previous_catalogues -> 'en', '{}'::jsonb))
      as previous_en_keys(key_name)
    union
    select key_name
    from pg_catalog.jsonb_object_keys(coalesce(next_catalogues -> 'is', '{}'::jsonb))
      as next_is_keys(key_name)
    union
    select key_name
    from pg_catalog.jsonb_object_keys(coalesce(next_catalogues -> 'en', '{}'::jsonb))
      as next_en_keys(key_name)
  ),
  previous_is as (
    select key_name, value
    from pg_catalog.jsonb_each(coalesce(previous_catalogues -> 'is', '{}'::jsonb))
      as entries(key_name, value)
  ),
  previous_en as (
    select key_name, value
    from pg_catalog.jsonb_each(coalesce(previous_catalogues -> 'en', '{}'::jsonb))
      as entries(key_name, value)
  ),
  next_is as (
    select key_name, value
    from pg_catalog.jsonb_each(coalesce(next_catalogues -> 'is', '{}'::jsonb))
      as entries(key_name, value)
  ),
  next_en as (
    select key_name, value
    from pg_catalog.jsonb_each(coalesce(next_catalogues -> 'en', '{}'::jsonb))
      as entries(key_name, value)
  )
  select count(*)::integer
  from catalogue_keys
  left join previous_is using (key_name)
  left join previous_en using (key_name)
  left join next_is using (key_name)
  left join next_en using (key_name)
  where previous_is.value is distinct from next_is.value
    or previous_en.value is distinct from next_en.value;
$$;

comment on function private.interface_translation_change_count(jsonb, jsonb) is
  'Counts changed translation keys after expanding each catalogue once.';

commit;
