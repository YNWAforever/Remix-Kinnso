# Phase R11.1 — Verification-Gated Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the ops mission-review queue confidence-driven sort/badges and a re-run-verification action, an opt-in per-mission auto-approve policy for `verified_signal` proofs (zero human action required), and a small overdue-reviews attention feed — building directly on R11.0's queue, `admin_review_submission`, and `mission_review_events`.

**Architecture:** Three DB migrations (an RLS fix, the auto-approval trigger + setter RPC, and `admin_mission_attention()`), a scan-worker auth widening so ops can trigger re-verification on a submission they don't own, and UI wiring across the existing review queue, mission detail, and missions overview pages. No new pages.

**Tech Stack:** Next.js 16 App Router · Supabase (Postgres + RLS + PL/pgSQL triggers) · Vitest 4 · Hono (apps/scan)

---

## Spec deviations found while writing this plan

The approved spec (`docs/superpowers/specs/2026-08-20-phase-r11-1-verification-triage-design.md`) said the auto-approval trigger writes to `mission_review_events` **and** `ops_audit_log_append`, "as its own SECURITY DEFINER function since no human `auth.uid()` exists for a trigger-fired action." Reading `ops_audit_log_append`'s actual body (`supabase/migrations/20260628130000_ops_audit_log_and_creator_analytics.sql:34-54`) surfaced a second problem the spec's own reasoning already implies but didn't carry through: `ops_audit_log_append` **itself** resolves its actor via `select id from kinnso_ops_members where user_id = auth.uid()` and raises `forbidden` when that's null — auth.uid() is null in the trigger for the exact reason the spec gives for not reusing `admin_review_submission`. Worse, `ops_audit_log.actor_ops_member_id` is `not null references kinnso_ops_members(id)` — there is no row a system action could point to even if the call didn't raise. Task 2 below drops the `ops_audit_log_append` call from the trigger entirely; `mission_review_events` (whose `actor_type` already has a `'system'` value for exactly this case) is this action's complete audit trail on its own. This only affects the trigger — `admin_set_mission_auto_approve_policy` is a human-initiated RPC with a real `auth.uid()`, so it still calls `ops_audit_log_append` normally.

Second, and more load-bearing: the spec's Architecture section calls the queue's confidence sort/badges "a pure client/query change... No migration," but `getReviewQueue()` reads `mission_verification_jobs.confidence_status` via a plain nested PostgREST select run as the ops user's own session — not through a `SECURITY DEFINER` RPC — so it's fully subject to that table's RLS. Its only existing policy (`mission_verification_jobs_owner_select`, `supabase/migrations/20260619000002_mission_verification_jobs.sql:31-32`) scopes reads to `creator_id = auth.uid()`. An ops session has never been able to read this table directly; `admin_mission_analytics` only sees it because that RPC is itself `SECURITY DEFINER`. Without a fix, every row in the queue would show `confidenceStatus: null` for a real ops user against a live stack — exactly the data R11.1's headline feature depends on. Task 1 below adds the missing ops SELECT policy.

