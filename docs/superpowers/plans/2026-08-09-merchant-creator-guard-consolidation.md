# Merchant and Creator Guard Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the approved merchant and creator page/action authorization gates onto explicit context-backed guards while preserving every existing route outcome and owner-scoped data contract.

**Architecture:** Add `requireMerchantPage` and `requireCreatorPage` beside the existing server guards. Both call `getAuthorizationContext` once and translate its result into the existing locale redirect/`notFound` outcomes. Migrate eight merchant dashboard pages, creator perks, and two creator actions; leave `/studio/insights` and unrelated direct role callers unchanged.

**Tech Stack:** TypeScript, Next.js 16 App Router, Supabase server client, Vitest 4, Testing Library, pnpm 11, Turbo.

## Global Constraints

- No database schema, RLS policy, RPC, migration, seed, deployment, or production-data change.
- No new role, permission matrix, or role-precedence rule.
- No configurable `requireRolePage` abstraction with caller-selected denial behavior.
- No migration of every direct `resolveViewerRole` caller.
- `/studio/insights` keeps its explicit authenticated non-creator redirect to `/${loc}/studio`.
- `requireTravelerAction` remains authentication-only.
- RLS and existing RPCs remain the final authorization authorities.
- Do not accept a role or merchant identity from a client or page caller.
- Preserve unrelated working-tree changes, including all existing untracked `.superpowers/sdd` files.
- Use `pnpm.cmd` in PowerShell commands on Windows.

---

### Task 1: Add and test explicit page guard adapters

**Files:**
- Modify: `apps/web/tests/admin.guard.test.ts`
- Modify: `apps/web/lib/admin/guard.ts`

**Interfaces:**
- Consumes: `getAuthorizationContext(supabase)` and `Locale`.
- Produces: `requireMerchantPage(supabase, loc): Promise<{ user: { id: string }; merchantId: string }>` and `requireCreatorPage(supabase, loc): Promise<{ user: { id: string } }>`.

- [ ] **Step 1: Write the failing guard tests**

Add these imports to the existing guard import list:

```ts
requireMerchantPage,
requireCreatorPage,
```

Add these suites after `requireOpsPage`:

```ts
describe('requireMerchantPage', () => {
  it('redirects anon to sign-in', async () => {
    contextMock.mockResolvedValueOnce(contextFor({ user: null, role: 'anon', merchantId: null }))
    await expect(requireMerchantPage(sb(), 'en')).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })

  it('notFound for a non-merchant viewer', async () => {
    contextMock.mockResolvedValueOnce(contextFor({ role: 'creator', merchantId: null }))
    await expect(requireMerchantPage(sb(), 'en')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('notFound for a merchant context without a server-derived ID', async () => {
    contextMock.mockResolvedValueOnce(contextFor({ role: 'merchant', merchantId: null }))
    await expect(requireMerchantPage(sb(), 'en')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('returns the authenticated user and server-derived merchant ID', async () => {
    contextMock.mockResolvedValueOnce(contextFor({ role: 'merchant', merchantId: 'merchant-1' }))
    await expect(requireMerchantPage(sb(), 'en')).resolves.toEqual({
      user: { id: 'u1' },
      merchantId: 'merchant-1',
    })
  })
})

describe('requireCreatorPage', () => {
  it('redirects anon to sign-in', async () => {
    contextMock.mockResolvedValueOnce(contextFor({ user: null, role: 'anon' }))
    await expect(requireCreatorPage(sb(), 'en')).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })

  it('notFound for a non-creator viewer', async () => {
    contextMock.mockResolvedValueOnce(contextFor({ role: 'merchant' }))
    await expect(requireCreatorPage(sb(), 'en')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('returns the authenticated creator user', async () => {
    contextMock.mockResolvedValueOnce(contextFor({ user: { id: 'creator-1' }, role: 'creator' }))
    await expect(requireCreatorPage(sb(), 'en')).resolves.toEqual({
      user: { id: 'creator-1' },
    })
  })
})
```

