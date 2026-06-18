# Merchant Brief Flow v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Supabase-backed mission workflow where merchants post briefs, creators join/apply/submit milestone work, KINNSO ops tracks settlement, and Travelpayouts affiliate programs are creator-joinable with tracked partner links.

**Architecture:** Add normalized mission and affiliate tables with strict RLS, then expose them through a small `apps/web/lib/missions` domain layer. Next App Router pages render server-loaded data and delegate forms/actions to server-only mission functions; external Travelpayouts and social enrichment calls stay behind server-only adapters.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Postgres/RLS, `@supabase/ssr`, Vitest, Testing Library, Tailwind CSS, lucide-react.

---

## Scope And Guardrails

- Work in `/Users/willylai/Documents/Claude/Projects/Remix Kinnso/kinnso-v3`.
- Existing unstaged review-fix files must not be reverted or accidentally staged with mission commits.
- Use `supabase migration new mission_tables`, `supabase migration new mission_rls`, and `supabase migration new mission_grants` to create migration filenames during implementation.
- Before implementing the Supabase migration task, check current Supabase changelog/docs:
  - `curl -fsSL https://supabase.com/changelog.md | rg -i "rls|policy|breaking|auth|rest|postgres"`
  - `supabase --help`
  - `supabase migration --help`
- Keep `TRAVELPAYOUTS_API_TOKEN` server-only. Never use `NEXT_PUBLIC_` for the token, never commit the token, and rotate the planning token before production.
- Do not use `service_role` in client/browser code.

## File Structure

### Database

- Create via Supabase CLI: the generated `supabase/migrations/*_mission_tables.sql`
  Defines merchant profiles, ops members, missions, participants, milestones, submissions, social snapshots, settlements, affiliate programs, partner links, and affiliate events.
- Create via Supabase CLI: the generated `supabase/migrations/*_mission_rls.sql`
  Enables RLS and owner/actor-scoped policies using `TO authenticated` with ownership predicates.
- Create via Supabase CLI: the generated `supabase/migrations/*_mission_grants.sql`
  Grants authenticated access and revokes anon access from private mission tables.
- Modify generated: `packages/db/types.ts`
  Regenerate after migrations.

### Mission Domain

- Create: `apps/web/lib/missions/types.ts`
  Shared enums, form types, row projection types, and constants.
- Create: `apps/web/lib/missions/validation.ts`
  Pure validation for mission drafts, publish rules, participant actions, settlement updates, and partner-link requests.
- Create: `apps/web/lib/missions/state.ts`
  Pure state transition helpers.
- Create: `apps/web/lib/missions/queries.ts`
  Server-side Supabase queries for merchant, creator, and ops mission surfaces.
- Create: `apps/web/lib/missions/actions.ts`
  Server actions for profile creation, mission draft/publish, join/apply/approve, milestone submission/review, partner-link creation, and settlement update.
- Create: `apps/web/lib/missions/travelpayouts.ts`
  Server-only adapter for partner-link creation and statistics/finance event normalization.
- Create: `apps/web/lib/missions/social-enrichment.ts`
  Server-only advisory enrichment adapter boundary for Instagram/Threads snapshots.
- Create: `apps/web/lib/missions/fixtures.ts`
  Test/demo fixtures for component tests and seed UI states.

### Routes And UI

- Replace: `apps/web/app/[locale]/merchants/post/page.tsx`
  Server host for mission creation wizard.
- Create: `apps/web/app/[locale]/merchants/missions/page.tsx`
  Merchant mission list.
- Create: `apps/web/app/[locale]/merchants/missions/[missionId]/page.tsx`
  Merchant mission detail/review surface.
- Replace: `apps/web/app/[locale]/studio/missions/page.tsx`
  Creator mission catalog and active work queue.
- Create: `apps/web/app/[locale]/ops/settlements/page.tsx`
  KINNSO ops settlement queue.
- Create: `apps/web/components/kinnso/pages/MissionPostWizard.tsx`
  Client wizard for merchant and ops-authored affiliate program missions.
- Create: `apps/web/components/kinnso/pages/MerchantMissionsView.tsx`
  Merchant list component.
- Create: `apps/web/components/kinnso/pages/MissionDetailView.tsx`
  Merchant review and mission detail component.
- Create: `apps/web/components/kinnso/pages/CreatorMissionsView.tsx`
  Creator mission catalog, joins/applications, partner links, and submissions.
- Create: `apps/web/components/kinnso/pages/OpsSettlementView.tsx`
  Ops-only settlement table.
- Create: `apps/web/components/kinnso/MissionStatusBadge.tsx`
  Shared compact status badge.
- Create: `apps/web/components/kinnso/MissionCompensationSummary.tsx`
  Shared compensation display.
- Create: `apps/web/components/kinnso/SocialSignalBadge.tsx`
  Shared advisory enrichment display.

### Auth And Config

- Modify: `apps/web/lib/auth/gate.ts`
  Gate `/[locale]/merchants/post`, `/[locale]/merchants/missions`, `/[locale]/studio/missions`, and `/[locale]/ops/settlements`.
- Modify: `apps/web/lib/auth/viewer-role.ts`
  Resolve merchant and ops roles for server hosts.
- Modify: `apps/web/lib/auth/useViewerRole.ts`
  Add merchant/ops role resolution for client chrome where needed.
- Modify: `apps/web/.env.example`
  Add server-only Travelpayouts config names.
- Modify: all files in `apps/web/lib/i18n/messages/*.ts`
  Add `missions` and `ops` message groups with locale parity.

### Tests

- Create: `apps/web/tests/mission.validation.test.ts`
- Create: `apps/web/tests/mission.state.test.ts`
- Create: `apps/web/tests/mission.travelpayouts.test.ts`
- Create: `apps/web/tests/mission.queries.test.ts`
- Create: `apps/web/tests/mission.actions.test.ts`
- Create: `apps/web/tests/mission.rls.test.ts`
- Create: `apps/web/tests/kinnso.MissionPostWizard.test.tsx`
- Create: `apps/web/tests/kinnso.CreatorMissionsView.test.tsx`
- Create: `apps/web/tests/kinnso.MerchantMissionsView.test.tsx`
- Create: `apps/web/tests/kinnso.MissionDetailView.test.tsx`
- Create: `apps/web/tests/kinnso.OpsSettlementView.test.tsx`
- Modify: `apps/web/tests/auth.gate.test.ts`
- Modify: `apps/web/tests/i18n.locale-parity.test.ts`
- Modify: route parity tests if new paths are covered there.

---

### Task 1: Mission Types, Validation, And State Transitions

**Files:**
- Create: `apps/web/tests/mission.validation.test.ts`
- Create: `apps/web/tests/mission.state.test.ts`
- Create: `apps/web/lib/missions/types.ts`
- Create: `apps/web/lib/missions/validation.ts`
- Create: `apps/web/lib/missions/state.ts`

- [ ] **Step 1: Write failing validation tests**

Add `apps/web/tests/mission.validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  validateMissionDraft,
  validatePartnerLinkRequest,
  validateSettlementUpdate,
} from '@/lib/missions/validation'
import type {
  MissionDraftInput,
  PartnerLinkRequest,
  SettlementUpdateInput,
} from '@/lib/missions/types'

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
  milestones: [{ title: 'Share coupon post', description: 'Post one IG reel or Threads post.' }],
}

describe('mission validation', () => {
  it('accepts a merchant coupon affiliate mission with coupon and commission terms', () => {
    expect(validateMissionDraft(base)).toEqual({ ok: true, errors: {} })
  })

  it('rejects merchant coupon missions without coupon terms', () => {
    const result = validateMissionDraft({ ...base, couponCode: '', couponUrl: '' })
    expect(result.ok).toBe(false)
    expect(result.errors.couponCode).toContain('required')
    expect(result.errors.couponUrl).toContain('required')
  })

  it('accepts Travelpayouts missions without merchant coupon fields', () => {
    const result = validateMissionDraft({
      ...base,
      missionSource: 'travelpayouts',
      affiliateNetworkProgramId: 'program-1',
      couponCode: null,
      couponUrl: null,
      milestones: [],
    })
    expect(result).toEqual({ ok: true, errors: {} })
  })

  it('rejects paid missions without a paid fee and at least one milestone', () => {
    const result = validateMissionDraft({
      ...base,
      missionType: 'paid',
      couponCode: null,
      couponUrl: null,
      affiliateCommissionRate: null,
      kinnsoCommissionRate: null,
      creatorCommissionRate: null,
      paidFeeAmount: null,
      paidFeeCurrency: null,
      milestones: [],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.paidFeeAmount).toContain('required')
    expect(result.errors.milestones).toContain('at least one')
  })

  it('rejects partner link generation without an active participant', () => {
    const request: PartnerLinkRequest = {
      programStatus: 'active',
      participantStatus: 'applied',
      originalUrl: 'https://booking.example/hotel',
    }
    const result = validatePartnerLinkRequest(request)
    expect(result.ok).toBe(false)
    expect(result.errors.participantStatus).toContain('active')
  })

  it('allows ops settlement updates with non-negative amounts', () => {
    const input: SettlementUpdateInput = {
      actorIsOps: true,
      status: 'partially_paid',
      creatorPayoutStatus: 'pending',
      kinnsoCommissionStatus: 'paid',
      affiliateCommissionAmount: 130.25,
    }
    expect(validateSettlementUpdate(input)).toEqual({ ok: true, errors: {} })
  })
})
```

- [ ] **Step 2: Write failing state transition tests**

Add `apps/web/tests/mission.state.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  nextJoinStatus,
  reviewParticipant,
  reviewSubmission,
} from '@/lib/missions/state'

describe('mission state transitions', () => {
  it('auto-joins merchant coupon missions', () => {
    expect(nextJoinStatus({ missionType: 'coupon_affiliate', missionSource: 'merchant' })).toEqual({
      source: 'open_join',
      status: 'active',
    })
  })

  it('auto-joins Travelpayouts affiliate network missions', () => {
    expect(nextJoinStatus({ missionType: 'coupon_affiliate', missionSource: 'travelpayouts' })).toEqual({
      source: 'affiliate_network_join',
      status: 'active',
    })
  })

  it('requires application for paid and hybrid missions', () => {
    expect(nextJoinStatus({ missionType: 'paid', missionSource: 'merchant' })).toEqual({
      source: 'application',
      status: 'applied',
    })
    expect(nextJoinStatus({ missionType: 'hybrid', missionSource: 'merchant' })).toEqual({
      source: 'application',
      status: 'applied',
    })
  })

  it('merchant approval moves applicants to active', () => {
    expect(reviewParticipant('applied', 'approve')).toBe('active')
  })

  it('merchant rejection moves applicants to rejected', () => {
    expect(reviewParticipant('applied', 'reject')).toBe('rejected')
  })

  it('submission review supports approval, revision, and rejection', () => {
    expect(reviewSubmission('submitted', 'approve')).toBe('approved')
    expect(reviewSubmission('submitted', 'request_revision')).toBe('revision_requested')
    expect(reviewSubmission('submitted', 'reject')).toBe('rejected')
  })

  it('does not let approved submissions be revised by creator state flow', () => {
    expect(() => reviewSubmission('approved', 'request_revision')).toThrow('Cannot review submission from approved')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm --filter web test -- tests/mission.validation.test.ts tests/mission.state.test.ts
```

Expected: FAIL with module-not-found errors for `@/lib/missions/validation` and `@/lib/missions/state`.

- [ ] **Step 4: Implement mission types**

Add `apps/web/lib/missions/types.ts`:

