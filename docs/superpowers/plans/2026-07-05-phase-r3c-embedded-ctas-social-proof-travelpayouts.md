# Phase R3C — Embedded Experience CTAs, Social-Proof Bookings Count & Travelpayouts Repair Job — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the loop that R3A/R3B opened — surface bookable `experiences` as CTAs on
article and guide content (so creator content actually drives bookings), add a
`completed_bookings` figure to the homepage social-proof bar (so real booking volume is
visible), and stand up the Travelpayouts affiliate-ingestion cron job that has existed as
dead code since the missions program shipped.

**Architecture:** One new additive migration (`platform_stats()` gains a fourth column via
a new `app_private` SECURITY DEFINER helper — the existing three columns' SECURITY
INVOKER posture is untouched). Two new shared query functions
(`getExperiencesForCity`, extended `getGuideBySlug`). One new shared card component and
two new cross-link components (article + guide). An attribution extension to the
existing Stripe checkout server action (query-param based, server-rederived, never
trusting client input — same house rule R3A-2 used for price/currency). One new
`lib/missions/travelpayouts.ts` HTTP fetcher against the real Travelpayouts Finance v2
API, and one new Vercel-Cron-triggered route that upserts into the already-shipped
`affiliate_network_events` table.

**Tech Stack:** Next.js 16 App Router (Server Components + a `'use server'` action),
Supabase Postgres (RLS + SECURITY DEFINER RPCs), Vitest, existing `@kinnso/db` generated
types, native `fetch` against `api.travelpayouts.com`.

