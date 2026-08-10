# Phase R8.1 — Ops Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a localized, ops-only analytics dashboard over the existing R8.0 aggregate report without changing event collection, database schema, or public product behavior.

**Architecture:** A server page under the existing localized admin tree will validate the locale, apply the existing ops guard, calculate a bounded UTC report window, call `getTravellerAnalyticsReport`, and pass only aggregate rows to a focused presentation component. A pure helper will own allowlisted URL filters, preset-window calculation, and row filtering so those rules are unit-testable without Supabase or Next.js. `AdminShell` and the existing `Messages['admin']` contract will supply navigation and all seven-locale copy.

**Tech Stack:** Next.js App Router, React server components, TypeScript, Vitest, Testing Library, Supabase RPC adapter already present in `apps/web/lib/admin/analytics-queries.ts`, and the existing KINNSO admin/i18n components.

## Global Constraints

- Audience is internal ops only; the new route is private under `/{locale}/admin/analytics`.
- Use the existing `requireOpsPage` guard and `getTravellerAnalyticsReport`; do not query `traveller_analytics_events` from the browser or add a second report query.
- Support only `window=24h|7d`, default `7d`, and never send a report window larger than seven days.
- Allow only locale, entity-type, and Booking-state filter enums; invalid values normalize to `all`.
- Render aggregate counts/rates only. Never expose journey IDs, event IDs, account IDs, or raw event metadata.
- Preserve `insufficient_sample` and null rates; never turn them into zero or a derived percentage.
- Add visible copy to all seven locale files in the existing `admin` message group and keep locale parity green.
- No migrations, RPCs, policies, production writes, third-party analytics, exports, rollups, alerts, merchant reporting, or public routes.
- Follow existing locale-page conventions (`await params`, `isLocale`, `notFound`, `getDictionary`) and explicit page-level ops gating.
- Use focused Vitest/Testing Library coverage, then workspace typecheck, lint, and the existing R8.0 verification baseline.
- Use Conventional Commits with a scope; the phase is one squash-merged PR.

---

## File Map

### New files

- `apps/web/lib/admin/analytics-dashboard.ts` — allowlisted dashboard filter types, query parsing, preset-window calculation, and aggregate-row filtering.
- `apps/web/tests/admin.analytics-dashboard.test.ts` — pure helper contract tests.
- `apps/web/app/[locale]/admin/analytics/page.tsx` — server page, locale/ops gate, report loading, and unavailable-state selection.
- `apps/web/components/kinnso/admin/analytics/AdminAnalyticsView.tsx` — localized links, metadata, semantic table, and status/empty states.
- `apps/web/tests/admin.analytics.host.test.tsx` — page-level locale, guard, window, filter, and failure tests.
- `apps/web/tests/kinnso.AdminAnalyticsView.test.tsx` — presentation/accessibility tests.

### Modified files

- `apps/web/components/kinnso/admin/AdminShell.tsx` — add the exact `/admin/analytics` nav item.
- `apps/web/tests/kinnso.AdminShell.test.tsx` — assert the new link and exact active state.
- `apps/web/lib/i18n/messages/en.ts`
- `apps/web/lib/i18n/messages/zh-hk.ts`
- `apps/web/lib/i18n/messages/zh-tw.ts`
- `apps/web/lib/i18n/messages/zh-cn.ts`
- `apps/web/lib/i18n/messages/ja.ts`
- `apps/web/lib/i18n/messages/ko.ts`
- `apps/web/lib/i18n/messages/th.ts` — add the same `admin` keys and translated values.

Existing seams that must remain unchanged unless a test proves otherwise:
`apps/web/lib/admin/analytics-queries.ts`,
`apps/web/app/api/admin/analytics/route.ts`, and the R8.0 migration.

---

### Task 1: Build and test the pure dashboard filter/window contract

**Files:**
- Create: `apps/web/tests/admin.analytics-dashboard.test.ts`
- Create: `apps/web/lib/admin/analytics-dashboard.ts`

