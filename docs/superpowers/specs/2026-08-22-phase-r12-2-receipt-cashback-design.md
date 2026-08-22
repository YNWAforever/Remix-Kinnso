# Phase R12.2 — Receipt-Based Cashback Missions — Design

**Status:** Approved by user 2026-08-22, pending implementation plan.

## Goal

Give merchants a redemption fallback for visitors who won't scan a QR code (R12.0) and
whose visit isn't a bookable experience: a creator submits a photo of their receipt from
the merchant, a human reviewer approves or rejects it, and an approved receipt mints a
flat cashback settlement for the creator — repeatable across multiple visits, not a
one-time claim.

## Context

R12.2 is the third and final sub-phase of R12 ("The Visit Loop") in the R10–R13 roadmap
(`~/Downloads/kinnso-roadmap-r10-r13.md`), following R12.0 (offer/claim/QR redemption MVP)
and R12.1 (attribution hardening + merchant ROI, PR #124, shipped 2026-08-22). Per the
roadmap: "Receipt-based cashback missions (fallback where QR fails): new mission type
reusing the R11 review queue — receipt photo as milestone proof, ops/merchant review with
reason categories; settlement minted on approval via the R10.1 trigger." R12.2 depends
only on R11.0 (the ops mission review queue), not on R12.0/R12.1, per the roadmap's
dependency graph — it could in principle have shipped independently, but is sequenced
here per the user's own stated phase ordering.

## Decisions made during brainstorming

1. **Repeatable, not one-shot.** A creator can submit a new receipt any time the mission
   is live, each reviewed and settled independently — QR redemption itself is repeatable
   (any visit), so a fair fallback needs to be too. This is the single decision that
   shapes everything else in this design, since today's `mission_milestone_submissions`
   table enforces exactly one submission per (milestone, participant) pair.
2. **Repeatable milestones via a relaxed constraint, not a new table or dynamically-spawned
   milestone rows.** `mission_milestones` gains a `repeatable boolean` flag; the existing
   hard `unique (mission_milestone_id, mission_participant_id)` constraint becomes a
   partial unique index that only applies to non-repeatable milestones. Submissions still
   live in `mission_milestone_submissions`, so the R11.0 review queue, the
   `admin_review_submission` RPC, and (with one addition — see Decision 4) the R10.1
   settlement trigger all keep working with no parallel infrastructure. A dedicated new
   table was rejected because it would duplicate the review queue rather than reuse it,
   contradicting the roadmap's own framing; dynamically spawning a fresh `mission_milestones`
   row per receipt was rejected because that table is meant to represent a mission's fixed,
   designed deliverables (e.g. "post an Instagram photo"), and generating rows per receipt
   would blur that meaning everywhere else the table is read.
3. **Flat cashback amount per approved receipt**, mission-configured, reusing
   `missions.paid_fee_amount` (the same field the existing `paid` mission type already
   uses) rather than a percentage-of-spend model. Simpler, predictable for merchant
   budgeting, and merchants who want a spend cap can already opt into R11.2's budget
   enforcement.
4. **A genuinely new settlement `source`, not literal reuse of R10.1's trigger unchanged.**
   R10.1's `create_mission_settlement_on_approval` enforces (via
   `mission_settlements_participant_fee_uniq`, a real unique index) exactly one
   `source = 'mission_fee'` settlement per participant, ever — correct for one-shot paid
   missions, but directly incompatible with a repeatable mission type where every approved
   receipt needs its own settlement. The roadmap's "settlement minted on approval via the
   R10.1 trigger" undersells the actual work needed: the trigger gains a branch for
   `mission_type = 'receipt_cashback'` that inserts with `source = 'receipt_cashback'`
   against a new, submission-scoped unique index instead of the participant-scoped one —
   so multiple receipts each mint their own settlement, but the same receipt submission
   can never double-settle (e.g. via a re-review or a retried approval).
