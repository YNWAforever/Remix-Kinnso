# Phase R7.2 — Feature-State Single Source of Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Agent, Booking, and Sessions claims derive from one typed server-side state contract, with useful localized interest capture whenever Agent or Booking is unavailable.

**Architecture:** A server-only `product-state.ts` owns strict configured flags and the public/RLS-derived Sessions flag. Server routes resolve state and pass booleans into client islands, preserving existing static/ISR boundaries. A generic `feature_interest_signups` table accepts idempotent Agent/Booking interest through one audited `SECURITY DEFINER` RPC; a shared accessible form invokes it through a validated Server Action.

**Tech Stack:** Next.js 16.2.9 App Router, React 19.2.4, TypeScript 5, Supabase SSR/supabase-js and CLI, Vitest 4, Testing Library, Playwright, pnpm 11.6.0.

## Global constraints

- Requirements are R7.2 in `kinnso-phase-r7-ux-hardening-spec.md`, the approved design at `docs/superpowers/specs/2026-07-14-phase-r7-2-feature-state-design.md`, and program §7.
- Locked defaults: Agent ON, Booking OFF, Sessions derived and currently OFF.
- All state reads flow through `apps/web/lib/product-state.ts`; components never read `process.env`.
- Public reads use `createSupabasePublicClient()` and RLS. The interest write uses one audited `SECURITY DEFINER` RPC with explicit grants.
- Every added user-facing string exists in all seven locale files and keeps `apps/web/tests/i18n.locale-parity.test.ts` green.
- Marketing routes stay static/ISR; do not introduce `cookies()`, `headers()`, or a server auth client into them.
- Never modify a shipped migration. Create the R7.2 migration with `supabase migration new`.
- Do not apply the migration to production. Production Supabase authority is read-only.
- Do not touch creator copilot, frozen content URLs, or Stripe outside test-mode verification.
- Use Conventional Commits and one squash-merged PR titled `Phase R7.2 — Feature-state single source of truth`.

---

### Task 1: Add strict configured and derived product state

**Files:**
- Create: `apps/web/lib/product-state-config.ts`
- Create: `apps/web/lib/product-state.ts`
- Create: `apps/web/tests/product-state.test.ts`
- Modify: `apps/web/lib/env.ts`
- Modify: `apps/web/tests/env.test.ts`

**Interfaces:**
- `ProductState = { agentLive: boolean; bookingLive: boolean; sessionsLive: boolean }`
- `product-state-config.ts` owns `resolveConfiguredProductState(env?): Pick<ProductState, 'agentLive' | 'bookingLive'>`; `product-state.ts` re-exports it for all application consumers
- `getSessionsLive(client?): Promise<boolean>`
- `getProductState(): Promise<ProductState>` wrapped with React server `cache()`

- [x] **Step 1: Write RED tests for strict configured state**

Create `apps/web/tests/product-state.test.ts`. Assert:

```ts
expect(resolveConfiguredProductState({})).toEqual({ agentLive: true, bookingLive: false })
expect(resolveConfiguredProductState({ AGENT_LIVE: 'false', BOOKING_LIVE: 'TRUE' }))
  .toEqual({ agentLive: false, bookingLive: true })
expect(() => resolveConfiguredProductState({ BOOKING_LIVE: 'yes' }))
  .toThrow('BOOKING_LIVE must be true or false')
```

Use a chainable mocked public client to cover:

- scheduled/live row found → true and no replay query;
- no upcoming row, ended row with non-null `replay_url` → true;
- neither query returns a row → false;
- either query errors → false and a safe `product-state-sessions-query-failed` warning that excludes the raw error message.

- [x] **Step 2: Update env tests for the locked default**

In `apps/web/tests/env.test.ts`, make the shared `core` fixture explicitly disable Agent so unrelated validation tests remain isolated. Add tests proving an absent Agent flag now requires AI/Vercel configuration, explicit `AGENT_LIVE=false` does not, and invalid configured values fail before provider validation.

