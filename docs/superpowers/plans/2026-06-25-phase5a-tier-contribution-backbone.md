# Phase 5A — Creator Tier & Contribution Backbone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cosmetic mock tier with a real, points-driven creator tier earned from real activity (published guides, verified missions, completed DNA scan), surfaced creator-privately as a Studio dashboard card + a `/studio/tier` page. No gating (that is 5B–5D).

**Architecture:** An append-only `creator_contribution_events` log + a `SECURITY DEFINER` recompute that maintains a creator-private 1:1 `creator_contribution` projection (`contribution_points`, `tier`). Best-effort `AFTER` triggers on `guides`, `creator_dna`, and `mission_milestone_submissions` award/revoke events so accounting never blocks the primary write. The web app reads the projection owner-scoped (`auth.uid() == creators.id == creator_id`) and renders a card + page; tier thresholds/weights live canonically in `lib/contribution/tiers.ts` and are mirrored in SQL.

**Tech Stack:** Next.js 16 App Router (RSC) + React 19 + TypeScript, `@supabase/ssr`/`@supabase/supabase-js`, hosted Supabase (`scryfkefedzuetfdtrvl`), Vitest 4 (+jsdom), pnpm 11.6.0, 7-locale `vue`-style typed message objects.

**Base branch:** `feat/phase5a-tier-backbone` (already stacks Phase 1→2→3→4; rebase onto `main` once #39 + #40 merge before opening the 5A PR).

**Tier ladder (canonical):** `seed` 0 · `rising` 50 · `pro` 150 · `elite` 400 contribution points. **Weights:** `mission_verified` 40 · `guide_published` 15 · `dna_scan` 10.

**Conventions (apply to every task):**
- Run `pkill -f vitest` before any vitest run (env-timeout flake under load).
- Per-task gate: `pnpm exec vitest run <files> --no-file-parallelism` then `pnpm exec tsc --noEmit`. All commands run from `apps/web` unless stated.
- Render tests: first line `// @vitest-environment jsdom`, `afterEach(cleanup)`, `import en from '@/lib/i18n/messages/en'` (default export).
- Decorative arrows/icons are `aria-hidden="true"`.
- Commit messages end with the trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

## File Structure

**Create:**
- `apps/web/lib/contribution/tiers.ts` — canonical ladder constants + `Tier` type + `tierForPoints` / `progressToNext`.
- `apps/web/lib/contribution/queries.ts` — owner-scoped `getCreatorContribution` + `listContributionEvents`.
- `apps/web/components/kinnso/TierProgressCard.tsx` — dashboard card.
- `apps/web/components/kinnso/pages/StudioTierView.tsx` — `/studio/tier` page body.
- `apps/web/app/[locale]/studio/tier/page.tsx` — host route.
- `supabase/migrations/20260625090000_creator_contribution_backbone.sql` — schema + functions + triggers + RLS + backfill.
- Tests: `apps/web/tests/contribution.tiers.test.ts`, `contribution.queries.test.ts`, `kinnso.TierProgressCard.test.tsx`, `kinnso.StudioTierView.test.tsx`, `studio.tier.host.test.tsx`.

**Modify:**
- `apps/web/lib/i18n/messages/{en,ja,ko,th,zh-cn,zh-hk,zh-tw}.ts` — new `tier` group + `studioHome.tierTitle/tierDesc`.
- `apps/web/tests/i18n.locale-parity.test.ts` — add `'tier'` to `GROUPS`.
- `apps/web/components/kinnso/pages/StudioDashboardView.tsx` — add `contribution` prop + render `TierProgressCard`.
- `apps/web/app/[locale]/studio/page.tsx` — fetch `getCreatorContribution`, pass to the view.
- `apps/web/components/kinnso/StudioQuickLinks.tsx` — add a Tier tile.
- `apps/web/tests/kinnso.StudioQuickLinks.test.tsx` *(create if absent)* — assert the Tier tile.
- `packages/db/types.ts` — regenerated to include the two new tables (Task 3).

---

## Task 1: i18n foundation — `tier` group + Studio tile keys (all 7 locales)

**Files:**
- Modify: `apps/web/tests/i18n.locale-parity.test.ts:14-18`
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface + impl)
- Modify: `apps/web/lib/i18n/messages/{ja,ko,th,zh-cn,zh-hk,zh-tw}.ts` (impl)

- [ ] **Step 1: Add `'tier'` to the parity GROUPS (failing test)**

In `apps/web/tests/i18n.locale-parity.test.ts`, change the `GROUPS` array to append `'tier'`:

```ts
const GROUPS = [
  'studio', 'creatorProfile', 'merchants', 'missions', 'missionDetail', 'ops', 'nav', 'footer', 'home', 'comingSoon',
  'studioHome', 'explore', 'feed', 'creatorsLanding', 'merchantsLanding', 'studioGuides',
  'studioOffers', 'studioEarnings', 'about', 'contact', 'creatorTerms', 'article', 'tier',
] as const
```

- [ ] **Step 2: Run the parity test to verify it fails**

Run: `pkill -f vitest; pnpm exec vitest run tests/i18n.locale-parity.test.ts --no-file-parallelism`
Expected: FAIL — `en defines the three new groups` fails because `en.tier` is undefined (length 0).

- [ ] **Step 3: Add the `tier` group + `studioHome` keys to the `Messages` interface**

In `apps/web/lib/i18n/messages/en.ts`, inside `export interface Messages { ... }`, add two `studioHome` interface keys and a new `tier` group. Add `tierTitle`/`tierDesc` to the `studioHome` interface block (locate the `studioHome: { ... }` interface entry near the other Studio groups) and add the `tier` block immediately before the interface's closing `}` (right after the `studioEarnings` interface block ending at `colStatus: string }`):

```ts
  studioHome: {
    // ...existing keys...
    tierTitle: string
    tierDesc: string
  }
```

```ts
  tier: {
    cardTitle: string
    toNext: string
    maxed: string
    earnHeading: string
    earnGuide: string
    earnMission: string
    earnScan: string
    viewAll: string
    pageHeading: string
    pageSubtitle: string
    currentLabel: string
    allTiersHeading: string
    unlocksPlaceholder: string
    historyHeading: string
    historyEmpty: string
    eventGuide: string
    eventMission: string
    eventScan: string
    pointsSuffix: string
  }
```

- [ ] **Step 4: Add the English impl values**

In `apps/web/lib/i18n/messages/en.ts`, in `const messages: Messages = { ... }`: add the two keys to the `studioHome` object and add the `tier` object after the `studioEarnings` object.

`studioHome` additions:
```ts
    tierTitle: 'Tier', tierDesc: 'Your contribution points and tier.',
```
`tier` object:
```ts
  tier: {
    cardTitle: 'Your tier',
    toNext: '{points} pts to {tier}',
    maxed: 'Top tier reached',
    earnHeading: 'Ways to earn points',
    earnGuide: 'Publish a guide',
    earnMission: 'Complete a verified mission',
    earnScan: 'Complete your DNA scan',
    viewAll: 'Tier details',
    pageHeading: 'Tier & contribution',
    pageSubtitle: 'Earn points from real activity to climb tiers.',
    currentLabel: 'Current tier',
    allTiersHeading: 'All tiers',
    unlocksPlaceholder: 'Perks and unlocks arrive soon.',
    historyHeading: 'Points history',
    historyEmpty: 'No points yet — publish a guide or complete a mission to get started.',
    eventGuide: 'Guide published',
    eventMission: 'Mission verified',
    eventScan: 'DNA scan completed',
    pointsSuffix: 'pts',
  },
```