5. **New, receipt-specific rejection reason taxonomy.** R11.0's existing categories
   (`format/key_message/compliance/quality/other`) were built for social-post proof and
   don't fit a receipt rejection. Receipt-cashback submissions get their own set —
   `unreadable / wrong_venue / duplicate / amount_unclear / other` — enforced so a
   receipt-cashback submission can only be rejected with a receipt-shaped reason, and
   every other mission type keeps using the existing taxonomy unchanged.
6. **A mission-configured, optional per-creator cap** (`missions.max_receipts_per_creator`),
   enforced at submission time — not review time — by counting the participant's own
   `('submitted','approved')` rows against the repeatable milestone under a row lock, the
   same "active-count vs. limit" pattern `claim_offer` (R12.0) already uses for
   `per_visitor_limit`. This exists specifically because there is no OCR/auto-matching in
   v1 (explicitly deferred, per the roadmap) — a human reviewer is the only fraud check,
   so an unbounded submission volume from one creator is a real risk a merchant should be
   able to cap. Off by default (`null`).

## Out of scope

- **OCR / automated receipt-to-spend matching** — explicitly deferred per the roadmap.
  Amount is not captured or validated against the receipt image; reviewers judge
  authenticity visually.
- **POS integrations** — explicitly deferred per the roadmap.
- **Percentage-of-spend cashback** — flat amount only in v1 (Decision 3).
- **Converting an existing paid/hybrid mission into `receipt_cashback` after creation** —
  `mission_type` is set once at creation and immutable, avoiding any need to migrate or
  reinterpret already-minted settlements. A merchant who wants receipt-cashback creates a
  new mission.
- **A cap enforced at review/approval time** — the cap is a submission-time gate only
  (Decision 6); this keeps the review queue free of submissions that were never going to
  be approvable, rather than making reviewers discover the cap after the fact.
- **Device fingerprinting, geofencing** — same v1 exclusions R12.0 already carries for
  QR redemption fraud posture; unchanged here.

## Architecture

**Mission type and milestone.** A merchant/ops creates a mission with
`mission_type = 'receipt_cashback'`. Creation auto-creates a single `mission_milestones`
row flagged `repeatable = true`, titled "Submit a receipt" — there is exactly one
milestone per receipt-cashback mission, submitted against repeatedly, rather than the
fixed multi-milestone checklist other mission types use.

**Submission.** A creator who is an active `mission_participants` row on the mission
uploads a receipt photo through a new (or widened) submission RPC, reusing the existing
`proof_urls text[]` column — no new storage mechanism needed, since photo upload already
works for social-proof submissions. The RPC checks `max_receipts_per_creator` (if set)
under a row lock before inserting, counting only the participant's own
`submitted`/`approved` rows against the repeatable milestone (a rejected receipt frees up
a slot, so a genuine retry is never blocked by the cap).

**Review.** The submission appears in the existing `/admin/missions/[missionId]` detail
view and `/admin/missions/review` queue exactly like any other submission — merchant
reviews first, ops handles SLA breach or dispute, matching R11.0's established pattern
unchanged. `admin_review_submission`'s reason-category argument is validated against the
receipt-specific taxonomy (Decision 5) when the submission's milestone is a repeatable
receipt milestone, and against the existing taxonomy otherwise.

**Settlement.** On approval, `create_mission_settlement_on_approval` (widened per
Decision 4) inserts a `mission_settlements` row with `source = 'receipt_cashback'` and
amount from `missions.paid_fee_amount`, guarded by a new
`mission_settlements_submission_receipt_uniq` partial unique index scoped to the specific
`mission_milestone_submission_id` rather than the participant — so the existing
participant-scoped `mission_fee` guarantee for other mission types is completely
untouched, while receipt settlements are guaranteed exactly-once per approved receipt.
From there the settlement flows into R10.2's existing payout pipeline and R10.3's
existing notification, unchanged.

**Budget interaction.** R11.2's merchant budget enforcement is orthogonal: if a merchant
has enforcement on, an approval that would exceed the remaining budget still fails
atomically before the settlement insert, exactly as it does today for paid/hybrid
missions — no special-casing needed for receipt-cashback.

