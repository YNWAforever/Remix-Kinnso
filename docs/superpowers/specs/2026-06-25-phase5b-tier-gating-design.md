# Phase 5B — Creator Tier Gating (mission eligibility) — design

**Date:** 2026-06-25
**Status:** Approved (design); pending spec review → implementation plan
**Repo:** `kinnso-v3` (web app `apps/web`, migrations at repo-root `supabase/migrations`)
**Parent:** `docs/superpowers/specs/2026-06-24-product-reorg-roadmap-design.md` (Phase 5)
**Builds on:** Phase 5A tier/contribution backbone (`creator_contribution`, `tiers.ts`, owner-only RLS), Phase 4 missions loop (`missions` / `mission_participants` / `mission_milestone_submissions`, `joinMissionAction`, merchant post wizard).

---

## Purpose

Phase 5 of the reorg roadmap ("creator tier/contribution backbone + Copilot tool v1") was decomposed into four sub-projects: **5A** tier backbone (done) → **5B** tier gating *(this spec)* → **5C** Copilot tool v1 → **5D** partner perks catalog. 5A made tier real and persisted but deliberately gated nothing. 5B is the first real consumer of that tier: it makes a creator's tier **actually control which merchant missions they can join**.

The `/agent` marketing page promises that higher tiers unlock "exclusive missions." 5B makes that promise real. (It also promises "better commissions" — see *Scope decision* for why that is **not** in 5B.)

## Scope decision — eligibility only, commission deferred

The roadmap concept-line for 5B read "mission eligibility **+ commission splits**." A codebase audit during brainstorming established that **commission is not a real subsystem yet**:

- `mission_settlements` has the amount/status columns (`creator_commission_amount`, `affiliate_commission_amount`, `kinnso_commission_amount`, `creator_payout_status`, …) but they are **100% manually entered by ops** via `updateSettlementAction`. There is **no calculation engine and no automation**.
- Travelpayouts offers hardcode a static 70/30 creator/kinnso split as **forward-looking display metadata** (`offer-catalog.ts` comment: "the current earnings math derives from `mission_settlements`, not these fields").
- There is **no Stripe / Cashier / payment processor** anywhere in the repo.

"Wire tier into commission splits" therefore has no engine to wire into — it would mean *building* a settlement/payout machinery with no payment rails behind it, which violates the roadmap's honesty principle. **Commission is deferred to its own future phase** (a real settlement + payout engine), and 5B is scoped to **mission eligibility gating only**. This keeps 5B a single, clean, fully real, end-to-end testable subsystem.

## Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|---|---|
| D1 | Scope | **Eligibility gating only.** Commission splits deferred to a future phase with a real settlement/payout engine. |
| D2 | Gate location | **Per-mission `min_tier`, merchant-set** at creation (nullable; `null` = open to all = default). |
| D3 | Gate behavior | **Hard gate, shown as locked.** Ineligible missions still appear in discovery as a disabled "Requires Pro" card; the join is rejected server-side. |
| D4 | Gate eligibility | **Merchant missions only.** Travelpayouts affiliate offers can never carry a gate (preserves the open-affiliate-community ethos and keeps the seeded catalog reachable by all). |
| D5 | Enforcement | **Defense in depth** — a friendly check in `joinMissionAction` **plus** a DB-level guard in the `mission_participants` insert RLS policy. |
| D6 | Eligibility evaluation | **Live, re-evaluated each visit.** No `tier_at_join` snapshot. **No revocation** — a creator who later drops below a mission's tier keeps any participation they already have. |

## Architecture — the key insight

The gate compares **the current creator's own tier** against a mission's requirement — the *same user* — so the app-layer check stays **owner-scoped**: `getCreatorContribution(supabase, user.id)` already reads the creator's own `creator_contribution` row under 5A's owner-only RLS. **No cross-creator `SECURITY DEFINER` read is needed in the app layer**, and 5A's privacy guarantee (tier never exposed to anon or to other creators) is preserved untouched.

Discovery needs **no RLS change**. Open merchant missions are already visible to every creator via the existing `missions_visible_select` policy (`status='published' AND visibility='open'`). 5B does **not** filter them out — it annotates each as eligible/locked and gates only the **join** (the `mission_participants` insert).