- [ ] **Step 2: Run the guard tests and verify the new exports fail**

Run:

```powershell
pnpm.cmd --dir apps/web exec vitest run tests/admin.guard.test.ts
```

Expected: FAIL during module import because the two new functions are not exported yet.

- [ ] **Step 3: Implement the minimal context-backed page adapters**

Append these functions to `apps/web/lib/admin/guard.ts`, using its existing imports and `Supabase` type:

```ts
/** Page gate: redirect anon, hide non-merchants, and return the server-derived merchant ID. */
export async function requireMerchantPage(
  supabase: Supabase,
  loc: Locale,
): Promise<{ user: { id: string }; merchantId: string }> {
  const context = await getAuthorizationContext(supabase)
  if (!context.user) redirect(`/${loc}/sign-in`)
  if (context.role !== 'merchant' || !context.merchantId) notFound()
  return { user: context.user, merchantId: context.merchantId }
}

/** Page gate: redirect anon and hide non-creators for creator-only pages. */
export async function requireCreatorPage(
  supabase: Supabase,
  loc: Locale,
): Promise<{ user: { id: string } }> {
  const context = await getAuthorizationContext(supabase)
  if (!context.user) redirect(`/${loc}/sign-in`)
  if (context.role !== 'creator') notFound()
  return { user: context.user }
}
```

- [ ] **Step 4: Run the focused guard tests and verify they pass**

Run:

```powershell
pnpm.cmd --dir apps/web exec vitest run tests/admin.guard.test.ts
```

Expected: PASS for the existing guard tests plus the seven new page-guard cases.

- [ ] **Step 5: Review and commit the guard seam**

Run:

```powershell
git diff --check
git add -- apps/web/lib/admin/guard.ts apps/web/tests/admin.guard.test.ts
git commit -m "refactor: add merchant and creator page guards"
```

Expected: only the two guard files are staged; pre-existing `.superpowers/sdd` files remain unstaged.

### Task 2: Route creator actions through `requireCreatorAction`

**Files:**
- Modify: `apps/web/tests/perks.actions.test.ts`
- Modify: `apps/web/lib/perks/actions.ts`
- Modify: `apps/web/tests/missions.invite-actions.test.ts`
- Modify: `apps/web/lib/missions/invite-actions.ts`

**Interfaces:**
- Consumes: `requireCreatorAction(supabase): Promise<{ ok: true; user: { id: string } } | ActionFailure>`.
- Produces: unchanged action result shapes, RPC arguments, friendly error mapping, and revalidation paths.

- [ ] **Step 1: Change the perk action test seam before changing the action**

In `apps/web/tests/perks.actions.test.ts`, replace `roleMock` with:

```ts
const { gateMock, getUserMock, rpcMock } = vi.hoisted(() => ({
  gateMock: vi.fn(async () => ({ ok: true, user: { id: 'c1' } })),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'c1' } } })),
  rpcMock: vi.fn(),
}))
```

Replace the viewer-role mock with:

```ts
vi.mock('@/lib/admin/guard', () => ({ requireCreatorAction: gateMock }))
```

Reset the gate in `beforeEach` and use this denial test:

```ts
it('rejects a non-creator before calling the RPC', async () => {
  gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Creator access is required'] } })
  const r = await redeemPerkAction('p1')
  expect(r.ok).toBe(false)
  expect(rpcMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the perk action test and verify it fails against the old import**

Run:

```powershell
pnpm.cmd --dir apps/web exec vitest run tests/perks.actions.test.ts
```

Expected: FAIL because the action still calls `resolveViewerRole` rather than `gateMock`.

- [ ] **Step 3: Replace the perk action role check with the shared action guard**

In `apps/web/lib/perks/actions.ts`, replace the viewer-role import with:

```ts
import { requireCreatorAction } from '@/lib/admin/guard'
```

Replace the auth/role lines after creating the server client with:

```ts
  const gate = await requireCreatorAction(supabase)
  if (!gate.ok) return gate
