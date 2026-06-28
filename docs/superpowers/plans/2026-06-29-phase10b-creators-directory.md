# Phase 10B — Creators Console: Directory + Lifecycle/Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the **Directory** tab (`/admin/creators/directory`) — a searchable, filterable, keyset-paginated creator table — plus full account lifecycle/moderation: activate · suspend · **ban** · **reinstate** · **verify**, each requiring a reason and writing an audited `ops_audit_log` row, with bulk status actions.

**Architecture:** Mirrors the Phase 6/10A admin recipe. A migration extends `creators.status` with a terminal `banned` value and adds a `verified` boolean. Platform-wide search + all writes go through SECURITY DEFINER RPCs gated on `is_active_ops()` that enforce legal transitions and append audit rows in the same transaction (via the 10A `ops_audit_log_append` helper). The page gates inline before fetch; the directory list uses keyset pagination on `(created_at, id)`. Actions return `ActionResult` and map DB raise-messages to localized copy.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Supabase (SECURITY DEFINER RPCs + RLS), Vitest 4, custom i18n (7 locales).

**Spec:** `docs/superpowers/specs/2026-06-28-phase10-creators-operator-console-design.md` (§4 lifecycle & verification, §5 → 10B row, §7 risks).
**Builds on:** Phase 10A (`ops_audit_log`, `ops_audit_log_append`, `lib/admin/creators-queries.ts`, the `creators` i18n group, the Creators nav). PR #52.

---

## Scope notes (read before starting)

- **Branch:** continue on `feat/creators-console` (where 10A lives, unmerged). All paths are in the clone repo (see Task working-dir note).
- **Lifecycle = approved option C:** add terminal `banned` + independent `verified` flag. Transitions (enforced in the write RPCs):
  - activate: `onboarding`/`suspended` → `active`
  - suspend: `active` → `suspended`
  - ban: `active`/`suspended` → `banned` (terminal)
  - reinstate: `banned` → `active` — a **distinct, extra-guarded RPC** (separate UI control + confirm), never the normal activate path
  - verify: independent boolean toggle
  - Every transition + verify + note **requires a reason/note** and writes an `ops_audit_log` row (`entity_type='creator'`) with `{from,to}` / `{verified}` metadata.
- **No public RLS change needed.** anon already has table-wide `SELECT` on `creators` (row-gated by `creators_public_read`); the new `verified` column is automatically readable. So no RLS edit — just the column.
- **DEFERRED out of 10B (flagged):** surfacing the `verified` badge on the **public** creator profile (spec §7). It's a public/brand decision and a separable change; do it as a small follow-up once product confirms verification should show publicly. 10B exposes `verified` to **ops** only (Directory + the 360 header in 10C).
- **Search = name + handle only.** `creators` has no email column (email lives in `auth.users`, not exposed); searching it would risk PII and isn't available. Documented deviation from the screen-map's "email" mention.
- **Sort:** v1 is keyset-paginated by `created_at desc, id desc` (stable, scalable). Arbitrary column sort is deferred (filter + search + pagination meet the "find any creator" criterion). Documented.
- Honest data (errors propagate), no service-role in request paths, no PII to client bundles.

## File structure

**Create:**
- `supabase/migrations/20260629110000_creator_lifecycle_and_search.sql` — status CHECK +`banned`, `verified` column, and 6 RPCs (`admin_set_creator_status`, `admin_reinstate_creator`, `admin_set_creator_verified`, `admin_add_creator_note`, `admin_bulk_set_creator_status`, `admin_search_creators`) + grants.
- `apps/web/lib/admin/creators-validation.ts` — input validators (reason required, valid status, bulk bounds, search-param normalize).
- `apps/web/lib/admin/creators-actions.ts` — `setCreatorStatus`, `reinstateCreator`, `setCreatorVerified`, `addCreatorNote`, `bulkSetCreatorStatus`.
- `apps/web/components/kinnso/admin/creators/CreatorsDirectoryView.tsx` — client component (search, filters, table, per-row actions with reason, bulk bar).
- `apps/web/app/[locale]/admin/creators/directory/page.tsx` — gate → parse params → fetch → view.
- Tests: `apps/web/tests/admin.creators-validation.test.ts`, `admin.creators-actions.test.ts`, `admin.creators-directory-queries.test.ts`, `kinnso.CreatorsDirectoryView.test.tsx`, `admin.creators-directory.host.test.tsx`.

**Modify:**
- `packages/db/types.ts` — add `verified` to the `creators` table Row/Insert/Update; add the 6 new functions.
- `apps/web/lib/admin/creators-queries.ts` — add `listCreatorsDirectory()` + its types (append; do not disturb `getCreatorsOverview`).
- `apps/web/lib/i18n/messages/*.ts` (all 7) + the `Messages` interface — add directory/moderation keys to the `creators` group.

---

## Task 1: Migration — lifecycle states + verified + write/search RPCs

**Files:**
- Create: `supabase/migrations/20260629110000_creator_lifecycle_and_search.sql`
- Modify: `packages/db/types.ts`

Verification is by applying the migration and confirming objects exist, then patching the generated types so later tasks typecheck. (No SQL unit-test harness in this repo; TS tests mock Supabase.)

- [ ] **Step 1: Write the migration file**

