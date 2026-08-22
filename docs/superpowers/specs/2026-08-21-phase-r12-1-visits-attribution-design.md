# Phase R12.1 — Attribution Hardening & Merchant ROI — Design

**Status:** Approved by user 2026-08-21, pending implementation plan.

## Goal

Instrument the offer claim/redeem funnel with consented traveller-analytics events
(`offer_viewed` / `offer_claimed` / `offer_redeemed`), and surface what those events (plus the
existing booking-attribution data) actually add up to: a merchant-facing "visits driven"
breakdown per creator/guide, and a simple visit-count stat on the creator's own insights page.

## Context

This is R12.1, the second sub-phase of R12 ("The Visit Loop") in the R10–R13 roadmap
(`~/Downloads/kinnso-roadmap-r10-r13.md`), the direct successor to R12.0 (offer/claim/
redemption MVP, PRs #119/#120, merged 2026-08-21). Everything R12.1 measures is data R12.0
already produces — this phase adds no new transactional entities, only analytics
instrumentation and two reporting-RPC widenings.

## Decisions made during brainstorming

1. **One combined design**, not split into a smaller events-only phase — the dashboard panel
   needs the events to exist anyway, and the roadmap already treats both as one sub-phase.
2. **`offer_redeemed` is server-emitted, not client-emitted.** `offer_viewed` and
   `offer_claimed` fit the existing `traveller_analytics_events` system naturally (the
   visitor's own consented browser session). But redemption happens on a *different* device
   — merchant staff's phone at the counter — so the original visitor's browser has no way to
   witness it. Instead: `claim_offer` gains an optional `p_journey_id` param, stored on a new
   `offer_claims.analytics_journey_id` column (null if the visitor wasn't consented at claim
   time); `redeem_offer_claim` inserts the `offer_redeemed` event itself, server-side, reusing
   that stored journey_id — matching the table's own header comment, which already documents
   server-side service-role writes as a supported path, not just client posts. If the visitor
   was never consented, no event is emitted; there is no anonymous/invented fallback.
3. **The merchant ROI panel is a new dedicated RPC surface, not an extension of the existing
   public `get_attributed_guides_for_merchant()`.** That function is consumed by anonymous
   visitors on the merchant's *public* profile page and returns a simple deduped guide list —
   a different contract for a different audience than a private, count-bearing dashboard
   panel. Concretely realized as: fold the new breakdown into the *existing* `merchant_insights`
   RPC (which already backs the merchant's `/studio/insights` page) rather than adding a
   second RPC call to that page — one comprehensive function per dashboard section is this
   codebase's established pattern (`creator_insights`, `merchant_insights` already work this
   way).
4. **Redemptions and attributed bookings are shown as two separate counts per creator/guide,
   not merged into one number.** They're different revenue mechanisms (offer commission vs.
   booking commission); merging them would obscure which channel is actually working for a
   given creator, breaking the "every count shown must be honestly backed by rows" ethos
   R12.0 already established.

## Out of scope

- Any change to the offer/claim/redeem transactional flow itself (R12.0, already shipped and
  live) — this phase only observes it.
- OCR/receipt features, POS integrations — R12.2, a separate sub-phase.
- A `booking_cta` → completion funnel widening on top of the existing R8 report RPC — the
  roadmap mentions this as part of R12.1's broader intent, but it's additive to an unrelated
  existing report and not needed for the merchant ROI panel or creator visit-count this phase
  actually delivers; deferred to avoid scope creep into R8's own reporting surface.
- Any change to consent UX, the rate-limit RPC, or the ingest endpoint's validation shape
  beyond the three new event names — those mechanisms are unchanged, just fed two new client
  event types plus one server-originated one.

## Architecture

**Consented client events** — `offer_viewed` fires once when `OfferClaimCard` mounts, matching
the existing convention that `entity_viewed` fires on page load, not on scroll/visibility.
`offer_claimed` fires from the claim action on a successful `claim_offer` call. Both get typed
entries in `TravellerAnalyticsMetadataByEvent` (`lib/analytics/client.ts`) with
`entityType: 'offer'`, following every other event's shape exactly. Consent-gating is
inherited for free — `trackTravellerEvent` already no-ops without consent, nothing new to
build there.

**Journey capture at claim time** — `claim_offer` (R12.0) gains `p_journey_id uuid default
null` and `p_locale text default null`. The client passes the visitor's current journey_id and
locale (the journey_id via a small new read-only export from `lib/analytics/client.ts`,
exposing the same value `trackTravellerEvent` already reads internally) only when they're
consented; the RPC stores both on two new `offer_claims` columns, untouched by anything else
in the claim flow. Locale is captured here specifically because `traveller_analytics_events.
locale` is `not null` and the server has no other source for it at redemption time — the
merchant redeeming the claim is not the visitor whose locale should be recorded.

**Server-emitted redemption event** — `redeem_offer_claim` (R12.0), after a successful
redemption insert, checks the claim's `analytics_journey_id`. If set, it inserts one
`traveller_analytics_events` row itself: `event_name = 'offer_redeemed'`, a freshly generated
`client_event_id`, the stored `journey_id` and `locale`, `entity_type = 'offer'`, `entity_id`
= the offer's id, `route_key = 'offer_redemption'` (a fixed descriptive tag — `route_key` is a
free-text, length-checked column in this table, not an enum, so no catalog entry is needed),
`consent_version = 'v1'`. This mirrors the "servers write with service role" path the table's
own header comment already documents. If `analytics_journey_id` is null (unconsented claim),
the redemption still proceeds exactly as today — no event is invented for it.

