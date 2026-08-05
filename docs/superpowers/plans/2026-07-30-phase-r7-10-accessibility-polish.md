# Phase R7.10 Accessibility and Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a blocking, deterministic accessibility contract for KINNSO's nine primary public routes, including keyboard-safe navigation and booking entry, meaningful entity media, 380px overflow protection, and layout-shift smoke coverage.

**Architecture:** A typed route manifest in `apps/e2e` drives local axe, mobile, layout-stability, and deployed smoke checks. Product behavior is hardened in the shared `Navbar` and `EntityMedia` seams, while a narrow exception ledger and syntax-aware source contract prevent accessibility regressions from being hidden.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Playwright, `@axe-core/playwright`, Radix Dialog, pnpm, GitHub Actions, local Supabase, Stripe test mode.

## Global Constraints

- Implementation starts only after R7.9 PR #96 is squash-merged; rebase this branch onto that resulting `origin/main` commit before code work.
- The required routes are exactly `/en`, `/en/explore`, `/en/g/r7-smoke-tokyo-guide`, `/en/experiences/r7-smoke-tokyo-experience`, `/en/articles/dining/ramen-guide`, `/en/for-creators`, `/en/for-merchants`, `/en/creators`, and `/en/merchants`.
- Every route must have zero unapproved axe violations with impact `critical` or `serious`.
- Axe exceptions are empty by default and may only match one route, one rule, and one exact selector, with reason, owner, and review condition.
- Both `BOOKING_LIVE=false` interest capture and `BOOKING_LIVE=true` Stripe test-checkout entry must work by keyboard.
- Booking tests may write only to the local Supabase fixture database and may use only a Stripe key beginning with `sk_test_`; they stop before payment.
- Real entity imagery uses its entity title as alternative text; `MediaPlaceholder` remains decorative.
- Every `next/image` and `EntityMedia` usage must have an explicit, non-empty `sizes` value.
- Every route must have no document-level horizontal overflow at 380px.
- Unexpected CLS, excluding `hadRecentInput`, must be at most `0.1`.
- Preview checks reuse the route manifest but do not submit forms, start checkout, or mutate data.
- Lighthouse remains advisory.
- Preserve all R1–R6 §7 conventions, seven-locale parity for changed visible copy, anonymous/RLS-safe reads, and one squash-merged PR for R7.10.

## Preflight Lineage

Before Task 1:

```bash
git fetch origin
git branch --show-current
git log --oneline --decorate -5 origin/main
git rebase --onto origin/main codex/r7-9-explore-usability codex/r7-10-accessibility-polish
pnpm install --frozen-lockfile
pnpm typecheck
```

Expected:

- Current branch is `codex/r7-10-accessibility-polish`.
- `origin/main` contains the squash-merged R7.9 change.
- The rebase moves only the R7.10 design commit onto `origin/main`.
- Typecheck reports all tasks successful.

