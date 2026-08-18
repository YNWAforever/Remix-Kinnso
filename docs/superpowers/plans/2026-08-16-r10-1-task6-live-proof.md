# R10.1 Task 6 — Live Proof of Settlement Minting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove, against a real Postgres, that R10.1's settlement minting is idempotent under cron replay and does not duplicate across a revision cycle — then close the phase with a full gate and a PR.

**Architecture:** R10.1 Tasks 1–5 are committed on `feat/r10-1-settlement-minting`; only the live proof remains. The four migrations have already been confirmed to *apply* on a clean stack, and the resulting indexes, functions and triggers have been inspected directly. What is unproven is *behaviour*: that the triggers actually fire, compute the right amounts, and refuse to double-mint. This plan brings up a local stack, adds one live suite, runs the repo gate, and restores the environment.

**Tech Stack:** Supabase CLI (local stack under colima) · Postgres 17 · Vitest 4 · `@supabase/supabase-js`

---

## Context you need before starting

### What is already done

`feat/r10-1-settlement-minting` carries six commits:

| Commit | What |
|---|---|
| `ea3b4d2` | Two partial unique indexes — the `ON CONFLICT` targets everything else relies on |
| `e48bf4d` | `create_mission_settlement_on_affiliate_paid()` trigger |
| `3a6f289` | `create_mission_settlement_on_approval()` trigger |
| `aa49056` | One-time backfill for already-paid affiliate conversions |
| `7473c23` | Backfill test: negative assertions run against comment-stripped SQL |
| `e9ebf27` | `source` facet on the ops payouts queue |

### What has already been verified against a real database

Do **not** re-verify these; build on them. All were confirmed directly on a clean `supabase db reset` (105 migrations):

- All four R10.1 migrations apply cleanly.
- `mission_settlements_affiliate_event_uniq` and `mission_settlements_participant_fee_uniq` both exist, both **UNIQUE** and both **partial**.
- `create_mission_settlement_on_affiliate_paid` and `create_mission_settlement_on_approval` are both `security definer`, both `search_path=public`, and both have EXECUTE revoked from **anon and service_role**.
- Both triggers exist and are enabled.

### What is NOT proven, and is this plan's entire job

Text assertions confirm the SQL *says* the right things. Nothing yet confirms the triggers *do* the right things. Specifically unproven: that a paid conversion mints exactly one row with the right amount, that three identical cron upserts still produce one settlement, and that an `approved → revision_requested → approved` cycle does not mint twice.

### Environment quirks you will hit

Three, all previously encountered on this machine:

1. **Port collision.** Another project's stack (`adfocate-2`) occupies 54321–54324. Shift kinnso's ports by +100.
2. **`supabase_vector` cannot start under colima** — it bind-mounts the docker socket, which fails on colima's path. Disable `[analytics]`.
3. **`supabase_storage` reports unhealthy** and aborts the whole start. Disable `[storage]`. Nothing in this suite needs it.

All three are edits to `supabase/config.toml`, which is **tracked** — so `git checkout` restores it exactly. Make no other changes to that file.

### A mistake not to repeat

`apps/web/.env.test` is **gitignored**. It was previously overwritten with its only backup in `/tmp`, which was cleared — the original credentials were lost and had to be recreated by hand. **Back it up inside the repo-adjacent scratchpad or your home directory, never `/tmp`.**

---

## File Map

| File | Responsibility | Task |
|---|---|---|
| `supabase/config.toml` | Temporary local-stack overrides (ports, analytics, storage). Restored in Task 4. | 1, 4 |
| `apps/web/.env.test` | Temporary local-stack credentials. Restored in Task 4. | 1, 4 |
| `apps/web/tests/settlement-minting.rls.test.ts` | The live proof. The only file this plan permanently adds. | 2, 3 |

---

### Task 1: Bring up the local stack and wire the environment

**Files:**
- Modify (temporarily): `supabase/config.toml`
- Modify (temporarily): `apps/web/.env.test`

- [ ] **Step 1: Confirm Docker is actually up**

```bash
docker info >/dev/null 2>&1 && echo "DOCKER OK" || echo "DOCKER DOWN"
```

Expected: `DOCKER OK`.

