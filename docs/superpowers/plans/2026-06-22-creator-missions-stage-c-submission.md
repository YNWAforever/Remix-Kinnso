# Creator Missions Stage C — Submission + Auto-Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an active creator submit a milestone with a post URL, auto-verify the post via the scan worker (writing a `mission_social_snapshot` with a `confidence_status`), and follow it through to merchant review — closing the creator missions loop.

**Architecture:** A new `mission_verification_jobs` table mirrors `creator_scan_jobs` (queued/fetching/ready/failed). The web app inserts a `mission_milestone_submissions` row (existing RLS + integrity trigger), then the **browser** POSTs the submission id to the scan worker with a Bearer token (mirroring `POST /scan`). The worker (service-role) inserts a verification job, fetches the single post, matches its author handle against `creator_social_handles`, writes a snapshot, and marks the job ready. A `SubmissionVerification` client polls the job (Realtime + 2s fallback) exactly like onboarding's `LiveProgress`. The merchant review screen already reads `confidence_status` — correct snapshots make it "just work."

**Tech Stack:** Next.js App Router + Server Actions (web), Hono + `@supabase/supabase-js` service-role (worker), Supabase Postgres + RLS, Vitest (web jsdom + worker node), pnpm monorepo.

---

## Worktree & conventions (read first)

- **Work ONLY in the isolated worktree:** `/Users/willylai/Documents/Claude/Projects/kinnso-v3-missions-journey` (branch `feat/creator-missions-journey`). Never touch the shared `Remix Kinnso/kinnso-v3` tree — a parallel session lives there and HEAD collisions have happened.
- **Web commands run from `apps/web`; worker commands from `apps/scan`.** Package manager is **pnpm**.
- **Tests need dummy Supabase env vars** (the web `vitest.setup.ts` throws without them). Prefix every web test command with:
  ```
  SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co SUPABASE_ANON_KEY=dummy NEXT_PUBLIC_SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy
  ```
  Run targeted files with `--no-file-parallelism` to avoid worker-pool timeouts under the dummy key (the full suite has ~14 pre-existing Supabase integration failures on dummy creds — identical on `main`; do not chase them).
- **Worker tests** (`apps/scan`) split into `*.unit.test.ts` (always run, fake adapters) and `*.integration.test.ts` (auto-skip without real `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`). All new worker tests in this plan are **unit** tests with the in-memory stub db / FakeFetcher — no network, no env.
- **Commit after every task.** Conventional `feat:` / `test:` messages.

## Scope decisions locked in this plan (deviations from the design spec, with rationale)

