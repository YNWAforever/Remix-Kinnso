# R8.0 measurement baseline operations

## Scope and activation boundary

This baseline is private, first-party traveller measurement. It has no production activation, vendor, dashboard, or raw-data export in this PR.

Run browser verification only in a local environment:

```bash
NEXT_PUBLIC_ANALYTICS_MODE=test
ANALYTICS_INGEST_MODE=test
```

For a browser run, point `E2E_BASE_URL` at an `http(s)://localhost` or `http(s)://127.0.0.1` web server; no additional flag is needed. The spec skips every remote URL before Playwright navigates, including when `ANALYTICS_E2E_TEST_MODE=true`. Hostname patterns and a caller-controlled flag cannot establish a deployment's Preview identity or its test-mode configuration. `ANALYTICS_E2E_TEST_MODE` is therefore unsupported for this spec until a verified deployment-identity mechanism exists. Never use the E2E spec against production.

Production activation requires separate approval. Only then set both modes to `production` and retain the existing server-only `SUPABASE_SERVICE_ROLE_KEY`; it must never be exposed as a public browser variable.

```bash
NEXT_PUBLIC_ANALYTICS_MODE=production
ANALYTICS_INGEST_MODE=production
SUPABASE_SERVICE_ROLE_KEY=<server-only existing key>
```

## Protected aggregate report

An active Ops user may request an aggregate-only report:

```text
GET /api/admin/analytics?from=UTC_ISO&to=UTC_ISO
```

Both timestamps are UTC ISO 8601 values. The window must be no longer than seven days. Treat an `insufficient_sample` status as intentionally non-actionable; do not try to reconstruct rates from raw events. `checkout_started` means a checkout session was created, not `payment_completed`.

Example (use an authenticated Ops session, never a service-role key in a browser):

```bash
curl --cookie "<ops-session-cookie>" \
  'https://<approved-preview-host>/api/admin/analytics?from=2026-08-01T00:00:00.000Z&to=2026-08-08T00:00:00.000Z'
```

## Retention and privacy review

Retention is enforced through the service-only `purge_traveller_analytics_events()` function. Invoke it from a server-authorized maintenance context, then verify no analytics rows older than eight days remain:

```sql
select public.purge_traveller_analytics_events();

select count(*) as rows_older_than_eight_days
from public.traveller_analytics_events
where received_at < now() - interval '8 days';
```

The absence check must return `0`. Do not grant browser roles direct access to the ledger or export raw events. Before activation, review the browser payloads for the approved event fields only and confirm they contain no email, IP address, user-agent, prompt, query, free text, payment details, or content identifiers outside the approved entity ID.