If it prints `DOCKER DOWN`, run `colima status`, then `colima start`. If colima reports a missing `ha.sock` or "already running" while `status` says otherwise, wait 60 seconds and retry once — this VM has recovered on its own from that state before. **Do not run `colima delete`**; it destroys the VM and every volume in it, including another project's database. If it still will not start, STOP and report BLOCKED.

- [ ] **Step 2: Back up both files somewhere durable**

```bash
mkdir -p ~/.kinnso-r10-1-backup
cd "/Users/willylai/Documents/Claude/Projects/Remix Kinnso/kinnso-v3"
cp supabase/config.toml ~/.kinnso-r10-1-backup/config.toml.bak
cp apps/web/.env.test ~/.kinnso-r10-1-backup/env.test.bak
ls -la ~/.kinnso-r10-1-backup/
```

Expected: both files listed. **Not `/tmp`** — see the note above.

- [ ] **Step 3: Apply the three local-stack overrides**

```bash
python3 - <<'PY'
import re
p = 'supabase/config.toml'
s = open(p).read()
s = re.sub(r'\b543(\d\d)\b', lambda m: '544' + m.group(1), s)
lines = s.split('\n')
for header in ('[analytics]', '[storage]'):
    for i, l in enumerate(lines):
        if l.strip() == header:
            for j in range(i + 1, min(i + 6, len(lines))):
                if lines[j].strip() == 'enabled = true':
                    lines[j] = 'enabled = false'
                    print(f'{header} disabled at line {j+1}')
                    break
            break
open(p, 'w').write('\n'.join(lines))
PY
grep -nE "port = 544[0-9][0-9]" supabase/config.toml | head -4
```

Expected: ports `54421`, `54422`, shadow `54420`, `54429`; both `enabled = false` lines reported.

- [ ] **Step 4: Start the stack and replay every migration**

```bash
npx --no-install supabase start
npx --no-install supabase db reset
```

Expected: `db reset` applies 105 migrations and ends with `Finished supabase db reset`. The four R10.1 files must appear in the log.

If `20260815100000` raises `R10.1: N affiliate_network_event_id value(s) already have more than one mission_settlements row`, that is the duplicate pre-check doing its job on dirty seed data — report it rather than deleting rows.

- [ ] **Step 5: Wire `.env.test` to the local stack**

```bash
npx --no-install supabase status -o env 2>/dev/null | grep -E "^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=" > /tmp/envraw
API=$(grep '^API_URL=' /tmp/envraw | cut -d= -f2- | tr -d '"')
ANON=$(grep '^ANON_KEY=' /tmp/envraw | cut -d= -f2- | tr -d '"')
SVC=$(grep '^SERVICE_ROLE_KEY=' /tmp/envraw | cut -d= -f2- | tr -d '"')
cat > apps/web/.env.test <<EOF
SUPABASE_URL=$API
SUPABASE_ANON_KEY=$ANON
SUPABASE_SERVICE_ROLE_KEY=$SVC
NEXT_PUBLIC_SUPABASE_URL=$API
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON
SUPABASE_DB_CONTAINER=supabase_db_kinnso-v3
RUN_R7_3_LOCAL_LIVE_TESTS=1
EOF
cut -d= -f1 apps/web/.env.test | tr '\n' ' '
```

Expected: seven key names, and `SUPABASE_URL` pointing at `http://127.0.0.1:54421`.

`SUPABASE_DB_CONTAINER` is not optional — without it the suite's skip gate disables itself silently and reports green while testing nothing.

- [ ] **Step 6: Confirm the R10.0 live suite still passes against this stack**

```bash
pnpm --filter web exec vitest run tests/creator-earnings.rls.test.ts
```

Expected: PASS, **not skipped**. This proves the harness, the credentials and the container name are all correct before you write a new suite on top of them. A skip here means Step 5 is wrong.

Do not commit anything in this task — both changed files are temporary and are reverted in Task 4.

---

### Task 2: The two assertions that carry the phase

**Files:**
- Create: `apps/web/tests/settlement-minting.rls.test.ts`

Write these two first. If either fails, the phase is wrong and the remaining six do not matter.

- [ ] **Step 1: Copy the harness verbatim from the R10.0 suite**