1. **Platforms = Instagram + Threads only.** `mission_social_snapshots.platform` is `check (platform in ('instagram','threads'))` (`supabase/migrations/20260617173932_mission_tables.sql:124`). YouTube proof verification is **deferred** — it would require an additive constraint change *and* uncertain single-video author matching. `parseProofUrl` recognizes IG + Threads; a YouTube/other URL fails validation with `unsupported`.
2. **Resubmit is supported** via an additive trigger change (Task 2). `revision_requested` is reachable the moment we ship submission (merchants can request revision), so leaving it a dead-end would ship a broken loop. The change only *adds* `revision_requested` to the set of prior statuses a creator may update from; it still blocks `approved`/`rejected` edits and all review-field tampering.
3. **Single proof URL** (stored as `proof_urls := [url]`). The column is an array; multi-URL UI is out of scope (spec §8).
4. **`submission-state.ts` exposes only `canSubmitMilestone`** (the spec's `nextSubmissionStatus` is always `'submitted'` — YAGNI).
5. **The browser calls the worker** for verification (not the server action) — keeps RapidAPI keys in the worker and the action fast, mirroring onboarding.

## Highest risk (spec §9): single-post fetch endpoints

The existing fetchers only take `(platform, handle)`. There is **no** single-post fetch today. Task 9 adds `fetchPost(platform, id)` against the **same RapidAPI hosts already in use**. These endpoints are best-effort: **every fetch path is wrapped so any failure → `null` → snapshot `confidence_status = 'unavailable'` → job `ready`** (not `failed`). The loop still closes — the merchant opens the link and reviews manually. Only an *unexpected worker exception* marks a job `failed` (retryable). Spike the IG/Threads media endpoints early during Task 9; if a host is wrong, the graceful-degradation path keeps everything green.

---

## File map

**Migrations** (`apps/web/supabase/migrations/`)
- Create `20260619000002_mission_verification_jobs.sql` — new table + RLS + grants + single-active index.
- Create `20260619000003_allow_submission_resubmit.sql` — replace the integrity trigger function to allow `revision_requested → submitted` by the owning creator.

**Web pure helpers** (`apps/web/lib/missions/`)
- Create `proof-url.ts` — `parseProofUrl(url)`.
- Create `submission-state.ts` — `canSubmitMilestone(participantStatus, state)`.
- Modify `validation.ts` — add `validateSubmission(input)` (reuses local `addError`/`resultFrom`).
- Modify `detail.ts` — extend `MilestoneRow` + `SubmissionRow` + `buildMilestoneRows` + `toCreatorMissionDetail` (+ `participantId`, verification + submission fields, `canSubmit`).
- Modify `queries.ts` — extend `creatorMissionDetailSelect` with `mission_verification_jobs(...)`.
- Modify `actions.ts` — add `submitMilestoneAction`.
- Create `verify-client.ts` — browser → worker `startVerification` / `retryVerification`.

**Web UI** (`apps/web/components/kinnso/`)
- Create `SubmissionVerification.tsx` — polling component (mirrors `onboarding/LiveProgress.tsx`).
- Modify `pages/CreatorMissionDetailView.tsx` — per-milestone submit form + verification render + `onSubmitMilestone` prop.
- Modify `app/[locale]/studio/missions/[id]/page.tsx` — `submitMilestone` server thunk.

**Worker** (`apps/scan/src/`)
- Create `proof-url.ts` — worker copy of `parseProofUrl` (monorepo has no shared parser package).
- Create `handle-match.ts` — `normalizeHandle`, `resolveConfidence` (pure).
- Modify `fetchers.ts` — `SinglePostResult`, `PostFetcher`, `fetchPost` on `RapidApiFetcher`/`CompositeFetcher`/`FakeFetcher`.
- Create `verify.ts` — `verifySubmission(deps, jobId)` pipeline + `VerifyDeps`.
- Modify `server.ts` — `POST /verify-submission` + `POST /verify-submission/:jobId/retry`.

**i18n** (`apps/web/lib/i18n/messages/`)
- Modify all 7 locale files — extend the `missionDetail` group (interface in `en.ts`).

**Tests**
- Web: `tests/mission.proof-url.test.ts`, `tests/mission.submission-state.test.ts`, extend `tests/mission.validation.test.ts`, extend `tests/mission.detail.test.ts`, extend `tests/mission.actions.test.ts`, `tests/kinnso.SubmissionVerification.test.tsx`, extend `tests/kinnso.CreatorMissionDetailView.test.tsx`, extend `tests/studio.missions.detail.host.test.tsx` (or the existing detail host test), i18n parity already covers `missionDetail`.
- Worker: `tests/proof-url.unit.test.ts`, `tests/handle-match.unit.test.ts`, `tests/fetchers.unit.test.ts` (fetchPost), `tests/verify.unit.test.ts`, `tests/verify-server.unit.test.ts`.

---

## Task 1: Migration — `mission_verification_jobs` table (GATED prod-DB step)

Mirrors `creator_scan_jobs` (`supabase/migrations/20260614000009_creator_tables.sql:25-43`, RLS `…11:30-32`, grants `…12:14-16`, single-active `…15:11-13`). `creators.id = auth.uid()` directly, so the owner predicate is `creator_id = auth.uid()`.

**Files:**
- Create: `apps/web/supabase/migrations/20260619000002_mission_verification_jobs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- mission_verification_jobs: tracks per-submission post verification by the scan worker.
-- Mirrors creator_scan_jobs (lifecycle + owner-select RLS + single-active index).
create table public.mission_verification_jobs (
  id                              uuid primary key default gen_random_uuid(),
  mission_milestone_submission_id uuid not null references public.mission_milestone_submissions(id) on delete cascade,
  creator_id                      uuid not null references public.creators(id) on delete cascade,
  platform                        text check (platform in ('instagram','threads')),
  proof_url                       text,
  status                          text not null default 'queued'
                                    check (status in ('queued','fetching','ready','failed')),
  confidence_status               text check (confidence_status in ('verified_signal','needs_review','unavailable')),
  error                           text,
  started_at                      timestamptz,
  completed_at                    timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index mission_verification_jobs_submission_idx
  on public.mission_verification_jobs (mission_milestone_submission_id);
create index mission_verification_jobs_creator_created_idx
  on public.mission_verification_jobs (creator_id, created_at desc);

-- One active job per submission (prevents duplicate fetches on double-submit).
create unique index mission_verification_jobs_one_active
  on public.mission_verification_jobs (mission_milestone_submission_id)
  where status in ('queued','fetching');

-- Owner-select only; the worker writes via service_role (bypasses RLS).
alter table public.mission_verification_jobs enable row level security;
create policy "mission_verification_jobs_owner_select" on public.mission_verification_jobs
  for select using (creator_id = auth.uid());

grant select on public.mission_verification_jobs to authenticated;
revoke all on public.mission_verification_jobs from anon;
```

- [ ] **Step 2: Apply to the remote project (gated)**

This is the one prod-DB step. Apply via the Supabase MCP against project `scryfkefedzuetfdtrvl` (name the migration `mission_verification_jobs`), or `supabase db push` if the CLI is linked. Confirm with `list_tables` that `mission_verification_jobs` exists with the expected columns.

- [ ] **Step 3: Regenerate `@kinnso/db` types**

The worker/web do `db.from('mission_verification_jobs')` — the table name must exist in the generated `Database` type or typecheck fails. Regenerate the types file that `@kinnso/db` exports (locate it via `packages/db/src/` / `packages/db/package.json` — there is typically a `gen:types` script; otherwise use the Supabase MCP `generate_typescript_types` for `scryfkefedzuetfdtrvl` and overwrite that file). Existing worker code uses `as never` casts for jsonb-ish fields (`pipeline.ts:40`, `:84`) — follow that precedent for any field the generated types lag on, but the **table name must be present**.

- [ ] **Step 4: Verify typecheck across the monorepo**

Run from repo root: `pnpm -r typecheck`
Expected: 0 errors; `mission_verification_jobs` resolves in both `@kinnso/db` consumers.

- [ ] **Step 5: Commit**

```bash
git add apps/web/supabase/migrations/20260619000002_mission_verification_jobs.sql packages/db
git commit -m "feat(missions): add mission_verification_jobs table + regenerate db types"
```

---

## Task 2: Migration — allow creator resubmit from `revision_requested` (GATED prod-DB step)

The current `enforce_mission_submission_integrity` (`supabase/migrations/20260617173932_mission_tables.sql:195-249`) blocks creator UPDATEs when `old.status not in ('pending','submitted')` — which makes `revision_requested` a dead-end. This migration replaces the function, adding `'revision_requested'` to the allowed prior statuses. Everything else (review-field tampering blocks, the `not in ('pending','submitted')` *new*-status block, the active-participant requirement) is unchanged.

**Files:**
- Create: `apps/web/supabase/migrations/20260619000003_allow_submission_resubmit.sql`

- [ ] **Step 1: Write the migration** (full function body, only the one `elsif` predicate differs)

```sql
-- Allow a creator to resubmit a milestone after the merchant requested a revision.
-- Only change vs 20260617173932: the prior-status guard for creator UPDATEs now
-- permits 'revision_requested' (in addition to 'pending','submitted'). Review-field
-- tampering and reviewed-status writes remain blocked.
create or replace function app_private.enforce_mission_submission_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  participant_creator_id uuid;
  participant_status text;
  participant_mission_id uuid;
  milestone_mission_id uuid;
begin
  select participant.creator_id, participant.status, participant.mission_id, milestone.mission_id
  into participant_creator_id, participant_status, participant_mission_id, milestone_mission_id
  from public.mission_participants participant
  join public.mission_milestones milestone on milestone.id = new.mission_milestone_id
  where participant.id = new.mission_participant_id;

  if participant_creator_id is null then
    raise exception 'Invalid mission participant or milestone';
  end if;

  if participant_mission_id <> milestone_mission_id then
    raise exception 'Mission milestone and participant mismatch';
  end if;

  if actor_id is not null and actor_id = participant_creator_id then
    if participant_status <> 'active' then
      raise exception 'Creator submissions require an active participant';
    end if;

    if new.status not in ('pending','submitted') then
      raise exception 'Creators cannot set reviewed submission status';
    end if;

    if tg_op = 'INSERT' then
      if new.merchant_feedback is not null or new.reviewed_at is not null or new.reviewed_by is not null then
        raise exception 'Creators cannot set review fields';
      end if;
    elsif old.status not in ('pending','submitted','revision_requested') then
      raise exception 'Creators cannot update reviewed submissions';
    elsif new.merchant_feedback is distinct from old.merchant_feedback
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by then
      raise exception 'Creators cannot update review fields';
    end if;
  end if;

  return new;
end;
$$;
```

> Note: `create or replace function` rebinds the existing `mission_submissions_integrity` trigger automatically — no `create trigger` needed. On resubmit the action keeps `merchant_feedback`/`reviewed_at`/`reviewed_by` untouched, so the `is distinct from` guards pass while preserving the merchant's prior feedback.

- [ ] **Step 2: Apply to the remote project (gated)**

Apply via the Supabase MCP (`scryfkefedzuetfdtrvl`, name `allow_submission_resubmit`) or `supabase db push`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/supabase/migrations/20260619000003_allow_submission_resubmit.sql
git commit -m "feat(missions): allow creator resubmit from revision_requested"
```

---

## Task 3: Web pure helper — `parseProofUrl`

**Files:**
- Create: `apps/web/lib/missions/proof-url.ts`
- Test: `apps/web/tests/mission.proof-url.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { parseProofUrl } from '@/lib/missions/proof-url'

describe('parseProofUrl', () => {
  it('parses an Instagram post URL', () => {
    expect(parseProofUrl('https://www.instagram.com/p/Cabc123/')).toEqual({ platform: 'instagram', id: 'Cabc123' })
  })
  it('parses an Instagram reel URL', () => {
    expect(parseProofUrl('https://instagram.com/reel/Xyz789')).toEqual({ platform: 'instagram', id: 'Xyz789' })
  })
  it('parses a Threads post URL', () => {
    expect(parseProofUrl('https://www.threads.net/@traveler/post/C9postID')).toEqual({ platform: 'threads', id: 'C9postID' })
  })
  it('accepts threads.com host', () => {
    expect(parseProofUrl('https://threads.com/@x/post/abc')).toEqual({ platform: 'threads', id: 'abc' })
  })
  it('returns null for an unsupported (YouTube) URL', () => {
    expect(parseProofUrl('https://youtu.be/dQw4w9WgXcQ')).toBeNull()
  })
  it('returns null for a non-URL string', () => {
    expect(parseProofUrl('not a url')).toBeNull()
  })
  it('returns null for an Instagram profile URL with no post id', () => {
    expect(parseProofUrl('https://www.instagram.com/traveler/')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module '@/lib/missions/proof-url'`)

Run: `SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co SUPABASE_ANON_KEY=dummy NEXT_PUBLIC_SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy pnpm vitest run tests/mission.proof-url.test.ts --no-file-parallelism`

- [ ] **Step 3: Implement**

```typescript
export type ProofPlatform = 'instagram' | 'threads'

export type ParsedProofUrl = { platform: ProofPlatform; id: string }

export function parseProofUrl(input: string): ParsedProofUrl | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./i, '').toLowerCase()
  const parts = url.pathname.split('/').filter(Boolean)

  if (host === 'instagram.com') {
    const i = parts.findIndex((p) => p === 'p' || p === 'reel' || p === 'reels')
    if (i >= 0 && parts[i + 1]) return { platform: 'instagram', id: parts[i + 1] }
    return null
  }

  if (host === 'threads.net' || host === 'threads.com') {
    const i = parts.findIndex((p) => p === 'post')
    if (i >= 0 && parts[i + 1]) return { platform: 'threads', id: parts[i + 1] }
    return null
  }

  return null
}
```

- [ ] **Step 4: Run it — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/proof-url.ts apps/web/tests/mission.proof-url.test.ts
git commit -m "feat(missions): add parseProofUrl helper (instagram + threads)"
```

---

## Task 4: Web pure helper — `validateSubmission`

Co-located in `validation.ts` to reuse its private `addError`/`resultFrom`/`isBlank` helpers (`apps/web/lib/missions/validation.ts`). Returns the same `ValidationResult` shape as `validateMissionDraft`.

**Files:**
- Modify: `apps/web/lib/missions/validation.ts`
- Test: `apps/web/tests/mission.validation.test.ts` (extend)

- [ ] **Step 1: Write the failing test** (append to the existing file's describe block or a new one)

```typescript
import { validateSubmission } from '@/lib/missions/validation'

describe('validateSubmission', () => {
  it('accepts a valid Instagram proof URL with notes', () => {
    expect(validateSubmission({ proofUrl: 'https://www.instagram.com/p/Cabc123/', notes: 'live now' }))
      .toEqual({ ok: true, errors: {} })
  })
  it('requires a proof URL', () => {
    const r = validateSubmission({ proofUrl: '  ' })
    expect(r.ok).toBe(false)
    expect(r.errors.proofUrl).toContain('required')
  })
  it('rejects a non-http URL', () => {
    const r = validateSubmission({ proofUrl: 'ftp://example.com/x' })
    expect(r.ok).toBe(false)
    expect(r.errors.proofUrl).toContain('url')
  })
  it('rejects an unsupported platform URL', () => {
    const r = validateSubmission({ proofUrl: 'https://youtu.be/dQw4w9WgXcQ' })
    expect(r.ok).toBe(false)
    expect(r.errors.proofUrl).toContain('unsupported')
  })
  it('rejects notes longer than 1000 chars', () => {
    const r = validateSubmission({ proofUrl: 'https://instagram.com/p/x', notes: 'a'.repeat(1001) })
    expect(r.ok).toBe(false)
    expect(r.errors.notes).toContain('too_long')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`validateSubmission is not a function`)

Run: `… pnpm vitest run tests/mission.validation.test.ts --no-file-parallelism`

- [ ] **Step 3: Implement** — add to `validation.ts` (import `parseProofUrl`; reuse existing helpers)

```typescript
import { parseProofUrl } from '@/lib/missions/proof-url'

// ...existing exports...

export const validateSubmission = (input: { proofUrl: string; notes?: string | null }): ValidationResult => {
  const errors: ValidationErrors = {}
  const url = (input.proofUrl ?? '').trim()

  if (isBlank(url)) {
    addError(errors, 'proofUrl', 'required')
  } else if (!/^https?:\/\//i.test(url)) {
    addError(errors, 'proofUrl', 'url')
  } else if (!parseProofUrl(url)) {
    addError(errors, 'proofUrl', 'unsupported')
  }

  if ((input.notes ?? '').length > 1000) {
    addError(errors, 'notes', 'too_long')
  }

  return resultFrom(errors)
}
```

> If `ValidationResult` / `ValidationErrors` / `addError` / `resultFrom` / `isBlank` are not already in scope in `validation.ts`, they are — `validateMissionDraft` uses all of them (`validation.ts:43-71`). Reuse, do not redefine.

- [ ] **Step 4: Run it — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/validation.ts apps/web/tests/mission.validation.test.ts
git commit -m "feat(missions): add validateSubmission (single proof URL + notes)"
```

---

## Task 5: Web pure helper — `canSubmitMilestone`

**Files:**
- Create: `apps/web/lib/missions/submission-state.ts`
- Test: `apps/web/tests/mission.submission-state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { canSubmitMilestone } from '@/lib/missions/submission-state'

describe('canSubmitMilestone', () => {
  it('allows a first submission for an active participant', () => {
    expect(canSubmitMilestone('active', 'none')).toBe(true)
  })
  it('allows editing a still-pending submission', () => {
    expect(canSubmitMilestone('active', 'submitted')).toBe(true)
  })
  it('allows resubmitting after a revision request', () => {
    expect(canSubmitMilestone('active', 'revision_requested')).toBe(true)
  })
  it('blocks once approved', () => {
    expect(canSubmitMilestone('active', 'approved')).toBe(false)
  })
  it('blocks once rejected', () => {
    expect(canSubmitMilestone('active', 'rejected')).toBe(false)
  })
  it('blocks when the participant is not active', () => {
    expect(canSubmitMilestone('completed', 'none')).toBe(false)
    expect(canSubmitMilestone(null, 'none')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `… pnpm vitest run tests/mission.submission-state.test.ts --no-file-parallelism`

- [ ] **Step 3: Implement** (type-only import of `MilestoneState` from `detail.ts` — no runtime cycle)

```typescript
import type { MilestoneState } from '@/lib/missions/detail'

const SUBMITTABLE_STATES: ReadonlySet<MilestoneState> = new Set(['none', 'submitted', 'revision_requested'])

export function canSubmitMilestone(participantStatus: string | null, state: MilestoneState): boolean {
  if (participantStatus !== 'active') return false
  return SUBMITTABLE_STATES.has(state)
}
```

- [ ] **Step 4: Run it — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/submission-state.ts apps/web/tests/mission.submission-state.test.ts
git commit -m "feat(missions): add canSubmitMilestone state helper"
```

---

## Task 6: Web view-model — extend `detail.ts` + `queries.ts`

Extend the query to pull verification jobs, and the view-model so each milestone carries its submission + verification state + `canSubmit`, and the detail carries `participantId`.

**Files:**
- Modify: `apps/web/lib/missions/queries.ts` (`creatorMissionDetailSelect`)
- Modify: `apps/web/lib/missions/detail.ts`
- Test: `apps/web/tests/mission.detail.test.ts` (extend)

- [ ] **Step 1: Write the failing tests** (append)

```typescript
import { toCreatorMissionDetail, type MissionDetailRow } from '@/lib/missions/detail'

const activeRow = (overrides: Partial<MissionDetailRow> = {}): MissionDetailRow => ({
  id: 'm1', title: 'T', summary: 'S',
  mission_source: 'merchant', mission_type: 'paid', status: 'published',
  coupon_code: null, coupon_url: null,
  paid_fee_amount: 5000, paid_fee_currency: 'HKD',
  affiliate_commission_rate: null, creator_commission_rate: null, kinnso_commission_rate: null,
  affiliate_network_programs: null,
  mission_milestones: [{ id: 'ms1', title: 'Post a reel', description: 'd', due_at: null, sort_order: 0 }],
  mission_participants: [{
    id: 'p1', status: 'active', source: 'application', creator_id: 'creator-1', application_note: null,
    mission_milestone_submissions: [{
      id: 'sub1', mission_milestone_id: 'ms1', status: 'submitted',
      proof_urls: ['https://www.instagram.com/p/Cabc/'], notes: 'note', merchant_feedback: null, submitted_at: '2026-06-20T00:00:00Z',
      mission_social_snapshots: [{ confidence_status: 'verified_signal' }],
      mission_verification_jobs: [{ id: 'job1', status: 'ready', confidence_status: 'verified_signal', created_at: '2026-06-20T00:01:00Z' }],
    }],
  }],
  affiliate_partner_links: [],
  ...overrides,
})

describe('toCreatorMissionDetail — submission + verification', () => {
  it('exposes participantId for the active participant', () => {
    expect(toCreatorMissionDetail(activeRow(), 'creator-1').participantId).toBe('p1')
  })
  it('maps the milestone submission, proof URL and merchant feedback', () => {
    const ms = toCreatorMissionDetail(activeRow(), 'creator-1').milestones[0]
    expect(ms.submissionId).toBe('sub1')
    expect(ms.proofUrl).toBe('https://www.instagram.com/p/Cabc/')
    expect(ms.state).toBe('submitted')
  })
  it('maps the latest verification job', () => {
    const ms = toCreatorMissionDetail(activeRow(), 'creator-1').milestones[0]
    expect(ms.verification).toEqual({ jobId: 'job1', status: 'ready', confidence: 'verified_signal' })
  })
  it('allows submit for an active participant with no submission', () => {
    const row = activeRow({
      mission_participants: [{ id: 'p1', status: 'active', source: 'application', creator_id: 'creator-1', application_note: null, mission_milestone_submissions: [] }],
    })
    expect(toCreatorMissionDetail(row, 'creator-1').milestones[0].canSubmit).toBe(true)
  })
  it('blocks submit once approved', () => {
    const row = activeRow()
    row.mission_participants![0].mission_milestone_submissions![0].status = 'approved'
    expect(toCreatorMissionDetail(row, 'creator-1').milestones[0].canSubmit).toBe(false)
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`participantId`/`submissionId`/`verification`/`canSubmit` undefined)

Run: `… pnpm vitest run tests/mission.detail.test.ts --no-file-parallelism`

- [ ] **Step 3a: Extend `creatorMissionDetailSelect` in `queries.ts`**

Change the nested submissions select (currently `queries.ts:87-97`) to add `mission_verification_jobs`:

```typescript
export const creatorMissionDetailSelect = `
  id,title,summary,mission_source,mission_type,visibility,status,published_at,
  coupon_code,coupon_url,affiliate_commission_rate,creator_commission_rate,kinnso_commission_rate,
  paid_fee_amount,paid_fee_currency,affiliate_network_program_id,
  affiliate_network_programs(id,program_name,program_url,default_commission_description,status),
  mission_milestones(id,title,description,due_at,sort_order),
  mission_participants(id,status,source,creator_id,application_note,
    mission_milestone_submissions(id,mission_milestone_id,status,proof_urls,notes,merchant_feedback,submitted_at,
      mission_social_snapshots(confidence_status),
      mission_verification_jobs(id,status,confidence_status,created_at))),
  affiliate_partner_links(id,partner_url,original_url,sub_id)
`
```

- [ ] **Step 3b: Extend `detail.ts`** — types, `SubmissionRow`, `MilestoneRow`, `buildMilestoneRows`, `CreatorMissionDetail`, `toCreatorMissionDetail`.

Add the verification status type and extend `SubmissionRow`:

```typescript
export type VerificationStatus = 'queued' | 'fetching' | 'ready' | 'failed'

export type VerificationView = {
  jobId: string
  status: VerificationStatus
  confidence: SocialSignalStatus | null
}

type SubmissionRow = {
  id: string
  mission_milestone_id: string
  status: string | null
  proof_urls: string[] | null
  notes: string | null
  merchant_feedback: string | null
  submitted_at: string | null
  mission_social_snapshots?: Array<{ confidence_status: string | null }> | null
  mission_verification_jobs?: Array<{ id: string; status: string | null; confidence_status: string | null; created_at: string | null }> | null
}
```

Extend `MilestoneRow`:

```typescript
export type MilestoneRow = {
  id: string
  title: string
  description: string
  dueAt: string | null
  state: MilestoneState
  signal: SocialSignalStatus | null
  submissionId: string | null
  proofUrl: string | null
  notes: string | null
  merchantFeedback: string | null
  canSubmit: boolean
  verification: VerificationView | null
}
```

Add a `latestVerification` helper and rewrite `buildMilestoneRows` to take `participantStatus` and populate the new fields (keep the existing `signal` logic):

```typescript
import { canSubmitMilestone } from '@/lib/missions/submission-state'

const VERIFICATION_STATUSES: ReadonlySet<VerificationStatus> = new Set(['queued', 'fetching', 'ready', 'failed'])

function latestVerification(jobs: SubmissionRow['mission_verification_jobs']): VerificationView | null {
  if (!jobs || jobs.length === 0) return null
  const sorted = jobs.slice().sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const job = sorted[0]
  const status = (job.status ?? '') as VerificationStatus
  if (!VERIFICATION_STATUSES.has(status)) return null
  const confidence = SIGNAL_STATUSES.has((job.confidence_status ?? '') as SocialSignalStatus)
    ? (job.confidence_status as SocialSignalStatus)
    : null
  return { jobId: job.id, status, confidence }
}

export function buildMilestoneRows(
  milestones: MissionDetailRow['mission_milestones'],
  submissions: SubmissionRow[] | null | undefined,
  participantStatus: string | null,
): MilestoneRow[] {
  const latest = new Map<string, SubmissionRow>()
  for (const sub of submissions ?? []) {
    const existing = latest.get(sub.mission_milestone_id)
    if (!existing || (sub.submitted_at ?? '') >= (existing.submitted_at ?? '')) {
      latest.set(sub.mission_milestone_id, sub)
    }
  }
  return (milestones ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((milestone) => {
      const sub = latest.get(milestone.id)
      const state: MilestoneState = sub && sub.status ? (SUBMITTED_STATES[sub.status] ?? 'none') : 'none'
      const rawSignal = sub ? signalFrom(sub.mission_social_snapshots) : null
      return {
        id: milestone.id,
        title: milestone.title ?? '',
        description: milestone.description ?? '',
        dueAt: milestone.due_at ?? null,
        state,
        signal: state !== 'none' && rawSignal === null && sub ? 'unavailable' : rawSignal,
        submissionId: sub?.id ?? null,
        proofUrl: sub?.proof_urls?.[0] ?? null,
        notes: sub?.notes ?? null,
        merchantFeedback: sub?.merchant_feedback ?? null,
        canSubmit: canSubmitMilestone(participantStatus, state),
        verification: latestVerification(sub?.mission_verification_jobs),
      }
    })
}
```

> `SUBMITTED_STATES`, `signalFrom`, and `SIGNAL_STATUSES` already exist in `detail.ts` (Stage B). If `SIGNAL_STATUSES` is not yet a named `Set`, add `const SIGNAL_STATUSES = new Set<SocialSignalStatus>(['verified_signal','needs_review','unavailable'])` near the existing `signalFrom`.

Extend `CreatorMissionDetail` with `participantId` and update `toCreatorMissionDetail`:

```typescript
export type CreatorMissionDetail = {
  // ...existing fields...
  participantId: string | null
  // ...
}

export function toCreatorMissionDetail(row: MissionDetailRow, creatorId: string): CreatorMissionDetail {
  const participant = row.mission_participants?.find((p) => p.creator_id === creatorId) ?? null
  const missionType = toMissionType(row.mission_type)
  return {
    // ...existing fields unchanged...
    participantId: participant?.id ?? null,
    participantStatus: participant?.status ?? null,
    cta: resolveParticipationCta(participant?.status ?? null, missionType),
    milestones: buildMilestoneRows(
      row.mission_milestones,
      participant?.mission_milestone_submissions ?? null,
      participant?.status ?? null,
    ),
  }
}
```

- [ ] **Step 4: Run it — expect PASS**, then re-run the full Stage B detail test to confirm no regression.

Run: `… pnpm vitest run tests/mission.detail.test.ts --no-file-parallelism`

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/detail.ts apps/web/lib/missions/queries.ts apps/web/tests/mission.detail.test.ts
git commit -m "feat(missions): extend detail view-model with submission + verification state"
```

---

## Task 7: Web server action — `submitMilestoneAction`

Inserts (or, for a resubmit, updates) a `mission_milestone_submissions` row as `'submitted'`. Existing RLS + the (now resubmit-aware) integrity trigger are the authorization boundary. No worker call here.

**Files:**
- Modify: `apps/web/lib/missions/actions.ts`
- Test: `apps/web/tests/mission.actions.test.ts` (extend)

- [ ] **Step 1: Write the failing tests** (use the existing `createSupabaseMock` / `createBuilder` factory, `mission.actions.test.ts:48-106`)

```typescript
import { submitMilestoneAction } from '@/lib/missions/actions'

describe('submitMilestoneAction', () => {
  it('rejects an invalid proof URL before any DB call', async () => {
    const supabase = createSupabaseMock({})
    createSupabaseServerClientMock.mockResolvedValue(supabase)
    const result = await submitMilestoneAction({
      missionId: 'm1', milestoneId: 'ms1', participantId: 'p1', proofUrl: 'not-a-url', locale: 'en',
    })
    expect(result).toEqual({ ok: false, errors: { proofUrl: ['url'] } })
  })

  it('inserts a submitted submission for the owning active participant', async () => {
    const submissionInsert = createBuilder({ single: vi.fn(async () => ({ data: { id: 'sub-1' }, error: null })) })
    const supabase = createSupabaseMock({
      mission_participants: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'p1', creator_id: 'user-1', status: 'active', mission_id: 'm1' }, error: null })),
      }),
      mission_milestone_submissions: [
        createBuilder({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }), // existing lookup → none
        submissionInsert, // insert
      ],
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await submitMilestoneAction({
      missionId: 'm1', milestoneId: 'ms1', participantId: 'p1',
      proofUrl: 'https://www.instagram.com/p/Cabc/', notes: 'live', locale: 'en',
    })

    expect(result).toEqual({ ok: true, submissionId: 'sub-1' })
    expect(submissionInsert.insert).toHaveBeenCalledWith({
      mission_milestone_id: 'ms1',
      mission_participant_id: 'p1',
      proof_urls: ['https://www.instagram.com/p/Cabc/'],
      notes: 'live',
      status: 'submitted',
      submitted_at: expect.any(String),
    })
  })

  it('rejects when the participant belongs to another creator', async () => {
    const supabase = createSupabaseMock({
      mission_participants: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'p1', creator_id: 'someone-else', status: 'active', mission_id: 'm1' }, error: null })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)
    const result = await submitMilestoneAction({
      missionId: 'm1', milestoneId: 'ms1', participantId: 'p1', proofUrl: 'https://instagram.com/p/x', locale: 'en',
    })
    expect(result).toEqual({ ok: false, errors: { form: ['Creator access is required'] } })
  })

  it('updates an existing revision_requested submission instead of inserting', async () => {
    const submissionUpdate = createBuilder({ single: vi.fn(async () => ({ data: { id: 'sub-1' }, error: null })) })
    const supabase = createSupabaseMock({
      mission_participants: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'p1', creator_id: 'user-1', status: 'active', mission_id: 'm1' }, error: null })),
      }),
      mission_milestone_submissions: [
        createBuilder({ maybeSingle: vi.fn(async () => ({ data: { id: 'sub-1', status: 'revision_requested' }, error: null })) }),
        submissionUpdate,
      ],
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)
    const result = await submitMilestoneAction({
      missionId: 'm1', milestoneId: 'ms1', participantId: 'p1', proofUrl: 'https://instagram.com/p/x', locale: 'en',
    })
    expect(result).toEqual({ ok: true, submissionId: 'sub-1' })
    expect(submissionUpdate.update).toHaveBeenCalled()
  })
})
```

> The existing factory passes a `from` builder array per table and shifts one builder per `from()` call — so the two `mission_milestone_submissions` interactions (existence lookup, then insert/update) are an array `[lookupBuilder, writeBuilder]`. Match the existing test style exactly (see `joinMissionAction` tests `mission.actions.test.ts:307+`).

- [ ] **Step 2: Run it — expect FAIL** (`submitMilestoneAction is not exported`)

Run: `… pnpm vitest run tests/mission.actions.test.ts --no-file-parallelism`

- [ ] **Step 3: Implement** in `actions.ts` (reuse `getSupabase`, `getAuthenticatedUser`, `formError`, `revalidate`, `localizedPath`, `studioMissionsPath`; import `validateSubmission`; import `Locale`)

```typescript
import { validateSubmission } from '@/lib/missions/validation'

export type SubmitMilestoneInput = {
  missionId: string
  milestoneId: string
  participantId: string
  proofUrl: string
  notes?: string | null
  locale?: Locale
}

const RESUBMITTABLE = new Set(['pending', 'submitted', 'revision_requested'])

export async function submitMilestoneAction(
  input: SubmitMilestoneInput,
): Promise<ActionResult<{ submissionId: string }>> {
  'use server'

  const validation = validateSubmission({ proofUrl: input.proofUrl, notes: input.notes })
  if (!validation.ok) return { ok: false, errors: validation.errors }

  const supabase = await getSupabase()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return formError('Sign in is required')

  const { data: participant, error: participantError } = await supabase
    .from('mission_participants')
    .select('id, creator_id, status, mission_id')
    .eq('id', input.participantId)
    .maybeSingle()

  if (participantError || !participant) return formError('Mission participation was not found')
  if (participant.creator_id !== user.id) return formError('Creator access is required')
  if (participant.status !== 'active') return formError('Mission is not active')

  const proofUrls = [input.proofUrl.trim()]
  const notes = input.notes ?? null
  const submittedAt = new Date().toISOString()

  const { data: existing } = await supabase
    .from('mission_milestone_submissions')
    .select('id, status')
    .eq('mission_milestone_id', input.milestoneId)
    .eq('mission_participant_id', input.participantId)
    .maybeSingle()

  if (existing) {
    if (!RESUBMITTABLE.has(existing.status ?? '')) return formError('This milestone has already been reviewed')
    const { data: updated, error: updateError } = await supabase
      .from('mission_milestone_submissions')
      .update({ status: 'submitted', proof_urls: proofUrls, notes, submitted_at: submittedAt })
      .eq('id', existing.id)
      .select('id')
      .single()
    if (updateError || !updated) return formError('Submission could not be saved')
    await revalidate([localizedPath(input.locale, studioMissionsPath)])
    return { ok: true, submissionId: updated.id }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('mission_milestone_submissions')
    .insert({
      mission_milestone_id: input.milestoneId,
      mission_participant_id: input.participantId,
      proof_urls: proofUrls,
      notes,
      status: 'submitted',
      submitted_at: submittedAt,
    })
    .select('id')
    .single()

  if (insertError || !inserted) return formError('Submission could not be saved')
  await revalidate([localizedPath(input.locale, studioMissionsPath)])
  return { ok: true, submissionId: inserted.id }
}
```

> Confirm the exact names of `getSupabase`, `getAuthenticatedUser`, `formError`, `revalidate`, `localizedPath`, `studioMissionsPath`, and the `Locale` import against `actions.ts` (they are all used by `joinMissionAction`, `actions.ts:303-345`). The `ActionResult<T>` type is defined at `actions.ts:29-32`.

- [ ] **Step 4: Run it — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/actions.ts apps/web/tests/mission.actions.test.ts
git commit -m "feat(missions): add submitMilestoneAction (insert + resubmit)"
```

---

## Task 8: Worker pure helpers — `proof-url.ts` + `handle-match.ts`

Worker copies (the monorepo has no shared parser package; both copies are tested). `proof-url.ts` is identical to Task 3's. `handle-match.ts` normalizes handles and resolves confidence.

**Files:**
- Create: `apps/scan/src/proof-url.ts`
- Create: `apps/scan/src/handle-match.ts`
- Test: `apps/scan/tests/proof-url.unit.test.ts`
- Test: `apps/scan/tests/handle-match.unit.test.ts`

- [ ] **Step 1: Write the failing tests**

`apps/scan/tests/proof-url.unit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { parseProofUrl } from '../src/proof-url'

describe('parseProofUrl (worker)', () => {
  it('parses an Instagram post', () => {
    expect(parseProofUrl('https://www.instagram.com/p/Cabc/')).toEqual({ platform: 'instagram', id: 'Cabc' })
  })
  it('parses a Threads post', () => {
    expect(parseProofUrl('https://www.threads.net/@u/post/Xyz')).toEqual({ platform: 'threads', id: 'Xyz' })
  })
  it('rejects unsupported', () => {
    expect(parseProofUrl('https://youtu.be/x')).toBeNull()
  })
})
```

`apps/scan/tests/handle-match.unit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { normalizeHandle, resolveConfidence } from '../src/handle-match'

describe('normalizeHandle', () => {
  it('strips @, whitespace, trailing slash, lowercases', () => {
    expect(normalizeHandle('  @Traveler/ ')).toBe('traveler')
    expect(normalizeHandle(null)).toBe('')
  })
})

describe('resolveConfidence', () => {
  it('verified_signal when author matches creator handle', () => {
    expect(resolveConfidence({ authorHandle: '@Traveler', engagementCount: 10, postUrl: null }, 'traveler')).toBe('verified_signal')
  })
  it('needs_review when post resolves but author differs', () => {
    expect(resolveConfidence({ authorHandle: 'someone_else', engagementCount: null, postUrl: null }, 'traveler')).toBe('needs_review')
  })
  it('needs_review when the post has no author handle', () => {
    expect(resolveConfidence({ authorHandle: null, engagementCount: null, postUrl: null }, 'traveler')).toBe('needs_review')
  })
  it('unavailable when the post could not be fetched', () => {
    expect(resolveConfidence(null, 'traveler')).toBe('unavailable')
  })
})
```

- [ ] **Step 2: Run them — expect FAIL**

Run: `pnpm --filter @kinnso/scan-app test -- proof-url handle-match` (or `cd apps/scan && pnpm vitest run tests/proof-url.unit.test.ts tests/handle-match.unit.test.ts`)

- [ ] **Step 3: Implement**

`apps/scan/src/proof-url.ts` — copy Task 3's `parseProofUrl` verbatim (same `ProofPlatform`/`ParsedProofUrl` types).

`apps/scan/src/handle-match.ts`:

```typescript
import type { SinglePostResult } from './fetchers'

export type Confidence = 'verified_signal' | 'needs_review' | 'unavailable'

export function normalizeHandle(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase().replace(/^@/, '').replace(/\/+$/, '')
}

export function resolveConfidence(post: SinglePostResult | null, creatorHandle: string | null): Confidence {
  if (!post) return 'unavailable'
  const author = normalizeHandle(post.authorHandle)
  const expected = normalizeHandle(creatorHandle)
  if (author && expected && author === expected) return 'verified_signal'
  return 'needs_review'
}
```

> `SinglePostResult` is defined in Task 9. If implementing this task first, temporarily inline the type `{ authorHandle: string | null; engagementCount: number | null; postUrl: string | null }` and replace with the import once Task 9 lands — or do Task 9's type export first. Recommended order: define `SinglePostResult` in `fetchers.ts` (Task 9 Step 3) before this file's import resolves.

- [ ] **Step 4: Run them — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/scan/src/proof-url.ts apps/scan/src/handle-match.ts apps/scan/tests/proof-url.unit.test.ts apps/scan/tests/handle-match.unit.test.ts
git commit -m "feat(scan): add proof-url parser + handle-match confidence helpers"
```

---

## Task 9: Worker fetchers — `fetchPost` single-post fetch

Adds a `PostFetcher` interface + `fetchPost` to `RapidApiFetcher`, `CompositeFetcher`, and `FakeFetcher`. **Every network path is wrapped — any failure returns `null`** (→ `unavailable`). Best-effort against the hosts already in use (`fetchers.ts:56-57`: `instagram-scraper-stable-api.p.rapidapi.com`, `threads-scraper-api2.p.rapidapi.com`).

**Files:**
- Modify: `apps/scan/src/fetchers.ts`
- Test: `apps/scan/tests/fetchers.unit.test.ts`

- [ ] **Step 1: Write the failing test** (FakeFetcher path — no network)

```typescript
import { describe, expect, it } from 'vitest'
import { FakeFetcher } from '../src/fetchers'

describe('FakeFetcher.fetchPost', () => {
  it('returns a deterministic post for instagram', async () => {
    const f = new FakeFetcher()
    const post = await f.fetchPost('instagram', 'Cabc')
    expect(post).toEqual({ authorHandle: 'fake_ig_user', engagementCount: 1234, postUrl: 'https://www.instagram.com/p/Cabc/' })
  })
  it('returns a deterministic post for threads', async () => {
    const f = new FakeFetcher()
    const post = await f.fetchPost('threads', 'Xyz')
    expect(post?.authorHandle).toBe('fake_threads_user')
  })
  it('returns null when configured to fail that platform', async () => {
    const f = new FakeFetcher({}, ['instagram'])
    expect(await f.fetchPost('instagram', 'Cabc')).toBeNull()
  })
  it('lets an override set the author handle', async () => {
    const f = new FakeFetcher({}, [], { instagram: { authorHandle: 'traveler', engagementCount: 9, postUrl: null } })
    expect((await f.fetchPost('instagram', 'x'))?.authorHandle).toBe('traveler')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`fetchPost is not a function` / extra constructor arg)

Run: `cd apps/scan && pnpm vitest run tests/fetchers.unit.test.ts`

- [ ] **Step 3: Implement** — add the type + interface near the top of `fetchers.ts`:

```typescript
export type SinglePostResult = {
  authorHandle: string | null
  engagementCount: number | null
  postUrl: string | null
}

export interface PostFetcher {
  // Returns null on any fetch/parse failure — callers treat null as 'unavailable'.
  fetchPost(platform: 'instagram' | 'threads', id: string): Promise<SinglePostResult | null>
}
```

Add `fetchPost` to `RapidApiFetcher` (implements `PostFetcher` in addition to `PlatformFetcher`). Best-effort endpoints on the existing hosts; **wrap everything in try/catch → null**:

```typescript
async fetchPost(platform: 'instagram' | 'threads', id: string): Promise<SinglePostResult | null> {
  try {
    if (platform === 'instagram') {
      // Best-effort IG media info by shortcode on the existing IG host.
      const res = await fetchWithRetry(`https://${RAPIDAPI_IG_HOST}/get_media_data.php`, {
        method: 'POST',
        headers: {
          'x-rapidapi-key': this.apiKey,
          'x-rapidapi-host': RAPIDAPI_IG_HOST,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ shortcode: id }).toString(),
      })
      if (!res.ok) return null
      const raw = (await res.json()) as Record<string, any>
      const node = (raw.data ?? raw.media ?? raw) as Record<string, any>
      const author =
        node?.owner?.username ?? node?.user?.username ?? node?.author?.username ?? null
      const likes = Number(node?.edge_media_preview_like?.count ?? node?.like_count ?? node?.likes ?? NaN)
      return {
        authorHandle: typeof author === 'string' ? author : null,
        engagementCount: Number.isFinite(likes) ? likes : null,
        postUrl: `https://www.instagram.com/p/${id}/`,
      }
    }

    // Threads: best-effort post info on the existing Threads host.
    const res = await fetchWithRetry(`https://${RAPIDAPI_THREADS_HOST}/post/info?post_id=${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': this.apiKey,
        'x-rapidapi-host': RAPIDAPI_THREADS_HOST,
        Accept: 'application/json',
      },
    })
    if (!res.ok) return null
    const raw = (await res.json()) as Record<string, any>
    const node = (raw.data ?? raw.post ?? raw) as Record<string, any>
    const author = node?.user?.username ?? node?.author?.username ?? node?.owner?.username ?? null
    const likes = Number(node?.like_count ?? node?.likes ?? NaN)
    return {
      authorHandle: typeof author === 'string' ? author : null,
      engagementCount: Number.isFinite(likes) ? likes : null,
      postUrl: null,
    }
  } catch (err) {
    console.warn(`[scan] fetchPost failed: ${platform}/${id}`, (err as Error).message)
    return null
  }
}
```

Add `fetchPost` to `CompositeFetcher` (delegates to RapidApi for both platforms):

```typescript
fetchPost(platform: 'instagram' | 'threads', id: string): Promise<SinglePostResult | null> {
  return this.rapidApi.fetchPost(platform, id)
}
```

Extend `FakeFetcher` constructor + `fetchPost` (third arg = post overrides):

```typescript
export class FakeFetcher implements PlatformFetcher, PostFetcher {
  constructor(
    private readonly overrides: Partial<Record<Platform, unknown>> = {},
    private readonly failPlatforms: Platform[] = [],
    private readonly postOverrides: Partial<Record<'instagram' | 'threads', SinglePostResult>> = {},
  ) {}

  async fetch(platform: Platform, _handle: string): Promise<unknown> {
    if (this.failPlatforms.includes(platform)) {
      throw new Error(`FakeFetcher: simulated failure for platform "${platform}"`)
    }
    return this.overrides[platform] ?? FAKE_PAYLOADS[platform]
  }

  async fetchPost(platform: 'instagram' | 'threads', id: string): Promise<SinglePostResult | null> {
    if (this.failPlatforms.includes(platform)) return null
    if (this.postOverrides[platform]) return this.postOverrides[platform]!
    return FAKE_POSTS[platform](id)
  }
}

const FAKE_POSTS: Record<'instagram' | 'threads', (id: string) => SinglePostResult> = {
  instagram: (id) => ({ authorHandle: 'fake_ig_user', engagementCount: 1234, postUrl: `https://www.instagram.com/p/${id}/` }),
  threads: (id) => ({ authorHandle: 'fake_threads_user', engagementCount: 56, postUrl: `https://www.threads.net/post/${id}` }),
}
```

> **Spike note for the implementer:** the IG `get_media_data.php` and Threads `post/info` paths are best-effort guesses on the known hosts. If a live `RAPIDAPI_KEY` is available, hit each once with a real shortcode/post id and adjust the path/param/JSON shape. If you cannot verify them, leave the code as-is: every failure returns `null` → the snapshot is `unavailable` → the loop still closes via merchant manual review (spec §9). Do **not** block the stage on these endpoints.

- [ ] **Step 4: Run it — expect PASS**; also `cd apps/scan && pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/scan/src/fetchers.ts apps/scan/tests/fetchers.unit.test.ts
git commit -m "feat(scan): add fetchPost single-post fetch (best-effort, null-on-failure)"
```

---

## Task 10: Worker pipeline — `verifySubmission`

The verification pipeline: job → `fetching`; load creator handle + post; resolve confidence; write `mission_social_snapshots` (service-role); job → `ready` (+ mirror confidence). Any thrown error → job `failed`. Mirrors `runScan` structure (`pipeline.ts:112-234`) and its `setJobStatus` helper (`pipeline.ts:32-43`).

**Files:**
- Create: `apps/scan/src/verify.ts`
- Test: `apps/scan/tests/verify.unit.test.ts`

- [ ] **Step 1: Write the failing test** (in-memory stub db, mirrors `pipeline.unit.test.ts:10-84`)

```typescript
import { describe, expect, it } from 'vitest'
import { verifySubmission, type VerifyDeps } from '../src/verify'
import { FakeFetcher } from '../src/fetchers'

const JOB_ID = 'job-1'
const SUB_ID = 'sub-1'
const PARTICIPANT_ID = 'p-1'
const MISSION_ID = 'm-1'
const CREATOR_ID = 'creator-1'

function makeDb(jobOverrides: Record<string, unknown> = {}, handle = 'traveler') {
  const job = {
    id: JOB_ID, mission_milestone_submission_id: SUB_ID, creator_id: CREATOR_ID,
    platform: 'instagram', proof_url: 'https://www.instagram.com/p/Cabc/', status: 'queued',
    ...jobOverrides,
  }
  const updates: Array<{ table: string; data: Record<string, unknown> }> = []
  const inserts: Array<{ table: string; data: Record<string, unknown> }> = []

  const rows: Record<string, unknown> = {
    mission_verification_jobs: job,
    mission_milestone_submissions: { id: SUB_ID, mission_participant_id: PARTICIPANT_ID },
    mission_participants: { id: PARTICIPANT_ID, mission_id: MISSION_ID, creator_id: CREATOR_ID },
    creator_social_handles: { creator_id: CREATOR_ID, platform: 'instagram', handle },
  }

  const db = {
    _updates: updates,
    _inserts: inserts,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: rows[table], error: null }) }),
          single: async () => ({ data: rows[table], error: null }),
          maybeSingle: async () => ({ data: rows[table], error: null }),
        }),
      }),
      update: (data: Record<string, unknown>) => ({
        eq: async () => { updates.push({ table, data }); Object.assign(job, data); return { data: null, error: null } },
      }),
      insert: async (data: Record<string, unknown>) => { inserts.push({ table, data }); return { data: null, error: null } },
    }),
  }
  return db as never
}

