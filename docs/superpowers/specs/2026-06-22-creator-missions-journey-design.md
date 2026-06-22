# Creator Missions Journey — design

**Date:** 2026-06-22
**Status:** Approved (design); pending spec review → implementation plans
**Repo:** `kinnso-v3` (web app `apps/web`, scan worker `apps/scan`, DB package `@kinnso/db`)
**Builds on:** Merchant Brief Flow v1 (missions + milestones + settlements schema/domain), Slice 3d (Studio offers + earnings, the `/studio/missions` merchant-only refactor), Slice 3f (Market Passport UI system), Creator Studio dashboard, the DNA-scan worker (`apps/scan` + `creator_scan_jobs` + onboarding `LiveProgress` polling).

---

## Goal

Build the **creator's end-to-end missions journey** so a creator can do more than browse and join — they can track their work, submit a milestone with proof, get the post auto-verified, and follow it through to merchant approval. Today the loop is broken: `/studio/missions` is a flat list, `/studio/missions/[id]` is a `ComingSoon` stub, and there is **no creator-facing submission path at all** (the merchant review screen reads submissions that nothing creates).

The journey we are closing:

```
JOIN ──▶ (merchant approves, if paid/hybrid) ──▶ SUBMIT milestone ──▶ AUTO-VERIFY ──▶ merchant REVIEWS ──▶ [settlement]
 │            applied → active                     proof URL + notes    scan worker      approve / revise     ops-authored
 └─ coupon/affiliate = instant 'active'                                                                       (OUT of scope)
```

The creator journey **ends at merchant approval**. Settlements remain ops-authored (no auto-create exists anywhere in the codebase, and `/studio/earnings` already shows creators their read-only payout status).

Delivered as **three staged, independently shippable PRs**: Stage A (list) and Stage B (detail) need **no migration**; Stage C (submission + verification) carries one migration and the worker changes.

---

## Scope decisions (locked)

| Decision | Choice |
|---|---|
| Overall scope | **Everything end-to-end** — list polish + detail page + submission/verification, as one cohesive feature delivered in 3 staged plans. |
| Submission verification | **Auto-verify now via the scan worker** (not deferred). On submit, the worker fetches the post and writes a `mission_social_snapshot` with a `confidence_status`. |
| Verification tracking | **Dedicated `mission_verification_jobs` table**, mirroring `creator_scan_jobs` (queued/fetching/ready/failed + stored error + retry). Richer status and a clean retry path; carries one migration. |
| Settlement creation | **Out of scope** — ops-authored only. Creator journey ends at merchant approval; creator sees read-only status in `/studio/earnings`. |
| Submission insert auth | **Reuse existing RLS + trigger.** A creator can already insert `mission_milestone_submissions` for their own `active` participant; `enforce_mission_submission_integrity` blocks forged `status`/review fields. **No new submission policy.** |
| Snapshot + job writes | **Service-role only** (the worker). `mission_social_snapshots` has no insert RLS by design; `mission_verification_jobs` gets owner-`select` RLS, worker writes via service_role. |
| Web→worker call | **Browser → worker with Bearer token**, mirroring `POST /scan` from onboarding. Keeps RapidAPI/YouTube keys in the worker and the server action fast. |
| Partner-link generation | **Unchanged / out of scope** — stays in `/studio/offers` (Slice 3d). Detail page only *displays* coupon code / partner links. |
| Merchant review screen | **Unchanged** — it already reads `confidence_status` off `mission_social_snapshots`; correct snapshots make it "just work." |

---

## Architecture overview

