# Phase R11.1 — Verification-Gated Triage — Design

**Status:** Approved by user 2026-08-20. Implementation plan written 2026-08-20
(`docs/superpowers/plans/2026-08-20-phase-r11-1-verification-triage.md`), which surfaced two
corrections to this doc, made without re-approval since both are factual/technical rather than
product decisions (full reasoning in the plan's own "Spec deviations found while writing this
plan" section):

1. The queue's confidence sort/badges are NOT migration-free as the Architecture section below
   claims — `getReviewQueue()` reads `mission_verification_jobs` via the ops user's own session,
   not a `SECURITY DEFINER` RPC, and that table's only RLS policy scopes reads to
   `creator_id = auth.uid()`. An ops session could never see this data at all until a new SELECT
   policy is added.
2. The auto-approval trigger (Schema section) does NOT call `ops_audit_log_append` — that
   function itself requires a resolvable `auth.uid()` (raises `forbidden` otherwise) and
   `ops_audit_log.actor_ops_member_id` has no representation for a non-ops actor.
   `mission_review_events` (`actor_type='system'`) is this action's complete audit trail on its
   own.

## Goal

Give ops queue ordering and badges driven by verification confidence, a "re-run
verification" action for low-confidence submissions, an opt-in per-mission auto-approve
policy for `verified_signal` proofs, and a lightweight attention feed (`admin_mission_attention()`)
surfacing overdue reviews and at-risk missions — without any human action required when
policy is on, and with zero auto-approvals when it's off.

## Context

This is R11.1, the second sub-phase of R11 ("Mission Control") in the R10–R13 roadmap
(`~/Downloads/kinnso-roadmap-r10-r13.md`), the direct successor to R11.0 (ops mission detail
+ submission review queue, PR #114). Every part of R11.1's scope builds directly on R11.0's
queue, `admin_review_submission` RPC, and `mission_review_events` table — none of which exist
on `main` yet, since PR #114 is still open. Per the user's explicit decision, this branch is
cut directly from `docs/r11-0-mission-review-design` rather than `main`, accepting the
now-familiar stacked-branch risk (if R11.0 merges via squash before R11.1 lands, this branch
will need the cherry-pick-onto-fresh-main treatment already proven four times in this
program) in exchange for being fully buildable and live-verifiable today.

**Deviations from the roadmap's literal text, resolved during brainstorming:**

1. **"Rising creators" dropped from `admin_mission_attention()`.** The roadmap names three
   attention categories (overdue reviews, at-risk missions, rising creators) but never defines
   the third. The first two are concrete — `review_deadline` past due, and
   `admin_mission_analytics`'s existing `at_risk` heuristic. "Rising creators" is closer to a
   growth/marketing signal than something ops needs to act on in a review-triage queue, and
   inventing a definition now would be guessing at product intent no one has specified. Ships
   with two categories; a third can be added later against a real definition.

2. **"Re-run verification" calls the CREATE endpoint, not retry — corrected against real code,
   not the roadmap's literal wording.** The roadmap says this action calls the scan worker's
   "existing `POST /verify-submission`" — which is in fact correct, but brainstorming initially
   considered `POST /verify-submission/:jobId/retry` instead (semantically closer to "re-run"),
   until reading `handleVerifyRetry`'s actual implementation
   (`apps/scan/src/verify-server.ts`) showed it rejects any job whose `status` isn't `'failed'`
   with a 409. A submission needing re-verification because its confidence came back
   `needs_review`/`unavailable` has `status='ready'` (the pipeline completed; it just wasn't
   confident) — not `'failed'`. The retry endpoint would reject exactly the case this action
   exists for. `POST /verify-submission` (unconditional create, matching the roadmap after
   all) is correct.

3. **A new architectural gap found and resolved: the scan worker's endpoints are
   creator-only today, with no path for ops at all.** `handleVerifySubmission` and
   `handleVerifyRetry` both gate on `ownerId !== userId` / `job.creator_id !== userId` — the
   authenticated caller must literally be the submission's own creator. `getVerifiedUser`
   itself is role-agnostic (any valid Supabase JWT), so this restriction is each handler's own
   business logic, not an auth-layer gap. An ops caller today gets a 404 "submission not
   found" (deliberately vague, not "forbidden"). Per the user's decision,
   `handleVerifySubmission` is widened to also accept an active ops caller, alongside the
   existing creator-ownership check — this is the one piece of R11.1 that touches `apps/scan`
   rather than staying inside `apps/web` + Postgres.

## Out of scope

- New verification providers or platforms.
- Changing the scan worker's rate-limit policy (`apps/scan/src/policy.ts` stands as-is; its
  daily cap is in-process and resets on worker restart — a known, accepted limitation, not
  something this phase touches).
- Widening `handleVerifyRetry` for ops — only the create endpoint needs ops access, per
  deviation #2 above.
- A "rising creators" attention category — deviation #1.
- Any change to `admin_review_submission` itself — auto-approval is a separate, new
  `SECURITY DEFINER` function, not a modification to the existing ops-gated RPC (see
  Architecture).

## Architecture

Three independent pieces, each following an established pattern already proven elsewhere in
this codebase:

**Queue ordering + badges** is a pure client/query change — R11.0 already joins each
submission's latest `mission_verification_jobs.confidence_status` into `getReviewQueue()`'s
output as a display-only field. R11.1 sorts by it (confidence bucket first, `review_deadline`
as the tiebreak within a bucket) and replaces the current plain-text label with a real badge
component. No migration.

**Auto-approval fires as a database trigger, not a queue-time or polling check** — matching
R10.1's settlement-minting-via-trigger and R10.3's notification-trigger precedent exactly,
both chosen in this codebase specifically to avoid staleness windows and polling overhead. A
new `AFTER UPDATE ON mission_verification_jobs` trigger fires only on the specific transition
into `status='ready', confidence_status='verified_signal'`, checks the owning mission's new
`auto_approve_policy` column, and — only when it's `'verified_signal_only'` and the
submission is still `status='submitted'` (the same CAS precondition `admin_review_submission`
uses, so a submission a human has already decided is never silently overridden) — performs
the identical status-transition, `mission_review_events` (`actor_type='system'`), and
`ops_audit_log_append` writes `admin_review_submission` performs for a human approval. This is
deliberately a SEPARATE `SECURITY DEFINER` function from `admin_review_submission`, not a
reuse of it: `admin_review_submission` is hard-gated to `is_active_ops_role('admin')` with a
human caller's `auth.uid()`, and a trigger-fired system action has neither.

**Re-run verification and the attention feed stay inside existing surfaces.** The queue's
"re-run verification" button calls the (now ops-widened) `POST /verify-submission` with the
submission's id. `admin_mission_attention()` is a new read-only RPC, gated by the same
`is_active_ops()` check `admin_mission_analytics` already uses, returning
`{overdue_reviews, at_risk_missions}` — the second bucket reuses `admin_mission_analytics`'s
existing `at_risk` subquery logic near-verbatim, which already benefits from R11.0's widened
merchant-source-agnostic scope.

## Schema

**`missions.auto_approve_policy`** (new column): `text not null default 'off' check
(auto_approve_policy in ('off', 'verified_signal_only'))`. No RLS change to `missions` itself
— reads flow through existing paths; writes go through the new setter RPC below.

**`notify_verification_auto_approve()`** (new trigger function, `AFTER UPDATE ON
mission_verification_jobs`, `SECURITY DEFINER`, `set search_path = public`): guard clause is
`new.status = 'ready' and new.confidence_status = 'verified_signal' and (old.status,
old.confidence_status) is distinct from (new.status, new.confidence_status)` — the second half
prevents re-firing on an unrelated column update to an already-verified-signal row (e.g., if
this table ever gains other mutable columns later). Resolves `submission_id` via
`mission_milestone_submission_id`, then the owning mission via the same join chain
`admin_review_submission`/`mission_review_events`'s RLS policy already use. Checks
`missions.auto_approve_policy = 'verified_signal_only'` and
`mission_milestone_submissions.status = 'submitted'`; if either fails, the trigger is a no-op
(`return new`). On match: `update mission_milestone_submissions set status = 'approved',
reviewed_at = now()` (no `reviewed_by` — no human reviewer), then an insert into
`mission_review_events` (`actor_type='system'`, `actor_id=null`, `action='approve'`,
`reason_category=null`, `reason_text=null`) and a `perform ops_audit_log_append(...)` call —
each wrapped in its own `begin/exception when others then null` block, so neither the audit
trail nor the event log can ever roll back the verification job's own status write (the
trigger's actual purpose), matching R10.3's established "side-effect write must never roll
back the triggering transaction" principle.

**`admin_set_mission_auto_approve_policy(p_mission_id uuid, p_policy text)`** (new RPC,
`is_active_ops_role('admin')`): validates `p_policy in ('off', 'verified_signal_only')` up
front (raising a clean `bad_policy` exception, not relying on the column's own check
constraint to surface a raw Postgres error — the exact class of gap R11.0's own review caught
once already), updates the column, and calls `ops_audit_log_append('mission',
p_mission_id, 'mission.auto_approve_policy', null, jsonb_build_object('policy', p_policy))`.

**`admin_mission_attention()`** (new RPC, `stable`, `is_active_ops()`): returns `jsonb`.
`overdue_reviews`: `mission_milestone_submissions` where `status = 'submitted' and
review_deadline < now()`, joined for mission title and creator id, ordered by how overdue
(oldest deadline first), capped at 50. `at_risk_missions`: the same three-reason
(`verification_failed`, `stalled_submissions`, `published_no_participants`) heuristic
`admin_mission_analytics`'s own `at_risk` subquery already computes, factored out or
duplicated verbatim (implementation's call, no architectural weight either way) — no longer
filtered to `mission_source = 'merchant'`, inheriting R11.0's widening automatically since it
reads the same underlying tables.

## `apps/scan` change

`handleVerifySubmission` (`apps/scan/src/verify-server.ts`) currently rejects any caller whose
`id` doesn't match the submission's `mission_participants.creator_id`. It gains a second,
`or`-ed check: an active ops member (querying `kinnso_ops_members` for the caller's id with
`status = 'active'`, mirroring `is_active_ops()`'s own Postgres-side check, ported to this
worker's own Supabase client) is now also accepted. `handleVerifyRetry` is explicitly left
unchanged, per deviation #2 — nothing in this phase calls it as an ops action.

## UI

Each queue row's confidence display becomes a real badge: `verified_signal` → a green
"Verified" pill; `needs_review` → an amber "Needs review" pill plus a "Re-run verification"
button; `unavailable`/`null` → a grey "Unavailable" pill plus the same button. Sort order
changes from `review_deadline`-only to confidence-bucket-first (`verified_signal`, then
`needs_review`, then `unavailable`/`null`), `review_deadline` ascending as the tiebreak within
each bucket. The mission detail page (R11.0) gains a small ops-only `auto_approve_policy`
toggle near the mission summary, wired to the new setter RPC. `admin_mission_attention()`'s
two buckets render as two small lists on the existing `/admin/missions` overview page,
visually matching the page's current `at_risk` list.

## Testing

- **Migration-text contract tests** for the new column, the trigger function, and both new
  RPCs — same style as every prior phase's `db.*.test.ts` files in this program.
- **Live proof** (new file or an extension of `mission-review.rls.test.ts` — implementation's
  call): with `auto_approve_policy = 'verified_signal_only'`, a submission whose latest
  verification job transitions to `ready`/`verified_signal` auto-approves with zero human
  action, a `mission_review_events` row with `actor_type='system'`, and an `ops_audit_log`
  row. With policy `off` (the default), an identical job transition leaves the submission
  untouched — the roadmap's explicit "default-safety" acceptance criterion. The trigger does
  not fire on an unrelated update to an already-`verified_signal` row. `admin_mission_attention()`
  returns correctly-scoped `overdue_reviews`/`at_risk_missions` rows.
- **`apps/scan` test** (that app's own existing Vitest conventions, not this program's
  Supabase-RLS-proof style): an active ops caller can now reach `handleVerifySubmission` for a
  submission they don't personally own; an unrelated non-ops caller still cannot.
- **Component/host tests** for the badge/sort change and the auto-approve-policy toggle,
  following R11.0's own `MissionReviewQueueView`/`MissionDetailView` test conventions.

## Open questions left to the implementation plan (not architectural, safe to decide inline)

1. Whether `admin_mission_attention()`'s `at_risk_missions` logic is factored out into a
   shared SQL function `admin_mission_analytics` also calls, or duplicated verbatim in the new
   RPC — no behavioral difference, a maintainability call the implementer can make with the
   real SQL in front of them.
2. Exact badge/pill visual treatment (colors, icon or text-only) — no strong existing
   three-state badge convention in this codebase to follow (R11.0's queue only had a two-state
   display-only label), so this is a small new pattern to design at implementation time.
3. Whether the mission detail page's policy toggle is a simple `<select>` or a styled toggle
   switch — implementation detail, no architectural weight.