```

Leave the RPC and error mapping unchanged.

- [ ] **Step 4: Run the perk action test and verify it passes**

Run:

```powershell
pnpm.cmd --dir apps/web exec vitest run tests/perks.actions.test.ts
```

Expected: PASS for rejection, success, and friendly RPC error mapping.

- [ ] **Step 5: Change the mission invite test seam**

In `apps/web/tests/missions.invite-actions.test.ts`, replace `roleMock` with:

```ts
const { gateMock, serverClientMock, revalidateMock } = vi.hoisted(() => ({
  gateMock: vi.fn(async () => ({ ok: true, user: { id: 'c1' } })),
  serverClientMock: vi.fn(),
  revalidateMock: vi.fn(),
}))
```

Replace the viewer-role mock with:

```ts
vi.mock('@/lib/admin/guard', () => ({ requireCreatorAction: gateMock }))
```

Reset the gate in `beforeEach` and use this denial test:

```ts
it('rejects a non-creator caller before calling the RPC', async () => {
  gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Creator access is required'] } })
  const { client, calls } = makeRpcClient({})
  serverClientMock.mockResolvedValue(client)
  const r = await acceptInviteAction('en', 'mission-1')
  expect(r.ok).toBe(false)
  expect(calls.fn).toBeUndefined()
})
```

- [ ] **Step 6: Run the mission action test and verify it fails against the old import**

Run:

```powershell
pnpm.cmd --dir apps/web exec vitest run tests/missions.invite-actions.test.ts
```

Expected: FAIL because the action still calls `resolveViewerRole` rather than `gateMock`.

- [ ] **Step 7: Replace the mission invite role check with the shared action guard**

In `apps/web/lib/missions/invite-actions.ts`, replace the viewer-role import with:

```ts
import { requireCreatorAction } from '@/lib/admin/guard'
```

Replace the direct role check after the server client is created with:

```ts
  const gate = await requireCreatorAction(supabase)
  if (!gate.ok) return gate
```

Leave the RPC, friendly error mapping, and revalidation unchanged.

- [ ] **Step 8: Run both creator action suites and commit**

Run:

```powershell
pnpm.cmd --dir apps/web exec vitest run tests/perks.actions.test.ts tests/missions.invite-actions.test.ts
```

Expected: PASS for both suites, including no-RPC-on-denial assertions.

Then run:

```powershell
git diff --check
git add -- apps/web/lib/perks/actions.ts apps/web/tests/perks.actions.test.ts apps/web/lib/missions/invite-actions.ts apps/web/tests/missions.invite-actions.test.ts
git commit -m "refactor: centralize creator action gates"
```

### Task 3: Migrate merchant dashboard home and experience list/create pages

**Files:**
- Modify: `apps/web/app/[locale]/merchants/dashboard/page.tsx`
- Modify: `apps/web/app/[locale]/merchants/dashboard/experiences/page.tsx`
- Modify: `apps/web/app/[locale]/merchants/dashboard/experiences/new/page.tsx`
- Modify: `apps/web/tests/merchants.dashboard.host.test.tsx`

**Interfaces:**
- Consumes: `requireMerchantPage(supabase, loc)` from Task 1.
- Produces: dashboard and experience pages that call the guard once; the list page passes the guard's `merchantId` to `listMyExperiences`.

- [ ] **Step 1: Update the dashboard host test to mock the new guard seam**

Replace `resolveViewerRoleMock` with a `merchantPageGateMock` returning `{ user: { id: 'u1' }, merchantId: 'm1' }`, and replace the viewer-role mock with:

```ts
vi.mock('@/lib/admin/guard', () => ({ requireMerchantPage: merchantPageGateMock }))
```

Set denial cases by rejecting the mocked gate with `new Error('redirect:/en/sign-in')` and `new Error('notFound')`. In the experience-list success case, assert:

```ts
expect(listMyExperiences).toHaveBeenCalledWith(expect.anything(), 'm1')
```

Import `listMyExperiences` from the existing mocked experiences query module so the assertion verifies the trusted ID.

- [ ] **Step 2: Run the host test and verify it fails against the old page imports**

Run:

```powershell
pnpm.cmd --dir apps/web exec vitest run tests/merchants.dashboard.host.test.tsx
```

Expected: FAIL because the pages still call `resolveViewerRole` and use their old auth/profile flow.

- [ ] **Step 3: Migrate the dashboard home page**

In `apps/web/app/[locale]/merchants/dashboard/page.tsx`, import only `notFound` from `next/navigation`, remove the viewer-role import, add `import { requireMerchantPage } from '@/lib/admin/guard'`, and replace the auth/role block with:

```ts
  const supabase = await createSupabaseServerClient()
  await requireMerchantPage(supabase, loc)
