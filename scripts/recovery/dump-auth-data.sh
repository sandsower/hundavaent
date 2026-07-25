#!/usr/bin/env bash

# Emits a restorable data-only dump of the managed Auth tables the application
# depends on for a coherent recovery: the canonical identity and its linked
# providers. Ephemeral session material is deliberately excluded, and
# single-use credential tokens are redacted before they reach a retained
# artifact.
#
# Usage: dump-auth-data.sh <db-url> <output-path> [snapshot-id]

set -euo pipefail

db_url="${1:-}"
output_path="${2:-}"
recovery_snapshot="${3:-}"

[[ -n "${db_url}" ]] || { echo "A database URL is required." >&2; exit 1; }
[[ -n "${output_path}" ]] || { echo "An output path is required." >&2; exit 1; }

# Restoring sessions, refresh tokens, or in-flight PKCE state would resurrect
# authentication material that was valid at capture time but may have been
# revoked since. Members re-authenticate after a restore instead.
captured_auth_tables=(users identities)

# Single-use tokens are live credentials with no recovery value. The archive is
# encrypted, but retaining them for 90 days widens the blast radius for nothing.
redacted_auth_columns="confirmation_token,recovery_token,email_change_token_current,email_change_token_new,phone_change_token,reauthentication_token"

run_query() {
  if [[ -n "${recovery_snapshot}" ]]; then
    psql -X -qAt -v ON_ERROR_STOP=1 -v recovery_snapshot="${recovery_snapshot}" "${db_url}" <<SQL
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET TRANSACTION SNAPSHOT :'recovery_snapshot';
SET LOCAL ROLE postgres;
$1;
COMMIT;
SQL
  else
    psql -X -qAt -v ON_ERROR_STOP=1 "${db_url}" <<SQL
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
$1;
COMMIT;
SQL
  fi
}

: > "${output_path}"
printf 'SET session_replication_role = replica;\n\n' >> "${output_path}"

for table in "${captured_auth_tables[@]}"; do
  if [[ ! "${table}" =~ ^[a-z][a-z0-9_]*$ ]]; then
    echo "Unsafe Auth table name reached the capture boundary: ${table}" >&2
    exit 1
  fi

  # The restore target must receive columns in the table's own order, so the
  # COPY header and the projection are derived from the same catalogue read.
  # Generated columns are computed on write and cannot appear in COPY at all.
  column_list="$(run_query "
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'auth' and table_name = '${table}'
      and is_generated = 'NEVER'")"

  if [[ -z "${column_list}" ]]; then
    echo "Could not resolve the auth.${table} column contract." >&2
    exit 1
  fi

  projection="$(run_query "
    select string_agg(
      case
        when column_name = any(string_to_array('${redacted_auth_columns}', ','))
          then 'NULL::' || udt_name
        else quote_ident(column_name)
      end,
      ', ' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'auth' and table_name = '${table}'
      and is_generated = 'NEVER'")"

  {
    printf 'COPY "auth"."%s" (%s) FROM stdin;\n' "${table}" "${column_list}"
    run_query "COPY (select ${projection} from auth.${table}) TO STDOUT"
    printf '\\.\n\n'
  } >> "${output_path}"
done

printf 'RESET ALL;\n' >> "${output_path}"

# A redacted column must not survive as a non-null value anywhere in the dump.
for column in ${redacted_auth_columns//,/ }; do
  if grep -q "^COPY \"auth\".\"users\".*${column}" "${output_path}"; then
    continue
  fi
  echo "Redacted column ${column} is missing from the auth.users COPY header." >&2
  exit 1
done
