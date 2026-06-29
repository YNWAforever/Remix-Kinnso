# Phase 10D — Creators Operator Console: Payouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the **Payouts** tab of the Creators console (`/admin/creators/payouts`) — a settlement queue across all creators with a money-flow summary and confirm-gated, audited status writes — backed by a new `admin_set_settlement_status()` SECURITY DEFINER RPC.

**Architecture:** Mirrors the Phase 10A–10C admin recipe exactly. The single platform mutation entry point is the audited RPC `admin_set_settlement_status()` (SECURITY DEFINER, `is_active_ops()`-gated, appends an `ops_audit_log` row with `entity_type='settlement'` in the same transaction). Reads reuse `lib/missions`' `listOpsSettlements`/`opsSettlementSelect`; the new `getSettlementsQueue` query maps rows + computes a per-currency money-flow summary. A server action `setSettlementStatus` validates input, calls the RPC, maps DB raise-messages to localized copy, and revalidates. The `CreatorPayoutsView` client component renders summary cards, a status filter, the queue table, and per-row confirm-gated actions.

**Tech Stack:** Next.js 16 (App Router, RSC) · React 19 · TypeScript · Supabase (Postgres + RLS + SECURITY DEFINER RPCs) · Tailwind v4 · Vitest 4 · custom i18n (7 locales).

**Spec:** `docs/superpowers/specs/2026-06-28-phase10-creators-operator-console-design.md` (§3.3, §5 "10D", §6, §7 settlement-transition-matrix open item).

**Branch:** `feat/creators-console-10d` (already created off `feat/creators-console-10c`). Stacks as PR #55 on top of #54.

---

## Design decision — Settlement transition matrix (resolves spec §7 open item)

`mission_settlements` (from `20260617173932_mission_tables.sql` + `20260628120000_settlement_status_amount_checks.sql`):

- **Overall** `status` (NOT NULL, default `not_started`): one of `not_started | pending | partially_paid | paid | disputed`.
- **Per-leg** (nullable, CHECK ∈ {`pending`,`paid`}): `creator_payout_status`, `kinnso_commission_status`, `affiliate_commission_status`.
- `merchant_invoice_status` / `merchant_payment_status` are unconstrained and **out of scope** for 10D (not modelled in the app layer).
- Stamps: `ops_note`, `updated_by_ops_member_id`, `updated_at`.

**Completeness rank** for the overall status: `not_started=0 < pending=1 < partially_paid=2 < paid=3`. `disputed` is a side-state (rank-independent).

**Rules enforced inside `admin_set_settlement_status()`:**

| From → To (overall) | Allowed? |
|---|---|
| any → `disputed` | ✅ always (flagging a problem) |
| `disputed` → any concrete state | ✅ always (resolving a dispute) |
| higher rank (forward, e.g. `pending`→`paid`) | ✅ always |
| lower rank (backward, e.g. `paid`→`pending`) | ⚠️ only with `p_allow_revert = true`, else `bad_transition` |
| same value | no-op for that field (skipped) |

| Per-leg From → To | Allowed? |
|---|---|
| `pending` → `paid` | ✅ always |
| `paid` → `pending` | ⚠️ only with `p_allow_revert = true`, else `bad_transition` |
| same value | no-op for that field (skipped) |

Additional guards: caller must be active ops (`forbidden`); a non-blank `reason` ≤ 500 chars is **required** (money-touching, per §6) (`reason_required` / `reason_too_long`); the settlement must exist (`not_found`); **at least one** field must actually change, else `no_change`. The row is locked `for update` during the read-modify-write to avoid concurrent double-marking. Every successful call appends one `ops_audit_log` row (`entity_type='settlement'`, `action='settlement.status'`, `reason`, `metadata` = `{ <field>: {from,to}, ..., allow_revert }`).

The 10D UI exposes only **forward** actions ("Mark paid", "Mark disputed") behind a confirm step; reverts (`p_allow_revert`) are intentionally **not** surfaced in v1 UI (a guarded admin escape hatch reserved for a later phase). The existing `lib/missions/actions.ts` `updateSettlementAction` (direct table write used by `/ops/settlements`) is **left untouched** — 10D adds the audited path without changing the legacy one.

---

## File structure

**Create:**
- `supabase/migrations/20260629140000_admin_set_settlement_status.sql` — the audited RPC + grants.
- `apps/web/app/[locale]/admin/creators/payouts/page.tsx` — gate → parse `?status` → `getSettlementsQueue` → `CreatorPayoutsView`.
- `apps/web/components/kinnso/admin/creators/CreatorPayoutsView.tsx` — summary cards, status filter, queue table, confirm-gated row actions.
- `apps/web/tests/admin.creators-payouts.host.test.tsx` — page gate (anon/non-ops/ops).
- `apps/web/tests/kinnso.CreatorPayoutsView.test.tsx` — view rendering + action flow.

**Modify:**
- `packages/db/types.ts` — hand-patch `Functions.admin_set_settlement_status` (per project convention; not a full regen).
- `apps/web/lib/admin/creators-validation.ts` — settlement status/leg constants + type guards.
- `apps/web/lib/admin/creators-actions.ts` — `setSettlementStatus` server action + new FRIENDLY keys.
- `apps/web/lib/admin/creators-queries.ts` — `getSettlementsQueue` + `PayoutRow`/`PayoutsSummary`/`PayoutsQueue` types.
- `apps/web/components/kinnso/admin/creators/CreatorsTabs.tsx` — add the **Payouts** tab.
- `apps/web/lib/i18n/messages/en.ts` — `Messages['creators']` interface + English values (new keys).
- `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` — same new keys, translated.
- `apps/web/tests/admin.creators-actions.test.ts` — settlement action cases.
- `apps/web/tests/admin.creators-queries.test.ts` — queue grouping/summary cases.
- `apps/web/tests/admin.creators-validation.test.ts` — settlement guard cases (create if absent).

---

## Task 1: Migration — `admin_set_settlement_status()` RPC

