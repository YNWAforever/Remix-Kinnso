# Phase 10C — Creator 360 Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-rich Creator 360 detail page at `/admin/creators/[creatorId]` that aggregates a single creator's profile, DNA/scan, missions, earnings, content, and moderation history, with header quick-actions (the 10B lifecycle/verify/note actions reused) — all ops-gated.

**Architecture:** One SECURITY DEFINER, `is_active_ops()`-gated RPC `admin_creator_detail(p_creator_id uuid) returns jsonb` aggregates every section in one round-trip (mirrors 10A's `admin_creator_analytics`). A `getCreatorDetail()` query wrapper maps it to a typed `CreatorDetail` (or `null` when the creator is missing → `notFound()`). A client `CreatorDetailView` owns the active sub-tab + action wiring; five presentational tab components render the sections. The Moderation tab reads `listAudit(supabase, 'creator', id)` (already built in 10A) and adds a note via the existing `addCreatorNote` action. Directory rows gain a link into this page.

**Tech Stack:** Next.js 16 App Router (Server Components + a client view), React 19, TypeScript, Tailwind v4, Supabase RPC (`@supabase/ssr`), Vitest 4 (mocked Supabase), custom i18n (7 locales).

**Branch:** `feat/creators-console-10c` (stacked on `feat/creators-console` = 10B). PR base will be `feat/creators-console` until 10B merges, then retarget to `main`.

**Conventions to honor (from the Phase 10 spec §2 and the 10A/10B code):**
- Routes gate inline: `isLocale` guard → `notFound()`; `await requireOpsPage(supabase, loc)` **before** any data fetch.
- Platform-wide reads go through a SECURITY DEFINER RPC gated on `is_active_ops()` (owner-RLS would hide the row from ops). Errors **propagate** (never swallow to `[]`/`0`).
- New timestamped migration only; never edit a shipped one.
- New UI strings → **all 7** locale files + the `Messages` interface; parity enforced by `tests/i18n.locale-parity.test.ts`.
- `packages/db/types.ts` is hand-patched (no live `gen`); add the new function there.
- **Test command (single file, from `apps/web`):** `pnpm exec vitest run tests/<file> --reporter=dot`. Do **not** use `pnpm --filter web test -- <pattern>` (runs real-DB suites that hang on dummy creds).
- **vitest does NOT typecheck.** After each code task run `pnpm exec tsc --noEmit` from `apps/web` (esbuild strips types; this has caught real errors twice).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

**Create:**
- `supabase/migrations/20260629120000_admin_creator_detail.sql` — the aggregator RPC.
- `apps/web/components/kinnso/admin/creators/detail/ProfileDnaTab.tsx` — profile + DNA + latest scan + socials.
- `apps/web/components/kinnso/admin/creators/detail/MissionsTab.tsx` — mission participation table.
- `apps/web/components/kinnso/admin/creators/detail/EarningsTab.tsx` — contribution summary, points history, settlements.
- `apps/web/components/kinnso/admin/creators/detail/ContentTab.tsx` — guides table.
- `apps/web/components/kinnso/admin/creators/detail/ModerationTab.tsx` — audit timeline (presentational).
- `apps/web/components/kinnso/admin/creators/CreatorDetailView.tsx` — client: header + sub-tabs + action wiring + note form.
- `apps/web/app/[locale]/admin/creators/[creatorId]/page.tsx` — gate → `getCreatorDetail` → `notFound()` if null → view.
- Tests: `apps/web/tests/admin.creators-detail-queries.test.ts`, `apps/web/tests/kinnso.CreatorDetailTabs.test.tsx`, `apps/web/tests/kinnso.CreatorDetailView.test.tsx`, `apps/web/tests/admin.creators-detail.host.test.tsx`.

**Modify:**
- `apps/web/lib/admin/creators-queries.ts` — append `CreatorDetail` types + `getCreatorDetail()`.
- `packages/db/types.ts` — add `admin_creator_detail` to `Functions`.
- `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` — add 10C `creators` keys + extend the `Messages` interface (in `en.ts`).
- `apps/web/components/kinnso/admin/creators/CreatorsDirectoryView.tsx` — make the creator name a `Link` into the 360 page.
- `apps/web/tests/kinnso.CreatorsDirectoryView.test.tsx` — assert the row link target.

---

## Data shape (the RPC payload → `CreatorDetail`)

`admin_creator_detail(p_creator_id)` returns this jsonb (snake_case), or SQL `null` when the creator id does not exist:

```jsonc
{
  "creator": { "id","display_name","handle","status","verified","bio","created_at","updated_at" },
  "contribution": { "points","tier","tier_updated_at" } | null,
  "dna": { "id","status","model","draft_ready_at","updated_at" } | null,        // latest by updated_at
  "scan": { "id","status","error","started_at","completed_at","created_at" } | null, // latest by created_at
  "socials": [ { "platform","handle","url" } ],
  "missions": [ { "participant_id","mission_id","title","status","source","approved_at","created_at" } ],
  "settlements": [ { "id","mission_title","status","creator_payout_status","creator_commission_amount","amount_currency","created_at" } ],
  "points_events": [ { "id","event_type","points","created_at" } ],            // latest 50
  "content": [ { "id","title","slug","status","saves_count","published_at","created_at" } ]
}
```

`getCreatorDetail` maps it to camelCase `CreatorDetail` (see Task 3). Audit history is **not** in this payload — the Moderation tab reads it separately via `listAudit(supabase, 'creator', id)` (already built in 10A) so it refreshes on note-add.

---

## Task 1: Aggregator RPC `admin_creator_detail`

**Files:**
- Create: `supabase/migrations/20260629120000_admin_creator_detail.sql`

This RPC has no vitest unit (we test the wrapper with a mocked client in Task 3). It is verified by (a) applying it live, (b) a catalog query confirming it exists, and (c) `tsc` + the wrapper test exercising the mapping.

- [ ] **Step 1: Write the migration**

```sql
-- Phase 10C — Creator 360 detail aggregator. One SECURITY DEFINER, is_active_ops()-gated
-- RPC returning a single jsonb payload for the detail page (mirrors admin_creator_analytics).
-- Returns NULL when the creator id does not exist, so the page can render notFound().
-- Settlements are linked to a creator via mission_settlements.mission_participant_id ->
-- mission_participants.creator_id. Reads only; no writes, no PII (creators has no email).

create or replace function public.admin_creator_detail(p_creator_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_exists boolean;
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select true into v_exists from public.creators where id = p_creator_id;
  if v_exists is null then
    return null;  -- missing creator -> wrapper returns null -> page notFound()
  end if;

  return jsonb_build_object(
    'creator', (
      select jsonb_build_object(
        'id', c.id, 'display_name', c.display_name, 'handle', c.handle,
        'status', c.status, 'verified', c.verified, 'bio', c.bio,
        'created_at', c.created_at, 'updated_at', c.updated_at)
      from public.creators c where c.id = p_creator_id
    ),
    'contribution', (
      select jsonb_build_object(
        'points', cc.contribution_points, 'tier', cc.tier, 'tier_updated_at', cc.tier_updated_at)
      from public.creator_contribution cc where cc.creator_id = p_creator_id
    ),
    'dna', (
      select jsonb_build_object(
        'id', d.id, 'status', d.status, 'model', d.model,
        'draft_ready_at', d.draft_ready_at, 'updated_at', d.updated_at)
      from public.creator_dna d where d.creator_id = p_creator_id
      order by d.updated_at desc limit 1
    ),
    'scan', (
      select jsonb_build_object(
        'id', j.id, 'status', j.status, 'error', j.error,
        'started_at', j.started_at, 'completed_at', j.completed_at, 'created_at', j.created_at)
      from public.creator_scan_jobs j where j.creator_id = p_creator_id
      order by j.created_at desc limit 1
    ),
    'socials', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', s.platform, 'handle', s.handle, 'url', s.url) order by s.platform)
      from public.creator_social_handles s where s.creator_id = p_creator_id
    ), '[]'::jsonb),
    'missions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', mp.id, 'mission_id', mp.mission_id, 'title', m.title,
        'status', mp.status, 'source', mp.source,
        'approved_at', mp.approved_at, 'created_at', mp.created_at)
        order by mp.created_at desc)
      from public.mission_participants mp
      join public.missions m on m.id = mp.mission_id
      where mp.creator_id = p_creator_id
    ), '[]'::jsonb),
    'settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id, 'mission_title', m.title, 'status', st.status,
        'creator_payout_status', st.creator_payout_status,
        'creator_commission_amount', st.creator_commission_amount,
        'amount_currency', st.amount_currency, 'created_at', st.created_at)
        order by st.created_at desc)
      from public.mission_settlements st
      join public.mission_participants mp on mp.id = st.mission_participant_id
      join public.missions m on m.id = st.mission_id
      where mp.creator_id = p_creator_id
    ), '[]'::jsonb),
    'points_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'event_type', e.event_type, 'points', e.points, 'created_at', e.created_at)
        order by e.created_at desc)
      from (
        select id, event_type, points, created_at
        from public.creator_contribution_events
        where creator_id = p_creator_id
        order by created_at desc limit 50
      ) e
    ), '[]'::jsonb),
    'content', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'title', g.title, 'slug', g.slug, 'status', g.status,
        'saves_count', g.saves_count, 'published_at', g.published_at, 'created_at', g.created_at)
        order by g.created_at desc)
      from public.guides g where g.creator_id = p_creator_id
    ), '[]'::jsonb)
  );
end $$;

-- Grants: revoke implicit public+anon EXECUTE, grant authenticated only (is_active_ops() is the gate).
revoke all on function public.admin_creator_detail(uuid) from public, anon;
grant execute on function public.admin_creator_detail(uuid) to authenticated;
```

- [ ] **Step 2: Apply the migration live via MCP**

Apply with the Supabase MCP `apply_migration` (project `scryfkefedzuetfdtrvl`, name `admin_creator_detail`). The controller performs this — the implementer subagent should ask the controller to apply it (subagents have no MCP migration authority here).

- [ ] **Step 3: Verify the function exists (catalog query, not an ops call)**

Run via MCP `execute_sql` against `scryfkefedzuetfdtrvl`:
```sql
select proname, pronargs from pg_proc where proname = 'admin_creator_detail';
```
Expected: one row, `pronargs = 1`. (Do **not** call the function directly via MCP — `is_active_ops()` will raise `forbidden` since the MCP connection is not an ops session; that's the gate working.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260629120000_admin_creator_detail.sql
git commit -m "feat(db): add admin_creator_detail 360 aggregator RPC (Phase 10C)"
```

---

## Task 2: Hand-patch `packages/db/types.ts`

**Files:**
- Modify: `packages/db/types.ts` (the `Functions` block, after `admin_creator_analytics` near line 1619)

- [ ] **Step 1: Add the function type**

Insert immediately after the `admin_creator_analytics` entry:

```ts
      admin_creator_detail: {
        Args: { p_creator_id: string }
        Returns: Json
      }
```

- [ ] **Step 2: Typecheck**

Run from `apps/web`: `pnpm exec tsc --noEmit`
Expected: no errors (the new function is now known to `supabase.rpc`).

- [ ] **Step 3: Commit**

```bash
git add packages/db/types.ts
git commit -m "feat(db): type admin_creator_detail in generated types (Phase 10C)"
```

---

## Task 3: `getCreatorDetail` query wrapper + `CreatorDetail` types

**Files:**
- Modify: `apps/web/lib/admin/creators-queries.ts` (append)
- Test: `apps/web/tests/admin.creators-detail-queries.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { getCreatorDetail } from '@/lib/admin/creators-queries'

function clientReturning(data: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) } as never
}

