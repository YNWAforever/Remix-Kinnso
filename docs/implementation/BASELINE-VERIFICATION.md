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

### 3.1 CRLF line endings — 14 tests across 11 files (environment, Windows-only)

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
real `auth.users` rows. **Consequence for any future verification claim: a diff in the
failing-file list across two full runs is not by itself evidence of a regression.** Confirm
causality by (a) checking whether the suite imports the changed module at all, and
(b) re-running the suite in isolation.

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

Every CRLF failure in §3.1 is unchanged in both runs.

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
