import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { searchArticles } from '@/lib/articles/queries'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { isLocale, URL_CATEGORIES, type Locale, type UrlCategory } from '@/lib/i18n/config'
import { buildListingMetadata } from '@/lib/seo/metadata'
import { ArticleCard } from '@/components/ArticleCard'

export const revalidate = 1800 // 30 min

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildListingMetadata({
    urlCategory: null, locale: locale as Locale,
    presentLocales: ['en', 'zh-hk', 'zh-tw', 'ja', 'ko', 'th', 'zh-cn'],
    title: dict.breadcrumb.articles,
  })
}

export default async function ArticlesHubPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const dict = await getDictionary(loc)

  const sections = await Promise.all(
    URL_CATEGORIES.map(async (c) => ({
      category: c as UrlCategory,
      items: (await searchArticles({ locale: loc, category: c === 'destinations' ? 'destination' : c, perPage: 6 })).items,
    })),
  )

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">{dict.breadcrumb.articles}</h1>
      {sections.map((s) => (
        <section key={s.category} className="mb-10">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-2xl font-bold">{dict.categories[s.category]}</h2>
            <Link href={`/${loc}/articles/${s.category}`} className="text-orange text-sm">→</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.items.map((r) => (
              <ArticleCard key={r.url} href={`/${loc}/articles/${s.category}/${r.url}`}
                           title={r.title ?? ''} thumbnail={r.thumbnails[0]} summary={r.summary} />
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
