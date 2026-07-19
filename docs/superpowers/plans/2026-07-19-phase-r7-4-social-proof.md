# Phase R7.4 Social Proof Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render honest threshold-gated platform stats and real audience-matched testimonials across KINNSO's three public social-proof pages.

**Architecture:** Keep `platform_stats()` and `getPublishedTestimonials()` as the existing anonymous RLS-protected read boundaries. Narrow `StatsBar` to the four R7.4 metrics, replace all hidden metrics with one aggregate localized chip, and move the three public pages to one-hour ISR while extending successful testimonial mutation invalidation to every affected path.

**Tech Stack:** Next.js 16 App Router, React 19 server components, TypeScript, Supabase JS, Vitest, Testing Library, pnpm.

## Global Constraints

- Homepage Section 2 uses `platform_stats` counts for creators, published guides, destinations, and completed bookings.
- Threshold-gate each metric: hide below threshold and render one qualitative “Growing fast” chip instead; never display zero.
- Render every threshold-passing real count plus exactly one aggregate qualitative chip whenever any of the four metrics is below threshold.
- Homepage testimonials use real published rows; creator and merchant landing pages use only their matching `author_role` rows.
- Empty testimonial result sets hide their section entirely; never invent testimonial rows.
- Public reads remain anonymous and protected by RLS; no database migration or production write belongs in R7.4.
- Set all three public social-proof pages to `revalidate = 3600` and explicitly invalidate all three routes after successful testimonial mutations.
- Every new UI string must exist in all seven locale files and preserve locale parity.
- Preserve reads-never-crash behavior when stats or testimonials are unavailable.
- Use TDD: add the behavior test, observe the expected failure, then write the minimum implementation.
- Use Conventional Commits with an R7 scope.
- The known full-suite baseline is 1,824 passing and 27 failing tests across 12 Supabase-connected integration files when the external test database is unreachable. Focused R7.4 suites must pass independently.

---

## File Map

| File | Responsibility |
| --- | --- |
| `apps/web/components/kinnso/home/StatsBar.tsx` | Render the four honest metrics and aggregate qualitative chip |
| `apps/web/lib/home/queries.ts` | Retain the RPC and testimonial boundaries; expose only R7.4 stat thresholds and document one-hour testimonial rotation |
| `apps/web/lib/i18n/messages/{en,zh-hk,zh-cn,zh-tw,ja,ko,th}.ts` | Type and translate `home.statGrowingFast` |
| `apps/web/app/[locale]/page.tsx` | One-hour homepage ISR |
| `apps/web/app/[locale]/for-creators/page.tsx` | One-hour creator landing ISR and creator-tagged testimonial read |
| `apps/web/app/[locale]/for-merchants/page.tsx` | One-hour merchant landing ISR and merchant-tagged testimonial read |
| `apps/web/lib/admin/testimonials-actions.ts` | Invalidate all public testimonial consumers after successful ops mutations |
| `apps/web/tests/kinnso.home-hero-stats.test.tsx` | Stats rendering behavior |
| `apps/web/tests/home.queries.test.ts` | RPC mapping, testimonial selection, and threshold contract |
| `apps/web/tests/i18n.locale-parity.test.ts` | All-locale key parity |
| `apps/web/tests/home.host.test.tsx` | Homepage caller and ISR contract |
| `apps/web/tests/r7-4-social-proof-pages.host.test.tsx` | Audience-page caller and ISR contracts |
| `apps/web/tests/admin.testimonials-actions.test.ts` | Successful mutation cache invalidation |

---

### Task 1: Honest Stats Bar and Localized Aggregate Chip

