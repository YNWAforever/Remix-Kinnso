# Phase R10.0 - Unified Earnings Read Model Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** A creator who drove real money — an affiliate conversion, a confirmed booking, or a mission fee — can see it on `/studio/earnings`, with each amount labelled by what it actually is and whether it is payable yet.

**Architecture:** One owner-gated `SECURITY DEFINER` RPC, `creator_earnings_summary()`, returning a single `jsonb` object, mirroring `creator_insights()` (`supabase/migrations/20260627180000_insights_rpcs.sql`). The RPC is not a convenience — `public.booking_settlements` has every privilege revoked from `anon` and `authenticated` (`20260704141000_r3b_fix_booking_settlements_table_grant.sql:8`), so booking commission is unreachable from the cookie-bound SSR client by any means other than a definer function. `/studio/earnings` is rebuilt on that one round trip and renders three separately-labelled sections. This phase adds **no write path of any kind**.

**Tech Stack:** Postgres/plpgsql (SECURITY DEFINER RPC), Supabase RLS + function grants, Next.js App Router Server Components, React, TypeScript, Vitest, the seven KINNSO locale dictionaries.

## Why this phase

`/studio/earnings` is structurally always empty. It reads exactly one table:

~~~
export async function listCreatorSettlements(
  supabase: SupabaseClient<Database>,
) {
  return supabase
    .from('mission_settlements')
    .select(creatorSettlementSelect)
    .order('updated_at', { ascending: false })
}
~~~

(`apps/web/lib/missions/queries.ts:113-120`) — and **nothing in the repository ever inserts a `mission_settlements` row**. Verified: zero hits for `insert into public.mission_settlements` across all 100 migrations, and the only TypeScript references are two reads (`queries.ts:117`, `:124`) and one update (`actions.ts:511`).

Meanwhile two other money streams do produce rows and neither is visible to the creator:

- `create_booking_settlement_on_confirm()` (`20260704140000`) hard-codes a 10% creator commission into `booking_settlements` on every confirmed booking. `/studio/earnings` never reads that table, and cannot: it is revoked from `authenticated`.
- The Travelpayouts cron (`apps/web/app/api/cron/travelpayouts-sync/route.ts`, daily at `0 3 * * *`) lands attributed conversions in `affiliate_network_events` with `creator_id` populated. Nothing turns them into earnings.

R10.0 makes the existing money legible. R10.1 mints the missing settlement rows. Doing the read model first means the minting phase has a truthful surface to land on, and it can ship with zero write risk.

## Global Constraints

- **Never touch the live database.** Add migration files only. Do not run `supabase db push`, do not run `supabase migration repair`, do not apply SQL to project `scryfkefedzuetfdtrvl` by any route including the Supabase MCP. All verification runs against a local stack (`supabase start` / `supabase db reset`). This applies to every task and to every subagent executing any task.
- **`pnpm --filter @kinnso/db gen` is forbidden in this phase.** That script is `supabase gen types typescript --linked` (`packages/db/package.json:8`) — it reads the *production* project. Regenerate against the local stack instead (Task 5, Step 3).
- Never edit a shipped migration. Add a new timestamped file; every new file must sort strictly after `20260805120400_creator_social_handle_format.sql`, the highest stamp in the tree.
- Honesty rules from R7.3 hold without exception: never state a count, an earning, or an availability that is not backed by a row. Money that is tracked but not payable must be labelled as such and must **not** be added into any total.
- Amounts come from `mission_settlements`, `booking_settlements`, or `affiliate_network_events`, or they are not shown. No projections, no examples, no "estimated" figures.
- Every new SECURITY DEFINER function carries `set search_path = public`, an internal ownership gate that `raise`s rather than returning empty, and the explicit revoke/grant pair. Supabase's default privileges re-grant EXECUTE to `anon`, `authenticated` *and* `service_role` on every new public function (`20260627155000_harden_contribution_function_grants.sql:29-31`), so each role must be named.
- Add every new visible label to all seven locales — `en, zh-hk, zh-tw, ja, ko, th, zh-cn` — at the same position in each file. `tests/i18n.locale-parity.test.ts` must stay green.
- Use TDD: write a failing test, run it, implement the smallest change, rerun the focused test, then commit each task.
- Per-task test command is `pnpm --filter web exec vitest run tests/<file>`. Do **not** use `pnpm --filter web test -- <pattern>` — it does not scope and runs the whole 2300-test suite.

## Non-goals

- Any write path: no settlement minting, no payout batches, no notifications. Those are R10.1, R10.2, R10.3.
- Changing `/studio` (the dashboard). It calls `listCreatorSettlements` + `summarizeCreatorEarnings` inside its existing `Promise.all` (`apps/web/app/[locale]/studio/page.tsx:65, 94-96`). R9.1's "zero additional round trips on `/studio`" constraint holds; the dashboard keeps its current cheap read and is untouched.
- Deleting `/ops/settlements` or `updateSettlementAction`. That unaudited write path is retired in R10.2, deliberately, so this phase stays read-only.
- Migrating studio pages that do not currently check role (`/studio/guides`, `/studio/sessions`, `/studio/sessions/new`, both `[id]/edit` pages) to a creator gate. Tightening them is a real behaviour change — any signed-in traveller or merchant can load them today — and belongs in its own change with its own tests.
- `/studio/scan` and `/studio/inbox` keep their current gating. `scan`'s anon demo branch is deliberate; `inbox` is a Coming-Soon stub with no Supabase client at all.

---

## File Map

### Task 1 - Record the migration-ledger baseline decision

- Create: `docs/ops/r10-0-migration-ledger-baseline.md` - the recorded reconciliation decision Gate G0 requires before R10's first migration.

### Task 2 - `requireCreatorPage`, the missing page guard

- Modify: `apps/web/lib/admin/guard.ts` - add the creator page gate beside `requireOpsPage`.
- Modify: `apps/web/tests/admin.guard.test.ts` - cover anon, non-creator, creator, and both denial modes.

### Task 3 - Adopt the guard on the eight role-checking studio pages

- Modify: `apps/web/app/[locale]/studio/{earnings,copilot,missions,offers,perks}/page.tsx` and `studio/missions/[id]/page.tsx` - variant A (`notFound`).
- Modify: `apps/web/app/[locale]/studio/{insights,tier}/page.tsx` - variant B (`redirect` to the studio hub).

### Task 4 - `creator_earnings_summary()` migration

- Create: `supabase/migrations/20260815090000_r10_0_creator_earnings_summary.sql` - the owner-gated jsonb aggregator.
- Create: `apps/web/tests/db.creator-earnings-summary.test.ts` - migration-text contract, no database required.

### Task 5 - TypeScript wrapper and totals

- Create: `apps/web/lib/missions/earnings-summary.ts` - `getCreatorEarningsSummary` + `summarizeSettledEarnings`.
- Create: `apps/web/tests/mission.earnings-summary.test.ts` - mapping, numeric coercion, totals exclude tracked, error propagation.
- Modify: `packages/db/types.ts` - the generated entry for the new RPC (from the **local** stack).

### Task 6 - Rebuild the earnings surface

- Modify: `apps/web/components/kinnso/pages/StudioEarningsView.tsx` - three labelled sections, per-section empty states.
- Modify: `apps/web/app/[locale]/studio/earnings/page.tsx` - call the RPC, use the new guard.
- Modify: `apps/web/tests/kinnso.StudioEarningsView.test.tsx` - section rendering and the totals-exclude-tracked contract.
- Modify: `apps/web/tests/studio.earnings.host.test.tsx` - update mocks for the new data source.

### Task 7 - Locales

- Modify: `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,ja,ko,th,zh-cn}.ts` - ten new `studioEarnings` keys.
- Modify: `apps/web/tests/i18n.locale-parity.test.ts` - an explicit contract that `trackedNote` does not promise payment.

### Task 8 - Local live verification and the full gate

- Review: all Task 2-7 files.

---

### Task 1: Record the migration-ledger baseline decision

Gate G0 requires the R7.0 Track C finding — local migration files and production history are not 1:1 (87 files / 91 rows / 17 exact matches as of 2026-07-12) — to be resolved before R10's first migration, with the decision recorded in this plan's phase. The decision is **baseline and move forward**: accept current production as the baseline, document the divergence, and require one consistent apply path from R10 onward. No history is rewritten.

**Files:**
- Create: `docs/ops/r10-0-migration-ledger-baseline.md`

**Steps:**

- [ ] Step 1: Create `docs/ops/r10-0-migration-ledger-baseline.md` with exactly this content:

~~~markdown
# Migration ledger baseline (R10.0)

## Decision

Production's `supabase_migrations.schema_migrations` ledger is accepted as the baseline as of
R10.0. Divergence between local migration filenames and production ledger rows that predates
`20260805120400_creator_social_handle_format.sql` is recorded here and is **not** reconciled
retroactively. No shipped migration is edited and no ledger row is rewritten.

## Why

R7.0 Track C found local files and production history are not 1:1 (87 files / 91 rows / 17 exact
matches as of 2026-07-12). The cause is historical: some migrations were applied through the
Supabase MCP `apply_migration` tool, which stamps its own version, while the file on disk carries a
different timestamp. The *schema* agrees; the *ledger* does not.

Rewriting the ledger to match the files would mean asserting a history that did not happen, and a
mistaken repair drops or double-applies a migration on a database holding real bookings and real
creator rows. The schema is what the application depends on, and the schema is correct.

## The rule from R10.0 onward

1. Every new migration is a new timestamped file under `supabase/migrations/`, sorting strictly
   after the highest stamp already present.
2. Migrations are applied by exactly one route per environment. Never run a bare
   `supabase db push` against production — this repository's ledger drift makes its
   file-vs-ledger diff unreliable, and it may attempt to replay already-applied migrations.
   Use `supabase db query --linked -f <file>` for a single deliberate apply, or
   `supabase migration repair --status applied <version>` to record one that was applied
   out of band.
