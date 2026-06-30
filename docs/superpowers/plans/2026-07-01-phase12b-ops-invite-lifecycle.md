# Phase 12B — Ops Invite Flow + Lifecycle RPCs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the `kinnso_ops_invites` table and audited lifecycle RPCs (`admin_invite_ops_member`, `admin_revoke_ops_invite`, `admin_accept_ops_invite`, `admin_set_ops_member_role`, `admin_suspend_ops_member`, `admin_reactivate_ops_member`), wire invite and role/lifecycle actions into the Team UI, add the public accept-invite page, and extend `getTeamOverview` with pending-invite stats.

**Prerequisite:** Phase 12A must be merged to `main` before cutting this branch. Cut from the new `main` tip.

**Architecture:** All writes go through SECURITY DEFINER RPCs gated on `is_active_ops_role('owner')` (introduced here). The `is_active_ops_role(p_min text)` helper is defined in this migration so the lifecycle RPCs can use it immediately. `is_active_ops()` remains the gate for `requireOpsPage`/`requireOpsAction` — that switchover is 12C. Accept-invite is a public page (no ops gate); the RPC validates the token and requires the signed-in user's email to match the invite. Team actions are server actions in `lib/admin/team-actions.ts`. The Overview OverView is extended with an invite panel; the Directory gets wired action buttons.

**Tech Stack:** Supabase SECURITY DEFINER SQL, `ops_audit_log_append`, Next.js 16 App Router, `'use server'` actions, Vitest 4 jsdom.

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/20260701160000_ops_invites_and_lifecycle.sql` | CREATE |
| `packages/db/types.ts` | MODIFY (add `kinnso_ops_invites` table type, add 6 new RPC entries, add `is_active_ops_role`) |
| `apps/web/lib/admin/team-queries.ts` | MODIFY (extend `getTeamOverview` with pending invite count) |
| `apps/web/lib/admin/team-actions.ts` | CREATE |
| `apps/web/components/kinnso/admin/team/TeamOverviewView.tsx` | MODIFY (add invite panel) |
| `apps/web/components/kinnso/admin/team/TeamDirectoryView.tsx` | MODIFY (wire role-change + suspend/reactivate action props) |
| `apps/web/app/[locale]/admin/team/page.tsx` | MODIFY (pass invite actions) |
| `apps/web/app/[locale]/admin/team/directory/page.tsx` | MODIFY (pass lifecycle actions) |
| `apps/web/app/[locale]/ops/accept-invite/page.tsx` | CREATE |
| `apps/web/lib/i18n/messages/en.ts` | MODIFY (extend `team` group with invite + action strings) |
| `apps/web/lib/i18n/messages/zh-hk.ts` | MODIFY |
| `apps/web/lib/i18n/messages/zh-tw.ts` | MODIFY |
| `apps/web/lib/i18n/messages/zh-cn.ts` | MODIFY |
| `apps/web/lib/i18n/messages/ja.ts` | MODIFY |
| `apps/web/lib/i18n/messages/ko.ts` | MODIFY |
| `apps/web/lib/i18n/messages/th.ts` | MODIFY |
| `apps/web/tests/admin.team-actions.test.ts` | CREATE |
| `apps/web/tests/admin.ops-accept-invite.host.test.tsx` | CREATE |
| `apps/web/tests/kinnso.TeamOverviewView.test.tsx` | MODIFY (add invite panel tests) |
| `apps/web/tests/kinnso.TeamDirectoryView.test.tsx` | MODIFY (add action prop tests) |
| `apps/web/tests/admin.team-queries.test.ts` | MODIFY (add pending invite count test) |

---

## Task 1: Migration — `kinnso_ops_invites` + `is_active_ops_role` + lifecycle RPCs

**Files:**
- Create: `supabase/migrations/20260701160000_ops_invites_and_lifecycle.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 12B — kinnso_ops_invites table, is_active_ops_role() helper,
-- and all team lifecycle RPCs. is_active_ops() remains the gate for
-- requireOpsPage/requireOpsAction (switched in 12C).

-- ── Invites table ─────────────────────────────────────────────────────────
create table public.kinnso_ops_invites (
  id               uuid        primary key default gen_random_uuid(),
  email            text        not null,
  role             text        not null check (role in ('owner','admin','moderator','analyst')),
  token            text        not null unique default encode(gen_random_bytes(32), 'hex'),
  status           text        not null default 'pending'
                               check (status in ('pending','accepted','revoked','expired')),
  invited_by       uuid        not null references public.kinnso_ops_members(id),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '7 days'),
  accepted_at      timestamptz,
  accepted_user_id uuid        references auth.users(id)
);

-- Ops members can read all invites; anon can read a single row by token for the accept page.
alter table public.kinnso_ops_invites enable row level security;
create policy "ops members read invites"   on public.kinnso_ops_invites for select using (public.is_active_ops());
create policy "anon read by token"         on public.kinnso_ops_invites for select using (true);

