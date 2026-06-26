# Phase 6A — Admin Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ops-only `/admin` shell — gate, layout, sidebar nav, and a dashboard with overview counts — that Phase 6B (perks) and 6C (users) plug into.

**Architecture:** A localized `app/[locale]/admin/` route group. A shared `requireOpsPage`/`requireOpsAction` gate (reusing `resolveViewerRole === 'ops'`). `admin/layout.tsx` gates then renders `<AdminShell>` (sidebar: Dashboard·Perks·Users) around the page. `admin/page.tsx` is the dashboard, showing counts of creators/merchants/ops (perks/redemption counts arrive with 6B). No DB migration — reuses `kinnso_ops_members`.

**Tech Stack:** Next.js 16.2.9 (modified — read `node_modules/next/dist/docs/` before editing layouts/pages), React 19, TypeScript, Supabase, vitest. Spec: `docs/superpowers/specs/2026-06-26-phase6-admin-panel-design.md`.

---

## Conventions
- Path alias `@/` → `apps/web/`. Run one test from `apps/web/`: `npx vitest run tests/<file>`. Typecheck: `pnpm --filter web typecheck`.
- Ops gate facts: `resolveViewerRole(supabase)` returns `'anon'|'creator'|'creator-pending'|'merchant'|'ops'`; ops = a `kinnso_ops_members` row with `status='active'`.
- Page/layout params are `Promise<{ locale: string }>` (await them). `isLocale`/`LOCALES`/`Locale` from `@/lib/i18n/config`; `getDictionary` from `@/lib/i18n/dictionaries`; `Messages` type from `@/lib/i18n/messages/en` (DEFAULT export).
- i18n: new group must be added to all 7 locale files + the `Messages` interface in `en.ts` + the `GROUPS` array in `tests/i18n.locale-parity.test.ts`.
- The dashboard counts ONLY existing tables (creators/merchants/ops). Do NOT reference `partner_perks`/`perk_redemptions` — they don't exist until 6B.

## File structure
| File | Create | Responsibility |
|---|---|---|
| `apps/web/lib/admin/result.ts` | ✓ | `ActionResult`/`ActionFailure`/`formError` for admin actions |
| `apps/web/lib/admin/guard.ts` | ✓ | `requireOpsPage` / `requireOpsAction` |
| `apps/web/lib/admin/queries.ts` | ✓ | `getAdminOverview` (creators/merchants/ops counts) |
| `apps/web/lib/i18n/messages/{en,…}.ts` | mod | `admin` group ×7 |
| `apps/web/tests/i18n.locale-parity.test.ts` | mod | add `'admin'` to `GROUPS` |
| `apps/web/components/kinnso/admin/AdminShell.tsx` | ✓ | sidebar nav + content frame |
| `apps/web/components/kinnso/admin/AdminDashboardView.tsx` | ✓ | dashboard counts UI |
| `apps/web/app/[locale]/admin/layout.tsx` | ✓ | gate + AdminShell |
| `apps/web/app/[locale]/admin/page.tsx` | ✓ | dashboard page |

---

## Task 1: Admin action-result helpers

**Files:** Create `apps/web/lib/admin/result.ts`; Test `apps/web/tests/admin.result.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { formError, type ActionResult } from '@/lib/admin/result'

describe('admin result', () => {
  it('formError wraps a message under errors.form and is not ok', () => {
    const r = formError('nope')
    expect(r.ok).toBe(false)
    expect(r.errors.form).toEqual(['nope'])
  })
  it('ActionResult success carries the payload', () => {
    const r: ActionResult<{ id: string }> = { ok: true, id: 'x' }
    expect(r.ok && r.id).toBe('x')
  })
})
```
- [ ] **Step 2: Run → FAIL** `npx vitest run tests/admin.result.test.ts` (module missing)
- [ ] **Step 3: Implement**
```ts
export type ValidationErrors = Record<string, string[]>
export type ActionFailure = { ok: false; errors: ValidationErrors }
export type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

export const formError = (message: string): ActionFailure => ({ ok: false, errors: { form: [message] } })
```
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git add apps/web/lib/admin/result.ts apps/web/tests/admin.result.test.ts && git commit -m "feat(sp6a): admin action-result helpers"`

---

## Task 2: Ops gate (`requireOpsPage` / `requireOpsAction`)

**Files:** Create `apps/web/lib/admin/guard.ts`; Test `apps/web/tests/admin.guard.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { roleMock, getUserMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))

