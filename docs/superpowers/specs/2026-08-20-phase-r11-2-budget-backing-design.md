# Phase R11.2 — Merchant Budget Backing (Funded Missions) — Design

**Status:** Approved by user 2026-08-20, pending implementation plan.

## Goal

Back paid/hybrid mission approvals with funded merchant budgets: when a merchant's budget is
enforced, an approval that would mint a settlement the balance can't cover fails atomically —
the creator promise never exceeds funding. Off by default; merchants without budget rows (or
with unenforced ones) behave exactly as today.

## Context

This is R11.2, the final sub-phase of R11 ("Mission Control") in the R10–R13 roadmap
(`~/Downloads/kinnso-roadmap-r10-r13.md`), porting Adfocate migration `0024`'s budget-debit
mechanic into kinnso-v3 with Kinnso naming. Unlike R11.1, this phase roots cleanly on `main` —
R11.0 (PR #114) and R11.1 (PR #115) were both squash-merged before this branch was cut, so no
stacked-branch risk applies.

**The central architectural fact this design rests on:** all three approval paths — the
merchant's plain RLS UPDATE in `reviewSubmissionAction`, ops' `admin_review_submission` RPC
(R11.0), and the `notify_verification_auto_approve` trigger (R11.1) — converge on
`mission_milestone_submissions.status -> 'approved'`, where R10.1's
`create_mission_settlement_on_approval` trigger already mints the payment obligation
(`mission_settlements` row) with first-approval-per-participant dedupe
(`on conflict ... do nothing`), merchant-source/paid-hybrid/positive-fee guards, and an
explicit "a settlement is an OBLIGATION, not a payment" contract. The settlement row IS the
moment funding is committed.

## Decisions made during brainstorming

1. **The funding gate is an `AFTER INSERT` trigger on `mission_settlements`**, not a
   `BEFORE UPDATE` trigger on submissions and not per-RPC checks. Rationale: (a) an AFTER
   INSERT trigger fires only for rows actually inserted, so it inherits the settlement
   trigger's dedupe for free — a re-approval after a revision cycle can never double-debit,
   with zero duplicated guard logic that could drift; (b) a raise inside it aborts the whole
   transaction — settlement AND the approval UPDATE that caused it — on all three approval
   paths from one place; (c) per-RPC checks are impossible anyway, since the merchant
   approval path is a plain RLS UPDATE with no RPC to put a check in.
2. **`enforced = false` (and no-budget-row) means no debit AND no check** — pure
   today's-behavior. Enforcement is the single switch that turns on both. A "track but never
   block" variant was rejected: the `balance >= 0` constraint would make a zero-balance
   unenforced merchant's approval fail anyway, quietly breaking the compatibility promise.
3. **The creator-facing "Funded" badge reads through a definer RPC, not a join.** The
   documented RLS-join-through-owner-locked-table gotcha applies: creators reading
   `/studio/missions` cannot join through owner-scoped `merchant_budgets`. A `stable
   SECURITY DEFINER` RPC `funded_merchant_profiles()` returns just the set of
   `merchant_profile_id`s with `enforced = true` — the funded bit and nothing else, never
   balances. One call per missions-list load, no N+1, no denormalization trigger to drift.

## Out of scope

- Merchant self-serve top-up payments (Stripe billing) — later, once volume justifies (per
  roadmap).
- Any change to R10.1's settlement-mint trigger or to shipped approval paths — the new
  trigger composes with them; nothing shipped is edited.
- Per-milestone fee proration (the settlement trigger's own documented deferral stands).
- Surfacing unfunded-auto-approval events in the attention feed — an unfunded auto-approval
  already lands safely (see Error handling); a dedicated ops signal can come later if real
  usage shows it's needed.
- Ledger immutability triggers (R10.2-style) — append-only is enforced via grants (definer
  writes only); full trigger-level immutability is not required by the roadmap's acceptance.

## Architecture

**1. Funding gate — `debit_merchant_budget_on_settlement()`** (new `SECURITY DEFINER`
trigger function, `AFTER INSERT ON mission_settlements`): resolves the settlement's mission →
`merchant_profile_id`, looks up `merchant_budgets`. No row, or `enforced = false` → no-op.
When enforced: `select ... for update` on the budget row (serializing concurrent approvals
against the same budget), raise `currency_mismatch` if the budget's `currency` differs from
the settlement's `amount_currency`, raise `insufficient_budget` if
`balance < paid_fee_amount`, otherwise debit the balance and insert one
`merchant_budget_transactions` row (`kind='debit'`, signed negative `amount`,
`balance_after`, `source_ref = 'settlement:' || settlement id`). The `source_ref` unique
constraint makes even a hypothetical replay idempotent. Unlike R11.1's notification-style
triggers, this one deliberately does NOT swallow exceptions — blocking the transaction is its
entire job. Scope note: the trigger keys off the settlement row's own fields plus the
mission's `merchant_profile_id`; affiliate settlements (`affiliate_network_event_id` set,
`mission_participant_id` null) and bookings never reach it because only fee settlements carry
`paid_fee_amount` from the R10.1 mint path — the guard mirrors that mint trigger's own
conditions.

**2. Ops funding RPCs**, modeled on `admin_set_settlement_status`'s shape, both
`is_active_ops_role('admin')`-gated and audited via `ops_audit_log_append`:

- `admin_credit_merchant_budget(p_merchant_profile_id uuid, p_amount numeric, p_reason
  text)` — upserts the budget row on first credit (ops never needs a separate "create"
  action); positive amounts ledger as `topup`, negative as `adjust`; a negative adjustment
  is floor-checked up front so `balance >= 0` surfaces as a clean `insufficient_budget`
  exception, not a raw constraint error (the same guard class R11.0's `bad_reason_category`
  established).
- `admin_set_budget_enforcement(p_merchant_profile_id uuid, p_enforced boolean, p_reason
  text)` — flips the flag; raises `not_found` if no budget row exists yet (enforcement
  without funding is meaningless — credit first).

**3. Reads:**

- Merchant dashboard reads its own budget + ledger directly via owner-scoped RLS policies
  (merchant via `merchant_profiles.user_id = auth.uid()`, plus active ops).
- `funded_merchant_profiles()` (`stable SECURITY DEFINER`, `grant execute to
  authenticated`) backs the creator-facing badge — see Decision 3.

**Error handling:** `insufficient_budget` and `currency_mismatch` get friendly copy in both
the merchant's `reviewSubmissionAction` and ops' `reviewSubmissionOpsAction` error maps. An
unfunded auto-approval needs no new handling: R11.1's trigger already wraps its work in
`exception when others then raise warning`, so the approval is skipped with a logged warning
and the submission stays in the review queue for a human — who then sees the friendly error
until the budget is funded.

## Schema

**`merchant_budgets`**: `id uuid pk`, `merchant_profile_id uuid not null unique references
merchant_profiles(id) on delete cascade`, `balance numeric(12,2) not null default 0 check
(balance >= 0)`, `currency text not null default 'HKD'`, `enforced boolean not null default
false`, `created_at`/`updated_at`. RLS: SELECT for the owning merchant and active ops; zero
client writes (`revoke all` from public/anon/authenticated, `grant select` to authenticated
behind the policies — writes happen only inside definer functions).

**`merchant_budget_transactions`**: `id uuid pk`, `merchant_budget_id uuid not null
references merchant_budgets(id)`, `kind text not null check (kind in
('topup','debit','adjust'))`, `amount numeric(12,2) not null` (signed delta), `balance_after
numeric(12,2) not null check (balance_after >= 0)`, `source_ref text unique` (nullable —
multiple ops credits are fine; debits always set it), `reason text`, `created_at`. Read
scoping mirrors the budget row's (join through `merchant_budgets` → `merchant_profiles`);
append-only via grants. Indexed `(merchant_budget_id, created_at desc)` for the ledger view.

## UI

- **Merchant dashboard**: a read-only Budget panel — balance + currency, enforced state, and
  recent ledger rows — following the merchant dashboard's existing page/panel conventions.
- **Ops merchant detail page**: a Budget panel with a credit form (amount + reason) and an
  enforcement toggle, wired to the two RPCs — the RPCs need a surface to be usable.
- **`/studio/missions`**: a "Funded" badge on paid/hybrid missions whose
  `merchant_profile_id` is in `funded_merchant_profiles()`'s result.
- **i18n**: new keys across all 7 locales as the usual dedicated task.

## Testing

- **Migration-text contract tests** for both tables, the trigger, and all three RPCs — the
  established `db.*.test.ts` style.
- **Unit/component tests** for the new queries, actions, panels, and badge.
- **Live proof** (local stack only, never production): the roadmap's exact acceptance case —
  enforced HK$100 budget + HK$150 fee approval fails atomically (submission still
  `submitted`, no settlement row, no debit, no ledger row); a funded approval debits exactly
  once with correct `balance_after`; a revision-flap re-approval (approve → request_revision
  → resubmit → approve) never double-debits; unenforced and no-budget-row merchants behave
  exactly as today; an unfunded auto-approval leaves the submission in the queue; RLS —
  merchant reads own budget/ledger only, an unrelated merchant reads nothing; both ops RPCs
  reject non-admin callers. Fixed seed ids must use a UUID block disjoint from every existing
  `*.rls.test.ts` file (grep first, per the documented gotcha), or `randomUUID()`.
