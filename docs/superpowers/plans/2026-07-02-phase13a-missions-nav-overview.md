# Phase 13A — Missions Nav + Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Missions` item to the admin nav and ship the read-only Overview tab (`/admin/missions`) — platform-wide KPIs, 2 trend charts, and an at-risk list for merchant-sourced missions — backed by a new `admin_mission_analytics()` SECURITY DEFINER RPC.

**Architecture:** Mirrors Phase 11A (`admin_merchant_analytics` → `getMerchantsOverview` → `MerchantsOverviewView`) exactly: one ops-gated, read-only, no-audit RPC returning a single `jsonb` payload; a query wrapper that snake→camel maps it; a presentational view built from the existing `KpiCard`/`TrendChart` primitives.

**Tech Stack:** Next.js 16 App Router (Server Components), Supabase Postgres (plpgsql RPC), TypeScript, Vitest + Testing Library, `@kinnso/db` generated types.

---

## Reference files (read these before starting — do not guess conventions)

- `supabase/migrations/20260630120000_admin_merchant_analytics.sql` — the RPC pattern to mirror exactly (gate, nested-map KPIs, grants).
- `apps/web/lib/admin/merchants-queries.ts` — `getMerchantsOverview` (lines ~1–116) for the query-wrapper pattern.
- `apps/web/components/kinnso/admin/merchants/MerchantsOverviewView.tsx` — the view pattern (KpiCard grid, TrendChart pair, at-risk list).
- `apps/web/components/kinnso/admin/merchants/MerchantsTabs.tsx` — the tabs-nav pattern.
- `apps/web/app/[locale]/admin/merchants/page.tsx` — the route pattern.
- `apps/web/components/kinnso/admin/AdminShell.tsx` — the sidebar nav array.
- `apps/web/tests/admin.merchants-overview.host.test.tsx` — the host-test pattern (hoisted mocks, 4 cases: renders/non-ops/anon/bad-locale).
- `apps/web/tests/i18n.locale-parity.test.ts` — the `GROUPS` array to extend.

---

### Task 1: `admin_mission_analytics()` migration

**Files:**
- Create: `supabase/migrations/20260702090000_admin_mission_analytics.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 13A — Missions Operator Console: ops-aggregate analytics for the Overview.
-- Mirrors admin_merchant_analytics: single jsonb payload, gated on is_active_ops(),
-- read-only (no audit). Scope is mission_source='merchant' only — travelpayouts
-- offers are a system-seeded affiliate catalog, not an ops-console concern.
-- Heuristics (documented + tunable here):
--   open_for_applications        = status='published' and visibility='open'
--   submissions_awaiting_review  = mission_milestone_submissions.status in ('submitted','revision_requested')
--   at_risk reasons:
--     published_no_participants = status='published', visibility='open', published_at
--                                  older than 14 days, zero mission_participants rows
--     stalled_submissions       = a submission status='submitted', submitted_at older than
--                                  7 days, reviewed_at still null
--     verification_failed       = a submission's LATEST mission_verification_jobs row has
--                                  status='failed' and no newer job exists for that submission
create or replace function public.admin_mission_analytics(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days       int := greatest(1, least(coalesce(p_days, 30), 365));
  v_start      timestamptz := date_trunc('day', now()) - make_interval(days => v_days - 1);
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'total', (select count(*) from public.missions where mission_source = 'merchant'),
      'by_status', coalesce((
        select jsonb_object_agg(status, c) from (
          select status, count(*) as c from public.missions
          where mission_source = 'merchant' group by status
        ) s), '{}'::jsonb),
      'by_type', coalesce((
        select jsonb_object_agg(mission_type, c) from (
          select mission_type, count(*) as c from public.missions
          where mission_source = 'merchant' group by mission_type
        ) s), '{}'::jsonb),
      'by_visibility', coalesce((
        select jsonb_object_agg(visibility, c) from (
          select visibility, count(*) as c from public.missions
          where mission_source = 'merchant' group by visibility
        ) s), '{}'::jsonb),
      'open_for_applications', (
        select count(*) from public.missions
        where mission_source = 'merchant' and status = 'published' and visibility = 'open'
      ),
      'submissions_awaiting_review', (
        select count(*) from public.mission_milestone_submissions sub
        join public.mission_milestones ms on ms.id = sub.mission_milestone_id
        join public.missions mi on mi.id = ms.mission_id
        where mi.mission_source = 'merchant'
          and sub.status in ('submitted', 'revision_requested')
      )
    ),
    'missions_created', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', cnt) order by d) from (
        select date_trunc('day', created_at) as d, count(*) as cnt
        from public.missions
        where mission_source = 'merchant' and created_at >= v_start
        group by 1
      ) t), '[]'::jsonb),
    'submissions_reviewed', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', cnt) order by d) from (
        select date_trunc('day', sub.reviewed_at) as d, count(*) as cnt
        from public.mission_milestone_submissions sub
        join public.mission_milestones ms on ms.id = sub.mission_milestone_id
        join public.missions mi on mi.id = ms.mission_id
        where mi.mission_source = 'merchant'
          and sub.reviewed_at is not null and sub.reviewed_at >= v_start
        group by 1
      ) t), '[]'::jsonb),
    'at_risk', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'merchant_name', r.merchant_name, 'reason', r.reason))
      from (
        -- CASE order encodes reason priority: verification_failed and stalled_submissions
        -- (submission-level problems) outrank published_no_participants (a mission-level
        -- problem) so a mission with both is never mislabeled by the weaker reason.
        select mi.id, mi.title, mp.company_name as merchant_name,
          case
            when exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and (
                  select vj.status from public.mission_verification_jobs vj
                  where vj.mission_milestone_submission_id = sub.id
                  order by vj.created_at desc limit 1
                ) = 'failed'
            ) then 'verification_failed'
            when exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and sub.status = 'submitted'
                and sub.submitted_at < now() - interval '7 days'
            ) then 'stalled_submissions'
            else 'published_no_participants'
          end as reason
        from public.missions mi
        join public.merchant_profiles mp on mp.id = mi.merchant_profile_id
        where mi.mission_source = 'merchant'
          and (
            exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and (
                  select vj.status from public.mission_verification_jobs vj
                  where vj.mission_milestone_submission_id = sub.id
                  order by vj.created_at desc limit 1
                ) = 'failed'
            )
            or exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and sub.status = 'submitted'
                and sub.submitted_at < now() - interval '7 days'
            )
            or (
              mi.status = 'published' and mi.visibility = 'open'
              and mi.published_at < now() - interval '14 days'
              and not exists (
                select 1 from public.mission_participants part where part.mission_id = mi.id
              )
            )
          )
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_mission_analytics(int) from public, anon;
grant execute on function public.admin_mission_analytics(int) to authenticated;
```

