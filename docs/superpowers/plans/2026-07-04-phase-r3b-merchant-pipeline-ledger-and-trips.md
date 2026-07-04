# Phase R3B — Merchant Booking Pipeline, Commission Ledger & /trips — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give merchants a bookings queue for their own experiences, give ops a commission
ledger + refund/cancel authority, and give travellers a `/trips` account area — closing
out the R3 booking MVP's remaining UI/ledger surfaces on top of R3A-1's schema and
R3A-2's Stripe checkout/webhook/widget.

**Architecture:** Four new timestamped migrations (settlement table + trigger, settlement
status RPC, merchant booking access + completion RPC, ops cancel/refund RPC), a new
`apps/web/lib/bookings/` domain module (queries/actions/types), a merchant dashboard tab,
a new Operator Console ("Bookings") tab, a signed-in-only `/trips` page, and a fix to a
documented R3A-2 carry-forward bug that only becomes reachable once this phase ships a
real cancel/refund path.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase
Postgres (RLS + SECURITY DEFINER RPCs), Vitest, existing `@kinnso/db` generated types.

**Parent spec:** `docs/superpowers/specs/2026-07-04-phase-r3-booking-mvp-design.md`
(§D-R3-5 `/trips`, §D-R3-6 merchant pipeline, §D-R3-3 `booking_settlements` draft schema).
**Builds on:** `feat/revision-r3a1` branch tip (`0393d8c`), which already contains R3A-1
(traveler role + booking-core schema) and R3A-2 (Stripe Checkout + webhook + booking
widget) — **not yet merged to `main`**; see "Ground truth" §0 below.

---

## 0. Ground truth (surveyed 2026-07-04, this session, against live DB `scryfkefedzuetfdtrvl` + the `feat-revision-r3b` worktree)

- **Branch state**: `main` has R3A-1 only (PR #70, squash `b82a169`). R3A-2 (PR #71)
  merged into the `feat/revision-r3a1` branch, **not** `main` — there is currently no
  open PR bringing R3A-2 into `main`. This plan's branch (`feat/revision-r3b`) is cut
  from `feat/revision-r3a1`'s current tip (`0393d8c`, has both R3A-1+R3A-2), matching
  this program's established stacking precedent. Landing R3A-2 in `main` is a separate,
  pre-existing to-do, not part of this plan.
- **`bookings` schema (live, confirmed via direct SQL query)**: `id, experience_id,
  availability_id, traveler_user_id, guest_email, qty, unit_amount, total_amount,
  currency, status, stripe_checkout_session_id, stripe_payment_intent_id, creator_id,
  guide_id, source_surface, created_at, updated_at`. `status` check constraint:
  `pending_payment|confirmed|completed|cancelled|refunded`. XOR constraint on
  `traveler_user_id`/`guest_email` confirmed live.
- **`creator_id`/`guide_id` are structurally present but semantically null.** R3A-2's
  checkout action (`apps/web/lib/experiences/booking-actions.ts`) never populates them;
  `source_surface` is hardcoded to `'experience_page'`. Real attribution wiring is R3C's
  job (query-param/referrer mechanism from guide/article CTAs). **This phase's merchant
  "Booked via [Creator]" UI must render "Direct" for the null case as the common case
  today, not the exception.**
- **`booking_settlements` does not exist.** Confirmed via live `information_schema` query
  and full-migration grep — this is genuinely new schema work.
- **No commission-rate concept exists anywhere applicable to bookings.** `experiences`
  has no rate column (`price_amount`, `currency` only). `commission_rate`-shaped columns
  (`affiliate_commission_rate`, `creator_commission_rate`, `kinnso_commission_rate`) exist
  only on `missions`, a per-listing negotiated-affiliate model that doesn't fit direct
  bookings. See PD-R3B-1.
- **`bookings` RLS has no merchant-facing SELECT policy at all today.** Confirmed via
  `pg_policies`: only `bookings_owner_select` (traveler), `bookings_ops_select` (ops),
  and the two INSERT policies (`bookings_owner_insert`, `bookings_guest_insert`) exist.
  **A merchant cannot read bookings on their own experiences today** — this is the
  concrete gap "merchant booking pipeline" fills, not a hypothetical.
- **`mission_settlements` is the exact template**, verified verbatim (not paraphrased)
  via `pg_get_functiondef`: `admin_set_settlement_status()`'s rank-based transition
  matrix (`not_started(0) < pending(1) < partially_paid(2) < paid(3)`, `disputed` as a
  side-state, per-leg `pending→paid` requiring `p_allow_revert` to reverse), gated by
  `is_active_ops_role('admin')` (a rank-checking helper: `analyst=1, moderator=2,
  admin=3, owner=4`), and `ops_audit_log_append(entity_type, entity_id, action, reason,
  metadata)` for the audit trail. Full bodies quoted in §2 below where mirrored.
- **`mission_settlements` has THREE payout/commission legs** (`creator_payout_status`,
  `kinnso_commission_status`, `affiliate_commission_status`) plus separate
  `merchant_invoice_status`/`merchant_payment_status` columns for money flowing **into**
  Kinnso from merchants (the affiliate-mission model: merchant pays Kinnso, Kinnso pays
  out creator+affiliate, keeps a cut). **Booking money flows the opposite direction**:
  the traveller pays Kinnso directly via Stripe (platform-collects, D5), so Kinnso then
  owes the **merchant** a payout (they delivered the experience) in addition to the
  creator commission and its own cut. The R3 design spec's own D-R3-3 draft schema
  omitted the merchant-payout leg entirely — see PD-R3B-1's schema below, which adds it.
- **Confirmed live**: `confirm_booking_from_webhook()`'s exact body (via
  `pg_get_functiondef`) — looks up the booking by `stripe_checkout_session_id`, is a
  no-op if `status <> 'pending_payment'` (idempotent), sets `status='confirmed'` +
  `stripe_payment_intent_id`, increments `experience_availability.booked_count` via
  `least(booked_count + qty, capacity)`, logs a `booking_events` row
  (`'webhook_confirmed'`, plus `'overbooked'` if the clamp engaged). **This phase does
  not modify this function** — see PD-R3B-3.
- **R3A-2's own documented carry-forwards** (from
  `docs/superpowers/plans/2026-07-04-phase-r3a2-stripe-checkout-and-booking-widget.md`,
  its final two review sections, quoted near-verbatim): (1) `stripe.checkout.sessions.
  create()` is called with no `idempotencyKey` — out of scope here, unrelated to this
  phase's surfaces; (2) **the booking confirmation page
  (`/experiences/[slug]/booked`) has only two visual states — `pending_payment` and a
  single "confirmed" fallthrough covering `confirmed`/`completed`/`cancelled`/
  `refunded`** — not fixed in R3A-2 because no code path could produce a
  `cancelled`/`refunded` booking yet. **This phase's ops cancel/refund RPC (Task 4)
  makes that reachable, so this phase must also fix the fallthrough (Task 10)** — it
  cannot ship a real cancel/refund action while knowingly leaving a stale confirmation
  page that would tell a refunded traveller "You're booked!".
- **`resolveViewerRole()`/`useViewerRole()` already resolve `'traveler'`** as the
  fallback (R3A-1 shipped this: ops → merchant → active-creator → traveler). No further
  role-resolver changes needed for `/trips`.
- **`gate.ts`** (`apps/web/lib/auth/gate.ts`) has a flat `gatedPrefixes` array (includes
  `'merchants/dashboard'`, `'studio/missions'`, `'ops/settlements'`, `'admin'`) —
  `/trips` needs `'trips'` added, following the exact same shape.
- **Operator Console (`/admin/*`) vs. legacy `/ops/settlements`**: `AdminShell.tsx`'s nav
  array (Dashboard, Creators, Merchants, Missions, Perks, Testimonials, Users, Team) is
  the actively-maintained console that Phases 10–13 all shipped into.
  `/ops/settlements` is an older, separate page (`messages.ops` as one shared i18n group,
  not per-feature) that predates the Operator Console and was never migrated in. See
  PD-R3B-2 for why the new ledger UI goes into `/admin`, not `/ops`.
- **Admin view-component convention confirmed**: `apps/web/components/kinnso/admin/
  merchants/MerchantApplicationsView.tsx` — admin views live under
  `components/kinnso/admin/<domain>/`, page wires `queries` + `actions` + the view.
- **Merchant dashboard is a 6-card grid**, not tabs (`MerchantDashboardHomeView.tsx`),
  linking to `/merchants/dashboard/{post,missions,creators,insights,experiences,
  profile}`. No "Bookings" card exists. Ownership pattern used throughout:
  `.eq('merchant_profile_id', merchantId)`.
