# Interface translation synchronization

## Authority model

The JSON catalogues in `src/lib/i18n/messages/` are the sole live and canonical interface translation source.
Public requests always render bundled JSON and never use database translation values as an override.

The production translation workspace remains a private editing and review surface for nontechnical contributors.
Making a batch ready creates an immutable source candidate, but it does not change public copy or the deployed database mirror.

Production deployment publishes the exact reviewed JSON catalogues to the database mirror and verifies every key and value.
Database drift cannot block JSON authority or remain live after a successful deployment.

## Make workspace changes ready

Review all pending Icelandic and English changes together in `/translations/review`.
Choose **Ready all changes for source** only after validation passes.

The operation creates one immutable candidate based on the current deployed JSON revision.
It clears the reviewed draft queue only after the candidate has been stored successfully.
It never moves the deployed publication pointer.

## Import a ready candidate

Run the import command from a clean branch based on the latest `main`:

```sh
TRANSLATION_DATABASE_SECRET=... pnpm translations:import-ready
```

The command discovers the public Supabase configuration from `https://hundavaent.is` and reads the latest candidate through the signed private translation capability.
It performs a three-way merge between the candidate base, the candidate values, and the current JSON files.

Independent JSON and workspace edits are preserved.
Overlapping edits to the same locale and key fail with an explicit conflict.
Both JSON files are written atomically only after every value passes validation.
Use `git diff` as the review surface, then commit and deploy normally.

The command rejects:

- missing, malformed, or already applied candidates
- candidate inventories that differ from their base
- overlapping JSON and workspace edits
- unequal JSON locale key sets
- invalid, empty, or oversized values
- placeholder changes
- malformed or non-HTTPS production configuration

## Source-authored changes

Edit the JSON catalogues directly for developer-authored copy changes.
Keep Icelandic and English key sets and placeholders aligned.
No database synchronization is required before editing because database state is never authoritative.

If a ready workspace candidate exists, the import command merges independent source edits and rejects only overlapping changes.

## Deployment behavior

The production migration job applies database migrations before synchronizing translations.
It passes the database's current deployed revision into `sync_interface_translation_inventory_from_source` inside the same transaction.
The source synchronization then publishes the exact release JSON regardless of any candidate history.

A successful deployment:

1. Creates or reuses an immutable `inventory_sync` revision containing the exact JSON catalogues.
2. Updates the deployed publication pointer and active key inventory.
3. Verifies both locale key counts and every value against JSON.
4. Marks the current source candidate as applied when all of its changed values are present in the deployed JSON.

## Verification

The public application must render bundled JSON even when the database mirror is unavailable or different.
The runtime health check independently compares both database locales with bundled JSON.
It reports `synchronized` only when revisions, key sets, and values match exactly.

## History and recovery

Translation revisions remain immutable.
Restoring an old revision copies its differences into the private draft queue and never changes live copy.
The restored drafts follow the same review, ready, import, commit, and deployment flow.

If candidate import fails, both JSON files remain untouched.
If deployment synchronization or verification fails, the deployment transaction rolls back and public rendering continues to use the previously deployed JSON bundle.
