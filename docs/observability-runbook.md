# Hundavænt observability runbook

## Purpose

This runbook defines the minimum operational visibility required before the public release.
It intentionally uses the existing Cloudflare and Supabase surfaces plus a free external uptime monitor.
PostHog analytics and exception tracking are configured separately and are not duplicated here.

## Release gate

Do not remove the provisional production gate until all of these checks have evidence:

- Cloudflare Workers Logs shows a production invocation carrying the expected `APP_RELEASE` commit.
- `https://hundavaent.is/api/health` returns HTTP 200 with `status: ok` and `checks.database: ready`.
- An external uptime monitor checks that health URL and has delivered a test notification to the service owner.
- A controlled not-found response displays a request reference that matches its `x-request-id` response header.
- The service owner can find a `request.failed` record by request ID and release in Cloudflare Workers Logs.

The repository cannot create the external monitor because its account credentials are intentionally not stored here.
Monitor creation and a received test alert are therefore manual release evidence.

## Runtime signals

Application records contain only bounded operational fields.
They must never contain URLs, query strings, cookies, authorization headers, user identifiers, email addresses, coordinates, form values, provider messages, or private notes.

| Event                | Meaning                                           | Level   | Required response                                         |
| -------------------- | ------------------------------------------------- | ------- | --------------------------------------------------------- |
| `request.error`      | SvelteKit handled an unexpected server exception  | Error   | Investigate immediately when new or repeated              |
| `request.failed`     | A route intentionally returned HTTP 500 or higher | Error   | Investigate repeated failures or any public-route failure |
| `request.slow`       | A non-error response took at least 1,000 ms       | Warning | Review patterns by route and release                      |
| `health.unavailable` | The production database readiness query failed    | Error   | Treat a matching uptime alert as an incident              |

Every record includes `environment`, `release`, `requestId`, and the applicable route, status, and duration fields.
Unknown deployment metadata indicates a broken runtime binding and must be corrected before release.

## Cloudflare Workers Logs

`wrangler.toml` explicitly enables Workers Logs with full request sampling.
As of 2026-07-13, the Workers Free plan includes 200,000 log events per day with three-day retention.
Pages Functions share the Workers Free allowance of 100,000 requests per day.
See the current [Cloudflare Workers Logs documentation](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) before changing the sampling or retention strategy.

Use the Workers and Pages observability view for the `hundavaent` project.
Start incident searches with these fields:

```text
environment = "production" AND event = "request.failed"
environment = "production" AND event = "health.unavailable"
environment = "production" AND event = "request.slow" AND durationMs >= 1000
requestId = "<reference reported by the user>"
release = "<deployed commit SHA>"
```

Keep full sampling while traffic remains inside the Workers Free request allowance and application logs remain limited to failures and slow requests.
If written logs reach 50 percent of the daily allowance, first remove accidental noisy records and then lower invocation-log sampling.
Do not sample away explicit error records without adding a separate guaranteed error destination.

## External uptime monitor

Create one UptimeRobot HTTP monitor using the free plan:

- Name: `Hundavænt production health`
- URL: `https://hundavaent.is/api/health`
- Method: `GET`
- Interval: five minutes
- Expected status: HTTP 200
- Notification: the service owner's primary operational email

The endpoint already turns a database readiness failure into HTTP 503, so a status monitor covers both the application Function and its critical Supabase read path.
The map check reports configuration rather than live MapTiler reachability and must not be treated as a third-party availability probe.

Use the monitoring service's test-notification feature and retain evidence that the notification arrived.
If no test feature is available, create a temporary monitor against a known 404 path, prove the alert route, delete that monitor, and then enable the production health monitor.
Do not intentionally break the production health endpoint to test alerting.

## Initial operating targets

- Health endpoint availability: at least 99.5 percent over 30 days.
- Public route returned `5xx` rate: below 1 percent in any 10-minute window.
- Repeated identical server failure: investigate after five occurrences in 10 minutes.
- Public route response duration: investigate routes with repeated `request.slow` records.
- Oldest unresolved safety report: review daily and keep below 24 hours.
- Oldest other moderation item: review daily and keep below 48 hours.

Only availability and repeated production failures should interrupt the owner immediately.
Slow requests and moderation backlog are daily operational work, not paging events.

## Incident procedure

1. Confirm the external monitor failure from a second network or the Cloudflare dashboard.
2. Open Workers Logs and filter by `environment`, `release`, and the alert time.
3. Search `health.unavailable`, `request.failed`, and `request.error` before widening the query.
4. Use the request reference shown to a user when one is available.
5. Check Supabase and MapTiler provider status only after identifying the failing dependency or route.
6. Roll back or redeploy the last verified release when the failure began with one release and a safe rollback is available.
7. Confirm `/api/health` has recovered and wait for the external monitor to close the incident.
8. Record the cause, impact window, mitigation, and prevention work in the project issue tracker.

## Cost controls

- Keep Cloudflare Workers Logs on the free plan until traffic or required retention exceeds the included allowance.
- Do not enable Cloudflare Logpush solely for launch diagnostics.
- Do not duplicate raw Cloudflare request logs into PostHog.
- Use PostHog for product analytics and exception grouping, not as a second copy of every invocation.
- Review Cloudflare, Supabase, MapTiler, and PostHog usage monthly and whenever traffic doubles.
- Set vendor billing limits or usage alerts before attaching a payment method.

Supabase Free currently has short log retention and no automatic backups.
The production recovery workflow protects releases, but it is not continuous backup coverage.
Treat scheduled encrypted recovery points or Supabase Pro as a separate release-resilience decision.
