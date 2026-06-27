# Phase 8 — Analytics & Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship creator (`/studio/insights`) and merchant (`/merchants/insights`) analytics surfaces built only on data the platform already captures — zero fabricated metrics.

**Architecture:** Two read-only `SECURITY DEFINER` RPCs (`creator_insights`, `merchant_insights`) aggregate the caller's own data into a single `jsonb` each (compute-on-read, no new tables). Server-gated pages fetch via typed lib wrappers; tier math is derived in TS from the existing `lib/contribution/tiers.ts`; charts are tiny accessible hand-rolled SVG (no new dependency).

**Tech Stack:** Next.js (modified fork — see note), React 19, TypeScript, hosted Supabase (`scryfkefedzuetfdtrvl`), vitest, pnpm. i18n: 7 locales.

**⚠️ Modified Next.js:** `apps/web/AGENTS.md` requires reading the relevant guide in `node_modules/next/dist/docs/` BEFORE editing any page/layout/server-action. Tasks 7 and 8 (pages) must do this first.

**⚠️ Migration is controller-applied:** The migration in **Task 0** is applied live by the controller via the Supabase MCP **with explicit user consent**, then `packages/db/types.ts` is regenerated. Subagents do NOT touch the database and do NOT run `apply_migration`. Task 1 onward assumes the migration + regenerated types already exist.

**Sequential execution:** Shared git tree → strictly one task at a time, each committing before the next starts.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_insights_rpcs.sql` | 2 SECURITY DEFINER RPCs, grants. No tables. (Task 0, controller) |
| `apps/web/lib/i18n/messages/en.ts` (+ 6 locales) | `insights` i18n group + `Messages` interface (Task 1) |
| `apps/web/tests/i18n.locale-parity.test.ts` | add `'insights'` to `GROUPS` (Task 1) |
| `apps/web/components/kinnso/Sparkline.tsx` | accessible cumulative-line SVG (Task 2) |
| `apps/web/components/kinnso/BarRow.tsx` | accessible labelled horizontal bar (Task 2) |
| `apps/web/lib/insights/creator.ts` | `CreatorInsights` type + `getCreatorInsights` (Task 3) |
| `apps/web/lib/insights/merchant.ts` | `MerchantInsights` type + `getMerchantInsights` (Task 4) |
| `apps/web/components/kinnso/pages/CreatorInsightsView.tsx` | creator presentational view + empty states (Task 5) |
| `apps/web/components/kinnso/pages/MerchantInsightsView.tsx` | merchant presentational view + empty states (Task 6) |
| `apps/web/app/[locale]/studio/insights/page.tsx` | creator-gated host (Task 7) |
| `apps/web/app/[locale]/merchants/insights/page.tsx` | merchant-gated host (Task 8) |
| `apps/web/components/kinnso/StudioQuickLinks.tsx` + `Navbar.tsx` | Insights tile + merchant nav link (Task 9) |

---

## Task 0 (CONTROLLER, with user consent): Migration + types

> Not a subagent task. The controller applies this live via Supabase MCP `apply_migration` after the user approves, then regenerates `packages/db/types.ts` via the MCP `generate_typescript_types` tool. Committed as the first commit on the branch.

**File:** `supabase/migrations/<ts>_insights_rpcs.sql`

```sql
-- Phase 8 — Analytics & Insights. Two read-only SECURITY DEFINER aggregators.
-- No new tables. Each gates internally on the caller's identity and returns ONLY
-- that caller's own data as a single jsonb object. Honesty boundaries: no guide
-- views (not tracked), points not dollars, approved submissions (never the unused
-- 'completed' participant status) as the delivered-work signal.

create or replace function public.creator_insights()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_window_start timestamptz := date_trunc('week', now()) - interval '11 weeks';
begin
  if not exists (select 1 from public.creators where id = v_uid and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'points_total',
      coalesce((select sum(points) from public.creator_contribution_events where creator_id = v_uid), 0),
    'points_before_window',
      coalesce((select sum(points) from public.creator_contribution_events
                where creator_id = v_uid and created_at < v_window_start), 0),
    'points_by_type', coalesce((
      select jsonb_object_agg(event_type, pts) from (
        select event_type, sum(points) as pts
        from public.creator_contribution_events
        where creator_id = v_uid group by event_type) s
    ), '{}'::jsonb),
    'points_trajectory', coalesce((
      select jsonb_agg(jsonb_build_object('week_start', wk, 'points', pts) order by wk) from (
        select date_trunc('week', created_at)::date as wk, sum(points) as pts
        from public.creator_contribution_events
        where creator_id = v_uid and created_at >= v_window_start
        group by 1) t
    ), '[]'::jsonb),
    'guides_published',
      (select count(*) from public.guides where creator_id = v_uid and status = 'published'),
    'guide_saves_total',
      coalesce((select sum(saves_count) from public.guides
                where creator_id = v_uid and status = 'published'), 0),
    'missions_by_status', coalesce((
      select jsonb_object_agg(status, c) from (
        select status, count(*) as c from public.mission_participants
        where creator_id = v_uid group by status) m
    ), '{}'::jsonb),
    'submissions_approved', (
      select count(*) from public.mission_milestone_submissions s
      join public.mission_participants mp on mp.id = s.mission_participant_id
      where mp.creator_id = v_uid and s.status = 'approved')
  );
end $$;

