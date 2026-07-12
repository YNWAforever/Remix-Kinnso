# Phase R7.0 Ground-Truth Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an evidence-backed `docs/r7-ground-truth.md` that answers all four R7.0 forensic tracks, classifies every audit finding, records access gaps, and fixes the R7.2 default flag values without changing production code or data.

**Architecture:** R7.0 is a documentation-only reconciliation layer across Git/GitHub, Vercel production, Supabase production, and the code graph. The report gives current live evidence priority over the external audit snapshot, uses stable commit/deployment/project identifiers, and hands settled defaults and defects to R7.1–R7.3 without pulling those sub-phases into this PR.

**Tech Stack:** Markdown, Git/`gh`, Vercel connected app/runtime logs, Supabase connected app/read-only SQL, PowerShell HTTP probes, pnpm 11, Vitest 4, Playwright.

## Global Constraints

- R7.0 changes documentation only: the approved design, this plan, and `docs/r7-ground-truth.md`.
- Do not modify app code, workflows, migrations, generated DB types, seeds, or fixtures.
- Do not mutate Vercel, Supabase production, Stripe, or GitHub repository settings.
- Never capture secret values; environment evidence is names/availability only.
- Do not POST to `/api/agent` because that writes production messages/rate-limit state.
- Do not create a Stripe Checkout Session because production has zero availability rows and Supabase production is read-only.
- Preserve the creator copilot, `copilot_messages`, all shipped migrations, and every content URL.
- Record unverified access as `ACCESS GAP`; never infer successful access from code alone.
- Before the PR: typecheck, lint, unit tests, locale parity, and the relevant 404 e2e must be green. The existing booking e2e is recorded as blocked by zero availability and is not run against read-only production during R7.0.

**Design spec:** `docs/superpowers/specs/2026-07-12-phase-r7-0-ground-truth-design.md`

## File structure

- Create `docs/r7-ground-truth.md`: the only R7.0 implementation artifact; contains access matrix, Tracks A–D, finding classifications, defaults, and downstream handoff.
- No test file is created. The red/green cycle is the report's absence followed by executable completeness, classification, secret, and repository checks.

---

### Task 1: Publish the R7.0 forensic report

**Files:**

- Create: `docs/r7-ground-truth.md`

**Interfaces:**

- Consumes: Phase R7 v1.1 sections 0.1 and 5, approved R7.0 design, `main` SHA `3889500a93642df1c9cccc4d1ef2fdf8ede13e74`, Vercel deployment `dpl_5cHby6SuCyjVhJXYTxG4yQXEwqE2`, Supabase project `scryfkefedzuetfdtrvl`.
- Produces: `AGENT_LIVE=true`, `BOOKING_LIVE=false`, `SESSIONS_LIVE=false`, the R7.1 code-defect handoff, the R7.3 honesty defaults, and explicit access limitations.

- [ ] **Step 1: Verify the report does not exist yet**

Run from the repository root:

```powershell
if (Test-Path 'docs/r7-ground-truth.md') {
  throw 'docs/r7-ground-truth.md already exists; inspect it before continuing'
}
throw 'RED: docs/r7-ground-truth.md is absent'
```

Expected: command fails with `RED: docs/r7-ground-truth.md is absent`.

- [ ] **Step 2: Create the complete report**

Create `docs/r7-ground-truth.md` with exactly this initial content:

````markdown
# Phase R7.0 — Ground Truth and Repository Forensics

**Observed:** 2026-07-12, Asia/Hong_Kong
**Repository:** `YNWAforever/Remix-Kinnso`
**Main SHA:** `3889500a93642df1c9cccc4d1ef2fdf8ede13e74`
**Production:** `https://remix-kinnso-web.vercel.app`
**Vercel deployment:** `dpl_5cHby6SuCyjVhJXYTxG4yQXEwqE2`
**Supabase project:** `scryfkefedzuetfdtrvl`