**Files:**
- Modify: `apps/web/tests/kinnso.home-hero-stats.test.tsx`
- Modify: `apps/web/tests/home.queries.test.ts`
- Modify: `apps/web/components/kinnso/home/StatsBar.tsx`
- Modify: `apps/web/lib/home/queries.ts`
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`
- Test: `apps/web/tests/kinnso.home-hero-stats.test.tsx`
- Test: `apps/web/tests/home.queries.test.ts`
- Test: `apps/web/tests/i18n.locale-parity.test.ts`

**Interfaces:**
- Consumes: `PlatformStats` from `getPlatformStats(): Promise<PlatformStats | null>` and `Messages['home']`.
- Produces: `STAT_THRESHOLDS` with exactly `activeCreators`, `publishedGuides`, `destinations`, and `completedBookings`; `home.statGrowingFast: string` in every locale; unchanged `StatsBar` component signature.

- [ ] **Step 1: Replace the old whole-bar hiding tests with failing R7.4 behavior tests**

Keep the existing null test, then replace the remaining `StatsBar` tests with:

```tsx
it('renders one qualitative chip and no number when every metric is below threshold', () => {
  const { container } = render(
    <StatsBar locale="en" t={t} stats={{ activeCreators: 0, publishedGuides: 0, destinations: 0, completedBookings: 0, upcomingSessions: 0 }} />,
  )
  expect(screen.getAllByText(t.statGrowingFast)).toHaveLength(1)
  expect(container.textContent).not.toMatch(/\d/)
})

it('renders each passing count plus exactly one aggregate chip for hidden metrics', () => {
  render(
    <StatsBar locale="en" t={t} stats={{ activeCreators: 12, publishedGuides: 3, destinations: 2, completedBookings: 0, upcomingSessions: 9 }} />,
  )
  expect(screen.getByText('12')).toBeTruthy()
  expect(screen.getByText(t.statCreators)).toBeTruthy()
  expect(screen.getAllByText(t.statGrowingFast)).toHaveLength(1)
  expect(screen.queryByText(t.statGuides)).toBeNull()
  expect(screen.queryByText(t.statDestinations)).toBeNull()
  expect(screen.queryByText(t.statCompletedBookings)).toBeNull()
  expect(screen.queryByText('0')).toBeNull()
})

it('renders all four boundary values without the chip or upcoming sessions', () => {
  render(
    <StatsBar locale="en" t={t} stats={{ activeCreators: 5, publishedGuides: 10, destinations: 3, completedBookings: 3, upcomingSessions: 9 }} />,
  )
  expect(screen.getByText(t.statCreators)).toBeTruthy()
  expect(screen.getByText(t.statGuides)).toBeTruthy()
  expect(screen.getByText(t.statDestinations)).toBeTruthy()
  expect(screen.getByText(t.statCompletedBookings)).toBeTruthy()
  expect(screen.queryByText(t.statGrowingFast)).toBeNull()
  expect(screen.queryByText(t.statUpcomingSessions)).toBeNull()
})
```

In `home.queries.test.ts`, remove `MIN_VISIBLE_STATS` from the import and replace the threshold assertion with:

```ts
expect(STAT_THRESHOLDS).toEqual({
  activeCreators: 5,
  publishedGuides: 10,
  destinations: 3,
  completedBookings: 3,
})
```

- [ ] **Step 2: Run the stats tests and verify RED**

Run from `apps/web`:

```powershell
pnpm exec vitest run tests/kinnso.home-hero-stats.test.tsx tests/home.queries.test.ts --reporter=dot
```

Expected: FAIL because `statGrowingFast` is absent, the old component returns `null` when fewer than two metrics pass, and `STAT_THRESHOLDS` still contains `upcomingSessions`.

- [ ] **Step 3: Add the typed localized qualitative copy**

In the canonical English `Messages.home` type, add `statGrowingFast: string` beside the existing stat keys. Add these exact values to each `home` dictionary object:

```ts
// en.ts
statGrowingFast: 'Growing fast',

// zh-hk.ts
statGrowingFast: '快速成長中',

// zh-cn.ts
statGrowingFast: '快速成长中',

// zh-tw.ts
statGrowingFast: '快速成長中',

// ja.ts
statGrowingFast: '急成長中',

// ko.ts
statGrowingFast: '빠르게 성장 중',

