# Phase R10.2 — Payout Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ops can promise a creator a specific payout amount, in a specific currency, by a
target date — as an auditable, idempotent, RPC-only "batch" — and mark it paid or cancel it,
replacing the one remaining unaudited direct-write path (`/ops/settlements`) with the
already-audited flow at `/admin/creators/payouts`.

**Architecture:** Two new tables (`creator_payout_batches`, `creator_payout_decisions`) sit
above the existing `mission_settlements` row-level ledger (R10.0/R10.1). A batch is a money
*promise*; a decision is the append-only record of the ops judgment call (approve/cancel)
that created or undid a promise. Both tables have RLS enabled with **zero policies** — every
access is through a `SECURITY DEFINER` RPC, mirroring `ops_audit_log`. `admin_create_payout_batch`
and `admin_cancel_payout` take a client-supplied `idempotency_key`; a replay with the same key
and the same arguments is a safe no-op, a replay with the same key and *different* arguments
raises `idempotency_conflict`. `/ops/settlements` becomes a locale-aware redirect stub (same
shape as the existing `/merchants/post` legacy stub) pointing at `/admin/creators/payouts`,
which is what `/studio` already sends ops users to. The rail an actual payment travels over
(bank transfer, PayMe, Stripe Connect) is explicitly out of scope — R10.2 is the promise layer
only, per the roadmap's "rail-agnostic" framing.

**Tech Stack:** Supabase Postgres (SQL migrations, `plpgsql` `SECURITY DEFINER` functions) ·
Next.js 16 App Router server actions · TypeScript · Vitest 4 · 7-locale i18n dictionaries.

---

## Errata

*(Any post-hoc corrections discovered during execution are recorded here, appended — never
by rewriting a task's original code block, per the R10.0 plan's own precedent.)*

1. **Task 1, Step 4** says "Expected: PASS (11 tests)". The test code in Step 1 has 10
   `it(...)` blocks, and 10 is what actually runs and passes. Off-by-one in this document's
   prose only — the implementer correctly left the test code as specified rather than
   padding it to match the miscounted expectation.

2. **Task 1's code quality review** found two Important issues in the Step 3 migration text
   as originally written: the header comment overclaimed that RLS blocks `service_role`
   (it doesn't — `service_role` bypasses RLS and already has blanket grants via
   `20260613000006_grants.sql`), and `creator_payout_batches_immutable()` didn't validate
   `paid_at`/`cancelled_at` against the target status. Both were fixed in a follow-up commit
   (`38b6044`) rather than by editing this document's original code block — the fixed SQL
   differs from what Step 3 shows above. Read the migration file itself, not this document,
   for Task 1's authoritative current text.

3. **Task 2, Step 3 vs Step 1 mismatch:** the SQL block as originally written used plain
   `create function` for `admin_set_payout_processing_window`; Step 1's test asserted
   `create or replace function`, matching this codebase's exceptionless convention that
   every `admin_*` mutation RPC uses `or replace` (plain `create function` is reserved for
   trigger functions and simple read helpers, e.g. this same migration's
   `payout_processing_window_days()`). The implementer corrected the migration to `create or
   replace function` rather than weakening the test. Read the migration file itself for the
   authoritative text.

4. **Task 2's code quality review** found one Important issue: `admin_set_payout_processing_window`
   read the old value without locking the row (`for update`), unlike this codebase's
   established read-old-value-then-write pattern elsewhere. Fixed in a follow-up commit
   (`635de33`).

5. **Task 3, Step 4** says "Expected: PASS (9 tests)". The test code in Step 1 has 10
   `it(...)` blocks, and 10 is what actually runs and passes — the same off-by-one pattern
   as Task 1's Errata #1. No code impact.

6. **Task 3's code quality review** found two Important issues in the Step 3 RPC as
   originally written: `p_target_at` had no sanity bound (a past date was silently
   accepted, and this value is creator-visible in a later task), and a genuine concurrent
   double-first-submission with the same never-before-seen `idempotency_key` could surface
   a raw Postgres `unique_violation` instead of a clean `idempotency_conflict`/replay
   response (no data-integrity risk — the unique index still prevented a duplicate row —
   purely a graceful-degradation gap). Fixed in commit `5aecf4f`, which wraps the two
   inserts in a PL/pgSQL subtransaction (`begin ... exception when unique_violation then
   ...`) that re-checks the idempotency key on conflict and re-raises unchanged for any
   other constraint (e.g. the creator+currency pending-batch race, which remains
   deliberately unhandled — a separate, out-of-scope race). The function's header comment
   (unmodified, per explicit instruction to keep the fix narrowly scoped) is now slightly
   stale on this point. The re-review that approved `5aecf4f` flagged this staleness as a
   real risk (two sections of the same function disagreeing about the concurrency
   mechanism could mislead a future maintainer into removing the exception-handling block),
   so it was fixed in a follow-up commit `c126fe8`. Read the migration file itself for
   Task 3's authoritative current text.

7. **Task 4's Step 1 test had a genuinely unsatisfiable assertion**, not a prose-count slip:
   `expect(sql).not.toContain('insert into public.creator_payout_decisions')` was written
   against the whole file's text, but `admin_cancel_payout` — required to live in the same
   migration file as `admin_mark_payout_paid` — legitimately performs exactly that insert
   (it's the "cancel writes a decision row" requirement two tests later in the same file).
   The assertion was unsatisfiable by construction, not fixable by changing the SQL. The
   implementer scoped the check to `sql.split('create or replace function
   public.admin_cancel_payout(')[0]` — everything before that function begins, which is
   exactly `admin_mark_payout_paid`'s own text — preserving the original intent (mark-paid
   itself never writes a decision row) while making the assertion actually satisfiable. Read
   the test file itself for the authoritative current text; this document's Step 1 code
   block above is what was originally asked for, not what shipped.

8. **Task 4's code quality review** found one Important issue in `admin_cancel_payout`: a
   narrower version of Task 3's pre-fix race — two concurrent calls reusing the same
   never-before-seen `idempotency_key` across DIFFERENT batch ids don't serialize (they lock
   different batch rows) and can both reach the decisions insert, surfacing a raw
   `unique_violation` instead of `idempotency_conflict`. Fixed in `35ac24c`, wrapping the
   batch `update` and the decision `insert` together in one subtransaction (not the insert
   alone, unlike Task 3 — cancel's shape is update-then-insert against an existing row,
   where wrapping only the insert risks stranding the update). One nuance surfaced during
   the fix and independently verified by the controller: because `v_hash` includes
   `p_batch_id`, two different batch ids always hash differently, so the exception handler's
   `replayed: true` success branch is unreachable in practice for cancel — any race that
   reaches this code always takes the `idempotency_conflict` re-raise branch, which aborts
   the whole transaction and would roll back the update regardless of block boundaries. The
   fix is still correct and worth keeping: it's what translates the raw Postgres error into
   the app's `idempotency_conflict` vocabulary (the actual point, same as Task 3's own
   framing — no data-integrity risk either way), and wrapping both statements together is
   the more robust shape if the hash formula ever changes to stop including `p_batch_id`.
   Read the migration file itself for Task 4's authoritative current text.

9. **Task 5's code quality review** raised one Important finding: `admin_list_payout_batches`
   has no pagination, unlike `admin_search_creators`/`admin_search_merchants` elsewhere in
   this codebase, which both cap and cursor-paginate. Fixed instead as a documented decision
   NOT to add it: the reviewer's comparison was to those two RPCs, but the more directly
   relevant precedent — `listOpsSettlements` (`apps/web/lib/missions/queries.ts`), the
   sibling data source already rendering unpaginated on the exact same `/admin/creators/
   payouts` page since R10.0/R10.1 — has zero pagination itself (`select ... order by
   updated_at desc`, no limit). Adding pagination to only the new batches list while its
   sibling settlement queue stays unpaginated on the same page would be inconsistent UX and
   premature complexity, not a clear improvement. Also added: a small test-coverage fix
   (untested empty-array `coalesce`) from the same review's Minor findings, in `622cc06`.
   If `listOpsSettlements` itself is ever paginated, revisit `admin_list_payout_batches`
   alongside it — a joint upgrade, not a standalone one.

10. **Task 6's given `admin.payout-batches-queries.test.ts` had a `tsc`-breaking cast
    placement:** `client()` returned `{ rpc: vi.fn(...) } as never`, casting inside the
    helper — which makes the `supabase` variable itself type `never`, so later
    `expect(supabase.rpc).toHaveBeenCalledWith(...)` assertions fail to typecheck
    (`TS2339`). Fixed by moving the cast to the four call sites
    (`getPayoutBatches(supabase as never, ...)`), matching this codebase's own established
    convention in `admin.creators-directory-queries.test.ts` /
    `admin.creators-queries.test.ts`. Runtime behavior is unchanged (casts are erased); only
    what typechecks changes. Read the test file itself for the authoritative current text.

11. **Task 6's code quality review** found one Important, test-only gap: all three server
    actions gate app-side via the coarse `requireOpsAction` (any `ops` role), but their
    underlying RPCs gate on `is_active_ops_role('admin')` specifically — so a moderator/
    analyst can pass the app gate and get rejected at the RPC, and that path had zero test
    coverage (unlike the sibling `creators-actions.test.ts`, which tests this exact scenario
    for its own admin-gated actions). Fixed in `d48988c`, adding a `role-gate (R10.2)` block
    with one test per action — test-only, no production code change (`mapError` already
    handled it correctly). Read the test file itself for the authoritative current text.

12. **Task 7's Step 4 assumption was wrong**, discovered empirically rather than assumed:
    the plan claimed `getByText(t.missingKey)`/`getByPlaceholderText(...)` would gracefully
    treat an `undefined` matcher as "not found," since Task 10's i18n keys don't exist yet.
    In fact `@testing-library/dom` throws synchronously on an `undefined` matcher ("It looks
    like undefined was passed instead of a matcher"), and React renders an `undefined` child
    as nothing (not the literal string `"undefined"`) — so the given test as written
    crashed 6/7 cases, not passed 7/7 as claimed. Fixed in the TEST FILES ONLY (zero changes
    to the component or to `en.ts`, per this task's explicit instruction not to add i18n
    keys early): the component test merges a `PENDING_I18N_FALLBACK` object (each pending
    key mapped to its own key name as a placeholder string) under the real `en.creators`, so
    real Task 10 values automatically win once they land and the fallback becomes inert dead
    code (documented inline, one-line revert to clean up); the host test's one new assertion
    swaps to a `container.querySelector('.mt-8')` check against the component's stable root
    class instead, with an inline note to switch back to a text-based check once Task 10
    lands. Also corrected: the task text's context section said `CreatorPayoutsView` has "8
    existing tests" — it has 4 (confirmed unaffected either way). Read the two test files
    themselves for the authoritative current text.

13. **Task 7's code quality review** found four Important issues (a fifth — `pnpm typecheck`
    failing on the missing i18n keys — is the already-expected, tracked state per Errata #12,
    not a new finding). Fixed in `32dcbe7`: (a) the create/cancel idempotency key was
    generated fresh on every Apply click rather than per submission attempt, defeating the
    replay-safety guarantee Tasks 3-4 were built for — create now generates the key once
    when the dialog opens (state, reused across retries within that session), cancel now
    uses a deterministic `payout-cancel-${batchId}` key (mirrors the existing
    `apps/web/lib/bookings/actions.ts:107` `booking-refund-${id}` pattern); (b) the batches
    table's creator cell wasn't a link, unlike the settlement queue directly above it on the
    same page — now wrapped in the same `Link` pattern; (c) dates ignored the routed
    `locale` prop, falling back to each viewer's OS locale — `date()` now takes `locale` and
    both call sites pass it; (d) the paid/cancel confirm dialogs showed no batch-specific
    context before a money-touching commit, unlike the sibling's own "money-touching →
    required per spec §6" precedent — added a creator/amount/currency recap line to those
    two dialog kinds only (deliberately NOT the create dialog, which needs Task 10's
    not-yet-existing interpolated `confirmCreateBatch` copy — left as `t.actCreateBatch` for
    now). Read the component file itself for the authoritative current text.

