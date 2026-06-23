# Phase 1 — Honest Navigation & Reachability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every navbar/footer link reach real content (or remove it), consolidate duplicate discovery routes, and wire the orphaned-but-real merchant/ops pages into navigation — so the KINNSO v3 surface has zero dead clicks.

**Architecture:** Web-only changes in `apps/web` (Next.js 16 App Router + Supabase + 7-locale i18n). No DB migration. Edits touch the shared `Navbar`/`Footer`, a route-level redirect, three orphan view components (+ their server pages), the Studio quick-links + dashboard, the public `/offers` stub (deleted), and the i18n message files. Every UI change updates its existing vitest test first (TDD), and i18n key changes are mirrored across all 7 locale files to satisfy the locale-parity test.

**Tech Stack:** Next.js 16.2.9, React 19, TypeScript, `@supabase/ssr`, vitest 4 + @testing-library/react (jsdom), pnpm workspace (`apps/web`), ESLint 9. Commands run from `apps/web`.

---

## ⚠️ Prerequisite — Phase 0 reconciliation (do this before Task 1)

This plan is written against the **reconciled** tree (`origin/main` = `db3d8a2`, PR #36). The local checkout may be one commit behind (`a36c339`), missing the merged Creator Missions detail routes. Several Phase 1 changes depend on `apps/web/app/[locale]/studio/missions/[id]/page.tsx` existing.

Before starting, confirm + reconcile:

```bash
cd "/Users/willylai/Documents/Claude/Projects/Remix Kinnso/kinnso-v3"
git fetch origin
git rev-parse --short HEAD origin/main           # expect both at db3d8a2 after pull
git rev-list --left-right --count origin/main...HEAD   # expect "0 0" once reconciled
```

If local is behind, fast-forward `main`, then **branch** (kinnso-v3's default branch is `main`; never commit Phase 1 directly to it):

```bash
git checkout main
git pull --ff-only origin main          # lands Stage B/C missions + YouTube verification (db3d8a2)
git checkout -b feat/phase1-honest-nav
# sanity: these files must now exist
ls "apps/web/app/[locale]/studio/missions/[id]/page.tsx"
ls "apps/web/app/[locale]/merchants/missions/[missionId]/page.tsx"
```

All subsequent `git add`/`git commit` happen on `feat/phase1-honest-nav`.

---

## File map (what each task touches)

**Routing / pages**
- `apps/web/app/[locale]/feed/page.tsx` — becomes a redirect to `/explore` (Task 1)
- `apps/web/app/[locale]/offers/page.tsx` — **deleted** (orphan public stub) (Task 4)
- `apps/web/app/[locale]/merchants/missions/page.tsx` — pass `locale` to view (Task 7)
- `apps/web/app/[locale]/merchants/missions/[missionId]/page.tsx` — pass `locale` to view (Task 8)
- `apps/web/app/[locale]/ops/settlements/page.tsx` — pass `locale` to view (Task 9)

**Shared components**
- `apps/web/components/kinnso/Navbar.tsx` — drop `/feed` anchor; merchant anchor `/merchants/creators` → `/merchants/missions` (Task 2)
- `apps/web/components/kinnso/Footer.tsx` — collapse duplicate `/about` labels; relabel "Pricing"; drop non-functional social labels (Task 3)
- `apps/web/components/kinnso/StudioQuickLinks.tsx` — disable inbox tile; fix "New Guide" tile label (Task 5)
- `apps/web/components/kinnso/pages/StudioDashboardView.tsx` — opportunity deep-links to mission detail (Task 6)
- `apps/web/components/kinnso/pages/MerchantMissionsView.tsx` — card → detail link + `locale` prop (Task 7)
- `apps/web/components/kinnso/pages/MissionDetailView.tsx` — back-to-queue link + `locale` prop (Task 8)
- `apps/web/components/kinnso/pages/OpsSettlementView.tsx` — back-to-home link + `locale` prop (Task 9)

**i18n** (`apps/web/lib/i18n/messages/{en,ja,ko,th,zh-cn,zh-hk,zh-tw}.ts`)
- New keys: `nav.linkMissions` (Task 2), `missions.backToQueue` (Task 8), `ops.backHome` (Task 9)
- Relabels: `footer.lPricing` (Task 3), `studioHome.guidesTitle` + `studioHome.guidesDesc` (Task 5)
- `en.ts` additionally holds the `Messages` interface (type block ≈ lines 285–443) **and** the en values (value block ≈ line 752+) — new keys go in **both**.

**Tests** (`apps/web/tests/`)
- `feed.host.test.tsx`, `kinnso.Navbar.test.tsx`, `kinnso.Footer.test.tsx`, `kinnso.StudioQuickLinks.test.tsx`, `kinnso.StudioDashboardView.test.tsx`, `kinnso.MerchantMissionsView.test.tsx`, `kinnso.MissionDetailView.test.tsx`, `kinnso.OpsSettlementView.test.tsx`, `i18n.locale-parity.test.ts`

**Edits are string-anchored, not line-numbered** — `en.ts` and the locale files were modified by the Phase 0 pull, so absolute line numbers may have shifted. Always match on the verbatim snippets given.

### Out of scope for Phase 1 (do NOT touch — later phases)
- The **Apply funnel** (creator framing on `/sign-up`, role-aware post-login redirect, terms-checkbox link, unifying `/creators/apply`) → **Phase 2**. `Apply → /sign-up` already reaches a real page, so it is not a dead click; leave the CTA wiring as-is.
- `MerchantsLandingView` mock sample missions + the secondary "browse creators" CTA (`/merchants/creators`) → **Phase 4** (merchant polish) / **Phase 3** (real directory). Its primary CTAs already point to the real pipeline (`/merchants/post`), so reachability is satisfied. `/merchants/creators` stays as a route (cut from nav only).
- Home ticker/partner-wall/guides-rail de-mock, `/studio/scan` metrics, `/creators` de-mock → **Phase 2**.
- `FeedView` component + its test + the `feed` i18n group are **intentionally retained** (the redirect keeps the route working); removing the now-unused component is optional Phase 2 cleanup.
- Internal links that still point to `/feed` (`g/[slug]/page.tsx`, `HomeView.tsx`, `CreatorProfileView.tsx`) are handled by the Task 1 redirect; repointing them is deferred (those files are de-mocked in Phase 2/3).

---

## Task 1: Consolidate `/feed` → `/explore` (redirect)

`/feed` and `/explore` render the same `getPublishedGuides()` data through near-identical views. Make `/explore` canonical and 307-redirect `/feed` to it.

**Files:**
- Modify: `apps/web/app/[locale]/feed/page.tsx`
- Test: `apps/web/tests/feed.host.test.tsx`

- [ ] **Step 1: Rewrite the host test to expect the redirect**

Replace the entire contents of `apps/web/tests/feed.host.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const { redirectMock, notFoundMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
}))

import FeedPage from '@/app/[locale]/feed/page'

afterEach(() => {
  redirectMock.mockClear()
  notFoundMock.mockClear()
})

describe('/[locale]/feed host', () => {
  it('redirects to the canonical /explore route, locale-prefixed', async () => {
    await expect(
      FeedPage({ params: Promise.resolve({ locale: 'en' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/en/explore')
    expect(redirectMock).toHaveBeenCalledWith('/en/explore')
  })

  it('404s an unknown locale', async () => {
    await expect(
      FeedPage({ params: Promise.resolve({ locale: 'zz' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd apps/web && pnpm exec vitest run tests/feed.host.test.tsx`
Expected: FAIL — the current `FeedPage` renders `FeedView` (no redirect), so `redirectMock` is never called.

- [ ] **Step 3: Rewrite the page as a redirect**

Replace the entire contents of `apps/web/app/[locale]/feed/page.tsx` with:

```tsx
import { notFound, redirect } from 'next/navigation'
import { isLocale, LOCALES } from '@/lib/i18n/config'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function FeedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  // /feed and /explore render the same published-guides data; /explore is canonical.
  redirect(`/${locale}/explore`)
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `cd apps/web && pnpm exec vitest run tests/feed.host.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/[locale]/feed/page.tsx" apps/web/tests/feed.host.test.tsx
git commit -m "feat(web): redirect /feed to canonical /explore"
```

---

## Task 2: Navbar — drop `/feed`, swap merchant `/merchants/creators` → `/merchants/missions`

Remove the `/feed` ("Travelers") anchor (now a redirect) and replace the merchant-only "Find Creators" anchor (mock, cut from nav) with a "Missions" anchor pointing at the merchant's real mission queue. This needs a new i18n key `nav.linkMissions`.

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface + en value), and `ja.ts`, `ko.ts`, `th.ts`, `zh-cn.ts`, `zh-hk.ts`, `zh-tw.ts` (values)
- Modify: `apps/web/components/kinnso/Navbar.tsx`
- Test: `apps/web/tests/kinnso.Navbar.test.tsx`, `apps/web/tests/i18n.locale-parity.test.ts`

- [ ] **Step 1: Add `nav.linkMissions` to the `Messages` interface (en.ts type block)**

In `apps/web/lib/i18n/messages/en.ts`, find the nav **interface** line (note `: string`, no quotes):

```ts
    linkGuides: string; linkArticles: string; linkFindCreators: string
```

Replace with:

```ts
    linkGuides: string; linkArticles: string; linkFindCreators: string; linkMissions: string
```

- [ ] **Step 2: Add `nav.linkMissions` to every locale's nav value**

In each of the 7 message files, find the nav **value** line (note the quoted strings):

```ts
    linkGuides: 'Guides', linkArticles: 'Articles', linkFindCreators: 'Find Creators',
```

(The labels differ per locale; match on `linkFindCreators: '…'` within the `nav:` value object.) Append `linkMissions` immediately after `linkFindCreators` using this per-locale value:

| file | add |
|---|---|
| `en.ts` | `linkMissions: 'Missions',` |
| `ja.ts` | `linkMissions: 'ミッション',` |
| `ko.ts` | `linkMissions: '미션',` |
| `th.ts` | `linkMissions: 'ภารกิจ',` |
| `zh-cn.ts` | `linkMissions: '任务',` |
| `zh-hk.ts` | `linkMissions: '任務',` |
| `zh-tw.ts` | `linkMissions: '任務',` |

Example for `en.ts` value block — the line becomes:

```ts
    linkGuides: 'Guides', linkArticles: 'Articles', linkFindCreators: 'Find Creators', linkMissions: 'Missions',
```

- [ ] **Step 3: Update the Navbar test to express the new behavior**

In `apps/web/tests/kinnso.Navbar.test.tsx`, replace the test block:

```tsx
  it('creator shows Open Studio → /en/studio; merchant shows Find Creators + Post a Mission', () => {
    render(<Navbar locale="en" role="creator" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.ctaOpenStudio }).getAttribute('href')).toBe('/en/studio')
    cleanup()
    render(<Navbar locale="en" role="merchant" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.linkFindCreators }).getAttribute('href')).toBe('/en/merchants/creators')
    expect(screen.getByRole('link', { name: en.nav.ctaPostMission }).getAttribute('href')).toBe('/en/merchants/post')
  })
