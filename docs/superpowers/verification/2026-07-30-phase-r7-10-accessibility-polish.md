# R7.10 Accessibility and Polish Verification Record

## Verification snapshot

- Local test date: 2026-07-30 (Asia/Hong_Kong).
- Final reviewed SHA: `f1f4bc35750c2b2b5c6c4028de358607e7deb34a`.
- Scope: complete R7.10 branch, final whole-branch review fixes, CI wiring, and deployment-specific Preview smoke.
- Exception ledger: empty; every route below records `None`.
- No production database write, payment, Booking activation, or Adfocate resource was used.

## Route checklist

The Task 6 isolated Booking-OFF final acceptance matrix recorded 44 expected,
0 unexpected, 1 intentional Booking-ON skip, 0 flaky, and 9/9 route axe
contracts with zero unapproved critical or serious findings. It remains the
durable whole-matrix evidence for the route checks below. Task 7 also reran the
creator landing axe contract sequentially with zero retries and it passed.

| Route | HTTP/readiness | Axe critical/serious | 380px overflow | CLS | Header journey applicability | Exception |
| --- | --- | --- | --- | --- | --- | --- |
| `/en` | Pass - Task 6 OFF matrix | Pass - 0 unapproved | Pass - Task 6 OFF matrix | Pass - Task 6 OFF matrix | Desktop and mobile | None |
| `/en/explore` | Pass - Task 6 OFF matrix | Pass - 0 unapproved | Pass - Task 6 OFF matrix | Pass - Task 6 OFF matrix | Desktop | None |
| `/en/g/r7-smoke-tokyo-guide` | Pass - Task 6 OFF matrix | Pass - 0 unapproved | Pass - Task 6 OFF matrix | Pass - Task 6 OFF matrix | Desktop and mobile | None |
| `/en/experiences/r7-smoke-tokyo-experience` | Pass - Task 6 OFF matrix | Pass - 0 unapproved | Pass - Task 6 OFF matrix | Pass - Task 6 OFF matrix | Desktop | None |
| `/en/articles/dining/ramen-guide` | Pass - Task 6 OFF matrix | Pass - 0 unapproved | Pass - Task 6 OFF matrix | Pass - Task 6 OFF matrix | Desktop | None |
| `/en/for-creators` | Pass - Task 7 sequential rerun | Pass - 0 unapproved | Pass - Task 6 OFF matrix | Pass - Task 6 OFF matrix | Desktop | None |
| `/en/for-merchants` | Pass - Task 6 OFF matrix | Pass - 0 unapproved | Pass - Task 6 OFF matrix | Pass - Task 6 OFF matrix | Desktop | None |
| `/en/creators` | Pass - Task 6 OFF matrix | Pass - 0 unapproved | Pass - Task 6 OFF matrix | Pass - Task 6 OFF matrix | Desktop | None |
| `/en/merchants` | Pass - Task 6 OFF matrix | Pass - 0 unapproved | Pass - Task 6 OFF matrix | Pass - Task 6 OFF matrix | Desktop | None |

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm --filter web exec vitest run tests/ci.product-state.test.ts tests/e2e.creator-onboarding-mode.test.ts tests/og.palette-parity.test.ts --pool=forks --maxWorkers=1 --no-file-parallelism` | Pass - 25/25 focused workflow, preview-read-only, mutation, and palette contracts after review hardening. |
| `pnpm --filter web typecheck` and targeted ESLint for `tests/ci.product-state.test.ts` | Pass - both fresh review-fix checks exited 0. |
| `pnpm --filter web exec vitest run tests/creator-rls.test.ts --pool=forks --maxWorkers=1 --no-file-parallelism` | Pass - 14/14 against the clean 645xx fixture after narrowing stale whole-table assumptions to the private onboarding row. |
| Bounded web Vitest, `--pool=forks --maxWorkers=1 --no-file-parallelism --shard=1/4` | Pass - 97 files passed, 1 skipped; 539 tests passed, 13 skipped; zero failures. JSON: `C:\tmp\kinnso-r7-10-task7-final-web-vitest-q1-green.result.json`. |
| Bounded web Vitest, corrected `--shard=2/4` | Did not complete inside 480 seconds while still advancing; stderr was empty. No full web-suite pass is claimed. The first completed q2 exposed four failures whose three causes were each reproduced and verified green in focused runs. |
| Creator onboarding alone, one worker, zero retries | Pass - 1 expected, 0 unexpected, 0 skipped in 31.4 seconds. JSON/blob: `C:\tmp\kinnso-r7-10-task7-final-creator-onboarding.result.json`, `C:\tmp\kinnso-r7-10-task7-final-creator-onboarding.blob.zip`. |
| Full Booking-OFF matrix, four workers, zero retries | 42 expected, 2 unexpected, 1 intentional ON skip, 0 flaky in 133.6 seconds. Both failures were parallel-load transients and passed together in the sequential zero-retry rerun. JSON/blob: `C:\tmp\kinnso-r7-10-task7-final-off-matrix.result.json`, `C:\tmp\kinnso-r7-10-task7-final-off-matrix.blob.zip`. |
| Failed OFF contracts only, one worker, zero retries | Pass - 2/2 in 1.5 minutes: merchant legacy redirect and creator-landing axe/readiness. JSON/blob: `C:\tmp\kinnso-r7-10-task7-final-off-failures-diagnostic.result.json`, `C:\tmp\kinnso-r7-10-task7-final-off-failures-diagnostic.blob.zip`. |
| `pnpm typecheck` | Pass - fresh final run covered all 9 workspace packages. |
| `pnpm lint` | Pass - fresh final run completed with no reported errors. |
| `pnpm honesty:lint` | Pass - fresh final run completed successfully. |
| `pnpm --filter web build` | Pass - fresh final production build used only isolated fixture values with Agent/Booking disabled, compiled successfully, and generated 490 static pages. |
| `R7_10_BOOKING_STATE=on pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts` | Not run. No `sk_test_` key was supplied and no Stripe checkout or payment was attempted. |
| `pnpm --filter web exec vitest run tests/design.k2-tokens.test.ts tests/og.palette-parity.test.ts` | Pass - 8/8; canonical hex, raw HSL, and OG palette contracts are aligned. |
| `E2E_BASE_URL=https://remix-kinnso-jiqiqyy21-ynwaforevers-projects.vercel.app pnpm --filter @kinnso/e2e e2e r7-10-preview-smoke` | Pass - 9/9 read-only manifest routes in 27.2 seconds against deployment `dpl_7ZswHcwYRYG4eekpdLRpq65dttUJ`. |

