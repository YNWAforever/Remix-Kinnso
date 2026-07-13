# Phase R7.1 — Funnel Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore every published guide and experience detail route, contain optional-module failures, and continuously verify the public guide-to-experience funnel and sitemap.

**Architecture:** The two personalized detail pages become explicit request-rendered routes while their primary entities remain anon/RLS reads. A shared typed containment helper gives every secondary module a deliberate fallback; localized segment boundaries catch only unexpected primary/render failures. Feature-aware build validation, deterministic local fixtures, PR Playwright smoke coverage, and a nightly production sitemap crawl prevent recurrence.

**Tech Stack:** Next.js 16.2.9 App Router, React 19.2.4, TypeScript 5, Supabase SSR/supabase-js, Vitest 4, Playwright, GitHub Actions, Node 22, pnpm 11.6.0.

## Global Constraints

- The authoritative requirements are R7.1 in `kinnso-phase-r7-ux-hardening-spec.md`, the approved design at `docs/superpowers/specs/2026-07-13-phase-r7-1-funnel-reliability-design.md`, and program §7.
- Every added UI string must exist in `en`, `zh-hk`, `zh-tw`, `ja`, `ko`, `th`, and `zh-cn`; `apps/web/tests/i18n.locale-parity.test.ts` must remain green.
- Locale pages preserve `await params` → `isLocale` guard → `notFound()` → `getDictionary` ordering.
- Primary public reads use the cookie-less anon client under RLS. The authenticated server client is limited to viewer-specific state and audited Server Actions.
- Unknown guide and experience slugs call `notFound()` and return HTTP 404, never 500.
- Availability, auth, save state, ratings, reviews, cross-links, and JSON-LD are secondary modules: a failure removes only that module.
- `BOOKING_LIVE` defaults off when unset. Do not create Stripe Checkout Sessions while it is false.
- Do not mutate production Supabase data or expose environment/secret values in errors, logs, tests, commits, or PR text.
- Use Conventional Commits with scope and one squash-merged PR titled `Phase R7.1 — Funnel reliability`.

---

### Task 1: Add feature-aware, actionable environment validation

**Files:**
- Create: `apps/web/lib/env.ts`
- Create: `apps/web/tests/env.test.ts`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/lib/supabase/public.ts`
- Modify: `apps/web/lib/stripe/client.ts`

**Interfaces:**
- Produces: `validateBuildEnv(env?: NodeJS.ProcessEnv): void`.
- Produces: `getSupabasePublicEnv(env?: NodeJS.ProcessEnv): { url: string; anonKey: string }`.
- Produces: `getStripeSecretKey(env?: NodeJS.ProcessEnv): string`.
- Feature gates: `BOOKING_LIVE=true` and `AGENT_LIVE=true`; unset means validation does not require that feature's provider secret.

- [ ] **Step 1: Write the failing validator tests**

Create `apps/web/tests/env.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getStripeSecretKey, getSupabasePublicEnv, validateBuildEnv } from '@/lib/env'

const core = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-test',
}