- [x] **Step 3: Run RED**

```powershell
pnpm --filter web test -- product-state env
```

Expected: FAIL because `product-state.ts` does not exist and current env parsing does not use the locked defaults.

- [x] **Step 4: Implement the server-only state module**

Create pure `apps/web/lib/product-state-config.ts` with the configured-state type and parser. It trims and lowercases only `true`/`false`, uses Agent=true and Booking=false when absent, and names invalid variables without printing their values.

Create `apps/web/lib/product-state.ts` with `import 'server-only'`. Import and re-export the pure resolver, then add the Sessions query and cached composition. This split prevents the cycle `env -> product-state -> supabase/public -> env`; application routes still import only `product-state.ts`.

`getSessionsLive()` uses the discovered `community_sessions` schema through `createSupabasePublicClient()`:

```ts
const upcoming = await client
  .from('community_sessions')
  .select('id')
  .in('status', ['scheduled', 'live'])
  .limit(1)

const replay = await client
  .from('community_sessions')
  .select('id')
  .eq('status', 'ended')
  .not('replay_url', 'is', null)
  .limit(1)
```

Return false on a safe caught failure. Export `getProductState` as a cached async composition of configured state plus `getSessionsLive()`.

- [x] **Step 5: Make env validation consume the same resolver**

Replace the local permissive flag helper in `apps/web/lib/env.ts`. Import the resolver from `product-state-config.ts`, call it once, then gate existing Agent and Booking provider requirements from the resolved booleans.

- [x] **Step 6: Verify GREEN and commit**

```powershell
pnpm --filter web test -- product-state env
pnpm --filter web typecheck
git add apps/web/lib/product-state-config.ts apps/web/lib/product-state.ts apps/web/tests/product-state.test.ts apps/web/lib/env.ts apps/web/tests/env.test.ts
git commit -m "feat(web): centralize product state"
```

---

### Task 2: Create the generic interest-signup migration and regenerate types

**Files:**
- Create via CLI: the exact `supabase/migrations/*_r7_2_feature_interest_signups.sql` path printed by the command below
- Create: `apps/web/tests/db.r7-2-feature-interest-signups.test.ts`
- Modify through generation: `packages/db/types.ts`

**Schema:** `feature_interest_signups(id, feature, email, locale, created_at)`, unique `(feature, email)`, RLS enabled, ops-only select, no direct public writes, RPC-only insert.

- [x] **Step 1: Generate the migration path using the CLI**

```powershell
pnpm exec supabase migration new r7_2_feature_interest_signups
```

Record the exact path printed by the CLI and use it in every later command. Do not rename or hand-create a timestamp and do not edit any earlier migration.

- [x] **Step 2: Write the SQL contract test before SQL implementation**

Create `apps/web/tests/db.r7-2-feature-interest-signups.test.ts` reading the generated exact path. Assert the SQL contains:

- the five locked columns and `feature in ('agent', 'booking', 'sessions')`;
- the seven-locale check and unique `(feature, email)`;
- `enable row level security`;
- `revoke all` on the table from `anon, authenticated`;
- authenticated SELECT plus an `is_active_ops()` SELECT policy;
- `join_feature_interest(text, text, text)` as `security definer set search_path = public`;
- lowercase/trim normalization, email validation, `on conflict (feature, email) do nothing`;
- function revoke from `public` and execute grants only to `anon, authenticated`;
- no direct INSERT/UPDATE/DELETE table grant to `anon` or `authenticated`.

- [x] **Step 3: Run RED**

```powershell
pnpm --filter web test -- db.r7-2-feature-interest-signups
```

Expected: FAIL because the CLI-created migration is empty.

- [x] **Step 4: Implement the audited migration**

In the generated migration, create the table and constraints. Add:

```sql
alter table public.feature_interest_signups enable row level security;
revoke all on table public.feature_interest_signups from anon, authenticated;
grant select on table public.feature_interest_signups to authenticated;

create policy feature_interest_signups_ops_read
  on public.feature_interest_signups for select to authenticated
  using (public.is_active_ops());
```

Create `public.join_feature_interest(p_feature text, p_email text, p_locale text) returns boolean`. It validates all inputs, normalizes email with `lower(btrim(p_email))`, inserts idempotently, and always returns true for both inserted and duplicate rows. End with exact-signature revoke/grants:

```sql
revoke all on function public.join_feature_interest(text, text, text) from public;
grant execute on function public.join_feature_interest(text, text, text) to anon, authenticated;
```

- [x] **Step 5: Verify SQL contract locally**

```powershell
pnpm --filter web test -- db.r7-2-feature-interest-signups
```

- [x] **Step 6: Apply all migrations only to the local Supabase stack and regenerate types**

```powershell
pnpm exec supabase start
pnpm exec supabase db reset --local
pnpm exec supabase gen types typescript --local | Set-Content -LiteralPath 'packages/db/types.ts' -Encoding UTF8
```

Verify the generated type contains `feature_interest_signups` and `join_feature_interest`. Never run `db push`, `db reset --linked`, or the production migration tool.

If the local Docker/Supabase stack cannot run, stop this task and report the blocker; do not hand-edit generated types or apply the migration to production.

- [x] **Step 7: Verify and commit**

```powershell
pnpm --filter web test -- db.r7-2-feature-interest-signups
pnpm --filter web typecheck
git add supabase/migrations packages/db/types.ts apps/web/tests/db.r7-2-feature-interest-signups.test.ts
git commit -m "feat(db): add feature interest signups"
```

---

### Task 3: Add the validated Server Action and accessible shared form

**Files:**
- Create: `apps/web/lib/feature-interest/actions.ts`
- Create: `apps/web/components/kinnso/FeatureInterestForm.tsx`
- Create: `apps/web/tests/feature-interest.actions.test.ts`
- Create: `apps/web/tests/feature-interest.form.test.tsx`
- Modify: all seven `apps/web/lib/i18n/messages/*.ts`
- Modify: `apps/web/tests/i18n.locale-parity.test.ts` only if the parity fixture explicitly registers top-level groups

**Interfaces:**
- `FeatureInterest = 'agent' | 'booking' | 'sessions'`
- `joinFeatureInterestAction(input): Promise<{ ok: true } | { ok: false; code: 'invalid-email' | 'retry' }>`
- `FeatureInterestForm({ feature, locale, t })`

- [x] **Step 1: Write Server Action RED tests**

Mock `createSupabasePublicClient().rpc`. Test valid normalized input, invalid email, invalid feature/locale defense, honeypot success without RPC, duplicate-safe success, and sanitized RPC failure. The action must call:

```ts
rpc('join_feature_interest', {
  p_feature: 'agent',
  p_email: 'traveller@example.com',
  p_locale: 'en',
})
```

- [x] **Step 2: Write form RED tests**

Test an explicit email label, email input, hidden honeypot, feature-specific submit label, pending disablement, `role="status"` success, localized invalid-email feedback, and retryable generic feedback.

- [x] **Step 3: Add the seven-locale form group**

Add the same `featureInterest` shape to `en`, `zh-hk`, `zh-tw`, `ja`, `ko`, `th`, and `zh-cn`:

```ts
featureInterest: {
  emailLabel: string
  emailPlaceholder: string
  submitAgent: string
  submitBooking: string
  pending: string
  success: string
  invalidEmail: string
  retry: string
}
```

The English Booking label is exactly `Get notified when booking opens`. Translate every other locale in its existing register; do not leave English fallback copy.

- [x] **Step 4: Run RED**

```powershell
pnpm --filter web test -- feature-interest i18n.locale-parity
```

- [x] **Step 5: Implement action and form**

