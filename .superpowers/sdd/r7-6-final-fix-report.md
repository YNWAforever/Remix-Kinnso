# R7.6 Final Review Fix Evidence

Date: 2026-07-24
Branch: `codex/r7-6-navigation-footer`
Fix-wave base: `55a25c1ccd4a6c844a3e402abae38a7604230303`
Status: `DONE_WITH_CONCERNS` only because the untouched local Supabase/RLS suite remains stateful; all R7.6-focused and required browser gates are green.

## Delivered fixes

- Corrected the approved Japanese values exactly:
  - `nav.linkForCreators`: `クリエイターの方へ`
  - `footer.tagline`: `AI旅行クリエイターマーケットプレイス · 香港 · 台北 · 東京`
- Aligned client and server viewer-role resolution:
  - active creator -> `creator`
  - onboarding creator with at least one `creator_social_handles` row -> `creator-pending`
  - onboarding creator without a saved handle -> `traveler`
  - `ops` remains ahead of `merchant`, and `merchant` remains ahead of creator state.
- Propagated the existing `messages.admin.navDashboard` label through LocaleLayout -> SiteChrome -> Navbar. Authenticated ops now get Dashboard -> `/{locale}/admin` on desktop and mobile, without Sign in or Sign up.
- Preserved operational `/merchants/post` auth errors unchanged. The browser gate showed that Supabase uses `AuthSessionMissingError` for a genuinely anonymous request; that named absence redirects to merchant apply, while all operational errors are still rethrown by identity.
- Shared the in-flight `/scan` start promise across React Strict Mode effect replay, preventing two concurrent scan jobs and the second-request 429/rate-limited state that caused creator onboarding to skip.
- Expanded the retired-phrase guard across the complete `apps/web` tree while deliberately excluding `.next`, `.turbo`, `.vercel`, `build`, `coverage`, `dist`, `node_modules`, `playwright-report`, and `test-results`.
- Added default-false Trips/Saved absence assertions at both SiteChrome and LocaleLayout boundaries.
- Added a real SiteChrome/useViewerRole integration test proving that an onboarding creator with a saved handle reaches the pending Navbar CTA.

No migrations, dependencies, lockfiles, feature defaults, production data, approved plan, progress ledger, `.codex-patches/`, or `task3-red.patch` were changed.

## Process and discovery evidence

- Read and followed `superpowers:systematic-debugging`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion`.
- Used codebase-memory-mcp graph discovery first for `useViewerRole`, `resolveViewerRole`, `SiteChrome`, `Navbar`, `LiveProgress`, `WizardClient`, and sign-up submission flow; literal/config searches followed only where the graph was insufficient.
- The required first `apply_patch` attempt failed with the managed Windows ACL defect: `windows sandbox failed: helper_unknown_error: apply deny-read ACLs`.
- All subsequent edits used a narrowly scoped elevated fallback with resolved-path containment checks and exact old-text or section-bound assertions before UTF-8 writes.

## RED evidence

The pre-fix focused runs failed for the intended reasons:

- Client/server onboarding + saved handle expected `creator-pending` but received `traveler`.
- The live SiteChrome integration could not find the pending CTA because the production hook never returned `creator-pending`.
- Ops Navbar/layout expectations found Sign up instead of Dashboard -> `/en/admin`.
- The merchant auth-error identity test received a redirect instead of the original operational error.
- Exact Japanese acceptance tables reported both approved-copy mismatches.
- The full-tree phrase-walker fixture showed that non-TypeScript source was not scanned and artifact exclusions were not represented.
- React Strict Mode regression expected one `/scan` fetch but observed two.
- The browser-discovered anonymous-session regression expected `/en/merchants/apply` but received the original `AuthSessionMissingError`; it passed after classifying only that named error as genuine absence.
- Booking false-state assertions were coverage-only additions and passed immediately because the runtime propagation was already correct.

## Root-cause trace for the browser skip

1. `LiveProgress` started `/scan` inside an effect.
2. React Strict Mode replayed the effect while the first request was still pending.
3. Two concurrent fixture requests were issued. The first created/completed a scan; the second hit the active-job/uniqueness guard and returned 429.
4. The component surfaced rate-limited state, so `creator-onboarding.spec.ts` did not observe the completed analysis and reached its skip branch.
5. Reusing a single in-flight promise across replay gives both effect executions the same job id while the cancelled execution exits before subscribing.

The first isolated final-gate attempt separately exposed an environment issue: Next dev advertised `localhost` while Playwright used `127.0.0.1`, blocking webpack HMR and leaving the sign-up form unhydrated. Its raw GET never reached auth or scan. Restarting the isolated server with `-H 127.0.0.1` restored hydration; creator onboarding then passed the complete sign-up, scan, review, and publish journey.

## Verification evidence

### Focused and static gates

- Final focused R7.6 suite: **13 files passed, 109 tests passed, 0 failed**.
- Focused role suites after explicit merchant-precedence strengthening: **2 files passed, 16 tests passed**.
- Merchant missing-session/operational-error route suite: **1 file passed, 12 tests passed**.
- `pnpm --filter web typecheck`: **pass**.
- `pnpm --filter @kinnso/e2e typecheck`: **pass**.
- `pnpm --filter web lint`: **pass with 0 errors and 18 pre-existing warnings**.
- Full `apps/web` retired-phrase `rg` guard: **pass, no match**.
- `git diff --check`: **pass**; Git printed informational LF/CRLF conversion warnings only.
- Independent read-only final diff review: **no blockers or actionable issues**.

### Required browser gate

Isolated patched clone: `C:\tmp\kinnso-r76-final-e2e-20260724-131610`

Environment: scan fixture on 8788, patched Next dev bound to `127.0.0.1:3100`, `CI=true`, `BOOKING_LIVE=false`. Both health checks returned 200, and only agent-owned processes were stopped afterward; ports 8788/3100 were released.

Exact command:

```text
pnpm --filter @kinnso/e2e e2e creator-onboarding funnel-smoke honesty notfound
```

Terminal result: **13 passed, 0 skipped, 0 failed in 24.6s**.
Creator onboarding alone: **1 passed, 0 skipped in 12.4s**.
Clean patched clone `pnpm honesty:lint`: **pass**.

### Full web suite and isolated baseline classification

Final current-source `pnpm --filter web test`:

- Test files: **358 passed, 2 failed, 1 skipped (361)**.
- Tests: **1,988 passed, 4 failed, 4 skipped (1,996)**.
- The three persistent failures are the previously isolated local Supabase state issues:
  1. anonymous creator visibility assertion;
  2. owner creator query returns accumulated rows (4 instead of 1);
  3. duplicate Travelpayouts mission violates `missions_tp_program_uniq`.
- A fourth failure was a 15-second merchant rollback timeout under the full concurrent suite. An immediate isolated rerun of the untouched `mission.rls.test.ts` finished in 6.68s with **12 passed, 1 failed**; the merchant rollback passed and only the known duplicate Travelpayouts row remained. This classifies the extra full-run failure as transient suite load, not a source regression.
- No local or production data was reset, deleted, or repaired.

The primary checkout `pnpm honesty:lint` still sees two ignored `.worktrees/**/fixtures.ts` copies containing `example.com`; the same command passes in the clean patched clone, confirming the tracked branch source is clean.

## Remaining concerns

- The local full web suite remains non-green because of persistent test-database state and one observed load timeout in untouched RLS tests. Hosted fresh-database CI remains the trustworthy next integration signal.
- No remaining R7.6-focused defect or selected-browser skip is known.
