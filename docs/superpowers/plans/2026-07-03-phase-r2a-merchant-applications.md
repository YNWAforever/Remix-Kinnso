# Phase R2A — Merchant Application Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user apply to become a merchant at `/merchants/apply`, and let
ops approve or reject the application from a new tab in the existing Merchants console —
replacing today's ops-SQL-only path to `merchant_profiles` creation, and closing a
pre-existing RLS hole that lets any authenticated user self-grant a merchant profile.

**Architecture:** One migration adds `merchant_applications` (owner-insert-only, ops-read,
immutable once submitted) plus two audited `SECURITY DEFINER` RPCs
(`admin_approve_merchant_application` creates the real `merchant_profiles` row;
`admin_reject_merchant_application` just records the decision) and locks down
`merchant_profiles`'s existing owner-insert policy and owner-update column grants. The app
layer mirrors two established patterns side by side: the public submit is a direct
owner-RLS insert with a honeypot (like `agent_waitlist`); the ops queue is RPC-backed
audited moderation (like the Merchants Directory's status/tier actions). No changes to
`resolveViewerRole`/`useViewerRole`/`gate.ts` are needed — role resolution already keys
off `merchant_profiles`, which this phase does not touch until approval.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase
Postgres (RLS + `SECURITY DEFINER` RPCs), TypeScript, Vitest, Tailwind v4 (`kinnso-*` /
`k2-*` public tokens, legacy `k-*` admin-console tokens).

---

## Ground truth this plan relies on (verified 2026-07-03)

- Repo clone: `/private/tmp/claude-947366395/-Users-willylai-Documents-Claude-Projects-Remix-Kinnso2/2650fdcf-67be-48d5-b3c7-b8f8887011af/scratchpad/Remix-Kinnso`, branch `feat/revision-r2a` (cut from `feat/redesign-r1c` tip `7eadc9f`; spec committed `37e5c1a`).
- Design spec: `docs/superpowers/specs/2026-07-03-phase-r2-merchant-supply-design.md` (§D-R2-1, D-R2-2, D-R2-7 R2A scope, §4 point 3).
- Live Supabase project: `scryfkefedzuetfdtrvl` (org `eerkaskxrxxfrtgetuqx` — confirmed correct this session).
- `merchant_profiles` today (live, `apps/web/supabase` mirrors it): `id, user_id (unique, FK auth.users), company_name, contact_name, contact_email, website_url, status ('active'|'paused'|'archived'|'suspended'), tier ('free'|'growth'), created_at, updated_at`. RLS: `merchant_profiles_owner_insert` (any authenticated user, `user_id = auth.uid()`, **no column restriction**) — this is the hole this plan closes. `merchant_profiles_owner_update` similarly unrestricted.
- `resolveViewerRole` (`apps/web/lib/auth/viewer-role.ts`) and `useViewerRole` (`apps/web/lib/auth/useViewerRole.ts`): any row in `merchant_profiles` (any status) → role `'merchant'`. This plan never inserts into `merchant_profiles` from app code — only the new `admin_approve_merchant_application` RPC does, so role purity holds automatically.
- `apps/web/lib/auth/gate.ts` `gatedPrefixes` do **not** include `merchants/apply` — intentional. Unlike `/merchants/post`, the new `/merchants/apply` page renders different content for anon vs. signed-in itself (no proxy-level hard redirect), because the codebase's sign-in flow (`apps/web/app/[locale]/sign-in/SignInForm.tsx`) hard-navigates to `/${locale}/studio` on success with no return-URL mechanism anywhere in the codebase — adding one is out of scope for this phase.
- `ops_audit_log_append(p_entity_type text, p_entity_id uuid, p_action text, p_reason text default null, p_metadata jsonb default '{}'::jsonb)` — existing helper, derives actor from `auth.uid()`.
- `is_active_ops_role(p_min text)` — existing helper (Phase 12C); this plan gates both new RPCs at `'moderator'`, matching the merchant lifecycle RPCs (`admin_set_merchant_status` etc.).
- `public.set_updated_at()` — existing trigger function (used by `testimonials_set_updated_at`); reused here.
- Migration naming: `YYYYMMDDHHMMSS_slug.sql`. Latest is `20260703090000_r1c_agent_waitlist_and_testimonials_updated_at.sql`. This plan's migration: `20260703100000_r2a_merchant_applications.sql`.
- `packages/db/types.ts` is **hand-patched**, not regenerated (established pattern since Phase 10).
- Locale files: `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts`. `Messages` interface + English object both live in `en.ts`. `tests/i18n.locale-parity.test.ts` auto-derives `GROUPS` from `Object.keys(en)` — no registration step beyond adding the group to all 7 files.
- `tests/kinnso.route-parity.test.tsx` only walks links out of `Navbar`, `Footer`, `HomeView` — it does **not** exercise `ForMerchantsView`, so it will not catch a bad `/merchants/apply` href. Covered instead by this plan's own host tests.
- Vitest: run scoped subsets via `cd apps/web && npx vitest run <pattern>` (never `pnpm --filter web test -- <pattern>` — see `[[vitest-scoping-gotcha]]`, it runs the full ~900-test suite and can time out).
- `apps/web/lib/admin/result.ts` (`ActionResult`/`ActionFailure`/`formError`) is the **ops-only** result module. Owner-facing (non-ops) action files in this codebase define their own local `ActionFailure`/`ActionResult` types instead of importing it (see `apps/web/lib/missions/actions.ts:31-34`) — this plan follows that same local-type convention in the new owner-facing files.

## File map

| Path | Change |
|---|---|
| `supabase/migrations/20260703100000_r2a_merchant_applications.sql` | Create |
| `packages/db/types.ts` | Modify (hand-patch: new table + 2 functions) |
| `apps/web/lib/merchants/application-validation.ts` | Create |
| `apps/web/lib/merchants/application-actions.ts` | Create |
| `apps/web/lib/merchants/application-queries.ts` | Create |
| `apps/web/lib/admin/merchant-applications-queries.ts` | Create |
| `apps/web/lib/admin/merchant-applications-actions.ts` | Create |
| `apps/web/components/kinnso/pages/MerchantApplyView.tsx` | Create |
| `apps/web/components/kinnso/admin/merchants/MerchantApplicationsView.tsx` | Create |
| `apps/web/app/[locale]/merchants/apply/page.tsx` | Create |
| `apps/web/app/[locale]/admin/merchants/applications/page.tsx` | Create |
| `apps/web/components/kinnso/admin/merchants/MerchantsTabs.tsx` | Modify (add 3rd tab) |
| `apps/web/components/kinnso/pages/ForMerchantsView.tsx` | Modify (CTA hrefs → `/merchants/apply`) |
| `apps/web/lib/i18n/messages/en.ts` | Modify (2 new groups + 1 new key in `merchantsOps`) |
| `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` | Modify (mirror the above, translated) |
| `apps/web/tests/for-merchants.host.test.tsx` | Modify (new href assertions) |
| `apps/web/tests/merchants.application-actions.test.ts` | Create |
| `apps/web/tests/merchants.application-queries.test.ts` | Create |
| `apps/web/tests/admin.merchant-applications-actions.test.ts` | Create |
| `apps/web/tests/admin.merchant-applications-queries.test.ts` | Create |
| `apps/web/tests/merchants.apply.host.test.tsx` | Create |
| `apps/web/tests/admin.merchant-applications.host.test.tsx` | Create |

---

### Task 1: Database migration — `merchant_applications` table, RLS, RPCs, and the `merchant_profiles` security fix

**Files:**
- Create: `supabase/migrations/20260703100000_r2a_merchant_applications.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Phase R2A — Merchant self-serve application funnel.
-- (1) merchant_applications: owner-insert-only (one pending row per user), owner-read-own,
--     ops-read-all. Immutable once submitted — no owner update/delete; the only mutations
--     are the two audited RPCs below (moderator+, reason-required, row-locked, no-op
--     guarded, audited — same shape as the Phase 11 merchant lifecycle RPCs).
-- (2) SECURITY FIX: merchant_profiles_owner_insert let ANY authenticated user insert their
--     OWN merchant_profiles row (any status/tier — no UI ever used this, but the RLS policy
--     was live). Application creation is now RPC-only. Also column-restrict owner UPDATE so
--     an owner can never rewrite their own status/tier via a hand-crafted API call.

create table public.merchant_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  contact_name text,
  contact_email text not null
    constraint merchant_applications_email_shape
    check (contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(contact_email) <= 254),
  website_url text,
  pitch text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by_ops_member_id uuid references public.kinnso_ops_members(id),
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index merchant_applications_one_pending_per_user
  on public.merchant_applications(user_id) where status = 'pending';
create index merchant_applications_user_idx on public.merchant_applications(user_id);
create index merchant_applications_status_idx on public.merchant_applications(status, created_at desc);

alter table public.merchant_applications enable row level security;

create policy merchant_applications_owner_insert on public.merchant_applications
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

create policy merchant_applications_owner_select on public.merchant_applications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy merchant_applications_ops_select on public.merchant_applications
  for select to authenticated
  using (public.is_active_ops());

create trigger merchant_applications_set_updated_at
  before update on public.merchant_applications
  for each row execute procedure public.set_updated_at();

-- No owner update/delete policies — an application is immutable once submitted.
revoke all on table public.merchant_applications from anon;
grant select, insert on table public.merchant_applications to authenticated;

-- 2. Approve: creates the real merchant_profiles row, stamps the application, audits.
create or replace function public.admin_approve_merchant_application(p_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_app public.merchant_applications%rowtype;
  v_existing uuid;
  v_profile_id uuid;
begin
  if not public.is_active_ops_role('moderator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  select * into v_app from public.merchant_applications where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_app.status <> 'pending' then raise exception 'not_pending'; end if;

  select id into v_existing from public.merchant_profiles where user_id = v_app.user_id;
  if v_existing is not null then raise exception 'already_merchant'; end if;

  insert into public.merchant_profiles (user_id, company_name, contact_name, contact_email, website_url, status, tier)
  values (v_app.user_id, v_app.company_name, v_app.contact_name, v_app.contact_email, v_app.website_url, 'active', 'free')
  returning id into v_profile_id;

  update public.merchant_applications set
    status = 'approved',
    decided_by_ops_member_id = (select id from public.kinnso_ops_members where user_id = auth.uid() and status = 'active'),
    decided_at = now(),
    decision_reason = p_reason,
    updated_at = now()
  where id = p_id;

  perform public.ops_audit_log_append('merchant_application', p_id, 'application.approved', p_reason,
    jsonb_build_object('merchant_profile_id', v_profile_id));

  return v_profile_id;
end $$;
revoke all on function public.admin_approve_merchant_application(uuid, text) from public, anon;
grant execute on function public.admin_approve_merchant_application(uuid, text) to authenticated;

-- 3. Reject: records the decision only, no merchant_profiles write.
create or replace function public.admin_reject_merchant_application(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.is_active_ops_role('moderator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  select status into v_status from public.merchant_applications where id = p_id for update;
  if v_status is null then raise exception 'not_found'; end if;
  if v_status <> 'pending' then raise exception 'not_pending'; end if;

  update public.merchant_applications set
    status = 'rejected',
    decided_by_ops_member_id = (select id from public.kinnso_ops_members where user_id = auth.uid() and status = 'active'),
    decided_at = now(),
    decision_reason = p_reason,
    updated_at = now()
  where id = p_id;

  perform public.ops_audit_log_append('merchant_application', p_id, 'application.rejected', p_reason, '{}'::jsonb);
end $$;
revoke all on function public.admin_reject_merchant_application(uuid, text) from public, anon;
grant execute on function public.admin_reject_merchant_application(uuid, text) to authenticated;

-- 4. SECURITY FIX: close the pre-existing merchant_profiles self-grant hole.
drop policy if exists merchant_profiles_owner_insert on public.merchant_profiles;
revoke insert on public.merchant_profiles from authenticated;
revoke update on public.merchant_profiles from authenticated;
grant update (company_name, contact_name, contact_email, website_url) on public.merchant_profiles to authenticated;
```

- [ ] **Step 2: Apply the migration to the live project**

Use the Supabase MCP tool `apply_migration` with `project_id: scryfkefedzuetfdtrvl`,
`name: r2a_merchant_applications`, and the SQL body above (exclude the leading comment
block or include it — both are fine, `apply_migration` runs the whole file as one
transaction).

- [ ] **Step 3: Verify live**

Run via the Supabase MCP `execute_sql` tool against `scryfkefedzuetfdtrvl`:

```sql
select
  (select count(*) from information_schema.tables
   where table_schema='public' and table_name='merchant_applications') as table_exists,
  (select count(*) from pg_policy where polrelid = 'public.merchant_applications'::regclass) as policy_count,
  (select count(*) from pg_proc where proname in
    ('admin_approve_merchant_application','admin_reject_merchant_application')) as rpc_count,
  (select count(*) from pg_policy where polrelid = 'public.merchant_profiles'::regclass
    and polname = 'merchant_profiles_owner_insert') as owner_insert_still_exists;
```

Expected: `table_exists=1`, `policy_count=3`, `rpc_count=2`, `owner_insert_still_exists=0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260703100000_r2a_merchant_applications.sql
git commit -m "feat(db): merchant application funnel + close merchant_profiles self-grant hole

New merchant_applications table (owner-insert-only, ops-read) + audited
admin_approve_merchant_application/admin_reject_merchant_application RPCs
(moderator+, reason-required). Drops the pre-existing
merchant_profiles_owner_insert policy (any authenticated user could insert
their own row at any status/tier) and column-restricts owner UPDATE."
```

---

### Task 2: Hand-patch `packages/db/types.ts`

**Files:**
- Modify: `packages/db/types.ts`

- [ ] **Step 1: Add the `merchant_applications` table entry**

Insert alphabetically among the `Tables` block (immediately before the `merchant_profiles`
entry, matching the existing alphabetical ordering):

```typescript
      merchant_applications: {
        Row: {
          company_name: string
          contact_email: string
          contact_name: string | null
          created_at: string
          decided_at: string | null
          decided_by_ops_member_id: string | null
          decision_reason: string | null
          id: string
          pitch: string | null
          status: string
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          company_name: string
          contact_email: string
          contact_name?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by_ops_member_id?: string | null
          decision_reason?: string | null
          id?: string
          pitch?: string | null
          status?: string
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          company_name?: string
          contact_email?: string
          contact_name?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by_ops_member_id?: string | null
          decision_reason?: string | null
          id?: string
          pitch?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: []
      }
```

- [ ] **Step 2: Add the two new RPCs to the `Functions` block**

Insert alphabetically (immediately before the existing `admin_bulk_set_creator_status`
entry, or wherever alphabetical order places them — `admin_approve_merchant_application`
sorts before `admin_bulk_...`):

```typescript
      admin_approve_merchant_application: {
        Args: { p_id: string; p_reason: string }
        Returns: string
      }
      admin_reject_merchant_application: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors introduced by this file (pre-existing unrelated errors, if any,
are out of scope).

- [ ] **Step 4: Commit**

```bash
git add packages/db/types.ts
git commit -m "chore(db): hand-patch types.ts for merchant_applications + new RPCs"
```

---

### Task 3: Owner-side validation, submit action, and status query

**Files:**
- Create: `apps/web/lib/merchants/application-validation.ts`
- Create: `apps/web/lib/merchants/application-actions.ts`
- Create: `apps/web/lib/merchants/application-queries.ts`
- Test: `apps/web/tests/merchants.application-actions.test.ts`
- Test: `apps/web/tests/merchants.application-queries.test.ts`

- [ ] **Step 1: Write the validation module**

```typescript
// apps/web/lib/merchants/application-validation.ts
export type ValidationErrors = Record<string, string[]>

export type MerchantApplicationInput = {
  companyName: string
  contactName: string
  contactEmail: string
  websiteUrl: string
  pitch: string
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Field-level validation for the public merchant application form. `{}` = valid. */
export function validateMerchantApplicationInput(input: MerchantApplicationInput): ValidationErrors {
  const errors: ValidationErrors = {}
  if (!input.companyName.trim()) errors.companyName = ['Company name is required']
  const email = input.contactEmail.trim()
  if (!email) errors.contactEmail = ['Contact email is required']
  else if (!EMAIL_RE.test(email) || email.length > 254) errors.contactEmail = ['Enter a valid email address']
  const website = input.websiteUrl.trim()
  if (website && !/^https?:\/\//i.test(website)) errors.websiteUrl = ['Website must start with http:// or https://']
  if (input.pitch.length > 2000) errors.pitch = ['Keep your pitch under 2000 characters']
  return errors
}
```

- [ ] **Step 2: Write the failing test for the submit action**

```typescript
// apps/web/tests/merchants.application-actions.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const authMock = vi.fn()
const insertMock = vi.fn()
const selectMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: authMock },
    from: () => ({ insert: insertMock, select: selectMock }),
  }),
}))