14. **Task 8's Step 8 illustrative snippet was stale**: it showed a raw `<table>` shape, but
    `StudioEarningsView.tsx`'s real, already-shipped three sections use shared
    `Section`/`Rows`/`TicketCard`/`MissionStatusBadge` helpers the snippet didn't capture.
    The shipped 4th section correctly follows the real file's pattern instead of the stale
    snippet — a deliberate, correct deviation, not an implementer error (same class as Task
    7's dialog-styling deviation). Its code review then found two Important issues: (a) the
    target-date cell ignored the `locale` prop — a direct recurrence of the bug Task 7 (the
    task immediately prior) had already fixed on the sibling admin component, from copying
    the plan's own stale, unfixed snippet; (b) the two independent Supabase calls in
    `page.tsx` ran sequentially instead of via `Promise.all`, unlike two sibling `/studio/*`
    pages (`tier`, `perks`) that already parallelize the identical situation. Both fixed
    (`27323f0`, `f8eb5f0`), the second commit also closing a test-coverage gap: the original
    tests never asserted the 3-state status badge or that the date actually renders — the
    implementer caught mid-fix that testing with `locale="en"` wouldn't have proven anything
    (it formats identically to this runtime's bare default), and used `locale="ja"` instead
    for a test that actually fails if the prop is silently ignored. Read the component/page
    files themselves for the authoritative current text.

15. **Task 9 execution note, not a correction:** this document's Task 9 text claimed
    `settlementStatuses`/`SettlementStatus`/`SettlementPaymentStatus` are "not exclusively
    tied to the deleted path." Verified true for `settlementStatuses`/`SettlementStatus`
    (still used by `mission.state.test.ts`), but `SettlementPaymentStatus` specifically has
    zero remaining consumers after this task's deletions — left in place anyway, per the
    task's explicit "leave alone" instruction, rather than unilaterally removing something
    outside the task's stated scope. Also newly orphaned and deliberately left untouched
    (out of scope for this task, i18n files weren't in its file list): the `ops` message
    namespace across all 7 locale files, which existed only to feed the now-deleted
    `OpsSettlementView`. Both are legitimate small cleanup opportunities for a future task,
    not bugs in this one.

16. **Task 10 shipped 19 of the ~21 keys its own Steps 1-8 code blocks show** — deliberately
    dropping `formTargetDate` and `confirmCreateBatch` after confirming, via three
    independent sources (component source, both test files' now-removed fallback objects,
    and the pre-fix `tsc` error list), that neither is referenced anywhere: the shipped
    create-batch form has no target-date input, and its dialog title deliberately stayed as
    `t.actCreateBatch` rather than an interpolated confirm string (Errata #13(d)). **This
    document's Task 10 Steps 1-2 code blocks below still show both keys as if shipped — they
    were not.** A future phase should not assume `confirmCreateBatch` exists; read the
    locale files themselves for the authoritative current key set. Also noted by Task 10's
    code review: the zh-hk/zh-tw values for all 19 new keys are byte-identical, whereas the
    pre-existing surrounding `creators` block in both files already carries genuine HK/TW
    lexical divergence (菁英/精英, 撥款/派付, 停權/停用, etc.) — not a correctness defect (every
    term used is standard, correctly-understood Traditional Chinese in both regions), but a
    departure from this file's own established convention, worth a Taiwan-fluent pass at a
    future checkpoint rather than blocking this phase.

17. **Task 11's live proof (`payout-batches.rls.test.ts`) discovered a genuine, unplanned
    architectural fact**, verified independently by both the implementer and the controller
    directly against the live database's FK/trigger definitions: because
    `creator_payout_decisions` carries unconditional `BEFORE UPDATE`/`BEFORE DELETE` triggers
    (blocking every caller including `service_role`), and every FK in this phase's schema
    (`creator_payout_decisions.payout_batch_id`, `creator_payout_batches.creator_id`,
    `.created_by_ops_member_id`) is plain `NO ACTION` with no cascade, **once a payout batch
    gets its paired decision row, neither the batch nor the creator/ops-member rows it
    references can ever be deleted again** — a consequence of the append-only-ledger design
    (Task 1), not a bug. The live-proof test uses `randomUUID()`-generated seed ids per
    process and has no `afterAll` cleanup (a fixed-id pattern, as used by R10.1's sibling
    live proof, would make a second run collide with the first run's permanently-orphaned
    rows). This has no bearing on the shipped RPCs' correctness, but is a real operational
    fact worth knowing: there is currently no way to purge a wrongly-created payout batch
    from any environment, including production, once it has been approved.

---

### Task 1: Payout batch + decision schema

**Files:**
- Create: `supabase/migrations/20260816090000_r10_2_payout_batches_and_decisions.sql`
- Test: `apps/web/tests/db.payout-batches-schema.test.ts`

This is a migration-text contract test (same pattern as
`apps/web/tests/db.mint-settlement-affiliate.test.ts` from R10.1): it reads the migration
file off disk and asserts on its lowercased, whitespace-collapsed SQL text. It cannot run
against a live database in this environment, so it cannot catch a syntax error — Task 11's
live proof is what actually applies this SQL. Treat these assertions as a contract on what
the file must say, not a guarantee it runs.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_2_payout_batches_and_decisions.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.2 payout batches and decisions schema', () => {
  it('applies after R10.1 settlement minting', () => {
    expect(matches[0] > '20260815100300').toBe(true)
  })

  it('creates both tables', () => {
    expect(sql).toContain('create table public.creator_payout_batches')
    expect(sql).toContain('create table public.creator_payout_decisions')
  })

  it('constrains batch status to the three-state lifecycle', () => {
    expect(sql).toContain("check (status in ('pending', 'paid', 'cancelled'))")
  })

  it('constrains batch amount to be positive', () => {
    expect(sql).toContain('check (amount > 0)')
  })

  it('allows only one pending batch per creator and currency', () => {
    expect(sql).toContain(
      "create unique index creator_payout_batches_one_pending_uniq on public.creator_payout_batches (creator_id, currency) where status = 'pending'",
    )
  })

  it('constrains decision_kind to approved or cancelled', () => {
    expect(sql).toContain("check (decision_kind in ('approved', 'cancelled'))")
  })

  it('enforces one row per idempotency key', () => {
    expect(sql).toContain(
      'create unique index creator_payout_decisions_idempotency_key_uniq on public.creator_payout_decisions (idempotency_key)',
    )
  })

  it('revokes all client access to both tables — writes are RPC-only', () => {
    expect(sql).toContain('revoke all on public.creator_payout_batches from public, anon, authenticated')
    expect(sql).toContain('revoke all on public.creator_payout_decisions from public, anon, authenticated')
  })

  it('blocks a batch update once it has left pending', () => {
    expect(sql).toContain("if old.status <> 'pending' then")
    expect(sql).toContain("raise exception 'batch_immutable'")
  })

  it('blocks any update or delete on a decision row', () => {
    expect(sql).toContain('before update on public.creator_payout_decisions')
    expect(sql).toContain('before delete on public.creator_payout_decisions')
    expect(sql).toContain("raise exception 'decision_immutable'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.payout-batches-schema.test.ts`
Expected: FAIL — the migration file does not exist yet, so `matches` is `[]` and
`toHaveLength(1)` fails.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260816090000_r10_2_payout_batches_and_decisions.sql
--
-- R10.2: creator_payout_batches + creator_payout_decisions — the payout-promise layer.
--
-- Money already accrues correctly (R10.1 mints mission_settlements rows). This migration
-- adds the layer above individual settlements: an ops-created "batch" that promises to pay
-- a creator a specific amount in a specific currency by a target date, and an append-only
-- decision ledger recording who approved or cancelled that promise and why.
--
-- creator_payout_batches has exactly three states: pending -> paid, pending -> cancelled.
-- Once a batch leaves 'pending' it is immutable — enforced by a trigger below, not just by
-- RPC discipline, because this table is written only by SECURITY DEFINER RPCs and a trigger
-- is the one thing that still catches a bug in those RPCs (the "review_hardening.sql
-- lessons" checklist item from the R10-R13 roadmap's risk table).
--
-- creator_payout_decisions is the append-only ledger of ops judgment calls: 'approved'
-- (fund this batch) or 'cancelled' (undo the promise before it's paid). idempotency_key
-- makes create/cancel safe to replay (a double-submitted form, a retried request) without
-- double-creating or double-cancelling; request_hash lets a same-key replay with a
-- DIFFERENT payload be rejected rather than silently applied. Both tables follow the
-- ops_audit_log precedent: RLS enabled, zero policies, so every access — including
-- service_role under PostgREST — is denied except through a SECURITY DEFINER RPC.

create table public.creator_payout_batches (
  id                        uuid primary key default gen_random_uuid(),
  creator_id                uuid not null references public.creators(id),
  currency                  text not null,
  amount                    numeric not null,
  status                    text not null default 'pending',
  target_at                 timestamptz not null,
  created_by_ops_member_id  uuid not null references public.kinnso_ops_members(id),
  paid_at                   timestamptz,
  cancelled_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint creator_payout_batches_amount_positive check (amount > 0),
  constraint creator_payout_batches_status_check check (status in ('pending', 'paid', 'cancelled'))
);

-- One pending batch per creator+currency: ops must resolve (pay or cancel) an existing
-- promise before making a new one in the same currency, so nothing is double-promised.
create unique index creator_payout_batches_one_pending_uniq
  on public.creator_payout_batches (creator_id, currency)
  where status = 'pending';

create index creator_payout_batches_creator_idx
  on public.creator_payout_batches (creator_id, created_at desc);

alter table public.creator_payout_batches enable row level security;
revoke all on public.creator_payout_batches from public, anon, authenticated;

create function public.creator_payout_batches_immutable() returns trigger
language plpgsql as $$
begin
  if old.status <> 'pending' then
    raise exception 'batch_immutable';
  end if;
  if new.status not in ('paid', 'cancelled') then
    raise exception 'bad_transition';
  end if;
  if new.creator_id is distinct from old.creator_id
     or new.currency is distinct from old.currency
     or new.amount is distinct from old.amount
     or new.target_at is distinct from old.target_at
     or new.created_by_ops_member_id is distinct from old.created_by_ops_member_id
     or new.created_at is distinct from old.created_at then
    raise exception 'batch_immutable';
  end if;
  return new;
end;
$$;

create trigger creator_payout_batches_immutable_trg
  before update on public.creator_payout_batches
  for each row execute function public.creator_payout_batches_immutable();

create table public.creator_payout_decisions (
  id                      uuid primary key default gen_random_uuid(),
  payout_batch_id         uuid not null references public.creator_payout_batches(id),
  decision_kind           text not null,
  idempotency_key         text not null,
  request_hash            text not null,
  supersedes_decision_id  uuid references public.creator_payout_decisions(id),
  actor_ops_member_id     uuid not null references public.kinnso_ops_members(id),
  reason                  text not null,
  created_at              timestamptz not null default now(),
  constraint creator_payout_decisions_kind_check check (decision_kind in ('approved', 'cancelled'))
);

create unique index creator_payout_decisions_idempotency_key_uniq
  on public.creator_payout_decisions (idempotency_key);

create index creator_payout_decisions_batch_idx
  on public.creator_payout_decisions (payout_batch_id, created_at desc);

alter table public.creator_payout_decisions enable row level security;
revoke all on public.creator_payout_decisions from public, anon, authenticated;

-- Append-only: no legitimate caller ever updates or deletes a decision row, so both
-- triggers raise unconditionally. This is defense-in-depth — the only inserter is
-- admin_create_payout_batch / admin_cancel_payout, and neither issues UPDATE or DELETE.
create function public.creator_payout_decisions_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'decision_immutable';
end;
$$;

create trigger creator_payout_decisions_no_update_trg
  before update on public.creator_payout_decisions
  for each row execute function public.creator_payout_decisions_immutable();

create trigger creator_payout_decisions_no_delete_trg
  before delete on public.creator_payout_decisions
  for each row execute function public.creator_payout_decisions_immutable();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.payout-batches-schema.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260816090000_r10_2_payout_batches_and_decisions.sql apps/web/tests/db.payout-batches-schema.test.ts
git commit -m "feat(r10.2): add creator_payout_batches and creator_payout_decisions schema"
```

---

### Task 2: Processing-window setting

**Files:**
- Create: `supabase/migrations/20260816090100_r10_2_payout_processing_window_setting.sql`
- Test: `apps/web/tests/db.payout-processing-window.test.ts`

`admin_create_payout_batch` (Task 3) needs a default `target_at` when ops doesn't supply one
explicitly. Rather than hardcoding a constant, this is a single-row, RPC-gated settings
table ops can tune without a deploy — the same "one row, no config sprawl" shape as every
other ops-tunable value in this codebase.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_2_payout_processing_window_setting.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.2 payout processing-window setting', () => {
  it('applies after the payout tables', () => {
    expect(matches[0] > '20260816090000').toBe(true)
  })

  it('is a single-row settings table with a positive default window', () => {
    expect(sql).toContain('create table public.creator_payout_settings')
    expect(sql).toContain('processing_window_days integer not null default 7')
    expect(sql).toContain('constraint creator_payout_settings_singleton check (id)')
  })

  it('seeds the singleton row', () => {
    expect(sql).toContain('insert into public.creator_payout_settings (id) values (true)')
  })

  it('revokes client access — settings are RPC-only', () => {
    expect(sql).toContain('revoke all on public.creator_payout_settings from public, anon, authenticated')
  })

  it('exposes a read function every authenticated caller can use', () => {
    expect(sql).toContain('create function public.payout_processing_window_days()')
    expect(sql).toContain('grant execute on function public.payout_processing_window_days() to authenticated')
  })

  it('gates the write RPC on admin and requires a reason', () => {
    expect(sql).toContain('create or replace function public.admin_set_payout_processing_window(p_days integer, p_reason text)')
    expect(sql).toContain("if not public.is_active_ops_role('admin') then")
    expect(sql).toContain("if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if")
  })

  it('rejects a non-positive window', () => {
    expect(sql).toContain("if p_days is null or p_days <= 0 then raise exception 'bad_window'; end if")
  })

  it('audits the change with a fixed sentinel entity id', () => {
    expect(sql).toContain("'99999999-9999-4999-8999-999999999999'")
    expect(sql).toContain("ops_audit_log_append('payout_settings'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.payout-processing-window.test.ts`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260816090100_r10_2_payout_processing_window_setting.sql
--
-- R10.2: ops-configurable processing-window length for payout batches.
--
-- admin_create_payout_batch() (Task 3) needs a default target_at when ops doesn't supply
-- one. A single-row settings table (rather than a hardcoded constant) lets ops tune the
-- promised turnaround without a code deploy. The row's primary key is `boolean` fixed to
-- `true` — the standard singleton-row trick: the CHECK constraint makes a second row
-- structurally impossible, not just conventionally avoided.
--
-- The audit trail for settings changes has no natural per-row entity id (there is only
-- ever one settings row), so it uses a fixed sentinel uuid rather than a fresh
-- gen_random_uuid() per call — a fresh id every time would mean ops_audit_log's
-- (entity_type, entity_id) index could never group these entries together.

create table public.creator_payout_settings (
  id                        boolean primary key default true,
  processing_window_days    integer not null default 7,
  updated_by_ops_member_id  uuid references public.kinnso_ops_members(id),
  updated_at                timestamptz not null default now(),
  constraint creator_payout_settings_singleton check (id),
  constraint creator_payout_settings_window_positive check (processing_window_days > 0)
);

insert into public.creator_payout_settings (id) values (true);

alter table public.creator_payout_settings enable row level security;
revoke all on public.creator_payout_settings from public, anon, authenticated;

create function public.payout_processing_window_days()
returns integer language sql stable security definer set search_path = public as $$
  select processing_window_days from public.creator_payout_settings where id = true;
$$;
revoke all on function public.payout_processing_window_days() from public, anon, authenticated;
grant execute on function public.payout_processing_window_days() to authenticated;

create function public.admin_set_payout_processing_window(p_days integer, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old integer;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if p_days is null or p_days <= 0 then raise exception 'bad_window'; end if;

  select processing_window_days into v_old from public.creator_payout_settings where id = true;

  update public.creator_payout_settings
    set processing_window_days = p_days,
        updated_by_ops_member_id = (select id from public.kinnso_ops_members where user_id = auth.uid() and status = 'active'),
        updated_at = now()
    where id = true;

  perform public.ops_audit_log_append('payout_settings', '99999999-9999-4999-8999-999999999999'::uuid,
    'payout_settings.window', p_reason,
    jsonb_build_object('processing_window_days', jsonb_build_object('from', v_old, 'to', p_days)));
end;
$$;
revoke all on function public.admin_set_payout_processing_window(integer, text) from public, anon;
grant execute on function public.admin_set_payout_processing_window(integer, text) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.payout-processing-window.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260816090100_r10_2_payout_processing_window_setting.sql apps/web/tests/db.payout-processing-window.test.ts
git commit -m "feat(r10.2): add ops-configurable payout processing-window setting"
```

---

### Task 3: `admin_create_payout_batch` RPC

**Files:**
- Create: `supabase/migrations/20260816090200_r10_2_admin_create_payout_batch.sql`
- Test: `apps/web/tests/db.admin-create-payout-batch.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_2_admin_create_payout_batch.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.2 admin_create_payout_batch RPC', () => {
  it('applies after the settings migration', () => {
    expect(matches[0] > '20260816090100').toBe(true)
  })

  it('is a security definer function gated on admin', () => {
    expect(sql).toContain('security definer')
    expect(sql).toContain("if not public.is_active_ops_role('admin') then")
  })

  it('requires every business field before touching the database', () => {
    expect(sql).toContain("if p_creator_id is null then raise exception 'creator_required'; end if")
    expect(sql).toContain("if coalesce(btrim(p_currency), '') = '' then raise exception 'currency_required'; end if")
    expect(sql).toContain("if p_amount is null or p_amount <= 0 then raise exception 'bad_amount'; end if")
    expect(sql).toContain("if coalesce(btrim(p_idempotency_key), '') = '' then raise exception 'idempotency_key_required'; end if")
  })

  it('computes a deterministic request hash from its own arguments with no extension dependency', () => {
    expect(sql).toContain('v_hash := md5(concat_ws')
  })

  it('replays an identical payload as a no-op and rejects a mismatched one', () => {
    expect(sql).toContain("if v_existing.request_hash <> v_hash then")
    expect(sql).toContain("raise exception 'idempotency_conflict'")
    expect(sql).toContain("'replayed', true")
  })

  it('refuses a second pending batch for the same creator and currency', () => {
    expect(sql).toContain("raise exception 'batch_already_pending'")
  })

  it('falls back to the configured processing window when no target date is given', () => {
    expect(sql).toContain('coalesce(p_target_at, now() + make_interval(days => public.payout_processing_window_days()))')
  })

  it('writes both the batch and its approving decision', () => {
    expect(sql).toContain('insert into public.creator_payout_batches')
    expect(sql).toContain("insert into public.creator_payout_decisions")
    expect(sql).toContain("'approved'")
  })

  it('audits the creation', () => {
    expect(sql).toContain("ops_audit_log_append('payout_batch', v_batch_id, 'payout_batch.create'")
  })

  it('revokes public and anon execute', () => {
    expect(sql).toContain(
      'revoke all on function public.admin_create_payout_batch(uuid, text, numeric, text, text, timestamptz) from public, anon',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.admin-create-payout-batch.test.ts`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260816090200_r10_2_admin_create_payout_batch.sql
--
-- R10.2: admin_create_payout_batch — the sole way a pending payout promise gets made.
--
-- Idempotency: the caller supplies p_idempotency_key (a client-generated value tied to one
-- "Create batch" form submission — see the TypeScript layer in Task 6). request_hash is
-- computed here from the call's own arguments so a replay with an IDENTICAL payload is a
-- safe no-op (returns the original batch, 'replayed': true) while a replay with a
-- DIFFERENT payload under the same key is rejected with 'idempotency_conflict' — this is
-- what makes a double-submitted or retried form safe without asking ops to dedupe by hand.
-- md5() is used rather than pgcrypto's digest() because it needs no extension and this is
-- an internal collision check, not a security boundary.
--
-- The idempotency-key lookup takes `for update`, locking the matching decisions row (or,
-- via the unique index, blocking a concurrent insert of the same key) so two near-
-- simultaneous identical requests cannot both fall through to the insert branch.

create or replace function public.admin_create_payout_batch(
  p_creator_id      uuid,
  p_currency        text,
  p_amount          numeric,
  p_idempotency_key text,
  p_reason          text,
  p_target_at       timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid;
  v_hash text;
  v_existing record;
  v_batch_id uuid;
  v_decision_id uuid;
  v_target timestamptz;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if p_creator_id is null then raise exception 'creator_required'; end if;
  if coalesce(btrim(p_currency), '') = '' then raise exception 'currency_required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad_amount'; end if;
  if coalesce(btrim(p_idempotency_key), '') = '' then raise exception 'idempotency_key_required'; end if;

  select id into v_actor from public.kinnso_ops_members where user_id = auth.uid() and status = 'active';

  v_hash := md5(concat_ws('|', p_creator_id::text, upper(p_currency), p_amount::text, coalesce(p_target_at::text, '')));

  select d.id as decision_id, d.request_hash, d.payout_batch_id
    into v_existing
    from public.creator_payout_decisions d
    where d.idempotency_key = p_idempotency_key
    for update;

  if found then
    if v_existing.request_hash <> v_hash then
      raise exception 'idempotency_conflict';
    end if;
    return jsonb_build_object('batch_id', v_existing.payout_batch_id, 'decision_id', v_existing.decision_id, 'replayed', true);
  end if;

  if exists (
    select 1 from public.creator_payout_batches
    where creator_id = p_creator_id and currency = upper(p_currency) and status = 'pending'
  ) then
    raise exception 'batch_already_pending';
  end if;

  v_target := coalesce(p_target_at, now() + make_interval(days => public.payout_processing_window_days()));

  insert into public.creator_payout_batches (creator_id, currency, amount, target_at, created_by_ops_member_id)
    values (p_creator_id, upper(p_currency), p_amount, v_target, v_actor)
    returning id into v_batch_id;

  insert into public.creator_payout_decisions
    (payout_batch_id, decision_kind, idempotency_key, request_hash, actor_ops_member_id, reason)
    values (v_batch_id, 'approved', p_idempotency_key, v_hash, v_actor, btrim(p_reason))
    returning id into v_decision_id;

  perform public.ops_audit_log_append('payout_batch', v_batch_id, 'payout_batch.create', p_reason,
    jsonb_build_object('creator_id', p_creator_id, 'currency', upper(p_currency), 'amount', p_amount, 'target_at', v_target));

  return jsonb_build_object('batch_id', v_batch_id, 'decision_id', v_decision_id, 'replayed', false);
end;
$$;

revoke all on function public.admin_create_payout_batch(uuid, text, numeric, text, text, timestamptz) from public, anon;
grant execute on function public.admin_create_payout_batch(uuid, text, numeric, text, text, timestamptz) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.admin-create-payout-batch.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260816090200_r10_2_admin_create_payout_batch.sql apps/web/tests/db.admin-create-payout-batch.test.ts
git commit -m "feat(r10.2): add admin_create_payout_batch RPC"
```

---

### Task 4: `admin_mark_payout_paid` + `admin_cancel_payout` RPCs

**Files:**
- Create: `supabase/migrations/20260816090300_r10_2_admin_settle_payout_batch.sql`
- Test: `apps/web/tests/db.admin-settle-payout-batch.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_2_admin_settle_payout_batch.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.2 admin_mark_payout_paid / admin_cancel_payout RPCs', () => {
  it('applies after admin_create_payout_batch', () => {
    expect(matches[0] > '20260816090200').toBe(true)
  })

  it('mark-paid is a plain CAS on pending, gated on admin, with no decision row', () => {
    expect(sql).toContain('create or replace function public.admin_mark_payout_paid(p_batch_id uuid, p_reason text)')
    expect(sql).toContain("if not public.is_active_ops_role('admin') then")
    expect(sql).toContain("if v_status <> 'pending' then raise exception 'bad_transition'; end if")
    expect(sql).toContain("set status = 'paid', paid_at = now(), updated_at = now()")
    expect(sql).not.toContain('insert into public.creator_payout_decisions')
  })

  it('mark-paid raises not_found for a missing batch', () => {
    expect(sql).toContain('if not found then raise exception \'not_found\'; end if')
  })

  it('cancel is idempotency-keyed the same way create is', () => {
    expect(sql).toContain('create or replace function public.admin_cancel_payout(')
    expect(sql).toContain("v_hash := md5(concat_ws('|', p_batch_id::text, 'cancel'))")
    expect(sql).toContain("raise exception 'idempotency_conflict'")
  })

  it('cancel only accepts a pending batch and writes a cancelled decision that supersedes the approval', () => {
    expect(sql).toContain("if v_status <> 'pending' then raise exception 'bad_transition'; end if")
    expect(sql).toContain("set status = 'cancelled', cancelled_at = now(), updated_at = now()")
    expect(sql).toContain("decision_kind = 'approved'")
    expect(sql).toContain('supersedes_decision_id')
    expect(sql).toContain("'cancelled'")
  })

  it('both audit their transition', () => {
    expect(sql).toContain("ops_audit_log_append('payout_batch', p_batch_id, 'payout_batch.paid'")
    expect(sql).toContain("ops_audit_log_append('payout_batch', p_batch_id, 'payout_batch.cancel'")
  })

  it('revokes public and anon execute on both', () => {
    expect(sql).toContain('revoke all on function public.admin_mark_payout_paid(uuid, text) from public, anon')
    expect(sql).toContain('revoke all on function public.admin_cancel_payout(uuid, text, text) from public, anon')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.admin-settle-payout-batch.test.ts`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260816090300_r10_2_admin_settle_payout_batch.sql
--
-- R10.2: the two ways a pending batch resolves — paid or cancelled.
--
-- admin_mark_payout_paid records that ops actually sent the money on whatever rail they
-- used (manual transfer, Stripe Connect, etc. — R10.2 is deliberately rail-agnostic per the
-- roadmap; this RPC records the promise being kept, not how). It is a plain CAS on status,
-- audited, with no decision row: there is no ops *judgment call* to record beyond the audit
-- log entry — the judgment call already happened at admin_create_payout_batch.
--
-- admin_cancel_payout undoes a still-pending promise before it's paid, and DOES write a
-- 'cancelled' decision row (it IS a judgment call, symmetric with 'approved'), superseding
-- the batch's original approval so the ledger reads as one continuous decision chain per
-- batch. It takes the same idempotency_key/request_hash treatment as create, for the same
-- reason: a double-submitted cancel must not silently behave differently depending on when
-- the retry lands.

create or replace function public.admin_mark_payout_paid(p_batch_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;

  select status into v_status from public.creator_payout_batches where id = p_batch_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_status <> 'pending' then raise exception 'bad_transition'; end if;

  update public.creator_payout_batches
    set status = 'paid', paid_at = now(), updated_at = now()
    where id = p_batch_id;

  perform public.ops_audit_log_append('payout_batch', p_batch_id, 'payout_batch.paid', p_reason, '{}'::jsonb);
end;
$$;
revoke all on function public.admin_mark_payout_paid(uuid, text) from public, anon;
grant execute on function public.admin_mark_payout_paid(uuid, text) to authenticated;

create or replace function public.admin_cancel_payout(
  p_batch_id        uuid,
  p_idempotency_key text,
  p_reason          text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid;
  v_hash text;
  v_existing record;
  v_status text;
  v_approved_decision_id uuid;
  v_decision_id uuid;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if coalesce(btrim(p_idempotency_key), '') = '' then raise exception 'idempotency_key_required'; end if;

  select id into v_actor from public.kinnso_ops_members where user_id = auth.uid() and status = 'active';
  v_hash := md5(concat_ws('|', p_batch_id::text, 'cancel'));

  select d.id as decision_id, d.request_hash
    into v_existing
    from public.creator_payout_decisions d
    where d.idempotency_key = p_idempotency_key
    for update;

  if found then
    if v_existing.request_hash <> v_hash then
      raise exception 'idempotency_conflict';
    end if;
    return jsonb_build_object('decision_id', v_existing.decision_id, 'replayed', true);
  end if;

  select status into v_status from public.creator_payout_batches where id = p_batch_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_status <> 'pending' then raise exception 'bad_transition'; end if;

  select id into v_approved_decision_id
    from public.creator_payout_decisions
    where payout_batch_id = p_batch_id and decision_kind = 'approved'
    order by created_at desc limit 1;

  update public.creator_payout_batches
    set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where id = p_batch_id;

  insert into public.creator_payout_decisions
    (payout_batch_id, decision_kind, idempotency_key, request_hash, supersedes_decision_id, actor_ops_member_id, reason)
    values (p_batch_id, 'cancelled', p_idempotency_key, v_hash, v_approved_decision_id, v_actor, btrim(p_reason))
    returning id into v_decision_id;

  perform public.ops_audit_log_append('payout_batch', p_batch_id, 'payout_batch.cancel', p_reason, '{}'::jsonb);

  return jsonb_build_object('decision_id', v_decision_id, 'replayed', false);
end;
$$;
revoke all on function public.admin_cancel_payout(uuid, text, text) from public, anon;
grant execute on function public.admin_cancel_payout(uuid, text, text) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.admin-settle-payout-batch.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260816090300_r10_2_admin_settle_payout_batch.sql apps/web/tests/db.admin-settle-payout-batch.test.ts
git commit -m "feat(r10.2): add admin_mark_payout_paid and admin_cancel_payout RPCs"
```

---

### Task 5: Read RPCs — `creator_payout_batches_mine` + `admin_list_payout_batches`

**Files:**
- Create: `supabase/migrations/20260816090400_r10_2_payout_batch_reads.sql`
- Test: `apps/web/tests/db.payout-batch-reads.test.ts`

Two read paths, both needed because RLS on `creator_payout_batches` has zero policies
(Task 1): a creator reading their own batches on `/studio/earnings`, and ops reading every
batch on `/admin/creators/payouts`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_2_payout_batch_reads.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.2 payout batch read RPCs', () => {
  it('applies after the settle RPCs', () => {
    expect(matches[0] > '20260816090300').toBe(true)
  })

  it('creator_payout_batches_mine gates on the same active-creator check as creator_earnings_summary', () => {
    expect(sql).toContain('create or replace function public.creator_payout_batches_mine()')
    expect(sql).toContain("if not exists (select 1 from public.creators where id = v_uid and status = 'active') then")
    expect(sql).toContain('security definer')
  })

  it('creator_payout_batches_mine scopes strictly to the caller', () => {
    expect(sql).toContain('where b.creator_id = v_uid')
  })

  it('admin_list_payout_batches is a read gated at the analyst level, not admin', () => {
    expect(sql).toContain('create or replace function public.admin_list_payout_batches(p_status text default null)')
    expect(sql).toContain("if not public.is_active_ops_role('analyst') then")
  })

  it('admin_list_payout_batches validates its status filter and joins the creator name', () => {
    expect(sql).toContain("if p_status is not null and p_status not in ('pending', 'paid', 'cancelled') then raise exception 'bad_status'; end if")
    expect(sql).toContain('join public.creators c on c.id = b.creator_id')
  })

  it('both revoke anon/public and grant only authenticated', () => {
    expect(sql).toContain('revoke all on function public.creator_payout_batches_mine() from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.creator_payout_batches_mine() to authenticated')
    expect(sql).toContain('revoke all on function public.admin_list_payout_batches(text) from public, anon')
    expect(sql).toContain('grant execute on function public.admin_list_payout_batches(text) to authenticated')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.payout-batch-reads.test.ts`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260816090400_r10_2_payout_batch_reads.sql
--
-- R10.2: the two read paths onto creator_payout_batches. RLS on that table has zero
-- policies (20260816090000), so every read — including a creator's own — is RPC-only.
--
-- creator_payout_batches_mine mirrors creator_earnings_summary()'s gate exactly (R10.0,
-- 20260815090000): active creators only, SECURITY DEFINER.
--
-- admin_list_payout_batches is gated at 'analyst' (the read tier), not 'admin' (the tier
-- that creates/cancels) — matching admin_creator_analytics's own precedent that reading
-- ops-aggregate data has a lower bar than mutating it.

create or replace function public.creator_payout_batches_mine()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.creators where id = v_uid and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',           b.id,
      'currency',     b.currency,
      'amount',       b.amount,
      'status',       b.status,
      'target_at',    b.target_at,
      'created_at',   b.created_at,
      'paid_at',      b.paid_at,
      'cancelled_at', b.cancelled_at
    ) order by b.created_at desc)
    from public.creator_payout_batches b
    where b.creator_id = v_uid
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.creator_payout_batches_mine() from public, anon, authenticated;
grant execute on function public.creator_payout_batches_mine() to authenticated;

create or replace function public.admin_list_payout_batches(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_ops_role('analyst') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('pending', 'paid', 'cancelled') then
    raise exception 'bad_status';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',           b.id,
      'creator_id',   b.creator_id,
      'creator_name', c.display_name,
      'currency',     b.currency,
      'amount',       b.amount,
      'status',       b.status,
      'target_at',    b.target_at,
      'created_at',   b.created_at,
      'paid_at',      b.paid_at,
      'cancelled_at', b.cancelled_at
    ) order by b.created_at desc)
    from public.creator_payout_batches b
    join public.creators c on c.id = b.creator_id
    where p_status is null or b.status = p_status
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_list_payout_batches(text) from public, anon;
grant execute on function public.admin_list_payout_batches(text) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.payout-batch-reads.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260816090400_r10_2_payout_batch_reads.sql apps/web/tests/db.payout-batch-reads.test.ts
git commit -m "feat(r10.2): add creator_payout_batches_mine and admin_list_payout_batches reads"
```

---

### Task 6: TypeScript query/action layer

**Files:**
- Modify: `packages/db/types.ts`
- Create: `apps/web/lib/admin/payout-batches-queries.ts`
- Create: `apps/web/lib/admin/payout-batches-actions.ts`
- Test: `apps/web/tests/admin.payout-batches-queries.test.ts`
- Test: `apps/web/tests/admin.payout-batches-actions.test.ts`

`packages/db/types.ts` is the **production-generated** file; `pnpm --filter @kinnso/db gen`
runs `supabase gen types typescript --linked`, which reads production, and is forbidden for
an unmerged migration. R10.0 (`4407e71`) set the precedent for this exact situation: hand-add
a single `Functions` entry rather than regenerate. Follow that precedent — do not run `gen`.

None of these RPCs are ever called via `supabase.from(...)` (RLS has zero policies on both
tables, Task 1), so no `Tables` entries are needed — only `Functions`.

- [ ] **Step 1: Add the six RPCs to `packages/db/types.ts`**

The `Functions` map is alphabetically sorted. Insert each entry at its sorted position:

Before the existing `admin_creator_analytics` entry (find `admin_cancel_and_refund_booking`'s
closing `}` a few lines above it):

```typescript
      admin_cancel_payout: {
        Args: { p_batch_id: string; p_idempotency_key: string; p_reason: string }
        Returns: Json
      }
      admin_create_payout_batch: {
        Args: {
          p_amount: number
          p_creator_id: string
          p_currency: string
          p_idempotency_key: string
          p_reason: string
          p_target_at?: string | null
        }
        Returns: Json
      }
```

After the existing `admin_list_ops_members: { Args: never; Returns: Json }` entry:

```typescript
      admin_list_payout_batches: { Args: { p_status?: string | null }; Returns: Json }
      admin_mark_payout_paid: { Args: { p_batch_id: string; p_reason: string }; Returns: undefined }
```

Between the existing `admin_set_ops_member_role` entry and `admin_set_settlement_status`:

```typescript
      admin_set_payout_processing_window: {
        Args: { p_days: number; p_reason: string }
        Returns: undefined
      }
```

Between the existing `creator_insights: { Args: never; Returns: Json }` and
`creator_public_profile_json`:

```typescript
      creator_payout_batches_mine: { Args: never; Returns: Json }
```

- [ ] **Step 2: Write the failing tests**

```typescript
// apps/web/tests/admin.payout-batches-queries.test.ts
import { describe, expect, it, vi } from 'vitest'
import { getPayoutBatches } from '@/lib/admin/payout-batches-queries'

function client(raw: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data: raw, error })) } as never
}

const raw = [
  {
    id: 'b1', creator_id: 'c1', creator_name: 'May Chan', currency: 'HKD', amount: '1500.00',
    status: 'pending', target_at: '2026-08-23T00:00:00Z', created_at: '2026-08-16T00:00:00Z',
    paid_at: null, cancelled_at: null,
  },
]

describe('getPayoutBatches', () => {
  it('maps rows and coerces the numeric amount', async () => {
    const supabase = client(raw)
    const result = await getPayoutBatches(supabase)
    expect(result).toEqual([
      {
        id: 'b1', creatorId: 'c1', creatorName: 'May Chan', currency: 'HKD', amount: 1500,
        status: 'pending', targetAt: '2026-08-23T00:00:00Z', createdAt: '2026-08-16T00:00:00Z',
        paidAt: null, cancelledAt: null,
      },
    ])
    expect(supabase.rpc).toHaveBeenCalledWith('admin_list_payout_batches', { p_status: null })
  })

  it('forwards a status filter', async () => {
    const supabase = client([])
    await getPayoutBatches(supabase, 'paid')
    expect(supabase.rpc).toHaveBeenCalledWith('admin_list_payout_batches', { p_status: 'paid' })
  })

  it('returns an empty array for null data', async () => {
    const supabase = client(null)
    expect(await getPayoutBatches(supabase)).toEqual([])
  })

  it('propagates an RPC error', async () => {
    const supabase = client(null, { message: 'forbidden' })
    await expect(getPayoutBatches(supabase)).rejects.toEqual({ message: 'forbidden' })
  })
})
```

```typescript
// apps/web/tests/admin.payout-batches-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

type RpcResult = { data: unknown; error: { message: string } | null }
type GateResult = { ok: true; user: { id: string } } | { ok: false; errors: Record<string, string[]> }
const { rpcMock, gateMock, revalidateMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (): Promise<RpcResult> => ({ data: { batch_id: 'b1' }, error: null })),
  gateMock: vi.fn(async (): Promise<GateResult> => ({ ok: true, user: { id: 'u1' } })),
  revalidateMock: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: gateMock }))

import { createPayoutBatch, markPayoutBatchPaid, cancelPayoutBatch } from '@/lib/admin/payout-batches-actions'

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: { batch_id: 'b1' }, error: null })
  gateMock.mockReset().mockResolvedValue({ ok: true, user: { id: 'u1' } })
  revalidateMock.mockReset()
})

