# Phase 11B — Merchants Operator Console: Directory + Audited Lifecycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A Merchants **Directory** tab (search / filter / sortable, keyset-paginated) with per-row + bulk **audited, reason-required** lifecycle actions (status, tier, note), backed by five new `is_active_ops()`-gated RPCs.

**Architecture:** Exact mirror of the Phase 10B Creators Directory. Audited writes go through SECURITY DEFINER RPCs that lock the row, validate, mutate, and append `ops_audit_log` (`entity_type='merchant'`) in one transaction. The client Directory view holds optimistic state + a reason-gated confirm dialog. **This slice is purely ADDITIVE** — it does NOT drop the old 2-arg `admin_set_merchant_tier` and does NOT touch `/admin/users`; that de-control + drop happens in 11C once the Merchant 360 (the link target) exists. The new audited `admin_set_merchant_tier(uuid,text,text)` coexists as an overload alongside the old 2-arg version for this slice.

**Tech Stack:** Next.js 16 RSC, React 19, TS, Tailwind v4, Supabase SECURITY DEFINER RPCs, Vitest 4, custom i18n (7 locales).

**Spec:** `docs/superpowers/specs/2026-06-30-phase11-merchants-operator-console-design.md` (§4 11B rows, §5, §10). **Plan/pattern source of truth:** the Creators console — `supabase/migrations/20260629110000_creator_lifecycle_and_search.sql`, `apps/web/lib/admin/creators-{validation,actions,queries}.ts`, `apps/web/components/kinnso/admin/creators/CreatorsDirectoryView.tsx`, `apps/web/app/[locale]/admin/creators/directory/page.tsx`, and the tests `apps/web/tests/admin.creators-{actions,directory-queries,directory.host}.test.*`. Read these as your structural template; this plan gives the exact merchant deltas.

**Working dir:** repo clone, branch `feat/merchants-console` (cut fresh from `main` @ `ae3b76c` = post-11A). All `apps/web/…` paths relative to repo root unless noted.

**Merchant domain facts:** `merchant_profiles(id, company_name, contact_name, contact_email[PII], website_url, status ∈ {active,paused,suspended,archived}, tier ∈ {free,growth}, created_at, updated_at)`. No `verified` flag (trust = tier). No linear lifecycle → the status setter validates the target is a valid status (no transition matrix) + reason + no-op guard. i18n group is **`merchantsOps`** (already exists from 11A — extend it).

---

## File Structure

**Create:**
- `apps/web/lib/admin/ops-validation.ts` — shared `validateReason` + `validateBulkIds` (moved out of creators-validation).
- `apps/web/lib/admin/merchants-validation.ts` — merchant status/tier guards + directory-param normalizer.
- `supabase/migrations/20260630130000_merchant_ops_lifecycle_and_search.sql` — 5 RPCs.
- `apps/web/lib/admin/merchants-actions.ts` — 4 audited server actions.
- `apps/web/components/kinnso/admin/merchants/MerchantsDirectoryView.tsx` — Directory UI.
- `apps/web/components/kinnso/admin/merchants/badges.tsx` — MerchantStatusBadge, MerchantTierBadge.
- `apps/web/app/[locale]/admin/merchants/directory/page.tsx` — Directory route.
- Tests: `apps/web/tests/admin.merchants-validation.test.ts`, `admin.merchants-actions.test.ts`, `admin.merchants-directory-queries.test.ts`, `kinnso.MerchantsDirectoryView.test.tsx`, `admin.merchants-directory.host.test.tsx`.

**Modify:**
- `apps/web/lib/admin/creators-validation.ts` — re-export `validateReason`/`validateBulkIds` from ops-validation (so creators-actions imports keep working).
- `apps/web/lib/admin/merchants-queries.ts` — add `listMerchantsDirectory` + types.
- `packages/db/types.ts` — add 5 RPC entries.
- `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` — extend `merchantsOps` with directory keys.

---

## Task 1: Extract shared `ops-validation.ts`

**Files:** Create `apps/web/lib/admin/ops-validation.ts`; modify `apps/web/lib/admin/creators-validation.ts`.

- [ ] **Step 1: Create `ops-validation.ts`** (move the two helpers verbatim)

```ts
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
```

