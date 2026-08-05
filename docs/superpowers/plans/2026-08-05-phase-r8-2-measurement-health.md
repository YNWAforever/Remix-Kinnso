# Phase R8.2 - Measurement Health Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a read-only, localized health summary above the existing /admin/analytics table that explains whether the selected aggregate report is available and interpretable.

**Architecture:** Extend the existing pure dashboard helper with a deterministic health-summary contract. The existing analytics page computes that summary after applying allowlisted URL filters and passes it to the existing AdminAnalyticsView, which renders a semantic inline section using localized status and count labels. No new query, route, database object, scheduler, persistence, or production write is introduced.

**Tech Stack:** Next.js App Router server components, React, TypeScript, Vitest, Testing Library, the Supabase aggregate adapter in apps/web/lib/admin/analytics-queries.ts, and the seven existing KINNSO locale dictionaries.

## Global Constraints

- Audience is internal ops users already authorized to view /{locale}/admin/analytics.
- Use only the filtered TravellerAnalyticsReport returned by the existing getTravellerAnalyticsReport adapter; make no additional database request.
- The health claim is limited to report presence and interpretability. Do not claim ingestion freshness, purge execution, or retention compliance.
- Status precedence is unavailable -> no_matching_rows -> observed_zero -> insufficient_sample -> available.
- A successful filter that returns zero rows is neutral no_matching_rows, not observed zero and not unavailable.
- Preserve existing R8.0/R8.1 rate, null, attribution-window, sample-floor, authorization, and aggregate-only semantics.
- Never expose journey IDs, event IDs, account IDs, raw event metadata, database errors, stack traces, service-role credentials, or raw-ledger rows.
- Add every new visible label to the existing admin message group in all seven locales: en, zh-hk, zh-tw, zh-cn, ja, ko, and th.
- Render status meaning as text, not color alone; use a semantic labelled section, role=status for normal states, and role=alert only for unavailable.
- Do not add migrations, RPCs, policies, retention signals, schedulers, exports, rollups, alerts, vendor analytics, public routes, or production writes.
- Follow the existing page guard and locale conventions in apps/web/app/[locale]/admin/analytics/page.tsx.
- Use TDD: write a failing test, run it, implement the smallest change, rerun the focused test, then commit each task.
- Keep unrelated baseline warnings or environment-gated build failures separate from any R8.2 regression.

---

## File Map

### Task 1 - Pure health contract

- Modify: apps/web/lib/admin/analytics-dashboard.ts - add the health status type, summary shape, and pure derivation function beside the existing filter/window helpers.
- Modify: apps/web/tests/admin.analytics-dashboard.test.ts - cover every health state, precedence rule, and count.

### Task 2 - Server-page data flow

- Modify: apps/web/app/[locale]/admin/analytics/page.tsx - derive health after filtered rows are assigned and pass it to the view.
- Modify: apps/web/tests/admin.analytics.host.test.tsx - verify filtered-row counts/status and generic unavailable health.

### Task 3 - Inline view, copy, and accessibility

- Modify: apps/web/components/kinnso/admin/analytics/AdminAnalyticsView.tsx - accept the summary and render the inline semantic section.
- Modify: apps/web/tests/kinnso.AdminAnalyticsView.test.tsx - cover the section roles, localized labels/counts, and neutral empty state.
- Modify: apps/web/lib/i18n/messages/en.ts - extend the Messages admin type and English values.
- Modify: apps/web/lib/i18n/messages/zh-hk.ts - add the same health keys in Traditional Chinese.
- Modify: apps/web/lib/i18n/messages/zh-tw.ts - add the same health keys in Traditional Chinese.
- Modify: apps/web/lib/i18n/messages/zh-cn.ts - add the same health keys in Simplified Chinese.
- Modify: apps/web/lib/i18n/messages/ja.ts - add the same health keys in Japanese.
- Modify: apps/web/lib/i18n/messages/ko.ts - add the same health keys in Korean.
- Modify: apps/web/lib/i18n/messages/th.ts - add the same health keys in Thai.
- Modify: apps/web/tests/i18n.locale-parity.test.ts - assert the new health key contract remains identical across locales.

### Task 4 - Verification and release boundary

