# Phase 9 — SEO & Public Discovery + Branded OG Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make KINNSO's public surface (creator guides, creator profiles, marketing pages) discoverable in search and shareable on social — by extending the existing `lib/seo/*` patterns to every public route and adding dynamic branded OpenGraph cards via `next/og`.

**Architecture:** Web-only, **no DB migration**. Extend `lib/seo/metadata.ts` (new builders + a shared hreflang helper), `lib/seo/jsonld.ts` (Organization / WebSite / ProfilePage schema), `app/sitemap.ts` + `app/robots.ts` (guides + creators + private-tree disallow), add site-wide defaults in `app/[locale]/layout.tsx`, wire `generateMetadata` + JSON-LD into the guide/creator/marketing pages, and add three `opengraph-image.tsx` route handlers backed by shared card primitives in `lib/seo/og/`. A new `seo` i18n group (×7 locales) supplies localized meta copy.

**Tech Stack:** Next.js **16.2.9** (App Router; `Metadata`/`MetadataRoute`/`next/og`), TypeScript, custom i18n (7 locales), Supabase (read-only public client), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-27-phase9-seo-public-discovery-design.md`

**Branch:** `feat/phase9-seo-public-discovery` (already created off `origin/main`; the spec commit is its first commit). All work lands here.

---

## ⚠️ Read before coding (per `apps/web/AGENTS.md`)

This is Next.js **16.2.9** — "NOT the Next.js you know." Before writing any metadata or OG-image code, read the relevant guides under `apps/web/node_modules/next/dist/docs/` (search for `generateMetadata`, `opengraph-image`, `ImageResponse`, `sitemap`, `robots`). In particular verify, for **this** version:
- `generateMetadata({ params })` — `params` is a **Promise** (await it; matches the page signatures in this repo).
- The `opengraph-image.tsx` file convention: default export signature, whether it receives `{ params }` as a Promise, the `size`/`contentType`/`runtime` segment exports, and `ImageResponse` font-loading.
- Whether a colocated `opengraph-image` is **auto-merged** into a route's `<head>` even when the page's `generateMetadata` returns an `openGraph` object (Task 12 depends on this; a fallback is documented there).

All commands below run from **`apps/web/`** unless stated. Tests require `apps/web/.env.test` (already present) because `vitest.setup.ts` throws without `SUPABASE_URL`.

## File structure

**Create:**
- `apps/web/lib/seo/og/data.ts` — pure card-prop helpers (truncate, niche pick). Unit-tested.
- `apps/web/lib/seo/og/fonts.ts` — load bundled `.ttf` as `ArrayBuffer` for `ImageResponse`.
- `apps/web/lib/seo/og/card.tsx` — shared OG card JSX primitives + brand palette.
- `apps/web/app/[locale]/opengraph-image.tsx` — default/home branded card.
- `apps/web/app/[locale]/g/[slug]/opengraph-image.tsx` — guide card.
- `apps/web/app/[locale]/c/[handle]/opengraph-image.tsx` — creator card.
- `apps/web/public/fonts/Bricolage-Bold.ttf` (+ `Bricolage-Regular.ttf`) — bundled OG fonts.
- `apps/web/tests/jsonld.test.ts` — Organization / WebSite / creatorProfile shape tests.
- `apps/web/tests/sitemap.guides-creators.test.ts` — deterministic (mocked) sitemap coverage.
- `apps/web/tests/seo.og-data.test.ts` — OG card-prop helper tests.

**Modify:**
- `apps/web/lib/seo/metadata.ts` — `hreflangFor`, `buildPageMetadata`, `buildGuideMetadata`, `buildCreatorMetadata`, `noindexMetadata`; export `OG_LOCALE`; refactor article/listing builders to bare titles via `hreflangFor`.
- `apps/web/lib/seo/jsonld.ts` — `organizationJsonLd`, `websiteJsonLd`, `creatorProfileJsonLd`.
- `apps/web/lib/guides/queries.ts` — `getGuidesForSitemap()`.
- `apps/web/lib/creators/queries.ts` — `getCreatorsForSitemap()`.
- `apps/web/app/sitemap.ts` — emit guides + creators + marketing routes.
- `apps/web/app/robots.ts` — disallow private trees.
- `apps/web/app/[locale]/layout.tsx` — `generateMetadata` defaults + site-wide JSON-LD.
- `apps/web/app/[locale]/g/[slug]/page.tsx` — `buildGuideMetadata` + Article/Breadcrumb JSON-LD.
- `apps/web/app/[locale]/c/[handle]/page.tsx` — `buildCreatorMetadata` + ProfilePage/Breadcrumb JSON-LD.
- `apps/web/app/[locale]/{page,explore/page,creators/page,agent/page,about/page,contact/page,merchants/page,legal/creator-terms/page}.tsx` — `generateMetadata` via `buildPageMetadata`.
- `apps/web/app/[locale]/{sign-in,sign-up,creator}/page.tsx` — `noindexMetadata`.
- `apps/web/lib/i18n/messages/{en,ja,ko,th,zh-cn,zh-hk,zh-tw}.ts` — `seo` group.
- `apps/web/tests/metadata.test.ts` — new-builder tests + bare-title assertions.
- `apps/web/tests/i18n.locale-parity.test.ts` — add `'seo'` to `GROUPS`.
- `apps/web/tests/guides.queries.test.ts`, `apps/web/tests/creators.queries.test.ts` — sitemap-query tests.

---

## Task 1: i18n `seo` group (foundation for all meta copy)

**Files:**
- Modify: `apps/web/lib/i18n/messages/en.ts` (interface + default export)
- Modify: `apps/web/lib/i18n/messages/{ja,ko,th,zh-cn,zh-hk,zh-tw}.ts`
- Test: `apps/web/tests/i18n.locale-parity.test.ts`

- [ ] **Step 1: Add `'seo'` to the parity `GROUPS` (failing test)**

In `tests/i18n.locale-parity.test.ts`, append `'seo'` to the `GROUPS` array (line ~14-19):

```ts
const GROUPS = [
  'studio', 'creatorProfile', 'merchants', 'missions', 'missionDetail', 'ops', 'nav', 'footer', 'home', 'comingSoon',
  'studioHome', 'explore', 'feed', 'creatorsLanding', 'merchantsLanding', 'studioGuides',
  'studioOffers', 'studioEarnings', 'about', 'contact', 'creatorTerms', 'article', 'tier', 'copilot', 'admin', 'perks',
  'users', 'merchantSearch', 'seo',
] as const
```

- [ ] **Step 2: Run the parity test — verify it fails**

Run: `pnpm exec vitest run tests/i18n.locale-parity.test.ts`
Expected: FAIL — `en defines the … groups` (or per-locale) fails because no message file has a `seo` group yet (`keyPaths(undefined)` → `['seo']` mismatch).

- [ ] **Step 3: Add the `seo` field to the `Messages` interface**

In `lib/i18n/messages/en.ts`, inside `export interface Messages { … }` (starts line 1), add this field (place it right after the `article: {…}` line near the top):

```ts
  seo: {
    brandTitle: string
    brandDescription: string
    home: { title: string; description: string }
    explore: { title: string; description: string }
    creators: { title: string; description: string }
    agent: { title: string; description: string }
    about: { title: string; description: string }
    contact: { title: string; description: string }
    merchants: { title: string; description: string }
    terms: { title: string; description: string }
  }
