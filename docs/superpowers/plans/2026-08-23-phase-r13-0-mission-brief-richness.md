# Phase R13.0 — Mission Brief Richness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, richer brief to missions — deliverables, requirements, dos/don'ts,
key messages, reference links, and an effort estimate — collected in the merchant wizard and
displayed on the creator-facing mission detail page.

**Architecture:** One additive migration adds seven nullable/empty-default columns to
`missions`. The merchant wizard (`MissionPostWizard.tsx`) gains a mission-type-agnostic "Brief
details" section: six one-item-per-line textareas plus an effort select. The creator detail
page (`CreatorMissionDetailView.tsx`, fed by `lib/missions/detail.ts`) renders each populated
field as its own section. No mission editing exists today for any field, so these fields are
create-only, same as everything else on the mission.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres, TypeScript, Vitest 4,
`@testing-library/react`.

---

### Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/20260823090000_r13_0_mission_brief_richness.sql`
- Test: `apps/web/tests/db.r13-0-mission-brief-richness.test.ts`

- [ ] **Step 1: Write the failing migration-text-contract test**

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260823090000_r13_0_mission_brief_richness.sql'),
  'utf8',
)

describe('R13.0 mission brief richness schema', () => {
  it('adds six empty-array-default text[] columns for the brief lists', () => {
    expect(sql).toContain("add column deliverables text[] not null default '{}'")
    expect(sql).toContain("add column requirements text[] not null default '{}'")
    expect(sql).toContain("add column dos text[] not null default '{}'")
    expect(sql).toContain("add column donts text[] not null default '{}'")
    expect(sql).toContain("add column key_messages text[] not null default '{}'")
    expect(sql).toContain("add column reference_links text[] not null default '{}'")
  })

  it('adds a nullable effort enum constrained to low/medium/high', () => {
    expect(sql).toContain('add column effort text')
    expect(sql).toContain("check (effort in ('low', 'medium', 'high'))")
  })

  it('alters the existing missions table, not a new one', () => {
    expect(sql).toContain('alter table public.missions')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run db.r13-0-mission-brief-richness -v`
Expected: FAIL — the migration file doesn't exist yet, so `readFileSync` throws `ENOENT`.

- [ ] **Step 3: Write the migration**

```sql
-- R13.0: adds an optional, richer brief to missions -- deliverables, requirements, dos/don'ts,
-- key messages, reference links, and an effort estimate. Purely additive: every column is
-- nullable or empty-by-default, no existing mission is affected, and there is no backfill.
--
-- Field set matches the R10-R13 roadmap's R13.0 scope exactly, a deliberate subset of the
-- sibling Adfocate repo's migrations 0011_mission_brief.sql/0019_mission_brief_rich.sql --
-- Adfocate's `platforms` and `target_audience` columns are NOT ported (out of scope, see the
-- phase design doc's Decision 1).
--
-- effort is a nullable text CHECK enum (not numeric hours, not freeform), matching Adfocate's
-- 0011 exactly -- "unspecified" is a valid, common state, so it stays nullable with no default.

alter table public.missions
  add column deliverables text[] not null default '{}',
  add column requirements text[] not null default '{}',
  add column dos text[] not null default '{}',
  add column donts text[] not null default '{}',
  add column key_messages text[] not null default '{}',
  add column reference_links text[] not null default '{}',
  add column effort text check (effort in ('low', 'medium', 'high'));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run db.r13-0-mission-brief-richness -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260823090000_r13_0_mission_brief_richness.sql apps/web/tests/db.r13-0-mission-brief-richness.test.ts
git commit -m "feat(db): add mission brief richness columns (R13.0)"
```

---

### Task 2: Hand-add the new columns to generated DB types

**Files:**
- Modify: `packages/db/types.ts` (the `missions` table's `Row`/`Insert`/`Update` shapes, around
  line 2407 — search for `missions: {` under the `public: { Tables: {` block)

This project's convention (per CLAUDE.md and every prior phase) is to **never** run
`pnpm --filter @kinnso/db gen` against a live/unreset stack for an unmerged migration — it
reads production. The new columns are hand-added here instead, matching Task 1's migration
exactly. No test for this task; it's pure type-surface, verified by every later task's `tsc`
pass.

- [ ] **Step 1: Add the seven fields to the `missions` table's `Row` type**

In `packages/db/types.ts`, inside `missions: { Row: { ... } }`, insert these fields in
alphabetical order among the existing ones (the file keeps every table's fields alphabetized):

```typescript
          deliverables: string[]
```
(insert immediately before `ends_at: string | null` — alphabetically after `created_by_ops_member_id`/`creator_commission_rate` and before `ends_at`)

```typescript
          donts: string[]
          dos: string[]
          effort: string | null
```
(insert immediately after `deliverables` — alphabetical: `deliverables` < `donts` < `dos` < `effort` < `ends_at`)

```typescript
          key_messages: string[]
```
(insert immediately before `max_receipts_per_creator` — alphabetically after `kinnso_commission_rate`)

```typescript
          reference_links: string[]
          requirements: string[]
```
(insert immediately before `starts_at` — alphabetically after `published_at`)

The full `Row` block's new alphabetical order for the affected span becomes:
```typescript
          created_by_ops_member_id: string | null
          creator_commission_rate: number | null
          deliverables: string[]
          donts: string[]
          dos: string[]
          effort: string | null
          ends_at: string | null
          id: string
          key_messages: string[]
          kinnso_commission_rate: number | null
          max_receipts_per_creator: number | null
          merchant_profile_id: string | null
          min_tier: string | null
          mission_source: string
          mission_type: string
          paid_fee_amount: number | null
          paid_fee_currency: string | null
          published_at: string | null
          reference_links: string[]
          requirements: string[]
          starts_at: string | null
```

- [ ] **Step 2: Add the same seven fields to `Insert`, as optional**

In the same table's `Insert: { ... }` block, add (matching the same alphabetical span, each
marked optional with `?` since every column has a database default):

```typescript
          deliverables?: string[]
          donts?: string[]
          dos?: string[]
          effort?: string | null
          key_messages?: string[]
          reference_links?: string[]
          requirements?: string[]
```

- [ ] **Step 3: Add the same seven fields to `Update`, as optional**

In the same table's `Update: { ... }` block, add the identical seven lines from Step 2 (same
optional shape — `Update` and `Insert` are identical for every existing column on this table
too).

- [ ] **Step 4: Run the type checker to verify it compiles**

Run: `pnpm --filter @kinnso/db typecheck` (or `pnpm typecheck` from repo root if that package has
no standalone script — check `packages/db/package.json` first)
Expected: PASS, no new errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/types.ts
git commit -m "feat(db): hand-add mission brief richness columns to generated types (R13.0)"
```

---

### Task 3: Widen `MissionDraftInput` and the mission draft fixture

**Files:**
- Modify: `apps/web/lib/missions/types.ts:56-73` (the `MissionDraftInput` type)
- Modify: `apps/web/tests/fixtures/missionDraft.ts`
- Test: `apps/web/tests/mission.validation.test.ts:12-29` (the local `base` fixture — updated
  in this task since it's a plain literal, not imported from `fixtures/missionDraft.ts`)

- [ ] **Step 1: Add the `MissionEffort` type and widen `MissionDraftInput`**

In `apps/web/lib/missions/types.ts`, add near the other exported const-array/type pairs (e.g.
right after `missionVisibilities`/`MissionVisibility` around line 11-13):

```typescript
export const missionEfforts = ['low', 'medium', 'high'] as const

export type MissionEffort = (typeof missionEfforts)[number]
```

Then widen `MissionDraftInput` (currently ending `milestones: MissionMilestoneInput[]` on line
72):

```typescript
export type MissionDraftInput = {
  missionSource: MissionSource
  missionType: MissionType
  visibility: MissionVisibility
  title: string
  summary: string
  couponCode: string | null
  couponUrl: string | null
  affiliateCommissionRate: number | null
  kinnsoCommissionRate: number | null
  creatorCommissionRate: number | null
  paidFeeAmount: number | null
  paidFeeCurrency: string | null
  affiliateNetworkProgramId: string | null
  minTier: GatedTier | null
  maxReceiptsPerCreator: number | null
  milestones: MissionMilestoneInput[]
  deliverables: string[]
  requirements: string[]
  dos: string[]
  donts: string[]
  keyMessages: string[]
  referenceLinks: string[]
  effort: MissionEffort | null
}
```

- [ ] **Step 2: Update the shared fixture**

In `apps/web/tests/fixtures/missionDraft.ts`, add the seven new fields to
`missionDraftFixture` (after `milestones`):

```typescript
import type { MissionDraftInput } from '@/lib/missions/types'

export const missionDraftFixture: MissionDraftInput = {
  missionSource: 'merchant',
  missionType: 'coupon_affiliate',
  visibility: 'open',
  title: 'Hong Kong staycation coupon',
  summary: 'Promote a weekend staycation discount.',
  couponCode: 'STAY10',
  couponUrl: 'https://merchant.test/staycation',
  affiliateCommissionRate: 10,
  kinnsoCommissionRate: 4,
  creatorCommissionRate: 6,
  paidFeeAmount: null,
  paidFeeCurrency: null,
  affiliateNetworkProgramId: null,
  minTier: null,
  maxReceiptsPerCreator: null,
  milestones: [{ title: 'Publish post', description: 'Share one post with the tracked link.' }],
  deliverables: [],
  requirements: [],
  dos: [],
  donts: [],
  keyMessages: [],
  referenceLinks: [],
  effort: null,
}
```

- [ ] **Step 3: Update `mission.validation.test.ts`'s independent `base` fixture**

This file (unlike `mission.actions.test.ts`) defines its own literal, not the shared fixture.
In `apps/web/tests/mission.validation.test.ts`, widen the `base` object (currently ending
`milestones: [...]` on line 28):

```typescript
const base: MissionDraftInput = {
  missionSource: 'merchant',
  missionType: 'coupon_affiliate',
  visibility: 'open',
  title: 'Tokyo ramen coupon campaign',
  summary: 'Share the spring ramen coupon with travel food followers.',
  couponCode: 'RAMEN10',
  couponUrl: 'https://example.com/ramen',
  affiliateCommissionRate: 12,
  kinnsoCommissionRate: 4,
  creatorCommissionRate: 8,
  paidFeeAmount: null,
  paidFeeCurrency: null,
  affiliateNetworkProgramId: null,
  minTier: null,
  maxReceiptsPerCreator: null,
  milestones: [{ title: 'Share coupon post', description: 'Post one IG reel or Threads post.' }],
  deliverables: [],
  requirements: [],
  dos: [],
  donts: [],
  keyMessages: [],
  referenceLinks: [],
  effort: null,
}
```

- [ ] **Step 4: Run the type checker and existing mission tests to verify nothing broke**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run mission.validation mission.actions -v`
Expected: PASS — this task only widens a type and its two literal instantiations, no behavior
changed yet.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/types.ts apps/web/tests/fixtures/missionDraft.ts apps/web/tests/mission.validation.test.ts
git commit -m "feat(web): widen MissionDraftInput with brief richness fields (R13.0)"
```

---

### Task 4: Validate reference links

**Files:**
- Modify: `apps/web/lib/missions/validation.ts`
- Test: `apps/web/tests/mission.validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/tests/mission.validation.test.ts` (inside the existing
`describe('mission validation', ...)` block):

```typescript
  it('accepts a draft with valid http(s) reference links', () => {
    const result = validateMissionDraft({
      ...base,
      referenceLinks: ['https://example.com/brand-guide', 'http://example.com/logo.png'],
    })
    expect(result).toEqual({ ok: true, errors: {} })
  })

  it('accepts a draft with no reference links at all', () => {
    expect(validateMissionDraft({ ...base, referenceLinks: [] })).toEqual({ ok: true, errors: {} })
  })

  it('rejects a draft with a non-URL reference link', () => {
    const result = validateMissionDraft({
      ...base,
      referenceLinks: ['https://example.com/brand-guide', 'not a url'],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.referenceLinks).toContain('url')
  })

  it('rejects a reference link with a non-http(s) scheme', () => {
    const result = validateMissionDraft({
      ...base,
      referenceLinks: ['ftp://example.com/file'],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.referenceLinks).toContain('url')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run mission.validation -v`
Expected: FAIL — `validateMissionDraft` doesn't check `referenceLinks` yet, so the two
"rejects" tests get `{ ok: true, errors: {} }` instead of an error.

- [ ] **Step 3: Implement the validation**

In `apps/web/lib/missions/validation.ts`, add a new helper near the existing
`isAbsoluteHttpsUrl` (this one allows both `http:` and `https:`, matching the design doc's
"http(s)" requirement — `isAbsoluteHttpsUrl` itself stays untouched, it's used elsewhere for a
stricter https-only check):

```typescript
const isAbsoluteHttpUrl = (value: string) => {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
```

Then, inside `validateMissionDraft`, add this block right after the existing milestones check
(after the `if (input.missionType === 'paid' || input.missionType === 'hybrid') { ... }` block,
before the `maxReceiptsPerCreator` check):

```typescript
  if (input.referenceLinks.some((link) => !isAbsoluteHttpUrl(link))) {
    addError(errors, 'referenceLinks', 'url')
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run mission.validation -v`
Expected: PASS (all tests in the file, including the 4 new ones)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/validation.ts apps/web/tests/mission.validation.test.ts
git commit -m "feat(web): validate mission reference links are http(s) URLs (R13.0)"
```

---

### Task 5: Pass brief fields through to the mission insert

**Files:**
- Modify: `apps/web/lib/missions/actions.ts:160-187` (`buildMissionInsert`)
- Test: `apps/web/tests/mission.actions.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/tests/mission.actions.test.ts`, inside `describe('mission actions builders',
...)`, right after the existing `'builds a mission insert payload from a valid merchant
draft'` test:

```typescript
  it('carries the brief richness fields into the mission insert payload', () => {
    const payload = buildMissionInsert({
      input: {
        ...missionDraftFixture,
        deliverables: ['Instagram Reel', 'Blog post'],
        requirements: ['Tag @merchant'],
        dos: ['Show the storefront'],
        donts: ['Do not disparage competitors'],
        keyMessages: ['Family-friendly staycation'],
        referenceLinks: ['https://merchant.test/brand-guide'],
        effort: 'medium',
      },
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: false,
    })
    expect(payload).toMatchObject({
      deliverables: ['Instagram Reel', 'Blog post'],
      requirements: ['Tag @merchant'],
      dos: ['Show the storefront'],
      donts: ['Do not disparage competitors'],
      key_messages: ['Family-friendly staycation'],
      reference_links: ['https://merchant.test/brand-guide'],
      effort: 'medium',
    })
  })

  it('carries empty brief richness arrays and a null effort through unchanged', () => {
    const payload = buildMissionInsert({
      input: missionDraftFixture,
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: false,
    })
    expect(payload).toMatchObject({
      deliverables: [],
      requirements: [],
      dos: [],
      donts: [],
      key_messages: [],
      reference_links: [],
      effort: null,
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run mission.actions -v`
Expected: FAIL — `payload.deliverables` etc. are `undefined`, `toMatchObject` fails.

- [ ] **Step 3: Implement**

In `apps/web/lib/missions/actions.ts`, widen `buildMissionInsert`'s return object (currently
ending `max_receipts_per_creator: draft.maxReceiptsPerCreator,` on line 185):

```typescript
export function buildMissionInsert({
  input: draft,
  merchantProfileId,
  opsMemberId,
  publish,
}: BuildMissionInsertInput): MissionInsert {
  return {
    merchant_profile_id: merchantProfileId,
    created_by_ops_member_id: opsMemberId,
    mission_source: draft.missionSource,
    mission_type: draft.missionType,
    visibility: draft.visibility,
    status: publish ? 'published' : 'draft',
    published_at: publish ? new Date().toISOString() : null,
    title: draft.title,
    summary: draft.summary,
    coupon_code: draft.couponCode,
    coupon_url: draft.couponUrl,
    affiliate_commission_rate: draft.affiliateCommissionRate,
    kinnso_commission_rate: draft.kinnsoCommissionRate,
    creator_commission_rate: draft.creatorCommissionRate,
    paid_fee_amount: draft.paidFeeAmount,
    paid_fee_currency: draft.paidFeeCurrency,
    affiliate_network_program_id: draft.affiliateNetworkProgramId,
    min_tier: draft.minTier,
    max_receipts_per_creator: draft.maxReceiptsPerCreator,
    deliverables: draft.deliverables,
    requirements: draft.requirements,
    dos: draft.dos,
    donts: draft.donts,
    key_messages: draft.keyMessages,
    reference_links: draft.referenceLinks,
    effort: draft.effort,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run mission.actions -v`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/actions.ts apps/web/tests/mission.actions.test.ts
git commit -m "feat(web): pass brief richness fields into the mission insert payload (R13.0)"
```

---

### Task 6: Merchant wizard — Brief details section

**Files:**
- Modify: `apps/web/components/kinnso/pages/MissionPostWizard.tsx`
- Test: `apps/web/tests/kinnso.MissionPostWizard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/tests/kinnso.MissionPostWizard.test.tsx`, inside `describe('MissionPostWizard',
...)`:

```typescript
  it('shows the brief details section for every mission type', () => {
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(en.missions.deliverablesLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.requirementsLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.dosLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.dontsLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.keyMessagesLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.referenceLinksLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.effortLabel)).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: en.missions.typeReceiptCashback }))
    expect(screen.getByLabelText(en.missions.deliverablesLabel)).toBeTruthy()
  })

  it('splits one-item-per-line brief textareas into arrays on submit, dropping blank lines', () => {
    const onSubmit = vi.fn()
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('radio', { name: en.missions.typeCoupon }))
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Ramen coupon' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Promote the ramen coupon.' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'RAMEN10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com' } })
    fireEvent.change(
      screen.getByLabelText(en.missions.deliverablesLabel),
      { target: { value: 'Instagram Reel\n\nBlog post\n' } },
    )
    fireEvent.change(
      screen.getByLabelText(en.missions.referenceLinksLabel),
      { target: { value: 'https://merchant.test/brand-guide' } },
    )
    fireEvent.change(screen.getByLabelText(en.missions.effortLabel), { target: { value: 'medium' } })
    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        deliverables: ['Instagram Reel', 'Blog post'],
        referenceLinks: ['https://merchant.test/brand-guide'],
        effort: 'medium',
      }),
      { publish: false },
    )
  })

  it('defaults brief richness fields to empty arrays and a null effort when left blank', () => {
    const onSubmit = vi.fn()
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('radio', { name: en.missions.typeCoupon }))
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Ramen coupon' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Promote the ramen coupon.' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'RAMEN10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        deliverables: [], requirements: [], dos: [], donts: [], keyMessages: [], referenceLinks: [],
        effort: null,
      }),
      { publish: false },
    )
  })

  it('blocks submit with an invalid reference link', () => {
    const onSubmit = vi.fn()
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('radio', { name: en.missions.typeCoupon }))
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Ramen coupon' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Promote the ramen coupon.' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'RAMEN10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com' } })
    fireEvent.change(screen.getByLabelText(en.missions.referenceLinksLabel), { target: { value: 'not a url' } })
    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))
    expect(screen.getByRole('alert')).toHaveTextContent(en.missions.validationError)
    expect(onSubmit).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run kinnso.MissionPostWizard -v`
Expected: FAIL — none of the new labels/fields exist yet in the component, and `en.missions`
doesn't have these keys yet either (that's Task 10 — for now these tests fail on the missing
component fields; TypeScript will also flag the missing `en.missions.*` keys once Task 10 adds
them to the `Messages` interface, so run this task's tests with the interface not yet
requiring them — the component reads `t.deliverablesLabel` etc. via plain property access,
which fails at runtime with `undefined` label text before Task 10, which is enough for
`getByLabelText` to fail to match).

- [ ] **Step 3: Implement the Brief details section**

In `apps/web/components/kinnso/pages/MissionPostWizard.tsx`, add state (after the existing
`milestoneDescription` state on line 61):

```typescript
  const [deliverables, setDeliverables] = useState('')
  const [requirements, setRequirements] = useState('')
  const [dos, setDos] = useState('')
  const [donts, setDonts] = useState('')
  const [keyMessages, setKeyMessages] = useState('')
  const [referenceLinks, setReferenceLinks] = useState('')
  const [effort, setEffort] = useState<'' | MissionEffort>('')
