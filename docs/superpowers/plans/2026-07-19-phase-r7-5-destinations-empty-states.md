# Phase R7.5 Destinations and Empty States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make destinations discoverable from real published inventory, make destination pages useful and search-readable, capture demand honestly while sessions are not live, and remove empty article-category chrome.

**Architecture:** Add a read-only `security_invoker` Postgres view that aggregates published guide and experience inventory by normalized city and overlays optional curated destination metadata. Keep the existing destination query API but point it at the view. Add an append-only session waitlist with a server action that reuses the existing RSVP abuse controls. Compose the public pages from the existing guide, experience, article, session, media, product-state, SEO, and locale primitives instead of creating parallel systems.

**Tech Stack:** Next.js App Router, React Server Components, TypeScript, Supabase Postgres/RLS, Vitest, Testing Library, Playwright, pnpm/Turborepo.

## Global Constraints

- Treat `kinnso-phase-r7-ux-hardening-spec.md` and §7 of `docs/superpowers/specs/2026-07-02-product-revision-program-design.md` as binding.
- Discover any unlisted symbol or path through the codebase graph before editing it; use text search only for config, SQL, literals, and tests.
- Use test-driven development for every behavior change: add one failing assertion, run it and confirm the expected failure, implement the minimum, then rerun.
- Create migrations only with `pnpm supabase migration new <name>`; use the exact CLI-emitted path in subsequent commands and update this checklist with that path before committing.
- Never rewrite an applied migration. Do not apply R7.5 migrations to production without a new, explicit production approval.
- After local migrations pass, regenerate `packages/db/types.ts` from the reset local database.
- Preserve all creator-copilot code, frozen content URLs, and previously shipped migrations.
- Preserve locale-host routing, canonical/hreflang conventions, and public copy parity across `en`, `zh-hk`, `zh-cn`, `ja`, `ko`, `th`, and `id`.
- Keep cards honest: render `EntityMedia`/`MediaPlaceholder`; never invent imagery or display zero counts.
- Keep destination/session data access through the existing Supabase clients and R6 query functions. Do not add a second destination backend.
- Commit after each coherent task. Run focused checks after each task and the full R7.5 verification matrix before publication.

---

## Task 1: Add the inventory-derived destination view

**Files:**

- Create via CLI: the exact file printed by `pnpm supabase migration new r7_5_destination_index`
- Create: `apps/web/tests/db.r7-5-destination-index.test.ts`
- Modify after local reset: `packages/db/types.ts`

- [ ] **Step 1: Generate the migration file through Supabase CLI**

Run:

```powershell
pnpm supabase migration new r7_5_destination_index
```

Expected: one new timestamped SQL file under `supabase/migrations/`. Record its exact path in this task before the first commit.

- [ ] **Step 2: Write a failing static SQL contract test**

In `apps/web/tests/db.r7-5-destination-index.test.ts`, read the CLI-created migration by its exact filename and assert that it:

```ts
expect(sql).toContain('create view public.destination_index')
expect(sql).toContain('with (security_invoker = true)')
expect(sql).toContain("where status = 'published'")
expect(sql).toContain('guide_count')
expect(sql).toContain('experience_count')
expect(sql).toContain('latest_published_at')
expect(sql).toContain('revoke all on public.destination_index from anon, authenticated')
expect(sql).toContain('grant select on public.destination_index to anon, authenticated')
```

Also assert that the migration does not grant insert, update, or delete on the view.

- [ ] **Step 3: Run the contract test and confirm the expected failure**

Run:

```powershell
pnpm --filter web exec vitest run tests/db.r7-5-destination-index.test.ts --reporter=dot
```

Expected: FAIL because the generated migration is empty.

- [ ] **Step 4: Implement the destination view migration**

Use CTEs with these responsibilities:

