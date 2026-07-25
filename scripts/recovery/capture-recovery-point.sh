#!/usr/bin/env bash

# Captures an Auth-capable logical recovery point: application schema and data,
# the managed Auth schema and the identity rows the application depends on, and
# the Storage schema and data.
#
# Unlike the pre-launch capture this replaces, nothing is excluded and nothing
# is neutralized. Identity-owned application rows and identity-attribution
# columns are captured at full fidelity, so a restore reproduces Moderators,
# role grants, moderation history, and authorship.
#
# Usage: capture-recovery-point.sh <db-url> <output-dir> [snapshot-id]

set -euo pipefail

db_url="${1:-}"
out_dir="${2:-}"
recovery_snapshot="${3:-}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
psql_bin="${RECOVERY_PSQL:-psql}"
pg_dump_bin="${RECOVERY_PG_DUMP:-pg_dump}"

[[ -n "${db_url}" ]] || { echo "A database URL is required." >&2; exit 1; }
[[ -n "${out_dir}" ]] || { echo "An output directory is required." >&2; exit 1; }

application_schemas="public|private|security"
mkdir -p "${out_dir}"

snapshot_args=()
[[ -n "${recovery_snapshot}" ]] && snapshot_args=(--snapshot "${recovery_snapshot}")

run_query() {
  if [[ -n "${recovery_snapshot}" ]]; then
    "${psql_bin}" -X -qAt -v ON_ERROR_STOP=1 -v recovery_snapshot="${recovery_snapshot}" "${db_url}" <<SQL
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET TRANSACTION SNAPSHOT :'recovery_snapshot';
SET LOCAL ROLE postgres;
$1;
COMMIT;
SQL
  else
    "${psql_bin}" -X -qAt -v ON_ERROR_STOP=1 "${db_url}" -c "$1"
  fi
}

dump_schema() {
  "${pg_dump_bin}" --dbname "${db_url}" --schema-only --quote-all-identifier \
    --schema "$1" ${snapshot_args[@]+"${snapshot_args[@]}"} |
    sed -E 's/^\\(un)?restrict .*$/-- &/' > "$2"
}

dump_data() {
  {
    printf 'SET session_replication_role = replica;\n\n'
    "${pg_dump_bin}" --dbname "${db_url}" --data-only --quote-all-identifier \
      --schema "$1" ${snapshot_args[@]+"${snapshot_args[@]}"} |
      sed -E 's/^\\(un)?restrict .*$/-- &/'
    printf '\nRESET ALL;\n'
  } > "$2"
}

# Catalogue-sourced names are still validated before interpolation. The old
# inline workflow guarded every such boundary; keeping that here costs nothing
# and prevents an unexpected identifier reaching a query unquoted.
assert_safe_identifier() {
  if [[ ! "$1" =~ ^(public|private|security|auth|storage)\.[a-z_][a-z0-9_]*$ ]]; then
    echo "Unsafe identifier reached the recovery capture boundary: $1" >&2
    exit 1
  fi
}

count_schema_tables() {
  run_query "
    select n.nspname || '.' || c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ($1)" |
    while read -r table; do
      [[ -n "${table}" ]] || continue
      assert_safe_identifier "${table}"
      echo "${table} $(run_query "select count(*) from ${table}")"
    done | sort
}

# The release workflow produces the application schema with `supabase db dump`,
# which handles extension and publication details that a plain pg_dump misses.
# It writes schema.sql before calling this script; anything else generates it.
if [[ ! -s "${out_dir}/schema.sql" ]]; then
  dump_schema "${application_schemas}" "${out_dir}/schema.sql"
fi
dump_schema "auth" "${out_dir}/auth-schema.sql"
dump_schema "storage" "${out_dir}/storage-schema.sql"

dump_data "${application_schemas}" "${out_dir}/data.sql"
dump_data "storage" "${out_dir}/storage-data.sql"
RECOVERY_PSQL="${psql_bin}" "${script_dir}/dump-auth-data.sh" \
  "${db_url}" "${out_dir}/auth-data.sql" "${recovery_snapshot}"