## Executive result

R1–R6 code and database capabilities are substantially shipped, and production runs the exact current `main` SHA. The guide and experience detail failures are therefore not a stale deployment or broad missing-migration problem. Vercel reports `DYNAMIC_SERVER_USAGE` for both routes; the shared code path is `createSupabaseServerClient()`, which calls Next.js `cookies()` from pages intended to be statically rendered. Phase R6A introduced that request-bound path into both route pages.

R7.2 defaults established from current capability evidence:

- `AGENT_LIVE=true`
- `BOOKING_LIVE=false`
- `SESSIONS_LIVE=false`

Production remains visibly inconsistent and contains fixture residue: the homepage advertises the live agent while `/agent` metadata says waitlist; booking is advertised while no availability exists; seeded guide-save counts have no backing rows; `picsum.photos`, `Jane Doe`, and test articles remain public; social-proof sections have no publishable content; destinations and sessions are primary-nav routes with no live rows; and the pre-pivot footer tagline remains.

## Required access

| Access | Result | Evidence and limitation |
|---|---|---|
| GitHub repository | Available with fallback | HTTPS Git fetch and `gh` work as `YNWAforever` with `repo` and `workflow` scopes. The connected GitHub app returns 404 for this private repository. |
| Vercel project | Partially available | Project, deployments, production SHA, HTTP responses, and runtime errors are readable through the connected app. Environment-variable names are an `ACCESS GAP`: this connector installation lacks env inventory, no CLI is installed, ephemeral CLI execution was rejected for supply-chain/credential risk, and browser startup was sandbox-blocked. |
| Supabase production | Available read-only | Project metadata, migrations, schema, RPCs, and row counts are readable. No production mutation was performed. |
| Stripe test mode | `ACCESS GAP` for direct API verification | Checkout code exists, but no local key is available and the live env-name audit is unavailable. More importantly, production has zero availability rows, so no valid Checkout Session can be created without mutating read-only production. |

## Track A — Program delta and Git history

### Shipped versus R1–R6 program

| Phase | Merged PRs | Shipped evidence | Current R7-relevant gap |
|---|---|---|---|
| R1 | #65, #66 | Design system/chrome, ten-section homepage structure, landings, agent waitlist, `platform_stats`, testimonials schema/ops | Stats bar currently suppresses all values; all testimonials are draft; stale/fabricated public content remains. |
| R2 | #67, #68, #69 | Merchant application, dashboard consolidation, experiences, public merchant surfaces | Five experiences exist but their detail pages currently 500. |
| R3 | #70, #71, #73, #74, #75 | Traveller role, booking core, Stripe Checkout/webhook, merchant pipeline, `/trips`, embedded CTAs, booking stats | Zero availability and bookings make booking not live. |
| R4 | #76, #78 | Anonymous traveller agent, grounded tools, persistence/rating path | Live chat and waitlist metadata disagree. A production POST was not sent because it would write data. |
| R5 | #79 | Sessions schema, public/Studio/ops surfaces, RSVP and replay paths | Zero session rows; `/sessions` renders an empty state and remains in primary navigation. |
| R6 | #80, #81, #82, #83 | Saves/reviews, curated destinations backend, cross-link overrides, testimonial rotation, destination experience section | R6A introduced the detail-page static-rendering regression; saves/reviews have zero rows; curated destinations has zero rows. |

### Merged pull-request ledger

