# Hundavænt

Hundavænt is a bilingual directory of trustworthy dog-access information for Places in Iceland's capital region.
The first delivery wave supports verified publication, map-first search and filtering, complete conditional access and Evidence in a floating Place card, and private Member sign-in.

## Current implementation status

The current foundation includes the complete Moderator-to-Visitor slice, bilingual map discovery, private passwordless Member accounts, favourites, freshness and dispute workflows, missing-Place Suggestions, deterministic local fixtures, accessibility and visual gates, production performance budgets, and a Cloudflare Pages build.

## Requirements

- Node.js 22 or newer.
- pnpm 11.7.0.
- Google Chrome for local browser and component tests.
- Supabase CLI when database tasks begin.

## Local setup

1. Install the exact dependency graph with `pnpm install --frozen-lockfile`.
2. Copy `.env.example` to `.env` and fill only the values needed for the task you are running.
3. Start the development server with `pnpm dev`.
4. Open `http://127.0.0.1:5173/is` for Icelandic or `http://127.0.0.1:5173/en` for English.

The public shell can render its unavailable states without Supabase or MapTiler values.
Database-backed publication, Member authentication, and the real map require their corresponding local configuration.

## Verification commands

- `pnpm check` runs Svelte and TypeScript diagnostics.
- `pnpm test:unit` runs deep-module unit contracts in Node.js.
- `pnpm test:component` mounts Svelte components in real Chrome through Vitest Browser Mode.
- `pnpm test:e2e` runs signed-out browser journeys through Playwright.
- `pnpm test:database` runs pgTAP contracts against the local Supabase database.
- `pnpm test:a11y` runs keyboard, Axe, and reduced-motion proof.
- `pnpm test:visual` compares the approved bilingual screenshot baselines.
- `pnpm test:map-smoke` runs the focused real MapLibre adapter contract.
- `pnpm test:performance` builds and tests production route budgets.
- `pnpm build` produces the Cloudflare Pages artifact in `.svelte-kit/cloudflare`.

`pnpm eval:release` is the canonical clean proof command.
It resets only the local Supabase database, runs every release gate, and writes `test-results/evaluation/manifest.json` plus stage logs and browser evidence.
The command refuses remote Supabase administration and returns a nonzero exit code when a stage or required evidence category is missing.

## Production observability

`docs/observability-runbook.md` defines the release gate, Cloudflare log events, external health monitor, initial operating targets, incident procedure, and cost controls.
The external monitor and a received test notification are manual release evidence because monitoring account credentials are not stored in this repository.

## Continuous integration

`.github/workflows/ci.yml` runs the open-source boundary, formatting, lint, type/unit/build, database, component/map, sharded end-to-end, accessibility, and bilingual visual gates in parallel jobs for pull-request and `main` feedback.
`.github/workflows/evaluation.yml` runs only by manual dispatch for an exact 40-character release candidate commit SHA.
It retains the complete ignored `test-results` evidence tree even when a gate fails.
The manual clean evaluation is the source of truth for performance budgets, complete release evidence, and manifest completeness.

## Configuration boundary

