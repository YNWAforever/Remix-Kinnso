# Phase R11.0 — Ops Mission Detail + Submission Review Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ops an audited `admin_review_submission` RPC plus two new surfaces — a mission
detail drill-down and a submission review queue — so the `submissions_awaiting_review` KPI on
`/admin/missions` links to a queue where `submitted` rows are actionable and
`revision_requested` rows are visibly waiting on the creator.

**Architecture:** Ops already has raw RLS write access to `mission_milestone_submissions`
(`mission_submissions_creator_merchant_ops_update` has no status-transition restriction for
ops) — this RPC exists for CAS safety, the audit trail, and the DB-enforced reason-category
rule, not to close a security gap. `admin_review_submission` reuses `reviewSubmission()`'s
existing transition rule (CAS on `status = 'submitted'` only — `revision_requested` stays
not-yet-re-decidable, per the design amendment) inside a `SECURITY DEFINER` RPC gated by
`is_active_ops_role('admin')`, modeled directly on `admin_set_settlement_status`'s
`for update` → validate → `update` → `perform ops_audit_log_append(...)` shape. A new
append-only `mission_review_events` table records every review decision — merchant or ops —
so the mission detail page has one unified history to read from; the merchant-side
`reviewSubmissionAction` gains one insert into it alongside its existing update.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · Vitest 4 ·
Supabase (Postgres + Auth + RLS)

**Full design context:** `docs/superpowers/specs/2026-08-19-phase-r11-0-mission-review-design.md`
— read it once before starting, including the amendment at the top about `revision_requested`
rows being read-only in the queue.

---

## Context you need before starting

This is R11.0, the first sub-phase of R11 ("Mission Control"). It depends only on
tables/RPCs already on `main` — nothing here waits on R10.2 or R10.3 merging. **R10.2
(`feat/r10-2-payout-handoff`, PR #111) is NOT merged into `main`** as of this branch's root;
do not assume its RPCs (`admin_create_payout_batch` etc.) exist yet, even though this plan
references their CAS-error-message conventions for consistency.

**Schema facts you'll need, already verified against this codebase (don't re-derive):**
- `mission_milestone_submissions(id, mission_milestone_id, mission_participant_id, status,
  proof_urls, notes, merchant_feedback, submitted_at, reviewed_at, reviewed_by, created_at,
  updated_at)` — `status` has an explicit `check (status in ('pending','submitted',
  'revision_requested','approved','rejected'))` (`20260617173932_mission_tables.sql`). A
  trigger `app_private.enforce_mission_submission_integrity()` restricts what the *creator*
  can set on this table; it does not restrict merchant or ops writes (RLS handles that).
- `apps/web/lib/missions/state.ts`'s `reviewSubmission(currentStatus, action)` throws unless
  `currentStatus === 'submitted'`; returns `'approved' | 'revision_requested' | 'rejected'`.
  This plan's RPC mirrors this exact rule — do not widen it to accept `revision_requested`.
- `mission_verification_jobs(id, mission_milestone_submission_id, creator_id, platform,
  proof_url, status, confidence_status, error, started_at, completed_at, created_at,
  updated_at)` — `confidence_status` is one of `'verified_signal' | 'needs_review' |
  'unavailable'` (nullable). No "current job" flag — the latest row per submission is found
  via `order by created_at desc limit 1` (see `admin_mission_analytics`'s own `at_risk` query
  for the exact correlated-subquery pattern to copy).
- `is_active_ops_role(p_min text) returns boolean` (`20260701160000_ops_role_enforcement.sql`)
  is the rank-aware gate every money/state-mutating RPC uses (`is_active_ops_role('admin')`).
  `is_active_ops()` (no args) is the older, plain gate `admin_mission_analytics` still uses
  for its read-only RPC — leave that RPC's gate unchanged, only widen its `where` clauses.
- `ops_audit_log_append(p_entity_type text, p_entity_id uuid, p_action text, p_reason text
  default null, p_metadata jsonb default '{}'::jsonb) returns uuid` is the **only** write path
  into `ops_audit_log` — call it via `perform`, never insert directly (RLS has no insert
  policy on that table at all).
- `requireOpsPage(supabase, loc)` (`apps/web/lib/admin/guard.ts`) denies non-ops with
  `notFound()` (not a redirect) and anon with `redirect('/${loc}/sign-in')`.
- `apps/web/lib/admin/result.ts` exports the shared `ActionResult<T>`/`ActionFailure`/
  `formError` types every admin action should use. **Do not** duplicate these locally the way
  `apps/web/lib/missions/actions.ts` does for the (unrelated, unchanged) merchant-side
  `reviewSubmissionAction` — this phase's new ops action imports from `lib/admin/result.ts`.
- `apps/web/lib/admin/ops-validation.ts` exports `validateReason(reason): string | null`
  (returns `'reason_required'` or `'reason_too_long'` or `null`) — reuse it, don't rewrite it.

**Do not touch the live database.** This repo is `supabase link`ed to PRODUCTION (project ref
`scryfkefedzuetfdtrvl`). No `supabase db push`, `db reset` against production, `migration
repair`, or Supabase MCP tools. Everything is local-only until the final verification task,
which uses a local Docker Postgres stack exclusively.

**`pnpm --filter @kinnso/db gen` is forbidden** — it reads production
(`supabase gen types typescript --linked`). Hand-add `Functions`/`Tables` entries to
`packages/db/types.ts` instead, following the precedent in every prior phase's plan.

