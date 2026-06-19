# Front-of-House Slice 3d — Studio Monetization (Offers + Earnings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `/studio/offers` and `/studio/earnings` Coming-Soon stubs into real, data-backed creator surfaces over the existing Merchant Brief Flow v1 schema, and split affiliate offers out of `/studio/missions`.

**Architecture:** Web-only. Add three scoped Supabase queries + a pure earnings rollup to the existing `apps/web/lib/missions` domain layer, render them through two new presentational views and two replaced route hosts (creator-auth-gated, dynamic), and flip the two dashboard tiles live. Reuses existing tables, RLS, grants, and server actions — **no migration**.

**Tech Stack:** Next.js 16 App Router (RSC + client components), React 19, TypeScript, Supabase Postgres/RLS via `@supabase/ssr`, Vitest 4 + jsdom + @testing-library/react, next-intl-style dictionary (`getDictionary`).

---

## Conventions for this plan

- **Repo topology (critical):** application **code** lives in the nested git repo `kinnso-v3/` (default branch **`main`**). This plan doc lives in that same repo (`kinnso-v3/docs/superpowers/`). All code paths below are relative to `kinnso-v3/`. Commit from inside `kinnso-v3`; verify `git rev-parse --show-toplevel` ends in `/kinnso-v3`.
- **Absolute repo root:** `/Users/willylai/Documents/Claude/Projects/Remix Kinnso/kinnso-v3`
- **Branch:** already created — `feat/front-of-house-slice3d-studio-monetization` off `origin/main` (which contains Slice 3b + Merchant Brief Flow v1). Slice 3c (PR #19) is independent; do not rebase onto it.
- **Commands** (from `kinnso-v3` root): single test → `pnpm --filter web exec vitest run <path-rel-to-apps/web>`; `pnpm --filter web typecheck`; `pnpm --filter web lint`; `pnpm --filter web build`; full gate → `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter web build`.
- **Vitest gotcha:** include glob is `tests/**/*.test.{ts,tsx}` ONLY — every test lives under `apps/web/tests/`. Default env `node`; opt into jsdom per-file with a `// @vitest-environment jsdom` first line.
- **TDD:** failing test → red → implement → green → commit. One logical change per commit.
- **Commits:** end every commit message with the trailer line `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (omitted from the short `-m` examples below for brevity).
- **No migration in this slice.** Do not create migration files or touch `packages/db/types.ts`.

## File Structure

| File | New/Mod | Responsibility |
|---|---|---|
| `apps/web/tests/i18n.locale-parity.test.ts` | Mod | Add `studioOffers`, `studioEarnings` to `GROUPS` |
| `apps/web/lib/i18n/messages/en.ts` | Mod | `Messages` interface + en values; +2 groups |
| `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` | Mod | Same 2 groups, translated (parity) |
| `apps/web/lib/missions/earnings.ts` | New | Pure `toCreatorEarningItem` + `summarizeCreatorEarnings` + types |
| `apps/web/tests/mission.earnings.test.ts` | New | Unit tests for the two pure helpers |
| `apps/web/lib/missions/queries.ts` | Mod | +`creatorSettlementSelect`, +`listAffiliateOffers`, +`listCreatorMerchantMissions`, +`listCreatorSettlements`; −`listCreatorMissions` |
| `apps/web/tests/mission.queries.test.ts` | Mod | Replace `listCreatorMissions` test with the three new queries |
| `apps/web/components/kinnso/pages/StudioOffersView.tsx` | New | Affiliate-offer cards (join / generate / copy) |
| `apps/web/tests/kinnso.StudioOffersView.test.tsx` | New | jsdom render + interaction test |
| `apps/web/app/[locale]/studio/offers/page.tsx` | Replace | Offers host (query + actions + view) |
| `apps/web/tests/studio.offers.host.test.tsx` | New | Host render + role gate test |
| `apps/web/app/[locale]/studio/missions/page.tsx` | Mod | Use `listCreatorMerchantMissions` |
| `apps/web/tests/studio.missions.host.test.tsx` | Mod | Mock the renamed query |
| `apps/web/components/kinnso/pages/StudioEarningsView.tsx` | New | Summary cards + per-mission table + empty state |
| `apps/web/tests/kinnso.StudioEarningsView.test.tsx` | New | jsdom render test |
| `apps/web/app/[locale]/studio/earnings/page.tsx` | Replace | Earnings host (query + rollup + view) |
| `apps/web/tests/studio.earnings.host.test.tsx` | New | Host render + role gate test |
| `apps/web/components/kinnso/pages/StudioHomeView.tsx` | Mod | Flip `earnings` + `offers` tiles to `live: true` |

**Dependency order:** Task 1 (i18n) → Task 2 (earnings helpers) → Task 3 (queries) → Task 4 (OffersView) → Task 5 (offers host) → Task 6 (missions host swap) → Task 7 (EarningsView) → Task 8 (earnings host) → Task 9 (dashboard) → Task 10 (gate).

---

### Task 1: i18n — `studioOffers` + `studioEarnings` groups (7 locales) + parity

**Files:**
- Modify: `apps/web/tests/i18n.locale-parity.test.ts`
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface + values)
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`, `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`, `th.ts`

- [ ] **Step 1: Extend the `GROUPS` oracle in the parity test**

In `apps/web/tests/i18n.locale-parity.test.ts`, change the `GROUPS` array to add the two groups at the end:

```ts
const GROUPS = [
  'studio', 'creatorProfile', 'merchants', 'missions', 'ops', 'nav', 'footer', 'home', 'comingSoon',
  'studioHome', 'explore', 'feed', 'creatorsLanding', 'merchantsLanding',
  'studioOffers', 'studioEarnings',
] as const
```

- [ ] **Step 2: Run parity to verify it fails**

Run: `pnpm --filter web exec vitest run tests/i18n.locale-parity.test.ts`
Expected: FAIL — `en defines the three new groups` fails because `studioOffers`/`studioEarnings` are `undefined` (zero key paths).

- [ ] **Step 3: Add the two groups to the `Messages` interface (`en.ts`)**

In `apps/web/lib/i18n/messages/en.ts`, in the `Messages` interface, immediately after the `merchantsLanding: { … }` group, add:

```ts
  studioOffers: {
    heading: string
    subtitle: string
    empty: string
    join: string
    generateLink: string
    copy: string
    copied: string
    category: string
    commission: string
    viewProgram: string
  }
  studioEarnings: {
    heading: string
    subtitle: string
    paid: string
    pending: string
    empty: string
    colMission: string
    colType: string
    colAmount: string
    colStatus: string
  }
```

- [ ] **Step 4: Add the en values (`en.ts`)**

In the same file, in the exported `en` object, immediately after the `merchantsLanding: { … }` values, add:

```ts
  studioOffers: {
    heading: 'Affiliate offers',
    subtitle: 'Join travel affiliate programs and generate tracked partner links.',
    empty: 'No affiliate offers are available right now.',
    join: 'Join offer',
    generateLink: 'Generate partner link',
    copy: 'Copy',
    copied: 'Copied',
    category: 'Category',
    commission: 'Commission',
    viewProgram: 'View program',
  },
  studioEarnings: {
    heading: 'Earnings',
    subtitle: 'Track payouts from missions and affiliate commissions.',
    paid: 'Paid',
    pending: 'Pending',
    empty: 'No earnings yet. Completed missions and settled commissions will appear here.',
    colMission: 'Mission',
    colType: 'Type',
    colAmount: 'Amount',
    colStatus: 'Status',
  },
```

- [ ] **Step 5: Add the same two groups to each non-en locale**

In each of `zh-hk.ts`, `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`, `th.ts`, add `studioOffers` and `studioEarnings` objects with the **same keys**, placed after that file's `merchantsLanding` group, using locale-appropriate translations that match the tone of the existing `studioHome` / `missions` groups in the same file. The `i18n.locale-parity` test is the structural oracle — keys must match `en` exactly. Reference translations (use or refine):

- **zh-hk / zh-tw (繁體):** heading「聯盟優惠」/「收益」; subtitle「加入旅遊聯盟計劃並產生可追蹤的合作連結。」/「追蹤任務與聯盟佣金的收益。」; empty「暫時沒有可用的聯盟優惠。」/「尚未有收益，已完成的任務及已結算的佣金會在此顯示。」; join「加入優惠」; generateLink「產生合作連結」; copy「複製」; copied「已複製」; category「類別」; commission「佣金」; viewProgram「查看計劃」; paid「已支付」; pending「待支付」; colMission「任務」; colType「類型」; colAmount「金額」; colStatus「狀態」.
- **zh-cn (简体):** heading「联盟优惠」/「收益」; subtitle「加入旅游联盟计划并生成可追踪的合作链接。」/「追踪任务与联盟佣金的收益。」; empty「暂时没有可用的联盟优惠。」/「尚无收益，已完成的任务及已结算的佣金会在此显示。」; join「加入优惠」; generateLink「生成合作链接」; copy「复制」; copied「已复制」; category「类别」; commission「佣金」; viewProgram「查看计划」; paid「已支付」; pending「待支付」; colMission「任务」; colType「类型」; colAmount「金额」; colStatus「状态」.
- **ja:** heading「アフィリエイト案件」/「収益」; subtitle「旅行アフィリエイトプログラムに参加し、トラッキング付きパートナーリンクを生成します。」/「ミッションとアフィリエイト報酬の収益を確認します。」; empty「現在利用できるアフィリエイト案件はありません。」/「まだ収益はありません。完了したミッションと確定した報酬がここに表示されます。」; join「案件に参加」; generateLink「パートナーリンクを生成」; copy「コピー」; copied「コピー済み」; category「カテゴリー」; commission「報酬」; viewProgram「プログラムを見る」; paid「支払済み」; pending「保留中」; colMission「ミッション」; colType「タイプ」; colAmount「金額」; colStatus「ステータス」.
- **ko:** heading「제휴 오퍼」/「수익」; subtitle「여행 제휴 프로그램에 참여하고 추적 가능한 파트너 링크를 생성하세요.」/「미션과 제휴 커미션 수익을 추적하세요.」; empty「현재 이용 가능한 제휴 오퍼가 없습니다.」/「아직 수익이 없습니다. 완료된 미션과 정산된 커미션이 여기에 표시됩니다.」; join「오퍼 참여」; generateLink「파트너 링크 생성」; copy「복사」; copied「복사됨」; category「카테고리」; commission「커미션」; viewProgram「프로그램 보기」; paid「지급 완료」; pending「대기 중」; colMission「미션」; colType「유형」; colAmount「금액」; colStatus「상태」.
- **th:** heading「ข้อเสนอพันธมิตร」/「รายได้」; subtitle「เข้าร่วมโปรแกรมพันธมิตรการท่องเที่ยวและสร้างลิงก์พันธมิตรที่ติดตามได้」/「ติดตามรายได้จากภารกิจและค่าคอมมิชชันพันธมิตร」; empty「ยังไม่มีข้อเสนอพันธมิตรในขณะนี้」/「ยังไม่มีรายได้ ภารกิจที่เสร็จสิ้นและค่าคอมมิชชันที่ชำระแล้วจะแสดงที่นี่」; join「เข้าร่วมข้อเสนอ」; generateLink「สร้างลิงก์พันธมิตร」; copy「คัดลอก」; copied「คัดลอกแล้ว」; category「หมวดหมู่」; commission「ค่าคอมมิชชัน」; viewProgram「ดูโปรแกรม」; paid「จ่ายแล้ว」; pending「รอดำเนินการ」; colMission「ภารกิจ」; colType「ประเภท」; colAmount「จำนวนเงิน」; colStatus「สถานะ」.

- [ ] **Step 6: Run parity + typecheck to verify green**

Run: `pnpm --filter web exec vitest run tests/i18n.locale-parity.test.ts && pnpm --filter web typecheck`
Expected: PASS (all locales have identical keys; interface satisfied).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/i18n/messages apps/web/tests/i18n.locale-parity.test.ts
git commit -m "feat(web): add studioOffers + studioEarnings i18n groups (Slice 3d)"
```

---

### Task 2: `lib/missions/earnings.ts` — pure rollup helpers

**Files:**
- Create: `apps/web/lib/missions/earnings.ts`
- Test: `apps/web/tests/mission.earnings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/mission.earnings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  toCreatorEarningItem,
  summarizeCreatorEarnings,
  type CreatorSettlementRow,
} from '@/lib/missions/earnings'