```

with:

```tsx
  it('creator shows Open Studio → /en/studio; merchant shows Missions queue + Post a Mission', () => {
    render(<Navbar locale="en" role="creator" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.ctaOpenStudio }).getAttribute('href')).toBe('/en/studio')
    cleanup()
    render(<Navbar locale="en" role="merchant" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.linkMissions }).getAttribute('href')).toBe('/en/merchants/missions')
    expect(screen.getByRole('link', { name: en.nav.ctaPostMission }).getAttribute('href')).toBe('/en/merchants/post')
    // mock "Find Creators" landing is no longer in nav
    expect(screen.queryByRole('link', { name: en.nav.linkFindCreators })).toBeNull()
  })

  it('does not render a Travelers/feed anchor (consolidated into /explore)', () => {
    render(<Navbar locale="en" role="anon" t={en.nav} />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).not.toContain('/en/feed')
    expect(hrefs).toContain('/en/explore')
  })
```

- [ ] **Step 4: Run the test — verify it fails**

Run: `cd apps/web && pnpm exec vitest run tests/kinnso.Navbar.test.tsx`
Expected: FAIL — Navbar still renders the `/feed` anchor and the `/merchants/creators` "Find Creators" link.

- [ ] **Step 5: Update Navbar.tsx anchors**

In `apps/web/components/kinnso/Navbar.tsx`, replace:

```tsx
  const baseAnchors = [
    { to: "/creators",  label: t.linkCreators },
    { to: "/merchants", label: t.linkMerchants },
    { to: "/agent",     label: t.linkAgent },
    { to: "/feed",      label: t.linkTravelers },
    { to: "/explore",   label: t.linkGuides },
    { to: "/articles",  label: t.linkArticles },
  ];
  const anchors = role === "merchant"
    ? [...baseAnchors, { to: "/merchants/creators", label: t.linkFindCreators }]
    : baseAnchors;
```

with:

```tsx
  const baseAnchors = [
    { to: "/creators",  label: t.linkCreators },
    { to: "/merchants", label: t.linkMerchants },
    { to: "/agent",     label: t.linkAgent },
    { to: "/explore",   label: t.linkGuides },
    { to: "/articles",  label: t.linkArticles },
  ];
  // Merchants get a direct link to their real mission queue (was the mock "Find Creators" landing).
  const anchors = role === "merchant"
    ? [...baseAnchors, { to: "/merchants/missions", label: t.linkMissions }]
    : baseAnchors;