describe('createPayoutBatch', () => {
  const input = { creatorId: 'c1', currency: 'HKD', amount: 1500, idempotencyKey: 'key-1' }

  it('calls admin_create_payout_batch and returns the batch id', async () => {
    const res = await createPayoutBatch('en', input, 'monthly payout run')
    expect(rpcMock).toHaveBeenCalledWith('admin_create_payout_batch', {
      p_creator_id: 'c1', p_currency: 'HKD', p_amount: 1500, p_idempotency_key: 'key-1', p_reason: 'monthly payout run',
    })
    expect(res).toEqual({ ok: true, batchId: 'b1' })
    expect(revalidateMock).toHaveBeenCalled()
  })

  it('fails validation when amount is not positive (no RPC call)', async () => {
    const res = await createPayoutBatch('en', { ...input, amount: 0 }, 'reason')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('maps idempotency_conflict to a friendly message', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'idempotency_conflict' } })
    const res = await createPayoutBatch('en', input, 'reason')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/already submitted/i)
  })

  it('maps batch_already_pending to a friendly message', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'batch_already_pending' } })
    const res = await createPayoutBatch('en', input, 'reason')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/pending batch/i)
  })
})

describe('markPayoutBatchPaid', () => {
  it('calls admin_mark_payout_paid', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })
    const res = await markPayoutBatchPaid('en', 'b1', 'wired via FPS')
    expect(rpcMock).toHaveBeenCalledWith('admin_mark_payout_paid', { p_batch_id: 'b1', p_reason: 'wired via FPS' })
    expect(res).toEqual({ ok: true, id: 'b1' })
  })

  it('fails validation when reason is blank (no RPC call)', async () => {
    const res = await markPayoutBatchPaid('en', 'b1', '   ')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('cancelPayoutBatch', () => {
  const input = { batchId: 'b1', idempotencyKey: 'key-2' }

  it('calls admin_cancel_payout', async () => {
    rpcMock.mockResolvedValueOnce({ data: { decision_id: 'd1' }, error: null })
    const res = await cancelPayoutBatch('en', input, 'creator requested a different currency')
    expect(rpcMock).toHaveBeenCalledWith('admin_cancel_payout', {
      p_batch_id: 'b1', p_idempotency_key: 'key-2', p_reason: 'creator requested a different currency',
    })
    expect(res).toEqual({ ok: true, id: 'b1' })
  })

  it('surfaces forbidden from a non-admin ops role', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required'] } })
    const res = await cancelPayoutBatch('en', input, 'reason')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/admin.payout-batches-queries.test.ts tests/admin.payout-batches-actions.test.ts`
Expected: FAIL — neither source file exists yet.

- [ ] **Step 4: Write `apps/web/lib/admin/payout-batches-queries.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export type PayoutBatchStatus = 'pending' | 'paid' | 'cancelled'

export interface PayoutBatchRow {
  id: string
  creatorId: string
  creatorName: string | null
  currency: string
  amount: number
  status: PayoutBatchStatus
  targetAt: string
  createdAt: string
  paidAt: string | null
  cancelledAt: string | null
}

type RawPayoutBatch = {
  id: string
  creator_id: string
  creator_name: string | null
  currency: string
  amount: number | string
  status: PayoutBatchStatus
  target_at: string
  created_at: string
  paid_at: string | null
  cancelled_at: string | null
}

const num = (v: number | string) => (typeof v === 'string' ? Number(v) : v)

/** All payout batches (ops-aggregate), optionally filtered by status. Errors propagate. */
export async function getPayoutBatches(supabase: Client, status?: PayoutBatchStatus): Promise<PayoutBatchRow[]> {
  const { data, error } = await supabase.rpc('admin_list_payout_batches', { p_status: status ?? null })
  if (error) throw error
  return ((data ?? []) as RawPayoutBatch[]).map((r) => ({
    id: r.id,
    creatorId: r.creator_id,
    creatorName: r.creator_name,
    currency: r.currency,
    amount: num(r.amount),
    status: r.status,
    targetAt: r.target_at,
    createdAt: r.created_at,
    paidAt: r.paid_at,
    cancelledAt: r.cancelled_at,
  }))
}
```

- [ ] **Step 5: Write `apps/web/lib/admin/payout-batches-actions.ts`**

```typescript
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateReason } from '@/lib/admin/creators-validation'
import type { Locale } from '@/lib/i18n/config'

const payoutsPath = (locale: Locale) => `/${locale}/admin/creators/payouts`

/** DB raise-message → friendly copy, extending the FRIENDLY map convention from creators-actions.ts. */
const FRIENDLY: Record<string, string> = {
  forbidden: 'Active ops access is required.',
  reason_required: 'A reason is required.',
  reason_too_long: 'The reason is too long (max 500 characters).',
  creator_required: 'A creator is required.',
  currency_required: 'A currency is required.',
  bad_amount: 'Enter an amount greater than zero.',
  idempotency_key_required: 'Missing request id — reload and try again.',
  idempotency_conflict: 'This request was already submitted with different details. Reload and try again.',
  batch_already_pending: 'This creator already has a pending batch in this currency. Resolve it first.',
  not_found: 'That payout batch no longer exists. Refresh and try again.',
  bad_transition: 'That batch can no longer be changed.',
}

const mapError = (message: string, fallback: string): string => {
  const key = Object.keys(FRIENDLY).find((k) => message.includes(k))
  return key ? FRIENDLY[key] : fallback
}

export interface CreatePayoutBatchInput {
  creatorId: string
  currency: string
  amount: number
  idempotencyKey: string
}

export async function createPayoutBatch(
  locale: Locale, input: CreatePayoutBatchInput, reason: string,
): Promise<ActionResult<{ batchId: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!input.creatorId.trim()) return formError(FRIENDLY.creator_required)
  if (!input.currency.trim()) return formError(FRIENDLY.currency_required)
  if (!Number.isFinite(input.amount) || input.amount <= 0) return formError(FRIENDLY.bad_amount)
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { data, error } = await supabase.rpc('admin_create_payout_batch', {
    p_creator_id: input.creatorId.trim(),
    p_currency: input.currency.trim(),
    p_amount: input.amount,
    p_idempotency_key: input.idempotencyKey,
    p_reason: reason.trim(),
  })
  if (error) {
    console.error('[admin:payouts] createPayoutBatch failed', error)
    return formError(mapError(error.message, 'Payout batch could not be created'))
  }
  revalidatePath(payoutsPath(locale))
  const result = data as { batch_id: string }
  return { ok: true, batchId: result.batch_id }
}

export async function markPayoutBatchPaid(
  locale: Locale, batchId: string, reason: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { error } = await supabase.rpc('admin_mark_payout_paid', { p_batch_id: batchId, p_reason: reason.trim() })
  if (error) {
    console.error('[admin:payouts] markPayoutBatchPaid failed', error)
    return formError(mapError(error.message, 'Payout batch could not be marked paid'))
  }
  revalidatePath(payoutsPath(locale))
  return { ok: true, id: batchId }
}

export interface CancelPayoutBatchInput {
  batchId: string
  idempotencyKey: string
}

export async function cancelPayoutBatch(
  locale: Locale, input: CancelPayoutBatchInput, reason: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { error } = await supabase.rpc('admin_cancel_payout', {
    p_batch_id: input.batchId,
    p_idempotency_key: input.idempotencyKey,
    p_reason: reason.trim(),
  })
  if (error) {
    console.error('[admin:payouts] cancelPayoutBatch failed', error)
    return formError(mapError(error.message, 'Payout batch could not be cancelled'))
  }
  revalidatePath(payoutsPath(locale))
  return { ok: true, id: input.batchId }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/admin.payout-batches-queries.test.ts tests/admin.payout-batches-actions.test.ts`
Expected: PASS (4 + 7 tests)

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors — this is what proves the hand-edited `packages/db/types.ts` entries are
shaped correctly against the `.rpc(...)` calls above.

- [ ] **Step 8: Commit**

```bash
git add packages/db/types.ts apps/web/lib/admin/payout-batches-queries.ts apps/web/lib/admin/payout-batches-actions.ts apps/web/tests/admin.payout-batches-queries.test.ts apps/web/tests/admin.payout-batches-actions.test.ts
git commit -m "feat(r10.2): add payout-batches query/action TypeScript layer"
```

---

### Task 7: Ops UI — `CreatorPayoutBatchesView` on `/admin/creators/payouts`

**Files:**
- Create: `apps/web/components/kinnso/admin/creators/CreatorPayoutBatchesView.tsx`
- Modify: `apps/web/app/[locale]/admin/creators/payouts/page.tsx`
- Test: `apps/web/tests/kinnso.CreatorPayoutBatchesView.test.tsx`
- Test: `apps/web/tests/admin.creators-payouts.host.test.tsx` (extend)

This is a **new, separate component** rather than new props bolted onto the existing
`CreatorPayoutsView` — it has its own responsibility (batch lifecycle, not settlement-leg
status) and keeps every one of `CreatorPayoutsView`'s 8 existing tests untouched. The page
renders both components: the existing settlement queue, then this new batches section below
it. The existing settlement table already shows each row's `creatorId` (sliced to 8 chars,
linked to the creator detail page) as ordinary ops-facing text — the create-batch form here
follows that same precedent and takes a plain creator-id input rather than inventing a
picker component.

- [ ] **Step 1: Write the failing component test**

```typescript
// apps/web/tests/kinnso.CreatorPayoutBatchesView.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { CreatorPayoutBatchesView } from '@/components/kinnso/admin/creators/CreatorPayoutBatchesView'

afterEach(cleanup)
const t = en.creators

const batches = [
  {
    id: 'b1', creatorId: 'c1', creatorName: 'May Chan', currency: 'HKD', amount: 1500,
    status: 'pending' as const, targetAt: '2026-08-23T00:00:00Z', createdAt: '2026-08-16T00:00:00Z',
    paidAt: null, cancelledAt: null,
  },
]

describe('CreatorPayoutBatchesView', () => {
  it('renders the batches table', () => {
    render(<CreatorPayoutBatchesView t={t} locale="en" batches={batches}
      createAction={vi.fn()} markPaidAction={vi.fn()} cancelAction={vi.fn()} />)
    expect(screen.getByText(t.batchesHeading)).toBeTruthy()
    expect(screen.getByText('May Chan')).toBeTruthy()
    expect(screen.getByText(t.actMarkPaid)).toBeTruthy()
    expect(screen.getByText(t.actCancelBatch)).toBeTruthy()
  })

  it('shows the empty state with no batches', () => {
    render(<CreatorPayoutBatchesView t={t} locale="en" batches={[]}
      createAction={vi.fn()} markPaidAction={vi.fn()} cancelAction={vi.fn()} />)
    expect(screen.getByText(t.batchesEmpty)).toBeTruthy()
  })

  it('disables mark-paid and cancel for a batch that already left pending', () => {
    const paid = { ...batches[0], id: 'b2', status: 'paid' as const, paidAt: '2026-08-17T00:00:00Z' }
    render(<CreatorPayoutBatchesView t={t} locale="en" batches={[paid]}
      createAction={vi.fn()} markPaidAction={vi.fn()} cancelAction={vi.fn()} />)
    expect(screen.queryByText(t.actMarkPaid)).toBeNull()
    expect(screen.queryByText(t.actCancelBatch)).toBeNull()
  })

  it('creating a batch requires a reason and submits the form fields', async () => {
    const createAction = vi.fn().mockResolvedValue({ ok: true, batchId: 'b9' })
    render(<CreatorPayoutBatchesView t={t} locale="en" batches={[]}
      createAction={createAction} markPaidAction={vi.fn()} cancelAction={vi.fn()} />)
    fireEvent.click(screen.getByText(t.actCreateBatch))
    fireEvent.change(screen.getByPlaceholderText(t.formCreatorId), { target: { value: 'c9' } })
    fireEvent.change(screen.getByPlaceholderText(t.formCurrency), { target: { value: 'usd' } })
    fireEvent.change(screen.getByPlaceholderText(t.formAmount), { target: { value: '250' } })
    fireEvent.change(screen.getByPlaceholderText(t.reasonPlaceholder), { target: { value: 'August payout run' } })
    fireEvent.click(screen.getByText(t.actApply))
    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1))
    const [locale, input, reason] = createAction.mock.calls[0]
    expect(locale).toBe('en')
    expect(input).toMatchObject({ creatorId: 'c9', currency: 'usd', amount: 250 })
    expect(typeof input.idempotencyKey).toBe('string')
    expect(input.idempotencyKey.length).toBeGreaterThan(0)
    expect(reason).toBe('August payout run')
  })

  it('blocks create-confirm when amount is not a valid positive number', () => {
    const createAction = vi.fn()
    render(<CreatorPayoutBatchesView t={t} locale="en" batches={[]}
      createAction={createAction} markPaidAction={vi.fn()} cancelAction={vi.fn()} />)
    fireEvent.click(screen.getByText(t.actCreateBatch))
    fireEvent.change(screen.getByPlaceholderText(t.formCreatorId), { target: { value: 'c9' } })
    fireEvent.change(screen.getByPlaceholderText(t.formCurrency), { target: { value: 'usd' } })
    fireEvent.change(screen.getByPlaceholderText(t.formAmount), { target: { value: '0' } })
    fireEvent.change(screen.getByPlaceholderText(t.reasonPlaceholder), { target: { value: 'reason' } })
    fireEvent.click(screen.getByText(t.actApply))
    expect(createAction).not.toHaveBeenCalled()
  })

  it('marking paid requires confirmation and a reason', async () => {
    const markPaidAction = vi.fn().mockResolvedValue({ ok: true, id: 'b1' })
    render(<CreatorPayoutBatchesView t={t} locale="en" batches={batches}
      createAction={vi.fn()} markPaidAction={markPaidAction} cancelAction={vi.fn()} />)
    fireEvent.click(screen.getByText(t.actMarkPaid))
    fireEvent.change(screen.getByPlaceholderText(t.reasonPlaceholder), { target: { value: 'wired via FPS' } })
    fireEvent.click(screen.getByText(t.actApply))
    await waitFor(() => expect(markPaidAction).toHaveBeenCalledWith('en', 'b1', 'wired via FPS'))
  })

  it('cancelling passes a fresh idempotency key and reason', async () => {
    const cancelAction = vi.fn().mockResolvedValue({ ok: true, id: 'b1' })
    render(<CreatorPayoutBatchesView t={t} locale="en" batches={batches}
      createAction={vi.fn()} markPaidAction={vi.fn()} cancelAction={cancelAction} />)
    fireEvent.click(screen.getByText(t.actCancelBatch))
    fireEvent.change(screen.getByPlaceholderText(t.reasonPlaceholder), { target: { value: 'wrong currency' } })
    fireEvent.click(screen.getByText(t.actApply))
    await waitFor(() => expect(cancelAction).toHaveBeenCalledTimes(1))
    const [locale, input, reason] = cancelAction.mock.calls[0]
    expect(locale).toBe('en')
    expect(input.batchId).toBe('b1')
    expect(typeof input.idempotencyKey).toBe('string')
    expect(reason).toBe('wrong currency')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.CreatorPayoutBatchesView.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write `apps/web/components/kinnso/admin/creators/CreatorPayoutBatchesView.tsx`**

```typescript
'use client'
import { useState, useTransition, useEffect, useRef } from 'react'
import type { PayoutBatchRow } from '@/lib/admin/payout-batches-queries'
import type { CreatePayoutBatchInput, CancelPayoutBatchInput } from '@/lib/admin/payout-batches-actions'
import type { ActionResult } from '@/lib/admin/result'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'

type T = Messages['creators']
type CreateFn = (locale: Locale, input: CreatePayoutBatchInput, reason: string) => Promise<ActionResult<{ batchId: string }>>
type MarkPaidFn = (locale: Locale, batchId: string, reason: string) => Promise<ActionResult<{ id: string }>>
type CancelFn = (locale: Locale, input: CancelPayoutBatchInput, reason: string) => Promise<ActionResult<{ id: string }>>

const money = (n: number) => n.toFixed(2)
const date = (iso: string) => new Date(iso).toLocaleDateString()

function statusLabel(t: T, s: PayoutBatchRow['status']): string {
  if (s === 'paid') return t.setPaid
  if (s === 'cancelled') return t.batchStatusCancelled
  return t.setPending
}

type PendingDialog =
  | { kind: 'create' }
  | { kind: 'paid'; batch: PayoutBatchRow }
  | { kind: 'cancel'; batch: PayoutBatchRow }
  | null

export function CreatorPayoutBatchesView({
  t, locale, batches, createAction, markPaidAction, cancelAction,
}: {
  t: T; locale: Locale; batches: PayoutBatchRow[]
  createAction: CreateFn; markPaidAction: MarkPaidFn; cancelAction: CancelFn
}) {
  const [dialog, setDialog] = useState<PendingDialog>(null)
  const [reason, setReason] = useState('')
  const [creatorId, setCreatorId] = useState('')
  const [currency, setCurrency] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (dialog) reasonRef.current?.focus() }, [dialog])

  const openCreate = () => { setDialog({ kind: 'create' }); setReason(''); setCreatorId(''); setCurrency(''); setAmount(''); setError(null) }
  const openPaid = (batch: PayoutBatchRow) => { setDialog({ kind: 'paid', batch }); setReason(''); setError(null) }
  const openCancel = (batch: PayoutBatchRow) => { setDialog({ kind: 'cancel', batch }); setReason(''); setError(null) }
  const close = () => { setDialog(null); setReason(''); setError(null) }

  const confirm = () => {
    if (!dialog) return
    if (!reason.trim()) { setError(t.reasonRequired); return }

    if (dialog.kind === 'create') {
      const parsedAmount = Number(amount)
      if (!creatorId.trim() || !currency.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setError(t.actionFailed)
        return
      }
      startTransition(async () => {
        const res = await createAction(locale, {
          creatorId: creatorId.trim(), currency: currency.trim(), amount: parsedAmount,
          idempotencyKey: crypto.randomUUID(),
        }, reason.trim())
        if (res.ok) close()
        else setError(res.errors.form?.[0] ?? t.actionFailed)
      })
      return
    }

    if (dialog.kind === 'paid') {
      startTransition(async () => {
        const res = await markPaidAction(locale, dialog.batch.id, reason.trim())
        if (res.ok) close()
        else setError(res.errors.form?.[0] ?? t.actionFailed)
      })
      return
    }

    startTransition(async () => {
      const res = await cancelAction(locale, { batchId: dialog.batch.id, idempotencyKey: crypto.randomUUID() }, reason.trim())
      if (res.ok) close()
      else setError(res.errors.form?.[0] ?? t.actionFailed)
    })
  }

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-lg font-black text-kinnso-ink">{t.batchesHeading}</h2>
      <p className="mb-4 text-sm text-kinnso-muted">{t.batchesSubtitle}</p>

      <button type="button" onClick={openCreate}
        className="mb-4 rounded-md bg-kinnso-orange px-3 py-1.5 text-sm font-bold text-white">
        {t.actCreateBatch}
      </button>

      {batches.length === 0 ? (
        <p className="py-8 text-center text-sm text-kinnso-muted">{t.batchesEmpty}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-kinnso-muted">
            <tr className="border-b border-kinnso-line">
              <th className="py-2 font-bold">{t.colCreatorId}</th>
              <th className="py-2 font-bold">{t.colCurrency}</th>
              <th className="py-2 font-bold">{t.colAmount}</th>
              <th className="py-2 font-bold">{t.colStatus}</th>
              <th className="py-2 font-bold">{t.colTargetDate}</th>
              <th className="py-2 font-bold">{t.colCreatedAt}</th>
              <th className="py-2 font-bold">{t.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-kinnso-line/60 align-top">
                <td className="py-2 font-bold text-kinnso-ink">{b.creatorName ?? b.creatorId.slice(0, 8)}</td>
                <td className="py-2 text-kinnso-muted">{b.currency}</td>
                <td className="py-2 text-kinnso-muted">{money(b.amount)}</td>
                <td className="py-2 text-kinnso-muted">{statusLabel(t, b.status)}</td>
                <td className="py-2 text-kinnso-muted">{date(b.targetAt)}</td>
                <td className="py-2 text-kinnso-muted">{date(b.createdAt)}</td>
                <td className="py-2">
                  {b.status === 'pending' && (
                    <div className="flex flex-col gap-1">
                      <button type="button" onClick={() => openPaid(b)}
                        className="rounded-md bg-kinnso-orange px-2 py-1 text-xs font-bold text-white">{t.actMarkPaid}</button>
                      <button type="button" onClick={() => openCancel(b)}
                        className="rounded-md border border-kinnso-line px-2 py-1 text-xs font-bold text-kinnso-ink">{t.actCancelBatch}</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true"
          aria-labelledby="batch-confirm-title" onKeyDown={(e) => { if (e.key === 'Escape') close() }}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <p id="batch-confirm-title" className="mb-3 text-sm font-bold text-kinnso-ink">
              {dialog.kind === 'create' && t.actCreateBatch}
              {dialog.kind === 'paid' && t.confirmMarkBatchPaid}
              {dialog.kind === 'cancel' && t.confirmCancelBatch}
            </p>
            {dialog.kind === 'create' && (
              <div className="mb-2 flex flex-col gap-2">
                <input value={creatorId} onChange={(e) => setCreatorId(e.target.value)} placeholder={t.formCreatorId}
                  aria-label={t.formCreatorId} className="rounded-md border border-kinnso-line p-2 text-sm" />
                <input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder={t.formCurrency}
                  aria-label={t.formCurrency} className="rounded-md border border-kinnso-line p-2 text-sm" />
                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t.formAmount}
                  aria-label={t.formAmount} inputMode="decimal" className="rounded-md border border-kinnso-line p-2 text-sm" />
              </div>
            )}
            <textarea ref={reasonRef} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.reasonPlaceholder}
              aria-label={t.reasonPlaceholder}
              className="mb-2 w-full rounded-md border border-kinnso-line p-2 text-sm" rows={3} />
            {error && <p className="mb-2 text-xs font-bold text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} disabled={isPending}
                className="rounded-md border border-kinnso-line px-3 py-1 text-sm font-bold text-kinnso-ink">{t.actCancel}</button>
              <button type="button" onClick={confirm} disabled={isPending || !reason.trim()}
                className="rounded-md bg-kinnso-orange px-3 py-1 text-sm font-bold text-white disabled:opacity-50">{t.actApply}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CreatorPayoutBatchesView
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/kinnso.CreatorPayoutBatchesView.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Wire the component into the page**

Modify `apps/web/app/[locale]/admin/creators/payouts/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getSettlementsQueue } from '@/lib/admin/creators-queries'
import { getPayoutBatches } from '@/lib/admin/payout-batches-queries'
import { isSettlementStatus, isSettlementSource } from '@/lib/admin/creators-validation'
import { setSettlementStatus } from '@/lib/admin/creators-actions'
import { createPayoutBatch, markPayoutBatchPaid, cancelPayoutBatch } from '@/lib/admin/payout-batches-actions'
import { CreatorPayoutsView } from '@/components/kinnso/admin/creators/CreatorPayoutsView'
import { CreatorPayoutBatchesView } from '@/components/kinnso/admin/creators/CreatorPayoutBatchesView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Search = { status?: string; source?: string }

export default async function CreatorsPayoutsPage({
  params, searchParams,
}: { params: Promise<{ locale: string }>; searchParams: Promise<Search> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const sp = await searchParams
  const status = sp.status && isSettlementStatus(sp.status) ? sp.status : undefined
  const source = sp.source && isSettlementSource(sp.source) ? sp.source : undefined
  const queue = await getSettlementsQueue(supabase, { status, source })
  const batches = await getPayoutBatches(supabase)
  return (
    <>
      <CreatorPayoutsView
        t={messages.creators}
        locale={loc}
        queue={queue}
        status={status}
        source={source}
        action={setSettlementStatus}
      />
      <CreatorPayoutBatchesView
        t={messages.creators}
        locale={loc}
        batches={batches}
        createAction={createPayoutBatch}
        markPaidAction={markPayoutBatchPaid}
        cancelAction={cancelPayoutBatch}
      />
    </>
  )
}
```

- [ ] **Step 6: Extend the host test**

Add to `apps/web/tests/admin.creators-payouts.host.test.tsx` — first add the mock alongside
the existing `queueMock`:

```typescript
const { roleMock, getUserMock, queueMock, batchesMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  queueMock: vi.fn(async () => ({ rows: [], summary: { total: 0, byStatus: {}, owed: [], settled: [] } })),
  batchesMock: vi.fn(async () => []),
}))
```

Add the corresponding mock module and reset alongside the existing ones:

```typescript
vi.mock('@/lib/admin/payout-batches-queries', () => ({ getPayoutBatches: batchesMock }))
```

```typescript
beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }); queueMock.mockClear(); batchesMock.mockClear() })
```

Add one new test to the existing `describe('admin creators payouts host', ...)` block:

```typescript
  it('renders the payout batches section', async () => {
    const ui = await CreatorsPayoutsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText(en.creators.batchesHeading)).toBeTruthy()
    expect(batchesMock).toHaveBeenCalled()
  })
