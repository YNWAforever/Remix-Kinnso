# R7.10 Accessibility and Polish Verification Record

## Verification snapshot

- Local test date: 2026-07-30 (Asia/Hong_Kong).
- Pre-commit verification SHA: `0fc6866206d4e8cdfeda2cb7b23b9a500be7ca95`.
- Scope: Task 7 CI/preview-smoke wiring plus final whole-branch gate drift found during bounded verification.
- Exception ledger: empty; every route below records `None`.
- No production database write, payment, Preview deployment, or Adfocate resource was used.

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
| `pnpm --filter web exec vitest run tests/e2e.creator-onboarding-mode.test.ts tests/og.palette-parity.test.ts tests/ci.product-state.test.ts --pool=forks --maxWorkers=1 --no-file-parallelism` | Pass - 10/10 focused workflow and palette contracts. |
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

## Final gate drift fixed

- The older creator-onboarding workflow test now follows the dedicated R7.10
  config and proves the four carried-forward PR smoke specs remain in its OFF
  manifest; it no longer expects the removed inline command.
- OG image cards now use the same AA-safe `#B94000` orange token introduced by
  Task 6; the permanent palette-parity test is green.
- The creator RLS integration test now checks the private onboarding row by ID.
  This preserves the intended policy while allowing intentionally public,
  published creator profiles returned by `creators_public_read`.
- No production authentication, route, database policy, or browser assertion was
  weakened to obtain these results.

## Booking and preview results

- Booking OFF: Task 6 remains the durable full matrix pass (44 expected,
  0 unexpected, 1 intentional ON skip). Task 7's two parallel-load failures
  both passed in a sequential zero-retry rerun.
- Booking ON: not executed in Task 7. The CI job accepts only repository Stripe
  secrets and passes them to the isolated ON invocation; it neither uses a
  production key nor completes payment.
- Preview deployment URL: pending a successful `Preview` deployment for the
  `remix-kinnso-web` environment. This task does not push or deploy.
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

After this branch is pushed and a qualifying Preview deployment succeeds, GitHub
Actions must run `preview-smoke` against the emitted environment URL. That run
is the remaining deployment evidence; it must report every manifest route's
HTTP/readiness and visible-main checks without submitting a form or starting
checkout.