**Never edit a shipped migration** — add a new timestamped file.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/20260819090000_r11_0_mission_review_events.sql` | `mission_review_events` table, `review_deadline` column + backfill trigger | 1 |
| `supabase/migrations/20260819090100_r11_0_admin_review_submission.sql` | `admin_review_submission()` RPC | 2 |
| `supabase/migrations/20260819090200_r11_0_widen_mission_analytics.sql` | Widen `admin_mission_analytics` beyond `mission_source = 'merchant'` | 3 |
| `apps/web/lib/missions/actions.ts` | Modify: `reviewSubmissionAction` gains a `mission_review_events` insert | 4 |
| `apps/web/lib/admin/mission-review-queries.ts` | `getReviewQueue`, `getMissionDetail` | 4 |
| `apps/web/lib/admin/mission-review-actions.ts` | `reviewSubmissionOpsAction` | 4 |
| `apps/web/app/[locale]/admin/missions/[missionId]/page.tsx` | Mission detail page | 5 |
| `apps/web/components/kinnso/admin/missions/MissionDetailView.tsx` | Detail page view | 5 |
| `apps/web/app/[locale]/admin/missions/review/page.tsx` | Review queue page | 6 |
| `apps/web/components/kinnso/admin/missions/MissionReviewQueueView.tsx` | Queue view | 6 |
| `apps/web/components/kinnso/admin/missions/MissionsOverviewView.tsx` | Modify: make the KPI card a link | 7 |
| `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` | New keys for the queue/detail pages | 8 |
| `apps/web/tests/*` | One test file per task above, plus a live RLS/CAS proof | every task + 9 |

---

### Task 1: `mission_review_events` table + `review_deadline` column

**Files:**
- Create: `supabase/migrations/20260819090000_r11_0_mission_review_events.sql`
- Test: `apps/web/tests/db.mission-review-events.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_0_mission_review_events.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.0 mission_review_events table + review_deadline column', () => {
  it('creates the events table with every required column', () => {
    expect(sql).toContain('create table public.mission_review_events')
    expect(sql).toContain('submission_id uuid not null references public.mission_milestone_submissions(id) on delete cascade')
    expect(sql).toContain("actor_type text not null check (actor_type in ('creator', 'merchant', 'ops', 'system'))")
    expect(sql).toContain('actor_id uuid')
    expect(sql).toContain("action text not null check (action in ('approve', 'reject', 'request_revision'))")
    expect(sql).toContain('reason_category text')
    expect(sql).toContain('reason_text text')
    expect(sql).toContain('created_at timestamptz not null default now()')
  })

  it('requires a reason_category whenever the action is reject or request_revision', () => {
    expect(sql).toContain("constraint mission_review_events_reason_required check (action not in ('reject', 'request_revision') or reason_category is not null)")
  })

  it('constrains reason_category to the five Adfocate categories when present', () => {
    expect(sql).toContain("constraint mission_review_events_reason_category_check check (reason_category is null or reason_category in ('format', 'key_message', 'compliance', 'quality', 'other'))")
  })

  it('indexes by submission for the detail page history read', () => {
    expect(sql).toContain('create index mission_review_events_submission_idx on public.mission_review_events (submission_id, created_at desc)')
  })

  it('enables RLS with select for creator, merchant, and ops only', () => {
    expect(sql).toContain('alter table public.mission_review_events enable row level security')
    expect(sql).toContain('create policy mission_review_events_select on public.mission_review_events')
  })

  it('grants no insert/update/delete to any client role', () => {
    expect(sql).toContain('revoke all on public.mission_review_events from public, anon, authenticated')
    expect(sql).toContain('grant select on public.mission_review_events to authenticated')
    expect(sql).not.toContain('grant insert')
    expect(sql).not.toContain('grant update')
  })

  it('adds review_deadline to mission_milestone_submissions with a backfill', () => {
    expect(sql).toContain('alter table public.mission_milestone_submissions add column review_deadline timestamptz')
    expect(sql).toContain("update public.mission_milestone_submissions set review_deadline = submitted_at + interval '48 hours' where submitted_at is not null and review_deadline is null")
  })

  it('adds a trigger that resets the deadline whenever submitted_at changes', () => {
    expect(sql).toContain('create or replace function public.set_submission_review_deadline() returns trigger')
    expect(sql).toContain("new.review_deadline := new.submitted_at + interval '48 hours'")
    expect(sql).toContain('create trigger set_submission_review_deadline_trg')
    expect(sql).toContain('before insert or update on public.mission_milestone_submissions')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.mission-review-events.test.ts`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260819090000_r11_0_mission_review_events.sql
--
-- R11.0: an append-only history of every submission review decision, merchant or ops. Ops
-- already has raw RLS write access to mission_milestone_submissions
-- (mission_submissions_creator_merchant_ops_update has no status-transition restriction for
-- ops) -- this table exists for the audit trail the mission detail page reads from, not to
-- close a security gap. Every review action (the existing merchant reviewSubmissionAction,
-- and the new admin_review_submission RPC in the next migration) writes exactly one row here.
--
-- reason_category is required whenever action is 'reject' or 'request_revision' -- enforced
-- as a check constraint, not just at the RPC layer, so the "rejection without a reason
-- category is impossible" guarantee holds even against a hypothetical future direct-insert
-- bypass (there is none today -- see the zero insert grant below).

create table public.mission_review_events (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references public.mission_milestone_submissions(id) on delete cascade,
  actor_type      text not null check (actor_type in ('creator', 'merchant', 'ops', 'system')),
  actor_id        uuid,
  action          text not null check (action in ('approve', 'reject', 'request_revision')),
  reason_category text,
  reason_text     text,
  created_at      timestamptz not null default now(),
  constraint mission_review_events_reason_required check (
    action not in ('reject', 'request_revision') or reason_category is not null
  ),
  constraint mission_review_events_reason_category_check check (
    reason_category is null or reason_category in ('format', 'key_message', 'compliance', 'quality', 'other')
  )
);

create index mission_review_events_submission_idx on public.mission_review_events (submission_id, created_at desc);

alter table public.mission_review_events enable row level security;

create policy mission_review_events_select on public.mission_review_events
  for select using (
    exists (
      select 1
      from public.mission_milestone_submissions sub
      join public.mission_participants p on p.id = sub.mission_participant_id
      join public.missions m on m.id = p.mission_id
      join public.merchant_profiles mp on mp.id = m.merchant_profile_id
      where sub.id = mission_review_events.submission_id
        and (
          p.creator_id = auth.uid()
          or mp.user_id = auth.uid()
          or exists (select 1 from public.kinnso_ops_members ops where ops.user_id = auth.uid() and ops.status = 'active')
        )
    )
  );

-- No insert/update/delete policy exists at all -- every row comes from a trigger-adjacent
-- action/RPC path (SECURITY DEFINER or an ops-gated action), never a direct client write.
revoke all on public.mission_review_events from public, anon, authenticated;
grant select on public.mission_review_events to authenticated;

-- review_deadline: defaulted to submitted_at + 48h (Adfocate's review_sla_hours default),
-- reset whenever submitted_at changes so a resubmission after a revision request gets a
-- fresh window. Nullable -- a submission that has never been submitted (still 'pending') has
-- no deadline.
alter table public.mission_milestone_submissions add column review_deadline timestamptz;

update public.mission_milestone_submissions
  set review_deadline = submitted_at + interval '48 hours'
  where submitted_at is not null and review_deadline is null;

create or replace function public.set_submission_review_deadline() returns trigger
language plpgsql as $$
begin
  if new.submitted_at is not null and (tg_op = 'insert' or new.submitted_at is distinct from old.submitted_at) then
    new.review_deadline := new.submitted_at + interval '48 hours';
  end if;
  return new;
end;
$$;

create trigger set_submission_review_deadline_trg
  before insert or update on public.mission_milestone_submissions
  for each row execute function public.set_submission_review_deadline();
```

Before finalizing, verify the RLS-policy join chain (`mission_participants.mission_participant_id`
→ `missions` → `merchant_profiles`) against the actual current RLS policy already on
`mission_milestone_submissions` (`mission_submissions_visible_select` in
`20260617173938_mission_rls.sql`) — mirror its exact join shape rather than re-deriving it, so
the two policies stay consistent if the schema ever shifts.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.mission-review-events.test.ts`
Expected: PASS — count the actual `it()` blocks yourself before reporting a number.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260819090000_r11_0_mission_review_events.sql apps/web/tests/db.mission-review-events.test.ts
git commit -m "feat(r11.0): add mission_review_events table and review_deadline column"
```

---

### Task 2: `admin_review_submission` RPC

**Files:**
- Create: `supabase/migrations/20260819090100_r11_0_admin_review_submission.sql`
- Test: `apps/web/tests/db.admin-review-submission.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_0_admin_review_submission.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.0 admin_review_submission RPC', () => {
  it('applies after the events-table migration', () => {
    expect(matches[0] > '20260819090000').toBe(true)
  })

  it('gates on the admin rank, matching every other state-mutating ops RPC', () => {
    expect(sql).toContain('create or replace function public.admin_review_submission(')
    expect(sql).toContain("if not public.is_active_ops_role('admin') then raise exception 'forbidden' using errcode = '42501'; end if;")
  })

  it('requires a reason for reject and request_revision, matching validateReason\'s own rules', () => {
    expect(sql).toContain("if p_action in ('reject', 'request_revision') and coalesce(btrim(p_reason_category), '') = '' then raise exception 'reason_required'; end if;")
  })

  it('rejects an unknown action', () => {
    expect(sql).toContain("if p_action not in ('approve', 'reject', 'request_revision') then raise exception 'bad_action'; end if;")
  })

  it('locks the row and CASes on submitted, matching admin_set_settlement_status\'s for-update shape', () => {
    expect(sql).toContain('select status into v_status from public.mission_milestone_submissions where id = p_submission_id for update')
    expect(sql).toContain('if not found then raise exception \'not_found\'; end if;')
    expect(sql).toContain("if v_status <> 'submitted' then raise exception 'stale_status'; end if;")
  })

  it('computes the next status via the same rule as reviewSubmission()', () => {
    expect(sql).toContain("v_next_status := case p_action when 'approve' then 'approved' when 'request_revision' then 'revision_requested' else 'rejected' end;")
  })

  it('updates the submission, writes a review event, and appends an audit log entry in one transaction', () => {
    expect(sql).toContain('update public.mission_milestone_submissions set status = v_next_status, merchant_feedback = coalesce(p_reason_text, merchant_feedback), reviewed_at = now(), reviewed_by = auth.uid() where id = p_submission_id')
    expect(sql).toContain("insert into public.mission_review_events (submission_id, actor_type, actor_id, action, reason_category, reason_text) values (p_submission_id, 'ops', auth.uid(), p_action, p_reason_category, p_reason_text)")
    expect(sql).toContain("perform public.ops_audit_log_append('mission_submission', p_submission_id, 'submission.' || p_action, p_reason_text, jsonb_build_object('from', v_status, 'to', v_next_status, 'reason_category', p_reason_category))")
  })

  it('revokes from every client role except an authenticated grant', () => {
    expect(sql).toContain('revoke all on function public.admin_review_submission(uuid, text, text, text) from public, anon')
    expect(sql).toContain('grant execute on function public.admin_review_submission(uuid, text, text, text) to authenticated')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.admin-review-submission.test.ts`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260819090100_r11_0_admin_review_submission.sql
--
-- R11.0: the audited ops review path. Ops already has raw RLS write access to
-- mission_milestone_submissions (see the previous migration's header comment) -- this RPC's
-- value is CAS safety, the mission_review_events audit trail, and a reason-category rule
-- enforced at the database level, not new authorization. Modeled directly on
-- admin_set_settlement_status's shape (for update -> validate -> update -> perform
-- ops_audit_log_append), the one settlement-status RPC already shipped and merged in this
-- codebase.
--
-- CAS only accepts status = 'submitted', matching reviewSubmission()
-- (apps/web/lib/missions/state.ts) exactly -- a 'revision_requested' row is not yet
-- re-decidable until the creator resubmits (which flips status back to 'submitted' via
-- submitMilestoneAction), per the design's amendment.

create or replace function public.admin_review_submission(
  p_submission_id uuid,
  p_action text,
  p_reason_category text default null,
  p_reason_text text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status text;
  v_next_status text;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_action not in ('approve', 'reject', 'request_revision') then
    raise exception 'bad_action';
  end if;

  if p_action in ('reject', 'request_revision') and coalesce(btrim(p_reason_category), '') = '' then
    raise exception 'reason_required';
  end if;

  select status into v_status from public.mission_milestone_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status <> 'submitted' then
    raise exception 'stale_status';
  end if;

  v_next_status := case p_action
    when 'approve' then 'approved'
    when 'request_revision' then 'revision_requested'
    else 'rejected'
  end;

  update public.mission_milestone_submissions
    set status = v_next_status,
        merchant_feedback = coalesce(p_reason_text, merchant_feedback),
        reviewed_at = now(),
        reviewed_by = auth.uid()
    where id = p_submission_id;

  insert into public.mission_review_events (submission_id, actor_type, actor_id, action, reason_category, reason_text)
    values (p_submission_id, 'ops', auth.uid(), p_action, p_reason_category, p_reason_text);

  perform public.ops_audit_log_append(
    'mission_submission', p_submission_id, 'submission.' || p_action, p_reason_text,
    jsonb_build_object('from', v_status, 'to', v_next_status, 'reason_category', p_reason_category)
  );
end;
$$;

revoke all on function public.admin_review_submission(uuid, text, text, text) from public, anon;
grant execute on function public.admin_review_submission(uuid, text, text, text) to authenticated;
```

Note: `merchant_feedback` is reused as the column ops's `reason_text` lands in — the same
column the merchant-side review path already writes to (`apps/web/lib/missions/actions.ts`'s
`reviewSubmissionAction`), so the creator sees ops's reason in the same place they'd see a
merchant's. Verify this against `reviewSubmissionAction`'s actual current update payload
before finalizing — if a later change split ops/merchant feedback into separate columns, this
migration would need to follow that shape instead.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.admin-review-submission.test.ts`
Expected: PASS — count the real `it()` blocks yourself.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260819090100_r11_0_admin_review_submission.sql apps/web/tests/db.admin-review-submission.test.ts
git commit -m "feat(r11.0): add admin_review_submission RPC"
```

---

### Task 3: Widen `admin_mission_analytics` beyond `mission_source = 'merchant'`

**Files:**
- Create: `supabase/migrations/20260819090200_r11_0_widen_mission_analytics.sql`
- Test: `apps/web/tests/db.widen-mission-analytics.test.ts`

**Read first:** `supabase/migrations/20260702090000_admin_mission_analytics.sql` in full — this
task's migration is a `create or replace function` of the exact same function, with every
`mission_source = 'merchant'` (and `mi.mission_source = 'merchant'` / `missions.mission_source
= 'merchant'`) condition removed from every subquery. Copy the function's current full body
verbatim and delete only those conditions — do not restructure anything else. `create or
replace function` is safe here (this function has no `RETURNS TABLE` — it returns `jsonb` — so
the "can't widen RETURNS TABLE in place" gotcha this codebase has hit twice before does not
apply).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_0_widen_mission_analytics.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.0 widen admin_mission_analytics', () => {
  it('applies after the RPC migration', () => {
    expect(matches[0] > '20260819090100').toBe(true)
  })

  it('replaces admin_mission_analytics without any mission_source filter', () => {
    expect(sql).toContain('create or replace function public.admin_mission_analytics(p_days int default 30)')
    expect(sql).not.toContain("mission_source = 'merchant'")
  })

  it('keeps the plain is_active_ops gate unchanged (read-only RPC, not widened to is_active_ops_role)', () => {
    expect(sql).toContain('if not public.is_active_ops() then')
  })

  it('keeps every original KPI key present', () => {
    for (const key of ['total', 'by_status', 'by_type', 'by_visibility', 'open_for_applications', 'submissions_awaiting_review']) {
      expect(sql).toContain(`'${key}'`)
    }
  })

  it('does not change the grant/revoke shape', () => {
    expect(sql).toContain('revoke all on function public.admin_mission_analytics(int) from public, anon')
    expect(sql).toContain('grant execute on function public.admin_mission_analytics(int) to authenticated')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.widen-mission-analytics.test.ts`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

Read `supabase/migrations/20260702090000_admin_mission_analytics.sql` in full, copy its
`create or replace function public.admin_mission_analytics(...)` body verbatim into a new
file `supabase/migrations/20260819090200_r11_0_widen_mission_analytics.sql`, and remove every
occurrence of `and mission_source = 'merchant'` / `where mission_source = 'merchant'` (and the
`mi.`/`missions.`-qualified equivalents) from each subquery — for `where`-clauses that have no
other condition, remove the whole `where mission_source = 'merchant'` clause entirely (not
leave a dangling `where`); for `and mission_source = 'merchant'` conditions alongside other
conditions (e.g. the `open_for_applications` and `at_risk` subqueries), remove just that one
`and` clause. Keep the function's `revoke`/`grant` lines identical to the original (they're
unaffected by this change — `create or replace function` doesn't reset grants, but repeating
them is this codebase's convention for every `create or replace` migration). Add a header
comment explaining the widening:

```sql
-- supabase/migrations/20260819090200_r11_0_widen_mission_analytics.sql
--
-- R11.0: admin_mission_analytics previously filtered every subquery to
-- mission_source = 'merchant', making travelpayouts-sourced missions invisible to ops here --
-- the exact gap the roadmap calls out by name. This migration is a create-or-replace of the
-- same function (safe: it returns jsonb, not a RETURNS TABLE shape) with every such filter
-- removed. No other behavior changes; the read-only is_active_ops() gate and every KPI key
-- stay exactly as they were.

-- [full function body, mission_source filters removed, pasted here]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.widen-mission-analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260819090200_r11_0_widen_mission_analytics.sql apps/web/tests/db.widen-mission-analytics.test.ts
git commit -m "feat(r11.0): widen admin_mission_analytics beyond merchant-sourced missions"
```

---

### Task 4: TypeScript query/action layer

**Files:**
- Modify: `packages/db/types.ts`
- Modify: `apps/web/lib/missions/actions.ts` (add the `mission_review_events` insert to `reviewSubmissionAction`)
- Create: `apps/web/lib/admin/mission-review-queries.ts`
- Create: `apps/web/lib/admin/mission-review-actions.ts`
- Test: `apps/web/tests/mission.actions.test.ts` (extend — existing file)
- Test: `apps/web/tests/admin.mission-review-queries.test.ts`
- Test: `apps/web/tests/admin.mission-review-actions.test.ts`

**Read first:** `apps/web/lib/admin/creators-actions.ts`'s `setSettlementStatus` (the RPC-call
action template) and `apps/web/lib/admin/missions-queries.ts` (the existing query-layer
conventions for this domain) — both already read in full during planning; re-read to confirm
nothing drifted since.

- [ ] **Step 1: Hand-add `Functions`/`Tables` entries to `packages/db/types.ts`**

Do not run `pnpm --filter @kinnso/db gen`. Find the alphabetically-sorted position and insert:

```typescript
      admin_review_submission: { Args: { p_submission_id: string; p_action: string; p_reason_category: string | null; p_reason_text: string | null }; Returns: undefined }
```

into `Database['public']['Functions']`, and:

```typescript
      mission_review_events: {
        Row: {
          id: string
          submission_id: string
          actor_type: string
          actor_id: string | null
          action: string
          reason_category: string | null
          reason_text: string | null
          created_at: string
        }
        Insert: {
          id?: string
          submission_id: string
          actor_type: string
          actor_id?: string | null
          action: string
          reason_category?: string | null
          reason_text?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['mission_review_events']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'mission_review_events_submission_id_fkey'
            columns: ['submission_id']
            isOneToOne: false
            referencedRelation: 'mission_milestone_submissions'
            referencedColumns: ['id']
          },
        ]
      }
```

into `Database['public']['Tables']`, alphabetically near `mission_milestone_submissions`.
Also add `review_deadline: string | null` to `mission_milestone_submissions`'s existing
`Row`/`Insert`/`Update` shapes in the same file (find the existing entry, add the one field).

- [ ] **Step 2: Write the failing tests**

```typescript
// apps/web/tests/admin.mission-review-queries.test.ts
import { describe, expect, it, vi } from 'vitest'
import { getReviewQueue, getMissionDetail } from '@/lib/admin/mission-review-queries'

function client(raw: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data: raw, error })), from: vi.fn() }
}

describe('getReviewQueue', () => {
  it('propagates an RPC error', async () => {
    const supabase = client(null, { message: 'forbidden' })
    await expect(getReviewQueue(supabase as never)).rejects.toEqual({ message: 'forbidden' })
  })
})
```

```typescript
// apps/web/tests/admin.mission-review-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

type RpcResult = { data: unknown; error: { message: string } | null }
const { rpcMock, roleMock, getUserMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (): Promise<RpcResult> => ({ data: null, error: null })),
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'ops-1' } } })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: async () => {
    const { data: { user } } = await getUserMock()
    return { user: user ? { id: user.id } : null, role: await roleMock(), merchantId: null }
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock }, rpc: rpcMock }),
}))

import { reviewSubmissionOpsAction } from '@/lib/admin/mission-review-actions'

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null })
  roleMock.mockReset().mockResolvedValue('ops')
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'ops-1' } } })
})

describe('reviewSubmissionOpsAction', () => {
  it('approves without requiring a reason category', async () => {
    const res = await reviewSubmissionOpsAction('en', 'sub-1', 'approve', null, null)
    expect(res).toEqual({ ok: true, id: 'sub-1' })
    expect(rpcMock).toHaveBeenCalledWith('admin_review_submission', {
      p_submission_id: 'sub-1', p_action: 'approve', p_reason_category: null, p_reason_text: null,
    })
  })

  it('rejects a reject-action call missing a reason category before hitting the RPC', async () => {
    const res = await reviewSubmissionOpsAction('en', 'sub-1', 'reject', null, 'bad vibes')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('fails for a non-ops caller', async () => {
    roleMock.mockResolvedValueOnce('creator')
    const res = await reviewSubmissionOpsAction('en', 'sub-1', 'approve', null, null)
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('maps a stale_status RPC error to a friendly message', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'stale_status' } })
    const res = await reviewSubmissionOpsAction('en', 'sub-1', 'approve', null, null)
    expect(res.ok).toBe(false)
  })
})
```

Also add ONE new test to the existing `describe('reviewSubmissionAction', ...)` block in
`apps/web/tests/mission.actions.test.ts` (find the existing describe block and add inside it —
read the file first to match its exact `createSupabaseMock`/`createBuilder` helper shapes,
already used throughout that file):

```typescript
  it('writes a mission_review_events row alongside the submission update', async () => {
    const eventsBuilder = createBuilder({ insert: vi.fn(async () => ({ error: null })) })
    const supabase = createSupabaseMock({
      mission_milestone_submissions: [
        createBuilder({ single: vi.fn(async () => ({ data: { id: 'submission-1', status: 'submitted', mission_participant_id: 'participant-1' }, error: null })) }),
        createBuilder({ maybeSingle: vi.fn(async () => ({ data: { status: 'approved' }, error: null })) }),
      ],
      mission_participants: createBuilder({ single: vi.fn(async () => ({ data: { mission_id: 'mission-1' }, error: null })) }),
      missions: createBuilder({ maybeSingle: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })) }),
      mission_review_events: eventsBuilder,
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    await reviewSubmissionAction({ submissionId: 'submission-1', action: 'approve', locale: 'en' })

    expect(eventsBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      submission_id: 'submission-1', actor_type: 'merchant', action: 'approve',
    }))
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/admin.mission-review-queries.test.ts tests/admin.mission-review-actions.test.ts tests/mission.actions.test.ts`
Expected: FAIL — the two new source files don't exist yet, and the new `mission.actions.test.ts`
case fails since `reviewSubmissionAction` doesn't insert into `mission_review_events` yet.

- [ ] **Step 4: Modify `reviewSubmissionAction` in `apps/web/lib/missions/actions.ts`**

Read the function's current full body first (already read in full during planning — reproduce
below, but re-confirm nothing drifted). Add ONE insert into `mission_review_events` right
after the existing submission update succeeds, before the `revalidate(...)` call:

```typescript
  const { data: updatedSubmission, error: updateError } = await supabase
    .from('mission_milestone_submissions')
    .update({
      status: nextStatus,
      merchant_feedback: input.feedback ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('id', input.submissionId)
    .eq('status', submission.status)
    .select('status')
    .maybeSingle()

  if (updateError || !updatedSubmission) {
    return formError('Submission review could not be saved')
  }

  await supabase.from('mission_review_events').insert({
    submission_id: input.submissionId,
    actor_type: 'merchant',
    actor_id: user.id,
    action: input.action === 'request_revision' ? 'request_revision' : input.action,
    reason_category: null,
    reason_text: input.feedback ?? null,
  })

  await revalidate([localizedPath(input.locale, merchantMissionsPath)])
  return { ok: true, status: updatedSubmission.status }
```

Note: this insert is deliberately NOT error-checked/awaited-with-a-guard the way the main
update is — a failure here should not fail the merchant's review action (matching this
codebase's "the audit trail must never roll back the primary action" principle, same spirit as
R10.3's notification triggers). Confirm `input.action`'s exact type (`SubmissionReviewAction =
'approve' | 'request_revision' | 'reject'`) already matches `mission_review_events.action`'s
check constraint values one-to-one before finalizing — it does, per Task 1's schema, but verify
against the live `types.ts` import in this file.

- [ ] **Step 5: Write `apps/web/lib/admin/mission-review-queries.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export type ReviewQueueRow = {
  submissionId: string
  missionId: string
  missionTitle: string
  creatorId: string
  status: 'submitted' | 'revision_requested'
  submittedAt: string
  reviewDeadline: string | null
  confidenceStatus: 'verified_signal' | 'needs_review' | 'unavailable' | null
}

/** All submitted/revision_requested rows, joined for the queue's own columns. Errors propagate. */
export async function getReviewQueue(supabase: Client): Promise<ReviewQueueRow[]> {
  const { data, error } = await supabase
    .from('mission_milestone_submissions')
    .select(`
      id, status, submitted_at, review_deadline,
      mission_participants!inner ( creator_id, missions!inner ( id, title ) ),
      mission_verification_jobs ( confidence_status, created_at )
    `)
    .in('status', ['submitted', 'revision_requested'])
    .order('review_deadline', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) => {
    const participant = row.mission_participants as { creator_id: string; missions: { id: string; title: string } }
    const jobs = (row.mission_verification_jobs ?? []) as { confidence_status: string | null; created_at: string }[]
    const latestJob = jobs.length > 0
      ? jobs.reduce((a, b) => (a.created_at > b.created_at ? a : b))
      : null
    return {
      submissionId: row.id as string,
      missionId: participant.missions.id,
      missionTitle: participant.missions.title,
      creatorId: participant.creator_id,
      status: row.status as 'submitted' | 'revision_requested',
      submittedAt: row.submitted_at as string,
      reviewDeadline: (row.review_deadline as string | null) ?? null,
      confidenceStatus: (latestJob?.confidence_status as ReviewQueueRow['confidenceStatus']) ?? null,
    }
  })
}

