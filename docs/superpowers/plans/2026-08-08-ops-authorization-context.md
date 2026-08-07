# Deepen the Ops Authorization Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize viewer-role precedence and server authorization context without changing existing Ops, merchant, creator, traveler, browser, or RLS behavior.

**Architecture:** A browser-safe pure policy converts role facts into the existing `ViewerRole` union. A server-only authorization context reads the authenticated user once, gathers the current role facts and merchant profile ID, and feeds that policy; the existing guards become outcome adapters while `resolveViewerRole` remains a compatibility facade. The browser hook keeps its auth lifecycle and stale-resolution protections but delegates role selection to the same pure policy.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, Supabase SSR/browser clients, Vitest 4, Testing Library, pnpm 11, Turborepo.

## Global Constraints

- Preserve role precedence exactly: `ops > merchant > active creator > traveler`.
- Preserve the existing `anon`, `creator`, `creator-pending`, `merchant`, `traveler`, and `ops` role vocabulary; the current resolver still does not return `creator-pending`.
- Anonymous pages redirect to `/${locale}/sign-in`; unauthorized Ops pages continue through `notFound()`.
- Unauthorized actions continue returning the existing `formError` shape and message family.
- `requireMerchantAction` continues returning a server-derived `merchantId`; no browser-provided ID is accepted.
- `requireTravelerAction` remains authentication-only and must not begin querying role tables.
- Role-query errors remain absent facts, matching the current data-only behavior.
- The server context performs one `auth.getUser()` call per authorization-context decision.
- The browser hook must not import the server authorization context or any server-only dependency.
- RLS remains the final enforcement layer; do not modify RLS, migrations, RPCs, schema, seeds, or production data.
- Use `pnpm.cmd` for Windows commands and preserve the pre-existing untracked `.codex-patches/`, `.pnpm-store/`, `.superpowers/brainstorm/`, and `task3-red.patch` files.
- Use test-first steps and commit each completed task with only that task's intended files staged.

---

## File Map

Create these focused modules and tests:

- `apps/web/lib/auth/viewer-role-policy.ts` — browser-safe role vocabulary, role-fact type, and pure precedence function.
- `apps/web/lib/auth/authorization-context.ts` — server-only authenticated user, role facts, and merchant identity adapter.
- `apps/web/tests/auth.viewer-role-policy.test.ts` — exhaustive pure-policy matrix.
- `apps/web/tests/auth.authorization-context.test.ts` — one-auth-read, merchant-ID, and query-error semantics.

Modify these existing files:

- `apps/web/lib/auth/viewer-role.ts` — delegate role-only resolution to the context and re-export the role type.
- `apps/web/lib/admin/guard.ts` — adapt page and role-based action guards to the context; retain the traveler-only auth guard.
- `apps/web/lib/auth/useViewerRole.ts` — delegate local precedence to the shared policy while retaining browser lifecycle code.
- `apps/web/tests/admin.guard.test.ts` — mock the context and cover the preserved guard outcomes, merchant ID, and traveler boundary.

Keep these existing regression suites active without changing their public contracts:

- `apps/web/tests/auth.viewer-role.test.ts`
- `apps/web/tests/auth.useViewerRole.test.tsx`
- `apps/web/tests/experiences.actions.test.ts`
- `apps/web/tests/experiences.availability-actions.test.ts`
- `apps/web/tests/merchants.profile-actions.test.ts`
- `apps/web/tests/merchants.saved-actions.test.ts`
- `apps/web/tests/merchants.invite-actions.test.ts`

---

### Task 1: Extract and Test the Pure Viewer-Role Policy

**Files:**
- Create: `apps/web/tests/auth.viewer-role-policy.test.ts`
- Create: `apps/web/lib/auth/viewer-role-policy.ts`

**Interfaces:**
- Produces `ViewerRole = 'anon' | 'creator' | 'creator-pending' | 'merchant' | 'traveler' | 'ops'`.
- Produces `ViewerRoleFacts = { authenticated: boolean; hasActiveOps: boolean; hasMerchantProfile: boolean; hasActiveCreator: boolean }`.
- Produces `resolveViewerRoleFromFacts(facts: ViewerRoleFacts): ViewerRole`.
- Performs no I/O and imports no Supabase, Next navigation, React, or server-only module.

- [ ] **Step 1: Write the failing policy matrix.**