```

- [ ] **Step 4: Add the `seo` object to en's default export**

In the same file, inside the exported default object (`const en: Messages = { … }`, after line ~679), add (place near the `article` group for locality):

```ts
  seo: {
    brandTitle: 'KINNSO — Travel creators, real missions',
    brandDescription:
      'KINNSO connects travel and lifestyle creators with real brand missions, affiliate offers, and an AI copilot to grow your audience.',
    home: {
      title: 'Travel creators, real missions',
      description:
        'Join KINNSO to find real brand missions, earn from affiliate offers, and grow with an AI copilot built for travel creators.',
    },
    explore: {
      title: 'Explore creator guides',
      description: 'Browse real travel guides published by KINNSO creators across Asia and beyond.',
    },
    creators: {
      title: 'Discover travel creators',
      description: 'Find travel and lifestyle creators on KINNSO by niche, audience, and platform.',
    },
    agent: {
      title: 'Creator Copilot — your AI growth assistant',
      description: 'Meet the KINNSO Creator Copilot: AI agents that help you find content ideas, grow your audience, and earn more.',
    },
    about: {
      title: 'About KINNSO',
      description: 'KINNSO is the creator platform connecting travel and lifestyle creators with real brand missions.',
    },
    contact: {
      title: 'Contact KINNSO',
      description: 'Get in touch with the KINNSO team about partnerships, missions, and creator support.',
    },
    merchants: {
      title: 'For brands and merchants',
      description: 'Run real missions with vetted travel and lifestyle creators on KINNSO.',
    },
    terms: {
      title: 'Creator Terms',
      description: 'The terms that govern creators using KINNSO.',
    },
  },
```

- [ ] **Step 5: Add the matching `seo` object to the other six locale files**

For each of `ja.ts, ko.ts, th.ts, zh-cn.ts, zh-hk.ts, zh-tw.ts`, add a `seo: { … }` object with the **identical key structure** (same nested keys). Localize the values where you can; **English values are acceptable for the MVP soft-launch** as long as every key is present (the parity test checks key paths, not value differences). Copy the en `seo` block verbatim into each as the floor, then translate values opportunistically. (Locale files import the `Messages` type from `./en`, so TypeScript will flag any missing key.)

- [ ] **Step 6: Run the parity test — verify it passes**

Run: `pnpm exec vitest run tests/i18n.locale-parity.test.ts`
Expected: PASS — all 7 locales have identical `seo` key paths.

- [ ] **Step 7: Typecheck (the `Messages` interface must match all 7 objects)**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors (every locale file satisfies `Messages`).

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/i18n/messages apps/web/tests/i18n.locale-parity.test.ts
git commit -m "feat(phase9): seo i18n group ×7 locales"
```

---

## Task 2: SEO metadata builders (`lib/seo/metadata.ts`)

**Files:**
- Modify: `apps/web/lib/seo/metadata.ts`
- Test: `apps/web/tests/metadata.test.ts`

- [ ] **Step 1: Write failing tests for the new builders + bare-title refactor**

Replace the contents of `tests/metadata.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import {
  buildArticleMetadata, buildListingMetadata,
  buildPageMetadata, buildGuideMetadata, buildCreatorMetadata, noindexMetadata,
  SITE_URL,
} from '@/lib/seo/metadata'
import { LOCALES } from '@/lib/i18n/config'

const base = {
  urlCategory: 'dining' as const, url: 'ramen-guide', locale: 'en' as const,
  presentLocales: ['en', 'zh-hk'] as const,
  title: 'Best Ramen', metaTitle: null, summary: 'A guide', metaDescription: null,
  ogImage: 'https://cdn.kinnso.ai/og.jpg', publishedAt: '2026-06-01T00:00:00Z',
  editAt: '2026-06-10T00:00:00Z', isCoupon: false,
}

describe('buildArticleMetadata', () => {
  it('builds a bare title (branded by the layout template), canonical, present-only hreflang + x-default', () => {
    const m = buildArticleMetadata(base)
    expect(m.title).toBe('Best Ramen')
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/en/articles/dining/ramen-guide`)
    const langs = m.alternates!.languages as Record<string, string>
    expect(Object.keys(langs).sort()).toEqual(['en', 'x-default', 'zh-hk'])
    expect(langs['zh-hk']).toBe(`${SITE_URL}/zh-hk/articles/dining/ramen-guide`)
    expect(langs['x-default']).toBe(`${SITE_URL}/en/articles/dining/ramen-guide`)
  })
  it('prefers meta_title; description falls back to summary', () => {
    const m = buildArticleMetadata({ ...base, metaTitle: 'SEO Title', metaDescription: null })
    expect(m.title).toBe('SEO Title')
    expect(m.description).toBe('A guide')
  })
  it('sets og:type=article with modifiedTime from editAt', () => {
    const og = buildArticleMetadata(base).openGraph as any
    expect(og.type).toBe('article')
    expect(og.publishedTime).toBe('2026-06-01T00:00:00Z')
    expect(og.modifiedTime).toBe('2026-06-10T00:00:00Z')
    expect(og.images).toEqual(['https://cdn.kinnso.ai/og.jpg'])
  })
  it('noindexes EN coupon articles only', () => {
    expect((buildArticleMetadata({ ...base, isCoupon: true, locale: 'en' }).robots as any).index).toBe(false)
    expect((buildArticleMetadata({ ...base, isCoupon: true, locale: 'zh-hk' }).robots as any).index).toBe(true)
  })
})

describe('buildListingMetadata', () => {
  it('category: bare title, canonical, all 7 hreflang + x-default', () => {
    const m = buildListingMetadata({ urlCategory: 'dining', locale: 'en', presentLocales: LOCALES, title: 'Dining' })
    expect(m.title).toBe('Dining')
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/en/articles/dining`)
    const langs = m.alternates!.languages as Record<string, string>
    expect(Object.keys(langs).sort()).toEqual([...LOCALES, 'x-default'].sort())
    expect(langs['zh-hk']).toBe(`${SITE_URL}/zh-hk/articles/dining`)
    expect((m.robots as any).index).toBe(true)
  })
  it('hub (urlCategory null): canonical points to /articles', () => {
    const m = buildListingMetadata({ urlCategory: null, locale: 'en', presentLocales: LOCALES, title: 'Articles' })
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/en/articles`)
  })
})

describe('buildPageMetadata', () => {
  it('self-canonical + all 7 hreflang + x-default for a marketing path', () => {
    const m = buildPageMetadata({ path: '/explore', locale: 'zh-hk', title: 'Explore', description: 'Browse guides' })
    expect(m.title).toBe('Explore')
    expect(m.description).toBe('Browse guides')
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/zh-hk/explore`)
    const langs = m.alternates!.languages as Record<string, string>
    expect(Object.keys(langs).sort()).toEqual([...LOCALES, 'x-default'].sort())
    expect(langs['x-default']).toBe(`${SITE_URL}/en/explore`)
    expect((m.openGraph as any).type).toBe('website')
    expect((m.twitter as any).card).toBe('summary_large_image')
    expect((m.robots as any).index).toBe(true)
  })
  it('home (path "") canonicalises to the locale root', () => {
    const m = buildPageMetadata({ path: '', locale: 'en', title: 'Home', description: 'd' })
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/en`)
    expect((m.alternates!.languages as Record<string, string>)['ja']).toBe(`${SITE_URL}/ja`)
  })
})