1. `published_inventory`: `UNION ALL` published guides and published experiences, exposing `kind`, trimmed `city`, media URL, and publication timestamp. Exclude null/blank cities.
2. `normalized_inventory`: normalize case and whitespace into a stable `city_key` while preserving an observed display spelling.
3. `inventory_rollup`: group by `city_key`; count guides and experiences with `FILTER`, choose the most recently published non-null media URL, and compute `latest_published_at`.
4. `published_curated`: expose only `destinations.status = 'published'`; match normalized `name` and every `match_terms` entry.
5. `curated_choice`: deterministically choose at most one curated row per inventory city by exact generated-slug match first, normalized name/match-term second, then `sort_order`, then `slug`.

The final view must expose exactly:

```sql
slug text,
name text,
hero_image_url text,
description text,
match_terms text[],
guide_count bigint,
experience_count bigint,
latest_published_at timestamptz,
sort_order integer
```

Generate a stable lowercase slug from the normalized city. Replace non-ASCII alphanumeric runs with hyphens, trim hyphens, and use `destination-` plus the first ten characters of `md5(city_key)` only when transliteration produces an empty slug. A published curated row may override `slug`, `name`, `hero_image_url`, `description`, `match_terms`, and `sort_order`, but it may not create a destination without published inventory or override counts.

End the migration with:

```sql
revoke all on public.destination_index from anon, authenticated;
grant select on public.destination_index to anon, authenticated;
```

- [ ] **Step 5: Pass the static migration contract**

Run:

```powershell
pnpm --filter web exec vitest run tests/db.r7-5-destination-index.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 6: Reset the local database and test view behavior**

Run:

```powershell
pnpm supabase stop --no-backup
pnpm supabase start
pnpm supabase db reset
```

If port `54322` is occupied, inspect the owner first with `docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Ports}}"`; stop only a stale KINNSO Supabase stack, never an unrelated container.

Use `pnpm supabase db query` or `psql` against the local database to insert a minimal published/draft guide and published/draft experience fixture inside a transaction, then assert:

- case/whitespace variants of the same city form one row;
- drafts do not affect counts;
- a published curated match overrides presentation fields;
- a curated destination with no inventory does not appear;
- counts and `latest_published_at` are correct;
- anon/authenticated can select the view and cannot mutate it.

Rollback the transaction.

- [ ] **Step 7: Regenerate database types from the reset local database**

Run:

```powershell
pnpm supabase gen types typescript --local | Set-Content -Encoding utf8 packages/db/types.ts
pnpm --filter @kinnso/db typecheck
```

Expected: `packages/db/types.ts` contains `destination_index` under `Views`; DB package typecheck passes.

- [ ] **Step 8: Commit the database foundation**

```powershell
git add supabase/migrations apps/web/tests/db.r7-5-destination-index.test.ts packages/db/types.ts
git commit -m "feat(db): derive destination index from published inventory"
```

---

## Task 2: Point the existing destination query API at the view

**Files:**

- Modify: `apps/web/lib/destinations/queries.ts`
- Modify: `apps/web/tests/destinations.queries.test.ts`

- [ ] **Step 1: Replace curated-table expectations with view expectations**

Update the mocked query-builder tests to require `.from('destination_index')` and map this database shape:

```ts
{
  slug: 'tokyo',
  name: 'Tokyo',
  hero_image_url: null,
  description: null,
  match_terms: ['Tokyo'],
  guide_count: 1,
  experience_count: 1,
  latest_published_at: '2026-07-19T00:00:00.000Z',
  sort_order: 0,
}
```

to:

```ts
{
  slug: 'tokyo',
  name: 'Tokyo',
  heroImageUrl: null,
  description: null,
  matchTerms: ['Tokyo'],
  guideCount: 1,
  experienceCount: 1,
  latestPublishedAt: '2026-07-19T00:00:00.000Z',
}
```

Assert deterministic ordering by `sort_order`, then `name`, then `slug`. Assert `getDestinationBySlug` uses the same view and `getDestinationsForSitemap` maps `latest_published_at` to `publishedAt`.