| Variable                          | Exposure                           | Purpose                                                   | Required now |
| --------------------------------- | ---------------------------------- | --------------------------------------------------------- | ------------ |
| `PUBLIC_SUPABASE_URL`             | Browser-safe                       | Supabase project URL used by caller-scoped clients        | No           |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe                       | Low-privilege Supabase key protected by RLS and grants    | No           |
| `PUBLIC_MAPTILER_KEY`             | Browser-safe but origin-restricted | Map tiles and style access                                | No           |
| `PUBLIC_MAP_STYLE_URL`            | Browser-safe                       | Approved MapTiler style URL                               | No           |
| `PUBLIC_APP_URL`                  | Browser-safe                       | Authentication callback origin                            | No           |
| `PUBLIC_POSTHOG_TOKEN`            | Browser-safe                       | PostHog project token for anonymous analytics             | No           |
| `PUBLIC_POSTHOG_HOST`             | Browser-safe                       | Secure PostHog ingestion origin                           | No           |
| `POSTHOG_API_KEY`                 | Secret, build/deployment only      | Uploads browser source maps with Error Tracking write     | No           |
| `POSTHOG_PROJECT_ID`              | Deployment metadata                | Selects the PostHog project for source-map uploads        | No           |
| `POSTHOG_HOST`                    | Build configuration                | PostHog API origin used by the source-map uploader        | No           |
| `APP_ENVIRONMENT`                 | Server configuration               | Redacted telemetry environment label                      | No           |
| `APP_RELEASE`                     | Server configuration               | Deployed commit used to correlate telemetry               | No           |
| `AUTH_FACEBOOK_ENABLED`           | Server configuration               | Enables Facebook only after provider provisioning         | No           |
| `AUTH_EMAIL_ENABLED`              | Server configuration               | Enables passwordless email after delivery configuration   | No           |
| `MEMBER_ACTIVATION_SECRET`        | Secret, server-only                | Signs callback-bound Member activation proofs             | No           |
| `SITE_GATE_PASSWORD`              | Secret, server-only                | Shared password wall for provisional deployments          | No           |
| `EVALUATION_ENABLED`              | Server/test harness                | Enables deterministic test-only routes outside production | No           |
| `EVALUATION_MODERATOR_EMAIL`      | Server/test harness                | Stable local Moderator identity                           | No           |
| `SUPABASE_SECRET_KEY`             | Secret, test/operations only       | Local fixtures and controlled evaluation administration   | No           |
| `SUPABASE_ACCESS_TOKEN`           | Secret, deployment only            | Supabase CLI access to a hosted project                   | No           |
| `SUPABASE_PROJECT_REF`            | Deployment metadata                | Identifies the separate Hundavænt Supabase project        | No           |
| `SUPABASE_DB_PASSWORD`            | Secret, deployment only            | Hosted migration access                                   | No           |
| `CLOUDFLARE_ACCOUNT_ID`           | Deployment metadata                | Identifies the Cloudflare account                         | No           |
| `CLOUDFLARE_API_TOKEN`            | Secret, deployment only            | Preview deployment access                                 | No           |

`SITE_GATE_PASSWORD` activates a shared password wall meant for provisional deployments before release.
While it is set, every route except `/gate` and `/api/health` redirects to the gate page, and all responses carry `X-Robots-Tag: noindex, nofollow`.
Rotating the password invalidates every issued gate cookie.

`PUBLIC_SUPABASE_PUBLISHABLE_KEY` is intentionally safe to expose and must be paired with least-privilege database grants and Row Level Security.
`SUPABASE_SECRET_KEY` bypasses Row Level Security and is prohibited in browser code and normal application request handlers.
It may only be used by the isolated local evaluation harness or controlled deployment operations.

## Execution-time inputs

The following inputs are intentionally deferred until the task that first uses them:

- A MapTiler key restricted to local, preview, and production Hundavænt origins.
- A PostHog EU Cloud project token for deployments where anonymous analytics should run.
- A PostHog project ID and personal API key limited to Error Tracking write access when readable production stack traces should run.
- Separate local and hosted Supabase resources that do not reuse Fundið data or secrets.
- A first Moderator email address for role provisioning.
- A reviewed Facebook application and production email sender for Member authentication.
- A Cloudflare account, API token, and independent `hundavaent` Pages project.
- Product-owner approval of the final bilingual mobile and desktop visual shell.

Missing external credentials must not block unit, component, or database work that can use deterministic local resources.
Member identity providers default off, and the application rejects concurrent Facebook and email enablement until a reviewed cross-provider identity-linking policy is implemented.
The persistent `member-single-provider-v1` tenant policy permits email only, and the callback fails closed unless the one enabled deployment provider matches that policy before and after exchange.
Changing the deployment switch alone cannot change the tenant provider boundary.
Application Member activation happens atomically with the required signed-in audit only after the validated Member callback supplies a server-signed proof.
The database independently requires the exact supported policy and exactly one email identity, so an unconsumed link, raw Auth user, or direct client RPC cannot create a Member account or Member role.
SvelteKit loads `PUBLIC_SUPABASE_URL`, `PUBLIC_MAP_STYLE_URL`, and `PUBLIC_POSTHOG_HOST` from the active environment file while compiling Content Security Policy, and explicit shell or CI values take precedence.
Production builds must therefore use the same public origins that the deployed runtime receives.

PostHog analytics initializes only when both `PUBLIC_POSTHOG_TOKEN` and `PUBLIC_POSTHOG_HOST` are configured.
It uses always-cookieless capture for aggregate pageviews and page-leave events, explicit product events, and browser error tracking.
Product events cover Place views, filters, location outcomes, saved Places, and completed Check-ins without sending raw search text, coordinates, form values, or Member identifiers.
Automatically collected URLs and error routes are stripped to their path before capture.
The integration disables broad DOM autocapture, session replay, surveys, and feature flag requests.
Production builds upload hidden browser source maps only when `POSTHOG_API_KEY` and `POSTHOG_PROJECT_ID` are both configured, then delete the local source-map files after upload.
Server-side request errors remain in the existing structured application logs and are not sent to PostHog.
Use the EU Cloud ingestion origin `https://eu.i.posthog.com` unless a separately reviewed deployment changes the data residency boundary.

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
Its Allowed HTTP origins must include `preview.hundavaent.pages.dev` and `*.hundavaent.pages.dev` so the stable branch alias and generated deployment URLs can load tiles.
Add `https://preview.hundavaent.pages.dev/**` to the dedicated Supabase project's authentication redirect allowlist before testing passwordless Moderator sign-in.

