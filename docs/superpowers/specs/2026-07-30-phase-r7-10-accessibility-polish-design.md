# Phase R7.10 Accessibility and Polish Design

**Date:** 2026-07-30
**Status:** Approved
**Phase:** R7.10 — Accessibility and polish sweep (P2, last)

## Objective

Complete Phase R7 with a deterministic accessibility and polish contract for
KINNSO's primary public discovery routes. The phase fixes every critical or
serious axe finding on the required pages, makes shared navigation and booking
entry operable by keyboard, formalizes media alternative-text and sizing
semantics, and blocks mobile overflow and material layout-shift regressions.

This design is bound by the Phase R7 specification and the R1–R6 program
conventions. In particular, it preserves locale parity, production-read safety,
Stripe test-mode isolation, existing public metadata, and the one-squash-merged-
PR-per-sub-phase delivery model.

## Approved Route Contract

One typed E2E route manifest is the source of truth for the required route
coverage:

| Page | Deterministic route |
| --- | --- |
| Home | `/en` |
| Explore | `/en/explore` |
| Guide | `/en/g/r7-smoke-tokyo-guide` |
| Experience | `/en/experiences/r7-smoke-tokyo-experience` |
| Article | `/en/articles/dining/ramen-guide` |
| Creator landing | `/en/for-creators` |
| Merchant landing | `/en/for-merchants` |
| Creator directory | `/en/creators` |
| Merchant directory | `/en/merchants` |

Each manifest entry defines its URL, page type, readiness landmark or heading,
expected primary region, meaningful-media expectation, and participation in
specialized interaction journeys. Axe, 380px overflow, and preview smoke tests
consume this manifest rather than maintaining separate route lists.

The guide, experience, and article routes use deterministic local fixtures
already established by the R7 program. Local CI is authoritative for full
accessibility assertions. Preview verification reuses the manifest for route,
redirect, readiness, and primary-landmark smoke coverage without writing data.

## Architecture

R7.10 uses four mutually reinforcing enforcement layers:

1. **Rendered accessibility:** Playwright with `@axe-core/playwright` scans
   every manifest route and blocks critical or serious violations.
2. **Interaction journeys:** keyboard-only tests cover the shared desktop and
   mobile header plus both booking CTA states.
3. **Media contracts:** shared-component tests and a permanent source guard
   enforce meaningful alternative text, decorative placeholders, and explicit
   card-grid image sizing.
4. **Visual stability:** deterministic browser checks cover 380px overflow and
   unexpected layout shift, while Lighthouse remains advisory.

Product fixes belong in the narrowest shared component that correctly owns the
behavior. A route-specific fix is appropriate only when shared behavior would
be semantically wrong for other consumers. The phase must not add broad test
suppression to compensate for a correctable product defect.

The E2E package adds `@axe-core/playwright` as a direct development dependency
rather than relying on axe being present transitively through Lighthouse.

## Axe Contract

For each manifest route, the test:

1. Navigates under the deterministic local configuration.
2. Waits for the entry's explicit readiness condition.
3. Confirms the expected primary page landmark.
4. Runs axe against the rendered page.
5. Filters findings by impact and fails on every `critical` or `serious`
   violation.
6. Emits route-specific findings and retains Playwright evidence on failure.

The default policy is to fix all critical and serious findings. An exception is
allowed only when a product-side fix is technically impossible within the
platform boundary. Every exception must be narrowly scoped to one axe rule and
the smallest stable selector, and must record:

- The affected route and rendered element.
- The rule and impact.
- Reproduction evidence.
- Why a product fix is technically impossible.
- The owner and condition that triggers re-review.

Route-wide exclusions, broad rule disabling, impact downgrades, and
undocumented suppression are prohibited. No exception is expected by default.

The sweep includes accessible names, labels, heading order, landmarks,
contrast, focus visibility, and other rendered semantics exposed by axe or the
approved keyboard journeys.

## Keyboard Interaction Contract

### Desktop header

Keyboard-only coverage verifies that:

- Primary navigation follows the visual and semantic order.
- Interactive controls are reachable through normal Tab navigation.
- Menus open with Enter or Space when applicable.
- Escape closes an open menu and restores focus to its trigger.
- Focus is visibly distinguishable.
- No menu or page state traps focus.
- A user can activate a primary navigation destination without a pointer.

### Mobile header at 380px

The complete shared mobile-header journey runs on home and one representative
detail route. It verifies:

- The menu trigger is named, reachable, and reports expanded state.
- The menu opens and exposes every primary destination.
- All menu actions can be traversed and activated by keyboard.
- Escape and the explicit close action close the menu.
- Closing restores focus to the menu trigger.
- Background content does not become an unintended keyboard path while the
  modal menu is open.

### Booking CTA

