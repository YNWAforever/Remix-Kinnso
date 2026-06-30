# Phase 12A — Ops Member Role: Schema + Read UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `role` column to `kinnso_ops_members`, backfill all existing active members as `owner`, and build the read-only Team Overview and Directory pages — with no changes to the existing `is_active_ops()` enforcement.

**Architecture:** A new SECURITY DEFINER RPC `admin_list_ops_members()` returns all member rows as jsonb (consistent with every other admin query in this codebase). Two new Next.js pages consume a new `team-queries.ts` module. A new `Team` nav item is appended to AdminShell. The `team` i18n group is added across all 7 locales. No enforcement changes — the existing flat `is_active_ops()` gate is unchanged.

**Tech Stack:** Supabase SECURITY DEFINER SQL, Next.js 16 App Router (async Server Components), TypeScript, Tailwind v4, Vitest 4 (jsdom for components), `@testing-library/react`.

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/20260701150000_ops_member_role.sql` | CREATE |
| `packages/db/types.ts` | MODIFY (hand-patch: add `role` to `kinnso_ops_members`, add `admin_list_ops_members` RPC) |
| `apps/web/lib/admin/team-queries.ts` | CREATE |
| `apps/web/components/kinnso/admin/team/TeamOverviewView.tsx` | CREATE |
| `apps/web/components/kinnso/admin/team/TeamDirectoryView.tsx` | CREATE |
| `apps/web/app/[locale]/admin/team/page.tsx` | CREATE |
| `apps/web/app/[locale]/admin/team/directory/page.tsx` | CREATE |
| `apps/web/components/kinnso/admin/AdminShell.tsx` | MODIFY (add Team nav item) |
| `apps/web/lib/i18n/messages/en.ts` | MODIFY (add `navTeam` to `admin` group, add `team` group) |
| `apps/web/lib/i18n/messages/zh-hk.ts` | MODIFY (same) |
| `apps/web/lib/i18n/messages/zh-tw.ts` | MODIFY (same) |
| `apps/web/lib/i18n/messages/zh-cn.ts` | MODIFY (same) |
| `apps/web/lib/i18n/messages/ja.ts` | MODIFY (same) |
| `apps/web/lib/i18n/messages/ko.ts` | MODIFY (same) |
| `apps/web/lib/i18n/messages/th.ts` | MODIFY (same) |
| `apps/web/tests/admin.team-queries.test.ts` | CREATE |
| `apps/web/tests/kinnso.TeamOverviewView.test.tsx` | CREATE |
| `apps/web/tests/kinnso.TeamDirectoryView.test.tsx` | CREATE |
| `apps/web/tests/admin.team.host.test.tsx` | CREATE |

---

## Task 1: Migration — `role` column + `admin_list_ops_members` RPC

**Files:**
- Create: `supabase/migrations/20260701150000_ops_member_role.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 12A — Add role column to kinnso_ops_members and a SECURITY DEFINER read helper.
-- Backfills all existing active members as 'owner' so the team is not left without an owner.
-- is_active_ops() remains the page/action gate throughout 12A; role enforcement is 12C.

alter table public.kinnso_ops_members
  add column role text not null default 'analyst'
  check (role in ('owner', 'admin', 'moderator', 'analyst'));

-- Every existing active member becomes an owner; suspended/inactive members get the default 'analyst'.
update public.kinnso_ops_members set role = 'owner' where status = 'active';

-- Read helper: returns all ops members as a jsonb array.
-- Used by the Team Overview and Directory. Returns [] when the table is empty.
create or replace function public.admin_list_ops_members()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id',           m.id,
        'display_name', m.display_name,
        'user_id',      m.user_id,
        'role',         m.role,
        'status',       m.status,
        'joined_at',    m.created_at)
      order by m.created_at asc)
    from public.kinnso_ops_members m
  ), '[]'::jsonb);
end $$;

revoke all on function public.admin_list_ops_members() from public, anon;
grant execute on function public.admin_list_ops_members() to authenticated;
```

- [ ] **Step 2: Apply migration to the live Supabase project via MCP**

Use the Supabase MCP tool `apply_migration` with:
- `project_id`: `scryfkefedzuetfdtrvl`
- `name`: `ops_member_role`
- `query`: (paste the SQL above)

- [ ] **Step 3: Verify via MCP `execute_sql`**

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'kinnso_ops_members' and column_name = 'role';
```
Expected: one row with `data_type = 'text'`, `column_default = 'analyst'`.

