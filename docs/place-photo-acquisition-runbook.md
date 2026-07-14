# Place photo acquisition runbook

The acquisition command evaluates every production Place against rights-cleared Wikimedia Commons photography.
It never copies Meta or Google Maps imagery, never infers permission from a venue website, and never publishes a photo.

## Required environment

Set the same Moderator-authenticated variables used by launch inventory ingestion:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `LAUNCH_INGESTION_MODERATOR_EMAIL`
- `LAUNCH_INGESTION_MODERATOR_PASSWORD`

Do not print or store these values in reports.

## Production dry run

```sh
pnpm acquire:place-photos --dry-run --allow-non-local --report .beislid/reports/place-photo-acquisition-dry-run.json
```

Dry run reads every Place and queries Commons, but downloads no image bytes and performs no Storage or database mutation.
Review that the report accounts for every production Place and that every planned candidate identifies the intended Place.
Any `failed` outcome blocks the live run.
Unpublished Places are accounted as `search_deferred` without sending their names to Commons.

Searching unpublished Places discloses their names to Wikimedia Commons.
Run that broader search only after explicit approval of that disclosure:

```sh
pnpm acquire:place-photos --dry-run --allow-non-local --include-unpublished-external-search --report .beislid/reports/place-photo-acquisition-all-places-dry-run.json
```

## Live pending import

```sh
pnpm acquire:place-photos --live --allow-non-local --include-unpublished-external-search --report .beislid/reports/place-photo-acquisition-live.json
```

Live mode re-runs discovery and validation, downloads bounded display derivatives, hashes and deduplicates them, and registers accepted candidates as private pending photos.
It does not approve, select a primary photo, or change public output.

Immediately audit the live import:

```sh
pnpm audit:place-photos --allow-non-local --report .beislid/reports/place-photo-acquisition-audit.json
```

The immediate audit fails if any acquired row is not pending, has incomplete rights metadata, or duplicates another acquired photo hash.

## Moderator review

For each pending photo, confirm the Place match, rights basis, source page, license, attribution, bilingual description, and people-review state.
Approval remains unavailable until the people review is complete.
Select at most one approved photo as the primary Place photo.

## Failure recovery

Rerun with the same command.
Stable request IDs, source URLs, and SHA-256 values make retries idempotent.
An upload whose registration fails is removed immediately.
If cleanup itself fails, record the object path and remove that private orphan through Supabase Storage before the next run.

## Takedown

Retire the photo in the Moderator workspace.
New profile renders stop receiving a signed URL immediately, while a previously issued URL can remain valid for at most five minutes.
