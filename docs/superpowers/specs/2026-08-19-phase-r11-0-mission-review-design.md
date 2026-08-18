# Phase R11.0 — Ops Mission Detail + Submission Review Queue — Design

**Status:** Approved by user 2026-08-19, pending implementation plan.

## Goal

Give ops two new surfaces — a mission detail drill-down and a submission review queue —
backed by a properly audited `admin_review_submission` RPC, so that (a) the
`submissions_awaiting_review` count on `/admin/missions` links to a queue where every row is
actionable, (b) every review decision (merchant or ops) writes an append-only event plus an
`ops_audit_log` row, and (c) a rejection or revision-request without a reason category is
impossible at the database level, not just the UI.

## Context

This is R11.0 in the R10–R13 roadmap (`~/Downloads/kinnso-roadmap-r10-r13.md`), the first
sub-phase of R11 ("Mission Control"), and the direct successor to R10.3 (notifications
backbone, PR #113). R10.0–R10.3 are all shipped or in review; none of R11.0's own scope
depends on any of them being merged first — it depends only on tables/RPCs that already exist
on `main` (`mission_milestone_submissions`, `mission_verification_jobs`,
`mission_social_snapshots`, `admin_mission_analytics`, `ops_audit_log`,
`is_active_ops_role`), so this branch is rooted cleanly at current `main` with no stacking
risk.

**Deviation the roadmap left open, resolved during brainstorming:**
1. Reason-category taxonomy — adopts Adfocate's five categories as-is
   (`format`/`key_message`/`compliance`/`quality`/`other`), rather than inventing
   Kinnso-specific ones. Kinnso's mission model (coupon/affiliate/travelpayouts sourcing)
   doesn't need different categories from Adfocate's; the categories describe *what's wrong
   with a submission*, not *how the mission was sourced*, so they transfer directly.
2. Review-action placement — available on **both** the mission detail page and the dedicated
   queue, sharing one review-action component. The queue is for triage-at-scale; the detail
   page is for context-heavy decisions where ops wants the mission's full history (settlements,
   partner links, other participants) visible while deciding.
3. Verification-data scope boundary against R11.1 — R11.0 joins to
   `mission_verification_jobs`/`mission_social_snapshots` and shows `confidence_status` as a
   **display-only badge**; queue sort order stays deadline-ascending (soonest-due first), not
   confidence-driven. R11.1 (a separate, later phase) is explicitly where confidence-based
   sorting/highlighting and auto-approval land — pulling that forward here would expand this
   phase's scope beyond what its own acceptance criteria call for.

## Out of scope

- Removing merchant review — merchants stay the first reviewer; ops acts on SLA breach or
  dispute (per the roadmap; the underlying product question of exactly when ops should
  intervene is R11's own §6 open question, not something this phase's UI needs to enforce).
- Confidence-driven queue ordering, badges beyond plain display, and auto-approval — R11.1.
- Merchant budget enforcement on approval — R11.2.
- Changing the merchant-side `reviewSubmissionAction`/`reviewSubmission()` state machine — it
  keeps working exactly as today; R11.0 adds a parallel, more heavily audited ops path that
  happens to reuse the same transition *rule* (submitted → approved/rejected/revision_requested)
  but not the same code path, since the ops path's requirements (reason category, event log,
  audit log, RPC-only write) go well beyond what the merchant action does or should do.

## Architecture

Today, submission review is a single, lightly-audited path: `reviewSubmissionAction`
(`apps/web/lib/missions/actions.ts`) does a plain CAS'd `.update()` on
`mission_milestone_submissions`, using `reviewSubmission()`'s pure state-transition function
(`apps/web/lib/missions/state.ts`) to compute the next status. This stays exactly as-is for
merchants.

Ops review needs materially more: a reason *category* (not just free text), a database-level
guarantee that rejections/revision-requests can't skip it, an append-only trail distinct from
`ops_audit_log`'s free-form entries (queryable per-submission, in Adfocate's
`mission_workflow_events` grammar), and the RPC-gated write pattern this codebase already uses
for every other ops action that touches something creator/merchant-facing (R10.2's
`admin_create_payout_batch` et al. are the direct precedent — plain client updates were
explicitly moved off this exact class of action once before, for the same audit reasons).
`admin_review_submission` is therefore a new `SECURITY DEFINER` RPC — gated by
`is_active_ops_role('admin')`, matching every other admin-write RPC in this codebase — that
reuses `reviewSubmission()`'s transition *rule* but not its code path.

## Schema

**`mission_review_events`** (new, append-only):

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `submission_id` | `uuid not null references public.mission_milestone_submissions(id) on delete cascade` | |
| `actor_type` | `text not null` | one of `creator`, `merchant`, `ops`, `system` — Adfocate's `mission_workflow_events` actor grammar |
| `actor_id` | `uuid` | null for `system`-actor rows (e.g. a future auto-approval) |
| `action` | `text not null` | `approve` / `reject` / `request_revision` |
| `reason_category` | `text` | one of the five Adfocate categories; required by a check constraint whenever `action` is `reject` or `request_revision` |
| `reason_text` | `text` | free text, optional even when a category is required |
| `created_at` | `timestamptz not null default now()` | |