create or replace function public.merchant_insights()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_merchant uuid;
begin
  select id into v_merchant from public.merchant_profiles
    where user_id = v_uid and status = 'active';
  if v_merchant is null then raise exception 'forbidden' using errcode = '42501'; end if;

  return jsonb_build_object(
    'missions_published', (
      select count(*) from public.missions
      where merchant_profile_id = v_merchant and status = 'published'),
    'per_mission', coalesce((
      select jsonb_agg(m order by m->>'title') from (
        select jsonb_build_object(
          'mission_id', mi.id,
          'title', mi.title,
          'status', mi.status,
          'invited',  count(mp.id) filter (where mp.status = 'invited'),
          'applied',  count(mp.id) filter (where mp.status = 'applied'),
          'active',   count(mp.id) filter (where mp.status = 'active'),
          'rejected', count(mp.id) filter (where mp.status = 'rejected'),
          'approved_submissions', (
            select count(*) from public.mission_milestone_submissions s
            join public.mission_participants mp2 on mp2.id = s.mission_participant_id
            where mp2.mission_id = mi.id and s.status = 'approved')
        ) as m
        from public.missions mi
        left join public.mission_participants mp on mp.mission_id = mi.id
        where mi.merchant_profile_id = v_merchant
        group by mi.id, mi.title, mi.status
      ) rows
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'participants', count(mp.id),
        'invited',  count(mp.id) filter (where mp.source = 'merchant_invite'),
        'accepted', count(mp.id) filter (where mp.source = 'merchant_invite' and mp.status = 'active'),
        'approved_submissions', (
          select count(*) from public.mission_milestone_submissions s
          join public.mission_participants mp3 on mp3.id = s.mission_participant_id
          join public.missions mi3 on mi3.id = mp3.mission_id
          where mi3.merchant_profile_id = v_merchant and s.status = 'approved')
      )
      from public.mission_participants mp
      join public.missions mi2 on mi2.id = mp.mission_id
      where mi2.merchant_profile_id = v_merchant
    )
  );
end $$;

-- Grants: Supabase default privileges re-grant EXECUTE to anon/authenticated on new
-- public functions, so revoke from BOTH public and anon (advisor 0028), then grant
-- only authenticated. Ownership gate is internal (defense in depth behind page gates).
revoke all on function public.creator_insights()  from public, anon;
revoke all on function public.merchant_insights() from public, anon;
grant execute on function public.creator_insights()  to authenticated;
grant execute on function public.merchant_insights() to authenticated;
```

**Controller verification after apply (SQL via MCP `execute_sql`):**
- `select grantee, privilege_type from information_schema.routine_privileges where routine_name in ('creator_insights','merchant_insights');` → no `anon`/`public` rows.
- `get_advisors(security)` → no new 0028 entry for these two.
- Regenerate `packages/db/types.ts`; commit migration + types together.

---

## Task 1: `insights` i18n group

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (add `insights` to the `Messages` interface + the `en` object)
- Modify: `apps/web/lib/i18n/messages/{ja,ko,th,zh-cn,zh-hk,zh-tw}.ts` (add `insights` values)
- Modify: `apps/web/tests/i18n.locale-parity.test.ts` (add `'insights'` to `GROUPS`)
- Test: `apps/web/tests/i18n.locale-parity.test.ts` (existing parity test)

The `insights` group (English copy; translate the values for the other 6 locales, keep keys identical):

```ts
insights: {
  // shared
  navLabel: 'Insights',
  empty: 'No activity yet.',
  // creator
  creatorTitle: 'Your insights',
  creatorSubtitle: 'Your real activity on KINNSO. These are contribution points from your work — not money.',
  pointsTotal: 'Contribution points',
  pointsTrajectory: 'Points over the last 12 weeks',
  pointsByType: 'Where your points come from',
  typeGuide: 'Published guides',
  typeMission: 'Verified missions',
  typeScan: 'DNA scan',
  tierProgress: 'Tier progress',
  tierAtMax: 'Top tier reached',
  pointsToNext: '{points} points to {tier}',
  guidesPublished: 'Published guides',
  guideSaves: 'Total saves',
  missionsTitle: 'Your missions',
  statusApplied: 'Applied',
  statusActive: 'Active',
  statusInvited: 'Invited',
  statusRejected: 'Not selected',
  deliverables: 'Approved deliverables',
  creatorEmptyPoints: 'Publish your first guide or complete a mission to start earning points.',
  creatorEmptyMissions: 'No mission activity yet. Browse open missions in your studio.',
  // merchant
  merchantTitle: 'Campaign insights',
  merchantSubtitle: 'Activity across the missions you have posted.',
  missionsPublished: 'Published missions',
  participants: 'Total participants',
  inviteAcceptRate: 'Invite acceptance',
  deliveredWork: 'Approved deliverables',
  perMissionTitle: 'By mission',
  colMission: 'Mission',
  colInvited: 'Invited',
  colApplied: 'Applied',
  colActive: 'Active',
  colRejected: 'Rejected',
  colDelivered: 'Delivered',
  merchantEmpty: 'Post a mission to start seeing campaign activity.',
  notApplicable: '—',
},
```

- [ ] **Step 1:** Add `'insights'` to the `GROUPS` array in `tests/i18n.locale-parity.test.ts` (line ~18, after `'merchantSearch'`).
- [ ] **Step 2:** Run `pnpm vitest run tests/i18n.locale-parity.test.ts` → Expected: FAIL (insights missing from all locales).
- [ ] **Step 3:** Add the `insights` block to the `Messages` interface and the `en` object in `en.ts`, then to each of the 6 other locale files (translated values, identical keys).
- [ ] **Step 4:** Run `pnpm vitest run tests/i18n.locale-parity.test.ts` → Expected: PASS.
- [ ] **Step 5:** Commit.

```bash
git add apps/web/lib/i18n/messages apps/web/tests/i18n.locale-parity.test.ts
git commit -m "feat(phase8): insights i18n group ×7 locales"
```

---

## Task 2: Chart primitives (`Sparkline`, `BarRow`)

**Files:**
- Create: `apps/web/components/kinnso/Sparkline.tsx`
- Create: `apps/web/components/kinnso/BarRow.tsx`
- Test: `apps/web/tests/kinnso.charts.test.tsx`

- [ ] **Step 1: Write the failing test** (`tests/kinnso.charts.test.tsx`):

```tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Sparkline } from '@/components/kinnso/Sparkline'
import { BarRow } from '@/components/kinnso/BarRow'