-- ── Role-rank helper ──────────────────────────────────────────────────────
create or replace function public.is_active_ops_role(p_min text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_role text;
  rank_map constant jsonb := '{"analyst":1,"moderator":2,"admin":3,"owner":4}';
begin
  select role into v_role from public.kinnso_ops_members
    where user_id = auth.uid() and status = 'active';
  if v_role is null then return false; end if;
  return (rank_map ->> v_role)::int >= (rank_map ->> p_min)::int;
end $$;
revoke all on function public.is_active_ops_role(text) from public, anon;
grant execute on function public.is_active_ops_role(text) to authenticated;

-- ── Invite: create ────────────────────────────────────────────────────────
create or replace function public.admin_invite_ops_member(p_email text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_member_id uuid;
  v_token     text;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_email is null or trim(p_email) = '' then
    raise exception 'email_required' using errcode = '22000';
  end if;
  if p_role not in ('owner','admin','moderator','analyst') then
    raise exception 'bad_role' using errcode = '22000';
  end if;
  select id into v_member_id from public.kinnso_ops_members
    where user_id = auth.uid() and status = 'active';
  insert into public.kinnso_ops_invites (email, role, invited_by)
    values (lower(trim(p_email)), p_role, v_member_id)
    returning token into v_token;
  perform public.ops_audit_log_append(
    v_member_id, 'invite', v_token::uuid,
    'invited ' || p_email || ' as ' || p_role);
  return v_token;
end $$;
revoke all on function public.admin_invite_ops_member(text, text) from public, anon;
grant execute on function public.admin_invite_ops_member(text, text) to authenticated;

-- ── Invite: revoke ────────────────────────────────────────────────────────
create or replace function public.admin_revoke_ops_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_member_id uuid;
  v_email     text;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id into v_member_id from public.kinnso_ops_members
    where user_id = auth.uid() and status = 'active';
  update public.kinnso_ops_invites
    set status = 'revoked'
    where id = p_invite_id and status = 'pending'
    returning email into v_email;
  if v_email is null then
    raise exception 'not_found_or_not_pending' using errcode = '22000';
  end if;
  perform public.ops_audit_log_append(
    v_member_id, 'invite', p_invite_id,
    'revoked invite for ' || v_email);
end $$;
revoke all on function public.admin_revoke_ops_invite(uuid) from public, anon;
grant execute on function public.admin_revoke_ops_invite(uuid) to authenticated;

-- ── Invite: accept ────────────────────────────────────────────────────────
-- Public (authenticated user). Email must match auth.email(). Inserts member row.
create or replace function public.admin_accept_ops_invite(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_invite kinnso_ops_invites%rowtype;
  v_email  text;
  v_uid    uuid;
  v_name   text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  v_email := lower(trim(auth.email()));
  select * into v_invite from public.kinnso_ops_invites where token = p_token;
  if not found then
    raise exception 'not_found' using errcode = '22000';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'invite_' || v_invite.status using errcode = '22000';
  end if;
  if v_invite.expires_at < now() then
    update public.kinnso_ops_invites set status = 'expired' where id = v_invite.id;
    raise exception 'invite_expired' using errcode = '22000';
  end if;
  if lower(v_invite.email) <> v_email then
    raise exception 'email_mismatch' using errcode = '42501';
  end if;
  -- Derive a display name from the auth user's email (pre-@ portion).
  v_name := split_part(v_email, '@', 1);
  insert into public.kinnso_ops_members (user_id, display_name, role, status)
    values (v_uid, v_name, v_invite.role, 'active');
  update public.kinnso_ops_invites
    set status = 'accepted', accepted_at = now(), accepted_user_id = v_uid
    where id = v_invite.id;
end $$;
revoke all on function public.admin_accept_ops_invite(text) from public, anon;
grant execute on function public.admin_accept_ops_invite(text) to authenticated;

-- ── Member: set role ──────────────────────────────────────────────────────
create or replace function public.admin_set_ops_member_role(p_member_id uuid, p_role text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_id   uuid;
  v_owner_count int;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22000';
  end if;
  if p_role not in ('owner','admin','moderator','analyst') then
    raise exception 'bad_role' using errcode = '22000';
  end if;
  select id into v_caller_id from public.kinnso_ops_members
    where user_id = auth.uid() and status = 'active';
  if v_caller_id = p_member_id then
    raise exception 'self_role_change' using errcode = '42501';
  end if;
  -- Last-owner guard: prevent demoting if this is the only active owner.
  if p_role <> 'owner' then
    select count(*) into v_owner_count from public.kinnso_ops_members
      where role = 'owner' and status = 'active';
    if v_owner_count <= 1 then
      select count(*) into v_owner_count from public.kinnso_ops_members
        where id = p_member_id and role = 'owner' and status = 'active';
      if v_owner_count = 1 then
        raise exception 'last_owner' using errcode = '42501';
      end if;
    end if;
  end if;
  update public.kinnso_ops_members set role = p_role
    where id = p_member_id for update;
  if not found then raise exception 'not_found' using errcode = '22000'; end if;
  perform public.ops_audit_log_append(
    v_caller_id, 'ops_member', p_member_id, trim(p_reason));
end $$;
revoke all on function public.admin_set_ops_member_role(uuid, text, text) from public, anon;
grant execute on function public.admin_set_ops_member_role(uuid, text, text) to authenticated;

-- ── Member: suspend ───────────────────────────────────────────────────────
create or replace function public.admin_suspend_ops_member(p_member_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_id   uuid;
  v_owner_count int;
  v_target_role text;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22000';
  end if;
  select id into v_caller_id from public.kinnso_ops_members
    where user_id = auth.uid() and status = 'active';
  if v_caller_id = p_member_id then
    raise exception 'self_suspend' using errcode = '42501';
  end if;
  -- Last-owner guard.
  select role into v_target_role from public.kinnso_ops_members
    where id = p_member_id and status = 'active';
  if v_target_role = 'owner' then
    select count(*) into v_owner_count from public.kinnso_ops_members
      where role = 'owner' and status = 'active';
    if v_owner_count <= 1 then
      raise exception 'last_owner' using errcode = '42501';
    end if;
  end if;
  update public.kinnso_ops_members set status = 'suspended'
    where id = p_member_id and status = 'active' for update;
  if not found then raise exception 'not_found_or_not_active' using errcode = '22000'; end if;
  perform public.ops_audit_log_append(
    v_caller_id, 'ops_member', p_member_id, trim(p_reason));
end $$;
revoke all on function public.admin_suspend_ops_member(uuid, text) from public, anon;
grant execute on function public.admin_suspend_ops_member(uuid, text) to authenticated;

-- ── Member: reactivate ────────────────────────────────────────────────────
create or replace function public.admin_reactivate_ops_member(p_member_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_caller_id uuid; begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22000';
  end if;
  select id into v_caller_id from public.kinnso_ops_members
    where user_id = auth.uid() and status = 'active';
  update public.kinnso_ops_members set status = 'active'
    where id = p_member_id and status = 'suspended' for update;
  if not found then raise exception 'not_found_or_not_suspended' using errcode = '22000'; end if;
  perform public.ops_audit_log_append(
    v_caller_id, 'ops_member', p_member_id, trim(p_reason));
end $$;
revoke all on function public.admin_reactivate_ops_member(uuid, text) from public, anon;
grant execute on function public.admin_reactivate_ops_member(uuid, text) to authenticated;
```

- [ ] **Step 2: Apply migration via MCP**

Use `apply_migration` with `project_id: scryfkefedzuetfdtrvl`, `name: ops_invites_and_lifecycle`.

- [ ] **Step 3: Verify via MCP `execute_sql`**

```sql
select proname from pg_proc
where proname in ('is_active_ops_role','admin_invite_ops_member','admin_revoke_ops_invite',
                  'admin_accept_ops_invite','admin_set_ops_member_role',
                  'admin_suspend_ops_member','admin_reactivate_ops_member');
```
Expected: 7 rows.

```sql
select count(*) from information_schema.tables
where table_name = 'kinnso_ops_invites';
```
Expected: 1 row.

---

## Task 2: Hand-patch `packages/db/types.ts`

- [ ] **Step 1: Add `kinnso_ops_invites` table type**

Find the Tables section and add (after `kinnso_ops_members`):
```ts
      kinnso_ops_invites: {
        Row: {
          id: string
          email: string
          role: string
          token: string
          status: string
          invited_by: string
          created_at: string
          expires_at: string
          accepted_at: string | null
          accepted_user_id: string | null
        }
        Insert: {
          id?: string
          email: string
          role: string
          token?: string
          status?: string
          invited_by: string
          created_at?: string
          expires_at?: string
          accepted_at?: string | null
          accepted_user_id?: string | null
        }
        Update: {
          id?: string
          email?: string
          role?: string
          token?: string
          status?: string
          invited_by?: string
          created_at?: string
          expires_at?: string
          accepted_at?: string | null
          accepted_user_id?: string | null
        }
        Relationships: []
      }
```

- [ ] **Step 2: Add new RPC entries to the Functions section**

```ts
      is_active_ops_role: {
        Args: { p_min: string }
        Returns: boolean
      }
      admin_invite_ops_member: {
        Args: { p_email: string; p_role: string }
        Returns: string
      }
      admin_revoke_ops_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      admin_accept_ops_invite: {
        Args: { p_token: string }
        Returns: undefined
      }
      admin_set_ops_member_role: {
        Args: { p_member_id: string; p_role: string; p_reason: string }
        Returns: undefined
      }
      admin_suspend_ops_member: {
        Args: { p_member_id: string; p_reason: string }
        Returns: undefined
      }
      admin_reactivate_ops_member: {
        Args: { p_member_id: string; p_reason: string }
        Returns: undefined
      }
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter web typecheck
```
Expected: 0 errors.

---

## Task 3: TDD — `team-actions.ts`

**Files:**
- Create: `apps/web/tests/admin.team-actions.test.ts`
- Create: `apps/web/lib/admin/team-actions.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/tests/admin.team-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

type RpcResult = { data: unknown; error: { message: string } | null }
const { rpcMock, gateMock, revalidateMock } = vi.hoisted(() => ({
  rpcMock:        vi.fn(async (): Promise<RpcResult> => ({ data: null, error: null })),
  gateMock:       vi.fn(async () => ({ ok: true as const, user: { id: 'u1' } })),
  revalidateMock: vi.fn(),
}))
vi.mock('next/cache',          () => ({ revalidatePath: revalidateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('@/lib/admin/guard',   () => ({ requireOpsAction: gateMock }))

import {
  inviteMemberAction, revokeInviteAction,
  setMemberRoleAction, suspendMemberAction, reactivateMemberAction,
} from '@/lib/admin/team-actions'

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null })
  gateMock.mockReset().mockResolvedValue({ ok: true, user: { id: 'u1' } })
  revalidateMock.mockReset()
})

describe('inviteMemberAction', () => {
  it('calls admin_invite_ops_member and returns the token', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'abc123', error: null })
    const res = await inviteMemberAction('en', 'test@example.com', 'moderator')
    expect(rpcMock).toHaveBeenCalledWith('admin_invite_ops_member', { p_email: 'test@example.com', p_role: 'moderator' })
    expect(res).toEqual({ ok: true, token: 'abc123' })
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/team')
  })
  it('rejects an invalid role', async () => {
    const res = await inviteMemberAction('en', 'x@x.com', 'superadmin' as never)
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('rejects a blank email', async () => {
    const res = await inviteMemberAction('en', '   ', 'analyst')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('maps forbidden DB error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await inviteMemberAction('en', 'x@x.com', 'analyst')
    expect(res.ok).toBe(false)
  })
})

describe('revokeInviteAction', () => {
  it('calls admin_revoke_ops_invite and revalidates', async () => {
    const res = await revokeInviteAction('en', 'inv1')
    expect(rpcMock).toHaveBeenCalledWith('admin_revoke_ops_invite', { p_invite_id: 'inv1' })
    expect(res).toEqual({ ok: true })
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/team')
  })
})

describe('setMemberRoleAction', () => {
  it('calls admin_set_ops_member_role and revalidates', async () => {
    const res = await setMemberRoleAction('en', 'm1', 'admin', 'promotind to admin')
    expect(rpcMock).toHaveBeenCalledWith('admin_set_ops_member_role', { p_member_id: 'm1', p_role: 'admin', p_reason: 'promotind to admin' })
    expect(res).toEqual({ ok: true })
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/team/directory')
  })
  it('rejects a blank reason', async () => {
    const res = await setMemberRoleAction('en', 'm1', 'admin', '   ')
    expect(res.ok).toBe(false); expect(rpcMock).not.toHaveBeenCalled()
  })
  it('rejects an invalid role', async () => {
    const res = await setMemberRoleAction('en', 'm1', 'superadmin' as never, 'reason')
    expect(res.ok).toBe(false); expect(rpcMock).not.toHaveBeenCalled()
  })
  it('maps self_role_change DB raise', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'self_role_change' } })
    const res = await setMemberRoleAction('en', 'm1', 'moderator', 'oops')
    expect(res.ok).toBe(false)
  })
  it('maps last_owner DB raise', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'last_owner' } })
    const res = await setMemberRoleAction('en', 'm1', 'admin', 'demote')
    expect(res.ok).toBe(false)
  })
})

