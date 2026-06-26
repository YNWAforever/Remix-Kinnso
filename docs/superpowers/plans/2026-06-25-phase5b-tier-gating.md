# Phase 5B — Creator Tier Gating (mission eligibility) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a creator's real Phase-5A tier actually gate which merchant missions they can join, shown as locked cards, with no commission changes.

**Architecture:** A nullable `missions.min_tier` (merchant-set) gates the `mission_participants` insert via a `SECURITY DEFINER` helper in the RLS `WITH CHECK` (DB backstop) plus a friendly check in `joinMissionAction` (UX). Discovery is unchanged at the RLS level — locked missions stay visible and are annotated. The gate compares only the **current** creator's own tier (owner-scoped read), so 5A's tier privacy is preserved.

**Tech Stack:** Next.js 16 (App Router, RSC) + React 19 + TypeScript; hosted Supabase (Postgres + RLS); Vitest + Testing Library; 7-locale i18n.

**Spec:** `docs/superpowers/specs/2026-06-25-phase5b-tier-gating-design.md`

**Conventions (every task obeys):**
- All `pnpm`/`vitest`/`tsc` commands run from `kinnso-v3/apps/web`.
- Migrations live at repo-root `kinnso-v3/supabase/migrations`.
- Per-task gate: `pkill -f vitest` then `pnpm exec vitest run <files> --no-file-parallelism` and `pnpm exec tsc --noEmit`.
- Render tests: first line `// @vitest-environment jsdom`, `afterEach(cleanup)`, `import en from '@/lib/i18n/messages/en'`. Decorative icons `aria-hidden="true"`.
- Commits: conventional `feat(sp5b)/test(sp5b)/...`, and every commit message ends with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- DB type regen uses the **Supabase MCP** tool `generate_typescript_types` (NOT the hanging `supabase gen types --linked` CLI).

---

## File Structure

**Created:**
- `kinnso-v3/supabase/migrations/20260625100000_mission_tier_gating.sql` — `missions.min_tier` column + constraints, `contribution_tier_rank`, `app_private.creator_meets_mission_tier`, recreated insert policy.
- `kinnso-v3/apps/web/tests/contribution.tierGate.test.ts` — `tierRank`/`meetsTier` unit tests.

**Modified:**
- `apps/web/lib/contribution/tiers.ts` — `GatedTier`, `tierRank`, `meetsTier`.
- `apps/web/lib/i18n/messages/{en,ja,ko,th,zh-cn,zh-hk,zh-tw}.ts` — `missions` gating keys + `tier` unlocks keys; remove `unlocksPlaceholder` (Task 10).
- `apps/web/lib/missions/types.ts` — `MissionDraftInput.minTier`.
- `apps/web/lib/missions/actions.ts` — `buildMissionInsert` persists `min_tier`; `joinMissionAction` tier gate.
- `apps/web/lib/missions/queries.ts` — `min_tier` in selects + `countGatedMissionsByTier`.
- `apps/web/components/kinnso/pages/CreatorMissionsView.tsx` — locked card.
- `apps/web/app/[locale]/studio/missions/page.tsx` — annotate `locked`/`requiredTier`.
- `apps/web/components/kinnso/pages/CreatorMissionDetailView.tsx` — locked state.
- `apps/web/app/[locale]/studio/missions/[id]/page.tsx` — compute + pass `lockedTier`.
- `apps/web/components/kinnso/pages/MissionPostWizard.tsx` — min-tier selector.
- `apps/web/components/kinnso/pages/StudioTierView.tsx` — unlocks section.
- `apps/web/app/[locale]/studio/tier/page.tsx` — fetch + pass gated counts.
- `apps/web/packages/db/types.ts` (path `kinnso-v3/packages/db/types.ts`) — regenerated (adds `missions.min_tier`).
- Tests: `apps/web/tests/mission.actions.test.ts`, `apps/web/tests/mission.queries.test.ts`, `apps/web/tests/kinnso.CreatorMissionsView.test.tsx`, `apps/web/tests/kinnso.CreatorMissionDetailView.test.tsx` (if present; else create), `apps/web/tests/kinnso.MissionPostWizard.test.tsx` (create), `apps/web/tests/kinnso.StudioTierView.test.tsx`.

---

## Task 1: Tier-comparison logic in `tiers.ts`

**Files:**
- Modify: `apps/web/lib/contribution/tiers.ts`
- Create: `apps/web/tests/contribution.tierGate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/contribution.tierGate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { tierRank, meetsTier } from '@/lib/contribution/tiers'

describe('tierRank', () => {
  it('orders the ladder seed < rising < pro < elite', () => {
    expect(tierRank('seed')).toBe(0)
    expect(tierRank('rising')).toBe(1)
    expect(tierRank('pro')).toBe(2)
    expect(tierRank('elite')).toBe(3)
  })
})

describe('meetsTier', () => {
  it('returns true for a null requirement regardless of tier', () => {
    expect(meetsTier('seed', null)).toBe(true)
    expect(meetsTier('elite', null)).toBe(true)
  })

  it('requires the creator tier to be at or above the requirement', () => {
    // requirement: rising
    expect(meetsTier('seed', 'rising')).toBe(false)
    expect(meetsTier('rising', 'rising')).toBe(true)
    expect(meetsTier('pro', 'rising')).toBe(true)
    expect(meetsTier('elite', 'rising')).toBe(true)
    // requirement: pro
    expect(meetsTier('rising', 'pro')).toBe(false)
    expect(meetsTier('pro', 'pro')).toBe(true)
    expect(meetsTier('elite', 'pro')).toBe(true)
    // requirement: elite
    expect(meetsTier('pro', 'elite')).toBe(false)
    expect(meetsTier('elite', 'elite')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```
cd kinnso-v3/apps/web && pkill -f vitest; pnpm exec vitest run tests/contribution.tierGate.test.ts --no-file-parallelism
```
Expected: FAIL — `tierRank`/`meetsTier` are not exported.

- [ ] **Step 3: Implement**

Append to `apps/web/lib/contribution/tiers.ts` (after `progressToNext`):

```ts
/** Tiers that can gate a mission. `seed` is excluded — everyone is >= seed, so a
 *  seed gate is meaningless and `null` is the canonical "open to all" value. */
export type GatedTier = Exclude<Tier, 'seed'>

/** Position of a tier in the ladder. Mirrors SQL public.contribution_tier_rank. */
export function tierRank(tier: Tier): number {
  return TIERS.indexOf(tier)
}

/** True when `creatorTier` satisfies `required`. A null requirement is always met. */
export function meetsTier(creatorTier: Tier, required: GatedTier | null): boolean {
  if (required === null) return true
  return tierRank(creatorTier) >= tierRank(required)
}
```

- [ ] **Step 4: Run the test (PASS)**

```
pnpm exec vitest run tests/contribution.tierGate.test.ts --no-file-parallelism && pnpm exec tsc --noEmit
```
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```
git add apps/web/lib/contribution/tiers.ts apps/web/tests/contribution.tierGate.test.ts
git commit -m "feat(sp5b): tier-rank + meetsTier gating helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Migration — `min_tier` column, gate function, recreated insert policy