**Files:**
- Create: `supabase/migrations/20260629140000_admin_set_settlement_status.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 10D — Creators Operator Console: Payouts.
-- Single audited write path for ops marking settlement progress. SECURITY DEFINER,
-- gated on is_active_ops(), reason required (money-touching), appends an ops_audit_log
-- row (entity_type='settlement') in the same transaction via the 10A helper. Enforces
-- the transition matrix in docs/superpowers/plans/2026-06-29-phase10d-payouts.md:
--   overall status completeness rank not_started<pending<partially_paid<paid; 'disputed'
--   is a side-state; forward + (to/from disputed) always allowed; backward needs
--   p_allow_revert. Legs (pending|paid): pending->paid always; paid->pending needs revert.
-- The legacy direct-write path (lib/missions updateSettlementAction / /ops/settlements)
-- is intentionally untouched; this adds the audited path.

create or replace function public.admin_set_settlement_status(
  p_id                          uuid,
  p_status                      text default null,
  p_creator_payout_status       text default null,
  p_kinnso_commission_status    text default null,
  p_affiliate_commission_status text default null,
  p_allow_revert                boolean default false,
  p_reason                      text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text; v_cp text; v_kc text; v_ac text;
  v_changed jsonb := '{}'::jsonb;
  v_rank_to int; v_rank_from int;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if p_status is null
     and p_creator_payout_status is null
     and p_kinnso_commission_status is null
     and p_affiliate_commission_status is null then
    raise exception 'no_change';
  end if;

  select status, creator_payout_status, kinnso_commission_status, affiliate_commission_status
    into v_status, v_cp, v_kc, v_ac
    from public.mission_settlements where id = p_id for update;
  if not found then raise exception 'not_found'; end if;

  -- Overall status.
  if p_status is not null and p_status is distinct from v_status then
    if p_status not in ('not_started','pending','partially_paid','paid','disputed') then
      raise exception 'bad_status';
    end if;
    v_rank_to   := case p_status when 'not_started' then 0 when 'pending' then 1 when 'partially_paid' then 2 when 'paid' then 3 else -1 end;
    v_rank_from := case v_status when 'not_started' then 0 when 'pending' then 1 when 'partially_paid' then 2 when 'paid' then 3 else -1 end;
    if p_status <> 'disputed' and v_status <> 'disputed'
       and v_rank_to < v_rank_from and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('status', jsonb_build_object('from', v_status, 'to', p_status));
  end if;

  -- Creator payout leg.
  if p_creator_payout_status is not null and p_creator_payout_status is distinct from v_cp then
    if p_creator_payout_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if;
    if v_cp = 'paid' and p_creator_payout_status = 'pending' and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('creator_payout_status', jsonb_build_object('from', v_cp, 'to', p_creator_payout_status));
  end if;

  -- Kinnso commission leg.
  if p_kinnso_commission_status is not null and p_kinnso_commission_status is distinct from v_kc then
    if p_kinnso_commission_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if;
    if v_kc = 'paid' and p_kinnso_commission_status = 'pending' and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('kinnso_commission_status', jsonb_build_object('from', v_kc, 'to', p_kinnso_commission_status));
  end if;

  -- Affiliate commission leg.
  if p_affiliate_commission_status is not null and p_affiliate_commission_status is distinct from v_ac then
    if p_affiliate_commission_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if;
    if v_ac = 'paid' and p_affiliate_commission_status = 'pending' and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('affiliate_commission_status', jsonb_build_object('from', v_ac, 'to', p_affiliate_commission_status));
  end if;

  if v_changed = '{}'::jsonb then raise exception 'no_change'; end if;

  update public.mission_settlements set
    status                      = coalesce(p_status, status),
    creator_payout_status       = coalesce(p_creator_payout_status, creator_payout_status),
    kinnso_commission_status    = coalesce(p_kinnso_commission_status, kinnso_commission_status),
    affiliate_commission_status = coalesce(p_affiliate_commission_status, affiliate_commission_status),
    ops_note                    = btrim(p_reason),
    updated_by_ops_member_id    = (select id from public.kinnso_ops_members where user_id = auth.uid() and status = 'active'),
    updated_at                  = now()
  where id = p_id;

  perform public.ops_audit_log_append('settlement', p_id, 'settlement.status', p_reason,
    v_changed || jsonb_build_object('allow_revert', coalesce(p_allow_revert, false)));
end $$;

-- Grants: revoke implicit public+anon EXECUTE, grant authenticated only (RPC self-gates).
revoke all on function public.admin_set_settlement_status(uuid, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.admin_set_settlement_status(uuid, text, text, text, text, boolean, text) to authenticated;
```

- [ ] **Step 2: Apply to the live project** (`scryfkefedzuetfdtrvl`, see memory `supabase-kinnso-project`)

Use the Supabase MCP `apply_migration` with name `admin_set_settlement_status` and the SQL above. First confirm the prior 10C migrations (`20260629120000_admin_creator_detail`, `20260629130000_creator_detail_milestones`) are already present via `list_migrations`; if not, the branch's DB is behind — stop and reconcile before applying.

- [ ] **Step 3: Smoke-test the RPC against the live DB** (via MCP `execute_sql`)

```sql
-- Expect 'forbidden' is NOT raised only inside an ops session; from the SQL editor
-- (service role) is_active_ops() is false, so this should raise 'forbidden':
select public.admin_set_settlement_status(
  (select id from public.mission_settlements limit 1),
  'paid', 'paid', null, null, false, 'smoke test'
);
```
Expected: raises `forbidden` (proves the gate fires for non-ops contexts). Do **not** mutate real rows here.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260629140000_admin_set_settlement_status.sql
git commit -m "feat(db): add admin_set_settlement_status audited RPC (Phase 10D)"
```

---

## Task 2: Type the RPC in generated types

**Files:**
- Modify: `packages/db/types.ts` (hand-patch — see memory; not a full `pnpm --filter @kinnso/db gen`)

- [ ] **Step 1: Locate the `Functions` block and the existing `admin_set_creator_status` entry**

Run: `grep -n "admin_set_creator_status\|admin_creator_detail\|Functions: {" packages/db/types.ts`
Read the surrounding shape so the new entry matches the existing `Args`/`Returns` style exactly.

- [ ] **Step 2: Add the `admin_set_settlement_status` function entry**

Insert alphabetically near the other `admin_*` functions, matching the file's existing formatting:

```ts
      admin_set_settlement_status: {
        Args: {
          p_id: string
          p_status?: string | null
          p_creator_payout_status?: string | null
          p_kinnso_commission_status?: string | null
          p_affiliate_commission_status?: string | null
          p_allow_revert?: boolean
          p_reason?: string | null
        }
        Returns: undefined
      }
```

(If the file's existing `Returns` for void RPCs is written as `Returns: void` or `Returns: undefined`, match whichever the neighbouring entries like `admin_set_creator_status` use.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS (no reference to `admin_set_settlement_status` is wired yet, so this just proves the type file still parses). If the package build is needed first, run `pnpm --filter @kinnso/db build` per the repo's setup.

- [ ] **Step 4: Commit**

```bash
git add packages/db/types.ts
git commit -m "feat(db): type admin_set_settlement_status in generated types (Phase 10D)"
```

---

## Task 3: Validation — settlement status guards

**Files:**
- Modify: `apps/web/lib/admin/creators-validation.ts`
- Test: `apps/web/tests/admin.creators-validation.test.ts` (extend; create if absent)

- [ ] **Step 1: Write the failing test**

Append to `apps/web/tests/admin.creators-validation.test.ts` (if the file does not exist, create it with the imports shown):

```ts
import { describe, it, expect } from 'vitest'
import { isSettlementStatus, isLegStatus } from '@/lib/admin/creators-validation'