The action is server-only, validates before RPC, and returns stable codes rather than database messages. The client form uses `useTransition`, clears stale errors before submit, prevents duplicate pending submission, and maps action codes to dictionary strings. Honeypot input is visually hidden, removed from keyboard order, and named innocuously.

- [x] **Step 6: Verify and commit**

```powershell
pnpm --filter web test -- feature-interest i18n.locale-parity
pnpm --filter web typecheck
git add apps/web/lib/feature-interest apps/web/components/kinnso/FeatureInterestForm.tsx apps/web/tests/feature-interest.actions.test.ts apps/web/tests/feature-interest.form.test.tsx apps/web/lib/i18n/messages apps/web/tests/i18n.locale-parity.test.ts
git commit -m "feat(web): capture feature interest"
```

---

### Task 4: Gate Sessions navigation and homepage exposure

**Files:**
- Modify: `apps/web/app/[locale]/layout.tsx`
- Modify: `apps/web/app/[locale]/page.tsx`
- Modify: `apps/web/components/kinnso/SiteChrome.tsx`
- Modify: `apps/web/components/kinnso/Navbar.tsx`
- Modify: `apps/web/components/kinnso/pages/HomeView.tsx`
- Modify: `apps/web/components/kinnso/home/HowItWorks.tsx`
- Modify: `apps/web/lib/home/queries.ts`
- Modify: `apps/web/tests/kinnso.Navbar.test.tsx`
- Modify: `apps/web/tests/kinnso.SiteChrome.test.tsx`
- Modify: `apps/web/tests/layout.siteChrome.test.tsx`
- Modify: `apps/web/tests/home.host.test.tsx`
- Modify: `apps/web/tests/home.queries.test.ts`
- Modify: `apps/web/tests/kinnso.home-how-it-works.test.tsx`
- Modify: `apps/web/tests/kinnso.HomeView.test.tsx`
- Modify: all seven locale dictionaries

- [x] **Step 1: Add RED state-propagation tests**

Add required `sessionsLive` props to `SiteChrome` and `Navbar` tests. Assert Sessions is absent in desktop and mobile navigation when false, and present when true.

Add `productState` to Home host/view fixtures. Assert the Sessions band is absent when `sessionsLive=false` even if session rows are passed, and present only when true with rows. Mock `getProductState()` in `home.host.test.tsx` and assert the host passes the returned object.

Extend `home.queries.test.ts` before implementation: the home-session loader returns scheduled/live rows first; when none exist it returns ended rows with replay URLs; when neither exists it returns `[]`; and a query failure safely returns `[]` without exposing the raw error. This is required because `sessionsLive` may be true from a replay even when there is no upcoming session.

In `kinnso.home-how-it-works.test.tsx`, assert traveller step 3 selects separate Booking OFF and ON dictionary values from a required `bookingLive` prop.

- [x] **Step 2: Add locale variants**

Replace `home.howT3Desc` with `home.howT3DescLive` and `home.howT3DescWaitlist` across all seven dictionaries. Keep the existing live promise in the Live key and write notification-oriented OFF copy.

- [x] **Step 3: Run RED**

```powershell
pnpm --filter web test -- kinnso.Navbar kinnso.SiteChrome layout.siteChrome home.host home.queries kinnso.HomeView kinnso.home-how-it-works i18n.locale-parity
```

- [x] **Step 4: Thread state through server boundaries**

Add `export const revalidate = 300` to locale layout if absent. Resolve `getProductState()` and pass `sessionsLive` to `SiteChrome` → `Navbar`.

In `apps/web/lib/home/queries.ts`, add `getHomeSessions(limit = 3)`. Reuse the discovered cookie-less `getUpcomingSessionsList()` and `getReplaySessions()` public/RLS queries: return upcoming rows when present, otherwise replay rows, filter rows without a host, and map them to the existing homepage session shape. Catch failures, log only a named safe warning, and return `[]`. Do not invent a third database query.

