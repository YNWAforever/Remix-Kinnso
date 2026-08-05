# Phase R9.0 - Legacy Cutover Readiness Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the legacy-to-new cutover provable and non-destructive to SEO. Populate `seo_redirects` from the legacy redirect map through an authenticated ingest, implement the real `--legacy-mysql` parity baseline so the cutover gate measures something, and record the runbook that ties them together.

**Architecture:** Two independent gaps close in the packages that already own their halves. `apps/sync` gains one admin-guarded ingest route that feeds the existing, already-tested `parseRedirectsPhp` into `seo_redirects` — no new parser. `packages/parity` stops refusing to build its MySQL baseline and instead derives that baseline from `@kinnso/sync`'s `LegacyReader`, so the cutover gate reuses the one configured MySQL pool (TLS mode, timezone, connection diagnostics) rather than opening a second, unguarded one. Both halves must express "published" and "visible translation" using the same rules the sync itself applies, or the gate compares two different definitions and fails on differences that do not exist.

**Tech Stack:** Hono on Node (apps/sync), mysql2 with named placeholders (packages/sync), Supabase service-role client, TypeScript, Vitest.

## Why this phase

Three facts, each verified against the current tree:

- `apps/web/proxy.ts:17` fetches `seo_redirects` at request time and serves 307s from it, but **no production path writes that table**. It is populated only by `supabase/seed.sql`. Every legacy URL 404s on cutover.
- `n8n/flows/backfill.md:5` instructs operators to `POST {APPS_SYNC_URL}/redirects`. That route does not exist (`apps/sync/src/app.ts` serves `/health`, `/webhook/foso`, `/sync/:id`, `/backfill`). `parseRedirectsPhp` has no production caller.
- `packages/parity/src/sources/legacy.ts` refuses to construct the `--legacy-mysql` source, because its queries were stubs returning empty sets and an empty baseline makes every check vacuously true. The refusal is correct and deliberate; it is also a hard stop on the documented cutover gate until the queries exist.

## Global Constraints

- Do not weaken the current safety property: a baseline that cannot be measured must fail as misconfiguration (exit 2), never pass. `MYSQL_MODE_NOT_IMPLEMENTED` may only be deleted in the same change that makes the queries real.
- Reuse `parseRedirectsPhp` (packages/sync/src/redirects.ts) exactly as-is. It is covered by packages/sync/tests/redirects.test.ts and encodes a real legacy detail: the macro defaults to 302 while every current entry passes an explicit status.
- The parity MySQL baseline must read through `@kinnso/sync`'s `LegacyReader`, not a new pool. That reader is where `LEGACY_DB_SSL`, `LEGACY_DB_TIMEZONE`, and `diagnoseLegacyConnectionError` live; a second pool would silently bypass all three.
- "Published" and "visible translation" must come from the sync's own predicates, not be re-derived. If a rule is not currently exported, export it rather than copying it — two definitions that drift produce a gate that fails on phantom differences.
- Ingest is idempotent: `seo_redirects.from_path` is `unique`, so upsert on that column. Re-running the backfill must converge, not error and not duplicate.
- The ingest endpoint carries the same `x-admin-token` guard as `/sync/:id` and `/backfill`, compared with the constant-time helper in `apps/sync/src/safe-equal.ts`.
- Bound the ingest body. `redirect.php` is a source file, not user input, but the route accepts a POST body and must not be an unbounded buffer.
- No change to `apps/web`. The proxy already reads the table correctly; this phase fills it.
- No production write from tests. Parity remains read-only against both sides.
- Use TDD: write a failing test, run it, implement the smallest change, rerun the focused test, then commit each task.

## Non-goals

- Running the actual production cutover. This phase makes the gate able to answer; it does not flip DNS.
- Changing the sync's article transform, publication gate, or upsert path.
- Implementing `--legacy-sitemap` differently. It already works and stays the lighter-weight option.
- Backfilling historical redirects into the legacy system. Data flows one way: legacy is the source.

---

## File Map

### Task 1 - Redirect ingest

- Modify: `apps/sync/src/app.ts` - add the admin-guarded `POST /redirects` route beside `/backfill`.
- Modify: `apps/sync/src/server.ts` - pass the redirect writer into `createApp` deps.
- Create: `packages/sync/src/redirect-writer.ts` - upsert parsed redirects into `seo_redirects` via the service-role client.
- Modify: `packages/sync/src/index.ts` - export the writer.
- Create: `packages/sync/tests/redirect-writer.unit.test.ts` - upsert shape, idempotency, error propagation.
- Modify: `apps/sync/tests/app.test.ts` - unauthorized, oversized body, parse-and-write happy path, idempotent re-post.
- Modify: `n8n/flows/backfill.md` - correct the step to describe the route that now exists.

