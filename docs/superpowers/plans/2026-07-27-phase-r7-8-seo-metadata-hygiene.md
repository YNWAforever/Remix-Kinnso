# Phase R7.8 SEO & Metadata Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every indexable KINNSO public URL publish honest metadata, locale relationships, structured data, and sitemap membership under one shared SEO policy.

**Architecture:** Add a pure article-indexability module under the existing SEO layer, then make article metadata, category metadata, static params, and sitemap generation consume it. Keep entity routes as thin adapters over the existing metadata and JSON-LD builders; optional availability/review failures reduce claims instead of breaking public pages.

**Tech Stack:** Next.js 16 App Router metadata routes, React 19, TypeScript 5, Supabase anon/RLS queries, Vitest 4, Playwright, schema.org JSON-LD, the existing parity package, and the R7.1 sitemap crawler.

## Global Constraints

- The authoritative design is `docs/superpowers/specs/2026-07-26-phase-r7-8-seo-metadata-hygiene-design.md`.
- The R1–R6 program conventions in `docs/superpowers/specs/2026-07-02-product-revision-program-design.md` §7 are binding.
- Preserve every public content URL and all shipped migrations.
- Add no database migration and mutate no production content.
- Add every new locale key and idiomatic value to all seven locales: `en`, `zh-hk`, `zh-tw`, `ja`, `ko`, `th`, and `zh-cn`.
- Keep `/agent` under the existing R7.2 live/waitlist metadata policy.
- `BOOKING_LIVE` is read-only input; this phase does not activate it.
- `experiences.price_amount` is already the public major-unit price. Do not call `toStripeAmount` or divide by 100 in JSON-LD.
- Article indexability requires a non-empty title, a non-empty summary or meta description, and at least 300 normalized visible content characters.
- Genuine article translations alone may be indexed or advertised through `hreflang`; fallback pages remain readable but are `noindex`.
- `aggregateRating` may only represent a positive aggregate of published real reviews.
- Use TDD for every behavior change and make one conventional commit per task.

---

## File Structure

### Create

- `apps/web/lib/seo/article-indexability.ts` — pure content-quality, locale ordering, and canonical/index decision logic.
- `apps/web/tests/article-indexability.test.ts` — multilingual threshold and decision-unit tests.
- `apps/web/tests/articles.metadata-state.test.ts` — route metadata tests for booking-state copy and empty category locales.

### Modify

- `apps/web/lib/articles/queries.ts` — fetch SEO translation facts and expose indexable article/category locales.
- `apps/web/lib/seo/metadata.ts` — consume article indexing decisions and enrich listing metadata.
- `apps/web/lib/seo/jsonld.ts` — honest Product/Offer availability, positive-rating guards, and empty-FAQ filtering.
- `apps/web/app/[locale]/articles/page.tsx` — localized marketplace metadata selected by `BOOKING_LIVE`.
- `apps/web/app/[locale]/articles/[category]/page.tsx` — locale/category indexability and alternates.
- `apps/web/app/[locale]/articles/[category]/[url]/page.tsx` — translation-aware metadata/canonical and indexable-only FAQ schema.
- `apps/web/app/[locale]/experiences/[slug]/page.tsx` — always emit Product/Offer with truthful availability.
- `apps/web/app/sitemap.ts` — omit thin/fallback article URLs and empty locale/category routes.
- `apps/web/lib/i18n/messages/en.ts`
- `apps/web/lib/i18n/messages/zh-hk.ts`
- `apps/web/lib/i18n/messages/zh-tw.ts`
- `apps/web/lib/i18n/messages/ja.ts`
- `apps/web/lib/i18n/messages/ko.ts`
- `apps/web/lib/i18n/messages/th.ts`
- `apps/web/lib/i18n/messages/zh-cn.ts` — seven-locale `/articles` SEO copy.
- `scripts/crawl-sitemap.ts` — report redirected and noindexed sitemap entries.
- `apps/e2e/fixtures.ts` — stable guide/experience SEO fixture paths.
- `apps/e2e/specs/seo.spec.ts` — rendered locale, OG, and JSON-LD parity.
- `packages/parity/src/checks/structured-data.ts` — exact article alternate-set comparison.
- `packages/parity/tests/structured-data.test.ts` — missing and extra alternate regressions.

### Extend tests

- `apps/web/tests/metadata.test.ts`
- `apps/web/tests/jsonld.test.ts`
- `apps/web/tests/seo.jsonld.test.ts`
- `apps/web/tests/queries.detail.test.ts`
- `apps/web/tests/articles.public-media.host.test.tsx`
- `apps/web/tests/sitemap.test.ts`
- `apps/web/tests/sitemap.guides-creators.test.ts`
- `apps/web/tests/crawl-sitemap.test.ts`
- `apps/web/tests/i18n.locale-parity.test.ts`
- `apps/web/tests/seo.public-og-media.test.ts`

---

### Task 1: Pure Article Indexability Policy

**Files:**
- Create: `apps/web/lib/seo/article-indexability.ts`
- Create: `apps/web/tests/article-indexability.test.ts`

**Interfaces:**
- Consumes: `parseBlocks(content: unknown): BaseBlock[]` from `apps/web/lib/articles/blocks.ts`.
- Produces:

```ts
export const MIN_ARTICLE_VISIBLE_CHARACTERS = 300

export interface ArticleSeoTranslation {
  locale: Locale
  title: string | null
  summary: string | null
  metaDescription: string | null
  content: unknown
}

export interface ArticleIndexingDecision {
  index: boolean
  canonicalLocale: Locale | null
  alternateLocales: Locale[]
}

export function articleVisibleCharacterCount(content: unknown): number
export function isArticleTranslationIndexable(
  translation: ArticleSeoTranslation,
  isCoupon: boolean,
): boolean
export function indexableArticleLocales(
  translations: readonly ArticleSeoTranslation[],
  isCoupon: boolean,
): Locale[]
export function resolveArticleIndexing(input: {
  requestedLocale: Locale
  resolvedLocale: Locale
  indexableLocales: readonly Locale[]
}): ArticleIndexingDecision
```

- Later tasks import these names exactly; do not rename them.

- [ ] **Step 1: Write the failing multilingual policy tests**