- [ ] **Step 5: Add the same keys to the 6 other locale files**

In each file add `tierTitle`/`tierDesc` to its `studioHome` object and a `tier` object after `studioEarnings`. Tier *names* in `{tier}` render in English (they come from `tierMeta.label`), consistent with the brand treatment.

`ja.ts`:
```ts
    tierTitle: 'ティア', tierDesc: '貢献ポイントとティア。',
```
```ts
  tier: {
    cardTitle: 'あなたのティア',
    toNext: '{tier}まであと{points}pt',
    maxed: '最上位ティアに到達しました',
    earnHeading: 'ポイントの獲得方法',
    earnGuide: 'ガイドを公開する',
    earnMission: '認証済みミッションを完了する',
    earnScan: 'DNAスキャンを完了する',
    viewAll: 'ティアの詳細',
    pageHeading: 'ティアと貢献度',
    pageSubtitle: '実際の活動でポイントを獲得し、ティアを上げましょう。',
    currentLabel: '現在のティア',
    allTiersHeading: 'すべてのティア',
    unlocksPlaceholder: '特典とアンロックは近日公開予定です。',
    historyHeading: 'ポイント履歴',
    historyEmpty: 'まだポイントがありません。ガイドを公開するかミッションを完了して始めましょう。',
    eventGuide: 'ガイド公開',
    eventMission: 'ミッション認証',
    eventScan: 'DNAスキャン完了',
    pointsSuffix: 'pt',
  },
```

`ko.ts`:
```ts
    tierTitle: '등급', tierDesc: '기여 포인트와 등급.',
```
```ts
  tier: {
    cardTitle: '내 등급',
    toNext: '{tier}까지 {points}pt',
    maxed: '최고 등급 달성',
    earnHeading: '포인트 획득 방법',
    earnGuide: '가이드 게시하기',
    earnMission: '인증된 미션 완료하기',
    earnScan: 'DNA 스캔 완료하기',
    viewAll: '등급 상세',
    pageHeading: '등급 및 기여도',
    pageSubtitle: '실제 활동으로 포인트를 모아 등급을 올리세요.',
    currentLabel: '현재 등급',
    allTiersHeading: '전체 등급',
    unlocksPlaceholder: '혜택과 잠금 해제가 곧 제공됩니다.',
    historyHeading: '포인트 내역',
    historyEmpty: '아직 포인트가 없습니다 — 가이드를 게시하거나 미션을 완료해 시작하세요.',
    eventGuide: '가이드 게시',
    eventMission: '미션 인증',
    eventScan: 'DNA 스캔 완료',
    pointsSuffix: 'pt',
  },
```

`th.ts`:
```ts
    tierTitle: 'ระดับ', tierDesc: 'แต้มการมีส่วนร่วมและระดับของคุณ',
```
```ts
  tier: {
    cardTitle: 'ระดับของคุณ',
    toNext: 'อีก {points} แต้มสู่ {tier}',
    maxed: 'ถึงระดับสูงสุดแล้ว',
    earnHeading: 'วิธีรับแต้ม',
    earnGuide: 'เผยแพร่ไกด์',
    earnMission: 'ทำภารกิจที่ยืนยันแล้วให้สำเร็จ',
    earnScan: 'ทำการสแกน DNA ให้เสร็จ',
    viewAll: 'รายละเอียดระดับ',
    pageHeading: 'ระดับและการมีส่วนร่วม',
    pageSubtitle: 'รับแต้มจากกิจกรรมจริงเพื่อเลื่อนระดับ',
    currentLabel: 'ระดับปัจจุบัน',
    allTiersHeading: 'ทุกระดับ',
    unlocksPlaceholder: 'สิทธิประโยชน์และการปลดล็อกจะมาเร็ว ๆ นี้',
    historyHeading: 'ประวัติแต้ม',
    historyEmpty: 'ยังไม่มีแต้ม — เผยแพร่ไกด์หรือทำภารกิจให้สำเร็จเพื่อเริ่มต้น',
    eventGuide: 'เผยแพร่ไกด์แล้ว',
    eventMission: 'ยืนยันภารกิจแล้ว',
    eventScan: 'สแกน DNA เสร็จแล้ว',
    pointsSuffix: 'แต้ม',
  },
```

`zh-cn.ts`:
```ts
    tierTitle: '等级', tierDesc: '你的贡献积分与等级。',
```
```ts
  tier: {
    cardTitle: '你的等级',
    toNext: '距 {tier} 还差 {points} 分',
    maxed: '已达最高等级',
    earnHeading: '赚取积分的方式',
    earnGuide: '发布攻略',
    earnMission: '完成已验证的任务',
    earnScan: '完成 DNA 扫描',
    viewAll: '等级详情',
    pageHeading: '等级与贡献',
    pageSubtitle: '通过真实活动赚取积分，提升等级。',
    currentLabel: '当前等级',
    allTiersHeading: '全部等级',
    unlocksPlaceholder: '权益与解锁即将推出。',
    historyHeading: '积分记录',
    historyEmpty: '还没有积分 — 发布攻略或完成任务即可开始。',
    eventGuide: '攻略已发布',
    eventMission: '任务已验证',
    eventScan: 'DNA 扫描完成',
    pointsSuffix: '分',
  },
```

`zh-hk.ts`:
```ts
    tierTitle: '等級', tierDesc: '你的貢獻積分同等級。',
```
```ts
  tier: {
    cardTitle: '你的等級',
    toNext: '距 {tier} 仲差 {points} 分',
    maxed: '已達最高等級',
    earnHeading: '賺取積分嘅方法',
    earnGuide: '發佈攻略',
    earnMission: '完成已驗證嘅任務',
    earnScan: '完成 DNA 掃描',
    viewAll: '等級詳情',
    pageHeading: '等級與貢獻',
    pageSubtitle: '透過真實活動賺取積分，提升等級。',
    currentLabel: '目前等級',
    allTiersHeading: '全部等級',
    unlocksPlaceholder: '權益與解鎖即將推出。',
    historyHeading: '積分記錄',
    historyEmpty: '仲未有積分 — 發佈攻略或完成任務就可以開始。',
    eventGuide: '攻略已發佈',
    eventMission: '任務已驗證',
    eventScan: 'DNA 掃描完成',
    pointsSuffix: '分',
  },
```

`zh-tw.ts`:
```ts
    tierTitle: '等級', tierDesc: '你的貢獻積分與等級。',
```
```ts
  tier: {
    cardTitle: '你的等級',
    toNext: '距 {tier} 還差 {points} 分',
    maxed: '已達最高等級',
    earnHeading: '賺取積分的方式',
    earnGuide: '發布攻略',
    earnMission: '完成已驗證的任務',
    earnScan: '完成 DNA 掃描',
    viewAll: '等級詳情',
    pageHeading: '等級與貢獻',
    pageSubtitle: '透過真實活動賺取積分，提升等級。',
    currentLabel: '目前等級',
    allTiersHeading: '全部等級',
    unlocksPlaceholder: '權益與解鎖即將推出。',
    historyHeading: '積分紀錄',
    historyEmpty: '還沒有積分 — 發布攻略或完成任務即可開始。',
    eventGuide: '攻略已發布',
    eventMission: '任務已驗證',
    eventScan: 'DNA 掃描完成',
    pointsSuffix: '分',
  },
```