- [ ] **Step 2: In `creators-validation.ts`, delete the two local function bodies and re-export from ops-validation**

Replace the `validateReason` and `validateBulkIds` function definitions (lines ~12-22) with:
```ts
export { validateReason, validateBulkIds } from '@/lib/admin/ops-validation'
```
(Keep everything else in creators-validation unchanged.)

- [ ] **Step 3: Verify creators suites still pass + typecheck**

Run: `pnpm --filter web test -- admin.creators-actions admin.creators-validation && pnpm --filter web typecheck`
Expected: PASS (re-export is transparent).

- [ ] **Step 4: Commit**
```bash
git add apps/web/lib/admin/ops-validation.ts apps/web/lib/admin/creators-validation.ts
git commit -m "refactor(web): extract shared validateReason/validateBulkIds to ops-validation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `merchants-validation.ts` (TDD)

**Files:** Create `apps/web/lib/admin/merchants-validation.ts`; test `apps/web/tests/admin.merchants-validation.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { isMerchantStatus, isMerchantTier, normalizeMerchantDirectoryParams, MERCHANT_STATUSES, MERCHANT_TIERS } from '@/lib/admin/merchants-validation'

describe('merchants-validation', () => {
  it('recognizes valid statuses and tiers', () => {
    expect(MERCHANT_STATUSES).toEqual(['active', 'paused', 'suspended', 'archived'])
    expect(MERCHANT_TIERS).toEqual(['free', 'growth'])
    expect(isMerchantStatus('suspended')).toBe(true)
    expect(isMerchantStatus('banned')).toBe(false)
    expect(isMerchantTier('growth')).toBe(true)
    expect(isMerchantTier('pro')).toBe(false)
  })
  it('normalizes directory params, dropping invalid values', () => {
    expect(normalizeMerchantDirectoryParams({ q: '  acme ', status: 'active,bogus', tier: 'growth,free' }))
      .toEqual({ search: 'acme', statuses: ['active'], tiers: ['growth', 'free'] })
    expect(normalizeMerchantDirectoryParams({})).toEqual({ search: undefined, statuses: undefined, tiers: undefined })
  })
})
```

- [ ] **Step 2: Run → FAIL** — `pnpm --filter web test -- admin.merchants-validation`

- [ ] **Step 3: Implement** `merchants-validation.ts`

```ts
export const MERCHANT_STATUSES = ['active', 'paused', 'suspended', 'archived'] as const
export type MerchantStatus = (typeof MERCHANT_STATUSES)[number]
export const MERCHANT_TIERS = ['free', 'growth'] as const
export type MerchantTier = (typeof MERCHANT_TIERS)[number]

export function isMerchantStatus(s: string): s is MerchantStatus {
  return (MERCHANT_STATUSES as readonly string[]).includes(s)
}
export function isMerchantTier(s: string): s is MerchantTier {
  return (MERCHANT_TIERS as readonly string[]).includes(s)
}

export interface MerchantDirectoryParams {
  search?: string
  statuses?: string[]
  tiers?: string[]
}
type RawSearchParams = { q?: string; status?: string; tier?: string }

const csv = (v: string | undefined, allowed: readonly string[]): string[] | undefined => {
  if (!v) return undefined
  const parts = v.split(',').map((s) => s.trim()).filter((s) => allowed.includes(s))
  return parts.length ? parts : undefined
}

