# Phase 6C — Admin Users Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an ops-only `/admin/users` module that lists creators, merchants, and ops members and lets ops activate/suspend any of them — with no-lockout guards (can't suspend yourself or the last active ops).

**Architecture:** Reuse the existing ops gate (`is_active_ops()` / `resolveViewerRole === 'ops'` / `requireOpsPage` / `requireOpsAction`). All user reads + the status write go through **SECURITY DEFINER** RPCs gated internally on `is_active_ops()` — no new RLS on the existing user tables. v1 = **view + activate/suspend only** (no role granting).

**Tech Stack:** Next.js 16 (MODIFIED fork — read `node_modules/next/dist/docs/` before touching pages), React 19, hosted Supabase (project `scryfkefedzuetfdtrvl`), TypeScript, vitest.

---

## Critical environment notes (read before any task)

- **This is a MODIFIED Next.js.** Before editing the page in T5, read the relevant guide under `apps/web/node_modules/next/dist/docs/`.
- **Migration is controller-applied.** T1 (the DB migration + type regen) is done by the controller via the Supabase MCP **after explicit user consent** — it is NOT a subagent task and subagents must NOT call the Supabase MCP. Subagent tasks start at T2; by then the migration + regenerated `packages/db/types.ts` already exist.
- **`'use server'` goes FIRST inside each exported async action** (not at file top), matching `lib/admin/perks-actions.ts`.
- **Gate inline in the page** — Next renders layout + page in parallel, so the layout's ops gate is NOT a barrier. The page calls `requireOpsPage` before `listAdminUsers` (the "layout-page-parallel-gate" lesson).
- **anon-revoke-needs-explicit** — every new public function auto-gets EXECUTE granted to `anon`; `revoke … from public` alone is insufficient. Revoke from `public, anon` then grant to `authenticated` (the 6B lesson, advisor 0028).
- **Per-task `vitest run <file>` does NOT typecheck.** The controller runs the FULL `tsc` + full suite + lint + build at the finish gate (T6).
- **i18n parity:** a new `users` group needs the interface in `en.ts`, values in all 7 locale files, and `'users'` added to `GROUPS` in `tests/i18n.locale-parity.test.ts`.
- **Full-suite finish command** (from `apps/web`): `pnpm vitest run --no-file-parallelism --testTimeout=30000`. NEVER prefix with `pkill -f vitest` (self-kill → exit 144).

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260627120000_admin_users.sql` | **(T1, controller)** extend 3 status CHECK constraints to allow `'suspended'`; `admin_list_creators/merchants/ops` + `admin_set_user_status` SECURITY DEFINER fns; grants. |
| `apps/web/lib/i18n/messages/{en,ja,ko,th,zh-cn,zh-hk,zh-tw}.ts` | **(T2)** new `users` i18n group. |
| `apps/web/tests/i18n.locale-parity.test.ts` | **(T2)** add `'users'` to `GROUPS`. |
| `apps/web/lib/admin/users-queries.ts` | **(T3)** `listAdminUsers(supabase)` → the three RPCs; derived row types (widen nullable creator cols). |
| `apps/web/lib/admin/users-actions.ts` | **(T4)** `setUserStatusAction(locale, kind, id, status)` → `requireOpsAction` + `admin_set_user_status` RPC + friendly error mapping. |
| `apps/web/components/kinnso/admin/AdminUsersView.tsx` | **(T5)** client view: three sections, status badge, activate/suspend toggle, inline guard error. |
| `apps/web/app/[locale]/admin/users/page.tsx` | **(T5)** ops-gated page; `listAdminUsers` → `AdminUsersView`; server-action closure. |
| `apps/web/tests/*` | per-task tests (queries / actions / view / host). |

---

## Task 1 (CONTROLLER, not a subagent): DB migration + type regen

**Files:**
- Create: `supabase/migrations/20260627120000_admin_users.sql`
- Regenerate: `apps/web/packages/db/types.ts` (via Supabase MCP `generate_typescript_types`)

> Applied live by the controller via Supabase MCP **after explicit user consent**. The auto-mode classifier denies a bare "build" directive for a production migration, so it is surfaced via AskUserQuestion first. Do NOT work around a classifier denial.

**Migration SQL (final, verified against live constraint names):**

```sql
-- Phase 6C — Users module. Ops manage creators/merchants/ops via SECURITY DEFINER
-- functions gated on is_active_ops() (existing helper — do NOT redefine).
-- v1 = view + activate/suspend only (no role granting).

-- 1. Allow a 'suspended' status on each user table. The existing enums had no "off"
--    value matching the spec's active/suspended vocabulary, so extend the CHECK
--    constraints (idempotent drop+add). is_active_ops()/resolveViewerRole already
--    require status='active', so a suspended ops loses access (hence the last-ops guard).
alter table public.creators drop constraint if exists creators_status_check;
alter table public.creators add constraint creators_status_check
  check (status in ('onboarding','active','suspended'));

alter table public.merchant_profiles drop constraint if exists merchant_profiles_status_check;
alter table public.merchant_profiles add constraint merchant_profiles_status_check
  check (status in ('active','paused','archived','suspended'));

alter table public.kinnso_ops_members drop constraint if exists kinnso_ops_members_status_check;
alter table public.kinnso_ops_members add constraint kinnso_ops_members_status_check
  check (status in ('active','paused','suspended'));

-- 2. Ops-only readers. SECURITY DEFINER (bypass owner-scoped RLS) but gated on
--    is_active_ops() internally; a non-ops caller is rejected at the DB boundary.
--    NOTE: table aliased + columns qualified (c.id …) so the OUT params don't collide
--    with the source columns (an unqualified `select id …` raises "ambiguous column").
create or replace function public.admin_list_creators()
returns table (id uuid, display_name text, handle text, status text, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select c.id, c.display_name, c.handle, c.status, c.created_at
    from public.creators c order by c.created_at desc;
end $$;

create or replace function public.admin_list_merchants()
returns table (id uuid, company_name text, contact_email text, status text, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select m.id, m.company_name, m.contact_email, m.status, m.created_at
    from public.merchant_profiles m order by m.created_at desc;
end $$;

create or replace function public.admin_list_ops()
returns table (id uuid, user_id uuid, display_name text, status text, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select o.id, o.user_id, o.display_name, o.status, o.created_at
    from public.kinnso_ops_members o order by o.created_at desc;
end $$;

-- 3. Status setter with no-lockout guards (ops can't suspend self or the last active ops).
create or replace function public.admin_set_user_status(p_kind text, p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','suspended') then raise exception 'bad_status'; end if;
  if p_kind = 'creator' then
    update public.creators set status = p_status where id = p_id;
  elsif p_kind = 'merchant' then
    update public.merchant_profiles set status = p_status where id = p_id;
  elsif p_kind = 'ops' then
    if p_status = 'suspended' then
      if (select user_id from public.kinnso_ops_members where id = p_id) = auth.uid()
        then raise exception 'cannot_suspend_self'; end if;
      if (select count(*) from public.kinnso_ops_members where status = 'active') <= 1
        then raise exception 'last_active_ops'; end if;
    end if;
    update public.kinnso_ops_members set status = p_status where id = p_id;
  else raise exception 'bad_kind'; end if;
end $$;

-- 4. Grants: revoke the implicit public+anon EXECUTE (Supabase default privileges
--    re-grant anon), then grant only to authenticated. is_active_ops() is the real gate.
revoke all on function public.admin_list_creators() from public, anon;
revoke all on function public.admin_list_merchants() from public, anon;
revoke all on function public.admin_list_ops() from public, anon;
revoke all on function public.admin_set_user_status(text, uuid, text) from public, anon;
grant execute on function public.admin_list_creators() to authenticated;
grant execute on function public.admin_list_merchants() to authenticated;
grant execute on function public.admin_list_ops() to authenticated;
grant execute on function public.admin_set_user_status(text, uuid, text) to authenticated;
```

- [ ] **Step 1:** Apply via Supabase MCP `apply_migration` (name `admin_users`). Re-apply is idempotent (drop-if-exists guards + `create or replace`).
- [ ] **Step 2:** Verify live: the 4 functions exist; `anon` has 0 EXECUTE grants on them; each list fn raises `forbidden` when called with no ops context (execute_sql runs as a non-ops role → `is_active_ops()` false). Run `get_advisors security` — no new 0028 anon-executable warning for these 4.
- [ ] **Step 3:** Regenerate `packages/db/types.ts` via MCP `generate_typescript_types`; commit migration + types.

---

## Task 2: `users` i18n group (7 locales + parity GROUPS)

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface + values)
- Modify: `apps/web/lib/i18n/messages/{ja,ko,th,zh-cn,zh-hk,zh-tw}.ts` (translated values)
- Modify: `apps/web/tests/i18n.locale-parity.test.ts` (add `'users'` to `GROUPS`)

- [ ] **Step 1: Add the `users` interface to `Messages` in `en.ts`** (place it right after the `perks` group, before the closing `}` of the interface):

```ts
  users: {
    title: string; subtitle: string
    sectionCreators: string; sectionMerchants: string; sectionOps: string
    empty: string; joined: string; unnamed: string
    activate: string; suspend: string
    statusActive: string; statusSuspended: string
    statusOnboarding: string; statusPaused: string; statusArchived: string
    errorGeneric: string
  }
```

- [ ] **Step 2: Add the English values** to the `messages` object in `en.ts` (right after the `perks: { … }` value block):

```ts
  users: {
    title: 'Users',
    subtitle: 'Manage creators, merchants, and ops members.',
    sectionCreators: 'Creators',
    sectionMerchants: 'Merchants',
    sectionOps: 'Ops members',
    empty: 'None yet.',
    joined: 'Joined',
    unnamed: 'Unnamed',
    activate: 'Activate',
    suspend: 'Suspend',
    statusActive: 'Active',
    statusSuspended: 'Suspended',
    statusOnboarding: 'Onboarding',
    statusPaused: 'Paused',
    statusArchived: 'Archived',
    errorGeneric: 'User status could not be changed.',
  },
```

- [ ] **Step 3: Add a translated `users` value block** to each of `ja.ts`, `ko.ts`, `th.ts`, `zh-cn.ts`, `zh-hk.ts`, `zh-tw.ts` — same keys, locale-appropriate copy, matching the placement/style of that file's existing `perks` block. (Locale files declare values only; the interface lives in `en.ts`.) Example for `zh-hk.ts`:

```ts
  users: {
    title: '用戶',
    subtitle: '管理創作者、商戶及營運成員。',
    sectionCreators: '創作者',
    sectionMerchants: '商戶',
    sectionOps: '營運成員',
    empty: '暫時未有。',
    joined: '加入於',
    unnamed: '未命名',
    activate: '啟用',
    suspend: '停用',
    statusActive: '使用中',
    statusSuspended: '已停用',
    statusOnboarding: '設定中',
    statusPaused: '已暫停',
    statusArchived: '已封存',
    errorGeneric: '無法變更用戶狀態。',
  },
```

- [ ] **Step 4: Add `'users'` to `GROUPS`** in `tests/i18n.locale-parity.test.ts` (the array currently ends `…, 'admin', 'perks',`).

- [ ] **Step 5: Run the parity test** to verify all 7 locales agree.

Run: `pnpm vitest run tests/i18n.locale-parity.test.ts`
Expected: PASS (deep dotted-key parity across all 7 locales).

- [ ] **Step 6: Commit** `feat(sp6c): users i18n group ×7 + parity`.

---

## Task 3: `listAdminUsers` query

**Files:**
- Create: `apps/web/lib/admin/users-queries.ts`
- Test: `apps/web/tests/admin.users-queries.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, it, expect, vi } from 'vitest'
import { listAdminUsers } from '@/lib/admin/users-queries'

function clientWith(map: Record<string, { data: unknown; error: unknown }>) {
  return { rpc: vi.fn((name: string) => Promise.resolve(map[name])) } as never
}

describe('listAdminUsers', () => {
  it('returns the three lists from their RPCs', async () => {
    const c = clientWith({
      admin_list_creators: { data: [{ id: 'c1', display_name: 'A', handle: 'a', status: 'active', created_at: 't' }], error: null },
      admin_list_merchants: { data: [{ id: 'm1', company_name: 'M', contact_email: 'e', status: 'active', created_at: 't' }], error: null },
      admin_list_ops: { data: [{ id: 'o1', user_id: 'u1', display_name: 'O', status: 'active', created_at: 't' }], error: null },
    })
    const r = await listAdminUsers(c)
    expect(r.creators).toHaveLength(1)
    expect(r.merchants[0].company_name).toBe('M')
    expect(r.ops[0].display_name).toBe('O')
  })
  it('throws when a list RPC errors (no silent empty)', async () => {
    const c = clientWith({
      admin_list_creators: { data: null, error: { message: 'forbidden' } },
      admin_list_merchants: { data: [], error: null },
      admin_list_ops: { data: [], error: null },
    })
    await expect(listAdminUsers(c)).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (module not found).

Run: `pnpm vitest run tests/admin.users-queries.test.ts`

- [ ] **Step 3: Implement `lib/admin/users-queries.ts`:**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type RawCreator = Database['public']['Functions']['admin_list_creators']['Returns'][number]
type RawMerchant = Database['public']['Functions']['admin_list_merchants']['Returns'][number]
type RawOps = Database['public']['Functions']['admin_list_ops']['Returns'][number]

/** creators.display_name and .handle are nullable in the DB, but Supabase types
 *  RETURNS-TABLE columns as non-null — widen them so the UI can fall back. */