```sql
-- Phase 10B — Creators lifecycle (add terminal 'banned' + independent 'verified'),
-- moderation write RPCs, and a filtered/keyset-paginated search RPC. All writes are
-- SECURITY DEFINER, gated on is_active_ops(), require a reason, and append an
-- ops_audit_log row (entity_type='creator') in the same transaction via the 10A helper.

-- 1. Extend status with a terminal 'banned' value; add the independent verified flag.
alter table public.creators drop constraint if exists creators_status_check;
alter table public.creators add constraint creators_status_check
  check (status in ('onboarding','active','suspended','banned'));
alter table public.creators add column if not exists verified boolean not null default false;

-- 2. Transition-guarded status setter (activate / suspend / ban). Reinstate is separate.
create or replace function public.admin_set_creator_status(p_id uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','suspended','banned') then raise exception 'bad_status'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select status into v_from from public.creators where id = p_id;
  if v_from is null then raise exception 'not_found'; end if;
  if p_status = 'active'    and v_from not in ('onboarding','suspended') then raise exception 'bad_transition'; end if;
  if p_status = 'suspended' and v_from <> 'active'                       then raise exception 'bad_transition'; end if;
  if p_status = 'banned'    and v_from not in ('active','suspended')     then raise exception 'bad_transition'; end if;
  update public.creators set status = p_status, updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('creator', p_id, 'status.' || p_status, p_reason,
    jsonb_build_object('from', v_from, 'to', p_status));
end $$;

-- 3. Reinstate: banned -> active ONLY (distinct, extra-guarded).
create or replace function public.admin_reinstate_creator(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select status into v_from from public.creators where id = p_id;
  if v_from is null then raise exception 'not_found'; end if;
  if v_from <> 'banned' then raise exception 'not_banned'; end if;
  update public.creators set status = 'active', updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('creator', p_id, 'status.reinstate', p_reason,
    jsonb_build_object('from', 'banned', 'to', 'active'));
end $$;

-- 4. Verified toggle (independent of status).
create or replace function public.admin_set_creator_verified(p_id uuid, p_verified boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_exists boolean;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select true into v_exists from public.creators where id = p_id;
  if v_exists is null then raise exception 'not_found'; end if;
  update public.creators set verified = p_verified, updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('creator', p_id, 'verify.set', p_reason,
    jsonb_build_object('verified', p_verified));
end $$;

-- 5. Note-only audit row.
create or replace function public.admin_add_creator_note(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_exists boolean;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'reason_required'; end if;
  select true into v_exists from public.creators where id = p_id;
  if v_exists is null then raise exception 'not_found'; end if;
  perform public.ops_audit_log_append('creator', p_id, 'note.add', p_note, '{}'::jsonb);
end $$;

-- 6. Bulk status: one transaction, audits each applied change, skips illegal transitions.
--    Returns the count actually changed.
create or replace function public.admin_bulk_set_creator_status(p_ids uuid[], p_status text, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_from text; v_count int := 0;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','suspended','banned') then raise exception 'bad_status'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if array_length(p_ids, 1) is null or array_length(p_ids, 1) > 100 then raise exception 'bad_bulk'; end if;
  foreach v_id in array p_ids loop
    select status into v_from from public.creators where id = v_id;
    if v_from is null then continue; end if;
    if (p_status = 'active'    and v_from in ('onboarding','suspended'))
    or (p_status = 'suspended' and v_from = 'active')
    or (p_status = 'banned'    and v_from in ('active','suspended')) then
      update public.creators set status = p_status, updated_at = now() where id = v_id;
      perform public.ops_audit_log_append('creator', v_id, 'status.' || p_status, p_reason,
        jsonb_build_object('from', v_from, 'to', p_status, 'bulk', true));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

-- 7. Filtered + keyset-paginated search. Ops-aggregate (bypasses owner RLS), ops-gated.
create or replace function public.admin_search_creators(
  p_search             text default null,
  p_statuses           text[] default null,
  p_tiers              text[] default null,
  p_dna                text default null,    -- 'published' | 'draft' | 'none' | null
  p_verified           boolean default null,
  p_limit              int default 25,
  p_cursor_created_at  timestamptz default null,
  p_cursor_id          uuid default null
) returns table (
  id uuid, display_name text, handle text, status text, verified boolean,
  tier text, dna_status text, contribution_points int, created_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select c.id, c.display_name, c.handle, c.status, c.verified,
           cc.tier, cd.status as dna_status, cc.contribution_points, c.created_at
    from public.creators c
    left join public.creator_contribution cc on cc.creator_id = c.id
    left join lateral (
      select d.status from public.creator_dna d where d.creator_id = c.id limit 1
    ) cd on true
    where (p_search is null or p_search = ''
           or c.display_name ilike '%' || p_search || '%'
           or c.handle ilike '%' || p_search || '%')
      and (p_statuses is null or c.status = any(p_statuses))
      and (p_tiers is null or cc.tier = any(p_tiers))
      and (p_verified is null or c.verified = p_verified)
      and (p_dna is null
           or (p_dna = 'none' and cd.status is null)
           or (p_dna <> 'none' and cd.status = p_dna))
      and (p_cursor_created_at is null
           or (c.created_at, c.id) < (p_cursor_created_at, p_cursor_id))
    order by c.created_at desc, c.id desc
    limit least(greatest(coalesce(p_limit, 25), 1), 100);
end $$;

-- 8. Grants: revoke implicit public+anon EXECUTE, grant authenticated only.
revoke all on function public.admin_set_creator_status(uuid, text, text) from public, anon;
revoke all on function public.admin_reinstate_creator(uuid, text) from public, anon;
revoke all on function public.admin_set_creator_verified(uuid, boolean, text) from public, anon;
revoke all on function public.admin_add_creator_note(uuid, text) from public, anon;
revoke all on function public.admin_bulk_set_creator_status(uuid[], text, text) from public, anon;
revoke all on function public.admin_search_creators(text, text[], text[], text, boolean, int, timestamptz, uuid) from public, anon;
grant execute on function public.admin_set_creator_status(uuid, text, text) to authenticated;
grant execute on function public.admin_reinstate_creator(uuid, text) to authenticated;
grant execute on function public.admin_set_creator_verified(uuid, boolean, text) to authenticated;
grant execute on function public.admin_add_creator_note(uuid, text) to authenticated;
grant execute on function public.admin_bulk_set_creator_status(uuid[], text, text) to authenticated;
grant execute on function public.admin_search_creators(text, text[], text[], text, boolean, int, timestamptz, uuid) to authenticated;
```

- [ ] **Step 2: Apply the migration**

Use Supabase MCP `apply_migration` with name `creator_lifecycle_and_search` and the SQL above (project ref `scryfkefedzuetfdtrvl`; confirm right account). Sanity-check:
`select * from public.admin_search_creators(null,null,null,null,null,5,null,null);` as an active ops user returns up to 5 rows with the new columns; `select column_name from information_schema.columns where table_name='creators' and column_name='verified';` returns one row.

- [ ] **Step 3: Patch `packages/db/types.ts`**

Add `verified` to the `creators` table. In the `creators` block, add to `Row`: `verified: boolean`; to `Insert`: `verified?: boolean`; to `Update`: `verified?: boolean` (place alphabetically among the existing columns).

Add the 6 functions to `Functions` (after `admin_creator_analytics`):

```ts
      admin_set_creator_status: {
        Args: { p_id: string; p_status: string; p_reason: string }
        Returns: undefined
      }
      admin_reinstate_creator: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      admin_set_creator_verified: {
        Args: { p_id: string; p_verified: boolean; p_reason: string }
        Returns: undefined
      }
      admin_add_creator_note: {
        Args: { p_id: string; p_note: string }
        Returns: undefined
      }
      admin_bulk_set_creator_status: {
        Args: { p_ids: string[]; p_status: string; p_reason: string }
        Returns: number
      }
      admin_search_creators: {
        Args: {
          p_search?: string
          p_statuses?: string[]
          p_tiers?: string[]
          p_dna?: string
          p_verified?: boolean
          p_limit?: number
          p_cursor_created_at?: string
          p_cursor_id?: string
        }
        Returns: {
          id: string
          display_name: string
          handle: string
          status: string
          verified: boolean
          tier: string
          dna_status: string
          contribution_points: number
          created_at: string
        }[]
      }
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260629110000_creator_lifecycle_and_search.sql packages/db/types.ts
git commit -m "feat(db): add creator banned/verified lifecycle + moderation & search RPCs (Phase 10B)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `lib/admin/creators-validation.ts`

**Files:**
- Create: `apps/web/lib/admin/creators-validation.ts`
- Test: `apps/web/tests/admin.creators-validation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import {
  isCreatorStatus, validateReason, validateBulkIds, normalizeDirectoryParams,
  type CreatorStatus,
} from '@/lib/admin/creators-validation'

describe('isCreatorStatus', () => {
  it('accepts the four lifecycle states', () => {
    for (const s of ['onboarding', 'active', 'suspended', 'banned']) expect(isCreatorStatus(s)).toBe(true)
  })
  it('rejects anything else', () => {
    expect(isCreatorStatus('deleted')).toBe(false)
    expect(isCreatorStatus('')).toBe(false)
  })
})

describe('validateReason', () => {
  it('returns null for a non-empty trimmed reason', () => {
    expect(validateReason('spam account')).toBeNull()
  })
  it('returns an error key for empty/whitespace', () => {
    expect(validateReason('   ')).toBe('reason_required')
    expect(validateReason('')).toBe('reason_required')
  })
  it('returns an error key when too long (>500)', () => {
    expect(validateReason('x'.repeat(501))).toBe('reason_too_long')
  })
})

describe('validateBulkIds', () => {
  it('accepts 1..100 ids', () => {
    expect(validateBulkIds(['a'])).toBeNull()
    expect(validateBulkIds(Array.from({ length: 100 }, (_, i) => String(i)))).toBeNull()
  })
  it('rejects empty or >100', () => {
    expect(validateBulkIds([])).toBe('bad_bulk')
    expect(validateBulkIds(Array.from({ length: 101 }, (_, i) => String(i)))).toBe('bad_bulk')
  })
})