const payload = {
  creator: {
    id: 'c1', display_name: 'Mia', handle: 'mia', status: 'active', verified: true,
    bio: 'Travel creator', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-20T00:00:00Z',
  },
  contribution: { points: 320, tier: 'pro', tier_updated_at: '2026-06-10T00:00:00Z' },
  dna: { id: 'd1', status: 'published', model: 'gpt', draft_ready_at: null, updated_at: '2026-06-05T00:00:00Z' },
  scan: { id: 'j1', status: 'completed', error: null, started_at: null, completed_at: '2026-06-04T00:00:00Z', created_at: '2026-06-04T00:00:00Z' },
  socials: [{ platform: 'instagram', handle: 'mia', url: 'https://ig/mia' }],
  missions: [{ participant_id: 'p1', mission_id: 'm1', title: 'Tokyo eats', status: 'active', source: 'applied', approved_at: null, created_at: '2026-06-02T00:00:00Z' }],
  settlements: [{ id: 's1', mission_title: 'Tokyo eats', status: 'pending', creator_payout_status: 'pending', creator_commission_amount: 120.5, amount_currency: 'HKD', created_at: '2026-06-03T00:00:00Z' }],
  points_events: [{ id: 'e1', event_type: 'guide_published', points: 50, created_at: '2026-06-06T00:00:00Z' }],
  content: [{ id: 'g1', title: 'Best ramen', slug: 'best-ramen', status: 'published', saves_count: 12, published_at: '2026-06-07T00:00:00Z', created_at: '2026-06-06T00:00:00Z' }],
}