```
apps/web (Studio, authenticated — creators only)

  /studio/missions          listCreatorMerchantMissions() → segmentMissions()
    ├─ My missions  (participant != null)   status + milestone progress → link to detail
    └─ Available    (participant == null)   Join (coupon/affiliate) | Apply (paid/hybrid)

  /studio/missions/[id]     getCreatorMissionDetail() → CreatorMissionDetailView
    ├─ not joined → Join / Apply (+ application note)
    ├─ applied    → "awaiting approval"
    └─ active     → milestone list, each with inline submit form + live verification

  submitMilestoneAction (user client) ── insert mission_milestone_submissions ('submitted')
        │  returns { ok, submissionId }
        ▼
  browser  POST {NEXT_PUBLIC_SCAN_URL}/verify-submission  (Bearer token, submissionId)
        ▼
apps/scan (worker, service_role)
  verify-submission handler → insert mission_verification_jobs ('queued')
    → verifySubmission(deps, jobId): fetchSinglePost(platform, url) → match author handle vs
      creator_social_handles → write mission_social_snapshot (confidence_status) → job 'ready'
    (fetch fails → snapshot confidence_status='unavailable', job 'ready'; worker error → job 'failed')
        ▼
  SubmissionVerification (client)  poll mission_verification_jobs (Realtime + 2s fallback)
    → 'ready'  → read snapshot confidence_status → Verified signal | Needs review | Couldn't verify
    → 'failed' → error + Retry  (POST /verify-submission/:jobId/retry)

  merchant /merchants/missions/[missionId] (unchanged) reads confidence_status → approves
  ops      /ops/settlements (unchanged) authors settlement → /studio/earnings (read-only)
```

All web reads/writes use the **user-scoped Supabase client**; RLS is the authorization boundary. The worker uses the **service-role** client (validating the Bearer token first via the anon client, exactly as `POST /scan` does at `apps/scan/src/server.ts:80-162`).

---

## 1. Stage A — Segmented missions list (`/studio/missions`)

### Data — `lib/missions/queries.ts`
Extend `creatorMissionSelect` to pull the creator's submissions so the list can show progress:

```
mission_participants(
  id, status, source, creator_id,
  mission_milestone_submissions(id, status)
)
```

`listCreatorMerchantMissions` is otherwise unchanged (published, `mission_source <> 'travelpayouts'`). RLS already scopes the nested participant + submissions to the viewing creator.

### Helper — `lib/missions/list.ts` (new, pure)
`segmentMissions(rows, creatorId)` → `{ mine: CreatorMissionListItem[], available: CreatorMissionListItem[] }`, where an item carries `participant` (status/source), `milestoneCount`, `submittedCount`, and the mapped `compensation`/type/source fields already produced by the host's projection helpers. A mission goes to `mine` when the creator has a participant row (any non-`cancelled`/`rejected` status surfaces with its label; `rejected` may show under available again or be filtered — decided in the plan), otherwise to `available`. Pure and unit-tested.

### Host — `app/[locale]/studio/missions/page.tsx`
Unchanged auth/role gate (`getUser` → redirect to sign-in; `resolveViewerRole !== 'creator'` → `notFound`). Maps rows with the existing projection helpers, calls `segmentMissions`, renders the refactored view.

### View — `components/kinnso/pages/CreatorMissionsView.tsx` (refactor)
Two bands — "My missions" and "Available missions" — using the existing `TicketCard` shell:
- **My missions** cards: title, source/type chip, `MissionStatusBadge` (participant status), milestone progress bar + "X / Y milestones submitted", compensation, link to detail (`Continue` / `View`).
- **Available** cards: title, type chip, compensation, `Details` + the type-driven primary action — `Join` (coupon/affiliate, instant `active`) or `Apply` (paid/hybrid, routes to merchant approval), matching `nextJoinStatus`.
- Per-band **empty states**.
- Keep the existing `onJoin` thunk + `action-result` error pattern (`role="alert"`, `router.refresh()` on success).

### i18n
Extend the existing **`missions`** group: band labels ("My missions" / "Available missions"), progress label, the participant status labels not already present, and the two empty-state strings.

---

## 2. Stage B — Mission detail (`/studio/missions/[id]`)

### Data — `lib/missions/queries.ts`
`getCreatorMissionDetail(supabase, missionId)` — a single mission selected by id with: `mission_milestones(id,title,description,due_at,sort_order)`, the creator's `mission_participants(id,status,source,application_note,...)`, that participant's `mission_milestone_submissions(id, mission_milestone_id, status, proof_urls, notes, merchant_feedback, submitted_at, reviewed_at, mission_social_snapshots(confidence_status, engagement_count, proof_url))`, `mission_verification_jobs(id, mission_milestone_submission_id, status, error)` (Stage C), and coupon/affiliate fields + `affiliate_partner_links`. RLS (`missions_visible_select`) guarantees the creator can read a published mission they can see; nested rows are creator-scoped.

