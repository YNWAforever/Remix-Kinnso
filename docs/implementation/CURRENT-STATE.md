# CURRENT-STATE — Phase 0 reconciliation

**Produced:** 11 September 2026 (Hong Kong time)
**Canonical repository:** `YNWAforever/Remix-Kinnso`
**Baseline commit:** `e086fbfc4e2bc4447dc9bbbe71af1290c866adaf` (== `origin/main` at execution time)
**Working branch:** `claude/phase01-canonical-frontend` (branched from `origin/main`)
**Superseded branch preserved at:** `claude/kinnso-phased-implementation-42478b` = `87f626936c3dfbc302c6fe18d0afa79bca70bed0`

This document records what was **actually observed** in the repository and in a local
environment. It distinguishes *source exists* / *wired into a route* / *covered by an
executing test* / *verified against a live service*. It is not a design document.

---

## 1. Branch reconciliation (plan §1.1 "preserve newer changes")

The worktree was handed over on branch `claude/kinnso-phased-implementation-42478b`
at `87f62693`. That branch is **not** the newest work.

| Fact | Value |
|---|---|
| Worktree HEAD at handover | `87f62693` |
| `origin/main` | `e086fbfc` |
| Merge base | `f3040513` ("fix(web): tolerate pending destination view migration (#92)") |
| Commits on `origin/main` **missing** from the handover branch | **36** |
| Commits on the handover branch missing from `origin/main` | 7 |

The 36 missing commits are real product work: R7.6 navigation/footer, R7.7 profile &
enquiries, R7.8 SEO metadata, R7.9 explore usability, R7.10 accessibility, R8.0–R8.2
measurement & ops analytics, R9.x, R10.0 unified earnings read model, R10.1 settlement
minting, R10.2 payout handoff, R10.3 notifications, R11.0–R11.2 mission review /
verification-gated triage / merchant budget backing, R12.0 the visit loop,
R12.1 attribution hardening, R12.2 receipt cashback, R13.0 mission brief richness.

All **7** handover-branch commits were verified file-by-file to be superseded upstream:

| Handover commit | Disposition | Evidence |
|---|---|---|
| `cd93fb78` docs: ops authorization architecture design | **Identical** upstream | `git diff main origin/main -- docs/superpowers/specs/2026-08-08-ops-authorization-context-design.md` → empty |
| `5cfd1b66` + `85f44e62` + `604af0dc` ops authorization plan doc | **Older** than upstream | Upstream version is the *fail-closed* revision: role-query errors become a context-only `indeterminate` state instead of "absent facts". Strictly stronger. |
| `1169de44` ci: secret-free web build gate | **Superseded** by a hardened superset | Upstream `.github/workflows/ci.yml:136-147` already has *Check web build environment* + *Build web with safe product flags* (`AGENT_LIVE=false`, `BOOKING_LIVE=false`), plus SHA-pinned actions, an awk validator asserting exactly two `NEXT_PUBLIC_` lines, and explicit exclusion of `SUPABASE_SERVICE_ROLE_KEY`. |
| `49c0854a` + `87f62693` creator perks page gate refactor **and its revert** | **Net zero** locally; landed properly upstream | The handover tree's `studio/perks/page.tsx` is byte-identical to the merge base. `origin/main` has the centralized `requireCreatorPage(supabase, loc)` version. |

**Decision:** work continues from `origin/main`. Nothing unique was discarded; the old
branch pointer is untouched and still reachable.

---

## 2. Verified environment

| Item | Observed | Note |
|---|---|---|
| Node | **v24.18.0** | `.nvmrc` pins **22**; CI uses 22. **Version drift — see risks.** |
| pnpm | 11.6.0 via corepack | `pnpm` is **not** on PATH in this shell; turbo shells out to a real binary, so a corepack shim directory must be on PATH or every `turbo run <task>` fails with `Unable to find package manager binary`. |
| Docker | 29.7.2, running | Required for the local Supabase stack. |
| Local Supabase | **started, 146/146 migrations applied** | Project id `kinnso-v3`, API port **54421** (deliberately shifted +100 to avoid colliding with sibling local stacks — `supabase/config.toml:11-13`). Other worktrees on this machine run their own stacks concurrently. |
| Next.js | 16.2.9 | `apps/web/AGENTS.md` warns this is **not** the Next.js in training data and that `node_modules/next/dist/docs/` must be read before writing Next code. |
| React | 19.2.4 | |

---

## 3. Repository shape (measured, not estimated)

