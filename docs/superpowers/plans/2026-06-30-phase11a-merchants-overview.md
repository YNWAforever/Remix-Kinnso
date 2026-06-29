# Phase 11A — Merchants Operator Console: Nav + Overview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first Merchants Operator Console slice — a `Merchants` admin nav item and an Overview tab (KPIs, two trend sparklines, top-merchants leaderboard, at-risk list, recent moderation activity) backed by a new `is_active_ops()`-gated `admin_merchant_analytics()` RPC.

**Architecture:** Exact mirror of the Phase 10A Creators Overview. A SECURITY DEFINER analytics RPC returns one jsonb payload; a server query maps it snake→camel and appends the shared audit feed; a server-component route gates on `requireOpsPage` then renders a client view built from shared `KpiCard`/`TrendChart` primitives. No mutations in this slice (read-only).

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript, Tailwind v4, Supabase Postgres (SECURITY DEFINER RPC), Vitest 4 + jsdom + Testing Library, custom i18n (7 locales).

**Spec:** `docs/superpowers/specs/2026-06-30-phase11-merchants-operator-console-design.md` (§4 11A row, §4.1 payload, §5, §7, §8).

**Working dir:** the repo clone (branch `feat/merchants-console`, cut from `main` @ `bc0bd3f`). All paths below are relative to repo root `apps/web/…` unless noted.

**i18n group name:** the admin console group is **`merchantsOps`** — a `merchants` group already exists for the merchant-FACING UI, so the console must NOT reuse it.

---

## File Structure

**Create:**
- `supabase/migrations/20260630120000_admin_merchant_analytics.sql` — the analytics RPC.
- `apps/web/components/kinnso/admin/KpiCard.tsx` — moved from `creators/` (shared).
- `apps/web/components/kinnso/admin/TrendChart.tsx` — moved from `creators/` (shared).
- `apps/web/lib/admin/merchants-queries.ts` — `getMerchantsOverview` + types.
- `apps/web/components/kinnso/admin/merchants/MerchantsTabs.tsx` — Overview/Directory tabs.
- `apps/web/components/kinnso/admin/merchants/MerchantsLeaderboard.tsx` — top-merchants list.
- `apps/web/components/kinnso/admin/merchants/MerchantsOverviewView.tsx` — the Overview view.
- `apps/web/app/[locale]/admin/merchants/page.tsx` — the Overview route.
- `apps/web/tests/admin.merchants-queries.test.ts` — query unit tests.
- `apps/web/tests/kinnso.MerchantsOverviewView.test.tsx` — view + tabs render tests.
- `apps/web/tests/admin.merchants-overview.host.test.tsx` — route gate tests.

**Modify:**
- `apps/web/components/kinnso/admin/creators/KpiCard.tsx` + `TrendChart.tsx` — delete (moved); update importers.
- `apps/web/components/kinnso/admin/creators/CreatorsOverviewView.tsx:5-6` — import KpiCard/TrendChart from the shared path.
- `apps/web/components/kinnso/admin/AdminShell.tsx:10-15` — add the Merchants nav item.
- `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` — add the `merchantsOps` group + `admin.navMerchants`.
- `packages/db/types.ts:1616` — add the `admin_merchant_analytics` Functions entry.
- `apps/web/tests/i18n.locale-parity.test.ts:14-19` — add `'merchantsOps'` to `GROUPS`.

---

## Task 1: Extract shared `KpiCard` + `TrendChart` primitives

Both consoles use these; lift them out of the `creators/` namespace so Merchants reuses rather than imports across domains. Pure move + re-point — no behavior change.

**Files:**
- Create: `apps/web/components/kinnso/admin/KpiCard.tsx`, `apps/web/components/kinnso/admin/TrendChart.tsx`
- Delete: `apps/web/components/kinnso/admin/creators/KpiCard.tsx`, `apps/web/components/kinnso/admin/creators/TrendChart.tsx`
- Modify: `apps/web/components/kinnso/admin/creators/CreatorsOverviewView.tsx`

- [ ] **Step 1: Create the shared `KpiCard.tsx`** (identical content to the creators one)

```tsx
import { TicketCard } from '@/components/kinnso/MarketPassport'

export function KpiCard({ label, value, delta }: { label: string; value: number; delta?: number }) {
  return (
    <TicketCard className="p-5">
      <p className="text-3xl font-black text-kinnso-ink">{value}</p>
      <p className="mt-1 text-sm text-kinnso-muted">{label}</p>
      {delta !== undefined && (
        <p className={`mt-1 text-xs font-bold ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {delta >= 0 ? `+${delta}` : `${delta}`}
        </p>
      )}
    </TicketCard>
  )
}

export default KpiCard
```

- [ ] **Step 2: Create the shared `TrendChart.tsx`** (identical content to the creators one)

```tsx
export interface TrendPoint {
  label: string
  value: number
}

