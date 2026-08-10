# R8.0 Task 9 verification report

**Branch inspected:** `codex/r8-0-measurement-baseline` at `e4637c4`
**Diff base:** `origin/main...HEAD` (48 files, 3,203 additions, 12 deletions)
**Production activity:** none. No linked/production database command, deployment, vendor configuration, or production analytics activation was performed.

## Passing checks

- Focused R8.0 web suite passed with an explicit Vitest invocation:
  `apps/web/node_modules/.bin/vitest.cmd run tests/analytics.contracts.test.ts tests/analytics.server.test.ts tests/api.analytics.test.ts tests/db.r8-0-measurement-baseline.test.ts tests/admin.analytics-queries.test.ts tests/api.admin-analytics.test.ts tests/analytics.client.test.ts tests/analytics.entity-view.test.tsx tests/analytics.funnel-events.test.tsx tests/kinnso.AnalyticsConsentBanner.test.tsx`
  - Exit 0; 10 files / 72 tests passed in 2.18 s.
- Seven-locale parity passed:
  `apps/web/node_modules/.bin/vitest.cmd run tests/i18n.locale-parity.test.ts`
  - Exit 0; 1 file / 9 tests passed.
  - Static audit found `analytics` in exactly the seven required message dictionaries: `en`, `zh-hk`, `zh-tw`, `ja`, `ko`, `th`, and `zh-cn`.
- `pnpm --filter web typecheck` passed (exit 0).
- `pnpm --filter @kinnso/e2e typecheck` passed (exit 0).
- `pnpm --filter web lint` now passes (exit 0), with 21 pre-existing warnings in unrelated files and no errors.
- Remote-target safety behavior passed:
  `E2E_BASE_URL=https://example.com apps/e2e/node_modules/.bin/playwright.cmd test specs/analytics-consent.spec.ts --project=chromium`
  - Exit 0; both tests skipped before navigation. The spec accepts only `localhost` or `127.0.0.1` targets.
- Static code/migration inspection confirms:
  - Server persistence is gated exclusively by `process.env.ANALYTICS_INGEST_MODE === 'production'`; browser state cannot activate storage.
  - Example and test modes remain disabled/test (`apps/web/.env.example`, `apps/web/.env.test`); no production configuration file or deployment configuration is in the diff.
  - The ops report route requires a session and `resolveViewerRole(...) === 'ops'`; the SQL RPC separately requires `is_active_ops()`.
  - Report arguments are capped to seven days, report response sets the fixed seven-day attribution value, and raw rows are retained for eight days.
  - Report adapter and API expose no `journey_id`, `client_event_id`, or `account_id` fields.
  - Booking state is explicitly carried as both `off` and `on` in client instrumentation and SQL aggregates; booking-off waitlist outcomes and booking-on checkout outcomes are separated.
  - The requested privacy scan found no analytics data fields named `email`, `ip`, `user-agent`, `prompt`, `query`, `freeform`, or `jsonb`. Its only matches were explanatory SQL comments containing the ordinary word `query`.

## Blocked or failing checks

- The plan-provided focused command, `pnpm --filter web test -- <files>`, forwarded a literal `--` to Vitest and ran the full web suite rather than only R8.0 files. It timed out at 60 seconds after unrelated live-Postgres tests failed/refused connections at `127.0.0.1:64521`. The explicit direct Vitest command above is the valid focused result.
- `pnpm --filter web lint` exits 1. The sole error is the already-known R8.0 consent-banner hydration rule:
  `AnalyticsConsentBanner.tsx:15` — `react-hooks/set-state-in-effect`, from synchronous `setAccepted(hasAnalyticsConsent())` in the mount effect. The remaining 21 items are pre-existing warnings in unrelated files plus one unused test destructure in `analytics.server.test.ts`. This verification task did not alter product code.
- `pnpm --filter web build` initially stops during config validation because the terminal does not export the required Supabase public URL. With local `.env.test` safely loaded (quotes stripped) and `VERCEL=1`, compilation and TypeScript succeed, then static page collection fails at `/sitemap/[__metadata_id__]` because Supabase is unavailable: `connect ECONNREFUSED 127.0.0.1:64521`.
- Local migration/RLS/RPC runtime validation and local analytics E2E cannot run:
  - `supabase status` cannot run because the Supabase CLI is absent from PATH.
  - `Get-NetTCPConnection -State Listen -LocalPort 54322` returned `NO_LISTENER_54322`.
  - `Test-NetConnection 127.0.0.1 -Port 64521 -InformationLevel Quiet` returned `False`.
  Therefore no local migration was applied and no browser-role denial, service-role insert/idempotency, or deterministic aggregate fixture was claimed as executed.
- `git diff --check origin/main...HEAD` exits 0 but reports three pre-existing documentation hygiene notices: a blank line at EOF in the R8.0 plan and trailing whitespace on the first three metadata lines of the R8.0 design document.

## Decision

The verification-only commit `chore(r8.0): verify measurement baseline` was **not created**. An allow-empty verification commit would incorrectly imply that the required local migration/runtime checks are green.

## Lint remediation

The lint item in the earlier blocked-check record above was resolved after that report was written.

- **Root cause:** `AnalyticsConsentBanner` synchronously copied the localStorage-derived consent value into React state from a mount `useEffect`. React Hooks lint correctly rejects that pattern because it creates an avoidable render cascade.
- **Fix:** consent hydration now uses `useSyncExternalStore` with a stable no-op subscription, a server snapshot of `false`, and `hasAnalyticsConsent` as the safe browser snapshot. Click handlers retain local override state, so accepting or revoking consent changes the UI immediately without waiting for a storage event.
- **Verification after fix:** the banner, client, locale-parity, funnel, and entity suites passed; targeted banner ESLint passed; `pnpm --filter web lint` passed with only the existing 21 warnings; and `pnpm --filter web typecheck` passed. `git diff --check origin/main...HEAD` still reports only the previously documented whitespace notices in the R8.0 plan/design files.

## Superseding R8.0 review-fix verification

After the final review fixes (HEAD `167850e`), the checked-in Vitest binary passed 11 focused files / 83 tests, including the retention cron route and qualified aggregate migration contract. Workspace typecheck, lint (21 baseline warnings), and E2E typecheck passed. Remote-target analytics E2E safely skipped both tests. The migration/RLS/browser runtime and production-style build remain blocked by unavailable local Supabase (ECONNREFUSED `127.0.0.1:64521`); no production activation or writes occurred.
