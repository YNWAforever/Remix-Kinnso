# Phase R7.7 Profile Trust and Enquiries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden creator and merchant public profiles with trustworthy optional data, booking-state clarity, and a rate-limited enquiry flow backed by an audited ops queue.

**Architecture:** Preserve the existing profile routes as composition roots. Add one additive Supabase migration with integrity constraints and narrow RPCs, then implement small TypeScript query/action modules and shared UI components around those boundaries. Optional profile enrichment fails independently; all writes remain RPC-controlled and audited.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Supabase/Postgres 17 with RLS and `SECURITY DEFINER` RPCs, Radix Dialog, Vitest/Testing Library, Playwright, pnpm/Turborepo.

## Global Constraints

- The authoritative source is `kinnso-phase-r7-ux-hardening-spec.md`, R7.7, plus §7 of `docs/superpowers/specs/2026-07-02-product-revision-program-design.md`.
- Follow `docs/superpowers/specs/2026-07-26-phase-r7-7-profile-enquiries-design.md` exactly.
- Do not modify a shipped migration; create `supabase/migrations/20260726090000_r7_7_profile_enquiries.sql`.
- Public reads use anon plus RLS. State changes use narrow RPCs. Do not add a service-role exception.
- Add every new visible string to `en`, `zh-hk`, `zh-tw`, `ja`, `ko`, `th`, and `zh-cn`; locale parity must pass.
- Never show raw locale/language/region codes, fabricated follower counts, empty optional headings, booking/customer attribution data, or submitted enquiry PII in logs.
- Do not add avatar upload, email delivery, notifications, CRM sync, operator assignment, fuzzy author matching, or city-based guide attribution.
- Do not touch creator copilot, frozen public content URLs, `.codex-patches/`, or `task3-red.patch`.
- Implement with TDD and use conventional commits. The final delivery is one squash-merged R7.7 PR.

---

## File Map

### Database boundary

- Create `supabase/migrations/20260726090000_r7_7_profile_enquiries.sql`: avatar field, follower projection, enquiry tables/indexes/RPCs/grants.
- Create `apps/web/tests/db.r7-7-profile-enquiries.test.ts`: static migration contract.
- Create `apps/web/tests/enquiries.rls.test.ts`: live local-Postgres grants, RPC, rate-limit, eligibility, audit, and privacy checks.
- Modify `packages/db/types.ts`: regenerated local schema types.

### Public enquiry feature

- Create `apps/web/lib/enquiries/types.ts`: stable public and ops domain types.
- Create `apps/web/lib/enquiries/validation.ts`: pure normalization and validation.
- Create `apps/web/lib/enquiries/actions.ts`: honeypot-first submission server action.
- Create `apps/web/components/kinnso/enquiries/EnquiryDialog.tsx`: shared accessible public form.
- Create `apps/web/tests/enquiries.validation.test.ts`.
- Create `apps/web/tests/enquiries.actions.test.ts`.
- Create `apps/web/tests/enquiries.service-order.test.ts`.
- Create `apps/web/tests/kinnso.EnquiryDialog.test.tsx`.

### Creator profile

- Modify `apps/web/lib/creators/queries.ts`: avatar/follower domain shape and optional related content.
- Modify `apps/web/lib/articles/queries.ts`: exact active-author-slug query.
- Modify `apps/web/lib/sessions/public-queries.ts`: public sessions by creator.
- Modify `apps/web/app/[locale]/c/[handle]/page.tsx`: parallel optional enrichment and enquiry target.
- Modify `apps/web/components/kinnso/pages/CreatorProfileView.tsx`: trustworthy display and conditional sections.
- Modify `apps/web/tests/creators.queries.test.ts`.
- Create `apps/web/tests/articles.creator-queries.test.ts`.
- Modify `apps/web/tests/sessions.public-queries.test.ts`.
- Modify `apps/web/tests/kinnso.CreatorProfileView.test.tsx`.
- Modify `apps/web/tests/c.handle.host.test.tsx`.

### Merchant profile

- Modify `apps/web/lib/guides/queries.ts`: privacy-safe attributed guides query.
- Modify `apps/web/app/[locale]/m/[slug]/page.tsx`: resolve booking state and optional attribution.
- Modify `apps/web/components/kinnso/pages/PublicMerchantProfileView.tsx`: booking labels, enquiry CTA, conditional guide cards.
- Modify `apps/web/tests/guides.queries.test.ts`.
- Modify `apps/web/tests/kinnso.PublicMerchantProfileView.test.tsx`.
- Modify `apps/web/tests/merchants.public-profile.host.test.tsx`.

### Ops queue and localization

- Create `apps/web/lib/admin/enquiries-queries.ts`.
- Create `apps/web/lib/admin/enquiries-actions.ts`.
- Create `apps/web/components/kinnso/admin/AdminEnquiriesView.tsx`.
- Create `apps/web/app/[locale]/admin/enquiries/page.tsx`.
- Modify `apps/web/components/kinnso/admin/AdminShell.tsx`.
- Modify all seven files under `apps/web/lib/i18n/messages/`.
- Create `apps/web/tests/admin.enquiries-queries.test.ts`.
- Create `apps/web/tests/admin.enquiries-actions.test.ts`.
- Create `apps/web/tests/kinnso.AdminEnquiriesView.test.tsx`.
- Create `apps/web/tests/admin.enquiries.host.test.tsx`.
- Modify `apps/web/tests/kinnso.AdminShell.test.tsx`.
- Use existing `apps/web/tests/i18n.locale-parity.test.ts`.

