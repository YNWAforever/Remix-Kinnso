# Phase R10.1 - Settlement Minting Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Give `public.mission_settlements` its missing writers, so a paid affiliate conversion and an approved paid-mission submission each produce exactly one settlement row, automatically, with no human touching the database.

**Architecture:** Two `SECURITY DEFINER` triggers, both modelled on `create_booking_settlement_on_confirm()` (`supabase/migrations/20260704140000`) — one on `affiliate_network_events` firing when an event reaches `event_state = 'paid'`, one on `mission_milestone_submissions` firing when a submission reaches `status = 'approved'`. Idempotency is enforced by the database, not by application logic: two partial unique indexes make a duplicate mint impossible even under cron replay, concurrent approval, or a re-run backfill. A one-time backfill migration mints from affiliate events that were already `paid` before the trigger existed. `/admin/creators/payouts` gains a source facet so ops can tell the three kinds of money apart.

**Tech Stack:** Postgres/plpgsql triggers and partial unique indexes, Supabase RLS + function grants, Next.js App Router Server Components, TypeScript, Vitest.

## Why this phase

R10.0 made the money legible. It also proved the hole: `/studio/earnings` reads `mission_settlements`, and **nothing in this repository has ever inserted a row into that table**. Verified across all 100 migrations (`insert into public.mission_settlements` — zero hits) and all application code (the only TypeScript references are two reads and one update).

So today:

- The Travelpayouts cron lands fully attributed conversions in `affiliate_network_events` nightly, with `mission_id`, `mission_participant_id` and `creator_id` resolved from `affiliate_partner_links`. Nothing converts them into money a creator can be paid.
- A merchant approves a submission on a `paid` mission carrying `missions.paid_fee_amount`. `reviewSubmissionAction` writes four columns on the submission row and stops. No settlement, no obligation recorded.
- `/ops/settlements` and `/admin/creators/payouts` can therefore only ever list rows created out of band, and `updateSettlementAction`'s `.maybeSingle()` on a missing id returns "Settlement update could not be saved" — the failure mode of a table that is never written.

R10.1 closes it at the database layer, where the write path is the same regardless of who triggered it.

## Deviation from the R10–R13 roadmap, stated deliberately

The roadmap specifies item (b) as *"extend the travelpayouts-sync cron: for each event entering `paid` … upsert a `mission_settlements` row"*. **This plan implements it as a trigger on `affiliate_network_events` instead of a code change in the cron route.** The reasons, all verified:

1. **It matches the house precedent the roadmap itself cites.** Item (c) is explicitly *"mirror of `create_booking_settlement_on_confirm`"*. That function is a trigger. Making the affiliate path a trigger too means one mechanism, not two.
2. **The cron already produces the right event.** Its upsert is `.upsert(rows, { onConflict: 'network,external_action_id' })` with `ignoreDuplicates` deliberately *not* set, so it compiles to `ON CONFLICT DO UPDATE`. An action moving `processing → paid` inside the 7-day overlap window lands as a real UPDATE — which a trigger sees and a "mint on insert" code path in the route would miss.
3. **It covers every write path, not just the cron.** The backfill in Task 5, a future second affiliate network, and any ops correction all mint correctly with no extra code.
4. **The cron route's test is hostile to a new table write.** `apps/web/tests/api.cron-travelpayouts-sync.test.ts` stubs the Supabase client with a `fromMock` that `throw`s `unexpected table ${table}` for anything it does not know, and both happy-path tests assert the upsert's options object by exact equality. A trigger leaves that entire suite untouched and still green — which is the correct signal, because the route's behaviour genuinely has not changed.
5. **The cron uses a service-role client, which bypasses RLS entirely.** Money logic placed there has no database-level safety net. In a trigger, the CHECK constraints and unique indexes apply.

The observable outcome the roadmap asks for is unchanged: an event reaching `paid` produces exactly one settlement, idempotently, within one cron cycle.

## Global Constraints

- **Never touch the live database.** Add migration files only. Do not run `supabase db push`, do not run `supabase migration repair`, do not apply SQL to project `scryfkefedzuetfdtrvl` by any route including the Supabase MCP. Every verification runs against a local stack. This applies to every task and to every subagent executing any task — including when a task hits friction and applying the migration looks like the fastest way forward. It is not; report the blocker instead.
- **`pnpm --filter @kinnso/db gen` is forbidden.** It is `supabase gen types typescript --linked` and reads production. Use `--local` (Task 6).
- R10.0 must be merged first. This phase's honesty guarantee depends on `creator_earnings_summary()`'s `not exists (… affiliate_network_event_id = ev.id)` clause: the moment a settlement is minted from an event, that event must stop being reported as "tracked". Without R10.0 the same conversion appears twice.
- Never edit a shipped migration. New files sort strictly after `20260815090000_r10_0_creator_earnings_summary.sql`.
- Idempotency is a database guarantee, never an application one. Every mint path ends in `on conflict … do nothing` against a real unique index.
- A settlement is a recorded *obligation*, not a payment. Every minted row is `status = 'pending'` with `creator_payout_status = 'pending'`. Nothing in this phase marks anything paid; that is R10.2.
- Commission rates on `public.missions` are stored as percentages, not fractions — the seeded Travelpayouts offers use `creator_commission_rate = 70` / `kinnso_commission_rate = 30` (`20260622153645_seed_travelpayouts_offers.sql:63`). All money math divides by 100.
- Use TDD: write a failing test, run it, implement the smallest change, rerun the focused test, then commit each task.
- Per-task test command is `pnpm --filter web exec vitest run tests/<file>`.

## Non-goals

- Changing any commission rate, or introducing a default rate where a mission has none. A mission with no `creator_commission_rate` mints nothing — that is a data gap for ops to fix, not something to paper over with an invented number.
- Touching `booking_settlements`. Those rows are already auto-created by `create_booking_settlement_on_confirm()` and already surfaced by R10.0.
- Marking anything paid, batching payouts, or deleting `/ops/settlements`. All R10.2.
- Notifying the creator that money arrived. R10.3.
- Modifying `apps/web/app/api/cron/travelpayouts-sync/route.ts` at all. See the deviation note above.

---

## File Map

### Task 1 - Idempotency first: the two partial unique indexes

- Create: `supabase/migrations/20260815100000_r10_1_settlement_mint_uniques.sql` - the constraints every later task relies on.
- Create: `apps/web/tests/db.settlement-mint-uniques.test.ts` - migration-text contract.

### Task 2 - Mint from a paid affiliate conversion

- Create: `supabase/migrations/20260815100100_r10_1_mint_settlement_from_affiliate_event.sql`
- Create: `apps/web/tests/db.mint-settlement-affiliate.test.ts`

### Task 3 - Mint from an approved paid-mission submission