const row = (over: Partial<CreatorSettlementRow> = {}): CreatorSettlementRow => ({
  id: 's1',
  creator_payout_status: null,
  amount_currency: 'usd',
  creator_commission_amount: null,
  paid_fee_amount: null,
  missions: { title: 'Hotel program', mission_type: 'coupon_affiliate', mission_source: 'travelpayouts' },
  ...over,
})

describe('toCreatorEarningItem', () => {
  it('sums commission + paid fee and defaults nulls to zero', () => {
    const item = toCreatorEarningItem(row({ creator_commission_amount: 40, paid_fee_amount: 10 }))
    expect(item.amount).toBe(50)
    expect(item.currency).toBe('USD')
    expect(item.payoutStatus).toBe('pending')
    expect(item.missionTitle).toBe('Hotel program')
  })

  it('marks paid rows as paid and uses a default currency when missing', () => {
    const item = toCreatorEarningItem(row({ creator_payout_status: 'paid', amount_currency: null }))
    expect(item.payoutStatus).toBe('paid')
    expect(item.currency).toBe('USD')
    expect(item.amount).toBe(0)
  })

  it('reads the mission when the join is returned as an array', () => {
    const item = toCreatorEarningItem(row({ missions: [{ title: 'Array join', mission_type: 'paid', mission_source: 'merchant' }] }))
    expect(item.missionTitle).toBe('Array join')
    expect(item.missionType).toBe('paid')
  })
})

