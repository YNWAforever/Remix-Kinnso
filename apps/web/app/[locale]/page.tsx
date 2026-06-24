import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getPublishedGuides } from '@/lib/guides/queries'
import { HomeView } from '@/components/kinnso/pages/HomeView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

/** /[locale] — the KINNSO creator front door (replaces the old redirect to /articles). */
export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const guides = await getPublishedGuides()
  return <HomeView locale={locale as Locale} t={messages.home} guides={guides} />
}