afterEach(cleanup)

describe('Sparkline', () => {
  it('renders an accessible img with the provided label and a polyline', () => {
    const { container } = render(<Sparkline values={[0, 10, 25, 40]} label="Points over time" />)
    const svg = screen.getByRole('img', { name: 'Points over time' })
    expect(svg).toBeTruthy()
    expect(container.querySelector('polyline')).toBeTruthy()
  })
  it('renders an empty-safe img with no polyline when there are no values', () => {
    const { container } = render(<Sparkline values={[]} label="Points over time" />)
    expect(screen.getByRole('img', { name: 'Points over time' })).toBeTruthy()
    expect(container.querySelector('polyline')).toBeNull()
  })
})

describe('BarRow', () => {
  it('renders label, value, and a bar sized to the fraction of max', () => {
    render(<BarRow label="Verified missions" value={40} max={100} />)
    expect(screen.getByText('Verified missions')).toBeTruthy()
    expect(screen.getByText('40')).toBeTruthy()
    const bar = screen.getByRole('img', { name: 'Verified missions: 40' })
    expect(bar).toBeTruthy()
  })
})
```

- [ ] **Step 2:** Run `pnpm vitest run tests/kinnso.charts.test.tsx` → Expected: FAIL (modules not found).
- [ ] **Step 3: Implement `Sparkline.tsx`:**

```tsx
interface SparklineProps {
  values: number[]
  label: string
  width?: number
  height?: number
}

/**
 * Tiny accessible line chart. `values` are plotted in order, scaled to fit.
 * The SVG is role="img" with an aria-label; shapes are aria-hidden. No deps.
 */
export function Sparkline({ values, label, width = 280, height = 64 }: SparklineProps) {
  const pad = 4
  const max = Math.max(1, ...values)
  const min = Math.min(0, ...values)
  const span = max - min || 1
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0
  const points = values
    .map((v, i) => {
      const x = pad + i * stepX
      const y = height - pad - ((v - min) / span) * (height - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
    >
      {values.length > 1 && (
        <polyline
          aria-hidden="true"
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}
```

- [ ] **Step 4: Implement `BarRow.tsx`:**

```tsx
interface BarRowProps {
  label: string
  value: number
  max: number
}

/**
 * Accessible labelled horizontal bar. The track is decorative (aria-hidden);
 * the row exposes an aria-label of "label: value" so screen readers get the datum.
 */
export function BarRow({ label, value, max }: BarRowProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 shrink-0 text-muted-foreground">{label}</span>
      <div
        role="img"
        aria-label={`${label}: ${value}`}
        className="relative h-2 flex-1 overflow-hidden rounded bg-muted"
      >
        <div aria-hidden="true" className="h-full rounded bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right tabular-nums">{value}</span>
    </div>
  )
}
```

- [ ] **Step 5:** Run `pnpm vitest run tests/kinnso.charts.test.tsx` → Expected: PASS.
- [ ] **Step 6:** Commit.

```bash
git add apps/web/components/kinnso/Sparkline.tsx apps/web/components/kinnso/BarRow.tsx apps/web/tests/kinnso.charts.test.tsx
git commit -m "feat(phase8): accessible Sparkline + BarRow chart primitives"
```

---

## Task 3: Creator insights lib (`getCreatorInsights`)

**Files:**
- Create: `apps/web/lib/insights/creator.ts`
- Test: `apps/web/tests/insights.creator.test.ts`

**Type + function:** The RPC returns a raw `jsonb`. We map it to camelCase, derive tier via `progressToNext`, and compute the cumulative trajectory (starting from `points_before_window`).

- [ ] **Step 1: Write the failing test** (`tests/insights.creator.test.ts`):

```ts
import { describe, expect, it, vi } from 'vitest'
import { getCreatorInsights } from '@/lib/insights/creator'

function client(raw: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data: raw, error })) } as never
}

const RAW = {
  points_total: 65,
  points_before_window: 25,
  points_by_type: { guide_published: 30, mission_verified: 40, dna_scan: 10 },
  points_trajectory: [
    { week_start: '2026-04-13', points: 15 },
    { week_start: '2026-06-08', points: 25 },
  ],
  guides_published: 2,
  guide_saves_total: 7,
  missions_by_status: { applied: 1, active: 1 },
  submissions_approved: 1,
}