| PR | Merged UTC | Title |
|---|---|---|
| #65 | 2026-07-02 15:26 | Phase R1 (A+B) — Editorial redesign: design system, chrome & 10-section homepage |
| #66 | 2026-07-03 14:30 | Phase R1C — original palette revert, landings & honest agent waitlist |
| #67 | 2026-07-03 16:55 | Phase R2A — Merchant application funnel |
| #68 | 2026-07-03 18:15 | Phase R2B — Dashboard consolidation + experiences |
| #69 | 2026-07-04 00:39 | Phase R2C — Public merchant surfaces |
| #70 | 2026-07-04 07:39 | Phase R3A-1 — Traveler role & booking-core data model |
| #71 | 2026-07-04 14:33 | Phase R3A-2 — Stripe Checkout, webhook, public booking widget |
| #73 | 2026-07-05 05:58 | Phase R3B — Merchant booking pipeline, commission ledger & /trips |
| #74 | 2026-07-05 07:28 | Land R3A-2 + R3B into main |
| #75 | 2026-07-05 14:23 | Phase R3C — Embedded experience CTAs, social-proof bookings count, Travelpayouts repair job |
| #76 | 2026-07-06 02:14 | Phase R4 — Traveller AI Agent v1 |
| #78 | 2026-07-06 02:42 | Land Phase R4 into main |
| #79 | 2026-07-08 19:58 | Phase R5 — Community Sessions P1 |
| #80 | 2026-07-12 03:23 | Phase R6A — Saves & Reviews |
| #81 | 2026-07-12 03:24 | Phase R6B — Destinations Browse |
| #82 | 2026-07-12 10:02 | Phase R6C — Cross-link editorial overrides + testimonial rotation |
| #83 | 2026-07-12 11:45 | R6B follow-up — destination experience section |

`git log --oneline --merges --since=2026-07-02` returns no phase entries because these PRs were squash-merged. The GitHub merged-PR ledger is authoritative.

### Work in flight

- Open pull requests: 0.
- Remote refs not ancestral to `origin/main`: 51.
- The newest non-ancestral refs correspond to already squash-merged R6/R5/R4 source branches. They are stale/squash-source refs, not open work that R7 must avoid.

### Last-touch evidence for the broken funnel

| Path | Last commit | Meaning |
|---|---|---|
| `apps/web/app/[locale]/g/[slug]/page.tsx` | `90ac420` Phase R6A | Added viewer save/review personalization to the guide page. |
| `apps/web/app/[locale]/experiences/[slug]/page.tsx` | `90ac420` Phase R6A | Added viewer save/review personalization to the experience page. |
| `apps/web/lib/supabase/server.ts` | `3438748` | Shared SSR client calls `cookies()`; old stable helper, newly imported by the two R6A pages. |
| `apps/web/lib/reviews/queries.ts` | `90ac420` Phase R6A | Shared secondary review queries added with R6A. |

## Track B — Deployment and environment parity

### Production SHA

- Vercel project: `remix-kinnso-web` (`prj_oc75yCcO9hGAoJ8tmzZC5C1JB27F`).
- Production deployment: `dpl_5cHby6SuCyjVhJXYTxG4yQXEwqE2`, state `READY`.
- Deployment Git SHA: `3889500a93642df1c9cccc4d1ef2fdf8ede13e74`.
- Current `main` SHA: `3889500a93642df1c9cccc4d1ef2fdf8ede13e74`.
- Conclusion: stale deployment is ruled out; redeploying unchanged `main` will not clear the audit failures.

### Live route probes

| Route | HTTP | Result |
|---|---:|---|
| `/en/g/busan-jagalchi-seafood-market` | 500 | Published guide fails. |
| `/en/experiences/tokyo-after-hours-izakaya-crawl` | 500 | Published experience fails. |
| `/en/g/definitely-not-a-real-guide-r7` | 404 | Unknown slug already behaves correctly. |
| `/en/agent` | 200 | Live chat renders with `configured=true`. |
| `GET /api/agent` | 405 | Expected: the route implements POST only. |
| `/en` | 200 | Contains `Live now`, `Try the AI Agent`, booking-live promise, `picsum.photos`, and the stale footer tagline. |
| `/en/destinations` | 200 | Backed by zero published destination rows, so no destination cards render. |
| `/en/sessions` | 200 | Renders `No sessions` while still linked in primary navigation. |
| `/en/c/creator` | 200 | Direct public fixture profile remains reachable. |
| `/en/creators` | 200 | `@creator` is already absent from the directory listing. |
| `/en/articles/dining/pub-article` | 200 | Public QA fixture title `Published EN` remains. |
| `/en/articles/dining/ramen-guide` | 200 | Public `Jane Doe` byline and `picsum.photos` imagery remain. |