```

- [ ] **Step 7: Run the full host test file**

Run: `cd apps/web && npx vitest run tests/admin.creators-payouts.host.test.tsx`
Expected: PASS (6 tests — 5 existing + 1 new)

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/kinnso/admin/creators/CreatorPayoutBatchesView.tsx apps/web/app/\[locale\]/admin/creators/payouts/page.tsx apps/web/tests/kinnso.CreatorPayoutBatchesView.test.tsx apps/web/tests/admin.creators-payouts.host.test.tsx
git commit -m "feat(r10.2): add CreatorPayoutBatchesView and wire it into /admin/creators/payouts"
```

---

### Task 8: Creator-facing — payout batches on `/studio/earnings`

**Files:**
- Modify: `apps/web/lib/missions/earnings-summary.ts`
- Modify: `apps/web/components/kinnso/pages/StudioEarningsView.tsx`
- Modify: `apps/web/app/[locale]/studio/earnings/page.tsx`
- Test: `apps/web/tests/mission.earnings-summary.test.ts` (extend)
- Test: `apps/web/tests/kinnso.StudioEarningsView.test.tsx` (extend)
- Test: `apps/web/tests/studio.earnings.host.test.tsx` (extend)

`creator_payout_batches_mine()` is a separate RPC from `creator_earnings_summary()` (Task 5),
fetched independently — this only adds a round trip on `/studio/earnings`, which already does
its own data fetch; R10.0's "zero extra round trips" constraint was specifically about the
`/studio` hub page and does not apply here.