- Create: `supabase/migrations/20260815100200_r10_1_mint_settlement_on_approval.sql`
- Create: `apps/web/tests/db.mint-settlement-approval.test.ts`

### Task 4 - Backfill affiliate events that were already paid

- Create: `supabase/migrations/20260815100300_r10_1_backfill_affiliate_settlements.sql`
- Create: `apps/web/tests/db.backfill-affiliate-settlements.test.ts`

### Task 5 - Source facet on the ops payouts queue

- Modify: `apps/web/lib/admin/creators-queries.ts` - derive `source` from data the select already returns.
- Modify: `apps/web/lib/admin/creators-validation.ts` - the `source` query-param guard.
- Modify: `apps/web/app/[locale]/admin/creators/payouts/page.tsx` - read and pass the facet.
- Modify: `apps/web/components/kinnso/admin/creators/CreatorPayoutsView.tsx` - render the filter and the per-row label.
- Modify: `apps/web/tests/admin.creators-queries.test.ts` - source derivation and filtering.

### Task 6 - Live proof and the full gate

- Create: `apps/web/tests/settlement-minting.rls.test.ts` - replay, idempotency and isolation against a real stack.
- Modify: `packages/db/types.ts` - regenerated from the **local** stack.

---

### Task 1: Idempotency first: the two partial unique indexes

This task ships before any trigger, deliberately. `mission_settlements` has **no** unique constraint on `mission_id`, `mission_participant_id`, or `affiliate_network_event_id` — the only index on the latter is `mission_settlements_affiliate_event_idx`, a plain non-unique btree (`20260617173932_mission_tables.sql:308`). Postgres requires a unique index for an `ON CONFLICT` conflict target, so without this task both triggers either fail at runtime or silently duplicate money rows.

Two indexes, because there are two independent identities:

- **Affiliate mints** are one-per-event, keyed on `affiliate_network_event_id`.
- **Mission-fee mints** are one-per-participant, keyed on `mission_participant_id` and scoped to rows with no affiliate event — otherwise a creator with both an affiliate conversion and a mission fee on the same participation would have one blocked by the other.

Both are partial. That matters for `ON CONFLICT` inference: a partial unique index can only be inferred if the statement repeats its predicate verbatim, which Tasks 2-4 do.

**Files:**
- Create: `apps/web/tests/db.settlement-mint-uniques.test.ts`
- Create: `supabase/migrations/20260815100000_r10_1_settlement_mint_uniques.sql`

**Steps:**

- [ ] Step 1: Write the failing contract test at `apps/web/tests/db.settlement-mint-uniques.test.ts`:

~~~ts
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_1_settlement_mint_uniques.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.1 settlement mint unique indexes', () => {
  it('sorts after the r10.0 migration', () => {
    expect(matches[0] > '20260815090000').toBe(true)
  })

  it('creates a partial unique index keyed on the affiliate event', () => {
    expect(sql).toContain('create unique index if not exists mission_settlements_affiliate_event_uniq')
    expect(sql).toContain('on public.mission_settlements (affiliate_network_event_id)')
    expect(sql).toContain('where affiliate_network_event_id is not null')
  })

  it('creates a partial unique index keyed on the participant for fee settlements', () => {
    expect(sql).toContain('create unique index if not exists mission_settlements_participant_fee_uniq')
    expect(sql).toContain('on public.mission_settlements (mission_participant_id)')
    expect(sql).toContain('where affiliate_network_event_id is null and mission_participant_id is not null')
  })

  it('fails loudly on pre-existing duplicates instead of silently dropping rows', () => {
    expect(sql).toContain('raise exception')
    expect(sql).not.toContain('delete from public.mission_settlements')
  })

  it('does not drop the existing non-unique index', () => {
    expect(sql).not.toContain('drop index mission_settlements_affiliate_event_idx')
  })
})
~~~

- [ ] Step 2: Run it and confirm it fails.

~~~bash
pnpm --filter web exec vitest run tests/db.settlement-mint-uniques.test.ts
~~~

Expected: FAIL at the module-scope length assertion.

- [ ] Step 3: Create `supabase/migrations/20260815100000_r10_1_settlement_mint_uniques.sql`:

~~~sql
-- R10.1: make a duplicate settlement impossible before anything starts minting them.
--
-- public.mission_settlements has no unique constraint at all today: the only index on
-- affiliate_network_event_id is mission_settlements_affiliate_event_idx, a plain btree
-- (20260617173932:308). Postgres requires a UNIQUE index to infer an ON CONFLICT target,
-- so without this migration the minting triggers in 20260815100100 / 20260815100200 would
-- either error or duplicate money rows on cron replay.
--
-- Two indexes because there are two independent identities:
--   * an affiliate settlement is one-per-event;
--   * a mission-fee settlement is one-per-participant, and must be scoped to rows with no
--     affiliate event, or a creator holding both an affiliate conversion and a mission fee
--     on the same participation would have the second insert blocked by the first.
--
-- Both are partial, so every ON CONFLICT that targets them must repeat the predicate
-- verbatim — Postgres cannot infer a partial index otherwise.
--
-- The pre-checks raise rather than delete. Nothing has ever written this table (verified:
-- zero `insert into public.mission_settlements` across all migrations and app code), so
-- duplicates are not expected — but if any exist, an operator must decide which row is
-- real. A migration must never silently discard a money row.

