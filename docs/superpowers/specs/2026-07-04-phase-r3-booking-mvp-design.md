# Phase R3 — Booking MVP: Design

**Date:** 2026-07-04
**Status:** Locked (user-approved 2026-07-04) — D-R3-1 approved as proposed; Stripe
kept in test mode for now (§8.1); seed content added (§1) to unblock a demoable booking
flow ahead of real supply.
**Parent:** `docs/superpowers/specs/2026-07-02-product-revision-program-design.md` (§6 R3)
**Scope:** apps/web, supabase/migrations, one new scheduled job. Charter (master §6):
traveller role + guest checkout; availability calendar; Stripe Checkout + webhook;
`/trips`; merchant booking pipeline (pending/confirmed/completed) with "Booked via
[Creator]"; booking commission ledger → existing payout queue; embedded experience CTAs
in guides and articles; Travelpayouts ingestion wiring; bookings count joins the
social-proof bar. Exit (master §6): a traveller can discover → book → pay; a creator
sees the commission; a merchant sees the attributed booking.

---

## 1. Ground truth (surveyed 2026-07-04, post-R2C tree + live DB)

- **Supply was not seeded as of the survey; seed content added 2026-07-04.** Live DB
  had 2 active merchants, **0 published experiences**, 0 published testimonials
  (3 draft) at survey time. 5 published test experiences have since been added across
  the 5 hero destinations (Tokyo, Seoul, Bali, Bangkok, Chiang Mai), split across the 2
  existing active merchants (Sunrise Stays HK, Wanderpack Gear) — real testimonials are
  still 0/3 published (§8.4). This is clearly-fake demo content, not real merchant
  supply; the R2 exit criterion (real merchants/experiences, ops-sourced) is still
  unmet and remains a pre-public-launch blocker (§7).
- **No Stripe integration exists anywhere.** No SDK dependency in any `package.json`,
  no `STRIPE_*` env var, no `app/api/stripe*` route. Confirmed clean by full-repo grep;
  only mentions are in planning docs listing it as deferred. This is a from-scratch build.
- **`ViewerRole` today is `'anon' | 'creator' | 'creator-pending' | 'merchant' | 'ops'`**
  (`lib/auth/viewer-role.ts:3`; `'creator-pending'` is declared but never produced —
  dead union member). `resolveViewerRole`/`useViewerRole` resolve ops → merchant →
  **unconditional `'creator'` fallback** — they do not check whether the `creators` row
  represents a real, onboarded creator. Every signed-up user gets a blank `creators` row
  via `handle_new_user()` (`supabase/migrations/20260614...creator_auth_trigger.sql`,
  `insert into creators (id) values (new.id) on conflict do nothing`). This is the crux
  of D-R3-1 below: the master spec's "`'traveler'` is default for sign-ups with **no
  creator row**" doesn't hold today, because *everyone* already has a creator row.
- **`experiences` (R2) is the anchor entity for booking.** Schema, RLS (fixed via
  `app_private.merchant_is_active()`), and the `merchants_public_profiles` PII-safe-view
  pattern are all live. `/experiences/[slug]` currently renders a static "Booking opens
  soon" badge (`ExperiencePublicView.tsx:45-48`) with deliberately no Product/Offer
  JSON-LD (design spec §D-R2-6: never claim bookability before it exists) — R3 is
  exactly the phase that makes that claim true.
- **Money-settlement precedent is solid and reusable.** `mission_settlements` +
  `admin_set_settlement_status` (SECURITY DEFINER, `is_active_ops()`-gated, reason-
  required, row-locked, rank-based transition matrix, `p_allow_revert` escape hatch) +
  `ops_audit_log_append()` is the exact template for a booking commission ledger.
  Currency is **never** summed across currencies anywhere in the codebase — grouped
  into `{currency, amount}[]` buckets (`creators-queries.ts`) — this house rule carries
  through unchanged.