Create `apps/web/tests/auth.viewer-role-policy.test.ts` with the cases that define the entire policy surface:

```ts
import { describe, expect, it } from 'vitest'
import {
  resolveViewerRoleFromFacts,
  type ViewerRoleFacts,
} from '@/lib/auth/viewer-role-policy'

const facts = (overrides: Partial<ViewerRoleFacts> = {}): ViewerRoleFacts => ({
  authenticated: true,
  hasActiveOps: false,
  hasMerchantProfile: false,
  hasActiveCreator: false,
  ...overrides,
})

describe('resolveViewerRoleFromFacts', () => {
  it('returns anon before considering role facts when there is no session', () => {
    expect(resolveViewerRoleFromFacts(facts({ authenticated: false, hasActiveOps: true }))).toBe('anon')
  })

  it('gives active Ops membership precedence over merchant and creator facts', () => {
    expect(resolveViewerRoleFromFacts(facts({
      hasActiveOps: true,
      hasMerchantProfile: true,
      hasActiveCreator: true,
    }))).toBe('ops')
  })

  it('gives merchant profile precedence over active creator', () => {
    expect(resolveViewerRoleFromFacts(facts({
      hasMerchantProfile: true,
      hasActiveCreator: true,
    }))).toBe('merchant')
  })

  it('returns creator only for an active creator fact', () => {
    expect(resolveViewerRoleFromFacts(facts({ hasActiveCreator: true }))).toBe('creator')
  })

  it('falls back to traveler for an authenticated user without a higher role', () => {
    expect(resolveViewerRoleFromFacts(facts())).toBe('traveler')
  })
})
```

- [ ] **Step 2: Run the policy test to verify it fails.**

Run:

```powershell
pnpm.cmd --filter web test -- tests/auth.viewer-role-policy.test.ts
```

Expected: FAIL because `@/lib/auth/viewer-role-policy` does not exist yet.

- [ ] **Step 3: Implement the minimal browser-safe policy module.**

Create `apps/web/lib/auth/viewer-role-policy.ts` with exactly the shared vocabulary, facts, and precedence:

```ts
export type ViewerRole = 'anon' | 'creator' | 'creator-pending' | 'merchant' | 'traveler' | 'ops'

export type ViewerRoleFacts = {
  authenticated: boolean
  hasActiveOps: boolean
  hasMerchantProfile: boolean
  hasActiveCreator: boolean
}

export function resolveViewerRoleFromFacts(facts: ViewerRoleFacts): ViewerRole {
  if (!facts.authenticated) return 'anon'
  if (facts.hasActiveOps) return 'ops'
  if (facts.hasMerchantProfile) return 'merchant'
  if (facts.hasActiveCreator) return 'creator'
  return 'traveler'
}
```

- [ ] **Step 4: Run the policy test to verify it passes.**

Run:

```powershell
pnpm.cmd --filter web test -- tests/auth.viewer-role-policy.test.ts
```

Expected: PASS with five policy cases.

- [ ] **Step 5: Review and commit the pure policy.**

Run:

```powershell
git diff --check
git add -- apps/web/lib/auth/viewer-role-policy.ts apps/web/tests/auth.viewer-role-policy.test.ts
git commit -m "refactor: extract viewer role policy"
```

Expected: one commit containing only the policy module and its test.

### Task 2: Add the Server Authorization Context and Compatibility Facade

**Files:**
- Create: `apps/web/tests/auth.authorization-context.test.ts`
- Create: `apps/web/lib/auth/authorization-context.ts`
- Modify: `apps/web/lib/auth/viewer-role.ts`
- Test: `apps/web/tests/auth.viewer-role.test.ts`

**Interfaces:**
- Consumes: `resolveViewerRoleFromFacts` and `ViewerRole` from `./viewer-role-policy`.
- Produces `ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>`.
- Produces `AuthorizationUser = { id: string }`.
- Produces `AuthorizationContext = { user: AuthorizationUser | null; role: ViewerRole; merchantId: string | null }`.
- Produces `getAuthorizationContext(supabase: ServerSupabase): Promise<AuthorizationContext>`.
- Keeps `resolveViewerRole(supabase: ServerSupabase): Promise<ViewerRole>` as the existing role-only facade.

- [ ] **Step 1: Write failing context tests for authentication reuse, merchant identity, and errors.**