```

Add the import for `MissionEffort` alongside the existing type imports (line 7-11):

```typescript
import type {
  MissionDraftInput,
  MissionEffort,
  MissionType,
  MissionVisibility,
} from '@/lib/missions/types'
```

Add a line-splitting helper near the existing `numberOrNull`/`textOrNull` helpers (line 32-36):

```typescript
const linesToArray = (value: string): string[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
```

Widen `buildInput()` (currently ending its object with the `milestones` field on line 93):

```typescript
  const buildInput = (): MissionDraftInput => ({
    missionSource: 'merchant',
    missionType,
    visibility,
    title,
    summary,
    couponCode: includesCoupon ? textOrNull(couponCode) : null,
    couponUrl: includesCoupon ? textOrNull(couponUrl) : null,
    affiliateCommissionRate: includesCoupon ? numberOrNull(affiliateCommissionRate) : null,
    kinnsoCommissionRate: includesCoupon ? numberOrNull(kinnsoCommissionRate) : null,
    creatorCommissionRate: includesCoupon ? numberOrNull(creatorCommissionRate) : null,
    paidFeeAmount: includesFeeAmount ? numberOrNull(paidFeeAmount) : null,
    paidFeeCurrency: includesFeeAmount ? textOrNull(paidFeeCurrency) : null,
    affiliateNetworkProgramId: null,
    minTier: minTier === 'open' ? null : minTier,
    maxReceiptsPerCreator: isReceiptCashback ? numberOrNull(maxReceiptsPerCreator) : null,
    // receipt_cashback missions get their single repeatable milestone auto-created by a DB
    // trigger at mission-insert time, so no milestone is collected here for that type.
    milestones: includesPaid && milestoneTitle.trim() !== ''
      ? [{ title: milestoneTitle, description: milestoneDescription.trim() || milestoneTitle }]
      : [],
    deliverables: linesToArray(deliverables),
    requirements: linesToArray(requirements),
    dos: linesToArray(dos),
    donts: linesToArray(donts),
    keyMessages: linesToArray(keyMessages),
    referenceLinks: linesToArray(referenceLinks),
    effort: effort === '' ? null : effort,
  })
```

Add the "Brief details" section to the form JSX, mission-type-agnostic, right after the
existing min-tier `<fieldset>` closes (after line 247, before the `{includesCoupon && (...)}`
block on line 249):

```tsx
        <fieldset className="grid gap-3 rounded-lg bg-kinnso-cream px-4 py-4">
          <legend className="text-sm font-semibold text-kinnso-ink">{t.briefDetailsHeading}</legend>
          <p className="text-xs text-kinnso-muted">{t.briefListHint}</p>
          <label className={fieldShell}>
            {t.deliverablesLabel}
            <textarea
              className={`${inputShell} min-h-20 resize-y`}
              value={deliverables}
              onChange={(event) => setDeliverables(event.target.value)}
            />
          </label>
          <label className={fieldShell}>
            {t.requirementsLabel}
            <textarea
              className={`${inputShell} min-h-20 resize-y`}
              value={requirements}
              onChange={(event) => setRequirements(event.target.value)}
            />
          </label>
          <label className={fieldShell}>
            {t.dosLabel}
            <textarea
              className={`${inputShell} min-h-20 resize-y`}
              value={dos}
              onChange={(event) => setDos(event.target.value)}
            />
          </label>
          <label className={fieldShell}>
            {t.dontsLabel}
            <textarea
              className={`${inputShell} min-h-20 resize-y`}
              value={donts}
              onChange={(event) => setDonts(event.target.value)}
            />
          </label>
          <label className={fieldShell}>
            {t.keyMessagesLabel}
            <textarea
              className={`${inputShell} min-h-20 resize-y`}
              value={keyMessages}
              onChange={(event) => setKeyMessages(event.target.value)}
            />
          </label>
          <label className={fieldShell}>
            {t.referenceLinksLabel}
            <textarea
              className={`${inputShell} min-h-20 resize-y`}
              value={referenceLinks}
              onChange={(event) => setReferenceLinks(event.target.value)}
            />
          </label>
          <label className={fieldShell}>
            {t.effortLabel}
            <select
              className={inputShell}
              value={effort}
              onChange={(event) => setEffort(event.target.value as '' | MissionEffort)}
            >
              <option value="">{t.effortUnset}</option>
              <option value="low">{t.effortLow}</option>
              <option value="medium">{t.effortMedium}</option>
              <option value="high">{t.effortHigh}</option>
            </select>
          </label>
        </fieldset>

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run kinnso.MissionPostWizard -v`
Expected: still FAIL on the label-text lookups until Task 10 adds the real `en.missions.*`
strings — this is expected mid-task-sequence breakage in a TDD plan that spans multiple files;
proceed to Task 10 before treating this task as complete. (If running tasks strictly in order
via subagent-driven-development, note this dependency explicitly to the task-6 implementer:
this task's tests will only go fully green after Task 10 lands. Task 6's own commit should
still happen now — the component code is correct and self-contained — with the test file
committed alongside it; final green confirmation happens at Task 10.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/pages/MissionPostWizard.tsx apps/web/tests/kinnso.MissionPostWizard.test.tsx
git commit -m "feat(web): add Brief details section to the mission post wizard (R13.0)"
```

---

### Task 7: Widen the creator mission detail query

**Files:**
- Modify: `apps/web/lib/missions/queries.ts:88-100` (`creatorMissionDetailSelect`)
- Test: `apps/web/tests/mission.queries.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/tests/mission.queries.test.ts`, near the existing
`expect(creatorMissionDetailSelect).toContain('min_tier')` assertion (same `describe` block):

```typescript
  it('selects the brief richness columns', () => {
    expect(creatorMissionDetailSelect).toContain('deliverables')
    expect(creatorMissionDetailSelect).toContain('requirements')
    expect(creatorMissionDetailSelect).toContain('dos')
    expect(creatorMissionDetailSelect).toContain('donts')
    expect(creatorMissionDetailSelect).toContain('key_messages')
    expect(creatorMissionDetailSelect).toContain('reference_links')
    expect(creatorMissionDetailSelect).toContain('effort')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run mission.queries -v`
Expected: FAIL — none of these column names are in the select string yet.

- [ ] **Step 3: Implement**

In `apps/web/lib/missions/queries.ts`, widen `creatorMissionDetailSelect`'s flat column list
(currently `id,title,summary,mission_source,mission_type,visibility,status,published_at,
min_tier,coupon_code,coupon_url,affiliate_commission_rate,creator_commission_rate,
kinnso_commission_rate,paid_fee_amount,paid_fee_currency,affiliate_network_program_id,
max_receipts_per_creator,` on lines 89-91):

```typescript
export const creatorMissionDetailSelect = `
  id,title,summary,mission_source,mission_type,visibility,status,published_at,min_tier,
  coupon_code,coupon_url,affiliate_commission_rate,creator_commission_rate,kinnso_commission_rate,
  paid_fee_amount,paid_fee_currency,affiliate_network_program_id,max_receipts_per_creator,
  deliverables,requirements,dos,donts,key_messages,reference_links,effort,
  affiliate_network_programs(id,program_name,program_url,default_commission_description,status),
  mission_milestones(id,title,description,due_at,sort_order,repeatable),
  mission_participants(id,status,source,creator_id,application_note,
    mission_milestone_submissions(id,mission_milestone_id,status,proof_urls,notes,merchant_feedback,submitted_at,
      mission_social_snapshots(confidence_status),
      mission_verification_jobs(id,status,confidence_status,created_at),
      mission_review_events(reason_category,reason_text,action,created_at))),
  affiliate_partner_links(id,partner_url,original_url,sub_id)
`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run mission.queries -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/queries.ts apps/web/tests/mission.queries.test.ts
git commit -m "feat(web): select brief richness columns for the creator mission detail page (R13.0)"
```

---

### Task 8: Map brief richness fields onto `CreatorMissionDetail`

**Files:**
- Modify: `apps/web/lib/missions/detail.ts`
- Test: `apps/web/tests/mission.detail.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/tests/mission.detail.test.ts`, in a new `describe` block (place it after the
existing `describe('buildMilestoneRows', ...)` block):

```typescript
describe('toCreatorMissionDetail brief richness mapping', () => {
  const rowWithBrief: MissionDetailRow = {
    id: 'm1', title: 'T', summary: 'S',
    mission_source: 'merchant', mission_type: 'paid', status: 'published',
    coupon_code: null, coupon_url: null,
    paid_fee_amount: 5000, paid_fee_currency: 'HKD',
    affiliate_commission_rate: null, creator_commission_rate: null, kinnso_commission_rate: null,
    deliverables: ['Instagram Reel'], requirements: ['Tag @merchant'],
    dos: ['Show the storefront'], donts: ['Do not disparage competitors'],
    key_messages: ['Family-friendly staycation'], reference_links: ['https://merchant.test/brand-guide'],
    effort: 'medium',
    mission_milestones: [], mission_participants: [], affiliate_partner_links: [],
  }

  it('maps populated brief richness fields straight through', () => {
    const detail = toCreatorMissionDetail(rowWithBrief, 'creator-1')
    expect(detail.deliverables).toEqual(['Instagram Reel'])
    expect(detail.requirements).toEqual(['Tag @merchant'])
    expect(detail.dos).toEqual(['Show the storefront'])
    expect(detail.donts).toEqual(['Do not disparage competitors'])
    expect(detail.keyMessages).toEqual(['Family-friendly staycation'])
    expect(detail.referenceLinks).toEqual(['https://merchant.test/brand-guide'])
    expect(detail.effort).toBe('medium')
  })

  it('defaults missing/null brief richness fields to empty arrays and a null effort', () => {
    const { deliverables, requirements, dos, donts, key_messages, reference_links, effort, ...rest } = rowWithBrief
    const detail = toCreatorMissionDetail(
      { ...rest, deliverables: null, requirements: null, dos: null, donts: null, key_messages: null, reference_links: null, effort: null },
      'creator-1',
    )
    expect(detail.deliverables).toEqual([])
    expect(detail.requirements).toEqual([])
    expect(detail.dos).toEqual([])
    expect(detail.donts).toEqual([])
    expect(detail.keyMessages).toEqual([])
    expect(detail.referenceLinks).toEqual([])
    expect(detail.effort).toBeNull()
  })

  it('treats an unrecognized effort value as null rather than passing it through', () => {
    const detail = toCreatorMissionDetail({ ...rowWithBrief, effort: 'urgent' }, 'creator-1')
    expect(detail.effort).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run mission.detail -v`
Expected: FAIL — TypeScript compile error first (`MissionDetailRow` has no `deliverables`
field etc.), then once the type is widened in Step 3, the mapping assertions fail because
`toCreatorMissionDetail` doesn't read these fields yet.

- [ ] **Step 3: Implement**

In `apps/web/lib/missions/detail.ts`, widen `MissionDetailRow` (currently ending
`affiliate_partner_links?: Array<{ id: string; partner_url: string | null }> | null` on line
63):

```typescript
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
  max_receipts_per_creator?: number | null
  deliverables?: string[] | null
  requirements?: string[] | null
  dos?: string[] | null
  donts?: string[] | null
  key_messages?: string[] | null
  reference_links?: string[] | null
  effort?: string | null
  affiliate_network_programs?: ProgramRef | ProgramRef[] | null
  mission_milestones?: Array<{ id: string; title: string | null; description: string | null; due_at: string | null; sort_order: number | null; repeatable?: boolean | null }> | null
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
```

Widen `CreatorMissionDetail` (currently ending `receiptSubmissions: ReceiptSubmissionRow[]` on
line 108):

```typescript
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
  participantId: string | null
  participantStatus: string | null
  cta: ParticipationCta
  milestones: MilestoneRow[]
  maxReceiptsPerCreator: number | null
  receiptSubmissions: ReceiptSubmissionRow[]
  deliverables: string[]
  requirements: string[]
  dos: string[]
  donts: string[]
  keyMessages: string[]
  referenceLinks: string[]
  effort: 'low' | 'medium' | 'high' | null
}
```

Add an effort-narrowing helper near the other small helpers (e.g. right before
`toCreatorMissionDetail`):

```typescript
const MISSION_EFFORTS = new Set(['low', 'medium', 'high'])

const narrowEffort = (effort: string | null | undefined): 'low' | 'medium' | 'high' | null =>
  effort != null && MISSION_EFFORTS.has(effort) ? (effort as 'low' | 'medium' | 'high') : null
```

Widen `toCreatorMissionDetail`'s returned object (currently ending with the
`receiptSubmissions: buildReceiptSubmissions(...)` call on lines 282-285):