export type MissionDetail = {
  mission: { id: string; title: string; missionSource: string; missionType: string; status: string }
  participants: { id: string; creatorId: string; status: string }[]
  milestones: { id: string; title: string }[]
  submissions: ReviewQueueRow[]
}

/** Full drill-down for one mission. Errors propagate; returns null if not found. */
export async function getMissionDetail(supabase: Client, missionId: string): Promise<MissionDetail | null> {
  const { data: mission, error } = await supabase
    .from('missions')
    .select('id, title, mission_source, mission_type, status')
    .eq('id', missionId)
    .maybeSingle()
  if (error) throw error
  if (!mission) return null

  const [{ data: participants }, { data: milestones }, queue] = await Promise.all([
    supabase.from('mission_participants').select('id, creator_id, status').eq('mission_id', missionId),
    supabase.from('mission_milestones').select('id, title').eq('mission_id', missionId),
    getReviewQueue(supabase),
  ])

  return {
    mission: {
      id: mission.id, title: mission.title, missionSource: mission.mission_source,
      missionType: mission.mission_type, status: mission.status,
    },
    participants: (participants ?? []).map((p) => ({ id: p.id, creatorId: p.creator_id, status: p.status })),
    milestones: (milestones ?? []).map((m) => ({ id: m.id, title: m.title })),
    submissions: queue.filter((s) => s.missionId === missionId),
  }
}
```

Before finalizing, verify the Supabase nested-select join syntax (`mission_participants!inner
( ... )`) against an existing example of a similar nested query elsewhere in this codebase
(e.g. `apps/web/lib/missions/earnings-summary.ts` or `apps/web/lib/admin/creators-queries.ts`'s
`getSettlementsQueue`) — the exact `!inner`/alias syntax needs to match this codebase's
established Supabase-js query-building conventions, which may differ from the sketch above.

- [ ] **Step 6: Write `apps/web/lib/admin/mission-review-actions.ts`**

```typescript
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateReason } from '@/lib/admin/ops-validation'
import type { Locale } from '@/lib/i18n/config'