```ts
export const missionTypes = ['coupon_affiliate', 'hybrid', 'paid'] as const
export type MissionType = (typeof missionTypes)[number]

export const missionSources = ['merchant', 'travelpayouts'] as const
export type MissionSource = (typeof missionSources)[number]

export const missionVisibilities = ['open', 'targeted'] as const
export type MissionVisibility = (typeof missionVisibilities)[number]

export const missionStatuses = ['draft', 'published', 'paused', 'completed', 'cancelled'] as const
export type MissionStatus = (typeof missionStatuses)[number]

export const participantStatuses = ['invited', 'applied', 'rejected', 'active', 'completed', 'cancelled'] as const
export type ParticipantStatus = (typeof participantStatuses)[number]

export const participantSources = ['open_join', 'application', 'merchant_invite', 'affiliate_network_join'] as const
export type ParticipantSource = (typeof participantSources)[number]

export const submissionStatuses = ['pending', 'submitted', 'revision_requested', 'approved', 'rejected'] as const
export type SubmissionStatus = (typeof submissionStatuses)[number]

export const settlementStatuses = ['not_started', 'pending', 'partially_paid', 'paid', 'disputed'] as const
export type SettlementStatus = (typeof settlementStatuses)[number]

export const affiliateNetworks = ['travelpayouts'] as const
export type AffiliateNetwork = (typeof affiliateNetworks)[number]

export type ValidationResult = { ok: true; errors: {} } | { ok: false; errors: Record<string, string[]> }

export interface MissionMilestoneInput {
  title: string
  description: string
  dueAt?: string | null
}

export interface MissionDraftInput {
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
  milestones: MissionMilestoneInput[]
}

export interface PartnerLinkRequest {
  programStatus: 'active' | 'paused' | 'archived'
  participantStatus: ParticipantStatus
  originalUrl: string
}

export interface SettlementUpdateInput {
  actorIsOps: boolean
  status: SettlementStatus
  creatorPayoutStatus: 'not_started' | 'pending' | 'paid' | 'disputed'
  kinnsoCommissionStatus: 'not_started' | 'pending' | 'paid' | 'disputed'
  affiliateCommissionAmount: number | null
}
```

- [ ] **Step 5: Implement validation**

Add `apps/web/lib/missions/validation.ts`:

```ts
import type {
  MissionDraftInput,
  PartnerLinkRequest,
  SettlementUpdateInput,
  ValidationResult,
} from './types'

function add(errors: Record<string, string[]>, field: string, message: string) {
  errors[field] = [...(errors[field] ?? []), message]
}

function result(errors: Record<string, string[]>): ValidationResult {
  return Object.keys(errors).length === 0 ? { ok: true, errors: {} } : { ok: false, errors }
}

function positiveOrZero(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function validateMissionDraft(input: MissionDraftInput): ValidationResult {
  const errors: Record<string, string[]> = {}
  if (!input.title.trim()) add(errors, 'title', 'Title is required')
  if (!input.summary.trim()) add(errors, 'summary', 'Summary is required')

  if (input.missionSource === 'travelpayouts') {
    if (!input.affiliateNetworkProgramId) {
      add(errors, 'affiliateNetworkProgramId', 'Travelpayouts program is required')
    }
  }

  if (input.missionSource === 'merchant' && input.missionType === 'coupon_affiliate') {
    if (!input.couponCode?.trim()) add(errors, 'couponCode', 'Coupon code is required')
    if (!input.couponUrl?.trim()) add(errors, 'couponUrl', 'Coupon URL is required')
  }

  if (input.missionSource === 'merchant' && (input.missionType === 'coupon_affiliate' || input.missionType === 'hybrid')) {
    if (!positiveOrZero(input.affiliateCommissionRate)) add(errors, 'affiliateCommissionRate', 'Affiliate commission rate is required')
    if (!positiveOrZero(input.kinnsoCommissionRate)) add(errors, 'kinnsoCommissionRate', 'KINNSO commission rate is required')
    if (!positiveOrZero(input.creatorCommissionRate)) add(errors, 'creatorCommissionRate', 'Creator commission rate is required')
  }

  if (input.missionType === 'hybrid' || input.missionType === 'paid') {
    if (!positiveOrZero(input.paidFeeAmount)) add(errors, 'paidFeeAmount', 'Paid mission fee is required')
    if (!input.paidFeeCurrency?.trim()) add(errors, 'paidFeeCurrency', 'Paid mission currency is required')
    if (input.milestones.length === 0) add(errors, 'milestones', 'Paid missions need at least one milestone')
  }

  return result(errors)
}

export function validatePartnerLinkRequest(input: PartnerLinkRequest): ValidationResult {
  const errors: Record<string, string[]> = {}
  if (input.programStatus !== 'active') add(errors, 'programStatus', 'Program must be active')
  if (input.participantStatus !== 'active') add(errors, 'participantStatus', 'Participant must be active')
  if (!/^https:\/\/.+/i.test(input.originalUrl.trim())) add(errors, 'originalUrl', 'Original URL must be an https URL')
  return result(errors)
}

export function validateSettlementUpdate(input: SettlementUpdateInput): ValidationResult {
  const errors: Record<string, string[]> = {}
  if (!input.actorIsOps) add(errors, 'actorIsOps', 'Only KINNSO ops can update settlement')
  if (input.affiliateCommissionAmount !== null && !positiveOrZero(input.affiliateCommissionAmount)) {
    add(errors, 'affiliateCommissionAmount', 'Amount must be zero or greater')
  }
  return result(errors)
}
```

- [ ] **Step 6: Implement state transitions**

Add `apps/web/lib/missions/state.ts`:

```ts
import type {
  MissionSource,
  MissionType,
  ParticipantSource,
  ParticipantStatus,
  SubmissionStatus,
} from './types'

export function nextJoinStatus(input: {
  missionType: MissionType
  missionSource: MissionSource
}): { source: ParticipantSource; status: ParticipantStatus } {
  if (input.missionSource === 'travelpayouts') {
    return { source: 'affiliate_network_join', status: 'active' }
  }
  if (input.missionType === 'coupon_affiliate') {
    return { source: 'open_join', status: 'active' }
  }
  return { source: 'application', status: 'applied' }
}

export function reviewParticipant(current: ParticipantStatus, action: 'approve' | 'reject'): ParticipantStatus {
  if (current !== 'applied' && current !== 'invited') {
    throw new Error(`Cannot review participant from ${current}`)
  }
  return action === 'approve' ? 'active' : 'rejected'
}

export function reviewSubmission(
  current: SubmissionStatus,
  action: 'approve' | 'request_revision' | 'reject',
): SubmissionStatus {
  if (current !== 'submitted') {
    throw new Error(`Cannot review submission from ${current}`)
  }
  if (action === 'approve') return 'approved'
  if (action === 'request_revision') return 'revision_requested'
  return 'rejected'
}
```

- [ ] **Step 7: Run validation/state tests**

Run:

```bash
pnpm --filter web test -- tests/mission.validation.test.ts tests/mission.state.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add apps/web/tests/mission.validation.test.ts apps/web/tests/mission.state.test.ts apps/web/lib/missions/types.ts apps/web/lib/missions/validation.ts apps/web/lib/missions/state.ts
git commit -m "feat: add mission validation and state rules"
```

---

### Task 2: Supabase Mission Schema, RLS, Grants, And Types

**Files:**
- Create with CLI: generated `supabase/migrations/*_mission_tables.sql`
- Create with CLI: generated `supabase/migrations/*_mission_rls.sql`
- Create with CLI: generated `supabase/migrations/*_mission_grants.sql`
- Create: `apps/web/tests/mission.rls.test.ts`
- Modify generated: `packages/db/types.ts`

- [ ] **Step 1: Write failing RLS integration test**

Add `apps/web/tests/mission.rls.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const d = svcKey ? describe : describe.skip

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const anon = createClient(url, anonKey)
const svc = createClient(url, svcKey ?? 'missing')

const creatorEmail = 'mission-creator@example.test'
const merchantEmail = 'mission-merchant@example.test'
const opsEmail = 'mission-ops@example.test'
const password = 'Test1234!'

let creatorId = ''
let merchantUserId = ''
let opsUserId = ''
let merchantProfileId = ''
let opsMemberId = ''
let missionId = ''

async function recreateUser(email: string) {
  const existing = await svc.auth.admin.listUsers()
  const prev = (existing.data?.users ?? []).find((u) => u.email === email)
  if (prev) await svc.auth.admin.deleteUser(prev.id)
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true })
  expect(error).toBeNull()
  return data.user!.id
}

async function authed(email: string) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  expect(error).toBeNull()
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
  })
}

d('mission schema RLS', () => {
  beforeAll(async () => {
    creatorId = await recreateUser(creatorEmail)
    merchantUserId = await recreateUser(merchantEmail)
    opsUserId = await recreateUser(opsEmail)

    const merchant = await svc
      .from('merchant_profiles')
      .insert({ user_id: merchantUserId, company_name: 'Kinnso Test Merchant', contact_email: merchantEmail })
      .select('id')
      .single()
    expect(merchant.error).toBeNull()
    merchantProfileId = merchant.data!.id

    const ops = await svc
      .from('kinnso_ops_members')
      .insert({ user_id: opsUserId, display_name: 'Ops Test', status: 'active' })
      .select('id')
      .single()
    expect(ops.error).toBeNull()
    opsMemberId = ops.data!.id

    const mission = await svc
      .from('missions')
      .insert({
        merchant_profile_id: merchantProfileId,
        title: 'RLS coupon mission',
        summary: 'Creator can see this after publish',
        mission_source: 'merchant',
        mission_type: 'coupon_affiliate',
        visibility: 'open',
        status: 'published',
        coupon_code: 'RLS10',
        coupon_url: 'https://example.com/rls',
        affiliate_commission_rate: 10,
        kinnso_commission_rate: 4,
        creator_commission_rate: 6,
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(mission.error).toBeNull()
    missionId = mission.data!.id
  })

  afterAll(async () => {
    for (const id of [creatorId, merchantUserId, opsUserId]) {
      if (id) await svc.auth.admin.deleteUser(id)
    }
  })

  it('anon cannot read mission tables', async () => {
    const { data, error } = await anon.from('missions').select('id')
    expect(error === null ? (data ?? []).length === 0 : /permission denied|42501/i.test(error.message)).toBe(true)
  })

  it('merchant can read and update own mission', async () => {
    const merchant = await authed(merchantEmail)
    const { data, error } = await merchant.from('missions').select('id, title').eq('id', missionId).single()
    expect(error).toBeNull()
    expect(data!.title).toBe('RLS coupon mission')

    const update = await merchant.from('missions').update({ title: 'RLS coupon mission updated' }).eq('id', missionId)
    expect(update.error).toBeNull()
  })

  it('creator can see published open missions and join once', async () => {
    const creator = await authed(creatorEmail)
    const visible = await creator.from('missions').select('id').eq('id', missionId).single()
    expect(visible.error).toBeNull()

    const joined = await creator
      .from('mission_participants')
      .insert({ mission_id: missionId, creator_id: creatorId, status: 'active', source: 'open_join' })
      .select('id, status')
      .single()
    expect(joined.error).toBeNull()
    expect(joined.data!.status).toBe('active')

    const duplicate = await creator
      .from('mission_participants')
      .insert({ mission_id: missionId, creator_id: creatorId, status: 'active', source: 'open_join' })
    expect(duplicate.error).not.toBeNull()
  })

  it('non-ops cannot update settlement while ops can', async () => {
    const settlement = await svc
      .from('mission_settlements')
      .insert({ mission_id: missionId, status: 'pending' })
      .select('id')
      .single()
    expect(settlement.error).toBeNull()

    const merchant = await authed(merchantEmail)
    const denied = await merchant
      .from('mission_settlements')
      .update({ status: 'paid' })
      .eq('id', settlement.data!.id)
    expect(denied.error).not.toBeNull()

    const opsClient = await authed(opsEmail)
    const allowed = await opsClient
      .from('mission_settlements')
      .update({ status: 'paid', updated_by_ops_member_id: opsMemberId })
      .eq('id', settlement.data!.id)
    expect(allowed.error).toBeNull()
  })
})
```