Create `apps/web/tests/article-indexability.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  MIN_ARTICLE_VISIBLE_CHARACTERS,
  articleVisibleCharacterCount,
  indexableArticleLocales,
  isArticleTranslationIndexable,
  resolveArticleIndexing,
  type ArticleSeoTranslation,
} from '@/lib/seo/article-indexability'

const translation = (
  locale: ArticleSeoTranslation['locale'],
  content: unknown,
  overrides: Partial<ArticleSeoTranslation> = {},
): ArticleSeoTranslation => ({
  locale,
  title: 'A real guide',
  summary: 'A useful summary.',
  metaDescription: null,
  content,
  ...overrides,
})

const textBlock = (content: string) => [
  { id: 'block-1', type: 'text', content: `<p>${content}</p>` },
]

describe('articleVisibleCharacterCount', () => {
  it('strips HTML, entities, and collapsed whitespace before counting Unicode code points', () => {
    expect(articleVisibleCharacterCount(textBlock('甲 &amp; 乙   丙'))).toBe(5)
  })

  it('counts supported visible fields and ignores unknown blocks', () => {
    const content = [
      { id: 'a', type: 'detail-box', title: 'Tea', address: { label: 'Kyoto' } },
      { id: 'b', type: 'multiple-image', images: [{ desc: 'Ceremony' }] },
      { id: 'c', type: 'unknown', content: 'do not count this' },
    ]
    expect(articleVisibleCharacterCount(content)).toBe('Tea Kyoto Ceremony'.length)
  })

  it('fails closed for malformed content', () => {
    expect(articleVisibleCharacterCount('{not json')).toBe(0)
    expect(articleVisibleCharacterCount(null)).toBe(0)
  })
})

describe('isArticleTranslationIndexable', () => {
  it('rejects 299 visible characters and accepts exactly 300 in English and CJK content', () => {
    expect(MIN_ARTICLE_VISIBLE_CHARACTERS).toBe(300)
    expect(isArticleTranslationIndexable(translation('en', textBlock('a'.repeat(299))), false)).toBe(false)
    expect(isArticleTranslationIndexable(translation('en', textBlock('a'.repeat(300))), false)).toBe(true)
    expect(isArticleTranslationIndexable(translation('zh-hk', textBlock('旅'.repeat(300))), false)).toBe(true)
    expect(isArticleTranslationIndexable(translation('ja', textBlock('旅'.repeat(300))), false)).toBe(true)
    expect(isArticleTranslationIndexable(translation('ko', textBlock('여'.repeat(300))), false)).toBe(true)
    expect(isArticleTranslationIndexable(translation('th', textBlock('ท'.repeat(300))), false)).toBe(true)
  })

  it('requires a title and either summary or meta description', () => {
    const rich = textBlock('a'.repeat(300))
    expect(isArticleTranslationIndexable(translation('en', rich, { title: ' ' }), false)).toBe(false)
    expect(isArticleTranslationIndexable(
      translation('en', rich, { summary: null, metaDescription: 'SEO description' }),
      false,
    )).toBe(true)
    expect(isArticleTranslationIndexable(
      translation('en', rich, { summary: ' ', metaDescription: null }),
      false,
    )).toBe(false)
  })

  it('preserves the existing default-locale coupon noindex policy', () => {
    const rich = textBlock('a'.repeat(300))
    expect(isArticleTranslationIndexable(translation('en', rich), true)).toBe(false)
    expect(isArticleTranslationIndexable(translation('zh-hk', rich), true)).toBe(true)
  })
})

describe('article locale decisions', () => {
  it('orders genuine indexable locales by LOCALES and de-duplicates them', () => {
    const rich = textBlock('a'.repeat(300))
    expect(indexableArticleLocales([
      translation('zh-hk', rich),
      translation('en', rich),
      translation('zh-hk', rich),
      translation('ja', textBlock('short')),
    ], false)).toEqual(['en', 'zh-hk'])
  })

  it('self-canonicalizes a genuine indexable translation', () => {
    expect(resolveArticleIndexing({
      requestedLocale: 'zh-hk',
      resolvedLocale: 'zh-hk',
      indexableLocales: ['en', 'zh-hk'],
    })).toEqual({
      index: true,
      canonicalLocale: 'zh-hk',
      alternateLocales: ['en', 'zh-hk'],
    })
  })

  it('noindexes fallback and thin locales, preferring English then LOCALES order', () => {
    expect(resolveArticleIndexing({
      requestedLocale: 'ja',
      resolvedLocale: 'en',
      indexableLocales: ['en', 'zh-hk'],
    })).toEqual({
      index: false,
      canonicalLocale: 'en',
      alternateLocales: ['en', 'zh-hk'],
    })
    expect(resolveArticleIndexing({
      requestedLocale: 'en',
      resolvedLocale: 'en',
      indexableLocales: ['zh-hk'],
    }).canonicalLocale).toBe('zh-hk')
  })

  it('does not fabricate a canonical or x-default target when no locale is indexable', () => {
    expect(resolveArticleIndexing({
      requestedLocale: 'en',
      resolvedLocale: 'en',
      indexableLocales: [],
    })).toEqual({ index: false, canonicalLocale: null, alternateLocales: [] })
  })
})
```

- [ ] **Step 2: Run the new test and verify the module is missing**

Run:

```powershell
pnpm --filter web exec vitest run tests/article-indexability.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/seo/article-indexability'`.

- [ ] **Step 3: Implement the pure policy module**

Create `apps/web/lib/seo/article-indexability.ts`:

```ts
import { parseBlocks, type BaseBlock } from '@/lib/articles/blocks'
import {
  DEFAULT_LOCALE,
  LOCALES,
  type Locale,
} from '@/lib/i18n/config'

export const MIN_ARTICLE_VISIBLE_CHARACTERS = 300

export interface ArticleSeoTranslation {
  locale: Locale
  title: string | null
  summary: string | null
  metaDescription: string | null
  content: unknown
}

export interface ArticleIndexingDecision {
  index: boolean
  canonicalLocale: Locale | null
  alternateLocales: Locale[]
}

const stringValue = (value: unknown): string =>
  typeof value === 'string' ? value : ''

function visibleFields(block: BaseBlock): string[] {
  if (block.type === 'text' || block.type === 'number-box') {
    return [
      stringValue(block.title),
      stringValue(block.subtitle),
      stringValue(block.content),
    ]
  }
  if (block.type === 'offer-box') {
    return [stringValue(block.title), stringValue(block.content)]
  }
  if (block.type === 'info-box' || block.type === 'map') {
    return [stringValue(block.content)]
  }
  if (block.type === 'detail-box') {
    const address = block.address as { label?: unknown } | undefined
    const website = block.website as { label?: unknown } | undefined
    return [
      stringValue(block.title),
      stringValue(block.time),
      stringValue(block.price),
      stringValue(block.phone),
      stringValue(address?.label),
      stringValue(website?.label),
    ]
  }
  if (block.type === 'multiple-image') {
    const images = Array.isArray(block.images) ? block.images : []
    return images.map((image) =>
      stringValue((image as { desc?: unknown }).desc),
    )
  }
  return []
}

function normalizeVisibleText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:#\d+|#x[\da-f]+|\w+);/gi, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function articleVisibleCharacterCount(content: unknown): number {
  const text = parseBlocks(content)
    .flatMap(visibleFields)
    .join(' ')
  return Array.from(normalizeVisibleText(text)).length
}

export function isArticleTranslationIndexable(
  translation: ArticleSeoTranslation,
  isCoupon: boolean,
): boolean {
  if (!translation.title?.trim()) return false
  if (!(translation.metaDescription?.trim() || translation.summary?.trim())) {
    return false
  }
  if (isCoupon && translation.locale === DEFAULT_LOCALE) return false
  return articleVisibleCharacterCount(translation.content) >=
    MIN_ARTICLE_VISIBLE_CHARACTERS
}

export function indexableArticleLocales(
  translations: readonly ArticleSeoTranslation[],
  isCoupon: boolean,
): Locale[] {
  const indexable = new Set(
    translations
      .filter((translation) =>
        isArticleTranslationIndexable(translation, isCoupon))
      .map((translation) => translation.locale),
  )
  return LOCALES.filter((locale) => indexable.has(locale))
}

export function resolveArticleIndexing(input: {
  requestedLocale: Locale
  resolvedLocale: Locale
  indexableLocales: readonly Locale[]
}): ArticleIndexingDecision {
  const alternateLocales = LOCALES.filter((locale) =>
    input.indexableLocales.includes(locale))
  const index =
    input.requestedLocale === input.resolvedLocale &&
    alternateLocales.includes(input.requestedLocale)
  const canonicalLocale = index
    ? input.requestedLocale
    : alternateLocales.includes(DEFAULT_LOCALE)
      ? DEFAULT_LOCALE
      : alternateLocales[0] ?? null
  return { index, canonicalLocale, alternateLocales }
}
```

- [ ] **Step 4: Run the focused test and typecheck**

Run:

```powershell
pnpm --filter web exec vitest run tests/article-indexability.test.ts
pnpm --filter web typecheck
```

Expected: the test file passes and TypeScript exits 0.

- [ ] **Step 5: Commit the pure policy**

```powershell
git add apps/web/lib/seo/article-indexability.ts apps/web/tests/article-indexability.test.ts
git commit -m "feat(web): define article SEO indexability"
```

---

### Task 2: Wire Indexability into Article Queries and Detail Metadata

**Files:**
- Modify: `apps/web/lib/articles/queries.ts`
- Modify: `apps/web/lib/seo/metadata.ts`
- Modify: `apps/web/app/[locale]/articles/[category]/[url]/page.tsx`
- Modify: `apps/web/tests/queries.detail.test.ts`
- Modify: `apps/web/tests/metadata.test.ts`
- Modify: `apps/web/tests/articles.public-media.host.test.tsx`

**Interfaces:**
- Consumes: all Task 1 exports.
- Produces:

```ts
export const getIndexableArticleLocales:
  (url: string) => Promise<Locale[]>

export const getIndexableCategoryLocales:
  (category: DbCategory) => Promise<Locale[]>

export interface ArticleMetaInput {
  urlCategory: UrlCategory
  url: string
  locale: Locale
  resolvedLocale: Locale
  indexing: ArticleIndexingDecision
  title: string | null
  metaTitle: string | null
  summary: string | null
  metaDescription: string | null
  ogImage: string | null
  publishedAt: string | null
  editAt: string | null
}
```