- Review: all Task 1-3 source/test files plus the R8.0 analytics/privacy baseline.
- No new source file or migration is expected for this task.

---

### Task 1: Build and test the pure analytics health contract

**Files:**
- Modify: apps/web/tests/admin.analytics-dashboard.test.ts
- Modify: apps/web/lib/admin/analytics-dashboard.ts

**Interfaces:**
- Consumes: TravellerAnalyticsReportRow from apps/web/lib/admin/analytics-queries.ts and the existing page error state 'unavailable' | null.
- Produces:
  - AnalyticsHealthStatus = 'unavailable' | 'no_matching_rows' | 'observed_zero' | 'insufficient_sample' | 'available';
  - AnalyticsHealthSummary = { status: AnalyticsHealthStatus; returnedRows: number; okRows: number; insufficientRows: number; observedZeroRows: number };
  - deriveAnalyticsHealthSummary(rows: TravellerAnalyticsReportRow[] | null, error: 'unavailable' | null): AnalyticsHealthSummary.

- [ ] Step 1: Write the failing health-summary tests

Add this import and fixture to apps/web/tests/admin.analytics-dashboard.test.ts:

~~~ts
import {
  deriveAnalyticsHealthSummary,
  filterAnalyticsRows,
  parseAnalyticsDashboardFilters,
  toAnalyticsReportWindow,
  type AnalyticsHealthSummary,
} from '@/lib/admin/analytics-dashboard'
import type { TravellerAnalyticsReportRow } from '@/lib/admin/analytics-queries'

const healthRow = (patch: Partial<TravellerAnalyticsReportRow> = {}): TravellerAnalyticsReportRow => ({
  metricKey: 'entity_to_cta',
  locale: 'en',
  entityType: 'guide',
  bookingState: 'off',
  numerator: 2,
  denominator: 10,
  rate: 0.2,
  sampleCount: 10,
  status: 'ok',
  attributionWindowDays: 7,
  ...patch,
})

const summary = (patch: Partial<AnalyticsHealthSummary>): AnalyticsHealthSummary => ({
  status: 'available',
  returnedRows: 0,
  okRows: 0,
  insufficientRows: 0,
  observedZeroRows: 0,
  ...patch,
})

describe('deriveAnalyticsHealthSummary', () => {
  it('returns unavailable before inspecting rows', () => {
    expect(deriveAnalyticsHealthSummary(null, 'unavailable')).toEqual(summary({ status: 'unavailable' }))
  })

  it('keeps a successful empty filter neutral', () => {
    expect(deriveAnalyticsHealthSummary([], null)).toEqual(summary({ status: 'no_matching_rows' }))
  })

  it('prioritizes observed zero over insufficient sample', () => {
    expect(deriveAnalyticsHealthSummary([
      healthRow({ numerator: 0, denominator: 0, sampleCount: 0, rate: null, status: 'insufficient_sample' }),
    ], null)).toEqual(summary({ status: 'observed_zero', returnedRows: 1, insufficientRows: 1, observedZeroRows: 1 }))
  })

  it('reports insufficient samples when rows are non-zero but withheld', () => {
    expect(deriveAnalyticsHealthSummary([
      healthRow({ numerator: 1, denominator: 4, sampleCount: 4, rate: null, status: 'insufficient_sample' }),
    ], null)).toEqual(summary({ status: 'insufficient_sample', returnedRows: 1, insufficientRows: 1 }))
  })

  it('counts mixed rows and reports available when all rows are interpretable', () => {
    expect(deriveAnalyticsHealthSummary([
      healthRow(),
      healthRow({ numerator: 0, denominator: 0, sampleCount: 0, rate: null, status: 'ok' }),
    ], null)).toEqual(summary({ status: 'available', returnedRows: 2, okRows: 2, observedZeroRows: 1 }))
  })

  it('reports insufficient when an interpretable row is mixed with a withheld row', () => {
    expect(deriveAnalyticsHealthSummary([
      healthRow(),
      healthRow({ numerator: 1, denominator: 4, sampleCount: 4, rate: null, status: 'insufficient_sample' }),
    ], null)).toEqual(summary({ status: 'insufficient_sample', returnedRows: 2, okRows: 1, insufficientRows: 1 }))
  })
})
~~~