- [ ] **Step 2: Apply the migration to the live project**

Use the Supabase MCP `apply_migration` tool with `project_id=scryfkefedzuetfdtrvl`, `name=admin_mission_analytics`, and the SQL body above (the tool assigns its own timestamp — the filename above is for the repo copy, matched by name per the project's migration convention).

- [ ] **Step 3: Smoke-test the RPC**

Run via the Supabase MCP `execute_sql` tool:
```sql
select public.admin_mission_analytics(30);
```
Expected: raises `forbidden` (`42501`) when run as a role that fails `is_active_ops()` — since `execute_sql` runs as `postgres` (bypasses the `is_active_ops()` check's normal caller context only if `is_active_ops()` itself special-cases the postgres role; if it does NOT, expect a valid jsonb payload with `kpis.total` matching `select count(*) from missions where mission_source='merchant'`). Either outcome confirms the function compiles and runs — a syntax error is the only real failure mode to watch for here.

- [ ] **Step 4: Commit the migration file to the repo**

```bash
git add supabase/migrations/20260702090000_admin_mission_analytics.sql
git commit -m "feat(db): Phase 13A — admin_mission_analytics() RPC"
```

---

### Task 2: Hand-patch `packages/db/types.ts`

**Files:**
- Modify: `packages/db/types.ts` (the `Functions` object, alphabetical among the existing `admin_*` entries)

- [ ] **Step 1: Add the type entry**

Find the `Functions:` block inside the generated `Database['public']` type and add, alongside the existing `admin_merchant_analytics` entry (same shape — a stable jsonb-returning function with one optional int arg):

```typescript
admin_mission_analytics: {
  Args: { p_days?: number }
  Returns: Json
}
```

- [ ] **Step 2: Verify the project still typechecks**

Run: `pnpm --filter web typecheck`
Expected: PASS (this is an additive type-only change; nothing references the new function yet).

- [ ] **Step 3: Commit**

```bash
git add packages/db/types.ts
git commit -m "feat(db): Phase 13A — hand-patch types.ts for admin_mission_analytics"
```

---

### Task 3: `lib/admin/missions-queries.ts` — `getMissionsOverview`

**Files:**
- Create: `apps/web/lib/admin/missions-queries.ts`
- Test: `apps/web/tests/admin.missions-queries.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/admin.missions-queries.test.ts
import { describe, expect, it, vi } from 'vitest'
import { getMissionsOverview } from '@/lib/admin/missions-queries'

function makeSupabase(payload: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data: payload, error })) } as never
}

describe('getMissionsOverview', () => {
  it('maps the analytics payload from snake_case to camelCase', async () => {
    const supabase = makeSupabase({
      kpis: {
        total: 6,
        by_status: { published: 4, draft: 1, paused: 1 },
        by_type: { coupon_affiliate: 3, hybrid: 2, paid: 1 },
        by_visibility: { open: 5, targeted: 1 },
        open_for_applications: 4,
        submissions_awaiting_review: 2,
      },
      missions_created: [{ day: '2026-07-01', count: 2 }],
      submissions_reviewed: [{ day: '2026-07-01', count: 1 }],
      at_risk: [{ id: 'm1', title: 'Tokyo Winter Stays Showcase', merchant_name: 'Sunrise Stays HK', reason: 'stalled_submissions' }],
    })
    const result = await getMissionsOverview(supabase)
    expect(result.kpis.total).toBe(6)
    expect(result.kpis.byStatus).toEqual({ published: 4, draft: 1, paused: 1 })
    expect(result.kpis.byType).toEqual({ coupon_affiliate: 3, hybrid: 2, paid: 1 })
    expect(result.kpis.openForApplications).toBe(4)
    expect(result.kpis.submissionsAwaitingReview).toBe(2)
    expect(result.missionsCreated).toEqual([{ day: '2026-07-01', count: 2 }])
    expect(result.submissionsReviewed).toEqual([{ day: '2026-07-01', count: 1 }])
    expect(result.atRisk).toEqual([{ id: 'm1', title: 'Tokyo Winter Stays Showcase', merchantName: 'Sunrise Stays HK', reason: 'stalled_submissions' }])
  })

  it('defaults missing arrays to empty and missing maps to {}', async () => {
    const supabase = makeSupabase({
      kpis: { total: 0, open_for_applications: 0, submissions_awaiting_review: 0 },
    })
    const result = await getMissionsOverview(supabase)
    expect(result.kpis.byStatus).toEqual({})
    expect(result.kpis.byType).toEqual({})
    expect(result.kpis.byVisibility).toEqual({})
    expect(result.missionsCreated).toEqual([])
    expect(result.submissionsReviewed).toEqual([])
    expect(result.atRisk).toEqual([])
  })

  it('propagates RPC errors', async () => {
    const supabase = makeSupabase(null, new Error('forbidden'))
    await expect(getMissionsOverview(supabase)).rejects.toThrow('forbidden')
  })

  it('throws when the RPC returns no data and no error', async () => {
    const supabase = makeSupabase(null, null)
    await expect(getMissionsOverview(supabase)).rejects.toThrow('admin_mission_analytics returned no data')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/web && npx vitest run tests/admin.missions-queries.test.ts`
Expected: FAIL — `Cannot find module '@/lib/admin/missions-queries'`

- [ ] **Step 3: Write the implementation**

```typescript
// apps/web/lib/admin/missions-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface MissionsOverview {
  kpis: {
    total: number
    byStatus: Record<string, number>
    byType: Record<string, number>
    byVisibility: Record<string, number>
    openForApplications: number
    submissionsAwaitingReview: number
  }
  missionsCreated: { day: string; count: number }[]
  submissionsReviewed: { day: string; count: number }[]
  atRisk: { id: string; title: string; merchantName: string | null; reason: string }[]
}

type AnalyticsPayload = {
  kpis: {
    total: number
    by_status?: Record<string, number>
    by_type?: Record<string, number>
    by_visibility?: Record<string, number>
    open_for_applications: number
    submissions_awaiting_review: number
  }
  missions_created?: { day: string; count: number }[]
  submissions_reviewed?: { day: string; count: number }[]
  at_risk?: { id: string; title: string; merchant_name: string | null; reason: string }[]
}

/**
 * Ops-aggregate Missions Overview. Backed by the SECURITY DEFINER
 * `admin_mission_analytics()` RPC (gated on is_active_ops()). Scope is
 * mission_source='merchant' only, enforced inside the RPC. Errors propagate
 * (no silent zeros).
 */
export async function getMissionsOverview(supabase: Client, days = 30): Promise<MissionsOverview> {
  const { data, error } = await supabase.rpc('admin_mission_analytics', { p_days: days })
  if (error || !data) throw error ?? new Error('admin_mission_analytics returned no data')
  const a = data as unknown as AnalyticsPayload
  return {
    kpis: {
      total: Number(a.kpis.total),
      byStatus: a.kpis.by_status ?? {},
      byType: a.kpis.by_type ?? {},
      byVisibility: a.kpis.by_visibility ?? {},
      openForApplications: Number(a.kpis.open_for_applications),
      submissionsAwaitingReview: Number(a.kpis.submissions_awaiting_review),
    },
    missionsCreated: (a.missions_created ?? []).map((m) => ({ day: m.day, count: Number(m.count) })),
    submissionsReviewed: (a.submissions_reviewed ?? []).map((s) => ({ day: s.day, count: Number(s.count) })),
    atRisk: (a.at_risk ?? []).map((r) => ({ id: r.id, title: r.title, merchantName: r.merchant_name, reason: r.reason })),
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd apps/web && npx vitest run tests/admin.missions-queries.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/missions-queries.ts apps/web/tests/admin.missions-queries.test.ts
git commit -m "feat(web): Phase 13A — getMissionsOverview query"
```

---

### Task 4: `MissionsTabs` + `MissionsOverviewView` components

**Files:**
- Create: `apps/web/components/kinnso/admin/missions/MissionsTabs.tsx`
- Create: `apps/web/components/kinnso/admin/missions/MissionsOverviewView.tsx`
- Test: `apps/web/tests/kinnso.MissionsOverviewView.test.tsx`

- [ ] **Step 1: Write the failing component test**

```typescript
// apps/web/tests/kinnso.MissionsOverviewView.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Messages } from '@/lib/i18n/messages/en'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin/missions' }))

import { MissionsOverviewView } from '@/components/kinnso/admin/missions/MissionsOverviewView'

const t = {
  title: 'Missions', subtitle: 'Every merchant mission, platform-wide.',
  tabOverview: 'Overview', tabDirectory: 'Directory',
  kpiTotal: 'Total missions', kpiPublished: 'Published', kpiDraft: 'Draft', kpiPaused: 'Paused',
  kpiCompleted: 'Completed', kpiCancelled: 'Cancelled', kpiOpenForApplications: 'Open for applications',
  kpiSubmissionsAwaitingReview: 'Awaiting review',
  trendMissionsCreated: 'Missions created', trendSubmissionsReviewed: 'Submissions reviewed', trendEmpty: 'No data yet',
  atRiskTitle: 'At risk', atRiskEmpty: 'Nothing at risk right now',
  reasonPublishedNoParticipants: 'Published, no participants', reasonStalledSubmissions: 'Stalled submission',
  reasonVerificationFailed: 'Verification failed',
} as unknown as Messages['missionsOps']

describe('MissionsOverviewView', () => {
  it('renders KPI values and an at-risk row', () => {
    render(
      <MissionsOverviewView
        t={t}
        locale="en"
        overview={{
          kpis: { total: 6, byStatus: { published: 4 }, byType: {}, byVisibility: {}, openForApplications: 4, submissionsAwaitingReview: 2 },
          missionsCreated: [], submissionsReviewed: [],
          atRisk: [{ id: 'm1', title: 'Tokyo Winter Stays Showcase', merchantName: 'Sunrise Stays HK', reason: 'stalled_submissions' }],
        }}
      />,
    )
    expect(screen.getByText('6')).toBeTruthy()
    expect(screen.getByText('Tokyo Winter Stays Showcase')).toBeTruthy()
    expect(screen.getByText('Stalled submission')).toBeTruthy()
  })

  it('shows the empty-state copy when nothing is at risk', () => {
    render(
      <MissionsOverviewView
        t={t}
        locale="en"
        overview={{
          kpis: { total: 0, byStatus: {}, byType: {}, byVisibility: {}, openForApplications: 0, submissionsAwaitingReview: 0 },
          missionsCreated: [], submissionsReviewed: [], atRisk: [],
        }}
      />,
    )
    expect(screen.getByText('Nothing at risk right now')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.MissionsOverviewView.test.tsx`
Expected: FAIL — `Cannot find module '@/components/kinnso/admin/missions/MissionsOverviewView'`

- [ ] **Step 3: Write `MissionsTabs.tsx`**

```typescript
// apps/web/components/kinnso/admin/missions/MissionsTabs.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'

export function MissionsTabs({ t, locale }: { t: Messages['missionsOps']; locale: Locale }) {
  const pathname = usePathname()
  const tabs = [{ href: `/${locale}/admin/missions`, label: t.tabOverview }]
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

export default MissionsTabs
```

*(Note for the 13B implementer: add `{ href: '/${locale}/admin/missions/directory', label: t.tabDirectory }` to the `tabs` array above once the Directory route exists — do not add it in 13A, it would be a dead link.)*

- [ ] **Step 4: Write `MissionsOverviewView.tsx`**

```typescript
// apps/web/components/kinnso/admin/missions/MissionsOverviewView.tsx
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { MissionsOverview } from '@/lib/admin/missions-queries'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { KpiCard } from '@/components/kinnso/admin/KpiCard'
import { TrendChart } from '@/components/kinnso/admin/TrendChart'
import { MissionsTabs } from '@/components/kinnso/admin/missions/MissionsTabs'

const REASON_LABEL = (t: Messages['missionsOps']): Record<string, string> => ({
  published_no_participants: t.reasonPublishedNoParticipants,
  stalled_submissions: t.reasonStalledSubmissions,
  verification_failed: t.reasonVerificationFailed,
})

export function MissionsOverviewView({ t, locale, overview }: { t: Messages['missionsOps']; locale: Locale; overview: MissionsOverview }) {
  const { kpis, missionsCreated, submissionsReviewed, atRisk } = overview
  const reasons = REASON_LABEL(t)
  const kpiCards = [
    { label: t.kpiTotal, value: kpis.total },
    { label: t.kpiPublished, value: kpis.byStatus.published ?? 0 },
    { label: t.kpiDraft, value: kpis.byStatus.draft ?? 0 },
    { label: t.kpiPaused, value: kpis.byStatus.paused ?? 0 },
    { label: t.kpiCompleted, value: kpis.byStatus.completed ?? 0 },
    { label: t.kpiCancelled, value: kpis.byStatus.cancelled ?? 0 },
    { label: t.kpiOpenForApplications, value: kpis.openForApplications },
    { label: t.kpiSubmissionsAwaitingReview, value: kpis.submissionsAwaitingReview },
  ]
  return (
    <main>
      <MissionsTabs t={t} locale={locale} />
      <h1 className="k-display">{t.title}</h1>
      <p className="mt-2 text-kinnso-muted">{t.subtitle}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        {kpiCards.map((c) => (
          <KpiCard key={c.label} label={c.label} value={c.value} />
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.trendMissionsCreated}</p>
          <TrendChart points={missionsCreated.map((m) => ({ label: m.day, value: m.count }))} emptyText={t.trendEmpty} ariaLabel={t.trendMissionsCreated} />
        </TicketCard>
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.trendSubmissionsReviewed}</p>
          <TrendChart points={submissionsReviewed.map((s) => ({ label: s.day, value: s.count }))} emptyText={t.trendEmpty} ariaLabel={t.trendSubmissionsReviewed} />
        </TicketCard>
      </div>

      <TicketCard className="mt-8 p-5">
        <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.atRiskTitle}</p>
        {atRisk.length === 0 ? (
          <p className="py-6 text-sm text-kinnso-muted">{t.atRiskEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {atRisk.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate font-bold text-kinnso-ink">{r.title}</span>
                <span className="min-w-0 flex-1 truncate text-kinnso-muted">{r.merchantName ?? '—'}</span>
                <span className="shrink-0 text-orange-700">{reasons[r.reason] ?? r.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </TicketCard>
    </main>
  )
}

export default MissionsOverviewView
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd apps/web && npx vitest run tests/kinnso.MissionsOverviewView.test.tsx`
Expected: PASS (2/2) — note this test will still fail on the `t.*` i18n type import until Task 6 adds the `missionsOps` group to `Messages`; if Vitest's type-stripping lets it run anyway, it passes; if a typecheck gate blocks it, proceed to Task 6 first and return here.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/admin/missions apps/web/tests/kinnso.MissionsOverviewView.test.tsx
git commit -m "feat(web): Phase 13A — MissionsTabs + MissionsOverviewView"
```

---

### Task 5: Wire the route + `AdminShell` nav

**Files:**
- Create: `apps/web/app/[locale]/admin/missions/page.tsx`
- Modify: `apps/web/components/kinnso/admin/AdminShell.tsx`
- Test: `apps/web/tests/admin.missions-overview.host.test.tsx`

- [ ] **Step 1: Write the failing host test**

```typescript
// apps/web/tests/admin.missions-overview.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
const { roleMock, getUserMock, overviewMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  overviewMock: vi.fn(async () => ({
    kpis: { total: 6, byStatus: { published: 4 }, byType: {}, byVisibility: {}, openForApplications: 4, submissionsAwaitingReview: 2 },
    missionsCreated: [], submissionsReviewed: [], atRisk: [],
  })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  usePathname: () => '/en/admin/missions',
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/admin/missions-queries', () => ({ getMissionsOverview: overviewMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import MissionsOverviewPage from '@/app/[locale]/admin/missions/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }) })