In the home page, add `getProductState()` to the existing `Promise.all`, replace `getUpcomingSessions()` with `getHomeSessions()`, and pass the state object to `HomeView`. In `HomeView`, pass `bookingLive` to `HowItWorks` and gate Sessions with both `productState.sessionsLive` and non-empty rows. Thus replay-only state still produces a visible Sessions band.

Filter the Navbar base-anchor definition before both desktop and mobile render paths so the Sessions link cannot leak through either representation.

- [x] **Step 5: Verify and commit**

```powershell
pnpm --filter web test -- kinnso.Navbar kinnso.SiteChrome layout.siteChrome home.host home.queries kinnso.HomeView kinnso.home-how-it-works i18n.locale-parity
pnpm --filter web typecheck
git add apps/web/app/[locale]/layout.tsx apps/web/app/[locale]/page.tsx apps/web/components/kinnso/SiteChrome.tsx apps/web/components/kinnso/Navbar.tsx apps/web/components/kinnso/pages/HomeView.tsx apps/web/components/kinnso/home/HowItWorks.tsx apps/web/lib/home/queries.ts apps/web/tests apps/web/lib/i18n/messages
git commit -m "feat(web): gate sessions discovery"
```

---

### Task 5: Make Agent homepage, page body, and metadata agree

**Files:**
- Create: `apps/web/components/kinnso/pages/AgentWaitlistView.tsx`
- Modify: `apps/web/components/kinnso/pages/HomeView.tsx`
- Modify: `apps/web/components/kinnso/home/AgentTeaser.tsx`
- Modify: `apps/web/app/[locale]/page.tsx`
- Modify: `apps/web/app/[locale]/agent/page.tsx`
- Modify: `apps/web/app/api/agent/route.ts`
- Modify: `apps/web/tests/kinnso.home-bands.test.tsx`
- Modify: `apps/web/tests/kinnso.agent-page.host.test.tsx`
- Create: `apps/web/tests/agent.metadata-state.test.ts`
- Modify: `apps/web/tests/api.agent.route.test.ts`
- Modify: all seven locale dictionaries

- [x] **Step 1: Write Agent two-state RED tests**

Homepage tests render `AgentTeaser` with both `agentLive` values. ON keeps the current `/agent` link and live copy. OFF renders Agent waitlist copy plus `FeatureInterestForm` and no live CTA.

Agent host tests mock `resolveConfiguredProductState()`. Assert OFF renders `AgentWaitlistView`, does not call `createSupabaseServerClient`, does not fetch messages, and does not render chat. Preserve all current ON auth/history assertions.

API tests assert Agent OFF returns a stable 503 response before model, tool, or persistence work, while Agent ON preserves the existing route behavior. A hidden UI must not leave the live endpoint enabled.

Metadata tests call `generateMetadata()` in both states and compare its title/description to the corresponding visible-page dictionary branch.

- [x] **Step 2: Add explicit Agent locale branches**

Across all seven dictionaries:

- split the homepage Agent keys into `agentLive*` and `agentWaitlist*` variants;
- add Agent-page waitlist headline/body strings;
- replace `seo.agent` with `seo.agentLive` and `seo.agentWaitlist`.

Keep current chat/live copy as the ON branch. Remove `Live now` from component source; locale dictionary content is allowed.

- [x] **Step 3: Run RED**

```powershell
pnpm --filter web test -- kinnso.home-bands kinnso.agent-page.host agent.metadata-state api.agent.route i18n.locale-parity
```

- [x] **Step 4: Implement one-state selection**

`AgentTeaser` requires `agentLive` and `Messages['featureInterest']`, then chooses the dictionary branch. Thread `messages.featureInterest` through the homepage route and `HomeView`. `AgentWaitlistView` renders localized heading/body and the shared Agent form.