```
discover:  /studio/missions  → list open merchant missions (RLS unchanged)
             → fetch creator's own tier (owner-scoped, once)
             → annotate each mission { locked, requiredTier } via meetsTier()
             → render locked cards (disabled join, "reach Pro" motivator)

join:      joinMissionAction(missionId)
             → load mission; if min_tier set and !meetsTier(creatorTier, min_tier)
                 → friendly formError (no insert attempted)
             → insert mission_participants
                 → RLS WITH CHECK also requires creator_meets_mission_tier(mission_id)
                   (DB backstop; a bypass attempt fails the insert)
```

## Data model (one migration, repo-root `supabase/migrations`)

**`ALTER TABLE missions ADD COLUMN min_tier text`** — nullable; `null` = open to all (the default). Two check constraints:

- `min_tier is null or min_tier in ('rising','pro','elite')` — `seed` is intentionally **not** allowed: everyone is ≥ seed, so a seed gate is meaningless and `null` is the canonical "open" sentinel.
- `min_tier is null or mission_source = 'merchant'` — enforces D4 (merchant missions only); a Travelpayouts row can never carry a gate.

**`creator_meets_mission_tier(p_mission_id uuid) returns boolean`** — `SECURITY DEFINER`, mirroring the 5A function conventions (same schema/owner/`search_path` discipline as `recompute_creator_contribution`).

- Reads `missions.min_tier`. If `null` → returns `true`.
- Otherwise compares the **caller's own** tier (`auth.uid()` → `creator_contribution`) tier-rank against the requirement. A missing contribution row is treated as `seed`.
- It only ever reads `auth.uid()`'s own tier, so there is **no cross-creator leak** despite `SECURITY DEFINER`.

**Extend `mission_participants_actor_insert`** — add `AND creator_meets_mission_tier(mission_id)` to the policy's `WITH CHECK`, alongside the existing visibility/source/status guards. This is the DB-level backstop for D5.

**No backfill.** The new column defaults `null`, so every existing mission stays open.

## Shared logic — `lib/contribution/tiers.ts` (single source of truth)

Add to the canonical ladder module (the SQL helper mirrors the same rank order by comment, the convention 5A established):

- `GatedTier = 'rising' | 'pro' | 'elite'` — the allowed values for `min_tier`.
- `tierRank(tier: Tier): number` — index in `TIERS` (`seed`=0 … `elite`=3).
- `meetsTier(creatorTier: Tier, required: GatedTier | null): boolean` — `required === null` → `true`; else `tierRank(creatorTier) >= tierRank(required)`.

## Web / server

- **`lib/missions/types.ts`** — `MissionDraftInput` gains `minTier?: GatedTier | null`.
- **`lib/missions/actions.ts`** —
  - `buildMissionInsert` persists `min_tier`.
  - `joinMissionAction`: after loading the mission, if `mission.min_tier` is set and `!meetsTier(creatorTier, mission.min_tier)`, return a friendly `formError` ("Reach the {tier} tier to join this mission") **without attempting the insert**. If the insert is somehow reached while ineligible, the RLS `WITH CHECK` rejects it and the action maps the policy violation to the same friendly message.
- **`lib/missions/queries.ts`** — discovery returns the same rows; the page annotates eligibility (see below). Add a small `countGatedMissionsByTier(supabase)` returning counts of currently-published gated **open merchant** missions grouped by `min_tier`, for the `/studio/tier` unlocks section.
- **`app/[locale]/studio/missions/page.tsx`** and **`.../[id]/page.tsx`** — fetch `getCreatorContribution(supabase, user.id)` once and pass the creator's tier to the view, which derives `{ locked, requiredTier }` per mission via `meetsTier`.

## UI

- **Locked mission card** (`CreatorMissionsView` + the detail view) — a `TierBadge` of the requirement, the join/apply button disabled, and a motivational line built from `progressToNext`: "Requires Pro — you're Rising, 95 points to go." Decorative icons `aria-hidden`.
- **Merchant post wizard** — a min-tier selector: "Open to all / Rising+ / Pro+ / Elite+", persisted via `minTier`.
- **`/studio/tier` "what unlocks" section** — replaces 5A's `unlocksPlaceholder` in `StudioTierView`. Per-tier honest copy ("Pro unlocks exclusive Pro-tier missions") plus a **live count** from `countGatedMissionsByTier` ("3 missions require Pro"). Ties the ladder to a concrete reason to climb.

## i18n

