# R7.10 Task 6 — Accessibility Remediation Report

## Scope and isolation

- Timestamp (UTC): 2026-07-30.
- Booking state: OFF only. Booking ON was intentionally skipped; no Stripe checkout, payment, production, preview, Adfocate data, or exception-ledger entry was used.
- Isolated KINNSO fixture: `kinnso-r7-10-task6`, loopback API `127.0.0.1:65521`, DB `127.0.0.1:65522`; direct read-only fixture checks confirmed guide, experience, and article fixtures.
- Fixture scan: loopback `127.0.0.1:8788`; logs retained at `C:\tmp\kinnso-r7-10-task6-scan.stdout.log` and `C:\tmp\kinnso-r7-10-task6-scan.stderr.log`.
- Exception ledger: empty. `apps/e2e/r7-10-routes.ts` was not changed.

## Durable matrix evidence

| Run | Result | Artifact |
| --- | --- | --- |
| Initial runner diagnostic | 34 unexpected; all route readiness checks returned HTTP 500 before axe, so not accepted as an accessibility result | `C:\tmp\kinnso-r7-10-task6-baseline-playwright.result.json` |
| First rendered baseline | 15 serious `color-contrast` `(ruleId,target)` groups; 11 unexpected overall | `C:\tmp\kinnso-r7-10-task6-rerun-playwright.result.json` |
| Shared-token rerun | Shared button/eyebrow/article groups cleared; 3 local orange-band contrast groups remained | `C:\tmp\kinnso-r7-10-task6-post-token-axe.result.json` |
| Nine-route axe proof | 9 expected, 0 unexpected, 0 skipped; every manifest route had zero unapproved critical/serious violations | `C:\tmp\kinnso-r7-10-task6-final-axe.result.json` |
| Final bounded Booking-OFF matrix | 44 expected, 0 unexpected, 1 intentional Booking-ON skip, 0 flaky, 0 errors; all 9 axe route contracts passed | `C:\tmp\kinnso-r7-10-task6-finalizer-final-acceptance.raw.json` |

Final bounded blob artifact: `C:\tmp\kinnso-r7-10-task6-finalizer-final-blob`.

## Findings and TDD remediation

### Shared contrast tokens

- RED: `design.k2-tokens.test.ts` first failed for the missing AA-safe KINNSO orange token, then independently for the original orange token used by the article TOC.
- GREEN: the focused token test passed 6/6 after `globals.css` changed orange to `#B94000` and orange-dark to `#A13E0B` for both aliases. This cleared the shared `.k2-btn-primary`, `.k2-eyebrow`, `.text-kinnso-orangeDark`, and article `text-orange` groups.

### Local orange CTA bands

- RED: 3/13 focused CTA-band assertions failed exactly because `CreatorCta`, `ForCreatorsView`, and `ForMerchantsView` retained dark text on the darkened AA-safe orange bands.
- GREEN: the nearest component tests passed 13/13 after the affected heading/body/list copy received the minimal white/white-90 classes. No visible copy was changed.

### Booking-OFF acceptance drift

- RED: the full matrix timed out because the stale selector `/notify me|join/i` did not match the preserved accessible name `Get notified when booking opens`; a second stale status assertion surfaced after submission had succeeded.
- GREEN: `r7-10-booking.spec.ts` now uses the exact current button name and the stable success contract `/you.re on the list/i`. The isolated config-managed run passed 3 expected, 0 unexpected, 1 Booking-ON skip in `C:\tmp\kinnso-r7-10-task6-finalizer-booking-green-v2.raw.json`.
- Product copy and keyboard traversal stayed unchanged; no broad matcher or first-button shortcut was introduced.

## Verification and review

- Focused isolated Vitest: 19/19 passed.
- `pnpm --filter @kinnso/e2e typecheck`: passed.
- Targeted ESLint: exit 0; `globals.css` was reported as ignored by the project ESLint configuration, with no errors.
- `git diff --check`: clean.
- UTF-8 restoration review: all 8 touched files valid and zero mojibake artifact matches after restoring 12 unintended fallback-write text changes.
- The finalizer stopped only its owned Playwright/web process tree; port 3100 was confirmed free. Final cleanup stopped the known Task 6 fixture scan PID 40584. The named temporary Supabase workdir was already absent, so no container stop was attempted; unrelated stacks were untouched.

## Final finding counts

- Critical: 0
- Serious: 0
- Exceptions: 0
- Routes with final axe contract pass: 9/9