import { submitMerchantApplicationAction } from '@/lib/merchants/application-actions'

const validInput = {
  companyName: 'Acme Travel',
  contactName: 'Jane Doe',
  contactEmail: 'jane@acme.example',
  websiteUrl: 'https://acme.example',
  pitch: 'We run boutique tours.',
}

beforeEach(() => {
  authMock.mockReset()
  insertMock.mockReset()
})

describe('submitMerchantApplicationAction', () => {
  it('rejects anonymous callers', async () => {
    authMock.mockResolvedValue({ data: { user: null } })
    const res = await submitMerchantApplicationAction(validInput)
    expect(res.ok).toBe(false)
  })

  it('silently succeeds without inserting when the honeypot is filled', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await submitMerchantApplicationAction(validInput, 'filled-by-a-bot')
    expect(res.ok).toBe(true)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('returns field errors for invalid input without inserting', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await submitMerchantApplicationAction({ ...validInput, companyName: '' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.companyName).toBeTruthy()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('inserts a pending application for a valid signed-in submission', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    insertMock.mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'app1' }, error: null }) }),
    })
    const res = await submitMerchantApplicationAction(validInput)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.id).toBe('app1')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', company_name: 'Acme Travel', status: 'pending' }),
    )
  })

  it('treats a duplicate-pending unique violation as a friendly form error', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    insertMock.mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate' } }) }),
    })
    const res = await submitMerchantApplicationAction(validInput)
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd apps/web && npx vitest run tests/merchants.application-actions.test.ts`
Expected: FAIL — `Cannot find module '@/lib/merchants/application-actions'`

- [ ] **Step 4: Write the submit action**

```typescript
// apps/web/lib/merchants/application-actions.ts
'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { validateMerchantApplicationInput, type MerchantApplicationInput, type ValidationErrors } from '@/lib/merchants/application-validation'

type ActionFailure = { ok: false; errors: ValidationErrors }
type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

const formError = (message: string): ActionFailure => ({ ok: false, errors: { form: [message] } })

/**
 * Direct owner-RLS insert (merchant_applications_owner_insert), not an RPC — matches the
 * agent_waitlist precedent: no money/state beyond a pending review row, RLS bounds the
 * damage (one pending row per user via the DB's partial unique index), and a duplicate
 * insert (23505, from an already-pending application) is treated as a soft success so the
 * UI doesn't leak whether a row already exists. `hp` is a form honeypot — filled only by
 * bots, which get a silent success and no write.
 */