export type AdminCreator = Omit<RawCreator, 'display_name' | 'handle'> & {
  display_name: string | null
  handle: string | null
}
export type AdminMerchant = RawMerchant
export type AdminOps = RawOps
export type AdminUsers = { creators: AdminCreator[]; merchants: AdminMerchant[]; ops: AdminOps[] }

/** Ops-only read of all users via the three SECURITY DEFINER RPCs. Errors propagate
 *  (no silent []). Non-ops callers are rejected at the DB boundary → the RPC errors. */
export async function listAdminUsers(supabase: SupabaseClient<Database>): Promise<AdminUsers> {
  const [creators, merchants, ops] = await Promise.all([
    supabase.rpc('admin_list_creators'),
    supabase.rpc('admin_list_merchants'),
    supabase.rpc('admin_list_ops'),
  ])
  if (creators.error) throw creators.error
  if (merchants.error) throw merchants.error
  if (ops.error) throw ops.error
  return {
    creators: (creators.data ?? []) as AdminCreator[],
    merchants: (merchants.data ?? []) as AdminMerchant[],
    ops: (ops.data ?? []) as AdminOps[],
  }
}
```

- [ ] **Step 4: Run the test — expect PASS.**
- [ ] **Step 5: Commit** `feat(sp6c): listAdminUsers (three ops RPCs)`.

---

## Task 4: `setUserStatusAction`

**Files:**
- Create: `apps/web/lib/admin/users-actions.ts`
- Test: `apps/web/tests/admin.users-actions.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { gateMock, rpcMock } = vi.hoisted(() => ({
  gateMock: vi.fn(async () => ({ ok: true, user: { id: 'ops1' } })),
  rpcMock: vi.fn(async () => ({ error: null })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: gateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))

import { setUserStatusAction } from '@/lib/admin/users-actions'

beforeEach(() => {
  gateMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } } as never)
  rpcMock.mockResolvedValue({ error: null } as never)
})