/** Minimal dependency-free bar sparkline. Heights are scaled to the series max. */
export function TrendChart({
  points,
  emptyText,
  ariaLabel,
}: {
  points: TrendPoint[]
  emptyText: string
  ariaLabel?: string
}) {
  if (points.length === 0) {
    return <p className="py-6 text-sm text-kinnso-muted">{emptyText}</p>
  }
  const max = Math.max(...points.map((p) => p.value), 1)
  return (
    <div className="flex h-24 items-end gap-1" role="img" aria-label={ariaLabel}>
      {points.map((p, i) => (
        <div
          key={`${p.label}-${i}`}
          data-testid="trend-bar"
          title={`${p.label}: ${p.value}`}
          className="flex-1 rounded-t bg-kinnso-orange/70"
          style={{ height: `${Math.round((p.value / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

export default TrendChart
```

- [ ] **Step 3: Re-point the Creators view imports**

In `apps/web/components/kinnso/admin/creators/CreatorsOverviewView.tsx`, change lines 5-6 from:
```tsx
import { KpiCard } from '@/components/kinnso/admin/creators/KpiCard'
import { TrendChart } from '@/components/kinnso/admin/creators/TrendChart'
```
to:
```tsx
import { KpiCard } from '@/components/kinnso/admin/KpiCard'
import { TrendChart } from '@/components/kinnso/admin/TrendChart'
```

- [ ] **Step 4: Find and re-point any other importers, then delete the old files**

Run: `cd apps/web && grep -rln "admin/creators/KpiCard\|admin/creators/TrendChart" .`
For each hit (e.g. a test file), change the import path to `@/components/kinnso/admin/KpiCard` / `…/TrendChart`. Then delete the originals:
```bash
git rm apps/web/components/kinnso/admin/creators/KpiCard.tsx apps/web/components/kinnso/admin/creators/TrendChart.tsx
```

- [ ] **Step 5: Verify typecheck + creators tests still pass**

Run: `pnpm --filter web typecheck && pnpm --filter web test -- creators-overview-parts CreatorsOverviewView`
Expected: PASS (no behavior changed; imports resolve).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(web): lift KpiCard + TrendChart to shared admin namespace

Both the Creators and (upcoming) Merchants consoles use these primitives;
move them out of creators/ so Merchants reuses rather than cross-imports.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `admin_merchant_analytics()` migration

**Files:**
- Create: `supabase/migrations/20260630120000_admin_merchant_analytics.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 11A — Merchants Operator Console: ops-aggregate analytics for the Overview.
-- Mirrors admin_creator_analytics: a single jsonb payload, gated internally on
-- is_active_ops() so non-ops are rejected at the DB boundary. Read-only (no audit).
-- Heuristics (documented + tunable here):
--   missions_live        = missions with status='published'
--   owed / settled       = mission_settlements creator-payout leg, grouped by currency
--                          (never summed across currencies)
--   at_risk reasons:
--     growth_idle      = tier='growth' merchant with no published mission
--     disputed         = a settlement on one of the merchant's missions is 'disputed'
--     pending_overdue  = a settlement is 'pending' and older than 30 days
create or replace function public.admin_merchant_analytics(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days       int := greatest(1, least(coalesce(p_days, 30), 365));
  v_start      timestamptz := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_prev_start timestamptz := v_start - make_interval(days => v_days);
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'total', (select count(*) from public.merchant_profiles),
      'by_status', coalesce((
        select jsonb_object_agg(status, c) from (
          select status, count(*) as c from public.merchant_profiles group by status
        ) s), '{}'::jsonb),
      'by_tier', coalesce((
        select jsonb_object_agg(tier, c) from (
          select tier, count(*) as c from public.merchant_profiles group by tier
        ) s), '{}'::jsonb),
      'new_in_period', (select count(*) from public.merchant_profiles where created_at >= v_start),
      'new_prev_period', (select count(*) from public.merchant_profiles
        where created_at >= v_prev_start and created_at < v_start),
      'missions_live', (select count(*) from public.missions where status = 'published'),
      'settlements_pending', (select count(*) from public.mission_settlements
        where status in ('pending', 'partially_paid')),
      'owed', coalesce((
        select jsonb_agg(jsonb_build_object('currency', cur, 'amount', amt) order by cur) from (
          select coalesce(amount_currency, 'unknown') as cur, sum(coalesce(creator_commission_amount, 0)) as amt
          from public.mission_settlements where creator_payout_status = 'pending' group by 1
        ) o), '[]'::jsonb),
      'settled', coalesce((
        select jsonb_agg(jsonb_build_object('currency', cur, 'amount', amt) order by cur) from (
          select coalesce(amount_currency, 'unknown') as cur, sum(coalesce(creator_commission_amount, 0)) as amt
          from public.mission_settlements where creator_payout_status = 'paid' group by 1
        ) s2), '[]'::jsonb)
    ),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', cnt) order by d) from (
        select date_trunc('day', created_at) as d, count(*) as cnt
        from public.merchant_profiles where created_at >= v_start group by 1
      ) t), '[]'::jsonb),
    'missions_created', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', cnt) order by d) from (
        select date_trunc('day', created_at) as d, count(*) as cnt
        from public.missions where created_at >= v_start and merchant_profile_id is not null group by 1
      ) m), '[]'::jsonb),
    'leaderboard', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'company_name', x.company_name, 'tier', x.tier,
        'missions_count', x.missions_count, 'creators_engaged', x.creators_engaged)
        order by x.missions_count desc, x.creators_engaged desc) from (
        select mp.id, mp.company_name, mp.tier,
          (select count(*) from public.missions mi where mi.merchant_profile_id = mp.id) as missions_count,
          (select count(distinct part.creator_id) from public.missions mi2
             join public.mission_participants part on part.mission_id = mi2.id
             where mi2.merchant_profile_id = mp.id) as creators_engaged
        from public.merchant_profiles mp
        order by missions_count desc, creators_engaged desc
        limit 10
      ) x
    ), '[]'::jsonb),
    'at_risk', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'company_name', r.company_name, 'reason', r.reason))
      from (
        select mp.id, mp.company_name,
          case
            when exists (
              select 1 from public.missions mi join public.mission_settlements ms on ms.mission_id = mi.id
              where mi.merchant_profile_id = mp.id and ms.status = 'disputed') then 'disputed'
            when exists (
              select 1 from public.missions mi join public.mission_settlements ms on ms.mission_id = mi.id
              where mi.merchant_profile_id = mp.id and ms.status = 'pending'
                and ms.created_at < now() - interval '30 days') then 'pending_overdue'
            else 'growth_idle'
          end as reason
        from public.merchant_profiles mp
        where exists (
                select 1 from public.missions mi join public.mission_settlements ms on ms.mission_id = mi.id
                where mi.merchant_profile_id = mp.id and ms.status in ('disputed', 'pending')
                  and (ms.status = 'disputed' or ms.created_at < now() - interval '30 days'))
           or (mp.tier = 'growth' and not exists (
                select 1 from public.missions mi
                where mi.merchant_profile_id = mp.id and mi.status = 'published'))
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end $$;

-- Grants. Revoke the implicit public+anon EXECUTE, grant only authenticated.
revoke all on function public.admin_merchant_analytics(int) from public, anon;
grant execute on function public.admin_merchant_analytics(int) to authenticated;
```

- [ ] **Step 2: Apply the migration live** (MCP, project `scryfkefedzuetfdtrvl`)

Use the Supabase MCP `apply_migration` tool with name `admin_merchant_analytics` and the SQL above. Confirm success (no error). Do NOT use `pnpm` to run migrations — this project applies via MCP.

- [ ] **Step 3: Smoke-check the function exists**

Use MCP `execute_sql`: `select proname from pg_proc where proname = 'admin_merchant_analytics';`
Expected: one row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260630120000_admin_merchant_analytics.sql
git commit -m "feat(db): admin_merchant_analytics() ops-aggregate RPC for Merchants Overview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Patch `packages/db/types.ts`

**Files:**
- Modify: `packages/db/types.ts` (insert before `admin_creator_analytics:` at line ~1616, keeping alpha-ish grouping is not required — adjacency is fine)

- [ ] **Step 1: Add the Functions entry**

Immediately above the `admin_creator_analytics: {` block, insert:
```ts
      admin_merchant_analytics: {
        Args: { p_days?: number }
        Returns: Json
      }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @kinnso/db typecheck 2>/dev/null || pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/types.ts
git commit -m "chore(db): hand-patch types for admin_merchant_analytics

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: i18n — `merchantsOps` group + `admin.navMerchants` (×7) + parity

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (type decl + value), `zh-hk.ts`, `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`, `th.ts` (value only — they are typed as `Messages`)
- Modify: `apps/web/tests/i18n.locale-parity.test.ts`

- [ ] **Step 1: Add the `merchantsOps` type to the `Messages` interface in `en.ts`**

Find the `creators: { … }` block in the **interface/type** section of `en.ts` (the first `creators:` near line ~626, inside `export interface Messages`). Immediately after that block's closing `}` add:
```ts
    merchantsOps: {
      title: string; subtitle: string
      tabOverview: string; tabDirectory: string
      kpiTotal: string; kpiActive: string; kpiPaused: string; kpiSuspended: string; kpiArchived: string
      kpiFree: string; kpiGrowth: string; kpiNew: string; kpiMissionsLive: string; kpiSettlementsPending: string
      trendSignups: string; trendMissions: string; trendEmpty: string
      leaderboardTitle: string; leaderboardEmpty: string; lbMissions: string; lbCreators: string
      atRiskTitle: string; atRiskEmpty: string
      reasonGrowthIdle: string; reasonDisputed: string; reasonPendingOverdue: string
      activityTitle: string; activityEmpty: string
    }
```

- [ ] **Step 2: Add `navMerchants: string` to the `admin` type**

In `en.ts` at the admin type line (~621): `navDashboard: string; navPerks: string; navUsers: string; navCreators: string` → append ` navMerchants: string`.

- [ ] **Step 3: Add the `merchantsOps` VALUE block + `admin.navMerchants` value to `en.ts`**

In the `const en: Messages = { … }` value object, find the `admin: { … }` value (navDashboard etc. near line ~1503) and add `navMerchants: 'Merchants',` to it. Then find the `creators: { … }` VALUE block (the large object literal, not the interface type — search downward from line ~1503) and after its closing `}` add:
```ts
    merchantsOps: {
      title: 'Merchants',
      subtitle: 'Understand, moderate, and analyze your merchants.',
      tabOverview: 'Overview', tabDirectory: 'Directory',
      kpiTotal: 'Total merchants', kpiActive: 'Active', kpiPaused: 'Paused', kpiSuspended: 'Suspended', kpiArchived: 'Archived',
      kpiFree: 'Free tier', kpiGrowth: 'Growth tier', kpiNew: 'New this period', kpiMissionsLive: 'Live missions', kpiSettlementsPending: 'Settlements pending',
      trendSignups: 'Merchant signups', trendMissions: 'Missions created', trendEmpty: 'No data in this period',
      leaderboardTitle: 'Top merchants', leaderboardEmpty: 'No merchants yet', lbMissions: 'missions', lbCreators: 'creators',
      atRiskTitle: 'At-risk merchants', atRiskEmpty: 'No at-risk merchants',
      reasonGrowthIdle: 'Growth tier, no live missions', reasonDisputed: 'Disputed settlement', reasonPendingOverdue: 'Settlement overdue',
      activityTitle: 'Recent moderation activity', activityEmpty: 'No moderation activity yet',
    },
```
> Note: the exact insertion point is "after the existing `creators` group, inside the same object". If `creators` is the last group, add a trailing comma after its `}` first.

- [ ] **Step 4: Add the value block + `navMerchants` to the other 6 locales**

For each file add `navMerchants: '<label>',` to its `admin` value object, and a `merchantsOps: { … }` block with the translations below. Keys MUST match en exactly (parity test).

`zh-hk.ts` — navMerchants `'商戶'`:
```ts
    merchantsOps: {
      title: '商戶', subtitle: '了解、管理及分析你的商戶。',
      tabOverview: '概覽', tabDirectory: '商戶目錄',
      kpiTotal: '商戶總數', kpiActive: '活躍', kpiPaused: '已暫停', kpiSuspended: '已停權', kpiArchived: '已封存',
      kpiFree: '免費方案', kpiGrowth: '成長方案', kpiNew: '本期新增', kpiMissionsLive: '進行中任務', kpiSettlementsPending: '待結算',
      trendSignups: '商戶註冊', trendMissions: '已建立任務', trendEmpty: '此期間沒有數據',
      leaderboardTitle: '頂尖商戶', leaderboardEmpty: '暫無商戶', lbMissions: '個任務', lbCreators: '位創作者',
      atRiskTitle: '高風險商戶', atRiskEmpty: '沒有高風險商戶',
      reasonGrowthIdle: '成長方案但無進行中任務', reasonDisputed: '結算有爭議', reasonPendingOverdue: '結算逾期',
      activityTitle: '近期審核活動', activityEmpty: '暫無審核活動',
    },
```
`zh-tw.ts` — navMerchants `'商家'`:
```ts
    merchantsOps: {
      title: '商家', subtitle: '了解、管理及分析您的商家。',
      tabOverview: '總覽', tabDirectory: '商家目錄',
      kpiTotal: '商家總數', kpiActive: '使用中', kpiPaused: '已暫停', kpiSuspended: '已停權', kpiArchived: '已封存',
      kpiFree: '免費方案', kpiGrowth: '成長方案', kpiNew: '本期新增', kpiMissionsLive: '進行中任務', kpiSettlementsPending: '待結算',
      trendSignups: '商家註冊', trendMissions: '已建立任務', trendEmpty: '此期間沒有資料',
      leaderboardTitle: '頂尖商家', leaderboardEmpty: '尚無商家', lbMissions: '個任務', lbCreators: '位創作者',
      atRiskTitle: '高風險商家', atRiskEmpty: '沒有高風險商家',
      reasonGrowthIdle: '成長方案但無進行中任務', reasonDisputed: '結算有爭議', reasonPendingOverdue: '結算逾期',
      activityTitle: '近期審核活動', activityEmpty: '尚無審核活動',
    },
```
`zh-cn.ts` — navMerchants `'商家'`:
```ts
    merchantsOps: {
      title: '商家', subtitle: '了解、管理和分析你的商家。',
      tabOverview: '概览', tabDirectory: '商家目录',
      kpiTotal: '商家总数', kpiActive: '活跃', kpiPaused: '已暂停', kpiSuspended: '已封禁', kpiArchived: '已归档',
      kpiFree: '免费方案', kpiGrowth: '成长方案', kpiNew: '本期新增', kpiMissionsLive: '进行中任务', kpiSettlementsPending: '待结算',
      trendSignups: '商家注册', trendMissions: '已创建任务', trendEmpty: '此期间没有数据',
      leaderboardTitle: '顶级商家', leaderboardEmpty: '暂无商家', lbMissions: '个任务', lbCreators: '位创作者',
      atRiskTitle: '高风险商家', atRiskEmpty: '没有高风险商家',
      reasonGrowthIdle: '成长方案但无进行中任务', reasonDisputed: '结算有争议', reasonPendingOverdue: '结算逾期',
      activityTitle: '近期审核活动', activityEmpty: '暂无审核活动',
    },
```
`ja.ts` — navMerchants `'マーチャント'`:
```ts
    merchantsOps: {
      title: 'マーチャント', subtitle: 'マーチャントを把握・管理・分析します。',
      tabOverview: '概要', tabDirectory: 'ディレクトリ',
      kpiTotal: 'マーチャント総数', kpiActive: 'アクティブ', kpiPaused: '一時停止', kpiSuspended: '停止中', kpiArchived: 'アーカイブ済み',
      kpiFree: 'フリープラン', kpiGrowth: 'グロースプラン', kpiNew: '今期の新規', kpiMissionsLive: '公開中のミッション', kpiSettlementsPending: '精算待ち',
      trendSignups: 'マーチャント登録', trendMissions: '作成されたミッション', trendEmpty: 'この期間のデータはありません',
      leaderboardTitle: 'トップマーチャント', leaderboardEmpty: 'まだマーチャントがいません', lbMissions: '件のミッション', lbCreators: '人のクリエイター',
      atRiskTitle: 'リスクのあるマーチャント', atRiskEmpty: 'リスクのあるマーチャントはいません',
      reasonGrowthIdle: 'グロースプランだが公開中のミッションなし', reasonDisputed: '精算に異議あり', reasonPendingOverdue: '精算が期限超過',
      activityTitle: '最近のモデレーション活動', activityEmpty: 'モデレーション活動はまだありません',
    },
```
`ko.ts` — navMerchants `'머천트'`:
```ts
    merchantsOps: {
      title: '머천트', subtitle: '머천트를 파악, 관리, 분석하세요.',
      tabOverview: '개요', tabDirectory: '디렉터리',
      kpiTotal: '전체 머천트', kpiActive: '활성', kpiPaused: '일시중지', kpiSuspended: '정지됨', kpiArchived: '보관됨',
      kpiFree: '무료 등급', kpiGrowth: '그로스 등급', kpiNew: '이번 기간 신규', kpiMissionsLive: '진행 중 미션', kpiSettlementsPending: '정산 대기',
      trendSignups: '머천트 가입', trendMissions: '생성된 미션', trendEmpty: '이 기간에 데이터가 없습니다',
      leaderboardTitle: '상위 머천트', leaderboardEmpty: '아직 머천트가 없습니다', lbMissions: '개 미션', lbCreators: '명 크리에이터',
      atRiskTitle: '위험 머천트', atRiskEmpty: '위험 머천트가 없습니다',
      reasonGrowthIdle: '그로스 등급이지만 진행 중 미션 없음', reasonDisputed: '정산 분쟁', reasonPendingOverdue: '정산 기한 초과',
      activityTitle: '최근 모더레이션 활동', activityEmpty: '아직 모더레이션 활동이 없습니다',
    },
```
`th.ts` — navMerchants `'ร้านค้า'`:
```ts
    merchantsOps: {
      title: 'ร้านค้า', subtitle: 'ทำความเข้าใจ ดูแล และวิเคราะห์ร้านค้าของคุณ',
      tabOverview: 'ภาพรวม', tabDirectory: 'ไดเรกทอรี',
      kpiTotal: 'ร้านค้าทั้งหมด', kpiActive: 'ใช้งาน', kpiPaused: 'หยุดชั่วคราว', kpiSuspended: 'ถูกระงับ', kpiArchived: 'เก็บถาวร',
      kpiFree: 'แพ็กเกจฟรี', kpiGrowth: 'แพ็กเกจ Growth', kpiNew: 'ใหม่ในช่วงนี้', kpiMissionsLive: 'ภารกิจที่เผยแพร่', kpiSettlementsPending: 'รอการชำระ',
      trendSignups: 'การสมัครร้านค้า', trendMissions: 'ภารกิจที่สร้าง', trendEmpty: 'ไม่มีข้อมูลในช่วงนี้',
      leaderboardTitle: 'ร้านค้ายอดนิยม', leaderboardEmpty: 'ยังไม่มีร้านค้า', lbMissions: 'ภารกิจ', lbCreators: 'ครีเอเตอร์',
      atRiskTitle: 'ร้านค้าเสี่ยง', atRiskEmpty: 'ไม่มีร้านค้าเสี่ยง',
      reasonGrowthIdle: 'แพ็กเกจ Growth แต่ไม่มีภารกิจที่เผยแพร่', reasonDisputed: 'การชำระมีข้อพิพาท', reasonPendingOverdue: 'การชำระเกินกำหนด',
      activityTitle: 'กิจกรรมการกลั่นกรองล่าสุด', activityEmpty: 'ยังไม่มีกิจกรรมการกลั่นกรอง',
    },
```

- [ ] **Step 5: Add `'merchantsOps'` to the parity test `GROUPS`**

In `apps/web/tests/i18n.locale-parity.test.ts`, append `'merchantsOps'` to the `GROUPS` array (line ~18, after `'creators'`).

- [ ] **Step 6: Run the parity test**

Run: `pnpm --filter web test -- i18n.locale-parity`
Expected: PASS (en defines `merchantsOps`; all 7 locales have identical keys).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/i18n/messages packages apps/web/tests/i18n.locale-parity.test.ts
git commit -m "i18n(web): add merchantsOps group + admin.navMerchants across 7 locales

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `getMerchantsOverview` query + types (TDD)

**Files:**
- Create: `apps/web/lib/admin/merchants-queries.ts`
- Test: `apps/web/tests/admin.merchants-queries.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock, auditMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  auditMock: vi.fn(async () => [{ id: 'a1', entityType: 'merchant', entityId: 'm1', action: 'status.set', reason: 'x', metadata: {}, createdAt: '2026-06-30T00:00:00Z' }]),
}))
vi.mock('@/lib/admin/audit', () => ({ listRecentAudit: auditMock }))

import { getMerchantsOverview } from '@/lib/admin/merchants-queries'

const okPayload = {
  kpis: { total: 4, by_status: { active: 3, paused: 1 }, by_tier: { free: 2, growth: 2 },
    new_in_period: 1, new_prev_period: 0, missions_live: 5, settlements_pending: 2,
    owed: [{ currency: 'HKD', amount: 100 }], settled: [{ currency: 'HKD', amount: 50 }] },
  signups: [{ day: '2026-06-29', count: 1 }],
  missions_created: [{ day: '2026-06-29', count: 2 }],
  leaderboard: [{ id: 'm1', company_name: 'Acme', tier: 'growth', missions_count: 5, creators_engaged: 3 }],
  at_risk: [{ id: 'm2', company_name: 'Idle Co', reason: 'growth_idle' }],
}
const client = { rpc: rpcMock } as never

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: okPayload, error: null })
  auditMock.mockClear()
})

