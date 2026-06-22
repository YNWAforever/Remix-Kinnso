# Creator Missions — Stage A: Segmented List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `/studio/missions` from one flat list into two bands — "My missions" (joined, with status + milestone progress) and "Available missions" (join/apply by type) — with per-band empty states.

**Architecture:** A new pure module `lib/missions/list.ts` computes milestone progress and segments missions by participation. The host (`app/[locale]/studio/missions/page.tsx`) extends the existing Supabase select to pull the creator's submissions and feeds the segmented data to a refactored `CreatorMissionsView`. No DB migration, no new server actions — reuses the existing `joinMissionAction` thunk and RLS.

**Tech Stack:** Next.js (App Router, RSC) · TypeScript · Supabase JS (user-scoped client, RLS boundary) · Vitest + @testing-library/react (jsdom) · Tailwind (kinnso design tokens) · pnpm workspace.

**Scope note:** This is **Stage A of 3** from the spec `docs/superpowers/specs/2026-06-22-creator-missions-journey-design.md`. Stage B (detail page) and Stage C (submission + verification) get their own plans. Stage A intentionally does **not** add card→detail links (the detail page is still a `ComingSoon` stub until Stage B) and removes the dead travelpayouts partner-link branch from this merchant-only view (it already lives in `/studio/offers` per Slice 3d).

**Branch:** `feat/creator-missions-journey` (kinnso-v3 is its own git repo). All commands below run from `apps/web/` unless noted.

---

### Task 1: i18n — add 5 keys to the `missions` group across all 7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface `Messages['missions']` ends at the `validationError` key ~line 317; const `missions` object ~line 745+)
- Modify: `apps/web/lib/i18n/messages/ja.ts`, `ko.ts`, `th.ts`, `zh-cn.ts`, `zh-hk.ts`, `zh-tw.ts` (each has a `missions:` object)

The existing `missions` group is already registered in `tests/i18n.locale-parity.test.ts` `GROUPS`, so no test-registry change is needed — the parity test + the `Messages` typecheck oracle (each locale imports `type { Messages } from './en'`) will enforce that all 7 locales gain the same keys.

- [ ] **Step 1: Add the 5 keys to the `Messages` interface in `en.ts`**

In the `missions: { … }` interface block, add after `validationError: string`:

```ts
    myMissions: string
    availableMissions: string
    milestoneProgress: string
    myMissionsEmpty: string
    availableEmpty: string
```

- [ ] **Step 2: Add the English values to the `missions` const in `en.ts`**

In the `missions: { … }` const object, add after the `validationError: '…'` entry:

```ts
    myMissions: 'My missions',
    availableMissions: 'Available missions',
    milestoneProgress: 'milestones submitted',
    myMissionsEmpty: "You haven't joined any missions yet.",
    availableEmpty: 'No missions available right now. Check back soon.',
```

- [ ] **Step 3: Add the same 5 keys to each non-English locale's `missions` object**

`ja.ts`:
```ts
    myMissions: 'マイミッション',
    availableMissions: '募集中のミッション',
    milestoneProgress: 'マイルストーン提出済み',
    myMissionsEmpty: 'まだミッションに参加していません。',
    availableEmpty: '現在募集中のミッションはありません。またご確認ください。',
```

`ko.ts`:
```ts
    myMissions: '내 미션',
    availableMissions: '참여 가능한 미션',
    milestoneProgress: '마일스톤 제출',
    myMissionsEmpty: '아직 참여한 미션이 없습니다.',
    availableEmpty: '지금은 참여 가능한 미션이 없습니다. 나중에 다시 확인해 주세요.',
```

`th.ts`:
```ts
    myMissions: 'ภารกิจของฉัน',
    availableMissions: 'ภารกิจที่เปิดรับ',
    milestoneProgress: 'ไมล์สโตนที่ส่งแล้ว',
    myMissionsEmpty: 'คุณยังไม่ได้เข้าร่วมภารกิจใด ๆ',
    availableEmpty: 'ขณะนี้ยังไม่มีภารกิจที่เปิดรับ โปรดกลับมาตรวจสอบใหม่',
```

`zh-cn.ts`:
```ts
    myMissions: '我的任务',
    availableMissions: '可参与的任务',
    milestoneProgress: '里程碑已提交',
    myMissionsEmpty: '你还没有参加任何任务。',
    availableEmpty: '暂时没有可参与的任务，请稍后再来查看。',
```

