# Hundavænt

**Find welcoming places for you and your dog.**

Hundavænt helps people discover cafés, shops, public spaces, and other places that welcome dogs across Iceland's capital region.
Browse in Icelandic or English, explore the map, and see what you need to know before you arrive.

Every listing aims to answer one simple question: can I bring my dog, and what should I know before I go?

## Find a place that fits

- Explore dog-friendly places nearby or search for somewhere specific.
- See clear access rules, opening hours, accessibility information, photos, and useful links.
- Save favourites and keep a personal history of the places you visit.
- Suggest a missing place or share a correction when something has changed.

Hundavænt is built by and for people who want it to be easier to include their dogs in everyday life.

## Project status

Hundavænt is in pre-launch.
The end-to-end product foundation is implemented, including bilingual public discovery, member features, community submissions, moderation, interface translation, automated quality gates, and Cloudflare Pages delivery.

The remaining launch work is operational rather than foundational:

- Production is still protected by a shared site gate.
- Email and Facebook sign-in are implemented but disabled by default until provider setup and recovery coverage are approved.
- MapTiler, Supabase, PostHog, Cloudflare, and external monitoring require environment-specific credentials and final owner verification.
- The current logical recovery process does not preserve managed Supabase Auth identities or every identity-bound value.

## What is implemented

### Public discovery

- Icelandic and English routes with equal-language interface catalogues.
- Map-first search and filtering for verified places.
- Conditional dog-access rules, evidence, freshness, opening hours, wheelchair accessibility, and attributed place photos.
- Responsive place cards, public website links, and graceful unavailable states when external services are not configured.

### Member experience

- Passwordless email and Facebook authentication behind server-side feature flags.
- Favourites, proximity-aware check-ins, personal history, dog-friendliness ratings, and achievements.
- Missing-place suggestions, corrections, and reports with private status tracking.

### Moderation and publishing

- A unified workbench for candidate places, suggestions, corrections, and reports.
- Evidence-backed publication, access-condition editing, place lifecycle management, and audit trails.
- A private translation workspace with draft, review, publication, history, and rollback flows.
- JSON-owned interface catalogues synchronized through the [interface translation runbook](docs/interface-translation-runbook.md).

### Delivery and operations

- Unit, component, database, end-to-end, accessibility, visual, map, and performance tests.
- Parallel pull-request CI and a manual exact-commit release evaluation.
- Protected preview and production workflows for migrations and Cloudflare Pages deployment.
- Structured application logs, a health endpoint, privacy-limited PostHog analytics, and encrypted release recovery artifacts.

## Technology

- SvelteKit 2 and Svelte 5
- TypeScript 6
- Supabase and PostgreSQL
- MapLibre GL with MapTiler-hosted styles
- Tailwind CSS 4 and repository-owned design-system CSS
- Vitest, Playwright, pgTAP, and Axe
- Cloudflare Pages

## Local development

### Requirements

- Node.js 22 or newer
- pnpm 11.7.0
- Google Chrome for component and browser tests
- Supabase CLI for database-backed development and tests

### Quick start

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

Open `http://127.0.0.1:5173/is` for Icelandic or `http://127.0.0.1:5173/en` for English.

The public shell renders useful unavailable states without Supabase or MapTiler configuration.
To work on database-backed features, start local Supabase with `pnpm exec supabase start` and copy the reported browser-safe values into `.env`.
The real map requires `PUBLIC_MAP_STYLE_URL`.
Member authentication also requires its provider configuration, feature flag, and activation secret.

See [`.env.example`](.env.example) for the complete configuration inventory and safe defaults.

## Verification

| Command                  | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| `pnpm open-source:check` | Checks the public-repository boundary         |
| `pnpm format:check`      | Checks formatting                             |
| `pnpm lint`              | Runs ESLint with zero warnings allowed        |
| `pnpm check`             | Runs Svelte and TypeScript diagnostics        |
| `pnpm test:unit`         | Runs deep-module unit contracts               |
| `pnpm test:component`    | Runs Svelte component tests in Chrome         |
| `pnpm test:database`     | Runs pgTAP contracts against local Supabase   |
| `pnpm test:e2e`          | Runs browser journeys with Playwright         |
| `pnpm test:a11y`         | Runs keyboard, Axe, and reduced-motion checks |
| `pnpm test:visual`       | Captures the named bilingual visual suite     |
| `pnpm test:map-smoke`    | Runs the real MapLibre adapter contract       |
| `pnpm test:performance`  | Builds and checks production route budgets    |
| `pnpm build`             | Produces the Cloudflare Pages artifact        |

The manually dispatched evaluation workflow is the canonical release proof for an exact commit SHA.
It runs isolated static, database, component, browser, accessibility, visual, map, and performance lanes, then writes one fail-closed evaluation manifest.

## Repository guide

| Path                       | Contents                                                  |
| -------------------------- | --------------------------------------------------------- |
| `src/routes/`              | Public, member, moderation, API, and translation routes   |
| `src/lib/`                 | Domain modules, server services, and UI components        |
| `supabase/migrations/`     | Database schema, policy, and function history             |
| `supabase/tests/database/` | pgTAP database contracts                                  |
| `tests/`                   | Unit, component, browser, accessibility, and visual tests |
| `scripts/`                 | Evaluation, inventory, media, and repository checks       |
| `.github/workflows/`       | CI, evaluation, preview, and production automation        |

## Documentation

- [`CONTEXT.md`](CONTEXT.md) defines the domain language and product boundaries.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) explains contribution expectations.
- [`SECURITY.md`](SECURITY.md) explains how to report vulnerabilities.
- [`docs/design/hundavaent-visual-north-star.md`](docs/design/hundavaent-visual-north-star.md) records the visual direction.
- [`docs/auth-provider-checklist.md`](docs/auth-provider-checklist.md) covers authentication-provider readiness.
- [`docs/launch-inventory-runbook.md`](docs/launch-inventory-runbook.md) covers launch-place ingestion.
- [`docs/place-photo-acquisition-runbook.md`](docs/place-photo-acquisition-runbook.md) covers licensed place-media acquisition.
- [`docs/member-retention-reporting-runbook.md`](docs/member-retention-reporting-runbook.md) covers privacy-suppressed Member retention reporting.
- [`docs/observability-runbook.md`](docs/observability-runbook.md) covers release signals, monitoring, and incidents.
- [`docs/deployment-runbook.md`](docs/deployment-runbook.md) covers preview, production, and recovery operations.

Operational research, private planning artifacts, credentials, and production data are intentionally kept outside this public repository.

## License

Hundavænt is available under the [MIT License](LICENSE).