describe('normalizeDirectoryParams', () => {
  it('parses search params into typed RPC inputs', () => {
    const p = normalizeDirectoryParams({ q: 'mia', status: 'active,suspended', tier: 'pro', dna: 'published', verified: 'true' })
    expect(p).toEqual({
      search: 'mia', statuses: ['active', 'suspended'], tiers: ['pro'],
      dna: 'published', verified: true,
    })
  })
  it('drops empty/invalid filters', () => {
    const p = normalizeDirectoryParams({ q: '', status: '', tier: undefined, dna: 'bogus', verified: 'maybe' })
    expect(p).toEqual({ search: undefined, statuses: undefined, tiers: undefined, dna: undefined, verified: undefined })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web`): `pnpm exec vitest run tests/admin.creators-validation.test.ts --reporter=dot`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
const STATUSES = ['onboarding', 'active', 'suspended', 'banned'] as const
export type CreatorStatus = (typeof STATUSES)[number]

const TIERS = ['seed', 'rising', 'pro', 'elite']
const DNA = ['published', 'draft', 'none']

export function isCreatorStatus(s: string): s is CreatorStatus {
  return (STATUSES as readonly string[]).includes(s)
}

/** null when valid; otherwise a DB-style error key the action maps to localized copy. */
export function validateReason(reason: string): string | null {
  const r = (reason ?? '').trim()
  if (!r) return 'reason_required'
  if (r.length > 500) return 'reason_too_long'
  return null
}

export function validateBulkIds(ids: string[]): string | null {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) return 'bad_bulk'
  return null
}

export interface DirectoryParams {
  search?: string
  statuses?: string[]
  tiers?: string[]
  dna?: 'published' | 'draft' | 'none'
  verified?: boolean
}

type RawSearchParams = {
  q?: string
  status?: string
  tier?: string
  dna?: string
  verified?: string
}

const csv = (v: string | undefined, allowed: string[]): string[] | undefined => {
  if (!v) return undefined
  const parts = v.split(',').map((s) => s.trim()).filter((s) => allowed.includes(s))
  return parts.length ? parts : undefined
}

/** Map raw URL search params to validated RPC inputs (invalid values dropped). */
export function normalizeDirectoryParams(raw: RawSearchParams): DirectoryParams {
  const search = raw.q?.trim() || undefined
  const statuses = csv(raw.status, STATUSES as unknown as string[])
  const tiers = csv(raw.tier, TIERS)
  const dna = DNA.includes(raw.dna ?? '') ? (raw.dna as DirectoryParams['dna']) : undefined
  const verified = raw.verified === 'true' ? true : raw.verified === 'false' ? false : undefined
  return { search, statuses, tiers, dna, verified }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/admin.creators-validation.test.ts --reporter=dot`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/creators-validation.ts apps/web/tests/admin.creators-validation.test.ts
git commit -m "feat(web): add creators moderation/directory validation (Phase 10B)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `lib/admin/creators-actions.ts`

**Files:**
- Create: `apps/web/lib/admin/creators-actions.ts`
- Test: `apps/web/tests/admin.creators-actions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock, gateMock, revalidateMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async () => ({ data: null, error: null })),
  gateMock: vi.fn(async () => ({ ok: true, user: { id: 'u1' } })),
  revalidateMock: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: gateMock }))

import {
  setCreatorStatus, reinstateCreator, setCreatorVerified, addCreatorNote, bulkSetCreatorStatus,
} from '@/lib/admin/creators-actions'

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null })
  gateMock.mockReset().mockResolvedValue({ ok: true, user: { id: 'u1' } })
  revalidateMock.mockReset()
})

describe('setCreatorStatus', () => {
  it('calls admin_set_creator_status and returns ok', async () => {
    const res = await setCreatorStatus('en', 'c1', 'suspended', 'spam')
    expect(rpcMock).toHaveBeenCalledWith('admin_set_creator_status', { p_id: 'c1', p_status: 'suspended', p_reason: 'spam' })
    expect(res).toEqual({ ok: true, id: 'c1', status: 'suspended' })
    expect(revalidateMock).toHaveBeenCalled()
  })
  it('fails validation when reason is blank (no RPC call)', async () => {
    const res = await setCreatorStatus('en', 'c1', 'banned', '   ')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/reason/i)
  })
  it('rejects an invalid status', async () => {
    const res = await setCreatorStatus('en', 'c1', 'deleted' as never, 'x')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('maps a bad_transition DB raise to friendly copy', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'bad_transition' } })
    const res = await setCreatorStatus('en', 'c1', 'suspended', 'x')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/transition|cannot/i)
  })
  it('returns the gate failure for a non-ops caller', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required'] } })
    const res = await setCreatorStatus('en', 'c1', 'active', 'x')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('reinstateCreator', () => {
  it('calls admin_reinstate_creator', async () => {
    const res = await reinstateCreator('en', 'c1', 'appeal approved')
    expect(rpcMock).toHaveBeenCalledWith('admin_reinstate_creator', { p_id: 'c1', p_reason: 'appeal approved' })
    expect(res).toEqual({ ok: true, id: 'c1', status: 'active' })
  })
  it('maps not_banned to friendly copy', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'not_banned' } })
    const res = await reinstateCreator('en', 'c1', 'x')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/banned/i)
  })
})

describe('setCreatorVerified', () => {
  it('calls admin_set_creator_verified with the boolean', async () => {
    const res = await setCreatorVerified('en', 'c1', true, 'passed KYC')
    expect(rpcMock).toHaveBeenCalledWith('admin_set_creator_verified', { p_id: 'c1', p_verified: true, p_reason: 'passed KYC' })
    expect(res).toEqual({ ok: true, id: 'c1', verified: true })
  })
})

describe('addCreatorNote', () => {
  it('calls admin_add_creator_note', async () => {
    const res = await addCreatorNote('en', 'c1', 'called creator')
    expect(rpcMock).toHaveBeenCalledWith('admin_add_creator_note', { p_id: 'c1', p_note: 'called creator' })
    expect(res).toEqual({ ok: true, id: 'c1' })
  })
  it('fails on blank note', async () => {
    const res = await addCreatorNote('en', 'c1', '  ')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('bulkSetCreatorStatus', () => {
  it('calls admin_bulk_set_creator_status and returns the changed count', async () => {
    rpcMock.mockResolvedValueOnce({ data: 3, error: null })
    const res = await bulkSetCreatorStatus('en', ['a', 'b', 'c'], 'suspended', 'cleanup')
    expect(rpcMock).toHaveBeenCalledWith('admin_bulk_set_creator_status', { p_ids: ['a', 'b', 'c'], p_status: 'suspended', p_reason: 'cleanup' })
    expect(res).toEqual({ ok: true, count: 3 })
  })
  it('rejects an empty id list (no RPC call)', async () => {
    const res = await bulkSetCreatorStatus('en', [], 'banned', 'x')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/admin.creators-actions.test.ts --reporter=dot`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { isCreatorStatus, validateReason, validateBulkIds, type CreatorStatus } from '@/lib/admin/creators-validation'
import type { Locale } from '@/lib/i18n/config'

const dirPath = (locale: Locale) => `/${locale}/admin/creators/directory`

/** DB raise-message → friendly copy. The RPCs raise these bare messages. */
const FRIENDLY: Record<string, string> = {
  forbidden: 'Active ops access is required.',
  bad_status: 'Invalid status.',
  bad_transition: 'That status change is not allowed from the creator’s current state.',
  reason_required: 'A reason is required.',
  reason_too_long: 'The reason is too long (max 500 characters).',
  not_found: 'That creator no longer exists. Refresh and try again.',
  not_banned: 'Only a banned creator can be reinstated.',
  bad_bulk: 'Select between 1 and 100 creators.',
}

const mapError = (message: string, fallback: string): string => {
  const key = Object.keys(FRIENDLY).find((k) => message.includes(k))
  return key ? FRIENDLY[key] : fallback
}

export async function setCreatorStatus(
  locale: Locale, id: string, status: CreatorStatus, reason: string,
): Promise<ActionResult<{ id: string; status: CreatorStatus }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!isCreatorStatus(status) || status === 'onboarding') return formError(FRIENDLY.bad_status)
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { error } = await supabase.rpc('admin_set_creator_status', { p_id: id, p_status: status, p_reason: reason.trim() })
  if (error) return formError(mapError(error.message, 'Status could not be changed'))
  revalidatePath(dirPath(locale))
  return { ok: true, id, status }
}

export async function reinstateCreator(
  locale: Locale, id: string, reason: string,
): Promise<ActionResult<{ id: string; status: 'active' }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { error } = await supabase.rpc('admin_reinstate_creator', { p_id: id, p_reason: reason.trim() })
  if (error) return formError(mapError(error.message, 'Creator could not be reinstated'))
  revalidatePath(dirPath(locale))
  return { ok: true, id, status: 'active' }
}

export async function setCreatorVerified(
  locale: Locale, id: string, verified: boolean, reason: string,
): Promise<ActionResult<{ id: string; verified: boolean }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { error } = await supabase.rpc('admin_set_creator_verified', { p_id: id, p_verified: verified, p_reason: reason.trim() })
  if (error) return formError(mapError(error.message, 'Verification could not be changed'))
  revalidatePath(dirPath(locale))
  return { ok: true, id, verified }
}

export async function addCreatorNote(
  locale: Locale, id: string, note: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(note)
  if (rErr) return formError(FRIENDLY[rErr])

  const { error } = await supabase.rpc('admin_add_creator_note', { p_id: id, p_note: note.trim() })
  if (error) return formError(mapError(error.message, 'Note could not be saved'))
  revalidatePath(dirPath(locale))
  return { ok: true, id }
}