### Runtime root cause

Vercel groups both leaf failures under:

- routes: `/[locale]/g/[slug]`, `/[locale]/experiences/[slug]`
- digest: `DYNAMIC_SERVER_USAGE`
- latest affected deployment: `dpl_5cHby6SuCyjVhJXYTxG4yQXEwqE2`

Both pages call `createSupabaseServerClient()`. That helper begins with `await cookies()`, introducing request-bound state into pages that are expected to remain statically generated. The primary public entity fetch succeeds independently; the failure was introduced when R6A added viewer-specific saved/auth state to both pages.

**Classification:** `RECLASSIFIED (drift: code/rendering-mode defect)`.

### Environment inventory

Names required by the checked-in web template include Supabase public/server keys, site/revalidation/cron values, Stripe secret/webhook values, and AI Gateway configuration. Their live Vercel presence cannot be enumerated safely with the available tooling and is recorded as `ACCESS GAP`.

The failure is not classified as env drift because Vercel supplies the exact `DYNAMIC_SERVER_USAGE` digest and the same shared `cookies()` call path explains both routes.

## Track C — Database parity

### Migration history

- Local migration files: 87.
- Production migration history rows: 91.
- Exact version/name matches: 17.
- Most pre-R4 migrations were applied under different timestamps, names, and segmentation. Production has four more history rows overall.
- Conclusion: schema capability is present, but migration filename/version parity is not clean. Future linked migration work must preserve this history and must not assume `supabase migration list` will be one-to-one without an explicit reconciliation decision.

### Required objects

| Object | Present | Current rows/state |
|---|---:|---|
| `experiences` | yes | 5 published |
| `experience_availability` | yes | 0 |
| `bookings` | yes | 0 |
| `guide_saves` | yes | 0 |
| `reviews` | yes | 0 |
| `community_sessions` | yes | 0 |
| `testimonials` | yes | 3 draft, 0 published |
| `destinations` | yes | 0 |
| `traveler_profiles` | yes | 0 |
| `platform_stats()` | yes | 5 creators, 8 guides, 0 destinations, 0 sessions, 0 bookings |
| `search_guides()` | yes | callable RPC exists |
| `search_experiences()` | yes | callable RPC exists |
| `confirm_booking_from_webhook()` | yes | service flow RPC exists |

All listed public tables have RLS enabled. Broad migration drift is ruled out as the detail-page 500 cause because every dependency exists with the expected R1–R6 shape.

## Track D — Capability checklist

| Capability | Ground truth | R7 default/action |
|---|---|---|
| Guide/experience leaf routes | Published rows 500; unknown guide 404 | `CONFIRMED`, reclassified to code defect; R7.1 fixes static/request boundary and adds regressions. |
| Booking | Checkout/webhook/data model and `/trips` exist; 0 availability and 0 bookings | `BOOKING_LIVE=false`; a valid test Checkout cannot be created without ops inventory. |
| Traveller agent | Page and POST route exist; live page is configured; route has grounded guide/article/experience tools | `AGENT_LIVE=true`; no production POST during read-only R7.0. |
| Saves | `guide_saves` exists with 0 rows; guides show seeded counts from 128 to 289 | R7.3 default: hide UI and zero seeded values rather than recompute. |
| Platform stats/testimonials | RPC exists; 5 creators/8 guides; all three testimonials draft | Stats/testimonials do not produce meaningful visible proof; R7.4 supplies qualitative fallback and audience surfaces. |
| Sessions | Full schema and UI exist; 0 rows | `SESSIONS_LIVE=false`; hide primary-nav item and retain honest empty state. |
| Traveller sign-up | `/[locale]/sign-up` exists; inactive blank creator rows resolve as traveller | Traveller-default sign-up exists, enabling R7.6 neutral `Sign up`. |
| Mock modules | No direct public route imports `lib/creator-mock`; Studio scan and dormant/shared components retain imports | R7.3 checks public reachability and removes rendered fixture sources, not unrelated private Studio data blindly. |