- [ ] **Step 1: Read the current files to confirm exact insertion points**

Read `apps/web/lib/missions/earnings-summary.ts`, `apps/web/components/kinnso/pages/StudioEarningsView.tsx`,
and `apps/web/app/[locale]/studio/earnings/page.tsx` in full before editing — this task
extends existing exports rather than replacing them, so the exact current shape of each
matters more than what's paraphrased here.

- [ ] **Step 2: Write the failing test extension**

Add to `apps/web/tests/mission.earnings-summary.test.ts`:

```typescript
import { getCreatorPayoutBatches } from '@/lib/missions/earnings-summary'

describe('getCreatorPayoutBatches', () => {
  it('maps every field and coerces the numeric amount', async () => {
    const raw = [
      { id: 'b1', currency: 'HKD', amount: '1500.00', status: 'pending', target_at: '2026-08-23T00:00:00Z',
        created_at: '2026-08-16T00:00:00Z', paid_at: null, cancelled_at: null },
    ]
    const supabase = { rpc: vi.fn(async () => ({ data: raw, error: null })) } as never
    const result = await getCreatorPayoutBatches(supabase)
    expect(result).toEqual([
      { id: 'b1', currency: 'HKD', amount: 1500, status: 'pending', targetAt: '2026-08-23T00:00:00Z',
        createdAt: '2026-08-16T00:00:00Z', paidAt: null, cancelledAt: null },
    ])
    expect(supabase.rpc).toHaveBeenCalledWith('creator_payout_batches_mine')
  })

  it('returns an empty array for null data', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: null })) } as never
    expect(await getCreatorPayoutBatches(supabase)).toEqual([])
  })

  it('propagates an RPC error', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: { message: 'forbidden' } })) } as never
    await expect(getCreatorPayoutBatches(supabase)).rejects.toEqual({ message: 'forbidden' })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/mission.earnings-summary.test.ts`
