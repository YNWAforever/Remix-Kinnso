# Story 21 — accessibility verification: viewports, zoom, keyboard, screen reader

**Date:** 12 September 2026
**Status:** approved, not yet implemented
**Phase:** 1 (exit gate)
**Branch:** `feat/story-21-a11y-verification`, off `main` — independent of PRs #131 and #132.

---

## 1. Why

Story 21 is a Phase 1 exit-gate item recorded in `docs/implementation/STATUS.md` as **NOT
RUN**: viewports, native 200% zoom, keyboard traversal, screen reader. It is the last
verification item standing between Phase 1 and a closed gate.

It is also demonstrably not theoretical. On 11 September a single duplicated design token
(`--color-muted` defined twice, the later winning) turned every `text-muted` into
cream-on-cream at a 1.13:1 contrast ratio, producing **373 axe violations** on the article
route. Nothing errored, nothing was undefined, unit tests passed, and the one test watching
that token kept passing because it read the first regex match while the browser applied the
last. The e2e accessibility job was the only thing that caught it.

That is the argument for this work: the automated a11y gate is the only layer that has
actually caught an accessibility regression here, and today it covers one viewport width and
the header's tab order.

## 2. What exists already

`apps/e2e/specs/r7-10-accessibility.spec.ts` covers, across the 9 routes in
`apps/e2e/r7-10-routes.ts`:

- zero critical or serious axe findings per route;
- no horizontal overflow and unexpected CLS ≤ 0.1 **at 380px only**;
- desktop header advances one Tab through explicit links and the locale switcher;
- mobile header keeps primary destinations inside its named dialog.

Reusable helpers in `apps/e2e/r7-10-accessibility.ts`: `tabTo`,
`hasMeaningfulFocusIndicator`, `installLayoutShiftObserver`, `readCLS`, `calculateCLS`,
`assertNoHorizontalOverflow`, `waitForRoute`, plus `AXE_EXCEPTIONS` /
`unapprovedViolations` / `formatAxeViolations`.

The app already ships a skip link (`href="#main-content"`) targeting
`<main id="main-content" tabIndex={-1}>` in `components/kinnso/SiteChrome.tsx`, and sets
`html lang` per locale in `app/[locale]/layout.tsx`.

So of story 21's four areas, **viewports** and **keyboard** are partly covered (one width,
header only) and **zoom** and **screen reader** are not covered at all.

## 3. Scope

### 3.1 Viewports

Extend beyond 380px to **380 / 768 / 1280 / 1440**. Per route, per width: no horizontal
overflow, unexpected CLS ≤ 0.1, `h1` still reachable. Reuses `assertNoHorizontalOverflow`
and the CLS observer unchanged.

### 3.2 Zoom — split into the two criteria it actually is

"200% zoom" is ambiguous, so it is modelled as the two WCAG success criteria it covers:

| Criterion | Modelled as | Asserts |
|---|---|---|
| **1.4.4 Resize text (AA)** | root font-size scaled to 200% at 1280px | no clipped text, no horizontal overflow |
| **1.4.10 Reflow (AA)** | viewport narrowed to 320 CSS px | no horizontal scrolling, key content still present |

Both vague phrases above are given exact meanings, because a plan cannot be written from
"no content loss":

- **"no clipped text"** — for every text-bearing element inside `main`, `scrollWidth`
  ≤ `clientWidth + 1` and `scrollHeight` ≤ `clientHeight + 1` (the 1px tolerance absorbs
  sub-pixel rounding). An element whose text is cut off by a fixed height or a non-wrapping
  container fails this.
- **"no horizontal scrolling"** — the existing `assertNoHorizontalOverflow` helper,
  unchanged, which is already the repo's definition.
- **"key content still present"** — the route's `h1`, its `main` landmark and its primary
  navigation remain in the accessibility tree and visible. This deliberately does not attempt
  to prove *no* content was lost, which is not decidable from the outside; it proves the
  specific things a reflowed page must retain.

320 CSS px is the standard's own definition of reflow, not an approximation of it. Text
resize is modelled by font scaling rather than browser chrome zoom, which Playwright cannot
drive.

**Both tests carry a comment saying they model zoom rather than drive native browser zoom**,
so a later reader cannot mistake them for a stronger claim than they make.