do $$
declare v_dupes bigint;
begin
  select count(*) into v_dupes from (
    select affiliate_network_event_id
    from public.mission_settlements
    where affiliate_network_event_id is not null
    group by affiliate_network_event_id having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise exception
      'R10.1: % affiliate_network_event_id value(s) already have more than one mission_settlements row. Resolve them manually before applying this migration.',
      v_dupes;
  end if;

  select count(*) into v_dupes from (
    select mission_participant_id
    from public.mission_settlements
    where affiliate_network_event_id is null and mission_participant_id is not null
    group by mission_participant_id having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise exception
      'R10.1: % mission_participant_id value(s) already have more than one non-affiliate mission_settlements row. Resolve them manually before applying this migration.',
      v_dupes;
  end if;
end $$;

create unique index if not exists mission_settlements_affiliate_event_uniq
  on public.mission_settlements (affiliate_network_event_id)
  where affiliate_network_event_id is not null;

create unique index if not exists mission_settlements_participant_fee_uniq
  on public.mission_settlements (mission_participant_id)
  where affiliate_network_event_id is null and mission_participant_id is not null;

-- mission_settlements_affiliate_event_idx is deliberately left in place. It is redundant
-- with the new unique index for lookups, but dropping a shipped index is a separate,
-- reversible decision that does not belong in a migration whose job is adding a constraint.
~~~

- [ ] Step 4: Run the test.

~~~bash
pnpm --filter web exec vitest run tests/db.settlement-mint-uniques.test.ts
~~~

Expected: PASS.

- [ ] Step 5: Commit.

~~~bash
git add supabase/migrations/20260815100000_r10_1_settlement_mint_uniques.sql apps/web/tests/db.settlement-mint-uniques.test.ts
git commit -m "feat(r10.1): add partial unique indexes that make duplicate settlements impossible"
~~~

**Verification:**

~~~bash
pnpm --filter web exec vitest run tests/db.settlement-mint-uniques.test.ts
pnpm exec supabase db reset
~~~

Expected: `db reset` replays cleanly against the local stack.

---

### Task 2: Mint from a paid affiliate conversion

Fires on `affiliate_network_events`. Every guard is an early `return new`, never a `raise`, for the cases that are legitimate data states rather than bugs: an unattributed conversion, a mission with no configured creator rate, a zero-value action. What remains — a genuine constraint violation — is allowed to raise, because a settlement that silently fails to mint is money the creator never sees and nobody is told about.

That is a deliberate divergence from `contribution_on_submission()` (`20260625090000`), which wraps its body in `exception when others then raise warning`. Points can be recomputed; an unrecorded payment obligation cannot. The guards below reduce the raise surface to "the database disagrees with itself", which is exactly what should fail loudly.

**Files:**
- Create: `apps/web/tests/db.mint-settlement-affiliate.test.ts`
- Create: `supabase/migrations/20260815100100_r10_1_mint_settlement_from_affiliate_event.sql`

**Steps:**

- [ ] Step 1: Write the failing contract test at `apps/web/tests/db.mint-settlement-affiliate.test.ts`:

~~~ts
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_1_mint_settlement_from_affiliate_event.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.1 affiliate settlement minting trigger', () => {
  it('applies after the unique indexes it depends on', () => {
    expect(matches[0] > '20260815100000').toBe(true)
  })

  it('is a security definer trigger function with a pinned search_path', () => {
    expect(sql).toContain('create or replace function public.create_mission_settlement_on_affiliate_paid()')
    expect(sql).toContain('returns trigger')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
  })

  it('fires on insert and update, not only on insert', () => {
    expect(sql).toContain('after insert or update on public.affiliate_network_events')
  })

  it('mints only for a fully attributed paid event', () => {
    expect(sql).toContain("if new.event_state <> 'paid' then return new; end if")
    expect(sql).toContain('new.mission_id is null or new.mission_participant_id is null or new.creator_id is null')
  })

  it('does not re-mint when an already-paid event is updated again', () => {
    expect(sql).toContain("if tg_op = 'update' and old.event_state = 'paid' then return new; end if")
  })

  it('treats commission rates as percentages', () => {
    expect(sql).toContain('/ 100.0')
  })

  it('refuses to invent a rate where the mission has none', () => {
    expect(sql).toContain('v_creator_rate is null or v_creator_rate <= 0')
  })

  it('is idempotent against the partial unique index, repeating its predicate', () => {
    expect(sql).toContain('on conflict (affiliate_network_event_id) where affiliate_network_event_id is not null do nothing')
  })

  it('records an obligation, never a payment', () => {
    expect(sql).toContain("'pending'")
    expect(sql).not.toContain("creator_payout_status, 'paid'")
  })

  it('writes the settlement currency column, not the bookings one', () => {
    expect(sql).toContain('amount_currency')
  })

  it('revokes execute from every client role', () => {
    expect(sql).toContain('revoke all on function public.create_mission_settlement_on_affiliate_paid() from public, anon, authenticated, service_role')
  })
})
~~~

- [ ] Step 2: Run it and confirm it fails.

~~~bash
pnpm --filter web exec vitest run tests/db.mint-settlement-affiliate.test.ts
~~~

Expected: FAIL — migration missing.

- [ ] Step 3: Create `supabase/migrations/20260815100100_r10_1_mint_settlement_from_affiliate_event.sql`:

~~~sql
-- R10.1: turn a paid affiliate conversion into a settlement row.
--
-- The Travelpayouts cron (app/api/cron/travelpayouts-sync/route.ts, daily at 03:00 UTC)
-- upserts attributed conversions into affiliate_network_events on
-- (network, external_action_id), WITHOUT ignoreDuplicates — so it compiles to
-- ON CONFLICT DO UPDATE and a conversion moving processing -> paid inside its 7-day
-- overlap window arrives as a real UPDATE. This is a trigger rather than a change to that
-- route so the transition is caught wherever it happens: the nightly cron, the one-time
-- backfill in 20260815100300, or any later ops correction. It also mirrors
-- create_booking_settlement_on_confirm() (20260704140000), which is the established shape
-- for auto-created settlements in this schema.
--
-- SECURITY DEFINER because mission_settlements INSERT is restricted by RLS to active
-- kinnso_ops_members (mission_settlements_ops_insert, 20260617173938:608), and no minting
-- actor is ever an ops member: the cron runs as service_role and the backfill runs as the
-- migration owner.
--
-- Error policy, chosen deliberately and differing from contribution_on_submission()
-- (20260625090000), which swallows everything into a warning: the guards below all return
-- early for legitimate data states (unattributed conversion, mission with no configured
-- rate, zero-value action), so anything still able to raise is a real invariant violation.
-- A settlement that silently fails to mint is money the creator never sees and nobody is
-- told about. Points can be recomputed; an unrecorded payment obligation cannot.
--
-- Rates on public.missions are PERCENTAGES, not fractions: the seeded Travelpayouts offers
-- carry creator_commission_rate = 70 and kinnso_commission_rate = 30
-- (20260622153645_seed_travelpayouts_offers.sql:63). Hence the /100.0.

create or replace function public.create_mission_settlement_on_affiliate_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_creator_rate numeric;
  v_kinnso_rate  numeric;
  v_gross        numeric;