Third: widening `handleVerifySubmission` for ops needs to preserve two invariants the current code gets for free by having caller and owner always be the same person: the inserted job's `creator_id` (FK to `creators(id)`) and the per-creator rate limit must stay scoped to the submission's actual creator, not the ops caller (who mostly won't even have a `creators` row — the insert would violate the FK). Task 8 fixes this by threading the resolved owner id through the existing throttle/insert/ledger calls instead of the raw caller id.

None of these change the spec's product intent — they're what it takes to build exactly what was approved. Noting them here per the plan's own self-review discipline rather than silently deviating.

## File Structure

**New files:**
- `supabase/migrations/20260820090000_r11_1_mission_verification_jobs_ops_select.sql` — RLS fix
- `supabase/migrations/20260820090100_r11_1_auto_approve_policy.sql` — column + trigger + setter RPC
- `supabase/migrations/20260820090200_r11_1_admin_mission_attention.sql` — attention-feed RPC
- `apps/web/tests/db.mission-verification-jobs-ops-select.test.ts`
- `apps/web/tests/db.auto-approve-policy.test.ts`
- `apps/web/tests/db.admin-mission-attention.test.ts`
- `apps/web/components/kinnso/admin/missions/badges.tsx` — `ConfidenceBadge`
- `apps/web/tests/admin.mission-review-badges.test.tsx`

**Modified files:**
- `packages/db/types.ts` — `missions.auto_approve_policy`, two new Functions entries
- `apps/web/lib/admin/mission-review-queries.ts` — confidence-bucket sort, `autoApprovePolicy` on `MissionDetail`
- `apps/web/lib/admin/mission-review-actions.ts` — new `setMissionAutoApprovePolicyAction`
- `apps/web/components/kinnso/admin/missions/SubmissionQueueRow.tsx` — badge + re-run button
- `apps/web/components/kinnso/admin/missions/MissionDetailView.tsx` — policy toggle
- `apps/scan/src/verify-server.ts` — ops-widened `handleVerifySubmission`, owner-scoped throttle/insert
- `apps/scan/tests/verify-server.unit.test.ts` — new ops-path tests
- `apps/web/lib/admin/missions-queries.ts` — `getMissionAttention`
- `apps/web/components/kinnso/admin/missions/MissionsOverviewView.tsx` — overdue-reviews list
- `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` — new `missionsOps` keys
- `apps/web/tests/admin.mission-review-queries.test.ts`, `apps/web/tests/admin.mission-review-actions.test.ts`, `apps/web/tests/admin.mission-review-queue.host.test.tsx`, `apps/web/tests/admin.missions-overview.host.test.tsx` (or equivalent overview host test), `apps/web/tests/mission-review.rls.test.ts`

---

### Task 1: Fix ops read access to `mission_verification_jobs` (RLS)

**Files:**
- Create: `supabase/migrations/20260820090000_r11_1_mission_verification_jobs_ops_select.sql`
- Test: `apps/web/tests/db.mission-verification-jobs-ops-select.test.ts`

- [ ] **Step 1: Write the failing migration-text contract test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_1_mission_verification_jobs_ops_select.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.1 mission_verification_jobs ops SELECT policy', () => {
  it('applies after R11.0 migrations', () => {
    expect(matches[0] > '20260819090200').toBe(true)
  })

  it('adds a second permissive SELECT policy scoped to an active ops member', () => {
    expect(sql).toContain('create policy mission_verification_jobs_ops_select on public.mission_verification_jobs')
    expect(sql).toContain('for select')
    expect(sql).toContain('to authenticated')
    expect(sql).toContain('exists ( select 1 from public.kinnso_ops_members ops where ops.user_id = (select auth.uid()) and ops.status = \'active\' )')
  })

  it('does not touch or drop the existing owner policy', () => {
    expect(sql).not.toContain('drop policy')
    expect(sql).not.toContain('mission_verification_jobs_owner_select')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.mission-verification-jobs-ops-select.test.ts`
Expected: FAIL — no file matches `_r11_1_mission_verification_jobs_ops_select.sql`

- [ ] **Step 3: Write the migration**

```sql
-- R11.1 -- ops needs to read mission_verification_jobs.confidence_status directly. The
-- review queue's confidence badge (getReviewQueue in mission-review-queries.ts) is a plain
-- client-side nested select through PostgREST, not a SECURITY DEFINER RPC, so it is fully
-- subject to this table's own RLS. The table's only existing policy
-- (mission_verification_jobs_owner_select, from 20260619000002_mission_verification_jobs.sql)
-- scopes reads to `creator_id = auth.uid()` -- an ops session has never been able to see this
-- table at all outside a SECURITY DEFINER function like admin_mission_analytics. Discovered
-- while building R11.1's own queue confidence sort/badges, which depend on exactly this read
-- succeeding for a real ops session, not just a service-role one.
--
-- A second permissive SELECT policy ORs with the existing owner policy (Postgres RLS: any
-- matching permissive policy on a table grants access) -- this does not narrow or replace the
-- existing creator-owner read, and mirrors the third exists-branch of
-- mission_review_events_select (20260819090000_r11_0_mission_review_events.sql) exactly.
create policy mission_verification_jobs_ops_select on public.mission_verification_jobs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.mission-verification-jobs-ops-select.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260820090000_r11_1_mission_verification_jobs_ops_select.sql apps/web/tests/db.mission-verification-jobs-ops-select.test.ts
git commit -m "fix(r11.1): grant ops SELECT on mission_verification_jobs

The review queue's confidence badge reads this table through the ops user's
own session, not a SECURITY DEFINER RPC -- without this policy every row
would silently read back null for a real ops session."
```

---

### Task 2: Auto-approve policy column, trigger, and setter RPC

**Files:**
- Create: `supabase/migrations/20260820090100_r11_1_auto_approve_policy.sql`
- Test: `apps/web/tests/db.auto-approve-policy.test.ts`

- [ ] **Step 1: Write the failing migration-text contract test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_1_auto_approve_policy.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.1 auto_approve_policy column, trigger, and setter RPC', () => {
  it('adds the column, defaulted off, constrained to the two known values', () => {
    expect(sql).toContain('alter table public.missions')
    expect(sql).toContain("add column auto_approve_policy text not null default 'off' check (auto_approve_policy in ('off', 'verified_signal_only'))")
  })

  it('the trigger only fires on the transition into ready + verified_signal', () => {
    expect(sql).toContain("if new.status = 'ready' and new.confidence_status = 'verified_signal'")
    expect(sql).toContain('and (old.status, old.confidence_status) is distinct from (new.status, new.confidence_status) then')
  })

  it('the trigger is a SECURITY DEFINER function fired AFTER UPDATE on mission_verification_jobs', () => {
    expect(sql).toContain('create or replace function public.notify_verification_auto_approve() returns trigger')
    expect(sql).toContain('language plpgsql security definer set search_path = public')
    expect(sql).toContain('create trigger notify_verification_auto_approve_trg')
    expect(sql).toContain('after update on public.mission_verification_jobs')
  })

  it('never gates on is_active_ops_role -- there is no human caller in a trigger', () => {
    expect(sql).not.toContain('notify_verification_auto_approve() returns trigger\n  language plpgsql security definer set search_path = public as $$\n  is_active_ops')
    const fnStart = sql.indexOf('create or replace function public.notify_verification_auto_approve()')
    const fnEnd = sql.indexOf('create trigger notify_verification_auto_approve_trg')
    const fnBody = sql.slice(fnStart, fnEnd)
    expect(fnBody).not.toContain('is_active_ops')
  })

  it('only auto-approves when policy is verified_signal_only AND the submission is still submitted (CAS)', () => {
    expect(sql).toContain("if v_policy = 'verified_signal_only' and v_status = 'submitted' then")
    expect(sql).toContain("set status = 'approved', reviewed_at = now() where id = v_submission_id and status = 'submitted'")
  })

  it('writes a system-actor mission_review_events row, never touches ops_audit_log', () => {
    expect(sql).toContain("insert into public.mission_review_events (submission_id, actor_type, actor_id, action, reason_category, reason_text) values (v_submission_id, 'system', null, 'approve', null, null)")
    const fnStart = sql.indexOf('create or replace function public.notify_verification_auto_approve()')
    const fnEnd = sql.indexOf('create trigger notify_verification_auto_approve_trg')
    expect(sql.slice(fnStart, fnEnd)).not.toContain('ops_audit_log_append')
  })

  it('wraps both trigger side-effect writes so a failure there can never roll back the job status write', () => {
    const fnStart = sql.indexOf('create or replace function public.notify_verification_auto_approve()')
    const fnEnd = sql.indexOf('create trigger notify_verification_auto_approve_trg')
    const fnBody = sql.slice(fnStart, fnEnd)
    expect((fnBody.match(/exception when others then null/gu) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('admin_set_mission_auto_approve_policy gates on admin rank and validates the enum before any write', () => {
    expect(sql).toContain('create or replace function public.admin_set_mission_auto_approve_policy(p_mission_id uuid, p_policy text)')
    expect(sql).toContain("if not public.is_active_ops_role('admin') then raise exception 'forbidden' using errcode = '42501'; end if;")
    expect(sql).toContain("if p_policy not in ('off', 'verified_signal_only') then raise exception 'bad_policy'; end if;")
  })

  it('admin_set_mission_auto_approve_policy raises not_found on an unknown mission, and audits the change', () => {
    expect(sql).toContain('if not found then raise exception \'not_found\'; end if;')
    expect(sql).toContain("perform public.ops_audit_log_append('mission', p_mission_id, 'mission.auto_approve_policy', null, jsonb_build_object('policy', p_policy))")
  })

  it('revokes admin_set_mission_auto_approve_policy from public/anon, grants to authenticated', () => {
    expect(sql).toContain('revoke all on function public.admin_set_mission_auto_approve_policy(uuid, text) from public, anon')
    expect(sql).toContain('grant execute on function public.admin_set_mission_auto_approve_policy(uuid, text) to authenticated')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.auto-approve-policy.test.ts`
Expected: FAIL — no matching migration file

- [ ] **Step 3: Write the migration**

```sql
-- R11.1 -- opt-in per-mission auto-approval for submissions whose latest verification job
-- lands on the highest-confidence signal. Off by default: a mission never auto-approves
-- unless an ops admin explicitly turns it on via admin_set_mission_auto_approve_policy.
alter table public.missions
  add column auto_approve_policy text not null default 'off'
    check (auto_approve_policy in ('off', 'verified_signal_only'));

-- Fires only on the specific transition into status='ready', confidence_status='verified_signal'
-- -- the `is distinct from` guard stops it re-firing on an unrelated future update to an
-- already-verified-signal row.
--
-- A SEPARATE function from admin_review_submission, not a reuse of it: admin_review_submission
-- is hard-gated on is_active_ops_role('admin') with a human caller's auth.uid(), and this runs
-- from a trigger fired by the scan worker's service-role UPDATE -- there is no human auth.uid()
-- here, so that gate can never pass and must not be present.
--
-- Does NOT call ops_audit_log_append: that function resolves its actor via
-- `select id from kinnso_ops_members where user_id = auth.uid()` and raises 'forbidden' when it
-- finds none (20260628130000_ops_audit_log_and_creator_analytics.sql) -- auth.uid() is null
-- here for the same reason admin_review_submission can't be reused, so the call would raise and
-- be silently swallowed below, writing nothing. Unlike mission_review_events (whose actor_type
-- already has a 'system' value for exactly this case), ops_audit_log's own schema has no
-- representation for a non-ops actor (actor_ops_member_id is `not null references
-- kinnso_ops_members(id)`) -- there is no row to point it at. mission_review_events is this
-- action's complete audit trail on its own.
create or replace function public.notify_verification_auto_approve() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_submission_id uuid;
  v_policy        text;
  v_status        text;
begin
  if new.status = 'ready' and new.confidence_status = 'verified_signal'
     and (old.status, old.confidence_status) is distinct from (new.status, new.confidence_status) then

    v_submission_id := new.mission_milestone_submission_id;

    select mi.auto_approve_policy, sub.status
      into v_policy, v_status
    from public.mission_milestone_submissions sub
    join public.mission_participants participant on participant.id = sub.mission_participant_id
    join public.missions mi on mi.id = participant.mission_id
    where sub.id = v_submission_id;

    if v_policy = 'verified_signal_only' and v_status = 'submitted' then
      begin
        update public.mission_milestone_submissions
          set status = 'approved', reviewed_at = now()
          where id = v_submission_id and status = 'submitted';
      exception when others then null;
      end;

      begin
        insert into public.mission_review_events (submission_id, actor_type, actor_id, action, reason_category, reason_text)
          values (v_submission_id, 'system', null, 'approve', null, null);
      exception when others then null;
      end;
    end if;
  end if;

  return new;
end;
$$;

create trigger notify_verification_auto_approve_trg
  after update on public.mission_verification_jobs
  for each row execute function public.notify_verification_auto_approve();

-- Small ops-gated setter -- validates the enum up front (raising a clean `bad_policy`
-- exception) rather than relying on the column's own check constraint to surface a raw
-- Postgres error, matching the same class of guard admin_review_submission's
-- bad_reason_category check added in R11.0.
create or replace function public.admin_set_mission_auto_approve_policy(p_mission_id uuid, p_policy text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_policy not in ('off', 'verified_signal_only') then
    raise exception 'bad_policy';
  end if;

  update public.missions set auto_approve_policy = p_policy, updated_at = now() where id = p_mission_id;
  if not found then
    raise exception 'not_found';
  end if;

  perform public.ops_audit_log_append('mission', p_mission_id, 'mission.auto_approve_policy', null,
    jsonb_build_object('policy', p_policy));
end;
$$;

revoke all on function public.admin_set_mission_auto_approve_policy(uuid, text) from public, anon;
grant execute on function public.admin_set_mission_auto_approve_policy(uuid, text) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.auto-approve-policy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260820090100_r11_1_auto_approve_policy.sql apps/web/tests/db.auto-approve-policy.test.ts
git commit -m "feat(db): add mission auto-approve policy, trigger, and setter RPC"
```

---

### Task 3: `admin_mission_attention()` RPC

**Files:**
- Create: `supabase/migrations/20260820090200_r11_1_admin_mission_attention.sql`
- Test: `apps/web/tests/db.admin-mission-attention.test.ts`

- [ ] **Step 1: Write the failing migration-text contract test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_1_admin_mission_attention.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.1 admin_mission_attention RPC', () => {
  it('is a stable SECURITY DEFINER function gated on is_active_ops', () => {
    expect(sql).toContain('create or replace function public.admin_mission_attention()')
    expect(sql).toContain('returns jsonb')
    expect(sql).toContain('language plpgsql stable security definer set search_path = public')
    expect(sql).toContain("if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;")
  })

  it('overdue_reviews selects submitted rows past their review_deadline, oldest first, capped at 50', () => {
    expect(sql).toContain("where sub.status = 'submitted' and sub.review_deadline < now()")
    expect(sql).toContain('order by sub.review_deadline asc')
    expect(sql).toContain('limit 50')
  })

  it('at_risk_missions reuses the same three-reason heuristic as admin_mission_analytics', () => {
    expect(sql).toContain("then 'verification_failed'")
    expect(sql).toContain("then 'stalled_submissions'")
    expect(sql).toContain("else 'published_no_participants'")
    expect(sql).toContain('limit 20')
  })

  it('revokes from public/anon, grants execute to authenticated', () => {
    expect(sql).toContain('revoke all on function public.admin_mission_attention() from public, anon')
    expect(sql).toContain('grant execute on function public.admin_mission_attention() to authenticated')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.admin-mission-attention.test.ts`
Expected: FAIL — no matching migration file

- [ ] **Step 3: Write the migration**

```sql
-- R11.1 -- lightweight ops attention feed: overdue reviews (past review_deadline) and
-- at-risk missions (admin_mission_analytics' own at_risk heuristic, reused verbatim rather
-- than factored into a shared helper -- two independent read-only RPCs computing the same
-- 20-row-capped subquery is a fine trade against introducing a new shared function only
-- these two would ever call). "Rising creators", the roadmap's third bucket, is deliberately
-- omitted -- see the R11.1 design doc's Deviation #1 (no definition exists to build against).
create or replace function public.admin_mission_attention()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'overdue_reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'submission_id', r.submission_id, 'mission_id', r.mission_id, 'mission_title', r.mission_title,
        'creator_id', r.creator_id, 'review_deadline', r.review_deadline) order by r.review_deadline asc)
      from (
        select sub.id as submission_id, mi.id as mission_id, mi.title as mission_title,
          participant.creator_id, sub.review_deadline
        from public.mission_milestone_submissions sub
        join public.mission_participants participant on participant.id = sub.mission_participant_id
        join public.missions mi on mi.id = participant.mission_id
        where sub.status = 'submitted' and sub.review_deadline < now()
        order by sub.review_deadline asc
        limit 50
      ) r
    ), '[]'::jsonb),
    'at_risk_missions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'merchant_name', r.merchant_name, 'reason', r.reason))
      from (
        select mi.id, mi.title, mp.company_name as merchant_name,
          case
            when exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and (
                  select vj.status from public.mission_verification_jobs vj
                  where vj.mission_milestone_submission_id = sub.id
                  order by vj.created_at desc limit 1
                ) = 'failed'
            ) then 'verification_failed'
            when exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and sub.status = 'submitted'
                and sub.submitted_at < now() - interval '7 days'
            ) then 'stalled_submissions'
            else 'published_no_participants'
          end as reason
        from public.missions mi
        join public.merchant_profiles mp on mp.id = mi.merchant_profile_id
        where (
            exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and (
                  select vj.status from public.mission_verification_jobs vj
                  where vj.mission_milestone_submission_id = sub.id
                  order by vj.created_at desc limit 1
                ) = 'failed'
            )
            or exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and sub.status = 'submitted'
                and sub.submitted_at < now() - interval '7 days'
            )
            or (
              mi.status = 'published' and mi.visibility = 'open'
              and mi.published_at < now() - interval '14 days'
              and not exists (
                select 1 from public.mission_participants part where part.mission_id = mi.id
              )
            )
          )
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_mission_attention() from public, anon;
grant execute on function public.admin_mission_attention() to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.admin-mission-attention.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260820090200_r11_1_admin_mission_attention.sql apps/web/tests/db.admin-mission-attention.test.ts
git commit -m "feat(db): add admin_mission_attention RPC (overdue reviews + at-risk missions)"
```

---

### Task 4: Hand-add `packages/db/types.ts` entries

No `pnpm --filter @kinnso/db gen` — it reads production. Hand-add types matching the migrations above exactly.

**Files:**
- Modify: `packages/db/types.ts:2232-2258` (missions Row/Insert/Update), `packages/db/types.ts:2909` (Functions, alphabetical)

- [ ] **Step 1: Add `auto_approve_policy` to the `missions` table type**

In the `missions` block's `Row` (`packages/db/types.ts:2232`), add one line inside the alphabetically-sorted field list, right after `application_instructions`:

```typescript
          application_instructions: string | null
          auto_approve_policy: string
          coupon_code: string | null