3. Local verification always runs against a clean local stack (`supabase db reset`), which
   replays every file in order and is the real regression check on migration ordering.
4. Type generation for a phase in flight uses `--local`, never `--linked`.

## Verification of this baseline

Before R10.0's migration is applied to production, an operator runs, and records the output in
the phase PR:

~~~bash
supabase migration list --linked
~~~

The expected reading: local-only entries are the new R10 files; remote-only entries are the
known pre-R10 drift described above. Any remote-only entry dated after
`20260805120400` is NOT known drift and blocks the apply until explained.
~~~

- [ ] Step 2: Commit.

~~~bash
git add docs/ops/r10-0-migration-ledger-baseline.md
git commit -m "docs(r10.0): record migration-ledger baseline decision"
~~~

**Verification:**

~~~bash
test -f docs/ops/r10-0-migration-ledger-baseline.md && echo OK
~~~

Expected: `OK`. No database command is run in this task.

---

### Task 2: `requireCreatorPage`, the missing page guard

`apps/web/lib/admin/guard.ts` exports five functions. `requireOpsPage` is the only page-level guard; the other four are action guards returning `ActionFailure`. There is no `requireCreatorPage` — verified absent repo-wide — so eight studio pages hand-roll the same gate in two different denial styles.

A single fixed-behaviour helper cannot express both: six pages `notFound()` a non-creator, two `redirect()` to the studio hub, and `apps/web/tests/studio.insights.host.test.tsx` asserts `NEXT_REDIRECT:/en/studio` by exact message while `apps/web/tests/studio.perks.host.test.tsx` asserts `NEXT_NOT_FOUND`. The helper therefore takes an explicit denial mode and **preserves every page's current behaviour exactly**.

**Files:**
- Modify: `apps/web/tests/admin.guard.test.ts`
- Modify: `apps/web/lib/admin/guard.ts`

**Interfaces:**
- `requireCreatorPage(supabase: Supabase, loc: Locale, denied?: 'not-found' | 'studio'): Promise<{ user: { id: string } }>` — default `'not-found'`, matching the majority variant.

**Steps:**

- [ ] Step 1: Add the failing tests to the end of `apps/web/tests/admin.guard.test.ts`, and add `requireCreatorPage` to the existing import statement on line 12 so it reads `import { requireOpsPage, requireOpsAction, requireCreatorAction, requireCreatorPage } from '@/lib/admin/guard'`:

~~~ts
describe('requireCreatorPage', () => {
  it('redirects an anonymous visitor to sign-in', async () => {
    // `as never` matches the cast the existing suite already uses: getUserMock's inferred
    // type requires `user: { id: string }`, so a bare null fails tsc with TS2322.
    getUserMock.mockResolvedValue({ data: { user: null } } as never)
    await expect(requireCreatorPage(sb(), 'en')).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })

  it('notFounds a non-creator by default', async () => {
    roleMock.mockResolvedValue('traveler')
    await expect(requireCreatorPage(sb(), 'en')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('redirects a non-creator to the studio hub in studio mode', async () => {
    roleMock.mockResolvedValue('traveler')
    await expect(requireCreatorPage(sb(), 'en', 'studio')).rejects.toThrow('NEXT_REDIRECT:/en/studio')
  })

  it('treats creator-pending as a non-creator', async () => {
    roleMock.mockResolvedValue('creator-pending')
    await expect(requireCreatorPage(sb(), 'en')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('returns the user for an active creator', async () => {
    roleMock.mockResolvedValue('creator')
    await expect(requireCreatorPage(sb(), 'en')).resolves.toEqual({ user: { id: 'u1' } })
  })

  it('uses the locale it is given in both denial paths', async () => {
    // `as never` matches the cast the existing suite already uses: getUserMock's inferred
    // type requires `user: { id: string }`, so a bare null fails tsc with TS2322.
    getUserMock.mockResolvedValue({ data: { user: null } } as never)
    await expect(requireCreatorPage(sb(), 'zh-hk')).rejects.toThrow('NEXT_REDIRECT:/zh-hk/sign-in')
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    roleMock.mockResolvedValue('merchant')
    await expect(requireCreatorPage(sb(), 'ja', 'studio')).rejects.toThrow('NEXT_REDIRECT:/ja/studio')
  })
})
~~~

- [ ] Step 2: Run the test and confirm it fails for the right reason.

~~~bash
pnpm --filter web exec vitest run tests/admin.guard.test.ts
~~~

Expected: FAIL — `requireCreatorPage is not a function` (or a TypeScript import error).

- [ ] Step 3: Add the helper to `apps/web/lib/admin/guard.ts`, immediately after `requireOpsPage` and before `requireOpsAction`:

~~~ts
/**
 * Page gate: redirect anon to sign-in, then deny non-creators. Returns the creator user.
 *
 * `denied` exists because the studio's eight role-checking pages historically split into
 * two behaviours and both are asserted by host tests: six `notFound()` (the default here),
 * while /studio/insights and /studio/tier `redirect()` to the hub. This helper preserves
 * each page's existing behaviour rather than silently unifying it.
 *
 * `creators.id` IS `auth.uid()`, so the returned `user.id` is directly usable as a
 * creator id — same rule requireCreatorAction documents.
 */
export async function requireCreatorPage(
  supabase: Supabase,
  loc: Locale,
  denied: 'not-found' | 'studio' = 'not-found',
): Promise<{ user: { id: string } }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'creator') {
    if (denied === 'studio') redirect(`/${loc}/studio`)
    notFound()
  }
  return { user }
}
~~~

- [ ] Step 4: Run the test again.

~~~bash
pnpm --filter web exec vitest run tests/admin.guard.test.ts
~~~

Expected: PASS, all cases green.

- [ ] Step 5: Commit.

~~~bash
git add apps/web/lib/admin/guard.ts apps/web/tests/admin.guard.test.ts
git commit -m "feat(r10.0): add requireCreatorPage guard with explicit denial mode"
~~~

**Verification:**

~~~bash
pnpm --filter web exec vitest run tests/admin.guard.test.ts
pnpm typecheck
~~~

---

### Task 3: Adopt the guard on the eight role-checking studio pages

Pure refactor. Every page's observable behaviour — including which locale it denies with and whether it `notFound`s or redirects — is unchanged, so all existing host tests must stay green **without modification**. If a host test needs editing, the refactor is wrong.

Do not touch `/studio` (hub), `/studio/guides`, `/studio/guides/new`, `/studio/guides/[id]/edit`, `/studio/sessions`, `/studio/sessions/new`, `/studio/sessions/[id]/edit`, `/studio/scan`, or `/studio/inbox` — see Non-goals.

**Files:**
- Modify: `apps/web/app/[locale]/studio/earnings/page.tsx`
- Modify: `apps/web/app/[locale]/studio/copilot/page.tsx`
- Modify: `apps/web/app/[locale]/studio/missions/page.tsx`
- Modify: `apps/web/app/[locale]/studio/missions/[id]/page.tsx`
- Modify: `apps/web/app/[locale]/studio/offers/page.tsx`
- Modify: `apps/web/app/[locale]/studio/perks/page.tsx`
- Modify: `apps/web/app/[locale]/studio/insights/page.tsx`
- Modify: `apps/web/app/[locale]/studio/tier/page.tsx`

**Steps:**

- [ ] Step 1: Run the eight host tests first and record the baseline — they must be green before and after.

~~~bash
pnpm --filter web exec vitest run tests/studio.earnings.host.test.tsx tests/studio.copilot.host.test.tsx tests/studio.missions.host.test.tsx tests/studio.missions.detail.host.test.tsx tests/studio.offers.host.test.tsx tests/studio.perks.host.test.tsx tests/studio.insights.host.test.tsx tests/studio.tier.host.test.tsx
~~~

Expected: PASS.

- [ ] Step 2: In each of the six variant-A pages, replace this exact block:

~~~ts
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const role = await resolveViewerRole(supabase)
  if (role !== 'creator') notFound()
~~~

with:

~~~ts
  const supabase = await createSupabaseServerClient()
  const { user } = await requireCreatorPage(supabase, loc)
~~~

Note the two spelling variants in the existing files: `apps/web/app/[locale]/studio/missions/page.tsx` and `apps/web/app/[locale]/studio/missions/[id]/page.tsx` write the destructure across three lines (`const {\n    data: { user },\n  } = await supabase.auth.getUser()`), and `apps/web/app/[locale]/studio/perks/page.tsx` writes the role check inline as `if ((await resolveViewerRole(supabase)) !== 'creator') notFound()` with no `const role =` binding. All three collapse to the same two lines above.

- [ ] Step 3: In the two variant-B pages (`insights`, `tier`), replace their gate with the studio-denial mode. For `apps/web/app/[locale]/studio/insights/page.tsx`, replace:

~~~ts
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)
  if ((await resolveViewerRole(supabase)) !== 'creator') redirect(`/${loc}/studio`)
~~~

with:

~~~ts
  const supabase = await createSupabaseServerClient()
  await requireCreatorPage(supabase, loc, 'studio')
~~~

For `apps/web/app/[locale]/studio/tier/page.tsx`, replace:

~~~ts
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const role = await resolveViewerRole(supabase)
  if (role !== 'creator') redirect(`/${loc}/studio`)
~~~

with:

~~~ts
  const supabase = await createSupabaseServerClient()
  const { user } = await requireCreatorPage(supabase, loc, 'studio')
~~~

Leave both pages' `const loc: Locale = isLocale(locale) ? (locale as Locale) : 'en'` line exactly as it is. Those two pages deliberately do not `notFound()` on a bad locale; changing that is a separate behaviour change.

- [ ] Step 4: Fix imports in all eight files. Add `import { requireCreatorPage } from '@/lib/admin/guard'`. Then remove `resolveViewerRole` from the `@/lib/auth/viewer-role` import (delete the import line entirely if nothing else uses it), and remove `redirect` and/or `notFound` from the `next/navigation` import **only where no other call site remains** — `earnings`, `missions`, `missions/[id]`, `offers`, `perks` and `copilot` still call `notFound()` for the locale guard, and `copilot` still calls `redirect()` for its DNA check. `pnpm lint` will flag any unused import.

- [ ] Step 5: Re-run the eight host tests. They must pass **unmodified**.

~~~bash
pnpm --filter web exec vitest run tests/studio.earnings.host.test.tsx tests/studio.copilot.host.test.tsx tests/studio.missions.host.test.tsx tests/studio.missions.detail.host.test.tsx tests/studio.offers.host.test.tsx tests/studio.perks.host.test.tsx tests/studio.insights.host.test.tsx tests/studio.tier.host.test.tsx
~~~

Expected: PASS. Note these tests mock `@/lib/auth/viewer-role` wholesale, so the guard's internal call resolves through the same mock — no test-double change is needed.

- [ ] Step 6: Commit.

~~~bash
git add apps/web/app/\[locale\]/studio
git commit -m "refactor(r10.0): adopt requireCreatorPage across the role-gated studio pages"
~~~

**Verification:**

~~~bash
pnpm --filter web exec vitest run tests/studio.earnings.host.test.tsx tests/studio.insights.host.test.tsx tests/studio.perks.host.test.tsx
pnpm typecheck
pnpm lint
~~~

Expected: green, and zero unused-import errors.

---

### Task 4: `creator_earnings_summary()` migration

The RPC returns one `jsonb` object with three arrays. Modifiers and grants mirror `creator_insights()` exactly, with one deliberate tightening: the revoke names `authenticated` as well, matching the newest batch (`20260726090000_r7_7_profile_enquiries.sql:211-212`), before re-granting it.

Three details that a naive implementation gets wrong, all verified against the schema:

- `mission_settlements` has **no** `creator_id`. Attribution runs through `mission_participants.creator_id` via the nullable `mission_participant_id`. An inner join is correct: a settlement with no participant is not attributable to a creator.
- The currency column is `amount_currency` on `mission_settlements` but `currency` on `booking_settlements` and `affiliate_network_events`. Writing `currency` against `mission_settlements` is a "column does not exist" error.
- The tracked-affiliate array excludes any event that already has a settlement (`not exists ... affiliate_network_event_id = ev.id`). This is what stops R10.1 from double-counting: the moment minting creates a settlement for an event, that event leaves the "tracked" section and appears as a real settlement instead.

**Files:**
- Create: `apps/web/tests/db.creator-earnings-summary.test.ts`
- Create: `supabase/migrations/20260815090000_r10_0_creator_earnings_summary.sql`

**Steps:**

- [ ] Step 1: Write the failing migration-contract test at `apps/web/tests/db.creator-earnings-summary.test.ts`. This is the repo's established way to test migration SQL with no database (30 existing `db.*.test.ts` files use it); note `process.cwd()` is `apps/web`, hence `../../`:

~~~ts
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_0_creator_earnings_summary.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.0 creator_earnings_summary migration', () => {
  it('sorts after the last shipped migration', () => {
    expect(matches[0] > '20260805120400').toBe(true)
  })

  it('is a stable security definer function with a pinned search_path', () => {
    expect(sql).toContain('create or replace function public.creator_earnings_summary()')
    expect(sql).toContain('returns jsonb')
    expect(sql).toContain('stable')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
  })

  it('gates on an active creator and raises rather than returning empty', () => {
    expect(sql).toContain("from public.creators where id = v_uid and status = 'active'")
    expect(sql).toContain("raise exception 'forbidden' using errcode = '42501'")
  })

  it('revokes every client role by name before granting authenticated', () => {
    expect(sql).toContain('revoke all on function public.creator_earnings_summary() from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.creator_earnings_summary() to authenticated')
  })

  it('attributes mission settlements through mission_participants, not a creator_id column', () => {
    expect(sql).toContain('join public.mission_participants p on p.id = s.mission_participant_id')
    expect(sql).toContain('where p.creator_id = v_uid')
    expect(sql).not.toContain('mission_settlements.creator_id')
    // Alias-qualified form too. Every table reference in this function uses a short alias, so
    // the fully-qualified string above would NOT catch the bug it names — a naive attribution
    // via a nonexistent `s.creator_id` column would slip straight past it. The lookbehind is
    // required: a plain substring check also matches the harmless `bookings.creator_id` that
    // appears in a comment.
    expect(sql).not.toMatch(/(?<![a-z_])s\.creator_id/)
  })

  it('uses each table its own currency column', () => {
    expect(sql).toContain('s.amount_currency')
    expect(sql).toContain('bs.currency')
  })

  it('only counts booking rows that carry a creator leg', () => {
    expect(sql).toContain('where b.creator_id = v_uid')
    expect(sql).toContain('bs.creator_commission_amount is not null')
  })

  it('excludes already-settled affiliate events from the tracked list', () => {
    expect(sql).toContain('s2.affiliate_network_event_id = ev.id')
    expect(sql).toContain("ev.event_state in ('processing','paid')")
  })

  it('creates no table, no policy and no write path', () => {
    expect(sql).not.toContain('create table')
    expect(sql).not.toContain('create policy')
    expect(sql).not.toContain('insert into')
    expect(sql).not.toContain('update public.')
  })
})
~~~

- [ ] Step 2: Run it and confirm it fails.

~~~bash
pnpm --filter web exec vitest run tests/db.creator-earnings-summary.test.ts
~~~

Expected: FAIL at the module-scope `expect(matches).toHaveLength(1)` — the migration does not exist yet.

- [ ] Step 3: Create `supabase/migrations/20260815090000_r10_0_creator_earnings_summary.sql` with exactly this content:

~~~sql
-- R10.0: one owner-gated read model for everything a creator has actually earned.
--
-- /studio/earnings reads only public.mission_settlements (lib/missions/queries.ts:113-120),
-- and nothing in this repository inserts a row into that table — so the page is empty by
-- construction. Two other money streams do produce rows and neither is reachable:
--
--   * booking_settlements carries a 10% creator leg written by
--     create_booking_settlement_on_confirm() (20260704140000), but 20260704141000 revoked
--     ALL privileges on that table from anon and authenticated and never granted them back.
--     A definer function is the only way a creator can ever see it.
--   * affiliate_network_events carries attributed conversions from the daily Travelpayouts
--     cron, with creator_id populated from affiliate_partner_links.
--
-- This function is read-only. It creates no table, no policy and no write path; minting
-- settlement rows is R10.1.
--
-- Honesty boundary (R7.3): affiliate events are reported in their own array as tracked
-- volume and are deliberately NOT summed into any payable total by the caller. An event
-- that already has a settlement row is omitted here entirely, so once R10.1 mints from it
-- the money is counted once, as a settlement, and never twice.

create or replace function public.creator_earnings_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.creators where id = v_uid and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    -- Mission settlements. mission_settlements has no creator_id column; attribution is
    -- through mission_participants, which is also what mission_settlements_visible_select
    -- uses. The inner join is deliberate: a settlement with no participant is not
    -- attributable to any creator and must not appear on someone's earnings page.
    'mission_settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',             s.id,
        'mission_title',  m.title,
        'mission_type',   m.mission_type,
        'mission_source', m.mission_source,
        'currency',       upper(coalesce(s.amount_currency, 'USD')),
        'amount',         coalesce(s.creator_commission_amount, 0) + coalesce(s.paid_fee_amount, 0),
        'payout_status',  coalesce(s.creator_payout_status, 'pending')
      ) order by s.updated_at desc)
      from public.mission_settlements s
      join public.mission_participants p on p.id = s.mission_participant_id
      join public.missions m on m.id = s.mission_id
      where p.creator_id = v_uid
    ), '[]'::jsonb),

    -- Booking commission. bookings.creator_id is the attribution the Stripe path already
    -- enforces (validate_booking_insert, 20260805120300). creator_commission_amount is NULL
    -- when a booking had no attributed creator, so filter on it rather than reporting zeros.
    'booking_settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',                bs.id,
        'experience_title',  e.title,
        'currency',          upper(bs.currency),
        'amount',            bs.creator_commission_amount,
        'payout_status',     coalesce(bs.creator_commission_status, 'pending')
      ) order by bs.updated_at desc)
      from public.booking_settlements bs
      join public.bookings b on b.id = bs.booking_id
      join public.experiences e on e.id = b.experience_id
      where b.creator_id = v_uid
        and bs.creator_commission_amount is not null
    ), '[]'::jsonb),

    -- Tracked affiliate volume: recorded, not yet payable. 'cancelled' and 'unknown' are
    -- excluded — showing them would imply money that will never arrive. Events that already
    -- produced a settlement are excluded so nothing is counted twice.
    'tracked_affiliate', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',            ev.id,
        'mission_title', m.title,
        'currency',      upper(coalesce(ev.currency, 'USD')),
        'gross_amount',  coalesce(ev.profit_amount, 0),
        'event_state',   ev.event_state
      ) order by ev.external_updated_at desc nulls last)
      from public.affiliate_network_events ev
      left join public.missions m on m.id = ev.mission_id
      where ev.creator_id = v_uid
        and ev.event_state in ('processing','paid')
        and not exists (
          select 1 from public.mission_settlements s2
          where s2.affiliate_network_event_id = ev.id
        )
    ), '[]'::jsonb)
  );
end $$;