The experience CTA is exercised under two isolated application launches:

- With `BOOKING_LIVE=false`, a keyboard user reaches the CTA, opens interest
  capture, completes required fields, submits, and receives confirmation.
- With `BOOKING_LIVE=true`, a keyboard user reaches the CTA and enters Stripe
  test checkout.

The live-state test stops before payment completion. It uses Stripe test mode
only and performs no production payment or production database write.

## Media Semantics

All real entity imagery has concise alternative text derived from the visible
entity identity. Depending on the subject, that identity is the creator,
guide, experience, article, or merchant title. Alternative text must not be a
filename, generic word such as "image", or an unhelpful repetition of UI chrome.

Decorative imagery uses empty alternative text and is removed from the
accessibility tree where appropriate. `MediaPlaceholder` is always decorative:
it must not announce fallback prose or duplicate the accessible name already
provided by the surrounding card or link.

Shared media components own these defaults and require callers to provide the
semantic identity needed for real imagery. Component tests verify both the
real-image and fallback branches. The rendered route suite confirms that the
contract reaches the required public pages.

All `next/image` usage in card grids supplies a non-empty, layout-appropriate
`sizes` value. A permanent repository source guard covers shared media
components and card-grid call sites so a new caller cannot silently omit this
contract. The guard complements, rather than replaces, rendered verification.

## Mobile and Layout-Stability Contract

Every route in the manifest runs at a 380px viewport and must satisfy:

- Document `scrollWidth` does not exceed its viewport width.
- Primary controls are not clipped or stranded off-screen.
- The page remains usable with reduced motion enabled.
- Third-party media fallback preserves the card's reserved geometry.

A `PerformanceObserver` is installed before navigation so the test sees layout
shifts during initial rendering. The assertion:

- Ignores entries marked with `hadRecentInput`.
- Waits for fonts, in-viewport media, and route readiness before settlement.
- Computes unexpected cumulative layout shift using the browser entries.
- Requires the result to remain at or below the Web Vitals good threshold of
  `0.1`.

The browser smoke test is intentionally paired with the stricter source and
component contracts for card media. Passing the aggregate threshold does not
permit a card-grid image to omit reserved geometry or explicit `sizes`.

External media failure must exercise the existing stable fallback rather than
make the test dependent on a third-party host. Motion and media behavior are
made deterministic through Playwright configuration or request control where
needed, without bypassing the application's own fallback rendering.

## Data Safety and State Isolation

The complete suite runs against deterministic local data. It does not seed,
update, or delete production Supabase records. Any production connection
available to the execution environment remains read-only.

The two `BOOKING_LIVE` states run in isolated server configurations so a
process-level environment value cannot leak between cases. Each server must be
ready before its tests begin and must be shut down even when a test fails.

Preview smoke checks do not submit forms or start checkout. They verify only
that every manifest route resolves, reaches its declared readiness condition,
and exposes its expected page landmark.

## CI and Evidence

The blocking R7.10 CI path:

1. Restores locked dependencies.
2. Builds the web application with deterministic test configuration.
3. Starts and tests the non-live booking configuration.
4. Starts and tests the live booking configuration.
5. Runs axe, keyboard, mobile-overflow, layout-shift, and media-contract checks.
6. Uploads route-specific evidence when a browser assertion fails.

Failure evidence includes, as applicable:

- The route and viewport.
- Axe findings with rule, impact, target, and help text.
- Layout-shift entries and total.
- A screenshot.
- The Playwright trace.

The following are merge gates:

- Zero unexcepted critical or serious axe findings on all manifest routes.
- Desktop and mobile header keyboard journeys.
- Both booking CTA keyboard journeys.
- Media semantic and `sizes` source guards.
- 380px overflow checks on all manifest routes.
- Deterministic layout-shift smoke coverage.
- Typecheck, lint, production build, relevant component tests, and focused E2E
  tests.
- Locale parity for any changed visible copy.

Existing Lighthouse checks remain advisory. They provide an additional signal
but do not replace or override the deterministic R7.10 gates.

The pull request includes a concise route-by-route checklist covering axe,
keyboard applicability, 380px overflow, layout stability, and any approved
exception.

## Resilience and Failure Handling

- A route that never reaches its readiness condition fails with its route
  identity rather than producing an ambiguous axe timeout.
- Server processes are cleaned up after both successful and failed test runs.
- A failed third-party image request resolves through the product fallback
  while retaining reserved layout space.
- Test evidence is retained for CI-only failures.
- A technically impossible axe issue remains visible through its narrow,
  documented exception and review condition.
- Missing deterministic fixture data is a setup failure, not a reason to skip a
  route.

## Testing Strategy

### Contract and component tests

Focused tests cover:

- Meaningful alt text for each real entity-media subject.
- Decorative `MediaPlaceholder` behavior.
- No duplicate accessible name from fallback media.
- Required non-empty `sizes` on card-grid media.
- Header menu names, expanded state, Escape behavior, and focus restoration.
- Booking CTA labels and modal or form focus behavior.

### End-to-end tests

Playwright coverage verifies:

- Axe results for all nine manifest routes.
- Desktop header navigation by keyboard.
- Mobile header interaction on home and one detail route at 380px.
- Non-live interest capture by keyboard.
- Live Stripe test-checkout entry by keyboard.
- Horizontal overflow on all nine routes at 380px.
- Layout shift at or below `0.1`.
- Stable fallback geometry when external media fails.

### Build and convention checks

- Repository typecheck and lint pass.
- The production build succeeds.
- Existing public route, metadata, sitemap, and locale-parity behavior remains
  green.
- Preview smoke consumes the canonical manifest.
- Lighthouse continues to report advisory results.

## Acceptance Criteria

R7.10 is accepted when:

1. All nine required routes have zero unexcepted critical or serious axe
   violations in blocking CI.
2. Desktop header navigation is fully keyboard-operable.
3. The mobile header is verified at 380px on home and a detail route.
4. The booking CTA works by keyboard in both approved feature states.
5. Real entity imagery follows the title-based alt-text policy.
6. `MediaPlaceholder` is decorative and does not duplicate accessible names.
7. Every card-grid `next/image` use provides explicit, non-empty `sizes`.
8. Every required route is free of document-level horizontal overflow at
   380px.
9. Deterministic layout-shift smoke remains at or below `0.1`.
10. CI retains actionable evidence for browser failures.
11. Preview smoke confirms every manifest route and landmark without a write.
12. All repository and R7 convention gates relevant to the change pass.

## Scope Boundaries

R7.10 does not include:

- A broad visual redesign.
- WCAG AAA certification.
- Certification of routes outside the approved manifest.
- Completion of a Stripe payment.
- Production database writes or schema migrations.
- Promotion of Lighthouse from advisory to blocking.
- Refactoring unrelated components that do not affect an approved contract.

Fixes discovered on an approved route remain in scope even when the correct fix
lives in a shared component used elsewhere.

## Delivery and Dependency

R7.10 is delivered as one squash-merged pull request. Its implementation branch
must be based on the merged R7.9 result so it contains the deterministic Explore
fixtures and latest shared public UI.

The design branch is initially based on the R7.9 pull-request tip to avoid
blocking specification work. After R7.9 is squash-merged, R7.10 must be rebased
onto the resulting `main` commit before implementation is published. R7.9 PR
#96 therefore remains a delivery prerequisite; its GitHub Actions job is
currently prevented from starting by the repository account's external
billing or spending-limit state and still requires explicit merge permission.

## Risks and Mitigations

### Browser-test flakiness

Fonts, animation, and third-party media can introduce nondeterminism. Tests use
explicit readiness conditions, reduced motion, controlled media failure where
needed, and retained traces rather than arbitrary waits.

### False confidence from aggregate CLS

A page can pass a `0.1` threshold while still containing an incorrectly
configured image. The source guard and shared-component tests remain blocking
independent of the browser score.

### Source-guard false positives

The guard is limited to discovered shared media and card-grid contracts. It
must distinguish layout-fill imagery from unrelated `next/image` usage and
report the exact caller that violates the rule.

### Axe suppression drift

Broad suppressions can conceal new defects. Exceptions are rule-and-selector
specific, documented, owned, and reviewed when their technical constraint
changes.

### Feature-state leakage

`BOOKING_LIVE` is process-scoped. Separate application launches and guaranteed
teardown prevent one state from contaminating the other.

## Rejected Alternatives

### Browser-only enforcement

Rendered tests catch real accessibility defects but do not reliably prevent a
new media caller from omitting `sizes` or semantic input. Browser coverage
alone also produces slower feedback for component-contract mistakes.

### Static checks only

Source checks cannot prove focus order, menu restoration, route landmarks,
rendered axe results, overflow, or layout stability.

### Preview-only axe scans

Preview data and third-party availability are less deterministic than local
fixtures. Local CI is the blocking accessibility source of truth; preview adds
deployment smoke coverage.

### Broad axe allowlists

Route-wide or rule-wide suppression weakens the zero-critical/serious
acceptance criterion and allows unrelated defects to enter silently.

### Blocking Lighthouse

Lighthouse is valuable as a trend signal, but its broader environmental
variance makes it a poor substitute for the focused deterministic contracts
approved for R7.10.

## Future Considerations

A later program may expand the manifest to authenticated flows, additional
locales, WCAG AA coverage below serious impact, or continuous accessibility
monitoring in production. Those extensions should reuse the R7.10 manifest and
evidence model without weakening its existing public-route gates.