`zh-hk.ts`:
```ts
    myMissions: '我的任務',
    availableMissions: '可參與的任務',
    milestoneProgress: '里程碑已提交',
    myMissionsEmpty: '你尚未參加任何任務。',
    availableEmpty: '暫時沒有可參與的任務，請稍後再查看。',
```

`zh-tw.ts`:
```ts
    myMissions: '我的任務',
    availableMissions: '可參與的任務',
    milestoneProgress: '里程碑已提交',
    myMissionsEmpty: '你尚未參加任何任務。',
    availableEmpty: '暫時沒有可參與的任務，請稍後再查看。',
```

- [ ] **Step 4: Run the parity test and typecheck**

Run: `pnpm test -- i18n.locale-parity && pnpm typecheck`
Expected: parity test PASS (all 7 locales have identical `missions` keys); `tsc --noEmit` PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/i18n/messages
git commit -m "i18n(missions): add segmented-list band + empty-state keys"
```

---

### Task 2: Pure helpers — `lib/missions/list.ts`

**Files:**
- Create: `apps/web/lib/missions/list.ts`
- Test: `apps/web/tests/mission.list.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/mission.list.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { creatorMissionProgress, segmentMissions } from '@/lib/missions/list'

describe('creatorMissionProgress', () => {
  it('counts distinct milestones with a non-pending submission', () => {
    const milestones = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const submissions = [
      { status: 'submitted', mission_milestone_id: 'a' },
      { status: 'approved', mission_milestone_id: 'a' },
      { status: 'submitted', mission_milestone_id: 'b' },
    ]
    expect(creatorMissionProgress(milestones, submissions)).toEqual({ milestoneCount: 3, submittedCount: 2 })
  })

  it('excludes pending submissions and treats null inputs as empty', () => {
    expect(
      creatorMissionProgress([{ id: 'a' }], [{ status: 'pending', mission_milestone_id: 'a' }]),
    ).toEqual({ milestoneCount: 1, submittedCount: 0 })
    expect(creatorMissionProgress(null, null)).toEqual({ milestoneCount: 0, submittedCount: 0 })
  })

  it('never reports more submitted than there are milestones', () => {
    expect(
      creatorMissionProgress([{ id: 'a' }], [{ status: 'submitted', mission_milestone_id: 'ghost' }]),
    ).toEqual({ milestoneCount: 1, submittedCount: 1 })
  })
})

