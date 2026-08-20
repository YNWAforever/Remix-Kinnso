# Phase R10.3 — Notifications Backbone + Honest Inbox Implementation Plan

> **Amendment (2026-08-18, before Task 2 started):** this branch is deliberately rooted at
> `main`, which does not yet have `creator_payout_batches` (that table only exists on R10.2's
> still-open PR #111). Task 2 as originally written covers all three source tables in one
> migration, including `creator_payout_batches` — a table that doesn't exist on this branch.
> **Split, per user decision:** Task 2 below now covers ONLY the submission and settlement
> triggers (4 of the 7 event types: `submission.approved/rejected/revision_requested`,
> `settlement.created`) — both tables already exist on `main`, fully buildable and
> live-verifiable today. A new **Task 2b** (inserted after Task 2, before Task 3) covers the
> `payout_batch.created/paid/cancelled` trigger — written and text-tested now, exactly as
> originally specified, but its live verification is explicitly deferred to Task 8 and gated
> on R10.2 (PR #111) merging first. Task 8 itself must check this gate before attempting a
> live `supabase start` that would otherwise fail outright trying to replay a trigger against
> a nonexistent table.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/studio/inbox`'s "coming soon" stub with a real feed of honest,
trigger-only notifications (submission decisions, settlements, and payout batch
create/paid/cancel), plus an unread badge on the Studio quicklinks tile.

**Architecture:** One `notifications` table (RLS: self-select, `read_at`-only self-update,
zero insert grant — every row comes from a `SECURITY DEFINER` trigger, per Adfocate 0022
grammar: `exception when others then null` around every insert so a notification failure can
never roll back the business transaction that triggered it). Three trigger functions cover
seven event types (submission status change covers 3; payout-batch insert/status-change
covers 3; settlement-created covers 1). Two read RPCs (`notifications_mine`,
`notifications_unread_count`) mirror R10.2's `creator_payout_batches_mine` gate exactly.
Copy lives entirely in i18n dictionaries, interpolated client-side from a stored
`notification_type` + `payload` — never pre-rendered text in the database.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · Vitest 4 ·
Supabase (Postgres + Auth + RLS)

**Full design context:** `docs/superpowers/specs/2026-08-17-phase-r10-3-notifications-inbox-design.md`
— read it once before starting; this plan assumes its decisions (fetch-on-load, no realtime;
click-through links per entity type; 7 total trigger events including the agreed
`payout_batch.cancelled` addition beyond the roadmap's original 6).

---

## Context you need before starting

This is R10.3, the final sub-phase of the R10 "Earnings Truth" program. R10.0 (merged),
R10.1 (`creator_payout_batches`/`mission_settlements`, PR #110 open), and R10.2
(`creator_payout_batches`, PR #111 open) already exist in the migration history on this
branch lineage — this phase reads from tables/columns those phases define, but does not
require their PRs to be merged first.

**Schema facts you'll need, already verified against this codebase (don't re-derive):**
- `mission_milestone_submissions(id, mission_participant_id, mission_milestone_id, status,
  submitted_at, reviewed_at, reviewed_by, proof_urls, notes, merchant_feedback, created_at,
  updated_at)`. `status` is a plain `text` column (no DB check constraint), with application-
  level values `'pending', 'submitted', 'revision_requested', 'approved', 'rejected'`
  (`apps/web/lib/missions/types.ts:29`, `submissionStatuses`). Updated via a plain
  `.update({status: ...})` call in `apps/web/lib/missions/actions.ts` — not an RPC.
- `mission_milestones(id, mission_id, title, description, due_at, sort_order, ...)`.
- `mission_participants(id, creator_id, mission_id, status, ...)` — `creator_id` is direct.
- `mission_settlements(id, mission_id, mission_participant_id, amount_currency,
  creator_commission_amount, paid_fee_amount, ...)` — has no `creator_id` column; attribution
  is via `mission_participant_id → mission_participants.creator_id` (same join
  `creator_earnings_summary()` uses, `supabase/migrations/20260815090000_...sql`).
- `creator_payout_batches(id, creator_id, currency, amount, status, target_at, ...)` —
  `creator_id` is direct (Task 1-2 of the R10.2 plan, already shipped on this branch).
- `is_active_ops_role`, `ops_audit_log_append` are NOT used anywhere in this phase —
  notifications are creator-facing only, no ops involvement.

**Do not touch the live database.** This repo is `supabase link`ed to PRODUCTION (project ref
`scryfkefedzuetfdtrvl`). No `supabase db push`, `db reset` against production, `migration
repair`, or Supabase MCP tools. Everything is local-only until the final verification task,
which uses a local Docker Postgres stack exclusively.

**`pnpm --filter @kinnso/db gen` is forbidden** — it reads production
(`supabase gen types typescript --linked`). Hand-add `Functions` entries to
`packages/db/types.ts` instead, following the precedent in R10.0's Task 5/R10.2's Task 6.

**Never edit a shipped migration** — add a new timestamped file.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/20260817090000_r10_3_notifications_table.sql` | `notifications` table, RLS, grants | 1 |
| `supabase/migrations/20260817090100_r10_3_notification_triggers.sql` | 3 trigger functions covering 7 event types | 2 |
| `supabase/migrations/20260817090200_r10_3_notification_reads.sql` | `notifications_mine()`, `notifications_unread_count()` | 3 |
| `apps/web/lib/notifications/queries.ts` | `getNotifications`, `getUnreadNotificationCount` | 4 |
| `apps/web/lib/notifications/actions.ts` | `markNotificationReadAction` | 4 |
| `apps/web/components/kinnso/pages/StudioInboxView.tsx` | Inbox feed component | 5 |
| `apps/web/app/[locale]/studio/inbox/page.tsx` | Replace the stub, wire the view | 5 |
| `apps/web/components/kinnso/StudioQuickLinks.tsx` | Add unread-count badge, flip `live: true` | 6 |
| `apps/web/app/[locale]/studio/page.tsx` | Fetch unread count, thread through to quicklinks | 6 |
| `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` | New `notifications` + `studioHome` keys | 7 |
| `apps/web/tests/*` | One test file per task above, plus a live fault-injection + RLS proof | every task + 8 |

---

### Task 1: `notifications` table

**Files:**
- Create: `supabase/migrations/20260817090000_r10_3_notifications_table.sql`
- Test: `apps/web/tests/db.notifications-table.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_3_notifications_table.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.3 notifications table', () => {
  it('creates the table with every required column', () => {
    expect(sql).toContain('create table public.notifications')
    expect(sql).toContain('creator_id uuid not null references public.creators(id)')
    expect(sql).toContain('notification_type text not null')
    expect(sql).toContain('entity_type text not null')
    expect(sql).toContain('entity_id uuid not null')
    expect(sql).toContain("payload jsonb not null default '{}'::jsonb")
    expect(sql).toContain('read_at timestamptz')
    expect(sql).toContain('created_at timestamptz not null default now()')
  })

  it('caps the payload at 8 KiB', () => {
    expect(sql).toContain('check (pg_column_size(payload) <= 8192)')
  })

  it('indexes the feed query and the unread count separately', () => {
    expect(sql).toContain('create index notifications_creator_created_idx on public.notifications (creator_id, created_at desc)')
    expect(sql).toContain('create index notifications_creator_unread_idx on public.notifications (creator_id) where read_at is null')
  })

  it('enables RLS with exactly self-select and read_at-only self-update', () => {
    expect(sql).toContain('alter table public.notifications enable row level security')
    expect(sql).toContain('create policy notifications_select_own on public.notifications for select using (creator_id = auth.uid())')
    expect(sql).toContain('create policy notifications_update_own on public.notifications for update using (creator_id = auth.uid()) with check (creator_id = auth.uid())')
  })

  it('revokes all table access then grants only select and read_at update to authenticated', () => {
    expect(sql).toContain('revoke all on public.notifications from public, anon, authenticated')
    expect(sql).toContain('grant select on public.notifications to authenticated')
    expect(sql).toContain('grant update (read_at) on public.notifications to authenticated')
  })

  it('grants no insert to any client role', () => {
    expect(sql).not.toContain('grant insert on public.notifications')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.notifications-table.test.ts`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260817090000_r10_3_notifications_table.sql
--
-- R10.3: the notifications table. RLS lets a creator read and mark-read their own rows;
-- nothing else. There is deliberately no insert grant to any client role, and no insert
-- policy either — every row is written by a SECURITY DEFINER trigger function (Task 2),
-- which bypasses RLS as the function owner. This is the same "RLS + zero policies for the
-- write path, RPC/trigger-only" shape every table in this codebase since R10.2's
-- creator_payout_batches uses.
--
-- No copy is ever stored here. KINNSO's i18n is custom across 7 locales with no per-creator
-- locale preference tracked anywhere in this schema — payload carries only the interpolation
-- values a client-side i18n template needs (e.g. {"mission_title": "..."}), never rendered
-- text. The 8 KiB cap (Adfocate 0022's own number) keeps a buggy trigger from ever writing
-- something absurd; every payload this phase's triggers write is well under 200 bytes.

create table public.notifications (
  id                uuid primary key default gen_random_uuid(),
  creator_id        uuid not null references public.creators(id),
  notification_type text not null,
  entity_type       text not null,
  entity_id         uuid not null,
  payload           jsonb not null default '{}'::jsonb,
  read_at           timestamptz,
  created_at        timestamptz not null default now(),
  constraint notifications_payload_size check (pg_column_size(payload) <= 8192)
);

create index notifications_creator_created_idx on public.notifications (creator_id, created_at desc);
create index notifications_creator_unread_idx on public.notifications (creator_id) where read_at is null;

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select using (creator_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update using (creator_id = auth.uid()) with check (creator_id = auth.uid());

-- Supabase's default privileges re-grant broadly to every client role on a new table (see
-- 20260627155000) — name each role explicitly, matching every other money/ledger table in
-- this codebase since R10.2 Task 1.
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.notifications-table.test.ts`
Expected: PASS — count the actual `it()` blocks in Step 1 yourself before writing "Expected:
PASS (N tests)" anywhere in a commit message or report; every migration-test task in the
R10.2 plan that preceded this one had a prose/reality mismatch on this exact number, so don't
propagate another one.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260817090000_r10_3_notifications_table.sql apps/web/tests/db.notifications-table.test.ts
git commit -m "feat(r10.3): add notifications table"
```

---

### Task 2: Three trigger functions, seven event types

**Files:**
- Create: `supabase/migrations/20260817090100_r10_3_notification_triggers.sql`
- Test: `apps/web/tests/db.notification-triggers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_3_notification_triggers.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.3 notification triggers', () => {
  it('applies after the notifications table', () => {
    expect(matches[0] > '20260817090000').toBe(true)
  })

  it('submission trigger fires only on a real status change to one of three terminal states', () => {
    expect(sql).toContain('create or replace function public.notify_submission_status_change()')
    expect(sql).toContain('after update on public.mission_milestone_submissions')
    expect(sql).toContain('if new.status is not distinct from old.status then return new; end if')
    expect(sql).toContain("if new.status not in ('approved', 'rejected', 'revision_requested') then return new; end if")
  })

  it('submission trigger resolves the creator and mission title through the milestone join', () => {
    expect(sql).toContain('join public.mission_milestones ms on ms.id = new.mission_milestone_id')
    expect(sql).toContain('join public.missions m on m.id = ms.mission_id')
    expect(sql).toContain('where p.id = new.mission_participant_id')
  })

  it('settlement trigger fires on insert and resolves the creator through mission_participant_id', () => {
    expect(sql).toContain('create or replace function public.notify_settlement_created()')
    expect(sql).toContain('after insert on public.mission_settlements')
    expect(sql).toContain('where p.id = new.mission_participant_id')
    expect(sql).toContain('if v_creator_id is null then return new; end if')
  })

  it('payout batch trigger covers create, paid, and cancelled from one function', () => {
    expect(sql).toContain('create or replace function public.notify_payout_batch_change()')
    expect(sql).toContain('after insert or update on public.creator_payout_batches')
    expect(sql).toContain("if tg_op = 'insert' then")
    expect(sql).toContain("v_type := 'payout_batch.created'")
    expect(sql).toContain("when 'paid' then 'payout_batch.paid'")
    expect(sql).toContain("when 'cancelled' then 'payout_batch.cancelled'")
  })

  it('every insert into notifications is wrapped so a failure cannot roll back the caller', () => {
    const inserts = sql.split('insert into public.notifications').length - 1
    expect(inserts).toBe(3)
    const guarded = sql.split('exception when others then null').length - 1
    expect(guarded).toBe(3)
  })

  it('revokes execute from every client role on all three trigger functions', () => {
    expect(sql).toContain('revoke all on function public.notify_submission_status_change() from public, anon, authenticated, service_role')
    expect(sql).toContain('revoke all on function public.notify_settlement_created() from public, anon, authenticated, service_role')
    expect(sql).toContain('revoke all on function public.notify_payout_batch_change() from public, anon, authenticated, service_role')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.notification-triggers.test.ts`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260817090100_r10_3_notification_triggers.sql
--
-- R10.3: three trigger functions covering seven notification types. Grouped by SOURCE
-- TABLE, not by notification_type, because that's what a trigger actually attaches to —
-- mission_milestone_submissions has three interesting terminal states, creator_payout_batches
-- has three (create + two status transitions), mission_settlements has exactly one event
-- (insert; settlements are never updated after creation in this schema).
--
-- Every insert into notifications is wrapped in its own begin/exception block, per Adfocate
-- 0022's "NEVER roll back the earn loop": a notification failing to write (bad payload, a
-- future bug in the payload-building expression, whatever) must never fail the submission
-- review, settlement creation, or payout batch mutation that triggered it. The block is
-- scoped to JUST the insert, not the whole function body, so a bug in creator-resolution
-- logic above the insert still surfaces loudly (an unhandled exception aborts that specific
-- trigger invocation normally) rather than being silently swallowed too.

create or replace function public.notify_submission_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_creator_id uuid;
  v_mission_id uuid;
  v_mission_title text;
  v_type text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('approved', 'rejected', 'revision_requested') then return new; end if;

  select p.creator_id, m.id, m.title
    into v_creator_id, v_mission_id, v_mission_title
    from public.mission_participants p
    join public.mission_milestones ms on ms.id = new.mission_milestone_id
    join public.missions m on m.id = ms.mission_id
    where p.id = new.mission_participant_id;

  if v_creator_id is null then return new; end if;

  v_type := case new.status
    when 'approved' then 'submission.approved'
    when 'rejected' then 'submission.rejected'
    else 'submission.revision_requested'
  end;

  begin
    insert into public.notifications (creator_id, notification_type, entity_type, entity_id, payload)
    values (v_creator_id, v_type, 'mission', v_mission_id, jsonb_build_object('mission_title', v_mission_title));
  exception when others then null;
  end;

  return new;
end;
$$;

create trigger notify_submission_status_change_trg
  after update on public.mission_milestone_submissions
  for each row execute function public.notify_submission_status_change();

revoke all on function public.notify_submission_status_change() from public, anon, authenticated, service_role;

create or replace function public.notify_settlement_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_creator_id uuid;
  v_mission_title text;
begin
  select p.creator_id, m.title
    into v_creator_id, v_mission_title
    from public.mission_participants p
    join public.missions m on m.id = new.mission_id
    where p.id = new.mission_participant_id;

  if v_creator_id is null then return new; end if;

  begin
    insert into public.notifications (creator_id, notification_type, entity_type, entity_id, payload)
    values (v_creator_id, 'settlement.created', 'mission_settlement', new.id,
      jsonb_build_object('mission_title', v_mission_title, 'currency', upper(coalesce(new.amount_currency, 'USD'))));
  exception when others then null;
  end;

  return new;
end;
$$;

create trigger notify_settlement_created_trg
  after insert on public.mission_settlements
  for each row execute function public.notify_settlement_created();

revoke all on function public.notify_settlement_created() from public, anon, authenticated, service_role;

create or replace function public.notify_payout_batch_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_type text;
begin
  if tg_op = 'insert' then
    v_type := 'payout_batch.created';
  elsif new.status is distinct from old.status then
    v_type := case new.status
      when 'paid' then 'payout_batch.paid'
      when 'cancelled' then 'payout_batch.cancelled'
      else null
    end;
  else
    return new;
  end if;

  if v_type is null then return new; end if;

  begin
    insert into public.notifications (creator_id, notification_type, entity_type, entity_id, payload)
    values (new.creator_id, v_type, 'payout_batch', new.id,
      jsonb_build_object('currency', new.currency, 'amount', new.amount));
  exception when others then null;
  end;

  return new;
end;
$$;

create trigger notify_payout_batch_change_trg
  after insert or update on public.creator_payout_batches
  for each row execute function public.notify_payout_batch_change();

revoke all on function public.notify_payout_batch_change() from public, anon, authenticated, service_role;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.notification-triggers.test.ts`
Expected: PASS — count the real `it()` blocks yourself.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260817090100_r10_3_notification_triggers.sql apps/web/tests/db.notification-triggers.test.ts
git commit -m "feat(r10.3): add the three notification trigger functions covering seven event types"
```

**Before moving on:** re-read this task's own migration text once against the actual
`creator_payout_batches` columns shipped in R10.2 (`supabase/migrations/20260816090000_r10_2_payout_batches_and_decisions.sql`)
and the actual `mission_settlements` columns from earlier phases. This plan's SQL was written
from schema facts gathered earlier in this same conversation, not fresh at write-time of this
exact file — if a column name has drifted (unlikely, but verify rather than assume), fix it
here and note why in your task report.

---

### Task 3: Read RPCs

**Files:**
- Create: `supabase/migrations/20260817090200_r10_3_notification_reads.sql`
- Test: `apps/web/tests/db.notification-reads.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_3_notification_reads.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.3 notification read RPCs', () => {
  it('applies after the trigger migration', () => {
    expect(matches[0] > '20260817090100').toBe(true)
  })

  it('notifications_mine gates on the same active-creator check as every R10.0-R10.2 read', () => {
    expect(sql).toContain('create or replace function public.notifications_mine()')
    expect(sql).toContain("if not exists (select 1 from public.creators where id = v_uid and status = 'active') then")
  })

  it('notifications_mine scopes to the caller, orders newest first, and caps at 50', () => {
    expect(sql).toContain('where n.creator_id = v_uid')
    expect(sql).toContain('order by n.created_at desc')
    expect(sql).toContain('limit 50')
  })

  it('notifications_unread_count uses the same gate and the partial unread index', () => {
    expect(sql).toContain('create or replace function public.notifications_unread_count()')
    expect(sql).toContain('where creator_id = v_uid and read_at is null')
  })

  it('both revoke from every client role except a grant to authenticated', () => {
    expect(sql).toContain('revoke all on function public.notifications_mine() from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.notifications_mine() to authenticated')
    expect(sql).toContain('revoke all on function public.notifications_unread_count() from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.notifications_unread_count() to authenticated')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.notification-reads.test.ts`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260817090200_r10_3_notification_reads.sql
--
-- R10.3: the two read paths onto notifications. RLS already lets a creator select their own
-- rows directly (Task 1) — these RPCs exist for the same reason creator_earnings_summary()
-- and creator_payout_batches_mine() do despite direct-select RLS being technically
-- sufficient: a single jsonb-returning call is one round trip with a predictable shape,
-- versus a raw .from('notifications').select(...) the client would otherwise have to
-- reconstruct the ordering/limit/shape of by hand on every call site.
--
-- notifications_mine() caps at 50 rows deliberately, not as a hard architectural
-- commitment — notification volume per creator is bounded by their own activity (mission
-- decisions, settlements, payout batches), not an unbounded append-only ledger like
-- creator_payout_batches. See the design doc's "Read RPC" section for the full reasoning.

create or replace function public.notifications_mine()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.creators where id = v_uid and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',                n.id,
      'notificationType',  n.notification_type,
      'entityType',        n.entity_type,
      'entityId',          n.entity_id,
      'payload',           n.payload,
      'readAt',            n.read_at,
      'createdAt',         n.created_at
    ) order by n.created_at desc)
    from public.notifications n
    where n.creator_id = v_uid
    order by n.created_at desc
    limit 50
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.notifications_mine() from public, anon, authenticated;
grant execute on function public.notifications_mine() to authenticated;

