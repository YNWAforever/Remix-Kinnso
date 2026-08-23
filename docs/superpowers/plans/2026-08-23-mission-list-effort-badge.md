# Mission List Effort Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a mission's effort estimate (added in R13.0) as a small badge on the
creator-facing mission list, not just the detail page, so a creator can triage effort while
browsing without opening each mission.

**Architecture:** One column already exists (`missions.effort`, added by R13.0) — this phase is
pure read/display plumbing. Widen the list query and its two mapping layers
(`lib/missions/queries.ts` → `studio/missions/page.tsx` → `CreatorMissionsView.tsx`) to carry
`effort` through, then render a badge in the two list sections the approved design names ("My
missions" and "Available missions" — NOT the third "invitations" section, which stays
untouched per the approved design's exact scope).

**Tech Stack:** Next.js 16 App Router, Supabase Postgres, TypeScript, Vitest 4,
`@testing-library/react`.

---

### Task 1: Thread `effort` through the query and page-level mapping

**Files:**
- Modify: `apps/web/lib/missions/queries.ts:16-24` (`creatorMissionSelect`)
- Modify: `apps/web/app/[locale]/studio/missions/page.tsx` (`CreatorMissionRow` type,
  `mapCreatorMission`)
- Test: `apps/web/tests/mission.queries.test.ts`
- Test: `apps/web/tests/studio.missions.host.test.tsx`

- [ ] **Step 1: Write the failing query test**

Add to `apps/web/tests/mission.queries.test.ts`, in the same `describe('creator mission
selects', ...)` block used for the R13.0 `creatorMissionDetailSelect` test:

```typescript
  it('creatorMissionSelect selects effort for the list view', () => {
    expect(creatorMissionSelect).toContain('effort')
  })
```

(Import `creatorMissionSelect` alongside the existing `creatorMissionDetailSelect` import at
the top of the file if it isn't already imported.)

- [ ] **Step 2: Write the failing host test**

Add to `apps/web/tests/studio.missions.host.test.tsx`, inside `describe('/[locale]/studio/
missions host', ...)`, right after the existing `'shows hybrid missions with both paid and
affiliate compensation'` test:

```typescript
  it('threads a mission\'s effort level through to the rendered card', async () => {
    listCreatorMerchantMissionsMock.mockResolvedValueOnce({
      data: [{
        id: 'mission-3',
        title: 'Effort-rated mission',
        summary: 'Has an effort estimate.',
        mission_source: 'merchant',
        mission_type: 'coupon_affiliate',
        status: 'published',
        merchant_profile_id: 'merchant-1',
        paid_fee_amount: null,
        paid_fee_currency: null,
        affiliate_commission_rate: 12,
        creator_commission_rate: 8,
        affiliate_network_programs: null,
        mission_participants: [],
        affiliate_partner_links: [],
        effort: 'medium',
      }],
    } as never)

    const ui = await StudioMissionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)

    expect(screen.getByText('Medium effort')).toBeTruthy()
  })

  it('renders no effort badge when a mission has no effort set', async () => {
    const ui = await StudioMissionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)

    expect(screen.queryByText(/effort$/i)).toBeNull()
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run mission.queries studio.missions.host -v`
Expected: FAIL — `creatorMissionSelect` doesn't select `effort` yet, and neither
`CreatorMissionRow`/`mapCreatorMission`/`CreatorMissionCard` nor `CreatorMissionsView` know
about it yet (this task's Step 2 test also depends on Task 2's rendering work — see note below).

**Note on staged sequencing:** Step 2's two new tests won't go fully green until Task 2 (which
widens `CreatorMissionCard` and renders the badge) lands — this task only wires the data
through as far as `mapCreatorMission`'s output. This mirrors R13.0's own established pattern of
tests going green only once every task in the chain is done. Do not try to make these tests
pass by rendering anything in this task — that's out of scope here.

- [ ] **Step 4: Implement**

In `apps/web/lib/missions/queries.ts`, widen `creatorMissionSelect` (currently ending
`affiliate_partner_links(id,partner_url,original_url,sub_id)` on line 23):

```typescript
export const creatorMissionSelect = `
  id,title,summary,mission_source,mission_type,visibility,status,published_at,min_tier,merchant_profile_id,
  coupon_code,coupon_url,affiliate_commission_rate,creator_commission_rate,kinnso_commission_rate,
  paid_fee_amount,paid_fee_currency,affiliate_network_program_id,effort,
  affiliate_network_programs(id,program_name,program_url,default_commission_description,status),
  mission_milestones(id,title,description,due_at,sort_order),
  mission_participants(id,status,source,creator_id,mission_milestone_submissions(id,status,mission_milestone_id)),
  affiliate_partner_links(id,partner_url,original_url,sub_id)
`
```

In `apps/web/app/[locale]/studio/missions/page.tsx`:

Add `effort` to `CreatorMissionRow` (currently ending `affiliate_partner_links?: Array<{ id:
string; partner_url: string | null }> | null` before its closing `}`):

```typescript
  affiliate_partner_links?: Array<{ id: string; partner_url: string | null }> | null
  effort?: string | null
```

Import `missionEfforts`/`MissionEffort` alongside the existing `missionTypes` import:

```typescript
import { missionEfforts, missionTypes, type MissionEffort } from '@/lib/missions/types'
```

Add a local narrowing helper right after the existing `missionType()` helper (which follows
the same "derive from the canonical array in types.ts" convention this function already uses —
matching R13.0's own established, review-confirmed pattern of never hand-rolling a duplicate
enum set):

```typescript
const MISSION_EFFORTS = new Set<MissionEffort>(missionEfforts)

const narrowEffort = (effort: string | null | undefined): MissionEffort | null =>
  effort != null && MISSION_EFFORTS.has(effort as MissionEffort) ? (effort as MissionEffort) : null
```

Widen `mapCreatorMission`'s returned object (currently ending with the `funded:` field before
its closing `}`):

```typescript
    funded:
      (row.mission_type === 'paid' || row.mission_type === 'hybrid' || row.mission_type === 'receipt_cashback') &&
      row.merchant_profile_id !== null &&
      funded.has(row.merchant_profile_id),
    effort: narrowEffort(row.effort),
  }
}
```

- [ ] **Step 5: Run tests**

Run: `cd apps/web && npx vitest run mission.queries studio.missions.host -v`
Expected: the query test passes. The two new host tests still FAIL (they assert on rendered
text that Task 2 adds) — this is the expected staged state described above. Confirm the
`mission.queries` test passes and that the host tests fail specifically on the `screen.getByText`/
`queryByText` assertions, not on a TypeScript/runtime error — a crash would indicate a real bug
in this task's own code, not the expected staged gap.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/missions/queries.ts "apps/web/app/[locale]/studio/missions/page.tsx" apps/web/tests/mission.queries.test.ts apps/web/tests/studio.missions.host.test.tsx
git commit -m "feat(web): thread mission effort through the creator list query (mission list effort badge)"
```

---

### Task 2: Render the effort badge on the mission list

**Files:**
- Modify: `apps/web/components/kinnso/pages/CreatorMissionsView.tsx`
- Test: `apps/web/tests/kinnso.CreatorMissionsView.test.tsx`

- [ ] **Step 1: Widen the existing `CreatorMissionCard` fixtures**

`apps/web/tests/kinnso.CreatorMissionsView.test.tsx` defines `baseAvailable: CreatorMissionCard`
(around line 21), which `baseMine` and `baseInvited` both derive from via spread. Widen
`baseAvailable` with the new required field — TypeScript will otherwise flag this literal once
`CreatorMissionCard` is widened in Step 3 below:

```typescript
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
  locked: false,
  requiredTier: null,
  funded: false,
  effort: null,
}
```

- [ ] **Step 2: Write the failing tests**

Add to `apps/web/tests/kinnso.CreatorMissionsView.test.tsx`, inside `describe('CreatorMissions
View', ...)`:

```typescript
  it('shows an effort badge on an available mission card when effort is set', () => {
    render(
      <CreatorMissionsView
        locale="en" t={en.missions}
        missions={[{ ...baseAvailable, effort: 'low' }]}
        onJoin={vi.fn()} onAccept={vi.fn()}
      />,
    )
    expect(screen.getByText('Low effort')).toBeTruthy()
  })

  it('shows an effort badge on a "my missions" card when effort is set', () => {
    render(
      <CreatorMissionsView
        locale="en" t={en.missions}
        missions={[{ ...baseMine, effort: 'high' }]}
        onJoin={vi.fn()} onAccept={vi.fn()}
      />,
    )
    expect(screen.getByText('High effort')).toBeTruthy()
  })

  it('shows no effort badge when a mission has no effort set', () => {
    render(
      <CreatorMissionsView
        locale="en" t={en.missions}
        missions={[baseAvailable, baseMine]}
        onJoin={vi.fn()} onAccept={vi.fn()}
      />,
    )
    expect(screen.queryByText(/effort$/i)).toBeNull()
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run kinnso.CreatorMissionsView -v`
Expected: FAIL — `CreatorMissionCard` has no `effort` field yet (TypeScript error on the
fixture literals and the inline overrides), and no badge is rendered yet.

- [ ] **Step 4: Implement**

In `apps/web/components/kinnso/pages/CreatorMissionsView.tsx`, import `MissionEffort`
alongside the existing type import (currently `import type { GatedTier } from
'@/lib/contribution/tiers'` and `import type { Messages } from '@/lib/i18n/messages/en'`):

```typescript
import type { MissionEffort } from '@/lib/missions/types'
```

Widen `CreatorMissionCard` (currently ending `funded: boolean` before its closing `}`):

```typescript
export type CreatorMissionCard = {
  id: string
  title: string
  summary: string
  missionSource: 'merchant' | 'travelpayouts'
  missionType: MissionType
  status: string
  participant: { id: string; status: string; source: string } | null
  partnerLinks: Array<{ id: string; partnerUrl: string }>
  programUrl: string | null
  compensation: string
  milestoneCount: number
  submittedCount: number
  locked: boolean
  requiredTier: GatedTier | null
  funded: boolean
  effort: MissionEffort | null
}
```

Add a small badge-label helper near the top of the file, right after the existing
`isMerchantInvitation` helper:

```typescript
const effortBadgeLabel = (t: Messages['missions'], effort: MissionEffort) => t.effortBadgeLabel(effort)
```

In the "My missions" section's `TicketCard` block (the one inside `{mine.map((mission) =>
...)}`), find the badge row:

```tsx
                  <div className="flex shrink-0 items-center gap-2">
                    <MissionStatusBadge status={mission.participant?.status ?? mission.status} />
                    {mission.funded && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                        {t.fundedBadge}
                      </span>
                    )}
                  </div>