describe('segmentMissions', () => {
  it('splits by participation and preserves order', () => {
    const m = [
      { id: '1', participant: null },
      { id: '2', participant: { id: 'p2', status: 'active' } },
      { id: '3', participant: null },
    ]
    const { mine, available } = segmentMissions(m)
    expect(mine.map((x) => x.id)).toEqual(['2'])
    expect(available.map((x) => x.id)).toEqual(['1', '3'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- mission.list`
Expected: FAIL — cannot resolve `@/lib/missions/list`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/missions/list.ts`:

```ts
export type MilestoneRef = { id: string }
export type SubmissionRef = { status: string | null; mission_milestone_id: string }

export function creatorMissionProgress(
  milestones: MilestoneRef[] | null | undefined,
  submissions: SubmissionRef[] | null | undefined,
): { milestoneCount: number; submittedCount: number } {
  const milestoneCount = milestones?.length ?? 0
  const submittedMilestones = new Set(
    (submissions ?? [])
      .filter((s) => s.status !== 'pending')
      .map((s) => s.mission_milestone_id),
  )
  return { milestoneCount, submittedCount: Math.min(submittedMilestones.size, milestoneCount) }
}

export function segmentMissions<T extends { participant: { id: string; status: string } | null }>(
  missions: T[],
): { mine: T[]; available: T[] } {
  const mine: T[] = []
  const available: T[] = []
  for (const mission of missions) {
    if (mission.participant) mine.push(mission)
    else available.push(mission)
  }
  return { mine, available }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- mission.list`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/list.ts apps/web/tests/mission.list.test.ts
git commit -m "feat(missions): add segmentMissions + creatorMissionProgress helpers"
```

---

### Task 3: Refactor `CreatorMissionsView` into two bands

**Files:**
- Modify: `apps/web/components/kinnso/pages/CreatorMissionsView.tsx` (full replacement below)
- Modify: `apps/web/tests/kinnso.CreatorMissionsView.test.tsx` (full replacement below)

- [ ] **Step 1: Update the test to assert the two-band behavior**

Replace the entire contents of `apps/web/tests/kinnso.CreatorMissionsView.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { CreatorMissionsView, type CreatorMissionCard } from '@/components/kinnso/pages/CreatorMissionsView'
import en from '@/lib/i18n/messages/en'

afterEach(() => {
  cleanup()
  refreshMock.mockReset()
})

const baseAvailable: CreatorMissionCard = {
  id: 'm1',
  title: 'Boutique hotels program',
  summary: 'Join and create tracked links.',
  missionSource: 'merchant',
  missionType: 'coupon_affiliate',
  status: 'published',
  participant: null,
  partnerLinks: [],
  programUrl: null,
  compensation: '12% commission',
  milestoneCount: 0,
  submittedCount: 0,
}

const baseMine: CreatorMissionCard = {
  ...baseAvailable,
  id: 'm9',
  title: 'Summer in Shibuya',
  participant: { id: 'p9', status: 'active' },
  missionType: 'hybrid',
  compensation: 'HK$5,000 + 15% commission',
  milestoneCount: 3,
  submittedCount: 1,
}

describe('CreatorMissionsView', () => {
  it('renders an available mission and calls join', () => {
    const onJoin = vi.fn()
    render(<CreatorMissionsView t={en.missions} missions={[baseAvailable]} onJoin={onJoin} />)
    expect(screen.getByText('Boutique hotels program')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.missions.joinMission }))
    expect(onJoin).toHaveBeenCalledWith('m1')
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })

  it('shows join action errors returned by the server', async () => {
    const onJoin = vi.fn(async () => ({ ok: false, errors: { form: ['Creator access is required'] } }))
    render(<CreatorMissionsView t={en.missions} missions={[baseAvailable]} onJoin={onJoin} />)
    fireEvent.click(screen.getByRole('button', { name: en.missions.joinMission }))
    expect((await screen.findByRole('alert')).textContent).toContain('Creator access is required')
  })

  it('disables actions while pending and refreshes after success', async () => {
    let resolveJoin!: (result: { ok: true }) => void
    const onJoin = vi.fn(() => new Promise<{ ok: true }>((resolve) => { resolveJoin = resolve }))
    render(<CreatorMissionsView t={en.missions} missions={[baseAvailable]} onJoin={onJoin} />)
    const button = screen.getByRole('button', { name: en.missions.joinMission })
    fireEvent.click(button)
    expect(button).toHaveProperty('disabled', true)
    resolveJoin({ ok: true })
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
  })

  it('uses apply copy for paid missions', () => {
    const onJoin = vi.fn()
    render(
      <CreatorMissionsView
        t={en.missions}
        missions={[{ ...baseAvailable, id: 'm2', missionType: 'paid' }]}
        onJoin={onJoin}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: en.missions.applyMission }))
    expect(onJoin).toHaveBeenCalledWith('m2')
  })

  it('renders joined missions under My missions with progress and no join button', () => {
    render(<CreatorMissionsView t={en.missions} missions={[baseMine]} onJoin={vi.fn()} />)
    expect(screen.getByText('Summer in Shibuya')).toBeTruthy()
    expect(screen.getByText(`1 / 3 ${en.missions.milestoneProgress}`)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.missions.applyMission })).toBeNull()
  })

  it('shows an empty state for each band', () => {
    render(<CreatorMissionsView t={en.missions} missions={[]} onJoin={vi.fn()} />)
    expect(screen.getByText(en.missions.myMissionsEmpty)).toBeTruthy()
    expect(screen.getByText(en.missions.availableEmpty)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- kinnso.CreatorMissionsView`
Expected: FAIL — the new `milestoneCount`/`submittedCount` fields aren't on `CreatorMissionCard` yet, and the My-missions / empty-state assertions fail against the current single-list view.

- [ ] **Step 3: Replace `CreatorMissionsView.tsx`**

Replace the entire contents of `apps/web/components/kinnso/pages/CreatorMissionsView.tsx` with:

```tsx
'use client'

import { useState } from 'react'
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
  t: Messages['missions']
  missions: CreatorMissionCard[]
  onJoin: (missionId: string) => KinnsoActionResult | Promise<KinnsoActionResult>
}

export function CreatorMissionsView({ t, missions, onJoin }: CreatorMissionsViewProps) {
  const router = useRouter()
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const { mine, available } = segmentMissions(missions)

  const getJoinLabel = (missionType: CreatorMissionCard['missionType']) =>
    missionType === 'coupon_affiliate' ? t.joinMission : t.applyMission

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
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="k-btn-primary text-sm"
                    disabled={isPending}
                    onClick={() => void runAction(() => onJoin(mission.id))}
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- kinnso.CreatorMissionsView`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/pages/CreatorMissionsView.tsx apps/web/tests/kinnso.CreatorMissionsView.test.tsx
git commit -m "feat(missions): split creator missions list into My/Available bands"
```

---

### Task 4: Wire the data — extend the query + host mapping

**Files:**
- Modify: `apps/web/lib/missions/queries.ts` (the `creatorMissionSelect` template, the `mission_participants(...)` line)
- Modify: `apps/web/app/[locale]/studio/missions/page.tsx` (the `CreatorMissionRow` type + `mapCreatorMission`)

The host is exercised by build + typecheck (page hosts are not unit-tested here, per the suite's convention). The studio dashboard page also calls `listCreatorMerchantMissions` but maps only `id`/`title`, so it is unaffected by the wider select.

- [ ] **Step 1: Extend `creatorMissionSelect` to pull the creator's submissions**

In `apps/web/lib/missions/queries.ts`, change the `mission_participants(...)` line inside `creatorMissionSelect` from:

```ts
  mission_participants(id,status,source,creator_id),
```

to:

```ts
  mission_participants(id,status,source,creator_id,mission_milestone_submissions(id,status,mission_milestone_id)),
```

(`mission_milestones(id,title,description,due_at,sort_order)` is already in the select — it supplies the milestone count. RLS scopes the nested participant + submissions to the viewing creator.)

- [ ] **Step 2: Extend the host row type and mapping**

In `apps/web/app/[locale]/studio/missions/page.tsx`:

(a) Add the import near the other `lib/missions` import:

```ts
import { creatorMissionProgress } from '@/lib/missions/list'
```

(b) In the `CreatorMissionRow` type, add a `mission_milestones` field and extend the participant element. Change:

```ts
  mission_participants?: Array<{ id: string; status: string | null; creator_id: string | null }> | null
```

to:

```ts
  mission_milestones?: Array<{ id: string }> | null
  mission_participants?: Array<{
    id: string
    status: string | null
    creator_id: string | null
    mission_milestone_submissions?: Array<{ status: string | null; mission_milestone_id: string }> | null
  }> | null
```

(c) In `mapCreatorMission`, after the `participant` lookup, compute progress and add the two fields to the returned object. Change the body from:

```ts
  const participant = row.mission_participants?.find((item) => item.creator_id === creatorId) ?? null

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
  }
```

to:

```ts
  const participant = row.mission_participants?.find((item) => item.creator_id === creatorId) ?? null
  const { milestoneCount, submittedCount } = creatorMissionProgress(
    row.mission_milestones,
    participant?.mission_milestone_submissions,
  )

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
  }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — the host now supplies the two required `CreatorMissionCard` fields.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/missions/queries.ts "apps/web/app/[locale]/studio/missions/page.tsx"
git commit -m "feat(missions): feed milestone progress + participation into the list"
```

---

### Task 5: Full quality gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full gate**

Run (from `apps/web/`):
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Expected: `tsc --noEmit` PASS · `eslint` 0 errors · `vitest run` all green (incl. `mission.list`, `kinnso.CreatorMissionsView`, `i18n.locale-parity`) · `next build` ✓ with `/[locale]/studio/missions` dynamic.

- [ ] **Step 2: If anything fails, fix it, then re-run Step 1 before continuing.**

- [ ] **Step 3: Final commit (only if Step 2 produced fixes)**

```bash
git add -A
git commit -m "chore(missions): stage A quality gate green"
```

---

## Self-Review

**Spec coverage (Stage A rows of the spec §1):**
- Query extension for submissions → Task 4 Step 1. ✓
- `segmentMissions` pure helper → Task 2. ✓
- Host map + segment → Task 4. ✓
- Two-band view + progress + join/apply by type + per-band empty states → Task 3. ✓
- `missions` i18n extension → Task 1. ✓
- Out-of-scope deferrals (detail links, partner-link branch removal) → documented in the Scope note; the removed branch is gone in the Task 3 replacement. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; every command has expected output. ✓

**Type consistency:** `CreatorMissionCard` gains `milestoneCount`/`submittedCount` (Task 3) and the host supplies exactly those names (Task 4). `creatorMissionProgress(milestones, submissions)` and `segmentMissions(missions)` signatures match their call sites. `SubmissionRef` uses `mission_milestone_id` consistently in the helper, the test, and the query select alias. ✓

**Note for the executor:** the kinnso-v3 repo uses `pnpm`; if `pnpm test -- <pattern>` doesn't filter as expected in this Vitest version, fall back to `pnpm test` (runs the full suite) — it's fast enough for this package.