**Interfaces:**
- Consumes: `Locale`/`LOCALES` from `apps/web/lib/i18n/config.ts` and `TravellerAnalyticsReportRow` / `TravellerAnalyticsReportWindow` from `apps/web/lib/admin/analytics-queries.ts`.
- Produces:
  - `AnalyticsWindow = '24h' | '7d'`
  - `AnalyticsLocaleFilter = 'all' | Locale`
  - `AnalyticsEntityFilter = 'all' | 'guide' | 'experience' | 'creator' | 'article'`
  - `AnalyticsBookingFilter = 'all' | 'off' | 'on'`
  - `AnalyticsDashboardFilters = { window, locale, entity, booking }`
  - `parseAnalyticsDashboardFilters(raw)`
  - `toAnalyticsReportWindow(filters, now = new Date())`
  - `filterAnalyticsRows(rows, filters)`

- [ ] **Step 1: Write the failing helper tests**

```ts
import { describe, expect, it } from 'vitest'
import { filterAnalyticsRows, parseAnalyticsDashboardFilters, toAnalyticsReportWindow } from '@/lib/admin/analytics-dashboard'

describe('parseAnalyticsDashboardFilters', () => {
  it('uses safe defaults', () => {
    expect(parseAnalyticsDashboardFilters({})).toEqual({ window: '7d', locale: 'all', entity: 'all', booking: 'all' })
  })

  it('accepts only allowlisted values and drops arbitrary strings', () => {
    expect(parseAnalyticsDashboardFilters({ window: '24h', locale: 'zh-hk', entity: 'experience', booking: 'on' }))
      .toEqual({ window: '24h', locale: 'zh-hk', entity: 'experience', booking: 'on' })
    expect(parseAnalyticsDashboardFilters({ window: '30d', locale: 'DROP TABLE', entity: 'unknown', booking: 'maybe' }))
      .toEqual({ window: '7d', locale: 'all', entity: 'all', booking: 'all' })
  })

  it('uses the first value when Next supplies a string array', () => {
    expect(parseAnalyticsDashboardFilters({ window: ['24h', '7d'], locale: ['en'] })).toMatchObject({ window: '24h', locale: 'en' })
  })
})

describe('toAnalyticsReportWindow', () => {
  const now = new Date('2026-08-08T12:00:00.000Z')

  it('returns exact UTC ISO boundaries for both presets', () => {
    expect(toAnalyticsReportWindow({ window: '24h', locale: 'all', entity: 'all', booking: 'all' }, now))
      .toEqual({ from: '2026-08-07T12:00:00.000Z', to: '2026-08-08T12:00:00.000Z' })
    expect(toAnalyticsReportWindow({ window: '7d', locale: 'all', entity: 'all', booking: 'all' }, now))
      .toEqual({ from: '2026-08-01T12:00:00.000Z', to: '2026-08-08T12:00:00.000Z' })
  })
})

describe('filterAnalyticsRows', () => {
  const rows = [
    { metricKey: 'entity_to_cta', locale: 'en', entityType: 'guide', bookingState: 'off', numerator: 2, denominator: 10, rate: 0.2, sampleCount: 10, status: 'ok', attributionWindowDays: 7 },
    { metricKey: 'entity_to_cta', locale: 'zh-hk', entityType: 'experience', bookingState: 'on', numerator: 1, denominator: 4, rate: null, sampleCount: 4, status: 'insufficient_sample', attributionWindowDays: 7 },
  ] as const

  it('keeps only rows matching every selected dimension', () => {
    expect(filterAnalyticsRows([...rows], { window: '7d', locale: 'en', entity: 'guide', booking: 'off' })).toEqual([rows[0]])
    expect(filterAnalyticsRows([...rows], { window: '7d', locale: 'all', entity: 'all', booking: 'all' })).toEqual(rows)
  })
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter web exec vitest run tests/admin.analytics-dashboard.test.ts`

Expected: FAIL because `@/lib/admin/analytics-dashboard` does not exist.

- [ ] **Step 3: Implement the minimal pure helper**

Create `apps/web/lib/admin/analytics-dashboard.ts` with these exact rules:

```ts
import type { TravellerAnalyticsReportRow, TravellerAnalyticsReportWindow } from './analytics-queries'
import { isLocale, type Locale } from '@/lib/i18n/config'

export const ANALYTICS_WINDOWS = ['24h', '7d'] as const
export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number]
export type AnalyticsLocaleFilter = 'all' | Locale
export const ANALYTICS_ENTITIES = ['guide', 'experience', 'creator', 'article'] as const
export type AnalyticsEntityFilter = 'all' | (typeof ANALYTICS_ENTITIES)[number]
export const ANALYTICS_BOOKING_STATES = ['off', 'on'] as const
export type AnalyticsBookingFilter = 'all' | (typeof ANALYTICS_BOOKING_STATES)[number]

export interface AnalyticsDashboardFilters {
  window: AnalyticsWindow
  locale: AnalyticsLocaleFilter
  entity: AnalyticsEntityFilter
  booking: AnalyticsBookingFilter
}

const first = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const isWindow = (value: string | undefined): value is AnalyticsWindow => value === '24h' || value === '7d'
const isEntity = (value: string | undefined): value is AnalyticsEntityFilter => value === 'all' || (value !== undefined && (ANALYTICS_ENTITIES as readonly string[]).includes(value))
const isBooking = (value: string | undefined): value is AnalyticsBookingFilter => value === 'all' || value === 'off' || value === 'on'

export function parseAnalyticsDashboardFilters(raw: Record<string, string | string[] | undefined>): AnalyticsDashboardFilters {
  const window = first(raw.window)
  const locale = first(raw.locale)
  const entity = first(raw.entity)
  const booking = first(raw.booking)
  return {
    window: isWindow(window) ? window : '7d',
    locale: locale === 'all' || (locale !== undefined && isLocale(locale)) ? locale as AnalyticsLocaleFilter : 'all',
    entity: isEntity(entity) ? entity : 'all',
    booking: isBooking(booking) ? booking : 'all',
  }
}

export function toAnalyticsReportWindow(filters: Pick<AnalyticsDashboardFilters, 'window'>, now = new Date()): TravellerAnalyticsReportWindow {
  const durationMs = filters.window === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  return { from: new Date(now.getTime() - durationMs).toISOString(), to: now.toISOString() }
}

export function filterAnalyticsRows(rows: TravellerAnalyticsReportRow[], filters: Pick<AnalyticsDashboardFilters, 'locale' | 'entity' | 'booking'>): TravellerAnalyticsReportRow[] {
  return rows.filter((row) =>
    (filters.locale === 'all' || row.locale === filters.locale)
    && (filters.entity === 'all' || row.entityType === filters.entity)
    && (filters.booking === 'all' || row.bookingState === filters.booking),
  )
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm --filter web exec vitest run tests/admin.analytics-dashboard.test.ts`

Expected: all helper tests PASS.

- [ ] **Step 5: Commit the helper contract**

```bash
git add apps/web/lib/admin/analytics-dashboard.ts apps/web/tests/admin.analytics-dashboard.test.ts
git commit -m "feat(r8.1): add analytics dashboard filter contract"
```

### Task 2: Add the guarded localized server page

**Files:**
- Create: `apps/web/tests/admin.analytics.host.test.tsx`
- Create: `apps/web/app/[locale]/admin/analytics/page.tsx`

**Interfaces:**
- Consumes: `parseAnalyticsDashboardFilters`, `toAnalyticsReportWindow`, and `filterAnalyticsRows` from Task 1; `createSupabaseServerClient`, `requireOpsPage`, `getDictionary`, and `getTravellerAnalyticsReport` from discovered existing seams.
- Produces: `AdminAnalyticsPage({ params, searchParams })`, passing `{ locale, t, filters, report, error }` to `AdminAnalyticsView`.

- [ ] **Step 1: Write the failing host tests**

Mock the same modules as `apps/web/tests/admin.enquiries.host.test.tsx`. The test suite must assert:

```ts
it('redirects anonymous users and 404s non-ops before the report query', async () => {
  getUserMock.mockResolvedValueOnce({ data: { user: null } })
  await expect(AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) }))
    .rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  roleMock.mockResolvedValueOnce('creator')
  await expect(AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) }))
    .rejects.toThrow('NEXT_NOT_FOUND')
  expect(reportMock).not.toHaveBeenCalled()
})

it('defaults to 7d and passes normalized rows to the view', async () => {
  const ui = await AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })
  expect(reportMock).toHaveBeenCalledWith(expect.anything(), {
    from: expect.any(String),
    to: expect.any(String),
  })
  expect((ui as { props: { filters: unknown } }).props.filters).toEqual({ window: '7d', locale: 'all', entity: 'all', booking: 'all' })
})

it('uses 24h and allowlisted dimensions while coercing invalid values', async () => {
  await AdminAnalyticsPage({
    params: Promise.resolve({ locale: 'zh-hk' }),
    searchParams: Promise.resolve({ window: '24h', locale: 'zh-hk', entity: 'experience', booking: 'on' }),
  })
  expect((viewMock.mock.calls.at(-1)?.[0] as { filters: unknown }).filters)
    .toEqual({ window: '24h', locale: 'zh-hk', entity: 'experience', booking: 'on' })
  await AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ window: '30d', locale: 'DROP TABLE' }) })
  expect((viewMock.mock.calls.at(-1)?.[0] as { filters: unknown }).filters)
    .toEqual({ window: '7d', locale: 'all', entity: 'all', booking: 'all' })
})

it('passes a generic unavailable state when the aggregate query fails', async () => {
  reportMock.mockRejectedValueOnce(new Error('database internals'))
  const ui = await AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })
  expect((ui as { props: { error: string; report: unknown } }).props).toMatchObject({ error: 'unavailable', report: null })
})
```

- [ ] **Step 2: Run the host test to verify it fails**

Run: `pnpm --filter web exec vitest run tests/admin.analytics.host.test.tsx`

Expected: FAIL because the page module and view mock target do not exist.

- [ ] **Step 3: Implement the server page**

Create `apps/web/app/[locale]/admin/analytics/page.tsx` with this flow:

```tsx
import { notFound } from 'next/navigation'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getTravellerAnalyticsReport } from '@/lib/admin/analytics-queries'
import { filterAnalyticsRows, parseAnalyticsDashboardFilters, toAnalyticsReportWindow } from '@/lib/admin/analytics-dashboard'
import { AdminAnalyticsView } from '@/components/kinnso/admin/analytics/AdminAnalyticsView'

export default async function AdminAnalyticsPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ locale: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const filters = parseAnalyticsDashboardFilters(await searchParams)
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)

  try {
    const report = await getTravellerAnalyticsReport(supabase, toAnalyticsReportWindow(filters))
    return <AdminAnalyticsView locale={loc} t={messages.admin} filters={filters} report={{ ...report, rows: filterAnalyticsRows(report.rows, filters) }} error={null} />
  } catch {
    return <AdminAnalyticsView locale={loc} t={messages.admin} filters={filters} report={null} error="unavailable" />
  }
}
```

- [ ] **Step 4: Run the host tests to verify they pass**

Run: `pnpm --filter web exec vitest run tests/admin.analytics.host.test.tsx`

Expected: all host guard/window/filter/error tests PASS.

- [ ] **Step 5: Commit the guarded page**

```bash
git add "apps/web/app/[locale]/admin/analytics/page.tsx" apps/web/tests/admin.analytics.host.test.tsx
git commit -m "feat(r8.1): add guarded analytics page"
```

### Task 3: Render the localized aggregate view accessibly

**Files:**
- Create: `apps/web/tests/kinnso.AdminAnalyticsView.test.tsx`
- Create: `apps/web/components/kinnso/admin/analytics/AdminAnalyticsView.tsx`

**Interfaces:**
- Consumes: `Locale`, `Messages['admin']`, `AnalyticsDashboardFilters`, and `TravellerAnalyticsReport | null` from Tasks 1–2.
- Produces: a server-rendered view with linkable window/filter controls and a table that never renders raw identifiers.

- [ ] **Step 1: Write the failing view tests**

Use `en.admin` and a two-row aggregate fixture. Assert:

```tsx
it('renders active window/filter links and the aggregate table', () => {
  render(<AdminAnalyticsView locale="en" t={en.admin} filters={{ window: '7d', locale: 'all', entity: 'all', booking: 'all' }} report={report} error={null} />)
  expect(screen.getByRole('link', { name: en.admin.analyticsWindow7d }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('link', { name: en.admin.analyticsWindow24h }).getAttribute('href')).toContain('window=24h')
  expect(screen.getByRole('table')).toBeTruthy()
  expect(screen.getByRole('columnheader', { name: en.admin.analyticsMetric })).toBeTruthy()
})

it('shows a rate only for ok rows and explains insufficient samples', () => {
  render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={reportWithOkAndInsufficientRows} error={null} />)
  expect(screen.getByText('20%')).toBeTruthy()
  expect(screen.getByText(en.admin.analyticsInsufficientSample)).toBeTruthy()
  expect(screen.getByText('—')).toBeTruthy()
})

it('renders generic unavailable and zero-data copy without raw identifiers', () => {
  render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={null} error="unavailable" />)
  expect(screen.getByRole('alert')).toHaveTextContent(en.admin.analyticsUnavailable)
  expect(screen.queryByText('journey-id')).toBeNull()
})

it('renders an explicit empty state when the aggregate adapter returns no rows', () => {
  render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={{ ...report, rows: [] }} error={null} />)
  expect(screen.getByText(en.admin.analyticsEmpty)).toBeTruthy()
})
```

- [ ] **Step 2: Run the view test to verify it fails**

Run: `pnpm --filter web exec vitest run tests/kinnso.AdminAnalyticsView.test.tsx`

Expected: FAIL because the view module and message keys do not exist.

- [ ] **Step 3: Implement the presentation component**

Create `apps/web/components/kinnso/admin/analytics/AdminAnalyticsView.tsx` as a server component. It must:

1. Build links that preserve the current `window`, `locale`, `entity`, and `booking` values while replacing exactly one control; use `encodeURIComponent` for values and `/\?`-safe query construction.
2. Render a `<main>` with localized title/subtitle, UTC/retention/attribution/sample-floor note, and a `<nav aria-label={t.analyticsFilters}>` for window and dimension links.
3. Render a `<table>` with `<caption>`, `<thead>`, `<th scope="col">`, and columns metric, locale, entity type, Booking state, numerator, denominator/sample count, rate, and status.
4. Map the known SQL metric keys (`discovery_to_entity`, `entity_to_agent`, `entity_to_cta`, `cta_to_waitlist_submitted`, `cta_to_checkout_started`, `agent_start_rate`, `signup_start_to_completion`, and `error_invalid`, `error_rate_limited`, `error_unavailable`, `error_unknown`) to dedicated localized admin message keys.
5. Show `Math.round(rate * 10000) / 100 + '%'` only when `row.status === 'ok'` and `row.rate !== null`; otherwise show `—` and the localized insufficient-sample status with `row.sampleCount`.
6. Render an alert with generic unavailable copy when `error === 'unavailable'`; render the localized observed-zero explanation when the filtered report exists but every numerator and denominator is zero.
7. Use visible status text in addition to any color, preserve narrow-screen overflow, and never render any identifier other than allowlisted dimension values.

The component's core shape should be equivalent to this (with the exact
localized message keys listed in Task 4):