export async function submitMerchantApplicationAction(
  input: MerchantApplicationInput,
  hp?: string,
): Promise<ActionResult<{ id: string }>> {
  if (hp) return { ok: true, id: '' }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return formError('Sign in is required')

  const errors = validateMerchantApplicationInput(input)
  if (Object.keys(errors).length) return { ok: false, errors }

  const { data, error } = await supabase
    .from('merchant_applications')
    .insert({
      user_id: user.id,
      company_name: input.companyName.trim(),
      contact_name: input.contactName.trim() || null,
      contact_email: input.contactEmail.trim(),
      website_url: input.websiteUrl.trim() || null,
      pitch: input.pitch.trim() || null,
    })
    .select('id')
    .single()

  if (error || !data) {
    if (error && error.code !== '23505') console.error('[merchants:apply] submit failed', error)
    return formError('Your application could not be submitted. Please try again.')
  }

  return { ok: true, id: data.id as string }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/merchants.application-actions.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Write the failing test for the status query**

```typescript
// apps/web/tests/merchants.application-queries.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { getMyMerchantApplication } from '@/lib/merchants/application-queries'

function fakeSupabase(row: unknown, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: () => Promise.resolve({ data: row, error }),
            }),
          }),
        }),
      }),
    }),
  } as never
}

describe('getMyMerchantApplication', () => {
  it('returns null when the user has never applied', async () => {
    const result = await getMyMerchantApplication(fakeSupabase(null), 'u1')
    expect(result).toBeNull()
  })

  it('maps the most recent application row', async () => {
    const row = {
      id: 'app1', status: 'pending', company_name: 'Acme', decision_reason: null, created_at: '2026-07-03T00:00:00Z',
    }
    const result = await getMyMerchantApplication(fakeSupabase(row), 'u1')
    expect(result).toEqual({
      id: 'app1', status: 'pending', companyName: 'Acme', decisionReason: null, createdAt: '2026-07-03T00:00:00Z',
    })
  })

  it('propagates query errors instead of swallowing them', async () => {
    await expect(getMyMerchantApplication(fakeSupabase(null, { message: 'boom' }), 'u1')).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 7: Run to verify it fails**

Run: `cd apps/web && npx vitest run tests/merchants.application-queries.test.ts`
Expected: FAIL — `Cannot find module '@/lib/merchants/application-queries'`

- [ ] **Step 8: Write the query module**

```typescript
// apps/web/lib/merchants/application-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export type MyMerchantApplication = {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  companyName: string
  decisionReason: string | null
  createdAt: string
}

/**
 * The caller's single most recent application (owner-RLS scoped). A user can re-apply
 * after a rejection, so this is the LATEST row, not "any row" — an old rejected row must
 * never mask a fresh pending one. Errors propagate (no silent null on a real failure).
 */
export async function getMyMerchantApplication(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<MyMerchantApplication | null> {
  const { data, error } = await supabase
    .from('merchant_applications')
    .select('id, status, company_name, decision_reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id as string,
    status: data.status as MyMerchantApplication['status'],
    companyName: data.company_name as string,
    decisionReason: data.decision_reason as string | null,
    createdAt: data.created_at as string,
  }
}
```

- [ ] **Step 9: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/merchants.application-queries.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/merchants/application-validation.ts apps/web/lib/merchants/application-actions.ts apps/web/lib/merchants/application-queries.ts apps/web/tests/merchants.application-actions.test.ts apps/web/tests/merchants.application-queries.test.ts
git commit -m "feat(web): owner-side merchant application submit + status query"
```

---

### Task 4: Ops-side queries and actions for the applications queue

**Files:**
- Create: `apps/web/lib/admin/merchant-applications-queries.ts`
- Create: `apps/web/lib/admin/merchant-applications-actions.ts`
- Test: `apps/web/tests/admin.merchant-applications-queries.test.ts`
- Test: `apps/web/tests/admin.merchant-applications-actions.test.ts`

- [ ] **Step 1: Write the failing test for the ops queries**

```typescript
// apps/web/tests/admin.merchant-applications-queries.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { listPendingMerchantApplications, listDecidedMerchantApplications } from '@/lib/admin/merchant-applications-queries'

function fakeSupabase(rows: unknown[], error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: rows, error }) }),
        in: () => ({ order: () => Promise.resolve({ data: rows, error }) }),
      }),
    }),
  } as never
}

const row = {
  id: 'app1', user_id: 'u1', company_name: 'Acme', contact_name: 'Jane', contact_email: 'jane@acme.example',
  website_url: 'https://acme.example', pitch: 'Boutique tours', status: 'pending',
  decided_at: null, decision_reason: null, created_at: '2026-07-03T00:00:00Z',
}

describe('listPendingMerchantApplications', () => {
  it('maps snake_case rows to camelCase', async () => {
    const rows = await listPendingMerchantApplications(fakeSupabase([row]))
    expect(rows).toEqual([{
      id: 'app1', userId: 'u1', companyName: 'Acme', contactName: 'Jane', contactEmail: 'jane@acme.example',
      websiteUrl: 'https://acme.example', pitch: 'Boutique tours', status: 'pending',
      decidedAt: null, decisionReason: null, createdAt: '2026-07-03T00:00:00Z',
    }])
  })

  it('propagates errors', async () => {
    await expect(listPendingMerchantApplications(fakeSupabase([], { message: 'boom' }))).rejects.toBeTruthy()
  })
})

describe('listDecidedMerchantApplications', () => {
  it('maps rows the same way', async () => {
    const decided = { ...row, id: 'app2', status: 'approved', decided_at: '2026-07-03T01:00:00Z', decision_reason: 'looks great' }
    const rows = await listDecidedMerchantApplications(fakeSupabase([decided]))
    expect(rows[0].status).toBe('approved')
    expect(rows[0].decisionReason).toBe('looks great')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run tests/admin.merchant-applications-queries.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the ops queries module**

```typescript
// apps/web/lib/admin/merchant-applications-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export type AdminMerchantApplication = {
  id: string
  userId: string
  companyName: string
  contactName: string | null
  contactEmail: string
  websiteUrl: string | null
  pitch: string | null
  status: 'pending' | 'approved' | 'rejected'
  decidedAt: string | null
  decisionReason: string | null
  createdAt: string
}

type Row = {
  id: string; user_id: string; company_name: string; contact_name: string | null; contact_email: string
  website_url: string | null; pitch: string | null; status: string
  decided_at: string | null; decision_reason: string | null; created_at: string
}

function toDomain(r: Row): AdminMerchantApplication {
  return {
    id: r.id,
    userId: r.user_id,
    companyName: r.company_name,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    websiteUrl: r.website_url,
    pitch: r.pitch,
    status: r.status as AdminMerchantApplication['status'],
    decidedAt: r.decided_at,
    decisionReason: r.decision_reason,
    createdAt: r.created_at,
  }
}

const COLUMNS = 'id, user_id, company_name, contact_name, contact_email, website_url, pitch, status, decided_at, decision_reason, created_at'

/** Ops-only read (RLS: merchant_applications_ops_select); only ever called behind requireOpsPage. */
export async function listPendingMerchantApplications(
  supabase: SupabaseClient<Database>,
): Promise<AdminMerchantApplication[]> {
  const { data, error } = await supabase
    .from('merchant_applications')
    .select(COLUMNS)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => toDomain(r as unknown as Row))
}

/** Ops-only read of the last 50 decided applications, newest decision first. */
export async function listDecidedMerchantApplications(
  supabase: SupabaseClient<Database>,
): Promise<AdminMerchantApplication[]> {
  const { data, error } = await supabase
    .from('merchant_applications')
    .select(COLUMNS)
    .in('status', ['approved', 'rejected'])
    .order('decided_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []).map((r) => toDomain(r as unknown as Row))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/admin.merchant-applications-queries.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for the ops actions**

```typescript
// apps/web/tests/admin.merchant-applications-actions.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const requireOpsActionMock = vi.fn()
const rpcMock = vi.fn()

vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: requireOpsActionMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ rpc: rpcMock }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { approveMerchantApplicationAction, rejectMerchantApplicationAction } from '@/lib/admin/merchant-applications-actions'

beforeEach(() => {
  requireOpsActionMock.mockReset()
  rpcMock.mockReset()
})

describe('approveMerchantApplicationAction', () => {
  it('rejects non-ops callers before calling the RPC', async () => {
    requireOpsActionMock.mockResolvedValue({ ok: false, errors: { form: ['Active ops access is required'] } })
    const res = await approveMerchantApplicationAction('en', 'app1', 'looks great')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects a blank reason before calling the RPC', async () => {
    requireOpsActionMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } })
    const res = await approveMerchantApplicationAction('en', 'app1', '   ')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls the RPC and returns the new merchant profile id on success', async () => {
    requireOpsActionMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } })
    rpcMock.mockResolvedValue({ data: 'profile-1', error: null })
    const res = await approveMerchantApplicationAction('en', 'app1', 'looks great')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.merchantProfileId).toBe('profile-1')
    expect(rpcMock).toHaveBeenCalledWith('admin_approve_merchant_application', { p_id: 'app1', p_reason: 'looks great' })
  })

  it('maps a not_pending RPC error to a friendly message', async () => {
    requireOpsActionMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } })
    rpcMock.mockResolvedValue({ data: null, error: { message: 'not_pending' } })
    const res = await approveMerchantApplicationAction('en', 'app1', 'looks great')
    expect(res.ok).toBe(false)
  })
})

describe('rejectMerchantApplicationAction', () => {
  it('calls the reject RPC on success', async () => {
    requireOpsActionMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } })
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await rejectMerchantApplicationAction('en', 'app1', 'not a fit')
    expect(res.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('admin_reject_merchant_application', { p_id: 'app1', p_reason: 'not a fit' })
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd apps/web && npx vitest run tests/admin.merchant-applications-actions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 7: Write the ops actions module**

```typescript
// apps/web/lib/admin/merchant-applications-actions.ts
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateReason } from '@/lib/admin/ops-validation'
import type { Locale } from '@/lib/i18n/config'

const applicationsPath = (locale: Locale) => `/${locale}/admin/merchants/applications`

const FRIENDLY: Record<string, string> = {
  forbidden: 'Active ops access is required.',
  reason_required: 'A reason is required.',
  not_found: 'That application no longer exists. Refresh and try again.',
  not_pending: 'This application was already decided. Refresh and try again.',
  already_merchant: 'This user already has a merchant profile.',
}
const mapError = (message: string, fallback: string): string => {
  const key = Object.keys(FRIENDLY).find((k) => message.includes(k))
  return key ? FRIENDLY[key] : fallback
}

export async function approveMerchantApplicationAction(
  locale: Locale,
  id: string,
  reason: string,
): Promise<ActionResult<{ id: string; merchantProfileId: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])
  const { data, error } = await supabase.rpc('admin_approve_merchant_application', { p_id: id, p_reason: reason.trim() })
  if (error || !data) {
    if (error) console.error('[admin:merchant-applications] approve failed', error)
    return formError(mapError(error?.message ?? '', 'Application could not be approved'))
  }
  revalidatePath(applicationsPath(locale))
  return { ok: true, id, merchantProfileId: data as string }
}