```typescript
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
    participantId: participant?.id ?? null,
    participantStatus: participant?.status ?? null,
    cta: resolveParticipationCta(participant?.status ?? null, missionType),
    milestones: buildMilestoneRows(
      row.mission_milestones,
      participant?.mission_milestone_submissions ?? null,
      participant?.status ?? null,
    ),
    maxReceiptsPerCreator: row.max_receipts_per_creator ?? null,
    receiptSubmissions: buildReceiptSubmissions(
      row.mission_milestones,
      participant?.mission_milestone_submissions ?? null,
    ),
    deliverables: row.deliverables ?? [],
    requirements: row.requirements ?? [],
    dos: row.dos ?? [],
    donts: row.donts ?? [],
    keyMessages: row.key_messages ?? [],
    referenceLinks: row.reference_links ?? [],
    effort: narrowEffort(row.effort),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run mission.detail -v`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/detail.ts apps/web/tests/mission.detail.test.ts
git commit -m "feat(web): map brief richness fields onto CreatorMissionDetail (R13.0)"
```

---

### Task 9: Render the brief richness sections on the creator detail page

**Files:**
- Modify: `apps/web/components/kinnso/pages/CreatorMissionDetailView.tsx`
- Test: `apps/web/tests/kinnso.CreatorMissionDetailView.test.tsx`

- [ ] **Step 1: Widen the existing `base` fixture**

`apps/web/tests/kinnso.CreatorMissionDetailView.test.tsx` already defines a `base:
CreatorMissionDetail` const (around line 33), which `activeMissionWithMilestone()` and other
helpers in the file derive from via spread. Widen it with the seven new required fields —
TypeScript will otherwise flag this literal once `CreatorMissionDetail` is widened in Task 8:

```typescript
const base: CreatorMissionDetail = {
  id: 'm1', title: 'Summer in Shibuya', summary: 'Make a reel.', missionSource: 'merchant',
  missionType: 'paid', status: 'published', compensation: 'HKD 5000', couponCode: null, couponUrl: null,
  partnerLinks: [], participantId: null, participantStatus: null, cta: 'apply',
  milestones: [baseMilestone], maxReceiptsPerCreator: null, receiptSubmissions: [],
  deliverables: [], requirements: [], dos: [], donts: [], keyMessages: [], referenceLinks: [], effort: null,
}
```

- [ ] **Step 2: Write the failing tests**

Add to `apps/web/tests/kinnso.CreatorMissionDetailView.test.tsx`, spreading the file's existing
`base` fixture from Step 1:

```typescript
  it('renders each populated brief richness section with a heading', () => {
    render(
      <CreatorMissionDetailView
        locale="en" t={en.missionDetail}
        mission={{
          ...base,
          deliverables: ['Instagram Reel', 'Blog post'],
          requirements: ['Tag @merchant'],
          dos: ['Show the storefront'],
          donts: ['Do not disparage competitors'],
          keyMessages: ['Family-friendly staycation'],
          referenceLinks: ['https://merchant.test/brand-guide'],
          effort: 'medium',
        }}
        onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()}
      />,
    )
    expect(screen.getByText(en.missionDetail.deliverablesHeading)).toBeTruthy()
    expect(screen.getByText('Instagram Reel')).toBeTruthy()
    expect(screen.getByText('Blog post')).toBeTruthy()
    expect(screen.getByText(en.missionDetail.requirementsHeading)).toBeTruthy()
    expect(screen.getByText(en.missionDetail.dosHeading)).toBeTruthy()
    expect(screen.getByText(en.missionDetail.dontsHeading)).toBeTruthy()
    expect(screen.getByText(en.missionDetail.keyMessagesHeading)).toBeTruthy()
    expect(screen.getByText(en.missionDetail.referenceLinksHeading)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'https://merchant.test/brand-guide' })).toHaveAttribute(
      'href', 'https://merchant.test/brand-guide',
    )
    expect(screen.getByText(en.missionDetail.effortBadgeLabel('medium'))).toBeTruthy()
  })

  it('renders no brief richness sections when every field is empty', () => {
    render(
      <CreatorMissionDetailView
        locale="en" t={en.missionDetail}
        mission={base}
        onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()}
      />,
    )
    expect(screen.queryByText(en.missionDetail.deliverablesHeading)).toBeNull()
    expect(screen.queryByText(en.missionDetail.requirementsHeading)).toBeNull()
    expect(screen.queryByText(en.missionDetail.dosHeading)).toBeNull()
    expect(screen.queryByText(en.missionDetail.dontsHeading)).toBeNull()
    expect(screen.queryByText(en.missionDetail.keyMessagesHeading)).toBeNull()
    expect(screen.queryByText(en.missionDetail.referenceLinksHeading)).toBeNull()
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run kinnso.CreatorMissionDetailView -v`
Expected: FAIL — none of these sections/headings exist in the component yet.

- [ ] **Step 4: Implement**

In `apps/web/components/kinnso/pages/CreatorMissionDetailView.tsx`, add the effort badge next
to the existing `MissionStatusBadge` in the header (currently lines 219-222):

```tsx
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-3xl font-black text-kinnso-ink">{mission.title}</h1>
        <div className="flex flex-none items-center gap-2">
          <MissionStatusBadge status={mission.participantStatus ?? mission.status} />
          {mission.effort && (
            <span className="inline-flex rounded-pill bg-kinnso-cream2 px-2.5 py-1 text-xs font-semibold text-kinnso-ink">
              {t.effortBadgeLabel(mission.effort)}
            </span>
          )}
        </div>
      </div>
```

Add the six new sections right after the existing Brief `<section>` closes (after line 236,
before the `{lockedTier && ...}` block on line 238):

```tsx
      {mission.deliverables.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.deliverablesHeading}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-kinnso-muted">
            {mission.deliverables.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </section>
      )}

      {mission.requirements.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.requirementsHeading}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-kinnso-muted">
            {mission.requirements.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </section>
      )}

      {mission.dos.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.dosHeading}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-kinnso-muted">
            {mission.dos.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </section>
      )}

      {mission.donts.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.dontsHeading}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-kinnso-muted">
            {mission.donts.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </section>
      )}

      {mission.keyMessages.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.keyMessagesHeading}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-kinnso-muted">
            {mission.keyMessages.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </section>
      )}

      {mission.referenceLinks.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.referenceLinksHeading}</h2>
          <ul className="mt-2 space-y-1">
            {mission.referenceLinks.map((link, index) => (
              <li key={index} className="truncate text-sm">
                <a href={link} className="text-kinnso-blue underline" target="_blank" rel="noreferrer">
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run kinnso.CreatorMissionDetailView -v`
Expected: still FAIL on the text-lookup assertions until Task 10 adds the real
`en.missionDetail.*` strings — same cross-task dependency noted in Task 6. Commit this task's
component/test code now; final green confirmation happens at Task 10.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/pages/CreatorMissionDetailView.tsx apps/web/tests/kinnso.CreatorMissionDetailView.test.tsx
git commit -m "feat(web): render brief richness sections on the creator mission detail page (R13.0)"
```

---

### Task 10: i18n — add strings to all 7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (both the `Messages` interface, `missions` section
  around line 657-718 and `missionDetail` section around line 719-764, AND the `en` object's
  own `missions`/`missionDetail` literals around line 1842-1948)
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts` (`missions`/`missionDetail` literals, around
  line 378-483)
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts` (same two sections)
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts` (same two sections)
- Modify: `apps/web/lib/i18n/messages/ja.ts` (same two sections)
- Modify: `apps/web/lib/i18n/messages/ko.ts` (same two sections)
- Modify: `apps/web/lib/i18n/messages/th.ts` (same two sections)
- Test: `apps/web/tests/i18n.locale-parity.test.ts` (existing, no changes needed — it walks
  every key automatically)

- [ ] **Step 1: Confirm the parity test currently passes (pre-change baseline)**

Run: `cd apps/web && npx vitest run i18n.locale-parity -v`
Expected: PASS — this establishes the baseline before adding keys.

- [ ] **Step 2: Widen the `Messages` interface in `en.ts`**

In `apps/web/lib/i18n/messages/en.ts`, add these 14 fields to the `missions` interface block,
right after `fundedBadge: string` (line 717, immediately before the closing `}` on line 718):

```typescript
    briefDetailsHeading: string
    briefListHint: string
    deliverablesLabel: string
    requirementsLabel: string
    dosLabel: string
    dontsLabel: string
    keyMessagesLabel: string
    referenceLinksLabel: string
    referenceLinksInvalidError: string
    effortLabel: string
    effortUnset: string
    effortLow: string
    effortMedium: string
    effortHigh: string
```

Add these 7 fields to the `missionDetail` interface block, right after
`receiptReasonOther: string` (line 763, immediately before the closing `}` on line 764):

```typescript
    deliverablesHeading: string
    requirementsHeading: string
    dosHeading: string
    dontsHeading: string
    keyMessagesHeading: string
    referenceLinksHeading: string
    effortBadgeLabel: (level: 'low' | 'medium' | 'high') => string