### Task 2 - Legacy baseline queries

- Modify: `packages/sync/src/reader.ts` - add `publishedArticleRows()` and `localeTranslationCounts()` through the existing `guard()`.
- Modify: `packages/sync/src/index.ts` - export the row types.
- Create: `packages/sync/tests/reader.baseline.unit.test.ts` - SQL parameterization and row mapping against a fake pool.

### Task 3 - Real MySQL parity source

- Modify: `packages/parity/src/sources/legacy.ts` - implement `createMysqlLegacySource`; delete `MYSQL_MODE_NOT_IMPLEMENTED` only here.
- Modify: `packages/parity/package.json` - depend on `@kinnso/sync`.
- Modify: `packages/parity/tests/legacy.test.ts` - replace the "refuses to build" assertion with baseline-derivation coverage.
- Modify: `packages/parity/README.md` - describe the mode as implemented and state its prerequisites.

### Task 4 - Cutover runbook and verification

- Create: `docs/ops/r9-0-cutover-runbook.md` - the ordered procedure, what each exit code means, and the abort conditions.
- Review: all Task 1-3 source/test files.

---

### Task 1: Redirect ingest

**Files:**
- Modify: `apps/sync/tests/app.test.ts`
- Create: `packages/sync/tests/redirect-writer.unit.test.ts`
- Create: `packages/sync/src/redirect-writer.ts`
- Modify: `apps/sync/src/app.ts`, `apps/sync/src/server.ts`, `packages/sync/src/index.ts`
- Modify: `n8n/flows/backfill.md`

**Interfaces:**
- Consumes: `parseRedirectsPhp(php: string): SeoRedirect[]` from packages/sync/src/redirects.ts; `SeoRedirect = Database['public']['Tables']['seo_redirects']['Insert']`.
- Produces: `writeRedirects(db, rows: SeoRedirect[]): Promise<{ written: number }>` — a single `upsert(rows, { onConflict: 'from_path' })`, error-checked and thrown like every other write in `upserter.ts`.
- Route: `POST /redirects`, `x-admin-token` required, `text/plain` body (the contents of `redirect.php`), responds `{ ok: true, parsed, written }`.

**Steps:**
- [ ] Step 1: Write a failing test that `POST /redirects` without a valid admin token returns 401 and never touches the writer.
- [ ] Step 2: Write a failing test that a body over the cap returns 413 without parsing.
- [ ] Step 3: Write a failing test that a realistic `redirect.php` excerpt yields the parsed rows, upserted once with `onConflict: 'from_path'`.
- [ ] Step 4: Write a failing test that posting the same content twice reports the same `written` count and issues a second upsert rather than an insert conflict.
- [ ] Step 5: Implement `writeRedirects`, wire the route, and export from the package index until each test passes.
- [ ] Step 6: Correct `n8n/flows/backfill.md` step 2 to state the real route, the header, and the content type.

**Verification:**

~~~bash
pnpm --filter @kinnso/sync test
pnpm --filter @kinnso/sync-app test
pnpm typecheck
~~~

Expected: new tests pass; no change to existing sync behaviour.

---

### Task 2: Legacy baseline queries

**Files:**
- Create: `packages/sync/tests/reader.baseline.unit.test.ts`
- Modify: `packages/sync/src/reader.ts`, `packages/sync/src/index.ts`

**Interfaces:**
- `publishedArticleRows(afterId?, limit?): Promise<Array<{ url: string; category: string; isCoupon: boolean; locales: string[] }>>` — keyset-paginated on `posts.id`, matching `allPostIds`'s existing pagination shape. Rows must satisfy the same predicate the sync's `isPostLive` applies (`!deleted_at && !!published_at`), and `locales` must contain exactly the locales whose `post_translations` row is visible by the sync's own rule.
- `localeTranslationCounts(): Promise<Record<string, number>>` — per-locale count over the same visible-translation predicate.

**Design decisions to settle before writing SQL** (record the answer in a comment beside each query):
- **Category mapping.** `PublishedArticle.category` is the new stack's singular DB enum value; legacy carries `post_category_weights.category_slug`. Reuse whatever the sync transform already uses to pick a category (`packages/sync/src/transform/category.ts`) rather than inventing a second mapping.
- **Visible translation.** The sync decides which translations survive (`packages/sync/src/transform/index.ts`). Export that predicate and call it; do not re-express it in SQL unless it is expressible identically, and say which you chose.
- **Expired articles.** `end_at` in the past makes an article non-live on the new stack. Decide whether the baseline excludes them (so they are absent from `expectedUrlPaths`) or includes them in `negativePaths`. The fixtures put an expired article in `negativePaths`, so follow that.