describe('suspendMemberAction', () => {
  it('calls admin_suspend_ops_member', async () => {
    const res = await suspendMemberAction('en', 'm1', 'policy violation')
    expect(rpcMock).toHaveBeenCalledWith('admin_suspend_ops_member', { p_member_id: 'm1', p_reason: 'policy violation' })
    expect(res).toEqual({ ok: true })
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/team/directory')
  })
  it('rejects blank reason', async () => {
    const res = await suspendMemberAction('en', 'm1', '')
    expect(res.ok).toBe(false); expect(rpcMock).not.toHaveBeenCalled()
  })
  it('maps self_suspend DB raise', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'self_suspend' } })
    const res = await suspendMemberAction('en', 'm1', 'reason')
    expect(res.ok).toBe(false)
  })
  it('maps last_owner DB raise', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'last_owner' } })
    const res = await suspendMemberAction('en', 'm1', 'reason')
    expect(res.ok).toBe(false)
  })
})

describe('reactivateMemberAction', () => {
  it('calls admin_reactivate_ops_member', async () => {
    const res = await reactivateMemberAction('en', 'm1', 'reinstated')
    expect(rpcMock).toHaveBeenCalledWith('admin_reactivate_ops_member', { p_member_id: 'm1', p_reason: 'reinstated' })
    expect(res).toEqual({ ok: true })
  })
  it('rejects blank reason', async () => {
    const res = await reactivateMemberAction('en', 'm1', '  ')
    expect(res.ok).toBe(false); expect(rpcMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter web test -- admin.team-actions --run
```
Expected: FAIL.

- [ ] **Step 3: Implement `team-actions.ts`**

```ts
// apps/web/lib/admin/team-actions.ts
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateReason } from '@/lib/admin/ops-validation'
import type { Locale } from '@/lib/i18n/config'

const teamPath      = (locale: Locale) => `/${locale}/admin/team`
const directoryPath = (locale: Locale) => `/${locale}/admin/team/directory`

const VALID_ROLES = ['owner', 'admin', 'moderator', 'analyst'] as const
type OpsRole = (typeof VALID_ROLES)[number]
const isOpsRole = (r: string): r is OpsRole => (VALID_ROLES as readonly string[]).includes(r)

const FRIENDLY: Record<string, string> = {
  forbidden:            'Owner access is required.',
  reason_required:      'A reason is required.',
  reason_too_long:      'The reason is too long (max 500 characters).',
  bad_role:             'Invalid role.',
  email_required:       'An email address is required.',
  self_role_change:     "You can't change your own role.",
  self_suspend:         "You can't suspend yourself.",
  last_owner:           'There must be at least one active owner.',
  not_found:            'Member not found. Refresh and try again.',
  not_found_or_not_pending: 'Invite not found or already processed.',
  email_mismatch:       'This invite was sent to a different email address.',
  invite_accepted:      'This invite has already been accepted.',
  invite_revoked:       'This invite has been revoked.',
  invite_expired:       'This invite has expired.',
}
const mapError = (msg: string): string => {
  const key = Object.keys(FRIENDLY).find((k) => msg.includes(k))
  return key ? FRIENDLY[key] : 'An unexpected error occurred.'
}

export async function inviteMemberAction(
  locale: Locale, email: string, role: string,
): Promise<ActionResult<{ token: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!email || !email.trim()) return formError(FRIENDLY.email_required)
  if (!isOpsRole(role)) return formError(FRIENDLY.bad_role)
  const { data, error } = await supabase.rpc('admin_invite_ops_member', { p_email: email.trim(), p_role: role })
  if (error || !data) return formError(mapError(error?.message ?? ''))
  revalidatePath(teamPath(locale))
  return { ok: true, token: data as string }
}

export async function revokeInviteAction(
  locale: Locale, inviteId: string,
): Promise<ActionResult<Record<string, never>>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const { error } = await supabase.rpc('admin_revoke_ops_invite', { p_invite_id: inviteId })
  if (error) return formError(mapError(error.message))
  revalidatePath(teamPath(locale))
  return { ok: true }
}

export async function setMemberRoleAction(
  locale: Locale, memberId: string, role: string, reason: string,
): Promise<ActionResult<Record<string, never>>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!isOpsRole(role)) return formError(FRIENDLY.bad_role)
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr] ?? rErr)
  const { error } = await supabase.rpc('admin_set_ops_member_role', { p_member_id: memberId, p_role: role, p_reason: reason.trim() })
  if (error) return formError(mapError(error.message))
  revalidatePath(directoryPath(locale))
  return { ok: true }
}