describe('buildGuideMetadata', () => {
  it('og:type=article, self-canonical, 7 hreflang under /g/<slug>', () => {
    const m = buildGuideMetadata({ slug: 'kyoto-tea', locale: 'en', title: 'Kyoto Tea', description: 'Tea houses' })
    expect(m.title).toBe('Kyoto Tea')
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/en/g/kyoto-tea`)
    const langs = m.alternates!.languages as Record<string, string>
    expect(Object.keys(langs).sort()).toEqual([...LOCALES, 'x-default'].sort())
    expect((m.openGraph as any).type).toBe('article')
    expect((m.robots as any).index).toBe(true)
  })
})

describe('buildCreatorMetadata', () => {
  it('og:type=profile, self-canonical, 7 hreflang under /c/<handle>', () => {
    const m = buildCreatorMetadata({ handle: 'maya', locale: 'ja', name: 'Maya', bio: 'Slow travel' })
    expect(m.title).toBe('Maya (@maya)')
    expect(m.description).toBe('Slow travel')
    expect(m.alternates!.canonical).toBe(`${SITE_URL}/ja/c/maya`)
    expect((m.openGraph as any).type).toBe('profile')
  })
  it('falls back to a generic description when bio is empty', () => {
    const m = buildCreatorMetadata({ handle: 'maya', locale: 'en', name: 'Maya', bio: '' })
    expect(m.description).toContain('@maya')
  })
})

describe('noindexMetadata', () => {
  it('marks the page noindex,nofollow', () => {
    const m = noindexMetadata()
    expect((m.robots as any).index).toBe(false)
    expect((m.robots as any).follow).toBe(false)
  })
})
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm exec vitest run tests/metadata.test.ts`
Expected: FAIL — `buildPageMetadata`/`buildGuideMetadata`/`buildCreatorMetadata`/`noindexMetadata` are not exported; the bare-title assertions fail against the current ` - Kinnso` suffix.

- [ ] **Step 3: Rewrite `lib/seo/metadata.ts`**

```ts
import type { Metadata } from 'next'
import { DEFAULT_LOCALE, LOCALES, type Locale, type UrlCategory } from '@/lib/i18n/config'

export const OG_LOCALE: Record<Locale, string> = {
  en: 'en_US', 'zh-hk': 'zh_HK', 'zh-tw': 'zh_TW', 'zh-cn': 'zh_CN', ja: 'ja_JP', ko: 'ko_KR', th: 'th_TH',
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.kinnso.ai'

const abs = (l: string, path: string) => `${SITE_URL}/${l}${path}` // path is '' or starts with '/'

/** canonical (current locale) + hreflang map (given locales) + x-default → DEFAULT_LOCALE. */
function hreflangFor(pathFor: (l: Locale) => string, current: Locale, locales: readonly Locale[]) {
  const languages: Record<string, string> = {}
  for (const l of locales) languages[l] = pathFor(l)
  languages['x-default'] = pathFor(DEFAULT_LOCALE)
  return { canonical: pathFor(current), languages }
}

// ---------- Articles (existing surface; refactored to bare titles via hreflangFor) ----------

export interface ArticleMetaInput {
  urlCategory: UrlCategory; url: string; locale: Locale; presentLocales: readonly Locale[]
  title: string | null; metaTitle: string | null; summary: string | null; metaDescription: string | null
  ogImage: string | null; publishedAt: string | null; editAt: string | null; isCoupon: boolean
}

const articlePath = (l: string, c: string, u: string) => abs(l, `/articles/${c}/${u}`)

export function buildArticleMetadata(i: ArticleMetaInput): Metadata {
  const heading = i.metaTitle ?? i.title ?? ''
  const description = (i.metaDescription && i.metaDescription.trim()) || i.summary || ''
  const { canonical, languages } = hreflangFor((l) => articlePath(l, i.urlCategory, i.url), i.locale, i.presentLocales)
  const index = !(i.isCoupon && i.locale === DEFAULT_LOCALE)
  return {
    title: heading,
    description,
    alternates: { canonical, languages },
    openGraph: {
      type: 'article', url: canonical, title: heading, description,
      images: i.ogImage ? [i.ogImage] : [],
      publishedTime: i.publishedAt ?? undefined,
      modifiedTime: i.editAt ?? i.publishedAt ?? undefined,
      locale: OG_LOCALE[i.locale],
    },
    robots: { index, follow: true, 'max-image-preview': 'large' },
  }
}

export interface ListingMetaInput {
  urlCategory: UrlCategory | null; locale: Locale; presentLocales: readonly Locale[]; title: string
}

export function buildListingMetadata(i: ListingMetaInput): Metadata {
  const seg = i.urlCategory ? `/articles/${i.urlCategory}` : '/articles'
  const { canonical, languages } = hreflangFor((l) => abs(l, seg), i.locale, i.presentLocales)
  return {
    title: i.title,
    alternates: { canonical, languages },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
  }
}

// ---------- New: marketing pages, guides, creators, noindex ----------

export interface PageMetaInput {
  path: string; locale: Locale; title: string; description: string
  type?: 'website' | 'article' | 'profile'
}

export function buildPageMetadata(i: PageMetaInput): Metadata {
  const { canonical, languages } = hreflangFor((l) => abs(l, i.path), i.locale, LOCALES)
  return {
    title: i.title,
    description: i.description,
    alternates: { canonical, languages },
    openGraph: {
      type: i.type ?? 'website', url: canonical, title: i.title, description: i.description,
      siteName: 'KINNSO', locale: OG_LOCALE[i.locale],
    },
    twitter: { card: 'summary_large_image', title: i.title, description: i.description },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
  }
}

export function buildGuideMetadata(i: { slug: string; locale: Locale; title: string; description: string }): Metadata {
  const { canonical, languages } = hreflangFor((l) => abs(l, `/g/${i.slug}`), i.locale, LOCALES)
  return {
    title: i.title,
    description: i.description,
    alternates: { canonical, languages },
    openGraph: {
      type: 'article', url: canonical, title: i.title, description: i.description,
      siteName: 'KINNSO', locale: OG_LOCALE[i.locale],
    },
    twitter: { card: 'summary_large_image', title: i.title, description: i.description },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
  }
}

export function buildCreatorMetadata(i: { handle: string; locale: Locale; name: string; bio: string }): Metadata {
  const title = `${i.name} (@${i.handle})`
  const description = i.bio || `Travel creator @${i.handle} on KINNSO.`
  const { canonical, languages } = hreflangFor((l) => abs(l, `/c/${i.handle}`), i.locale, LOCALES)
  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      type: 'profile', url: canonical, title, description,
      siteName: 'KINNSO', locale: OG_LOCALE[i.locale],
    },
    twitter: { card: 'summary_large_image', title, description },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
  }
}

export function noindexMetadata(title?: string): Metadata {
  return { ...(title ? { title } : {}), robots: { index: false, follow: false } }
}
```

Note: builders intentionally do **not** set `openGraph.images` — images come from the colocated `opengraph-image.tsx` file convention (Task 12). The article builder keeps its explicit `images` (its real `og_image` pipeline is unchanged).

- [ ] **Step 4: Run — verify it passes**

Run: `pnpm exec vitest run tests/metadata.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/seo/metadata.ts apps/web/tests/metadata.test.ts
git commit -m "feat(phase9): seo metadata builders (page/guide/creator/noindex) + hreflang helper"
```

---

## Task 3: JSON-LD helpers (`lib/seo/jsonld.ts`)

**Files:**
- Modify: `apps/web/lib/seo/jsonld.ts`
- Test: `apps/web/tests/jsonld.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/jsonld.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { organizationJsonLd, websiteJsonLd, creatorProfileJsonLd } from '@/lib/seo/jsonld'

describe('organizationJsonLd', () => {
  it('builds a schema.org Organization', () => {
    const o = organizationJsonLd({ url: 'https://www.kinnso.ai', logo: 'https://www.kinnso.ai/icon.png' }) as any
    expect(o['@type']).toBe('Organization')
    expect(o.name).toBe('KINNSO')
    expect(o.url).toBe('https://www.kinnso.ai')
    expect(o.logo).toBe('https://www.kinnso.ai/icon.png')
  })
})

describe('websiteJsonLd', () => {
  it('builds a WebSite with a SearchAction', () => {
    const w = websiteJsonLd({
      url: 'https://www.kinnso.ai/en', locale: 'en',
      searchUrlTemplate: 'https://www.kinnso.ai/en/articles?q={search_term_string}',
    }) as any
    expect(w['@type']).toBe('WebSite')
    expect(w.inLanguage).toBe('en')
    expect(w.potentialAction['@type']).toBe('SearchAction')
    expect(w.potentialAction.target.urlTemplate).toContain('{search_term_string}')
    expect(w.potentialAction['query-input']).toBe('required name=search_term_string')
  })
})

describe('creatorProfileJsonLd', () => {
  it('wraps a Person in a ProfilePage', () => {
    const p = creatorProfileJsonLd({
      name: 'Maya', handle: 'maya', url: 'https://www.kinnso.ai/en/c/maya',
      bio: 'Slow travel', niches: ['Coffee', 'City Walk'],
    }) as any
    expect(p['@type']).toBe('ProfilePage')
    expect(p.mainEntity['@type']).toBe('Person')
    expect(p.mainEntity.name).toBe('Maya')
    expect(p.mainEntity.alternateName).toBe('@maya')
    expect(p.mainEntity.knowsAbout).toEqual(['Coffee', 'City Walk'])
  })
  it('omits empty bio and niches', () => {
    const p = creatorProfileJsonLd({ name: 'Leo', handle: 'leo', url: 'u', bio: '', niches: [] }) as any
    expect(p.mainEntity.description).toBeUndefined()
    expect(p.mainEntity.knowsAbout).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm exec vitest run tests/jsonld.test.ts`
Expected: FAIL — the three functions are not exported.

- [ ] **Step 3: Append to `lib/seo/jsonld.ts`**

```ts
export function organizationJsonLd(i: { url: string; logo: string }): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'Organization',
    name: 'KINNSO', url: i.url, logo: i.logo,
  }
}

export function websiteJsonLd(i: { url: string; locale: string; searchUrlTemplate: string }): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'WebSite',
    name: 'KINNSO', url: i.url, inLanguage: i.locale,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: i.searchUrlTemplate },
      'query-input': 'required name=search_term_string',
    },
  }
}

export function creatorProfileJsonLd(i: {
  name: string; handle: string; url: string; bio: string; niches: string[]
}): Record<string, unknown> {
  const person: Record<string, unknown> = {
    '@type': 'Person', name: i.name, alternateName: `@${i.handle}`, url: i.url,
  }
  if (i.bio) person.description = i.bio
  if (i.niches.length) person.knowsAbout = i.niches
  return {
    '@context': 'https://schema.org', '@type': 'ProfilePage',
    mainEntity: person,
  }
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `pnpm exec vitest run tests/jsonld.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/seo/jsonld.ts apps/web/tests/jsonld.test.ts
git commit -m "feat(phase9): Organization/WebSite/ProfilePage JSON-LD helpers"
```

---

## Task 4: Root layout metadata defaults + site-wide JSON-LD

**Files:**
- Modify: `apps/web/app/[locale]/layout.tsx`

(No new unit test — verified by `tsc` + the build manifest in Task 13. The builders/helpers it uses are already covered by Tasks 2–3.)

- [ ] **Step 1: Add `generateMetadata` and render site-wide JSON-LD**

Rewrite `app/[locale]/layout.tsx`:

```tsx
import '../globals.css'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, htmlLang, LOCALES, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { SiteChrome } from '@/components/kinnso/SiteChrome'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL, OG_LOCALE } from '@/lib/seo/metadata'
import { organizationJsonLd, websiteJsonLd } from '@/lib/seo/jsonld'
import { fontVariables } from '../layout'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const loc = locale as Locale
  const dict = await getDictionary(loc)
  const languages: Record<string, string> = {}
  for (const l of LOCALES) languages[l] = `${SITE_URL}/${l}`
  languages['x-default'] = `${SITE_URL}/${DEFAULT_LOCALE}`
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: dict.seo.brandTitle, template: '%s · KINNSO' },
    description: dict.seo.brandDescription,
    alternates: { canonical: `${SITE_URL}/${loc}`, languages },
    openGraph: { type: 'website', siteName: 'KINNSO', locale: OG_LOCALE[loc] },
    twitter: { card: 'summary_large_image' },
  }
}