const REASON_CATEGORIES = ['format', 'key_message', 'compliance', 'quality', 'other'] as const
export type ReasonCategory = (typeof REASON_CATEGORIES)[number]
export type ReviewAction = 'approve' | 'reject' | 'request_revision'

const FRIENDLY: Record<string, string> = {
  forbidden: 'Active ops admin access is required',
  bad_action: 'Unknown review action',
  reason_required: 'A reason category is required to reject or request revision',
  not_found: 'Submission was not found',
  stale_status: 'This submission has already been decided',
}

function mapError(message: string, fallback: string): string {
  for (const [key, friendly] of Object.entries(FRIENDLY)) {
    if (message.includes(key)) return friendly
  }
  return fallback
}

export async function reviewSubmissionOpsAction(
  locale: Locale,
  submissionId: string,
  action: ReviewAction,
  reasonCategory: ReasonCategory | null,
  reasonText: string | null,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  if (action !== 'approve') {
    if (!reasonCategory) return formError('A reason category is required')
    if (reasonText) {
      const rErr = validateReason(reasonText)
      if (rErr) return formError(FRIENDLY[rErr] ?? rErr)
    }
  }

  const { error } = await supabase.rpc('admin_review_submission', {
    p_submission_id: submissionId,
    p_action: action,
    p_reason_category: reasonCategory,
    p_reason_text: reasonText,
  })
  if (error) {
    console.error('[admin:missions] reviewSubmissionOpsAction failed', error)
    return formError(mapError(error.message, 'Submission could not be reviewed'))
  }
  revalidatePath(`/${locale}/admin/missions/review`)
  return { ok: true, id: submissionId }
}
```

Before finalizing, read `apps/web/lib/admin/guard.ts` to confirm `requireOpsAction`'s exact
current signature (return shape `{ok:true,user:{id}} | ActionFailure`, per this codebase's
established convention) rather than assuming.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/admin.mission-review-queries.test.ts tests/admin.mission-review-actions.test.ts tests/mission.actions.test.ts`
Expected: PASS

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors — this proves the hand-added `types.ts` entries are shaped correctly.