## Audit-finding classification matrix

| Audit finding | Classification | Evidence and destination |
|---|---|---|
| Published guides and experiences 500 | `RECLASSIFIED (drift: code/rendering-mode defect)` | Exact current deployment; Vercel `DYNAMIC_SERVER_USAGE`; R6A route changes call `cookies()`. R7.1. |
| Unknown slugs should 404 | `RESOLVED — regression test required in R7.1` | Unknown guide returns 404 today. |
| Homepage agent live versus `/agent` waitlist metadata | `CONFIRMED` | Homepage contains `Live now`; live agent page renders chat while title/description still say waitlist. R7.2. |
| Booking live versus coming-soon claims | `CONFIRMED` | Homepage promises booking; both landings say booking is coming; zero availability means booking is not live. R7.2. |
| Random placeholder imagery | `CONFIRMED` | Homepage and ramen article HTML contain `picsum.photos`. R7.3. |
| Seeded saves | `CONFIRMED` | Zero `guide_saves`; published guide counters 128–289. R7.3. |
| Public `@creator` fixture | `CONFIRMED` | The fixture is already absent from `/creators`, but `/en/c/creator` still returns 200. R7.3 decides direct-profile eligibility without changing frozen URLs. |
| QA/thin fixture articles | `CONFIRMED` | `pub-article`, `sushi-guide`, `cafe-guide`, and `ramen-guide` are published. `Published EN` renders publicly. R7.3. |
| `Jane Doe` byline | `CONFIRMED` | `ramen-guide` stores author `jane-doe` and renders `Jane Doe`. R7.3. |
| Example-domain links | `CONFIRMED` | The database audit identified example-domain residue; rendered samples were not found in the two checked articles. R7.3 performs full write-time validation and cleanup rather than relying on two page samples. |
| Missing social proof/testimonials | `CONFIRMED` | Stats bar returns null because fewer than two metrics meet thresholds; 0 published testimonials. R7.4. |
| Empty destinations primary-nav route | `CONFIRMED` | Route 200, curated destinations table 0 rows, no cards. R7.5 reconciles shipped R6 backend with live inventory. |
| Empty sessions primary-nav route | `CONFIRMED` | Route 200 with `No sessions`; table 0 rows. R7.2/R7.5. |
| Pre-pivot footer tagline | `CONFIRMED` | `AI Travel Content Studio · Pays creators · Hong Kong · Taipei · Tokyo` renders on public pages. R7.6. |

## Fixed defaults for R7.2

| Flag | Default | Reason |
|---|---:|---|
| `AGENT_LIVE` | `true` | Live anonymous chat surface and POST route are deployed and configured on Vercel. |
| `BOOKING_LIVE` | `false` | Zero open/future availability means no user can complete the booking funnel. |
| `SESSIONS_LIVE` | `false` | Zero scheduled or replay session rows. |

## Downstream handoff

### R7.1

- Treat the 500 as a static/request-boundary regression introduced by R6A.
- Read the installed Next.js 16.2.9 docs before code changes.
- Keep primary public content on `createSupabasePublicClient()`.
- Isolate viewer-specific save/auth/email state behind a static-safe boundary.
- Let availability, ratings, reviews, cross-links, and JSON-LD degrade by omission when their secondary read fails.
- Add route-segment `error.tsx`, unknown-slug regression tests, smoke funnel, and nightly sitemap crawl.

### R7.2

