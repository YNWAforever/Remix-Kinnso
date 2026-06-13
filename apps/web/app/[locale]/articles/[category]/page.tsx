import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { searchArticles } from '@/lib/articles/queries'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { isLocale, toDbCategory, URL_CATEGORIES, type Locale, type UrlCategory } from '@/lib/i18n/config'
import { buildListingMetadata } from '@/lib/seo/metadata'
import { ArticleCard } from '@/components/ArticleCard'
import { Pagination } from '@/components/Pagination'

export const revalidate = 1800 // 30 min

export function generateStaticParams() {
  return URL_CATEGORIES.map((category) => ({ category }))
}

type Params = Promise<{ locale: string; category: string }>
type Search = Promise<{ page?: string; q?: string; region?: string; tag?: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, category } = await params
  if (!isLocale(locale) || !toDbCategory(category)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildListingMetadata({
    urlCategory: category as UrlCategory, locale: locale as Locale,
    presentLocales: ['en', 'zh-hk', 'zh-tw', 'ja', 'ko', 'th', 'zh-cn'],
    title: dict.categories[category as UrlCategory],
  })
}

export default async function CategoryPage(
  { params, searchParams }: { params: Params; searchParams: Search },
) {
  const { locale, category } = await params
  const sp = await searchParams
  if (!isLocale(locale) || !toDbCategory(category)) notFound()
  const loc = locale as Locale
  const dbCategory = toDbCategory(category)!
  const dict = await getDictionary(loc)
  const page = Math.max(1, Number(sp.page ?? '1') || 1)

  const { items, total, perPage } = await searchArticles({
    locale: loc, category: dbCategory, q: sp.q ?? null,
    region: sp.region ?? null, tag: sp.tag ?? null, page, perPage: 12,
  })

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{dict.categories[category as UrlCategory]}</h1>
      <p className="text-muted mb-6">{total} {dict.listing.resultsCount}</p>

      {items.length === 0 ? (
        <p className="text-muted">{dict.listing.noResults}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => (
            <ArticleCard key={r.url} href={`/${loc}/articles/${category}/${r.url}`}
                         title={r.title ?? ''} thumbnail={r.thumbnails[0]} summary={r.summary} />
          ))}
        </div>
      )}

      <Pagination basePath={`/${loc}/articles/${category}`} page={page} total={total} perPage={perPage}
                  labels={{ prev: dict.pagination.prev, next: dict.pagination.next }} />
    </main>
  )
}