/** Map raw URL search params to validated RPC inputs (invalid values dropped). */
export function normalizeMerchantDirectoryParams(raw: RawSearchParams): MerchantDirectoryParams {
  return {
    search: raw.q?.trim() || undefined,
    statuses: csv(raw.status, MERCHANT_STATUSES),
    tiers: csv(raw.tier, MERCHANT_TIERS),
  }
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** (`feat(web): merchants-validation status/tier guards + directory params`).

---

## Task 3: Merchant lifecycle + search migration

**Files:** Create `supabase/migrations/20260630130000_merchant_ops_lifecycle_and_search.sql`.

> The controller applies this migration live separately (MCP). Write + commit the file; do NOT call any Supabase MCP tool and do NOT run a migration CLI.

- [ ] **Step 1: Write the migration**

```sql
-- Phase 11B — Merchants Operator Console: audited lifecycle write RPCs + a
-- filtered/keyset-paginated search. All writes are SECURITY DEFINER, gated on
-- is_active_ops(), require a reason, lock the row FOR UPDATE, no-op guard, and append
-- an ops_audit_log row (entity_type='merchant') in the same transaction via the 10A helper.
-- Merchant status has no linear lifecycle, so the setter validates the TARGET is a valid
-- status (no transition matrix). The audited admin_set_merchant_tier(uuid,text,text) is
-- ADDITIVE here (coexists with the legacy 2-arg version); 11C drops the legacy overload.

-- 1. Status setter (active|paused|suspended|archived). No transition matrix; no-op guarded.
create or replace function public.admin_set_merchant_status(p_id uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','paused','suspended','archived') then raise exception 'bad_status'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select status into v_from from public.merchant_profiles where id = p_id for update;
  if v_from is null then raise exception 'not_found'; end if;
  if v_from = p_status then raise exception 'no_change'; end if;
  update public.merchant_profiles set status = p_status, updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('merchant', p_id, 'status.' || p_status, p_reason,
    jsonb_build_object('from', v_from, 'to', p_status));
end $$;

-- 2. Tier setter (free|growth) — audited v2. ADDITIVE overload (legacy 2-arg untouched here).
create or replace function public.admin_set_merchant_tier(p_id uuid, p_tier text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_tier not in ('free','growth') then raise exception 'bad_tier'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select tier into v_from from public.merchant_profiles where id = p_id for update;
  if v_from is null then raise exception 'not_found'; end if;
  if v_from = p_tier then raise exception 'no_change'; end if;
  update public.merchant_profiles set tier = p_tier, updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('merchant', p_id, 'tier.set', p_reason,
    jsonb_build_object('from', v_from, 'to', p_tier));
end $$;

-- 3. Note-only audit row.
create or replace function public.admin_add_merchant_note(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_exists boolean;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'reason_required'; end if;
  select true into v_exists from public.merchant_profiles where id = p_id;
  if v_exists is null then raise exception 'not_found'; end if;
  perform public.ops_audit_log_append('merchant', p_id, 'note.add', p_note, '{}'::jsonb);
end $$;

-- 4. Bulk status: one transaction, audits each applied change, skips not-found and no-ops.
create or replace function public.admin_bulk_set_merchant_status(p_ids uuid[], p_status text, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_from text; v_count int := 0;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','paused','suspended','archived') then raise exception 'bad_status'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if array_length(p_ids, 1) is null or array_length(p_ids, 1) > 100 then raise exception 'bad_bulk'; end if;
  foreach v_id in array p_ids loop
    select status into v_from from public.merchant_profiles where id = v_id for update;
    if v_from is null or v_from = p_status then continue; end if;
    update public.merchant_profiles set status = p_status, updated_at = now() where id = v_id;
    perform public.ops_audit_log_append('merchant', v_id, 'status.' || p_status, p_reason,
      jsonb_build_object('from', v_from, 'to', p_status, 'bulk', true));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- 5. Filtered + keyset-paginated search. Ops-aggregate (bypasses owner RLS), ops-gated.
--    Returns NO PII (no contact_email/contact_name) — the directory list is non-PII.
create or replace function public.admin_search_merchants(
  p_search             text default null,
  p_statuses           text[] default null,
  p_tiers              text[] default null,
  p_limit              int default 25,
  p_cursor_created_at  timestamptz default null,
  p_cursor_id          uuid default null
) returns table (
  id uuid, company_name text, status text, tier text, created_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select m.id, m.company_name, m.status, m.tier, m.created_at
    from public.merchant_profiles m
    where (p_search is null or p_search = '' or m.company_name ilike '%' || p_search || '%')
      and (p_statuses is null or m.status = any(p_statuses))
      and (p_tiers is null or m.tier = any(p_tiers))
      and (p_cursor_created_at is null
           or (m.created_at, m.id) < (p_cursor_created_at, p_cursor_id))
    order by m.created_at desc, m.id desc
    limit least(greatest(coalesce(p_limit, 25), 1), 100);
end $$;

-- 6. Grants: revoke implicit public+anon EXECUTE, grant authenticated only.
revoke all on function public.admin_set_merchant_status(uuid, text, text) from public, anon;
revoke all on function public.admin_set_merchant_tier(uuid, text, text) from public, anon;
revoke all on function public.admin_add_merchant_note(uuid, text) from public, anon;
revoke all on function public.admin_bulk_set_merchant_status(uuid[], text, text) from public, anon;
revoke all on function public.admin_search_merchants(text, text[], text[], int, timestamptz, uuid) from public, anon;
grant execute on function public.admin_set_merchant_status(uuid, text, text) to authenticated;
grant execute on function public.admin_set_merchant_tier(uuid, text, text) to authenticated;
grant execute on function public.admin_add_merchant_note(uuid, text) to authenticated;
grant execute on function public.admin_bulk_set_merchant_status(uuid[], text, text) to authenticated;
grant execute on function public.admin_search_merchants(text, text[], text[], int, timestamptz, uuid) to authenticated;
```

- [ ] **Step 2: Commit** the file (`feat(db): merchant ops lifecycle + search RPCs (audited, is_active_ops-gated)`).

---

## Task 4: Patch `packages/db/types.ts`

- [ ] **Step 1:** Insert these entries near the other `admin_*` functions (adjacency is fine):
```ts
      admin_set_merchant_status: {
        Args: { p_id: string; p_status: string; p_reason: string }
        Returns: undefined
      }
      admin_set_merchant_tier: {
        Args: { p_id: string; p_tier: string; p_reason: string }
        Returns: undefined
      }
      admin_add_merchant_note: {
        Args: { p_id: string; p_note: string }
        Returns: undefined
      }
      admin_bulk_set_merchant_status: {
        Args: { p_ids: string[]; p_status: string; p_reason: string }
        Returns: number
      }
      admin_search_merchants: {
        Args: {
          p_search?: string | null
          p_statuses?: string[] | null
          p_tiers?: string[] | null
          p_limit?: number | null
          p_cursor_created_at?: string | null
          p_cursor_id?: string | null
        }
        Returns: {
          id: string
          company_name: string
          status: string
          tier: string
          created_at: string
        }[]
      }
```
> NOTE: there is already an `admin_set_merchant_tier` entry (legacy 2-arg `{ p_id, p_tier }`). TypeScript object types can't hold two same-named keys — REPLACE the legacy entry's Args with the 3-arg shape above (the legacy DB overload still exists at runtime for /admin/users until 11C; the generated types only need to describe the call the merchants console makes). If this causes a type error in `users-actions.ts` (`setMerchantTierAction` calls with `{ p_id, p_tier }`), add `p_reason?: string` as optional in the Args instead so both call shapes typecheck: `Args: { p_id: string; p_tier: string; p_reason?: string }`.

- [ ] **Step 2:** `pnpm --filter web typecheck` → PASS. **Step 3:** Commit (`chore(db): types for merchant ops RPCs`).

---

## Task 5: `merchants-actions.ts` (TDD)

**Files:** Create `apps/web/lib/admin/merchants-actions.ts`; test `apps/web/tests/admin.merchants-actions.test.ts`.

- [ ] **Step 1: Write the failing test** (mirror `admin.creators-actions.test.ts` harness — hoisted rpc/gate/revalidate mocks)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

type RpcResult = { data: unknown; error: { message: string } | null }
const { rpcMock, gateMock, revalidateMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (): Promise<RpcResult> => ({ data: null, error: null })),
  gateMock: vi.fn(async () => ({ ok: true as const, user: { id: 'u1' } })),
  revalidateMock: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: gateMock }))