```

- [ ] **Step 6: Run the tests — verify they pass**

Run: `cd apps/web && pnpm exec vitest run tests/kinnso.Navbar.test.tsx tests/i18n.locale-parity.test.ts`
Expected: PASS (Navbar tests + all 7 locale-parity assertions — confirms `linkMissions` exists in every locale).

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/kinnso/Navbar.tsx apps/web/tests/kinnso.Navbar.test.tsx apps/web/lib/i18n/messages/*.ts
git commit -m "feat(web): drop /feed nav anchor; point merchant nav at real mission queue"
```

---

## Task 3: Footer — collapse duplicate `/about` labels, relabel "Pricing", drop non-functional social labels

The footer currently routes four distinct labels (About / Case studies / Press / Contact) at the same `/about` stub, labels the `/merchants` landing "Pricing" (no pricing page exists), and renders four social brand names as non-clickable `<span>`s. Collapse to honest links.

**Files:**
- Modify: `apps/web/lib/i18n/messages/{en,ja,ko,th,zh-cn,zh-hk,zh-tw}.ts` (relabel `footer.lPricing` value only — no key changes)
- Modify: `apps/web/components/kinnso/Footer.tsx`
- Test: `apps/web/tests/kinnso.Footer.test.tsx`

- [ ] **Step 1: Relabel `footer.lPricing` value in every locale**

`footer.lPricing` mislabels the `/merchants` landing as "Pricing". Repoint the label (route stays `/merchants`) to "How it works". In each file, within the `footer:` value object, change the value of `lPricing` (find `lPricing: '…'`) to:

| file | new value |
|---|---|
| `en.ts` | `lPricing: 'How it works',` |
| `ja.ts` | `lPricing: '仕組み',` |
| `ko.ts` | `lPricing: '이용 방법',` |
| `th.ts` | `lPricing: 'วิธีการทำงาน',` |
| `zh-cn.ts` | `lPricing: '运作方式',` |
| `zh-hk.ts` | `lPricing: '運作方式',` |
| `zh-tw.ts` | `lPricing: '運作方式',` |

(Key name `lPricing` is left unchanged to avoid touching the interface + parity; only the displayed value changes. en.ts current value is `lPricing: 'Pricing',`; zh-hk is `lPricing: '定價',`; th is `lPricing: 'ราคา',`.)

- [ ] **Step 2: Update the Footer test**

The existing test asserts social brand names render as non-link **text**. Phase 1 removes those non-functional labels entirely. Replace the whole `describe('Footer', …)` body in `apps/web/tests/kinnso.Footer.test.tsx` with:

```tsx
describe('Footer', () => {
  it('renders translated column titles and locale-prefixed links', () => {
    render(<Footer locale="ja" t={en.footer} />)
    expect(screen.getByText(en.footer.colCreators)).toBeTruthy()
    expect(screen.getByRole('link', { name: en.footer.lStudio }).getAttribute('href')).toBe('/ja/studio')
    expect(screen.getByRole('link', { name: en.footer.lAbout }).getAttribute('href')).toBe('/ja/about')
  })

  it('routes "How it works" to the merchant landing, not a pricing page', () => {
    render(<Footer locale="en" t={en.footer} />)
    expect(screen.getByRole('link', { name: en.footer.lPricing }).getAttribute('href')).toBe('/en/merchants')
  })

  it('does not render duplicate dead links to /about', () => {
    render(<Footer locale="en" t={en.footer} />)
    // About is the single honest link; the old Case studies / Press / Contact duplicates are gone.
    const aboutLinks = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/en/about')
    expect(aboutLinks).toHaveLength(1)
    expect(screen.queryByText(en.footer.lCaseStudies)).toBeNull()
    expect(screen.queryByText(en.footer.lPress)).toBeNull()
    expect(screen.queryByText(en.footer.lContact)).toBeNull()
  })

  it('does not render non-functional social labels', () => {
    render(<Footer locale="en" t={en.footer} />)
    expect(screen.queryByText('Instagram')).toBeNull()
    expect(screen.queryByText('WhatsApp')).toBeNull()
  })
})
```

- [ ] **Step 3: Run the test — verify it fails**

Run: `cd apps/web && pnpm exec vitest run tests/kinnso.Footer.test.tsx`
Expected: FAIL — Case studies / Press / Contact and the social `<span>`s still render.

- [ ] **Step 4: Update Footer.tsx — collapse columns and drop social labels**

In `apps/web/components/kinnso/Footer.tsx`, replace the `cols` definition:

```tsx
  const cols = [
    { title: t.colCreators, links: [[t.lApply, "/sign-up"], [t.lStudio, "/studio"], [t.lMissions, "/studio/missions"], [t.lEarnings, "/studio/earnings"]] as const },
    { title: t.colMerchants, links: [[t.lPostMission, "/merchants/post"], [t.lPricing, "/merchants"], [t.lCaseStudies, "/about"], [t.lContact, "/about"]] as const },
    { title: t.colCompany, links: [[t.lAbout, "/about"], [t.lAgent, "/agent"], [t.lPress, "/about"], [t.lLegal, "/legal/creator-terms"]] as const },
  ];
```

with (drop the duplicate `/about` labels — `lCaseStudies`, `lContact`, `lPress`; keep one honest `About`; `lPricing` now reads "How it works"):

```tsx
  const cols = [
    { title: t.colCreators, links: [[t.lApply, "/sign-up"], [t.lStudio, "/studio"], [t.lMissions, "/studio/missions"], [t.lEarnings, "/studio/earnings"]] as const },
    { title: t.colMerchants, links: [[t.lPostMission, "/merchants/post"], [t.lPricing, "/merchants"]] as const },
    { title: t.colCompany, links: [[t.lAbout, "/about"], [t.lAgent, "/agent"], [t.lLegal, "/legal/creator-terms"]] as const },
  ];
```

Then replace the bottom-bar social block:

```tsx
        <div className="k-container flex flex-col items-center justify-between gap-2 py-4 text-xs text-kinnso-muted sm:flex-row">
          <span>{t.rights}</span>
          <span className="flex items-center gap-3">
            {["Instagram", "Threads", "LINE", "WhatsApp"].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </span>
        </div>
```

with (remove the non-functional social labels; real social links can be added in Phase 4 alongside the About/Contact page when URLs are confirmed):

```tsx
        <div className="k-container flex items-center justify-center py-4 text-xs text-kinnso-muted sm:justify-start">
          <span>{t.rights}</span>
        </div>
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `cd apps/web && pnpm exec vitest run tests/kinnso.Footer.test.tsx tests/i18n.locale-parity.test.ts`
Expected: PASS (Footer tests + parity unaffected — only values changed, `lCaseStudies`/`lContact`/`lPress` keys remain defined in all locales).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/Footer.tsx apps/web/tests/kinnso.Footer.test.tsx apps/web/lib/i18n/messages/*.ts
git commit -m "feat(web): collapse duplicate footer /about links, relabel Pricing, drop dead social labels"
```