describe('admin missions overview host', () => {
  it('renders the overview for an ops user', async () => {
    const ui = await MissionsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('6')).toBeTruthy()
  })
  it('notFounds for a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('merchant')
    await expect(MissionsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('redirects an anonymous user to sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(MissionsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('notFounds for an unknown locale', async () => {
    await expect(MissionsOverviewPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/web && npx vitest run tests/admin.missions-overview.host.test.tsx`
Expected: FAIL — `Cannot find module '@/app/[locale]/admin/missions/page'`

- [ ] **Step 3: Write the route**

```typescript
// apps/web/app/[locale]/admin/missions/page.tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getMissionsOverview } from '@/lib/admin/missions-queries'
import { MissionsOverviewView } from '@/components/kinnso/admin/missions/MissionsOverviewView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function MissionsOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const overview = await getMissionsOverview(supabase)
  return <MissionsOverviewView t={messages.missionsOps} locale={loc} overview={overview} />
}
```

- [ ] **Step 4: Add the nav entry to `AdminShell.tsx`**

In `apps/web/components/kinnso/admin/AdminShell.tsx`, change:

```typescript
  const nav = [
    { href: `/${locale}/admin`, label: t.navDashboard },
    { href: `/${locale}/admin/creators`, label: t.navCreators },
    { href: `/${locale}/admin/merchants`, label: t.navMerchants },
    { href: `/${locale}/admin/perks`, label: t.navPerks },
    { href: `/${locale}/admin/users`, label: t.navUsers },
    { href: `/${locale}/admin/team`, label: t.navTeam },
  ]
```

to:

```typescript
  const nav = [
    { href: `/${locale}/admin`, label: t.navDashboard },
    { href: `/${locale}/admin/creators`, label: t.navCreators },
    { href: `/${locale}/admin/merchants`, label: t.navMerchants },
    { href: `/${locale}/admin/missions`, label: t.navMissions },
    { href: `/${locale}/admin/perks`, label: t.navPerks },
    { href: `/${locale}/admin/users`, label: t.navUsers },
    { href: `/${locale}/admin/team`, label: t.navTeam },
  ]
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd apps/web && npx vitest run tests/admin.missions-overview.host.test.tsx`
Expected: PASS (4/4)

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/[locale]/admin/missions/page.tsx" apps/web/components/kinnso/admin/AdminShell.tsx apps/web/tests/admin.missions-overview.host.test.tsx
git commit -m "feat(web): Phase 13A — /admin/missions route + nav entry"
```

---

### Task 6: i18n — `missionsOps` group + `navMissions` across all 7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`
- Modify: `apps/web/tests/i18n.locale-parity.test.ts`

- [ ] **Step 1: Add `navMissions` to the `admin` group in every locale file**

In each of the 7 files, inside the existing `admin: { ... navTeam: '...', ... }` object, add one key. Values per locale:

| Locale | `navMissions` value |
|---|---|
| en | `'Missions'` |
| zh-hk | `'任務'` |
| zh-tw | `'任務'` |
| zh-cn | `'任务'` |
| ja | `'ミッション'` |
| ko | `'미션'` |
| th | `'ภารกิจ'` |

- [ ] **Step 2: Add the `missionsOps` group to `en.ts`**

In `apps/web/lib/i18n/messages/en.ts`, add a new top-level key `missionsOps` (alphabetically near `merchantsOps`), and add `missionsOps: MissionsOpsMessages` to the exported `Messages` interface (mirroring how `merchantsOps` is declared there):

```typescript
export interface MissionsOpsMessages {
  title: string
  subtitle: string
  tabOverview: string
  tabDirectory: string
  kpiTotal: string
  kpiPublished: string
  kpiDraft: string
  kpiPaused: string
  kpiCompleted: string
  kpiCancelled: string
  kpiOpenForApplications: string
  kpiSubmissionsAwaitingReview: string
  trendMissionsCreated: string
  trendSubmissionsReviewed: string
  trendEmpty: string
  atRiskTitle: string
  atRiskEmpty: string
  reasonPublishedNoParticipants: string
  reasonStalledSubmissions: string
  reasonVerificationFailed: string
}
```

and the value object:

```typescript
missionsOps: {
  title: 'Missions',
  subtitle: 'Every merchant mission, platform-wide.',
  tabOverview: 'Overview',
  tabDirectory: 'Directory',
  kpiTotal: 'Total missions',
  kpiPublished: 'Published',
  kpiDraft: 'Draft',
  kpiPaused: 'Paused',
  kpiCompleted: 'Completed',
  kpiCancelled: 'Cancelled',
  kpiOpenForApplications: 'Open for applications',
  kpiSubmissionsAwaitingReview: 'Submissions awaiting review',
  trendMissionsCreated: 'Missions created',
  trendSubmissionsReviewed: 'Submissions reviewed',
  trendEmpty: 'No data in this period',
  atRiskTitle: 'At risk',
  atRiskEmpty: 'Nothing at risk right now',
  reasonPublishedNoParticipants: 'Published, no participants yet',
  reasonStalledSubmissions: 'Submission awaiting review >7 days',
  reasonVerificationFailed: 'Verification failed',
},
```

- [ ] **Step 3: Add the translated `missionsOps` group to the other 6 locale files**

Same key set, translated values:

```typescript
// zh-hk.ts
missionsOps: {
  title: '任務', subtitle: '平台上每個商戶任務的總覽。',
  tabOverview: '總覽', tabDirectory: '目錄',
  kpiTotal: '任務總數', kpiPublished: '已發布', kpiDraft: '草稿', kpiPaused: '已暫停',
  kpiCompleted: '已完成', kpiCancelled: '已取消',
  kpiOpenForApplications: '開放申請中', kpiSubmissionsAwaitingReview: '待審核提交',
  trendMissionsCreated: '新建任務', trendSubmissionsReviewed: '已審核提交', trendEmpty: '此期間暫無數據',
  atRiskTitle: '風險任務', atRiskEmpty: '目前沒有風險項目',
  reasonPublishedNoParticipants: '已發布但尚無參與者', reasonStalledSubmissions: '提交待審核超過7天',
  reasonVerificationFailed: '驗證失敗',
},

// zh-tw.ts
missionsOps: {
  title: '任務', subtitle: '平台上每個商戶任務的總覽。',
  tabOverview: '總覽', tabDirectory: '目錄',
  kpiTotal: '任務總數', kpiPublished: '已發布', kpiDraft: '草稿', kpiPaused: '已暫停',
  kpiCompleted: '已完成', kpiCancelled: '已取消',
  kpiOpenForApplications: '開放申請中', kpiSubmissionsAwaitingReview: '待審核提交',
  trendMissionsCreated: '新建任務', trendSubmissionsReviewed: '已審核提交', trendEmpty: '此期間暫無數據',
  atRiskTitle: '風險任務', atRiskEmpty: '目前沒有風險項目',
  reasonPublishedNoParticipants: '已發布但尚無參與者', reasonStalledSubmissions: '提交待審核超過7天',
  reasonVerificationFailed: '驗證失敗',
},

// zh-cn.ts
missionsOps: {
  title: '任务', subtitle: '平台上每个商户任务的总览。',
  tabOverview: '总览', tabDirectory: '目录',
  kpiTotal: '任务总数', kpiPublished: '已发布', kpiDraft: '草稿', kpiPaused: '已暂停',
  kpiCompleted: '已完成', kpiCancelled: '已取消',
  kpiOpenForApplications: '开放申请中', kpiSubmissionsAwaitingReview: '待审核提交',
  trendMissionsCreated: '新建任务', trendSubmissionsReviewed: '已审核提交', trendEmpty: '此期间暂无数据',
  atRiskTitle: '风险任务', atRiskEmpty: '目前没有风险项目',
  reasonPublishedNoParticipants: '已发布但尚无参与者', reasonStalledSubmissions: '提交待审核超过7天',
  reasonVerificationFailed: '验证失败',
},

// ja.ts
missionsOps: {
  title: 'ミッション', subtitle: 'プラットフォーム全体のすべての企業ミッション。',
  tabOverview: '概要', tabDirectory: 'ディレクトリ',
  kpiTotal: 'ミッション総数', kpiPublished: '公開中', kpiDraft: '下書き', kpiPaused: '一時停止中',
  kpiCompleted: '完了', kpiCancelled: 'キャンセル済み',
  kpiOpenForApplications: '応募受付中', kpiSubmissionsAwaitingReview: '審査待ちの提出物',
  trendMissionsCreated: '作成されたミッション', trendSubmissionsReviewed: '審査済みの提出物', trendEmpty: 'この期間のデータはありません',
  atRiskTitle: '要注意', atRiskEmpty: '現在、要注意の項目はありません',
  reasonPublishedNoParticipants: '公開済み・参加者なし', reasonStalledSubmissions: '提出物が7日以上未審査',
  reasonVerificationFailed: '検証に失敗',
},

// ko.ts
missionsOps: {
  title: '미션', subtitle: '플랫폼 전체의 모든 머천트 미션.',
  tabOverview: '개요', tabDirectory: '디렉터리',
  kpiTotal: '총 미션 수', kpiPublished: '게시됨', kpiDraft: '초안', kpiPaused: '일시중지됨',
  kpiCompleted: '완료됨', kpiCancelled: '취소됨',
  kpiOpenForApplications: '지원 접수 중', kpiSubmissionsAwaitingReview: '검토 대기 중인 제출물',
  trendMissionsCreated: '생성된 미션', trendSubmissionsReviewed: '검토된 제출물', trendEmpty: '이 기간에는 데이터가 없습니다',
  atRiskTitle: '위험 항목', atRiskEmpty: '현재 위험 항목이 없습니다',
  reasonPublishedNoParticipants: '게시되었지만 참여자 없음', reasonStalledSubmissions: '제출물이 7일 이상 미검토 상태',
  reasonVerificationFailed: '검증 실패',
},

// th.ts
missionsOps: {
  title: 'ภารกิจ', subtitle: 'ภารกิจของผู้ค้าทั้งหมดในแพลตฟอร์ม',
  tabOverview: 'ภาพรวม', tabDirectory: 'ไดเรกทอรี',
  kpiTotal: 'ภารกิจทั้งหมด', kpiPublished: 'เผยแพร่แล้ว', kpiDraft: 'ฉบับร่าง', kpiPaused: 'หยุดชั่วคราว',
  kpiCompleted: 'เสร็จสิ้น', kpiCancelled: 'ยกเลิกแล้ว',
  kpiOpenForApplications: 'เปิดรับสมัคร', kpiSubmissionsAwaitingReview: 'งานที่รอตรวจสอบ',
  trendMissionsCreated: 'ภารกิจที่สร้างใหม่', trendSubmissionsReviewed: 'งานที่ตรวจสอบแล้ว', trendEmpty: 'ไม่มีข้อมูลในช่วงนี้',
  atRiskTitle: 'มีความเสี่ยง', atRiskEmpty: 'ขณะนี้ไม่มีรายการที่มีความเสี่ยง',
  reasonPublishedNoParticipants: 'เผยแพร่แล้วแต่ยังไม่มีผู้เข้าร่วม', reasonStalledSubmissions: 'งานส่งรอตรวจสอบเกิน 7 วัน',
  reasonVerificationFailed: 'การตรวจสอบล้มเหลว',
},
```

- [ ] **Step 4: Add `'missionsOps'` to the parity test's `GROUPS` array**

In `apps/web/tests/i18n.locale-parity.test.ts`, add `'missionsOps'` to the existing `GROUPS` array (alongside `'merchantsOps'`, `'team'`, etc.).

- [ ] **Step 5: Run the parity test and the two i18n-dependent component/host tests**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts tests/kinnso.MissionsOverviewView.test.tsx tests/admin.missions-overview.host.test.tsx`
Expected: PASS on all three files.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/i18n/messages apps/web/tests/i18n.locale-parity.test.ts
git commit -m "i18n(missions): add missionsOps group + navMissions across all 7 locales (Phase 13A)"
```

---

### Task 7: Full verification

- [ ] **Step 1: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS

- [ ] **Step 2: Lint**

Run: `pnpm --filter web lint`
Expected: PASS

- [ ] **Step 3: Full web test suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS (all suites, including the ones touched above)

- [ ] **Step 4: Update the `operator-console-program` memory**

Note in the persistent memory (not this repo) that Phase 13A (Missions Nav + Overview) shipped, so future sessions know 13B (Directory) is next.

---

## Self-review notes (fixed inline before handoff)

- **Spec coverage:** Task 1 covers `admin_mission_analytics()` from spec §3.1 exactly (same KPI/trend/at-risk shape, same at-risk heuristics and priority ordering). Tasks 3–5 cover the Overview slice from spec §4 (13A row). The Directory tab link is deliberately deferred to 13B (noted inline in Task 4) rather than left as a dead link.
- **Type consistency:** `MissionsOverview`/`AnalyticsPayload` field names in Task 3 match the RPC's `jsonb_build_object` keys in Task 1 exactly (`open_for_applications`, `submissions_awaiting_review`, `missions_created`, `submissions_reviewed`, `at_risk`). `t.missionsOps.*` keys used in `MissionsOverviewView.tsx` (Task 4) match the keys defined in Task 6 one-for-one — cross-checked both directions.
- **No placeholders:** every step has real, complete code; no "add appropriate error handling" or "similar to Task N" shorthand.