export default async function LocaleLayout({
  children, params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)
  const ld = [
    organizationJsonLd({ url: SITE_URL, logo: `${SITE_URL}/icon.png` }),
    websiteJsonLd({
      url: `${SITE_URL}/${loc}`, locale: htmlLang(loc),
      searchUrlTemplate: `${SITE_URL}/${loc}/articles?q={search_term_string}`,
    }),
  ]
  return (
    <html lang={htmlLang(loc)} className={`h-full antialiased ${fontVariables}`}>
      <body className="min-h-full flex flex-col font-sans bg-cream text-ink">
        <JsonLd data={ld} />
        <SiteChrome locale={loc} nav={messages.nav} footer={messages.footer}>
          {children}
        </SiteChrome>
      </body>
    </html>
  )
}
```

Notes: `logo` references `/icon.png`. If no `icon.png` exists in `app/`, either keep the existing `favicon.ico` reference (`${SITE_URL}/favicon.ico`) or add an `app/icon.png` (optional). Use `favicon.ico` if unsure — it always exists.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Run the existing layout/host tests (regression)**

Run: `pnpm exec vitest run tests/i18n.locale-parity.test.ts tests/metadata.test.ts tests/jsonld.test.ts`
Expected: PASS (sanity that imports resolve; layout has no dedicated test).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/[locale]/layout.tsx
git commit -m "feat(phase9): root metadata defaults (metadataBase, title template) + site-wide Organization/WebSite JSON-LD"
```

---

## Task 5: Guide page SEO (`g/[slug]/page.tsx`)

**Files:**
- Modify: `apps/web/app/[locale]/g/[slug]/page.tsx`

- [ ] **Step 1: Replace `generateMetadata` + add JSON-LD to the page**

In `app/[locale]/g/[slug]/page.tsx`:

1. Add imports at the top:
```tsx
import { buildGuideMetadata, SITE_URL } from '@/lib/seo/metadata'
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
```

2. Replace the existing `generateMetadata` (lines 15-28) with:
```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const guide = await getGuideBySlug(slug)
  if (!guide) return { title: 'Guide not found', robots: { index: false, follow: false } }
  const authorName = guide.creatorName ?? `@${guide.creatorHandle}`
  return buildGuideMetadata({
    slug, locale: locale as Locale,
    title: guide.title,
    description: `${guide.city} guide by ${authorName}. ${guide.summary ?? ''}`.trim(),
  })
}
```

3. Inside the default `GuidePage`, after `const authorName = …` (line ~42), build the JSON-LD and render it as the first child of the returned `<article>`:
```tsx
  const canonical = `${SITE_URL}/${locale}/g/${slug}`
  const ld = [
    articleJsonLd({
      headline: guide.title,
      description: guide.summary ?? `${guide.city} guide by ${authorName}`,
      url: canonical, images: guide.cover ? [guide.cover] : [],
      publishedAt: null, modifiedAt: null,
      authorName, locale,
    }),
    breadcrumbJsonLd([
      { name: messages.seo.explore.title, url: `${SITE_URL}/${locale}/explore` },
      { name: guide.title, url: canonical },
    ]),
  ]
```
Then add `<JsonLd data={ld} />` as the first element inside the returned `<article …>`:
```tsx
  return (
    <article className="k-container py-8 md:py-12">
      <JsonLd data={ld} />
      …existing content…
```

Note: the breadcrumb label reuses `messages.seo.explore.title` (defined in Task 1) so it is i18n-correct and guaranteed to exist — no new `nav` key needed.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors. (If `messages.nav.linkExplore` is wrong, tsc fails — fix to the real key.)

- [ ] **Step 3: Run any guide host test + metadata test (regression)**

