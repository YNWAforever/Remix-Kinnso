# Phase 2 — De-mock the Creator Spine + Copilot Marketing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every creator-facing surface honest — the scan report shows only the creator's *real* DNA, public guide listings are real-only, the home page wires the real featured-guides rail and drops fabricated payout/partner data, `/creators` is honest marketing with no fake creators, the apply funnel is role-aware with a real terms link, and `/agent` becomes a real Creator Copilot marketing page (no fabricated live data).

**Architecture:** Web-only changes in `apps/web` (Next.js App Router, React 19). No DB migration. Server pages fetch real data (`getPublishedGuides()`) and pass it to presentational views; mock fixtures (`@/lib/creator-mock`) are removed from owned/public surfaces but may remain in the explicitly-labelled anonymous scan *demo*. Every user-facing string goes through `vue`-free `next-intl`-style dictionaries: 7 locale files (`en/ja/ko/th/zh-cn/zh-hk/zh-tw`) plus the `Messages` interface in `en.ts`, guarded by a strict key-parity test.

**Tech Stack:** TypeScript, React 19 server/client components, `@supabase/ssr`, Vitest + Testing Library (jsdom), the project i18n dictionaries.

---

## Critical conventions (read before any task)

1. **`apps/web/AGENTS.md`:** "This is NOT the Next.js you know." Don't assume App Router APIs from training data; mirror the patterns already in the file you're editing.
2. **i18n parity is enforced.** `tests/i18n.locale-parity.test.ts` fails if any key PATH differs across the 7 locale files. **Adding or removing a key requires editing all 7 locale files AND the `Messages` interface in `en.ts`.** Changing a *value* is parity-safe (edit only the files whose copy changes). When this plan *removes* a key's last usage, **leave the key in the dictionaries** (parity-safe, zero churn) unless a task explicitly says to delete it from all 7.
3. **Decorative arrows/icons must be `aria-hidden`** or they pollute a link/button's accessible name and break `getByRole({ name })`. Existing code already follows this (`<ArrowRight aria-hidden="true" .../>`).
4. **TDD per task:** edit the test first → run it, watch it FAIL → implement → run it, watch it PASS → commit. One logical change per commit.
5. **Commands** (run from `apps/web`):
   - Single test file: `pnpm exec vitest run tests/<file>`
   - Full suite: `pnpm test`
   - Typecheck: `pnpm exec tsc --noEmit`
   - Lint: `pnpm lint`
   - Build: `pnpm build`
   - (From repo root you can prefix `pnpm -C apps/web …`.)
6. **Commit message footer** (every commit): a blank line then
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure (what each task creates/modifies)

| Workstream | Files |
|---|---|
| A · Guides real-only | `lib/guides/queries.ts`, `tests/guides.queries.test.ts`, `tests/guides.slug.test.ts` |
| B · Home de-mock + guides rail | `app/[locale]/page.tsx`, `components/kinnso/pages/HomeView.tsx`, `tests/kinnso.HomeView.test.tsx`, `tests/home.host.test.tsx`, i18n (`home`) |
| C · Honest /creators | `components/kinnso/pages/CreatorsLandingView.tsx`, `tests/kinnso.CreatorsLandingView.test.tsx` |
| D · Scan de-mock | `components/kinnso/pages/StudioScanView.tsx`, `app/[locale]/studio/scan/page.tsx`, `tests/kinnso.StudioScanView.test.tsx`, `tests/studio.scan.host.test.tsx`, i18n (`studio`) |
| E · Apply funnel | `app/[locale]/sign-in/page.tsx`, `app/[locale]/sign-in/SignInForm.tsx`, `app/[locale]/sign-up/page.tsx`, `app/[locale]/sign-up/SignUpForm.tsx`, `app/[locale]/creators/apply/page.tsx`, their tests, i18n (`auth`) |
| F · /agent Copilot page | `components/kinnso/pages/AgentCopilotView.tsx` (new), `app/[locale]/agent/page.tsx`, `tests/kinnso.AgentCopilotView.test.tsx` (new), `tests/agent.host.test.tsx` (new), i18n (new `agent` group) |
| Z · Gate | full suite + typecheck + lint + build + live smoke |

---

## Phase 0 — Branch setup (prerequisite, no code)