-- Supabase's default privileges re-grant EXECUTE to anon, authenticated and service_role on
-- every new public function (see 20260627155000), so each client role is named explicitly.
-- service_role keeps its default grant, matching creator_insights: the function is harmless
-- server-side (auth.uid() is null there, so the gate simply raises).
revoke all on function public.creator_earnings_summary() from public, anon, authenticated;
grant execute on function public.creator_earnings_summary() to authenticated;
~~~

- [ ] Step 4: Run the contract test.

~~~bash
pnpm --filter web exec vitest run tests/db.creator-earnings-summary.test.ts
~~~

Expected: PASS.

- [ ] Step 5: Commit.

~~~bash
git add supabase/migrations/20260815090000_r10_0_creator_earnings_summary.sql apps/web/tests/db.creator-earnings-summary.test.ts
git commit -m "feat(r10.0): add creator_earnings_summary owner-gated read model"
~~~

**Verification:**

~~~bash
pnpm --filter web exec vitest run tests/db.creator-earnings-summary.test.ts
~~~

Do **not** apply this migration to production. Local replay happens in Task 8.

---

### Task 5: TypeScript wrapper and totals

Mirrors `apps/web/lib/insights/creator.ts`: a private snake_case `Raw*` interface, a cast through `unknown` (the generator types a jsonb RPC as `Json`, so a direct cast will not typecheck), and a `num()` coercion because Postgres `numeric` arrives as a string over PostgREST — without it, money fields concatenate instead of adding.

`EarningsCurrencyTotal` is reused from `apps/web/lib/missions/earnings.ts` so the earnings page and the studio dashboard keep one shape. Nothing in `earnings.ts` is modified — the dashboard still uses it as-is.

**Files:**
- Create: `apps/web/tests/mission.earnings-summary.test.ts`
- Create: `apps/web/lib/missions/earnings-summary.ts`
- Modify: `packages/db/types.ts`

**Interfaces:**
- `getCreatorEarningsSummary(supabase: Client): Promise<CreatorEarningsSummary>`
- `summarizeSettledEarnings(missions: MissionEarningItem[], bookings: BookingEarningItem[]): EarningsCurrencyTotal[]` — a pure function, exported for direct unit testing.

**Steps:**

- [ ] Step 1: Write the failing test at `apps/web/tests/mission.earnings-summary.test.ts`:

~~~ts
import { describe, expect, it, vi } from 'vitest'
import { getCreatorEarningsSummary, summarizeSettledEarnings } from '@/lib/missions/earnings-summary'

function client(raw: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data: raw, error })) } as never
}

const raw = {
  mission_settlements: [
    {
      id: 'ms1',
      mission_title: 'Tokyo ramen crawl',
      mission_type: 'paid',
      mission_source: 'merchant',
      currency: 'HKD',
      amount: '1200.00',
      payout_status: 'pending',
    },
  ],
  booking_settlements: [
    {
      id: 'bs1',
      experience_title: 'Sunset harbour walk',
      currency: 'HKD',
      amount: '80.50',
      payout_status: 'paid',
    },
  ],
  tracked_affiliate: [
    {
      id: 'ev1',
      mission_title: 'Flight deals',
      currency: 'USD',
      gross_amount: '15.25',
      event_state: 'processing',
    },
  ],
}

describe('getCreatorEarningsSummary', () => {
  it('maps every section and coerces numeric strings to numbers', async () => {
    const result = await getCreatorEarningsSummary(client(raw))

    expect(result.missions).toEqual([
      {
        id: 'ms1',
        missionTitle: 'Tokyo ramen crawl',
        missionType: 'paid',
        missionSource: 'merchant',
        currency: 'HKD',
        amount: 1200,
        payoutStatus: 'pending',
      },
    ])
    expect(result.bookings[0].amount).toBe(80.5)
    expect(result.bookings[0].payoutStatus).toBe('paid')
    expect(result.tracked[0].grossAmount).toBe(15.25)
    expect(result.tracked[0].eventState).toBe('processing')
  })

  it('excludes tracked affiliate volume from the payable totals', async () => {
    const result = await getCreatorEarningsSummary(client(raw))

    // HKD only: 1200 pending (mission) + 80.50 paid (booking). The USD tracked row
    // is deliberately absent — it is recorded, not payable.
    expect(result.totals).toEqual([{ currency: 'HKD', paid: 80.5, pending: 1200 }])
    expect(result.totals.some((t) => t.currency === 'USD')).toBe(false)
  })

  it('returns empty sections rather than throwing when the creator has nothing', async () => {
    const result = await getCreatorEarningsSummary(
      client({ mission_settlements: [], booking_settlements: [], tracked_affiliate: [] }),
    )
    expect(result.missions).toEqual([])
    expect(result.bookings).toEqual([])
    expect(result.tracked).toEqual([])
    expect(result.totals).toEqual([])
  })

  it('tolerates missing arrays in the payload', async () => {
    const result = await getCreatorEarningsSummary(client({}))
    expect(result.missions).toEqual([])
    expect(result.totals).toEqual([])
  })

  it('throws when the RPC errors', async () => {
    await expect(getCreatorEarningsSummary(client(null, new Error('forbidden')))).rejects.toThrow('forbidden')
  })

  it('throws when the RPC returns no data', async () => {
    await expect(getCreatorEarningsSummary(client(null))).rejects.toThrow('creator_earnings_summary returned no data')
  })
})

describe('summarizeSettledEarnings', () => {
  it('buckets by currency and sorts alphabetically', () => {
    const totals = summarizeSettledEarnings(
      [
        { id: 'a', missionTitle: '', missionType: '', missionSource: '', currency: 'USD', amount: 10, payoutStatus: 'paid' },
        { id: 'b', missionTitle: '', missionType: '', missionSource: '', currency: 'HKD', amount: 5, payoutStatus: 'pending' },
      ],
      [{ id: 'c', experienceTitle: '', currency: 'HKD', amount: 2, payoutStatus: 'paid' }],
    )
    expect(totals).toEqual([
      { currency: 'HKD', paid: 2, pending: 5 },
      { currency: 'USD', paid: 10, pending: 0 },
    ])
  })

  it('treats any non-paid status as pending', () => {
    const totals = summarizeSettledEarnings(
      [{ id: 'a', missionTitle: '', missionType: '', missionSource: '', currency: 'HKD', amount: 7, payoutStatus: 'pending' }],
      [],
    )
    expect(totals).toEqual([{ currency: 'HKD', paid: 0, pending: 7 }])
  })
})
~~~

- [ ] Step 2: Run it and confirm it fails.

~~~bash
pnpm --filter web exec vitest run tests/mission.earnings-summary.test.ts
~~~

Expected: FAIL — cannot resolve `@/lib/missions/earnings-summary`.

- [ ] Step 3: Regenerate the database types **against the local stack only**. `pnpm --filter @kinnso/db gen` is `supabase gen types typescript --linked` and reads production — do not run it. Instead:

~~~bash
pnpm exec supabase start
pnpm exec supabase db reset
pnpm exec supabase gen types typescript --local > packages/db/types.ts
git diff --stat packages/db/types.ts
~~~

Expected: the only meaningful addition is a `creator_earnings_summary: { Args: never; Returns: Json }` entry in the `Functions` block (a zero-arg jsonb RPC types exactly like `creator_insights`). If the diff shows unrelated churn, discard it and hand-add only that one line — a noisy regeneration means the local stack and the migration set disagree, which is itself a finding to report.

- [ ] Step 4: Create `apps/web/lib/missions/earnings-summary.ts`:

~~~ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { EarningsCurrencyTotal } from '@/lib/missions/earnings'

type Client = SupabaseClient<Database>

export type EarningsPayoutStatus = 'paid' | 'pending'

export type MissionEarningItem = {
  id: string
  missionTitle: string
  missionType: string
  missionSource: string
  currency: string
  amount: number
  payoutStatus: EarningsPayoutStatus
}

export type BookingEarningItem = {
  id: string
  experienceTitle: string
  currency: string
  amount: number
  payoutStatus: EarningsPayoutStatus
}

/** Recorded affiliate volume that is not payable yet. Never summed into a total. */
export type TrackedAffiliateItem = {
  id: string
  missionTitle: string
  currency: string
  grossAmount: number
  eventState: string
}

export type CreatorEarningsSummary = {
  missions: MissionEarningItem[]
  bookings: BookingEarningItem[]
  tracked: TrackedAffiliateItem[]
  totals: EarningsCurrencyTotal[]
}

interface RawCreatorEarningsSummary {
  mission_settlements?: Array<{
    id: string
    mission_title: string | null
    mission_type: string | null
    mission_source: string | null
    currency: string | null
    amount: number | string | null
    payout_status: string | null
  }>
  booking_settlements?: Array<{
    id: string
    experience_title: string | null
    currency: string | null
    amount: number | string | null
    payout_status: string | null
  }>
  tracked_affiliate?: Array<{
    id: string
    mission_title: string | null
    currency: string | null
    gross_amount: number | string | null
    event_state: string | null
  }>
}

// Postgres numeric/bigint arrive as strings over PostgREST; without this, money fields
// concatenate instead of adding. Same helper shape as lib/insights/creator.ts.
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0))

const toPayoutStatus = (v: string | null): EarningsPayoutStatus => (v === 'paid' ? 'paid' : 'pending')

/**
 * Payable totals only. Tracked affiliate volume is excluded by construction: it is recorded,
 * not settled, and R7.3 forbids presenting it as money the creator has earned.
 */
export function summarizeSettledEarnings(
  missions: MissionEarningItem[],
  bookings: BookingEarningItem[],
): EarningsCurrencyTotal[] {
  const byCurrency = new Map<string, EarningsCurrencyTotal>()

  for (const item of [...missions, ...bookings]) {
    const entry = byCurrency.get(item.currency) ?? { currency: item.currency, paid: 0, pending: 0 }
    if (item.payoutStatus === 'paid') entry.paid += item.amount
    else entry.pending += item.amount
    byCurrency.set(item.currency, entry)
  }

  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency))
}