describe('getCreatorInsights', () => {
  it('maps the RPC payload, derives tier, and builds a cumulative trajectory', async () => {
    const res = await getCreatorInsights(client(RAW))
    expect(res.pointsTotal).toBe(65)
    expect(res.pointsByType.mission_verified).toBe(40)
    expect(res.tier.tier).toBe('rising') // 65 >= 50
    expect(res.tier.pointsForNext).toBe(85) // 150 - 65
    // cumulative starts from points_before_window (25), then +15, +25
    expect(res.trajectory.map((p) => p.cumulative)).toEqual([40, 65])
    expect(res.missionsByStatus.active).toBe(1)
    expect(res.missionsByStatus.rejected).toBe(0) // missing key defaults to 0
    expect(res.submissionsApproved).toBe(1)
  })

  it('throws when the RPC errors', async () => {
    await expect(getCreatorInsights(client(null, new Error('forbidden')))).rejects.toThrow('forbidden')
  })
})
```

- [ ] **Step 2:** Run `pnpm vitest run tests/insights.creator.test.ts` → Expected: FAIL (module not found).
- [ ] **Step 3: Implement `lib/insights/creator.ts`:**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { progressToNext, type TierProgress, type ContributionEventType } from '@/lib/contribution/tiers'

type Client = SupabaseClient<Database>

export interface CreatorInsights {
  pointsTotal: number
  pointsByType: Record<ContributionEventType, number>
  trajectory: { weekStart: string; cumulative: number }[]
  tier: TierProgress
  guidesPublished: number
  guideSavesTotal: number
  missionsByStatus: { applied: number; active: number; invited: number; rejected: number }
  submissionsApproved: number
}

interface RawCreatorInsights {
  points_total: number
  points_before_window: number
  points_by_type: Partial<Record<ContributionEventType, number>>
  points_trajectory: { week_start: string; points: number }[]
  guides_published: number
  guide_saves_total: number
  missions_by_status: Partial<Record<string, number>>
  submissions_approved: number
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0))

export async function getCreatorInsights(supabase: Client): Promise<CreatorInsights> {
  const { data, error } = await supabase.rpc('creator_insights')
  if (error || !data) throw error ?? new Error('creator_insights returned no data')
  const raw = data as unknown as RawCreatorInsights

  let running = num(raw.points_before_window)
  const trajectory = (raw.points_trajectory ?? []).map((p) => {
    running += num(p.points)
    return { weekStart: p.week_start, cumulative: running }
  })

  const pointsTotal = num(raw.points_total)
  const status = raw.missions_by_status ?? {}
  return {
    pointsTotal,
    pointsByType: {
      dna_scan: num(raw.points_by_type?.dna_scan),
      guide_published: num(raw.points_by_type?.guide_published),
      mission_verified: num(raw.points_by_type?.mission_verified),
    },
    trajectory,
    tier: progressToNext(pointsTotal),
    guidesPublished: num(raw.guides_published),
    guideSavesTotal: num(raw.guide_saves_total),
    missionsByStatus: {
      applied: num(status.applied),
      active: num(status.active),
      invited: num(status.invited),
      rejected: num(status.rejected),
    },
    submissionsApproved: num(raw.submissions_approved),
  }
}
```

> If `@kinnso/db` types do not yet include `creator_insights` (regenerated in Task 0), `supabase.rpc('creator_insights')` will type-error. Task 0 regenerates the types first, so this compiles. Do NOT add `// @ts-expect-error`.

- [ ] **Step 4:** Run `pnpm vitest run tests/insights.creator.test.ts` → Expected: PASS.
- [ ] **Step 5:** Commit.

```bash
git add apps/web/lib/insights/creator.ts apps/web/tests/insights.creator.test.ts
git commit -m "feat(phase8): getCreatorInsights wrapper + tier/trajectory derivation"
```

---

## Task 4: Merchant insights lib (`getMerchantInsights`)

**Files:**
- Create: `apps/web/lib/insights/merchant.ts`
- Test: `apps/web/tests/insights.merchant.test.ts`

- [ ] **Step 1: Write the failing test** (`tests/insights.merchant.test.ts`):

```ts
import { describe, expect, it, vi } from 'vitest'
import { getMerchantInsights } from '@/lib/insights/merchant'

function client(raw: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data: raw, error })) } as never
}

const RAW = {
  missions_published: 2,
  per_mission: [
    { mission_id: 'm1', title: 'Summer brief', status: 'published',
      invited: 4, applied: 1, active: 2, rejected: 1, approved_submissions: 2 },
  ],
  totals: { participants: 5, invited: 4, accepted: 2, approved_submissions: 2 },
}

describe('getMerchantInsights', () => {
  it('maps the RPC payload and computes invite acceptance rate', async () => {
    const res = await getMerchantInsights(client(RAW))
    expect(res.missionsPublished).toBe(2)
    expect(res.perMission[0].approvedSubmissions).toBe(2)
    expect(res.totals.accepted).toBe(2)
    expect(res.inviteAcceptRate).toBeCloseTo(0.5) // 2 / 4
  })

  it('returns null acceptance rate when there are no invites', async () => {
    const res = await getMerchantInsights(client({ ...RAW, totals: { ...RAW.totals, invited: 0, accepted: 0 } }))
    expect(res.inviteAcceptRate).toBeNull()
  })

  it('throws when the RPC errors', async () => {
    await expect(getMerchantInsights(client(null, new Error('forbidden')))).rejects.toThrow('forbidden')
  })
})
```

- [ ] **Step 2:** Run `pnpm vitest run tests/insights.merchant.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement `lib/insights/merchant.ts`:**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface MerchantMissionRow {
  missionId: string
  title: string
  status: string
  invited: number
  applied: number
  active: number
  rejected: number
  approvedSubmissions: number
}

export interface MerchantInsights {
  missionsPublished: number
  perMission: MerchantMissionRow[]
  totals: { participants: number; invited: number; accepted: number; approvedSubmissions: number }
  inviteAcceptRate: number | null
}

interface RawMerchantInsights {
  missions_published: number
  per_mission: {
    mission_id: string; title: string; status: string
    invited: number; applied: number; active: number; rejected: number; approved_submissions: number
  }[]
  totals: { participants: number; invited: number; accepted: number; approved_submissions: number }
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0))

export async function getMerchantInsights(supabase: Client): Promise<MerchantInsights> {
  const { data, error } = await supabase.rpc('merchant_insights')
  if (error || !data) throw error ?? new Error('merchant_insights returned no data')
  const raw = data as unknown as RawMerchantInsights

  const invited = num(raw.totals?.invited)
  return {
    missionsPublished: num(raw.missions_published),
    perMission: (raw.per_mission ?? []).map((r) => ({
      missionId: r.mission_id,
      title: r.title,
      status: r.status,
      invited: num(r.invited),
      applied: num(r.applied),
      active: num(r.active),
      rejected: num(r.rejected),
      approvedSubmissions: num(r.approved_submissions),
    })),
    totals: {
      participants: num(raw.totals?.participants),
      invited,
      accepted: num(raw.totals?.accepted),
      approvedSubmissions: num(raw.totals?.approved_submissions),
    },
    inviteAcceptRate: invited > 0 ? num(raw.totals?.accepted) / invited : null,
  }
}
```

