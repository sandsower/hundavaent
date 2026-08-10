# Interface translation synchronization

## Authority model

The JSON catalogues in `src/lib/i18n/messages/` are the sole live and canonical interface translation source.
Public requests always render bundled JSON and never use database translation values as an override.

The in-context translation mode is a private editing and review surface for allowlisted account holders.
An approved page package creates an immutable source candidate, but it does not change public copy or the deployed database mirror.

Production deployment publishes the exact reviewed JSON catalogues to the database mirror and verifies every key and value.
Database drift cannot block JSON authority or remain live after a successful deployment.

## Access

Translation mode uses the normal Member account session.
The private server-side allowlist grants either `translator` or `translation_owner` access, and `translation_owner` includes translator access.
The initial owner account is `victor.val.mtz@gmail.com`.

Provision later collaborators through a reviewed database migration or a private production database operation.
Never put translation email addresses, roles, or capabilities in public environment configuration or client bundles.

The retired `/translations` shared-password workspace redirects to the normal product and cannot execute its previous actions.
The production application no longer receives a translation workspace password or translation session secret.

## Create and submit a page package

Sign in with an allowlisted account and choose **Translate this page** on an eligible product page.
Translation mode marks bundle-backed interface copy in place and keeps normal navigation available through **Browse page**.

Select a marker to edit Icelandic and English together.
Edits auto-save to one private, account-scoped page package without changing published copy.
Only one editable page package can be open for an account at a time.

Resolve missing values and placeholder validation errors before submitting.
Choose **Submit page package** to submit the complete page change set for review.

## Review and approve a package

A translation owner opens **Review packages** from translation mode.
Review every changed key in the page package together.

Choose **Return package** with one required overall note when revision is needed.
Choose **Approve complete package** only when the whole package is ready.
There is no partial approval or per-string discussion in the first release.

Approval creates one immutable candidate based on the deployed JSON revision.
It never moves the deployed publication pointer.

## Import an approved candidate

Run the import command from a clean branch based on the latest `main`:

```sh
TRANSLATION_DATABASE_SECRET=... pnpm translations:import-ready
```

The command discovers the public Supabase configuration from `https://hundavaent.is` and reads the latest candidate through the signed private translation capability.
It performs a three-way merge between the candidate base, the candidate values, and the current JSON files.

Independent JSON and package edits are preserved.
Overlapping edits to the same locale and key fail with an explicit conflict.
Both JSON files are written atomically only after every value passes validation.
Use `git diff` as the review surface, then commit and deploy normally.

The command rejects:

- missing, malformed, or already applied candidates
- candidate inventories that differ from their base
- overlapping JSON and package edits
- unequal JSON locale key sets
- invalid, empty, or oversized values
- placeholder changes
- malformed or non-HTTPS production configuration

## Source-authored changes

Edit the JSON catalogues directly for developer-authored copy changes.
Keep Icelandic and English key sets and placeholders aligned.
No database synchronization is required before editing because database state is never authoritative.

If an approved package candidate exists, the import command merges independent source edits and rejects only overlapping changes.

## Deployment behavior

The production migration job applies database migrations before synchronizing translations.
It passes the database's current deployed revision into `sync_interface_translation_inventory_from_source` inside the same transaction.
The source synchronization then publishes the exact release JSON regardless of candidate history.

A successful deployment:

1. Creates or reuses an immutable `inventory_sync` revision containing the exact JSON catalogues.
2. Updates the deployed publication pointer and active key inventory.
3. Verifies both locale key counts and every value against JSON.
4. Marks the approved page package and its source candidate as exported when all changed values are present in the deployed JSON.

## Verification and recovery

The public application must render bundled JSON even when the database mirror is unavailable or different.
The runtime health check independently compares both database locales with bundled JSON.
It reports `synchronized` only when revisions, key sets, and values match exactly.

Translation revisions and package lifecycle events remain immutable audit evidence.
If candidate import fails, both JSON files remain untouched.
If deployment synchronization or verification fails, the deployment transaction rolls back and public rendering continues to use the previously deployed JSON bundle.
