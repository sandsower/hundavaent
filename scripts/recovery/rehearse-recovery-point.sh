#!/usr/bin/env bash

# Rehearses the Auth-capable recovery contract against the local Supabase stack.
#
# The release workflow can only prove itself during a real release, against
# credentials that are not available locally. This runs the same capture,
# restore, and verification scripts end to end so ordering, permission, and
# referential-integrity faults surface here instead of mid-release.
#
# A deterministic identity fixture is seeded first, because the local stack is
# shared and its Auth rows come and go with whatever last ran.
#
# Usage: rehearse-recovery-point.sh [source-db-url]

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
source_db_url="${1:-postgresql://postgres:postgres@127.0.0.1:55322/postgres}"
postgres_image="${RECOVERY_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.141}"

export PATH="/opt/homebrew/opt/libpq/bin:${PATH}"
psql_bin="${RECOVERY_PSQL:-psql}"

work_dir="$(mktemp -d)"
container_name="hundavaent-recovery-rehearsal-$$"
scratch_port="${RECOVERY_SCRATCH_PORT:-55399}"
scratch_url="postgresql://postgres:rehearsal@127.0.0.1:${scratch_port}/postgres"

# Namespaced so cleanup can never touch real local development rows.
fixture_prefix="dddddddd-0000-4000-8000"

cleanup() {
  set +e
  docker rm -f "${container_name}" >/dev/null 2>&1
  "${psql_bin}" -X -q "${source_db_url}" >/dev/null 2>&1 <<SQL
delete from security.role_grants where user_id::text like '${fixture_prefix}%';
delete from private.member_accounts where user_id::text like '${fixture_prefix}%';
update private.places set created_by = null where created_by::text like '${fixture_prefix}%';
delete from auth.identities where user_id::text like '${fixture_prefix}%';
delete from auth.users where id::text like '${fixture_prefix}%';
SQL
  rm -rf "${work_dir}"
}
trap cleanup EXIT

# The local stack is shared across worktrees and is reset out from under this
# script regularly. Wait for a source that can actually answer before capturing.
echo "==> Waiting for a healthy source database"
source_ready=0
for _ in {1..120}; do
  if "${psql_bin}" -X -qAt "${source_db_url}" \
      -c "select count(*) from private.places" >/dev/null 2>&1; then
    source_ready=$((source_ready + 1))
    [[ "${source_ready}" -ge 3 ]] && break
  else
    source_ready=0
  fi
  sleep 2
done
[[ "${source_ready}" -ge 3 ]] || {
  echo "The local Supabase stack never became ready at ${source_db_url}." >&2
  echo "Start it with 'supabase start', or pass a source database URL." >&2
  exit 1
}

echo "==> Seeding a deterministic identity fixture"
"${psql_bin}" -X -q -v ON_ERROR_STOP=1 "${source_db_url}" <<SQL
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
select
  '00000000-0000-0000-0000-000000000000',
  ('${fixture_prefix}-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated',
  'rehearsal-' || n || '@example.is', '',
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
from generate_series(1, 3) as n
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.id::text like '${fixture_prefix}%'
on conflict do nothing;

insert into private.member_accounts (user_id, created_at, updated_at)
select u.id, now(), now() from auth.users u
where u.id::text like '${fixture_prefix}%'
on conflict (user_id) do nothing;

insert into security.role_grants (user_id, role)
select u.id, 'moderator'::security.app_role from auth.users u
where u.id::text like '${fixture_prefix}%'
limit 1
on conflict do nothing;

update private.places
set created_by = (
  select u.id from auth.users u where u.id::text like '${fixture_prefix}%' limit 1
)
where id = (select id from private.places order by id limit 1);
SQL

"${psql_bin}" -X -qAt "${source_db_url}" -c "
  select 'seeded identities: ' || count(*) from auth.users
  where id::text like '${fixture_prefix}%'"

# The release workflow pre-places schema.sql from `supabase db dump`, and the
# capture script reuses it. Generating it here with pg_dump instead would
# rehearse a file the workflow never produces - notably pg_dump emits
# CREATE SCHEMA "public" while supabase db dump does not, which is exactly the
# kind of divergence that makes a green rehearsal meaningless.
echo "==> Producing schema.sql the way the workflow does"
mkdir -p "${work_dir}"
"${repo_root}/node_modules/.bin/supabase" db dump \
  --db-url "${source_db_url}" -f "${work_dir}/schema.sql" >/dev/null

echo "==> Capturing the recovery point"
RECOVERY_PSQL="${psql_bin}" "${script_dir}/capture-recovery-point.sh" \
  "${source_db_url}" "${work_dir}"

echo "==> Starting the scratch restore target"
docker run --detach --rm \
  --name "${container_name}" \
  --env POSTGRES_PASSWORD=rehearsal \
  --publish "${scratch_port}:5432" \
  "${postgres_image}" >/dev/null

ready=0
for _ in {1..90}; do
  if "${psql_bin}" -X -qAt "${scratch_url}" -c 'select 1' >/dev/null 2>&1; then
    ready=$((ready + 1))
    [[ "${ready}" -ge 3 ]] && break
  else
    ready=0
  fi
  sleep 1
done
[[ "${ready}" -ge 3 ]] || { echo "The scratch restore target never became ready." >&2; exit 1; }

"${psql_bin}" -X -q -v ON_ERROR_STOP=1 "${scratch_url}" \
  -c 'create extension if not exists postgis with schema extensions;' >/dev/null 2>&1 || true

echo "==> Restoring"
RECOVERY_PSQL="${psql_bin}" \
RECOVERY_ADMIN_URL="${scratch_url}?user=supabase_admin" \
"${script_dir}/restore-recovery-point.sh" \
  "${scratch_url}" "${work_dir}" > "${work_dir}/restore.log" 2>&1 || {
  echo "Restore failed. Last 40 lines:" >&2
  tail -40 "${work_dir}/restore.log" >&2
  exit 1
}

echo "==> Verifying"
RECOVERY_PSQL="${psql_bin}" "${script_dir}/verify-recovery-point.sh" \
  "${scratch_url}" "${work_dir}"

echo "Rehearsal passed."