Run: `pnpm exec vitest run tests/metadata.test.ts`
Expected: PASS. (There is no `g/[slug]` host test; correctness is confirmed by tsc + Task 13 build.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/[locale]/g/[slug]/page.tsx
git commit -m "feat(phase9): guide page metadata (canonical+hreflang+OG) + Article/Breadcrumb JSON-LD"
```

---

## Task 6: Creator page SEO (`c/[handle]/page.tsx`)

**Files:**
- Modify: `apps/web/app/[locale]/c/[handle]/page.tsx`

- [ ] **Step 1: Replace `generateMetadata` + add JSON-LD**

In `app/[locale]/c/[handle]/page.tsx`:

1. Add imports:
```tsx
import { buildCreatorMetadata, SITE_URL } from '@/lib/seo/metadata'
import { creatorProfileJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
```

2. Replace `generateMetadata` (lines 12-24) with:
```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>
}): Promise<Metadata> {
  const { locale, handle } = await params
  if (!isLocale(locale)) return {}
  const creator = await getCreatorByHandle(handle)
  if (!creator) return { title: 'Creator not found', robots: { index: false, follow: false } }
  return buildCreatorMetadata({ handle, locale: locale as Locale, name: creator.name, bio: creator.bio })
}
```

3. In the default `CreatorPublicPage`, after `if (!creator) notFound()`, build + render JSON-LD before the view:
```tsx
  const canonical = `${SITE_URL}/${locale}/c/${handle}`
  const ld = [
    creatorProfileJsonLd({
      name: creator.name, handle: creator.handle, url: canonical,
      bio: creator.bio, niches: creator.profile.niches,
    }),
    breadcrumbJsonLd([
      { name: messages.seo.creators.title, url: `${SITE_URL}/${locale}/creators` },
      { name: creator.name, url: canonical },
    ]),
  ]
  return (
    <>
      <JsonLd data={ld} />
      <CreatorProfileView creator={creator} locale={locale as Locale} t={messages.creatorProfile} />
    </>
  )
```

Note: the breadcrumb label reuses `messages.seo.creators.title` (defined in Task 1) — i18n-correct and guaranteed to exist; no new `nav` key needed.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Run the creator host/index tests (regression)**

Run: `pnpm exec vitest run tests/creators.index.host.test.tsx tests/metadata.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/[locale]/c/[handle]/page.tsx
git commit -m "feat(phase9): creator page metadata (canonical+hreflang+OG profile) + ProfilePage/Breadcrumb JSON-LD"
```

---

## Task 7: Marketing-page metadata (8 pages)

**Files:**
- Modify: `apps/web/app/[locale]/page.tsx`, `explore/page.tsx`, `creators/page.tsx`, `agent/page.tsx`, `about/page.tsx`, `contact/page.tsx`, `merchants/page.tsx`, `legal/creator-terms/page.tsx`

Each page is `export default async function X({ params }: { params: Promise<{ locale: string }> })`. Add a `generateMetadata` above the default export, using the shared builder + the `seo` i18n group. The mapping of page → `path` / `seo` key:

| File | path | seo key |
|---|---|---|
| `page.tsx` (home) | `''` | `home` |
| `explore/page.tsx` | `/explore` | `explore` |
| `creators/page.tsx` | `/creators` | `creators` |
| `agent/page.tsx` | `/agent` | `agent` |
| `about/page.tsx` | `/about` | `about` |
| `contact/page.tsx` | `/contact` | `contact` |
| `merchants/page.tsx` | `/merchants` | `merchants` |
| `legal/creator-terms/page.tsx` | `/legal/creator-terms` | `terms` |

- [ ] **Step 1: Add `generateMetadata` to the home page**

In `app/[locale]/page.tsx`, add these imports + function (above `export default async function LocaleHome`):

```tsx
import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo/metadata'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildPageMetadata({ path: '', locale: locale as Locale, title: dict.seo.home.title, description: dict.seo.home.description })
}
```

- [ ] **Step 2: Add `generateMetadata` to the other seven pages**

Apply the same shape to each, swapping `path` and the `seo.<key>`. For example, `explore/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo/metadata'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildPageMetadata({ path: '/explore', locale: locale as Locale, title: dict.seo.explore.title, description: dict.seo.explore.description })
}
```

Repeat for `creators` (`path: '/creators'`, `dict.seo.creators`), `agent` (`/agent`, `dict.seo.agent`), `about` (`/about`, `dict.seo.about`), `contact` (`/contact`, `dict.seo.contact`), `merchants` (`/merchants`, `dict.seo.merchants`), `legal/creator-terms` (`/legal/creator-terms`, `dict.seo.terms`).

Each page already imports `isLocale`, `type Locale`, and `getDictionary` (verify; the home/explore/etc. pages all do). If a page does not import `getDictionary` or `isLocale`, add the import from `@/lib/i18n/config` / `@/lib/i18n/dictionaries`.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Run host tests for these pages (regression)**

Run: `pnpm exec vitest run tests/feed.host.test.tsx tests/agent.host.test.tsx tests/creators.index.host.test.tsx`
Expected: PASS (these render the pages; metadata is a separate export and won't break rendering).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/[locale]/page.tsx apps/web/app/[locale]/explore/page.tsx apps/web/app/[locale]/creators/page.tsx apps/web/app/[locale]/agent/page.tsx apps/web/app/[locale]/about/page.tsx apps/web/app/[locale]/contact/page.tsx apps/web/app/[locale]/merchants/page.tsx apps/web/app/[locale]/legal/creator-terms/page.tsx
git commit -m "feat(phase9): localized metadata (canonical+hreflang+OG) on the 8 marketing pages"
```

---

## Task 8: noindex auth + onboarding pages

**Files:**
- Modify: `apps/web/app/[locale]/sign-in/page.tsx`, `sign-up/page.tsx`, `creator/page.tsx`

These render for (or redirect) anonymous visitors, so give them an explicit `noindex`. (All other private trees are covered by the robots disallow in Task 10.)

- [ ] **Step 1: Add a static `metadata` export to each**

At the top of each of `sign-in/page.tsx`, `sign-up/page.tsx`, `creator/page.tsx`, add:

```tsx
import type { Metadata } from 'next'
import { noindexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = noindexMetadata()
```

(These are server-component page modules, so a static `metadata` export is valid. Do not add it if the file is `'use client'` — none of these three are, per inspection, but verify the first line.)

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/[locale]/sign-in/page.tsx apps/web/app/[locale]/sign-up/page.tsx apps/web/app/[locale]/creator/page.tsx
git commit -m "feat(phase9): noindex sign-in/sign-up/onboarding pages"
```

---

## Task 9: Sitemap queries (guides + creators)

**Files:**
- Modify: `apps/web/lib/guides/queries.ts`, `apps/web/lib/creators/queries.ts`
- Test: `apps/web/tests/guides.queries.test.ts`, `apps/web/tests/creators.queries.test.ts`

- [ ] **Step 1: Failing test for `getGuidesForSitemap`**

Append to `tests/guides.queries.test.ts` (its `vi.mock` already resolves `.order()` to `state.list`):

```ts
import { getGuidesForSitemap } from '@/lib/guides/queries'

describe('getGuidesForSitemap', () => {
  it('returns published slugs with a lastmod', async () => {
    state.list = [{ slug: 'kyoto-tea', published_at: '2026-06-02T00:00:00Z' }]
    const rows = await getGuidesForSitemap()
    expect(rows).toEqual([{ slug: 'kyoto-tea', lastmod: '2026-06-02T00:00:00Z' }])
  })
  it('returns [] when there are no published guides', async () => {
    state.list = []
    expect(await getGuidesForSitemap()).toEqual([])
  })
})
```

Add the `getGuidesForSitemap` name to the existing top import line in that test file (`import { mapRowToGuide, getPublishedGuides, getGuideBySlug } from '@/lib/guides/queries'` → also import it there, or keep the separate import above — either compiles).

- [ ] **Step 2: Failing test for `getCreatorsForSitemap`**

Append to `tests/creators.queries.test.ts` (its mock resolves `.not().order()` and `then` to `state.creators` for the `creators` table):

```ts
import { getCreatorsForSitemap } from '@/lib/creators/queries'