```tsx
import Link from 'next/link'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import type { TravellerAnalyticsReport } from '@/lib/admin/analytics-queries'
import type { AnalyticsDashboardFilters } from '@/lib/admin/analytics-dashboard'

type Props = {
  locale: Locale
  t: Messages['admin']
  filters: AnalyticsDashboardFilters
  report: TravellerAnalyticsReport | null
  error: 'unavailable' | null
}

const metricLabel = (t: Messages['admin'], key: string) => ({
  discovery_to_entity: t.analyticsMetricDiscoveryToEntity,
  entity_to_agent: t.analyticsMetricEntityToAgent,
  entity_to_cta: t.analyticsMetricEntityToCta,
  cta_to_waitlist_submitted: t.analyticsMetricCtaToWaitlist,
  cta_to_checkout_started: t.analyticsMetricCtaToCheckout,
  agent_start_rate: t.analyticsMetricAgentStart,
  signup_start_to_completion: t.analyticsMetricSignupCompletion,
  error_invalid: t.analyticsMetricErrorInvalid,
  error_rate_limited: t.analyticsMetricErrorRateLimited,
  error_unavailable: t.analyticsMetricErrorUnavailable,
  error_unknown: t.analyticsMetricErrorUnknown,
} as Record<string, string>)[key] ?? t.analyticsMetricUnknown

function href(locale: Locale, filters: AnalyticsDashboardFilters, patch: Partial<AnalyticsDashboardFilters>) {
  const next = { ...filters, ...patch }
  const query = new URLSearchParams({ window: next.window, locale: next.locale, entity: next.entity, booking: next.booking })
  return `/${locale}/admin/analytics?${query.toString()}`
}

export function AdminAnalyticsView({ locale, t, filters, report, error }: Props) {
  const rows = report?.rows ?? []
  const hasNoRows = report !== null && rows.length === 0
  const hasObservedZero = report !== null && rows.length > 0 && rows.every((row) => row.numerator === 0 && row.denominator === 0)
  const entityLabels = { guide: t.analyticsEntityGuide, experience: t.analyticsEntityExperience, creator: t.analyticsEntityCreator, article: t.analyticsEntityArticle }

  return (
    <main>
      <h1 className="k-display">{t.analyticsTitle}</h1>
      <p className="mt-2 text-kinnso-muted">{t.analyticsSubtitle}</p>
      <p className="mt-3 text-sm text-kinnso-muted">{t.analyticsUtcNote} {t.analyticsRetentionNote} {t.analyticsAttributionNote} {t.analyticsSampleFloorNote}</p>
      <nav className="mt-6 flex flex-wrap gap-2" aria-label={t.analyticsFilters}>
        {(['7d', '24h'] as const).map((window) => <Link key={window} href={href(locale, filters, { window })} aria-current={filters.window === window ? 'page' : undefined} className="rounded-lg px-3 py-2 text-sm font-bold text-kinnso-ink">{window === '7d' ? t.analyticsWindow7d : t.analyticsWindow24h}</Link>)}
        {(['all', 'en', 'zh-hk', 'zh-tw', 'ja', 'ko', 'th', 'zh-cn'] as const).map((value) => <Link key={value} href={href(locale, filters, { locale: value })} aria-current={filters.locale === value ? 'page' : undefined} className="rounded-lg px-3 py-2 text-sm font-bold text-kinnso-ink">{value === 'all' ? t.analyticsAll : value}</Link>)}
        {(['all', 'guide', 'experience', 'creator', 'article'] as const).map((value) => <Link key={value} href={href(locale, filters, { entity: value })} aria-current={filters.entity === value ? 'page' : undefined} className="rounded-lg px-3 py-2 text-sm font-bold text-kinnso-ink">{value === 'all' ? t.analyticsAll : entityLabels[value]}</Link>)}
        {(['all', 'off', 'on'] as const).map((value) => <Link key={value} href={href(locale, filters, { booking: value })} aria-current={filters.booking === value ? 'page' : undefined} className="rounded-lg px-3 py-2 text-sm font-bold text-kinnso-ink">{value === 'all' ? t.analyticsAll : value === 'off' ? t.analyticsBookingOff : t.analyticsBookingOn}</Link>)}
      </nav>
      {error ? <p role="alert" className="mt-8 text-sm text-red-600">{t.analyticsUnavailable} {t.analyticsRetry}</p> : hasNoRows ? <p className="mt-8 text-sm text-kinnso-muted">{t.analyticsEmpty}</p> : hasObservedZero ? <p className="mt-8 text-sm text-kinnso-muted">{t.analyticsObservedZero}</p> : (
        <div className="mt-8 overflow-x-auto rounded-xl border border-kinnso-ink/10 bg-white">
          <table className="min-w-full text-left text-sm"><caption className="sr-only">{t.analyticsTableCaption}</caption><thead><tr>
            {[t.analyticsMetric, t.analyticsLocale, t.analyticsEntityType, t.analyticsBookingState, t.analyticsNumerator, t.analyticsDenominator, t.analyticsRate, t.analyticsStatus].map((label) => <th key={label} scope="col" className="px-4 py-3 font-bold text-kinnso-ink">{label}</th>)}
          </tr></thead><tbody>
            {rows.map((row) => <tr key={`${row.metricKey}-${row.locale}-${row.entityType ?? 'none'}-${row.bookingState}`} className="border-t border-kinnso-ink/10">
              <td className="px-4 py-3">{metricLabel(t, row.metricKey)}</td><td className="px-4 py-3">{row.locale}</td><td className="px-4 py-3">{row.entityType ? entityLabels[row.entityType as keyof typeof entityLabels] : '—'}</td><td className="px-4 py-3">{row.bookingState === 'on' ? t.analyticsBookingOn : t.analyticsBookingOff}</td><td className="px-4 py-3">{row.numerator.toLocaleString(locale)}</td><td className="px-4 py-3">{row.sampleCount.toLocaleString(locale)}</td><td className="px-4 py-3">{row.status === 'ok' && row.rate !== null ? `${Math.round(row.rate * 10000) / 100}%` : '—'}</td><td className="px-4 py-3">{row.status === 'ok' ? t.analyticsOk : `${t.analyticsInsufficientSample} (${row.sampleCount.toLocaleString(locale)})`}</td>
            </tr>)}
          </tbody></table>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Run the view tests to verify they pass**

Run: `pnpm --filter web exec vitest run tests/kinnso.AdminAnalyticsView.test.tsx`

Expected: all presentation, sample-floor, unavailable, and table-accessibility tests PASS.

- [ ] **Step 5: Commit the view**

```bash
git add apps/web/components/kinnso/admin/analytics/AdminAnalyticsView.tsx apps/web/tests/kinnso.AdminAnalyticsView.test.tsx
git commit -m "feat(r8.1): render ops analytics dashboard"
```

### Task 4: Add admin navigation and seven-locale copy

**Files:**
- Modify: `apps/web/components/kinnso/admin/AdminShell.tsx`
- Modify: `apps/web/tests/kinnso.AdminShell.test.tsx`
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`