```sql
select proname from pg_proc where proname = 'admin_list_ops_members';
```
Expected: one row.

---

## Task 2: Hand-patch `packages/db/types.ts`

**Files:**
- Modify: `packages/db/types.ts`

- [ ] **Step 1: Add `role` to `kinnso_ops_members` Row/Insert/Update**

Find the `kinnso_ops_members` block (around line 899) and add `role: string` to Row, `role?: string` to Insert, `role?: string` to Update:

```ts
      kinnso_ops_members: {
        Row: {
          created_at: string
          display_name: string
          id: string
          role: string          // ← add
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          role?: string         // ← add
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          role?: string         // ← add
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
```

- [ ] **Step 2: Add `admin_list_ops_members` to the Functions section**

Find the Functions block (where `admin_merchant_detail` etc. live, around line 1620) and add:

```ts
      admin_list_ops_members: {
        Args: Record<string, never>
        Returns: Json
      }
```

- [ ] **Step 3: Run typecheck to verify no regressions**

```bash
pnpm --filter web typecheck
```
Expected: 0 errors.

---

## Task 3: TDD — `team-queries.ts`

**Files:**
- Create: `apps/web/tests/admin.team-queries.test.ts`
- Create: `apps/web/lib/admin/team-queries.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/tests/admin.team-queries.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

type RpcResult = { data: unknown; error: { message: string } | null }
const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (): Promise<RpcResult> => ({ data: null, error: null })),
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))

import { getTeamMembers, getTeamOverview } from '@/lib/admin/team-queries'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

const supabase = { rpc: rpcMock } as unknown as SupabaseClient<Database>

const RAW = [
  { id: 'm1', display_name: 'Alice', user_id: 'u1', role: 'owner',     status: 'active',    joined_at: '2026-01-01T00:00:00Z' },
  { id: 'm2', display_name: 'Bob',   user_id: 'u2', role: 'moderator', status: 'active',    joined_at: '2026-02-01T00:00:00Z' },
  { id: 'm3', display_name: 'Carol', user_id: 'u3', role: 'analyst',   status: 'suspended', joined_at: '2026-03-01T00:00:00Z' },
]

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: RAW, error: null })
})

describe('getTeamMembers', () => {
  it('calls admin_list_ops_members and maps the payload', async () => {
    const rows = await getTeamMembers(supabase)
    expect(rpcMock).toHaveBeenCalledWith('admin_list_ops_members')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ id: 'm1', displayName: 'Alice', userId: 'u1', role: 'owner', status: 'active', joinedAt: '2026-01-01T00:00:00Z' })
  })
  it('returns [] when the RPC returns an empty array', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null })
    expect(await getTeamMembers(supabase)).toHaveLength(0)
  })
  it('throws when the RPC returns an error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    await expect(getTeamMembers(supabase)).rejects.toMatchObject({ message: 'forbidden' })
  })
})

describe('getTeamOverview', () => {
  it('aggregates byRole counts from the member list', async () => {
    const overview = await getTeamOverview(supabase)
    expect(overview.members).toHaveLength(3)
    expect(overview.byRole).toEqual({ owner: 1, moderator: 1, analyst: 1, admin: 0 })
    expect(overview.pendingInvites).toBe(0) // always 0 in 12A
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter web test -- admin.team-queries --run
```
Expected: FAIL — "Cannot find module '@/lib/admin/team-queries'"

- [ ] **Step 3: Implement `team-queries.ts`**