**Files:**
- Create: `kinnso-v3/supabase/migrations/20260625100000_mission_tier_gating.sql`
- Regenerate: `kinnso-v3/packages/db/types.ts`

There is no Vitest DB; SQL is applied + verified live via Supabase MCP, exactly like Phase 3/4/5A.

- [ ] **Step 1: Write the migration file**

Create `kinnso-v3/supabase/migrations/20260625100000_mission_tier_gating.sql`:

```sql
-- Phase 5B: creator tier gating for mission eligibility.
-- Per-mission minimum tier (merchant-set). Gate applies to the CREATOR self-join
-- branch of mission_participants insert. Reads only the caller's own tier, so 5A's
-- tier privacy holds. RANKS MIRROR apps/web/lib/contribution/tiers.ts (tierRank).
-- Merchant invites (source='merchant_invite') intentionally bypass the gate.

-- 1. Per-mission minimum tier. NULL = open to all (default). 'seed' is disallowed
--    (everyone is >= seed). Only merchant missions can carry a gate.
alter table public.missions add column min_tier text;
alter table public.missions
  add constraint missions_min_tier_values_check
  check (min_tier is null or min_tier in ('rising','pro','elite'));
alter table public.missions
  add constraint missions_min_tier_merchant_only_check
  check (min_tier is null or mission_source = 'merchant');

-- 2. tier -> rank (mirrors tiers.ts tierRank).
create or replace function public.contribution_tier_rank(p_tier text)
returns int language sql immutable as $$
  select case p_tier
    when 'seed'   then 0
    when 'rising' then 1
    when 'pro'    then 2
    when 'elite'  then 3
    else 0
  end;
$$;

-- 3. Does the CALLER's own tier meet the mission's requirement?
--    SECURITY DEFINER but reads only auth.uid()'s own contribution row — no leak.
--    NULL min_tier (or unknown mission) => open => true. Missing row => 'seed'.
create or replace function app_private.creator_meets_mission_tier(target_mission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select m.min_tier from public.missions m where m.id = target_mission_id) is null
      then true
    else public.contribution_tier_rank(
           coalesce(
             (select c.tier from public.creator_contribution c
               where c.creator_id = (select auth.uid())),
             'seed')
         ) >= public.contribution_tier_rank(
           (select m.min_tier from public.missions m where m.id = target_mission_id)
         )
  end;
$$;

revoke all on function app_private.creator_meets_mission_tier(uuid) from public;
grant execute on function app_private.creator_meets_mission_tier(uuid) to authenticated;

-- 4. Recreate the participant insert policy, adding the tier gate to the creator
--    self-join branch only (merchant_invite branch unchanged). Verbatim copy of
--    20260617173938_mission_rls.sql with one added `and` clause.
drop policy "mission_participants_actor_insert" on public.mission_participants;

create policy "mission_participants_actor_insert" on public.mission_participants
  for insert
  to authenticated
  with check (
    (
      creator_id = (select auth.uid())
      and app_private.creator_meets_mission_tier(mission_participants.mission_id)
      and exists (
        select 1
        from public.missions mission
        where mission.id = mission_participants.mission_id
          and mission.status = 'published'
          and mission.visibility = 'open'
          and (
            (
              mission_participants.source = 'open_join'
              and mission_participants.status = 'active'
              and mission.mission_type = 'coupon_affiliate'
            )
            or (
              mission_participants.source = 'affiliate_network_join'
              and mission_participants.status = 'active'
              and mission.mission_source = 'travelpayouts'
            )
            or (
              mission_participants.source = 'application'
              and mission_participants.status = 'applied'
              and mission.mission_type in ('hybrid','paid')
            )
          )
      )
    )
    or (
      source = 'merchant_invite'
      and status = 'invited'
      and (
        exists (
          select 1
          from public.missions mission
          join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
          where mission.id = mission_participants.mission_id
            and merchant.user_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.kinnso_ops_members ops
          where ops.user_id = (select auth.uid())
            and ops.status = 'active'
        )
      )
    )
  );
```

- [ ] **Step 2: Apply the migration live (Supabase MCP)**

Use the Supabase MCP tool `apply_migration` with `name: "mission_tier_gating"` and `query` = the full file contents above (ToolSearch `select:mcp__supabase__apply_migration` if the schema is not loaded).

Expected: success, no error.

- [ ] **Step 3: Verify live (Supabase MCP `execute_sql`)**

Run these (via `mcp__supabase__execute_sql`) and confirm each result:

```sql
-- (a) column + constraints exist
select column_name from information_schema.columns
  where table_name = 'missions' and column_name = 'min_tier';            -- 1 row
select conname from pg_constraint
  where conname in ('missions_min_tier_values_check','missions_min_tier_merchant_only_check'); -- 2 rows

-- (b) rank function boundaries (pure)
select public.contribution_tier_rank('seed')   as seed,    -- 0
       public.contribution_tier_rank('rising') as rising,  -- 1
       public.contribution_tier_rank('pro')    as pro,     -- 2
       public.contribution_tier_rank('elite')  as elite;   -- 3

-- (c) gate fn open path: unknown mission => null min_tier => true
select app_private.creator_meets_mission_tier('00000000-0000-0000-0000-000000000000'::uuid); -- true

-- (d) policy was recreated and references the gate fn
select pg_get_expr(pol.polwithcheck, pol.polrelid) like '%creator_meets_mission_tier%' as has_gate
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
where c.relname = 'mission_participants' and pol.polname = 'mission_participants_actor_insert'; -- true

-- (e) value constraint rejects 'seed' (expect ERROR: violates missions_min_tier_values_check)
do $$ begin
  update public.missions set min_tier = 'seed' where false;  -- no-op guard; see note
end $$;
```

Note for (e): a clean rejection test needs a real merchant mission row. If `select count(*) from public.missions where mission_source='merchant'` is 0, skip the live UPDATE attempt and rely on the value/merchant-only constraints being present (verified in (a)); the behavioral rejection is covered by the constraint definition + the owner smoke. If a merchant mission exists, run `update public.missions set min_tier='seed' where id='<that id>'` and confirm it errors with `missions_min_tier_values_check`, then `update ... set min_tier='pro'` succeeds, then set it back to `null`.

Behavioral RLS note: MCP `execute_sql` runs as the service role (`auth.uid()` is null), so the RLS *block* of an ineligible creator cannot be exercised here. That path is covered by the `joinMissionAction` test (Task 5) and the owner signed-in smoke. The DB guard is verified structurally by (d).

- [ ] **Step 4: Regenerate DB types (Supabase MCP)**

Call `mcp__supabase__generate_typescript_types`. From its JSON result, take the `.types` string and write it verbatim to `kinnso-v3/packages/db/types.ts` (overwrite). Confirm `min_tier` now appears under the `missions` table:

```
cd kinnso-v3/apps/web && grep -n "min_tier" ../../packages/db/types.ts
```
Expected: matches in the `missions` Row/Insert/Update blocks.

- [ ] **Step 5: tsc still clean**

```
pnpm exec tsc --noEmit
```
Expected: clean (no code references `min_tier` yet; the regen must not break existing types).