**Interfaces:**
- Consumes: `Messages['admin']` and the existing `AdminShell` nav array.
- Produces: `t.navAnalytics` and the complete `analytics*` message keys used by `AdminAnalyticsView`.

- [ ] **Step 1: Extend the existing shell test first**

Add to `apps/web/tests/kinnso.AdminShell.test.tsx`:

```tsx
expect((screen.getByRole('link', { name: en.admin.navAnalytics }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin/analytics')

pathname = '/en/admin/analytics'
render(<AdminShell locale="en" t={en.admin}><p>child-content</p></AdminShell>)
expect(screen.getByRole('link', { name: en.admin.navAnalytics }).getAttribute('aria-current')).toBe('page')
```

- [ ] **Step 2: Run the shell test to verify it fails**

Run: `pnpm --filter web exec vitest run tests/kinnso.AdminShell.test.tsx`

Expected: FAIL because `navAnalytics` is not defined and the nav item is absent.

- [ ] **Step 3: Add the nav item and exact message contract**

Insert `{ href: \`/${locale}/admin/analytics\`, label: t.navAnalytics }` in the existing admin nav array. Extend the `admin` interface in `apps/web/lib/i18n/messages/en.ts` and add matching values in every locale file for these keys:

`navAnalytics`, `analyticsTitle`, `analyticsSubtitle`, `analyticsWindow24h`,
`analyticsWindow7d`, `analyticsFilters`, `analyticsAll`,
`analyticsUtcNote`, `analyticsRetentionNote`, `analyticsAttributionNote`,
`analyticsSampleFloorNote`, `analyticsTableCaption`, `analyticsMetric`,
`analyticsLocale`, `analyticsEntityType`, `analyticsBookingState`,
`analyticsNumerator`, `analyticsDenominator`, `analyticsRate`, `analyticsStatus`,
`analyticsOk`, `analyticsInsufficientSample`, `analyticsUnavailable`,
`analyticsRetry`, `analyticsEmpty`, `analyticsObservedZero`, `analyticsEntityGuide`,
`analyticsEntityExperience`, `analyticsEntityCreator`, `analyticsEntityArticle`,
`analyticsBookingOff`, `analyticsBookingOn`, `analyticsMetricDiscoveryToEntity`,
`analyticsMetricEntityToAgent`, `analyticsMetricEntityToCta`,
`analyticsMetricCtaToWaitlist`, `analyticsMetricCtaToCheckout`,
`analyticsMetricAgentStart`, `analyticsMetricSignupCompletion`,
`analyticsMetricErrorInvalid`, `analyticsMetricErrorRateLimited`,
`analyticsMetricErrorUnavailable`, `analyticsMetricErrorUnknown`, and
`analyticsMetricUnknown`.