### Helper — `lib/missions/detail.ts` (new, pure)
`toMissionDetailViewModel(row, creatorId)` → header (title, type, source, compensation, status), brief, the **participation CTA** (`'join' | 'apply' | 'awaiting' | 'rejected' | 'active'`) derived from participant status, the coupon/link block, and a `milestones[]` list where each milestone is joined to its submission + verification state (`'none' | 'verifying' | 'verified_signal' | 'needs_review' | 'unavailable' | 'submitted' | 'approved' | 'revision_requested' | 'rejected'`). Pure, unit-tested.

### Host — `app/[locale]/studio/missions/[id]/page.tsx` (replace `ComingSoon`)
Auth/role gate as above. Fetch detail, map to view model, render `CreatorMissionDetailView`. Wire server-action thunks: `join(missionId)` / `apply(missionId, note)` → `joinMissionAction`; `submitMilestone(input)` → `submitMilestoneAction` (Stage C).

### View — `components/kinnso/pages/CreatorMissionDetailView.tsx` (new, `'use client'`)
- **Header:** back link, title, type/source chip, `MissionStatusBadge`, `MissionCompensationSummary`.
- **Brief:** summary / description.
- **Participation branch:**
  - not joined → `Join` (coupon/affiliate) or `Apply` with an optional application-note textarea (paid/hybrid);
  - `applied` → "awaiting merchant approval" notice;
  - `rejected` → closed notice;
  - `active` → the milestone list.
- **Coupon / affiliate block** (when present): coupon code chip + copy, or partner-link display (read-only).
- **Milestone list:** each milestone is a `TicketCard`/row with title, description, due date, a state bullet (mirrors `LiveProgress` bullets), its submission state badges (`MissionStatusBadge` + `SocialSignalBadge`), and an inline **submission form** (Post URL + optional notes) when submittable, or `Resubmit` when `revision_requested`. Verification is rendered by `SubmissionVerification` (Stage C).

### i18n
New **`missionDetail`** group: back label, brief heading, milestones heading + counter, participation notices (awaiting/rejected), coupon/link labels, due-date label, and the per-milestone state labels.

---

## 3. Stage C — Submission + auto-verification

### 3.1 Migration — `mission_verification_jobs` (the one gated prod-DB step)
Mirrors `creator_scan_jobs` (`supabase/migrations/20260614000009_creator_tables.sql:25-37`):

```sql
create table public.mission_verification_jobs (
  id                              uuid primary key default gen_random_uuid(),
  mission_milestone_submission_id uuid not null references public.mission_milestone_submissions(id) on delete cascade,
  creator_id                      uuid not null references public.creators(id),
  platform                        text,
  proof_url                       text,
  status                          text not null default 'queued'
                                   check (status in ('queued','fetching','ready','failed')),
  confidence_status               text,            -- mirrors the resulting snapshot, for convenience
  error                           text,
  started_at                      timestamptz,
  completed_at                    timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
-- owner-select RLS (read-only for the creator; worker writes via service_role)
alter table public.mission_verification_jobs enable row level security;
create policy mission_verification_jobs_owner_select on public.mission_verification_jobs
  for select using (creator_id = auth.uid());
-- one active job per submission
create unique index mission_verification_jobs_one_active
  on public.mission_verification_jobs (mission_milestone_submission_id)
  where status in ('queued','fetching');
-- grants
grant select on public.mission_verification_jobs to authenticated;
revoke all on public.mission_verification_jobs from anon;
```

(Exact column set finalized in the plan; this mirrors the `creator_scan_jobs` lifecycle + the `mission_grants` / `…_single_active` precedents.)

### 3.2 Pure helpers (`lib/missions/`)
- `proof-url.ts` — `parseProofUrl(url)` → `{ platform: Platform, id: string } | null` (Instagram reel/post, Threads post, YouTube `watch?v=` / `youtu.be`).
- `submission-validation.ts` — `validateSubmission({ proofUrls, notes })` → `{ ok, errors }`: ≥1 non-empty `http(s)` URL, notes length bound. Mirrors `validateMissionDraft`.
- `submission-state.ts` — `canSubmit(participantStatus, submissionStatus)` and `nextSubmissionStatus(...)`; encodes "submit allowed only when participant `active` and milestone has no `submitted`/`approved` submission (or `revision_requested`)".

