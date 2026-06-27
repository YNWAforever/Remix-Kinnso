# Phase 8 — Analytics & Insights — Design Spec

**Date:** 2026-06-27
**Status:** Approved (design)
**Branch:** `feat/phase8-analytics-insights` (off merged `main` after #43 + #44)

## Goal

Give creators a real outcomes view and merchants a real campaign view, built **only on data the platform already captures** — zero fabricated metrics. Two dedicated, ownership-gated pages: `/studio/insights` (creator) and `/merchants/insights` (merchant).

## Why now

Seven phases shipped real creator/merchant loops (directory, missions, tier, invite→accept), but neither side can see outcomes. In a creator-supply soft launch, showing a creator their own progress is a retention lever; showing a merchant their campaign funnel makes the Phase 7 invite loop legible.

## Honesty boundaries (hard constraints)

These shape the entire scope — the platform does not have the data for the "obvious" metrics, so we do not invent them:

1. **No guide views.** Guides have no view counter (articles do; guides do not). Deferred until view capture exists. The guide-level outcome metric is **saves** (`guides.saves_count`, real).
2. **No dollar earnings.** There is no payouts/amount table anywhere; affiliate commission is descriptive text ("Up to 4%"). Creator value is shown as **contribution points**, explicitly labelled as points/activity — never money. Dollar earnings belong to the (not-chosen) Settlement phase.
3. **No `completed` funnel stage.** `mission_participants.status` has `completed` in its enum, but the app never writes it (join → `active` or `applied`; merchant approve → `active`; reject → `rejected`; accept-invite → `active`). The real "delivered work" signal is **approved milestone submissions** (`mission_milestone_submissions.status = 'approved'`), which is also what triggers the +40 `mission_verified` contribution event — so the two stay consistent.

## Architecture

**Approach: compute-on-read via two `SECURITY DEFINER` RPCs.** Matches the established codebase pattern (`admin_*`, `list_active_perks`, `merchant_invite_creator`). One migration, **no new tables, no schema changes**. Soft-launch data volumes make on-read aggregation effectively free.

Rejected alternatives:
- **Client-side aggregation over RLS rows** — ships raw rows to the browser, forces the merchant cross-mission join client-side, diverges from the RPC convention.
- **Materialized snapshot tables + refresh triggers** — correct at scale, pure YAGNI now. Documented as the future scale path.

### Migration: `supabase/migrations/<ts>_insights_rpcs.sql`

Two functions, each returning a single `jsonb` value (one round-trip), `stable`, `set search_path = public`:

**`creator_insights()`**
- Gate: `if not exists (select 1 from public.creators where id = auth.uid() and status = 'active') then raise exception 'forbidden' using errcode = '42501'; end if;`
- Aggregates **only `auth.uid()`'s own** data:
  - `points_total` — `sum(points)` from `creator_contribution_events` (or read `creator_contribution.contribution_points`).
  - `points_by_type` — `sum(points)` grouped by `event_type` (`guide_published` / `mission_verified` / `dna_scan`).
  - `points_trajectory` — weekly buckets over the last 12 weeks: `[{ week_start: date, points: int }]` (per-week sum; the TS layer computes the cumulative line). Uses `creator_contribution_events.created_at`.
  - `guides_published` — `count(*)` of `guides` where `creator_id = auth.uid() and status = 'published'`.
  - `guide_saves_total` — `coalesce(sum(saves_count), 0)` over the same guides.
  - `missions_by_status` — `count(*)` grouped by `status` from `mission_participants` where `creator_id = auth.uid()` (expected real values: `applied`, `active`, `rejected`, `invited`).
  - `submissions_approved` — `count(*)` of `mission_milestone_submissions` (status `approved`) authored by this creator (join submissions→participant by mission+creator, or via the milestone→mission→participant path used in 5A).

**`merchant_insights()`**
- Gate: resolve `v_merchant := (select id from public.merchant_profiles where user_id = auth.uid() and status = 'active')`; `if v_merchant is null then raise exception 'forbidden' ...`.
- Aggregates **only this merchant's own missions** (`missions.merchant_profile_id = v_merchant`):
  - `missions_published` — count of the merchant's `published` missions.
  - `per_mission` — `[{ mission_id, title, status, invited, applied, active, rejected, approved_submissions }]` (counts from `mission_participants` grouped by status; `approved_submissions` from `mission_milestone_submissions`).
  - `totals` — `{ participants, invited, accepted, approved_submissions }` summed across the merchant's missions, where `accepted` = `merchant_invite` participants now `active`.
  - `invite_accept_rate` — `accepted / nullif(invited_total, 0)` (null when no invites; TS renders "—").

**Grants (every new function):** `revoke all on function ... from public, anon; grant execute on function ... to authenticated;` (Supabase default-privileges re-grant anon/authenticated on new public functions → both must be named; advisor 0028).

Tier math is **not** in SQL. The RPC returns raw point numbers; the TS layer derives tier / next-tier / points-to-next from the existing `lib/contribution/tiers.ts` (single source of truth, thresholds seed 0 / rising 50 / pro 150 / elite 400).

### App layer

- `lib/insights/creator.ts` — `getCreatorInsights(supabase)`: calls `supabase.rpc('creator_insights')`, throws on error, returns a typed `CreatorInsights` (raw shape + a derived `tier`/`nextTier`/`pointsToNext` via `tiers.ts`, and a cumulative trajectory).
- `lib/insights/merchant.ts` — `getMerchantInsights(supabase)`: calls `supabase.rpc('merchant_insights')`, throws on error, returns typed `MerchantInsights`.
- `components/kinnso/Sparkline.tsx` — tiny accessible SVG line (cumulative points). `BarRow.tsx` — labelled horizontal bar. Both: `role="img"` + `aria-label` summarizing the value, plus a visually-hidden text/data fallback; decorative shapes `aria-hidden`.
- `components/kinnso/pages/CreatorInsightsView.tsx` / `MerchantInsightsView.tsx` — `'use client'` presentational views taking already-fetched typed props; render metrics, charts, and **honest empty states** for every section (most accounts have ~zero data at launch).
- `app/[locale]/studio/insights/page.tsx` — gates with `requireCreator`-equivalent **inline before fetch** (Next renders layout + page in parallel; every sibling page gates inline), then `getCreatorInsights`.
- `app/[locale]/merchants/insights/page.tsx` — merchant-gated inline (reuse the Phase 7 `/merchants/creators` gate pattern), then `getMerchantInsights`.
- Navigation: add an "Insights" tile to the Studio quick-links and an Insights link to the merchant nav (`nav.linkInsights` reused/added).
- i18n: new `insights` group across all 7 locales (en/ja/ko/th/zh-cn/zh-hk/zh-tw) + `Messages` interface in `en.ts` + group name in the parity `GROUPS` array.

## Data flow

Page (server, gated) → `getCreatorInsights` / `getMerchantInsights` → `supabase.rpc(...)` (SECURITY DEFINER, internally ownership-gated, anon revoked) → typed shape (+ TS tier derivation + cumulative trajectory) → server-rendered View → SVG charts + metric cards.

## Error handling

- RPC throws (forbidden / DB error) → query wrapper rethrows → page boundary surfaces a generic error (no leakage).
- Non-creator hitting `/studio/insights` → `notFound()` (or sign-in redirect for anon); non-merchant hitting `/merchants/insights` → same.
- Null/empty aggregates render explicit empty states, never a blank or a fabricated zero-with-chart.

## Testing

- **Lib:** `getCreatorInsights` / `getMerchantInsights` with mocked `supabase.rpc` (shape mapping, tier derivation, cumulative trajectory, error rethrow).
- **Components:** View render with data **and** empty-state render for each section; chart components render aria-labels + fallback.
- **Host pages:** creator-only / merchant-only gate + anon redirect (mirrors Phase 6/7 host tests; these MUST be in the finish sweep — host-test-gap lesson).
- **i18n:** locale parity for the new `insights` group.
- **Live (controller):** after `apply_migration`, verify anon/public EXECUTE = 0 on both RPCs; each returns own-data-only; non-owner raises `forbidden`.

## File structure summary

```
supabase/migrations/<ts>_insights_rpcs.sql          # 2 SECURITY DEFINER RPCs, no tables
apps/web/lib/insights/creator.ts                    # typed creator_insights wrapper + tier derivation
apps/web/lib/insights/merchant.ts                   # typed merchant_insights wrapper
apps/web/components/kinnso/Sparkline.tsx            # accessible SVG line
apps/web/components/kinnso/BarRow.tsx               # accessible labelled bar
apps/web/components/kinnso/pages/CreatorInsightsView.tsx
apps/web/components/kinnso/pages/MerchantInsightsView.tsx
apps/web/app/[locale]/studio/insights/page.tsx      # creator-gated inline
apps/web/app/[locale]/merchants/insights/page.tsx   # merchant-gated inline
apps/web/lib/i18n/messages/*.ts                     # insights group ×7 + Messages interface
apps/web/tests/...                                   # lib, component, host-gate, i18n-parity
```

## Out of scope (v1)

Guide-view capture, dollar earnings/payouts, date-range pickers, CSV/export, real-time refresh, snapshot materialization, cross-creator/merchant benchmarking.
