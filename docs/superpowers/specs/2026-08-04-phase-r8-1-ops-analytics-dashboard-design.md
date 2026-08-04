# Phase R8.1 — Ops Analytics Dashboard Design

**Phase:** R8.1 — First-party traveller measurement operations surface  
**Status:** Spec for review  
**Depends on:** R8.0 measurement baseline (`admin_traveller_analytics_report`)  
**Delivery:** one squash-merged pull request

## Objective

Give the existing KINNSO ops team a trustworthy, localized view of the R8.0
traveller measurement baseline. The dashboard must make the existing aggregate
report useful for day-to-day diagnosis while preserving its privacy, retention,
sample-floor, and authorization contracts.

R8.1 is a read-only presentation phase. It does not add new event collection,
merchant reporting, raw-ledger access, exports, rollups, alerts, or analytics
vendors.

## Ground truth and existing seams

The implementation must preserve these discovered contracts:

- `apps/web/app/[locale]/admin/layout.tsx` authenticates and gates the admin
  tree through `requireOpsPage`.
- `apps/web/components/kinnso/admin/AdminShell.tsx` owns the localized admin
  navigation and active-link treatment.
- `apps/web/lib/admin/guard.ts` provides the ops page guard used by sibling
  pages because Next may render layouts and pages in parallel.
- `apps/web/lib/admin/analytics-queries.ts` maps the
  `admin_traveller_analytics_report` RPC into UTC report rows.
- `apps/web/app/api/admin/analytics/route.ts` already enforces the authenticated
  ops role and a maximum seven-day window.
- `supabase/migrations/20260801090000_r8_0_measurement_baseline.sql` keeps the
  raw ledger private, applies an eight-day retention buffer, uses a seven-day
  attribution window, and withholds rates below a denominator of ten.
- Existing query and API coverage lives in
  `apps/web/tests/admin.analytics-queries.test.ts` and
  `apps/web/tests/api.admin-analytics.test.ts`.

No new Supabase relation, RPC, policy, or production migration is required.

## Approved decisions

- **Audience:** internal ops users only.
- **Surface:** a new localized page at `/{locale}/admin/analytics` under the
  existing private admin tree.
- **Data source:** call `getTravellerAnalyticsReport` from the server page; do
  not fetch raw rows and do not create a second reporting query.
- **Windows:** support only `24h` and `7d` UTC presets. Default to `7d`.
- **Dimensions:** allow linkable locale, entity-type, and Booking-state filters
  over the stable aggregate row grid. Invalid values fall back to `all`.
- **Privacy:** show aggregate counts and rates only. Never render journey IDs,
  event IDs, account IDs, or raw event metadata.
- **Honesty:** preserve `insufficient_sample` and null rates as an explicit
  status with explanatory copy; never substitute zero or a derived percentage.
- **Failure mode:** report/RPC failure renders a generic unavailable state and
  never exposes database or service-client details.
- **Localization:** add every visible string to all seven existing locale
  message files within the existing `admin` message group.
- **Navigation:** add one Analytics link to `AdminShell`; do not alter public
  navigation or sitemap output.

## Scope

### Included

1. A server-rendered ops page at `apps/web/app/[locale]/admin/analytics/page.tsx`
   (new file) that follows the existing locale validation, dictionary loading,
   and explicit page-level ops guard conventions.
2. A focused presentation component (planned under
   `apps/web/components/kinnso/admin/analytics/`) that renders the report
   header, window/filter links, and accessible aggregate table.
3. A navigation entry in the existing `AdminShell` with localized active state.
4. URL-state parsing for `window=24h|7d`, `locale=all|<supported locale>`,
   `entity=all|guide|experience|creator|article`, and
   `booking=all|off|on`. The implementation may choose the smallest helper
   placement that matches existing admin filter conventions.
5. Visible metadata explaining UTC timestamps, seven-day attribution, the
   selected report window, and the sample-floor rule.
6. Generic loading/unavailable/empty-state handling that does not log or expose
   raw analytics payloads.
7. Focused host/view tests plus existing analytics query, locale-parity,
   typecheck, and lint verification.

### Excluded