### 3.3 Server action — `lib/missions/actions.ts`
`submitMilestoneAction({ missionId, milestoneId, participantId, proofUrls, notes, locale })`:
- user-scoped client; validate via `submission-validation`;
- insert `mission_milestone_submissions` (`mission_milestone_id`, `mission_participant_id`, `proof_urls`, `notes`, `status: 'submitted'`, `submitted_at: now`) — permitted by existing RLS + the `enforce_mission_submission_integrity` trigger;
- return `{ ok: true, submissionId }` (or `{ ok: false, errors }`), following `KinnsoActionResult`.

No worker call from the server (keeps it fast); the browser kicks verification next.

### 3.4 Worker — `apps/scan`
- `src/fetchers.ts`: add `fetchSinglePost(platform, urlOrId)` to `RapidApiFetcher` (IG media info, Threads post info), `YouTubeFetcher` (`videos?part=snippet,statistics&id=`), and `CompositeFetcher`; add the same method to the `FakeFetcher` for tests. Extend the fetcher interface (or add a parallel `PostFetcher` interface) so DNA scanning is untouched.
- `src/server.ts`: `POST /verify-submission` — Bearer auth (`authClient.auth.getUser(token)`), then service-role: load the submission, **assert the creator owns it** (`mission_participants.creator_id === user.id`), parse the first verifiable `proof_url`, insert `mission_verification_jobs` (`queued`), return `202 { jobId }`; plus `POST /verify-submission/:jobId/retry` mirroring `/scan/:jobId/retry`.
- `src/pipeline.ts`: `verifySubmission(deps, jobId)` — job → `fetching`; `fetchSinglePost`; compute `confidence_status` (`verified_signal` when the post resolves and its author handle matches a `creator_social_handles` row for that platform; `needs_review` on a partial/ambiguous match; `unavailable` on fetch failure); write `mission_social_snapshots` (service_role, linked to submission/participant/mission); set job `ready` (+ mirror `confidence_status`). Worker-level error → job `failed` with capped `error`.

### 3.5 Client polling — `components/kinnso/SubmissionVerification.tsx` (new, `'use client'`)
Mirrors `components/onboarding/LiveProgress.tsx`: subscribe to Realtime UPDATEs on `mission_verification_jobs` (filtered by `id`), 2s fallback poll, owner-`select` RLS delivers the row. Renders `Verifying…` (queued/fetching), then on `ready` reads the snapshot `confidence_status` → `Verified signal` / `Needs review` / `Couldn't verify`; on `failed` shows the error + a `Retry` button (calls `/verify-submission/:jobId/retry`). After a terminal verification, the milestone reflects the submission status (`submitted`, then `approved`/`revision_requested` after merchant review).