export async function bulkSetCreatorStatus(
  locale: Locale, ids: string[], status: CreatorStatus, reason: string,
): Promise<ActionResult<{ count: number }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!isCreatorStatus(status) || status === 'onboarding') return formError(FRIENDLY.bad_status)
  const bErr = validateBulkIds(ids)
  if (bErr) return formError(FRIENDLY[bErr])
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { data, error } = await supabase.rpc('admin_bulk_set_creator_status', { p_ids: ids, p_status: status, p_reason: reason.trim() })
  if (error) return formError(mapError(error.message, 'Bulk update failed'))
  return { ok: true, count: Number(data ?? 0) }
}
```

Note: `bulkSetCreatorStatus` does not call `revalidatePath` (the client view triggers `router.refresh()` after a bulk apply); the single-row actions revalidate because they're the common path. (Both patterns appear in the existing admin views.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/admin.creators-actions.test.ts --reporter=dot`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/creators-actions.ts apps/web/tests/admin.creators-actions.test.ts
git commit -m "feat(web): add audited creator lifecycle/verify/note/bulk actions (Phase 10B)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `listCreatorsDirectory` in `lib/admin/creators-queries.ts`

**Files:**
- Modify: `apps/web/lib/admin/creators-queries.ts` (append; leave `getCreatorsOverview` untouched)
- Test: `apps/web/tests/admin.creators-directory-queries.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { listCreatorsDirectory } from '@/lib/admin/creators-queries'

const rows = [
  { id: 'c1', display_name: 'Mia', handle: 'mia', status: 'active', verified: true, tier: 'pro', dna_status: 'published', contribution_points: 320, created_at: '2026-06-28T10:00:00Z' },
  { id: 'c2', display_name: null, handle: 'lee', status: 'suspended', verified: false, tier: null, dna_status: null, contribution_points: 0, created_at: '2026-06-27T10:00:00Z' },
]

function client(data: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) }
}

describe('listCreatorsDirectory', () => {
  it('maps rows to camelCase and forwards filters to the RPC', async () => {
    const c = client(rows)
    const out = await listCreatorsDirectory(c as never, { search: 'm', statuses: ['active'], tiers: ['pro'], dna: 'published', verified: true, limit: 2 })
    expect(c.rpc).toHaveBeenCalledWith('admin_search_creators', {
      p_search: 'm', p_statuses: ['active'], p_tiers: ['pro'], p_dna: 'published',
      p_verified: true, p_limit: 2, p_cursor_created_at: null, p_cursor_id: null,
    })
    expect(out.rows[0]).toEqual({
      id: 'c1', displayName: 'Mia', handle: 'mia', status: 'active', verified: true,
      tier: 'pro', dnaStatus: 'published', contributionPoints: 320, createdAt: '2026-06-28T10:00:00Z',
    })
  })
  it('sets nextCursor when a full page is returned, null otherwise', async () => {
    const full = await listCreatorsDirectory(client(rows) as never, { limit: 2 })
    expect(full.nextCursor).toEqual({ createdAt: '2026-06-27T10:00:00Z', id: 'c2' })
    const partial = await listCreatorsDirectory(client([rows[0]]) as never, { limit: 2 })
    expect(partial.nextCursor).toBeNull()
  })
  it('passes the cursor through for the next page', async () => {
    const c = client([])
    await listCreatorsDirectory(c as never, { limit: 2, cursor: { createdAt: '2026-06-27T10:00:00Z', id: 'c2' } })
    expect(c.rpc).toHaveBeenCalledWith('admin_search_creators', expect.objectContaining({
      p_cursor_created_at: '2026-06-27T10:00:00Z', p_cursor_id: 'c2',
    }))
  })
  it('throws when the RPC errors (no silent empty)', async () => {
    await expect(listCreatorsDirectory(client(null, { message: 'forbidden' }) as never, {})).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/admin.creators-directory-queries.test.ts --reporter=dot`
Expected: FAIL — `listCreatorsDirectory` not exported.

- [ ] **Step 3: Append the implementation to `creators-queries.ts`**

Add these exports at the end of `apps/web/lib/admin/creators-queries.ts` (the file already imports `SupabaseClient`, `Database` as `Client`):

```ts
export interface DirectoryRow {
  id: string
  displayName: string | null
  handle: string | null
  status: string
  verified: boolean
  tier: string | null
  dnaStatus: string | null
  contributionPoints: number
  createdAt: string
}

export interface CreatorsDirectory {
  rows: DirectoryRow[]
  nextCursor: { createdAt: string; id: string } | null
}

export interface ListDirectoryParams {
  search?: string
  statuses?: string[]
  tiers?: string[]
  dna?: 'published' | 'draft' | 'none'
  verified?: boolean
  limit?: number
  cursor?: { createdAt: string; id: string } | null
}

type SearchRow = {
  id: string
  display_name: string | null
  handle: string | null
  status: string
  verified: boolean
  tier: string | null
  dna_status: string | null
  contribution_points: number | null
  created_at: string
}

/**
 * Filtered, keyset-paginated creator directory for ops. Goes through the
 * SECURITY DEFINER `admin_search_creators` RPC (is_active_ops()-gated) so an ops
 * user sees all creators despite owner-scoped RLS. Errors propagate.
 */
export async function listCreatorsDirectory(supabase: Client, params: ListDirectoryParams): Promise<CreatorsDirectory> {
  const limit = params.limit ?? 25
  const { data, error } = await supabase.rpc('admin_search_creators', {
    p_search: params.search ?? null,
    p_statuses: params.statuses ?? null,
    p_tiers: params.tiers ?? null,
    p_dna: params.dna ?? null,
    p_verified: params.verified ?? null,
    p_limit: limit,
    p_cursor_created_at: params.cursor?.createdAt ?? null,
    p_cursor_id: params.cursor?.id ?? null,
  })
  if (error) throw error
  const raw = (data ?? []) as SearchRow[]
  const rows: DirectoryRow[] = raw.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    handle: r.handle,
    status: r.status,
    verified: r.verified,
    tier: r.tier,
    dnaStatus: r.dna_status,
    contributionPoints: Number(r.contribution_points ?? 0),
    createdAt: r.created_at,
  }))
  const last = rows[rows.length - 1]
  const nextCursor = rows.length === limit && last ? { createdAt: last.createdAt, id: last.id } : null
  return { rows, nextCursor }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/admin.creators-directory-queries.test.ts --reporter=dot`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/creators-queries.ts apps/web/tests/admin.creators-directory-queries.test.ts
git commit -m "feat(web): add listCreatorsDirectory keyset query (Phase 10B)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: i18n — directory + moderation keys

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface + value), `{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` (value)

These keys go INTO the existing `creators` group (added in 10A). Parity (`i18n.locale-parity.test.ts`) already includes `creators`, so it enforces these new keys across all 7 locales automatically.

- [ ] **Step 1: Add the keys to the `Messages` interface in `en.ts`**

Inside the `creators: { ... }` interface block, add:

```ts
    dirSearch: string; dirStatus: string; dirTier: string; dirDna: string; dirVerifiedOnly: string
    dirAll: string; dirLoadMore: string; dirEmpty: string
    colName: string; colTier: string; colDna: string; colJoined: string; colActions: string
    dnaPublished: string; dnaDraft: string; dnaNone: string
    actActivate: string; actSuspend: string; actBan: string; actReinstate: string
    actVerify: string; actUnverify: string; actNote: string; actApply: string; actCancel: string
    reasonPlaceholder: string; notePlaceholder: string
    confirmBan: string; confirmReinstate: string
    bulkApply: string; bulkSelected: string; bulkChooseAction: string
    actionFailed: string
```

- [ ] **Step 2: Run parity to confirm it goes RED**

Run: `pnpm exec vitest run tests/i18n.locale-parity.test.ts --reporter=dot`
Expected: FAIL — `en` now has keys the other locales lack (and tsc would fail too).

- [ ] **Step 3: Add the English values to the `creators` value group in `en.ts`**

```ts
    dirSearch: 'Search name or handle', dirStatus: 'Status', dirTier: 'Tier', dirDna: 'DNA', dirVerifiedOnly: 'Verified only',
    dirAll: 'All', dirLoadMore: 'Load more', dirEmpty: 'No creators match your filters',
    colName: 'Creator', colTier: 'Tier', colDna: 'DNA', colJoined: 'Joined', colActions: 'Actions',
    dnaPublished: 'Published', dnaDraft: 'Draft', dnaNone: 'None',
    actActivate: 'Activate', actSuspend: 'Suspend', actBan: 'Ban', actReinstate: 'Reinstate',
    actVerify: 'Verify', actUnverify: 'Unverify', actNote: 'Add note', actApply: 'Apply', actCancel: 'Cancel',
    reasonPlaceholder: 'Reason (required)', notePlaceholder: 'Note (required)',
    confirmBan: 'Ban this creator? This is a permanent state.', confirmReinstate: 'Reinstate this banned creator?',
    bulkApply: 'Apply to selected', bulkSelected: 'selected', bulkChooseAction: 'Choose an action',
    actionFailed: 'Action failed. Try again.',
```

