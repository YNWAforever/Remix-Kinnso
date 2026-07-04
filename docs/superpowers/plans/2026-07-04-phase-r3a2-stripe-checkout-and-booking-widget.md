# Phase R3A-2 — Stripe Checkout + Webhook + Public Booking Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make booking real. A traveler (signed-in or guest) can pick an open date on
`/experiences/[slug]`, pay via Stripe hosted Checkout, and land on a confirmation page
that shows their booking once the webhook confirms it — replacing the static "Booking
opens soon" placeholder with a working, money-moving flow.

**Architecture:** A new server action creates a Stripe Checkout Session and a matching
`bookings` row (`status='pending_payment'`) in the same call, after a DB-backed IP rate
limit check. Stripe redirects the traveler to its own hosted payment page; on success it
calls our webhook (`/api/stripe/webhook`), which — after signature verification — invokes
a new `confirm_booking_from_webhook()` SECURITY DEFINER RPC that flips the booking to
`confirmed`, increments `experience_availability.booked_count`, and writes a
`booking_events` audit row, all idempotently (Stripe redelivers events). The traveler is
then redirected back to a new confirmation page that reads the booking back via a second
SECURITY DEFINER RPC keyed on the unguessable Stripe Checkout Session id — the one
sanctioned anon-read exception, extending the same pattern the webhook itself relies on.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions + Route
Handlers), Stripe Node SDK (`stripe`), Supabase Postgres (RLS, `SECURITY DEFINER` RPCs,
service-role client for the one documented webhook exception), TypeScript, Vitest,
Tailwind v4 (`kinnso-*` / `k2-*` tokens).

---

## Ground truth this plan relies on (verified 2026-07-04)