```ts
// apps/web/lib/admin/team-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface MemberRow {
  id: string
  displayName: string
  userId: string
  role: string
  status: string
  joinedAt: string
}

export interface TeamOverview {
  members: MemberRow[]
  byRole: Record<string, number>
  pendingInvites: number
}

type RawMember = { id: string; display_name: string; user_id: string; role: string; status: string; joined_at: string }

/** All ops members via SECURITY DEFINER admin_list_ops_members (is_active_ops()-gated). */
export async function getTeamMembers(supabase: Client): Promise<MemberRow[]> {
  const { data, error } = await supabase.rpc('admin_list_ops_members')
  if (error) throw error
  return ((data ?? []) as unknown as RawMember[]).map((m) => ({
    id: m.id,
    displayName: m.display_name,
    userId: m.user_id,
    role: m.role,
    status: m.status,
    joinedAt: m.joined_at,
  }))
}

/**
 * Team overview: full member list + by-role counts.
 * pendingInvites is 0 in 12A (kinnso_ops_invites table added in 12B).
 */
export async function getTeamOverview(supabase: Client): Promise<TeamOverview> {
  const members = await getTeamMembers(supabase)
  const byRole: Record<string, number> = { owner: 0, admin: 0, moderator: 0, analyst: 0 }
  for (const m of members) {
    if (m.role in byRole) byRole[m.role]++
  }
  return { members, byRole, pendingInvites: 0 }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter web test -- admin.team-queries --run
```
Expected: PASS (3 suites, all green).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260701150000_ops_member_role.sql packages/db/types.ts apps/web/lib/admin/team-queries.ts apps/web/tests/admin.team-queries.test.ts
git commit -m "feat(db): Phase 12A — ops member role column + admin_list_ops_members RPC + team-queries"
```

---

## Task 4: i18n — `team` group across all 7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`

- [ ] **Step 1: Add `navTeam` to the `admin` group interface in `en.ts`**

Find the `admin:` interface block (around line 620). The current line reads:
```ts
    navDashboard: string; navPerks: string; navUsers: string; navCreators: string; navMerchants: string
```
Change it to:
```ts
    navDashboard: string; navPerks: string; navUsers: string; navCreators: string; navMerchants: string; navTeam: string
```

- [ ] **Step 2: Add the `team` group interface to `en.ts`**

After the `users` group interface (around line 660), add:
```ts
  team: {
    overviewTitle: string; overviewSubtitle: string
    kpiMembers: string; kpiPending: string
    roleOwner: string; roleAdmin: string; roleModerator: string; roleAnalyst: string
    statusActive: string; statusSuspended: string
    directoryTitle: string
    colName: string; colRole: string; colStatus: string; colJoined: string
  }
```

- [ ] **Step 3: Add `navTeam` value to the `admin` values block in `en.ts`**

Find the `admin:` values block (around line 1534):
```ts
    navDashboard: 'Dashboard', navPerks: 'Perks', navUsers: 'Users', navCreators: 'Creators', navMerchants: 'Merchants',
```
Change to:
```ts
    navDashboard: 'Dashboard', navPerks: 'Perks', navUsers: 'Users', navCreators: 'Creators', navMerchants: 'Merchants', navTeam: 'Team',
```

- [ ] **Step 4: Add the `team` values group to `en.ts`**

Near the end of the file (after the `users` values block, before the closing `}`), add:
```ts
  team: {
    overviewTitle: 'Team', overviewSubtitle: 'Manage ops team members and their roles.',
    kpiMembers: 'Total members', kpiPending: 'Pending invites',
    roleOwner: 'Owner', roleAdmin: 'Admin', roleModerator: 'Moderator', roleAnalyst: 'Analyst',
    statusActive: 'Active', statusSuspended: 'Suspended',
    directoryTitle: 'Member directory',
    colName: 'Name', colRole: 'Role', colStatus: 'Status', colJoined: 'Joined',
  },
```

- [ ] **Step 5: Mirror into `zh-hk.ts`**

Interface additions (same as en.ts steps 1–2).

Values — add `navTeam: '團隊'` to the `admin` nav line, then add:
```ts
  team: {
    overviewTitle: '團隊', overviewSubtitle: '管理運營團隊成員及其角色。',
    kpiMembers: '成員總數', kpiPending: '待處理邀請',
    roleOwner: '擁有者', roleAdmin: '管理員', roleModerator: '協調員', roleAnalyst: '分析師',
    statusActive: '活躍', statusSuspended: '已暫停',
    directoryTitle: '成員目錄',
    colName: '名稱', colRole: '角色', colStatus: '狀態', colJoined: '加入時間',
  },
```

- [ ] **Step 6: Mirror into `zh-tw.ts`**