begin
  -- Only a paid conversion creates an obligation. 'processing' may still be reversed,
  -- and 'cancelled'/'unknown' never become money.
  if new.event_state <> 'paid' then return new; end if;

  -- An unattributed conversion is real revenue for Kinnso but belongs to no creator.
  -- affiliate_partner_links rows whose sub_id still carries the 'pending:' prefix written
  -- by app_private.prepare_affiliate_partner_link_insert() never match an incoming sub_id,
  -- so this branch is reached in normal operation and is not an error.
  if new.mission_id is null or new.mission_participant_id is null or new.creator_id is null then
    return new;
  end if;

  -- Already handled on the transition into 'paid'; the unique index below is the real
  -- guarantee, this just avoids the wasted work on every subsequent nightly re-upsert.
  if tg_op = 'update' and old.event_state = 'paid' then return new; end if;

  v_gross := coalesce(new.profit_amount, 0);
  if v_gross <= 0 then return new; end if;

  select creator_commission_rate, kinnso_commission_rate
    into v_creator_rate, v_kinnso_rate
    from public.missions where id = new.mission_id;

  -- No configured rate means no defensible amount. Minting a zero or an invented default
  -- would put a number in front of a creator that the product never promised.
  if v_creator_rate is null or v_creator_rate <= 0 then return new; end if;

  insert into public.mission_settlements (
    mission_id,
    mission_participant_id,
    affiliate_network_event_id,
    status,
    amount_currency,
    affiliate_commission_amount,
    creator_commission_amount,
    kinnso_commission_amount,
    affiliate_commission_status,
    creator_payout_status,
    kinnso_commission_status
  ) values (
    new.mission_id,
    new.mission_participant_id,
    new.id,
    -- 'pending' rather than the column default 'not_started': the money is owed the moment
    -- the network reports it paid. Nothing here marks anything paid — that is R10.2.
    'pending',
    -- affiliate_network_events stores lowercase currency codes ('usd'); mission_settlements
    -- uses amount_currency, NOT currency, and R10.0's read model uppercases on the way out.
    upper(coalesce(new.currency, 'USD')),
    v_gross,
    round(v_gross * v_creator_rate / 100.0, 2),
    case when v_kinnso_rate is null or v_kinnso_rate <= 0
         then null else round(v_gross * v_kinnso_rate / 100.0, 2) end,
    'pending',
    'pending',
    case when v_kinnso_rate is null or v_kinnso_rate <= 0 then null else 'pending' end
  )
  -- The predicate is repeated verbatim: Postgres cannot infer a partial unique index
  -- (mission_settlements_affiliate_event_uniq, 20260815100000) without it.
  on conflict (affiliate_network_event_id) where affiliate_network_event_id is not null
  do nothing;

  return new;
end $$;

-- Trigger functions need no EXECUTE grant, and Supabase's default privileges hand one to
-- anon/authenticated/service_role on every new public function (see 20260627155000), so
-- every role is revoked by name.
revoke all on function public.create_mission_settlement_on_affiliate_paid()
  from public, anon, authenticated, service_role;

drop trigger if exists mission_settlement_on_affiliate_paid on public.affiliate_network_events;
create trigger mission_settlement_on_affiliate_paid
  after insert or update on public.affiliate_network_events
  for each row execute function public.create_mission_settlement_on_affiliate_paid();
~~~

- [ ] Step 4: Run the test.

~~~bash
pnpm --filter web exec vitest run tests/db.mint-settlement-affiliate.test.ts
~~~

Expected: PASS.

- [ ] Step 5: Confirm the cron route's own suite is untouched and still green — this is the evidence that the trigger approach did not change the route's behaviour.

~~~bash
pnpm --filter web exec vitest run tests/api.cron-travelpayouts-sync.test.ts
~~~

Expected: PASS, with no edits to that file.

- [ ] Step 6: Commit.

~~~bash
git add supabase/migrations/20260815100100_r10_1_mint_settlement_from_affiliate_event.sql apps/web/tests/db.mint-settlement-affiliate.test.ts
git commit -m "feat(r10.1): mint a settlement when an affiliate conversion is paid"
~~~

**Verification:**

~~~bash
pnpm --filter web exec vitest run tests/db.mint-settlement-affiliate.test.ts tests/api.cron-travelpayouts-sync.test.ts
pnpm exec supabase db reset
~~~

---

### Task 3: Mint from an approved paid-mission submission

Mirrors Task 2 on the other side of the business. The approving actor is a **merchant**, not ops: `reviewSubmissionAction` requires a `merchant_profiles` row for `auth.uid()` and never checks `kinnso_ops_members`. So the function must be `SECURITY DEFINER`, and it must not call `ops_audit_log_append()` — that helper raises `forbidden` (42501) for any non-ops actor and would abort the merchant's approval.

**One decision to state plainly:** the settlement is minted on the **first** approved milestone submission for a participant, not on completion of every milestone, and the partial unique index makes later approvals no-ops. On a multi-milestone mission that records the full `paid_fee_amount` earlier than "all work delivered". This is deliberate and is safe because a settlement is an obligation, not a payment — `creator_payout_status` is `'pending'` and only an ops action can move it. R11.0 introduces the review queue and SLA; if per-milestone proration is wanted, that is where it belongs, and it will be a change to this one function.

**Files:**
- Create: `apps/web/tests/db.mint-settlement-approval.test.ts`
- Create: `supabase/migrations/20260815100200_r10_1_mint_settlement_on_approval.sql`

**Steps:**

- [ ] Step 1: Write the failing contract test at `apps/web/tests/db.mint-settlement-approval.test.ts`:

~~~ts
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_1_mint_settlement_on_approval.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.1 approval settlement minting trigger', () => {
  it('applies after the unique indexes', () => {
    expect(matches[0] > '20260815100000').toBe(true)
  })

  it('is a security definer trigger function with a pinned search_path', () => {
    expect(sql).toContain('create or replace function public.create_mission_settlement_on_approval()')
    expect(sql).toContain('returns trigger')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
  })

  it('fires only on approval and not on re-approval', () => {
    expect(sql).toContain("if new.status <> 'approved' then return new; end if")
    expect(sql).toContain("if tg_op = 'update' and coalesce(old.status, '') = 'approved' then return new; end if")
  })

  it('reaches mission_id through mission_participants, which the submission does not carry', () => {
    expect(sql).toContain('from public.mission_participants mp')
    expect(sql).toContain('join public.missions m on m.id = mp.mission_id')
    expect(sql).toContain('where mp.id = new.mission_participant_id')
  })

  it('mints only for merchant paid or hybrid missions with a real fee', () => {
    expect(sql).toContain("v_source <> 'merchant'")
    expect(sql).toContain("v_mission_type not in ('paid','hybrid')")
    expect(sql).toContain('v_fee is null or v_fee <= 0')
  })

  it('is idempotent against the participant-scoped partial index, repeating its predicate', () => {
    expect(sql).toContain('on conflict (mission_participant_id) where affiliate_network_event_id is null and mission_participant_id is not null do nothing')
  })

  it('never calls the ops audit helper, which would reject the merchant actor', () => {
    expect(sql).not.toContain('ops_audit_log_append')
  })

  it('records an obligation, never a payment', () => {
    expect(sql).toContain("'pending'")
  })

  it('revokes execute from every client role', () => {
    expect(sql).toContain('revoke all on function public.create_mission_settlement_on_approval() from public, anon, authenticated, service_role')
  })
})
~~~

- [ ] Step 2: Run it and confirm it fails.

~~~bash
pnpm --filter web exec vitest run tests/db.mint-settlement-approval.test.ts
~~~