count_schema_tables "'public', 'private', 'security'" > "${out_dir}/production-counts.txt"
count_schema_tables "'storage'" > "${out_dir}/storage-production-counts.txt"

# Storage recovery has to reproduce the definition, not only the rows.
run_query "
  select 'column ' || table_schema || '.' || table_name || '.' || column_name ||
    ' ' || udt_schema || '.' || udt_name || ' ' || is_nullable
  from information_schema.columns
  where table_schema = 'storage'
  union all
  select 'policy ' || schemaname || '.' || tablename || '.' || policyname ||
    ' ' || permissive || ' ' || array_to_string(roles, ',') || ' ' || cmd ||
    ' ' || quote_nullable(qual) || ' ' || quote_nullable(with_check)
  from pg_policies
  where schemaname = 'storage'
  order by 1" > "${out_dir}/storage-production-schema.txt"

# Only the captured Auth tables are asserted; the rest of the managed schema is
# intentionally ephemeral and must not be claimed as recovered.
{
  echo "auth.users $(run_query 'select count(*) from auth.users')"
  echo "auth.identities $(run_query 'select count(*) from auth.identities')"
} > "${out_dir}/auth-production-counts.txt"

# The attribution that the previous capture destroyed. Recording it here turns
# "identity attribution survived the restore" into a checkable claim.
{
  echo "private.places|created_by|$(run_query \
    'select count(*) from private.places where created_by is not null')"
  echo "private.place_media|uploaded_by|$(run_query \
    'select count(*) from private.place_media where uploaded_by is not null')"
  echo "security.role_grants|user_id|$(run_query \
    'select count(*) from security.role_grants where user_id is not null')"
} > "${out_dir}/auth-attribution-counts.txt"

# Nullability of the identity-attribution columns is a contract the restore must
# reproduce exactly. It is recorded rather than assumed, because
# 202607150036_nullable_place_media_uploader.sql relaxed one of them purely to
# accommodate the lossy pre-launch capture this replaces.
run_query "
  select table_schema || '.' || table_name || '|' || column_name || '|' || is_nullable
  from information_schema.columns
  where (table_schema, table_name, column_name) in (
    ('private', 'place_media', 'uploaded_by'),
    ('private', 'places', 'created_by'),
    ('security', 'role_grants', 'user_id')
  )
  order by 1" > "${out_dir}/auth-attribution-contracts.txt"

for required in schema.sql auth-schema.sql storage-schema.sql data.sql auth-data.sql \
  storage-data.sql production-counts.txt auth-production-counts.txt \
  auth-attribution-counts.txt auth-attribution-contracts.txt; do
  if [[ ! -s "${out_dir}/${required}" ]]; then
    echo "Recovery capture produced no ${required}." >&2
    exit 1
  fi
done

# A capture that still neutralizes identity attribution is the old contract and
# must never be published as Auth-capable.
if grep -Eq '^ALTER TABLE .* DROP (NOT NULL|CONSTRAINT)' "${out_dir}/data.sql" || \
    grep -Eq 'SET "[a-z_]+" = NULL WHERE' "${out_dir}/data.sql"; then
  echo "Auth-capable capture must not neutralize identity attribution." >&2
  exit 1
fi

# Row-level proof that each dump file actually carries the rows the catalogue
# reported, checked while the capture snapshot is still open.
repo_root="$(cd "${script_dir}/../.." && pwd)"
verify_copy_dump="${repo_root}/scripts/verify-recovery-copy-dump.ts"
node --experimental-strip-types "${verify_copy_dump}" \
  "${out_dir}/data.sql" "${out_dir}/production-counts.txt" "${out_dir}/dump-counts.txt"
node --experimental-strip-types "${verify_copy_dump}" \
  "${out_dir}/storage-data.sql" "${out_dir}/storage-production-counts.txt" \
  "${out_dir}/storage-dump-counts.txt"
node --experimental-strip-types "${verify_copy_dump}" \
  "${out_dir}/auth-data.sql" "${out_dir}/auth-production-counts.txt" \
  "${out_dir}/auth-dump-counts.txt"