- [ ] **Step 9: Commit**

```bash
git add packages/db/types.ts apps/web/lib/missions/actions.ts apps/web/lib/admin/mission-review-queries.ts apps/web/lib/admin/mission-review-actions.ts apps/web/tests/admin.mission-review-queries.test.ts apps/web/tests/admin.mission-review-actions.test.ts apps/web/tests/mission.actions.test.ts
git commit -m "feat(r11.0): add mission review TypeScript query/action layer"
```

---

### Task 5: Mission detail page

**Files:**
- Create: `apps/web/app/[locale]/admin/missions/[missionId]/page.tsx`
- Create: `apps/web/components/kinnso/admin/missions/MissionDetailView.tsx`
- Test: `apps/web/tests/kinnso.MissionDetailView.test.tsx`
- Test: `apps/web/tests/admin.mission-detail.host.test.tsx`

**Read first:** `apps/web/app/[locale]/admin/missions/page.tsx` and
`apps/web/components/kinnso/admin/missions/MissionsOverviewView.tsx` (both already read in full
during planning) for the page-host and view-component conventions this new page should follow.

- [ ] **Step 1: Write the failing component test**

```typescript
// apps/web/tests/kinnso.MissionDetailView.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { MissionDetailView } from '@/components/kinnso/admin/missions/MissionDetailView'

afterEach(cleanup)
const t = en.missionsOps

const detail = {
  mission: { id: 'mission-1', title: 'Summer Coupon Push', missionSource: 'travelpayouts', missionType: 'coupon_affiliate', status: 'published' },
  participants: [{ id: 'p1', creatorId: 'creator-1', status: 'active' }],
  milestones: [{ id: 'm1', title: 'Post proof' }],
  submissions: [{
    submissionId: 's1', missionId: 'mission-1', missionTitle: 'Summer Coupon Push',
    creatorId: 'creator-1', status: 'submitted' as const, submittedAt: '2026-08-19T00:00:00Z',
    reviewDeadline: '2026-08-21T00:00:00Z', confidenceStatus: 'verified_signal' as const,
  }],
}

describe('MissionDetailView', () => {
  it('shows a travelpayouts-sourced mission (proving the analytics widening reaches here)', () => {
    render(<MissionDetailView t={t} locale="en" detail={detail} reviewAction={vi.fn()} />)
    expect(screen.getByText('Summer Coupon Push')).toBeTruthy()
  })

  it('shows a submitted row with live review actions', () => {
    render(<MissionDetailView t={t} locale="en" detail={detail} reviewAction={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: t.actApprove }).length).toBeGreaterThan(0)
  })

  it('calls reviewAction with approve when clicked', async () => {
    const reviewAction = vi.fn().mockResolvedValue({ ok: true, id: 's1' })
    render(<MissionDetailView t={t} locale="en" detail={detail} reviewAction={reviewAction} />)
    fireEvent.click(screen.getByRole('button', { name: t.actApprove }))
    expect(reviewAction).toHaveBeenCalledWith('en', 's1', 'approve', null, null)
  })

  it('shows a waiting-on-creator badge instead of buttons for a revision_requested row', () => {
    const revising = {
      ...detail,
      submissions: [{ ...detail.submissions[0], status: 'revision_requested' as const }],
    }
    render(<MissionDetailView t={t} locale="en" detail={revising} reviewAction={vi.fn()} />)
    expect(screen.getByText(t.waitingOnCreator)).toBeTruthy()
    expect(screen.queryByRole('button', { name: t.actApprove })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.MissionDetailView.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write `apps/web/components/kinnso/admin/missions/MissionDetailView.tsx`**

```typescript
'use client'
import { useState, useTransition } from 'react'
import type { MissionDetail, ReviewQueueRow } from '@/lib/admin/mission-review-queries'
import type { ReasonCategory, ReviewAction } from '@/lib/admin/mission-review-actions'
import type { ActionResult } from '@/lib/admin/result'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'

type T = Messages['missionsOps']
type ReviewFn = (
  locale: Locale, submissionId: string, action: ReviewAction,
  reasonCategory: ReasonCategory | null, reasonText: string | null,
) => Promise<ActionResult<{ id: string }>>

