# Phase 7 — Merchant Depth (real creator search + tier/quota + invite loop) — Design Spec

**Date:** 2026-06-27
**Status:** Approved design → next: implementation plan (writing-plans)
**Depends on:** PR #42 (Phase 6 admin panel) merged to `main` first — Phase 7 branches off the updated `main`.

## 1. Overview

Make the **merchant (demand) side real**. Today `/merchants/creators` is a mock UI (cut from nav in Phase 1) whose match scores, follower counts, and engagement rates are fabricated, and `merchant_profiles` has no tier/quota. Phase 7 turns it into an honest, gated creator-discovery surface backed by real public data, adds an ops-set merchant **tier + invite quota**, and closes a real **invite → accept** loop into the existing mission system.

This is "discovery + light monetization" in one cohesive phase. **Billing (Stripe) remains a v1 non-goal** — tier is set by ops, "upgrade" is a contact CTA.

## 2. Honesty guardrails (non-negotiable)

The reorg's whole ethos is honest, real-only surfaces (Phase 2/3 deleted fabricated metrics). Phase 7 must not regress that:

- **Search/match uses PUBLIC creator attributes only:** niches, content pillars, audience geos, audience locales, languages, platforms (`creators.public_profile` jsonb, minted by the Phase-3 DNA-publish trigger), `creators.handle`/`display_name`/`bio`, and published-guide count. **Follower counts, engagement rate, and any "score" stay private** (`creator_dna`, never exposed to anon/merchants).
- **No "match %".** Ranking is by transparent overlap with the merchant's *active search filters*, with each card stating the **reasons** it surfaced ("Shares 2 niches · audience HK/JP · 5 guides"). No fabricated precision.
- **No fabricated merchant profile.** Real `merchant_profiles` has no niche/geo/category. v1 derives relevance from the merchant's **active filters**, not a stored target profile (see §5). A stored merchant target-profile is an explicit future enhancement, out of scope here.

## 3. Scope

**In scope:**
1. Real, merchant-gated creator search at `/merchants/creators` (honest filters + relevance + reasons), re-added to merchant nav.
2. Merchant **tier** (`free`/`growth`) on `merchant_profiles`, ops-set; free = capped results + locked filters + low monthly invite quota; growth = full + higher quota.
3. **Invite → accept** loop: merchant invites a creator to one of its published missions (quota-enforced); creator sees and accepts the invitation in `/studio/missions`.
4. **Saved creators + private notes** (merchant CRM).
5. **Working** tab: creators with active/completed participations on this merchant's missions (derived, read-only).
6. Ops control to set a merchant's tier, extending the Phase-6 `/admin/users` merchants section.

**Out of scope (YAGNI / non-goals):**
- Stripe / billing / self-serve upgrade (v1 non-goal — ops sets tier; upgrade = contact CTA).
- A stored merchant target-profile for personalized default recommendations (future enhancement).
- A "searches/month" counter (gameable, low-value — dropped; the free→growth incentive is the result-cap + filter-lock + invite quota).
- Exposing any private creator engagement/follower data.
- `/studio/inbox` messaging (separate deferred backlog item; the invite loop reuses missions instead).

## 4. Data model (one migration)

`supabase/migrations/<ts>_merchant_depth.sql`, applied live (controller, with consent):

### 4.1 Merchant tier
```sql
alter table public.merchant_profiles
  add column if not exists tier text not null default 'free'
  check (tier in ('free','growth'));
```
Quota/cap numbers are **tier→constant in code** (not per-row columns): `free` = 3 results shown, filters locked, **3 invites / calendar month**; `growth` = unlimited results, filters on, **30 invites / calendar month**. Centralized in `lib/merchants/tier-policy.ts` so UI and the DB function agree.

### 4.2 Saved creators (merchant-private)
```sql
create table public.merchant_saved_creators (
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  creator_id  uuid not null references public.creators(id) on delete cascade,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  primary key (merchant_id, creator_id)
);
alter table public.merchant_saved_creators enable row level security;
-- Owner = the merchant that owns merchant_id. Anon revoked.
create policy merchant_saved_creators_owner on public.merchant_saved_creators
  for all using (exists (select 1 from public.merchant_profiles m
    where m.id = merchant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.merchant_profiles m
    where m.id = merchant_id and m.user_id = auth.uid()));
revoke all on public.merchant_saved_creators from anon;
grant select, insert, update, delete on public.merchant_saved_creators to authenticated;
```