// th.ts
statGrowingFast: 'เติบโตอย่างรวดเร็ว',
```

- [ ] **Step 4: Implement the four-metric threshold contract**

In `queries.ts`, retain `PlatformStats.upcomingSessions` because the RPC contract is shared, but replace the threshold block with:

```ts
/** Display thresholds for the four R7.4 platform-scale metrics. */
export const STAT_THRESHOLDS = {
  activeCreators: 5,
  publishedGuides: 10,
  destinations: 3,
  completedBookings: 3,
} as const
```

Delete `MIN_VISIBLE_STATS`. In `StatsBar.tsx`, remove its import and replace the candidate/filter/render logic with:

```tsx
if (!stats) return null
const candidates = [
  { key: 'creators', value: stats.activeCreators, min: STAT_THRESHOLDS.activeCreators, label: t.statCreators },
  { key: 'guides', value: stats.publishedGuides, min: STAT_THRESHOLDS.publishedGuides, label: t.statGuides },
  { key: 'destinations', value: stats.destinations, min: STAT_THRESHOLDS.destinations, label: t.statDestinations },
  { key: 'bookings', value: stats.completedBookings, min: STAT_THRESHOLDS.completedBookings, label: t.statCompletedBookings },
]
const entries = candidates.filter((candidate) => candidate.value >= candidate.min)
const hasSubThresholdMetric = entries.length < candidates.length
const fmt = new Intl.NumberFormat(locale)

return (
  <div className="border-b border-kinnso-edge bg-kinnso-cream">
    <ul className="k2-container flex flex-wrap items-baseline gap-x-12 gap-y-4 py-8">
      {entries.map((stat) => (
        <li key={stat.key} className="flex items-baseline gap-2">
          <span className="k2-display text-3xl font-semibold text-kinnso-ink">{fmt.format(stat.value)}</span>
          <span className="text-sm text-kinnso-ink/70">{stat.label}</span>
        </li>
      ))}
      {hasSubThresholdMetric ? (
        <li key="growing-fast">
          <span className="inline-flex rounded-full border border-kinnso-edge bg-white px-4 py-2 text-sm font-semibold text-kinnso-ink">
            {t.statGrowingFast}
          </span>
        </li>
      ) : null}
    </ul>
  </div>
)
```

Update the component comment to state the four R7.4 metrics and aggregate-chip rule; do not describe the deleted minimum-visible rule.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run from `apps/web`:

```powershell
pnpm exec vitest run tests/kinnso.home-hero-stats.test.tsx tests/home.queries.test.ts tests/i18n.locale-parity.test.ts --reporter=dot
```

Expected: all selected test files PASS with no missing locale keys.

- [ ] **Step 6: Typecheck the web app**

Run from `apps/web`:

```powershell
pnpm typecheck
```

Expected: exit 0; the canonical message type accepts all seven dictionaries and `StatsBar` receives `statGrowingFast`.

- [ ] **Step 7: Commit Task 1**

```powershell
git add apps/web/components/kinnso/home/StatsBar.tsx apps/web/lib/home/queries.ts apps/web/lib/i18n/messages apps/web/tests/kinnso.home-hero-stats.test.tsx apps/web/tests/home.queries.test.ts
git commit -m "feat(r7): render honest platform growth proof"
```

---

### Task 2: Audience Testimonial Freshness and Caller Contracts

**Files:**
- Create: `apps/web/tests/r7-4-social-proof-pages.host.test.tsx`
- Modify: `apps/web/tests/home.host.test.tsx`
- Modify: `apps/web/tests/admin.testimonials-actions.test.ts`
- Modify: `apps/web/app/[locale]/page.tsx`
- Modify: `apps/web/app/[locale]/for-creators/page.tsx`
- Modify: `apps/web/app/[locale]/for-merchants/page.tsx`
- Modify: `apps/web/lib/admin/testimonials-actions.ts`
- Modify: `apps/web/lib/home/queries.ts`
- Test: `apps/web/tests/home.host.test.tsx`
- Test: `apps/web/tests/r7-4-social-proof-pages.host.test.tsx`
- Test: `apps/web/tests/admin.testimonials-actions.test.ts`
- Test: `apps/web/tests/for-creators.host.test.tsx`
- Test: `apps/web/tests/for-merchants.host.test.tsx`

**Interfaces:**
- Consumes: `getPublishedTestimonials(locale, role?)`, `LOCALES`, and Next.js `revalidatePath`.
- Produces: `revalidate = 3600` from all three page modules; successful testimonial mutations invalidate `/${locale}`, `/${locale}/for-creators`, and `/${locale}/for-merchants` for each locale.

- [ ] **Step 1: Write failing caller, ISR, and invalidation tests**

In `home.host.test.tsx`, hoist a `testimonialsMock`, resolve it to `[]` in `beforeEach`, use it for `getPublishedTestimonials`, and add:

```ts
it('loads locale-aware homepage testimonials across audience roles', async () => {
  await LocaleHome({ params: Promise.resolve({ locale: 'en' }) })
  expect(testimonialsMock).toHaveBeenCalledWith('en')
})