- `getPublishedForSitemap()` continues returning `{ url, category, lastmod, locales }[]`, but `locales` now means genuine indexable locales.
- `getStaticArticleParams()` emits genuine indexable locales only; `dynamicParams = true` keeps thin/fallback pages readable on demand.

- [ ] **Step 1: Change the query and metadata tests first**

In `apps/web/tests/queries.detail.test.ts`:

```ts
import {
  getArticleDetail,
  searchArticles,
  getIndexableArticleLocales,
  getIndexableCategoryLocales,
  getYouMayLike,
  getPublishedForSitemap,
  getStaticArticleParams,
} from '@/lib/articles/queries'

it('returns only genuine quality-passing locales for article and category SEO', async () => {
  expect(await getIndexableArticleLocales('ramen-guide')).toEqual(['en', 'zh-hk'])
  expect(await getIndexableCategoryLocales('dining')).toEqual(['en', 'zh-hk'])
})

it('uses the same locale decisions for sitemap and static params', async () => {
  const sitemapRows = await getPublishedForSitemap()
  const ramen = sitemapRows.find((row) => row.url === 'ramen-guide')
  expect(ramen?.locales).toEqual(['en', 'zh-hk'])
  expect(sitemapRows.every((row) => row.locales.length > 0)).toBe(true)

  const params = await getStaticArticleParams()
  expect(params).toContainEqual({
    locale: 'en',
    category: 'dining',
    url: 'ramen-guide',
  })
  expect(params.some((param) => param.url === 'sushi-guide')).toBe(false)
})
```

Replace the article metadata base in `apps/web/tests/metadata.test.ts` with:

```ts
const base = {
  urlCategory: 'dining' as const,
  url: 'ramen-guide',
  locale: 'en' as const,
  resolvedLocale: 'en' as const,
  indexing: {
    index: true,
    canonicalLocale: 'en' as const,
    alternateLocales: ['en', 'zh-hk'] as const,
  },
  title: 'Best Ramen',
  metaTitle: null,
  summary: 'A guide',
  metaDescription: null,
  ogImage: 'https://cdn.kinnso.ai/og.jpg',
  publishedAt: '2026-06-01T00:00:00Z',
  editAt: '2026-06-10T00:00:00Z',
}
```

Replace the coupon-only test with:

```ts
it('noindexes fallback content and canonicalizes it to the selected genuine locale', () => {
  const metadata = buildArticleMetadata({
    ...base,
    locale: 'ja',
    resolvedLocale: 'en',
    indexing: {
      index: false,
      canonicalLocale: 'en',
      alternateLocales: ['en', 'zh-hk'],
    },
  })
  expect((metadata.robots as { index: boolean }).index).toBe(false)
  expect(metadata.alternates?.canonical).toBe(
    `${SITE_URL}/en/articles/dining/ramen-guide`,
  )
  expect(Object.keys(
    metadata.alternates?.languages as Record<string, string>,
  ).sort()).toEqual(['en', 'x-default', 'zh-hk'])
})

it('omits canonical and hreflang when no translation is indexable', () => {
  const metadata = buildArticleMetadata({
    ...base,
    indexing: {
      index: false,
      canonicalLocale: null,
      alternateLocales: [],
    },
  })
  expect(metadata.alternates).toBeUndefined()
  expect((metadata.robots as { index: boolean }).index).toBe(false)
})
```

Update the article-query mock in
`apps/web/tests/articles.public-media.host.test.tsx`:

```ts
vi.mock('@/lib/articles/queries', () => ({
  getArticleDetail: getArticleDetailMock,
  searchArticles: searchArticlesMock,
  getIndexableArticleLocales: vi.fn(async () => ['en']),
  getIndexableCategoryLocales: vi.fn(async () => ['en']),
  getYouMayLike: vi.fn(async () => []),
  getStaticArticleParams: vi.fn(async () => []),
}))
```

- [ ] **Step 2: Run the changed tests and verify the old interfaces fail**

Run:

```powershell
pnpm --filter web exec vitest run tests/article-indexability.test.ts tests/queries.detail.test.ts tests/metadata.test.ts tests/articles.public-media.host.test.tsx
```

Expected: FAIL because `getIndexableArticleLocales`,
`getIndexableCategoryLocales`, and the new `ArticleMetaInput` fields do not yet
exist.

- [ ] **Step 3: Add the cached SEO query mapping**

In `apps/web/lib/articles/queries.ts`, extend imports:

```ts
import {
  LOCALES,
  isLocale,
  toUrlCategory,
  type DbCategory,
  type Locale,
} from '@/lib/i18n/config'
import {
  indexableArticleLocales,
  type ArticleSeoTranslation,
} from '@/lib/seo/article-indexability'
```

Replace `getPresentLocales`, `getPublishedForSitemap`, and
`getStaticArticleParams` with:

```ts
type ArticleSeoRow = {
  url: string
  category: string
  is_coupon: boolean
  end_at: string | null
  edit_at: string | null
  updated_at: string | null
  published_at: string | null
  article_translations: Array<{
    locale: string
    title: string | null
    summary: string | null
    meta_description: string | null
    content: unknown
  }>
}

const getArticleSeoRows = cache(async (): Promise<ArticleSeoRow[]> => {
  const { data, error } = await db()
    .from('articles')
    .select(
      'url, category, is_coupon, end_at, edit_at, updated_at, published_at, ' +
      'article_translations(locale, title, summary, meta_description, content)',
    )
    .order('url')
  if (error) throw error
  return (data ?? []) as ArticleSeoRow[]
})

function seoTranslations(row: ArticleSeoRow): ArticleSeoTranslation[] {
  return row.article_translations.flatMap((translation) =>
    isLocale(translation.locale)
      ? [{
          locale: translation.locale,
          title: translation.title,
          summary: translation.summary,
          metaDescription: translation.meta_description,
          content: translation.content,
        }]
      : [],
  )
}

function indexableLocalesFor(row: ArticleSeoRow): Locale[] {
  return indexableArticleLocales(seoTranslations(row), row.is_coupon)
}

export const getIndexableArticleLocales = cache(
  async (url: string): Promise<Locale[]> => {
    const row = (await getArticleSeoRows()).find((article) => article.url === url)
    return row ? indexableLocalesFor(row) : []
  },
)

export const getIndexableCategoryLocales = cache(
  async (category: DbCategory): Promise<Locale[]> => {
    const found = new Set<Locale>()
    for (const row of await getArticleSeoRows()) {
      if (row.category !== category) continue
      for (const locale of indexableLocalesFor(row)) found.add(locale)
    }
    return LOCALES.filter((locale) => found.has(locale))
  },
)

export async function getPublishedForSitemap() {
  return (await getArticleSeoRows()).flatMap((row) => {
    const locales = indexableLocalesFor(row)
    return locales.length > 0
      ? [{
          url: row.url,
          category: row.category,
          lastmod: row.edit_at ?? row.updated_at ?? row.published_at,
          locales,
        }]
      : []
  })
}

export async function getStaticArticleParams(): Promise<
  Array<{ locale: Locale; category: string; url: string }>
> {
  const out: Array<{ locale: Locale; category: string; url: string }> = []
  for (const row of await getArticleSeoRows()) {
    if (row.end_at !== null) continue
    const category = toUrlCategory(row.category)
    if (!category) continue
    for (const locale of indexableLocalesFor(row)) {
      out.push({ locale, category, url: row.url })
    }
  }
  return out
}
```

- [ ] **Step 4: Make article metadata consume the decision**

In `apps/web/lib/seo/metadata.ts`, import the decision type:

```ts
import type { ArticleIndexingDecision } from '@/lib/seo/article-indexability'
```

Replace `ArticleMetaInput` and `buildArticleMetadata` with:

```ts
export interface ArticleMetaInput {
  urlCategory: UrlCategory
  url: string
  locale: Locale
  resolvedLocale: Locale
  indexing: ArticleIndexingDecision
  title: string | null
  metaTitle: string | null
  summary: string | null
  metaDescription: string | null
  ogImage: string | null
  publishedAt: string | null
  editAt: string | null
}

export function buildArticleMetadata(i: ArticleMetaInput): Metadata {
  const heading = i.metaTitle ?? i.title ?? ''
  const description =
    (i.metaDescription && i.metaDescription.trim()) || i.summary || ''
  const canonical = i.indexing.canonicalLocale
    ? articlePath(i.indexing.canonicalLocale, i.urlCategory, i.url)
    : null
  const languages = Object.fromEntries(
    i.indexing.alternateLocales.map((locale) => [
      locale,
      articlePath(locale, i.urlCategory, i.url),
    ]),
  ) as Record<string, string>
  if (canonical && i.indexing.canonicalLocale) {
    languages['x-default'] = articlePath(
      i.indexing.alternateLocales.includes(DEFAULT_LOCALE)
        ? DEFAULT_LOCALE
        : i.indexing.canonicalLocale,
      i.urlCategory,
      i.url,
    )
  }
  const pageUrl = articlePath(i.locale, i.urlCategory, i.url)
  return {
    title: heading,
    description,
    alternates: canonical
      ? { canonical, languages }
      : undefined,
    openGraph: {
      type: 'article',
      url: canonical ?? pageUrl,
      title: heading,
      description,
      images: i.ogImage ? [i.ogImage] : [],
      publishedTime: i.publishedAt ?? undefined,
      modifiedTime: i.editAt ?? i.publishedAt ?? undefined,
      locale: OG_LOCALE[i.resolvedLocale],
    },
    robots: {
      index: i.indexing.index,
      follow: true,
      'max-image-preview': 'large',
    },
  }
}
```

- [ ] **Step 5: Update article detail metadata and canonical facts**

In `apps/web/app/[locale]/articles/[category]/[url]/page.tsx`:

```ts
import {
  getArticleDetail,
  getIndexableArticleLocales,
  getYouMayLike,
  getStaticArticleParams,
} from '@/lib/articles/queries'
import { resolveArticleIndexing } from '@/lib/seo/article-indexability'
```

Replace `generateMetadata` with:

```ts
export async function generateMetadata(
  { params }: { params: Params },
): Promise<Metadata> {
  const { locale, category, url } = await params
  if (!isLocale(locale) || !toDbCategory(category)) return {}
  const [article, indexableLocales] = await Promise.all([
    getArticleDetail(category, url, locale),
    getIndexableArticleLocales(url),
  ])
  if (!article?.translation || !isLocale(article.translation.locale)) return {}
  const indexing = resolveArticleIndexing({
    requestedLocale: locale,
    resolvedLocale: article.translation.locale,
    indexableLocales,
  })
  const approvedOgImage = [
    article.translation.og_image,
    article.thumbnails[0],
  ].find(isApprovedEntityMediaUrl) ?? null
  return buildArticleMetadata({
    urlCategory: category,
    url,
    locale,
    resolvedLocale: article.translation.locale,
    indexing,
    title: article.translation.title,
    metaTitle: article.translation.meta_title,
    summary: article.translation.summary,
    metaDescription: article.translation.meta_description,
    ogImage: approvedOgImage,
    publishedAt: article.published_at,
    editAt: article.edit_at,
  })
}
```

In `ArticleDetailPage`, load indexability with the article:

```ts
const [a, indexableLocales] = await Promise.all([
  getArticleDetail(category, url, loc),
  getIndexableArticleLocales(url),
])
if (!a?.translation || !isLocale(a.translation.locale)) notFound()
const indexing = resolveArticleIndexing({
  requestedLocale: loc,
  resolvedLocale: a.translation.locale,
  indexableLocales,
})
const canonicalLocale = indexing.canonicalLocale ?? loc
const canonical =
  `${SITE_URL}/${canonicalLocale}/articles/${category}/${url}`
```

Keep the page body readable for `indexing.index === false`. Task 5 will use
the same `indexing` value to gate FAQ schema.

- [ ] **Step 6: Run the article-policy/query/metadata tests**

Run:

```powershell
pnpm --filter web exec vitest run tests/article-indexability.test.ts tests/queries.detail.test.ts tests/metadata.test.ts tests/articles.public-media.host.test.tsx
pnpm --filter web typecheck
```

Expected: all named tests pass and TypeScript exits 0.

- [ ] **Step 7: Commit article query and metadata wiring**

```powershell
git add apps/web/lib/articles/queries.ts apps/web/lib/seo/metadata.ts apps/web/app/[locale]/articles/[category]/[url]/page.tsx apps/web/tests/queries.detail.test.ts apps/web/tests/metadata.test.ts apps/web/tests/articles.public-media.host.test.tsx
git commit -m "feat(web): align article metadata with indexability"
```

---

### Task 3: Localize Marketplace Listing Metadata and Empty Categories

**Files:**
- Create: `apps/web/tests/articles.metadata-state.test.ts`
- Modify: `apps/web/lib/seo/metadata.ts`
- Modify: `apps/web/app/[locale]/articles/page.tsx`
- Modify: `apps/web/app/[locale]/articles/[category]/page.tsx`
- Modify: all seven `apps/web/lib/i18n/messages/*.ts` locale files listed in File Structure
- Modify: `apps/web/tests/metadata.test.ts`
- Modify: `apps/web/tests/i18n.locale-parity.test.ts`

**Interfaces:**
- Consumes: `getIndexableCategoryLocales(category: DbCategory)` from Task 2.
- Extends:

```ts
export interface ListingMetaInput {
  urlCategory: UrlCategory | null
  locale: Locale
  presentLocales: readonly Locale[]
  title: string
  description: string
  index?: boolean
}
```

- Adds the same dictionary shape to every locale:

```ts
seo.articles: {
  title: string
  descriptionBookingLive: string
  descriptionBookingWaitlist: string
}
```

- [ ] **Step 1: Add failing listing-builder and route-state tests**

In `apps/web/tests/metadata.test.ts`, replace listing calls so they pass a
description and add:

```ts
it('adds listing description, OG, Twitter, and explicit noindex state', () => {
  const metadata = buildListingMetadata({
    urlCategory: 'shopping',
    locale: 'ja',
    presentLocales: ['en', 'ja'],
    title: 'Shopping',
    description: 'Trusted recommendations.',
    index: false,
  })
  expect(metadata.description).toBe('Trusted recommendations.')
  expect((metadata.robots as { index: boolean }).index).toBe(false)
  expect((metadata.openGraph as { images: string[] }).images).toEqual([
    `${SITE_URL}/ja/opengraph-image`,
  ])
  expect((metadata.twitter as { card: string }).card).toBe(
    'summary_large_image',
  )
  expect(Object.keys(
    metadata.alternates?.languages as Record<string, string>,
  ).sort()).toEqual(['en', 'ja', 'x-default'])
})
```

Create `apps/web/tests/articles.metadata-state.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  productStateMock,
  indexableCategoryLocalesMock,
} = vi.hoisted(() => ({
  productStateMock: vi.fn(),
  indexableCategoryLocalesMock: vi.fn(),
}))

vi.mock('@/lib/product-state', () => ({
  resolveConfiguredProductState: productStateMock,
}))
vi.mock('@/lib/articles/queries', () => ({
  searchArticles: vi.fn(),
  getIndexableCategoryLocales: indexableCategoryLocalesMock,
}))

import { generateMetadata as hubMetadata } from '@/app/[locale]/articles/page'
import { generateMetadata as categoryMetadata } from '@/app/[locale]/articles/[category]/page'
import en from '@/lib/i18n/messages/en'

beforeEach(() => {
  productStateMock.mockReturnValue({ bookingLive: false })
  indexableCategoryLocalesMock.mockResolvedValue(['en', 'zh-hk'])
})

describe('/articles metadata state', () => {
  it('uses marketplace title and waitlist-safe description when booking is off', async () => {
    const metadata = await hubMetadata({
      params: Promise.resolve({ locale: 'en' }),
    })
    expect(metadata.title).toBe(en.seo.articles.title)
    expect(metadata.description).toBe(
      en.seo.articles.descriptionBookingWaitlist,
    )
    expect(metadata.description).not.toMatch(/brand missions|affiliate|copilot/i)
    expect(metadata.description).not.toMatch(/bookable/i)
  })

  it('uses the booking-live description only when booking is live', async () => {
    productStateMock.mockReturnValue({ bookingLive: true })
    const metadata = await hubMetadata({
      params: Promise.resolve({ locale: 'en' }),
    })
    expect(metadata.description).toBe(
      en.seo.articles.descriptionBookingLive,
    )
    expect(metadata.description).toMatch(/bookable/i)
  })

  it('noindexes an empty locale/category and advertises only populated locales', async () => {
    const metadata = await categoryMetadata({
      params: Promise.resolve({ locale: 'ja', category: 'dining' }),
    })
    expect((metadata.robots as { index: boolean }).index).toBe(false)
    expect(Object.keys(
      metadata.alternates?.languages as Record<string, string>,
    ).sort()).toEqual(['en', 'x-default', 'zh-hk'])
  })
})
```