Same interface additions. Values:
```ts
  team: {
    overviewTitle: '團隊', overviewSubtitle: '管理營運團隊成員及其角色。',
    kpiMembers: '成員總數', kpiPending: '待處理邀請',
    roleOwner: '擁有者', roleAdmin: '管理員', roleModerator: '協調員', roleAnalyst: '分析師',
    statusActive: '活躍', statusSuspended: '已暫停',
    directoryTitle: '成員目錄',
    colName: '名稱', colRole: '角色', colStatus: '狀態', colJoined: '加入時間',
  },
```
Add `navTeam: '團隊'` to the admin nav line.

- [ ] **Step 7: Mirror into `zh-cn.ts`**

Values:
```ts
  team: {
    overviewTitle: '团队', overviewSubtitle: '管理运营团队成员及其角色。',
    kpiMembers: '成员总数', kpiPending: '待处理邀请',
    roleOwner: '所有者', roleAdmin: '管理员', roleModerator: '协调员', roleAnalyst: '分析师',
    statusActive: '活跃', statusSuspended: '已暂停',
    directoryTitle: '成员目录',
    colName: '名称', colRole: '角色', colStatus: '状态', colJoined: '加入时间',
  },
```
Add `navTeam: '团队'`.

- [ ] **Step 8: Mirror into `ja.ts`**

Values:
```ts
  team: {
    overviewTitle: 'チーム', overviewSubtitle: '運営チームメンバーとその役割を管理します。',
    kpiMembers: 'メンバー総数', kpiPending: '保留中の招待',
    roleOwner: 'オーナー', roleAdmin: '管理者', roleModerator: 'モデレーター', roleAnalyst: 'アナリスト',
    statusActive: 'アクティブ', statusSuspended: '停止中',
    directoryTitle: 'メンバーディレクトリ',
    colName: '名前', colRole: '役割', colStatus: 'ステータス', colJoined: '参加日',
  },
```
Add `navTeam: 'チーム'`.

- [ ] **Step 9: Mirror into `ko.ts`**

Values:
```ts
  team: {
    overviewTitle: '팀', overviewSubtitle: '운영 팀원과 역할을 관리합니다.',
    kpiMembers: '총 멤버 수', kpiPending: '대기 중인 초대',
    roleOwner: '소유자', roleAdmin: '관리자', roleModerator: '모더레이터', roleAnalyst: '분석가',
    statusActive: '활성', statusSuspended: '정지됨',
    directoryTitle: '멤버 디렉토리',
    colName: '이름', colRole: '역할', colStatus: '상태', colJoined: '가입일',
  },
```
Add `navTeam: '팀'`.

- [ ] **Step 10: Mirror into `th.ts`**

Values:
```ts
  team: {
    overviewTitle: 'ทีม', overviewSubtitle: 'จัดการสมาชิกทีมปฏิบัติการและบทบาทของพวกเขา',
    kpiMembers: 'สมาชิกทั้งหมด', kpiPending: 'คำเชิญที่รอดำเนินการ',
    roleOwner: 'เจ้าของ', roleAdmin: 'ผู้ดูแลระบบ', roleModerator: 'ผู้ดูแล', roleAnalyst: 'นักวิเคราะห์',
    statusActive: 'ใช้งานอยู่', statusSuspended: 'ถูกระงับ',
    directoryTitle: 'ไดเรกทอรีสมาชิก',
    colName: 'ชื่อ', colRole: 'บทบาท', colStatus: 'สถานะ', colJoined: 'เข้าร่วมเมื่อ',
  },
```
Add `navTeam: 'ทีม'`.

- [ ] **Step 11: Run the i18n parity test**

```bash
pnpm --filter web test -- i18n.locale-parity --run
```
Expected: PASS. If it fails, a key is missing from one locale — add it.

- [ ] **Step 12: Commit i18n**

```bash
git add apps/web/lib/i18n/messages/
git commit -m "i18n(team): add team group + navTeam across 7 locales (Phase 12A)"
```

---

## Task 5: TDD — `TeamOverviewView`