If PR #96 is not present in `origin/main`, stop. Do not implement against the
pull-request ancestry and do not merge past its external check without the
user's explicit permission.

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/e2e/r7-10-routes.ts` | Canonical nine-route manifest and readiness contract |
| `apps/e2e/r7-10-accessibility.ts` | Axe filtering/formatting, readiness, keyboard traversal, overflow, and CLS helpers |
| `apps/e2e/r7-10-local.ts` | Loopback-only local E2E environment validation |
| `apps/e2e/playwright.r7-10.config.ts` | One isolated Booking OFF or ON web-server launch per invocation |
| `apps/e2e/specs/r7-10-contract.spec.ts` | Pure manifest and exception-filter tests |
| `apps/e2e/specs/r7-10-accessibility.spec.ts` | Axe, header keyboard, 380px overflow, and CLS checks |
| `apps/e2e/specs/r7-10-booking.spec.ts` | Keyboard journeys for both booking states |
| `apps/e2e/specs/r7-10-preview-smoke.spec.ts` | Non-mutating deployed route/landmark smoke |
| `apps/web/components/kinnso/media/EntityMedia.tsx` | Title-derived image alt text and runtime fallback |
| `apps/web/components/kinnso/media/MediaPlaceholder.tsx` | Decorative fallback contract |
| `apps/web/components/kinnso/Navbar.tsx` | Radix-backed mobile menu focus containment/restoration |
| `apps/web/tests/kinnso.EntityMedia.test.tsx` | Rendered real/fallback media semantics |
| `apps/web/tests/media.source-contract.test.ts` | Repository-wide JSX media contract |
| `apps/web/tests/kinnso.Navbar.test.tsx` | Mobile menu keyboard/focus behavior |
| `.github/workflows/ci.yml` | Blocking local OFF/ON R7.10 runs and failure artifacts |
| `.github/workflows/verify.yml` | Manifest-driven preview smoke; Lighthouse remains advisory |

---

### Task 1: Canonical route and axe contracts

**Files:**
- Modify: `apps/e2e/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/e2e/r7-10-routes.ts`
- Create: `apps/e2e/r7-10-accessibility.ts`
- Create: `apps/e2e/specs/r7-10-contract.spec.ts`
- Modify: `apps/e2e/tsconfig.json`

**Interfaces:**
- Produces: `R710RouteId`, `R710Route`, `R7_10_ROUTES`
- Produces: `AxeException`, `AXE_EXCEPTIONS`, `unapprovedViolations()`, `formatAxeViolations()`
- Consumes later: every R7.10 browser spec and the preview smoke spec

- [ ] **Step 1: Add the direct axe integration dependency**

Run:

```bash
pnpm --filter @kinnso/e2e add -D @axe-core/playwright
```

Expected: `apps/e2e/package.json` directly lists `@axe-core/playwright` and the
lockfile changes without unrelated upgrades.

- [ ] **Step 2: Write the failing manifest and exception tests**

Create tests that assert the exact nine paths, unique IDs and paths, a level-one
heading readiness contract for every route, and an empty exception ledger.
Also construct a synthetic serious violation with two nodes and prove that
`unapprovedViolations()` removes only the node whose route, rule, and exact
`target.join(' > ')` match an exception.

The public contract must be:

```ts
export type R710RouteId =
  | 'home'
  | 'explore'
  | 'guide'
  | 'experience'
  | 'article'
  | 'creator-landing'
  | 'merchant-landing'
  | 'creator-directory'
  | 'merchant-directory'

export interface R710Route {
  id: R710RouteId
  path: string
  ready: { role: 'heading'; level: 1 }
  mobileHeaderJourney?: boolean
}