```

- [ ] **Step 3: Add the English translations to `en.ts`'s `en` object**

In the same file, add these to the `missions` object literal, right after `fundedBadge:
'Funded',` (line 1901, before the closing `},` on line 1902):

```typescript
    briefDetailsHeading: 'Brief details (optional)',
    briefListHint: 'One item per line',
    deliverablesLabel: 'Deliverables',
    requirementsLabel: 'Requirements',
    dosLabel: "Do's",
    dontsLabel: "Don'ts",
    keyMessagesLabel: 'Key messages',
    referenceLinksLabel: 'Reference links',
    referenceLinksInvalidError: 'Each reference link must be a valid web address (starting with http:// or https://).',
    effortLabel: 'Effort',
    effortUnset: 'Not specified',
    effortLow: 'Low',
    effortMedium: 'Medium',
    effortHigh: 'High',
```

Add these to the `missionDetail` object literal, right after `receiptReasonOther: 'Other',`
(line 1947, before the closing `},` on line 1948):

```typescript
    deliverablesHeading: 'Deliverables',
    requirementsHeading: 'Requirements',
    dosHeading: "Do's",
    dontsHeading: "Don'ts",
    keyMessagesHeading: 'Key messages',
    referenceLinksHeading: 'Reference links',
    effortBadgeLabel: (level) => (level === 'low' ? 'Low effort' : level === 'medium' ? 'Medium effort' : 'High effort'),