describe('getCreatorsForSitemap', () => {
  it('returns active handles with a lastmod', async () => {
    state.creators = [{ handle: 'maya', created_at: '2026-06-03T00:00:00Z' }]
    const rows = await getCreatorsForSitemap()
    expect(rows).toEqual([{ handle: 'maya', lastmod: '2026-06-03T00:00:00Z' }])
  })
  it('returns [] when there are no active creators', async () => {
    state.creators = []
    expect(await getCreatorsForSitemap()).toEqual([])
  })
})
```

- [ ] **Step 3: Run — verify both fail**

Run: `pnpm exec vitest run tests/guides.queries.test.ts tests/creators.queries.test.ts`
Expected: FAIL — neither function is exported.

- [ ] **Step 4: Implement `getGuidesForSitemap`**

Append to `lib/guides/queries.ts`:

```ts
export async function getGuidesForSitemap(): Promise<{ slug: string; lastmod: string | null }[]> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('guides')
    .select('slug, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  return (data ?? []).map((r) => ({
    slug: r.slug as string,
    lastmod: (r.published_at as string | null) ?? null,
  }))
}
```

- [ ] **Step 5: Implement `getCreatorsForSitemap`**

Append to `lib/creators/queries.ts`:

```ts
export async function getCreatorsForSitemap(): Promise<{ handle: string; lastmod: string | null }[]> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('creators')
    .select('handle, created_at')
    .eq('status', 'active')
    .not('handle', 'is', null)
    .not('public_profile', 'is', null)
    .order('created_at', { ascending: false })
  return (data ?? []).map((r) => ({
    handle: r.handle as string,
    lastmod: (r.created_at as string | null) ?? null,
  }))
}
```

- [ ] **Step 6: Run — verify both pass**

Run: `pnpm exec vitest run tests/guides.queries.test.ts tests/creators.queries.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/guides/queries.ts apps/web/lib/creators/queries.ts apps/web/tests/guides.queries.test.ts apps/web/tests/creators.queries.test.ts
git commit -m "feat(phase9): getGuidesForSitemap + getCreatorsForSitemap"
```

---

## Task 10: Sitemap + robots (guides, creators, marketing, private disallow)

**Files:**
- Modify: `apps/web/app/sitemap.ts`, `apps/web/app/robots.ts`
- Test: `apps/web/tests/sitemap.guides-creators.test.ts` (create), `apps/web/tests/sitemap.test.ts` (extend robots)

- [ ] **Step 1: Failing deterministic sitemap test (mocks all query modules)**

Create `apps/web/tests/sitemap.guides-creators.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/articles/queries', () => ({
  getPublishedForSitemap: async () => [
    { url: 'ramen', category: 'dining', lastmod: '2026-06-01T00:00:00Z', locales: ['en', 'zh-hk'] },
  ],
}))
vi.mock('@/lib/guides/queries', () => ({
  getGuidesForSitemap: async () => [{ slug: 'kyoto-tea', lastmod: '2026-06-02T00:00:00Z' }],
}))
vi.mock('@/lib/creators/queries', () => ({
  getCreatorsForSitemap: async () => [{ handle: 'maya', lastmod: '2026-06-03T00:00:00Z' }],
}))

import sitemap from '@/app/sitemap'
import { LOCALES } from '@/lib/i18n/config'

const SITE = 'https://www.kinnso.ai'

describe('sitemap — guides, creators, marketing', () => {
  it('emits each guide and creator for all 7 locales', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    for (const l of LOCALES) {
      expect(urls).toContain(`${SITE}/${l}/g/kyoto-tea`)
      expect(urls).toContain(`${SITE}/${l}/c/maya`)
    }
  })
  it('includes the home + key marketing routes per locale', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toContain(`${SITE}/en`)
    expect(urls).toContain(`${SITE}/en/explore`)
    expect(urls).toContain(`${SITE}/en/creators`)
  })
  it('still includes the articles hub', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toContain(`${SITE}/en/articles`)
    expect(urls).toContain(`${SITE}/en/articles/dining/ramen`)
  })
})
```

- [ ] **Step 2: Failing robots test (private disallow)**

Append to `tests/sitemap.test.ts` inside the `describe('robots', …)` block:

```ts
  it('disallows the private trees but allows the public surface', () => {
    const r = robots()
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules
    const disallow = (rule.disallow ?? []) as string[]
    expect(disallow).toContain('/*/studio')
    expect(disallow).toContain('/*/admin')
    expect(disallow).toContain('/*/merchants/post')
    // onboarding is anchored so it does not catch the public /creators directory
    expect(disallow).toContain('/*/creator$')
    expect(disallow).not.toContain('/*/merchants') // the public landing stays crawlable
  })
```

- [ ] **Step 3: Run — verify failures**

Run: `pnpm exec vitest run tests/sitemap.guides-creators.test.ts tests/sitemap.test.ts`
Expected: FAIL — guide/creator/marketing URLs absent; robots has no `disallow`.

- [ ] **Step 4: Rewrite `app/sitemap.ts`**

```ts
import type { MetadataRoute } from 'next'
import { getPublishedForSitemap } from '@/lib/articles/queries'
import { getGuidesForSitemap } from '@/lib/guides/queries'
import { getCreatorsForSitemap } from '@/lib/creators/queries'
import { LOCALES, URL_CATEGORIES, toUrlCategory } from '@/lib/i18n/config'
import { SITE_URL } from '@/lib/seo/metadata'

export const revalidate = 21600 // 6h

const MARKETING_PATHS = ['', '/explore', '/creators', '/agent', '/about', '/contact', '/merchants', '/legal/creator-terms']

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, guides, creators] = await Promise.all([
    getPublishedForSitemap(), getGuidesForSitemap(), getCreatorsForSitemap(),
  ])
  const out: MetadataRoute.Sitemap = []

  // marketing + articles hub/category per locale
  for (const l of LOCALES) {
    for (const p of MARKETING_PATHS) {
      out.push({ url: `${SITE_URL}/${l}${p}`, changeFrequency: 'weekly', priority: p === '' ? 0.8 : 0.5 })
    }
    out.push({ url: `${SITE_URL}/${l}/articles`, changeFrequency: 'daily', priority: 0.6 })
    for (const c of URL_CATEGORIES) {
      out.push({ url: `${SITE_URL}/${l}/articles/${c}`, changeFrequency: 'daily', priority: 0.6 })
    }
  }

  // article detail: present locales only
  for (const a of articles) {
    const c = toUrlCategory(a.category)
    if (!c) continue
    const lastModified = a.lastmod ? new Date(a.lastmod) : undefined
    for (const l of a.locales) {
      out.push({ url: `${SITE_URL}/${l}/articles/${c}/${a.url}`, lastModified, changeFrequency: 'weekly', priority: 0.8 })
    }
  }

  // guides + creators: single-language content under every locale prefix (self-canonical + page-head hreflang)
  for (const g of guides) {
    const lastModified = g.lastmod ? new Date(g.lastmod) : undefined
    for (const l of LOCALES) {
      out.push({ url: `${SITE_URL}/${l}/g/${g.slug}`, lastModified, changeFrequency: 'weekly', priority: 0.7 })
    }
  }
  for (const cr of creators) {
    const lastModified = cr.lastmod ? new Date(cr.lastmod) : undefined
    for (const l of LOCALES) {
      out.push({ url: `${SITE_URL}/${l}/c/${cr.handle}`, lastModified, changeFrequency: 'weekly', priority: 0.6 })
    }
  }
  return out
}
```

- [ ] **Step 5: Rewrite `app/robots.ts`**

```ts
import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/metadata'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: [
        '/*/studio', '/*/admin', '/*/ops',
        '/*/sign-in', '/*/sign-up', '/*/creator$',
        '/*/merchants/post', '/*/merchants/missions', '/*/merchants/creators', '/*/merchants/insights',
      ],
    }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