- [ ] **Step 4:** Run `pnpm vitest run tests/insights.merchant.test.ts` → Expected: PASS.
- [ ] **Step 5:** Commit.

```bash
git add apps/web/lib/insights/merchant.ts apps/web/tests/insights.merchant.test.ts
git commit -m "feat(phase8): getMerchantInsights wrapper + invite acceptance rate"
```

---

## Task 5: `CreatorInsightsView`

**Files:**
- Create: `apps/web/components/kinnso/pages/CreatorInsightsView.tsx`
- Test: `apps/web/tests/kinnso.CreatorInsightsView.test.tsx`

The view is `'use client'`, takes `t={messages.insights}` and `data: CreatorInsights`, renders: header, points-total + Sparkline trajectory, points-by-type BarRows, tier progress, guides (published + saves), missions-by-status, approved deliverables. Empty states: when `pointsTotal === 0` show `t.creatorEmptyPoints` instead of the trajectory/breakdown; when all mission statuses are 0 show `t.creatorEmptyMissions`.

- [ ] **Step 1: Write the failing test:**

```tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CreatorInsightsView } from '@/components/kinnso/pages/CreatorInsightsView'
import en from '@/lib/i18n/messages/en'
import type { CreatorInsights } from '@/lib/insights/creator'
import { progressToNext } from '@/lib/contribution/tiers'

afterEach(cleanup)

const base: CreatorInsights = {
  pointsTotal: 65,
  pointsByType: { dna_scan: 10, guide_published: 15, mission_verified: 40 },
  trajectory: [{ weekStart: '2026-06-08', cumulative: 65 }],
  tier: progressToNext(65),
  guidesPublished: 1,
  guideSavesTotal: 7,
  missionsByStatus: { applied: 1, active: 1, invited: 0, rejected: 0 },
  submissionsApproved: 1,
}

describe('CreatorInsightsView', () => {
  it('renders points total, tier progress, and the trajectory chart', () => {
    render(<CreatorInsightsView t={en.insights} data={base} />)
    expect(screen.getByRole('heading', { level: 1, name: en.insights.creatorTitle })).toBeTruthy()
    expect(screen.getByText('65')).toBeTruthy()
    expect(screen.getByRole('img', { name: en.insights.pointsTrajectory })).toBeTruthy()
  })

  it('shows the empty-points state when the creator has zero points', () => {
    render(<CreatorInsightsView t={en.insights} data={{ ...base, pointsTotal: 0,
      pointsByType: { dna_scan: 0, guide_published: 0, mission_verified: 0 }, trajectory: [] }} />)
    expect(screen.getByText(en.insights.creatorEmptyPoints)).toBeTruthy()
  })

  it('shows the empty-missions state when there is no mission activity', () => {
    render(<CreatorInsightsView t={en.insights} data={{ ...base,
      missionsByStatus: { applied: 0, active: 0, invited: 0, rejected: 0 }, submissionsApproved: 0 }} />)
    expect(screen.getByText(en.insights.creatorEmptyMissions)).toBeTruthy()
  })
})
```

- [ ] **Step 2:** Run `pnpm vitest run tests/kinnso.CreatorInsightsView.test.tsx` → Expected: FAIL.
- [ ] **Step 3: Implement** `CreatorInsightsView.tsx`. Use `t.pointsTrajectory` as the `Sparkline` label, `BarRow` for each event type (max = pointsTotal or the largest type value), and `progressToNext` values already on `data.tier`. Render `t.pointsToNext` with `{points}`/`{tier}` interpolated (replace via `.replace('{points}', String(data.tier.pointsForNext)).replace('{tier}', data.tier.nextTier ?? '')`), or `t.tierAtMax` when `data.tier.nextTier === null`. Reference `'use client'` as the first line. Mirror the card/heading styling of `StudioTierView.tsx`.