- **`/trips`'s direct structural template**: `apps/web/app/[locale]/merchants/
  dashboard/missions/page.tsx` + `listMerchantMissions()` in
  `apps/web/lib/missions/queries.ts` — server component fetches via a scoped query
  function, maps to a view model, passes to a client view component.
- **i18n**: flat per-feature message-group interfaces (e.g. `MerchantApplyMessages`),
  enforced by `apps/web/tests/i18n.locale-parity.test.ts` (diffs dotted-key-paths of
  every top-level group across all 7 locale files against `en.ts`). New groups pass
  automatically once added to all 7 files with matching keys.
- **Navbar** (`apps/web/components/kinnso/Navbar.tsx`): a role-keyed CTA switch
  (`creator`→Studio, `creator-pending`→apply, `merchant`→post mission, else→sign-up).
  No `'traveler'` branch exists — falls through to the generic sign-up CTA today, which
  is wrong once `/trips` exists.

## 1. Phase decisions

### PD-R3B-1 · Fixed platform-wide commission rates; new 3-leg `booking_settlements`

**Chosen:** `booking_settlements` gets three legs — `merchant_payout` (always applies),
`creator_commission` (nullable; only when `bookings.creator_id` is set), `kinnso_commission`
(always applies) — computed at settlement-creation time from two **fixed, hardcoded**
rate constants: `KINNSO_COMMISSION_RATE = 0.10`, `CREATOR_COMMISSION_RATE = 0.10`.
Merchant payout is the remainder: `total_amount - kinnso_commission_amount -
coalesce(creator_commission_amount, 0)`. A direct (no-creator) booking nets the merchant
90%; a creator-attributed booking nets the merchant 80%, creator 10%, Kinnso 10%.

**Rationale:** no per-experience or platform commission-rate column exists anywhere
today (confirmed: `experiences` has no such field; the only `commission_rate`-shaped
columns live on `missions`, a negotiated-per-listing affiliate model that doesn't apply
here). Building merchant-configurable rates would mean a new `experiences` schema
column + form UI, expanding this phase well beyond "pipeline + ledger + /trips."

**Rejected:** per-experience merchant-set commission rate. Deferred as a carry-forward —
flag to product if per-merchant rate negotiation is ever wanted; until then a flat rate
ships the ledger correctly today with zero new UI.

### PD-R3B-2 · Ledger and refund UI ship in the Operator Console (`/admin`), not `/ops`

**Chosen:** the new ops-facing bookings/settlements tab is `/admin/bookings`, added to
`AdminShell`'s nav, with its own `bookingsOps` i18n group — following the Phase 10–13
Operator Console pattern exactly (query module + action module + `admin/bookings/
AdminBookingsView.tsx`), not the older `/ops/settlements` page.

**Rationale:** `/ops/settlements` is a single-shared-`messages.ops`-group legacy page
that predates the Operator Console and was never migrated into `AdminShell`; all
actively-developed admin surfaces (Creators, Merchants, Missions, Team — Phases 10–13)
live in `/admin`. Extending the legacy surface would create a second, inconsistent admin
pattern for no benefit.

### PD-R3B-3 · Settlement auto-created via a new trigger, not by editing `confirm_booking_from_webhook()`

**Chosen:** a new `AFTER UPDATE OF status ON bookings` trigger fires whenever a row
transitions `pending_payment → confirmed`, computing and inserting the
`booking_settlements` row (PD-R3B-1's math) plus a `booking_events` row.
`confirm_booking_from_webhook()` (R3A-2, already shipped + reviewed APPROVE) is not
touched.

**Rationale:** guarantees a settlement row is created no matter which code path confirms
a booking — today that's only the webhook, but the R3 design spec itself notes a future
"test-mode manual mark-confirmed ops override" could exist. A trigger removes the need
to remember to call a second RPC from every future confirmation path, and avoids
`CREATE OR REPLACE`-ing already-reviewed R3A-2 code (lower blast radius, same reasoning
D-R3-1 used for the traveler-role fallback).

**Rejected:** extending `confirm_booking_from_webhook()` directly with inline settlement
logic. Works today (only one confirmation path exists) but couples two concerns in one
function and re-opens already-approved code for no correctness gain.

### PD-R3B-4 · Merchant completion is a non-ops, ownership-gated RPC; ops cancel/refund is a separate, `admin`-rank RPC

`mark_booking_completed(p_booking_id)` is gated by **experience ownership** (mirrors
`experience_availability_owner_all`'s `EXISTS ... merchant_profiles.user_id = auth.uid()`
shape), not `kinnso_ops_members` — a merchant marking their own delivered experience
complete is not an ops action. `admin_cancel_and_refund_booking(...)` mirrors
`admin_set_settlement_status`'s gate exactly (`is_active_ops_role('admin')`,
reason-required) since it touches real Stripe refund money — same authorization bar as
the mission-settlement money RPC.

### PD-R3B-5 · Refund is a two-step app-layer + RPC call, not RPC-only

The actual Stripe refund API call cannot happen inside Postgres. Shape: ops clicks
"Cancel & refund" → server action (1) calls `stripe.refunds.create(...)`, then (2) calls
`admin_cancel_and_refund_booking(booking_id, stripe_refund_id, reason)` to atomically
flip `bookings.status`, mark the settlement `disputed`, and log the audit trail. If the
Stripe call fails, the RPC is never invoked — no partial DB state. A Stripe-succeeds-but-
RPC-fails race is a documented, accepted risk (§8 carry-forward), consistent with this
program's existing "document, don't over-engineer every edge case" pattern (cf. R3A-2's
own accepted gaps).

### PD-R3B-6 · `booking_settlements` is ops-only; no merchant/creator direct read

Unlike `mission_settlements` (merchant + creator + ops can all `SELECT`, since mission
participants negotiate/track their own affiliate payout), `booking_settlements` RLS is
**ops-only** for all operations. Merchants see booking status + qty/amount + "Booked via
[Creator]" attribution through `bookings` itself (via the new merchant-select policy,
Task 3) — not the commission breakdown. There is nothing merchant/creator-actionable in
seeing the ledger split since rates are fixed platform-wide (PD-R3B-1), not negotiated.

**Flagged, not resolved here:** the R3 program's own exit criterion "a creator sees the
commission" is not satisfied by this phase — no creator-facing "commission earned from
bookings" view exists yet. The master spec's suggested split names R3C as "embedded
experience CTAs + social-proof bookings count + Travelpayouts repair job," which doesn't
cover this either. **Carry-forward**: the natural home is likely the existing studio
Insights/Payouts surface (Phase 8/10D) gaining a booking-commission line once real
attribution (R3C) exists — out of scope for this plan.

## 2. Data model

```sql
-- New table
booking_settlements
  id uuid pk default gen_random_uuid()
  booking_id uuid not null unique references bookings(id) on delete cascade
  status text not null default 'not_started'
    check (status in ('not_started','pending','partially_paid','paid','disputed'))
  merchant_payout_status text not null default 'pending' check (in ('pending','paid'))
  merchant_payout_amount numeric not null check (>= 0)
  creator_commission_status text check (in ('pending','paid'))       -- nullable: no creator leg on direct bookings
  creator_commission_amount numeric check (>= 0)                      -- nullable
  kinnso_commission_status text not null default 'pending' check (in ('pending','paid'))
  kinnso_commission_amount numeric not null check (>= 0)
  currency text not null
  updated_by_ops_member_id uuid references kinnso_ops_members(id)
  ops_note text
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()

-- New RLS (ops-only, all commands) — see PD-R3B-6
-- New policy on the EXISTING bookings table — see "Ground truth" gap above
bookings_merchant_select: merchant can SELECT where experience_id is one of their own
```

## 3. Security invariants (carried from the master spec §4, re-affirmed for this phase)

1. Every money-state transition remains RPC-only, audited, reason-required for ops
   actions, rank-based, with an explicit revert path where reversal is legitimate
   (mirrors `admin_set_settlement_status` exactly).
2. Currency is never summed across currencies in any new ledger query/UI — bucket by
   `{currency, amount}[]` if aggregating across bookings (house rule, unchanged).
3. No service-role in request paths introduced by this phase — the merchant completion
   RPC and ops cancel/refund RPC both run under normal RLS/SECURITY DEFINER patterns
   from an authenticated session, exactly like `admin_set_settlement_status`.
4. `booking_settlements` is reachable only via ops RLS + the two new RPCs — no direct
   anon or merchant/traveler grant, ever (PD-R3B-6).
5. The Stripe refund call happens before, and independently of, the DB-side RPC
   (PD-R3B-5) — the RPC never itself calls out to Stripe.

---

## Task 1: `booking_settlements` table + RLS + auto-create trigger

**Files:**
- Create: `supabase/migrations/20260704140000_r3b_booking_settlements_and_trigger.sql`
- Test: `apps/web/tests/db.r3b-settlement-trigger.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260704140000_r3b_booking_settlements_and_trigger.sql