- [ ] **Step 4: Add the localized values to the 6 other locale files**

Append into each file's `creators` value group. Use these exactly.

`zh-hk.ts`:
```ts
    dirSearch: '搜尋名稱或帳號', dirStatus: '狀態', dirTier: '等級', dirDna: 'DNA', dirVerifiedOnly: '只顯示已驗證',
    dirAll: '全部', dirLoadMore: '載入更多', dirEmpty: '沒有符合篩選的創作者',
    colName: '創作者', colTier: '等級', colDna: 'DNA', colJoined: '加入日期', colActions: '操作',
    dnaPublished: '已發佈', dnaDraft: '草稿', dnaNone: '無',
    actActivate: '啟用', actSuspend: '停用', actBan: '封禁', actReinstate: '恢復',
    actVerify: '驗證', actUnverify: '取消驗證', actNote: '加入備註', actApply: '套用', actCancel: '取消',
    reasonPlaceholder: '原因（必填）', notePlaceholder: '備註（必填）',
    confirmBan: '封禁此創作者？這是永久狀態。', confirmReinstate: '恢復這位已封禁的創作者？',
    bulkApply: '套用至已選', bulkSelected: '已選', bulkChooseAction: '選擇操作',
    actionFailed: '操作失敗，請重試。',
```

`zh-tw.ts`:
```ts
    dirSearch: '搜尋名稱或帳號', dirStatus: '狀態', dirTier: '等級', dirDna: 'DNA', dirVerifiedOnly: '僅顯示已驗證',
    dirAll: '全部', dirLoadMore: '載入更多', dirEmpty: '沒有符合篩選的創作者',
    colName: '創作者', colTier: '等級', colDna: 'DNA', colJoined: '加入日期', colActions: '操作',
    dnaPublished: '已發布', dnaDraft: '草稿', dnaNone: '無',
    actActivate: '啟用', actSuspend: '停權', actBan: '封鎖', actReinstate: '恢復',
    actVerify: '驗證', actUnverify: '取消驗證', actNote: '新增備註', actApply: '套用', actCancel: '取消',
    reasonPlaceholder: '原因（必填）', notePlaceholder: '備註（必填）',
    confirmBan: '封鎖此創作者？這是永久狀態。', confirmReinstate: '恢復這位已封鎖的創作者？',
    bulkApply: '套用至已選', bulkSelected: '已選', bulkChooseAction: '選擇操作',
    actionFailed: '操作失敗，請重試。',
```

`zh-cn.ts`:
```ts
    dirSearch: '搜索名称或账号', dirStatus: '状态', dirTier: '等级', dirDna: 'DNA', dirVerifiedOnly: '仅显示已验证',
    dirAll: '全部', dirLoadMore: '加载更多', dirEmpty: '没有符合筛选的创作者',
    colName: '创作者', colTier: '等级', colDna: 'DNA', colJoined: '加入日期', colActions: '操作',
    dnaPublished: '已发布', dnaDraft: '草稿', dnaNone: '无',
    actActivate: '启用', actSuspend: '停用', actBan: '封禁', actReinstate: '恢复',
    actVerify: '验证', actUnverify: '取消验证', actNote: '添加备注', actApply: '应用', actCancel: '取消',
    reasonPlaceholder: '原因（必填）', notePlaceholder: '备注（必填）',
    confirmBan: '封禁此创作者？这是永久状态。', confirmReinstate: '恢复这位已封禁的创作者？',
    bulkApply: '应用到已选', bulkSelected: '已选', bulkChooseAction: '选择操作',
    actionFailed: '操作失败，请重试。',
```

`ja.ts`:
```ts
    dirSearch: '名前またはハンドルで検索', dirStatus: 'ステータス', dirTier: 'ティア', dirDna: 'DNA', dirVerifiedOnly: '認証済みのみ',
    dirAll: 'すべて', dirLoadMore: 'さらに読み込む', dirEmpty: '条件に一致するクリエイターがいません',
    colName: 'クリエイター', colTier: 'ティア', colDna: 'DNA', colJoined: '登録日', colActions: '操作',
    dnaPublished: '公開', dnaDraft: '下書き', dnaNone: 'なし',
    actActivate: '有効化', actSuspend: '停止', actBan: '禁止', actReinstate: '復帰',
    actVerify: '認証', actUnverify: '認証解除', actNote: 'メモを追加', actApply: '適用', actCancel: 'キャンセル',
    reasonPlaceholder: '理由（必須）', notePlaceholder: 'メモ（必須）',
    confirmBan: 'このクリエイターを禁止しますか？これは永久的な状態です。', confirmReinstate: 'この禁止されたクリエイターを復帰させますか？',
    bulkApply: '選択に適用', bulkSelected: '選択中', bulkChooseAction: '操作を選択',
    actionFailed: '操作に失敗しました。もう一度お試しください。',
```

`ko.ts`:
```ts
    dirSearch: '이름 또는 핸들 검색', dirStatus: '상태', dirTier: '등급', dirDna: 'DNA', dirVerifiedOnly: '인증됨만',
    dirAll: '전체', dirLoadMore: '더 보기', dirEmpty: '필터에 맞는 크리에이터가 없습니다',
    colName: '크리에이터', colTier: '등급', colDna: 'DNA', colJoined: '가입일', colActions: '작업',
    dnaPublished: '게시됨', dnaDraft: '초안', dnaNone: '없음',
    actActivate: '활성화', actSuspend: '정지', actBan: '차단', actReinstate: '복구',
    actVerify: '인증', actUnverify: '인증 해제', actNote: '메모 추가', actApply: '적용', actCancel: '취소',
    reasonPlaceholder: '사유 (필수)', notePlaceholder: '메모 (필수)',
    confirmBan: '이 크리에이터를 차단하시겠습니까? 영구적인 상태입니다.', confirmReinstate: '차단된 이 크리에이터를 복구하시겠습니까?',
    bulkApply: '선택 항목에 적용', bulkSelected: '선택됨', bulkChooseAction: '작업 선택',
    actionFailed: '작업에 실패했습니다. 다시 시도하세요.',
```

`th.ts`:
```ts
    dirSearch: 'ค้นหาชื่อหรือแฮนเดิล', dirStatus: 'สถานะ', dirTier: 'ระดับ', dirDna: 'DNA', dirVerifiedOnly: 'เฉพาะที่ยืนยันแล้ว',
    dirAll: 'ทั้งหมด', dirLoadMore: 'โหลดเพิ่ม', dirEmpty: 'ไม่มีครีเอเตอร์ที่ตรงกับตัวกรอง',
    colName: 'ครีเอเตอร์', colTier: 'ระดับ', colDna: 'DNA', colJoined: 'วันที่เข้าร่วม', colActions: 'การดำเนินการ',
    dnaPublished: 'เผยแพร่แล้ว', dnaDraft: 'ฉบับร่าง', dnaNone: 'ไม่มี',
    actActivate: 'เปิดใช้งาน', actSuspend: 'ระงับ', actBan: 'แบน', actReinstate: 'คืนสถานะ',
    actVerify: 'ยืนยัน', actUnverify: 'ยกเลิกการยืนยัน', actNote: 'เพิ่มบันทึก', actApply: 'ใช้', actCancel: 'ยกเลิก',
    reasonPlaceholder: 'เหตุผล (จำเป็น)', notePlaceholder: 'บันทึก (จำเป็น)',
    confirmBan: 'แบนครีเอเตอร์นี้? นี่เป็นสถานะถาวร', confirmReinstate: 'คืนสถานะครีเอเตอร์ที่ถูกแบนนี้?',
    bulkApply: 'ใช้กับรายการที่เลือก', bulkSelected: 'เลือกแล้ว', bulkChooseAction: 'เลือกการดำเนินการ',
    actionFailed: 'การดำเนินการล้มเหลว ลองอีกครั้ง',
```

- [ ] **Step 5: Verify parity + typecheck green**

