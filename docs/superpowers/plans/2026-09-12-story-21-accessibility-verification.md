# Story 21 Accessibility Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the automated half of Phase 1's story 21 by adding permanently-gated Playwright coverage for viewports, 200% zoom, keyboard traversal and accessibility-tree structure across all 9 R7.10 routes.

**Architecture:** Three new spec files (one concern each) run by the existing `playwright.r7-10.config.ts` job. Pure logic lives in `r7-10-accessibility.ts` with fast unit tests; anything touching `page` stays in a spec. A plain data module makes spec registration assertable, and a typed ledger absorbs pre-existing violations that need real layout work.

**Tech Stack:** Playwright 1.50, `@axe-core/playwright`, TypeScript, pnpm workspaces. Tests run against a local `next dev` server started by the config's `webServer`, with a local Supabase stack.

---

## Design source

`docs/superpowers/specs/2026-09-12-story-21-accessibility-verification-design.md`. Read it first — it records *why* zoom is split into two WCAG criteria and why screen-reader coverage is deliberately partial.

## Running tests in this repo

All Playwright commands below assume a local Supabase stack is up and `apps/web/.env.local` exists (see `docs/implementation/CURRENT-STATE.md` §4.1). The R7.10 config starts its own `next dev` on port 3100.

**Always pass `--workers=1 --timeout=120000` locally:**

```bash
cd apps/e2e && npx playwright test --config playwright.r7-10.config.ts specs/<file> --workers=1 --timeout=120000
```

This is not optional tuning — without it the results are not readable. `playwright.config.ts`
sets `fullyParallel: true` with no worker cap, `retries: CI ? 1 : 0` and
`timeout: CI ? 120_000 : 30_000`. So a local run puts ~6 workers against a single `next dev`
that compiles routes on demand, with a 30s cap and no retry, while CI gets a dedicated runner,
120s and one retry.

Measured on this machine: `specs/r7-10-accessibility.spec.ts` fails **5 of 24** at the default
settings — HTTP 500s on `/en/explore`, `/en/for-merchants`, `/en/creators` and a navigation
timeout on the article route — and passes **24 of 24 in 46s** with `--workers=1
--timeout=120000`. None of those five were real defects. Triage in Task 9 is meaningless
unless the runs are quiet, so use the flags everywhere.

If a new failure appears, re-run that single test with the flags before believing it.

Unit-style tests (no browser) live in Playwright spec files too — they simply never take a `page` fixture. That is the existing convention in `r7-10-accessibility-review.spec.ts`.

## File Structure

**New:**

| File | Responsibility |
|---|---|
| `apps/e2e/r7-10-specs.ts` | Plain data: which spec files each R7.10 config runs. No imports, no side effects. |
| `apps/e2e/specs/r7-10-reflow.spec.ts` | Viewport widths, text resize 200%, reflow at 320px |
| `apps/e2e/specs/r7-10-keyboard.spec.ts` | Skip link, focus visibility, reachability, traps |
| `apps/e2e/specs/r7-10-structure.spec.ts` | Landmarks, heading order, accessible names, `html lang` |
| `docs/implementation/A11Y-SCREEN-READER-CHECKLIST.md` | Scripted manual pass |

**Modified:**

| File | Change |
|---|---|
| `apps/e2e/r7-10-accessibility.ts` | Add `waitForVisualSettlement`, the `A11yException` ledger, and the pure helpers |
| `apps/e2e/specs/r7-10-accessibility.spec.ts` | Import `waitForVisualSettlement` instead of declaring it |
| `apps/e2e/playwright.r7-10.config.ts` | Import `R7_10_OFF_SPECS` instead of declaring `offSpecs` |
| `apps/e2e/specs/r7-10-contract.spec.ts` | Registration guard, ledger assertions, no-sleep meta-test |
| `apps/e2e/specs/r7-10-accessibility-review.spec.ts` | Unit tests for the new pure helpers |
| `docs/implementation/STATUS.md` | Record the partial closure |

**Why a data module rather than exporting `offSpecs` from the config:** importing the config reads `apps/web/.env.local` and mutates `process.env`. A test importing it merely to check a list would drag all of that in.

---

### Task 1: Share `waitForVisualSettlement`

Three new specs need it; it currently lives inside one spec file. Pure move, no behaviour change.

**Files:**
- Modify: `apps/e2e/r7-10-accessibility.ts` (append)
- Modify: `apps/e2e/specs/r7-10-accessibility.spec.ts:19-31` (delete local copy, import instead)

- [ ] **Step 1: Move the function into the helper module**

Append to `apps/e2e/r7-10-accessibility.ts`:

```ts
/**
 * Fonts loaded, in-viewport images decoded, two animation frames passed. Used before
 * any layout assertion so a measurement is not taken mid-paint. Deliberately polls
 * rather than sleeping: a fixed timeout is both slower and flakier, and the
 * no-fixed-sleeps meta-test forbids one.
 */
export async function waitForVisualSettlement(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.waitForFunction(() => Array.from(document.images)
    .filter((image) => {
      const bounds = image.getBoundingClientRect()
      return bounds.bottom > 0 && bounds.right > 0 && bounds.top < window.innerHeight && bounds.left < window.innerWidth
    })
    .every((image) => image.complete))
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}
```

- [ ] **Step 2: Delete the local copy and import it**