- Repo: `/Users/willylai/Documents/Claude/Projects/Remix Kinnso/kinnso-v3`, worktree
  `.worktrees/feat-revision-r3a2`, branch `feat/revision-r3a2` stacked on
  `feat/revision-r3a1` @ `0be8d3e` (PR #70, OPEN — not yet merged to `main`). Design spec:
  `docs/superpowers/specs/2026-07-04-phase-r3-booking-mvp-design.md` (§D-R3-2 guest
  checkout, §D-R3-3 data model/RLS, §D-R3-4 Stripe integration shape, §4 security
  invariants). R3A-1's own plan (`docs/superpowers/plans/2026-07-04-phase-r3a1-traveler-
  role-and-booking-core.md` §"Out of scope") names this plan's scope exactly: "Stripe
  Checkout Session creation, the Stripe webhook, the public booking widget replacing
  `/experiences/[slug]`'s 'Booking opens soon' state, the booking confirmation page,
  guest-checkout abuse rate-limiting, `booking_events`-writing RPCs." Explicitly **not**
  in scope: `booking_settlements`/merchant-booking-pipeline UI (R3B), embedded
  experience CTAs in guides/articles (R3C), social-proof bookings count (R3C).
- Live Supabase project: `scryfkefedzuetfdtrvl` (org `eerkaskxrxxfrtgetuqx`).
- **`bookings` table** (`supabase/migrations/20260704110000_r3a1_traveler_role_and_booking_core.sql:133-191`,
  shipped, full contents read this session): `status` defaults `'pending_payment'`,
  check `in ('pending_payment','confirmed','completed','cancelled','refunded')`.
  `stripe_checkout_session_id text unique` and `stripe_payment_intent_id text unique`
  exist but are nullable and unused so far. `traveler_user_id`/`guest_email` are XOR via
  `bookings_traveler_xor_guest`. **No UPDATE grant to any role** — `revoke all ... from
  anon, authenticated; grant insert on table public.bookings to anon; grant select,
  insert on table public.bookings to authenticated`. RLS: `bookings_owner_insert`
  (authenticated, `traveler_user_id = auth.uid() and status = 'pending_payment'`),
  `bookings_guest_insert` (anon, `traveler_user_id is null and guest_email is not null
  and status = 'pending_payment'`), `bookings_owner_select` (authenticated, own rows
  only), `bookings_ops_select`. **This plan's checkout action inserts directly through
  these RLS policies — no RPC needed for creation**, matching design spec §D-R3-4
  ("a server action ... creates the bookings row ... and the Stripe Checkout Session in
  the same call").
- **`experience_availability`** (same migration, lines 71-130): `booked_count integer
  not null default 0 check (booked_count &gt;= 0 and booked_count &lt;= capacity)` — the
  upper-bound CHECK is a **hard DB constraint**, not just a convention (see Phase
  decision PD-1 below, this is load-bearing for the confirmation RPC's design).
  `experience_availability_public_read` policy (anon + authenticated, `status = 'open'
  and date &gt;= current_date and app_private.experience_is_bookable(experience_id)`)
  co-exists with `experience_availability_owner_all` (authenticated, merchant-owner full
  CRUD on their own rows regardless of open/closed/past) — RLS policies OR together, so
  a signed-in **merchant** browsing their own experience's page would additionally see
  non-open/past rows through their owner policy. This plan's checkout action re-checks
  `status === 'open'` and `date &gt;= today` explicitly in code (not purely trusting "row
  is selectable") specifically to close this narrow loophole — see PD-4.
- **`booking_events`**: 5 columns (`id, booking_id, event_type, metadata, created_at`) —
  no actor column (unlike `ops_audit_log`'s 7-column shape with
  `actor_ops_member_id`), since these are system/webhook writes, not ops actions. **No
  insert/update/delete policy for any role** — every write must go through a SECURITY
  DEFINER RPC.
- **RPC pattern to mirror**: `admin_set_settlement_status()`
  (`supabase/migrations/20260701170000_ops_role_enforcement.sql:376-463`, full body read
  this session) — `security definer set search_path = public`, row-locks the target with
  `for update`, tracks a `v_changed jsonb` object, raises named exceptions
  (`'not_found'`, `'bad_status'`, etc.) rather than generic errors, calls
  `ops_audit_log_append()` in the same transaction. `confirm_booking_from_webhook()`
  mirrors this shape (row-lock, named exceptions) but is **not** ops-gated (there is no
  ops session on a webhook call) — it is instead grant-gated to `service_role` only
  (§4.5's documented service-role exception), and instead of `ops_audit_log_append()` it
  inserts directly into `booking_events` (different table, different shape, no actor).
- **Webhook route template**: `apps/web/app/api/revalidate/route.ts` (full 16-line file
  read this session) — no Supabase session; shared-secret header check; raw-body
  `req.json()` inside try/catch; uniform `NextResponse.json({...}, {status})` for every
  branch (401/400/200). This plan's `/api/stripe/webhook/route.ts` mirrors the shape
  (no session, uniform JSON responses, try/catch around body handling) but swaps the
  shared-secret header for Stripe signature verification against the **raw** body via
  `req.text()` (a webhook needs the exact byte stream Stripe signed; `req.json()` would
  re-serialize and break signature verification) — new in this codebase, no existing
  route needs raw-body handling.
- **The only true anon-write precedent before this phase**: `agent_waitlist`
  (`supabase/migrations/20260703090000_r1c_agent_waitlist_and_testimonials_updated_at.sql`,
  `apps/web/lib/agent/waitlist-actions.ts`, both read in full this session) — anon
  `INSERT ... WITH CHECK (true)`, no RPC, documented as a §7 deviation because "no
  money/state is touched." **`bookings`' anon-insert is different and higher-stakes**:
  money changes hands downstream. The design spec's own mitigation for this
  (D-R3-2) is the per-IP rate limit this plan implements as PD-2.
- **No rate-limiting utility exists anywhere in the repo** (confirmed by an exhaustive
  case-insensitive grep across `apps/web`, `packages`, root `package.json`/
  `pnpm-lock.yaml` — zero hits for any rate-limiting package or utility; the only
  "rate limit" mentions are Supabase Auth's own built-in config and unrelated test/doc
  references). See PD-2 for why this plan builds a small Postgres-backed limiter
  instead of reaching for a new vendor (e.g. Upstash).
- **Stripe is not a dependency anywhere** (grep confirmed on root/`apps/web`
  `package.json` and `pnpm-lock.yaml`) — this is a from-scratch SDK integration.
- **`.env.example`** (`apps/web/.env.example`, full contents read this session) has no
  `STRIPE_*` entries yet. Existing entries use a `replace_with_...` placeholder
  convention (e.g. `TRAVELPAYOUTS_API_TOKEN=replace_with_rotated_token_before_production`)
  — this plan's additions follow the same convention.
- **Anon-vs-signed-in detection**: `apps/web/lib/auth/viewer-role.ts:15-16` —
  `const { data: { user } } = await supabase.auth.getUser(); if (!user) return 'anon'`.
  `apps/web/lib/supabase/server.ts` (`createSupabaseServerClient()`, full 31-line file
  read this session) is cookie-based and falls back to the `anon` Postgres role when no
  session cookie is present — this plan's checkout action uses this same client for
  **both** guest and signed-in callers (no branching on which client to instantiate),
  consistent with security invariant §4.5 ("no service-role in request paths except the
  Stripe webhook").
- **`apps/web/lib/experiences/public-queries.ts`** (full 87-line file read this
  session): `getExperienceBySlug(slug)` — anon client, two-query pattern (experience by
  slug, then `merchant_public_profiles` by id — **never** a PostgREST embed, since anon
  has no grant on the PII `merchant_profiles` table). `PublicExperience` type already
  has everything checkout pricing needs (`priceAmount`, `currency`, `title`). This plan
  **adds** `getExperienceById` to this same file (mirrors `getExperienceBySlug` exactly,
  keyed by `id` instead of `slug`) rather than creating a new file, since it's the same
  responsibility (public experience reads) just keyed differently.
- **`apps/web/lib/experiences/availability-actions.ts` / `availability-queries.ts` /
  `availability-validation.ts` / `availability-types.ts`** (all read in full this
  session, all shipped in R3A-1): the exact action/query/validation/types split this
  plan's booking files mirror. Local `ActionFailure`/`ActionResult` discriminated-union
  types + a `formError` helper (redeclared per-file, not imported from
  `lib/admin/result.ts`, which is ops-only — same repo-wide convention).
  `validateAvailabilityInput`'s style (accumulate errors in a `Record&lt;string,
  string[]&gt;`, parse form-strings to typed values, return a discriminated union) is
  mirrored exactly by this plan's `validateCheckoutInput`.
- **`apps/web/components/kinnso/pages/ExperiencePublicView.tsx`** (full 59-line file
  read this session) — the "Booking opens soon" block is lines 45-48:
  ```
  &lt;div className="mt-6 rounded-[3px] border border-kinnso-edge bg-white px-4 py-3"&gt;
    &lt;p className="text-sm font-semibold text-kinnso-ink"&gt;{t.bookingSoonBadge}&lt;/p&gt;
    &lt;p className="mt-1 text-xs text-kinnso-muted"&gt;{t.bookingSoonNote}&lt;/p&gt;
  &lt;/div&gt;
  ```
  This plan replaces that block with `&lt;BookingWidget /&gt;`, reusing the identical
  outer container classes for visual continuity. `apps/web/app/[locale]/experiences/
  [slug]/page.tsx` (full 49-line file read this session) fetches only the experience
  today (anon client) — this plan adds an availability fetch and a viewer-email fetch.
- **i18n**: `apps/web/lib/i18n/messages/en.ts` is 2260 lines. `experiencePublic` group
  (interface at lines 172-180, object at 1808-1816) holds the two keys this plan
  retires: `bookingSoonBadge`, `bookingSoonNote` (design spec §3: "that key retires").
  No `booking`, `trips`, or `merchantBookings` groups exist yet. `tests/
  i18n.locale-parity.test.ts` auto-derives which groups/keys to check via
  `Object.keys(en)` and a recursive dotted-key-path walk — a brand new `booking` group
  needs **no manual registration**, it is picked up automatically. Design spec §3:
  "New groups: `booking` (checkout flow, confirmation page, guest-vs-signed-in copy)" —
  **one** group covers both the widget and the confirmation page, which this plan
  follows exactly (no separate `bookingConfirmation` group).
- **Test-layer mocking conventions** (all three read in full this session):
  server-action tests (`experiences.availability-actions.test.ts`) use
  `vi.hoisted()` + `vi.mock('@/lib/supabase/server', ...)` returning `{ from: fromMock
  }`; query tests (`experiences.availability-queries.test.ts`) pass a **fake client
  directly as a parameter** instead of mocking a module, for queries that take a client
  argument; component/host tests (`merchants.availability.host.test.tsx`) mock
  `next/navigation` only and receive data as props (jsdom environment). This plan's
  `public-availability-queries.ts`/`public-queries.ts` functions instantiate their own
  client internally (mirroring `getExperienceBySlug`'s existing style, not the
  parameter-injection style), so their tests mock `@/lib/supabase/public` at the module
  level instead.
- **Migration-verification test template**: `apps/web/tests/db.r1b-migration.test.ts`
  (full 49-line file read this session) — reads the migration SQL file directly via
  `readFileSync` and asserts specific substrings (function signature, security mode,
  grants, check constraints). This plan's `db.r3a2-migration.test.ts` mirrors this
  exactly.
- **`apps/e2e/`**: `playwright.config.ts` (baseURL from `E2E_BASE_URL` env, defaults to
  the deployed Vercel URL; 120s CI / 30s local timeout), `fixtures.ts` (a plain object
  of known-good paths/expected content), `specs/creator-onboarding.spec.ts` (the closest
  existing analog — a full signed-up-user journey with `test.setTimeout` tuning,
  graceful-skip on an external-dependency outage, timestamped test data to avoid
  collisions). No Stripe mentions anywhere in `apps/e2e` yet — this plan's
  `booking.spec.ts` is genuinely new infrastructure, per design spec §5.
- `packages/db/types.ts` current structure (grep run this session): `Functions: {`
  block starts at line 2025 (first entry `accept_mission_invite` at 2026), entries are
  loosely grouped, not strictly alphabetical. `bookings:` table entry at line 616,
  `copilot_messages:` at line 705 — `checkout_rate_limits` (alphabetically between
  "bookings" and "copilot_messages") inserts immediately before the `copilot_messages`
  entry, same anchor point R3A-1 used for its own table insertions.
- Migration naming: `YYYYMMDDHHMMSS_slug.sql`, seconds always `00`. Latest is
  `20260704110000_r3a1_traveler_role_and_booking_core.sql`. This plan's migration:
  `20260704120000_r3a2_stripe_webhook_confirmation_and_rate_limit.sql`.
- Vitest: run scoped subsets via `cd apps/web && npx vitest run &lt;pattern&gt;` (never
  `pnpm --filter web test -- &lt;pattern&gt;` — runs the full ~900-test suite and can time
  out).
- Supabase MCP tool `apply_migration` (`project_id: scryfkefedzuetfdtrvl`) applies a
  migration transactionally to the live project; `execute_sql` verifies it afterward.

## Phase decisions (this plan's own judgment calls, not pre-resolved by the design spec)

**PD-1 · `booked_count` increments at webhook confirmation, not at checkout creation —
clamped via `least()`, never blocking a paid confirmation.** R3A-1's carry-forward #2
says incrementing happens "whenever a booking is actually created against an
availability row (the Checkout Session flow)," which reads ambiguously as either
creation-time or confirmation-time. Resolved here: **confirmation-time**, because (a)
`experience_availability` has no owner-write grant for a traveler/guest — only the
owning merchant or a SECURITY DEFINER function can touch `booked_count` — and
`confirm_booking_from_webhook()` is already the one SECURITY DEFINER path that needs to
run anyway; adding a second SECURITY DEFINER function just to reserve capacity at
creation-time would be more moving parts for no real benefit. (b) Incrementing at
confirmation means an abandoned/expired Stripe Checkout Session (Stripe's default
expiry: 24h) **never consumes capacity** — the booking row just sits at
`pending_payment` forever, harmless. The accepted tradeoff: two concurrent checkouts for
the last slot could both be confirmed (a real, rare race — bounded by Stripe's payment
processing time, not by anything longer). Given "payment correctness is the highest-
stakes code in the program so far" (design spec §4.1), a booking whose payment **succeeded**
must never fail to confirm because of a capacity conflict — so the RPC uses `least(booked_count +
qty, capacity)` (never violates the existing `booked_count &lt;= capacity` CHECK, so the
UPDATE can never fail) and logs a `booking_events` row of type `'overbooked'` when the
clamp actually engages, so ops has visibility into the rare case rather than it being
silently invisible. **Carry-forward**: stale `pending_payment` rows from abandoned
checkouts are never sweep-cleaned; harmless (no capacity held) but could be tidied by a
future scheduled job. **Carry-forward**: true capacity holds (reserve-on-checkout-start,
release-on-expiry) are out of scope — would need a new scheduled job, which the design
spec assigns only to D-R3-9 (Travelpayouts, R3C), not to this phase.

**PD-2 · Rate limiting is a new Postgres table + SECURITY DEFINER RPC, not a new
vendor.** No rate-limiting utility exists in this codebase (confirmed by grep) and no
Redis/Upstash dependency exists either. Introducing one now would mean new
infrastructure the user hasn't provisioned (an account, env vars) for a single
call site. Since every other piece of this phase already goes through Postgres, an
atomic `INSERT ... ON CONFLICT ... DO UPDATE` counter (single statement, no
read-then-write race) is simpler, needs no new vendor, and is trivially testable.
Threshold: 5 checkout-session-creation attempts per IP per 10-minute window — tunable
constants in `booking-actions.ts`, not hardcoded magic numbers inline.

**PD-3 · Zero-decimal currencies (JPY, KRW) are not multiplied by 100 for Stripe.**
Stripe's `unit_amount` is normally the smallest currency unit (cents), **except** for
a documented list of zero-decimal currencies. Of this codebase's 8 supported booking
currencies (`HKD,USD,SGD,JPY,KRW,THB,TWD,CNY`), **JPY and KRW are zero-decimal in
Stripe's API** — getting this wrong would either 100x-undercharge or 100x-overcharge a
real payment. `lib/stripe/client.ts`'s `toStripeAmount()` handles this explicitly, with
a dedicated unit test asserting both branches.

**PD-4 · The checkout action re-validates `experience_availability.status`/`date` in
code even though RLS already filters the public read.** Because
`experience_availability_owner_all` (merchant-owner, any status/date) and
`experience_availability_public_read` (open/future/bookable only) are both active
policies that OR together, a signed-in **merchant** viewing their own experience's page
would additionally have visibility into their own closed/past availability rows through
the owner policy. The checkout action explicitly re-checks `status === 'open'` and
`date &gt;= today` in application code (not just "the row was selectable") to close this
narrow gap rather than relying on RLS alone.

**PD-5 · `source_surface` is hardcoded to `'experience_page'`; `creator_id`/`guide_id`
attribution is left null.** R3A-2 only builds the widget ON the experience page — there
is no other booking entry point yet (guide/article embedded CTAs are D-R3-7, explicitly
R3C scope). Every booking created in this phase necessarily originates from the
experience page, so this is not a placeholder, it's the only value that can be
correct today. R3C wires the actual query-param/session-referrer attribution mechanism
per the design spec's own note that this is "a plan-phase detail" for that later phase.

**PD-6 · Stripe SDK `apiVersion` is left unset, not hand-pinned to a guessed date
string.** Stripe's Node SDK accepts a config object with an `apiVersion` field, but
hardcoding a specific dated version string here risks silently drifting stale as Stripe
revs its API, and this plan has no way to confirm today's actual latest version string
against Stripe's live docs. Per Task 1 Step 4, if `tsc` reports `apiVersion` as a
required field on the installed `stripe` package's types, use that package's own
exported `Stripe.LATEST_API_VERSION` constant rather than a hand-typed string — never
guess a date.

**PD-7 · Only `checkout.session.completed` with `payment_status === 'paid'` triggers
confirmation.** Stripe Checkout in this codebase uses card payments only (the default,
and the only method the design spec's "hosted Checkout" call-out implies); card payments
resolve synchronously, so `checkout.session.completed` + `payment_status: 'paid'` is
sufficient — `checkout.session.async_payment_succeeded`/`failed` (for delayed payment
methods) and `checkout.session.expired` are out of scope for this phase (no delayed
payment methods are enabled; an expired/abandoned session is already harmless per PD-1).

## File map

| Path | Change |
|---|---|
| `apps/web/package.json` | Modify (add `stripe` dependency) |
| `apps/web/.env.example` | Modify (add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — both server-only; no `NEXT_PUBLIC_` Stripe key is needed since checkout uses Stripe's hosted redirect, not embedded client-side Stripe.js) |
| `apps/web/lib/stripe/client.ts` | Create |
| `supabase/migrations/20260704120000_r3a2_stripe_webhook_confirmation_and_rate_limit.sql` | Create |
| `packages/db/types.ts` | Modify (hand-patch: `checkout_rate_limits` table + 3 Functions entries) |
| `apps/web/lib/experiences/public-queries.ts` | Modify (add `getExperienceById`) |
| `apps/web/lib/experiences/public-availability-queries.ts` | Create |
| `apps/web/lib/experiences/booking-types.ts` | Create |
| `apps/web/lib/experiences/booking-validation.ts` | Create |
| `apps/web/lib/http/client-ip.ts` | Create |
| `apps/web/lib/experiences/booking-actions.ts` | Create |
| `apps/web/lib/supabase/service.ts` | Create |
| `apps/web/app/api/stripe/webhook/route.ts` | Create |
| `apps/web/lib/experiences/booking-confirmation-queries.ts` | Create |
| `apps/web/lib/i18n/messages/en.ts` | Modify (add `booking` group; retire `bookingSoonBadge`/`bookingSoonNote`) |
| `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` | Modify (mirror, translated) |
| `apps/web/components/kinnso/pages/BookingWidget.tsx` | Create |
| `apps/web/components/kinnso/pages/ExperiencePublicView.tsx` | Modify |
| `apps/web/app/[locale]/experiences/[slug]/page.tsx` | Modify |
| `apps/web/app/[locale]/experiences/[slug]/booked/page.tsx` | Create |
| `apps/web/tests/stripe.client.test.ts` | Create |
| `apps/web/tests/experiences.public-availability-queries.test.ts` | Create |
| `apps/web/tests/experiences.booking-validation.test.ts` | Create |
| `apps/web/tests/experiences.booking-actions.test.ts` | Create |
| `apps/web/tests/api.stripe-webhook.test.ts` | Create |
| `apps/web/tests/experiences.booking-confirmation-queries.test.ts` | Create |
| `apps/web/tests/experiences.booking-widget.host.test.tsx` | Create |
| `apps/web/tests/db.r3a2-migration.test.ts` | Create |
| `apps/e2e/fixtures.ts` | Modify (add a `booking` fixture) |
| `apps/e2e/specs/booking.spec.ts` | Create |

---

### Task 1: Stripe SDK dependency + client wrapper

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/.env.example`
- Create: `apps/web/lib/stripe/client.ts`
- Test: `apps/web/tests/stripe.client.test.ts`

- [ ] **Step 1: Add the dependency**

Run from repo root:
```bash
pnpm --filter web add stripe
```

- [ ] **Step 2: Add the env vars to `.env.example`**

Add these two lines to `apps/web/.env.example`, near the other server-only secrets
(e.g. below the `SUPABASE_SERVICE_ROLE_KEY` line), following the file's existing
`replace_with_...` placeholder convention:

```
# Stripe (test mode until live-launch readiness is confirmed — see the R3 design
# spec §8). Both server-only; no NEXT_PUBLIC_ Stripe key is needed since checkout
# uses Stripe's hosted redirect, not embedded client-side Stripe.js.
STRIPE_SECRET_KEY=replace_with_stripe_test_mode_secret_key
STRIPE_WEBHOOK_SECRET=replace_with_stripe_webhook_signing_secret
```

Note: guest/traveler payment receipt emails are Stripe's own built-in Checkout feature
(configured in the Stripe Dashboard, not this codebase) — same "no KINNSO-native
notification" precedent as R2's status-panel-only approach (design spec §D-R3-2). No
code in this plan sends a booking confirmation email; verifying that Stripe's
dashboard-level receipt emails are turned on for the account is a user action item, not
a code task.

- [ ] **Step 3: Write the failing test**

```typescript
// apps/web/tests/stripe.client.test.ts
import { describe, expect, it } from 'vitest'
import { toStripeAmount } from '@/lib/stripe/client'

describe('toStripeAmount', () =&gt; {
  it('multiplies by 100 for standard (non-zero-decimal) currencies', () =&gt; {
    expect(toStripeAmount(1250, 'HKD')).toBe(125000)
    expect(toStripeAmount(19.99, 'USD')).toBe(1999)
  })
  it('does not multiply zero-decimal currencies (JPY, KRW)', () =&gt; {
    expect(toStripeAmount(5000, 'JPY')).toBe(5000)
    expect(toStripeAmount(30000, 'KRW')).toBe(30000)
  })
  it('is case-insensitive on the currency code', () =&gt; {
    expect(toStripeAmount(5000, 'jpy')).toBe(5000)
    expect(toStripeAmount(10, 'usd')).toBe(1000)
  })
  it('rounds fractional cent amounts rather than truncating', () =&gt; {
    expect(toStripeAmount(19.995, 'USD')).toBe(2000)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/web && npx vitest run stripe.client`
Expected: FAIL — `Cannot find module '@/lib/stripe/client'` (or similar).

- [ ] **Step 5: Write the implementation**

```typescript
// apps/web/lib/stripe/client.ts
import Stripe from 'stripe'

let client: Stripe | null = null

/**
 * Lazily-constructed Stripe SDK singleton. `apiVersion` is intentionally left
 * unset — this uses the installed SDK version's own bundled default rather
 * than a hand-typed date string that would silently drift stale. If a future
 * `stripe` package major version makes `apiVersion` a required config field,
 * use that package's own exported `Stripe.LATEST_API_VERSION` constant, never
 * a guessed date string.
 */
export function getStripeClient(): Stripe {
  if (!client) {
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set')
    client = new Stripe(secretKey)
  }
  return client
}

// Stripe's documented zero-decimal currencies, restricted to this codebase's
// supported booking currencies (HKD/USD/SGD/JPY/KRW/THB/TWD/CNY) — only JPY
// and KRW qualify. https://stripe.com/docs/currencies#zero-decimal
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW'])

/**
 * Converts a decimal currency amount (e.g. 1250.00 HKD, as stored in
 * `bookings.unit_amount`/`total_amount`) to the integer unit Stripe's API
 * expects: cents for most currencies, the amount as-is for zero-decimal ones.
 */
export function toStripeAmount(amount: number, currency: string): number {
  const upper = currency.toUpperCase()
  if (ZERO_DECIMAL_CURRENCIES.has(upper)) return Math.round(amount)
  return Math.round(amount * 100)
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/web && npx vitest run stripe.client`
Expected: PASS, 4 tests.

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors. If `apiVersion` is reported as a required field, see the
comment in Step 5 — patch to use `Stripe.LATEST_API_VERSION` from the
installed package rather than a hand-typed string, then re-run this step.

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/.env.example apps/web/lib/stripe/client.ts apps/web/tests/stripe.client.test.ts apps/web/pnpm-lock.yaml pnpm-lock.yaml
git commit -m "feat(web): add Stripe SDK dependency + client singleton with zero-decimal currency handling"
```

---

### Task 2: Database migration — webhook confirmation RPC, guest-confirmation-read RPC, checkout rate limiting

**Files:**
- Create: `supabase/migrations/20260704120000_r3a2_stripe_webhook_confirmation_and_rate_limit.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Phase R3A-2 — Stripe webhook confirmation RPC, guest-confirmation-read RPC,
-- and IP-based checkout rate limiting.
-- (1) checkout_rate_limits + check_and_increment_checkout_rate_limit(): a
--     minimal Postgres-backed IP rate limiter for the anon-reachable
--     checkout-session-creation action (design spec §D-R3-2's abuse
--     mitigation). No existing rate-limiting utility or vendor exists in this
--     codebase (confirmed by repo-wide grep) — this avoids introducing a new
--     third-party dependency for a single call site.
-- (2) confirm_booking_from_webhook(): the one write path allowed to flip
--     bookings.status outside an ops action (design spec §D-R3-3). Idempotent
--     on repeat delivery (Stripe redelivers events). Increments
--     experience_availability.booked_count via least(booked_count + qty,
--     capacity) rather than a hard capacity check, so a booking whose payment
--     already succeeded can never fail to confirm because of a rare
--     concurrent-checkout race (plan PD-1) — the rare clamp event is logged
--     as a booking_events row of type 'overbooked' for ops visibility.
-- (3) get_booking_by_checkout_session(): the sanctioned anon-read exception
--     (design spec §D-R3-2) letting a guest (no session) read back their own
--     booking via the unguessable Stripe Checkout Session id — never a list,
--     never searchable by email.

-- ── 1. Checkout rate limiting ────────────────────────────────────────────────
create table public.checkout_rate_limits (
  ip text primary key,
  window_start timestamptz not null default now(),
  request_count integer not null default 1
);

alter table public.checkout_rate_limits enable row level security;
-- No policies at all: this table is never read/written directly by any
-- client role, only through the SECURITY DEFINER function below.
revoke all on table public.checkout_rate_limits from anon, authenticated;

create or replace function public.check_and_increment_checkout_rate_limit(
  p_ip text,
  p_max_requests integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.checkout_rate_limits (ip, window_start, request_count)
  values (p_ip, now(), 1)
  on conflict (ip) do update
    set window_start = case
          when public.checkout_rate_limits.window_start &lt; now() - make_interval(secs =&gt; p_window_seconds)
          then now()
          else public.checkout_rate_limits.window_start
        end,
        request_count = case
          when public.checkout_rate_limits.window_start &lt; now() - make_interval(secs =&gt; p_window_seconds)
          then 1
          else public.checkout_rate_limits.request_count + 1
        end
  returning request_count into v_count;

  return v_count &lt;= p_max_requests;
end;
$$;

revoke all on function public.check_and_increment_checkout_rate_limit(text, integer, integer) from public;
grant execute on function public.check_and_increment_checkout_rate_limit(text, integer, integer) to anon, authenticated;

-- ── 2. Webhook confirmation RPC ───────────────────────────────────────────────
create or replace function public.confirm_booking_from_webhook(
  p_stripe_payment_intent_id text,
  p_stripe_checkout_session_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_status text;
  v_availability_id uuid;
  v_qty integer;
  v_booked_before integer;
  v_capacity integer;
begin
  select id, status, availability_id, qty
    into v_booking_id, v_status, v_availability_id, v_qty
    from public.bookings
    where stripe_checkout_session_id = p_stripe_checkout_session_id
    for update;

  if not found then
    raise exception 'booking_not_found';
  end if;

  -- Idempotent: Stripe redelivers events; a booking already confirmed (or
  -- past confirmed) is a no-op success, not an error.
  if v_status &lt;&gt; 'pending_payment' then
    return;
  end if;

  update public.bookings
    set status = 'confirmed',
        stripe_payment_intent_id = p_stripe_payment_intent_id,
        updated_at = now()
    where id = v_booking_id;

  select booked_count, capacity into v_booked_before, v_capacity
    from public.experience_availability where id = v_availability_id for update;

  update public.experience_availability
    set booked_count = least(booked_count + v_qty, capacity)
    where id = v_availability_id;

  insert into public.booking_events (booking_id, event_type, metadata)
  values (v_booking_id, 'webhook_confirmed', jsonb_build_object('stripe_payment_intent_id', p_stripe_payment_intent_id));

  if v_booked_before + v_qty &gt; v_capacity then
    insert into public.booking_events (booking_id, event_type, metadata)
    values (v_booking_id, 'overbooked', jsonb_build_object(
      'availability_id', v_availability_id, 'attempted_increment', v_qty,
      'booked_before', v_booked_before, 'capacity', v_capacity));
  end if;
end;
$$;

-- Only the webhook route (service-role client) may call this — the
-- documented service-role exception (design spec §4.5). Never grant to
-- anon/authenticated: a client-callable path to flip a booking to confirmed
-- without a real Stripe event would be a payment-integrity hole.
revoke all on function public.confirm_booking_from_webhook(text, text) from public;
grant execute on function public.confirm_booking_from_webhook(text, text) to service_role;

-- ── 3. Guest/signed-in confirmation read, keyed on the unguessable session id ─
create or replace function public.get_booking_by_checkout_session(p_session_id text)
returns table (
  booking_id uuid,
  status text,
  qty integer,
  total_amount numeric,
  currency text,
  experience_title text,
  experience_slug text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.status, b.qty, b.total_amount, b.currency, e.title, e.slug
  from public.bookings b
  join public.experiences e on e.id = b.experience_id
  where b.stripe_checkout_session_id = p_session_id;
$$;

-- Anon AND authenticated both need this (guest vs. signed-in traveler reading
-- back their own just-created booking) — safe because the sole lookup key is
-- an unguessable, Stripe-generated id, never an email or a list.
revoke all on function public.get_booking_by_checkout_session(text) from public;
grant execute on function public.get_booking_by_checkout_session(text) to anon, authenticated;
```

- [ ] **Step 2: Apply the migration to the live project**

Use the Supabase MCP tool `apply_migration` with `project_id: scryfkefedzuetfdtrvl`,
`name: r3a2_stripe_webhook_confirmation_and_rate_limit`, and the SQL body above.

- [ ] **Step 3: Verify live**

Run via the Supabase MCP `execute_sql` tool against `scryfkefedzuetfdtrvl`:

```sql
select
  (select count(*) from information_schema.tables where table_schema='public'
    and table_name = 'checkout_rate_limits') as rate_limit_table_created,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'check_and_increment_checkout_rate_limit') as rate_limit_fn_exists,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'confirm_booking_from_webhook') as confirm_fn_exists,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_booking_by_checkout_session') as lookup_fn_exists;
```

Expected: `rate_limit_table_created=1`, `rate_limit_fn_exists=1`,
`confirm_fn_exists=1`, `lookup_fn_exists=1`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260704120000_r3a2_stripe_webhook_confirmation_and_rate_limit.sql
git commit -m "feat(db): confirm_booking_from_webhook + get_booking_by_checkout_session RPCs + checkout rate limiting

confirm_booking_from_webhook is the one write path allowed to flip
bookings.status outside an ops action (service_role-only, idempotent on
repeat Stripe delivery). booked_count increments via least(...,capacity) so
a successful payment can never fail to confirm on a rare capacity race.
get_booking_by_checkout_session is the sanctioned anon-read exception for
guest booking confirmation, keyed on the unguessable Stripe session id."
```

---

### Task 3: Hand-patch `packages/db/types.ts`

**Files:**
- Modify: `packages/db/types.ts`

- [ ] **Step 1: Add the `checkout_rate_limits` table entry**

Insert immediately before the `copilot_messages:` entry (currently line 705 — confirm
with `grep -n "copilot_messages:" packages/db/types.ts` since line numbers shift as this
file is hand-edited):

```typescript
      checkout_rate_limits: {
        Row: {
          ip: string
          window_start: string
          request_count: number
        }
        Insert: {
          ip: string
          window_start?: string
          request_count?: number
        }
        Update: {
          ip?: string
          window_start?: string
          request_count?: number
        }
        Relationships: []
      }
```

- [ ] **Step 2: Add the three new Functions entries**

Insert immediately after the `Functions: {` line (currently line 2025 — confirm with
`grep -n "Functions: {" packages/db/types.ts`), i.e. as the first entries before
`accept_mission_invite`:

```typescript
      check_and_increment_checkout_rate_limit: {
        Args: { p_ip: string; p_max_requests: number; p_window_seconds: number }
        Returns: boolean
      }
      confirm_booking_from_webhook: {
        Args: { p_stripe_payment_intent_id: string; p_stripe_checkout_session_id: string }
        Returns: undefined
      }
      get_booking_by_checkout_session: {
        Args: { p_session_id: string }
        Returns: {
          booking_id: string
          status: string
          qty: number
          total_amount: number
          currency: string
          experience_title: string
          experience_slug: string
        }[]
      }
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors (this file has no test of its own — R3A-1's plan established
verification happens via the app code that consumes these types, in later tasks of
this plan).

- [ ] **Step 4: Commit**

```bash
git add packages/db/types.ts
git commit -m "chore(db): hand-patch types.ts for checkout_rate_limits + 3 new RPC signatures"
```

---

### Task 4: Public availability query

**Files:**
- Create: `apps/web/lib/experiences/public-availability-queries.ts`
- Test: `apps/web/tests/experiences.public-availability-queries.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/experiences.public-availability-queries.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { fromMock } = vi.hoisted(() =&gt; ({ fromMock: vi.fn() }))
vi.mock('@/lib/supabase/public', () =&gt; ({
  createSupabasePublicClient: () =&gt; ({ from: fromMock }),
}))

import { listPublicAvailability } from '@/lib/experiences/public-availability-queries'

beforeEach(() =&gt; fromMock.mockReset())

describe('listPublicAvailability', () =&gt; {
  it('maps rows to camelCase and computes remaining capacity', async () =&gt; {
    fromMock.mockReturnValue({
      select: () =&gt; ({
        eq: () =&gt; ({
          eq: () =&gt; ({
            gte: () =&gt; ({
              order: () =&gt; Promise.resolve({
                data: [{ id: 'a1', date: '2026-08-01', capacity: 10, booked_count: 3 }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })
    const rows = await listPublicAvailability('exp1')
    expect(rows).toEqual([{ id: 'a1', date: '2026-08-01', remaining: 7 }])
  })

  it('clamps remaining to zero rather than going negative', async () =&gt; {
    fromMock.mockReturnValue({
      select: () =&gt; ({
        eq: () =&gt; ({
          eq: () =&gt; ({
            gte: () =&gt; ({
              order: () =&gt; Promise.resolve({
                data: [{ id: 'a1', date: '2026-08-01', capacity: 5, booked_count: 5 }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })
    const rows = await listPublicAvailability('exp1')
    expect(rows[0].remaining).toBe(0)
  })

  it('propagates errors', async () =&gt; {
    fromMock.mockReturnValue({
      select: () =&gt; ({
        eq: () =&gt; ({
          eq: () =&gt; ({
            gte: () =&gt; ({ order: () =&gt; Promise.resolve({ data: null, error: { message: 'boom' } }) }),
          }),
        }),
      }),
    })
    await expect(listPublicAvailability('exp1')).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run experiences.public-availability-queries`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/web/lib/experiences/public-availability-queries.ts
import { createSupabasePublicClient } from '@/lib/supabase/public'

export type PublicAvailability = {
  id: string
  date: string
  remaining: number
}

/**
 * Anon-safe list of open, future dates for one experience, for the public
 * booking widget. RLS (experience_availability_public_read) already restricts
 * to status='open', date &gt;= current_date, and a bookable (published +
 * active-merchant) experience — filters here are for clarity/index use, same
 * convention as getExperiencesForSitemap. Sold-out dates (remaining=0) are
 * still returned, not filtered out, so the widget can render them as
 * disabled/"sold out" rather than silently vanishing.
 */
export async function listPublicAvailability(experienceId: string): Promise&lt;PublicAvailability[]&gt; {
  const supabase = createSupabasePublicClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('experience_availability')
    .select('id, date, capacity, booked_count')
    .eq('experience_id', experienceId)
    .eq('status', 'open')
    .gte('date', today)
    .order('date', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) =&gt; ({
    id: r.id as string,
    date: r.date as string,
    remaining: Math.max(0, (r.capacity as number) - (r.booked_count as number)),
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run experiences.public-availability-queries`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/experiences/public-availability-queries.ts apps/web/tests/experiences.public-availability-queries.test.ts
git commit -m "feat(web): anon-safe public availability query for the booking widget"
```

---

### Task 5: Booking types + validation

**Files:**
- Create: `apps/web/lib/experiences/booking-types.ts`
- Create: `apps/web/lib/experiences/booking-validation.ts`
- Test: `apps/web/tests/experiences.booking-validation.test.ts`

- [ ] **Step 1: Write the types file**

```typescript
// apps/web/lib/experiences/booking-types.ts
export type CreateCheckoutSessionInput = {
  availabilityId: string
  qty: string // form-string; validated/parsed to an integer in validation
  guestEmail?: string // required when the caller is anon, ignored when signed in
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/web/tests/experiences.booking-validation.test.ts
import { describe, expect, it } from 'vitest'
import { validateCheckoutInput } from '@/lib/experiences/booking-validation'

describe('validateCheckoutInput', () =&gt; {
  it('accepts a valid signed-in input with no guest email required', () =&gt; {
    const result = validateCheckoutInput({ availabilityId: 'a1', qty: '2' }, { requireGuestEmail: false })
    expect(result).toEqual({ ok: true, parsed: { availabilityId: 'a1', qty: 2, guestEmail: null } })
  })

  it('accepts a valid guest input with an email', () =&gt; {
    const result = validateCheckoutInput(
      { availabilityId: 'a1', qty: '1', guestEmail: 'Traveler@Example.com' },
      { requireGuestEmail: true },
    )
    expect(result).toEqual({ ok: true, parsed: { availabilityId: 'a1', qty: 1, guestEmail: 'traveler@example.com' } })
  })

  it('rejects a missing availabilityId', () =&gt; {
    const result = validateCheckoutInput({ availabilityId: '', qty: '1' }, { requireGuestEmail: false })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.availabilityId).toBeTruthy()
  })

  it('rejects a non-integer, zero, or excessive qty', () =&gt; {
    for (const qty of ['0', '-1', '1.5', 'abc', '11']) {
      const result = validateCheckoutInput({ availabilityId: 'a1', qty }, { requireGuestEmail: false })
      expect(result.ok, `qty=${qty} should be rejected`).toBe(false)
    }
  })

  it('rejects a missing or malformed guest email when required', () =&gt; {
    const missing = validateCheckoutInput({ availabilityId: 'a1', qty: '1' }, { requireGuestEmail: true })
    expect(missing.ok).toBe(false)
    const malformed = validateCheckoutInput(
      { availabilityId: 'a1', qty: '1', guestEmail: 'not-an-email' },
      { requireGuestEmail: true },
    )
    expect(malformed.ok).toBe(false)
  })

  it('ignores a supplied guest email when the caller is signed in', () =&gt; {
    const result = validateCheckoutInput(
      { availabilityId: 'a1', qty: '1', guestEmail: 'ignored@example.com' },
      { requireGuestEmail: false },
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.parsed.guestEmail).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run experiences.booking-validation`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```typescript
// apps/web/lib/experiences/booking-validation.ts
import type { CreateCheckoutSessionInput } from '@/lib/experiences/booking-types'

export type CheckoutValidationErrors = Record&lt;string, string[]&gt;
export type ParsedCheckoutInput = { availabilityId: string; qty: number; guestEmail: string | null }
export type CheckoutValidation =
  | { ok: true; parsed: ParsedCheckoutInput }
  | { ok: false; errors: CheckoutValidationErrors }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const MAX_QTY = 10

export function validateCheckoutInput(
  input: CreateCheckoutSessionInput,
  options: { requireGuestEmail: boolean },
): CheckoutValidation {
  const errors: CheckoutValidationErrors = {}

  if (!input.availabilityId) errors.availabilityId = ['required']

  const qtyRaw = input.qty.trim()
  const qty = Number(qtyRaw)
  if (!qtyRaw || !Number.isInteger(qty) || qty &lt; 1 || qty &gt; MAX_QTY) {
    errors.qty = ['invalid_number']
  }

  let guestEmail: string | null = null
  if (options.requireGuestEmail) {
    const normalized = String(input.guestEmail ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(normalized) || normalized.length &gt; 254) {
      errors.guestEmail = ['invalid_email']
    } else {
      guestEmail = normalized
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, parsed: { availabilityId: input.availabilityId, qty, guestEmail } }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run experiences.booking-validation`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/experiences/booking-types.ts apps/web/lib/experiences/booking-validation.ts apps/web/tests/experiences.booking-validation.test.ts
git commit -m "feat(web): booking checkout input validation (qty bounds, guest email shape)"
```

---

### Task 6: Client IP helper

**Files:**
- Create: `apps/web/lib/http/client-ip.ts`

- [ ] **Step 1: Write the implementation** (no DB/network dependency to mock —
  covered directly rather than via a separate failing-test-first cycle, since its only
  logic is header parsing; exercised indirectly by Task 7's action tests via a module
  mock)

```typescript
// apps/web/lib/http/client-ip.ts
import { headers } from 'next/headers'

/**
 * Best-effort caller IP for rate limiting. Vercel sets `x-forwarded-for`; the
 * first entry is the original client. Falls back to a fixed key when absent
 * (e.g. local dev without a proxy in front) so the rate limiter still
 * functions, just shared across all local requests in that case.
 */
export async function getClientIp(): Promise&lt;string&gt; {
  const h = await headers()
  const forwardedFor = h.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  const realIp = h.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/http/client-ip.ts
git commit -m "feat(web): client IP helper for rate limiting"
```

---

### Task 7: `getExperienceById` + checkout session server action

**Files:**
- Modify: `apps/web/lib/experiences/public-queries.ts`
- Create: `apps/web/lib/experiences/booking-actions.ts`
- Test: `apps/web/tests/experiences.booking-actions.test.ts`

- [ ] **Step 1: Add `getExperienceById` to `public-queries.ts`**

Add this function to the end of the existing file (mirrors `getExperienceBySlug`
exactly, keyed by `id`; reuses the existing `EXP_COLUMNS`, `ExpRow`, `toDomain` already
in the file — do not duplicate them):

```typescript
/** Same shape as getExperienceBySlug, keyed by id — used by the checkout
 * action, which only has the id (never re-derive price/currency from
 * anything client-supplied). */
export async function getExperienceById(id: string): Promise&lt;PublicExperience | null&gt; {
  const supabase = createSupabasePublicClient()
  const { data: exp, error: expError } = await supabase
    .from('experiences')
    .select(EXP_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (expError) throw expError
  if (!exp) return null

  const { data: merchant, error: merchantError } = await supabase
    .from('merchant_public_profiles')
    .select('slug, company_name')
    .eq('id', (exp as unknown as ExpRow).merchant_profile_id)
    .maybeSingle()
  if (merchantError) throw merchantError
  if (!merchant) return null

  return toDomain(exp as unknown as ExpRow, { slug: merchant.slug as string, companyName: merchant.company_name as string })
}
```

- [ ] **Step 2: Write the failing test for the action**

```typescript
// apps/web/tests/experiences.booking-actions.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { getUserMock, fromMock, rpcMock, getExperienceByIdMock, getClientIpMock, sessionsCreateMock, sessionsExpireMock } = vi.hoisted(() =&gt; ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  getExperienceByIdMock: vi.fn(),
  getClientIpMock: vi.fn(),
  sessionsCreateMock: vi.fn(),
  sessionsExpireMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () =&gt; ({
  createSupabaseServerClient: async () =&gt; ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  }),
}))
vi.mock('@/lib/experiences/public-queries', () =&gt; ({ getExperienceById: getExperienceByIdMock }))
vi.mock('@/lib/http/client-ip', () =&gt; ({ getClientIp: getClientIpMock }))
vi.mock('@/lib/stripe/client', () =&gt; ({
  getStripeClient: () =&gt; ({
    checkout: { sessions: { create: sessionsCreateMock, expire: sessionsExpireMock } },
  }),
  toStripeAmount: (amount: number) =&gt; Math.round(amount * 100),
}))

import { createCheckoutSessionAction } from '@/lib/experiences/booking-actions'

const experience = {
  id: 'exp1', slug: 'tokyo-crawl', title: 'Tokyo Crawl', summary: null, description: null,
  city: 'Tokyo', priceAmount: 1200, currency: 'HKD', durationMinutes: 180, coverUrl: null,
  publishedAt: null, merchant: { slug: 'sunrise', companyName: 'Sunrise Stays HK' },
}
const openAvailability = { id: 'avail1', capacity: 10, booked_count: 2, status: 'open', date: '2999-01-01' }

beforeEach(() =&gt; {
  getUserMock.mockReset()
  fromMock.mockReset()
  rpcMock.mockReset()
  getExperienceByIdMock.mockReset()
  getClientIpMock.mockReset()
  sessionsCreateMock.mockReset()
  sessionsExpireMock.mockReset()
  getClientIpMock.mockResolvedValue('1.2.3.4')
  rpcMock.mockResolvedValue({ data: true, error: null })
  getExperienceByIdMock.mockResolvedValue(experience)
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.kinnso.ai'
})

function mockAvailabilityLookup(row: unknown) {
  fromMock.mockReturnValueOnce({
    select: () =&gt; ({ eq: () =&gt; ({ eq: () =&gt; ({ maybeSingle: () =&gt; Promise.resolve({ data: row, error: null }) }) }) }),
  })
}

describe('createCheckoutSessionAction (signed-in traveler)', () =&gt; {
  beforeEach(() =&gt; {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'traveler@example.com' } } })
  })

  it('rejects invalid input before touching rate limiting or Stripe', async () =&gt; {
    const res = await createCheckoutSessionAction('exp1', { availabilityId: '', qty: '1' }, { locale: 'en' })
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
    expect(sessionsCreateMock).not.toHaveBeenCalled()
  })

  it('rejects when rate limited', async () =&gt; {
    rpcMock.mockResolvedValue({ data: false, error: null })
    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '1' }, { locale: 'en' })
    expect(res.ok).toBe(false)
    expect(sessionsCreateMock).not.toHaveBeenCalled()
  })

  it('rejects when the availability row is not found', async () =&gt; {
    mockAvailabilityLookup(null)
    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '1' }, { locale: 'en' })
    expect(res.ok).toBe(false)
  })

  it('rejects a closed date', async () =&gt; {
    mockAvailabilityLookup({ ...openAvailability, status: 'closed' })
    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '1' }, { locale: 'en' })
    expect(res.ok).toBe(false)
  })

  it('rejects a past date', async () =&gt; {
    mockAvailabilityLookup({ ...openAvailability, date: '2000-01-01' })
    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '1' }, { locale: 'en' })
    expect(res.ok).toBe(false)
  })

  it('rejects when qty exceeds remaining capacity', async () =&gt; {
    mockAvailabilityLookup({ ...openAvailability, capacity: 3, booked_count: 2 }) // remaining = 1
    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '2' }, { locale: 'en' })
    expect(res.ok).toBe(false)
  })

  it('creates a Stripe session and a pending_payment booking, returning the checkout URL', async () =&gt; {
    mockAvailabilityLookup(openAvailability)
    sessionsCreateMock.mockResolvedValue({ id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' })
    fromMock.mockReturnValueOnce({ insert: () =&gt; Promise.resolve({ error: null }) })

    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '2' }, { locale: 'en' })

    expect(sessionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        customer_email: 'traveler@example.com',
        line_items: [
          expect.objectContaining({
            quantity: 2,
            price_data: expect.objectContaining({ currency: 'hkd', unit_amount: 120000 }),
          }),
        ],
      }),
    )
    expect(res).toEqual({ ok: true, checkoutUrl: 'https://checkout.stripe.com/cs_123' })
  })

  it('expires the Stripe session and returns a failure if the booking insert fails', async () =&gt; {
    mockAvailabilityLookup(openAvailability)
    sessionsCreateMock.mockResolvedValue({ id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' })
    fromMock.mockReturnValueOnce({ insert: () =&gt; Promise.resolve({ error: { message: 'boom' } }) })

    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '1' }, { locale: 'en' })

    expect(res.ok).toBe(false)
    expect(sessionsExpireMock).toHaveBeenCalledWith('cs_123')
  })
})

describe('createCheckoutSessionAction (guest)', () =&gt; {
  beforeEach(() =&gt; {
    getUserMock.mockResolvedValue({ data: { user: null } })
  })

  it('requires a guest email', async () =&gt; {
    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '1' }, { locale: 'en' })
    expect(res.ok).toBe(false)
    expect(sessionsCreateMock).not.toHaveBeenCalled()
  })

  it('creates a booking with guest_email and no traveler_user_id', async () =&gt; {
    mockAvailabilityLookup(openAvailability)
    sessionsCreateMock.mockResolvedValue({ id: 'cs_456', url: 'https://checkout.stripe.com/cs_456' })
    const insertMock = vi.fn(() =&gt; Promise.resolve({ error: null }))
    fromMock.mockReturnValueOnce({ insert: insertMock })

    const res = await createCheckoutSessionAction(
      'exp1',
      { availabilityId: 'avail1', qty: '1', guestEmail: 'guest@example.com' },
      { locale: 'en' },
    )

    expect(res.ok).toBe(true)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ traveler_user_id: null, guest_email: 'guest@example.com', source_surface: 'experience_page' }),
    )
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run experiences.booking-actions`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```typescript
// apps/web/lib/experiences/booking-actions.ts
'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getExperienceById } from '@/lib/experiences/public-queries'
import { validateCheckoutInput, type CheckoutValidationErrors } from '@/lib/experiences/booking-validation'
import type { CreateCheckoutSessionInput } from '@/lib/experiences/booking-types'
import { getStripeClient, toStripeAmount } from '@/lib/stripe/client'
import { getClientIp } from '@/lib/http/client-ip'
import type { Locale } from '@/lib/i18n/config'

type ActionFailure = { ok: false; errors: CheckoutValidationErrors }
type ActionResult&lt;T extends Record&lt;string, unknown&gt; = Record&lt;string, never&gt;&gt; =
  | ({ ok: true } &amp; T)
  | ActionFailure

const formError = (message: string): ActionFailure =&gt; ({ ok: false, errors: { form: [message] } })

const MAX_CHECKOUT_ATTEMPTS_PER_WINDOW = 5
const CHECKOUT_RATE_LIMIT_WINDOW_SECONDS = 600

export async function createCheckoutSessionAction(
  experienceId: string,
  rawInput: CreateCheckoutSessionInput,
  options: { locale: Locale },
): Promise&lt;ActionResult&lt;{ checkoutUrl: string }&gt;&gt; {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const validation = validateCheckoutInput(rawInput, { requireGuestEmail: !user })
  if (!validation.ok) return validation
  const p = validation.parsed

  const ip = await getClientIp()
  const { data: allowed, error: rateLimitError } = await supabase.rpc(
    'check_and_increment_checkout_rate_limit',
    { p_ip: ip, p_max_requests: MAX_CHECKOUT_ATTEMPTS_PER_WINDOW, p_window_seconds: CHECKOUT_RATE_LIMIT_WINDOW_SECONDS },
  )
  if (rateLimitError) {
    console.error('[experiences:booking] rate limit check failed', rateLimitError)
    return formError('Something went wrong. Please try again.')
  }
  if (!allowed) return formError('Too many attempts. Please try again in a few minutes.')

  const experience = await getExperienceById(experienceId)
  if (!experience) return formError('Experience not found')

  const { data: availability } = await supabase
    .from('experience_availability')
    .select('id, capacity, booked_count, status, date')
    .eq('id', p.availabilityId)
    .eq('experience_id', experienceId)
    .maybeSingle()
  if (!availability) return formError('That date is no longer available')
  const today = new Date().toISOString().slice(0, 10)
  // Re-checked explicitly even though RLS already filters the public read:
  // a signed-in merchant's owner-visibility policy could otherwise surface
  // their own closed/past rows to this same query (RLS policies OR together).
  if (availability.status !== 'open' || (availability.date as string) &lt; today) {
    return formError('That date is no longer available')
  }
  const remaining = (availability.capacity as number) - (availability.booked_count as number)
  if (remaining &lt; p.qty) return formError('Not enough spots left for that date')

  const unitAmount = experience.priceAmount
  const totalAmount = unitAmount * p.qty
  const stripe = getStripeClient()
  const origin = process.env.NEXT_PUBLIC_SITE_URL
  const guestEmail = user ? null : p.guestEmail

  let session: { id: string; url: string | null }
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${origin}/${options.locale}/experiences/${experience.slug}/booked?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/${options.locale}/experiences/${experience.slug}`,
      customer_email: guestEmail ?? user?.email ?? undefined,
      line_items: [
        {
          quantity: p.qty,
          price_data: {
            currency: experience.currency.toLowerCase(),
            unit_amount: toStripeAmount(unitAmount, experience.currency),
            product_data: { name: experience.title },
          },
        },
      ],
    })
  } catch (err) {
    console.error('[experiences:booking] stripe session creation failed', err)
    return formError('Something went wrong. Please try again.')
  }

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
    source_surface: 'experience_page',
  })
  if (insertError) {
    console.error('[experiences:booking] booking row insert failed', insertError)
    try {
      await stripe.checkout.sessions.expire(session.id)
    } catch (expireErr) {
      console.error('[experiences:booking] failed to expire orphaned session', expireErr)
    }
    return formError('Something went wrong. Please try again.')
  }

  if (!session.url) {
    console.error('[experiences:booking] stripe session has no url', session.id)
    return formError('Something went wrong. Please try again.')
  }

  return { ok: true, checkoutUrl: session.url }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run experiences.booking-actions`
Expected: PASS, all 10 tests.

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/experiences/public-queries.ts apps/web/lib/experiences/booking-actions.ts apps/web/tests/experiences.booking-actions.test.ts
git commit -m "feat(web): Stripe Checkout Session creation server action (rate-limited, guest + signed-in)

Re-derives price/currency server-side from the experience id (never trusts
a client-supplied amount). Expires the Stripe session if the booking row
insert fails, so no orphaned session is left with no matching booking."
```

---

### Task 8: Webhook route + service-role client

**Files:**
- Create: `apps/web/lib/supabase/service.ts`
- Create: `apps/web/app/api/stripe/webhook/route.ts`
- Test: `apps/web/tests/api.stripe-webhook.test.ts`

- [ ] **Step 1: Write the service-role client**

```typescript
// apps/web/lib/supabase/service.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

/**
 * Service-role Supabase client — bypasses RLS entirely. The Stripe webhook is
 * the ONE documented exception permitted to use this (design spec §4.5); no
 * other request path in this codebase may import this file.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient&lt;Database&gt;(url!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

- [ ] **Step 2: Write the failing test for the route**

```typescript
// apps/web/tests/api.stripe-webhook.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { constructEventMock, rpcMock } = vi.hoisted(() =&gt; ({
  constructEventMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/stripe/client', () =&gt; ({
  getStripeClient: () =&gt; ({ webhooks: { constructEvent: constructEventMock } }),
}))
vi.mock('@/lib/supabase/service', () =&gt; ({
  createSupabaseServiceClient: () =&gt; ({ rpc: rpcMock }),
}))

import { POST } from '@/app/api/stripe/webhook/route'

function makeRequest(body: string, signature: string | null) {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: signature ? { 'stripe-signature': signature } : {},
    body,
  })
}

beforeEach(() =&gt; {
  constructEventMock.mockReset()
  rpcMock.mockReset()
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
})

describe('POST /api/stripe/webhook', () =&gt; {
  it('rejects a request with no signature header', async () =&gt; {
    const res = await POST(makeRequest('{}', null))
    expect(res.status).toBe(401)
  })

  it('rejects a request with an invalid signature', async () =&gt; {
    constructEventMock.mockImplementation(() =&gt; { throw new Error('bad signature') })
    const res = await POST(makeRequest('{}', 'sig_bad'))
    expect(res.status).toBe(400)
  })

  it('confirms the booking on a paid checkout.session.completed event', async () =&gt; {
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_123', payment_status: 'paid', payment_intent: 'pi_123' } },
    })
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await POST(makeRequest('{}', 'sig_good'))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('confirm_booking_from_webhook', {
      p_stripe_payment_intent_id: 'pi_123',
      p_stripe_checkout_session_id: 'cs_123',
    })
  })

  it('ignores a checkout.session.completed event that is not yet paid', async () =&gt; {
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_123', payment_status: 'unpaid', payment_intent: 'pi_123' } },
    })
    const res = await POST(makeRequest('{}', 'sig_good'))
    expect(res.status).toBe(200)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns 500 when the confirmation RPC fails, so Stripe retries', async () =&gt; {
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_123', payment_status: 'paid', payment_intent: 'pi_123' } },
    })
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await POST(makeRequest('{}', 'sig_good'))
    expect(res.status).toBe(500)
  })

  it('ignores unrelated event types', async () =&gt; {
    constructEventMock.mockReturnValue({ type: 'payment_intent.created', data: { object: {} } })
    const res = await POST(makeRequest('{}', 'sig_good'))
    expect(res.status).toBe(200)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run api.stripe-webhook`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the route implementation**

```typescript
// apps/web/app/api/stripe/webhook/route.ts
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/stripe/client'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signature || !webhookSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const rawBody = await req.text()
  let event: Stripe.Event
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('[stripe:webhook] signature verification failed', err)
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status === 'paid' &amp;&amp; session.payment_intent) {
      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id
      const supabase = createSupabaseServiceClient()
      const { error } = await supabase.rpc('confirm_booking_from_webhook', {
        p_stripe_payment_intent_id: paymentIntentId,
        p_stripe_checkout_session_id: session.id,
      })
      if (error) {
        console.error('[stripe:webhook] confirm_booking_from_webhook failed', error)
        return NextResponse.json({ ok: false, error: 'confirmation failed' }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run api.stripe-webhook`
Expected: PASS, all 5 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/supabase/service.ts apps/web/app/api/stripe/webhook/route.ts apps/web/tests/api.stripe-webhook.test.ts
git commit -m "feat(web): Stripe webhook route — signature-verified, idempotent booking confirmation

Returns 500 on RPC failure (not swallowed) so Stripe's automatic retry can
recover from a transient DB error; the RPC's own idempotency makes retries
safe."
```

---

### Task 9: Booking confirmation query

**Files:**
- Create: `apps/web/lib/experiences/booking-confirmation-queries.ts`
- Test: `apps/web/tests/experiences.booking-confirmation-queries.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/experiences.booking-confirmation-queries.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { rpcMock } = vi.hoisted(() =&gt; ({ rpcMock: vi.fn() }))
vi.mock('@/lib/supabase/public', () =&gt; ({
  createSupabasePublicClient: () =&gt; ({ rpc: rpcMock }),
}))

import { getBookingByCheckoutSession } from '@/lib/experiences/booking-confirmation-queries'

beforeEach(() =&gt; rpcMock.mockReset())

const row = {
  booking_id: 'b1', status: 'confirmed', qty: 2, total_amount: '2400.00', currency: 'HKD',
  experience_title: 'Tokyo After-Hours Izakaya Crawl', experience_slug: 'tokyo-crawl',
}

describe('getBookingByCheckoutSession', () =&gt; {
  it('maps a found booking to camelCase', async () =&gt; {
    rpcMock.mockReturnValue({ maybeSingle: () =&gt; Promise.resolve({ data: row, error: null }) })
    const result = await getBookingByCheckoutSession('cs_123')
    expect(result).toEqual({
      bookingId: 'b1', status: 'confirmed', qty: 2, totalAmount: 2400, currency: 'HKD',
      experienceTitle: 'Tokyo After-Hours Izakaya Crawl', experienceSlug: 'tokyo-crawl',
    })
  })

  it('returns null when no booking matches the session id', async () =&gt; {
    rpcMock.mockReturnValue({ maybeSingle: () =&gt; Promise.resolve({ data: null, error: null }) })
    const result = await getBookingByCheckoutSession('cs_missing')
    expect(result).toBeNull()
  })

  it('propagates errors', async () =&gt; {
    rpcMock.mockReturnValue({ maybeSingle: () =&gt; Promise.resolve({ data: null, error: { message: 'boom' } }) })
    await expect(getBookingByCheckoutSession('cs_err')).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run experiences.booking-confirmation-queries`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/web/lib/experiences/booking-confirmation-queries.ts
import { createSupabasePublicClient } from '@/lib/supabase/public'

export type BookingConfirmation = {
  bookingId: string
  status: 'pending_payment' | 'confirmed' | 'completed' | 'cancelled' | 'refunded'
  qty: number
  totalAmount: number
  currency: string
  experienceTitle: string
  experienceSlug: string
}

/**
 * Reads a single booking back by its (unguessable, Stripe-generated) checkout
 * session id via a SECURITY DEFINER RPC — the sanctioned anon-read exception
 * for guest confirmations (design spec §D-R3-2), reused uniformly for
 * signed-in travelers too so the confirmation page never has to branch on
 * auth state.
 */
export async function getBookingByCheckoutSession(sessionId: string): Promise&lt;BookingConfirmation | null&gt; {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .rpc('get_booking_by_checkout_session', { p_session_id: sessionId })
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    bookingId: data.booking_id as string,
    status: data.status as BookingConfirmation['status'],
    qty: data.qty as number,
    totalAmount: Number(data.total_amount),
    currency: data.currency as string,
    experienceTitle: data.experience_title as string,
    experienceSlug: data.experience_slug as string,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run experiences.booking-confirmation-queries`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/experiences/booking-confirmation-queries.ts apps/web/tests/experiences.booking-confirmation-queries.test.ts
git commit -m "feat(web): booking confirmation read by checkout session id"
```

---

### Task 10: i18n — `booking` message group across all 7 locales, retire the old badge copy

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts`

- [ ] **Step 1: Verify the retiring keys have no other usages**

Run: `cd apps/web && grep -rn "bookingSoonBadge\|bookingSoonNote" --include="*.ts" --include="*.tsx" .`
Expected: hits only in the 7 message files and `ExperiencePublicView.tsx` (which Task 12
modifies to stop referencing them). If any other file references them, note it and
update that file too before removing the keys.

- [ ] **Step 2: Add the `BookingMessages` interface to `en.ts`**

Add this interface near `ExperiencePublicMessages` (around line 172-180), and remove
`bookingSoonBadge`/`bookingSoonNote` from `ExperiencePublicMessages`:

```typescript
export interface BookingMessages {
  selectDateLabel: string
  noAvailability: string
  qtyLabel: string
  spotsLeftLabel: string
  soldOutLabel: string
  guestEmailLabel: string
  guestEmailPlaceholder: string
  guestEmailHint: string
  submitCta: string
  submittingCta: string
  invalidEmail: string
  invalidQty: string
  genericError: string
  rateLimitedError: string
  confirmedTitle: string
  confirmedBody: string
  pendingTitle: string
  pendingBody: string
  refreshCta: string
  notFoundTitle: string
  notFoundBody: string
  summaryQtyLabel: string
  summaryTotalLabel: string
}
```

Add `booking: BookingMessages` as a new field on the top-level `Messages` interface
(alongside the existing `experiencePublic: ExperiencePublicMessages` field).

- [ ] **Step 3: Add the English object literal, remove the retired keys**

In the `experiencePublic` object literal (around line 1808-1816), remove
`bookingSoonBadge` and `bookingSoonNote`. Add this new top-level `booking` entry to the
`messages` object:

```typescript
  booking: {
    selectDateLabel: 'Choose a date',
    noAvailability: 'No upcoming dates yet — check back soon.',
    qtyLabel: 'Travelers',
    spotsLeftLabel: 'spots left',
    soldOutLabel: 'Sold out',
    guestEmailLabel: 'Email',
    guestEmailPlaceholder: 'you@example.com',
    guestEmailHint: "We'll send your booking confirmation here.",
    submitCta: 'Book now',
    submittingCta: 'Redirecting to secure checkout…',
    invalidEmail: 'Enter a valid email address',
    invalidQty: 'Choose how many travelers',
    genericError: 'Something went wrong. Please try again.',
    rateLimitedError: 'Too many attempts. Please try again in a few minutes.',
    confirmedTitle: "You're booked!",
    confirmedBody: "We've sent a confirmation to your email.",
    pendingTitle: 'Confirming your payment…',
    pendingBody: 'This can take a few seconds. Refresh to check again.',
    refreshCta: 'Refresh',
    notFoundTitle: "We couldn't find that booking",
    notFoundBody: 'The link may be incomplete or out of date.',
    summaryQtyLabel: 'Travelers',
    summaryTotalLabel: 'Total paid',
  },
```

- [ ] **Step 4: Mirror into all 6 other locale files**

Remove `bookingSoonBadge`/`bookingSoonNote` from each locale's `experiencePublic` object,
and add each locale's `booking` object:

`zh-hk.ts`:
```typescript
  booking: {
    selectDateLabel: '選擇日期',
    noAvailability: '暫時未有可預約日期，請稍後再瀏覽。',
    qtyLabel: '旅客人數',
    spotsLeftLabel: '個名額',
    soldOutLabel: '已滿額',
    guestEmailLabel: '電郵',
    guestEmailPlaceholder: 'you@example.com',
    guestEmailHint: '我們會將預約確認發送至此電郵。',
    submitCta: '立即預約',
    submittingCta: '正在轉往安全付款頁面…',
    invalidEmail: '請輸入有效的電郵地址',
    invalidQty: '請選擇旅客人數',
    genericError: '發生錯誤，請重試。',
    rateLimitedError: '嘗試次數過多，請稍後再試。',
    confirmedTitle: '預約成功！',
    confirmedBody: '確認電郵已發送至您的信箱。',
    pendingTitle: '正在確認付款…',
    pendingBody: '這可能需要幾秒鐘，請重新整理頁面查看。',
    refreshCta: '重新整理',
    notFoundTitle: '找不到此預約',
    notFoundBody: '連結可能不完整或已失效。',
    summaryQtyLabel: '旅客人數',
    summaryTotalLabel: '已付總額',
  },
```

`zh-tw.ts`:
```typescript
  booking: {
    selectDateLabel: '選擇日期',
    noAvailability: '目前尚無可預約日期，請稍後再查看。',
    qtyLabel: '旅客人數',
    spotsLeftLabel: '個名額',
    soldOutLabel: '名額已滿',
    guestEmailLabel: '電子郵件',
    guestEmailPlaceholder: 'you@example.com',
    guestEmailHint: '我們會將預約確認寄送至此電子郵件。',
    submitCta: '立即預約',
    submittingCta: '正在前往安全付款頁面…',
    invalidEmail: '請輸入有效的電子郵件地址',
    invalidQty: '請選擇旅客人數',
    genericError: '發生錯誤，請再試一次。',
    rateLimitedError: '嘗試次數過多，請稍後再試。',
    confirmedTitle: '預約成功！',
    confirmedBody: '確認信已寄送至您的電子郵件。',
    pendingTitle: '付款確認中…',
    pendingBody: '這可能需要幾秒鐘，請重新整理頁面查看。',
    refreshCta: '重新整理',
    notFoundTitle: '找不到此預約',
    notFoundBody: '連結可能不完整或已失效。',
    summaryQtyLabel: '旅客人數',
    summaryTotalLabel: '已付總額',
  },
```

`zh-cn.ts`:
```typescript
  booking: {
    selectDateLabel: '选择日期',
    noAvailability: '暂时没有可预约日期，请稍后再查看。',
    qtyLabel: '旅客人数',
    spotsLeftLabel: '个名额',
    soldOutLabel: '名额已满',
    guestEmailLabel: '邮箱',
    guestEmailPlaceholder: 'you@example.com',
    guestEmailHint: '我们会将预约确认发送至此邮箱。',
    submitCta: '立即预约',
    submittingCta: '正在跳转至安全支付页面…',
    invalidEmail: '请输入有效的邮箱地址',
    invalidQty: '请选择旅客人数',
    genericError: '出错了，请重试。',
    rateLimitedError: '尝试次数过多，请稍后再试。',
    confirmedTitle: '预约成功！',
    confirmedBody: '确认邮件已发送至您的邮箱。',
    pendingTitle: '正在确认付款…',
    pendingBody: '这可能需要几秒钟，请刷新页面查看。',
    refreshCta: '刷新',
    notFoundTitle: '找不到该预约',
    notFoundBody: '链接可能不完整或已失效。',
    summaryQtyLabel: '旅客人数',
    summaryTotalLabel: '已付总额',
  },
```

`ja.ts`:
```typescript
  booking: {
    selectDateLabel: '日付を選択',
    noAvailability: '現在予約可能な日程はありません。しばらくしてからご確認ください。',
    qtyLabel: '人数',
    spotsLeftLabel: '名様分の空き',
    soldOutLabel: '満席',
    guestEmailLabel: 'メールアドレス',
    guestEmailPlaceholder: 'you@example.com',
    guestEmailHint: 'ご予約確認はこちらのメールアドレスに送信されます。',
    submitCta: '今すぐ予約',
    submittingCta: '安全な決済ページに移動しています…',
    invalidEmail: '有効なメールアドレスを入力してください',
    invalidQty: '人数を選択してください',
    genericError: 'エラーが発生しました。もう一度お試しください。',
    rateLimitedError: '試行回数が多すぎます。しばらくしてからもう一度お試しください。',
    confirmedTitle: 'ご予約が完了しました！',
    confirmedBody: '確認メールをお送りしました。',
    pendingTitle: 'お支払いを確認しています…',
    pendingBody: '数秒かかる場合があります。ページを更新してご確認ください。',
    refreshCta: '更新',
    notFoundTitle: 'この予約が見つかりませんでした',
    notFoundBody: 'リンクが不完全か、期限切れの可能性があります。',
    summaryQtyLabel: '人数',
    summaryTotalLabel: 'お支払い合計',
  },
```

`ko.ts`:
```typescript
  booking: {
    selectDateLabel: '날짜 선택',
    noAvailability: '현재 예약 가능한 날짜가 없습니다. 나중에 다시 확인해 주세요.',
    qtyLabel: '인원',
    spotsLeftLabel: '자리 남음',
    soldOutLabel: '마감',
    guestEmailLabel: '이메일',
    guestEmailPlaceholder: 'you@example.com',
    guestEmailHint: '예약 확인 메일을 이 주소로 보내드립니다.',
    submitCta: '지금 예약하기',
    submittingCta: '안전한 결제 페이지로 이동 중…',
    invalidEmail: '유효한 이메일 주소를 입력해 주세요',
    invalidQty: '인원 수를 선택해 주세요',
    genericError: '오류가 발생했습니다. 다시 시도해 주세요.',
    rateLimitedError: '시도 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    confirmedTitle: '예약이 완료되었습니다!',
    confirmedBody: '확인 메일을 보내드렸습니다.',
    pendingTitle: '결제 확인 중…',
    pendingBody: '몇 초 정도 걸릴 수 있습니다. 새로고침하여 확인해 주세요.',
    refreshCta: '새로고침',
    notFoundTitle: '예약 내역을 찾을 수 없습니다',
    notFoundBody: '링크가 불완전하거나 만료되었을 수 있습니다.',
    summaryQtyLabel: '인원',
    summaryTotalLabel: '결제 총액',
  },
```

`th.ts`:
```typescript
  booking: {
    selectDateLabel: 'เลือกวันที่',
    noAvailability: 'ยังไม่มีวันที่เปิดให้จองในขณะนี้ กรุณาตรวจสอบอีกครั้งภายหลัง',
    qtyLabel: 'จำนวนผู้เดินทาง',
    spotsLeftLabel: 'ที่ว่างเหลือ',
    soldOutLabel: 'เต็มแล้ว',
    guestEmailLabel: 'อีเมล',
    guestEmailPlaceholder: 'you@example.com',
    guestEmailHint: 'เราจะส่งการยืนยันการจองไปที่อีเมลนี้',
    submitCta: 'จองเลย',
    submittingCta: 'กำลังไปยังหน้าชำระเงินที่ปลอดภัย…',
    invalidEmail: 'กรุณากรอกอีเมลที่ถูกต้อง',
    invalidQty: 'กรุณาเลือกจำนวนผู้เดินทาง',
    genericError: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
    rateLimitedError: 'พยายามหลายครั้งเกินไป กรุณาลองใหม่ในอีกสักครู่',
    confirmedTitle: 'จองสำเร็จแล้ว!',
    confirmedBody: 'เราได้ส่งอีเมลยืนยันไปให้คุณแล้ว',
    pendingTitle: 'กำลังยืนยันการชำระเงิน…',
    pendingBody: 'อาจใช้เวลาสักครู่ กรุณารีเฟรชหน้านี้เพื่อตรวจสอบอีกครั้ง',
    refreshCta: 'รีเฟรช',
    notFoundTitle: 'ไม่พบการจองนี้',
    notFoundBody: 'ลิงก์อาจไม่สมบูรณ์หรือหมดอายุแล้ว',
    summaryQtyLabel: 'จำนวนผู้เดินทาง',
    summaryTotalLabel: 'ยอดชำระทั้งหมด',
  },
```

- [ ] **Step 5: Run the parity test**

Run: `cd apps/web && npx vitest run i18n.locale-parity`
Expected: PASS — the new `booking` group and its keys are picked up automatically via
`Object.keys(en)`, no manual registration needed. If it fails, the failure message names
exactly which locale is missing which key.

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors (this also confirms every locale file's object literal satisfies the
updated `Messages` interface).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/i18n/messages/*.ts
git commit -m "i18n(web): add booking message group across all 7 locales, retire bookingSoonBadge/Note"
```

---

### Task 11: `BookingWidget` component

**Files:**
- Create: `apps/web/components/kinnso/pages/BookingWidget.tsx`
- Test: `apps/web/tests/experiences.booking-widget.host.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/tests/experiences.booking-widget.host.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { BookingWidget } from '@/components/kinnso/pages/BookingWidget'
import en from '@/lib/i18n/messages/en'

const { createCheckoutSessionActionMock } = vi.hoisted(() =&gt; ({
  createCheckoutSessionActionMock: vi.fn(),
}))
vi.mock('@/lib/experiences/booking-actions', () =&gt; ({
  createCheckoutSessionAction: createCheckoutSessionActionMock,
}))

afterEach(cleanup)

const experience = {
  id: 'exp1', slug: 'tokyo-crawl', title: 'Tokyo After-Hours Izakaya Crawl', summary: null,
  description: null, city: 'Tokyo', priceAmount: 1200, currency: 'HKD', durationMinutes: 180,
  coverUrl: null, publishedAt: null, merchant: { slug: 'sunrise-stays', companyName: 'Sunrise Stays HK' },
}

describe('BookingWidget', () =&gt; {
  it('renders the empty state when there is no availability', () =&gt; {
    render(&lt;BookingWidget locale="en" t={en.booking} experience={experience} availability={[]} viewerEmail={null} /&gt;)
    expect(screen.getByText(en.booking.noAvailability)).toBeInTheDocument()
  })

  it('hides the guest email field for signed-in viewers', () =&gt; {
    render(
      &lt;BookingWidget
        locale="en"
        t={en.booking}
        experience={experience}
        availability={[{ id: 'a1', date: '2026-08-01', remaining: 4 }]}
        viewerEmail="traveler@example.com"
      /&gt;,
    )
    expect(screen.queryByLabelText(en.booking.guestEmailLabel)).not.toBeInTheDocument()
    expect(screen.getByText(en.booking.submitCta)).toBeInTheDocument()
  })

  it('shows the guest email field for anonymous viewers', () =&gt; {
    render(
      &lt;BookingWidget
        locale="en"
        t={en.booking}
        experience={experience}
        availability={[{ id: 'a1', date: '2026-08-01', remaining: 4 }]}
        viewerEmail={null}
      /&gt;,
    )
    expect(screen.getByLabelText(en.booking.guestEmailLabel)).toBeInTheDocument()
  })

  it('marks a sold-out date as disabled in the date selector', () =&gt; {
    render(
      &lt;BookingWidget
        locale="en"
        t={en.booking}
        experience={experience}
        availability={[{ id: 'a1', date: '2026-08-01', remaining: 0 }]}
        viewerEmail="traveler@example.com"
      /&gt;,
    )
    expect(screen.getByText(new RegExp(en.booking.soldOutLabel))).toBeInTheDocument()
  })

  it('shows an inline error when the action returns a failure', async () =&gt; {
    createCheckoutSessionActionMock.mockResolvedValue({ ok: false, errors: { form: ['Not enough spots left for that date'] } })
    render(
      &lt;BookingWidget
        locale="en"
        t={en.booking}
        experience={experience}
        availability={[{ id: 'a1', date: '2026-08-01', remaining: 4 }]}
        viewerEmail="traveler@example.com"
      /&gt;,
    )
    fireEvent.click(screen.getByText(en.booking.submitCta))
    expect(await screen.findByText('Not enough spots left for that date')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run experiences.booking-widget.host`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/web/components/kinnso/pages/BookingWidget.tsx
'use client'

import { useState, useTransition } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { PublicExperience } from '@/lib/experiences/public-queries'
import type { PublicAvailability } from '@/lib/experiences/public-availability-queries'
import { createCheckoutSessionAction } from '@/lib/experiences/booking-actions'

export function BookingWidget({ locale, t, experience, availability, viewerEmail }: {
  locale: Locale
  t: Messages['booking']
  experience: PublicExperience
  availability: PublicAvailability[]
  viewerEmail: string | null
}) {
  const [selectedId, setSelectedId] = useState(availability.find((a) =&gt; a.remaining &gt; 0)?.id ?? '')
  const [qty, setQty] = useState('1')
  const [guestEmail, setGuestEmail] = useState('')
  const [error, setError] = useState&lt;string | null&gt;(null)
  const [isPending, startTransition] = useTransition()

  const selected = availability.find((a) =&gt; a.id === selectedId)

  function handleSubmit() {
    setError(null)
    startTransition(async () =&gt; {
      const result = await createCheckoutSessionAction(
        experience.id,
        { availabilityId: selectedId, qty, guestEmail },
        { locale },
      )
      if (!result.ok) {
        setError(
          result.errors.form?.[0] ??
            result.errors.availabilityId?.[0] ??
            result.errors.qty?.[0] ??
            result.errors.guestEmail?.[0] ??
            t.genericError,
        )
        return
      }
      window.location.href = result.checkoutUrl
    })
  }

  if (availability.length === 0) {
    return (
      &lt;div className="mt-6 rounded-[3px] border border-kinnso-edge bg-white px-4 py-3"&gt;
        &lt;p className="text-sm font-semibold text-kinnso-ink"&gt;{t.noAvailability}&lt;/p&gt;
      &lt;/div&gt;
    )
  }

  return (
    &lt;div className="mt-6 rounded-[3px] border border-kinnso-edge bg-white px-4 py-4"&gt;
      &lt;label className="block text-xs font-bold uppercase tracking-wide text-kinnso-muted" htmlFor="booking-date"&gt;
        {t.selectDateLabel}
      &lt;/label&gt;
      &lt;select
        id="booking-date"
        className="mt-1 w-full rounded-[3px] border border-kinnso-edge px-3 py-2 text-sm"
        value={selectedId}
        onChange={(e) =&gt; setSelectedId(e.target.value)}
      &gt;
        {availability.map((a) =&gt; (
          &lt;option key={a.id} value={a.id} disabled={a.remaining === 0}&gt;
            {a.date} — {a.remaining === 0 ? t.soldOutLabel : `${a.remaining} ${t.spotsLeftLabel}`}
          &lt;/option&gt;
        ))}
      &lt;/select&gt;

      &lt;label className="mt-3 block text-xs font-bold uppercase tracking-wide text-kinnso-muted" htmlFor="booking-qty"&gt;
        {t.qtyLabel}
      &lt;/label&gt;
      &lt;input
        id="booking-qty"
        type="number"
        min={1}
        max={selected?.remaining ?? 1}
        className="mt-1 w-full rounded-[3px] border border-kinnso-edge px-3 py-2 text-sm"
        value={qty}
        onChange={(e) =&gt; setQty(e.target.value)}
      /&gt;

      {!viewerEmail ? (
        &lt;&gt;
          &lt;label className="mt-3 block text-xs font-bold uppercase tracking-wide text-kinnso-muted" htmlFor="booking-email"&gt;
            {t.guestEmailLabel}
          &lt;/label&gt;
          &lt;input
            id="booking-email"
            type="email"
            placeholder={t.guestEmailPlaceholder}
            className="mt-1 w-full rounded-[3px] border border-kinnso-edge px-3 py-2 text-sm"
            value={guestEmail}
            onChange={(e) =&gt; setGuestEmail(e.target.value)}
          /&gt;
          &lt;p className="mt-1 text-xs text-kinnso-muted"&gt;{t.guestEmailHint}&lt;/p&gt;
        &lt;/&gt;
      ) : null}

      {error ? &lt;p className="mt-3 text-sm text-red-600"&gt;{error}&lt;/p&gt; : null}

      &lt;button
        type="button"
        disabled={isPending || !selected || selected.remaining === 0}
        onClick={handleSubmit}
        className="mt-4 w-full rounded-[3px] bg-kinnso-orangeDark px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      &gt;
        {isPending ? t.submittingCta : t.submitCta}
      &lt;/button&gt;
    &lt;/div&gt;
  )
}

export default BookingWidget
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run experiences.booking-widget.host`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/pages/BookingWidget.tsx apps/web/tests/experiences.booking-widget.host.test.tsx
git commit -m "feat(web): BookingWidget — date/qty/guest-email selector, calls the checkout action"
```

---

### Task 12: Wire the widget into `ExperiencePublicView` and the experience page

**Files:**
- Modify: `apps/web/components/kinnso/pages/ExperiencePublicView.tsx`
- Modify: `apps/web/app/[locale]/experiences/[slug]/page.tsx`

- [ ] **Step 1: Check for any existing test covering `ExperiencePublicView` or the page**

Run: `cd apps/web && find tests -iname "*experience-public*" -o -iname "*ExperiencePublicView*" -o -iname "*experiences.public*"`
Expected: no hits (none was reported by this plan's research). If a hit is found, update
that test's props/assertions to match Step 2 and Step 3 below before proceeding.

- [ ] **Step 2: Replace the "Booking opens soon" block in `ExperiencePublicView.tsx`**

Full new file contents:

```tsx
// apps/web/components/kinnso/pages/ExperiencePublicView.tsx
import Link from 'next/link'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { BookingWidget } from '@/components/kinnso/pages/BookingWidget'
import type { PublicExperience } from '@/lib/experiences/public-queries'
import type { PublicAvailability } from '@/lib/experiences/public-availability-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function ExperiencePublicView({ locale, t, bookingT, experience, availability, viewerEmail }: {
  locale: Locale
  t: Messages['experiencePublic']
  bookingT: Messages['booking']
  experience: PublicExperience
  availability: PublicAvailability[]
  viewerEmail: string | null
}) {
  const p = (path: string) =&gt; `/${locale}${path}`
  return (
    &lt;article className="k2-container py-8 md:py-12"&gt;
      &lt;section className="overflow-hidden rounded-xl bg-white shadow-kinnso"&gt;
        &lt;div
          role="img"
          aria-label={experience.title}
          className="relative aspect-[16/9] w-full bg-kinnso-ink bg-cover bg-center"
          style={experience.coverUrl ? { backgroundImage: `url(${experience.coverUrl})` } : undefined}
        &gt;
          &lt;div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" /&gt;
          &lt;Eyebrow className="absolute left-4 top-4 rounded-[3px] bg-white/90 px-3 py-1"&gt;{experience.city}&lt;/Eyebrow&gt;
        &lt;/div&gt;
        &lt;div className="p-6 md:p-8"&gt;
          &lt;h1 className="k2-display max-w-3xl text-2xl font-semibold leading-tight text-kinnso-ink md:text-4xl"&gt;{experience.title}&lt;/h1&gt;
          &lt;p className="mt-2 text-sm text-kinnso-muted"&gt;
            {t.hostedBy}{' '}
            &lt;Link href={p(`/m/${experience.merchant.slug}`)} className="font-semibold text-kinnso-orangeDark hover:underline"&gt;
              {experience.merchant.companyName}
            &lt;/Link&gt;
          &lt;/p&gt;
        &lt;/div&gt;
      &lt;/section&gt;

      &lt;section className="mt-6 grid gap-5 md:grid-cols-[1fr_320px]"&gt;
        &lt;div className="rounded-lg bg-white p-6"&gt;
          {experience.summary ? &lt;p className="text-kinnso-ink/80"&gt;{experience.summary}&lt;/p&gt; : null}
          {experience.description ? &lt;p className="mt-4 leading-relaxed text-kinnso-ink/70"&gt;{experience.description}&lt;/p&gt; : null}
        &lt;/div&gt;
        &lt;div className="k2-card bg-kinnso-cream2 p-6"&gt;
          &lt;p className="text-xs font-bold uppercase tracking-wide text-kinnso-muted"&gt;{t.priceLabel}&lt;/p&gt;
          &lt;p className="k2-display mt-1 text-2xl font-semibold text-kinnso-ink"&gt;{experience.currency} {experience.priceAmount.toLocaleString()}&lt;/p&gt;
          {experience.durationMinutes ? (
            &lt;p className="mt-3 text-sm text-kinnso-ink/70"&gt;{t.durationLabel}: {experience.durationMinutes} {t.minutesSuffix}&lt;/p&gt;
          ) : null}
          &lt;BookingWidget locale={locale} t={bookingT} experience={experience} availability={availability} viewerEmail={viewerEmail} /&gt;
          &lt;Link href={p(`/m/${experience.merchant.slug}`)} className="mt-4 inline-block text-sm font-semibold text-kinnso-orangeDark hover:underline"&gt;
            {t.backToMerchant} {experience.merchant.companyName}
          &lt;/Link&gt;
        &lt;/div&gt;
      &lt;/section&gt;
    &lt;/article&gt;
  )
}

export default ExperiencePublicView
```

- [ ] **Step 3: Update `page.tsx` to fetch availability and the viewer's email**

Full new file contents:

```tsx
// apps/web/app/[locale]/experiences/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getExperienceBySlug } from '@/lib/experiences/public-queries'
import { listPublicAvailability } from '@/lib/experiences/public-availability-queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildExperienceMetadata, SITE_URL } from '@/lib/seo/metadata'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { ExperiencePublicView } from '@/components/kinnso/pages/ExperiencePublicView'

export function generateStaticParams() {
  // Experiences are DB-only; resolve on demand (dynamicParams defaults to true) —
  // same choice as /g/[slug].
  return []
}

export async function generateMetadata({ params }: { params: Promise&lt;{ locale: string; slug: string }&gt; }): Promise&lt;Metadata&gt; {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const experience = await getExperienceBySlug(slug)
  if (!experience) return { title: 'Experience not found', robots: { index: false, follow: false } }
  const description = experience.summary ?? `${experience.city} experience hosted by ${experience.merchant.companyName}.`
  return buildExperienceMetadata({ slug, locale: locale as Locale, title: experience.title, description })
}

export default async function ExperiencePublicPage({ params }: { params: Promise&lt;{ locale: string; slug: string }&gt; }) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const experience = await getExperienceBySlug(slug)
  if (!experience) notFound()

  const supabase = await createSupabaseServerClient()
  const [availability, { data: { user } }] = await Promise.all([
    listPublicAvailability(experience.id),
    supabase.auth.getUser(),
  ])

  const canonical = `${SITE_URL}/${locale}/experiences/${slug}`
  // Breadcrumbs only — Product/Offer JSON-LD for real bookability is a
  // separate SEO carry-forward (design spec groups it with R3C's loop-closure
  // work, not this phase's Stripe/widget scope).
  const ld = [
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: messages.seo.merchants.title, url: `${SITE_URL}/${locale}/merchants` },
      { name: experience.title, url: canonical },
    ]),
  ]
  return (
    &lt;&gt;
      &lt;JsonLd data={ld} /&gt;
      &lt;ExperiencePublicView
        locale={locale as Locale}
        t={messages.experiencePublic}
        bookingT={messages.booking}
        experience={experience}
        availability={availability}
        viewerEmail={user?.email ?? null}
      /&gt;
    &lt;/&gt;
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Re-run the booking widget host test plus a full local build sanity check**

Run: `cd apps/web && npx vitest run experiences.booking-widget.host`
Expected: PASS (unaffected by this task, confirms nothing broke the component's own
contract).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/pages/ExperiencePublicView.tsx apps/web/app/[locale]/experiences/[slug]/page.tsx
git commit -m "feat(web): replace 'Booking opens soon' with the real BookingWidget on the experience page"
```

---

### Task 13: Booking confirmation page

**Files:**
- Create: `apps/web/app/[locale]/experiences/[slug]/booked/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// apps/web/app/[locale]/experiences/[slug]/booked/page.tsx
import type { Metadata } from 'next'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getBookingByCheckoutSession } from '@/lib/experiences/booking-confirmation-queries'

export async function generateMetadata(): Promise&lt;Metadata&gt; {
  return { robots: { index: false, follow: false } }
}

export default async function BookingConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise&lt;{ locale: string; slug: string }&gt;
  searchParams: Promise&lt;{ session_id?: string }&gt;
}) {
  const { locale, slug } = await params
  const { session_id: sessionId } = await searchParams
  if (!isLocale(locale)) return null
  const messages = await getDictionary(locale as Locale)
  const t = messages.booking
  const refreshHref = `/${locale}/experiences/${slug}/booked${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''}`

  const booking = sessionId ? await getBookingByCheckoutSession(sessionId) : null

  if (!booking) {
    return (
      &lt;div className="k2-container py-16 text-center"&gt;
        &lt;h1 className="k2-display text-2xl font-semibold text-kinnso-ink"&gt;{t.notFoundTitle}&lt;/h1&gt;
        &lt;p className="mt-2 text-kinnso-muted"&gt;{t.notFoundBody}&lt;/p&gt;
      &lt;/div&gt;
    )
  }

  if (booking.status === 'pending_payment') {
    return (
      &lt;div className="k2-container py-16 text-center"&gt;
        &lt;h1 className="k2-display text-2xl font-semibold text-kinnso-ink"&gt;{t.pendingTitle}&lt;/h1&gt;
        &lt;p className="mt-2 text-kinnso-muted"&gt;{t.pendingBody}&lt;/p&gt;
        &lt;a
          href={refreshHref}
          className="mt-4 inline-block rounded-[3px] bg-kinnso-orangeDark px-4 py-2 text-sm font-semibold text-white"
        &gt;
          {t.refreshCta}
        &lt;/a&gt;
      &lt;/div&gt;
    )
  }

  return (
    &lt;div className="k2-container py-16 text-center"&gt;
      &lt;h1 className="k2-display text-2xl font-semibold text-kinnso-ink"&gt;{t.confirmedTitle}&lt;/h1&gt;
      &lt;p className="mt-2 text-kinnso-muted"&gt;{t.confirmedBody}&lt;/p&gt;
      &lt;div className="k2-card mx-auto mt-6 max-w-sm bg-kinnso-cream2 p-6 text-left"&gt;
        &lt;p className="text-sm font-semibold text-kinnso-ink"&gt;{booking.experienceTitle}&lt;/p&gt;
        &lt;p className="mt-2 text-sm text-kinnso-ink/70"&gt;{t.summaryQtyLabel}: {booking.qty}&lt;/p&gt;
        &lt;p className="mt-1 text-sm text-kinnso-ink/70"&gt;{t.summaryTotalLabel}: {booking.currency} {booking.totalAmount.toLocaleString()}&lt;/p&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/[locale]/experiences/[slug]/booked/page.tsx"
git commit -m "feat(web): booking confirmation page — handles confirmed, pending, and not-found states"
```

---

### Task 14: Migration verification test

**Files:**
- Create: `apps/web/tests/db.r3a2-migration.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// apps/web/tests/db.r3a2-migration.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260704120000_r3a2_stripe_webhook_confirmation_and_rate_limit.sql'),
  'utf8',
)

describe('confirm_booking_from_webhook() RPC', () =&gt; {
  it('is a SECURITY DEFINER function with a pinned search_path', () =&gt; {
    expect(sql).toContain('create or replace function public.confirm_booking_from_webhook(')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
  })
  it('is idempotent — no-ops when the booking is not pending_payment', () =&gt; {
    expect(sql).toContain("if v_status &lt;&gt; 'pending_payment' then")
    expect(sql).toContain('return;')
  })
  it('row-locks the booking before transitioning it', () =&gt; {
    expect(sql).toMatch(/where stripe_checkout_session_id = p_stripe_checkout_session_id\s+for update/)
  })
  it('clamps booked_count to capacity rather than failing the transaction', () =&gt; {
    expect(sql).toContain('least(booked_count + v_qty, capacity)')
  })
  it('logs an overbooked event when the clamp actually engages', () =&gt; {
    expect(sql).toContain("'overbooked'")
  })
  it('is executable only by service_role', () =&gt; {
    expect(sql).toContain('revoke all on function public.confirm_booking_from_webhook(text, text) from public')
    expect(sql).toContain('grant execute on function public.confirm_booking_from_webhook(text, text) to service_role')
  })
  it('grants confirm_booking_from_webhook execute to service_role only — never anon or authenticated', () =&gt; {
    // Added after a live incident during Task 2: this project's default ACL
    // auto-grants EXECUTE on new functions to anon/authenticated, and
    // `revoke all ... from public` alone does NOT undo that — only an
    // explicit `revoke ... from anon, authenticated` by name does. This test
    // must isolate the exact grant line for THIS function (not just grep the
    // whole file for "anon", since the other two functions in this same
    // migration correctly DO grant to anon/authenticated).
    const grantLine = sql
      .split('\n')
      .find((line) =&gt; line.includes('grant execute on function public.confirm_booking_from_webhook'))
    expect(grantLine).toBeTruthy()
    expect(grantLine).not.toMatch(/\banon\b/)
    expect(grantLine).not.toMatch(/\bauthenticated\b/)
    expect(grantLine).toContain('service_role')
  })
})

describe('get_booking_by_checkout_session() RPC', () =&gt; {
  it('is a STABLE SECURITY DEFINER function executable by anon and authenticated', () =&gt; {
    expect(sql).toContain('create or replace function public.get_booking_by_checkout_session(p_session_id text)')
    expect(sql).toContain('security definer')
    expect(sql).toContain('grant execute on function public.get_booking_by_checkout_session(text) to anon, authenticated')
  })
})

describe('checkout_rate_limits', () =&gt; {
  it('has no anon/authenticated grants on the table itself', () =&gt; {
    expect(sql).toContain('revoke all on table public.checkout_rate_limits from anon, authenticated')
  })
  it('check_and_increment_checkout_rate_limit is an atomic single-statement upsert, executable by anon and authenticated', () =&gt; {
    expect(sql).toContain('on conflict (ip) do update')
    expect(sql).toContain('grant execute on function public.check_and_increment_checkout_rate_limit(text, integer, integer) to anon, authenticated')
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd apps/web && npx vitest run db.r3a2-migration`
Expected: PASS, 10 tests (this is a pure string-assertion test against the migration
file written in Task 2 — it should already pass; if it doesn't, the migration file and
this test have drifted and one of them needs fixing before proceeding).

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/db.r3a2-migration.test.ts
git commit -m "test(db): pin the R3A-2 migration's RPC shapes (security mode, idempotency, grants)"
```

---

### Task 15: End-to-end booking funnel spec (Playwright, Stripe test mode)

**Files:**
- Modify: `apps/e2e/fixtures.ts`
- Create: `apps/e2e/specs/booking.spec.ts`

**Prerequisite 1 (user action, not code):** this spec drives Stripe's own hosted Checkout
page, which requires the target deployment to have **real Stripe test-mode keys**
configured (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`-equivalent is not used
server-side but the account must be in test mode, `STRIPE_WEBHOOK_SECRET`) and a webhook
endpoint Stripe can reach (the deployed preview/prod URL, or `stripe listen --forward-to
localhost:3000/api/stripe/webhook` for a local run). Per the design spec §8, this is the
same "Stripe account status" item already flagged to the user.

**Prerequisite 2 (user/ops action, not code — discovered live during this task, worse
than Prerequisite 1 alone implied):** live-queried `scryfkefedzuetfdtrvl` on 2026-07-04
and found **zero rows in `experience_availability`** (`select count(*) from
public.experience_availability` → 0), despite 5 published experiences existing
(`bali-uluwatu-sunset-surf-lesson`, `bangkok-street-food-night-market-tour`,
`chiang-mai-old-city-temple-cafe-walk`, `seoul-hongdae-street-food-karaoke-night`,
`tokyo-after-hours-izakaya-crawl`). R3A-1 built the merchant-facing tooling to add
availability dates, but no merchant has actually used it yet — this is the same
long-standing "seed real supply" gap the R3 design spec's own §7/§8 already flagged for
the whole program's public launch, now concretely blocking this specific e2e spec too.
**This spec cannot run until at least one of the 5 experiences has an open, future,
non-full `experience_availability` row** — via `/merchants/dashboard/experiences/
[experienceId]/availability` as that merchant, or a direct seed insert. Neither Stripe
keys nor availability data existing yet blocks writing/typechecking the spec itself
(Steps 1-4 below) — only Step 5 (actually running it) is gated on both.

- [ ] **Step 1: Confirmed experience slug (live-queried 2026-07-04, no availability data yet)**

`tokyo-after-hours-izakaya-crawl` (Tokyo After-Hours Izakaya Crawl) — a real, published
experience, chosen because it matches the experience name already used consistently
across this plan's own mock fixtures in Tasks 7/9/11. It currently has **no**
`experience_availability` rows (see Prerequisite 2) — that's a live-data gap, not a
reason to pick a different slug; any of the 5 published experiences has the identical
gap today.

- [ ] **Step 2: Add the booking fixture**

Add this entry to the existing `FIXTURES` object in `apps/e2e/fixtures.ts` (alongside
the existing entries, inside the same `as const` object):

```typescript
  booking: {
    experiencePath: '/en/experiences/tokyo-after-hours-izakaya-crawl',
  },
```

- [ ] **Step 3: Write the spec**

```typescript
// apps/e2e/specs/booking.spec.ts
import { test, expect } from '@playwright/test'
import { FIXTURES } from '../fixtures'

/**
 * Full guest booking funnel against Stripe TEST MODE. Requires the target
 * deployment to have real Stripe test-mode keys configured (STRIPE_SECRET_KEY,
 * STRIPE_WEBHOOK_SECRET) and a webhook endpoint reachable from Stripe (the
 * deployed preview/prod URL, or `stripe listen --forward-to
 * localhost:3000/api/stripe/webhook` for local runs). Uses Stripe's documented
 * test card 4242 4242 4242 4242 (any future expiry, any CVC, any postal code).
 */
test('guest books an experience end-to-end via Stripe test-mode checkout', async ({ page }) =&gt; {
  test.setTimeout(process.env.CI ? 180_000 : 60_000)

  await page.goto(FIXTURES.booking.experiencePath)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.getByLabel('Choose a date').selectOption({ index: 0 })
  await page.getByLabel('Email').fill(`e2e+booking-${Date.now()}@kinnso.test`)
  await page.getByRole('button', { name: 'Book now' }).click()

  // Redirected to Stripe's hosted Checkout page (different origin).
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 })
  const cardFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first()
  await cardFrame.locator('input[name="number"]').fill('4242424242424242')
  await cardFrame.locator('input[name="expiry"]').fill('12/34')
  await cardFrame.locator('input[name="cvc"]').fill('123')
  await page.getByRole('button', { name: /pay/i }).click()

  // Stripe redirects back to our success_url once payment completes.
  await page.waitForURL(/\/experiences\/.+\/booked\?session_id=/, { timeout: 30_000 })
  // The webhook may not have landed yet on first paint — allow one manual refresh.
  const confirmed = page.getByRole('heading', { name: "You're booked!" })
  const pending = page.getByRole('heading', { name: 'Confirming your payment…' })
  await expect(confirmed.or(pending)).toBeVisible({ timeout: 15_000 })
  if (await pending.isVisible()) {
    await page.getByRole('link', { name: 'Refresh' }).click()
    await expect(confirmed).toBeVisible({ timeout: 15_000 })
  }
})
```

Note: Stripe's hosted Checkout card fields render inside iframes named
`__privateStripeFrameXXX`; the exact input `name` attributes (`number`/`expiry`/`cvc`)
match Stripe's current documented Checkout DOM as of this plan's writing — if Stripe has
changed this by the time this spec runs, use Playwright's codegen
(`npx playwright codegen https://checkout.stripe.com`) against a real test-mode session
to re-capture the current selectors rather than guessing.

- [ ] **Step 4: Typecheck the e2e package**

Run: `cd apps/e2e && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the spec (only if BOTH prerequisites are met; otherwise skip and note explicitly)**

Run: `cd apps/e2e && npx playwright test booking.spec.ts`
Expected: PASS — but only runnable once BOTH Prerequisite 1 (Stripe test-mode keys
configured) AND Prerequisite 2 (at least one experience has an open, future, non-full
`experience_availability` row — currently none do) are satisfied. If either is missing,
this step cannot run — report that explicitly rather than marking it done or skipping
silently.

- [ ] **Step 6: Commit**

```bash
git add apps/e2e/fixtures.ts apps/e2e/specs/booking.spec.ts
git commit -m "test(e2e): guest booking funnel against Stripe test-mode Checkout

New infrastructure — no e2e coverage existed for any booking/experience flow
before this phase. Requires real Stripe test-mode keys to actually run;
everything else in this program is unit-tested independently of this spec."
```

---

### Task 16: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `cd apps/web && npx eslint . --max-warnings=0` (or `pnpm --filter web lint` from
repo root)
Expected: no errors.

- [ ] **Step 3: Run every test file this plan touched or added, scoped**

Run: `cd apps/web && npx vitest run tests/stripe.client.test.ts tests/experiences.public-availability-queries.test.ts tests/experiences.booking-validation.test.ts tests/experiences.booking-actions.test.ts tests/api.stripe-webhook.test.ts tests/experiences.booking-confirmation-queries.test.ts tests/experiences.booking-widget.host.test.tsx tests/db.r3a2-migration.test.ts tests/i18n.locale-parity.test.ts`
Expected: PASS, all files.

- [ ] **Step 4: Spot-check the R3A-1 booking-core tests still pass unmodified**

Run: `cd apps/web && npx vitest run tests/auth.viewer-role.test.ts tests/auth.useViewerRole.test.tsx tests/experiences.availability-actions.test.ts tests/experiences.availability-queries.test.ts tests/merchants.availability.host.test.tsx`
Expected: PASS, all files — confirms this phase's changes to `public-queries.ts` and the
i18n files didn't regress R3A-1's own surfaces.

- [ ] **Step 5: Route/i18n parity**

Run: `cd apps/web && npx vitest run tests/kinnso.route-parity.test.tsx tests/i18n.locale-parity.test.ts`
Expected: PASS.

- [ ] **Step 6: Final commit (only if any of the above required fixes)**

If Steps 1-5 were all green with no changes needed, there is nothing to commit here. If
a fix was required, commit it with a message describing exactly what verification step
caught it.

---

## Exit criteria

- A traveler (signed-in or guest) can select an open, future date on
  `/experiences/[slug]`, submit the booking widget, and be redirected to Stripe's hosted
  Checkout page with the correct amount (including correct zero-decimal handling for
  JPY/KRW) and currency.
- On successful payment, Stripe's webhook confirms the booking via
  `confirm_booking_from_webhook()` — idempotently, row-locked, incrementing
  `experience_availability.booked_count` without ever blocking the confirmation itself.
- The traveler lands on `/experiences/[slug]/booked?session_id=...` and sees their
  booking (or an honest "still confirming" / "not found" state) via the sanctioned
  anon-read RPC, with no email-based cross-booking lookup possible.
- The anon-reachable checkout-session-creation action is rate-limited per IP (5 per 10
  minutes) via a new Postgres-backed limiter, with zero new third-party dependencies.
- `bookings`/`booking_events` still have no client-writable UPDATE/direct-INSERT-into-
  booking_events grant — every status transition and audit write remains RPC-only.
- All 7 locales have complete, real (not placeholder) translations for the new
  `booking` message group; `bookingSoonBadge`/`bookingSoonNote` are fully retired.
- A new Playwright e2e spec exercises the complete guest funnel against Stripe test
  mode — first e2e coverage for any booking/experience surface in this program.

## Out of scope (this plan — see R3B/R3C)

Merchant booking pipeline UI and `booking_settlements` (R3B) · `/trips` traveler account
area (R3B) · embedded experience CTAs in guides/articles and their attribution wiring
(R3C — `creator_id`/`guide_id` stay null in this phase, `source_surface` is hardcoded to
`'experience_page'`) · social-proof bookings count on the homepage (R3C) · Travelpayouts
repair job (R3C) · Product/Offer JSON-LD for the now-real bookability (a follow-up SEO
task, not bundled here) · refunds (an ops-console action, explicitly TBD per the design
spec) · retroactive guest→account booking linking · booking-lookup-by-email for
returning guests · a capacity-hold/expiry mechanism for abandoned checkouts (PD-1) ·
`checkout.session.expired`/`async_payment_failed` webhook handling (PD-7) · Stripe
Connect auto-splits.

**Carry-forward from Task 7's code-quality review**: `stripe.checkout.sessions.create()`
is called with no `idempotency_key`. This doesn't reopen PD-1's accepted tradeoff (two
genuinely separate user double-clicks each creating their own session/booking is already
handled by the confirmation RPC's `least()` clamp) — it's a narrower gap: a network retry
or duplicate form-submission re-firing the *same* logical request could create two
distinct Stripe sessions for what the user experienced as one action. A fast-follow, not
a blocker: pass `{ idempotencyKey: ... }` as `sessions.create()`'s second argument, keyed
on something stable per logical submission (e.g. `availabilityId` + a client-generated
request id threaded through the form, or a short time-bucketed key).

**Carry-forward from Task 13's spec-compliance review**: the booking confirmation page
(`/experiences/[slug]/booked`) has exactly two states beyond not-found —
`pending_payment` and a single "confirmed" fallthrough covering everything else
(`confirmed`, `completed`, `cancelled`, `refunded`). A `cancelled`/`refunded` booking
would currently show the same "You're booked! We've sent a confirmation to your email."
success message, which would be actively misleading. **Not fixed here** because no code
path in this program can currently produce a `cancelled`/`refunded` booking — that
status transition is R3B's refund/cancellation ops-console action, which doesn't exist
yet. Whoever builds that R3B flow should also special-case this page's fallthrough
branch (distinct copy for cancelled vs. refunded vs. actually-confirmed) at the same
time, rather than this page silently mis-rendering a state R3B is about to make
reachable for the first time.

**Carry-forward from Task 15 — a third prerequisite for actually running the e2e spec,
discovered live, not just the two already documented.** Ran `booking.spec.ts` against
the real target: it navigated successfully, but the page rendered the OLD retired
"Booking opens soon" / "We're finishing direct booking for this experience. Check back
soon." copy (`bookingSoonBadge`/`bookingSoonNote`) — text that no longer exists anywhere
in this branch's codebase (confirmed via grep: zero hits). This proves the run hit
`apps/e2e/playwright.config.ts`'s **default** `baseURL` (`E2E_BASE_URL ?? 'https://remix-kinnso-web.vercel.app'`
— i.e. live production), not this unmerged branch's own code, since production has none
of R3A-1/R3A-2's changes yet. **So there are three things needed before this spec can
pass, not two**: (1) Stripe test-mode keys reachable by whichever deployment is under
test, (2) at least one experience with real `experience_availability` data, AND
(3) `E2E_BASE_URL` explicitly pointed at a deployment or local dev server that's actually
running this branch (a preview deployment of this PR, or `pnpm --filter web dev` locally
with `E2E_BASE_URL=http://localhost:3000`) — the default is prod, which won't have this
code until merge. None of these are fixable by code in this plan; all three are
operational/deploy-sequencing steps for whoever actually runs this spec.