Expected: FAIL — `getCreatorPayoutBatches` is not exported yet.

- [ ] **Step 4: Add `getCreatorPayoutBatches` to `earnings-summary.ts`**

Add this export alongside the existing `getCreatorEarningsSummary` (do not modify that
function or its existing types):

```typescript
export type PayoutBatchStatus = 'pending' | 'paid' | 'cancelled'

export type CreatorPayoutBatch = {
  id: string
  currency: string
  amount: number
  status: PayoutBatchStatus
  targetAt: string
  createdAt: string
  paidAt: string | null
  cancelledAt: string | null
}

type RawCreatorPayoutBatch = {
  id: string
  currency: string
  amount: number | string
  status: PayoutBatchStatus
  target_at: string
  created_at: string
  paid_at: string | null
  cancelled_at: string | null
}

/** The caller's own payout batches (R10.2). Errors propagate — no silent empty result. */
export async function getCreatorPayoutBatches(supabase: Client): Promise<CreatorPayoutBatch[]> {
  const { data, error } = await supabase.rpc('creator_payout_batches_mine')
  if (error) throw error
  return ((data ?? []) as RawCreatorPayoutBatch[]).map((b) => ({
    id: b.id,
    currency: b.currency,
    amount: typeof b.amount === 'string' ? Number(b.amount) : b.amount,
    status: b.status,
    targetAt: b.target_at,
    createdAt: b.created_at,
    paidAt: b.paid_at,
    cancelledAt: b.cancelled_at,
  }))
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/mission.earnings-summary.test.ts`
Expected: PASS (existing tests + 3 new)

- [ ] **Step 6: Write the failing view test extension**

Read `apps/web/tests/kinnso.StudioEarningsView.test.tsx` first to match its existing render
call shape exactly (props, mock data structure), then add:

```typescript
  it('renders a payout batches section when batches exist', () => {
    const batches = [
      { id: 'b1', currency: 'HKD', amount: 1500, status: 'pending' as const, targetAt: '2026-08-23T00:00:00Z',
        createdAt: '2026-08-16T00:00:00Z', paidAt: null, cancelledAt: null },
    ]
    render(<StudioEarningsView t={en.studioEarnings} payoutBatches={batches} {/* ...existing required props */} />)
    expect(screen.getByText(en.studioEarnings.payoutBatchesHeading)).toBeTruthy()
    expect(screen.getByText('HKD')).toBeTruthy()
  })

  it('shows the empty state with no payout batches', () => {
    render(<StudioEarningsView t={en.studioEarnings} payoutBatches={[]} {/* ...existing required props */} />)
    expect(screen.getByText(en.studioEarnings.payoutBatchesEmpty)).toBeTruthy()
  })
```

Fill in `{/* ...existing required props */}` with whatever props the file's existing render
calls already pass — copy them verbatim rather than guessing, since Task 6/7 of R10.0 already
fixed this component's exact prop contract.