- [ ] **Step 2: Run the focused test and confirm it fails**

```powershell
pnpm --filter web exec vitest run tests/destinations.queries.test.ts --reporter=dot
```

Expected: FAIL because the code still queries `destinations` and lacks counts.

- [ ] **Step 3: Implement the minimum query-layer change**

Extend `Destination` with:

```ts
guideCount: number
experienceCount: number
latestPublishedAt: string | null
```

Keep the public function names unchanged:

- `getPublishedDestinations()`
- `getDestinationBySlug(slug)`
- `getDestinationsForSitemap()`

Replace the table/column constants with the generated view and coerce nullable numeric view values to non-negative numbers. Do not retain a `status` filter because the view already contains only published inventory.

- [ ] **Step 4: Pass focused tests and typecheck**

```powershell
pnpm --filter web exec vitest run tests/destinations.queries.test.ts tests/sitemap.test.ts --reporter=dot
pnpm --filter web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the query change**

```powershell
git add apps/web/lib/destinations/queries.ts apps/web/tests/destinations.queries.test.ts
git commit -m "feat(web): read destinations from inventory view"
```

---

## Task 3: Render honest destination index cards in all locales

**Files:**

- Modify: `apps/web/components/kinnso/pages/DestinationsIndexView.tsx`
- Modify: `apps/web/tests/destinations.host.test.tsx`
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`
- Modify: `apps/web/lib/i18n/messages/id.ts`

- [ ] **Step 1: Add failing index-card assertions**

Update the host test fixture to include counts. Assert that a Tokyo card with one guide and two experiences renders localized count labels, links to `/en/destinations/tokyo`, and renders `[data-media-placeholder="true"]` when media is null. Add separate assertions that a zero guide count and a zero experience count are omitted rather than rendered as `0`.

- [ ] **Step 2: Confirm the index test fails**

```powershell
pnpm --filter web exec vitest run tests/destinations.host.test.tsx --reporter=dot
```

Expected: FAIL because counts and `EntityMedia` are not yet rendered.

- [ ] **Step 3: Add locale-safe count messages**

Add destination count-format functions/strings to the `Messages` type in `en.ts` and provide natural translations in all seven locale files. Keep plural handling correct for English and natural counter syntax for the other locales. Do not copy English into non-English files.

- [ ] **Step 4: Replace raw image markup with `EntityMedia` and render nonzero counts**

Use the established `EntityMedia` props with the destination name, optional description/location, and the inventory-selected `heroImageUrl`. Build the metadata row from only positive counts; omit the row entirely if both are zero. Keep the curated description optional and preserve the existing card/link semantics.

- [ ] **Step 5: Pass index, parity, and accessibility-focused tests**

```powershell
pnpm --filter web exec vitest run tests/destinations.host.test.tsx tests/i18n.locale-parity.test.ts --reporter=dot
pnpm --filter web lint
```

Expected: PASS.

- [ ] **Step 6: Commit the destination index UI**

```powershell
git add apps/web/components/kinnso/pages/DestinationsIndexView.tsx apps/web/tests/destinations.host.test.tsx apps/web/lib/i18n/messages
git commit -m "feat(web): show honest destination inventory counts"
```

---

## Task 4: Complete destination detail discovery and structured data

**Files:**

