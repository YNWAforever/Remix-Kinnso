# Front-of-House Slice 3d — Studio Monetization (Offers + Earnings) — design

**Date:** 2026-06-20
**Status:** Approved (design); pending spec review → implementation plan
**Repo:** `kinnso-v3` (web app `apps/web`, DB package `@kinnso/db`)
**Builds on:** Slice 3b (branded hubs + Studio dashboard), Merchant Brief Flow v1 (missions + Travelpayouts affiliate schema/domain layer), Slice 3c (studio guides — parallel, independent)

---

## Goal

Turn the two remaining `live: false` Studio tiles into real, data-backed surfaces, completing the creator-monetization corner of the Studio:

- **`/studio/offers`** — a dedicated **affiliate-offers** surface: browse Travelpayouts offers, join (auto-join), generate a tracked partner link, and copy it.
- **`/studio/earnings`** — a read-only **earnings dashboard** summarizing the creator's `mission_settlements` (mission payouts + affiliate commissions) by payout status and currency.

This is the first slice to surface the monetization data that Merchant Brief Flow v1 introduced. It is a **web-only slice**: it reuses the existing `lib/missions` domain layer, existing tables, existing RLS, and existing server actions. **No new DB schema, RLS, or migration** — therefore **no gated production-DB step**.

## Scope decisions (locked)

| Decision | Choice |
|---|---|
| Offers vs. existing `/studio/missions` | **Split & elevate** — `/studio/offers` owns Travelpayouts affiliate offers; `/studio/missions` refactors to **merchant-sourced missions only**, so the two surfaces stop overlapping. |
| Offers data source | Existing `missions` rows where `mission_source = 'travelpayouts'` (reusing `creatorMissionSelect`). No raw program catalog (partner links require a mission+participant). |
| Offers actions | Reuse existing `joinMissionAction` + `createPartnerLinkAction`. No new actions. |
| Partner-link UX | Add a client-side **Copy** affordance to generated links (`navigator.clipboard`). |
| Earnings data source | Existing `mission_settlements`, read via the creator-as-participant RLS policy. **Read-only** — no settlement writes from this surface. |
| Earnings aggregation | A **pure** `summarizeCreatorEarnings(rows)` helper → per-currency Paid vs. Pending totals + per-mission rows. |
| New schema / migration | **None.** Reuses existing tables, RLS, grants, and actions. |
| Authoring access | Authenticated **creators only** (`resolveViewerRole === 'creator'`), mirroring `/studio/missions`, `/studio/scan`, `/studio/guides`. |

## Architecture overview

```
Studio (authenticated, dynamic — creators only)

  /studio/missions   (merchant missions)  ── listCreatorMerchantMissions() ─┐ mission_source <> 'travelpayouts'
  /studio/offers     (affiliate offers)   ── listAffiliateOffers() ─────────┤ mission_source  = 'travelpayouts'
  /studio/earnings   (earnings dashboard) ── listCreatorSettlements() ───────┘ mission_settlements (RLS: participant)
                                                  │
                                    summarizeCreatorEarnings()  (pure rollup)

  Offers join/link:  joinMissionAction + createPartnerLinkAction   (existing, unchanged)
```

All three surfaces use the **user-scoped server client**; RLS is the authorization boundary. Reads are scoped by the existing policies:
- `missions_visible_select` (published missions readable by authenticated creators),
- `affiliate_network_programs` select where `status = 'active'` (already creator-readable),
- `affiliate_partner_links` creator select/insert (already creator-scoped),
- `mission_settlements_visible_select` (the creator-as-participant branch).

---

## 1. Offers surface — `/studio/offers`

### Data — `lib/missions/queries.ts` (extend)
Add a creator-facing affiliate-offers query reusing the existing `creatorMissionSelect`:

- `listAffiliateOffers(supabase)` — published missions where `mission_source = 'travelpayouts'`, ordered by `published_at desc`. Returns each offer's `affiliate_network_programs` (name/category/commission desc/url/status), the creator's `mission_participants` row (join state), and `affiliate_partner_links` (generated links).

### Host — `app/[locale]/studio/offers/page.tsx` (replace stub)
Auth/role gate identical to `/studio/missions` (`getUser` → redirect to sign-in; `resolveViewerRole !== 'creator'` → `notFound`). Maps rows → `AffiliateOfferCard[]` (same projection helpers the missions host already uses for source/type/compensation/program), then renders `StudioOffersView`. Wires two server-action thunks: `join(missionId)` → `joinMissionAction`, `createLink(participantId, originalUrl)` → `createPartnerLinkAction`.

### View — `components/kinnso/pages/StudioOffersView.tsx` (new, `'use client'`)
Affiliate-offer cards, richer than the current mixed missions card:
- Program name + **category** + commission description (`MissionCompensationSummary`).
- **Join offer** button when not yet a participant.
- Once an **active** participant and a program URL exists: **Generate partner link** button.
- Generated links list, each with a **Copy** button (`navigator.clipboard.writeText`, with a transient "Copied" state) and a link out to the program.
- Action error surfaced via `role="alert"`; `router.refresh()` on success (same pattern as `CreatorMissionsView`).
- Empty state when there are no offers.

## 2. Missions refactor (merchant-only)

- `lib/missions/queries.ts`: add `listCreatorMerchantMissions(supabase)` = published missions where `mission_source <> 'travelpayouts'` (reusing `creatorMissionSelect`). `/studio/missions` switches to this query.
- `CreatorMissionsView` keeps its existing card / join / apply behavior. The travelpayouts-only **Generate partner link** branch (currently lines ~92–101) **moves to** `StudioOffersView`; the merchant missions view no longer renders it.
- The existing `CreatorMissionsView` test updates to assert a **merchant** mission renders and that a travelpayouts offer is **not** shown there.
- `listCreatorMissions` (the current "all published" query) is **replaced** by the two scoped queries; remove it if it has no other consumers (verify during implementation).