Open `apps/web/tests/creator-earnings.rls.test.ts` and copy lines 1–55 exactly — the env reads, the `d` skip gate, `hookTimeout`/`testTimeout`/`runId`, `runPsql`, `b64`, `clientFor`, `svc`, and the four user UUID constants. Do not rewrite them; this harness is already proven against this stack.

For reference, the gate and helpers are:

```ts
const d = svcKey && dbContainer && url && anonKey ? describe : describe.skip
const hookTimeout = 60000
const testTimeout = 15000
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const svc = () => createClient(url!, svcKey!, { auth: { persistSession: false, autoRefreshToken: false } })
```

- [ ] **Step 2: Seed, in `beforeAll`**

Read the real DDL before writing inserts — `supabase/migrations/20260617173932_mission_tables.sql` for `missions`, `mission_participants`, `mission_milestones`, `mission_milestone_submissions`, `affiliate_network_events`. Respect every NOT NULL and CHECK. Note the BEFORE trigger `app_private.enforce_mission_submission_integrity()` requires `participant.mission_id = milestone.mission_id`.

Seed via `runPsql` and `svc()`, namespaced by `runId`:

1. Creators C and D (`creators.status = 'active'`) plus their `auth.users` and `auth.identities` rows — copy the exact insert shape from the R10.0 suite's `beforeAll`.
2. A merchant profile, and a **travelpayouts-source** mission with `creator_commission_rate = 70`, `kinnso_commission_rate = 30`; a `mission_participants` row for C → `participantId`.
3. A **merchant-source `mission_type='paid'`** mission with `paid_fee_amount = 1200`; a participant for C → `feeParticipantId`; two milestones; two submissions `submissionA` and `submissionB`, each starting at a non-approved status.
4. A `coupon_affiliate` merchant mission with a participant and one submission, for Task 3's assertion 7.

Declare `let missionId = ''`, `participantId`, `feeMissionId`, `feeParticipantId`, `submissionA`, `submissionB`, `couponSubmissionId` at suite scope.

- [ ] **Step 3: Write assertion 2 — cron replay is idempotent**

This is the single most important assertion in R10.1. It reproduces the nightly cron's exact call shape: `onConflict` on the natural key with `ignoreDuplicates` **unset**, so a re-run is a real `ON CONFLICT DO UPDATE` — the same UPDATE the trigger sees every night.

```ts
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
```

- [ ] **Step 4: Write assertion 6 — the revision cycle does not duplicate**

This is the case the participant-scoped partial index exists for.

```ts
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
```

- [ ] **Step 5: Add cleanup in `afterAll`**

Delete through `runPsql` in dependency-safe order, guarded so a partial seed still cleans up. Deleting the `auth.users` rows cascades most of it; delete `mission_settlements`, `affiliate_network_events`, `mission_milestone_submissions` explicitly first, since those are not all cascade-linked to the user.

- [ ] **Step 6: Run it**

```bash
pnpm --filter web exec vitest run tests/settlement-minting.rls.test.ts
```

Expected: 2 passing, **not skipped**. A skip means `.env.test` is wrong — go back to Task 1 Step 5.

If assertion 2 reports `count` of 3, the `ON CONFLICT` predicate in `20260815100100` does not match the partial index and Postgres silently declined to infer it. If it reports 0, the trigger is not firing at all — check `event_state` and the attribution guard.

- [ ] **Step 7: Commit**

```bash
git add apps/web/tests/settlement-minting.rls.test.ts
git commit -m "test(r10.1): prove cron replay and the revision cycle mint exactly once"
```

---

### Task 3: The remaining six assertions

**Files:**
- Modify: `apps/web/tests/settlement-minting.rls.test.ts`

- [ ] **Step 1: Add assertion 1 — amount correctness**

Insert an `affiliate_network_events` row with `event_state='paid'`, full attribution, and `profit_amount = 100`. Assert exactly one settlement is minted with `creator_commission_amount === 70` (100 × 70 ÷ 100, rounded to 2dp) and `amount_currency === 'USD'` (the trigger uppercases the stored `'usd'`).

- [ ] **Step 2: Add assertion 3 — the processing→paid transition**

Insert an event with `event_state='processing'`; assert zero settlements. Update it to `'paid'`; assert exactly one. Update it again while still `'paid'` (change any unrelated column); assert still exactly one.

- [ ] **Step 3: Add assertion 4 — the three guard cases**