- **The anon-safe gated-read pattern is established**: `app_private.merchant_is_active()`
  / `app_private.is_mission_participant()` — a SECURITY DEFINER helper in a locked-down
  `app_private` schema, called from an RLS `USING` clause, so anon never needs a direct
  grant on the table being checked. Every new anon-readable policy in R3 (`bookings`
  confirmation lookup, `experience_availability` public read) must follow this shape.
- **No guest/anon money or booking precedent exists.** The only true anon-write
  precedent is `agent_waitlist` (insert-only, no money, explicitly documented as a §7
  deviation from the audited-RPC rule). Guest checkout in R3 is a **new** category:
  anon can trigger a Stripe Checkout Session and later needs to read back *their own*
  booking with no auth session — this needs a fresh, narrow security pattern (§2.2).
- **API route conventions**: three routes exist (`copilot`, `health`, `revalidate`).
  `revalidate/route.ts`'s shared-secret-header pattern (no Supabase session, uniform
  `NextResponse.json({...}, {status})`, try/catch around raw body parsing) is the closer
  template for `/api/stripe/webhook` than `copilot`'s session-based auth — a Stripe
  webhook authenticates via signature verification on the **raw** request body, which no
  existing route currently needs (`req.text()`, not `req.json()`).
- **Guides have no reverse cross-link module.** Articles embed guides today
  (`ArticleGuideLinks.tsx`, city/tag heuristic match, capped at 3, `getGuidesForRegions`).
  Guides embed nothing. Both need a symmetric "embedded experience CTA" component;
  articles get a sibling to `ArticleGuideLinks` in the same slot, guides get a wholly new
  slot in the left column before the creator `<aside>`.
- **`platform_stats()` already has a stub comment**: "Deliberately NO bookings count
  until R3 ships direct booking" — the RPC, query wrapper, threshold map, and `StatsBar`
  component are all designed to make this a small, additive change.
- **Travelpayouts ingestion is inert**: `normalizeTravelpayoutsAction()` has no
  production caller; `affiliate_network_events` exists and is RLS'd; catalog program ids
  in `offer-catalog.ts` are explicit placeholders (`tp-booking-com`, etc.) needing real
  Travelpayouts campaign ids. `apps/sync` is an unrelated legacy MySQL/FOSO worker — not
  a natural home for this job.
- **Testing precedent**: R2 established a clean `*-queries.test.ts` /
  `*-actions.test.ts` / `*.host.test.tsx` layering, Supabase always mocked in unit tests
  except one raw-SQL-assertion migration test. **No e2e spec exists yet for merchant or
  experience flows** — R3 is the first phase that needs a real Playwright booking-funnel
  spec (master spec §7 already requires this), so it starts from zero, not from an
  extension of an existing spec.

## 2. Phase decisions

### D-R3-1 · Traveler role mechanism: redefine "creator" by completion, not row existence

**Problem:** the master spec assumes `'traveler'` becomes the default for "sign-ups
with no creator row," but every sign-up already gets a blank `creators` row via
`handle_new_user()`. Taken literally, nobody would ever resolve to `'traveler'`.

**Chosen: redefine the creator-fallback check to require an *onboarded* creator, not a
row.** Concretely: `resolveViewerRole`/`useViewerRole`'s fallback branch changes from
"else `'creator'`" to "if `creators.handle is not null` then `'creator'`, else
`'traveler'`" — reusing the exact predicate `platform_stats()` already uses for
`active_creators` (`status='active' and handle is not null and public_profile is not
null`; R3 only needs the `handle is not null` half, since a mid-onboarding user with a
handle but no finished profile should probably still read as `'creator'`, not flip to
`'traveler'` mid-flow — final predicate is a plan-phase detail, not re-litigated here).
`handle_new_user()` is extended (new migration, not editing the shipped one) to *also*
insert a `traveler_profiles` row alongside the existing blank `creators` row (same
`on conflict (user_id) do nothing` shape) — every signed-up user ends up with both rows;
which one is "live" is a resolver-level decision, not a row-existence one. This is the
minimal-blast-radius option: it doesn't touch the onboarding flow, the `creators` table,
or any existing creator-gated page; it only changes what the fallback branch checks.