**Files:**
- Create: `apps/web/tests/kinnso.TeamOverviewView.test.tsx`
- Create: `apps/web/components/kinnso/admin/team/TeamOverviewView.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/tests/kinnso.TeamOverviewView.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
afterEach(cleanup)

import { TeamOverviewView } from '@/components/kinnso/admin/team/TeamOverviewView'
import en from '@/lib/i18n/messages/en'

const overview = {
  members: [
    { id: 'm1', displayName: 'Alice', userId: 'u1', role: 'owner',     status: 'active',    joinedAt: '2026-01-01T00:00:00Z' },
    { id: 'm2', displayName: 'Bob',   userId: 'u2', role: 'moderator', status: 'active',    joinedAt: '2026-02-01T00:00:00Z' },
  ],
  byRole: { owner: 1, admin: 0, moderator: 1, analyst: 0 },
  pendingInvites: 0,
}

describe('TeamOverviewView', () => {
  it('renders the overview title', () => {
    render(<TeamOverviewView t={en.team} locale="en" overview={overview} />)
    expect(screen.getByRole('heading', { name: en.team.overviewTitle })).toBeTruthy()
  })
  it('shows total member count', () => {
    render(<TeamOverviewView t={en.team} locale="en" overview={overview} />)
    expect(screen.getByText('2')).toBeTruthy()
  })
  it('links to the team directory', () => {
    render(<TeamOverviewView t={en.team} locale="en" overview={overview} />)
    const links = screen.getAllByRole('link')
    expect(links.some((l) => l.getAttribute('href') === '/en/admin/team/directory')).toBe(true)
  })
  it('shows pending invites count (0 in 12A)', () => {
    render(<TeamOverviewView t={en.team} locale="en" overview={overview} />)
    expect(screen.getByText('0')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter web test -- kinnso.TeamOverviewView --run
```
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Implement `TeamOverviewView.tsx`**

```tsx
// apps/web/components/kinnso/admin/team/TeamOverviewView.tsx
'use client'
import Link from 'next/link'
import { KpiCard } from '@/components/kinnso/admin/KpiCard'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { TeamOverview } from '@/lib/admin/team-queries'

const ROLES = ['owner', 'admin', 'moderator', 'analyst'] as const

export function TeamOverviewView({ t, locale, overview }: {
  t: Messages['team']
  locale: Locale
  overview: TeamOverview
}) {
  const roleLabel: Record<string, string> = {
    owner: t.roleOwner, admin: t.roleAdmin, moderator: t.roleModerator, analyst: t.roleAnalyst,
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-kinnso-ink">{t.overviewTitle}</h1>
        <p className="text-sm text-kinnso-muted">{t.overviewSubtitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard label={t.kpiMembers} value={overview.members.length} />
        <KpiCard label={t.kpiPending} value={overview.pendingInvites} />
        {ROLES.map((role) => (
          <KpiCard key={role} label={roleLabel[role]} value={overview.byRole[role] ?? 0} />
        ))}
      </div>
      <div>
        <Link
          href={`/${locale}/admin/team/directory`}
          className="text-sm font-semibold text-kinnso-orange hover:underline"
        >
          {t.directoryTitle} →
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter web test -- kinnso.TeamOverviewView --run
```
Expected: PASS.

---

## Task 6: TDD — `TeamDirectoryView`

**Files:**
- Create: `apps/web/tests/kinnso.TeamDirectoryView.test.tsx`
- Create: `apps/web/components/kinnso/admin/team/TeamDirectoryView.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/tests/kinnso.TeamDirectoryView.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
afterEach(cleanup)

import { TeamDirectoryView } from '@/components/kinnso/admin/team/TeamDirectoryView'
import en from '@/lib/i18n/messages/en'

const members = [
  { id: 'm1', displayName: 'Alice', userId: 'u1', role: 'owner',     status: 'active',    joinedAt: '2026-01-01T00:00:00Z' },
  { id: 'm2', displayName: 'Bob',   userId: 'u2', role: 'moderator', status: 'suspended', joinedAt: '2026-02-01T00:00:00Z' },
]

describe('TeamDirectoryView', () => {
  it('renders column headers', () => {
    render(<TeamDirectoryView t={en.team} members={members} />)
    expect(screen.getByText(en.team.colName)).toBeTruthy()
    expect(screen.getByText(en.team.colRole)).toBeTruthy()
    expect(screen.getByText(en.team.colStatus)).toBeTruthy()
  })
  it('renders each member display name', () => {
    render(<TeamDirectoryView t={en.team} members={members} />)
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })
  it('renders role labels', () => {
    render(<TeamDirectoryView t={en.team} members={members} />)
    expect(screen.getByText(en.team.roleOwner)).toBeTruthy()
    expect(screen.getByText(en.team.roleModerator)).toBeTruthy()
  })
  it('renders status labels', () => {
    render(<TeamDirectoryView t={en.team} members={members} />)
    expect(screen.getByText(en.team.statusActive)).toBeTruthy()
    expect(screen.getByText(en.team.statusSuspended)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter web test -- kinnso.TeamDirectoryView --run
```
Expected: FAIL.