- [ ] **Step 2: Run the tests and verify the new locale key/interface fails**

Run:

```powershell
pnpm --filter web exec vitest run tests/metadata.test.ts tests/articles.metadata-state.test.ts tests/i18n.locale-parity.test.ts
```

Expected: FAIL because `seo.articles`, listing descriptions, and category
locale decisions are not implemented.

- [ ] **Step 3: Add exact marketplace copy to all seven locale dictionaries**

Add this type to the English `Messages['seo']` interface:

```ts
articles: {
  title: string
  descriptionBookingLive: string
  descriptionBookingWaitlist: string
}
```

Add these exact values:

```ts
// en
articles: {
  title: 'Travel guides, experiences and local recommendations',
  descriptionBookingLive:
    'Discover creator-led travel guides, bookable local experiences, live sessions and trusted recommendations across Asia.',
  descriptionBookingWaitlist:
    'Discover creator-led travel guides, local experiences, live sessions and trusted recommendations across Asia.',
},

// zh-hk
articles: {
  title: '旅遊攻略、體驗同本地推介',
  descriptionBookingLive:
    '發掘創作者主理嘅旅遊攻略、可預訂本地體驗、直播活動，同亞洲各地值得信賴嘅推介。',
  descriptionBookingWaitlist:
    '發掘創作者主理嘅旅遊攻略、本地體驗、直播活動，同亞洲各地值得信賴嘅推介。',
},

// zh-tw
articles: {
  title: '旅遊攻略、體驗與在地推薦',
  descriptionBookingLive:
    '探索創作者策劃的旅遊攻略、可預訂的在地體驗、直播活動，以及亞洲各地值得信賴的推薦。',
  descriptionBookingWaitlist:
    '探索創作者策劃的旅遊攻略、在地體驗、直播活動，以及亞洲各地值得信賴的推薦。',
},

// ja
articles: {
  title: '旅行ガイド、体験、現地のおすすめ',
  descriptionBookingLive:
    'クリエイター発の旅行ガイド、予約できる現地体験、ライブセッション、アジア各地の信頼できるおすすめを見つけましょう。',
  descriptionBookingWaitlist:
    'クリエイター発の旅行ガイド、現地体験、ライブセッション、アジア各地の信頼できるおすすめを見つけましょう。',
},

// ko
articles: {
  title: '여행 가이드, 체험, 현지 추천',
  descriptionBookingLive:
    '크리에이터가 만든 여행 가이드, 예약 가능한 현지 체험, 라이브 세션과 아시아 전역의 믿을 만한 추천을 만나보세요.',
  descriptionBookingWaitlist:
    '크리에이터가 만든 여행 가이드, 현지 체험, 라이브 세션과 아시아 전역의 믿을 만한 추천을 만나보세요.',
},

// th
articles: {
  title: 'ไกด์ท่องเที่ยว ประสบการณ์ และคำแนะนำจากคนท้องถิ่น',
  descriptionBookingLive:
    'ค้นพบไกด์จากครีเอเตอร์ ประสบการณ์ท้องถิ่นที่จองได้ เซสชันสด และคำแนะนำที่เชื่อถือได้ทั่วเอเชีย',
  descriptionBookingWaitlist:
    'ค้นพบไกด์จากครีเอเตอร์ ประสบการณ์ท้องถิ่น เซสชันสด และคำแนะนำที่เชื่อถือได้ทั่วเอเชีย',
},

// zh-cn
articles: {
  title: '旅行攻略、体验与本地推荐',
  descriptionBookingLive:
    '探索创作者策划的旅行攻略、可预订的本地体验、直播活动，以及亚洲各地值得信赖的推荐。',
  descriptionBookingWaitlist:
    '探索创作者策划的旅行攻略、本地体验、直播活动，以及亚洲各地值得信赖的推荐。',
},
```

- [ ] **Step 4: Enrich `buildListingMetadata`**

Replace `ListingMetaInput` and `buildListingMetadata` in
`apps/web/lib/seo/metadata.ts`:

```ts
export interface ListingMetaInput {
  urlCategory: UrlCategory | null
  locale: Locale
  presentLocales: readonly Locale[]
  title: string
  description: string
  index?: boolean
}

export function buildListingMetadata(i: ListingMetaInput): Metadata {
  const segment = i.urlCategory
    ? `/articles/${i.urlCategory}`
    : '/articles'
  const { canonical, languages } = hreflangFor(
    (locale) => abs(locale, segment),
    i.locale,
    i.presentLocales,
  )
  const ogImage = defaultOgImagePath(i.locale)
  return {
    title: i.title,
    description: i.description,
    alternates: {
      canonical,
      languages: i.presentLocales.length > 0 ? languages : {},
    },
    openGraph: {
      type: 'website',
      url: canonical,
      title: i.title,
      description: i.description,
      siteName: 'KINNSO',
      locale: OG_LOCALE[i.locale],
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: i.title,
      description: i.description,
      images: [ogImage],
    },
    robots: {
      index: i.index ?? true,
      follow: true,
      'max-image-preview': 'large',
    },
  }
}
```

- [ ] **Step 5: Update hub and category metadata adapters**

In `apps/web/app/[locale]/articles/page.tsx`, import
`resolveConfiguredProductState` and replace `generateMetadata`:

```ts
export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const [dict, { bookingLive }] = await Promise.all([
    getDictionary(locale),
    Promise.resolve(resolveConfiguredProductState()),
  ])
  return buildListingMetadata({
    urlCategory: null,
    locale,
    presentLocales: LOCALES,
    title: dict.seo.articles.title,
    description: bookingLive
      ? dict.seo.articles.descriptionBookingLive
      : dict.seo.articles.descriptionBookingWaitlist,
  })
}
```

In `apps/web/app/[locale]/articles/[category]/page.tsx`, import
`getIndexableCategoryLocales` and replace `generateMetadata`:

```ts
export async function generateMetadata(
  { params }: { params: Params },
): Promise<Metadata> {
  const { locale, category } = await params
  const dbCategory = toDbCategory(category)
  if (!isLocale(locale) || !dbCategory) return {}
  const [dict, presentLocales] = await Promise.all([
    getDictionary(locale),
    getIndexableCategoryLocales(dbCategory),
  ])
  return buildListingMetadata({
    urlCategory: category as UrlCategory,
    locale,
    presentLocales,
    title: dict.categories[category as UrlCategory],
    description: dict.seo.articles.descriptionBookingWaitlist,
    index: presentLocales.includes(locale),
  })
}
```

Category descriptions deliberately avoid “bookable” because a category page
does not read feature state and its article inventory is useful in either
state.

- [ ] **Step 6: Run locale and metadata tests**

Run:

```powershell
pnpm --filter web exec vitest run tests/metadata.test.ts tests/articles.metadata-state.test.ts tests/i18n.locale-parity.test.ts
pnpm --filter web typecheck
```

Expected: all named tests pass and TypeScript exits 0.

- [ ] **Step 7: Commit localized listing metadata**

```powershell
git add apps/web/lib/seo/metadata.ts apps/web/app/[locale]/articles/page.tsx apps/web/app/[locale]/articles/[category]/page.tsx apps/web/lib/i18n/messages apps/web/tests/metadata.test.ts apps/web/tests/articles.metadata-state.test.ts apps/web/tests/i18n.locale-parity.test.ts
git commit -m "feat(web): localize marketplace article metadata"
```

---

### Task 4: Filter Sitemap Entries and Teach the Crawler `noindex`

**Files:**
- Modify: `apps/web/app/sitemap.ts`
- Modify: `apps/web/tests/sitemap.test.ts`
- Modify: `apps/web/tests/sitemap.guides-creators.test.ts`
- Modify: `scripts/crawl-sitemap.ts`
- Modify: `apps/web/tests/crawl-sitemap.test.ts`