- Modify: `apps/web/app/[locale]/destinations/[slug]/page.tsx`
- Modify: `apps/web/components/kinnso/pages/DestinationDetailView.tsx`
- Modify: `apps/web/lib/seo/jsonld.ts`
- Modify: `apps/web/tests/destinations.slug.host.test.tsx`
- Modify: `apps/web/tests/seo.jsonld.test.ts`
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`
- Modify: `apps/web/lib/i18n/messages/id.ts`

- [ ] **Step 1: Add failing detail-page orchestration tests**

Mock `searchArticles` and `getProductState`. Assert:

- articles are fetched using the destination's canonical name/match terms as the existing city/tag heuristic;
- published articles appear in a localized Articles section;
- the Articles section is absent when the query is empty;
- sessions are not queried or rendered when `sessionsLive` is false;
- sessions are queried/rendered only when `sessionsLive` is true;
- empty guides/experiences/sessions copy is removed because optional empty sections are hidden;
- localized metadata uses the destination name and localized description pattern.

- [ ] **Step 2: Add a failing `ItemList` JSON-LD unit test**

Define the intended helper contract:

```ts
itemListJsonLd({
  name: 'Tokyo travel resources',
  items: [
    { name: 'Tokyo ramen guide', url: 'https://www.kinnso.ai/en/g/tokyo-ramen' },
    { name: 'Ramen crawl', url: 'https://www.kinnso.ai/en/experiences/ramen-crawl' },
  ],
})
```

Assert `@type: 'ItemList'`, `numberOfItems: 2`, and one-based `ListItem.position` values.

- [ ] **Step 3: Confirm both focused suites fail for the intended reasons**

```powershell
pnpm --filter web exec vitest run tests/destinations.slug.host.test.tsx tests/seo.jsonld.test.ts --reporter=dot
```

Expected: FAIL because articles/product-state gating/ItemList do not exist.

- [ ] **Step 4: Add localized detail section and metadata copy**

Add `articlesHeading` and the localized metadata description pattern to `destinations` in all seven locale files. Remove now-unused empty-section strings only if graph/text search confirms no remaining caller; otherwise leave them for compatibility.

- [ ] **Step 5: Implement `itemListJsonLd`**

In `apps/web/lib/seo/jsonld.ts`, return a serializable object with `@context`, `@type`, `name`, `numberOfItems`, and `itemListElement`. Exclude no valid item and keep URL creation in the route, not the helper.

- [ ] **Step 6: Compose the detail route from existing backends**

Load the destination first, then run independent data fetches concurrently:

- guides from `getGuidesForRegions(destination.matchTerms)`;
- experiences from `getExperiencesForCities(destination.matchTerms)`;
- articles from the existing `searchArticles` RPC using the destination name/match terms heuristic and a bounded result limit;
- product state from `getProductState()`;
- sessions from `getSessionsForDestination` only after/when `sessionsLive` is true.

Pass articles and gated sessions to `DestinationDetailView`. Build an ItemList from the actually rendered guides, experiences, articles, and live sessions, using locale-host public URLs. Render the existing breadcrumb block plus the ItemList block only when it has at least one item.

- [ ] **Step 7: Hide empty optional sections in the view**

Render each Guides, Experiences, Articles, and Sessions section only when its item array is non-empty. Reuse existing cards for each content type; do not duplicate card implementations. The sessions section must never receive hidden-flag data.

- [ ] **Step 8: Pass detail, SEO, locale, and type checks**

```powershell
pnpm --filter web exec vitest run tests/destinations.slug.host.test.tsx tests/seo.jsonld.test.ts tests/i18n.locale-parity.test.ts --reporter=dot
pnpm --filter web typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit destination detail discovery**

```powershell
git add apps/web/app/[locale]/destinations/[slug]/page.tsx apps/web/components/kinnso/pages/DestinationDetailView.tsx apps/web/lib/seo/jsonld.ts apps/web/tests/destinations.slug.host.test.tsx apps/web/tests/seo.jsonld.test.ts apps/web/lib/i18n/messages
git commit -m "feat(web): enrich destination discovery pages"
```

---

## Task 5: Add the append-only session waitlist

**Files:**

- Create via CLI: the exact file printed by `pnpm supabase migration new r7_5_session_waitlist`
- Create: `apps/web/tests/db.r7-5-session-waitlist.test.ts`
- Modify after local reset: `packages/db/types.ts`

- [ ] **Step 1: Generate the migration file through Supabase CLI**