The existing filter/window tests remain unchanged. The new import should fail because deriveAnalyticsHealthSummary and its types do not yet exist.

- [ ] Step 2: Run the focused helper test to verify it fails

Run:

~~~powershell
pnpm --filter web exec vitest run tests/admin.analytics-dashboard.test.ts
~~~

Expected: FAIL with a missing export/module member for deriveAnalyticsHealthSummary.

- [ ] Step 3: Implement the minimal pure derivation function

Append the following contract to apps/web/lib/admin/analytics-dashboard.ts after filterAnalyticsRows:

~~~ts
export const ANALYTICS_HEALTH_STATUSES = [
  'unavailable',
  'no_matching_rows',
  'observed_zero',
  'insufficient_sample',
  'available',
] as const

export type AnalyticsHealthStatus = (typeof ANALYTICS_HEALTH_STATUSES)[number]

export interface AnalyticsHealthSummary {
  status: AnalyticsHealthStatus
  returnedRows: number
  okRows: number
  insufficientRows: number
  observedZeroRows: number
}

const emptyHealthSummary = (status: AnalyticsHealthStatus): AnalyticsHealthSummary => ({
  status,
  returnedRows: 0,
  okRows: 0,
  insufficientRows: 0,
  observedZeroRows: 0,
})

export function deriveAnalyticsHealthSummary(
  rows: TravellerAnalyticsReportRow[] | null,
  error: 'unavailable' | null,
): AnalyticsHealthSummary {
  if (error !== null || rows === null) return emptyHealthSummary('unavailable')

  const returnedRows = rows.length
  const okRows = rows.filter((row) => row.status === 'ok').length
  const insufficientRows = rows.filter((row) => row.status === 'insufficient_sample').length
  const observedZeroRows = rows.filter((row) => row.numerator === 0 && row.denominator === 0).length
  const counts = { returnedRows, okRows, insufficientRows, observedZeroRows }

  if (returnedRows === 0) return { status: 'no_matching_rows', ...counts }
  if (observedZeroRows === returnedRows) return { status: 'observed_zero', ...counts }
  if (insufficientRows > 0) return { status: 'insufficient_sample', ...counts }
  return { status: 'available', ...counts }
}
~~~

This function must not calculate a percentage, replace a null rate, inspect raw identifiers, or perform I/O.

- [ ] Step 4: Run the helper tests and confirm the contract passes

Run:

~~~powershell
pnpm --filter web exec vitest run tests/admin.analytics-dashboard.test.ts
~~~

Expected: the existing filter/window tests and all six health-summary tests PASS.

- [ ] Step 5: Commit the pure contract

~~~powershell
git add apps/web/lib/admin/analytics-dashboard.ts apps/web/tests/admin.analytics-dashboard.test.ts
git commit -m "feat(r8.2): add analytics health contract"
~~~

### Task 2: Wire the summary through the guarded analytics page

**Files:**
- Modify: apps/web/app/[locale]/admin/analytics/page.tsx
- Modify: apps/web/tests/admin.analytics.host.test.tsx

**Interfaces:**
- Consumes: deriveAnalyticsHealthSummary, the existing report variable, and the existing error variable.
- Produces: AdminAnalyticsView props with health: AnalyticsHealthSummary; page guard, locale validation, report window, and generic error behavior remain unchanged.

- [ ] Step 1: Add failing host assertions for filtered and unavailable health

Add this test block to apps/web/tests/admin.analytics.host.test.tsx:

~~~tsx
it('derives health from the filtered aggregate rows before rendering the view', async () => {
  reportMock.mockResolvedValueOnce({
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-08T00:00:00.000Z',
    timezone: 'UTC',
    attributionWindowDays: 7,
    rows: [
      { metricKey: 'entity_to_cta', locale: 'en', entityType: 'guide', bookingState: 'off', numerator: 2, denominator: 10, rate: 0.2, sampleCount: 10, status: 'ok', attributionWindowDays: 7 },
      { metricKey: 'entity_to_cta', locale: 'zh-hk', entityType: 'experience', bookingState: 'on', numerator: 1, denominator: 4, rate: null, sampleCount: 4, status: 'insufficient_sample', attributionWindowDays: 7 },
    ],
  })

  const ui = await AdminAnalyticsPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({ locale: 'en' }),
  })
  expect((ui as { props: { health: unknown } }).props.health).toEqual({
    status: 'available',
    returnedRows: 1,
    okRows: 1,
    insufficientRows: 0,
    observedZeroRows: 0,
  })
})