describe('R7 environment validation', () => {
  it('names a missing core variable without echoing values', () => {
    expect(() => validateBuildEnv({ NEXT_PUBLIC_SUPABASE_URL: 'secret-url-value' }))
      .toThrow('core web: missing NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY')
    try { validateBuildEnv({ NEXT_PUBLIC_SUPABASE_URL: 'secret-url-value' }) } catch (error) {
      expect(String(error)).not.toContain('secret-url-value')
    }
  })

  it('accepts server-name fallbacks for Supabase', () => {
    expect(getSupabasePublicEnv({ SUPABASE_URL: 'https://server.test', SUPABASE_ANON_KEY: 'anon' }))
      .toEqual({ url: 'https://server.test', anonKey: 'anon' })
  })

  it('requires the complete Stripe surface only when booking is live', () => {
    expect(() => validateBuildEnv({ ...core, BOOKING_LIVE: 'false' })).not.toThrow()
    expect(() => validateBuildEnv({ ...core, BOOKING_LIVE: 'true', STRIPE_SECRET_KEY: 'sk_test_x' }))
      .toThrow('booking: missing STRIPE_WEBHOOK_SECRET')
    expect(() => validateBuildEnv({
      ...core, BOOKING_LIVE: 'true', STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x', NEXT_PUBLIC_SITE_URL: 'https://www.kinnso.ai',
    })).not.toThrow()
  })

  it('accepts Vercel runtime identity or an explicit AI key for a live agent', () => {
    expect(() => validateBuildEnv({ ...core, AGENT_LIVE: 'true' }))
      .toThrow('agent: missing AI_GATEWAY_API_KEY or VERCEL=1')
    expect(() => validateBuildEnv({ ...core, AGENT_LIVE: 'true', VERCEL: '1' })).not.toThrow()
    expect(() => validateBuildEnv({ ...core, AGENT_LIVE: 'true', AI_GATEWAY_API_KEY: 'ai-key' })).not.toThrow()
  })

  it('returns a named Stripe runtime failure', () => {
    expect(() => getStripeSecretKey({})).toThrow('booking: missing STRIPE_SECRET_KEY')
  })
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
pnpm --filter web test -- env.test
```

Expected: FAIL because `@/lib/env` does not exist.

- [ ] **Step 3: Implement the pure validator**

Create `apps/web/lib/env.ts`:

```ts
type Env = NodeJS.ProcessEnv

const value = (env: Env, name: string) => env[name]?.trim() || undefined

function missing(feature: string, requirement: string): never {
  throw new Error(
    `R7 env validation failed for ${feature}: missing ${requirement}. ` +
    'Configure it in the deployment environment before enabling this feature.',
  )
}

function oneOf(env: Env, feature: string, names: string[]): string {
  for (const name of names) {
    const found = value(env, name)
    if (found) return found
  }
  return missing(feature, names.join(' or '))
}

const enabled = (env: Env, name: string) => value(env, name)?.toLowerCase() === 'true'

export function getSupabasePublicEnv(env: Env = process.env) {
  return {
    url: oneOf(env, 'core web', ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']),
    anonKey: oneOf(env, 'core web', ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY']),
  }
}

export function getStripeSecretKey(env: Env = process.env): string {
  return oneOf(env, 'booking', ['STRIPE_SECRET_KEY'])
}

export function validateBuildEnv(env: Env = process.env): void {
  getSupabasePublicEnv(env)
  if (enabled(env, 'BOOKING_LIVE')) {
    oneOf(env, 'booking', ['STRIPE_SECRET_KEY'])
    oneOf(env, 'booking', ['STRIPE_WEBHOOK_SECRET'])
    oneOf(env, 'booking', ['NEXT_PUBLIC_SITE_URL'])
  }
  if (enabled(env, 'AGENT_LIVE') && !value(env, 'AI_GATEWAY_API_KEY') && value(env, 'VERCEL') !== '1') {
    missing('agent', 'AI_GATEWAY_API_KEY or VERCEL=1')
  }
}
```

At the top of `apps/web/next.config.ts`, add:

```ts
import { validateBuildEnv } from './lib/env'

validateBuildEnv()
```

Replace the URL/key lookup in `apps/web/lib/supabase/public.ts` with:

```ts
import { getSupabasePublicEnv } from '@/lib/env'

export function createSupabasePublicClient() {
  const { url, anonKey } = getSupabasePublicEnv()
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

Replace the Stripe key lookup in `getStripeClient()` with:

```ts
const secretKey = getStripeSecretKey()
client = new Stripe(secretKey)
```

and import `getStripeSecretKey` from `@/lib/env`.

- [ ] **Step 4: Verify GREEN and compilation**

Run:

```powershell
pnpm --filter web test -- env.test
pnpm --filter web typecheck
```

Expected: env tests PASS and web typecheck exits 0.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/lib/env.ts apps/web/tests/env.test.ts apps/web/next.config.ts apps/web/lib/supabase/public.ts apps/web/lib/stripe/client.ts
git commit -m "feat(web): validate feature environment at build"
```

---

### Task 2: Fix rendering mode and contain guide/experience secondary modules

**Files:**
- Create: `apps/web/lib/resilience/optional.ts`
- Create: `apps/web/tests/resilience.optional.test.ts`
- Modify: `apps/web/app/[locale]/g/[slug]/page.tsx`
- Modify: `apps/web/app/[locale]/experiences/[slug]/page.tsx`
- Modify: `apps/web/components/kinnso/GuideExperienceLinks.tsx`
- Modify: `apps/web/tests/g.slug.host.test.tsx`
- Modify: `apps/web/tests/experiences.public-detail.host.test.tsx`
- Modify: `apps/web/tests/kinnso.guide-experience-links.test.tsx`

**Interfaces:**
- Produces: `optionalQuery<T>(moduleName, load, fallback): Promise<T>`.
- Produces: `optionalValue<T>(moduleName, build, fallback): T`.
- Both log only `{ module, errorName }`, never an exception message/value.
- Both route modules export `dynamic = 'force-dynamic'` and no longer export `generateStaticParams`.

- [ ] **Step 1: Write the containment-helper RED tests**

Create `apps/web/tests/resilience.optional.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { optionalQuery, optionalValue } from '@/lib/resilience/optional'

afterEach(() => vi.restoreAllMocks())

describe('optional module containment', () => {
  it('returns the async fallback and logs only a safe error name', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(optionalQuery('experience-availability', async () => {
      throw new Error('secret database detail')
    }, [])).resolves.toEqual([])
    expect(log).toHaveBeenCalledWith('optional-module-failed', {
      module: 'experience-availability', errorName: 'Error',
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret database detail')
  })

  it('returns the sync fallback when JSON-LD construction throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(optionalValue('guide-jsonld', () => { throw new TypeError('bad') }, [])).toEqual([])
  })
})
```

- [ ] **Step 2: Extend route host tests before production code**

In `g.slug.host.test.tsx`, hoist/reset `getGuideBySlugMock` and `createSupabaseServerClientMock`, then add:

```ts
it('exports request rendering and no static param generator', async () => {
  const route = await import('@/app/[locale]/g/[slug]/page')
  expect(route.dynamic).toBe('force-dynamic')
  expect((route as Record<string, unknown>).generateStaticParams).toBeUndefined()
})

it('notFounds an unknown guide slug', async () => {
  getGuideBySlugMock.mockResolvedValueOnce(null)
  const route = await import('@/app/[locale]/g/[slug]/page')
  await expect(route.default({ params: Promise.resolve({ locale: 'en', slug: 'missing' }) }))
    .rejects.toThrow('NEXT_NOT_FOUND')
})

it('still renders primary guide content when all secondary queries fail', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  createSupabaseServerClientMock.mockRejectedValueOnce(new Error('auth unavailable'))
  getGuideRatingAggregateMock.mockRejectedValueOnce(new Error('rating unavailable'))
  listPublishedReviewsForGuideMock.mockRejectedValueOnce(new Error('reviews unavailable'))
  const route = await import('@/app/[locale]/g/[slug]/page')
  render(await route.default({ params: Promise.resolve({ locale: 'en', slug: 'kyoto-tea' }) }))
  expect(screen.getByRole('heading', { level: 1, name: 'Kyoto Tea Houses' })).toBeTruthy()
  expect(screen.getByText('No reviews yet.')).toBeTruthy()
})
```

In `experiences.public-detail.host.test.tsx`, reset each mock to its normal default in `beforeEach`, then add equivalent rendering-mode and all-secondary-fail tests. The failure test must reject availability, auth, rating, and reviews, then assert the experience heading and `en.booking.noAvailability` still render.

In `kinnso.guide-experience-links.test.tsx`, add:

```ts
it('renders nothing when the cross-link query rejects', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  getExperiencesForCityMock.mockRejectedValueOnce(new Error('cross-link unavailable'))
  const jsx = await GuideExperienceLinks({ locale: 'en', city: 'Kyoto', guideSlug: 'kyoto-tea', t: en.article })
  const { container } = render(jsx)
  expect(container.innerHTML).toBe('')
})
```

- [ ] **Step 3: Run the focused tests and verify RED**

```powershell
pnpm --filter web test -- resilience.optional g.slug.host experiences.public-detail.host kinnso.guide-experience-links
```

Expected: FAIL for the missing helper, missing `dynamic` exports, present `generateStaticParams`, and rejected secondary promises.

- [ ] **Step 4: Implement the shared helper**

Create `apps/web/lib/resilience/optional.ts`:

```ts
const errorName = (error: unknown) => error instanceof Error ? error.name : 'UnknownError'

function record(module: string, error: unknown) {
  console.error('optional-module-failed', { module, errorName: errorName(error) })
}

export async function optionalQuery<T>(
  module: string,
  load: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try { return await load() } catch (error) { record(module, error); return fallback }
}

export function optionalValue<T>(module: string, build: () => T, fallback: T): T {
  try { return build() } catch (error) { record(module, error); return fallback }
}
```

- [ ] **Step 5: Make guide secondary state independent**

In `apps/web/app/[locale]/g/[slug]/page.tsx` remove `generateStaticParams`, add:

```ts
export const dynamic = 'force-dynamic'
```

Import `createSupabasePublicClient`, `optionalQuery`, and `optionalValue`. Replace the current server-client/`Promise.all` block with:

```ts
const viewer = await optionalQuery('guide-viewer', async () => {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isSaved = user
    ? await optionalQuery('guide-save-state', () => isGuideSaved(supabase, guide.id, user.id), false)
    : false
  return { user, isSaved }
}, { user: null, isSaved: false })

const [rating, reviews] = await Promise.all([
  optionalQuery('guide-rating', () => getGuideRatingAggregate(createSupabasePublicClient(), guide.id), null),
  optionalQuery('guide-reviews', () => listPublishedReviewsForGuide(createSupabasePublicClient(), guide.id), []),
])
```

Replace `user`/`isSaved` JSX references with `viewer.user`/`viewer.isSaved`. Build JSON-LD as:

```ts
const ld = optionalValue('guide-jsonld', () => [
  articleJsonLd({
    headline: guide.title,
    description: guide.summary ?? `${guide.city} guide by ${authorName}`,
    url: canonical,
    images: guide.cover ? [guide.cover] : [],
    publishedAt: guide.publishedAt,
    modifiedAt: null,
    authorName,
    locale: htmlLang(locale as Locale),
    rating: rating ?? undefined,
  }),
  breadcrumbJsonLd([
    { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
    { name: messages.seo.explore.title, url: `${SITE_URL}/${locale}/explore` },
    { name: guide.title, url: canonical },
  ]),
], [])
```

- [ ] **Step 6: Make experience secondary state independent**

Remove `generateStaticParams`, add `export const dynamic = 'force-dynamic'`, and replace the secondary loads with:

```ts
const availability = await optionalQuery(
  'experience-availability',
  () => listPublicAvailability(experience.id),
  [],
)
const viewer = await optionalQuery('experience-viewer', async () => {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isSaved = user
    ? await optionalQuery('experience-save-state', () => isExperienceSaved(supabase, experience.id, user.id), false)
    : false
  return { user, isSaved }
}, { user: null, isSaved: false })
const [rating, reviews] = await Promise.all([
  optionalQuery('experience-rating', () => getExperienceRatingAggregate(createSupabasePublicClient(), experience.id), null),
  optionalQuery('experience-reviews', () => listPublishedReviewsForExperience(createSupabasePublicClient(), experience.id), []),
])
```

Use `viewer.user` and `viewer.isSaved` in `ExperiencePublicView` props. Wrap the full JSON-LD array in `optionalValue('experience-jsonld', () => [...], [])`.

In `GuideExperienceLinks`, wrap `getExperiencesForCity(city)` with `optionalQuery('guide-experience-links', ..., [])`.

- [ ] **Step 7: Verify GREEN and commit**

```powershell
pnpm --filter web test -- resilience.optional g.slug.host experiences.public-detail.host kinnso.guide-experience-links
pnpm --filter web typecheck
git add apps/web/lib/resilience/optional.ts apps/web/tests/resilience.optional.test.ts apps/web/app/[locale]/g/[slug]/page.tsx apps/web/app/[locale]/experiences/[slug]/page.tsx apps/web/components/kinnso/GuideExperienceLinks.tsx apps/web/tests/g.slug.host.test.tsx apps/web/tests/experiences.public-detail.host.test.tsx apps/web/tests/kinnso.guide-experience-links.test.tsx
git commit -m "fix(web): contain guide and experience route failures"
```

Expected: focused tests and typecheck PASS.

---

### Task 3: Add localized segment recovery boundaries

**Files:**
- Create: `apps/web/components/kinnso/DetailRouteError.tsx`
- Create: `apps/web/app/[locale]/g/[slug]/error.tsx`
- Create: `apps/web/app/[locale]/experiences/[slug]/error.tsx`
- Create: `apps/web/tests/detail-route-error.test.tsx`
- Modify: all seven `apps/web/lib/i18n/messages/*.ts`

**Interfaces:**
- Adds `Messages['detailError']` with `title`, `body`, `retry`, and `explore`.
- `DetailRouteError({ error, reset })` derives locale from `useParams()` and links to `/{locale}/explore`.

- [ ] **Step 1: Add failing boundary and parity tests**

Create `apps/web/tests/detail-route-error.test.tsx` with mocked `useParams()` returning `{ locale: 'zh-hk' }` and a mocked `getDictionary()` returning the real zh-hk dictionary. Render `DetailRouteError`, assert the zh-hk title, the retry button calls `reset`, and the Explore link is `/zh-hk/explore`.

Run:

```powershell
pnpm --filter web test -- detail-route-error i18n.locale-parity
```

Expected: FAIL because the component and `detailError` group do not exist.

- [ ] **Step 2: Add the exact locale copy**

Add this typed group beside the other top-level shared groups in every locale module:

```ts
detailError: { title: string; body: string; retry: string; explore: string }
```

Use these exact values:

```ts
// en
detailError: { title: "We couldn't load this page", body: 'A temporary problem interrupted loading. Try again, or keep exploring.', retry: 'Try again', explore: 'Back to Explore' }
// zh-hk
detailError: { title: '暫時未能載入此頁面', body: '載入時遇到暫時問題。請再試一次，或繼續探索。', retry: '再試一次', explore: '返回探索' }
// zh-tw
detailError: { title: '暫時無法載入此頁面', body: '載入時發生暫時性問題。請再試一次，或繼續探索。', retry: '再試一次', explore: '返回探索' }
// ja
detailError: { title: 'このページを読み込めませんでした', body: '一時的な問題が発生しました。もう一度試すか、探索を続けてください。', retry: 'もう一度試す', explore: '探索に戻る' }
// ko
detailError: { title: '페이지를 불러올 수 없습니다', body: '일시적인 문제가 발생했습니다. 다시 시도하거나 계속 둘러보세요.', retry: '다시 시도', explore: '탐색으로 돌아가기' }
// th
detailError: { title: 'ไม่สามารถโหลดหน้านี้ได้', body: 'เกิดปัญหาชั่วคราวระหว่างการโหลด โปรดลองอีกครั้งหรือสำรวจต่อ', retry: 'ลองอีกครั้ง', explore: 'กลับไปหน้าสำรวจ' }
// zh-cn
detailError: { title: '暂时无法加载此页面', body: '加载时遇到临时问题。请重试，或继续探索。', retry: '重试', explore: '返回探索' }
```

- [ ] **Step 3: Implement the shared client boundary and wrappers**

`DetailRouteError.tsx` must use English immediately, load the resolved dictionary in an effect with an active/unmount guard, log only `error.digest`, render branded KINNSO classes, call `reset`, and link to `/${locale}/explore`.

Each segment `error.tsx` is exactly:

```tsx
'use client'
export { DetailRouteError as default } from '@/components/kinnso/DetailRouteError'
```

- [ ] **Step 4: Verify and commit**

```powershell
pnpm --filter web test -- detail-route-error i18n.locale-parity
pnpm --filter web typecheck
git add apps/web/components/kinnso/DetailRouteError.tsx apps/web/app/[locale]/g/[slug]/error.tsx apps/web/app/[locale]/experiences/[slug]/error.tsx apps/web/tests/detail-route-error.test.tsx apps/web/lib/i18n/messages
git commit -m "feat(web): add localized detail route recovery"
```

---

### Task 4: Add deterministic PR smoke-funnel coverage

**Files:**
- Modify: `supabase/seed.sql`
- Create: `apps/e2e/specs/funnel-smoke.spec.ts`
- Modify: `apps/e2e/fixtures.ts`
- Modify: `apps/e2e/specs/notfound.spec.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Local fixture guide: `/en/g/r7-smoke-tokyo-guide`.
- Local fixture experience: `/en/experiences/r7-smoke-tokyo-experience`.
- `FIXTURES.notFound` adds `/en/g/r7-missing-guide` and `/en/experiences/r7-missing-experience`.
- Checkout creation is conditional on `process.env.BOOKING_LIVE === 'true'`.

- [ ] **Step 1: Write the Playwright journey first**

Create `funnel-smoke.spec.ts` so it opens `/en`, gathers unique visible `/en/g/` links from the featured section, visits them until it finds one with a guide-attributed `/en/experiences/` link, asserts the guide H1 and `/en/c/` creator link, follows the experience link, asserts the experience H1 and a `HKD|USD|SGD|JPY|KRW|THB|TWD|CNY` price string. When `BOOKING_LIVE=true`, fill the Email field, click Book now, and assert navigation to `https://checkout.stripe.com/`; do not complete payment.

Add both unknown slugs to `FIXTURES.notFound` and keep `notfound.spec.ts` status assertions at 404.

- [ ] **Step 2: Verify RED against the local stack**

Run the existing local Supabase/web startup documented by `.github/workflows/ci.yml`, then:

```powershell
$env:E2E_BASE_URL='http://localhost:3000'
$env:BOOKING_LIVE='false'
pnpm --filter @kinnso/e2e e2e funnel-smoke notfound
Remove-Item Env:E2E_BASE_URL
Remove-Item Env:BOOKING_LIVE
```

Expected: funnel smoke FAIL because local seed has no featured guide/experience pair; unknown-slug cases pass after Task 2.

- [ ] **Step 3: Add minimal local-only SQL fixtures**

Append idempotent rows to `supabase/seed.sql`: two non-login `auth.users` UUIDs ending `701`/`702`; activate creator `701`; insert merchant profile UUID `705`; guide UUID `703` with slug `r7-smoke-tokyo-guide`, city `Tokyo`, published status/date; experience UUID `704` with slug `r7-smoke-tokyo-experience`, city `Tokyo`, `JPY 12000`, published status/date; and availability UUID `706`, `current_date + 30`, capacity 8, booked count 0, open status. Use `ON CONFLICT` on each stable primary/slug key. The auth rows use empty `encrypted_password` because the browser smoke never signs in.

- [ ] **Step 4: Wire PR CI**

Replace CI's onboarding-only Playwright step with:

```yaml
      - name: Run PR smoke journeys
        env:
          E2E_BASE_URL: http://localhost:3000
          BOOKING_LIVE: 'false'
        run: pnpm --filter @kinnso/e2e e2e creator-onboarding funnel-smoke notfound
```

- [ ] **Step 5: Reset, verify GREEN, and commit**

```powershell
pnpm supabase db reset
pnpm --filter @kinnso/e2e typecheck
$env:E2E_BASE_URL='http://localhost:3000'
$env:BOOKING_LIVE='false'
pnpm --filter @kinnso/e2e e2e funnel-smoke notfound
Remove-Item Env:E2E_BASE_URL
Remove-Item Env:BOOKING_LIVE
git add supabase/seed.sql apps/e2e/specs/funnel-smoke.spec.ts apps/e2e/fixtures.ts apps/e2e/specs/notfound.spec.ts .github/workflows/ci.yml
git commit -m "test(e2e): add guide to experience smoke funnel"
```

---

### Task 5: Add sitemap crawler and nightly production synthetic

**Files:**
- Create: `scripts/crawl-sitemap.ts`
- Create: `apps/web/tests/crawl-sitemap.test.ts`
- Create: `.github/workflows/nightly-funnel.yml`

**Interfaces:**
- `crawlSitemap({ baseUrl, fetchImpl?, concurrency? }): Promise<{ checked: number; failures: Array<{ url: string; status?: number; error?: string }> }>`.
- CLI default: `BASE_URL ?? 'https://remix-kinnso-web.vercel.app'`.
- Any network error or final status `>= 400` sets a non-zero exit.

- [ ] **Step 1: Write crawler RED tests**

Test a flat `<urlset>`, an indexed `/sitemap/0.xml`, de-duplication, `redirect: 'follow'`, a final 500, and a rejected fetch. Assert only sitemap-listed page URLs are crawled and failures contain URL/status or `NetworkError`, never response bodies.

Run:

```powershell
pnpm --filter web test -- crawl-sitemap
```

Expected: FAIL because the script module does not exist.

- [ ] **Step 2: Implement the dependency-free crawler**

Use native Node 22 `fetch`, a `<loc>` extraction regex, recursive `.xml` sitemap traversal, a `Set<string>` for URLs, and a worker-pool cursor capped at default concurrency 8. Export `crawlSitemap`; guard CLI execution with `pathToFileURL(process.argv[1]).href === import.meta.url`; print `Checked N sitemap URLs`; print one line per failure; set `process.exitCode = 1` when failures exist.

- [ ] **Step 3: Add the exact nightly workflow**

Create `.github/workflows/nightly-funnel.yml`:

```yaml
name: Nightly funnel synthetic
on:
  schedule:
    - cron: '15 21 * * *'
  workflow_dispatch:
permissions:
  contents: read
jobs:
  production-funnel:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @kinnso/e2e exec playwright install --with-deps chromium
      - name: Production guide-to-experience smoke
        env:
          E2E_BASE_URL: https://remix-kinnso-web.vercel.app
          BOOKING_LIVE: 'false'
        run: pnpm --filter @kinnso/e2e e2e funnel-smoke notfound
      - name: Crawl every sitemap URL
        env:
          BASE_URL: https://remix-kinnso-web.vercel.app
        run: node scripts/crawl-sitemap.ts
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: nightly-funnel-artifacts
          path: |
            apps/e2e/test-results/
            apps/e2e/playwright-report/
```

- [ ] **Step 4: Verify and commit**

```powershell
pnpm --filter web test -- crawl-sitemap
pnpm --filter web typecheck
$env:BASE_URL='https://remix-kinnso-web.vercel.app'
node scripts/crawl-sitemap.ts
Remove-Item Env:BASE_URL
git add scripts/crawl-sitemap.ts apps/web/tests/crawl-sitemap.test.ts .github/workflows/nightly-funnel.yml
git commit -m "ci: add nightly funnel and sitemap synthetic"
```

Before the route fix is deployed, the production crawl is expected to expose the known 500s. Record that as RED evidence; rerun against the PR preview after deployment for GREEN.

---

### Task 6: Full verification, preview proof, and squash PR

**Files:** Verify only; no new source file is expected.

- [ ] **Step 1: Run the complete local quality gate**

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter web test -- i18n.locale-parity
pnpm --filter @kinnso/e2e typecheck
```

Expected: all commands exit 0. If local `.env.test` is absent, start local Supabase and export its env exactly as `.github/workflows/ci.yml` does before rerunning; do not classify a missing local test env as a product regression.

- [ ] **Step 2: Run the production-safe baseline probes**

```powershell
curl.exe -sS -o NUL -w "%{http_code}" https://remix-kinnso-web.vercel.app/en/g/busan-jagalchi-seafood-market
curl.exe -sS -o NUL -w "%{http_code}" https://remix-kinnso-web.vercel.app/en/experiences/tokyo-after-hours-izakaya-crawl
curl.exe -sS -o NUL -w "%{http_code}" https://remix-kinnso-web.vercel.app/en/g/r7-missing-guide
```

Before merge, record the old production result as `500`, `500`, `404`. Do not POST agent messages or create Checkout Sessions.

- [ ] **Step 3: Review exact scope and secrets**

```powershell
git diff --check main...HEAD
git diff --name-only main...HEAD
rg -n "sk_(live|test)_|whsec_|service_role|github_pat_|gho_" docs apps scripts .github supabase
git status --short --branch
```

Expected changed scope: approved design/plan, env/resilience helpers and tests, the two route pages, localized boundaries/messages, local seed fixtures, Playwright fixtures/spec, crawler, and workflows only. Secret scan must show no newly added credential value.

- [ ] **Step 4: Push and open one ready PR**

```powershell
git push -u origin codex/r7-1-funnel-reliability
gh pr create --base main --head codex/r7-1-funnel-reliability --title "Phase R7.1 — Funnel reliability" --body-file .superpowers/sdd/r7-1-pr-body.md
```

The PR body must state: root cause category `code / rendering-mode drift`; Vercel digest `DYNAMIC_SERVER_USAGE`; introduction commit `90ac420`; static `generateStaticParams() => []` plus cookie-bound `cookies()` conflict; migration/env/stale-deploy drift ruled out; secondary fallbacks; test evidence; no production DB writes; `BOOKING_LIVE=false` prevented Checkout creation.

- [ ] **Step 5: Verify the Vercel preview**

After Vercel reports success, obtain the preview deployment URL from GitHub's deployment API and run:

```powershell
$deploymentId = gh api "repos/YNWAforever/Remix-Kinnso/deployments?ref=codex/r7-1-funnel-reliability&environment=Preview" --jq '.[0].id'
$previewUrl = gh api "repos/YNWAforever/Remix-Kinnso/deployments/$deploymentId/statuses" --jq 'map(select(.state=="success")) | .[0].environment_url'
if (-not $previewUrl) { throw 'No successful Vercel preview deployment URL found' }
$env:E2E_BASE_URL=$previewUrl
$env:BOOKING_LIVE='false'
pnpm --filter @kinnso/e2e e2e funnel-smoke notfound
$env:BASE_URL=$previewUrl
node scripts/crawl-sitemap.ts
Remove-Item Env:E2E_BASE_URL
Remove-Item Env:BOOKING_LIVE
Remove-Item Env:BASE_URL
```

Expected: smoke and every preview sitemap URL PASS; published detail routes return 200 and missing slugs 404.

- [ ] **Step 6: Squash merge and verify production**

Wait until CI quality, PR E2E, and Vercel checks are green, then:

```powershell
gh pr merge --squash --delete-branch
git switch main
git pull --ff-only
$env:E2E_BASE_URL='https://remix-kinnso-web.vercel.app'
$env:BOOKING_LIVE='false'
pnpm --filter @kinnso/e2e e2e funnel-smoke notfound
$env:BASE_URL='https://remix-kinnso-web.vercel.app'
node scripts/crawl-sitemap.ts
Remove-Item Env:E2E_BASE_URL
Remove-Item Env:BOOKING_LIVE
Remove-Item Env:BASE_URL
```

Expected: PR is `MERGED`, production smoke/crawl are green, every currently sitemap-published guide/experience returns 200, and unknown slugs return branded 404.
