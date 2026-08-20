# Phase R11.2 — Merchant Budget Backing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back paid/hybrid mission approvals with funded merchant budgets — when enforced, an approval whose settlement the balance can't cover fails atomically across all three approval paths.

**Architecture:** An `AFTER INSERT` trigger on `mission_settlements` is the single funding gate (inheriting R10.1's first-approval dedupe); two admin-gated ops RPCs fund and enforce; owner-scoped RLS backs the merchant's read-only panel; a definer RPC backs the creator-facing "Funded" badge (RLS-join gotcha).

**Tech Stack:** Next.js 16 App Router · Supabase (Postgres + RLS + PL/pgSQL) · Vitest 4

---

## Standing constraints (every task)

- NEVER touch the live/production database (repo is linked to prod project `scryfkefedzuetfdtrvl`). No `supabase db push`, no `migration repair`, no Supabase MCP tools. Migrations are file-only until the live-proof task runs them on the LOCAL stack.
- NEVER edit a shipped migration — always a new timestamped file.
- Do NOT run `pnpm --filter @kinnso/db gen` (reads production). Types are hand-added (Task 4).
- Migration-text contract tests read the raw SQL via Node fs and assert on `.toLowerCase().replaceAll(/\s+/gu, ' ')`-normalized text — they never touch a DB.
- sql-negative-assertion-comment-gotcha: if a test asserts `not.toContain(X)` against the whole file, migration COMMENTS must not contain X either.
- Typecheck gate per task: `cd apps/web && npx tsc --noEmit` must show no errors outside the known pending-i18n-locale files (none expected until Task 9's window, where the 6 non-English locale files may fail until Task 9 lands — that's the established convention).

## File Structure

**New files:**
- `supabase/migrations/20260820100000_r11_2_merchant_budgets.sql` — both tables + RLS
- `supabase/migrations/20260820100100_r11_2_budget_debit_trigger.sql` — funding gate
- `supabase/migrations/20260820100200_r11_2_budget_rpcs.sql` — 3 RPCs
- `apps/web/tests/db.merchant-budgets.test.ts`, `apps/web/tests/db.budget-debit-trigger.test.ts`, `apps/web/tests/db.budget-rpcs.test.ts`
- `apps/web/lib/merchants/budget-queries.ts` — merchant-side reads
- `apps/web/app/[locale]/merchants/dashboard/budget/page.tsx` + `apps/web/components/kinnso/pages/MerchantBudgetView.tsx`
- `apps/web/lib/admin/budget-actions.ts` — ops credit/enforcement actions
- `apps/web/components/kinnso/admin/merchants/MerchantBudgetPanel.tsx`
- `apps/web/tests/merchants.budget-queries.test.ts`, `apps/web/tests/merchant.budget.host.test.tsx`, `apps/web/tests/admin.budget-actions.test.ts`, `apps/web/tests/kinnso.MerchantBudgetPanel.test.tsx`
- `apps/web/tests/merchant-budgets.rls.test.ts` — live proof

**Modified files:**
- `packages/db/types.ts` — 2 Tables entries, 3 Functions entries
- `apps/web/lib/admin/merchants-queries.ts` — ops budget read
- `apps/web/components/kinnso/admin/merchants/MerchantDetailView.tsx` + `apps/web/app/[locale]/admin/merchants/[merchantId]/page.tsx`
- `apps/web/lib/missions/queries.ts` (`creatorMissionSelect` gains `merchant_profile_id`), `apps/web/app/[locale]/studio/missions/page.tsx`, `apps/web/components/kinnso/pages/CreatorMissionsView.tsx`
- `apps/web/lib/missions/actions.ts` + `apps/web/lib/admin/mission-review-actions.ts` — friendly error mapping
- `apps/web/components/kinnso/pages/MerchantDashboardHomeView.tsx` — budget card
- `apps/web/lib/i18n/messages/*.ts` (en first, all 7 in Task 9)

---

### Task 1: `merchant_budgets` + `merchant_budget_transactions` tables

**Files:**
- Create: `supabase/migrations/20260820100000_r11_2_merchant_budgets.sql`
- Test: `apps/web/tests/db.merchant-budgets.test.ts`

- [ ] **Step 1: Write the failing contract test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_2_merchant_budgets.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.2 merchant_budgets + merchant_budget_transactions', () => {
  it('creates merchant_budgets with a non-negative balance, HKD default currency, and enforcement off by default', () => {
    expect(sql).toContain('create table public.merchant_budgets')
    expect(sql).toContain('merchant_profile_id uuid not null unique references public.merchant_profiles(id) on delete cascade')
    expect(sql).toContain('balance numeric(12,2) not null default 0 check (balance >= 0)')
    expect(sql).toContain("currency text not null default 'hkd'")
    expect(sql).toContain('enforced boolean not null default false')
  })

  it('creates the ledger with kind/amount/balance_after and a unique source_ref for idempotency', () => {
    expect(sql).toContain('create table public.merchant_budget_transactions')
    expect(sql).toContain('merchant_budget_id uuid not null references public.merchant_budgets(id)')
    expect(sql).toContain("kind text not null check (kind in ('topup', 'debit', 'adjust'))")
    expect(sql).toContain('amount numeric(12,2) not null')
    expect(sql).toContain('balance_after numeric(12,2) not null check (balance_after >= 0)')
    expect(sql).toContain('source_ref text unique')
    expect(sql).toContain('create index merchant_budget_transactions_budget_idx on public.merchant_budget_transactions (merchant_budget_id, created_at desc)')
  })

  it('enables RLS on both tables with owner-or-ops SELECT policies', () => {
    expect(sql).toContain('alter table public.merchant_budgets enable row level security')
    expect(sql).toContain('alter table public.merchant_budget_transactions enable row level security')
    expect(sql).toContain('create policy merchant_budgets_select on public.merchant_budgets')
    expect(sql).toContain('create policy merchant_budget_transactions_select on public.merchant_budget_transactions')
    expect(sql).toContain("ops.status = 'active'")
  })

  it('grants no client writes on either table — definer functions are the only writers', () => {
    expect(sql).toContain('revoke all on public.merchant_budgets from public, anon, authenticated')
    expect(sql).toContain('revoke all on public.merchant_budget_transactions from public, anon, authenticated')
    expect(sql).toContain('grant select on public.merchant_budgets to authenticated')
    expect(sql).toContain('grant select on public.merchant_budget_transactions to authenticated')
    expect(sql).not.toContain('grant insert')
    expect(sql).not.toContain('grant update')
    expect(sql).not.toContain('grant delete')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.merchant-budgets.test.ts`
Expected: FAIL — no matching migration file

- [ ] **Step 3: Write the migration**

Note: currency is stored uppercase (`'HKD'`) — the test's lowercase-normalized assertion matches either way. Comments must avoid the phrases `grant insert`/`grant update`/`grant delete` (negative-assertion gotcha).

```sql
-- R11.2 -- merchant budget backing (Adfocate 0024 shape, Kinnso naming). A budget row is
-- created lazily by the first ops credit (admin_credit_merchant_budget upserts); merchants
-- without a row -- and rows with enforced = false -- behave exactly as before this phase.
-- Only definer functions ever write these tables: the client roles get SELECT behind the
-- policies below and nothing else.

create table public.merchant_budgets (
  id                  uuid primary key default gen_random_uuid(),
  merchant_profile_id uuid not null unique references public.merchant_profiles(id) on delete cascade,
  balance             numeric(12,2) not null default 0 check (balance >= 0),
  currency            text not null default 'HKD',
  enforced            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Append-only ledger. amount is the SIGNED delta (positive topup, negative debit);
-- balance_after snapshots the post-transaction balance so the ledger is self-auditing
-- without replaying. source_ref is the idempotency key -- debits write
-- 'settlement:<settlement id>' and its uniqueness makes any replay a no-op error rather
-- than a double debit; ops credits leave it null (multiple nulls never collide).
create table public.merchant_budget_transactions (
  id                 uuid primary key default gen_random_uuid(),
  merchant_budget_id uuid not null references public.merchant_budgets(id),
  kind               text not null check (kind in ('topup', 'debit', 'adjust')),
  amount             numeric(12,2) not null,
  balance_after      numeric(12,2) not null check (balance_after >= 0),
  source_ref         text unique,
  reason             text,
  created_at         timestamptz not null default now()
);

create index merchant_budget_transactions_budget_idx
  on public.merchant_budget_transactions (merchant_budget_id, created_at desc);

alter table public.merchant_budgets enable row level security;
alter table public.merchant_budget_transactions enable row level security;

-- Owning merchant (via merchant_profiles.user_id) or any active ops member reads.
create policy merchant_budgets_select on public.merchant_budgets
  for select
  to authenticated
  using (
    exists (
      select 1 from public.merchant_profiles mp
      where mp.id = merchant_budgets.merchant_profile_id
        and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy merchant_budget_transactions_select on public.merchant_budget_transactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.merchant_budgets b
      join public.merchant_profiles mp on mp.id = b.merchant_profile_id
      where b.id = merchant_budget_transactions.merchant_budget_id
        and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

revoke all on public.merchant_budgets from public, anon, authenticated;
revoke all on public.merchant_budget_transactions from public, anon, authenticated;
grant select on public.merchant_budgets to authenticated;
grant select on public.merchant_budget_transactions to authenticated;
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.merchant-budgets.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260820100000_r11_2_merchant_budgets.sql apps/web/tests/db.merchant-budgets.test.ts
git commit -m "feat(db): add merchant_budgets and append-only budget ledger"
```

---

### Task 2: The funding-gate trigger

**Files:**
- Create: `supabase/migrations/20260820100100_r11_2_budget_debit_trigger.sql`
- Test: `apps/web/tests/db.budget-debit-trigger.test.ts`

- [ ] **Step 1: Write the failing contract test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_2_budget_debit_trigger.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.2 budget debit trigger', () => {
  it('is a SECURITY DEFINER function fired AFTER INSERT on mission_settlements', () => {
    expect(sql).toContain('create or replace function public.debit_merchant_budget_on_settlement() returns trigger')
    expect(sql).toContain('language plpgsql security definer set search_path = public')
    expect(sql).toContain('create trigger debit_merchant_budget_on_settlement_trg')
    expect(sql).toContain('after insert on public.mission_settlements')
  })

  it('acts only on fee settlements, mirroring the R10.1 mint guard', () => {
    expect(sql).toContain('if new.mission_participant_id is null or new.affiliate_network_event_id is not null then return new; end if;')
    expect(sql).toContain('if new.paid_fee_amount is null or new.paid_fee_amount <= 0 then return new; end if;')
  })

  it('no-ops when there is no budget row or enforcement is off, and locks the row when enforced', () => {
    expect(sql).toContain('for update')
    expect(sql).toContain('if not found or not v_enforced then return new; end if;')
  })

  it('raises currency_mismatch and insufficient_budget as its two blocking conditions, in that order', () => {
    expect(sql).toContain(
      "if v_currency is distinct from upper(coalesce(new.amount_currency, 'hkd')) then raise exception 'currency_mismatch'; end if; " +
      "if v_balance < new.paid_fee_amount then raise exception 'insufficient_budget'; end if;"
    )
  })

  it('debits and writes exactly one ledger row keyed by the settlement id, in the same transaction', () => {
    expect(sql).toContain('update public.merchant_budgets set balance = balance - new.paid_fee_amount, updated_at = now() where id = v_budget_id')
    expect(sql).toContain("insert into public.merchant_budget_transactions (merchant_budget_id, kind, amount, balance_after, source_ref)")
    expect(sql).toContain("values (v_budget_id, 'debit', -new.paid_fee_amount, v_balance - new.paid_fee_amount, 'settlement:' || new.id)")
  })

  it('never swallows exceptions -- blocking the transaction is its job', () => {
    const fnStart = sql.indexOf('create or replace function public.debit_merchant_budget_on_settlement()')
    const fnEnd = sql.indexOf('create trigger debit_merchant_budget_on_settlement_trg')
    expect(sql.slice(fnStart, fnEnd)).not.toContain('when others')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.budget-debit-trigger.test.ts`
Expected: FAIL — no matching migration file

- [ ] **Step 3: Write the migration**

The comment must not contain the phrase `when others` (negative-assertion gotcha — say "exception handler" instead).

```sql
-- R11.2 -- the funding gate. AFTER INSERT on mission_settlements, so it fires exactly when
-- R10.1's create_mission_settlement_on_approval mints a fee obligation -- and ONLY for rows
-- actually inserted: the mint's `on conflict do nothing` dedupe means a revision-flap
-- re-approval never reaches this function, so a double debit is structurally impossible
-- without duplicating any of the mint's own guard logic here.
--
-- A raise below aborts the whole transaction: the settlement insert AND the approval UPDATE
-- that caused it, on every approval path (merchant plain update, admin_review_submission,
-- and the R11.1 auto-approve trigger -- whose own exception handler downgrades the abort to
-- a logged warning, correctly leaving the submission in the queue). Unlike the
-- notification-style triggers, this one deliberately has NO exception handler -- blocking
-- the transaction is its entire job.
--
-- Fee-settlement guard mirrors the mint trigger's own output shape: a fee settlement has a
-- participant, no affiliate event, and a positive paid_fee_amount. Affiliate and booking
-- settlements never match.
create or replace function public.debit_merchant_budget_on_settlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_merchant_profile_id uuid;
  v_budget_id           uuid;
  v_balance             numeric;
  v_currency            text;
  v_enforced            boolean;
begin
  if new.mission_participant_id is null or new.affiliate_network_event_id is not null then return new; end if;
  if new.paid_fee_amount is null or new.paid_fee_amount <= 0 then return new; end if;

  select m.merchant_profile_id into v_merchant_profile_id
    from public.missions m where m.id = new.mission_id;
  if v_merchant_profile_id is null then return new; end if;

  -- Lock the budget row so concurrent approvals against the same budget serialize; the
  -- lock is only taken when a row exists, and enforcement is re-read under the lock.
  select b.id, b.balance, b.currency, b.enforced
    into v_budget_id, v_balance, v_currency, v_enforced
    from public.merchant_budgets b
    where b.merchant_profile_id = v_merchant_profile_id
    for update;
  if not found or not v_enforced then return new; end if;

  if v_currency is distinct from upper(coalesce(new.amount_currency, 'HKD')) then
    raise exception 'currency_mismatch';
  end if;
  if v_balance < new.paid_fee_amount then
    raise exception 'insufficient_budget';
  end if;

  update public.merchant_budgets
    set balance = balance - new.paid_fee_amount, updated_at = now()
    where id = v_budget_id;

  insert into public.merchant_budget_transactions (merchant_budget_id, kind, amount, balance_after, source_ref)
    values (v_budget_id, 'debit', -new.paid_fee_amount, v_balance - new.paid_fee_amount, 'settlement:' || new.id);

  return new;
end;
$$;

revoke all on function public.debit_merchant_budget_on_settlement()
  from public, anon, authenticated, service_role;

create trigger debit_merchant_budget_on_settlement_trg
  after insert on public.mission_settlements
  for each row execute function public.debit_merchant_budget_on_settlement();
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.budget-debit-trigger.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260820100100_r11_2_budget_debit_trigger.sql apps/web/tests/db.budget-debit-trigger.test.ts
git commit -m "feat(db): gate fee-settlement minting on enforced merchant budgets"
```

---

### Task 3: The three RPCs

**Files:**
- Create: `supabase/migrations/20260820100200_r11_2_budget_rpcs.sql`
- Test: `apps/web/tests/db.budget-rpcs.test.ts`

- [ ] **Step 1: Write the failing contract test**

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_2_budget_rpcs.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.2 budget RPCs', () => {
  it('admin_credit_merchant_budget gates on admin rank, requires a reason, and validates the amount', () => {
    expect(sql).toContain('create or replace function public.admin_credit_merchant_budget(p_merchant_profile_id uuid, p_amount numeric, p_reason text)')
    expect(sql).toContain("if not public.is_active_ops_role('admin') then raise exception 'forbidden' using errcode = '42501'; end if;")
    expect(sql).toContain("if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;")
    expect(sql).toContain("if p_amount is null or p_amount = 0 then raise exception 'bad_amount'; end if;")
  })

  it('admin_credit_merchant_budget upserts the budget row, floor-checks negative adjustments, and ledgers with balance_after', () => {
    expect(sql).toContain('insert into public.merchant_budgets (merchant_profile_id) values (p_merchant_profile_id) on conflict (merchant_profile_id) do nothing')
    expect(sql).toContain('for update')
    expect(sql).toContain("if v_balance + p_amount < 0 then raise exception 'insufficient_budget'; end if;")
    expect(sql).toContain("case when p_amount > 0 then 'topup' else 'adjust' end")
    expect(sql).toContain('v_balance + p_amount')
  })

  it('admin_set_budget_enforcement gates on admin rank, requires an existing row, and audits', () => {
    expect(sql).toContain('create or replace function public.admin_set_budget_enforcement(p_merchant_profile_id uuid, p_enforced boolean, p_reason text)')
    expect(sql).toContain("if not found then raise exception 'not_found'; end if;")
  })

  it('both write RPCs append to ops_audit_log', () => {
    expect((sql.match(/perform public\.ops_audit_log_append\('merchant'/gu) ?? []).length).toBe(2)
  })

  it('funded_merchant_profiles is a stable definer returning only enforced merchant ids', () => {
    expect(sql).toContain('create or replace function public.funded_merchant_profiles()')
    expect(sql).toContain('returns setof uuid')
    expect(sql).toContain('language sql stable security definer set search_path = public')
    expect(sql).toContain('select merchant_profile_id from public.merchant_budgets where enforced')
  })

  it('revokes all three from public/anon; write RPCs granted to authenticated, read RPC too', () => {
    expect(sql).toContain('revoke all on function public.admin_credit_merchant_budget(uuid, numeric, text) from public, anon')
    expect(sql).toContain('revoke all on function public.admin_set_budget_enforcement(uuid, boolean, text) from public, anon')
    expect(sql).toContain('revoke all on function public.funded_merchant_profiles() from public, anon')
    expect(sql).toContain('grant execute on function public.admin_credit_merchant_budget(uuid, numeric, text) to authenticated')
    expect(sql).toContain('grant execute on function public.admin_set_budget_enforcement(uuid, boolean, text) to authenticated')
    expect(sql).toContain('grant execute on function public.funded_merchant_profiles() to authenticated')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run tests/db.budget-rpcs.test.ts`
Expected: FAIL — no matching migration file

- [ ] **Step 3: Write the migration**

```sql
-- R11.2 -- ops funding surface + the creator-facing funded read. Both write RPCs are
-- modeled on admin_set_settlement_status's shape (admin gate -> validate -> lock -> write ->
-- ops_audit_log_append in one transaction). Reads for the badge go through
-- funded_merchant_profiles() because merchant_budgets is owner-scoped: a creator's session
-- joining through it would silently see nothing (the documented RLS-join gotcha), so the
-- definer function exposes exactly the funded bit and nothing else -- never balances.

create or replace function public.admin_credit_merchant_budget(p_merchant_profile_id uuid, p_amount numeric, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_budget_id uuid;
  v_balance   numeric;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'bad_amount'; end if;
  if not exists (select 1 from public.merchant_profiles where id = p_merchant_profile_id) then
    raise exception 'not_found';
  end if;

  -- Lazy row creation: the first credit creates the budget (enforced stays false until
  -- admin_set_budget_enforcement flips it).
  insert into public.merchant_budgets (merchant_profile_id)
    values (p_merchant_profile_id)
    on conflict (merchant_profile_id) do nothing;

  select id, balance into v_budget_id, v_balance
    from public.merchant_budgets
    where merchant_profile_id = p_merchant_profile_id
    for update;

  -- Floor-check up front so a too-large negative adjustment surfaces as a clean exception
  -- rather than the balance >= 0 constraint's raw error.
  if v_balance + p_amount < 0 then raise exception 'insufficient_budget'; end if;

  update public.merchant_budgets
    set balance = v_balance + p_amount, updated_at = now()
    where id = v_budget_id;

  insert into public.merchant_budget_transactions (merchant_budget_id, kind, amount, balance_after, reason)
    values (v_budget_id, case when p_amount > 0 then 'topup' else 'adjust' end, p_amount, v_balance + p_amount, p_reason);

  perform public.ops_audit_log_append('merchant', p_merchant_profile_id, 'budget.credit', p_reason,
    jsonb_build_object('amount', p_amount, 'balance_after', v_balance + p_amount));
end;
$$;

create or replace function public.admin_set_budget_enforcement(p_merchant_profile_id uuid, p_enforced boolean, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if p_enforced is null then raise exception 'bad_enforced'; end if;

  -- Enforcement without funding is meaningless: credit first (which creates the row).
  update public.merchant_budgets
    set enforced = p_enforced, updated_at = now()
    where merchant_profile_id = p_merchant_profile_id;
  if not found then raise exception 'not_found'; end if;

  perform public.ops_audit_log_append('merchant', p_merchant_profile_id, 'budget.enforcement', p_reason,
    jsonb_build_object('enforced', p_enforced));
end;
$$;

create or replace function public.funded_merchant_profiles()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select merchant_profile_id from public.merchant_budgets where enforced
$$;

revoke all on function public.admin_credit_merchant_budget(uuid, numeric, text) from public, anon;
revoke all on function public.admin_set_budget_enforcement(uuid, boolean, text) from public, anon;
revoke all on function public.funded_merchant_profiles() from public, anon;
grant execute on function public.admin_credit_merchant_budget(uuid, numeric, text) to authenticated;
grant execute on function public.admin_set_budget_enforcement(uuid, boolean, text) to authenticated;
grant execute on function public.funded_merchant_profiles() to authenticated;
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && npx vitest run tests/db.budget-rpcs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260820100200_r11_2_budget_rpcs.sql apps/web/tests/db.budget-rpcs.test.ts
git commit -m "feat(db): add budget credit/enforcement RPCs and the funded-merchants read"
```

---

### Task 4: Hand-add `packages/db/types.ts` entries

No `pnpm --filter @kinnso/db gen` — it reads production.

**Files:**
- Modify: `packages/db/types.ts`

- [ ] **Step 1: Add both Tables entries**

In the `Tables` block, insert alphabetically (find `merchant_profiles`'s entry; `merchant_budget_transactions` and `merchant_budgets` sort BEFORE it):

```typescript
      merchant_budget_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          kind: string
          merchant_budget_id: string
          reason: string | null
          source_ref: string | null
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          kind: string
          merchant_budget_id: string
          reason?: string | null
          source_ref?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          kind?: string
          merchant_budget_id?: string
          reason?: string | null
          source_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_budget_transactions_merchant_budget_id_fkey"
            columns: ["merchant_budget_id"]
            isOneToOne: false
            referencedRelation: "merchant_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_budgets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          enforced: boolean
          id: string
          merchant_profile_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          enforced?: boolean
          id?: string
          merchant_profile_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          enforced?: boolean
          id?: string
          merchant_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_budgets_merchant_profile_id_fkey"
            columns: ["merchant_profile_id"]
            isOneToOne: true
            referencedRelation: "merchant_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 2: Add the three Functions entries**

Alphabetically in the `Functions` block:

```typescript
      admin_credit_merchant_budget: {
        Args: { p_merchant_profile_id: string; p_amount: number; p_reason: string }
        Returns: undefined
      }
```
(sorts right after `admin_creator_analytics` / before `admin_invite_ops_member` — check neighbors and place accordingly)

```typescript
      admin_set_budget_enforcement: {
        Args: { p_merchant_profile_id: string; p_enforced: boolean; p_reason: string }
        Returns: undefined
      }
```
(sorts right before `admin_set_booking_settlement_status`)

```typescript
      funded_merchant_profiles: { Args: never; Returns: string[] }
```
(sorts among the f-entries)

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add packages/db/types.ts
git commit -m "chore(db): hand-add R11.2 budget types (tables + three RPCs)

pnpm --filter @kinnso/db gen reads production -- see db-gen-linked-production-gotcha."
```

---

### Task 5: Merchant dashboard budget page

**Files:**
- Create: `apps/web/lib/merchants/budget-queries.ts`
- Create: `apps/web/components/kinnso/pages/MerchantBudgetView.tsx`
- Create: `apps/web/app/[locale]/merchants/dashboard/budget/page.tsx`
- Modify: `apps/web/components/kinnso/pages/MerchantDashboardHomeView.tsx` (budget card — read the file first for its card structure)
- Modify: `apps/web/lib/i18n/messages/en.ts` (`merchantDashboard` namespace)
- Test: `apps/web/tests/merchants.budget-queries.test.ts`, `apps/web/tests/merchant.budget.host.test.tsx`

- [ ] **Step 1: i18n keys (en.ts only)**

Add to the `MerchantDashboardMessages`-equivalent interface AND the `merchantDashboard` object (read `apps/web/lib/i18n/messages/en.ts` around the existing `merchantDashboard` block for the exact interface name and key order — append after its existing card keys):

```typescript
  cardBudgetTitle: string
  cardBudgetBody: string
  budgetTitle: string
  budgetSubtitle: string
  budgetBalance: string
  budgetEnforcedOn: string
  budgetEnforcedOff: string
  budgetLedgerTitle: string
  budgetLedgerEmpty: string
  budgetNoBudget: string
  kindTopup: string
  kindDebit: string
  kindAdjust: string
```

```typescript
    cardBudgetTitle: 'Budget',
    cardBudgetBody: 'Your mission funding balance and history.',
    budgetTitle: 'Budget',
    budgetSubtitle: 'Funding that backs your paid mission approvals.',
    budgetBalance: 'Balance',
    budgetEnforcedOn: 'Enforced — approvals require funding',
    budgetEnforcedOff: 'Not enforced',
    budgetLedgerTitle: 'History',
    budgetLedgerEmpty: 'No transactions yet.',
    budgetNoBudget: 'No budget set up yet — contact KINNSO ops to fund missions.',
    kindTopup: 'Top-up',
    kindDebit: 'Debit',
    kindAdjust: 'Adjustment',
```

- [ ] **Step 2: Write the failing query test**

```typescript
// apps/web/tests/merchants.budget-queries.test.ts
import { describe, expect, it } from 'vitest'
import { getMerchantBudget } from '@/lib/merchants/budget-queries'

type ChainResult = { data: unknown; error: unknown }
function makeChain(result: ChainResult) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: ChainResult) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return chain
}
function fakeClient(tables: Record<string, ChainResult>) {
  return {
    from: (table: string) => {
      const cfg = tables[table]
      if (!cfg) throw new Error(`Unexpected table in test: ${table}`)
      return makeChain(cfg)
    },
  } as never
}

describe('getMerchantBudget', () => {
  it('returns null when the merchant has no budget row', async () => {
    const supabase = fakeClient({ merchant_budgets: { data: null, error: null } })
    await expect(getMerchantBudget(supabase, 'merchant-1')).resolves.toBeNull()
  })

  it('maps the budget row and its ledger', async () => {
    const supabase = fakeClient({
      merchant_budgets: { data: { id: 'b1', balance: 250, currency: 'HKD', enforced: true }, error: null },
      merchant_budget_transactions: {
        data: [{ id: 't1', kind: 'topup', amount: 250, balance_after: 250, reason: 'Pilot funding', created_at: '2026-08-20T00:00:00Z' }],
        error: null,
      },
    })
    const result = await getMerchantBudget(supabase, 'merchant-1')
    expect(result).toEqual({
      balance: 250, currency: 'HKD', enforced: true,
      ledger: [{ id: 't1', kind: 'topup', amount: 250, balanceAfter: 250, reason: 'Pilot funding', createdAt: '2026-08-20T00:00:00Z' }],
    })
  })

  it('propagates a query error', async () => {
    const supabase = fakeClient({ merchant_budgets: { data: null, error: { message: 'boom' } } })
    await expect(getMerchantBudget(supabase, 'merchant-1')).rejects.toEqual({ message: 'boom' })
  })
})
```

Run: `cd apps/web && npx vitest run tests/merchants.budget-queries.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Implement `apps/web/lib/merchants/budget-queries.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface BudgetLedgerRow {
  id: string
  kind: string
  amount: number
  balanceAfter: number
  reason: string | null
  createdAt: string
}

export interface MerchantBudget {
  balance: number
  currency: string
  enforced: boolean
  ledger: BudgetLedgerRow[]
}

/**
 * The merchant's own budget + recent ledger, read through owner-scoped RLS (the session's
 * merchant sees only their row; ops sees all). Returns null when no budget row exists —
 * merchants are funded lazily by ops, so "no row" is a normal state, not an error.
 */
export async function getMerchantBudget(supabase: Client, merchantProfileId: string): Promise<MerchantBudget | null> {
  const { data: budget, error } = await supabase
    .from('merchant_budgets')
    .select('id, balance, currency, enforced')
    .eq('merchant_profile_id', merchantProfileId)
    .maybeSingle()
  if (error) throw error
  if (!budget) return null

  const { data: ledger, error: ledgerError } = await supabase
    .from('merchant_budget_transactions')
    .select('id, kind, amount, balance_after, reason, created_at')
    .eq('merchant_budget_id', budget.id)
    .order('created_at', { ascending: false })
    .limit(20)
  if (ledgerError) throw ledgerError

  return {
    balance: budget.balance,
    currency: budget.currency,
    enforced: budget.enforced,
    ledger: (ledger ?? []).map((t) => ({
      id: t.id, kind: t.kind, amount: t.amount, balanceAfter: t.balance_after,
      reason: t.reason, createdAt: t.created_at,
    })),
  }
}
```

Run the test again — expect PASS.

- [ ] **Step 4: Create `MerchantBudgetView.tsx`**

Read an existing merchant page view (e.g. `MerchantDashboardHomeView.tsx`) first for card/typography conventions, then:

```typescript
import type { Messages } from '@/lib/i18n/messages/en'
import type { MerchantBudget } from '@/lib/merchants/budget-queries'
import { TicketCard } from '@/components/kinnso/MarketPassport'

type T = Messages['merchantDashboard']

const KIND_LABEL = (t: T): Record<string, string> => ({
  topup: t.kindTopup, debit: t.kindDebit, adjust: t.kindAdjust,
})

export function MerchantBudgetView({ t, budget }: { t: T; budget: MerchantBudget | null }) {
  return (
    <main>
      <h1 className="k-display">{t.budgetTitle}</h1>
      <p className="mt-2 text-kinnso-muted">{t.budgetSubtitle}</p>

      {budget === null ? (
        <TicketCard className="mt-8 p-5">
          <p className="py-6 text-sm text-kinnso-muted">{t.budgetNoBudget}</p>
        </TicketCard>
      ) : (
        <>
          <TicketCard className="mt-8 p-5">
            <p className="text-sm text-kinnso-muted">{t.budgetBalance}</p>
            <p className="text-3xl font-black text-kinnso-ink">{budget.currency} {budget.balance}</p>
            <p className="mt-2 text-xs font-bold text-kinnso-muted">
              {budget.enforced ? t.budgetEnforcedOn : t.budgetEnforcedOff}
            </p>
          </TicketCard>

          <TicketCard className="mt-8 p-5">
            <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.budgetLedgerTitle}</p>
            {budget.ledger.length === 0 ? (
              <p className="py-6 text-sm text-kinnso-muted">{t.budgetLedgerEmpty}</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {budget.ledger.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3">
                    <span className="shrink-0 font-bold text-kinnso-ink">{KIND_LABEL(t)[row.kind] ?? row.kind}</span>
                    <span className="min-w-0 flex-1 truncate text-kinnso-muted">{row.reason ?? '—'}</span>
                    <span className={`shrink-0 font-bold ${row.amount < 0 ? 'text-orange-700' : 'text-emerald-700'}`}>
                      {row.amount > 0 ? '+' : ''}{row.amount}
                    </span>
                    <span className="shrink-0 text-kinnso-muted">{budget.currency} {row.balanceAfter}</span>
                  </li>
                ))}
              </ul>
            )}
          </TicketCard>
        </>
      )}
    </main>
  )
}

export default MerchantBudgetView
```

- [ ] **Step 5: Create the page**

```typescript
// apps/web/app/[locale]/merchants/dashboard/budget/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantPage } from '@/lib/admin/guard'
import { noindexMetadata } from '@/lib/seo/metadata'
import { getMerchantBudget } from '@/lib/merchants/budget-queries'
import { MerchantBudgetView } from '@/components/kinnso/pages/MerchantBudgetView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantBudgetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { merchantId } = await requireMerchantPage(supabase, loc)
  const messages = await getDictionary(loc)
  const budget = await getMerchantBudget(supabase, merchantId)
  return <MerchantBudgetView t={messages.merchantDashboard} budget={budget} />
}
```

- [ ] **Step 6: Add the budget card to `MerchantDashboardHomeView.tsx`**

Read the file; add one card following its existing card pattern exactly, using `t.cardBudgetTitle`/`t.cardBudgetBody`, linking to `/${locale}/merchants/dashboard/budget`.

- [ ] **Step 7: Write the failing host test**

Model `apps/web/tests/merchant.budget.host.test.tsx` on an existing merchant host test (find one: `grep -l "requireMerchantPage\|merchants/dashboard" apps/web/tests/*.host.test.tsx` and read its mock setup — merchant pages resolve role `'merchant'` with a `merchantId`):

```typescript
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MerchantBudget } from '@/lib/merchants/budget-queries'

const { roleMock, getUserMock, budgetMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'merchant'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  budgetMock: vi.fn(async (): Promise<MerchantBudget | null> => ({
    balance: 250, currency: 'HKD', enforced: true,
    ledger: [{ id: 't1', kind: 'topup', amount: 250, balanceAfter: 250, reason: 'Pilot funding', createdAt: '2026-08-20T00:00:00Z' }],
  })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: async () => {
    const { data: { user } } = await getUserMock()
    return { user: user ? { id: user.id } : null, role: await roleMock(), merchantId: 'merchant-1' }
  },
}))
vi.mock('@/lib/merchants/budget-queries', () => ({ getMerchantBudget: budgetMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import MerchantBudgetPage from '@/app/[locale]/merchants/dashboard/budget/page'

beforeEach(() => { roleMock.mockResolvedValue('merchant'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }); budgetMock.mockClear() })
afterEach(cleanup)

describe('/[locale]/merchants/dashboard/budget host', () => {
  it('renders the balance and ledger for the merchant', async () => {
    const ui = await MerchantBudgetPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(budgetMock).toHaveBeenCalledWith(expect.anything(), 'merchant-1')
    expect(screen.getByText('HKD 250')).toBeTruthy()
    expect(screen.getByText('Pilot funding')).toBeTruthy()
  })

  it('shows the no-budget state', async () => {
    budgetMock.mockResolvedValueOnce(null)
    const ui = await MerchantBudgetPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('No budget set up yet — contact KINNSO ops to fund missions.')).toBeTruthy()
  })

  it('notFounds a non-merchant', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(MerchantBudgetPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
```

(If the real `getAuthorizationContext` mock shape differs from other merchant host tests, match THEIRS — read one first.)

- [ ] **Step 8: Run and verify**

Run: `cd apps/web && npx vitest run tests/merchants.budget-queries.test.ts tests/merchant.budget.host.test.tsx`
Expected: PASS. Also `npx tsc --noEmit` — clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/merchants/budget-queries.ts apps/web/components/kinnso/pages/MerchantBudgetView.tsx "apps/web/app/[locale]/merchants/dashboard/budget/page.tsx" apps/web/components/kinnso/pages/MerchantDashboardHomeView.tsx apps/web/lib/i18n/messages/en.ts apps/web/tests/merchants.budget-queries.test.ts apps/web/tests/merchant.budget.host.test.tsx
git commit -m "feat(web): read-only merchant budget page with balance and ledger"
```

---

### Task 6: Ops budget panel on the merchant detail page

**Files:**
- Create: `apps/web/lib/admin/budget-actions.ts`
- Create: `apps/web/components/kinnso/admin/merchants/MerchantBudgetPanel.tsx`
- Modify: `apps/web/lib/admin/merchants-queries.ts` (add `getMerchantBudgetOps` — ops reads any merchant's budget via the same tables, RLS ops branch)
- Modify: `apps/web/components/kinnso/admin/merchants/MerchantDetailView.tsx` + `apps/web/app/[locale]/admin/merchants/[merchantId]/page.tsx`
- Modify: `apps/web/lib/i18n/messages/en.ts` (`merchantsOps` namespace)
- Test: `apps/web/tests/admin.budget-actions.test.ts`, `apps/web/tests/kinnso.MerchantBudgetPanel.test.tsx`

- [ ] **Step 1: i18n keys (en.ts, `merchantsOps` namespace — read the file for the interface name and append)**

```typescript
  budgetPanelTitle: string
  budgetBalance: string
  budgetEnforced: string
  budgetNotEnforced: string
  budgetNoRow: string
  budgetCreditLabel: string
  budgetCreditAmountPlaceholder: string
  budgetReasonPlaceholder: string
  budgetCreditSubmit: string
  budgetEnforceOn: string
  budgetEnforceOff: string
  budgetSaved: string
```

```typescript
    budgetPanelTitle: 'Budget',
    budgetBalance: 'Balance',
    budgetEnforced: 'Enforced',
    budgetNotEnforced: 'Not enforced',
    budgetNoRow: 'No budget yet — the first credit creates it.',
    budgetCreditLabel: 'Credit budget',
    budgetCreditAmountPlaceholder: 'Amount (negative to adjust down)',
    budgetReasonPlaceholder: 'Reason…',
    budgetCreditSubmit: 'Apply credit',
    budgetEnforceOn: 'Turn enforcement on',
    budgetEnforceOff: 'Turn enforcement off',
    budgetSaved: 'Saved.',
```

- [ ] **Step 2: Write the failing action tests**

Model `apps/web/tests/admin.budget-actions.test.ts` on `apps/web/tests/admin.mission-review-actions.test.ts`'s mock setup (read it first for the exact `rpcMock`/`requireOpsAction` mocking):

```typescript
describe('creditMerchantBudget', () => {
  it('calls admin_credit_merchant_budget and revalidates the merchant detail page', async () => {
    const result = await creditMerchantBudget('en', 'merchant-1', 250, 'Pilot funding')
    expect(result.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('admin_credit_merchant_budget', {
      p_merchant_profile_id: 'merchant-1', p_amount: 250, p_reason: 'Pilot funding',
    })
  })
  it('rejects a zero amount before calling the RPC', async () => {
    const result = await creditMerchantBudget('en', 'merchant-1', 0, 'reason')
    expect(result.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('maps insufficient_budget to friendly copy', async () => {
    rpcMock.mockResolvedValueOnce({ error: { message: 'insufficient_budget' } })
    const result = await creditMerchantBudget('en', 'merchant-1', -500, 'clawback')
    expect(result.ok).toBe(false)
  })
})

describe('setBudgetEnforcement', () => {
  it('calls admin_set_budget_enforcement', async () => {
    const result = await setBudgetEnforcement('en', 'merchant-1', true, 'Pilot go-live')
    expect(result.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('admin_set_budget_enforcement', {
      p_merchant_profile_id: 'merchant-1', p_enforced: true, p_reason: 'Pilot go-live',
    })
  })
  it('maps not_found (no budget row yet) to friendly copy', async () => {
    rpcMock.mockResolvedValueOnce({ error: { message: 'not_found' } })
    const result = await setBudgetEnforcement('en', 'merchant-1', true, 'reason')
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 3: Implement `apps/web/lib/admin/budget-actions.ts`**

Follow `apps/web/lib/admin/merchants-actions.ts`'s exact pattern (`requireOpsAction`, `validateReason`, FRIENDLY/mapError, `revalidatePath`):

```typescript
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateReason } from '@/lib/admin/ops-validation'
import type { Locale } from '@/lib/i18n/config'

const detailPath = (locale: Locale, merchantId: string) => `/${locale}/admin/merchants/${merchantId}`

const FRIENDLY: Record<string, string> = {
  forbidden: 'Admin ops access is required.',
  reason_required: 'A reason is required.',
  reason_too_long: 'The reason is too long (max 500 characters).',
  bad_amount: 'The amount must be a non-zero number.',
  bad_enforced: 'Invalid enforcement value.',
  insufficient_budget: 'That adjustment would take the balance below zero.',
  not_found: 'No budget exists for this merchant yet — credit it first.',
}
const mapError = (message: string, fallback: string): string => {
  const key = Object.keys(FRIENDLY).find((k) => message.includes(k))
  return key ? FRIENDLY[key] : fallback
}

export async function creditMerchantBudget(
  locale: Locale, merchantId: string, amount: number, reason: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!Number.isFinite(amount) || amount === 0) return formError(FRIENDLY.bad_amount)
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])
  const { error } = await supabase.rpc('admin_credit_merchant_budget', {
    p_merchant_profile_id: merchantId, p_amount: amount, p_reason: reason.trim(),
  })
  if (error) {
    console.error('[admin:merchants] creditMerchantBudget failed', error)
    return formError(mapError(error.message, 'Budget could not be credited'))
  }
  revalidatePath(detailPath(locale, merchantId))
  return { ok: true, id: merchantId }
}

export async function setBudgetEnforcement(
  locale: Locale, merchantId: string, enforced: boolean, reason: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])
  const { error } = await supabase.rpc('admin_set_budget_enforcement', {
    p_merchant_profile_id: merchantId, p_enforced: enforced, p_reason: reason.trim(),
  })
  if (error) {
    console.error('[admin:merchants] setBudgetEnforcement failed', error)
    return formError(mapError(error.message, 'Enforcement could not be changed'))
  }
  revalidatePath(detailPath(locale, merchantId))
  return { ok: true, id: merchantId }
}
```

Run action tests — expect PASS.

- [ ] **Step 4: Ops budget read**

Append to `apps/web/lib/admin/merchants-queries.ts` (read it first for its Client type/style):

```typescript
export interface OpsMerchantBudget {
  balance: number
  currency: string
  enforced: boolean
}

/** Ops read of any merchant's budget (RLS ops branch). Null when no row exists yet. */
export async function getMerchantBudgetOps(supabase: Client, merchantProfileId: string): Promise<OpsMerchantBudget | null> {
  const { data, error } = await supabase
    .from('merchant_budgets')
    .select('balance, currency, enforced')
    .eq('merchant_profile_id', merchantProfileId)
    .maybeSingle()
  if (error) throw error
  return data ? { balance: data.balance, currency: data.currency, enforced: data.enforced } : null
}
```

- [ ] **Step 5: Create `MerchantBudgetPanel.tsx`** (client component, modeled on the reason-collecting action panels already in `MerchantDetailView` — read that file first)

```typescript
'use client'
import { useState, useTransition } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { ActionResult } from '@/lib/admin/result'
import type { OpsMerchantBudget } from '@/lib/admin/merchants-queries'

type T = Messages['merchantsOps']
type CreditFn = (locale: Locale, merchantId: string, amount: number, reason: string) => Promise<ActionResult<{ id: string }>>
type EnforceFn = (locale: Locale, merchantId: string, enforced: boolean, reason: string) => Promise<ActionResult<{ id: string }>>

export function MerchantBudgetPanel({
  t, locale, merchantId, budget, credit, enforce,
}: {
  t: T
  locale: Locale
  merchantId: string
  budget: OpsMerchantBudget | null
  credit: CreditFn
  enforce: EnforceFn
}) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const run = (fn: () => Promise<ActionResult<{ id: string }>>) => {
    setStatus('idle')
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.ok) { setStatus('saved'); setAmount(''); setReason('') }
      else { setStatus('error'); setError(res.errors.form?.[0] ?? null) }
    })
  }

  return (
    <section className="mt-6 rounded-xl border border-kinnso-line p-4">
      <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.budgetPanelTitle}</p>
      {budget ? (
        <p className="mb-3 text-sm text-kinnso-muted">
          {t.budgetBalance}: <span className="font-bold text-kinnso-ink">{budget.currency} {budget.balance}</span>
          {' · '}{budget.enforced ? t.budgetEnforced : t.budgetNotEnforced}
        </p>
      ) : (
        <p className="mb-3 text-sm text-kinnso-muted">{t.budgetNoRow}</p>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-kinnso-ink" htmlFor="budget-credit-amount">{t.budgetCreditLabel}</label>
        <input
          id="budget-credit-amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t.budgetCreditAmountPlaceholder}
          className="rounded-md border border-kinnso-line p-2 text-sm"
        />
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t.budgetReasonPlaceholder}
          rows={2}
          className="rounded-md border border-kinnso-line p-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending || !amount || !reason.trim()}
            onClick={() => run(() => credit(locale, merchantId, Number(amount), reason))}
            className="rounded-md bg-kinnso-orange px-3 py-1 text-sm font-bold text-white disabled:opacity-50"
          >
            {t.budgetCreditSubmit}
          </button>
          <button
            type="button"
            disabled={isPending || !budget || !reason.trim()}
            onClick={() => run(() => enforce(locale, merchantId, !(budget?.enforced ?? false), reason))}
            className="rounded-md border border-kinnso-line px-3 py-1 text-sm font-bold text-kinnso-ink disabled:opacity-50"
          >
            {budget?.enforced ? t.budgetEnforceOff : t.budgetEnforceOn}
          </button>
        </div>
        {status === 'saved' && <p role="status" className="text-xs text-emerald-700">{t.budgetSaved}</p>}
        {status === 'error' && error && <p role="status" className="text-xs text-red-600">{error}</p>}
      </div>
    </section>
  )
}

export default MerchantBudgetPanel
```

- [ ] **Step 6: Wire into `MerchantDetailView` + page**

Read `MerchantDetailView.tsx` first. Add props `budget: OpsMerchantBudget | null` and `budgetActions: { credit: CreditFn; enforce: EnforceFn }` (reuse the panel's own types via import), render `<MerchantBudgetPanel ... />` in the detail layout. In the page (`apps/web/app/[locale]/admin/merchants/[merchantId]/page.tsx`), fetch `getMerchantBudgetOps(supabase, merchantId)` and pass `creditMerchantBudget`/`setBudgetEnforcement`. Fix any pre-existing tests that render `MerchantDetailView` (grep `apps/web/tests` for it) by adding the new required props with `budget={null}` and `vi.fn()` actions.

- [ ] **Step 7: Component test**

```typescript
// apps/web/tests/kinnso.MerchantBudgetPanel.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { MerchantBudgetPanel } from '@/components/kinnso/admin/merchants/MerchantBudgetPanel'

afterEach(cleanup)
const t = en.merchantsOps

describe('MerchantBudgetPanel', () => {
  it('shows balance and enforcement state', () => {
    render(<MerchantBudgetPanel t={t} locale="en" merchantId="m1" budget={{ balance: 100, currency: 'HKD', enforced: true }} credit={vi.fn()} enforce={vi.fn()} />)
    expect(screen.getByText(/HKD 100/)).toBeTruthy()
    expect(screen.getByText(new RegExp(t.budgetEnforced))).toBeTruthy()
  })

  it('submits a credit with amount and reason', async () => {
    const credit = vi.fn().mockResolvedValue({ ok: true, id: 'm1' })
    render(<MerchantBudgetPanel t={t} locale="en" merchantId="m1" budget={null} credit={credit} enforce={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(t.budgetCreditLabel), { target: { value: '250' } })
    fireEvent.change(screen.getByPlaceholderText(t.budgetReasonPlaceholder), { target: { value: 'Pilot funding' } })
    fireEvent.click(screen.getByRole('button', { name: t.budgetCreditSubmit }))
    await waitFor(() => expect(credit).toHaveBeenCalledWith('en', 'm1', 250, 'Pilot funding'))
  })

  it('disables the enforcement toggle when no budget row exists', () => {
    render(<MerchantBudgetPanel t={t} locale="en" merchantId="m1" budget={null} credit={vi.fn()} enforce={vi.fn()} />)
    expect(screen.getByRole('button', { name: t.budgetEnforceOn })).toHaveProperty('disabled', true)
  })

  it('surfaces a server error and keeps the form usable', async () => {
    const credit = vi.fn().mockResolvedValue({ ok: false, errors: { form: ['That adjustment would take the balance below zero.'] } })
    render(<MerchantBudgetPanel t={t} locale="en" merchantId="m1" budget={{ balance: 10, currency: 'HKD', enforced: false }} credit={credit} enforce={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(t.budgetCreditLabel), { target: { value: '-500' } })
    fireEvent.change(screen.getByPlaceholderText(t.budgetReasonPlaceholder), { target: { value: 'clawback' } })
    fireEvent.click(screen.getByRole('button', { name: t.budgetCreditSubmit }))
    expect(await screen.findByText('That adjustment would take the balance below zero.')).toBeTruthy()
  })
})
```

- [ ] **Step 8: Run everything affected**

Run: `cd apps/web && npx vitest run tests/admin.budget-actions.test.ts tests/kinnso.MerchantBudgetPanel.test.tsx` plus every pre-existing `MerchantDetailView` test file found in Step 6, plus `npx tsc --noEmit`.
Expected: all PASS, tsc clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/admin/budget-actions.ts apps/web/lib/admin/merchants-queries.ts apps/web/components/kinnso/admin/merchants/MerchantBudgetPanel.tsx apps/web/components/kinnso/admin/merchants/MerchantDetailView.tsx "apps/web/app/[locale]/admin/merchants/[merchantId]/page.tsx" apps/web/lib/i18n/messages/en.ts apps/web/tests/admin.budget-actions.test.ts apps/web/tests/kinnso.MerchantBudgetPanel.test.tsx
git commit -m "feat(web): ops budget panel — credit and enforcement on the merchant detail page"
```

(Include any pre-existing test files fixed in Step 6 in the `git add`.)

---

### Task 7: "Funded" badge in `/studio/missions`

**Files:**
- Modify: `apps/web/lib/missions/queries.ts` (`creatorMissionSelect` gains `merchant_profile_id`)
- Modify: `apps/web/app/[locale]/studio/missions/page.tsx`
- Modify: `apps/web/components/kinnso/pages/CreatorMissionsView.tsx`
- Modify: `apps/web/lib/i18n/messages/en.ts` (`missions` namespace: `fundedBadge: 'Funded'`)
- Test: extend the existing CreatorMissionsView test (find it: `grep -rl "CreatorMissionsView" apps/web/tests`)

- [ ] **Step 1: Widen the select**

In `apps/web/lib/missions/queries.ts`, `creatorMissionSelect` (starts `id,title,summary,mission_source,...`): add `merchant_profile_id` to the first line's column list. (The `missions` table is publicly readable; no RLS concern.)

- [ ] **Step 2: Thread `funded` through the page**

In `apps/web/app/[locale]/studio/missions/page.tsx`:
- Add `merchant_profile_id: string | null` to the `CreatorMissionRow` type.
- In the page body, after `listCreatorMerchantMissions`, fetch the funded set once:

```typescript
  const { data: fundedIds } = await supabase.rpc('funded_merchant_profiles')
  const funded = new Set<string>((fundedIds as string[] | null) ?? [])
```

- Change `mapCreatorMission(row, user.id, creatorTier)` to also receive `funded` and set a new card field:

```typescript
    funded:
      (row.mission_type === 'paid' || row.mission_type === 'hybrid') &&
      row.merchant_profile_id !== null &&
      funded.has(row.merchant_profile_id),
```

- [ ] **Step 3: Render the badge**

In `CreatorMissionsView.tsx`: add `funded: boolean` to the `CreatorMissionCard` type, and next to each `<MissionStatusBadge ...>` usage render:

```tsx
{mission.funded && (
  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
    {t.fundedBadge}
  </span>
)}
```

Add `fundedBadge: string` to the `missions` namespace interface and `fundedBadge: 'Funded',` to the en.ts object.

- [ ] **Step 4: Test**

Extend the existing CreatorMissionsView test (or the studio missions host test, whichever exists — read it first): one fixture mission with `funded: true` asserts `screen.getByText('Funded')`; one with `funded: false` asserts `queryByText('Funded')` is null within that card. Fix any pre-existing fixtures now missing the required `funded` field.

- [ ] **Step 5: Run, typecheck, commit**

Run: the touched test files + `npx tsc --noEmit`. Expected: PASS/clean.

```bash
git add apps/web/lib/missions/queries.ts "apps/web/app/[locale]/studio/missions/page.tsx" apps/web/components/kinnso/pages/CreatorMissionsView.tsx apps/web/lib/i18n/messages/en.ts <touched test files>
git commit -m "feat(web): show a Funded badge on budget-backed paid missions"
```

---

### Task 8: Friendly `insufficient_budget` errors on both review paths

**Files:**
- Modify: `apps/web/lib/missions/actions.ts` (`reviewSubmissionAction` — the update error is currently swallowed into a generic 'Submission review could not be saved' at its `if (updateError || !updatedSubmission)` branch)
- Modify: `apps/web/lib/admin/mission-review-actions.ts` (`FRIENDLY` map)
- Test: extend `apps/web/tests/admin.mission-review-actions.test.ts` and the existing merchant review-action test (find it: `grep -rl "reviewSubmissionAction" apps/web/tests`)

- [ ] **Step 1: Merchant path**

In `apps/web/lib/missions/actions.ts`, find `reviewSubmissionAction`'s update-error branch:

```typescript
  if (updateError || !updatedSubmission) {
    return formError('Submission review could not be saved')
  }
```

Replace with:

```typescript
  if (updateError || !updatedSubmission) {
    // The budget-gate trigger (R11.2) aborts the whole approval when the merchant's
    // enforced budget can't cover the fee -- surface that specifically instead of the
    // generic save failure.
    if (updateError?.message.includes('insufficient_budget')) {
      return formError('This approval needs more budget — top up before approving.')
    }
    if (updateError?.message.includes('currency_mismatch')) {
      return formError('Budget currency does not match this mission — contact KINNSO ops.')
    }
    return formError('Submission review could not be saved')
  }
```

- [ ] **Step 2: Ops path**

In `apps/web/lib/admin/mission-review-actions.ts`, add to `FRIENDLY`:

```typescript
  insufficient_budget: 'The merchant budget cannot cover this fee — fund it before approving.',
  currency_mismatch: 'Budget currency does not match this mission.',
```

- [ ] **Step 3: Tests**

Add to `apps/web/tests/admin.mission-review-actions.test.ts` (existing mock pattern):

```typescript
  it('maps insufficient_budget to friendly copy', async () => {
    rpcMock.mockResolvedValueOnce({ error: { message: 'insufficient_budget' } })
    const result = await reviewSubmissionOpsAction('en', 's1', 'approve', null, null, null)
    expect(result).toEqual({ ok: false, errors: { form: ['The merchant budget cannot cover this fee — fund it before approving.'] } })
  })
```

For the merchant path, extend the existing `reviewSubmissionAction` test file (read its Supabase mock first — it stubs `.update()` chains): one test resolving the update with `error: { message: '... insufficient_budget ...' }` asserting the budget-specific copy is returned.

- [ ] **Step 4: Run, typecheck, commit**

```bash
git add apps/web/lib/missions/actions.ts apps/web/lib/admin/mission-review-actions.ts apps/web/tests/admin.mission-review-actions.test.ts <merchant review test file>
git commit -m "feat(web): surface budget-gate failures as actionable review errors"
```

---

### Task 9: i18n parity — the other 6 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts`

All keys added in Tasks 5–7: 13 `merchantDashboard` keys, 12 `merchantsOps` keys, 1 `missions` key (`fundedBadge`). Read `en.ts` for the authoritative list (diff `git log -p -- apps/web/lib/i18n/messages/en.ts` since this plan's first commit if unsure). Translate faithfully — do NOT let a locale promise anything en.ts doesn't (i18n-translation-fidelity gotcha). Suggested translations for the trickiest key, `budgetNoBudget` (others follow the same register as each file's existing merchant strings):

- zh-hk: `尚未設立預算 — 請聯絡 KINNSO 營運團隊為任務注資。`
- zh-tw: `尚未設立預算 — 請聯絡 KINNSO 營運團隊為任務挹注資金。`
- zh-cn: `尚未设立预算 — 请联系 KINNSO 运营团队为任务注资。`
- ja: `予算はまだ設定されていません — ミッションへの資金提供は KINNSO 運営にお問い合わせください。`
- ko: `아직 예산이 설정되지 않았습니다 — 미션 자금은 KINNSO 운영팀에 문의하세요.`
- th: `ยังไม่มีการตั้งงบประมาณ — โปรดติดต่อทีมปฏิบัติการ KINNSO เพื่อสนับสนุนงบประมาณภารกิจ`

`fundedBadge`: zh-hk/zh-tw `已注資` · zh-cn `已注资` · ja `資金確保済み` · ko `자금 확보됨` · th `มีงบประมาณรองรับ`

- [ ] **Step 1:** Run `cd apps/web && npx vitest run tests/i18n.locale-parity.test.ts` — expect FAIL listing the missing keys per locale.
- [ ] **Step 2:** Add all keys to each of the 6 files, in the same order as en.ts.
- [ ] **Step 3:** Re-run the parity test — PASS — and `npx tsc --noEmit` — fully clean (this task closes the known pending-locale window).
- [ ] **Step 4:** Commit:

```bash
git add apps/web/lib/i18n/messages/zh-hk.ts apps/web/lib/i18n/messages/zh-tw.ts apps/web/lib/i18n/messages/zh-cn.ts apps/web/lib/i18n/messages/ja.ts apps/web/lib/i18n/messages/ko.ts apps/web/lib/i18n/messages/th.ts
git commit -m "i18n(r11.2): add budget-backing copy across all seven locales"
```

---

### Task 10: Live proof

**Files:**
- Create: `apps/web/tests/merchant-budgets.rls.test.ts`

Requires the local Supabase stack (`supabase start`, +100-shifted ports per `supabase/config.toml`; `supabase db reset` if the R11.2 migrations postdate the stack's snapshot). **Never point anything at production.** Model the harness (env-gated `describe.skip`, `runPsql`, `clientFor` hand-signed JWTs, `svc()`) on `apps/web/tests/mission-review.rls.test.ts` — read it first.

**Seed-id rule:** the simple fixed-digit UUID blocks are exhausted across sibling files — use `randomUUID()` for all seed ids (the payout-batches precedent), with `runId`-suffixed display names for greppability. Cleanup: `afterAll` deletes the seeded `auth.users` rows (cascade covers merchant_profiles → merchant_budgets → transactions and missions fixtures); ops users are seeded with the upsert-ignore pattern and never deleted (ops_audit_log immutability).

- [ ] **Step 1: Write the tests.** Fixtures: one merchant (+profile), one creator, one ops admin (upsert-ignore), one paid mission (`mission_type='paid'`, `paid_fee_amount=150`, `paid_fee_currency='HKD'`, published), one participant, `freshMilestone()` helper (unique constraint gotcha). Tests:

1. **Roadmap acceptance:** ops credits HK$100 (`admin_credit_merchant_budget`), turns enforcement on; approving a submitted HK$150-fee submission via `admin_review_submission` FAILS with `insufficient_budget`; afterwards the submission is still `submitted`, there is NO `mission_settlements` row for the participant, the balance is still 100, and no `debit` ledger row exists.
2. **Funded approval debits exactly once:** credit another HK$100 (balance 200); approve → submission `approved`, one settlement, balance 50, exactly one `debit` ledger row with `balance_after = 50` and `source_ref = 'settlement:' || settlement.id`.
3. **Revision-flap never double-debits:** on a fresh milestone/submission for the SAME participant, approve → (settlement dedupe: no new settlement, no new debit; balance unchanged). (This leans on `mission_settlements_participant_fee_uniq` — assert the debit-ledger count for the budget is still 1.)
4. **Unenforced behaves as today:** turn enforcement off (`admin_set_budget_enforcement(false)`); a NEW merchant+mission+participant with NO budget row approves a fee submission fine with zero budget tables involvement; and the first merchant (row exists, enforcement now off) also approves without a debit.
5. **Ledger floor:** `admin_credit_merchant_budget` with an over-large negative amount raises `insufficient_budget`; balance unchanged.
6. **RLS:** the owning merchant reads their budget + ledger; an unrelated merchant reads neither (empty, no error); both write RPCs reject a non-admin caller (`forbidden|42501`).
7. **funded_merchant_profiles:** returns the enforced merchant's id while enforcement is on; not after it's turned off. (Callable by the creator's session.)
8. **Unfunded auto-approval leaves the submission in the queue:** on a mission with `auto_approve_policy = 'verified_signal_only'` and an enforced budget too small for the fee, seed a `queued` verification job for a fresh submitted submission, then (service-role) update it to `status='ready', confidence_status='verified_signal'`. The R11.1 auto-approve trigger fires, hits the budget gate, and its own exception handler downgrades the abort to a warning — assert the job update itself SUCCEEDED (the verification row is `ready`), the submission is still `submitted`, no settlement exists, and the balance is untouched. This is the R11.1×R11.2 interaction the design doc promises.

Write each test with the exact insert/RPC/assert code following `mission-review.rls.test.ts`'s style — service-role for seeding, `clientFor(<user>)` for the role under test, `expect(error).toBeNull()` discipline, `testTimeout` on each.

- [ ] **Step 2:** `supabase start` (if down) + `supabase db reset` (local only) to apply the three new migrations.
- [ ] **Step 3:** Run: `cd apps/web && npx vitest run tests/merchant-budgets.rls.test.ts` — iterate to green.
- [ ] **Step 4:** Full gate BEFORE stopping the stack (kinnso-full-gate gotcha): `cd apps/web && npx vitest run` — everything green except the documented pre-existing failures (`settlement-minting.rls.test.ts` cascade issue, jsdom-localStorage files).
- [ ] **Step 5:** `supabase stop`.
- [ ] **Step 6:** Commit:

```bash
git add apps/web/tests/merchant-budgets.rls.test.ts
git commit -m "test(r11.2): live-prove the budget gate, ledger idempotency, and RLS on a real stack"
```

---

## Final gate

- [ ] `cd apps/web && npx tsc --noEmit` — fully clean (all locales done)
- [ ] `pnpm lint` — clean on every file this phase touched
- [ ] No shipped migration edited; no production DB command ran; no `pnpm --filter @kinnso/db gen`

Then hand off to **superpowers:finishing-a-development-branch**.