```

- [ ] **Step 6: Run — verify passes**

Run: `pnpm exec vitest run tests/sitemap.guides-creators.test.ts tests/sitemap.test.ts`
Expected: PASS. (The existing integration assertions in `sitemap.test.ts` still hit real Supabase for articles; guides/creators there resolve against the real DB and simply add rows — the article-only assertions remain valid.)

- [ ] **Step 7: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/sitemap.ts apps/web/app/robots.ts apps/web/tests/sitemap.guides-creators.test.ts apps/web/tests/sitemap.test.ts
git commit -m "feat(phase9): sitemap covers guides+creators+marketing; robots disallows private trees"
```

---

## Task 11: OG card primitives + data helpers + fonts

**Files:**
- Create: `apps/web/lib/seo/og/data.ts`, `apps/web/lib/seo/og/fonts.ts`, `apps/web/lib/seo/og/card.tsx`
- Create: `apps/web/public/fonts/Bricolage-Bold.ttf`, `apps/web/public/fonts/Bricolage-Regular.ttf`
- Test: `apps/web/tests/seo.og-data.test.ts`

- [ ] **Step 1: Failing test for the card-prop helpers**

Create `apps/web/tests/seo.og-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { truncate, pickNiches } from '@/lib/seo/og/data'

describe('truncate', () => {
  it('returns the string unchanged when within the limit', () => {
    expect(truncate('Kyoto Tea Houses', 40)).toBe('Kyoto Tea Houses')
  })
  it('cuts and adds an ellipsis past the limit', () => {
    const out = truncate('a'.repeat(60), 20)
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('pickNiches', () => {
  it('keeps at most 3 by default', () => {
    expect(pickNiches(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c'])
  })
  it('returns all when fewer than the cap', () => {
    expect(pickNiches(['a'])).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm exec vitest run tests/seo.og-data.test.ts`
Expected: FAIL — `@/lib/seo/og/data` does not exist.

- [ ] **Step 3: Implement `lib/seo/og/data.ts`**

```ts
/** Truncate to `max` chars, appending an ellipsis (counted within `max`). */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

/** First `max` niches for the OG chip row. */
export function pickNiches(niches: string[], max = 3): string[] {
  return niches.slice(0, max)
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `pnpm exec vitest run tests/seo.og-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Bundle the OG fonts**

Download the two `.ttf` weights into `apps/web/public/fonts/` (Bricolage Grotesque is the brand display font, already used via `next/font`). From the repo, run:

```bash
mkdir -p apps/web/public/fonts
curl -fsSL -o apps/web/public/fonts/Bricolage-Bold.ttf \
  "https://github.com/google/fonts/raw/main/ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf"
cp apps/web/public/fonts/Bricolage-Bold.ttf apps/web/public/fonts/Bricolage-Regular.ttf
```

If the download is unavailable in this environment, **skip the bundled fonts** and have `loadOgFonts()` (next step) return `[]` — `ImageResponse` then renders with its built-in default font. The card must still render; note in the commit message that branded fonts are pending. (A variable-axis `.ttf` works for both weights; the duplicate copy keeps the two file paths valid.)

- [ ] **Step 6: Implement `lib/seo/og/fonts.ts`**

```ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface OgFont { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }

/**
 * Load bundled brand fonts as ArrayBuffers for `ImageResponse`. Returns [] if the
 * files are missing so the OG route still renders with the default font.
 * NOTE: `process.cwd()` is the app root (`apps/web`) at runtime — verify against the
 * Next 16 docs/build output; adjust the base path if the monorepo cwd differs.
 */
export async function loadOgFonts(): Promise<OgFont[]> {
  const base = join(process.cwd(), 'public', 'fonts')
  try {
    const [bold, regular] = await Promise.all([
      readFile(join(base, 'Bricolage-Bold.ttf')),
      readFile(join(base, 'Bricolage-Regular.ttf')),
    ])
    return [
      { name: 'Bricolage', data: bold.buffer.slice(bold.byteOffset, bold.byteOffset + bold.byteLength) as ArrayBuffer, weight: 700, style: 'normal' },
      { name: 'Bricolage', data: regular.buffer.slice(regular.byteOffset, regular.byteOffset + regular.byteLength) as ArrayBuffer, weight: 400, style: 'normal' },
    ]
  } catch {
    return []
  }
}
```

- [ ] **Step 7: Implement `lib/seo/og/card.tsx`**

First read `apps/web/app/globals.css` and find the brand color tokens (search the `@theme` block for `cream`, `ink`, `orange`). Substitute the **real hex values** into the constants below (replace the placeholders):

```tsx
/* OG card primitives for next/og ImageResponse. JSX uses inline styles only
   (ImageResponse supports a flexbox CSS subset). Colors must match app/globals.css @theme. */

export const OG = {
  cream: '#FBF7F0',   // ← replace with --color-cream from globals.css
  ink: '#1A1A1A',     // ← replace with --color-ink
  orange: '#FF5A1F',  // ← replace with --color-orange / kinnso-orange
  muted: '#6B6B6B',   // ← replace with the muted token
}

export const OG_SIZE = { width: 1200, height: 630 }

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      background: OG.cream, color: OG.ink, padding: 64, fontFamily: 'Bricolage',
    }}>
      {children}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 32, fontWeight: 700, color: OG.orange }}>
        KINNSO
      </div>
    </div>
  )
}

export function DefaultCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05 }}>{title}</div>
        <div style={{ fontSize: 34, color: OG.muted }}>{subtitle}</div>
      </div>
    </Frame>
  )
}

export function GuideCard({ title, city, handle, cover }: { title: string; city: string; handle: string; cover?: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', fontFamily: 'Bricolage', background: OG.ink, color: OG.cream }}>
      {cover ? <img src={cover} width={1200} height={360} style={{ objectFit: 'cover' }} /> : <div style={{ width: 1200, height: 360, background: OG.orange }} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 56, flex: 1, justifyContent: 'center' }}>
        <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.05 }}>{title}</div>
        <div style={{ fontSize: 30, color: '#D9D2C7' }}>{city} · @{handle}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: OG.orange }}>KINNSO</div>
      </div>
    </div>
  )
}

export function CreatorCard({ name, handle, niches, guideCount }: { name: string; handle: string; niches: string[]; guideCount: number }) {
  return (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 64, fontWeight: 700 }}>{name}</div>
        <div style={{ fontSize: 34, color: OG.muted }}>@{handle} · {guideCount} guides</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {niches.map((n) => (
            <div key={n} style={{ display: 'flex', fontSize: 26, padding: '8px 18px', borderRadius: 999, background: OG.orange, color: OG.cream }}>{n}</div>
          ))}
        </div>
      </div>
    </Frame>
  )
}
```

- [ ] **Step 8: Typecheck + re-run the data test**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run tests/seo.og-data.test.ts`
Expected: 0 type errors; PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/seo/og apps/web/public/fonts apps/web/tests/seo.og-data.test.ts
git commit -m "feat(phase9): OG card primitives + data helpers + bundled brand fonts"
```

---

## Task 12: OG image routes (guide / creator / default)

**Files:**
- Create: `apps/web/app/[locale]/opengraph-image.tsx`, `apps/web/app/[locale]/g/[slug]/opengraph-image.tsx`, `apps/web/app/[locale]/c/[handle]/opengraph-image.tsx`

