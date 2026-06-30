# Phase 12 — Team & Roles (Operator Console)

**Date:** 2026-06-30  
**Status:** Approved  
**Branch convention:** `feat/team-roles-12a`, `feat/team-roles-12b`, `feat/team-roles-12c`

---

## 1. Overview

Phase 12 introduces full RBAC into the Operator Console. Currently all ops members share a flat binary role (`is_active_ops()`). This phase adds a four-level role hierarchy, an invite-and-accept membership flow, self-protection guards, and threads role enforcement into every existing audited RPC.

Work is split across three additive slices so each can be reviewed, squash-merged, and verified independently before the next begins.

---

## 2. Role Taxonomy

| Role | Rank | Purpose |
|---|---|---|
| `owner` | 4 | Full control, team management |
| `admin` | 3 | Money/settlements operations |
| `moderator` | 2 | Creator & merchant moderation |
| `analyst` | 1 | Read-only access |

Rank is used for comparisons (`rank >= p_min`) rather than name equality, so adding roles later requires no existing-RPC edits.

### Permission Matrix

| Domain | Minimum role |
|---|---|
| Team management (invite, revoke, role change, suspend/reactivate member) | `owner` (rank 4) |
| Settlement status writes | `admin` (rank ≥ 3) |
| Creator/merchant lifecycle (status, tier, notes, bulk actions) | `moderator` (rank ≥ 2) |
| All reads (overview, directories, 360s, audit log) | `analyst` (rank ≥ 1 = any active member) |

---

## 3. Phased Delivery

### 12A — Schema + Read UI (no enforcement change)

**Goal:** land the `role` column and the Team read pages without breaking the current flat ops gate.

**DB changes (`supabase/migrations/20260630150000_ops_member_role.sql`):**

```sql
alter table public.kinnso_ops_members
  add column role text not null default 'analyst'
  check (role in ('owner','admin','moderator','analyst'));

-- backfill: every existing active member becomes owner
update public.kinnso_ops_members set role = 'owner' where status = 'active';
```

No existing RPCs are touched. `is_active_ops()` continues to gate everything.

**App changes:**
- `lib/admin/team-queries.ts` — `getTeamOverview()`: active member count by role, invite stats (pending/accepted/expired/revoked).
- `lib/admin/team-queries.ts` — `getTeamDirectory()`: list active+suspended members with id/email/display_name/role/status/joined_at; keyset paginated.
- `components/kinnso/admin/team/TeamOverviewView.tsx` — KPI cards (member count by role, pending invites).
- `components/kinnso/admin/team/TeamDirectoryView.tsx` — sortable table; role badge; role-change + suspend buttons (owner-only, rendered inert in 12A — wired in 12B).
- `app/[locale]/admin/team/page.tsx` — Overview route (requireOpsPage gate unchanged).
- `app/[locale]/admin/team/directory/page.tsx` — Directory route.
- `AdminShell` nav: add `Team` item linking to `/[locale]/admin/team`.
- i18n: new `team` group (Overview, Directory strings) across all 7 locales; parity test updated.

**Tests:** `admin.team-queries.test.ts` (mocked Supabase), `kinnso.TeamOverviewView.test.tsx`, `admin.team.host.test.tsx`, i18n parity.

---

### 12B — Invite Flow + Lifecycle RPCs + De-control

**Goal:** audited RPCs for the full membership lifecycle; wire up the UI actions; de-control the Ops section in `/admin/users`.

**New table (`kinnso_ops_invites`):**

```sql
create table public.kinnso_ops_invites (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  role          text not null check (role in ('owner','admin','moderator','analyst')),
  token         text not null unique default encode(gen_random_bytes(32),'hex'),
  status        text not null default 'pending'
                check (status in ('pending','accepted','revoked','expired')),
  invited_by    uuid not null references public.kinnso_ops_members(id),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '7 days'),
  accepted_at   timestamptz,
  accepted_user_id uuid references auth.users(id)
);
-- RLS: ops members can read; anon can read a single row by token (for accept page)
```

**New RPCs (all SECURITY DEFINER, `search_path=public`, audited via `ops_audit_log_append`):**

| RPC | Gate | Notes |
|---|---|---|
| `admin_invite_ops_member(p_email, p_role)` | `is_active_ops_role('owner')` | Inserts invite row; returns `token` (caller builds the URL) |
| `admin_revoke_ops_invite(p_invite_id)` | `is_active_ops_role('owner')` | Sets status='revoked'; audits |
| `admin_accept_ops_invite(p_token)` | `auth.uid() is not null` | Validates token not expired/used; email must match `auth.email()`; inserts `kinnso_ops_members` row with invite's role; marks invite accepted |
| `admin_set_ops_member_role(p_member_id, p_role)` | `is_active_ops_role('owner')` | Can't change own role; can't demote last active owner; audits |
| `admin_suspend_ops_member(p_member_id)` | `is_active_ops_role('owner')` | Can't suspend self; can't suspend last active owner; audits |
| `admin_reactivate_ops_member(p_member_id)` | `is_active_ops_role('owner')` | Sets status='active'; audits |