export interface AxeException {
  routeId: R710RouteId
  ruleId: string
  target: string
  reason: string
  owner: string
  reviewWhen: string
}
```

- [ ] **Step 3: Run the contract test and verify RED**

Run:

```bash
pnpm --filter @kinnso/e2e exec playwright test specs/r7-10-contract.spec.ts
```

Expected: FAIL because `r7-10-routes.ts` and `r7-10-accessibility.ts` do not
exist.

- [ ] **Step 4: Implement the route manifest**

Use these exact entries:

```ts
export const R7_10_ROUTES = [
  { id: 'home', path: '/en', ready: { role: 'heading', level: 1 }, mobileHeaderJourney: true },
  { id: 'explore', path: '/en/explore', ready: { role: 'heading', level: 1 } },
  { id: 'guide', path: '/en/g/r7-smoke-tokyo-guide', ready: { role: 'heading', level: 1 }, mobileHeaderJourney: true },
  { id: 'experience', path: '/en/experiences/r7-smoke-tokyo-experience', ready: { role: 'heading', level: 1 } },
  { id: 'article', path: '/en/articles/dining/ramen-guide', ready: { role: 'heading', level: 1 } },
  { id: 'creator-landing', path: '/en/for-creators', ready: { role: 'heading', level: 1 } },
  { id: 'merchant-landing', path: '/en/for-merchants', ready: { role: 'heading', level: 1 } },
  { id: 'creator-directory', path: '/en/creators', ready: { role: 'heading', level: 1 } },
  { id: 'merchant-directory', path: '/en/merchants', ready: { role: 'heading', level: 1 } },
] as const satisfies readonly R710Route[]
```

Set:

```ts
export const AXE_EXCEPTIONS: readonly AxeException[] = []
```

Filtering must retain unmatched nodes inside a partially excepted violation and
remove the violation only when no unapproved nodes remain. Never use
`AxeBuilder.exclude()` for the exception mechanism because it is broader than
rule-and-selector matching.

- [ ] **Step 5: Run contract test and typecheck**

Run:

```bash
pnpm --filter @kinnso/e2e exec playwright test specs/r7-10-contract.spec.ts
pnpm --filter @kinnso/e2e typecheck
```

Expected: PASS and no implicit `any`.

- [ ] **Step 6: Commit**

```bash
git add apps/e2e/package.json pnpm-lock.yaml apps/e2e/tsconfig.json apps/e2e/r7-10-routes.ts apps/e2e/r7-10-accessibility.ts apps/e2e/specs/r7-10-contract.spec.ts
git commit -m "test(e2e): define R7.10 accessibility contract"
```

---

### Task 2: Enforce entity-media semantics and stable fallback geometry

**Files:**
- Modify: `apps/web/components/kinnso/media/EntityMedia.tsx`
- Verify/Modify: `apps/web/components/kinnso/media/MediaPlaceholder.tsx`
- Modify: `apps/web/components/ArticleCard.tsx`
- Modify: `apps/web/components/kinnso/ExperienceCard.tsx`
- Modify: `apps/web/components/kinnso/GuideCard.tsx`
- Modify: `apps/web/components/kinnso/home/Hero.tsx`
- Modify: `apps/web/components/kinnso/pages/CreatorProfileView.tsx`
- Modify: `apps/web/components/kinnso/pages/CreatorsLandingView.tsx`
- Modify: `apps/web/components/kinnso/pages/DestinationsIndexView.tsx`
- Modify: `apps/web/components/kinnso/pages/ExperiencePublicView.tsx`
- Modify: `apps/web/components/kinnso/pages/HomeView.tsx`
- Modify: `apps/web/components/kinnso/pages/MerchantsDirectoryView.tsx`
- Modify: `apps/web/components/kinnso/pages/MyGuidesView.tsx`
- Modify: `apps/web/components/kinnso/pages/PublicMerchantProfileView.tsx`
- Modify: `apps/web/app/[locale]/articles/[category]/[url]/page.tsx`
- Modify: `apps/web/app/[locale]/g/[slug]/page.tsx`
- Modify: `apps/web/components/kinnso/CityDetailDrawer.tsx`
- Modify: `apps/web/components/kinnso/GuideForm.tsx`
- Modify: `apps/web/components/kinnso/ShareDnaDialog.tsx`
- Modify: `apps/web/tests/kinnso.EntityMedia.test.tsx`
- Create: `apps/web/tests/media.source-contract.test.ts`

**Interfaces:**
- Changes: `EntityMediaProps` removes `alt`; `title` becomes the real image's accessible name
- Produces: runtime `onError` fallback without changing the outer reserved box
- Produces: syntax-aware repository guard for `EntityMedia`, `next/image`, and literal empty native-image alt text

- [ ] **Step 1: Write failing rendered and source-contract tests**

Add assertions that:

- An approved image is named by `title`.
- A failed approved image switches to `[data-media-placeholder="true"]`.
- The placeholder has `aria-hidden="true"` and no image role.
- Every `EntityMedia` JSX node has `title` and `sizes`, and has no `alt` prop.
- Every JSX identifier imported from `next/image` has a `sizes` prop.
- `sizes=""` and an empty string expression fail.
- A native `<img alt="">` is allowed only when the same element has
  `aria-hidden="true"`.

Implement the source guard with the TypeScript compiler API
(`ts.createSourceFile` and `ts.forEachChild`) so multiline JSX is parsed rather
than matched by a regular expression.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
pnpm --filter web test -- tests/kinnso.EntityMedia.test.tsx tests/media.source-contract.test.ts
```

Expected: FAIL on the existing `alt` prop contract and literal empty alt call
sites.

- [ ] **Step 3: Make `EntityMedia` title-driven and failure-safe**