In `apps/e2e/specs/r7-10-accessibility.spec.ts`, delete the local `async function waitForVisualSettlement(...)` block (lines 19-31) and add `waitForVisualSettlement,` to the existing named import from `'../r7-10-accessibility'`, after `unapprovedViolations,` to keep the list alphabetical.

- [ ] **Step 3: Verify nothing changed**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-accessibility.spec.ts
```
Expected: the same pass count as before the move. If any test fails, the move was not pure — revert and retry.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @kinnso/e2e typecheck
```
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add apps/e2e/r7-10-accessibility.ts apps/e2e/specs/r7-10-accessibility.spec.ts
git commit -m "refactor(e2e): share waitForVisualSettlement across specs"
```

---

### Task 2: Make spec registration assertable

`playwright.r7-10.config.ts` selects specs through a local `offSpecs` allowlist. Its own comment records a spec that "executed nowhere" because it was unlisted. This makes that impossible to repeat silently.

Note `r7-10-preview-smoke.spec.ts` is deliberately absent from `offSpecs` — it runs under the preview config in `verify.yml`. Hence two lists, not one.

**Files:**
- Create: `apps/e2e/r7-10-specs.ts`
- Modify: `apps/e2e/playwright.r7-10.config.ts:7-19` and its `testMatch` line
- Modify: `apps/e2e/specs/r7-10-contract.spec.ts`

- [ ] **Step 1: Write the failing test**

In `apps/e2e/specs/r7-10-contract.spec.ts`, add `import { readdir } from 'node:fs/promises'` and `import { R7_10_OFF_SPECS, R7_10_PREVIEW_SPECS } from '../r7-10-specs'` at the top, then append:

```ts
// A spec file that no config selects runs nowhere and protects nothing. That has
// already happened here once: r7-10-accessibility-review.spec.ts matched only the
// default config, which nothing runs any more. This makes it a failure, not a silence.
test('every R7.10 spec on disk is selected by a config', async () => {
  const names = (await readdir(new URL('.', import.meta.url)))
    .filter((name) => /^r7-10-.*\.spec\.ts$/.test(name))
    .sort()

  expect(names.length, 'scan matched nothing — glob or path is wrong').toBeGreaterThan(3)

  const registered = new Set<string>([...R7_10_OFF_SPECS, ...R7_10_PREVIEW_SPECS])
  expect(names.filter((name) => !registered.has(name))).toEqual([])
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-contract.spec.ts
```
Expected: FAIL — `Cannot find module '../r7-10-specs'`.

- [ ] **Step 3: Create the data module**

Create `apps/e2e/r7-10-specs.ts`:

```ts
/**
 * Which spec files each R7.10 Playwright config selects.
 *
 * A plain data module with no imports and no side effects, deliberately: importing
 * playwright.r7-10.config.ts reads apps/web/.env.local and mutates process.env, so a
 * test that only wants to check this list must not have to load all of that.
 *
 * r7-10-contract.spec.ts asserts every r7-10-*.spec.ts on disk appears in one of these
 * two lists.
 */

/** Selected by playwright.r7-10.config.ts when R7_10_BOOKING_STATE is not 'on'. */
export const R7_10_OFF_SPECS = [
  'creator-onboarding.spec.ts',
  'e2e-target.spec.ts',
  'funnel-smoke.spec.ts',
  'honesty.spec.ts',
  'notfound.spec.ts',
  'r7-10-contract.spec.ts',
  'r7-10-accessibility.spec.ts',
  // Helper-level coverage for r7-10-accessibility.ts (axe formatting, the CLS
  // session-window calculation, focus-indicator detection). It matched only the
  // default config, which nothing runs any more, so it executed nowhere.
  'r7-10-accessibility-review.spec.ts',
  'r7-10-booking.spec.ts',
  'r7-10-keyboard.spec.ts',
  'r7-10-reflow.spec.ts',
  'r7-10-structure.spec.ts',
] as const

/**
 * Selected by the preview config for the read-only smoke in verify.yml. Listed here
 * only so the registration guard knows it is not orphaned.
 */
export const R7_10_PREVIEW_SPECS = ['r7-10-preview-smoke.spec.ts'] as const
```

- [ ] **Step 4: Point the config at it**

In `apps/e2e/playwright.r7-10.config.ts`: delete the local `const offSpecs = [...] as const` block (lines 7-19), add `import { R7_10_OFF_SPECS } from './r7-10-specs'` beside the other local imports, and change the `testMatch` line to:

```ts
  testMatch: local.bookingState === 'on' ? 'r7-10-booking.spec.ts' : [...R7_10_OFF_SPECS],
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-contract.spec.ts
```
Expected: PASS. The three not-yet-created spec files are listed but absent, which is fine — the guard checks disk ⊆ registered, not the reverse.

- [ ] **Step 6: Mutation-verify the guard**

```bash
echo "import { test } from '@playwright/test'; test('x', () => {})" > apps/e2e/specs/r7-10-orphan.spec.ts
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-contract.spec.ts
```
Expected: FAIL listing `r7-10-orphan.spec.ts`. Then:

```bash
rm apps/e2e/specs/r7-10-orphan.spec.ts
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-contract.spec.ts
```
Expected: PASS. **If it passed with the orphan present, the guard is vacuous — stop and fix it.**

- [ ] **Step 7: Commit**

```bash
git add apps/e2e/r7-10-specs.ts apps/e2e/playwright.r7-10.config.ts apps/e2e/specs/r7-10-contract.spec.ts
git commit -m "test(e2e): fail when an R7.10 spec is registered with no config"
```

---

### Task 3: The findings ledger

Absorbs pre-existing violations that need real layout work, so CI lands green and the backlog stays visible rather than hidden.

**Files:**
- Modify: `apps/e2e/r7-10-accessibility.ts` (append)
- Modify: `apps/e2e/specs/r7-10-accessibility-review.spec.ts`
- Modify: `apps/e2e/specs/r7-10-contract.spec.ts`

- [ ] **Step 1: Write the failing unit tests**

Append to `apps/e2e/specs/r7-10-accessibility-review.spec.ts`, adding `A11Y_EXCEPTIONS` and `isExcepted` to its import from `'../r7-10-accessibility'`:

```ts
test('a11y exceptions match on both route and check, never one alone', () => {
  const exceptions = [{
    routeId: 'guide' as const,
    check: 'reflow-320' as const,
    reason: 'Itinerary table needs a real responsive rewrite',
    owner: 'Design',
    reviewWhen: 'Before public launch',
  }]

  expect(isExcepted('guide', 'reflow-320', exceptions)).toBe(true)
  expect(isExcepted('guide', 'text-200', exceptions)).toBe(false)
  expect(isExcepted('home', 'reflow-320', exceptions)).toBe(false)
  expect(isExcepted('home', 'text-200', exceptions)).toBe(false)
})

test('a11y ledger defaults to the real list when none is passed', () => {
  expect(isExcepted('home', 'reflow-320')).toBe(A11Y_EXCEPTIONS.some(
    (entry) => entry.routeId === 'home' && entry.check === 'reflow-320',
  ))
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-accessibility-review.spec.ts
```
Expected: FAIL — `isExcepted` is not exported.

- [ ] **Step 3: Implement the ledger**

Append to `apps/e2e/r7-10-accessibility.ts`:

```ts
/**
 * Checks the story 21 suites assert. A closed union so a suppression cannot name a
 * check that does not exist: a typo is a compile error rather than a silently inert
 * entry that suppresses nothing while looking like it does.
 */
export type A11yCheck =
  | 'viewport-overflow'
  | 'viewport-cls'
  | 'text-200'
  | 'reflow-320'
  | 'skip-link'
  | 'keyboard-reachable'
  | 'focus-visible'
  | 'focus-trap'
  | 'dialog-focus'
  | 'landmarks'
  | 'heading-order'
  | 'accessible-name'
  | 'html-lang'

/**
 * A known, accepted failure. Separate from AXE_EXCEPTIONS because that one is keyed by
 * rule id and CSS target and filters individual violation nodes, while this suppresses
 * a whole assertion for one route. Merging them would give one type where half the
 * fields are meaningless in each case.
 *
 * r7-10-contract.spec.ts asserts this list's EXACT contents, so an entry cannot be
 * added without showing up in a diff.
 */
export interface A11yException {
  routeId: R710RouteId
  check: A11yCheck
  reason: string
  owner: string
  reviewWhen: string
}

export const A11Y_EXCEPTIONS: readonly A11yException[] = []

export function isExcepted(
  routeId: R710RouteId,
  check: A11yCheck,
  exceptions: readonly A11yException[] = A11Y_EXCEPTIONS,
): boolean {
  return exceptions.some((entry) => entry.routeId === routeId && entry.check === check)
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-accessibility-review.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Assert the ledger's exact contents**

Add to `apps/e2e/specs/r7-10-contract.spec.ts`, adding `A11Y_EXCEPTIONS` to its import from `'../r7-10-accessibility'`:

```ts
// Exact contents, not merely shape: a suppression must appear in a diff and be argued
// for in review, the same standard AXE_EXCEPTIONS is held to.
test('R7.10 a11y exception ledger has exactly the approved entries', () => {
  expect(A11Y_EXCEPTIONS).toEqual([])
})

test('every a11y exception carries a reason, an owner and a review date', () => {
  for (const entry of A11Y_EXCEPTIONS) {
    expect(entry.reason.trim(), `${entry.routeId}/${entry.check} needs a reason`).not.toBe('')
    expect(entry.owner.trim(), `${entry.routeId}/${entry.check} needs an owner`).not.toBe('')
    expect(entry.reviewWhen.trim(), `${entry.routeId}/${entry.check} needs a review date`).not.toBe('')
  }
})
```

- [ ] **Step 6: Run, typecheck and commit**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-contract.spec.ts
pnpm --filter @kinnso/e2e typecheck
git add apps/e2e/r7-10-accessibility.ts apps/e2e/specs/r7-10-contract.spec.ts apps/e2e/specs/r7-10-accessibility-review.spec.ts
git commit -m "test(e2e): add the story 21 findings ledger"
```
Expected: both commands exit 0.

---

### Task 4: Heading-order helper (pure)

**Files:**
- Modify: `apps/e2e/r7-10-accessibility.ts` (append)
- Modify: `apps/e2e/specs/r7-10-accessibility-review.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/e2e/specs/r7-10-accessibility-review.spec.ts`, adding `firstHeadingOrderViolation` to the import:

```ts
test('heading order rejects a skipped level and accepts a legal descent', () => {
  expect(firstHeadingOrderViolation([1, 2, 3, 2, 3])).toBeUndefined()
  expect(firstHeadingOrderViolation([1, 2, 4])).toBe('h2 is followed by h4 at position 3; levels must not skip')
  expect(firstHeadingOrderViolation([2, 3])).toBe('first heading is h2 at position 1; the page must start at h1')
  // Descending by more than one is legal: a section ending returns to any shallower level.
  expect(firstHeadingOrderViolation([1, 2, 3, 1])).toBeUndefined()
  expect(firstHeadingOrderViolation([])).toBeUndefined()
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-accessibility-review.spec.ts
```
Expected: FAIL — `firstHeadingOrderViolation` is not exported.

- [ ] **Step 3: Implement it**

Append to `apps/e2e/r7-10-accessibility.ts`:

```ts
/**
 * Returns a description of the first heading-order violation, or undefined if the
 * sequence is legal. Skipping DOWN a level (h2 -> h4) hides structure from a screen
 * reader; jumping back UP any distance (h3 -> h1) is a section ending and is fine.
 */
export function firstHeadingOrderViolation(levels: readonly number[]): string | undefined {
  let previous = 0

  for (const [index, level] of levels.entries()) {
    if (previous === 0) {
      if (level !== 1) return `first heading is h${level} at position ${index + 1}; the page must start at h1`
    } else if (level > previous + 1) {
      return `h${previous} is followed by h${level} at position ${index + 1}; levels must not skip`
    }
    previous = level
  }

  return undefined
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-accessibility-review.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/e2e/r7-10-accessibility.ts apps/e2e/specs/r7-10-accessibility-review.spec.ts
git commit -m "feat(e2e): add heading-order validation helper"
```

---

### Task 5: Clipping helper and interactive selector (pure)

Gives "no clipped text" an exact meaning so the reflow spec can assert it.

**Files:**
- Modify: `apps/e2e/r7-10-accessibility.ts` (append)
- Modify: `apps/e2e/specs/r7-10-accessibility-review.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/e2e/specs/r7-10-accessibility-review.spec.ts`, adding `clippedElements` and `type ElementBox` to the import:

```ts
test('clipping tolerates one sub-pixel rounding pixel but not real overflow', () => {
  const boxes: ElementBox[] = [
    { label: 'p.fits', scrollWidth: 300, clientWidth: 300, scrollHeight: 40, clientHeight: 40 },
    { label: 'p.rounding', scrollWidth: 301, clientWidth: 300, scrollHeight: 40, clientHeight: 40 },
    { label: 'p.cut-horizontally', scrollWidth: 420, clientWidth: 300, scrollHeight: 40, clientHeight: 40 },
    { label: 'p.cut-vertically', scrollWidth: 300, clientWidth: 300, scrollHeight: 96, clientHeight: 40 },
  ]

  expect(clippedElements(boxes).map((box) => box.label)).toEqual(['p.cut-horizontally', 'p.cut-vertically'])
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-accessibility-review.spec.ts
```
Expected: FAIL — `clippedElements` is not exported.

- [ ] **Step 3: Implement both**

Append to `apps/e2e/r7-10-accessibility.ts`:

```ts
export interface ElementBox {
  label: string
  scrollWidth: number
  clientWidth: number
  scrollHeight: number
  clientHeight: number
}

/**
 * Elements whose content is cut off by their own box. The 1px tolerance absorbs
 * sub-pixel layout rounding, which otherwise flags every second text node at scaled
 * font sizes and makes the check useless.
 */
export function clippedElements(boxes: readonly ElementBox[], tolerance = 1): ElementBox[] {
  return boxes.filter((box) => (
    box.scrollWidth > box.clientWidth + tolerance
    || box.scrollHeight > box.clientHeight + tolerance
  ))
}

/**
 * Interactive elements a keyboard user must be able to reach. Excludes disabled and
 * aria-hidden nodes; the specs additionally drop anything with a zero-area box, which
 * cannot be expressed in a selector.
 */
export const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]',
  '[role="link"]',
]
  .map((selector) => `${selector}:not([disabled]):not([aria-hidden="true"])`)
  .join(', ')
```

- [ ] **Step 4: Run to verify it passes**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-accessibility-review.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/e2e/r7-10-accessibility.ts apps/e2e/specs/r7-10-accessibility-review.spec.ts
git commit -m "feat(e2e): add clipping detection and the interactive-element selector"
```

---

### Task 6: Structure spec — landmarks, headings, names, lang

**Files:**
- Create: `apps/e2e/specs/r7-10-structure.spec.ts`

- [ ] **Step 1: Write the spec**

Create `apps/e2e/specs/r7-10-structure.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import {
  INTERACTIVE_SELECTOR,
  firstHeadingOrderViolation,
  isExcepted,
  waitForRoute,
} from '../r7-10-accessibility'
import { R7_10_ROUTES, type R710Route } from '../r7-10-routes'

/**
 * Story 21, the machine-checkable half of "screen reader": structural facts an
 * accessibility tree can prove. Whether announcements SOUND correct needs a human ear
 * and lives in docs/implementation/A11Y-SCREEN-READER-CHECKLIST.md, not here.
 */
test.describe('R7.10 accessibility tree structure', () => {
  for (const route of R7_10_ROUTES as readonly R710Route[]) {
    test(`${route.id}: exactly one main, banner and contentinfo landmark`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'landmarks'), 'recorded in A11Y_EXCEPTIONS')
      await waitForRoute(page, route)

      await expect(page.getByRole('main')).toHaveCount(1)
      await expect(page.getByRole('banner')).toHaveCount(1)
      await expect(page.getByRole('contentinfo')).toHaveCount(1)
    })

    test(`${route.id}: heading levels never skip`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'heading-order'), 'recorded in A11Y_EXCEPTIONS')
      await waitForRoute(page, route)

      const levels = await page.evaluate(() => Array.from(
        document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'),
      )
        .filter((heading) => heading.getClientRects().length > 0)
        .map((heading) => Number(heading.tagName[1])))

      expect(levels.length, `${route.id} rendered no headings — selector or route is wrong`).toBeGreaterThan(0)
      expect(firstHeadingOrderViolation(levels), `${route.id} heading order`).toBeUndefined()
    })

    test(`${route.id}: every interactive element has an accessible name`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'accessible-name'), 'recorded in A11Y_EXCEPTIONS')
      await waitForRoute(page, route)

      const unnamed = await page.evaluate((selector) => Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      )
        .filter((element) => element.getClientRects().length > 0)
        .filter((element) => {
          if (element.getAttribute('aria-label')?.trim()) return false
          const labelledBy = element.getAttribute('aria-labelledby')
          if (labelledBy?.split(/\s+/).some((id) => document.getElementById(id)?.textContent?.trim())) return false
          if (element.textContent?.trim()) return false
          if (element.getAttribute('title')?.trim()) return false
          return !element.querySelector('img[alt]')?.getAttribute('alt')?.trim()
        })
        .map((element) => {
          const first = String(element.className || '').split(/\s+/)[0]
          return `${element.tagName.toLowerCase()}${first ? `.${first}` : ''}`
        }), INTERACTIVE_SELECTOR)

      expect(unnamed, `${route.id} has interactive elements with no accessible name`).toEqual([])
    })

    test(`${route.id}: html lang matches the route locale`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'html-lang'), 'recorded in A11Y_EXCEPTIONS')
      await waitForRoute(page, route)

      // Every manifest route is under /en, so the document must declare English.
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    })
  }
})
```

- [ ] **Step 2: Run it**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-structure.spec.ts
```
Expected: 36 tests (9 routes × 4). Some may FAIL — that is the point, and Task 9 triages them. **Record the failing list verbatim; you need it later.**

- [ ] **Step 3: Mutation-verify the heading assertion**

Temporarily add `<h4>Injected</h4>` immediately after the `<h1>` in `apps/web/app/[locale]/page.tsx`, then:

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-structure.spec.ts -g "home: heading levels never skip"
```
Expected: FAIL with `h1 is followed by h4 at position 2`. Revert the injection and re-run: back to its previous result. **If it passed with the injection present, the test is vacuous — stop and fix it.**

- [ ] **Step 4: Commit**

```bash
git add apps/e2e/specs/r7-10-structure.spec.ts
git commit -m "test(e2e): assert landmark, heading, naming and lang structure"
```

---

### Task 7: Reflow spec — viewports, text resize, 320px reflow

**Files:**
- Create: `apps/e2e/specs/r7-10-reflow.spec.ts`

- [ ] **Step 1: Write the spec**

Create `apps/e2e/specs/r7-10-reflow.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'
import {
  assertNoHorizontalOverflow,
  clippedElements,
  installLayoutShiftObserver,
  isExcepted,
  readCLS,
  waitForRoute,
  waitForVisualSettlement,
  type ElementBox,
} from '../r7-10-accessibility'
import { R7_10_ROUTES, type R710Route } from '../r7-10-routes'

/**
 * Story 21: viewports and zoom.
 *
 * These MODEL zoom rather than drive it. Playwright cannot operate native browser
 * chrome zoom, so:
 *   - WCAG 1.4.4 Resize text -> root font-size scaled to 200% at 1280px wide
 *   - WCAG 1.4.10 Reflow     -> viewport narrowed to 320 CSS px
 * 320px is the standard's own definition of reflow, not an approximation of it. Do not
 * read these as proof that native browser zoom behaves identically.
 */
const WIDTHS = [380, 768, 1280, 1440] as const

async function measureTextBoxes(page: Page): Promise<ElementBox[]> {
  return page.evaluate(() => Array.from(
    document.querySelectorAll<HTMLElement>('main :is(p, h1, h2, h3, h4, li, dd, dt, button, a)'),
  )
    .filter((element) => element.getClientRects().length > 0 && Boolean(element.textContent?.trim()))
    .map((element) => {
      const first = String(element.className || '').split(/\s+/)[0]
      return {
        label: `${element.tagName.toLowerCase()}${first ? `.${first}` : ''}`,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }
    }))
}

test.describe('R7.10 viewports and zoom', () => {
  for (const route of R7_10_ROUTES as readonly R710Route[]) {
    for (const width of WIDTHS) {
      test(`${route.id}: no overflow and stable layout at ${width}px`, async ({ page }) => {
        test.skip(isExcepted(route.id, 'viewport-overflow'), 'recorded in A11Y_EXCEPTIONS')
        await page.setViewportSize({ width, height: 900 })
        await installLayoutShiftObserver(page)
        await waitForRoute(page, route)
        await waitForVisualSettlement(page)

        await assertNoHorizontalOverflow(page)
        await expect(page.getByRole(route.ready.role, { level: route.ready.level }).first()).toBeVisible()

        if (!isExcepted(route.id, 'viewport-cls')) {
          expect(await readCLS(page), `${route.id} at ${width}px must keep unexpected CLS at or below 0.1`)
            .toBeLessThanOrEqual(0.1)
        }
      })
    }

    test(`${route.id}: text stays unclipped at 200% (WCAG 1.4.4)`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'text-200'), 'recorded in A11Y_EXCEPTIONS')
      await page.setViewportSize({ width: 1280, height: 900 })
      await waitForRoute(page, route)
      // Models browser text zoom. Applied after load so it cannot affect hydration.
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
      await waitForVisualSettlement(page)

      const boxes = await measureTextBoxes(page)
      expect(boxes.length, `${route.id} measured no text — selector or route is wrong`).toBeGreaterThan(0)
      expect(clippedElements(boxes).map((box) => box.label), `${route.id} clips text at 200%`).toEqual([])
      await assertNoHorizontalOverflow(page)
    })

    test(`${route.id}: reflows at 320px without horizontal scrolling (WCAG 1.4.10)`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'reflow-320'), 'recorded in A11Y_EXCEPTIONS')
      await page.setViewportSize({ width: 320, height: 900 })
      await waitForRoute(page, route)
      await waitForVisualSettlement(page)

      await assertNoHorizontalOverflow(page)
      // "No content loss" is not decidable from outside, so assert the specific things
      // a reflowed page must retain rather than pretending to prove the general claim.
      await expect(page.getByRole(route.ready.role, { level: route.ready.level }).first()).toBeVisible()
      await expect(page.getByRole('main')).toHaveCount(1)
      await expect(page.getByRole('banner')).toHaveCount(1)
    })
  }
})
```

- [ ] **Step 2: Run it**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-reflow.spec.ts
```
Expected: 54 tests (9 routes × (4 widths + 2)). Failures are expected and get triaged in Task 9. **Record the failing list verbatim.**

- [ ] **Step 3: Mutation-verify the overflow assertion**

Temporarily add `<div style={{ width: 3000 }}>overflow probe</div>` inside the page's `<main>` content in `apps/web/app/[locale]/page.tsx`, then:

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-reflow.spec.ts -g "home: reflows at 320px"
```
Expected: FAIL with `Document horizontal overflow`. Revert and re-run: back to its previous result. **If it passed with the probe present, stop and fix the test.**

- [ ] **Step 4: Commit**

```bash
git add apps/e2e/specs/r7-10-reflow.spec.ts
git commit -m "test(e2e): assert viewport, text-resize and reflow behaviour"
```

---

### Task 8: Keyboard spec

Dialog focus is already covered by the mobile-header dialog tests in `r7-10-accessibility.spec.ts`, so `dialog-focus` exists in the ledger union but gets no new test here. That is deliberate, not an omission.

**Files:**
- Create: `apps/e2e/specs/r7-10-keyboard.spec.ts`

- [ ] **Step 1: Write the spec**

Create `apps/e2e/specs/r7-10-keyboard.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'
import {
  INTERACTIVE_SELECTOR,
  hasMeaningfulFocusIndicator,
  isExcepted,
  waitForRoute,
  waitForVisualSettlement,
  type FocusStyleSnapshot,
} from '../r7-10-accessibility'
import { R7_10_ROUTES, type R710Route } from '../r7-10-routes'

/** Story 21: keyboard traversal beyond the header, which r7-10-accessibility.spec.ts covers. */

const BLURRED: FocusStyleSnapshot = {
  outlineStyle: 'none',
  outlineWidth: '0px',
  outlineColor: 'transparent',
  boxShadow: 'none',
}

async function activeFocusStyle(page: Page): Promise<FocusStyleSnapshot> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null
    const style = element ? getComputedStyle(element) : null
    return {
      outlineStyle: style?.outlineStyle ?? 'none',
      outlineWidth: style?.outlineWidth ?? '0px',
      outlineColor: style?.outlineColor ?? 'transparent',
      boxShadow: style?.boxShadow ?? 'none',
    }
  })
}

test.describe('R7.10 keyboard traversal', () => {
  for (const route of R7_10_ROUTES as readonly R710Route[]) {
    test(`${route.id}: the skip link is first and moves focus into main`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'skip-link'), 'recorded in A11Y_EXCEPTIONS')
      await waitForRoute(page, route)
      await page.keyboard.press('Tab')

      const href = await page.evaluate(() => (document.activeElement as HTMLAnchorElement | null)?.getAttribute('href'))
      expect(href, `${route.id}: the first Tab must land on the skip link`).toBe('#main-content')

      await page.keyboard.press('Enter')
      const focusedId = await page.evaluate(() => document.activeElement?.id)
      expect(focusedId, `${route.id}: activating the skip link must move focus into main`).toBe('main-content')
    })

    test(`${route.id}: every interactive element in main is reachable and shows focus`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'keyboard-reachable'), 'recorded in A11Y_EXCEPTIONS')
      await waitForRoute(page, route)
      await waitForVisualSettlement(page)

      await page.evaluate((selector) => {
        Array.from(document.querySelectorAll<HTMLElement>(`main ${selector}`))
          .filter((element) => element.getClientRects().length > 0)
          .forEach((element, index) => element.setAttribute('data-r710-target', String(index)))
      }, INTERACTIVE_SELECTOR)

      const expected = await page.locator('[data-r710-target]').count()
      expect(expected, `${route.id} found no interactive elements in main`).toBeGreaterThan(0)

      // Cap the traversal so a genuine focus trap FAILS the test rather than hanging it.
      const maxTabs = expected + 10
      const reached = new Set<string>()
      const focusFailures: string[] = []

      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      for (let index = 0; index < maxTabs && reached.size < expected; index += 1) {
        await page.keyboard.press('Tab')
        const marker = await page.evaluate(() => document.activeElement?.getAttribute('data-r710-target') ?? null)
        if (marker === null || reached.has(marker)) continue
        reached.add(marker)

        if (!isExcepted(route.id, 'focus-visible')) {
          const focused = await activeFocusStyle(page)
          if (!hasMeaningfulFocusIndicator(BLURRED, focused)) {
            focusFailures.push(`${marker}:${JSON.stringify(focused)}`)
          }
        }
      }

      expect(
        reached.size,
        `${route.id}: reached ${reached.size} of ${expected} interactive elements within ${maxTabs} tabs`,
      ).toBe(expected)
      expect(focusFailures, `${route.id}: elements focused with no visible indicator`).toEqual([])
    })

    test(`${route.id}: Tab traversal terminates rather than trapping`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'focus-trap'), 'recorded in A11Y_EXCEPTIONS')
      await waitForRoute(page, route)

      const total = await page.locator(INTERACTIVE_SELECTOR).count()
      const seen = new Set<string>()
      for (let index = 0; index < total + 10; index += 1) {
        await page.keyboard.press('Tab')
        seen.add(await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null
          if (!element) return 'none'
          return `${element.tagName.toLowerCase()}#${element.id}.${String(element.className || '').split(/\s+/)[0]}`
        }))
      }

      // A trap cycles a tiny set forever. Real traversal visits many distinct stops.
      expect(seen.size, `${route.id}: focus cycled through only ${seen.size} distinct elements`)
        .toBeGreaterThan(Math.min(3, total))
    })
  }
})
```

- [ ] **Step 2: Run it**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-keyboard.spec.ts
```
Expected: 27 tests (9 routes × 3). Failures expected; **record the failing list verbatim**.