Keep the values semantically equivalent across all seven locales; do not add a
fallback locale or a new message group.

- [ ] **Step 4: Run the shell and locale-parity tests**

Run: `pnpm --filter web exec vitest run tests/kinnso.AdminShell.test.tsx tests/i18n.locale-parity.test.ts`

Expected: both suites PASS with the new nav/copy contract present in all seven locales.

- [ ] **Step 5: Commit navigation and copy**

```bash
git add apps/web/components/kinnso/admin/AdminShell.tsx apps/web/tests/kinnso.AdminShell.test.tsx apps/web/lib/i18n/messages
git commit -m "feat(r8.1): add analytics admin navigation copy"
```

### Task 5: Run the complete verification gate and prepare the PR

**Files:**
- Modify only if verification reveals a directly introduced defect; otherwise no source changes.
- Review: all R8.1 files plus the existing R8.0 verification report.

**Interfaces:**
- Consumes: the completed R8.1 page, helper, view, nav, messages, and tests.
- Produces: a clean branch with reproducible verification evidence and a PR-ready commit history.

- [ ] **Step 1: Run focused R8.1 tests**

Run:

```bash
pnpm --filter web exec vitest run tests/admin.analytics-dashboard.test.ts tests/admin.analytics.host.test.tsx tests/kinnso.AdminAnalyticsView.test.tsx tests/kinnso.AdminShell.test.tsx tests/admin.analytics-queries.test.ts tests/api.admin-analytics.test.ts
```

Expected: all listed tests PASS.

- [ ] **Step 2: Run the workspace checks**

Run:

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web exec vitest run tests/i18n.locale-parity.test.ts
```

Expected: typecheck and locale parity PASS; lint may report only the documented pre-existing warnings and must not introduce a new error.

- [ ] **Step 3: Run the existing R8.0 verification baseline**

Run the same focused measurement, privacy, and workspace commands recorded in `docs/superpowers/plans/2026-08-01-phase-r8-0-measurement-baseline.md`. Expected: previously green checks remain green; the known local Supabase-unavailable sitemap page-data failure remains clearly separated if the environment still lacks the local database.

- [ ] **Step 4: Review the diff for scope and privacy**

Run:

```bash
git diff --check HEAD~4..HEAD
git diff --stat HEAD~4..HEAD
rg -n "journey_id|client_event_id|account_id|traveller_analytics_events|service_role|CREATE TABLE|ALTER TABLE" apps/web/app apps/web/components apps/web/lib apps/web/tests
```

Expected: no raw-ledger identifiers, service-role usage, or schema DDL in R8.1 application/test changes; only allowlisted aggregate fields and existing query seams are present.

- [ ] **Step 5: Confirm clean branch and summarize release boundary**

Run: `git status -sb; git log --oneline --decorate -8`

Expected: clean `codex/r8-1-ops-analytics` branch, with no production migration, seeding, activation, vendor, or public-route change.

- [ ] **Step 6: Commit any verification-only documentation update**

If and only if the verification report needs a R8.1 line, commit it as:

```bash
git add docs/superpowers/plans/2026-08-04-phase-r8-1-ops-analytics-dashboard.md
git commit -m "docs(r8.1): record dashboard verification"
```

Otherwise leave the plan unchanged and hand off the existing task evidence for PR creation/review.