Use this state model:

```tsx
'use client'

import { useState } from 'react'

export interface EntityMediaProps {
  src: string | null | undefined
  title: string
  location?: string | null
  sizes: string
  priority?: boolean
  className?: string
  imageClassName?: string
}

const [failedSrc, setFailedSrc] = useState<string | null>(null)
const approved = isApprovedEntityMediaUrl(src)
const showImage = approved && failedSrc !== src
```

When `showImage` is true, render `Image` with `alt={title}`,
`sizes={sizes}`, and `onError={() => setFailedSrc(src ?? null)}`. Otherwise
render `MediaPlaceholder`. Keep the existing outer `relative overflow-hidden`
box unchanged so fallback does not alter geometry.

- [ ] **Step 4: Update all `EntityMedia` callers**

Remove every `alt` prop listed in the Files section. Keep or strengthen the
existing non-empty `title` expression:

- Article fallback title stays `a.title ?? a.url`.
- Article detail fallback title stays `a.translation.title ?? url`.
- Creator and merchant portrait/logo titles use their displayed names.
- Guide, experience, destination, and article cards use their displayed titles.

For raw real images with literal empty alt, make these exact substitutions:

```tsx
// CityDetailDrawer.tsx
alt={p.caption}

// GuideForm.tsx
alt={title || t.coverLabel}

// ShareDnaDialog.tsx
alt={creator.name}
```

`MediaPlaceholder` must retain both `aria-hidden="true"` and
`data-media-placeholder="true"`.

- [ ] **Step 5: Run focused tests and source scan**

Run:

```bash
pnpm --filter web test -- tests/kinnso.EntityMedia.test.tsx tests/media.source-contract.test.ts
pnpm --filter web typecheck
```

Expected: PASS. The source-contract failure message names the exact file and
line for any future missing `title`, missing/empty `sizes`, forbidden
`EntityMedia alt`, or literal empty native alt.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components apps/web/app apps/web/tests/kinnso.EntityMedia.test.tsx apps/web/tests/media.source-contract.test.ts
git commit -m "fix(web): enforce accessible stable entity media"
```

---

### Task 3: Harden the shared mobile navigation

**Files:**
- Modify: `apps/web/components/kinnso/Navbar.tsx`
- Modify: `apps/web/tests/kinnso.Navbar.test.tsx`

**Interfaces:**
- Preserves: all existing role-dependent links and CTA hrefs
- Produces: modal mobile navigation with focus containment, Escape close, and trigger focus restoration
- Consumes: existing `Dialog`, `DialogTrigger`, `DialogContent`, and `DialogTitle` primitives from `@/components/ui/dialog`

- [ ] **Step 1: Write failing keyboard/focus tests**

Extend the Navbar test to assert:

```ts
const trigger = screen.getByRole('button', { name: en.nav.menuToggle })
fireEvent.click(trigger)
expect(screen.getByRole('dialog', { name: en.nav.menuToggle })).toBeTruthy()
fireEvent.keyDown(document, { key: 'Escape' })
await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
await waitFor(() => expect(document.activeElement).toBe(trigger))
```

Also assert the open dialog contains every base and audience link, and that the
dialog closes when one of its links is activated.

- [ ] **Step 2: Run the Navbar test and verify RED**

Run:

```bash
pnpm --filter web test -- tests/kinnso.Navbar.test.tsx
```

Expected: FAIL because the current tray has no dialog, Escape handling, focus
containment, or Radix focus restoration.

- [ ] **Step 3: Replace only the mobile tray with a controlled Radix dialog**

Keep the desktop nav and role/anchor calculations unchanged. Wrap the mobile
trigger in:

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild>
    <button
      type="button"
      aria-label={t.menuToggle}
      aria-expanded={open}
      aria-controls={open ? 'kinnso-mobile-menu' : undefined}
      className="grid h-10 w-10 place-items-center rounded-full text-kinnso-ink transition hover:bg-kinnso-cream2/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange xl:hidden"
    >
      <Menu aria-hidden="true" />
    </button>
  </DialogTrigger>
  <DialogContent
    id="kinnso-mobile-menu"
    className="top-16 bottom-0 left-0 right-0 max-h-[calc(100dvh-4rem)] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-x-0 border-b-0 bg-kinnso-cream p-0 xl:hidden"
  >
    <DialogTitle className="sr-only">{t.menuToggle}</DialogTitle>
    {/* existing tray anchors and account controls */}
  </DialogContent>
</Dialog>
```