- [ ] **Step 2: Run RLS test to verify it fails before schema**

Run:

```bash
pnpm --filter web test -- tests/mission.rls.test.ts
```

Expected: FAIL with `relation "public.merchant_profiles" does not exist` or skipped if no `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 3: Create migration files with Supabase CLI**

Run:

```bash
supabase migration new mission_tables
supabase migration new mission_rls
supabase migration new mission_grants
```

Expected: three new files under `supabase/migrations/` with timestamped names.

- [ ] **Step 4: Implement mission table migration**

Paste this SQL into the generated `*_mission_tables.sql` file:

```sql
create table public.merchant_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  company_name text not null,
  contact_name text,
  contact_email text not null,
  website_url text,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.kinnso_ops_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.affiliate_network_programs (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network in ('travelpayouts')),
  external_program_id text not null,
  program_name text not null,
  program_url text,
  category text,
  description text,
  default_currency text,
  default_commission_description text,
  join_policy text not null default 'auto_join' check (join_policy in ('auto_join')),
  status text not null default 'active' check (status in ('active','paused','archived')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (network, external_program_id)
);

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  merchant_profile_id uuid references public.merchant_profiles(id) on delete cascade,
  created_by_ops_member_id uuid references public.kinnso_ops_members(id) on delete set null,
  affiliate_network_program_id uuid references public.affiliate_network_programs(id) on delete set null,
  title text not null,
  summary text not null,
  mission_source text not null default 'merchant' check (mission_source in ('merchant','travelpayouts')),
  mission_type text not null check (mission_type in ('coupon_affiliate','hybrid','paid')),
  visibility text not null default 'open' check (visibility in ('open','targeted')),
  status text not null default 'draft' check (status in ('draft','published','paused','completed','cancelled')),
  coupon_code text,
  coupon_description text,
  coupon_url text,
  affiliate_commission_rate numeric(8,2),
  kinnso_commission_rate numeric(8,2),
  creator_commission_rate numeric(8,2),
  paid_fee_amount numeric(12,2),
  paid_fee_currency text,
  application_instructions text,
  starts_at timestamptz,
  ends_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (mission_source = 'merchant' and merchant_profile_id is not null)
    or
    (mission_source = 'travelpayouts' and created_by_ops_member_id is not null and affiliate_network_program_id is not null)
  )
);

create table public.mission_participants (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  status text not null check (status in ('invited','applied','rejected','active','completed','cancelled')),
  source text not null check (source in ('open_join','application','merchant_invite','affiliate_network_join')),
  application_note text,
  merchant_review_note text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mission_id, creator_id)
);

