# Member retention reporting

This command produces a privacy-suppressed aggregate of meaningful Member retention.
It never exports Member identifiers, Place identifiers, request identifiers, action timestamps, or detailed histories.

## Privacy boundary

The database RPC is available only to the service role.
The service role still cannot select the private qualifying-activity sources directly.
Every cohort, rolling total, and integrity guardrail is suppressed when fewer than five Members are represented.
Suppressed numeric values are `null`.

## Local smoke run

Start the local Supabase stack, then run:

```sh
pnpm report:member-retention -- --report /tmp/member-retention-local.json
```

The command discovers local credentials through `supabase status`.
It refuses to overwrite an existing report and creates the file with mode `0600`.

## Production run

Load these values from the production secret manager without echoing them:

```sh
export PUBLIC_SUPABASE_URL='https://…'
export SUPABASE_SECRET_KEY='…'
```

Run the command only after confirming the production target:

```sh
pnpm report:member-retention -- \
  --allow-non-local \
  --report /absolute/private/path/member-retention-YYYY-MM-DD.json
```

Run once each week after the Reykjavík week has closed.
Store reports in private operational storage outside the repository and delete them under the normal retention policy.

## Field definitions

Week 1 is the Reykjavík week containing a Member's first qualifying action.
A Member is retained when they are active in at least two of Weeks 1 through 4 and are active in Week 4.
The rolling measure counts Members active in at least two of the four completed Reykjavík weeks.
Guardrails cover duplicate Check-ins, replayed requests, rejected submissions, revoked Contributions, excluded Ratings, and active conduct flags.

## Failure handling

Do not paste provider responses, credentials, or raw report data into tickets or public logs.
Configuration, request, validation, and file errors are intentionally redacted.
If validation fails, stop the run and inspect the release and database migration state before trying again.

For production evidence, record only the release SHA, reporting week, command exit status, and report SHA-256.
Never attach the report itself to a pull request or issue.