create table public.booking_settlements (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started','pending','partially_paid','paid','disputed')),
  merchant_payout_status text not null default 'pending'
    check (merchant_payout_status in ('pending','paid')),
  merchant_payout_amount numeric not null check (merchant_payout_amount >= 0),
  creator_commission_status text
    check (creator_commission_status in ('pending','paid')),
  creator_commission_amount numeric check (creator_commission_amount >= 0),
  kinnso_commission_status text not null default 'pending'
    check (kinnso_commission_status in ('pending','paid')),
  kinnso_commission_amount numeric not null check (kinnso_commission_amount >= 0),
  currency text not null,
  updated_by_ops_member_id uuid references public.kinnso_ops_members(id),
  ops_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.booking_settlements enable row level security;

create policy booking_settlements_ops_all on public.booking_settlements
  for all
  to authenticated
  using (public.is_active_ops())
  with check (public.is_active_ops());

-- Trigger: auto-create the settlement row the instant a booking is confirmed.
-- Fires regardless of which code path performs the confirmation (today: only
-- confirm_booking_from_webhook(); see PD-R3B-3 for why this is a trigger, not an
-- edit to that already-shipped function).
create or replace function public.create_booking_settlement_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kinnso_rate constant numeric := 0.10;
  v_creator_rate constant numeric := 0.10;
  v_creator_amount numeric;
  v_kinnso_amount numeric;
  v_merchant_amount numeric;
begin
  if new.status = 'confirmed' and old.status = 'pending_payment' then
    v_kinnso_amount := round(new.total_amount * v_kinnso_rate, 2);

    if new.creator_id is not null then
      v_creator_amount := round(new.total_amount * v_creator_rate, 2);
    else
      v_creator_amount := null;
    end if;

    v_merchant_amount := new.total_amount - v_kinnso_amount - coalesce(v_creator_amount, 0);

    insert into public.booking_settlements (
      booking_id, merchant_payout_amount, creator_commission_amount,
      creator_commission_status, kinnso_commission_amount, currency
    ) values (
      new.id, v_merchant_amount, v_creator_amount,
      case when new.creator_id is not null then 'pending' else null end,
      v_kinnso_amount, new.currency
    )
    on conflict (booking_id) do nothing;

    insert into public.booking_events (booking_id, event_type, metadata)
    values (new.id, 'settlement_created', jsonb_build_object(
      'merchant_payout_amount', v_merchant_amount,
      'creator_commission_amount', v_creator_amount,
      'kinnso_commission_amount', v_kinnso_amount
    ));
  end if;
  return new;
end;
$$;

create trigger booking_settlement_on_confirm
  after update of status on public.bookings
  for each row
  execute function public.create_booking_settlement_on_confirm();
```

- [ ] **Step 2: Apply the migration to the live project via Supabase MCP**

Use `apply_migration` with name `r3b_booking_settlements_and_trigger` against project
`scryfkefedzuetfdtrvl`. Do not hand-edit this file after applying — a mistake needs a
new migration, per house rule.

- [ ] **Step 3: Regenerate DB types**

Run: `pnpm --filter @kinnso/db gen`
Expected: `packages/db/types.ts` gains a `booking_settlements` entry under `Tables`, plus
the `create_booking_settlement_on_confirm` function is NOT listed (trigger functions
aren't in `Functions`, only callable RPCs are — this is expected, not a gap).

- [ ] **Step 4: Write the raw-SQL migration test** (mirrors `db.r1b-migration.test.ts`'s
pattern of asserting shape via direct SQL rather than through the app layer)

```typescript
// apps/web/tests/db.r3b-settlement-trigger.test.ts
import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

describe('booking_settlements trigger (integration, requires real Supabase project)', () => {
  it('auto-creates a settlement row with a null creator leg for a direct booking', async () => {
    const supabase = createClient(url, serviceKey)

    const { data: experience } = await supabase
      .from('experiences')
      .select('id, currency')
      .eq('status', 'published')
      .limit(1)
      .single()
    if (!experience) return // no published experience in this environment; skip

    const { data: availability } = await supabase
      .from('experience_availability')
      .select('id')
      .eq('experience_id', experience.id)
      .eq('status', 'open')
      .limit(1)
      .single()
    if (!availability) return

    const { data: booking } = await supabase
      .from('bookings')
      .insert({
        experience_id: experience.id,
        availability_id: availability.id,
        guest_email: 'r3b-trigger-test@example.com',
        qty: 1,
        unit_amount: 1000,
        total_amount: 1000,
        currency: experience.currency,
        status: 'pending_payment',
        stripe_checkout_session_id: `cs_test_r3b_${Date.now()}`,
        source_surface: 'experience_page',
      })
      .select('id')
      .single()
    expect(booking).toBeTruthy()

    await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', booking!.id)

    const { data: settlement } = await supabase
      .from('booking_settlements')
      .select('*')
      .eq('booking_id', booking!.id)
      .single()

    expect(settlement?.kinnso_commission_amount).toBe(100)
    expect(settlement?.creator_commission_amount).toBeNull()
    expect(settlement?.creator_commission_status).toBeNull()
    expect(settlement?.merchant_payout_amount).toBe(900)

    // cleanup
    await supabase.from('booking_settlements').delete().eq('booking_id', booking!.id)
    await supabase.from('bookings').delete().eq('id', booking!.id)
  })
})
```

- [ ] **Step 5: Run it**

Run: `cd apps/web && npx vitest run tests/db.r3b-settlement-trigger.test.ts`
Expected: PASS if a published experience with open availability exists in the test
project; otherwise the test self-skips via early `return` (matches this project's
existing convention for environment-dependent integration tests — do not force-seed
data as a side effect of a test run).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260704140000_r3b_booking_settlements_and_trigger.sql \
        packages/db/types.ts \
        apps/web/tests/db.r3b-settlement-trigger.test.ts
git commit -m "feat(db): booking_settlements table + auto-create trigger on confirm"
```

---

## Task 2: `admin_set_booking_settlement_status()` RPC

**Files:**
- Create: `supabase/migrations/20260704150000_r3b_admin_settlement_status_rpc.sql`
- Test: `apps/web/tests/db.r3b-settlement-status-rpc.test.ts`

- [ ] **Step 1: Write the migration** (mirrors `admin_set_settlement_status` verbatim —
confirmed live via `pg_get_functiondef` this session — with 3 legs instead of 3-plus-affiliate)

```sql
-- supabase/migrations/20260704150000_r3b_admin_settlement_status_rpc.sql

create or replace function public.admin_set_booking_settlement_status(
  p_id uuid,
  p_status text default null,
  p_merchant_payout_status text default null,
  p_creator_commission_status text default null,
  p_kinnso_commission_status text default null,
  p_allow_revert boolean default false,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text; v_mp text; v_cc text; v_kc text;
  v_changed jsonb := '{}'::jsonb;
  v_rank_to int; v_rank_from int;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if p_status is null and p_merchant_payout_status is null
     and p_creator_commission_status is null and p_kinnso_commission_status is null then
    raise exception 'no_change';
  end if;

  select status, merchant_payout_status, creator_commission_status, kinnso_commission_status
    into v_status, v_mp, v_cc, v_kc
    from public.booking_settlements where id = p_id for update;
  if not found then raise exception 'not_found'; end if;

  if p_status is not null and p_status is distinct from v_status then
    if p_status not in ('not_started','pending','partially_paid','paid','disputed') then
      raise exception 'bad_status';
    end if;
    v_rank_to   := case p_status when 'not_started' then 0 when 'pending' then 1 when 'partially_paid' then 2 when 'paid' then 3 else -1 end;
    v_rank_from := case v_status when 'not_started' then 0 when 'pending' then 1 when 'partially_paid' then 2 when 'paid' then 3 else -1 end;
    if p_status <> 'disputed' and v_status <> 'disputed'
       and v_rank_to < v_rank_from and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('status', jsonb_build_object('from', v_status, 'to', p_status));
  end if;

  if p_merchant_payout_status is not null and p_merchant_payout_status is distinct from v_mp then
    if p_merchant_payout_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if;
    if v_mp = 'paid' and p_merchant_payout_status = 'pending' and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('merchant_payout_status', jsonb_build_object('from', v_mp, 'to', p_merchant_payout_status));
  end if;

  if p_creator_commission_status is not null and p_creator_commission_status is distinct from v_cc then
    if v_cc is null then raise exception 'no_creator_leg'; end if;
    if p_creator_commission_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if;
    if v_cc = 'paid' and p_creator_commission_status = 'pending' and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('creator_commission_status', jsonb_build_object('from', v_cc, 'to', p_creator_commission_status));
  end if;

  if p_kinnso_commission_status is not null and p_kinnso_commission_status is distinct from v_kc then
    if p_kinnso_commission_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if;
    if v_kc = 'paid' and p_kinnso_commission_status = 'pending' and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('kinnso_commission_status', jsonb_build_object('from', v_kc, 'to', p_kinnso_commission_status));
  end if;

  if v_changed = '{}'::jsonb then raise exception 'no_change'; end if;

  update public.booking_settlements set
    status                     = coalesce(p_status, status),
    merchant_payout_status     = coalesce(p_merchant_payout_status, merchant_payout_status),
    creator_commission_status  = coalesce(p_creator_commission_status, creator_commission_status),
    kinnso_commission_status   = coalesce(p_kinnso_commission_status, kinnso_commission_status),
    ops_note                   = btrim(p_reason),
    updated_by_ops_member_id   = (select id from public.kinnso_ops_members where user_id = auth.uid() and status = 'active'),
    updated_at                 = now()
  where id = p_id;

  perform public.ops_audit_log_append('booking_settlement', p_id, 'booking_settlement.status', p_reason,
    v_changed || jsonb_build_object('allow_revert', coalesce(p_allow_revert, false)));
end;
$$;

revoke all on function public.admin_set_booking_settlement_status from public, anon, authenticated;
grant execute on function public.admin_set_booking_settlement_status to authenticated;
```

Note the explicit `revoke ... grant execute on function ... to authenticated` at the end
— **required** per this project's confirmed default-ACL gotcha (new functions
auto-grant EXECUTE to `anon`/`authenticated`; a bare `revoke all from public` does not
undo that auto-grant). The RPC's own internal `is_active_ops_role('admin')` check is the
real gate; granting to `authenticated` (not `anon`) lets any signed-in-but-non-ops caller
reach the function and get a clean `forbidden` error rather than a permission-denied at
the Postgres layer.

- [ ] **Step 2: Apply via Supabase MCP** (`apply_migration`, name
`r3b_admin_settlement_status_rpc`)

- [ ] **Step 3: Verify the grant is exactly right** (this project has a real prior
incident here — see the confirm_booking_from_webhook grant fix from R3A-2)

Run this query via the Supabase MCP `execute_sql` tool:

```sql
select grantee, privilege_type
from information_schema.role_routine_grants
where routine_name = 'admin_set_booking_settlement_status';
```

Expected: exactly one row, `grantee = 'authenticated'`, `privilege_type = 'EXECUTE'`. If
`anon` or `PUBLIC` appear, the revoke didn't take — re-check the migration's grant block
before proceeding.

- [ ] **Step 4: Write the RPC test**

```typescript
// apps/web/tests/db.r3b-settlement-status-rpc.test.ts
import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const anonKey = process.env.SUPABASE_ANON_KEY!

describe('admin_set_booking_settlement_status (integration)', () => {
  it('rejects an anon caller with forbidden, not a grant error', async () => {
    const anon = createClient(url, anonKey)
    const { error } = await anon.rpc('admin_set_booking_settlement_status', {
      p_id: '00000000-0000-0000-0000-000000000000',
      p_status: 'paid',
      p_reason: 'test',
    })
    expect(error).toBeTruthy()
    expect(error?.message).not.toMatch(/permission denied for function/i)
  })

  it('rejects a missing reason', async () => {
    const service = createClient(url, serviceKey)
    const { error } = await service.rpc('admin_set_booking_settlement_status', {
      p_id: '00000000-0000-0000-0000-000000000000',
      p_status: 'paid',
      p_reason: '',
    })
    expect(error?.message).toMatch(/reason_required/)
  })
})
```

- [ ] **Step 5: Run it**

Run: `cd apps/web && npx vitest run tests/db.r3b-settlement-status-rpc.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260704150000_r3b_admin_settlement_status_rpc.sql \
        apps/web/tests/db.r3b-settlement-status-rpc.test.ts
git commit -m "feat(db): admin_set_booking_settlement_status RPC"
```

---

## Task 3: Merchant read access to their own bookings + `mark_booking_completed()` RPC

**Files:**
- Create: `supabase/migrations/20260704160000_r3b_merchant_booking_access_and_completion.sql`
- Test: `apps/web/tests/db.r3b-merchant-booking-access.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260704160000_r3b_merchant_booking_access_and_completion.sql

-- Closes the confirmed gap: no merchant-facing SELECT policy exists on `bookings` today.
create policy bookings_merchant_select on public.bookings
  for select
  to authenticated
  using (
    experience_id in (
      select e.id from public.experiences e
      where e.merchant_profile_id in (
        select mp.id from public.merchant_profiles mp where mp.user_id = auth.uid()
      )
    )
  );

create or replace function public.mark_booking_completed(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_is_owner boolean;
begin
  select b.status,
    exists (
      select 1 from public.experiences e
      join public.merchant_profiles mp on mp.id = e.merchant_profile_id
      where e.id = b.experience_id and mp.user_id = auth.uid()
    )
  into v_status, v_is_owner
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then raise exception 'not_found'; end if;
  if not v_is_owner then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_status <> 'confirmed' then raise exception 'bad_transition'; end if;

  update public.bookings set status = 'completed', updated_at = now() where id = p_booking_id;

  insert into public.booking_events (booking_id, event_type, metadata)
  values (p_booking_id, 'merchant_completed', '{}'::jsonb);
end;
$$;

revoke all on function public.mark_booking_completed from public, anon, authenticated;
grant execute on function public.mark_booking_completed to authenticated;
```

- [ ] **Step 2: Apply via Supabase MCP** (`apply_migration`, name
`r3b_merchant_booking_access_and_completion`)

- [ ] **Step 3: Verify the grant** (same check pattern as Task 2 Step 3, routine name
`mark_booking_completed`)

- [ ] **Step 4: Regenerate DB types**

Run: `pnpm --filter @kinnso/db gen`

- [ ] **Step 5: Write the test**