describe('summarizeCreatorEarnings', () => {
  it('returns an empty array for no items', () => {
    expect(summarizeCreatorEarnings([])).toEqual([])
  })

  it('buckets by currency and paid/pending, sorted by currency', () => {
    const totals = summarizeCreatorEarnings([
      { id: 'a', missionTitle: 'A', missionType: 'paid', currency: 'USD', amount: 100, payoutStatus: 'paid' },
      { id: 'b', missionTitle: 'B', missionType: 'coupon_affiliate', currency: 'USD', amount: 30, payoutStatus: 'pending' },
      { id: 'c', missionTitle: 'C', missionType: 'paid', currency: 'HKD', amount: 500, payoutStatus: 'paid' },
    ])
    expect(totals).toEqual([
      { currency: 'HKD', paid: 500, pending: 0 },
      { currency: 'USD', paid: 100, pending: 30 },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run tests/mission.earnings.test.ts`
Expected: FAIL — cannot resolve `@/lib/missions/earnings`.

- [ ] **Step 3: Implement `earnings.ts`**

Create `apps/web/lib/missions/earnings.ts`:

```ts
export type CreatorSettlementMission = {
  title: string | null
  mission_type: string | null
  mission_source: string | null
}

export type CreatorSettlementRow = {
  id: string
  creator_payout_status: string | null
  amount_currency: string | null
  creator_commission_amount: number | null
  paid_fee_amount: number | null
  missions: CreatorSettlementMission | CreatorSettlementMission[] | null
}

export type CreatorEarningItem = {
  id: string
  missionTitle: string
  missionType: string
  currency: string
  amount: number
  payoutStatus: 'paid' | 'pending'
}

export type EarningsCurrencyTotal = {
  currency: string
  paid: number
  pending: number
}

const DEFAULT_CURRENCY = 'USD'

export function toCreatorEarningItem(row: CreatorSettlementRow): CreatorEarningItem {
  const mission = Array.isArray(row.missions) ? row.missions[0] ?? null : row.missions
  const amount = (row.creator_commission_amount ?? 0) + (row.paid_fee_amount ?? 0)

  return {
    id: row.id,
    missionTitle: mission?.title ?? '',
    missionType: mission?.mission_type ?? '',
    currency: (row.amount_currency ?? DEFAULT_CURRENCY).toUpperCase(),
    amount,
    payoutStatus: row.creator_payout_status === 'paid' ? 'paid' : 'pending',
  }
}

export function summarizeCreatorEarnings(items: CreatorEarningItem[]): EarningsCurrencyTotal[] {
  const byCurrency = new Map<string, EarningsCurrencyTotal>()

  for (const item of items) {
    const entry = byCurrency.get(item.currency) ?? { currency: item.currency, paid: 0, pending: 0 }
    if (item.payoutStatus === 'paid') entry.paid += item.amount
    else entry.pending += item.amount
    byCurrency.set(item.currency, entry)
  }

  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run tests/mission.earnings.test.ts`
Expected: PASS (6 assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/earnings.ts apps/web/tests/mission.earnings.test.ts
git commit -m "feat(web): pure creator-earnings rollup helpers (Slice 3d)"
```

---

### Task 3: `lib/missions/queries.ts` — scoped offer/mission/settlement queries

**Files:**
- Modify: `apps/web/lib/missions/queries.ts`
- Modify: `apps/web/tests/mission.queries.test.ts`

- [ ] **Step 1: Update the queries test (red)**

In `apps/web/tests/mission.queries.test.ts`, change the import line to:

```ts
import {
  merchantMissionSelect,
  creatorMissionSelect,
  opsSettlementSelect,
  creatorSettlementSelect,
  listAffiliateOffers,
  listCreatorMerchantMissions,
  listCreatorSettlements,
} from '@/lib/missions/queries'
```

Replace the final `it('relies on RLS …')` test with:

```ts
  it('keeps creator settlement projection stable', () => {
    expect(creatorSettlementSelect).toContain('creator_commission_amount')
    expect(creatorSettlementSelect).toContain('missions')
  })

  it('scopes affiliate offers to published travelpayouts missions', async () => {
    const query = { eq: vi.fn(), neq: vi.fn(), order: vi.fn(), select: vi.fn() }
    query.eq.mockReturnValue(query)
    query.neq.mockReturnValue(query)
    query.order.mockResolvedValue({ data: [], error: null })
    query.select.mockReturnValue(query)
    const supabase = { from: vi.fn(() => query) }

    await listAffiliateOffers(supabase as never)

    expect(supabase.from).toHaveBeenCalledWith('missions')
    expect(query.eq).toHaveBeenCalledWith('status', 'published')
    expect(query.eq).toHaveBeenCalledWith('mission_source', 'travelpayouts')
  })

  it('scopes creator merchant missions to non-travelpayouts published missions', async () => {
    const query = { eq: vi.fn(), neq: vi.fn(), order: vi.fn(), select: vi.fn() }
    query.eq.mockReturnValue(query)
    query.neq.mockReturnValue(query)
    query.order.mockResolvedValue({ data: [], error: null })
    query.select.mockReturnValue(query)
    const supabase = { from: vi.fn(() => query) }

    await listCreatorMerchantMissions(supabase as never)

    expect(query.eq).toHaveBeenCalledWith('status', 'published')
    expect(query.neq).toHaveBeenCalledWith('mission_source', 'travelpayouts')
  })

  it('reads settlements from mission_settlements ordered by recency', async () => {
    const query = { select: vi.fn(), order: vi.fn() }
    query.select.mockReturnValue(query)
    query.order.mockResolvedValue({ data: [], error: null })
    const supabase = { from: vi.fn(() => query) }

    await listCreatorSettlements(supabase as never)

    expect(supabase.from).toHaveBeenCalledWith('mission_settlements')
    expect(query.order).toHaveBeenCalledWith('updated_at', { ascending: false })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run tests/mission.queries.test.ts`
Expected: FAIL — `creatorSettlementSelect` / the three new functions are not exported.

- [ ] **Step 3: Edit `queries.ts` — add select + three queries, remove `listCreatorMissions`**

In `apps/web/lib/missions/queries.ts`, add after the `opsSettlementSelect` constant:

```ts
export const creatorSettlementSelect = `
  id,status,creator_payout_status,amount_currency,
  creator_commission_amount,paid_fee_amount,
  missions(title,mission_type,mission_source)
`
```

Delete the entire `listCreatorMissions` function (the `void creatorId` one) and replace it with:

```ts
export async function listAffiliateOffers(
  supabase: SupabaseClient<Database>,
) {
  return supabase
    .from('missions')
    .select(creatorMissionSelect)
    .eq('status', 'published')
    .eq('mission_source', 'travelpayouts')
    .order('published_at', { ascending: false })
}

export async function listCreatorMerchantMissions(
  supabase: SupabaseClient<Database>,
) {
  return supabase
    .from('missions')
    .select(creatorMissionSelect)
    .eq('status', 'published')
    .neq('mission_source', 'travelpayouts')
    .order('published_at', { ascending: false })
}

export async function listCreatorSettlements(
  supabase: SupabaseClient<Database>,
) {
  return supabase
    .from('mission_settlements')
    .select(creatorSettlementSelect)
    .order('updated_at', { ascending: false })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run tests/mission.queries.test.ts`
Expected: PASS. (`listCreatorMissions` no longer imported; the missions host is fixed in Task 6 — typecheck will still flag it until then, which is expected.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/queries.ts apps/web/tests/mission.queries.test.ts
git commit -m "feat(web): scoped affiliate-offer/merchant-mission/settlement queries (Slice 3d)"
```

---

### Task 4: `StudioOffersView.tsx` — affiliate-offer cards

**Files:**
- Create: `apps/web/components/kinnso/pages/StudioOffersView.tsx`
- Test: `apps/web/tests/kinnso.StudioOffersView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/kinnso.StudioOffersView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

import { StudioOffersView, type AffiliateOfferCard } from '@/components/kinnso/pages/StudioOffersView'
import en from '@/lib/i18n/messages/en'

afterEach(() => { cleanup(); refreshMock.mockReset() })

const offer = (over: Partial<AffiliateOfferCard> = {}): AffiliateOfferCard => ({
  id: 'm1',
  title: 'Hotels affiliate',
  summary: 'Earn on every booking.',
  category: 'Hotels',
  compensation: 'Up to 7% commission',
  programUrl: 'https://example.com/hotels',
  participant: null,
  partnerLinks: [],
  ...over,
})

describe('StudioOffersView', () => {
  it('renders the empty state when there are no offers', () => {
    render(<StudioOffersView t={en.studioOffers} offers={[]} onJoin={vi.fn()} onCreateLink={vi.fn()} />)
    expect(screen.getByText(en.studioOffers.empty)).toBeTruthy()
  })

  it('joins an offer the creator has not joined', () => {
    const onJoin = vi.fn()
    render(<StudioOffersView t={en.studioOffers} offers={[offer()]} onJoin={onJoin} onCreateLink={vi.fn()} />)
    expect(screen.getByText('Hotels affiliate')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.studioOffers.join }))
    expect(onJoin).toHaveBeenCalledWith('m1')
  })

  it('generates a partner link from an active participant and program URL', () => {
    const onCreateLink = vi.fn()
    render(
      <StudioOffersView
        t={en.studioOffers}
        offers={[offer({ participant: { id: 'p1', status: 'active' } })]}
        onJoin={vi.fn()}
        onCreateLink={onCreateLink}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: en.studioOffers.generateLink }))
    expect(onCreateLink).toHaveBeenCalledWith('p1', 'https://example.com/hotels')
  })

  it('renders generated links with a copy affordance', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <StudioOffersView
        t={en.studioOffers}
        offers={[offer({ participant: { id: 'p1', status: 'active' }, partnerLinks: [{ id: 'l1', partnerUrl: 'https://tp.link/abc' }] })]}
        onJoin={vi.fn()}
        onCreateLink={vi.fn()}
      />,
    )
    expect(screen.getByText('https://tp.link/abc')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.studioOffers.copy }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://tp.link/abc'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run tests/kinnso.StudioOffersView.test.tsx`
Expected: FAIL — cannot resolve `@/components/kinnso/pages/StudioOffersView`.

- [ ] **Step 3: Implement `StudioOffersView.tsx`**

Create `apps/web/components/kinnso/pages/StudioOffersView.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { actionErrorMessage, actionSucceeded, type KinnsoActionResult } from '@/components/kinnso/action-result'
import { MissionCompensationSummary } from '@/components/kinnso/MissionCompensationSummary'
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import type { Messages } from '@/lib/i18n/messages/en'

export type AffiliateOfferCard = {
  id: string
  title: string
  summary: string
  category: string | null
  compensation: string
  programUrl: string | null
  participant: { id: string; status: string } | null
  partnerLinks: Array<{ id: string; partnerUrl: string }>
}

type StudioOffersViewProps = {
  t: Messages['studioOffers']
  offers: AffiliateOfferCard[]
  onJoin: (missionId: string) => KinnsoActionResult | Promise<KinnsoActionResult>
  onCreateLink: (missionParticipantId: string, originalUrl: string) => KinnsoActionResult | Promise<KinnsoActionResult>
}

export function StudioOffersView({ t, offers, onJoin, onCreateLink }: StudioOffersViewProps) {
  const router = useRouter()
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const runAction = async (action: () => KinnsoActionResult | Promise<KinnsoActionResult>) => {
    setActionError(null)
    setIsPending(true)
    try {
      const result = await action()
      setActionError(actionErrorMessage(result))
      if (actionSucceeded(result)) router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  const copyLink = async (id: string, url: string) => {
    await navigator.clipboard?.writeText(url)
    setCopiedId(id)
  }

  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.heading}</h1>
      <p className="mt-2 text-sm text-kinnso-muted">{t.subtitle}</p>
      {actionError && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {actionError}
        </p>
      )}
      {offers.length === 0 ? (
        <p className="mt-8 text-sm text-kinnso-muted">{t.empty}</p>
      ) : (
        <div className="mt-6 grid gap-4">
          {offers.map((offer) => {
            const activeParticipantId = offer.participant?.status === 'active' ? offer.participant.id : null
            return (
              <article key={offer.id} className="k-card p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <h2 className="text-lg font-bold text-kinnso-ink">{offer.title}</h2>
                    <p className="text-sm text-kinnso-muted">{offer.summary}</p>
                    {offer.category && (
                      <p className="text-xs text-kinnso-muted">{t.category}: {offer.category}</p>
                    )}
                    <MissionCompensationSummary text={`${t.commission}: ${offer.compensation}`} />
                  </div>
                  {offer.participant && <MissionStatusBadge status={offer.participant.status} />}
                </div>
                {offer.partnerLinks.length > 0 && (
                  <ul className="mt-4 space-y-2 text-sm text-kinnso-muted">
                    {offer.partnerLinks.map((link) => (
                      <li key={link.id} className="flex items-center gap-2">
                        <span className="min-w-0 truncate">{link.partnerUrl}</span>
                        <button
                          type="button"
                          className="k-btn-ghost shrink-0 text-xs"
                          onClick={() => void copyLink(link.id, link.partnerUrl)}
                        >
                          {copiedId === link.id ? t.copied : t.copy}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {!offer.participant && (
                    <button type="button" className="k-btn-primary text-sm" disabled={isPending} onClick={() => void runAction(() => onJoin(offer.id))}>
                      {t.join}
                    </button>
                  )}
                  {activeParticipantId && offer.programUrl && (
                    <button
                      type="button"
                      className="k-btn-ghost text-sm"
                      disabled={isPending}
                      onClick={() => void runAction(() => onCreateLink(activeParticipantId, offer.programUrl as string))}
                    >
                      {t.generateLink}
                    </button>
                  )}
                  {offer.programUrl && (
                    <a className="k-btn-ghost text-sm" href={offer.programUrl} target="_blank" rel="noreferrer">
                      {t.viewProgram}
                    </a>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run tests/kinnso.StudioOffersView.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/pages/StudioOffersView.tsx apps/web/tests/kinnso.StudioOffersView.test.tsx
git commit -m "feat(web): StudioOffersView affiliate-offer cards (Slice 3d)"
```

---

### Task 5: `/studio/offers` host — replace the stub

**Files:**
- Replace: `apps/web/app/[locale]/studio/offers/page.tsx`
- Test: `apps/web/tests/studio.offers.host.test.tsx`

- [ ] **Step 1: Write the failing host test**

Create `apps/web/tests/studio.offers.host.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { listAffiliateOffersMock, notFoundMock, resolveViewerRoleMock } = vi.hoisted(() => ({
  listAffiliateOffersMock: vi.fn(async () => ({
    data: [{
      id: 'offer-1',
      title: 'Hotels affiliate',
      summary: 'Earn on every booking.',
      mission_source: 'travelpayouts',
      mission_type: 'coupon_affiliate',
      status: 'published',
      paid_fee_amount: null,
      paid_fee_currency: null,
      affiliate_commission_rate: null,
      creator_commission_rate: null,
      affiliate_network_programs: { default_commission_description: 'Up to 7%', program_url: 'https://example.com/hotels', category: 'Hotels' },
      mission_participants: [],
      affiliate_partner_links: [],
    }],
  })),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  resolveViewerRoleMock: vi.fn(async () => 'creator'),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) }),
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: resolveViewerRoleMock }))
vi.mock('@/lib/missions/queries', () => ({ listAffiliateOffers: listAffiliateOffersMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'creator-user-1' } } }) },
  }),
}))

import StudioOffersPage from '@/app/[locale]/studio/offers/page'

beforeEach(() => {
  listAffiliateOffersMock.mockClear()
  resolveViewerRoleMock.mockReset()
  resolveViewerRoleMock.mockResolvedValue('creator')
})

describe('/[locale]/studio/offers host', () => {
  it('returns not found for non-creator viewers', async () => {
    resolveViewerRoleMock.mockResolvedValueOnce('merchant')
    await expect(StudioOffersPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(listAffiliateOffersMock).not.toHaveBeenCalled()
  })

  it('renders affiliate offers for creators', async () => {
    const ui = await StudioOffersPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Hotels affiliate')).toBeTruthy()
    expect(screen.getByText('Commission: Up to 7%')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run tests/studio.offers.host.test.tsx`
Expected: FAIL — the current stub default export does not match (renders ComingSoon, no `Hotels affiliate`).

- [ ] **Step 3: Replace the stub host**

Overwrite `apps/web/app/[locale]/studio/offers/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation'
import { StudioOffersView, type AffiliateOfferCard } from '@/components/kinnso/pages/StudioOffersView'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createPartnerLinkAction, joinMissionAction } from '@/lib/missions/actions'
import { listAffiliateOffers } from '@/lib/missions/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string }>

type ProgramRel = { default_commission_description?: string | null; program_url?: string | null; category?: string | null }

type OfferRow = {
  id: string
  title: string | null
  summary: string | null
  affiliate_network_programs?: ProgramRel | ProgramRel[] | null
  mission_participants?: Array<{ id: string; status: string | null; creator_id: string | null }> | null
  affiliate_partner_links?: Array<{ id: string; partner_url: string | null }> | null
}

const program = (rel: OfferRow['affiliate_network_programs']) => (Array.isArray(rel) ? rel[0] ?? null : rel ?? null)

function mapOffer(row: OfferRow, creatorId: string): AffiliateOfferCard {
  const prog = program(row.affiliate_network_programs)
  const participant = row.mission_participants?.find((p) => p.creator_id === creatorId) ?? null
  return {
    id: row.id,
    title: row.title ?? '',
    summary: row.summary ?? '',
    category: prog?.category?.trim() || null,
    compensation: prog?.default_commission_description?.trim() || 'Affiliate commission',
    programUrl: prog?.program_url?.trim() || null,
    participant: participant ? { id: participant.id, status: participant.status ?? 'active' } : null,
    partnerLinks: (row.affiliate_partner_links ?? []).map((link) => ({ id: link.id, partnerUrl: link.partner_url ?? '' })),
  }
}

export default async function StudioOffersPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const role = await resolveViewerRole(supabase)
  if (role !== 'creator') notFound()

  const { data } = await listAffiliateOffers(supabase)
  const offers = ((data ?? []) as unknown as OfferRow[]).map((row) => mapOffer(row, user.id))

  async function join(missionId: string) {
    'use server'
    return joinMissionAction({ missionId, locale: loc })
  }

  async function createLink(missionParticipantId: string, originalUrl: string) {
    'use server'
    return createPartnerLinkAction({ missionParticipantId, originalUrl, locale: loc })
  }

  return <StudioOffersView t={messages.studioOffers} offers={offers} onJoin={join} onCreateLink={createLink} />
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run tests/studio.offers.host.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/[locale]/studio/offers/page.tsx" apps/web/tests/studio.offers.host.test.tsx
git commit -m "feat(web): real /studio/offers affiliate host (Slice 3d)"
```

---

### Task 6: `/studio/missions` — switch to merchant-only query

**Files:**
- Modify: `apps/web/app/[locale]/studio/missions/page.tsx`
- Modify: `apps/web/tests/studio.missions.host.test.tsx`

- [ ] **Step 1: Update the host test to mock the renamed query (red)**

In `apps/web/tests/studio.missions.host.test.tsx`:
- Rename the hoisted mock var `listCreatorMissionsMock` → `listCreatorMerchantMissionsMock` (all 4 occurrences: in `vi.hoisted` destructure, the `vi.fn` assignment, `beforeEach` `mockClear`, and the `expect(...).not.toHaveBeenCalled()` assertion).
- Change the `vi.mock('@/lib/missions/queries', …)` factory to:

```ts
vi.mock('@/lib/missions/queries', () => ({
  listCreatorMerchantMissions: listCreatorMerchantMissionsMock,
}))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run tests/studio.missions.host.test.tsx`
Expected: FAIL — the host still imports/calls `listCreatorMissions`, so the mocked `listCreatorMerchantMissions` is never hit (the `not.toHaveBeenCalled` mock is unused / the real query path errors).

- [ ] **Step 3: Update the missions host**

In `apps/web/app/[locale]/studio/missions/page.tsx`:
- Change the import to `import { listCreatorMerchantMissions } from '@/lib/missions/queries'`.
- Change the call site from `const { data } = await listCreatorMissions(supabase, user.id)` to `const { data } = await listCreatorMerchantMissions(supabase)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run tests/studio.missions.host.test.tsx`
Expected: PASS (both tests; the hybrid **merchant** mission still renders).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/[locale]/studio/missions/page.tsx" apps/web/tests/studio.missions.host.test.tsx
git commit -m "refactor(web): /studio/missions shows merchant missions only (Slice 3d)"
```

---

### Task 7: `StudioEarningsView.tsx` — summary cards + breakdown table

**Files:**
- Create: `apps/web/components/kinnso/pages/StudioEarningsView.tsx`
- Test: `apps/web/tests/kinnso.StudioEarningsView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/kinnso.StudioEarningsView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StudioEarningsView } from '@/components/kinnso/pages/StudioEarningsView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('StudioEarningsView', () => {
  it('renders the empty state when there are no earnings', () => {
    render(<StudioEarningsView t={en.studioEarnings} totals={[]} items={[]} />)
    expect(screen.getByText(en.studioEarnings.empty)).toBeTruthy()
  })

  it('renders per-currency totals and a per-mission breakdown', () => {
    render(
      <StudioEarningsView
        t={en.studioEarnings}
        totals={[{ currency: 'USD', paid: 120, pending: 30 }]}
        items={[{ id: 's1', missionTitle: 'Hotel program', missionType: 'coupon_affiliate', currency: 'USD', amount: 120, payoutStatus: 'paid' }]}
      />,
    )
    expect(screen.getByText('USD')).toBeTruthy()
    expect(screen.getByText('Hotel program')).toBeTruthy()
    expect(screen.getAllByText(en.studioEarnings.paid).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run tests/kinnso.StudioEarningsView.test.tsx`
Expected: FAIL — cannot resolve `@/components/kinnso/pages/StudioEarningsView`.

- [ ] **Step 3: Implement `StudioEarningsView.tsx`**

Create `apps/web/components/kinnso/pages/StudioEarningsView.tsx`:

```tsx
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import type { CreatorEarningItem, EarningsCurrencyTotal } from '@/lib/missions/earnings'
import type { Messages } from '@/lib/i18n/messages/en'

type StudioEarningsViewProps = {
  t: Messages['studioEarnings']
  totals: EarningsCurrencyTotal[]
  items: CreatorEarningItem[]
}

export function StudioEarningsView({ t, totals, items }: StudioEarningsViewProps) {
  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.heading}</h1>
      <p className="mt-2 text-sm text-kinnso-muted">{t.subtitle}</p>

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-kinnso-muted">{t.empty}</p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {totals.map((total) => (
              <div key={total.currency} className="k-card p-5">
                <p className="text-sm font-bold text-kinnso-ink">{total.currency}</p>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-kinnso-muted">{t.paid}</dt>
                    <dd className="font-semibold tabular-nums text-kinnso-ink">{total.paid.toLocaleString()}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-kinnso-muted">{t.pending}</dt>
                    <dd className="font-semibold tabular-nums text-kinnso-ink">{total.pending.toLocaleString()}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-kinnso-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t.colMission}</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t.colType}</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t.colAmount}</th>
                  <th scope="col" className="py-2 font-semibold">{t.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-kinnso-cream2">
                    <td className="py-2 pr-4 font-medium text-kinnso-ink">{item.missionTitle}</td>
                    <td className="py-2 pr-4 capitalize text-kinnso-muted">{item.missionType.replaceAll('_', ' ')}</td>
                    <td className="py-2 pr-4 tabular-nums text-kinnso-ink">{item.currency} {item.amount.toLocaleString()}</td>
                    <td className="py-2"><MissionStatusBadge status={item.payoutStatus === 'paid' ? t.paid : t.pending} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run tests/kinnso.StudioEarningsView.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/pages/StudioEarningsView.tsx apps/web/tests/kinnso.StudioEarningsView.test.tsx
git commit -m "feat(web): StudioEarningsView summary + breakdown (Slice 3d)"
```

---

### Task 8: `/studio/earnings` host — replace the stub

**Files:**
- Replace: `apps/web/app/[locale]/studio/earnings/page.tsx`
- Test: `apps/web/tests/studio.earnings.host.test.tsx`

- [ ] **Step 1: Write the failing host test**

Create `apps/web/tests/studio.earnings.host.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { listCreatorSettlementsMock, notFoundMock, resolveViewerRoleMock } = vi.hoisted(() => ({
  listCreatorSettlementsMock: vi.fn(async () => ({
    data: [{
      id: 'settle-1',
      status: 'paid',
      creator_payout_status: 'paid',
      amount_currency: 'usd',
      creator_commission_amount: 120,
      paid_fee_amount: null,
      missions: { title: 'Hotel program', mission_type: 'coupon_affiliate', mission_source: 'travelpayouts' },
    }],
  })),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  resolveViewerRoleMock: vi.fn(async () => 'creator'),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) }),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: resolveViewerRoleMock }))
vi.mock('@/lib/missions/queries', () => ({ listCreatorSettlements: listCreatorSettlementsMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'creator-user-1' } } }) },
  }),
}))