**Rejected alternative:** stop auto-creating a `creators` row on sign-up and create
`traveler_profiles` instead, promoting to `creators` only when onboarding starts. Cleaner
in principle, but it's a bigger structural change to a trigger that's been stable since
Phase 1, and risks breaking any code that assumes a `creators` row always exists for an
authenticated user (the studio-scan surfaces, contribution-tier backbone, etc., per R1
carry-forwards). Deferred; flag as a future cleanup if the dual-row approach proves
awkward.

**Blast radius (flagged, not resolved here):** every existing test/page that implicitly
assumes "any authenticated non-merchant/non-ops user is a creator" needs re-auditing in
the plan phase — this is the single biggest regression-risk item in R3 (see §7).

### D-R3-2 · Guest checkout: capture at Stripe, confirm via unguessable ID, no accounts required

Guest bookings need **zero** `traveler_profiles` row (master spec explicit). Mechanism:

- Stripe Checkout Session collects the traveller's email natively (Stripe's own
  `customer_email` / Checkout-collected email) — no separate KINNSO form needed for the
  guest path itself.
- `bookings.traveler_user_id` is nullable; `bookings.guest_email` holds the guest's
  email for non-authenticated bookings. Exactly one of the two is set (CHECK
  constraint), mirroring how `mission_settlements` uses mutually-exclusive columns.
- **Confirmation/receipt access**: the Stripe Checkout success redirect includes the
  Checkout Session ID in the return URL (`/experiences/[slug]/booked?session_id=...`,
  standard Stripe pattern). The confirmation page reads the booking via a narrow
  SECURITY DEFINER RPC keyed on the (unguessable, Stripe-generated) session id — the
  "one sanctioned exception" precedent the master spec already establishes for the
  webhook route extends naturally to this one read path. No email/magic-link
  infrastructure is built for R3 — **Stripe's own built-in payment-receipt email**
  (configurable in the Stripe Dashboard, no KINNSO code) covers the "I lost the tab"
  case well enough for an MVP, same spirit as R2's "no email notification, status panel
  is the honest surface" call. Building KINNSO-native booking-lookup-by-email is a
  carry-forward.
- Abuse mitigation on the checkout-session-creation endpoint (anon-triggerable): rate
  limiting keyed on IP (mirrors the master spec's own IP-rate-limit requirement for the
  R4 agent endpoint — same shape, arrives one phase early here) since anyone could spam
  Checkout Session creation.

### D-R3-3 · Data model (new tables, all new timestamped migrations)