All RPCs: `revoke all … from public, anon; grant execute … to authenticated`.

**`is_active_ops_role(p_min text)` helper (SECURITY DEFINER STABLE):**

```sql
create or replace function public.is_active_ops_role(p_min text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_rank int;
  v_role text;
  rank_map constant jsonb := '{"analyst":1,"moderator":2,"admin":3,"owner":4}';
begin
  select role into v_role from public.kinnso_ops_members
    where user_id = auth.uid() and status = 'active';
  if v_role is null then return false; end if;
  v_rank := (rank_map ->> v_role)::int;
  return v_rank >= (rank_map ->> p_min)::int;
end $$;
```

This helper is introduced here (not 12C) so RPCs in this migration can already use it. Existing RPCs still call `is_active_ops()` — that switchover is 12C.

**App changes:**
- `lib/admin/team-actions.ts` — server actions: `inviteMemberAction`, `revokeInviteAction`, `setMemberRoleAction`, `suspendMemberAction`, `reactivateMemberAction` (all call respective RPC; validate reason where required).
- Wire up TeamDirectoryView action props (role-change select + confirm, suspend/reactivate buttons — owner-only, gated client-side + server-side).
- Invite panel in Team Overview: text input for email + role select + "Generate invite link" → copies `/${locale}/ops/accept-invite?token=…` to clipboard.
- `app/[locale]/ops/accept-invite/page.tsx` — public accept route (no requireOpsPage); calls `admin_accept_ops_invite(token)` if signed in, else redirects to sign-in with `?next=` param; shows success/error states.
- De-control `/admin/users` Ops section: remove inline ops-member rows (currently: none surfaced, but guard that `kind='ops'` is silently ignored); add link to Team directory.
- i18n: extend `team` group with invite, lifecycle action strings ×7 locales + parity.

**Tests:** `admin.team-actions.test.ts` (invite lifecycle, last-owner guard, self-role guard, self-suspend guard), `admin.ops-accept-invite.host.test.tsx`, updated directory/overview component tests.

---

### 12C — Thread Role Enforcement Into All Existing RPCs

**Goal:** replace the flat `is_active_ops()` gate with `is_active_ops_role(p_min)` in every audited RPC, enforcing the permission matrix.

**Migration (`20260630170000_ops_role_enforcement.sql`):**
`create or replace` every existing SECURITY DEFINER RPC, replacing the `is_active_ops()` check with `is_active_ops_role('...')` per the matrix:

| RPC | Old gate | New gate |
|---|---|---|
| `admin_creator_analytics`, `admin_merchant_analytics` | `is_active_ops()` | `is_active_ops_role('analyst')` |
| `admin_creator_detail`, `admin_merchant_detail` | `is_active_ops()` | `is_active_ops_role('analyst')` |
| `admin_search_creators`, `admin_search_merchants` | `is_active_ops()` | `is_active_ops_role('analyst')` |
| `admin_set_creator_status`, `admin_reinstate_creator`, `admin_set_creator_verified`, `admin_add_creator_note`, `admin_bulk_set_creator_status` | `is_active_ops()` | `is_active_ops_role('moderator')` |
| `admin_set_merchant_status`, `admin_set_merchant_tier`, `admin_add_merchant_note`, `admin_bulk_set_merchant_status` | `is_active_ops()` | `is_active_ops_role('moderator')` |
| `admin_set_settlement_status` | `is_active_ops()` | `is_active_ops_role('admin')` |

`is_active_ops()` is NOT dropped — it is still the gate used by `requireOpsPage` / `requireOpsAction` in the app layer (binary active-member check), which remains correct for page access. Only the per-RPC permission level is upgraded.

**App changes:** none to source code. The enforcement is entirely in the DB layer. Unit tests updated to pass a seeded member with the correct minimum role (or assert rejection for under-privileged members).

**Tests:** update all RPC unit tests to seed role-appropriate members; add negative tests (analyst calling a moderator RPC gets `forbidden`).

---

## 4. Self-Protection Guards (12B+)

All enforced inside RPCs, not just client-side:

- **Can't change own role** — `admin_set_ops_member_role`: if `p_member_id` is the caller's own member row, raise `forbidden`.
- **Can't suspend self** — `admin_suspend_ops_member`: same guard.
- **Last-active-owner guard** — `admin_suspend_ops_member` and `admin_set_ops_member_role` (demote from owner): if the target is the last active member with `role='owner'`, raise `forbidden`.

