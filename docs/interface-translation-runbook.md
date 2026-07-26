# Interface translation synchronization

## Authority model

The JSON catalogues in `src/lib/i18n/messages/` are the canonical interface translation history.

The production translation workspace remains an editing surface for nontechnical contributors.
A workspace publication becomes visible immediately through the database-backed runtime catalogue.
That database publication is temporary drift until it has been synchronized into JSON, reviewed, merged, and deployed.

Production deployment publishes the exact reviewed JSON catalogues back to the database.
It does not silently preserve different database values.

## Synchronize a workspace publication

Run the synchronization command from a clean branch based on the latest `main`:

```sh
pnpm translations:sync-from-production
```

The command discovers the public Supabase configuration from `https://hundavaent.is`, fetches the current Icelandic and English publication, validates it, and writes both JSON catalogues.
It also writes `src/lib/i18n/messages/production-baseline.json` with the immutable production revision and a deterministic catalogue hash.

The command always writes validated production values.
It has no preview mode.
Use `git diff` as the review surface after it completes.

The command rejects:

- different publication revisions between locales
- different database key sets between locales
- database keys unknown to JSON
- empty or oversized values
- placeholder changes
- malformed or non-HTTPS production configuration

JSON-only keys are preserved when source changes have introduced keys that are not deployed yet.

Commit the two catalogues and the baseline metadata together.
Do not hand-edit the baseline file.

## Add source-authored translation changes

Synchronize production before making source-authored translation changes whenever the workspace may have changed.

After synchronization, edit the JSON catalogues normally and keep locale keys and placeholders aligned.
The checked-in baseline continues to identify the database revision on top of which those source changes were made.

If another workspace publication occurs before deployment, the deployment fails instead of overwriting it.
Run the synchronization command again, reconcile the resulting JSON diff, and update the pull request.

## Deployment behavior

The production migration job applies database migrations before synchronizing translations.
It then calls `sync_interface_translation_inventory_from_source` with the checked-in baseline revision and the release SHA.

The database function uses the following rules:

1. An existing `inventory_sync` publication may be replaced by newer reviewed JSON.
2. A workspace `publish` or `restore` revision must match the checked-in baseline revision.
3. A newer unmatched workspace revision blocks deployment with a serialization conflict.
4. A successful deployment creates an immutable `inventory_sync` revision containing the exact JSON catalogues.
5. A successful deployment updates the active key inventory and removes drafts only for deleted keys.

This allows workspace edits to go live first while making Git the durable reviewed record.

## Verification

After deployment, verify both locales through `get_published_interface_translations`.

The production revision must be shared by both locales.
The key sets and values must match the deployed JSON catalogues exactly.
The runtime health check must continue to report published interface translations.

## Recovery

If the synchronization command fails, it does not write any catalogue until all production data has passed validation.
Fix the reported production or source contract problem and run it again.

If deployment reports `Published interface translations changed after JSON synchronization`, do not retry by bypassing the guard.
Synchronize the newer publication into JSON, review the change, and deploy the updated branch.

Historical database revisions remain immutable and can still be restored through the translation workspace.
A restored revision must then be synchronized into JSON before the next deployment.