```typescript
// apps/web/tests/db.r3b-merchant-booking-access.test.ts
import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

describe('mark_booking_completed (integration)', () => {
  it('rejects completing a booking that is not confirmed', async () => {
    const service = createClient(url, serviceKey)
    const { data: booking } = await service
      .from('bookings')
      .select('id')
      .eq('status', 'pending_payment')
      .limit(1)
      .maybeSingle()
    if (!booking) return // no pending_payment row in this environment; skip

    const { error } = await service.rpc('mark_booking_completed', { p_booking_id: booking.id })
    expect(error?.message).toMatch(/bad_transition/)
  })

  it('rejects a non-owner caller', async () => {
    const service = createClient(url, serviceKey)
    const { error } = await service.rpc('mark_booking_completed', {
      p_booking_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(error?.message).toMatch(/not_found|forbidden/)
  })
})
```

- [ ] **Step 6: Run it**

Run: `cd apps/web && npx vitest run tests/db.r3b-merchant-booking-access.test.ts`
Expected: PASS.

- [ ] **Step 7: Add `bookings_merchant_select`'s existence to the shared RLS regression
list** — this project's established convention after every phase's holistic review
(R2A added `merchant_applications` to the shared anon-cannot-read table list in
`mission.rls.test.ts` for the same reason: close the regression-test gap explicitly,
don't just rely on the migration being correct today).

Read `apps/web/tests/mission.rls.test.ts` to find the shared anon-cannot-read table
list (the array R2A extended), and add `'bookings'` and `'booking_settlements'` to it if
not already present from R3A-1/R3A-2. Confirm both still assert anon gets zero rows.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260704160000_r3b_merchant_booking_access_and_completion.sql \
        packages/db/types.ts \
        apps/web/tests/db.r3b-merchant-booking-access.test.ts \
        apps/web/tests/mission.rls.test.ts
git commit -m "feat(db): merchant booking read access + mark_booking_completed RPC"
```

---

## Task 4: `admin_cancel_and_refund_booking()` RPC

**Files:**
- Create: `supabase/migrations/20260704170000_r3b_admin_cancel_refund_booking.sql`
- Test: `apps/web/tests/db.r3b-cancel-refund-rpc.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260704170000_r3b_admin_cancel_refund_booking.sql

create or replace function public.admin_cancel_and_refund_booking(
  p_booking_id uuid,
  p_stripe_refund_id text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if coalesce(btrim(p_stripe_refund_id), '') = '' then raise exception 'refund_id_required'; end if;

  select status into v_status from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_status not in ('confirmed', 'completed') then raise exception 'bad_transition'; end if;

  update public.bookings
    set status = 'refunded', updated_at = now()
    where id = p_booking_id;

  update public.booking_settlements
    set status = 'disputed',
        ops_note = p_reason,
        updated_by_ops_member_id = (select id from public.kinnso_ops_members where user_id = auth.uid() and status = 'active'),
        updated_at = now()
    where booking_id = p_booking_id;

  insert into public.booking_events (booking_id, event_type, metadata)
  values (p_booking_id, 'ops_cancelled_refunded', jsonb_build_object(
    'stripe_refund_id', p_stripe_refund_id, 'reason', p_reason
  ));

  perform public.ops_audit_log_append('booking', p_booking_id, 'booking.refund', p_reason,
    jsonb_build_object('stripe_refund_id', p_stripe_refund_id));
end;
$$;

revoke all on function public.admin_cancel_and_refund_booking from public, anon, authenticated;
grant execute on function public.admin_cancel_and_refund_booking to authenticated;
```

Only `confirmed`/`completed` bookings can be refunded — a `pending_payment` booking was
never charged (nothing to refund; let it expire/get abandoned normally), and an already
`cancelled`/`refunded` booking can't be refunded twice (the RPC's `bad_transition`
correctly rejects both).

- [ ] **Step 2: Apply via Supabase MCP** (`apply_migration`, name
`r3b_admin_cancel_refund_booking`)

- [ ] **Step 3: Verify the grant** (same pattern as Task 2 Step 3, routine name
`admin_cancel_and_refund_booking`)

- [ ] **Step 4: Write the test**

```typescript
// apps/web/tests/db.r3b-cancel-refund-rpc.test.ts
import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

describe('admin_cancel_and_refund_booking (integration)', () => {
  it('rejects refunding a booking that was never confirmed', async () => {
    const service = createClient(url, serviceKey)
    const { data: booking } = await service
      .from('bookings')
      .select('id')
      .eq('status', 'pending_payment')
      .limit(1)
      .maybeSingle()
    if (!booking) return

    const { error } = await service.rpc('admin_cancel_and_refund_booking', {
      p_booking_id: booking.id,
      p_stripe_refund_id: 're_test_123',
      p_reason: 'test refund',
    })
    expect(error?.message).toMatch(/bad_transition/)
  })

  it('rejects a missing refund id', async () => {
    const service = createClient(url, serviceKey)
    const { error } = await service.rpc('admin_cancel_and_refund_booking', {
      p_booking_id: '00000000-0000-0000-0000-000000000000',
      p_stripe_refund_id: '',
      p_reason: 'test',
    })
    expect(error?.message).toMatch(/refund_id_required/)
  })
})
```

- [ ] **Step 5: Run it**

Run: `cd apps/web && npx vitest run tests/db.r3b-cancel-refund-rpc.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260704170000_r3b_admin_cancel_refund_booking.sql \
        apps/web/tests/db.r3b-cancel-refund-rpc.test.ts
git commit -m "feat(db): admin_cancel_and_refund_booking RPC"
```

---

## Task 5: `apps/web/lib/bookings/` domain module — types + queries

**Files:**
- Create: `apps/web/lib/bookings/types.ts`
- Create: `apps/web/lib/bookings/queries.ts`
- Test: `apps/web/tests/bookings.queries.test.ts`

- [ ] **Step 1: Write the types**

```typescript
// apps/web/lib/bookings/types.ts

export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'refunded'

export interface MerchantBookingRow {
  id: string
  experienceTitle: string
  status: BookingStatus
  qty: number
  totalAmount: number
  currency: string
  travelerLabel: string // display name if signed-in, else masked guest email
  creatorLabel: string // creator handle/display name, or "Direct" when null
  createdAt: string
}

export interface TravelerBookingRow {
  id: string
  experienceTitle: string
  experienceSlug: string
  merchantName: string
  status: BookingStatus
  qty: number
  totalAmount: number
  currency: string
  bookingDate: string | null // experience_availability.date, if joinable
  createdAt: string
}

export interface OpsBookingSettlementRow {
  id: string
  bookingId: string
  experienceTitle: string
  status: string
  merchantPayoutStatus: string
  merchantPayoutAmount: number
  creatorCommissionStatus: string | null
  creatorCommissionAmount: number | null
  kinnsoCommissionStatus: string
  kinnsoCommissionAmount: number
  currency: string
}
```

- [ ] **Step 2: Write the failing test for `listMerchantBookings`**

```typescript
// apps/web/tests/bookings.queries.test.ts
import { describe, expect, it, vi } from 'vitest'

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}))

vi.mock('@supabase/supabase-js', () => ({}))

import { listMerchantBookings } from '@/lib/bookings/queries'

function chainable(result: unknown) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'order', 'in']
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

describe('listMerchantBookings', () => {
  it('maps a null creator to the "Direct" label', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            id: 'b1',
            status: 'confirmed',
            qty: 2,
            total_amount: 900,
            currency: 'HKD',
            traveler_user_id: null,
            guest_email: 'traveler@example.com',
            creator_id: null,
            created_at: '2026-07-04T00:00:00Z',
            experiences: { title: 'Hidden Waterfall Hike' },
          },
        ],
        error: null,
      }),
    )

    const rows = await listMerchantBookings(supabaseMock as never, 'merchant-profile-1')

    expect(rows[0].creatorLabel).toBe('Direct')
    expect(rows[0].travelerLabel).toBe('traveler@example.com')
    expect(rows[0].experienceTitle).toBe('Hidden Waterfall Hike')
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/bookings.queries.test.ts`
Expected: FAIL — `Cannot find module '@/lib/bookings/queries'`

- [ ] **Step 4: Write `queries.ts`**

```typescript
// apps/web/lib/bookings/queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MerchantBookingRow, OpsBookingSettlementRow, TravelerBookingRow } from './types'

function maskGuestEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const visible = local.slice(0, 2)
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`
}

interface MerchantBookingQueryRow {
  id: string
  status: string
  qty: number
  total_amount: number
  currency: string
  traveler_user_id: string | null
  guest_email: string | null
  creator_id: string | null
  created_at: string
  experiences: { title: string } | { title: string }[] | null
  creators?: { handle: string; display_name: string | null } | { handle: string; display_name: string | null }[] | null
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export async function listMerchantBookings(
  supabase: SupabaseClient,
  merchantProfileId: string,
): Promise<MerchantBookingRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, status, qty, total_amount, currency, traveler_user_id, guest_email, creator_id, created_at, experiences!inner(title, merchant_profile_id), creators(handle, display_name)',
    )
    .eq('experiences.merchant_profile_id', merchantProfileId)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return (data as unknown as MerchantBookingQueryRow[]).map((row) => {
    const experience = one(row.experiences)
    const creator = one(row.creators ?? null)
    return {
      id: row.id,
      experienceTitle: experience?.title ?? 'Untitled experience',
      status: row.status as MerchantBookingRow['status'],
      qty: row.qty,
      totalAmount: row.total_amount,
      currency: row.currency,
      travelerLabel: row.guest_email ? maskGuestEmail(row.guest_email) : (row.traveler_user_id ?? 'Traveller'),
      creatorLabel: creator?.display_name ?? creator?.handle ?? 'Direct',
      createdAt: row.created_at,
    }
  })
}

interface TravelerBookingQueryRow {
  id: string
  status: string
  qty: number
  total_amount: number
  currency: string
  created_at: string
  experiences: { title: string; slug: string; merchant_profiles: { name: string } | { name: string }[] | null } | Array<{ title: string; slug: string; merchant_profiles: { name: string } | { name: string }[] | null }> | null
  experience_availability: { date: string } | { date: string }[] | null
}

export async function listMyBookings(
  supabase: SupabaseClient,
  travelerUserId: string,
): Promise<TravelerBookingRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, status, qty, total_amount, currency, created_at, experiences(title, slug, merchant_profiles(name)), experience_availability(date)',
    )
    .eq('traveler_user_id', travelerUserId)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return (data as unknown as TravelerBookingQueryRow[]).map((row) => {
    const experience = one(row.experiences)
    const merchant = experience ? one(experience.merchant_profiles) : null
    const availability = one(row.experience_availability)
    return {
      id: row.id,
      experienceTitle: experience?.title ?? 'Untitled experience',
      experienceSlug: experience?.slug ?? '',
      merchantName: merchant?.name ?? 'Merchant',
      status: row.status as TravelerBookingRow['status'],
      qty: row.qty,
      totalAmount: row.total_amount,
      currency: row.currency,
      bookingDate: availability?.date ?? null,
      createdAt: row.created_at,
    }
  })
}

interface OpsSettlementQueryRow {
  id: string
  booking_id: string
  status: string
  merchant_payout_status: string
  merchant_payout_amount: number
  creator_commission_status: string | null
  creator_commission_amount: number | null
  kinnso_commission_status: string
  kinnso_commission_amount: number
  currency: string
  bookings: { experiences: { title: string } | { title: string }[] | null } | Array<{ experiences: { title: string } | { title: string }[] | null }> | null
}

export async function listOpsBookingSettlements(
  supabase: SupabaseClient,
): Promise<OpsBookingSettlementRow[]> {
  const { data, error } = await supabase
    .from('booking_settlements')
    .select(
      'id, booking_id, status, merchant_payout_status, merchant_payout_amount, creator_commission_status, creator_commission_amount, kinnso_commission_status, kinnso_commission_amount, currency, bookings(experiences(title))',
    )
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return (data as unknown as OpsSettlementQueryRow[]).map((row) => {
    const booking = one(row.bookings)
    const experience = booking ? one(booking.experiences) : null
    return {
      id: row.id,
      bookingId: row.booking_id,
      experienceTitle: experience?.title ?? 'Untitled experience',
      status: row.status,
      merchantPayoutStatus: row.merchant_payout_status,
      merchantPayoutAmount: row.merchant_payout_amount,
      creatorCommissionStatus: row.creator_commission_status,
      creatorCommissionAmount: row.creator_commission_amount,
      kinnsoCommissionStatus: row.kinnso_commission_status,
      kinnsoCommissionAmount: row.kinnso_commission_amount,
      currency: row.currency,
    }
  })
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/bookings.queries.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/bookings/types.ts apps/web/lib/bookings/queries.ts apps/web/tests/bookings.queries.test.ts
git commit -m "feat(web): bookings domain module — types + queries"
```