```powershell
pnpm supabase migration new r7_5_session_waitlist
```

Expected: one new timestamped SQL file under `supabase/migrations/`. Record its exact path in this task before the first commit.

- [ ] **Step 2: Write a failing static SQL contract test**

Assert that the new migration creates `public.session_waitlist` with:

- UUID primary key defaulting to `gen_random_uuid()`;
- normalized email text with length/format checks;
- nullable `user_id` referencing `auth.users(id) on delete set null`;
- locale constrained to the seven supported locale codes;
- `created_at timestamptz not null default now()`;
- a unique index on `lower(email)`;
- RLS enabled;
- insert policies/grants for anon and authenticated;
- authenticated ops-only select through the existing `public.is_active_ops()` helper;
- no update/delete policy or grant.

- [ ] **Step 3: Confirm the test fails, then implement the migration**

```powershell
pnpm --filter web exec vitest run tests/db.r7-5-session-waitlist.test.ts --reporter=dot
```

Expected before implementation: FAIL because the generated migration is empty.

Implement an append-only table. Revoke all privileges first, then grant only insert to anon/authenticated and select to authenticated. The insert policy must permit `user_id is null or user_id = auth.uid()`; the select policy must use `public.is_active_ops()`.

- [ ] **Step 4: Pass static and local database behavior checks**

```powershell
pnpm --filter web exec vitest run tests/db.r7-5-session-waitlist.test.ts --reporter=dot
pnpm supabase db reset
```

Use local role checks to verify anon insert succeeds, duplicate normalized email is rejected, anon select fails, non-ops authenticated select returns no rows, and update/delete fail.

- [ ] **Step 5: Regenerate types and validate the DB package**

```powershell
pnpm supabase gen types typescript --local | Set-Content -Encoding utf8 packages/db/types.ts
pnpm --filter @kinnso/db typecheck
```

Expected: `session_waitlist` appears under `Tables`; PASS.

- [ ] **Step 6: Commit the waitlist schema**

```powershell
git add supabase/migrations apps/web/tests/db.r7-5-session-waitlist.test.ts packages/db/types.ts
git commit -m "feat(db): add append-only session waitlist"
```

---

## Task 6: Add the session interest action and honest empty-state capture

**Files:**