### End-to-end

- Create `apps/e2e/specs/profile-enquiries.spec.ts`.

---

### Task 1: Lock and implement the database contract

**Files:**
- Create: `apps/web/tests/db.r7-7-profile-enquiries.test.ts`
- Create: `supabase/migrations/20260726090000_r7_7_profile_enquiries.sql`

**Interfaces:**
- Produces: `public.enquiries`, `public.enquiry_rate_limits`, `public.submit_enquiry(...)`, `public.admin_list_enquiries(...)`, `public.admin_set_enquiry_status(...)`, and `public.get_attributed_guides_for_merchant(...)`.
- Preserves: `public.creator_public_profile_json(jsonb)` signature while adding optional numeric `followers`.

- [ ] **Step 1: Write the failing static migration contract**

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260726090000_r7_7_profile_enquiries.sql',
)

describe('R7.7 profile enquiries migration', () => {
  const sql = () => readFileSync(migration, 'utf8').toLowerCase()

  it('adds constrained avatar and follower projection support', () => {
    expect(sql()).toContain('add column if not exists avatar_url text')
    expect(sql()).toContain('creator_public_profile_json')
    expect(sql()).toContain("'followers'")
    expect(sql()).toContain("jsonb_typeof(p->'followers') = 'number'")
  })

  it('creates typed enquiries with exactly one matching target', () => {
    expect(sql()).toContain('create table public.enquiries')
    expect(sql()).toContain("type in ('creator_collab','merchant_contact')")
    expect(sql()).toContain("status in ('new','in_progress','resolved','spam')")
    expect(sql()).toContain('creator_id uuid')
    expect(sql()).toContain('merchant_profile_id uuid')
    expect(sql()).toContain('on delete restrict')
  })

  it('exposes writes only through narrow RPCs', () => {
    const text = sql()
    expect(text).toContain('alter table public.enquiries enable row level security')
    expect(text).toContain('revoke all on table public.enquiries from public, anon, authenticated')
    expect(text).toContain('create or replace function public.submit_enquiry')
    expect(text).toContain('create or replace function public.admin_set_enquiry_status')
    expect(text).toContain("ops_audit_log_append('enquiry'")
    expect(text).not.toMatch(/grant\s+insert\s+on\s+(?:table\s+)?public\.enquiries/)
    expect(text).not.toMatch(/grant\s+update\s+on\s+(?:table\s+)?public\.enquiries/)
  })

  it('exposes only published guide metadata from booking attribution', () => {
    const text = sql()
    expect(text).toContain('function public.get_attributed_guides_for_merchant')
    expect(text).toContain("b.status in ('confirmed','completed')")
    expect(text).toContain("g.status = 'published'")
    expect(text).toContain('grant execute on function public.get_attributed_guides_for_merchant')
  })
})
```

- [ ] **Step 2: Run the contract test and verify it fails because the migration is absent**

Run:

```powershell
pnpm --filter web test -- tests/db.r7-7-profile-enquiries.test.ts
```

Expected: FAIL with `ENOENT` for `20260726090000_r7_7_profile_enquiries.sql`.

- [ ] **Step 3: Implement the migration**

Use these locked signatures:

```sql
alter table public.creators
  add column if not exists avatar_url text;

alter table public.creators
  add constraint creators_avatar_url_http_check
  check (
    avatar_url is null
    or btrim(avatar_url) ~* '^https?://[^[:space:]]+$'
  );