export async function getCreatorEarningsSummary(supabase: Client): Promise<CreatorEarningsSummary> {
  const { data, error } = await supabase.rpc('creator_earnings_summary')
  if (error || !data) throw error ?? new Error('creator_earnings_summary returned no data')
  const raw = data as unknown as RawCreatorEarningsSummary

  const missions: MissionEarningItem[] = (raw.mission_settlements ?? []).map((r) => ({
    id: r.id,
    missionTitle: r.mission_title ?? '',
    missionType: r.mission_type ?? '',
    missionSource: r.mission_source ?? '',
    currency: r.currency ?? 'USD',
    amount: num(r.amount),
    payoutStatus: toPayoutStatus(r.payout_status),
  }))

  const bookings: BookingEarningItem[] = (raw.booking_settlements ?? []).map((r) => ({
    id: r.id,
    experienceTitle: r.experience_title ?? '',
    currency: r.currency ?? 'USD',
    amount: num(r.amount),
    payoutStatus: toPayoutStatus(r.payout_status),
  }))

  const tracked: TrackedAffiliateItem[] = (raw.tracked_affiliate ?? []).map((r) => ({
    id: r.id,
    missionTitle: r.mission_title ?? '',
    currency: r.currency ?? 'USD',
    grossAmount: num(r.gross_amount),
    eventState: r.event_state ?? 'unknown',
  }))

  return { missions, bookings, tracked, totals: summarizeSettledEarnings(missions, bookings) }
}
~~~

- [ ] Step 5: Run the test.

~~~bash
pnpm --filter web exec vitest run tests/mission.earnings-summary.test.ts
~~~

Expected: PASS.

- [ ] Step 6: Commit.

~~~bash
git add apps/web/lib/missions/earnings-summary.ts apps/web/tests/mission.earnings-summary.test.ts packages/db/types.ts
git commit -m "feat(r10.0): add creator earnings summary wrapper and payable totals"
~~~

**Verification:**

~~~bash
pnpm --filter web exec vitest run tests/mission.earnings-summary.test.ts
pnpm typecheck
~~~

---

### Task 6: Rebuild the earnings surface

Three labelled sections. Each renders its own empty state, so a creator with booking commission but no missions sees the booking money rather than "No earnings yet". The tracked section is visually and textually separated and never contributes to the totals cards.

Two existing behaviours are also fixed here, both cheap and both correctness issues: the page currently discards `error` from the query (a DB failure renders identically to "no earnings"), and it calls `resolveViewerRole` without the already-verified user id, costing a second `auth.getUser()`. The RPC call replaces the first; `requireCreatorPage` from Task 2 keeps the second as-is (it matches `requireOpsPage`, and diverging here would be an undiscussed change).

**Files:**
- Modify: `apps/web/components/kinnso/pages/StudioEarningsView.tsx`
- Modify: `apps/web/app/[locale]/studio/earnings/page.tsx`
- Modify: `apps/web/tests/kinnso.StudioEarningsView.test.tsx`
- Modify: `apps/web/tests/studio.earnings.host.test.tsx`

**Steps:**

- [ ] Step 1: Replace `apps/web/tests/kinnso.StudioEarningsView.test.tsx` with:

~~~tsx
// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { StudioEarningsView } from '@/components/kinnso/pages/StudioEarningsView'
import en from '@/lib/i18n/messages/en'

// Required, not optional: this repo's vitest.config.ts does not set `globals: true`, so RTL's
// auto-cleanup never activates and DOM from one render leaks into the next test as
// "multiple elements found". Every multi-render test file in the repo does this.
afterEach(cleanup)

const empty = { missions: [], bookings: [], tracked: [], totals: [] }

const missions = [
  {
    id: 'ms1',
    missionTitle: 'Tokyo ramen crawl',
    missionType: 'paid',
    missionSource: 'merchant',
    currency: 'HKD',
    amount: 1200,
    payoutStatus: 'pending' as const,
  },
]
const bookings = [
  { id: 'bs1', experienceTitle: 'Sunset harbour walk', currency: 'HKD', amount: 80.5, payoutStatus: 'paid' as const },
]
const tracked = [
  { id: 'ev1', missionTitle: 'Flight deals', currency: 'USD', grossAmount: 15.25, eventState: 'processing' },
]

describe('StudioEarningsView', () => {
  it('shows a per-section empty state when the creator has nothing', () => {
    render(<StudioEarningsView t={en.studioEarnings} data={empty} />)
    expect(screen.getByText(en.studioEarnings.missionsEmpty)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.bookingsEmpty)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.trackedEmpty)).toBeTruthy()
  })

  it('renders booking commission even when there are no mission settlements', () => {
    render(<StudioEarningsView t={en.studioEarnings} data={{ ...empty, bookings }} />)
    expect(screen.getByText('Sunset harbour walk')).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.missionsEmpty)).toBeTruthy()
  })

  it('renders all three sections with their headings', () => {
    render(
      <StudioEarningsView
        t={en.studioEarnings}
        data={{ missions, bookings, tracked, totals: [{ currency: 'HKD', paid: 80.5, pending: 1200 }] }}
      />,
    )
    expect(screen.getByText(en.studioEarnings.missionsHeading)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.bookingsHeading)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.trackedHeading)).toBeTruthy()
    expect(screen.getByText('Tokyo ramen crawl')).toBeTruthy()
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })

  it('states that tracked volume is not payable', () => {
    render(<StudioEarningsView t={en.studioEarnings} data={{ ...empty, tracked, totals: [] }} />)
    expect(screen.getByText(en.studioEarnings.trackedNote)).toBeTruthy()
    // The row itself IS shown — it is real, recorded volume.
    expect(screen.getByText('Flight deals')).toBeTruthy()
  })

  it('renders no totals card when the only money is tracked, not payable', () => {
    render(<StudioEarningsView t={en.studioEarnings} data={{ ...empty, tracked, totals: [] }} />)
    // A totals card renders a ReceiptRow labelled t.paid; the mission/booking tables are
    // empty here, so no status badge can supply that text either. Its absence proves the
    // USD tracked row did not manufacture a USD totals card.
    expect(screen.queryByText(en.studioEarnings.paid)).toBeNull()
    expect(screen.queryByText(en.studioEarnings.pending)).toBeNull()
  })
})
~~~

- [ ] Step 2: Run it and confirm it fails.

~~~bash
pnpm --filter web exec vitest run tests/kinnso.StudioEarningsView.test.tsx
~~~

Expected: FAIL — the component still takes `totals`/`items` props, and `en.studioEarnings.missionsHeading` is undefined.

- [ ] Step 3: Replace `apps/web/components/kinnso/pages/StudioEarningsView.tsx` with:

~~~tsx
import React from 'react'
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import { ReceiptRow, TicketCard, TicketDivider } from '@/components/kinnso/MarketPassport'
import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorEarningsSummary } from '@/lib/missions/earnings-summary'

type StudioEarningsViewProps = {
  t: Messages['studioEarnings']
  data: CreatorEarningsSummary
}

function Section({
  heading,
  note,
  isEmpty,
  emptyLabel,
  children,
}: {
  heading: string
  note?: string
  isEmpty: boolean
  emptyLabel: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-black text-kinnso-ink">{heading}</h2>
      {note && <p className="mt-1 text-sm text-kinnso-muted">{note}</p>}
      {isEmpty ? (
        <p className="mt-3 text-sm text-kinnso-muted">{emptyLabel}</p>
      ) : (
        <TicketCard className="mt-3 overflow-x-auto p-0">{children}</TicketCard>
      )}
    </section>
  )
}

function Rows({ children }: { children: React.ReactNode[] }) {
  return (
    <tbody>
      {children.map((row, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <tr aria-hidden="true">
              <td colSpan={4} className="p-0">
                <TicketDivider />
              </td>
            </tr>
          )}
          {row}
        </React.Fragment>
      ))}
    </tbody>
  )
}

