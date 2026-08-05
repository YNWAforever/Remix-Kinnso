# Phase R9.1 - Creator Activation Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the shortest path from "signed up" to "earning and discoverable" the obvious one. Every capability this needs already exists; what is missing is sequencing and legibility.

**Architecture:** No new capability, no new database object, no new external call. `/studio` already loads everything required — handles, guides, active scan job, missions, offers, settlements and contribution — in one `Promise.all`. This phase derives a single next-best action from that existing snapshot with a pure function, renders it, and makes two silent rules visible: what puts a creator in the public directory, and what the next tier actually unlocks.

**Tech Stack:** Next.js App Router server components, React, TypeScript, Vitest, Testing Library, the seven KINNSO locale dictionaries.

## Why this phase

The flywheel is built and switched on. The scoring already says what the product wants creators to do, and nothing in the experience says it back to them:

- `apps/web/lib/contribution/tiers.ts` weights `mission_verified` at **40** against `guide_published` 15 and `dna_scan` 10. One verified mission takes a creator from 0 to `rising` on its own.
- Travelpayouts missions cannot be tier-gated at all — `missions_min_tier_merchant_only_check` restricts `min_tier` to merchant-sourced missions — so the paid path is open to a brand-new creator on day one.
- The money path does not depend on Kinnso's traffic: the creator posts a tracked link to their own audience, `create_travelpayouts_partner_link` stamps a `sub_id`, the scan worker verifies the post, and the daily `travelpayouts-sync` cron ingests conversions into `affiliate_network_events`. **This phase therefore does not depend on R9.0.**
- Public discovery has a rule nobody is told: `fetchEligibleCreators` lists an active creator with a handle and public profile **only once they have a published guide**, or when ops sets the `is_listed` override. A creator can finish onboarding, publish nothing, and silently never appear.
- The tier ladder does pay off — `partner_perks.min_tier` with a hard-gated redemption RPC — but `/studio/tier` shows points, not what the next tier buys.

So a new creator finishes a DNA scan and lands on a dashboard with no stated next step, while the single action that maximises their money, their points and their tier simultaneously is the same one: run a mission.

## Global Constraints

- Derive, do not fetch. `/studio` already has the data; the next-best action must be a pure function over that snapshot, unit-tested independently of React. Adding a query for this would be a regression in a page that is already the creator's slowest.
- Honesty rules from R7.3 hold without exception: never state a count, an earning, or an availability that is not backed by a row. If there are no open missions, say so plainly — do not imply a queue exists.
- Never present a projected or example payout as if it were earned. Amounts come from `mission_settlements`, or they are not shown.
- The directory rule must be stated as the product actually enforces it (`status = 'active'` + handle + public profile + at least one published guide, or the ops override) — not as a paraphrase that drifts from `fetchEligibleCreators`.
- The tier panel must name what the **next** tier unlocks from the live perk catalog. If no perk is gated at that tier, say that instead of inventing motivation.
- Add every new visible label to all seven locales: en, zh-hk, zh-tw, zh-cn, ja, ko, th; `i18n.locale-parity.test.ts` must stay green.
- Status must be conveyed as text, not colour alone; the R7.10 accessibility gate (axe zero critical/serious, keyboard traversal, CLS ≤ 0.1 at 380px) applies to every surface touched.
- No migration, RPC, policy, cron, vendor script, or public write path.
- Use TDD: write a failing test, run it, implement the smallest change, rerun the focused test, then commit each task.

## Non-goals

- Acquiring creators. This phase converts arrivals; it does not market to them.
- Changing the point weights, tier thresholds, or the directory eligibility rule. The rules are sound — they are just invisible.
- Building a merchant-mission supply. Tier-gated merchant missions stay empty until merchants exist; that is a commercial problem, not a UI one.
- Touching the onboarding wizard's scan/DNA steps. They work; the gap is what happens after.

---

## File Map

### Task 1 - Next-best action, as a pure rule

- Create: `apps/web/lib/studio/next-action.ts` - the ordered rule over the existing studio snapshot.
- Create: `apps/web/tests/studio.next-action.test.ts` - every branch, precedence, and the honest empty case.

### Task 2 - Surface it on the studio home

- Modify: `apps/web/app/[locale]/studio/page.tsx` - derive the action from data it already has and pass it down.
- Modify: `apps/web/components/kinnso/pages/StudioDashboardView.tsx` - render it above the existing quick links.
- Modify: `apps/web/tests/studio.host.test.tsx` (or the existing studio host test) - assert the action reflects state.

### Task 3 - Make the two silent rules visible

- Modify: `apps/web/components/kinnso/StudioReadinessChecklist.tsx` - state the directory rule and whether this creator meets it.
- Modify: `apps/web/app/[locale]/studio/tier/page.tsx` - name what the next tier unlocks, from the live perk catalog.
- Modify: `apps/web/tests/studio.tier.host.test.tsx` - cover "next tier unlocks X" and the no-perk-at-that-tier case.

### Task 4 - Locales, accessibility, verification

- Modify: `apps/web/lib/i18n/messages/{en,zh-hk,zh-tw,zh-cn,ja,ko,th}.ts` - the new keys.
- Modify: `apps/web/tests/i18n.locale-parity.test.ts` - assert the new key group across locales.
- Review: all Task 1-3 files.

