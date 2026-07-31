# Phase R8.0 Traveller Measurement Baseline Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a consent-gated, first-party traveller-funnel measurement spine with a private Supabase event ledger, deterministic seven-day aggregates, and a protected baseline report without changing product outcomes or activating production collection.

**Architecture:** The browser owns only a random seven-day journey ID and an explicit consent marker. A strict allowlisted client helper sends flat event payloads to POST /api/analytics; the route validates the payload, derives authentication/account linkage server-side, applies a journey-scoped throttle, and upserts through the existing service-role client. A Supabase migration keeps the ledger inaccessible to browser roles and exposes only an ops-gated aggregate RPC consumed by a read-only admin analytics API route; no dashboard or third-party vendor is added.

**Tech Stack:** Next.js 16 App Router, React 19 client components, TypeScript, Zod, Supabase/Postgres migrations and RPCs, Vitest, Testing Library, Playwright.

## Global Constraints

- Collection is explicit opt-in. No journey ID, consent storage value, or event request may exist before acceptance.
- The browser payload may contain only the eight approved event names and constrained flat fields: locale, route key, entity type/id, Booking state, outcome/error category, consent version, journey ID, client event ID, and timestamp.
- Never store or log raw email, IP address, full user-agent, prompt text, URL query text, entity titles, or arbitrary JSON in the analytics path.
- Journey attribution is seven days. Raw rows expire after seven days plus a one-day aggregation buffer; aggregate rows never contain journey IDs.
- Booking OFF waitlist submission and Booking ON checkout-session creation remain separate outcomes. Checkout start is not payment completion.
- Measurement failures are fire-and-forget and never block navigation, Agent use, waitlist capture, checkout, or sign-up.
- Local and Preview use disabled or test mode and cannot write production ledger rows. Production mode is a separate operational approval after the PR.
- Use the existing Supabase conventions: public reads through anon/RLS, server-only service client for documented exceptions, and is_active_ops() inside protected SECURITY DEFINER RPCs.
- Every new user-facing string goes into all seven message files: en, zh-hk, zh-tw, ja, ko, th, and zh-cn. The existing recursive locale-parity test must remain green.
- Use Vitest tests per web surface and an apps/e2e/specs Playwright test for consent/request behavior. Keep the existing R7.10 preview smoke read-only.
- Use Conventional Commits with a scope; implementation is one squash-merged Phase R8.0 PR.

---

### Task 1: Define the analytics contract and environment modes

**Files:**
- Create: apps/web/lib/analytics/contracts.ts
- Create: apps/web/lib/analytics/config.ts
- Create: apps/web/tests/analytics.contracts.test.ts
- Modify: apps/web/.env.example
- Modify: apps/web/.env.test

**Interfaces:**
- Produces TRAVELLER_ANALYTICS_EVENTS, TravellerAnalyticsEventName, TravellerAnalyticsPayload, travellerAnalyticsPayloadSchema, and getAnalyticsMode().
- Later tasks import these types instead of defining event names or payload keys locally.

- [ ] Step 1: Write failing contract tests for the exact eight-event allowlist, strict rejection of unknown keys/free-form metadata, valid locale and enum parsing, and disabled mode defaults.

~~~ts
expect(TRAVELLER_ANALYTICS_EVENTS).toEqual([
  'journey_started',
  'entity_viewed',
  'agent_started',
  'booking_cta_clicked',
  'waitlist_submitted',
  'checkout_started',
  'signup_started',
  'signup_completed',
])
expect(travellerAnalyticsPayloadSchema.safeParse({
  clientEventId: '00000000-0000-4000-8000-000000000001',
  journeyId: '00000000-0000-4000-8000-000000000002',
  consentVersion: 'v1',
  event: 'entity_viewed',
  occurredAt: '2026-08-01T00:00:00.000Z',
  locale: 'en',
  routeKey: 'article_detail',
  email: 'blocked@example.com',
}).success).toBe(false)
expect(getAnalyticsMode({})).toBe('disabled')
~~~

Run: pnpm --filter web test -- analytics.contracts.test.ts
Expected: FAIL because the modules do not exist.

