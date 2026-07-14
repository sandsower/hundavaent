#!/usr/bin/env bash

set -euo pipefail

dump_path="${1:-}"
manifest_path="${2:-}"
release_sha="${3:-}"
trusted_workflow_sha="${4:-${release_sha}}"
postgres_image="${RECOVERY_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.141@sha256:ba10e934f0a59990379f78ab9ed93926f1c291dd61a12fe4026f4202f1b89770}"

fail() {
  printf 'Recovery verification failed: %s\n' "$1" >&2
  exit 1
}

[[ -n "${dump_path}" ]] || fail "a dump path is required"
[[ -n "${manifest_path}" ]] || fail "a manifest path is required"
[[ "${release_sha}" =~ ^[0-9a-f]{40}$ ]] || fail "release SHA must be 40 lowercase hexadecimal characters"
[[ "${trusted_workflow_sha}" =~ ^[0-9a-f]{40}$ ]] || fail "trusted workflow SHA must be 40 lowercase hexadecimal characters"
[[ -s "${dump_path}" ]] || fail "dump is missing or empty"

for command in docker shasum; do
  command -v "${command}" >/dev/null 2>&1 || fail "${command} is required"
done

container_name="hundavaent-recovery-${release_sha:0:12}-${RANDOM}"
database_password="recovery-${RANDOM}-${RANDOM}"

cleanup() {
  docker rm -f "${container_name}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --detach --rm \
  --name "${container_name}" \
  --env "POSTGRES_PASSWORD=${database_password}" \
  "${postgres_image}" >/dev/null

stable_ready_count=0
for _ in {1..90}; do
  if docker exec "${container_name}" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    stable_ready_count=$((stable_ready_count + 1))
    if [[ "${stable_ready_count}" -ge 3 ]]; then
      break
    fi
  else
    stable_ready_count=0
  fi
  sleep 1
done
[[ "${stable_ready_count}" -ge 3 ]] || fail "ephemeral PostgreSQL 17 did not become ready"

docker exec "${container_name}" psql \
  -U supabase_admin \
  -d postgres \
  -v ON_ERROR_STOP=1 \
  -c "drop schema if exists private cascade; drop schema if exists security cascade; drop schema if exists auth cascade; drop schema if exists public cascade; create extension if not exists postgis with schema extensions;" \
  >/dev/null

docker exec -i "${container_name}" pg_restore \
  -U supabase_admin \
  -d postgres \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  < "${dump_path}"

schema_count="$(docker exec "${container_name}" psql -U supabase_admin -d postgres -Atc \
  "select count(*) from information_schema.schemata where schema_name in ('public', 'private', 'security', 'auth');")"
[[ "${schema_count}" == "4" ]] || fail "restored database is missing a required schema"

place_count="$(docker exec "${container_name}" psql -U supabase_admin -d postgres -Atc \
  "select count(*) from private.places;")"
[[ "${place_count}" =~ ^[0-9]+$ ]] || fail "restored Place count is invalid"
[[ "${place_count}" -gt 0 ]] || fail "restored database contains no baseline Place data"

dump_checksum="$(shasum -a 256 "${dump_path}" | awk '{print $1}')"
dump_bytes="$(wc -c < "${dump_path}" | tr -d ' ')"
verified_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

mkdir -p "$(dirname "${manifest_path}")"
printf '{\n  "release_sha": "%s",\n  "trusted_workflow_sha": "%s",\n  "dump_sha256": "%s",\n  "dump_bytes": %s,\n  "place_count": %s,\n  "verified_at": "%s",\n  "postgres_image": "%s"\n}\n' \
  "${release_sha}" \
  "${trusted_workflow_sha}" \
  "${dump_checksum}" \
  "${dump_bytes}" \
  "${place_count}" \
  "${verified_at}" \
  "${postgres_image}" \
  > "${manifest_path}"

printf 'Recovery verification passed for %s with %s Place records.\n' "${release_sha}" "${place_count}"