const deps = (db: unknown, fetcher = new FakeFetcher()): VerifyDeps => ({ db: db as never, fetcher })

describe('verifySubmission', () => {
  it('transitions fetching → ready and writes a verified_signal snapshot when the handle matches', async () => {
    const db = makeDb({}, 'fake_ig_user') // FakeFetcher returns authorHandle 'fake_ig_user'
    await verifySubmission(deps(db), JOB_ID)
    const statuses = (db as never as { _updates: Array<{ data: { status?: string } }> })._updates.map((u) => u.data.status).filter(Boolean)
    expect(statuses).toEqual(['fetching', 'ready'])
    const snapshot = (db as never as { _inserts: Array<{ table: string; data: Record<string, unknown> }> })._inserts
      .find((i) => i.table === 'mission_social_snapshots')!
    expect(snapshot.data.confidence_status).toBe('verified_signal')
    expect(snapshot.data.mission_milestone_submission_id).toBe(SUB_ID)
    expect(snapshot.data.mission_id).toBe(MISSION_ID)
  })

  it('writes needs_review when the handle does not match', async () => {
    const db = makeDb({}, 'someone_else')
    await verifySubmission(deps(db), JOB_ID)
    const snapshot = (db as never as { _inserts: Array<{ table: string; data: Record<string, unknown> }> })._inserts
      .find((i) => i.table === 'mission_social_snapshots')!
    expect(snapshot.data.confidence_status).toBe('needs_review')
  })

  it('writes unavailable when the post fetch fails', async () => {
    const db = makeDb()
    await verifySubmission(deps(db, new FakeFetcher({}, ['instagram'])), JOB_ID)
    const snapshot = (db as never as { _inserts: Array<{ table: string; data: Record<string, unknown> }> })._inserts
      .find((i) => i.table === 'mission_social_snapshots')!
    expect(snapshot.data.confidence_status).toBe('unavailable')
    // still reaches ready — unavailable is a successful (manual-review) outcome
    const statuses = (db as never as { _updates: Array<{ data: { status?: string } }> })._updates.map((u) => u.data.status).filter(Boolean)
    expect(statuses[statuses.length - 1]).toBe('ready')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd apps/scan && pnpm vitest run tests/verify.unit.test.ts`

- [ ] **Step 3: Implement** `apps/scan/src/verify.ts`

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { PostFetcher } from './fetchers'
import { parseProofUrl } from './proof-url'
import { resolveConfidence } from './handle-match'

export interface VerifyDeps {
  db: SupabaseClient<Database>
  fetcher: PostFetcher
}

type VerifyStatus = 'fetching' | 'ready' | 'failed'

async function setJobStatus(
  db: SupabaseClient<Database>,
  jobId: string,
  status: VerifyStatus,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db
    .from('mission_verification_jobs')
    .update({ status, updated_at: new Date().toISOString(), ...extra } as never)
    .eq('id', jobId)
  if (error) throw new Error(`setJobStatus(${status}) failed: ${error.message}`)
}

export async function verifySubmission(deps: VerifyDeps, jobId: string): Promise<void> {
  const { db, fetcher } = deps

  const { data: job, error: jobErr } = await db
    .from('mission_verification_jobs')
    .select('id, mission_milestone_submission_id, creator_id, platform, proof_url, status')
    .eq('id', jobId)
    .single()
  if (jobErr || !job) {
    console.error('[scan] verifySubmission: job not found', jobId, jobErr?.message)
    return
  }

  try {
    await setJobStatus(db, jobId, 'fetching', { started_at: new Date().toISOString() })

    // Resolve submission → participant → mission for the snapshot FKs.
    const { data: submission } = await db
      .from('mission_milestone_submissions')
      .select('id, mission_participant_id')
      .eq('id', job.mission_milestone_submission_id)
      .single()
    const { data: participant } = await db
      .from('mission_participants')
      .select('id, mission_id, creator_id')
      .eq('id', submission?.mission_participant_id ?? '')
      .single()

    const platform = (job.platform ?? '') as 'instagram' | 'threads'
    const { data: handleRow } = await db
      .from('creator_social_handles')
      .select('handle')
      .eq('creator_id', job.creator_id)
      .eq('platform', platform)
      .maybeSingle()

    const parsed = job.proof_url ? parseProofUrl(job.proof_url) : null
    const post = parsed ? await fetcher.fetchPost(parsed.platform, parsed.id) : null
    const confidence = resolveConfidence(post, handleRow?.handle ?? null)

    const { error: snapErr } = await db.from('mission_social_snapshots').insert({
      mission_id: participant?.mission_id ?? null,
      mission_participant_id: submission?.mission_participant_id ?? null,
      mission_milestone_submission_id: job.mission_milestone_submission_id,
      platform,
      handle: handleRow?.handle ?? null,
      proof_url: job.proof_url,
      engagement_count: post?.engagementCount ?? null,
      confidence_status: confidence,
      fetched_at: new Date().toISOString(),
    } as never)
    if (snapErr) throw new Error(`snapshot insert failed: ${snapErr.message}`)

    await setJobStatus(db, jobId, 'ready', {
      confidence_status: confidence,
      completed_at: new Date().toISOString(),
    })
    console.info(`[scan] verification ${jobId} ready — confidence=${confidence}`)
  } catch (err) {
    const reason = (err as Error).message.replace(/\s+/g, ' ').slice(0, 200)
    console.error('[scan] verifySubmission failed', jobId, (err as Error).message)
    await setJobStatus(db, jobId, 'failed', { error: reason, completed_at: new Date().toISOString() }).catch(() => {})
  }
}
```

- [ ] **Step 4: Run it — expect PASS**; `cd apps/scan && pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/scan/src/verify.ts apps/scan/tests/verify.unit.test.ts
git commit -m "feat(scan): add verifySubmission pipeline (snapshot + confidence)"
```

---

## Task 11: Worker routes — `POST /verify-submission` + retry

Mirrors `POST /scan` (`server.ts:80-162`) and `/scan/:jobId/retry` (`server.ts:165-230`). Bearer auth, ownership re-check, insert job, fire-and-forget `verifySubmission`.

**Files:**
- Modify: `apps/scan/src/server.ts`
- Test: `apps/scan/tests/verify-server.unit.test.ts`

- [ ] **Step 1: Write the failing test** — exercise the handler logic via the exported Hono `app` with a stubbed `db`/`authClient`. Follow the existing server test structure; if `server.ts` does not currently export `app`/inject deps, refactor minimally to export `app` and a `makeVerifyDeps()` seam (mirror how `makeDeps()` is already factored, `server.ts:33-35`). Representative assertions:

```typescript
import { describe, expect, it } from 'vitest'

// The test imports the app and drives it via app.request(...), stubbing the
// service-role db + authClient. Mirror the existing scan server test harness.
describe('POST /verify-submission', () => {
  it('401s without a Bearer token', async () => {
    const res = await app.request('/verify-submission', { method: 'POST', body: JSON.stringify({ submissionId: 'sub-1' }) })
    expect(res.status).toBe(401)
  })

  it('403/404s when the submission belongs to another creator', async () => {
    // authClient.getUser → user-1; submission’s participant.creator_id → user-2
    // expect 404 { error: 'submission not found' }
  })

  it('202 { jobId } and inserts a queued job for the owner', async () => {
    // authClient.getUser → user-1; submission.participant.creator_id → user-1
    // db.insert(mission_verification_jobs) returns { id: 'job-1' }
    // expect res.status 202 and (await res.json()).jobId === 'job-1'
  })
})
```

> Match the harness the existing `apps/scan/tests` server/integration tests use. If they test the pipeline directly rather than via `app.request`, prefer a thin handler-extraction: pull the `/verify-submission` body into an exported `handleVerifySubmission(deps, { userId, submissionId })` pure-ish function and unit-test that (cleaner than HTTP plumbing). Keep the route a thin wrapper.

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd apps/scan && pnpm vitest run tests/verify-server.unit.test.ts`

- [ ] **Step 3: Implement** — add to `server.ts`. Reuse `getVerifiedUser`, `db`, `makeDeps` style. Add a `makeVerifyDeps()` returning `{ db, fetcher }` (the existing `fetcher` is a `CompositeFetcher`/`FakeFetcher`, both now implement `PostFetcher`).

```typescript
import { verifySubmission } from './verify'
import { parseProofUrl } from './proof-url'

function makeVerifyDeps(): import('./verify').VerifyDeps {
  return { db, fetcher }
}

app.post('/verify-submission', async (c) => {
  const user = await getVerifiedUser(c.req.header('Authorization'))
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  const body = (await c.req.json().catch(() => ({}))) as { submissionId?: string }
  const submissionId = body.submissionId
  if (!submissionId) return c.json({ error: 'submissionId is required' }, 400)

  // Load submission + owner + proof URL; assert ownership.
  const { data: submission, error: subErr } = await db
    .from('mission_milestone_submissions')
    .select('id, proof_urls, mission_participant_id, mission_participants!inner(creator_id)')
    .eq('id', submissionId)
    .maybeSingle()
  if (subErr) return c.json({ error: 'internal error' }, 500)
  const ownerId = (submission as { mission_participants?: { creator_id?: string } } | null)?.mission_participants?.creator_id
  if (!submission || ownerId !== user.id) return c.json({ error: 'submission not found' }, 404)

  const proofUrl = (submission as { proof_urls?: string[] }).proof_urls?.[0] ?? null
  const parsed = proofUrl ? parseProofUrl(proofUrl) : null

  const { data: job, error: insertErr } = await db
    .from('mission_verification_jobs')
    .insert({
      mission_milestone_submission_id: submissionId,
      creator_id: user.id,
      platform: parsed?.platform ?? null,
      proof_url: proofUrl,
      status: 'queued',
    } as never)
    .select('id')
    .single()

  if (insertErr || !job) {
    if (insertErr?.code === '23505') return c.json({ error: 'verification already in progress' }, 429)
    console.error('[scan] failed to insert verification job', insertErr?.message)
    return c.json({ error: 'internal error' }, 500)
  }

  const jobId = job.id
  const response = c.json({ jobId }, 202)
  verifySubmission(makeVerifyDeps(), jobId).catch((err: unknown) => {
    console.error(`[scan] unhandled verification error for job ${jobId}`, err)
  })
  return response
})

app.post('/verify-submission/:jobId/retry', async (c) => {
  const user = await getVerifiedUser(c.req.header('Authorization'))
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  const jobId = c.req.param('jobId')
  const { data: job, error: jobErr } = await db
    .from('mission_verification_jobs')
    .select('id, creator_id, status')
    .eq('id', jobId)
    .maybeSingle()
  if (jobErr) return c.json({ error: 'internal error' }, 500)
  if (!job || job.creator_id !== user.id) return c.json({ error: 'job not found' }, 404)
  if (job.status !== 'failed') return c.json({ error: 'job is not in failed status' }, 409)

  const { error: resetErr } = await db
    .from('mission_verification_jobs')
    .update({ status: 'queued', error: null, completed_at: null, updated_at: new Date().toISOString() } as never)
    .eq('id', jobId)
  if (resetErr) {
    if (resetErr.code === '23505') return c.json({ error: 'verification already in progress' }, 429)
    return c.json({ error: 'internal error' }, 500)
  }

  verifySubmission(makeVerifyDeps(), jobId).catch((err: unknown) => {
    console.error(`[scan] unhandled verification retry error for job ${jobId}`, err)
  })
  return c.json({ jobId, retrying: true }, 202)
})
```

> The `mission_participants!inner(creator_id)` embed gives the ownership check in one round-trip. If the generated types don't model the embed cleanly, cast the select result as shown. The single-active partial index makes a concurrent second submit return `23505` → 429.

- [ ] **Step 4: Run it — expect PASS**; `cd apps/scan && pnpm typecheck && pnpm test`.

- [ ] **Step 5: Commit**

```bash
git add apps/scan/src/server.ts apps/scan/tests/verify-server.unit.test.ts
git commit -m "feat(scan): add /verify-submission + retry routes (Bearer + ownership)"
```

---

## Task 12: Web client — `verify-client.ts` + `SubmissionVerification.tsx`

Browser → worker call + the polling component (mirrors `onboarding/LiveProgress.tsx`).

**Files:**
- Create: `apps/web/lib/missions/verify-client.ts`
- Create: `apps/web/components/kinnso/SubmissionVerification.tsx`
- Test: `apps/web/tests/kinnso.SubmissionVerification.test.tsx`

- [ ] **Step 1: Write the failing test** (jsdom; mock the browser supabase client + `verify-client`)

```typescript
// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { channelMock, fromMock, retryMock } = vi.hoisted(() => ({
  channelMock: vi.fn(),
  fromMock: vi.fn(),
  retryMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
    from: fromMock,
  }),
}))
vi.mock('@/lib/missions/verify-client', () => ({
  startVerification: vi.fn(),
  retryVerification: retryMock,
}))