- [ ] Step 2: Implement a strict Zod schema with UUID IDs, ISO timestamp, seven-locale enum, route-key regex, entity-type enum guide/experience/creator/article, Booking state enum off/on, outcome enum created/submitted/success/error, error-category enum invalid/rate_limited/unavailable/unknown, and schema strictness that rejects arbitrary keys.

~~~ts
export const TRAVELLER_ANALYTICS_EVENTS = [
  'journey_started',
  'entity_viewed',
  'agent_started',
  'booking_cta_clicked',
  'waitlist_submitted',
  'checkout_started',
  'signup_started',
  'signup_completed',
] as const

export const travellerAnalyticsPayloadSchema = z.object({
  clientEventId: z.string().uuid(),
  journeyId: z.string().uuid(),
  consentVersion: z.literal('v1'),
  event: z.enum(TRAVELLER_ANALYTICS_EVENTS),
  occurredAt: z.string().datetime({ offset: true }),
  locale: z.enum(['en', 'zh-hk', 'zh-tw', 'ja', 'ko', 'th', 'zh-cn']),
  routeKey: z.string().regex(/^[a-z0-9_/-]{1,80}$/),
  entityType: z.enum(['guide', 'experience', 'creator', 'article']).optional(),
  entityId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/).optional(),
  bookingState: z.enum(['off', 'on']).optional(),
  outcome: z.enum(['created', 'submitted', 'success', 'error']).optional(),
  errorCategory: z.enum(['invalid', 'rate_limited', 'unavailable', 'unknown']).optional(),
}).strict()
~~~

Export the inferred payload and event-name types. Implement getAnalyticsMode so only disabled, test, and production are accepted; every other value fails closed to disabled.

- [ ] Step 3: Add NEXT_PUBLIC_ANALYTICS_MODE=disabled and ANALYTICS_INGEST_MODE=disabled to apps/web/.env.example, and test values to apps/web/.env.test. Run the focused test and web typecheck.

~~~bash
pnpm --filter web test -- analytics.contracts.test.ts
pnpm --filter web typecheck
~~~

- [ ] Step 4: Commit.

~~~bash
git add apps/web/lib/analytics apps/web/tests/analytics.contracts.test.ts apps/web/.env.example apps/web/.env.test
git commit -m "feat(r8.0): define traveller analytics contract"
~~~

---

### Task 2: Add the private event ledger, throttle, aggregate RPC, and generated types

**Files:**
- Create: supabase/migrations/20260801090000_r8_0_measurement_baseline.sql
- Modify: packages/db/types.ts using the existing @kinnso/db generator
- Create: apps/web/tests/db.r8-0-measurement-baseline.test.ts

**Interfaces:**
- Produces public.traveller_analytics_events, public.traveller_analytics_rate_limits, check_and_increment_traveller_analytics_rate_limit(uuid, integer, integer), purge_traveller_analytics_events(), and admin_traveller_analytics_report(timestamptz, timestamptz).
- The ingest route uses the table and throttle function; the ops report route uses only the aggregate RPC.

- [ ] Step 1: Write a migration contract test that reads the UTF-8 SQL file and asserts RLS, browser-role revokes, service-role grant, all eight event names, the unique retry key, eight-day retention, and the is_active_ops guard. Run it and verify it fails before the migration exists.

- [ ] Step 2: Create public.traveller_analytics_events with UUID IDs, client_event_id, journey_id, consent_version, event_name, occurred_at, received_at, locale, route_key, entity_type/id, booking_state, authenticated, outcome, error_category, and server-derived account_id. Add a unique (journey_id, client_event_id) constraint and indexes on occurred_at and event_name/occurred_at. Do not add email, IP, user-agent, prompt, title, query, or JSON payload columns.

~~~sql
alter table public.traveller_analytics_events enable row level security;
revoke all on table public.traveller_analytics_events from anon, authenticated;
grant all on table public.traveller_analytics_events to service_role;
~~~

Create public.traveller_analytics_rate_limits keyed only by journey_id. Enable RLS, define no browser policies, and revoke browser table access.

- [ ] Step 3: Add check_and_increment_traveller_analytics_rate_limit as SECURITY DEFINER with search_path public, granted to anon and authenticated, limiting one journey to 120 events per 600 seconds. Add purge_traveller_analytics_events as service-role-only and delete rows where received_at < now() - interval '8 days', including expired throttle rows.