Run: `pnpm exec vitest run tests/i18n.locale-parity.test.ts --reporter=dot` then `pnpm exec tsc --noEmit`
Expected: PASS — identical keys across locales; interface satisfied.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/i18n/messages
git commit -m "i18n(web): add creators directory + moderation strings (Phase 10B)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `CreatorsDirectoryView` (client component)

**Files:**
- Create: `apps/web/components/kinnso/admin/creators/CreatorsDirectoryView.tsx`
- Test: `apps/web/tests/kinnso.CreatorsDirectoryView.test.tsx`

This is a `'use client'` component. Filters/search update the URL via `router.push` (so the server re-fetches); per-row actions reveal an inline reason input then call the passed server action; a bulk bar applies a status to checked rows. Mirror the optimistic + `router.refresh()` pattern from `AdminUsersView`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { CreatorsDirectoryView } from '@/components/kinnso/admin/creators/CreatorsDirectoryView'
import type { CreatorsDirectory } from '@/lib/admin/creators-queries'

const pushMock = vi.fn()
const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
  usePathname: () => '/en/admin/creators/directory',
  useSearchParams: () => new URLSearchParams(''),
}))

afterEach(cleanup)
beforeEach(() => { pushMock.mockReset(); refreshMock.mockReset() })

const data: CreatorsDirectory = {
  rows: [
    { id: 'c1', displayName: 'Mia', handle: 'mia', status: 'active', verified: true, tier: 'pro', dnaStatus: 'published', contributionPoints: 320, createdAt: '2026-06-28T10:00:00Z' },
    { id: 'c2', displayName: null, handle: 'lee', status: 'banned', verified: false, tier: null, dnaStatus: null, contributionPoints: 0, createdAt: '2026-06-27T10:00:00Z' },
  ],
  nextCursor: null,
}

const actions = {
  setCreatorStatus: vi.fn(async () => ({ ok: true as const, id: 'c1', status: 'suspended' as const })),
  reinstateCreator: vi.fn(async () => ({ ok: true as const, id: 'c2', status: 'active' as const })),
  setCreatorVerified: vi.fn(async () => ({ ok: true as const, id: 'c1', verified: false })),
  addCreatorNote: vi.fn(async () => ({ ok: true as const, id: 'c1' })),
  bulkSetCreatorStatus: vi.fn(async () => ({ ok: true as const, count: 1 })),
}

function renderView() {
  return render(<CreatorsDirectoryView t={en.creators} locale="en" data={data} actions={actions} />)
}

