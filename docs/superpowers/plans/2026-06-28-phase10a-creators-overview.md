# Phase 10A — Creators Console: Nav + Shared Audit Log + Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first vertical slice of the Creators Operator Console — add a `Creators` item to the admin nav, build the shared `ops_audit_log` table + append helper, build the `admin_creator_analytics()` aggregate RPC, and render the **Overview** tab (KPIs, signup/engagement trends, contribution leaderboard, at-risk list, recent moderation feed).

**Architecture:** Mirrors the Phase 6 admin recipe exactly. Platform-wide reads go through a SECURITY DEFINER RPC gated on `is_active_ops()` (owner-scoped RLS would hide other creators' rows from an ops session). The page gates inline with `requireOpsPage` before any fetch (Next renders layout + page in parallel). Data-access functions are pure (`SupabaseClient<Database>` in, typed object out, errors propagate). The view is presentational, fed a typed `CreatorsOverview` + a `Messages['creators']` i18n slice.

**Tech Stack:** Next.js 16 App Router (Server Components), React 19, TypeScript, Tailwind v4, Supabase Postgres (SECURITY DEFINER RPCs + RLS), Vitest 4, custom i18n (7 locales).

**Spec:** `docs/superpowers/specs/2026-06-28-phase10-creators-operator-console-design.md` (§3.1 audit log, §3.2 analytics, §5 → 10A row).

---

## Scope notes (read before starting)

- **`verified` and `banned` are NOT in 10A.** The `creators.status` CHECK still allows only `onboarding | active | suspended`, and there is no `verified` column yet — both land in **10B**. So the Overview here shows status/new/payouts KPIs but **no "verified" KPI**, and `by_status` is computed with a dynamic `group by status` so the `banned` bucket appears automatically once 10B extends the constraint. The shared **`VerifiedBadge`** component and its `verified` i18n label are still built in 10A (they're shared primitives consumed in 10B), they're just not rendered on the Overview yet.
- **`ops_audit_log` is shared, not creator-specific.** It is built here once and reused by every later console module. 10A only *reads* it (the Overview "recent moderation activity" feed); the first *writes* happen in 10B. The append helper is built now so later RPCs can call it.
- **Honest data.** Every query propagates DB errors (never swallow to `[]`/`0`). The view distinguishes an honest empty (zero rows) from a load failure (the page throws → error boundary).
- All work happens on the existing `feat/creators-console` branch (the spec is already committed there).

## File structure

**Create:**
- `supabase/migrations/20260628130000_ops_audit_log_and_creator_analytics.sql` — shared audit log (table + RLS + `ops_audit_log_append`) and `admin_creator_analytics(p_days)` RPC.
- `apps/web/lib/admin/audit.ts` — `AuditEntry` type + `listAudit()` (per-entity) + `listRecentAudit()` (cross-entity feed).
- `apps/web/lib/admin/creators-queries.ts` — `CreatorsOverview` type + `getCreatorsOverview()`.
- `apps/web/components/kinnso/admin/creators/badges.tsx` — shared `StatusBadge`, `TierBadge`, `VerifiedBadge`.
- `apps/web/components/kinnso/admin/creators/KpiCard.tsx` — one KPI tile (label, value, optional delta).
- `apps/web/components/kinnso/admin/creators/TrendChart.tsx` — inline SVG bar sparkline.
- `apps/web/components/kinnso/admin/creators/Leaderboard.tsx` — ranked contributor list.
- `apps/web/components/kinnso/admin/creators/CreatorsOverviewView.tsx` — composes the above.
- `apps/web/app/[locale]/admin/creators/page.tsx` — gate → fetch → view.
- Tests: `apps/web/tests/admin.audit.test.ts`, `admin.creators-queries.test.ts`, `kinnso.creators-badges.test.tsx`, `kinnso.creators-overview-parts.test.tsx`, `kinnso.CreatorsOverviewView.test.tsx`, `admin.creators.host.test.tsx`.

**Modify:**
- `apps/web/lib/i18n/messages/en.ts` — add `navCreators` to the `admin` interface+value; add a `creators` group to the `Messages` interface and the `en` value.
- `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` — add `navCreators` + the `creators` group value.
- `apps/web/tests/i18n.locale-parity.test.ts` — add `'creators'` to the `GROUPS` array.
- `apps/web/components/kinnso/admin/AdminShell.tsx` — add the `Creators` nav entry.
- `apps/web/tests/kinnso.AdminShell.test.tsx` — assert the new nav link.

---

## Task 1: Migration — shared `ops_audit_log` + `admin_creator_analytics()` RPC

**Files:**
- Create: `supabase/migrations/20260628130000_ops_audit_log_and_creator_analytics.sql`

There is no unit-test harness for raw SQL in this repo (TS tests mock Supabase). Verification is: the migration applies cleanly and `pnpm --filter @kinnso/db gen` produces a `Database` type that includes the new table and RPC so the TS in later tasks typechecks.

- [ ] **Step 1: Write the migration file**

```sql
-- Phase 10A — Creators Operator Console: shared ops audit log + creator analytics.
-- ops_audit_log is platform-wide (every later console module reuses it). Writes go
-- ONLY through SECURITY DEFINER RPCs (ops_audit_log_append + future mutation RPCs);
-- direct insert/update/delete is denied. Reads are ops-only via the read policy.
-- admin_creator_analytics() is the ops-aggregate read for the Overview tab; it is
-- gated internally on is_active_ops() so non-ops are rejected at the DB boundary.

-- 1. Shared audit / notes log.
create table public.ops_audit_log (
  id                  uuid primary key default gen_random_uuid(),
  actor_ops_member_id uuid not null references public.kinnso_ops_members(id),
  entity_type         text not null,           -- 'creator' | 'merchant' | 'settlement' | ...
  entity_id           uuid not null,
  action              text not null,           -- 'status.suspend' | 'verify.set' | 'note.add' | ...
  reason              text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index ops_audit_log_entity_idx
  on public.ops_audit_log (entity_type, entity_id, created_at desc);
create index ops_audit_log_type_created_idx
  on public.ops_audit_log (entity_type, created_at desc);

alter table public.ops_audit_log enable row level security;
-- Read: any active ops member sees all audit rows. No insert/update/delete policy
-- exists, so (with RLS on) direct writes are denied for everyone; writes happen only
-- inside SECURITY DEFINER functions, which bypass RLS.
create policy ops_audit_read on public.ops_audit_log
  for select using (public.is_active_ops());

-- 2. Append helper. SECURITY DEFINER so mutation RPCs can write an audit row in the
--    same transaction. Resolves the actor from the caller's auth.uid() (callers do not
--    pass an actor id — this prevents spoofing). Raises if the caller is not active ops.
create or replace function public.ops_audit_log_append(
  p_entity_type text,
  p_entity_id   uuid,
  p_action      text,
  p_reason      text default null,
  p_metadata    jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid;
  v_id    uuid;
begin
  select id into v_actor from public.kinnso_ops_members
    where user_id = auth.uid() and status = 'active';
  if v_actor is null then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.ops_audit_log
    (actor_ops_member_id, entity_type, entity_id, action, reason, metadata)
  values
    (v_actor, p_entity_type, p_entity_id, p_action, p_reason, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

-- 3. Ops-aggregate analytics for the Creators Overview. Single jsonb payload.
--    by_status uses a dynamic group-by so the 'banned' bucket appears automatically
--    once Phase 10B extends the status CHECK (no change to this function needed).
--    Heuristics (documented + tunable here):
--      payouts_pending = mission_settlements with overall status in (pending, partially_paid)
--      at_risk         = latest scan job failed  OR  active creator with no
--                        active/completed mission participation.
create or replace function public.admin_creator_analytics(p_days int default 30)
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
      'total', (select count(*) from public.creators),
      'by_status', coalesce((
        select jsonb_object_agg(status, c) from (
          select status, count(*) as c from public.creators group by status
        ) s), '{}'::jsonb),
      'new_in_period', (select count(*) from public.creators where created_at >= v_start),
      'new_prev_period', (select count(*) from public.creators
        where created_at >= v_prev_start and created_at < v_start),
      'payouts_pending', (select count(*) from public.mission_settlements
        where status in ('pending', 'partially_paid'))
    ),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', cnt) order by d) from (
        select date_trunc('day', created_at) as d, count(*) as cnt
        from public.creators where created_at >= v_start group by 1
      ) t), '[]'::jsonb),
    'engagement', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'points', pts) order by d) from (
        select date_trunc('day', created_at) as d, sum(points) as pts
        from public.creator_contribution_events where created_at >= v_start group by 1
      ) e), '[]'::jsonb),
    'leaderboard', coalesce((
      select jsonb_agg(jsonb_build_object(
        'creator_id', cc.creator_id, 'display_name', cr.display_name,
        'points', cc.contribution_points, 'tier', cc.tier)
        order by cc.contribution_points desc)
      from (
        select creator_id, contribution_points, tier
        from public.creator_contribution
        order by contribution_points desc limit 10
      ) cc join public.creators cr on cr.id = cc.creator_id
    ), '[]'::jsonb),
    'at_risk', coalesce((
      select jsonb_agg(jsonb_build_object(
        'creator_id', r.id, 'display_name', r.display_name, 'reason', r.reason))
      from (
        select c.id, c.display_name,
          case when latest.status = 'failed' then 'scan_failed'
               else 'no_active_missions' end as reason
        from public.creators c
        left join lateral (
          select j.status from public.creator_scan_jobs j
          where j.creator_id = c.id order by j.created_at desc limit 1
        ) latest on true
        where latest.status = 'failed'
           or (c.status = 'active' and not exists (
                select 1 from public.mission_participants mp
                where mp.creator_id = c.id and mp.status in ('active', 'completed')))
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end $$;

-- 4. Grants. Revoke the implicit public+anon EXECUTE (Supabase re-grants anon by
--    default), then grant only to authenticated. is_active_ops() is the real gate.
revoke all on function public.ops_audit_log_append(text, uuid, text, text, jsonb) from public, anon;
revoke all on function public.admin_creator_analytics(int) from public, anon;
grant execute on function public.ops_audit_log_append(text, uuid, text, text, jsonb) to authenticated;
grant execute on function public.admin_creator_analytics(int) to authenticated;
```

- [ ] **Step 2: Apply the migration to the Supabase project**

Use the Supabase MCP `apply_migration` with name `ops_audit_log_and_creator_analytics` and the SQL above (project ref `scryfkefedzuetfdtrvl`; confirm the MCP is pointed at the right account/org). If using the CLI instead: `supabase db push`.

Expected: applies with no error. Sanity-check in SQL:
`select public.admin_creator_analytics(30);` as an active ops user returns a jsonb object with `kpis`, `signups`, `engagement`, `leaderboard`, `at_risk` keys.

- [ ] **Step 3: Regenerate DB types**

Run: `pnpm --filter @kinnso/db gen`
Expected: `packages/db` regenerates; `Database['public']['Tables']['ops_audit_log']` and `Database['public']['Functions']['admin_creator_analytics']` now exist (so later tasks typecheck).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260628130000_ops_audit_log_and_creator_analytics.sql packages/db
git commit -m "feat(db): add shared ops_audit_log + admin_creator_analytics RPC (Phase 10A)"
```

---

## Task 2: `lib/admin/audit.ts` — read the audit log

**Files:**
- Create: `apps/web/lib/admin/audit.ts`
- Test: `apps/web/tests/admin.audit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { listAudit, listRecentAudit } from '@/lib/admin/audit'

type Row = {
  id: string; entity_type: string; entity_id: string; action: string
  reason: string | null; metadata: Record<string, unknown>; created_at: string
}

/** Mocks the supabase query builder chain used by the audit readers. */
function client(rows: Row[] | null, error: unknown = null) {
  const calls: Record<string, unknown> = {}
  const builder: Record<string, unknown> = {
    select() { return builder },
    eq(col: string, val: unknown) { calls[col] = val; return builder },
    order() { return builder },
    async limit() { return { data: rows, error } },
  }
  return { from: (t: string) => { calls.from = t; return builder }, _calls: calls }
}

const row: Row = {
  id: 'a1', entity_type: 'creator', entity_id: 'c1', action: 'status.suspend',
  reason: 'spam', metadata: { from: 'active', to: 'suspended' }, created_at: '2026-06-28T00:00:00Z',
}

describe('listAudit', () => {
  it('maps rows to camelCase AuditEntry objects', async () => {
    const out = await listAudit(client([row]) as never, 'creator', 'c1')
    expect(out).toEqual([{
      id: 'a1', entityType: 'creator', entityId: 'c1', action: 'status.suspend',
      reason: 'spam', metadata: { from: 'active', to: 'suspended' }, createdAt: '2026-06-28T00:00:00Z',
    }])
  })
  it('returns [] when the table is empty', async () => {
    expect(await listAudit(client([]) as never, 'creator', 'c1')).toEqual([])
  })
  it('throws when the query errors (no silent empty)', async () => {
    await expect(listAudit(client(null, { message: 'boom' }) as never, 'creator', 'c1')).rejects.toBeTruthy()
  })
})

describe('listRecentAudit', () => {
  it('maps the cross-entity feed rows', async () => {
    const out = await listRecentAudit(client([row]) as never, 'creator', 5)
    expect(out[0].action).toBe('status.suspend')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- admin.audit`
Expected: FAIL — `Cannot find module '@/lib/admin/audit'`.

- [ ] **Step 3: Write the implementation**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface AuditEntry {
  id: string
  entityType: string
  entityId: string
  action: string
  reason: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

type AuditRow = {
  id: string
  entity_type: string
  entity_id: string
  action: string
  reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const toEntry = (r: AuditRow): AuditEntry => ({
  id: r.id,
  entityType: r.entity_type,
  entityId: r.entity_id,
  action: r.action,
  reason: r.reason,
  metadata: r.metadata ?? {},
  createdAt: r.created_at,
})

const COLS = 'id, entity_type, entity_id, action, reason, metadata, created_at'

/** Audit entries for one entity, newest first. Errors propagate. */
export async function listAudit(
  supabase: Client,
  entityType: string,
  entityId: string,
  limit = 50,
): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('ops_audit_log')
    .select(COLS)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as AuditRow[]).map(toEntry)
}

/** Recent audit entries across all entities of a type (the Overview feed). */
export async function listRecentAudit(
  supabase: Client,
  entityType: string,
  limit = 20,
): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('ops_audit_log')
    .select(COLS)
    .eq('entity_type', entityType)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as AuditRow[]).map(toEntry)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- admin.audit`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/audit.ts apps/web/tests/admin.audit.test.ts
git commit -m "feat(web): add ops audit log readers (Phase 10A)"
```

---

## Task 3: `lib/admin/creators-queries.ts` — `getCreatorsOverview()`

**Files:**
- Create: `apps/web/lib/admin/creators-queries.ts`
- Test: `apps/web/tests/admin.creators-queries.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/admin/audit', () => ({
  listRecentAudit: vi.fn(async () => [
    { id: 'a1', entityType: 'creator', entityId: 'c1', action: 'note.add', reason: 'hi', metadata: {}, createdAt: '2026-06-28T00:00:00Z' },
  ]),
}))

import { getCreatorsOverview } from '@/lib/admin/creators-queries'

const analytics = {
  kpis: { total: 12, by_status: { onboarding: 2, active: 8, suspended: 2 }, new_in_period: 3, new_prev_period: 1, payouts_pending: 4 },
  signups: [{ day: '2026-06-27', count: 2 }, { day: '2026-06-28', count: 1 }],
  engagement: [{ day: '2026-06-28', points: 40 }],
  leaderboard: [{ creator_id: 'c1', display_name: 'Mia', points: 320, tier: 'pro' }],
  at_risk: [{ creator_id: 'c2', display_name: 'Lee', reason: 'scan_failed' }],
}

/** Mocks supabase.rpc('admin_creator_analytics', { p_days }) → { data, error }. */
function client(data: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) }
}

describe('getCreatorsOverview', () => {
  it('maps the analytics jsonb + recent feed into a typed CreatorsOverview', async () => {
    const c = client(analytics)
    const o = await getCreatorsOverview(c as never, 30)
    expect(c.rpc).toHaveBeenCalledWith('admin_creator_analytics', { p_days: 30 })
    expect(o.kpis).toEqual({ total: 12, byStatus: { onboarding: 2, active: 8, suspended: 2 }, newInPeriod: 3, newPrevPeriod: 1, payoutsPending: 4 })
    expect(o.signups).toEqual([{ day: '2026-06-27', count: 2 }, { day: '2026-06-28', count: 1 }])
    expect(o.engagement).toEqual([{ day: '2026-06-28', points: 40 }])
    expect(o.leaderboard).toEqual([{ creatorId: 'c1', displayName: 'Mia', points: 320, tier: 'pro' }])
    expect(o.atRisk).toEqual([{ creatorId: 'c2', displayName: 'Lee', reason: 'scan_failed' }])
    expect(o.recentActivity[0].action).toBe('note.add')
  })
  it('defaults missing status buckets and arrays to honest zeros/empties', async () => {
    const o = await getCreatorsOverview(client({ kpis: { total: 0, by_status: {}, new_in_period: 0, new_prev_period: 0, payouts_pending: 0 } }) as never, 30)
    expect(o.signups).toEqual([])
    expect(o.engagement).toEqual([])
    expect(o.leaderboard).toEqual([])
    expect(o.atRisk).toEqual([])
  })
  it('throws when the RPC errors (no silent zeros)', async () => {
    await expect(getCreatorsOverview(client(null, { message: 'forbidden' }) as never, 30)).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- admin.creators-queries`
Expected: FAIL — `Cannot find module '@/lib/admin/creators-queries'`.

- [ ] **Step 3: Write the implementation**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { listRecentAudit, type AuditEntry } from '@/lib/admin/audit'

type Client = SupabaseClient<Database>

export interface CreatorsOverview {
  kpis: {
    total: number
    byStatus: Record<string, number>
    newInPeriod: number
    newPrevPeriod: number
    payoutsPending: number
  }
  signups: { day: string; count: number }[]
  engagement: { day: string; points: number }[]
  leaderboard: { creatorId: string; displayName: string | null; points: number; tier: string }[]
  atRisk: { creatorId: string; displayName: string | null; reason: string }[]
  recentActivity: AuditEntry[]
}

type AnalyticsPayload = {
  kpis: {
    total: number
    by_status: Record<string, number>
    new_in_period: number
    new_prev_period: number
    payouts_pending: number
  }
  signups?: { day: string; count: number }[]
  engagement?: { day: string; points: number }[]
  leaderboard?: { creator_id: string; display_name: string | null; points: number; tier: string }[]
  at_risk?: { creator_id: string; display_name: string | null; reason: string }[]
}

/**
 * Ops-aggregate Creators Overview. Counts/series come from the SECURITY DEFINER
 * `admin_creator_analytics()` RPC (gated on is_active_ops()) so an ops user sees
 * platform-wide data despite owner-scoped RLS. The recent-activity feed reads the
 * shared ops_audit_log. Errors propagate (no silent zeros).
 */
export async function getCreatorsOverview(supabase: Client, days = 30): Promise<CreatorsOverview> {
  const { data, error } = await supabase.rpc('admin_creator_analytics', { p_days: days })
  if (error || !data) throw error ?? new Error('admin_creator_analytics returned no data')
  const a = data as unknown as AnalyticsPayload
  const recentActivity = await listRecentAudit(supabase, 'creator', 20)
  return {
    kpis: {
      total: Number(a.kpis.total),
      byStatus: a.kpis.by_status ?? {},
      newInPeriod: Number(a.kpis.new_in_period),
      newPrevPeriod: Number(a.kpis.new_prev_period),
      payoutsPending: Number(a.kpis.payouts_pending),
    },
    signups: (a.signups ?? []).map((s) => ({ day: s.day, count: Number(s.count) })),
    engagement: (a.engagement ?? []).map((e) => ({ day: e.day, points: Number(e.points) })),
    leaderboard: (a.leaderboard ?? []).map((l) => ({
      creatorId: l.creator_id, displayName: l.display_name, points: Number(l.points), tier: l.tier,
    })),
    atRisk: (a.at_risk ?? []).map((r) => ({
      creatorId: r.creator_id, displayName: r.display_name, reason: r.reason,
    })),
    recentActivity,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- admin.creators-queries`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/creators-queries.ts apps/web/tests/admin.creators-queries.test.ts
git commit -m "feat(web): add getCreatorsOverview query (Phase 10A)"
```

---

## Task 4: i18n — `navCreators` + the `creators` message group (all 7 locales)

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface + value)
- Modify: `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` (value)
- Modify: `apps/web/tests/i18n.locale-parity.test.ts` (add `'creators'` to `GROUPS`)

The view in later tasks imports `Messages['creators']`, so the interface must define it before those tasks typecheck. Parity is enforced by `i18n.locale-parity.test.ts`.

- [ ] **Step 1: Add `'creators'` to the parity GROUPS array**

In `apps/web/tests/i18n.locale-parity.test.ts`, change the `GROUPS` array's last line from:

```ts
  'users', 'merchantSearch', 'insights', 'seo',
] as const
```

to:

```ts
  'users', 'merchantSearch', 'insights', 'seo', 'creators',
] as const
```

- [ ] **Step 2: Run the parity test to verify it now fails**

Run: `pnpm --filter web test -- i18n.locale-parity`
Expected: FAIL — `en` has no `creators` group yet (the "en defines the groups" assertion fails / `keyPaths(undefined)` mismatch).

- [ ] **Step 3: Update `en.ts` — interface**

In the `Messages` interface, add `navCreators` to the `admin` group:

```ts
  admin: {
    navDashboard: string; navPerks: string; navUsers: string; navCreators: string
    dashboardTitle: string; dashboardSubtitle: string
    statCreators: string; statMerchants: string; statOps: string
    statPerksActive: string; statPerksTotal: string; statRedemptions: string
  }
```

Then add the `creators` group to the interface (place it right after the `admin` group block, before `perks`):

```ts
  creators: {
    title: string; subtitle: string
    kpiTotal: string; kpiActive: string; kpiSuspended: string; kpiOnboarding: string
    kpiNew: string; kpiPayoutsPending: string
    trendSignups: string; trendEngagement: string; trendEmpty: string
    leaderboardTitle: string; leaderboardEmpty: string; points: string
    atRiskTitle: string; atRiskEmpty: string; reasonScanFailed: string; reasonNoMissions: string
    activityTitle: string; activityEmpty: string
    statusOnboarding: string; statusActive: string; statusSuspended: string; statusBanned: string
    tierSeed: string; tierRising: string; tierPro: string; tierElite: string
    verified: string
  }
```

- [ ] **Step 4: Update `en.ts` — value**

Add `navCreators: 'Creators',` to the `admin` value group (after `navUsers`). Then add the `creators` value group (right after the `admin` value block):

```ts
  creators: {
    title: 'Creators',
    subtitle: 'Understand, moderate, analyze, and pay your creators.',
    kpiTotal: 'Total creators', kpiActive: 'Active', kpiSuspended: 'Suspended', kpiOnboarding: 'Onboarding',
    kpiNew: 'New this period', kpiPayoutsPending: 'Payouts pending',
    trendSignups: 'Signups', trendEngagement: 'Engagement (points)', trendEmpty: 'No data in this period',
    leaderboardTitle: 'Top contributors', leaderboardEmpty: 'No contributors yet', points: 'points',
    atRiskTitle: 'At-risk creators', atRiskEmpty: 'No at-risk creators',
    reasonScanFailed: 'Scan failed', reasonNoMissions: 'No active missions',
    activityTitle: 'Recent moderation activity', activityEmpty: 'No moderation activity yet',
    statusOnboarding: 'Onboarding', statusActive: 'Active', statusSuspended: 'Suspended', statusBanned: 'Banned',
    tierSeed: 'Seed', tierRising: 'Rising', tierPro: 'Pro', tierElite: 'Elite',
    verified: 'Verified',
  },
```

- [ ] **Step 5: Update the 6 other locale value files**

Add `navCreators: '<localized>',` to each file's `admin` group (after `navUsers`), and add the `creators` group. Use these exact translations.

`zh-hk.ts` — `admin.navCreators: '創作者',` and:

```ts
  creators: {
    title: '創作者',
    subtitle: '了解、管理、分析並向你的創作者付款。',
    kpiTotal: '創作者總數', kpiActive: '活躍', kpiSuspended: '已停用', kpiOnboarding: '加入中',
    kpiNew: '本期新增', kpiPayoutsPending: '待付款',
    trendSignups: '註冊', trendEngagement: '互動（積分）', trendEmpty: '此期間沒有數據',
    leaderboardTitle: '頂尖貢獻者', leaderboardEmpty: '暫無貢獻者', points: '積分',
    atRiskTitle: '高風險創作者', atRiskEmpty: '沒有高風險創作者',
    reasonScanFailed: '掃描失敗', reasonNoMissions: '沒有進行中的任務',
    activityTitle: '最近審核活動', activityEmpty: '暫無審核活動',
    statusOnboarding: '加入中', statusActive: '活躍', statusSuspended: '已停用', statusBanned: '已封禁',
    tierSeed: '萌芽', tierRising: '冒起', tierPro: '專業', tierElite: '精英',
    verified: '已驗證',
  },
```

`zh-tw.ts` — `admin.navCreators: '創作者',` and:

```ts
  creators: {
    title: '創作者',
    subtitle: '了解、管理、分析並向您的創作者付款。',
    kpiTotal: '創作者總數', kpiActive: '活躍', kpiSuspended: '已停權', kpiOnboarding: '加入中',
    kpiNew: '本期新增', kpiPayoutsPending: '待付款',
    trendSignups: '註冊', trendEngagement: '互動（點數）', trendEmpty: '此期間沒有資料',
    leaderboardTitle: '頂尖貢獻者', leaderboardEmpty: '尚無貢獻者', points: '點數',
    atRiskTitle: '高風險創作者', atRiskEmpty: '沒有高風險創作者',
    reasonScanFailed: '掃描失敗', reasonNoMissions: '沒有進行中的任務',
    activityTitle: '最近審核活動', activityEmpty: '尚無審核活動',
    statusOnboarding: '加入中', statusActive: '活躍', statusSuspended: '已停權', statusBanned: '已封鎖',
    tierSeed: '萌芽', tierRising: '崛起', tierPro: '專業', tierElite: '菁英',
    verified: '已驗證',
  },
```

`zh-cn.ts` — `admin.navCreators: '创作者',` and:

```ts
  creators: {
    title: '创作者',
    subtitle: '了解、管理、分析并向你的创作者付款。',
    kpiTotal: '创作者总数', kpiActive: '活跃', kpiSuspended: '已停用', kpiOnboarding: '加入中',
    kpiNew: '本期新增', kpiPayoutsPending: '待付款',
    trendSignups: '注册', trendEngagement: '互动（积分）', trendEmpty: '此期间没有数据',
    leaderboardTitle: '顶尖贡献者', leaderboardEmpty: '暂无贡献者', points: '积分',
    atRiskTitle: '高风险创作者', atRiskEmpty: '没有高风险创作者',
    reasonScanFailed: '扫描失败', reasonNoMissions: '没有进行中的任务',
    activityTitle: '最近审核活动', activityEmpty: '暂无审核活动',
    statusOnboarding: '加入中', statusActive: '活跃', statusSuspended: '已停用', statusBanned: '已封禁',
    tierSeed: '萌芽', tierRising: '崛起', tierPro: '专业', tierElite: '精英',
    verified: '已验证',
  },
```

`ja.ts` — `admin.navCreators: 'クリエイター',` and:

```ts
  creators: {
    title: 'クリエイター',
    subtitle: 'クリエイターを把握・管理・分析し、支払います。',
    kpiTotal: 'クリエイター総数', kpiActive: 'アクティブ', kpiSuspended: '停止中', kpiOnboarding: '登録中',
    kpiNew: '今期の新規', kpiPayoutsPending: '支払い保留',
    trendSignups: '登録', trendEngagement: 'エンゲージメント（ポイント）', trendEmpty: 'この期間のデータはありません',
    leaderboardTitle: 'トップ貢献者', leaderboardEmpty: '貢献者はまだいません', points: 'ポイント',
    atRiskTitle: 'リスクのあるクリエイター', atRiskEmpty: 'リスクのあるクリエイターはいません',
    reasonScanFailed: 'スキャン失敗', reasonNoMissions: '進行中のミッションなし',
    activityTitle: '最近のモデレーション活動', activityEmpty: 'モデレーション活動はまだありません',
    statusOnboarding: '登録中', statusActive: 'アクティブ', statusSuspended: '停止中', statusBanned: '禁止',
    tierSeed: 'シード', tierRising: 'ライジング', tierPro: 'プロ', tierElite: 'エリート',
    verified: '認証済み',
  },
```

`ko.ts` — `admin.navCreators: '크리에이터',` and:

```ts
  creators: {
    title: '크리에이터',
    subtitle: '크리에이터를 파악·관리·분석하고 정산합니다.',
    kpiTotal: '전체 크리에이터', kpiActive: '활성', kpiSuspended: '정지됨', kpiOnboarding: '온보딩',
    kpiNew: '이번 기간 신규', kpiPayoutsPending: '정산 대기',
    trendSignups: '가입', trendEngagement: '참여(포인트)', trendEmpty: '이 기간에 데이터가 없습니다',
    leaderboardTitle: '상위 기여자', leaderboardEmpty: '아직 기여자가 없습니다', points: '포인트',
    atRiskTitle: '위험 크리에이터', atRiskEmpty: '위험 크리에이터가 없습니다',
    reasonScanFailed: '스캔 실패', reasonNoMissions: '진행 중인 미션 없음',
    activityTitle: '최근 모더레이션 활동', activityEmpty: '아직 모더레이션 활동이 없습니다',
    statusOnboarding: '온보딩', statusActive: '활성', statusSuspended: '정지됨', statusBanned: '차단됨',
    tierSeed: '시드', tierRising: '라이징', tierPro: '프로', tierElite: '엘리트',
    verified: '인증됨',
  },
```

`th.ts` — `admin.navCreators: 'ครีเอเตอร์',` and:

```ts
  creators: {
    title: 'ครีเอเตอร์',
    subtitle: 'ทำความเข้าใจ จัดการ วิเคราะห์ และจ่ายเงินให้ครีเอเตอร์ของคุณ',
    kpiTotal: 'ครีเอเตอร์ทั้งหมด', kpiActive: 'ใช้งาน', kpiSuspended: 'ระงับ', kpiOnboarding: 'กำลังเริ่มต้น',
    kpiNew: 'ใหม่ในช่วงนี้', kpiPayoutsPending: 'รอจ่ายเงิน',
    trendSignups: 'การสมัคร', trendEngagement: 'การมีส่วนร่วม (คะแนน)', trendEmpty: 'ไม่มีข้อมูลในช่วงนี้',
    leaderboardTitle: 'ผู้มีส่วนร่วมสูงสุด', leaderboardEmpty: 'ยังไม่มีผู้มีส่วนร่วม', points: 'คะแนน',
    atRiskTitle: 'ครีเอเตอร์ที่มีความเสี่ยง', atRiskEmpty: 'ไม่มีครีเอเตอร์ที่มีความเสี่ยง',
    reasonScanFailed: 'สแกนล้มเหลว', reasonNoMissions: 'ไม่มีภารกิจที่ดำเนินอยู่',
    activityTitle: 'กิจกรรมการกลั่นกรองล่าสุด', activityEmpty: 'ยังไม่มีกิจกรรมการกลั่นกรอง',
    statusOnboarding: 'กำลังเริ่มต้น', statusActive: 'ใช้งาน', statusSuspended: 'ระงับ', statusBanned: 'แบน',
    tierSeed: 'เริ่มต้น', tierRising: 'กำลังมา', tierPro: 'โปร', tierElite: 'อีลิท',
    verified: 'ยืนยันแล้ว',
  },
```

- [ ] **Step 6: Run parity + typecheck to verify green**

Run: `pnpm --filter web test -- i18n` then `pnpm --filter web typecheck`
Expected: PASS — all locales have identical `creators` keys; the `Messages` interface compiles.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/i18n/messages apps/web/tests/i18n.locale-parity.test.ts
git commit -m "i18n(web): add creators console message group + navCreators (Phase 10A)"
```

---

## Task 5: Shared badges — `StatusBadge`, `TierBadge`, `VerifiedBadge`

**Files:**
- Create: `apps/web/components/kinnso/admin/creators/badges.tsx`
- Test: `apps/web/tests/kinnso.creators-badges.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { StatusBadge, TierBadge, VerifiedBadge } from '@/components/kinnso/admin/creators/badges'

afterEach(cleanup)

describe('creator badges', () => {
  it('StatusBadge renders the localized label for each status', () => {
    render(<StatusBadge status="suspended" t={en.creators} />)
    expect(screen.getByText(en.creators.statusSuspended)).toBeTruthy()
  })
  it('StatusBadge falls back to the raw value for an unknown status', () => {
    render(<StatusBadge status="mystery" t={en.creators} />)
    expect(screen.getByText('mystery')).toBeTruthy()
  })
  it('TierBadge renders the localized tier label', () => {
    render(<TierBadge tier="pro" t={en.creators} />)
    expect(screen.getByText(en.creators.tierPro)).toBeTruthy()
  })
  it('VerifiedBadge renders only when verified', () => {
    const { container } = render(<VerifiedBadge verified={false} t={en.creators} />)
    expect(container.textContent).toBe('')
    cleanup()
    render(<VerifiedBadge verified t={en.creators} />)
    expect(screen.getByText(en.creators.verified)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- kinnso.creators-badges`
Expected: FAIL — `Cannot find module '.../creators/badges'`.

- [ ] **Step 3: Write the implementation**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'

type T = Messages['creators']

const STATUS_STYLE: Record<string, string> = {
  onboarding: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  suspended: 'bg-orange-100 text-orange-800',
  banned: 'bg-red-100 text-red-800',
}

const STATUS_LABEL = (t: T): Record<string, string> => ({
  onboarding: t.statusOnboarding,
  active: t.statusActive,
  suspended: t.statusSuspended,
  banned: t.statusBanned,
})

const TIER_LABEL = (t: T): Record<string, string> => ({
  seed: t.tierSeed,
  rising: t.tierRising,
  pro: t.tierPro,
  elite: t.tierElite,
})

const pill = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold'

export function StatusBadge({ status, t }: { status: string; t: T }) {
  return (
    <span className={`${pill} ${STATUS_STYLE[status] ?? 'bg-kinnso-paper text-kinnso-muted'}`}>
      {STATUS_LABEL(t)[status] ?? status}
    </span>
  )
}

export function TierBadge({ tier, t }: { tier: string; t: T }) {
  return (
    <span className={`${pill} bg-kinnso-paper text-kinnso-ink`}>
      {TIER_LABEL(t)[tier] ?? tier}
    </span>
  )
}

export function VerifiedBadge({ verified, t }: { verified: boolean; t: T }) {
  if (!verified) return null
  return <span className={`${pill} bg-blue-100 text-blue-800`} aria-label={t.verified}>✓ {t.verified}</span>
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- kinnso.creators-badges`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/admin/creators/badges.tsx apps/web/tests/kinnso.creators-badges.test.tsx
git commit -m "feat(web): add shared creator status/tier/verified badges (Phase 10A)"
```

---

## Task 6: Overview building blocks — `KpiCard`, `TrendChart`, `Leaderboard`

**Files:**
- Create: `apps/web/components/kinnso/admin/creators/KpiCard.tsx`
- Create: `apps/web/components/kinnso/admin/creators/TrendChart.tsx`
- Create: `apps/web/components/kinnso/admin/creators/Leaderboard.tsx`
- Test: `apps/web/tests/kinnso.creators-overview-parts.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { KpiCard } from '@/components/kinnso/admin/creators/KpiCard'
import { TrendChart } from '@/components/kinnso/admin/creators/TrendChart'
import { Leaderboard } from '@/components/kinnso/admin/creators/Leaderboard'

afterEach(cleanup)

describe('KpiCard', () => {
  it('renders label, value, and a positive delta sign', () => {
    render(<KpiCard label="New this period" value={3} delta={2} />)
    expect(screen.getByText('New this period')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('+2')).toBeTruthy()
  })
  it('renders without a delta when none is given', () => {
    render(<KpiCard label="Total" value={12} />)
    expect(screen.getByText('12')).toBeTruthy()
  })
})

describe('TrendChart', () => {
  it('renders one bar per data point with heights scaled to the max', () => {
    render(<TrendChart points={[{ label: 'a', value: 1 }, { label: 'b', value: 4 }]} emptyText="none" />)
    const bars = document.querySelectorAll('[data-testid="trend-bar"]')
    expect(bars.length).toBe(2)
    // tallest bar reaches 100% height, the other is a quarter
    expect((bars[1] as HTMLElement).style.height).toBe('100%')
    expect((bars[0] as HTMLElement).style.height).toBe('25%')
  })
  it('renders the empty text when there are no points', () => {
    render(<TrendChart points={[]} emptyText="none" />)
    expect(screen.getByText('none')).toBeTruthy()
  })
})

describe('Leaderboard', () => {
  it('renders rows in the given order with rank, name, and points', () => {
    render(
      <Leaderboard
        t={en.creators}
        rows={[
          { creatorId: 'c1', displayName: 'Mia', points: 320, tier: 'pro' },
          { creatorId: 'c2', displayName: null, points: 100, tier: 'seed' },
        ]}
      />,
    )
    expect(screen.getByText('Mia')).toBeTruthy()
    expect(screen.getByText('320')).toBeTruthy()
    expect(screen.getByText(en.creators.tierPro)).toBeTruthy()
  })
  it('renders the empty state when there are no rows', () => {
    render(<Leaderboard t={en.creators} rows={[]} />)
    expect(screen.getByText(en.creators.leaderboardEmpty)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- kinnso.creators-overview-parts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `KpiCard.tsx`**

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

- [ ] **Step 4: Write `TrendChart.tsx`**

```tsx
export interface TrendPoint {
  label: string
  value: number
}

/** Minimal dependency-free bar sparkline. Heights are scaled to the series max. */
export function TrendChart({ points, emptyText }: { points: TrendPoint[]; emptyText: string }) {
  if (points.length === 0) {
    return <p className="py-6 text-sm text-kinnso-muted">{emptyText}</p>
  }
  const max = Math.max(...points.map((p) => p.value), 1)
  return (
    <div className="flex h-24 items-end gap-1" role="img">
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

- [ ] **Step 5: Write `Leaderboard.tsx`**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'
import { TierBadge } from '@/components/kinnso/admin/creators/badges'

type Row = { creatorId: string; displayName: string | null; points: number; tier: string }

export function Leaderboard({ t, rows }: { t: Messages['creators']; rows: Row[] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-sm text-kinnso-muted">{t.leaderboardEmpty}</p>
  }
  return (
    <ol className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <li key={r.creatorId} className="flex items-center gap-3 text-sm">
          <span className="w-5 text-right font-black text-kinnso-muted">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate font-bold text-kinnso-ink">{r.displayName ?? '—'}</span>
          <TierBadge tier={r.tier} t={t} />
          <span className="tabular-nums font-bold text-kinnso-ink">{r.points}</span>
          <span className="text-kinnso-muted">{t.points}</span>
        </li>
      ))}
    </ol>
  )
}

export default Leaderboard
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter web test -- kinnso.creators-overview-parts`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/kinnso/admin/creators/KpiCard.tsx apps/web/components/kinnso/admin/creators/TrendChart.tsx apps/web/components/kinnso/admin/creators/Leaderboard.tsx apps/web/tests/kinnso.creators-overview-parts.test.tsx
git commit -m "feat(web): add KPI card, trend chart, leaderboard building blocks (Phase 10A)"
```

---

## Task 7: `CreatorsOverviewView` — compose the Overview

**Files:**
- Create: `apps/web/components/kinnso/admin/creators/CreatorsOverviewView.tsx`
- Test: `apps/web/tests/kinnso.CreatorsOverviewView.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { CreatorsOverviewView } from '@/components/kinnso/admin/creators/CreatorsOverviewView'
import type { CreatorsOverview } from '@/lib/admin/creators-queries'

afterEach(cleanup)

const overview: CreatorsOverview = {
  kpis: { total: 12, byStatus: { active: 8, suspended: 2, onboarding: 2 }, newInPeriod: 3, newPrevPeriod: 1, payoutsPending: 4 },
  signups: [{ day: '2026-06-27', count: 2 }, { day: '2026-06-28', count: 1 }],
  engagement: [{ day: '2026-06-28', points: 40 }],
  leaderboard: [{ creatorId: 'c1', displayName: 'Mia', points: 320, tier: 'pro' }],
  atRisk: [{ creatorId: 'c2', displayName: 'Lee', reason: 'scan_failed' }],
  recentActivity: [
    { id: 'a1', entityType: 'creator', entityId: 'c1', action: 'status.suspend', reason: 'spam', metadata: {}, createdAt: '2026-06-28T00:00:00Z' },
  ],
}

describe('CreatorsOverviewView', () => {
  it('renders the title, KPI values, leaderboard, at-risk, and activity', () => {
    render(<CreatorsOverviewView t={en.creators} overview={overview} />)
    expect(screen.getByText(en.creators.title)).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()           // total
    expect(screen.getByText('8')).toBeTruthy()            // active
    expect(screen.getByText('Mia')).toBeTruthy()          // leaderboard
    expect(screen.getByText('Lee')).toBeTruthy()          // at-risk
    expect(screen.getByText(en.creators.reasonScanFailed)).toBeTruthy()
    expect(screen.getByText('status.suspend')).toBeTruthy() // activity feed
  })
  it('shows honest empty states when there is no data', () => {
    render(<CreatorsOverviewView t={en.creators} overview={{
      kpis: { total: 0, byStatus: {}, newInPeriod: 0, newPrevPeriod: 0, payoutsPending: 0 },
      signups: [], engagement: [], leaderboard: [], atRisk: [], recentActivity: [],
    }} />)
    expect(screen.getByText(en.creators.leaderboardEmpty)).toBeTruthy()
    expect(screen.getByText(en.creators.atRiskEmpty)).toBeTruthy()
    expect(screen.getByText(en.creators.activityEmpty)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- kinnso.CreatorsOverviewView`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorsOverview } from '@/lib/admin/creators-queries'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { KpiCard } from '@/components/kinnso/admin/creators/KpiCard'
import { TrendChart } from '@/components/kinnso/admin/creators/TrendChart'
import { Leaderboard } from '@/components/kinnso/admin/creators/Leaderboard'

const REASON_LABEL = (t: Messages['creators']): Record<string, string> => ({
  scan_failed: t.reasonScanFailed,
  no_active_missions: t.reasonNoMissions,
})

export function CreatorsOverviewView({ t, overview }: { t: Messages['creators']; overview: CreatorsOverview }) {
  const { kpis, signups, engagement, leaderboard, atRisk, recentActivity } = overview
  const reasons = REASON_LABEL(t)
  const kpiCards = [
    { label: t.kpiTotal, value: kpis.total },
    { label: t.kpiActive, value: kpis.byStatus.active ?? 0 },
    { label: t.kpiSuspended, value: kpis.byStatus.suspended ?? 0 },
    { label: t.kpiOnboarding, value: kpis.byStatus.onboarding ?? 0 },
    { label: t.kpiNew, value: kpis.newInPeriod, delta: kpis.newInPeriod - kpis.newPrevPeriod },
    { label: t.kpiPayoutsPending, value: kpis.payoutsPending },
  ]
  return (
    <main>
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
          <TrendChart points={signups.map((s) => ({ label: s.day, value: s.count }))} emptyText={t.trendEmpty} />
        </TicketCard>
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.trendEngagement}</p>
          <TrendChart points={engagement.map((e) => ({ label: e.day, value: e.points }))} emptyText={t.trendEmpty} />
        </TicketCard>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.leaderboardTitle}</p>
          <Leaderboard t={t} rows={leaderboard} />
        </TicketCard>
        <TicketCard className="p-5">
          <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.atRiskTitle}</p>
          {atRisk.length === 0 ? (
            <p className="py-6 text-sm text-kinnso-muted">{t.atRiskEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {atRisk.map((r) => (
                <li key={r.creatorId} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate font-bold text-kinnso-ink">{r.displayName ?? '—'}</span>
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

export default CreatorsOverviewView
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- kinnso.CreatorsOverviewView`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/admin/creators/CreatorsOverviewView.tsx apps/web/tests/kinnso.CreatorsOverviewView.test.tsx
git commit -m "feat(web): add CreatorsOverviewView (Phase 10A)"
```

---

## Task 8: Route — `app/[locale]/admin/creators/page.tsx`

**Files:**
- Create: `apps/web/app/[locale]/admin/creators/page.tsx`
- Test: `apps/web/tests/admin.creators.host.test.tsx`

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
    kpis: { total: 7, byStatus: { active: 5 }, newInPeriod: 1, newPrevPeriod: 0, payoutsPending: 2 },
    signups: [], engagement: [], leaderboard: [], atRisk: [], recentActivity: [],
  })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/admin/creators-queries', () => ({ getCreatorsOverview: overviewMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import CreatorsOverviewPage from '@/app/[locale]/admin/creators/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }) })

describe('admin creators overview host', () => {
  it('renders the overview for an ops user', async () => {
    const ui = await CreatorsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('7')).toBeTruthy()
  })
  it('notFounds for a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(CreatorsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('redirects an anonymous user to sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(CreatorsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('notFounds for an unknown locale', async () => {
    await expect(CreatorsOverviewPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- admin.creators.host`
Expected: FAIL — `Cannot find module '@/app/[locale]/admin/creators/page'`.

- [ ] **Step 3: Write the page**

```tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getCreatorsOverview } from '@/lib/admin/creators-queries'
import { CreatorsOverviewView } from '@/components/kinnso/admin/creators/CreatorsOverviewView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function CreatorsOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  // Gate before any data access: Next renders layout + page in parallel, so the
  // layout's gate does not precede this page's fetch. Match the sibling admin pages.
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const overview = await getCreatorsOverview(supabase)
  return <CreatorsOverviewView t={messages.creators} overview={overview} />
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- admin.creators.host`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/[locale]/admin/creators/page.tsx apps/web/tests/admin.creators.host.test.tsx
git commit -m "feat(web): add creators overview route (Phase 10A)"
```

---

## Task 9: Nav — add `Creators` to `AdminShell`

**Files:**
- Modify: `apps/web/components/kinnso/admin/AdminShell.tsx`
- Modify: `apps/web/tests/kinnso.AdminShell.test.tsx`

- [ ] **Step 1: Update the AdminShell test to expect the Creators link**

In `apps/web/tests/kinnso.AdminShell.test.tsx`, change the assertion block in the first test from:

```tsx
    expect((screen.getByRole('link', { name: en.admin.navUsers }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin/users')
    expect(screen.getByText('child-content')).toBeTruthy()
```

to:

```tsx
    expect((screen.getByRole('link', { name: en.admin.navUsers }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin/users')
    expect((screen.getByRole('link', { name: en.admin.navCreators }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin/creators')
    expect(screen.getByText('child-content')).toBeTruthy()
```

Also update the test title from `'renders the three nav links...'` to `'renders the nav links with correct hrefs and the children'`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- kinnso.AdminShell`
Expected: FAIL — no link named `Creators` exists yet.

- [ ] **Step 3: Add the nav entry in `AdminShell.tsx`**

Change the `nav` array from:

```tsx
  const nav = [
    { href: `/${locale}/admin`, label: t.navDashboard },
    { href: `/${locale}/admin/perks`, label: t.navPerks },
    { href: `/${locale}/admin/users`, label: t.navUsers },
  ]
```

to:

```tsx
  const nav = [
    { href: `/${locale}/admin`, label: t.navDashboard },
    { href: `/${locale}/admin/creators`, label: t.navCreators },
    { href: `/${locale}/admin/perks`, label: t.navPerks },
    { href: `/${locale}/admin/users`, label: t.navUsers },
  ]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- kinnso.AdminShell`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/admin/AdminShell.tsx apps/web/tests/kinnso.AdminShell.test.tsx
git commit -m "feat(web): add Creators item to admin nav (Phase 10A)"
```

---

## Task 10: Full verification

**Files:** none (gate before handing off).

- [ ] **Step 1: Lint**

Run: `pnpm --filter web lint`
Expected: PASS, no errors.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS. (Requires Task 1 Step 3 type regen so `admin_creator_analytics` + `ops_audit_log` are in `Database`.)

- [ ] **Step 3: Full test run**

Run: `pnpm --filter web test`
Expected: PASS. Note: per `CLAUDE.md`, a few suites that hit a real Supabase project may time out on dummy creds — that is expected, not a regression. All Phase 10A suites (`admin.audit`, `admin.creators-queries`, `kinnso.creators-badges`, `kinnso.creators-overview-parts`, `kinnso.CreatorsOverviewView`, `admin.creators.host`, `kinnso.AdminShell`, `i18n.locale-parity`) must pass.

- [ ] **Step 4: Final commit (only if Steps 1-3 surfaced fixes)**

```bash
git add -A
git commit -m "chore(web): lint/type/test fixes for Phase 10A creators overview"
```

---

## Self-review against the spec

- **§3.1 `ops_audit_log`** → Task 1 (table, index, RLS read policy, `ops_audit_log_append`). Read path → Task 2 (`listAudit`/`listRecentAudit`). ✓ (Deviation: the append helper resolves the actor from `auth.uid()` internally instead of taking a `p_actor` arg — strictly safer, prevents actor spoofing. Documented in Task 1.)
- **§3.2 `admin_creator_analytics()`** → Task 1 (KPIs with prev-period delta, signups + engagement time-series, leaderboard, at-risk). ✓ At-risk heuristics are concrete and documented in the migration comment. `verified` KPI intentionally deferred to 10B (column doesn't exist yet) — noted in Scope notes.
- **§5 10A files** → queries (Task 3), Overview view (Task 7), KpiCard/TrendChart/Leaderboard/StatusBadge/TierBadge/VerifiedBadge (Tasks 5-6). ✓
- **§5 10A tests** → `admin.creators-queries` (overview shape, honest zeros, error propagation), `admin.creators.host` (anon→redirect, non-ops→notFound, ops→renders), `kinnso.CreatorsOverviewView`. ✓ Plus `admin.audit`, badges, building-block, AdminShell tests.
- **§2 nav + i18n** → Task 9 (nav entry) + Task 4 (`creators` group + `navCreators` across all 7 locales, parity GROUPS updated). ✓
- **§2 inline gate / errors propagate / no PII to client** → page gates inline before fetch (Task 8); queries throw on error (Tasks 2-3); the Overview ships only aggregate numbers + display names (no email/PII) to the client. ✓
- **Placeholder scan:** no TBD/TODO; every code step contains full code. ✓
- **Type consistency:** `CreatorsOverview`/`AuditEntry` defined in Tasks 2-3 are the exact shapes consumed by the view (Task 7) and host test (Task 8); RPC name `admin_creator_analytics` + arg `{ p_days }` match the migration. ✓
```