- [ ] **Step 3: Mutation-verify the skip-link assertion**

Temporarily change `href="#main-content"` to `href="#nope"` at `apps/web/components/kinnso/SiteChrome.tsx:39`, then:

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-keyboard.spec.ts -g "home: the skip link is first"
```
Expected: FAIL. Revert and re-run: PASS. **If it passed while broken, stop and fix the test.**

- [ ] **Step 4: Commit**

```bash
git add apps/e2e/specs/r7-10-keyboard.spec.ts
git commit -m "test(e2e): assert skip link, focus visibility and keyboard reachability"
```

---

### Task 9: Forbid fixed sleeps, then triage every finding

**Files:**
- Modify: `apps/e2e/specs/r7-10-contract.spec.ts`
- Modify: `apps/e2e/r7-10-accessibility.ts` (ledger entries, if any)
- Modify: application files (contained fixes, if any)

- [ ] **Step 1: Write the meta-test**

Add to `apps/e2e/specs/r7-10-contract.spec.ts`, adding `readFile` to the existing `node:fs/promises` import:

```ts
// A fixed sleep is both slower and flakier than polling, and the focus test in
// r7-10-accessibility.spec.ts already forbids one in its own file. Same rule here.
test('story 21 specs poll instead of sleeping', async () => {
  const names = ['r7-10-reflow.spec.ts', 'r7-10-keyboard.spec.ts', 'r7-10-structure.spec.ts']

  for (const name of names) {
    const source = await readFile(new URL(name, import.meta.url), 'utf8')
    expect(source.length, `${name} read as empty — path is wrong`).toBeGreaterThan(500)
    expect(source, `${name} must not use a fixed sleep`).not.toMatch(/\b(?:waitForTimeout|setTimeout|sleep)\s*\(/)
  }
})
```

- [ ] **Step 2: Run it**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts specs/r7-10-contract.spec.ts
```
Expected: PASS — the three specs were written without sleeps. If it FAILS, remove the sleep from the named file rather than relaxing the test.

- [ ] **Step 3: Run all three story 21 specs and capture the full failure list**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts \
  specs/r7-10-reflow.spec.ts specs/r7-10-keyboard.spec.ts specs/r7-10-structure.spec.ts \
  2>&1 | tee /tmp/story21-findings.txt
grep -E "✘|^\s+[0-9]+\) " /tmp/story21-findings.txt
```

- [ ] **Step 4: Triage each failure**

For every failure, decide which it is and act:

**Contained fix** — a colour token, a missing `aria-label`, a focus style, a heading level. Fix it in the app, re-run that one test, and commit it separately with a message naming the route and the check, e.g. `fix(web): give the explore filter buttons accessible names`.

**Needs real layout work** — add an entry to `A11Y_EXCEPTIONS` in `apps/e2e/r7-10-accessibility.ts`:

```ts
export const A11Y_EXCEPTIONS: readonly A11yException[] = [
  {
    routeId: 'guide',
    check: 'reflow-320',
    reason: 'The itinerary table is fixed-width and needs a responsive rewrite, not a patch',
    owner: 'Design',
    reviewWhen: 'Before public launch',
  },
]
```

Then update the exact-contents assertion in `r7-10-contract.spec.ts` to match it:

```ts
test('R7.10 a11y exception ledger has exactly the approved entries', () => {
  expect(A11Y_EXCEPTIONS).toEqual([
    {
      routeId: 'guide',
      check: 'reflow-320',
      reason: 'The itinerary table is fixed-width and needs a responsive rewrite, not a patch',
      owner: 'Design',
      reviewWhen: 'Before public launch',
    },
  ])
})
```

- [ ] **Step 5: Re-run until green**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts \
  specs/r7-10-reflow.spec.ts specs/r7-10-keyboard.spec.ts specs/r7-10-structure.spec.ts specs/r7-10-contract.spec.ts
```
Expected: all PASS, with skips only where a ledger entry exists.

- [ ] **Step 6: Measure the added runtime**

```bash
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts 2>&1 | tail -5
```
Record the total. If it has grown by more than ~3 minutes, narrow `keyboard-reachable` to the four routes `home, guide, article, experience` and say so in the PR body. A silent reduction is the thing to avoid, not the reduction itself.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(e2e): forbid fixed sleeps in story 21 specs and record findings"
```

---

### Task 10: The manual checklist and an honest status

**Files:**
- Create: `docs/implementation/A11Y-SCREEN-READER-CHECKLIST.md`
- Modify: `docs/implementation/STATUS.md`

- [ ] **Step 1: Write the checklist**

Create `docs/implementation/A11Y-SCREEN-READER-CHECKLIST.md`:

```markdown
# Screen-reader checklist — story 21, manual half

The automated suites (`r7-10-structure`, `r7-10-keyboard`, `r7-10-reflow`) prove structural
facts: landmarks exist, headings do not skip, every control has a name, the page reflows.
They cannot prove that what a screen reader *announces* is useful. This is that pass.

**Run with:** NVDA + Firefox (Windows) or VoiceOver + Safari (macOS). Record the date, the
tool and the result. An empty result column means NOT RUN — do not read it as passing.

## Per route

For each of the 9 routes in `apps/e2e/r7-10-routes.ts`:

1. Load the page. Does the announced page title describe the page, or is it generic?
2. Navigate by landmark (NVDA `D`, VoiceOver `VO-U`). Are banner, main and contentinfo
   announced with useful names?
3. Navigate by heading (`H`). Does the sequence describe the page's structure?
4. Tab through every control. Is each announced with a name that says what it DOES, not
   what it is? "Link, Tokyo coffee guide" passes; "Link, click here" fails.
5. On a form (enquiry dialog, sign-in), are labels, required state and errors announced?
6. Trigger a validation error. Is it announced without moving focus unexpectedly?

## Results

| Date | Tool | Route | Result | Notes |
|---|---|---|---|---|
| | | | | |
```

- [ ] **Step 2: Record the partial closure**

> **CORRECTION, found during execution.** `docs/implementation/STATUS.md` does NOT exist on
> `main` — the whole `docs/implementation/` tree belongs to branch
> `claude/phase01-canonical-frontend` (PR #131), which is not an ancestor of this branch. The
> plan referenced it because the author had it in context from that PR. Creating a competing
> `STATUS.md` here would conflict with #131, so **skip this step**: the partial-closure record
> goes in the pull request description instead, and the STATUS.md entry is added once #131
> merges. The checklist file itself is unaffected and still lands in `docs/implementation/`.

In `docs/implementation/STATUS.md`, replace the story 21 line (`4. **Story 21 - viewports, native 200% zoom, keyboard, screen reader.** NOT RUN.`) with:

```markdown
4. **Story 21 - viewports, native 200% zoom, keyboard, screen reader.** **PARTIALLY CLOSED.**
   The automated half is done and permanently gated: `r7-10-reflow`, `r7-10-keyboard` and
   `r7-10-structure` cover all 9 routes for viewport widths, WCAG 1.4.4 text resize, 1.4.10
   reflow at 320px, skip-link behaviour, keyboard reachability, focus visibility, landmarks,
   heading order, accessible names and `html lang`.

   **The screen-reader half is NOT RUN.** NVDA and VoiceOver cannot be driven from the
   implementation environment, so it ships as a scripted pass in
   `A11Y-SCREEN-READER-CHECKLIST.md` awaiting a human. The gate is not fully closed until
   someone runs it and records the result.

   Known accepted failures, if any, are in `A11Y_EXCEPTIONS`
   (`apps/e2e/r7-10-accessibility.ts`), each with a reason, an owner and a review date, and
   asserted by exact contents so one cannot be added without a diff.
```

- [ ] **Step 3: Commit**

```bash
git add docs/implementation/A11Y-SCREEN-READER-CHECKLIST.md docs/implementation/STATUS.md
git commit -m "docs: script the screen-reader pass and record story 21 as partially closed"
```

- [ ] **Step 4: Full verification before the PR**

```bash
pnpm --filter @kinnso/e2e typecheck
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts
```
Expected: typecheck exit 0; every spec passes.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/story-21-a11y-verification
```

The PR body must state: the added runtime, the exact ledger contents (or "none"), which
contained fixes were made, and that story 21 closes **partially**, with the screen-reader
half pending a human pass.

---

## Notes for the implementer

- **Never make a failing new test pass by weakening it.** If a route genuinely cannot satisfy
  a check yet, that is what the ledger is for — with a named owner and a review date.
- **Every new assertion must be proven non-vacuous.** Four vacuous-test failures have already
  happened in this repo: a whole-tree scan that matched nothing, a spec that executed nowhere,
  a token guard that matched zero tokens, and a credit test that passed because a CHECK
  constraint rejected its payload before the grant was ever exercised. Each scan-style
  assertion here therefore asserts it matched something before asserting what it found.
- **Do not add `waitForTimeout`.** The contract test forbids it and will fail.
- **Routes are `/en` only.** Locale coverage is not in this scope; do not add it opportunistically.
