# Hundavænt deployment runbook

## Purpose

This runbook documents preview and production deployment, required environment configuration, and release recovery.
It complements the source-controlled GitHub Actions workflows, which remain the executable source of truth.

## Independent preview deployment

`wrangler.toml` is the source-controlled Pages configuration for the independent `hundavaent` project.
It targets `.svelte-kit/cloudflare`, requires the four core public runtime inputs, accepts the optional PostHog bindings, and uploads server source maps for Pages Function diagnosis.
It explicitly retains sampled invocation and application logs in Cloudflare Workers Logs, with full sampling while the application remains inside the Workers Free request allowance.
Encrypted Pages secrets are managed separately, and deployed Function logs remain available through Cloudflare's Pages logging surfaces.

The manual `Hundavaent preview` workflow uses the protected GitHub `preview` environment.
Its first approved run creates the dedicated `hundavaent` Cloudflare Pages project when missing, applies migrations to the dedicated preview Supabase project, deploys the fixed `preview` branch alias, verifies redacted application and database health, confirms preview pages are not indexed, and writes `https://preview.hundavaent.pages.dev` to the workflow summary.

Configure these GitHub environment variables:

- `HUNDAVAENT_PREVIEW_SUPABASE_PROJECT_REF`.
- `HUNDAVAENT_PREVIEW_SUPABASE_URL`, which must equal `https://<project-ref>.supabase.co`.
- `HUNDAVAENT_PREVIEW_POSTHOG_TOKEN`, when anonymous preview analytics should run.
- `HUNDAVAENT_PREVIEW_POSTHOG_PROJECT_ID`, when preview browser source maps should upload.

Configure these GitHub environment secrets:

- `HUNDAVAENT_PREVIEW_SUPABASE_ACCESS_TOKEN`.
- `HUNDAVAENT_PREVIEW_SUPABASE_DB_PASSWORD`.
- `HUNDAVAENT_PREVIEW_SUPABASE_PUBLISHABLE_KEY`.
- `HUNDAVAENT_PREVIEW_MAP_STYLE_URL`, containing the full MapTiler style URL and its protected `key` query parameter.
- `HUNDAVAENT_PREVIEW_POSTHOG_API_KEY`, limited to Error Tracking write access, when preview browser source maps should upload.
- `HUNDAVAENT_CLOUDFLARE_ACCOUNT_ID`.
- `HUNDAVAENT_CLOUDFLARE_API_TOKEN`.

Create a dedicated MapTiler key for this preview rather than reusing a Fundid or default key.
Its allowed HTTP origins must include `preview.hundavaent.pages.dev` and `*.hundavaent.pages.dev` so the stable branch alias and generated deployment URLs can load tiles.
Add `https://preview.hundavaent.pages.dev/**` to the dedicated Supabase project's authentication redirect allowlist before testing passwordless Moderator sign-in.

The workflow intentionally does not copy Fundid data, secrets, or resource identifiers, and it does not seed hosted data automatically.
After deployment, explicitly provision the first Moderator's private Member account, Member role, and Moderator role in the dedicated Supabase project, then use the Moderator flow to create and publish the first preview Place.
The preview workflow is then the external evidence source for visual and health approval.
Preview does not provision translation management secrets or seed a published translation inventory.
It intentionally serves the bundled catalogue fallback, and `/translations` remains unavailable there unless preview translation management is explicitly provisioned later.

## Protected production release

Every successful `CI` workflow for a push to `main` automatically starts the protected `Hundavaent production` workflow.
Pull request CI runs, failed CI runs, and successful CI runs for any other branch do not deploy.
The production workflow uses the completed CI run's full head SHA and verifies that exact commit independently before touching production.
Automatic runs always create a recovery point, apply migrations, and deploy to Cloudflare Pages.
The manual workflow dispatch remains available as an emergency and recovery-only path for one reviewed, full 40-character commit SHA.
Manual clean evaluation remains the canonical deeper release proof, but it does not block the pre-launch automatic deployment path.

The workflow always creates and restore-tests one consistent recovery point for the `public`, `private`, `security`, and Storage schemas before any requested migration or deployment.
Managed Supabase Auth identities and tables that are hard-owned through required Auth foreign keys are intentionally excluded while the site has only disposable pre-launch test users.
Tables reached only through nullable identity attribution remain in the recovery point, and those attribution columns are deterministically set to `NULL` in the restored data.
This preserves core Places, Place media, Evidence, and other independent application rows without retaining disposable user identities.
The recovery archive contains one explicit nullability relaxation for `private.place_media.uploaded_by` before it neutralizes that attribution; migration `202607150036_nullable_place_media_uploader.sql` converges production to the same nullable contract.
It also derives and records every check constraint that depends on a neutralized Auth column, drops only that audited set in the recovery copy, and proves those constraints are absent before accepting the restored data.

The same production snapshot derives the hard-excluded tables and nullable neutralization set, records table names, column names, row counts, audited constraint names, and recovery relaxation actions in the encrypted bundle manifest, and proves after scratch restoration that hard-owned tables are empty, retained table counts match, every nullable identity reference is neutralized, and no unhandled or composite foreign key crosses the boundary.
Both production provider variables must be exactly `false`, and the workflow rejects recovery or deployment if either email or Facebook sign-in is enabled.
Provider activation therefore requires upgrading the workflow to full Auth-capable recovery or replacing this temporary guard before either provider variable can be enabled.

After the scratch restore passes, the workflow creates a deterministic `tar.gz` archive, records its SHA-256 checksum, encrypts it with AES-256-CBC and PBKDF2, records the ciphertext checksum, and deletes every plaintext recovery file.
One artifact containing only the encrypted archive and its manifest is retained for 90 days.
For manual runs, the `migrate` and `deploy` dispatch inputs can apply the exact reviewed migration set and deploy that same SHA after recovery succeeds.