Create `apps/web/tests/auth.authorization-context.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { getAuthorizationContext } from '@/lib/auth/authorization-context'

type Row = Record<string, unknown> | null

function fakeSupabase(options: {
  user: { id: string } | null
  rows?: Record<string, Row>
  errors?: Record<string, unknown>
}) {
  const getUser = vi.fn(async () => ({ data: { user: options.user }, error: null }))
  const from = vi.fn((table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({
        data: options.rows?.[table] ?? null,
        error: options.errors?.[table] ?? null,
      }),
    }
    return builder
  })

  return {
    supabase: { auth: { getUser }, from } as never,
    getUser,
    from,
  }
}

describe('getAuthorizationContext', () => {
  it('returns anon without querying role tables when there is no session', async () => {
    const { supabase, from } = fakeSupabase({ user: null })

    await expect(getAuthorizationContext(supabase)).resolves.toEqual({
      user: null,
      role: 'anon',
      merchantId: null,
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('reads auth once, preserves Ops precedence, and retains merchant ID', async () => {
    const { supabase, getUser } = fakeSupabase({
      user: { id: 'u1' },
      rows: {
        kinnso_ops_members: { id: 'ops-1' },
        merchant_profiles: { id: 'merchant-1' },
        creators: { status: 'active' },
      },
    })

    await expect(getAuthorizationContext(supabase)).resolves.toEqual({
      user: { id: 'u1' },
      role: 'ops',
      merchantId: 'merchant-1',
    })
    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('treats role-query errors as absent facts and falls through to remaining facts', async () => {
    const { supabase } = fakeSupabase({
      user: { id: 'u1' },
      rows: { merchant_profiles: { id: 'merchant-1' } },
      errors: { kinnso_ops_members: new Error('ops read failed') },
    })

    await expect(getAuthorizationContext(supabase)).resolves.toMatchObject({
      role: 'merchant',
      merchantId: 'merchant-1',
    })
  })
})
```

- [ ] **Step 2: Run the context test to verify it fails.**

Run:

```powershell
pnpm.cmd --filter web test -- tests/auth.authorization-context.test.ts
```

Expected: FAIL because `@/lib/auth/authorization-context` does not exist yet.

- [ ] **Step 3: Implement the server context with one auth read and current data semantics.**

Create `apps/web/lib/auth/authorization-context.ts`:

```ts
import type { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  resolveViewerRoleFromFacts,
  type ViewerRole,
} from './viewer-role-policy'

export type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export type AuthorizationUser = { id: string }

export type AuthorizationContext = {
  user: AuthorizationUser | null
  role: ViewerRole
  merchantId: string | null
}

export async function getAuthorizationContext(
  supabase: ServerSupabase,
): Promise<AuthorizationContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, role: 'anon', merchantId: null }
  }

  const { data: ops } = await supabase
    .from('kinnso_ops_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  const { data: merchant } = await supabase
    .from('merchant_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: creator } = await supabase
    .from('creators')
    .select('status')
    .eq('id', user.id)
    .maybeSingle()

  const merchantId = merchant && typeof merchant.id === 'string' ? merchant.id : null

  return {
    user: { id: user.id },
    role: resolveViewerRoleFromFacts({
      authenticated: true,
      hasActiveOps: Boolean(ops),
      hasMerchantProfile: Boolean(merchant),
      hasActiveCreator: creator?.status === 'active',
    }),
    merchantId,
  }
}
```

The context deliberately reads the existing tables and ignores query-error fields exactly as the current resolver does. A query error contributes no data fact; it never creates an active role.

- [ ] **Step 4: Convert `viewer-role.ts` into the compatibility facade.**

Replace its duplicated table reads with:

```ts
import { getAuthorizationContext, type ServerSupabase } from './authorization-context'
import type { ViewerRole } from './viewer-role-policy'

export type { ViewerRole } from './viewer-role-policy'

export async function resolveViewerRole(
  supabase: ServerSupabase,
): Promise<ViewerRole> {
  return (await getAuthorizationContext(supabase)).role
}
```

Keep the existing export path and return type so the 27 current server callers remain source-compatible.

- [ ] **Step 5: Run the context and compatibility tests.**

Run:

```powershell
pnpm.cmd --filter web test -- tests/auth.authorization-context.test.ts tests/auth.viewer-role.test.ts
```

Expected: PASS for the new context cases and all existing role-resolution cases.

- [ ] **Step 6: Review and commit the server context.**

Run:

```powershell
git diff --check
git add -- apps/web/lib/auth/authorization-context.ts apps/web/lib/auth/viewer-role.ts apps/web/tests/auth.authorization-context.test.ts apps/web/tests/auth.viewer-role.test.ts
git commit -m "refactor: centralize server authorization context"
```

Expected: one commit containing the server context, compatibility facade, and context tests. If the existing role test needs no content change, stage only the files that actually changed.

### Task 3: Convert Page and Action Guards into Context Adapters

**Files:**
- Modify: `apps/web/lib/admin/guard.ts`
- Modify: `apps/web/tests/admin.guard.test.ts`

**Interfaces:**
- Consumes: `getAuthorizationContext(supabase)` from `@/lib/auth/authorization-context`.
- Preserves `requireOpsPage(supabase, loc): Promise<{ user: { id: string } }>`.
- Preserves `requireOpsAction(supabase): Promise<{ ok: true; user: { id: string } } | ActionFailure>`.
- Preserves `requireCreatorAction(supabase): Promise<{ ok: true; user: { id: string } } | ActionFailure>`.
- Preserves `requireMerchantAction(supabase): Promise<{ ok: true; user: { id: string }; merchantId: string } | ActionFailure>`.
- Preserves `requireTravelerAction(supabase): Promise<{ ok: true; user: { id: string } } | ActionFailure>` without role-table reads.

- [ ] **Step 1: Replace the guard test's role mock with a context mock and add merchant/traveler cases.**

In `apps/web/tests/admin.guard.test.ts`, replace the `resolveViewerRole` mock and role-only user setup with this context fixture:

```ts
const { contextMock, getUserMock } = vi.hoisted(() => ({
  contextMock: vi.fn(),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
}))

vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: contextMock,
}))

type TestContext = {
  user: { id: string } | null
  role: 'anon' | 'creator' | 'creator-pending' | 'merchant' | 'traveler' | 'ops'
  merchantId: string | null
}

const contextFor = (overrides: Partial<TestContext> = {}): TestContext => ({
  user: { id: 'u1' },
  role: 'ops',
  merchantId: null,
  ...overrides,
})

const sb = () => ({
  auth: { getUser: getUserMock },
  from: vi.fn(),
}) as never

beforeEach(() => {
  contextMock.mockReset()
  contextMock.mockResolvedValue(contextFor())
  getUserMock.mockReset()
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
})
```

Update the existing page/action assertions to use `contextMock.mockResolvedValueOnce(contextFor(...))`, and add these two contract tests:

```ts
it('returns the server-derived merchant ID without a second profile lookup', async () => {
  const from = vi.fn()
  contextMock.mockResolvedValueOnce(contextFor({ role: 'merchant', merchantId: 'merchant-1' }))

  await expect(requireMerchantAction({ from } as never)).resolves.toEqual({
    ok: true,
    user: { id: 'u1' },
    merchantId: 'merchant-1',
  })
  expect(from).not.toHaveBeenCalled()
})

it('rejects a merchant context that has no server-derived merchant ID', async () => {
  contextMock.mockResolvedValueOnce(contextFor({ role: 'merchant', merchantId: null }))

  const result = await requireMerchantAction(sb())

  expect(result.ok).toBe(false)
})

it('keeps traveler actions authentication-only', async () => {
  const from = vi.fn()
  const result = await requireTravelerAction({
    auth: { getUser: async () => ({ data: { user: { id: 'traveler-1' } } }) },
    from,
  } as never)

  expect(result).toEqual({ ok: true, user: { id: 'traveler-1' } })
  expect(contextMock).not.toHaveBeenCalled()
  expect(from).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the guard tests to verify the context contract fails before the guard refactor.**

Run:

```powershell
pnpm.cmd --filter web test -- tests/admin.guard.test.ts
```

Expected: FAIL because the current guard imports `resolveViewerRole` and still performs its own `auth.getUser()` call instead of using the mocked context.

- [ ] **Step 3: Refactor `apps/web/lib/admin/guard.ts` to adapt context outcomes.**

Replace the role-based guard bodies with this pattern and leave `requireTravelerAction` unchanged:

```ts
import { notFound, redirect } from 'next/navigation'
import type { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthorizationContext } from '@/lib/auth/authorization-context'
import { formError, type ActionFailure } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export async function requireOpsPage(supabase: Supabase, loc: Locale): Promise<{ user: { id: string } }> {
  const context = await getAuthorizationContext(supabase)
  if (!context.user) redirect(`/${loc}/sign-in`)
  if (context.role !== 'ops') notFound()
  return { user: context.user }
}