```tsx
'use client'

import type en from '@/lib/i18n/messages/en'
import type { CreatorInsights } from '@/lib/insights/creator'
import { Sparkline } from '@/components/kinnso/Sparkline'
import { BarRow } from '@/components/kinnso/BarRow'

export function CreatorInsightsView({
  t,
  data,
}: {
  t: (typeof en)['insights']
  data: CreatorInsights
}) {
  const hasPoints = data.pointsTotal > 0
  const m = data.missionsByStatus
  const hasMissions = m.applied + m.active + m.invited + m.rejected + data.submissionsApproved > 0
  const typeMax = Math.max(1, data.pointsByType.guide_published, data.pointsByType.mission_verified, data.pointsByType.dna_scan)
  const nextLabel =
    data.tier.nextTier === null
      ? t.tierAtMax
      : t.pointsToNext.replace('{points}', String(data.tier.pointsForNext)).replace('{tier}', data.tier.nextTier)

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{t.creatorTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.creatorSubtitle}</p>
      </header>

      <section className="rounded-lg border p-5">
        <p className="text-sm text-muted-foreground">{t.pointsTotal}</p>
        <p className="text-3xl font-semibold tabular-nums">{data.pointsTotal}</p>
        <p className="mt-1 text-sm text-muted-foreground">{nextLabel}</p>
      </section>

      {hasPoints ? (
        <>
          <section className="rounded-lg border p-5">
            <h2 className="mb-3 text-sm font-medium">{t.pointsTrajectory}</h2>
            <div className="text-primary">
              <Sparkline values={data.trajectory.map((p) => p.cumulative)} label={t.pointsTrajectory} />
            </div>
          </section>
          <section className="space-y-2 rounded-lg border p-5">
            <h2 className="mb-3 text-sm font-medium">{t.pointsByType}</h2>
            <BarRow label={t.typeGuide} value={data.pointsByType.guide_published} max={typeMax} />
            <BarRow label={t.typeMission} value={data.pointsByType.mission_verified} max={typeMax} />
            <BarRow label={t.typeScan} value={data.pointsByType.dna_scan} max={typeMax} />
          </section>
        </>
      ) : (
        <section className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
          {t.creatorEmptyPoints}
        </section>
      )}

      <section className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-5">
          <p className="text-sm text-muted-foreground">{t.guidesPublished}</p>
          <p className="text-2xl font-semibold tabular-nums">{data.guidesPublished}</p>
        </div>
        <div className="rounded-lg border p-5">
          <p className="text-sm text-muted-foreground">{t.guideSaves}</p>
          <p className="text-2xl font-semibold tabular-nums">{data.guideSavesTotal}</p>
        </div>
      </section>

      <section className="rounded-lg border p-5">
        <h2 className="mb-3 text-sm font-medium">{t.missionsTitle}</h2>
        {hasMissions ? (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">{t.statusApplied}</dt><dd className="text-lg tabular-nums">{m.applied}</dd></div>
            <div><dt className="text-muted-foreground">{t.statusActive}</dt><dd className="text-lg tabular-nums">{m.active}</dd></div>
            <div><dt className="text-muted-foreground">{t.statusInvited}</dt><dd className="text-lg tabular-nums">{m.invited}</dd></div>
            <div><dt className="text-muted-foreground">{t.statusRejected}</dt><dd className="text-lg tabular-nums">{m.rejected}</dd></div>
            <div><dt className="text-muted-foreground">{t.deliverables}</dt><dd className="text-lg tabular-nums">{data.submissionsApproved}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">{t.creatorEmptyMissions}</p>
        )}
      </section>
    </main>
  )
}
```

- [ ] **Step 4:** Run `pnpm vitest run tests/kinnso.CreatorInsightsView.test.tsx` → Expected: PASS.
- [ ] **Step 5:** Commit.

```bash
git add apps/web/components/kinnso/pages/CreatorInsightsView.tsx apps/web/tests/kinnso.CreatorInsightsView.test.tsx
git commit -m "feat(phase8): CreatorInsightsView with charts + empty states"
```

---

## Task 6: `MerchantInsightsView`

**Files:**
- Create: `apps/web/components/kinnso/pages/MerchantInsightsView.tsx`
- Test: `apps/web/tests/kinnso.MerchantInsightsView.test.tsx`

Renders header, aggregate stat cards (missions published, participants, invite acceptance as `%` or `t.notApplicable` when null, delivered work), and a per-mission table. Empty state: when `perMission.length === 0` show `t.merchantEmpty`.

- [ ] **Step 1: Write the failing test:**

```tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MerchantInsightsView } from '@/components/kinnso/pages/MerchantInsightsView'
import en from '@/lib/i18n/messages/en'
import type { MerchantInsights } from '@/lib/insights/merchant'

afterEach(cleanup)

const base: MerchantInsights = {
  missionsPublished: 2,
  perMission: [
    { missionId: 'm1', title: 'Summer brief', status: 'published',
      invited: 4, applied: 1, active: 2, rejected: 1, approvedSubmissions: 2 },
  ],
  totals: { participants: 5, invited: 4, accepted: 2, approvedSubmissions: 2 },
  inviteAcceptRate: 0.5,
}

describe('MerchantInsightsView', () => {
  it('renders aggregate stats and the per-mission row', () => {
    render(<MerchantInsightsView t={en.insights} data={base} />)
    expect(screen.getByRole('heading', { level: 1, name: en.insights.merchantTitle })).toBeTruthy()
    expect(screen.getByText('Summer brief')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy() // acceptance rate
  })

  it('renders the dash when acceptance rate is null', () => {
    render(<MerchantInsightsView t={en.insights} data={{ ...base, inviteAcceptRate: null }} />)
    expect(screen.getAllByText(en.insights.notApplicable).length).toBeGreaterThan(0)
  })

  it('shows the empty state when there are no missions', () => {
    render(<MerchantInsightsView t={en.insights} data={{ ...base, perMission: [], missionsPublished: 0 }} />)
    expect(screen.getByText(en.insights.merchantEmpty)).toBeTruthy()
  })
})
```

- [ ] **Step 2:** Run `pnpm vitest run tests/kinnso.MerchantInsightsView.test.tsx` → Expected: FAIL.
- [ ] **Step 3: Implement** `MerchantInsightsView.tsx`:

```tsx
'use client'

import type en from '@/lib/i18n/messages/en'
import type { MerchantInsights } from '@/lib/insights/merchant'

export function MerchantInsightsView({
  t,
  data,
}: {
  t: (typeof en)['insights']
  data: MerchantInsights
}) {
  const acceptance =
    data.inviteAcceptRate === null ? t.notApplicable : `${Math.round(data.inviteAcceptRate * 100)}%`

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{t.merchantTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.merchantSubtitle}</p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t.missionsPublished} value={String(data.missionsPublished)} />
        <Stat label={t.participants} value={String(data.totals.participants)} />
        <Stat label={t.inviteAcceptRate} value={acceptance} />
        <Stat label={t.deliveredWork} value={String(data.totals.approvedSubmissions)} />
      </section>

      <section className="rounded-lg border p-5">
        <h2 className="mb-3 text-sm font-medium">{t.perMissionTitle}</h2>
        {data.perMission.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 pr-2 font-medium">{t.colMission}</th>
                <th className="py-2 px-2 text-right font-medium">{t.colInvited}</th>
                <th className="py-2 px-2 text-right font-medium">{t.colApplied}</th>
                <th className="py-2 px-2 text-right font-medium">{t.colActive}</th>
                <th className="py-2 px-2 text-right font-medium">{t.colRejected}</th>
                <th className="py-2 pl-2 text-right font-medium">{t.colDelivered}</th>
              </tr>
            </thead>
            <tbody>
              {data.perMission.map((r) => (
                <tr key={r.missionId} className="border-t">
                  <td className="py-2 pr-2">{r.title}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{r.invited}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{r.applied}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{r.active}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{r.rejected}</td>
                  <td className="py-2 pl-2 text-right tabular-nums">{r.approvedSubmissions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">{t.merchantEmpty}</p>
        )}
      </section>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
```

- [ ] **Step 4:** Run `pnpm vitest run tests/kinnso.MerchantInsightsView.test.tsx` → Expected: PASS.
- [ ] **Step 5:** Commit.

```bash
git add apps/web/components/kinnso/pages/MerchantInsightsView.tsx apps/web/tests/kinnso.MerchantInsightsView.test.tsx
git commit -m "feat(phase8): MerchantInsightsView with aggregate stats + per-mission table"
```

---

## Task 7: Creator host page `/studio/insights`

**Files:**
- Create: `apps/web/app/[locale]/studio/insights/page.tsx`
- Test: `apps/web/tests/studio.insights.host.test.tsx`

**FIRST:** Read `node_modules/next/dist/docs/` for the current page/server-component conventions (modified Next.js fork — see AGENTS.md). Mirror the gate pattern in `app/[locale]/studio/tier/page.tsx`: anon → `redirect(/{loc}/sign-in)`; `role !== 'creator'` → `redirect(/{loc}/studio)`; else fetch + render.

- [ ] **Step 1: Write the failing host test** (mirror `tests/merchants.creators.host.test.tsx`):

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { roleMock, getUserMock, insightsMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'creator'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  insightsMock: vi.fn(async () => ({
    pointsTotal: 65,
    pointsByType: { dna_scan: 10, guide_published: 15, mission_verified: 40 },
    trajectory: [{ weekStart: '2026-06-08', cumulative: 65 }],
    tier: { tier: 'rising', nextTier: 'pro', points: 65, pointsIntoTier: 15, pointsForNext: 85, pct: 15 },
    guidesPublished: 1, guideSavesTotal: 7,
    missionsByStatus: { applied: 1, active: 1, invited: 0, rejected: 0 },
    submissionsApproved: 1,
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}))
vi.mock('@/lib/insights/creator', () => ({ getCreatorInsights: insightsMock }))

import StudioInsightsPage from '@/app/[locale]/studio/insights/page'
import en from '@/lib/i18n/messages/en'

beforeEach(() => {
  roleMock.mockResolvedValue('creator')
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('/[locale]/studio/insights host', () => {
  it('renders insights for a creator', async () => {
    const ui = await StudioInsightsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.insights.creatorTitle })).toBeTruthy()
  })

  it('redirects a non-creator to the studio hub', async () => {
    roleMock.mockResolvedValueOnce('merchant')
    await expect(StudioInsightsPage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('NEXT_REDIRECT:/en/studio')
  })

  it('redirects an anonymous viewer to sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(StudioInsightsPage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
})
```

- [ ] **Step 2:** Run `pnpm vitest run tests/studio.insights.host.test.tsx` → Expected: FAIL.
- [ ] **Step 3: Implement** `page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { getCreatorInsights } from '@/lib/insights/creator'
import { CreatorInsightsView } from '@/components/kinnso/pages/CreatorInsightsView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function StudioInsightsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const loc: Locale = isLocale(locale) ? (locale as Locale) : 'en'

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'creator') redirect(`/${loc}/studio`)

  const messages = await getDictionary(loc)
  const data = await getCreatorInsights(supabase)
  return <CreatorInsightsView t={messages.insights} data={data} />
}
```

- [ ] **Step 4:** Run `pnpm vitest run tests/studio.insights.host.test.tsx` → Expected: PASS.
- [ ] **Step 5:** Commit.

```bash
git add "apps/web/app/[locale]/studio/insights/page.tsx" apps/web/tests/studio.insights.host.test.tsx
git commit -m "feat(phase8): /studio/insights creator-gated host page"
```

---

## Task 8: Merchant host page `/merchants/insights`

**Files:**
- Create: `apps/web/app/[locale]/merchants/insights/page.tsx`
- Test: `apps/web/tests/merchants.insights.host.test.tsx`

**FIRST:** Read `node_modules/next/dist/docs/` (modified Next.js). Mirror the gate in `app/[locale]/merchants/creators/page.tsx`: `!isLocale` → `notFound()`; anon → `redirect(/{loc}/sign-in)`; `role !== 'merchant'` → `notFound()`; else fetch + render.

- [ ] **Step 1: Write the failing host test:**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { roleMock, getUserMock, insightsMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'merchant'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  insightsMock: vi.fn(async () => ({
    missionsPublished: 1,
    perMission: [{ missionId: 'm1', title: 'Summer brief', status: 'published',
      invited: 4, applied: 1, active: 2, rejected: 1, approvedSubmissions: 2 }],
    totals: { participants: 5, invited: 4, accepted: 2, approvedSubmissions: 2 },
    inviteAcceptRate: 0.5,
  })),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}))
vi.mock('@/lib/insights/merchant', () => ({ getMerchantInsights: insightsMock }))

import MerchantsInsightsPage from '@/app/[locale]/merchants/insights/page'
import en from '@/lib/i18n/messages/en'

beforeEach(() => {
  roleMock.mockResolvedValue('merchant')
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('/[locale]/merchants/insights host', () => {
  it('renders insights for a merchant', async () => {
    const ui = await MerchantsInsightsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.insights.merchantTitle })).toBeTruthy()
  })

  it('notFounds for a non-merchant', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(MerchantsInsightsPage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('redirects an anonymous viewer to sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(MerchantsInsightsPage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
})
```