it('passes an unavailable health summary when the aggregate query fails', async () => {
  reportMock.mockRejectedValueOnce(new Error('database internals'))
  const ui = await AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })
  expect((ui as { props: { health: unknown } }).props.health).toEqual({
    status: 'unavailable',
    returnedRows: 0,
    okRows: 0,
    insufficientRows: 0,
    observedZeroRows: 0,
  })
})
~~~

The first assertion deliberately filters out the zh-hk row. It must fail because the page currently passes no health prop.

- [ ] Step 2: Run the host test to verify it fails

Run:

~~~powershell
pnpm --filter web exec vitest run tests/admin.analytics.host.test.tsx
~~~

Expected: FAIL because props.health is undefined.

- [ ] Step 3: Derive and pass health from the page

Update the import in apps/web/app/[locale]/admin/analytics/page.tsx:

~~~tsx
import {
  deriveAnalyticsHealthSummary,
  filterAnalyticsRows,
  parseAnalyticsDashboardFilters,
  toAnalyticsReportWindow,
} from '@/lib/admin/analytics-dashboard'
~~~

Replace the final return with:

~~~tsx
const health = deriveAnalyticsHealthSummary(report?.rows ?? null, error)

return <AdminAnalyticsView locale={loc} t={messages.admin} filters={filters} report={report} error={error} health={health} />
~~~

The health function must run after report = { ...result, rows: filterAnalyticsRows(result.rows, filters) }, so counts describe exactly what the operator sees. Do not move the guard or add another query.

- [ ] Step 4: Run the host tests and confirm they pass

Run:

~~~powershell
pnpm --filter web exec vitest run tests/admin.analytics.host.test.tsx
~~~

Expected: all existing guard/window/filter/error tests and the two new health-prop tests PASS.

- [ ] Step 5: Commit the page data-flow change

~~~powershell
git add "apps/web/app/[locale]/admin/analytics/page.tsx" apps/web/tests/admin.analytics.host.test.tsx
git commit -m "feat(r8.2): pass analytics health summary"
~~~

### Task 3: Render the localized inline health section accessibly

**Files:**
- Modify: apps/web/components/kinnso/admin/analytics/AdminAnalyticsView.tsx
- Modify: apps/web/tests/kinnso.AdminAnalyticsView.test.tsx
- Modify: apps/web/lib/i18n/messages/en.ts
- Modify: apps/web/lib/i18n/messages/zh-hk.ts
- Modify: apps/web/lib/i18n/messages/zh-tw.ts
- Modify: apps/web/lib/i18n/messages/zh-cn.ts
- Modify: apps/web/lib/i18n/messages/ja.ts
- Modify: apps/web/lib/i18n/messages/ko.ts
- Modify: apps/web/lib/i18n/messages/th.ts
- Modify: apps/web/tests/i18n.locale-parity.test.ts

**Interfaces:**
- Consumes: health: AnalyticsHealthSummary from Task 2, Messages admin, Locale, and the existing aggregate report props.
- Produces: an inline section with a visible localized status, four localized count values, status-specific explanation text, and no raw data exposure.

- [ ] Step 1: Add failing view tests and health props to existing fixtures

Import the summary type and define these fixtures in apps/web/tests/kinnso.AdminAnalyticsView.test.tsx:

~~~tsx
import type { AnalyticsHealthSummary } from '@/lib/admin/analytics-dashboard'

const availableHealth: AnalyticsHealthSummary = {
  status: 'available',
  returnedRows: 1,
  okRows: 1,
  insufficientRows: 0,
  observedZeroRows: 0,
}

const noMatchingHealth: AnalyticsHealthSummary = {
  status: 'no_matching_rows',
  returnedRows: 0,
  okRows: 0,
  insufficientRows: 0,
  observedZeroRows: 0,
}
~~~