### 3.3 Keyboard

Beyond today's header-only traversal:

- the skip link is the first tab stop and actually moves focus into `#main-content`;
- focus is always visible (`hasMeaningfulFocusIndicator`, already built);
- no focus trap outside dialogs;
- dialogs trap focus and restore it to the invoking control on close;
- every interactive element inside `main` is reachable by keyboard — **bounded** as below.

"Every interactive element is reachable" is unbounded as written, so it is defined as: query
`main` for the standard interactive set (`a[href]`, `button`, `input`, `select`,
`textarea`, `[tabindex]:not([tabindex="-1"])`, `[role="button"]`, `[role="link"]`), excluding
`[disabled]`, `[aria-hidden="true"]` and elements with zero bounding boxes; then Tab at most
`count + 10` times and assert every one of them held focus at some point. The cap keeps a
page with a genuine trap from hanging the suite instead of failing it, and the existing
`tabTo` helper already establishes this polling idiom.

### 3.4 Screen reader — the machine-checkable half only

Structural facts an accessibility tree can prove:

- exactly one `main`, one `banner`, one `contentinfo` landmark;
- heading order contains no skipped levels;
- every interactive element has a non-empty accessible name;
- `html lang` matches the route's locale.

### 3.5 Explicitly out of scope

Whether announcements *sound* correct, screen-reader-specific quirks, and anything needing a
human ear. These belong to the manual checklist (§6), not to a test. This boundary is stated
in the spec and in the tests so no one later reads the automated suite as full screen-reader
coverage.

Coverage is all 9 manifest routes. Added runtime will be measured and reported rather than
allowed to creep; if the expensive keyboard traversal is material, it drops to a
representative subset and that reduction is recorded, not silent.

## 4. Architecture

### 4.1 Three spec files, one concern each

| File | Covers |
|---|---|
| `apps/e2e/specs/r7-10-reflow.spec.ts` | viewport widths, text resize 200%, reflow at 320px |
| `apps/e2e/specs/r7-10-keyboard.spec.ts` | skip link, tab order, focus visibility, traps, dialogs |
| `apps/e2e/specs/r7-10-structure.spec.ts` | landmarks, heading order, accessible names, lang |

Rejected: adding these to `r7-10-accessibility.spec.ts`, which already does four jobs and
would stop being readable as one thing.

### 4.2 Pure logic in helpers, page-driving in specs

`apps/e2e/specs/r7-10-accessibility-review.spec.ts` exists specifically to unit-test the
helpers in `r7-10-accessibility.ts`. Heading-order validation and clipping arithmetic become
pure functions there with fast unit tests; anything touching `page` stays in the spec. This
keeps the slow browser tests thin and the fiddly logic cheap to test.

### 4.3 The registration guard

`playwright.r7-10.config.ts` selects specs through an explicit `offSpecs` allowlist. Its own
comment records a spec that "executed nowhere" because it was not listed — a real past bug in
this repo.

`offSpecs` moves to a new plain data module `apps/e2e/r7-10-specs.ts`, imported by both the
config and a new contract test asserting that **every `specs/r7-10-*.spec.ts` on disk appears
in that list**.

A separate module rather than exporting from the config, because importing the config has
side effects: it reads `apps/web/.env.local` and mutates `process.env`. A test importing it
merely to check a list would drag all of that in. A data module has none.

### 4.4 The findings ledger

Mirrors the existing `AxeException` shape:

```ts
type A11yCheck =
  | 'viewport-overflow' | 'viewport-cls'          // §3.1
  | 'text-200' | 'reflow-320'                     // §3.2
  | 'skip-link' | 'keyboard-reachable'
  | 'focus-visible' | 'focus-trap' | 'dialog-focus' // §3.3
  | 'landmarks' | 'heading-order'
  | 'accessible-name' | 'html-lang'               // §3.4

interface A11yException {
  routeId: R710RouteId
  check: A11yCheck
  reason: string
  owner: string
  reviewWhen: string
}
```

The check names are a closed union covering exactly the assertions in §3, so a suppression
must name a check that actually exists and the compiler rejects a typo'd or invented one.

Each new test consults the ledger before failing. The contract test asserts the ledger's
**exact contents** — not merely that it is well-formed — so an entry cannot be added without
appearing in a diff, and every entry must carry a non-empty reason, owner and review date.