In both `generateMetadata()` and `AgentPage()`, call `resolveConfiguredProductState()` from the same module. The page returns OFF UI immediately after dictionary loading and before server auth/chat setup. The ON path remains unchanged.

At the start of traveller Agent `POST`, resolve the same state. Return a sanitized 503 when OFF before reading or persisting chat input; never modify creator copilot.

- [x] **Step 5: Verify and commit**

```powershell
pnpm --filter web test -- kinnso.home-bands kinnso.agent-page.host agent.metadata-state api.agent.route i18n.locale-parity
pnpm --filter web typecheck
git add apps/web/components/kinnso/home/AgentTeaser.tsx apps/web/components/kinnso/pages/HomeView.tsx apps/web/components/kinnso/pages/AgentWaitlistView.tsx apps/web/app/[locale]/page.tsx apps/web/app/[locale]/agent/page.tsx apps/web/app/api/agent/route.ts apps/web/tests apps/web/lib/i18n/messages
git commit -m "feat(web): align agent claims with state"
```

---

### Task 6: Replace Booking checkout with interest capture while OFF

**Files:**
- Modify: `apps/web/app/[locale]/experiences/[slug]/page.tsx`
- Modify: `apps/web/components/kinnso/pages/ExperiencePublicView.tsx`
- Modify: `apps/web/lib/experiences/booking-actions.ts`
- Modify: `apps/web/tests/experiences.public-detail.host.test.tsx`
- Modify: `apps/web/tests/experiences.booking-widget.host.test.tsx`
- Modify: `apps/web/tests/experiences.booking-actions.test.ts`
- Modify: all seven locale dictionaries as required by the OFF wrapper copy

- [x] **Step 1: Write Booking two-state RED tests**

Host tests mock configured state and assert the experience page passes `bookingLive` into `ExperiencePublicView`.

Render `ExperiencePublicView` with availability in both states:

- OFF shows `Get notified when booking opens` through the shared Booking interest form, with no date/quantity/checkout controls;
- clicking/submitting OFF UI never calls `createCheckoutSessionAction`;
- ON keeps current availability, guest-email, sold-out, error, source-surface, and checkout behavior.

Extend booking-action tests: Booking OFF returns a stable failure before auth, availability, rate-limit, or Stripe work; Booking ON preserves all existing action paths. Mock configured state explicitly in existing cases.

Keep `BookingWidget` as the live-only client component; update its direct tests only for any required prop/type changes.

- [x] **Step 2: Run RED**

```powershell
pnpm --filter web test -- experiences.public-detail.host experiences.booking-widget.host experiences.booking-actions feature-interest.form
```

- [x] **Step 3: Implement the server-side branch**

Resolve configured state in the experience route without adding another request-bound API. Pass `bookingLive` and `messages.featureInterest` into `ExperiencePublicView`.

In `ExperiencePublicView`, render `BookingWidget` only when ON. Render `FeatureInterestForm feature="booking"` when OFF, regardless of availability rows. This makes the checkout action unreachable from the rendered OFF tree.

Add the same `bookingLive` guard at the start of `createCheckoutSessionAction()` so a stale or manually invoked Server Action cannot create Checkout while OFF.

- [x] **Step 4: Verify and commit**

```powershell
pnpm --filter web test -- experiences.public-detail.host experiences.booking-widget.host experiences.booking-actions feature-interest.form
pnpm --filter web typecheck
git add apps/web/app/[locale]/experiences/[slug]/page.tsx apps/web/components/kinnso/pages/ExperiencePublicView.tsx apps/web/lib/experiences/booking-actions.ts apps/web/tests apps/web/lib/i18n/messages
git commit -m "feat(web): gate booking checkout"
```

---

### Task 7: Gate merchant, creator, and article Booking claims