Add a matching health prop to every existing AdminAnalyticsView render: use availableHealth for the normal all-ok fixture, noMatchingHealth for the empty fixture, an observed-zero summary for the observed-zero fixture, and an unavailable summary for the report-error fixture. Add these tests:

~~~tsx
it('renders a labelled health section with localized status and counts', () => {
  render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={report} error={null} health={availableHealth} />)
  expect(screen.getByRole('region', { name: en.admin.analyticsHealthTitle })).toBeTruthy()
  expect(screen.getByRole('status')).toHaveTextContent(en.admin.analyticsHealthAvailable)
  expect(screen.getByText(en.admin.analyticsHealthReturnedRows)).toBeTruthy()
  expect(screen.getByText(en.admin.analyticsHealthOkRows)).toBeTruthy()
  expect(screen.getByText(en.admin.analyticsHealthInsufficientRows)).toBeTruthy()
  expect(screen.getByText(en.admin.analyticsHealthObservedZeroRows)).toBeTruthy()
})

it('keeps a valid empty filter neutral and non-alerting', () => {
  render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={{ ...report, rows: [] }} error={null} health={noMatchingHealth} />)
  expect(screen.getByRole('region', { name: en.admin.analyticsHealthTitle })).toBeTruthy()
  expect(screen.getByRole('status')).toHaveTextContent(en.admin.analyticsHealthNoMatching)
  expect(screen.queryByRole('alert')).toBeNull()
})

it('uses an alert only for unavailable health', () => {
  render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={null} error="unavailable" health={{ status: 'unavailable', returnedRows: 0, okRows: 0, insufficientRows: 0, observedZeroRows: 0 }} />)
  expect(screen.getByRole('alert')).toHaveTextContent(en.admin.analyticsHealthUnavailable)
})
~~~

Expected initial failure: AdminAnalyticsView does not accept health, the health message keys are absent, and no semantic health section exists.

- [ ] Step 2: Run the view and locale tests to verify they fail

Run:

~~~powershell
pnpm --filter web exec vitest run tests/kinnso.AdminAnalyticsView.test.tsx tests/i18n.locale-parity.test.ts
~~~

Expected: FAIL on the missing health prop/message keys before implementation.

- [ ] Step 3: Add the localized message contract to all seven dictionaries

Extend the Messages admin type in apps/web/lib/i18n/messages/en.ts and add matching values to the admin object in every locale file. Use these exact keys:

~~~ts
analyticsHealthTitle: string
analyticsHealthStatus: string
analyticsHealthAvailable: string
analyticsHealthNoMatching: string
analyticsHealthObservedZero: string
analyticsHealthInsufficient: string
analyticsHealthUnavailable: string
analyticsHealthReturnedRows: string
analyticsHealthOkRows: string
analyticsHealthInsufficientRows: string
analyticsHealthObservedZeroRows: string
~~~

The English values are:

~~~ts
analyticsHealthTitle: 'Measurement health',
analyticsHealthStatus: 'Status',
analyticsHealthAvailable: 'Available',
analyticsHealthNoMatching: 'No matching rows',
analyticsHealthObservedZero: 'Observed zero',
analyticsHealthInsufficient: 'Insufficient sample',
analyticsHealthUnavailable: 'Unavailable',
analyticsHealthReturnedRows: 'Rows returned',
analyticsHealthOkRows: 'Interpretable rows',
analyticsHealthInsufficientRows: 'Withheld rows',
analyticsHealthObservedZeroRows: 'Observed-zero rows',
~~~

Translate those labels in zh-hk, zh-tw, zh-cn, ja, ko, and th using the existing dictionary tone and encoding. Do not add a fallback locale or a new top-level message group. The existing analyticsEmpty, analyticsObservedZero, analyticsInsufficientSample, analyticsUnavailable, and analyticsRetry strings remain the longer state explanations.

- [ ] Step 4: Render the health section without changing report semantics

Update the view import and props:

~~~tsx
import type { AnalyticsHealthSummary } from '@/lib/admin/analytics-dashboard'

type Props = {
  locale: Locale
  t: Messages['admin']
  filters: AnalyticsDashboardFilters
  report: TravellerAnalyticsReport | null
  error: 'unavailable' | null
  health: AnalyticsHealthSummary
}
~~~