create or replace function public.notifications_unread_count()
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.creators where id = v_uid and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return (select count(*)::integer from public.notifications where creator_id = v_uid and read_at is null);
end;
$$;
revoke all on function public.notifications_unread_count() from public, anon, authenticated;
grant execute on function public.notifications_unread_count() to authenticated;
```

Note the `order by` appears both inside `jsonb_agg(... order by ...)` and as the outer
subquery's own `order by ... limit 50` — the inner one orders the aggregated array, the outer
one determines WHICH 50 rows get aggregated in the first place. Both are required; removing
either changes behavior (dropping the outer one would aggregate an arbitrary 50 rows, not the
50 most recent).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.notification-reads.test.ts`
Expected: PASS — count the real `it()` blocks yourself.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260817090200_r10_3_notification_reads.sql apps/web/tests/db.notification-reads.test.ts
git commit -m "feat(r10.3): add notifications_mine and notifications_unread_count reads"
```

---

### Task 4: TypeScript query/action layer

**Files:**
- Modify: `packages/db/types.ts`
- Create: `apps/web/lib/notifications/queries.ts`
- Create: `apps/web/lib/notifications/actions.ts`
- Test: `apps/web/tests/notifications.queries.test.ts`
- Test: `apps/web/tests/notifications.actions.test.ts`

- [ ] **Step 1: Hand-add two `Functions` entries to `packages/db/types.ts`**

Do not run `pnpm --filter @kinnso/db gen` (reads production). Follow R10.0 Task 5 / R10.2
Task 6's precedent: find the alphabetically-sorted position in the `Database['public']['Functions']`
map and insert:

```typescript
      notifications_mine: { Args: never; Returns: Json }
      notifications_unread_count: { Args: never; Returns: number }