Three separate events, each asserting zero settlements minted:
- `event_state = 'processing'`
- `mission_participant_id = null` (with everything else populated)
- attributed to a mission whose `creator_commission_rate` is `null`

Seed the third mission inside this test rather than in `beforeAll`, so its null rate cannot affect other assertions.

- [ ] **Step 4: Add assertion 5 — mission-fee shape**

Approve a submission on the `paid` merchant mission. Assert exactly one settlement with `paid_fee_amount === 1200`, `creator_commission_amount === null`, and `creator_payout_status === 'pending'`.

`creator_commission_amount` being NULL is load-bearing, not incidental: R10.0's read model sums `creator_commission_amount + paid_fee_amount`, so writing both would double the fee on the creator's earnings page.

Use a participant distinct from `feeParticipantId` so this does not collide with assertion 6.

- [ ] **Step 5: Add assertion 7 — missions that must mint nothing**

Approve the `coupon_affiliate` mission's submission; assert zero settlements. Then approve a submission on a **travelpayouts-source** mission; assert zero. Travelpayouts missions earn through affiliate conversions, so minting a fee as well would pay twice for the same work.

- [ ] **Step 6: Add assertion 8 — R10.0's anti-double-count, with real rows**

```ts
  it('keeps minted settlements out of tracked_affiliate and invisible to other creators', async () => {
    const cClient = clientFor(creatorC)
    const dClient = clientFor(creatorD)

    const { data: cData } = await cClient.rpc('creator_earnings_summary')
    const c = cData as unknown as {
      mission_settlements: { id: string }[]
      tracked_affiliate: { id: string }[]
    }

    expect(c.mission_settlements.length).toBeGreaterThan(0)
    // Every event that produced a settlement must have dropped out of tracked_affiliate.
    const trackedIds = c.tracked_affiliate.map((t) => t.id)
    expect(trackedIds).not.toContain(paidEventId)

    const { data: dData } = await dClient.rpc('creator_earnings_summary')
    const dSummary = dData as unknown as { mission_settlements: { id: string }[] }
    expect(dSummary.mission_settlements).toEqual([])
  }, testTimeout)
```

Declare `paidEventId` at suite scope and assign it in assertion 1. This is the clause R10.0 wrote and R10.1 finally exercises: money is counted once, as a settlement, and never also as tracked volume.

- [ ] **Step 7: Run the whole suite twice, back to back**

```bash
pnpm --filter web exec vitest run tests/settlement-minting.rls.test.ts
pnpm --filter web exec vitest run tests/settlement-minting.rls.test.ts
```

Expected: 8 passing both times. Two consecutive green runs prove the seed/cleanup cycle is repeatable rather than a one-shot that leaves residue.

- [ ] **Step 8: Commit**

```bash
git add apps/web/tests/settlement-minting.rls.test.ts
git commit -m "test(r10.1): cover amount math, guard cases and the anti-double-count clause"
```

---

### Task 4: Full gate, restore the environment, open the PR

**Files:**
- Modify (restore): `supabase/config.toml`, `apps/web/.env.test`

- [ ] **Step 1: Run the repo gate while the stack is still up**

```bash
pnpm typecheck
pnpm --filter web lint
pnpm honesty:lint
pnpm --filter web test
```

Expected: typecheck `8 successful, 8 total`; lint `0 errors` (16 pre-existing warnings are fine); `honesty:lint` exit 0.

For the test suite: with a stack running, far more suites execute than usual. Compare against `main`, which fails **22 tests across 8 files** *without* a stack (`analytics.client`, `analytics.entity-view`, `articles.queries`, `kinnso.AnalyticsConsentBanner`, `queries.detail`, `rls`, `search.rpc`, `sitemap`). With a stack up, most of those should now pass. Any failure in a file **outside** that set is a real regression from R10.1 — investigate it, do not absorb it.

- [ ] **Step 2: Capture the backfill row count for the PR**

```bash
docker exec -i supabase_db_kinnso-v3 psql -U postgres -d postgres -t -A -c \
  "select count(*) from public.mission_settlements where affiliate_network_event_id is not null;"
```

Record the number. The plan requires it in the PR because `20260815100300` is a backfill over real conversion data in production, and the operator applying it needs to know what to expect.

- [ ] **Step 3: Stop the stack and restore both files**