import { SubmissionVerification } from '@/components/kinnso/SubmissionVerification'
import en from '@/lib/i18n/messages/en'

afterEach(() => { cleanup(); vi.clearAllMocks() })

const jobSelect = (row: unknown) => ({
  select: () => ({ eq: () => ({ single: async () => ({ data: row }) }) }),
})

describe('SubmissionVerification', () => {
  it('shows the verifying state for a queued job', async () => {
    fromMock.mockReturnValue(jobSelect({ id: 'job-1', status: 'queued', confidence_status: null, error: null }))
    render(<SubmissionVerification jobId="job-1" t={en.missionDetail} />)
    await waitFor(() => expect(screen.getByText(en.missionDetail.verifying)).toBeTruthy())
  })

  it('shows the verified signal when ready + verified_signal', async () => {
    fromMock.mockReturnValue(jobSelect({ id: 'job-1', status: 'ready', confidence_status: 'verified_signal', error: null }))
    render(<SubmissionVerification jobId="job-1" t={en.missionDetail} />)
    await waitFor(() => expect(screen.getByText(en.missionDetail.verifiedSignal)).toBeTruthy())
  })

  it('shows the failure + retry on a failed job', async () => {
    fromMock.mockReturnValue(jobSelect({ id: 'job-1', status: 'failed', confidence_status: null, error: 'boom' }))
    render(<SubmissionVerification jobId="job-1" t={en.missionDetail} />)
    await waitFor(() => expect(screen.getByRole('button', { name: en.missionDetail.retry })).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `… pnpm vitest run tests/kinnso.SubmissionVerification.test.tsx --no-file-parallelism`

- [ ] **Step 3: Implement**

`apps/web/lib/missions/verify-client.ts` (browser-only; mirrors `LiveProgress` `startScan`/`bearer`, `LiveProgress.tsx:82-163`):

```typescript
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

async function bearer(): Promise<string | null> {
  const supabase = createSupabaseBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

function workerBase(): string | null {
  const base = process.env.NEXT_PUBLIC_SCAN_URL?.trim()
  return base && /^https?:\/\//i.test(base) ? base : null
}

export type StartVerificationResult =
  | { jobId: string }
  | { error: 'unconfigured' | 'reauth' | 'rateLimited' | 'error' }

export async function startVerification(submissionId: string): Promise<StartVerificationResult> {
  const base = workerBase()
  if (!base) return { error: 'unconfigured' }
  const token = await bearer()
  if (!token) return { error: 'reauth' }
  const res = await fetch(`${base}/verify-submission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ submissionId }),
  })
  if (res.status === 429) return { error: 'rateLimited' }
  if (res.status === 401) return { error: 'reauth' }
  if (!res.ok) return { error: 'error' }
  const data = (await res.json()) as { jobId?: string }
  return data.jobId ? { jobId: data.jobId } : { error: 'error' }
}