describe('setUserStatusAction', () => {
  it('rejects a non-ops caller', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['nope'] } } as never)
    expect((await setUserStatusAction('en', 'creator', 'c1', 'suspended')).ok).toBe(false)
  })
  it('rejects a bad kind', async () => {
    expect((await setUserStatusAction('en', 'admin' as never, 'c1', 'suspended')).ok).toBe(false)
  })
  it('rejects a bad status', async () => {
    expect((await setUserStatusAction('en', 'creator', 'c1', 'paused' as never)).ok).toBe(false)
  })
  it('suspends a creator via the RPC', async () => {
    const r = await setUserStatusAction('en', 'creator', 'c1', 'suspended')
    expect(r.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('admin_set_user_status', { p_kind: 'creator', p_id: 'c1', p_status: 'suspended' })
  })
  it('maps cannot_suspend_self to a friendly error', async () => {
    rpcMock.mockResolvedValueOnce({ error: { message: 'cannot_suspend_self' } } as never)
    const r = await setUserStatusAction('en', 'ops', 'o1', 'suspended')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form[0]).toMatch(/your own ops/i)
  })
  it('maps last_active_ops to a friendly error', async () => {
    rpcMock.mockResolvedValueOnce({ error: { message: 'last_active_ops' } } as never)
    const r = await setUserStatusAction('en', 'ops', 'o1', 'suspended')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.form[0]).toMatch(/last active ops/i)
  })
})
```

- [ ] **Step 2: Run it — expect FAIL.**
- [ ] **Step 3: Implement `lib/admin/users-actions.ts`:**

```ts
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'

