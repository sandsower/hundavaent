begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

create temporary table recovery_check_relaxations on commit drop as
with recursive hard_auth_tables(table_oid) as (
  select 'auth.users'::regclass::oid
  union
  select foreign_key.conrelid
  from hard_auth_tables hard_parent
  join pg_constraint foreign_key
    on foreign_key.contype = 'f'
   and foreign_key.confrelid = hard_parent.table_oid
  join pg_class child on child.oid = foreign_key.conrelid
  join pg_namespace child_namespace on child_namespace.oid = child.relnamespace
  where child_namespace.nspname in ('public', 'private', 'security')
    and not (
      child_namespace.nspname = 'private' and
      child.relname = 'place_media' and
      cardinality(foreign_key.conkey) = 1 and
      foreign_key.conkey[1] = (
        select attnum
        from pg_attribute
        where attrelid = foreign_key.conrelid
          and attname = 'uploaded_by'
      )
    )
    and not exists (
      select 1
      from unnest(foreign_key.conkey) as key_column(attnum)
      join pg_attribute attribute_row
        on attribute_row.attrelid = foreign_key.conrelid
       and attribute_row.attnum = key_column.attnum
      where not attribute_row.attnotnull
    )
),
nullable_auth_columns as (
  select
    foreign_key.conrelid,
    foreign_key.conkey[1] as attnum
  from hard_auth_tables hard_parent
  join pg_constraint foreign_key
    on foreign_key.contype = 'f'
   and foreign_key.confrelid = hard_parent.table_oid
  join pg_class child on child.oid = foreign_key.conrelid
  join pg_namespace child_namespace on child_namespace.oid = child.relnamespace
  join pg_attribute child_attribute
    on child_attribute.attrelid = child.oid
   and child_attribute.attnum = foreign_key.conkey[1]
  where child_namespace.nspname in ('public', 'private', 'security')
    and child.oid not in (select table_oid from hard_auth_tables)
    and cardinality(foreign_key.conkey) = 1
    and cardinality(foreign_key.confkey) = 1
    and (
      not child_attribute.attnotnull or
      (
        child_namespace.nspname = 'private' and
        child.relname = 'place_media' and
        child_attribute.attname = 'uploaded_by'
      )
    )
)
select distinct
  child_namespace.nspname::text collate "C" as schema_name,
  child.relname::text collate "C" as table_name,
  check_constraint.conname::text collate "C" as constraint_name
from nullable_auth_columns neutralized_column
join pg_constraint check_constraint
  on check_constraint.conrelid = neutralized_column.conrelid
 and check_constraint.contype = 'c'
 and neutralized_column.attnum = any(check_constraint.conkey)
join pg_class child on child.oid = check_constraint.conrelid
join pg_namespace child_namespace on child_namespace.oid = child.relnamespace;

select results_eq(
  $$
    select
      (schema_name || '.' || table_name) collate "C",
      constraint_name collate "C"
    from recovery_check_relaxations
    order by 1, 2
  $$,
  $$ values
    ('private.auth_pending_intents'::text collate "C", 'auth_pending_intent_lifecycle_check'::text collate "C"),
    ('private.place_media'::text collate "C", 'place_media_approval_requires_metadata_check'::text collate "C"),
    ('private.place_media'::text collate "C", 'place_media_evidence_provenance_check'::text collate "C"),
    ('private.place_media'::text collate "C", 'place_media_retirement_actor_check'::text collate "C")
  $$,
  'Recovery derives every check constraint that depends on neutralized Auth attribution'
);

insert into auth.users (id, email)
values ('a4400000-0000-4000-8000-000000000001', 'recovery-actor@example.invalid');

insert into private.place_media (
  id,
  place_id,
  kind,
  storage_bucket,
  storage_object_path,
  mime_type,
  byte_size,
  width_px,
  height_px,
  source_url,
  photographer_or_uploader,
  source_or_capture_date,
  license_reference,
  alt_text_is,
  alt_text_en,
  approval_state,
  approved_by,
  approved_at,
  uploaded_by,
  request_id,
  rights_basis,
  rights_evidence_reference,
  license_url,
  attribution_text,
  content_sha256,
  people_review
)
values (
  'a4400000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  'photo',
  'place-photos',
  'recovery/approved-photo.jpg',
  'image/jpeg',
  1024,
  800,
  600,
  'https://example.invalid/recovery-photo',
  'Recovery photographer',
  '2026-07-01',
  'CC BY 4.0',
  'Samþykkt endurheimtarmynd',
  'Approved recovery photo',
  'approved',
  'a4400000-0000-4000-8000-000000000001',
  now(),
  'a4400000-0000-4000-8000-000000000001',
  'a4400000-0000-4000-8000-000000000003',
  'cc_by',
  'Recovery rights evidence',
  'https://creativecommons.org/licenses/by/4.0/',
  'Recovery photographer, CC BY 4.0',
  repeat('a', 64),
  'no_prominent_people'
);

do $$
declare
  relaxed_constraint record;
begin
  for relaxed_constraint in
    select schema_name, table_name, constraint_name
    from recovery_check_relaxations
  loop
    execute format(
      'alter table %I.%I drop constraint %I',
      relaxed_constraint.schema_name,
      relaxed_constraint.table_name,
      relaxed_constraint.constraint_name
    );
  end loop;
end;
$$;

update private.place_media
set approved_by = null,
    uploaded_by = null
where id = 'a4400000-0000-4000-8000-000000000002';

select results_eq(
  $$
    select approval_state::text, approved_by is null, uploaded_by is null
    from private.place_media
    where id = 'a4400000-0000-4000-8000-000000000002'
  $$,
  $$ values ('approved'::text, true, true) $$,
  'An approved photo survives recovery when disposable Auth actors are neutralized'
);

select is(
  (
    select count(*)
    from recovery_check_relaxations relaxation
    join pg_namespace namespace_row on namespace_row.nspname = relaxation.schema_name
    join pg_class relation_row
      on relation_row.relnamespace = namespace_row.oid
     and relation_row.relname = relaxation.table_name
    join pg_constraint constraint_row
      on constraint_row.conrelid = relation_row.oid
     and constraint_row.conname = relaxation.constraint_name
  ),
  0::bigint,
  'Every audited Auth-dependent recovery check is absent before restored data is accepted'
);

select * from finish();

rollback;