### 4.3 Invite function (SECURITY DEFINER)
```sql
create or replace function public.merchant_invite_creator(p_mission_id uuid, p_creator_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_merchant uuid; v_tier text; v_used int; v_limit int; v_pid uuid;
begin
  -- caller must own a published merchant mission
  select m.id, m.tier into v_merchant, v_tier
    from public.merchant_profiles m
    join public.missions mi on mi.merchant_profile_id = m.id
    where mi.id = p_mission_id and m.user_id = auth.uid()
      and m.status = 'active' and mi.status = 'published'
      and mi.mission_source = 'merchant';
  if v_merchant is null then raise exception 'not_authorized'; end if;
  -- monthly invite quota (derived; no usage table)
  v_limit := case v_tier when 'growth' then 30 else 3 end;
  select count(*) into v_used from public.mission_participants mp
    join public.missions mi on mi.id = mp.mission_id
    where mi.merchant_profile_id = v_merchant and mp.source = 'merchant_invite'
      and mp.created_at >= date_trunc('month', now());
  if v_used >= v_limit then raise exception 'invite_quota_exceeded'; end if;
  -- target creator must exist + be active
  if not exists (select 1 from public.creators where id = p_creator_id and status = 'active')
    then raise exception 'creator_not_found'; end if;
  -- idempotent-ish: block a duplicate participation
  if exists (select 1 from public.mission_participants
    where mission_id = p_mission_id and creator_id = p_creator_id)
    then raise exception 'already_participant'; end if;
  -- INTENTIONALLY bypasses the Phase-5B tier gate: a direct invite is the
  -- merchant's explicit choice and must not leak the creator's private tier.
  insert into public.mission_participants (mission_id, creator_id, status, source)
    values (p_mission_id, p_creator_id, 'invited', 'merchant_invite')
    returning id into v_pid;
  return v_pid;
end $$;
```

### 4.4 Accept-invite function (SECURITY DEFINER)
```sql
create or replace function public.accept_mission_invite(p_mission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.mission_participants
    set status = 'active'
    where mission_id = p_mission_id and creator_id = auth.uid()
      and status = 'invited' and source = 'merchant_invite';
  if not found then raise exception 'no_invite'; end if;  -- tier-gate-exempt: they were invited
end $$;
```

### 4.5 Ops: set merchant tier (SECURITY DEFINER, ops-gated)
```sql
create or replace function public.admin_set_merchant_tier(p_id uuid, p_tier text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_tier not in ('free','growth') then raise exception 'bad_tier'; end if;
  update public.merchant_profiles set tier = p_tier where id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;
```

### 4.6 Grants (all four functions)
`revoke all on function … from public, anon;` then `grant execute … to authenticated;` (the 6B anon-revoke lesson; advisor 0028). After the migration: regenerate `packages/db/types.ts` via the Supabase MCP.

## 5. Creator search surface — `/merchants/creators`

