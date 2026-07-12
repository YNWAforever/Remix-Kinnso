// apps/web/app/[locale]/experiences/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getExperienceBySlug } from '@/lib/experiences/public-queries'
import { listPublicAvailability } from '@/lib/experiences/public-availability-queries'
import { isExperienceSaved } from '@/lib/saves/experience-queries'
import { getExperienceRatingAggregate, listPublishedReviewsForExperience } from '@/lib/reviews/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildExperienceMetadata, SITE_URL } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, experienceOfferJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { ExperiencePublicView } from '@/components/kinnso/pages/ExperiencePublicView'

export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const experience = await getExperienceBySlug(slug)
  if (!experience) return { title: 'Experience not found', robots: { index: false, follow: false } }
  const description = experience.summary ?? `${experience.city} experience hosted by ${experience.merchant.companyName}.`
  return buildExperienceMetadata({ slug, locale: locale as Locale, title: experience.title, description })
}

export default async function ExperiencePublicPage({ params, searchParams }: {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale, slug } = await params
  const sp = await searchParams
  const firstOf = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const sourceSurface = firstOf(sp.src)
  const guideSlug = firstOf(sp.guideSlug)
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const experience = await getExperienceBySlug(slug)
  if (!experience) notFound()

  const supabase = await createSupabaseServerClient()
  const [availability, { data: { user } }] = await Promise.all([
    listPublicAvailability(experience.id),
    supabase.auth.getUser(),
  ])
  const [isSaved, rating, reviews] = await Promise.all([
    user ? isExperienceSaved(supabase, experience.id, user.id) : Promise.resolve(false),
    getExperienceRatingAggregate(supabase, experience.id),
    listPublishedReviewsForExperience(supabase, experience.id),
  ])

  const canonical = `${SITE_URL}/${locale}/experiences/${slug}`
  const hasOpenAvailability = availability.some((a) => a.remaining > 0)
  const ld = [
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: messages.seo.merchants.title, url: `${SITE_URL}/${locale}/merchants` },
      { name: experience.title, url: canonical },
    ]),
    ...(hasOpenAvailability
      ? [experienceOfferJsonLd({
          name: experience.title,
          description: experience.summary ?? experience.description ?? `${experience.city} experience`,
          url: canonical,
          image: experience.coverUrl,
          priceAmount: experience.priceAmount,
          currency: experience.currency,
          rating: rating ?? undefined,
        })]
      : []),
  ]
  return (
    <>
      <JsonLd data={ld} />
      <ExperiencePublicView
        locale={locale as Locale}
        t={messages.experiencePublic}
        bookingT={messages.booking}
        reviewsT={messages.reviews}
        experienceSaveT={messages.experienceSave}
        experience={experience}
        availability={availability}
        viewerEmail={user?.email ?? null}
        viewerId={user?.id ?? null}
        isSaved={isSaved}
        rating={rating}
        reviews={reviews}
        sourceSurface={sourceSurface}
        guideSlug={guideSlug}
      />
    </>
  )
}