create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('creator_collab','merchant_contact')),
  creator_id uuid references public.creators(id) on delete restrict,
  merchant_profile_id uuid references public.merchant_profiles(id) on delete restrict,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  email text not null check (
    email = lower(btrim(email))
    and char_length(email) <= 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  message text not null check (
    message = btrim(message)
    and char_length(message) between 10 and 4000
  ),
  status text not null default 'new'
    check (status in ('new','in_progress','resolved','spam')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enquiries_target_matches_type check (
    (type = 'creator_collab' and creator_id is not null and merchant_profile_id is null)
    or
    (type = 'merchant_contact' and merchant_profile_id is not null and creator_id is null)
  )
);
```

The submission RPC must accept:

```sql
public.submit_enquiry(
  p_type text,
  p_creator_id uuid,
  p_merchant_profile_id uuid,
  p_name text,
  p_email text,
  p_message text,
  p_ip text,
  p_max_requests integer default 5,
  p_window_seconds integer default 3600
) returns uuid
```

Inside the function, validate input before incrementing the bucket, hash
`p_ip` with `digest(..., 'sha256')`, lock/upsert the current rate bucket,
and enforce target eligibility explicitly:

```sql
-- Direct creator profiles remain eligible even when not directory-listed.
exists (
  select 1 from public.creators c
  where c.id = p_creator_id
    and c.status = 'active'
    and c.handle is not null
    and c.public_profile is not null
)

exists (
  select 1 from public.merchant_profiles m
  where m.id = p_merchant_profile_id
    and m.status = 'active'
    and m.slug is not null
)
```

Use `FOR UPDATE` in `admin_set_enquiry_status`. Call:

```sql
perform public.ops_audit_log_append(
  'enquiry',
  p_id,
  'status.' || p_status,
  nullif(btrim(p_reason), ''),
  jsonb_build_object('from', v_from, 'to', p_status)
);
```

`admin_list_enquiries` must return only the queue fields and public target
identity; cap `p_limit` at 100 and use `(created_at, id)` keyset pagination.

Add this public, read-only attribution boundary:

```sql
public.get_attributed_guides_for_merchant(
  p_merchant_id uuid,
  p_limit integer default 9
) returns table (
  slug text,
  title text,
  cover_url text,
  city text,
  saves_count integer,
  creator_handle text
)
```

Implement it as `STABLE SECURITY DEFINER SET search_path = public`. Require an
active merchant with a public slug, join `bookings -> experiences -> guides`,
accept only `confirmed` or `completed` bookings and published guides, dedupe by
guide ID, and cap the limit at 20. Grant execution to `anon` and
`authenticated`. The return signature must not contain any booking ID/count,
traveler ID, guest email, checkout session, payment intent, or amount.

- [ ] **Step 4: Run the static contract and existing migration tests**

Run:

```powershell
pnpm --filter web test -- tests/db.r7-7-profile-enquiries.test.ts tests/db.r7-5-session-waitlist.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the database contract**

```powershell
git add apps/web/tests/db.r7-7-profile-enquiries.test.ts supabase/migrations/20260726090000_r7_7_profile_enquiries.sql
git commit -m "feat(db): add R7.7 profile enquiries"
```

---

### Task 2: Prove the live security boundary and regenerate types

**Files:**
- Create: `apps/web/tests/enquiries.rls.test.ts`
- Modify: `packages/db/types.ts`

**Interfaces:**
- Consumes: Task 1 RPCs and tables.
- Produces: generated `Database` types used by later Supabase calls.

- [ ] **Step 1: Write the live-Postgres tests**

Cover these cases with separate anon, authenticated, ops, and service clients:

```ts
it('denies direct anonymous and authenticated inserts', async () => {
  expect((await anon.from('enquiries').insert(validCreatorRow)).error).not.toBeNull()
  expect((await authed.from('enquiries').insert(validCreatorRow)).error).not.toBeNull()
})

it('submits both target types through the public RPC', async () => {
  const creator = await anon.rpc('submit_enquiry', creatorArgs('203.0.113.10'))
  const merchant = await anon.rpc('submit_enquiry', merchantArgs('203.0.113.11'))
  expect(creator.error).toBeNull()
  expect(merchant.error).toBeNull()
})

it('rate limits the sixth request in one hour', async () => {
  for (let i = 0; i < 5; i++) {
    expect((await anon.rpc('submit_enquiry', creatorArgs('203.0.113.12'))).error).toBeNull()
  }
  expect((await anon.rpc('submit_enquiry', creatorArgs('203.0.113.12'))).error?.message)
    .toContain('rate_limited')
})

it('requires ops and writes an audit row for status changes', async () => {
  expect((await authed.rpc('admin_set_enquiry_status', transitionArgs)).error).not.toBeNull()
  expect((await ops.rpc('admin_set_enquiry_status', transitionArgs)).error).toBeNull()
  const audit = await svc.from('ops_audit_log')
    .select('entity_type,entity_id,action,metadata')
    .eq('entity_type', 'enquiry')
    .eq('entity_id', enquiryId)
    .single()
  expect(audit.data?.metadata).toMatchObject({ from: 'new', to: 'resolved' })
})
```

Create real eligible creator/merchant fixtures in `beforeAll`, and remove all
enquiries, rate buckets, audit rows, profiles, and auth users in `afterAll`.
Assert the public list RPC is unavailable and the ops list RPC contains no
booking/customer fields.

- [ ] **Step 2: Reset local Supabase and run the live tests**

Run:

```powershell
pnpm exec supabase db reset
pnpm --filter web test -- tests/enquiries.rls.test.ts
```

Expected: PASS with the local Supabase URL, anon key, and service key loaded
using the same local-live configuration convention as the R7.3 tests.

- [ ] **Step 3: Regenerate local database types**

Run the standard command first:

```powershell
pnpm exec supabase gen types typescript --local --schema public | Set-Content -Encoding utf8 packages/db/types.ts
```

Expected: exit 0 and `packages/db/types.ts` contains `enquiries`,
`submit_enquiry`, `admin_list_enquiries`, `admin_set_enquiry_status`,
`get_attributed_guides_for_merchant`, and `creators.avatar_url`.

If CLI 2.106.0 misroutes through platform authentication, use the documented
pinned `supabase-go.exe` local-only sidecar from the Travelpayouts hotfix plan.
Do not use `--linked`, a project ID, or production credentials.

- [ ] **Step 4: Run typecheck and the live test again**

Run:

```powershell
pnpm --filter web typecheck
pnpm --filter web test -- tests/enquiries.rls.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit live security proof and generated types**

```powershell
git add apps/web/tests/enquiries.rls.test.ts packages/db/types.ts
git commit -m "test(db): verify R7.7 enquiry boundaries"
```

---

### Task 3: Implement honeypot-first enquiry submission

**Files:**
- Create: `apps/web/lib/enquiries/types.ts`
- Create: `apps/web/lib/enquiries/validation.ts`
- Create: `apps/web/lib/enquiries/actions.ts`
- Create: `apps/web/tests/enquiries.validation.test.ts`
- Create: `apps/web/tests/enquiries.actions.test.ts`
- Create: `apps/web/tests/enquiries.service-order.test.ts`

**Interfaces:**
- Produces:

```ts
export type EnquiryType = 'creator_collab' | 'merchant_contact'
export type EnquiryResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'rate_limited' | 'failed' }