---

## Task 4: Cut the orphan public `/offers` stub

`/offers` (public) is a Coming-Soon stub with no inbound links and collides conceptually with the real `/studio/offers`. Remove the route.

**Files:**
- Delete: `apps/web/app/[locale]/offers/page.tsx` (and the now-empty `offers/` directory)

- [ ] **Step 1: Confirm there are no inbound links or tests**

Run: `cd apps/web && grep -rn "\"/offers\"\|'/offers'\|\`/offers\`\|(\"/offers\|p(\"/offers" app components ; grep -rln "offers/page" tests`
Expected: no matches in `app`/`components` (the navbar/footer don't link it), and no test imports `app/[locale]/offers/page`. (The `studioHome.offersTitle` key it reuses stays — it's still used by the real `/studio/offers` tile.)

- [ ] **Step 2: Delete the route**

```bash
git rm "apps/web/app/[locale]/offers/page.tsx"
rmdir "apps/web/app/[locale]/offers" 2>/dev/null || true
```

- [ ] **Step 3: Verify the app still builds**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS (no dangling imports — nothing referenced the deleted page).

- [ ] **Step 4: Commit**

```bash
git add -A "apps/web/app/[locale]"
git commit -m "feat(web): remove orphan public /offers coming-soon stub"
```

---

## Task 5: Studio quick-links — disable the inbox tile, fix the "New Guide" tile label

The Studio launcher grid links the Inbox tile to `/studio/inbox` (a backlog Coming-Soon stub) and labels the guides tile "New Guide" while routing to the guides **list**. Make Inbox non-interactive (keeps the "Soon" badge, no click-through) and relabel the guides tile "Guides" so the label matches its list destination (the list page already has its own "New guide" button).

**Files:**
- Modify: `apps/web/lib/i18n/messages/{en,ja,ko,th,zh-cn,zh-hk,zh-tw}.ts` (relabel `studioHome.guidesTitle` + `studioHome.guidesDesc` values)
- Modify: `apps/web/components/kinnso/StudioQuickLinks.tsx`
- Test: `apps/web/tests/kinnso.StudioQuickLinks.test.tsx`

- [ ] **Step 1: Relabel the guides tile in every locale**

In each file, within the `studioHome:` value object, change `guidesTitle` and `guidesDesc` (find `guidesTitle: '…'` / `guidesDesc: '…'`):

| file | guidesTitle | guidesDesc |
|---|---|---|
| `en.ts` | `'Guides'` | `'Draft and publish your guides.'` |
| `ja.ts` | `'ガイド'` | `'ガイドを作成して公開。'` |
| `ko.ts` | `'가이드'` | `'가이드를 작성하고 게시하세요.'` |
| `th.ts` | `'ไกด์'` | `'ร่างและเผยแพร่ไกด์ของคุณ'` |
| `zh-cn.ts` | `'攻略'` | `'撰写并发布你的攻略。'` |
| `zh-hk.ts` | `'攻略'` | `'撰寫並發佈你的攻略。'` |
| `zh-tw.ts` | `'攻略'` | `'撰寫並發佈你的攻略。'` |

(en.ts current: `guidesTitle: 'New Guide', guidesDesc: 'Publish a travel guide.'`; zh-hk current: `guidesTitle: '新攻略', guidesDesc: '發佈一篇旅遊攻略。'`; th current: `guidesTitle: 'คู่มือใหม่', guidesDesc: 'เผยแพร่คู่มือการท่องเที่ยว'`.)

- [ ] **Step 2: Update the StudioQuickLinks test**

In `apps/web/tests/kinnso.StudioQuickLinks.test.tsx`, replace the first test (the second test — "marks live tools Live and the inbox Soon" — stays unchanged and still passes, since the disabled inbox card keeps its "Soon" badge):

```tsx
  it('renders the six tools with locale-prefixed hrefs', () => {
    render(<StudioQuickLinks locale="en" t={en.studioHome} />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/en/studio/scan')
    expect(hrefs).toContain('/en/studio/missions')
    expect(hrefs).toContain('/en/studio/earnings')
    expect(hrefs).toContain('/en/studio/offers')
    expect(hrefs).toContain('/en/studio/inbox')
    expect(hrefs).toContain('/en/studio/guides')
  })
```

with:

```tsx
  it('renders the five live tools as locale-prefixed links and disables the inbox tile', () => {
    render(<StudioQuickLinks locale="en" t={en.studioHome} />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/en/studio/scan')
    expect(hrefs).toContain('/en/studio/missions')
    expect(hrefs).toContain('/en/studio/earnings')
    expect(hrefs).toContain('/en/studio/offers')
    expect(hrefs).toContain('/en/studio/guides')
    // Inbox is backlog — shown but not clickable (no link to the stub).
    expect(hrefs).not.toContain('/en/studio/inbox')
    expect(screen.getByText(en.studioHome.inboxTitle)).toBeTruthy()
  })
```

- [ ] **Step 3: Run the test — verify it fails**

Run: `cd apps/web && pnpm exec vitest run tests/kinnso.StudioQuickLinks.test.tsx`
Expected: FAIL — the inbox tile is still a link to `/en/studio/inbox`.

- [ ] **Step 4: Update StudioQuickLinks.tsx — render the inbox tile as non-interactive**

In `apps/web/components/kinnso/StudioQuickLinks.tsx`, replace the render body:

```tsx
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <TicketCard key={tool.href} as={Link} href={p(tool.href)} className="group p-5 transition hover:border-kinnso-orange">
          <div className="flex items-center justify-between">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orange">{tool.icon}</span>
            <RouteStamp className={tool.live ? 'bg-kinnso-orange/10 text-kinnso-orange' : 'bg-kinnso-cream2 text-kinnso-muted'}>
              {tool.live ? t.liveBadge : t.soonBadge}
            </RouteStamp>
          </div>
          <h3 className="mt-3 text-lg font-bold text-kinnso-ink">{tool.title}</h3>
          <p className="mt-1 text-sm text-kinnso-muted">{tool.desc}</p>
          <span className="mt-3 inline-flex items-center text-sm font-bold text-kinnso-orange">
            {t.open} <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </TicketCard>
      ))}
    </div>
  )
```

with (live tools stay links with the "Open →" affordance; non-live tools render as a plain `<div>` card — `TicketCard` defaults to `as="div"` — with no link, no hover, and no "Open" CTA):