- **Gate (inline, page-level):** `resolveViewerRole === 'merchant'` → render; anon → redirect to sign-in; other roles → `notFound()`. (Next renders layout + page in parallel — gate in the page, the "layout-page-parallel-gate" lesson.)
- **Query (`lib/merchants/creator-search.ts`):** read public `creators` (active, has handle + public_profile) + published-guide counts (reuse the Phase-3 public RLS + `getPublicCreators` shape; extend to expose audience geos/locales/languages/platforms from `public_profile`).
- **Honest filters (`CreatorFilterDrawer`, rebuilt):** niche, audience geo, language, platform, has-published-guides. **Removed:** follower count, engagement rate, "score" range, activity-days (all private/absent).
- **Relevance (`lib/merchants/relevance.ts`):** when filters are active, rank by **count of matched filter dimensions** (desc), tie-broken by most-recent published guide. No filters → recent-activity order. Each card lists the **reasons** that matched. Pure, unit-testable function.
- **Tier gating (from `tier-policy.ts`):** `free` → results sliced to top 3 + filter drawer locked (lock icon + upgrade banner with a contact CTA) + remaining-invite count; `growth` → full results + filters.
- **Tabs:** Recommended (ranked) · Saved (notes) · Working (derived active/completed participations on this merchant's missions).
- `CreatorMatchCard` rebuilt to show only public attributes (avatar fallback initial, name/handle, niches, audience chips, guide count, reasons) — **no follower/ER/score**. Quick-view drawer renders the real `CreatorProfileView` (already real from Phase 3) + Save + Send-Brief.

## 6. Invite flow

- **Send Brief** (quick-view footer): opens a small mission picker listing the merchant's **published** missions → calls `inviteCreatorAction(missionId, creatorId)` → `rpc('merchant_invite_creator')`. Maps `invite_quota_exceeded` / `already_participant` / `creator_not_found` / `not_authorized` to friendly typed errors. On success, decrements the displayed remaining-invite count and marks the creator "Invited".
- Remaining invites for the period are read server-side (same derived count as the function) and passed to the view.

## 7. Creator side — accept the invite (`/studio/missions`)

- `listCreatorMerchantMissions` already embeds `mission_participants(status, source, creator_id)`. Add a derived **"Invitations"** section/filter in `CreatorMissionsView` for the viewer's own rows where `status='invited' AND source='merchant_invite'`, each with an **Accept invitation** CTA → `acceptInviteAction(missionId)` → `rpc('accept_mission_invite')` → becomes `active`. Tier-gate-exempt (they were directly invited). After accept, the mission behaves like any active participation (existing milestone/submission flow).

## 8. Admin — set merchant tier

Extend the Phase-6 `/admin/users` **merchants** section: each merchant row gains a **tier** control (free/growth dropdown or toggle) → `setMerchantTierAction` → `rpc('admin_set_merchant_tier')`, ops-gated, `revalidatePath`. Reuses `requireOpsAction`, the result helpers, and the existing `AdminUsersView` merchants list.

## 9. Navigation

Re-add `/merchants/creators` to the **merchant** nav (reverses the Phase-1 cut), alongside `/merchants/missions`. New `nav.linkCreators` key. No public/anon nav change.

## 10. Error handling

| Condition | Behavior |
|---|---|
| Non-merchant hits `/merchants/creators` | page `notFound()` (anon → sign-in) |
| Free merchant tries locked filters | drawer disabled + upgrade (contact) CTA; no error |
| Invite over quota | `merchant_invite_creator` raises `invite_quota_exceeded` → typed friendly error; count unchanged |
| Invite to a mission not owned/published | `not_authorized` → typed error |
| Duplicate invite / already a participant | `already_participant` → typed error |
| Creator accepts a non-existent invite | `accept_mission_invite` raises `no_invite` → typed error |
| Ops sets a bad tier / missing merchant | `bad_tier` / `not_found` → typed error |
| Empty search / no saved / no working | honest empty states |

## 11. Testing (TDD, per plan)

- Migration applied live + verified: tier column + CHECK; `merchant_saved_creators` RLS blocks non-owners + anon; the 4 functions exist, gated, anon/public EXECUTE = 0; `merchant_invite_creator` enforces ownership + quota + dedupe and bypasses the tier gate; `accept_mission_invite` flips only the caller's invited row; `admin_set_merchant_tier` ops-only.
- Unit: `tier-policy` (caps/quota by tier), `relevance` (matched-dimension ranking + reasons), `creator-search` mapping, saved-creator queries/actions, `inviteCreatorAction` / `acceptInviteAction` / `setMerchantTierAction` error mapping.
- Component: rebuilt `MerchantsCreatorsView` (real data, free-cap + filter-lock, tabs, invite), `CreatorMatchCard` (public-only), `CreatorMissionsView` invitations section.
- Host: `/merchants/creators` (merchant renders / non-merchant notFound), `/studio/missions` invite-accept, `/admin/users` tier control.
- i18n parity across all 7 locales for the new keys.
- **Finish gate:** full `vitest run` (not a targeted sweep — the 5B host-test-gap lesson), tsc, lint, `next build` with `/merchants/creators` in the manifest.

## 12. Branch / integration

- **Merge PR #42 first**, then branch `feat/phase7-merchant-depth` off the updated `main`. Its own PR (base `main`). Avoids the squash-merge stranding we untangled for #42.
- Live migration controller-applied via Supabase MCP (project `scryfkefedzuetfdtrvl`) with explicit user consent; subagents never call the MCP. Types regenerated via the MCP after the migration.
- 2-lens review (security-auditor + code-reviewer) at the finish gate.

## 13. Open items the owner confirms

1. Tier numbers: free = 3 results / filters locked / 3 invites per month; growth = unlimited / filters on / 30 invites per month. Adjust if desired.
2. Invite **bypasses** the mission tier gate by design (merchant's explicit choice; avoids leaking private tier). Confirm this is the intended behavior vs. restricting invites to tier-qualifying creators.
3. Relevance derives from active filters (no stored merchant target-profile in v1). Confirm deferring the stored target-profile.
