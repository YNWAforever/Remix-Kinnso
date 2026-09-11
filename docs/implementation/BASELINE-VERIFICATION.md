# BASELINE-VERIFICATION — reproducible test baseline

**Source commit:** `e086fbfc4e2bc4447dc9bbbe71af1290c866adaf`
**Environment:** Windows 11, Node **v24.18.0** (`.nvmrc` pins 22), pnpm 11.6.0 via corepack,
Docker 29.7.2, local Supabase stack `kinnso-v3` with all 146 migrations applied.
**Date:** 11 September 2026.

Evidence grades: **PASS / FAIL / BLOCKED / NOT RUN**, and capability mode
**LIVE / DEMO / UNAVAILABLE**. "LIVE" means a service actually executed — not that source
exists and not that a build succeeded.

---

## 1. Gate results

> **Update after slice S6.** The CRLF class of failure below is resolved; see §3.1.
> The live-DB class in §3.2 is unchanged and remains unmeasurable on this host.

| Gate | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile` | **PASS** | 40.4s |
| `pnpm typecheck` | **PASS** | 8/8 turbo tasks |
| `pnpm lint` | **PASS** | 0 errors, 28 warnings |
| `pnpm honesty:lint` | **PASS** | — |
| `pnpm test` — **no** `.env.test` | **FAIL (environment)** | all 501 web files abort at load; see §2 |
| `pnpm test` — local stack armed | **FAIL (17 tests)** | see §3; **all pre-existing** |
| `pnpm build` | **NOT RUN** | not part of this slice |

### Non-web packages (armed run)

| Package | Test files | Tests |
|---|---|---|
| `@kinnso/honesty` | 2 passed | 11 passed |
| `@kinnso/scan` | 4 passed | 40 passed |
| `@kinnso/scan-app` | 14 passed, 1 skipped | 180 passed, 7 skipped |
| `@kinnso/sync` | 15 passed, 2 skipped | 89 passed, 3 skipped |
| `@kinnso/sync-app` | 1 passed | 27 passed |
| `@kinnso/parity` | 16 passed | 92 passed |

### `apps/web` (armed run)

| | Count |
|---|---|
| Test files | **487 passed, 14 failed** (501) |
| Tests | **3080 passed, 17 failed, 13 skipped** (3110) |

---

## 2. `pnpm test` cannot pass on a clean checkout

`apps/web/vitest.setup.ts:50-52`:

```ts
if (!process.env.SUPABASE_URL) {
  throw new Error('Set apps/web/.env.test (SUPABASE_URL etc.) before running integration tests')
}
```

This runs in `setupFiles`, so it aborts **every** web test file — including pure unit
tests with no database dependency such as `tests/auth.safe-next.test.ts`. Observed:
`Test Files 501 failed`, `Tests no tests`, `tests 0ms`, `environment 1357s`.

This corrects plan §14.1, which lists `pnpm test` as a verified baseline command.

**Arming procedure** is in `CURRENT-STATE.md` §4.1 and mirrors
`.github/workflows/ci.yml:45-135`. The two easily-missed variables are
`SUPABASE_DB_CONTAINER` and `RUN_R7_3_LOCAL_LIVE_TESTS=1`; without them the RLS and
production-honesty suites `describe.skip` themselves and **report green while untested**.

---

## 3. The 17 pre-existing failures, classified

### 3.1 CRLF line endings — 14 tests across 11 files — ✅ **RESOLVED** (slice S6)

> Resolved by adding `.gitattributes` with `* text=auto eol=lf`. All 11 files now pass
> (97 tests). No committed content changed — every index entry was already `i/lf`; only
> the working tree was CRLF. `core.autocrlf=true` turned out to come from **system**
> config (the Git-for-Windows default) rather than user or repo config, which is exactly
> why a repository-level `.gitattributes` was the correct fix rather than a config change.
> The original diagnosis is kept below because the failure mode will recur for anyone
> checking out on a platform whose defaults differ.

### 3.1 (original diagnosis) CRLF line endings — environment, Windows-only

**Root cause, verified:** `core.autocrlf = true` on this machine and the repository has
**no `.gitattributes`**. Git blobs are LF; the working tree is CRLF
(`file …_r12_0_claim_offer.sql` → "ASCII text, with CRLF line terminators"). The affected
tests `readFileSync` a tracked file and assert `expect(text).toContain('multi\nline\n…')`,
which cannot match CRLF content.

Observed signature: `AssertionError: expected 'name: CI\r\non:\r\n  pull_request:\r\…'`

| File | Failing tests |
|---|---|
| `tests/ci.product-state.test.ts` | 2 |
| `tests/db.r10-1-deploy-settlement-minting.test.ts` | 1 |
| `tests/db.r12-0-claim-offer.test.ts` | 1 |
| `tests/db.r12-0-redeem-offer-claim.test.ts` | 1 |
| `tests/db.r12-0-settlement-on-redemption.test.ts` | 2 |
| `tests/db.r12-1-claim-offer-journey.test.ts` | 2 |
| `tests/db.r12-1-merchant-visits-driven.test.ts` | 1 |
| `tests/db.r12-1-redeem-emits-event.test.ts` | 2 |
| `tests/db.r12-2-settle-receipt-on-approval.test.ts` | 1 |
| `tests/media.source-contract.test.ts` | 1 |
| `tests/r7-6-navigation-footer.test.ts` | 1 |

**Not a code defect.** CI runs on Linux (LF) and is unaffected. It does mean the suite is
**not reproducible on a Windows checkout**, which is a real contributor-experience defect.
Proposed fix (separate slice, deliberately not bundled here): add a `.gitattributes`
pinning `*.sql`, `*.yml`, `*.ts`, `*.tsx` to `eol=lf`. That rewrites line endings
repo-wide, so it must not ride along with a feature change.

### 3.2 Live-stack flakiness — 2 tests in this run (environment, **non-deterministic**)

| File | Test | Signature |
|---|---|---|
| `tests/r7-3-creator-listing.rls.test.ts` | recomputes drift from real `guide_saves` | `Test timed out in 15000ms` |
| `tests/settlement-minting.rls.test.ts` | does not duplicate across a revision cycle | timeout |

These reach the database through `docker exec` on Windows, materially slower than a Linux
runner.

**The `*.rls.test.ts` suites are order- and concurrency-dependent, and the set that fails
varies between runs.** This was established, not assumed:

- The **baseline** run failed `settlement-minting.rls.test.ts`.
- A later run of the *same* suites failed a different set —
  `enquiries.rls.test.ts`, `offers.rls.test.ts`, `saves-and-reviews.rls.test.ts`,
  `rpc.test.ts` — while `settlement-minting.rls.test.ts` passed.
- Re-running those four **in isolation**: `4 passed (4)`, `44 tests passed`.

They share one Postgres while 501 vitest files run in parallel, and they create and delete
real `auth.users` rows.

**Root cause, measured — the host is saturated, not the code.** Late in the session a
bare `select 1;` against the local database took **9.9 seconds**:

```
$ time docker exec supabase_db_kinnso-v3 psql -U postgres -d postgres -tAc "select 1;"
1
real    0m9.927s
```

**42 containers** were running, including *three* concurrent Supabase stacks — `kinnso-v3`
(this worktree) plus `kinnso-r7-10-task5` and `kinnso-r7-10-task6` from sibling worktrees.
Suites with 5s and 15s timeouts cannot pass reliably against a database that takes ten
seconds to answer `select 1`, and no application change can affect that number.

**Consequences for any verification claim made on this machine:**

1. A diff in the failing-file list between two full runs is **not** evidence of a
   regression. Establish causality by (a) checking whether the suite imports the changed
   module at all, and (b) re-running it in isolation — and if the host is loaded, note
   that (b) may fail for the same environmental reason.
2. **Live-DB suite results are not measurable here while sibling stacks are running.**
   Stop the other stacks (`supabase stop --project-id <id>`) before trusting a full-suite
   number, or read CI, which gets a dedicated runner.
3. Unit and component suites (no database) remain reliable and are what the slices in §4
   are verified against.

### 3.3 A genuine pre-existing data-integrity bug — 1 test

`tests/mission.rls.test.ts > mission schema RLS` fails during fixture teardown with:

```
ERROR:  new row for relation "missions" violates check constraint "missions_check"
CONTEXT: SQL statement "UPDATE ONLY "public"."missions"
         SET "created_by_ops_member_id" = NULL
         WHERE $1 OPERATOR(pg_catalog.=) "created_by_ops_member_id""