**Parent spec:** `docs/superpowers/specs/2026-07-04-phase-r3-booking-mvp-design.md`
(§D-R3-7 embedded CTAs, §D-R3-8 social-proof bookings count, §D-R3-9 Travelpayouts
repair job — the doc's own suggested sub-phase split, "no schema risk beyond one
additive `platform_stats` column").

**Builds on:** `main` @ `5ea5d05` (PR #74 — R3A-1 + R3A-2 + R3B all merged). This plan
was written and will be executed in the `feat/revision-r3c` worktree
(`.worktrees/feat-revision-r3c`), branched fresh from `main` — first R3-family phase that
does **not** need to stack on an unmerged parent branch.

---

## 0. Ground truth (surveyed 2026-07-05, this session, against the `feat-revision-r3c` worktree — three parallel Explore agents + direct file reads to resolve deltas)

The master design doc (§1) surveyed the codebase on 2026-07-04, *before* R3A-2/R3B were
implemented. Everything below is re-verified against the actual post-merge code; several
details differ from the doc's necessarily-prospective framing.

### D-R3-7 (embedded experience CTAs)

- **`ArticleGuideLinks`** (`apps/web/components/kinnso/articles/ArticleGuideLinks.tsx`) is
  the exact template: `{ locale, regions, t }` props, calls `getGuidesForRegions(regions)`,
  renders nothing on an empty result, wraps results in an `<aside>` with an eyebrow +
  heading + a 2/3-col grid of cards. Slotted into
  `app/[locale]/articles/[category]/[url]/page.tsx` immediately after
  `<ArticleBlockRenderer .../>`, inside the `<article>` (left) column of a
  `grid gap-8 lg:grid-cols-[1fr_260px]` — no grid-math concerns, it's fully nested in one
  column already.
- **Guide detail page** (`app/[locale]/g/[slug]/page.tsx`) uses a *different* grid,
  `grid gap-5 md:grid-cols-[1fr_320px]`, with exactly two direct children: a left
  `<div className="rounded-lg bg-white p-6">` (summary) and a right `<aside>` (creator).
  Appending a new CTA block as a **third grid child** would break the 2-column
  auto-placement (the aside would wrap under the summary). The correct insertion point is
  **inside** the left `<div>`, appended after the existing "View all guides" `<Link>` and
  before that div's closing tag — this satisfies "left column, after the summary, before
  the aside" without touching the grid's column count, and stacks correctly on mobile too.
- **`lib/experiences/public-queries.ts`** has `getExperienceBySlug`,
  `listPublishedExperiencesForMerchant`, `getExperiencesForSitemap`, `getExperienceById` —
  no "by city" query exists; it's net-new. Critically, `getExperiencesForSitemap`'s own
  comment confirms **RLS on `experiences` already restricts anon reads to
  `published` + active-merchant rows** — a new city query needs only
  `.eq('status', 'published')`, no merchant join, matching that function's simpler
  (no-second-query) shape rather than `getExperienceBySlug`'s two-query shape.
- **City representation**: `experiences.city` (text, already selected/returned),
  `guides.city` (text, already selected/returned on `Guide`), `articles.regions` (text[],
  matched heuristically via `.ilike` — same mechanism `getGuidesForRegions` already uses).
- **Attribution**: `bookings` (R3A-1 schema) already has nullable `creator_id`,
  `guide_id`, `source_surface` (`check (source_surface in ('guide','article',
  'experience_page','direct'))`) columns — **but `createCheckoutSessionAction` never
  populates them today**, hardcoding `source_surface: 'experience_page'` unconditionally.
  `Guide`/`GuideDetail` (`lib/guides/types.ts`) has **no `id` field at all today** (only
  `slug`) and `getGuideBySlug` does not select `creator_id` — both needed, since
  `bookings.guide_id`/`creator_id` are UUID FKs and the checkout action only ever sees
  whatever the experience page passes it.
- **A carry-forward found in the shipped code itself**: `app/[locale]/experiences/[slug]/
  page.tsx:46-48` has a comment reading *"Product/Offer JSON-LD for real bookability is a
  separate SEO carry-forward (design spec groups it with R3C's loop-closure work, not
  this phase's Stripe/widget scope)"*. This wasn't named in the master doc's 3-item R3C
  split, but it's an explicit, unambiguous scope marker left by the R3A-2 author, it's
  small, and it directly serves this phase's "closing the loop" theme — folded in as
  Task 11 below, clearly flagged. (Confirmed via `grep -rn "R3C"` across the whole repo —
  this is the only other hit besides the master doc itself.)
- Test precedent: `tests/articles.guide-links.test.ts` (mocked Supabase, sanitize→ilike→
  degrade-to-`[]` assertions) is the template for the new experience-by-city query test.

### D-R3-8 (social-proof bookings count)

- **`platform_stats()`** (`supabase/migrations/20260702120000_r1b_platform_stats_
  testimonials.sql`) is `security invoker`, returns exactly
  `(active_creators, published_guides, destinations)`, with a literal stub comment
  confirming bookings were deliberately excluded pending R3.
- **Important correctness finding not flagged by the master doc**: `active_creators`/
  `published_guides`/`destinations` all count rows that anon **already has direct RLS
  read access to** (published guides, active public creators) — that's *why* `security
  invoker` has always worked. `bookings` has **no anon SELECT policy at all** (by
  design — it's traveller PII/payment data). A naive `count(*) from bookings where
  status='completed'` added directly inside the still-`security invoker` function would
  silently return `0` for every real anon pageview, in production, forever — a bug that
  would look identical to "just needs one more real merchant" instead of "the code is
  broken." See Phase Decision D-R3C-2 below for the fix.
- **`getPlatformStats()`** (`apps/web/lib/home/queries.ts`) maps the RPC row 1:1 to
  camelCase; `STAT_THRESHOLDS` is a plain object (`activeCreators: 5, publishedGuides: 10,
  destinations: 3`); `MIN_VISIBLE_STATS = 2`. `StatsBar`
  (`apps/web/components/kinnso/home/StatsBar.tsx`) builds a `.filter().map()` array — no
  hardcoded slot count, a 4th entry is just one more object in that array.
- **`bookings.status`** (R3A-1 migration
  `20260704110000_r3a1_traveler_role_and_booking_core.sql`) is exactly
  `'pending_payment' | 'confirmed' | 'completed' | 'cancelled' | 'refunded'` — matches the
  design doc's D-R3-3 draft verbatim, so `status = 'completed'` is the right filter.
- i18n: stat labels live in the `home` message group (`statCreators`, `statGuides`,
  `statDestinations`), lowercase copy style (`'active creators'`, etc.).
- Test precedent: `tests/db.r1b-migration.test.ts` reads the raw migration SQL and asserts
  on substrings (never touches a live DB in unit tests) — template for the new migration's
  test. `tests/home.queries.test.ts` and `tests/kinnso.home-hero-stats.test.tsx` already
  exist and are extended, not replaced.

### D-R3-9 (Travelpayouts repair job)

- **`normalizeTravelpayoutsAction()`** (`apps/web/lib/missions/travelpayouts.ts:178-191`)
  is a pure transformer — confirmed **zero production callers** (only referenced from
  `tests/mission.travelpayouts.test.ts`). It expects a raw action object shaped like
  `{ action_id, campaign_id, action_state|state, sub_id, price|price_usd|price_amount,
  profit|paid_profit_usd|profit_amount, currency, booked_at|created_at|date, updated_at }`
  — `toCurrency()` defaults to `'usd'` when `raw.currency` is absent.
- **The real Travelpayouts endpoint** (verified via the public Travelpayouts Help Center,
  not fabricated — see Sources below): `GET
  https://api.travelpayouts.com/finance/v2/get_user_actions_affecting_balance`, header
  `X-Access-Token: <TRAVELPAYOUTS_API_TOKEN>` (same header name the existing
  `createTravelpayoutsPartnerLinks()` already uses), query params `currency`
  (`rub|usd|eur`, no per-action currency in the response — confirming why
  `normalizeTravelpayoutsAction` defaults to `'usd'`), `action_id`, `action_state`,
  `campaign_id`, `from`/`until` (date range), `offset`/`limit` (max `300`). Response:
  `{ actions: [{action_id, campaign_id, action_state, price, profit, description,
  booked_at, updated_at, ...}], total_price, total_profit, available_campaigns, count }`.
  This maps cleanly onto `normalizeTravelpayoutsAction`'s expected raw shape with zero
  changes to that function.
- **`affiliate_network_events`** (`supabase/migrations/20260617173932_mission_tables.sql`)
  has `unique (network, external_action_id)` — the natural upsert conflict target — plus
  **nullable FK columns** `affiliate_network_program_id` (→ `affiliate_network_programs.
  id`, a uuid), `mission_id`, `mission_participant_id`, `creator_id`. RLS grants insert/
  update to ops members only (`affiliate_network_events_ops_insert/update`); anon has no
  grant at all.
- **`affiliate_network_programs`** stores the raw Travelpayouts campaign id in its own
  `external_program_id text` column (`unique (network, external_program_id)`) — so
  mapping a fetched action's raw `campaign_id` to our internal program UUID is a lookup by
  that column, not a direct cast.
- **`affiliate_partner_links`** stores `sub_id text not null` alongside `mission_id`,
  `mission_participant_id`, `creator_id` (all `not null`) — `buildSubId()`
  (`lib/missions/actions.ts`) already documents the reconciliation contract in its own
  comment: *"reconciliation matches [sub_id] verbatim (affiliate_partner_links.sub_id ↔
  affiliate_network_events.sub_id)"*. So the cron job's job is exactly: fetch actions →
  look up each action's `sub_id` against `affiliate_partner_links` → carry
  `mission_id`/`mission_participant_id`/`creator_id` onto the `affiliate_network_events`
  row it upserts. No sub_id parsing needed — it's an opaque, verbatim join key.
- **`/api/revalidate/route.ts`** is a real, working template for shared-secret-gated
  routes (`process.env`-based secret, uniform `NextResponse.json({...}, {status})`) — but
  it's called manually by `apps/sync`, not by Vercel Cron. **No `crons` entry exists
  anywhere in this repo yet** (`apps/web/vercel.json` has no `crons` key; `CRON_SECRET`
  appears nowhere). Vercel Cron's actual, documented invocation mechanism sends
  `Authorization: Bearer $CRON_SECRET` automatically — not an arbitrary custom header —
  so the new route checks that header, not an `x-`-prefixed one (a deliberate, documented
  deviation from the letter of the design doc's "same pattern as revalidate.ts" — see
  D-R3C-1).
- **Service-role usage**: `apps/web/lib/supabase/service.ts`'s own doc comment says *"The
  Stripe webhook is the ONE documented exception permitted to use this... no other
  request path in this codebase may import this file."* The Travelpayouts cron route is
  structurally identical to the webhook (no user session, authenticated only by a shared
  secret checked at the route layer, needs a privileged write) — see D-R3C-1 for why this
  comment is updated to name a second, equally-scoped exception rather than routing around
  it with a new mechanism.
- **`apps/sync`** independently confirmed: a standalone Hono server syncing legacy MySQL/
  FOSO content, its own deploy target, zero conceptual or code overlap with affiliate
  ingestion — the design doc's rejection of extending it stands.
- `.env.example` convention confirmed: server-only vars are `ALL_CAPS`, no
  `NEXT_PUBLIC_` prefix, `*_SECRET` suffix for shared secrets (`REVALIDATE_SECRET`
  precedent). New: `CRON_SECRET`.

**Sources** (Travelpayouts API, verified via web search this session, not fabricated):
- [API of affiliate programs booking statistics – Travelpayouts Help Center](https://support.travelpayouts.com/hc/en-us/articles/360019864079-API-of-affiliate-programs-booking-statistics)
- [API of affiliates balance and payment – Travelpayouts Help Center](https://support.travelpayouts.com/hc/en-us/articles/5169505760402-API-of-affiliates-balance-and-payment)

---

## 1. Phase decisions

### D-R3C-1 · Cron route is a second, named service-role exception (not a new SECURITY DEFINER anon-exec RPC)

**Problem:** the Travelpayouts sync route has no Supabase user session (it's invoked by
Vercel Cron via a shared secret, exactly like the Stripe webhook is invoked by Stripe via
signature verification), but needs to write `affiliate_network_events` — a table RLS
restricts to ops-only insert/update.

**Chosen:** use `createSupabaseServiceClient()`, exactly like the webhook route does, and
update that file's doc comment from *"the Stripe webhook is the ONE... exception"* to name
both. **Rejected alternative:** a new SECURITY DEFINER RPC grant-restricted to
service_role only would add a second privilege-escalation surface for no real benefit —
the webhook precedent already establishes that "no user session, shared-secret-gated,
server-to-server" is the accepted shape for this codebase's *sole* service-role carve-out;
splitting it into "one exception per meaning" is more honest than either (a) forcing this
route through a fake RLS/session model it doesn't have, or (b) inventing a new
anon-executable RPC that would need its own shared-secret check re-implemented in SQL
(no precedent for that anywhere in this codebase). The route's *own* SQL writes remain
narrow: two read-only lookups (`affiliate_network_programs`, `affiliate_partner_links`)
and one upsert into one table — service-role is not a blank check here, it's scoped by
what the route's code actually does.

**Also chosen:** auth via `Authorization: Bearer ${CRON_SECRET}`, not a custom `x-*`
header — this is Vercel Cron's actual, non-configurable invocation convention (confirmed
via the ground-truth survey above), so matching it is what makes the route actually work
when Vercel triggers it, not just when a human curls it manually.

### D-R3C-2 · `completed_bookings` count goes through a new `app_private` SECURITY DEFINER helper, not a direct count inside the still-`security invoker` `platform_stats()`

**Problem:** `platform_stats()` is `security invoker` because every existing column
counts rows anon already has legitimate row-level RLS access to. `bookings` has no anon
SELECT policy (by design — PII/payment data) — a direct `count(*) from bookings` inside
the invoker-mode function would return 0 forever for real anon homepage visitors.

**Chosen:** add `app_private.count_completed_bookings()` — `security definer`, `stable`,
pinned `search_path`, `revoke all from public`, explicit `grant execute ... to anon,
authenticated` (this codebase's established anon-safe-aggregate template, same shape as
`app_private.merchant_is_active()`/`app_private.experience_is_bookable()`). `platform_
stats()` itself stays `security invoker` (its three existing columns are untouched) and
simply calls this one new definer helper for its fourth column — SQL functions can call a
SECURITY DEFINER function from within a SECURITY INVOKER one as long as the invoking role
has EXECUTE on it, which the explicit grant provides. Zero change to the security posture
of the three already-shipped columns; the new count never leaks a single row of `bookings`
data, only an aggregate integer — same trust boundary as every other `app_private.*`
helper in this program.

### D-R3C-3 · Attribution: query-param based, server-rederived from a guide *slug*, never a client-supplied id

**Problem:** a booking made via a guide/article CTA needs `bookings.creator_id`/
`guide_id`/`source_surface` populated, but the checkout action must never trust
client-supplied identity data directly (house rule established by R3A-2 for price/
currency: "re-derives server-side, never trusts client input").

**Chosen:** CTA links append `?src=guide&guideSlug=<slug>` (guide surface) or
`?src=article` (article surface, no guide/creator concept exists for articles per the
ground-truth survey). The experience page reads these from `searchParams` and threads
them down to `BookingWidget` → `createCheckoutSessionAction`, which **re-resolves** the
guide by slug via the already-public `getGuideBySlug()` (extended in Task 5 to also
select `id`/`creator_id`) — an attacker can put an arbitrary `guideSlug` in the URL, but
the action only ever writes whatever `creator_id`/`id` that *real, published* guide
actually has, never a client-asserted value. An unresolvable/missing `guideSlug` or an
unrecognized `src` value degrades to today's exact behavior (`source_surface:
'experience_page'`, no attribution) rather than erroring the checkout — attribution is a
nice-to-have loop-closure, never a reason to block a real payment.

### D-R3C-4 · `completed_bookings` threshold = 3 (matches the current lowest threshold)

The design doc explicitly defers the exact number ("a plan-phase/product call"). Real
live data has 2 active merchants and (per the R3A-2 review) zero seeded
`experience_availability` rows as of the last check — bookings is, structurally, the
coldest-start metric of the four. Setting the threshold equal to `destinations: 3` (the
current lowest) means a handful of genuinely real completed bookings shows up honestly,
without inventing a new, lower bar than anything else on the bar.

### D-R3C-5 · Travelpayouts sync uses a rolling 7-day lookback + upsert idempotency, not a stateful cursor

**Problem:** incremental sync normally wants a "last synced at" cursor, but the design doc
explicitly scopes R3C as "no schema risk beyond one additive `platform_stats` column" —
adding a cursor table/column would violate that framing for no real benefit.

**Chosen:** each cron run fetches `from = today − 7 days` (accepting the Finance API's
`from` param) and relies entirely on the existing `unique (network, external_action_id)`
upsert to make re-fetching the same window idempotent. This is *better* than a cursor for
this specific case, not just simpler: a `booked_at`-based cursor would never re-see an
action whose `action_state` transitions `processing → paid` after the cursor moves past
its `booked_at` — the 7-day rolling window catches state transitions that already happened
inside that window on every run, at the cost of a few hundred redundant-but-harmless
upserts per run.

### D-R3C-6 · Product/Offer JSON-LD, gated on real open availability (carry-forward, folded into this phase)

Per the ground-truth survey's carry-forward finding: ships only when
`listPublicAvailability()` returns at least one date with `remaining > 0` for that
experience — same "never claim bookability before it's real" rule the master spec has
applied since R1/R2. If no experience has open availability yet (true as of the last
live-data check), this renders nothing, exactly like today; it activates automatically,
with no further code change, the moment real availability is seeded.

---

## 2. Data model

One new migration, purely additive:

```
app_private.count_completed_bookings()     -- new SECURITY DEFINER helper
public.platform_stats()                    -- CREATE OR REPLACE, gains completed_bookings
```

No new tables. `bookings.creator_id`/`guide_id`/`source_surface` (R3A-1),
`affiliate_network_events`/`affiliate_network_programs`/`affiliate_partner_links`
(missions program) all already exist and are unchanged.

## 3. Security invariants (carried from the master spec §4, re-affirmed/extended for this phase)

1. **Service-role remains a named, minimal set of exceptions** — extended from one
   (Stripe webhook) to two (+ Travelpayouts cron), both non-user-facing, shared-secret-
   gated, server-to-server routes with a narrow, auditable set of writes (D-R3C-1).
2. **Every new anon-reachable aggregate is a SECURITY DEFINER helper in `app_private`**,
   explicitly grant/revoke-managed (never relying on Supabase's default auto-grant —
   see the recurring `supabase-default-acl-gotcha` from R3A-2/R3B), returning only an
   aggregate, never raw rows (D-R3C-2).
3. **Attribution is always server-rederived from a real row, never a client-supplied id**
   (D-R3C-3) — same shape as R3A-2's price/currency re-derivation.
4. **Currency is never summed across currencies** — n/a to new code this phase (no new
   money math), but the Travelpayouts ingestion stores whatever currency the API request
   used (`usd`, fixed) per event, never aggregating across events.
5. **No SEO claim of bookability before it's real** — the new Product/Offer JSON-LD is
   conditional on real, live availability (D-R3C-6).

---

## Task 1: `platform_stats()` migration — `app_private.count_completed_bookings()` + `completed_bookings` column

**Files:**
- Create: `supabase/migrations/20260705090000_r3c_platform_stats_bookings_count.sql`
- Test: `apps/web/tests/db.r3c-platform-stats-bookings-count.test.ts`

- [ ] **Step 1: Write the failing migration test**

```typescript
// apps/web/tests/db.r3c-platform-stats-bookings-count.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260705090000_r3c_platform_stats_bookings_count.sql'),
  'utf8',
)

describe('app_private.count_completed_bookings()', () => {
  it('is a SECURITY DEFINER helper with a pinned search_path, revoked from public then explicitly granted', () => {
    expect(sql).toContain('create or replace function app_private.count_completed_bookings()')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain('revoke all on function app_private.count_completed_bookings() from public')
    expect(sql).toContain('grant execute on function app_private.count_completed_bookings() to anon, authenticated')
  })
  it('counts only completed bookings', () => {
    expect(sql).toContain("select count(*) from public.bookings where status = 'completed'")
  })
})

describe('platform_stats() — R3C addition', () => {
  it('stays SECURITY INVOKER and gains a fourth completed_bookings column via the new helper', () => {
    expect(sql).toContain('create or replace function public.platform_stats()')
    expect(sql).toContain('security invoker')
    expect(sql.toLowerCase()).toMatch(/returns table\s*\(\s*active_creators bigint,\s*published_guides bigint,\s*destinations bigint,\s*completed_bookings bigint\s*\)/)
    expect(sql).toContain('app_private.count_completed_bookings()')
  })
  it('keeps the three existing counts byte-for-byte (never touch a shipped column)', () => {
    expect(sql).toContain("status = 'active' and handle is not null and public_profile is not null")
    expect(sql).toContain("from public.guides where status = 'published'")
    expect(sql).toContain('count(distinct city)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.r3c-platform-stats-bookings-count.test.ts`
Expected: FAIL — `ENOENT` (migration file does not exist yet).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260705090000_r3c_platform_stats_bookings_count.sql

-- R3C (§D-R3-8, master spec): platform_stats() gains a completed-bookings count.
-- bookings has NO anon SELECT policy (unlike creators/guides, which platform_stats()'s
-- existing three columns already read via anon's own row-level RLS access) — so the
-- count must go through a SECURITY DEFINER helper, never a direct count() inside the
-- still-SECURITY INVOKER platform_stats() itself (see plan D-R3C-2).

create or replace function app_private.count_completed_bookings()
returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from public.bookings where status = 'completed';
$$;

revoke all on function app_private.count_completed_bookings() from public;
grant execute on function app_private.count_completed_bookings() to anon, authenticated;

create or replace function public.platform_stats()
returns table (active_creators bigint, published_guides bigint, destinations bigint, completed_bookings bigint)
language sql stable security invoker set search_path = public as $$
  select
    (select count(*) from public.creators
       where status = 'active' and handle is not null and public_profile is not null),
    (select count(*) from public.guides where status = 'published'),
    (select count(distinct city) from public.guides
       where status = 'published' and city is not null and city <> ''),
    app_private.count_completed_bookings();
$$;

grant execute on function public.platform_stats() to anon, authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.r3c-platform-stats-bookings-count.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Apply the migration to the live Supabase project via MCP `apply_migration`, then verify**

After applying, confirm via SQL (through the same MCP tool or `execute_sql`):
```sql
select p.proname, p.prosecdef, p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app_private' and p.proname = 'count_completed_bookings';
```
Expected: one row, `prosecdef = true` (SECURITY DEFINER), and the ACL shows `anon`/
`authenticated` EXECUTE explicitly (not relying on the project's default auto-grant —
per the recurring `supabase-default-acl-gotcha`, always re-verify this live, not just by
reading the migration file).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260705090000_r3c_platform_stats_bookings_count.sql apps/web/tests/db.r3c-platform-stats-bookings-count.test.ts
git commit -m "feat(db): platform_stats() gains completed_bookings via a new app_private helper"
```

---

## Task 2: `getPlatformStats()` / `STAT_THRESHOLDS` — thread `completedBookings` through

**Files:**
- Modify: `apps/web/lib/home/queries.ts`
- Test: `apps/web/tests/home.queries.test.ts`

- [ ] **Step 1: Extend the failing test**

Replace the `getPlatformStats` describe block and the thresholds describe block in
`apps/web/tests/home.queries.test.ts`:

```typescript
describe('getPlatformStats', () => {
  it('maps the RPC row to camelCase numbers, including completed_bookings', async () => {
    publicClientMock.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: [{ active_creators: 12, published_guides: 48, destinations: 9, completed_bookings: 4 }],
        error: null,
      })),
    })
    expect(await getPlatformStats()).toEqual({
      activeCreators: 12, publishedGuides: 48, destinations: 9, completedBookings: 4,
    })
  })
  it('degrades to null on RPC failure (stats bar hides; homepage stays up)', async () => {
    publicClientMock.mockReturnValue({ rpc: vi.fn(async () => ({ data: null, error: { message: 'boom' } })) })
    expect(await getPlatformStats()).toBeNull()
  })
  it('returns null when the RPC yields no row', async () => {
    publicClientMock.mockReturnValue({ rpc: vi.fn(async () => ({ data: [], error: null })) })
    expect(await getPlatformStats()).toBeNull()
  })
})
```

```typescript
describe('display thresholds (locked R1B decisions + R3C addition)', () => {
  it('exports the honesty thresholds as constants', () => {
    expect(STAT_THRESHOLDS).toEqual({
      activeCreators: 5, publishedGuides: 10, destinations: 3, completedBookings: 3,
    })
    expect(MIN_VISIBLE_STATS).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/home.queries.test.ts`
Expected: FAIL — `completedBookings` is `undefined`, `STAT_THRESHOLDS` missing the key.

- [ ] **Step 3: Implement**

In `apps/web/lib/home/queries.ts`, update the interface, thresholds, and mapping:

```typescript
export interface PlatformStats {
  activeCreators: number
  publishedGuides: number
  destinations: number
  completedBookings: number
}

export const STAT_THRESHOLDS = {
  activeCreators: 5,
  publishedGuides: 10,
  destinations: 3,
  completedBookings: 3, // coldest-start metric — matches the current lowest threshold (D-R3C-4)
} as const
```

And in `getPlatformStats()`, extend the returned object:

```typescript
  return {
    activeCreators: Number(row.active_creators),
    publishedGuides: Number(row.published_guides),
    destinations: Number(row.destinations),
    completedBookings: Number(row.completed_bookings),
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/home.queries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/home/queries.ts apps/web/tests/home.queries.test.ts
git commit -m "feat(web): getPlatformStats/STAT_THRESHOLDS gain completedBookings"
```

---

## Task 3: `StatsBar` renders the 4th stat + i18n ×7

**Files:**
- Modify: `apps/web/components/kinnso/home/StatsBar.tsx`
- Modify: `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts`
- Test: `apps/web/tests/kinnso.home-hero-stats.test.tsx`

- [ ] **Step 1: Extend the failing test**

Replace the `StatsBar` describe block in `apps/web/tests/kinnso.home-hero-stats.test.tsx`:

```typescript
describe('StatsBar (section 2 — threshold-gated honesty)', () => {
  const t = en.home
  it('renders nothing when stats are unavailable', () => {
    const { container } = render(<StatsBar locale="en" t={t} stats={null} />)
    expect(container.innerHTML).toBe('')
  })
  it('renders nothing when fewer than 2 stats pass their thresholds', () => {
    const { container } = render(
      <StatsBar locale="en" t={t} stats={{ activeCreators: 12, publishedGuides: 3, destinations: 2, completedBookings: 0 }} />,
    )
    expect(container.innerHTML).toBe('')
  })
  it('renders only stats at/above threshold — never zeros', () => {
    render(
      <StatsBar locale="en" t={t} stats={{ activeCreators: 12, publishedGuides: 48, destinations: 0, completedBookings: 0 }} />,
    )
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('48')).toBeTruthy()
    expect(screen.getByText(t.statCreators)).toBeTruthy()
    expect(screen.queryByText(t.statDestinations)).toBeNull()
    expect(screen.queryByText(t.statCompletedBookings)).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
  })
  it('renders all four when all pass (boundary values count as passing)', () => {
    render(
      <StatsBar locale="en" t={t} stats={{ activeCreators: 5, publishedGuides: 10, destinations: 3, completedBookings: 3 }} />,
    )
    expect(screen.getByText(t.statCreators)).toBeTruthy()
    expect(screen.getByText(t.statGuides)).toBeTruthy()
    expect(screen.getByText(t.statDestinations)).toBeTruthy()
    expect(screen.getByText(t.statCompletedBookings)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.home-hero-stats.test.tsx`
Expected: FAIL — `stats.completedBookings` type error / `t.statCompletedBookings` undefined.

- [ ] **Step 3: Implement — `StatsBar.tsx`**

```typescript
  const entries = [
    { key: 'creators', value: stats.activeCreators, min: STAT_THRESHOLDS.activeCreators, label: t.statCreators },
    { key: 'guides', value: stats.publishedGuides, min: STAT_THRESHOLDS.publishedGuides, label: t.statGuides },
    { key: 'destinations', value: stats.destinations, min: STAT_THRESHOLDS.destinations, label: t.statDestinations },
    { key: 'bookings', value: stats.completedBookings, min: STAT_THRESHOLDS.completedBookings, label: t.statCompletedBookings },
  ].filter((s) => s.value >= s.min)
```

(Only the `entries` array literal changes — everything else in the component is
unchanged.)

- [ ] **Step 4: Add i18n key to all 7 locales**

In `apps/web/lib/i18n/messages/en.ts`, in the `home` group, add after `statDestinations`:
```typescript
statCompletedBookings: 'completed bookings',
```
And in the `home` group's *type* declaration (interface/type block above the `en` object,
if the codebase declares `Messages` as a separate `interface`/`type` rather than inferring
it from `en` — check which; `StatsBar` imports `Messages['home']`, so wherever that
group's shape is declared needs the new key too):
```typescript
statCompletedBookings: string
```

Add the equivalent key with a real (non-placeholder) translation to each of the other 6
locale files' `home` group:
- `zh-hk.ts`: `statCompletedBookings: '完成預訂',`
- `zh-tw.ts`: `statCompletedBookings: '完成預訂',`
- `zh-cn.ts`: `statCompletedBookings: '完成预订',`
- `ja.ts`: `statCompletedBookings: '予約完了数',`
- `ko.ts`: `statCompletedBookings: '완료된 예약',`
- `th.ts`: `statCompletedBookings: 'การจองที่เสร็จสมบูรณ์',`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/kinnso.home-hero-stats.test.tsx tests/i18n.locale-parity.test.ts`
Expected: PASS (both files)

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/home/StatsBar.tsx apps/web/lib/i18n/messages/*.ts apps/web/tests/kinnso.home-hero-stats.test.tsx
git commit -m "feat(web): StatsBar renders completed-bookings social proof (i18n x7)"
```

---

## Task 4: `getExperiencesForCity()` — shared query for both CTA surfaces

**Files:**
- Modify: `apps/web/lib/experiences/public-queries.ts`
- Test: `apps/web/tests/experiences.public-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/tests/experiences.public-queries.test.ts` (extend the existing
`import` line to include `getExperiencesForCity`):

```typescript
import { getExperienceBySlug, getExperiencesForSitemap, listPublishedExperiencesForMerchant, getExperiencesForCity } from '@/lib/experiences/public-queries'

describe('getExperiencesForCity', () => {
  it('returns [] for a too-short/noise-only city string without querying', async () => {
    expect(await getExperiencesForCity('!')).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('queries published experiences by case-insensitive city match, ordered, capped at 3', async () => {
    const limit = vi.fn(() => Promise.resolve({
      data: [{ id: 'e1', slug: 'sunset-tour', title: 'Sunset tour', summary: null, description: null, city: 'Tokyo', price_amount: 12000, currency: 'JPY', duration_minutes: null, cover_url: null, merchant_profile_id: 'm1', published_at: '2026-07-01T00:00:00Z' }],
      error: null,
    }))
    const order = vi.fn(() => ({ limit }))
    const ilike = vi.fn(() => ({ order }))
    const eq = vi.fn(() => ({ ilike }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq })) })

    const rows = await getExperiencesForCity('Tokyo')
    expect(fromMock).toHaveBeenCalledWith('experiences')
    expect(eq).toHaveBeenCalledWith('status', 'published')
    expect(ilike).toHaveBeenCalledWith('city', '%Tokyo%')
    expect(limit).toHaveBeenCalledWith(3)
    expect(rows[0].title).toBe('Sunset tour')
  })

  it('never throws — degrades to [] on query failure', async () => {
    fromMock.mockImplementation(() => { throw new Error('boom') })
    expect(await getExperiencesForCity('Tokyo')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/experiences.public-queries.test.ts`
Expected: FAIL — `getExperiencesForCity` is not exported.

- [ ] **Step 3: Implement**

Add to `apps/web/lib/experiences/public-queries.ts` (after `getExperienceById`):

```typescript
/**
 * Published experiences matching a city, for the embedded-CTA components on
 * article/guide pages (D-R3-7). RLS on `experiences` already restricts anon
 * reads to published + active-merchant rows (same as getExperiencesForSitemap)
 * — no merchant join needed here, same no-second-query shape as
 * listPublishedExperiencesForMerchant. Reads never crash the host page —
 * failures degrade to [] (same stance as getGuidesForRegions).
 */
export async function getExperiencesForCity(city: string, limit = 3): Promise<PublicExperience[]> {
  const clean = city.normalize('NFC').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ').trim()
  if (clean.length < 2) return []
  try {
    const supabase = createSupabasePublicClient()
    const { data } = await supabase
      .from('experiences')
      .select(EXP_COLUMNS)
      .eq('status', 'published')
      .ilike('city', `%${clean}%`)
      .order('published_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map((r) => toDomain(r as unknown as ExpRow, { slug: '', companyName: '' }))
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/experiences.public-queries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/experiences/public-queries.ts apps/web/tests/experiences.public-queries.test.ts
git commit -m "feat(web): getExperiencesForCity for embedded experience CTAs"
```

---

## Task 5: `getGuideBySlug()` — expose `id` + `creatorId`

**Files:**
- Modify: `apps/web/lib/guides/types.ts`
- Modify: `apps/web/lib/guides/queries.ts`
- Test: `apps/web/tests/guides.queries.test.ts`

- [ ] **Step 1: Write the failing test**

Extend the `getGuideBySlug` describe block in `apps/web/tests/guides.queries.test.ts`:

```typescript
describe('getGuideBySlug', () => {
  it('returns the db guide (source: db) when a row exists, threading published_at, id, and creatorId', async () => {
    state.single = { ...row, id: 'g1', creator_id: 'c1', creator_name: 'Tea Fan', summary: 'Lovely tea houses.', published_at: '2026-06-02T00:00:00Z' }
    const guide = await getGuideBySlug('kyoto-tea')
    expect(guide?.slug).toBe('kyoto-tea')
    expect(guide?.id).toBe('g1')
    expect(guide?.creatorId).toBe('c1')
    expect(guide?.source).toBe('db')
    expect(guide?.publishedAt).toBe('2026-06-02T00:00:00Z')
  })

  it('defaults creatorId to null when the row has no creator_id', async () => {
    state.single = { ...row, id: 'g1', creator_id: null, creator_name: 'Tea Fan', summary: null }
    const guide = await getGuideBySlug('kyoto-tea')
    expect(guide?.creatorId).toBeNull()
  })

  it('defaults publishedAt to null when the row has no published_at', async () => {
    state.single = { ...row, id: 'g1', creator_id: null, creator_name: 'Tea Fan', summary: null }
    const guide = await getGuideBySlug('kyoto-tea')
    expect(guide?.publishedAt).toBeNull()
  })

  it('returns null for a slug not in the database (no mock fallback)', async () => {
    state.single = null
    expect(await getGuideBySlug(mockGuides[0].slug)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/guides.queries.test.ts`
Expected: FAIL — `guide?.id`/`guide?.creatorId` are `undefined`.

- [ ] **Step 3: Implement — types**

In `apps/web/lib/guides/types.ts`, extend `GuideDetail`:

```typescript
/** Detail-page shape: the public Guide plus detail-only fields. */
export interface GuideDetail extends Guide {
  id: string
  creatorId: string | null
  summary: string | null
  creatorName: string | null
  publishedAt: string | null
  source: 'db' | 'mock'
}
```

- [ ] **Step 4: Implement — query**

In `apps/web/lib/guides/queries.ts`, update `getGuideBySlug`:

```typescript
export async function getGuideBySlug(slug: string): Promise<GuideDetail | null> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('guides')
    .select('id, slug, title, cover_url, city, saves_count, creator_handle, creator_name, creator_id, summary, published_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (!data) return null
  return {
    ...mapRowToGuide(data),
    id: data.id as string,
    creatorId: (data.creator_id as string | null) ?? null,
    summary: data.summary,
    creatorName: data.creator_name,
    publishedAt: (data.published_at as string | null) ?? null,
    source: 'db',
  }
}
```

(`mapRowToGuide` is untouched — it maps `GuideRowLite`'s fixed fields; the extra
`id`/`creator_id` columns on the row are just ignored by it and merged in separately here,
same pattern already used for `creatorName`/`publishedAt`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/guides.queries.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/guides/types.ts apps/web/lib/guides/queries.ts apps/web/tests/guides.queries.test.ts
git commit -m "feat(web): getGuideBySlug exposes id + creatorId for booking attribution"
```

---

## Task 6: Shared `ExperienceLinkCard` component + i18n copy ×7

**Files:**
- Create: `apps/web/components/kinnso/ExperienceLinkCard.tsx`
- Modify: `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts`
- Test: `apps/web/tests/kinnso.experience-link-card.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/kinnso.experience-link-card.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

import { ExperienceLinkCard } from '@/components/kinnso/ExperienceLinkCard'
import type { PublicExperience } from '@/lib/experiences/public-queries'

const experience: PublicExperience = {
  id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: null, description: null,
  city: 'Hong Kong', priceAmount: 480, currency: 'HKD', durationMinutes: null, coverUrl: null,
  publishedAt: null, merchant: { slug: 'acme', companyName: 'Acme Travel' },
}

describe('ExperienceLinkCard', () => {
  it('links to the experience page with the given query string appended', () => {
    render(<ExperienceLinkCard locale="en" experience={experience} hrefQuery="src=article" />)
    const link = screen.getByRole('link', { name: /Sunset junk boat tour/ })
    expect(link.getAttribute('href')).toBe('/en/experiences/sunset-tour?src=article')
  })
  it('renders city, currency, and price', () => {
    render(<ExperienceLinkCard locale="en" experience={experience} hrefQuery="src=article" />)
    expect(screen.getByText('Hong Kong · HKD 480')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.experience-link-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/web/components/kinnso/ExperienceLinkCard.tsx
import Link from 'next/link'
import type { PublicExperience } from '@/lib/experiences/public-queries'
import type { Locale } from '@/lib/i18n/config'

/**
 * Shared card for the embedded experience CTAs (D-R3-7): article and guide
 * pages both render a small grid of these. Same markup as the /m/[slug]
 * experiences grid (PublicMerchantProfileView) for visual consistency.
 */
export function ExperienceLinkCard({ locale, experience, hrefQuery }: {
  locale: Locale
  experience: PublicExperience
  hrefQuery: string
}) {
  return (
    <Link
      href={`/${locale}/experiences/${experience.slug}?${hrefQuery}`}
      className="k2-card block p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange"
    >
      <h3 className="k2-display text-lg font-semibold text-kinnso-ink">{experience.title}</h3>
      <p className="mt-2 text-sm text-kinnso-ink/70">
        {experience.city} · {experience.currency} {experience.priceAmount.toLocaleString()}
      </p>
    </Link>
  )
}

export default ExperienceLinkCard
```

- [ ] **Step 4: Add shared eyebrow/heading i18n copy to the `article` group (reused by both surfaces)**

In `apps/web/lib/i18n/messages/en.ts`, in the `article` group (and its type declaration),
add after `guidesNearbyHeading`:
```typescript
experiencesNearbyEyebrow: 'Ready to book?',
experiencesNearbyHeading: 'Bookable experiences here',
```

Real translations for the other 6 locales (`article` group):
- `zh-hk.ts`: `experiencesNearbyEyebrow: '準備好預訂了嗎？', experiencesNearbyHeading: '呢度嘅可預訂體驗',`
- `zh-tw.ts`: `experiencesNearbyEyebrow: '準備好預訂了嗎？', experiencesNearbyHeading: '這裡的可預訂體驗',`
- `zh-cn.ts`: `experiencesNearbyEyebrow: '准备好预订了吗？', experiencesNearbyHeading: '这里的可预订体验',`
- `ja.ts`: `experiencesNearbyEyebrow: '予約の準備はできましたか？', experiencesNearbyHeading: 'このエリアで予約できる体験',`
- `ko.ts`: `experiencesNearbyEyebrow: '예약할 준비가 되셨나요?', experiencesNearbyHeading: '이 지역의 예약 가능한 체험',`
- `th.ts`: `experiencesNearbyEyebrow: 'พร้อมจองหรือยัง?', experiencesNearbyHeading: 'ประสบการณ์ที่จองได้ในพื้นที่นี้',`

- [ ] **Step 5: Run tests to verify everything passes**

Run: `cd apps/web && npx vitest run tests/kinnso.experience-link-card.test.tsx tests/i18n.locale-parity.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/ExperienceLinkCard.tsx apps/web/lib/i18n/messages/*.ts apps/web/tests/kinnso.experience-link-card.test.tsx
git commit -m "feat(web): shared ExperienceLinkCard + i18n for embedded experience CTAs"
```

---

## Task 7: `ArticleExperienceLinks` — article page wiring

**Files:**
- Create: `apps/web/components/kinnso/articles/ArticleExperienceLinks.tsx`
- Modify: `apps/web/app/[locale]/articles/[category]/[url]/page.tsx`
- Test: `apps/web/tests/articles.experience-links.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/articles.experience-links.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

const getExperiencesForCityMock = vi.fn()
vi.mock('@/lib/experiences/public-queries', () => ({ getExperiencesForCity: getExperiencesForCityMock }))

import { ArticleExperienceLinks } from '@/components/kinnso/articles/ArticleExperienceLinks'
import en from '@/lib/i18n/messages/en'

const experience = (slug: string) => ({
  id: slug, slug, title: `Experience ${slug}`, summary: null, description: null, city: 'Tokyo',
  priceAmount: 1000, currency: 'JPY', durationMinutes: null, coverUrl: null, publishedAt: null,
  merchant: { slug: 'm', companyName: 'M' },
})

describe('ArticleExperienceLinks', () => {
  it('renders nothing when no experiences match any region', async () => {
    getExperiencesForCityMock.mockResolvedValue([])
    const jsx = await ArticleExperienceLinks({ locale: 'en', regions: ['Osaka'], t: en.article })
    const { container } = render(jsx)
    expect(container.innerHTML).toBe('')
  })

  it('renders up to 3 experience cards from the first region with matches, linking with ?src=article', async () => {
    getExperiencesForCityMock.mockResolvedValueOnce([experience('a'), experience('b')])
    const jsx = await ArticleExperienceLinks({ locale: 'en', regions: ['Tokyo'], t: en.article })
    render(jsx)
    expect(screen.getByText(en.article.experiencesNearbyHeading)).toBeTruthy()
    const link = screen.getByRole('link', { name: /Experience a/ })
    expect(link.getAttribute('href')).toBe('/en/experiences/a?src=article')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/articles.experience-links.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/web/components/kinnso/articles/ArticleExperienceLinks.tsx
import { ExperienceLinkCard } from '@/components/kinnso/ExperienceLinkCard'
import { getExperiencesForCity } from '@/lib/experiences/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** "Ready to book?" — sibling to ArticleGuideLinks, same regions/tag_slugs heuristic
 *  (D-R3-7). Renders nothing without a match; first region with any match wins,
 *  same one-shot-then-stop shape as getGuidesForRegions (no merge across regions). */
export async function ArticleExperienceLinks({ locale, regions, t }: {
  locale: Locale; regions: string[]; t: Messages['article']
}) {
  let experiences: Awaited<ReturnType<typeof getExperiencesForCity>> = []
  for (const region of regions) {
    experiences = await getExperiencesForCity(region)
    if (experiences.length > 0) break
  }
  if (experiences.length === 0) return null
  return (
    <aside aria-labelledby="article-experience-links" className="k2-hairline mt-10 pt-8">
      <p className="k2-eyebrow">{t.experiencesNearbyEyebrow}</p>
      <h2 id="article-experience-links" className="k2-display mt-3 text-2xl font-semibold text-kinnso-ink">{t.experiencesNearbyHeading}</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {experiences.map((exp) => (
          <ExperienceLinkCard key={exp.id} locale={locale} experience={exp} hrefQuery="src=article" />
        ))}
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Wire into the article page**

In `apps/web/app/[locale]/articles/[category]/[url]/page.tsx`, import and slot it
immediately after `<ArticleGuideLinks .../>`:

```typescript
import { ArticleExperienceLinks } from '@/components/kinnso/articles/ArticleExperienceLinks'
```
```tsx
          <ArticleGuideLinks locale={loc} regions={[...(a.regions ?? []), ...(a.tag_slugs ?? [])]} t={dict.article} />
          <ArticleExperienceLinks locale={loc} regions={[...(a.regions ?? []), ...(a.tag_slugs ?? [])]} t={dict.article} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/articles.experience-links.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/articles/ArticleExperienceLinks.tsx "apps/web/app/[locale]/articles/[category]/[url]/page.tsx" apps/web/tests/articles.experience-links.test.tsx
git commit -m "feat(web): embed bookable-experience CTAs on article pages"
```

---

## Task 8: `GuideExperienceLinks` — guide page wiring

**Files:**
- Create: `apps/web/components/kinnso/GuideExperienceLinks.tsx`
- Modify: `apps/web/app/[locale]/g/[slug]/page.tsx`
- Test: `apps/web/tests/kinnso.guide-experience-links.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/kinnso.guide-experience-links.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

const getExperiencesForCityMock = vi.fn()
vi.mock('@/lib/experiences/public-queries', () => ({ getExperiencesForCity: getExperiencesForCityMock }))

import { GuideExperienceLinks } from '@/components/kinnso/GuideExperienceLinks'
import en from '@/lib/i18n/messages/en'

const experience = (slug: string) => ({
  id: slug, slug, title: `Experience ${slug}`, summary: null, description: null, city: 'Kyoto',
  priceAmount: 3000, currency: 'JPY', durationMinutes: null, coverUrl: null, publishedAt: null,
  merchant: { slug: 'm', companyName: 'M' },
})

describe('GuideExperienceLinks', () => {
  it('renders nothing when no experiences match the city', async () => {
    getExperiencesForCityMock.mockResolvedValue([])
    const jsx = await GuideExperienceLinks({ locale: 'en', city: 'Kyoto', guideSlug: 'kyoto-tea', t: en.article })
    const { container } = render(jsx)
    expect(container.innerHTML).toBe('')
  })

  it('renders cards linking with ?src=guide&guideSlug=<the current guide>', async () => {
    getExperiencesForCityMock.mockResolvedValue([experience('a')])
    const jsx = await GuideExperienceLinks({ locale: 'en', city: 'Kyoto', guideSlug: 'kyoto-tea', t: en.article })
    render(jsx)
    const link = screen.getByRole('link', { name: /Experience a/ })
    expect(link.getAttribute('href')).toBe('/en/experiences/a?src=guide&guideSlug=kyoto-tea')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.guide-experience-links.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/web/components/kinnso/GuideExperienceLinks.tsx
import { ExperienceLinkCard } from '@/components/kinnso/ExperienceLinkCard'
import { getExperiencesForCity } from '@/lib/experiences/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** Guides have no reverse cross-link today (D-R3-7) — this is a wholly new slot,
 *  keyed on the guide's own city. The CTA carries this guide's slug through the
 *  query string so the eventual booking can attribute back to its creator
 *  (re-resolved server-side in createCheckoutSessionAction — see D-R3C-3). */
export async function GuideExperienceLinks({ locale, city, guideSlug, t }: {
  locale: Locale; city: string; guideSlug: string; t: Messages['article']
}) {
  const experiences = await getExperiencesForCity(city)
  if (experiences.length === 0) return null
  return (
    <div className="mt-6 rounded-lg bg-white p-6">
      <p className="k2-eyebrow">{t.experiencesNearbyEyebrow}</p>
      <h2 className="k2-display mt-3 text-lg font-semibold text-kinnso-ink">{t.experiencesNearbyHeading}</h2>
      <div className="mt-5 grid gap-4">
        {experiences.map((exp) => (
          <ExperienceLinkCard key={exp.id} locale={locale} experience={exp} hrefQuery={`src=guide&guideSlug=${guideSlug}`} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire into the guide page**

In `apps/web/app/[locale]/g/[slug]/page.tsx`, import and insert inside the left
`<div>`, after the "View all guides" link and before that div's closing tag (**not** as
a new grid sibling — see the Ground Truth §0 note on why this exact placement matters):

```typescript
import { GuideExperienceLinks } from '@/components/kinnso/GuideExperienceLinks'
```
```tsx
        <div className="rounded-lg bg-white p-6">
          <h2 className="text-base font-bold text-kinnso-ink">{messages.creatorProfile.destinationsCovered}</h2>
          <p className="mt-2 text-sm text-kinnso-muted">{guide.summary ?? guide.city}</p>
          <Link href={`/${locale}/feed`} className="k2-btn-ghost mt-5 inline-flex text-sm">
            {messages.creatorProfile.viewAllGuides}
          </Link>
          <GuideExperienceLinks locale={locale as Locale} city={guide.city} guideSlug={guide.slug} t={messages.article} />
        </div>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/kinnso.guide-experience-links.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/GuideExperienceLinks.tsx "apps/web/app/[locale]/g/[slug]/page.tsx" apps/web/tests/kinnso.guide-experience-links.test.tsx
git commit -m "feat(web): embed bookable-experience CTAs on guide detail pages"
```

---

## Task 9: `createCheckoutSessionAction` — server-rederived attribution

**Files:**
- Modify: `apps/web/lib/experiences/booking-types.ts`
- Modify: `apps/web/lib/experiences/booking-actions.ts`
- Test: `apps/web/tests/experiences.booking-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

Read `apps/web/tests/experiences.booking-actions.test.ts` first to match its existing
mock shape exactly (it mocks `createSupabaseServerClient`, `getExperienceById`,
`getStripeClient`), then add:

```typescript
import { getGuideBySlug } from '@/lib/guides/queries'
vi.mock('@/lib/guides/queries', () => ({ getGuideBySlug: vi.fn() }))

// ...inside the main describe block, alongside the existing "inserts a pending_payment booking" test:

it('defaults to source_surface "experience_page" when no attribution options are given (unchanged behavior)', async () => {
  // ...reuse this file's existing happy-path setup...
  await createCheckoutSessionAction(experienceId, validInput, { locale: 'en' })
  expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
    source_surface: 'experience_page', creator_id: null, guide_id: null,
  }))
})

it('sets source_surface "article" with no creator/guide attribution', async () => {
  await createCheckoutSessionAction(experienceId, validInput, { locale: 'en', sourceSurface: 'article' })
  expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
    source_surface: 'article', creator_id: null, guide_id: null,
  }))
})

it('sets source_surface "guide" and re-resolves creator_id/guide_id from a REAL guide looked up by slug', async () => {
  vi.mocked(getGuideBySlug).mockResolvedValue({
    id: 'g1', creatorId: 'c1', slug: 'kyoto-tea', title: 'T', cover: '', city: 'Kyoto', saves: 0,
    creatorHandle: 'h', summary: null, creatorName: null, publishedAt: null, source: 'db',
  })
  await createCheckoutSessionAction(experienceId, validInput, { locale: 'en', sourceSurface: 'guide', guideSlug: 'kyoto-tea' })
  expect(getGuideBySlug).toHaveBeenCalledWith('kyoto-tea')
  expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
    source_surface: 'guide', creator_id: 'c1', guide_id: 'g1',
  }))
})

it('falls back to source_surface "experience_page" when guideSlug does not resolve to a real guide', async () => {
  vi.mocked(getGuideBySlug).mockResolvedValue(null)
  await createCheckoutSessionAction(experienceId, validInput, { locale: 'en', sourceSurface: 'guide', guideSlug: 'nonexistent' })
  expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
    source_surface: 'experience_page', creator_id: null, guide_id: null,
  }))
})

it('ignores an unrecognized sourceSurface value, falling back to "experience_page"', async () => {
  await createCheckoutSessionAction(experienceId, validInput, { locale: 'en', sourceSurface: 'not-a-real-value' as never })
  expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
    source_surface: 'experience_page', creator_id: null, guide_id: null,
  }))
})
```

(Adapt `experienceId`/`validInput`/`insertSpy` to whatever this test file's existing
happy-path setup already names them — read the file's current top section before writing
these to slot in exactly, not duplicate its Supabase-mock scaffolding.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/experiences.booking-actions.test.ts`
Expected: FAIL — `options.sourceSurface`/`guideSlug` don't exist on the type; insert still
hardcodes `'experience_page'`.

- [ ] **Step 3: Implement — types**

In `apps/web/lib/experiences/booking-types.ts`, add:

```typescript
export const ALLOWED_SOURCE_SURFACES = ['guide', 'article', 'experience_page', 'direct'] as const
export type BookingSourceSurface = typeof ALLOWED_SOURCE_SURFACES[number]
```

- [ ] **Step 4: Implement — action**

In `apps/web/lib/experiences/booking-actions.ts`:

```typescript
import { getGuideBySlug } from '@/lib/guides/queries'
import { ALLOWED_SOURCE_SURFACES, type BookingSourceSurface } from '@/lib/experiences/booking-types'
```

Add a helper above `createCheckoutSessionAction`:

```typescript
/**
 * Re-resolves attribution server-side from a real, published guide — never trusts
 * a client-supplied creator/guide id directly (same house rule R3A-2 used for
 * price/currency re-derivation). An unrecognized surface or unresolvable slug
 * degrades to today's exact behavior rather than blocking the checkout (D-R3C-3).
 */
async function resolveAttribution(input: { sourceSurface?: string; guideSlug?: string }): Promise<{
  sourceSurface: BookingSourceSurface
  creatorId: string | null
  guideId: string | null
}> {
  const sourceSurface = (ALLOWED_SOURCE_SURFACES as readonly string[]).includes(input.sourceSurface ?? '')
    ? (input.sourceSurface as BookingSourceSurface)
    : 'experience_page'
  if (sourceSurface !== 'guide' || !input.guideSlug) {
    return { sourceSurface, creatorId: null, guideId: null }
  }
  const guide = await getGuideBySlug(input.guideSlug)
  if (!guide) return { sourceSurface: 'experience_page', creatorId: null, guideId: null }
  return { sourceSurface, creatorId: guide.creatorId, guideId: guide.id }
}
```

Extend the signature and the insert call:

```typescript
export async function createCheckoutSessionAction(
  experienceId: string,
  rawInput: CreateCheckoutSessionInput,
  options: { locale: Locale; sourceSurface?: string; guideSlug?: string },
): Promise<ActionResult<{ checkoutUrl: string }>> {
```

Right before the Stripe session is created (attribution failure must never block a real
payment, so resolve it early and let it be `experience_page`/nulls if anything's off):

```typescript
  const attribution = await resolveAttribution({ sourceSurface: options.sourceSurface, guideSlug: options.guideSlug })
```

And in the `bookings` insert, replace the hardcoded literal:

```typescript
  const { error: insertError } = await supabase.from('bookings').insert({
    experience_id: experienceId,
    availability_id: p.availabilityId,
    traveler_user_id: user?.id ?? null,
    guest_email: guestEmail,
    qty: p.qty,
    unit_amount: unitAmount,
    total_amount: totalAmount,
    currency: experience.currency,
    status: 'pending_payment',
    stripe_checkout_session_id: session.id,
    source_surface: attribution.sourceSurface,
    creator_id: attribution.creatorId,
    guide_id: attribution.guideId,
  })
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/experiences.booking-actions.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/experiences/booking-types.ts apps/web/lib/experiences/booking-actions.ts apps/web/tests/experiences.booking-actions.test.ts
git commit -m "feat(web): checkout action re-resolves creator/guide attribution server-side"
```

---

## Task 10: Thread attribution query params through the experience page → widget

**Files:**
- Modify: `apps/web/app/[locale]/experiences/[slug]/page.tsx`
- Modify: `apps/web/components/kinnso/pages/ExperiencePublicView.tsx`
- Modify: `apps/web/components/kinnso/pages/BookingWidget.tsx`
- Test: `apps/web/tests/experiences.booking-widget.host.test.tsx`
- Test: `apps/web/tests/experiences.public-detail.host.test.tsx`

- [ ] **Step 1: Extend the failing tests**

Read both existing test files first to match their current render-setup shape exactly,
then add (adapting prop names to whatever each file's existing helper already builds):

In `experiences.booking-widget.host.test.tsx`:
```typescript
it('threads sourceSurface/guideSlug through to createCheckoutSessionAction when present', async () => {
  // render <BookingWidget ... sourceSurface="guide" guideSlug="kyoto-tea" />, submit, then:
  expect(createCheckoutSessionActionMock).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Object),
    { locale: 'en', sourceSurface: 'guide', guideSlug: 'kyoto-tea' },
  )
})
it('omits sourceSurface/guideSlug when not provided (unchanged default behavior)', async () => {
  // render <BookingWidget ... /> with no sourceSurface/guideSlug prop, submit, then:
  expect(createCheckoutSessionActionMock).toHaveBeenCalledWith(
    expect.any(String), expect.any(Object), { locale: 'en' },
  )
})
```

In `experiences.public-detail.host.test.tsx`:
```typescript
it('reads src/guideSlug from searchParams and passes them down to the booking widget', async () => {
  // render the page with searchParams resolving to { src: 'guide', guideSlug: 'kyoto-tea' }
  // assert the rendered BookingWidget (or a data-testid on it) received those values —
  // exact assertion shape depends on how this file already renders/inspects the page.
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/experiences.booking-widget.host.test.tsx tests/experiences.public-detail.host.test.tsx`
Expected: FAIL — new props don't exist / aren't threaded yet.

- [ ] **Step 3: Implement — `BookingWidget.tsx`**

```typescript
export function BookingWidget({ locale, t, experience, availability, viewerEmail, sourceSurface, guideSlug }: {
  locale: Locale
  t: Messages['booking']
  experience: PublicExperience
  availability: PublicAvailability[]
  viewerEmail: string | null
  sourceSurface?: string
  guideSlug?: string
}) {
```

```typescript
      const result = await createCheckoutSessionAction(
        experience.id,
        { availabilityId: selectedId, qty, guestEmail },
        { locale, ...(sourceSurface ? { sourceSurface } : {}), ...(guideSlug ? { guideSlug } : {}) },
      )
```

- [ ] **Step 4: Implement — `ExperiencePublicView.tsx`**

```typescript
export function ExperiencePublicView({ locale, t, bookingT, experience, availability, viewerEmail, sourceSurface, guideSlug }: {
  locale: Locale
  t: Messages['experiencePublic']
  bookingT: Messages['booking']
  experience: PublicExperience
  availability: PublicAvailability[]
  viewerEmail: string | null
  sourceSurface?: string
  guideSlug?: string
}) {
```
```tsx
          <BookingWidget locale={locale} t={bookingT} experience={experience} availability={availability} viewerEmail={viewerEmail} sourceSurface={sourceSurface} guideSlug={guideSlug} />
```

- [ ] **Step 5: Implement — the page reads `searchParams`**

```typescript
export default async function ExperiencePublicPage({ params, searchParams }: {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale, slug } = await params
  const sp = await searchParams
  const firstOf = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const sourceSurface = firstOf(sp.src)
  const guideSlug = firstOf(sp.guideSlug)
  if (!isLocale(locale)) notFound()
```
```tsx
      <ExperiencePublicView
        locale={locale as Locale}
        t={messages.experiencePublic}
        bookingT={messages.booking}
        experience={experience}
        availability={availability}
        viewerEmail={user?.email ?? null}
        sourceSurface={sourceSurface}
        guideSlug={guideSlug}
      />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/experiences.booking-widget.host.test.tsx tests/experiences.public-detail.host.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/[locale]/experiences/[slug]/page.tsx" apps/web/components/kinnso/pages/ExperiencePublicView.tsx apps/web/components/kinnso/pages/BookingWidget.tsx apps/web/tests/experiences.booking-widget.host.test.tsx apps/web/tests/experiences.public-detail.host.test.tsx
git commit -m "feat(web): thread CTA attribution query params to the booking action"
```

---

## Task 11: Product/Offer JSON-LD when real availability exists (carry-forward)

**Files:**
- Modify: `apps/web/lib/seo/jsonld.ts`
- Modify: `apps/web/app/[locale]/experiences/[slug]/page.tsx`
- Test: `apps/web/tests/seo.jsonld.test.ts` (extend if it exists; otherwise
  `apps/web/tests/experiences.public-detail.host.test.tsx` already renders this page —
  check which file already covers `jsonld.ts` builders before creating a new one)

- [ ] **Step 1: Write the failing test**

```typescript
// added to whichever file already tests apps/web/lib/seo/jsonld.ts builders
import { experienceOfferJsonLd } from '@/lib/seo/jsonld'

describe('experienceOfferJsonLd', () => {
  it('builds a Product/Offer schema from an experience', () => {
    const ld = experienceOfferJsonLd({
      name: 'Sunset tour', description: 'Two hours on the harbour.', url: 'https://x/experiences/sunset-tour',
      image: 'https://x/cover.jpg', priceAmount: 480, currency: 'HKD',
    })
    expect(ld).toEqual({
      '@context': 'https://schema.org', '@type': 'Product',
      name: 'Sunset tour', description: 'Two hours on the harbour.', image: 'https://x/cover.jpg',
      offers: { '@type': 'Offer', url: 'https://x/experiences/sunset-tour', priceCurrency: 'HKD', price: 480, availability: 'https://schema.org/InStock' },
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/seo.jsonld.test.ts` (or the file identified in
Step 1)
Expected: FAIL — `experienceOfferJsonLd` not exported.

- [ ] **Step 3: Implement — builder**

Add to `apps/web/lib/seo/jsonld.ts`:

```typescript
export function experienceOfferJsonLd(i: {
  name: string; description: string; url: string; image: string | null
  priceAmount: number; currency: string
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'Product',
    name: i.name, description: i.description, image: i.image,
    offers: {
      '@type': 'Offer', url: i.url, priceCurrency: i.currency, price: i.priceAmount,
      availability: 'https://schema.org/InStock',
    },
  }
}
```

- [ ] **Step 4: Implement — wire into the experience page, gated on real open availability**

In `apps/web/app/[locale]/experiences/[slug]/page.tsx`, replace the comment this task
closes out and extend the `ld` array:

```typescript
import { breadcrumbJsonLd, experienceOfferJsonLd } from '@/lib/seo/jsonld'
```
```typescript
  const hasOpenAvailability = availability.some((a) => a.remaining > 0)
  const ld = [
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: messages.seo.merchants.title, url: `${SITE_URL}/${locale}/merchants` },
      { name: experience.title, url: canonical },
    ]),
    ...(hasOpenAvailability
      ? [experienceOfferJsonLd({
          name: experience.title,
          description: experience.summary ?? experience.description ?? `${experience.city} experience`,
          url: canonical,
          image: experience.coverUrl,
          priceAmount: experience.priceAmount,
          currency: experience.currency,
        })]
      : []),
  ]
```

Remove the now-resolved carry-forward comment (lines 46-48 in the pre-R3C file) since
this task is what it was waiting for.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/seo.jsonld.test.ts tests/experiences.public-detail.host.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/seo/jsonld.ts "apps/web/app/[locale]/experiences/[slug]/page.tsx"
git commit -m "feat(seo): Product/Offer JSON-LD once an experience has real open availability"
```

---

## Task 12: `fetchTravelpayoutsActions()` — real Finance v2 API client

**Files:**
- Modify: `apps/web/lib/missions/travelpayouts.ts`
- Test: `apps/web/tests/mission.travelpayouts.test.ts`

- [ ] **Step 1: Write the failing tests**

Read the existing `mission.travelpayouts.test.ts` first to match its `fetch` mocking
style, then add:

```typescript
describe('fetchTravelpayoutsActions', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('calls the Finance v2 endpoint with X-Access-Token and pagination params, normalizing each action', async () => {
    process.env.TRAVELPAYOUTS_API_TOKEN = 'tok'
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ actions: [{ action_id: 'a1', campaign_id: '101', action_state: 'paid', price: 100, profit: 10, booked_at: '2026-07-01', updated_at: '2026-07-02' }] }),
    }))
    global.fetch = fetchMock as unknown as typeof fetch

    const actions = await fetchTravelpayoutsActions({ from: '2026-06-28' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string)
    expect(calledUrl.origin + calledUrl.pathname).toBe('https://api.travelpayouts.com/finance/v2/get_user_actions_affecting_balance')
    expect(calledUrl.searchParams.get('currency')).toBe('usd')
    expect(calledUrl.searchParams.get('limit')).toBe('300')
    expect(calledUrl.searchParams.get('offset')).toBe('0')
    expect(calledUrl.searchParams.get('from')).toBe('2026-06-28')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { 'X-Access-Token': 'tok' } })
    expect(actions).toEqual([expect.objectContaining({ externalActionId: 'a1', eventState: 'paid', priceAmount: 100, profitAmount: 10 })])
  })

  it('paginates until a short page, respecting a maxPages safety cap', async () => {
    process.env.TRAVELPAYOUTS_API_TOKEN = 'tok'
    const fullPage = Array.from({ length: 300 }, (_, i) => ({ action_id: `p1-${i}`, action_state: 'paid' }))
    const shortPage = [{ action_id: 'p2-0', action_state: 'paid' }]
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ actions: fullPage }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ actions: shortPage }) })
    global.fetch = fetchMock as unknown as typeof fetch

    const actions = await fetchTravelpayoutsActions()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(actions).toHaveLength(301)
  })

  it('throws with the response body on a non-ok response (never swallows a real API error)', async () => {
    process.env.TRAVELPAYOUTS_API_TOKEN = 'tok'
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' })) as unknown as typeof fetch
    await expect(fetchTravelpayoutsActions()).rejects.toThrow(/401.*Unauthorized/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/mission.travelpayouts.test.ts`
Expected: FAIL — `fetchTravelpayoutsActions` is not exported.

- [ ] **Step 3: Implement**

Add to `apps/web/lib/missions/travelpayouts.ts` (near `normalizeTravelpayoutsAction`):

```typescript
const actionsEndpoint = 'https://api.travelpayouts.com/finance/v2/get_user_actions_affecting_balance'
const maxActionsPerPage = 300
const defaultMaxPages = 10 // safety cap: 3000 actions/run, bounds worst-case cron duration

type RawTravelpayoutsActionsResponse = {
  actions?: Array<Record<string, unknown>>
}

/**
 * Fetches affiliate actions from the real Travelpayouts Finance v2 API
 * (D-R3-9) — verified against the public Travelpayouts Help Center, not
 * fabricated. Response has no per-action currency (it's a request-scoped
 * param), which is exactly why normalizeTravelpayoutsAction() already
 * defaults to 'usd' when raw.currency is absent.
 */
export async function fetchTravelpayoutsActions(opts: {
  currency?: string
  from?: string
  until?: string
  maxPages?: number
} = {}): Promise<TravelpayoutsAction[]> {
  const token = requireEnv('TRAVELPAYOUTS_API_TOKEN')
  const currency = opts.currency ?? 'usd'
  const maxPages = opts.maxPages ?? defaultMaxPages
  const actions: TravelpayoutsAction[] = []

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(actionsEndpoint)
    url.searchParams.set('currency', currency)
    url.searchParams.set('limit', String(maxActionsPerPage))
    url.searchParams.set('offset', String(page * maxActionsPerPage))
    if (opts.from) url.searchParams.set('from', opts.from)
    if (opts.until) url.searchParams.set('until', opts.until)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'X-Access-Token': token },
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Travelpayouts actions request failed: ${response.status} ${body}`.trim())
    }
    const json = (await response.json()) as RawTravelpayoutsActionsResponse
    const pageActions = json.actions ?? []
    for (const raw of pageActions) actions.push(normalizeTravelpayoutsAction(raw))
    if (pageActions.length < maxActionsPerPage) break
  }

  return actions
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/mission.travelpayouts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/travelpayouts.ts apps/web/tests/mission.travelpayouts.test.ts
git commit -m "feat(web): fetchTravelpayoutsActions against the real Finance v2 API"
```

---

## Task 13: `app/api/cron/travelpayouts-sync/route.ts` — the repair job itself

**Files:**
- Create: `apps/web/app/api/cron/travelpayouts-sync/route.ts`
- Modify: `apps/web/lib/supabase/service.ts` (doc comment only)
- Modify: `apps/web/vercel.json`
- Modify: `apps/web/.env.example`
- Test: `apps/web/tests/api.cron-travelpayouts-sync.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/api.cron-travelpayouts-sync.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchActionsMock = vi.fn()
vi.mock('@/lib/missions/travelpayouts', () => ({ fetchTravelpayoutsActions: fetchActionsMock }))

const upsertMock = vi.fn(async () => ({ error: null }))
const programsSelectMock = vi.fn(async () => ({ data: [{ id: 'prog1', external_program_id: '101' }], error: null }))
const linksSelectMock = vi.fn(async () => ({ data: [{ sub_id: 'kinnso_m_1_p_2_c_3', mission_id: 'm1', mission_participant_id: 'p1', creator_id: 'c1' }], error: null }))
const fromMock = vi.fn((table: string) => {
  if (table === 'affiliate_network_programs') return { select: () => ({ eq: () => ({ in: programsSelectMock }) }) }
  if (table === 'affiliate_partner_links') return { select: () => ({ eq: () => ({ in: linksSelectMock }) }) }
  if (table === 'affiliate_network_events') return { upsert: upsertMock }
  throw new Error(`unexpected table ${table}`)
})
vi.mock('@/lib/supabase/service', () => ({ createSupabaseServiceClient: () => ({ from: fromMock }) }))

import { GET } from '@/app/api/cron/travelpayouts-sync/route'

const makeReq = (bearer?: string) =>
  new Request('http://x/api/cron/travelpayouts-sync', {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 's3cret'
  programsSelectMock.mockResolvedValue({ data: [{ id: 'prog1', external_program_id: '101' }], error: null })
  linksSelectMock.mockResolvedValue({ data: [{ sub_id: 'kinnso_m_1_p_2_c_3', mission_id: 'm1', mission_participant_id: 'p1', creator_id: 'c1' }], error: null })
  upsertMock.mockResolvedValue({ error: null })
})

describe('GET /api/cron/travelpayouts-sync', () => {
  it('401s without the Authorization: Bearer <CRON_SECRET> header (Vercel Cron\'s real invocation shape)', async () => {
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
    expect(fetchActionsMock).not.toHaveBeenCalled()
  })

  it('401s with the wrong secret', async () => {
    const res = await GET(makeReq('wrong'))
    expect(res.status).toBe(401)
  })

  it('fetches, maps program/sub_id lookups, and upserts on the correct conflict target', async () => {
    fetchActionsMock.mockResolvedValue([
      { externalActionId: 'a1', externalProgramId: '101', eventState: 'paid', subId: 'kinnso_m_1_p_2_c_3', priceAmount: 100, profitAmount: 10, currency: 'usd', bookedAt: '2026-07-01', updatedAt: '2026-07-02', raw: {} },
    ])
    const res = await GET(makeReq('s3cret'))
    expect(res.status).toBe(200)
    expect(upsertMock).toHaveBeenCalledWith(
      [expect.objectContaining({
        network: 'travelpayouts', external_action_id: 'a1',
        affiliate_network_program_id: 'prog1',
        mission_id: 'm1', mission_participant_id: 'p1', creator_id: 'c1',
        sub_id: 'kinnso_m_1_p_2_c_3', event_state: 'paid',
      })],
      { onConflict: 'network,external_action_id' },
    )
  })

  it('best-effort maps: an action whose program/sub_id has no local match still upserts, with null FKs', async () => {
    programsSelectMock.mockResolvedValue({ data: [], error: null })
    linksSelectMock.mockResolvedValue({ data: [], error: null })
    fetchActionsMock.mockResolvedValue([
      { externalActionId: 'a2', externalProgramId: 'unknown-campaign', eventState: 'unknown', subId: null, priceAmount: null, profitAmount: null, currency: 'usd', bookedAt: null, updatedAt: null, raw: {} },
    ])
    const res = await GET(makeReq('s3cret'))
    expect(res.status).toBe(200)
    expect(upsertMock).toHaveBeenCalledWith(
      [expect.objectContaining({ affiliate_network_program_id: null, mission_id: null, mission_participant_id: null, creator_id: null })],
      { onConflict: 'network,external_action_id' },
    )
  })

  it('returns synced:0 and skips the upsert entirely when the fetch yields nothing', async () => {
    fetchActionsMock.mockResolvedValue([])
    const res = await GET(makeReq('s3cret'))
    const body = await res.json()
    expect(body).toEqual({ ok: true, synced: 0 })
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('502s when the Travelpayouts fetch itself throws', async () => {
    fetchActionsMock.mockRejectedValue(new Error('network down'))
    const res = await GET(makeReq('s3cret'))
    expect(res.status).toBe(502)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/api.cron-travelpayouts-sync.test.ts`
Expected: FAIL — route module does not exist.

- [ ] **Step 3: Implement the route**

```typescript
// apps/web/app/api/cron/travelpayouts-sync/route.ts
import { NextResponse } from 'next/server'
import { fetchTravelpayoutsActions } from '@/lib/missions/travelpayouts'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

/**
 * D-R3-9: Vercel-Cron-triggered repair job. Vercel Cron authenticates by
 * sending `Authorization: Bearer $CRON_SECRET` automatically (not a custom
 * header — see plan D-R3C-1) whenever `vercel.json`'s `crons` entry fires.
 * Second sanctioned service-role exception alongside the Stripe webhook
 * (lib/supabase/service.ts) — same trust shape: no user session, shared-
 * secret-gated, server-to-server, narrow set of writes.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let actions
  try {
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    actions = await fetchTravelpayoutsActions({ from })
  } catch (err) {
    console.error('[cron:travelpayouts-sync] fetch failed', err)
    return NextResponse.json({ ok: false, error: 'fetch failed' }, { status: 502 })
  }

  const withActionId = actions.filter((a) => a.externalActionId !== null)
  if (withActionId.length === 0) {
    return NextResponse.json({ ok: true, synced: 0 })
  }

  const supabase = createSupabaseServiceClient()

  const programIds = [...new Set(withActionId.map((a) => a.externalProgramId).filter((id): id is string => id !== null))]
  const { data: programs, error: programsError } = await supabase
    .from('affiliate_network_programs')
    .select('id, external_program_id')
    .eq('network', 'travelpayouts')
    .in('external_program_id', programIds.length > 0 ? programIds : ['__none__'])
  if (programsError) {
    console.error('[cron:travelpayouts-sync] program lookup failed', programsError)
    return NextResponse.json({ ok: false, error: 'program lookup failed' }, { status: 500 })
  }
  const programIdMap = new Map((programs ?? []).map((p) => [p.external_program_id as string, p.id as string]))

  const subIds = [...new Set(withActionId.map((a) => a.subId).filter((id): id is string => id !== null))]
  const { data: links, error: linksError } = await supabase
    .from('affiliate_partner_links')
    .select('sub_id, mission_id, mission_participant_id, creator_id')
    .eq('network', 'travelpayouts')
    .in('sub_id', subIds.length > 0 ? subIds : ['__none__'])
  if (linksError) {
    console.error('[cron:travelpayouts-sync] partner link lookup failed', linksError)
    return NextResponse.json({ ok: false, error: 'link lookup failed' }, { status: 500 })
  }
  const linkMap = new Map((links ?? []).map((l) => [l.sub_id as string, l]))

  const rows = withActionId.map((a) => {
    const link = a.subId ? linkMap.get(a.subId) : undefined
    return {
      network: 'travelpayouts' as const,
      external_action_id: a.externalActionId as string,
      affiliate_network_program_id: a.externalProgramId ? (programIdMap.get(a.externalProgramId) ?? null) : null,
      mission_id: link?.mission_id ?? null,
      mission_participant_id: link?.mission_participant_id ?? null,
      creator_id: link?.creator_id ?? null,
      sub_id: a.subId,
      event_state: a.eventState ?? 'unknown',
      price_amount: a.priceAmount,
      profit_amount: a.profitAmount,
      currency: a.currency,
      booked_at: a.bookedAt,
      external_updated_at: a.updatedAt,
    }
  })

  const { error: upsertError } = await supabase
    .from('affiliate_network_events')
    .upsert(rows, { onConflict: 'network,external_action_id' })
  if (upsertError) {
    console.error('[cron:travelpayouts-sync] upsert failed', upsertError)
    return NextResponse.json({ ok: false, error: 'upsert failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, synced: rows.length })
}
```

- [ ] **Step 4: Update the service-client doc comment (D-R3C-1)**

In `apps/web/lib/supabase/service.ts`:

```typescript
/**
 * Service-role Supabase client — bypasses RLS entirely. Two documented
 * exceptions are permitted to use this: the Stripe webhook (design spec §4.5)
 * and the Travelpayouts cron sync route (R3C, plan D-R3C-1) — both are
 * non-user-facing, shared-secret-gated, server-to-server routes with a narrow,
 * auditable set of writes. No other request path in this codebase may import
 * this file.
 */
```

- [ ] **Step 5: Register the Vercel Cron schedule**

In `apps/web/vercel.json`:

```json
{
  "framework": "nextjs",
  "regions": ["hkg1"],
  "buildCommand": "cd ../.. && pnpm --filter web build",
  "installCommand": "cd ../.. && pnpm install",
  "crons": [
    { "path": "/api/cron/travelpayouts-sync", "schedule": "0 3 * * *" }
  ]
}
```

(Once daily at 03:00 UTC — adjust cadence to whatever Vercel plan tier this project is
on; Hobby tier only permits daily-or-less-frequent cron schedules.)

- [ ] **Step 6: Document the new env var**

In `apps/web/.env.example`, after `REVALIDATE_SECRET`:

```
# Shared secret for the Travelpayouts sync cron job (GET /api/cron/travelpayouts-sync).
# Vercel Cron sends this automatically as `Authorization: Bearer $CRON_SECRET` once
# the crons entry in vercel.json is configured — no header customization needed/possible.
CRON_SECRET=<shared-secret>
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/api.cron-travelpayouts-sync.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add "apps/web/app/api/cron/travelpayouts-sync/route.ts" apps/web/lib/supabase/service.ts apps/web/vercel.json apps/web/.env.example apps/web/tests/api.cron-travelpayouts-sync.test.ts
git commit -m "feat(web): Travelpayouts repair-job cron route (D-R3-9)"
```

---

## Task 14: Full-suite verification + i18n/RLS regression sweep

**Files:** none new — verification only.

- [ ] **Step 1: Full test suite**

Run: `cd apps/web && npx vitest run`
Expected: all tests pass (baseline was 1355/1355 passing, 31 skipped — expect
1355+new tests, 0 new failures, same 31 pre-existing skips).

- [ ] **Step 2: Typecheck + lint**

Run (from repo root): `pnpm typecheck && pnpm lint`
Expected: 0 errors in both.

- [ ] **Step 3: i18n parity**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts`
Expected: PASS — confirms all 3 new keys (`article.experiencesNearbyEyebrow/Heading`,
`home.statCompletedBookings`) exist identically across all 7 locale files.

- [ ] **Step 4: Regenerate `@kinnso/db` types against the applied migration**

Run: `pnpm --filter @kinnso/db gen` (after Task 1's migration is live — confirms
`platform_stats`'s new return shape and the new `app_private.count_completed_bookings`
function are reflected, and catches any hand-patch drift before it becomes a later
carry-forward, per the R3A-1 carry-forward #6 lesson).

- [ ] **Step 5: Grep safety net for the hardcoded literal this phase removed**

Run: `grep -rn "source_surface: 'experience_page'" apps/web/lib apps/web/app`
Expected: no matches (confirms Task 9 actually replaced the hardcoded literal, not just
added a new code path alongside it).

- [ ] **Step 6: Commit any fixes found during verification**

If any of the above turns up an issue, fix it and commit separately with a message
describing what regression sweep caught it — do not fold fixes into earlier task commits.

---

## Task 15: Final holistic branch review

**Files:** none new — review only.

- [ ] **Step 1: Dispatch a fresh review subagent** (no context from implementation) across
  the whole `feat/revision-r3c` branch diff against `main`, matching the review depth
  used for every prior R-phase (R3A-1, R3A-2, R3B) — explicitly check:
  - D-R3C-1: is `createSupabaseServiceClient()` used ONLY inside the cron route + the
    Stripe webhook, nowhere else?
  - D-R3C-2: is `app_private.count_completed_bookings()`'s grant/revoke actually applied
    live (not just in the migration file) — re-query `pg_proc`/ACLs directly, don't trust
    the file alone (matches the R3A-2/R3B default-ACL-gotcha lesson).
  - D-R3C-3: does `resolveAttribution` ever trust a client-supplied `creatorId` directly
    (it must not — only a slug, re-resolved server-side)?
  - Currency-summing house rule: no new code sums across currencies.
  - i18n parity: all 7 locales, no leftover English-only placeholder text.
  - The removed carry-forward comment in `experiences/[slug]/page.tsx` — confirm Task 11
    actually deleted it, not just added code alongside a stale comment.

- [ ] **Step 2: Fix any Critical/Important findings directly** (same session, before
  proposing a PR) — re-run the affected tests after each fix.

- [ ] **Step 3: Report remaining Minor/carry-forward findings** in a short note (matching
  the R3A-1/R3B pattern of a consolidated carry-forwards doc if there's more than a
  couple), then hand off per `finishing-a-development-branch`.

---

## 4. Testing summary

Per-slice, following R2/R3's established layering: `*-queries.test.ts` /
`*-actions.test.ts` / `*.host.test.tsx` / `db.*-migration.test.ts` (raw-SQL string
assertions, never a live DB in unit tests). New this phase: a real `fetch`-mocked HTTP
client test (`fetchTravelpayoutsActions`) — first time this codebase tests an outbound
fetch to a third-party API with pagination logic, modeled on the existing
`createTravelpayoutsPartnerLinks` tests' fetch-mocking shape.

## 5. Out of scope (R3C)

Real Travelpayouts campaign ids replacing `offer-catalog.ts`'s placeholders (user/business
action item, cannot be fabricated in code) · a stateful Travelpayouts sync cursor (D-R3C-5
explicitly chooses the rolling-window approach instead) · retrofitting existing
(pre-R3C) bookings' `creator_id`/`guide_id` — this phase only affects new bookings made
through a CTA going forward · a merchant/creator-facing view of the Travelpayouts ledger
(ops-only, same as `booking_settlements`, unchanged) · Trip/Event schema variants beyond
Product/Offer (out of the master spec's R3 scope entirely) · related-experiences on the
experience detail page itself (D-R3-7 is about *inbound* CTAs from content, not a
same-page upsell).

## 6. Self-review (per writing-plans skill)

- **Spec coverage**: D-R3-7 (Tasks 4–10), D-R3-8 (Tasks 1–3), D-R3-9 (Tasks 12–13) all
  have concrete tasks. The one item not in the master doc's literal 3-item split
  (Product/Offer JSON-LD, Task 11) is explicitly flagged as a carry-forward found in the
  shipped code's own comment, not silently folded in.
- **Placeholder scan**: no TBD/TODO/"add appropriate"/"similar to Task N" language;
  every code step has complete, real code, including the two SQL functions, the real
  Travelpayouts endpoint (verified via web search, sourced), and full i18n translations
  for all 7 locales (not left as English-only placeholders).
- **Type consistency**: `BookingSourceSurface` (Task 9) matches the `source_surface`
  CHECK constraint's real enum values; `GuideDetail.id`/`creatorId` (Task 5) are the exact
  fields `resolveAttribution` (Task 9) and `GuideExperienceLinks` (Task 8) consume;
  `PublicExperience` (unchanged) is what `ExperienceLinkCard` (Task 6) and
  `getExperiencesForCity` (Task 4) both use, with no shape drift.