```bash
npx --no-install supabase stop --no-backup
git checkout supabase/config.toml
cp ~/.kinnso-r10-1-backup/env.test.bak apps/web/.env.test
git status --porcelain
```

Expected: `git status` shows only the untracked/committed test file — `config.toml` clean, no stray modifications. Confirm `.env.test` is back to its original key set.

Leave the other project's containers alone; `supabase stop` here only stops the `kinnso-v3` project.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/r10-1-settlement-minting
gh pr create --base main --head feat/r10-1-settlement-minting \
  --title "Phase R10.1 — Settlement minting (make the money real)" \
  --body "$(cat <<'BODY'
## Summary

R10.0 made creator earnings *visible*. Nothing wrote `mission_settlements`, so the page was empty by construction. This phase mints those rows.

- **Two partial unique indexes ship first**, deliberately, so no trigger ever exists without the constraint that makes it safe. Postgres cannot infer an `ON CONFLICT` target from a non-unique index, and every mint path repeats the partial predicate verbatim.
- **Affiliate mint** fires on `after insert or update` of `affiliate_network_events`, because the nightly cron upserts without `ignoreDuplicates` — a conversion moving `processing → paid` arrives as a real UPDATE.
- **Mission-fee mint** fires on approved submissions. `SECURITY DEFINER` is mandatory: the approver is a *merchant*, while `mission_settlements` INSERT is ops-only under RLS. It deliberately does **not** call `ops_audit_log_append()`, which raises `forbidden` for a non-ops actor and would abort the merchant's approval.
- **Backfill** for conversions already paid before the trigger existed. Mission fees are deliberately *not* backfilled — nothing records the fee in force at approval time.
- **Ops payouts queue** gains a `source` facet (affiliate / mission_fee / manual).

Every minted row is an **obligation, not a payment**: `status='pending'`, `creator_payout_status='pending'`. Nothing here marks anything paid — that is R10.2.

## Test Plan

- [x] All four migrations apply on a clean `db reset` (105 total)
- [x] Both indexes verified UNIQUE **and** partial; both trigger functions `security definer`, `search_path`-pinned, EXECUTE revoked from anon and service_role
- [x] Live suite, 8 assertions, run twice: cron replay mints exactly once; the `approved → revision_requested → approved` cycle mints exactly once; a second milestone mints nothing; amount math correct; guard cases mint nothing; minted events drop out of `tracked_affiliate`; creator D sees none of C's rows
- [x] `pnpm typecheck` · `pnpm lint` · `pnpm honesty:lint` · full web suite with no regressions outside main's known baseline

## Not in this PR

**No migration is applied to production.** Apply them in filename order following `docs/ops/r10-0-migration-ledger-baseline.md` — never a bare `db push`. `20260815100300` is a backfill over real conversion data; the row count it inserted locally is noted above.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

Replace the row-count reference with the actual number from Step 2 before creating the PR.

---

## Plan self-review

**Spec coverage.** Stack bring-up and the three environment quirks → Task 1. The two phase-carrying assertions → Task 2. The remaining six → Task 3. Gate, backfill count, restore, PR → Task 4. The one item deliberately excluded is `packages/db/types.ts`: regeneration was already attempted and produced only *pre-existing* drift (a `graphql_public` block and the missing `traveller_analytics_ip_rate_limits` table from migration `20260805120000`). R10.1 contributes nothing to that file — no table, no callable RPC — so committing a regen here would bundle unrelated drift into this PR. Filed as a separate concern.

**Placeholder scan.** Both phase-carrying assertions are given in full. Assertions 1, 3, 4, 5 and 7 are specified by exact values and expected counts rather than pasted code, because each is a three-line variation on the same seed-then-count shape already shown twice — repeating it five more times would pad the plan without adding information. Assertion 8 is given in full because its cast and the `tracked_affiliate` check are easy to get wrong.

**Type consistency.** `participantId` / `feeParticipantId` / `submissionA` / `submissionB` / `paidEventId` are used identically in Tasks 2 and 3, and Task 3 Step 6 states explicitly that `paidEventId` is declared at suite scope and assigned in assertion 1. `runPsql`, `clientFor`, `svc`, `hookTimeout`, `testTimeout` all match the R10.0 harness being copied.