New keys across all **7 locales** (en/ja/ko/th/zh-cn/zh-hk/zh-tw) + the parity test `GROUPS`:

- `missions` group: `lockedBadge` ("Requires {tier}"), `lockedHelp` ("Reach {tier} to unlock — {points} points to go"), `minTierLabel`, `minTierOpen`, `minTierRising`, `minTierPro`, `minTierElite`, and a detail-page `gatedNotice`.
- `tier` group: unlocks-section heading + per-tier unlock copy + the "{count} missions" count string.

`en.ts` is the **default** export and holds the `Messages` interface (adding keys there forces all 7 via `tsc`).

## Error handling

- `min_tier null` → always eligible. Missing `creator_contribution` row → `seed` (eligible only for open missions).
- `joinMissionAction` never throws on ineligibility — it returns a typed `formError`. A policy-violation backstop maps to the same message.
- **No revocation on tier drop** (D6): the gate fires only on the participant **insert**. Existing `applied` / `active` / `completed` participations are never re-checked.

## Testing (TDD, repo conventions)

Render tests: `// @vitest-environment jsdom` first line, `afterEach(cleanup)`, `import en from '@/lib/i18n/messages/en'`. Per-task gate: `pkill -f vitest` then `pnpm exec vitest run <files> --no-file-parallelism` + `pnpm exec tsc --noEmit`. Decorative arrows/icons `aria-hidden`.

- **Unit — `tiers.ts`:** `tierRank` ordering (seed<rising<pro<elite); `meetsTier` matrix — `null` → always true; each requirement (rising/pro/elite) × each creator tier (seed/rising/pro/elite) yields the correct boolean.
- **Query/action:** `joinMissionAction` — rejected when ineligible, allowed when eligible, allowed for a `null` gate; `min_tier` persisted by create; discovery annotation produces correct `{ locked, requiredTier }`; `countGatedMissionsByTier` shape. (Repo's mocked-builder style.)
- **Render (jsdom):** locked mission card (requirement badge + disabled join + points-to-go), merchant wizard min-tier selector, `/studio/tier` unlocks section with counts.
- **i18n parity:** new keys present in all 7 locales + added to `GROUPS`.
- **SQL live via Supabase MCP** (no local DB, consistent with prior phases): apply migration; set a merchant mission `min_tier='pro'` and attempt to join as the `@creator` owner (seed, 10 pts) → RLS rejects; an open-mission join succeeds; the `mission_source` constraint rejects setting `min_tier` on a Travelpayouts row; the tier-value constraint rejects `'seed'`.

## Non-goals (deferred)

- **Commission / payout** of any kind — needs a settlement engine + payment rails; its own future phase.
- **Merchant-side mock match scoring** (`creator-mock` `computeMatch`/`tierFit`, still keyed off mock DNA score) — backlog; `/merchants/creators` is cut from nav.
- **`tier_at_join` snapshot** — only useful for commission; YAGNI for eligibility-only.
- **"You can now join" notifications** when a creator levels into a mission's tier — later polish (`tier_updated_at` already exists).
- **Revocation** of existing participations on tier drop.
- **Gating Travelpayouts offers**, the **Copilot** (5C), or **perks** (5D).
- **Targeted-mission audience definition** — `visibility='targeted'` stays a separate, unrelated mechanism; 5B does not touch it.

## Sequencing

5A is unblocked: PR #39 (Phase 3) and #40 (Phase 4) are both merged to `main`. **Land 5A first** — rebase `feat/phase5a-tier-backbone` onto `main`, push, open its 5A-only PR, merge. Then **rebase `feat/phase5b-tier-gating` onto `main`** (it is currently stacked on 5A) before opening 5B's PR, so 5B's diff is clean.

## Success criteria

- A merchant can set a minimum tier ("Rising+/Pro+/Elite+" or open) when creating a mission; it persists on `missions.min_tier`.
- A creator below a mission's tier sees it as a locked card with an honest "reach {tier}" motivator and **cannot** join — enforced both in the action (friendly error) and at the DB (RLS), so it cannot be bypassed.
- A creator at or above the tier joins normally; open missions (and all Travelpayouts offers) are joinable by everyone.
- Tier remains creator-private — the gate reads only the caller's own tier.
- `/studio/tier` shows what each higher tier unlocks, with live mission counts.
- No commission behavior changes; no existing participation is revoked by a tier drop.