```

- [ ] **Step 4: Add the Traditional Chinese (Hong Kong) translations to `zh-hk.ts`**

In `apps/web/lib/i18n/messages/zh-hk.ts`, add to the `missions` object right after
`fundedBadge: '已注資',` (line 437, before the closing `},` on line 438):

```typescript
    briefDetailsHeading: '簡報詳情（可選）',
    briefListHint: '每行一項',
    deliverablesLabel: '交付項目',
    requirementsLabel: '要求',
    dosLabel: '應做事項',
    dontsLabel: '不應做事項',
    keyMessagesLabel: '重點訊息',
    referenceLinksLabel: '參考連結',
    referenceLinksInvalidError: '每個參考連結都必須係有效嘅網址（以 http:// 或 https:// 開頭）。',
    effortLabel: '所需心機',
    effortUnset: '未指定',
    effortLow: '低',
    effortMedium: '中',
    effortHigh: '高',
```

Add to the `missionDetail` object right after `receiptReasonOther: '其他',` (line 483, before
the closing `},`):

```typescript
    deliverablesHeading: '交付項目',
    requirementsHeading: '要求',
    dosHeading: '應做事項',
    dontsHeading: '不應做事項',
    keyMessagesHeading: '重點訊息',
    referenceLinksHeading: '參考連結',
    effortBadgeLabel: (level) => (level === 'low' ? '所需心機：低' : level === 'medium' ? '所需心機：中' : '所需心機：高'),