describe('CreatorsDirectoryView', () => {
  it('renders a row per creator with name/handle and status', () => {
    renderView()
    expect(screen.getByText('Mia')).toBeTruthy()
    expect(screen.getByText('lee')).toBeTruthy()
    expect(screen.getByText(en.creators.statusBanned)).toBeTruthy()
  })
  it('shows Suspend for an active creator and requires a reason before calling the action', async () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: `${en.creators.actSuspend} Mia` }))
    // reason input appears; Apply is disabled until a reason is entered
    const reason = screen.getByPlaceholderText(en.creators.reasonPlaceholder)
    fireEvent.change(reason, { target: { value: 'spam' } })
    fireEvent.click(screen.getByRole('button', { name: en.creators.actApply }))
    await waitFor(() => expect(actions.setCreatorStatus).toHaveBeenCalledWith('en', 'c1', 'suspended', 'spam'))
  })
  it('shows Reinstate (not Activate) for a banned creator', () => {
    renderView()
    expect(screen.getByRole('button', { name: `${en.creators.actReinstate} lee` })).toBeTruthy()
    expect(screen.queryByRole('button', { name: `${en.creators.actActivate} lee` })).toBeNull()
  })
  it('updates the URL query when searching', () => {
    renderView()
    fireEvent.change(screen.getByPlaceholderText(en.creators.dirSearch), { target: { value: 'mi' } })
    fireEvent.submit(screen.getByTestId('directory-search-form'))
    expect(pushMock).toHaveBeenCalled()
    expect(String(pushMock.mock.calls[0][0])).toContain('q=mi')
  })
  it('applies a bulk status to checked rows', async () => {
    renderView()
    fireEvent.click(screen.getByLabelText('Select Mia'))
    fireEvent.change(screen.getByTestId('bulk-action-select'), { target: { value: 'suspended' } })
    fireEvent.change(screen.getByTestId('bulk-reason'), { target: { value: 'cleanup' } })
    fireEvent.click(screen.getByRole('button', { name: en.creators.bulkApply }))
    await waitFor(() => expect(actions.bulkSetCreatorStatus).toHaveBeenCalledWith('en', ['c1'], 'suspended', 'cleanup'))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/kinnso.CreatorsDirectoryView.test.tsx --reporter=dot`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
'use client'
import { useMemo, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { CreatorsDirectory } from '@/lib/admin/creators-queries'
import type { ActionResult } from '@/lib/admin/result'
import type { CreatorStatus } from '@/lib/admin/creators-validation'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { StatusBadge, TierBadge, VerifiedBadge } from '@/components/kinnso/admin/creators/badges'

type T = Messages['creators']

export interface DirectoryActions {
  setCreatorStatus: (locale: Locale, id: string, status: CreatorStatus, reason: string) => Promise<ActionResult<{ id: string; status: CreatorStatus }>>
  reinstateCreator: (locale: Locale, id: string, reason: string) => Promise<ActionResult<{ id: string; status: 'active' }>>
  setCreatorVerified: (locale: Locale, id: string, verified: boolean, reason: string) => Promise<ActionResult<{ id: string; verified: boolean }>>
  addCreatorNote: (locale: Locale, id: string, note: string) => Promise<ActionResult<{ id: string }>>
  bulkSetCreatorStatus: (locale: Locale, ids: string[], status: CreatorStatus, reason: string) => Promise<ActionResult<{ count: number }>>
}

type Pending = { id: string; kind: 'status' | 'reinstate' | 'verify' | 'note'; status?: CreatorStatus; verified?: boolean } | null

export function CreatorsDirectoryView({ t, locale, data, actions }: { t: T; locale: Locale; data: CreatorsDirectory; actions: DirectoryActions }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [search, setSearch] = useState(params.get('q') ?? '')
  const [pending, setPending] = useState<Pending>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<'' | CreatorStatus>('')
  const [bulkReason, setBulkReason] = useState('')

  const setQuery = (mut: (sp: URLSearchParams) => void) => {
    const sp = new URLSearchParams(params.toString())
    mut(sp)
    router.push(`${pathname}?${sp.toString()}`)
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    setQuery((sp) => { search ? sp.set('q', search) : sp.delete('q') })
  }

  function startAction(p: NonNullable<Pending>) {
    setPending(p)
    setReason('')
    setRowError((m) => ({ ...m, [p.id]: '' }))
  }

  async function applyPending() {
    if (!pending) return
    setBusy(true)
    let res: ActionResult<Record<string, unknown>>
    if (pending.kind === 'status') res = await actions.setCreatorStatus(locale, pending.id, pending.status!, reason)
    else if (pending.kind === 'reinstate') res = await actions.reinstateCreator(locale, pending.id, reason)
    else if (pending.kind === 'verify') res = await actions.setCreatorVerified(locale, pending.id, pending.verified!, reason)
    else res = await actions.addCreatorNote(locale, pending.id, reason)
    setBusy(false)
    if (res.ok) {
      setPending(null)
      router.refresh()
    } else {
      setRowError((m) => ({ ...m, [pending.id]: res.errors.form?.[0] ?? t.actionFailed }))
    }
  }

  async function applyBulk() {
    if (!bulkStatus || checked.size === 0) return
    setBusy(true)
    const res = await actions.bulkSetCreatorStatus(locale, [...checked], bulkStatus, bulkReason)
    setBusy(false)
    if (res.ok) {
      setChecked(new Set())
      setBulkStatus('')
      setBulkReason('')
      router.refresh()
    }
  }

  const reasonValid = reason.trim().length > 0
  const isNote = pending?.kind === 'note'

  return (
    <main>
      <h1 className="k-display">{t.title}</h1>

      <form data-testid="directory-search-form" onSubmit={onSearch} className="mt-6 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.dirSearch}
          className="k-input max-w-sm"
          aria-label={t.dirSearch}
        />
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select aria-label={t.dirStatus} defaultValue={params.get('status') ?? ''}
          onChange={(e) => setQuery((sp) => { e.target.value ? sp.set('status', e.target.value) : sp.delete('status') })}
          className="rounded-full border border-kinnso-line px-3 py-2 text-sm font-bold text-kinnso-ink">
          <option value="">{t.dirStatus}: {t.dirAll}</option>
          <option value="onboarding">{t.statusOnboarding}</option>
          <option value="active">{t.statusActive}</option>
          <option value="suspended">{t.statusSuspended}</option>
          <option value="banned">{t.statusBanned}</option>
        </select>
        <select aria-label={t.dirTier} defaultValue={params.get('tier') ?? ''}
          onChange={(e) => setQuery((sp) => { e.target.value ? sp.set('tier', e.target.value) : sp.delete('tier') })}
          className="rounded-full border border-kinnso-line px-3 py-2 text-sm font-bold text-kinnso-ink">
          <option value="">{t.dirTier}: {t.dirAll}</option>
          <option value="seed">{t.tierSeed}</option>
          <option value="rising">{t.tierRising}</option>
          <option value="pro">{t.tierPro}</option>
          <option value="elite">{t.tierElite}</option>
        </select>
        <select aria-label={t.dirDna} defaultValue={params.get('dna') ?? ''}
          onChange={(e) => setQuery((sp) => { e.target.value ? sp.set('dna', e.target.value) : sp.delete('dna') })}
          className="rounded-full border border-kinnso-line px-3 py-2 text-sm font-bold text-kinnso-ink">
          <option value="">{t.dirDna}: {t.dirAll}</option>
          <option value="published">{t.dnaPublished}</option>
          <option value="draft">{t.dnaDraft}</option>
          <option value="none">{t.dnaNone}</option>
        </select>
        <label className="flex items-center gap-2 text-sm font-bold text-kinnso-ink">
          <input type="checkbox" defaultChecked={params.get('verified') === 'true'}
            onChange={(e) => setQuery((sp) => { e.target.checked ? sp.set('verified', 'true') : sp.delete('verified') })} />
          {t.dirVerifiedOnly}
        </label>
      </div>

      {checked.size > 0 && (
        <TicketCard className="mt-4 flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-bold text-kinnso-ink">{checked.size} {t.bulkSelected}</span>
          <select data-testid="bulk-action-select" value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as '' | CreatorStatus)}
            aria-label={t.bulkChooseAction}
            className="rounded-full border border-kinnso-line px-3 py-2 text-sm font-bold text-kinnso-ink">
            <option value="">{t.bulkChooseAction}</option>
            <option value="active">{t.actActivate}</option>
            <option value="suspended">{t.actSuspend}</option>
            <option value="banned">{t.actBan}</option>
          </select>
          <input data-testid="bulk-reason" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)}
            placeholder={t.reasonPlaceholder} className="k-input max-w-xs" aria-label={t.reasonPlaceholder} />
          <button onClick={applyBulk} disabled={busy || !bulkStatus || bulkReason.trim().length === 0}
            className="rounded-full border border-kinnso-line px-4 py-2 text-sm font-bold text-kinnso-ink disabled:opacity-50">
            {t.bulkApply}
          </button>
        </TicketCard>
      )}

      {data.rows.length === 0 ? (
        <p className="mt-6 text-kinnso-muted">{t.dirEmpty}</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {data.rows.map((row) => {
            const name = row.displayName || row.handle || '—'
            const banned = row.status === 'banned'
            const active = row.status === 'active'
            const showActivate = row.status === 'onboarding' || row.status === 'suspended'
            return (
              <TicketCard key={row.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <input type="checkbox" aria-label={`Select ${name}`}
                    checked={checked.has(row.id)}
                    onChange={(e) => setChecked((s) => { const n = new Set(s); e.target.checked ? n.add(row.id) : n.delete(row.id); return n })} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-kinnso-ink">{name} {row.handle ? <span className="text-kinnso-muted">@{row.handle}</span> : null}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <StatusBadge status={row.status} t={t} />
                      {row.tier ? <TierBadge tier={row.tier} t={t} /> : null}
                      <VerifiedBadge verified={row.verified} t={t} />
                      <span className="text-kinnso-muted">{t.colDna}: {row.dnaStatus ? (row.dnaStatus === 'published' ? t.dnaPublished : t.dnaDraft) : t.dnaNone}</span>
                      <span className="text-kinnso-muted">{t.colJoined} {new Date(row.createdAt).toLocaleDateString(locale)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {showActivate && <button onClick={() => startAction({ id: row.id, kind: 'status', status: 'active' })}
                      aria-label={`${t.actActivate} ${name}`} className="k-chip">{t.actActivate}</button>}
                    {active && <button onClick={() => startAction({ id: row.id, kind: 'status', status: 'suspended' })}
                      aria-label={`${t.actSuspend} ${name}`} className="k-chip">{t.actSuspend}</button>}
                    {(active || row.status === 'suspended') && <button onClick={() => startAction({ id: row.id, kind: 'status', status: 'banned' })}
                      aria-label={`${t.actBan} ${name}`} className="k-chip">{t.actBan}</button>}
                    {banned && <button onClick={() => startAction({ id: row.id, kind: 'reinstate' })}
                      aria-label={`${t.actReinstate} ${name}`} className="k-chip">{t.actReinstate}</button>}
                    <button onClick={() => startAction({ id: row.id, kind: 'verify', verified: !row.verified })}
                      aria-label={`${row.verified ? t.actUnverify : t.actVerify} ${name}`} className="k-chip">
                      {row.verified ? t.actUnverify : t.actVerify}
                    </button>
                    <button onClick={() => startAction({ id: row.id, kind: 'note' })}
                      aria-label={`${t.actNote} ${name}`} className="k-chip">{t.actNote}</button>
                  </div>
                </div>

                {pending?.id === row.id && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-kinnso-line pt-3">
                    {pending.kind === 'status' && pending.status === 'banned' ? <p className="w-full text-sm text-red-600">{t.confirmBan}</p> : null}
                    {pending.kind === 'reinstate' ? <p className="w-full text-sm text-kinnso-ink">{t.confirmReinstate}</p> : null}
                    <input value={reason} onChange={(e) => setReason(e.target.value)}
                      placeholder={isNote ? t.notePlaceholder : t.reasonPlaceholder}
                      aria-label={isNote ? t.notePlaceholder : t.reasonPlaceholder}
                      className="k-input max-w-sm" />
                    <button onClick={applyPending} disabled={busy || !reasonValid}
                      className="rounded-full border border-kinnso-line px-4 py-2 text-sm font-bold text-kinnso-ink disabled:opacity-50">{t.actApply}</button>
                    <button onClick={() => setPending(null)} disabled={busy}
                      className="rounded-full px-4 py-2 text-sm font-bold text-kinnso-muted">{t.actCancel}</button>
                  </div>
                )}
                {rowError[row.id] ? <p className="mt-2 text-sm text-red-600">{rowError[row.id]}</p> : null}
              </TicketCard>
            )
          })}
        </div>
      )}

      {data.nextCursor && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setQuery((sp) => { sp.set('cursor_at', data.nextCursor!.createdAt); sp.set('cursor_id', data.nextCursor!.id) })}
            className="rounded-full border border-kinnso-line px-5 py-2.5 text-sm font-bold text-kinnso-ink">{t.dirLoadMore}</button>
        </div>
      )}
    </main>
  )
}

export default CreatorsDirectoryView
```

(`useMemo` import is used by the bundler tree-shake guard; if ESLint flags it as unused, remove it. The component compiles without it — keep imports honest: if not used, delete the `useMemo` token from the import.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/kinnso.CreatorsDirectoryView.test.tsx --reporter=dot`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/admin/creators/CreatorsDirectoryView.tsx apps/web/tests/kinnso.CreatorsDirectoryView.test.tsx
git commit -m "feat(web): add CreatorsDirectoryView with filters + moderation (Phase 10B)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Directory route + host test

**Files:**
- Create: `apps/web/app/[locale]/admin/creators/directory/page.tsx`
- Test: `apps/web/tests/admin.creators-directory.host.test.tsx`

- [ ] **Step 1: Write the failing host test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
const { roleMock, getUserMock, dirMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  dirMock: vi.fn(async () => ({
    rows: [{ id: 'c1', displayName: 'Mia', handle: 'mia', status: 'active', verified: false, tier: 'pro', dnaStatus: 'published', contributionPoints: 5, createdAt: '2026-06-28T00:00:00Z' }],
    nextCursor: null,
  })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/admin/creators/directory',
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/admin/creators-queries', () => ({ listCreatorsDirectory: dirMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import CreatorsDirectoryPage from '@/app/[locale]/admin/creators/directory/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }); dirMock.mockClear() })

describe('admin creators directory host', () => {
  it('renders the directory for ops and forwards normalized filters', async () => {
    const ui = await CreatorsDirectoryPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ q: 'mia', status: 'active', verified: 'true' }) })
    render(ui)
    expect(screen.getByText('Mia')).toBeTruthy()
    expect(dirMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ search: 'mia', statuses: ['active'], verified: true }))
  })
  it('notFounds for a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(CreatorsDirectoryPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('redirects an anonymous user', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(CreatorsDirectoryPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/admin.creators-directory.host.test.tsx --reporter=dot`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the page**

```tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { listCreatorsDirectory } from '@/lib/admin/creators-queries'
import { normalizeDirectoryParams } from '@/lib/admin/creators-validation'
import { CreatorsDirectoryView } from '@/components/kinnso/admin/creators/CreatorsDirectoryView'
import { setCreatorStatus, reinstateCreator, setCreatorVerified, addCreatorNote, bulkSetCreatorStatus } from '@/lib/admin/creators-actions'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Search = { q?: string; status?: string; tier?: string; dna?: string; verified?: string; cursor_at?: string; cursor_id?: string }

export default async function CreatorsDirectoryPage({
  params, searchParams,
}: { params: Promise<{ locale: string }>; searchParams: Promise<Search> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const sp = await searchParams
  const filters = normalizeDirectoryParams(sp)
  const cursor = sp.cursor_at && sp.cursor_id ? { createdAt: sp.cursor_at, id: sp.cursor_id } : null
  const data = await listCreatorsDirectory(supabase, { ...filters, cursor, limit: 25 })
  return (
    <CreatorsDirectoryView
      t={messages.creators}
      locale={loc}
      data={data}
      actions={{ setCreatorStatus, reinstateCreator, setCreatorVerified, addCreatorNote, bulkSetCreatorStatus }}
    />
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/admin.creators-directory.host.test.tsx --reporter=dot`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/[locale]/admin/creators/directory/page.tsx" apps/web/tests/admin.creators-directory.host.test.tsx
git commit -m "feat(web): add creators directory route (Phase 10B)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Sub-nav (Overview · Directory) + full verification

**Files:**
- Modify: `apps/web/components/kinnso/admin/creators/CreatorsOverviewView.tsx` and `CreatorsDirectoryView.tsx` — add a small shared tab strip, OR add it once. To avoid duplication, create `apps/web/components/kinnso/admin/creators/CreatorsTabs.tsx`.
- Create: `apps/web/components/kinnso/admin/creators/CreatorsTabs.tsx`
- Test: `apps/web/tests/kinnso.CreatorsTabs.test.tsx`

The Creators section now has two routes; add a tab strip so ops can move between Overview and Directory. (Payouts tab is added in 10D.)

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { CreatorsTabs } from '@/components/kinnso/admin/creators/CreatorsTabs'

vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin/creators/directory' }))
afterEach(cleanup)

describe('CreatorsTabs', () => {
  it('renders Overview + Directory links and marks the active one', () => {
    render(<CreatorsTabs t={en.creators} locale="en" />)
    const overview = screen.getByRole('link', { name: en.creators.tabOverview }) as HTMLAnchorElement
    const directory = screen.getByRole('link', { name: en.creators.tabDirectory }) as HTMLAnchorElement
    expect(overview.getAttribute('href')).toBe('/en/admin/creators')
    expect(directory.getAttribute('href')).toBe('/en/admin/creators/directory')
    expect(directory.getAttribute('aria-current')).toBe('page')
  })
})
```

- [ ] **Step 2: Add the two tab keys to i18n (all 7 locales) and run the test RED**

Add to the `creators` interface in `en.ts`: `tabOverview: string; tabDirectory: string`. Add values:
- en: `tabOverview: 'Overview', tabDirectory: 'Directory',`
- zh-hk: `tabOverview: '概覽', tabDirectory: '目錄',`
- zh-tw: `tabOverview: '總覽', tabDirectory: '目錄',`
- zh-cn: `tabOverview: '概览', tabDirectory: '目录',`
- ja: `tabOverview: '概要', tabDirectory: 'ディレクトリ',`
- ko: `tabOverview: '개요', tabDirectory: '디렉터리',`
- th: `tabOverview: 'ภาพรวม', tabDirectory: 'ไดเรกทอรี',`

Run: `pnpm exec vitest run tests/kinnso.CreatorsTabs.test.tsx --reporter=dot` → FAIL (module not found).

- [ ] **Step 3: Write `CreatorsTabs.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'

export function CreatorsTabs({ t, locale }: { t: Messages['creators']; locale: Locale }) {
  const pathname = usePathname()
  const tabs = [
    { href: `/${locale}/admin/creators`, label: t.tabOverview },
    { href: `/${locale}/admin/creators/directory`, label: t.tabDirectory },
  ]
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

export default CreatorsTabs
```

- [ ] **Step 4: Render the tabs in both views**

In `CreatorsOverviewView.tsx`, add the import `import { CreatorsTabs } from '@/components/kinnso/admin/creators/CreatorsTabs'` and render `<CreatorsTabs t={t} locale={locale} />` immediately inside `<main>` before the `<h1>`. This requires passing `locale` into the Overview view — add `locale: Locale` to its props and pass it from `app/[locale]/admin/creators/page.tsx` (`<CreatorsOverviewView t={messages.creators} locale={loc} overview={overview} />`), importing `type { Locale }`. Update the existing `kinnso.CreatorsOverviewView.test.tsx` render calls to pass `locale="en"` and add the `usePathname` mock (`vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin/creators' }))`).

In `CreatorsDirectoryView.tsx`, add the same import and render `<CreatorsTabs t={t} locale={locale} />` inside `<main>` before the `<h1>` (it already receives `locale`).

- [ ] **Step 5: Run the affected tests + full gate**

Run from `apps/web`:
```
pnpm exec vitest run tests/kinnso.CreatorsTabs.test.tsx tests/kinnso.CreatorsOverviewView.test.tsx tests/kinnso.CreatorsDirectoryView.test.tsx tests/i18n.locale-parity.test.ts --reporter=dot
pnpm exec tsc --noEmit
pnpm exec eslint .
```
Expected: all tests PASS, typecheck clean, lint 0 errors (warnings only in pre-existing files).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/admin/creators apps/web/app apps/web/lib/i18n/messages apps/web/tests
git commit -m "feat(web): add Creators sub-nav tabs (Overview/Directory) (Phase 10B)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review against the spec

- **§4 lifecycle (option C):** `banned` added to status CHECK + `verified` column (Task 1). Transitions enforced in `admin_set_creator_status`; reinstate is the distinct extra-guarded `admin_reinstate_creator` (banned→active only); verify is independent. Every change requires a reason and writes `ops_audit_log` with `{from,to}`/`{verified}`. ✓
- **§5 10B files:** `directory/page.tsx` (Task 7), `listCreatorsDirectory` (Task 4), `creators-actions.ts` with all five actions (Task 3), `creators-validation.ts` (Task 2), `CreatorsDirectoryView.tsx` (Task 6). ✓
- **§5 `admin_search_creators`:** search + status[]/tier[]/dna/verified filters + keyset pagination on `(created_at,id)` (Task 1). ✓ (Arbitrary-column sort deferred — documented in Scope notes.)
- **§5 10B tests:** queries (filters/sort/pagination/search), actions (each transition incl. ban→reinstate guard, verify, note→audit, bulk; ActionResult shapes; reason-required failures), validation, host + view. ✓ (Audit-write coverage is exercised through the action tests + the RPC's `ops_audit_log_append` call; a dedicated `admin.audit.test.ts` already exists from 10A.)
- **§7 verified on public surfaces:** **deliberately deferred** out of 10B (flagged in Scope notes) — a public/brand decision; 10B exposes verified to ops only. No RLS change needed (anon already has table-wide SELECT).
- **Placeholder scan:** every code step has full code; the only conditional note (`useMemo` import) gives an explicit instruction. ✓
- **Type consistency:** `CreatorStatus`, `DirectoryRow`/`CreatorsDirectory`/`ListDirectoryParams`, `DirectoryActions`, the RPC names + arg shapes, and the i18n keys are defined once and reused identically across tasks. The Overview view gains a `locale` prop (Task 8) — its existing test is updated in the same task. ✓
```