```

In `Insert` (`packages/db/types.ts:2262`), same position, optional (has a DB default):

```typescript
          application_instructions?: string | null
          auto_approve_policy?: string
          coupon_code?: string | null
```

In `Update` (`packages/db/types.ts:2289`), same position, optional:

```typescript
          application_instructions?: string | null
          auto_approve_policy?: string
          coupon_code?: string | null
```

- [ ] **Step 2: Add the two new Functions entries**

In the `Functions` block, insert `admin_mission_attention` alphabetically right before `admin_mission_analytics`'s neighbor `admin_overview_counts` (`packages/db/types.ts:2909-2910`):

```typescript
      admin_mission_analytics: { Args: { p_days?: number }; Returns: Json }
      admin_mission_attention: { Args: never; Returns: Json }
      admin_overview_counts: {
```

Insert `admin_set_mission_auto_approve_policy` alphabetically near the other `admin_set_*`/`admin_reject_*` entries — find `admin_reject_merchant_application` (`packages/db/types.ts:2929-2932`) and add right after it:

```typescript
      admin_reject_merchant_application: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      admin_set_mission_auto_approve_policy: {
        Args: { p_mission_id: string; p_policy: string }
        Returns: undefined
      }
      admin_revoke_ops_invite: {
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors from `packages/db/types.ts`

- [ ] **Step 4: Commit**

```bash
git add packages/db/types.ts
git commit -m "chore(db): hand-add R11.1 types (auto_approve_policy, admin_mission_attention, admin_set_mission_auto_approve_policy)

pnpm --filter @kinnso/db gen reads production -- see db-gen-linked-production-gotcha."
```

---

### Task 5: Confidence-bucket sort in the review queue

**Files:**
- Modify: `apps/web/lib/admin/mission-review-queries.ts`
- Test: `apps/web/tests/admin.mission-review-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/tests/admin.mission-review-queries.test.ts`, inside the `describe('getReviewQueue', ...)` block:

```typescript
  it('sorts by confidence bucket first (verified_signal, needs_review, then unavailable/null), deadline as the tiebreak within a bucket', async () => {
    const rows = [
      { id: 'a', status: 'submitted', submitted_at: '2026-08-15T00:00:00Z', review_deadline: '2026-08-17T00:00:00Z',
        mission_participants: { id: 'p1', creator_id: 'c1', mission_id: 'm1', missions: { id: 'm1', title: 'Unavailable, earlier deadline' } },
        mission_verification_jobs: [] },
      { id: 'b', status: 'submitted', submitted_at: '2026-08-15T00:00:00Z', review_deadline: '2026-08-18T00:00:00Z',
        mission_participants: { id: 'p2', creator_id: 'c2', mission_id: 'm2', missions: { id: 'm2', title: 'Verified, later deadline' } },
        mission_verification_jobs: [{ confidence_status: 'verified_signal', created_at: '2026-08-15T01:00:00Z' }] },
      { id: 'c', status: 'submitted', submitted_at: '2026-08-15T00:00:00Z', review_deadline: '2026-08-16T00:00:00Z',
        mission_participants: { id: 'p3', creator_id: 'c3', mission_id: 'm3', missions: { id: 'm3', title: 'Needs review, earliest deadline' } },
        mission_verification_jobs: [{ confidence_status: 'needs_review', created_at: '2026-08-15T01:00:00Z' }] },
    ]
    const supabase = fakeClient({ mission_milestone_submissions: { data: rows, error: null } })
    const result = await getReviewQueue(supabase)
    // verified_signal first regardless of its later deadline, then needs_review, then unavailable --
    // NOT deadline order (which would put c, a, b).
    expect(result.map((r) => r.submissionId)).toEqual(['b', 'c', 'a'])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/admin.mission-review-queries.test.ts`
Expected: FAIL — current order is deadline-only (`a, c, b`)

- [ ] **Step 3: Implement the sort**

In `apps/web/lib/admin/mission-review-queries.ts`, add a bucket-rank helper right after `latestConfidenceStatus` (`apps/web/lib/admin/mission-review-queries.ts:84`):

```typescript
const CONFIDENCE_BUCKET_RANK: Record<string, number> = { verified_signal: 0, needs_review: 1 }
const confidenceBucketRank = (status: string | null): number => CONFIDENCE_BUCKET_RANK[status ?? ''] ?? 2
```

Then change `getReviewQueue` (`apps/web/lib/admin/mission-review-queries.ts:107-115`) to sort the mapped rows by bucket after the DB-level deadline order, relying on `Array.prototype.sort`'s stability to preserve the deadline tiebreak within each bucket:

```typescript
export async function getReviewQueue(supabase: Client): Promise<ReviewQueueRow[]> {
  const { data, error } = await supabase
    .from('mission_milestone_submissions')
    .select(reviewQueueSelect)
    .in('status', ['submitted', 'revision_requested'])
    .order('review_deadline', { ascending: true })
  if (error) throw error
  const rows = ((data ?? []) as unknown as ReviewQueueJoinRow[]).map(toReviewQueueRow)
  // Stable sort: rows already arrive deadline-ascending from the query above, so this only
  // reorders BETWEEN buckets and never disturbs the deadline order WITHIN one.
  return rows.sort((a, b) => confidenceBucketRank(a.confidenceStatus) - confidenceBucketRank(b.confidenceStatus))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/admin.mission-review-queries.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/mission-review-queries.ts apps/web/tests/admin.mission-review-queries.test.ts
git commit -m "feat(web): sort the review queue by confidence bucket, deadline as tiebreak"
```

---

### Task 6: Confidence badge + re-run verification action

**Files:**
- Create: `apps/web/components/kinnso/admin/missions/badges.tsx`
- Modify: `apps/web/components/kinnso/admin/missions/SubmissionQueueRow.tsx`
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface + object)
- Create: `apps/web/tests/admin.mission-review-badges.test.tsx`
- Modify: `apps/web/tests/admin.mission-review-queue.host.test.tsx` (or a new SubmissionQueueRow-focused test — see Step 4)

- [ ] **Step 1: Add the new i18n keys to `en.ts` (interface + English copy)**

In the `MissionsOpsMessages` interface (`apps/web/lib/i18n/messages/en.ts:1-40`), add after `viewQueue: string`:

```typescript
  viewQueue: string
  confidenceVerified: string
  confidenceNeedsReview: string
  confidenceUnavailable: string
  actRerunVerification: string
  rerunQueued: string
  rerunFailed: string
}
```

In the `missionsOps` object (`apps/web/lib/i18n/messages/en.ts:2544-2584`), add after `viewQueue: 'View queue',`:

```typescript
    viewQueue: 'View queue',
    confidenceVerified: 'Verified',
    confidenceNeedsReview: 'Needs review',
    confidenceUnavailable: 'Unavailable',
    actRerunVerification: 'Re-run verification',
    rerunQueued: 'Verification re-queued — check back in a moment.',
    rerunFailed: 'Could not start verification. Please try again.',
  },
```

(The other 6 locale files are updated together in Task 10, matching the R11.0 Task 8 precedent — `i18n.locale-parity.test.ts` only enforces key presence, and this project's convention is that pending translations across a feature are expected until that dedicated task lands.)

- [ ] **Step 2: Write the failing badge component test**

```typescript
// apps/web/tests/admin.mission-review-badges.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfidenceBadge } from '@/components/kinnso/admin/missions/badges'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const t = en.missionsOps

describe('ConfidenceBadge', () => {
  it('renders the Verified label for verified_signal', () => {
    render(<ConfidenceBadge status="verified_signal" t={t} />)
    expect(screen.getByText('Verified')).toBeTruthy()
  })
  it('renders the Needs review label for needs_review', () => {
    render(<ConfidenceBadge status="needs_review" t={t} />)
    expect(screen.getByText('Needs review')).toBeTruthy()
  })
  it('renders the Unavailable label for null (no verification job yet)', () => {
    render(<ConfidenceBadge status={null} t={t} />)
    expect(screen.getByText('Unavailable')).toBeTruthy()
  })
})
```

Run: `cd apps/web && npx vitest run tests/admin.mission-review-badges.test.tsx`
Expected: FAIL — `@/components/kinnso/admin/missions/badges` does not exist yet

- [ ] **Step 3: Create the badge component**

Model directly on `apps/web/components/kinnso/admin/merchants/badges.tsx`'s `pill` + style-map + label-map pattern:

```typescript
// apps/web/components/kinnso/admin/missions/badges.tsx
import type { Messages } from '@/lib/i18n/messages/en'

type T = Messages['missionsOps']

const CONFIDENCE_STYLE: Record<string, string> = {
  verified_signal: 'bg-emerald-100 text-emerald-800',
  needs_review: 'bg-amber-100 text-amber-800',
}

const CONFIDENCE_LABEL = (t: T): Record<string, string> => ({
  verified_signal: t.confidenceVerified,
  needs_review: t.confidenceNeedsReview,
})

const pill = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold'

/** status is mission_verification_jobs.confidence_status -- 'verified_signal' | 'needs_review' |
 * 'unavailable' | null (no verification job has run yet). 'unavailable' and null share one
 * label/style: both mean "ops cannot rely on this without a closer look." */
export function ConfidenceBadge({ status, t }: { status: string | null; t: T }) {
  const key = status ?? ''
  return (
    <span className={`${pill} ${CONFIDENCE_STYLE[key] ?? 'bg-slate-100 text-slate-600'}`}>
      {CONFIDENCE_LABEL(t)[key] ?? t.confidenceUnavailable}
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/admin.mission-review-badges.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire the badge and a re-run-verification button into `SubmissionQueueRow`**

In `apps/web/components/kinnso/admin/missions/SubmissionQueueRow.tsx`, add the import and a small local component, then replace the plain confidence cell.

Add imports (top of file, after existing imports at line 7):

```typescript
import { ConfidenceBadge } from '@/components/kinnso/admin/missions/badges'
import { startVerification } from '@/lib/missions/verify-client'
```

Add a local component right before `export function SubmissionQueueRow` (i.e. after the `PendingKind` type at line 28):

```typescript
/** Fires the scan worker's existing POST /verify-submission with the ops caller's OWN
 * session token (apps/scan's handleVerifySubmission now accepts an active ops caller for a
 * submission it doesn't own -- see Task 8). No polling/live-update here by design: this only
 * re-queues the job, the row's badge reflects the new result on the next page load. */
function RerunVerificationButton({ submissionId, t }: { submissionId: string; t: T }) {
  const [state, setState] = useState<'idle' | 'pending' | 'queued' | 'error'>('idle')
  const rerun = () => {
    setState('pending')
    void startVerification(submissionId).then((res) => setState('jobId' in res ? 'queued' : 'error'))
  }
  if (state === 'queued') return <p className="mt-1 text-xs text-kinnso-muted">{t.rerunQueued}</p>
  if (state === 'error') return <p className="mt-1 text-xs text-red-600">{t.rerunFailed}</p>
  return (
    <button
      type="button"
      onClick={rerun}
      disabled={state === 'pending'}
      className="mt-1 rounded-md border border-kinnso-line px-2 py-0.5 text-xs font-bold text-kinnso-ink disabled:opacity-50"
    >
      {t.actRerunVerification}
    </button>
  )
}
```

Replace the verification cell (`apps/web/components/kinnso/admin/missions/SubmissionQueueRow.tsx:105`):

```typescript
        <td className="py-2 text-kinnso-muted">{row.confidenceStatus ?? '—'}</td>
```

with:

```typescript
        <td className="py-2">
          <ConfidenceBadge status={row.confidenceStatus} t={t} />
          {row.status === 'submitted' && row.confidenceStatus !== 'verified_signal' && (
            <RerunVerificationButton submissionId={row.submissionId} t={t} />
          )}
        </td>
```

(Gated on `row.status === 'submitted'`, matching the same condition the actions cell already uses below -- a `revision_requested` row is read-only by design, per R11.0's decision that it isn't yet re-decidable until the creator resubmits, and re-running verification on it would act on proof URLs the creator may be about to change anyway.)

- [ ] **Step 6: Write the failing SubmissionQueueRow test**

Append to `apps/web/tests/admin.mission-review-queue.host.test.tsx` (host test for the queue page — good enough coverage since `SubmissionQueueRow` renders inside it; the fixture `queueMock` already returns a row with `confidenceStatus: 'verified_signal'`):

```typescript
  it('renders a confidence badge and hides the re-run button for a verified_signal row', async () => {
    const ui = await MissionReviewQueuePage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Verified')).toBeTruthy()
    expect(screen.queryByText('Re-run verification')).toBeNull()
  })

  it('shows the re-run button for a needs_review row', async () => {
    queueMock.mockResolvedValueOnce([{
      submissionId: 's2', missionId: 'mission-2', missionTitle: 'Autumn Push',
      creatorId: 'creator-2', status: 'submitted' as const, submittedAt: '2026-08-19T00:00:00Z',
      reviewDeadline: '2026-08-21T00:00:00Z', confidenceStatus: 'needs_review' as const,
    }])
    const ui = await MissionReviewQueuePage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Needs review')).toBeTruthy()
    expect(screen.getByText('Re-run verification')).toBeTruthy()
  })
```

Run: `cd apps/web && npx vitest run tests/admin.mission-review-queue.host.test.tsx`
Expected: FAIL until Step 5's edit lands, then PASS

- [ ] **Step 7: Run the full affected test set**

Also run `kinnso.MissionReviewQueueView.test.tsx` here even though it wasn't edited — it renders `SubmissionQueueRow` directly with its own fixtures (one `verified_signal`/`submitted` row, one `null`-confidence/`revision_requested` row) and does a raw `row.querySelector('button')!` to find the Approve button, which would silently pick up a stray `RerunVerificationButton` instead if the `row.status === 'submitted'` gate above were ever missing.

Run: `cd apps/web && npx vitest run tests/admin.mission-review-badges.test.tsx tests/admin.mission-review-queue.host.test.tsx tests/kinnso.MissionReviewQueueView.test.tsx`
Expected: PASS, with no edits needed to `kinnso.MissionReviewQueueView.test.tsx` itself

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/kinnso/admin/missions/badges.tsx apps/web/components/kinnso/admin/missions/SubmissionQueueRow.tsx apps/web/lib/i18n/messages/en.ts apps/web/tests/admin.mission-review-badges.test.tsx apps/web/tests/admin.mission-review-queue.host.test.tsx
git commit -m "feat(web): confidence badge and re-run-verification action on the review queue"
```

---

### Task 7: Auto-approve policy toggle on the mission detail page

**Files:**
- Modify: `apps/web/lib/admin/mission-review-queries.ts` (add `autoApprovePolicy` to `MissionDetail`)
- Modify: `apps/web/lib/admin/mission-review-actions.ts` (new action)
- Modify: `apps/web/components/kinnso/admin/missions/MissionDetailView.tsx`
- Modify: `apps/web/app/[locale]/admin/missions/[missionId]/page.tsx`
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/tests/admin.mission-review-queries.test.ts`, `apps/web/tests/admin.mission-review-actions.test.ts`

- [ ] **Step 1: Write the failing query test**

Add to `apps/web/tests/admin.mission-review-queries.test.ts`, inside `describe('getMissionDetail', ...)`:

```typescript
  it('includes autoApprovePolicy on the mission', async () => {
    const supabase = fakeClient({
      missions: {
        data: { id: 'm1', title: 'Mission One', status: 'published', mission_type: 'hybrid', mission_source: 'merchant', merchant_profile_id: 'merchant-1', auto_approve_policy: 'verified_signal_only' },
        error: null,
      },
      mission_participants: { data: [], error: null },
      mission_milestones: { data: [], error: null },
      mission_milestone_submissions: { data: [], error: null },
    })
    const detail = await getMissionDetail(supabase, 'm1')
    expect(detail?.mission.autoApprovePolicy).toBe('verified_signal_only')
  })
```

Run: `cd apps/web && npx vitest run tests/admin.mission-review-queries.test.ts`
Expected: FAIL — `autoApprovePolicy` undefined

- [ ] **Step 2: Add the field**

In `apps/web/lib/admin/mission-review-queries.ts`, add to the `MissionDetail.mission` interface (`apps/web/lib/admin/mission-review-queries.ts:35-42`):

```typescript
  mission: {
    id: string
    title: string
    status: string
    missionType: string
    missionSource: string
    merchantProfileId: string | null
    autoApprovePolicy: string
  }
```

Widen the mission select and mapping in `getMissionDetail` (`apps/web/lib/admin/mission-review-queries.ts:124-154`):

```typescript
  const { data: mission, error: missionError } = await supabase
    .from('missions')
    .select('id,title,status,mission_type,mission_source,merchant_profile_id,auto_approve_policy')
    .eq('id', missionId)
    .maybeSingle()
```

```typescript
    mission: {
      id: mission.id,
      title: mission.title,
      status: mission.status,
      missionType: mission.mission_type,
      missionSource: mission.mission_source,
      merchantProfileId: mission.merchant_profile_id,
      autoApprovePolicy: mission.auto_approve_policy,
    },
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/admin.mission-review-queries.test.ts`
Expected: PASS

- [ ] **Step 4: Add i18n keys**

In `MissionsOpsMessages` (`apps/web/lib/i18n/messages/en.ts`), add after the `rerunFailed` key from Task 6:

```typescript
  rerunFailed: string
  autoApprovePolicyLabel: string
  autoApprovePolicyOff: string
  autoApprovePolicyOn: string
  autoApprovePolicySaved: string
  autoApprovePolicyError: string
}
```

In the `missionsOps` object, after `rerunFailed`:

```typescript
    rerunFailed: 'Could not start verification. Please try again.',
    autoApprovePolicyLabel: 'Auto-approve verified submissions',
    autoApprovePolicyOff: 'Off',
    autoApprovePolicyOn: 'On — verified signal only',
    autoApprovePolicySaved: 'Saved.',
    autoApprovePolicyError: 'Could not update the policy. Please try again.',
  },