```

- [ ] **Step 5: Add the Traditional Chinese (Taiwan) translations to `zh-tw.ts`**

Find the `missions`/`missionDetail` sections (same key layout as `zh-hk.ts`, different file).
Add to `missions`, right after its `fundedBadge` entry:

```typescript
    briefDetailsHeading: '簡報詳情（選填）',
    briefListHint: '每行一項',
    deliverablesLabel: '交付項目',
    requirementsLabel: '需求',
    dosLabel: '該做的事',
    dontsLabel: '不該做的事',
    keyMessagesLabel: '重點訊息',
    referenceLinksLabel: '參考連結',
    referenceLinksInvalidError: '每個參考連結都必須是有效的網址（以 http:// 或 https:// 開頭）。',
    effortLabel: '所需心力',
    effortUnset: '未指定',
    effortLow: '低',
    effortMedium: '中',
    effortHigh: '高',
```

Add to `missionDetail`, right after its `receiptReasonOther` entry:

```typescript
    deliverablesHeading: '交付項目',
    requirementsHeading: '需求',
    dosHeading: '該做的事',
    dontsHeading: '不該做的事',
    keyMessagesHeading: '重點訊息',
    referenceLinksHeading: '參考連結',
    effortBadgeLabel: (level) => (level === 'low' ? '所需心力：低' : level === 'medium' ? '所需心力：中' : '所需心力：高'),