export interface EnquiryInput {
  type: EnquiryType
  targetId: string
  name: string
  email: string
  message: string
  website?: string
}

export async function submitEnquiryAction(input: EnquiryInput): Promise<EnquiryResult>
```

- [ ] **Step 1: Write pure validation tests**

```ts
expect(validateEnquiryInput(valid)).toEqual({
  ok: true,
  value: {
    type: 'creator_collab',
    targetId: CREATOR_ID,
    name: 'Ada Wong',
    email: 'ada@example.com',
    message: 'I would like to discuss a campaign.',
  },
})

it.each([
  ['bad type', { ...valid, type: 'other' }],
  ['bad uuid', { ...valid, targetId: 'creator-1' }],
  ['blank name', { ...valid, name: ' ' }],
  ['bad email', { ...valid, email: 'no-at-sign' }],
  ['short message', { ...valid, message: 'hello' }],
  ['long message', { ...valid, message: 'x'.repeat(4001) }],
])('%s is invalid', (_label, input) => {
  expect(validateEnquiryInput(input)).toEqual({ ok: false })
})
```

- [ ] **Step 2: Write action and service-order tests**

The honeypot test must prove zero dependency calls:

```ts
await expect(submitEnquiryAction({ ...valid, website: 'spam.example' }))
  .resolves.toEqual({ ok: true })
expect(getClientIpMock).not.toHaveBeenCalled()
expect(createServerClientMock).not.toHaveBeenCalled()
expect(rpcMock).not.toHaveBeenCalled()
```

Also assert:

- invalid input does not resolve IP or call Supabase;
- normalized creator input sends `p_creator_id` and null merchant ID;
- normalized merchant input sends `p_merchant_profile_id` and null creator ID;
- `rate_limited` database errors map to `rate_limited`;
- all other errors map to `failed`;
- logs contain no submitted name, email, or message.

- [ ] **Step 3: Run tests and verify the modules are missing**

Run:

```powershell
pnpm --filter web test -- tests/enquiries.validation.test.ts tests/enquiries.actions.test.ts tests/enquiries.service-order.test.ts
```

Expected: FAIL with module-not-found errors.

- [ ] **Step 4: Implement the smallest passing modules**

Use:

```ts
export const ENQUIRY_RATE_LIMIT = { maxRequests: 5, windowSeconds: 3600 } as const