```
traveler_profiles
  user_id uuid pk references auth.users(id) on delete cascade
  display_name text
  locale text
  marketing_opt_in boolean not null default false
  created_at / updated_at

experience_availability
  id uuid pk default gen_random_uuid()
  experience_id uuid not null references experiences(id) on delete cascade
  date date not null
  capacity integer not null check (capacity >= 0)
  booked_count integer not null default 0 check (booked_count >= 0 and booked_count <= capacity)
  status text not null default 'open' check (open/closed)
  unique (experience_id, date)
  created_at / updated_at

bookings
  id uuid pk default gen_random_uuid()
  experience_id uuid not null references experiences(id)
  availability_id uuid not null references experience_availability(id)
  traveler_user_id uuid references auth.users(id)      -- nullable
  guest_email text                                      -- nullable
  -- check: exactly one of traveler_user_id / guest_email is set
  qty integer not null check (qty > 0)
  unit_amount numeric not null check (unit_amount >= 0)
  total_amount numeric not null check (total_amount >= 0)
  currency text not null                                -- per-currency house rule
  status text not null default 'pending_payment'
    check (pending_payment/confirmed/completed/cancelled/refunded)
  stripe_checkout_session_id text unique
  stripe_payment_intent_id text unique
  creator_id uuid references creators(id)               -- attribution, nullable (direct traffic)
  guide_id uuid references guides(id)                   -- attribution, nullable
  source_surface text check (guide/article/experience_page/direct)
  created_at / updated_at

booking_events                                          -- audit trail, ops_audit_log shape
  id uuid pk default gen_random_uuid()
  booking_id uuid not null references bookings(id) on delete cascade
  event_type text not null                              -- e.g. 'created','webhook_confirmed','ops_override'
  metadata jsonb
  created_at

booking_settlements                                     -- sibling to mission_settlements, NOT a generalization
  id uuid pk default gen_random_uuid()
  booking_id uuid not null references bookings(id)
  creator_commission_status text check (pending/paid) default 'pending'
  creator_commission_amount numeric check (>= 0)
  kinnso_commission_status text check (pending/paid) default 'pending'
  kinnso_commission_amount numeric check (>= 0)
  currency text not null
  updated_by_ops_member_id uuid references kinnso_ops_members(id)
  ops_note text
  created_at / updated_at
```

**Why `booking_settlements` is a sibling, not a generalized `mission_settlements`**
(master spec explicitly left this open): booking rows have no "mission" or
"affiliate-network event" concept — forcing them through `mission_settlements`'
mission-shaped columns (or nullable-ing half that table) would touch every existing
mission-settlement query/RPC/test for no shared benefit. A sibling table keeps the same
status-enum + leg-columns + currency-bucketed-array shape (so the ops UI/queries pattern
is copy-adaptable) with zero regression risk to Phase 9–12 surfaces — same reasoning
D-R2-1 used for `merchant_applications` over overloading `merchant_profiles.status`.

RLS: `experience_availability` — merchant-owner CRUD (via `experiences.merchant_profile_id`
ownership), public SELECT of open/future dates only (needs an
`app_private.experience_is_bookable()`-style helper, same shape as `merchant_is_active`).
`bookings` — owner (`traveler_user_id = auth.uid()`) SELECT own rows; merchant SELECT of
bookings on their own experiences (new `app_private.is_booking_merchant_owner()` helper,
same pattern); ops full access; guest rows reachable *only* via the session-id-keyed RPC
in D-R3-2, never a direct anon SELECT policy. `booking_settlements` — ops-only, same
shape as `mission_settlements`' RLS. All money-state transitions (`pending_payment` →
`confirmed` etc., and the settlement legs) go through SECURITY DEFINER RPCs following
`admin_set_settlement_status`'s rank-based transition-matrix pattern — **the webhook
handler is the one write path that flips `bookings.status` outside an ops action**, and
it must itself call through a `confirm_booking_from_webhook()` RPC (SECURITY DEFINER,
idempotent on `stripe_payment_intent_id`) rather than writing the table directly, so the
audit trail (`booking_events`) is populated consistently regardless of caller.

### D-R3-4 · Stripe integration shape

- **Checkout Session creation**: a server action (not a route) on `/experiences/[slug]`,
  mirroring the existing owner-RLS server-action pattern rather than a new API route —
  creates the `bookings` row (`status='pending_payment'`) and the Stripe Checkout
  Session in the same call, storing `stripe_checkout_session_id` immediately so an
  abandoned checkout is still auditable.
- **Webhook**: `app/api/stripe/webhook/route.ts`. Follows `revalidate/route.ts`'s
  shape (no Supabase session; `NextResponse.json({...}, {status})` uniformly) but auth
  is Stripe signature verification (`stripe.webhooks.constructEvent` against the raw
  body via `req.text()` — new in this codebase, no route currently needs the raw body).
  Idempotency: `stripe_payment_intent_id unique` on `bookings` plus the
  `confirm_booking_from_webhook()` RPC no-ops on an already-confirmed booking rather than
  erroring, since Stripe redelivers events.