---

## Task 6: `apps/web/lib/bookings/actions.ts` — server actions

**Files:**
- Create: `apps/web/lib/bookings/actions.ts`
- Test: `apps/web/tests/bookings.actions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/bookings.actions.test.ts
import { describe, expect, it, vi } from 'vitest'

const { rpcMock, createServerClientMock, stripeRefundsCreateMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  createServerClientMock: vi.fn(),
  stripeRefundsCreateMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createServerClientMock,
}))

vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: () => ({ refunds: { create: stripeRefundsCreateMock } }),
}))

import { adminCancelAndRefundBookingAction, markBookingCompletedAction } from '@/lib/bookings/actions'

describe('markBookingCompletedAction', () => {
  it('returns a friendly error when the RPC reports bad_transition', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: { message: 'bad_transition' } })

    const result = await markBookingCompletedAction('booking-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/not confirmed yet/i)
  })
})

describe('adminCancelAndRefundBookingAction', () => {
  it('does not call the RPC if the Stripe refund call fails', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    stripeRefundsCreateMock.mockRejectedValue(new Error('stripe down'))

    const result = await adminCancelAndRefundBookingAction({
      bookingId: 'booking-1',
      stripePaymentIntentId: 'pi_123',
      reason: 'traveller requested cancellation',
    })

    expect(result.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls the RPC with the real Stripe refund id on success', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    stripeRefundsCreateMock.mockResolvedValue({ id: 're_abc123' })
    rpcMock.mockResolvedValue({ error: null })

    const result = await adminCancelAndRefundBookingAction({
      bookingId: 'booking-1',
      stripePaymentIntentId: 'pi_123',
      reason: 'traveller requested cancellation',
    })

    expect(result.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('admin_cancel_and_refund_booking', {
      p_booking_id: 'booking-1',
      p_stripe_refund_id: 're_abc123',
      p_reason: 'traveller requested cancellation',
    })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/bookings.actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `actions.ts`**

Read `apps/web/lib/experiences/booking-actions.ts` first to confirm the exact
`ActionResult<T>` shape and `getStripeClient()` import path this codebase already uses
(R3A-2 introduced both) — reuse them, do not redefine.

```typescript
// apps/web/lib/bookings/actions.ts
'use server'

import { getStripeClient } from '@/lib/stripe/client'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/experiences/booking-actions'

const FRIENDLY: Record<string, string> = {
  bad_transition: 'This booking is not confirmed yet, so it can’t be marked complete.',
  not_found: 'Booking not found.',
  forbidden: 'You don’t have access to this booking.',
}

function friendly(message: string | undefined): string {
  const code = Object.keys(FRIENDLY).find((k) => message?.includes(k))
  return code ? FRIENDLY[code] : 'Something went wrong. Please try again.'
}

export async function markBookingCompletedAction(bookingId: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('mark_booking_completed', { p_booking_id: bookingId })
  if (error) return { ok: false, error: friendly(error.message) }
  return { ok: true, data: null }
}