- [ ] **Step 6: Run the parity test + typecheck to verify green**

Run: `pkill -f vitest; pnpm exec vitest run tests/i18n.locale-parity.test.ts --no-file-parallelism && pnpm exec tsc --noEmit`
Expected: PASS (all locales have identical `tier` keys) and tsc clean (the interface addition is satisfied by all 7 files).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/i18n/messages apps/web/tests/i18n.locale-parity.test.ts
git commit -m "feat(phase5a): add tier i18n group + studio tier tile keys (7 locales)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `lib/contribution/tiers.ts` — canonical ladder + helpers

**Files:**
- Create: `apps/web/lib/contribution/tiers.ts`
- Test: `apps/web/tests/contribution.tiers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/contribution.tiers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TIERS, POINT_WEIGHTS, TIER_THRESHOLDS, tierForPoints, progressToNext } from '@/lib/contribution/tiers'

describe('tierForPoints', () => {
  it('maps points to the right tier at every boundary', () => {
    expect(tierForPoints(0)).toBe('seed')
    expect(tierForPoints(49)).toBe('seed')
    expect(tierForPoints(50)).toBe('rising')
    expect(tierForPoints(149)).toBe('rising')
    expect(tierForPoints(150)).toBe('pro')
    expect(tierForPoints(399)).toBe('pro')
    expect(tierForPoints(400)).toBe('elite')
    expect(tierForPoints(99999)).toBe('elite')
  })
  it('clamps negative/garbage to seed', () => {
    expect(tierForPoints(-10)).toBe('seed')
  })
})

describe('progressToNext', () => {
  it('computes progress within a tier band', () => {
    const p = progressToNext(80) // rising band 50..150
    expect(p.tier).toBe('rising')
    expect(p.nextTier).toBe('pro')
    expect(p.points).toBe(80)
    expect(p.pointsForNext).toBe(70) // 150 - 80
    expect(p.pct).toBe(30) // (80-50)/(150-50)=30%
  })
  it('reports 100% and no next tier at elite', () => {
    const p = progressToNext(500)
    expect(p.tier).toBe('elite')
    expect(p.nextTier).toBeNull()
    expect(p.pointsForNext).toBeNull()
    expect(p.pct).toBe(100)
  })
  it('floors fractional points', () => {
    expect(progressToNext(50.9).tier).toBe('rising')
  })
})

describe('constants', () => {
  it('pins the canonical weights + ladder (sync with SQL migration)', () => {
    expect(POINT_WEIGHTS).toEqual({ dna_scan: 10, guide_published: 15, mission_verified: 40 })
    expect(TIERS).toEqual(['seed', 'rising', 'pro', 'elite'])
    expect(TIER_THRESHOLDS.map((t) => t.min)).toEqual([0, 50, 150, 400])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pkill -f vitest; pnpm exec vitest run tests/contribution.tiers.test.ts --no-file-parallelism`
Expected: FAIL — cannot resolve `@/lib/contribution/tiers`.

- [ ] **Step 3: Implement `tiers.ts`**

Create `apps/web/lib/contribution/tiers.ts`:

```ts
/**
 * Canonical creator tier ladder + contribution scoring.
 * SINGLE SOURCE OF TRUTH for thresholds + weights. The SQL migration
 * (supabase/migrations/20260625090000_creator_contribution_backbone.sql)
 * MIRRORS these numbers — keep both in sync.
 */
export const TIERS = ['seed', 'rising', 'pro', 'elite'] as const
export type Tier = (typeof TIERS)[number]

export const POINT_WEIGHTS = {
  dna_scan: 10,
  guide_published: 15,
  mission_verified: 40,
} as const
export type ContributionEventType = keyof typeof POINT_WEIGHTS

/** Ascending by `min`. tierForPoints relies on this order. */
export const TIER_THRESHOLDS: ReadonlyArray<{ tier: Tier; min: number }> = [
  { tier: 'seed', min: 0 },
  { tier: 'rising', min: 50 },
  { tier: 'pro', min: 150 },
  { tier: 'elite', min: 400 },
]

export function tierForPoints(points: number): Tier {
  const p = Math.max(0, Math.floor(points))
  let result: Tier = 'seed'
  for (const t of TIER_THRESHOLDS) {
    if (p >= t.min) result = t.tier
  }
  return result
}

export interface TierProgress {
  tier: Tier
  nextTier: Tier | null
  points: number
  pointsIntoTier: number
  pointsForNext: number | null
  pct: number // 0..100 within the current band
}

export function progressToNext(points: number): TierProgress {
  const p = Math.max(0, Math.floor(points))
  const tier = tierForPoints(p)
  const idx = TIER_THRESHOLDS.findIndex((t) => t.tier === tier)
  const currentMin = TIER_THRESHOLDS[idx].min
  const next = TIER_THRESHOLDS[idx + 1] ?? null
  if (!next) {
    return { tier, nextTier: null, points: p, pointsIntoTier: p - currentMin, pointsForNext: null, pct: 100 }
  }
  const band = next.min - currentMin
  const into = p - currentMin
  const pct = Math.min(100, Math.max(0, Math.round((into / band) * 100)))
  return { tier, nextTier: next.tier, points: p, pointsIntoTier: into, pointsForNext: next.min - p, pct }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pkill -f vitest; pnpm exec vitest run tests/contribution.tiers.test.ts --no-file-parallelism && pnpm exec tsc --noEmit`
Expected: PASS + tsc clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/contribution/tiers.ts apps/web/tests/contribution.tiers.test.ts
git commit -m "feat(phase5a): canonical tier ladder + scoring helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: DB migration — event log, projection, recompute, triggers, RLS, backfill

This task has **no Vitest** (no local DB). It is verified live via the Supabase MCP against `scryfkefedzuetfdtrvl`, then the generated db types are refreshed so later tasks compile.

**Files:**
- Create: `supabase/migrations/20260625090000_creator_contribution_backbone.sql`
- Modify (regenerated): `packages/db/types.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260625090000_creator_contribution_backbone.sql`:

```sql
-- Phase 5A: creator tier & contribution backbone.
-- Real, points-driven tier earned from real activity (published guides, verified
-- missions, completed DNA scan). Append-only event log + SECURITY DEFINER recompute
-- + a creator-private 1:1 projection. NO gating here (5B-5D). Mirrors Phase 3
-- trigger/backfill conventions (20260624000001) and guides grant style.
-- WEIGHTS/THRESHOLDS MIRROR apps/web/lib/contribution/tiers.ts -- keep in sync.

-- 1. Append-only contribution event log.
create table public.creator_contribution_events (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.creators(id) on delete cascade,
  event_type  text not null check (event_type in ('dna_scan','guide_published','mission_verified')),
  points      int  not null,
  source_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (creator_id, event_type, source_id)
);
create index creator_contribution_events_creator_idx
  on public.creator_contribution_events (creator_id, created_at desc);

-- 2. Creator-private 1:1 projection. Deliberately NOT columns on `creators`
--    (which anon can read) so tier never leaks to anon.
create table public.creator_contribution (
  creator_id          uuid primary key references public.creators(id) on delete cascade,
  contribution_points int not null default 0,
  tier                text not null default 'seed' check (tier in ('seed','rising','pro','elite')),
  tier_updated_at     timestamptz,
  updated_at          timestamptz not null default now()
);

-- 3. Threshold -> tier (mirrors TIER_THRESHOLDS).
create or replace function public.contribution_tier_for_points(p_points int)
returns text language sql immutable as $$
  select case
    when p_points >= 400 then 'elite'
    when p_points >= 150 then 'pro'
    when p_points >= 50  then 'rising'
    else 'seed'
  end;
$$;

-- 4. Recompute the projection for one creator from the event log (idempotent).
create or replace function public.recompute_creator_contribution(p_creator_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_points int;
  v_tier   text;
begin
  select coalesce(sum(points), 0) into v_points
  from public.creator_contribution_events where creator_id = p_creator_id;

  v_tier := public.contribution_tier_for_points(v_points);

  insert into public.creator_contribution (creator_id, contribution_points, tier, tier_updated_at, updated_at)
  values (p_creator_id, v_points, v_tier, now(), now())
  on conflict (creator_id) do update
    set contribution_points = excluded.contribution_points,
        tier = excluded.tier,
        tier_updated_at = case when public.creator_contribution.tier <> excluded.tier
                               then now() else public.creator_contribution.tier_updated_at end,
        updated_at = now();
end;
$$;

-- 5. Award (idempotent) / revoke an event, then recompute. DRY for the triggers.
create or replace function public.award_contribution_event(
  p_creator_id uuid, p_event_type text, p_points int, p_source_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.creator_contribution_events (creator_id, event_type, points, source_id)
  values (p_creator_id, p_event_type, p_points, p_source_id)
  on conflict (creator_id, event_type, source_id) do nothing;
  perform public.recompute_creator_contribution(p_creator_id);
end;
$$;

create or replace function public.revoke_contribution_event(
  p_creator_id uuid, p_event_type text, p_source_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.creator_contribution_events
  where creator_id = p_creator_id and event_type = p_event_type and source_id = p_source_id;
  perform public.recompute_creator_contribution(p_creator_id);
end;
$$;

-- 6. guides -> guide_published (15). Award on enter-published, revoke on leave/delete.
--    All AFTER triggers: return value ignored. Best-effort: never block the write.
create or replace function public.contribution_on_guide()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if (TG_OP = 'INSERT') then
      if new.status = 'published' then
        perform public.award_contribution_event(new.creator_id, 'guide_published', 15, new.id);
      end if;
    elsif (TG_OP = 'UPDATE') then
      if new.status = 'published' and coalesce(old.status,'') <> 'published' then
        perform public.award_contribution_event(new.creator_id, 'guide_published', 15, new.id);
      elsif old.status = 'published' and new.status <> 'published' then
        perform public.revoke_contribution_event(new.creator_id, 'guide_published', new.id);
      end if;
    elsif (TG_OP = 'DELETE') then
      if old.status = 'published' then
        perform public.revoke_contribution_event(old.creator_id, 'guide_published', old.id);
      end if;
    end if;
  exception when others then
    raise warning 'contribution_on_guide failed: %', sqlerrm;
  end;
  return null;
end;
$$;
create trigger guides_contribution
  after insert or update or delete on public.guides
  for each row execute procedure public.contribution_on_guide();

-- 7. creator_dna -> dna_scan (10). One-time per creator (source_id = creator_id).
create or replace function public.contribution_on_dna()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.status = 'published' and new.final is not null then
      perform public.award_contribution_event(new.creator_id, 'dna_scan', 10, new.creator_id);
    end if;
  exception when others then
    raise warning 'contribution_on_dna failed: %', sqlerrm;
  end;
  return null;
end;
$$;
create trigger creator_dna_contribution
  after insert or update on public.creator_dna
  for each row execute procedure public.contribution_on_dna();

-- 8. mission_milestone_submissions -> mission_verified (40), deduped per MISSION.
--    Award when a submission enters 'approved'; revoke when it leaves and no other
--    approved submission still backs that mission for that creator.
create or replace function public.contribution_on_submission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_creator_id uuid;
  v_mission_id uuid;
  v_remaining  int;
begin
  begin
    select mp.creator_id, ms.mission_id
      into v_creator_id, v_mission_id
    from public.mission_participants mp
    join public.mission_milestones ms on ms.id = new.mission_milestone_id
    where mp.id = new.mission_participant_id;

    if v_creator_id is null or v_mission_id is null then
      return null;
    end if;

    if (TG_OP = 'INSERT') then
      if new.status = 'approved' then
        perform public.award_contribution_event(v_creator_id, 'mission_verified', 40, v_mission_id);
      end if;
    elsif (TG_OP = 'UPDATE') then
      if new.status = 'approved' and coalesce(old.status,'') <> 'approved' then
        perform public.award_contribution_event(v_creator_id, 'mission_verified', 40, v_mission_id);
      elsif old.status = 'approved' and new.status <> 'approved' then
        select count(*) into v_remaining
        from public.mission_milestone_submissions s
        join public.mission_milestones m on m.id = s.mission_milestone_id
        join public.mission_participants p on p.id = s.mission_participant_id
        where m.mission_id = v_mission_id and p.creator_id = v_creator_id
          and s.status = 'approved' and s.id <> new.id;
        if coalesce(v_remaining, 0) = 0 then
          perform public.revoke_contribution_event(v_creator_id, 'mission_verified', v_mission_id);
        end if;
      end if;
    end if;
  exception when others then
    raise warning 'contribution_on_submission failed: %', sqlerrm;
  end;
  return null;
end;
$$;
create trigger submission_contribution
  after insert or update on public.mission_milestone_submissions
  for each row execute procedure public.contribution_on_submission();

-- 9. RLS: owner-read only; writes happen via SECURITY DEFINER functions (bypass RLS).
alter table public.creator_contribution_events enable row level security;
alter table public.creator_contribution enable row level security;

create policy "creator_contribution_events_owner_select" on public.creator_contribution_events
  for select using (creator_id = auth.uid());
create policy "creator_contribution_owner_select" on public.creator_contribution
  for select using (creator_id = auth.uid());

grant select on public.creator_contribution_events to authenticated;
grant select on public.creator_contribution to authenticated;
revoke all on public.creator_contribution_events from anon;
revoke all on public.creator_contribution from anon;

-- 10. Backfill from existing real activity, then recompute everyone with events.
do $$
declare r record;
begin
  for r in select id, creator_id from public.guides where status = 'published' loop
    insert into public.creator_contribution_events (creator_id, event_type, points, source_id)
    values (r.creator_id, 'guide_published', 15, r.id) on conflict do nothing;
  end loop;

  for r in select creator_id from public.creator_dna where status = 'published' and final is not null loop
    insert into public.creator_contribution_events (creator_id, event_type, points, source_id)
    values (r.creator_id, 'dna_scan', 10, r.creator_id) on conflict do nothing;
  end loop;

  for r in
    select distinct mp.creator_id, ms.mission_id
    from public.mission_milestone_submissions s
    join public.mission_participants mp on mp.id = s.mission_participant_id
    join public.mission_milestones ms on ms.id = s.mission_milestone_id
    where s.status = 'approved'
  loop
    insert into public.creator_contribution_events (creator_id, event_type, points, source_id)
    values (r.creator_id, 'mission_verified', 40, r.mission_id) on conflict do nothing;
  end loop;

  for r in select distinct creator_id from public.creator_contribution_events loop
    perform public.recompute_creator_contribution(r.creator_id);
  end loop;
end $$;
```