**Interfaces:**
- Consumes: `getPublishedForSitemap()` indexable `locales` from Task 2.
- Extends `CrawlFailure.error` values with `Redirect` and `HtmlNoindex`.
- `crawlSitemap` still returns:

```ts
export type CrawlSitemapResult = {
  checked: number
  failures: CrawlFailure[]
}
```

- [ ] **Step 1: Add failing sitemap inclusion tests**

In `apps/web/tests/sitemap.guides-creators.test.ts`, change the mocked articles:

```ts
getPublishedForSitemap: async () => [
  {
    url: 'ramen',
    category: 'dining',
    lastmod: '2026-06-01T00:00:00Z',
    locales: ['en', 'zh-hk'],
  },
  {
    url: 'market',
    category: 'shopping',
    lastmod: null,
    locales: ['zh-hk'],
  },
],
```

Add:

```ts
it('emits category routes only for locale/category pairs with indexable articles', async () => {
  const urls = (await sitemap()).map((entry) => entry.url)
  expect(urls).toContain(`${SITE}/en/articles/dining`)
  expect(urls).toContain(`${SITE}/zh-hk/articles/dining`)
  expect(urls).toContain(`${SITE}/zh-hk/articles/shopping`)
  expect(urls).not.toContain(`${SITE}/en/articles/shopping`)
  expect(urls).not.toContain(`${SITE}/ja/articles/dining`)
})
```

In `apps/web/tests/sitemap.test.ts`, retain the hub assertion and add:

```ts
expect(urls).not.toContain('https://www.kinnso.ai/en/articles/shopping')
expect(urls.every((url) => !url.includes('/articles/dining/sushi-guide'))).toBe(true)
```

- [ ] **Step 2: Add failing crawler redirect/noindex tests**

Append to `apps/web/tests/crawl-sitemap.test.ts`:

```ts
it('reports a followed redirect from a submitted sitemap URL', async () => {
  const pageUrl = 'https://example.test/en/g/old-guide'
  const redirected = pageResponse(200)
  Object.defineProperty(redirected, 'redirected', { value: true })
  const result = await crawlSitemap({
    baseUrl: 'https://example.test',
    fetchImpl: async (input) =>
      String(input) === sitemapUrl
        ? xmlResponse(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`)
        : redirected,
  })
  expect(result.failures).toEqual([{ url: pageUrl, error: 'Redirect' }])
})

it('reports HTML meta robots noindex without logging the page body', async () => {
  const pageUrl = 'https://example.test/en/articles/dining/thin'
  const body =
    '<html><head><meta name="robots" content="follow, noindex"></head>' +
    '<body>private article text</body></html>'
  const result = await crawlSitemap({
    baseUrl: 'https://example.test',
    fetchImpl: async (input) =>
      String(input) === sitemapUrl
        ? xmlResponse(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`)
        : pageResponse(200, body),
  })
  expect(result.failures).toEqual([{ url: pageUrl, error: 'HtmlNoindex' }])
  expect(JSON.stringify(result)).not.toContain('private article text')
})

it('reports an X-Robots-Tag noindex response', async () => {
  const pageUrl = 'https://example.test/en/articles/shopping/thin'
  const result = await crawlSitemap({
    baseUrl: 'https://example.test',
    fetchImpl: async (input) => {
      if (String(input) === sitemapUrl) {
        return xmlResponse(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`)
      }
      return new Response('<html>ok</html>', {
        status: 200,
        headers: { 'x-robots-tag': 'noindex, follow' },
      })
    },
  })
  expect(result.failures).toEqual([{ url: pageUrl, error: 'HtmlNoindex' }])
})
```

- [ ] **Step 3: Run sitemap/crawler tests and verify they fail**

Run:

```powershell
pnpm --filter web exec vitest run tests/sitemap.test.ts tests/sitemap.guides-creators.test.ts tests/crawl-sitemap.test.ts
```

Expected: FAIL because empty category URLs are still unconditional and the
crawler does not detect redirects/noindex.

- [ ] **Step 4: Filter category sitemap entries from article decisions**

In `apps/web/app/sitemap.ts`, immediately after creating `out`:

```ts
const populatedArticleCategories = new Set<string>()
for (const article of articles) {
  const category = toUrlCategory(article.category)
  if (!category) continue
  for (const locale of article.locales) {
    populatedArticleCategories.add(`${locale}:${category}`)
  }
}
```

Replace the unconditional category loop:

```ts
for (const category of URL_CATEGORIES) {
  if (!populatedArticleCategories.has(`${l}:${category}`)) continue
  out.push({
    url: `${SITE_URL}/${l}/articles/${category}`,
    changeFrequency: 'daily',
    priority: 0.6,
  })
}
```

Leave the `/articles` hub unconditional and keep entity locale fan-out and
deterministic ordering unchanged.

- [ ] **Step 5: Add crawler redirect/noindex detection**

In `scripts/crawl-sitemap.ts`, add:

```ts
function hasHtmlNoindex(body: string): boolean {
  for (const tag of body.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /\bname=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase()
    const content =
      /\bcontent=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? ''
    if ((name === 'robots' || name === 'googlebot') &&
        /(?:^|[\s,])noindex(?:$|[\s,])/.test(content)) {
      return true
    }
  }
  return false
}
```

In the page worker, after `fetchImpl` resolves and before status/body checks:

```ts
if (response.redirected) {
  pageFailures[index] = { url, error: 'Redirect' }
  continue
}
const xRobotsTag = response.headers.get('x-robots-tag')?.toLowerCase() ?? ''
if (/(?:^|[\s,])noindex(?:$|[\s,])/.test(xRobotsTag)) {
  pageFailures[index] = { url, error: 'HtmlNoindex' }
  continue
}
```

After the body is read and before `isBrandedErrorShell`:

```ts
if (hasHtmlNoindex(body)) {
  pageFailures[index] = { url, error: 'HtmlNoindex' }
} else if (isBrandedErrorShell(body)) {
  pageFailures[index] = { url, error: 'HtmlErrorShell' }
}
```

- [ ] **Step 6: Run sitemap/crawler tests and typecheck**

Run:

```powershell
pnpm --filter web exec vitest run tests/sitemap.test.ts tests/sitemap.guides-creators.test.ts tests/crawl-sitemap.test.ts
pnpm --filter web typecheck
```

Expected: all named tests pass and TypeScript exits 0.

- [ ] **Step 7: Commit sitemap hygiene**

```powershell
git add apps/web/app/sitemap.ts apps/web/tests/sitemap.test.ts apps/web/tests/sitemap.guides-creators.test.ts scripts/crawl-sitemap.ts apps/web/tests/crawl-sitemap.test.ts
git commit -m "feat(seo): exclude noindex URLs from sitemap"
```

---

### Task 5: Harden Product, Event, FAQ, and Rating JSON-LD

**Files:**
- Modify: `apps/web/lib/seo/jsonld.ts`
- Modify: `apps/web/app/[locale]/experiences/[slug]/page.tsx`
- Modify: `apps/web/app/[locale]/articles/[category]/[url]/page.tsx`
- Modify: `apps/web/tests/jsonld.test.ts`
- Modify: `apps/web/tests/seo.jsonld.test.ts`
- Modify: `apps/web/tests/articles.public-media.host.test.tsx`

**Interfaces:**
- Extends:

```ts
export function faqJsonLd(
  faqs: Array<{ question: string; answer: string }>,
): Record<string, unknown> | null

export function experienceOfferJsonLd(input: {
  name: string
  description: string
  url: string
  image: string | null
  priceAmount: number
  currency: string
  available: boolean
  rating?: { average: number; count: number }
}): Record<string, unknown>
```

- `articleJsonLd` keeps its signature but ignores rating objects with
  non-positive counts.
- `sessionEventJsonLd` keeps its signature and honest status mapping.

- [ ] **Step 1: Write failing JSON-LD tests**

In `apps/web/tests/jsonld.test.ts`, replace the FAQ test and experience tests
with assertions that include:

```ts
it('filters empty FAQ rows and returns null when none remain', () => {
  const ld = faqJsonLd([
    { question: '  Q1? ', answer: ' A1 ' },
    { question: ' ', answer: 'hidden' },
    { question: 'hidden', answer: '' },
  ])
  expect((ld?.mainEntity as unknown[])).toEqual([{
    '@type': 'Question',
    name: 'Q1?',
    acceptedAnswer: { '@type': 'Answer', text: 'A1' },
  }])
  expect(faqJsonLd([{ question: ' ', answer: ' ' }])).toBeNull()
})

