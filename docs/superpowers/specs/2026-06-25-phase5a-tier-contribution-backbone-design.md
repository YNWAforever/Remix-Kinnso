# Phase 5A — Creator Tier & Contribution Backbone — design

**Date:** 2026-06-25
**Status:** Approved (design); pending spec review → implementation plan
**Repo:** `kinnso-v3` (web app `apps/web`, migrations at repo-root `supabase/migrations`)
**Parent:** `docs/superpowers/specs/2026-06-24-product-reorg-roadmap-design.md` (Phase 5)
**Builds on:** Phase 3 real creator directory (the `creators` table + its public-read RLS and the `SECURITY DEFINER` trigger precedent), the Missions Journey (Stage A–C verification), Studio dashboard, the DNA scan.

---

## Purpose

Phase 5 of the reorg roadmap is "creator tier/contribution backbone + Copilot tool v1" — the heaviest new build, deliberately specified at concept-level in the parent and given a dedicated design. Phase 5 is **four independent subsystems**, so it is decomposed:

- **5A — Tier & contribution backbone** *(this spec)* — make tier real and persisted; everything else gates on it.
- **5B — Tier gating** — wire the real tier into mission eligibility + commission splits. (depends on 5A)
- **5C — Copilot tool v1** — the first real AI agents in `/studio/copilot`, tier-gated. (depends on 5A)
- **5D — Partner perks catalog** — third-party discounts redeemable by level. (depends on 5A)

Each gets its own spec → plan → build cycle. This spec covers **5A only**: the foundation that turns today's cosmetic, mock-only tier into a real, points-driven backbone the other three can gate on.

### Today's state (what 5A replaces)

The tier system is **100% mock**: `lib/creator-mock` defines `Tier = 'seed'|'rising'|'pro'|'elite'` with a hardcoded `tierMeta` (keyed off DNA *score* thresholds 50/70/80/90) used only for UI badges (`TierBadge`) and merchant match scoring. There is **no DB persistence**, no contribution points, no gating. The `/agent` marketing page already promises the ladder ("publish guides and complete missions to level up; higher tiers unlock more agents, higher limits, better commissions, and exclusive missions") — 5A makes the first half of that promise real.

## Objective & principles

**Objective:** Persist a real, transparent, points-driven tier for every creator, earned from real activity, surfaced honestly on the creator's own Studio — with no gating yet (gating is 5B–5D).

**Principles (inherited from the roadmap):**

1. **No fabricated data on owned surfaces.** Points and tier are computed only from real, already-tracked events. No engagement/reach/GMV (no metrics pipeline exists).
2. **Honest and transparent.** The creator can see *why* they are at their current points (an event log), not just a number.
3. **Best-effort accounting never blocks the primary action.** A bug in contribution accounting must never fail a guide-publish or mission-verify.
4. **Follow existing precedent.** Reuse the Phase 3 `SECURITY DEFINER` trigger + backfill pattern and the repo-root migration location.

## Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|---|---|
| D1 | Tier driver | **Contribution points from real activity only.** DNA score stays a separate quality/readiness signal, not a tier input. |
| D2 | Point-earning events | **Published guide, verified mission, completed DNA scan.** *Not* settled/paid mission (avoids manual-ops dependency). |
| D3 | Compute & store | **Append-only event log + `SECURITY DEFINER` trigger recompute + a denormalized 1:1 projection.** |
| D4 | Tier ladder | **Reuse `seed / rising / pro / elite`**, re-keyed to contribution points. |
| D5 | Creator surface | **Dashboard progress card + a dedicated `/studio/tier` page** (with points history from the event log). |
| D6 | Scope & visibility | **Creator-private, minimal rip-out.** Real tier only on the creator's own Studio surfaces; merchant-side mock match scoring left untouched (backlog). |

### Note on D3 — separate table, not columns on `creators`

The brainstorm initially leaned toward `contribution_points`/`tier` *columns on `creators`*. D6 (creator-private) makes that unsafe: Postgres RLS is **row-level, not column-level**, and Phase 3 grants `anon` read on active creator rows — so a `tier` column would leak to anon. Resolution: store the projection in a **separate 1:1 `creator_contribution` table** with owner-only RLS, physically isolated from the public `creators` projection. Still denormalized and a cheap single-row read for future gating. (Alternative considered and rejected: a column-level `GRANT` on `creators` excluding tier columns — a subtle footgun that breaks whenever the anon grant is touched.)

## Tier ladder & scoring