export function StudioEarningsView({ t, data }: StudioEarningsViewProps) {
  const { missions, bookings, tracked, totals } = data

  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.heading}</h1>
      <p className="mt-2 text-sm text-kinnso-muted">{t.subtitle}</p>

      {totals.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {totals.map((total) => (
            <TicketCard key={total.currency} className="p-5">
              <p className="text-sm font-bold text-kinnso-ink">{total.currency}</p>
              <dl className="mt-3 space-y-1">
                <ReceiptRow label={t.paid} value={total.paid.toLocaleString()} tone="positive" />
                <ReceiptRow label={t.pending} value={total.pending.toLocaleString()} />
              </dl>
            </TicketCard>
          ))}
        </div>
      )}

      <Section heading={t.missionsHeading} isEmpty={missions.length === 0} emptyLabel={t.missionsEmpty}>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-kinnso-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 pl-5 font-semibold">{t.colMission}</th>
              <th scope="col" className="py-2 pr-4 font-semibold">{t.colType}</th>
              <th scope="col" className="py-2 pr-4 font-semibold">{t.colAmount}</th>
              <th scope="col" className="py-2 pr-5 font-semibold">{t.colStatus}</th>
            </tr>
          </thead>
          <Rows>
            {missions.map((item) => (
              <tr key={item.id}>
                <td className="py-2 pr-4 pl-5 font-medium text-kinnso-ink">{item.missionTitle}</td>
                <td className="py-2 pr-4 capitalize text-kinnso-muted">{item.missionType.replaceAll('_', ' ')}</td>
                <td className="py-2 pr-4 tabular-nums text-kinnso-ink">{item.currency} {item.amount.toLocaleString()}</td>
                <td className="py-2 pr-5">
                  <MissionStatusBadge status={item.payoutStatus === 'paid' ? t.paid : t.pending} />
                </td>
              </tr>
            ))}
          </Rows>
        </table>
      </Section>

      <Section heading={t.bookingsHeading} isEmpty={bookings.length === 0} emptyLabel={t.bookingsEmpty}>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-kinnso-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 pl-5 font-semibold">{t.colExperience}</th>
              <th scope="col" className="py-2 pr-4 font-semibold">{t.colAmount}</th>
              <th scope="col" className="py-2 pr-5 font-semibold">{t.colStatus}</th>
            </tr>
          </thead>
          <Rows>
            {bookings.map((item) => (
              <tr key={item.id}>
                <td className="py-2 pr-4 pl-5 font-medium text-kinnso-ink">{item.experienceTitle}</td>
                <td className="py-2 pr-4 tabular-nums text-kinnso-ink">{item.currency} {item.amount.toLocaleString()}</td>
                <td className="py-2 pr-5">
                  <MissionStatusBadge status={item.payoutStatus === 'paid' ? t.paid : t.pending} />
                </td>
              </tr>
            ))}
          </Rows>
        </table>
      </Section>

      <Section
        heading={t.trackedHeading}
        note={t.trackedNote}
        isEmpty={tracked.length === 0}
        emptyLabel={t.trackedEmpty}
      >
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-kinnso-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 pl-5 font-semibold">{t.colMission}</th>
              <th scope="col" className="py-2 pr-4 font-semibold">{t.colGross}</th>
              <th scope="col" className="py-2 pr-5 font-semibold">{t.colState}</th>
            </tr>
          </thead>
          <Rows>
            {tracked.map((item) => (
              <tr key={item.id}>
                <td className="py-2 pr-4 pl-5 font-medium text-kinnso-ink">{item.missionTitle}</td>
                <td className="py-2 pr-4 tabular-nums text-kinnso-ink">{item.currency} {item.grossAmount.toLocaleString()}</td>
                <td className="py-2 pr-5 capitalize text-kinnso-muted">{item.eventState.replaceAll('_', ' ')}</td>
              </tr>
            ))}
          </Rows>
        </table>
      </Section>
    </main>
  )
}
~~~

- [ ] Step 4: Replace `apps/web/app/[locale]/studio/earnings/page.tsx` with:

~~~tsx
import { notFound } from 'next/navigation'
import { StudioEarningsView } from '@/components/kinnso/pages/StudioEarningsView'
import { requireCreatorPage } from '@/lib/admin/guard'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getCreatorEarningsSummary } from '@/lib/missions/earnings-summary'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string }>

export default async function StudioEarningsPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  await requireCreatorPage(supabase, loc)

  const data = await getCreatorEarningsSummary(supabase)

  return <StudioEarningsView t={messages.studioEarnings} data={data} />
}
~~~

Note the deliberate change in failure behaviour: `getCreatorEarningsSummary` throws on an RPC error rather than silently rendering an empty page, matching `/studio/insights`, which has called `getCreatorInsights` the same way since Phase 8.

- [ ] Step 5: Update `apps/web/tests/studio.earnings.host.test.tsx`. Its current mock of `@/lib/missions/queries` supplies only `listCreatorSettlements`, and its supabase double provides only `auth.getUser` — both must change. Replace the mock block and the assertions with:

~~~tsx
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { roleMock, getUserMock, summaryMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'creator'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'creator-1' } } })),
  summaryMock: vi.fn(async () => ({ missions: [], bookings: [], tracked: [], totals: [] })),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}))
vi.mock('@/lib/missions/earnings-summary', () => ({ getCreatorEarningsSummary: summaryMock }))

import StudioEarningsPage from '@/app/[locale]/studio/earnings/page'

beforeEach(() => {
  vi.clearAllMocks()
  roleMock.mockResolvedValue('creator')
  getUserMock.mockResolvedValue({ data: { user: { id: 'creator-1' } } })
  summaryMock.mockResolvedValue({ missions: [], bookings: [], tracked: [], totals: [] })
})