- Use the three fixed defaults above.
- Make homepage and `/agent` metadata/body consume one `AGENT_LIVE` source.
- Keep booking claims OFF until real availability and test Checkout evidence exist.
- Hide Sessions from primary navigation while keeping the empty-state URL.

### R7.3

- `guide_saves` has no rows: hide counts and zero seeded denormalised values.
- Preserve the already-working directory exclusion for `@creator`; address direct-profile eligibility deliberately.
- Unpublish `pub-article` and only those dining fixtures failing the locked content threshold.
- Remove `picsum.photos`, `Jane Doe`, and example-domain residue with permanent CI lint.

## Reproduction references

Code references:

- `apps/web/app/[locale]/g/[slug]/page.tsx:41`
- `apps/web/app/[locale]/experiences/[slug]/page.tsx:29`
- `apps/web/lib/supabase/server.ts:9`
- `apps/web/lib/agent/config.ts:6`
- `apps/web/app/api/agent/route.ts:33`
- `apps/web/lib/experiences/booking-actions.ts:54`
- `apps/web/app/[locale]/sign-up/SignUpForm.tsx:38`
- `apps/web/lib/auth/viewer-role.ts:11`
- `apps/web/components/kinnso/home/StatsBar.tsx:11`

No secret values, production writes, Checkout Sessions, agent messages, or database rows were created while collecting this evidence.
````

- [ ] **Step 3: Run the report completeness and classification checks**

Run:

```powershell
$path = 'docs/r7-ground-truth.md'
$required = @(
  '## Required access',
  '## Track A — Program delta and Git history',
  '## Track B — Deployment and environment parity',
  '## Track C — Database parity',
  '## Track D — Capability checklist',
  '## Audit-finding classification matrix',
  '## Fixed defaults for R7.2',
  'AGENT_LIVE',
  'BOOKING_LIVE',
  'SESSIONS_LIVE',
  'ACCESS GAP',
  'CONFIRMED',
  'RESOLVED',
  'RECLASSIFIED'
)
$text = Get-Content -Raw $path
$missing = $required | Where-Object { -not $text.Contains($_) }
if ($missing) { throw "Missing required report content: $($missing -join ', ')" }
Write-Output 'R7.0 report completeness: PASS'
```

Expected: `R7.0 report completeness: PASS`.

- [ ] **Step 4: Run the documentation secret-shape and formatting checks**

Run:

```powershell
git diff --check
rg -n 'gho_|github_pat_|sk_(live|test)_|pk_(live|test)_|whsec_|sb_secret_|service_role=' docs/r7-ground-truth.md
```

Expected: `git diff --check` exits 0; `rg` returns no matches.

- [ ] **Step 5: Commit the forensic report**

```powershell
git add docs/r7-ground-truth.md
git commit -m "docs(web): record Phase R7.0 ground truth"
```

Expected: one commit containing only `docs/r7-ground-truth.md`.

---

### Task 2: Verify the repository-required quality baseline

**Files:**

- Verify only: no file changes expected.

**Interfaces:**

- Consumes: repository package scripts, `apps/web/tests/i18n.locale-parity.test.ts`, `apps/e2e/specs/notfound.spec.ts`.
- Produces: recorded green baseline for typecheck, lint, unit tests, locale parity, and relevant production 404 behavior.

- [ ] **Step 1: Install the pinned workspace dependencies**

Run:

```powershell
pnpm install --frozen-lockfile
```

Expected: pnpm 11.6.0 completes without changing `pnpm-lock.yaml`.

- [ ] **Step 2: Run typecheck and lint**

Run:

```powershell
pnpm typecheck
pnpm lint
```

Expected: both commands exit 0. Existing warnings may be recorded, but any error blocks the PR.

- [ ] **Step 3: Run the unit suite and explicit locale-parity test**

Run:

```powershell
pnpm test
pnpm --filter web test -- i18n.locale-parity
```

