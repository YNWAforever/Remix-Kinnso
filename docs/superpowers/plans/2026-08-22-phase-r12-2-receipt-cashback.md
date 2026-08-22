# Phase R12.2 — Receipt-Based Cashback Missions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give merchants a receipt-photo-based cashback mission type — repeatable per visit, reviewed through the existing R11.0 review queue, settled through a widened R10.1 trigger — as the redemption fallback for merchants who won't adopt QR (R12.0) or bookable experiences.

**Architecture:** `missions.mission_type` gains `'receipt_cashback'`. Mission creation auto-creates one `mission_milestones` row flagged `repeatable = true`. A new `submit_receipt` RPC lets a creator submit against that milestone repeatedly (capped, optionally, per mission), reusing `mission_milestone_submissions`'s existing shape and the R11.0 review queue/`admin_review_submission` RPC unchanged except for a mission-type-aware reason-category taxonomy. `create_mission_settlement_on_approval` gains a branch that mints a `mission_settlements` row per approved receipt (`source='receipt_cashback'`, uniqueness scoped per submission, not per participant — the existing one-settlement-per-participant guarantee for `mission_fee` stays completely untouched).

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Postgres (RLS + SECURITY DEFINER RPCs), Vitest, TypeScript.

Design doc: `docs/superpowers/specs/2026-08-22-phase-r12-2-receipt-cashback-design.md`

---

### Task 1: Widen mission_type, add repeatable milestones, add the per-creator cap column

**Files:**
- Create: `supabase/migrations/20260822090000_r12_2_receipt_cashback_schema.sql`
- Test: `apps/web/tests/db.r12-2-receipt-cashback-schema.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260822090000_r12_2_receipt_cashback_schema.sql
--
-- R12.2: adds the schema foundation for repeatable receipt-cashback missions.
--
-- missions.mission_type: 'receipt_cashback' joins the existing coupon_affiliate/hybrid/paid
-- set. paid_fee_amount/paid_fee_currency (already on missions) are reused as the flat
-- per-receipt cashback amount -- no new amount column needed.
--
-- missions.max_receipts_per_creator: optional per-mission cap on how many receipts one
-- creator may get approved, since there's no OCR/auto-matching in v1 -- a human reviewer is
-- the only fraud check. Nullable (off by default); when set, must be >= 1.
--
-- mission_milestones.repeatable: a repeatable milestone (used only by receipt_cashback
-- missions, exactly one per mission, auto-created at mission-creation time) can be submitted
-- against many times by the same participant, unlike every other milestone today.
--
-- mission_milestone_submissions.milestone_repeatable: denormalized copy of the owning
-- milestone's `repeatable` flag, set once at insert time by a trigger and never updated
-- after. This exists because Postgres partial-index predicates can only reference columns of
-- the indexed table itself, not a joined table -- so the "one submission per (milestone,
-- participant) unless repeatable" rule can't be expressed as a partial index directly against
-- mission_milestones.repeatable. Denormalizing the flag onto the submission row at insert
-- time keeps the uniqueness guarantee as a real, enforced index rather than an RPC-only
-- convention.

alter table public.missions
  drop constraint missions_mission_type_check,
  add constraint missions_mission_type_check check (mission_type in ('coupon_affiliate', 'hybrid', 'paid', 'receipt_cashback')),
  add column max_receipts_per_creator integer check (max_receipts_per_creator is null or max_receipts_per_creator >= 1);

alter table public.mission_milestones
  add column repeatable boolean not null default false;

alter table public.mission_milestone_submissions
  add column milestone_repeatable boolean not null default false;

create or replace function public.set_submission_milestone_repeatable() returns trigger
language plpgsql as $$
begin
  select repeatable into new.milestone_repeatable
    from public.mission_milestones
    where id = new.mission_milestone_id;
  return new;
end;
$$;

create trigger set_submission_milestone_repeatable_trg
  before insert on public.mission_milestone_submissions
  for each row execute function public.set_submission_milestone_repeatable();

alter table public.mission_milestone_submissions
  drop constraint mission_milestone_submissions_mission_milestone_id_mission_key;

create unique index mission_milestone_submissions_unique_non_repeatable
  on public.mission_milestone_submissions (mission_milestone_id, mission_participant_id)
  where not milestone_repeatable;

-- A receipt_cashback mission has exactly one repeatable milestone, always -- creating it
-- automatically at mission-insert time (rather than leaving it to the merchant-creation UI,
-- Task 7) guarantees submit_receipt (Task 5) always finds one to submit against, regardless
-- of which path created the mission row (merchant UI, ops, or a direct test/seed insert).
-- Mirrors this codebase's established "X always happens via trigger" pattern
-- (handle_new_user() auto-creating a creators row on signup).
create or replace function public.create_repeatable_milestone_for_receipt_mission() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.mission_type = 'receipt_cashback' then
    insert into public.mission_milestones (mission_id, title, description, repeatable)
      values (new.id, 'Submit a receipt', 'Upload a photo of your receipt from this merchant.', true);
  end if;
  return new;
end;
$$;

create trigger create_repeatable_milestone_for_receipt_mission_trg
  after insert on public.missions
  for each row execute function public.create_repeatable_milestone_for_receipt_mission();
```

IMPORTANT: Before writing this file, run `grep -n "mission_milestone_submissions_mission_milestone_id_mission_key\|unique (mission_milestone_id, mission_participant_id)" supabase/migrations/*.sql` to confirm the real, current auto-generated name of the `unique (mission_milestone_id, mission_participant_id)` constraint added in `20260617173932_mission_tables.sql` (Postgres names an inline table-level `unique (...)` constraint `<table>_<col1>_<col2>_key` by default, but confirm this hasn't been renamed by any later migration) — use the REAL name in the `drop constraint` line, not the sketch's guess, and note in your report if it differs.

- [ ] **Step 2: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-2-receipt-cashback-schema.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260822090000_r12_2_receipt_cashback_schema.sql'),
  'utf8',
)