Keep `onClick={() => setOpen(false)}` on every mobile link. Radix supplies
Escape handling, focus trapping, background hiding, and trigger restoration.
Do not add new visible or localized copy.

- [ ] **Step 4: Run Navbar, route-parity, and type tests**

Run:

```bash
pnpm --filter web test -- tests/kinnso.Navbar.test.tsx tests/kinnso.route-parity.test.tsx tests/kinnso.SiteChrome.test.tsx
pnpm --filter web typecheck
```

Expected: PASS with all previous role and href assertions preserved.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/Navbar.tsx apps/web/tests/kinnso.Navbar.test.tsx
git commit -m "fix(web): make mobile navigation keyboard safe"
```

---

### Task 4: Add loopback-only Booking OFF and ON journeys

**Files:**
- Create: `apps/e2e/r7-10-local.ts`
- Create: `apps/e2e/playwright.r7-10.config.ts`
- Create: `apps/e2e/specs/r7-10-booking.spec.ts`
- Modify: `apps/e2e/r7-10-accessibility.ts`
- Modify: `apps/e2e/tsconfig.json`

**Interfaces:**
- Produces: `resolveR710LocalConfig(env)` with loopback Supabase/base URL enforcement
- Produces: `tabTo(page, locator, maxTabs?)`
- Consumes: local `apps/web/.env.local`, deterministic experience fixture, `R7_10_BOOKING_STATE=off|on`

- [ ] **Step 1: Write failing local-config and keyboard tests**

The config contract must reject:

- A non-loopback `E2E_BASE_URL`.
- A non-loopback `NEXT_PUBLIC_SUPABASE_URL`.
- Any Booking ON `STRIPE_SECRET_KEY` not beginning with `sk_test_`.
- Missing Booking ON Stripe secret.

The booking spec must use only `page.keyboard` after navigation:

```ts
await tabTo(page, page.getByLabel('Email'))
await page.keyboard.type('r710-accessibility@kinnso.test')
await tabTo(page, page.getByRole('button', { name: /notify me|join/i }))
await page.keyboard.press('Enter')
```

For Booking ON, tab to the date select, choose the first option by keyboard,
tab to Email, type the local-test address, tab to Book now, press Enter, and
wait for `/checkout\.stripe\.com/`. Do not fill payment details.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
pnpm --filter @kinnso/e2e exec playwright test specs/r7-10-booking.spec.ts
```

Expected: FAIL because the local resolver, dedicated config, and `tabTo` helper
do not exist.

- [ ] **Step 3: Implement loopback validation**

Use:

```ts
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])

function requireLoopback(value: string, name: string) {
  const url = new URL(value)
  if (!LOOPBACK.has(url.hostname)) throw new Error(`${name} must be loopback`)
  return value
}
```

Load `apps/web/.env.local` in `playwright.r7-10.config.ts`, choose port `3100`
for OFF and `3101` for ON, set `process.env.R7_10_LOCAL='1'`, and configure one
`webServer`:

```ts
{
  command: `pnpm --filter web exec next dev --hostname 127.0.0.1 --port ${port}`,
  url: baseURL,
  reuseExistingServer: false,
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: local.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
    NEXT_PUBLIC_SITE_URL: baseURL,
    AGENT_LIVE: 'true',
    BOOKING_LIVE: bookingState === 'on' ? 'true' : 'false',
    VERCEL: '1',
  },
}
```

When ON, pass the validated test Stripe secret and webhook secret through the
same `env` object. Select only `r7-10-booking.spec.ts` when ON. When OFF, select
the complete R7.10 local suite plus the existing pre-merge smoke set:

```ts
const offSpecs = [
  'creator-onboarding.spec.ts',
  'funnel-smoke.spec.ts',
  'honesty.spec.ts',
  'notfound.spec.ts',
  'r7-10-contract.spec.ts',
  'r7-10-accessibility.spec.ts',
  'r7-10-booking.spec.ts',
] as const
```

This lets one Playwright-owned OFF server replace the workflow's existing
background web server and prevents two `next dev` processes from sharing a
checkout.

- [ ] **Step 4: Implement bounded keyboard traversal**

`tabTo()` presses Tab up to 60 times, compares `document.activeElement` to the
target element after every press, and throws an error naming the target and
visited accessible elements if it cannot reach it. It must not call
`locator.focus()`.

- [ ] **Step 5: Run Booking OFF**

Run after local Supabase is started and `apps/web/.env.local` is exported:

```bash
R7_10_BOOKING_STATE=off pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts
```

Expected: the deterministic experience renders interest capture, keyboard
submission succeeds, and the server is stopped by Playwright.

- [ ] **Step 6: Run Booking ON**

Run after exporting valid `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
test-mode values into the shell environment:

```bash
R7_10_BOOKING_STATE=on pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts
```

Expected: the keyboard journey reaches hosted Stripe checkout and stops before
payment. No production Supabase URL is accepted.

- [ ] **Step 7: Commit**

```bash
git add apps/e2e/r7-10-local.ts apps/e2e/playwright.r7-10.config.ts apps/e2e/r7-10-accessibility.ts apps/e2e/specs/r7-10-booking.spec.ts apps/e2e/tsconfig.json
git commit -m "test(e2e): cover both booking states by keyboard"
```

---

### Task 5: Add axe, 380px, CLS, header, and deployed smoke coverage

**Files:**
- Modify: `apps/e2e/r7-10-accessibility.ts`
- Create: `apps/e2e/specs/r7-10-accessibility.spec.ts`
- Create: `apps/e2e/specs/r7-10-preview-smoke.spec.ts`

**Interfaces:**
- Consumes: `R7_10_ROUTES`, `AXE_EXCEPTIONS`, `tabTo`
- Produces: `waitForRoute()`, `installLayoutShiftObserver()`, `readCLS()`, `assertNoHorizontalOverflow()`

- [ ] **Step 1: Write the browser contract before helpers**

For every route:

```ts
test(`${route.id}: zero critical or serious axe findings`, async ({ page }) => {
  await waitForRoute(page, route)
  const results = await new AxeBuilder({ page }).analyze()
  const relevant = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  )
  const unapproved = unapprovedViolations(route.id, relevant, AXE_EXCEPTIONS)
  expect(unapproved, formatAxeViolations(route, unapproved)).toEqual([])
})
```

At 380x844, install the CLS observer before `goto`, wait for route readiness,
`document.fonts.ready`, all in-viewport images to complete, and two animation
frames. Assert `document.documentElement.scrollWidth <= window.innerWidth` and
`readCLS() <= 0.1`.

- [ ] **Step 2: Add the official CLS session-window calculation**

Store `{ value, startTime, hadRecentInput }` entries. Exclude recent input.
Compute the largest session window where adjacent entries are less than one
second apart and the window is at most five seconds. Return that maximum, not a
page-lifetime sum.

- [ ] **Step 3: Add desktop and mobile header journeys**

Desktop at 1440px:

- Tab through the header in DOM order.
- Assert focus visibility for each primary link and CTA.
- Activate Explore with Enter and assert `/en/explore`.

Mobile at 380px, on the two manifest entries marked
`mobileHeaderJourney: true`:

- Tab to the menu trigger and open with Enter.
- Assert `aria-expanded="true"` and the named dialog.
- Tab through every primary destination without focus leaving the dialog.
- Press Escape, assert the dialog closes, and assert trigger focus restoration.

- [ ] **Step 4: Add manifest-driven deployed smoke**

`r7-10-preview-smoke.spec.ts` loops over `R7_10_ROUTES`, requires HTTP 200,
waits for the level-one heading, and requires at least one visible `main`
landmark. It must not run axe, click a CTA, submit a form, or alter state.

- [ ] **Step 5: Run the OFF-state suite**

Run:

```bash
R7_10_BOOKING_STATE=off pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts
```

Expected at this stage: route readiness, keyboard, overflow, and CLS checks
execute deterministically. Any critical/serious axe findings fail with rule,
impact, target, and help URL; those findings are the input to Task 6.

- [ ] **Step 6: Commit the executable checks**

```bash
git add apps/e2e/r7-10-accessibility.ts apps/e2e/specs/r7-10-accessibility.spec.ts apps/e2e/specs/r7-10-preview-smoke.spec.ts
git commit -m "test(e2e): enforce R7.10 accessibility and polish"
```

---

### Task 6: Remediate every rendered critical or serious finding

**Files:**
- Modify as identified by exact axe targets:
  - `apps/web/components/kinnso/Navbar.tsx`
  - `apps/web/components/kinnso/pages/HomeView.tsx`
  - `apps/web/components/kinnso/home/Hero.tsx`
  - `apps/web/components/kinnso/pages/ExploreView.tsx`
  - `apps/web/components/kinnso/pages/ExperiencePublicView.tsx`
  - `apps/web/components/kinnso/pages/ForCreatorsView.tsx`
  - `apps/web/components/kinnso/pages/ForMerchantsView.tsx`
  - `apps/web/components/kinnso/pages/CreatorsLandingView.tsx`
  - `apps/web/components/kinnso/pages/MerchantsDirectoryView.tsx`
  - `apps/web/app/[locale]/g/[slug]/page.tsx`
  - `apps/web/app/[locale]/articles/[category]/[url]/page.tsx`
- Modify the nearest existing component test under `apps/web/tests/` for every product fix
- Modify only with explicit approval: `apps/e2e/r7-10-routes.ts` exception ledger

**Interfaces:**
- Consumes: exact route/rule/selector failures from Task 5
- Produces: zero unapproved critical/serious findings; focused regression tests for every product correction

- [ ] **Step 1: Capture the complete failing report**

Run:

```bash
R7_10_BOOKING_STATE=off pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts --reporter=list
```

Group failures by `(ruleId, target)`; do not group merely by route because one
shared component may own several route failures.

- [ ] **Step 2: Apply the rule-specific TDD loop**

For every group:

1. Add a focused Vitest/Testing Library assertion to the owning component test.
2. Run that single test and see it fail.
3. Make the smallest semantic or style correction in the exact owning file.
4. Run the component test.
5. Rerun the failing route's Playwright test.

Use this remediation table:

| Finding family | Required correction |
| --- | --- |
| accessible name/label | Bind a visible label or stable `aria-label`; never use test-only attributes |
| ARIA relationship | Reference an element that exists in the same rendered state |
| heading/landmark | Correct the owning semantic element without adding hidden duplicate headings |
| contrast | Change the shared token/class to meet AA contrast in that rendered state |
| focus | Add a visible `focus-visible` outline with sufficient contrast |
| nested interactive control | Split the controls so neither interactive element contains the other |
| image alternative | Route through the title-driven `EntityMedia` contract |

Do not add an axe exception during this loop.

- [ ] **Step 3: Handle a technically impossible finding only through review**

If and only if the platform makes a product fix impossible, stop and present
the rule, route, selector, trace, attempted fixes, reason, owner, and review
condition. After explicit approval, add exactly one `AxeException` entry.
Never suppress a complete route or call `AxeBuilder.disableRules()`.

- [ ] **Step 4: Prove the route list is green**

Run:

```bash
R7_10_BOOKING_STATE=off pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts
pnpm --filter web test
```

Expected: all nine routes have zero unapproved critical/serious findings and
all component regressions pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web apps/e2e/r7-10-routes.ts
git commit -m "fix(web): clear R7.10 accessibility findings"
```

