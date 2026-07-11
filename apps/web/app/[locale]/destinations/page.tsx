import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, LOCALES, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { buildPageMetadata } from '@/lib/seo/metadata'
import { getPublishedDestinations } from '@/lib/destinations/queries'
import { DestinationsIndexView } from '@/components/kinnso/pages/DestinationsIndexView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = (await getDictionary(locale as Locale)).destinations
  return buildPageMetadata({ path: '/destinations', locale: locale as Locale, title: t.title, description: t.body })
}

export default async function DestinationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = (await getDictionary(locale as Locale)).destinations
  const destinations = await getPublishedDestinations()
  return <DestinationsIndexView locale={locale as Locale} t={t} destinations={destinations} />
}
