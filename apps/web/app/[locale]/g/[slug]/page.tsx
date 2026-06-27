import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Bookmark, MapPin } from 'lucide-react'
import { isLocale, htmlLang, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getGuideBySlug } from '@/lib/guides/queries'
import { RouteStamp, TicketCard } from '@/components/kinnso/MarketPassport'
import { buildGuideMetadata, SITE_URL } from '@/lib/seo/metadata'
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'

export function generateStaticParams() {
  // Guides are DB-only; resolve on demand (dynamicParams defaults to true).
  return []
}

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

export default async function GuidePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()

  const guide = await getGuideBySlug(slug)
  if (!guide) notFound()

  const messages = await getDictionary(locale as Locale)
  const authorName = guide.creatorName ?? guide.creatorHandle

  const canonical = `${SITE_URL}/${locale}/g/${slug}`
  const ld = [
    articleJsonLd({
      headline: guide.title,
      description: guide.summary ?? `${guide.city} guide by ${authorName}`,
      url: canonical, images: guide.cover ? [guide.cover] : [],
      publishedAt: null, modifiedAt: null,
      authorName, locale: htmlLang(locale as Locale),
    }),
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: messages.seo.explore.title, url: `${SITE_URL}/${locale}/explore` },
      { name: guide.title, url: canonical },
    ]),
  ]

  return (
    <article className="k-container py-8 md:py-12">
      <JsonLd data={ld} />
      <section className="overflow-hidden rounded-xl bg-white shadow-kinnso">
        <div
          role="img"
          aria-label={guide.title}
          className="relative min-h-[360px] bg-cover bg-center"
          style={{
            backgroundImage: `url("${encodeURI(guide.cover)}")`,
          }}
        >
          {/* Gradient overlay for legibility */}
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/70" />

          {/* RouteStamp – city/category signal, positioned top-left */}
          <div className="absolute left-6 top-6 flex flex-wrap gap-2 sm:left-8">
            <RouteStamp>{guide.city}</RouteStamp>
          </div>

          {/* TicketCard overlay – title, author, city, saves */}
          <TicketCard className="absolute inset-x-4 bottom-4 p-5 sm:inset-x-6 sm:bottom-6 sm:p-7 md:inset-x-8 md:bottom-8">
            <h1 className="max-w-3xl text-2xl font-black leading-tight text-kinnso-ink md:text-4xl">{guide.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-kinnso-muted">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {guide.city}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Bookmark className="h-4 w-4" aria-hidden="true" />
                {guide.saves.toLocaleString()}
              </span>
            </div>
            <div className="mt-3">
              <div className="text-sm font-black text-kinnso-ink">{authorName}</div>
              <div className="k-mono mt-0.5 text-sm text-kinnso-muted">@{guide.creatorHandle}</div>
            </div>
          </TicketCard>
        </div>
      </section>

      <section className="mt-6 grid gap-5 md:grid-cols-[1fr_320px]">
        <div className="rounded-lg bg-white p-6">
          <h2 className="text-base font-bold text-kinnso-ink">{messages.creatorProfile.destinationsCovered}</h2>
          <p className="mt-2 text-sm text-kinnso-muted">{guide.summary ?? guide.city}</p>
          <Link href={`/${locale}/feed`} className="k-btn-ghost mt-5 inline-flex text-sm">
            {messages.creatorProfile.viewAllGuides}
          </Link>
        </div>

        <aside className="rounded-lg bg-kinnso-cream2 p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-kinnso-muted">{messages.article.by}</p>
          <div className="mt-3">
            <div className="text-lg font-black text-kinnso-ink">{authorName}</div>
            <Link
              href={`/${locale}/c/${guide.creatorHandle}`}
              className="k-mono mt-1 inline-flex text-sm text-kinnso-orange hover:text-kinnso-orangeDark"
            >
              @{guide.creatorHandle}
            </Link>
          </div>
        </aside>
      </section>
    </article>
  )
}