function SubmissionRow({ t, locale, row, reviewAction }: { t: T; locale: Locale; row: ReviewQueueRow; reviewAction: ReviewFn }) {
  const [modal, setModal] = useState<'reject' | 'request_revision' | null>(null)
  const [category, setCategory] = useState<ReasonCategory | ''>('')
  const [reasonText, setReasonText] = useState('')
  const [isPending, startTransition] = useTransition()

  const approve = () => startTransition(() => { void reviewAction(locale, row.submissionId, 'approve', null, null) })
  const submitModal = () => {
    if (!modal || !category) return
    startTransition(async () => {
      const res = await reviewAction(locale, row.submissionId, modal, category, reasonText.trim() || null)
      if (res.ok) { setModal(null); setCategory(''); setReasonText('') }
    })
  }

  if (row.status === 'revision_requested') {
    return (
      <tr className="border-b border-kinnso-line/60">
        <td className="py-2 font-bold text-kinnso-ink">{row.missionTitle}</td>
        <td className="py-2 text-kinnso-muted">{row.creatorId.slice(0, 8)}</td>
        <td className="py-2 text-kinnso-muted">{row.confidenceStatus ?? '—'}</td>
        <td className="py-2"><span className="rounded-full bg-kinnso-line/40 px-2 py-1 text-xs font-bold text-kinnso-muted">{t.waitingOnCreator}</span></td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-kinnso-line/60">
      <td className="py-2 font-bold text-kinnso-ink">{row.missionTitle}</td>
      <td className="py-2 text-kinnso-muted">{row.creatorId.slice(0, 8)}</td>
      <td className="py-2 text-kinnso-muted">{row.confidenceStatus ?? '—'}</td>
      <td className="py-2">
        <div className="flex flex-col gap-1">
          <button type="button" onClick={approve} disabled={isPending}
            className="rounded-md bg-kinnso-orange px-2 py-1 text-xs font-bold text-white disabled:opacity-50">{t.actApprove}</button>
          <button type="button" onClick={() => setModal('reject')} disabled={isPending}
            className="rounded-md border border-kinnso-line px-2 py-1 text-xs font-bold text-kinnso-ink">{t.actReject}</button>
          <button type="button" onClick={() => setModal('request_revision')} disabled={isPending}
            className="rounded-md border border-kinnso-line px-2 py-1 text-xs font-bold text-kinnso-ink">{t.actRequestRevision}</button>
        </div>
        {modal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
              <select value={category} onChange={(e) => setCategory(e.target.value as ReasonCategory)}
                className="mb-2 w-full rounded-md border border-kinnso-line p-2 text-sm">
                <option value="">{t.reasonCategoryPlaceholder}</option>
                <option value="format">{t.reasonFormat}</option>
                <option value="key_message">{t.reasonKeyMessage}</option>
                <option value="compliance">{t.reasonCompliance}</option>
                <option value="quality">{t.reasonQuality}</option>
                <option value="other">{t.reasonOther}</option>
              </select>
              <textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)}
                className="mb-2 w-full rounded-md border border-kinnso-line p-2 text-sm" rows={3} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(null)} className="rounded-md border border-kinnso-line px-3 py-1 text-sm font-bold">{t.actCancel}</button>
                <button type="button" onClick={submitModal} disabled={!category || isPending}
                  className="rounded-md bg-kinnso-orange px-3 py-1 text-sm font-bold text-white disabled:opacity-50">{t.actApply}</button>
              </div>
            </div>
          </div>
        )}
      </td>
    </tr>
  )
}