- [ ] **Step 6: Commit**

```
cd kinnso-v3
git add supabase/migrations/20260625100000_mission_tier_gating.sql packages/db/types.ts
git commit -m "feat(sp5b): mission min_tier column + creator_meets_mission_tier gate (migration applied live)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: i18n — gating keys (`missions`) + unlocks keys (`tier`), all 7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface + literal), then `ja.ts`, `ko.ts`, `th.ts`, `zh-cn.ts`, `zh-hk.ts`, `zh-tw.ts`.

`missions` and `tier` are already in the parity `GROUPS`, so no test edit is needed — the parity test will FAIL until all 7 locales match `en`. Keep `unlocksPlaceholder` for now (removed in Task 10 when the view stops using it).

- [ ] **Step 1: Run the parity test to see it green first (baseline)**

```
cd kinnso-v3/apps/web && pkill -f vitest; pnpm exec vitest run tests/i18n.locale-parity.test.ts --no-file-parallelism
```
Expected: PASS (baseline before edits).

- [ ] **Step 2: en.ts — add to the `Messages` interface**

In `apps/web/lib/i18n/messages/en.ts`, inside `interface Messages` → the `missions: { ... }` block (starts ~line 300), add after `creatorFallback: string`:

```ts
    locked: string
    lockedHelp: string
    minTierLabel: string
    minTierOpen: string
    minTierRising: string
    minTierPro: string
    minTierElite: string
```

In the `tier: { ... }` interface block (starts ~line 558), add after `unlocksPlaceholder: string`:

```ts
    unlocksHeading: string
    unlocksMissions: string
    unlocksHelp: string
```

- [ ] **Step 3: en.ts — add the English values**

In the `const messages` literal, `missions: { ... }` (starts ~line 877), add before the closing `},` (after `creatorFallback: 'Creator',`):

```ts
    locked: 'Tier locked',
    lockedHelp: 'Reach this tier to unlock this mission.',
    minTierLabel: 'Minimum tier',
    minTierOpen: 'Open to all',
    minTierRising: 'Rising+',
    minTierPro: 'Pro+',
    minTierElite: 'Elite+',
```

In the `tier: { ... }` literal (starts ~line 1213), add before its closing `},` (after `pointsSuffix: 'pts',`):

```ts
    unlocksHeading: 'What you unlock',
    unlocksMissions: 'missions need this tier',
    unlocksHelp: 'Climb tiers to join exclusive missions.',
```

- [ ] **Step 4: Run tsc — it should now flag the other 6 locales**

```
pnpm exec tsc --noEmit
```
Expected: FAIL — `ja/ko/th/zh-cn/zh-hk/zh-tw` are missing the new keys (they implement `Messages`).

- [ ] **Step 5: Add the same keys to the other 6 locale files**

In each of `ja.ts, ko.ts, th.ts, zh-cn.ts, zh-hk.ts, zh-tw.ts`, add to the `missions` group and `tier` group. Tier proper nouns (`Rising+/Pro+/Elite+`) stay in English in all locales (consistent with `TierBadge` labels). Use these translations:

**`missions` additions** (per locale — `minTierRising/Pro/Elite` identical everywhere):

```ts
// ja.ts
    locked: 'ティアロック',
    lockedHelp: 'このティアに到達するとミッションが解放されます。',
    minTierLabel: '最低ティア',
    minTierOpen: '全員に公開',
    minTierRising: 'Rising+', minTierPro: 'Pro+', minTierElite: 'Elite+',
```
```ts
// ko.ts
    locked: '등급 잠김',
    lockedHelp: '이 등급에 도달하면 미션이 열립니다.',
    minTierLabel: '최소 등급',
    minTierOpen: '전체 공개',
    minTierRising: 'Rising+', minTierPro: 'Pro+', minTierElite: 'Elite+',
```
```ts
// th.ts
    locked: 'ล็อกตามระดับ',
    lockedHelp: 'ไปถึงระดับนี้เพื่อปลดล็อกภารกิจนี้',
    minTierLabel: 'ระดับขั้นต่ำ',
    minTierOpen: 'เปิดให้ทุกคน',
    minTierRising: 'Rising+', minTierPro: 'Pro+', minTierElite: 'Elite+',
```
```ts
// zh-cn.ts
    locked: '等级锁定',
    lockedHelp: '达到该等级即可解锁此任务。',
    minTierLabel: '最低等级',
    minTierOpen: '面向所有人',
    minTierRising: 'Rising+', minTierPro: 'Pro+', minTierElite: 'Elite+',
```
```ts
// zh-hk.ts
    locked: '等級鎖定',
    lockedHelp: '達到此等級即可解鎖此任務。',
    minTierLabel: '最低等級',
    minTierOpen: '對所有人開放',
    minTierRising: 'Rising+', minTierPro: 'Pro+', minTierElite: 'Elite+',
```
```ts
// zh-tw.ts
    locked: '等級鎖定',
    lockedHelp: '達到此等級即可解鎖此任務。',
    minTierLabel: '最低等級',
    minTierOpen: '對所有人開放',
    minTierRising: 'Rising+', minTierPro: 'Pro+', minTierElite: 'Elite+',
```

**`tier` additions:**

```ts
// ja.ts
    unlocksHeading: 'アンロック内容',
    unlocksMissions: '件のミッションがこのティアを必要とします',
    unlocksHelp: 'ティアを上げると限定ミッションに参加できます。',
```
```ts
// ko.ts
    unlocksHeading: '잠금 해제 항목',
    unlocksMissions: '개 미션이 이 등급을 요구합니다',
    unlocksHelp: '등급을 올리면 독점 미션에 참여할 수 있습니다.',
```
```ts
// th.ts
    unlocksHeading: 'สิ่งที่ปลดล็อก',
    unlocksMissions: 'ภารกิจต้องใช้ระดับนี้',
    unlocksHelp: 'เลื่อนระดับเพื่อเข้าร่วมภารกิจพิเศษ',
```
```ts
// zh-cn.ts
    unlocksHeading: '你可解锁的内容',
    unlocksMissions: '个任务需要此等级',
    unlocksHelp: '提升等级即可参加专属任务。',
```
```ts
// zh-hk.ts
    unlocksHeading: '你可解鎖的內容',
    unlocksMissions: '個任務需要此等級',
    unlocksHelp: '提升等級即可參加專屬任務。',
```
```ts
// zh-tw.ts
    unlocksHeading: '你可解鎖的內容',
    unlocksMissions: '個任務需要此等級',
    unlocksHelp: '提升等級即可參加專屬任務。',
```

- [ ] **Step 6: Run parity + tsc (PASS)**

```
pnpm exec vitest run tests/i18n.locale-parity.test.ts --no-file-parallelism && pnpm exec tsc --noEmit
```
Expected: PASS; tsc clean.

- [ ] **Step 7: Commit**

```
git add apps/web/lib/i18n/messages
git commit -m "feat(sp5b): i18n gating + unlocks keys across 7 locales

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Persist `min_tier` — `MissionDraftInput` + `buildMissionInsert`