If the exception ledger remains empty, do not stage it in this commit.

---

### Task 7: Wire blocking CI, preview smoke, and final evidence

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/verify.yml`
- Modify: `apps/web/tests/ci.product-state.test.ts`
- Create: `docs/superpowers/verification/2026-07-30-phase-r7-10-accessibility-polish.md`

**Interfaces:**
- Consumes: dedicated R7.10 Playwright config and preview smoke
- Produces: blocking local OFF/ON checks, preview route smoke, failure artifacts, route checklist

- [ ] **Step 1: Update the CI contract test first**

Assert that `.github/workflows/ci.yml` contains:

- `R7_10_BOOKING_STATE: 'off'`
- `R7_10_BOOKING_STATE: 'on'`
- `secrets.STRIPE_SECRET_KEY`
- `playwright.r7-10.config.ts`
- a bounded `wait-on --timeout 120000`
- artifact paths for `test-results` and `playwright-report`

Retain the existing assertions for Agent ON and Booking OFF in the original
smoke journey.

- [ ] **Step 2: Run the CI contract and verify RED**

Run:

```bash
pnpm --filter web test -- tests/ci.product-state.test.ts
```

Expected: FAIL because the two R7.10 state invocations are not in CI.

- [ ] **Step 3: Add isolated local CI invocations**

Keep the existing deterministic Supabase setup. Change the current startup
step so it launches only the fixture-mode scan worker and waits for
`http://localhost:8788/health`; remove its background `pnpm --filter web dev`
command and the port-3000 readiness target. Replace the separate PR-smoke step
with these sequential Playwright-owned server invocations:

```yaml
- name: R7.10 accessibility — Booking OFF
  env:
    R7_10_BOOKING_STATE: 'off'
  run: pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts

- name: R7.10 accessibility — Booking ON
  env:
    R7_10_BOOKING_STATE: 'on'
    STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
    STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_WEBHOOK_SECRET }}
  run: pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts
```

The dedicated config starts and stops one web server per invocation. Keep the
existing four PR smoke specs in the OFF config's `testMatch`. OFF uses port
3100 and exits before ON uses port 3101, so the checkout never has concurrent
`next dev` processes.

- [ ] **Step 4: Add preview-only manifest smoke**

Add a `preview-smoke` job to `verify.yml` whose condition is a successful
Preview deployment for the `remix-kinnso-web` environment URL. It checks out,
installs locked dependencies and Chromium, sets `E2E_BASE_URL` from the
deployment URL, and runs:

```bash
pnpm --filter @kinnso/e2e e2e r7-10-preview-smoke
```

Do not provide Supabase service-role or Stripe secrets to this job. Preserve
the production parity/E2E jobs and the existing warn-only Lighthouse step
unchanged.

- [ ] **Step 5: Run all local gates**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm honesty:lint
pnpm test
pnpm --filter web build
R7_10_BOOKING_STATE=off pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts
R7_10_BOOKING_STATE=on pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts
```

Expected: all commands pass. The build remains production-optimized and the
Stripe journey stops on hosted test checkout.

- [ ] **Step 6: Write the route-by-route verification record**

Create a table with one row per `R7_10_ROUTES` entry and columns:

- Route
- HTTP/readiness
- Axe critical/serious
- 380px overflow
- CLS
- Header journey applicability
- Exception

Record the exact commands, commit SHA, local test date, OFF/ON booking results,
and preview deployment URL. An empty exception column must read `None`, not be
left blank.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/verify.yml apps/web/tests/ci.product-state.test.ts docs/superpowers/verification/2026-07-30-phase-r7-10-accessibility-polish.md
git commit -m "ci: gate R7.10 accessibility and preview smoke"
```

## Final Review and Delivery

After Task 7:

```bash
git status --short
git log --oneline --decorate origin/main..HEAD
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
```

Then use `superpowers:requesting-code-review` for a whole-branch spec and code
review. Resolve every actionable finding, rerun the strongest affected gate,
and use `superpowers:verification-before-completion` before claiming success.

Publish one ready PR for `codex/r7-10-accessibility-polish`. The PR body must
link the approved design, this plan, and the route verification record, and
must state:

- Zero unapproved critical/serious axe findings.
- Booking OFF and ON keyboard results.
- 380px overflow and CLS results.
- Whether the exception ledger is empty.
- Lighthouse remains advisory.
- No production database write or payment was performed.