export async function suspendMemberAction(
  locale: Locale, memberId: string, reason: string,
): Promise<ActionResult<Record<string, never>>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr] ?? rErr)
  const { error } = await supabase.rpc('admin_suspend_ops_member', { p_member_id: memberId, p_reason: reason.trim() })
  if (error) return formError(mapError(error.message))
  revalidatePath(directoryPath(locale))
  return { ok: true }
}

export async function reactivateMemberAction(
  locale: Locale, memberId: string, reason: string,
): Promise<ActionResult<Record<string, never>>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr] ?? rErr)
  const { error } = await supabase.rpc('admin_reactivate_ops_member', { p_member_id: memberId, p_reason: reason.trim() })
  if (error) return formError(mapError(error.message))
  revalidatePath(directoryPath(locale))
  return { ok: true }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter web test -- admin.team-actions --run
```
Expected: PASS (5 describes, all green).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260701160000_ops_invites_and_lifecycle.sql packages/db/types.ts apps/web/lib/admin/team-actions.ts apps/web/tests/admin.team-actions.test.ts
git commit -m "feat(db): Phase 12B — kinnso_ops_invites + is_active_ops_role + lifecycle RPCs + team-actions"
```

---

## Task 4: Extend `team-queries.ts` with pending invite count

- [ ] **Step 1: Update the test for `getTeamOverview`**

In `apps/web/tests/admin.team-queries.test.ts`, add a mock for the invites query and update the `pendingInvites` expectation.

Add to the `vi.hoisted` block:
```ts
const { rpcMock, fromMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (): Promise<RpcResult> => ({ data: null, error: null })),
  fromMock: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    then:   vi.fn().mockResolvedValue({ count: 2, error: null }),
  })),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ rpc: rpcMock, from: fromMock }),
}))
```

Update the supabase stub used in tests:
```ts
const supabase = { rpc: rpcMock, from: fromMock } as unknown as SupabaseClient<Database>
```

Update the `getTeamOverview` test:
```ts
describe('getTeamOverview', () => {
  it('aggregates byRole and fetches pending invite count', async () => {
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      then:   vi.fn((cb: (v: { count: number; error: null }) => void) => cb({ count: 3, error: null })),
    })
    const overview = await getTeamOverview(supabase)
    expect(overview.byRole).toEqual({ owner: 1, moderator: 1, analyst: 1, admin: 0 })
    expect(overview.pendingInvites).toBe(3)
  })
})
```

- [ ] **Step 2: Implement the change in `team-queries.ts`**

Replace the `getTeamOverview` implementation:

```ts
export async function getTeamOverview(supabase: Client): Promise<TeamOverview> {
  const members = await getTeamMembers(supabase)
  const byRole: Record<string, number> = { owner: 0, admin: 0, moderator: 0, analyst: 0 }
  for (const m of members) {
    if (m.role in byRole) byRole[m.role]++
  }
  const { count } = await (supabase as unknown as { from: (t: string) => { select: (c: string, o: object) => { eq: (k: string, v: string) => Promise<{ count: number | null; error: unknown }> } } })
    .from('kinnso_ops_invites')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  return { members, byRole, pendingInvites: count ?? 0 }
}
```

Actually, use the typed Supabase client properly:

```ts
export async function getTeamOverview(supabase: Client): Promise<TeamOverview> {
  const members = await getTeamMembers(supabase)
  const byRole: Record<string, number> = { owner: 0, admin: 0, moderator: 0, analyst: 0 }
  for (const m of members) {
    if (m.role in byRole) byRole[m.role]++
  }
  const { count } = await supabase
    .from('kinnso_ops_invites')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  return { members, byRole, pendingInvites: count ?? 0 }
}
```

- [ ] **Step 3: Run team-queries tests**

```bash
pnpm --filter web test -- admin.team-queries --run
```
Expected: PASS.