describe('settlement validation guards', () => {
  it('accepts every overall settlement status', () => {
    for (const s of ['not_started', 'pending', 'partially_paid', 'paid', 'disputed']) {
      expect(isSettlementStatus(s)).toBe(true)
    }
  })
  it('rejects unknown overall statuses', () => {
    expect(isSettlementStatus('refunded')).toBe(false)
    expect(isSettlementStatus('')).toBe(false)
  })
  it('accepts only pending/paid leg statuses', () => {
    expect(isLegStatus('pending')).toBe(true)
    expect(isLegStatus('paid')).toBe(true)
    expect(isLegStatus('partially_paid')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test -- admin.creators-validation`
Expected: FAIL — `isSettlementStatus`/`isLegStatus` are not exported.

- [ ] **Step 3: Add the guards to `creators-validation.ts`**

Append to `apps/web/lib/admin/creators-validation.ts`:

```ts
export const SETTLEMENT_STATUSES = ['not_started', 'pending', 'partially_paid', 'paid', 'disputed'] as const
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number]

export const LEG_STATUSES = ['pending', 'paid'] as const
export type LegStatus = (typeof LEG_STATUSES)[number]

export function isSettlementStatus(s: string): s is SettlementStatus {
  return (SETTLEMENT_STATUSES as readonly string[]).includes(s)
}

export function isLegStatus(s: string): s is LegStatus {
  return (LEG_STATUSES as readonly string[]).includes(s)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- admin.creators-validation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/creators-validation.ts apps/web/tests/admin.creators-validation.test.ts
git commit -m "feat(web): add settlement status validation guards (Phase 10D)"
```

---

## Task 4: Server action — `setSettlementStatus`

**Files:**
- Modify: `apps/web/lib/admin/creators-actions.ts`
- Test: `apps/web/tests/admin.creators-actions.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `apps/web/tests/admin.creators-actions.test.ts`. Match the file's existing Supabase-mock harness (it already mocks `@/lib/supabase/server` and `@/lib/admin/guard`); reuse those mocks. The shape below assumes `requireOpsAction` is mocked to succeed and `supabase.rpc` is a `vi.fn()`:

```ts
import { setSettlementStatus } from '@/lib/admin/creators-actions'

describe('setSettlementStatus', () => {
  it('calls admin_set_settlement_status and revalidates on success', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    const res = await setSettlementStatus('en', 'set-1', { status: 'paid', creatorPayoutStatus: 'paid' }, 'invoice cleared')
    expect(res).toEqual({ ok: true, id: 'set-1' })
    expect(rpc).toHaveBeenCalledWith('admin_set_settlement_status', {
      p_id: 'set-1',
      p_status: 'paid',
      p_creator_payout_status: 'paid',
      p_kinnso_commission_status: null,
      p_affiliate_commission_status: null,
      p_allow_revert: false,
      p_reason: 'invoice cleared',
    })
  })

  it('requires a reason', async () => {
    const res = await setSettlementStatus('en', 'set-1', { status: 'paid' }, '   ')
    expect(res.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects when no field is provided', async () => {
    const res = await setSettlementStatus('en', 'set-1', {}, 'reason')
    expect(res.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects an invalid overall status without hitting the DB', async () => {
    const res = await setSettlementStatus('en', 'set-1', { status: 'refunded' as never }, 'reason')
    expect(res.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps a bad_transition DB raise to friendly copy', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'bad_transition' } })
    const res = await setSettlementStatus('en', 'set-1', { status: 'pending' }, 'reason')
    expect(res).toMatchObject({ ok: false })
    if (!res.ok) expect(res.errors.form[0]).toMatch(/transition/i)
  })
})
```

(If the existing test file names its rpc mock differently, adapt `rpc` to that handle. Do **not** invent a new mock harness — reuse the one already present for the creator-status tests.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test -- admin.creators-actions`
Expected: FAIL — `setSettlementStatus` is not exported.

- [ ] **Step 3: Implement the action**

In `apps/web/lib/admin/creators-actions.ts`, extend the imports and `FRIENDLY` map, then add the action.

Update the validation import line to add the settlement guards:

```ts
import { isCreatorStatus, validateReason, validateBulkIds, isSettlementStatus, isLegStatus, type CreatorStatus, type SettlementStatus, type LegStatus } from '@/lib/admin/creators-validation'
```

Add these keys to the `FRIENDLY` record:

```ts
  bad_leg_status: 'Invalid payout status.',
  no_change: 'Nothing to change — pick a different status.',
```

(Add them inside the existing `FRIENDLY` object literal; do not duplicate `bad_status`/`bad_transition`/`reason_required`/`reason_too_long`/`not_found`, which already exist and are reused.)

Add a payouts path helper next to `dirPath`:

```ts
const payoutsPath = (locale: Locale) => `/${locale}/admin/creators/payouts`
```

Append the action (file already has the top-level imports + helpers):

```ts
export interface SettlementStatusInput {
  status?: SettlementStatus
  creatorPayoutStatus?: LegStatus
  kinnsoCommissionStatus?: LegStatus
  affiliateCommissionStatus?: LegStatus
  allowRevert?: boolean
}

export async function setSettlementStatus(
  locale: Locale, id: string, input: SettlementStatusInput, reason: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  if (input.status !== undefined && !isSettlementStatus(input.status)) return formError(FRIENDLY.bad_status)
  for (const leg of [input.creatorPayoutStatus, input.kinnsoCommissionStatus, input.affiliateCommissionStatus]) {
    if (leg !== undefined && !isLegStatus(leg)) return formError(FRIENDLY.bad_leg_status)
  }
  if (input.status === undefined && input.creatorPayoutStatus === undefined
      && input.kinnsoCommissionStatus === undefined && input.affiliateCommissionStatus === undefined) {
    return formError(FRIENDLY.no_change)
  }
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr])

  const { error } = await supabase.rpc('admin_set_settlement_status', {
    p_id: id,
    p_status: input.status ?? null,
    p_creator_payout_status: input.creatorPayoutStatus ?? null,
    p_kinnso_commission_status: input.kinnsoCommissionStatus ?? null,
    p_affiliate_commission_status: input.affiliateCommissionStatus ?? null,
    p_allow_revert: input.allowRevert ?? false,
    p_reason: reason.trim(),
  })
  if (error) return formError(mapError(error.message, 'Settlement status could not be changed'))
  revalidatePath(payoutsPath(locale))
  return { ok: true, id }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- admin.creators-actions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/creators-actions.ts apps/web/tests/admin.creators-actions.test.ts
git commit -m "feat(web): add setSettlementStatus audited action (Phase 10D)"
```

---

## Task 5: Query — `getSettlementsQueue` + money-flow summary

**Files:**
- Modify: `apps/web/lib/admin/creators-queries.ts`
- Test: `apps/web/tests/admin.creators-queries.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `apps/web/tests/admin.creators-queries.test.ts`. Build a fake Supabase whose `.from('mission_settlements').select(...).order(...)` resolves to a fixture matching `opsSettlementSelect` (overall status + legs + amounts + `missions`/`mission_participants` joins):

```ts
import { getSettlementsQueue } from '@/lib/admin/creators-queries'

function fakeSupabaseSettlements(rows: unknown[], error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: rows, error }),
      }),
    }),
  } as never
}

const ROWS = [
  { id: 's1', status: 'pending', creator_payout_status: 'pending', kinnso_commission_status: 'pending',
    affiliate_commission_status: null, amount_currency: 'USD', creator_commission_amount: 100,
    kinnso_commission_amount: 10, affiliate_commission_amount: null, paid_fee_amount: null, ops_note: null,
    missions: { id: 'm1', title: 'Mission One' }, mission_participants: { id: 'p1', creator_id: 'c1', status: 'active' } },
  { id: 's2', status: 'paid', creator_payout_status: 'paid', kinnso_commission_status: 'paid',
    affiliate_commission_status: 'paid', amount_currency: 'USD', creator_commission_amount: 50,
    kinnso_commission_amount: 5, affiliate_commission_amount: 5, paid_fee_amount: null, ops_note: 'done',
    missions: { id: 'm2', title: 'Mission Two' }, mission_participants: { id: 'p2', creator_id: 'c2', status: 'completed' } },
  { id: 's3', status: 'disputed', creator_payout_status: 'pending', kinnso_commission_status: null,
    affiliate_commission_status: null, amount_currency: 'HKD', creator_commission_amount: 80,
    kinnso_commission_amount: null, affiliate_commission_amount: null, paid_fee_amount: null, ops_note: null,
    missions: { id: 'm3', title: 'Mission Three' }, mission_participants: null },
]

describe('getSettlementsQueue', () => {
  it('maps rows and groups by status with honest per-currency money flow', async () => {
    const q = await getSettlementsQueue(fakeSupabaseSettlements(ROWS), {})
    expect(q.rows).toHaveLength(3)
    expect(q.rows[0]).toMatchObject({ id: 's1', missionTitle: 'Mission One', creatorId: 'c1', status: 'pending', creatorPayoutStatus: 'pending', creatorCommissionAmount: 100, currency: 'USD' })
    expect(q.summary.total).toBe(3)
    expect(q.summary.byStatus).toMatchObject({ pending: 1, paid: 1, disputed: 1 })
    // creator payout owed = creator_commission_amount where creator_payout_status='pending', by currency
    expect(q.summary.owed).toEqual(expect.arrayContaining([
      { currency: 'USD', amount: 100 }, { currency: 'HKD', amount: 80 },
    ]))
    // settled = where creator_payout_status='paid'
    expect(q.summary.settled).toEqual([{ currency: 'USD', amount: 50 }])
  })

  it('filters by overall status when given', async () => {
    const q = await getSettlementsQueue(fakeSupabaseSettlements(ROWS), { status: 'disputed' })
    expect(q.rows.map((r) => r.id)).toEqual(['s3'])
    expect(q.summary.total).toBe(3) // summary reflects the full queue, not the filtered view
  })

  it('propagates query errors (never swallows to empty)', async () => {
    await expect(getSettlementsQueue(fakeSupabaseSettlements(null, { message: 'boom' }), {})).rejects.toBeTruthy()
  })

  it('returns honest zeros on an empty queue', async () => {
    const q = await getSettlementsQueue(fakeSupabaseSettlements([]), {})
    expect(q.rows).toEqual([])
    expect(q.summary).toMatchObject({ total: 0, byStatus: {}, owed: [], settled: [] })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test -- admin.creators-queries`
Expected: FAIL — `getSettlementsQueue` not exported.

- [ ] **Step 3: Implement the query**

Add to `apps/web/lib/admin/creators-queries.ts`. Reuse `listOpsSettlements`/`opsSettlementSelect` from `lib/missions/queries` (do not duplicate the select string). Add the import at the top and the types + function:

```ts
import { listOpsSettlements } from '@/lib/missions/queries'
import { type SettlementStatus } from '@/lib/admin/creators-validation'
```

```ts
export interface PayoutRow {
  id: string
  missionTitle: string
  creatorId: string | null
  status: string
  creatorPayoutStatus: string | null
  kinnsoCommissionStatus: string | null
  affiliateCommissionStatus: string | null
  currency: string | null
  creatorCommissionAmount: number | null
  kinnsoCommissionAmount: number | null
  affiliateCommissionAmount: number | null
  opsNote: string | null
}

/** Money figures are grouped by currency — settlements may be in different currencies,
 *  so summing across them would be dishonest. Empty arrays mean "nothing owed/settled". */
export interface PayoutsSummary {
  total: number
  byStatus: Record<string, number>
  owed: { currency: string; amount: number }[]
  settled: { currency: string; amount: number }[]
}

export interface PayoutsQueue {
  rows: PayoutRow[]
  summary: PayoutsSummary
}

type OpsSettlementJoinRow = {
  id: string
  status: string | null
  creator_payout_status: string | null
  kinnso_commission_status: string | null
  affiliate_commission_status: string | null
  amount_currency: string | null
  creator_commission_amount: number | null
  kinnso_commission_amount: number | null
  affiliate_commission_amount: number | null
  ops_note: string | null
  missions?: { title?: string | null } | Array<{ title?: string | null }> | null
  mission_participants?: { creator_id?: string | null } | Array<{ creator_id?: string | null }> | null
}

const one = <T>(v: T | T[] | null | undefined): T | null =>
  (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

const toPayoutRow = (r: OpsSettlementJoinRow): PayoutRow => {
  const mission = one(r.missions)
  const participant = one(r.mission_participants)
  return {
    id: r.id,
    missionTitle: mission?.title ?? 'Untitled mission',
    creatorId: participant?.creator_id ?? null,
    status: r.status ?? 'not_started',
    creatorPayoutStatus: r.creator_payout_status,
    kinnsoCommissionStatus: r.kinnso_commission_status,
    affiliateCommissionStatus: r.affiliate_commission_status,
    currency: r.amount_currency,
    creatorCommissionAmount: r.creator_commission_amount,
    kinnsoCommissionAmount: r.kinnso_commission_amount,
    affiliateCommissionAmount: r.affiliate_commission_amount,
    opsNote: r.ops_note,
  }
}

const sumByCurrency = (rows: PayoutRow[]): { currency: string; amount: number }[] => {
  const acc = new Map<string, number>()
  for (const r of rows) {
    const cur = r.currency ?? 'unknown'
    const amt = r.creatorCommissionAmount ?? 0
    acc.set(cur, (acc.get(cur) ?? 0) + amt)
  }
  return [...acc.entries()].map(([currency, amount]) => ({ currency, amount }))
}

/**
 * The full settlement queue across all creators (ops-aggregate). Reads via the ops
 * RLS path (`mission_settlements_visible_select` exposes all rows to ops). Errors
 * propagate. The summary always reflects the FULL queue; `opts.status` only filters
 * the returned `rows` so the money-flow cards stay stable while ops drills into a status.
 */
export async function getSettlementsQueue(
  supabase: SupabaseClient<Database>,
  opts: { status?: SettlementStatus },
): Promise<PayoutsQueue> {
  const { data, error } = await listOpsSettlements(supabase)
  if (error) throw error
  const all = ((data ?? []) as unknown as OpsSettlementJoinRow[]).map(toPayoutRow)

  const byStatus: Record<string, number> = {}
  for (const r of all) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1

  const summary: PayoutsSummary = {
    total: all.length,
    byStatus,
    owed: sumByCurrency(all.filter((r) => r.creatorPayoutStatus === 'pending')),
    settled: sumByCurrency(all.filter((r) => r.creatorPayoutStatus === 'paid')),
  }

  const rows = opts.status ? all.filter((r) => r.status === opts.status) : all
  return { rows, summary }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- admin.creators-queries`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/creators-queries.ts apps/web/tests/admin.creators-queries.test.ts
git commit -m "feat(web): add getSettlementsQueue payouts aggregator (Phase 10D)"
```

---

## Task 6: i18n — new Payouts strings in all 7 locales

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface + values)
- Modify: `apps/web/lib/i18n/messages/{zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` (values)

- [ ] **Step 1: Add the keys to the `Messages['creators']` interface (`en.ts`)**

Inside the `creators: { … }` interface block (around `en.ts:626-658`), append before the closing `}` of the group:

```ts
    tabPayouts: string
    payoutsQueue: string; payoutsOwed: string; payoutsSettled: string
    setNotStarted: string; setPending: string; setPartiallyPaid: string; setPaid: string; setDisputed: string
    colOpsNote: string
    actMarkPaid: string; actMarkDisputed: string
    confirmMarkPaid: string; confirmMarkDisputed: string
    payoutsEmpty: string
```

- [ ] **Step 2: Add the English values (`en.ts`)**

Inside the `creators: { … }` **value** block (around `en.ts:1500-1534`), append before the closing `},`:

```ts
    tabPayouts: 'Payouts',
    payoutsQueue: 'Settlements', payoutsOwed: 'Creator payout owed', payoutsSettled: 'Creator payout settled',
    setNotStarted: 'Not started', setPending: 'Pending', setPartiallyPaid: 'Partially paid', setPaid: 'Paid', setDisputed: 'Disputed',
    colOpsNote: 'Ops note',
    actMarkPaid: 'Mark paid', actMarkDisputed: 'Mark disputed',
    confirmMarkPaid: 'Mark this settlement fully paid? This records a creator payout.',
    confirmMarkDisputed: 'Flag this settlement as disputed?',
    payoutsEmpty: 'No settlements match this filter',
```

- [ ] **Step 3: Add the same keys (translated) to the 6 other locales**

In each of `zh-hk.ts`, `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`, `th.ts`, append these keys to the `creators` value group (same insertion point — before the group's closing `},`). Use these canonical translations:

`zh-hk.ts`:
```ts
    tabPayouts: '付款',
    payoutsQueue: '結算', payoutsOwed: '應付創作者款項', payoutsSettled: '已付創作者款項',
    setNotStarted: '未開始', setPending: '待處理', setPartiallyPaid: '部分支付', setPaid: '已支付', setDisputed: '有爭議',
    colOpsNote: '營運備註',
    actMarkPaid: '標記已支付', actMarkDisputed: '標記爭議',
    confirmMarkPaid: '確認此結算已全額支付？此操作會記錄一筆創作者付款。',
    confirmMarkDisputed: '將此結算標記為爭議？',
    payoutsEmpty: '沒有符合此篩選的結算',
```

`zh-tw.ts`:
```ts
    tabPayouts: '付款',
    payoutsQueue: '結算', payoutsOwed: '應付創作者款項', payoutsSettled: '已付創作者款項',
    setNotStarted: '未開始', setPending: '待處理', setPartiallyPaid: '部分支付', setPaid: '已支付', setDisputed: '有爭議',
    colOpsNote: '營運備註',
    actMarkPaid: '標記已支付', actMarkDisputed: '標記爭議',
    confirmMarkPaid: '確認此結算已全額支付？此操作會記錄一筆創作者付款。',
    confirmMarkDisputed: '將此結算標記為爭議？',
    payoutsEmpty: '沒有符合此篩選的結算',
```

`zh-cn.ts`:
```ts
    tabPayouts: '付款',
    payoutsQueue: '结算', payoutsOwed: '应付创作者款项', payoutsSettled: '已付创作者款项',
    setNotStarted: '未开始', setPending: '待处理', setPartiallyPaid: '部分支付', setPaid: '已支付', setDisputed: '有争议',
    colOpsNote: '运营备注',
    actMarkPaid: '标记已支付', actMarkDisputed: '标记争议',
    confirmMarkPaid: '确认此结算已全额支付？此操作会记录一笔创作者付款。',
    confirmMarkDisputed: '将此结算标记为争议？',
    payoutsEmpty: '没有符合此筛选的结算',
```

`ja.ts`:
```ts
    tabPayouts: '支払い',
    payoutsQueue: '精算', payoutsOwed: 'クリエイター未払い額', payoutsSettled: 'クリエイター支払い済み額',
    setNotStarted: '未開始', setPending: '保留中', setPartiallyPaid: '一部支払い済み', setPaid: '支払い済み', setDisputed: '異議あり',
    colOpsNote: '運用メモ',
    actMarkPaid: '支払い済みにする', actMarkDisputed: '異議ありにする',
    confirmMarkPaid: 'この精算を全額支払い済みにしますか？クリエイターへの支払いとして記録されます。',
    confirmMarkDisputed: 'この精算を異議ありとしてフラグしますか？',
    payoutsEmpty: 'このフィルターに一致する精算はありません',
```

`ko.ts`:
```ts
    tabPayouts: '지급',
    payoutsQueue: '정산', payoutsOwed: '크리에이터 미지급액', payoutsSettled: '크리에이터 지급 완료액',
    setNotStarted: '시작 안 함', setPending: '대기 중', setPartiallyPaid: '부분 지급', setPaid: '지급 완료', setDisputed: '분쟁',
    colOpsNote: '운영 메모',
    actMarkPaid: '지급 완료 표시', actMarkDisputed: '분쟁 표시',
    confirmMarkPaid: '이 정산을 전액 지급 완료로 표시할까요? 크리에이터 지급으로 기록됩니다.',
    confirmMarkDisputed: '이 정산을 분쟁으로 표시할까요?',
    payoutsEmpty: '이 필터와 일치하는 정산이 없습니다',
```

`th.ts`:
```ts
    tabPayouts: 'การจ่ายเงิน',
    payoutsQueue: 'การชำระเงิน', payoutsOwed: 'ยอดค้างจ่ายครีเอเตอร์', payoutsSettled: 'ยอดจ่ายครีเอเตอร์แล้ว',
    setNotStarted: 'ยังไม่เริ่ม', setPending: 'รอดำเนินการ', setPartiallyPaid: 'จ่ายบางส่วน', setPaid: 'จ่ายแล้ว', setDisputed: 'มีข้อพิพาท',
    colOpsNote: 'บันทึกทีมงาน',
    actMarkPaid: 'ทำเครื่องหมายว่าจ่ายแล้ว', actMarkDisputed: 'ทำเครื่องหมายว่ามีข้อพิพาท',
    confirmMarkPaid: 'ทำเครื่องหมายว่าการชำระเงินนี้จ่ายครบแล้วหรือไม่? ระบบจะบันทึกเป็นการจ่ายเงินให้ครีเอเตอร์',
    confirmMarkDisputed: 'ทำเครื่องหมายการชำระเงินนี้ว่ามีข้อพิพาทหรือไม่?',
    payoutsEmpty: 'ไม่มีการชำระเงินที่ตรงกับตัวกรองนี้',
```

- [ ] **Step 4: Run the locale-parity test**

Run: `pnpm --filter web test -- i18n.locale-parity`
Expected: PASS — all 7 locales have identical `creators` key sets.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/i18n/messages
git commit -m "i18n(web): add Payouts tab strings across all 7 locales (Phase 10D)"
```

---

## Task 7: Add the Payouts tab to `CreatorsTabs`

**Files:**
- Modify: `apps/web/components/kinnso/admin/creators/CreatorsTabs.tsx`

- [ ] **Step 1: Add the tab**

Edit the `tabs` array in `CreatorsTabs.tsx` to add Payouts after Directory:

```ts
  const tabs = [
    { href: `/${locale}/admin/creators`, label: t.tabOverview },
    { href: `/${locale}/admin/creators/directory`, label: t.tabDirectory },
    { href: `/${locale}/admin/creators/payouts`, label: t.tabPayouts },
  ]
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS (`t.tabPayouts` now exists on `Messages['creators']` from Task 6).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/kinnso/admin/creators/CreatorsTabs.tsx
git commit -m "feat(web): add Payouts tab to creators sub-nav (Phase 10D)"
```

---

## Task 8: `CreatorPayoutsView` component

**Files:**
- Create: `apps/web/components/kinnso/admin/creators/CreatorPayoutsView.tsx`
- Test: `apps/web/tests/kinnso.CreatorPayoutsView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/kinnso.CreatorPayoutsView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreatorPayoutsView } from '@/components/kinnso/admin/creators/CreatorPayoutsView'
import en from '@/lib/i18n/messages/en'

const t = en.creators
const queue = {
  rows: [
    { id: 's1', missionTitle: 'Mission One', creatorId: 'c1', status: 'pending', creatorPayoutStatus: 'pending',
      kinnsoCommissionStatus: 'pending', affiliateCommissionStatus: null, currency: 'USD',
      creatorCommissionAmount: 100, kinnsoCommissionAmount: 10, affiliateCommissionAmount: null, opsNote: null },
  ],
  summary: { total: 1, byStatus: { pending: 1 }, owed: [{ currency: 'USD', amount: 100 }], settled: [] },
}

describe('CreatorPayoutsView', () => {
  it('renders summary cards and the queue table', () => {
    render(<CreatorPayoutsView t={t} locale="en" queue={queue} status={undefined} action={vi.fn()} />)
    expect(screen.getByText(t.payoutsOwed)).toBeInTheDocument()
    expect(screen.getByText('Mission One')).toBeInTheDocument()
    expect(screen.getByText(t.actMarkPaid)).toBeInTheDocument()
  })

  it('shows the empty state when the filtered queue is empty', () => {
    render(<CreatorPayoutsView t={t} locale="en" queue={{ rows: [], summary: queue.summary }} status="paid" action={vi.fn()} />)
    expect(screen.getByText(t.payoutsEmpty)).toBeInTheDocument()
  })

  it('requires confirmation + reason before calling the action', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, id: 's1' })
    render(<CreatorPayoutsView t={t} locale="en" queue={queue} status={undefined} action={action} />)
    fireEvent.click(screen.getByText(t.actMarkPaid))            // open confirm panel
    fireEvent.change(screen.getByPlaceholderText(t.reasonPlaceholder), { target: { value: 'invoice cleared' } })
    fireEvent.click(screen.getByText(t.actApply))               // confirm
    await waitFor(() => expect(action).toHaveBeenCalledWith('en', 's1',
      { status: 'paid', creatorPayoutStatus: 'paid', kinnsoCommissionStatus: 'paid', affiliateCommissionStatus: 'paid' },
      'invoice cleared'))
  })

  it('blocks confirm when the reason is blank', () => {
    const action = vi.fn()
    render(<CreatorPayoutsView t={t} locale="en" queue={queue} status={undefined} action={action} />)
    fireEvent.click(screen.getByText(t.actMarkPaid))
    fireEvent.click(screen.getByText(t.actApply))
    expect(action).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test -- CreatorPayoutsView`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

Create `apps/web/components/kinnso/admin/creators/CreatorPayoutsView.tsx`. It mirrors the directory view's structure (CreatorsTabs header + table + reason-gated confirm). Settlement-status labels resolve via a local map; money is shown with the row currency.

```tsx
'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CreatorsTabs } from '@/components/kinnso/admin/creators/CreatorsTabs'
import type { PayoutRow, PayoutsQueue } from '@/lib/admin/creators-queries'
import type { SettlementStatusInput } from '@/lib/admin/creators-actions'
import type { ActionResult } from '@/lib/admin/result'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'

type T = Messages['creators']
type ActionFn = (locale: Locale, id: string, input: SettlementStatusInput, reason: string) => Promise<ActionResult<{ id: string }>>

const STATUS_ORDER = ['not_started', 'pending', 'partially_paid', 'paid', 'disputed'] as const

const money = (n: number | null) => (n === null ? '—' : n.toFixed(2))

function statusLabel(t: T, s: string): string {
  switch (s) {
    case 'not_started': return t.setNotStarted
    case 'pending': return t.setPending
    case 'partially_paid': return t.setPartiallyPaid
    case 'paid': return t.setPaid
    case 'disputed': return t.setDisputed
    default: return s
  }
}

function legLabel(t: T, s: string | null): string {
  if (s === 'paid') return t.setPaid
  if (s === 'pending') return t.setPending
  return '—'
}

// The two forward, money-safe actions the UI exposes (reverts are not surfaced in v1).
type PendingAction = { row: PayoutRow; kind: 'paid' | 'disputed' } | null

export function CreatorPayoutsView({
  t, locale, queue, status, action,
}: {
  t: T; locale: Locale; queue: PayoutsQueue; status: string | undefined; action: ActionFn
}) {
  const [pending, setPending] = useState<PendingAction>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const open = (row: PayoutRow, kind: 'paid' | 'disputed') => { setPending({ row, kind }); setReason(''); setError(null) }
  const cancel = () => { setPending(null); setReason(''); setError(null) }

  const confirm = () => {
    if (!pending) return
    if (!reason.trim()) { setError(t.actionFailed); return }
    const input: SettlementStatusInput = pending.kind === 'paid'
      ? { status: 'paid', creatorPayoutStatus: 'paid', kinnsoCommissionStatus: 'paid', affiliateCommissionStatus: 'paid' }
      : { status: 'disputed' }
    startTransition(async () => {
      const res = await action(locale, pending.row.id, input, reason.trim())
      if (res.ok) cancel()
      else setError(res.errors.form?.[0] ?? t.actionFailed)
    })
  }

  const filterHref = (s?: string) =>
    s ? `/${locale}/admin/creators/payouts?status=${s}` : `/${locale}/admin/creators/payouts`

  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-kinnso-ink">{t.title}</h1>
      <p className="mb-4 text-sm text-kinnso-muted">{t.subtitle}</p>
      <CreatorsTabs t={t} locale={locale} />

      {/* Money-flow summary cards (always reflect the full queue). */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-kinnso-line p-4">
          <p className="text-xs font-bold uppercase text-kinnso-muted">{t.payoutsQueue}</p>
          <p className="mt-1 text-2xl font-black text-kinnso-ink">{queue.summary.total}</p>
        </div>
        <div className="rounded-xl border border-kinnso-line p-4">
          <p className="text-xs font-bold uppercase text-kinnso-muted">{t.kpiPayoutsPending}</p>
          <p className="mt-1 text-2xl font-black text-kinnso-ink">
            {(queue.summary.byStatus.pending ?? 0) + (queue.summary.byStatus.partially_paid ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-kinnso-line p-4">
          <p className="text-xs font-bold uppercase text-kinnso-muted">{t.payoutsOwed}</p>
          <p className="mt-1 text-sm font-black text-kinnso-ink">
            {queue.summary.owed.length === 0 ? '—' : queue.summary.owed.map((o) => `${money(o.amount)} ${o.currency}`).join(' · ')}
          </p>
        </div>
        <div className="rounded-xl border border-kinnso-line p-4">
          <p className="text-xs font-bold uppercase text-kinnso-muted">{t.payoutsSettled}</p>
          <p className="mt-1 text-sm font-black text-kinnso-ink">
            {queue.summary.settled.length === 0 ? '—' : queue.summary.settled.map((o) => `${money(o.amount)} ${o.currency}`).join(' · ')}
          </p>
        </div>
      </div>

      {/* Status filter. */}
      <nav className="mb-4 flex flex-wrap gap-2">
        <Link href={filterHref()} aria-current={!status ? 'page' : undefined}
          className={`rounded-full px-3 py-1 text-xs font-bold ${!status ? 'bg-kinnso-orange text-white' : 'bg-kinnso-line/40 text-kinnso-muted'}`}>
          {t.dirAll}
        </Link>
        {STATUS_ORDER.map((s) => (
          <Link key={s} href={filterHref(s)} aria-current={status === s ? 'page' : undefined}
            className={`rounded-full px-3 py-1 text-xs font-bold ${status === s ? 'bg-kinnso-orange text-white' : 'bg-kinnso-line/40 text-kinnso-muted'}`}>
            {statusLabel(t, s)} {queue.summary.byStatus[s] ? `(${queue.summary.byStatus[s]})` : ''}
          </Link>
        ))}
      </nav>

      {queue.rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-kinnso-muted">{t.payoutsEmpty}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-kinnso-muted">
            <tr className="border-b border-kinnso-line">
              <th className="py-2 font-bold">{t.colMission}</th>
              <th className="py-2 font-bold">{t.colName}</th>
              <th className="py-2 font-bold">{t.colAmount}</th>
              <th className="py-2 font-bold">{t.colPayout}</th>
              <th className="py-2 font-bold">{t.colStatus}</th>
              <th className="py-2 font-bold">{t.colOpsNote}</th>
              <th className="py-2 font-bold">{t.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {queue.rows.map((r) => (
              <tr key={r.id} className="border-b border-kinnso-line/60 align-top">
                <td className="py-2 font-bold text-kinnso-ink">{r.missionTitle}</td>
                <td className="py-2 text-kinnso-muted">
                  {r.creatorId
                    ? <Link href={`/${locale}/admin/creators/${r.creatorId}`} className="text-kinnso-orange hover:underline">{r.creatorId.slice(0, 8)}</Link>
                    : '—'}
                </td>
                <td className="py-2 text-kinnso-muted">{money(r.creatorCommissionAmount)} <span className="text-kinnso-ink">{r.currency ?? ''}</span></td>
                <td className="py-2 text-kinnso-muted">{legLabel(t, r.creatorPayoutStatus)}</td>
                <td className="py-2 text-kinnso-muted">{statusLabel(t, r.status)}</td>
                <td className="py-2 text-kinnso-muted">{r.opsNote ?? '—'}</td>
                <td className="py-2">
                  <div className="flex flex-col gap-1">
                    <button type="button" onClick={() => open(r, 'paid')}
                      className="rounded-md bg-kinnso-orange px-2 py-1 text-xs font-bold text-white disabled:opacity-50"
                      disabled={r.status === 'paid'}>{t.actMarkPaid}</button>
                    <button type="button" onClick={() => open(r, 'disputed')}
                      className="rounded-md border border-kinnso-line px-2 py-1 text-xs font-bold text-kinnso-ink disabled:opacity-50"
                      disabled={r.status === 'disputed'}>{t.actMarkDisputed}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Confirm + reason panel (money-touching → required per spec §6). */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <p className="mb-3 text-sm font-bold text-kinnso-ink">
              {pending.kind === 'paid' ? t.confirmMarkPaid : t.confirmMarkDisputed}
            </p>
            <p className="mb-2 text-xs text-kinnso-muted">{pending.row.missionTitle}</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.reasonPlaceholder}
              className="mb-2 w-full rounded-md border border-kinnso-line p-2 text-sm" rows={3} />
            {error && <p className="mb-2 text-xs font-bold text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={cancel} disabled={isPending}
                className="rounded-md border border-kinnso-line px-3 py-1 text-sm font-bold text-kinnso-ink">{t.actCancel}</button>
              <button type="button" onClick={confirm} disabled={isPending}
                className="rounded-md bg-kinnso-orange px-3 py-1 text-sm font-bold text-white disabled:opacity-50">{t.actApply}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CreatorPayoutsView
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- CreatorPayoutsView`
Expected: PASS (all four cases). If `@testing-library/react` matchers differ from the repo's existing setup, mirror the imports used by `kinnso.CreatorsDirectoryView.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/admin/creators/CreatorPayoutsView.tsx apps/web/tests/kinnso.CreatorPayoutsView.test.tsx
git commit -m "feat(web): add CreatorPayoutsView queue + confirm-gated actions (Phase 10D)"
```

---

## Task 9: Route — `payouts/page.tsx`

**Files:**
- Create: `apps/web/app/[locale]/admin/creators/payouts/page.tsx`
- Test: `apps/web/tests/admin.creators-payouts.host.test.tsx`

- [ ] **Step 1: Write the failing host test**

Create `apps/web/tests/admin.creators-payouts.host.test.tsx`, mirroring the existing creators host test (`admin.creators.host.test.tsx` / the directory host test). It must assert: anon → `redirect` to sign-in; non-ops → `notFound`; ops → renders without throwing. Copy the mock setup verbatim from the sibling host test and swap the imported page + query:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'

const redirect = vi.fn(() => { throw new Error('REDIRECT') })
const notFound = vi.fn(() => { throw new Error('NOT_FOUND') })
vi.mock('next/navigation', () => ({ redirect, notFound }))

const getUser = vi.fn()
const resolveViewerRole = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser } }) }))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole }))
vi.mock('@/lib/admin/creators-queries', () => ({
  getSettlementsQueue: vi.fn(async () => ({ rows: [], summary: { total: 0, byStatus: {}, owed: [], settled: [] } })),
}))

import Page from '@/app/[locale]/admin/creators/payouts/page'

const params = Promise.resolve({ locale: 'en' })
const searchParams = Promise.resolve({})

beforeEach(() => { redirect.mockClear(); notFound.mockClear(); getUser.mockReset(); resolveViewerRole.mockReset() })

describe('payouts page gate', () => {
  it('redirects anonymous users', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(Page({ params, searchParams })).rejects.toThrow('REDIRECT')
    expect(redirect).toHaveBeenCalled()
  })
  it('notFound for non-ops', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    resolveViewerRole.mockResolvedValue('creator')
    await expect(Page({ params, searchParams })).rejects.toThrow('NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })
  it('renders for ops', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    resolveViewerRole.mockResolvedValue('ops')
    const el = await Page({ params, searchParams })
    expect(el).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test -- admin.creators-payouts.host`
Expected: FAIL — page module does not exist.

- [ ] **Step 3: Implement the page**

Create `apps/web/app/[locale]/admin/creators/payouts/page.tsx` (mirrors `directory/page.tsx`):

```tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getSettlementsQueue } from '@/lib/admin/creators-queries'
import { isSettlementStatus } from '@/lib/admin/creators-validation'
import { setSettlementStatus } from '@/lib/admin/creators-actions'
import { CreatorPayoutsView } from '@/components/kinnso/admin/creators/CreatorPayoutsView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Search = { status?: string }

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
  const queue = await getSettlementsQueue(supabase, { status })
  return (
    <CreatorPayoutsView t={messages.creators} locale={loc} queue={queue} status={status} action={setSettlementStatus} />
  )
}
```

- [ ] **Step 4: Run the host test to verify it passes**

Run: `pnpm --filter web test -- admin.creators-payouts.host`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/[locale]/admin/creators/payouts/page.tsx apps/web/tests/admin.creators-payouts.host.test.tsx
git commit -m "feat(web): add creators payouts route (Phase 10D)"
```

---

## Task 10: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the whole web app**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `pnpm --filter web lint`
Expected: PASS (no new warnings/errors in 10D files).

- [ ] **Step 3: Run the full web test suite**

Run: `pnpm --filter web test`
Expected: PASS for all 10D suites (`admin.creators-validation`, `admin.creators-actions`, `admin.creators-queries`, `kinnso.CreatorPayoutsView`, `admin.creators-payouts.host`, `i18n.locale-parity`). Pre-existing suites that require a real Supabase and time out on dummy creds are expected (per CLAUDE.md "Testing") — they are not 10D regressions; confirm none of the *newly failing* suites are 10D-owned.

- [ ] **Step 4: Verify the migration is applied + transition matrix behaves**

Confirm via Supabase MCP `list_migrations` that `admin_set_settlement_status` is present on `scryfkefedzuetfdtrvl`. (Optional deeper check, non-mutating: read the function source via `execute_sql` `select pg_get_functiondef('public.admin_set_settlement_status'::regprocedure)` and eyeball the guards.)

- [ ] **Step 5: No commit** (verification only). If any step fails, fix in the owning task and re-run.

---

## Task 11: PR — stack #55 on #54

**Files:** none (git/GitHub only)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/creators-console-10d
```

- [ ] **Step 2: Open the PR with base = the 10C branch**

```bash
gh pr create --base feat/creators-console-10c --head feat/creators-console-10d \
  --title "Phase 10D — Creators Operator Console: Payouts" \
  --body-file <(cat <<'EOF'
## Phase 10D — Payouts (final slice of the Creators console)

Adds the **Payouts** tab (`/admin/creators/payouts`): a cross-creator settlement queue
with a per-currency money-flow summary and confirm-gated, audited status writes.

### Backend
- New migration `20260629140000_admin_set_settlement_status` — SECURITY DEFINER,
  `is_active_ops()`-gated, reason-required RPC that enforces the settlement transition
  matrix (forward + to/from `disputed` always allowed; backward needs `p_allow_revert`),
  locks the row `for update`, stamps `ops_note`/`updated_by_ops_member_id`, and appends
  an `ops_audit_log` row (`entity_type='settlement'`) in the same transaction.
- The legacy direct-write path (`lib/missions` `updateSettlementAction` / `/ops/settlements`)
  is left untouched.

### App
- `getSettlementsQueue` (reuses `listOpsSettlements`/`opsSettlementSelect`) — maps rows +
  honest per-currency owed/settled totals; errors propagate.
- `setSettlementStatus` server action — validates, calls the RPC, maps DB raises to
  localized copy, revalidates.
- `CreatorPayoutsView` — summary cards, status filter, queue table, per-row
  **Mark paid / Mark disputed** behind a confirm + reason dialog (reverts not surfaced in v1).
- Payouts tab added to `CreatorsTabs`; new `creators` strings across all 7 locales.

### Tests
- `admin.creators-validation` (settlement guards), `admin.creators-actions`
  (transition/guard/audit/ActionResult), `admin.creators-queries` (queue grouping +
  per-currency summary + error propagation), `kinnso.CreatorPayoutsView` (render +
  confirm/reason flow), `admin.creators-payouts.host` (gate), `i18n.locale-parity`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)
```

- [ ] **Step 2 (alt):** If process substitution is unavailable, write the body to a scratch file and pass `--body-file <path>`.

- [ ] **Step 3: Confirm the PR targets the 10C branch** (so the diff is 10D-only, stacked).

Run: `gh pr view --json baseRefName,headRefName,number`
Expected: `baseRefName = feat/creators-console-10c`.

---

## Self-review (run after the plan, before execution)

- **Spec coverage (§5 "10D"):** `payouts/page.tsx` (Task 9) ✓ · `getSettlementsQueue` reusing `listOpsSettlements` (Task 5) ✓ · `setSettlementStatus` wrapping `admin_set_settlement_status()` with extra confirm (Tasks 4 + 8) ✓ · `CreatorPayoutsView` queue/summary/confirm (Task 8) ✓ · `admin_set_settlement_status()` (Task 1) ✓ · tests: queries/actions/host/view (Tasks 4,5,8,9) ✓ · §7 transition matrix written down (Design decision) ✓ · §6 money-confirm + reason (Tasks 1,4,8) ✓.
- **Type consistency:** `SettlementStatusInput` defined in Task 4 (`creators-actions.ts`), imported by Task 8 (view) and used by Task 9 (page action prop). `PayoutRow`/`PayoutsQueue`/`PayoutsSummary` defined in Task 5, consumed by Tasks 8/9. `SettlementStatus`/`LegStatus`/`isSettlementStatus`/`isLegStatus` defined in Task 3, used by Tasks 4/5/9. RPC arg names identical across migration (Task 1), types (Task 2), and action call (Task 4): `p_id,p_status,p_creator_payout_status,p_kinnso_commission_status,p_affiliate_commission_status,p_allow_revert,p_reason`.
- **i18n keys:** every key referenced by `CreatorPayoutsView`/`CreatorsTabs` (`tabPayouts,payoutsQueue,payoutsOwed,payoutsSettled,setNotStarted,setPending,setPartiallyPaid,setPaid,setDisputed,colOpsNote,actMarkPaid,actMarkDisputed,confirmMarkPaid,confirmMarkDisputed,payoutsEmpty`) is added to the interface + all 7 locales in Task 6; reused existing keys (`title,subtitle,colMission,colName,colAmount,colPayout,colStatus,colActions,dirAll,reasonPlaceholder,actApply,actCancel,actionFailed,kpiPayoutsPending`) already exist.
- **Placeholder scan:** no TBD/TODO; every code step shows full code.
