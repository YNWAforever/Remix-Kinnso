// apps/web/app/[locale]/experiences/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getExperienceBySlug } from '@/lib/experiences/public-queries'
import { listPublicAvailability } from '@/lib/experiences/public-availability-queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildExperienceMetadata, SITE_URL } from '@/lib/seo/metadata'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { ExperiencePublicView } from '@/components/kinnso/pages/ExperiencePublicView'

export function generateStaticParams() {
  // Experiences are DB-only; resolve on demand (dynamicParams defaults to true) —
  // same choice as /g/[slug].
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
  // auth.getUser() here makes this page request-dynamic (it was previously
  // static-generation-eligible via generateStaticParams()) — needed so the
  // booking widget knows whether to show the guest-email field.
  const [availability, { data: { user } }] = await Promise.all([
    listPublicAvailability(experience.id),
    supabase.auth.getUser(),
  ])

  const canonical = `${SITE_URL}/${locale}/experiences/${slug}`
  // Breadcrumbs only — Product/Offer JSON-LD for real bookability is a
  // separate SEO carry-forward (design spec groups it with R3C's loop-closure
  // work, not this phase's Stripe/widget scope).
  const ld = [
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: messages.seo.merchants.title, url: `${SITE_URL}/${locale}/merchants` },
      { name: experience.title, url: canonical },
    ]),
  ]
  return (
    <>
      <JsonLd data={ld} />
      <ExperiencePublicView
        locale={locale as Locale}
        t={messages.experiencePublic}
        bookingT={messages.booking}
        experience={experience}
        availability={availability}
        viewerEmail={user?.email ?? null}
        sourceSurface={sourceSurface}
        guideSlug={guideSlug}
      />
    </>
  )
}
