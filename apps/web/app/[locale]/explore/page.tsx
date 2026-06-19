import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { ExploreView } from '@/components/kinnso/pages/ExploreView'
import { getPublishedGuides } from '@/lib/guides/queries'

export const revalidate = 300

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function ExplorePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const guides = await getPublishedGuides()
  return <ExploreView locale={locale as Locale} t={messages.explore} guides={guides} />
}