export async function rejectMerchantApplicationAction(
  locale: Locale,
  id: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])
  const { error } = await supabase.rpc('admin_reject_merchant_application', { p_id: id, p_reason: reason.trim() })
  if (error) {
    console.error('[admin:merchant-applications] reject failed', error)
    return formError(mapError(error.message, 'Application could not be rejected'))
  }
  revalidatePath(applicationsPath(locale))
  return { ok: true, id }
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/admin.merchant-applications-actions.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/admin/merchant-applications-queries.ts apps/web/lib/admin/merchant-applications-actions.ts apps/web/tests/admin.merchant-applications-queries.test.ts apps/web/tests/admin.merchant-applications-actions.test.ts
git commit -m "feat(web): ops queries + audited actions for the merchant applications queue"
```

---

### Task 5: i18n — `merchantApply`, `merchantApplicationsOps`, and `merchantsOps.tabApplications` across all 7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`

- [ ] **Step 1: Extend the `Messages` interface in `en.ts`**

Add these two lines inside `export interface Messages { ... }` (anywhere in the
alphabetically-loose existing block is fine — this codebase's interface is not strictly
sorted; place them near the existing `merchantSearch`/`merchants`/`merchantsLanding`/
`merchantsOps` entries for readability):

```typescript
  merchantApply: MerchantApplyMessages
  merchantApplicationsOps: MerchantApplicationsOpsMessages
```

Add the two type definitions above `export interface Messages {`:

```typescript
export interface MerchantApplyMessages {
  title: string
  subtitle: string
  signedOutTitle: string
  signedOutBody: string
  signInCta: string
  signUpCta: string
  alreadyMerchantTitle: string
  alreadyMerchantBody: string
  alreadyMerchantCta: string
  formCompanyName: string
  formContactName: string
  formContactEmail: string
  formWebsite: string
  formPitch: string
  formPitchPlaceholder: string
  submitCta: string
  errorGeneric: string
  pendingTitle: string
  pendingBody: string
  rejectedTitle: string
  rejectedBody: string
  reapplyCta: string
  decisionReasonLabel: string
}

export interface MerchantApplicationsOpsMessages {
  pendingHeading: string
  pendingEmpty: string
  decidedHeading: string
  decidedEmpty: string
  colApplicant: string
  colEmail: string
  colWebsite: string
  colSubmitted: string
  colStatus: string
  colDecidedBy: string
  statusPending: string
  statusApproved: string
  statusRejected: string
  actApprove: string
  actReject: string
  actCancel: string
  actConfirm: string
  reasonPlaceholder: string
  actionFailed: string
  pitchLabel: string
  noPitch: string
  noWebsite: string
}
```

Also extend the existing `merchantsOps` interface block (find `tabOverview: string;
tabDirectory: string` inside it) to add a third tab key:

```typescript
    tabOverview: string; tabDirectory: string; tabApplications: string
```

- [ ] **Step 2: Add the English object literals to `en.ts`**

Add near the existing `merchants`/`merchantsLanding`/`merchantsOps` object literals:

```typescript
  merchantApply: {
    title: 'Become a KINNSO merchant',
    subtitle: 'Tell us about your business. Our team reviews every application within 48 hours.',
    signedOutTitle: 'Sign in to apply',
    signedOutBody: 'You need a KINNSO account before applying as a merchant.',
    signInCta: 'Sign in',
    signUpCta: 'Create an account',
    alreadyMerchantTitle: "You're already a merchant",
    alreadyMerchantBody: 'Head to your merchant hub to post a mission or manage your listings.',
    alreadyMerchantCta: 'Go to merchant hub',
    formCompanyName: 'Company name',
    formContactName: 'Contact name',
    formContactEmail: 'Contact email',
    formWebsite: 'Website',
    formPitch: 'Tell us about your business',
    formPitchPlaceholder: 'What do you sell, and who are your travellers?',
    submitCta: 'Submit application',
    errorGeneric: 'Your application could not be submitted. Please try again.',
    pendingTitle: 'Application under review',
    pendingBody: "We've received your application and our team is reviewing it. This usually takes under 48 hours.",
    rejectedTitle: 'Application not approved',
    rejectedBody: "We couldn't approve your application this time.",
    reapplyCta: 'Apply again',
    decisionReasonLabel: 'Reviewer note',
  },
  merchantApplicationsOps: {
    pendingHeading: 'Pending applications',
    pendingEmpty: 'No pending applications',
    decidedHeading: 'Recent decisions',
    decidedEmpty: 'No decisions yet',
    colApplicant: 'Company', colEmail: 'Email', colWebsite: 'Website', colSubmitted: 'Submitted',
    colStatus: 'Status', colDecidedBy: 'Decided',
    statusPending: 'Pending', statusApproved: 'Approved', statusRejected: 'Rejected',
    actApprove: 'Approve', actReject: 'Reject', actCancel: 'Cancel', actConfirm: 'Confirm',
    reasonPlaceholder: 'Reason (required)',
    actionFailed: 'Action failed. Please try again.',
    pitchLabel: 'Pitch', noPitch: 'No pitch provided', noWebsite: 'No website provided',
  },
```

Add `tabApplications: 'Applications',` to the existing `merchantsOps` object literal, on the
same line as the existing `tabOverview: 'Overview', tabDirectory: 'Directory',`:

```typescript
    tabOverview: 'Overview', tabDirectory: 'Directory', tabApplications: 'Applications',
```

- [ ] **Step 3: Add the matching blocks to all 6 other locale files**

Each locale file mirrors `en.ts`'s object-literal shape exactly (same keys, translated
values; these files do not repeat the TypeScript interface — only `en.ts` defines
`Messages`). Add the `tabApplications` key to each file's existing `merchantsOps` object,
and the two new groups anywhere near the existing `merchants`/`merchantsOps` groups.

`zh-hk.ts` (Traditional Chinese, Hong Kong / Cantonese-friendly business register):

```typescript
  merchantApply: {
    title: '成為 KINNSO 商戶',
    subtitle: '講吓你嘅生意畀我哋知,我哋團隊會喺 48 小時內審核你嘅申請。',
    signedOutTitle: '請先登入先可以申請',
    signedOutBody: '你需要有 KINNSO 帳戶先可以申請做商戶。',
    signInCta: '登入',
    signUpCta: '建立帳戶',
    alreadyMerchantTitle: '你已經係商戶喇',
    alreadyMerchantBody: '前往你嘅商戶主頁,發布任務或者管理你嘅產品。',
    alreadyMerchantCta: '前往商戶主頁',
    formCompanyName: '公司名稱',
    formContactName: '聯絡人姓名',
    formContactEmail: '聯絡電郵',
    formWebsite: '網站',
    formPitch: '講吓你嘅生意',
    formPitchPlaceholder: '你賣緊咩?你嘅旅客係邊啲人?',
    submitCta: '提交申請',
    errorGeneric: '提交唔到申請,請再試多次。',
    pendingTitle: '申請審核緊',
    pendingBody: '我哋收到你嘅申請,團隊審核緊,一般 48 小時內有結果。',
    rejectedTitle: '申請未獲批准',
    rejectedBody: '呢次未能夠批准你嘅申請。',
    reapplyCta: '再次申請',
    decisionReasonLabel: '審核備註',
  },
  merchantApplicationsOps: {
    pendingHeading: '待審核申請',
    pendingEmpty: '暫時冇待審核申請',
    decidedHeading: '最近決定',
    decidedEmpty: '仲未有任何決定',
    colApplicant: '公司', colEmail: '電郵', colWebsite: '網站', colSubmitted: '提交日期',
    colStatus: '狀態', colDecidedBy: '決定人',
    statusPending: '待審核', statusApproved: '已批准', statusRejected: '已拒絕',
    actApprove: '批准', actReject: '拒絕', actCancel: '取消', actConfirm: '確認',
    reasonPlaceholder: '原因(必填)',
    actionFailed: '操作失敗,請再試多次。',
    pitchLabel: '簡介', noPitch: '未有提供簡介', noWebsite: '未有提供網站',
  },
```