| Metric | Count |
|---|---|
| `apps/web` page routes (`page.tsx`) | 93 |
| `apps/web` API routes (`route.ts`) | 11 |
| `apps/web` test files | 501 executed by vitest |
| `supabase/migrations/*.sql` | 146 |
| Live public tables | 70 (+2 views) — 71 created, 1 dropped |
| Tables with RLS enabled | **all of them** (set difference empty in both directions) |
| `SECURITY DEFINER` functions | 109 distinct names, all with an explicit `search_path` |
| Locales | **7** — `en`, `zh-hk`, `zh-tw`, `ja`, `ko`, `th`, `zh-cn` |
| `components/kinnso/pages/*` view components | 51 |
| `components/ui/*` primitives | 18 |

Workspace packages: `apps/{web,scan,sync,e2e}`, `packages/{db,honesty,parity,scan,sync}`.

---

## 4. Baseline gate results (this machine, commit `e086fbfc`)

| Gate | Result | Evidence |
|---|---|---|
| `pnpm install --frozen-lockfile` | **PASS** | "Done in 40.4s using pnpm v11.6.0" |
| `pnpm typecheck` | **PASS** | 8/8 turbo tasks successful, exit 0 |
| `pnpm lint` | **PASS** | 0 errors, 28 warnings, exit 0 |
| `pnpm honesty:lint` | **PASS** | exit 0 |
| `pnpm test` (no `.env.test`) | **FAIL — environment, not code** | `apps/web/vitest.setup.ts:50-52` throws `Set apps/web/.env.test (SUPABASE_URL etc.) before running integration tests`. This aborts **all 501** web test files at module load (`Test Files 501 failed`, `tests 0ms`). Non-web packages still pass. |
| `pnpm test` (local stack armed) | see `BASELINE-VERIFICATION.md` | |

**Correction to the plan.** Plan §14.1 lists `pnpm test` among "verified baseline
commands". On a clean checkout it cannot pass: the entire `apps/web` suite — including
pure unit tests with no database dependency, e.g. `tests/auth.safe-next.test.ts` — is
gated behind a hard throw requiring Supabase credentials.

### 4.1 How the local test environment was armed

Reproducing `.github/workflows/ci.yml:45-135` exactly:

1. `pnpm supabase start` (applies all 146 migrations + `supabase/seed.sql`).
2. Delete the two e2e-only fixtures from `auth.users`
   (`…0701` `r7-smoke-creator@example.test`, `…0702` `r7-smoke-merchant@example.test`) —
   the same statement CI runs at `ci.yml:75-81`.
3. `supabase status -o env` → `apps/web/.env.test`, `packages/sync/.env.test`,
   `apps/scan/.env.test`.
4. Append `SUPABASE_DB_CONTAINER=<id>` and `RUN_R7_3_LOCAL_LIVE_TESTS=1` to
   `apps/web/.env.test`. **Without these two the RLS and production-honesty suites
   `describe.skip` themselves and report green while untested** (CI comments this
   explicitly at `ci.yml:154-163`).
5. Derive `apps/web/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` only).

All `.env*` files are gitignored (`apps/web/.gitignore:34`), confirmed with
`git check-ignore -v`. No secret value is recorded in this repository.

---

## 5. Evidence-grade corrections to the master plan

The master plan was prepared against `e086fbfc` but describes a substantially thinner
application than the one that exists. The load-bearing corrections:

1. **No AdventureLog code exists in this repository.** `git grep -il` for
   `adventurelog|imageMapPin|stopsToGeoJson` over tracked files returns **zero** real
   hits (apparent matches are substring collisions such as `missin`**`gPl`**`atforms`).
   There is **no `LICENSE` file**. Plan §3.4's "preserve actual reuse" does not describe
   this codebase: the reuse lives in the *Site's* corresponding-source package. Porting
   `imagePins.ts` into `apps/web` would **introduce** a GPL obligation into an
   application that currently has none. That is an owner decision, not an implementation
   detail. **No such port has been made.**
2. **There is no trips / journals / itinerary domain.** No `trips`, `trip_stops`,
   `journal`, or media-asset tables exist. `/[locale]/trips` is a read-only list of the
   viewer's bookings plus saved guides and experiences. Phase 2 is genuinely greenfield.
3. **Seven locales, lowercase.** URL casing is `zh-hk`, never `zh-HK`. The Site's two
   locales must not become the canonical set.
4. **Guides are flat and unversioned.** `public.guides` is a single mutable row with a
   two-value status; publishing is an in-place `UPDATE`. There is no version table.