Expected: FAIL — migration missing.

- [ ] Step 3: Create `supabase/migrations/20260815100200_r10_1_mint_settlement_on_approval.sql`:

~~~sql
-- R10.1: turn an approved paid-mission submission into a settlement row.
--
-- Mirror of create_booking_settlement_on_confirm() (20260704140000) for the merchant side.
-- Approval happens in reviewSubmissionAction (lib/missions/actions.ts:400-464), which
-- UPDATEs mission_milestone_submissions.status to 'approved' after a compare-and-swap.
-- Following that migration's own stated rule, this is a NEW trigger rather than an edit to
-- the already-shipped approval path.
--
-- SECURITY DEFINER is mandatory here, not stylistic: the approving actor is a MERCHANT
-- (reviewSubmissionAction requires a merchant_profiles row for auth.uid() and never checks
-- kinnso_ops_members), while mission_settlements INSERT is restricted by RLS to active ops
-- members. For the same reason this function must NOT call public.ops_audit_log_append() —
-- that helper raises 'forbidden' (42501) for a non-ops actor (20260628130000:46-48) and
-- would abort the merchant's approval.
--
-- Timing decision, stated explicitly: the fee is minted on the FIRST approved submission
-- for a participant, and mission_settlements_participant_fee_uniq makes every later
-- approval a no-op — including a re-approval after a revision cycle, which is exactly the
-- flapping case (approved -> revision_requested -> approved) that would otherwise duplicate
-- the row. On a multi-milestone mission this records the full paid_fee_amount before all
-- milestones are delivered. That is safe because a settlement is an OBLIGATION, not a
-- payment: creator_payout_status is 'pending' and only an ops action can move it. If
-- per-milestone proration is wanted, R11.0 (review queue + SLA) is where it belongs.
--
-- mission_milestone_submissions carries mission_milestone_id and mission_participant_id but
-- NOT mission_id, so the join through mission_participants is required. The existing BEFORE
-- trigger app_private.enforce_mission_submission_integrity() already guarantees
-- participant.mission_id = milestone.mission_id, so this join is safe.

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

  -- Travelpayouts missions earn through affiliate conversions (20260815100100), never a
  -- mission fee; minting both would pay twice for the same work.
  if v_source <> 'merchant' then return new; end if;

  -- 'coupon_affiliate' missions carry no fee by design.
  if v_mission_type not in ('paid','hybrid') then return new; end if;

  -- missions.paid_fee_amount is nullable and, unlike the settlements column, carries NO
  -- >= 0 CHECK (mission_settlements_paid_fee_amount_check applies to mission_settlements
  -- only), so a non-positive value is possible at the database level and must be rejected
  -- here rather than written into a money row.
  if v_fee is null or v_fee <= 0 then return new; end if;

  insert into public.mission_settlements (
    mission_id,
    mission_participant_id,
    status,
    amount_currency,
    paid_fee_amount,
    creator_payout_status
  ) values (
    v_mission_id,
    new.mission_participant_id,
    'pending',
    -- paid_fee_currency is nullable; 'HKD' matches what the studio missions list already
    -- displays for a fee with no currency (app/[locale]/studio/missions/page.tsx:77), so
    -- the settlement agrees with the number the creator was shown.
    upper(coalesce(v_currency, 'HKD')),
    v_fee,
    'pending'
  )
  -- creator_commission_amount is deliberately left NULL: R10.0's read model sums
  -- creator_commission_amount + paid_fee_amount, so writing both would double the fee.
  on conflict (mission_participant_id) where affiliate_network_event_id is null and mission_participant_id is not null
  do nothing;

  return new;
end $$;

revoke all on function public.create_mission_settlement_on_approval()
  from public, anon, authenticated, service_role;

drop trigger if exists mission_settlement_on_approval on public.mission_milestone_submissions;
create trigger mission_settlement_on_approval
  after insert or update on public.mission_milestone_submissions
  for each row execute function public.create_mission_settlement_on_approval();
~~~

- [ ] Step 4: Run the test, plus the existing mission action suite to prove approval still works.

~~~bash
pnpm --filter web exec vitest run tests/db.mint-settlement-approval.test.ts tests/mission.actions.test.ts
~~~

Expected: PASS on both.

- [ ] Step 5: Commit.

~~~bash
git add supabase/migrations/20260815100200_r10_1_mint_settlement_on_approval.sql apps/web/tests/db.mint-settlement-approval.test.ts
git commit -m "feat(r10.1): mint a settlement when a paid-mission submission is approved"
~~~

**Verification:**

~~~bash
pnpm --filter web exec vitest run tests/db.mint-settlement-approval.test.ts tests/mission.actions.test.ts
pnpm exec supabase db reset
~~~

---

### Task 4: Backfill affiliate events that were already paid

The triggers only see writes made after they exist. Conversions the cron already landed as `paid` would stay invisible forever. This backfill mints from them once, using the same rules and the same conflict target, so running it twice is harmless.

Only affiliate events are backfilled. Historic mission approvals are deliberately **not** backfilled: `mission_milestone_submissions` has no record of what `missions.paid_fee_amount` was at approval time, so a backfill would apply today's fee to work approved under a different one. That is a judgement an operator must make per mission, not something a migration should guess.

**Files:**
- Create: `apps/web/tests/db.backfill-affiliate-settlements.test.ts`
- Create: `supabase/migrations/20260815100300_r10_1_backfill_affiliate_settlements.sql`

**Steps:**

- [ ] Step 1: Write the failing contract test at `apps/web/tests/db.backfill-affiliate-settlements.test.ts`:

~~~ts
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_1_backfill_affiliate_settlements.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.1 affiliate settlement backfill', () => {
  it('applies after both minting triggers', () => {
    expect(matches[0] > '20260815100200').toBe(true)
  })

  it('mints only fully attributed paid events with a positive amount and a real rate', () => {
    expect(sql).toContain("ev.event_state = 'paid'")
    expect(sql).toContain('ev.mission_id is not null')
    expect(sql).toContain('ev.mission_participant_id is not null')
    expect(sql).toContain('ev.creator_id is not null')
    expect(sql).toContain('coalesce(ev.profit_amount, 0) > 0')
    expect(sql).toContain('m.creator_commission_rate > 0')
  })

  it('re-runs safely against the same partial unique index', () => {
    expect(sql).toContain('on conflict (affiliate_network_event_id) where affiliate_network_event_id is not null do nothing')
  })

  it('uses the same percentage math as the trigger', () => {
    expect(sql).toContain('/ 100.0')
  })

  it('never updates or deletes an existing settlement', () => {
    expect(sql).not.toContain('update public.mission_settlements')
    expect(sql).not.toContain('delete from public.mission_settlements')
  })

  it('does not backfill mission-fee settlements', () => {
    expect(sql).not.toContain('mission_milestone_submissions')
  })
})
~~~