import { requireOpsPage, requireOpsAction } from '@/lib/admin/guard'
const sb = () => ({ auth: { getUser: getUserMock } }) as never

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }) })

describe('requireOpsPage', () => {
  it('redirects anon to sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(requireOpsPage(sb(), 'en')).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('notFound for non-ops', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(requireOpsPage(sb(), 'en')).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('returns the user for ops', async () => {
    expect(await requireOpsPage(sb(), 'en')).toEqual({ user: { id: 'u1' } })
  })
})

describe('requireOpsAction', () => {
  it('formError for non-ops', async () => {
    roleMock.mockResolvedValueOnce('merchant')
    const r = await requireOpsAction(sb())
    expect(r.ok).toBe(false)
  })
  it('ok+user for ops', async () => {
    const r = await requireOpsAction(sb())
    expect(r).toEqual({ ok: true, user: { id: 'u1' } })
  })
})
```
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement**
```ts
import { notFound, redirect } from 'next/navigation'
import type { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { formError, type ActionFailure } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

/** Page gate: redirect anon to sign-in, notFound for non-ops. Returns the ops user. */
export async function requireOpsPage(supabase: Supabase, loc: Locale): Promise<{ user: { id: string } }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'ops') notFound()
  return { user }
}

/** Action gate: typed failure for anon/non-ops; ok+user for ops. */
export async function requireOpsAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string } } | ActionFailure> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return formError('Sign in is required')
  if ((await resolveViewerRole(supabase)) !== 'ops') return formError('Active ops access is required')
  return { ok: true, user }
}
```
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git add apps/web/lib/admin/guard.ts apps/web/tests/admin.guard.test.ts && git commit -m "feat(sp6a): ops gate for admin pages and actions"`

---

## Task 3: `getAdminOverview` counts

**Files:** Create `apps/web/lib/admin/queries.ts`; Test `apps/web/tests/admin.queries.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect, vi } from 'vitest'
import { getAdminOverview } from '@/lib/admin/queries'

function client(counts: Record<string, number>) {
  return {
    from: (table: string) => ({
      select: () => {
        const b: Record<string, unknown> = {
          eq: () => b,
          then: (res: (v: { count: number }) => void) => res({ count: counts[table] ?? 0 }),
        }
        return b
      },
    }),
  }
}

describe('getAdminOverview', () => {
  it('returns creators/merchants/ops counts', async () => {
    const o = await getAdminOverview(client({ creators: 3, merchant_profiles: 2, kinnso_ops_members: 1 }) as never)
    expect(o).toEqual({ creators: 3, merchants: 2, ops: 1 })
  })
})
```
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement**
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>
export interface AdminOverview { creators: number; merchants: number; ops: number }

async function countRows(supabase: Client, table: 'creators' | 'merchant_profiles' | 'kinnso_ops_members', activeOps = false): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true })
  if (activeOps) q = q.eq('status', 'active')
  const { count } = await q
  return count ?? 0
}

/** Dashboard overview. Perk/redemption counts are added in Phase 6B. */
export async function getAdminOverview(supabase: Client): Promise<AdminOverview> {
  const [creators, merchants, ops] = await Promise.all([
    countRows(supabase, 'creators'),
    countRows(supabase, 'merchant_profiles'),
    countRows(supabase, 'kinnso_ops_members', true),
  ])
  return { creators, merchants, ops }
}
```
- [ ] **Step 4: Run → PASS** (if the mock's chain shape fights the test, adjust the test's `client`, not the implementation)
- [ ] **Step 5: Commit** `git add apps/web/lib/admin/queries.ts apps/web/tests/admin.queries.test.ts && git commit -m "feat(sp6a): admin overview counts"`

---

## Task 4: `admin` i18n group ×7 + parity

**Files:** Modify `apps/web/lib/i18n/messages/{en,ja,ko,th,zh-cn,zh-hk,zh-tw}.ts`, `apps/web/tests/i18n.locale-parity.test.ts`

- [ ] **Step 1: Add `'admin'` to `GROUPS`** in `tests/i18n.locale-parity.test.ts` (append to the array).
- [ ] **Step 2: Run parity → FAIL** `npx vitest run tests/i18n.locale-parity.test.ts`
- [ ] **Step 3: Add the `admin` group to the `Messages` interface in `en.ts`**
```ts
  admin: {
    navDashboard: string; navPerks: string; navUsers: string
    dashboardTitle: string; dashboardSubtitle: string
    statCreators: string; statMerchants: string; statOps: string
  }