- [ ] Step 4: Add admin_traveller_analytics_report as a SECURITY DEFINER, STABLE function. It must reject windows over seven days, require is_active_ops(), count distinct journey IDs per stage, keep Booking OFF and ON rows separate, return metric_key/locale/entity_type/booking_state/numerator/denominator/rate/sample_count/status/attribution_window_days, set status to insufficient_sample below the fixed sample floor of 10, return NULL rates for insufficient samples or zero denominators, and never return journey IDs/account IDs/raw rows. Revoke public execute and grant authenticated execute.

- [ ] Step 5: Apply the migration locally, run pnpm --filter @kinnso/db gen, inspect packages/db/types.ts for only the expected table/function additions, run the migration test, and run git diff --check.

- [ ] Step 6: Commit.

~~~bash
git add supabase/migrations/20260801090000_r8_0_measurement_baseline.sql packages/db/types.ts apps/web/tests/db.r8-0-measurement-baseline.test.ts
git commit -m "feat(r8.0): add private traveller analytics ledger"
~~~

---

### Task 3: Implement server validation, idempotent ingestion, and the fire-and-forget route

**Files:**
- Create: apps/web/lib/analytics/server.ts
- Create: apps/web/app/api/analytics/route.ts
- Create: apps/web/tests/api.analytics.test.ts
- Create: apps/web/tests/analytics.server.test.ts

**Interfaces:**
- parseAnalyticsRequest(request): Promise<TravellerAnalyticsPayload>
- persistTravellerAnalyticsEvent(payload, accountId): Promise<'stored' | 'duplicate' | 'discarded'>
- POST /api/analytics returns 202 for accepted/duplicate/test-discarded, 400 for invalid payload, 413 for over 8 KiB, 429 for journey throttle rejection, and 503 for production persistence failure.

- [ ] Step 1: Write failing tests for prohibited-data rejection without a service write, test-mode discard, server-derived authenticated/account linkage, idempotent upsert, and product-safe 503 behavior.

~~~ts
expect(serviceClientMock).not.toHaveBeenCalled()
expect(serviceInsertMock).toHaveBeenCalledWith(
  expect.objectContaining({ authenticated: true, account_id: 'account-1' }),
  expect.objectContaining({
    onConflict: 'journey_id,client_event_id',
    ignoreDuplicates: true,
  }),
)
await expect(POST(requestFor(validPayload))).resolves.toMatchObject({ status: 503 })
~~~

- [ ] Step 2: Implement request parsing: reject a declared or measured body over 8192 bytes before JSON parsing, map malformed JSON and schema failures to a bounded 400 error, and never log request bodies or validation details.

~~~ts
const raw = await request.text()
if (new TextEncoder().encode(raw).byteLength > 8192) {
  throw new AnalyticsRequestError('payload_too_large', 413)
}
const parsed = travellerAnalyticsPayloadSchema.safeParse(JSON.parse(raw))
if (!parsed.success) throw new AnalyticsRequestError('invalid_request', 400)
return parsed.data
~~~

- [ ] Step 3: After validation, use createSupabaseServerClient() to call the journey throttle RPC and auth.getUser(). Pass user?.id ?? null as accountId to persistTravellerAnalyticsEvent(payload, accountId). The persistence function uses createSupabaseServiceClient() only after throttle success and upserts the flat server-derived row into traveller_analytics_events with onConflict journey_id,client_event_id and ignoreDuplicates true. Test mode validates/throttles but discards before service-client access.

- [ ] Step 4: Implement the route with NextResponse.json({ accepted: true }) for all accepted/duplicate/test outcomes and generic error bodies only. Unexpected errors return { accepted: false, error: 'unavailable' } with 503; no database error text leaves the process.

- [ ] Step 5: Run focused tests and typecheck, then commit.

~~~bash
pnpm --filter web test -- api.analytics.test.ts analytics.server.test.ts
pnpm --filter web typecheck
git add apps/web/lib/analytics/server.ts apps/web/app/api/analytics/route.ts apps/web/tests/api.analytics.test.ts apps/web/tests/analytics.server.test.ts
git commit -m "feat(r8.0): add validated analytics ingestion"
~~~