---

## Task 5: i18n — extend `team` group with invite + action strings

For each of the 7 locale files, add the following keys to the `team` group (after the existing `colJoined` key).

- [ ] **Step 1: Extend `en.ts` interface**

Add to the `team` interface:
```ts
    // invite panel
    invitePanelTitle: string; inviteEmailLabel: string; inviteRoleLabel: string
    inviteGenerate: string; inviteCopied: string; inviteExpiry: string
    // actions
    actionSetRole: string; actionSuspend: string; actionReactivate: string
    actionConfirm: string; actionCancel: string; reasonPlaceholder: string
    // accept-invite page
    acceptTitle: string; acceptLoading: string
    acceptSuccess: string; acceptExpired: string
    acceptEmailMismatch: string; acceptNotFound: string; acceptSignInPrompt: string
```

- [ ] **Step 2: Add values to `en.ts`**

In the `team` values object:
```ts
    invitePanelTitle: 'Invite a member', inviteEmailLabel: 'Email address', inviteRoleLabel: 'Role',
    inviteGenerate: 'Generate invite link', inviteCopied: 'Copied!', inviteExpiry: 'Link expires in 7 days.',
    actionSetRole: 'Change role', actionSuspend: 'Suspend', actionReactivate: 'Reactivate',
    actionConfirm: 'Confirm', actionCancel: 'Cancel', reasonPlaceholder: 'Reason (required)',
    acceptTitle: 'Accept invitation', acceptLoading: 'Accepting…',
    acceptSuccess: 'You now have ops access. Go to the admin panel to get started.',
    acceptExpired: 'This invite has expired or been revoked. Ask an owner for a new one.',
    acceptEmailMismatch: 'This invite was sent to a different email address.',
    acceptNotFound: 'Invite not found.',
    acceptSignInPrompt: 'Sign in to accept this invitation.',
```

- [ ] **Step 3: Mirror into `zh-hk.ts`**

Add to interface (same as en). Values:
```ts
    invitePanelTitle: '邀請成員', inviteEmailLabel: '電子郵件地址', inviteRoleLabel: '角色',
    inviteGenerate: '生成邀請連結', inviteCopied: '已複製！', inviteExpiry: '連結7天後過期。',
    actionSetRole: '更改角色', actionSuspend: '暫停', actionReactivate: '重新啟用',
    actionConfirm: '確認', actionCancel: '取消', reasonPlaceholder: '原因（必填）',
    acceptTitle: '接受邀請', acceptLoading: '正在接受…',
    acceptSuccess: '您現在擁有運營訪問權限。前往管理面板開始使用。',
    acceptExpired: '此邀請已過期或已撤銷，請向管理員申請新的邀請。',
    acceptEmailMismatch: '此邀請是發送到不同的電子郵件地址的。',
    acceptNotFound: '找不到邀請。',
    acceptSignInPrompt: '請登入以接受此邀請。',
```

- [ ] **Step 4: Mirror into `zh-tw.ts`**

Same as zh-hk (Traditional Chinese; adjust if variant differs).

- [ ] **Step 5: Mirror into `zh-cn.ts`**

Values:
```ts
    invitePanelTitle: '邀请成员', inviteEmailLabel: '电子邮件地址', inviteRoleLabel: '角色',
    inviteGenerate: '生成邀请链接', inviteCopied: '已复制！', inviteExpiry: '链接7天后过期。',
    actionSetRole: '更改角色', actionSuspend: '暂停', actionReactivate: '重新激活',
    actionConfirm: '确认', actionCancel: '取消', reasonPlaceholder: '原因（必填）',
    acceptTitle: '接受邀请', acceptLoading: '正在接受…',
    acceptSuccess: '您现在拥有运营访问权限。前往管理面板开始使用。',
    acceptExpired: '此邀请已过期或已撤销，请向管理员申请新的邀请。',
    acceptEmailMismatch: '此邀请是发送到不同电子邮件地址的。',
    acceptNotFound: '未找到邀请。',
    acceptSignInPrompt: '请登录以接受此邀请。',
```

- [ ] **Step 6: Mirror into `ja.ts`**

Values:
```ts
    invitePanelTitle: 'メンバーを招待', inviteEmailLabel: 'メールアドレス', inviteRoleLabel: '役割',
    inviteGenerate: '招待リンクを生成', inviteCopied: 'コピーしました！', inviteExpiry: 'リンクは7日後に期限切れになります。',
    actionSetRole: '役割を変更', actionSuspend: '停止', actionReactivate: '再有効化',
    actionConfirm: '確認', actionCancel: 'キャンセル', reasonPlaceholder: '理由（必須）',
    acceptTitle: '招待を承認', acceptLoading: '承認中…',
    acceptSuccess: '運営アクセス権が付与されました。管理パネルから始めてください。',
    acceptExpired: 'この招待は期限切れまたは取り消されています。オーナーに新しい招待を依頼してください。',
    acceptEmailMismatch: 'この招待は別のメールアドレスに送信されました。',
    acceptNotFound: '招待が見つかりません。',
    acceptSignInPrompt: 'この招待を承認するにはサインインしてください。',
```

- [ ] **Step 7: Mirror into `ko.ts`**

Values:
```ts
    invitePanelTitle: '멤버 초대', inviteEmailLabel: '이메일 주소', inviteRoleLabel: '역할',
    inviteGenerate: '초대 링크 생성', inviteCopied: '복사됨!', inviteExpiry: '링크는 7일 후 만료됩니다.',
    actionSetRole: '역할 변경', actionSuspend: '정지', actionReactivate: '재활성화',
    actionConfirm: '확인', actionCancel: '취소', reasonPlaceholder: '이유 (필수)',
    acceptTitle: '초대 수락', acceptLoading: '수락 중…',
    acceptSuccess: '이제 운영 접근 권한이 있습니다. 관리 패널에서 시작하세요.',
    acceptExpired: '이 초대는 만료되었거나 취소되었습니다. 소유자에게 새 초대를 요청하세요.',
    acceptEmailMismatch: '이 초대는 다른 이메일 주소로 전송되었습니다.',
    acceptNotFound: '초대를 찾을 수 없습니다.',
    acceptSignInPrompt: '이 초대를 수락하려면 로그인하세요.',
```

- [ ] **Step 8: Mirror into `th.ts`**