`AXE_EXCEPTIONS` is left untouched and still asserted empty. Two ledgers rather than one
generalised type: axe exceptions are keyed by rule id and CSS target and are consumed by
`unapprovedViolations`' node filtering; these are keyed by check name and suppress a whole
assertion. Merging them would mean one type where half the fields are meaningless in each
case.

## 5. Handling findings

The new tests will find pre-existing violations, and the count is unknowable until they run.

- **Contained fixes are made in this work** — a token, a focus style, a missing
  `aria-label`.
- **Anything needing real layout rework is recorded in the ledger** with reason, owner and
  review date.

CI lands green, nothing is hidden, and the ledger is the visible to-do list. This mirrors how
the repo already handles axe exceptions, and keeps this work a single reviewable PR instead
of an open-ended layout project.

## 6. The manual half

`docs/implementation/A11Y-SCREEN-READER-CHECKLIST.md`: per route, the exact steps to perform,
what should be announced, and a results table to fill in.

> **Correction, found during execution:** this spec also assumed `docs/implementation/STATUS.md`
> exists on `main`. It does not — that tree belongs to PR #131 and is not an ancestor of this
> branch. The partial-closure record therefore goes in the pull request description, and the
> STATUS.md entry follows once #131 merges.

**Story 21 will be closed partially, and STATUS.md will say so.** NVDA and VoiceOver cannot
be driven from this environment, so the honest end state is:

> automated portion closed and permanently gated; screen-reader portion scripted and pending
> a human pass.

The gate is not marked fully closed until a person runs the checklist and records the result.

## 7. Verifying the tests themselves

Every new assertion is **mutation-verified**: inject the defect it claims to catch (overflow
an element, remove a focus outline, skip a heading level, strip an `aria-label`), watch the
test fail, restore, watch it pass. Any scan-style assertion also asserts that it matched
something.

This is not ceremony. Four separate vacuous-test failures have already happened in this
codebase — a whole-tree scan that matched nothing and passed, a spec that executed nowhere, a
token guard that matched zero tokens, and a credit test that passed because a CHECK
constraint rejected its payload before the grant was ever exercised. A test that cannot fail
is worse than no test, because it reports safety.

The existing meta-test *"desktop visible focus structurally polls without fixed sleeps"* is
extended to cover the three new files.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Unknown violation count | Ledger absorbs it; CI green, backlog visible |
| Runtime growth on a ~7 min job | Measure and report; reduce keyboard traversal to a subset if material, and record the reduction |
| Flake against a live dev server | Reuse `waitForVisualSettlement` and existing polling helpers; no fixed sleeps, enforced structurally |
| Modelled zoom read as native zoom | Stated in the tests and here |

## 9. Rollout

Own branch off `main`, own PR. Independent of #131 (Phase 0-2, 110 files) and #132 (the
Dependabot CI fix), so merge order does not matter. Re-run after #131 lands so the new gates
cover its changes too.

### Files touched

**New:** `specs/r7-10-reflow.spec.ts`, `specs/r7-10-keyboard.spec.ts`,
`specs/r7-10-structure.spec.ts`, `r7-10-specs.ts`,
`docs/implementation/A11Y-SCREEN-READER-CHECKLIST.md`.

**Modified:** `playwright.r7-10.config.ts` (imports `offSpecs` instead of declaring it),
`r7-10-accessibility.ts` (new pure helpers, the `A11yException` ledger, and
`waitForVisualSettlement` moved here so all three new specs can use it),
`specs/r7-10-contract.spec.ts` (registration guard, ledger contents assertion, and the
extended no-fixed-sleeps meta-test — structural assertions belong with the other contract
checks, not with the helper unit tests),
`specs/r7-10-accessibility.spec.ts` (imports `waitForVisualSettlement` instead of declaring
it), `specs/r7-10-accessibility-review.spec.ts` (unit tests for the new pure helpers),
`docs/implementation/STATUS.md` (records the partial closure).

Plus whatever contained application fixes the new tests turn up (§5) — each independently
revertible, and each called out separately in the PR rather than folded into the test commit.

Rollback is deletion of the new files and reverting the modified ones; no application
behaviour changes except those explicitly listed fixes.