create table public.mission_milestones (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  title text not null,
  description text not null,
  due_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mission_milestone_submissions (
  id uuid primary key default gen_random_uuid(),
  mission_milestone_id uuid not null references public.mission_milestones(id) on delete cascade,
  mission_participant_id uuid not null references public.mission_participants(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','submitted','revision_requested','approved','rejected')),
  proof_urls text[] not null default '{}',
  notes text,
  merchant_feedback text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mission_milestone_id, mission_participant_id)
);

create table public.mission_social_snapshots (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.missions(id) on delete cascade,
  mission_participant_id uuid references public.mission_participants(id) on delete cascade,
  mission_milestone_submission_id uuid references public.mission_milestone_submissions(id) on delete cascade,
  platform text not null check (platform in ('instagram','threads')),
  handle text,
  profile_url text,
  proof_url text,
  follower_count integer,
  profile_media_url text,
  post_media_url text,
  engagement_count integer,
  confidence_status text not null default 'unavailable' check (confidence_status in ('verified_signal','needs_review','unavailable')),
  raw_response_checksum text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.affiliate_partner_links (
  id uuid primary key default gen_random_uuid(),
  affiliate_network_program_id uuid not null references public.affiliate_network_programs(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  mission_participant_id uuid not null references public.mission_participants(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  network text not null check (network in ('travelpayouts')),
  original_url text not null,
  partner_url text not null,
  sub_id text not null,
  external_status text not null default 'success',
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (network, sub_id, original_url)
);

create table public.affiliate_network_events (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network in ('travelpayouts')),
  affiliate_network_program_id uuid references public.affiliate_network_programs(id) on delete set null,
  mission_id uuid references public.missions(id) on delete set null,
  mission_participant_id uuid references public.mission_participants(id) on delete set null,
  creator_id uuid references public.creators(id) on delete set null,
  external_action_id text not null,
  sub_id text,
  event_state text not null default 'unknown' check (event_state in ('processing','paid','cancelled','unknown')),
  price_amount numeric(12,2),
  profit_amount numeric(12,2),
  currency text,
  booked_at timestamptz,
  external_updated_at timestamptz,
  raw_response_checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (network, external_action_id)
);

create table public.mission_settlements (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  mission_participant_id uuid references public.mission_participants(id) on delete cascade,
  affiliate_network_event_id uuid references public.affiliate_network_events(id) on delete set null,
  status text not null default 'not_started' check (status in ('not_started','pending','partially_paid','paid','disputed')),
  merchant_invoice_status text,
  merchant_payment_status text,
  creator_payout_status text,
  kinnso_commission_status text,
  affiliate_commission_status text,
  amount_currency text,
  paid_fee_amount numeric(12,2),
  affiliate_commission_amount numeric(12,2),
  kinnso_commission_amount numeric(12,2),
  creator_commission_amount numeric(12,2),
  ops_note text,
  updated_by_ops_member_id uuid references public.kinnso_ops_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index merchant_profiles_user_idx on public.merchant_profiles(user_id);
create index kinnso_ops_members_user_idx on public.kinnso_ops_members(user_id);
create index missions_merchant_idx on public.missions(merchant_profile_id);
create index missions_status_idx on public.missions(status, visibility);
create index mission_participants_mission_idx on public.mission_participants(mission_id);
create index mission_participants_creator_idx on public.mission_participants(creator_id);
create index mission_milestones_mission_idx on public.mission_milestones(mission_id, sort_order);
create index mission_submissions_participant_idx on public.mission_milestone_submissions(mission_participant_id);
create index affiliate_events_sub_id_idx on public.affiliate_network_events(network, sub_id);
```

- [ ] **Step 5: Implement RLS migration**

Paste this SQL into the generated `*_mission_rls.sql` file:

```sql
alter table public.merchant_profiles enable row level security;
alter table public.kinnso_ops_members enable row level security;
alter table public.affiliate_network_programs enable row level security;
alter table public.missions enable row level security;
alter table public.mission_participants enable row level security;
alter table public.mission_milestones enable row level security;
alter table public.mission_milestone_submissions enable row level security;
alter table public.mission_social_snapshots enable row level security;
alter table public.affiliate_partner_links enable row level security;
alter table public.affiliate_network_events enable row level security;
alter table public.mission_settlements enable row level security;

create policy "merchant_profiles_owner_select" on public.merchant_profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "merchant_profiles_owner_insert" on public.merchant_profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "merchant_profiles_owner_update" on public.merchant_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "kinnso_ops_self_select" on public.kinnso_ops_members
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "affiliate_programs_active_select" on public.affiliate_network_programs
  for select to authenticated
  using (
    status = 'active'
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  );

create policy "affiliate_programs_ops_insert" on public.affiliate_network_programs
  for insert to authenticated
  with check (
    exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  );

create policy "affiliate_programs_ops_update" on public.affiliate_network_programs
  for update to authenticated
  using (
    exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  );

create policy "missions_actor_select" on public.missions
  for select to authenticated
  using (
    status = 'published'
    or exists (
      select 1 from public.merchant_profiles mp
      where mp.id = missions.merchant_profile_id and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.mission_participants part
      where part.mission_id = missions.id and part.creator_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  );

create policy "missions_merchant_insert" on public.missions
  for insert to authenticated
  with check (
    mission_source = 'merchant'
    and exists (
      select 1 from public.merchant_profiles mp
      where mp.id = merchant_profile_id and mp.user_id = (select auth.uid())
    )
  );

create policy "missions_ops_insert" on public.missions
  for insert to authenticated
  with check (
    mission_source = 'travelpayouts'
    and exists (
      select 1 from public.kinnso_ops_members ops
      where ops.id = created_by_ops_member_id
        and ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy "missions_owner_update" on public.missions
  for update to authenticated
  using (
    exists (
      select 1 from public.merchant_profiles mp
      where mp.id = missions.merchant_profile_id and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.merchant_profiles mp
      where mp.id = missions.merchant_profile_id and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  );

create policy "mission_participants_actor_select" on public.mission_participants
  for select to authenticated
  using (
    creator_id = (select auth.uid())
    or exists (
      select 1
      from public.missions m
      join public.merchant_profiles mp on mp.id = m.merchant_profile_id
      where m.id = mission_participants.mission_id and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  );

create policy "mission_participants_creator_insert" on public.mission_participants
  for insert to authenticated
  with check (creator_id = (select auth.uid()));

create policy "mission_participants_actor_update" on public.mission_participants
  for update to authenticated
  using (
    creator_id = (select auth.uid())
    or exists (
      select 1
      from public.missions m
      join public.merchant_profiles mp on mp.id = m.merchant_profile_id
      where m.id = mission_participants.mission_id and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  )
  with check (
    creator_id = (select auth.uid())
    or exists (
      select 1
      from public.missions m
      join public.merchant_profiles mp on mp.id = m.merchant_profile_id
      where m.id = mission_participants.mission_id and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  );

create policy "mission_milestones_actor_select" on public.mission_milestones
  for select to authenticated
  using (exists (select 1 from public.missions m where m.id = mission_milestones.mission_id));

create policy "mission_milestones_owner_insert" on public.mission_milestones
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.missions m
      left join public.merchant_profiles mp on mp.id = m.merchant_profile_id
      left join public.kinnso_ops_members ops on ops.id = m.created_by_ops_member_id
      where m.id = mission_milestones.mission_id
        and (mp.user_id = (select auth.uid()) or (ops.user_id = (select auth.uid()) and ops.status = 'active'))
    )
  );

create policy "mission_submissions_actor_select" on public.mission_milestone_submissions
  for select to authenticated
  using (
    exists (
      select 1
      from public.mission_participants part
      where part.id = mission_milestone_submissions.mission_participant_id
        and part.creator_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.mission_milestones mm
      join public.missions m on m.id = mm.mission_id
      join public.merchant_profiles mp on mp.id = m.merchant_profile_id
      where mm.id = mission_milestone_submissions.mission_milestone_id
        and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  );

create policy "mission_submissions_creator_insert" on public.mission_milestone_submissions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.mission_participants part
      where part.id = mission_participant_id
        and part.creator_id = (select auth.uid())
        and part.status = 'active'
    )
  );

create policy "mission_submissions_actor_update" on public.mission_milestone_submissions
  for update to authenticated
  using (
    exists (
      select 1 from public.mission_participants part
      where part.id = mission_participant_id and part.creator_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.mission_milestones mm
      join public.missions m on m.id = mm.mission_id
      join public.merchant_profiles mp on mp.id = m.merchant_profile_id
      where mm.id = mission_milestone_id and mp.user_id = (select auth.uid())
    )
  )
  with check (true);

create policy "mission_social_snapshots_actor_select" on public.mission_social_snapshots
  for select to authenticated
  using (
    exists (
      select 1 from public.missions m
      where m.id = mission_social_snapshots.mission_id
    )
  );

create policy "affiliate_partner_links_creator_select" on public.affiliate_partner_links
  for select to authenticated
  using (
    creator_id = (select auth.uid())
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  );

create policy "affiliate_partner_links_creator_insert" on public.affiliate_partner_links
  for insert to authenticated
  with check (creator_id = (select auth.uid()));

create policy "affiliate_events_ops_select" on public.affiliate_network_events
  for select to authenticated
  using (
    creator_id = (select auth.uid())
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  );

create policy "affiliate_events_ops_write" on public.affiliate_network_events
  for all to authenticated
  using (
    exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  );

create policy "mission_settlements_actor_select" on public.mission_settlements
  for select to authenticated
  using (
    exists (
      select 1
      from public.missions m
      join public.merchant_profiles mp on mp.id = m.merchant_profile_id
      where m.id = mission_settlements.mission_id and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.mission_participants part
      where part.id = mission_settlements.mission_participant_id and part.creator_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  );

create policy "mission_settlements_ops_insert" on public.mission_settlements
  for insert to authenticated
  with check (
    exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  );

create policy "mission_settlements_ops_update" on public.mission_settlements
  for update to authenticated
  using (
    exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid()) and ops.status = 'active'
    )
  );
```

- [ ] **Step 6: Implement grants migration**

Paste this SQL into the generated `*_mission_grants.sql` file:

```sql
grant select, insert, update on public.merchant_profiles to authenticated;
grant select on public.kinnso_ops_members to authenticated;
grant select, insert, update on public.affiliate_network_programs to authenticated;
grant select, insert, update on public.missions to authenticated;
grant select, insert, update on public.mission_participants to authenticated;
grant select, insert, update on public.mission_milestones to authenticated;
grant select, insert, update on public.mission_milestone_submissions to authenticated;
grant select on public.mission_social_snapshots to authenticated;
grant select, insert on public.affiliate_partner_links to authenticated;
grant select, insert, update on public.affiliate_network_events to authenticated;
grant select, insert, update on public.mission_settlements to authenticated;

revoke all on public.merchant_profiles from anon;
revoke all on public.kinnso_ops_members from anon;
revoke all on public.affiliate_network_programs from anon;
revoke all on public.missions from anon;
revoke all on public.mission_participants from anon;
revoke all on public.mission_milestones from anon;
revoke all on public.mission_milestone_submissions from anon;
revoke all on public.mission_social_snapshots from anon;
revoke all on public.affiliate_partner_links from anon;
revoke all on public.affiliate_network_events from anon;
revoke all on public.mission_settlements from anon;
```

- [ ] **Step 7: Apply migrations locally and generate types**

Run:

```bash
supabase db reset
pnpm --filter @kinnso/db gen
```

Expected: local database resets successfully; `packages/db/types.ts` includes the new tables.

- [ ] **Step 8: Run RLS test**

Run:

```bash
pnpm --filter web test -- tests/mission.rls.test.ts
```

Expected: PASS or SKIP if service-role env is absent. If the update portion returns zero rows without error, fix the relevant RLS `SELECT` policy before continuing.

- [ ] **Step 9: Commit Task 2**

```bash
git add supabase/migrations packages/db/types.ts apps/web/tests/mission.rls.test.ts
git commit -m "feat: add mission schema and rls"
```

---

### Task 3: Mission Queries And Server Actions

**Files:**
- Create: `apps/web/tests/mission.queries.test.ts`
- Create: `apps/web/tests/mission.actions.test.ts`
- Create: `apps/web/lib/missions/fixtures.ts`
- Create: `apps/web/lib/missions/queries.ts`
- Create: `apps/web/lib/missions/actions.ts`

- [ ] **Step 1: Add query/action fixtures**

Add `apps/web/lib/missions/fixtures.ts`:

```ts
import type { MissionDraftInput } from './types'

export const missionDraftFixture: MissionDraftInput = {
  missionSource: 'merchant',
  missionType: 'coupon_affiliate',
  visibility: 'open',
  title: 'Hong Kong staycation coupon',
  summary: 'Promote a weekend staycation discount.',
  couponCode: 'STAY10',
  couponUrl: 'https://example.com/staycation',
  affiliateCommissionRate: 10,
  kinnsoCommissionRate: 4,
  creatorCommissionRate: 6,
  paidFeeAmount: null,
  paidFeeCurrency: null,
  affiliateNetworkProgramId: null,
  milestones: [{ title: 'Publish post', description: 'Share one post with the tracked link.' }],
}

export const travelpayoutsMissionDraftFixture: MissionDraftInput = {
  ...missionDraftFixture,
  missionSource: 'travelpayouts',
  affiliateNetworkProgramId: 'program-1',
  couponCode: null,
  couponUrl: null,
  milestones: [],
}
```

- [ ] **Step 2: Write failing action tests with mocked Supabase**

Add `apps/web/tests/mission.actions.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { missionDraftFixture } from '@/lib/missions/fixtures'
import { buildMissionInsert, buildParticipantInsert } from '@/lib/missions/actions'

describe('mission actions builders', () => {
  it('builds a mission insert payload from a valid merchant draft', () => {
    const payload = buildMissionInsert({
      input: missionDraftFixture,
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: true,
    })
    expect(payload).toMatchObject({
      merchant_profile_id: 'merchant-profile-1',
      mission_source: 'merchant',
      mission_type: 'coupon_affiliate',
      status: 'published',
      coupon_code: 'STAY10',
    })
    expect(payload.published_at).toEqual(expect.any(String))
  })

  it('builds an active participant for coupon auto-join', () => {
    expect(buildParticipantInsert({
      missionId: 'mission-1',
      creatorId: 'creator-1',
      missionType: 'coupon_affiliate',
      missionSource: 'merchant',
    })).toMatchObject({
      mission_id: 'mission-1',
      creator_id: 'creator-1',
      status: 'active',
      source: 'open_join',
    })
  })

  it('does not import next/cache at module evaluation in tests', async () => {
    vi.resetModules()
    await expect(import('@/lib/missions/actions')).resolves.toBeTruthy()
  })
})
```

- [ ] **Step 3: Write failing query shape tests**

Add `apps/web/tests/mission.queries.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  merchantMissionSelect,
  creatorMissionSelect,
  opsSettlementSelect,
} from '@/lib/missions/queries'

describe('mission query projections', () => {
  it('keeps merchant mission projection stable', () => {
    expect(merchantMissionSelect).toContain('mission_participants')
    expect(merchantMissionSelect).toContain('mission_settlements')
  })

  it('keeps creator mission projection stable', () => {
    expect(creatorMissionSelect).toContain('affiliate_partner_links')
    expect(creatorMissionSelect).toContain('mission_milestones')
  })

  it('keeps ops settlement projection stable', () => {
    expect(opsSettlementSelect).toContain('affiliate_network_events')
    expect(opsSettlementSelect).toContain('mission_participants')
  })
})
```

- [ ] **Step 4: Run tests to verify failure**

Run:

```bash
pnpm --filter web test -- tests/mission.actions.test.ts tests/mission.queries.test.ts
```

Expected: FAIL with missing module exports.

- [ ] **Step 5: Implement query projections and loaders**

Add `apps/web/lib/missions/queries.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export const merchantMissionSelect = `
  id,title,summary,mission_source,mission_type,visibility,status,published_at,
  coupon_code,coupon_url,paid_fee_amount,paid_fee_currency,
  mission_participants(id,status,source,creator_id,application_note,merchant_review_note,approved_at),
  mission_milestones(id,title,description,due_at,sort_order),
  mission_settlements(id,status,creator_payout_status,kinnso_commission_status,affiliate_commission_status)
`

export const creatorMissionSelect = `
  id,title,summary,mission_source,mission_type,visibility,status,published_at,
  coupon_code,coupon_url,paid_fee_amount,paid_fee_currency,affiliate_network_program_id,
  affiliate_network_programs(id,program_name,program_url,default_commission_description,status),
  mission_milestones(id,title,description,due_at,sort_order),
  mission_participants(id,status,source,creator_id),
  affiliate_partner_links(id,partner_url,original_url,sub_id)
`

export const opsSettlementSelect = `
  id,status,merchant_invoice_status,merchant_payment_status,creator_payout_status,
  kinnso_commission_status,affiliate_commission_status,amount_currency,
  paid_fee_amount,affiliate_commission_amount,kinnso_commission_amount,creator_commission_amount,ops_note,
  missions(id,title,mission_source,mission_type),
  mission_participants(id,creator_id,status),
  affiliate_network_events(id,network,external_action_id,sub_id,event_state,profit_amount,currency)
`

export async function getMerchantProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  return supabase.from('merchant_profiles').select('id, company_name, contact_email, status').eq('user_id', userId).maybeSingle()
}

export async function listMerchantMissions(
  supabase: SupabaseClient<Database>,
  merchantProfileId: string,
) {
  return supabase
    .from('missions')
    .select(merchantMissionSelect)
    .eq('merchant_profile_id', merchantProfileId)
    .order('created_at', { ascending: false })
}

export async function listCreatorMissions(
  supabase: SupabaseClient<Database>,
  creatorId: string,
) {
  return supabase
    .from('missions')
    .select(creatorMissionSelect)
    .eq('status', 'published')
    .or(`visibility.eq.open,mission_participants.creator_id.eq.${creatorId}`)
    .order('published_at', { ascending: false })
}

export async function listOpsSettlements(supabase: SupabaseClient<Database>) {
  return supabase
    .from('mission_settlements')
    .select(opsSettlementSelect)
    .order('updated_at', { ascending: false })
}
```

- [ ] **Step 6: Implement server action builders and actions**

Add `apps/web/lib/missions/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { validateMissionDraft, validatePartnerLinkRequest, validateSettlementUpdate } from './validation'
import { nextJoinStatus, reviewParticipant, reviewSubmission } from './state'
import type { MissionDraftInput, MissionSource, MissionType, SettlementUpdateInput } from './types'

export function buildMissionInsert(input: {
  input: MissionDraftInput
  merchantProfileId: string | null
  opsMemberId: string | null
  publish: boolean
}) {
  const status = input.publish ? 'published' : 'draft'
  return {
    merchant_profile_id: input.merchantProfileId,
    created_by_ops_member_id: input.opsMemberId,
    affiliate_network_program_id: input.input.affiliateNetworkProgramId,
    title: input.input.title,
    summary: input.input.summary,
    mission_source: input.input.missionSource,
    mission_type: input.input.missionType,
    visibility: input.input.visibility,
    status,
    coupon_code: input.input.couponCode,
    coupon_url: input.input.couponUrl,
    affiliate_commission_rate: input.input.affiliateCommissionRate,
    kinnso_commission_rate: input.input.kinnsoCommissionRate,
    creator_commission_rate: input.input.creatorCommissionRate,
    paid_fee_amount: input.input.paidFeeAmount,
    paid_fee_currency: input.input.paidFeeCurrency,
    published_at: input.publish ? new Date().toISOString() : null,
  }
}

export function buildParticipantInsert(input: {
  missionId: string
  creatorId: string
  missionType: MissionType
  missionSource: MissionSource
}) {
  const next = nextJoinStatus({ missionType: input.missionType, missionSource: input.missionSource })
  return {
    mission_id: input.missionId,
    creator_id: input.creatorId,
    status: next.status,
    source: next.source,
  }
}

export async function createMissionAction(input: MissionDraftInput, opts: { publish: boolean; locale: string }) {
  const validation = validateMissionDraft(input)
  if (!validation.ok) return { ok: false as const, errors: validation.errors }

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false as const, errors: { auth: ['Sign in required'] } }

  const { data: merchant } = await supabase
    .from('merchant_profiles')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  const { data: ops } = await supabase
    .from('kinnso_ops_members')
    .select('id,status')
    .eq('user_id', auth.user.id)
    .eq('status', 'active')
    .maybeSingle()

  const payload = buildMissionInsert({
    input,
    merchantProfileId: input.missionSource === 'merchant' ? merchant?.id ?? null : null,
    opsMemberId: input.missionSource === 'travelpayouts' ? ops?.id ?? null : null,
    publish: opts.publish,
  })

  const { data, error } = await supabase.from('missions').insert(payload).select('id').single()
  if (error) return { ok: false as const, errors: { form: [error.message] } }

  if (input.milestones.length > 0) {
    const rows = input.milestones.map((m, index) => ({
      mission_id: data.id,
      title: m.title,
      description: m.description,
      due_at: m.dueAt ?? null,
      sort_order: index,
    }))
    const milestone = await supabase.from('mission_milestones').insert(rows)
    if (milestone.error) return { ok: false as const, errors: { milestones: [milestone.error.message] } }
  }

  revalidatePath(`/${opts.locale}/merchants/missions`)
  revalidatePath(`/${opts.locale}/studio/missions`)
  return { ok: true as const, missionId: data.id }
}

export async function joinMissionAction(input: {
  missionId: string
  missionType: MissionType
  missionSource: MissionSource
  locale: string
}) {
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false as const, error: 'Sign in required' }

  const payload = buildParticipantInsert({
    missionId: input.missionId,
    creatorId: auth.user.id,
    missionType: input.missionType,
    missionSource: input.missionSource,
  })
  const { data, error } = await supabase.from('mission_participants').insert(payload).select('id,status').single()
  if (error) return { ok: false as const, error: error.message }
  revalidatePath(`/${input.locale}/studio/missions`)
  return { ok: true as const, participant: data }
}

export async function reviewParticipantAction(input: {
  participantId: string
  currentStatus: 'invited' | 'applied' | 'rejected' | 'active' | 'completed' | 'cancelled'
  action: 'approve' | 'reject'
  note: string
  locale: string
}) {
  const supabase = await createSupabaseServerClient()
  const status = reviewParticipant(input.currentStatus, input.action)
  const { error } = await supabase
    .from('mission_participants')
    .update({
      status,
      merchant_review_note: input.note,
      approved_at: status === 'active' ? new Date().toISOString() : null,
    })
    .eq('id', input.participantId)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath(`/${input.locale}/merchants/missions`)
  return { ok: true as const }
}

export async function reviewSubmissionAction(input: {
  submissionId: string
  currentStatus: 'pending' | 'submitted' | 'revision_requested' | 'approved' | 'rejected'
  action: 'approve' | 'request_revision' | 'reject'
  feedback: string
  locale: string
}) {
  const supabase = await createSupabaseServerClient()
  const status = reviewSubmission(input.currentStatus, input.action)
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('mission_milestone_submissions')
    .update({
      status,
      merchant_feedback: input.feedback,
      reviewed_at: new Date().toISOString(),
      reviewed_by: auth.user?.id ?? null,
    })
    .eq('id', input.submissionId)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath(`/${input.locale}/merchants/missions`)
  return { ok: true as const }
}

export async function updateSettlementAction(input: SettlementUpdateInput & { settlementId: string; locale: string }) {
  const validation = validateSettlementUpdate(input)
  if (!validation.ok) return { ok: false as const, errors: validation.errors }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from('mission_settlements')
    .update({
      status: input.status,
      creator_payout_status: input.creatorPayoutStatus,
      kinnso_commission_status: input.kinnsoCommissionStatus,
      affiliate_commission_amount: input.affiliateCommissionAmount,
    })
    .eq('id', input.settlementId)
  if (error) return { ok: false as const, errors: { form: [error.message] } }
  revalidatePath(`/${input.locale}/ops/settlements`)
  return { ok: true as const }
}

export async function createPartnerLinkAction() {
  const validation = validatePartnerLinkRequest({
    programStatus: 'active',
    participantStatus: 'active',
    originalUrl: 'https://example.com',
  })
  if (!validation.ok) return { ok: false as const, errors: validation.errors }
  return { ok: false as const, errors: { form: ['Travelpayouts adapter is added in Task 4'] } }
}
```

- [ ] **Step 7: Run action/query tests**

Run:

```bash
pnpm --filter web test -- tests/mission.actions.test.ts tests/mission.queries.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add apps/web/tests/mission.actions.test.ts apps/web/tests/mission.queries.test.ts apps/web/lib/missions/fixtures.ts apps/web/lib/missions/queries.ts apps/web/lib/missions/actions.ts
git commit -m "feat: add mission server actions and queries"
```

---

### Task 4: Travelpayouts Server Adapter

**Files:**
- Create: `apps/web/tests/mission.travelpayouts.test.ts`
- Create: `apps/web/lib/missions/travelpayouts.ts`
- Modify: `apps/web/lib/missions/actions.ts`
- Modify: `apps/web/.env.example`

- [ ] **Step 1: Write failing Travelpayouts adapter tests**

Add `apps/web/tests/mission.travelpayouts.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildSubId,
  createTravelpayoutsPartnerLinks,
  normalizeTravelpayoutsAction,
} from '@/lib/missions/travelpayouts'

afterEach(() => vi.restoreAllMocks())

describe('Travelpayouts adapter', () => {
  it('builds stable creator tracking sub_id', () => {
    expect(buildSubId({ missionId: 'm1', participantId: 'p1', creatorId: 'c1' })).toBe('kinnso_m_m1_p_p1_c_c1')
  })

  it('creates partner links with server-side token and marker', async () => {
    vi.stubEnv('TRAVELPAYOUTS_API_TOKEN', 'test-token')
    vi.stubEnv('TRAVELPAYOUTS_PROJECT_ID', '197987')
    vi.stubEnv('TRAVELPAYOUTS_MARKER', '339296')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'success',
      status: 200,
      result: {
        links: [{ url: 'https://example.com/hotel', code: 'success', partner_url: 'https://tp.st/abc' }],
      },
    })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createTravelpayoutsPartnerLinks({
      links: [{ url: 'https://example.com/hotel', subId: 'creator-sub' }],
      shorten: true,
    })

    expect(result).toEqual([{ originalUrl: 'https://example.com/hotel', partnerUrl: 'https://tp.st/abc', status: 'success' }])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.travelpayouts.com/links/v1/create',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Access-Token': 'test-token' }),
      }),
    )
  })

  it('normalizes Travelpayouts finance/statistics actions', () => {
    expect(normalizeTravelpayoutsAction({
      action_id: '100:123',
      campaign_id: 100,
      action_state: 'paid',
      sub_id: 'kinnso_m_m1_p_p1_c_c1',
      price: '100.00',
      profit: '8.50',
      currency: 'usd',
      booked_at: '2026-06-18 10:00:00',
      updated_at: '2026-06-18 11:00:00',
    })).toMatchObject({
      externalActionId: '100:123',
      externalProgramId: '100',
      eventState: 'paid',
      subId: 'kinnso_m_m1_p_p1_c_c1',
      priceAmount: 100,
      profitAmount: 8.5,
      currency: 'usd',
    })
  })
})
```

- [ ] **Step 2: Run Travelpayouts test to verify failure**

Run:

```bash
pnpm --filter web test -- tests/mission.travelpayouts.test.ts
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement Travelpayouts adapter**

