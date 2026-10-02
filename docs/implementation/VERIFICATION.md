# VERIFICATION — acceptance stories

**Source revision:** branch `claude/phase01-canonical-frontend`, based on `e086fbfc`.
**Date:** 11 September 2026.

Grades: **PASS / FAIL / BLOCKED / NOT RUN**. Capability mode: **LIVE / DEMO / UNAVAILABLE**.
"LIVE" means a service actually executed — not that source exists, not that a build passed.

Gate and suite results live in `BASELINE-VERIFICATION.md`; this file records the plan's
acceptance stories with actor, viewport and evidence.

---

## Environment for the browser results

| | |
|---|---|
| Server | `next dev` (Next.js 16.2.9, Turbopack) on `http://localhost:3000` |
| Flags | `AGENT_LIVE=false`, `BOOKING_LIVE=false` — the same safe pair CI uses |
| Database | local Docker Supabase `kinnso-v3`, all 146 migrations applied |
| Browser | in-app Chromium pane |
| Actors | **anonymous only** — no authenticated browser session was established |
| Data | synthetic, seeded locally: creator `@browsercheck`, destinations `tokyo`/`seoul`, guides `tokyo-coffee` / `seoul-market` |

The seed matters: the catalogue was genuinely empty before it, and that empty state is itself
recorded below as evidence.

---

## Results

| # | Story | Grade | Evidence |
|---|---|---|---|
| 1 | Search → correct card/detail/source; **back/refresh and language aliases retain query** | **PASS** (browser) | §1 |
| 2 | Absent destination → true empty; no unrelated fallback; distinguish an API failure | **PASS** (unit + browser) | §2 |
| 3 | Bookmark vs adopt → independent saved count / trip list | **PARTIAL** | Return-to-task and failure honesty done (S1, S5). **Adopt does not exist** — Phase 2. |
| 18 | Injected failed live read stays an error with retry, never demo or false empty | **PASS** (unit) | `explore.host.test.tsx` asserts both reads propagate; `/explore` has a localized `error.tsx` |
| 20 | Same-origin sign-in returns to safe intent | **PASS** (unit) | `auth.return-path`, `auth.gate`, `auth.proxy-gate`, save-button suites |
| 21 | 390×844, 768×1024, 1440×900 at 100% zoom | **PASS** for these three widths | §3 |
| 21 | Native 200% zoom, keyboard-only, screen reader, reduced motion, safe areas | **NOT RUN** | Not attempted |
| 16 | Merchant sees scoped evidence; private data inaccessible | host-level only | `privacy.merchant-scoping.test.ts`; no cross-account live-DB proof |
| 11–15, 17 | Claims, redemption, earnings, booking | **NOT RUN** | Phase 5 / Phase 7 scope |

---

## §1 — Story 1, back navigation (the one worth reading)

Executed in the browser against seeded data:

| Step | URL | `history.length` | Grid |
|---|---|---|---|
| Load `/en/explore` | `/en/explore` | 4 | Tokyo **and** Seoul |
| Click the "Tokyo" destination filter | `/en/explore?destination=tokyo` | **5** | Tokyo only |
| Browser **Back** | `/en/explore` | 5 | Tokyo **and** Seoul; radio reset to "All destinations" |

Two things are proven here that unit tests alone cannot show:

1. `history.length` went 4 → **5**, so the change was *pushed*. Before this work every state
   change used `replaceState`, and a single Back left `/explore` entirely.
2. On Back the URL **and** the grid moved together. Without the `popstate` listener the URL
   would have reverted while the grid still showed only Tokyo — the visible filters
   describing a result set no longer on screen.

Refresh and locale switching were already correct (`LocaleSwitcher` appends
`window.location.search`) and were not the defect.

---

## §2 — Story 2, honest empty state

Before seeding, `/en/explore` rendered: *"0 guides · All guides · More guides are added every
week."* No fabricated cards, no demo fallback, no error styling — a true empty catalogue
presented as empty. After seeding, the same route rendered both guides and both destination
filters. Empty and populated are visibly different states, and neither is invented.

The *failure* half of stories 2/18 is unit-verified rather than browser-verified: injecting a
read failure is covered in `explore.host.test.tsx`, and `/explore` now has the localized
`DetailRouteError` boundary.

---

## §3 — Story 21, viewports

| Viewport | Observed |
|---|---|
| 390×844 | Hamburger nav, single-column grid, search + Filters control stacked. No horizontal overflow. |
| 768×1024 | Hamburger nav (desktop chrome is gated at `xl:` by design), two-column grid. |
| 1440×900 | Full nav row, filter rail beside the grid. |

**Limits, stated plainly.** These are CSS viewport emulations in one Chromium pane at 100%
zoom, anonymous, on one route. They are **not** evidence of native 200% zoom, keyboard-only
operation, screen-reader labelling, reduced motion, mobile safe areas, or iOS Safari /
Android Chrome. Plan §14 is explicit that emulation does not establish those, and they
remain **NOT RUN**.

---

## What this does not establish

- **No authenticated browser journey.** Every browser result above is anonymous. Signed-in
  traveller, creator, merchant and ops journeys are verified only by host/component tests.
- **No production or hosted environment was contacted**, and no provider (Travelpayouts,
  Stripe, AI gateway) was called.
- **`pnpm build` was never run.**
- The live-DB suites remain unmeasurable on this host — `BASELINE-VERIFICATION.md` §3.2.