Values:
```ts
    invitePanelTitle: 'เชิญสมาชิก', inviteEmailLabel: 'ที่อยู่อีเมล', inviteRoleLabel: 'บทบาท',
    inviteGenerate: 'สร้างลิงก์เชิญ', inviteCopied: 'คัดลอกแล้ว!', inviteExpiry: 'ลิงก์จะหมดอายุใน 7 วัน',
    actionSetRole: 'เปลี่ยนบทบาท', actionSuspend: 'ระงับ', actionReactivate: 'เปิดใช้งานอีกครั้ง',
    actionConfirm: 'ยืนยัน', actionCancel: 'ยกเลิก', reasonPlaceholder: 'เหตุผล (จำเป็น)',
    acceptTitle: 'ยอมรับคำเชิญ', acceptLoading: 'กำลังยอมรับ…',
    acceptSuccess: 'คุณมีสิทธิ์เข้าถึงการปฏิบัติการแล้ว ไปที่แผงผู้ดูแลระบบเพื่อเริ่มต้น',
    acceptExpired: 'คำเชิญนี้หมดอายุหรือถูกเพิกถอนแล้ว ขอคำเชิญใหม่จากเจ้าของ',
    acceptEmailMismatch: 'คำเชิญนี้ส่งถึงที่อยู่อีเมลอื่น',
    acceptNotFound: 'ไม่พบคำเชิญ',
    acceptSignInPrompt: 'ลงชื่อเข้าใช้เพื่อยอมรับคำเชิญนี้',
```

- [ ] **Step 9: Run parity test**

```bash
pnpm --filter web test -- i18n.locale-parity --run
```
Expected: PASS.

- [ ] **Step 10: Commit i18n**

```bash
git add apps/web/lib/i18n/messages/
git commit -m "i18n(team): extend team group with invite + action strings (Phase 12B)"
```

---

## Task 6: TDD — Accept-invite page

**Files:**
- Create: `apps/web/tests/admin.ops-accept-invite.host.test.tsx`
- Create: `apps/web/app/[locale]/ops/accept-invite/page.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/tests/admin.ops-accept-invite.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
afterEach(cleanup)

const { getUserMock, rpcMock, redirectMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1', email: 'alice@example.com' } } })),
  rpcMock:     vi.fn(async () => ({ data: null, error: null })),
  redirectMock: vi.fn((p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) }),
}))
vi.mock('next/navigation', () => ({
  redirect:    redirectMock,
  notFound:    () => { throw new Error('NEXT_NOT_FOUND') },
  useRouter:   () => ({ push: vi.fn() }),
  usePathname: () => '/',
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock }, rpc: rpcMock }),
}))

import AcceptInvitePage from '@/app/[locale]/ops/accept-invite/page'

const params = (locale = 'en') => Promise.resolve({ locale })
const searchParams = (token = 'tok123') => Promise.resolve({ token })

beforeEach(() => {
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'alice@example.com' } } })
  rpcMock.mockResolvedValue({ data: null, error: null })
  redirectMock.mockImplementation((p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) })
})

describe('accept-invite page', () => {
  it('shows success message when token is valid', async () => {
    const ui = await AcceptInvitePage({ params: params(), searchParams: searchParams() })
    render(ui)
    expect(screen.getByText(/ops access/i)).toBeTruthy()
  })
  it('calls admin_accept_ops_invite with the token', async () => {
    await AcceptInvitePage({ params: params(), searchParams: searchParams('mytoken') })
    expect(rpcMock).toHaveBeenCalledWith('admin_accept_ops_invite', { p_token: 'mytoken' })
  })
  it('redirects to sign-in when user is not signed in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(AcceptInvitePage({ params: params(), searchParams: searchParams() }))
      .rejects.toThrow('NEXT_REDIRECT:/en/sign-in?next=%2Fen%2Fops%2Faccept-invite%3Ftoken%3Dtok123')
  })
  it('shows expired message on invite_expired error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'invite_expired' } })
    const ui = await AcceptInvitePage({ params: params(), searchParams: searchParams() })
    render(ui)
    expect(screen.getByText(/expired/i)).toBeTruthy()
  })
  it('shows email-mismatch message on email_mismatch error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'email_mismatch' } })
    const ui = await AcceptInvitePage({ params: params(), searchParams: searchParams() })
    render(ui)
    expect(screen.getByText(/different email/i)).toBeTruthy()
  })
  it('shows not-found message when token is missing', async () => {
    const ui = await AcceptInvitePage({ params: params(), searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText(/not found/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter web test -- admin.ops-accept-invite.host --run
```
Expected: FAIL.

- [ ] **Step 3: Implement `accept-invite/page.tsx`**

```tsx
// apps/web/app/[locale]/ops/accept-invite/page.tsx
import { redirect } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

const ERROR_KEYS: Record<string, string> = {
  invite_expired:          'acceptExpired',
  invite_accepted:         'acceptExpired',
  invite_revoked:          'acceptExpired',
  email_mismatch:          'acceptEmailMismatch',
  not_found:               'acceptNotFound',
}

export default async function AcceptInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const [{ locale }, { token }] = await Promise.all([params, searchParams])
  const loc: Locale = isLocale(locale) ? locale : 'en'
  const messages = await getDictionary(loc)
  const t = messages.team

  if (!token) {
    return (
      <div className="k-container py-16 text-center">
        <h1 className="text-xl font-bold">{t.acceptTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t.acceptNotFound}</p>
      </div>
    )
  }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const next = encodeURIComponent(`/${loc}/ops/accept-invite?token=${token}`)
    redirect(`/${loc}/sign-in?next=${next}`)
  }

  const { error } = await supabase.rpc('admin_accept_ops_invite', { p_token: token })

  if (error) {
    const msgKey = Object.keys(ERROR_KEYS).find((k) => error.message.includes(k))
    const tKey = msgKey ? ERROR_KEYS[msgKey] : 'acceptNotFound'
    return (
      <div className="k-container py-16 text-center">
        <h1 className="text-xl font-bold">{t.acceptTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t[tKey as keyof typeof t] as string}</p>
      </div>
    )
  }

  return (
    <div className="k-container py-16 text-center">
      <h1 className="text-xl font-bold">{t.acceptTitle}</h1>
      <p className="mt-2 text-kinnso-muted">{t.acceptSuccess}</p>
      <a href={`/${loc}/admin`} className="mt-4 inline-block text-sm font-semibold text-kinnso-orange hover:underline">
        Go to admin →
      </a>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter web test -- admin.ops-accept-invite.host --run
```
Expected: PASS.

---

## Task 7: Wire invite panel into `TeamOverviewView` + update directory with action props

**Files:**
- Modify: `apps/web/components/kinnso/admin/team/TeamOverviewView.tsx`
- Modify: `apps/web/components/kinnso/admin/team/TeamDirectoryView.tsx`
- Modify: `apps/web/app/[locale]/admin/team/page.tsx`
- Modify: `apps/web/app/[locale]/admin/team/directory/page.tsx`