export function MissionDetailView({
  t, locale, detail, reviewAction,
}: { t: T; locale: Locale; detail: MissionDetail; reviewAction: ReviewFn }) {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-kinnso-ink">{detail.mission.title}</h1>
      <p className="mb-4 text-sm text-kinnso-muted">{detail.mission.missionSource} · {detail.mission.missionType} · {detail.mission.status}</p>
      <table className="w-full text-left text-sm">
        <thead className="text-kinnso-muted">
          <tr className="border-b border-kinnso-line">
            <th className="py-2 font-bold">{t.colMission}</th>
            <th className="py-2 font-bold">{t.colCreator}</th>
            <th className="py-2 font-bold">{t.colVerification}</th>
            <th className="py-2 font-bold">{t.colActions}</th>
          </tr>
        </thead>
        <tbody>
          {detail.submissions.map((row) => (
            <SubmissionRow key={row.submissionId} t={t} locale={locale} row={row} reviewAction={reviewAction} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default MissionDetailView
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/kinnso.MissionDetailView.test.tsx`
Expected: PASS — count the real `it()` blocks yourself.

- [ ] **Step 5: Write the failing host test**

```typescript
// apps/web/tests/admin.mission-detail.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { roleMock, getUserMock, detailMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  detailMock: vi.fn(async () => ({
    mission: { id: 'mission-1', title: 'Summer Coupon Push', missionSource: 'travelpayouts', missionType: 'coupon_affiliate', status: 'published' },
    participants: [], milestones: [], submissions: [],
  })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: async () => {
    const { data: { user } } = await getUserMock()
    return { user: user ? { id: user.id } : null, role: await roleMock(), merchantId: null }
  },
}))
vi.mock('@/lib/admin/mission-review-queries', () => ({ getMissionDetail: detailMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import MissionDetailPage from '@/app/[locale]/admin/missions/[missionId]/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }); detailMock.mockClear() })
afterEach(cleanup)

describe('/[locale]/admin/missions/[missionId] host', () => {
  it('renders the detail page for ops', async () => {
    const ui = await MissionDetailPage({ params: Promise.resolve({ locale: 'en', missionId: 'mission-1' }) })
    render(ui)
    expect(screen.getByText('Summer Coupon Push')).toBeTruthy()
    expect(detailMock).toHaveBeenCalledWith(expect.anything(), 'mission-1')
  })

  it('notFounds when the mission does not exist', async () => {
    detailMock.mockResolvedValueOnce(null)
    await expect(MissionDetailPage({ params: Promise.resolve({ locale: 'en', missionId: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('notFounds a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(MissionDetailPage({ params: Promise.resolve({ locale: 'en', missionId: 'mission-1' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/admin.mission-detail.host.test.tsx`
Expected: FAIL — the page doesn't exist.

- [ ] **Step 7: Write `apps/web/app/[locale]/admin/missions/[missionId]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getMissionDetail } from '@/lib/admin/mission-review-queries'
import { reviewSubmissionOpsAction } from '@/lib/admin/mission-review-actions'
import { MissionDetailView } from '@/components/kinnso/admin/missions/MissionDetailView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function MissionDetailPage({
  params,
}: { params: Promise<{ locale: string; missionId: string }> }) {
  const { locale, missionId } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const detail = await getMissionDetail(supabase, missionId)
  if (!detail) notFound()

  return (
    <MissionDetailView
      t={messages.missionsOps}
      locale={loc}
      detail={detail}
      reviewAction={reviewSubmissionOpsAction}
    />
  )
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/kinnso.MissionDetailView.test.tsx tests/admin.mission-detail.host.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add "apps/web/app/[locale]/admin/missions/[missionId]/page.tsx" apps/web/components/kinnso/admin/missions/MissionDetailView.tsx apps/web/tests/kinnso.MissionDetailView.test.tsx apps/web/tests/admin.mission-detail.host.test.tsx
git commit -m "feat(r11.0): add the ops mission detail page"
```

---

### Task 6: Review queue page

**Files:**
- Create: `apps/web/app/[locale]/admin/missions/review/page.tsx`
- Create: `apps/web/components/kinnso/admin/missions/MissionReviewQueueView.tsx`
- Test: `apps/web/tests/kinnso.MissionReviewQueueView.test.tsx`
- Test: `apps/web/tests/admin.mission-review-queue.host.test.tsx`

**Read first:** `apps/web/components/kinnso/admin/creators/CreatorPayoutsView.tsx` (already
read in full during planning) — this queue reuses its status-pill + table + modal shape almost
verbatim, substituting `SubmissionRow` from Task 5 for the per-row rendering (extract it to a
shared location if it's cleaner to import from `MissionDetailView.tsx` directly, since both
pages need identical row behavior — your call at implementation time, either works).

- [ ] **Step 1: Write the failing component test**

```typescript
// apps/web/tests/kinnso.MissionReviewQueueView.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { MissionReviewQueueView } from '@/components/kinnso/admin/missions/MissionReviewQueueView'

afterEach(cleanup)
const t = en.missionsOps

const rows = [
  { submissionId: 's1', missionId: 'm1', missionTitle: 'Summer Coupon Push', creatorId: 'creator-1', status: 'submitted' as const, submittedAt: '2026-08-19T00:00:00Z', reviewDeadline: '2026-08-21T00:00:00Z', confidenceStatus: 'verified_signal' as const },
  { submissionId: 's2', missionId: 'm2', missionTitle: 'HK Ramen Guide', creatorId: 'creator-2', status: 'revision_requested' as const, submittedAt: '2026-08-18T00:00:00Z', reviewDeadline: '2026-08-20T00:00:00Z', confidenceStatus: null },
]

describe('MissionReviewQueueView', () => {
  it('renders one row per queue item', () => {
    render(<MissionReviewQueueView t={t} locale="en" rows={rows} reviewAction={vi.fn()} />)
    expect(screen.getByText('Summer Coupon Push')).toBeTruthy()
    expect(screen.getByText('HK Ramen Guide')).toBeTruthy()
  })

  it('shows the empty state with no rows', () => {
    render(<MissionReviewQueueView t={t} locale="en" rows={[]} reviewAction={vi.fn()} />)
    expect(screen.getByText(t.queueEmpty)).toBeTruthy()
  })

  it('gives the revision_requested row a waiting badge, not action buttons', () => {
    render(<MissionReviewQueueView t={t} locale="en" rows={rows} reviewAction={vi.fn()} />)
    const revisionRow = screen.getByText('HK Ramen Guide').closest('tr')!
    expect(revisionRow.textContent).toContain(t.waitingOnCreator)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.MissionReviewQueueView.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write `apps/web/components/kinnso/admin/missions/MissionReviewQueueView.tsx`**

```typescript
'use client'
import type { ReviewQueueRow } from '@/lib/admin/mission-review-queries'
import type { ReasonCategory, ReviewAction } from '@/lib/admin/mission-review-actions'
import type { ActionResult } from '@/lib/admin/result'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import { SubmissionQueueRow } from './SubmissionQueueRow'

type T = Messages['missionsOps']
type ReviewFn = (
  locale: Locale, submissionId: string, action: ReviewAction,
  reasonCategory: ReasonCategory | null, reasonText: string | null,
) => Promise<ActionResult<{ id: string }>>

export function MissionReviewQueueView({
  t, locale, rows, reviewAction,
}: { t: T; locale: Locale; rows: ReviewQueueRow[]; reviewAction: ReviewFn }) {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-kinnso-ink">{t.queueTitle}</h1>
      <p className="mb-4 text-sm text-kinnso-muted">{t.queueSubtitle}</p>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-kinnso-muted">{t.queueEmpty}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-kinnso-muted">
            <tr className="border-b border-kinnso-line">
              <th className="py-2 font-bold">{t.colMission}</th>
              <th className="py-2 font-bold">{t.colCreator}</th>
              <th className="py-2 font-bold">{t.colVerification}</th>
              <th className="py-2 font-bold">{t.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <SubmissionQueueRow key={row.submissionId} t={t} locale={locale} row={row} reviewAction={reviewAction} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default MissionReviewQueueView
```

**Important refactor before this compiles:** `Task 5`'s `SubmissionRow` (defined inline inside
`MissionDetailView.tsx`) needs to move into its own file,
`apps/web/components/kinnso/admin/missions/SubmissionQueueRow.tsx`, exporting it as
`SubmissionQueueRow`, so both `MissionDetailView.tsx` and this new view can import the same
component instead of duplicating the row/modal logic. Do this extraction as part of this step:
move the `SubmissionRow` function verbatim into the new file (rename the export to
`SubmissionQueueRow`), update `MissionDetailView.tsx` to import it instead of defining it
locally, and re-run Task 5's `kinnso.MissionDetailView.test.tsx` to confirm the extraction
didn't change behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/kinnso.MissionReviewQueueView.test.tsx tests/kinnso.MissionDetailView.test.tsx`
Expected: PASS (both files) — the second confirms the `SubmissionRow` extraction didn't break Task 5.

- [ ] **Step 5: Write the failing host test**

```typescript
// apps/web/tests/admin.mission-review-queue.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { roleMock, getUserMock, queueMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  queueMock: vi.fn(async () => []),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: async () => {
    const { data: { user } } = await getUserMock()
    return { user: user ? { id: user.id } : null, role: await roleMock(), merchantId: null }
  },
}))
vi.mock('@/lib/admin/mission-review-queries', () => ({ getReviewQueue: queueMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import MissionReviewQueuePage from '@/app/[locale]/admin/missions/review/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }); queueMock.mockClear() })
afterEach(cleanup)

describe('/[locale]/admin/missions/review host', () => {
  it('renders the queue for ops', async () => {
    const ui = await MissionReviewQueuePage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(queueMock).toHaveBeenCalled()
  })

  it('notFounds a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(MissionReviewQueuePage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/admin.mission-review-queue.host.test.tsx`
Expected: FAIL — the page doesn't exist.

- [ ] **Step 7: Write `apps/web/app/[locale]/admin/missions/review/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getReviewQueue } from '@/lib/admin/mission-review-queries'
import { reviewSubmissionOpsAction } from '@/lib/admin/mission-review-actions'
import { MissionReviewQueueView } from '@/components/kinnso/admin/missions/MissionReviewQueueView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function MissionReviewQueuePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const rows = await getReviewQueue(supabase)

  return (
    <MissionReviewQueueView
      t={messages.missionsOps}
      locale={loc}
      rows={rows}
      reviewAction={reviewSubmissionOpsAction}
    />
  )
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/kinnso.MissionReviewQueueView.test.tsx tests/admin.mission-review-queue.host.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add "apps/web/app/[locale]/admin/missions/review/page.tsx" apps/web/components/kinnso/admin/missions/MissionReviewQueueView.tsx apps/web/components/kinnso/admin/missions/SubmissionQueueRow.tsx apps/web/components/kinnso/admin/missions/MissionDetailView.tsx apps/web/tests/kinnso.MissionReviewQueueView.test.tsx apps/web/tests/admin.mission-review-queue.host.test.tsx apps/web/tests/kinnso.MissionDetailView.test.tsx
git commit -m "feat(r11.0): add the review queue page, extract SubmissionQueueRow"
```

---

### Task 7: Link the KPI card, add a queue badge

**Files:**
- Modify: `apps/web/components/kinnso/admin/missions/MissionsOverviewView.tsx`
- Test: `apps/web/tests/kinnso.MissionsOverviewView.test.tsx` (check if it exists first — extend or create)

**Read first:** `apps/web/components/kinnso/admin/missions/MissionsOverviewView.tsx` in full
(already read during planning) — find the `KpiCard` rendering `kpiSubmissionsAwaitingReview`
and confirm its current exact JSX before editing.

- [ ] **Step 1: Write the failing test**

If `apps/web/tests/kinnso.MissionsOverviewView.test.tsx` exists, read it fully and add these
cases; otherwise create it fresh, matching the file's existing prop-shape conventions (read
`apps/web/app/[locale]/admin/missions/page.tsx`'s call site for the exact `overview` shape
`getMissionsOverview` returns before writing fixture data):

```typescript
  it('links the submissions-awaiting-review KPI card to the review queue', () => {
    render(<MissionsOverviewView t={t} locale="en" overview={overview} />)
    const link = screen.getByRole('link', { name: new RegExp(t.kpiSubmissionsAwaitingReview) })
    expect(link.getAttribute('href')).toBe('/en/admin/missions/review')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.MissionsOverviewView.test.tsx`
Expected: FAIL — the KPI card isn't a link yet.

- [ ] **Step 3: Edit `MissionsOverviewView.tsx`**

Find the `submissionsAwaitingReview` KPI card's current JSX (a plain `<div>`-based `KpiCard`,
per Task-planning research) and wrap it in a `<Link href={`/${locale}/admin/missions/review`}>`,
matching whatever `Link`-wrapping pattern this file (or a sibling like `CreatorPayoutsView.tsx`)
already uses elsewhere for clickable cards. Add `import Link from 'next/link'` if not already
imported.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/kinnso.MissionsOverviewView.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/admin/missions/MissionsOverviewView.tsx apps/web/tests/kinnso.MissionsOverviewView.test.tsx
git commit -m "feat(r11.0): link the awaiting-review KPI card to the review queue"
```

---

### Task 8: Locale keys across all 7 dictionaries

**Files:**
- Modify: `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts`
- Test: `apps/web/tests/i18n.locale-parity.test.ts` (verify only)

**BEFORE YOU START:** re-read `MissionDetailView.tsx`, `MissionReviewQueueView.tsx`, and
`SubmissionQueueRow.tsx` (all already committed by Tasks 5-6) to confirm the exact, final set
of `t.<key>` references — this is the authoritative source, not the list below.

- [ ] **Step 1: Add the new keys to `MissionsOpsMessages` in `en.ts`**

Extend the existing interface (do not create a new namespace — these all belong in the domain
`missionsOps` already covers):

```typescript
export interface MissionsOpsMessages {
  // ... existing keys unchanged ...
  colMission: string
  colCreator: string
  colVerification: string
  colActions: string
  queueTitle: string
  queueSubtitle: string
  queueEmpty: string
  waitingOnCreator: string
  actApprove: string
  actReject: string
  actRequestRevision: string
  actCancel: string
  actApply: string
  reasonCategoryPlaceholder: string
  reasonFormat: string
  reasonKeyMessage: string
  reasonCompliance: string
  reasonQuality: string
  reasonOther: string
}
```

- [ ] **Step 2: Add the English values**

```typescript
  colMission: 'Mission',
  colCreator: 'Creator',
  colVerification: 'Verification',
  colActions: 'Actions',
  queueTitle: 'Review queue',
  queueSubtitle: 'Submissions waiting on a decision, soonest deadline first.',
  queueEmpty: "Nothing to review — you're caught up.",
  waitingOnCreator: 'Waiting on creator',
  actApprove: 'Approve',
  actReject: 'Reject',
  actRequestRevision: 'Request revision',
  actCancel: 'Cancel',
  actApply: 'Apply',
  reasonCategoryPlaceholder: 'Reason category…',
  reasonFormat: 'Format',
  reasonKeyMessage: 'Key message',
  reasonCompliance: 'Compliance',
  reasonQuality: 'Quality',
  reasonOther: 'Other',
```

- [ ] **Step 3-8: Add the zh-hk, zh-tw, zh-cn, ja, ko, th values**

Follow the exact same key set for each locale, translating naturally. Example for zh-hk:

```typescript
  colMission: '任務',
  colCreator: '創作者',
  colVerification: '驗證',
  colActions: '操作',
  queueTitle: '審核隊列',
  queueSubtitle: '待決定的提交，最早截止的排在最前。',
  queueEmpty: '沒有待審核項目，你已全部處理完畢。',
  waitingOnCreator: '等待創作者',
  actApprove: '批准',
  actReject: '拒絕',
  actRequestRevision: '要求修改',
  actCancel: '取消',
  actApply: '確認',
  reasonCategoryPlaceholder: '選擇原因類別…',
  reasonFormat: '格式',
  reasonKeyMessage: '核心訊息',
  reasonCompliance: '合規',
  reasonQuality: '質素',
  reasonOther: '其他',
```

(Write equivalent natural translations for zh-tw, zh-cn, ja, ko, th — same key set, same
meaning, locale-appropriate phrasing. Do not copy English into a non-English locale file.)

- [ ] **Step 9: Run the parity test and typecheck**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts`
Expected: PASS.

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/i18n/messages/
git commit -m "i18n(r11.0): add review queue and detail page copy across all seven locales"
```

---

### Task 9: Live verification and full gate

**Files:**
- Create: `apps/web/tests/mission-review.rls.test.ts`
- No other files — this task runs the full gate and pushes/opens the PR.

**Read first:** `apps/web/tests/settlement-minting.rls.test.ts` for the exact structural
pattern this codebase's live proofs use (`@vitest-environment node`, `describe.skip` fallback,
hand-signed HS256 JWTs via `clientFor()`, `runPsql()` via `docker exec`, `beforeAll`/`afterAll`
with guarded cleanup deletes — this table has no immutability trigger, so normal cleanup
applies, unlike R10.2's payout-decisions ledger).

**IMPORTANT — read this before running anything locally:** running the full `npx vitest run`
suite requires the local Docker Supabase stack to be UP (many pre-existing tests beyond this
phase's own new files hit a real client and time out, not skip cleanly, if `.env.test` points
at a stopped stack) — do not stop the stack until AFTER Step 3's full gate has run, not before.

- [ ] **Step 1: Write the live proof test**

Cover, against a real local Postgres stack:

1. Seed a mission + milestone + participant + a `submitted` submission (service-role, fixed
   distinctive constants + `afterAll` cleanup — this table has no undeletability
   characteristic, verify against the actual migration before assuming, but Task 1's schema
   above already confirms `on delete cascade` throughout and no immutability trigger).
2. `admin_review_submission` as an ops caller with `action = 'approve'` → submission status
   becomes `approved`, a `mission_review_events` row exists with `actor_type = 'ops'`,
   `action = 'approve'`, and an `ops_audit_log` row exists for `entity_type =
   'mission_submission'`.
3. A second call on the same (now-`approved`) submission → `stale_status` error, no duplicate
   event row.
4. `action = 'reject'` with `p_reason_category = null` → `reason_required` error, rejected
   before any row changes.
5. A non-ops caller (a signed-in creator) calling `admin_review_submission` → `forbidden` /
   `42501`.
6. RLS on `mission_review_events`: the submission's own creator, the owning merchant, and an
   unrelated ops member can each read rows they're entitled to; an unrelated creator (not the
   submission's participant) gets zero rows back, not an error.
7. Insert a `mission_review_events` row directly (service-role, bypassing the RPC) with
   `action = 'reject'` and `reason_category = null` → the check constraint itself rejects it
   (proving the DB-level guarantee holds independent of the RPC's own validation).

- [ ] **Step 2: Apply migrations to the local stack and run the live proof twice**

Follow this program's established operational playbook (see project memory's
`kinnso-local-stack-port-shift-gotcha` and `kinnso-full-gate-needs-live-stack-gotcha` if you
have access to them, otherwise proceed as follows): shift `supabase/config.toml` ports by +100
to avoid the `adfocate-2` sibling-project collision (disable `[studio]`/`[inbucket]`/
`[analytics]`), `supabase start`, confirm `apps/web/.env.test` points at the shifted port, run
the live proof file twice consecutively confirming identical results both times. **Never** run
any command against the linked production project.

- [ ] **Step 3: Full gate — run this WHILE the local stack is still up**

```bash
pnpm typecheck
cd apps/web && pnpm lint
pnpm honesty:lint
cd apps/web && npx vitest run
```

Known baseline noise: if `main` doesn't yet have PR #112's jsdom/localStorage fix merged, three
files (`analytics.client`, `analytics.entity-view`, `kinnso.AnalyticsConsentBanner`) fail with
`TypeError: localStorage.clear is not a function` — confirm via `git log main --oneline | grep
-i localstorage` before treating any other failure as this same known baseline. Any DB-touching
test failing while the stack is confirmed up is a real regression, not baseline noise.

- [ ] **Step 4: Restore config, stop the stack**

```bash
git checkout -- supabase/config.toml
supabase stop
```

- [ ] **Step 5: Commit, check for stacked-branch risk, push, open the PR**

```bash
git add apps/web/tests/mission-review.rls.test.ts
git commit -m "test(r11.0): prove the admin_review_submission CAS/audit/reason-category guarantees on a live stack"
```

Before pushing, check whether `main` has moved since this branch was cut
(`git merge-base --is-ancestor origin/main HEAD`) — if it fails, this branch has gone stale
and needs the cherry-pick-onto-fresh-main treatment before pushing, not a direct push. If it
passes, push and open the PR: `git push -u origin docs/r11-0-mission-review-design` then
`gh pr create --repo YNWAforever/Remix-Kinnso`.

---

## Self-Review Notes (from the plan author, not a task for the implementer)

**Spec coverage:** every section of the design doc (including the amendment) has a
corresponding task — schema (1), RPC (2), widened analytics (3), TS layer + the merchant-action
event-log addition (4), detail page (5), queue page with the `revision_requested` read-only
treatment (6), KPI link (7), i18n (8), live proof + full gate (9).

**Known gap intentionally left to the implementer's judgment:** whether `SubmissionQueueRow`
lives in its own file (Task 6's approach) or stays duplicated — the plan picks "own file,
extracted during Task 6" to avoid the duplication, but flags the extraction explicitly as a
step rather than silently assuming it, since it touches Task 5's already-committed file.

**Verified against real code during research, not guessed:** every SQL fragment in Tasks 1-3
is either copied verbatim from an existing migration (Task 3) or modeled line-by-line on
`admin_set_settlement_status`'s actual shipped body (Task 2). The TypeScript layer's Supabase
nested-select syntax in Task 4 Step 5 is flagged as needing verification against a real
existing example before finalizing, since it wasn't independently confirmed during research —
this is the one piece of this plan closest to a placeholder, and the step says so explicitly
rather than presenting unverified syntax as certain.