Add these mappings before AdminAnalyticsView:

~~~tsx
const healthStatusLabel = (t: Messages['admin'], status: AnalyticsHealthSummary['status']) => ({
  available: t.analyticsHealthAvailable,
  no_matching_rows: t.analyticsHealthNoMatching,
  observed_zero: t.analyticsHealthObservedZero,
  insufficient_sample: t.analyticsHealthInsufficient,
  unavailable: t.analyticsHealthUnavailable,
}[status])

const healthDescription = (t: Messages['admin'], status: AnalyticsHealthSummary['status']) => ({
  available: t.analyticsOk,
  no_matching_rows: t.analyticsEmpty,
  observed_zero: t.analyticsObservedZero,
  insufficient_sample: t.analyticsInsufficientSample,
  unavailable: t.analyticsUnavailable + ' ' + t.analyticsRetry,
}[status])
~~~

Place this section immediately after the subtitle/UTC metadata and before the existing filter nav:

~~~tsx
<section aria-labelledby="analytics-health-heading" className="mt-6 rounded-xl border border-kinnso-ink/10 bg-white p-4" aria-describedby="analytics-health-description">
  <h2 id="analytics-health-heading" className="text-base font-bold text-kinnso-ink">{t.analyticsHealthTitle}</h2>
  <p role={health.status === 'unavailable' ? 'alert' : 'status'} className="mt-2 text-sm font-bold text-kinnso-ink">
    {t.analyticsHealthStatus}: {healthStatusLabel(t, health.status)}
  </p>
  <dl className="mt-3 grid gap-3 sm:grid-cols-4">
    <div><dt className="text-xs text-kinnso-muted">{t.analyticsHealthReturnedRows}</dt><dd className="font-bold text-kinnso-ink">{health.returnedRows.toLocaleString(locale)}</dd></div>
    <div><dt className="text-xs text-kinnso-muted">{t.analyticsHealthOkRows}</dt><dd className="font-bold text-kinnso-ink">{health.okRows.toLocaleString(locale)}</dd></div>
    <div><dt className="text-xs text-kinnso-muted">{t.analyticsHealthInsufficientRows}</dt><dd className="font-bold text-kinnso-ink">{health.insufficientRows.toLocaleString(locale)}</dd></div>
    <div><dt className="text-xs text-kinnso-muted">{t.analyticsHealthObservedZeroRows}</dt><dd className="font-bold text-kinnso-ink">{health.observedZeroRows.toLocaleString(locale)}</dd></div>
  </dl>
  <p id="analytics-health-description" className="mt-3 text-sm text-kinnso-muted">{healthDescription(t, health.status)}</p>
</section>
~~~

Keep the existing filter links, semantic table, rate rendering, sample-floor cells, and raw-dimension fallbacks unchanged. In the existing error branch, remove role=alert from the old retry paragraph so the health section is the single alert region; retain the same localized unavailable and retry copy in that paragraph. The existing empty and observed-zero messages remain below the panel to preserve R8.1 behavior.

- [ ] Step 5: Run the recursive locale parity contract and focused tests

The existing locale-parity test recursively compares every key in the English dictionary with every other locale, so no explicit key-list edit is required. Run:

~~~powershell
pnpm --filter web exec vitest run tests/kinnso.AdminAnalyticsView.test.tsx tests/i18n.locale-parity.test.ts
~~~

Expected: all existing view, privacy, filter-link, raw-dimension, and locale-parity tests plus the three new health UI tests PASS.

- [ ] Step 6: Commit the localized inline view

~~~powershell
git add apps/web/components/kinnso/admin/analytics/AdminAnalyticsView.tsx apps/web/tests/kinnso.AdminAnalyticsView.test.tsx apps/web/lib/i18n/messages/en.ts apps/web/lib/i18n/messages/zh-hk.ts apps/web/lib/i18n/messages/zh-tw.ts apps/web/lib/i18n/messages/zh-cn.ts apps/web/lib/i18n/messages/ja.ts apps/web/lib/i18n/messages/ko.ts apps/web/lib/i18n/messages/th.ts apps/web/tests/i18n.locale-parity.test.ts
git commit -m "feat(r8.2): render analytics health summary"
~~~

