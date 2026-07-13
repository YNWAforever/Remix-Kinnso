import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Bookmark, MapPin } from 'lucide-react'
import { isLocale, htmlLang, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getGuideBySlug } from '@/lib/guides/queries'
import { isGuideSaved } from '@/lib/saves/guide-queries'
import { getGuideRatingAggregate, listPublishedReviewsForGuide } from '@/lib/reviews/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabasePublicClient } from '@/lib/supabase/public'
import { optionalQuery, optionalValue } from '@/lib/resilience/optional'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { GuideExperienceLinks } from '@/components/kinnso/GuideExperienceLinks'
import { GuideSaveButton } from '@/components/kinnso/GuideSaveButton'
import { buildGuideMetadata, SITE_URL } from '@/lib/seo/metadata'
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { cssUrl } from '@/lib/utils'

export const dynamic = 'force-dynamic'

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

  const viewer = await optionalQuery('guide-viewer', async () => {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    const isSaved = user
      ? await optionalQuery('guide-save-state', () => isGuideSaved(supabase, guide.id, user.id), false)
      : false
    return { user, isSaved }
  }, { user: null, isSaved: false })

  const [rating, reviews] = await Promise.all([
    optionalQuery('guide-rating', () => getGuideRatingAggregate(createSupabasePublicClient(), guide.id), null),
    optionalQuery('guide-reviews', () => listPublishedReviewsForGuide(createSupabasePublicClient(), guide.id), []),
  ])

  const canonical = `${SITE_URL}/${locale}/g/${slug}`
  const ld = optionalValue('guide-jsonld', () => [
    articleJsonLd({
      headline: guide.title,
      description: guide.summary ?? `${guide.city} guide by ${authorName}`,
      url: canonical,
      images: guide.cover ? [guide.cover] : [],
      publishedAt: guide.publishedAt,
      modifiedAt: null,
      authorName,
      locale: htmlLang(locale as Locale),
      rating: rating ?? undefined,
    }),
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: messages.seo.explore.title, url: `${SITE_URL}/${locale}/explore` },
      { name: guide.title, url: canonical },
    ]),
  ], [])
  return (
    <article className="k2-container py-8 md:py-12">
      <JsonLd data={ld} />
      <section className="overflow-hidden rounded-xl bg-white shadow-kinnso">
        <div
          role="img"
          aria-label={guide.title}
          className="relative min-h-[360px] bg-cover bg-center"
          style={{
            backgroundImage: cssUrl(guide.cover),
          }}
        >
          {/* Gradient overlay for legibility */}
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/70" />

          {/* RouteStamp – city/category signal, positioned top-left */}
          <div className="absolute left-6 top-6 flex flex-wrap gap-2 sm:left-8">
            <Eyebrow className="rounded-[3px] bg-white/90 px-3 py-1">{guide.city}</Eyebrow>
          </div>

          {/* Save toggle, top-right */}
          <div className="absolute right-6 top-6 sm:right-8">
            <GuideSaveButton locale={locale as Locale} guideId={guide.id} initialSaved={viewer.isSaved} signedIn={!!viewer.user} t={messages.guideSave} />
          </div>

          {/* TicketCard overlay – title, author, city, saves */}
          <div className="k2-card absolute inset-x-4 bottom-4 p-5 sm:inset-x-6 sm:bottom-6 sm:p-7 md:inset-x-8 md:bottom-8">
            <h1 className="k2-display max-w-3xl text-2xl font-semibold leading-tight text-kinnso-ink md:text-4xl">{guide.title}</h1>
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
              <div className="mt-0.5 text-sm text-kinnso-muted">@{guide.creatorHandle}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 md:grid-cols-[1fr_320px]">
        <div className="rounded-lg bg-white p-6">
          <h2 className="text-base font-bold text-kinnso-ink">{messages.creatorProfile.destinationsCovered}</h2>
          <p className="mt-2 text-sm text-kinnso-muted">{guide.summary ?? guide.city}</p>
          <Link href={`/${locale}/feed`} className="k2-btn-ghost mt-5 inline-flex text-sm">
            {messages.creatorProfile.viewAllGuides}
          </Link>
          <GuideExperienceLinks locale={locale as Locale} city={guide.city} guideSlug={guide.slug} t={messages.article} />
        </div>

        <aside className="k2-card bg-kinnso-cream2 p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-kinnso-muted">{messages.article.by}</p>
          <div className="mt-3">
            <div className="text-lg font-black text-kinnso-ink">{authorName}</div>
            <Link
              href={`/${locale}/c/${guide.creatorHandle}`}
              className="mt-1 inline-flex text-sm text-kinnso-orangeDark hover:text-kinnso-ink"
            >
              @{guide.creatorHandle}
            </Link>
          </div>
        </aside>
      </section>

      <section className="mt-6 rounded-lg bg-white p-6">
        <h2 className="text-base font-bold text-kinnso-ink">
          {rating
            ? `${messages.reviews.ratingAverageLabel.replace('{average}', rating.average.toFixed(1))} · ${messages.reviews.countLabel.replace('{count}', String(rating.count))}`
            : messages.reviews.emptyState}
        </h2>
        {reviews.length === 0 ? null : (
          <ul className="mt-4 space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="border-t border-kinnso-cream2 pt-4 first:border-t-0 first:pt-0">
                <p className="text-sm font-semibold text-kinnso-ink">{messages.reviews.anonymousReviewer} · {r.rating}/5</p>
                {r.body ? <p className="mt-1 text-sm text-kinnso-muted">{r.body}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  )
}
