# Phase R12.0 — The Visit Loop MVP (Offer, Claim, In-Store Redemption) — Design

**Status:** Approved by user 2026-08-21, pending implementation plan.

## Goal

Instrument "visitor actually visits, spends, tastes" — the causal chain's missing middle.
Kinnso can already prove a creator caused a Stripe booking, but food/experience discovery
mostly converts to walk-ins, and Kinnso has no instrument for that today: no voucher, QR,
check-in, or receipt entity exists anywhere in the schema. R12.0 adds the primary mechanism —
merchant-created offers, claimed via a creator's surface, redeemed in-store by merchant staff,
settled through the existing payout pipeline.

## Context

This is R12.0, the first sub-phase of R12 ("The Visit Loop") in the R10–R13 roadmap
(`~/Downloads/kinnso-roadmap-r10-r13.md`). Its dependencies — R10.1 (settlement minting) and
R11.0 (the ops review-queue pattern this phase's redemption RPCs are modeled on) — are both
merged, along with the rest of R10 and R11 (R10.0–R10.3, R11.0–R11.2 all shipped as of PR
#116). R12.0 is now the next unblocked phase in the dependency graph.

Before designing, confirmed the existing `partner_perks`/`perk_redemptions` system (behind
the admin Perks page) is **not** a fit to reuse or extend: it's an ops-curated, tier-gated
benefit *for creators* (single-tap reveal, no visitor, no in-person verification, no
settlement) — a fundamentally different domain from a merchant-offer/visitor-claim/in-store-
redemption flow with financial settlement to the creator. R12.0 needs its own entities.

## Decisions made during brainstorming

1. **Commission model: hybrid, configured per offer** (`commission_kind`: `flat` or
   `percent`). Resolves the roadmap's own open question #1 for R12.0. Matches how Kinnso
   already handles commissions elsewhere (missions use flat `paid_fee_amount`, bookings/
   affiliate use percent) — per-offer configuration is the most consistent option, not a new
   pattern.
2. **Offers are merchant self-service from day one**, not ops-created. A bigger initial build
   than an ops-only admin form, but the right call for a real (if small) pilot rather than a
   throwaway demo.
3. **Redemption interface: camera QR scanning with a manual-entry fallback.** Adds browser
   camera access (`getUserMedia`) and a QR-decoding library as new technical surface, but
   manual-only entry is real friction for a busy venue counter — worth the extra build for
   something staff will use dozens of times a day.
4. **Claiming requires sign-in — no anonymous/email-capture claims.** The roadmap's original
   design assumed email delivery (to let an anonymous claimant retrieve their QR later),
   but **Kinnso has no transactional email infrastructure today** (verified: no Resend/
   SendGrid/Postmark/etc. dependency in `apps/web/package.json`) — consistent with an
   existing memory note that a promised confirmation email elsewhere in the app has no
   mailer behind it. Requiring sign-in removes the email dependency entirely (the QR is
   always retrievable via `/trips`) and simplifies `offer_claims.visitor_user_id` from an
   XOR-with-email to a plain not-null column. Anonymous claiming can be revisited in a later
   phase if email infrastructure gets built for other reasons.
5. **Claim surfaces: both the guide page (`/g/[slug]`) and the creator profile (`/c/[handle]`)
   from day one**, matching the roadmap's original scope.
6. **Data model: three tables** (`merchant_offers` → `offer_claims` → `offer_redemptions`),
   keeping the claim (attribution moment) and the redemption (in-store event + settlement
   link) as separate rows — matching this codebase's established separation of durable state
   from append-only event/ledger data (`mission_review_events`, `creator_payout_decisions`,
   `ops_audit_log`). A two-table merge (status column instead of a separate redemption row)
   was considered and rejected for mixing attribution-intent data with post-redemption
   financial data on one row.
7. **`redemption_velocity` flag added to R11.1's existing ops attention queue** — a small,
   explicitly-scoped addition to already-shipped code (not a new feature), covering the
   fraud-monitoring gap noted in the roadmap's §5.5 posture.

## Out of scope

- Anonymous claims / email-capture flow (Decision 4) — would need transactional email
  infrastructure to be picked and wired up first; not part of this phase.
- Device fingerprinting, geofencing, POS integration — explicitly deferred by the roadmap's
  own v1 fraud posture (§5.5), appropriate for a 3-merchant pilot.
- R12.1's full "visits driven" merchant ROI panel (extends `get_attributed_guides_for_merchant`
  with attributed-bookings data) and the `offer_viewed`/`offer_claimed`/`offer_redeemed` R8
  analytics taxonomy widening — separate sub-phase. R12.0 ships only the lightweight
  claims→redemptions counter described in Architecture/UI below.
- R12.2 receipt-based cashback missions (the no-QR fallback) — separate sub-phase, reuses the
  R11 review queue.
- Merchant offer edit/pause history, discount-type validation beyond basic constraints,
  bulk offer management — a single create/publish/pause/end lifecycle is enough for a
  3-merchant pilot; richer offer management can follow if merchants ask for it.

## Architecture

**Claim path** — `claim_offer(p_offer_id, p_creator_id, p_guide_id, p_source)`
(`SECURITY DEFINER`, `authenticated`-only since sign-in is required): validates the offer is
`live` and within `valid_from`/`valid_to`, enforces `per_visitor_limit` via the partial unique
index on `(offer_id, visitor_user_id)` where active and `total_cap` via a predicate update
(`where claimed_count < total_cap`, the same idiom as R11.2's budget debit and R10.2's payout-
batch creation), mints a 24-random-byte token (SHA-256 hash stored, raw value returned once,
never persisted), inserts the `offer_claims` row, fires the `offer_claimed` R8 event. Modeled
directly on `admin_create_payout_batch`'s validate → lock → write shape.

**Redemption path** — `redeem_offer_claim(p_raw_token, p_amount_spent default null)`
(`SECURITY DEFINER`, `authenticated`-only, requires caller to be staff of the claim's offer's
`merchant_profile_id` — checked the same way `budget_debit`-adjacent RPCs check merchant
ownership): hashes the token, locks the claim row `for update`, verifies `active` +
unexpired + offer ownership matches caller, flips the claim to `redeemed`, inserts the
`offer_redemptions` row, increments `merchant_offers.redeemed_count`. A second call with the
same token is idempotent — returns the original `redeemed_at` under `already_redeemed` rather
than raising. `p_amount_spent` is only meaningful (and only requested by the UI) when the
offer's `commission_kind = 'percent'`.

**Settlement** — the R10.1 `create_mission_settlement_on_approval`-style trigger pattern
extends to `offer_redemptions`: an `AFTER INSERT` trigger computes the creator's fee from the
offer's `commission_kind`/`commission_value` (and `amount_spent` when percent-based), inserts
a `mission_settlements` row with `source = 'visit_redemption'`, which then flows through the
already-shipped R10.2 payout-batch pipeline and R10.3 notification unchanged — no changes to
either of those phases.

**Merchant offer management** — plain owner-scoped RLS CRUD (`merchant_offers_owner_all`
policy on `merchant_profile_id = auth.uid()`-joined-through-`merchant_profiles`, plus active
ops), not RPC-gated like the claim/redeem paths — creating/pausing/ending an offer has no
race-safety or fraud concern the way claiming and redeeming do.

**Ops attention queue** — `admin_mission_attention()` (R11.1) gains a `redemption_velocity`
entry: flags an offer whose redemption count in a short rolling window crosses a threshold,
following the same shape as the existing `at_risk_missions` subquery.

## Schema

**`merchant_offers`**: `id uuid pk`, `merchant_profile_id uuid not null references
merchant_profiles(id) on delete cascade`, `mission_id uuid references missions(id)` (nullable
— an offer can outlive the mission that spawned it), `title text not null`, `terms text not
null`, `discount_kind text not null check (discount_kind in ('percent','amount','item'))`,
`discount_value numeric not null check (discount_value > 0)`, `commission_kind text not null
check (commission_kind in ('flat','percent'))`, `commission_value numeric not null check
(commission_value > 0)`, `valid_from timestamptz not null`, `valid_to timestamptz not null
check (valid_to > valid_from)`, `per_visitor_limit int not null default 1 check
(per_visitor_limit > 0)`, `total_cap int check (total_cap > 0)` (nullable — no cap),
`claimed_count int not null default 0`, `redeemed_count int not null default 0`, `status text
not null default 'draft' check (status in ('draft','live','paused','ended'))`, `created_at`/
`updated_at`. RLS: owner (via `merchant_profiles.user_id = auth.uid()`) + active ops, `for
all`; public/creator reads of *live* offers go through a narrow `stable` RPC (metadata only,
mirroring `list_active_perks()`'s pattern of never exposing more than the redemption surface
needs).

**`offer_claims`**: `id uuid pk`, `offer_id uuid not null references merchant_offers(id)`,
`creator_id uuid not null references creators(id)`, `guide_id uuid references guides(id)`
(nullable — null when claimed from a creator profile rather than a specific guide),
`visitor_user_id uuid not null` (no email/anonymous variant — see Decision 4),
`claim_token_hash text not null unique`, `source_surface text not null check (source_surface
in ('guide','profile'))`, `expires_at timestamptz not null`, `status text not null default
'active' check (status in ('active','redeemed','expired'))`, `created_at`. Partial unique
index on `(offer_id, visitor_user_id) where status = 'active'` for the per-visitor-limit
race-safety. RLS: `revoke all from anon, authenticated`; visitor reads own claims (for
`/trips`) and merchant/ops read claims against their own offers, both via `select`-only
policies; every write is RPC-only.

**`offer_redemptions`**: `id uuid pk`, `offer_claim_id uuid not null unique references
offer_claims(id)`, `merchant_profile_id uuid not null references merchant_profiles(id)`,
`redeemed_by_merchant_user_id uuid not null`, `redeemed_at timestamptz not null default now()`,
`amount_spent numeric check (amount_spent >= 0)` (nullable — only set for percent-commission
offers), `settlement_id uuid references mission_settlements(id)` (filled in by the settlement
trigger described in Architecture), `created_at`. RLS mirrors `offer_claims`: revoke-all +
select-only policies for the owning merchant/ops, RPC-only writes.

## UI

- **Claim CTA** on `/g/[slug]` and `/c/[handle]` — a compact offer card (title, merchant name,
  validity) with a "Claim this offer" button, shown only for `live` offers within their
  validity window and under-cap.
- **Claim confirmation screen** — renders the QR from the raw token (client-side, token never
  round-trips to a second request), also reachable any time from `/trips` since claiming
  requires sign-in.
- **`/merchants/dashboard/redeem`** — camera view auto-scanning a presented QR, with a manual
  code-entry fallback; prompts for `amount_spent` only when the scanned offer is
  percent-commission.
- **Merchant offer management** (new page/section in the merchant dashboard) — create/edit
  form (title, terms, discount kind/value, commission kind/value, per-visitor limit, total
  cap, validity window) plus a list view with claimed/redeemed counts and a
  publish/pause/end status control.
- **Merchant dashboard — lightweight ROI counter**: claims → redemptions per offer (counts
  only; the richer per-creator/per-guide breakdown is R12.1's "visits driven" panel, out of
  scope here).
- **i18n**: new keys across all 7 locales, per the usual dedicated task.

## Testing

- **Migration-text contract tests** for all three tables and the three RPCs
  (`claim_offer`, `redeem_offer_claim`, the settlement-mint trigger extension) — the
  established `db.*.test.ts` style used throughout R10/R11.
- **RLS tests**: merchant A cannot read or redeem merchant B's claims/offers; a creator
  cannot call `redeem_offer_claim` at all; a visitor can read only their own claims.
- **Race tests**: two concurrent `redeem_offer_claim` calls on the same token — exactly one
  succeeds, the other returns `already_redeemed` with the original timestamp, not an error.
- **Cap tests**: claiming past `per_visitor_limit` or `total_cap` fails cleanly; two
  concurrent first-time claims against a `total_cap`-1-remaining offer — exactly one wins.
- **Settlement tests**: a redemption mints a correct `mission_settlements` row
  (`source = 'visit_redemption'`) for both `flat` and `percent` `commission_kind`, with the
  right fee amount; an unredeemed/expired claim never mints anything.
- **Live proof** (local stack only, never production, per project convention): full
  claim → redeem → settle → payout-batch chain end to end with a real (test) creator/
  merchant/offer; expired-claim redemption attempt is rejected; a redeemed claim's second
  redemption attempt is idempotent. Fixed seed ids must use a UUID block disjoint from every
  existing `*.rls.test.ts` file (grep first, per the documented gotcha), or `randomUUID()`.
- **Unit/component tests** for the new queries, actions, the claim CTA, the redeem screen
  (camera + manual paths), and the offer management form.
