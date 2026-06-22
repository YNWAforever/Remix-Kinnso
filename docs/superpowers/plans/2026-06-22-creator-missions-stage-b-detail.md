# Creator Missions — Stage B: Mission Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `ComingSoon` stub at `/studio/missions/[id]` with the real creator mission detail — brief, compensation, participation state machine (join / apply / awaiting / rejected / active), coupon & partner links, and a read-only milestone list — and link the Stage A list cards into it.

**Architecture:** A new pure helper `lib/missions/detail.ts` turns a single-mission Supabase row into a `CreatorMissionDetail` view model (participation CTA + milestone rows). A new query `getCreatorMissionDetail` fetches it; the host page (auth/role-gated like the list host) maps it and wires `join`/`apply` server-action thunks (both reuse the existing `joinMissionAction`); a new client `CreatorMissionDetailView` renders it. Milestone submission stays **read-only** (the submit form + verification arrive in Stage C). No DB migration.

**Tech Stack:** Next.js App Router (RSC host + `'use client'` view) · TypeScript · Supabase JS (user-scoped client, RLS boundary) · Vitest + @testing-library/react (jsdom) · Tailwind (kinnso tokens) · pnpm.

**Scope note:** Stage B of 3 from `docs/superpowers/specs/2026-06-22-creator-missions-journey-design.md` (§2). Stage C (submission + scan-worker auto-verification, incl. the `mission_verification_jobs` migration) is a separate plan. Settlement creation stays out of scope.

**Branch / location:** Work in the isolated worktree `/Users/willylai/Documents/Claude/Projects/kinnso-v3-missions-journey` (branch `feat/creator-missions-journey`, which already has Stage A). All commands run from `apps/web/`.

