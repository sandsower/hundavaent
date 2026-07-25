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

## Activity depth

Every qualifying action is classified as shallow or deep.

Shallow activity is private, self-asserted, and never reviewed: a saved Favourite or a Check-in.
Deep activity enters Moderator review and can become a Contribution: a Dog-Friendliness Rating, a Suggestion, a Correction, or a Report.

`retainedMemberCount` and `engagedMemberCount` continue to count activity of any depth, so the headline series stays comparable across this change.
The shallow and deep series apply the same retention rule, the same cohort denominator, and the same suppression rule to a narrower slice of activity.

The two depth series overlap on purpose.
A Member who both saved a Favourite and filed a Correction in the qualifying weeks is counted in both, so the depth counts do not sum to the headline count.
Each depth count is always less than or equal to the headline count, because returning at one depth is also returning overall.

## Reading the depth series

The reason this split exists is that an undifferentiated retention rate cannot show whether engagement work is producing the Contributions the corpus depends on.
Shallow activity is far cheaper to perform than deep activity, so a rising headline rate is consistent with both a healthy product and one where Members return only to save Favourites.

Watch `deepRetentionRate` against `retentionRate` over successive reports.
If the deep series tracks the headline series, engagement work is reaching contribution supply.
If the headline series rises while the deep series stays flat, the additional retention is not producing reviewable work, and the mechanics driving it should be reconsidered before more are added.

Do not read a single report's deep counts as a quality signal on their own.
At current population the deep numerator is small enough that one or two Members move the rate several points.

## Failure handling

Do not paste provider responses, credentials, or raw report data into tickets or public logs.
Configuration, request, validation, and file errors are intentionally redacted.
If validation fails, stop the run and inspect the release and database migration state before trying again.

For production evidence, record only the release SHA, reporting week, command exit status, and report SHA-256.
Never attach the report itself to a pull request or issue.