---

### Task 4: Implement the ops-only baseline report API

**Files:**
- Create: apps/web/lib/admin/analytics-queries.ts
- Create: apps/web/app/api/admin/analytics/route.ts
- Create: apps/web/tests/admin.analytics-queries.test.ts
- Create: apps/web/tests/api.admin-analytics.test.ts

**Interfaces:**
- TravellerAnalyticsReportRow exposes metricKey, locale, entityType, bookingState, numerator, denominator, rate, sampleCount, status, and attributionWindowDays.
- getTravellerAnalyticsReport(supabase, { from, to }) returns a UTC report with a seven-day attributionWindowDays value.
- GET /api/admin/analytics?from=ISO&to=ISO returns the report only to an authenticated ops user.

- [ ] Step 1: Write tests for numeric conversion, NULL rate preservation, insufficient_sample status, default seven-day UTC window, 401 signed-out, and 403 non-ops responses.

- [ ] Step 2: Implement the typed RPC adapter and keep SQL names inside it.

~~~ts
const { data, error } = await supabase.rpc('admin_traveller_analytics_report', {
  p_from: window.from,
  p_to: window.to,
})
if (error) throw error
return {
  ...window,
  timezone: 'UTC',
  attributionWindowDays: 7,
  rows: (data ?? []).map((row) => ({
    metricKey: row.metric_key,
    locale: row.locale,
    entityType: row.entity_type,
    bookingState: row.booking_state,
    numerator: Number(row.numerator),
    denominator: Number(row.denominator),
    rate: row.rate === null ? null : Number(row.rate),
    sampleCount: Number(row.sample_count),
    status: row.status,
    attributionWindowDays: Number(row.attribution_window_days),
  })),
}
~~~

- [ ] Step 3: Implement the GET route with createSupabaseServerClient(), auth.getUser(), resolveViewerRole(), ISO parsing, default now minus seven days/now, and a hard seven-day maximum. Reject unauthorized/non-ops callers before the RPC. Do not add an analytics dashboard page.

- [ ] Step 4: Run tests/typecheck and commit.

~~~bash
pnpm --filter web test -- admin.analytics-queries.test.ts api.admin-analytics.test.ts
pnpm --filter web typecheck
git add apps/web/lib/admin/analytics-queries.ts apps/web/app/api/admin/analytics/route.ts apps/web/tests/admin.analytics-queries.test.ts apps/web/tests/api.admin-analytics.test.ts
git commit -m "feat(r8.0): expose ops baseline analytics report"
~~~

---

### Task 5: Add explicit consent UI, journey storage, and the client event helper

**Files:**
- Create: apps/web/lib/analytics/client.ts
- Create: apps/web/components/kinnso/analytics/AnalyticsConsentBanner.tsx
- Modify: apps/web/components/kinnso/SiteChrome.tsx
- Modify: apps/web/app/[locale]/layout.tsx
- Modify: all seven files under apps/web/lib/i18n/messages
- Create: apps/web/tests/analytics.client.test.ts
- Create: apps/web/tests/kinnso.AnalyticsConsentBanner.test.tsx

**Interfaces:**
- hasAnalyticsConsent(), grantAnalyticsConsent(locale), revokeAnalyticsConsent(), and trackTravellerEvent(event, metadata) are browser-only.
- AnalyticsConsentBanner({ locale, t }) renders only when mode is not disabled, offers accept/decline, and exposes a revoke/manage action after acceptance.
- The helper stores only kinnso.analytics.consent.v1, kinnso.analytics.journey.v1, and the consent-version marker in localStorage.

- [ ] Step 1: Write tests for no storage/request before opt-in, journey creation plus journey_started on opt-in, exactly one retry after a network failure, no retry for 4xx, and revocation clearing consent and journey keys.

- [ ] Step 2: Implement the client helper with window.crypto.randomUUID(), consent checks, shared schema validation, one fire-and-forget fetch retry, and no-op disabled mode.

~~~ts
export function grantAnalyticsConsent(locale: Locale) {
  localStorage.setItem(CONSENT_KEY, 'accepted')
  localStorage.setItem(JOURNEY_KEY, crypto.randomUUID())
  void trackTravellerEvent('journey_started', { locale, routeKey: 'journey' })
}