export async function retryVerification(jobId: string): Promise<string | null> {
  const base = workerBase()
  if (!base) return null
  const token = await bearer()
  if (!token) return null
  const res = await fetch(`${base}/verify-submission/${jobId}/retry`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { jobId?: string }
  return data.jobId ?? null
}
```

`apps/web/components/kinnso/SubmissionVerification.tsx` (mirrors `LiveProgress` subscribe + 2s poll, `LiveProgress.tsx:166-199`):

```typescript
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { retryVerification } from '@/lib/missions/verify-client'
import type { Messages } from '@/lib/i18n/messages/en'

type JobStatus = 'queued' | 'fetching' | 'ready' | 'failed'
type JobRow = { id: string; status: JobStatus; confidence_status: string | null; error: string | null }

type Props = { jobId: string; t: Messages['missionDetail'] }

export function SubmissionVerification({ jobId, t }: Props) {
  const [job, setJob] = useState<JobRow | null>(null)
  const currentId = useRef(jobId)

  const subscribeAndSelect = useCallback((id: string) => {
    const supabase = createSupabaseBrowserClient()
    const channel = supabase
      .channel(`verify-job-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mission_verification_jobs', filter: `id=eq.${id}` },
        (payload: { new: JobRow }) => setJob(payload.new),
      )
      .subscribe()

    let timer: ReturnType<typeof setInterval> | undefined
    const select = (): PromiseLike<void> =>
      supabase
        .from('mission_verification_jobs')
        .select('id, status, confidence_status, error')
        .eq('id', id)
        .single()
        .then(({ data }: { data: JobRow | null }) => {
          setJob(data)
          if (data && (data.status === 'ready' || data.status === 'failed') && timer) {
            clearInterval(timer)
            timer = undefined
          }
        })

    void select()
    timer = setInterval(() => void select(), 2000)
    return () => {
      if (timer) clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    currentId.current = jobId
    return subscribeAndSelect(jobId)
  }, [jobId, subscribeAndSelect])

  async function retry() {
    const newId = await retryVerification(currentId.current)
    if (newId) {
      currentId.current = newId
      setJob(null)
      subscribeAndSelect(newId)
    }
  }

  if (!job || job.status === 'queued' || job.status === 'fetching') {
    return <p className="mt-2 text-xs text-kinnso-muted">{t.verifying}</p>
  }
  if (job.status === 'failed') {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-red-700">
        <span>{t.verificationFailed}</span>
        <button type="button" className="k-btn-ghost text-xs" onClick={() => void retry()}>{t.retry}</button>
      </div>
    )
  }
  // ready
  const label =
    job.confidence_status === 'verified_signal' ? t.verifiedSignal
    : job.confidence_status === 'needs_review' ? t.needsReview
    : t.couldntVerify
  return <p className="mt-2 text-xs font-semibold text-kinnso-ink">{label}</p>
}
```

> Confirm `createSupabaseBrowserClient`'s import path matches `LiveProgress.tsx` (it uses the same helper). The i18n keys (`verifying`, `verifiedSignal`, `needsReview`, `couldntVerify`, `verificationFailed`, `retry`) are added in Task 15 — do Task 15 first or add the six `en.ts` keys inline now to keep the test compiling.

- [ ] **Step 4: Run it — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/missions/verify-client.ts apps/web/components/kinnso/SubmissionVerification.tsx apps/web/tests/kinnso.SubmissionVerification.test.tsx
git commit -m "feat(missions): add SubmissionVerification polling component + worker client"
```

---

## Task 13: Web view — submit form in `CreatorMissionDetailView`

Adds a per-milestone submit form (Post URL + notes) when `milestone.canSubmit`, renders `SubmissionVerification` after submit / for an existing job, and shows merchant feedback read-only. New prop `onSubmitMilestone`.

**Files:**
- Modify: `apps/web/components/kinnso/pages/CreatorMissionDetailView.tsx`
- Test: `apps/web/tests/kinnso.CreatorMissionDetailView.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests** (extend the existing file; existing render helper types thunks as `() => KinnsoActionResult`)

```typescript
it('renders a submit form for a submittable milestone and calls onSubmitMilestone', async () => {
  const onSubmitMilestone = vi.fn(async () => ({ ok: true as const, submissionId: 'sub-1' }))
  const mission = activeMissionWithMilestone({ canSubmit: true, state: 'none' })
  render(
    <CreatorMissionDetailView
      locale="en" t={en.missionDetail} mission={mission}
      onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={onSubmitMilestone}
    />,
  )
  fireEvent.change(screen.getByLabelText(en.missionDetail.proofUrlLabel), {
    target: { value: 'https://www.instagram.com/p/Cabc/' },
  })
  fireEvent.click(screen.getByRole('button', { name: en.missionDetail.submitMilestone }))
  await waitFor(() => expect(onSubmitMilestone).toHaveBeenCalledWith({
    milestoneId: mission.milestones[0].id, proofUrl: 'https://www.instagram.com/p/Cabc/', notes: '',
  }))
})

it('shows merchant feedback and a Resubmit button when revision was requested', () => {
  const mission = activeMissionWithMilestone({ canSubmit: true, state: 'revision_requested', merchantFeedback: 'Add the coupon code' })
  render(<CreatorMissionDetailView locale="en" t={en.missionDetail} mission={mission} onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()} />)
  expect(screen.getByText('Add the coupon code')).toBeTruthy()
  expect(screen.getByRole('button', { name: en.missionDetail.resubmitMilestone })).toBeTruthy()
})

it('does not render a form once approved', () => {
  const mission = activeMissionWithMilestone({ canSubmit: false, state: 'approved' })
  render(<CreatorMissionDetailView locale="en" t={en.missionDetail} mission={mission} onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()} />)
  expect(screen.queryByLabelText(en.missionDetail.proofUrlLabel)).toBeNull()
})
```

Add an `activeMissionWithMilestone` fixture helper at the top of the test file (spread a base `CreatorMissionDetail` with `cta: 'active'`, `participantId: 'p1'`, one milestone whose `state`/`canSubmit`/`merchantFeedback`/`verification` come from the arg).

- [ ] **Step 2: Run it — expect FAIL** (`onSubmitMilestone` not a prop; no form)

Run: `… pnpm vitest run tests/kinnso.CreatorMissionDetailView.test.tsx --no-file-parallelism`

- [ ] **Step 3: Implement** — extend the props and the milestone rendering block (the existing `mission.cta === 'active'` section, `CreatorMissionDetailView.tsx:132-165`). Add:

```typescript
import { useState } from 'react'
import { SubmissionVerification } from '@/components/kinnso/SubmissionVerification'
import { startVerification } from '@/lib/missions/verify-client'

type SubmitResult = { ok: true; submissionId: string } | { ok: false; errors?: Record<string, string[]> }

type CreatorMissionDetailViewProps = {
  locale: string
  t: Messages['missionDetail']
  mission: CreatorMissionDetail
  onJoin: () => KinnsoActionResult | Promise<KinnsoActionResult>
  onApply: (note: string) => KinnsoActionResult | Promise<KinnsoActionResult>
  onSubmitMilestone: (input: { milestoneId: string; proofUrl: string; notes: string }) => Promise<SubmitResult>
}
```

Inside the component, a small child handles one milestone's form + verification state (keeps `useState` per-milestone clean):

```typescript
function MilestoneSubmit({
  milestone, t, onSubmitMilestone,
}: {
  milestone: CreatorMissionDetail['milestones'][number]
  t: Messages['missionDetail']
  onSubmitMilestone: CreatorMissionDetailViewProps['onSubmitMilestone']
}) {
  const [proofUrl, setProofUrl] = useState(milestone.proofUrl ?? '')
  const [notes, setNotes] = useState(milestone.notes ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(milestone.verification?.jobId ?? null)

  async function submit() {
    setPending(true)
    setError(null)
    try {
      const result = await onSubmitMilestone({ milestoneId: milestone.id, proofUrl, notes })
      if (!result.ok) {
        setError(Object.values(result.errors ?? {}).flat()[0] ?? t.submitError)
        return
      }
      const started = await startVerification(result.submissionId)
      if ('jobId' in started) setJobId(started.jobId)
      else setError(t.submitError)
    } finally {
      setPending(false)
    }
  }

  const isResubmit = milestone.state === 'revision_requested'

  return (
    <div className="mt-3 space-y-2">
      {milestone.merchantFeedback && (
        <p className="rounded-md bg-kinnso-cream2 px-3 py-2 text-xs text-kinnso-ink">
          <span className="font-semibold">{t.merchantFeedbackLabel}:</span> {milestone.merchantFeedback}
        </p>
      )}
      {milestone.canSubmit && (
        <>
          <label className="block text-xs font-semibold text-kinnso-ink" htmlFor={`proof-${milestone.id}`}>{t.proofUrlLabel}</label>
          <input
            id={`proof-${milestone.id}`} className="k-input w-full" value={proofUrl}
            placeholder={t.proofUrlPlaceholder} onChange={(e) => setProofUrl(e.target.value)}
          />
          <label className="block text-xs font-semibold text-kinnso-ink" htmlFor={`notes-${milestone.id}`}>{t.submissionNotesLabel}</label>
          <textarea
            id={`notes-${milestone.id}`} className="k-input w-full" rows={2} value={notes}
            placeholder={t.submissionNotesPlaceholder} onChange={(e) => setNotes(e.target.value)}
          />
          {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
          <button type="button" className="k-btn-primary text-sm" disabled={pending} onClick={() => void submit()}>
            {isResubmit ? t.resubmitMilestone : t.submitMilestone}
          </button>
        </>
      )}
      {jobId && <SubmissionVerification jobId={jobId} t={t} />}
    </div>
  )
}
```

Render `<MilestoneSubmit milestone={milestone} t={t} onSubmitMilestone={onSubmitMilestone} />` inside each milestone `TicketCard`, below the existing badges block.

- [ ] **Step 4: Run it — expect PASS**; re-run the full Stage B view test for no regression.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/pages/CreatorMissionDetailView.tsx apps/web/tests/kinnso.CreatorMissionDetailView.test.tsx
git commit -m "feat(missions): add milestone submit form + verification to detail view"
```

---

## Task 14: Web host — `submitMilestone` server thunk

Wire a `submitMilestone` thunk in the detail host (`app/[locale]/studio/missions/[id]/page.tsx`) that calls `submitMilestoneAction` with the mission id + the detail's `participantId`.

**Files:**
- Modify: `apps/web/app/[locale]/studio/missions/[id]/page.tsx`
- Test: `apps/web/tests/studio.missions.detail.host.test.tsx` (extend, or the existing detail host test file)

- [ ] **Step 1: Write the failing test** — assert the host renders the detail view and passes an `onSubmitMilestone` thunk for an active creator (follow the existing `studio.*.host.test.tsx` mocking of `createSupabaseServerClient`, `resolveViewerRole`, `getCreatorMissionDetail`). Minimum: render the page for an active participant + assert `submitMilestoneAction` is invoked with `{ missionId, participantId, milestoneId, proofUrl, locale }` when the thunk is called.

```typescript
// extends the Stage B host test; mock '@/lib/missions/actions' submitMilestoneAction
it('passes a submitMilestone thunk that calls submitMilestoneAction with the participant id', async () => {
  // getCreatorMissionDetail → row with active participant p1 + milestone ms1
  // render page; grab the onSubmitMilestone prop passed to the mocked view; call it
  // expect submitMilestoneActionMock toHaveBeenCalledWith({ missionId: 'm1', participantId: 'p1', milestoneId: 'ms1', proofUrl: '...', notes: '...', locale: 'en' })
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `… pnpm vitest run tests/studio.missions.detail.host.test.tsx --no-file-parallelism`

- [ ] **Step 3: Implement** — add to the host, alongside the existing `join`/`apply` thunks (`page.tsx:37-45`):

```typescript
async function submitMilestone(input: { milestoneId: string; proofUrl: string; notes: string }) {
  'use server'
  return submitMilestoneAction({
    missionId: id,
    milestoneId: input.milestoneId,
    participantId: mission.participantId ?? '',
    proofUrl: input.proofUrl,
    notes: input.notes,
    locale: loc,
  })
}
```

And pass it to the view:

```typescript
return (
  <CreatorMissionDetailView
    locale={loc} t={messages.missionDetail} mission={mission}
    onJoin={join} onApply={apply} onSubmitMilestone={submitMilestone}
  />
)
```

Import `submitMilestoneAction` from `@/lib/missions/actions`. `mission` is the `toCreatorMissionDetail(...)` result (now carrying `participantId`).

- [ ] **Step 4: Run it — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/[locale]/studio/missions/[id]/page.tsx apps/web/tests/studio.missions.detail.host.test.tsx
git commit -m "feat(missions): wire submitMilestone thunk into detail host"
```

---

## Task 15: i18n — extend the `missionDetail` group across 7 locales

Add the submission/verification keys to the `missionDetail` group. `missionDetail` is already in `GROUPS` (`tests/i18n.locale-parity.test.ts:14-18`) — no GROUPS edit needed. The `Messages` typecheck oracle (each locale `import type { Messages } from './en'`) + the parity test enforce completeness.

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface entry + values), then `zh-hk.ts`, `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`, `th.ts` (values only).

- [ ] **Step 1: Add the keys to the `Messages` interface in `en.ts`** (`missionDetail` interface block, `en.ts:325-343`)

```typescript
proofUrlLabel: string
proofUrlPlaceholder: string
submissionNotesLabel: string
submissionNotesPlaceholder: string
submitMilestone: string
resubmitMilestone: string
submitError: string
merchantFeedbackLabel: string
verifying: string
verifiedSignal: string
needsReview: string
couldntVerify: string
verificationFailed: string
retry: string
```

- [ ] **Step 2: Add the English values** (`missionDetail` const block, `en.ts:810-828`)

```typescript
proofUrlLabel: 'Post URL',
proofUrlPlaceholder: 'https://www.instagram.com/p/...',
submissionNotesLabel: 'Notes (optional)',
submissionNotesPlaceholder: 'Add context for the merchant',
submitMilestone: 'Submit for review',
resubmitMilestone: 'Resubmit',
submitError: 'Submission could not be sent',
merchantFeedbackLabel: 'Merchant feedback',
verifying: 'Verifying…',
verifiedSignal: 'Verified signal',
needsReview: 'Needs review',
couldntVerify: 'Couldn’t verify',
verificationFailed: 'Verification failed',
retry: 'Retry',
```

- [ ] **Step 3: Mirror the 14 keys into the other 6 locale files** (English values are acceptable under the phased-translation policy — the parity test checks key presence + the typecheck oracle checks shape; translated strings are a follow-up). Paste the same 14 `key: 'value',` lines into each `missionDetail` block in `zh-hk.ts`, `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`, `th.ts`.

- [ ] **Step 4: Run the parity + typecheck oracle**

Run:
```
… pnpm vitest run tests/i18n.locale-parity.test.ts --no-file-parallelism
… pnpm typecheck
```
Expected: parity green for `missionDetail`; typecheck 0 errors (all 7 locales satisfy `Messages`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/i18n/messages
git commit -m "feat(i18n): add missionDetail submission + verification keys (7 locales)"
```

---

## Final gate (run before opening/extending the PR)

From `apps/web`:
```
SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co SUPABASE_ANON_KEY=dummy NEXT_PUBLIC_SUPABASE_URL=https://scryfkefedzuetfdtrvl.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy pnpm vitest run \
  tests/mission.proof-url.test.ts tests/mission.submission-state.test.ts tests/mission.validation.test.ts \
  tests/mission.detail.test.ts tests/mission.actions.test.ts tests/kinnso.SubmissionVerification.test.tsx \
  tests/kinnso.CreatorMissionDetailView.test.tsx tests/studio.missions.detail.host.test.tsx \
  tests/i18n.locale-parity.test.ts --no-file-parallelism
pnpm typecheck && pnpm lint
pnpm --filter web build      # compile phase; the /articles/[category]/[url] SSG route fails on dummy creds (pre-existing, identical on main)
```
From `apps/scan`:
```
pnpm typecheck && pnpm test
```
Expected: all targeted web tests green; typecheck 7/7; lint 0 errors; worker typecheck + unit tests green. The ~14 pre-existing web Supabase integration failures and the one SSG build route are environmental (dummy creds) — identical on `main`; do not chase them.

---

## Spec coverage self-check

- §3.1 migration → **Task 1** (note: status set is `queued/fetching/ready/failed`, no `analyzing`; owner-select RLS; single-active index; grants).
- §3.2 pure helpers → `parseProofUrl` **Task 3**, `validateSubmission` **Task 4**, `canSubmitMilestone` **Task 5** (`nextSubmissionStatus` dropped — always `'submitted'`, YAGNI).
- §3.3 `submitMilestoneAction` → **Task 7** (insert + resubmit; existing RLS + trigger; `KinnsoActionResult`-shaped).
- §3.4 worker → `fetchPost` **Task 9**, `verifySubmission` **Task 10**, `/verify-submission` + retry **Task 11**, ownership re-check in the route + null-on-failure degradation.
- §3.5 client polling → `SubmissionVerification` **Task 12** (+ `verify-client.ts`), wired in **Task 13**.
- §2 detail query/view-model carries verification → **Task 6** (`creatorMissionDetailSelect` + `detail.ts`).
- §3.6 env → none (worker has `RAPIDAPI_KEY`/`SUPABASE_SERVICE_ROLE_KEY`; web has `NEXT_PUBLIC_SCAN_URL`).
- §4 security → existing submission RLS/trigger reused; resubmit trigger change is additive (**Task 2**); snapshots service-role-only; jobs owner-select; worker ownership re-check.
- §5 i18n → **Task 15**.
- §6 testing → every task is TDD; worker unit tests use stub-db/FakeFetcher.

**Deviations from spec (flagged for review):** (1) IG + Threads only — YouTube deferred (snapshot `platform` check + uncertain author matching); (2) resubmit requires the additive trigger migration (Task 2), not in the spec's single-migration framing; (3) single proof URL stored as a 1-element array. All three are noted in "Scope decisions locked in this plan" at the top.