---

### Task 1: Next-best action, as a pure rule

**Files:**
- Create: `apps/web/tests/studio.next-action.test.ts`
- Create: `apps/web/lib/studio/next-action.ts`

**Interfaces:**
- `deriveStudioNextAction(snapshot): StudioNextAction` where the snapshot is the shape `/studio` already assembles: handles, guides, active scan job, joined missions, open offers, settlements, contribution.
- `StudioNextAction = { kind: 'add_handles' | 'await_scan' | 'review_dna' | 'join_mission' | 'submit_proof' | 'publish_guide' | 'redeem_perk' | 'nothing_open'; href: string }`

**Ordering (assert this precedence explicitly — it is the phase's actual thesis):**
1. no social handle → `add_handles`
2. scan running → `await_scan` (terminal-state aware; do not offer a rescan mid-run)
3. DNA ready, not reviewed → `review_dna`
4. **active, no joined mission, an open mission exists → `join_mission`** — the highest-value action for money, points and tier at once
5. joined, no verified submission → `submit_proof`
6. active, no published guide → `publish_guide` (this is what makes them discoverable)
7. eligible for an unredeemed perk at their tier → `redeem_perk`
8. otherwise → `nothing_open`, stated honestly

**Steps:**
- [ ] Step 1: Write failing tests for each branch in precedence order, including two states that both qualify, asserting the higher one wins.
- [ ] Step 2: Write a failing test that a creator with no handles never sees a mission action, however many missions are open.
- [ ] Step 3: Write a failing test for `nothing_open` when the mission catalogue is empty — the copy must not imply missions are coming.
- [ ] Step 4: Implement the pure function. No imports from React, Next, or Supabase.

**Verification:**

~~~bash
pnpm --filter web exec vitest run tests/studio.next-action.test.ts
pnpm typecheck
~~~

---

### Task 2: Surface it on the studio home

**Files:**
- Modify: `apps/web/tests/studio.host.test.tsx`
- Modify: `apps/web/app/[locale]/studio/page.tsx`, `apps/web/components/kinnso/pages/StudioDashboardView.tsx`

**Interfaces:**
- The page derives the action from the results it already awaits and passes `nextAction` to the view. **No new query, and no change to the existing `Promise.all`.**
- The view renders one primary action with a labelled semantic region, `role="status"`, and text that stands alone without colour.

**Steps:**
- [ ] Step 1: Write a failing host test that a creator with handles and an open mission is pointed at the mission.
- [ ] Step 2: Write a failing test that the page issues no additional database round trip (assert the existing call count).
- [ ] Step 3: Write a failing view test for the semantic region, the accessible label, and the empty-state copy.
- [ ] Step 4: Implement, keeping the existing quick links and readiness checklist below the action.

**Verification:**

~~~bash
pnpm --filter web exec vitest run tests/studio.host.test.tsx
~~~

---

### Task 3: Make the two silent rules visible

**Files:**
- Modify: `apps/web/tests/studio.tier.host.test.tsx`
- Modify: `apps/web/components/kinnso/StudioReadinessChecklist.tsx`, `apps/web/app/[locale]/studio/tier/page.tsx`

**Interfaces:**
- Readiness checklist gains a directory row whose predicate mirrors `fetchEligibleCreators` exactly: active + handle + public profile + (≥1 published guide OR ops `is_listed`). Import or share the predicate rather than restating it — a paraphrase here becomes wrong the day the rule changes.
- Tier page states the next tier, the points remaining, and the perks gated at that tier from the live catalog.

**Steps:**
- [ ] Step 1: Write a failing test that a creator with no published guide is told the directory rule and that they do not yet meet it.
- [ ] Step 2: Write a failing test that a creator listed via the ops override is shown as listed even with no guide.
- [ ] Step 3: Write a failing test that the tier panel names a perk gated at the next tier, and a second that says plainly when nothing is gated there.
- [ ] Step 4: Implement, sharing the eligibility predicate rather than duplicating it.

**Verification:**

~~~bash
pnpm --filter web exec vitest run tests/studio.tier.host.test.tsx
~~~

---

### Task 4: Locales, accessibility, verification

**Steps:**
- [ ] Step 1: Add every new key to all seven locales with a real translation; extend the locale-parity contract test.
- [ ] Step 2: Run the accessibility suite against the touched surfaces.
- [ ] Step 3: Full-repository verification.

**Verification:**

~~~bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts
~~~

Expected: green, with the pre-existing `Booking ON` CI gap (missing `STRIPE_SECRET_KEY`) reported separately and not treated as an R9.1 regression.

---

## Plan self-review checklist

- The thesis is testable: precedence puts `join_mission` above `publish_guide`, matching the point weights and the fact that the paid path is open to every tier.
- No new query, migration, RPC or cron; the next-best action is derived from a snapshot the page already loads.
- Every claim shown to a creator is backed by a row — mission counts, perk names, settlement amounts — and the empty case is stated plainly rather than dressed up.
- The directory rule is shared with `fetchEligibleCreators`, not paraphrased, so the two cannot drift.
- All seven locales carry every new key, and the parity test enforces it.
- Nothing here depends on R9.0: creators earn against their own audience, so this phase can ship before, after, or beside the cutover.