5. **Discovery does not use the search RPCs.** `search_guides` / `search_experiences`
   exist and are granted, but `/explore` fetches the entire published catalogue and
   filters with `String.includes` in the browser (`lib/explore/discovery.ts`). The only
   caller of the RPCs is the AI agent (`lib/agent/tools.ts:31`).
6. **80 of 82 `db.*.test.ts` files are static text assertions** over migration file
   contents (`readFileSync` + `expect(sql).toContain(...)`). They pass with no database
   running. Real execution coverage exists only in the `*.rls.test.ts` files, which
   require the armed local stack. This is the anti-pattern plan §14 warns against.
7. **There is no durable job queue.** All background work is unawaited in-process
   promises in a single Hono worker (`apps/scan`). No queue dependency in any
   `package.json`.
8. **No structured AI proposals exist.** No `proposal` / `accept` / `skip` symbol, table,
   column or RPC anywhere. The agent exposes exactly three **read-only** search tools.
9. **Deep green is not in the palette.** Cream and orange are canonical; the only green
   token is a semantic status colour.
10. **No photography ships with the app** and there is **no provenance/credit metadata**
    on any image — not in the database, domain types, or component props.
11. **A "campaign" entity does not exist.** Missions are the only commercial work object,
    and there is no mission *update* action anywhere — briefs cannot be revised after
    creation.
12. **Earnings have 2 of the plan's 8 states.** `mission_settlements.creator_payout_status`
    is constrained to exactly `('pending','paid')`. There is **no reservation of any
    kind** on payout batches — `creator_payout_batches` has no settlement linkage.

---

## 6. Capability modes observed today

| Capability | Mode | Gate |
|---|---|---|
| Catalogue / guides / destinations / articles / sessions | LIVE (local stack) | — |
| Saves (guides, experiences) | LIVE (local stack) | `guide_saves`, `experience_saves` |
| Identity / roles | LIVE (local stack) | `getAuthorizationContext` |
| Missions / offers / claims / redemption / settlements | LIVE (local stack) | — |
| Traveller AI agent | flag `AGENT_LIVE` (default **true**) | needs `AI_GATEWAY_API_KEY` or `VERCEL=1` at build (`lib/env.ts:44-46`) |
| Native booking | flag `BOOKING_LIVE` (default **false**) | **remains off** — plan §12 gate not attempted |
| Community sessions | data-derived `sessionsLive` | `lib/product-state.ts` |
| Traveller measurement | `NEXT_PUBLIC_ANALYTICS_MODE` / `ANALYTICS_INGEST_MODE` | disabled until separately activated |

`lib/product-state-config.ts` is the single source of truth for `AGENT_LIVE` /
`BOOKING_LIVE`; it **throws** on any value other than `true`/`false`.

---

## 7. Blocked (no authorization obtained, nothing attempted)

| Integration | Missing authorization |
|---|---|
| Production/hosted Supabase project | No read access requested or granted; applied production schema, grants, RLS state and row data remain **unverified**. |
| Vercel deployment / preview | Not attempted. A branch is not evidence of a deployed commit. |
| Travelpayouts live programme IDs | Catalogue `tp-<slug>` entries are placeholders; no real programme verified. |
| Stripe | Test-mode keys only; `BOOKING_LIVE=false` retained. |
| Real creator/merchant invitations, campaign activation, payouts | Explicitly out of scope. |
| GitHub connector (PR creation) | Not authenticated in this session. |

---

## 8. Risks carried into Phase 1

1. **Node 24 vs `.nvmrc` 22.** Local runs are on a Node major CI never exercises.
   `vitest.config.ts` passes `--no-experimental-webstorage`, a flag added for a
   Node-22-specific `localStorage` shadowing bug; its behaviour on 24 is unverified.
2. **A green `pnpm test` can hide skipped suites.** Without `SUPABASE_DB_CONTAINER` and
   `RUN_R7_3_LOCAL_LIVE_TESTS=1`, the RLS and production-honesty suites skip silently.
   Any verification claim must state whether those two were set.
3. **Static SQL-text tests give false confidence** (see §5.6).
4. **Three coexisting design-system layers** (`k-*` legacy, `k2-*` editorial, unstyled
   `ui/*`) with documented migration debt. 13 of 18 `ui/*` primitives are unreferenced,
   and their CVA variants reference shadcn CSS variables defined nowhere.
5. **`border-kinnso-line` is used in 20+ places but `--color-kinnso-line` is undefined**,
   so those borders render as nothing under Tailwind v4.