```

- [ ] **Step 6: Add the Simplified Chinese translations to `zh-cn.ts`**

Add to `missions`, right after its `fundedBadge` entry:

```typescript
    briefDetailsHeading: '简报详情（选填）',
    briefListHint: '每行一项',
    deliverablesLabel: '交付项目',
    requirementsLabel: '需求',
    dosLabel: '该做的事',
    dontsLabel: '不该做的事',
    keyMessagesLabel: '重点信息',
    referenceLinksLabel: '参考链接',
    referenceLinksInvalidError: '每个参考链接都必须是有效的网址（以 http:// 或 https:// 开头）。',
    effortLabel: '所需精力',
    effortUnset: '未指定',
    effortLow: '低',
    effortMedium: '中',
    effortHigh: '高',
```

Add to `missionDetail`, right after its `receiptReasonOther` entry:

```typescript
    deliverablesHeading: '交付项目',
    requirementsHeading: '需求',
    dosHeading: '该做的事',
    dontsHeading: '不该做的事',
    keyMessagesHeading: '重点信息',
    referenceLinksHeading: '参考链接',
    effortBadgeLabel: (level) => (level === 'low' ? '所需精力：低' : level === 'medium' ? '所需精力：中' : '所需精力：高'),
```

- [ ] **Step 7: Add the Japanese translations to `ja.ts`**

Add to `missions`, right after its `fundedBadge` entry:

```typescript
    briefDetailsHeading: 'ブリーフ詳細（任意）',
    briefListHint: '1行に1項目',
    deliverablesLabel: '成果物',
    requirementsLabel: '要件',
    dosLabel: 'すべきこと',
    dontsLabel: 'すべきでないこと',
    keyMessagesLabel: '重要メッセージ',
    referenceLinksLabel: '参考リンク',
    referenceLinksInvalidError: '参考リンクはすべて有効なURL（http:// または https:// で始まる）である必要があります。',
    effortLabel: '想定される負荷',
    effortUnset: '未指定',
    effortLow: '低',
    effortMedium: '中',
    effortHigh: '高',