## Schema

- `missions`: add `max_receipts_per_creator integer` (nullable, no default constraint
  beyond `>= 1` when set). `paid_fee_amount` is reused for receipt-cashback's per-receipt
  amount — no new amount column.
- `mission_milestones`: add `repeatable boolean not null default false`.
- `mission_milestone_submissions`: the existing
  `unique (mission_milestone_id, mission_participant_id)` constraint is replaced with a
  partial unique index that only applies where the referenced milestone is
  `repeatable = false` (exact implementation — a partial index keyed off a subquery, or a
  denormalized `repeatable` column copied onto the submission row at insert time to keep
  the partial index a simple column check — to be finalized during planning, whichever
  reads more clearly and performs better against the real table). No other column changes;
  `proof_urls`, `notes`, `merchant_feedback`, and the existing review timestamps all
  already fit a receipt submission as-is.
- `mission_milestone_submissions` (or wherever the reason-category column actually lives —
  confirm exact location during planning, since R11.0's design summary describes it as an
  argument to `admin_review_submission` rather than necessarily a submission column):
  widen whatever check constraint validates the reason category so a receipt-cashback
  submission only accepts the new taxonomy and every other mission type keeps the existing
  one — exact mechanism (a `CHECK` reaching across to the mission's type via a stored
  function, or a trigger-level guard if a plain `CHECK` can't reach across tables) to be
  finalized during planning against the real, current schema.
- `mission_settlements`: add `'receipt_cashback'` to the existing `source` check
  constraint; add a `mission_milestone_submission_id uuid references
  mission_milestone_submissions(id)` column if one does not already exist (confirm during
  planning against the real, current `mission_settlements` schema); add
  `mission_settlements_submission_receipt_uniq` — a partial unique index on
  `mission_milestone_submission_id where source = 'receipt_cashback'`.
- `create_mission_settlement_on_approval` (from R10.1's deployment migration): widened
  with a branch for `mission_type = 'receipt_cashback'`, inserting against the new
  submission-scoped index instead of the existing participant-scoped
  `mission_settlements_participant_fee_uniq`, which remains completely untouched for
  `mission_fee`-sourced settlements.

## UI

- Merchant mission-creation flow: a new `receipt_cashback` option alongside
  `coupon_affiliate`/`hybrid`/`paid`, with fields for the per-receipt cashback amount
  (reusing the existing paid-fee-amount field/label, relabeled contextually) and the
  optional max-receipts-per-creator cap.
- Creator-facing submission UI: a "Submit a receipt" action on the mission (distinct from
  the existing fixed-milestone-checklist UI other mission types show), allowing repeated
  submissions while the mission is live, showing remaining cap (if set) and past
  submission history/status.
- Ops/merchant review queue: existing `/admin/missions/review` and
  `/admin/missions/[missionId]` views gain the receipt-specific reason-category options
  when reviewing a receipt-cashback submission; no new page.
- i18n: new strings for the mission-type label, the cap field, the receipt reason
  categories, and the creator-facing submission UI, added across all 7 locales.

## Testing

- **Migration-text contract tests** for every schema change above (established pattern
  from R10–R12.1: constraint swaps, new columns, new indexes).
- **Live-proof tests** (local Supabase stack only, never production, per project
  convention): a repeatable milestone's submission constraint genuinely allows multiple
  rows per participant while a non-repeatable milestone's constraint is provably
  unaffected; the per-creator cap is race-safe under concurrent submission attempts (two
  simultaneous submissions can't both squeeze past the cap); a rejected receipt does not
  count against the cap and a subsequent resubmission succeeds; two approval attempts (or
  a re-review) on the same submission never produce two settlement rows; an existing
  paid/hybrid mission's one-settlement-per-participant guarantee is provably untouched by
  the trigger's new branch; a receipt-cashback submission rejected with an
  existing-taxonomy reason (or vice versa) is rejected by the constraint/guard.
- **Unit tests**: the submission RPC's cap-check logic; the reason-category
  validation for both taxonomies.