**Merchant "visits driven" panel** — `merchant_insights` (existing RPC backing
`/studio/insights`'s merchant view) gains a `visits_driven` array, one row per creator/guide:
a redemptions count (joined through `offer_claims`/`offer_redemptions`/`merchant_offers` for
the calling merchant) and an attributed-bookings count (the same join
`get_attributed_guides_for_merchant` already uses, extended to `count(*)` instead of a deduped
list). Both counts computed in the same widened function body, not two separate RPC calls.

**Creator visit-count stat** — `creator_insights` (existing RPC) gains a single
`visits_driven` total: count of `offer_redemptions` rows whose claim belongs to that creator,
across every offer they've promoted.

## Schema

- `traveller_analytics_events.event_name` CHECK: add `'offer_viewed'`, `'offer_claimed'`,
  `'offer_redeemed'` to the existing `in (...)` list (`20260801090000_r8_0_measurement_
  baseline.sql`'s constraint, widened via a new migration — the check itself needs a full
  `alter table ... drop constraint ... add constraint ...` swap, since Postgres has no
  "add value to existing check" primitive).
- `traveller_analytics_events.entity_type` CHECK: same swap, adding `'offer'` to
  `('guide', 'experience', 'creator', 'article')`.
- `offer_claims` (R12.0 table): add `analytics_journey_id uuid` (nullable, no FK — journey ids
  are client-generated UUIDs with no server-side table of their own, same as every other
  event's `journey_id` column already works) and `analytics_locale text` (nullable, same
  7-locale check as `traveller_analytics_events.locale`). Both null together for an
  unconsented claim; both set together for a consented one — never one without the other.

## UI

- Merchant insights page: new "Visits driven" table section — one row per creator/guide, two
  count columns (redemptions, attributed bookings), same visual weight as the existing
  `perMission` breakdown table already on that page.
- Creator insights page: one new stat line ("X visits driven"), alongside the existing
  points/guides/missions stats.
- i18n keys added across all 7 locales with real translations, per the established convention.

## Testing

- **Migration-text contract tests** for both CHECK-constraint swaps, the new `offer_claims`
  column, `redeem_offer_claim`'s new conditional analytics insert, and both widened insights
  RPCs — the established `db.*.test.ts` style used throughout R10–R12.
- **Unit/component tests**: the two new `trackTravellerEvent` call sites fire with correct
  metadata when consented and silently no-op when not (mirroring every existing event's own
  test coverage); the two insights query-layer functions map the new fields correctly.
- **Live proof** (local stack only, never production, per project convention): claim
  with consent → redeem → confirm exactly one `offer_redeemed` row lands with the right
  `journey_id`; claim without consent → redeem → confirm no `offer_redeemed` row is inserted
  at all; `merchant_insights`'s `visits_driven` breakdown returns correct per-creator/guide
  counts against seeded redemptions and bookings; `creator_insights`'s total matches. Fixed
  seed ids must use a UUID block disjoint from every existing `*.rls.test.ts` file (grep
  first, per the documented gotcha), or `randomUUID()`.