describe('getCreatorDetail', () => {
  it('maps the RPC payload to a camelCase CreatorDetail', async () => {
    const supabase = clientReturning(payload)
    const detail = await getCreatorDetail(supabase, 'c1')
    expect(detail).not.toBeNull()
    expect(detail!.creator).toMatchObject({ id: 'c1', displayName: 'Mia', handle: 'mia', status: 'active', verified: true })
    expect(detail!.contribution).toMatchObject({ points: 320, tier: 'pro' })
    expect(detail!.dna).toMatchObject({ status: 'published' })
    expect(detail!.scan).toMatchObject({ status: 'completed' })
    expect(detail!.socials[0]).toMatchObject({ platform: 'instagram', handle: 'mia' })
    expect(detail!.missions[0]).toMatchObject({ participantId: 'p1', title: 'Tokyo eats', status: 'active' })
    expect(detail!.settlements[0]).toMatchObject({ missionTitle: 'Tokyo eats', creatorCommissionAmount: 120.5, currency: 'HKD' })
    expect(detail!.pointsEvents[0]).toMatchObject({ eventType: 'guide_published', points: 50 })
    expect(detail!.content[0]).toMatchObject({ title: 'Best ramen', savesCount: 12 })
  })

  it('returns null when the creator is missing (RPC returns null)', async () => {
    const supabase = clientReturning(null)
    expect(await getCreatorDetail(supabase, 'nope')).toBeNull()
  })

  it('propagates errors (no silent null)', async () => {
    const supabase = clientReturning(null, new Error('boom'))
    await expect(getCreatorDetail(supabase, 'c1')).rejects.toThrow('boom')
  })

  it('tolerates null optional sections', async () => {
    const supabase = clientReturning({ ...payload, contribution: null, dna: null, scan: null })
    const detail = await getCreatorDetail(supabase, 'c1')
    expect(detail!.contribution).toBeNull()
    expect(detail!.dna).toBeNull()
    expect(detail!.scan).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web`: `pnpm exec vitest run tests/admin.creators-detail-queries.test.ts --reporter=dot`
Expected: FAIL with "getCreatorDetail is not a function" / import error.

- [ ] **Step 3: Append the implementation to `creators-queries.ts`**

Append at the end of `apps/web/lib/admin/creators-queries.ts`:

```ts
export interface CreatorDetailProfile {
  id: string
  displayName: string | null
  handle: string | null
  status: string
  verified: boolean
  bio: string | null
  createdAt: string
  updatedAt: string
}
export interface CreatorDetailContribution { points: number; tier: string; tierUpdatedAt: string | null }
export interface CreatorDetailDna { id: string; status: string; model: string | null; draftReadyAt: string | null; updatedAt: string }
export interface CreatorDetailScan { id: string; status: string; error: string | null; startedAt: string | null; completedAt: string | null; createdAt: string }
export interface CreatorDetailSocial { platform: string; handle: string; url: string | null }
export interface CreatorDetailMission { participantId: string; missionId: string; title: string; status: string; source: string; approvedAt: string | null; createdAt: string }
export interface CreatorDetailSettlement { id: string; missionTitle: string; status: string; creatorPayoutStatus: string | null; creatorCommissionAmount: number | null; currency: string | null; createdAt: string }
export interface CreatorDetailPointsEvent { id: string; eventType: string; points: number; createdAt: string }
export interface CreatorDetailContent { id: string; title: string; slug: string; status: string; savesCount: number; publishedAt: string | null; createdAt: string }

export interface CreatorDetail {
  creator: CreatorDetailProfile
  contribution: CreatorDetailContribution | null
  dna: CreatorDetailDna | null
  scan: CreatorDetailScan | null
  socials: CreatorDetailSocial[]
  missions: CreatorDetailMission[]
  settlements: CreatorDetailSettlement[]
  pointsEvents: CreatorDetailPointsEvent[]
  content: CreatorDetailContent[]
}

type DetailPayload = {
  creator: { id: string; display_name: string | null; handle: string | null; status: string; verified: boolean; bio: string | null; created_at: string; updated_at: string }
  contribution: { points: number; tier: string; tier_updated_at: string | null } | null
  dna: { id: string; status: string; model: string | null; draft_ready_at: string | null; updated_at: string } | null
  scan: { id: string; status: string; error: string | null; started_at: string | null; completed_at: string | null; created_at: string } | null
  socials: { platform: string; handle: string; url: string | null }[]
  missions: { participant_id: string; mission_id: string; title: string; status: string; source: string; approved_at: string | null; created_at: string }[]
  settlements: { id: string; mission_title: string; status: string; creator_payout_status: string | null; creator_commission_amount: number | null; amount_currency: string | null; created_at: string }[]
  points_events: { id: string; event_type: string; points: number; created_at: string }[]
  content: { id: string; title: string; slug: string; status: string; saves_count: number; published_at: string | null; created_at: string }[]
}

/**
 * Full ops-aggregate 360 for one creator. Single SECURITY DEFINER RPC
 * (`admin_creator_detail`, is_active_ops()-gated) so ops sees all sections despite
 * owner-scoped RLS. Returns null when the creator id does not exist (page -> notFound()).
 * Audit history is fetched separately by the page via listAudit(). Errors propagate.
 */
export async function getCreatorDetail(supabase: Client, creatorId: string): Promise<CreatorDetail | null> {
  const { data, error } = await supabase.rpc('admin_creator_detail', { p_creator_id: creatorId })
  if (error) throw error
  if (!data) return null
  const p = data as unknown as DetailPayload
  return {
    creator: {
      id: p.creator.id, displayName: p.creator.display_name, handle: p.creator.handle,
      status: p.creator.status, verified: p.creator.verified, bio: p.creator.bio,
      createdAt: p.creator.created_at, updatedAt: p.creator.updated_at,
    },
    contribution: p.contribution
      ? { points: Number(p.contribution.points), tier: p.contribution.tier, tierUpdatedAt: p.contribution.tier_updated_at }
      : null,
    dna: p.dna
      ? { id: p.dna.id, status: p.dna.status, model: p.dna.model, draftReadyAt: p.dna.draft_ready_at, updatedAt: p.dna.updated_at }
      : null,
    scan: p.scan
      ? { id: p.scan.id, status: p.scan.status, error: p.scan.error, startedAt: p.scan.started_at, completedAt: p.scan.completed_at, createdAt: p.scan.created_at }
      : null,
    socials: (p.socials ?? []).map((s) => ({ platform: s.platform, handle: s.handle, url: s.url })),
    missions: (p.missions ?? []).map((m) => ({
      participantId: m.participant_id, missionId: m.mission_id, title: m.title,
      status: m.status, source: m.source, approvedAt: m.approved_at, createdAt: m.created_at,
    })),
    settlements: (p.settlements ?? []).map((s) => ({
      id: s.id, missionTitle: s.mission_title, status: s.status,
      creatorPayoutStatus: s.creator_payout_status,
      creatorCommissionAmount: s.creator_commission_amount === null ? null : Number(s.creator_commission_amount),
      currency: s.amount_currency, createdAt: s.created_at,
    })),
    pointsEvents: (p.points_events ?? []).map((e) => ({ id: e.id, eventType: e.event_type, points: Number(e.points), createdAt: e.created_at })),
    content: (p.content ?? []).map((g) => ({
      id: g.id, title: g.title, slug: g.slug, status: g.status,
      savesCount: Number(g.saves_count), publishedAt: g.published_at, createdAt: g.created_at,
    })),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/web`: `pnpm exec vitest run tests/admin.creators-detail-queries.test.ts --reporter=dot`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run from `apps/web`: `pnpm exec tsc --noEmit` — expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/admin/creators-queries.ts apps/web/tests/admin.creators-detail-queries.test.ts
git commit -m "feat(web): add getCreatorDetail 360 aggregator query (Phase 10C)"
```

---

## Task 4: i18n — 10C `creators` keys across all 7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface block near line 647 **and** values block near line 1513)
- Modify: `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` (values)
- Test: `apps/web/tests/i18n.locale-parity.test.ts` (existing; must stay green)

The `creators` group already exists in `GROUPS`. We only add keys. **Every key must be added to all 7 files or the parity test fails.**

- [ ] **Step 1: Extend the `Messages` interface in `en.ts`**

In `apps/web/lib/i18n/messages/en.ts`, inside the `creators: { … }` interface block, replace the line:

```ts
    tabOverview: string; tabDirectory: string
```
with:
```ts
    tabOverview: string; tabDirectory: string
    detailBack: string; detailJoined: string; detailUpdated: string; detailBio: string; detailNoBio: string
    tabProfile: string; tabMissions: string; tabEarnings: string; tabContent: string; tabModeration: string
    secDna: string; secScan: string; secSocials: string; secContribution: string
    dnaNoData: string; scanNoData: string; socialsNoData: string
    scanStatus: string; scanError: string; scanCompleted: string
    colMission: string; colStatus: string; colSource: string; missionsNoData: string
    colAmount: string; colPayout: string; colSettlement: string; settlementsNoData: string
    pointsHistory: string; colEvent: string; colPoints: string; pointsNoData: string; totalPoints: string
    colTitle: string; colSaves: string; colStatusContent: string; contentNoData: string
    secAudit: string; auditNoData: string; addNote: string; saveNote: string
```

- [ ] **Step 2: Add the English values in `en.ts`**

In the `creators: { … }` values block, replace the line:
```ts
    tabOverview: 'Overview', tabDirectory: 'Directory',
```
with:
```ts
    tabOverview: 'Overview', tabDirectory: 'Directory',
    detailBack: 'Back to directory', detailJoined: 'Joined', detailUpdated: 'Updated', detailBio: 'Bio', detailNoBio: 'No bio',
    tabProfile: 'Profile & DNA', tabMissions: 'Missions', tabEarnings: 'Earnings', tabContent: 'Content', tabModeration: 'Moderation',
    secDna: 'Creator DNA', secScan: 'Latest scan', secSocials: 'Social handles', secContribution: 'Contribution',
    dnaNoData: 'No DNA yet', scanNoData: 'No scans yet', socialsNoData: 'No social handles',
    scanStatus: 'Status', scanError: 'Error', scanCompleted: 'Completed',
    colMission: 'Mission', colStatus: 'Status', colSource: 'Source', missionsNoData: 'No missions yet',
    colAmount: 'Amount', colPayout: 'Payout', colSettlement: 'Settlement', settlementsNoData: 'No settlements yet',
    pointsHistory: 'Points history', colEvent: 'Event', colPoints: 'Points', pointsNoData: 'No points activity yet', totalPoints: 'Total points',
    colTitle: 'Title', colSaves: 'Saves', colStatusContent: 'Status', contentNoData: 'No content yet',
    secAudit: 'Moderation history', auditNoData: 'No moderation activity yet', addNote: 'Add a note', saveNote: 'Save note',
```

- [ ] **Step 3: Add the same keys (translated) to the other 6 locales**

In each of `zh-hk.ts`, `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`, `th.ts`, locate the `creators: { … }` values block's `tabOverview: …, tabDirectory: …,` line and append the same keys immediately after it, with these translations:

**`zh-hk.ts` (Traditional, HK):**
```ts
    detailBack: '返回目錄', detailJoined: '加入於', detailUpdated: '更新於', detailBio: '簡介', detailNoBio: '沒有簡介',
    tabProfile: '檔案與 DNA', tabMissions: '任務', tabEarnings: '收益', tabContent: '內容', tabModeration: '審核',
    secDna: '創作者 DNA', secScan: '最近掃描', secSocials: '社交帳號', secContribution: '貢獻',
    dnaNoData: '尚無 DNA', scanNoData: '尚無掃描', socialsNoData: '尚無社交帳號',
    scanStatus: '狀態', scanError: '錯誤', scanCompleted: '完成於',
    colMission: '任務', colStatus: '狀態', colSource: '來源', missionsNoData: '尚無任務',
    colAmount: '金額', colPayout: '派付', colSettlement: '結算', settlementsNoData: '尚無結算',
    pointsHistory: '積分紀錄', colEvent: '事件', colPoints: '積分', pointsNoData: '尚無積分活動', totalPoints: '總積分',
    colTitle: '標題', colSaves: '收藏', colStatusContent: '狀態', contentNoData: '尚無內容',
    secAudit: '審核紀錄', auditNoData: '尚無審核活動', addNote: '新增備註', saveNote: '儲存備註',
```

**`zh-tw.ts` (Traditional, TW):**
```ts
    detailBack: '返回目錄', detailJoined: '加入於', detailUpdated: '更新於', detailBio: '簡介', detailNoBio: '沒有簡介',
    tabProfile: '檔案與 DNA', tabMissions: '任務', tabEarnings: '收益', tabContent: '內容', tabModeration: '審核',
    secDna: '創作者 DNA', secScan: '最近掃描', secSocials: '社群帳號', secContribution: '貢獻',
    dnaNoData: '尚無 DNA', scanNoData: '尚無掃描', socialsNoData: '尚無社群帳號',
    scanStatus: '狀態', scanError: '錯誤', scanCompleted: '完成於',
    colMission: '任務', colStatus: '狀態', colSource: '來源', missionsNoData: '尚無任務',
    colAmount: '金額', colPayout: '撥款', colSettlement: '結算', settlementsNoData: '尚無結算',
    pointsHistory: '積分紀錄', colEvent: '事件', colPoints: '積分', pointsNoData: '尚無積分活動', totalPoints: '總積分',
    colTitle: '標題', colSaves: '收藏', colStatusContent: '狀態', contentNoData: '尚無內容',
    secAudit: '審核紀錄', auditNoData: '尚無審核活動', addNote: '新增備註', saveNote: '儲存備註',
```

**`zh-cn.ts` (Simplified):**
```ts
    detailBack: '返回目录', detailJoined: '加入于', detailUpdated: '更新于', detailBio: '简介', detailNoBio: '暂无简介',
    tabProfile: '资料与 DNA', tabMissions: '任务', tabEarnings: '收益', tabContent: '内容', tabModeration: '审核',
    secDna: '创作者 DNA', secScan: '最近扫描', secSocials: '社交账号', secContribution: '贡献',
    dnaNoData: '暂无 DNA', scanNoData: '暂无扫描', socialsNoData: '暂无社交账号',
    scanStatus: '状态', scanError: '错误', scanCompleted: '完成于',
    colMission: '任务', colStatus: '状态', colSource: '来源', missionsNoData: '暂无任务',
    colAmount: '金额', colPayout: '支付', colSettlement: '结算', settlementsNoData: '暂无结算',
    pointsHistory: '积分记录', colEvent: '事件', colPoints: '积分', pointsNoData: '暂无积分活动', totalPoints: '总积分',
    colTitle: '标题', colSaves: '收藏', colStatusContent: '状态', contentNoData: '暂无内容',
    secAudit: '审核记录', auditNoData: '暂无审核活动', addNote: '添加备注', saveNote: '保存备注',
```

**`ja.ts` (Japanese):**
```ts
    detailBack: 'ディレクトリへ戻る', detailJoined: '参加日', detailUpdated: '更新日', detailBio: '自己紹介', detailNoBio: '自己紹介なし',
    tabProfile: 'プロフィールと DNA', tabMissions: 'ミッション', tabEarnings: '収益', tabContent: 'コンテンツ', tabModeration: 'モデレーション',
    secDna: 'クリエイター DNA', secScan: '最新スキャン', secSocials: 'ソーシャルアカウント', secContribution: '貢献',
    dnaNoData: 'DNA はまだありません', scanNoData: 'スキャンはまだありません', socialsNoData: 'ソーシャルアカウントなし',
    scanStatus: 'ステータス', scanError: 'エラー', scanCompleted: '完了日',
    colMission: 'ミッション', colStatus: 'ステータス', colSource: 'ソース', missionsNoData: 'ミッションはまだありません',
    colAmount: '金額', colPayout: '支払い', colSettlement: '精算', settlementsNoData: '精算はまだありません',
    pointsHistory: 'ポイント履歴', colEvent: 'イベント', colPoints: 'ポイント', pointsNoData: 'ポイント活動はまだありません', totalPoints: '合計ポイント',
    colTitle: 'タイトル', colSaves: '保存数', colStatusContent: 'ステータス', contentNoData: 'コンテンツはまだありません',
    secAudit: 'モデレーション履歴', auditNoData: 'モデレーション活動はまだありません', addNote: 'メモを追加', saveNote: 'メモを保存',
```

**`ko.ts` (Korean):**
```ts
    detailBack: '디렉터리로 돌아가기', detailJoined: '가입일', detailUpdated: '업데이트', detailBio: '소개', detailNoBio: '소개 없음',
    tabProfile: '프로필 및 DNA', tabMissions: '미션', tabEarnings: '수익', tabContent: '콘텐츠', tabModeration: '모더레이션',
    secDna: '크리에이터 DNA', secScan: '최근 스캔', secSocials: '소셜 계정', secContribution: '기여',
    dnaNoData: '아직 DNA가 없습니다', scanNoData: '아직 스캔이 없습니다', socialsNoData: '소셜 계정이 없습니다',
    scanStatus: '상태', scanError: '오류', scanCompleted: '완료일',
    colMission: '미션', colStatus: '상태', colSource: '출처', missionsNoData: '아직 미션이 없습니다',
    colAmount: '금액', colPayout: '지급', colSettlement: '정산', settlementsNoData: '아직 정산이 없습니다',
    pointsHistory: '포인트 기록', colEvent: '이벤트', colPoints: '포인트', pointsNoData: '아직 포인트 활동이 없습니다', totalPoints: '총 포인트',
    colTitle: '제목', colSaves: '저장 수', colStatusContent: '상태', contentNoData: '아직 콘텐츠가 없습니다',
    secAudit: '모더레이션 기록', auditNoData: '아직 모더레이션 활동이 없습니다', addNote: '메모 추가', saveNote: '메모 저장',
```

**`th.ts` (Thai):**
```ts
    detailBack: 'กลับไปยังไดเรกทอรี', detailJoined: 'เข้าร่วมเมื่อ', detailUpdated: 'อัปเดตเมื่อ', detailBio: 'ประวัติ', detailNoBio: 'ไม่มีประวัติ',
    tabProfile: 'โปรไฟล์และ DNA', tabMissions: 'ภารกิจ', tabEarnings: 'รายได้', tabContent: 'เนื้อหา', tabModeration: 'การกำกับดูแล',
    secDna: 'DNA ครีเอเตอร์', secScan: 'การสแกนล่าสุด', secSocials: 'บัญชีโซเชียล', secContribution: 'การมีส่วนร่วม',
    dnaNoData: 'ยังไม่มี DNA', scanNoData: 'ยังไม่มีการสแกน', socialsNoData: 'ไม่มีบัญชีโซเชียล',
    scanStatus: 'สถานะ', scanError: 'ข้อผิดพลาด', scanCompleted: 'เสร็จเมื่อ',
    colMission: 'ภารกิจ', colStatus: 'สถานะ', colSource: 'แหล่งที่มา', missionsNoData: 'ยังไม่มีภารกิจ',
    colAmount: 'จำนวนเงิน', colPayout: 'การจ่าย', colSettlement: 'การชำระบัญชี', settlementsNoData: 'ยังไม่มีการชำระบัญชี',
    pointsHistory: 'ประวัติคะแนน', colEvent: 'เหตุการณ์', colPoints: 'คะแนน', pointsNoData: 'ยังไม่มีกิจกรรมคะแนน', totalPoints: 'คะแนนรวม',
    colTitle: 'ชื่อเรื่อง', colSaves: 'การบันทึก', colStatusContent: 'สถานะ', contentNoData: 'ยังไม่มีเนื้อหา',
    secAudit: 'ประวัติการกำกับดูแล', auditNoData: 'ยังไม่มีกิจกรรมการกำกับดูแล', addNote: 'เพิ่มบันทึก', saveNote: 'บันทึกหมายเหตุ',
```

- [ ] **Step 4: Run the parity test**

Run from `apps/web`: `pnpm exec vitest run tests/i18n.locale-parity.test.ts --reporter=dot`
Expected: PASS (no missing/extra keys across locales).

- [ ] **Step 5: Typecheck**

Run from `apps/web`: `pnpm exec tsc --noEmit` — expected: no errors (every locale satisfies the extended `Messages` interface).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/i18n/messages
git commit -m "i18n(web): add creators 360 detail strings (Phase 10C)"
```

---

## Task 5: Presentational tab components

**Files:**
- Create: `apps/web/components/kinnso/admin/creators/detail/ProfileDnaTab.tsx`
- Create: `apps/web/components/kinnso/admin/creators/detail/MissionsTab.tsx`
- Create: `apps/web/components/kinnso/admin/creators/detail/EarningsTab.tsx`
- Create: `apps/web/components/kinnso/admin/creators/detail/ContentTab.tsx`
- Create: `apps/web/components/kinnso/admin/creators/detail/ModerationTab.tsx`
- Test: `apps/web/tests/kinnso.CreatorDetailTabs.test.tsx`

These are pure functions (no hooks) so they need no `'use client'`; they are imported by the client `CreatorDetailView`. Each takes `t: Messages['creators']` plus its slice of `CreatorDetail` (and `ModerationTab` takes `AuditEntry[]`). Use a shared local date helper `d.slice(0,10)` for dates (matches the Overview view).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { ProfileDnaTab } from '@/components/kinnso/admin/creators/detail/ProfileDnaTab'
import { MissionsTab } from '@/components/kinnso/admin/creators/detail/MissionsTab'
import { EarningsTab } from '@/components/kinnso/admin/creators/detail/EarningsTab'
import { ContentTab } from '@/components/kinnso/admin/creators/detail/ContentTab'
import { ModerationTab } from '@/components/kinnso/admin/creators/detail/ModerationTab'
import type { CreatorDetail } from '@/lib/admin/creators-queries'
import type { AuditEntry } from '@/lib/admin/audit'

afterEach(cleanup)
const t = en.creators

const detail: CreatorDetail = {
  creator: { id: 'c1', displayName: 'Mia', handle: 'mia', status: 'active', verified: true, bio: 'Hi', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-20T00:00:00Z' },
  contribution: { points: 320, tier: 'pro', tierUpdatedAt: null },
  dna: { id: 'd1', status: 'published', model: 'gpt', draftReadyAt: null, updatedAt: '2026-06-05T00:00:00Z' },
  scan: { id: 'j1', status: 'completed', error: null, startedAt: null, completedAt: '2026-06-04T00:00:00Z', createdAt: '2026-06-04T00:00:00Z' },
  socials: [{ platform: 'instagram', handle: 'mia', url: 'https://ig/mia' }],
  missions: [{ participantId: 'p1', missionId: 'm1', title: 'Tokyo eats', status: 'active', source: 'applied', approvedAt: null, createdAt: '2026-06-02T00:00:00Z' }],
  settlements: [{ id: 's1', missionTitle: 'Tokyo eats', status: 'pending', creatorPayoutStatus: 'pending', creatorCommissionAmount: 120.5, currency: 'HKD', createdAt: '2026-06-03T00:00:00Z' }],
  pointsEvents: [{ id: 'e1', eventType: 'guide_published', points: 50, createdAt: '2026-06-06T00:00:00Z' }],
  content: [{ id: 'g1', title: 'Best ramen', slug: 'best-ramen', status: 'published', savesCount: 12, publishedAt: '2026-06-07T00:00:00Z', createdAt: '2026-06-06T00:00:00Z' }],
}
const empty: CreatorDetail = { ...detail, contribution: null, dna: null, scan: null, socials: [], missions: [], settlements: [], pointsEvents: [], content: [] }

describe('Creator detail tabs', () => {
  it('ProfileDnaTab shows DNA, scan, socials', () => {
    render(<ProfileDnaTab t={t} detail={detail} />)
    expect(screen.getByText(t.secDna)).toBeTruthy()
    expect(screen.getByText('instagram')).toBeTruthy()
  })
  it('ProfileDnaTab shows empty states', () => {
    render(<ProfileDnaTab t={t} detail={empty} />)
    expect(screen.getByText(t.dnaNoData)).toBeTruthy()
    expect(screen.getByText(t.socialsNoData)).toBeTruthy()
  })
  it('MissionsTab lists missions', () => {
    render(<MissionsTab t={t} missions={detail.missions} />)
    expect(screen.getByText('Tokyo eats')).toBeTruthy()
  })
  it('MissionsTab shows empty state', () => {
    render(<MissionsTab t={t} missions={[]} />)
    expect(screen.getByText(t.missionsNoData)).toBeTruthy()
  })
  it('EarningsTab shows total points and a settlement amount', () => {
    render(<EarningsTab t={t} contribution={detail.contribution} settlements={detail.settlements} pointsEvents={detail.pointsEvents} />)
    expect(screen.getByText(t.totalPoints)).toBeTruthy()
    expect(screen.getByText(/120\.5/)).toBeTruthy()
    expect(screen.getByText('HKD')).toBeTruthy()
  })
  it('ContentTab lists guides', () => {
    render(<ContentTab t={t} content={detail.content} />)
    expect(screen.getByText('Best ramen')).toBeTruthy()
  })
  it('ModerationTab lists audit entries and shows empty state', () => {
    const entries: AuditEntry[] = [{ id: 'a1', entityType: 'creator', entityId: 'c1', action: 'status.suspend', reason: 'spam', metadata: {}, createdAt: '2026-06-10T00:00:00Z' }]
    const { rerender } = render(<ModerationTab t={t} entries={entries} />)
    expect(screen.getByText('status.suspend')).toBeTruthy()
    expect(screen.getByText('spam')).toBeTruthy()
    rerender(<ModerationTab t={t} entries={[]} />)
    expect(screen.getByText(t.auditNoData)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web`: `pnpm exec vitest run tests/kinnso.CreatorDetailTabs.test.tsx --reporter=dot`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `ProfileDnaTab.tsx`**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorDetail } from '@/lib/admin/creators-queries'

type T = Messages['creators']
const day = (s: string | null) => (s ? s.slice(0, 10) : '—')

export function ProfileDnaTab({ t, detail }: { t: T; detail: CreatorDetail }) {
  const { dna, scan, socials, creator } = detail
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-xl border border-kinnso-line p-4">
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.detailBio}</p>
        <p className="text-sm text-kinnso-muted">{creator.bio ?? t.detailNoBio}</p>
      </section>
      <section className="rounded-xl border border-kinnso-line p-4">
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.secDna}</p>
        {dna ? (
          <dl className="text-sm text-kinnso-muted">
            <div className="flex justify-between"><dt>{t.scanStatus}</dt><dd className="text-kinnso-ink">{dna.status}</dd></div>
            <div className="flex justify-between"><dt>{t.detailUpdated}</dt><dd>{day(dna.updatedAt)}</dd></div>
          </dl>
        ) : <p className="text-sm text-kinnso-muted">{t.dnaNoData}</p>}
      </section>
      <section className="rounded-xl border border-kinnso-line p-4">
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.secScan}</p>
        {scan ? (
          <dl className="text-sm text-kinnso-muted">
            <div className="flex justify-between"><dt>{t.scanStatus}</dt><dd className="text-kinnso-ink">{scan.status}</dd></div>
            <div className="flex justify-between"><dt>{t.scanCompleted}</dt><dd>{day(scan.completedAt)}</dd></div>
            {scan.error ? <div className="mt-1 text-red-700">{t.scanError}: {scan.error}</div> : null}
          </dl>
        ) : <p className="text-sm text-kinnso-muted">{t.scanNoData}</p>}
      </section>
      <section className="rounded-xl border border-kinnso-line p-4">
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.secSocials}</p>
        {socials.length === 0 ? (
          <p className="text-sm text-kinnso-muted">{t.socialsNoData}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {socials.map((s) => (
              <li key={`${s.platform}:${s.handle}`} className="flex justify-between gap-2">
                <span className="font-bold text-kinnso-ink">{s.platform}</span>
                <span className="min-w-0 flex-1 truncate text-right text-kinnso-muted">{s.handle}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default ProfileDnaTab
```

- [ ] **Step 4: Implement `MissionsTab.tsx`**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorDetailMission } from '@/lib/admin/creators-queries'

type T = Messages['creators']
const day = (s: string | null) => (s ? s.slice(0, 10) : '—')

export function MissionsTab({ t, missions }: { t: T; missions: CreatorDetailMission[] }) {
  if (missions.length === 0) return <p className="py-6 text-sm text-kinnso-muted">{t.missionsNoData}</p>
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-kinnso-muted">
        <tr className="border-b border-kinnso-line">
          <th className="py-2 font-bold">{t.colMission}</th>
          <th className="py-2 font-bold">{t.colStatus}</th>
          <th className="py-2 font-bold">{t.colSource}</th>
          <th className="py-2 font-bold">{t.colJoined}</th>
        </tr>
      </thead>
      <tbody>
        {missions.map((m) => (
          <tr key={m.participantId} className="border-b border-kinnso-line/60">
            <td className="py-2 font-bold text-kinnso-ink">{m.title}</td>
            <td className="py-2 text-kinnso-muted">{m.status}</td>
            <td className="py-2 text-kinnso-muted">{m.source}</td>
            <td className="py-2 text-kinnso-muted">{day(m.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default MissionsTab
```

- [ ] **Step 5: Implement `EarningsTab.tsx`**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorDetailContribution, CreatorDetailSettlement, CreatorDetailPointsEvent } from '@/lib/admin/creators-queries'

type T = Messages['creators']
const day = (s: string | null) => (s ? s.slice(0, 10) : '—')
const money = (n: number | null) => (n === null ? '—' : n.toFixed(2))

export function EarningsTab({
  t, contribution, settlements, pointsEvents,
}: {
  t: T
  contribution: CreatorDetailContribution | null
  settlements: CreatorDetailSettlement[]
  pointsEvents: CreatorDetailPointsEvent[]
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-kinnso-line p-4">
        <p className="text-sm font-bold text-kinnso-ink">{t.totalPoints}</p>
        <p className="mt-1 text-2xl font-black text-kinnso-ink">{contribution?.points ?? 0}</p>
      </section>

      <section>
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.colSettlement}</p>
        {settlements.length === 0 ? (
          <p className="py-4 text-sm text-kinnso-muted">{t.settlementsNoData}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-kinnso-muted">
              <tr className="border-b border-kinnso-line">
                <th className="py-2 font-bold">{t.colMission}</th>
                <th className="py-2 font-bold">{t.colAmount}</th>
                <th className="py-2 font-bold">{t.colPayout}</th>
                <th className="py-2 font-bold">{t.colStatus}</th>
                <th className="py-2 font-bold">{t.colJoined}</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => (
                <tr key={s.id} className="border-b border-kinnso-line/60">
                  <td className="py-2 font-bold text-kinnso-ink">{s.missionTitle}</td>
                  <td className="py-2 text-kinnso-muted">{money(s.creatorCommissionAmount)} <span className="text-kinnso-ink">{s.currency ?? ''}</span></td>
                  <td className="py-2 text-kinnso-muted">{s.creatorPayoutStatus ?? '—'}</td>
                  <td className="py-2 text-kinnso-muted">{s.status}</td>
                  <td className="py-2 text-kinnso-muted">{day(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.pointsHistory}</p>
        {pointsEvents.length === 0 ? (
          <p className="py-4 text-sm text-kinnso-muted">{t.pointsNoData}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-kinnso-muted">
              <tr className="border-b border-kinnso-line">
                <th className="py-2 font-bold">{t.colEvent}</th>
                <th className="py-2 font-bold">{t.colPoints}</th>
                <th className="py-2 font-bold">{t.colJoined}</th>
              </tr>
            </thead>
            <tbody>
              {pointsEvents.map((e) => (
                <tr key={e.id} className="border-b border-kinnso-line/60">
                  <td className="py-2 font-bold text-kinnso-ink">{e.eventType}</td>
                  <td className="py-2 text-kinnso-muted">{e.points}</td>
                  <td className="py-2 text-kinnso-muted">{day(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default EarningsTab
```

- [ ] **Step 6: Implement `ContentTab.tsx`**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorDetailContent } from '@/lib/admin/creators-queries'

type T = Messages['creators']
const day = (s: string | null) => (s ? s.slice(0, 10) : '—')

export function ContentTab({ t, content }: { t: T; content: CreatorDetailContent[] }) {
  if (content.length === 0) return <p className="py-6 text-sm text-kinnso-muted">{t.contentNoData}</p>
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-kinnso-muted">
        <tr className="border-b border-kinnso-line">
          <th className="py-2 font-bold">{t.colTitle}</th>
          <th className="py-2 font-bold">{t.colStatusContent}</th>
          <th className="py-2 font-bold">{t.colSaves}</th>
          <th className="py-2 font-bold">{t.colJoined}</th>
        </tr>
      </thead>
      <tbody>
        {content.map((g) => (
          <tr key={g.id} className="border-b border-kinnso-line/60">
            <td className="py-2 font-bold text-kinnso-ink">{g.title}</td>
            <td className="py-2 text-kinnso-muted">{g.status}</td>
            <td className="py-2 text-kinnso-muted">{g.savesCount}</td>
            <td className="py-2 text-kinnso-muted">{day(g.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default ContentTab
```

- [ ] **Step 7: Implement `ModerationTab.tsx`**

```tsx
import type { Messages } from '@/lib/i18n/messages/en'
import type { AuditEntry } from '@/lib/admin/audit'

type T = Messages['creators']
const day = (s: string) => s.slice(0, 10)

export function ModerationTab({ t, entries }: { t: T; entries: AuditEntry[] }) {
  if (entries.length === 0) return <p className="py-6 text-sm text-kinnso-muted">{t.auditNoData}</p>
  return (
    <ul className="flex flex-col gap-3">
      {entries.map((e) => (
        <li key={e.id} className="rounded-xl border border-kinnso-line p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-kinnso-ink">{e.action}</span>
            <span className="shrink-0 text-kinnso-muted">{day(e.createdAt)}</span>
          </div>
          {e.reason ? <p className="mt-1 text-kinnso-muted">{e.reason}</p> : null}
        </li>
      ))}
    </ul>
  )
}

export default ModerationTab
```

- [ ] **Step 8: Run the test to verify it passes**

Run from `apps/web`: `pnpm exec vitest run tests/kinnso.CreatorDetailTabs.test.tsx --reporter=dot`
Expected: PASS (7 tests).

- [ ] **Step 9: Typecheck + commit**

Run from `apps/web`: `pnpm exec tsc --noEmit` — expected: no errors.
```bash
git add apps/web/components/kinnso/admin/creators/detail apps/web/tests/kinnso.CreatorDetailTabs.test.tsx
git commit -m "feat(web): add creator 360 detail tab components (Phase 10C)"
```

---

## Task 6: `CreatorDetailView` (client) — header, sub-tabs, action wiring, note form

**Files:**
- Create: `apps/web/components/kinnso/admin/creators/CreatorDetailView.tsx`
- Test: `apps/web/tests/kinnso.CreatorDetailView.test.tsx`

The view owns: active-tab state; a shared reason input + pending/error state for header lifecycle/verify actions; and a note input for the Moderation tab. It reuses the existing badge components and the 10B action signatures (passed as props for testability, exactly like `CreatorsDirectoryView`). Header actions shown depend on `creator.status` (mirrors directory logic):
- `onboarding`/`suspended` → **Activate**; `active` → **Suspend** + **Ban**; `suspended` → **Ban** (in addition to Activate); `banned` → **Reinstate**.
- Verify toggles between **Verify**/**Unverify**.

The `actions` prop type matches the subset used here. On a successful action, call `router.refresh()`; on failure, render the friendly error from `ActionResult.errors`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { CreatorDetailView } from '@/components/kinnso/admin/creators/CreatorDetailView'
import type { CreatorDetail } from '@/lib/admin/creators-queries'
import type { AuditEntry } from '@/lib/admin/audit'

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }))
afterEach(cleanup)
beforeEach(() => refreshMock.mockReset())

const detail: CreatorDetail = {
  creator: { id: 'c1', displayName: 'Mia', handle: 'mia', status: 'active', verified: false, bio: 'Hi', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-20T00:00:00Z' },
  contribution: { points: 320, tier: 'pro', tierUpdatedAt: null },
  dna: null, scan: null, socials: [],
  missions: [{ participantId: 'p1', missionId: 'm1', title: 'Tokyo eats', status: 'active', source: 'applied', approvedAt: null, createdAt: '2026-06-02T00:00:00Z' }],
  settlements: [], pointsEvents: [],
  content: [{ id: 'g1', title: 'Best ramen', slug: 'best-ramen', status: 'published', savesCount: 12, publishedAt: null, createdAt: '2026-06-06T00:00:00Z' }],
}
const audit: AuditEntry[] = [{ id: 'a1', entityType: 'creator', entityId: 'c1', action: 'status.suspend', reason: 'spam', metadata: {}, createdAt: '2026-06-10T00:00:00Z' }]

function makeActions() {
  return {
    setCreatorStatus: vi.fn(async () => ({ ok: true as const, id: 'c1', status: 'suspended' as const })),
    reinstateCreator: vi.fn(async () => ({ ok: true as const, id: 'c1', status: 'active' as const })),
    setCreatorVerified: vi.fn(async () => ({ ok: true as const, id: 'c1', verified: true })),
    addCreatorNote: vi.fn(async () => ({ ok: true as const, id: 'c1' })),
  }
}

function renderView(actions = makeActions()) {
  render(<CreatorDetailView t={en.creators} locale="en" detail={detail} audit={audit} actions={actions} />)
  return actions
}

describe('CreatorDetailView', () => {
  it('renders the header with name, handle and tier/status', () => {
    renderView()
    expect(screen.getByRole('heading', { name: 'Mia' })).toBeTruthy()
    expect(screen.getByText('@mia')).toBeTruthy()
    expect(screen.getByText(en.creators.statusActive)).toBeTruthy()
  })
  it('switches to the Missions tab and shows a mission', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: en.creators.tabMissions }))
    expect(screen.getByText('Tokyo eats')).toBeTruthy()
  })
  it('suspends with a reason via the header action', async () => {
    const actions = renderView()
    fireEvent.click(screen.getByRole('button', { name: en.creators.actSuspend }))
    fireEvent.change(screen.getByPlaceholderText(en.creators.reasonPlaceholder), { target: { value: 'spam' } })
    fireEvent.click(screen.getByRole('button', { name: en.creators.actApply }))
    await waitFor(() => expect(actions.setCreatorStatus).toHaveBeenCalledWith('en', 'c1', 'suspended', 'spam'))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })
  it('adds a note from the Moderation tab', async () => {
    const actions = renderView()
    fireEvent.click(screen.getByRole('button', { name: en.creators.tabModeration }))
    fireEvent.change(screen.getByPlaceholderText(en.creators.notePlaceholder), { target: { value: 'looks fine' } })
    fireEvent.click(screen.getByRole('button', { name: en.creators.saveNote }))
    await waitFor(() => expect(actions.addCreatorNote).toHaveBeenCalledWith('en', 'c1', 'looks fine'))
  })
  it('surfaces an action failure instead of refreshing', async () => {
    const actions = makeActions()
    actions.setCreatorVerified.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required.'] } })
    renderView(actions)
    fireEvent.click(screen.getByRole('button', { name: en.creators.actVerify }))
    fireEvent.change(screen.getByPlaceholderText(en.creators.reasonPlaceholder), { target: { value: 'trust' } })
    fireEvent.click(screen.getByRole('button', { name: en.creators.actApply }))
    expect(await screen.findByText('Active ops access is required.')).toBeTruthy()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web`: `pnpm exec vitest run tests/kinnso.CreatorDetailView.test.tsx --reporter=dot`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `CreatorDetailView.tsx`**

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { CreatorDetail } from '@/lib/admin/creators-queries'
import type { AuditEntry } from '@/lib/admin/audit'
import type { ActionResult } from '@/lib/admin/result'
import type { CreatorStatus } from '@/lib/admin/creators-validation'
import { StatusBadge, TierBadge, VerifiedBadge } from '@/components/kinnso/admin/creators/badges'
import { ProfileDnaTab } from '@/components/kinnso/admin/creators/detail/ProfileDnaTab'
import { MissionsTab } from '@/components/kinnso/admin/creators/detail/MissionsTab'
import { EarningsTab } from '@/components/kinnso/admin/creators/detail/EarningsTab'
import { ContentTab } from '@/components/kinnso/admin/creators/detail/ContentTab'
import { ModerationTab } from '@/components/kinnso/admin/creators/detail/ModerationTab'

type T = Messages['creators']

export interface CreatorDetailActions {
  setCreatorStatus: (locale: Locale, id: string, status: CreatorStatus, reason: string) => Promise<ActionResult<{ id: string; status: CreatorStatus }>>
  reinstateCreator: (locale: Locale, id: string, reason: string) => Promise<ActionResult<{ id: string; status: 'active' }>>
  setCreatorVerified: (locale: Locale, id: string, verified: boolean, reason: string) => Promise<ActionResult<{ id: string; verified: boolean }>>
  addCreatorNote: (locale: Locale, id: string, note: string) => Promise<ActionResult<{ id: string }>>
}

type TabKey = 'profile' | 'missions' | 'earnings' | 'content' | 'moderation'
type Pending =
  | { kind: 'status'; status: CreatorStatus }
  | { kind: 'reinstate' }
  | { kind: 'verify'; verified: boolean }
  | null

const day = (s: string) => s.slice(0, 10)

export function CreatorDetailView({
  t, locale, detail, audit, actions,
}: { t: T; locale: Locale; detail: CreatorDetail; audit: AuditEntry[]; actions: CreatorDetailActions }) {
  const router = useRouter()
  const { creator } = detail
  const [tab, setTab] = useState<TabKey>('profile')
  const [pending, setPending] = useState<Pending>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)

  const firstError = (r: ActionResult<unknown>): string =>
    (!r.ok && Object.values(r.errors)[0]?.[0]) || t.actionFailed

  function start(p: Exclude<Pending, null>) { setPending(p); setReason(''); setError(null) }
  function cancel() { setPending(null); setReason(''); setError(null) }

  async function apply() {
    if (!pending) return
    setBusy(true); setError(null)
    let res: ActionResult<unknown>
    if (pending.kind === 'status') res = await actions.setCreatorStatus(locale, creator.id, pending.status, reason)
    else if (pending.kind === 'reinstate') res = await actions.reinstateCreator(locale, creator.id, reason)
    else res = await actions.setCreatorVerified(locale, creator.id, pending.verified, reason)
    setBusy(false)
    if (res.ok) { cancel(); router.refresh() }
    else setError(firstError(res))
  }

  async function saveNote() {
    setNoteError(null)
    const res = await actions.addCreatorNote(locale, creator.id, note)
    if (res.ok) { setNote(''); router.refresh() }
    else setNoteError(firstError(res))
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'profile', label: t.tabProfile },
    { key: 'missions', label: t.tabMissions },
    { key: 'earnings', label: t.tabEarnings },
    { key: 'content', label: t.tabContent },
    { key: 'moderation', label: t.tabModeration },
  ]

  const btn = 'rounded-lg border border-kinnso-line px-3 py-1.5 text-sm font-bold text-kinnso-ink hover:bg-kinnso-cream2 disabled:opacity-50'

  return (
    <main>
      <Link href={`/${locale}/admin/creators/directory`} className="text-sm font-bold text-kinnso-muted hover:text-kinnso-ink">
        ← {t.detailBack}
      </Link>

      <header className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="k-display">{creator.displayName ?? creator.handle ?? creator.id}</h1>
        {creator.handle ? <span className="text-kinnso-muted">@{creator.handle}</span> : null}
        <StatusBadge status={creator.status} t={t} />
        {detail.contribution ? <TierBadge tier={detail.contribution.tier} t={t} /> : null}
        <VerifiedBadge verified={creator.verified} t={t} />
        <span className="text-sm text-kinnso-muted">{t.detailJoined} {day(creator.createdAt)}</span>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        {(creator.status === 'onboarding' || creator.status === 'suspended') && (
          <button type="button" className={btn} onClick={() => start({ kind: 'status', status: 'active' })}>{t.actActivate}</button>
        )}
        {creator.status === 'active' && (
          <button type="button" className={btn} onClick={() => start({ kind: 'status', status: 'suspended' })}>{t.actSuspend}</button>
        )}
        {(creator.status === 'active' || creator.status === 'suspended') && (
          <button type="button" className={btn} onClick={() => start({ kind: 'status', status: 'banned' })}>{t.actBan}</button>
        )}
        {creator.status === 'banned' && (
          <button type="button" className={btn} onClick={() => start({ kind: 'reinstate' })}>{t.actReinstate}</button>
        )}
        <button type="button" className={btn} onClick={() => start({ kind: 'verify', verified: !creator.verified })}>
          {creator.verified ? t.actUnverify : t.actVerify}
        </button>
      </div>

      {pending && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-kinnso-line bg-kinnso-cream2 p-3">
          <input
            className="min-w-[16rem] flex-1 rounded-lg border border-kinnso-line px-3 py-1.5 text-sm"
            placeholder={t.reasonPlaceholder} value={reason} onChange={(e) => setReason(e.target.value)}
          />
          <button type="button" className={btn} disabled={busy || reason.trim() === ''} onClick={apply}>{t.actApply}</button>
          <button type="button" className={btn} disabled={busy} onClick={cancel}>{t.actCancel}</button>
          {error ? <p className="w-full text-sm text-red-700">{error}</p> : null}
        </div>
      )}

      <nav className="mt-6 flex gap-2 border-b border-kinnso-line">
        {tabs.map((x) => (
          <button
            key={x.key} type="button" aria-current={tab === x.key ? 'page' : undefined}
            onClick={() => setTab(x.key)}
            className={`px-3 py-2 text-sm font-bold ${tab === x.key ? 'border-b-2 border-kinnso-orange text-kinnso-orange' : 'text-kinnso-muted hover:text-kinnso-ink'}`}
          >{x.label}</button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'profile' && <ProfileDnaTab t={t} detail={detail} />}
        {tab === 'missions' && <MissionsTab t={t} missions={detail.missions} />}
        {tab === 'earnings' && <EarningsTab t={t} contribution={detail.contribution} settlements={detail.settlements} pointsEvents={detail.pointsEvents} />}
        {tab === 'content' && <ContentTab t={t} content={detail.content} />}
        {tab === 'moderation' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="min-w-[16rem] flex-1 rounded-lg border border-kinnso-line px-3 py-1.5 text-sm"
                placeholder={t.notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)}
              />
              <button type="button" className={btn} disabled={note.trim() === ''} onClick={saveNote}>{t.saveNote}</button>
              {noteError ? <p className="w-full text-sm text-red-700">{noteError}</p> : null}
            </div>
            <ModerationTab t={t} entries={audit} />
          </div>
        )}
      </div>
    </main>
  )
}

export default CreatorDetailView
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/web`: `pnpm exec vitest run tests/kinnso.CreatorDetailView.test.tsx --reporter=dot`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + lint + commit**

Run from `apps/web`: `pnpm exec tsc --noEmit` — expected: no errors.
Run from `apps/web`: `pnpm exec eslint components/kinnso/admin/creators/CreatorDetailView.tsx components/kinnso/admin/creators/detail` — expected: 0 errors (warnings acceptable, but prefer none; convert any ternary-statement lint warnings to if/else as in 10B).
```bash
git add apps/web/components/kinnso/admin/creators/CreatorDetailView.tsx apps/web/tests/kinnso.CreatorDetailView.test.tsx
git commit -m "feat(web): add CreatorDetailView 360 client view (Phase 10C)"
```

---

## Task 7: The `[creatorId]` route

**Files:**
- Create: `apps/web/app/[locale]/admin/creators/[creatorId]/page.tsx`
- Test: `apps/web/tests/admin.creators-detail.host.test.tsx`

The page gates inline, fetches detail + audit in parallel, and renders `notFound()` when the creator is missing. It does **not** use `generateStaticParams` (creator ids are dynamic). Server actions are imported and passed to the client view (same wiring as `directory/page.tsx`).

- [ ] **Step 1: Write the failing host test**

Mirror the existing `admin.creators-directory.host.test.tsx` structure: mock the guard, the queries, the audit reader, and the server client, then assert gate behaviors. (Read `apps/web/tests/admin.creators-directory.host.test.tsx` for the exact mock style in this repo and match it.)

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { guardMock, detailMock, auditMock, notFoundMock, redirectMock } = vi.hoisted(() => ({
  guardMock: vi.fn(), detailMock: vi.fn(), auditMock: vi.fn(),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  redirectMock: vi.fn(() => { throw new Error('NEXT_REDIRECT') }),
}))

vi.mock('next/navigation', () => ({ notFound: notFoundMock, redirect: redirectMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/admin/guard', () => ({ requireOpsPage: guardMock }))
vi.mock('@/lib/admin/creators-queries', () => ({ getCreatorDetail: detailMock }))
vi.mock('@/lib/admin/audit', () => ({ listAudit: auditMock }))
vi.mock('@/lib/i18n/dictionaries', () => ({ getDictionary: vi.fn(async () => (await import('@/lib/i18n/messages/en')).default) }))
vi.mock('@/lib/admin/creators-actions', () => ({ setCreatorStatus: vi.fn(), reinstateCreator: vi.fn(), setCreatorVerified: vi.fn(), addCreatorNote: vi.fn() }))

import CreatorDetailPage from '@/app/[locale]/admin/creators/[creatorId]/page'

afterEach(() => { vi.clearAllMocks() })

const params = (creatorId = 'c1', locale = 'en') => Promise.resolve({ locale, creatorId })

describe('Creator 360 page gate', () => {
  it('invalid locale → notFound', async () => {
    await expect(CreatorDetailPage({ params: params('c1', 'xx') })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('missing creator → notFound', async () => {
    guardMock.mockResolvedValueOnce(undefined)
    detailMock.mockResolvedValueOnce(null)
    await expect(CreatorDetailPage({ params: params() })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('ops + found → renders the view', async () => {
    guardMock.mockResolvedValueOnce(undefined)
    detailMock.mockResolvedValueOnce({
      creator: { id: 'c1', displayName: 'Mia', handle: 'mia', status: 'active', verified: false, bio: null, createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' },
      contribution: null, dna: null, scan: null, socials: [], missions: [], settlements: [], pointsEvents: [], content: [],
    })
    auditMock.mockResolvedValueOnce([])
    const ui = await CreatorDetailPage({ params: params() })
    render(ui)
    expect(screen.getByRole('heading', { name: 'Mia' })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web`: `pnpm exec vitest run tests/admin.creators-detail.host.test.tsx --reporter=dot`
Expected: FAIL (page module not found).

- [ ] **Step 3: Implement the page**

```tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getCreatorDetail } from '@/lib/admin/creators-queries'
import { listAudit } from '@/lib/admin/audit'
import { CreatorDetailView } from '@/components/kinnso/admin/creators/CreatorDetailView'
import { setCreatorStatus, reinstateCreator, setCreatorVerified, addCreatorNote } from '@/lib/admin/creators-actions'

export default async function CreatorDetailPage({
  params,
}: { params: Promise<{ locale: string; creatorId: string }> }) {
  const { locale, creatorId } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const detail = await getCreatorDetail(supabase, creatorId)
  if (!detail) notFound()
  const audit = await listAudit(supabase, 'creator', creatorId)
  return (
    <CreatorDetailView
      t={messages.creators}
      locale={loc}
      detail={detail}
      audit={audit}
      actions={{ setCreatorStatus, reinstateCreator, setCreatorVerified, addCreatorNote }}
    />
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/web`: `pnpm exec vitest run tests/admin.creators-detail.host.test.tsx --reporter=dot`
Expected: PASS (3 tests). If the repo's host tests use a different mock convention, align this test to it (Step 1 note).

- [ ] **Step 5: Typecheck + commit**

Run from `apps/web`: `pnpm exec tsc --noEmit` — expected: no errors.
```bash
git add "apps/web/app/[locale]/admin/creators/[creatorId]/page.tsx" apps/web/tests/admin.creators-detail.host.test.tsx
git commit -m "feat(web): add creator 360 detail route (Phase 10C)"
```

---

## Task 8: Link Directory rows → 360 page

**Files:**
- Modify: `apps/web/components/kinnso/admin/creators/CreatorsDirectoryView.tsx`
- Modify: `apps/web/tests/kinnso.CreatorsDirectoryView.test.tsx`

The Directory currently renders the creator name as plain text. Make it a `Link` to `/${locale}/admin/creators/${id}` so ops can open the 360 (spec §5: "row → 360").

- [ ] **Step 1: Add a failing assertion to the directory view test**

In `apps/web/tests/kinnso.CreatorsDirectoryView.test.tsx`, add this test inside the existing `describe('CreatorsDirectoryView', …)`:

```tsx
  it('links each creator name to its 360 detail page', () => {
    renderView()
    const link = screen.getByRole('link', { name: 'Mia' })
    expect(link.getAttribute('href')).toBe('/en/admin/creators/c1')
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run from `apps/web`: `pnpm exec vitest run tests/kinnso.CreatorsDirectoryView.test.tsx --reporter=dot`
Expected: FAIL ("Mia" is text, not a link).

- [ ] **Step 3: Make the name a Link**

In `CreatorsDirectoryView.tsx`: ensure `import Link from 'next/link'` is present. Find where the row renders the creator display name (the `{r.displayName ?? r.handle ?? …}` cell) and wrap it:

```tsx
<Link href={`/${locale}/admin/creators/${r.id}`} className="font-bold text-kinnso-ink hover:text-kinnso-orange hover:underline">
  {r.displayName ?? r.handle ?? r.id}
</Link>
```

Keep the existing handle/verified rendering around it unchanged. (The component already receives `locale`.)

- [ ] **Step 4: Run the directory test to verify it passes**

Run from `apps/web`: `pnpm exec vitest run tests/kinnso.CreatorsDirectoryView.test.tsx --reporter=dot`
Expected: PASS (all prior tests + the new link test).

- [ ] **Step 5: Typecheck + lint + commit**

Run from `apps/web`: `pnpm exec tsc --noEmit` — expected: no errors.
Run from `apps/web`: `pnpm exec eslint components/kinnso/admin/creators/CreatorsDirectoryView.tsx` — expected: no new errors.
```bash
git add apps/web/components/kinnso/admin/creators/CreatorsDirectoryView.tsx apps/web/tests/kinnso.CreatorsDirectoryView.test.tsx
git commit -m "feat(web): link directory rows to creator 360 (Phase 10C)"
```

---

## Final verification (after all tasks)

- [ ] **Typecheck the whole web app:** from `apps/web`, `pnpm exec tsc --noEmit` — no errors.
- [ ] **Lint the new/changed files:** from `apps/web`, `pnpm exec eslint components/kinnso/admin/creators lib/admin app/\[locale\]/admin/creators` — 0 errors.
- [ ] **Run all 10C + touched suites (one command, explicit files):**
  ```bash
  pnpm exec vitest run \
    tests/admin.creators-detail-queries.test.ts \
    tests/kinnso.CreatorDetailTabs.test.tsx \
    tests/kinnso.CreatorDetailView.test.tsx \
    tests/admin.creators-detail.host.test.tsx \
    tests/kinnso.CreatorsDirectoryView.test.tsx \
    tests/i18n.locale-parity.test.ts \
    --reporter=dot
  ```
  Expected: all green.
- [ ] **Final adversarial review** (multi-lens: security/gate, spec-completeness, correctness, i18n parity, React/client-boundary). Fix findings, then push and open/refresh the 10C PR.

## Self-Review notes (spec coverage)

- §5 10C table — `[creatorId]/page.tsx` (Task 7), `getCreatorDetail` aggregator (Tasks 1+3), `CreatorDetailView` + 5 tabs (Tasks 5+6). ✓
- "Header quick actions = lifecycle/verify from 10B (reused)" — Task 6 imports the 10B actions; the page passes them. ✓
- "Moderation tab lists this creator's `ops_audit_log` entries + add-note form" — `listAudit('creator', id)` (Task 7) + ModerationTab + note form in the view (Task 6). ✓
- "missing-creator → notFound path" — RPC returns null → wrapper null → `notFound()` (Tasks 1, 3, 7). ✓
- Ops-gated, no PII, errors propagate — RPC `is_active_ops()` gate (Task 1); `creators` has no email; wrapper throws on error (Task 3). ✓
- All new strings in all 7 locales, parity green — Task 4. ✓
- `articles` excluded from Content (no `creator_id`); Content = `guides` only — Tasks 1, 5. ✓ (Documented deviation from the spec's "guides" wording, which already matches.)