```

Add to `missionDetail`, right after its `receiptReasonOther` entry:

```typescript
    deliverablesHeading: '成果物',
    requirementsHeading: '要件',
    dosHeading: 'すべきこと',
    dontsHeading: 'すべきでないこと',
    keyMessagesHeading: '重要メッセージ',
    referenceLinksHeading: '参考リンク',
    effortBadgeLabel: (level) => (level === 'low' ? '負荷：低' : level === 'medium' ? '負荷：中' : '負荷：高'),
```

- [ ] **Step 8: Add the Korean translations to `ko.ts`**

Add to `missions`, right after its `fundedBadge` entry:

```typescript
    briefDetailsHeading: '브리프 세부정보 (선택)',
    briefListHint: '한 줄에 하나씩 입력하세요',
    deliverablesLabel: '결과물',
    requirementsLabel: '요구사항',
    dosLabel: '해야 할 일',
    dontsLabel: '하지 말아야 할 일',
    keyMessagesLabel: '핵심 메시지',
    referenceLinksLabel: '참고 링크',
    referenceLinksInvalidError: '모든 참고 링크는 유효한 URL(http:// 또는 https://로 시작)이어야 합니다.',
    effortLabel: '예상 소요 노력',
    effortUnset: '미지정',
    effortLow: '낮음',
    effortMedium: '보통',
    effortHigh: '높음',
```

Add to `missionDetail`, right after its `receiptReasonOther` entry:

```typescript
    deliverablesHeading: '결과물',
    requirementsHeading: '요구사항',
    dosHeading: '해야 할 일',
    dontsHeading: '하지 말아야 할 일',
    keyMessagesHeading: '핵심 메시지',
    referenceLinksHeading: '참고 링크',
    effortBadgeLabel: (level) => (level === 'low' ? '노력: 낮음' : level === 'medium' ? '노력: 보통' : '노력: 높음'),
```

- [ ] **Step 9: Add the Thai translations to `th.ts`**

Add to `missions`, right after its `fundedBadge` entry:

```typescript
    briefDetailsHeading: 'รายละเอียดบรีฟ (ไม่บังคับ)',
    briefListHint: 'ใส่หนึ่งรายการต่อบรรทัด',
    deliverablesLabel: 'สิ่งที่ต้องส่งมอบ',
    requirementsLabel: 'ข้อกำหนด',
    dosLabel: 'สิ่งที่ควรทำ',
    dontsLabel: 'สิ่งที่ไม่ควรทำ',
    keyMessagesLabel: 'ข้อความสำคัญ',
    referenceLinksLabel: 'ลิงก์อ้างอิง',
    referenceLinksInvalidError: 'ลิงก์อ้างอิงทุกลิงก์ต้องเป็น URL ที่ถูกต้อง (ขึ้นต้นด้วย http:// หรือ https://)',
    effortLabel: 'ระดับความพยายามที่ต้องใช้',
    effortUnset: 'ไม่ได้ระบุ',
    effortLow: 'น้อย',
    effortMedium: 'ปานกลาง',
    effortHigh: 'มาก',
```

Add to `missionDetail`, right after its `receiptReasonOther` entry:

```typescript
    deliverablesHeading: 'สิ่งที่ต้องส่งมอบ',
    requirementsHeading: 'ข้อกำหนด',
    dosHeading: 'สิ่งที่ควรทำ',
    dontsHeading: 'สิ่งที่ไม่ควรทำ',
    keyMessagesHeading: 'ข้อความสำคัญ',
    referenceLinksHeading: 'ลิงก์อ้างอิง',
    effortBadgeLabel: (level) => (level === 'low' ? 'ความพยายาม: น้อย' : level === 'medium' ? 'ความพยายาม: ปานกลาง' : 'ความพยายาม: มาก'),
```

- [ ] **Step 10: Run the full mission-related test suite plus the i18n parity test**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run mission kinnso.MissionPostWizard kinnso.CreatorMissionDetailView i18n.locale-parity -v`
Expected: PASS across the board — this is the point where Task 6's and Task 9's
previously-failing label/text lookups go green, since the real strings now exist in every
locale.

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/i18n/messages/en.ts apps/web/lib/i18n/messages/zh-hk.ts apps/web/lib/i18n/messages/zh-tw.ts apps/web/lib/i18n/messages/zh-cn.ts apps/web/lib/i18n/messages/ja.ts apps/web/lib/i18n/messages/ko.ts apps/web/lib/i18n/messages/th.ts
git commit -m "i18n(web): add mission brief richness strings across all 7 locales (R13.0)"
```

---

### Task 11: Final holistic verification

**Files:** none (verification only)

Per this program's own established pattern (see the R12.1/R12.2 program memory — the final
cross-task review is where integration-only bugs are found, not ceremony), run the full local
verification sweep before considering this phase done.

- [ ] **Step 1: Full type check**

Run: `pnpm typecheck` (from repo root)
Expected: PASS, zero errors.

- [ ] **Step 2: Full lint**

Run: `pnpm lint` (from repo root)
Expected: PASS, zero errors.

- [ ] **Step 3: Full web test suite, scoped correctly**

Run: `cd apps/web && npx vitest run` (do NOT use `pnpm --filter web test -- <pattern>` — see
the vitest-scoping-gotcha memory, it runs the whole 899+-test suite unscoped and can time out;
`cd apps/web && npx vitest run` with no pattern runs everything from the correctly-scoped
directory instead)
Expected: PASS. A handful of `*.rls.test.ts` files will time out against dummy `.env.test`
credentials if no local Supabase stack is running — that's expected per this repo's own
testing note, not a regression to chase.

- [ ] **Step 4: Manually re-read the final diff for anything no single task's plan item would
  have caught**

Specifically check: does `MissionPostWizard.tsx`'s new "Brief details" `<fieldset>` render
correctly for every mission type (coupon/hybrid/paid/receipt_cashback), not just the ones
exercised by Task 6's tests? Does the ops-side mission review/detail view
(`apps/web/components/kinnso/admin/missions/MissionDetailView.tsx` — a separate component from
the creator-facing one touched in Task 9) need these fields surfaced too, or is that
legitimately out of scope for this phase? (Per the design doc, R13.0 only specifies
merchant-editor + creator-facing display — if the ops view is out of scope, leave it
untouched; if in doubt, flag it to the user rather than silently expanding scope.)

- [ ] **Step 5: No commit for this task** — it's verification-only. If Step 4 surfaces a real
  gap, fix it as its own small follow-up commit with its own descriptive message, following the
  same task-completion pattern as every other task above.