**Steps:**
- [ ] Step 1: Write failing tests asserting both queries use named placeholders and never interpolate, mapping fake pool rows to the documented shapes.
- [ ] Step 2: Write a failing test that pagination is keyset (`id > :afterId`), not OFFSET, matching `allPostIds`.
- [ ] Step 3: Implement both queries inside `this.guard(...)` so a TLS or connectivity failure is diagnosed rather than surfacing as a raw driver error.
- [ ] Step 4: Export the row types and confirm no existing sync test changes behaviour.

**Verification:**

~~~bash
pnpm --filter @kinnso/sync test
pnpm typecheck
~~~

---

### Task 3: Real MySQL parity source

**Files:**
- Modify: `packages/parity/tests/legacy.test.ts`
- Modify: `packages/parity/src/sources/legacy.ts`, `packages/parity/package.json`, `packages/parity/README.md`

**Interfaces:**
- `createMysqlLegacySource(dsn)` returns a `LegacySource` whose four methods are backed by Task 2's reader:
  - `expectedUrlPaths()` — fan each published row across its locales through the **same** `detailPath(locale, category, url)` helper the newstack side uses (`packages/parity/src/url.ts`). Both sides must agree on routing or every path mismatches.
  - `localeCounts()` — straight from `localeTranslationCounts()`.
  - `redirectSamples()` — read `seo_redirects` written by Task 1; the legacy redirect map is the baseline, so sampling it closes the loop.
  - `negativePaths()` — draft, expired, and missing-translation paths, per the fixture convention.
- The DSN must be parsed into the `SyncConfig['legacy']` shape so `LEGACY_DB_SSL` / `LEGACY_DB_TIMEZONE` still apply. A DSN that cannot carry those settings must fail loudly rather than silently disabling TLS.

**Steps:**
- [ ] Step 1: Write a failing test that the source fans locale paths through `detailPath` and returns the union.
- [ ] Step 2: Write a failing test that an unroutable category surfaces as a baseline error, not a silently dropped path — a dropped path would shrink the baseline and weaken the gate exactly like the empty-set bug this replaces.
- [ ] Step 3: Write a failing test that a DSN lacking explicit TLS settings does not silently downgrade the connection.
- [ ] Step 4: Implement the source; delete `MYSQL_MODE_NOT_IMPLEMENTED` and its test in the same commit.
- [ ] Step 5: Update the README so the documented cutover gate matches reality.

**Verification:**

~~~bash
pnpm --filter @kinnso/parity test
pnpm typecheck
~~~

Expected: the "refuses to build" test is gone, replaced by derivation coverage. No check may pass on an empty baseline — assert that explicitly.

---

### Task 4: Cutover runbook and verification

**Files:**
- Create: `docs/ops/r9-0-cutover-runbook.md`

**Steps:**
- [ ] Step 1: Record the ordered procedure: confirm TLS mode with `pnpm --filter @kinnso/sync preflight`, run `POST /redirects` with `redirect.php`, run `POST /backfill`, then run the parity gate with `--legacy-mysql`.
- [ ] Step 2: Record what each exit code means (0 pass, 1 parity failure, 2 misconfiguration) and that exit 2 means the gate never ran — it is not a soft pass.
- [ ] Step 3: Record the abort conditions: any `url-coverage` failure, any missing redirect sample, any locale count below baseline.
- [ ] Step 4: Full-repository verification.

**Verification:**

~~~bash
pnpm typecheck
pnpm lint
pnpm test
~~~

Expected: green across all packages, with the pre-existing `Booking ON` CI gap (missing `STRIPE_SECRET_KEY`) reported separately and not treated as an R9.0 regression.

---

## Plan self-review checklist

- Every gap named in "Why this phase" maps to Task 1, 2, or 3; Task 4 records how they are used together.
- The safety property is preserved: the only change to the refusal is deleting it in the same commit that makes the baseline real, and Task 3 Step 2 explicitly forbids silently shrinking the baseline.
- One MySQL pool, one TLS policy, one timezone policy — the parity source borrows the reader instead of opening its own.
- Both sides of every comparison use one definition: `detailPath` for routing, the sync's own predicates for published and visible.
- The ingest is idempotent by construction (`from_path` is unique) and guarded by the same admin token as the other write routes.
- No task changes `apps/web`, the sync transform, or any production data path other than the redirect table the proxy already expects to be populated.
