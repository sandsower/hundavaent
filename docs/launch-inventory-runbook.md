# Launch-inventory ingestion runbook

This runbook covers the external lead-file boundary and `scripts/ingest-launch-leads.ts`.
The repository does not contain researched prospects, contact notes, production exports, or operator reports.
An operator supplies a private JSON lead inventory explicitly for every audit, geocoding, ingestion, and verification command.
The ingestion pipeline creates unpublished Candidate Places for Moderator review and never publishes anything.

## Private input boundary

Store the lead inventory outside the repository and pass it with `--input`.
The file must match the schema enforced by `scripts/launch-inventory/lead-schema.ts`.
Stable `leadId` values provide idempotency and must not contain personal data.
Every lead must include provenance and an access condition, and unresolved claims must remain explicit placeholders.
Never add the private input file, a geocoding lookup file, generated reports, or hosted Place identifiers to Git.

## Geometry audit

Run the read-only audit before ingestion:

```bash
pnpm audit:launch-geometry -- --input=/absolute/path/to/private-leads.json
```

To preview deterministic matches from an HMS address export, pass the source file explicitly:

```bash
pnpm geocode:launch-inventory -- \
  --input=/absolute/path/to/private-leads.json \
  --source-file=/absolute/path/to/hms-addresses.json
```

A private `--lookups-file` JSON object may provide reviewed address or named-place overrides keyed by `leadId`.
Add `--write` only after reviewing every proposed match.
Missing and ambiguous matches fail closed.

HMS Staðfangaskrá metadata and reuse terms are published at <https://gatt.natt.is/geonetwork/srv/api/records/%7BA879D973-CA98-49D7-AA50-7BC35047E461%7D>.
Keep coordinate identifiers and a human-readable source in `location.geometryNote` so provenance reaches moderation.

## Running locally

1. Start the local Supabase stack with `pnpm exec supabase start`.
2. Apply migrations with `pnpm exec supabase db reset`.
3. Preview without writing with `pnpm ingest:launch-leads -- --input=/absolute/path/to/private-leads.json --dry-run`.
4. Ingest locally with `pnpm ingest:launch-leads -- --input=/absolute/path/to/private-leads.json`.
5. Optionally add `--report test-results/launch-inventory/report.json` for a local ignored report.
6. Prove idempotency and provenance completeness with `pnpm verify:launch-inventory -- --input=/absolute/path/to/private-leads.json`.

With no production environment variables, the ingestion script discovers the local stack and provisions an idempotent fixture Moderator.
The local provisioning path refuses non-local Supabase origins.

## Production safety

Production ingestion is a human-gated operation and must not run in default CI.
Provision a real accountable Moderator through the product's normal sign-in and role-grant flow.
Supply the production URL, publishable key, Moderator credentials, explicit private input path, `--allow-non-local`, and an ignored report path.
Review the report before handing the moderation queue to another operator.

The importer checks for Evidence carrying each stable `leadId` before creating a Candidate.
Re-running an unchanged inventory therefore skips existing leads instead of duplicating them.

## Publication boundary

A Candidate with pending geometry or placeholder access conditions is not publishable.
A Moderator must record authoritative geometry, its source, and verified access conditions before publication.
The public repository contains the validation and moderation mechanics, while operational research and production decisions remain in private systems.