import StudioEarningsPage from '@/app/[locale]/studio/earnings/page'

beforeEach(() => {
  listCreatorSettlementsMock.mockClear()
  resolveViewerRoleMock.mockReset()
  resolveViewerRoleMock.mockResolvedValue('creator')
})

describe('/[locale]/studio/earnings host', () => {
  it('returns not found for non-creator viewers', async () => {
    resolveViewerRoleMock.mockResolvedValueOnce('merchant')
    await expect(StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(listCreatorSettlementsMock).not.toHaveBeenCalled()
  })

  it('renders the creator earnings breakdown', async () => {
    const ui = await StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Hotel program')).toBeTruthy()
    expect(screen.getByText('USD')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run tests/studio.earnings.host.test.tsx`
Expected: FAIL — the current stub renders ComingSoon (no `Hotel program`).

- [ ] **Step 3: Replace the stub host**

Overwrite `apps/web/app/[locale]/studio/earnings/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation'
import { StudioEarningsView } from '@/components/kinnso/pages/StudioEarningsView'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { summarizeCreatorEarnings, toCreatorEarningItem, type CreatorSettlementRow } from '@/lib/missions/earnings'
import { listCreatorSettlements } from '@/lib/missions/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string }>

export default async function StudioEarningsPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const role = await resolveViewerRole(supabase)
  if (role !== 'creator') notFound()

  const { data } = await listCreatorSettlements(supabase)
  const items = ((data ?? []) as unknown as CreatorSettlementRow[]).map(toCreatorEarningItem)
  const totals = summarizeCreatorEarnings(items)

  return <StudioEarningsView t={messages.studioEarnings} totals={totals} items={items} />
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run tests/studio.earnings.host.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/[locale]/studio/earnings/page.tsx" apps/web/tests/studio.earnings.host.test.tsx
git commit -m "feat(web): real /studio/earnings dashboard host (Slice 3d)"
```

---

### Task 9: Activate the Studio dashboard tiles

**Files:**
- Modify: `apps/web/components/kinnso/pages/StudioHomeView.tsx`

- [ ] **Step 1: Flip the two tiles live**

In `apps/web/components/kinnso/pages/StudioHomeView.tsx`, in the `tools` array, change the `earnings` and `offers` entries' `live: false` to `live: true`:

```tsx
    { href: '/studio/earnings', title: t.earningsTitle, desc: t.earningsDesc, live: true, icon: <Wallet className="h-5 w-5" /> },
    { href: '/studio/offers', title: t.offersTitle, desc: t.offersDesc, live: true, icon: <Tag className="h-5 w-5" /> },
```

- [ ] **Step 2: Run the dashboard + route-parity tests**

Run: `pnpm --filter web exec vitest run tests/kinnso.StudioHomeView.test.tsx tests/kinnso.route-parity.test.tsx`
Expected: PASS — `inbox` (and `guides`) remain `soon`, so the "marks live tools Live and not-yet tools Soon" assertion (`soonBadge` count `> 0`) still holds; routes still resolve.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/kinnso/pages/StudioHomeView.tsx
git commit -m "feat(web): activate Studio offers + earnings tiles (Slice 3d)"
```

---

### Task 10: Full-suite gate + verification

**Files:** none (verification only — fix forward if anything is red)

- [ ] **Step 1: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: 0 errors. (If `listCreatorMissions` is referenced anywhere, it was missed in Task 6 — fix the import/call.)

- [ ] **Step 2: Lint**

Run: `pnpm --filter web lint`
Expected: 0 errors and no new warnings attributable to Slice 3d.

- [ ] **Step 3: Full test suite**

Run: `pnpm --filter web exec vitest run`
Expected: all green, including the new `mission.earnings`, `StudioOffersView`, `StudioEarningsView`, `studio.offers.host`, `studio.earnings.host` files and the updated `mission.queries` / `studio.missions.host` / `i18n.locale-parity`.

- [ ] **Step 4: Production build**

Run: `pnpm --filter web build`
Expected: build succeeds. Confirm `/[locale]/studio/offers`, `/[locale]/studio/earnings`, and `/[locale]/studio/missions` are server-rendered on demand (ƒ / Dynamic), not statically prerendered (they read auth) — same as the other `/studio/*` authed pages.

- [ ] **Step 5: Commit (only if any fix-forward changes were made)**

```bash
git add -A
git commit -m "chore(web): Slice 3d full-gate verification"
```

---

## Self-Review

**1. Spec coverage:**
- Offers split & elevate (dedicated affiliate surface, join/generate/copy) → Tasks 4, 5; query split → Task 3; missions→merchant-only → Tasks 3, 6. ✓
- Earnings read-only dashboard over `mission_settlements` + per-currency rollup → Tasks 2, 7, 8. ✓
- No new schema / migration → none added; verified at gate (Task 10). ✓
- i18n `studioOffers` + `studioEarnings` × 7 + parity → Task 1. ✓
- Dashboard tiles live → Task 9. ✓
- Testing (pure helpers, both views, both hosts, query filters, parity, updated missions host) → Tasks 1–8, 10. ✓

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". The only non-verbatim content is the 6 non-en translations (Task 1 Step 5), provided as concrete reference strings with the parity test as the structural oracle — matching the Slice 3c precedent.

**3. Type consistency:** `AffiliateOfferCard` (Task 4) is produced by `mapOffer` (Task 5) and consumed by `StudioOffersView` identically. `CreatorEarningItem` / `EarningsCurrencyTotal` / `CreatorSettlementRow` (Task 2) are used by the earnings host (Task 8) and `StudioEarningsView` (Task 7) with matching shapes. `listAffiliateOffers` / `listCreatorMerchantMissions` / `listCreatorSettlements` names match across queries (Task 3), hosts (Tasks 5, 6, 8), and tests. `Messages['studioOffers']` / `['studioEarnings']` keys defined in Task 1 are exactly those consumed by the two views. The removed `listCreatorMissions` has no remaining consumers after Task 6 (verified at gate).

---

## Execution Handoff

This plan is fully autonomous — **no gated production-DB step** (no migration). Recommended execution: Tasks 1–10 subagent-driven (implement → spec review → quality review per task), keeping the repo green throughout, then push + open the PR for review.