```

Add the effort badge right after the funded badge's closing `)}`:

```tsx
                  <div className="flex shrink-0 items-center gap-2">
                    <MissionStatusBadge status={mission.participant?.status ?? mission.status} />
                    {mission.funded && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                        {t.fundedBadge}
                      </span>
                    )}
                    {mission.effort && (
                      <span className="inline-flex items-center rounded-full bg-kinnso-cream2 px-2 py-0.5 text-xs font-bold text-kinnso-ink">
                        {effortBadgeLabel(t, mission.effort)}
                      </span>
                    )}
                  </div>
```

Make the identical addition to the "Available missions" section's `TicketCard` block (the one
inside `{available.map((mission) => ...)}`), which has the same badge-row shape:

```tsx
                  <div className="flex shrink-0 items-center gap-2">
                    <MissionStatusBadge status={mission.status} />
                    {mission.funded && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                        {t.fundedBadge}
                      </span>
                    )}
                    {mission.effort && (
                      <span className="inline-flex items-center rounded-full bg-kinnso-cream2 px-2 py-0.5 text-xs font-bold text-kinnso-ink">
                        {effortBadgeLabel(t, mission.effort)}
                      </span>
                    )}
                  </div>
```

Do NOT touch the "Invitations" section's badge row (the one inside `{invitations.map((mission)
=> ...)}`) — it stays exactly as it is today, per the approved design's exact scope (effort
badge on "My missions" and "Available missions" only).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run kinnso.CreatorMissionsView -v`
Expected: still FAIL on the `'Low effort'`/`'High effort'` text lookups — `en.missions.
effortBadgeLabel` doesn't exist until Task 3 adds it (same staged-sequencing pattern R13.0
established for its own wizard/detail-page tasks). Confirm the failure is specifically a
missing-i18n-string issue: the third test (`'shows no effort badge...'`) should PASS already,
since it never depends on any new i18n string (it only asserts absence). If that third test
also fails for a reason other than the two positive-assertion tests, that would indicate a real
bug in your conditional rendering — investigate before committing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/pages/CreatorMissionsView.tsx apps/web/tests/kinnso.CreatorMissionsView.test.tsx
git commit -m "feat(web): render effort badge on the creator mission list (mission list effort badge)"
```

---

### Task 3: i18n — add `effortBadgeLabel` to the `missions` section across all 7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (the `Messages` interface's `missions` block, and
  the `en` object's `missions` literal)
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts` (`missions` literal)
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts` (`missions` literal)
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts` (`missions` literal)
- Modify: `apps/web/lib/i18n/messages/ja.ts` (`missions` literal)
- Modify: `apps/web/lib/i18n/messages/ko.ts` (`missions` literal)
- Modify: `apps/web/lib/i18n/messages/th.ts` (`missions` literal)
- Test: `apps/web/tests/i18n.locale-parity.test.ts` (existing, no changes needed)