export async function adminCancelAndRefundBookingAction(input: {
  bookingId: string
  stripePaymentIntentId: string
  reason: string
}): Promise<ActionResult<null>> {
  const stripe = getStripeClient()

  let refundId: string
  try {
    const refund = await stripe.refunds.create({ payment_intent: input.stripePaymentIntentId })
    refundId = refund.id
  } catch {
    return { ok: false, error: 'Stripe refund failed. No changes were made to the booking.' }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('admin_cancel_and_refund_booking', {
    p_booking_id: input.bookingId,
    p_stripe_refund_id: refundId,
    p_reason: input.reason,
  })

  if (error) {
    // The Stripe refund already succeeded but the DB-side transition failed — a
    // documented, accepted reconciliation gap (PD-R3B-5). Surface plainly so ops
    // knows to reconcile manually rather than silently losing the discrepancy.
    return {
      ok: false,
      error: `Stripe refund ${refundId} succeeded, but updating the booking failed: ${friendly(error.message)}. Reconcile manually.`,
    }
  }

  return { ok: true, data: null }
}

export async function adminSetBookingSettlementStatusAction(input: {
  settlementId: string
  status?: string
  merchantPayoutStatus?: string
  creatorCommissionStatus?: string
  kinnsoCommissionStatus?: string
  allowRevert?: boolean
  reason: string
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('admin_set_booking_settlement_status', {
    p_id: input.settlementId,
    p_status: input.status ?? null,
    p_merchant_payout_status: input.merchantPayoutStatus ?? null,
    p_creator_commission_status: input.creatorCommissionStatus ?? null,
    p_kinnso_commission_status: input.kinnsoCommissionStatus ?? null,
    p_allow_revert: input.allowRevert ?? false,
    p_reason: input.reason,
  })
  if (error) return { ok: false, error: friendly(error.message) }
  return { ok: true, data: null }
}
```

If `ActionResult<T>` in `booking-actions.ts` has a different shape than
`{ok: true, data: T} | {ok: false, error: string}` (confirm by reading the file), adjust
this task's code to match the real shape exactly — do not introduce a second, competing
result-type convention.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/bookings.actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/bookings/actions.ts apps/web/tests/bookings.actions.test.ts
git commit -m "feat(web): booking pipeline server actions (complete, cancel+refund, settlement status)"
```

---

## Task 7: Merchant dashboard — Bookings tab

**Files:**
- Create: `apps/web/app/[locale]/merchants/dashboard/bookings/page.tsx`
- Create: `apps/web/components/kinnso/pages/MerchantBookingsView.tsx`
- Modify: `apps/web/components/kinnso/pages/MerchantDashboardHomeView.tsx` (add card)
- Modify: `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` (new
  `merchantBookings` group + 2 new keys on the existing `merchantDashboard` group)
- Test: `apps/web/tests/merchants.bookings.host.test.tsx`

- [ ] **Step 1: Read the exact current shape of
`apps/web/app/[locale]/merchants/dashboard/missions/page.tsx` and
`apps/web/lib/missions/queries.ts`'s `listMerchantMissions()`** (confirmed structural
template this session) — match its exact auth/role-check boilerplate (session check,
`getMerchantProfile()` call) rather than re-deriving it.

- [ ] **Step 2: Write the page** (mirrors the missions page's structure exactly, swapping
in the bookings query from Task 5)

```typescript
// apps/web/app/[locale]/merchants/dashboard/bookings/page.tsx
import { notFound, redirect } from 'next/navigation'
import { MerchantBookingsView } from '@/components/kinnso/pages/MerchantBookingsView'
import { getMerchantProfile } from '@/lib/merchants/queries' // confirm exact export name against missions/page.tsx
import { listMerchantBookings } from '@/lib/bookings/queries'
import { markBookingCompletedAction } from '@/lib/bookings/actions'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string }>

export default async function MerchantBookingsPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const merchantProfile = await getMerchantProfile(supabase, user.id)
  if (!merchantProfile) notFound()

  const bookings = await listMerchantBookings(supabase, merchantProfile.id)

  async function completeBooking(bookingId: string) {
    'use server'
    return markBookingCompletedAction(bookingId)
  }

  return (
    <MerchantBookingsView
      locale={loc}
      t={messages.merchantBookings}
      bookings={bookings}
      onComplete={completeBooking}
    />
  )
}
```

- [ ] **Step 3: Write the failing host test**

```typescript
// apps/web/tests/merchants.bookings.host.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MerchantBookingsView } from '@/components/kinnso/pages/MerchantBookingsView'

const messages = {
  title: 'Bookings',
  empty: 'No bookings yet.',
  colExperience: 'Experience',
  colTraveler: 'Traveller',
  colCreator: 'Booked via',
  colQty: 'Qty',
  colAmount: 'Amount',
  colStatus: 'Status',
  directLabel: 'Direct',
  markCompleteButton: 'Mark completed',
  statusPendingPayment: 'Awaiting payment',
  statusConfirmed: 'Confirmed',
  statusCompleted: 'Completed',
  statusCancelled: 'Cancelled',
  statusRefunded: 'Refunded',
}

describe('MerchantBookingsView', () => {
  it('renders the empty state with zero bookings', () => {
    render(
      <MerchantBookingsView locale="en" t={messages} bookings={[]} onComplete={vi.fn()} />,
    )
    expect(screen.getByText('No bookings yet.')).toBeInTheDocument()
  })

  it('renders a booking row with "Direct" attribution and a working complete button for confirmed bookings', () => {
    render(
      <MerchantBookingsView
        locale="en"
        t={messages}
        bookings={[
          {
            id: 'b1',
            experienceTitle: 'Hidden Waterfall Hike',
            status: 'confirmed',
            qty: 2,
            totalAmount: 900,
            currency: 'HKD',
            travelerLabel: 'tr***@example.com',
            creatorLabel: 'Direct',
            createdAt: '2026-07-04T00:00:00Z',
          },
        ]}
        onComplete={vi.fn()}
      />,
    )
    expect(screen.getByText('Hidden Waterfall Hike')).toBeInTheDocument()
    expect(screen.getByText('Direct')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark completed' })).toBeInTheDocument()
  })

  it('does not render a complete button for a pending_payment booking', () => {
    render(
      <MerchantBookingsView
        locale="en"
        t={messages}
        bookings={[
          {
            id: 'b2',
            experienceTitle: 'Hidden Waterfall Hike',
            status: 'pending_payment',
            qty: 1,
            totalAmount: 450,
            currency: 'HKD',
            travelerLabel: 'tr***@example.com',
            creatorLabel: 'Direct',
            createdAt: '2026-07-04T00:00:00Z',
          },
        ]}
        onComplete={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Mark completed' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/merchants.bookings.host.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 5: Write `MerchantBookingsView.tsx`**

Read `apps/web/components/kinnso/pages/MerchantExperiencesView.tsx` first for this
codebase's exact table/list markup conventions (Tailwind classes, status-badge pattern)
and match them — do not invent a new visual pattern for one component.

```typescript
// apps/web/components/kinnso/pages/MerchantBookingsView.tsx
'use client'

import { useState, useTransition } from 'react'
import type { Locale } from '@/lib/i18n/config'
import type { MerchantBookingRow } from '@/lib/bookings/types'
import type { ActionResult } from '@/lib/experiences/booking-actions'

export interface MerchantBookingsMessages {
  title: string
  empty: string
  colExperience: string
  colTraveler: string
  colCreator: string
  colQty: string
  colAmount: string
  colStatus: string
  directLabel: string
  markCompleteButton: string
  statusPendingPayment: string
  statusConfirmed: string
  statusCompleted: string
  statusCancelled: string
  statusRefunded: string
}

const STATUS_KEY: Record<MerchantBookingRow['status'], keyof MerchantBookingsMessages> = {
  pending_payment: 'statusPendingPayment',
  confirmed: 'statusConfirmed',
  completed: 'statusCompleted',
  cancelled: 'statusCancelled',
  refunded: 'statusRefunded',
}

export function MerchantBookingsView({
  t,
  bookings,
  onComplete,
}: {
  locale: Locale
  t: MerchantBookingsMessages
  bookings: MerchantBookingRow[]
  onComplete: (bookingId: string) => Promise<ActionResult<null>>
}) {
  const [rows, setRows] = useState(bookings)
  const [isPending, startTransition] = useTransition()

  function handleComplete(bookingId: string) {
    startTransition(async () => {
      const result = await onComplete(bookingId)
      if (result.ok) {
        setRows((prev) => prev.map((r) => (r.id === bookingId ? { ...r, status: 'completed' } : r)))
      }
    })
  }

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="mb-4 text-2xl font-display">{t.title}</h1>
        <p className="text-kinnso-ink/70">{t.empty}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-display">{t.title}</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-kinnso-edge">
            <th className="py-2">{t.colExperience}</th>
            <th className="py-2">{t.colTraveler}</th>
            <th className="py-2">{t.colCreator}</th>
            <th className="py-2">{t.colQty}</th>
            <th className="py-2">{t.colAmount}</th>
            <th className="py-2">{t.colStatus}</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-kinnso-edge/50">
              <td className="py-3">{row.experienceTitle}</td>
              <td className="py-3">{row.travelerLabel}</td>
              <td className="py-3">{row.creatorLabel}</td>
              <td className="py-3">{row.qty}</td>
              <td className="py-3">
                {row.currency} {row.totalAmount.toFixed(2)}
              </td>
              <td className="py-3">{t[STATUS_KEY[row.status]]}</td>
              <td className="py-3">
                {row.status === 'confirmed' && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleComplete(row.id)}
                    className="rounded bg-kinnso-orange px-3 py-1 text-white disabled:opacity-50"
                  >
                    {t.markCompleteButton}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/merchants.bookings.host.test.tsx`
Expected: PASS

- [ ] **Step 7: Add the i18n group** — read `apps/web/lib/i18n/messages/en.ts`'s
`merchantApply` group (confirmed shape this session) as the exact structural template.
Add a new top-level `merchantBookings` export matching `MerchantBookingsMessages` above,
with real English copy (not placeholder text — e.g. `empty: "No bookings yet — once a
traveller books one of your experiences, it'll show up here."`). Then add the identical
keys with real translations to `zh-hk.ts`, `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`,
`th.ts`. Also add two new keys to the existing `merchantDashboard` group in all 7 files:
`cardBookingsTitle`, `cardBookingsBody`.

- [ ] **Step 8: Add the dashboard card** — modify
`apps/web/components/kinnso/pages/MerchantDashboardHomeView.tsx`'s card array (confirmed
at lines 11-18 this session) to add a 7th entry linking to
`/merchants/dashboard/bookings`, using the two new `cardBookingsTitle`/`cardBookingsBody`
keys, following the exact object shape of the existing 6 entries.

- [ ] **Step 9: Run the i18n parity test**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts`
Expected: PASS — all 7 locales have matching `merchantBookings` + `merchantDashboard`
key sets.

- [ ] **Step 10: Commit**

```bash
git add apps/web/app/\[locale\]/merchants/dashboard/bookings/page.tsx \
        apps/web/components/kinnso/pages/MerchantBookingsView.tsx \
        apps/web/components/kinnso/pages/MerchantDashboardHomeView.tsx \
        apps/web/lib/i18n/messages/*.ts \
        apps/web/tests/merchants.bookings.host.test.tsx
git commit -m "feat(web): merchant dashboard Bookings tab"
```

---

## Task 8: Operator Console — Bookings/settlements tab

**Files:**
- Create: `apps/web/app/[locale]/admin/bookings/page.tsx`
- Create: `apps/web/components/kinnso/admin/bookings/AdminBookingsView.tsx`
- Modify: `apps/web/components/kinnso/admin/AdminShell.tsx` (add nav entry)
- Modify: `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` (new
  `bookingsOps` group)
- Test: `apps/web/tests/admin.bookings.host.test.tsx`

- [ ] **Step 1: Read
`apps/web/app/[locale]/admin/merchants/applications/page.tsx` and its
`MerchantApplicationsView.tsx`** (confirmed template location:
`apps/web/components/kinnso/admin/merchants/MerchantApplicationsView.tsx`) for the exact
`requireOpsPage()` guard shape and query→map→view wiring — match it precisely.

- [ ] **Step 2: Write the page**

```typescript
// apps/web/app/[locale]/admin/bookings/page.tsx
import { AdminBookingsView } from '@/components/kinnso/admin/bookings/AdminBookingsView'
import { requireOpsPage } from '@/lib/admin/require-ops-page' // confirm exact import path against applications/page.tsx
import { listOpsBookingSettlements } from '@/lib/bookings/queries'
import {
  adminCancelAndRefundBookingAction,
  adminSetBookingSettlementStatusAction,
} from '@/lib/bookings/actions'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string }>

export default async function AdminBookingsPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) throw new Error('invalid locale')
  const loc = locale as Locale
  const messages = await getDictionary(loc)
  const supabase = await createSupabaseServerClient()

  await requireOpsPage(supabase, loc)

  const settlements = await listOpsBookingSettlements(supabase)

  async function setStatus(settlementId: string, reason: string) {
    'use server'
    return adminSetBookingSettlementStatusAction({
      settlementId,
      merchantPayoutStatus: 'paid',
      kinnsoCommissionStatus: 'paid',
      creatorCommissionStatus: 'paid',
      reason,
    })
  }

  async function cancelAndRefund(bookingId: string, stripePaymentIntentId: string, reason: string) {
    'use server'
    return adminCancelAndRefundBookingAction({ bookingId, stripePaymentIntentId, reason })
  }

  return (
    <AdminBookingsView
      locale={loc}
      t={messages.bookingsOps}
      settlements={settlements}
      onMarkPaid={setStatus}
      onCancelAndRefund={cancelAndRefund}
    />
  )
}
```

Confirm `requireOpsPage`'s real import path and signature by reading
`apps/web/app/[locale]/admin/layout.tsx` (confirmed to call it this session) — adjust
the import above if the real path differs.

- [ ] **Step 3: Write the failing host test**

```typescript
// apps/web/tests/admin.bookings.host.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminBookingsView } from '@/components/kinnso/admin/bookings/AdminBookingsView'

const messages = {
  title: 'Bookings & Settlements',
  empty: 'No bookings yet.',
  colExperience: 'Experience',
  colMerchantPayout: 'Merchant payout',
  colCreatorCommission: 'Creator commission',
  colKinnsoCommission: 'Kinnso commission',
  colStatus: 'Status',
  noCreatorLeg: 'No creator (direct booking)',
  markPaidButton: 'Mark all paid',
  reasonPlaceholder: 'Reason (required)',
}

describe('AdminBookingsView', () => {
  it('shows "No creator (direct booking)" when the creator leg is null', () => {
    render(
      <AdminBookingsView
        locale="en"
        t={messages}
        settlements={[
          {
            id: 's1',
            bookingId: 'b1',
            experienceTitle: 'Hidden Waterfall Hike',
            status: 'pending',
            merchantPayoutStatus: 'pending',
            merchantPayoutAmount: 900,
            creatorCommissionStatus: null,
            creatorCommissionAmount: null,
            kinnsoCommissionStatus: 'pending',
            kinnsoCommissionAmount: 100,
            currency: 'HKD',
          },
        ]}
        onMarkPaid={vi.fn()}
        onCancelAndRefund={vi.fn()}
      />,
    )
    expect(screen.getByText('No creator (direct booking)')).toBeInTheDocument()
  })

  it('renders the empty state', () => {
    render(
      <AdminBookingsView
        locale="en"
        t={messages}
        settlements={[]}
        onMarkPaid={vi.fn()}
        onCancelAndRefund={vi.fn()}
      />,
    )
    expect(screen.getByText('No bookings yet.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/admin.bookings.host.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 5: Write `AdminBookingsView.tsx`**

Read `apps/web/components/kinnso/pages/OpsSettlementView.tsx` (the closest existing
settlement-table component, even though it lives outside the `admin/` folder) for the
status-badge and reason-prompt UX pattern, and match it inside the `admin/bookings/`
location:

```typescript
// apps/web/components/kinnso/admin/bookings/AdminBookingsView.tsx
'use client'

import { useState, useTransition } from 'react'
import type { Locale } from '@/lib/i18n/config'
import type { OpsBookingSettlementRow } from '@/lib/bookings/types'
import type { ActionResult } from '@/lib/experiences/booking-actions'

export interface AdminBookingsMessages {
  title: string
  empty: string
  colExperience: string
  colMerchantPayout: string
  colCreatorCommission: string
  colKinnsoCommission: string
  colStatus: string
  noCreatorLeg: string
  markPaidButton: string
  reasonPlaceholder: string
}

export function AdminBookingsView({
  t,
  settlements,
  onMarkPaid,
}: {
  locale: Locale
  t: AdminBookingsMessages
  settlements: OpsBookingSettlementRow[]
  onMarkPaid: (settlementId: string, reason: string) => Promise<ActionResult<null>>
  onCancelAndRefund: (bookingId: string, stripePaymentIntentId: string, reason: string) => Promise<ActionResult<null>>
}) {
  const [rows, setRows] = useState(settlements)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  function handleMarkPaid(settlementId: string) {
    const reason = reasons[settlementId]?.trim()
    if (!reason) return
    startTransition(async () => {
      const result = await onMarkPaid(settlementId, reason)
      if (result.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === settlementId
              ? { ...r, status: 'paid', merchantPayoutStatus: 'paid', kinnsoCommissionStatus: 'paid', creatorCommissionStatus: r.creatorCommissionStatus ? 'paid' : null }
              : r,
          ),
        )
      }
    })
  }

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="mb-4 text-2xl font-display">{t.title}</h1>
        <p className="text-kinnso-ink/70">{t.empty}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-display">{t.title}</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-kinnso-edge">
            <th className="py-2">{t.colExperience}</th>
            <th className="py-2">{t.colMerchantPayout}</th>
            <th className="py-2">{t.colCreatorCommission}</th>
            <th className="py-2">{t.colKinnsoCommission}</th>
            <th className="py-2">{t.colStatus}</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-kinnso-edge/50">
              <td className="py-3">{row.experienceTitle}</td>
              <td className="py-3">
                {row.currency} {row.merchantPayoutAmount.toFixed(2)} ({row.merchantPayoutStatus})
              </td>
              <td className="py-3">
                {row.creatorCommissionAmount === null
                  ? t.noCreatorLeg
                  : `${row.currency} ${row.creatorCommissionAmount.toFixed(2)} (${row.creatorCommissionStatus})`}
              </td>
              <td className="py-3">
                {row.currency} {row.kinnsoCommissionAmount.toFixed(2)} ({row.kinnsoCommissionStatus})
              </td>
              <td className="py-3">{row.status}</td>
              <td className="py-3">
                {row.status !== 'paid' && (
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      placeholder={t.reasonPlaceholder}
                      value={reasons[row.id] ?? ''}
                      onChange={(e) => setReasons((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      className="rounded border border-kinnso-edge px-2 py-1"
                    />
                    <button
                      type="button"
                      disabled={isPending || !reasons[row.id]?.trim()}
                      onClick={() => handleMarkPaid(row.id)}
                      className="rounded bg-kinnso-orange px-3 py-1 text-white disabled:opacity-50"
                    >
                      {t.markPaidButton}
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

The cancel/refund action is intentionally not wired to a visible button in this first
cut of the view — flagged in §8 as a fast-follow UI addition once ops confirms the
payout-marking flow above works end to end; the RPC + server action (Task 4, Task 6)
are already complete and independently testable, so wiring a second button later is
low-risk. Note this explicitly in the PR description, don't let it read as an oversight.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/admin.bookings.host.test.tsx`
Expected: PASS

- [ ] **Step 7: Add the nav entry** — modify `AdminShell.tsx`'s nav array (confirmed at
lines 10-19 this session) to add `{ href: '/${locale}/admin/bookings', label:
t.navBookings }`, following the exact existing entry shape.

- [ ] **Step 8: Add the i18n group** — add `bookingsOps` as a new top-level group to all
7 locale files matching `AdminBookingsMessages` above (real translations, not
placeholders), plus a `navBookings` key on whatever group backs `AdminShell`'s nav
labels (confirm which group that is by reading `AdminShell.tsx`'s props/import).

- [ ] **Step 9: Run the i18n parity test**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/web/app/\[locale\]/admin/bookings/page.tsx \
        apps/web/components/kinnso/admin/bookings/AdminBookingsView.tsx \
        apps/web/components/kinnso/admin/AdminShell.tsx \
        apps/web/lib/i18n/messages/*.ts \
        apps/web/tests/admin.bookings.host.test.tsx
git commit -m "feat(web): Operator Console Bookings & Settlements tab"
```

---

## Task 9: `/trips` — traveller account area

**Files:**
- Modify: `apps/web/lib/auth/gate.ts` (add `'trips'`, `'trips/'` to `gatedPrefixes`)
- Create: `apps/web/app/[locale]/trips/page.tsx`
- Create: `apps/web/components/kinnso/pages/TravelerTripsView.tsx`
- Modify: `apps/web/components/kinnso/Navbar.tsx` (traveler CTA branch)
- Modify: `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` (new `trips`
  group + one new `nav` key for the traveler CTA)
- Test: `apps/web/tests/trips.host.test.tsx`, `apps/web/tests/auth.gate.test.ts` addition

- [ ] **Step 1: Add the gate prefix**

Read `apps/web/lib/auth/gate.ts`'s `gatedPrefixes` array (confirmed shape this session)
and add `'trips'`, `'trips/'` alongside the existing entries, matching the exact array
syntax already there.

- [ ] **Step 2: Add a gate regression test case**

Read `apps/web/tests/auth.gate.test.ts` and add a case asserting `/trips` (and a nested
path like `/trips/whatever`) is recognized as gated, following the file's existing
per-prefix test pattern exactly.

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/auth.gate.test.ts`
Expected: FAIL (prefix not yet added) — then go back and do Step 1 if you jumped ahead,
this is a TDD plan.

- [ ] **Step 4: Write the page** (mirrors `apps/web/app/[locale]/studio/page.tsx`'s
auth/redirect shape, confirmed this session, and the merchant-missions-page's
query→map→view wiring)

```typescript
// apps/web/app/[locale]/trips/page.tsx
import { redirect } from 'next/navigation'
import { TravelerTripsView } from '@/components/kinnso/pages/TravelerTripsView'
import { listMyBookings } from '@/lib/bookings/queries'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { noindexMetadata } from '@/lib/seo/noindex' // confirm exact import path against studio/page.tsx
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export const metadata = noindexMetadata()

type Params = Promise<{ locale: string }>

export default async function TripsPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) redirect('/en/trips')
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const bookings = await listMyBookings(supabase, user.id)

  return <TravelerTripsView locale={loc} t={messages.trips} bookings={bookings} />
}
```

Per D-R3-5: no role check beyond "is signed in" — `/trips` is the default landing for
any authenticated user without a more specific role (traveler is the resolver's
fallback), so unlike `/studio`/`/merchants/dashboard` there's no `notFound()` branch for
"wrong role" here. If `resolveViewerRole` returns `'merchant'`/`'creator'`/`'ops'` for
this user, they can still see their own traveler-side bookings (e.g. a merchant who also
personally booked something as a traveller) — this is intentional, not a gap.

- [ ] **Step 5: Add `noindexMetadata`/`ROBOTS_DISALLOW` entries** — confirm the exact
import path and `ROBOTS_DISALLOW` list location by reading `studio/page.tsx` and
`apps/web/app/robots.ts`; add `/trips` to the disallow list the same way `/studio` (or
`/merchants/dashboard`) is already listed there.

- [ ] **Step 6: Write the failing host test**

```typescript
// apps/web/tests/trips.host.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TravelerTripsView } from '@/components/kinnso/pages/TravelerTripsView'

const messages = {
  title: 'Your trips',
  empty: 'No bookings yet — once you book an experience, it’ll show up here.',
  colExperience: 'Experience',
  colMerchant: 'Merchant',
  colStatus: 'Status',
  colAmount: 'Amount',
  statusPendingPayment: 'Awaiting payment',
  statusConfirmed: 'Confirmed',
  statusCompleted: 'Completed',
  statusCancelled: 'Cancelled',
  statusRefunded: 'Refunded',
  savesTabTitle: 'Saved',
  savesTabComingSoon: 'Coming soon.',
}

describe('TravelerTripsView', () => {
  it('renders the empty state', () => {
    render(<TravelerTripsView locale="en" t={messages} bookings={[]} />)
    expect(screen.getByText(/No bookings yet/)).toBeInTheDocument()
  })

  it('renders a booking row', () => {
    render(
      <TravelerTripsView
        locale="en"
        t={messages}
        bookings={[
          {
            id: 'b1',
            experienceTitle: 'Hidden Waterfall Hike',
            experienceSlug: 'hidden-waterfall-hike',
            merchantName: 'Sunrise Stays HK',
            status: 'confirmed',
            qty: 2,
            totalAmount: 900,
            currency: 'HKD',
            bookingDate: '2026-08-01',
            createdAt: '2026-07-04T00:00:00Z',
          },
        ]}
      />,
    )
    expect(screen.getByText('Hidden Waterfall Hike')).toBeInTheDocument()
    expect(screen.getByText('Sunrise Stays HK')).toBeInTheDocument()
  })

  it('shows the saves tab as empty/coming-soon, not faked (D-R3-5)', () => {
    render(<TravelerTripsView locale="en" t={messages} bookings={[]} />)
    expect(screen.getByText('Coming soon.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/trips.host.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 8: Write `TravelerTripsView.tsx`**

```typescript
// apps/web/components/kinnso/pages/TravelerTripsView.tsx
'use client'

import Link from 'next/link'
import type { Locale } from '@/lib/i18n/config'
import type { TravelerBookingRow } from '@/lib/bookings/types'

export interface TravelerTripsMessages {
  title: string
  empty: string
  colExperience: string
  colMerchant: string
  colStatus: string
  colAmount: string
  statusPendingPayment: string
  statusConfirmed: string
  statusCompleted: string
  statusCancelled: string
  statusRefunded: string
  savesTabTitle: string
  savesTabComingSoon: string
}

const STATUS_KEY: Record<TravelerBookingRow['status'], keyof TravelerTripsMessages> = {
  pending_payment: 'statusPendingPayment',
  confirmed: 'statusConfirmed',
  completed: 'statusCompleted',
  cancelled: 'statusCancelled',
  refunded: 'statusRefunded',
}

export function TravelerTripsView({
  locale,
  t,
  bookings,
}: {
  locale: Locale
  t: TravelerTripsMessages
  bookings: TravelerBookingRow[]
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-display">{t.title}</h1>

      {bookings.length === 0 ? (
        <p className="text-kinnso-ink/70">{t.empty}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {bookings.map((b) => (
            <li key={b.id} className="rounded border border-kinnso-edge p-4">
              <Link href={`/${locale}/experiences/${b.experienceSlug}`} className="font-medium">
                {b.experienceTitle}
              </Link>
              <p className="text-sm text-kinnso-ink/70">{b.merchantName}</p>
              <div className="mt-2 flex justify-between text-sm">
                <span>{t[STATUS_KEY[b.status]]}</span>
                <span>
                  {b.currency} {b.totalAmount.toFixed(2)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Saves tab: guide_saves ships in R6 — hidden/empty here on purpose, not faked (D-R3-5) */}
      <div className="mt-10 border-t border-kinnso-edge pt-6">
        <h2 className="mb-2 text-lg font-display">{t.savesTabTitle}</h2>
        <p className="text-kinnso-ink/70">{t.savesTabComingSoon}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/trips.host.test.tsx`
Expected: PASS

- [ ] **Step 10: Add the traveler navbar CTA** — read `apps/web/components/kinnso/
Navbar.tsx`'s role-keyed CTA switch (confirmed at lines ~53-58 this session) and add a
`role === 'traveler'` branch before the anon fallback, linking to `/trips`:

```typescript
if (role === "traveler") return { label: t.ctaMyTrips, to: "/trips", ... } // match the exact object shape of sibling branches
```

- [ ] **Step 11: Add the i18n group** — add `trips` as a new top-level group matching
`TravelerTripsMessages` to all 7 locale files with real translations, plus `ctaMyTrips`
on whichever group backs `Navbar.tsx`'s `t.ctaOpenStudio` etc.

- [ ] **Step 12: Run the i18n parity + navbar tests**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts`
Also run whatever existing navbar test file covers the CTA switch (find via
`grep -rl "ctaOpenStudio" apps/web/tests`) to confirm the new branch doesn't break
existing role-CTA assertions.
Expected: PASS on both.