describe('/studio/earnings host', () => {
  it('notFounds an unknown locale', async () => {
    await expect(StudioEarningsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(summaryMock).not.toHaveBeenCalled()
  })

  it('redirects an anonymous visitor to sign-in', async () => {
    // `as never` matches the cast the existing suite already uses: getUserMock's inferred
    // type requires `user: { id: string }`, so a bare null fails tsc with TS2322.
    getUserMock.mockResolvedValue({ data: { user: null } } as never)
    await expect(StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
    expect(summaryMock).not.toHaveBeenCalled()
  })

  it('notFounds a non-creator and never reads earnings', async () => {
    roleMock.mockResolvedValue('traveler')
    await expect(StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(summaryMock).not.toHaveBeenCalled()
  })

  it('loads the summary for an active creator', async () => {
    await StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(summaryMock).toHaveBeenCalledTimes(1)
  })

  it('propagates an RPC failure instead of rendering an empty page', async () => {
    summaryMock.mockRejectedValue(new Error('forbidden'))
    await expect(StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('forbidden')
  })
})
~~~

- [ ] Step 6: Run both test files. They will still fail on the missing locale keys — that is expected and Task 7 fixes it.

~~~bash
pnpm --filter web exec vitest run tests/studio.earnings.host.test.tsx
~~~

Expected: PASS (the host test does not touch locale keys).

- [ ] Step 7: Commit (the view test stays red until Task 7; commit anyway so the task boundary is clean, or fold Steps 6-7 into Task 7's commit if you prefer a green tree at every commit).

~~~bash
git add apps/web/app/\[locale\]/studio/earnings/page.tsx apps/web/components/kinnso/pages/StudioEarningsView.tsx apps/web/tests/kinnso.StudioEarningsView.test.tsx apps/web/tests/studio.earnings.host.test.tsx
git commit -m "feat(r10.0): rebuild /studio/earnings on the unified summary"
~~~

**Verification:**

~~~bash
pnpm --filter web exec vitest run tests/studio.earnings.host.test.tsx
~~~

---

### Task 7: Locales

Ten new keys on the existing `studioEarnings` group. This is a **seven-file change plus the interface**: the `Messages` interface in `en.ts` (~line 934), the `en.ts` values block (~line 2183), and the same block in `zh-hk.ts` (~line 890), `zh-tw.ts`, `zh-cn.ts`, `ja.ts`, `ko.ts`, `th.ts`. Every non-`en` file is `const messages: Messages`, so a missed locale fails `tsc` as well as the parity test.

`studioEarnings` uses one key per line with four-space indent. Match that. Insert the new keys at the same position in all seven files.

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Modify: `apps/web/lib/i18n/messages/zh-hk.ts`
- Modify: `apps/web/lib/i18n/messages/zh-tw.ts`
- Modify: `apps/web/lib/i18n/messages/zh-cn.ts`
- Modify: `apps/web/lib/i18n/messages/ja.ts`
- Modify: `apps/web/lib/i18n/messages/ko.ts`
- Modify: `apps/web/lib/i18n/messages/th.ts`
- Modify: `apps/web/tests/i18n.locale-parity.test.ts`

**Steps:**

- [ ] Step 1: In `apps/web/lib/i18n/messages/en.ts`, extend the `studioEarnings` block of the `Messages` interface (currently 9 keys at lines 934-944) to:

~~~ts
  studioEarnings: {
    heading: string
    subtitle: string
    paid: string
    pending: string
    empty: string
    colMission: string
    colType: string
    colAmount: string
    colStatus: string
    missionsHeading: string
    missionsEmpty: string
    bookingsHeading: string
    bookingsEmpty: string
    colExperience: string
    trackedHeading: string
    trackedNote: string
    trackedEmpty: string
    colGross: string
    colState: string
  }
~~~

`empty` is retained: it is still referenced by other tests and removing it would widen this task into an unrelated cleanup.

- [ ] Step 2: In `apps/web/lib/i18n/messages/en.ts`, extend the `studioEarnings` values block (lines 2183-2193) to:

~~~ts
  studioEarnings: {
    heading: 'Earnings',
    subtitle: 'Track payouts from missions, bookings and affiliate commissions.',
    paid: 'Paid',
    pending: 'Pending',
    empty: 'No earnings yet. Completed missions and settled commissions will appear here.',
    colMission: 'Mission',
    colType: 'Type',
    colAmount: 'Amount',
    colStatus: 'Status',
    missionsHeading: 'Mission settlements',
    missionsEmpty: 'No mission settlements yet.',
    bookingsHeading: 'Booking commission',
    bookingsEmpty: 'No booking commission yet.',
    colExperience: 'Experience',
    trackedHeading: 'Tracked, not yet payable',
    trackedNote: 'These affiliate conversions are recorded but not settled. They are not included in your totals.',
    trackedEmpty: 'No tracked conversions.',
    colGross: 'Gross',
    colState: 'State',
  },
~~~

- [ ] Step 3: Add the same ten keys to the `studioEarnings` block of each remaining locale file, in the same order.

`apps/web/lib/i18n/messages/zh-hk.ts`:

~~~ts
    missionsHeading: '任務結算',
    missionsEmpty: '尚未有任務結算。',
    bookingsHeading: '預訂佣金',
    bookingsEmpty: '尚未有預訂佣金。',
    colExperience: '體驗',
    trackedHeading: '已記錄，尚未可支付',
    trackedNote: '這些聯盟轉換已記錄，但尚未結算，並未計入你的總額。',
    trackedEmpty: '尚未有已記錄的轉換。',
    colGross: '總額',
    colState: '狀態',
~~~

`apps/web/lib/i18n/messages/zh-tw.ts`:

~~~ts
    missionsHeading: '任務結算',
    missionsEmpty: '尚未有任務結算。',
    bookingsHeading: '預訂佣金',
    bookingsEmpty: '尚未有預訂佣金。',
    colExperience: '體驗',
    trackedHeading: '已記錄，尚未可支付',
    trackedNote: '這些聯盟轉換已記錄，但尚未結算，未計入你的總額。',
    trackedEmpty: '尚未有已記錄的轉換。',
    colGross: '總額',
    colState: '狀態',
~~~

`apps/web/lib/i18n/messages/zh-cn.ts`:

~~~ts
    missionsHeading: '任务结算',
    missionsEmpty: '尚无任务结算。',
    bookingsHeading: '预订佣金',
    bookingsEmpty: '尚无预订佣金。',
    colExperience: '体验',
    trackedHeading: '已记录，尚不可支付',
    trackedNote: '这些联盟转化已记录，但尚未结算，未计入你的总额。',
    trackedEmpty: '尚无已记录的转化。',
    colGross: '总额',
    colState: '状态',
~~~

`apps/web/lib/i18n/messages/ja.ts`:

~~~ts
    missionsHeading: 'ミッション精算',
    missionsEmpty: 'ミッションの精算はまだありません。',
    bookingsHeading: '予約コミッション',
    bookingsEmpty: '予約コミッションはまだありません。',
    colExperience: '体験',
    trackedHeading: '記録済み・未精算',
    trackedNote: 'これらのアフィリエイト成果は記録されていますが、精算されていません。合計には含まれません。',
    trackedEmpty: '記録された成果はまだありません。',
    colGross: '総額',
    colState: '状態',
~~~

`apps/web/lib/i18n/messages/ko.ts`:

~~~ts
    missionsHeading: '미션 정산',
    missionsEmpty: '아직 미션 정산이 없습니다.',
    bookingsHeading: '예약 커미션',
    bookingsEmpty: '아직 예약 커미션이 없습니다.',
    colExperience: '체험',
    trackedHeading: '기록됨, 아직 지급 불가',
    trackedNote: '이 제휴 전환은 기록되었지만 정산되지 않았습니다. 합계에 포함되지 않습니다.',
    trackedEmpty: '기록된 전환이 없습니다.',
    colGross: '총액',
    colState: '상태',
~~~

`apps/web/lib/i18n/messages/th.ts`:

~~~ts
    missionsHeading: 'ยอดจากภารกิจ',
    missionsEmpty: 'ยังไม่มียอดจากภารกิจ',
    bookingsHeading: 'ค่าคอมมิชชันจากการจอง',
    bookingsEmpty: 'ยังไม่มีค่าคอมมิชชันจากการจอง',
    colExperience: 'ประสบการณ์',
    trackedHeading: 'บันทึกแล้ว ยังจ่ายไม่ได้',
    trackedNote: 'รายการแอฟฟิลิเอตเหล่านี้ถูกบันทึกไว้แล้วแต่ยังไม่ได้ชำระเงิน และไม่รวมอยู่ในยอดรวมของคุณ',
    trackedEmpty: 'ยังไม่มีรายการที่บันทึกไว้',
    colGross: 'ยอดรวม',
    colState: 'สถานะ',
~~~

- [ ] Step 4: Add an explicit content contract to `apps/web/tests/i18n.locale-parity.test.ts`. Key parity cannot see a mistranslated claim — and this repo has already shipped a case where six locales promised something the English source deliberately did not. `trackedNote` makes a negative claim about payment in every locale, so assert it:

~~~ts
describe('studioEarnings tracked-volume honesty', () => {
  // The tracked section reports affiliate volume that is recorded but NOT settled.
  // Key parity cannot detect a translation that drops the negation and implies the
  // money is payable, so each locale's disclaimer is pinned to a marker it must contain.
  const NOT_PAYABLE_MARKER: Record<string, string> = {
    en: 'not settled',
    'zh-hk': '尚未結算',
    'zh-tw': '尚未結算',
    'zh-cn': '尚未结算',
    ja: '精算されていません',
    ko: '정산되지 않았습니다',
    th: 'ยังไม่ได้ชำระเงิน',
  }

  // The heading needs its own marker. A bare non-empty check would pass for ANY text,
  // including a heading that implied the money was available — which is precisely the
  // failure this block exists to prevent.
  const HEADING_MARKER: Record<string, string> = {
    en: 'not yet payable',
    'zh-hk': '尚未可支付',
    'zh-tw': '尚未可支付',
    'zh-cn': '尚不可支付',
    ja: '未精算',
    ko: '지급 불가',
    th: 'ยังจ่ายไม่ได้',
  }

  for (const locale of LOCALES) {
    it(`${locale} states that tracked volume is not settled`, async () => {
      const dict = await getDictionary(locale)
      expect(dict.studioEarnings.trackedNote).toContain(NOT_PAYABLE_MARKER[locale])
      expect(dict.studioEarnings.trackedHeading).toContain(HEADING_MARKER[locale])
    })
  }
})
~~~

- [ ] Step 5: Run the locale and view tests.

~~~bash
pnpm --filter web exec vitest run tests/i18n.locale-parity.test.ts tests/i18n.test.ts tests/kinnso.StudioEarningsView.test.tsx
~~~

Expected: PASS on all three.

- [ ] Step 6: Commit.

~~~bash
git add apps/web/lib/i18n/messages apps/web/tests/i18n.locale-parity.test.ts
git commit -m "i18n(r10.0): add earnings section keys across all seven locales"
~~~

**Verification:**

~~~bash
pnpm --filter web exec vitest run tests/i18n.locale-parity.test.ts tests/kinnso.StudioEarningsView.test.tsx
pnpm typecheck
~~~

---

### Task 8: Local live verification and the full gate

The migration must be proven against a real Postgres, not just asserted as text — specifically the ownership gate, the `booking_settlements` reachability that motivated the whole RPC, and the fact that creator D sees none of creator C's money.

**Files:**
- Create: `apps/web/tests/creator-earnings.rls.test.ts`
- Review: all Task 2-7 files.

**Steps:**

- [ ] Step 1: Start a clean local stack and replay every migration in order. This is the real regression check on migration ordering.

~~~bash
pnpm exec supabase start
pnpm exec supabase db reset
~~~

Expected: all 101 migrations apply with no error. If `db reset` fails, the new migration is the suspect — no other file changed.

- [ ] Step 2: Write `apps/web/tests/creator-earnings.rls.test.ts`. This is the harness — copy it verbatim; it reproduces the conventions of `apps/web/tests/mission.rls.test.ts` (self-skipping gate, `docker exec … psql` seeding, hand-signed HS256 JWT rather than `signInWithPassword`, module-scope timeouts, raw-SQL cleanup):

~~~ts
// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'
import { spawn } from 'node:child_process'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const dbContainer = process.env.SUPABASE_DB_CONTAINER
const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'

// Same gate shape as mission.rls.test.ts: skip wholesale rather than fail when the local
// Supabase stack is absent, so the suite is safe in an environment without Docker.
const d = svcKey && dbContainer && url && anonKey ? describe : describe.skip

const hookTimeout = 60000
const testTimeout = 15000
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

function runPsql(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', [
      'exec', '-i', dbContainer!, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
    ])
    let stderr = ''
    p.stderr.on('data', (c) => { stderr += String(c) })
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr))))
    p.stdin.write(sql)
    p.stdin.end()
  })
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