### Task 4: Run the full R8.2 verification gate

**Files:**
- Review: Task 1-3 changes only; do not change unrelated files to hide baseline failures.

**Interfaces:**
- Consumes: the completed health contract, page prop, localized view, and tests.
- Produces: reproducible evidence that R8.2 preserves R8.0/R8.1 privacy, authorization, localization, and report semantics.

- [ ] Step 1: Run the complete focused analytics suite

Run:

~~~powershell
pnpm --filter web exec vitest run tests/admin.analytics-dashboard.test.ts tests/admin.analytics.host.test.tsx tests/kinnso.AdminAnalyticsView.test.tsx tests/kinnso.AdminShell.test.tsx tests/admin.analytics-queries.test.ts tests/api.admin-analytics.test.ts tests/i18n.locale-parity.test.ts
~~~

Expected: all focused R8.2/R8.1 analytics, host, view, navigation, adapter, API, and locale tests PASS.

- [ ] Step 2: Run workspace typecheck and lint

Run:

~~~powershell
pnpm --filter web typecheck
pnpm --filter web lint
~~~

Expected: typecheck exits 0; lint exits 0 with only the documented pre-existing warnings and no R8.2 errors.

- [ ] Step 3: Run the R8.0 measurement/privacy regression baseline

Run the checked-in direct Vitest baseline from the R8.0 verification report:

~~~powershell
apps/web/node_modules/.bin/vitest.cmd run tests/analytics.contracts.test.ts tests/analytics.server.test.ts tests/api.analytics.test.ts tests/db.r8-0-measurement-baseline.test.ts tests/admin.analytics-queries.test.ts tests/api.admin-analytics.test.ts tests/analytics.client.test.ts tests/analytics.entity-view.test.tsx tests/analytics.funnel-events.test.tsx tests/kinnso.AnalyticsConsentBanner.test.tsx
~~~

Expected: the R8.0 privacy, authorization, retention, aggregate, consent, and client baseline remains green. If the local environment still lacks Supabase or deployment secrets, record that as an environment limitation rather than weakening a test.

- [ ] Step 4: Audit scope and privacy before handoff

Run:

~~~powershell
git diff --check HEAD~3..HEAD
git diff --stat HEAD~3..HEAD
rg -n "journey_id|client_event_id|account_id|traveller_analytics_events|service_role|CREATE TABLE|ALTER TABLE|INSERT INTO|UPDATE .*analytics" apps/web/app apps/web/components/kinnso/admin/analytics apps/web/lib/admin/analytics-dashboard.ts apps/web/tests/admin.analytics-dashboard.test.ts apps/web/tests/admin.analytics.host.test.tsx apps/web/tests/kinnso.AdminAnalyticsView.test.tsx
~~~

Expected: no R8.2 raw-ledger identifier, service-role, DDL, or production-write matches. Existing R8.0 adapter references outside the changed health surface must be reported separately, not removed.

- [ ] Step 5: Confirm branch scope and prepare review handoff

Run:

~~~powershell
git status -sb
git log --oneline --decorate -8
~~~

Expected: the branch contains only the R8.2 implementation commits plus intentionally preserved untracked .superpowers/sdd evidence, with no migration, seed, activation, vendor, export, alert, scheduler, or public-route change. If verification documentation needs a new line, add only a focused report under .superpowers/sdd/; do not stage existing scratch evidence accidentally.

The implementation is ready for the normal review/finish workflow only after every focused test and scope audit above has been recorded.

---

## Plan self-review checklist

- Every approved R8.2 design decision maps to Task 1, 2, or 3; Task 4 verifies the full boundary.
- The health summary is derived after filtering, so no_matching_rows cannot be confused with observed zero.
- The exact function/type names and prop shape are consistent across tasks: deriveAnalyticsHealthSummary, AnalyticsHealthStatus, AnalyticsHealthSummary, and health.
- The plan introduces no new database boundary and preserves the existing page guard and aggregate adapter.
- All new visible keys are listed and their English source values are fixed; each locale must provide a semantic translation before parity can pass.
- No unfinished or unspecified edge-case steps remain.