- Create: `apps/web/lib/sessions/waitlist-actions.ts`
- Create: `apps/web/components/kinnso/pages/SessionWaitlistForm.tsx`
- Create: `apps/web/tests/sessions.waitlist-actions.test.ts`
- Create: `apps/web/tests/sessions.waitlist-form.test.tsx`
- Modify: `apps/web/components/kinnso/pages/SessionsListingView.tsx`
- Modify: `apps/web/app/[locale]/sessions/page.tsx`
- Modify: `apps/web/tests/kinnso.sessions-listing.host.test.tsx`
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`
- Modify: `apps/web/lib/i18n/messages/id.ts`

- [ ] **Step 1: Write failing server-action tests**

Mirror the established RSVP action test harness and assert `joinSessionWaitlistAction(locale, email, hp?)`:

- returns fake success without RPC/insert when the honeypot is filled;
- rejects unsupported locale and invalid email before RPC/insert;
- normalizes email with `trim().toLowerCase()`;
- obtains the real client IP and calls `check_and_increment_rsvp_rate_limit` with the existing `10 / 3600` bucket;
- returns `rate_limited` without inserting when disallowed;
- inserts `{ email, user_id, locale }` for anonymous and authenticated callers;
- treats Postgres `23505` as success;
- returns `failed` for RPC or insert errors.

- [ ] **Step 2: Write failing form and listing tests**

Test the client form states: idle, submitting, success, invalid email, rate limited/general retry. Test that the sessions listing shows the value-framing empty state and waitlist form only when both upcoming and replay arrays are empty; existing upcoming/replay cards remain unchanged otherwise.

- [ ] **Step 3: Confirm all new expectations fail**

```powershell
pnpm --filter web exec vitest run tests/sessions.waitlist-actions.test.ts tests/sessions.waitlist-form.test.tsx tests/kinnso.sessions-listing.host.test.tsx --reporter=dot
```

Expected: FAIL because the waitlist action/form do not exist and the listing has only plain empty copy.

- [ ] **Step 4: Implement the waitlist server action**

Follow `rsvp-actions.ts` conventions for `'use server'`, the email regex, typed result union, honeypot, `getClientIp`, Supabase SSR client, rate-limit RPC, auth lookup, and duplicate-as-success. Validate locale against the existing locale source of truth rather than duplicating an untyped list.

- [ ] **Step 5: Implement the reusable client form**

Build an accessible labeled email form with a visually hidden honeypot, disabled/pending submit state, polite success status, and visible error status. Accept only the localized strings needed by the component. Call the action with the current locale. Clear no email until success.

- [ ] **Step 6: Replace the plain sessions empty copy with value framing**

Add natural translations in all seven locale files for:

- why the upcoming session format is useful;
- a low-pressure invitation to join the waitlist;
- submit, pending, success, invalid, and retry/rate-limit states.

Pass locale and these strings from `app/[locale]/sessions/page.tsx` into `SessionsListingView`. Render the enhanced empty state only when no upcoming sessions and no replays exist. Do not expose sessions in navigation; R7.2 remains authoritative.

- [ ] **Step 7: Pass focused action/UI/parity checks**

```powershell
pnpm --filter web exec vitest run tests/sessions.waitlist-actions.test.ts tests/sessions.waitlist-form.test.tsx tests/kinnso.sessions-listing.host.test.tsx tests/i18n.locale-parity.test.ts --reporter=dot
pnpm --filter web typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit the waitlist experience**

```powershell
git add apps/web/lib/sessions/waitlist-actions.ts apps/web/components/kinnso/pages/SessionWaitlistForm.tsx apps/web/components/kinnso/pages/SessionsListingView.tsx apps/web/app/[locale]/sessions/page.tsx apps/web/tests/sessions.waitlist-actions.test.ts apps/web/tests/sessions.waitlist-form.test.tsx apps/web/tests/kinnso.sessions-listing.host.test.tsx apps/web/lib/i18n/messages
git commit -m "feat(web): capture demand on empty sessions page"
```

---

## Task 7: Hide empty article categories

**Files:**

- Modify: `apps/web/app/[locale]/articles/page.tsx`
- Modify: `apps/web/tests/articles.public-media.host.test.tsx`

- [ ] **Step 1: Add a failing mixed-category test**

Mock at least one category with published articles and at least one empty category. Assert the populated heading/cards render and the empty category heading does not. Preserve the existing all-empty page behavior required by the spec/design.

- [ ] **Step 2: Confirm the test fails**

```powershell
pnpm --filter web exec vitest run tests/articles.public-media.host.test.tsx --reporter=dot
```

Expected: FAIL because the route currently renders every configured category section.

- [ ] **Step 3: Filter after concurrent fetching**

Keep the existing concurrent `URL_CATEGORIES.map(...searchArticles...)` fetch. Filter the resolved section array to `items.length > 0` before rendering category headings. Do not change article query semantics, URLs, or card media behavior.

- [ ] **Step 4: Pass the focused suite and commit**

```powershell
pnpm --filter web exec vitest run tests/articles.public-media.host.test.tsx --reporter=dot
git add apps/web/app/[locale]/articles/page.tsx apps/web/tests/articles.public-media.host.test.tsx
git commit -m "fix(web): hide empty article category sections"
```

---

## Task 8: Add end-to-end coverage and complete the release gate

**Files:**

- Create: `apps/e2e/specs/destinations-empty-states.spec.ts`
- Modify if fixture reuse is needed: `apps/e2e/fixtures.ts`
- Modify only for discovered regressions: files already listed in Tasks 1–7