- [ ] **Step 2:** Run `pnpm vitest run tests/merchants.insights.host.test.tsx` → Expected: FAIL.
- [ ] **Step 3: Implement** `page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { getMerchantInsights } from '@/lib/insights/merchant'
import { MerchantInsightsView } from '@/components/kinnso/pages/MerchantInsightsView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function MerchantsInsightsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'merchant') notFound()

  const messages = await getDictionary(loc)
  const data = await getMerchantInsights(supabase)
  return <MerchantInsightsView t={messages.insights} data={data} />
}
```

- [ ] **Step 4:** Run `pnpm vitest run tests/merchants.insights.host.test.tsx` → Expected: PASS.
- [ ] **Step 5:** Commit.

```bash
git add "apps/web/app/[locale]/merchants/insights/page.tsx" apps/web/tests/merchants.insights.host.test.tsx
git commit -m "feat(phase8): /merchants/insights merchant-gated host page"
```

---

## Task 9: Navigation wiring (Studio tile + merchant nav link)

**Files:**
- Modify: `apps/web/components/kinnso/StudioQuickLinks.tsx` (add an "Insights" tile → `/studio/insights`)
- Modify: `apps/web/components/kinnso/Navbar.tsx` (add a merchant "Insights" link → `/merchants/insights`)
- Test: extend the existing nav/route test that already covers these components (find it via `grep -rl "StudioQuickLinks\|linkFindCreators" apps/web/tests`).

**FIRST:** Read both component files to copy the exact existing entry shape (the Studio tiles array and the merchant link list added in Phase 7). Add one entry to each, using label key `t.insights.navLabel` (or the component's existing `nav`/`studioHome` t-shape — match how sibling entries read their label). The route hrefs are `/${locale}/studio/insights` and `/${locale}/merchants/insights`, mirroring how sibling tiles/links build their hrefs.

- [ ] **Step 1:** Add an assertion to the existing test(s): the Studio quick-links render a link whose `href` ends with `/studio/insights`; the merchant nav renders a link whose `href` ends with `/merchants/insights`. Run it → Expected: FAIL.
- [ ] **Step 2:** Add the "Insights" tile to `StudioQuickLinks.tsx` and the "Insights" link to the merchant branch of `Navbar.tsx`, mirroring the existing sibling entries exactly.
- [ ] **Step 3:** Run the extended test → Expected: PASS.
- [ ] **Step 4:** Commit.

```bash
git add apps/web/components/kinnso/StudioQuickLinks.tsx apps/web/components/kinnso/Navbar.tsx apps/web/tests
git commit -m "feat(phase8): link /studio/insights tile + /merchants/insights nav"
```

---

## Task 10 (CONTROLLER): Finish gate

> Not a subagent task. Run by the controller from `apps/web`.

- [ ] **Step 1:** Full type check: `pnpm tsc -p apps/web/tsconfig.json --noEmit` (or the repo's `typecheck` script) → 0 errors. (Per-task `vitest run` does NOT typecheck — host-test-gap lesson: the host tests' null-user mocks need `as never`, already in the test code above.)
- [ ] **Step 2:** Full suite (from `apps/web`): `pnpm vitest run --no-file-parallelism --testTimeout=30000` → all green. (Do NOT prefix with `pkill -f vitest` — self-kills with exit 144.)
- [ ] **Step 3:** Lint: `pnpm lint` → 0 errors.
- [ ] **Step 4:** Build: `pnpm build` → success; confirm `/[locale]/studio/insights` and `/[locale]/merchants/insights` appear in the route manifest.
- [ ] **Step 5:** Live security re-verify (Supabase MCP `execute_sql`): anon/public EXECUTE = 0 on `creator_insights` + `merchant_insights`; a call as a non-owner raises `forbidden`.
- [ ] **Step 6:** Two-lens review (security-auditor + code-reviewer) over the full diff; fix findings; re-gate.

---

## Self-Review (author check vs spec)

**Spec coverage:**
- Creator metrics (points trajectory, breakdown, tier, guides+saves, mission funnel, approved deliverables) → Task 0 RPC + Task 3 + Task 5. ✓
- Merchant metrics (per-mission funnel, invite acceptance, aggregate, approved deliverables) → Task 0 RPC + Task 4 + Task 6. ✓
- Dedicated pages + tiles → Tasks 7, 8, 9. ✓
- Honesty boundaries (no views, points-not-dollars wording in `creatorSubtitle`, approved-submissions not `completed`) → i18n copy + RPC uses `submissions_approved`, never participant `completed`. ✓
- SECURITY DEFINER + anon revoke + internal gate → Task 0 grants + gates. ✓
- Testing (lib, component+empty, host-gate, i18n parity, live verify) → each task + Task 10. ✓

**Placeholder scan:** `<ts>` is the intentional migration-timestamp placeholder (controller assigns at apply time). No other TODO/TBD. ✓

**Type consistency:** `CreatorInsights`/`MerchantInsights`/`MerchantMissionRow` field names match between lib (Tasks 3/4), views (Tasks 5/6), and host mocks (Tasks 7/8). `t={...insights}` shape matches the i18n keys in Task 1. `progressToNext`/`TierProgress` used as defined in `tiers.ts`. ✓