- [ ] **Step 13: Commit**

```bash
git add apps/web/lib/auth/gate.ts apps/web/tests/auth.gate.test.ts \
        apps/web/app/\[locale\]/trips/page.tsx \
        apps/web/components/kinnso/pages/TravelerTripsView.tsx \
        apps/web/components/kinnso/Navbar.tsx \
        apps/web/lib/i18n/messages/*.ts \
        apps/web/lib/seo/ \
        apps/web/app/robots.ts \
        apps/web/tests/trips.host.test.tsx
git commit -m "feat(web): /trips traveller account area"
```

---

## Task 10: Fix R3A-2 carry-forward — confirmation page's cancelled/refunded fallthrough

**Files:**
- Modify: `apps/web/app/[locale]/experiences/[slug]/booked/page.tsx` (exact filename —
  confirm against R3A-2's actual page, referred to as `/experiences/[slug]/booked` in
  its own plan and carry-forwards note)
- Test: whichever existing test file covers this page (find via
  `grep -rl "booked" apps/web/tests | grep -i experience`)

- [ ] **Step 1: Read the current page in full** to see the exact two-state
(`pending_payment` / fallthrough-"confirmed") structure the R3A-2 carry-forward note
describes.

- [ ] **Step 2: Write the failing test cases** (add to the existing test file found
above, following its existing test structure/mocking pattern for
`get_booking_by_checkout_session`):