```

- [ ] **Step 5: Write the failing action test**

Add to `apps/web/tests/admin.mission-review-actions.test.ts` (mirror the file's existing mocking pattern for `reviewSubmissionOpsAction` — read the top of that file first to match its exact `vi.mock` setup for `requireOpsAction`/`createSupabaseServerClient`/`revalidatePath` before writing this):

```typescript
describe('setMissionAutoApprovePolicyAction', () => {
  it('calls admin_set_mission_auto_approve_policy and revalidates the mission detail page', async () => {
    const result = await setMissionAutoApprovePolicyAction('en', 'mission-1', 'verified_signal_only')
    expect(result.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('admin_set_mission_auto_approve_policy', {
      p_mission_id: 'mission-1', p_policy: 'verified_signal_only',
    })
  })

  it('maps a bad_policy error to friendly copy', async () => {
    rpcMock.mockResolvedValueOnce({ error: { message: 'bad_policy' } })
    const result = await setMissionAutoApprovePolicyAction('en', 'mission-1', 'not_a_real_policy')
    expect(result.ok).toBe(false)
  })
})
```

Run: `cd apps/web && npx vitest run tests/admin.mission-review-actions.test.ts`
Expected: FAIL — `setMissionAutoApprovePolicyAction` not exported

- [ ] **Step 6: Add the action**

In `apps/web/lib/admin/mission-review-actions.ts`, add `bad_policy`/`not_found` to `FRIENDLY` (`apps/web/lib/admin/mission-review-actions.ts:12-19`):

```typescript
const FRIENDLY: Record<string, string> = {
  forbidden: 'Active ops access is required.',
  bad_action: 'Invalid review action.',
  reason_required: 'A reason category is required for this action.',
  bad_reason_category: 'Invalid reason category.',
  not_found: 'That mission or submission no longer exists. Refresh and try again.',
  stale_status: 'This submission has already been reviewed. Refresh and try again.',
  bad_policy: 'Invalid auto-approve policy.',
}
```

Append the new action at the end of the file:

```typescript
/**
 * Ops-only setter for a mission's auto_approve_policy, via the audited
 * admin_set_mission_auto_approve_policy RPC. Revalidates only the mission detail page --
 * this never shows up in the review queue itself.
 */
export async function setMissionAutoApprovePolicyAction(
  locale: Locale,
  missionId: string,
  policy: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  const { error } = await supabase.rpc('admin_set_mission_auto_approve_policy', {
    p_mission_id: missionId,
    p_policy: policy,
  })
  if (error) {
    console.error('[admin:missions] setMissionAutoApprovePolicyAction failed', error)
    return formError(mapError(error.message, 'Could not update the policy'))
  }
  revalidatePath(missionDetailPath(locale, missionId))
  return { ok: true, id: missionId }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/admin.mission-review-actions.test.ts`
Expected: PASS

- [ ] **Step 8: Add the UI toggle to `MissionDetailView`**

In `apps/web/components/kinnso/admin/missions/MissionDetailView.tsx`, add a `'use client'` directive (the toggle needs local pending/saved state) and the select. Full replacement of the file:

```typescript
'use client'
import { useState, useTransition } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { MissionDetail } from '@/lib/admin/mission-review-queries'
import type { ActionResult } from '@/lib/admin/result'
import type { SubmissionReviewAction } from '@/lib/missions/types'
import { SubmissionQueueRow } from '@/components/kinnso/admin/missions/SubmissionQueueRow'

type T = Messages['missionsOps']
type ReviewActionFn = (
  locale: Locale,
  submissionId: string,
  action: SubmissionReviewAction,
  reasonCategory: string | null,
  reasonText: string | null,
  missionId: string | null,
) => Promise<ActionResult<{ id: string }>>
type PolicyActionFn = (locale: Locale, missionId: string, policy: string) => Promise<ActionResult<{ id: string }>>

function AutoApprovePolicyToggle({
  t, locale, missionId, initialPolicy, policyAction,
}: {
  t: T
  locale: Locale
  missionId: string
  initialPolicy: string
  policyAction: PolicyActionFn
}) {
  const [policy, setPolicy] = useState(initialPolicy)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [isPending, startTransition] = useTransition()

  const onChange = (next: string) => {
    setPolicy(next)
    setStatus('idle')
    startTransition(async () => {
      const res = await policyAction(locale, missionId, next)
      setStatus(res.ok ? 'saved' : 'error')
    })
  }

  return (
    <div className="mb-4 flex items-center gap-2">
      <label htmlFor="auto-approve-policy" className="text-sm font-bold text-kinnso-ink">
        {t.autoApprovePolicyLabel}
      </label>
      <select
        id="auto-approve-policy"
        value={policy}
        disabled={isPending}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-kinnso-line p-1 text-sm"
      >
        <option value="off">{t.autoApprovePolicyOff}</option>
        <option value="verified_signal_only">{t.autoApprovePolicyOn}</option>
      </select>
      {status === 'saved' && <span className="text-xs text-emerald-700">{t.autoApprovePolicySaved}</span>}
      {status === 'error' && <span className="text-xs text-red-600">{t.autoApprovePolicyError}</span>}
    </div>
  )
}

export function MissionDetailView({
  t, locale, detail, reviewAction, policyAction,
}: {
  t: T
  locale: Locale
  detail: MissionDetail
  reviewAction: ReviewActionFn
  policyAction: PolicyActionFn
}) {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-kinnso-ink">{detail.mission.title}</h1>
      <p className="mb-4 text-sm text-kinnso-muted">
        {detail.mission.missionSource} · {detail.mission.missionType} · {detail.mission.status}
      </p>

      <AutoApprovePolicyToggle
        t={t}
        locale={locale}
        missionId={detail.mission.id}
        initialPolicy={detail.mission.autoApprovePolicy}
        policyAction={policyAction}
      />

      {detail.submissions.length === 0 ? (
        <p className="py-8 text-center text-sm text-kinnso-muted">—</p>
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
            {detail.submissions.map((row) => (
              <SubmissionQueueRow key={row.submissionId} t={t} locale={locale} row={row} reviewAction={reviewAction} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default MissionDetailView
```

Wire the new prop through the page (`apps/web/app/[locale]/admin/missions/[missionId]/page.tsx`):

```typescript
import { getMissionDetail } from '@/lib/admin/mission-review-queries'
import { reviewSubmissionOpsAction, setMissionAutoApprovePolicyAction } from '@/lib/admin/mission-review-actions'
```

```typescript
  return (
    <MissionDetailView
      t={messages.missionsOps}
      locale={loc}
      detail={detail}
      reviewAction={reviewSubmissionOpsAction}
      policyAction={setMissionAutoApprovePolicyAction}
    />
  )
```

- [ ] **Step 9: Fix the pre-existing component test broken by Step 8's prop/type changes**

`apps/web/tests/kinnso.AdminMissionDetailView.test.tsx` (from R11.0 Task 5) renders `<MissionDetailView>` 8 times, none passing the new required `policyAction` prop, and its `detail.mission` fixture (`apps/web/tests/kinnso.AdminMissionDetailView.test.tsx:11-20`) lacks `autoApprovePolicy` — both now required by `MissionDetail`/`MissionDetailView`'s types, so this file currently fails to typecheck.

Add `autoApprovePolicy: 'off'` to the fixture:

```typescript
const detail = {
  mission: { id: 'mission-1', title: 'Summer Coupon Push', missionSource: 'travelpayouts', missionType: 'coupon_affiliate', status: 'published', merchantProfileId: null, autoApprovePolicy: 'off' },
```

Add `policyAction={vi.fn()}` to every one of the 8 `render(<MissionDetailView ... />)` calls in this file (lines 24, 31, 37, 47, 54, 70, 83, 98) — e.g.:

```typescript
    render(<MissionDetailView t={t as never} locale="en" detail={detail} reviewAction={vi.fn()} policyAction={vi.fn()} />)
```

Run: `cd apps/web && npx vitest run tests/kinnso.AdminMissionDetailView.test.tsx`
Expected: PASS (all 8 pre-existing tests, unaffected in behavior — only the new required prop was missing)

- [ ] **Step 10: Write the failing host test for the toggle**

`apps/web/tests/admin.mission-detail.host.test.tsx` already exists and covers this page. Its `detailMock` fixture (`apps/web/tests/admin.mission-detail.host.test.tsx:9-12`) does not yet include `autoApprovePolicy` — add it, then add the new test:

```typescript
  detailMock: vi.fn(async (): Promise<MissionDetail | null> => ({
    mission: { id: 'mission-1', title: 'Summer Coupon Push', missionSource: 'travelpayouts', missionType: 'coupon_affiliate', status: 'published', merchantProfileId: null, autoApprovePolicy: 'off' },
    participants: [], milestones: [], submissions: [],
  })),
```

```typescript
  it('renders the auto-approve policy toggle at its current value', async () => {
    const ui = await MissionDetailPage({ params: Promise.resolve({ locale: 'en', missionId: 'mission-1' }) })
    render(ui)
    const select = screen.getByLabelText('Auto-approve verified submissions') as HTMLSelectElement
    expect(select.value).toBe('off')
  })
```

Run: `cd apps/web && npx vitest run tests/admin.mission-detail.host.test.tsx`
Expected: FAIL until Step 8 lands, then PASS.

- [ ] **Step 11: Run the full affected test set**

Run: `cd apps/web && npx vitest run tests/admin.mission-review-queries.test.ts tests/admin.mission-review-actions.test.ts tests/admin.mission-detail.host.test.tsx tests/kinnso.AdminMissionDetailView.test.tsx`
Expected: PASS (including the pre-existing tests in both `admin.mission-detail.host.test.tsx` and `kinnso.AdminMissionDetailView.test.tsx`, which must still pass after their fixtures/props were updated for the new required prop and field)

- [ ] **Step 12: Commit**

```bash
git add apps/web/lib/admin/mission-review-queries.ts apps/web/lib/admin/mission-review-actions.ts apps/web/components/kinnso/admin/missions/MissionDetailView.tsx "apps/web/app/[locale]/admin/missions/[missionId]/page.tsx" apps/web/lib/i18n/messages/en.ts apps/web/tests/admin.mission-review-queries.test.ts apps/web/tests/admin.mission-review-actions.test.ts apps/web/tests/admin.mission-detail.host.test.tsx apps/web/tests/kinnso.AdminMissionDetailView.test.tsx
git commit -m "feat(web): auto-approve policy toggle on the mission detail page"
```

---

### Task 8: Widen `apps/scan`'s `handleVerifySubmission` for ops, scope throttle/insert to the owner

**Files:**
- Modify: `apps/scan/src/verify-server.ts`
- Modify: `apps/scan/tests/verify-server.unit.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/scan/tests/verify-server.unit.test.ts`. First extend `makeServerDb` (`apps/scan/tests/verify-server.unit.test.ts:21-93`) to stub `kinnso_ops_members`, and to record the inserted row's `creator_id`:

```typescript
function makeServerDb(opts: {
  submissionOwnerId?: string
  jobInsertId?: string
  jobInsertError?: { code?: string; message: string }
  existingJob?: ExistingJob | null
  activeJobs?: ActiveRow[]
  activeJobsError?: { message: string } | null
  resetRows?: Array<{ id: string }>
  resetError?: { code?: string; message: string } | null
  callerIsOps?: boolean
} = {}) {
  const updates: Array<{ table: string; data: Record<string, unknown>; filters: Array<[string, unknown]> }> = []
  const inserts: Array<{ table: string; data: Record<string, unknown> }> = []

  const submission = opts.submissionOwnerId
    ? { id: 'sub-1', proof_urls: ['https://www.instagram.com/p/Cabc/'], mission_participant_id: 'p-1', mission_participants: { creator_id: opts.submissionOwnerId } }
    : null

  const db = {
    _updates: updates,
    _inserts: inserts,
    from: (table: string) => {
      if (table === 'mission_milestone_submissions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: submission, error: null }),
            }),
          }),
        }
      }
      if (table === 'kinnso_ops_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: opts.callerIsOps ? { id: 'ops-1' } : null, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'mission_verification_jobs') {
        return {
          insert: (data: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                inserts.push({ table, data })
                if (opts.jobInsertError) return { data: null, error: opts.jobInsertError }
                return { data: { id: opts.jobInsertId ?? 'job-1' }, error: null }
              },
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.existingJob ?? null, error: null }),
              in: async () => ({ data: opts.activeJobs ?? [], error: opts.activeJobsError ?? null }),
            }),
          }),
          update: (data: Record<string, unknown>) => {
            const filters: Array<[string, unknown]> = []
            const builder = {
              eq: (col: string, val: unknown) => {
                filters.push([col, val])
                return builder
              },
              select: async () => {
                updates.push({ table, data, filters })
                if (opts.resetError) return { data: null, error: opts.resetError }
                return { data: opts.resetRows ?? [{ id: 'job-1' }], error: null }
              },
            }
            return builder
          },
        }
      }
      return {}
    },
  }
  return db as never
}
```

Then add a new describe block:

```typescript
describe('handleVerifySubmission — ops caller', () => {
  it('404s a non-owner, non-ops caller (unchanged behavior)', async () => {
    const db = makeServerDb({ submissionOwnerId: 'creator-1', callerIsOps: false })
    const result = await handleVerifySubmission(makeDeps(db, 'stranger-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(404)
  })

  it('allows an active ops caller to trigger verification for a submission they do not own', async () => {
    const db = makeServerDb({ submissionOwnerId: 'creator-1', callerIsOps: true })
    const result = await handleVerifySubmission(makeDeps(db, 'ops-caller-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(202)
  })

  it('inserts the job with the SUBMISSION OWNER\'s creator_id, not the ops caller\'s', async () => {
    const db = makeServerDb({ submissionOwnerId: 'creator-1', callerIsOps: true })
    await handleVerifySubmission(makeDeps(db, 'ops-caller-1'), { submissionId: 'sub-1' })
    const insert = (db as unknown as { _inserts: Array<{ data: Record<string, unknown> }> })._inserts[0]
    expect(insert.data.creator_id).toBe('creator-1')
  })

  it('scopes the concurrency/ledger check to the owner, not the ops caller', async () => {
    // 3 active jobs already belong to the OWNER -- an ops caller with zero jobs of their own
    // must still be throttled, proving the check is keyed by ownerId, not by userId.
    const db = makeServerDb({ submissionOwnerId: 'creator-1', callerIsOps: true, activeJobs: activeRows(3) })
    const result = await handleVerifySubmission(makeDeps(db, 'ops-caller-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(429)
  })

  it('does not query kinnso_ops_members at all when the caller already owns the submission', async () => {
    // The stub only serves kinnso_ops_members reads when queried; owner-path callers must
    // never need that extra round trip.
    const db = makeServerDb({ submissionOwnerId: 'creator-1' })
    const result = await handleVerifySubmission(makeDeps(db, 'creator-1'), { submissionId: 'sub-1' })
    expect(result.status).toBe(202)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/scan && npx vitest run tests/verify-server.unit.test.ts`
Expected: FAIL — the new ops-path tests fail (404 for the ops caller today; `creator_id` in the insert is currently `userId`)

- [ ] **Step 3: Implement the widening**

In `apps/scan/src/verify-server.ts`, add a helper right after `countActiveVerifications` (`apps/scan/src/verify-server.ts:58`):

```typescript
/**
 * True when userId is an active kinnso_ops_members row. Fails CLOSED (returns false) on a
 * query error -- an ops-membership check that can't complete must never be treated as passing.
 */
async function isActiveOpsCaller(db: SupabaseClient<Database>, userId: string): Promise<boolean> {
  const { data, error } = await db
    .from('kinnso_ops_members')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) {
    console.error('[scan] failed to check ops membership', error.message)
    return false
  }
  return !!data
}
```

Replace the ownership check and everything downstream of it in `handleVerifySubmission` (`apps/scan/src/verify-server.ts:100-136`):

```typescript
  if (subErr) return { status: 500, body: { error: 'internal error' } }

  const ownerId = (submission as { mission_participants?: { creator_id?: string } } | null)
    ?.mission_participants?.creator_id
  if (!submission || !ownerId) {
    return { status: 404, body: { error: 'submission not found' } }
  }
  // An ops caller may trigger re-verification on a submission they don't own -- checked only
  // when the fast owner-match path fails, so a creator's own request never pays this extra
  // round trip.
  if (ownerId !== userId && !(await isActiveOpsCaller(db, userId))) {
    return { status: 404, body: { error: 'submission not found' } }
  }

  // Throttle BEFORE inserting: a rejected run should leave no row behind. Scoped to the
  // submission's OWNER, never the caller -- an ops-initiated re-run must spend the SAME
  // creator-owned quota a creator-initiated one would, not some separate (and likely
  // nonexistent, since ops members aren't creators) bucket keyed by the ops member's own id.
  const limited = await checkVerificationLimits({ ...deps, userId: ownerId }, now)
  if (limited) return limited

  const proofUrl = (submission as { proof_urls?: string[] }).proof_urls?.[0] ?? null
  const parsed = proofUrl ? parseProofUrl(proofUrl) : null

  const { data: job, error: insertErr } = await db
    .from('mission_verification_jobs')
    .insert({
      mission_milestone_submission_id: submissionId,
      creator_id: ownerId,
      platform: parsed?.platform ?? null,
      proof_url: proofUrl,
      status: 'queued',
    } as never)
    .select('id')
    .single()

  if (insertErr || !job) {
    if (insertErr?.code === '23505') {
      return { status: 429, body: { error: 'verification already in progress' } }
    }
    console.error('[scan] failed to insert verification job', insertErr?.message)
    return { status: 500, body: { error: 'internal error' } }
  }

  const jobId = job.id
  ledger.record(ownerId, now)
```

(The rest of the function — the fire-and-forget `verifySubmission(...)` call and the `202` return — is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/scan && npx vitest run tests/verify-server.unit.test.ts`
Expected: PASS — every existing test in this file passes unchanged (the owner path is behavior-preserving) plus the new ops-path tests

- [ ] **Step 5: Run the whole apps/scan suite**

Run: `cd apps/scan && npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/scan/src/verify-server.ts apps/scan/tests/verify-server.unit.test.ts
git commit -m "feat(scan): let an active ops caller trigger verification on a submission they don't own

Rate-limit and job ownership stay scoped to the submission's actual creator, not the ops
caller -- an ops-initiated re-run spends the same quota a creator-initiated one would."
```

---

### Task 9: Overdue-reviews attention feed on the missions overview page

Note: `admin_mission_attention()`'s `at_risk_missions` bucket overlaps with data the overview page already shows via `admin_mission_analytics`'s existing `kpis.atRisk`-backed "At risk" card. Rendering it a second time would just duplicate that card, so this task surfaces only the NEW `overdue_reviews` bucket in the UI. `atRiskMissions` is still fully implemented, typed, and tested (Task 3's contract test + Task 11's live proof) — it's a UI-only economy call, not a scope cut.

**Files:**
- Modify: `apps/web/lib/admin/missions-queries.ts`
- Modify: `apps/web/components/kinnso/admin/missions/MissionsOverviewView.tsx`
- Modify: `apps/web/app/[locale]/admin/missions/page.tsx`
- Modify: `apps/web/lib/i18n/messages/en.ts`

- [ ] **Step 1: Write the failing query test**

Create `apps/web/tests/admin.mission-attention-queries.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { getMissionAttention } from '@/lib/admin/missions-queries'

function fakeClient(payload: unknown, error: unknown = null) {
  return { rpc: async () => ({ data: payload, error }) } as never
}

describe('getMissionAttention', () => {
  it('maps overdue_reviews and at_risk_missions', async () => {
    const supabase = fakeClient({
      overdue_reviews: [{ submission_id: 's1', mission_id: 'm1', mission_title: 'Mission One', creator_id: 'c1', review_deadline: '2026-08-19T00:00:00Z' }],
      at_risk_missions: [{ id: 'm2', title: 'Mission Two', merchant_name: 'Acme', reason: 'stalled_submissions' }],
    })
    const result = await getMissionAttention(supabase)
    expect(result).toEqual({
      overdueReviews: [{ submissionId: 's1', missionId: 'm1', missionTitle: 'Mission One', creatorId: 'c1', reviewDeadline: '2026-08-19T00:00:00Z' }],
      atRiskMissions: [{ id: 'm2', title: 'Mission Two', merchantName: 'Acme', reason: 'stalled_submissions' }],
    })
  })

  it('propagates an RPC error rather than swallowing it', async () => {
    const supabase = fakeClient(null, { message: 'boom' })
    await expect(getMissionAttention(supabase)).rejects.toEqual({ message: 'boom' })
  })
})
```

Run: `cd apps/web && npx vitest run tests/admin.mission-attention-queries.test.ts`
Expected: FAIL — `getMissionAttention` not exported

- [ ] **Step 2: Implement `getMissionAttention`**

Append to `apps/web/lib/admin/missions-queries.ts`:

```typescript
export interface MissionAttention {
  overdueReviews: { submissionId: string; missionId: string; missionTitle: string; creatorId: string; reviewDeadline: string }[]
  atRiskMissions: { id: string; title: string; merchantName: string | null; reason: string }[]
}

type AttentionPayload = {
  overdue_reviews?: { submission_id: string; mission_id: string; mission_title: string; creator_id: string; review_deadline: string }[]
  at_risk_missions?: { id: string; title: string; merchant_name: string | null; reason: string }[]
}

/** Backed by the SECURITY DEFINER admin_mission_attention() RPC (gated on is_active_ops()). */
export async function getMissionAttention(supabase: Client): Promise<MissionAttention> {
  const { data, error } = await supabase.rpc('admin_mission_attention')
  if (error || !data) throw error ?? new Error('admin_mission_attention returned no data')
  const a = data as unknown as AttentionPayload
  return {
    overdueReviews: (a.overdue_reviews ?? []).map((r) => ({
      submissionId: r.submission_id, missionId: r.mission_id, missionTitle: r.mission_title,
      creatorId: r.creator_id, reviewDeadline: r.review_deadline,
    })),
    atRiskMissions: (a.at_risk_missions ?? []).map((r) => ({
      id: r.id, title: r.title, merchantName: r.merchant_name, reason: r.reason,
    })),
  }
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/admin.mission-attention-queries.test.ts`
Expected: PASS

- [ ] **Step 4: Add i18n keys**

In `MissionsOpsMessages` (`apps/web/lib/i18n/messages/en.ts`), add after `autoApprovePolicyError` from Task 7:

```typescript
  autoApprovePolicyError: string
  attentionOverdueTitle: string
  attentionOverdueEmpty: string
}
```

In the `missionsOps` object, after `autoApprovePolicyError`:

```typescript
    autoApprovePolicyError: 'Could not update the policy. Please try again.',
    attentionOverdueTitle: 'Overdue reviews',
    attentionOverdueEmpty: 'Nothing overdue right now',
  },
```

- [ ] **Step 5: Write the failing overview host test**

`apps/web/tests/admin.missions-overview.host.test.tsx` already covers this page. Its `vi.hoisted` fixture block (`apps/web/tests/admin.missions-overview.host.test.tsx:6-13`) only mocks `overviewMock` today; add an `attentionMock` alongside it and wire it into the module mock:

```typescript
const { roleMock, getUserMock, overviewMock, attentionMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  overviewMock: vi.fn(async () => ({
    kpis: { total: 6, byStatus: { published: 4 }, byType: {}, byVisibility: {}, openForApplications: 4, submissionsAwaitingReview: 2 },
    missionsCreated: [], submissionsReviewed: [], atRisk: [],
  })),
  attentionMock: vi.fn(async () => ({ overdueReviews: [], atRiskMissions: [] })),
}))
```

```typescript
vi.mock('@/lib/admin/missions-queries', () => ({ getMissionsOverview: overviewMock, getMissionAttention: attentionMock }))
```

Then add the new test:

```typescript
  it('renders the overdue-reviews list', async () => {
    attentionMock.mockResolvedValueOnce({
      overdueReviews: [{ submissionId: 's1', missionId: 'm1', missionTitle: 'Overdue Mission', creatorId: 'c1', reviewDeadline: '2026-08-01T00:00:00Z' }],
      atRiskMissions: [],
    })
    const ui = await MissionsOverviewPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Overdue reviews')).toBeTruthy()
    expect(screen.getByText('Overdue Mission')).toBeTruthy()
  })
```

Run: `cd apps/web && npx vitest run tests/admin.missions-overview.host.test.tsx`
Expected: the new 'renders the overdue-reviews list' test FAILs (the page doesn't call `getMissionAttention` or render anything from it yet); the 4 pre-existing tests still PASS unaffected, since adding an unused mock is harmless

- [ ] **Step 6: Wire the query into the page**

In `apps/web/app/[locale]/admin/missions/page.tsx`:

```typescript
import { getMissionsOverview, getMissionAttention } from '@/lib/admin/missions-queries'
```

```typescript
  const [overview, attention] = await Promise.all([
    getMissionsOverview(supabase),
    getMissionAttention(supabase),
  ])
  return <MissionsOverviewView t={messages.missionsOps} locale={loc} overview={overview} attention={attention} />
```

- [ ] **Step 7: Add the list to `MissionsOverviewView`**

In `apps/web/components/kinnso/admin/missions/MissionsOverviewView.tsx`, import the type and add the `attention` prop:

```typescript
import type { MissionsOverview, MissionAttention } from '@/lib/admin/missions-queries'
```

```typescript
export function MissionsOverviewView({ t, locale, overview, attention }: { t: Messages['missionsOps']; locale: Locale; overview: MissionsOverview; attention: MissionAttention }) {
```

Add a new card after the existing "At risk" `TicketCard` block (`apps/web/components/kinnso/admin/missions/MissionsOverviewView.tsx:63-78`), before the closing `</main>`:

```typescript
      <TicketCard className="mt-8 p-5">
        <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.attentionOverdueTitle}</p>
        {attention.overdueReviews.length === 0 ? (
          <p className="py-6 text-sm text-kinnso-muted">{t.attentionOverdueEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {attention.overdueReviews.map((r) => (
              <li key={r.submissionId} className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate font-bold text-kinnso-ink">{r.missionTitle}</span>
                <span className="shrink-0 text-orange-700">{new Date(r.reviewDeadline).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </TicketCard>
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/admin.missions-overview.host.test.tsx`
Expected: PASS

- [ ] **Step 9: Run the whole affected test set**

Run: `cd apps/web && npx vitest run tests/admin.mission-attention-queries.test.ts tests/admin.mission-review-queries.test.ts tests/admin.mission-review-actions.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/admin/missions-queries.ts apps/web/components/kinnso/admin/missions/MissionsOverviewView.tsx "apps/web/app/[locale]/admin/missions/page.tsx" apps/web/lib/i18n/messages/en.ts apps/web/tests/admin.mission-attention-queries.test.ts
git commit -m "feat(web): surface overdue reviews on the missions overview page"
```

---

### Task 10: i18n parity — propagate new keys to the other 6 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts`

By this task, `en.ts`'s `MissionsOpsMessages` interface has 12 new keys beyond R11.0's set: `confidenceVerified`, `confidenceNeedsReview`, `confidenceUnavailable`, `actRerunVerification`, `rerunQueued`, `rerunFailed`, `autoApprovePolicyLabel`, `autoApprovePolicyOff`, `autoApprovePolicyOn`, `autoApprovePolicySaved`, `autoApprovePolicyError`, `attentionOverdueTitle`, `attentionOverdueEmpty`.

- [ ] **Step 1: Run the parity test to see it fail**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts`
Expected: FAIL — 6 locale files missing the 12 new `missionsOps` keys

- [ ] **Step 2: Add the keys to each locale file**

In each of `apps/web/lib/i18n/messages/zh-hk.ts`, `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`, `th.ts`, find that file's own `missionsOps` object (same key order as `en.ts`) and add the 12 keys after its existing `viewQueue` entry, translated:

zh-hk.ts:
```typescript
    confidenceVerified: '已核實',
    confidenceNeedsReview: '需要覆核',
    confidenceUnavailable: '未能核實',
    actRerunVerification: '重新核實',
    rerunQueued: '已重新排入核實隊列 — 請稍後查看。',
    rerunFailed: '無法開始核實，請重試。',
    autoApprovePolicyLabel: '已核實內容自動批核',
    autoApprovePolicyOff: '關閉',
    autoApprovePolicyOn: '開啟 — 僅限已核實訊號',
    autoApprovePolicySaved: '已儲存。',
    autoApprovePolicyError: '無法更新設定，請重試。',
    attentionOverdueTitle: '逾期審核',
    attentionOverdueEmpty: '目前沒有逾期項目',
```

zh-tw.ts:
```typescript
    confidenceVerified: '已核實',
    confidenceNeedsReview: '需要覆核',
    confidenceUnavailable: '未能核實',
    actRerunVerification: '重新核實',
    rerunQueued: '已重新排入核實佇列 — 請稍後查看。',
    rerunFailed: '無法開始核實，請重試。',
    autoApprovePolicyLabel: '已核實內容自動核准',
    autoApprovePolicyOff: '關閉',
    autoApprovePolicyOn: '開啟 — 僅限已核實訊號',
    autoApprovePolicySaved: '已儲存。',
    autoApprovePolicyError: '無法更新設定，請重試。',
    attentionOverdueTitle: '逾期審核',
    attentionOverdueEmpty: '目前沒有逾期項目',
```

zh-cn.ts:
```typescript
    confidenceVerified: '已核实',
    confidenceNeedsReview: '需要复核',
    confidenceUnavailable: '未能核实',
    actRerunVerification: '重新核实',
    rerunQueued: '已重新排入核实队列 — 请稍后查看。',
    rerunFailed: '无法开始核实，请重试。',
    autoApprovePolicyLabel: '已核实内容自动批准',
    autoApprovePolicyOff: '关闭',
    autoApprovePolicyOn: '开启 — 仅限已核实信号',
    autoApprovePolicySaved: '已保存。',
    autoApprovePolicyError: '无法更新设置，请重试。',
    attentionOverdueTitle: '逾期审核',
    attentionOverdueEmpty: '目前没有逾期项目',
```

ja.ts:
```typescript
    confidenceVerified: '確認済み',
    confidenceNeedsReview: '要確認',
    confidenceUnavailable: '確認不可',
    actRerunVerification: '再確認する',
    rerunQueued: '確認を再実行しました — しばらくしてから確認してください。',
    rerunFailed: '確認を開始できませんでした。もう一度お試しください。',
    autoApprovePolicyLabel: '確認済み投稿の自動承認',
    autoApprovePolicyOff: 'オフ',
    autoApprovePolicyOn: 'オン — 確認済みシグナルのみ',
    autoApprovePolicySaved: '保存しました。',
    autoApprovePolicyError: 'ポリシーを更新できませんでした。もう一度お試しください。',
    attentionOverdueTitle: '期限超過のレビュー',
    attentionOverdueEmpty: '現在、期限超過の項目はありません',
```

ko.ts:
```typescript
    confidenceVerified: '확인됨',
    confidenceNeedsReview: '검토 필요',
    confidenceUnavailable: '확인 불가',
    actRerunVerification: '재확인',
    rerunQueued: '확인이 다시 대기열에 추가되었습니다 — 잠시 후 확인해 주세요.',
    rerunFailed: '확인을 시작할 수 없습니다. 다시 시도해 주세요.',
    autoApprovePolicyLabel: '확인된 제출물 자동 승인',
    autoApprovePolicyOff: '꺼짐',
    autoApprovePolicyOn: '켜짐 — 확인된 신호만',
    autoApprovePolicySaved: '저장되었습니다.',
    autoApprovePolicyError: '정책을 업데이트할 수 없습니다. 다시 시도해 주세요.',
    attentionOverdueTitle: '기한 초과 검토',
    attentionOverdueEmpty: '현재 기한 초과 항목이 없습니다',
```

th.ts:
```typescript
    confidenceVerified: 'ยืนยันแล้ว',
    confidenceNeedsReview: 'ต้องตรวจสอบ',
    confidenceUnavailable: 'ไม่สามารถยืนยันได้',
    actRerunVerification: 'ยืนยันอีกครั้ง',
    rerunQueued: 'จัดคิวยืนยันใหม่แล้ว — โปรดตรวจสอบอีกครั้งในอีกสักครู่',
    rerunFailed: 'ไม่สามารถเริ่มการยืนยันได้ กรุณาลองใหม่อีกครั้ง',
    autoApprovePolicyLabel: 'อนุมัติอัตโนมัติสำหรับเนื้อหาที่ยืนยันแล้ว',
    autoApprovePolicyOff: 'ปิด',
    autoApprovePolicyOn: 'เปิด — เฉพาะสัญญาณที่ยืนยันแล้ว',
    autoApprovePolicySaved: 'บันทึกแล้ว',
    autoApprovePolicyError: 'ไม่สามารถอัปเดตนโยบายได้ กรุณาลองใหม่อีกครั้ง',
    attentionOverdueTitle: 'การตรวจสอบที่เกินกำหนด',
    attentionOverdueEmpty: 'ไม่มีรายการเกินกำหนดในขณะนี้',
```

- [ ] **Step 3: Run the parity test to verify it passes**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts`
Expected: PASS

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors (every locale's `MissionsOpsMessages` object must satisfy the interface exactly — a typo'd key name fails here, not just at the parity test)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/i18n/messages/zh-hk.ts apps/web/lib/i18n/messages/zh-tw.ts apps/web/lib/i18n/messages/zh-cn.ts apps/web/lib/i18n/messages/ja.ts apps/web/lib/i18n/messages/ko.ts apps/web/lib/i18n/messages/th.ts
git commit -m "i18n(r11.1): add verification-triage copy across all seven locales"
```

---

### Task 11: Live-proof extension

Extends `apps/web/tests/mission-review.rls.test.ts` in place (reuses its existing fixtures: `missionId`, `milestoneId`, `participantAId`, `opsAdminUser`, `freshMilestoneId()`) rather than a new file — this phase's fixtures are the same mission/creator/ops-member shapes R11.0 already seeded, and a second live-stack `beforeAll` seeding the same shapes would just duplicate Task 9's UUID-disjointness bookkeeping for no benefit. Requires the local Supabase stack running (`supabase start`, then the sibling `+100`-port config already in `supabase/config.toml` per the kinnso-local-stack-port-shift-gotcha) — **never point any of this at the linked production project.**

**Files:**
- Modify: `apps/web/tests/mission-review.rls.test.ts`

- [ ] **Step 1: Update the file's own describe title and header comment**

Change line 72's describe title to reflect the widened scope:

```typescript
d('r11.0/r11.1 mission review: admin_review_submission, mission_review_event_append, auto-approve, admin_mission_attention, RLS, and review_deadline', () => {
```

- [ ] **Step 2: Add a test proving the Task 1 RLS fix**

Add after the existing `'admin_mission_analytics: a travelpayouts-sourced mission...'` test (end of file, before the closing `})`):

```typescript
  it('mission_verification_jobs RLS: an active ops member can now read confidence_status directly; an unrelated creator cannot', async () => {
    const s = svc()
    const job = await s.from('mission_verification_jobs').insert({
      mission_milestone_submission_id: submissionAId, creator_id: creatorA,
      status: 'ready', confidence_status: 'verified_signal',
    }).select('id').single()
    if (job.error) throw job.error

    const ops = clientFor(opsAdminUser)
    const asOps = await ops.from('mission_verification_jobs').select('id, confidence_status').eq('id', job.data!.id)
    expect(asOps.error).toBeNull()
    expect(asOps.data).toHaveLength(1)
    expect(asOps.data![0].confidence_status).toBe('verified_signal')

    const creatorBClient = clientFor(creatorB)
    const asUnrelated = await creatorBClient.from('mission_verification_jobs').select('id').eq('id', job.data!.id)
    expect(asUnrelated.error).toBeNull()
    expect(asUnrelated.data).toEqual([])
  }, testTimeout)
```

- [ ] **Step 3: Add auto-approve trigger tests**

```typescript
  it('auto-approve trigger: policy verified_signal_only approves with zero human action, writing a system-actor event and no ops_audit_log row', async () => {
    const s = svc()
    const policyOn = await s.from('missions').update({ auto_approve_policy: 'verified_signal_only' }).eq('id', missionId)
    if (policyOn.error) throw policyOn.error

    const freshSubmission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: await freshMilestoneId(), mission_participant_id: participantAId, status: 'submitted',
      proof_urls: ['https://example.com/auto-approve-1'], submitted_at: new Date().toISOString(),
    }).select('id').single()
    if (freshSubmission.error) throw freshSubmission.error
    const autoSubmissionId = freshSubmission.data!.id

    const job = await s.from('mission_verification_jobs').insert({
      mission_milestone_submission_id: autoSubmissionId, creator_id: creatorA, status: 'queued',
    }).select('id').single()
    if (job.error) throw job.error

    const auditBefore = await s.from('ops_audit_log').select('id').eq('entity_id', autoSubmissionId)
    if (auditBefore.error) throw auditBefore.error

    const ready = await s.from('mission_verification_jobs')
      .update({ status: 'ready', confidence_status: 'verified_signal' })
      .eq('id', job.data!.id)
    if (ready.error) throw ready.error

    const submission = await s.from('mission_milestone_submissions').select('status, reviewed_by').eq('id', autoSubmissionId).single()
    if (submission.error) throw submission.error
    expect(submission.data!.status).toBe('approved')
    expect(submission.data!.reviewed_by).toBeNull()

    const events = await s.from('mission_review_events').select('actor_type, actor_id, action').eq('submission_id', autoSubmissionId)
    if (events.error) throw events.error
    expect(events.data).toHaveLength(1)
    expect(events.data![0]).toMatchObject({ actor_type: 'system', actor_id: null, action: 'approve' })

    // Explicit acceptance criterion: the trigger must never call ops_audit_log_append --
    // no new row for this submission beyond whatever existed before this test.
    const auditAfter = await s.from('ops_audit_log').select('id').eq('entity_id', autoSubmissionId)
    if (auditAfter.error) throw auditAfter.error
    expect(auditAfter.data!.length).toBe(auditBefore.data!.length)

    await s.from('missions').update({ auto_approve_policy: 'off' }).eq('id', missionId)
  }, testTimeout)

  it('auto-approve trigger: policy off (the default) leaves an identical job transition untouched', async () => {
    const s = svc()
    const freshSubmission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: await freshMilestoneId(), mission_participant_id: participantAId, status: 'submitted',
      proof_urls: ['https://example.com/auto-approve-2'], submitted_at: new Date().toISOString(),
    }).select('id').single()
    if (freshSubmission.error) throw freshSubmission.error
    const offSubmissionId = freshSubmission.data!.id

    const job = await s.from('mission_verification_jobs').insert({
      mission_milestone_submission_id: offSubmissionId, creator_id: creatorA, status: 'queued',
    }).select('id').single()
    if (job.error) throw job.error

    // missionId's policy is 'off' by default (never turned on for this test, and the previous
    // test explicitly reset it) -- proves the roadmap's default-safety acceptance criterion.
    const ready = await s.from('mission_verification_jobs')
      .update({ status: 'ready', confidence_status: 'verified_signal' })
      .eq('id', job.data!.id)
    if (ready.error) throw ready.error

    const submission = await s.from('mission_milestone_submissions').select('status').eq('id', offSubmissionId).single()
    if (submission.error) throw submission.error
    expect(submission.data!.status).toBe('submitted')

    const events = await s.from('mission_review_events').select('id').eq('submission_id', offSubmissionId)
    if (events.error) throw events.error
    expect(events.data).toEqual([])
  }, testTimeout)

  it('auto-approve trigger: does not fire on an unrelated update to an already-verified_signal row', async () => {
    const s = svc()
    const policyOn = await s.from('missions').update({ auto_approve_policy: 'verified_signal_only' }).eq('id', missionId)
    if (policyOn.error) throw policyOn.error

    const freshSubmission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: await freshMilestoneId(), mission_participant_id: participantAId, status: 'submitted',
      proof_urls: ['https://example.com/auto-approve-3'], submitted_at: new Date().toISOString(),
    }).select('id').single()
    if (freshSubmission.error) throw freshSubmission.error
    const noRefireSubmissionId = freshSubmission.data!.id

    const job = await s.from('mission_verification_jobs').insert({
      mission_milestone_submission_id: noRefireSubmissionId, creator_id: creatorA,
      status: 'ready', confidence_status: 'verified_signal',
    }).select('id').single()
    if (job.error) throw job.error

    // This insert already lands directly on ready/verified_signal (not a transition INTO it
    // via update), so the trigger (AFTER UPDATE only) never fires and the submission is
    // never auto-approved by this insert.
    const afterInsert = await s.from('mission_milestone_submissions').select('status').eq('id', noRefireSubmissionId).single()
    if (afterInsert.error) throw afterInsert.error
    expect(afterInsert.data!.status).toBe('submitted')

    // Now bump an unrelated column (error) while status/confidence_status stay identical --
    // the trigger's `is distinct from` guard must keep this a no-op too.
    const unrelatedUpdate = await s.from('mission_verification_jobs').update({ error: 'unrelated note' }).eq('id', job.data!.id)
    if (unrelatedUpdate.error) throw unrelatedUpdate.error

    const afterUnrelated = await s.from('mission_milestone_submissions').select('status').eq('id', noRefireSubmissionId).single()
    if (afterUnrelated.error) throw afterUnrelated.error
    expect(afterUnrelated.data!.status).toBe('submitted')

    await s.from('missions').update({ auto_approve_policy: 'off' }).eq('id', missionId)
  }, testTimeout)
```

- [ ] **Step 4: Add `admin_mission_attention()` tests**

```typescript
  it('admin_mission_attention: surfaces an overdue submission and rejects a non-ops caller', async () => {
    const s = svc()
    const overdueSubmission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: await freshMilestoneId(), mission_participant_id: participantAId, status: 'submitted',
      proof_urls: ['https://example.com/overdue-1'], submitted_at: new Date().toISOString(),
    }).select('id').single()
    if (overdueSubmission.error) throw overdueSubmission.error
    // Force the deadline into the past -- the trigger sets it to submitted_at + 48h on insert.
    const backdate = await s.from('mission_milestone_submissions')
      .update({ review_deadline: new Date(Date.now() - 60 * 60 * 1000).toISOString() })
      .eq('id', overdueSubmission.data!.id)
    if (backdate.error) throw backdate.error

    const ops = clientFor(opsAdminUser)
    const { data, error } = await ops.rpc('admin_mission_attention')
    expect(error).toBeNull()
    const overdue = (data as { overdue_reviews: Array<{ submission_id: string }> }).overdue_reviews
    expect(overdue.some((r) => r.submission_id === overdueSubmission.data!.id)).toBe(true)

    const creator = clientFor(creatorA)
    const denied = await creator.rpc('admin_mission_attention')
    expect(denied.error).not.toBeNull()
    expect(/forbidden|42501/i.test(`${denied.error?.message} ${denied.error?.code}`)).toBe(true)
  }, testTimeout)
```

- [ ] **Step 5: Run the extended file**

Requires the local stack: `supabase start` first if not already running (per `supabase/config.toml`'s `+100`-shifted ports), and `apps/web/.env.test` populated per the project's testing convention.

Run: `cd apps/web && npx vitest run tests/mission-review.rls.test.ts`
Expected: PASS (all tests, R11.0's original ones and this task's additions)

- [ ] **Step 6: Run the FULL web test suite before stopping the stack**

Per the kinnso-full-gate-needs-live-stack-gotcha: run the whole suite while the stack is still up, not after stopping it — ~20 unrelated files also hit a real Supabase client and will time out (not skip) once it's down.

Run: `cd apps/web && npx vitest run`
Expected: PASS (any pre-existing unrelated failures already known from prior phases — e.g. `settlement-minting.rls.test.ts`'s own pre-existing cascade issue documented in R11.0 — are out of scope for this task; everything else must be green)

- [ ] **Step 7: Stop the local stack**

Run: `supabase stop`

- [ ] **Step 8: Commit**

```bash
git add apps/web/tests/mission-review.rls.test.ts
git commit -m "test(r11.1): live-prove the ops RLS fix, auto-approve trigger (on/off/no-refire), and admin_mission_attention on a real stack"
```

---

## Final gate

- [ ] Run `cd apps/web && npx tsc --noEmit` — must be clean
- [ ] Run `cd apps/scan && npx tsc --noEmit` — must be clean
- [ ] Run `pnpm lint` from the repo root — must be clean
- [ ] Confirm no task touched a shipped migration file (only new timestamped files were added)
- [ ] Confirm no task ran `pnpm --filter @kinnso/db gen` or any live/production DB command

After all tasks are complete and verified, hand off to **superpowers:finishing-a-development-branch** to open the PR.