- [ ] **Step 2: Apply the migration live**

Apply via the Supabase MCP `apply_migration` (project `scryfkefedzuetfdtrvl`, name `creator_contribution_backbone`, the SQL above). Expected: success, no error.

- [ ] **Step 3: Verify schema + RLS via MCP `execute_sql`**

```sql
select tablename, rowsecurity from pg_tables
where schemaname='public' and tablename in ('creator_contribution','creator_contribution_events');
```
Expected: both rows present, `rowsecurity = true`.

```sql
select public.contribution_tier_for_points(0)   as t0,
       public.contribution_tier_for_points(49)  as t49,
       public.contribution_tier_for_points(50)  as t50,
       public.contribution_tier_for_points(150) as t150,
       public.contribution_tier_for_points(400) as t400;
```
Expected: `seed, seed, rising, pro, elite`.

- [ ] **Step 4: Verify the backfill matches real activity**

```sql
-- predicted points for the one active creator = 10 (scan) + 15 * (published guides)
select c.creator_id, c.contribution_points, c.tier,
       (select count(*) from public.guides g where g.creator_id = c.creator_id and g.status='published') as pub_guides
from public.creator_contribution c;
```
Expected: for each row, `contribution_points = 10 + 15*pub_guides + 40*(approved missions)`; live data has 0 approved submissions, so `mission_verified` count is 0. Confirm `tier` equals `contribution_tier_for_points(contribution_points)`.

```sql
select event_type, count(*) from public.creator_contribution_events group by event_type order by event_type;
```
Expected: `dna_scan = 1` (one published DNA), `guide_published = <count of published guides>`, no `mission_verified` rows.

- [ ] **Step 5: Verify idempotency + recompute**

```sql
-- re-running the backfill inserts nothing new (unique constraint) and recompute is stable
select public.recompute_creator_contribution(creator_id) from public.creator_contribution;
select count(*) as events_after from public.creator_contribution_events;
```
Expected: `events_after` unchanged from Step 4.

- [ ] **Step 6: Regenerate the db types**

Run from repo root: `pnpm --filter @kinnso/db gen`
(Equivalent: `cd packages/db && pnpm gen` — runs `supabase gen types typescript --linked > types.ts`.)
Then confirm the new tables appear: `grep -c "creator_contribution" packages/db/types.ts` → expect a non-zero count (≥ 2: both tables).

If the Supabase CLI is not linked/available in the environment, link first (`supabase link --project-ref scryfkefedzuetfdtrvl`) then re-run. Do not hand-edit `types.ts`.

- [ ] **Step 7: Typecheck**

Run from `apps/web`: `pnpm exec tsc --noEmit`
Expected: clean (no consumers yet; this just confirms the regenerated types compile).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260625090000_creator_contribution_backbone.sql packages/db/types.ts
git commit -m "feat(phase5a): contribution backbone migration (events, projection, triggers, RLS, backfill)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `lib/contribution/queries.ts` — owner-scoped reads