describe('R12.2 receipt-cashback schema foundation', () => {
  it('adds receipt_cashback to mission_type and a nullable max_receipts_per_creator cap', () => {
    expect(sql).toContain("mission_type in ('coupon_affiliate', 'hybrid', 'paid', 'receipt_cashback')")
    expect(sql).toContain('add column max_receipts_per_creator integer')
  })

  it('adds a repeatable flag to mission_milestones', () => {
    expect(sql).toContain('add column repeatable boolean not null default false')
  })

  it('denormalizes milestone_repeatable onto submissions via a before-insert trigger', () => {
    expect(sql).toContain('add column milestone_repeatable boolean not null default false')
    expect(sql).toContain('before insert on public.mission_milestone_submissions')
    expect(sql).toContain('select repeatable into new.milestone_repeatable')
  })

  it('replaces the flat unique constraint with a partial index scoped to non-repeatable milestones', () => {
    expect(sql).toContain('drop constraint')
    expect(sql).toContain('create unique index mission_milestone_submissions_unique_non_repeatable')
    expect(sql).toContain('on public.mission_milestone_submissions (mission_milestone_id, mission_participant_id)')
    expect(sql).toContain('where not milestone_repeatable')
  })

  it('auto-creates a repeatable milestone whenever a receipt_cashback mission is inserted', () => {
    expect(sql).toContain('after insert on public.missions')
    expect(sql).toContain("if new.mission_type = 'receipt_cashback' then")
    expect(sql).toContain('insert into public.mission_milestones (mission_id, title, description, repeatable)')
    expect(sql).toContain('true);')
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-2-receipt-cashback-schema`
Expected: PASS (5 tests)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260822090000_r12_2_receipt_cashback_schema.sql apps/web/tests/db.r12-2-receipt-cashback-schema.test.ts
git commit -m "feat(db): R12.2 receipt_cashback mission type, repeatable milestones, per-creator cap"
```

---

### Task 2: Widen mission_settlements with a submission-scoped receipt_cashback source

**Files:**
- Create: `supabase/migrations/20260822090100_r12_2_settlements_receipt_source.sql`
- Test: `apps/web/tests/db.r12-2-settlements-receipt-source.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260822090100_r12_2_settlements_receipt_source.sql
--
-- Adds a submission-scoped settlement source for repeatable receipt cashback. The existing
-- mission_settlements_participant_fee_uniq index (source='mission_fee', scoped per
-- participant) and the visit_redemption source (R12.0, unconstrained by that index) are both
-- completely untouched -- receipt_cashback gets its OWN uniqueness guarantee, scoped per
-- submission (mission_milestone_submission_id), since a repeatable milestone can and should
-- produce many settlements for the same participant over time, but the SAME approved
-- submission must never mint two settlements (e.g. a stale re-review retry).

alter table public.mission_settlements
  add column mission_milestone_submission_id uuid references public.mission_milestone_submissions(id) on delete set null;

alter table public.mission_settlements
  drop constraint mission_settlements_source_check,
  add constraint mission_settlements_source_check check (source in ('mission_fee', 'visit_redemption', 'receipt_cashback'));

create unique index mission_settlements_submission_receipt_uniq
  on public.mission_settlements (mission_milestone_submission_id)
  where source = 'receipt_cashback';
```

IMPORTANT: Before writing this file, run `grep -n "add column source text not null default 'mission_fee'" supabase/migrations/20260821100300_r12_0_settlement_on_redemption.sql` to reconfirm the real, current name Postgres gave the `check (source in (...))` constraint added by that migration (an inline column-level `check` on an `add column` in an `alter table` gets auto-named `<table>_<column>_check` by default — confirm this is really `mission_settlements_source_check` and not something else, since R12.0's migration didn't explicitly name it). Use the REAL name in `drop constraint`.

- [ ] **Step 2: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-2-settlements-receipt-source.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260822090100_r12_2_settlements_receipt_source.sql'),
  'utf8',
)

describe('R12.2 mission_settlements receipt_cashback source', () => {
  it('adds a mission_milestone_submission_id column', () => {
    expect(sql).toContain('add column mission_milestone_submission_id uuid references public.mission_milestone_submissions(id)')
  })

  it('widens the source check to add receipt_cashback alongside the existing two values', () => {
    expect(sql).toContain("source in ('mission_fee', 'visit_redemption', 'receipt_cashback')")
  })

  it('adds a submission-scoped unique index, not a participant-scoped one', () => {
    expect(sql).toContain('create unique index mission_settlements_submission_receipt_uniq')
    expect(sql).toContain('on public.mission_settlements (mission_milestone_submission_id)')
    expect(sql).toContain("where source = 'receipt_cashback'")
  })

  it('does not touch the existing participant-scoped mission_fee index', () => {
    expect(sql).not.toContain('mission_settlements_participant_fee_uniq')
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-2-settlements-receipt-source`
Expected: PASS (4 tests)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260822090100_r12_2_settlements_receipt_source.sql apps/web/tests/db.r12-2-settlements-receipt-source.test.ts
git commit -m "feat(db): R12.2 mission_settlements gains a submission-scoped receipt_cashback source"
```

---

### Task 3: Widen create_mission_settlement_on_approval to mint receipt settlements

**Files:**
- Create: `supabase/migrations/20260822090200_r12_2_settle_receipt_on_approval.sql`
- Test: `apps/web/tests/db.r12-2-settle-receipt-on-approval.test.ts`

- [ ] **Step 1: Find and read the current, real create_mission_settlement_on_approval**

Run `grep -rl "create or replace function public.create_mission_settlement_on_approval" supabase/migrations/*.sql` and read every result in chronological filename order. The most recent version is in `20260821100300_r12_0_settlement_on_redemption.sql` — reproduced below for reference, but READ THE REAL FILE FIRST, do not copy this sketch blind:

```sql
create or replace function public.create_mission_settlement_on_approval()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mission_id   uuid;
  v_mission_type text;
  v_source       text;
  v_fee          numeric;
  v_currency     text;
begin
  if new.status <> 'approved' then return new; end if;
  if tg_op = 'update' and coalesce(old.status, '') = 'approved' then return new; end if;

  select mp.mission_id, m.mission_type, m.mission_source, m.paid_fee_amount, m.paid_fee_currency
    into v_mission_id, v_mission_type, v_source, v_fee, v_currency
    from public.mission_participants mp
    join public.missions m on m.id = mp.mission_id
    where mp.id = new.mission_participant_id;

  if v_mission_id is null then return new; end if;
  if v_source <> 'merchant' then return new; end if;
  if v_mission_type not in ('paid','hybrid') then return new; end if;
  if v_fee is null or v_fee <= 0 then return new; end if;

  insert into public.mission_settlements (
    mission_id, mission_participant_id, status, amount_currency, paid_fee_amount, creator_payout_status
  ) values (
    v_mission_id, new.mission_participant_id, 'pending', upper(coalesce(v_currency, 'HKD')), v_fee, 'pending'
  )
  on conflict (mission_participant_id) where affiliate_network_event_id is null and mission_participant_id is not null and source = 'mission_fee'
  do nothing;

  return new;
end $$;
```

**Step 2: Write the migration**

Add a `receipt_cashback` branch, checked BEFORE the existing `if v_mission_type not in ('paid','hybrid') then return new; end if;` line returns early for it (a `receipt_cashback` mission_type must not fall into that guard, or nothing would ever settle) — restructure the mission_type dispatch cleanly rather than special-casing around the existing early return. Reproduce every other line of the current function unchanged.

```sql
-- supabase/migrations/20260822090200_r12_2_settle_receipt_on_approval.sql
--
-- Widens create_mission_settlement_on_approval with a receipt_cashback branch. Every
-- existing line for paid/hybrid mission-fee settlement is unchanged, including its
-- participant-scoped ON CONFLICT arbiter -- receipt_cashback uses the NEW
-- submission-scoped index from 20260822090100 instead, since (unlike a one-time paid-mission
-- fee) each approved receipt must mint its own settlement.
create or replace function public.create_mission_settlement_on_approval()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mission_id   uuid;
  v_mission_type text;
  v_source       text;
  v_fee          numeric;
  v_currency     text;
begin
  if new.status <> 'approved' then return new; end if;
  if tg_op = 'update' and coalesce(old.status, '') = 'approved' then return new; end if;

  select mp.mission_id, m.mission_type, m.mission_source, m.paid_fee_amount, m.paid_fee_currency
    into v_mission_id, v_mission_type, v_source, v_fee, v_currency
    from public.mission_participants mp
    join public.missions m on m.id = mp.mission_id
    where mp.id = new.mission_participant_id;

  if v_mission_id is null then return new; end if;
  if v_source <> 'merchant' then return new; end if;
  if v_fee is null or v_fee <= 0 then return new; end if;

  if v_mission_type in ('paid', 'hybrid') then
    insert into public.mission_settlements (
      mission_id, mission_participant_id, status, amount_currency, paid_fee_amount, creator_payout_status
    ) values (
      v_mission_id, new.mission_participant_id, 'pending', upper(coalesce(v_currency, 'HKD')), v_fee, 'pending'
    )
    on conflict (mission_participant_id) where affiliate_network_event_id is null and mission_participant_id is not null and source = 'mission_fee'
    do nothing;
  elsif v_mission_type = 'receipt_cashback' then
    insert into public.mission_settlements (
      mission_id, mission_participant_id, mission_milestone_submission_id, status, amount_currency, paid_fee_amount, creator_payout_status, source
    ) values (
      v_mission_id, new.mission_participant_id, new.id, 'pending', upper(coalesce(v_currency, 'HKD')), v_fee, 'pending', 'receipt_cashback'
    )
    on conflict (mission_milestone_submission_id) where source = 'receipt_cashback'
    do nothing;
  end if;

  return new;
end $$;
```

- [ ] **Step 3: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-2-settle-receipt-on-approval.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260822090200_r12_2_settle_receipt_on_approval.sql'),
  'utf8',
)

describe('create_mission_settlement_on_approval receipt_cashback branch', () => {
  it('does not change the function signature (no DROP FUNCTION needed)', () => {
    expect(sql).not.toContain('drop function')
    expect(sql).toContain('create or replace function public.create_mission_settlement_on_approval()')
  })

  it('mints a receipt_cashback settlement tagged with the submission id', () => {
    expect(sql).toContain("elsif v_mission_type = 'receipt_cashback' then")
    expect(sql).toContain('mission_milestone_submission_id')
    expect(sql).toContain("'pending', upper(coalesce(v_currency, 'HKD')), v_fee, 'pending', 'receipt_cashback'")
  })

  it('uses the submission-scoped arbiter for receipt_cashback, not the participant-scoped one', () => {
    expect(sql).toContain('on conflict (mission_milestone_submission_id) where source = \'receipt_cashback\'')
  })

  it('preserves the existing paid/hybrid branch and its original participant-scoped arbiter unchanged', () => {
    expect(sql).toContain("if v_mission_type in ('paid', 'hybrid') then")
    expect(sql).toContain("on conflict (mission_participant_id) where affiliate_network_event_id is null and mission_participant_id is not null and source = 'mission_fee'")
  })

  it('preserves the already-approved short-circuit guard and the merchant-source guard', () => {
    expect(sql).toContain("if tg_op = 'update' and coalesce(old.status, '') = 'approved' then return new; end if;")
    expect(sql).toContain("if v_source <> 'merchant' then return new; end if;")
  })
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-2-settle-receipt-on-approval`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260822090200_r12_2_settle_receipt_on_approval.sql apps/web/tests/db.r12-2-settle-receipt-on-approval.test.ts
git commit -m "feat(db): R12.2 create_mission_settlement_on_approval mints receipt_cashback settlements"
```

---

### Task 4: Receipt-specific rejection reason taxonomy

**Files:**
- Create: `supabase/migrations/20260822090300_r12_2_receipt_reason_taxonomy.sql`
- Test: `apps/web/tests/db.r12-2-receipt-reason-taxonomy.test.ts`

- [ ] **Step 1: Read the real, current mission_review_events and admin_review_submission**

Read `supabase/migrations/20260819090000_r11_0_mission_review_events.sql` (the `mission_review_events` table, its `reason_category` check constraint) and `supabase/migrations/20260819090100_r11_0_admin_review_submission.sql` (the `admin_review_submission` RPC) in full — both already shipped, unchanged since. Confirm the real, current constraint names via `grep -n "constraint mission_review_events_reason_category_check\|constraint mission_review_events_reason_required_check" supabase/migrations/*.sql`.

**Step 2: Write the migration**

A plain column-level `CHECK` on `mission_review_events.reason_category` cannot see which mission type the submission belongs to (that requires a join through `mission_milestone_submissions` → `mission_participants` → `missions`), so mission-type-aware validation can't be a single `CHECK` constraint. This migration (a) widens the flat `CHECK` to accept the union of both taxonomies as a baseline safety net, and (b) adds a `BEFORE INSERT` trigger on `mission_review_events` that looks up the submission's real mission type and rejects a mismatched category — a receipt-cashback rejection must use a receipt reason, and every other mission type must keep using the existing R11.0 taxonomy.

```sql
-- supabase/migrations/20260822090300_r12_2_receipt_reason_taxonomy.sql
--
-- Receipt-cashback submissions get their own rejection taxonomy
-- (unreadable/wrong_venue/duplicate/amount_unclear/other) -- R11.0's existing
-- format/key_message/compliance/quality/other set was built for social-post proof and
-- doesn't fit a receipt. A plain column CHECK can't be mission-type-aware (it can't see
-- across the submission -> participant -> mission join), so this widens the CHECK to the
-- union of both taxonomies as a floor, then adds a BEFORE INSERT trigger that enforces the
-- CORRECT taxonomy for the submission's real mission type -- every existing mission type's
-- rejections are completely unaffected (they still only pass with the R11.0 taxonomy; only
-- receipt_cashback submissions can use the new one).

alter table public.mission_review_events
  drop constraint mission_review_events_reason_category_check,
  add constraint mission_review_events_reason_category_check check (
    reason_category is null or reason_category in (
      'format', 'key_message', 'compliance', 'quality', 'other',
      'unreadable', 'wrong_venue', 'duplicate', 'amount_unclear'
    )
  );

create or replace function public.enforce_reason_category_taxonomy() returns trigger
language plpgsql as $$
declare
  v_mission_type text;
begin
  if new.reason_category is null then
    return new;
  end if;

  select m.mission_type into v_mission_type
    from public.mission_milestone_submissions sub
    join public.mission_participants mp on mp.id = sub.mission_participant_id
    join public.missions m on m.id = mp.mission_id
    where sub.id = new.submission_id;

  if v_mission_type = 'receipt_cashback' then
    if new.reason_category not in ('unreadable', 'wrong_venue', 'duplicate', 'amount_unclear', 'other') then
      raise exception 'bad_reason_category_for_receipt_cashback';
    end if;
  else
    if new.reason_category not in ('format', 'key_message', 'compliance', 'quality', 'other') then
      raise exception 'bad_reason_category_for_mission_type';
    end if;
  end if;

  return new;
end;
$$;

create trigger enforce_reason_category_taxonomy_trg
  before insert on public.mission_review_events
  for each row execute function public.enforce_reason_category_taxonomy();
```

**Step 3: Widen admin_review_submission's inline validation**

`admin_review_submission` (`supabase/migrations/20260819090100_r11_0_admin_review_submission.sql`) has its own inline `if p_reason_category is not null and p_reason_category not in (...) then raise exception 'bad_reason_category'; end if;` check, BEFORE it ever reaches the `mission_review_events` insert — this must also become mission-type-aware, or a caller would get a confusing early `bad_reason_category` error for a perfectly valid receipt reason (or vice versa) before the new trigger ever gets a chance to run. Append this to the SAME migration file, after the trigger above:

```sql
-- admin_review_submission's OWN inline reason-category check runs before the
-- mission_review_events insert ever happens, so it must independently know the same
-- mission-type-aware taxonomy as the trigger above, not just the flat R11.0 list.
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
  v_mission_type text;
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

  select m.mission_type into v_mission_type
    from public.mission_milestone_submissions sub
    join public.mission_participants mp on mp.id = sub.mission_participant_id
    join public.missions m on m.id = mp.mission_id
    where sub.id = p_submission_id;

  if p_reason_category is not null then
    if v_mission_type = 'receipt_cashback' then
      if p_reason_category not in ('unreadable', 'wrong_venue', 'duplicate', 'amount_unclear', 'other') then
        raise exception 'bad_reason_category';
      end if;
    else
      if p_reason_category not in ('format', 'key_message', 'compliance', 'quality', 'other') then
        raise exception 'bad_reason_category';
      end if;
    end if;
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

  perform public.ops_audit_log_append('mission_submission', p_submission_id, 'submission.' || p_action, p_reason_text,
    jsonb_build_object('from', v_status, 'to', v_next_status, 'reason_category', p_reason_category));
end;
$$;
```

Confirm this reproduces the REAL current function body exactly (re-read `20260819090100_r11_0_admin_review_submission.sql` and diff against what you write) except for the two additions: the `v_mission_type` lookup/declare, and replacing the flat `if p_reason_category is not null and p_reason_category not in (...)` check with the mission-type-aware version above. Function signature is unchanged (no new params), so no `DROP FUNCTION` is needed.

- [ ] **Step 4: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-2-receipt-reason-taxonomy.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260822090300_r12_2_receipt_reason_taxonomy.sql'),
  'utf8',
)

describe('R12.2 receipt-specific rejection reason taxonomy', () => {
  it('widens the flat reason_category check to the union of both taxonomies', () => {
    expect(sql).toContain("'format', 'key_message', 'compliance', 'quality', 'other',")
    expect(sql).toContain("'unreadable', 'wrong_venue', 'duplicate', 'amount_unclear'")
  })

  it('adds a mission-type-aware trigger enforcing the correct taxonomy per mission type', () => {
    expect(sql).toContain('before insert on public.mission_review_events')
    expect(sql).toContain("if v_mission_type = 'receipt_cashback' then")
    expect(sql).toContain("raise exception 'bad_reason_category_for_receipt_cashback'")
    expect(sql).toContain("raise exception 'bad_reason_category_for_mission_type'")
  })

  it('widens admin_review_submission with the same mission-type-aware check, signature unchanged', () => {
    expect(sql).not.toContain('drop function public.admin_review_submission')
    expect(sql).toContain('create or replace function public.admin_review_submission(')
    expect(sql).toContain('select m.mission_type into v_mission_type')
  })

  it('preserves every existing guard in admin_review_submission unchanged', () => {
    expect(sql).toContain("if not public.is_active_ops_role('admin') then")
    expect(sql).toContain("raise exception 'reason_required'")
    expect(sql).toContain("raise exception 'stale_status'")
    expect(sql).toContain('perform public.ops_audit_log_append(')
  })
})
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-2-receipt-reason-taxonomy`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260822090300_r12_2_receipt_reason_taxonomy.sql apps/web/tests/db.r12-2-receipt-reason-taxonomy.test.ts
git commit -m "feat(db): R12.2 mission-type-aware rejection reason taxonomy for receipts"
```

---

### Task 5: submit_receipt RPC with the per-creator cap enforced under lock

**Files:**
- Create: `supabase/migrations/20260822090400_r12_2_submit_receipt.sql`
- Test: `apps/web/tests/db.r12-2-submit-receipt.test.ts`

- [ ] **Step 1: Read the real submission flow this RPC must fit alongside**

Run `grep -rln "submitMilestoneAction\|submit_milestone" apps/web/lib supabase/migrations` to find the existing creator-facing milestone-submission path (both the TS action and, if one exists, an underlying RPC or direct-write pattern) for a NON-repeatable milestone — read it in full so `submit_receipt` follows the same auth/ownership-check shape rather than inventing a different pattern. Also re-read `supabase/migrations/20260821100100_r12_0_claim_offer.sql` (or the final R12.1-widened version) for the exact "lock a row, count active rows against a limit, insert if under cap" idiom this RPC should mirror for its own cap check.

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/20260822090400_r12_2_submit_receipt.sql
--
-- Creator-facing entry point for a repeatable receipt-cashback submission. Locks the
-- mission_milestones row (the one repeatable milestone a receipt_cashback mission has) to
-- serialize concurrent submissions from the same creator, counts their own 'submitted'/
-- 'approved' rows against missions.max_receipts_per_creator (a rejected receipt frees up a
-- slot -- only active rows count), then inserts. Mirrors claim_offer's lock-count-insert
-- shape (R12.0/R12.1).
create or replace function public.submit_receipt(
  p_mission_id uuid,
  p_proof_urls text[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_creator_id uuid := auth.uid();
  v_participant_id uuid;
  v_milestone_id uuid;
  v_max_receipts integer;
  v_active_count integer;
  v_mission_type text;
  v_submission_id uuid;
begin
  if v_creator_id is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if coalesce(array_length(p_proof_urls, 1), 0) = 0 then raise exception 'proof_required'; end if;

  select mission_type, max_receipts_per_creator into v_mission_type, v_max_receipts
    from public.missions
    where id = p_mission_id
    for update;
  if not found then raise exception 'mission_not_found' using errcode = 'P0002'; end if;
  if v_mission_type <> 'receipt_cashback' then raise exception 'wrong_mission_type'; end if;

  select id into v_participant_id
    from public.mission_participants
    where mission_id = p_mission_id and creator_id = v_creator_id and status = 'active';
  if v_participant_id is null then raise exception 'not_active_participant' using errcode = '42501'; end if;

  select id into v_milestone_id
    from public.mission_milestones
    where mission_id = p_mission_id and repeatable = true
    limit 1;
  if v_milestone_id is null then raise exception 'no_repeatable_milestone' using errcode = 'P0002'; end if;
  -- Task 1's create_repeatable_milestone_for_receipt_mission trigger guarantees this row
  -- always exists for a receipt_cashback mission, regardless of how the mission was
  -- created -- this lookup should never actually miss in practice; the guard exists as a
  -- defensive check, not because a real gap is expected here.

  if v_max_receipts is not null then
    select count(*) into v_active_count
      from public.mission_milestone_submissions
      where mission_milestone_id = v_milestone_id
        and mission_participant_id = v_participant_id
        and status in ('submitted', 'approved');
    if v_active_count >= v_max_receipts then
      raise exception 'receipt_cap_reached';
    end if;
  end if;

  insert into public.mission_milestone_submissions (
    mission_milestone_id, mission_participant_id, status, proof_urls, submitted_at
  ) values (
    v_milestone_id, v_participant_id, 'submitted', p_proof_urls, now()
  )
  returning id into v_submission_id;

  return jsonb_build_object('submission_id', v_submission_id);
end;
$$;

revoke all on function public.submit_receipt(uuid, text[]) from public, anon;
grant execute on function public.submit_receipt(uuid, text[]) to authenticated;
```

Adjust the exact validation guards/error codes if Step 1's research reveals the real existing submission RPC/action follows a meaningfully different auth-check shape (e.g. a different way of confirming the caller is an active participant, or a different proof-urls validation rule) — match the REAL established convention over this sketch where they conflict, and note any deviation in your report.

- [ ] **Step 3: Write the migration-text contract test**

```typescript
// apps/web/tests/db.r12-2-submit-receipt.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260822090400_r12_2_submit_receipt.sql'),
  'utf8',
)

describe('submit_receipt RPC', () => {
  it('locks the mission row and rejects a non-receipt_cashback mission', () => {
    expect(sql).toContain('from public.missions')
    expect(sql).toContain('for update')
    expect(sql).toContain("if v_mission_type <> 'receipt_cashback' then raise exception 'wrong_mission_type'")
  })

  it('requires an active participant row before allowing a submission', () => {
    expect(sql).toContain("status = 'active'")
    expect(sql).toContain("raise exception 'not_active_participant'")
  })

  it('enforces the cap by counting only submitted/approved rows, not rejected ones', () => {
    expect(sql).toContain("status in ('submitted', 'approved')")
    expect(sql).toContain("raise exception 'receipt_cap_reached'")
  })

  it('skips the cap check entirely when max_receipts_per_creator is null', () => {
    expect(sql).toContain('if v_max_receipts is not null then')
  })

  it('restricts execution to authenticated only', () => {
    expect(sql).toContain('revoke all on function public.submit_receipt(uuid, text[]) from public, anon')
    expect(sql).toContain('grant execute on function public.submit_receipt(uuid, text[]) to authenticated')
  })
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run db.r12-2-submit-receipt`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260822090400_r12_2_submit_receipt.sql apps/web/tests/db.r12-2-submit-receipt.test.ts
git commit -m "feat(db): R12.2 submit_receipt RPC with race-safe per-creator cap"
```

---

### Task 6: Hand-add packages/db/types.ts entries

No `pnpm --filter @kinnso/db gen` — it reads production (see `db-gen-linked-production-gotcha` in project notes).

**Files:**
- Modify: `packages/db/types.ts`

- [ ] **Step 1: Widen missions, mission_milestones, mission_milestone_submissions, mission_settlements**

Read `packages/db/types.ts` and locate each table's `Row`/`Insert`/`Update` blocks. Add, matching the file's real existing key-ordering convention in each block (confirm alphabetical vs. insertion-order before placing — do not assume, Task 6 of the R12.1 plan found this file's ordering is genuinely alphabetical, but re-verify for these specific tables):

To `missions`: `max_receipts_per_creator: number | null` (Row), `max_receipts_per_creator?: number | null` (Insert/Update). Widen `mission_type`'s literal union type (if the generated types file types it as a string union rather than plain `string`) to include `'receipt_cashback'`.

To `mission_milestones`: `repeatable: boolean` (Row), `repeatable?: boolean` (Insert/Update).

To `mission_milestone_submissions`: `milestone_repeatable: boolean` (Row), `milestone_repeatable?: boolean` (Insert/Update).

To `mission_settlements`: `mission_milestone_submission_id: string | null` (Row), `mission_milestone_submission_id?: string | null` (Insert/Update). Widen `source`'s literal union type (if typed as one) to include `'receipt_cashback'`.

- [ ] **Step 2: Add the new submit_receipt RPC's Args/Returns**

Find the `Functions` block and add, in the same alphabetically-sorted position as its siblings:

```typescript
      submit_receipt: {
        Args: {
          p_mission_id: string
          p_proof_urls: string[]
        }
        Returns: Json
      }
```

- [ ] **Step 3: Confirm admin_review_submission needs no Args changes**

`admin_review_submission`'s signature is unchanged (Task 4 widened its body, not its params) — confirm its existing `Functions` entry needs no edit, and confirm `create_mission_settlement_on_approval` has no `Functions` entry at all (it's a trigger function, never called directly via `.rpc()`, so it shouldn't appear in this generated-types file's RPC section — if it somehow does, leave it as-is, its signature is also unchanged).

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean

- [ ] **Step 5: Commit**

```bash
git add packages/db/types.ts
git commit -m "chore(db): hand-add R12.2 types (receipt_cashback mission type, repeatable milestones, submit_receipt)"
```

---

### Task 7: Merchant mission-creation UI gains the receipt_cashback option

**Files:**
- Modify: whichever file(s) implement the merchant mission-creation form — find via `grep -rln "coupon_affiliate.*hybrid.*paid\|mission_type.*'coupon_affiliate'" apps/web/components apps/web/app apps/web/lib`
- Test: extend whatever existing test file(s) cover that form

- [ ] **Step 1: Read the real, current mission-creation form and its underlying create-mission server action/RPC**

Find and read the full mission-creation flow (form component + server action + the RPC or table insert it calls) in full. Confirm exactly how `mission_type` is currently selected/validated client-side and server-side, and what fields are shown/required for `paid` (since `receipt_cashback` reuses `paid_fee_amount`/`paid_fee_currency`, its field set should look similar, but relabeled).

- [ ] **Step 2: Add the receipt_cashback option**

Add `'receipt_cashback'` as a fourth mission-type choice in the form, showing: the existing paid-fee-amount/currency fields, relabeled to describe per-receipt cashback rather than a flat mission fee (read the real component's existing label strings and i18n-key naming convention from Step 1's research, and follow that exact convention for the new label — do not invent a different naming scheme), and a new optional `max_receipts_per_creator` numeric input. Widen the server action's/RPC's validation to accept `'receipt_cashback'` as a valid `mission_type` and to pass `max_receipts_per_creator` through to the insert.

Write this task's exact code once Step 1's research is complete and the real file paths/shapes are known — do not guess at component structure blind. If the real form's structure differs substantially from a simple type-selector-plus-fields pattern (e.g., it's a multi-step wizard, or mission_type selection happens in a completely different flow than field entry), adapt the approach to fit what's real rather than forcing this sketch's shape, and note the deviation in your report.

- [ ] **Step 3: Extend the existing test(s)**

Add test cases confirming: selecting `receipt_cashback` shows the per-receipt-amount and cap fields (and hides fields irrelevant to this type, e.g. affiliate commission rate inputs, mirroring however the form already conditionally shows fields per existing mission type); submitting with `receipt_cashback` and a valid per-receipt amount succeeds; submitting `receipt_cashback` with no per-receipt amount is rejected (mirroring however `paid` missions already validate a required fee amount).

- [ ] **Step 4: Run the tests and typecheck**

Run the real test file(s) found in Step 1, and `cd apps/web && npx tsc --noEmit`.
Expected: PASS, clean

- [ ] **Step 5: Commit**

```bash
git add <the real files touched>
git commit -m "feat(web): R12.2 merchant mission creation supports receipt_cashback"
```

---

### Task 8: Creator-facing "submit a receipt" UI

**Files:**
- Create or modify: the creator-facing mission detail/participation view — find the real file via `grep -rln "submitMilestoneAction\|mission_milestone" apps/web/components apps/web/app/[locale]/studio`
- Test: a new or extended test file matching whatever convention Task 7's research uncovered

- [ ] **Step 1: Read the real creator-facing mission participation UI**

Find and read the component(s) a creator sees when viewing a mission they've joined, specifically how existing (non-repeatable) milestone submission currently works client-side (file upload → server action → `submitMilestoneAction`-equivalent). This is the UI `submit_receipt` (Task 5) needs a client entry point for.

- [ ] **Step 2: Add the repeatable-receipt submission UI**

For a `receipt_cashback` mission, replace the fixed-milestone-checklist UI (which doesn't apply here — there's exactly one repeatable milestone, not a fixed list) with: a "Submit a receipt" action (photo upload, reusing whatever upload mechanism the existing milestone-proof upload already uses), a running count against `max_receipts_per_creator` if set (e.g. "2 of 5 receipts submitted"), and a list of past submissions with their status (`submitted`/`approved`/`rejected`/`revision_requested`) and, for a rejected one, its reason.

A new server action wrapping `submit_receipt` (Task 5) — follow the exact error-mapping convention the codebase already uses elsewhere this session (e.g. `claimOfferAction`'s `FRIENDLY` error-message table pattern from `apps/web/lib/offers/actions.ts`) to map `wrong_mission_type`/`not_active_participant`/`receipt_cap_reached`/`proof_required` into user-facing copy.

Write this task's exact code once Step 1's research is complete — do not guess at component structure blind. Note in your report the real file(s) you created/modified and why, and flag any place the real UI's existing patterns forced a different shape than this sketch describes.

- [ ] **Step 3: Write tests**

Cover: the cap-reached error surfaces a clear message and disables further submission; a rejected receipt's reason is shown; a successful submission clears the upload form and appends to the submission history list.

- [ ] **Step 4: Run the tests and typecheck**

Run the new/extended test file(s), and `cd apps/web && npx tsc --noEmit`.
Expected: PASS, clean

- [ ] **Step 5: Commit**

```bash
git add <the real files touched>
git commit -m "feat(web): R12.2 creator-facing repeatable receipt submission UI"
```

---

### Task 9: i18n across all 7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/*.ts` (en, zh-hk, zh-tw, zh-cn, ja, ko, th)

- [ ] **Step 1: Identify every new user-facing string introduced by Tasks 7-8**

Grep the diffs from Tasks 7-8 for every new string literal rendered to a user (mission-type label, per-receipt-amount field label, cap field label, "submit a receipt" action, cap-reached/not-active-participant/proof-required error copy, submission history status labels, rejected-reason display strings for the 5 new receipt reason categories: `unreadable/wrong_venue/duplicate/amount_unclear/other`).

- [ ] **Step 2: Add the type declaration and all 7 locales' real content**

Add each new key to wherever the relevant message-namespace type is declared (`en.ts`, per this session's established pattern) and to all 7 locale files' content. Write real, natural translations for the 6 non-English locales — read 5-10 neighboring existing keys in each specific locale file first (not inferred from English alone) so terminology/register stays consistent with that file's existing voice, per this codebase's documented translation-fidelity requirement (the locale-parity test only checks key presence, not translation quality, so accuracy here is the implementer's own responsibility, not something a test will catch). Reuse existing established terms where they already exist in each locale file (e.g. if "receipt" or "cashback" already has a translated precedent anywhere else in that file, reuse it rather than inventing a new rendering) rather than translating each string in isolation.

- [ ] **Step 3: Run the i18n parity test**

Run: `cd apps/web && npx vitest run i18n.locale-parity`
Expected: PASS

- [ ] **Step 4: Typecheck and lint**

Run: `cd apps/web && npx tsc --noEmit`
Run: `cd "/Users/willylai/Documents/Claude/Projects/Remix Kinnso/kinnso-v3" && pnpm --filter web lint`
Expected: clean, no new warnings

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/i18n/messages/*.ts
git commit -m "feat(web): R12.2 i18n for receipt-cashback mission type across all 7 locales"
```

---

### Task 10: Live proof

**Files:**
- Create: `apps/web/tests/receipt-cashback.rls.test.ts`

Local Supabase stack only — never production. Use `randomUUID()` throughout, per this repo's documented fixed-UUID-collision gotcha.

- [ ] **Step 1: Start the local stack and reset**

```bash
cd "/Users/willylai/Documents/Claude/Projects/Remix Kinnso/kinnso-v3" && npx supabase start && npx supabase db reset
```

Confirm all migrations, including this phase's 5, apply cleanly.

- [ ] **Step 2: Write the live-proof test**

Model the fixture setup on `apps/web/tests/offers.rls.test.ts` / `apps/web/tests/offers-attribution.rls.test.ts`'s established pattern (signed-in creator/merchant-staff clients, `admin` service-role client, real inserts for `merchant_profiles`/`missions`/`mission_participants`) — read one of those files first for the exact real connection/fixture boilerplate rather than reinventing it. Build a `receipt_cashback` mission (`paid_fee_amount` set as the per-receipt cashback, `max_receipts_per_creator = 2`) with an active participant — do NOT manually insert a `mission_milestones` row for this fixture; Task 1's `create_repeatable_milestone_for_receipt_mission_trg` creates it automatically the moment the mission row is inserted. (The `paid`-mission fixture built later in this same file for a different test DOES need a manual milestone insert, since that trigger only fires for `mission_type = 'receipt_cashback'`.) Then cover:

```typescript
  it('a creator can submit and get approved for more than one receipt, each minting its own settlement', async () => {
    const { data: sub1 } = await creatorClient.rpc('submit_receipt', {
      p_mission_id: missionId, p_proof_urls: [`https://example.test/receipt-${randomUUID()}.jpg`],
    })
    const submission1Id = (sub1 as { submission_id: string }).submission_id

    await admin.rpc('admin_review_submission', {
      p_submission_id: submission1Id, p_action: 'approve',
    })

    const { data: sub2 } = await creatorClient.rpc('submit_receipt', {
      p_mission_id: missionId, p_proof_urls: [`https://example.test/receipt-${randomUUID()}.jpg`],
    })
    const submission2Id = (sub2 as { submission_id: string }).submission_id

    await admin.rpc('admin_review_submission', {
      p_submission_id: submission2Id, p_action: 'approve',
    })

    const { data: settlements } = await admin
      .from('mission_settlements')
      .select('id, mission_milestone_submission_id, source, paid_fee_amount')
      .in('mission_milestone_submission_id', [submission1Id, submission2Id])
    expect(settlements ?? []).toHaveLength(2)
    for (const s of settlements!) {
      expect(s.source).toBe('receipt_cashback')
    }
  })

  it('the per-creator cap blocks a third submission once max_receipts_per_creator is reached', async () => {
    const { error } = await creatorClient.rpc('submit_receipt', {
      p_mission_id: missionId, p_proof_urls: [`https://example.test/receipt-${randomUUID()}.jpg`],
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('receipt_cap_reached')
  })

  it('a rejected receipt does not count against the cap and a resubmission succeeds', async () => {
    // Uses a SEPARATE mission fixture from the two tests above (fresh randomUUID-seeded
    // mission/participant) so this test's own cap accounting isn't polluted by the prior
    // two approved submissions in this file.
    const { data: mission2 } = await admin.from('missions').insert({
      merchant_profile_id: merchantAId, title: `Receipt Mission ${randomUUID()}`,
      summary: 'Test receipt mission', mission_source: 'merchant',
      mission_type: 'receipt_cashback', status: 'published', visibility: 'open',
      auto_approve_policy: 'off', paid_fee_amount: 20, paid_fee_currency: 'HKD',
      max_receipts_per_creator: 1,
    }).select('id').single()
    const mission2Id = mission2!.id as string

    await admin.from('mission_participants').insert({
      mission_id: mission2Id, creator_id: creatorId, status: 'active', source: 'open_join',
    })

    const { data: firstAttempt } = await creatorClient.rpc('submit_receipt', {
      p_mission_id: mission2Id, p_proof_urls: [`https://example.test/receipt-${randomUUID()}.jpg`],
    })
    const firstSubmissionId = (firstAttempt as { submission_id: string }).submission_id

    await admin.rpc('admin_review_submission', {
      p_submission_id: firstSubmissionId, p_action: 'reject', p_reason_category: 'unreadable',
    })

    const { data: secondAttempt, error: secondError } = await creatorClient.rpc('submit_receipt', {
      p_mission_id: mission2Id, p_proof_urls: [`https://example.test/receipt-${randomUUID()}.jpg`],
    })
    expect(secondError).toBeNull()
    expect((secondAttempt as { submission_id: string }).submission_id).not.toBe(firstSubmissionId)
  })

  it('an existing paid mission approval still mints exactly one mission_fee settlement, untouched by the receipt_cashback branch', async () => {
    // Reuses the existing paid-mission settlement guarantee this phase's Task 3 explicitly
    // promised not to disturb.
    const { data: paidMission } = await admin.from('missions').insert({
      merchant_profile_id: merchantAId, title: `Paid Mission ${randomUUID()}`,
      summary: 'Test paid mission', mission_source: 'merchant',
      mission_type: 'paid', status: 'published', visibility: 'open',
      auto_approve_policy: 'off', paid_fee_amount: 100, paid_fee_currency: 'HKD',
    }).select('id').single()
    const paidMissionId = paidMission!.id as string

    const { data: paidParticipant } = await admin.from('mission_participants').insert({
      mission_id: paidMissionId, creator_id: creatorId, status: 'active', source: 'open_join',
    }).select('id').single()
    const paidParticipantId = paidParticipant!.id as string

    const { data: milestone } = await admin.from('mission_milestones').insert({
      mission_id: paidMissionId, title: 'Post about it', description: 'Share a post', repeatable: false,
    }).select('id').single()
    const milestoneId = milestone!.id as string

    const { data: submission } = await admin.from('mission_milestone_submissions').insert({
      mission_milestone_id: milestoneId, mission_participant_id: paidParticipantId,
      status: 'submitted', proof_urls: [`https://example.test/proof-${randomUUID()}.jpg`],
      submitted_at: new Date().toISOString(),
    }).select('id').single()

    await admin.rpc('admin_review_submission', {
      p_submission_id: submission!.id as string, p_action: 'approve',
    })

    const { data: settlements } = await admin
      .from('mission_settlements')
      .select('id, source')
      .eq('mission_participant_id', paidParticipantId)
    expect(settlements ?? []).toHaveLength(1)
    expect(settlements![0].source).toBe('mission_fee')
  })

  it('a receipt rejection requires a receipt-taxonomy reason, and a receipt reason is rejected on a non-receipt mission', async () => {
    // Covers Task 4's mission-type-aware taxonomy trigger in both directions. The outer
    // beforeAll's mission is already at its cap from the first `it` in this file
    // (max_receipts_per_creator: 2, both slots consumed), so this test builds its own
    // dedicated, uncapped receipt_cashback mission rather than relying on missionId.
    const { data: receiptMission } = await admin.from('missions').insert({
      merchant_profile_id: merchantAId, title: `Taxonomy Mission ${randomUUID()}`,
      summary: 'Test taxonomy mission', mission_source: 'merchant',
      mission_type: 'receipt_cashback', status: 'published', visibility: 'open',
      auto_approve_policy: 'off', paid_fee_amount: 20, paid_fee_currency: 'HKD',
    }).select('id').single()
    const receiptMissionId = receiptMission!.id as string
    await admin.from('mission_participants').insert({
      mission_id: receiptMissionId, creator_id: creatorId, status: 'active', source: 'open_join',
    })
    const { data: receiptSub } = await creatorClient.rpc('submit_receipt', {
      p_mission_id: receiptMissionId, p_proof_urls: [`https://example.test/receipt-${randomUUID()}.jpg`],
    })
    const receiptSubmissionId = (receiptSub as { submission_id: string }).submission_id

    const { error: wrongTaxonomyForReceipt } = await admin.rpc('admin_review_submission', {
      p_submission_id: receiptSubmissionId, p_action: 'reject', p_reason_category: 'format',
    })
    expect(wrongTaxonomyForReceipt).not.toBeNull()

    const { error: rightTaxonomyForReceipt } = await admin.rpc('admin_review_submission', {
      p_submission_id: receiptSubmissionId, p_action: 'reject', p_reason_category: 'unreadable',
    })
    expect(rightTaxonomyForReceipt).toBeNull()
  })
```

Every test in this file is complete, executable code — no placeholder comments describing what a test should do without showing it.

- [ ] **Step 3: Run the live-proof tests**

Run: `cd apps/web && npx vitest run receipt-cashback.rls`
Expected: PASS (5 tests). Investigate any failure as a potential real bug in an earlier task's migration before assuming the test itself is wrong — this session's own history (R12.1) found real bugs hiding behind confident self-reports more than once.

- [ ] **Step 4: Run the full test suite before tearing down**

```bash
cd apps/web && npx vitest run
```
Expected: PASS, aside from the documented pre-existing UUID-collision flake (`settlement-minting.rls.test.ts`/`mission-review.rls.test.ts`) and, if the full suite is run at high concurrency, the local-stack resource-contention timeouts already established as non-regressions in this session's history — re-run any genuinely new failure in isolation before concluding it's contention rather than real.

- [ ] **Step 5: Tear down**

```bash
npx supabase stop
```
Confirm via `docker ps` that no `kinnso-v3` containers remain.

- [ ] **Step 6: Commit**

```bash
git add apps/web/tests/receipt-cashback.rls.test.ts
git commit -m "test(db): R12.2 live proof — repeatable receipt settlements, cap enforcement, taxonomy"
```

## Post-implementation

Open a PR titled `Phase R12.2 — Receipt-Based Cashback Missions`, branch `feat/r12-2-receipt-cashback` off up-to-date `main` (this design/plan pair currently lives on `docs/r12-2-receipt-cashback-design` — start the implementation branch fresh off `main`, not off that docs branch).

**Not covered by this plan, needs separate action after merge:** every migration here needs to be applied to production separately, following the same "merging to main does not auto-deploy migrations" convention every prior phase this session has followed — confirm the real, current production state of `create_mission_settlement_on_approval` and `admin_review_submission` (their live function bodies) before writing the copy-paste deployment bundle, rather than assuming the local migration files are what's actually live, exactly as R12.1's own deployment note advised.
