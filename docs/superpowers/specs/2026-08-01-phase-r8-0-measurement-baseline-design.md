# Phase R8.0 — Traveller Measurement Baseline Design

**Phase:** R8.0 — Measurement baseline and first-party funnel instrumentation  
**Status:** Approved design; implementation plan pending  
**Depends on:** latest `main` after the R7 delivery decision  
**Delivery:** one squash-merged pull request

## Objective

Create a privacy-first measurement spine for the public traveller funnel so
KINNSO can measure discovery, Agent intent, and Booking intent without a
third-party analytics vendor or raw personal data.

R7.10 is explicitly the final R7 sub-phase. Its outstanding GitHub billing and
Stripe test-secret gates remain release operations for PR 97; they are not
silently folded into R8.0 feature scope.

## Approved decisions

- **Collection:** server-validated first-party event ledger backed by Supabase.
- **Consent:** explicit opt-in; no journey ID or event request before consent.
- **Identity:** random first-party pseudonymous journey ID retained for seven
  days. It may link to an internal account ID only after sign-in; that account
  reference never comes from the browser payload.
- **Coverage:** public traveller journeys only: discovery, public entities,
  Agent entry, Booking CTA, waitlist/checkout start, and traveller sign-up.
- **Attribution:** conversion is calculated inside a seven-day journey window;
  same-session counts remain a diagnostic slice.
- **States:** Booking OFF waitlist submission and Booking ON checkout-session
  creation are separate outcomes.
- **Reporting:** deterministic aggregate queries and a baseline report; no
  dashboard in R8.0.

## Scope

### Included

1. A consent-gated browser measurement helper.
2. A server ingestion endpoint discovered through existing route conventions.
3. A private Supabase raw-event ledger relation protected by RLS and not exposed
   for public Data API reads or writes.
4. Strict validation, idempotency, lightweight throttling, and retention cleanup.
5. Deterministic seven-day aggregate queries and a read-only baseline report.
6. Local and preview-safe verification plus production activation guardrails.

### Excluded

- Vercel Analytics or another third-party vendor.
- A dashboard, experimentation, personalization, or ad attribution.
- Creator, merchant, admin, or authenticated workflow instrumentation beyond
  traveller sign-up completion.
- Raw email, IP, full user-agent, prompt text, URL query text, or arbitrary JSON.
- Product behavior changes beyond non-blocking event emission.
- Production activation without separate operational approval.

## Architecture

1. The user opts into analytics.
2. The browser creates a random journey ID and consent-version marker.
3. A helper emits only allowlisted event names and constrained metadata.
4. The server ingestion endpoint validates consent, event shape, route/entity
   references, timestamp skew, payload size, and idempotency.
5. Valid events are written with a server-only Supabase credential.
6. Admin-only aggregate queries produce the baseline report.

Event delivery is fire-and-forget. Measurement failure never blocks navigation,
forms, Agent use, waitlist capture, checkout-session creation, or sign-up. Local
and Preview deployments default to a test/discard path; only an explicitly
enabled production deployment may write the production ledger.

The implementation plan must discover existing server-route, Supabase service
client, admin-query, and scheduled-task conventions before naming concrete
files, relations, or components. It must not duplicate an audit or contribution
event model that does not match traveller analytics.

## Event taxonomy

| Event | Meaning | Required metadata |
|---|---|---|
| `journey_started` | Consent granted and journey ID created | locale, consent version |
| `entity_viewed` | Public guide, experience, creator, or article viewed | route key, entity type, entity ID, locale |
| `agent_started` | Traveller enters Agent | route key, locale |
| `booking_cta_clicked` | Booking or waitlist CTA activated | entity type, entity ID, booking state |
| `waitlist_submitted` | Booking-OFF interest capture succeeds | entity type, entity ID, outcome |
| `checkout_started` | Booking-ON checkout session created | entity type, entity ID, outcome |
| `signup_started` | Traveller sign-up begins | route key, locale |
| `signup_completed` | Traveller sign-up succeeds | route key, locale, outcome |

Unknown event names, metadata keys, free-form entity titles, and query text are
rejected. Any authenticated account reference is attached server-side only.

## Ledger and security model

The raw ledger stores only event IDs, client idempotency IDs, random journey ID,
event name, timestamp, locale, route key, optional entity type/ID, Booking state,
authenticated boolean, constrained outcome/error category, and an optional
server-derived internal account reference.

Checks enforce the allowlist, enum values, timestamp skew, journey-ID format,
and bounded text lengths. Journey ID plus client event ID is unique for retry
idempotency. Raw rows expire after seven days plus a small aggregation buffer;
aggregate output does not retain journey IDs.

RLS is enabled. Public and authenticated browser roles have no direct ledger
read/write path. Only the server ingestion path and protected aggregate queries
can access it. Aggregate views must use an RLS-safe design such as
security-invoker semantics or a non-exposed schema. The service credential is
server-only and never appears in a `NEXT_PUBLIC_` variable.

Consent revocation stops future collection and clears the local identifier;
previous raw rows expire normally.

## Metrics and baseline report

For each date range and seven-day window, report unique journeys reaching each
stage; discovery-to-entity, entity-to-Agent, entity-to-CTA, and CTA-to-outcome
rates; Booking-OFF waitlist and Booking-ON checkout-start conversion separately;
Agent-start rate; sign-up start-to-completion; rejection/error counts; and
locale, entity-type, and Booking-state slices.

Every metric declares numerator, denominator, timezone, attribution window, and
sample count. Low-volume cells are labelled `insufficient_sample`, never shown
as meaningful percentages. Checkout start is explicitly not payment completion.

## Failure handling and rollout

- No consent: no ID and no ingestion call.
- Invalid event: bounded 4xx and discard.
- Duplicate event: idempotent success without a new row.
- Temporary failure: one client retry without delaying the user flow, then drop.
- Ledger/report failure: preserve the product response and avoid payload logging.
- Measurement switch off: fail closed.
- Local/Preview: never write the production ledger.

Production activation follows local schema/RLS verification, preview smoke,
privacy review, and aggregate-query validation as a separate operational step.

## Verification strategy

### Contract tests

Test allowlists, redaction, consent transitions, invalid IDs, timestamp skew,
payload limits, idempotency, and product-response preservation when measurement
fails.

### Supabase tests

Verify the migration, RLS denial for public roles, valid server insertion,
deterministic aggregates without journey IDs, and retention cleanup.

### Browser tests

Verify no request before opt-in; discovery, entity, Agent, Booking-OFF, and
Booking-ON outcomes; successful product flows during ingestion failure; safe
sign-up linkage; and continued read-only R7.10 preview smoke.

### Build/privacy checks

Run typecheck, lint, migration verification, focused local E2E, and static scans
that reject email, IP, user-agent, prompt, and arbitrary-payload storage. No
production activation or production data write occurs in the PR.

## Acceptance criteria

1. No event path exists before explicit opt-in.
2. Accepted events match the allowlist and contain no prohibited data.
3. The server validates and idempotently stores events without public ledger access.
4. Seven-day aggregates match deterministic fixtures.
5. Booking OFF and ON outcomes are separate and accurate.
6. Revocation stops collection and clears the journey ID.
7. Local/Preview cannot write production rows.
8. Retention and RLS tests pass.
9. The report handles insufficient samples honestly.
10. Existing public UX, R7.10 accessibility, and read-only preview contracts remain green.

## Delivery boundary

R8.0 is one focused measurement-baseline PR. Dashboards, creator/merchant
instrumentation, authenticated quality monitoring, and third-party providers
are later phases and must not expand this PR retroactively.