**Reuse note:** every translated string below is character-for-character identical to R13.0's
`missionDetail.effortBadgeLabel`, added earlier for the detail page — only the section it lives
in differs (`missions` here, since that's the `t` prop `CreatorMissionsView.tsx` receives, not
`missionDetail`). Do not re-derive or alter the wording.

- [ ] **Step 1: Confirm the parity test currently passes (pre-change baseline)**

Run: `cd apps/web && npx vitest run i18n.locale-parity -v`
Expected: PASS.

- [ ] **Step 2: Widen the `Messages` interface in `en.ts`**

In `apps/web/lib/i18n/messages/en.ts`, add this field to the `missions` interface block, right
after `effortHigh: string` (immediately before that block's closing `}`):

```typescript
    effortBadgeLabel: (level: 'low' | 'medium' | 'high') => string
```

- [ ] **Step 3: Add the English translation to `en.ts`'s `en` object**

In the same file, add this to the `missions` object literal, right after `effortHigh: 'High',`
(immediately before that object's closing `},`):

```typescript
    effortBadgeLabel: (level) => (level === 'low' ? 'Low effort' : level === 'medium' ? 'Medium effort' : 'High effort'),
```

- [ ] **Step 4: Add the Traditional Chinese (Hong Kong) translation to `zh-hk.ts`**

In `apps/web/lib/i18n/messages/zh-hk.ts`, add to the `missions` object right after
`effortHigh: '高',` (before that object's closing `},`):

```typescript
    effortBadgeLabel: (level) => (level === 'low' ? '所需心機：低' : level === 'medium' ? '所需心機：中' : '所需心機：高'),
```

- [ ] **Step 5: Add the Traditional Chinese (Taiwan) translation to `zh-tw.ts`**

Add to `missions`, right after its `effortHigh` entry:

```typescript
    effortBadgeLabel: (level) => (level === 'low' ? '所需心力：低' : level === 'medium' ? '所需心力：中' : '所需心力：高'),
```

- [ ] **Step 6: Add the Simplified Chinese translation to `zh-cn.ts`**

Add to `missions`, right after its `effortHigh` entry:

```typescript
    effortBadgeLabel: (level) => (level === 'low' ? '所需精力：低' : level === 'medium' ? '所需精力：中' : '所需精力：高'),
```

- [ ] **Step 7: Add the Japanese translation to `ja.ts`**

Add to `missions`, right after its `effortHigh` entry:

```typescript
    effortBadgeLabel: (level) => (level === 'low' ? '負荷：低' : level === 'medium' ? '負荷：中' : '負荷：高'),
```

- [ ] **Step 8: Add the Korean translation to `ko.ts`**

Add to `missions`, right after its `effortHigh` entry:

```typescript
    effortBadgeLabel: (level) => (level === 'low' ? '노력: 낮음' : level === 'medium' ? '노력: 보통' : '노력: 높음'),
```

- [ ] **Step 9: Add the Thai translation to `th.ts`**

Add to `missions`, right after its `effortHigh` entry:

```typescript
    effortBadgeLabel: (level) => (level === 'low' ? 'ความพยายาม: น้อย' : level === 'medium' ? 'ความพยายาม: ปานกลาง' : 'ความพยายาม: มาก'),
```

- [ ] **Step 10: Run the full affected test suite**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run mission.queries studio.missions.host kinnso.CreatorMissionsView i18n.locale-parity -v`
Expected: PASS across the board — this is the point where Task 1's and Task 2's previously
deferred assertions go green.

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/i18n/messages/en.ts apps/web/lib/i18n/messages/zh-hk.ts apps/web/lib/i18n/messages/zh-tw.ts apps/web/lib/i18n/messages/zh-cn.ts apps/web/lib/i18n/messages/ja.ts apps/web/lib/i18n/messages/ko.ts apps/web/lib/i18n/messages/th.ts
git commit -m "i18n(web): add mission list effort badge label across all 7 locales"
```

---

### Task 4: Final holistic verification

**Files:** none (verification only)

- [ ] **Step 1: Full type check**

Run: `pnpm typecheck` (from repo root)
Expected: PASS, zero new errors (R13.0's own pre-existing state on this branch should already
be clean, since this branch is based on `feat/r13-0-mission-brief-richness` after all 11 of its
tasks landed).

- [ ] **Step 2: Full lint**

Run: `pnpm --filter web lint`
Expected: PASS, zero new warnings/errors.

- [ ] **Step 3: Full web test suite, scoped correctly**

Run: `cd apps/web && npx vitest run` (do NOT use `pnpm --filter web test -- <pattern>` — see
the vitest-scoping-gotcha memory, it runs the whole suite unscoped and can time out)
Expected: PASS. `*.rls.test.ts` files may fail/time out if no local Supabase stack is running —
expected per this repo's own testing note, not a regression to chase.

- [ ] **Step 4: Manually confirm the "Invitations" section was left untouched**

Run: `git diff feat/r13-0-mission-brief-richness..HEAD -- apps/web/components/kinnso/pages/CreatorMissionsView.tsx`
and visually confirm the diff touches only the "My missions" and "Available missions" sections'
badge rows (plus the type/import/helper additions near the top of the file) — the
`{invitations.map((mission) => ...)}` block should show zero changes. This directly verifies
the approved design's exact scope was honored, not silently expanded.

- [ ] **Step 5: No commit for this task** — it's verification-only. If Step 4 surfaces a real
  gap (e.g. the invitations section was accidentally touched), fix it as its own small
  follow-up commit with its own descriptive message.