Phase 2 stacks on Phase 1 (PR #37). Pick the base:

- [ ] **If PR #37 is merged into `origin/main`:** branch off the updated main.
  ```bash
  cd "<repo>/kinnso-v3"
  git fetch origin
  git checkout -b feat/phase2-demock-spine origin/main
  ```
- [ ] **If PR #37 is NOT yet merged:** stack on the Phase 1 branch so its nav fixes are in the base.
  ```bash
  cd "<repo>/kinnso-v3"
  git checkout feat/phase1-honest-nav && git pull --ff-only
  git checkout -b feat/phase2-demock-spine
  ```
- [ ] Confirm the working tree is clean and you're on `feat/phase2-demock-spine` (`git status`, `git branch --show-current`).

---

## Workstream A — Public guides are real-only (drop the seed)

The public guide *listing* (`getPublishedGuides`) and the guide *detail* fallback (`getGuideBySlug`) currently append/return mock guides from `@/lib/creator-mock`. Phase 2 removes the mock seed so public guides reflect only the database.

### Task 1: `getPublishedGuides()` returns DB guides only

**Files:**
- Modify: `apps/web/lib/guides/queries.ts`
- Test: `apps/web/tests/guides.queries.test.ts`

- [ ] **Step 1: Read the current test file** `apps/web/tests/guides.queries.test.ts` so you know its mock-Supabase setup and which assertions reference `mergeWithSeed`/mock guides.

- [ ] **Step 2: Update the test to assert DB-only behavior.** Replace any test asserting that mock seed guides are appended with one asserting they are NOT. The key behavioral assertions to have:

```ts
it('returns only DB guides (no mock seed appended)', async () => {
  // arrange the mocked supabase to return exactly one published row, then:
  const result = await getPublishedGuides()
  expect(result).toHaveLength(1)
  expect(result.every((g) => g.slug !== 'kyoto-coffee')).toBe(true) // a known mock slug
})

it('returns an empty array when the DB has no published guides', async () => {
  // arrange supabase to return [] (or null), then:
  const result = await getPublishedGuides()
  expect(result).toEqual([])
})
```
If the file currently imports/tests `mergeWithSeed`, delete those tests (the function is removed in Step 4). Use a mock slug that actually exists in `@/lib/creator-mock` for the negative assertion — open `lib/creator-mock/data.ts` and pick a real one (e.g. the first guide's slug).

- [ ] **Step 3: Run the test — expect FAIL.**
  Run: `pnpm exec vitest run tests/guides.queries.test.ts`
  Expected: FAIL (current code still appends `mockGuides`).

- [ ] **Step 4: Implement DB-only.** Edit `lib/guides/queries.ts`:
  - Remove the `mergeWithSeed` function entirely (lines defining it) — it becomes unused.
  - Change `getPublishedGuides` to return `dbGuides` directly:

```ts
export async function getPublishedGuides(): Promise<Guide[]> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('guides')
    .select('slug, title, cover_url, city, saves_count, creator_handle')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  return (data ?? []).map(mapRowToGuide)
}
```
  - Remove the now-unused `import { guides as mockGuides, type Guide }` — but keep `type Guide` (still used by `mapRowToGuide`). Change that import to `import type { Guide } from '@/lib/creator-mock'` (type-only; drops the `mockGuides` value import).

- [ ] **Step 5: Run the test — expect PASS.**
  Run: `pnpm exec vitest run tests/guides.queries.test.ts`
  Expected: PASS.

- [ ] **Step 6: Commit.**
```bash
git add apps/web/lib/guides/queries.ts apps/web/tests/guides.queries.test.ts
git commit -m "feat(web): public guide listing returns real DB guides only (drop mock seed)"
```

### Task 2: `getGuideBySlug()` returns DB guides only (no mock fallback)

**Files:**
- Modify: `apps/web/lib/guides/queries.ts`
- Test: `apps/web/tests/guides.slug.test.ts`

- [ ] **Step 1: Read `apps/web/tests/guides.slug.test.ts`** to see how it mocks Supabase and whether it asserts the mock fallback (`source: 'mock'`).

- [ ] **Step 2: Update the test** so an unknown / unpublished slug yields `null` (no mock fallback). Keep/confirm the DB-hit case returns `source: 'db'`:

```ts
it('returns null for a slug not in the database (no mock fallback)', async () => {
  // arrange supabase maybeSingle() to resolve { data: null }, then:
  const result = await getGuideBySlug('kyoto-coffee') // a known mock slug
  expect(result).toBeNull()
})
```
Delete any test asserting `source: 'mock'`.

- [ ] **Step 3: Run — expect FAIL.**
  Run: `pnpm exec vitest run tests/guides.slug.test.ts`
  Expected: FAIL (current code falls back to `mockGuides.find(...)`).

- [ ] **Step 4: Implement.** In `getGuideBySlug`, delete the mock-fallback tail so it returns `null` when there's no DB row:

```ts
export async function getGuideBySlug(slug: string): Promise<GuideDetail | null> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('guides')
    .select('slug, title, cover_url, city, saves_count, creator_handle, creator_name, summary')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (!data) return null
  return {
    ...mapRowToGuide(data),
    summary: data.summary,
    creatorName: data.creator_name,
    source: 'db',
  }
}
```

- [ ] **Step 5: Run — expect PASS.** `pnpm exec vitest run tests/guides.slug.test.ts` → PASS.

- [ ] **Step 6: Verify the `g/[slug]` page still typechecks** with a possibly-`null` result (it already handles `null` → `notFound`). Run `pnpm exec vitest run tests/guides.slug.test.ts tests/guides.queries.test.ts` to confirm both green together.

- [ ] **Step 7: Commit.**
```bash
git add apps/web/lib/guides/queries.ts apps/web/tests/guides.slug.test.ts
git commit -m "feat(web): guide detail returns real DB guide only (drop mock fallback)"
```

---

## Workstream B — Home: real guides rail, kill fabricated payouts + partner wall

`HomeView` renders three fabricated things: `<EarningsTicker />` (fake payouts), a `merchantLogos` partner wall (fake brands), and a "featured" rail of mock `creators`. Replace the rail with **real published guides** and remove the two fake bands.

### Task 3: Remove the fake earnings ticker and partner-logo wall from the home page

**Files:**
- Modify: `apps/web/components/kinnso/pages/HomeView.tsx`
- Test: `apps/web/tests/kinnso.HomeView.test.tsx`

- [ ] **Step 1: Read `apps/web/tests/kinnso.HomeView.test.tsx`** to learn its render harness (how it builds `t`/props).

- [ ] **Step 2: Add failing assertions** that the fabricated bands are gone:

```ts
it('does not render the fabricated earnings ticker', () => {
  render(<HomeView locale="en" t={en.home} guides={[]} />)
  expect(screen.queryByLabelText('Recent creator payouts')).toBeNull()
})

it('does not render the fabricated partner-logo wall', () => {
  render(<HomeView locale="en" t={en.home} guides={[]} />)
  expect(screen.queryByText(en.home.merchantWall)).toBeNull()
})
```
> Note `guides={[]}` — the new required prop added in Task 4. If you are doing Task 3 strictly before Task 4, temporarily render `<HomeView locale="en" t={en.home} />` and add `guides` in Task 4. Recommended: do Tasks 3 and 4 back-to-back and use the final `guides={[]}` signature throughout.

- [ ] **Step 3: Run — expect FAIL** (ticker + wall still present).
  Run: `pnpm exec vitest run tests/kinnso.HomeView.test.tsx`

- [ ] **Step 4: Implement.** In `HomeView.tsx`:
  - Delete the `<EarningsTicker />` line (was right after the hero `</section>`).
  - Delete the entire partner-wall `<section>` block (the `border-y … bg-white py-10` section that maps `merchantLogos`).
  - Remove now-unused imports: `EarningsTicker`, and from the `creator-mock` import remove `merchantLogos` (keep `creators` only until Task 4 removes it too).

- [ ] **Step 5: Run — expect PASS.** `pnpm exec vitest run tests/kinnso.HomeView.test.tsx`

- [ ] **Step 6: Commit.**
```bash
git add apps/web/components/kinnso/pages/HomeView.tsx apps/web/tests/kinnso.HomeView.test.tsx
git commit -m "feat(web): remove fabricated earnings ticker and partner-logo wall from home"
```

### Task 4: Home featured rail shows real published guides

**Files:**
- Modify: `apps/web/components/kinnso/pages/HomeView.tsx`, `apps/web/app/[locale]/page.tsx`
- Modify: i18n `home` group (add `featuredEmpty`; relabel `featuredHeading`/`featuredSub`) — all 7 locale files + `Messages` interface in `en.ts`
- Test: `apps/web/tests/kinnso.HomeView.test.tsx`, `apps/web/tests/home.host.test.tsx`

- [ ] **Step 1: Add the i18n key `home.featuredEmpty`.**
  - In `lib/i18n/messages/en.ts`, in the `home: {` **interface** block (around line 384), add `featuredEmpty: string` to the line with `featuredSeeAll`.
  - In **all 7** locale value files, add a `featuredEmpty` value to the `home` object and relabel `featuredHeading`/`featuredSub` to guide-oriented copy. Values:

| key | en | ja | ko | th | zh-cn | zh-hk | zh-tw |
|---|---|---|---|---|---|---|---|
| `featuredHeading` | Featured guides | 注目のガイド | 추천 가이드 | ไกด์แนะนำ | 精选攻略 | 精選攻略 | 精選攻略 |
| `featuredSub` | Real city guides published by KINNSO creators. | KINNSOクリエイターが公開した実際のシティガイド。 | KINNSO 크리에이터가 발행한 실제 도시 가이드. | ไกด์เมืองจริงที่เผยแพร่โดยครีเอเตอร์ KINNSO | KINNSO 创作者发布的真实城市攻略。 | KINNSO 創作者發佈的真實城市攻略。 | KINNSO 創作者發佈的真實城市攻略。 |
| `featuredEmpty` | No published guides yet — be the first to publish one. | まだ公開されたガイドはありません。最初の一人になりましょう。 | 아직 발행된 가이드가 없습니다 — 첫 번째로 발행해 보세요. | ยังไม่มีไกด์ที่เผยแพร่ — มาเป็นคนแรกกัน | 还没有已发布的攻略——成为第一个发布的人。 | 仲未有已發佈嘅攻略——成為第一個發佈嘅人。 | 還沒有已發佈的攻略——成為第一個發佈的人。 |

- [ ] **Step 2: Add failing test assertions** in `tests/kinnso.HomeView.test.tsx`:

```ts
it('renders a card per real guide in the featured rail', () => {
  const guides = [
    { slug: 'a', title: 'Real Osaka Guide', cover: '/a.jpg', city: 'Osaka', saves: 12, creatorHandle: 'mei' },
    { slug: 'b', title: 'Real Seoul Guide', cover: '/b.jpg', city: 'Seoul', saves: 7, creatorHandle: 'jun' },
  ]
  render(<HomeView locale="en" t={en.home} guides={guides} />)
  expect(screen.getByText('Real Osaka Guide')).toBeTruthy()
  expect(screen.getByRole('link', { name: /Real Osaka Guide/ }).getAttribute('href')).toBe('/en/g/a')
})

it('shows the empty note when there are no guides', () => {
  render(<HomeView locale="en" t={en.home} guides={[]} />)
  expect(screen.getByText(en.home.featuredEmpty)).toBeTruthy()
})

it('the see-all link points to /explore', () => {
  render(<HomeView locale="en" t={en.home} guides={[]} />)
  expect(screen.getByRole('link', { name: /featuredSeeAll/i }) // adjust matcher to en.home.featuredSeeAll text
    .getAttribute('href')).toBe('/en/explore')
})
```
Use the actual `en.home.featuredSeeAll` string for the see-all matcher.

- [ ] **Step 3: Run — expect FAIL** (HomeView has no `guides` prop yet; rail renders mock creators).
  Run: `pnpm exec vitest run tests/kinnso.HomeView.test.tsx`

- [ ] **Step 4: Implement `HomeView.tsx`.**
  - Add `guides` to the props and type it:
    ```tsx
    import GuideCard from "@/components/kinnso/GuideCard";
    import type { Guide } from "@/lib/creator-mock";
    // ...
    export function HomeView({ locale, t, guides }: { locale: Locale; t: Messages["home"]; guides: Guide[] }) {
    ```
  - Delete `const featured = creators.slice(0, 6);` and remove `creators` and `CreatorCard` imports (now unused — `creator-mock` import can be dropped entirely if nothing else from it remains).
  - Replace the featured-rail section body. Change the "see all" link `href={p("/feed")}` → `href={p("/explore")}`. Render guides (or the empty note):
    ```tsx
    <div className="no-scrollbar mt-6 -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
      {guides.length === 0 ? (
        <p className="text-kinnso-muted">{t.featuredEmpty}</p>
      ) : (
        guides.slice(0, 6).map((g) => <GuideCard key={g.slug} g={g} locale={locale} />)
      )}
    </div>
    ```

- [ ] **Step 5: Wire `page.tsx`** to fetch real guides and pass them:
```tsx
import { getPublishedGuides } from '@/lib/guides/queries'
// ...
export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const guides = await getPublishedGuides()
  return <HomeView locale={locale as Locale} t={messages.home} guides={guides} />
}
```

- [ ] **Step 6: Update `tests/home.host.test.tsx`.** It calls `LocaleHome(...)` which now awaits Supabase via `getPublishedGuides`. Add a mock for `@/lib/supabase/public` (mirror the `studio.scan.host.test.tsx` builder pattern) returning `{ data: [] }`, or mock `@/lib/guides/queries` directly:
```ts
vi.mock('@/lib/guides/queries', () => ({ getPublishedGuides: async () => [] }))
```
Keep the existing assertion (hero heading renders).

- [ ] **Step 7: Run both — expect PASS.**
  Run: `pnpm exec vitest run tests/kinnso.HomeView.test.tsx tests/home.host.test.tsx`

- [ ] **Step 8: Run the i18n parity test.**
  Run: `pnpm exec vitest run tests/i18n.locale-parity.test.ts`
  Expected: PASS (the new `featuredEmpty` key is in all 7 files + interface).

- [ ] **Step 9: Commit.**
```bash
git add apps/web/components/kinnso/pages/HomeView.tsx apps/web/app/[locale]/page.tsx apps/web/lib/i18n/messages apps/web/tests/kinnso.HomeView.test.tsx apps/web/tests/home.host.test.tsx
git commit -m "feat(web): wire home featured rail to real published guides + empty state"
```

---

## Workstream C — Honest /creators (no fabricated creators)

`CreatorsLandingView` renders a mock featured-creator card in the hero and a "Featured creators" rail of mock `creators`. Both are fabricated. Remove them; keep the honest marketing (hero copy, how-it-works, CTA).

### Task 5: Remove fabricated creators from the /creators landing

**Files:**
- Modify: `apps/web/components/kinnso/pages/CreatorsLandingView.tsx`
- Test: `apps/web/tests/kinnso.CreatorsLandingView.test.tsx`

- [ ] **Step 1: Read `apps/web/tests/kinnso.CreatorsLandingView.test.tsx`** for its render harness; note any assertion that depends on a mock creator name/handle.

- [ ] **Step 2: Add failing assertions** that no mock creator data renders, and the honest sections remain:
```ts
import { creators } from '@/lib/creator-mock'
// ...
it('does not render any fabricated creator card', () => {
  render(<CreatorsLandingView locale="en" t={en.creatorsLanding} />)
  // none of the mock creator handles should appear on an honest marketing page
  for (const c of creators.slice(0, 6)) {
    expect(screen.queryByText(`@${c.handle}`)).toBeNull()
  }
})
it('keeps the hero and apply CTA', () => {
  render(<CreatorsLandingView locale="en" t={en.creatorsLanding} />)
  expect(screen.getByRole('heading', { level: 1, name: en.creatorsLanding.heroTitle })).toBeTruthy()
  expect(screen.getByRole('link', { name: new RegExp(en.creatorsLanding.applyCta) }).getAttribute('href')).toBe('/en/sign-up')
})
```
Delete/replace any existing assertion that expects a mock creator to be shown.

- [ ] **Step 3: Run — expect FAIL.** `pnpm exec vitest run tests/kinnso.CreatorsLandingView.test.tsx`

- [ ] **Step 4: Implement `CreatorsLandingView.tsx`.**
  - Delete `const featured = creators.slice(0, 6)` and the `creators` import; remove the `CreatorCard` import.
  - Delete the hero "Passport visual block — featured creator ticket" (`{featured[0] && (...)}`).
  - Delete the entire "FEATURED CREATORS" `<section>` (heading `t.featuredHeading` + the mock rail).
  - Keep hero (pill/title/subtitle/apply CTA), the HOW-IT-WORKS section, and the CTA section.
  - `featuredHeading`/`featuredSub` keys become unused — **leave them in the dictionaries** (parity-safe). If `RouteMarkers`/`TicketDivider` become unused after deleting the hero ticket, remove them from the import to satisfy lint (`TicketCard` is still used by HOW + CTA).

- [ ] **Step 5: Run — expect PASS.** `pnpm exec vitest run tests/kinnso.CreatorsLandingView.test.tsx`

- [ ] **Step 6: Commit.**
```bash
git add apps/web/components/kinnso/pages/CreatorsLandingView.tsx apps/web/tests/kinnso.CreatorsLandingView.test.tsx
git commit -m "feat(web): make /creators honest marketing (drop fabricated creator cards)"
```

---

## Workstream D — Scan shows real DNA only

**The #1 honesty violation:** for a logged-in creator, `/studio/scan` overlays the mock `maywanders` metrics (`score`, avg likes `3,400`, saves `980`, ER, `69%` travel, tier, audience split, content mix, map, top posts, tag cloud, matched missions) on the creator's **own** report. We only store *qualitative* DNA. Fix: in **real** mode, render identity + the real `DnaCorePanel` + an honest "view missions" CTA, and nothing that reads `metrics`/mock fixtures. Keep the **anon demo** but label it unmistakably as a sample.

### Task 6: Gate all mock-metric sections behind demo mode in `StudioScanView`

**Files:**
- Modify: `apps/web/components/kinnso/pages/StudioScanView.tsx`
- Test: `apps/web/tests/kinnso.StudioScanView.test.tsx`

- [ ] **Step 1: Read `apps/web/tests/kinnso.StudioScanView.test.tsx`** to learn how it constructs `identity`, `dna`, `metrics`, and which mode each test uses.

- [ ] **Step 2: Add failing assertions** for real mode = real DNA only:
```ts
it('real mode renders the DNA core but NOT the fabricated metric sections', () => {
  render(
    <StudioScanView locale="en" mode="real" identity={realIdentity} dna={realDna}
      metrics={maywanders} isSample={false} t={en.studio} />
  )
  expect(screen.getByText(en.studio.dnaCoreHeading)).toBeTruthy()       // real DNA core present
  expect(screen.queryByText(en.studio.yourAudience)).toBeNull()         // audience split gone
  expect(screen.queryByText(en.studio.whatYouCreate)).toBeNull()        // content mix gone
  expect(screen.queryByText(en.studio.bestTravelPosts)).toBeNull()      // top posts gone
  expect(screen.queryByText('3,400')).toBeNull()                        // fabricated avg likes gone
  expect(screen.queryByText(en.studio.sampleNote)).toBeNull()           // real DNA is not a "sample"
})
it('real mode offers an honest link to real missions', () => {
  render(
    <StudioScanView locale="en" mode="real" identity={realIdentity} dna={realDna}
      metrics={maywanders} isSample={false} t={en.studio} />
  )
  expect(screen.getByRole('link', { name: new RegExp(en.studio.viewAllMissions) })
    .getAttribute('href')).toBe('/en/studio/missions')
})
it('demo mode still renders the full sample report', () => {
  render(
    <StudioScanView locale="en" mode="demo" identity={demoIdentity} dna={sampleDna}
      metrics={maywanders} isSample={false} t={en.studio} />
  )
  expect(screen.getByText(en.studio.yourAudience)).toBeTruthy()
})
```
Build `realIdentity`/`realDna` from `buildStudioIdentity` + `sampleDna` the way the host test does, or reuse existing fixtures in this test file.

- [ ] **Step 3: Run — expect FAIL** (real mode currently renders every section).
  Run: `pnpm exec vitest run tests/kinnso.StudioScanView.test.tsx`

- [ ] **Step 4: Implement.** In `StudioScanView.tsx`, wrap the fabricated sections so they render **only in demo mode**. Concretely, change the report body so sections **4 → 12** (score ring + tier, score breakdown, trend, audience, content mix, map/places, top posts, tag cloud, matched missions) and the demo-only footer are inside `{isDemo && (…)}`. Sections **1 (report header), 2 (identity card), 3 (`<DnaCorePanel dna={dna} t={t} />`)** render in both modes.
  - Replace the matched-missions block (demo) and add a **real-mode CTA**: a `Link` to real missions so real mode isn't a dead end. After the `<DnaCorePanel/>`, add:
    ```tsx
    {!isDemo && (
      <div>
        <Link href={studioMissionsHref} className="k-btn-primary inline-flex">
          {t.viewAllMissions} <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4" />
        </Link>
      </div>
    )}
    ```
    Add `import Link from "next/link"` (and keep `ArrowRight`). `studioMissionsHref` already exists.
  - The mock fixture filters (`locs`, `posts`, `places`, `history`, `topPosts`, `breakdown`, `matched`, `tierIdx`) are only referenced inside the now-demo-gated JSX. To avoid "computed but unused in real mode" lint warnings and needless work, leave them as-is **only if** still lint-clean; if lint complains, move those `const`s inside the `isDemo` block or guard with `isDemo`.
  - The `isSample` sample-note (`{isSample && <p>{t.sampleNote}</p>}`) and the `sampleChip` remain — they now only ever show in demo (real mode passes `isSample={false}` from the page in Task 7).
  - `CityDetailDrawer` and `ShareDnaDialog` at the bottom are already `isDemo`-gated for Share; ensure the `CityDetailDrawer` is also demo-only (it reads mock `posts`/`places`). Wrap it: `{isDemo && <CityDetailDrawer … />}`.

- [ ] **Step 5: Run — expect PASS.** `pnpm exec vitest run tests/kinnso.StudioScanView.test.tsx`

- [ ] **Step 6: Commit.**
```bash
git add apps/web/components/kinnso/pages/StudioScanView.tsx apps/web/tests/kinnso.StudioScanView.test.tsx
git commit -m "feat(web): scan real mode shows real DNA only (gate mock metric sections to demo)"
```

### Task 7: Scan page passes honest flags + label the anon demo as a sample

**Files:**
- Modify: `apps/web/app/[locale]/studio/scan/page.tsx`
- Modify: `apps/web/components/kinnso/pages/StudioScanView.tsx` (demo banner)
- Modify: i18n `studio` group (add `demoBanner`) — 7 locale files + `Messages` interface
- Test: `apps/web/tests/studio.scan.host.test.tsx`

- [ ] **Step 1: Add the i18n key `studio.demoBanner`.**
  - In `en.ts` interface, add `demoBanner: string` to the `studio` interface block (next to `sampleNote`).
  - In all 7 locale files, add to the `studio` object:

| key | en | ja | ko | th | zh-cn | zh-hk | zh-tw |
|---|---|---|---|---|---|---|---|
| `demoBanner` | Sample report — sign up and scan to see your own Creator DNA. | サンプルレポートです。登録してスキャンすると、あなた自身のクリエイターDNAを表示できます。 | 샘플 리포트입니다 — 가입 후 스캔하면 나만의 크리에이터 DNA를 볼 수 있어요. | นี่คือรายงานตัวอย่าง — สมัครและสแกนเพื่อดู Creator DNA ของคุณเอง | 这是示例报告——注册并扫描即可查看你自己的创作者 DNA。 | 呢個係示範報告——註冊並掃描就可以睇到你自己嘅創作者 DNA。 | 這是示範報告——註冊並掃描即可查看你自己的創作者 DNA。 |

- [ ] **Step 2: Add a failing host-test assertion.** In `tests/studio.scan.host.test.tsx`, update the anon test and the logged-in test:
```ts
it('anon → sample demo, clearly labelled', async () => {
  state.user = null
  const ui = await StudioScanPage({ params: Promise.resolve({ locale: 'en' }) })
  render(ui)
  expect(screen.getByText(en.studio.demoBanner)).toBeTruthy()           // NEW: demo is labelled
  expect(screen.getByText(en.studio.reportReadyHeading)).toBeTruthy()
})

it('logged-in + valid final DNA → real DNA core, no fabricated metrics, no sample note', async () => {
  state.user = { id: 'u1' }
  state.rows = {
    creators: { display_name: 'May Wong' },
    creator_social_handles: [{ platform: 'instagram', handle: 'maygram', url: null }],
    creator_dna: { final: sampleDna, updated_at: '2026-06-01T00:00:00Z' },
  }
  const ui = await StudioScanPage({ params: Promise.resolve({ locale: 'en' }) })
  render(ui)
  expect(screen.getByText('May Wong')).toBeTruthy()
  expect(screen.getByText(sampleDna.bio)).toBeTruthy()                  // real DNA core
  expect(screen.queryByText(en.studio.sampleNote)).toBeNull()          // not a sample anymore
  expect(screen.queryByText(en.studio.demoBanner)).toBeNull()
  expect(screen.queryByText(en.studio.whatYouCreate)).toBeNull()       // content-mix donut gone
})
```
> This deletes the old line-64 "content-mix donut renders in real mode" workaround — that collision no longer exists once metrics are demo-gated.

- [ ] **Step 3: Run — expect FAIL.** `pnpm exec vitest run tests/studio.scan.host.test.tsx`

- [ ] **Step 4a: Implement the page change.** In `app/[locale]/studio/scan/page.tsx`, the **real** branch must pass `isSample={false}` (the DNA is genuinely the creator's):
```tsx
return (
  <StudioScanView
    locale={locale as Locale}
    mode="real"
    identity={buildStudioIdentity(
      { display_name: creatorRow?.display_name ?? null },
      handles, dna, updatedAt,
    )}
    dna={dna}
    metrics={metrics}
    isSample={false}
    t={t}
  />
)
```
Update the file's doc-comment block (lines 15-26) to state real mode = real DNA only; demo = labelled sample.

- [ ] **Step 4b: Implement the demo banner** in `StudioScanView.tsx`. At the top of the **DNA REPORT** return (inside the demo path), render the banner only in demo mode — e.g. right after the report-header `</section>`:
```tsx
{isDemo && (
  <div className="rounded-md bg-kinnso-amber/40 px-4 py-2 text-center text-sm font-semibold text-kinnso-ink">
    {t.demoBanner}
  </div>
)}
```

- [ ] **Step 5: Run — expect PASS.**
  Run: `pnpm exec vitest run tests/studio.scan.host.test.tsx tests/kinnso.StudioScanView.test.tsx tests/i18n.locale-parity.test.ts`

- [ ] **Step 6: Commit.**
```bash
git add apps/web/app/[locale]/studio/scan/page.tsx apps/web/components/kinnso/pages/StudioScanView.tsx apps/web/lib/i18n/messages apps/web/tests/studio.scan.host.test.tsx
git commit -m "feat(web): label anon scan demo as a sample; real scan drops sample framing"
```

---

## Workstream E — Apply funnel (role-aware redirect, creator framing, terms link, unify)

`/studio` is the role-aware hub (it redirects merchant→`/merchants/post`, ops→`/ops/settlements`, onboarding-creator→`/creator`, active-creator→dashboard). Today sign-in/sign-up hardcode `/creator`, so a returning **merchant/ops/active-creator** lands on the onboarding wizard. Route login through the hub. Add creator framing + a real terms link to sign-up. Make `/creators/apply` point at the single apply entry (`/sign-up`).

### Task 8: Sign-in routes through the role-aware hub (`/studio`)

**Files:**
- Modify: `apps/web/app/[locale]/sign-in/page.tsx`, `apps/web/app/[locale]/sign-in/SignInForm.tsx`
- Test: existing sign-in tests if any (search `tests/` for `signin`/`sign-in`); otherwise add `tests/auth.signin-redirect.test.tsx`

- [ ] **Step 1: Read `SignInForm.tsx`** to find the post-login `router.push(...)` target (mirror of `SignUpForm`). Check for an existing sign-in test (`ls apps/web/tests | grep -i sign`).

- [ ] **Step 2: Write/adjust the failing test.** Assert the page-level "already signed in" guard redirects to `/studio`, and the form pushes `/studio` after a successful sign-in. If no harness exists for the client form, at minimum cover the page guard (mirror `tests/auth.signup-page.test.tsx`):
```ts
it('redirects an already-signed-in user to the role-aware hub /studio', async () => {
  // arrange supabase getUser → a user
  await expect(/* call SignInPage and assert redirect('/en/studio') */).toBeTruthy()
})
```
Use the same `redirect` spy pattern the signup-page test uses.

- [ ] **Step 3: Run — expect FAIL.**

- [ ] **Step 4: Implement.**
  - `sign-in/page.tsx`: change `if (user) redirect(\`/${locale}/creator\`)` → `redirect(\`/${locale}/studio\`)`.
  - `SignInForm.tsx`: change the post-login `router.push(\`/${locale}/creator\`)` → `router.push(\`/${locale}/studio\`)` (keep the `router.refresh()` if present).

- [ ] **Step 5: Run — expect PASS.**

- [ ] **Step 6: Commit.**
```bash
git add apps/web/app/[locale]/sign-in apps/web/tests
git commit -m "feat(web): route sign-in through the role-aware /studio hub"
```

### Task 9: Sign-up creator framing + terms acknowledgment link

**Files:**
- Modify: `apps/web/app/[locale]/sign-up/page.tsx`
- Modify: i18n `auth` group (add `signUpCreatorTitle`, `signUpCreatorSubtitle`, `termsPrefix`, `termsLink`) — 7 locale files + `Messages` interface
- Test: `apps/web/tests/auth.signup-page.test.tsx`

- [ ] **Step 1: Add the four i18n keys** to the `auth` interface in `en.ts` and to all 7 locale files' `auth` object:

| key | en | ja | ko | th | zh-cn | zh-hk | zh-tw |
|---|---|---|---|---|---|---|---|
| `signUpCreatorTitle` | Apply as a creator | クリエイターとして応募 | 크리에이터로 지원하기 | สมัครเป็นครีเอเตอร์ | 申请成为创作者 | 申請成為創作者 | 申請成為創作者 |
| `signUpCreatorSubtitle` | Create your account, scan your Creator DNA, and start earning with KINNSO. | アカウントを作成し、クリエイターDNAをスキャンして、KINNSOで収益を得ましょう。 | 계정을 만들고 크리에이터 DNA를 스캔한 뒤 KINNSO에서 수익을 시작하세요. | สร้างบัญชี สแกน Creator DNA ของคุณ และเริ่มสร้างรายได้กับ KINNSO | 创建账户，扫描你的创作者 DNA，开始在 KINNSO 赚取收益。 | 建立帳戶，掃描你嘅創作者 DNA，喺 KINNSO 開始賺取收益。 | 建立帳戶，掃描你的創作者 DNA，在 KINNSO 開始賺取收益。 |
| `termsPrefix` | By creating an account you agree to our | アカウントを作成すると、次に同意したことになります： | 계정을 만들면 다음에 동의하는 것입니다: | เมื่อสร้างบัญชี ถือว่าคุณยอมรับ | 创建账户即表示你同意我们的 | 建立帳戶即表示你同意我哋嘅 | 建立帳戶即表示你同意我們的 |
| `termsLink` | Creator Terms | クリエイター規約 | 크리에이터 약관 | ข้อกำหนดสำหรับครีเอเตอร์ | 创作者条款 | 創作者條款 | 創作者條款 |

- [ ] **Step 2: Add failing assertions** in `tests/auth.signup-page.test.tsx`:
```ts
it('uses creator framing and a real terms link', async () => {
  // arrange supabase getUser → null (anon), searchParams → {}
  const ui = await SignUpPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })
  render(ui)
  expect(screen.getByRole('heading', { level: 1, name: en.auth.signUpCreatorTitle })).toBeTruthy()
  expect(screen.getByText(en.auth.signUpCreatorSubtitle)).toBeTruthy()
  expect(screen.getByRole('link', { name: en.auth.termsLink }).getAttribute('href')).toBe('/en/legal/creator-terms')
})
it('redirects an already-signed-in user to /studio', async () => {
  // arrange supabase getUser → a user; assert redirect('/en/studio')
})
```

- [ ] **Step 3: Run — expect FAIL.** `pnpm exec vitest run tests/auth.signup-page.test.tsx`

- [ ] **Step 4: Implement `sign-up/page.tsx`.**
  - Change the heading from `{dict.auth.signUp}` → `{dict.auth.signUpCreatorTitle}` and add a subtitle `<p>` under it with `{dict.auth.signUpCreatorSubtitle}`.
  - Change the "already signed in" guard `if (user) redirect(\`/${locale}/creator\`)` → `redirect(\`/${locale}/studio\`)`. (Leave `SignUpForm`'s fresh-signup `router.push(\`/${locale}/creator\`)` as-is — a brand-new creator should land in onboarding.)
  - Below the `<SignUpForm/>` (inside the non-`sent` branch), add a terms acknowledgment line:
    ```tsx
    <p className="mt-3 text-xs text-ink/60">
      {dict.auth.termsPrefix}{' '}
      <Link href={`/${locale}/legal/creator-terms`} className="underline text-ink">
        {dict.auth.termsLink}
      </Link>.
    </p>
    ```

- [ ] **Step 5: Run — expect PASS.** `pnpm exec vitest run tests/auth.signup-page.test.tsx tests/i18n.locale-parity.test.ts`

- [ ] **Step 6: Commit.**
```bash
git add apps/web/app/[locale]/sign-up/page.tsx apps/web/lib/i18n/messages apps/web/tests/auth.signup-page.test.tsx
git commit -m "feat(web): creator framing + terms link on sign-up; route guard to /studio"
```

### Task 10: Unify `/creators/apply` to the single apply entry

**Files:**
- Modify: `apps/web/app/[locale]/creators/apply/page.tsx`
- Test: add `apps/web/tests/creators.apply-redirect.test.tsx` (or extend an existing redirect test)

- [ ] **Step 1: Write the failing test** asserting the redirect target is `/sign-up` (the funnel front door — anon-safe; `/creator` bounces anon users to sign-in anyway):
```ts
it('redirects /creators/apply to the apply entry /sign-up', async () => {
  // spy on next/navigation redirect
  await CreatorApplyPage({ params: Promise.resolve({ locale: 'en' }) })
  expect(redirect).toHaveBeenCalledWith('/en/sign-up')
})
it('falls back to en for an unknown locale', async () => {
  await CreatorApplyPage({ params: Promise.resolve({ locale: 'zz' }) })
  expect(redirect).toHaveBeenCalledWith('/en/sign-up')
})
```

- [ ] **Step 2: Run — expect FAIL** (currently redirects to `/creator`).

- [ ] **Step 3: Implement** — change the redirect target:
```tsx
export default async function CreatorApplyPage({ params }: RouteHostProps) {
  const { locale } = await params
  redirect(`/${isLocale(locale) ? (locale as Locale) : 'en'}/sign-up`)
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit.**
```bash
git add apps/web/app/[locale]/creators/apply/page.tsx apps/web/tests/creators.apply-redirect.test.tsx
git commit -m "feat(web): unify /creators/apply into the /sign-up apply funnel"
```

---

## Workstream F — `/agent` Creator Copilot marketing page

Replace the `ComingSoonPage` stub with a real, honest marketing/value-prop page. It explains the copilot (grow audience / find ideas / produce better content), teases the tier ladder, and drives sign-up. **No fabricated agent output presented as live** — copy is aspirational but clearly "coming soon inside Studio."

### Task 11: Add the `agent` i18n group

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface + en values), and the other 6 locale files
- Test: `apps/web/tests/i18n.locale-parity.test.ts`

- [ ] **Step 1: Add the `agent` interface block** to `Messages` in `en.ts` (place near `comingSoon`):
```ts
agent: {
  heroPill: string; heroTitle: string; heroSubtitle: string
  heroCta: string; heroSecondaryCta: string
  valuesHeading: string
  value1Title: string; value1Desc: string
  value2Title: string; value2Desc: string
  value3Title: string; value3Desc: string
  tiersHeading: string; tiersSub: string; comingNote: string
  ctaTitle: string; ctaDesc: string; ctaButton: string
}
```

- [ ] **Step 2: Add the `agent` values to all 7 locale files.** English (`en.ts` value block):
```ts
agent: {
  heroPill: 'Creator Copilot',
  heroTitle: 'Your AI copilot for growing as a creator',
  heroSubtitle: 'KINNSO Copilot is a growing library of saved AI agents that help you grow your audience, find your next idea, and produce content that earns.',
  heroCta: 'Join as a creator',
  heroSecondaryCta: 'See how it works',
  valuesHeading: 'What your copilot will do',
  value1Title: 'Grow your audience',
  value1Desc: 'Data-backed prompts on what to post, when, and where — tuned to your Creator DNA.',
  value2Title: 'Never run out of ideas',
  value2Desc: 'Surface fresh content angles and trending places that fit your niche and audience.',
  value3Title: 'Produce better content',
  value3Desc: 'Turn a rough idea into captions, shot lists, and guide drafts you can publish in minutes.',
  tiersHeading: 'A better copilot as you climb',
  tiersSub: 'Publish guides and complete missions to level up. Higher tiers unlock more agents, higher limits, better commissions, and exclusive missions.',
  comingNote: 'The copilot ships inside Studio in a later release. Join now to be first in line.',
  ctaTitle: 'Get your copilot',
  ctaDesc: 'Sign up as a creator, scan your DNA, and be first to use the copilot when it lands.',
  ctaButton: 'Join KINNSO',
},
```
  Translations for the other 6 locales (same keys, in this order: heroPill, heroTitle, heroSubtitle, heroCta, heroSecondaryCta, valuesHeading, value1Title, value1Desc, value2Title, value2Desc, value3Title, value3Desc, tiersHeading, tiersSub, comingNote, ctaTitle, ctaDesc, ctaButton):

  **ja:** 'クリエイターCopilot' · 'クリエイターとして成長するためのAI Copilot' · 'KINNSO Copilotは、オーディエンスを増やし、次のアイデアを見つけ、収益につながるコンテンツを作るのを助ける、増え続けるAIエージェントのライブラリです。' · 'クリエイターとして参加' · '仕組みを見る' · 'Copilotができること' · 'オーディエンスを増やす' · 'クリエイターDNAに合わせて、何を・いつ・どこで投稿すべきかをデータに基づいて提案。' · 'アイデアが尽きない' · 'あなたのニッチとオーディエンスに合う新しい切り口や話題のスポットを発見。' · 'より良いコンテンツを作る' · 'ラフなアイデアを、数分で公開できるキャプション・撮影リスト・ガイド下書きに。' · '上がるほど強くなるCopilot' · 'ガイドを公開しミッションを達成してレベルアップ。上位ティアではエージェント・利用上限・コミッション・限定ミッションが解放されます。' · 'Copilotは今後のリリースでStudio内に登場します。今すぐ参加して先頭に並びましょう。' · 'あなたのCopilotを手に入れる' · 'クリエイターとして登録し、DNAをスキャンして、Copilot登場時に最初に使いましょう。' · 'KINNSOに参加'

  **ko:** '크리에이터 코파일럿' · '크리에이터로 성장하는 AI 코파일럿' · 'KINNSO 코파일럿은 오디언스를 키우고, 다음 아이디어를 찾고, 수익이 되는 콘텐츠를 만들도록 돕는, 점점 늘어나는 AI 에이전트 라이브러리입니다.' · '크리에이터로 참여' · '작동 방식 보기' · '코파일럿이 하는 일' · '오디언스 키우기' · '크리에이터 DNA에 맞춰 무엇을·언제·어디에 올릴지 데이터 기반으로 제안.' · '아이디어가 마르지 않게' · '내 니치와 오디언스에 맞는 새로운 콘텐츠 앵글과 인기 장소를 발견.' · '더 나은 콘텐츠 제작' · '거친 아이디어를 몇 분 만에 발행 가능한 캡션·촬영 리스트·가이드 초안으로.' · '오를수록 강해지는 코파일럿' · '가이드를 발행하고 미션을 완료해 레벨업하세요. 상위 티어는 더 많은 에이전트, 높은 한도, 더 나은 커미션, 독점 미션을 해제합니다.' · '코파일럿은 향후 릴리스에서 Studio 안에 출시됩니다. 지금 참여해 가장 먼저 사용하세요.' · '코파일럿 받기' · '크리에이터로 가입하고 DNA를 스캔한 뒤, 코파일럿 출시 시 가장 먼저 사용하세요.' · 'KINNSO 참여하기'

  **th:** 'Creator Copilot' · 'AI ผู้ช่วยสำหรับการเติบโตในฐานะครีเอเตอร์' · 'KINNSO Copilot คือคลังเอเจนต์ AI ที่เพิ่มขึ้นเรื่อย ๆ ซึ่งช่วยให้คุณขยายผู้ติดตาม หาไอเดียถัดไป และผลิตคอนเทนต์ที่สร้างรายได้' · 'เข้าร่วมในฐานะครีเอเตอร์' · 'ดูวิธีการทำงาน' · 'สิ่งที่ Copilot ทำได้' · 'ขยายผู้ติดตาม' · 'คำแนะนำที่อิงข้อมูลว่าควรโพสต์อะไร เมื่อไร และที่ไหน — ปรับตาม Creator DNA ของคุณ' · 'ไม่มีวันหมดไอเดีย' · 'ค้นพบมุมคอนเทนต์ใหม่ ๆ และสถานที่กำลังมาที่เข้ากับสายและผู้ติดตามของคุณ' · 'ผลิตคอนเทนต์ที่ดีขึ้น' · 'เปลี่ยนไอเดียคร่าว ๆ ให้เป็นแคปชัน รายการช็อต และร่างไกด์ที่เผยแพร่ได้ในไม่กี่นาที' · 'Copilot ที่เก่งขึ้นเมื่อคุณไต่ระดับ' · 'เผยแพร่ไกด์และทำภารกิจให้สำเร็จเพื่อเลื่อนระดับ ระดับที่สูงขึ้นจะปลดล็อกเอเจนต์เพิ่ม ขีดจำกัดสูงขึ้น คอมมิชชันที่ดีขึ้น และภารกิจพิเศษ' · 'Copilot จะเปิดตัวภายใน Studio ในรุ่นถัดไป เข้าร่วมตอนนี้เพื่อเป็นคนแรก' · 'รับ Copilot ของคุณ' · 'สมัครเป็นครีเอเตอร์ สแกน DNA ของคุณ และเป็นคนแรกที่ได้ใช้ Copilot เมื่อเปิดตัว' · 'เข้าร่วม KINNSO'

  **zh-cn:** '创作者 Copilot' · '助你成长的创作者 AI 副驾' · 'KINNSO Copilot 是一个不断扩充的 AI 智能体库，帮助你扩大受众、找到下一个灵感，并产出能赚钱的内容。' · '以创作者身份加入' · '了解运作方式' · 'Copilot 能为你做什么' · '扩大受众' · '基于数据建议你该发什么、何时发、发在哪——并贴合你的创作者 DNA。' · '灵感永不枯竭' · '发掘契合你领域与受众的新内容角度与热门地点。' · '产出更好的内容' · '把粗略的想法变成可在几分钟内发布的文案、拍摄清单和攻略草稿。' · '等级越高，副驾越强' · '发布攻略、完成任务即可升级。更高等级解锁更多智能体、更高额度、更优佣金和专属任务。' · 'Copilot 将在后续版本中于 Studio 内上线。立即加入，抢先体验。' · '获取你的 Copilot' · '以创作者身份注册，扫描你的 DNA，在 Copilot 上线时抢先使用。' · '加入 KINNSO'

  **zh-hk:** '創作者 Copilot' · '助你成長嘅創作者 AI 副駕' · 'KINNSO Copilot 係一個不斷擴充嘅 AI 代理庫，幫你擴大受眾、搵到下一個靈感，並產出能賺錢嘅內容。' · '以創作者身份加入' · '了解運作方式' · 'Copilot 可以幫你做啲乜' · '擴大受眾' · '根據數據建議你應該出咩、幾時出、出喺邊——並貼合你嘅創作者 DNA。' · '靈感唔會枯竭' · '發掘啱你領域同受眾嘅新內容角度同熱門地點。' · '產出更好嘅內容' · '將粗略諗法變成幾分鐘就可以發佈嘅文案、拍攝清單同攻略草稿。' · '等級越高，副駕越強' · '發佈攻略、完成任務就可以升級。更高等級解鎖更多代理、更高額度、更優佣金同專屬任務。' · 'Copilot 會喺之後版本喺 Studio 內推出。即刻加入，搶先體驗。' · '攞你嘅 Copilot' · '以創作者身份註冊，掃描你嘅 DNA，喺 Copilot 推出時搶先使用。' · '加入 KINNSO'

  **zh-tw:** '創作者 Copilot' · '助你成長的創作者 AI 副駕' · 'KINNSO Copilot 是一個不斷擴充的 AI 代理庫，幫助你擴大受眾、找到下一個靈感，並產出能賺錢的內容。' · '以創作者身份加入' · '了解運作方式' · 'Copilot 能為你做什麼' · '擴大受眾' · '根據數據建議你該發什麼、何時發、發在哪——並貼合你的創作者 DNA。' · '靈感永不枯竭' · '發掘契合你領域與受眾的新內容角度與熱門地點。' · '產出更好的內容' · '把粗略的想法變成可在幾分鐘內發佈的文案、拍攝清單和攻略草稿。' · '等級越高，副駕越強' · '發佈攻略、完成任務即可升級。更高等級解鎖更多代理、更高額度、更優佣金和專屬任務。' · 'Copilot 會在後續版本於 Studio 內上線。立即加入，搶先體驗。' · '取得你的 Copilot' · '以創作者身份註冊，掃描你的 DNA，在 Copilot 上線時搶先使用。' · '加入 KINNSO'

- [ ] **Step 3: Run the parity test — expect PASS.**
  Run: `pnpm exec vitest run tests/i18n.locale-parity.test.ts`
  Expected: PASS (agent group present + identical key paths in all 7 + interface).

- [ ] **Step 4: Commit.**
```bash
git add apps/web/lib/i18n/messages
git commit -m "feat(web): add agent (Creator Copilot) i18n group across 7 locales"
```

### Task 12: Build the `AgentCopilotView` and wire `/agent` to it

**Files:**
- Create: `apps/web/components/kinnso/pages/AgentCopilotView.tsx`
- Modify: `apps/web/app/[locale]/agent/page.tsx`
- Test: create `apps/web/tests/kinnso.AgentCopilotView.test.tsx` and `apps/web/tests/agent.host.test.tsx`

- [ ] **Step 1: Write the failing view test** `tests/kinnso.AgentCopilotView.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AgentCopilotView } from '@/components/kinnso/pages/AgentCopilotView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('AgentCopilotView', () => {
  it('renders the hero, the three value props, and a sign-up CTA', () => {
    render(<AgentCopilotView locale="en" t={en.agent} />)
    expect(screen.getByRole('heading', { level: 1, name: en.agent.heroTitle })).toBeTruthy()
    expect(screen.getByText(en.agent.value1Title)).toBeTruthy()
    expect(screen.getByText(en.agent.value2Title)).toBeTruthy()
    expect(screen.getByText(en.agent.value3Title)).toBeTruthy()
    const ctas = screen.getAllByRole('link', { name: new RegExp(`${en.agent.heroCta}|${en.agent.ctaButton}`) })
    expect(ctas.some((a) => a.getAttribute('href') === '/en/sign-up')).toBe(true)
  })
  it('states the copilot is coming soon (no fabricated live output)', () => {
    render(<AgentCopilotView locale="en" t={en.agent} />)
    expect(screen.getByText(en.agent.comingNote)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (module doesn't exist).
  Run: `pnpm exec vitest run tests/kinnso.AgentCopilotView.test.tsx`

- [ ] **Step 3: Implement `AgentCopilotView.tsx`** (server component, mirror `CreatorsLandingView` styling conventions — Market Passport classes, `aria-hidden` on decorative icons):
```tsx
import Link from 'next/link'
import { ArrowRight, Sparkles, Lightbulb, Wand2 } from 'lucide-react'
import { RouteStamp, TicketCard } from '@/components/kinnso/MarketPassport'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function AgentCopilotView({ locale, t }: { locale: Locale; t: Messages['agent'] }) {
  const p = (path: string) => `/${locale}${path}`
  const values = [
    { title: t.value1Title, desc: t.value1Desc, icon: <Sparkles aria-hidden="true" className="h-5 w-5" /> },
    { title: t.value2Title, desc: t.value2Desc, icon: <Lightbulb aria-hidden="true" className="h-5 w-5" /> },
    { title: t.value3Title, desc: t.value3Desc, icon: <Wand2 aria-hidden="true" className="h-5 w-5" /> },
  ]
  return (
    <main>
      {/* HERO */}
      <section className="k-page-band py-20 md:py-28">
        <div className="k-container">
          <RouteStamp>{t.heroPill}</RouteStamp>
          <h1 className="k-display mt-4 max-w-3xl">{t.heroTitle}</h1>
          <p className="mt-5 max-w-xl text-lg text-kinnso-muted">{t.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={p('/sign-up')} className="k-btn-primary inline-flex">
              {t.heroCta} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
            </Link>
            <Link href={p('/creators')} className="k-btn-ghost inline-flex">{t.heroSecondaryCta}</Link>
          </div>
          <p className="mt-4 text-sm text-kinnso-muted">{t.comingNote}</p>
        </div>
      </section>

      {/* VALUE PROPS */}
      <section className="k-container py-16">
        <h2 className="k-section-title text-center">{t.valuesHeading}</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {values.map((v) => (
            <TicketCard key={v.title} className="h-full p-5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orange">{v.icon}</span>
              <h3 className="mt-4 text-lg font-bold text-kinnso-ink">{v.title}</h3>
              <p className="mt-1 text-sm text-kinnso-muted">{v.desc}</p>
            </TicketCard>
          ))}
        </div>
      </section>

      {/* TIER TEASER */}
      <section className="k-container pb-8">
        <TicketCard className="p-8">
          <h2 className="text-2xl font-black text-kinnso-ink">{t.tiersHeading}</h2>
          <p className="mt-2 max-w-2xl text-kinnso-muted">{t.tiersSub}</p>
        </TicketCard>
      </section>

      {/* CTA */}
      <section className="k-container pb-20">
        <TicketCard className="p-8 text-center">
          <h2 className="text-2xl font-black text-kinnso-ink">{t.ctaTitle}</h2>
          <p className="mt-2 text-kinnso-muted">{t.ctaDesc}</p>
          <Link href={p('/sign-up')} className="k-btn-primary mt-5 inline-flex">
            {t.ctaButton} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
          </Link>
        </TicketCard>
      </section>
    </main>
  )
}

export default AgentCopilotView
```
> Confirm the lucide icon names exist (`Sparkles`, `Lightbulb`, `Wand2`); if any is absent in the installed version, swap for one that is (e.g. `Bot`, `Rocket`). Confirm `k-section-title`/`k-btn-ghost` exist (used elsewhere); if not, copy the class usage from `CreatorsLandingView`.

- [ ] **Step 4: Run — expect PASS.** `pnpm exec vitest run tests/kinnso.AgentCopilotView.test.tsx`

- [ ] **Step 5: Wire `app/[locale]/agent/page.tsx`** (replace the ComingSoon stub):
```tsx
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { AgentCopilotView } from '@/components/kinnso/pages/AgentCopilotView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function AgentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  return <AgentCopilotView locale={locale as Locale} t={messages.agent} />
}
```

- [ ] **Step 6: Write the host test** `tests/agent.host.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))

import AgentPage from '@/app/[locale]/agent/page'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/agent host', () => {
  it('renders the Creator Copilot marketing page (not a coming-soon stub)', async () => {
    const ui = await AgentPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.agent.heroTitle })).toBeTruthy()
    expect(screen.queryByText(en.comingSoon.heading)).toBeNull()
  })
})
```

- [ ] **Step 7: Run — expect PASS.** `pnpm exec vitest run tests/agent.host.test.tsx tests/kinnso.AgentCopilotView.test.tsx`

- [ ] **Step 8: Commit.**
```bash
git add apps/web/components/kinnso/pages/AgentCopilotView.tsx apps/web/app/[locale]/agent/page.tsx apps/web/tests/kinnso.AgentCopilotView.test.tsx apps/web/tests/agent.host.test.tsx
git commit -m "feat(web): ship real /agent Creator Copilot marketing page"
```

---

## Workstream Z — Final gate (whole-suite + build + live smoke)

### Task 13: Green the full suite, typecheck, lint, build, and smoke-test live

**Files:** none (verification only)

- [ ] **Step 1: Full test suite.**
  Run: `pnpm test`
  Expected: all pass. The full run can be flaky under memory pressure (a *timeout* in an unrelated file like `HomeView`/`StudioScanView` is environmental, not a regression — re-run that file in isolation to confirm: `pnpm exec vitest run tests/<file>`). **Assertion failures are real — fix them.**

- [ ] **Step 2: Typecheck.**
  Run: `pnpm exec tsc --noEmit`
  Expected: clean. If you see stale `.next` route-validator errors referencing deleted/old pages, run `rm -rf .next && pnpm build` to regenerate, then re-run tsc.

- [ ] **Step 3: Lint.**
  Run: `pnpm lint`
  Expected: clean. Fix unused imports left from removed mock sections (`creators`, `merchantLogos`, `CreatorCard`, `EarningsTicker`, `RouteMarkers`/`TicketDivider` where dropped).

- [ ] **Step 4: Production build.**
  Run: `pnpm build`
  Expected: exit 0; `/agent` now builds as a real page; no reference to the removed `/offers` (Phase 1) or to mock-only routes broken by this phase.

- [ ] **Step 5: Live smoke test (anon).** Start the dev server (preview tooling, `kinnso-web` launch config, port 3000), navigate to `http://localhost:3000/en`, and verify at runtime:
  - Home: NO earnings ticker (no element with aria-label "Recent creator payouts"), NO partner-logo wall; the featured rail shows real guides **or** the empty note; the "see all" link points to `/en/explore`.
  - `/en/agent`: real Copilot page (hero + 3 value cards + CTA to `/en/sign-up`), not a coming-soon stub; no console errors.
  - `/en/creators`: hero + how + CTA; no fabricated creator cards.
  - `/en/studio/scan` (anon): sample/demo report with the visible `demoBanner` label.
  - `/en/creators/apply`: 307 → `/en/sign-up`.
  Capture a screenshot of the home page + `/agent` as proof. Stop the server when done.

- [ ] **Step 6: Final commit if any fixes were needed**, then push + open PR (only when the user asks):
```bash
git push -u origin feat/phase2-demock-spine
gh pr create --base main --title "Phase 2 — de-mock creator spine + Copilot marketing" --body "<summary, verification, deferred items>"
```
PR body ends with: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

---

## Deferred (explicitly NOT in Phase 2)

- Real creator directory / `/c/[handle]` rebuild + `creators` schema/RLS → **Phase 3**.
- Real `/about` + `/contact`, real `/legal/creator-terms` content (the terms *link* added here points at the still-stub page until Phase 4), articles polish, Travelpayouts prod seed/env → **Phase 4**.
- The actual in-Studio AI agents (`/studio/copilot`), tier/contribution backbone, real numeric scan metrics pipeline → **Phase 5** (dedicated design first).
- `/g/[slug]` author-link asymmetry fix (route table notes it; not called out in the Phase 2 bullet) — fold into Phase 3/4 guide polish.

## Self-review notes (coverage map → spec bullet)

- "`/studio/scan` real DNA only; remove maywanders overlay; flag/relabel anon demo" → Tasks 6, 7.
- "drop `mergeWithSeed` so public guides are real-only" → Tasks 1, 2.
- "wire home's real featured-guides rail and remove the fake ticker + partner-logo wall" → Tasks 3, 4.
- "make `/creators` honest marketing (no fabricated creators)" → Task 5.
- "fix the apply funnel (creator framing on /sign-up, role-aware redirect, terms link, unify /creators/apply)" → Tasks 8, 9, 10.
- "ship the real `/agent` Creator Copilot marketing page" → Tasks 11, 12.
- All new keys added to 7 locales + interface; parity test run in Tasks 4, 7, 9, 11; final gate in Task 13.
