# Dependency review

This review records the open-source release baseline checked on 2026-07-14.
The lockfile remains the source of truth for exact package versions.

## Runtime dependencies

The application uses SvelteKit and Svelte, Supabase browser and server clients, MapLibre GL, PostHog, and the self-hosted Inter variable font package.
These direct runtime dependencies use permissive licenses or, for the font, the SIL Open Font License.

## Development dependencies

The development graph covers TypeScript, Vite, Cloudflare tooling, Supabase CLI, ESLint, Prettier, Vitest, Playwright, accessibility testing, and Tailwind CSS.
The complete installed graph contains MIT, Apache-2.0, BSD, ISC, MPL-2.0, OFL-1.1, CC0-1.0, BlueOak-1.0.0, 0BSD, and compatible dual-license packages.
No dependency reports an unknown, unlicensed, or proprietary license.

The only LGPL package is an optional prebuilt libvips binary loaded dynamically by Sharp through Miniflare and Wrangler development tooling.
It is not copied into the application source and does not change the MIT license of this repository.
Redistributors of packaged development tooling or binary deployment images must still preserve all applicable third-party notices and license terms.

## Vulnerability policy

Run `pnpm audit` against the frozen lockfile before release and dependency updates.
The release baseline overrides SvelteKit's development-only `cookie@0.6.0` edge to patched `cookie@0.7.2` because the older version has a low-severity input-validation advisory.
Do not suppress advisories without documenting the affected path, runtime exposure, and compensating controls.

## Reproducing the review

Run `pnpm install --frozen-lockfile`, `pnpm licenses list --json`, `pnpm audit --json`, and `pnpm outdated --format json`.
Review license families as well as package-specific license files before distributing a bundled binary or container image.