Add `apps/web/lib/missions/travelpayouts.ts`:

```ts
import 'server-only'

export interface TravelpayoutsLinkInput {
  url: string
  subId: string
}

export interface TravelpayoutsLinkResult {
  originalUrl: string
  partnerUrl: string
  status: 'success' | 'failed'
  message?: string
}

export function buildSubId(input: { missionId: string; participantId: string; creatorId: string }) {
  return `kinnso_m_${input.missionId}_p_${input.participantId}_c_${input.creatorId}`
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

export async function createTravelpayoutsPartnerLinks(input: {
  links: TravelpayoutsLinkInput[]
  shorten: boolean
}): Promise<TravelpayoutsLinkResult[]> {
  const token = requireEnv('TRAVELPAYOUTS_API_TOKEN')
  const trs = Number(requireEnv('TRAVELPAYOUTS_PROJECT_ID'))
  const marker = Number(requireEnv('TRAVELPAYOUTS_MARKER'))

  const response = await fetch('https://api.travelpayouts.com/links/v1/create', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Access-Token': token,
    },
    body: JSON.stringify({
      trs,
      marker,
      shorten: input.shorten,
      links: input.links.map((link) => ({ url: link.url, sub_id: link.subId })),
    }),
  })

  if (!response.ok) {
    throw new Error(`Travelpayouts link API failed: ${response.status}`)
  }

  const json = await response.json() as {
    result?: { links?: Array<{ url: string; code: string; message?: string; partner_url?: string }> }
  }

  return (json.result?.links ?? []).map((link) => ({
    originalUrl: link.url,
    partnerUrl: link.partner_url ?? '',
    status: link.code === 'success' ? 'success' : 'failed',
    message: link.message,
  }))
}

export function normalizeTravelpayoutsAction(raw: Record<string, unknown>) {
  const actionState = String(raw.action_state ?? raw.state ?? 'unknown')
  return {
    externalActionId: String(raw.action_id),
    externalProgramId: String(raw.campaign_id),
    eventState: ['processing', 'paid', 'cancelled'].includes(actionState) ? actionState : 'unknown',
    subId: raw.sub_id ? String(raw.sub_id) : null,
    priceAmount: raw.price ? Number(raw.price) : raw.price_usd ? Number(raw.price_usd) : null,
    profitAmount: raw.profit ? Number(raw.profit) : raw.paid_profit_usd ? Number(raw.paid_profit_usd) : null,
    currency: raw.currency ? String(raw.currency).toLowerCase() : 'usd',
    bookedAt: raw.booked_at ? String(raw.booked_at) : raw.date ? String(raw.date) : null,
    externalUpdatedAt: raw.updated_at ? String(raw.updated_at) : null,
  }
}
```

- [ ] **Step 4: Wire partner-link action to adapter**

Modify `apps/web/lib/missions/actions.ts` so `createPartnerLinkAction` accepts real input and inserts the generated link:

```ts
import { buildSubId, createTravelpayoutsPartnerLinks } from './travelpayouts'

export async function createPartnerLinkAction(input: {
  affiliateNetworkProgramId: string
  missionId: string
  missionParticipantId: string
  creatorId: string
  originalUrl: string
  programStatus: 'active' | 'paused' | 'archived'
  participantStatus: 'invited' | 'applied' | 'rejected' | 'active' | 'completed' | 'cancelled'
  locale: string
}) {
  const validation = validatePartnerLinkRequest({
    programStatus: input.programStatus,
    participantStatus: input.participantStatus,
    originalUrl: input.originalUrl,
  })
  if (!validation.ok) return { ok: false as const, errors: validation.errors }

  const supabase = await createSupabaseServerClient()
  const subId = buildSubId({
    missionId: input.missionId,
    participantId: input.missionParticipantId,
    creatorId: input.creatorId,
  })
  const [link] = await createTravelpayoutsPartnerLinks({
    shorten: true,
    links: [{ url: input.originalUrl, subId }],
  })
  if (!link || link.status !== 'success') {
    return { ok: false as const, errors: { form: [link?.message ?? 'Unable to create partner link'] } }
  }

  const { data, error } = await supabase
    .from('affiliate_partner_links')
    .insert({
      affiliate_network_program_id: input.affiliateNetworkProgramId,
      mission_id: input.missionId,
      mission_participant_id: input.missionParticipantId,
      creator_id: input.creatorId,
      network: 'travelpayouts',
      original_url: input.originalUrl,
      partner_url: link.partnerUrl,
      sub_id: subId,
      external_status: 'success',
    })
    .select('id, partner_url')
    .single()

  if (error) return { ok: false as const, errors: { form: [error.message] } }
  revalidatePath(`/${input.locale}/studio/missions`)
  return { ok: true as const, link: data }
}
```

- [ ] **Step 5: Add server-only env example names**

Modify `apps/web/.env.example`:

```env
# Travelpayouts affiliate network integration (server-only; never prefix with NEXT_PUBLIC_)
TRAVELPAYOUTS_API_TOKEN=replace_with_rotated_token_before_production
TRAVELPAYOUTS_PROJECT_ID=replace_with_travelpayouts_trs
TRAVELPAYOUTS_MARKER=replace_with_travelpayouts_marker
```

- [ ] **Step 6: Run Travelpayouts tests**

Run:

```bash
pnpm --filter web test -- tests/mission.travelpayouts.test.ts tests/mission.actions.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/web/tests/mission.travelpayouts.test.ts apps/web/lib/missions/travelpayouts.ts apps/web/lib/missions/actions.ts apps/web/.env.example
git commit -m "feat: add Travelpayouts mission adapter"
```

---

### Task 5: Auth Gate And Viewer Role Resolution

**Files:**
- Modify: `apps/web/tests/auth.gate.test.ts`
- Modify: `apps/web/lib/auth/gate.ts`
- Modify: `apps/web/lib/auth/viewer-role.ts`
- Modify: `apps/web/lib/auth/useViewerRole.ts`

- [ ] **Step 1: Extend auth gate tests**

Add these cases to `apps/web/tests/auth.gate.test.ts`:

```ts
it('redirects unauthenticated users from merchant mission creation', () => {
  expect(gateDecision('/en/merchants/post', false)).toEqual({
    type: 'redirect',
    location: '/en/sign-in',
  })
})

it('redirects unauthenticated users from merchant mission list', () => {
  expect(gateDecision('/zh-hk/merchants/missions', false)).toEqual({
    type: 'redirect',
    location: '/zh-hk/sign-in',
  })
})

it('redirects unauthenticated users from creator missions', () => {
  expect(gateDecision('/ja/studio/missions', false)).toEqual({
    type: 'redirect',
    location: '/ja/sign-in',
  })
})

it('redirects unauthenticated users from ops settlement queue', () => {
  expect(gateDecision('/en/ops/settlements', false)).toEqual({
    type: 'redirect',
    location: '/en/sign-in',
  })
})
```

- [ ] **Step 2: Run auth gate tests to verify failure**

Run:

```bash
pnpm --filter web test -- tests/auth.gate.test.ts
```

Expected: FAIL because only `/creator` is gated.

- [ ] **Step 3: Update gate logic**

Modify `apps/web/lib/auth/gate.ts`:

```ts
const gatedPrefixes = [
  'creator',
  'creator/',
  'merchants/post',
  'merchants/missions',
  'merchants/missions/',
  'studio/missions',
  'ops/settlements',
]

const needsAuth = gatedPrefixes.some((prefix) =>
  rest === prefix || rest.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`),
)

if (needsAuth) {
  if (hasSession) return { type: 'allow' }
  return { type: 'redirect', location: `/${maybeLocale}/sign-in` }
}
```

Remove the old creator-only `if` block after adding this logic.

- [ ] **Step 4: Add server role resolver**

Modify `apps/web/lib/auth/viewer-role.ts`:

```ts
export type ViewerRole = 'anon' | 'creator' | 'creator-pending' | 'merchant' | 'ops'