**Files:**
- Modify: `apps/web/lib/missions/types.ts`
- Modify: `apps/web/lib/missions/actions.ts`
- Test: `apps/web/tests/mission.actions.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `apps/web/tests/mission.actions.test.ts`, inside the existing `describe('mission actions builders', ...)` block (or as a new `it` after the existing builder tests), an assertion that `min_tier` is carried through:

```ts
  it('carries min_tier into the mission insert payload', () => {
    const payload = buildMissionInsert({
      input: { ...missionDraftFixture, minTier: 'pro' },
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: true,
    })
    expect(payload.min_tier).toBe('pro')
  })

  it('defaults min_tier to null when the draft is open to all', () => {
    const payload = buildMissionInsert({
      input: { ...missionDraftFixture, minTier: null },
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: false,
    })
    expect(payload.min_tier).toBeNull()
  })
```

- [ ] **Step 2: Run it (FAIL)**

```
cd kinnso-v3/apps/web && pkill -f vitest; pnpm exec vitest run tests/mission.actions.test.ts --no-file-parallelism
```
Expected: FAIL — `minTier` not on `MissionDraftInput` (tsc/test error) and `min_tier` not in payload.

- [ ] **Step 3a: Add `minTier` to `MissionDraftInput`**

In `apps/web/lib/missions/types.ts`, add `import` is not needed (GatedTier is local-domain; reference the tiers module). Add this near the top after the existing exports:

```ts
import type { GatedTier } from '@/lib/contribution/tiers'
```

Then add to `MissionDraftInput` (after `affiliateNetworkProgramId: string | null`):

```ts
  minTier: GatedTier | null
```

- [ ] **Step 3b: Persist it in `buildMissionInsert`**

In `apps/web/lib/missions/actions.ts`, inside `buildMissionInsert`'s returned object (after `affiliate_network_program_id: draft.affiliateNetworkProgramId,`), add:

```ts
    min_tier: draft.minTier,
```

- [ ] **Step 3c: Update the mission fixture**

`missionDraftFixture` (in `apps/web/lib/missions/fixtures.ts`) implements `MissionDraftInput` and must gain the new field. Open it and add `minTier: null,` to the fixture object so it satisfies the type.

- [ ] **Step 4: Run tests + tsc (PASS)**

```
pnpm exec vitest run tests/mission.actions.test.ts --no-file-parallelism && pnpm exec tsc --noEmit
```
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```
git add apps/web/lib/missions/types.ts apps/web/lib/missions/actions.ts apps/web/lib/missions/fixtures.ts apps/web/tests/mission.actions.test.ts
git commit -m "feat(sp5b): persist mission min_tier from the draft

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Tier gate in `joinMissionAction`