```

`notifications_mine` sorts near `mission_*`/`n*` entries; `notifications_unread_count` sorts
immediately after it alphabetically. Read the file's actual current content to find the exact
neighboring entries — don't guess line numbers, this file has grown substantially across
every prior phase in this program.

- [ ] **Step 2: Write the failing tests**

```typescript
// apps/web/tests/notifications.queries.test.ts
import { describe, expect, it, vi } from 'vitest'
import { getNotifications, getUnreadNotificationCount } from '@/lib/notifications/queries'

function client(raw: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data: raw, error })) }
}

const raw = [
  {
    id: 'n1', notificationType: 'payout_batch.paid', entityType: 'payout_batch', entityId: 'b1',
    payload: { currency: 'HKD', amount: 1500 }, readAt: null, createdAt: '2026-08-17T00:00:00Z',
  },
]

describe('getNotifications', () => {
  it('maps rows through unchanged (RPC already returns camelCase)', async () => {
    const supabase = client(raw)
    const result = await getNotifications(supabase as never)
    expect(result).toEqual(raw)
    expect(supabase.rpc).toHaveBeenCalledWith('notifications_mine')
  })

  it('returns an empty array for null data', async () => {
    const supabase = client(null)
    expect(await getNotifications(supabase as never)).toEqual([])
  })

  it('propagates an RPC error', async () => {
    const supabase = client(null, { message: 'forbidden' })
    await expect(getNotifications(supabase as never)).rejects.toEqual({ message: 'forbidden' })
  })
})