/** Hand-sign an HS256 access token; this repo never calls signInWithPassword in RLS suites. */
function clientFor(userId: string) {
  const header = b64({ alg: 'HS256', typ: 'JWT' })
  const payload = b64({
    sub: userId, role: 'authenticated', aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })
  const sig = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url')
  return createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${header}.${payload}.${sig}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const svc = () => createClient(url!, svcKey!, { auth: { persistSession: false, autoRefreshToken: false } })

const creatorC = '11111111-1111-4111-8111-111111111111'
const creatorD = '22222222-2222-4222-8222-222222222222'
const traveller = '33333333-3333-4333-8333-333333333333'

d('creator_earnings_summary', () => {
  beforeAll(async () => {
    // Seeded directly into auth.users AND auth.identities — the Admin API is not used here,
    // matching mission.rls.test.ts. Identifiers are namespaced by runId for isolation.
    await runPsql(`
      insert into auth.users (id, email, aud, role, instance_id, encrypted_password, email_confirmed_at)
      values
        ('${creatorC}', 'earn-c-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${creatorD}', 'earn-d-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${traveller}', 'earn-t-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now())
      on conflict (id) do nothing;

      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at)
      select id, id, id::text, 'email',
             jsonb_build_object('sub', id::text, 'email', email), now()
      from auth.users where id in ('${creatorC}', '${creatorD}', '${traveller}')
      on conflict do nothing;

      -- handle_new_user() gives every signup a blank creators row; force the states we need.
      update public.creators set status = 'active' where id in ('${creatorC}', '${creatorD}');
      update public.creators set status = 'onboarding' where id = '${traveller}';
    `)

    // Seed C's three money rows through the service client so RLS is not in the way of setup.
    // (Exact inserts: one merchant mission + participant + mission_settlements row; one
    // experience + availability + booking with creator_id = C, confirmed so the booking
    // trigger writes booking_settlements; one affiliate_network_events row with
    // event_state = 'paid', creator_id = C and a positive profit_amount.)
  }, hookTimeout)

  afterAll(async () => {
    await runPsql(`
      delete from public.mission_settlements where mission_participant_id in
        (select id from public.mission_participants where creator_id in ('${creatorC}', '${creatorD}'));
      delete from public.affiliate_network_events where creator_id in ('${creatorC}', '${creatorD}');
      delete from auth.users where id in ('${creatorC}', '${creatorD}', '${traveller}');
    `)
  }, hookTimeout)

  it('returns all three streams for the owning creator', async () => {
    const { data, error } = await clientFor(creatorC).rpc('creator_earnings_summary')
    expect(error).toBeNull()
    const payload = data as Record<string, unknown[]>
    expect(payload.mission_settlements.length).toBeGreaterThan(0)
    expect(payload.booking_settlements.length).toBeGreaterThan(0)
    expect(payload.tracked_affiliate.length).toBeGreaterThan(0)
  }, testTimeout)

  it('returns empty arrays — not an error, and not C\'s data — for another creator', async () => {
    const { data, error } = await clientFor(creatorD).rpc('creator_earnings_summary')
    expect(error).toBeNull()
    expect(data).toEqual({ mission_settlements: [], booking_settlements: [], tracked_affiliate: [] })
  }, testTimeout)

  it('rejects a signed-in non-creator', async () => {
    const { error } = await clientFor(traveller).rpc('creator_earnings_summary')
    expect(error).not.toBeNull()
    expect(/forbidden|42501/i.test(`${error?.message} ${error?.code}`)).toBe(true)
  }, testTimeout)

  it('is not executable by anon at all', async () => {
    // Function-privilege ACLs are asserted in-database, the idiom at mission.rls.test.ts:789-811.
    await expect(runPsql(`
      do $test$
      begin
        if has_function_privilege('anon', 'public.creator_earnings_summary()', 'EXECUTE') then
          raise exception 'anon must not hold EXECUTE on creator_earnings_summary';
        end if;
        if not has_function_privilege('authenticated', 'public.creator_earnings_summary()', 'EXECUTE') then
          raise exception 'authenticated must hold EXECUTE on creator_earnings_summary';
        end if;
      end $test$;
    `)).resolves.toBeUndefined()
  }, testTimeout)

  it('omits an affiliate event that already has a settlement row', async () => {
    // The anti-double-count rule R10.1 depends on: point a settlement at C's event, then
    // assert the event leaves tracked_affiliate.
    const s = svc()
    const { data: ev } = await s.from('affiliate_network_events')
      .select('id, mission_id, mission_participant_id').eq('creator_id', creatorC).limit(1).single()
    await s.from('mission_settlements').insert({
      mission_id: ev!.mission_id,
      mission_participant_id: ev!.mission_participant_id,
      affiliate_network_event_id: ev!.id,
      status: 'pending',
      amount_currency: 'USD',
      creator_commission_amount: 1,
      creator_payout_status: 'pending',
    })

    const { data } = await clientFor(creatorC).rpc('creator_earnings_summary')
    const payload = data as { tracked_affiliate: { id: string }[] }
    expect(payload.tracked_affiliate.some((t) => t.id === ev!.id)).toBe(false)
  }, testTimeout)
})
~~~

Fill in the `beforeAll` seed inserts described in its trailing comment using the exact column names from `20260617173932_mission_tables.sql`, `20260704090000_r2b_merchant_public_fields_and_experiences.sql` and `20260704110000_r3a1_traveler_role_and_booking_core.sql`. The booking must be inserted as `pending_payment` and then updated to `confirmed`, because `create_booking_settlement_on_confirm()` fires only on exactly that transition — a booking inserted directly as `confirmed` gets no settlement row.

- [ ] Step 3: Run the live suite.

~~~bash
pnpm --filter web exec vitest run tests/creator-earnings.rls.test.ts
~~~

Expected: PASS. If it reports as skipped, `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_DB_CONTAINER` is missing from `apps/web/.env.test` — resolve that rather than accepting a skip as a pass.

- [ ] Step 4: Full-repository gate.

~~~bash
pnpm typecheck
pnpm lint
pnpm honesty:lint
pnpm test
~~~

Expected: green. Two known, pre-existing conditions are not R10.0 regressions and must be reported separately rather than absorbed: the DB-dependent suites fail without a local stack, and the `Booking ON` e2e leg is blocked on repository secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).

- [ ] Step 5: Run axe over the rebuilt surface. Do **not** use `playwright.r7-10.config.ts` for this — R9.1 established that it covers nine public routes and never signs in, so it does not exercise `/studio` at all and would report a green run that tested nothing. Extend the jsdom axe test R9.1 created instead:

~~~bash
pnpm --filter web exec vitest run tests/a11y.studio-surfaces.test.tsx
~~~

Add `StudioEarningsView` to that file's covered views, at the same serious/critical threshold, with colour-contrast disabled (jsdom has no computed paint, so that rule would report a false pass).

- [ ] Step 6: Commit and open the PR.

~~~bash
git add apps/web/tests/creator-earnings.rls.test.ts apps/web/tests/a11y.studio-surfaces.test.tsx
git commit -m "test(r10.0): prove earnings RPC ownership, isolation and grants against a live stack"
~~~

**Verification:**

~~~bash
pnpm typecheck
pnpm lint
pnpm honesty:lint
pnpm test
~~~

The migration is **not** applied to production by this plan. Applying `20260815090000_r10_0_creator_earnings_summary.sql` is an operator action taken after review, following `docs/ops/r10-0-migration-ledger-baseline.md`.

---

## Errata

Corrections made to this document **after** implementation began. The fenced code above is updated in
place so the plan stays directly usable, but every change is recorded here so a later spec-fidelity
check can tell what was originally specified from what was actually built. Raised by a reviewer who
correctly noted that silently rewriting a plan's fences destroys its audit trail.

1. **Tasks 2 and 6 — `as never` on the null-user mock.** The original snippets wrote
   `getUserMock.mockResolvedValue({ data: { user: null } })`, which fails `tsc` with TS2322: the
   hoisted mock's inferred type requires `user: { id: string }`. The existing suite already used
   `as never` for exactly this.
2. **Task 4 — the settlement-attribution assertion could never fail.**
   `not.toContain('mission_settlements.creator_id')` was meant to catch attribution via a
   non-existent column, but every table reference in the function uses a short alias, so that string
   could not appear regardless. Replaced with a boundary-aware regex. The first replacement
   (`not.toContain('s.creator_id')`) was itself wrong — it false-positived on `bookings.creator_id`
   inside a comment.
3. **Task 5 — no local Supabase stack.** The original Step 3 regenerated `packages/db/types.ts` from
   a local stack. Replaced with a hand-added single line, so Tasks 1–7 are strictly database-free and
   all DB interaction is confined to Task 8. `pnpm typecheck` still proves the line is correct,
   because the `.rpc()` call does not compile without it.
4. **Task 6 — `afterEach(cleanup)` is mandatory.** The view test omitted it. This repo's
   `apps/web/vitest.config.ts` does not set `globals: true`, so RTL auto-cleanup never activates and
   renders leak between tests as "multiple elements found". Most existing test files already do this.
5. **Task 6 — `Rows` hardcoded `colSpan={4}`** while two of its three tables have three columns. Now
   takes `colSpan` as a prop. Harmless at runtime (the row is `aria-hidden`, and browsers clamp an
   excess colspan) but wrong markup and a trap for the next column change.
6. **Task 7 — `subtitle` updated in all seven locales.** The original copy said "missions and
   affiliate commissions", understating the page now that booking commission is a third section.
7. **Task 7 — Thai overclaimed.** `missionsHeading` rendered "Mission settlements" as
   "การชำระเงินจากภารกิจ" ("payment from missions"), asserting funds had moved when the section lists
   both paid and pending rows. Changed to a neutral "ยอดจากภารกิจ" ("amounts from missions"). Three
   new strings also used a commission spelling that disagreed with the file's 15 existing uses.
8. **Task 7 — the `trackedHeading` honesty assertion guarded nothing.**
   `expect(...trackedHeading.length).toBeGreaterThan(0)` passes for any text, including a heading
   implying the money is available — the exact failure the block exists to prevent. Now pinned to a
   per-locale marker.
9. **Task 7 — the `empty` key was removed after all.** The plan said to keep it because other tests
   referenced it; true when written, false once Task 6 replaced the view test. Verified unreferenced,
   then dropped from the interface and all seven locales.
10. **Task order — 7 ran before 6.** As written, Task 6 consumed locale keys Task 7 adds, so its test
    would have been committed red. Swapping them keeps every commit on the branch green.

Still open, deliberately not changed: `colGross` ("Gross") translates to a word meaning "Total" in
five of six locales, which reads awkwardly directly beneath a disclaimer that these amounts are *not*
included in your totals. Cosmetic rather than a false claim — flagged for a wording decision rather
than guessed at across six languages.

---

## Plan self-review checklist

- The phase adds exactly one database object — a `stable`, owner-gated, `SECURITY DEFINER` read function — and zero write paths, so it cannot corrupt money data even if the logic is wrong.
- The RPC is not a stylistic choice: `booking_settlements` is revoked from `authenticated` with no grant back, so a definer function is the only mechanism by which a creator can ever see their booking commission.
- Attribution is through `mission_participants.creator_id`, matching the existing `mission_settlements_visible_select` policy; the plan never invents a `mission_settlements.creator_id`, which does not exist.
- Each table is read with its own currency column name (`amount_currency` vs `currency`), the one mismatch most likely to produce a silent failure.
- Tracked affiliate volume is excluded from totals in the pure function, asserted by unit test, asserted again in the view test, and its disclaimer is pinned per-locale — three independent guards on the one honesty claim this phase makes.
- The `not exists` clause on `tracked_affiliate` means R10.1 can begin minting settlements without ever double-counting a conversion; the two phases compose by construction rather than by convention.
- `requireCreatorPage` takes an explicit denial mode because two host tests assert two different denial behaviours by exact message; the refactor is provably behaviour-preserving because those tests must pass unmodified.
- Nothing in this plan runs against the production database, and the one script that would have (`pnpm --filter @kinnso/db gen`, which is `--linked`) is explicitly replaced with its `--local` form.
- `/studio` is untouched, so R9.1's zero-additional-round-trips constraint on the creator's slowest page still holds.
