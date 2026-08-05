# Phase R8.2 - Measurement Health Design

**Phase:** R8.2 - Read-only traveller measurement health
**Status:** Design approved for written-spec review
**Depends on:** R8.0 measurement baseline and the R8.1 ops analytics dashboard
**Delivery:** one focused pull request

## Objective

Add a small, trustworthy health summary to the existing localized ops analytics
dashboard. The summary answers one question: **is the selected aggregate report
present and interpretable?** It must distinguish a valid empty filter result,
observed zero activity, withheld insufficient samples, and an unavailable
report without inventing freshness or retention claims that the current data
boundary cannot support.

R8.2 is a read-only presentation and derivation phase. It does not add event
collection, a new analytics query, a persisted health table, a scheduler,
exports, alerts, rollups, vendor analytics, or production writes.

## Ground truth and existing seams

R8.2 builds on these discovered R8.0/R8.1 contracts:

- `apps/web/lib/admin/analytics-queries.ts` is the sole adapter from the
  `admin_traveller_analytics_report` RPC to aggregate-only
  `TravellerAnalyticsReport` and `TravellerAnalyticsReportRow` values.
- `apps/web/lib/admin/analytics-dashboard.ts` owns the existing allowlisted
  `24h`/`7d` window and locale/entity/Booking filters and filtered-row logic.
- `apps/web/app/[locale]/admin/analytics/page.tsx` applies locale validation,
  the explicit ops guard, the bounded report request, and generic unavailable
  handling before rendering the view.
- `apps/web/components/kinnso/admin/analytics/AdminAnalyticsView.tsx` renders
  the localized filters, report metadata, aggregate table, empty state, and
  observed-zero explanation.
- The R8.0 report exposes UTC metadata, a seven-day attribution window, stable
  aggregate rows, `ok`/`insufficient_sample` statuses, and null rates where a
  rate is not interpretable.

No new Supabase relation, RPC, policy, retention signal, or production
migration is required or allowed in this phase.

## Approved decisions

- **Audience:** internal ops users already authorized to view `/admin/analytics`.
- **Surface:** inline above the existing dashboard filters and table; no new
  route or navigation item.
- **Data source:** the existing filtered `TravellerAnalyticsReport` only. The
  health summary makes no additional database request.
- **Implementation shape:** extend the existing pure helper module and pass a
  derived summary into the existing view. Do not put health business rules
  directly in JSX.
- **Health claim:** report presence and interpretability only. The UI must not
  claim ingestion freshness, purge execution, or retention compliance because
  those signals are not present in the current aggregate contract.
- **Empty filters:** zero returned rows after a valid filter are a neutral
  `no_matching_rows` state, not observed zero and not unavailable.
- **Status precedence:** `unavailable` -> `no_matching_rows` ->
  `observed_zero` -> `insufficient_sample` -> `available`.
- **Privacy:** aggregate counts and statuses only. No raw identifiers,
  payloads, service-role client, or error details cross into the view.
- **Localization:** every new visible label and state explanation is added to
  all seven existing locale dictionaries in the existing `admin` message
  group.

## Scope

### Included

1. Add a pure `AnalyticsHealthSummary` type and
   `deriveAnalyticsHealthSummary` function to
   `apps/web/lib/admin/analytics-dashboard.ts`.
2. Compute the summary in the existing analytics page after URL filters have
   been applied, then pass it to `AdminAnalyticsView`.
3. Render an inline semantic health section above the filter controls.
4. Add localized labels for the heading, overall statuses, and row counts in
   all seven locale dictionaries.
5. Extend focused helper, page-host, view, and locale-parity tests.
6. Re-run the existing R8.0 analytics/privacy baseline and normal web quality
   checks.

### Excluded

- New event names, ingestion instrumentation, consent behavior, or retention
  behavior.
- A latest-event/freshness query, purge-run tracking, or a health snapshot
  table.
- Direct browser access to `traveller_analytics_events`.
- CSV/JSON export, scheduled rollups, windows longer than seven days, alerts,
  anomaly detection, experimentation, or vendor analytics.
- Merchant, creator, traveller, public, or external reporting surfaces.
- Changes to booking, waitlist, checkout, sign-up, or Agent behavior.
- Any production migration, seeding, activation, or data write.

## Health contract

The pure helper receives the filtered rows and the existing unavailable state.
It returns a stable summary with:

- `status`: `unavailable | no_matching_rows | observed_zero |
  insufficient_sample | available`;