**Test env (important):** `vitest.setup.ts` throws if Supabase env vars are unset. Prefix every test/build command with:
```
SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co SUPABASE_ANON_KEY=dummy NEXT_PUBLIC_SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy
```
Run targeted tests in isolation (e.g. `pnpm exec vitest run tests/<file>`); the full `pnpm test` has ~14 pre-existing Supabase integration failures that fail identically on `main` (dummy key) — unrelated to this work.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/missions/detail.ts` (new) | Pure: row → `CreatorMissionDetail` view model; `resolveParticipationCta`, `buildMilestoneRows`, `missionCompensation`. Plus the `MissionDetailRow` row type. |
| `lib/missions/queries.ts` (modify) | Add `creatorMissionDetailSelect` + `getCreatorMissionDetail`. |
| `components/kinnso/pages/CreatorMissionDetailView.tsx` (new) | `'use client'` detail view: header, brief, participation branch, coupon/links, read-only milestone list. |
| `app/[locale]/studio/missions/[id]/page.tsx` (replace) | Auth/role-gated host; fetch + map + wire `join`/`apply`. |
| `components/kinnso/pages/CreatorMissionsView.tsx` (modify) | Add `locale` prop + card → detail links. |
| `app/[locale]/studio/missions/page.tsx` (modify) | Pass `locale={loc}` to the list view. |
| `lib/i18n/messages/*.ts` (modify ×7) | New `missionDetail` group + `missions.viewDetails`. |
| `tests/i18n.locale-parity.test.ts` (modify) | Register `missionDetail` in `GROUPS`. |
| tests (new/modified) | `mission.detail.test.ts`, `kinnso.CreatorMissionDetailView.test.tsx`, updated `kinnso.CreatorMissionsView.test.tsx`. |

---

### Task 1: i18n — add the `missionDetail` group + `missions.viewDetails`

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface + const)
- Modify: `apps/web/lib/i18n/messages/ja.ts`, `ko.ts`, `th.ts`, `zh-cn.ts`, `zh-hk.ts`, `zh-tw.ts`
- Modify: `apps/web/tests/i18n.locale-parity.test.ts` (`GROUPS`)

The `missionDetail` group ships with English values in all 7 locales (phased translation — the parity test checks keys, not values; this matches how the `missions`/`comingSoon` groups currently carry English in non-English files). `missions.viewDetails` gets quick translations to match the 5 already-translated `missions` keys.

- [ ] **Step 1: Add the `missionDetail` interface + extend `missions` in `en.ts`**

In the `Messages` interface, add `viewDetails: string` to the `missions` group (after `availableEmpty: string`), and add a new `missionDetail` group immediately after the `missions` group closes:

```ts
  missionDetail: {
    back: string
    briefHeading: string
    milestonesHeading: string
    notStarted: string
    dueLabel: string
    join: string
    apply: string
    applyNoteLabel: string
    applyNotePlaceholder: string
    awaitingTitle: string
    awaitingBody: string
    rejectedTitle: string
    rejectedBody: string
    couponHeading: string
    couponCodeLabel: string
    partnerLinksHeading: string
    openLink: string
  }
```

- [ ] **Step 2: Add the English values in `en.ts`**

Add `viewDetails: 'View details',` to the `missions` const (after `availableEmpty`), and add the `missionDetail` const group after the `missions` const closes:

```ts
  missionDetail: {
    back: 'Missions',
    briefHeading: 'Brief',
    milestonesHeading: 'Milestones',
    notStarted: 'Not started',
    dueLabel: 'Due',
    join: 'Join mission',
    apply: 'Apply',
    applyNoteLabel: 'Application note (optional)',
    applyNotePlaceholder: 'Tell the merchant why you are a fit',
    awaitingTitle: 'Awaiting approval',
    awaitingBody: 'The merchant is reviewing your application.',
    rejectedTitle: 'Not selected',
    rejectedBody: 'This application was not accepted.',
    couponHeading: 'Your coupon',
    couponCodeLabel: 'Code',
    partnerLinksHeading: 'Your links',
    openLink: 'Open',
  },
```

- [ ] **Step 3: Add the keys to each non-English locale**

For **each** of `ja.ts`, `ko.ts`, `th.ts`, `zh-cn.ts`, `zh-hk.ts`, `zh-tw.ts`:

(a) Add `viewDetails` to the `missions` object (after `availableEmpty`), with the locale's translation:
- `ja.ts`: `viewDetails: '詳細を見る',`
- `ko.ts`: `viewDetails: '자세히 보기',`
- `th.ts`: `viewDetails: 'ดูรายละเอียด',`
- `zh-cn.ts`: `viewDetails: '查看详情',`
- `zh-hk.ts`: `viewDetails: '查看詳情',`
- `zh-tw.ts`: `viewDetails: '查看詳情',`

(b) Add the `missionDetail` group with the **same English values as `en.ts` Step 2** (identical object, copied verbatim) immediately after the `missions` object in each file. (Translation is a follow-up; parity is by key.)

- [ ] **Step 4: Register `missionDetail` in the parity test**

In `apps/web/tests/i18n.locale-parity.test.ts`, add `'missionDetail'` to the `GROUPS` array (e.g. right after `'missions'`):

```ts
const GROUPS = [
  'studio', 'creatorProfile', 'merchants', 'missions', 'missionDetail', 'ops', 'nav', 'footer', 'home', 'comingSoon',
  'studioHome', 'explore', 'feed', 'creatorsLanding', 'merchantsLanding', 'studioGuides',
  'studioOffers', 'studioEarnings',
] as const
```

- [ ] **Step 5: Verify parity + typecheck**

Run:
```
SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co SUPABASE_ANON_KEY=dummy NEXT_PUBLIC_SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy pnpm exec vitest run tests/i18n.locale-parity.test.ts
pnpm typecheck
```
Expected: parity test PASS for all locales; `tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/i18n/messages apps/web/tests/i18n.locale-parity.test.ts
git commit -m "i18n(missions): add missionDetail group + viewDetails key"
```

---

### Task 2: Pure helper — `lib/missions/detail.ts`

**Files:**
- Create: `apps/web/lib/missions/detail.ts`
- Test: `apps/web/tests/mission.detail.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/mission.detail.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildMilestoneRows,
  missionCompensation,
  resolveParticipationCta,
  toCreatorMissionDetail,
  type MissionDetailRow,
} from '@/lib/missions/detail'

describe('resolveParticipationCta', () => {
  it('maps no participant to join for coupon and apply for paid/hybrid', () => {
    expect(resolveParticipationCta(null, 'coupon_affiliate')).toBe('join')
    expect(resolveParticipationCta(null, 'paid')).toBe('apply')
    expect(resolveParticipationCta(null, 'hybrid')).toBe('apply')
  })
  it('maps participant statuses to ctas', () => {
    expect(resolveParticipationCta('applied', 'paid')).toBe('awaiting')
    expect(resolveParticipationCta('invited', 'paid')).toBe('awaiting')
    expect(resolveParticipationCta('active', 'paid')).toBe('active')
    expect(resolveParticipationCta('completed', 'paid')).toBe('active')
    expect(resolveParticipationCta('rejected', 'paid')).toBe('rejected')
    expect(resolveParticipationCta('cancelled', 'paid')).toBe('rejected')
  })
})

describe('buildMilestoneRows', () => {
  it('joins the latest submission per milestone, sorts by sort_order, derives state + signal', () => {
    const milestones = [
      { id: 'b', title: 'Second', description: 'd2', due_at: null, sort_order: 2 },
      { id: 'a', title: 'First', description: 'd1', due_at: '2026-07-02T00:00:00Z', sort_order: 1 },
    ]
    const submissions = [
      { id: 's1', mission_milestone_id: 'a', status: 'submitted', proof_urls: ['u'], notes: null, merchant_feedback: null, submitted_at: '2026-06-20T00:00:00Z', mission_social_snapshots: [{ confidence_status: 'verified_signal' }] },
      { id: 's2', mission_milestone_id: 'a', status: 'approved', proof_urls: ['u'], notes: null, merchant_feedback: null, submitted_at: '2026-06-22T00:00:00Z', mission_social_snapshots: [{ confidence_status: 'needs_review' }] },
    ]
    const rows = buildMilestoneRows(milestones, submissions)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(rows[0]).toMatchObject({ title: 'First', state: 'approved', signal: 'needs_review', dueAt: '2026-07-02T00:00:00Z' })
    expect(rows[1]).toMatchObject({ title: 'Second', state: 'none', signal: null })
  })

  it('treats null/pending/empty as no state and no signal', () => {
    const rows = buildMilestoneRows(
      [{ id: 'a', title: 'T', description: '', due_at: null, sort_order: 1 }],
      [{ id: 's', mission_milestone_id: 'a', status: 'pending', proof_urls: null, notes: null, merchant_feedback: null, submitted_at: null, mission_social_snapshots: [] }],
    )
    expect(rows[0]).toMatchObject({ state: 'none', signal: null })
    expect(buildMilestoneRows(null, null)).toEqual([])
  })
})

describe('missionCompensation', () => {
  it('formats paid, affiliate, and hybrid combinations', () => {
    expect(missionCompensation({ mission_source: 'merchant', mission_type: 'paid', paid_fee_amount: 5000, paid_fee_currency: 'HKD', affiliate_commission_rate: null, creator_commission_rate: null, affiliate_network_programs: null })).toBe('HKD 5000')
    expect(missionCompensation({ mission_source: 'merchant', mission_type: 'hybrid', paid_fee_amount: 5000, paid_fee_currency: 'HKD', affiliate_commission_rate: 20, creator_commission_rate: 15, affiliate_network_programs: null })).toBe('HKD 5000 + Affiliate commission 15% creator / 20% total')
    expect(missionCompensation({ mission_source: 'merchant', mission_type: 'coupon_affiliate', paid_fee_amount: null, paid_fee_currency: null, affiliate_commission_rate: null, creator_commission_rate: null, affiliate_network_programs: null })).toBe('Affiliate commission')
  })
})

describe('toCreatorMissionDetail', () => {
  const base: MissionDetailRow = {
    id: 'm1', title: 'Summer', summary: 'Do stuff', mission_source: 'merchant', mission_type: 'hybrid', status: 'published',
    coupon_code: null, coupon_url: null, paid_fee_amount: 5000, paid_fee_currency: 'HKD',
    affiliate_commission_rate: 20, creator_commission_rate: 15, kinnso_commission_rate: 5,
    affiliate_network_programs: null, mission_milestones: [{ id: 'a', title: 'M1', description: '', due_at: null, sort_order: 1 }],
    mission_participants: [], affiliate_partner_links: [],
  }

  it('composes header, cta, and milestones for a non-participant', () => {
    const detail = toCreatorMissionDetail(base, 'creator-1')
    expect(detail).toMatchObject({ id: 'm1', title: 'Summer', missionType: 'hybrid', cta: 'apply', participantStatus: null, compensation: 'HKD 5000 + Affiliate commission 15% creator / 20% total' })
    expect(detail.milestones).toHaveLength(1)
  })

  it('uses the viewing creator participant for cta + milestone state', () => {
    const detail = toCreatorMissionDetail(
      { ...base, mission_participants: [
        { id: 'p-other', status: 'active', source: 'application', creator_id: 'someone-else', application_note: null, mission_milestone_submissions: [] },
        { id: 'p-mine', status: 'active', source: 'application', creator_id: 'creator-1', application_note: null, mission_milestone_submissions: [{ id: 's', mission_milestone_id: 'a', status: 'submitted', proof_urls: ['u'], notes: null, merchant_feedback: null, submitted_at: '2026-06-20T00:00:00Z', mission_social_snapshots: [] }] },
      ] },
      'creator-1',
    )
    expect(detail).toMatchObject({ cta: 'active', participantStatus: 'active' })
    expect(detail.milestones[0]).toMatchObject({ state: 'submitted', signal: 'unavailable' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `… pnpm exec vitest run tests/mission.detail.test.ts`
Expected: FAIL — cannot resolve `@/lib/missions/detail`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/missions/detail.ts`:

```ts
export type MissionType = 'coupon_affiliate' | 'hybrid' | 'paid'
export type ParticipationCta = 'join' | 'apply' | 'awaiting' | 'rejected' | 'active'
export type MilestoneState = 'none' | 'submitted' | 'approved' | 'revision_requested' | 'rejected'
export type SocialSignalStatus = 'verified_signal' | 'needs_review' | 'unavailable'

type ProgramRef = { program_url?: string | null; default_commission_description?: string | null }

type SubmissionRow = {
  id: string
  mission_milestone_id: string
  status: string | null
  proof_urls: string[] | null
  notes: string | null
  merchant_feedback: string | null
  submitted_at: string | null
  mission_social_snapshots?: Array<{ confidence_status: string | null }> | null
}

export type MissionDetailRow = {
  id: string
  title: string | null
  summary: string | null
  mission_source: string | null
  mission_type: string | null
  status: string | null
  coupon_code: string | null
  coupon_url: string | null
  paid_fee_amount: number | null
  paid_fee_currency: string | null
  affiliate_commission_rate: number | null
  creator_commission_rate: number | null
  kinnso_commission_rate: number | null
  affiliate_network_programs?: ProgramRef | ProgramRef[] | null
  mission_milestones?: Array<{ id: string; title: string | null; description: string | null; due_at: string | null; sort_order: number | null }> | null
  mission_participants?: Array<{
    id: string
    status: string | null
    source: string | null
    creator_id: string | null
    application_note: string | null
    mission_milestone_submissions?: SubmissionRow[] | null
  }> | null
  affiliate_partner_links?: Array<{ id: string; partner_url: string | null }> | null
}

export type MilestoneRow = {
  id: string
  title: string
  description: string
  dueAt: string | null
  state: MilestoneState
  signal: SocialSignalStatus | null
}

export type CreatorMissionDetail = {
  id: string
  title: string
  summary: string
  missionSource: 'merchant' | 'travelpayouts'
  missionType: MissionType
  status: string
  compensation: string
  couponCode: string | null
  couponUrl: string | null
  partnerLinks: Array<{ id: string; partnerUrl: string }>
  participantStatus: string | null
  cta: ParticipationCta
  milestones: MilestoneRow[]
}

const toMissionType = (type: string | null): MissionType =>
  type === 'hybrid' || type === 'paid' ? type : 'coupon_affiliate'

export function resolveParticipationCta(
  participantStatus: string | null,
  missionType: MissionType,
): ParticipationCta {
  if (!participantStatus) return missionType === 'coupon_affiliate' ? 'join' : 'apply'
  if (participantStatus === 'active' || participantStatus === 'completed') return 'active'
  if (participantStatus === 'rejected' || participantStatus === 'cancelled') return 'rejected'
  return 'awaiting'
}

const SUBMITTED_STATES: Record<string, MilestoneState> = {
  submitted: 'submitted',
  approved: 'approved',
  revision_requested: 'revision_requested',
  rejected: 'rejected',
}

const signalFrom = (
  snapshots: Array<{ confidence_status: string | null }> | null | undefined,
): SocialSignalStatus | null => {
  const statuses = (snapshots ?? []).map((s) => s.confidence_status)
  if (statuses.includes('verified_signal')) return 'verified_signal'
  if (statuses.includes('needs_review')) return 'needs_review'
  if (statuses.length > 0) return 'unavailable'
  return null
}

export function buildMilestoneRows(
  milestones: MissionDetailRow['mission_milestones'],
  submissions: SubmissionRow[] | null | undefined,
): MilestoneRow[] {
  const latest = new Map<string, SubmissionRow>()
  for (const sub of submissions ?? []) {
    const existing = latest.get(sub.mission_milestone_id)
    if (!existing || (sub.submitted_at ?? '') >= (existing.submitted_at ?? '')) {
      latest.set(sub.mission_milestone_id, sub)
    }
  }
  return (milestones ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((milestone) => {
      const sub = latest.get(milestone.id)
      const state: MilestoneState = sub && sub.status ? (SUBMITTED_STATES[sub.status] ?? 'none') : 'none'
      return {
        id: milestone.id,
        title: milestone.title ?? '',
        description: milestone.description ?? '',
        dueAt: milestone.due_at ?? null,
        state,
        signal: sub ? signalFrom(sub.mission_social_snapshots) : null,
      }
    })
}

type CompensationRow = Pick<
  MissionDetailRow,
  'mission_source' | 'mission_type' | 'paid_fee_amount' | 'paid_fee_currency' | 'affiliate_commission_rate' | 'creator_commission_rate' | 'affiliate_network_programs'
>

export function missionCompensation(row: CompensationRow): string {
  const paid = typeof row.paid_fee_amount === 'number'
    ? `${row.paid_fee_currency ?? 'HKD'} ${row.paid_fee_amount}`
    : null
  const program = Array.isArray(row.affiliate_network_programs)
    ? row.affiliate_network_programs[0]
    : row.affiliate_network_programs
  const affiliate = row.mission_source === 'travelpayouts'
    ? (program?.default_commission_description?.trim() || 'Affiliate commission')
    : (typeof row.creator_commission_rate === 'number' && typeof row.affiliate_commission_rate === 'number'
        ? `Affiliate commission ${row.creator_commission_rate}% creator / ${row.affiliate_commission_rate}% total`
        : 'Affiliate commission')
  if (row.mission_type === 'hybrid' && paid) return `${paid} + ${affiliate}`
  return paid ?? affiliate
}

export function toCreatorMissionDetail(row: MissionDetailRow, creatorId: string): CreatorMissionDetail {
  const participant = row.mission_participants?.find((p) => p.creator_id === creatorId) ?? null
  const missionType = toMissionType(row.mission_type)
  return {
    id: row.id,
    title: row.title ?? '',
    summary: row.summary ?? '',
    missionSource: row.mission_source === 'travelpayouts' ? 'travelpayouts' : 'merchant',
    missionType,
    status: row.status ?? 'published',
    compensation: missionCompensation(row),
    couponCode: row.coupon_code,
    couponUrl: row.coupon_url,
    partnerLinks: (row.affiliate_partner_links ?? []).map((link) => ({ id: link.id, partnerUrl: link.partner_url ?? '' })),
    participantStatus: participant?.status ?? null,
    cta: resolveParticipationCta(participant?.status ?? null, missionType),
    milestones: buildMilestoneRows(row.mission_milestones, participant?.mission_milestone_submissions ?? null),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `… pnpm exec vitest run tests/mission.detail.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/detail.ts apps/web/tests/mission.detail.test.ts
git commit -m "feat(missions): add creator mission detail view-model helper"
```

---

### Task 3: Query — `getCreatorMissionDetail`

**Files:**
- Modify: `apps/web/lib/missions/queries.ts`

Verified via typecheck (the select string is consumed by the host in Task 5; query strings aren't unit-tested in this repo).

- [ ] **Step 1: Add the detail select + query**

In `apps/web/lib/missions/queries.ts`, after the `listCreatorMerchantMissions` function, add:

```ts
export const creatorMissionDetailSelect = `
  id,title,summary,mission_source,mission_type,visibility,status,published_at,
  coupon_code,coupon_url,affiliate_commission_rate,creator_commission_rate,kinnso_commission_rate,
  paid_fee_amount,paid_fee_currency,affiliate_network_program_id,
  affiliate_network_programs(id,program_name,program_url,default_commission_description,status),
  mission_milestones(id,title,description,due_at,sort_order),
  mission_participants(id,status,source,creator_id,application_note,
    mission_milestone_submissions(id,mission_milestone_id,status,proof_urls,notes,merchant_feedback,submitted_at,
      mission_social_snapshots(confidence_status))),
  affiliate_partner_links(id,partner_url,original_url,sub_id)
`

export async function getCreatorMissionDetail(
  supabase: SupabaseClient<Database>,
  missionId: string,
) {
  return supabase
    .from('missions')
    .select(creatorMissionDetailSelect)
    .eq('id', missionId)
    .eq('status', 'published')
    .maybeSingle()
}
```

(`SupabaseClient` and `Database` are already imported at the top of the file.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/missions/queries.ts
git commit -m "feat(missions): add getCreatorMissionDetail query"
```

---

### Task 4: View — `CreatorMissionDetailView`

**Files:**
- Create: `apps/web/components/kinnso/pages/CreatorMissionDetailView.tsx`
- Test: `apps/web/tests/kinnso.CreatorMissionDetailView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/kinnso.CreatorMissionDetailView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { CreatorMissionDetailView } from '@/components/kinnso/pages/CreatorMissionDetailView'
import type { CreatorMissionDetail } from '@/lib/missions/detail'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const base: CreatorMissionDetail = {
  id: 'm1', title: 'Summer in Shibuya', summary: 'Make a reel.', missionSource: 'merchant',
  missionType: 'paid', status: 'published', compensation: 'HKD 5000', couponCode: null, couponUrl: null,
  partnerLinks: [], participantStatus: null, cta: 'apply',
  milestones: [{ id: 'a', title: 'Main reel', description: 'A reel', dueAt: '2026-07-02T00:00:00Z', state: 'none', signal: null }],
}

const render1 = (mission: CreatorMissionDetail, props: Partial<{ onJoin: () => unknown; onApply: (n: string) => unknown }> = {}) =>
  render(
    <CreatorMissionDetailView
      locale="en"
      t={en.missionDetail}
      mission={mission}
      onJoin={props.onJoin ?? vi.fn()}
      onApply={props.onApply ?? vi.fn()}
    />,
  )

describe('CreatorMissionDetailView', () => {
  it('renders a back link to the missions list', () => {
    render1(base)
    const link = screen.getByRole('link', { name: new RegExp(en.missionDetail.back) })
    expect(link.getAttribute('href')).toBe('/en/studio/missions')
  })

  it('shows the join button for a coupon mission and calls onJoin', () => {
    const onJoin = vi.fn()
    render1({ ...base, missionType: 'coupon_affiliate', cta: 'join' }, { onJoin })
    fireEvent.click(screen.getByRole('button', { name: en.missionDetail.join }))
    expect(onJoin).toHaveBeenCalledTimes(1)
  })

  it('shows the apply note + button and calls onApply with the note', () => {
    const onApply = vi.fn()
    render1(base, { onApply })
    fireEvent.change(screen.getByLabelText(en.missionDetail.applyNoteLabel), { target: { value: 'I fit because…' } })
    fireEvent.click(screen.getByRole('button', { name: en.missionDetail.apply }))
    expect(onApply).toHaveBeenCalledWith('I fit because…')
  })

  it('shows the awaiting notice for an applied participant and no apply button', () => {
    render1({ ...base, participantStatus: 'applied', cta: 'awaiting' })
    expect(screen.getByText(en.missionDetail.awaitingTitle)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.missionDetail.apply })).toBeNull()
  })

  it('renders the milestone list for an active participant', () => {
    render1({
      ...base, participantStatus: 'active', cta: 'active',
      milestones: [
        { id: 'a', title: 'Main reel', description: 'A reel', dueAt: null, state: 'submitted', signal: 'verified_signal' },
        { id: 'b', title: 'Wrap-up', description: '', dueAt: null, state: 'none', signal: null },
      ],
    })
    expect(screen.getByText('Main reel')).toBeTruthy()
    expect(screen.getByText('Wrap-up')).toBeTruthy()
    expect(screen.getByText(en.missionDetail.milestonesHeading)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `… pnpm exec vitest run tests/kinnso.CreatorMissionDetailView.test.tsx`
Expected: FAIL — cannot resolve `@/components/kinnso/pages/CreatorMissionDetailView`.

- [ ] **Step 3: Write the component**

Create `apps/web/components/kinnso/pages/CreatorMissionDetailView.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { actionErrorMessage, actionSucceeded, type KinnsoActionResult } from '@/components/kinnso/action-result'
import { MissionCompensationSummary } from '@/components/kinnso/MissionCompensationSummary'
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import { SocialSignalBadge } from '@/components/kinnso/SocialSignalBadge'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import type { CreatorMissionDetail } from '@/lib/missions/detail'
import type { Messages } from '@/lib/i18n/messages/en'

type CreatorMissionDetailViewProps = {
  locale: string
  t: Messages['missionDetail']
  mission: CreatorMissionDetail
  onJoin: () => KinnsoActionResult | Promise<KinnsoActionResult>
  onApply: (note: string) => KinnsoActionResult | Promise<KinnsoActionResult>
}

export function CreatorMissionDetailView({ locale, t, mission, onJoin, onApply }: CreatorMissionDetailViewProps) {
  const router = useRouter()
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [note, setNote] = useState('')

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

  return (
    <main className="k-container py-10">
      <Link href={`/${locale}/studio/missions`} className="text-sm text-kinnso-muted">
        ← {t.back}
      </Link>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-3xl font-black text-kinnso-ink">{mission.title}</h1>
        <MissionStatusBadge status={mission.participantStatus ?? mission.status} />
      </div>
      <div className="mt-2">
        <MissionCompensationSummary text={mission.compensation} />
      </div>

      {actionError && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {actionError}
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-lg font-bold text-kinnso-ink">{t.briefHeading}</h2>
        <p className="mt-2 text-sm leading-relaxed text-kinnso-muted">{mission.summary}</p>
      </section>

      {mission.cta === 'join' && (
        <div className="mt-6">
          <button type="button" className="k-btn-primary text-sm" disabled={isPending} onClick={() => void runAction(onJoin)}>
            {t.join}
          </button>
        </div>
      )}

      {mission.cta === 'apply' && (
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

      {mission.cta === 'awaiting' && (
        <div className="mt-6 rounded-2xl border border-kinnso-cream2 bg-white p-4 shadow-kinnso">
          <h2 className="font-bold text-kinnso-ink">{t.awaitingTitle}</h2>
          <p className="mt-1 text-sm text-kinnso-muted">{t.awaitingBody}</p>
        </div>
      )}

      {mission.cta === 'rejected' && (
        <div className="mt-6 rounded-2xl border border-kinnso-cream2 bg-white p-4 shadow-kinnso">
          <h2 className="font-bold text-kinnso-ink">{t.rejectedTitle}</h2>
          <p className="mt-1 text-sm text-kinnso-muted">{t.rejectedBody}</p>
        </div>
      )}

      {(mission.couponCode || mission.partnerLinks.length > 0) && (
        <section className="mt-8 grid gap-3">
          {mission.couponCode && (
            <div className="rounded-2xl border border-kinnso-cream2 bg-white p-4 shadow-kinnso">
              <h2 className="font-bold text-kinnso-ink">{t.couponHeading}</h2>
              <p className="mt-1 text-sm text-kinnso-muted">
                {t.couponCodeLabel}: <span className="font-mono font-semibold text-kinnso-ink">{mission.couponCode}</span>
              </p>
            </div>
          )}
          {mission.partnerLinks.length > 0 && (
            <div className="rounded-2xl border border-kinnso-cream2 bg-white p-4 shadow-kinnso">
              <h2 className="font-bold text-kinnso-ink">{t.partnerLinksHeading}</h2>
              <ul className="mt-2 space-y-1">
                {mission.partnerLinks.map((link) => (
                  <li key={link.id} className="truncate text-sm">
                    <a href={link.partnerUrl} className="text-kinnso-blue underline" target="_blank" rel="noreferrer">
                      {link.partnerUrl || t.openLink}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {mission.cta === 'active' && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.milestonesHeading}</h2>
          {mission.milestones.length === 0 ? (
            <p className="mt-3 text-sm text-kinnso-muted">{t.notStarted}</p>
          ) : (
            <div className="mt-3 grid gap-3">
              {mission.milestones.map((milestone) => (
                <TicketCard key={milestone.id} as="article" className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-bold text-kinnso-ink">{milestone.title}</h3>
                      {milestone.description && <p className="mt-1 text-sm text-kinnso-muted">{milestone.description}</p>}
                      {milestone.dueAt && <p className="mt-1 text-xs text-kinnso-muted">{t.dueLabel} {milestone.dueAt.slice(0, 10)}</p>}
                    </div>
                    <div className="flex flex-none flex-wrap gap-2">
                      {milestone.state === 'none' ? (
                        <span className="inline-flex rounded-pill bg-kinnso-cream2 px-2.5 py-1 text-xs font-semibold text-kinnso-muted">
                          {t.notStarted}
                        </span>
                      ) : (
                        <>
                          <MissionStatusBadge status={milestone.state} />
                          {milestone.signal && <SocialSignalBadge status={milestone.signal} />}
                        </>
                      )}
                    </div>
                  </div>
                </TicketCard>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `… pnpm exec vitest run tests/kinnso.CreatorMissionDetailView.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/pages/CreatorMissionDetailView.tsx apps/web/tests/kinnso.CreatorMissionDetailView.test.tsx
git commit -m "feat(missions): add CreatorMissionDetailView"
```

---

### Task 5: Host — replace the `ComingSoon` stub

**Files:**
- Modify (full replacement): `apps/web/app/[locale]/studio/missions/[id]/page.tsx`

Host glue verified by typecheck + build (page hosts aren't unit-tested here, matching the list host).

- [ ] **Step 1: Replace the file**

Replace the entire contents of `apps/web/app/[locale]/studio/missions/[id]/page.tsx` with:

```tsx
import { notFound, redirect } from 'next/navigation'
import { CreatorMissionDetailView } from '@/components/kinnso/pages/CreatorMissionDetailView'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { joinMissionAction } from '@/lib/missions/actions'
import { toCreatorMissionDetail, type MissionDetailRow } from '@/lib/missions/detail'
import { getCreatorMissionDetail } from '@/lib/missions/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string; id: string }>

export default async function StudioMissionDetailPage({ params }: { params: Params }) {
  const { locale, id } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const role = await resolveViewerRole(supabase)
  if (role !== 'creator') notFound()

  const { data } = await getCreatorMissionDetail(supabase, id)
  if (!data) notFound()

  const mission = toCreatorMissionDetail(data as unknown as MissionDetailRow, user.id)

  async function join() {
    'use server'
    return joinMissionAction({ missionId: id, locale: loc })
  }

  async function apply(note: string) {
    'use server'
    return joinMissionAction({ missionId: id, applicationNote: note, locale: loc })
  }

  return (
    <CreatorMissionDetailView locale={loc} t={messages.missionDetail} mission={mission} onJoin={join} onApply={apply} />
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean. (The `ComingSoonPage` import is gone from this file; that component is still used elsewhere, so no further change needed.)

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/[locale]/studio/missions/[id]/page.tsx"
git commit -m "feat(missions): real creator mission detail page (replaces ComingSoon)"
```

---

### Task 6: Link Stage A list cards into the detail page

**Files:**
- Modify (full replacement): `apps/web/components/kinnso/pages/CreatorMissionsView.tsx`
- Modify: `apps/web/app/[locale]/studio/missions/page.tsx` (pass `locale`)
- Modify: `apps/web/tests/kinnso.CreatorMissionsView.test.tsx` (add `locale` prop + a link assertion)

- [ ] **Step 1: Update the list test to require `locale` + assert a detail link**

In `apps/web/tests/kinnso.CreatorMissionsView.test.tsx`, add `locale="en"` to **every** `<CreatorMissionsView … />` render in the file (there are 7 renders across the tests), and append this test inside the `describe` block (before its closing `})`):

```tsx
  it('links each card to its detail page', () => {
    render(<CreatorMissionsView locale="en" t={en.missions} missions={[baseMine, baseAvailable]} onJoin={vi.fn()} />)
    const links = screen.getAllByRole('link', { name: en.missions.viewDetails })
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/en/studio/missions/m9', '/en/studio/missions/m1']),
    )
  })
```

(Each existing render becomes e.g. `render(<CreatorMissionsView locale="en" t={en.missions} missions={[baseAvailable]} onJoin={onJoin} />)`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `… pnpm exec vitest run tests/kinnso.CreatorMissionsView.test.tsx`
Expected: FAIL — `locale` is not yet a prop and no `viewDetails` link is rendered.

- [ ] **Step 3: Update `CreatorMissionsView.tsx`**

Replace the entire contents of `apps/web/components/kinnso/pages/CreatorMissionsView.tsx` with (adds `Link` import, the `locale` prop, and a `viewDetails` link in both bands):

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { actionErrorMessage, actionSucceeded, type KinnsoActionResult } from '@/components/kinnso/action-result'
import { MissionCompensationSummary } from '@/components/kinnso/MissionCompensationSummary'
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { segmentMissions } from '@/lib/missions/list'
import type { Messages } from '@/lib/i18n/messages/en'

export type CreatorMissionCard = {
  id: string
  title: string
  summary: string
  missionSource: 'merchant' | 'travelpayouts'
  missionType: 'coupon_affiliate' | 'hybrid' | 'paid'
  status: string
  participant: { id: string; status: string } | null
  partnerLinks: Array<{ id: string; partnerUrl: string }>
  programUrl: string | null
  compensation: string
  milestoneCount: number
  submittedCount: number
}

type CreatorMissionsViewProps = {
  locale: string
  t: Messages['missions']
  missions: CreatorMissionCard[]
  onJoin: (missionId: string) => KinnsoActionResult | Promise<KinnsoActionResult>
}

export function CreatorMissionsView({ locale, t, missions, onJoin }: CreatorMissionsViewProps) {
  const router = useRouter()
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const { mine, available } = segmentMissions(missions)

  const getJoinLabel = (missionType: CreatorMissionCard['missionType']) =>
    missionType === 'coupon_affiliate' ? t.joinMission : t.applyMission

  const detailHref = (missionId: string) => `/${locale}/studio/missions/${missionId}`

  const runAction = async (missionId: string, action: () => KinnsoActionResult | Promise<KinnsoActionResult>) => {
    setActionError(null)
    setPendingId(missionId)
    try {
      const result = await action()
      setActionError(actionErrorMessage(result))
      if (actionSucceeded(result)) router.refresh()
    } finally {
      setPendingId(null)
    }
  }

  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.missionQueue}</h1>
      {actionError && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {actionError}
        </p>
      )}

      <section className="mt-8" aria-label={t.myMissions}>
        <h2 className="text-lg font-bold text-kinnso-ink">{t.myMissions}</h2>
        {mine.length === 0 ? (
          <p className="mt-3 text-sm text-kinnso-muted">{t.myMissionsEmpty}</p>
        ) : (
          <div className="mt-4 grid gap-4">
            {mine.map((mission) => (
              <TicketCard key={mission.id} as="article" className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <h3 className="text-lg font-bold text-kinnso-ink">{mission.title}</h3>
                    <p className="text-sm text-kinnso-muted">{mission.summary}</p>
                    <MissionCompensationSummary text={mission.compensation} />
                  </div>
                  <MissionStatusBadge status={mission.participant?.status ?? mission.status} />
                </div>
                {mission.milestoneCount > 0 && (
                  <div className="mt-4 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-kinnso-cream2">
                      <div
                        className="h-full rounded-full bg-kinnso-ink"
                        style={{ width: `${Math.round((mission.submittedCount / mission.milestoneCount) * 100)}%` }}
                      />
                    </div>
                    <span className="whitespace-nowrap text-xs text-kinnso-muted">
                      {mission.submittedCount} / {mission.milestoneCount} {t.milestoneProgress}
                    </span>
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <Link href={detailHref(mission.id)} className="k-btn-ghost text-sm">
                    {t.viewDetails}
                  </Link>
                </div>
              </TicketCard>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10" aria-label={t.availableMissions}>
        <h2 className="text-lg font-bold text-kinnso-ink">{t.availableMissions}</h2>
        {available.length === 0 ? (
          <p className="mt-3 text-sm text-kinnso-muted">{t.availableEmpty}</p>
        ) : (
          <div className="mt-4 grid gap-4">
            {available.map((mission) => (
              <TicketCard key={mission.id} as="article" className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <h3 className="text-lg font-bold text-kinnso-ink">{mission.title}</h3>
                    <p className="text-sm text-kinnso-muted">{mission.summary}</p>
                    <MissionCompensationSummary text={mission.compensation} />
                  </div>
                  <MissionStatusBadge status={mission.status} />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <Link href={detailHref(mission.id)} className="k-btn-ghost text-sm">
                    {t.viewDetails}
                  </Link>
                  <button
                    type="button"
                    className="k-btn-primary text-sm"
                    disabled={pendingId === mission.id}
                    onClick={() => void runAction(mission.id, () => onJoin(mission.id))}
                  >
                    {getJoinLabel(mission.missionType)}
                  </button>
                </div>
              </TicketCard>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
```

- [ ] **Step 4: Pass `locale` from the list host**

In `apps/web/app/[locale]/studio/missions/page.tsx`, update the final return to pass `locale`:

```tsx
  return <CreatorMissionsView locale={loc} t={messages.missions} missions={missions} onJoin={join} />
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `… pnpm exec vitest run tests/kinnso.CreatorMissionsView.test.tsx`
Expected: PASS (the original tests + the new link test).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/pages/CreatorMissionsView.tsx "apps/web/app/[locale]/studio/missions/page.tsx" apps/web/tests/kinnso.CreatorMissionsView.test.tsx
git commit -m "feat(missions): link list cards into the mission detail page"
```

---

### Task 7: Quality gate

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + lint**

Run:
```
pnpm typecheck && pnpm lint
```
Expected: `tsc --noEmit` clean; `eslint` 0 errors (pre-existing `@next/next/no-img-element` warnings are unrelated).

- [ ] **Step 2: Targeted tests**

Run:
```
SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co SUPABASE_ANON_KEY=dummy NEXT_PUBLIC_SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy pnpm exec vitest run tests/mission.detail.test.ts tests/kinnso.CreatorMissionDetailView.test.tsx tests/kinnso.CreatorMissionsView.test.tsx tests/i18n.locale-parity.test.ts tests/mission.list.test.ts --no-file-parallelism
```
Expected: all green.

- [ ] **Step 3: Build**

Run:
```
SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co SUPABASE_ANON_KEY=dummy NEXT_PUBLIC_SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy pnpm build
```
Expected: TypeScript compile + page-data collection succeed for `/[locale]/studio/missions/[id]`. Note: the build's static-params phase for the unrelated `/[locale]/articles/[category]/[url]` route calls real Supabase and fails with the dummy key — that failure is pre-existing/environmental (fails identically on `main`) and is NOT a Stage B regression. If the build aborts only at that route, that is acceptable for this worktree; CI runs it with real credentials.

- [ ] **Step 4: If anything in a Stage B file fails, fix it and re-run Steps 1–2 before continuing.**

---

## Self-Review

**Spec coverage (§2 of the design):**
- `getCreatorMissionDetail` query → Task 3. ✓
- `detail.ts` view-model + participation CTA → Task 2. ✓
- Host replacing `ComingSoon`, auth/role gate, `join`/`apply` thunks → Task 5. ✓
- `CreatorMissionDetailView`: header, brief, participation branch (join/apply/awaiting/rejected/active), coupon/links, read-only milestone list → Task 4. ✓
- `missionDetail` i18n group + parity registration → Task 1. ✓
- List cards link into detail → Task 6. ✓
- Submission stays read-only (no submit form/action) → milestone list renders state only; submit + verification deferred to Stage C. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; every command has expected output. The `missionDetail` non-English values are intentionally English (phased translation, parity-by-key) — flagged, not a gap. ✓

**Type consistency:** `MissionDetailRow`, `CreatorMissionDetail`, `MilestoneRow`, `ParticipationCta`, `MilestoneState`, `SocialSignalStatus` are defined in Task 2 and consumed identically in Tasks 4–5. `resolveParticipationCta(status, missionType)`, `buildMilestoneRows(milestones, submissions)`, `missionCompensation(row)`, `toCreatorMissionDetail(row, creatorId)`, `getCreatorMissionDetail(supabase, missionId)` signatures match their call sites. `CreatorMissionsView` gains `locale: string` (Task 6) and every caller/test passes it. The view consumes `Messages['missionDetail']` (Task 1) and `mission.cta`/`mission.milestones` (Task 2). ✓

**Known minor duplication:** `missionCompensation` (detail.ts) duplicates the list host's inline `formatCompensation`. Deliberate — keeps Stage B self-contained and avoids re-touching the Stage A host's compensation helpers; a future DRY pass can extract a shared `compensation.ts` if a third surface needs it.

## Follow-ups (out of scope)
- Translate the `missionDetail` group (and `viewDetails`) into the 6 non-English locales.
- Stage C: per-milestone submit form + `submitMilestoneAction` + scan-worker verification (its own plan + the `mission_verification_jobs` migration).