Every review decision — merchant *or* ops — writes exactly one row here going forward
(`reviewSubmissionAction` gains one insert alongside its existing update; `admin_review_submission`
writes its own). This gives a single, unified audit trail regardless of who decided, which is
what the mission detail page's history section reads from.

RLS: `select` for the submission's participant creator, the owning merchant, and ops; no
`insert`/`update`/`delete` grant to any client role — every row comes from a trigger-adjacent
RPC/action path, not direct client writes (mirrors the `notifications` table's zero-insert-grant
shape from R10.3).

**`mission_milestone_submissions.review_deadline`** (new column): `timestamptz`, defaulted to
`submitted_at + interval '48 hours'` via a trigger fired on the same `submitted_at`-setting
event this table already has (mirrors `create_booking_settlement_on_confirm`'s
trigger-derives-a-column pattern, `20260704140000`), plus a one-time backfill migration for
existing `submitted`/`revision_requested` rows using their actual `submitted_at`.

**`admin_review_submission(p_submission_id uuid, p_action text, p_reason_category text, p_reason_text text)`**
— `SECURITY DEFINER`, gated by `is_active_ops_role('admin')`. In one transaction: CAS's the
submission's `status = 'submitted'` (raises a distinguishable error, e.g. `stale_status`, on
mismatch — the queue's "every row is actionable" promise depends on this being loud, not
silently no-op'd), applies the same transition rule `reviewSubmission()` encodes, requires
`p_reason_category` to be non-null when `p_action` is `reject`/`request_revision` (enforced
twice: once at the RPC level for a clean error message, once as a check constraint on
`mission_review_events` so the "impossible at the DB level" acceptance criterion holds even if
a future code path bypasses the RPC), writes the `mission_review_events` row, and appends an
`ops_audit_log` entry (`entity_type = 'mission_submission'`) with the acting ops member's id.

## Detail page — `/admin/missions/[missionId]`

Server component page reading a widened `admin_mission_analytics` (dropping the
`mission_source = 'merchant'` filter this RPC currently has, so travelpayouts-sourced missions
are visible here too — the gap the roadmap calls out by name) plus the mission's participants,
milestones, submissions, settlements, and partner links. Each submission row reuses the exact
same review-action component the queue uses (approve/reject/request-revision, same modal), so
ops can decide with the mission's full context in view rather than switching to the queue and
back.

## Review queue — `/admin/missions/review`

Table layout matching `CreatorPayoutsView.tsx`'s established convention exactly: status-filter
pills (`All` / `Overdue` / `Needs Revision`, computed from `review_deadline` and current
status), one row per submission in `submitted`/`revision_requested`, columns for mission,
creator, submitted-at, deadline (highlighted when overdue), a display-only verification badge
(✓ verified / ⚠ needs review / — unavailable, from `mission_verification_jobs.confidence_status`),
and inline actions. Approve is a single click, no modal. Reject/Request-revision opens a
centered modal — reason-category dropdown (required) + free-text field (optional) — mirroring
`CreatorPayoutsView`'s reason-required confirm-dialog pattern for money/audit-sensitive actions.
Default sort: `review_deadline` ascending (soonest-due first); no confidence-based reordering in
this phase.

## i18n

New keys under the existing `missionsOps`-style namespace (exact namespace TBD at
implementation time, following whatever the current `/admin/missions` page uses) for: queue
column headers, filter pill labels, the five reason-category labels, modal copy, and the
detail page's section headings. All ×7 locales, verified by the existing
`i18n.locale-parity.test.ts`.

## Testing

- **Migration-text contract tests** for the new table, column, check constraint, and RPC —
  same style as every prior phase's `db.*.test.ts` files.
- **Live RLS/CAS proof** (final task, mirroring `payout-batches.rls.test.ts`'s structure):
  two concurrent `admin_review_submission` calls on the same submission — exactly one wins,
  the other gets `stale_status`; a `reject` call with `p_reason_category = null` is rejected by
  the RPC; a hypothetical direct `insert into mission_review_events` with a `reject` action and
  no `reason_category` is rejected by the check constraint itself (proving the DB-level
  guarantee, not just the RPC's own validation); the participant creator, the owning merchant,
  and an unrelated ops member can each read `mission_review_events` rows they're entitled to
  and nothing else.
- **Component/host tests** for the detail page and the queue, following
  `CreatorPayoutsView`'s existing test conventions (status-pill filtering, modal open/cancel/
  confirm, reason-required validation).
- **Widened `admin_mission_analytics` regression check**: a seeded travelpayouts-sourced
  mission now appears in the detail page / analytics output it was previously filtered out of.

## Open questions left to the implementation plan (not architectural, safe to decide inline)

1. Exact i18n namespace/key names for the new copy.
2. Whether the "Overdue" filter pill computes client-side from `review_deadline` or via a
   dedicated query parameter server-side — mechanical choice, no user-facing difference.
3. Exact error code/message shape for the CAS mismatch (`stale_status` is a placeholder name,
   not a commitment) — follow whatever error-code convention `admin_create_payout_batch`
   established for its own CAS/idempotency conflicts.