```
- [ ] **Step 4: Add English values to the `en` default export**
```ts
  admin: {
    navDashboard: 'Dashboard', navPerks: 'Perks', navUsers: 'Users',
    dashboardTitle: 'Admin', dashboardSubtitle: 'Manage perks, users, and platform content.',
    statCreators: 'Creators', statMerchants: 'Merchants', statOps: 'Ops members',
  },
```
- [ ] **Step 5: Mirror translated keys into the other 6 locales** (ja/ko/th/zh-cn/zh-hk/zh-tw) — same keys, real translations matching each file's tone.
- [ ] **Step 6: Run parity → PASS** and `pnpm --filter web typecheck` → PASS
- [ ] **Step 7: Commit** `git add apps/web/lib/i18n/messages/*.ts apps/web/tests/i18n.locale-parity.test.ts && git commit -m "feat(sp6a): admin i18n group across 7 locales"`

---

## Task 5: `AdminShell` + `AdminDashboardView` components

**Files:** Create `apps/web/components/kinnso/admin/AdminShell.tsx`, `apps/web/components/kinnso/admin/AdminDashboardView.tsx`; Test `apps/web/tests/kinnso.AdminShell.test.tsx`

- [ ] **Step 1: Failing test**
```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin' }))

import { AdminShell } from '@/components/kinnso/admin/AdminShell'
import { AdminDashboardView } from '@/components/kinnso/admin/AdminDashboardView'

describe('AdminShell', () => {
  it('renders the three nav links with correct hrefs and the children', () => {
    render(<AdminShell locale="en" t={en.admin}><p>child-content</p></AdminShell>)
    expect((screen.getByRole('link', { name: en.admin.navDashboard }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin')
    expect((screen.getByRole('link', { name: en.admin.navPerks }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin/perks')
    expect((screen.getByRole('link', { name: en.admin.navUsers }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin/users')
    expect(screen.getByText('child-content')).toBeTruthy()
  })
})

describe('AdminDashboardView', () => {
  it('renders the overview counts', () => {
    render(<AdminDashboardView t={en.admin} overview={{ creators: 5, merchants: 2, ops: 1 }} />)
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText(en.admin.statCreators)).toBeTruthy()
  })
})
```
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement `AdminShell.tsx`**
```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function AdminShell({ locale, t, children }: { locale: Locale; t: Messages['admin']; children: ReactNode }) {
  const pathname = usePathname()
  const nav = [
    { href: `/${locale}/admin`, label: t.navDashboard },
    { href: `/${locale}/admin/perks`, label: t.navPerks },
    { href: `/${locale}/admin/users`, label: t.navUsers },
  ]
  return (
    <div className="k-container flex flex-col gap-6 py-8 md:flex-row">
      <aside className="md:w-56 md:shrink-0">
        <nav className="flex gap-2 md:flex-col">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? 'page' : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-bold ${pathname === item.href ? 'bg-kinnso-orange/10 text-kinnso-orange' : 'text-kinnso-muted hover:text-kinnso-ink'}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  )
}

export default AdminShell
```
- [ ] **Step 4: Implement `AdminDashboardView.tsx`**
```tsx
import type { Messages } from '@/lib/i18n/messages/en'
import type { AdminOverview } from '@/lib/admin/queries'
import { TicketCard } from '@/components/kinnso/MarketPassport'

export function AdminDashboardView({ t, overview }: { t: Messages['admin']; overview: AdminOverview }) {
  const stats = [
    { label: t.statCreators, value: overview.creators },
    { label: t.statMerchants, value: overview.merchants },
    { label: t.statOps, value: overview.ops },
  ]
  return (
    <main>
      <h1 className="k-display">{t.dashboardTitle}</h1>
      <p className="mt-2 text-kinnso-muted">{t.dashboardSubtitle}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <TicketCard key={s.label} className="p-5">
            <p className="text-3xl font-black text-kinnso-ink">{s.value}</p>
            <p className="mt-1 text-sm text-kinnso-muted">{s.label}</p>
          </TicketCard>
        ))}
      </div>
    </main>
  )
}

export default AdminDashboardView
```
- [ ] **Step 5: Run → PASS** (verify `TicketCard` export path against `components/kinnso/MarketPassport.tsx`; adjust import if needed)
- [ ] **Step 6: Commit** `git add apps/web/components/kinnso/admin/ apps/web/tests/kinnso.AdminShell.test.tsx && git commit -m "feat(sp6a): AdminShell nav + dashboard view"`

---

## Task 6: `admin/layout.tsx` + `admin/page.tsx`

**Files:** Create `apps/web/app/[locale]/admin/layout.tsx`, `apps/web/app/[locale]/admin/page.tsx`; Test `apps/web/tests/admin.host.test.tsx`

- [ ] **Step 1: Read installed Next docs** for the layout signature in this modified Next 16 (`node_modules/next/dist/docs/`), then write the failing host test:
```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
const { roleMock, getUserMock, overviewMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  overviewMock: vi.fn(async () => ({ creators: 5, merchants: 2, ops: 1 })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/admin/queries', () => ({ getAdminOverview: overviewMock }))
vi.mock('@/components/kinnso/admin/AdminShell', () => ({ AdminShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import AdminLayout from '@/app/[locale]/admin/layout'
import AdminDashboardPage from '@/app/[locale]/admin/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }) })

describe('admin layout + dashboard host', () => {
  it('layout notFounds for non-ops', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(AdminLayout({ children: <p>x</p>, params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('layout renders the shell + children for ops', async () => {
    const ui = await AdminLayout({ children: <p>kid</p>, params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByTestId('shell')).toBeTruthy()
    expect(screen.getByText('kid')).toBeTruthy()
  })
  it('dashboard renders overview counts', async () => {
    const ui = await AdminDashboardPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('5')).toBeTruthy()
  })
})
```
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement `admin/layout.tsx`**
```tsx
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { AdminShell } from '@/components/kinnso/admin/AdminShell'

export default async function AdminLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  return <AdminShell locale={loc} t={messages.admin}>{children}</AdminShell>
}
```
- [ ] **Step 4: Implement `admin/page.tsx`**
```tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAdminOverview } from '@/lib/admin/queries'
import { AdminDashboardView } from '@/components/kinnso/admin/AdminDashboardView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function AdminDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)
  const supabase = await createSupabaseServerClient()
  const overview = await getAdminOverview(supabase)
  return <AdminDashboardView t={messages.admin} overview={overview} />
}
```
- [ ] **Step 5: Run → PASS**, then `pnpm --filter web typecheck` → PASS
- [ ] **Step 6: Commit** `git add "apps/web/app/[locale]/admin" apps/web/tests/admin.host.test.tsx && git commit -m "feat(sp6a): /admin layout (ops-gated) + dashboard page"`

---

## Task 7: Final gate

**Files:** none (verification)

- [ ] **Step 1: Full suite** (from `apps/web/`): `pkill -f vitest 2>/dev/null; npx vitest run --no-file-parallelism --testTimeout=30000` → all pass (network-flaky live-Supabase integration tests pass with the 30s timeout).
- [ ] **Step 2: Typecheck** `pnpm --filter web typecheck` → 0 errors.
- [ ] **Step 3: Lint** `pnpm --filter web lint` → 0 errors.
- [ ] **Step 4: Build** `pnpm --filter web build` → success; `/[locale]/admin` in the route manifest.
- [ ] **Step 5: Commit** any gate fixes.

## Self-review notes
- **Spec coverage:** §3 (6A shell) → Tasks 1–6; gate helper → T2; layout/nav/dashboard → T5/T6; overview → T3; i18n → T4; testing → all + T7. Perks/redemption dashboard counts intentionally deferred to 6B (noted in T3).
- **Type consistency:** `AdminOverview {creators,merchants,ops}` defined in T3, consumed in T5 (`AdminDashboardView`) and T6 (page). `Messages['admin']` keys defined in T4, used in T5/T6. `requireOpsPage(supabase, loc)` signature consistent T2↔T6.
- **No placeholders:** all steps carry real code; the only deferred item (perk counts) is explicitly scoped to 6B.