it('emits major-unit price and InStock only for actual open booking', () => {
  const ld = experienceOfferJsonLd({
    name: 'Tokyo night',
    description: 'Izakaya crawl.',
    url: 'https://x/en/experiences/tokyo-night',
    image: null,
    priceAmount: 12000,
    currency: 'JPY',
    available: true,
  })
  expect(ld.offers).toEqual({
    '@type': 'Offer',
    url: 'https://x/en/experiences/tokyo-night',
    priceCurrency: 'JPY',
    price: 12000,
    availability: 'https://schema.org/InStock',
  })
})

it('uses OutOfStock when booking is disabled or availability fails closed', () => {
  const ld = experienceOfferJsonLd({
    name: 'Tokyo night',
    description: 'Izakaya crawl.',
    url: 'https://x/en/experiences/tokyo-night',
    image: null,
    priceAmount: 12000,
    currency: 'JPY',
    available: false,
  })
  expect((ld.offers as { availability: string }).availability).toBe(
    'https://schema.org/OutOfStock',
  )
})

it('omits aggregateRating when count is zero', () => {
  const article = articleJsonLd({
    headline: 'x',
    description: 'y',
    url: 'u',
    images: [],
    publishedAt: null,
    modifiedAt: null,
    authorName: null,
    locale: 'en',
    rating: { average: 5, count: 0 },
  })
  const experience = experienceOfferJsonLd({
    name: 'x',
    description: 'y',
    url: 'u',
    image: null,
    priceAmount: 1,
    currency: 'HKD',
    available: true,
    rating: { average: 5, count: 0 },
  })
  expect(article.aggregateRating).toBeUndefined()
  expect(experience.aggregateRating).toBeUndefined()
})
```

In `apps/web/tests/seo.jsonld.test.ts`, add:

```ts
it.each(['scheduled', 'live', 'ended'] as const)(
  'maps %s to EventScheduled',
  (status) => {
    const ld = sessionEventJsonLd({
      name: 'A',
      description: 'B',
      url: 'https://x/en/sessions/a',
      startDate: '2027-01-15T18:00:00.000Z',
      status,
      embedUrl: null,
      hostName: null,
    })
    expect(ld.eventStatus).toBe('https://schema.org/EventScheduled')
  },
)
```

- [ ] **Step 2: Run JSON-LD tests and verify the new contracts fail**

Run:

```powershell
pnpm --filter web exec vitest run tests/jsonld.test.ts tests/seo.jsonld.test.ts tests/articles.public-media.host.test.tsx
```

Expected: FAIL because `available` is absent, FAQ rows are not filtered, and
zero-count ratings are still emitted.

- [ ] **Step 3: Harden JSON-LD helpers**

In `apps/web/lib/seo/jsonld.ts`:

```ts
const hasRealRating = (
  rating: { average: number; count: number } | undefined,
): rating is { average: number; count: number } =>
  Boolean(
    rating &&
    Number.isFinite(rating.average) &&
    Number.isFinite(rating.count) &&
    rating.count > 0,
  )
```

Use `if (hasRealRating(i.rating))` in both `articleJsonLd` and
`experienceOfferJsonLd`.

Replace `faqJsonLd`:

```ts
export function faqJsonLd(
  faqs: Array<{ question: string; answer: string }>,
): Record<string, unknown> | null {
  const visible = faqs.flatMap((faq) => {
    const question = faq.question.trim()
    const answer = faq.answer.trim()
    return question && answer ? [{ question, answer }] : []
  })
  if (visible.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: visible.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  }
}
```

Replace `experienceOfferJsonLd`:

```ts
export function experienceOfferJsonLd(i: {
  name: string
  description: string
  url: string
  image: string | null
  priceAmount: number
  currency: string
  available: boolean
  rating?: { average: number; count: number }
}): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: i.name,
    description: i.description,
    offers: {
      '@type': 'Offer',
      url: i.url,
      priceCurrency: i.currency,
      price: i.priceAmount,
      availability: i.available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  }
  if (i.image) ld.image = i.image
  if (hasRealRating(i.rating)) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: i.rating.average,
      reviewCount: i.rating.count,
    }
  }
  return ld
}
```

- [ ] **Step 4: Always emit honest Product/Offer from the experience page**

In `apps/web/app/[locale]/experiences/[slug]/page.tsx`, replace the conditional
Product spread inside `optionalValue`:

```ts
experienceOfferJsonLd({
  name: experience.title,
  description:
    experience.summary ??
    experience.description ??
    `${experience.city} experience`,
  url: canonical,
  image: approvedCover,
  priceAmount: experience.priceAmount,
  currency: experience.currency,
  available: bookingLive && hasOpenAvailability,
  rating: rating ?? undefined,
}),
```

The array always contains BreadcrumbList and Product. `optionalQuery` already
returns `[]` when availability fails, so `hasOpenAvailability` is false and
the Offer becomes `OutOfStock`.

- [ ] **Step 5: Gate FAQ schema with the article indexing decision**

In `ArticleDetailPage`, replace:

```ts
if (a.faqs.length) ld.push(faqJsonLd(a.faqs))
```

with:

```ts
const faqLd = indexing.index ? faqJsonLd(a.faqs) : null
if (faqLd) ld.push(faqLd)
```

Keep the visible FAQ section unchanged; only search schema is gated.
Pass `a.translation.locale` to `articleJsonLd.inLanguage`, not the requested
fallback locale:

```ts
locale: a.translation.locale,
```

- [ ] **Step 6: Run JSON-LD and host tests**

Run:

```powershell
pnpm --filter web exec vitest run tests/jsonld.test.ts tests/seo.jsonld.test.ts tests/articles.public-media.host.test.tsx
pnpm --filter web typecheck
```

Expected: all named tests pass and TypeScript exits 0.

- [ ] **Step 7: Commit structured-data hardening**

```powershell
git add apps/web/lib/seo/jsonld.ts apps/web/app/[locale]/experiences/[slug]/page.tsx apps/web/app/[locale]/articles/[category]/[url]/page.tsx apps/web/tests/jsonld.test.ts apps/web/tests/seo.jsonld.test.ts apps/web/tests/articles.public-media.host.test.tsx
git commit -m "feat(seo): harden public structured data"
```

---

### Task 6: Rendered Locale/OG Parity and Release Evidence

**Files:**
- Modify: `packages/parity/src/checks/structured-data.ts`
- Modify: `packages/parity/tests/structured-data.test.ts`
- Modify: `apps/web/tests/metadata.test.ts`
- Modify: `apps/web/tests/seo.public-og-media.test.ts`
- Modify: `apps/e2e/fixtures.ts`
- Modify: `apps/e2e/specs/seo.spec.ts`


**Interfaces:**
- Article parity requires the actual `hreflang` key set to equal, not merely
  contain, `publishedArticle.locales + x-default`.
- Public marketing/entity metadata builders expose all seven locales plus
  `x-default`.
- Guide and experience OG endpoints are the existing colocated routes.

- [ ] **Step 1: Tighten article parity with a failing extra-locale case**

In `packages/parity/src/checks/structured-data.ts`, change the comparison target
from subset-only to exact equality. First add this failing test to
`packages/parity/tests/structured-data.test.ts`:

```ts
it('fails when hreflang advertises a locale absent from genuine translations', async () => {
  const html = GOOD_HTML.replace(
    '<link rel="alternate" hreflang="x-default"',
    '<link rel="alternate" hreflang="ja" href="https://x/ja/articles/dining/ramen-guide"/>' +
    '<link rel="alternate" hreflang="x-default"',
  )
  const result = await structuredData({
    legacy,
    newstack: fakeNewstack(
      {
        '/en/articles/dining/ramen-guide': html,
        '/zh-hk/articles/dining/ramen-guide': html,
      },
      [{
        url: 'ramen-guide',
        category: 'dining',
        isCoupon: false,
        locales: ['en', 'zh-hk'],
      }],
    ),
    sample: 1,
  })
  expect(result.find((row) => row.target.endsWith('hreflang'))?.status).toBe(
    'fail',
  )
})
```

Run:

```powershell
pnpm --filter @kinnso/parity exec vitest run tests/structured-data.test.ts
```

Expected: FAIL because the current check accepts extra locales.

- [ ] **Step 2: Implement exact article alternate parity**

Replace the `reciprocal` calculation in
`packages/parity/src/checks/structured-data.ts`:

```ts
const exactAlternates =
  got.size === expected.size &&
  [...expected].every((locale) => got.has(locale))
