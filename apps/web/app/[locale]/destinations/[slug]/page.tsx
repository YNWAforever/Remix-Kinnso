// apps/web/app/[locale]/destinations/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getDestinationBySlug } from '@/lib/destinations/queries'
import { getGuidesForRegions } from '@/lib/guides/queries'
import { getSessionsForDestination } from '@/lib/sessions/public-queries'
import { buildDestinationMetadata, SITE_URL } from '@/lib/seo/metadata'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { DestinationDetailView } from '@/components/kinnso/pages/DestinationDetailView'

export function generateStaticParams() {
  // Destinations are DB-only; resolve on demand (dynamicParams defaults to true) — same
  // choice as /g/[slug] and /experiences/[slug].
  return []
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const destination = await getDestinationBySlug(slug)
  if (!destination) return { title: 'Destination not found', robots: { index: false, follow: false } }
  return buildDestinationMetadata({
    slug, locale: locale as Locale, title: destination.name,
    description: destination.description ?? `Guides, experiences, and sessions for ${destination.name}.`,
  })
}

export default async function DestinationDetailPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()

  const destination = await getDestinationBySlug(slug)
  if (!destination) notFound()

  const messages = await getDictionary(locale as Locale)
  const t = messages.destinations
  const [guides, sessions] = await Promise.all([
    getGuidesForRegions(destination.matchTerms),
    getSessionsForDestination(destination.matchTerms),
  ])

  const canonical = `${SITE_URL}/${locale}/destinations/${slug}`
  const ld = [
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: t.eyebrow, url: `${SITE_URL}/${locale}/destinations` },
      { name: destination.name, url: canonical },
    ]),
  ]

  return (
    <>
      <JsonLd data={ld} />
      <DestinationDetailView
        locale={locale as Locale}
        t={t}
        destination={destination}
        guides={guides}
        sessions={sessions}
        savesLabel={messages.explore.savesLabel}
      />
    </>
  )
}