```

**This is not an environment artifact.** Read directly from the live local database:

```sql
-- missions_check
CHECK (
  (mission_source = 'merchant'      AND merchant_profile_id IS NOT NULL)
  OR
  (mission_source = 'travelpayouts' AND created_by_ops_member_id IS NOT NULL
                                    AND affiliate_network_program_id IS NOT NULL)
)

-- foreign keys
missions_created_by_ops_member_id_fkey
  FOREIGN KEY (created_by_ops_member_id) REFERENCES kinnso_ops_members(id) ON DELETE SET NULL
missions_affiliate_network_program_id_fkey
  FOREIGN KEY (affiliate_network_program_id) REFERENCES affiliate_network_programs(id) ON DELETE SET NULL
```

`ON DELETE SET NULL` is **directly contradicted** by a `CHECK` requiring those same two
columns to be `NOT NULL` for a `travelpayouts` mission. Consequences, on any environment
carrying this schema:

1. **An ops member who ever created a Travelpayouts mission cannot be deleted** — the
   `DELETE` aborts with the constraint violation above.
2. **An affiliate network program with missions cannot be deleted**, by the identical
   mechanism on the second FK.

Severity: operational. Offboarding an ops member is a routine requirement, and the failure
mode is a hard database error rather than a handled application message.

**Not fixed in this phase.** The fix is a migration (choose `ON DELETE RESTRICT`, relax the
check, or soft-delete ops members) and that is a deliberate product decision about mission
ownership — it belongs with the missions domain, not a frontend slice. Recorded in
`PHASE-BACKLOG.md`.

---

## 4. Verification of the Phase 1 slice (return-to-task continuation)

| Suite | Result |
|---|---|
| `tests/auth.return-path.test.ts` (**new**) | PASS |
| `tests/auth.gate.test.ts` (extended) | PASS |
| `tests/auth.safe-next.test.ts` (unchanged) | PASS |
| `tests/kinnso.guide-save-button.test.tsx` (extended) | PASS |
| `tests/kinnso.experience-card.test.tsx` (unchanged) | PASS |
| `tests/auth.middleware.test.ts` (unchanged) | PASS |
| `tests/auth.signin-redirect.test.tsx` (unchanged) | PASS |
| `tests/auth.proxy-gate.test.ts` (**new**) | PASS (6 tests) |

`proxy.ts` previously had **no test at all** — `auth.middleware.test.ts` covers
`lib/supabase/middleware.ts`, not the proxy that consumes it. The new suite is genuine
regression coverage, not a tautology: against the pre-change code the first case sees no
`next` param at all, and the `%3Fnext` case specifically catches the trap of assigning a
string containing `?` to `url.pathname`, which would escape the separator into the path
and yield a 404 instead of a redirect.

Focused run: **7 files, 70 tests, all passing.**
`pnpm typecheck` **PASS** (8/8), `pnpm lint` **PASS** (0 errors), `pnpm honesty:lint` **PASS**.

### 4.1 Full-suite regression comparison

| | Baseline (`e086fbfc`) | After slice S1 |
|---|---|---|
| Test files | 487 passed / 14 failed (501) | 485 passed / 17 failed (**502** — one new file) |
| Tests | 3080 passed / 17 failed / 13 skipped | 3089 passed / **20 failed** / 22 skipped |

The three extra failures are **not** a regression. All four newly-failing files
(`enquiries.rls`, `offers.rls`, `saves-and-reviews.rls`, `rpc`) were cleared on two
independent grounds:

1. **No import path.** None of them reference `lib/auth/gate.ts`, `lib/auth/return-path.ts`,
   `proxy.ts`, `GuideSaveButton` or `ExperienceSaveButton`. They construct a Supabase
   client directly and exercise SQL. `rpc.test.ts` tests `increment_article_view`, which
   the slice cannot reach by any path.
2. **They pass in isolation.** Re-run alone: `Test Files 4 passed (4)`,
   `Tests 44 passed (44)`.

Meanwhile `settlement-minting.rls.test.ts`, which failed in the baseline, **passed** in the
post-slice run — the failing set moves in both directions, which is the signature of the
flakiness documented in §3.2, not of a code change.

A third full run (after slice S2) reported `486 passed / 16 failed` files, again with a
*different* live-DB set (`auth.creators-row`, `g.slug.host`, `queries.detail`, `rpc`).
All four were cleared the same way: **zero** references to `getPublishedGuides`,
`lib/auth/gate.ts`, `lib/auth/return-path.ts`, `@/proxy`, `GuideSaveButton` or
`ExperienceSaveButton`, verified by grep. By that point the host measured 9.9s for
`select 1` (§3.2), so isolation re-runs were no longer diagnostic either.

**Honest summary of what the full-suite number proves on this machine: very little for the
live-DB suites, and nothing that contradicts the focused results in §4.** Every CRLF
failure in §3.1 is unchanged across all three runs, and the unit/component suites covering
the changed code pass deterministically.

---

## 5. What this baseline does **not** establish

- **No production or hosted environment was contacted.** Every LIVE result above is
  against an ephemeral local Docker Supabase stack seeded from `supabase/seed.sql`.
- **No browser/E2E run.** `apps/e2e` was **NOT RUN**. No viewport, native-zoom, keyboard,
  screen-reader or mobile-Safari evidence exists from this session. Plan story #21 is
  **NOT RUN**, and the return-to-task slice has **no browser-level proof** — only unit and
  component-level proof.
- **No provider call.** Travelpayouts, Stripe and the AI gateway were never invoked.
- **`pnpm build` NOT RUN.**
- **80 of 82 `db.*.test.ts` files assert migration *text*, not behaviour.** Their passing
  says the SQL was written as expected; it says nothing about what the database does.