- [ ] **Step 1: Add a focused Playwright story**

Against the seeded R7 environment, cover:

1. `/en/destinations` returns 200, shows an inventory-derived Tokyo card, nonzero guide/experience counts, and a real media placeholder when the seed has no approved media.
2. Following the Tokyo card opens `/en/destinations/tokyo`; at least one populated discovery section appears, hidden optional sections do not display empty filler, canonical metadata is present, and an ItemList JSON-LD block has valid one-based positions.
3. `/en/sessions` returns 200; when the seeded environment has no sessions, it shows the value-framing waitlist form and accepts a unique test email. When sessions exist, assert the public cards instead of forcing an empty-state assumption.
4. `/en/articles` does not render headings for categories with no published articles.

Use unique emails containing the run timestamp and assert user-visible success, not database internals.

- [ ] **Step 2: Run the complete focused R7.5 test set**

```powershell
pnpm --filter web exec vitest run tests/db.r7-5-destination-index.test.ts tests/db.r7-5-session-waitlist.test.ts tests/destinations.queries.test.ts tests/destinations.host.test.tsx tests/destinations.slug.host.test.tsx tests/seo.jsonld.test.ts tests/sessions.waitlist-actions.test.ts tests/sessions.waitlist-form.test.tsx tests/kinnso.sessions-listing.host.test.tsx tests/articles.public-media.host.test.tsx tests/i18n.locale-parity.test.ts tests/sitemap.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 3: Run repository quality gates**

```powershell
pnpm typecheck
pnpm lint
pnpm honesty:lint
pnpm test
```

Expected: PASS. If a repository-wide failure is demonstrably pre-existing, capture the exact failing command/test and prove all touched-surface checks remain green before proceeding.

- [ ] **Step 4: Run local Playwright verification**

Start the web app with the repository's test environment, then run:

```powershell
$env:E2E_BASE_URL='http://localhost:3000'
pnpm --filter @kinnso/e2e e2e -- destinations-empty-states.spec.ts
```

Expected: PASS in Chromium. Inspect the page visually at desktop and narrow mobile widths for clipped counts, missing focus states, incorrect empty-state hierarchy, and raw/broken images.

- [ ] **Step 5: Audit migration safety and the final diff**

```powershell
pnpm supabase migration list --local
git diff origin/main...HEAD --check
git status --short
git log --oneline origin/main..HEAD
```

Confirm:

- both R7.5 migrations are local-only and unapplied to production;
- previous migrations are byte-for-byte untouched;
- no secret or `.env.test` file is tracked;
- generated types match the local schema;
- the diff contains only R7.5 scope;
- no placeholder copy, fake media, zero counts, or dead category headings remain.

- [ ] **Step 6: Request code review and address findings**

Use `superpowers:requesting-code-review` against `origin/main...HEAD`. Triage every finding by reproducing it, fix accepted findings test-first, and rerun the affected focused suite plus the full quality gates.

- [ ] **Step 7: Commit the E2E/release-gate work**

```powershell
git add apps/e2e/specs/destinations-empty-states.spec.ts apps/e2e/fixtures.ts
git commit -m "test(e2e): cover R7.5 destination and empty states"
```

If `apps/e2e/fixtures.ts` did not change, omit it from `git add`.

- [ ] **Step 8: Prepare one squash-merge PR for R7.5**

Use `superpowers:finishing-a-development-branch`. Push `codex/r7-5-destinations-empty-states` and open one ready PR summarizing:

- inventory-derived destination view and explicit Data API grants;
- destination counts, detail discovery, metadata, and ItemList JSON-LD;
- append-only session waitlist and abuse controls;
- empty article-category suppression;
- local migration/type generation and full test evidence;
- explicit statement: **R7.5 migrations have not been applied to production and require separate approval.**

Do not merge until required checks/review pass. After merge, verify the production deployment and public routes. Request separate explicit approval before applying either R7.5 migration to production.