describe('getUnreadNotificationCount', () => {
  it('returns the RPC value directly', async () => {
    const supabase = client(3)
    expect(await getUnreadNotificationCount(supabase as never)).toBe(3)
    expect(supabase.rpc).toHaveBeenCalledWith('notifications_unread_count')
  })

  it('returns 0 for null data', async () => {
    const supabase = client(null)
    expect(await getUnreadNotificationCount(supabase as never)).toBe(0)
  })

  it('propagates an RPC error', async () => {
    const supabase = client(null, { message: 'forbidden' })
    await expect(getUnreadNotificationCount(supabase as never)).rejects.toEqual({ message: 'forbidden' })
  })
})
```

```typescript
// apps/web/tests/notifications.actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

type RpcResult = { data: unknown; error: { message: string } | null }
const { rpcMock, getUserMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (): Promise<RpcResult> => ({ data: null, error: null })),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'c1' } } })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: () => ({ update: () => ({ eq: () => ({ eq: () => rpcMock() }) }) }),
  }),
}))

import { markNotificationReadAction } from '@/lib/notifications/actions'

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null })
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'c1' } } })
})

describe('markNotificationReadAction', () => {
  it('succeeds for a signed-in creator', async () => {
    const res = await markNotificationReadAction('en', 'n1')
    expect(res).toEqual({ ok: true, id: 'n1' })
  })

  it('fails when signed out', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const res = await markNotificationReadAction('en', 'n1')
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/notifications.queries.test.ts tests/notifications.actions.test.ts`
Expected: FAIL — neither source file exists yet.

- [ ] **Step 4: Write `apps/web/lib/notifications/queries.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export type NotificationRow = {
  id: string
  notificationType: string
  entityType: string
  entityId: string
  payload: Record<string, unknown>
  readAt: string | null
  createdAt: string
}

/** The caller's own notifications, newest first, capped at 50. Errors propagate. */
export async function getNotifications(supabase: Client): Promise<NotificationRow[]> {
  const { data, error } = await supabase.rpc('notifications_mine')
  if (error) throw error
  return (data ?? []) as unknown as NotificationRow[]
}

/** The caller's own unread count. Errors propagate. */
export async function getUnreadNotificationCount(supabase: Client): Promise<number> {
  const { data, error } = await supabase.rpc('notifications_unread_count')
  if (error) throw error
  return (data as number | null) ?? 0
}
```

- [ ] **Step 5: Write `apps/web/lib/notifications/actions.ts`**

Read `apps/web/lib/admin/guard.ts` first to confirm `requireCreatorAction`'s exact current
signature (established convention: `{ ok: true, user: { id } } | ActionFailure`) before
using it below — this plan assumes the shape already established in R10.0-R10.2, but verify
rather than guess.

```typescript
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireCreatorAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'

/**
 * Marks one of the caller's own notifications read. Relies on RLS
 * (notifications_update_own + the read_at-only column grant) as the actual authorization
 * boundary -- the .eq('creator_id', ...) here is defense in depth, not the only guard.
 */
export async function markNotificationReadAction(
  locale: Locale, notificationId: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireCreatorAction(supabase)
  if (!gate.ok) return gate

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('creator_id', gate.user.id)

  if (error) {
    console.error('[notifications] markNotificationReadAction failed', error)
    return formError('Could not mark this notification as read')
  }
  revalidatePath(`/${locale}/studio/inbox`)
  return { ok: true, id: notificationId }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/notifications.queries.test.ts tests/notifications.actions.test.ts`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors — this proves the hand-added `types.ts` entries are shaped correctly.

- [ ] **Step 8: Commit**

```bash
git add packages/db/types.ts apps/web/lib/notifications/queries.ts apps/web/lib/notifications/actions.ts apps/web/tests/notifications.queries.test.ts apps/web/tests/notifications.actions.test.ts
git commit -m "feat(r10.3): add notifications query/action TypeScript layer"
```

---

### Task 5: Inbox UI

**Files:**
- Create: `apps/web/components/kinnso/pages/StudioInboxView.tsx`
- Modify: `apps/web/app/[locale]/studio/inbox/page.tsx`
- Test: `apps/web/tests/kinnso.StudioInboxView.test.tsx`
- Test: `apps/web/tests/studio.inbox.host.test.tsx`

**Read first:** `apps/web/components/kinnso/pages/StudioEarningsView.tsx` (R10.2's 4-section
page, for the `Section`/`Rows`/`TicketCard` conventions this page should follow) and the
current `apps/web/app/[locale]/studio/inbox/page.tsx` (currently a `renderComingSoonPage`
stub you're replacing entirely).

The i18n keys referenced below (`t.notifications.*`, `t.studioInbox.*` — exact namespace name
your call, pick one and use it consistently) do NOT exist yet — Task 7 adds them. Apply the
same `PENDING_I18N_FALLBACK` pattern R10.2's Task 7/8 established in their component tests
(merge a fallback object under the real dictionary so tests can exercise the component before
Task 7 lands; real values win automatically once they exist). `pnpm typecheck` will show
errors for these specific missing keys until Task 7 — that's expected, not your bug to fix.

- [ ] **Step 1: Write the failing component test**

```typescript
// apps/web/tests/kinnso.StudioInboxView.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { StudioInboxView } from '@/components/kinnso/pages/StudioInboxView'

afterEach(cleanup)

// Task 7 (not yet landed) adds these keys. See Task 5's own note above for why this
// fallback exists and is safe -- copied verbatim from R10.2's established pattern.
const PENDING_I18N_FALLBACK = {
  heading: 'heading', subtitle: 'subtitle', empty: 'empty',
  'submission.approved': 'submission.approved',
  'submission.rejected': 'submission.rejected',
  'submission.revision_requested': 'submission.revision_requested',
  'settlement.created': 'settlement.created',
  'payout_batch.created': 'payout_batch.created',
  'payout_batch.paid': 'payout_batch.paid',
  'payout_batch.cancelled': 'payout_batch.cancelled',
}
const t = { ...PENDING_I18N_FALLBACK, ...en.notifications }

const notifications = [
  {
    id: 'n1', notificationType: 'payout_batch.paid', entityType: 'payout_batch', entityId: 'b1',
    payload: { currency: 'HKD', amount: 1500 }, readAt: null, createdAt: '2026-08-17T00:00:00Z',
  },
]

describe('StudioInboxView', () => {
  it('renders a notification and links it to the right page', () => {
    render(<StudioInboxView t={t} locale="en" notifications={notifications} markReadAction={vi.fn()} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/en/studio/earnings')
  })

  it('shows the empty state with no notifications', () => {
    render(<StudioInboxView t={t} locale="en" notifications={[]} markReadAction={vi.fn()} />)
    expect(screen.getByText(t.empty)).toBeTruthy()
  })

  it('marks a notification read when clicked', async () => {
    const markReadAction = vi.fn().mockResolvedValue({ ok: true, id: 'n1' })
    render(<StudioInboxView t={t} locale="en" notifications={notifications} markReadAction={markReadAction} />)
    fireEvent.click(screen.getByRole('link'))
    await waitFor(() => expect(markReadAction).toHaveBeenCalledWith('en', 'n1'))
  })

  it('does not call markReadAction again for an already-read notification', () => {
    const markReadAction = vi.fn()
    const read = [{ ...notifications[0], readAt: '2026-08-17T01:00:00Z' }]
    render(<StudioInboxView t={t} locale="en" notifications={read} markReadAction={markReadAction} />)
    fireEvent.click(screen.getByRole('link'))
    expect(markReadAction).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.StudioInboxView.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write `apps/web/components/kinnso/pages/StudioInboxView.tsx`**

```typescript
'use client'
import Link from 'next/link'
import { useTransition } from 'react'
import type { NotificationRow } from '@/lib/notifications/queries'
import type { ActionResult } from '@/lib/admin/result'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'

type T = Messages['notifications']
type MarkReadFn = (locale: Locale, id: string) => Promise<ActionResult<{ id: string }>>

/** Every entity_type this phase's triggers write, mapped to where a click should land.
 *  Settlements and payout batches aren't individually routable -- both render on the
 *  earnings page, so both point there. */
function targetHref(locale: Locale, entityType: string, entityId: string): string {
  if (entityType === 'mission') return `/${locale}/studio/missions/${entityId}`
  return `/${locale}/studio/earnings`
}

function interpolate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(payload[key] ?? ''))
}

function NotificationRowItem({
  t, locale, notification, markReadAction,
}: {
  t: T; locale: Locale; notification: NotificationRow; markReadAction: MarkReadFn
}) {
  const [, startTransition] = useTransition()
  const template = (t as unknown as Record<string, string>)[notification.notificationType] ?? notification.notificationType
  const isUnread = !notification.readAt

  const onClick = () => {
    if (!isUnread) return
    startTransition(() => { void markReadAction(locale, notification.id) })
  }

  return (
    <li className="border-b border-kinnso-line/60 py-3">
      <Link
        href={targetHref(locale, notification.entityType, notification.entityId)}
        onClick={onClick}
        className={`block text-sm ${isUnread ? 'font-bold text-kinnso-ink' : 'text-kinnso-muted'}`}
      >
        {interpolate(template, notification.payload)}
        <span className="ml-2 text-xs text-kinnso-muted">
          {new Date(notification.createdAt).toLocaleDateString(locale)}
        </span>
      </Link>
    </li>
  )
}

export function StudioInboxView({
  t, locale, notifications, markReadAction,
}: {
  t: T; locale: Locale; notifications: NotificationRow[]; markReadAction: MarkReadFn
}) {
  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.heading}</h1>
      <p className="mt-2 text-sm text-kinnso-muted">{t.subtitle}</p>
      {notifications.length === 0 ? (
        <p className="mt-8 text-sm text-kinnso-muted">{t.empty}</p>
      ) : (
        <ul className="mt-6">
          {notifications.map((n) => (
            <NotificationRowItem key={n.id} t={t} locale={locale} notification={n} markReadAction={markReadAction} />
          ))}
        </ul>
      )}
    </main>
  )
}

export default StudioInboxView
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/kinnso.StudioInboxView.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing host test**

Read `apps/web/tests/studio.earnings.host.test.tsx` (R10.2's equivalent) for the exact mock
shape before writing this one — module paths and mock structure should mirror it.

```typescript
// apps/web/tests/studio.inbox.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getNotificationsMock, requireCreatorPageMock } = vi.hoisted(() => ({
  getNotificationsMock: vi.fn(async () => []),
  requireCreatorPageMock: vi.fn(async () => ({ user: { id: 'c1' } })),
}))
vi.mock('@/lib/notifications/queries', () => ({ getNotifications: getNotificationsMock }))
vi.mock('@/lib/admin/guard', () => ({ requireCreatorPage: requireCreatorPageMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({}) }))

import StudioInboxPage from '@/app/[locale]/studio/inbox/page'

beforeEach(() => { getNotificationsMock.mockClear(); requireCreatorPageMock.mockClear() })
afterEach(cleanup)

describe('/[locale]/studio/inbox host', () => {
  it('renders the inbox for an active creator', async () => {
    const ui = await StudioInboxPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(getNotificationsMock).toHaveBeenCalled()
    expect(requireCreatorPageMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/studio.inbox.host.test.tsx`
Expected: FAIL — the page still renders the old stub.

- [ ] **Step 7: Replace `apps/web/app/[locale]/studio/inbox/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireCreatorPage } from '@/lib/admin/guard'
import { getNotifications } from '@/lib/notifications/queries'
import { markNotificationReadAction } from '@/lib/notifications/actions'
import { StudioInboxView } from '@/components/kinnso/pages/StudioInboxView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function StudioInboxPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireCreatorPage(supabase, loc)
  const messages = await getDictionary(loc)
  const notifications = await getNotifications(supabase)

  return (
    <StudioInboxView
      t={messages.notifications}
      locale={loc}
      notifications={notifications}
      markReadAction={markNotificationReadAction}
    />
  )
}
```

Read `apps/web/lib/admin/guard.ts` first to confirm `requireCreatorPage`'s exact current
signature and the `denied` parameter default before using it above — R10.0's Errata already
documents this guard having two denial behaviors (`not-found` default vs `'studio'` redirect)
depending on the page; confirm which this page should use (a not-found default is almost
certainly right here, matching six of the eight studio pages R10.0 gated, but verify rather
than assume).

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/kinnso.StudioInboxView.test.tsx tests/studio.inbox.host.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/kinnso/pages/StudioInboxView.tsx "apps/web/app/[locale]/studio/inbox/page.tsx" apps/web/tests/kinnso.StudioInboxView.test.tsx apps/web/tests/studio.inbox.host.test.tsx
git commit -m "feat(r10.3): replace the /studio/inbox stub with a real notification feed"
```

---

### Task 6: Unread badge on the Studio quicklinks tile

**Files:**
- Modify: `apps/web/components/kinnso/StudioQuickLinks.tsx`
- Modify: `apps/web/app/[locale]/studio/page.tsx`
- Test: `apps/web/tests/kinnso.StudioQuickLinks.test.tsx` (extend if it exists — check first)

**Read first, in this order:**
1. `apps/web/components/kinnso/StudioQuickLinks.tsx` — full current content already known
   from this plan's own design phase (reproduced below in Step 1's context), but re-read to
   confirm nothing has drifted.
2. `apps/web/components/kinnso/pages/StudioDashboardView.tsx` — **not read during planning,
   read this now.** Find where it renders `<StudioQuickLinks .../>` and what props it
   currently passes. You will add one new prop, `unreadNotificationCount: number`, threaded
   from `StudioDashboardView`'s own props down to `StudioQuickLinks`.
3. `apps/web/app/[locale]/studio/page.tsx` — already fully read during planning (reproduced
   in context above). It fetches 7 things via one `Promise.all` with an explicit comment
   about not adding an 8th round trip on this page — add
   `getUnreadNotificationCount(supabase)` as an 8th entry in that SAME `Promise.all` array
   (not a separate `await`), so the existing "no extra round trip" invariant holds.

**Current `StudioQuickLinks.tsx` content, for reference** (verify it still matches before
editing):

```typescript
import Link from 'next/link'
import { ArrowRight, BarChart2, Bot, Gift, Inbox, PenSquare, Sparkles, Tag, Target, Trophy, Video, Wallet } from 'lucide-react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import { RouteStamp, TicketCard } from '@/components/kinnso/MarketPassport'

export function StudioQuickLinks({ locale, t }: { locale: Locale; t: Messages['studioHome'] }) {
  const p = (path: string) => `/${locale}${path}`
  const tools = [
    { href: '/studio/scan', title: t.scanTitle, desc: t.scanDesc, live: true, icon: <Sparkles aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/copilot', title: t.copilotTitle, desc: t.copilotDesc, live: true, icon: <Bot aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/missions', title: t.missionsTitle, desc: t.missionsDesc, live: true, icon: <Target aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/tier', title: t.tierTitle, desc: t.tierDesc, live: true, icon: <Trophy aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/earnings', title: t.earningsTitle, desc: t.earningsDesc, live: true, icon: <Wallet aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/offers', title: t.offersTitle, desc: t.offersDesc, live: true, icon: <Tag aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/perks', title: t.perksTitle, desc: t.perksDesc, live: true, icon: <Gift aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/inbox', title: t.inboxTitle, desc: t.inboxDesc, live: false, icon: <Inbox aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/guides', title: t.guidesTitle, desc: t.guidesDesc, live: true, icon: <PenSquare aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/insights', title: t.insightsTitle, desc: t.insightsDesc, live: true, icon: <BarChart2 aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/sessions', title: t.sessionsTitle, desc: t.sessionsDesc, live: true, icon: <Video aria-hidden="true" className="h-5 w-5" /> },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => {
        const header = (
          <>
            <div className="flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orange">{tool.icon}</span>
              <RouteStamp className={tool.live ? 'bg-kinnso-orange/10 text-kinnso-orange' : 'bg-kinnso-cream2 text-kinnso-muted'}>
                {tool.live ? t.liveBadge : t.soonBadge}
              </RouteStamp>
            </div>
            <h3 className="mt-3 text-lg font-bold text-kinnso-ink">{tool.title}</h3>
            <p className="mt-1 text-sm text-kinnso-muted">{tool.desc}</p>
          </>
        )
        if (!tool.live) {
          return (
            <TicketCard key={tool.href} className="p-5 opacity-70">
              {header}
            </TicketCard>
          )
        }
        return (
          <TicketCard key={tool.href} as={Link} href={p(tool.href)} className="group p-5 transition hover:border-kinnso-orange">
            {header}
            <span className="mt-3 inline-flex items-center text-sm font-bold text-kinnso-orange">
              {t.open} <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </TicketCard>
        )
      })}
    </div>
  )
}

export default StudioQuickLinks
```

There is no existing count-badge/pill pattern anywhere in this codebase to follow (verified
during this plan's design phase — only the `live`/`soon` two-state `RouteStamp` exists). This
is a genuinely new, small pattern; keep it minimal.

- [ ] **Step 1: Write the failing test**

Check first whether `apps/web/tests/kinnso.StudioQuickLinks.test.tsx` already exists — if so,
read it in full and add to it; if not, create it fresh with this content:

```typescript
// apps/web/tests/kinnso.StudioQuickLinks.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { StudioQuickLinks } from '@/components/kinnso/StudioQuickLinks'

afterEach(cleanup)
const t = en.studioHome

describe('StudioQuickLinks', () => {
  it('flips the Inbox tile live and links it', () => {
    render(<StudioQuickLinks locale="en" t={t} unreadNotificationCount={0} />)
    const link = screen.getByRole('link', { name: new RegExp(t.inboxTitle) })
    expect(link.getAttribute('href')).toBe('/en/studio/inbox')
  })

  it('shows an unread count badge when there are unread notifications', () => {
    render(<StudioQuickLinks locale="en" t={t} unreadNotificationCount={3} />)
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('shows no badge when there are zero unread notifications', () => {
    render(<StudioQuickLinks locale="en" t={t} unreadNotificationCount={0} />)
    expect(screen.queryByText('0')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.StudioQuickLinks.test.tsx`
Expected: FAIL — the Inbox tile is not live, no `unreadNotificationCount` prop exists.

- [ ] **Step 3: Edit `StudioQuickLinks.tsx`**

Change the component signature to accept the new prop:

```typescript
export function StudioQuickLinks({ locale, t, unreadNotificationCount }: { locale: Locale; t: Messages['studioHome']; unreadNotificationCount: number }) {
```

Change the inbox tile's `live: false` to `live: true`:

```typescript
    { href: '/studio/inbox', title: t.inboxTitle, desc: t.inboxDesc, live: true, icon: <Inbox aria-hidden="true" className="h-5 w-5" /> },
```

Add an unread-count badge to the header block, rendered only for the inbox tile and only
when the count is positive — insert it right after the existing `RouteStamp` in the `header`
JSX:

```typescript
              {tool.href === '/studio/inbox' && unreadNotificationCount > 0 && (
                <span className="ml-2 grid h-5 min-w-5 place-items-center rounded-full bg-kinnso-orange px-1.5 text-xs font-bold text-white">
                  {unreadNotificationCount}
                </span>
              )}
```

Placement: directly inside the same `<div className="flex items-center justify-between">`
the `RouteStamp` already lives in, after it — read the current file structure yourself to
place this precisely, since the exact JSX nesting matters for the flex layout to look right.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/kinnso.StudioQuickLinks.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire the count through `/studio/page.tsx` and `StudioDashboardView.tsx`**

In `apps/web/app/[locale]/studio/page.tsx`:
- Add `import { getUnreadNotificationCount } from '@/lib/notifications/queries'` to the imports.
- Add `getUnreadNotificationCount(supabase)` as an 8th entry to the existing `Promise.all([...])`
  array (currently 7 entries: `handleRes, guidesRes, activeJobRes, missionsRes, offersRes,
  settlementsRes, contribution`) — destructure its result as `unreadCountRes` (an 8th name in
  the same destructuring assignment).
- Pass `unreadNotificationCount={unreadCountRes}` as a new prop to `<StudioDashboardView ... />`.

In `apps/web/components/kinnso/pages/StudioDashboardView.tsx` (read it now, not previously
read during planning): add `unreadNotificationCount: number` to its props type, and thread
it through to wherever it renders `<StudioQuickLinks .../>`.

- [ ] **Step 6: Run the affected test files**

Run: `cd apps/web && npx vitest run tests/kinnso.StudioQuickLinks.test.tsx tests/studio.dashboard.host.test.tsx`
Expected: PASS — if `studio.dashboard.host.test.tsx` fails because its Supabase mock/`Promise.all`
double doesn't account for the new 8th call, add a matching mock entry for
`getUnreadNotificationCount` following whatever mocking pattern the file's other 7 already use.

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: 0 new errors (the missing `t.notifications.*`/`t.studioInbox.*` i18n key errors from
Task 5 are still expected and pending Task 7 — everything else must be clean).

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/kinnso/StudioQuickLinks.tsx apps/web/components/kinnso/pages/StudioDashboardView.tsx "apps/web/app/[locale]/studio/page.tsx" apps/web/tests/kinnso.StudioQuickLinks.test.tsx apps/web/tests/studio.dashboard.host.test.tsx
git commit -m "feat(r10.3): show an unread notification badge on the Studio quicklinks tile"
```

---

### Task 7: Locale keys across all 7 dictionaries

**Files:**
- Modify: `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts`
- Test: `apps/web/tests/i18n.locale-parity.test.ts` (verify only — parity is enforced
  automatically by the existing recursive key-path check, no new test code needed)

**BEFORE YOU START:** re-read `StudioInboxView.tsx` and `StudioQuickLinks.tsx` (both already
committed by Tasks 5-6) to confirm the exact, final set of `t.<key>` references — this is the
authoritative source, not the list below, which was drafted before those files existed in
final form. Cross-check against the baseline `tsc` error list (`pnpm typecheck`) the same way
R10.2's Task 10 did.

Add a new `notifications` top-level key to the `Messages` type and every locale's values
object, alongside a small addition to the existing `studioHome` namespace (the inbox tile
copy already exists there — `inboxTitle`, `inboxDesc` — confirm they're already used
correctly by `StudioQuickLinks` rather than assuming new keys are needed there).

- [ ] **Step 1: Add the type declaration in `en.ts`**

Add a new top-level key to the `Messages` type (find where `studioEarnings` or a similarly-
sized namespace is declared, and add this as a sibling):

```typescript
  notifications: {
    heading: string
    subtitle: string
    empty: string
    'submission.approved': string
    'submission.rejected': string
    'submission.revision_requested': string
    'settlement.created': string
    'payout_batch.created': string
    'payout_batch.paid': string
    'payout_batch.cancelled': string
  }
```

- [ ] **Step 2: Add the English values**

```typescript
  notifications: {
    heading: 'Inbox',
    subtitle: 'Updates on your submissions, settlements, and payouts.',
    empty: "You're all caught up.",
    'submission.approved': 'Your submission for {mission_title} was approved',
    'submission.rejected': 'Your submission for {mission_title} was rejected',
    'submission.revision_requested': 'Revisions requested for your submission on {mission_title}',
    'settlement.created': 'A new settlement was recorded for {mission_title}',
    'payout_batch.created': 'A payout of {amount} {currency} has been promised to you',
    'payout_batch.paid': 'Your payout of {amount} {currency} has been paid',
    'payout_batch.cancelled': 'A pending payout of {amount} {currency} was cancelled',
  },
```

- [ ] **Step 3: Add the zh-hk values**

```typescript
  notifications: {
    heading: '收件箱',
    subtitle: '關於你的提交、結算及付款的更新。',
    empty: '目前沒有新通知。',
    'submission.approved': '你在「{mission_title}」的提交已獲批准',
    'submission.rejected': '你在「{mission_title}」的提交已被拒絕',
    'submission.revision_requested': '「{mission_title}」的提交需要修改',
    'settlement.created': '「{mission_title}」已記錄一筆新結算',
    'payout_batch.created': '已為你承諾一筆 {amount} {currency} 的付款',
    'payout_batch.paid': '你的 {amount} {currency} 付款已支付',
    'payout_batch.cancelled': '一筆待處理的 {amount} {currency} 付款已被取消',
  },
```

- [ ] **Step 4: Add the zh-tw values**

```typescript
  notifications: {
    heading: '收件匣',
    subtitle: '關於你的提交、結算及付款的更新。',
    empty: '目前沒有新通知。',
    'submission.approved': '你在「{mission_title}」的提交已獲核准',
    'submission.rejected': '你在「{mission_title}」的提交已被拒絕',
    'submission.revision_requested': '「{mission_title}」的提交需要修改',
    'settlement.created': '「{mission_title}」已記錄一筆新結算',
    'payout_batch.created': '已為你承諾一筆 {amount} {currency} 的付款',
    'payout_batch.paid': '你的 {amount} {currency} 付款已支付',
    'payout_batch.cancelled': '一筆待處理的 {amount} {currency} 付款已被取消',
  },
```

- [ ] **Step 5: Add the zh-cn values**

```typescript
  notifications: {
    heading: '收件箱',
    subtitle: '关于你的提交、结算和付款的更新。',
    empty: '暂无新通知。',
    'submission.approved': '你在“{mission_title}”的提交已获批准',
    'submission.rejected': '你在“{mission_title}”的提交已被拒绝',
    'submission.revision_requested': '“{mission_title}”的提交需要修改',
    'settlement.created': '“{mission_title}”已记录一笔新结算',
    'payout_batch.created': '已为你承诺一笔 {amount} {currency} 的付款',
    'payout_batch.paid': '你的 {amount} {currency} 付款已支付',
    'payout_batch.cancelled': '一笔待处理的 {amount} {currency} 付款已被取消',
  },
```

- [ ] **Step 6: Add the ja values**

```typescript
  notifications: {
    heading: '受信箱',
    subtitle: '提出物、精算、支払いに関する更新。',
    empty: '新しい通知はありません。',
    'submission.approved': '「{mission_title}」への提出が承認されました',
    'submission.rejected': '「{mission_title}」への提出が却下されました',
    'submission.revision_requested': '「{mission_title}」への提出に修正が求められています',
    'settlement.created': '「{mission_title}」の新しい精算が記録されました',
    'payout_batch.created': '{amount} {currency} の支払いが約束されました',
    'payout_batch.paid': '{amount} {currency} の支払いが完了しました',
    'payout_batch.cancelled': '保留中だった {amount} {currency} の支払いがキャンセルされました',
  },
```

- [ ] **Step 7: Add the ko values**

```typescript
  notifications: {
    heading: '받은함',
    subtitle: '제출물, 정산, 지급에 대한 업데이트입니다.',
    empty: '새 알림이 없습니다.',
    'submission.approved': '"{mission_title}"에 대한 제출이 승인되었습니다',
    'submission.rejected': '"{mission_title}"에 대한 제출이 거절되었습니다',
    'submission.revision_requested': '"{mission_title}"에 대한 제출에 수정이 요청되었습니다',
    'settlement.created': '"{mission_title}"에 새 정산이 기록되었습니다',
    'payout_batch.created': '{amount} {currency} 지급이 약속되었습니다',
    'payout_batch.paid': '{amount} {currency} 지급이 완료되었습니다',
    'payout_batch.cancelled': '대기 중이던 {amount} {currency} 지급이 취소되었습니다',
  },
```

- [ ] **Step 8: Add the th values**

```typescript
  notifications: {
    heading: 'กล่องข้อความ',
    subtitle: 'ความคืบหน้าเกี่ยวกับการส่งงาน การชำระบัญชี และการจ่ายเงินของคุณ',
    empty: 'ไม่มีการแจ้งเตือนใหม่',
    'submission.approved': 'การส่งงานของคุณสำหรับ {mission_title} ได้รับการอนุมัติแล้ว',
    'submission.rejected': 'การส่งงานของคุณสำหรับ {mission_title} ถูกปฏิเสธ',
    'submission.revision_requested': 'มีการขอให้แก้ไขการส่งงานของคุณสำหรับ {mission_title}',
    'settlement.created': 'มีการบันทึกการชำระบัญชีใหม่สำหรับ {mission_title}',
    'payout_batch.created': 'มีการให้คำมั่นการจ่ายเงินจำนวน {amount} {currency} แก่คุณ',
    'payout_batch.paid': 'การจ่ายเงินจำนวน {amount} {currency} ของคุณได้รับการชำระแล้ว',
    'payout_batch.cancelled': 'การจ่ายเงินที่รอดำเนินการจำนวน {amount} {currency} ถูกยกเลิก',
  },
```

- [ ] **Step 9: Run the parity test and typecheck**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts`
Expected: PASS.

Run: `pnpm typecheck`
Expected: 0 errors — this should clear every remaining expected error from Tasks 5-6.

- [ ] **Step 10: Remove the `PENDING_I18N_FALLBACK` workaround from Task 5's test**

Read `apps/web/tests/kinnso.StudioInboxView.test.tsx` and revert `const t = { ...PENDING_I18N_FALLBACK, ...en.notifications }`
to `const t = en.notifications`, removing the now-unused fallback constant. Re-run that test
file to confirm nothing broke.

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/i18n/messages/ apps/web/tests/kinnso.StudioInboxView.test.tsx
git commit -m "i18n(r10.3): add notification copy across all seven locales"
```

---

### Task 8: Live verification and full gate

**Files:**
- Create: `apps/web/tests/notifications.rls.test.ts`
- No other files — this task runs the full gate and pushes/opens the PR.

**Read first:** `apps/web/tests/payout-batches.rls.test.ts` (R10.2's live proof) for the
exact structural pattern: `@vitest-environment node`, `describe.skip` fallback, hand-signed
HS256 JWTs, `runId`-scoped seed data, and — this matters — **check whether `notifications`
has the same permanent-undeletability characteristic R10.2's payout batches turned out to
have** (append-only-by-design tables with `NO ACTION` foreign keys and no delete path). This
phase's table has no immutability trigger and no non-cascading FK chain reaching back to
`creators`/`auth.users` the way R10.2's did — but verify this yourself against the actual
schema (Task 1's migration) rather than assuming it's fine because this plan says so.

- [ ] **Step 1: Write the live proof test**

Cover, against a real local Postgres stack:

1. **Fault injection — the roadmap's explicit acceptance criterion.** Temporarily make a
   notification insert fail from inside a live transaction (e.g., insert a row into
   `mission_milestone_submissions` whose `mission_participant_id` doesn't resolve to any
   `mission_participants` row with a non-null `creator_id` — this makes the trigger's own
   `if v_creator_id is null then return new; end if` guard a NO-OP path, which does NOT
   actually test the exception handler; you need to force the *insert itself* to fail, not
   just make the function return early. The cleanest way: temporarily add a second,
   throwaway `check` constraint to `notifications` in the SAME test transaction — e.g.
   `alter table notifications add constraint temp_test_fail check (false) not valid;` won't
   help either since `not valid` doesn't enforce on new rows retroactively in the way you'd
   want here. Use this instead: wrap the whole fault-injection scenario in its own
   transaction via `docker exec ... psql`, `begin;`, temporarily `drop` the
   `notifications_payload_size` check constraint's inverse — i.e., insert a submission update
   whose resolved payload would exceed 8 KiB (a mission title long enough to blow the
   constraint) to trigger the REAL constraint failure path, then assert the submission's own
   `status` update still committed. Write this out concretely once you're working against
   the live stack; the exact SQL to construct an over-8KiB mission title is a detail worth
   getting right by testing it directly rather than guessing here.
2. Submission approved → creator gets a `submission.approved` notification.
3. Settlement created (via whatever seed path is simplest against this schema — check
   R10.1's live proof for how it seeds a settlement) → creator gets `settlement.created`.
4. Payout batch created/paid/cancelled (reuse R10.2's seeding pattern directly) → creator
   gets all three notification types in sequence.
5. `notifications_mine()` returns only the caller's own rows (RLS isolation, mirroring
   R10.2's creator-isolation test).
6. Marking a notification read persists `read_at` and is reflected in
   `notifications_unread_count()`.

Use fresh `randomUUID()` seed ids per run, matching R10.2's proven pattern — do not use fixed
constants unless you've confirmed (per the note above) that this table doesn't share R10.2's
permanent-undeletability characteristic.

- [ ] **Step 2: Apply migrations to the local stack and run the live proof twice**

Follow R10.2 Task 11's exact operational playbook: shift `supabase/config.toml` ports by
+100 to avoid the `adfocate-2` sibling-project collision (disable `[studio]`/`[inbucket]`/
`[storage]`/`[analytics]`, matching [[kinnso-local-stack-port-shift-gotcha]] in project
memory), `supabase start`, confirm `apps/web/.env.test` points at the shifted port, run the
live proof file twice consecutively confirming identical results both times, then restore
`config.toml` via `git checkout --` and stop the stack. **Never** run any command against
the linked production project.

- [ ] **Step 3: Full gate**

```bash
pnpm typecheck
cd apps/web && pnpm lint
pnpm honesty:lint
cd apps/web && npx vitest run
```

Known, pre-existing, unrelated failures if PR #112 (the jsdom/localStorage fix) hasn't merged
to `main` yet by the time you run this: none, if you branched from a `main` that already has
it; three files (`analytics.client`, `analytics.entity-view`, `kinnso.AnalyticsConsentBanner`)
if you branched before it merged — confirm which by checking `git log main --oneline | grep
localstorage` before treating any localStorage-related failure as pre-existing baseline
noise rather than a real regression this phase introduced.

- [ ] **Step 4: Commit, push, open the PR**

```bash
git add apps/web/tests/notifications.rls.test.ts
git commit -m "test(r10.3): prove the notification fault-injection guarantee and RLS isolation on a live stack"
```

Check whether this work was done on a branch built on top of an unmerged parent (the same
stacked-branch risk documented in [[stacked-branch-squash-merge-gotcha]], which has now
recurred three times in this program) — if `main` has moved since this branch was cut, or if
this branch's base includes commits from another still-open phase PR, do NOT push as-is.
Cherry-pick this phase's own commit range onto a fresh branch from current `origin/main`
first, verify the gate passes identically on that clean branch, then push and open the PR
against `main` with `gh pr create --repo YNWAforever/Remix-Kinnso`.

---

## Self-Review Notes (from the plan author, not a task for the implementer)

**Spec coverage:** every section of the design doc has a corresponding task — schema (1),
triggers incl. the agreed 7th event (2), reads (3), TS layer (4), UI + click-through (5),
badge (6), i18n (7), fault-injection + RLS proof (8, the design's explicit acceptance
criterion).

**Known gaps intentionally left to the implementer's judgment, per the design doc's own
"Open questions" section:** the combined vs. separate unread-count RPC shape was resolved
here as two separate RPCs (`notifications_mine` + `notifications_unread_count`) rather than
folding the count into the list response — simpler to reason about and test independently,
at the cost of one extra RPC call on `/studio/inbox` specifically (not on `/studio`, which
only calls the count RPC). If an implementer or reviewer prefers the combined shape, that's a
reasonable deviation to make and note, not a plan violation.

**Task 8's fault-injection step is deliberately less prescriptive than every other step in
this plan** — it describes the goal and a promising approach rather than exact tested SQL,
because forcing a specific Postgres error path is the kind of thing that needs to be verified
against the real running trigger, not designed on paper. This is an intentional exception to
this skill's "no placeholders" rule for exactly one step, flagged explicitly rather than
silently under-specified — matching the "no placeholders" section's spirit (give real content
whenever it's actually knowable) rather than its letter where it genuinely isn't yet.