```

Keep locale validation, dictionary loading, metadata, and rendering unchanged.

- [ ] **Step 4: Migrate the merchant experiences list page**

In `apps/web/app/[locale]/merchants/dashboard/experiences/page.tsx`, make the same import replacement and replace the auth/role/profile block with:

```ts
  const supabase = await createSupabaseServerClient()
  const { merchantId } = await requireMerchantPage(supabase, loc)
  const experiences = await listMyExperiences(supabase, merchantId)
```

Remove the old `auth.getUser`, `resolveViewerRole`, and `merchant_profiles` lookup.

- [ ] **Step 5: Migrate the new-experience page**

In `apps/web/app/[locale]/merchants/dashboard/experiences/new/page.tsx`, replace the auth/role block with:

```ts
  const supabase = await createSupabaseServerClient()
  await requireMerchantPage(supabase, loc)
```

Keep the form render unchanged; this page does not need the returned merchant ID.

- [ ] **Step 6: Run the dashboard host suite and commit**

Run:

```powershell
pnpm.cmd --dir apps/web exec vitest run tests/merchants.dashboard.host.test.tsx
```

Expected: PASS for gate rejection propagation, dashboard rendering, and merchant-ID propagation to the experience list query.

Then run:

```powershell
git diff --check
git add -- "apps/web/app/[locale]/merchants/dashboard/page.tsx" "apps/web/app/[locale]/merchants/dashboard/experiences/page.tsx" "apps/web/app/[locale]/merchants/dashboard/experiences/new/page.tsx" apps/web/tests/merchants.dashboard.host.test.tsx
git commit -m "refactor: migrate merchant dashboard page gates"
```

### Task 4: Migrate remaining merchant dashboard ownership pages

**Files:**
- Modify: `apps/web/app/[locale]/merchants/dashboard/profile/page.tsx`
- Modify: `apps/web/app/[locale]/merchants/dashboard/creators/page.tsx`
- Modify: `apps/web/app/[locale]/merchants/dashboard/insights/page.tsx`
- Modify: `apps/web/app/[locale]/merchants/dashboard/experiences/[experienceId]/availability/page.tsx`
- Modify: `apps/web/app/[locale]/merchants/dashboard/experiences/[experienceId]/edit/page.tsx`
- Modify: `apps/web/tests/merchants.creators.host.test.tsx`
- Modify: `apps/web/tests/merchants.insights.host.test.tsx`

**Interfaces:**
- Consumes: `requireMerchantPage(supabase, loc)` returning `{ user, merchantId }`.
- Produces: remaining merchant pages with one guard decision and server-derived owner IDs.

- [ ] **Step 1: Update creator-discovery and insights host tests to mock the page guard**

In both host tests, replace the role mock with a `merchantPageGateMock` returning the correct user and merchant ID, mock `@/lib/admin/guard` with `requireMerchantPage: merchantPageGateMock`, and remove the viewer-role mock. Use these failures for the existing denial assertions:

```ts
merchantPageGateMock.mockRejectedValueOnce(new Error('notFound'))
merchantPageGateMock.mockRejectedValueOnce(new Error('redirect:/en/sign-in'))
```

For creator discovery, make the tier query return `{ data: { tier: 'growth' } }` when filtering by `id = 'mp1'`; this verifies the page uses the guard ID rather than `user_id`.

- [ ] **Step 2: Run the two host suites and verify they fail against the old page imports**

Run:

```powershell
pnpm.cmd --dir apps/web exec vitest run tests/merchants.creators.host.test.tsx tests/merchants.insights.host.test.tsx
```

Expected: FAIL because the pages still import `resolveViewerRole` and call `auth.getUser` before the mocked guard seam.

- [ ] **Step 3: Migrate profile and insights pages**

In `profile/page.tsx`, import `notFound` and `requireMerchantPage`, then replace the auth/role block with:

```ts
  const supabase = await createSupabaseServerClient()
  const { user } = await requireMerchantPage(supabase, loc)