export type UserKind = 'creator' | 'merchant' | 'ops'
export type UserStatus = 'active' | 'suspended'

/** DB raise-message → friendly copy. The setter raises these bare messages. */
const FRIENDLY: Record<string, string> = {
  cannot_suspend_self: 'You cannot suspend your own ops account.',
  last_active_ops: 'You cannot suspend the last active ops member.',
  forbidden: 'Active ops access is required.',
  bad_status: 'Invalid status.',
  bad_kind: 'Invalid user type.',
}

export async function setUserStatusAction(
  locale: Locale,
  kind: UserKind,
  id: string,
  status: UserStatus,
): Promise<ActionResult<{ id: string; status: UserStatus }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (kind !== 'creator' && kind !== 'merchant' && kind !== 'ops') return formError(FRIENDLY.bad_kind)
  if (status !== 'active' && status !== 'suspended') return formError(FRIENDLY.bad_status)

  const { error } = await supabase.rpc('admin_set_user_status', { p_kind: kind, p_id: id, p_status: status })
  if (error) {
    const key = Object.keys(FRIENDLY).find((k) => error.message.includes(k))
    return formError(key ? FRIENDLY[key] : 'User status could not be changed')
  }
  revalidatePath(`/${locale}/admin/users`)
  return { ok: true, id, status }
}
```

- [ ] **Step 4: Run the test — expect PASS.**
- [ ] **Step 5: Commit** `feat(sp6c): setUserStatusAction (ops gate + no-lockout error mapping)`.

---

## Task 5: `AdminUsersView` + `/admin/users` page

**Files:**
- Create: `apps/web/components/kinnso/admin/AdminUsersView.tsx`
- Create: `apps/web/app/[locale]/admin/users/page.tsx`
- Test: `apps/web/tests/kinnso.AdminUsersView.test.tsx`
- Test: `apps/web/tests/admin.users.host.test.tsx`

> Read the relevant page guide under `apps/web/node_modules/next/dist/docs/` before writing the page (MODIFIED Next.js).

- [ ] **Step 1: Write the failing component test** `tests/kinnso.AdminUsersView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminUsersView } from '@/components/kinnso/admin/AdminUsersView'
import en from '@/lib/i18n/messages/en'
import type { AdminUsers } from '@/lib/admin/users-queries'