⚠️ **Verify the `opengraph-image` API for Next 16.2.9 first** (read `node_modules/next/dist/docs/` — `opengraph-image`, `ImageResponse`). Confirm the default-export signature, whether `params` is a Promise, and the `size`/`contentType`/`runtime` exports. The code below uses the documented Next 13.4+ convention; adjust to match this version if the docs differ.

- [ ] **Step 1: Default/home card — `app/[locale]/opengraph-image.tsx`**

```tsx
import { ImageResponse } from 'next/og'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config'
import { loadOgFonts } from '@/lib/seo/og/fonts'
import { DefaultCard, OG_SIZE } from '@/lib/seo/og/card'

export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const loc: Locale = isLocale(locale) ? (locale as Locale) : DEFAULT_LOCALE
  const dict = await getDictionary(loc)
  const fonts = await loadOgFonts()
  return new ImageResponse(
    <DefaultCard title={dict.seo.brandTitle} subtitle={dict.seo.home.description} />,
    { ...OG_SIZE, fonts },
  )
}
```

- [ ] **Step 2: Guide card — `app/[locale]/g/[slug]/opengraph-image.tsx`**

```tsx
import { ImageResponse } from 'next/og'
import { getGuideBySlug } from '@/lib/guides/queries'
import { loadOgFonts } from '@/lib/seo/og/fonts'
import { GuideCard, DefaultCard, OG_SIZE } from '@/lib/seo/og/card'
import { truncate } from '@/lib/seo/og/data'

export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug } = await params
  const guide = await getGuideBySlug(slug)
  const fonts = await loadOgFonts()
  const card = guide
    ? <GuideCard title={truncate(guide.title, 70)} city={guide.city} handle={guide.creatorHandle} cover={guide.cover || undefined} />
    : <DefaultCard title="Guide" subtitle="KINNSO" />
  return new ImageResponse(card, { ...OG_SIZE, fonts })
}
```

- [ ] **Step 3: Creator card — `app/[locale]/c/[handle]/opengraph-image.tsx`**

```tsx
import { ImageResponse } from 'next/og'
import { getCreatorByHandle } from '@/lib/creators/queries'
import { loadOgFonts } from '@/lib/seo/og/fonts'
import { CreatorCard, DefaultCard, OG_SIZE } from '@/lib/seo/og/card'
import { pickNiches } from '@/lib/seo/og/data'

export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ locale: string; handle: string }> }) {
  const { handle } = await params
  const creator = await getCreatorByHandle(handle)
  const fonts = await loadOgFonts()
  const card = creator
    ? <CreatorCard name={creator.name} handle={creator.handle} niches={pickNiches(creator.profile.niches)} guideCount={creator.guides.length} />
    : <DefaultCard title="Creator" subtitle="KINNSO" />
  return new ImageResponse(card, { ...OG_SIZE, fonts })
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors. (If `params` is not a Promise in this Next version, tsc will flag it — adjust the signature.)

- [ ] **Step 5: Build smoke — the routes compile and register**

Run: `pnpm exec next build`
Expected: build succeeds; the build output lists the three `opengraph-image` routes (e.g. `/[locale]/opengraph-image`, `/[locale]/g/[slug]/opengraph-image`, `/[locale]/c/[handle]/opengraph-image`).

- [ ] **Step 6: Visual + head verification (manual, documented)**

Start the app and verify the cards render and the head wiring is correct:

```bash
pnpm dev   # then, in another shell:
curl -s http://localhost:3000/en/opengraph-image -o /tmp/og-default.png && file /tmp/og-default.png   # expect: PNG image data, 1200 x 630
# guide/creator: substitute a real published slug / active handle from the DB
curl -s "http://localhost:3000/en/g/<real-slug>/opengraph-image" -o /tmp/og-guide.png && file /tmp/og-guide.png
# confirm the page emits an og:image meta that points at the route:
curl -s http://localhost:3000/en | grep -i 'og:image'
```

Expected: each PNG is valid 1200×630; the home/guide/creator pages emit `<meta property="og:image" …/opengraph-image…>`.

**If `og:image` is missing** from the page head (the colocated `opengraph-image` was not auto-merged because `generateMetadata` returns `openGraph`), apply the documented fallback: in `lib/seo/metadata.ts`, add an optional `ogImage?: string` to `buildPageMetadata`/`buildGuideMetadata`/`buildCreatorMetadata` and set `openGraph.images: [ogImage]` + `twitter.images: [ogImage]`; pass the absolute `…/opengraph-image` URL from each page's `generateMetadata`. Re-run Step 6.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/[locale]/opengraph-image.tsx apps/web/app/[locale]/g/[slug]/opengraph-image.tsx apps/web/app/[locale]/c/[handle]/opengraph-image.tsx
git commit -m "feat(phase9): branded next/og cards for home, guides, creators"
```

---

## Task 13: Finish gate (full suite + tsc + lint + build + manifest)

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `pnpm exec vitest run`
Expected: ALL tests pass (prior baseline was 739; this phase adds the new metadata/jsonld/sitemap/og-data tests + the `seo` parity group). **Run the FULL suite, not just touched files** — the `*.host.test.tsx` server-page tests are not in any per-task command and a metadata/import regression in a page only surfaces here (the host-test-gap lesson). If a few files emit `Failed to start forks worker` / worker-timeout **errors** (not assertion failures) under load, re-run those files in isolation to confirm green:

Run: `pnpm exec vitest run <flaked-file> --no-file-parallelism`

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Lint**

Run: `pnpm exec next lint` (or `pnpm lint` if defined)
Expected: 0 errors.

- [ ] **Step 4: Production build + manifest check**

Run: `pnpm exec next build`
Expected: success. Confirm in the route list: `/sitemap.xml`, `/robots.txt`, and the three `opengraph-image` routes. Confirm the guide/creator/marketing pages still build (no `generateMetadata` runtime error).

- [ ] **Step 5: Spot-check rendered SEO (manual)**

With `pnpm dev` running:
```bash
curl -s http://localhost:3000/sitemap.xml | grep -c '/g/'      # > 0 if any published guide exists
curl -s http://localhost:3000/robots.txt                       # shows Disallow: /*/studio etc. + Sitemap:
curl -s http://localhost:3000/en | grep -iE 'canonical|hreflang|application/ld\+json'   # canonical + alternates + Org/WebSite JSON-LD
curl -s "http://localhost:3000/en/g/<real-slug>" | grep -iE 'canonical|og:type|ld\+json'
```
Expected: home emits canonical + 7 hreflang alternates + Organization/WebSite JSON-LD; guide emits self-canonical + `og:type=article` + Article/Breadcrumb JSON-LD; robots disallows the private trees.

- [ ] **Step 6: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "chore(phase9): finish-gate fixes (full suite, build, manifest green)"
```

---

## Notes for the executor

- **Single shared git tree → tasks run strictly sequentially.** Do not parallelize file edits across tasks.
- **Migrations:** none. This phase touches no database.
- **`nav` breadcrumb keys (Tasks 5–6):** the exact key names for "Explore"/"Creators" in the `nav` group must be looked up in `lib/i18n/messages/en.ts` — do not invent keys; `tsc` will catch a wrong one.
- **OG is the only higher-risk surface.** If `next/og` font loading or the `params` signature differs in 16.2.9, follow the docs and the documented fallbacks in Task 12; the cards must render (default font is acceptable if brand fonts can't be bundled).
- **Two-lens review before PR:** after Task 13, run a security-auditor + code-reviewer pass over the full diff (per project practice), focusing on: no private route left indexable, canonical/hreflang correctness, no fabricated data in meta, and the OG routes not leaking non-public data (they read the same public queries the pages already use).
- **PR:** base `main`. Title `Phase 9 — SEO & Public Discovery + branded OG images`. CI on this account fails at job-startup (account-level, pre-checkout) — the **local gate is the source of truth**; note that in the PR body.
```