- [ ] **Step 3: Implement `TeamDirectoryView.tsx`**

```tsx
// apps/web/components/kinnso/admin/team/TeamDirectoryView.tsx
'use client'
import type { Messages } from '@/lib/i18n/messages/en'
import type { MemberRow } from '@/lib/admin/team-queries'

export function TeamDirectoryView({ t, members }: {
  t: Messages['team']
  members: MemberRow[]
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
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-kinnso-ink">{t.directoryTitle}</h2>
      <div className="overflow-x-auto rounded-xl border border-kinnso-border">
        <table className="min-w-full divide-y divide-kinnso-border text-sm">
          <thead className="bg-kinnso-bg-muted">
            <tr>
              {[t.colName, t.colRole, t.colStatus, t.colJoined].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-kinnso-muted uppercase tracking-wide">{h}</th>
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
                <td className="px-4 py-3 text-kinnso-muted">
                  {statusLabel[m.status] ?? m.status}
                </td>
                <td className="px-4 py-3 text-kinnso-muted">
                  {m.joinedAt.slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter web test -- kinnso.TeamDirectoryView --run
```
Expected: PASS.

---

## Task 7: TDD — Team pages (host tests)

**Files:**
- Create: `apps/web/tests/admin.team.host.test.tsx`
- Create: `apps/web/app/[locale]/admin/team/page.tsx`
- Create: `apps/web/app/[locale]/admin/team/directory/page.tsx`

- [ ] **Step 1: Write the failing host tests**

```tsx
// apps/web/tests/admin.team.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
afterEach(cleanup)

const { roleMock, getUserMock, listMock } = vi.hoisted(() => ({
  roleMock:    vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  listMock:    vi.fn(async () => ([
    { id: 'm1', displayName: 'Alice', userId: 'u1', role: 'owner', status: 'active', joinedAt: '2026-01-01T00:00:00Z' },
  ])),
}))
vi.mock('next/navigation', () => ({
  notFound:     () => { throw new Error('NEXT_NOT_FOUND') },
  redirect:     (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
  useRouter:    () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname:  () => '/en/admin/team',
}))
vi.mock('@/lib/auth/viewer-role',  () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/admin/team-queries', () => ({
  getTeamMembers:  listMock,
  getTeamOverview: vi.fn(async () => ({ members: [{ id: 'm1', displayName: 'Alice', userId: 'u1', role: 'owner', status: 'active', joinedAt: '2026-01-01T00:00:00Z' }], byRole: { owner: 1, admin: 0, moderator: 0, analyst: 0 }, pendingInvites: 0 })),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}))

import TeamPage      from '@/app/[locale]/admin/team/page'
import DirectoryPage from '@/app/[locale]/admin/team/directory/page'

beforeEach(() => {
  roleMock.mockResolvedValue('ops')
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('Team Overview page', () => {
  it('renders heading for ops user', async () => {
    const ui = await TeamPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { name: 'Team' })).toBeTruthy()
  })
  it('redirects anon', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(TeamPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('notFounds non-ops', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(TeamPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('notFounds bad locale', async () => {
    await expect(TeamPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('Team Directory page', () => {
  it('renders Alice in the directory', async () => {
    const ui = await DirectoryPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Alice')).toBeTruthy()
  })
  it('redirects anon', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(DirectoryPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter web test -- admin.team.host --run
```
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Implement `app/[locale]/admin/team/page.tsx`**

```tsx
// apps/web/app/[locale]/admin/team/page.tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getTeamOverview } from '@/lib/admin/team-queries'
import { TeamOverviewView } from '@/components/kinnso/admin/team/TeamOverviewView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function TeamOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const overview = await getTeamOverview(supabase)
  return <TeamOverviewView t={messages.team} locale={loc} overview={overview} />
}
```

- [ ] **Step 4: Implement `app/[locale]/admin/team/directory/page.tsx`**