**Files:**
- Modify: `apps/web/app/[locale]/for-merchants/page.tsx`
- Modify: `apps/web/app/[locale]/for-creators/page.tsx`
- Modify: `apps/web/app/[locale]/articles/[category]/[url]/page.tsx`
- Modify: `apps/web/components/kinnso/pages/ForMerchantsView.tsx`
- Modify: `apps/web/components/kinnso/pages/ForCreatorsView.tsx`
- Modify: `apps/web/components/kinnso/articles/ArticleExperienceLinks.tsx`
- Modify: `apps/web/tests/for-merchants.host.test.tsx`
- Modify: `apps/web/tests/for-creators.host.test.tsx`
- Modify: `apps/web/tests/articles.experience-links.test.tsx`
- Modify: all seven locale dictionaries

- [x] **Step 1: Write all three two-state RED tests**

Require `bookingLive` in each view. Assert:

- merchant bullet 3 selects `why3Waitlist` when OFF and `why3Live` when ON;
- creator earnings bullet selects its OFF/ON equivalents;
- article experience module header selects discovery/notification copy OFF and ready-to-book copy ON while preserving the same experience cards and `?src=article` links.

- [x] **Step 2: Add locale variants**

Across all seven locale files, replace each ambiguous single claim with explicit pairs:

```ts
forMerchants: { why3Waitlist: string; why3Live: string }
forCreators: { why3Waitlist: string; why3Live: string }
article: {
  experiencesNearbyEyebrowWaitlist: string
  experiencesNearbyHeadingWaitlist: string
  experiencesNearbyEyebrowLive: string
  experiencesNearbyHeadingLive: string
}
```

- [x] **Step 3: Run RED**

```powershell
pnpm --filter web test -- for-merchants for-creators articles.experience-links i18n.locale-parity
```

- [x] **Step 4: Thread configured state and select copy**

Each server page calls `resolveConfiguredProductState()` and passes `bookingLive`. Components select only dictionary keys; they contain no hard-coded availability claims.

- [x] **Step 5: Verify and commit**

```powershell
pnpm --filter web test -- for-merchants for-creators articles.experience-links i18n.locale-parity
pnpm --filter web typecheck
git add apps/web/app/[locale]/for-merchants/page.tsx apps/web/app/[locale]/for-creators/page.tsx apps/web/app/[locale]/articles/[category]/[url]/page.tsx apps/web/components/kinnso/pages/ForMerchantsView.tsx apps/web/components/kinnso/pages/ForCreatorsView.tsx apps/web/components/kinnso/articles/ArticleExperienceLinks.tsx apps/web/tests apps/web/lib/i18n/messages
git commit -m "feat(web): gate booking claims"
```

---

### Task 8: Add claim-literal guard and complete regression verification

**Files:**
- Create: `apps/web/tests/product-state.copy-guard.test.ts`
- Modify: any touched test fixture that still omits a required state prop
- Modify: `docs/superpowers/plans/2026-07-14-phase-r7-2-feature-state.md` checkboxes during execution

- [x] **Step 1: Write the copy guard**

Recursively scan `.tsx` component source under `apps/web/components` and `apps/web/app`, excluding tests and locale dictionaries. Fail on exact literals:

```ts
const forbidden = ['Coming Soon', 'Live now', 'coming soon']
```

The failure lists every file and phrase. Dictionary files, tests, migrations, and documentation are outside the scan.

- [x] **Step 2: Run focused R7.2 verification**

```powershell
pnpm --filter web test -- product-state feature-interest db.r7-2 kinnso.Navbar home agent booking for-merchants for-creators articles.experience-links i18n.locale-parity
pnpm --filter web typecheck
pnpm --filter web lint
```

Expected: all focused tests, typecheck, and lint PASS.

- [ ] **Step 3: Run the complete web and E2E regression suites**

```powershell
pnpm --filter web test
pnpm --filter @kinnso/e2e typecheck
pnpm --filter @kinnso/e2e e2e -- --project=chromium
```

Run E2E only against a local/Preview environment configured with Agent ON and Booking OFF. Do not submit the interest form against production.