export function revokeAnalyticsConsent() {
  localStorage.removeItem(CONSENT_KEY)
  localStorage.removeItem(JOURNEY_KEY)
}

export function trackTravellerEvent(event, metadata) {
  if (!hasAnalyticsConsent() || getAnalyticsMode() === 'disabled') return
  const journeyId = localStorage.getItem(JOURNEY_KEY)
  if (!journeyId) return
  void postWithOneRetry({
    clientEventId: crypto.randomUUID(),
    journeyId,
    consentVersion: 'v1',
    event,
    occurredAt: new Date().toISOString(),
    ...metadata,
  })
}
~~~

Expose typed event-specific metadata so callers cannot pass arbitrary objects.

- [ ] Step 3: Implement AnalyticsConsentBanner with role=dialog, accessible heading/description, explicit Accept measurement and Decline buttons, and a Change measurement preference action after acceptance. It must not block or focus-trap page navigation.

- [ ] Step 4: Pass messages.analytics from apps/web/app/[locale]/layout.tsx to SiteChrome and render the banner after the footer on public shells. Add identical analytics message keys in en, zh-hk, zh-tw, ja, ko, th, and zh-cn. The existing recursive locale parity test must prove the group shape.

- [ ] Step 5: Run focused tests/typecheck and commit.

~~~bash
pnpm --filter web test -- analytics.client.test.ts kinnso.AnalyticsConsentBanner.test.tsx i18n.locale-parity.test.ts
pnpm --filter web typecheck
git add apps/web/lib/analytics/client.ts apps/web/components/kinnso/analytics/AnalyticsConsentBanner.tsx apps/web/components/kinnso/SiteChrome.tsx apps/web/app/[locale]/layout.tsx apps/web/lib/i18n/messages apps/web/tests/analytics.client.test.ts apps/web/tests/kinnso.AnalyticsConsentBanner.test.tsx
git commit -m "feat(r8.0): add explicit traveller analytics consent"
~~~

---

### Task 6: Instrument public entity views without leaking content

**Files:**
- Create: apps/web/components/kinnso/analytics/AnalyticsEntityView.tsx
- Modify: apps/web/app/[locale]/g/[slug]/page.tsx
- Modify: apps/web/app/[locale]/experiences/[slug]/page.tsx
- Modify: apps/web/app/[locale]/c/[handle]/page.tsx
- Modify: apps/web/app/[locale]/articles/[category]/[url]/page.tsx
- Create: apps/web/tests/analytics.entity-view.test.tsx

**Interfaces:**
- AnalyticsEntityView({ locale, routeKey, entityType, entityId }) emits exactly one entity_viewed event in a client effect.
- entityId is a stable database ID or validated slug/handle, never a title or URL query string.
- Existing ViewPing article increment remains unchanged.

- [ ] Step 1: Write a test that grants consent, mounts AnalyticsEntityView, waits for one trackTravellerEvent call, and asserts only locale, routeKey, entityType, and entityId metadata. Verify no call before consent.

- [ ] Step 2: Implement the one-shot client component with useEffect(..., []) and render null. It must not read window.location.search, document title, or page text.

- [ ] Step 3: Mount exact mappings:
  - g/[slug]/page.tsx: guide_detail, guide, guide.id.
  - experiences/[slug]/page.tsx: experience_detail, experience, experience.id.
  - c/[handle]/page.tsx: creator_profile, creator, creator.id.
  - articles/[category]/[url]/page.tsx: article_detail, article, a.id.
  Keep existing JsonLd, caching, and SEO behavior unchanged.

- [ ] Step 4: Run public host tests/typecheck and commit.

~~~bash
pnpm --filter web test -- analytics.entity-view.test.tsx articles.metadata-state.test.ts
pnpm --filter web typecheck
git add apps/web/components/kinnso/analytics/AnalyticsEntityView.tsx apps/web/app/[locale]/g/[slug]/page.tsx apps/web/app/[locale]/experiences/[slug]/page.tsx apps/web/app/[locale]/c/[handle]/page.tsx apps/web/app/[locale]/articles/[category]/[url]/page.tsx apps/web/tests/analytics.entity-view.test.tsx
git commit -m "feat(r8.0): measure public entity views"
~~~