```tsx
// apps/web/app/[locale]/admin/team/directory/page.tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getTeamMembers } from '@/lib/admin/team-queries'
import { TeamDirectoryView } from '@/components/kinnso/admin/team/TeamDirectoryView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function TeamDirectoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const members = await getTeamMembers(supabase)
  return <TeamDirectoryView t={messages.team} members={members} />
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm --filter web test -- admin.team.host --run
```
Expected: PASS.

---

## Task 8: AdminShell — add Team nav item

**Files:**
- Modify: `apps/web/components/kinnso/admin/AdminShell.tsx`

- [ ] **Step 1: Add the Team nav entry**

Find the `nav` array in `AdminShell.tsx`. The current array ends with:
```ts
    { href: `/${locale}/admin/users`, label: t.navUsers },
```
Add after it:
```ts
    { href: `/${locale}/admin/team`, label: t.navTeam },
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm --filter web typecheck
```
Expected: 0 errors.

---

## Task 9: Full test suite + commit

- [ ] **Step 1: Run all web tests**

```bash
pnpm --filter web test --run
```
Expected: all suites pass including the new team suites and the existing i18n parity test.

- [ ] **Step 2: Run lint**

```bash
pnpm --filter web lint
```
Expected: 0 errors.

- [ ] **Step 3: Commit all remaining changes**

```bash
git add \
  apps/web/components/kinnso/admin/AdminShell.tsx \
  apps/web/components/kinnso/admin/team/ \
  apps/web/app/\[locale\]/admin/team/ \
  apps/web/tests/kinnso.TeamOverviewView.test.tsx \
  apps/web/tests/kinnso.TeamDirectoryView.test.tsx \
  apps/web/tests/admin.team.host.test.tsx
git commit -m "feat(web): Phase 12A — Team Overview + Directory read UI"
```

---

## Task 10: Adversarial review (3 lenses)

Run a 3-lens review of the 12A delta before opening the PR. Check each lens, fix issues inline, then commit fixes.

**Lens 1 — Security:**
- `admin_list_ops_members()` raises `forbidden` (SQLSTATE 42501) when `is_active_ops()` is false — verify this is the first thing the function does. ✓
- `revoke all ... from public, anon` is present — verify. ✓
- The app layer calls `requireOpsPage` before calling `getTeamOverview`/`getTeamMembers` — verify both page files. ✓

**Lens 2 — Data mapping:**
- `getTeamMembers` maps `display_name` → `displayName`, `joined_at` → `joinedAt`. Verify the RPC returns these exact keys.
- `byRole` initialises all four role keys to 0 before the loop — verify no key goes missing if no member has that role.

**Lens 3 — i18n:**
- Run `pnpm --filter web test -- i18n.locale-parity --run` and confirm PASS.
- Confirm `navTeam` is in all 7 `admin` nav lines.

- [ ] **Fix any findings and commit:**

```bash
git add -A
git commit -m "fix(web): Phase 12A adversarial review fixes"
```
(Skip this commit if no fixes are needed.)

---

## Task 11: Open PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/team-roles-12a
```

- [ ] **Step 2: Open PR**

```bash
gh pr create \
  --title "Phase 12A — Ops Member Role: schema + Team read UI" \
  --body "$(cat <<'EOF'
## Summary
- Adds \`role\` column to \`kinnso_ops_members\` (owner/admin/moderator/analyst); backfills all existing active members as \`owner\`
- New SECURITY DEFINER RPC \`admin_list_ops_members()\` (is_active_ops()-gated, anon/public revoked)
- Team Overview + Directory read pages at \`/[locale]/admin/team\` and \`.../directory\`
- Team nav item in AdminShell; \`team\` i18n group × 7 locales; parity test green
- No enforcement changes — flat \`is_active_ops()\` gate unchanged until 12C

## Test plan
- [ ] \`pnpm --filter web test --run\` — all suites green
- [ ] \`pnpm --filter web typecheck\` — 0 errors
- [ ] \`pnpm --filter web lint\` — 0 errors
- [ ] Navigate to \`/en/admin/team\` in the browser — Team heading renders, member KPI cards show correct counts, Directory link works
- [ ] Navigate to \`/en/admin/team/directory\` — member table renders with role badges and status

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