### 3.6 Env
No new env vars. Worker already has `RAPIDAPI_KEY`, `YOUTUBE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; web already has `NEXT_PUBLIC_SCAN_URL`.

---

## 4. Data model & security

- **Submissions:** creator insert governed by the **existing** RLS (`mission_participants.creator_id = auth.uid()` AND participant `status = 'active'`) plus the `enforce_mission_submission_integrity` trigger (status ∈ {pending,submitted}; cannot set `merchant_feedback`/`reviewed_at`/`reviewed_by`). **No new submission policy or migration.**
- **Snapshots:** `mission_social_snapshots` has **no insert RLS** by design → service-role-only; the worker writes them. Creators read their own via the existing participant/submission select paths.
- **Verification jobs:** owner-`select` RLS for the creator (read-only, for polling); worker writes via service_role. Anon revoked.
- **Ownership re-check in the worker:** before any fetch, the worker confirms the submission belongs to the authenticated creator — prevents triggering verification (and burning fetch quota / writing snapshots) against someone else's submission.
- **Settlements:** untouched — ops-only writes; creators keep read-only `/studio/earnings` access via `mission_settlements_visible_select`.
- **Grants:** all mission tables already `grant … to authenticated` + `revoke all from anon`; the new table follows suit.

---

## 5. i18n

- Extend **`missions`** (Stage A) and add **`missionDetail`** (Stage B) to `apps/web/lib/i18n/messages/en.ts` (interface + const).
- Add `'missionDetail'` to `GROUPS` in `apps/web/tests/i18n.locale-parity.test.ts`.
- Mirror all keys across the 7 locale files (`en/ja/ko/th/zh-cn/zh-hk/zh-tw`). The `Messages` typecheck oracle (each locale imports `type { Messages } from './en'`) + the parity test enforce completeness.

---

## 6. Testing

Mirrors the existing mission suite depth and the slice quality gate.

- **Pure helpers (no mocks):** `segmentMissions`, `toMissionDetailViewModel`, `parseProofUrl`, `validateSubmission`, `canSubmit`/`nextSubmissionStatus` — base-fixture-spread style (`mission.validation.test.ts` precedent).
- **Views (jsdom):** segmented `CreatorMissionsView` (two bands, progress, empty states, join vs apply), `CreatorMissionDetailView` (participation branches, milestone form renders, submit thunk called), `SubmissionVerification` (verifying → verified/needs-review/failed + retry).
- **Action:** extend `tests/mission.actions.test.ts` with `submitMilestoneAction` (builder-mock factory; asserts insert payload + result shape; rejects invalid input).
- **Worker (`apps/scan/tests`):** `fetchSinglePost` per platform (fake fetcher), `verifySubmission` pipeline (stub-db `_updates`/`_upserts`: job status transitions, snapshot upsert, `confidence_status` from handle match, failure → job `failed`), ownership-rejection path.
- **Host:** detail page host test following `studio.*.host.test.tsx` (auth/role redirects; renders for an active creator).
- **i18n parity:** `missionDetail` + extended `missions` present and identical across all locales.

**Quality gate (per PR):** `pnpm typecheck` 7/7 · `pnpm lint` 0 errors · `pnpm test` green · `pnpm --filter web build` ✓ (+ `pnpm --filter @kinnso/scan typecheck`/`test` for Stage C).

---

## 7. Staging / PR plan

1. **PR A — Segmented list.** Query extension + `segmentMissions` + view refactor + `missions` i18n. No migration. Usable immediately.
2. **PR B — Detail page.** `getCreatorMissionDetail` + `detail.ts` + `CreatorMissionDetailView` + host (replaces `ComingSoon`) + `missionDetail` i18n. No migration. Join/apply + a milestone list that renders submissions read-only until C lands.
3. **PR C — Submission + verification.** Migration (`mission_verification_jobs`) + pure helpers + `submitMilestoneAction` + worker (`fetchSinglePost`, `/verify-submission`, `verifySubmission`) + `SubmissionVerification`. Closes the loop.

A and B ship value before the (heavier, migration- and worker-bearing) C.

---

## 8. Out of scope (YAGNI)

- Settlement auto-creation / payout execution (ops-authored).
- Partner-link **generation** (stays in `/studio/offers`; detail only displays).
- Merchant review-screen changes (already consumes `confidence_status`).
- Multi-URL submission UI (the `proof_urls[]` column supports it; ship single URL + notes first).
- Mission search / filtering / sorting beyond the two bands.
- Creator-visible raw `affiliate_network_events` (ops-only).
- Real-time engagement refresh after the one-shot verification snapshot.

---

## 9. Risks & assumptions

- **Single-post fetch endpoints (highest risk).** The current fetchers only take `(platform, handle)` — there is no single-post fetch. Stage C needs RapidAPI endpoints we don't call today (IG media, Threads post). If a platform's endpoint is unavailable/unreliable, the worker writes the snapshot as `unavailable` and the merchant reviews by opening the link — **the loop still closes**, just without an automated signal. The plan must spike these endpoints early.
- **Handle matching.** `verified_signal` requires matching the fetched post's author handle to a `creator_social_handles` row; handle formatting differences (case, `@`, URL handles) need normalization, else everything degrades to `needs_review`. Acceptable, but worth a normalization helper.
- **Empty data at first.** Few published merchant missions and zero settlements in production initially → bands and earnings mostly render empty states (same as guides/earnings at launch). Correct; fills in over time.
- **Worker single-active index.** One active verification job per submission prevents duplicate fetches on double-submit; `retry` reuses the failed job's id.
- **Realtime vs polling.** Reuses the onboarding pattern (Realtime + 2s fallback). If Realtime isn't enabled for the new table, the 2s poll still resolves the state.
- **Merge surface.** Stage A touches `CreatorMissionsView` + `lib/missions/queries.ts` (Merchant Brief Flow v1 / Slice 3d code); Stage C touches `apps/scan` (DNA-scan worker). Both are additive; the existing DNA scan path and merchant flows are unchanged.