export async function requireOpsAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string } } | ActionFailure> {
  const context = await getAuthorizationContext(supabase)
  if (!context.user) return formError('Sign in is required')
  if (context.role !== 'ops') return formError('Active ops access is required')
  return { ok: true, user: context.user }
}

export async function requireCreatorAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string } } | ActionFailure> {
  const context = await getAuthorizationContext(supabase)
  if (!context.user) return formError('Sign in is required')
  if (context.role !== 'creator') return formError('Creator access is required')
  return { ok: true, user: context.user }
}

export async function requireMerchantAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string }; merchantId: string } | ActionFailure> {
  const context = await getAuthorizationContext(supabase)
  if (!context.user) return formError('Sign in is required')
  if (context.role !== 'merchant' || !context.merchantId) {
    return formError('Merchant access is required')
  }
  return { ok: true, user: context.user, merchantId: context.merchantId }
}

export async function requireTravelerAction(
  supabase: Supabase,
): Promise<{ ok: true; user: { id: string } } | ActionFailure> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return formError('Sign in is required')
  return { ok: true, user }
}
```

Keep the existing comments documenting creator ownership, merchant scoping, traveler semantics, and RLS. Update them only to describe the context source rather than a local profile lookup.

- [ ] **Step 4: Run the guard and merchant action regression suites.**

Run:

```powershell
pnpm.cmd --filter web test -- tests/admin.guard.test.ts tests/experiences.actions.test.ts tests/experiences.availability-actions.test.ts tests/merchants.profile-actions.test.ts tests/merchants.saved-actions.test.ts tests/merchants.invite-actions.test.ts
```

Expected: PASS with unchanged action result shapes and merchant scoping assertions.

- [ ] **Step 5: Review and commit the guard adapters.**

Run:

```powershell
git diff --check
git add -- apps/web/lib/admin/guard.ts apps/web/tests/admin.guard.test.ts
git commit -m "refactor: adapt auth guards to authorization context"
```

Expected: one commit containing only the guard refactor and its tests.

### Task 4: Make the Browser Hook Consume the Shared Policy

**Files:**
- Modify: `apps/web/lib/auth/useViewerRole.ts`
- Test: `apps/web/tests/auth.useViewerRole.test.tsx`

**Interfaces:**
- Consumes: `resolveViewerRoleFromFacts(facts)` and `ViewerRole` from `./viewer-role-policy`.
- Preserves `useViewerRole(override?: ViewerRole): ViewerRole`.
- Preserves initial `anon`, explicit override, auth subscription, parallel role reads, stale-resolution barrier, and cleanup behavior.
- Must not import `./authorization-context` or any server-only module.

- [ ] **Step 1: Run the existing browser characterization suite before changing the hook.**

Run:

```powershell
pnpm.cmd --filter web test -- tests/auth.useViewerRole.test.tsx
```

Expected: PASS for the current lifecycle, precedence, stale-resolution, and override behavior. This is the baseline for the behavior-preserving refactor.

- [ ] **Step 2: Replace only the local role-selection helper.**

In `apps/web/lib/auth/useViewerRole.ts`, change the imports and `resolveSignedInRole` body to:

```ts
import { resolveViewerRoleFromFacts, type ViewerRole } from './viewer-role-policy'
export type { ViewerRole } from './viewer-role-policy'
```

```ts
const resolveSignedInRole = async (userId: string): Promise<ViewerRole> => {
  const [{ data: ops }, { data: merchant }, { data: creator }] = await Promise.all([
    supabase
      .from('kinnso_ops_members')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('merchant_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('creators')
      .select('status')
      .eq('id', userId)
      .maybeSingle(),
  ])

  return resolveViewerRoleFromFacts({
    authenticated: true,
    hasActiveOps: Boolean(ops),
    hasMerchantProfile: Boolean(merchant),
    hasActiveCreator: creator?.status === 'active',
  })
}
```

Do not move the Supabase client, `useEffect`, subscription, override, `active` flag, or `latestResolution` into the pure policy module.

- [ ] **Step 3: Run the browser suite and verify the import boundary.**

Run:

```powershell
pnpm.cmd --filter web test -- tests/auth.useViewerRole.test.tsx
rg -n "authorization-context|from './viewer-role'|from './viewer-role-policy'" apps/web/lib/auth/useViewerRole.ts
```

Expected: browser tests PASS; the hook imports `./viewer-role-policy` and has no `authorization-context` or server-client import.

- [ ] **Step 4: Run the complete focused authorization surface.**

Run:

```powershell
pnpm.cmd --filter web test -- tests/auth.viewer-role-policy.test.ts tests/auth.authorization-context.test.ts tests/auth.viewer-role.test.ts tests/auth.useViewerRole.test.tsx tests/admin.guard.test.ts
```

Expected: PASS across pure policy, server context, compatibility facade, browser lifecycle, and guards.

- [ ] **Step 5: Review and commit the browser adapter.**

Run:

```powershell
git diff --check
git add -- apps/web/lib/auth/useViewerRole.ts apps/web/tests/auth.useViewerRole.test.tsx
git commit -m "refactor: share viewer role policy with browser hook"
```

Expected: one commit containing the browser-policy integration and any necessary test-only adjustment.

### Task 5: Run Full Verification and Prepare the Handoff

**Files:**
- No new source files. Review the four task commits and the final working tree.

**Interfaces:**
- Consumes all prior task outputs.
- Produces a verification report separating focused tests, web typecheck/lint/build, broader tests, and environment blockers.

- [ ] **Step 1: Run the focused authorization and merchant regression suites together.**

Run:

```powershell
pnpm.cmd --filter web test -- tests/auth.viewer-role-policy.test.ts tests/auth.authorization-context.test.ts tests/auth.viewer-role.test.ts tests/auth.useViewerRole.test.tsx tests/admin.guard.test.ts tests/experiences.actions.test.ts tests/experiences.availability-actions.test.ts tests/merchants.profile-actions.test.ts tests/merchants.saved-actions.test.ts tests/merchants.invite-actions.test.ts
```

Expected: PASS. Any failure must be classified as a source regression, a pre-existing baseline failure, or an environment/provider blocker before changing code.

- [ ] **Step 2: Run web typecheck and lint.**

Run:

```powershell
pnpm.cmd --filter web typecheck
pnpm.cmd --filter web lint
```

Expected: both commands exit successfully with no new import-boundary or type errors.

- [ ] **Step 3: Run the web build and broader repository tests.**

Run:

```powershell
pnpm.cmd --filter web build
pnpm.cmd test
```

Expected: the web build and repository test task pass. If the build or broader task requires unavailable environment/provider credentials, record the exact blocker and retain the focused verification evidence; do not add secrets or mutate production data.

- [ ] **Step 4: Verify the final diff and protected boundaries.**

Run:

```powershell
git diff --check
git status --short --branch
rg -n "authorization-context|from './viewer-role'|from './viewer-role-policy'" apps/web/lib/auth/useViewerRole.ts apps/web/lib/auth/viewer-role-policy.ts
rg -n "from './viewer-role-policy'|resolveViewerRoleFromFacts" apps/web/lib/auth/viewer-role.ts apps/web/lib/auth/useViewerRole.ts apps/web/lib/auth/authorization-context.ts
```

Expected: no whitespace errors; only intended authorization files are modified or committed; the browser hook and pure policy do not import the server context; the server resolver, hook, and context all reference the shared pure policy. Any final correction must be made in the relevant task and re-run through that task's focused test and commit step.

## Spec Coverage Self-Review

- Role vocabulary and precedence are covered by Task 1 and preserved by Tasks 2 and 4.
- One authenticated-user read and merchant-ID reuse are covered by Task 2 and Task 3.
- Page/action outcome compatibility is covered by Task 3.
- Browser overrides, auth subscription, parallel reads, and stale-resolution protection are characterized in Task 4.
- Query-error fallback is covered by Task 2.
- RLS, schema, RPC, migration, seed, production-data, and browser-boundary constraints are repeated in the global constraints and Task 5.
- Existing `resolveViewerRole` callers remain supported through the facade in Task 2.

The plan contains no unresolved implementation placeholders. The cross-task types and function names are consistent: `ViewerRoleFacts` feeds `resolveViewerRoleFromFacts`; `getAuthorizationContext` returns `AuthorizationContext`; guards consume `context.user`, `context.role`, and `context.merchantId`; and `resolveViewerRole` returns `context.role`.