- [ ] Step 2: Run it and confirm it fails.

~~~bash
pnpm --filter web exec vitest run tests/db.backfill-affiliate-settlements.test.ts
~~~

Expected: FAIL — migration missing.

- [ ] Step 3: Create `supabase/migrations/20260815100300_r10_1_backfill_affiliate_settlements.sql`:

~~~sql
-- R10.1: one-time backfill for affiliate conversions that were already paid.
--
-- The trigger in 20260815100100 only sees writes made after it exists. Conversions the
-- nightly cron already landed as 'paid' would otherwise never produce a settlement, and
-- would sit in R10.0's "tracked, not yet payable" section forever despite being payable.
--
-- Same rules and the same conflict target as the trigger, so this is safe to re-run and
-- safe to run in any order relative to the first post-deploy cron cycle.
--
-- Mission-fee settlements are deliberately NOT backfilled. mission_milestone_submissions
-- records reviewed_at and reviewed_by but not the fee in force at approval time, so a
-- backfill would apply today's missions.paid_fee_amount to work approved under a different
-- one. That is a per-mission judgement for an operator, not something a migration guesses.

insert into public.mission_settlements (
  mission_id,
  mission_participant_id,
  affiliate_network_event_id,
  status,
  amount_currency,
  affiliate_commission_amount,
  creator_commission_amount,
  kinnso_commission_amount,
  affiliate_commission_status,
  creator_payout_status,
  kinnso_commission_status
)
select
  ev.mission_id,
  ev.mission_participant_id,
  ev.id,
  'pending',
  upper(coalesce(ev.currency, 'USD')),
  ev.profit_amount,
  round(ev.profit_amount * m.creator_commission_rate / 100.0, 2),
  case when m.kinnso_commission_rate is null or m.kinnso_commission_rate <= 0
       then null else round(ev.profit_amount * m.kinnso_commission_rate / 100.0, 2) end,
  'pending',
  'pending',
  case when m.kinnso_commission_rate is null or m.kinnso_commission_rate <= 0
       then null else 'pending' end
from public.affiliate_network_events ev
join public.missions m on m.id = ev.mission_id
where ev.event_state = 'paid'
  and ev.mission_id is not null
  and ev.mission_participant_id is not null
  and ev.creator_id is not null
  and coalesce(ev.profit_amount, 0) > 0
  and m.creator_commission_rate is not null
  and m.creator_commission_rate > 0
on conflict (affiliate_network_event_id) where affiliate_network_event_id is not null
do nothing;
~~~

- [ ] Step 4: Run the test.

~~~bash
pnpm --filter web exec vitest run tests/db.backfill-affiliate-settlements.test.ts
~~~

Expected: PASS.

- [ ] Step 5: Commit.

~~~bash
git add supabase/migrations/20260815100300_r10_1_backfill_affiliate_settlements.sql apps/web/tests/db.backfill-affiliate-settlements.test.ts
git commit -m "feat(r10.1): backfill settlements for already-paid affiliate conversions"
~~~

**Verification:**

~~~bash
pnpm --filter web exec vitest run tests/db.backfill-affiliate-settlements.test.ts
pnpm exec supabase db reset
~~~

---

### Task 5: Source facet on the ops payouts queue

Once both triggers are live, `/admin/creators/payouts` shows three kinds of money in one undifferentiated list. The source is already derivable from data the query returns — `opsSettlementSelect` (`apps/web/lib/missions/queries.ts:63-71`) already embeds `affiliate_network_events(...)` and selects `paid_fee_amount` — but `OpsSettlementJoinRow` omits both fields, so the `as unknown as` cast silently drops them. No query change is needed; the type and the mapper need to catch up.

**Files:**
- Modify: `apps/web/tests/admin.creators-queries.test.ts`
- Modify: `apps/web/lib/admin/creators-queries.ts`
- Modify: `apps/web/lib/admin/creators-validation.ts`
- Modify: `apps/web/app/[locale]/admin/creators/payouts/page.tsx`
- Modify: `apps/web/components/kinnso/admin/creators/CreatorPayoutsView.tsx`

**Interfaces:**
- `type SettlementSource = 'affiliate' | 'mission_fee' | 'manual'`
- `PayoutRow` gains `source: SettlementSource`
- `getSettlementsQueue(supabase, opts: { status?: SettlementStatus; source?: SettlementSource })`
- `isSettlementSource(v: string): v is SettlementSource`

**Steps:**

- [ ] Step 1: Add the failing tests to `apps/web/tests/admin.creators-queries.test.ts`. Follow the file's existing mocking shape for `listOpsSettlements`:

~~~ts
describe('settlement source facet', () => {
  const rows = [
    {
      id: 's-aff', status: 'pending', creator_payout_status: 'pending',
      kinnso_commission_status: 'pending', affiliate_commission_status: 'pending',
      amount_currency: 'USD', creator_commission_amount: 7, kinnso_commission_amount: 3,
      affiliate_commission_amount: 10, paid_fee_amount: null, ops_note: null,
      missions: { title: 'Flight deals' }, mission_participants: { creator_id: 'c1' },
      affiliate_network_events: { id: 'ev1' },
    },
    {
      id: 's-fee', status: 'pending', creator_payout_status: 'pending',
      kinnso_commission_status: null, affiliate_commission_status: null,
      amount_currency: 'HKD', creator_commission_amount: null, kinnso_commission_amount: null,
      affiliate_commission_amount: null, paid_fee_amount: 1200, ops_note: null,
      missions: { title: 'Ramen crawl' }, mission_participants: { creator_id: 'c2' },
      affiliate_network_events: null,
    },
    {
      id: 's-man', status: 'pending', creator_payout_status: 'pending',
      kinnso_commission_status: null, affiliate_commission_status: null,
      amount_currency: 'HKD', creator_commission_amount: null, kinnso_commission_amount: null,
      affiliate_commission_amount: null, paid_fee_amount: null, ops_note: 'manual adjustment',
      missions: { title: 'Legacy row' }, mission_participants: { creator_id: 'c3' },
      affiliate_network_events: null,
    },
  ]

  it('labels each settlement by where it came from', async () => {
    const queue = await getSettlementsQueue(clientReturning(rows), {})
    expect(queue.rows.map((r) => [r.id, r.source])).toEqual([
      ['s-aff', 'affiliate'],
      ['s-fee', 'mission_fee'],
      ['s-man', 'manual'],
    ])
  })

  it('filters rows by source while leaving the summary over the full queue', async () => {
    const queue = await getSettlementsQueue(clientReturning(rows), { source: 'affiliate' })
    expect(queue.rows.map((r) => r.id)).toEqual(['s-aff'])
    expect(queue.summary.total).toBe(3)
  })

  it('combines the status and source facets', async () => {
    const queue = await getSettlementsQueue(clientReturning(rows), { status: 'pending', source: 'mission_fee' })
    expect(queue.rows.map((r) => r.id)).toEqual(['s-fee'])
  })
})
~~~