**Point weights** (snapshotted onto each event row at award time, so future weight changes don't rewrite history):

| Event | Points | Rationale |
|---|---|---|
| `mission_verified` | **40** | Strongest "did real collaborative work" signal. |
| `guide_published` | **15** | Core creator output. |
| `dna_scan` | **10** | One-time onboarding starter so a brand-new creator isn't at zero. |

**Tier thresholds** (contribution points):

| Tier | Min points | Illustrative path |
|---|---|---|
| `seed` | 0 | default; pre-scan |
| `rising` | 50 | scan + ~3 guides |
| `pro` | 150 | scan + 4 guides + 2 verified missions |
| `elite` | 400 | scan + ~10 guides + 6 verified missions (aspirational) |

Thresholds and weights are tunable; these are the v1 values. They live canonically in one TS module and are mirrored in the SQL recompute (see *Single source of truth*).

## Architecture

### Data flow

```
earn:   guide published / mission verified / scan completed
          → AFTER trigger on source table (best-effort)
          → upsert-or-delete a row in creator_contribution_events  (idempotent)
          → recompute_creator_contribution(creator_id)
          → upsert creator_contribution (points, tier, tier_updated_at)

read:   Studio (owner-scoped)
          → getCreatorContribution()  → { points, tier, progress-to-next }   (COALESCE missing → seed/0)
          → listContributionEvents()  → history for /studio/tier
```

### Schema (one migration, repo-root `supabase/migrations`)

**`creator_contribution_events`** — append-only audit log.

- `id uuid pk default gen_random_uuid()`
- `creator_id uuid not null references creators(id) on delete cascade`
- `event_type text not null check (event_type in ('dna_scan','guide_published','mission_verified'))`
- `points int not null` — snapshotted at award time
- `source_id uuid not null` — the guide id / mission-participant id / (for `dna_scan`) the `creator_id` itself
- `created_at timestamptz not null default now()`
- `unique (creator_id, event_type, source_id)` — idempotency: a guide/mission cannot double-count; the composite makes `dna_scan` effectively one-per-creator.

**`creator_contribution`** — 1:1 denormalized projection.

- `creator_id uuid primary key references creators(id) on delete cascade`
- `contribution_points int not null default 0`
- `tier text not null default 'seed' check (tier in ('seed','rising','pro','elite'))`
- `tier_updated_at timestamptz` — stamped when tier changes (enables future "you leveled up" UX)
- `updated_at timestamptz not null default now()`

**`recompute_creator_contribution(p_creator_id uuid)`** — `SECURITY DEFINER`.

- Sums `points` from `creator_contribution_events` for the creator.
- Derives tier from the thresholds.
- Upserts `creator_contribution`; sets `tier_updated_at = now()` only when tier changes.
- Idempotent — safe to call repeatedly and from the backfill.

**Triggers** — each is **best-effort** (the recompute call is wrapped so an exception is logged and swallowed, never rolling back the primary write):

- on `guides` — `AFTER INSERT OR UPDATE OR DELETE`: when a guide transitions *into* published, insert a `guide_published` event (idempotent); when it transitions *out of* published or is deleted, delete that event; then recompute. (Reversal handled: unpublish removes the points.)
- on mission verification — fires when a `mission_participant` reaches the **verified-complete** state (the exact table/column is the same state Stage C marks as verified; confirmed against the live schema at plan time). One `mission_verified` event per participant (`source_id = participant.id`), so multiple verified milestones in one mission award once. Reversal: if verification is revoked, delete the event; recompute.
- on `creator_dna` — when `final` is first set (non-null): insert the one-time `dna_scan` event; recompute.

**RLS & grants:**

- `creator_contribution_events` and `creator_contribution`: **owner-read only** — keyed to the same ownership predicate the existing owner-scoped Studio reads use (confirmed at plan time). No `anon`/public grant.
- The `creators` public projection is **unchanged** — tier is never added to it, so anon cannot read tier.
- Future cross-creator gating (5B/5C) reads the projection via `SECURITY DEFINER` / service context, not via the public role.

**Backfill (in the migration):** synthesize `creator_contribution_events` from existing published guides, existing verified missions, and existing completed DNA scans; create `creator_contribution` rows; run `recompute_creator_contribution` for every creator. The owner's `@creator` account picks up real points from its existing activity.

### Single source of truth for thresholds/weights

The ladder (tier order, thresholds, point weights) is defined **canonically in `lib/contribution/tiers.ts`**. The SQL recompute function mirrors the same numbers with a comment cross-referencing the TS module. Both must be kept in sync by hand (an acceptable MVP trade-off; a future option is a config table if churn warrants it). A unit test pins the TS constants so accidental UI/logic drift is caught.

## Web components

- **`lib/contribution/tiers.ts`** — `Tier` type (the real union, same four values), `TIER_THRESHOLDS`, `POINT_WEIGHTS`, `tierForPoints(points): Tier`, `progressToNext(points): { tier, nextTier|null, pointsIntoTier, pointsForNext|null, pct }`. The one place thresholds/weights live for the web app.
- **`lib/contribution/queries.ts`** — `getCreatorContribution(supabase)`: owner-scoped read of `creator_contribution`, COALESCE missing → `{ points: 0, tier: 'seed' }`, returns points/tier/progress. `listContributionEvents(supabase)`: owner-scoped event history (newest first) for the page.
- **`components/kinnso/TierProgressCard.tsx`** — dashboard card: real `TierBadge`, current points, progress bar to next tier, compact "ways to earn points" list, link to `/studio/tier`.
- **`app/[locale]/studio/tier/page.tsx` + `StudioTierView`** — full breakdown: current tier + points, all four tiers with thresholds, a "what unlocks" placeholder section (populated by 5B–5D later), the points-history list from the event log, and an honest empty state (no events yet).
- **`app/[locale]/studio/page.tsx`** — render `TierProgressCard`.
- **`components/kinnso/StudioQuickLinks.tsx`** — add a Tier tile → `/studio/tier`.
- **`TierBadge`** — wired to render the real tier on the creator's own surfaces (it already accepts a tier prop).
- **i18n** — a new `tier` (or `contribution`) message group across all **7 locales** (en/ja/ko/th/zh-cn/zh-hk/zh-tw) + the new group added to the parity test's `GROUPS` array; `en.ts` is a **default** export.

## Error handling

- **Triggers are best-effort.** The recompute call inside each trigger is wrapped to log-and-swallow exceptions; contribution accounting must never roll back a guide-publish, mission-verify, or scan write. A standalone `recompute_creator_contribution` (callable in bulk) reconciles any drift caused by a swallowed failure.
- **Missing projection row** reads as `seed`/`0` via COALESCE — a creator who has earned nothing renders correctly without requiring a pre-created row.
- **Idempotency** via the `unique (creator_id, event_type, source_id)` constraint — re-running triggers or the backfill cannot double-count.

## Testing

TDD throughout, following repo conventions (render tests `// @vitest-environment jsdom` first line + `afterEach(cleanup)`; `import en from '@/lib/i18n/messages/en'` default; decorative arrows `aria-hidden`; targeted `vitest run <files> --no-file-parallelism` + `tsc --noEmit` gate; `pkill -f vitest` before runs).

- **Unit — `tiers.ts`:** `tierForPoints` boundaries (0→seed, 49→seed, 50→rising, 149→rising, 150→pro, 399→pro, 400→elite); `progressToNext` (mid-tier pct, exact-threshold, and maxed elite → `nextTier: null`); the weight/threshold constants pinned.
- **Unit — `queries.ts`:** `getCreatorContribution` owner-scoping + COALESCE-missing → seed/0; `listContributionEvents` ordering and shape (mocked Supabase builder, matching the repo's existing query-test style).
- **Render (jsdom):** `TierProgressCard` (tier label, points, progress-bar width, ways-to-earn list, link target); `StudioTierView` (all four tiers rendered, history list, empty-history state); `/studio/tier` host page test (mocks `@/lib/contribution/queries`).
- **i18n parity:** the new group present in all 7 locales + added to `GROUPS`.
- **SQL (triggers / recompute / idempotency / reversal / backfill):** verified **live via Supabase MCP** (apply migration; exercise publish→points, unpublish→reversal, scan→starter, backfill count) — there is no local DB in this Vitest setup, consistent with prior phases.

## Non-goals (deferred)

- Any tier **gating** of missions, offers/commissions, or copilot — that is 5B / 5C.
- The **partner perks catalog** — 5D.
- **Public or merchant** exposure of tier — creator-private in 5A.
- **Performance/engagement/reach** points — no data source exists.
- **Merchant-side mock replacement** (`creator-mock` `computeMatch`/`tierFit`) — backlog; `/merchants/creators` is cut from nav.
- "You leveled up" notifications/animations — `tier_updated_at` is laid down now, but surfacing it is later polish.

## Implementation sequencing note

At design time, local `main` is at `1a3ae74` (Phase 1 + Phase 2 only); **both Phase 3 (PR #39) and Phase 4 (PR #40) are still open**. 5A directly depends on Phase 3 (the `creators` table, its public-read RLS, and the `SECURITY DEFINER` trigger precedent). The 5A implementation branch must therefore be cut from `main` **after #39 and #40 merge** (same pattern as prior phases branching off main post-merge), so it includes both. The docs (this spec + the forthcoming plan) live on `feat/phase5a-tier-backbone` off the current `main` and will be rebased onto the updated `main` before implementation begins.

## Success criteria

- Every creator has a real, persisted `contribution_points` + `tier` derived solely from real events (published guides, verified missions, completed scan).
- The creator sees their tier, points, and progress-to-next-tier on the Studio dashboard, and a full breakdown + honest points history at `/studio/tier`.
- Publishing a guide, completing+verifying a mission, or completing a scan moves points/tier correctly; unpublishing/revoking reverses them; nothing double-counts.
- A failure in contribution accounting never blocks the underlying creator action.
- Tier is not exposed to anon or merchants.
- 5B/5C/5D can read a creator's tier from a single cheap, owner/service-scoped row.