push(
  'hreflang',
  exactAlternates,
  `expected ${[...expected].sort().join(',')} got ` +
    `${[...got].sort().join(',') || '(none)'}`,
)
```

Run the parity test again. Expected: PASS.

- [ ] **Step 3: Complete metadata-builder and OG route matrix tests**

In `apps/web/tests/metadata.test.ts`, import
`buildMerchantMetadata`, `buildExperienceMetadata`, and
`buildSessionMetadata`. Add:

```ts
it.each([
  ['merchant', buildMerchantMetadata({
    slug: 'acme',
    locale: 'en',
    name: 'Acme',
    tagline: 'Local tours',
  })],
  ['experience', buildExperienceMetadata({
    slug: 'night-tour',
    locale: 'en',
    title: 'Night tour',
    description: 'Local experience',
  })],
  ['session', buildSessionMetadata({
    slug: 'ramen-ama',
    locale: 'en',
    title: 'Ramen AMA',
    description: 'Live questions',
  })],
] as const)(
  '%s metadata has all seven locale alternates and a non-empty description',
  (_kind, metadata) => {
    expect(metadata.description).toBeTruthy()
    expect(Object.keys(
      metadata.alternates?.languages as Record<string, string>,
    ).sort()).toEqual([...LOCALES, 'x-default'].sort())
    expect((metadata.robots as { index: boolean }).index).toBe(true)
  },
)
```

The existing `apps/web/tests/seo.public-og-media.test.ts` already exercises the
guide and experience OG handlers. Add an assertion to the approved-CDN test:

```ts
expect(imageResponseMock).toHaveBeenCalledTimes(2)
```

Run:

```powershell
pnpm --filter web exec vitest run tests/metadata.test.ts tests/seo.public-og-media.test.ts
```

Expected: PASS.

- [ ] **Step 4: Add stable E2E fixture paths and rendered assertions**

Add to `apps/e2e/fixtures.ts`:

```ts
seoEntities: {
  guidePath: '/en/g/r7-smoke-tokyo-guide',
  experiencePath: '/en/experiences/r7-smoke-tokyo-experience',
},
```

Append helpers and tests to `apps/e2e/specs/seo.spec.ts`:

```ts
const jsonLd = async (page: import('@playwright/test').Page) =>
  (await page.locator('script[type="application/ld+json"]').allTextContents())
    .flatMap((text) => {
      const parsed = JSON.parse(text)
      return Array.isArray(parsed) ? parsed : [parsed]
    })

test('public guide has seven-locale parity and a rendered OG image', async ({ page, request }) => {
  await page.goto(FIXTURES.seoEntities.guidePath)
  for (const locale of ['en', 'zh-hk', 'zh-tw', 'ja', 'ko', 'th', 'zh-cn']) {
    await expect(
      page.locator(`link[rel="alternate"][hreflang="${locale}"]`),
    ).toHaveCount(1)
  }
  expect((await jsonLd(page)).some((item) => item['@type'] === 'Article')).toBe(
    true,
  )
  const og = await request.get(
    `${FIXTURES.seoEntities.guidePath}/opengraph-image`,
  )
  expect(og.ok()).toBe(true)
  expect(og.headers()['content-type']).toContain('image/')
})

test('public experience emits Product/Offer and a rendered OG image', async ({ page, request }) => {
  await page.goto(FIXTURES.seoEntities.experiencePath)
  const product = (await jsonLd(page)).find(
    (item) => item['@type'] === 'Product',
  )
  expect(product?.offers?.price).toBe(12000)
  expect(product?.offers?.priceCurrency).toBe('JPY')
  expect([
    'https://schema.org/InStock',
    'https://schema.org/OutOfStock',
  ]).toContain(product?.offers?.availability)
  const og = await request.get(
    `${FIXTURES.seoEntities.experiencePath}/opengraph-image`,
  )
  expect(og.ok()).toBe(true)
  expect(og.headers()['content-type']).toContain('image/')
})

test('a public session emits Event when a session fixture is available', async ({ page }) => {
  await page.goto('/en/sessions')
  const firstSession = page.locator('a[href^="/en/sessions/"]').first()
  test.skip(
    await firstSession.count() === 0,
    'No public session exists in this environment',
  )
  await firstSession.click()
  expect((await jsonLd(page)).some((item) => item['@type'] === 'Event')).toBe(
    true,
  )
})
```

- [ ] **Step 5: Run the full focused automated verification**

Run:

```powershell
pnpm --filter web exec vitest run tests/article-indexability.test.ts tests/queries.detail.test.ts tests/metadata.test.ts tests/articles.metadata-state.test.ts tests/jsonld.test.ts tests/seo.jsonld.test.ts tests/sitemap.test.ts tests/sitemap.guides-creators.test.ts tests/crawl-sitemap.test.ts tests/i18n.locale-parity.test.ts tests/seo.public-og-media.test.ts
pnpm --filter @kinnso/parity exec vitest run tests/structured-data.test.ts
pnpm --filter web typecheck
pnpm --filter @kinnso/parity typecheck
pnpm --filter @kinnso/e2e typecheck
pnpm --filter web build
```

Expected: every command exits 0. If the local full web suite is run, report
pre-existing Supabase RLS/data failures separately from these focused checks.

- [ ] **Step 6: Run browser SEO and the local sitemap crawl**

With the standard local Supabase stack and web app running:

```powershell
pnpm --filter @kinnso/e2e e2e -- seo
$env:BASE_URL='http://127.0.0.1:3000'
pnpm exec tsx scripts/crawl-sitemap.ts
Remove-Item Env:BASE_URL
```

Expected:

- both article locales pass canonical/FAQ checks;
- guide and experience OG requests return images;
- Product/Offer and conditional Event assertions pass;
- the crawler prints `Checked <N> sitemap URLs`; and
- the crawler exits 0 with no Redirect, HtmlNoindex, HtmlErrorShell, HTTP, or
  NetworkError failures.

- [ ] **Step 7: Commit parity and rendered verification**

```powershell
git add packages/parity/src/checks/structured-data.ts packages/parity/tests/structured-data.test.ts apps/web/tests/metadata.test.ts apps/web/tests/seo.public-og-media.test.ts apps/e2e/fixtures.ts apps/e2e/specs/seo.spec.ts
git commit -m "test(seo): verify rendered metadata parity"
```

- [ ] **Step 8: Verify the deployed preview without mutating production**

After pushing and obtaining the Vercel preview URL:

```powershell
$previewUrl = Read-Host 'Paste the exact Vercel preview URL from the deployment result'
if (-not [Uri]::IsWellFormedUriString($previewUrl, [UriKind]::Absolute)) {
  throw 'The Vercel preview URL must be an absolute URL.'
}
$env:BASE_URL=$previewUrl
pnpm exec tsx scripts/crawl-sitemap.ts
Remove-Item Env:BASE_URL
```

Expected: the crawler exits 0.

Use Google Rich Results Test with public preview/production URLs for:

1. one guide;
2. `r7-smoke-tokyo-experience` or another published experience;
3. `ramen-guide`; and
4. one public session when an environment has one.

Record the exact tested URLs, result status, and UTC timestamp in the PR body.
If there is no public session, state `conditional — no public session available`;
do not create production content or activate a feature.

- [ ] **Step 9: Final branch review**

Run:

```powershell
git diff --check origin/main...HEAD
git status --short
git log --oneline origin/main..HEAD
```

Expected:

- `git diff --check` prints nothing;
- `git status --short` prints nothing; and
- the log contains the design commit plus the six intentional task commits.

Then use `superpowers:requesting-code-review`, address any actionable findings
with `superpowers:receiving-code-review`, rerun the affected verification, push
the branch, and open one ready-for-review R7.8 PR.