it('ISR-revalidates approximately hourly', () => {
  expect(revalidate).toBe(3600)
})
```

Delete the old five-minute ISR assertion.

Create `r7-4-social-proof-pages.host.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { testimonialsMock } = vi.hoisted(() => ({ testimonialsMock: vi.fn(async () => []) }))

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/lib/home/queries', () => ({ getPublishedTestimonials: testimonialsMock }))
vi.mock('@/lib/product-state', () => ({ resolveConfiguredProductState: () => ({ bookingLive: false }) }))

import ForCreatorsPage, { revalidate as creatorsRevalidate } from '@/app/[locale]/for-creators/page'
import ForMerchantsPage, { revalidate as merchantsRevalidate } from '@/app/[locale]/for-merchants/page'

beforeEach(() => vi.clearAllMocks())

describe('R7.4 audience testimonial pages', () => {
  it('requests only creator-tagged testimonials', async () => {
    await ForCreatorsPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(testimonialsMock).toHaveBeenCalledWith('en', 'creator')
  })

  it('requests only merchant-tagged testimonials', async () => {
    await ForMerchantsPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(testimonialsMock).toHaveBeenCalledWith('en', 'merchant')
  })

  it('revalidates both audience pages approximately hourly', () => {
    expect(creatorsRevalidate).toBe(3600)
    expect(merchantsRevalidate).toBe(3600)
  })
})
```

In the successful create test in `admin.testimonials-actions.test.ts`, replace the old cache comment/assertions with:

```ts
// admin list + homepage + both audience pages for all 7 locales
expect(revalidateMock).toHaveBeenCalledTimes(22)
expect(revalidateMock).toHaveBeenCalledWith('/en/admin/testimonials')
expect(revalidateMock).toHaveBeenCalledWith('/zh-hk')
expect(revalidateMock).toHaveBeenCalledWith('/zh-hk/for-creators')
expect(revalidateMock).toHaveBeenCalledWith('/zh-hk/for-merchants')
```

- [ ] **Step 2: Run the cache and caller tests and verify RED**

Run from `apps/web`:

```powershell
pnpm exec vitest run tests/home.host.test.tsx tests/r7-4-social-proof-pages.host.test.tsx tests/admin.testimonials-actions.test.ts --reporter=dot
```

Expected: FAIL because page modules still export `300` and mutations do not invalidate the two audience landing routes.

- [ ] **Step 3: Implement one-hour ISR and complete invalidation**

Set this exact export in all three page modules:

```ts
export const revalidate = 3600
```

Update the homepage ISR comment to describe approximately one-hour stats and content freshness. Update the testimonial rotation documentation in `queries.ts` from `revalidate = 300` / five minutes to `revalidate = 3600` / approximately one hour.

Replace `revalidateTestimonialSurfaces` with:

```ts
/** Refresh every public testimonial consumer after a successful ops mutation. */
function revalidateTestimonialSurfaces(locale: Locale) {
  revalidatePath(adminTestimonialsPath(locale))
  for (const l of LOCALES) {
    revalidatePath(`/${l}`)
    revalidatePath(`/${l}/for-creators`)
    revalidatePath(`/${l}/for-merchants`)
  }
}
```

- [ ] **Step 4: Run all testimonial and host coverage and verify GREEN**

Run from `apps/web`:

```powershell
pnpm exec vitest run tests/home.host.test.tsx tests/r7-4-social-proof-pages.host.test.tsx tests/admin.testimonials-actions.test.ts tests/home.queries.test.ts tests/for-creators.host.test.tsx tests/for-merchants.host.test.tsx --reporter=dot
```

Expected: all selected test files PASS. Existing empty-array view tests prove sections hide entirely; query tests prove published locale filtering, role filtering, shuffle, and the cap of three.

- [ ] **Step 5: Typecheck the web app**

Run from `apps/web`:

```powershell
pnpm typecheck
```

Expected: exit 0.

- [ ] **Step 6: Commit Task 2**

```powershell
git add apps/web/app/[locale]/page.tsx apps/web/app/[locale]/for-creators/page.tsx apps/web/app/[locale]/for-merchants/page.tsx apps/web/lib/admin/testimonials-actions.ts apps/web/lib/home/queries.ts apps/web/tests/home.host.test.tsx apps/web/tests/r7-4-social-proof-pages.host.test.tsx apps/web/tests/admin.testimonials-actions.test.ts
git commit -m "feat(r7): refresh audience-matched testimonials"
```

---

## Post-plan verification correction

The successful production build manifest showed `/[locale]`, `/[locale]/for-creators`, and `/[locale]/for-merchants` at an effective five-minute revalidation interval even though their page modules declare `revalidate = 3600`. Next.js uses the lowest `revalidate` across a route's page and layouts; the binding `apps/web/app/[locale]/layout.tsx` intentionally remains at `revalidate = 300` for R7.2 product-state truth and must not be raised or removed.

The correction is a module-scoped one-hour Next Data Cache around only the successful `platform_stats()` and published-testimonial raw reads. The raw readers throw on Supabase failures or missing stats rows; the public exported functions catch outside the cache and preserve `null` / `[]` reads-never-crash fallbacks, so failures are not cached. Successful testimonial mutations retain their existing path invalidation.

Verification for this correction is:

```powershell
pnpm exec vitest run tests/home.queries.test.ts tests/layout.siteChrome.test.tsx tests/home.host.test.tsx tests/r7-4-social-proof-pages.host.test.tsx --reporter=dot
pnpm typecheck
```

The focused cache-policy test uses a stateful `unstable_cache` fake with one resolved-value map per wrapper, keyed by serialized invocation arguments, and clears every map before each test. It retains the 3600-second wrapper assertions and adds fail-then-success cases proving rejected raw reads are retried rather than cached for both platform stats and testimonials. The fix is committed as `fix(r7): enforce social-proof cache window`.

## Final Verification

After both reviewed task commits:

- [ ] Run the complete focused R7.4 suite from `apps/web`:

```powershell
pnpm exec vitest run tests/kinnso.home-hero-stats.test.tsx tests/home.queries.test.ts tests/i18n.locale-parity.test.ts tests/home.host.test.tsx tests/r7-4-social-proof-pages.host.test.tsx tests/admin.testimonials-actions.test.ts tests/for-creators.host.test.tsx tests/for-merchants.host.test.tsx --reporter=dot
```

- [ ] Run web TypeScript validation:

```powershell
pnpm typecheck
```

- [ ] Run the production web build:

```powershell
pnpm build
```

- [ ] Run `git diff --check` and confirm only R7.4 files changed.
- [ ] Perform a broad whole-branch review against the approved design and authoritative R7.4 acceptance criteria.
- [ ] Use `superpowers:finishing-a-development-branch` to prepare the squash-merge PR handoff.