- [ ] **Step 1: Update `TeamOverviewView` with invite panel**

Add `onInvite` prop:
```tsx
'use client'
import Link from 'next/link'
import { useState } from 'react'
import { KpiCard } from '@/components/kinnso/admin/KpiCard'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { TeamOverview } from '@/lib/admin/team-queries'
import type { ActionResult } from '@/lib/admin/result'

const ROLES = ['owner', 'admin', 'moderator', 'analyst'] as const

export function TeamOverviewView({ t, locale, overview, onInvite }: {
  t: Messages['team']
  locale: Locale
  overview: TeamOverview
  onInvite: (email: string, role: string) => Promise<ActionResult<{ token: string }>>
}) {
  const roleLabel: Record<string, string> = {
    owner: t.roleOwner, admin: t.roleAdmin, moderator: t.roleModerator, analyst: t.roleAnalyst,
  }
  const [email, setEmail]   = useState('')
  const [role, setRole]     = useState<string>('analyst')
  const [copied, setCopied] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  async function handleGenerate() {
    setErr(null); setCopied(false)
    const res = await onInvite(email, role)
    if (!res.ok) { setErr(res.error); return }
    const url = `${window.location.origin}/${locale}/ops/accept-invite?token=${res.token}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-kinnso-ink">{t.overviewTitle}</h1>
        <p className="text-sm text-kinnso-muted">{t.overviewSubtitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard label={t.kpiMembers}  value={overview.members.length} />
        <KpiCard label={t.kpiPending}  value={overview.pendingInvites} />
        {ROLES.map((r) => (
          <KpiCard key={r} label={roleLabel[r]} value={overview.byRole[r] ?? 0} />
        ))}
      </div>

      {/* Invite panel */}
      <div className="rounded-xl border border-kinnso-border p-4 space-y-3">
        <h2 className="text-sm font-bold text-kinnso-ink">{t.invitePanelTitle}</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.inviteEmailLabel}
            className="flex-1 rounded-lg border border-kinnso-border px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-lg border border-kinnso-border px-3 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{roleLabel[r]}</option>
            ))}
          </select>
          <button
            onClick={handleGenerate}
            className="rounded-lg bg-kinnso-orange px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            {copied ? t.inviteCopied : t.inviteGenerate}
          </button>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <p className="text-xs text-kinnso-muted">{t.inviteExpiry}</p>
      </div>

      <div>
        <Link href={`/${locale}/admin/team/directory`} className="text-sm font-semibold text-kinnso-orange hover:underline">
          {t.directoryTitle} →
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `TeamDirectoryView` with action props**

Add `onSetRole`, `onSuspend`, `onReactivate` props and wire the action confirm/reason dialogs:

```tsx
'use client'
import { useState } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { MemberRow } from '@/lib/admin/team-queries'
import type { ActionResult } from '@/lib/admin/result'

type Void = ActionResult<Record<string, never>>

export function TeamDirectoryView({ t, members, onSetRole, onSuspend, onReactivate }: {
  t: Messages['team']
  members: MemberRow[]
  onSetRole:     (memberId: string, role: string, reason: string) => Promise<Void>
  onSuspend:     (memberId: string, reason: string) => Promise<Void>
  onReactivate:  (memberId: string, reason: string) => Promise<Void>
}) {
  const roleLabel: Record<string, string> = {
    owner: t.roleOwner, admin: t.roleAdmin, moderator: t.roleModerator, analyst: t.roleAnalyst,
  }
  const statusLabel: Record<string, string> = {
    active: t.statusActive, suspended: t.statusSuspended,
  }
  const roleBadgeClass: Record<string, string> = {
    owner:     'bg-amber-100 text-amber-700',
    admin:     'bg-blue-100 text-blue-700',
    moderator: 'bg-purple-100 text-purple-700',
    analyst:   'bg-gray-100 text-gray-700',
  }
  const ROLES = ['owner', 'admin', 'moderator', 'analyst'] as const
  const [pendingRole,   setPendingRole]   = useState<{ id: string; role: string } | null>(null)
  const [pendingSuspend, setPendingSuspend] = useState<string | null>(null)
  const [reason, setReason]               = useState('')
  const [err, setErr]                     = useState<string | null>(null)

  async function confirmRoleChange() {
    if (!pendingRole) return; setErr(null)
    const res = await onSetRole(pendingRole.id, pendingRole.role, reason)
    if (!res.ok) { setErr(res.error); return }
    setPendingRole(null); setReason('')
  }
  async function confirmSuspend() {
    if (!pendingSuspend) return; setErr(null)
    const res = await onSuspend(pendingSuspend, reason)
    if (!res.ok) { setErr(res.error); return }
    setPendingSuspend(null); setReason('')
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-kinnso-ink">{t.directoryTitle}</h2>
      <div className="overflow-x-auto rounded-xl border border-kinnso-border">
        <table className="min-w-full divide-y divide-kinnso-border text-sm">
          <thead className="bg-kinnso-bg-muted">
            <tr>
              {[t.colName, t.colRole, t.colStatus, t.colJoined, ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-kinnso-muted uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-kinnso-border bg-white">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-medium text-kinnso-ink">{m.displayName}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${roleBadgeClass[m.role] ?? 'bg-gray-100 text-gray-700'}`}>
                    {roleLabel[m.role] ?? m.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-kinnso-muted">{statusLabel[m.status] ?? m.status}</td>
                <td className="px-4 py-3 text-kinnso-muted">{m.joinedAt.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <select
                      aria-label={`${t.actionSetRole} ${m.displayName}`}
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) { setPendingRole({ id: m.id, role: e.target.value }); setReason(''); setErr(null) } }}
                      className="rounded border border-kinnso-border px-2 py-1 text-xs"
                    >
                      <option value="" disabled>{t.actionSetRole}</option>
                      {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
                    </select>
                    {m.status === 'active' ? (
                      <button
                        onClick={() => { setPendingSuspend(m.id); setReason(''); setErr(null) }}
                        className="rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        {t.actionSuspend}
                      </button>
                    ) : (
                      <button
                        onClick={() => onReactivate(m.id, 'Reactivated by owner')}
                        className="rounded px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
                      >
                        {t.actionReactivate}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role-change confirm */}
      {pendingRole && (
        <div className="rounded-xl border border-kinnso-border p-4 space-y-2">
          <p className="text-sm font-semibold">{t.actionSetRole}: {roleLabel[pendingRole.role]}</p>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.reasonPlaceholder}
            className="w-full rounded border border-kinnso-border px-3 py-2 text-sm" />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button onClick={confirmRoleChange}
              className="rounded bg-kinnso-orange px-3 py-1.5 text-xs font-bold text-white">{t.actionConfirm}</button>
            <button onClick={() => { setPendingRole(null); setErr(null) }}
              className="rounded border px-3 py-1.5 text-xs">{t.actionCancel}</button>
          </div>
        </div>
      )}

      {/* Suspend confirm */}
      {pendingSuspend && (
        <div className="rounded-xl border border-kinnso-border p-4 space-y-2">
          <p className="text-sm font-semibold">{t.actionSuspend}</p>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.reasonPlaceholder}
            className="w-full rounded border border-kinnso-border px-3 py-2 text-sm" />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button onClick={confirmSuspend}
              className="rounded bg-red-600 px-3 py-1.5 text-xs font-bold text-white">{t.actionConfirm}</button>
            <button onClick={() => { setPendingSuspend(null); setErr(null) }}
              className="rounded border px-3 py-1.5 text-xs">{t.actionCancel}</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update `app/[locale]/admin/team/page.tsx` to pass `onInvite`**

```tsx
// (replace the return line, keep all imports identical to 12A)
import { inviteMemberAction } from '@/lib/admin/team-actions'

// ...inside the page function, after getting overview:
const onInvite = inviteMemberAction.bind(null, loc)
return <TeamOverviewView t={messages.team} locale={loc} overview={overview} onInvite={onInvite} />
```

- [ ] **Step 4: Update `app/[locale]/admin/team/directory/page.tsx` to pass action props**

```tsx
import { setMemberRoleAction, suspendMemberAction, reactivateMemberAction } from '@/lib/admin/team-actions'

// ...inside the page function:
const onSetRole    = setMemberRoleAction.bind(null, loc)
const onSuspend    = suspendMemberAction.bind(null, loc)
const onReactivate = reactivateMemberAction.bind(null, loc)
return <TeamDirectoryView t={messages.team} members={members} onSetRole={onSetRole} onSuspend={onSuspend} onReactivate={onReactivate} />
```

- [ ] **Step 5: Update component tests for new prop signature**

In `kinnso.TeamOverviewView.test.tsx`, add an `onInvite` mock to the render calls:
```tsx
const onInvite = vi.fn(async () => ({ ok: true as const, token: 'tok' }))
render(<TeamOverviewView t={en.team} locale="en" overview={overview} onInvite={onInvite} />)
```

Add a test for the invite panel:
```tsx
it('renders the invite panel with email input and generate button', () => {
  render(<TeamOverviewView t={en.team} locale="en" overview={overview} onInvite={onInvite} />)
  expect(screen.getByPlaceholderText(en.team.inviteEmailLabel)).toBeTruthy()
  expect(screen.getByRole('button', { name: en.team.inviteGenerate })).toBeTruthy()
})
```

In `kinnso.TeamDirectoryView.test.tsx`, add action mocks to the render calls:
```tsx
const onSetRole    = vi.fn(async () => ({ ok: true as const }))
const onSuspend    = vi.fn(async () => ({ ok: true as const }))
const onReactivate = vi.fn(async () => ({ ok: true as const }))
render(<TeamDirectoryView t={en.team} members={members} onSetRole={onSetRole} onSuspend={onSuspend} onReactivate={onReactivate} />)
```

Also update `admin.team.host.test.tsx` to mock `team-actions` and pass action props (mock `inviteMemberAction`, `setMemberRoleAction`, `suspendMemberAction`, `reactivateMemberAction`):
```tsx
vi.mock('@/lib/admin/team-actions', () => ({
  inviteMemberAction:    vi.fn(),
  setMemberRoleAction:   vi.fn(),
  suspendMemberAction:   vi.fn(),
  reactivateMemberAction: vi.fn(),
}))
```

- [ ] **Step 6: Run all team tests**

```bash
pnpm --filter web test -- team admin.ops-accept --run
```
Expected: PASS.

---

## Task 8: Full suite, commit, open PR

- [ ] **Step 1: Run full test suite**

```bash
pnpm --filter web test --run
```
Expected: all suites pass.

- [ ] **Step 2: Typecheck and lint**

```bash
pnpm --filter web typecheck && pnpm --filter web lint
```
Expected: 0 errors.

- [ ] **Step 3: Adversarial review (3 lenses)**

**Security:**
- `admin_accept_ops_invite` checks `auth.uid() is not null` before anything else. ✓
- Email comparison uses `lower(trim(...))` on both sides — case-insensitive. ✓
- Last-owner guard is enforced inside the RPC, not just client-side. ✓
- Self-suspend and self-role-change guards are in the RPCs. ✓
- Accept-invite page does NOT call `requireOpsPage` (correct — it's a public page). ✓
- The redirect `next` URL includes the full invite URL so the flow is preserved after sign-in. ✓

**Data mapping:**
- `inviteMemberAction` returns `{ ok: true, token: data as string }` — verify the RPC returns a text (the token), not jsonb. ✓ (RPC returns `text`).
- `getTeamOverview` uses `.eq('status', 'pending')` — correct field for pending invites. ✓

**i18n:**
- Run parity test. ✓

- [ ] **Step 4: Fix any findings and commit**

```bash
git add -A
git commit -m "feat(web): Phase 12B — invite panel + lifecycle actions + accept-invite page"
```

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin feat/team-roles-12b
gh pr create \
  --title "Phase 12B — Ops invite flow + lifecycle RPCs" \
  --body "$(cat <<'EOF'
## Summary
- \`kinnso_ops_invites\` table + RLS; \`is_active_ops_role(p_min)\` rank-check helper
- Lifecycle RPCs: \`admin_invite_ops_member\`, \`admin_revoke_ops_invite\`, \`admin_accept_ops_invite\`, \`admin_set_ops_member_role\`, \`admin_suspend_ops_member\`, \`admin_reactivate_ops_member\` — all SECURITY DEFINER, is_active_ops_role('owner')-gated, reason-required, audited
- Self-protection guards: can't change own role, can't suspend self, last-active-owner guard — all enforced in DB
- Invite panel in Team Overview; role-change/suspend/reactivate actions in Directory
- Public accept-invite page at \`/[locale]/ops/accept-invite?token=...\`; email-match check; sign-in redirect preserves return URL
- i18n: invite + action + accept-invite strings × 7 locales; parity green

## Test plan
- [ ] \`pnpm --filter web test --run\` — all suites green
- [ ] \`pnpm --filter web typecheck\` — 0 errors
- [ ] Invite a member from the Team Overview page — invite link generated and copied
- [ ] Open the accept-invite link as a different signed-in user — ops access granted
- [ ] Open the accept-invite link as a non-signed-in user — redirected to sign-in; after sign-in, redirect back
- [ ] Use an expired/revoked token — correct error message shown

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