describe('getMerchantsOverview', () => {
  it('calls admin_merchant_analytics and maps snake→camel', async () => {
    const o = await getMerchantsOverview(client, 30)
    expect(rpcMock).toHaveBeenCalledWith('admin_merchant_analytics', { p_days: 30 })
    expect(o.kpis.total).toBe(4)
    expect(o.kpis.byStatus.paused).toBe(1)
    expect(o.kpis.byTier.growth).toBe(2)
    expect(o.kpis.missionsLive).toBe(5)
    expect(o.kpis.owed).toEqual([{ currency: 'HKD', amount: 100 }])
    expect(o.signups).toEqual([{ day: '2026-06-29', count: 1 }])
    expect(o.missionsCreated).toEqual([{ day: '2026-06-29', count: 2 }])
    expect(o.leaderboard[0]).toEqual({ id: 'm1', companyName: 'Acme', tier: 'growth', missionsCount: 5, creatorsEngaged: 3 })
    expect(o.atRisk[0]).toEqual({ id: 'm2', companyName: 'Idle Co', reason: 'growth_idle' })
    expect(o.recentActivity).toHaveLength(1)
    expect(auditMock).toHaveBeenCalledWith(client, 'merchant', 20)
  })

  it('throws when the RPC errors', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    await expect(getMerchantsOverview(client)).rejects.toBeTruthy()
  })

  it('defaults missing arrays to empty', async () => {
    rpcMock.mockResolvedValueOnce({ data: { ...okPayload, signups: undefined, leaderboard: undefined, at_risk: undefined, missions_created: undefined }, error: null })
    const o = await getMerchantsOverview(client)
    expect(o.signups).toEqual([])
    expect(o.leaderboard).toEqual([])
    expect(o.atRisk).toEqual([])
    expect(o.missionsCreated).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test -- admin.merchants-queries`
Expected: FAIL (`getMerchantsOverview` is not defined).

- [ ] **Step 3: Implement `merchants-queries.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { listRecentAudit, type AuditEntry } from '@/lib/admin/audit'

type Client = SupabaseClient<Database>

export interface MerchantsOverview {
  kpis: {
    total: number
    byStatus: Record<string, number>
    byTier: Record<string, number>
    newInPeriod: number
    newPrevPeriod: number
    missionsLive: number
    settlementsPending: number
    owed: { currency: string; amount: number }[]
    settled: { currency: string; amount: number }[]
  }
  signups: { day: string; count: number }[]
  missionsCreated: { day: string; count: number }[]
  leaderboard: { id: string; companyName: string | null; tier: string; missionsCount: number; creatorsEngaged: number }[]
  atRisk: { id: string; companyName: string | null; reason: string }[]
  recentActivity: AuditEntry[]
}

type AnalyticsPayload = {
  kpis: {
    total: number
    by_status: Record<string, number>
    by_tier: Record<string, number>
    new_in_period: number
    new_prev_period: number
    missions_live: number
    settlements_pending: number
    owed?: { currency: string; amount: number }[]
    settled?: { currency: string; amount: number }[]
  }
  signups?: { day: string; count: number }[]
  missions_created?: { day: string; count: number }[]
  leaderboard?: { id: string; company_name: string | null; tier: string; missions_count: number; creators_engaged: number }[]
  at_risk?: { id: string; company_name: string | null; reason: string }[]
}

/**
 * Ops-aggregate Merchants Overview. Counts/series come from the SECURITY DEFINER
 * `admin_merchant_analytics()` RPC (gated on is_active_ops()). The recent-activity
 * feed reads the shared ops_audit_log. Errors propagate (no silent zeros).
 */
export async function getMerchantsOverview(supabase: Client, days = 30): Promise<MerchantsOverview> {
  const { data, error } = await supabase.rpc('admin_merchant_analytics', { p_days: days })
  if (error || !data) throw error ?? new Error('admin_merchant_analytics returned no data')
  const a = data as unknown as AnalyticsPayload
  const recentActivity = await listRecentAudit(supabase, 'merchant', 20)
  return {
    kpis: {
      total: Number(a.kpis.total),
      byStatus: a.kpis.by_status ?? {},
      byTier: a.kpis.by_tier ?? {},
      newInPeriod: Number(a.kpis.new_in_period),
      newPrevPeriod: Number(a.kpis.new_prev_period),
      missionsLive: Number(a.kpis.missions_live),
      settlementsPending: Number(a.kpis.settlements_pending),
      owed: (a.kpis.owed ?? []).map((o) => ({ currency: o.currency, amount: Number(o.amount) })),
      settled: (a.kpis.settled ?? []).map((s) => ({ currency: s.currency, amount: Number(s.amount) })),
    },
    signups: (a.signups ?? []).map((s) => ({ day: s.day, count: Number(s.count) })),
    missionsCreated: (a.missions_created ?? []).map((m) => ({ day: m.day, count: Number(m.count) })),
    leaderboard: (a.leaderboard ?? []).map((l) => ({
      id: l.id, companyName: l.company_name, tier: l.tier,
      missionsCount: Number(l.missions_count), creatorsEngaged: Number(l.creators_engaged),
    })),
    atRisk: (a.at_risk ?? []).map((r) => ({ id: r.id, companyName: r.company_name, reason: r.reason })),
    recentActivity,
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web test -- admin.merchants-queries`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/merchants-queries.ts apps/web/tests/admin.merchants-queries.test.ts
git commit -m "feat(web): getMerchantsOverview query mapping admin_merchant_analytics

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `MerchantsTabs` + `MerchantsLeaderboard` + `MerchantsOverviewView` (TDD)

**Files:**
- Create: `apps/web/components/kinnso/admin/merchants/MerchantsTabs.tsx`, `MerchantsLeaderboard.tsx`, `MerchantsOverviewView.tsx`
- Test: `apps/web/tests/kinnso.MerchantsOverviewView.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin/merchants' }))

import { MerchantsOverviewView } from '@/components/kinnso/admin/merchants/MerchantsOverviewView'
import type { MerchantsOverview } from '@/lib/admin/merchants-queries'

const overview: MerchantsOverview = {
  kpis: { total: 9, byStatus: { active: 6, paused: 2, suspended: 1, archived: 0 }, byTier: { free: 5, growth: 4 },
    newInPeriod: 2, newPrevPeriod: 1, missionsLive: 3, settlementsPending: 4, owed: [], settled: [] },
  signups: [{ day: '2026-06-29', count: 2 }],
  missionsCreated: [{ day: '2026-06-29', count: 3 }],
  leaderboard: [{ id: 'm1', companyName: 'Acme', tier: 'growth', missionsCount: 5, creatorsEngaged: 3 }],
  atRisk: [{ id: 'm2', companyName: 'Idle Co', reason: 'growth_idle' }],
  recentActivity: [],
}

describe('MerchantsOverviewView', () => {
  it('renders KPIs, leaderboard, and a localized at-risk reason', () => {
    render(<MerchantsOverviewView t={en.merchantsOps} locale="en" overview={overview} />)
    expect(screen.getByText('9')).toBeTruthy()           // total KPI
    expect(screen.getByText('Acme')).toBeTruthy()        // leaderboard row
    expect(screen.getByText('Growth tier, no live missions')).toBeTruthy() // at-risk reason mapped
    expect(screen.getByText(en.merchantsOps.title)).toBeTruthy()
  })
  it('shows empty states when lists are empty', () => {
    render(<MerchantsOverviewView t={en.merchantsOps} locale="en" overview={{ ...overview, leaderboard: [], atRisk: [], recentActivity: [] }} />)
    expect(screen.getByText(en.merchantsOps.leaderboardEmpty)).toBeTruthy()
    expect(screen.getByText(en.merchantsOps.atRiskEmpty)).toBeTruthy()
    expect(screen.getByText(en.merchantsOps.activityEmpty)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test -- kinnso.MerchantsOverviewView`
Expected: FAIL (component not found).

- [ ] **Step 3: Implement `MerchantsTabs.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'

export function MerchantsTabs({ t, locale }: { t: Messages['merchantsOps']; locale: Locale }) {
  const pathname = usePathname()
  const tabs = [
    { href: `/${locale}/admin/merchants`, label: t.tabOverview },
    { href: `/${locale}/admin/merchants/directory`, label: t.tabDirectory },
  ]
  return (
    <nav className="mb-6 flex gap-2 border-b border-kinnso-line">
      {tabs.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined}
            className={`px-3 py-2 text-sm font-bold ${active ? 'border-b-2 border-kinnso-orange text-kinnso-orange' : 'text-kinnso-muted hover:text-kinnso-ink'}`}>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

export default MerchantsTabs
```

- [ ] **Step 4: Implement `MerchantsLeaderboard.tsx`**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'
import type { MerchantsOverview } from '@/lib/admin/merchants-queries'

export function MerchantsLeaderboard({ t, rows }: { t: Messages['merchantsOps']; rows: MerchantsOverview['leaderboard'] }) {
  if (rows.length === 0) return <p className="py-6 text-sm text-kinnso-muted">{t.leaderboardEmpty}</p>
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3">
          <span className="min-w-0 flex-1 truncate font-bold text-kinnso-ink">{r.companyName ?? '—'}</span>
          <span className="shrink-0 text-kinnso-muted">{r.missionsCount} {t.lbMissions} · {r.creatorsEngaged} {t.lbCreators}</span>
        </li>
      ))}
    </ul>
  )
}

export default MerchantsLeaderboard
```

- [ ] **Step 5: Implement `MerchantsOverviewView.tsx`**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { MerchantsOverview } from '@/lib/admin/merchants-queries'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { KpiCard } from '@/components/kinnso/admin/KpiCard'
import { TrendChart } from '@/components/kinnso/admin/TrendChart'
import { MerchantsLeaderboard } from '@/components/kinnso/admin/merchants/MerchantsLeaderboard'
import { MerchantsTabs } from '@/components/kinnso/admin/merchants/MerchantsTabs'

const REASON_LABEL = (t: Messages['merchantsOps']): Record<string, string> => ({
  growth_idle: t.reasonGrowthIdle,
  disputed: t.reasonDisputed,
  pending_overdue: t.reasonPendingOverdue,
})

export function MerchantsOverviewView({ t, locale, overview }: { t: Messages['merchantsOps']; locale: Locale; overview: MerchantsOverview }) {
  const { kpis, signups, missionsCreated, leaderboard, atRisk, recentActivity } = overview
  const reasons = REASON_LABEL(t)
  const kpiCards = [
    { label: t.kpiTotal, value: kpis.total },
    { label: t.kpiActive, value: kpis.byStatus.active ?? 0 },
    { label: t.kpiPaused, value: kpis.byStatus.paused ?? 0 },
    { label: t.kpiSuspended, value: kpis.byStatus.suspended ?? 0 },
    { label: t.kpiArchived, value: kpis.byStatus.archived ?? 0 },
    { label: t.kpiFree, value: kpis.byTier.free ?? 0 },
    { label: t.kpiGrowth, value: kpis.byTier.growth ?? 0 },
    { label: t.kpiNew, value: kpis.newInPeriod, delta: kpis.newInPeriod - kpis.newPrevPeriod },
    { label: t.kpiMissionsLive, value: kpis.missionsLive },
    { label: t.kpiSettlementsPending, value: kpis.settlementsPending },
  ]
  return (
    <main>
      <MerchantsTabs t={t} locale={locale} />
      <h1 className="k-display">{t.title}</h1>
      <p className="mt-2 text-kinnso-muted">{t.subtitle}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {kpiCards.map((c) => (
          <KpiCard key={c.label} label={c.label} value={c.value} delta={c.delta} />
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.trendSignups}</p>
          <TrendChart points={signups.map((s) => ({ label: s.day, value: s.count }))} emptyText={t.trendEmpty} ariaLabel={t.trendSignups} />
        </TicketCard>
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.trendMissions}</p>
          <TrendChart points={missionsCreated.map((m) => ({ label: m.day, value: m.count }))} emptyText={t.trendEmpty} ariaLabel={t.trendMissions} />
        </TicketCard>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.leaderboardTitle}</p>
          <MerchantsLeaderboard t={t} rows={leaderboard} />
        </TicketCard>
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.atRiskTitle}</p>
          {atRisk.length === 0 ? (
            <p className="py-6 text-sm text-kinnso-muted">{t.atRiskEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {atRisk.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate font-bold text-kinnso-ink">{r.companyName ?? '—'}</span>
                  <span className="text-orange-700">{reasons[r.reason] ?? r.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </TicketCard>
      </div>

      <TicketCard className="mt-8 p-5">
        <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.activityTitle}</p>
        {recentActivity.length === 0 ? (
          <p className="py-6 text-sm text-kinnso-muted">{t.activityEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {recentActivity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3">
                <span className="font-bold text-kinnso-ink">{a.action}</span>
                <span className="min-w-0 flex-1 truncate text-kinnso-muted">{a.reason ?? ''}</span>
                <span className="shrink-0 text-kinnso-muted">{a.createdAt.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </TicketCard>
    </main>
  )
}

export default MerchantsOverviewView
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter web test -- kinnso.MerchantsOverviewView`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/kinnso/admin/merchants apps/web/tests/kinnso.MerchantsOverviewView.test.tsx
git commit -m "feat(web): Merchants Overview view + tabs + leaderboard components

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Overview route + nav wiring (TDD host test)

**Files:**
- Create: `apps/web/app/[locale]/admin/merchants/page.tsx`
- Modify: `apps/web/components/kinnso/admin/AdminShell.tsx`
- Test: `apps/web/tests/admin.merchants-overview.host.test.tsx`

- [ ] **Step 1: Write the failing host test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
const { roleMock, getUserMock, overviewMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  overviewMock: vi.fn(async () => ({
    kpis: { total: 9, byStatus: { active: 6 }, byTier: { free: 5, growth: 4 }, newInPeriod: 2, newPrevPeriod: 1, missionsLive: 3, settlementsPending: 4, owed: [], settled: [] },
    signups: [], missionsCreated: [], leaderboard: [], atRisk: [], recentActivity: [],
  })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  usePathname: () => '/en/admin/merchants',
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/admin/merchants-queries', () => ({ getMerchantsOverview: overviewMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import MerchantsOverviewPage from '@/app/[locale]/admin/merchants/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }) })

describe('admin merchants overview host', () => {
  it('renders the overview for an ops user', async () => {
    const ui = await MerchantsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('9')).toBeTruthy()
  })
  it('notFounds for a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('merchant')
    await expect(MerchantsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('redirects an anonymous user to sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(MerchantsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('notFounds for an unknown locale', async () => {
    await expect(MerchantsOverviewPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
```

> Note: this mirrors `admin.creators.host.test.tsx`. Confirm the non-ops gate path uses `resolveViewerRole` returning a non-`'ops'` value → `requireOpsPage` throws `notFound`; the anon path returns `user:null` → redirect to `/en/sign-in`. If `requireOpsPage`'s internals differ, copy the exact mock shape from `admin.creators.host.test.tsx` (it is the proven reference).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test -- admin.merchants-overview.host`
Expected: FAIL (page module not found).

- [ ] **Step 3: Implement the route `page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getMerchantsOverview } from '@/lib/admin/merchants-queries'
import { MerchantsOverviewView } from '@/components/kinnso/admin/merchants/MerchantsOverviewView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function MerchantsOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  // Gate before any data access: Next renders layout + page in parallel, so the
  // layout's gate does not precede this page's fetch. Match the sibling admin pages.
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const overview = await getMerchantsOverview(supabase)
  return <MerchantsOverviewView t={messages.merchantsOps} locale={loc} overview={overview} />
}
```

- [ ] **Step 4: Wire the nav item in `AdminShell.tsx`**

Change the `nav` array (lines 10-15) to insert Merchants after Creators:
```tsx
  const nav = [
    { href: `/${locale}/admin`, label: t.navDashboard },
    { href: `/${locale}/admin/creators`, label: t.navCreators },
    { href: `/${locale}/admin/merchants`, label: t.navMerchants },
    { href: `/${locale}/admin/perks`, label: t.navPerks },
    { href: `/${locale}/admin/users`, label: t.navUsers },
  ]
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter web test -- admin.merchants-overview.host`
Expected: PASS (4 tests).

- [ ] **Step 6: Full gate — typecheck, lint, full test suite**

Run: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test`
Expected: all PASS (incl. i18n parity 7/7 and the untouched creators suites).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/[locale]/admin/merchants apps/web/components/kinnso/admin/AdminShell.tsx apps/web/tests/admin.merchants-overview.host.test.tsx
git commit -m "feat(web): Merchants Overview route + admin nav item

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done criteria for 11A

- `/<locale>/admin/merchants` renders KPIs, two trend sparklines, top-merchants leaderboard, at-risk list, and recent moderation activity for an ops user; non-ops `notFound`s; anon redirects.
- `Merchants` appears in the admin sidebar between Creators and Perks.
- `admin_merchant_analytics()` applied live and EXECUTE-gated to `authenticated` only (real gate is `is_active_ops()`).
- `pnpm --filter web typecheck && lint && test` all green; i18n parity covers `merchantsOps` across 7 locales.
- Shared `KpiCard`/`TrendChart` consumed by both consoles.

## After 11A

Open PR `feat/merchants-console` → `main` titled **"Phase 11A — Merchants Operator Console: nav + Overview"**, run the multi-lens adversarial review (security / data-mapping / i18n-parity), squash-merge, then return to writing-plans for **11B (Directory + audited lifecycle)** cut from the freshly-merged `main`.