- New event names, instrumentation, consent behavior, retention behavior, or
  rate limits.
- Direct browser access to `traveller_analytics_events`.
- CSV/JSON export or scheduled snapshots.
- Daily materialized rollups or windows longer than seven days.
- Merchant, creator, traveler, or public reporting surfaces.
- Alerts, anomaly detection, experimentation, personalization, or vendor
  analytics.
- Changes to booking, waitlist, checkout, sign-up, or Agent product behavior.
- Production migration, production seeding, or analytics activation changes.

## User experience

### Page shell

The page uses the existing admin shell and presents:

- a localized title and concise purpose statement;
- a `24h`/`7d` window control with `aria-current` on the selected link;
- locale, entity-type, and Booking-state filter controls represented as
  linkable URL state;
- a compact note that the report is UTC-based, retained for eight days, and
  attributed across seven days;
- an aggregate table with a caption and semantic column headers.

The table columns are: metric, locale, entity type, Booking state, numerator,
denominator/sample count, rate, and status. The implementation may group rows
visually by metric, but the underlying cells remain stable and filterable.

`ok` cells show a percentage using the report's already-rounded rate. Cells
with `insufficient_sample` show an em dash for rate plus the localized status
explanation and their sample count. Status must not rely on color alone.

### State handling

- **Valid window/filter:** render the filtered aggregate grid.
- **Invalid query values:** normalize to safe defaults and render normally;
  never call the RPC with an out-of-range window.
- **No events:** preserve the report's zero cells and explain that zero is an
  observed aggregate, while insufficient cells are not interpretable rates.
- **Unavailable report:** render a generic retry-oriented message without
  database details, stack traces, or raw request values.
- **Signed out/non-ops:** rely on the existing admin guard behavior; the page
  must not add a weaker fallback path.

## Security and privacy

- The page remains inside the private localized admin tree and calls
  `requireOpsPage` before aggregate access, matching sibling pages.
- The report RPC remains the sole database boundary and continues to enforce
  `is_active_ops()` and its seven-day limit.
- No service-role credential or raw ledger query is imported into a browser
  component.
- Query-string values are allowlisted; arbitrary route, entity, or event text is
  never echoed into the page.
- Error responses remain generic and measurement failures cannot affect public
  product flows.

## Verification strategy

### Contract and page tests

- Add a host test for `/{locale}/admin/analytics` covering locale rejection,
  explicit ops gating, default `7d` behavior, `24h` behavior, and forwarding of
  normalized filters to the view.
- Add a view test covering active window/filter links, stable table headers,
  `ok` rate rendering, and honest `insufficient_sample` rendering.
- Keep the existing analytics-query and API tests green; do not weaken their
  authorization, window, or error assertions.

### Accessibility and localization

- Verify semantic table headers/caption, keyboard-reachable controls,
  `aria-current`, visible non-color status text, and narrow-screen overflow.
- Run the existing locale-parity test after adding keys to all seven message
  files.

### Build checks

Run the focused web tests, workspace typecheck, lint, and the existing R8.0
verification suite. No Supabase migration or production write is part of this
phase, so production database approval is not required for the PR.

## Acceptance criteria

1. An authenticated ops user can open `/{locale}/admin/analytics` in every
   supported locale.
2. The page defaults to a seven-day UTC report and can switch to a 24-hour
   report without exceeding the existing RPC contract.
3. Locale, entity-type, and Booking-state filters are linkable, allowlisted,
   and invalid values fail safe.
4. The page renders only aggregate report rows and never exposes raw ledger or
   identity fields.
5. Rates are shown only for `ok` cells; insufficient samples remain visibly
   honest with their denominator and explanation.
6. Signed-out and non-ops users retain existing redirect/not-found behavior.
7. All visible copy is present in all seven locale files and parity checks pass.
8. Focused tests, typecheck, lint, and the R8.0 verification baseline remain
   green, with unrelated baseline failures called out separately.
9. No new migration, production write, vendor integration, or public route is
   introduced.

## Delivery boundary

R8.1 is one focused ops-dashboard PR. Any export, long-range rollup, merchant
reporting, alerting, or additional instrumentation requires a separately
approved phase.