import { setMerchantStatus, setMerchantTier, addMerchantNote, bulkSetMerchantStatus } from '@/lib/admin/merchants-actions'

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null })
  gateMock.mockReset().mockResolvedValue({ ok: true, user: { id: 'u1' } })
  revalidateMock.mockReset()
})

describe('merchants-actions', () => {
  it('setMerchantStatus calls RPC and revalidates', async () => {
    const res = await setMerchantStatus('en', 'm1', 'suspended', 'spam')
    expect(rpcMock).toHaveBeenCalledWith('admin_set_merchant_status', { p_id: 'm1', p_status: 'suspended', p_reason: 'spam' })
    expect(res).toEqual({ ok: true, id: 'm1', status: 'suspended' })
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/merchants/directory')
  })
  it('setMerchantStatus rejects an invalid status (no RPC)', async () => {
    const res = await setMerchantStatus('en', 'm1', 'banned' as never, 'x')
    expect(res.ok).toBe(false); expect(rpcMock).not.toHaveBeenCalled()
  })
  it('setMerchantStatus rejects a blank reason (no RPC)', async () => {
    const res = await setMerchantStatus('en', 'm1', 'paused', '   ')
    expect(res.ok).toBe(false); expect(rpcMock).not.toHaveBeenCalled()
  })
  it('setMerchantTier maps bad_tier and no_change DB raises', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'no_change' } })
    const r1 = await setMerchantTier('en', 'm1', 'growth', 'upgrade')
    expect(r1.ok).toBe(false)
    expect(rpcMock).toHaveBeenCalledWith('admin_set_merchant_tier', { p_id: 'm1', p_tier: 'growth', p_reason: 'upgrade' })
  })
  it('addMerchantNote calls RPC', async () => {
    const res = await addMerchantNote('en', 'm1', 'called them')
    expect(rpcMock).toHaveBeenCalledWith('admin_add_merchant_note', { p_id: 'm1', p_note: 'called them' })
    expect(res).toEqual({ ok: true, id: 'm1' })
  })
  it('bulkSetMerchantStatus returns the count', async () => {
    rpcMock.mockResolvedValueOnce({ data: 3, error: null })
    const res = await bulkSetMerchantStatus('en', ['a', 'b', 'c'], 'archived', 'cleanup')
    expect(res).toEqual({ ok: true, count: 3 })
  })
  it('bulkSetMerchantStatus rejects empty id list (no RPC)', async () => {
    const res = await bulkSetMerchantStatus('en', [], 'paused', 'x')
    expect(res.ok).toBe(false); expect(rpcMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `merchants-actions.ts` (mirror creators-actions structure)

```ts
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateReason, validateBulkIds } from '@/lib/admin/ops-validation'
import { isMerchantStatus, isMerchantTier, type MerchantStatus, type MerchantTier } from '@/lib/admin/merchants-validation'
import type { Locale } from '@/lib/i18n/config'

const dirPath = (locale: Locale) => `/${locale}/admin/merchants/directory`

const FRIENDLY: Record<string, string> = {
  forbidden: 'Active ops access is required.',
  bad_status: 'Invalid status.',
  bad_tier: 'Invalid tier.',
  reason_required: 'A reason is required.',
  reason_too_long: 'The reason is too long (max 500 characters).',
  no_change: 'Nothing to change — pick a different value.',
  not_found: 'That merchant no longer exists. Refresh and try again.',
  bad_bulk: 'Select between 1 and 100 merchants.',
}
const mapError = (message: string, fallback: string): string => {
  const key = Object.keys(FRIENDLY).find((k) => message.includes(k))
  return key ? FRIENDLY[key] : fallback
}

export async function setMerchantStatus(
  locale: Locale, id: string, status: MerchantStatus, reason: string,
): Promise<ActionResult<{ id: string; status: MerchantStatus }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!isMerchantStatus(status)) return formError(FRIENDLY.bad_status)
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])
  const { error } = await supabase.rpc('admin_set_merchant_status', { p_id: id, p_status: status, p_reason: reason.trim() })
  if (error) return formError(mapError(error.message, 'Status could not be changed'))
  revalidatePath(dirPath(locale))
  return { ok: true, id, status }
}

export async function setMerchantTier(
  locale: Locale, id: string, tier: MerchantTier, reason: string,
): Promise<ActionResult<{ id: string; tier: MerchantTier }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!isMerchantTier(tier)) return formError(FRIENDLY.bad_tier)
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])
  const { error } = await supabase.rpc('admin_set_merchant_tier', { p_id: id, p_tier: tier, p_reason: reason.trim() })
  if (error) return formError(mapError(error.message, 'Tier could not be changed'))
  revalidatePath(dirPath(locale))
  return { ok: true, id, tier }
}

export async function addMerchantNote(
  locale: Locale, id: string, note: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(note)
  if (rErr) return formError(FRIENDLY[rErr])
  const { error } = await supabase.rpc('admin_add_merchant_note', { p_id: id, p_note: note.trim() })
  if (error) return formError(mapError(error.message, 'Note could not be saved'))
  revalidatePath(dirPath(locale))
  return { ok: true, id }
}

export async function bulkSetMerchantStatus(
  locale: Locale, ids: string[], status: MerchantStatus, reason: string,
): Promise<ActionResult<{ count: number }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!isMerchantStatus(status)) return formError(FRIENDLY.bad_status)
  const bErr = validateBulkIds(ids)
  if (bErr) return formError(FRIENDLY[bErr])
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])
  const { data, error } = await supabase.rpc('admin_bulk_set_merchant_status', { p_ids: ids, p_status: status, p_reason: reason.trim() })
  if (error) return formError(mapError(error.message, 'Bulk update failed'))
  return { ok: true, count: Number(data ?? 0) }
}
```

- [ ] **Step 4: Run → PASS (7 tests).** **Step 5: Commit** (`feat(web): audited merchant lifecycle server actions`).

---

## Task 6: `listMerchantsDirectory` query (TDD)

**Files:** Modify `apps/web/lib/admin/merchants-queries.ts`; test `apps/web/tests/admin.merchants-directory-queries.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))
import { listMerchantsDirectory } from '@/lib/admin/merchants-queries'
const client = { rpc: rpcMock } as never
beforeEach(() => rpcMock.mockReset())

describe('listMerchantsDirectory', () => {
  it('forwards filters + keyset cursor and maps rows', async () => {
    rpcMock.mockResolvedValue({ data: [
      { id: 'm1', company_name: 'Acme', status: 'active', tier: 'growth', created_at: '2026-06-30T00:00:00Z' },
    ], error: null })
    const res = await listMerchantsDirectory(client, { search: 'ac', statuses: ['active'], tiers: ['growth'], limit: 25 })
    expect(rpcMock).toHaveBeenCalledWith('admin_search_merchants', expect.objectContaining({
      p_search: 'ac', p_statuses: ['active'], p_tiers: ['growth'], p_limit: 26, p_cursor_created_at: null, p_cursor_id: null,
    }))
    expect(res.rows[0]).toEqual({ id: 'm1', companyName: 'Acme', status: 'active', tier: 'growth', createdAt: '2026-06-30T00:00:00Z' })
    expect(res.nextCursor).toBeNull()
  })
  it('sets nextCursor when a full page+1 returns and trims to the page', async () => {
    const rows = Array.from({ length: 26 }, (_, i) => ({ id: `m${i}`, company_name: `c${i}`, status: 'active', tier: 'free', created_at: `2026-06-${(i % 28) + 1}T00:00:00Z` }))
    rpcMock.mockResolvedValue({ data: rows, error: null })
    const res = await listMerchantsDirectory(client, { limit: 25 })
    expect(res.rows).toHaveLength(25)
    expect(res.nextCursor).toEqual({ createdAt: rows[24].created_at, id: rows[24].id })
  })
  it('throws on RPC error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'forbidden' } })
    await expect(listMerchantsDirectory(client, {})).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — append to `merchants-queries.ts`:

```ts
export interface MerchantDirectoryRow {
  id: string
  companyName: string
  status: string
  tier: string
  createdAt: string
}
export interface MerchantsDirectory {
  rows: MerchantDirectoryRow[]
  nextCursor: { createdAt: string; id: string } | null
}
export interface ListMerchantsParams {
  search?: string
  statuses?: string[]
  tiers?: string[]
  limit?: number
  cursor?: { createdAt: string; id: string } | null
}

type SearchRow = { id: string; company_name: string; status: string; tier: string; created_at: string }

/** Ops-aggregate merchant directory via SECURITY DEFINER admin_search_merchants (keyset).
 *  Fetches limit+1 to derive nextCursor, then trims. Errors propagate. */
export async function listMerchantsDirectory(supabase: Client, params: ListMerchantsParams): Promise<MerchantsDirectory> {
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100)
  const { data, error } = await supabase.rpc('admin_search_merchants', {
    p_search: params.search ?? null,
    p_statuses: params.statuses ?? null,
    p_tiers: params.tiers ?? null,
    p_limit: limit + 1,
    p_cursor_created_at: params.cursor?.createdAt ?? null,
    p_cursor_id: params.cursor?.id ?? null,
  })
  if (error) throw error
  const all = ((data ?? []) as unknown as SearchRow[]).map((r) => ({
    id: r.id, companyName: r.company_name, status: r.status, tier: r.tier, createdAt: r.created_at,
  }))
  const rows = all.slice(0, limit)
  const nextCursor = all.length > limit ? { createdAt: rows[rows.length - 1].createdAt, id: rows[rows.length - 1].id } : null
  return { rows, nextCursor }
}
```
> `Client` is already defined at the top of merchants-queries.ts (from 11A). Reuse it.

- [ ] **Step 4: Run → PASS (3 tests).** **Step 5: Commit** (`feat(web): listMerchantsDirectory keyset query`).

---

## Task 7: `badges.tsx` + `MerchantsDirectoryView.tsx` (TDD)

**Files:** Create `apps/web/components/kinnso/admin/merchants/badges.tsx` + `MerchantsDirectoryView.tsx`; test `apps/web/tests/kinnso.MerchantsDirectoryView.test.tsx`.

Mirror `apps/web/components/kinnso/admin/creators/CreatorsDirectoryView.tsx` — READ it as the template. Merchant deltas:
- Columns: Company (name) · Status · Tier · Joined · Actions. No DNA/verified/handle/points columns.
- Filters: text search (company), Status multi (active/paused/suspended/archived), Tier multi (free/growth). No DNA/verified filter.
- Row actions behind a reason-gated confirm dialog (reuse the creators dialog pattern — `useRef` focus, Escape-to-cancel, Apply disabled until reason non-blank): **Set status** (a `<select>` of the 4 statuses → `setMerchantStatus`), **Set tier** (`<select>` free/growth → `setMerchantTier`), **Add note** (`addMerchantNote`).
- Bulk bar: checkbox select rows → choose a status → reason → `bulkSetMerchantStatus`.
- "Next page" button when `nextCursor` present (append `?cursor_at=&cursor_id=` to the directory URL, like creators).
- Props: `{ t: Messages['merchantsOps']; locale: Locale; directory: MerchantsDirectory; onSetStatus; onSetTier; onAddNote; onBulkSetStatus }` (action fns passed from the route as bound server actions, matching how the creators directory receives them — check the creators route to match the exact prop wiring).

- [ ] **Step 1: Write a focused render test** `kinnso.MerchantsDirectoryView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
afterEach(cleanup)
vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin/merchants/directory', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams('') }))
import { MerchantsDirectoryView } from '@/components/kinnso/admin/merchants/MerchantsDirectoryView'
import type { MerchantsDirectory } from '@/lib/admin/merchants-queries'

const noop = async () => ({ ok: true as const, id: 'm1' })
const dir: MerchantsDirectory = {
  rows: [{ id: 'm1', companyName: 'Acme Co', status: 'active', tier: 'growth', createdAt: '2026-06-30T00:00:00Z' }],
  nextCursor: null,
}
const props = { t: en.merchantsOps, locale: 'en' as const, directory: dir,
  onSetStatus: noop as never, onSetTier: noop as never, onAddNote: noop as never, onBulkSetStatus: (async () => ({ ok: true, count: 0 })) as never }

describe('MerchantsDirectoryView', () => {
  it('renders a merchant row with status + tier', () => {
    render(<MerchantsDirectoryView {...props} />)
    expect(screen.getByText('Acme Co')).toBeTruthy()
    expect(screen.getAllByText(en.merchantsOps.statusActive).length).toBeGreaterThan(0)
    expect(screen.getAllByText(en.merchantsOps.tierGrowth).length).toBeGreaterThan(0)
  })
  it('shows the empty state when no rows', () => {
    render(<MerchantsDirectoryView {...props} directory={{ rows: [], nextCursor: null }} />)
    expect(screen.getByText(en.merchantsOps.dirEmpty)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement `badges.tsx`** (status + tier label badges using the merchantsOps keys), then **`MerchantsDirectoryView.tsx`** by adapting CreatorsDirectoryView per the deltas above. **Step 4: Run → PASS.** **Step 5: Commit** (`feat(web): Merchants Directory view + badges`).

---

## Task 8: Directory route + host test (TDD)

**Files:** Create `apps/web/app/[locale]/admin/merchants/directory/page.tsx`; test `apps/web/tests/admin.merchants-directory.host.test.tsx`.

Mirror `app/[locale]/admin/creators/directory/page.tsx`: `await params` + `await searchParams`, `isLocale` guard, `createSupabaseServerClient`, **`await requireOpsPage` before fetch**, `getDictionary`, `normalizeMerchantDirectoryParams(sp)` → build `{ ...params, cursor }` from `?cursor_at`/`?cursor_id`, `listMerchantsDirectory`, render `<MerchantsDirectoryView t={messages.merchantsOps} … onSetStatus={setMerchantStatus.bind(null, loc)} … />` (bind the locale into each action, matching the creators route's wiring — READ it to copy exact binding style).

- [ ] **Step 1: Write the host test** (mirror `admin.creators-directory.host.test.tsx`): ops renders the row; non-ops → `notFound`; anon → redirect `/en/sign-in`; forwards normalized filters to `listMerchantsDirectory`. Mock `next/navigation` (incl. `usePathname`+`useSearchParams`), `@/lib/auth/viewer-role`, `@/lib/admin/merchants-queries` (`listMerchantsDirectory`), `@/lib/supabase/server`.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement the route.** **Step 4: Run → PASS.** **Step 5: Commit** (`feat(web): Merchants Directory route`).

---

## Task 9: i18n — extend `merchantsOps` with directory keys (×7) 

**Files:** Modify `en.ts` (type + value) and the 6 other locales (value only). Parity test already includes `merchantsOps`.

- [ ] **Step 1:** Add these keys to the `merchantsOps` type in `en.ts` and the value blocks in ALL 7 locales (translate per locale; keys identical across all). English values:

```
dirSearch: 'Search company name', dirStatus: 'Status', dirTier: 'Tier', dirAll: 'All',
dirLoadMore: 'Next page', dirEmpty: 'No merchants match your filters',
colName: 'Merchant', colStatus: 'Status', colTier: 'Tier', colJoined: 'Joined', colActions: 'Actions',
statusActive: 'Active', statusPaused: 'Paused', statusSuspended: 'Suspended', statusArchived: 'Archived',
tierFree: 'Free', tierGrowth: 'Growth',
actSetStatus: 'Set status', actSetTier: 'Set tier', actNote: 'Add note', actApply: 'Apply', actCancel: 'Cancel',
reasonPlaceholder: 'Reason (required)', notePlaceholder: 'Note (required)',
confirmArchive: 'Archive this merchant? Their missions are affected.',
bulkApply: 'Apply to selected', bulkSelected: 'selected', bulkChooseAction: 'Choose a status',
actionFailed: 'Action failed. Try again.',
```
> Translate all values for zh-hk, zh-tw, zh-cn, ja, ko, th (you did the 11A merchantsOps translations — match that style and register; status/tier labels should match the meanings used in 11A KPIs: e.g. statusSuspended ↔ the kpiSuspended wording). Keys MUST be byte-identical across all 7.

- [ ] **Step 2:** `pnpm --filter web test -- i18n.locale-parity` → 8/8 PASS. **Step 3:** Commit (`i18n(web): merchantsOps directory keys ×7`).

---

## Task 10: Final gate

- [ ] **Step 1:** `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test`
  Expected: all new merchant suites pass (validation, actions 7, directory-queries 3, MerchantsDirectoryView 2, directory host 4), parity 8/8, creators suites unchanged. The 19 known live-Supabase suites still fail on dummy creds (acceptable, pre-existing).
- [ ] **Step 2:** Report final status + `git log --oneline ae3b76c..HEAD`.

## Done criteria for 11B
- `/<locale>/admin/merchants/directory` lists merchants (search/filter/keyset paginate) with per-row audited status/tier/note actions and bulk status — all reason-gated; non-ops `notFound`, anon redirect.
- Five RPCs applied live, EXECUTE-gated to authenticated; every merchant write audits to `ops_audit_log` (`entity_type='merchant'`).
- `pnpm --filter web typecheck && lint && test` green (modulo the 19 pre-existing live-Supabase failures); parity 8/8.

## After 11B
Open PR `feat/merchants-console` → `main` ("Phase 11B — Merchants Operator Console: Directory + audited lifecycle"), adversarial review (security / money-adjacent SQL / data-mapping / i18n), squash-merge, then writing-plans for **11C (Merchant 360 + /admin/users de-control + drop legacy 2-arg tier RPC)** cut from the freshly-merged `main`.