```

Keep `getMyMerchantProfile(supabase, user.id)` and its missing-profile `notFound()` unchanged.

In `insights/page.tsx`, use:

```ts
  const supabase = await createSupabaseServerClient()
  await requireMerchantPage(supabase, loc)
```

Keep insight loading and rendering unchanged.

- [ ] **Step 4: Migrate creator discovery and key its tier read by the trusted ID**

Replace its auth/role/profile block with:

```ts
  const supabase = await createSupabaseServerClient()
  const { user, merchantId } = await requireMerchantPage(supabase, loc)

  const { data: profile } = await supabase
    .from('merchant_profiles')
    .select('tier')
    .eq('id', merchantId)
    .maybeSingle()
  if (!profile) notFound()
  const tier = (profile.tier as MerchantTier) ?? 'free'
```

Keep saved-creator, mission, search, and action wiring unchanged.

- [ ] **Step 5: Migrate experience availability and edit pages**

In both detail pages, replace the auth/role/profile block with:

```ts
  const supabase = await createSupabaseServerClient()
  const { merchantId } = await requireMerchantPage(supabase, loc)
```

Pass `merchantId` to `getMyExperience(supabase, merchantId, experienceId)`. Keep the existing missing-experience `notFound()` branch, availability query, and rendering unchanged.

- [ ] **Step 6: Run the merchant host suites and commit**

Run:

```powershell
pnpm.cmd --dir apps/web exec vitest run tests/merchants.dashboard.host.test.tsx tests/merchants.creators.host.test.tsx tests/merchants.insights.host.test.tsx
```

Expected: PASS for merchant rendering, guard denial propagation, and creator-discovery tier lookup by context merchant ID.

Then run:

```powershell
git diff --check
git add -- "apps/web/app/[locale]/merchants/dashboard/profile/page.tsx" "apps/web/app/[locale]/merchants/dashboard/creators/page.tsx" "apps/web/app/[locale]/merchants/dashboard/insights/page.tsx" "apps/web/app/[locale]/merchants/dashboard/experiences/[experienceId]/availability/page.tsx" "apps/web/app/[locale]/merchants/dashboard/experiences/[experienceId]/edit/page.tsx" apps/web/tests/merchants.creators.host.test.tsx apps/web/tests/merchants.insights.host.test.tsx
git commit -m "refactor: centralize merchant ownership page gates"
```

### Task 5: Migrate creator perks and preserve the insights exception

**Files:**
- Modify: `apps/web/app/[locale]/studio/perks/page.tsx`
- Modify: `apps/web/tests/studio.perks.host.test.tsx`
- Verify unchanged: `apps/web/app/[locale]/studio/insights/page.tsx`
- Verify unchanged: `apps/web/tests/studio.insights.host.test.tsx`

**Interfaces:**
- Consumes: `requireCreatorPage(supabase, loc)` returning `{ user }`.
- Produces: creator perks using the context-backed page gate; studio insights retaining its explicit non-creator redirect.

- [ ] **Step 1: Update the perks host test to mock the creator page guard**

Replace `roleMock` with a `creatorPageGateMock` returning `{ user: { id: 'c1' } }`, mock `@/lib/admin/guard` with `requireCreatorPage: creatorPageGateMock`, remove the viewer-role mock, and use:

```ts
creatorPageGateMock.mockRejectedValueOnce(new Error('redirect:/en/sign-in'))
creatorPageGateMock.mockRejectedValueOnce(new Error('notFound'))
```

for the anonymous and non-creator tests.

- [ ] **Step 2: Run both studio host suites before changing the page**

Run:

```powershell
pnpm.cmd --dir apps/web exec vitest run tests/studio.perks.host.test.tsx tests/studio.insights.host.test.tsx
```

Expected: the perks suite fails because it still uses `resolveViewerRole`; the insights suite remains green.

- [ ] **Step 3: Migrate the perks page**

In `apps/web/app/[locale]/studio/perks/page.tsx`, import `notFound` and `requireCreatorPage`, remove the viewer-role import, and replace the auth/role block with:

```ts
  const supabase = await createSupabaseServerClient()
  const { user } = await requireCreatorPage(supabase, loc)