## Final gate drift fixed

- The older creator-onboarding workflow test now follows the dedicated R7.10
  config and proves the four carried-forward PR smoke specs remain in its OFF
  manifest; it no longer expects the removed inline command.
- OG image cards now use the same AA-safe `#B94000` orange token introduced by
  Task 6; the permanent palette-parity test is green.
- The creator RLS integration test now checks the private onboarding row by ID.
  This preserves the intended policy while allowing intentionally public,
  published creator profiles returned by `creators_public_read`.
- The review-hardened CI contract structurally slices the `e2e` job and named
  Booking OFF/ON steps, requires their exact env maps and dedicated command in
  serial order, and rejects misplaced, parallel, reversed, or unrelated text.
  Preview verification now enforces an `E2E_BASE_URL`-only job env and a strict
  read-only call allowlist over the actual preview spec and `waitForRoute`.
- Review-fix TDD recorded 8 expected mutation failures against the broad
  contracts, then 15/15 green; the expanded prohibited-operation matrix
  recorded 9 expected failures with a deliberately relaxed allowlist, then
  21/21 green after restoring the strict allowlist.
- Whole-branch review found that active inline chart/map consumers still used
  the old raw HSL orange channels. The channels now round-trip exactly to
  `#B94000` and `#A13E0B`, with permanent design-token assertions; the fix was
  independently approved with no remaining Critical or Important findings.
- No production authentication, route, database policy, or browser assertion was
  weakened to obtain these results.

## Booking and preview results

- Booking OFF: Task 6 remains the durable full matrix pass (44 expected,
  0 unexpected, 1 intentional ON skip). Task 7's two parallel-load failures
  both passed in a sequential zero-retry rerun.
- Booking ON: not executed in Task 7. The CI job accepts only repository Stripe
  secrets and passes them to the isolated ON invocation; it neither uses a
  production key nor completes payment. `gh secret list --app actions` returned
  no configured secret names, so the two Stripe test secrets remain an external
  configuration gate.
- Preview deployment: `dpl_7ZswHcwYRYG4eekpdLRpq65dttUJ`, commit `f1f4bc3`,
  READY at `https://remix-kinnso-jiqiqyy21-ynwaforevers-projects.vercel.app`.
- Manual deployment-specific Preview smoke passed 9/9 read-only routes in 27.2
  seconds. GitHub's automatic `preview-smoke` job could not start because the
  account's Actions billing/spending-limit gate blocked all job steps.
- The `preview-smoke` job is read-only: it sets only `E2E_BASE_URL`, checks out
  locked dependencies and Chromium, and runs `r7-10-preview-smoke`. It receives
  no Supabase or Stripe secret.
- Lighthouse remains advisory in the existing production E2E job.

## Local fixture isolation

- Disposable local project: `kinnso-r7-10-task7`, API `127.0.0.1:64521`, DB
  `127.0.0.1:64522`; migrations and seed were reapplied before verification.
- Fixture scan: the exact KINNSO worktree worker on loopback `127.0.0.1:8788`.
- The default-port Adfocate project was never stopped, read, or changed.
- Only the named Task 7 stack and its exact scan process are stopped during final cleanup.

## External handoff

PR `#97` and its Vercel Preview are published. Restore GitHub Actions billing or
raise the spending limit, configure repository Actions secrets
`STRIPE_SECRET_KEY` (an `sk_test_...` key) and `STRIPE_WEBHOOK_SECRET`, then rerun
CI. The automated Booking ON and `preview-smoke` jobs must pass before merge.
Manual Preview evidence is already green for every manifest route without a
form submission or checkout.