`zh-tw.ts` (Traditional Chinese, Taiwan):

```typescript
  merchantApply: {
    title: '成為 KINNSO 商家',
    subtitle: '告訴我們你的業務內容,我們的團隊會在 48 小時內審核你的申請。',
    signedOutTitle: '請先登入才能申請',
    signedOutBody: '你需要擁有 KINNSO 帳戶才能申請成為商家。',
    signInCta: '登入',
    signUpCta: '建立帳戶',
    alreadyMerchantTitle: '你已經是商家',
    alreadyMerchantBody: '前往你的商家主頁,發布任務或管理你的商品。',
    alreadyMerchantCta: '前往商家主頁',
    formCompanyName: '公司名稱',
    formContactName: '聯絡人姓名',
    formContactEmail: '聯絡電子郵件',
    formWebsite: '網站',
    formPitch: '告訴我們你的業務',
    formPitchPlaceholder: '你銷售什麼?你的旅客是哪些人?',
    submitCta: '送出申請',
    errorGeneric: '無法送出申請,請再試一次。',
    pendingTitle: '申請審核中',
    pendingBody: '我們已收到你的申請,團隊正在審核,通常會在 48 小時內完成。',
    rejectedTitle: '申請未通過',
    rejectedBody: '這次我們無法通過你的申請。',
    reapplyCta: '重新申請',
    decisionReasonLabel: '審核備註',
  },
  merchantApplicationsOps: {
    pendingHeading: '待審核申請',
    pendingEmpty: '目前沒有待審核的申請',
    decidedHeading: '最近的決定',
    decidedEmpty: '尚無任何決定',
    colApplicant: '公司', colEmail: '電子郵件', colWebsite: '網站', colSubmitted: '送出日期',
    colStatus: '狀態', colDecidedBy: '決定人',
    statusPending: '待審核', statusApproved: '已核准', statusRejected: '已拒絕',
    actApprove: '核准', actReject: '拒絕', actCancel: '取消', actConfirm: '確認',
    reasonPlaceholder: '原因(必填)',
    actionFailed: '操作失敗,請再試一次。',
    pitchLabel: '簡介', noPitch: '未提供簡介', noWebsite: '未提供網站',
  },
```

`zh-cn.ts` (Simplified Chinese):

```typescript
  merchantApply: {
    title: '成为 KINNSO 商家',
    subtitle: '告诉我们你的业务内容,我们的团队会在 48 小时内审核你的申请。',
    signedOutTitle: '请先登录才能申请',
    signedOutBody: '你需要拥有 KINNSO 账户才能申请成为商家。',
    signInCta: '登录',
    signUpCta: '创建账户',
    alreadyMerchantTitle: '你已经是商家了',
    alreadyMerchantBody: '前往你的商家主页,发布任务或管理你的商品。',
    alreadyMerchantCta: '前往商家主页',
    formCompanyName: '公司名称',
    formContactName: '联系人姓名',
    formContactEmail: '联系邮箱',
    formWebsite: '网站',
    formPitch: '告诉我们你的业务',
    formPitchPlaceholder: '你销售什么?你的旅客是哪些人?',
    submitCta: '提交申请',
    errorGeneric: '申请提交失败,请再试一次。',
    pendingTitle: '申请审核中',
    pendingBody: '我们已收到你的申请,团队正在审核,通常会在 48 小时内完成。',
    rejectedTitle: '申请未通过',
    rejectedBody: '这次我们无法通过你的申请。',
    reapplyCta: '重新申请',
    decisionReasonLabel: '审核备注',
  },
  merchantApplicationsOps: {
    pendingHeading: '待审核申请',
    pendingEmpty: '目前没有待审核的申请',
    decidedHeading: '最近的决定',
    decidedEmpty: '尚无任何决定',
    colApplicant: '公司', colEmail: '邮箱', colWebsite: '网站', colSubmitted: '提交日期',
    colStatus: '状态', colDecidedBy: '决定人',
    statusPending: '待审核', statusApproved: '已批准', statusRejected: '已拒绝',
    actApprove: '批准', actReject: '拒绝', actCancel: '取消', actConfirm: '确认',
    reasonPlaceholder: '原因(必填)',
    actionFailed: '操作失败,请再试一次。',
    pitchLabel: '简介', noPitch: '未提供简介', noWebsite: '未提供网站',
  },
```

`ja.ts` (Japanese):

```typescript
  merchantApply: {
    title: 'KINNSO 加盟店になる',
    subtitle: 'ビジネスについて教えてください。48時間以内に審査結果をお知らせします。',
    signedOutTitle: '申請にはログインが必要です',
    signedOutBody: '加盟店として申請するには KINNSO アカウントが必要です。',
    signInCta: 'ログイン',
    signUpCta: 'アカウントを作成',
    alreadyMerchantTitle: 'すでに加盟店です',
    alreadyMerchantBody: '加盟店ハブでミッションを投稿したり、掲載を管理したりできます。',
    alreadyMerchantCta: '加盟店ハブへ',
    formCompanyName: '会社名',
    formContactName: '担当者名',
    formContactEmail: '連絡先メール',
    formWebsite: 'ウェブサイト',
    formPitch: 'ビジネスについて教えてください',
    formPitchPlaceholder: '何を販売していますか?旅行者はどんな方ですか?',
    submitCta: '申請を送信',
    errorGeneric: '申請を送信できませんでした。もう一度お試しください。',
    pendingTitle: '審査中です',
    pendingBody: '申請を受け付けました。通常48時間以内に審査結果をお知らせします。',
    rejectedTitle: '申請は承認されませんでした',
    rejectedBody: '今回は申請を承認できませんでした。',
    reapplyCta: '再申請する',
    decisionReasonLabel: '審査コメント',
  },
  merchantApplicationsOps: {
    pendingHeading: '審査待ちの申請',
    pendingEmpty: '審査待ちの申請はありません',
    decidedHeading: '最近の判定',
    decidedEmpty: 'まだ判定はありません',
    colApplicant: '会社名', colEmail: 'メール', colWebsite: 'ウェブサイト', colSubmitted: '申請日',
    colStatus: 'ステータス', colDecidedBy: '判定者',
    statusPending: '審査中', statusApproved: '承認済み', statusRejected: '却下',
    actApprove: '承認', actReject: '却下', actCancel: 'キャンセル', actConfirm: '確定',
    reasonPlaceholder: '理由(必須)',
    actionFailed: '操作に失敗しました。もう一度お試しください。',
    pitchLabel: 'アピール', noPitch: 'アピール文なし', noWebsite: 'ウェブサイトなし',
  },
```

`ko.ts` (Korean, formal register — matches the `testimonialsAdmin` R1C register fix):

```typescript
  merchantApply: {
    title: 'KINNSO 가맹점 신청',
    subtitle: '비즈니스에 대해 알려주세요. 저희 팀이 48시간 이내에 검토합니다.',
    signedOutTitle: '신청하려면 로그인이 필요합니다',
    signedOutBody: '가맹점으로 신청하려면 KINNSO 계정이 필요합니다.',
    signInCta: '로그인',
    signUpCta: '계정 만들기',
    alreadyMerchantTitle: '이미 가맹점입니다',
    alreadyMerchantBody: '가맹점 허브에서 미션을 등록하거나 상품을 관리할 수 있습니다.',
    alreadyMerchantCta: '가맹점 허브로 이동',
    formCompanyName: '회사명',
    formContactName: '담당자 이름',
    formContactEmail: '연락처 이메일',
    formWebsite: '웹사이트',
    formPitch: '비즈니스를 소개해 주세요',
    formPitchPlaceholder: '무엇을 판매하시나요? 어떤 여행객을 대상으로 하시나요?',
    submitCta: '신청서 제출',
    errorGeneric: '신청서를 제출할 수 없습니다. 다시 시도해 주세요.',
    pendingTitle: '심사 진행 중',
    pendingBody: '신청서가 접수되었습니다. 보통 48시간 이내에 결과를 안내드립니다.',
    rejectedTitle: '신청이 승인되지 않았습니다',
    rejectedBody: '이번에는 신청을 승인해드릴 수 없었습니다.',
    reapplyCta: '다시 신청하기',
    decisionReasonLabel: '심사 메모',
  },
  merchantApplicationsOps: {
    pendingHeading: '심사 대기 신청',
    pendingEmpty: '심사 대기 중인 신청이 없습니다',
    decidedHeading: '최근 결정 내역',
    decidedEmpty: '아직 결정 내역이 없습니다',
    colApplicant: '회사명', colEmail: '이메일', colWebsite: '웹사이트', colSubmitted: '제출일',
    colStatus: '상태', colDecidedBy: '결정자',
    statusPending: '심사 중', statusApproved: '승인됨', statusRejected: '거절됨',
    actApprove: '승인', actReject: '거절', actCancel: '취소', actConfirm: '확인',
    reasonPlaceholder: '사유(필수)',
    actionFailed: '작업에 실패했습니다. 다시 시도해 주세요.',
    pitchLabel: '소개', noPitch: '소개 내용 없음', noWebsite: '웹사이트 없음',
  },
```

`th.ts` (Thai):