Configure these additional GitHub `production` environment values before dispatching the workflow:

- Variable `HUNDAVAENT_PRODUCTION_SUPABASE_POOLER_HOST` for the production session-pooler hostname.
- Variable `HUNDAVAENT_PRODUCTION_POSTHOG_TOKEN` when anonymous production analytics should run.
- Variable `HUNDAVAENT_PRODUCTION_POSTHOG_PROJECT_ID` when production browser source maps should upload.
- Secret `HUNDAVAENT_PRODUCTION_POSTHOG_API_KEY` limited to Error Tracking write access when production browser source maps should upload.
- Secret `HUNDAVAENT_PRODUCTION_BACKUP_PASSPHRASE` containing a dedicated high-entropy recovery passphrase.
- Secret `HUNDAVAENT_PRODUCTION_TRANSLATION_SESSION_SECRET` containing a dedicated high-entropy base64url session-signing value.
- Secret `HUNDAVAENT_PRODUCTION_TRANSLATION_DATABASE_SECRET` containing a separate high-entropy base64url database-capability value.

The workflow also uses the existing production Supabase URL, project ref, database password, publishable key, MapTiler style URL, and application URL bindings.
It binds `TRANSLATION_WORKSPACE_PASSWORD` from the existing production site-gate secret during v1.
On manual runs, leave `migrate` or `deploy` disabled when an operator wants only the encrypted recovery point.

Achievement milestone activation is a separate protected manual operation for an exact SHA that is already live and healthy in production.
Dispatch `Hundavaent production` with that full SHA, `migrate=false`, `deploy=false`, and `activate_achievement_milestones=true`.
The workflow first creates and restore-tests the normal encrypted recovery point, verifies that production health reports the requested SHA, invokes the service-role-only policy boundary, and proves both the private policy values and anonymous public feature status.
The operation is replay-safe because the policy function preserves the immutable first eligibility timestamp after activation.

Trusted Contributor activation is a separate protected manual operation for an exact SHA that is already live and healthy in production.
Dispatch `Hundavaent production` with that full SHA, `migrate=false`, `deploy=false`, `activate_achievement_milestones=false`, and `activate_trusted_contributor=true`.
The workflow first creates and restore-tests the normal encrypted recovery point, verifies that production health reports the requested SHA, invokes the service-role-only policy boundary, and proves the complete private policy tuple.
The approved policy requires five net confirmed Contributions across at least three distinct subjects and three distinct calendar months within an exact twelve-calendar-month window, with no revocation in that window.
Activation also reconciles existing qualifying Members through the immutable Achievement unlock boundary.
The operation is replay-safe because status is derived live and Achievement unlocks are unique and immutable.

The logical recovery artifact protects application data, Storage schemas, managed Auth identities and their linked providers, and every identity-owned application row with its attribution intact.
Ephemeral Auth session material is deliberately excluded, so Members re-authenticate after a restore; single-use credential tokens are redacted before retention.
It remains a point-in-time snapshot rather than a substitute for managed point-in-time recovery.
Managed PITR is not enabled and the Management API reports no physical backup available, so recovery can restore only to the timestamp captured by the most recent successful workflow run.
Running the standalone `recovery-point` job on a schedule narrows that window without enabling PITR.

`scripts/recovery/rehearse-recovery-point.sh` runs the same capture, restore, and verification scripts against the local Supabase stack, so ordering and referential-integrity faults surface before a release rather than during one.

## Recovery artifact validation

Download the single retained artifact from the successful production workflow run and work only in a private temporary directory.
First compare the encrypted archive's SHA-256 value with `ciphertext_sha256` in `recovery-manifest.json`.
Then read the production recovery passphrase without echoing it, decrypt the archive, compare its SHA-256 value with `plaintext_archive_sha256`, and extract it only after both checks pass.
Restore roles first, then the application schema, Storage schema, Storage data, and application data in that order:

```bash
expected_ciphertext_checksum="$(jq -r '.ciphertext_sha256' recovery-manifest.json)"
encrypted_archive="$(find . -maxdepth 1 -name 'hundavaent-recovery-*.tar.gz.enc' -print -quit)"
actual_ciphertext_checksum="$(shasum -a 256 "${encrypted_archive}" | awk '{print $1}')"
test "${actual_ciphertext_checksum}" = "${expected_ciphertext_checksum}"
read -r -s BACKUP_PASSPHRASE
export BACKUP_PASSPHRASE
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -in "${encrypted_archive}" \
  -out hundavaent-recovery.tar.gz \
  -pass env:BACKUP_PASSPHRASE
test "$(shasum -a 256 hundavaent-recovery.tar.gz | awk '{print $1}')" = \
  "$(jq -r '.plaintext_archive_sha256' recovery-manifest.json)"
mkdir restored
tar -xzf hundavaent-recovery.tar.gz -C restored
psql "${RESTORE_DB_URL}" -f restored/recovery/roles.sql || true
RECOVERY_ADMIN_URL="${RESTORE_DB_URL}?user=supabase_admin" \
  scripts/recovery/restore-recovery-point.sh "${RESTORE_DB_URL}" restored/recovery
scripts/recovery/verify-recovery-point.sh "${RESTORE_DB_URL}" restored/recovery
unset BACKUP_PASSPHRASE
rm -rf restored hundavaent-recovery.tar.gz
```

Do not apply migrations until this validation succeeds.
If validation fails, discard the downloaded files, investigate the workflow run, and create a new recovery point rather than attempting a restore from an unproven artifact.