Verification note (2026-07-16): the full serial web run completed with 333 files passing and only the two documented local-seed failures in `creator-rls.test.ts`; the separately enabled mission RLS file passed 12/13 with only the documented `missions_tp_program_uniq` rollback-fixture failure. E2E typecheck passed. The complete local Chromium set compatible with Booking OFF passed 19 tests with one designed creator-onboarding skip when the external scan path was unavailable. `booking.spec.ts` was intentionally excluded because it asserts live checkout and therefore contradicts the locked Booking OFF test state. This step remains unchecked because the command printed in the plan describes the complete E2E suite without that exclusion.

- [x] **Step 4: Verify the production build in default state**

Set non-secret local test values through the approved environment mechanism, with `AGENT_LIVE=false` if no AI/Vercel identity is available, then run:

```powershell
pnpm --filter web build
```

Expected: build succeeds; marketing routes remain static/ISR except already-dynamic personalized detail routes.

- [x] **Step 5: Browser-check the default visible contract**

Start the local app with the locked visible defaults (`AGENT_LIVE=true`, `BOOKING_LIVE=false`, and `VERCEL=1` only as local build identity when no AI key is available). Do not send an Agent API request. Verify:

1. homepage Agent is the live branch;
2. `/en/agent` metadata/body and chat agree;
3. Sessions is absent from desktop/mobile nav and homepage;
4. an experience shows Booking interest capture, not checkout controls;
5. merchant, creator, and article claims use OFF wording;
6. keyboard focus, label, pending, and status behavior work on the interest form.

Do not submit to production. A local migrated stack or mocked Preview endpoint is the only permitted persistence target.

Verified locally on 2026-07-16 against the production build with `AGENT_LIVE=true`, `BOOKING_LIVE=false`, and `VERCEL=1`. A unique `@example.com` Booking-interest address was submitted only to the local Supabase stack; the explicit label, hidden honeypot, keyboard order, delayed pending state, disabled button, and localized status announcement all passed. Home/Agent live state, Sessions nav hiding, Booking interest capture, and merchant/creator/article OFF claims also passed without browser errors.

- [ ] **Step 6: Review migration/deployment gate**

Confirm the PR clearly states:

- the generated migration path;
- migration was verified against a local reset;
- production migration remains unapplied because access is read-only;
- merge/production deployment is blocked until an authorized operator applies the migration, because Booking defaults OFF and renders the form;
- rollback is a configuration redeploy for Agent/Booking and automatic ISR expiry for Sessions.

Deployment-gate note (2026-07-16): this step remains unchecked because the PR does not exist yet. Its handoff must name `supabase/migrations/20260714072649_r7_2_feature_interest_signups.sql`, record the successful local reset, state that production remains unapplied under read-only access, block merge/deployment until an authorized operator applies the migration, and retain the rollback statement above.

- [x] **Step 7: Commit verification artifacts**

```powershell
git add apps/web/tests/product-state.copy-guard.test.ts docs/superpowers/plans/2026-07-14-phase-r7-2-feature-state.md
git commit -m "test(web): guard feature-state claims"
```

---

## Final review and publication gate

- [x] Run `git diff main...HEAD --check` and inspect every changed file.
- [x] Confirm no creator-copilot, frozen URL, shipped migration, production data, or Stripe live-mode changes exist.
- [x] Use `superpowers:requesting-code-review` and address all actionable findings.
- [x] Re-run focused tests, full web tests, typecheck, lint, build, and permitted E2E after review fixes.
- [ ] Push `codex/r7-2-feature-state` and open a draft PR titled `Phase R7.2 — Feature-state single source of truth`.
- [ ] Do not merge or allow production deployment until the authorized migration-application gate is satisfied.
- [ ] After the authorized operator applies the migration, verify the RPC in a writable non-production/Preview flow first, then squash-merge only with green CI and Preview checks.
