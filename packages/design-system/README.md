# @hundavaent/design-system

The component library and Tailwind theme carrying the hundavænt design language.
Every component styles itself through the `--hv-*` tokens (via `theme.css`'s `@theme inline` mappings), so operations-mode retunes and reduced-motion collapses flow through without component-level branching.

## Consuming

The package is source-exporting on purpose, and permanently so: the only consumer is this repository's app, which imports the Svelte sources directly through the workspace.
There is no dist build, no publish pipeline, and no compiled custom-element output.
A custom-element build was considered and rejected: it has no consumer, and the package's typed-snippet contracts (Dialog's title-XOR-labelledby union, Field's context handshake) cannot cross the custom-element boundary without forking the API.
The `hv-` custom-element prefix remains reserved for this package should that decision ever be revisited; nothing else may claim it.

## Focus ring

`theme.css` is the single owner of the focus ring: a global `:focus-visible` rule in `@layer base` (3px `--hv-focus-ring` outline, 3px offset, 2px `--hv-focus-offset` shadow).
Every surface that imports `theme.css` (the app through `app.css`, Storybook through `preview.css`) gets identical rings from the same rule.
Components never restate the ring.
Deliberate deviations are scoped component styles, which out-rank the layered base rule by design (Rating keeps a 1px offset difference; Disclosure shapes only the outline radius).

## Residency

The package holds app-agnostic primitives only.
Components that depend on app modules ($i18n, $domain, server projection types) stay app-side in their feature directories and conform to the design language through tokens and these primitives instead of moving in here; AccessSymbols and PlaceCard (both in `src/lib/discovery/`) are the settled examples.
Moving them would invert the dependency direction, so they are permanent, conformant app-side residents.

## Tokens

Token values live app-side in `src/lib/design-system/tokens.css` and are referenced (never restated) by `theme.css`.
See `theme.css`'s header for why the mappings must stay `@theme inline`.

## Scripts

- `pnpm --filter @hundavaent/design-system check` runs svelte-check over the package; CI runs it in the static job.
- `pnpm --filter @hundavaent/design-system storybook` serves the stories on port 6006 (dev needs `--host 127.0.0.1`).
- `pnpm --filter @hundavaent/design-system design-sync:build` renders the components into self-contained preview cards under `design-sync/dist/` for syncing to a Claude Design design-system project.