```

Keep tier/perk queries, redemption action wiring, and rendering unchanged.

- [ ] **Step 4: Verify the route-specific boundary and commit**

Run:

```powershell
pnpm.cmd --dir apps/web exec vitest run tests/studio.perks.host.test.tsx tests/studio.insights.host.test.tsx
rg -n "resolveViewerRole\(" "apps/web/app/[locale]/studio/perks/page.tsx" "apps/web/app/[locale]/studio/insights/page.tsx"
```

Expected: both suites PASS; the first path has no match and the second retains its intentional direct call.

Then run:

```powershell
git diff --check
git add -- "apps/web/app/[locale]/studio/perks/page.tsx" apps/web/tests/studio.perks.host.test.tsx
git commit -m "refactor: centralize creator perks page gate"
```

### Task 6: Run full focused and repository verification

**Files:**
- Verify: all files changed by Tasks 1–5.
- Do not modify: database, migration, seed, RLS, RPC, deployment, or production-data files.

**Interfaces:**
- Consumes: committed guard, page, action, and test changes.
- Produces: evidence-backed verification report and a clean source diff check.

- [ ] **Step 1: Run the complete focused authorization and host suite**

Run:

```powershell
pnpm.cmd --dir apps/web exec vitest run tests/admin.guard.test.ts tests/perks.actions.test.ts tests/missions.invite-actions.test.ts tests/merchants.dashboard.host.test.tsx tests/merchants.creators.host.test.tsx tests/merchants.insights.host.test.tsx tests/studio.perks.host.test.tsx tests/studio.insights.host.test.tsx
```

Expected: all listed tests PASS.

- [ ] **Step 2: Confirm migrated files no longer contain direct role checks**

Run:

```powershell
rg -n "resolveViewerRole\(" "apps/web/app/[locale]/merchants/dashboard" "apps/web/app/[locale]/studio/perks/page.tsx" apps/web/lib/perks/actions.ts apps/web/lib/missions/invite-actions.ts
```

Expected: no matches. Separately verify the intentional exception:

```powershell
rg -n "resolveViewerRole\(" "apps/web/app/[locale]/studio/insights/page.tsx"
```

- [ ] **Step 3: Run web typecheck and lint**

Run:

```powershell
pnpm.cmd --dir apps/web typecheck
pnpm.cmd --dir apps/web lint
```

Expected: typecheck exits 0; lint exits 0 with no new errors.

- [ ] **Step 4: Run the web build and source diff checks**

Run:

```powershell
pnpm.cmd --dir apps/web build
git diff --check
```

Expected: build exits 0 or reports a separately documented environment/provider gate; `git diff --check` exits 0.

- [ ] **Step 5: Review the final diff and report scope**

Run:

```powershell
git status --short --branch
git log -5 --oneline
git diff origin/codex/ops-authorization-context...HEAD --stat
```

Confirm that changes are limited to the approved guards, pages, tests, and documentation. Do not stage or remove the pre-existing untracked `.superpowers/sdd` files. Report focused tests, typecheck, lint, build, diff check, and any environment gate separately.