---

### Task 7: Instrument Agent, Booking, waitlist, and sign-up outcomes

**Files:**
- Modify: apps/web/components/kinnso/pages/AgentChatView.tsx
- Modify: apps/web/components/kinnso/pages/AgentWaitlistView.tsx
- Modify: apps/web/components/kinnso/pages/BookingWidget.tsx
- Modify: apps/web/components/kinnso/FeatureInterestForm.tsx
- Modify: apps/web/components/kinnso/pages/ExperiencePublicView.tsx
- Modify: apps/web/app/[locale]/sign-up/SignUpForm.tsx
- Create: apps/web/tests/analytics.funnel-events.test.tsx

**Interfaces:**
- Agent entry emits agent_started once per mounted public Agent surface.
- BookingWidget emits booking_cta_clicked before the server action and checkout_started only after createCheckoutSessionAction returns ok true.
- FeatureInterestForm emits waitlist_submitted only for feature=booking and only after a successful action; it receives optional analytics entity props without capturing email.
- SignUpForm emits signup_started before auth.signUp and signup_completed after a no-error response, whether email confirmation is required or not.

- [ ] Step 1: Write tests for Booking ON success/failure, Booking OFF waitlist success/failure, Agent entry, and sign-up start/completion.

~~~tsx
expect(trackTravellerEventMock).toHaveBeenCalledWith(
  'checkout_started',
  expect.objectContaining({ bookingState: 'on', outcome: 'created' }),
)
expect(trackTravellerEventMock).not.toHaveBeenCalledWith(
  'checkout_started',
  expect.anything(),
)
~~~

- [ ] Step 2: In AgentChatView and AgentWaitlistView, use a mount effect for agent_started. In BookingWidget.handleSubmit, emit booking_cta_clicked before startTransition and checkout_started immediately before window.location.href after an ok action. Include locale, route key, experience type/id, and bookingState=on only.

- [ ] Step 3: Extend FeatureInterestForm with optional analyticsEntityType and analyticsEntityId. In the booking feature branch, emit booking_cta_clicked with routeKey experience_detail and bookingState off immediately before the action, then emit waitlist_submitted only after a successful action with entity type/id and outcome submitted. Pass experience.id from ExperiencePublicView. Never pass form email/company.

- [ ] Step 4: In SignUpForm.handleSubmit, emit signup_started before creating the browser client. After a no-error response and before either redirect, emit signup_completed with outcome success. Never pass email, password, auth responses, or error text.

- [ ] Step 5: Run focused tests/typecheck and commit.

~~~bash
pnpm --filter web test -- analytics.funnel-events.test.tsx auth.signup-form.test.tsx experiences.booking-widget.host.test.tsx
pnpm --filter web typecheck
git add apps/web/components/kinnso/pages/AgentChatView.tsx apps/web/components/kinnso/pages/AgentWaitlistView.tsx apps/web/components/kinnso/pages/BookingWidget.tsx apps/web/components/kinnso/FeatureInterestForm.tsx apps/web/components/kinnso/pages/ExperiencePublicView.tsx apps/web/app/[locale]/sign-up/SignUpForm.tsx apps/web/tests/analytics.funnel-events.test.tsx
git commit -m "feat(r8.0): instrument traveller funnel outcomes"
~~~

---

### Task 8: Add browser privacy/funnel coverage and an operator runbook

**Files:**
- Create: apps/e2e/specs/analytics-consent.spec.ts
- Create: docs/ops/r8-0-analytics-baseline.md

**Interfaces:**
- The E2E spec verifies browser behavior only; it must not query production data or write production rows.
- The runbook documents local/Preview test mode, the protected report request, retention invocation, privacy review, and the separate production activation gate.

- [ ] Step 1: Write a Playwright spec that listens for /api/analytics requests, asserts zero requests before acceptance, asserts journey_started after acceptance, rejects prohibited keys in intercepted JSON, asserts revocation stops new requests, and stubs a 503 to prove public navigation remains usable.