export async function resolveViewerRole(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<ViewerRole> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'anon'

  const { data: ops } = await supabase
    .from('kinnso_ops_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  if (ops) return 'ops'

  const { data: merchant } = await supabase
    .from('merchant_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (merchant) return 'merchant'

  return 'creator'
}
```

- [ ] **Step 5: Add client role fallback**

Modify `apps/web/lib/auth/useViewerRole.ts` so signed-in users still start as creator but upgrade to merchant or ops if the profile rows exist:

```ts
supabase.auth.getUser().then(async ({ data }) => {
  if (!active) return
  if (!data.user) {
    setRole('anon')
    return
  }
  const [{ data: ops }, { data: merchant }] = await Promise.all([
    supabase.from('kinnso_ops_members').select('id').eq('user_id', data.user.id).eq('status', 'active').maybeSingle(),
    supabase.from('merchant_profiles').select('id').eq('user_id', data.user.id).maybeSingle(),
  ])
  if (!active) return
  setRole(ops ? 'ops' : merchant ? 'merchant' : 'creator')
})
```

- [ ] **Step 6: Run auth tests**

Run:

```bash
pnpm --filter web test -- tests/auth.gate.test.ts tests/auth.useViewerRole.test.tsx
```

Expected: PASS. Update `auth.useViewerRole.test.tsx` mocks if they assume only `creator`.

- [ ] **Step 7: Commit Task 5**

```bash
git add apps/web/tests/auth.gate.test.ts apps/web/lib/auth/gate.ts apps/web/lib/auth/viewer-role.ts apps/web/lib/auth/useViewerRole.ts apps/web/tests/auth.useViewerRole.test.tsx
git commit -m "feat: gate mission routes"
```

---

### Task 6: Merchant Mission Creation Wizard

**Files:**
- Create: `apps/web/tests/kinnso.MissionPostWizard.test.tsx`
- Create: `apps/web/components/kinnso/pages/MissionPostWizard.tsx`
- Replace: `apps/web/app/[locale]/merchants/post/page.tsx`
- Modify: `apps/web/lib/i18n/messages/*.ts`

- [ ] **Step 1: Write failing wizard component test**

Add `apps/web/tests/kinnso.MissionPostWizard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionPostWizard } from '@/components/kinnso/pages/MissionPostWizard'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('MissionPostWizard', () => {
  it('shows coupon fields for coupon affiliate missions', () => {
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: en.missions.typeCoupon }))
    expect(screen.getByLabelText(en.missions.couponCode)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.creatorCommissionRate)).toBeTruthy()
  })

  it('shows paid fee and milestone fields for paid missions', () => {
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: en.missions.typePaid }))
    expect(screen.getByLabelText(en.missions.paidFeeAmount)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.milestoneTitle)).toBeTruthy()
  })

  it('submits a draft payload', () => {
    const onSubmit = vi.fn()
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Test mission' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Mission summary' } })
    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Test mission' }), { publish: false })
  })
})
```

- [ ] **Step 2: Run wizard test to verify failure**

Run:

```bash
pnpm --filter web test -- tests/kinnso.MissionPostWizard.test.tsx
```

Expected: FAIL with missing component/messages.

- [ ] **Step 3: Add English mission messages and mirror keys to all locales**

Modify `apps/web/lib/i18n/messages/en.ts` interface and object with:

```ts
missions: {
  postHeading: string
  postSub: string
  typeCoupon: string
  typeHybrid: string
  typePaid: string
  title: string
  summary: string
  couponCode: string
  couponUrl: string
  affiliateCommissionRate: string
  kinnsoCommissionRate: string
  creatorCommissionRate: string
  paidFeeAmount: string
  paidFeeCurrency: string
  milestoneTitle: string
  milestoneDescription: string
  saveDraft: string
  publish: string
  openMission: string
  targetedMission: string
  validationError: string
}
```

Set English copy:

```ts
missions: {
  postHeading: 'Post a mission',
  postSub: 'Create coupon, hybrid, or paid creator work in one flow.',
  typeCoupon: 'Coupon affiliate',
  typeHybrid: 'Affiliate + paid mission',
  typePaid: 'Paid mission only',
  title: 'Mission title',
  summary: 'Mission summary',
  couponCode: 'Coupon code',
  couponUrl: 'Coupon URL',
  affiliateCommissionRate: 'Affiliate commission rate',
  kinnsoCommissionRate: 'KINNSO commission rate',
  creatorCommissionRate: 'Creator commission rate',
  paidFeeAmount: 'Paid mission fee',
  paidFeeCurrency: 'Currency',
  milestoneTitle: 'Milestone title',
  milestoneDescription: 'Milestone description',
  saveDraft: 'Save draft',
  publish: 'Publish',
  openMission: 'Open mission',
  targetedMission: 'Targeted invite',
  validationError: 'Check the highlighted fields and try again.',
}
```

For `ja`, `ko`, `th`, `zh-cn`, `zh-hk`, `zh-tw`, add the same keys with English fallback copy if translations are not ready.

- [ ] **Step 4: Implement wizard component**

Add `apps/web/components/kinnso/pages/MissionPostWizard.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { MissionDraftInput, MissionType, MissionVisibility } from '@/lib/missions/types'
import { validateMissionDraft } from '@/lib/missions/validation'

interface Props {
  locale: string
  t: Messages['missions']
  onSubmit: (input: MissionDraftInput, opts: { publish: boolean }) => void | Promise<void>
}

export function MissionPostWizard({ t, onSubmit }: Props) {
  const [missionType, setMissionType] = useState<MissionType>('coupon_affiliate')
  const [visibility, setVisibility] = useState<MissionVisibility>('open')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [couponUrl, setCouponUrl] = useState('')
  const [affiliateCommissionRate, setAffiliateCommissionRate] = useState('10')
  const [kinnsoCommissionRate, setKinnsoCommissionRate] = useState('4')
  const [creatorCommissionRate, setCreatorCommissionRate] = useState('6')
  const [paidFeeAmount, setPaidFeeAmount] = useState('')
  const [paidFeeCurrency, setPaidFeeCurrency] = useState('HKD')
  const [milestoneTitle, setMilestoneTitle] = useState('')
  const [milestoneDescription, setMilestoneDescription] = useState('')
  const [error, setError] = useState('')

  const buildInput = (): MissionDraftInput => ({
    missionSource: 'merchant',
    missionType,
    visibility,
    title,
    summary,
    couponCode: couponCode || null,
    couponUrl: couponUrl || null,
    affiliateCommissionRate: affiliateCommissionRate ? Number(affiliateCommissionRate) : null,
    kinnsoCommissionRate: kinnsoCommissionRate ? Number(kinnsoCommissionRate) : null,
    creatorCommissionRate: creatorCommissionRate ? Number(creatorCommissionRate) : null,
    paidFeeAmount: paidFeeAmount ? Number(paidFeeAmount) : null,
    paidFeeCurrency: paidFeeCurrency || null,
    affiliateNetworkProgramId: null,
    milestones: milestoneTitle
      ? [{ title: milestoneTitle, description: milestoneDescription || milestoneTitle }]
      : [],
  })

  const submit = async (publish: boolean) => {
    const input = buildInput()
    const validation = validateMissionDraft(input)
    if (!validation.ok) {
      setError(t.validationError)
      return
    }
    setError('')
    await onSubmit(input, { publish })
  }

  return (
    <div className="k-container py-10">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-black text-kinnso-ink">{t.postHeading}</h1>
        <p className="mt-1 text-sm text-kinnso-muted">{t.postSub}</p>
      </div>

      <form className="mt-8 grid gap-6" onSubmit={(event) => event.preventDefault()}>
        <section className="grid gap-3">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mission type">
            {[
              ['coupon_affiliate', t.typeCoupon],
              ['hybrid', t.typeHybrid],
              ['paid', t.typePaid],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={missionType === value}
                onClick={() => setMissionType(value as MissionType)}
                className={missionType === value ? 'k-btn-primary' : 'k-btn-ghost'}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <label className="grid gap-1 text-sm font-semibold text-kinnso-ink">
          {t.title}
          <input className="rounded-lg bg-white px-3 py-2 ring-1 ring-kinnso-cream2" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label className="grid gap-1 text-sm font-semibold text-kinnso-ink">
          {t.summary}
          <textarea className="min-h-24 rounded-lg bg-white px-3 py-2 ring-1 ring-kinnso-cream2" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>

        <div className="flex gap-2">
          <button type="button" className={visibility === 'open' ? 'k-btn-primary' : 'k-btn-ghost'} onClick={() => setVisibility('open')}>{t.openMission}</button>
          <button type="button" className={visibility === 'targeted' ? 'k-btn-primary' : 'k-btn-ghost'} onClick={() => setVisibility('targeted')}>{t.targetedMission}</button>
        </div>

        {(missionType === 'coupon_affiliate' || missionType === 'hybrid') && (
          <section className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-kinnso-ink">{t.couponCode}<input className="rounded-lg bg-white px-3 py-2 ring-1 ring-kinnso-cream2" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} /></label>
            <label className="grid gap-1 text-sm font-semibold text-kinnso-ink">{t.couponUrl}<input className="rounded-lg bg-white px-3 py-2 ring-1 ring-kinnso-cream2" value={couponUrl} onChange={(e) => setCouponUrl(e.target.value)} /></label>
            <label className="grid gap-1 text-sm font-semibold text-kinnso-ink">{t.affiliateCommissionRate}<input className="rounded-lg bg-white px-3 py-2 ring-1 ring-kinnso-cream2" value={affiliateCommissionRate} onChange={(e) => setAffiliateCommissionRate(e.target.value)} /></label>
            <label className="grid gap-1 text-sm font-semibold text-kinnso-ink">{t.kinnsoCommissionRate}<input className="rounded-lg bg-white px-3 py-2 ring-1 ring-kinnso-cream2" value={kinnsoCommissionRate} onChange={(e) => setKinnsoCommissionRate(e.target.value)} /></label>
            <label className="grid gap-1 text-sm font-semibold text-kinnso-ink">{t.creatorCommissionRate}<input className="rounded-lg bg-white px-3 py-2 ring-1 ring-kinnso-cream2" value={creatorCommissionRate} onChange={(e) => setCreatorCommissionRate(e.target.value)} /></label>
          </section>
        )}

        {(missionType === 'paid' || missionType === 'hybrid') && (
          <section className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-kinnso-ink">{t.paidFeeAmount}<input className="rounded-lg bg-white px-3 py-2 ring-1 ring-kinnso-cream2" value={paidFeeAmount} onChange={(e) => setPaidFeeAmount(e.target.value)} /></label>
            <label className="grid gap-1 text-sm font-semibold text-kinnso-ink">{t.paidFeeCurrency}<input className="rounded-lg bg-white px-3 py-2 ring-1 ring-kinnso-cream2" value={paidFeeCurrency} onChange={(e) => setPaidFeeCurrency(e.target.value)} /></label>
            <label className="grid gap-1 text-sm font-semibold text-kinnso-ink">{t.milestoneTitle}<input className="rounded-lg bg-white px-3 py-2 ring-1 ring-kinnso-cream2" value={milestoneTitle} onChange={(e) => setMilestoneTitle(e.target.value)} /></label>
            <label className="grid gap-1 text-sm font-semibold text-kinnso-ink">{t.milestoneDescription}<input className="rounded-lg bg-white px-3 py-2 ring-1 ring-kinnso-cream2" value={milestoneDescription} onChange={(e) => setMilestoneDescription(e.target.value)} /></label>
          </section>
        )}

        {error && <p className="text-sm font-semibold text-kinnso-red">{error}</p>}

        <div className="flex gap-2">
          <button type="button" className="k-btn-ghost" onClick={() => submit(false)}>{t.saveDraft}</button>
          <button type="button" className="k-btn-primary" onClick={() => submit(true)}>{t.publish}</button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 5: Replace `/merchants/post` route host**

Modify `apps/web/app/[locale]/merchants/post/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createMissionAction } from '@/lib/missions/actions'
import { MissionPostWizard } from '@/components/kinnso/pages/MissionPostWizard'
import type { MissionDraftInput } from '@/lib/missions/types'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function MerchantPostPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  async function submitMission(input: MissionDraftInput, opts: { publish: boolean }) {
    'use server'
    return createMissionAction(input, { publish: opts.publish, locale })
  }

  return <MissionPostWizard locale={locale} t={messages.missions} onSubmit={submitMission} />
}
```

- [ ] **Step 6: Run wizard/i18n tests**

Run:

```bash
pnpm --filter web test -- tests/kinnso.MissionPostWizard.test.tsx tests/i18n.locale-parity.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add 'apps/web/app/[locale]/merchants/post/page.tsx' apps/web/components/kinnso/pages/MissionPostWizard.tsx apps/web/tests/kinnso.MissionPostWizard.test.tsx apps/web/lib/i18n/messages
git commit -m "feat: add merchant mission wizard"
```

---

### Task 7: Creator, Merchant, And Ops Mission Surfaces

**Files:**
- Create: `apps/web/tests/kinnso.CreatorMissionsView.test.tsx`
- Create: `apps/web/tests/kinnso.MerchantMissionsView.test.tsx`
- Create: `apps/web/tests/kinnso.MissionDetailView.test.tsx`
- Create: `apps/web/tests/kinnso.OpsSettlementView.test.tsx`
- Create: `apps/web/components/kinnso/MissionStatusBadge.tsx`
- Create: `apps/web/components/kinnso/MissionCompensationSummary.tsx`
- Create: `apps/web/components/kinnso/SocialSignalBadge.tsx`
- Create: `apps/web/components/kinnso/pages/CreatorMissionsView.tsx`
- Create: `apps/web/components/kinnso/pages/MerchantMissionsView.tsx`
- Create: `apps/web/components/kinnso/pages/MissionDetailView.tsx`
- Create: `apps/web/components/kinnso/pages/OpsSettlementView.tsx`
- Create: `apps/web/app/[locale]/merchants/missions/page.tsx`
- Create: `apps/web/app/[locale]/merchants/missions/[missionId]/page.tsx`
- Replace: `apps/web/app/[locale]/studio/missions/page.tsx`
- Create: `apps/web/app/[locale]/ops/settlements/page.tsx`

- [ ] **Step 1: Write component smoke tests**

Add `apps/web/tests/kinnso.CreatorMissionsView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreatorMissionsView } from '@/components/kinnso/pages/CreatorMissionsView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const missions = [{
  id: 'm1',
  title: 'Travelpayouts hotel program',
  summary: 'Join and create tracked links.',
  missionSource: 'travelpayouts' as const,
  missionType: 'coupon_affiliate' as const,
  status: 'published' as const,
  participant: null,
  partnerLinks: [],
  compensation: 'Affiliate commission',
}]

describe('CreatorMissionsView', () => {
  it('renders auto-join mission cards and calls join', () => {
    const onJoin = vi.fn()
    render(<CreatorMissionsView t={en.missions} missions={missions} onJoin={onJoin} onCreateLink={vi.fn()} />)
    expect(screen.getByText('Travelpayouts hotel program')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.missions.joinMission }))
    expect(onJoin).toHaveBeenCalledWith('m1')
  })
})
```

Add `apps/web/tests/kinnso.MerchantMissionsView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MerchantMissionsView } from '@/components/kinnso/pages/MerchantMissionsView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('MerchantMissionsView', () => {
  it('shows mission status and participant counts', () => {
    render(<MerchantMissionsView t={en.missions} missions={[{
      id: 'm1',
      title: 'Paid reel campaign',
      status: 'published',
      participantCount: 2,
      pendingCount: 1,
      settlementStatus: 'pending',
    }]} />)
    expect(screen.getByText('Paid reel campaign')).toBeTruthy()
    expect(screen.getByText(/2/)).toBeTruthy()
    expect(screen.getByText(/pending/i)).toBeTruthy()
  })
})
```

Add similar smoke tests for `MissionDetailView` and `OpsSettlementView`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionDetailView } from '@/components/kinnso/pages/MissionDetailView'
import { OpsSettlementView } from '@/components/kinnso/pages/OpsSettlementView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('MissionDetailView', () => {
  it('lets merchant approve an applicant', () => {
    const onReviewParticipant = vi.fn()
    render(<MissionDetailView t={en.missions} mission={{
      id: 'm1',
      title: 'Hybrid mission',
      participants: [{ id: 'p1', creatorName: 'Creator One', status: 'applied' }],
      submissions: [],
    }} onReviewParticipant={onReviewParticipant} onReviewSubmission={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: en.missions.approve }))
    expect(onReviewParticipant).toHaveBeenCalledWith('p1', 'approve')
  })
})

describe('OpsSettlementView', () => {
  it('lets ops update settlement rows', () => {
    const onUpdate = vi.fn()
    render(<OpsSettlementView t={en.ops} settlements={[{
      id: 's1',
      missionTitle: 'Affiliate booking',
      status: 'pending',
      creatorPayoutStatus: 'pending',
      kinnsoCommissionStatus: 'pending',
    }]} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('button', { name: en.ops.markPaid }))
    expect(onUpdate).toHaveBeenCalledWith('s1', 'paid')
  })
})
```

- [ ] **Step 2: Run component tests to verify failure**

Run:

```bash
pnpm --filter web test -- tests/kinnso.CreatorMissionsView.test.tsx tests/kinnso.MerchantMissionsView.test.tsx tests/kinnso.MissionDetailView.test.tsx tests/kinnso.OpsSettlementView.test.tsx
```

Expected: FAIL with missing components/message keys.

- [ ] **Step 3: Add missing message keys**

Extend `Messages['missions']` with:

```ts
joinMission: string
applyMission: string
generatePartnerLink: string
approve: string
reject: string
requestRevision: string
submitMilestone: string
participants: string
pendingApplications: string
settlement: string
```

Add `ops` group:

```ts
ops: {
  settlementHeading: string
  settlementSub: string
  markPaid: string
  statusPending: string
  statusPaid: string
}
```

Use English fallback values in all locale files to keep `i18n.locale-parity.test.ts` passing.

- [ ] **Step 4: Implement shared mission display components**

Add `apps/web/components/kinnso/MissionStatusBadge.tsx`:

```tsx
export function MissionStatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-pill bg-kinnso-cream2 px-2.5 py-1 text-xs font-semibold text-kinnso-ink">
      {status.replaceAll('_', ' ')}
    </span>
  )
}
```

Add `apps/web/components/kinnso/MissionCompensationSummary.tsx`:

```tsx
export function MissionCompensationSummary({ text }: { text: string }) {
  return <p className="text-sm font-semibold text-kinnso-orange">{text}</p>
}
```

Add `apps/web/components/kinnso/SocialSignalBadge.tsx`:

```tsx
export function SocialSignalBadge({ status }: { status: 'verified_signal' | 'needs_review' | 'unavailable' }) {
  const label = status === 'verified_signal' ? 'Verified signal' : status === 'needs_review' ? 'Needs review' : 'Unavailable'
  return <span className="rounded-pill bg-kinnso-blue/10 px-2 py-1 text-xs text-kinnso-blue">{label}</span>
}
```

- [ ] **Step 5: Implement page components**

Implement page components using the test props first:

```tsx
// apps/web/components/kinnso/pages/CreatorMissionsView.tsx
'use client'
import type { Messages } from '@/lib/i18n/messages/en'
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import { MissionCompensationSummary } from '@/components/kinnso/MissionCompensationSummary'

export interface CreatorMissionCard {
  id: string
  title: string
  summary: string
  missionSource: 'merchant' | 'travelpayouts'
  missionType: 'coupon_affiliate' | 'hybrid' | 'paid'
  status: string
  participant: { id: string; status: string } | null
  partnerLinks: Array<{ id: string; partnerUrl: string }>
  compensation: string
}

export function CreatorMissionsView({
  t,
  missions,
  onJoin,
  onCreateLink,
}: {
  t: Messages['missions']
  missions: CreatorMissionCard[]
  onJoin: (missionId: string) => void
  onCreateLink: (missionId: string) => void
}) {
  return (
    <div className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.tabWorking}</h1>
      <div className="mt-6 grid gap-4">
        {missions.map((mission) => (
          <article key={mission.id} className="k-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-kinnso-ink">{mission.title}</h2>
                <p className="mt-1 text-sm text-kinnso-muted">{mission.summary}</p>
                <MissionCompensationSummary text={mission.compensation} />
              </div>
              <MissionStatusBadge status={mission.participant?.status ?? mission.status} />
            </div>
            <div className="mt-4 flex gap-2">
              {!mission.participant && <button type="button" className="k-btn-primary text-sm" onClick={() => onJoin(mission.id)}>{t.joinMission}</button>}
              {mission.missionSource === 'travelpayouts' && mission.participant?.status === 'active' && (
                <button type="button" className="k-btn-ghost text-sm" onClick={() => onCreateLink(mission.id)}>{t.generatePartnerLink}</button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
```

Follow the same prop-first pattern for `MerchantMissionsView`, `MissionDetailView`, and `OpsSettlementView`; keep them compact, table/list based, and do not use nested cards.

- [ ] **Step 6: Add route hosts**

Add hosts that load Supabase data with `createSupabaseServerClient`, call query helpers, map rows into component props, and wire server action callbacks. Each host must validate locale with `isLocale`.

Use this shape for `apps/web/app/[locale]/studio/missions/page.tsx`:

```tsx
import { redirect, notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { listCreatorMissions } from '@/lib/missions/queries'
import { joinMissionAction, createPartnerLinkAction } from '@/lib/missions/actions'
import { CreatorMissionsView } from '@/components/kinnso/pages/CreatorMissionsView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function StudioMissionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect(`/${locale}/sign-in`)

  const { data } = await listCreatorMissions(supabase, auth.user.id)
  const missions = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    missionSource: row.mission_source,
    missionType: row.mission_type,
    status: row.status,
    participant: null,
    partnerLinks: [],
    compensation: row.paid_fee_amount ? `${row.paid_fee_currency ?? 'HKD'} ${row.paid_fee_amount}` : 'Affiliate commission',
  }))

  async function join(missionId: string) {
    'use server'
    const mission = missions.find((m) => m.id === missionId)
    if (!mission) return
    await joinMissionAction({ missionId, missionType: mission.missionType, missionSource: mission.missionSource, locale })
  }

  async function createLink(missionId: string) {
    'use server'
    void missionId
  }

  return <CreatorMissionsView t={messages.missions} missions={missions} onJoin={join} onCreateLink={createLink} />
}
```

Use the same pattern for merchant list/detail and ops settlement, replacing `void missionId` in later refinement with actual partner-link form input.

- [ ] **Step 7: Run component and route host tests**

Run:

```bash
pnpm --filter web test -- tests/kinnso.CreatorMissionsView.test.tsx tests/kinnso.MerchantMissionsView.test.tsx tests/kinnso.MissionDetailView.test.tsx tests/kinnso.OpsSettlementView.test.tsx tests/i18n.locale-parity.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 7**

```bash
git add 'apps/web/app/[locale]/merchants/missions' 'apps/web/app/[locale]/studio/missions/page.tsx' 'apps/web/app/[locale]/ops' apps/web/components/kinnso apps/web/tests/kinnso.*Mission*.test.tsx apps/web/tests/kinnso.OpsSettlementView.test.tsx apps/web/lib/i18n/messages
git commit -m "feat: add mission surfaces"
```

---

### Task 8: Social Enrichment Snapshot Boundary

**Files:**
- Create: `apps/web/lib/missions/social-enrichment.ts`
- Modify: `apps/web/tests/mission.actions.test.ts`
- Modify: `apps/web/lib/missions/actions.ts`
- Modify: `apps/web/components/kinnso/pages/MissionDetailView.tsx`

- [ ] **Step 1: Add enrichment boundary**

Add `apps/web/lib/missions/social-enrichment.ts`:

```ts
import 'server-only'

export type SocialPlatform = 'instagram' | 'threads'
export type ConfidenceStatus = 'verified_signal' | 'needs_review' | 'unavailable'

export interface SocialSnapshotInput {
  platform: SocialPlatform
  handle?: string | null
  proofUrl?: string | null
}

export interface SocialSnapshotResult {
  platform: SocialPlatform
  handle: string | null
  proofUrl: string | null
  followerCount: number | null
  profileMediaUrl: string | null
  postMediaUrl: string | null
  engagementCount: number | null
  confidenceStatus: ConfidenceStatus
  rawResponseChecksum: string | null
}

export async function fetchSocialSnapshot(input: SocialSnapshotInput): Promise<SocialSnapshotResult> {
  return {
    platform: input.platform,
    handle: input.handle ?? null,
    proofUrl: input.proofUrl ?? null,
    followerCount: null,
    profileMediaUrl: null,
    postMediaUrl: null,
    engagementCount: null,
    confidenceStatus: 'unavailable',
    rawResponseChecksum: null,
  }
}
```

- [ ] **Step 2: Add test for non-blocking enrichment**

Append to `apps/web/tests/mission.actions.test.ts`:

```ts
it('social enrichment boundary returns unavailable instead of throwing', async () => {
  const { fetchSocialSnapshot } = await import('@/lib/missions/social-enrichment')
  await expect(fetchSocialSnapshot({ platform: 'instagram', proofUrl: 'https://instagram.com/p/demo' })).resolves.toMatchObject({
    confidenceStatus: 'unavailable',
  })
})
```

- [ ] **Step 3: Show signal badge in MissionDetailView**

In `MissionDetailView`, render `SocialSignalBadge` for any submission snapshot prop. If no snapshot exists, render `SocialSignalBadge` with `unavailable`.

- [ ] **Step 4: Run action/detail tests**

Run:

```bash
pnpm --filter web test -- tests/mission.actions.test.ts tests/kinnso.MissionDetailView.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 8**

```bash
git add apps/web/lib/missions/social-enrichment.ts apps/web/lib/missions/actions.ts apps/web/components/kinnso/pages/MissionDetailView.tsx apps/web/tests/mission.actions.test.ts apps/web/tests/kinnso.MissionDetailView.test.tsx
git commit -m "feat: add mission social enrichment boundary"
```

---

### Task 9: Full Verification And Polish

**Files:**
- Modify only files touched by previous tasks.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm --filter web test -- tests/mission.validation.test.ts tests/mission.state.test.ts tests/mission.actions.test.ts tests/mission.queries.test.ts tests/mission.travelpayouts.test.ts tests/kinnso.MissionPostWizard.test.tsx tests/kinnso.CreatorMissionsView.test.tsx tests/kinnso.MerchantMissionsView.test.tsx tests/kinnso.MissionDetailView.test.tsx tests/kinnso.OpsSettlementView.test.tsx tests/auth.gate.test.ts tests/i18n.locale-parity.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full web tests**

Run:

```bash
pnpm --filter web test
```

Expected: PASS or known service-role-gated Supabase tests SKIP when env is absent.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter web typecheck
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm --filter web lint
```

Expected: exit code 0. Existing warnings may remain, but no new mission-specific errors.

- [ ] **Step 5: Run production build**

Run:

```bash
pnpm --filter web build
```

Expected: PASS. Confirm mission routes appear in the route table:

- `/[locale]/merchants/post`
- `/[locale]/merchants/missions`
- `/[locale]/merchants/missions/[missionId]`
- `/[locale]/studio/missions`
- `/[locale]/ops/settlements`

- [ ] **Step 6: Run schema verification**

Run:

```bash
supabase migration list --local
```

Expected: the mission table, RLS, and grant migrations appear after existing creator migrations.

- [ ] **Step 7: Manual smoke check**

Start the dev server if not already running:

```bash
pnpm --filter web dev
```

Then visit:

- `http://localhost:3000/en/merchants/post`
- `http://localhost:3000/en/studio/missions`
- `http://localhost:3000/en/ops/settlements`

Expected:

- Anonymous users redirect to `/en/sign-in`.
- Authenticated creator can see mission catalog.
- Merchant can see mission wizard/list.
- Ops-only surface denies non-ops through RLS/page-level empty state and loads for ops members.

- [ ] **Step 8: Final commit**

If verification changes files, commit them:

```bash
git status --short
git add \
  supabase/migrations \
  packages/db/types.ts \
  apps/web/lib/missions \
  apps/web/components/kinnso \
  'apps/web/app/[locale]/merchants/post/page.tsx' \
  'apps/web/app/[locale]/merchants/missions' \
  'apps/web/app/[locale]/studio/missions/page.tsx' \
  'apps/web/app/[locale]/ops' \
  apps/web/lib/auth \
  apps/web/lib/i18n/messages \
  apps/web/.env.example \
  apps/web/tests
git commit -m "test: verify merchant brief flow"
```

---

## Self-Review

Spec coverage:

- Authenticated merchant profiles: Task 2 schema/RLS, Task 3 queries/actions, Task 6 wizard route.
- KINNSO ops table and settlement authority: Task 2 schema/RLS, Task 7 ops surface.
- Three mission types: Task 1 validation/state, Task 6 wizard, Task 7 display surfaces.
- Unlimited creators: Task 2 participant uniqueness per creator/mission, no slot cap.
- Coupon/Travelpayouts auto-join: Task 1 state, Task 3 actions, Task 7 creator surface.
- Paid/hybrid approval: Task 1 state, Task 3 review action, Task 7 mission detail.
- Milestones and submissions: Task 2 schema, Task 3 actions, Task 7 surfaces.
- Instagram/Threads advisory enrichment: Task 8 boundary and UI signal.
- Travelpayouts programs, tracked links, imported event references: Task 2 schema, Task 4 adapter, Task 7 surfaces.
- Manual settlement only: Task 2 schema/RLS, Task 3 settlement action, Task 7 ops view.

Placeholder scan:

- The plan avoids unresolved placeholder markers.
- The only intentionally deferred external behavior is live Instagram/Threads scraping; Task 8 implements the required advisory boundary and non-blocking unavailable state for v1.

Type consistency:

- Mission enum values match the approved spec and database checks.
- Participant status uses `active` after approval; there is no separate `approved` participant status.
- Travelpayouts missions use `mission_source = 'travelpayouts'` and `mission_type = 'coupon_affiliate'`.
- Settlement updates remain ops-only and do not automate money movement.