```typescript
  merchantApply: {
    title: 'สมัครเป็นร้านค้า KINNSO',
    subtitle: 'บอกเราเกี่ยวกับธุรกิจของคุณ ทีมงานจะตรวจสอบภายใน 48 ชั่วโมง',
    signedOutTitle: 'กรุณาเข้าสู่ระบบก่อนสมัคร',
    signedOutBody: 'คุณต้องมีบัญชี KINNSO ก่อนจึงจะสมัครเป็นร้านค้าได้',
    signInCta: 'เข้าสู่ระบบ',
    signUpCta: 'สร้างบัญชี',
    alreadyMerchantTitle: 'คุณเป็นร้านค้าอยู่แล้ว',
    alreadyMerchantBody: 'ไปที่ศูนย์ร้านค้าของคุณเพื่อโพสต์ภารกิจหรือจัดการรายการของคุณ',
    alreadyMerchantCta: 'ไปที่ศูนย์ร้านค้า',
    formCompanyName: 'ชื่อบริษัท',
    formContactName: 'ชื่อผู้ติดต่อ',
    formContactEmail: 'อีเมลติดต่อ',
    formWebsite: 'เว็บไซต์',
    formPitch: 'บอกเราเกี่ยวกับธุรกิจของคุณ',
    formPitchPlaceholder: 'คุณขายอะไร และนักท่องเที่ยวของคุณเป็นใคร?',
    submitCta: 'ส่งใบสมัคร',
    errorGeneric: 'ไม่สามารถส่งใบสมัครได้ กรุณาลองใหม่อีกครั้ง',
    pendingTitle: 'ใบสมัครอยู่ระหว่างการตรวจสอบ',
    pendingBody: 'เราได้รับใบสมัครของคุณแล้ว ทีมงานกำลังตรวจสอบ ปกติจะใช้เวลาไม่เกิน 48 ชั่วโมง',
    rejectedTitle: 'ใบสมัครไม่ได้รับการอนุมัติ',
    rejectedBody: 'เราไม่สามารถอนุมัติใบสมัครของคุณในครั้งนี้ได้',
    reapplyCta: 'สมัครอีกครั้ง',
    decisionReasonLabel: 'หมายเหตุจากผู้ตรวจสอบ',
  },
  merchantApplicationsOps: {
    pendingHeading: 'ใบสมัครที่รอตรวจสอบ',
    pendingEmpty: 'ไม่มีใบสมัครที่รอตรวจสอบ',
    decidedHeading: 'การตัดสินใจล่าสุด',
    decidedEmpty: 'ยังไม่มีการตัดสินใจ',
    colApplicant: 'บริษัท', colEmail: 'อีเมล', colWebsite: 'เว็บไซต์', colSubmitted: 'วันที่ส่ง',
    colStatus: 'สถานะ', colDecidedBy: 'ผู้ตัดสินใจ',
    statusPending: 'รอตรวจสอบ', statusApproved: 'อนุมัติแล้ว', statusRejected: 'ปฏิเสธแล้ว',
    actApprove: 'อนุมัติ', actReject: 'ปฏิเสธ', actCancel: 'ยกเลิก', actConfirm: 'ยืนยัน',
    reasonPlaceholder: 'เหตุผล (จำเป็น)',
    actionFailed: 'การดำเนินการล้มเหลว กรุณาลองใหม่อีกครั้ง',
    pitchLabel: 'เกี่ยวกับธุรกิจ', noPitch: 'ไม่มีข้อมูลธุรกิจ', noWebsite: 'ไม่มีเว็บไซต์',
  },
```

For each of the 6 files, also add the matching `tabApplications` value to that file's
existing `merchantsOps` object literal (verified live in each file — there are 3
`tabOverview:` occurrences per file, one per ops group with that shared key shape;
`merchantsOps` is always the **second** occurrence, immediately after `creators` and
before `missionsOps`). Change the existing line — shown here as found, then as it must
read after the edit:

- zh-hk: `tabOverview: '概覽', tabDirectory: '商戶目錄',` → `tabOverview: '概覽', tabDirectory: '商戶目錄', tabApplications: '申請',`
- zh-tw: `tabOverview: '總覽', tabDirectory: '商家目錄',` → `tabOverview: '總覽', tabDirectory: '商家目錄', tabApplications: '申請',`
- zh-cn: `tabOverview: '概览', tabDirectory: '商家目录',` → `tabOverview: '概览', tabDirectory: '商家目录', tabApplications: '申请',`
- ja: `tabOverview: '概要', tabDirectory: 'ディレクトリ',` → `tabOverview: '概要', tabDirectory: 'ディレクトリ', tabApplications: '申請',`
- ko: `tabOverview: '개요', tabDirectory: '디렉터리',` → `tabOverview: '개요', tabDirectory: '디렉터리', tabApplications: '신청',`
- th: `tabOverview: 'ภาพรวม', tabDirectory: 'ไดเรกทอรี',` → `tabOverview: 'ภาพรวม', tabDirectory: 'ไดเรกทอรี', tabApplications: 'ใบสมัคร',`

Only append `tabApplications: '<value>',` to the existing line in each file — do not
retype or otherwise alter the existing `tabOverview`/`tabDirectory` values.