- `returnedRows`: number of filtered report rows;
- `okRows`: rows whose report status is `ok`;
- `insufficientRows`: rows whose report status is `insufficient_sample`;
- `observedZeroRows`: rows whose numerator and denominator are both zero.

The function applies these rules in order:

1. If the page caught the report error, return `unavailable` with zero
   aggregate counts.
2. If the report succeeded but the filtered row list is empty, return
   `no_matching_rows`.
3. If every filtered row has numerator `0` and denominator `0`, return
   `observed_zero` while retaining the observed-zero row count.
4. If any filtered row has status `insufficient_sample`, return
   `insufficient_sample`.
5. Otherwise return `available`.

The helper does not calculate rates, replace nulls, infer activity from the
selected window, or reinterpret the report's attribution metadata. Existing
R8.1 table behavior remains the source of truth for per-row rendering.

## User experience and accessibility

The inline section contains:

- a localized heading such as `Measurement health`;
- the selected UTC report window and existing attribution metadata;
- one visible overall status using the precedence above;
- localized counts for returned, interpretable, withheld, and observed-zero
  rows;
- a concise explanation for the selected state, including the existing
  observed-zero and insufficient-sample honesty copy.

Accessibility requirements:

- Use a labelled semantic `<section>` above the filters/table.
- Use `role="status"` for normal states and `role="alert"` only for
  `unavailable`.
- Status meaning must be present in text and cannot depend on color.
- Use locale-aware number formatting for all counts.
- Keep the section readable on narrow screens and preserve the existing
  keyboard-reachable filter links and `aria-current` behavior.
- Never echo arbitrary query-string values or report identifiers.

## Error handling and privacy

- The existing page-level catch remains the only report failure boundary.
- A report failure produces a generic unavailable panel and the existing retry
  copy; database messages, stack traces, and request values remain hidden.
- A valid filter with no rows produces a neutral no-matching state.
- Observed zero remains an aggregate observation, never a replacement for an
  insufficient sample.
- The helper and view consume only aggregate row fields already exposed by the
  R8.0 adapter. No service-role credential or raw-ledger import is added.
- No new logging is introduced for report payloads or health summaries.

## Verification strategy

### Pure contract tests

Extend `apps/web/tests/admin.analytics-dashboard.test.ts` with a truth table
covering:

- unavailable reports;
- empty filtered results;
- all-zero rows;
- insufficient-sample rows;
- mixed `ok` and insufficient rows;
- a normal all-`ok` report;
- returned/ok/insufficient/observed-zero count calculation.

### Page and view tests

- Extend `apps/web/tests/admin.analytics.host.test.tsx` to verify the page
  derives health after filtering and passes an unavailable summary on report
  failure.
- Extend `apps/web/tests/kinnso.AdminAnalyticsView.test.tsx` to assert the
  semantic section, localized state/count labels, role behavior, and neutral
  empty-filter state.
- Extend `apps/web/tests/i18n.locale-parity.test.ts` expectations for all new
  `admin` message keys.

### Quality and regression checks

Run the focused R8.1 suites, web typecheck, web lint, locale parity, and the
existing R8.0 measurement/privacy tests. Keep unrelated baseline warnings and
environment-gated build failures separately identified; do not weaken the
authorization, privacy, retention, or sample-floor tests.

## Acceptance criteria

1. An authorized ops user sees a health summary inline on every supported
   locale of `/admin/analytics`.
2. The summary is derived only from the selected aggregate rows and makes no
   additional database request.
3. Unavailable, no-matching, observed-zero, insufficient-sample, and available
   states are deterministic and visibly distinct.
4. Counts are accurate, localized, and never expose raw identifiers or payloads.
5. Rates and null/sample-floor semantics remain unchanged from R8.0/R8.1.
6. Non-ops and signed-out behavior remains governed by the existing page guard.
7. All new visible copy exists in all seven locale dictionaries and parity
   checks pass.
8. Focused tests, typecheck, lint, and the R8.0 regression baseline remain
   green, with unrelated environment failures called out separately.
9. The diff contains no migration, RPC, persistence, scheduler, vendor,
   export, alert, public-route, or production-write change.

## Delivery boundary

R8.2 is one small, read-only health-summary PR. Any ingestion freshness,
retention execution telemetry, persisted snapshots, rollups, exports, alerts,
or broader reporting requires a separately approved phase and data contract.