- **Refunds**: ops-console action (new tab on an existing surface, TBD in plan phase) —
  audited RPC + a real Stripe refund API call, mirroring the master spec's explicit call-
  out that this is the one ops-initiated Stripe-side mutation.
- **Env vars** (new): `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` (client-side,
  `NEXT_PUBLIC_`-prefixed only if Checkout is embedded rather than hosted-redirect — R3
  uses Stripe's **hosted** Checkout page per the master spec, so this may not even be
  needed client-side), `STRIPE_WEBHOOK_SECRET`. Added to `.env.example`; `.env.test`
  strategy TBD in plan phase — recommend mocking the Stripe SDK entirely in unit tests
  (consistent with "Supabase always mocked" house rule) and reserving real Stripe
  test-mode keys for the Playwright e2e booking-funnel spec only.

### D-R3-5 · `/trips` — traveller account area

Signed-in-only (guest bookings are not listed here — no account to attach them to; a
guest who later creates an account with the same email does **not** get retroactive
linking in R3 — carry-forward). Gated like `/studio`: `gate.ts` prefix, `notFound()` for
non-traveler/ops roles at the page level (though per D-R3-1, `'traveler'` is now the
default fallback, so this is really "any authenticated user without a more specific
role"), `noindexMetadata()`, `ROBOTS_DISALLOW` entry. Shows: booking list (upcoming/
past, status, experience + merchant links), and — per the master IA table — "saves"
(guide_saves is R6; `/trips` ships its saves tab empty/hidden until R6, not faked).

### D-R3-6 · Merchant booking pipeline

