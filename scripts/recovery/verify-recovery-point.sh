#!/usr/bin/env bash

# Proves a restored recovery point is coherent with the database it came from.
#
# The pre-launch contract proved absence: excluded tables restored empty and
# attribution columns restored null. This proves presence instead - every
# captured row came back, every identity reference resolves, and the schema
# contracts that the old capture had to relax are still installed.
#
# Usage: verify-recovery-point.sh <restore-db-url> <recovery-dir>

set -euo pipefail

restore_db_url="${1:-}"
dir="${2:-}"
psql_bin="${RECOVERY_PSQL:-psql}"

[[ -n "${restore_db_url}" ]] || { echo "A restore database URL is required." >&2; exit 1; }
[[ -d "${dir}" ]] || { echo "A recovery directory is required." >&2; exit 1; }

fail() {
  echo "Recovery verification failed: $1" >&2
  exit 1
}

query() {
  "${psql_bin}" -X -qAt -v ON_ERROR_STOP=1 "${restore_db_url}" -c "$1"
}

# Every identifier reaching a query is validated, whether it came from the
# catalogue or from a counts file written earlier in the run.
assert_safe_table() {
  if [[ ! "$1" =~ ^(public|private|security|auth|storage)\.[a-z_][a-z0-9_]*$ ]]; then
    fail "unsafe table identifier reached the verification boundary: $1"
  fi
}

assert_safe_column() {
  if [[ ! "$1" =~ ^[a-z_][a-z0-9_]*$ ]]; then
    fail "unsafe column identifier reached the verification boundary: $1"
  fi
}

compare_counts() {
  local expected_file="$1"
  local label="$2"
  local restored_file
  restored_file="${dir}/restored-$(basename "${expected_file}")"

  : > "${restored_file}"
  while read -r table _; do
    [[ -n "${table}" ]] || continue
    assert_safe_table "${table}"
    echo "${table} $(query "select count(*) from ${table}")" >> "${restored_file}"
  done < "${expected_file}"

  if ! diff -u "${expected_file}" "${restored_file}"; then
    fail "restored ${label} row counts do not match the capture"
  fi
}

compare_counts "${dir}/production-counts.txt" "application"
compare_counts "${dir}/auth-production-counts.txt" "managed Auth"
compare_counts "${dir}/storage-production-counts.txt" "Storage"

# Identity attribution must survive at full fidelity. This is the exact claim
# the pre-launch capture could not make.
while IFS='|' read -r table column expected; do
  [[ -n "${table}" ]] || continue
  if [[ ! "${table}" =~ ^(public|private|security)\.[a-z][a-z0-9_]*$ ]] || \
      [[ ! "${column}" =~ ^[a-z][a-z0-9_]*$ ]] || \
      [[ ! "${expected}" =~ ^[0-9]+$ ]]; then
    fail "unsafe identifier reached the attribution proof"
  fi
  actual="$(query "select count(*) from ${table} where ${column} is not null")"
  if [[ "${actual}" != "${expected}" ]]; then
    fail "${table}.${column} restored ${actual} attributed rows, captured ${expected}"
  fi
done < "${dir}/auth-attribution-counts.txt"

# Every application reference to a managed identity must resolve. Without this,
# a restore can satisfy row counts while leaving dangling members.
orphan_report="$(query "
  select child_namespace.nspname || '.' || child.relname || '.' || child_attribute.attname
  from pg_constraint constraint_row
  join pg_class child on child.oid = constraint_row.conrelid
  join pg_namespace child_namespace on child_namespace.oid = child.relnamespace
  join pg_attribute child_attribute
    on child_attribute.attrelid = child.oid
   and child_attribute.attnum = constraint_row.conkey[1]
  where constraint_row.contype = 'f'
    and constraint_row.confrelid = 'auth.users'::regclass
    and child_namespace.nspname in ('public', 'private', 'security')
    and cardinality(constraint_row.conkey) = 1")"

while read -r reference; do
  [[ -n "${reference}" ]] || continue
  column="${reference##*.}"
  table="${reference%.*}"
  assert_safe_table "${table}"
  assert_safe_column "${column}"
  orphans="$(query "
    select count(*) from ${table} child
    where child.${column} is not null
      and not exists (select 1 from auth.users u where u.id = child.${column})")"
  if [[ "${orphans}" != "0" ]]; then
    fail "${table}.${column} has ${orphans} references to identities that did not restore"
  fi
done <<< "${orphan_report}"

# Attribution nullability must come back exactly as captured. Asserting a fixed
# contract here would be wrong: uploaded_by is legitimately nullable today.
while IFS='|' read -r table column expected_nullable; do
  [[ -n "${table}" ]] || continue
  if [[ ! "${table}" =~ ^(public|private|security)\.[a-z][a-z0-9_]*$ ]] || \
      [[ ! "${column}" =~ ^[a-z][a-z0-9_]*$ ]] || \
      [[ ! "${expected_nullable}" =~ ^(YES|NO)$ ]]; then
    fail "unsafe identifier reached the attribution contract proof"
  fi
  actual_nullable="$(query "
    select is_nullable from information_schema.columns
    where table_schema = '${table%%.*}' and table_name = '${table#*.}'
      and column_name = '${column}'")"
  if [[ "${actual_nullable}" != "${expected_nullable}" ]]; then
    fail "${table}.${column} restored is_nullable=${actual_nullable}, captured ${expected_nullable}"
  fi
done < "${dir}/auth-attribution-contracts.txt"

for contract in \
  "private.place_media|place_media_approval_requires_metadata_check" \
  "private.auth_pending_intents|auth_pending_intent_lifecycle_check"; do
  table="${contract%%|*}"
  constraint_name="${contract#*|}"
  installed="$(query "
    select count(*) from pg_constraint constraint_row
    join pg_class relation_row on relation_row.oid = constraint_row.conrelid
    join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
    where namespace_row.nspname = '${table%%.*}'
      and relation_row.relname = '${table#*.}'
      and constraint_row.conname = '${constraint_name}'")"
  [[ "${installed}" == "1" ]] || fail "${constraint_name} is not installed after restore"
done

members="$(query "select count(*) from private.member_accounts")"
grants="$(query "select count(*) from security.role_grants where revoked_at is null")"
identities="$(query "select count(*) from auth.identities")"
echo "Auth-capable restore verified: ${members} Members, ${grants} active role grants, ${identities} linked identities."