**Files:**
- Modify: `apps/web/lib/missions/actions.ts`
- Test: `apps/web/tests/mission.actions.test.ts` (append a `describe`)

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/tests/mission.actions.test.ts` (reuses the file's `createBuilder` / `createSupabaseMock`; default `getUser` returns `{ id: 'user-1' }`). `joinMissionAction` is already imported at the top of the file.

```ts
describe('joinMissionAction tier gate', () => {
  it('rejects a creator below the mission minimum tier', async () => {
    const supabase = createSupabaseMock({
      kinnso_ops_members: createBuilder({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }),
      merchant_profiles: createBuilder({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }),
      missions: createBuilder({
        single: vi.fn(async () => ({
          data: { id: 'mission-1', mission_type: 'hybrid', mission_source: 'merchant', min_tier: 'pro' },
          error: null,
        })),
      }),
      creator_contribution: createBuilder({ maybeSingle: vi.fn(async () => ({ data: { tier: 'rising' }, error: null })) }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await joinMissionAction({ missionId: 'mission-1', locale: 'en' })

    expect(result.ok).toBe(false)
  })

  it('allows a creator at or above the mission minimum tier', async () => {
    const supabase = createSupabaseMock({
      kinnso_ops_members: createBuilder({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }),
      merchant_profiles: createBuilder({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }),
      missions: createBuilder({
        single: vi.fn(async () => ({
          data: { id: 'mission-1', mission_type: 'hybrid', mission_source: 'merchant', min_tier: 'pro' },
          error: null,
        })),
      }),
      creator_contribution: createBuilder({ maybeSingle: vi.fn(async () => ({ data: { tier: 'elite' }, error: null })) }),
      mission_participants: createBuilder({ single: vi.fn(async () => ({ data: { id: 'participant-1' }, error: null })) }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await joinMissionAction({ missionId: 'mission-1', locale: 'en' })

    expect(result).toEqual({ ok: true, participantId: 'participant-1' })
  })

  it('allows joining an open (null min_tier) mission without reading tier', async () => {
    const supabase = createSupabaseMock({
      kinnso_ops_members: createBuilder({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }),
      merchant_profiles: createBuilder({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }),
      missions: createBuilder({
        single: vi.fn(async () => ({
          data: { id: 'mission-2', mission_type: 'coupon_affiliate', mission_source: 'merchant', min_tier: null },
          error: null,
        })),
      }),
      mission_participants: createBuilder({ single: vi.fn(async () => ({ data: { id: 'participant-2' }, error: null })) }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await joinMissionAction({ missionId: 'mission-2', locale: 'en' })

    expect(result).toEqual({ ok: true, participantId: 'participant-2' })
  })
})
```

- [ ] **Step 2: Run (FAIL)**

```
pnpm exec vitest run tests/mission.actions.test.ts --no-file-parallelism
```
Expected: FAIL — no tier gate; the ineligible case returns `ok: true`, and `min_tier` isn't selected.

- [ ] **Step 3: Implement the gate**

In `apps/web/lib/missions/actions.ts`:

(a) Add the import near the existing imports:

```ts
import { meetsTier, type GatedTier, type Tier } from '@/lib/contribution/tiers'
```

(b) In `joinMissionAction`, change the mission select to include `min_tier`:

```ts
  const { data: mission, error: missionError } = await supabase
    .from('missions')
    .select('id, mission_type, mission_source, min_tier')
    .eq('id', input.missionId)
    .eq('status', 'published')
    .single()

  if (missionError || !mission) return formError('Mission is not available')
```

(c) Immediately after that block (before `buildParticipantInsert`), add the gate:

```ts
  if (mission.min_tier) {
    const { data: contribution } = await supabase
      .from('creator_contribution')
      .select('tier')
      .eq('creator_id', user.id)
      .maybeSingle()
    const creatorTier = (contribution?.tier as Tier | undefined) ?? 'seed'
    if (!meetsTier(creatorTier, mission.min_tier as GatedTier)) {
      return formError(`This mission requires the ${mission.min_tier} tier`)
    }
  }
```

- [ ] **Step 4: Run tests + tsc (PASS)**

```
pnpm exec vitest run tests/mission.actions.test.ts --no-file-parallelism && pnpm exec tsc --noEmit
```
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```
git add apps/web/lib/missions/actions.ts apps/web/tests/mission.actions.test.ts
git commit -m "feat(sp5b): gate joinMissionAction on the creator tier

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Queries — `min_tier` in selects + `countGatedMissionsByTier`

**Files:**
- Modify: `apps/web/lib/missions/queries.ts`
- Test: `apps/web/tests/mission.queries.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `apps/web/tests/mission.queries.test.ts`. First add `countGatedMissionsByTier` to the existing import from `@/lib/missions/queries`. Then:

```ts
describe('countGatedMissionsByTier', () => {
  it('counts published open merchant missions per gated tier', async () => {
    const query = { eq: vi.fn(), not: vi.fn(), select: vi.fn() }
    query.eq.mockReturnValue(query)
    query.not.mockReturnValue(query)
    query.select.mockReturnValue(query)
    // terminal: `not(...)` returns the awaited result
    query.not.mockResolvedValue({
      data: [{ min_tier: 'pro' }, { min_tier: 'pro' }, { min_tier: 'elite' }],
      error: null,
    })
    const supabase = { from: vi.fn(() => query) }

    const counts = await countGatedMissionsByTier(supabase as never)

    expect(supabase.from).toHaveBeenCalledWith('missions')
    expect(query.eq).toHaveBeenCalledWith('status', 'published')
    expect(query.eq).toHaveBeenCalledWith('mission_source', 'merchant')
    expect(query.eq).toHaveBeenCalledWith('visibility', 'open')
    expect(query.not).toHaveBeenCalledWith('min_tier', 'is', null)
    expect(counts).toEqual({ rising: 0, pro: 2, elite: 1 })
  })
})

describe('creator mission selects', () => {
  it('include min_tier so the UI can gate', () => {
    expect(creatorMissionSelect).toContain('min_tier')
    expect(creatorMissionDetailSelect).toContain('min_tier')
  })
})
```

Add `creatorMissionDetailSelect` to the import as well (it is exported).

- [ ] **Step 2: Run (FAIL)**

```
pnpm exec vitest run tests/mission.queries.test.ts --no-file-parallelism
```
Expected: FAIL — `countGatedMissionsByTier` undefined; selects lack `min_tier`.

- [ ] **Step 3: Implement**

In `apps/web/lib/missions/queries.ts`:

(a) Add `min_tier` to `creatorMissionSelect` and `creatorMissionDetailSelect`. In each, change the first line from:

```
  id,title,summary,mission_source,mission_type,visibility,status,published_at,
```
to:

```
  id,title,summary,mission_source,mission_type,visibility,status,published_at,min_tier,
```

(b) Add the import + function (top import, then anywhere after the existing functions):

```ts
import type { GatedTier } from '@/lib/contribution/tiers'

export async function countGatedMissionsByTier(
  supabase: SupabaseClient<Database>,
): Promise<Record<GatedTier, number>> {
  const counts: Record<GatedTier, number> = { rising: 0, pro: 0, elite: 0 }
  const { data } = await supabase
    .from('missions')
    .select('min_tier')
    .eq('status', 'published')
    .eq('mission_source', 'merchant')
    .eq('visibility', 'open')
    .not('min_tier', 'is', null)
  for (const row of (data ?? []) as Array<{ min_tier: string | null }>) {
    const tier = row.min_tier as GatedTier | null
    if (tier && tier in counts) counts[tier] += 1
  }
  return counts
}
```

- [ ] **Step 4: Run tests + tsc (PASS)**

```
pnpm exec vitest run tests/mission.queries.test.ts --no-file-parallelism && pnpm exec tsc --noEmit
```
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```
git add apps/web/lib/missions/queries.ts apps/web/tests/mission.queries.test.ts
git commit -m "feat(sp5b): select min_tier + count gated missions per tier

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Locked card in `CreatorMissionsView` + wire the list page

**Files:**
- Modify: `apps/web/components/kinnso/pages/CreatorMissionsView.tsx`
- Modify: `apps/web/app/[locale]/studio/missions/page.tsx`
- Test: `apps/web/tests/kinnso.CreatorMissionsView.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/tests/kinnso.CreatorMissionsView.test.tsx`. First, the existing `baseAvailable` fixture must gain the two new fields — update it to include `locked: false, requiredTier: null`. Then add:

```ts
  it('renders a locked mission with a disabled join and the required tier', () => {
    const onJoin = vi.fn()
    const locked: CreatorMissionCard = {
      ...baseAvailable,
      id: 'm-locked',
      title: 'Pro-only mission',
      locked: true,
      requiredTier: 'pro',
    }
    render(<CreatorMissionsView locale="en" t={en.missions} missions={[locked]} onJoin={onJoin} />)
    expect(screen.getByText('Pro-only mission')).toBeTruthy()
    expect(screen.getByText(en.missions.locked)).toBeTruthy()
    // the requirement badge renders the tier label
    expect(screen.getByText('Pro')).toBeTruthy()
    const joinBtn = screen.getByRole('button', { name: en.missions.joinMission })
    expect(joinBtn.hasAttribute('disabled')).toBe(true)
    fireEvent.click(joinBtn)
    expect(onJoin).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run (FAIL)**

```
cd kinnso-v3/apps/web && pkill -f vitest; pnpm exec vitest run tests/kinnso.CreatorMissionsView.test.tsx --no-file-parallelism
```
Expected: FAIL — `locked`/`requiredTier` not on the type; no locked rendering.

- [ ] **Step 3a: Extend the card type + imports**

In `apps/web/components/kinnso/pages/CreatorMissionsView.tsx`:

Add imports (top):

```ts
import TierBadge from '@/components/kinnso/TierBadge'
import type { GatedTier } from '@/lib/contribution/tiers'
```

Add to `CreatorMissionCard` (after `submittedCount: number`):

```ts
  locked: boolean
  requiredTier: GatedTier | null
```

- [ ] **Step 3b: Render the locked state**

Replace the available-mission action row (the `<div className="mt-4 flex flex-wrap items-center justify-end gap-2">` block containing the View-details link + join button) with a locked-aware version:

```tsx
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <Link href={detailHref(mission.id)} className="k-btn-ghost text-sm">
                    {t.viewDetails}
                  </Link>
                  {mission.locked && mission.requiredTier ? (
                    <>
                      <span className="text-xs font-semibold text-kinnso-muted">{t.locked}</span>
                      <TierBadge tier={mission.requiredTier} />
                      <button type="button" className="k-btn-primary text-sm" disabled aria-disabled="true">
                        {getJoinLabel(mission.missionType)}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="k-btn-primary text-sm"
                      disabled={pendingId === mission.id}
                      onClick={() => void runAction(mission.id, () => onJoin(mission.id))}
                    >
                      {getJoinLabel(mission.missionType)}
                    </button>
                  )}
                </div>
```

- [ ] **Step 4a: Run the view test (PASS)**

```
pnpm exec vitest run tests/kinnso.CreatorMissionsView.test.tsx --no-file-parallelism
```
Expected: PASS.

- [ ] **Step 4b: Wire the list page**

In `apps/web/app/[locale]/studio/missions/page.tsx`:

(i) Add imports:

```ts
import { meetsTier, type GatedTier, type Tier } from '@/lib/contribution/tiers'
```

(ii) Add `min_tier` to the `CreatorMissionRow` type (alongside `status`):

```ts
  min_tier: string | null
```

(iii) Change `mapCreatorMission` to accept and use the creator tier:

```ts
function mapCreatorMission(row: CreatorMissionRow, creatorId: string, creatorTier: Tier): CreatorMissionCard {
  const participant = row.mission_participants?.find((item) => item.creator_id === creatorId) ?? null
  const { milestoneCount, submittedCount } = creatorMissionProgress(
    row.mission_milestones,
    participant?.mission_milestone_submissions,
  )
  const requiredTier = (row.min_tier ?? null) as GatedTier | null
  const locked = participant ? false : requiredTier ? !meetsTier(creatorTier, requiredTier) : false

  return {
    id: row.id,
    title: row.title ?? '',
    summary: row.summary ?? '',
    missionSource: missionSource(row.mission_source),
    missionType: missionType(row.mission_type),
    status: row.status ?? 'published',
    participant: participant ? { id: participant.id, status: participant.status ?? 'active' } : null,
    partnerLinks: (row.affiliate_partner_links ?? []).map((link) => ({
      id: link.id,
      partnerUrl: link.partner_url ?? '',
    })),
    programUrl: programUrl(row.affiliate_network_programs),
    compensation: formatCompensation(row),
    milestoneCount,
    submittedCount,
    locked,
    requiredTier,
  }
}
```

(Existing participants are never locked — the gate is join-time only, matching the "no revocation" decision.)

(iv) In `StudioMissionsPage`, after resolving the role and before/with the missions fetch, read the creator's tier and pass it into the mapper:

```ts
  const { data: contribution } = await supabase
    .from('creator_contribution')
    .select('tier')
    .eq('creator_id', user.id)
    .maybeSingle()
  const creatorTier = (contribution?.tier as Tier | undefined) ?? 'seed'

  const { data } = await listCreatorMerchantMissions(supabase)
  const missions = ((data ?? []) as unknown as CreatorMissionRow[]).map((row) =>
    mapCreatorMission(row, user.id, creatorTier),
  )
```

- [ ] **Step 5: tsc + view test (PASS)**

```
pnpm exec vitest run tests/kinnso.CreatorMissionsView.test.tsx --no-file-parallelism && pnpm exec tsc --noEmit
```
Expected: PASS; tsc clean (the page is a server component — it is type-checked here and built in Task 11's gate).

- [ ] **Step 6: Commit**

```
git add apps/web/components/kinnso/pages/CreatorMissionsView.tsx apps/web/app/[locale]/studio/missions/page.tsx apps/web/tests/kinnso.CreatorMissionsView.test.tsx
git commit -m "feat(sp5b): locked mission card + discovery tier annotation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Locked state in `CreatorMissionDetailView` + wire the detail page

**Files:**
- Modify: `apps/web/components/kinnso/pages/CreatorMissionDetailView.tsx`
- Modify: `apps/web/app/[locale]/studio/missions/[id]/page.tsx`
- Test: `apps/web/tests/kinnso.CreatorMissionDetailView.test.tsx` (append; create if it does not exist)

The new props are **optional**, so any existing detail-view tests keep passing.

- [ ] **Step 1: Write the failing test**

If `apps/web/tests/kinnso.CreatorMissionDetailView.test.tsx` exists, append the `it` below. If it does not exist, create it with this scaffold (adapt the minimal `mission` object to the real `CreatorMissionDetail` shape — read the view's imported type; the only fields this test needs are whatever makes `mission.cta === 'join'`):

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

import { CreatorMissionDetailView } from '@/components/kinnso/pages/CreatorMissionDetailView'
import en from '@/lib/i18n/messages/en'

afterEach(() => {
  cleanup()
  refreshMock.mockReset()
})

// Build a join-CTA mission using the real CreatorMissionDetail shape.
// (Open the view's `mission` prop type and fill the minimum fields so cta === 'join'.)
const joinMission = {/* fill from CreatorMissionDetail; ensure cta: 'join' */} as never

describe('CreatorMissionDetailView tier lock', () => {
  it('shows the locked notice and hides join when lockedTier is set', () => {
    const onJoin = vi.fn()
    render(
      <CreatorMissionDetailView
        locale="en"
        t={en.missionDetail}
        mission={joinMission}
        onJoin={onJoin}
        onApply={vi.fn()}
        onSubmitMilestone={vi.fn() as never}
        lockedTier="pro"
        gating={{ locked: en.missions.locked, lockedHelp: en.missions.lockedHelp }}
      />,
    )
    expect(screen.getByText(en.missions.locked)).toBeTruthy()
    expect(screen.getByText('Pro')).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.missionDetail.join })).toBeNull()
    expect(onJoin).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run (FAIL)**

```
pnpm exec vitest run tests/kinnso.CreatorMissionDetailView.test.tsx --no-file-parallelism
```
Expected: FAIL — props don't exist; the join button still renders.

- [ ] **Step 3a: Add props + import**

In `apps/web/components/kinnso/pages/CreatorMissionDetailView.tsx`:

Add imports:

```ts
import TierBadge from '@/components/kinnso/TierBadge'
import type { GatedTier } from '@/lib/contribution/tiers'
```

Add to `CreatorMissionDetailViewProps` (after `onSubmitMilestone`):

```ts
  lockedTier?: GatedTier | null
  gating?: { locked: string; lockedHelp: string }
```

Destructure them in the component signature (add `lockedTier`, `gating` to the props params).

- [ ] **Step 3b: Render locked, guard the join/apply blocks**

Wrap the two existing CTA blocks so they only render when not locked, and add a locked block before them:

```tsx
      {lockedTier && (mission.cta === 'join' || mission.cta === 'apply') && (
        <div className="mt-6 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-kinnso-ink">{gating?.locked}</span>
            <TierBadge tier={lockedTier} />
          </div>
          <p className="text-sm text-kinnso-muted">{gating?.lockedHelp}</p>
        </div>
      )}

      {!lockedTier && mission.cta === 'join' && (
        <div className="mt-6">
          <button type="button" className="k-btn-primary text-sm" disabled={isPending} onClick={() => void runAction(onJoin)}>
            {t.join}
          </button>
        </div>
      )}

      {!lockedTier && mission.cta === 'apply' && (
        <div className="mt-6 grid gap-2">
          <label htmlFor="application-note" className="text-sm font-bold text-kinnso-ink">{t.applyNoteLabel}</label>
          <textarea
            id="application-note"
            className="k-input min-h-[96px]"
            placeholder={t.applyNotePlaceholder}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div>
            <button type="button" className="k-btn-primary text-sm" disabled={isPending} onClick={() => void runAction(() => onApply(note))}>
              {t.apply}
            </button>
          </div>
        </div>
      )}
```

(This replaces the original `{mission.cta === 'join' && (...)}` and `{mission.cta === 'apply' && (...)}` blocks verbatim, only adding the `!lockedTier &&` guard and the new locked block.)

- [ ] **Step 4a: Run the view test (PASS)**

```
pnpm exec vitest run tests/kinnso.CreatorMissionDetailView.test.tsx --no-file-parallelism
```
Expected: PASS.

- [ ] **Step 4b: Wire the detail page**

In `apps/web/app/[locale]/studio/missions/[id]/page.tsx`:

(i) Add import:

```ts
import { meetsTier, type GatedTier, type Tier } from '@/lib/contribution/tiers'
```

(ii) After `const mission = toCreatorMissionDetail(...)`, compute the lock from the raw row's `min_tier` + the creator's tier:

```ts
  const requiredTier = ((data as { min_tier?: string | null }).min_tier ?? null) as GatedTier | null
  const { data: contribution } = await supabase
    .from('creator_contribution')
    .select('tier')
    .eq('creator_id', user.id)
    .maybeSingle()
  const creatorTier = (contribution?.tier as Tier | undefined) ?? 'seed'
  const lockedTier = mission.participantId ? null : requiredTier && !meetsTier(creatorTier, requiredTier) ? requiredTier : null
```

(Already-joined creators — `mission.participantId` set — are never locked.)

(iii) Pass the new props to the view:

```tsx
    <CreatorMissionDetailView
      locale={loc}
      t={messages.missionDetail}
      mission={mission}
      onJoin={join}
      onApply={apply}
      onSubmitMilestone={submitMilestone}
      lockedTier={lockedTier}
      gating={{ locked: messages.missions.locked, lockedHelp: messages.missions.lockedHelp }}
    />
```

If `mission.participantId` is not a field on `CreatorMissionDetail`, use the equivalent "already joined" signal the type exposes (read the type; e.g. a `cta` that is not `join`/`apply` already implies joined — in that case `lockedTier` only matters when `cta` is join/apply, so gating on `requiredTier && !meets` alone is sufficient and the page line simplifies to `const lockedTier = requiredTier && !meetsTier(creatorTier, requiredTier) ? requiredTier : null`).

- [ ] **Step 5: tsc + view test (PASS)**

```
pnpm exec vitest run tests/kinnso.CreatorMissionDetailView.test.tsx --no-file-parallelism && pnpm exec tsc --noEmit
```
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```
git add apps/web/components/kinnso/pages/CreatorMissionDetailView.tsx apps/web/app/[locale]/studio/missions/[id]/page.tsx apps/web/tests/kinnso.CreatorMissionDetailView.test.tsx
git commit -m "feat(sp5b): locked state on mission detail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Min-tier selector in `MissionPostWizard`

**Files:**
- Modify: `apps/web/components/kinnso/pages/MissionPostWizard.tsx`
- Test: `apps/web/tests/kinnso.MissionPostWizard.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/kinnso.MissionPostWizard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionPostWizard } from '@/components/kinnso/pages/MissionPostWizard'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('MissionPostWizard minimum-tier selector', () => {
  it('renders all four minimum-tier options', () => {
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={vi.fn()} />)
    expect(screen.getByText(en.missions.minTierOpen)).toBeTruthy()
    expect(screen.getByText(en.missions.minTierRising)).toBeTruthy()
    expect(screen.getByText(en.missions.minTierPro)).toBeTruthy()
    expect(screen.getByText(en.missions.minTierElite)).toBeTruthy()
  })

  it('selects Pro+ and checks the corresponding radio', () => {
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={vi.fn()} />)
    const proRadio = document.querySelector('input[name="minTier"][value="pro"]') as HTMLInputElement
    expect(proRadio).toBeTruthy()
    expect(proRadio.checked).toBe(false)
    fireEvent.click(proRadio)
    expect(proRadio.checked).toBe(true)
  })
})
```

- [ ] **Step 2: Run (FAIL)**

```
pnpm exec vitest run tests/kinnso.MissionPostWizard.test.tsx --no-file-parallelism
```
Expected: FAIL — no min-tier control.

- [ ] **Step 3a: Add state + buildInput field**

In `apps/web/components/kinnso/pages/MissionPostWizard.tsx`:

Add the import:

```ts
import type { GatedTier } from '@/lib/contribution/tiers'
```

Add state (after the `visibility` state):

```ts
  const [minTier, setMinTier] = useState<'open' | GatedTier>('open')
```

In `buildInput()`, add the field (after `affiliateNetworkProgramId: null,`):

```ts
    minTier: minTier === 'open' ? null : minTier,
```

- [ ] **Step 3b: Add the selector**

Add this `fieldset` right after the `visibility` fieldset (the one ending `</fieldset>` near line 210), before the `{includesCoupon && (` section:

```tsx
        <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold text-kinnso-ink">{t.minTierLabel}</legend>
          <div className="flex flex-wrap gap-2">
            {[
              ['open', t.minTierOpen],
              ['rising', t.minTierRising],
              ['pro', t.minTierPro],
              ['elite', t.minTierElite],
            ].map(([value, label]) => (
              <label
                key={value}
                className={minTier === value ? 'k-btn-primary cursor-pointer' : 'k-btn-ghost cursor-pointer'}
              >
                <input
                  type="radio"
                  name="minTier"
                  value={value}
                  checked={minTier === value}
                  onChange={() => setMinTier(value as 'open' | GatedTier)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
```

- [ ] **Step 4: Run tests + tsc (PASS)**

```
pnpm exec vitest run tests/kinnso.MissionPostWizard.test.tsx --no-file-parallelism && pnpm exec tsc --noEmit
```
Expected: PASS; tsc clean. (The selected `minTier` flows into `MissionDraftInput.minTier` — typed by tsc — and persistence is proven by Task 4.)

- [ ] **Step 5: Commit**

```
git add apps/web/components/kinnso/pages/MissionPostWizard.tsx apps/web/tests/kinnso.MissionPostWizard.test.tsx
git commit -m "feat(sp5b): minimum-tier selector in the mission post wizard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: `/studio/tier` unlocks section (replace `unlocksPlaceholder`)

**Files:**
- Modify: `apps/web/components/kinnso/pages/StudioTierView.tsx`
- Modify: `apps/web/app/[locale]/studio/tier/page.tsx`
- Modify: `apps/web/lib/i18n/messages/{en,ja,ko,th,zh-cn,zh-hk,zh-tw}.ts` (remove now-dead `unlocksPlaceholder`)
- Test: `apps/web/tests/kinnso.StudioTierView.test.tsx`

- [ ] **Step 1: Update the failing test**

Edit `apps/web/tests/kinnso.StudioTierView.test.tsx`. Add a `gatedCounts` const and pass it to BOTH existing `render(...)` calls, then add a new `it`:

```tsx
const gatedCounts = { rising: 1, pro: 3, elite: 0 } as const
```

Change both renders to include the prop, e.g.:

```tsx
render(<StudioTierView t={en.tier} contribution={progressToNext(55)} events={events} gatedCounts={gatedCounts} />)
```
```tsx
render(<StudioTierView t={en.tier} contribution={progressToNext(0)} events={[]} gatedCounts={{ rising: 0, pro: 0, elite: 0 }} />)
```

Add:

```tsx
  it('renders the what-you-unlock section with per-tier mission counts', () => {
    render(<StudioTierView t={en.tier} contribution={progressToNext(55)} events={events} gatedCounts={gatedCounts} />)
    expect(screen.getByText(en.tier.unlocksHeading)).toBeTruthy()
    expect(screen.getByText('3', { exact: false })).toBeTruthy()
    expect(screen.getByText(en.tier.unlocksHelp)).toBeTruthy()
  })
```

- [ ] **Step 2: Run (FAIL)**

```
pnpm exec vitest run tests/kinnso.StudioTierView.test.tsx --no-file-parallelism
```
Expected: FAIL — `gatedCounts` prop / unlocks section don't exist.

- [ ] **Step 3a: StudioTierView — add prop + unlocks section, drop placeholder**

In `apps/web/components/kinnso/pages/StudioTierView.tsx`:

Add import:

```ts
import type { GatedTier } from '@/lib/contribution/tiers'
```

Add to the props type (after `events: ContributionEvent[]`):

```ts
  gatedCounts: Record<GatedTier, number>
```

Destructure `gatedCounts` in the function signature.

Remove the placeholder line inside the "All tiers" card:

```tsx
          <p className="mt-3 text-sm text-kinnso-muted">{t.unlocksPlaceholder}</p>
```

Add a new card after the "All tiers" `</TicketCard>` and before the "Points history" card:

```tsx
        {/* What you unlock */}
        <TicketCard className="p-5">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.unlocksHeading}</h2>
          <ul className="mt-3 space-y-2">
            {(['rising', 'pro', 'elite'] as const).map((gt) => (
              <li key={gt} className="flex items-center justify-between">
                <TierBadge tier={gt} />
                <span className="k-mono text-sm text-kinnso-muted">
                  {gatedCounts[gt]} {t.unlocksMissions}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-kinnso-muted">{t.unlocksHelp}</p>
        </TicketCard>
```

- [ ] **Step 3b: Wire `/studio/tier/page.tsx`**

In `apps/web/app/[locale]/studio/tier/page.tsx`:

Add `countGatedMissionsByTier` to the existing import from `@/lib/contribution/queries`? No — it lives in `@/lib/missions/queries`. Add:

```ts
import { countGatedMissionsByTier } from '@/lib/missions/queries'
```

Add it to the `Promise.all` and pass the result:

```ts
  const [contribution, events, gatedCounts] = await Promise.all([
    getCreatorContribution(supabase, user.id),
    listContributionEvents(supabase, user.id),
    countGatedMissionsByTier(supabase),
  ])

  return <StudioTierView t={messages.tier} contribution={contribution} events={events} gatedCounts={gatedCounts} />
```

- [ ] **Step 3c: Remove the dead `unlocksPlaceholder` key**

`unlocksPlaceholder` is no longer referenced. Remove it from the `Messages` interface `tier` block in `en.ts` and from the `tier` literal in all 7 locale files (`en, ja, ko, th, zh-cn, zh-hk, zh-tw`). The parity test stays green because it is removed everywhere.

- [ ] **Step 4: Run tests + parity + tsc (PASS)**

```
pnpm exec vitest run tests/kinnso.StudioTierView.test.tsx tests/i18n.locale-parity.test.ts --no-file-parallelism && pnpm exec tsc --noEmit
```
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```
git add apps/web/components/kinnso/pages/StudioTierView.tsx apps/web/app/[locale]/studio/tier/page.tsx apps/web/lib/i18n/messages apps/web/tests/kinnso.StudioTierView.test.tsx
git commit -m "feat(sp5b): /studio/tier what-you-unlock section with live mission counts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Final gate

**Files:** none (verification only).

- [ ] **Step 1: Targeted test sweep**

```
cd kinnso-v3/apps/web && pkill -f vitest
pnpm exec vitest run \
  tests/contribution.tierGate.test.ts \
  tests/mission.actions.test.ts \
  tests/mission.queries.test.ts \
  tests/kinnso.CreatorMissionsView.test.tsx \
  tests/kinnso.CreatorMissionDetailView.test.tsx \
  tests/kinnso.MissionPostWizard.test.tsx \
  tests/kinnso.StudioTierView.test.tsx \
  tests/i18n.locale-parity.test.ts \
  --no-file-parallelism
```
Expected: all PASS.

- [ ] **Step 2: tsc + lint + build**

```
pnpm exec tsc --noEmit
pnpm run lint
pnpm run build
```
Expected: tsc clean; lint 0 errors; build succeeds with `/[locale]/studio/missions`, `/[locale]/studio/missions/[id]`, `/[locale]/studio/tier`, and `/[locale]/merchants/post` in the route manifest.

- [ ] **Step 3: Confirm the live migration + the owner smoke checklist**

Confirm via Supabase MCP that `missions.min_tier`, `app_private.creator_meets_mission_tier`, and the recreated `mission_participants_actor_insert` policy are present (re-run Task 2 Step 3 checks).

Record the **owner-only manual smoke** (cannot be automated — needs a signed-in creator + a merchant account):
1. As a merchant, post a mission with "Pro+" minimum tier.
2. As the `@creator` owner (seed/10 pts today), open `/studio/missions` → the mission shows **Tier locked / Pro** with a disabled join; the detail page shows the locked notice.
3. `/studio/tier` shows "What you unlock" with a non-zero "Pro" count.
4. Joining an open mission still works.

- [ ] **Step 4: No commit** (verification only). If lint/build surfaced fixes, commit them as `fix(sp5b): ...` with the Co-Authored-By trailer.

---

## Self-Review

**Spec coverage:**
- D1 eligibility-only / commission deferred → no commission code anywhere (✓ Non-goals honored).
- D2 per-mission merchant-set `min_tier` → Task 2 (column + constraints), Task 4 (persist), Task 9 (wizard).
- D3 hard gate, shown as locked → Task 7 (list locked card), Task 8 (detail locked state).
- D4 merchant missions only → `missions_min_tier_merchant_only_check` (Task 2); discovery query already excludes Travelpayouts.
- D5 defense in depth → RLS `creator_meets_mission_tier` (Task 2) + `joinMissionAction` check (Task 5).
- D6 live eval, no snapshot, no revocation → `mapCreatorMission`/detail page lock only non-participants; gate is insert-time only (Tasks 5/7/8). `merchant_invite` bypasses the gate (Task 2 note).
- Architecture "owner-scoped read, no cross-creator leak" → app reads `creator_contribution` for `user.id`; the SECURITY DEFINER fn reads only `auth.uid()` (Task 2).
- `/studio/tier` unlocks populated → Task 10. i18n across 7 locales → Task 3 (+ removal in Task 10).
- Testing matrix (tierRank/meetsTier, join gate, query, locked renders, wizard, unlocks, parity, live SQL) → Tasks 1,5,6,7,8,9,10,2.

**Placeholder scan:** No "TBD"/"add error handling"/"similar to". The one conditional instruction (Task 8 Step 4b, `mission.participantId` fallback) gives the concrete alternative code, not a vague directive.

**Type consistency:** `GatedTier` (Task 1) is used identically in `MissionDraftInput.minTier` (T4), `joinMissionAction` cast (T5), `countGatedMissionsByTier` return (T6), `CreatorMissionCard.requiredTier` (T7), detail `lockedTier` (T8), wizard state (T9), `StudioTierView.gatedCounts` (T10). `meetsTier(creatorTier: Tier, required: GatedTier | null)` signature is called consistently. SQL `contribution_tier_rank` mirrors TS `tierRank`. `min_tier` column name is consistent across migration, selects, row types, and `buildMissionInsert`.