```tsx
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => {
        const header = (
          <>
            <div className="flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orange">{tool.icon}</span>
              <RouteStamp className={tool.live ? 'bg-kinnso-orange/10 text-kinnso-orange' : 'bg-kinnso-cream2 text-kinnso-muted'}>
                {tool.live ? t.liveBadge : t.soonBadge}
              </RouteStamp>
            </div>
            <h3 className="mt-3 text-lg font-bold text-kinnso-ink">{tool.title}</h3>
            <p className="mt-1 text-sm text-kinnso-muted">{tool.desc}</p>
          </>
        )
        if (!tool.live) {
          // Backlog tool: visible but not clickable — no dead link to a Coming-Soon stub.
          return (
            <TicketCard key={tool.href} className="p-5 opacity-70">
              {header}
            </TicketCard>
          )
        }
        return (
          <TicketCard key={tool.href} as={Link} href={p(tool.href)} className="group p-5 transition hover:border-kinnso-orange">
            {header}
            <span className="mt-3 inline-flex items-center text-sm font-bold text-kinnso-orange">
              {t.open} <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </TicketCard>
        )
      })}
    </div>
  )
```

- [ ] **Step 5: Run the tests — verify they pass**

Run: `cd apps/web && pnpm exec vitest run tests/kinnso.StudioQuickLinks.test.tsx tests/i18n.locale-parity.test.ts`
Expected: PASS (both StudioQuickLinks tests — including the unchanged "Soon" badge count of 1 — and parity).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/StudioQuickLinks.tsx apps/web/tests/kinnso.StudioQuickLinks.test.tsx apps/web/lib/i18n/messages/*.ts
git commit -m "feat(web): disable Studio inbox tile; relabel guides launcher to match its destination"
```

---

## Task 6: Studio dashboard — deep-link mission opportunities to the mission detail page

The dashboard "Opportunities" list links every mission to the missions **list** (`/studio/missions`) instead of the specific mission. With Stage B/C landed (Phase 0), `/studio/missions/[id]` exists — link missions to their detail page. Offers have no per-item detail page, so they keep linking to `/studio/offers`.

**Files:**
- Modify: `apps/web/components/kinnso/pages/StudioDashboardView.tsx`
- Test: `apps/web/tests/kinnso.StudioDashboardView.test.tsx`

- [ ] **Step 1: Update the dashboard test to assert the deep-link**

In `apps/web/tests/kinnso.StudioDashboardView.test.tsx`, replace the second test:

```tsx
  it('renders opportunity previews and earnings totals when present', () => {
    render(
      <StudioDashboardView
        {...baseProps}
        opportunities={[{ id: 'm1', title: 'Stay at Hotel X', kind: 'mission' }]}
        earnings={[{ currency: 'HKD', paid: 1200, pending: 300 }]}
      />,
    )
    expect(screen.getByText('Stay at Hotel X')).toBeTruthy()
    expect(screen.getByText(/HKD/)).toBeTruthy()
    expect(screen.queryByText(en.studioDashboard.opportunitiesEmpty)).toBeNull()
  })
```

with:

```tsx
  it('renders opportunity previews and earnings totals when present', () => {
    render(
      <StudioDashboardView
        {...baseProps}
        opportunities={[{ id: 'm1', title: 'Stay at Hotel X', kind: 'mission' }]}
        earnings={[{ currency: 'HKD', paid: 1200, pending: 300 }]}
      />,
    )
    expect(screen.getByText('Stay at Hotel X')).toBeTruthy()
    expect(screen.getByText(/HKD/)).toBeTruthy()
    expect(screen.queryByText(en.studioDashboard.opportunitiesEmpty)).toBeNull()
  })

  it('deep-links a mission opportunity to its detail page and an offer to /studio/offers', () => {
    render(
      <StudioDashboardView
        {...baseProps}
        opportunities={[
          { id: 'm1', title: 'Stay at Hotel X', kind: 'mission' },
          { id: 'o9', title: 'Klook affiliate', kind: 'offer' },
        ]}
        earnings={[]}
      />,
    )
    expect(screen.getByRole('link', { name: 'Stay at Hotel X' }).getAttribute('href')).toBe('/en/studio/missions/m1')
    expect(screen.getByRole('link', { name: 'Klook affiliate' }).getAttribute('href')).toBe('/en/studio/offers')
  })
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd apps/web && pnpm exec vitest run tests/kinnso.StudioDashboardView.test.tsx`
Expected: FAIL — the mission opportunity currently links to `/en/studio/missions`, not `/en/studio/missions/m1`.

- [ ] **Step 3: Update the opportunity link in StudioDashboardView.tsx**

In `apps/web/components/kinnso/pages/StudioDashboardView.tsx`, replace:

```tsx
                  <Link href={p(o.kind === 'offer' ? '/studio/offers' : '/studio/missions')} className="text-sm font-semibold text-kinnso-ink hover:text-kinnso-orange">
                    {o.title}
                  </Link>
```

with:

```tsx
                  <Link href={p(o.kind === 'offer' ? '/studio/offers' : `/studio/missions/${o.id}`)} className="text-sm font-semibold text-kinnso-ink hover:text-kinnso-orange">
                    {o.title}
                  </Link>
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `cd apps/web && pnpm exec vitest run tests/kinnso.StudioDashboardView.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/kinnso/pages/StudioDashboardView.tsx apps/web/tests/kinnso.StudioDashboardView.test.tsx
git commit -m "feat(web): deep-link Studio mission opportunities to their detail page"
```

---

## Task 7: Wire the merchant mission queue → mission detail

`MerchantMissionsView` lists missions as non-clickable `<article>`s, while the real review page lives at `/merchants/missions/[missionId]`. Make each row a link. This needs a `locale` prop (the view currently receives none).

**Files:**
- Modify: `apps/web/components/kinnso/pages/MerchantMissionsView.tsx`
- Modify: `apps/web/app/[locale]/merchants/missions/page.tsx`
- Test: `apps/web/tests/kinnso.MerchantMissionsView.test.tsx`

- [ ] **Step 1: Update the view test — pass `locale`, assert the row link**

Replace the test body in `apps/web/tests/kinnso.MerchantMissionsView.test.tsx`:

```tsx
  it('shows mission status and participant counts', () => {
    render(<MerchantMissionsView t={en.missions} missions={[{
      id: 'm1',
      title: 'Paid reel campaign',
      status: 'published',
      participantCount: 2,
      pendingCount: 1,
      settlementStatus: 'pending',
    }]} />)
    expect(screen.getByText('Paid reel campaign')).toBeTruthy()
    expect(screen.getByText(/2/)).toBeTruthy()
    expect(screen.getByText(/pending/i)).toBeTruthy()
  })
```

with:

```tsx
  it('shows mission status and counts, and links each row to its detail page', () => {
    render(<MerchantMissionsView locale="en" t={en.missions} missions={[{
      id: 'm1',
      title: 'Paid reel campaign',
      status: 'published',
      participantCount: 2,
      pendingCount: 1,
      settlementStatus: 'pending',
    }]} />)
    expect(screen.getByText('Paid reel campaign')).toBeTruthy()
    expect(screen.getByText(/2/)).toBeTruthy()
    expect(screen.getByText(/pending/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Paid reel campaign/ }).getAttribute('href')).toBe('/en/merchants/missions/m1')
  })
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd apps/web && pnpm exec vitest run tests/kinnso.MerchantMissionsView.test.tsx`
Expected: FAIL — the view has no `locale` prop and renders no link (TypeScript/`getByRole('link')` both fail).

- [ ] **Step 3: Add `locale` + row link to MerchantMissionsView.tsx**

In `apps/web/components/kinnso/pages/MerchantMissionsView.tsx`, replace the imports + props type:

```tsx
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import type { Messages } from '@/lib/i18n/messages/en'

export type MerchantMissionRow = {
  id: string
  title: string
  status: string
  participantCount: number
  pendingCount: number
  settlementStatus: string | null
}

type MerchantMissionsViewProps = {
  t: Messages['missions']
  missions: MerchantMissionRow[]
}

export function MerchantMissionsView({ t, missions }: MerchantMissionsViewProps) {
```

with:

```tsx
import Link from 'next/link'
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export type MerchantMissionRow = {
  id: string
  title: string
  status: string
  participantCount: number
  pendingCount: number
  settlementStatus: string | null
}

type MerchantMissionsViewProps = {
  locale: Locale
  t: Messages['missions']
  missions: MerchantMissionRow[]
}

export function MerchantMissionsView({ locale, t, missions }: MerchantMissionsViewProps) {
```

Then replace the mission `<article>`:

```tsx
        {missions.map((mission) => (
          <article key={mission.id} className="grid grid-cols-1 gap-3 border-b border-kinnso-cream2 px-4 py-4 last:border-b-0 sm:grid-cols-[1fr_120px] sm:items-center">
            <div>
              <h2 className="font-bold text-kinnso-ink">{mission.title}</h2>
              <p className="mt-1 text-sm text-kinnso-muted">
                {t.participants}: {mission.participantCount} / {t.pendingApplications}: {mission.pendingCount} / {t.settlement}: {mission.settlementStatus ?? '-'}
              </p>
            </div>
            <MissionStatusBadge status={mission.status} />
          </article>
        ))}
```

with:

```tsx
        {missions.map((mission) => (
          <Link
            key={mission.id}
            href={`/${locale}/merchants/missions/${mission.id}`}
            className="grid grid-cols-1 gap-3 border-b border-kinnso-cream2 px-4 py-4 transition last:border-b-0 hover:bg-kinnso-cream2 sm:grid-cols-[1fr_120px] sm:items-center"
          >
            <div>
              <h2 className="font-bold text-kinnso-ink">{mission.title}</h2>
              <p className="mt-1 text-sm text-kinnso-muted">
                {t.participants}: {mission.participantCount} / {t.pendingApplications}: {mission.pendingCount} / {t.settlement}: {mission.settlementStatus ?? '-'}
              </p>
            </div>
            <MissionStatusBadge status={mission.status} />
          </Link>
        ))}
```

- [ ] **Step 4: Pass `locale` from the page**

In `apps/web/app/[locale]/merchants/missions/page.tsx`, update **both** render sites (empty + populated) to pass `locale`:

Replace:

```tsx
  if (!merchantProfile) return <MerchantMissionsView t={messages.missions} missions={[]} />
```

with:

```tsx
  if (!merchantProfile) return <MerchantMissionsView locale={loc} t={messages.missions} missions={[]} />
```

and replace:

```tsx
  return <MerchantMissionsView t={messages.missions} missions={missions} />
```

with:

```tsx
  return <MerchantMissionsView locale={loc} t={messages.missions} missions={missions} />
```

- [ ] **Step 5: Run the tests — verify they pass**

Run: `cd apps/web && pnpm exec vitest run tests/kinnso.MerchantMissionsView.test.tsx tests/studio.missions.host.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/kinnso/pages/MerchantMissionsView.tsx "apps/web/app/[locale]/merchants/missions/page.tsx" apps/web/tests/kinnso.MerchantMissionsView.test.tsx
git commit -m "feat(web): link merchant mission queue rows to their detail/review page"
```

---

## Task 8: Mission detail — add a "back to queue" link

The merchant `MissionDetailView` (the review screen at `/merchants/missions/[missionId]`) has no way back to the queue. Add a back link. This needs a new i18n key `missions.backToQueue` and a `locale` prop.

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface + en value), `ja.ts`, `ko.ts`, `th.ts`, `zh-cn.ts`, `zh-hk.ts`, `zh-tw.ts` (values)
- Modify: `apps/web/components/kinnso/pages/MissionDetailView.tsx`
- Modify: `apps/web/app/[locale]/merchants/missions/[missionId]/page.tsx`
- Test: `apps/web/tests/kinnso.MissionDetailView.test.tsx`

- [ ] **Step 1: Add `missions.backToQueue` to the interface (en.ts type block)**

In `apps/web/lib/i18n/messages/en.ts`, find the missions **interface** opening and its `missionQueue: string` line:

```ts
  missions: {
    missionQueue: string
```

Replace with:

```ts
  missions: {
    missionQueue: string
    backToQueue: string
```

- [ ] **Step 2: Add `missions.backToQueue` value to every locale**

In each file, within the `missions:` **value** object, add `backToQueue` immediately after `missionQueue: '…',`:

| file | add |
|---|---|
| `en.ts` | `backToQueue: 'Back to queue',` |
| `ja.ts` | `backToQueue: 'キューに戻る',` |
| `ko.ts` | `backToQueue: '대기열로 돌아가기',` |
| `th.ts` | `backToQueue: 'กลับไปที่คิว',` |
| `zh-cn.ts` | `backToQueue: '返回任务列表',` |
| `zh-hk.ts` | `backToQueue: '返回任務列表',` |
| `zh-tw.ts` | `backToQueue: '返回任務列表',` |

Example for `en.ts` value block:

```ts
  missions: {
    missionQueue: 'Mission queue',
    backToQueue: 'Back to queue',
```

- [ ] **Step 3: Update the MissionDetailView test**

In `apps/web/tests/kinnso.MissionDetailView.test.tsx`, add `locale="en"` to the three `render(<MissionDetailView … />)` calls (each currently starts `render(<MissionDetailView t={en.missions} mission={mission} …`). Change each to `render(<MissionDetailView locale="en" t={en.missions} mission={mission} …`. Then add a new test inside the `describe` block:

```tsx
  it('links back to the mission queue', () => {
    render(<MissionDetailView locale="en" t={en.missions} mission={mission} onReviewParticipant={vi.fn()} onReviewSubmission={vi.fn()} />)
    expect(screen.getByRole('link', { name: en.missions.backToQueue }).getAttribute('href')).toBe('/en/merchants/missions')
  })
```

- [ ] **Step 4: Run the test — verify it fails**

Run: `cd apps/web && pnpm exec vitest run tests/kinnso.MissionDetailView.test.tsx`
Expected: FAIL — no `locale` prop and no back link.

- [ ] **Step 5: Add `locale` + back link to MissionDetailView.tsx**

In `apps/web/components/kinnso/pages/MissionDetailView.tsx`, add the `Link` + `Locale` imports near the top (after the existing `useRouter` import line):

```tsx
import { useRouter } from 'next/navigation'
```

becomes:

```tsx
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Locale } from '@/lib/i18n/config'
```

Replace the props type:

```tsx
type MissionDetailViewProps = {
  t: Messages['missions']
  mission: MissionDetail
  onReviewParticipant: (participantId: string, action: ReviewParticipantAction) => KinnsoActionResult | Promise<KinnsoActionResult>
  onReviewSubmission: (submissionId: string, action: ReviewSubmissionAction) => KinnsoActionResult | Promise<KinnsoActionResult>
}

export function MissionDetailView({
  t,
  mission,
  onReviewParticipant,
  onReviewSubmission,
}: MissionDetailViewProps) {
```

with:

```tsx
type MissionDetailViewProps = {
  locale: Locale
  t: Messages['missions']
  mission: MissionDetail
  onReviewParticipant: (participantId: string, action: ReviewParticipantAction) => KinnsoActionResult | Promise<KinnsoActionResult>
  onReviewSubmission: (submissionId: string, action: ReviewSubmissionAction) => KinnsoActionResult | Promise<KinnsoActionResult>
}

export function MissionDetailView({
  locale,
  t,
  mission,
  onReviewParticipant,
  onReviewSubmission,
}: MissionDetailViewProps) {
```

Then add the back link directly under the `<main …>` open tag, before the `<h1>`:

```tsx
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{mission.title}</h1>
```

becomes:

```tsx
    <main className="k-container py-10">
      <Link href={`/${locale}/merchants/missions`} className="text-sm font-semibold text-kinnso-orange hover:underline">
        ← {t.backToQueue}
      </Link>
      <h1 className="mt-3 text-3xl font-black text-kinnso-ink">{mission.title}</h1>
```

- [ ] **Step 6: Pass `locale` from the page**

In `apps/web/app/[locale]/merchants/missions/[missionId]/page.tsx`, replace:

```tsx
    <MissionDetailView
      t={messages.missions}
      mission={mapMissionDetail(row)}
      onReviewParticipant={reviewParticipant}
      onReviewSubmission={reviewSubmission}
    />
```

with:

```tsx
    <MissionDetailView
      locale={loc}
      t={messages.missions}
      mission={mapMissionDetail(row)}
      onReviewParticipant={reviewParticipant}
      onReviewSubmission={reviewSubmission}
    />
```

- [ ] **Step 7: Run the tests — verify they pass**

Run: `cd apps/web && pnpm exec vitest run tests/kinnso.MissionDetailView.test.tsx tests/merchant.mission-detail.host.test.tsx tests/i18n.locale-parity.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/kinnso/pages/MissionDetailView.tsx "apps/web/app/[locale]/merchants/missions/[missionId]/page.tsx" apps/web/tests/kinnso.MissionDetailView.test.tsx apps/web/lib/i18n/messages/*.ts
git commit -m "feat(web): add back-to-queue navigation on merchant mission detail"
```

---

## Task 9: Ops settlements — add a back link off the internal island

`/ops/settlements` is an internal island reached only via the `/studio` role redirect, with no way out. Add a "back to home" link. This needs a new i18n key `ops.backHome` and a `locale` prop.

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface + en value), `ja.ts`, `ko.ts`, `th.ts`, `zh-cn.ts`, `zh-hk.ts`, `zh-tw.ts` (values)
- Modify: `apps/web/components/kinnso/pages/OpsSettlementView.tsx`
- Modify: `apps/web/app/[locale]/ops/settlements/page.tsx`
- Test: `apps/web/tests/kinnso.OpsSettlementView.test.tsx`

- [ ] **Step 1: Add `ops.backHome` to the interface (en.ts type block)**

In `apps/web/lib/i18n/messages/en.ts`, find the ops **interface**:

```ts
  ops: {
    settlementHeading: string
```

Replace with:

```ts
  ops: {
    backHome: string
    settlementHeading: string
```

- [ ] **Step 2: Add `ops.backHome` value to every locale**

In each file, within the `ops:` **value** object, add `backHome` immediately after the `ops: {` opening (before `settlementHeading: '…',`):

| file | add |
|---|---|
| `en.ts` | `backHome: 'Back to home',` |
| `ja.ts` | `backHome: 'ホームに戻る',` |
| `ko.ts` | `backHome: '홈으로',` |
| `th.ts` | `backHome: 'กลับสู่หน้าหลัก',` |
| `zh-cn.ts` | `backHome: '返回首页',` |
| `zh-hk.ts` | `backHome: '返回首頁',` |
| `zh-tw.ts` | `backHome: '返回首頁',` |

Example for `en.ts` value block:

```ts
  ops: {
    backHome: 'Back to home',
    settlementHeading: 'Settlement queue',
```

- [ ] **Step 3: Update the OpsSettlementView test**

In `apps/web/tests/kinnso.OpsSettlementView.test.tsx`, add `locale="en"` to the three `render(<OpsSettlementView … />)` calls (each currently starts `render(<OpsSettlementView t={en.ops} settlements={[settlement]} …`). Change each to `render(<OpsSettlementView locale="en" t={en.ops} settlements={[settlement]} …`. Then add a new test inside the `describe` block:

```tsx
  it('links back to home off the ops island', () => {
    render(<OpsSettlementView locale="en" t={en.ops} settlements={[settlement]} onUpdate={vi.fn()} />)
    expect(screen.getByRole('link', { name: en.ops.backHome }).getAttribute('href')).toBe('/en')
  })
```

- [ ] **Step 4: Run the test — verify it fails**

Run: `cd apps/web && pnpm exec vitest run tests/kinnso.OpsSettlementView.test.tsx`
Expected: FAIL — no `locale` prop and no back link.

- [ ] **Step 5: Add `locale` + back link to OpsSettlementView.tsx**

In `apps/web/components/kinnso/pages/OpsSettlementView.tsx`, add the imports (after the existing `useRouter` import):

```tsx
import { useRouter } from 'next/navigation'
```

becomes:

```tsx
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Locale } from '@/lib/i18n/config'
```

Replace the props type + signature:

```tsx
type OpsSettlementViewProps = {
  t: Messages['ops']
  settlements: OpsSettlementRow[]
  onUpdate: (settlementId: string, status: 'paid') => KinnsoActionResult | Promise<KinnsoActionResult>
}

export function OpsSettlementView({ t, settlements, onUpdate }: OpsSettlementViewProps) {
```

with:

```tsx
type OpsSettlementViewProps = {
  locale: Locale
  t: Messages['ops']
  settlements: OpsSettlementRow[]
  onUpdate: (settlementId: string, status: 'paid') => KinnsoActionResult | Promise<KinnsoActionResult>
}

export function OpsSettlementView({ locale, t, settlements, onUpdate }: OpsSettlementViewProps) {
```

Then add the back link under the `<main …>` open tag, before the `<h1>`:

```tsx
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.settlementHeading}</h1>
```

becomes:

```tsx
    <main className="k-container py-10">
      <Link href={`/${locale}`} className="text-sm font-semibold text-kinnso-orange hover:underline">
        ← {t.backHome}
      </Link>
      <h1 className="mt-3 text-3xl font-black text-kinnso-ink">{t.settlementHeading}</h1>
```

- [ ] **Step 6: Pass `locale` from the page**

In `apps/web/app/[locale]/ops/settlements/page.tsx`, replace:

```tsx
  return <OpsSettlementView t={messages.ops} settlements={settlements} onUpdate={markPaid} />
```

with:

```tsx
  return <OpsSettlementView locale={loc} t={messages.ops} settlements={settlements} onUpdate={markPaid} />
```

- [ ] **Step 7: Run the tests — verify they pass**

Run: `cd apps/web && pnpm exec vitest run tests/kinnso.OpsSettlementView.test.tsx tests/ops.settlements.host.test.tsx tests/i18n.locale-parity.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/kinnso/pages/OpsSettlementView.tsx "apps/web/app/[locale]/ops/settlements/page.tsx" apps/web/tests/kinnso.OpsSettlementView.test.tsx apps/web/lib/i18n/messages/*.ts
git commit -m "feat(web): add back-to-home navigation off the ops settlements island"
```

---

## Task 10: Full verification — suite, typecheck, lint, build, and live smoke test

- [ ] **Step 1: Run the full test suite**

Run: `cd apps/web && pnpm test`
Expected: PASS — all suites green, including `i18n.locale-parity.test.ts` (every new key present in all 7 locales) and every host test.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS — no missing-prop errors (every view that gained a required `locale` is called with it; every new i18n key is in the `Messages` interface).

- [ ] **Step 3: Lint**

Run: `cd apps/web && pnpm lint`
Expected: PASS (no new warnings; no unused imports left behind).

- [ ] **Step 4: Production build**

Run: `cd apps/web && pnpm build`
Expected: PASS — `/[locale]/feed` builds as a redirect; `/[locale]/offers` no longer appears in the route manifest.

- [ ] **Step 5: Live smoke test (preview)**

Start the dev server (`preview_start`) and verify each reachability fix in the browser. Reference: `apps/web/AGENTS.md` warns the Next.js setup differs from training data — verify behavior, don't assume it.

Check, in order:
1. **Nav (anon):** `/en` — navbar shows Creators · Merchants · AI Agent · Guides · Articles; **no** "Travelers" item.
2. **`/feed` redirect:** navigate to `/en/feed` → lands on `/en/explore` (network panel shows a 307/308 to `/en/explore`).
3. **`/offers` cut:** navigate to `/en/offers` → 404 / not-found page.
4. **Footer:** only one link to `/about`; "How it works" → `/en/merchants`; no Instagram/Threads/LINE/WhatsApp labels; no Case studies/Press/Contact.
5. **Studio quick-links** (as an active creator): the Inbox tile renders with a "Soon" badge but is **not** clickable (no navigation); the guides tile reads "Guides" and opens the guides list.
6. **Dashboard opportunities** (creator with a joined mission): clicking a mission opportunity opens `/en/studio/missions/<id>`; an offer opportunity opens `/en/studio/offers`.
7. **Merchant nav + queue → detail → back** (as a merchant): navbar shows a "Missions" item → `/en/merchants/missions`; clicking a mission row opens `/en/merchants/missions/<id>`; the detail page shows a "← Back to queue" link returning to the queue.
8. **Ops back link** (as an ops member): `/en/ops/settlements` shows a "← Back to home" link to `/en`.

Capture a screenshot of the updated navbar + footer as proof. If any check fails, read the relevant source, fix, re-run the affected test from Tasks 1–9, then re-verify.

- [ ] **Step 6: Final commit (only if Step 5 required fixes)**

```bash
git add -A
git commit -m "fix(web): phase 1 reachability smoke-test fixes"
```

---

## Self-review against the spec (Phase 1 line items)

- **Keep `/agent` in nav** — untouched (still in `baseAnchors`). ✔
- **Cut public `/offers` from nav** — route deleted (Task 4); it was never a nav anchor (orphan). ✔
- **Cut `/merchants/creators` from nav** — merchant anchor repointed to `/merchants/missions` (Task 2); the page itself remains a route (backlog), per spec. ✔
- **Consolidate `/explore`+`/feed` (redirect `/feed` → `/explore`)** — Task 1. ✔
- **Fix footer dead-ends (collapse the 4 → `/about` labels)** — Task 3 (one About link; Case studies/Press/Contact dropped). ✔
- **Social links real href or remove** — removed the non-functional labels (Task 3); real links deferred to Phase 4 with confirmed URLs. ✔
- **Fix label/route mismatches (Apply, "New Guide", "Pricing")** — "New Guide"→"Guides" (Task 5), "Pricing"→"How it works" (Task 3). "Apply"→`/sign-up` already reaches a real page (not a dead click); the funnel redesign is explicitly Phase 2, noted in Out of Scope. ✔
- **Disable the inbox tile** — Task 5 (non-interactive, keeps "Soon" badge). ✔
- **Wire orphaned-but-real pages into nav — merchant missions queue + card→detail + back-nav, ops back-link** — nav link (Task 2), queue→detail (Task 7), detail back-nav (Task 8), ops back-link (Task 9). ✔
- **Studio dashboard opportunity deep-links** (route-table Phase-1 item for `/studio`) — Task 6. ✔
- **Outcome: zero dead clicks; every real surface reachable** — verified in Task 10 Step 5. ✔

**Type/name consistency:** the `locale: Locale` prop is added identically to `MerchantMissionsView`, `MissionDetailView`, `OpsSettlementView`, and passed as `locale={loc}` from each page (`loc` is the existing narrowed `Locale` in those pages). New i18n keys (`nav.linkMissions`, `missions.backToQueue`, `ops.backHome`) are added to the `Messages` interface and all 7 locale value files, satisfying `i18n.locale-parity.test.ts`. No placeholders; every code step shows the full edit.

**Open dependency:** Task 6's mission deep-link assumes `/studio/missions/[id]` exists (landed by the Phase 0 pull). The Prerequisite section's `ls` check confirms it before any task runs.