The workflow intentionally does not copy Fundid data, secrets, or resource identifiers, and it does not seed hosted data automatically.
After deployment, explicitly provision the first Moderator's private Member account, Member role, and Moderator role in the dedicated Supabase project, then use the Moderator flow to create and publish the first preview Place.
The preview workflow is then the external evidence source for visual and health approval.

## Protected production release

The manual `Hundavaent production recovery and build` workflow accepts one reviewed, full 40-character commit SHA.
Run the manual clean evaluation successfully for that exact SHA before starting the protected production workflow.
It checks out that exact commit, builds the Cloudflare Pages artifact with the protected `production` environment, creates a custom PostgreSQL dump of the `public`, `private`, `security`, and `auth` schemas, and restores that dump into an ephemeral Supabase PostgreSQL 17 container.
The workflow refuses empty or invalid dumps and requires restored application schemas plus at least one baseline Place record.
Only after the restore passes does it encrypt the dump with AES-256-CBC and retain the encrypted recovery point, its checksum manifest, and the exact Cloudflare build for 30 days.

Configure these additional GitHub `production` environment values before dispatching the workflow:

- Variable `HUNDAVAENT_PRODUCTION_SUPABASE_POOLER_HOST` for the production session-pooler hostname.
- Variable `HUNDAVAENT_PRODUCTION_POSTHOG_TOKEN` when anonymous production analytics should run.
- Variable `HUNDAVAENT_PRODUCTION_POSTHOG_PROJECT_ID` when production browser source maps should upload.
- Secret `HUNDAVAENT_PRODUCTION_POSTHOG_API_KEY` limited to Error Tracking write access when production browser source maps should upload.
- Secret `HUNDAVAENT_PRODUCTION_BACKUP_PASSPHRASE` containing a dedicated high-entropy recovery passphrase.

The workflow also uses the existing production Supabase URL, project ref, database password, publishable key, MapTiler style URL, and application URL bindings.
It does not apply database migrations and it does not deploy to Cloudflare.
An operator must inspect the retained recovery manifest, dry-run the reviewed pending migrations, apply only that migration set, and deploy the retained build artifact with the authenticated local Supabase and Wrangler CLIs.

The logical recovery artifact protects application and authentication schemas but is not a substitute for managed point-in-time recovery.
Until managed physical backups or PITR are enabled, recovery can restore only to the timestamp captured by the most recent successful workflow run.

### Recovery artifact validation

Download both retained artifacts from the successful production workflow run and work only in a private temporary directory.
First compare the encrypted dump's SHA-256 value with `ciphertext_sha256` in `recovery-manifest.json`.
Then read the production recovery passphrase without echoing it, decrypt the dump, compare the plaintext SHA-256 value with `dump_sha256`, and rerun the isolated restore verifier:

```bash
expected_ciphertext_checksum="$(jq -r '.ciphertext_sha256' recovery-manifest.json)"
actual_ciphertext_checksum="$(shasum -a 256 hundavaent-*.dump.enc | awk '{print $1}')"
test "${actual_ciphertext_checksum}" = "${expected_ciphertext_checksum}"
read -r -s BACKUP_PASSPHRASE
export BACKUP_PASSPHRASE
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -in hundavaent-*.dump.enc \
  -out hundavaent-restored.dump \
  -pass env:BACKUP_PASSPHRASE
test "$(shasum -a 256 hundavaent-restored.dump | awk '{print $1}')" = \
  "$(jq -r '.dump_sha256' recovery-manifest.json)"
scripts/verify-production-recovery.sh \
  hundavaent-restored.dump \
  recovery-validation.json \
  "$(jq -r '.release_sha' recovery-manifest.json)"
unset BACKUP_PASSPHRASE
rm -f hundavaent-restored.dump recovery-validation.json
```

Do not apply migrations until this validation succeeds.
If validation fails, discard the downloaded files, investigate the workflow run, and create a new recovery point rather than attempting a restore from an unproven artifact.

## Project documentation

`CONTEXT.md` contains the Hundavænt domain language.
Operational research, private planning artifacts, and production data are intentionally maintained outside this public repository.