export async function submitEnquiryAction(input: EnquiryInput): Promise<EnquiryResult> {
  if (input.website) return { ok: true }
  const parsed = validateEnquiryInput(input)
  if (!parsed.ok) return { ok: false, error: 'invalid' }

  const ip = await getClientIp()
  const supabase = await createSupabaseServerClient()
  const isCreator = parsed.value.type === 'creator_collab'
  const { error } = await supabase.rpc('submit_enquiry', {
    p_type: parsed.value.type,
    p_creator_id: isCreator ? parsed.value.targetId : null,
    p_merchant_profile_id: isCreator ? null : parsed.value.targetId,
    p_name: parsed.value.name,
    p_email: parsed.value.email,
    p_message: parsed.value.message,
    p_ip: ip,
    p_max_requests: ENQUIRY_RATE_LIMIT.maxRequests,
    p_window_seconds: ENQUIRY_RATE_LIMIT.windowSeconds,
  })
  if (!error) return { ok: true }
  console.error('[enquiries] submission failed', { code: error.code })
  return { ok: false, error: error.message.includes('rate_limited') ? 'rate_limited' : 'failed' }
}
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
pnpm --filter web test -- tests/enquiries.validation.test.ts tests/enquiries.actions.test.ts tests/enquiries.service-order.test.ts
```

Expected: PASS.

```powershell
git add apps/web/lib/enquiries apps/web/tests/enquiries.validation.test.ts apps/web/tests/enquiries.actions.test.ts apps/web/tests/enquiries.service-order.test.ts
git commit -m "feat(web): add secure enquiry submission"
```

---

### Task 4: Build the shared accessible enquiry dialog

**Files:**
- Create: `apps/web/components/kinnso/enquiries/EnquiryDialog.tsx`
- Create: `apps/web/tests/kinnso.EnquiryDialog.test.tsx`
- Modify: all seven `apps/web/lib/i18n/messages/*.ts`
- Use: `apps/web/tests/i18n.locale-parity.test.ts`

**Interfaces:**
- Consumes: `submitEnquiryAction`, `EnquiryType`, and `Messages['enquiry']`.
- Produces:

```ts
export function EnquiryDialog(props: {
  type: EnquiryType
  targetId: string
  targetName: string
  triggerLabel: string
  t: Messages['enquiry']
}): React.ReactNode
```

- [ ] **Step 1: Add failing component tests**

Test:

```ts
it('submits normalized visible fields and an empty honeypot', async () => {
  renderDialog()
  await user.click(screen.getByRole('button', { name: 'Work with Ada' }))
  await user.type(screen.getByLabelText('Name'), 'Ada Client')
  await user.type(screen.getByLabelText('Email'), 'client@example.com')
  await user.type(screen.getByLabelText('Message'), 'A genuine campaign enquiry.')
  await user.click(screen.getByRole('button', { name: 'Send enquiry' }))
  expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({
    type: 'creator_collab',
    targetId: CREATOR_ID,
    website: '',
  }))
})
```

Also verify dialog title/description, pending disablement, retained fields after
an error, rate-limit copy, success replacement, reset after close/reopen, focus
return, and the honeypot being absent from the accessibility tree.

- [ ] **Step 2: Run the component test and verify it fails**

```powershell
pnpm --filter web test -- tests/kinnso.EnquiryDialog.test.tsx
```

Expected: FAIL because `EnquiryDialog` does not exist.

- [ ] **Step 3: Add the `enquiry` message namespace to all seven locales**

The English type/value keys are:

```ts
enquiry: {
  creatorPurpose: string
  merchantPurpose: string
  dialogTitle: string
  dialogDescription: string
  nameLabel: string
  emailLabel: string
  messageLabel: string
  submit: string
  submitting: string
  cancel: string
  invalid: string
  rateLimited: string
  failed: string
  successTitle: string
  successBody: string
}
```

Run:

```powershell
pnpm --filter web test -- tests/i18n.locale-parity.test.ts
```

Expected: PASS.

- [ ] **Step 4: Implement the dialog with the existing Radix wrappers**

Use `Dialog`, `DialogTrigger`, `DialogContent`, `DialogTitle`,
`DialogDescription`, `DialogClose`, and React `useTransition`. Keep form state
local, call the imported action once, set `aria-live="polite"` on feedback,
and reset state only after a completed dialog closes.

- [ ] **Step 5: Run tests and commit**

```powershell
pnpm --filter web test -- tests/kinnso.EnquiryDialog.test.tsx tests/i18n.locale-parity.test.ts
git add apps/web/components/kinnso/enquiries/EnquiryDialog.tsx apps/web/tests/kinnso.EnquiryDialog.test.tsx apps/web/lib/i18n/messages
git commit -m "feat(web): add shared enquiry dialog"
```

Expected: PASS, then commit succeeds.

---

### Task 5: Harden the creator public profile

**Files:**
- Modify: `apps/web/lib/creators/queries.ts`
- Modify: `apps/web/lib/articles/queries.ts`
- Modify: `apps/web/lib/sessions/public-queries.ts`
- Modify: `apps/web/app/[locale]/c/[handle]/page.tsx`
- Modify: `apps/web/components/kinnso/pages/CreatorProfileView.tsx`
- Modify/Create tests listed in the creator file map

**Interfaces:**
- Produces:

```ts
export interface PublicCreatorPlatform {
  platform: string
  verified: boolean
  followers?: number
}

export interface CreatorArticleCard {
  id: string
  url: string
  category: string
  title: string
  summary: string
  thumbnail: string | null
  publishedAt: string
}

export async function getPublishedArticlesForCreator(
  handle: string,
  locale: Locale,
  limit?: number,
): Promise<CreatorArticleCard[]>

export async function getPublicSessionsForCreator(
  creatorId: string,
  limit?: number,
): Promise<PublicSession[]>
```

- [ ] **Step 1: Write failing query tests**

Assert that:

- creator selection includes `id` and `avatar_url`;
- `toProfile()` keeps finite non-negative follower numbers and drops invalid values;
- article queries require exact `authors contains [handle]`, active matching author slug, published/non-deleted article, and requested locale translation;
- session queries filter `host_creator_id`, include scheduled/live, and include ended only with replay.

- [ ] **Step 2: Write failing view and host tests**

Render a creator with zero optional data and assert no headings for niches,
pillars, regions, languages, platforms, guides, articles, or sessions.

Render complete data and assert:

```ts
expect(screen.getByRole('button', { name: 'Work with Ada Wong' })).toBeVisible()
expect(screen.getByText('Chinese (Hong Kong)')).toBeVisible()
expect(screen.getByText('Hong Kong SAR China')).toBeVisible()
expect(screen.queryByText('zh-hk')).not.toBeInTheDocument()
expect(screen.queryByText('HK')).not.toBeInTheDocument()
expect(screen.queryByText('Tone')).not.toBeInTheDocument()
expect(screen.queryByText('Audience locales')).not.toBeInTheDocument()
```

Mock optional queries failing and assert the core page still renders.

- [ ] **Step 3: Run the focused creator tests and verify failures**

```powershell
pnpm --filter web test -- tests/creators.queries.test.ts tests/articles.creator-queries.test.ts tests/sessions.public-queries.test.ts tests/kinnso.CreatorProfileView.test.tsx tests/c.handle.host.test.tsx
```

Expected: FAIL on missing interfaces and current raw/empty rendering.

- [ ] **Step 4: Implement query and formatting helpers**

Add a pure display helper beside the view or in a focused
`apps/web/lib/i18n/display-names.ts` if tests show reuse:

```ts
export function displayName(
  locale: Locale,
  type: 'language' | 'region',
  code: string,
): string | null {
  try {
    const value = new Intl.DisplayNames([locale], { type }).of(code)
    return value && value.toLowerCase() !== code.toLowerCase() ? value : null
  } catch {
    return null
  }
}
```

In the route, keep `getCreatorByHandle()` required and run articles/sessions
through independent `optionalQuery()` calls. Pass all data and
`messages.enquiry` into `CreatorProfileView`.

- [ ] **Step 5: Implement conditional creator presentation**

Use `EntityMedia src={creator.avatarUrl}`. Add `EnquiryDialog`. Remove tone and
audience-locale markup. Filter unresolved display names before rendering. Use
`Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })`
only for stored follower values. Render each related-content section only when
its array is non-empty.

- [ ] **Step 6: Run focused tests and commit**

```powershell
pnpm --filter web test -- tests/creators.queries.test.ts tests/articles.creator-queries.test.ts tests/sessions.public-queries.test.ts tests/kinnso.CreatorProfileView.test.tsx tests/c.handle.host.test.tsx
git add apps/web/lib/creators/queries.ts apps/web/lib/articles/queries.ts apps/web/lib/sessions/public-queries.ts apps/web/app/'[locale]'/c/'[handle]'/page.tsx apps/web/components/kinnso/pages/CreatorProfileView.tsx apps/web/tests
git commit -m "feat(web): harden creator public profiles"
```

Expected: PASS, then commit succeeds.

---

### Task 6: Harden the merchant public profile

**Files:**
- Modify: `apps/web/lib/guides/queries.ts`
- Modify: `apps/web/app/[locale]/m/[slug]/page.tsx`
- Modify: `apps/web/components/kinnso/pages/PublicMerchantProfileView.tsx`
- Modify: `apps/web/tests/guides.queries.test.ts`
- Modify: `apps/web/tests/kinnso.PublicMerchantProfileView.test.tsx`
- Modify: `apps/web/tests/merchants.public-profile.host.test.tsx`

**Interfaces:**
- Produces:

```ts
export async function getAttributedGuidesForMerchant(
  merchantId: string,
  limit?: number,
): Promise<Guide[]>
```

- [ ] **Step 1: Write failing query and privacy tests**

Mock the public RPC/query boundary and assert the query returns deduplicated
published guide card data only. Explicitly assert the selected/returned shape
does not contain booking ID, count, traveler ID, guest email, payment intent,
or checkout session.

- [ ] **Step 2: Write failing view and host tests**

Cover:

```ts
renderMerchant({ bookingLive: true })
expect(screen.getAllByText('Book now')).not.toHaveLength(0)

renderMerchant({ bookingLive: false })
expect(screen.getAllByText('Booking opens soon')).not.toHaveLength(0)

expect(screen.getByRole('button', { name: 'Contact this merchant' })).toBeVisible()
```

Assert “Featured in guides” is absent for `[]` and present for a real guide.
Assert the page passes `resolveConfiguredProductState().bookingLive` and
degrades an optional attribution failure to `[]`.

- [ ] **Step 3: Run tests and verify current behavior fails**

```powershell
pnpm --filter web test -- tests/guides.queries.test.ts tests/kinnso.PublicMerchantProfileView.test.tsx tests/merchants.public-profile.host.test.tsx
```

Expected: FAIL on missing attribution query, booking labels, and CTA.

- [ ] **Step 4: Implement the query and route composition**

Use the privacy-safe database function/view added in Task 1 rather than reading
bookings directly through the public client. Resolve product state once:

```ts
const { bookingLive } = resolveConfiguredProductState()
const [experiences, featuredGuides] = await Promise.all([
  listPublishedExperiencesForMerchant(merchant.id),
  optionalQuery('merchant-featured-guides', () => getAttributedGuidesForMerchant(merchant.id), []),
])
```

- [ ] **Step 5: Implement merchant presentation**

Pass `messages.enquiry` to the shared dialog. Format prices with
`Intl.NumberFormat(locale, { style: 'currency', currency: exp.currency })`.
Keep the experience link in both booking states. Render attributed guides only
when non-empty.

- [ ] **Step 6: Run tests and commit**

```powershell
pnpm --filter web test -- tests/guides.queries.test.ts tests/kinnso.PublicMerchantProfileView.test.tsx tests/merchants.public-profile.host.test.tsx
git add apps/web/lib/guides/queries.ts apps/web/app/'[locale]'/m/'[slug]'/page.tsx apps/web/components/kinnso/pages/PublicMerchantProfileView.tsx apps/web/tests/guides.queries.test.ts apps/web/tests/kinnso.PublicMerchantProfileView.test.tsx apps/web/tests/merchants.public-profile.host.test.tsx
git commit -m "feat(web): harden merchant public profiles"
```

Expected: PASS, then commit succeeds.

---

### Task 7: Add the audited ops enquiry queue

**Files:**
- Create: `apps/web/lib/admin/enquiries-queries.ts`
- Create: `apps/web/lib/admin/enquiries-actions.ts`
- Create: `apps/web/components/kinnso/admin/AdminEnquiriesView.tsx`
- Create: `apps/web/app/[locale]/admin/enquiries/page.tsx`
- Modify: `apps/web/components/kinnso/admin/AdminShell.tsx`
- Modify: all seven locale message files
- Create/modify tests listed in the ops file map

**Interfaces:**
- Produces:

```ts
export type EnquiryStatus = 'new' | 'in_progress' | 'resolved' | 'spam'
export type EnquiryStatusFilter = 'active' | 'resolved' | 'spam'
export type EnquiryTypeFilter = 'all' | EnquiryType

export async function listAdminEnquiries(
  supabase: SupabaseClient<Database>,
  filters: { status: EnquiryStatusFilter; type: EnquiryTypeFilter },
): Promise<AdminEnquiry[]>

export async function setEnquiryStatusAction(
  locale: Locale,
  id: string,
  status: EnquiryStatus,
  reason: string,
): Promise<ActionResult>
```

- [ ] **Step 1: Write failing query/action tests**

Assert exact RPC names and arguments, active/default filters, safe error
mapping, `requireOpsAction`, reason validation for terminal/reopen transitions,
and revalidation of `/${locale}/admin/enquiries`.

- [ ] **Step 2: Write failing view, shell, and host tests**

Cover:

- anonymous redirect and non-ops 404;
- default active queue;
- type/status filter links or controls;
- target link to `/c/{handle}` or `/m/{slug}`;
- full message/name/email only inside the guarded view;
- allowed actions for each state;
- required reason for resolved, spam, and reopen;
- `AdminShell` includes and highlights `navEnquiries`.

- [ ] **Step 3: Run focused tests and verify missing modules**

```powershell
pnpm --filter web test -- tests/admin.enquiries-queries.test.ts tests/admin.enquiries-actions.test.ts tests/kinnso.AdminEnquiriesView.test.tsx tests/admin.enquiries.host.test.tsx tests/kinnso.AdminShell.test.tsx
```

Expected: FAIL with module-not-found and missing navigation assertions.

- [ ] **Step 4: Implement backend wrappers and guarded route**

The page must mirror the existing admin host pattern:

```ts
const supabase = await createSupabaseServerClient()
await requireOpsPage(supabase, locale)
const messages = await getDictionary(locale)
const enquiries = await listAdminEnquiries(supabase, filters)
```

Define the server action inside the page and delegate to
`setEnquiryStatusAction`. Never log the row payload on failure.

- [ ] **Step 5: Add `admin.navEnquiries` and `enquiriesAdmin` to all locales**

Use this exact message shape:

```ts
enquiriesAdmin: {
  title: string
  subtitle: string
  filterActive: string
  filterResolved: string
  filterSpam: string
  filterAllTypes: string
  typeCreator: string
  typeMerchant: string
  statusNew: string
  statusInProgress: string
  statusResolved: string
  statusSpam: string
  receivedAt: string
  target: string
  markInProgress: string
  markResolved: string
  markSpam: string
  reopen: string
  reasonLabel: string
  reasonRequired: string
  empty: string
  actionFailed: string
}
```

- [ ] **Step 6: Implement the queue view**

Use semantic buttons and labels, locale-aware timestamps, a per-row pending
state, and a reason input shown before terminal/reopen actions. Do not add
assignment, bulk actions, exports, or notifications.

- [ ] **Step 7: Run focused tests, locale parity, and commit**

```powershell
pnpm --filter web test -- tests/admin.enquiries-queries.test.ts tests/admin.enquiries-actions.test.ts tests/kinnso.AdminEnquiriesView.test.tsx tests/admin.enquiries.host.test.tsx tests/kinnso.AdminShell.test.tsx tests/i18n.locale-parity.test.ts
git add apps/web/lib/admin/enquiries-queries.ts apps/web/lib/admin/enquiries-actions.ts apps/web/components/kinnso/admin/AdminEnquiriesView.tsx apps/web/components/kinnso/admin/AdminShell.tsx apps/web/app/'[locale]'/admin/enquiries/page.tsx apps/web/lib/i18n/messages apps/web/tests
git commit -m "feat(web): add audited enquiry queue"
```

Expected: PASS, then commit succeeds.

---

### Task 8: Add profile-to-ops end-to-end coverage

**Files:**
- Create: `apps/e2e/specs/profile-enquiries.spec.ts`

**Interfaces:**
- Consumes: public creator/merchant fixtures, the shared dialog, and the guarded ops queue.
- Produces: acceptance proof for both enquiry types and one audited transition.

- [ ] **Step 1: Write the failing Playwright scenario**

The spec must create uniquely named test records through the approved local
test fixture boundary. Define the local helpers before the scenario:

```ts
async function fillEnquiry(page: Page, email: string, message: string) {
  await page.getByLabel('Name').fill('R7.7 E2E visitor')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Message').fill(message)
  await page.getByRole('button', { name: 'Send enquiry' }).click()
}

async function signInAsOps(page: Page) {
  const email = process.env.E2E_OPS_EMAIL
  const password = process.env.E2E_OPS_PASSWORD
  if (!email || !password) throw new Error('E2E_OPS_EMAIL and E2E_OPS_PASSWORD are required')
  await page.goto('/en/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}
```

Then exercise both public targets and the ops queue:

```ts
await page.goto(`/en/c/${creatorHandle}`)
await page.getByRole('button', { name: `Work with ${creatorName}` }).click()
await fillEnquiry(page, creatorEmail, 'Creator collaboration from Playwright')
await expect(page.getByRole('heading', { name: 'Enquiry sent' })).toBeVisible()

await page.goto(`/en/m/${merchantSlug}`)
await page.getByRole('button', { name: 'Contact this merchant' }).click()
await fillEnquiry(page, merchantEmail, 'Merchant contact from Playwright')
await expect(page.getByRole('heading', { name: 'Enquiry sent' })).toBeVisible()

await signInAsOps(page)
await page.goto('/en/admin/enquiries')
await expect(page.getByText('Creator collaboration from Playwright')).toBeVisible()
await expect(page.getByText('Merchant contact from Playwright')).toBeVisible()
```

Transition the creator enquiry to resolved with a reason and verify the
resolved filter contains it. Clean up all inserted rows.

- [ ] **Step 2: Run the spec and verify the missing acceptance behavior**

```powershell
pnpm --filter @kinnso/e2e e2e -- specs/profile-enquiries.spec.ts --project=chromium
```

Expected before all feature tasks are integrated: FAIL on the first missing CTA
or queue expectation. After Tasks 1–7: PASS.

- [ ] **Step 3: Stabilize selectors and fixture cleanup only**

Use role/name selectors and unique run IDs. Do not add arbitrary sleeps.
Cleanup must run in `finally`/fixture teardown so retries do not leave PII.

- [ ] **Step 4: Run the spec twice and commit**

```powershell
pnpm --filter @kinnso/e2e e2e -- specs/profile-enquiries.spec.ts --project=chromium
pnpm --filter @kinnso/e2e e2e -- specs/profile-enquiries.spec.ts --project=chromium
git add apps/e2e/specs/profile-enquiries.spec.ts
git commit -m "test(e2e): cover profile enquiries"
```

Expected: two consecutive PASS runs, then commit succeeds.

---

### Task 9: Run the R7.7 release gate and prepare the PR

**Files:**
- Modify only if verification exposes an R7.7 regression.
- Do not include `.codex-patches/` or `task3-red.patch`.

**Interfaces:**
- Produces: verified branch ready for one R7.7 PR and squash merge.

- [ ] **Step 1: Run migration and focused test suites**

```powershell
pnpm exec supabase db reset
pnpm --filter web test -- tests/db.r7-7-profile-enquiries.test.ts tests/enquiries.rls.test.ts tests/enquiries.validation.test.ts tests/enquiries.actions.test.ts tests/enquiries.service-order.test.ts tests/kinnso.EnquiryDialog.test.tsx tests/creators.queries.test.ts tests/articles.creator-queries.test.ts tests/sessions.public-queries.test.ts tests/kinnso.CreatorProfileView.test.tsx tests/c.handle.host.test.tsx tests/guides.queries.test.ts tests/kinnso.PublicMerchantProfileView.test.tsx tests/merchants.public-profile.host.test.tsx tests/admin.enquiries-queries.test.ts tests/admin.enquiries-actions.test.ts tests/kinnso.AdminEnquiriesView.test.tsx tests/admin.enquiries.host.test.tsx tests/kinnso.AdminShell.test.tsx tests/i18n.locale-parity.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run repository quality gates**

```powershell
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter @kinnso/e2e typecheck
pnpm honesty:lint
```

Expected: PASS. Record any unrelated pre-existing failure separately; do not
weaken a gate to make it green.

- [ ] **Step 3: Run acceptance e2e and production build**

```powershell
pnpm --filter @kinnso/e2e e2e -- specs/profile-enquiries.spec.ts specs/honesty.spec.ts specs/notfound.spec.ts --project=chromium
pnpm --filter web build
```

Expected: PASS.

- [ ] **Step 4: Review the final diff and generated types**

```powershell
git diff origin/main...HEAD --check
git status --short
rg -n 'enquiries|submit_enquiry|admin_list_enquiries|admin_set_enquiry_status|get_attributed_guides_for_merchant|avatar_url' packages/db/types.ts
```

Expected:

- no whitespace errors;
- only intended R7.7 files plus the two untouched user artifacts in status;
- generated types contain every new table/column/RPC;
- no submitted PII, service client, raw locale fallback, or city-based attribution.

- [ ] **Step 5: Request code review and fix findings**

Use `superpowers:requesting-code-review`. Treat each actionable finding with
`superpowers:receiving-code-review`, add a regression test first, then rerun the
relevant focused and release gates.

- [ ] **Step 6: Publish one R7.7 PR**

```powershell
git push -u origin codex/r7-7-profile-enquiries
gh pr create --base main --head codex/r7-7-profile-enquiries --title "feat: harden public profiles and add enquiries" --body-file <prepared-r7-7-pr-body.md>
```

The PR body must summarize:

- trusted creator/merchant profile changes;
- enquiry security and spam controls;
- audited ops workflow;
- migration/type regeneration;
- exact verification evidence.

After required checks and review pass, squash-merge the PR and verify the merge
commit on `origin/main`.