## 3. Earnings surface — `/studio/earnings`

### Data — `lib/missions/queries.ts` (extend)
- `listCreatorSettlements(supabase)` — selects `mission_settlements` joined to `missions(title, mission_type, mission_source)`, ordered by `updated_at desc`. RLS restricts rows to the creator-as-participant automatically (creators are never merchant owners), consistent with the codebase's RLS-as-boundary pattern.

### Aggregation — `lib/missions/earnings.ts` (new, pure)
- `summarizeCreatorEarnings(rows)` → for each `amount_currency`, two buckets keyed off `creator_payout_status`:
  - **Paid** = sum of (`creator_commission_amount` + `paid_fee_amount`) where `creator_payout_status = 'paid'`.
  - **Pending** = the same sum where `creator_payout_status` is pending/unset.
  - Per-currency because paid fees (HKD-ish) and affiliate commissions (USD) are never cross-summed.
- Also returns a per-mission row list (mission title, type, amount + currency, payout-status label). Null/absent amounts treated as 0; rows with no amounts still listed.

### View — `components/kinnso/pages/StudioEarningsView.tsx` (new)
- Summary stat cards: per currency, **Paid** and **Pending** totals.
- Per-mission breakdown table: title, type, amount, payout-status badge.
- Empty state when the creator has no settlements.
- Read-only: no buttons, no write path.

### Host — `app/[locale]/studio/earnings/page.tsx` (replace stub)
Auth/role gate as above → `listCreatorSettlements` → `summarizeCreatorEarnings` → `StudioEarningsView`.

## 4. Data model & security — no migration

No new tables, columns, indexes, RLS policies, or grants. Specifically:
- **Offers** reuse `missions`, `affiliate_network_programs`, `mission_participants`, `affiliate_partner_links` and their existing creator-facing policies. `createPartnerLinkAction` continues to call the server-only Travelpayouts adapter (env-gated; unchanged).
- **Earnings** reads `mission_settlements` via the existing `mission_settlements_visible_select` participant branch. Creators still **cannot** read raw `affiliate_network_events` (ops-only) — earnings reflects **settlement records**, not live affiliate tracking.
- No `service_role`, no new env vars, no anon exposure (all these tables are already `revoke all … from anon`).

## 5. i18n

Two new `Messages` groups, all 7 locales, parity-guarded (typecheck oracle + `tests/i18n.locale-parity.test.ts` `GROUPS` extended), mirroring the `studioGuides` precedent:
- **`studioOffers`** — heading, subtitle, empty state, join button, generate-link button, copy / copied labels, category label, commission label, "view program" link label.
- **`studioEarnings`** — heading, subtitle, paid label, pending label, currency-section label, per-mission table headers (mission / type / amount / status), payout-status labels, empty state.

The merchant-only missions heading copy may get a small wording tweak (existing `missions` group key) to read as "merchant missions"; no structural change to that group.

## 6. Studio dashboard wiring

Flip the `earnings` and `offers` tiles in `StudioHomeView` from `live: false` to `live: true` (the tiles, hrefs, titles, and descriptions already exist).

## 7. Testing

Same gate as prior slices (`pnpm typecheck` 7/7, `pnpm lint` 0 errors, `pnpm test` green, `pnpm --filter web build` ✓), plus:
- `summarizeCreatorEarnings` — unit tests: mixed currencies, paid vs. pending bucketing, null amounts, empty input.
- `StudioOffersView` — jsdom: renders an offer card, join button when not joined, generate-link button when active, copy affordance on a generated link, empty state.
- `StudioEarningsView` — jsdom: renders summary cards (per currency), per-mission rows, empty state.
- `CreatorMissionsView` — updated: merchant mission renders; travelpayouts offer not shown.
- i18n parity — `studioOffers` + `studioEarnings` present and complete across all locales.
- Page hosts follow the missions module's existing test depth (auth/role gating not deeply unit-tested where it requires a live Supabase).
- Build verification: `/studio/offers`, `/studio/earnings`, `/studio/missions` remain dynamic-auth; the rest of SSG/ISR is unaffected.

## 8. Out of scope (YAGNI)

- Real-time affiliate-event tracking / creator-visible `affiliate_network_events` (stays ops-only).
- Creator-initiated settlements or payout execution (settlements remain ops-authored).
- A mission-less affiliate **program catalog** (would require schema changes to allow program-only partner links).
- `/studio/inbox`, marketing pages (`/about`, `/agent`, public `/offers`).
- Charts/graphs, date-range filtering, CSV export on earnings.

## Risks & assumptions

- **Empty data at first:** in production there are likely no `mission_settlements` rows yet (Merchant Brief Flow v1 just shipped), so `/studio/earnings` mostly renders its empty state initially — correct, fills in as ops settles. Same situation as guides starting empty.
- **Missions refactor blast radius:** touches Merchant Brief Flow v1 code (the `/studio/missions` query + `CreatorMissionsView` partner-link branch) and its test. Contained — behavior for merchant missions is unchanged; only the travelpayouts branch relocates.
- **Mixed currencies** are surfaced per-currency, never summed across — avoids a misleading single total.
- **Merge overlap with Slice 3c (PR #19, open):** both edit `StudioHomeView` (different tiles) and `lib/i18n/messages/*` (different groups). Independent branches off `main`; conflicts, if any, are mechanical.