- [ ] **Step 7: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/kinnso.StudioEarningsView.test.tsx`
Expected: FAIL — `payoutBatches` prop and section do not exist yet.

- [ ] **Step 8: Add the payout-batches section to `StudioEarningsView.tsx`**

Add `payoutBatches: CreatorPayoutBatch[]` to the component's props type (import
`CreatorPayoutBatch` from `@/lib/missions/earnings-summary`), and render a fourth section
after the existing tracked-affiliate section, following the file's own established `Rows`
helper pattern (colSpan matching this section's column count — this table has 3 columns:
Amount, Status, Target date):

```typescript
      <section className="mt-8">
        <h2 className="mb-2 text-lg font-black text-kinnso-ink">{t.payoutBatchesHeading}</h2>
        {payoutBatches.length === 0 ? (
          <p className="text-sm text-kinnso-muted">{t.payoutBatchesEmpty}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-kinnso-muted">
              <tr className="border-b border-kinnso-line">
                <th className="py-2 font-bold">{t.colAmount}</th>
                <th className="py-2 font-bold">{t.colStatus}</th>
                <th className="py-2 font-bold">{t.colTarget}</th>
              </tr>
            </thead>
            <tbody>
              {payoutBatches.map((b) => (
                <tr key={b.id} className="border-b border-kinnso-line/60">
                  <td className="py-2 text-kinnso-ink">{b.amount.toFixed(2)} {b.currency}</td>
                  <td className="py-2 text-kinnso-muted">
                    {b.status === 'paid' ? t.paid : b.status === 'cancelled' ? t.batchCancelled : t.pending}
                  </td>
                  <td className="py-2 text-kinnso-muted">{new Date(b.targetAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
```

- [ ] **Step 9: Wire `getCreatorPayoutBatches` into the page**

Read `apps/web/app/[locale]/studio/earnings/page.tsx` and add a call to
`getCreatorPayoutBatches(supabase)` alongside the existing `getCreatorEarningsSummary(supabase)`
call, passing the result as the new `payoutBatches` prop to `StudioEarningsView`.

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/kinnso.StudioEarningsView.test.tsx tests/studio.earnings.host.test.tsx`
Expected: PASS — update `studio.earnings.host.test.tsx`'s mocks to include a
`getCreatorPayoutBatches` mock (mirroring however it already mocks
`getCreatorEarningsSummary`) if the page-level test fails on a missing mock.

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/missions/earnings-summary.ts apps/web/components/kinnso/pages/StudioEarningsView.tsx "apps/web/app/[locale]/studio/earnings/page.tsx" apps/web/tests/mission.earnings-summary.test.ts apps/web/tests/kinnso.StudioEarningsView.test.tsx apps/web/tests/studio.earnings.host.test.tsx
git commit -m "feat(r10.2): show payout batch state on /studio/earnings"
```

---

### Task 9: Delete the `/ops/settlements` write path

**Files:**
- Modify: `apps/web/app/[locale]/ops/settlements/page.tsx` (replace with a redirect stub)
- Modify: `apps/web/app/[locale]/studio/page.tsx` (redirect ops directly to the new home)
- Modify: `apps/web/lib/missions/actions.ts` (remove `updateSettlementAction`)
- Modify: `apps/web/lib/missions/validation.ts` (remove `validateSettlementUpdate`)
- Modify: `apps/web/lib/missions/types.ts` (remove `SettlementUpdateInput`)
- Delete: `apps/web/components/kinnso/pages/OpsSettlementView.tsx`
- Delete: `apps/web/tests/kinnso.OpsSettlementView.test.tsx`
- Modify: `apps/web/tests/ops.settlements.host.test.tsx` (replace entirely)
- Modify: `apps/web/tests/studio.dashboard.host.test.tsx` (update the ops-redirect assertion)
- Modify: `apps/web/tests/mission.actions.test.ts` (remove the `updateSettlementAction` describe block)
- Modify: `apps/web/tests/mission.validation.test.ts` (remove the settlement-update `it` blocks)

This is the roadmap's explicit ask: "`/ops/settlements` deleted and redirected to
`/admin/creators/payouts` (removes the unaudited direct-update path)". `listOpsSettlements`
in `lib/missions/queries.ts` is **not** touched — `getSettlementsQueue` (Task 7's own
dependency, and already shipped in R10.1) still calls it; only the standalone page's direct
`.update()` write and its UI are removed. `settlementStatuses` / `SettlementStatus` /
`SettlementPaymentStatus` in `lib/missions/types.ts` are also left alone — `mission.state.test.ts`
tests `settlementStatuses` independently and it is not exclusively tied to the deleted path.

- [ ] **Step 1: Update the failing assertion first — `studio.dashboard.host.test.tsx`**

Change:

```typescript
  it('redirects ops to their home', async () => {
    resolveViewerRoleMock.mockResolvedValue('ops')
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/en/ops/settlements')
  })
```

to:

```typescript
  it('redirects ops to their home', async () => {
    resolveViewerRoleMock.mockResolvedValue('ops')
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/en/admin/creators/payouts')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/studio.dashboard.host.test.tsx`
Expected: FAIL — `studio/page.tsx` still redirects to `/ops/settlements`.

- [ ] **Step 3: Update the redirect in `studio/page.tsx`**

Change the line:

```typescript
  if (role === 'ops') redirect(`/${loc}/ops/settlements`)
```

to:

```typescript
  if (role === 'ops') redirect(`/${loc}/admin/creators/payouts`)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/studio.dashboard.host.test.tsx`
Expected: PASS

- [ ] **Step 5: Replace `ops.settlements.host.test.tsx` entirely**

The old test asserted role-based `notFound()` behaviour that the stub no longer has (the
stub unconditionally redirects — the destination page enforces its own gate). Replace the
full file contents with:

```typescript
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) }),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

import OpsSettlementsPage from '@/app/[locale]/ops/settlements/page'

describe('/[locale]/ops/settlements legacy redirect', () => {
  it('redirects to the current payouts home, preserving locale', async () => {
    await expect(
      OpsSettlementsPage({ params: Promise.resolve({ locale: 'zh-hk' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/zh-hk/admin/creators/payouts')
  })

  it('404s for an unrecognised locale', async () => {
    await expect(
      OpsSettlementsPage({ params: Promise.resolve({ locale: 'xx' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/web && npx vitest run tests/ops.settlements.host.test.tsx`
Expected: FAIL — the page still renders the settlement queue instead of redirecting.

- [ ] **Step 7: Replace `ops/settlements/page.tsx` with a redirect stub**

Mirror the shape of the existing `/merchants/post` legacy stub
(`apps/web/app/[locale]/merchants/post/page.tsx`) — locale-checked, unconditional redirect,
no auth/role lookup (the destination page gates itself via `requireOpsPage`):

```typescript
import { notFound, redirect } from 'next/navigation'
import { isLocale } from '@/lib/i18n/config'

/**
 * Legacy route (R10.2): the settlement write path that used to live here — a direct
 * mission_settlements .update() with no audit trail — is gone. This page exists only so an
 * old bookmark or link still lands somewhere useful: the audited batch flow at
 * /admin/creators/payouts, which requireOpsPage there gates on its own.
 */
export default async function OpsSettlementsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  redirect(`/${locale}/admin/creators/payouts`)
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/web && npx vitest run tests/ops.settlements.host.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 9: Delete the now-dead `OpsSettlementView` component and its test**

```bash
git rm apps/web/components/kinnso/pages/OpsSettlementView.tsx apps/web/tests/kinnso.OpsSettlementView.test.tsx
```

- [ ] **Step 10: Remove `updateSettlementAction` and its exclusive dependencies from the action/validation layer**

In `apps/web/lib/missions/actions.ts`:
- Remove `SettlementPaymentStatus,` and `SettlementStatus,` from the `@/lib/missions/types`
  type-only import block (they remain exported from `types.ts` for `mission.state.test.ts`;
  only this file's *use* of them is being removed).
- Remove `validateSettlementUpdate,` from the `@/lib/missions/validation` import block.
- Remove the line `type SettlementUpdate = Database['public']['Tables']['mission_settlements']['Update']`.
- Remove the `UpdateSettlementInput` type block (the one with `settlementId`, `status`,
  `creatorPayoutStatus`, `kinnsoCommissionStatus`, `affiliateCommissionAmount`,
  `affiliateCommissionStatus`, `creatorCommissionAmount`, `kinnsoCommissionAmount`, `opsNote`).
- Remove the line `const opsSettlementsPath = '/ops/settlements'`.
- Remove the entire `updateSettlementAction` function.

In `apps/web/lib/missions/validation.ts`:
- Remove `SettlementUpdateInput,` from the `@/lib/missions/types` import block.
- Remove the entire `validateSettlementUpdate` function.

In `apps/web/lib/missions/types.ts`:
- Remove the `SettlementUpdateInput` type block. Leave `settlementStatuses`,
  `SettlementStatus`, and `SettlementPaymentStatus` in place — they are not exclusive to
  this deleted path.

- [ ] **Step 11: Remove the now-dead tests**

In `apps/web/tests/mission.actions.test.ts`:
- Remove `updateSettlementAction,` from the import block at the top of the file.
- Remove the entire `describe('updateSettlementAction', () => { ... })` block (it directly
  precedes `describe('createPartnerLinkAction', ...)` — delete everything between the
  closing `})` of `describe('reviewSubmissionAction', ...)` and the start of
  `describe('createPartnerLinkAction', ...)`).

In `apps/web/tests/mission.validation.test.ts`:
- Remove `validateSettlementUpdate,` and `SettlementUpdateInput,` from the import block.
- Remove these six `it(...)` blocks, which sit consecutively inside the file's first
  `describe('mission validation', ...)` block, immediately before its closing `})` and the
  start of `describe('validateSubmission', ...)`:
  - `it('allows ops settlement updates with non-negative amounts', ...)`
  - `it('rejects negative settlement amounts', ...)`
  - `it('rejects non-ops settlement updates', ...)`
  - `it('rejects negative creator commission amounts', ...)`
  - `it('rejects unknown settlement statuses', ...)`
  - `it('rejects unknown creator payout statuses', ...)`

  Do not remove the enclosing `describe('mission validation', ...)` block itself — it has
  other, unrelated tests (e.g. `originalUrl`/partner-link validation) before these six.

- [ ] **Step 12: Run the affected test files**

Run: `cd apps/web && npx vitest run tests/mission.actions.test.ts tests/mission.validation.test.ts tests/mission.state.test.ts`
Expected: PASS — no test references `updateSettlementAction`, `validateSettlementUpdate`, or
`SettlementUpdateInput` anymore; `mission.state.test.ts`'s `settlementStatuses` assertion is
unaffected.

- [ ] **Step 13: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors — confirms nothing else in the codebase imported the removed symbols.

- [ ] **Step 14: Commit**

```bash
git add -A apps/web/app/\[locale\]/ops/settlements apps/web/app/\[locale\]/studio/page.tsx apps/web/lib/missions/actions.ts apps/web/lib/missions/validation.ts apps/web/lib/missions/types.ts apps/web/tests/ops.settlements.host.test.tsx apps/web/tests/studio.dashboard.host.test.tsx apps/web/tests/mission.actions.test.ts apps/web/tests/mission.validation.test.ts
git commit -m "refactor(r10.2): delete the unaudited /ops/settlements write path

/ops/settlements becomes a locale-checked redirect stub to /admin/creators/payouts,
mirroring the existing /merchants/post legacy-stub pattern. The direct
mission_settlements .update() it used to perform, its component, and its
validation/action layer are removed — the audited RPC path
(admin_set_settlement_status, shipped in 20260629140000, already reachable from
/admin/creators/payouts) was always the intended route."
```

---

### Task 10: Locale keys across all 7 dictionaries

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (type + values)
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`
- Test: `apps/web/tests/i18n.locale-parity.test.ts` (parity is enforced automatically by the
  existing recursive key-path check — no new test code needed, just verify it passes)

Two groups of new keys: `creators.*` (the ops batch UI, Task 7) and `studioEarnings.*` (the
creator-facing payout section, Task 8). Wherever the new copy says the same thing an existing
key already says (e.g. "paid"/"pending", generic reason/confirm/cancel copy), this task
**reuses the existing key** rather than duplicating a translated string — `actMarkPaid`,
`actionFailed`, `reasonPlaceholder`, `reasonRequired`, `actApply`, `actCancel`, `colAmount`,
`colStatus`, `colActions`, `paid`, `pending` are all reused as-is from R10.0/R10.1's already-
shipped translations. Only genuinely new copy gets a new key.

- [ ] **Step 1: Add the type declarations in `en.ts`**

In the `creators` type block (the one starting `creators: { title: string; ... }`), add
after the existing `reasonRequired: string` line, still inside the block:

```typescript
    batchesHeading: string; batchesSubtitle: string; batchesEmpty: string
    colCreatorId: string; colCurrency: string; colTargetDate: string; colCreatedAt: string
    batchStatusCancelled: string
    actCreateBatch: string; actCancelBatch: string
    formCreatorId: string; formCurrency: string; formAmount: string; formTargetDate: string
    confirmCreateBatch: string; confirmMarkBatchPaid: string; confirmCancelBatch: string
```

In the `studioEarnings` type block, add after the existing `colState: string` line, still
inside the block:

```typescript
    payoutBatchesHeading: string
    payoutBatchesEmpty: string
    colTarget: string
    batchCancelled: string
```

- [ ] **Step 2: Add the English values in `en.ts`**

In the `creators` values block, find the line `reasonRequired: 'A reason is required.',`
(the last line before the block's closing `},`) and add after it:

```typescript
    batchesHeading: 'Payout batches',
    batchesSubtitle: 'Promise a payout to a creator and track it through to completion.',
    batchesEmpty: 'No payout batches yet',
    colCreatorId: 'Creator', colCurrency: 'Currency', colTargetDate: 'Target date', colCreatedAt: 'Created',
    batchStatusCancelled: 'Cancelled',
    actCreateBatch: 'Create batch', actCancelBatch: 'Cancel batch',
    formCreatorId: 'Creator ID', formCurrency: 'Currency (e.g. HKD)', formAmount: 'Amount', formTargetDate: 'Target date (optional)',
    confirmCreateBatch: 'Create a payout batch of {amount} {currency} for this creator? This records a promise to pay by the target date.',
    confirmMarkBatchPaid: 'Mark this payout batch as paid? This confirms the creator has been paid.',
    confirmCancelBatch: 'Cancel this pending payout batch? This cannot be undone.',
```

In the `studioEarnings` values block, find the line `colState: 'State',` and add after it:

```typescript
    payoutBatchesHeading: 'Payout batches',
    payoutBatchesEmpty: 'No payout batches yet.',
    colTarget: 'Target date',
    batchCancelled: 'Cancelled',
```

- [ ] **Step 3: Add the zh-hk values**

In `apps/web/lib/i18n/messages/zh-hk.ts`, `creators` block, after `reasonRequired: '需要填寫原因。',`:

```typescript
    batchesHeading: '付款批次',
    batchesSubtitle: '向創作者承諾付款，並追蹤至完成。',
    batchesEmpty: '尚未有付款批次',
    colCreatorId: '創作者', colCurrency: '貨幣', colTargetDate: '目標日期', colCreatedAt: '建立時間',
    batchStatusCancelled: '已取消',
    actCreateBatch: '建立批次', actCancelBatch: '取消批次',
    formCreatorId: '創作者 ID', formCurrency: '貨幣（例如 HKD）', formAmount: '金額', formTargetDate: '目標日期（可選）',
    confirmCreateBatch: '為此創作者建立 {amount} {currency} 的付款批次？此操作會記錄一項須於目標日期前支付的承諾。',
    confirmMarkBatchPaid: '將此付款批次標記為已支付？此操作確認創作者已收到款項。',
    confirmCancelBatch: '取消此待處理的付款批次？此操作無法復原。',
```

`studioEarnings` block, after `colState: '狀態',`:

```typescript
    payoutBatchesHeading: '付款批次',
    payoutBatchesEmpty: '尚未有付款批次。',
    colTarget: '目標日期',
    batchCancelled: '已取消',
```

- [ ] **Step 4: Add the zh-tw values**

In `apps/web/lib/i18n/messages/zh-tw.ts`, `creators` block, after `reasonRequired: '需要填寫原因。',`
(identical wording to zh-hk — the two locales already carry near-identical copy throughout
this file):

```typescript
    batchesHeading: '付款批次',
    batchesSubtitle: '向創作者承諾付款，並追蹤至完成。',
    batchesEmpty: '尚未有付款批次',
    colCreatorId: '創作者', colCurrency: '貨幣', colTargetDate: '目標日期', colCreatedAt: '建立時間',
    batchStatusCancelled: '已取消',
    actCreateBatch: '建立批次', actCancelBatch: '取消批次',
    formCreatorId: '創作者 ID', formCurrency: '貨幣（例如 HKD）', formAmount: '金額', formTargetDate: '目標日期（可選）',
    confirmCreateBatch: '為此創作者建立 {amount} {currency} 的付款批次？此操作會記錄一項須於目標日期前支付的承諾。',
    confirmMarkBatchPaid: '將此付款批次標記為已支付？此操作確認創作者已收到款項。',
    confirmCancelBatch: '取消此待處理的付款批次？此操作無法復原。',
```

`studioEarnings` block, after `colState: '狀態',`:

```typescript
    payoutBatchesHeading: '付款批次',
    payoutBatchesEmpty: '尚未有付款批次。',
    colTarget: '目標日期',
    batchCancelled: '已取消',
```

- [ ] **Step 5: Add the zh-cn values**

In `apps/web/lib/i18n/messages/zh-cn.ts`, `creators` block, after `reasonRequired: '需要填写原因。',`:

```typescript
    batchesHeading: '付款批次',
    batchesSubtitle: '向创作者承诺付款，并追踪至完成。',
    batchesEmpty: '尚无付款批次',
    colCreatorId: '创作者', colCurrency: '货币', colTargetDate: '目标日期', colCreatedAt: '创建时间',
    batchStatusCancelled: '已取消',
    actCreateBatch: '创建批次', actCancelBatch: '取消批次',
    formCreatorId: '创作者 ID', formCurrency: '货币（例如 HKD）', formAmount: '金额', formTargetDate: '目标日期（可选）',
    confirmCreateBatch: '为该创作者创建 {amount} {currency} 的付款批次？此操作会记录一项须于目标日期前支付的承诺。',
    confirmMarkBatchPaid: '将此付款批次标记为已支付？此操作确认创作者已收到款项。',
    confirmCancelBatch: '取消此待处理的付款批次？此操作无法撤销。',
```

`studioEarnings` block, after `colState: '状态',`:

```typescript
    payoutBatchesHeading: '付款批次',
    payoutBatchesEmpty: '尚无付款批次。',
    colTarget: '目标日期',
    batchCancelled: '已取消',
```

- [ ] **Step 6: Add the ja values**

In `apps/web/lib/i18n/messages/ja.ts`, `creators` block, after `reasonRequired: '理由を入力してください。',`:

```typescript
    batchesHeading: '支払いバッチ',
    batchesSubtitle: 'クリエイターへの支払いを約束し、完了まで追跡します。',
    batchesEmpty: '支払いバッチはまだありません',
    colCreatorId: 'クリエイター', colCurrency: '通貨', colTargetDate: '目標日', colCreatedAt: '作成日時',
    batchStatusCancelled: 'キャンセル済み',
    actCreateBatch: 'バッチを作成', actCancelBatch: 'バッチをキャンセル',
    formCreatorId: 'クリエイター ID', formCurrency: '通貨（例: HKD）', formAmount: '金額', formTargetDate: '目標日（任意）',
    confirmCreateBatch: 'このクリエイターに {amount} {currency} の支払いバッチを作成しますか？目標日までに支払う約束として記録されます。',
    confirmMarkBatchPaid: 'この支払いバッチを支払い済みにしますか？クリエイターへの支払いが完了したことを確認します。',
    confirmCancelBatch: 'この保留中の支払いバッチをキャンセルしますか？この操作は取り消せません。',
```

`studioEarnings` block, after `colState: '状態',`:

```typescript
    payoutBatchesHeading: '支払いバッチ',
    payoutBatchesEmpty: '支払いバッチはまだありません。',
    colTarget: '目標日',
    batchCancelled: 'キャンセル済み',
```

- [ ] **Step 7: Add the ko values**

In `apps/web/lib/i18n/messages/ko.ts`, `creators` block, after `reasonRequired: '사유를 입력해 주세요.',`:

```typescript
    batchesHeading: '지급 배치',
    batchesSubtitle: '크리에이터에게 지급을 약속하고 완료까지 추적합니다.',
    batchesEmpty: '아직 지급 배치가 없습니다',
    colCreatorId: '크리에이터', colCurrency: '통화', colTargetDate: '목표 날짜', colCreatedAt: '생성일',
    batchStatusCancelled: '취소됨',
    actCreateBatch: '배치 생성', actCancelBatch: '배치 취소',
    formCreatorId: '크리에이터 ID', formCurrency: '통화 (예: HKD)', formAmount: '금액', formTargetDate: '목표 날짜 (선택 사항)',
    confirmCreateBatch: '이 크리에이터에게 {amount} {currency} 지급 배치를 생성할까요? 목표 날짜까지 지급하기로 약속하는 내용이 기록됩니다.',
    confirmMarkBatchPaid: '이 지급 배치를 지급 완료로 표시할까요? 크리에이터에게 지급이 완료되었음을 확인합니다.',
    confirmCancelBatch: '이 대기 중인 지급 배치를 취소할까요? 이 작업은 되돌릴 수 없습니다.',
```

`studioEarnings` block, after `colState: '상태',`:

```typescript
    payoutBatchesHeading: '지급 배치',
    payoutBatchesEmpty: '아직 지급 배치가 없습니다.',
    colTarget: '목표 날짜',
    batchCancelled: '취소됨',
```

- [ ] **Step 8: Add the th values**

In `apps/web/lib/i18n/messages/th.ts`, `creators` block, after `reasonRequired: 'ต้องระบุเหตุผล',`:

```typescript
    batchesHeading: 'ชุดการจ่ายเงิน',
    batchesSubtitle: 'ให้คำมั่นการจ่ายเงินแก่ครีเอเตอร์และติดตามจนเสร็จสมบูรณ์',
    batchesEmpty: 'ยังไม่มีชุดการจ่ายเงิน',
    colCreatorId: 'ครีเอเตอร์', colCurrency: 'สกุลเงิน', colTargetDate: 'วันที่เป้าหมาย', colCreatedAt: 'สร้างเมื่อ',
    batchStatusCancelled: 'ยกเลิกแล้ว',
    actCreateBatch: 'สร้างชุดการจ่ายเงิน', actCancelBatch: 'ยกเลิกชุดการจ่ายเงิน',
    formCreatorId: 'รหัสครีเอเตอร์', formCurrency: 'สกุลเงิน (เช่น HKD)', formAmount: 'จำนวนเงิน', formTargetDate: 'วันที่เป้าหมาย (ไม่บังคับ)',
    confirmCreateBatch: 'สร้างชุดการจ่ายเงินจำนวน {amount} {currency} ให้ครีเอเตอร์รายนี้หรือไม่? การดำเนินการนี้จะบันทึกคำมั่นว่าจะจ่ายเงินภายในวันที่เป้าหมาย',
    confirmMarkBatchPaid: 'ทำเครื่องหมายว่าชุดการจ่ายเงินนี้จ่ายแล้วหรือไม่? การดำเนินการนี้ยืนยันว่าครีเอเตอร์ได้รับเงินแล้ว',
    confirmCancelBatch: 'ยกเลิกชุดการจ่ายเงินที่รอดำเนินการนี้หรือไม่? ไม่สามารถย้อนกลับการดำเนินการนี้ได้',
```

`studioEarnings` block, after `colState: 'สถานะ',`:

```typescript
    payoutBatchesHeading: 'ชุดการจ่ายเงิน',
    payoutBatchesEmpty: 'ยังไม่มีชุดการจ่ายเงิน',
    colTarget: 'วันที่เป้าหมาย',
    batchCancelled: 'ยกเลิกแล้ว',
```

- [ ] **Step 9: Run the parity test and typecheck**

Run: `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts`
Expected: PASS — every locale now has the same key set under `creators` and `studioEarnings`.

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/i18n/messages/
git commit -m "i18n(r10.2): add payout batch keys across all seven locales"
```

---

### Task 11: Live verification and full gate

**Files:**
- Create (temporary, for the live run): `apps/web/tests/payout-batches.rls.test.ts`
- No other files change in this task — it proves what Tasks 1–10 built actually runs against
  a real Postgres, then runs the complete project gate.

R10.1's Task 6 established this pattern: the migration-text tests in Tasks 1–5 prove intent,
not execution. This task applies the migrations to a real local Supabase stack and exercises
the full lifecycle — create, replay (idempotent no-op), replay-with-different-payload
(conflict), mark paid, cancel, one-pending-per-currency enforcement, and RLS isolation.

- [ ] **Step 1: Confirm the local stack is up**

```bash
supabase status
```

If it is not running, start it (`supabase start`) — do **not** run `supabase db push` or
`supabase migration repair` against the linked project; this repo is linked to production
(`scryfkefedzuetfdtrvl`) and every write here must stay local. `supabase db reset` (local) is
safe and expected — it replays every migration file including the five added in this plan.

- [ ] **Step 2: Reset the local stack to pick up the new migrations**

```bash
supabase db reset
```

Expected: completes without error. If any of the five new migration files has a SQL syntax
error the text-based tests in Tasks 1–5 could not catch, it surfaces here — fix the
migration file directly (do not edit a shipped/committed migration in place if this plan's
own earlier commits already landed; add a follow-up migration instead, and note it in the
Errata section at the top of this document).

- [ ] **Step 3: Write and run the live proof test**

```typescript
// apps/web/tests/payout-batches.rls.test.ts
// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'

const d = svcKey && url && anonKey ? describe : describe.skip
const hookTimeout = 60000
const testTimeout = 15000
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
function clientFor(userId: string) {
  const header = b64({ alg: 'HS256', typ: 'JWT' })
  const payload = b64({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })
  const sig = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url')
  return createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${header}.${payload}.${sig}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
const svc = () => createClient(url!, svcKey!, { auth: { persistSession: false, autoRefreshToken: false } })

const creatorE = '77000000-0000-4000-8000-000000000001'
const creatorF = '77000000-0000-4000-8000-000000000002'
const opsAdmin = '77000000-0000-4000-8000-000000000003'
const opsAnalyst = '77000000-0000-4000-8000-000000000004'

d('R10.2 payout batches — live proof', () => {
  beforeAll(async () => {
    const s = svc()
    // Seed two creators and two ops members (admin, analyst) as auth users + domain rows,
    // matching R10.1's seeding pattern (settlement-minting.rls.test.ts).
    for (const [id, email] of [[creatorE, `e-${runId}@test.local`], [creatorF, `f-${runId}@test.local`],
      [opsAdmin, `admin-${runId}@test.local`], [opsAnalyst, `analyst-${runId}@test.local`]] as const) {
      await s.auth.admin.createUser({ email, email_confirm: true, user_id: id } as never)
    }
    await s.from('creators').insert([
      { id: creatorE, display_name: 'Creator E', status: 'active' },
      { id: creatorF, display_name: 'Creator F', status: 'active' },
    ])
    await s.from('kinnso_ops_members').insert([
      { user_id: opsAdmin, display_name: 'Admin', role: 'admin', status: 'active' },
      { user_id: opsAnalyst, display_name: 'Analyst', role: 'analyst', status: 'active' },
    ])
  }, hookTimeout)

  afterAll(async () => {
    const s = svc()
    await s.from('creator_payout_decisions').delete().or(
      `payout_batch_id.in.(${'(select id from creator_payout_batches)'})`,
    ).then(() => {}, () => {})
    // Cleanup goes through service role directly against each table (no client-visible
    // delete path exists by design — see 20260816090000). Delete children before parents.
    const { data: batches } = await s.from('creator_payout_batches').select('id').in('creator_id', [creatorE, creatorF])
    const ids = (batches ?? []).map((b: { id: string }) => b.id)
    if (ids.length) {
      await s.from('creator_payout_decisions').delete().in('payout_batch_id', ids)
      await s.from('creator_payout_batches').delete().in('id', ids)
    }
    await s.from('kinnso_ops_members').delete().in('user_id', [opsAdmin, opsAnalyst])
    await s.from('creators').delete().in('id', [creatorE, creatorF])
    for (const id of [creatorE, creatorF, opsAdmin, opsAnalyst]) await s.auth.admin.deleteUser(id).catch(() => {})
  }, hookTimeout)

  it('creates a batch, replays the same key+payload as a no-op, and rejects a mismatched replay', async () => {
    const admin = clientFor(opsAdmin)
    const key = `create-${runId}`
    const first = await admin.rpc('admin_create_payout_batch', {
      p_creator_id: creatorE, p_currency: 'HKD', p_amount: 1000, p_idempotency_key: key, p_reason: 'live proof',
    })
    expect(first.error).toBeNull()
    expect(first.data.replayed).toBe(false)

    const replay = await admin.rpc('admin_create_payout_batch', {
      p_creator_id: creatorE, p_currency: 'HKD', p_amount: 1000, p_idempotency_key: key, p_reason: 'live proof',
    })
    expect(replay.error).toBeNull()
    expect(replay.data.batch_id).toBe(first.data.batch_id)
    expect(replay.data.replayed).toBe(true)

    const conflict = await admin.rpc('admin_create_payout_batch', {
      p_creator_id: creatorE, p_currency: 'HKD', p_amount: 999, p_idempotency_key: key, p_reason: 'live proof',
    })
    expect(conflict.error?.message).toContain('idempotency_conflict')
  }, testTimeout)

  it('refuses a second pending batch for the same creator and currency', async () => {
    const admin = clientFor(opsAdmin)
    const res = await admin.rpc('admin_create_payout_batch', {
      p_creator_id: creatorE, p_currency: 'HKD', p_amount: 50, p_idempotency_key: `dupe-${runId}`, p_reason: 'live proof',
    })
    expect(res.error?.message).toContain('batch_already_pending')
  }, testTimeout)

  it('mark-paid succeeds once and rejects a second attempt on the same batch', async () => {
    const admin = clientFor(opsAdmin)
    const created = await admin.rpc('admin_create_payout_batch', {
      p_creator_id: creatorF, p_currency: 'USD', p_amount: 200, p_idempotency_key: `pay-${runId}`, p_reason: 'live proof',
    })
    const batchId = created.data.batch_id
    const paid = await admin.rpc('admin_mark_payout_paid', { p_batch_id: batchId, p_reason: 'wired' })
    expect(paid.error).toBeNull()
    const again = await admin.rpc('admin_mark_payout_paid', { p_batch_id: batchId, p_reason: 'wired again' })
    expect(again.error?.message).toContain('bad_transition')
  }, testTimeout)

  it('cancel undoes a pending batch and frees the creator+currency slot', async () => {
    const admin = clientFor(opsAdmin)
    const created = await admin.rpc('admin_create_payout_batch', {
      p_creator_id: creatorF, p_currency: 'HKD', p_amount: 75, p_idempotency_key: `cancel-${runId}`, p_reason: 'live proof',
    })
    const batchId = created.data.batch_id
    const cancelled = await admin.rpc('admin_cancel_payout', {
      p_batch_id: batchId, p_idempotency_key: `cancel-decision-${runId}`, p_reason: 'wrong currency',
    })
    expect(cancelled.error).toBeNull()

    const recreated = await admin.rpc('admin_create_payout_batch', {
      p_creator_id: creatorF, p_currency: 'HKD', p_amount: 80, p_idempotency_key: `recreate-${runId}`, p_reason: 'live proof',
    })
    expect(recreated.error).toBeNull()
  }, testTimeout)

  it('an analyst can list all batches but cannot create one', async () => {
    const analyst = clientFor(opsAnalyst)
    const listed = await analyst.rpc('admin_list_payout_batches', { p_status: null })
    expect(listed.error).toBeNull()
    expect(Array.isArray(listed.data)).toBe(true)

    const denied = await analyst.rpc('admin_create_payout_batch', {
      p_creator_id: creatorE, p_currency: 'JPY', p_amount: 10, p_idempotency_key: `denied-${runId}`, p_reason: 'x',
    })
    expect(denied.error?.message).toContain('forbidden')
  }, testTimeout)

  it('a creator sees only their own batches, never another creator\'s', async () => {
    const asE = clientFor(creatorE)
    const mine = await asE.rpc('creator_payout_batches_mine')
    expect(mine.error).toBeNull()
    expect((mine.data as Array<{ currency: string }>).every((b) => b.currency === 'HKD')).toBe(true)

    const asF = clientFor(creatorF)
    const minesF = await asF.rpc('creator_payout_batches_mine')
    expect((minesF.data as Array<unknown>).length).toBeGreaterThan(0)
    // Cross-check: neither array leaks the other creator's row count exactly matching —
    // the real isolation guarantee is enforced at the SQL `where b.creator_id = v_uid`
    // level (Task 5), this just exercises both paths end-to-end.
  }, testTimeout)
})
```

Run: `cd apps/web && npx vitest run tests/payout-batches.rls.test.ts`
Expected: PASS (6 tests), run twice in a row to confirm no residue breaks a second run.

- [ ] **Step 4: Confirm zero database residue**

```bash
docker exec <db-container> psql -U postgres -d postgres -c \
  "select count(*) from creator_payout_batches where creator_id in ('77000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000002');"
```

Expected: `0` after the test's `afterAll` cleanup runs.

- [ ] **Step 5: Run the full project gate**

```bash
pnpm typecheck
```
Expected: 0 errors.

```bash
cd apps/web && pnpm lint
```
Expected: 0 errors.

```bash
pnpm honesty:lint
```
Expected: exit 0.

```bash
cd apps/web && npx vitest run
```
Expected: same failure count as the pre-existing baseline established in R10.0/R10.1 (the
`analytics.client` / `analytics.entity-view` / `kinnso.AnalyticsConsentBanner` jsdom
`localStorage` failures, verified failing identically on `main`) — no new failures.

- [ ] **Step 6: Delete the temporary live-proof test or keep it — decide and commit**

Unlike R10.1's live-proof test (which stayed as permanent CI coverage), decide here whether
`payout-batches.rls.test.ts` should remain permanently (recommended, following R10.1's
precedent — it is real, valuable RLS coverage that only runs when `SUPABASE_SERVICE_ROLE_KEY`
etc. are present, and `describe.skip`s cleanly otherwise) or was purely exploratory. Default
to keeping it.

```bash
git add apps/web/tests/payout-batches.rls.test.ts
git commit -m "test(r10.2): prove payout batch lifecycle, idempotency, and RLS isolation on a live stack"
```

- [ ] **Step 7: Restore the environment**

```bash
supabase stop
```

Confirm `git status` is clean (no stray `.env.test`/`config.toml` changes leaked from this
task) before moving on.

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin feat/r10-2-payout-handoff
gh pr create --repo YNWAforever/Remix-Kinnso \
  --title "Phase R10.2 — Payout handoff (make the promise real)" \
  --body "$(cat <<'EOF'
## Summary
- Adds `creator_payout_batches` / `creator_payout_decisions` — an ops-created, idempotent,
  auditable promise to pay a creator a specific amount by a target date, with a full
  pending → paid / pending → cancelled lifecycle enforced by an immutability trigger.
- `admin_create_payout_batch` and `admin_cancel_payout` are idempotency-keyed: an identical
  replay is a safe no-op, a same-key-different-payload replay is rejected.
- `/admin/creators/payouts` gains a batches section (create / mark paid / cancel);
  `/studio/earnings` shows the creator's own payout batch states.
- `/ops/settlements` — the one remaining unaudited direct-write path — is deleted and
  replaced with a locale-checked redirect to `/admin/creators/payouts`.

## Known gaps, stated honestly
- The actual payment rail (bank transfer, PayMe, Stripe Connect) is out of scope by design —
  this phase is the promise layer only, per the roadmap's "rail-agnostic" framing (R10.2
  open question #2 in the roadmap remains open, deliberately, for a later phase).
- `admin_list_payout_batches` has no pagination — fine at current volume, will need one
  before the batches table grows large.

## Test plan
- [x] `pnpm typecheck` — 0 errors
- [x] `pnpm --filter web lint` — 0 errors
- [x] `pnpm honesty:lint` — exit 0
- [x] Full web suite — no new failures vs the pre-existing main baseline
- [x] Live RLS proof against a local Supabase stack: create/replay/conflict, mark-paid CAS,
      cancel + re-create, analyst-read/admin-write separation, creator isolation — run twice,
      zero residue
EOF
)"
```

---

## Self-Review

**Spec coverage against the roadmap's R10.2 bullet:**
- (a) unique index on affiliate-derived settlement identity — not part of R10.2; this was
  already delivered in R10.1 (`mission_settlements_affiliate_event_uniq`). R10.2's own new
  unique index is `creator_payout_batches_one_pending_uniq` (Task 1) — covered.
- `creator_payout_batches` (status, `target_at`) — Task 1.
- append-only `creator_payout_decisions` (`decision_kind`, idempotency, `supersedes_decision_id`) — Task 1.
- partial unique "one pending batch per creator+currency" — Task 1.
- immutability triggers whitelisting only `pending→paid/cancelled` — Task 1.
- RPCs `admin_create_payout_batch` / `admin_mark_payout_paid` / `admin_cancel_payout`, all
  `is_active_ops_role('admin')`, reason required, `ops_audit_log` — Tasks 3–4.
- `/admin/creators/payouts` upgraded to batch flow — Task 7.
- `/ops/settlements` deleted and redirected — Task 9.
- ops setting for processing-window days — Task 2.
- creator reads own batches via one owner-gated RPC — Task 5, surfaced in Task 8.
- Acceptance: idempotency-key replay-with-different-payload → `idempotency_conflict` (Task 3
  test + Task 11 live proof); a decision row can never be updated (Task 1 test); `/studio/earnings`
  shows payout state transitions (Task 8); `ops_audit_log` carries every transition with reason
  (Tasks 3–4).

**Placeholder scan:** no TBD/TODO, no "add appropriate handling" — every step above either
shows the complete code or a complete, unambiguous instruction (e.g. Task 9's exact
line-by-line removal list; Task 8's directive to read the existing file first because its
props are already fixed by R10.0).

**Type consistency:** `PayoutBatchRow` (Task 6, ops-aggregate, includes `creatorId`/`creatorName`)
and `CreatorPayoutBatch` (Task 8, creator-facing, no creator fields since it's already
scoped to `auth.uid()`) are deliberately two different types reading two different RPCs —
not a naming inconsistency. `PayoutBatchStatus` is defined identically (`'pending' | 'paid' | 'cancelled'`)
in both `payout-batches-queries.ts` and `earnings-summary.ts`; if a reviewer flags the
duplication, it is a legitimate simplification to hoist it into a shared module, but it does
not block correctness.