---

## 5. Invite + Accept Flow

1. Owner opens Team Overview → Invite panel → enters email + chooses role → clicks "Generate invite link".
2. App calls `admin_invite_ops_member(email, role)` → returns token.
3. URL `/${locale}/ops/accept-invite?token=<token>` copied to clipboard. Owner sends manually (Slack, email, etc.).
4. Invitee opens URL. If not signed in → redirect to `/${locale}/sign-in?next=...`. If signed in → page calls `admin_accept_ops_invite(token)`.
5. RPC validates: token exists, status='pending', not expired, `auth.email() = invite.email`. Inserts `kinnso_ops_members` row with `role` from invite. Marks invite `accepted`. Returns success.
6. Page shows success banner. Invitee now has ops access at the invited role.

Token expiry: 7 days. Expired invites are not auto-cleaned; `admin_accept_ops_invite` checks `expires_at > now()` and raises a user-friendly error if stale.

---

## 6. i18n

New `team` group added to all 7 locale files (`en`, `zh-hk`, `zh-tw`, `zh-cn`, `ja`, `ko`, `th`) and the `en.ts` `Messages` interface. Keys include: overview stats, directory column headers, role labels, invite form, action confirmations, accept-invite page states (loading/success/error/expired/email-mismatch). Parity enforced by `tests/i18n.locale-parity.test.ts`.

---

## 7. Testing Strategy

### Per-slice adversarial review (3 lenses)
- **Security:** RPC gate bypass (no token/wrong user/expired); last-owner guard; self-protection; invite email-mismatch attack.
- **Data mapping:** role rank arithmetic; invite expiry edge; audit log entity_type; pagination keyset.
- **i18n:** all 7 locales have every `team` key; parity test green.

### Unit suites
- `tests/admin.team-queries.test.ts` — mocked Supabase; overview + directory shape.
- `tests/admin.team-actions.test.ts` — TDD: invite lifecycle (happy path, expired, email-mismatch, revoked), last-owner guard, self-role guard, self-suspend guard.
- `tests/admin.ops-accept-invite.host.test.tsx` — signed-in / not-signed-in / expired / email-mismatch states.
- `tests/kinnso.TeamOverviewView.test.tsx` — invite panel renders; link copied state.
- `tests/kinnso.TeamDirectoryView.test.tsx` — role badges; owner-gated actions; non-owner sees disabled controls.
- `tests/admin.team.host.test.tsx` — page renders with mocked queries; nav item present.
- 12C updates all existing RPC tests with role-seeded mocks.

---

## 8. Files Changed Summary

### 12A
- `supabase/migrations/20260630150000_ops_member_role.sql`
- `packages/db/types.ts` (hand-patch: `kinnso_ops_members` + `role` field)
- `apps/web/lib/admin/team-queries.ts` (new)
- `apps/web/components/kinnso/admin/team/TeamOverviewView.tsx` (new)
- `apps/web/components/kinnso/admin/team/TeamDirectoryView.tsx` (new)
- `apps/web/app/[locale]/admin/team/page.tsx` (new)
- `apps/web/app/[locale]/admin/team/directory/page.tsx` (new)
- `apps/web/components/kinnso/admin/AdminShell.tsx` (add Team nav)
- `apps/web/lib/i18n/messages/*.ts` ×7 (add `team` group — 12A keys)
- Tests ×4

### 12B
- `supabase/migrations/20260630160000_ops_invites_and_lifecycle.sql`
- `packages/db/types.ts` (hand-patch: new RPCs + `kinnso_ops_invites`)
- `apps/web/lib/admin/team-actions.ts` (new)
- `apps/web/components/kinnso/admin/team/TeamOverviewView.tsx` (add invite panel)
- `apps/web/components/kinnso/admin/team/TeamDirectoryView.tsx` (wire actions)
- `apps/web/app/[locale]/ops/accept-invite/page.tsx` (new)
- `apps/web/lib/i18n/messages/*.ts` ×7 (extend `team` group — 12B keys)
- Tests ×3 new + updates to 12A tests

### 12C
- `supabase/migrations/20260630170000_ops_role_enforcement.sql`
- All existing RPC unit tests (role-seeded mocks, negative role tests)

---

## 9. Out of Scope

- Email delivery of invite links (no email infra; owner copies link manually).
- Granular per-page route gating by role in the Next.js middleware (app-layer `requireOpsPage` remains binary; enforcement is DB-layer via the RPCs).
- Audit log viewer filtering by actor role.
- Soft-delete of ops members (suspend is the only exit; hard-delete out of scope).