**Files:**
- Create: `apps/web/lib/contribution/queries.ts`
- Test: `apps/web/tests/contribution.queries.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/contribution.queries.test.ts` (mirrors the builder style in `creators.queries.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  contribution: null as unknown,
  events: [] as unknown[],
}))

function makeClient() {
  const builder = (resolve: () => unknown, single?: () => unknown) => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      order: () => Promise.resolve({ data: resolve() }),
      maybeSingle: async () => ({ data: single ? single() : null }),
    }
    return b
  }
  return {
    from: (table: string) =>
      table === 'creator_contribution'
        ? builder(() => null, () => state.contribution)
        : builder(() => state.events),
  }
}

import { getCreatorContribution, listContributionEvents } from '@/lib/contribution/queries'

beforeEach(() => {
  state.contribution = null
  state.events = []
})

describe('getCreatorContribution', () => {
  it('returns progress derived from the stored points', async () => {
    state.contribution = { contribution_points: 80, tier: 'rising' }
    const c = await getCreatorContribution(makeClient() as never, 'creator-1')
    expect(c.tier).toBe('rising')
    expect(c.points).toBe(80)
    expect(c.nextTier).toBe('pro')
    expect(c.pointsForNext).toBe(70)
  })

  it('defaults a creator with no row to seed/0', async () => {
    state.contribution = null
    const c = await getCreatorContribution(makeClient() as never, 'creator-1')
    expect(c.tier).toBe('seed')
    expect(c.points).toBe(0)
    expect(c.pct).toBe(0)
  })
})

describe('listContributionEvents', () => {
  it('maps event rows to camelCase items', async () => {
    state.events = [
      { id: 'e1', event_type: 'mission_verified', points: 40, created_at: '2026-06-20T00:00:00Z' },
      { id: 'e2', event_type: 'guide_published', points: 15, created_at: '2026-06-19T00:00:00Z' },
    ]
    const items = await listContributionEvents(makeClient() as never, 'creator-1')
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({ id: 'e1', eventType: 'mission_verified', points: 40, createdAt: '2026-06-20T00:00:00Z' })
  })

  it('returns an empty array when there are no events', async () => {
    expect(await listContributionEvents(makeClient() as never, 'creator-1')).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pkill -f vitest; pnpm exec vitest run tests/contribution.queries.test.ts --no-file-parallelism`
Expected: FAIL — cannot resolve `@/lib/contribution/queries`.

- [ ] **Step 3: Implement `queries.ts`**

Create `apps/web/lib/contribution/queries.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { progressToNext, type TierProgress, type ContributionEventType } from '@/lib/contribution/tiers'

export type CreatorContribution = TierProgress

/** Owner-scoped: the projection is RLS-gated to creator_id = auth.uid(). */
export async function getCreatorContribution(
  supabase: SupabaseClient<Database>,
  creatorId: string,
): Promise<CreatorContribution> {
  const { data } = await supabase
    .from('creator_contribution')
    .select('contribution_points, tier')
    .eq('creator_id', creatorId)
    .maybeSingle()
  return progressToNext(data?.contribution_points ?? 0)
}

export interface ContributionEvent {
  id: string
  eventType: ContributionEventType
  points: number
  createdAt: string
}

export async function listContributionEvents(
  supabase: SupabaseClient<Database>,
  creatorId: string,
): Promise<ContributionEvent[]> {
  const { data } = await supabase
    .from('creator_contribution_events')
    .select('id, event_type, points, created_at')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })
  return (data ?? []).map((e) => ({
    id: e.id as string,
    eventType: e.event_type as ContributionEventType,
    points: e.points as number,
    createdAt: e.created_at as string,
  }))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pkill -f vitest; pnpm exec vitest run tests/contribution.queries.test.ts --no-file-parallelism && pnpm exec tsc --noEmit`
Expected: PASS + tsc clean (the `from('creator_contribution')` calls resolve against the regenerated `Database` type from Task 3).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/contribution/queries.ts apps/web/tests/contribution.queries.test.ts
git commit -m "feat(phase5a): owner-scoped contribution queries

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `TierProgressCard` — dashboard card

**Files:**
- Create: `apps/web/components/kinnso/TierProgressCard.tsx`
- Test: `apps/web/tests/kinnso.TierProgressCard.test.tsx`

- [ ] **Step 1: Write the failing render test**

Create `apps/web/tests/kinnso.TierProgressCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { TierProgressCard } from '@/components/kinnso/TierProgressCard'
import { progressToNext } from '@/lib/contribution/tiers'

afterEach(cleanup)

describe('TierProgressCard', () => {
  it('renders the tier badge, points, and progress to next tier', () => {
    render(<TierProgressCard locale="en" t={en.tier} contribution={progressToNext(80)} />)
    expect(screen.getByText('Your tier')).toBeTruthy()
    expect(screen.getByText('Rising')).toBeTruthy() // tierMeta label for 'rising'
    expect(screen.getByText('70 pts to Pro')).toBeTruthy()
    expect(screen.getByText('Complete a verified mission')).toBeTruthy()
    const link = screen.getByRole('link', { name: /Tier details/i })
    expect(link.getAttribute('href')).toBe('/en/studio/tier')
  })

  it('shows the maxed message at elite with no next tier', () => {
    render(<TierProgressCard locale="en" t={en.tier} contribution={progressToNext(450)} />)
    expect(screen.getByText('Elite')).toBeTruthy()
    expect(screen.getByText('Top tier reached')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pkill -f vitest; pnpm exec vitest run tests/kinnso.TierProgressCard.test.tsx --no-file-parallelism`
Expected: FAIL — cannot resolve `@/components/kinnso/TierProgressCard`.

- [ ] **Step 3: Implement the card**

Create `apps/web/components/kinnso/TierProgressCard.tsx`:

```tsx
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorContribution } from '@/lib/contribution/queries'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import TierBadge from '@/components/kinnso/TierBadge'
import { tierMeta } from '@/lib/creator-mock'

/** Creator-private tier + progress card for the Studio dashboard. */
export function TierProgressCard({
  locale,
  t,
  contribution,
}: {
  locale: Locale
  t: Messages['tier']
  contribution: CreatorContribution
}) {
  const { tier, nextTier, points, pct, pointsForNext } = contribution
  return (
    <TicketCard className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-kinnso-ink">{t.cardTitle}</h2>
        <Link
          href={`/${locale}/studio/tier`}
          className="inline-flex items-center text-sm font-bold text-kinnso-orange"
        >
          {t.viewAll} <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4" />
        </Link>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <TierBadge tier={tier} />
        <span className="k-mono text-sm text-kinnso-muted">
          {points} {t.pointsSuffix}
        </span>
      </div>

      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-kinnso-cream2">
          <div className="h-full bg-kinnso-orange" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-sm text-kinnso-muted">
          {nextTier && pointsForNext !== null
            ? t.toNext.replace('{points}', String(pointsForNext)).replace('{tier}', tierMeta[nextTier].label)
            : t.maxed}
        </p>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-kinnso-muted">{t.earnHeading}</p>
        <ul className="mt-1 space-y-1 text-sm text-kinnso-ink">
          <li>{t.earnMission}</li>
          <li>{t.earnGuide}</li>
          <li>{t.earnScan}</li>
        </ul>
      </div>
    </TicketCard>
  )
}

export default TierProgressCard
```

- [ ] **Step 4: Run to verify it passes**

Run: `pkill -f vitest; pnpm exec vitest run tests/kinnso.TierProgressCard.test.tsx --no-file-parallelism && pnpm exec tsc --noEmit`
Expected: PASS + tsc clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/TierProgressCard.tsx apps/web/tests/kinnso.TierProgressCard.test.tsx
git commit -m "feat(phase5a): tier progress card for the studio dashboard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `StudioTierView` — `/studio/tier` page body

**Files:**
- Create: `apps/web/components/kinnso/pages/StudioTierView.tsx`
- Test: `apps/web/tests/kinnso.StudioTierView.test.tsx`

- [ ] **Step 1: Write the failing render test**

Create `apps/web/tests/kinnso.StudioTierView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { StudioTierView } from '@/components/kinnso/pages/StudioTierView'
import { progressToNext } from '@/lib/contribution/tiers'

afterEach(cleanup)

const events = [
  { id: 'e1', eventType: 'mission_verified' as const, points: 40, createdAt: '2026-06-20T00:00:00Z' },
  { id: 'e2', eventType: 'guide_published' as const, points: 15, createdAt: '2026-06-19T00:00:00Z' },
]

describe('StudioTierView', () => {
  it('renders current tier, all four tiers, and points history', () => {
    render(<StudioTierView locale="en" t={en.tier} contribution={progressToNext(55)} events={events} />)
    expect(screen.getByText('Tier & contribution')).toBeTruthy()
    expect(screen.getByText('All tiers')).toBeTruthy()
    // all four ladder labels present
    expect(screen.getByText('Seed')).toBeTruthy()
    expect(screen.getByText('Pro')).toBeTruthy()
    expect(screen.getByText('Elite')).toBeTruthy()
    // history rows by event label
    expect(screen.getByText('Mission verified')).toBeTruthy()
    expect(screen.getByText('Guide published')).toBeTruthy()
  })

  it('shows the empty history state when there are no events', () => {
    render(<StudioTierView locale="en" t={en.tier} contribution={progressToNext(0)} events={[]} />)
    expect(
      screen.getByText('No points yet — publish a guide or complete a mission to get started.'),
    ).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pkill -f vitest; pnpm exec vitest run tests/kinnso.StudioTierView.test.tsx --no-file-parallelism`
Expected: FAIL — cannot resolve `@/components/kinnso/pages/StudioTierView`.

- [ ] **Step 3: Implement the view**

Create `apps/web/components/kinnso/pages/StudioTierView.tsx`:

```tsx
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorContribution, ContributionEvent } from '@/lib/contribution/queries'
import { TIER_THRESHOLDS } from '@/lib/contribution/tiers'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import TierBadge from '@/components/kinnso/TierBadge'

const EVENT_LABEL_KEY = {
  guide_published: 'eventGuide',
  mission_verified: 'eventMission',
  dna_scan: 'eventScan',
} as const

export function StudioTierView({
  locale: _locale,
  t,
  contribution,
  events,
}: {
  locale: Locale
  t: Messages['tier']
  contribution: CreatorContribution
  events: ContributionEvent[]
}) {
  const { tier, points } = contribution
  return (
    <main>
      <section className="k-container space-y-6 py-10">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-kinnso-ink md:text-4xl">{t.pageHeading}</h1>
          <p className="mt-1 text-kinnso-muted">{t.pageSubtitle}</p>
        </div>

        {/* Current status */}
        <TicketCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-kinnso-muted">{t.currentLabel}</p>
          <div className="mt-2 flex items-center gap-3">
            <TierBadge tier={tier} />
            <span className="k-mono text-sm text-kinnso-muted">
              {points} {t.pointsSuffix}
            </span>
          </div>
        </TicketCard>

        {/* All tiers */}
        <TicketCard className="p-5">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.allTiersHeading}</h2>
          <ul className="mt-3 space-y-2">
            {TIER_THRESHOLDS.map((row) => (
              <li key={row.tier} className="flex items-center justify-between">
                <TierBadge tier={row.tier} />
                <span className="k-mono text-sm text-kinnso-muted">
                  {row.min}+ {t.pointsSuffix}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-kinnso-muted">{t.unlocksPlaceholder}</p>
        </TicketCard>

        {/* Points history */}
        <TicketCard className="p-5">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.historyHeading}</h2>
          {events.length === 0 ? (
            <p className="mt-2 text-sm text-kinnso-muted">{t.historyEmpty}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-kinnso-ink">{t[EVENT_LABEL_KEY[e.eventType]]}</span>
                  <span className="k-mono text-kinnso-muted">
                    +{e.points} {t.pointsSuffix}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TicketCard>
      </section>
    </main>
  )
}

export default StudioTierView
```

Note: this file does **not** import `tierMeta` directly — `TierBadge` reads `tierMeta` internally, and tier labels in the ladder/history come from `TierBadge` + the i18n event labels, so the import block intentionally omits it (avoids an unused-import lint error).

- [ ] **Step 4: Run to verify it passes**

Run: `pkill -f vitest; pnpm exec vitest run tests/kinnso.StudioTierView.test.tsx --no-file-parallelism && pnpm exec tsc --noEmit && pnpm exec eslint components/kinnso/pages/StudioTierView.tsx`
Expected: PASS + tsc clean + 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/pages/StudioTierView.tsx apps/web/tests/kinnso.StudioTierView.test.tsx
git commit -m "feat(phase5a): studio tier view (status, ladder, points history)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `/studio/tier` host route

**Files:**
- Create: `apps/web/app/[locale]/studio/tier/page.tsx`
- Test: `apps/web/tests/studio.tier.host.test.tsx`

- [ ] **Step 1: Write the failing host test** (mirrors `studio.earnings.host.test.tsx`)

Create `apps/web/tests/studio.tier.host.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { getContribMock, listEventsMock, notFoundMock, resolveViewerRoleMock } = vi.hoisted(() => ({
  getContribMock: vi.fn(),
  listEventsMock: vi.fn(async () => []),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  resolveViewerRoleMock: vi.fn(async () => 'creator'),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) }),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: resolveViewerRoleMock }))
vi.mock('@/lib/contribution/queries', () => ({
  getCreatorContribution: getContribMock,
  listContributionEvents: listEventsMock,
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'creator-user-1' } } }) },
  }),
}))

import StudioTierPage from '@/app/[locale]/studio/tier/page'
import { progressToNext } from '@/lib/contribution/tiers'

beforeEach(() => {
  resolveViewerRoleMock.mockReset()
  resolveViewerRoleMock.mockResolvedValue('creator')
  getContribMock.mockReset()
  getContribMock.mockResolvedValue(progressToNext(55))
  listEventsMock.mockReset()
  listEventsMock.mockResolvedValue([])
})

describe('/[locale]/studio/tier host', () => {
  it('redirects non-creator viewers', async () => {
    resolveViewerRoleMock.mockResolvedValueOnce('merchant')
    await expect(StudioTierPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow(/NEXT_REDIRECT/)
    expect(getContribMock).not.toHaveBeenCalled()
  })

  it('renders the tier view for a creator', async () => {
    const ui = await StudioTierPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Tier & contribution')).toBeTruthy()
    expect(getContribMock).toHaveBeenCalledWith(expect.anything(), 'creator-user-1')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pkill -f vitest; pnpm exec vitest run tests/studio.tier.host.test.tsx --no-file-parallelism`
Expected: FAIL — cannot resolve `@/app/[locale]/studio/tier/page`.

- [ ] **Step 3: Implement the host route**

Create `apps/web/app/[locale]/studio/tier/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { getCreatorContribution, listContributionEvents } from '@/lib/contribution/queries'
import { StudioTierView } from '@/components/kinnso/pages/StudioTierView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function StudioTierPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const loc: Locale = isLocale(locale) ? (locale as Locale) : 'en'
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const role = await resolveViewerRole(supabase)
  if (role !== 'creator') redirect(`/${loc}/studio`)

  const [contribution, events] = await Promise.all([
    getCreatorContribution(supabase, user.id),
    listContributionEvents(supabase, user.id),
  ])

  return <StudioTierView locale={loc} t={messages.tier} contribution={contribution} events={events} />
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pkill -f vitest; pnpm exec vitest run tests/studio.tier.host.test.tsx --no-file-parallelism && pnpm exec tsc --noEmit`
Expected: PASS + tsc clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/[locale]/studio/tier/page.tsx apps/web/tests/studio.tier.host.test.tsx
git commit -m "feat(phase5a): /studio/tier host route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Wire the card into the dashboard

**Files:**
- Modify: `apps/web/components/kinnso/pages/StudioDashboardView.tsx`
- Modify: `apps/web/app/[locale]/studio/page.tsx`
- Test: `apps/web/tests/kinnso.StudioDashboardView.test.tsx` (create)

- [ ] **Step 1: Write a failing render test for the card in the view**

Create `apps/web/tests/kinnso.StudioDashboardView.test.tsx`. Build minimal valid props; the only assertion is that the tier card renders. (DNA is validated jsonb — use a minimal object cast through `unknown` as other view tests do.)

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { StudioDashboardView } from '@/components/kinnso/pages/StudioDashboardView'
import { progressToNext } from '@/lib/contribution/tiers'
import type { Dna } from '@kinnso/scan'

afterEach(cleanup)

const dna = {
  niches: ['Coffee'], content_pillars: ['Cafes'], tone: ['calm'], languages: ['en'],
  audience: { top_geos: ['HK'], top_locales: ['zh-HK'] }, platforms: [],
} as unknown as Dna

describe('StudioDashboardView', () => {
  it('renders the tier progress card', () => {
    render(
      <StudioDashboardView
        locale="en"
        t={en.studioDashboard}
        studioHomeT={en.studioHome}
        progressT={en.onboarding.progressStep}
        creatorId="creator-1"
        name="Maya"
        dna={dna}
        lastScanned="2026-06-20T00:00:00Z"
        readiness={{ items: [], doneCount: 0, totalCount: 0 } as never}
        opportunities={[]}
        earnings={[]}
        platforms={[]}
        missingPlatforms={[]}
        activeJobId={null}
        contribution={progressToNext(55)}
        tierT={en.tier}
      />,
    )
    expect(screen.getByText(en.tier.cardTitle)).toBeTruthy()
    expect(screen.getByText('Rising')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pkill -f vitest; pnpm exec vitest run tests/kinnso.StudioDashboardView.test.tsx --no-file-parallelism`
Expected: FAIL — `contribution` is not an accepted prop (tsc/runtime) and the card is not rendered.

- [ ] **Step 3: Add the props + render the card in the view**

The view currently receives `t={messages.studioDashboard}`, which has no `tier` strings — so pass the `tier` group as a separate `tierT` prop alongside `contribution`.

In `apps/web/components/kinnso/pages/StudioDashboardView.tsx`:

(a) Add the imports near the other component imports:
```tsx
import { TierProgressCard } from '@/components/kinnso/TierProgressCard'
import type { CreatorContribution } from '@/lib/contribution/queries'
```

(b) Add two fields to `StudioDashboardViewProps` (after `activeJobId: string | null`):
```tsx
  contribution: CreatorContribution
  tierT: Messages['tier']
```

(c) Add `contribution` and `tierT` to the destructure (the line beginning `const { locale, t, studioHomeT, ...`):
```tsx
  const { locale, t, studioHomeT, progressT, creatorId, name, dna, lastScanned, readiness, opportunities, earnings, platforms, missingPlatforms, activeJobId, contribution, tierT } = props
```

(d) Render the card immediately after the DNA snapshot block (after the `<DnaSnapshotCard .../>` line, before the `{/* 3. Readiness checklist ... */}` comment):
```tsx
        {/* 2b. Tier progress */}
        <TierProgressCard locale={locale} t={tierT} contribution={contribution} />
```

- [ ] **Step 4: Wire the host page to fetch + pass contribution**

In `apps/web/app/[locale]/studio/page.tsx`:

Add the import:
```tsx
import { getCreatorContribution } from '@/lib/contribution/queries'
```

Add the fetch to the existing `Promise.all` array (append as a new entry and destructure it):
```tsx
  const [handleRes, guidesRes, activeJobRes, missionsRes, offersRes, settlementsRes, contribution] = await Promise.all([
    supabase.from('creator_social_handles').select('platform, handle, url').eq('creator_id', user.id),
    supabase.from('guides').select('id').eq('creator_id', user.id),
    supabase.from('creator_scan_jobs').select('id, status').eq('creator_id', user.id).in('status', ['queued', 'fetching', 'analyzing']).limit(1).maybeSingle(),
    listCreatorMerchantMissions(supabase),
    listAffiliateOffers(supabase),
    listCreatorSettlements(supabase),
    getCreatorContribution(supabase, user.id),
  ])
```

Pass the two new props to the rendered view (add to the `<StudioDashboardView ... />` prop list):
```tsx
      contribution={contribution}
      tierT={messages.tier}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pkill -f vitest; pnpm exec vitest run tests/kinnso.StudioDashboardView.test.tsx --no-file-parallelism && pnpm exec tsc --noEmit`
Expected: PASS + tsc clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/pages/StudioDashboardView.tsx apps/web/app/[locale]/studio/page.tsx apps/web/tests/kinnso.StudioDashboardView.test.tsx
git commit -m "feat(phase5a): render tier card on the studio dashboard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Studio quick-links Tier tile

**Files:**
- Modify: `apps/web/components/kinnso/StudioQuickLinks.tsx:2,10-17`
- Test: `apps/web/tests/kinnso.StudioQuickLinks.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/kinnso.StudioQuickLinks.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { StudioQuickLinks } from '@/components/kinnso/StudioQuickLinks'

afterEach(cleanup)

describe('StudioQuickLinks', () => {
  it('renders a live Tier tile linking to /studio/tier', () => {
    render(<StudioQuickLinks locale="en" t={en.studioHome} />)
    const link = screen.getByRole('link', { name: /Tier/i })
    expect(link.getAttribute('href')).toBe('/en/studio/tier')
    expect(screen.getByText('Your contribution points and tier.')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pkill -f vitest; pnpm exec vitest run tests/kinnso.StudioQuickLinks.test.tsx --no-file-parallelism`
Expected: FAIL — no Tier tile / link to `/en/studio/tier`.

- [ ] **Step 3: Add the Tier tile**

In `apps/web/components/kinnso/StudioQuickLinks.tsx`:

Add `Trophy` to the lucide import on line 2:
```tsx
import { ArrowRight, Inbox, PenSquare, Sparkles, Tag, Target, Trophy, Wallet } from 'lucide-react'
```

Add a Tier entry to the `tools` array (place it right after the `missions` entry):
```tsx
    { href: '/studio/tier', title: t.tierTitle, desc: t.tierDesc, live: true, icon: <Trophy aria-hidden="true" className="h-5 w-5" /> },
```

- [ ] **Step 4: Run to verify it passes**

Run: `pkill -f vitest; pnpm exec vitest run tests/kinnso.StudioQuickLinks.test.tsx --no-file-parallelism && pnpm exec tsc --noEmit`
Expected: PASS + tsc clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/StudioQuickLinks.tsx apps/web/tests/kinnso.StudioQuickLinks.test.tsx
git commit -m "feat(phase5a): add Tier tile to studio quick links

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Full gate + live smoke

**Files:** none (verification only)

- [ ] **Step 1: Targeted vitest sweep over all touched/new tests**

Run from `apps/web`:
```bash
pkill -f vitest
pnpm exec vitest run \
  tests/i18n.locale-parity.test.ts \
  tests/contribution.tiers.test.ts \
  tests/contribution.queries.test.ts \
  tests/kinnso.TierProgressCard.test.tsx \
  tests/kinnso.StudioTierView.test.tsx \
  tests/studio.tier.host.test.tsx \
  tests/kinnso.StudioDashboardView.test.tsx \
  tests/kinnso.StudioQuickLinks.test.tsx \
  --no-file-parallelism
```
Expected: all green.

- [ ] **Step 2: Typecheck + lint + build**

Run from `apps/web`:
```bash
pnpm exec tsc --noEmit
pnpm exec eslint .
pnpm build
```
Expected: tsc clean, 0 lint errors, build success.

- [ ] **Step 3: Live smoke (signed-in creator)**

With the owner's logged-in session on the deployed preview (or `pnpm dev`):
1. Visit `/en/studio` — the **Your tier** card renders with the creator's real tier badge + points + progress bar; a **Tier** tile appears in quick links.
2. Click into `/en/studio/tier` — current tier, all four tiers with `0+/50+/150+/400+ pts`, the "Perks and unlocks arrive soon." placeholder, and a points-history list reflecting the backfilled events (the owner's published guides + DNA scan; no missions yet).
3. Confirm in another browser (anon) that `/en/c/<handle>` does **not** show tier (creator-private). Optionally verify via MCP: `select has_table_privilege('anon','public.creator_contribution','select')` → expect `false`.

- [ ] **Step 4: Final verification note**

Confirm the full suite has no new failures attributable to this work (env-only 5000ms timeouts in untouched files are pre-existing flake, not regressions). Record the gate results for the PR body.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- D1 (points-only tier) → Tasks 2, 3 (no DNA-score input; `dna_scan` is a fixed starter event). ✓
- D2 (guide/mission/scan events; not settled) → Task 3 triggers + backfill (no settlement trigger). ✓
- D3 (event log + SECURITY DEFINER recompute + 1:1 projection) → Task 3. ✓
- D4 (seed/rising/pro/elite re-keyed to points) → Task 2 constants, mirrored in Task 3 SQL. ✓
- D5 (dashboard card + `/studio/tier` page with history) → Tasks 5, 6, 7, 8. ✓
- D6 (creator-private, minimal rip-out) → owner-only RLS + `revoke anon` (Task 3); TierBadge reused, mock untouched (Tasks 5/6). ✓
- i18n 7-locale parity → Task 1. ✓
- Best-effort triggers / COALESCE-missing / idempotency → Task 3 (exception-swallow, `on conflict do nothing`) + Task 4 (`?? 0`). ✓
- Testing matrix (boundaries, queries, renders, host, parity; SQL live) → Tasks 2–10. ✓

**Placeholder scan:** none — all code/strings are concrete. The one "what unlocks" UI text is an intentional, translated placeholder string (`unlocksPlaceholder`), not a plan gap.

**Type consistency:** `Tier`/`TierProgress`/`CreatorContribution`/`ContributionEvent`/`ContributionEventType` defined in Tasks 2/4 and used consistently in Tasks 5–8; `getCreatorContribution(supabase, creatorId)` signature identical across Tasks 4, 7, 8; `tierT`/`contribution` props added in Task 8 match the dashboard test. SQL weights (10/15/40) and thresholds (0/50/150/400) match `tiers.ts`.