```typescript
it('shows a cancelled message, not the confirmed message, for a cancelled booking', async () => {
  // mock get_booking_by_checkout_session to return { status: 'cancelled', ... }
  // render the page / call the component
  // assert the cancelled-specific copy renders, and the confirmed "You're booked!" copy does NOT
})

it('shows a refunded message, not the confirmed message, for a refunded booking', async () => {
  // same shape, status: 'refunded'
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/web && npx vitest run <the test file path>`
Expected: FAIL — both new cases currently render the generic "confirmed" fallthrough
copy.

- [ ] **Step 4: Fix the page** — replace the binary `pending_payment` vs.
everything-else branch with an explicit switch over all five `BookingStatus` values,
each with its own copy (confirmed = "You're booked!"; completed = same success framing,
past-tense; cancelled = "This booking was cancelled."; refunded = "This booking was
refunded — you should see the refund on your original payment method within 5–10
business days," matching Stripe's own standard refund-timing language since no custom
KINNSO refund-timing copy exists elsewhere in the codebase to contradict it).

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run <the test file path>`
Expected: PASS

- [ ] **Step 6: Add the new copy to i18n** if this page's copy is already
i18n-sourced (check `messages.booking` group, added in R3A-2) — add
`statusCancelledTitle`/`statusCancelledBody`/`statusRefundedTitle`/`statusRefundedBody`
keys (or whatever naming matches the existing `booking` group's convention) across all 7
locales, then re-run the i18n parity test.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/\[locale\]/experiences/\[slug\]/booked/page.tsx apps/web/tests/*.ts apps/web/lib/i18n/messages/*.ts
git commit -m "fix(web): booking confirmation page no longer shows false success for cancelled/refunded bookings"
```

---

## Task 11: Full-suite verification + i18n/RLS regression sweep

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors across all 8 packages.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: 0 new warnings/errors (pre-existing accepted warnings, e.g. the `<img>`
next/og pattern warning, are fine).

- [ ] **Step 3: Full web test suite**

Run: `cd apps/web && npx vitest run; echo "EXIT: $?"`
Expected: all new tests from Tasks 1–10 pass; total pass count grows from this
worktree's baseline (1272 passed / 31 skipped, captured at worktree setup) by roughly
the number of new test cases added; 0 unexpected failures. Do **not** pipe through
`tail`/`grep` without also echoing the exit code — this project has a documented
gotcha where a piped vitest run can silently swallow a non-zero exit code.

- [ ] **Step 4: i18n parity, explicitly**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts`
Expected: PASS — every new group (`merchantBookings`, `bookingsOps`, `trips`) present
with identical keys across all 7 locales.

- [ ] **Step 5: Grep safety net for stray placeholder content**

Run: `grep -rn "TODO\|TBD\|FIXME" apps/web/lib/bookings apps/web/components/kinnso/pages/MerchantBookingsView.tsx apps/web/components/kinnso/admin/bookings apps/web/components/kinnso/pages/TravelerTripsView.tsx`
Expected: no output.

---

## Task 12: Final holistic branch review

- [ ] Dispatch a fresh review subagent (per subagent-driven-development's established
final-review step) to read the FULL diff of every commit on `feat/revision-r3b` since it
diverged from `feat/revision-r3a1` (`git diff origin/feat/revision-r3a1...feat/revision-r3b`),
independent of the per-task reviews already done, checking specifically for:
  - The three security invariants in §3 (RPC-only money transitions, no currency
    summing, no new service-role paths) — read every new migration's grants again from
    scratch, the same way R3A-2's final review re-verified `confirm_booking_from_webhook`'s
    grant three times independently.
  - Whether `booking_settlements`/`bookings`-merchant-select made it into the shared
    RLS anon-cannot-read regression list (Task 3 Step 7) — don't just trust the task was
    marked done, re-grep.
  - Whether the Task 10 fix actually covers all 5 `BookingStatus` values, not just the
    2 the carry-forward note called out.
  - Any commit whose message doesn't match its diff, or any non-bisectable "fixup"
    commit that should be squashed before PR (both real issues caught in R3A-1's own
    final review).
- [ ] Fix anything Critical/Important directly (per this program's established
  precedent — do not spin up another subagent round for small, obvious fixes).
- [ ] Report the review verdict (APPROVE / issues found + fixed) before proceeding to
  PR, matching every prior phase's handoff format.

---

## 4. Testing summary

Per-slice `*.queries.test.ts` / `*.actions.test.ts` / `*.host.test.tsx` layering
(unchanged house convention). Three new raw-SQL integration tests for the new
trigger/RPCs (`db.r3b-*.test.ts`, matching `db.r1b-migration.test.ts`'s pattern of
asserting against a real Supabase project rather than mocks — these self-skip via early
`return` when the test project lacks the specific seed data needed, same convention
R2C's spot-checks used). RLS regression: extend the shared anon-cannot-read table list
(Task 3 Step 7). i18n parity is automatic via the existing test once all 7 locale files
have matching keys. Scoped runs throughout via `cd apps/web && npx vitest run
<pattern>` per this project's documented vitest-scoping convention.

## 5. Out of scope (R3B)

Creator-facing "commission earned" view (PD-R3B-6 carry-forward) · merchant-configurable
commission rates (PD-R3B-1 carry-forward) · a visible "Cancel & refund" button in the
admin view (Task 8's server action + RPC are complete; wiring the button is flagged as
a fast-follow, not a blocker) · real attribution wiring (`creator_id`/`guide_id`
populated at checkout time) — that's R3C · embedded experience CTAs, social-proof
bookings count, Travelpayouts repair job — all R3C · Stripe `idempotencyKey` on
`sessions.create()` — pre-existing R3A-2 carry-forward, unrelated to this phase's
surfaces · retroactive guest→account booking linking · booking-lookup-by-email for
returning guests · landing R3A-2 into `main` (separate pre-existing branch-hygiene
to-do, not blocking this plan).

## 6. Self-review (per writing-plans skill)

**Spec coverage** — D-R3-5 (`/trips`): Task 9. D-R3-6 (merchant pipeline): Tasks 3, 5, 7.
Booking commission ledger (master spec's R3B charter phrase, schema left open by
D-R3-3): Tasks 1, 2, 4, 8. R3A-2 carry-forward (confirmation page fallthrough,
newly-reachable once this phase ships cancel/refund): Task 10. Security invariants:
addressed inline in every RPC-writing task (2, 3, 4) plus re-verified in Task 12. No
section of the parent spec's R3B-relevant scope is unaddressed except the two
explicitly-flagged, explicitly-deferred items in §5 (creator commission view,
configurable rates) — both are genuine gaps in the master spec's own draft, not
oversights of this plan, and are documented as carry-forwards rather than silently
dropped.

**Placeholder scan** — no TBD/TODO/"add appropriate"/"similar to Task N" language above;
every SQL/TypeScript/test code block is complete and copy-pasteable. The three spots
that say "confirm the exact import path against file X" (Tasks 6, 7, 8, 9) are
deliberate, not placeholders — they point at a specific real file to read, consistent
with this project's own established plans doing the same wherever an exact import path
depends on a sibling file's current, verified-by-reading-it-at-execution-time content
rather than something already confirmed via this session's research.

**Type consistency** — `MerchantBookingRow`/`TravelerBookingRow`/`OpsBookingSettlementRow`
(Task 5) are the single source of truth for field names used identically in Tasks 7, 8,
9's view components (`experienceTitle`, `creatorLabel`, `travelerLabel`, etc. — no
renamed duplicates). `ActionResult<T>` (Task 6) is reused, not redefined, in Tasks 7 and
8's page components. RPC parameter names (`p_booking_id`, `p_reason`, etc.) match
exactly between each migration (Tasks 2–4) and its corresponding `actions.ts` call site
(Task 6).