- [ ] **Step 4: Write the failing parity test run**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts`
Expected at this point (before Step 3 is fully done in all 7 files): FAIL for any locale
missing a group or a key.

- [ ] **Step 5: Complete all 7 files, then run to verify it passes**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts`
Expected: PASS — every locale has identical key paths for `merchantApply`,
`merchantApplicationsOps`, and the extended `merchantsOps`.

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors (the `Messages` interface addition must match every locale file's
literal shape exactly, or this fails).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/i18n/messages/*.ts
git commit -m "i18n(web): merchantApply + merchantApplicationsOps groups × 7 locales"
```

---

### Task 6: `MerchantsTabs` — add the Applications tab

**Files:**
- Modify: `apps/web/components/kinnso/admin/merchants/MerchantsTabs.tsx`

- [ ] **Step 1: Edit the tabs array**

In `apps/web/components/kinnso/admin/merchants/MerchantsTabs.tsx`, change:

```typescript
  const tabs = [
    { href: `/${locale}/admin/merchants`, label: t.tabOverview },
    { href: `/${locale}/admin/merchants/directory`, label: t.tabDirectory },
  ]
```

to:

```typescript
  const tabs = [
    { href: `/${locale}/admin/merchants`, label: t.tabOverview },
    { href: `/${locale}/admin/merchants/directory`, label: t.tabDirectory },
    { href: `/${locale}/admin/merchants/applications`, label: t.tabApplications },
  ]
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors (Task 5 already added `tabApplications` to the `merchantsOps`
type, so `t.tabApplications` resolves).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/kinnso/admin/merchants/MerchantsTabs.tsx
git commit -m "feat(web): add Applications tab to the ops Merchants console"
```

---

### Task 7: Ops applications queue page + view

**Files:**
- Create: `apps/web/components/kinnso/admin/merchants/MerchantApplicationsView.tsx`
- Create: `apps/web/app/[locale]/admin/merchants/applications/page.tsx`
- Test: `apps/web/tests/admin.merchant-applications.host.test.tsx`

- [ ] **Step 1: Write the failing host test**

```typescript
// apps/web/tests/admin.merchant-applications.host.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
  redirect: (url: string) => { throw new Error(`redirect:${url}`) },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/admin/merchants/applications',
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({}) }))
vi.mock('@/lib/admin/guard', () => ({ requireOpsPage: vi.fn(async () => ({ user: { id: 'ops1' } })) }))
vi.mock('@/lib/admin/merchant-applications-queries', () => ({
  listPendingMerchantApplications: vi.fn(async () => ([{
    id: 'app1', userId: 'u1', companyName: 'Acme Travel', contactName: 'Jane', contactEmail: 'jane@acme.example',
    websiteUrl: 'https://acme.example', pitch: 'Boutique tours', status: 'pending',
    decidedAt: null, decisionReason: null, createdAt: '2026-07-03T00:00:00.000Z',
  }])),
  listDecidedMerchantApplications: vi.fn(async () => ([])),
}))

import AdminMerchantApplicationsPage from '@/app/[locale]/admin/merchants/applications/page'

afterEach(cleanup)

describe('AdminMerchantApplicationsPage', () => {
  it('notFound for an invalid locale', async () => {
    await expect(AdminMerchantApplicationsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('notFound')
  })

  it('renders the pending application with approve/reject actions', async () => {
    const el = await AdminMerchantApplicationsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByText('Acme Travel')).toBeTruthy()
    expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /reject/i })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run tests/admin.merchant-applications.host.test.tsx`
Expected: FAIL — page module not found

- [ ] **Step 3: Write the view component**

```tsx
// apps/web/components/kinnso/admin/merchants/MerchantApplicationsView.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { AdminMerchantApplication } from '@/lib/admin/merchant-applications-queries'
import type { ActionResult } from '@/lib/admin/result'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { MerchantsTabs } from '@/components/kinnso/admin/merchants/MerchantsTabs'

type T = Messages['merchantApplicationsOps']
type Pending = { id: string; kind: 'approve' | 'reject' } | null

export interface MerchantApplicationsViewProps {
  t: T
  tabsT: Messages['merchantsOps']
  locale: Locale
  pending: AdminMerchantApplication[]
  decided: AdminMerchantApplication[]
  onApprove: (locale: Locale, id: string, reason: string) => Promise<ActionResult<{ id: string; merchantProfileId: string }>>
  onReject: (locale: Locale, id: string, reason: string) => Promise<ActionResult<{ id: string }>>
}

export function MerchantApplicationsView({ t, tabsT, locale, pending, decided, onApprove, onReject }: MerchantApplicationsViewProps) {
  const router = useRouter()
  const [action, setAction] = useState<Pending>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState<Record<string, string>>({})

  function start(id: string, kind: 'approve' | 'reject') {
    setAction({ id, kind })
    setReason('')
    setRowError((m) => ({ ...m, [id]: '' }))
  }

  async function confirm() {
    if (!action) return
    setBusy(true)
    const res = action.kind === 'approve'
      ? await onApprove(locale, action.id, reason)
      : await onReject(locale, action.id, reason)
    setBusy(false)
    if (res.ok) {
      setAction(null)
      router.refresh()
    } else {
      setRowError((m) => ({ ...m, [action.id]: res.errors.form?.[0] ?? t.actionFailed }))
    }
  }

  const statusLabel = (s: AdminMerchantApplication['status']) =>
    s === 'pending' ? t.statusPending : s === 'approved' ? t.statusApproved : t.statusRejected

  return (
    <main>
      <MerchantsTabs t={tabsT} locale={locale} />

      <h2 className="k-display mt-4">{t.pendingHeading}</h2>
      {pending.length === 0 ? (
        <p className="mt-4 text-kinnso-muted">{t.pendingEmpty}</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {pending.map((app) => (
            <TicketCard key={app.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-kinnso-ink">{app.companyName}</p>
                  <p className="text-sm text-kinnso-muted">{app.contactEmail}</p>
                  <p className="text-sm text-kinnso-muted">{app.websiteUrl ?? t.noWebsite}</p>
                  <p className="mt-2 text-sm text-kinnso-ink/80">{t.pitchLabel}: {app.pitch ?? t.noPitch}</p>
                  <p className="mt-1 text-xs text-kinnso-muted">{t.colSubmitted}: {new Date(app.createdAt).toLocaleDateString(locale)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => start(app.id, 'approve')} aria-label={`${t.actApprove} ${app.companyName}`} className="k-chip">{t.actApprove}</button>
                  <button onClick={() => start(app.id, 'reject')} aria-label={`${t.actReject} ${app.companyName}`} className="k-chip">{t.actReject}</button>
                </div>
              </div>

              {action?.id === app.id && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-kinnso-line pt-3">
                  <input value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder={t.reasonPlaceholder} aria-label={t.reasonPlaceholder}
                    className="k-input max-w-sm" />
                  <button onClick={confirm} disabled={busy || reason.trim().length === 0}
                    className="rounded-full border border-kinnso-line px-4 py-2 text-sm font-bold text-kinnso-ink disabled:opacity-50">{t.actConfirm}</button>
                  <button onClick={() => setAction(null)} disabled={busy}
                    className="rounded-full px-4 py-2 text-sm font-bold text-kinnso-muted">{t.actCancel}</button>
                </div>
              )}
              {rowError[app.id] ? <p className="mt-2 text-sm text-red-600">{rowError[app.id]}</p> : null}
            </TicketCard>
          ))}
        </div>
      )}

      <h2 className="k-display mt-10">{t.decidedHeading}</h2>
      {decided.length === 0 ? (
        <p className="mt-4 text-kinnso-muted">{t.decidedEmpty}</p>
      ) : (
        <div className="mt-4 grid gap-2">
          {decided.map((app) => (
            <TicketCard key={app.id} className="p-3 text-sm">
              <span className="font-bold text-kinnso-ink">{app.companyName}</span>
              {' — '}{statusLabel(app.status)}
              {app.decisionReason ? ` — ${app.decisionReason}` : ''}
            </TicketCard>
          ))}
        </div>
      )}
    </main>
  )
}

export default MerchantApplicationsView
```

- [ ] **Step 4: Write the route**

```tsx
// apps/web/app/[locale]/admin/merchants/applications/page.tsx
import { notFound } from 'next/navigation'
import { MerchantApplicationsView } from '@/components/kinnso/admin/merchants/MerchantApplicationsView'
import { requireOpsPage } from '@/lib/admin/guard'
import { approveMerchantApplicationAction, rejectMerchantApplicationAction } from '@/lib/admin/merchant-applications-actions'
import { listPendingMerchantApplications, listDecidedMerchantApplications } from '@/lib/admin/merchant-applications-queries'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function AdminMerchantApplicationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const [pending, decided] = await Promise.all([
    listPendingMerchantApplications(supabase),
    listDecidedMerchantApplications(supabase),
  ])

  async function onApprove(locale: Locale, id: string, reason: string) {
    'use server'
    return approveMerchantApplicationAction(locale, id, reason)
  }
  async function onReject(locale: Locale, id: string, reason: string) {
    'use server'
    return rejectMerchantApplicationAction(locale, id, reason)
  }

  return (
    <MerchantApplicationsView
      t={messages.merchantApplicationsOps}
      tabsT={messages.merchantsOps}
      locale={loc}
      pending={pending}
      decided={decided}
      onApprove={onApprove}
      onReject={onReject}
    />
  )
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/admin.merchant-applications.host.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/admin/merchants/MerchantApplicationsView.tsx apps/web/app/\[locale\]/admin/merchants/applications/page.tsx apps/web/tests/admin.merchant-applications.host.test.tsx
git commit -m "feat(web): ops Applications tab — pending queue, approve/reject, decided history"
```

---

### Task 8: Public `/merchants/apply` page + view

**Files:**
- Create: `apps/web/components/kinnso/pages/MerchantApplyView.tsx`
- Create: `apps/web/app/[locale]/merchants/apply/page.tsx`
- Test: `apps/web/tests/merchants.apply.host.test.tsx`

- [ ] **Step 1: Write the failing host test**

```typescript
// apps/web/tests/merchants.apply.host.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
const authMock = vi.fn()
const resolveViewerRoleMock = vi.fn()
const getMyApplicationMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: authMock } }),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: resolveViewerRoleMock }))
vi.mock('@/lib/merchants/application-queries', () => ({ getMyMerchantApplication: getMyApplicationMock }))

import MerchantApplyPage from '@/app/[locale]/merchants/apply/page'

afterEach(cleanup)

describe('MerchantApplyPage', () => {
  it('notFound for an invalid locale', async () => {
    await expect(MerchantApplyPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('notFound')
  })

  it('shows a sign-in prompt for anonymous visitors', async () => {
    authMock.mockResolvedValue({ data: { user: null } })
    const el = await MerchantApplyPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByRole('link', { name: /sign in/i })).toBeTruthy()
  })

  it('shows an already-merchant panel for a merchant viewer', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    resolveViewerRoleMock.mockResolvedValue('merchant')
    const el = await MerchantApplyPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByText(/already a merchant/i)).toBeTruthy()
  })

  it('shows the application form when the viewer has never applied', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    resolveViewerRoleMock.mockResolvedValue('creator')
    getMyApplicationMock.mockResolvedValue(null)
    const el = await MerchantApplyPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByRole('button', { name: /submit application/i })).toBeTruthy()
  })

  it('shows a pending panel when an application is under review', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    resolveViewerRoleMock.mockResolvedValue('creator')
    getMyApplicationMock.mockResolvedValue({ id: 'app1', status: 'pending', companyName: 'Acme', decisionReason: null, createdAt: '2026-07-03T00:00:00Z' })
    const el = await MerchantApplyPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByText(/under review/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run tests/merchants.apply.host.test.tsx`
Expected: FAIL — page module not found

- [ ] **Step 3: Write the view component**

```tsx
// apps/web/components/kinnso/pages/MerchantApplyView.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { submitMerchantApplicationAction } from '@/lib/merchants/application-actions'
import type { MyMerchantApplication } from '@/lib/merchants/application-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

type T = Messages['merchantApply']

export interface MerchantApplyViewProps {
  locale: Locale
  t: T
  application: MyMerchantApplication | null
}

const emptyForm = { companyName: '', contactName: '', contactEmail: '', websiteUrl: '', pitch: '' }

export function MerchantApplyView({ locale, t, application }: MerchantApplyViewProps) {
  const p = (path: string) => `/${locale}${path}`
  const [form, setForm] = useState(emptyForm)
  const [hp, setHp] = useState('')
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [submittedId, setSubmittedId] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setErrors({})
    try {
      const res = await submitMerchantApplicationAction(form, hp)
      if (res.ok) setSubmittedId(res.id)
      else setErrors(res.errors)
    } finally {
      setPending(false)
    }
  }

  if (application?.status === 'pending' || submittedId) {
    return (
      <main className="bg-kinnso-cream font-sans">
        <SectionShell as="header">
          <Eyebrow>{t.title}</Eyebrow>
          <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.pendingTitle}</h1>
          <p className="mt-4 max-w-xl leading-relaxed text-kinnso-ink/70">{t.pendingBody}</p>
        </SectionShell>
      </main>
    )
  }

  if (application?.status === 'rejected') {
    return (
      <main className="bg-kinnso-cream font-sans">
        <SectionShell as="header">
          <Eyebrow>{t.title}</Eyebrow>
          <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.rejectedTitle}</h1>
          <p className="mt-4 max-w-xl leading-relaxed text-kinnso-ink/70">{t.rejectedBody}</p>
          {application.decisionReason ? (
            <p className="mt-2 max-w-xl text-sm text-kinnso-ink/60">{t.decisionReasonLabel}: {application.decisionReason}</p>
          ) : null}
          <button
            type="button"
            onClick={() => { setSubmittedId(null); setForm(emptyForm) }}
            className="k2-btn-primary mt-6"
          >
            {t.reapplyCta}
          </button>
        </SectionShell>
      </main>
    )
  }

  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.title}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.title}</h1>
        <p className="mt-4 max-w-xl leading-relaxed text-kinnso-ink/70">{t.subtitle}</p>

        <form onSubmit={onSubmit} className="mt-8 flex max-w-lg flex-col gap-4">
          <input type="text" name="website" value={hp} onChange={(e) => setHp(e.target.value)}
            tabIndex={-1} autoComplete="off" aria-hidden="true"
            className="absolute -left-[9999px] h-0 w-0 opacity-0" />

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.formCompanyName}</span>
            <input required value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              className="min-h-[44px] rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm" />
            {errors.companyName ? <span className="text-sm text-red-600">{errors.companyName[0]}</span> : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.formContactName}</span>
            <input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              className="min-h-[44px] rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm" />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.formContactEmail}</span>
            <input required type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              className="min-h-[44px] rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm" />
            {errors.contactEmail ? <span className="text-sm text-red-600">{errors.contactEmail[0]}</span> : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.formWebsite}</span>
            <input value={form.websiteUrl} onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
              className="min-h-[44px] rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm" />
            {errors.websiteUrl ? <span className="text-sm text-red-600">{errors.websiteUrl[0]}</span> : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.formPitch}</span>
            <textarea value={form.pitch} onChange={(e) => setForm((f) => ({ ...f, pitch: e.target.value }))}
              placeholder={t.formPitchPlaceholder} rows={4}
              className="rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm" />
          </label>

          {errors.form ? <p role="alert" className="text-sm text-red-600">{errors.form[0]}</p> : null}

          <button type="submit" disabled={pending} className="k2-btn-primary self-start disabled:opacity-60">
            {t.submitCta}
          </button>
        </form>
      </SectionShell>
    </main>
  )
}

export function MerchantApplySignedOutView({ locale, t }: { locale: Locale; t: T }) {
  const p = (path: string) => `/${locale}${path}`
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.title}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.signedOutTitle}</h1>
        <p className="mt-4 max-w-xl leading-relaxed text-kinnso-ink/70">{t.signedOutBody}</p>
        <div className="mt-6 flex gap-4">
          <Link href={p('/sign-in')} className="k2-btn-primary">{t.signInCta}</Link>
          <Link href={p('/sign-up')} className="k2-btn-ghost">{t.signUpCta}</Link>
        </div>
      </SectionShell>
    </main>
  )
}

export function MerchantApplyAlreadyMerchantView({ locale, t }: { locale: Locale; t: T }) {
  const p = (path: string) => `/${locale}${path}`
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.title}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.alreadyMerchantTitle}</h1>
        <p className="mt-4 max-w-xl leading-relaxed text-kinnso-ink/70">{t.alreadyMerchantBody}</p>
        <Link href={p('/merchants')} className="k2-btn-primary mt-6 inline-flex">{t.alreadyMerchantCta}</Link>
      </SectionShell>
    </main>
  )
}

export default MerchantApplyView
```

- [ ] **Step 4: Write the route**

```tsx
// apps/web/app/[locale]/merchants/apply/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { getMyMerchantApplication } from '@/lib/merchants/application-queries'
import { noindexMetadata } from '@/lib/seo/metadata'
import {
  MerchantApplyView,
  MerchantApplyAlreadyMerchantView,
  MerchantApplySignedOutView,
} from '@/components/kinnso/pages/MerchantApplyView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantApplyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const dict = await getDictionary(loc)
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return <MerchantApplySignedOutView locale={loc} t={dict.merchantApply} />
  }

  const role = await resolveViewerRole(supabase)
  if (role === 'merchant') {
    return <MerchantApplyAlreadyMerchantView locale={loc} t={dict.merchantApply} />
  }

  const application = await getMyMerchantApplication(supabase, user.id)
  return <MerchantApplyView locale={loc} t={dict.merchantApply} application={application} />
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/merchants.apply.host.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/pages/MerchantApplyView.tsx apps/web/app/\[locale\]/merchants/apply/page.tsx apps/web/tests/merchants.apply.host.test.tsx
git commit -m "feat(web): public /merchants/apply — sign-in prompt, form, pending/rejected states"
```

---

### Task 9: Point `/for-merchants` CTAs at the real funnel

**Files:**
- Modify: `apps/web/components/kinnso/pages/ForMerchantsView.tsx`
- Modify: `apps/web/tests/for-merchants.host.test.tsx`

- [ ] **Step 1: Update the failing test first**

Change the existing test's assertions in `apps/web/tests/for-merchants.host.test.tsx` from:

```typescript
  it('renders hero, steps, and CTA → /merchants/post; hides empty testimonials strip', () => {
    render(<ForMerchantsView locale="en" t={en.forMerchants} testimonials={[]} />)
    expect(screen.getByRole('heading', { level: 1, name: en.forMerchants.heroTitle })).toBeTruthy()
    const postLinks = screen.getAllByRole('link', { name: en.forMerchants.heroCtaPrimary })
    expect(postLinks[0].getAttribute('href')).toBe('/en/merchants/post')
    const contactLink = screen.getByRole('link', { name: en.forMerchants.heroCtaSecondary })
    expect(contactLink.getAttribute('href')).toBe('/en/contact')
    expect(document.getElementById('for-merchants-testimonials')).toBeNull()
  })
```

to:

```typescript
  it('renders hero, steps, and CTAs → /merchants/apply; hides empty testimonials strip', () => {
    render(<ForMerchantsView locale="en" t={en.forMerchants} testimonials={[]} />)
    expect(screen.getByRole('heading', { level: 1, name: en.forMerchants.heroTitle })).toBeTruthy()
    const applyLinks = screen.getAllByRole('link', { name: en.forMerchants.heroCtaPrimary })
    expect(applyLinks.every((l) => l.getAttribute('href') === '/en/merchants/apply')).toBe(true)
    const contactLink = screen.getByRole('link', { name: en.forMerchants.heroCtaSecondary })
    expect(contactLink.getAttribute('href')).toBe('/en/contact')
    expect(document.getElementById('for-merchants-testimonials')).toBeNull()
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run tests/for-merchants.host.test.tsx`
Expected: FAIL — both CTA links still point to `/en/merchants/post`

- [ ] **Step 3: Update the two CTA hrefs**

In `apps/web/components/kinnso/pages/ForMerchantsView.tsx`, change:

```tsx
          <Link href={p('/merchants/post')} className="k2-btn-primary">{t.heroCtaPrimary}</Link>
```

to:

```tsx
          <Link href={p('/merchants/apply')} className="k2-btn-primary">{t.heroCtaPrimary}</Link>
```

and change:

```tsx
          <Link href={p('/merchants/post')} className="mt-8 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] bg-kinnso-ink px-6 py-2.5 text-sm font-semibold tracking-wide text-white transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{t.ctaButton}</Link>
```

to:

```tsx
          <Link href={p('/merchants/apply')} className="mt-8 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] bg-kinnso-ink px-6 py-2.5 text-sm font-semibold tracking-wide text-white transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{t.ctaButton}</Link>
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/for-merchants.host.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/pages/ForMerchantsView.tsx apps/web/tests/for-merchants.host.test.tsx
git commit -m "fix(web): /for-merchants CTAs now route to the real application funnel"
```

---

### Task 10: Full-phase verification

**Files:** none (verification only)

- [ ] **Step 1: Run every test file touched or added by this plan**

```bash
cd apps/web && npx vitest run \
  tests/merchants.application-actions.test.ts \
  tests/merchants.application-queries.test.ts \
  tests/admin.merchant-applications-actions.test.ts \
  tests/admin.merchant-applications-queries.test.ts \
  tests/merchants.apply.host.test.tsx \
  tests/admin.merchant-applications.host.test.tsx \
  tests/for-merchants.host.test.tsx \
  tests/i18n.locale-parity.test.ts \
  tests/kinnso.route-parity.test.tsx
```

Expected: all PASS.

- [ ] **Step 2: Typecheck and lint the whole web app**

```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npx eslint . --max-warnings 0
```

Expected: no new errors/warnings introduced by this phase (pre-existing unrelated issues,
if any, are out of scope — compare against `git stash` if uncertain).

- [ ] **Step 3: Manual live-data spot check (Supabase MCP)**

Run via `execute_sql` against `scryfkefedzuetfdtrvl`:

```sql
select count(*) from public.merchant_applications;
select policyname, cmd from pg_policies where tablename = 'merchant_applications';
select policyname from pg_policies where tablename = 'merchant_profiles' and policyname like '%insert%';
```

Expected: `merchant_applications` exists and is empty (0 rows — no real applications yet);
3 policies on `merchant_applications`; **zero** rows for the `merchant_profiles` insert
policy query (confirms the security fix took effect).

- [ ] **Step 4: Update the R2 program memory**

Update `docs/superpowers/notes/2026-07-02-r1-carryforwards.md` — no, this file is R1-scoped
and closed; instead record R2A completion in the product-revision-program memory (outside
this repo, in the assistant's memory system) once this plan's tasks are all checked off:
branch tip, migration name, PR status, and the two follow-ups this phase intentionally
deferred (no email notification on decision; no return-URL-preserving sign-in redirect).

- [ ] **Step 5: Final commit (if any stray verification fixes were needed)**

```bash
git status
git add -A
git commit -m "chore(web): R2A verification pass" --allow-empty-message -m "typecheck, lint, and full scoped test run all green"
```

(Skip this step entirely if Steps 1-2 required no code changes — do not create an empty
commit.)

---

## Deferred out of R2A (recorded, not forgotten)

- **No email notification** on application decision — the in-app status panel at
  `/merchants/apply` is the only notification surface (matches the ops-invite copy-link
  precedent; no email infrastructure exists in this codebase).
- **No return-URL-preserving sign-in redirect** — an anon visitor who signs in from
  `/merchants/apply` lands at `/studio` (existing hard-coded behavior) and must navigate
  back to `/merchants/apply` manually. Adding generic return-URL support to the shared
  sign-in flow is a larger, separate change; out of scope here.
- **No per-IP rate limiting** on the application submit — same accepted-deviation shape as
  `agent_waitlist` (honeypot + RLS bounds + no money/state beyond a pending review row).
- Everything in the R2 design spec's §6 "Out of scope (R2)" list (booking, traveller
  accounts, Stripe code, experiences media upload, etc.) and R2B/R2C's own scope
  (dashboard consolidation, experiences CRUD, public directory/`/m/[slug]`/experience
  pages) — this plan is R2A only.