Add `clientReturning` next to the file's existing helpers if it does not already exist — a stub whose `listOpsSettlements` resolves `{ data: rows, error: null }`, matching the shape the module already mocks.

- [ ] Step 2: Run and confirm failure.

~~~bash
pnpm --filter web exec vitest run tests/admin.creators-queries.test.ts
~~~

Expected: FAIL — `source` is undefined on every row.

- [ ] Step 3: In `apps/web/lib/admin/creators-queries.ts`, add the type, extend `PayoutRow` and `OpsSettlementJoinRow`, and derive the source in `toPayoutRow`:

~~~ts
/** Where a settlement row came from. Derived, never stored — the shape of the row is the
 *  evidence: an affiliate event embed, a mission fee amount, or neither (a legacy or
 *  hand-created row that predates R10.1's minting triggers). */
export type SettlementSource = 'affiliate' | 'mission_fee' | 'manual'
~~~

Add `source: SettlementSource` to `PayoutRow` (after `missionTitle`), and add these two fields to `OpsSettlementJoinRow` — both are already returned by `opsSettlementSelect` but were dropped by the cast:

~~~ts
  paid_fee_amount: number | null
  affiliate_network_events?: { id?: string | null } | Array<{ id?: string | null }> | null
~~~

Then in `toPayoutRow`, above the `return`:

~~~ts
  const affiliateEvent = oneJoin(r.affiliate_network_events)
  const source: SettlementSource = affiliateEvent?.id
    ? 'affiliate'
    : r.paid_fee_amount !== null
      ? 'mission_fee'
      : 'manual'
~~~

and add `source,` to the returned object.

- [ ] Step 4: Extend `getSettlementsQueue`'s options and filtering. Change the signature to:

~~~ts
export async function getSettlementsQueue(
  supabase: Client,
  opts: { status?: SettlementStatus; source?: SettlementSource },
): Promise<PayoutsQueue> {
~~~

and replace the single filter line with:

~~~ts
  // The summary stays over the FULL queue so the money-flow cards do not move while ops
  // drills into a facet — the existing rule for `status`, extended to `source`.
  const rows = all.filter(
    (r) => (!opts.status || r.status === opts.status) && (!opts.source || r.source === opts.source),
  )
~~~

- [ ] Step 5: In `apps/web/lib/admin/creators-validation.ts`, add the guard beside `isSettlementStatus`:

~~~ts
export function isSettlementSource(v: string): v is SettlementSource {
  return v === 'affiliate' || v === 'mission_fee' || v === 'manual'
}
~~~

importing `SettlementSource` as a type from `@/lib/admin/creators-queries`.

- [ ] Step 6: In `apps/web/app/[locale]/admin/creators/payouts/page.tsx`, widen the search params and pass the facet through:

~~~tsx
type Search = { status?: string; source?: string }
~~~

~~~tsx
  const status = sp.status && isSettlementStatus(sp.status) ? sp.status : undefined
  const source = sp.source && isSettlementSource(sp.source) ? sp.source : undefined
  const queue = await getSettlementsQueue(supabase, { status, source })
  return (
    <CreatorPayoutsView
      t={messages.creators}
      locale={loc}
      queue={queue}
      status={status}
      source={source}
      action={setSettlementStatus}
    />
  )
~~~

adding `isSettlementSource` to the existing `@/lib/admin/creators-validation` import.

- [ ] Step 7: In `apps/web/components/kinnso/admin/creators/CreatorPayoutsView.tsx`, add `source?: SettlementSource` to the props type, render a source filter alongside the existing status filter using the same link-based pattern that component already uses for status, and show `row.source` as a per-row label. Do not colour-code it alone — the R7.10 gate requires status to be conveyed as text, not colour.

- [ ] Step 8: Run the tests.

~~~bash
pnpm --filter web exec vitest run tests/admin.creators-queries.test.ts
~~~

Expected: PASS.

- [ ] Step 9: Commit.

~~~bash
git add apps/web/lib/admin apps/web/app/\[locale\]/admin/creators/payouts/page.tsx apps/web/components/kinnso/admin/creators/CreatorPayoutsView.tsx apps/web/tests/admin.creators-queries.test.ts
git commit -m "feat(r10.1): add a settlement source facet to the ops payouts queue"
~~~

**Verification:**

~~~bash
pnpm --filter web exec vitest run tests/admin.creators-queries.test.ts
pnpm typecheck
pnpm lint
~~~

---

### Task 6: Live proof and the full gate

The migration-text tests prove the SQL says the right thing. Only a real Postgres proves it *does* the right thing — and the whole phase turns on idempotency, which text assertions cannot demonstrate.

**Files:**
- Create: `apps/web/tests/settlement-minting.rls.test.ts`
- Modify: `packages/db/types.ts`

**Steps:**

- [ ] Step 1: Replay every migration from scratch against a clean local stack.

~~~bash
pnpm exec supabase start
pnpm exec supabase db reset
~~~

Expected: all 105 migrations apply. A failure here is almost certainly the duplicate pre-check in `20260815100000` firing, or a partial-index `ON CONFLICT` predicate mismatch in one of the triggers.

- [ ] Step 2: Regenerate types from the **local** stack only. `pnpm --filter @kinnso/db gen` is `--linked` and reads production — do not run it.

~~~bash
pnpm exec supabase gen types typescript --local > packages/db/types.ts
git diff --stat packages/db/types.ts
~~~

Expected: an empty or near-empty diff. This phase adds no table and no callable RPC — the two new functions are trigger-only with all EXECUTE revoked, so they should not appear in the `Functions` block at all. A large diff means the local stack and the migration set disagree, which is a finding to report rather than commit.

- [ ] Step 3: Write `apps/web/tests/settlement-minting.rls.test.ts`. Copy the harness block from R10.0's plan (`docs/superpowers/plans/2026-08-15-phase-r10-0-unified-earnings-read-model.md`, Task 8 Step 2) verbatim — the `d` skip gate, `runPsql`, `clientFor`, `svc`, `hookTimeout`/`testTimeout` and the `auth.users` + `auth.identities` seed are identical here — then replace the assertions with the eight below. Most of this suite runs through `svc()` rather than a user client, because minting is triggered by service-role and definer paths, not by an end user.

The two assertions that carry the phase are 2 and 6; write them first. Assertion 2 in full, since it is the exact sequence the nightly cron performs:

~~~ts
  it('is idempotent under cron replay', async () => {
    const s = svc()
    const row = {
      network: 'travelpayouts',
      external_action_id: `replay-${runId}`,
      mission_id: missionId,
      mission_participant_id: participantId,
      creator_id: creatorC,
      sub_id: `kinnso_m_x_p_y_c_z_${runId}`,
      event_state: 'paid',
      profit_amount: 100,
      currency: 'usd',
    }

    // The route's exact call shape: onConflict on the natural key, ignoreDuplicates NOT set,
    // so a re-run is a real ON CONFLICT DO UPDATE — the same UPDATE the trigger sees nightly.
    await s.from('affiliate_network_events').upsert([row], { onConflict: 'network,external_action_id' })
    await s.from('affiliate_network_events').upsert([row], { onConflict: 'network,external_action_id' })
    await s.from('affiliate_network_events').upsert([row], { onConflict: 'network,external_action_id' })

    const { data: evs } = await s.from('affiliate_network_events')
      .select('id').eq('external_action_id', `replay-${runId}`)
    const { count } = await s.from('mission_settlements')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_network_event_id', evs![0].id)

    expect(evs).toHaveLength(1)
    expect(count).toBe(1)
  }, testTimeout)
~~~

and assertion 6 in full, since the revision cycle is the duplicate case the participant-scoped partial index exists for:

~~~ts
  it('does not duplicate across a revision cycle or a second milestone', async () => {
    const s = svc()
    const countFees = async () => {
      const { count } = await s.from('mission_settlements')
        .select('id', { count: 'exact', head: true })
        .eq('mission_participant_id', feeParticipantId)
        .is('affiliate_network_event_id', null)
      return count
    }

    await s.from('mission_milestone_submissions').update({ status: 'approved' }).eq('id', submissionA)
    expect(await countFees()).toBe(1)

    await s.from('mission_milestone_submissions').update({ status: 'revision_requested' }).eq('id', submissionA)
    await s.from('mission_milestone_submissions').update({ status: 'approved' }).eq('id', submissionA)
    expect(await countFees()).toBe(1)

    // A second milestone on the same participation must not mint a second fee.
    await s.from('mission_milestone_submissions').update({ status: 'approved' }).eq('id', submissionB)
    expect(await countFees()).toBe(1)
  }, testTimeout)
~~~

Then add the remaining six:

1. Inserting an `affiliate_network_events` row with `event_state = 'paid'` and full attribution mints exactly one `mission_settlements` row, with `creator_commission_amount` equal to `profit_amount × creator_commission_rate ÷ 100` rounded to 2 decimals.
2. **Cron replay is a no-op** — written in full above. The single most important assertion in the phase.
3. Updating an event from `processing` to `paid` mints one row; updating it again while already `paid` mints none.
4. An event with `event_state = 'processing'`, or with a null `mission_participant_id`, or on a mission whose `creator_commission_rate` is null, mints nothing.
5. Approving a submission on a `paid` merchant mission with `paid_fee_amount = 1200` mints one settlement with `paid_fee_amount = 1200`, `creator_commission_amount` NULL, and `creator_payout_status = 'pending'`.
6. **The revision cycle does not duplicate** — written in full above.
7. A `coupon_affiliate` mission, and a `travelpayouts`-source mission, each mint nothing on approval.
8. Creator D cannot see creator C's minted settlements through `creator_earnings_summary()`, and the events that produced C's settlements are absent from C's own `tracked_affiliate` array — the R10.0 anti-double-count clause, now exercised with real minted rows.

- [ ] Step 4: Run the live suite.

~~~bash
pnpm --filter web exec vitest run tests/settlement-minting.rls.test.ts
~~~

Expected: PASS. A skip is not a pass — if it skips, `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_DB_CONTAINER` is missing from `apps/web/.env.test`.

- [ ] Step 5: Confirm R10.0's surface now shows real money end to end: with the seeded rows from Step 3 still present, call `creator_earnings_summary()` as creator C and assert the settlement appears under `mission_settlements` and no longer under `tracked_affiliate`.

- [ ] Step 6: Full-repository gate.

~~~bash
pnpm typecheck
pnpm lint
pnpm honesty:lint
pnpm test
~~~

Expected: green. Report separately, and do not absorb as R10.1 regressions: DB-dependent suites fail without a local stack, and the `Booking ON` e2e leg remains blocked on `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`.

- [ ] Step 7: Commit and open the PR.

~~~bash
git add apps/web/tests/settlement-minting.rls.test.ts packages/db/types.ts
git commit -m "test(r10.1): prove settlement minting is idempotent under replay and revision"
~~~

**Verification:**

~~~bash
pnpm exec supabase db reset
pnpm --filter web exec vitest run tests/settlement-minting.rls.test.ts
pnpm typecheck
pnpm lint
pnpm honesty:lint
pnpm test
~~~

None of the four migrations is applied to production by this plan. Applying them is an operator action taken after review, in filename order, following `docs/ops/r10-0-migration-ledger-baseline.md`. Because `20260815100300` is a backfill over real conversion data, capture the row count it inserts and record it in the phase PR.

---

## Plan self-review checklist

- Idempotency ships **before** anything that mints, so there is no window in which a trigger exists without the constraint that makes it safe.
- Both `ON CONFLICT` clauses repeat their partial index's predicate verbatim; Postgres cannot infer a partial unique index otherwise, and this is the most likely way the implementation silently breaks.
- Two separate unique indexes, not one, because an affiliate settlement and a mission-fee settlement can legitimately exist for the same participant — a single participant-keyed constraint would block real money.
- The error policy is stated and justified rather than copied: guards return early for every legitimate data state, so a raise means a genuine invariant violation, and a settlement never fails silently.
- The trigger-instead-of-cron deviation from the roadmap is declared up front with five verified reasons, and the plan proves it by requiring the cron's own test suite to pass unmodified.
- Rates are percentages, not fractions, and every computation divides by 100 — checked against the seeded `creator_commission_rate = 70`.
- No mission with a missing rate or fee gets an invented default; it mints nothing, which is the honest outcome.
- Every minted row is an obligation (`status = 'pending'`, `creator_payout_status = 'pending'`); nothing in this phase can mark money paid.
- The mint-on-first-approval timing is stated explicitly rather than left implicit, with the ops payout gate as the control and R11.0 named as where proration would belong.
- Mission-fee history is deliberately not backfilled, and the reason — no record of the fee in force at approval time — is recorded rather than left as an omission.
- The two most dangerous real-world sequences, cron replay and the revision cycle, are each a named assertion in the live suite rather than an assumption.
- Nothing runs against the production database, and the one script that would have is explicitly replaced with its `--local` form.
