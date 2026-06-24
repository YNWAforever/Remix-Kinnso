import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getArticleDetail, getPresentLocales, getYouMayLike, getStaticArticleParams } from '@/lib/articles/queries'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { isLocale, toDbCategory, toUrlCategory, type Locale } from '@/lib/i18n/config'
import { buildArticleMetadata, SITE_URL } from '@/lib/seo/metadata'
import { articleJsonLd, faqJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { ArticleBlockRenderer } from '@/components/ArticleBlockRenderer'
import { ArticleToc } from '@/components/ArticleToc'
import { ArticleCard } from '@/components/ArticleCard'
import { ViewPing } from '@/components/ViewPing'
import { JsonLd } from '@/components/JsonLd'
import { getPostDirectory } from '@/lib/articles/blocks'

export const revalidate = 2700 // 45 min (matches legacy article-detail cache TTL)
export const dynamicParams = true

export async function generateStaticParams() {
  return getStaticArticleParams()
}

type Params = Promise<{ locale: string; category: string; url: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, category, url } = await params
  if (!isLocale(locale) || !toDbCategory(category)) return {}
  const a = await getArticleDetail(category, url, locale)
  if (!a || !a.translation) return {}
  const present = await getPresentLocales(url)
  return buildArticleMetadata({
    urlCategory: category as 'destinations' | 'dining' | 'shopping', url, locale,
    presentLocales: present, title: a.translation.title, metaTitle: a.translation.meta_title,
    summary: a.translation.summary, metaDescription: a.translation.meta_description,
    ogImage: a.translation.og_image ?? a.thumbnails[0] ?? null,
    publishedAt: a.published_at, editAt: a.edit_at, isCoupon: a.is_coupon,
  })
}

export default async function ArticleDetailPage({ params }: { params: Params }) {
  const { locale, category, url } = await params
  if (!isLocale(locale) || !toDbCategory(category)) notFound()
  const loc = locale as Locale
  const a = await getArticleDetail(category, url, loc)
  if (!a || !a.translation) notFound()       // missing locale / unpublished / category mismatch -> 404

  const dict = await getDictionary(loc)
  const directory = getPostDirectory(a.translation.content)
  const youMayLike = await getYouMayLike(a.id, loc, 5)

  const canonical = `${SITE_URL}/${loc}/articles/${category}/${url}`
  const ld: Record<string, unknown>[] = [
    articleJsonLd({
      headline: a.translation.meta_title ?? a.translation.title ?? '',
      description: (a.translation.meta_description?.trim() || a.translation.summary) ?? '',
      url: canonical, images: a.thumbnails, publishedAt: a.published_at,
      modifiedAt: a.edit_at, authorName: a.author?.name ?? null, locale: loc,
    }),
    breadcrumbJsonLd([
      { name: dict.breadcrumb.home, url: `${SITE_URL}/${loc}` },
      { name: dict.breadcrumb.articles, url: `${SITE_URL}/${loc}/articles` },
      { name: dict.categories[category as 'destinations' | 'dining' | 'shopping'], url: `${SITE_URL}/${loc}/articles/${category}` },
      { name: a.translation.title ?? '', url: canonical },
    ]),
  ]
  if (a.faqs.length) ld.push(faqJsonLd(a.faqs))

  return (
    <main className="k-container py-8">
      <JsonLd data={ld} />
      <ViewPing url={url} />

      <nav className="text-sm text-muted mb-4" aria-label="breadcrumb">
        <Link href={`/${loc}`}>{dict.breadcrumb.home}</Link> ·{' '}
        <Link href={`/${loc}/articles`}>{dict.breadcrumb.articles}</Link> ·{' '}
        <Link href={`/${loc}/articles/${category}`}>{dict.categories[category as 'destinations' | 'dining' | 'shopping']}</Link>
        {' '}·{' '}
        <span aria-current="page">{a.translation.title}</span>
      </nav>

      <header className="mb-6">
        <h1 className="k-display text-3xl md:text-4xl font-black text-kinnso-ink">{a.translation.title}</h1>
        {a.translation.locale !== loc && (
          <p className="mt-2 rounded-lg bg-kinnso-cream2 px-3 py-2 text-sm text-kinnso-ink">
            {dict.article.fallbackNotice}
          </p>
        )}
        {a.author && <p className="text-muted mt-2">{dict.article.by} {a.author.name}</p>}
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
        <article>
          {a.thumbnails[0] && <img src={a.thumbnails[0]} alt={a.translation.title ?? ''} className="rounded-card w-full mb-6" />}
          <ArticleBlockRenderer blocks={a.translation.content} />

          {a.faqs.length > 0 && (
            <section className="mt-10">
              <h2 className="text-2xl font-bold mb-4">{a.translation.faq_title || dict.article.faqTitle}</h2>
              <dl className="space-y-4">
                {a.faqs.map((f, i) => (
                  <div key={`${f.question}-${i}`} className="rounded-card border border-cream-2 p-4">
                    <dt className="font-semibold">{f.question}</dt>
                    <dd className="text-muted mt-1">{f.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <ArticleToc items={directory} label={dict.article.tableOfContents} />
          </div>
        </aside>
      </div>

      {youMayLike.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold mb-4">{dict.article.youMayLike}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {youMayLike.map((r) => {
              const c = toUrlCategory(r.category)
              if (!c) return null
              return (
                <ArticleCard key={r.url} href={`/${loc}/articles/${c}/${r.url}`}
                             title={r.title ?? ''} thumbnail={r.thumbnails[0]} />
              )
            })}
          </div>
        </section>
      )}
    </main>
  )
}