New tab under `/merchants/dashboard` (alongside Experiences, Profile): a bookings queue
scoped to the merchant's own experiences (`app_private.is_booking_merchant_owner()`),
showing status (pending_payment/confirmed/completed/cancelled/refunded), traveller
identity (name if signed-in, else masked guest email), qty, amount, and — the master
spec's explicit UX requirement — **"Booked via [Creator]"** attribution rendered from
`bookings.creator_id` → `creators.handle`/display name (nullable → "Direct"). Merchants
can mark `confirmed → completed` (post-experience, day-of-or-after) via a scoped RPC;
they cannot self-cancel-with-refund (that's ops-only, since it touches Stripe money).

### D-R3-7 · Embedded experience CTAs (closing the creator loop, master spec §6.3)

- **Articles**: new `ArticleExperienceLinks` component, sibling to
  `ArticleGuideLinks` at the same slot (`page.tsx:96`), same `regions`/`tag_slugs`
  heuristic, querying `experiences` by `city` (capped at 3, published + bookable-merchant
  only).
- **Guides**: new component in the left column of the guide detail page (after the
  summary block, before the creator `<aside>`) — guides have no reverse cross-link
  today, so this is a new slot, not an extension. Query keyed on the guide's own `city`.
  **Attribution**: an experience CTA click from a guide page should carry that guide's
  `creator_id`/`guide_id` through to the eventual booking (D-R3-3's attribution columns)
  — mechanism (query param vs. session-stored referrer) is a plan-phase detail, but the
  requirement is fixed here: attribution must survive the redirect to Stripe and back.

### D-R3-8 · Social-proof bar: bookings count

New migration (never editing the shipped `r1b_platform_stats_testimonials.sql`) adds a
`completed_bookings` column to `platform_stats()`. `getPlatformStats()` maps it,
`STAT_THRESHOLDS` gets an entry (exact number is a plan-phase/product call — should be
low given the cold-start reality in §7), `StatsBar` renders a fourth entry when above
threshold. New i18n string ×7 locales.

### D-R3-9 · Travelpayouts repair job

**Chosen: a Vercel Cron-triggered API route in `apps/web`**
(`app/api/cron/travelpayouts-sync/route.ts`), authenticated via a shared-secret header
compared against `process.env.CRON_SECRET` — the exact same pattern already proven by
`revalidate/route.ts`, and Vercel Cron is the natural fit since `apps/web` already
deploys there (per project CLAUDE.md). Calls `normalizeTravelpayoutsAction()` for each
fetched Travelpayouts action, upserts into `affiliate_network_events` (existing table,
already RLS'd and grant-safe).

**Rejected alternative**: extend `apps/sync` (the existing scheduled-worker app). It's
architecturally a MySQL/FOSO content-sync Hono service with zero conceptual overlap with
affiliate ingestion; bolting Travelpayouts onto it would mix two unrelated data domains
in one deploy target for no shared benefit. A same-repo, same-deploy-target Vercel Cron
route is simpler and lower-risk.

Real Travelpayouts campaign ids to replace the `offer-catalog.ts` placeholders are a
**user/business action item** (§8) — cannot be fabricated in code.

## 3. i18n

New groups: `booking` (checkout flow, confirmation page, guest-vs-signed-in copy),
`trips` (traveller account area), `merchantBookings` (dashboard pipeline tab, "Booked
via" copy), plus additions to `home` (bookings stat label) and `experiences` (real
booking widget replacing "booking opens soon" copy — that key retires). All strings ×7
locales per house rules; parity test picks up new groups automatically via
`Object.keys(en)`.

## 4. Security invariants

1. **Payment correctness is the highest-stakes code in the program so far.** Webhook
   signature verification and idempotency are non-negotiable acceptance criteria, not
   nice-to-haves — no booking ever flips to `confirmed` except via the signature-
   verified webhook path (a test-mode manual "mark confirmed" ops override exists but is
   itself an audited RPC, never a direct table write).
2. **Guest data minimalism**: `guest_email` is the only PII stored for unauthenticated
   bookings; no guest row is ever created outside `bookings` itself; the session-id-keyed
   confirmation RPC returns only booking-summary fields, never other bookings by the same
   email (no email-based cross-booking lookup in R3 — that's the deferred "native
   lookup" carry-forward from D-R3-2).
3. **Anon-safe gating follows the `app_private.*_is_active()` template** for every new
   RLS policy that needs to check a related table's status — no direct anon subquery on
   `merchant_profiles`/`experiences`/`experience_availability` from another table's
   policy.
4. **Money-state transitions are RPC-only, audited, reason-required for ops actions**,
   rank-based transition matrix with an explicit revert escape hatch, exactly like
   `admin_set_settlement_status`. Currency is never summed across currencies anywhere in
   new booking-ledger code or UI.
5. **No service-role in request paths** except the Stripe webhook (documented exception,
   per master spec §5.1) — this remains the *only* exception; the checkout-session-
   creation server action and the confirmation-lookup RPC both operate under normal
   RLS/SECURITY DEFINER patterns, not service-role.
6. Rate-limit the anon-reachable checkout-session-creation path (IP-based), same spirit
   as the master spec's R4 agent rate-limit requirement.

## 5. Testing

Per-slice, following R2's layering: `*-queries.test.ts` / `*-actions.test.ts` /
`*.host.test.tsx`, Stripe SDK mocked in all unit tests (never hit real Stripe from
vitest), a raw-SQL-assertion migration test for the webhook-confirmation RPC (mirrors
`db.r1b-migration.test.ts`'s pattern) asserting SECURITY DEFINER/idempotency shape.
**New this phase**: a real Playwright e2e booking-funnel spec (`apps/e2e/specs/
booking.spec.ts`) using Stripe test-mode fixtures — the master spec explicitly requires
this and no equivalent exists yet for any R2 surface, so this is genuinely new
infrastructure, not an extension. Anon-negative tests: guest cannot read another
booking by guessing IDs sequentially (assert UUIDs, not sequential ids — already true by
construction via `gen_random_uuid()`, but worth an explicit test given the stakes).
i18n + route parity as usual. Scoped runs via `cd apps/web && npx vitest run <pattern>`.

## 6. Out of scope (R3)

Stripe Connect auto-splits (master program-level deferral) · booking-lookup-by-email for
returning guests (carry-forward from D-R3-2) · retroactive guest→account booking linking
· ops experiences console tab (still an R2 carry-forward, not resolved here) · saves
(`guide_saves`, R6) · reviews (R6) · `/destinations` going real (R6) · native session
player (out of program) · dynamic pricing/multi-date-range availability rules beyond a
simple per-date capacity row · KINNSO-native email receipts (Stripe's own receipt email
covers R3; carry-forward).

## 7. Risks

| Risk | Mitigation |
|------|------------|
| **Zero published experiences today** (2 active merchants, 0 published experiences) — R3's own exit criterion ("a traveller can discover → book → pay") is unattainable at current supply | Same as R2's unresolved exit criterion: seed real merchants/experiences across the 5 hero destinations *before* R3's public surfaces go live. This is a content/ops task, not code, and should be sequenced to land before the last R3 slice ships publicly. Flagged to user in §8. |
| Stripe account/KYC readiness unknown — R2's design doc asked the user to kick this off at R2 start | Confirm current status before starting the payments slice (§8) — R3 can be built and tested in Stripe **test mode** without KYC, but a public launch needs live-mode readiness. |
| Traveler-role redefinition (D-R3-1) has wide blast radius across existing creator-gated pages/tests | Plan phase must enumerate every place that assumes "authenticated non-merchant/non-ops = creator" before touching the resolver; ship behind a host-test sweep, not a single spot-check. |
| Webhook bugs / duplicate delivery causing double-confirmation or missed payments | Idempotency via unique `stripe_payment_intent_id` + no-op-on-repeat RPC; e2e coverage is an acceptance criterion, not optional. |
| Guest checkout abuse (anon-triggerable Checkout Session creation) | IP rate limiting on the creation path (D-R3-2). |
| SEO regression: claiming bookability before it's real | JSON-LD (Product/Offer or Trip schema) only ships once a real experience with real availability exists — same honesty rule as R1/R2. |
| Scope size — R3 is larger than R1 or R2 (new payment rail + role change + 5 UI surfaces + a scheduled job) | Split into sub-phases per §2's dependency order (see plan-phase note below) rather than one PR, same operating model as R1(A+B)/R1C and R2A/B/C. |

Suggested sub-phase split for the plan phase (not locked here, but the dependency
ordering is real): **R3A** — role change + full data model + Stripe Checkout/webhook +
the actual booking widget replacing "booking opens soon" (the single riskiest, most
observable slice — mirrors R2A's "independently shippable, starts the hard part early"
rationale). **R3B** — merchant booking pipeline + booking commission ledger + `/trips`.
**R3C** — embedded experience CTAs in guides/articles + social-proof bookings count +
Travelpayouts repair job (loop-closure + instrumentation, no schema risk beyond one
additive `platform_stats` column).

## 8. User action items (outside the codebase)

1. **Stripe account status** — what's the current state of the Stripe HK account/KYC
   R2's design doc asked to kick off? R3 code can proceed in test mode regardless, but
   this gates any real public launch and the live-mode env vars.
2. **Seed real supply** — 5 hero destinations need real published merchants +
   experiences before R3's public booking surfaces go live (R2's own unmet exit
   criterion; today: 2 active merchants, 0 published experiences).
3. **Real Travelpayouts campaign ids** to replace the placeholders in
   `offer-catalog.ts` (D-R3-9) — cannot be fabricated in code.
4. **Publish real testimonials** via `/admin/testimonials` — still 0 published (3
   draft), an R1 leftover that keeps recurring across phase reviews.
5. Confirm the `CRON_SECRET` env var convention (new, for D-R3-9) is acceptable, or
   state a preference for a different scheduled-job mechanism.