~~~ts
await page.goto('/en/explore')
const requests: unknown[] = []
page.on('request', (request) => {
  if (request.url().endsWith('/api/analytics')) requests.push(request.postDataJSON())
})
await expect(page.getByRole('dialog')).toBeVisible()
expect(requests).toHaveLength(0)
await page.getByRole('button', { name: 'Accept measurement' }).click()
await expect.poll(() => requests.length).toBeGreaterThan(0)
expect(requests[0]).toMatchObject({ event: 'journey_started', consentVersion: 'v1' })
expect(JSON.stringify(requests[0])).not.toMatch(/email|ip|user-agent|prompt|query/i)
~~~

Run only against local or an explicitly test-mode Preview.

- [ ] Step 2: Write docs/ops/r8-0-analytics-baseline.md with these exact operational values:
  - local/Preview: NEXT_PUBLIC_ANALYTICS_MODE=test and ANALYTICS_INGEST_MODE=test;
  - production activation, only after separate approval: both modes production and the existing server-only SUPABASE_SERVICE_ROLE_KEY;
  - ops report GET /api/admin/analytics?from=UTC_ISO&to=UTC_ISO, maximum seven-day window, insufficient_sample status, and checkout_started not payment_completed;
  - retention via purge_traveller_analytics_events and an eight-day absence check;
  - no production activation, vendor, dashboard, or raw-data export in this PR.

- [ ] Step 3: Run local browser coverage and commit.

~~~bash
NEXT_PUBLIC_ANALYTICS_MODE=test ANALYTICS_INGEST_MODE=test E2E_BASE_URL=http://127.0.0.1:3000 pnpm --filter @kinnso/e2e e2e -- analytics-consent.spec.ts
git add apps/e2e/specs/analytics-consent.spec.ts docs/ops/r8-0-analytics-baseline.md
git commit -m "test(r8.0): verify consent and analytics privacy"
~~~

---

### Task 9: Run complete verification and prepare the squash PR

**Files:**
- No new product files; review all R8.0 files and migration/type diffs.

- [ ] Step 1: Run all focused R8.0 tests.

~~~bash
pnpm --filter web test -- analytics.contracts.test.ts analytics.server.test.ts api.analytics.test.ts db.r8-0-measurement-baseline.test.ts admin.analytics-queries.test.ts api.admin-analytics.test.ts analytics.client.test.ts analytics.entity-view.test.tsx analytics.funnel-events.test.tsx kinnso.AnalyticsConsentBanner.test.tsx
~~~

- [ ] Step 2: Run typecheck, lint, build, and e2e typecheck.

~~~bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
pnpm --filter @kinnso/e2e typecheck
~~~

Record unrelated baseline failures separately; do not suppress new R8.0 failures.

- [ ] Step 3: Run privacy and migration scans.

~~~bash
rg -n --glob 'apps/web/lib/analytics/**' --glob 'apps/web/app/api/analytics/**' --glob 'supabase/migrations/20260801090000_r8_0_measurement_baseline.sql' 'email|ip|user-agent|prompt|query|freeform|jsonb'
git diff --check
~~~

The scan must find no prohibited analytics storage/logging fields. Existing booking/waitlist email behavior outside analytics files is baseline product behavior.

- [ ] Step 4: Apply the migration locally, verify browser-role SELECT/INSERT denial, service-role insert and duplicate idempotency, deterministic aggregate fixtures, and run the analytics consent spec plus existing funnel-smoke, honesty, notfound, and booking specs. Existing R7.10 read-only preview smoke must remain green.

- [ ] Step 5: Confirm before PR that no production analytics mode was deployed, no production rows were written, no vendor/dashboard was configured, the report is protected by resolveViewerRole and is_active_ops(), raw rows expire after eight days, aggregate output has no journey IDs, all seven locale dictionaries contain the consent group, and Booking OFF/ON metrics are separate.

- [ ] Step 6: Review status and commit verification notes.

~~~bash
git status -sb
git log --oneline --decorate -n 12
git diff origin/main...HEAD --stat
git commit --allow-empty -m "chore(r8.0): verify measurement baseline"
~~~

The implementation owner should squash the R8.0 commits into one PR commit when publishing, following the existing Phase R conventions.