afterEach(cleanup)
const users: AdminUsers = {
  creators: [{ id: 'c1', display_name: 'Ada', handle: 'ada', status: 'active', created_at: '2026-01-01T00:00:00Z' }],
  merchants: [{ id: 'm1', company_name: 'Klook', contact_email: 'e@k.com', status: 'active', created_at: '2026-01-01T00:00:00Z' }],
  ops: [{ id: 'o1', user_id: 'u1', display_name: 'Opsy', status: 'active', created_at: '2026-01-01T00:00:00Z' }],
}
const ok = async (_k: unknown, id: string, status: 'active' | 'suspended') => ({ ok: true as const, id, status })

describe('AdminUsersView', () => {
  it('lists all three sections', () => {
    render(<AdminUsersView t={en.users} users={users} onSetStatus={ok} />)
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.getByText('Klook')).toBeTruthy()
    expect(screen.getByText('Opsy')).toBeTruthy()
  })
  it('suspends an active row (its button flips to Activate)', async () => {
    render(<AdminUsersView t={en.users} users={users} onSetStatus={ok} />)
    fireEvent.click(screen.getAllByText(en.users.suspend)[0]) // creator
    await waitFor(() => expect(screen.getAllByText(en.users.activate).length).toBeGreaterThan(0))
  })
  it('shows the guard error when a suspend fails', async () => {
    const fail = async () => ({ ok: false as const, errors: { form: ['You cannot suspend the last active ops member.'] } })
    render(<AdminUsersView t={en.users} users={users} onSetStatus={fail} />)
    fireEvent.click(screen.getAllByText(en.users.suspend)[2]) // ops row
    await waitFor(() => expect(screen.getByText(/last active ops/i)).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run it — expect FAIL.**
- [ ] **Step 3: Implement `components/kinnso/admin/AdminUsersView.tsx`:**

```tsx
'use client'
import { useState } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { AdminUsers } from '@/lib/admin/users-queries'
import type { ActionResult } from '@/lib/admin/result'
import type { UserKind, UserStatus } from '@/lib/admin/users-actions'
import { TicketCard } from '@/components/kinnso/MarketPassport'

type T = Messages['users']
type SetStatus = (kind: UserKind, id: string, status: UserStatus) => Promise<ActionResult<{ id: string; status: UserStatus }>>
type Row = { id: string; name: string; status: string; joined: string }

function statusLabel(t: T, status: string): string {
  switch (status) {
    case 'active': return t.statusActive
    case 'suspended': return t.statusSuspended
    case 'onboarding': return t.statusOnboarding
    case 'paused': return t.statusPaused
    case 'archived': return t.statusArchived
    default: return status
  }
}

function UserSection({ t, heading, kind, rows, onSetStatus }: {
  t: T; heading: string; kind: UserKind; rows: Row[]; onSetStatus: SetStatus
}) {
  const [items, setItems] = useState(rows)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function toggle(row: Row) {
    const next: UserStatus = row.status === 'suspended' ? 'active' : 'suspended'
    setBusyId(row.id)
    setErrors((e) => ({ ...e, [row.id]: '' }))
    const res = await onSetStatus(kind, row.id, next)
    setBusyId(null)
    if (res.ok) setItems((list) => list.map((r) => (r.id === row.id ? { ...r, status: res.status } : r)))
    else setErrors((e) => ({ ...e, [row.id]: res.errors.form?.[0] ?? t.errorGeneric }))
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-kinnso-ink">{heading}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-kinnso-muted">{t.empty}</p>
      ) : (
        <div className="mt-3 grid gap-3">
          {items.map((row) => {
            const suspended = row.status === 'suspended'
            return (
              <TicketCard key={row.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-bold text-kinnso-ink">{row.name}</p>
                  <p className="text-sm text-kinnso-muted">
                    <span className={suspended ? 'font-bold text-red-600' : 'font-bold text-kinnso-orange'}>
                      {statusLabel(t, row.status)}
                    </span>
                    {' · '}{t.joined} {new Date(row.joined).toLocaleDateString()}
                  </p>
                  {errors[row.id] ? <p className="mt-1 text-sm text-red-600">{errors[row.id]}</p> : null}
                </div>
                <button
                  onClick={() => toggle(row)}
                  disabled={busyId === row.id}
                  className="rounded-full border border-kinnso-line px-4 py-2 text-sm font-bold text-kinnso-ink disabled:opacity-50"
                >
                  {suspended ? t.activate : t.suspend}
                </button>
              </TicketCard>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function AdminUsersView({ t, users, onSetStatus }: { t: T; users: AdminUsers; onSetStatus: SetStatus }) {
  return (
    <main>
      <h1 className="k-display">{t.title}</h1>
      <p className="mt-2 text-kinnso-muted">{t.subtitle}</p>
      <UserSection t={t} heading={t.sectionCreators} kind="creator"
        rows={users.creators.map((c) => ({ id: c.id, name: c.display_name || c.handle || t.unnamed, status: c.status, joined: c.created_at }))}
        onSetStatus={onSetStatus} />
      <UserSection t={t} heading={t.sectionMerchants} kind="merchant"
        rows={users.merchants.map((m) => ({ id: m.id, name: m.company_name, status: m.status, joined: m.created_at }))}
        onSetStatus={onSetStatus} />
      <UserSection t={t} heading={t.sectionOps} kind="ops"
        rows={users.ops.map((o) => ({ id: o.id, name: o.display_name, status: o.status, joined: o.created_at }))}
        onSetStatus={onSetStatus} />
    </main>
  )
}

export default AdminUsersView
```

- [ ] **Step 4: Run the component test — expect PASS.**

- [ ] **Step 5: Write the failing host test** `tests/admin.users.host.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
const { roleMock, getUserMock, listMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  listMock: vi.fn(async () => ({
    creators: [{ id: 'c1', display_name: 'Ada', handle: 'ada', status: 'active', created_at: '2026-01-01T00:00:00Z' }],
    merchants: [], ops: [],
  })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/admin/users-queries', () => ({ listAdminUsers: listMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import AdminUsersPage from '@/app/[locale]/admin/users/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }) })

describe('admin users page host', () => {
  it('notFounds for a non-ops viewer (page gates independently of the layout)', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(AdminUsersPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('renders the users view for ops', async () => {
    const ui = await AdminUsersPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Ada')).toBeTruthy()
  })
})
```

- [ ] **Step 6: Run it — expect FAIL.**
- [ ] **Step 7: Implement `app/[locale]/admin/users/page.tsx`** (match the `admin/perks/page.tsx` shape exactly):

```tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { listAdminUsers } from '@/lib/admin/users-queries'
import { setUserStatusAction, type UserKind, type UserStatus } from '@/lib/admin/users-actions'
import { AdminUsersView } from '@/components/kinnso/admin/AdminUsersView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  // Gate inline: Next renders layout + page in parallel (the layout gate is not a barrier).
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const users = await listAdminUsers(supabase)

  async function onSetStatus(kind: UserKind, id: string, status: UserStatus) {
    'use server'
    return setUserStatusAction(loc, kind, id, status)
  }

  return <AdminUsersView t={messages.users} users={users} onSetStatus={onSetStatus} />
}
```

- [ ] **Step 8: Run the host test — expect PASS.**
- [ ] **Step 9: Commit** `feat(sp6c): /admin/users page + AdminUsersView (activate/suspend)`.

---

## Task 6 (CONTROLLER): Finish gate

**Files:** none (verification only).

- [ ] **Step 1: Full suite** — from `apps/web`: `pnpm vitest run --no-file-parallelism --testTimeout=30000`. Expect all green (≥ prior 657 + the new 6C tests).
- [ ] **Step 2: Typecheck** — `pnpm -w typecheck` (or the repo's tsc command). Per-task vitest doesn't typecheck; fix any cross-cutting type errors here (watch the widened `AdminCreator` nullability + any `as never` mock typings).
- [ ] **Step 3: Lint** — expect 0 errors (warnings at the pre-6C baseline).
- [ ] **Step 4: Build** — `pnpm build`; confirm `/[locale]/admin/users` is in the route manifest.
- [ ] **Step 5: Live DB re-verify** (controller) — the 4 functions exist, `anon` EXECUTE grants = 0, `get_advisors security` shows no new 0028 for them.
- [ ] **Step 6: 2-lens review** (controller, inline) — dispatch `security-auditor` + `code-reviewer` over the 6C diff. Fix actionable findings.

---

## Design notes / scope honesty

- **Suspension semantics:** suspending an **ops** member genuinely revokes access (`is_active_ops()` / `resolveViewerRole` require `status='active'`), which is why the self/last-ops guards are load-bearing. For **creators/merchants**, `'suspended'` is a recorded admin state in v1 — `resolveViewerRole` detects merchants/creators by row existence, not status, so enforcing what a suspended creator/merchant loses is **out of v1 scope** (view + status only). The plan does not overpromise enforcement.
- **No new dashboard metrics:** 6A's `admin_overview_counts` already surfaces creators/merchants/ops counts. 6C adds none.
- **One Phase 6 PR:** after T6, the controller runs `finishing-a-development-branch` to open the single Phase 6 PR (6A+6B+6C) off `feat/phase6-admin-panel`.

## Self-review

- **Spec coverage:** `admin_list_creators/merchants/ops` ✓ (T1); `admin_set_user_status` + no-lockout guards ✓ (T1); `/admin/users` three sections + activate/suspend ✓ (T5); `setUserStatusAction` error mapping ✓ (T4); `listAdminUsers` ✓ (T3); `users` i18n parity ✓ (T2); host test ✓ (T5). The AdminShell already links `/admin/users` (built in 6A) — no nav change needed.
- **Schema correction vs spec:** spec set `status='suspended'` but no table's CHECK allowed it → T1 extends all three constraints. Spec's unqualified `select id, display_name …` inside RETURNS-TABLE fns would raise ambiguous-column → T1 aliases tables + qualifies columns. Spec's grant omitted the anon revoke → T1 revokes `from public, anon` (advisor 0028).
- **Type consistency:** `UserKind`/`UserStatus` defined in `users-actions.ts` and imported by the view + page; `AdminUsers`/`AdminCreator` defined in `users-queries.ts` and imported by the view + tests; `setUserStatusAction` signature `(locale, kind, id, status)` identical across page closure, action, and tests.
- **Placeholder scan:** none — every step has full code.
