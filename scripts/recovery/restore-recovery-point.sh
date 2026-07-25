#!/usr/bin/env bash

# Restores a captured recovery point into a scratch database.
#
# Order matters: managed Auth identities must exist before the application rows
# that reference them, and every schema must exist before its data. The restore
# target ships its own auth and storage schemas, so the captured ones replace
# them rather than merging into them.
#
# Usage: restore-recovery-point.sh <restore-db-url> <recovery-dir>

set -euo pipefail

restore_db_url="${1:-}"
dir="${2:-}"
psql_bin="${RECOVERY_PSQL:-psql}"
admin_url="${RECOVERY_ADMIN_URL:-${restore_db_url}}"

[[ -n "${restore_db_url}" ]] || { echo "A restore database URL is required." >&2; exit 1; }
[[ -d "${dir}" ]] || { echo "A recovery directory is required." >&2; exit 1; }

for required in schema.sql auth-schema.sql storage-schema.sql \
  data.sql auth-data.sql storage-data.sql; do
  [[ -s "${dir}/${required}" ]] || {
    echo "Required recovery file ${required} is missing or empty." >&2
    exit 1
  }
done

run_admin() {
  "${psql_bin}" -X -v ON_ERROR_STOP=1 "${admin_url}" "$@"
}

# The restore target's own schemas are scratch state, not recovery material.
# They are dropped so the captured definitions land exactly as they were taken.
run_admin -c 'drop schema if exists auth cascade;
  drop schema if exists storage cascade;
  drop schema if exists private cascade;
  drop schema if exists security cascade;
  drop schema if exists public cascade;'

run_admin -f "${dir}/auth-schema.sql"
run_admin -f "${dir}/schema.sql"
run_admin -f "${dir}/storage-schema.sql"

# Identities first: application data references them.
run_admin -f "${dir}/auth-data.sql"
run_admin -f "${dir}/storage-data.sql"
run_admin -f "${dir}/data.sql"

echo "Restore completed into the scratch database."