Expected: both commands exit 0; locale parity covers every top-level dictionary group across all seven locales.

- [ ] **Step 4: Run the relevant production 404 e2e**

Run:

```powershell
$env:E2E_BASE_URL = 'https://remix-kinnso-web.vercel.app'
pnpm --filter @kinnso/e2e e2e notfound
Remove-Item Env:E2E_BASE_URL
```

Expected: all existing `notfound.spec.ts` cases pass. The guide-specific unknown-slug case is added in R7.1, where the route code changes.

- [ ] **Step 5: Record the intentionally blocked booking e2e**

Do not run `booking.spec.ts` against production during R7.0. The fixture requires an open future `experience_availability` row and creates Stripe/Supabase state; production has zero availability and read-only database scope.

Expected: `docs/r7-ground-truth.md` already records this as `BOOKING_LIVE=false` and a direct Stripe-access gap rather than claiming the funnel passed.

---

### Task 3: Final scope and evidence review

**Files:**

- Verify: `docs/superpowers/specs/2026-07-12-phase-r7-0-ground-truth-design.md`
- Verify: `docs/superpowers/plans/2026-07-12-phase-r7-0-ground-truth.md`
- Verify: `docs/r7-ground-truth.md`

**Interfaces:**

- Consumes: committed R7.0 documentation and verification outputs.
- Produces: a PR-ready, documentation-only branch.

- [ ] **Step 1: Confirm the branch diff is documentation-only**

Run:

```powershell
git diff --name-only origin/main...HEAD
```

Expected output contains exactly:

```text
docs/r7-ground-truth.md
docs/superpowers/plans/2026-07-12-phase-r7-0-ground-truth.md
docs/superpowers/specs/2026-07-12-phase-r7-0-ground-truth-design.md
```

- [ ] **Step 2: Confirm every R7.0 exit condition is explicit**

Run:

```powershell
$text = Get-Content -Raw 'docs/r7-ground-truth.md'
$checks = @{
  'all four access rows' = ([regex]::Matches($text, '\| (GitHub repository|Vercel project|Supabase production|Stripe test mode) \|').Count -eq 4)
  'all four tracks' = ([regex]::Matches($text, '^## Track [A-D] ', 'Multiline').Count -eq 4)
  'three flag defaults' = ($text.Contains('AGENT_LIVE') -and $text.Contains('BOOKING_LIVE') -and $text.Contains('SESSIONS_LIVE'))
  'finding matrix' = $text.Contains('## Audit-finding classification matrix')
  'R7.1 handoff' = $text.Contains('### R7.1')
  'R7.2 handoff' = $text.Contains('### R7.2')
  'R7.3 handoff' = $text.Contains('### R7.3')
}
$failed = $checks.GetEnumerator() | Where-Object { -not $_.Value }
if ($failed) { throw "R7.0 exit check failed: $($failed.Name -join ', ')" }
Write-Output 'R7.0 exit conditions: PASS'
```

Expected: `R7.0 exit conditions: PASS`.

- [ ] **Step 3: Review the final commits and clean state**

Run:

```powershell
git log --oneline origin/main..HEAD
git status --short --branch
```

Expected: the design, plan, and ground-truth commits are present; no uncommitted files remain.

- [ ] **Step 4: Push and open the R7.0 PR**

Push branch `codex/r7-0-ground-truth` and open a ready-for-review PR:

- Title: `Phase R7.0 — Ground-truth verification & repo forensics`
- Base: `main`
- Body: summarize the code-defect classification, exact production SHA parity, Supabase migration-history divergence, access gaps, and fixed flag defaults; include verification results.

Expected: PR checks are green and the changed-files list remains documentation-only.

- [ ] **Step 5: Squash merge only after checks pass**

Expected: GitHub reports the PR merged into `main`; local `main` is then fast-forwarded and the production/deployment state remains unchanged because R7.0 contains no runtime changes.
