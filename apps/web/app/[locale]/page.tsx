import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getPublishedGuides } from '@/lib/guides/queries'
import { HomeView } from '@/components/kinnso/pages/HomeView'
import { buildPageMetadata } from '@/lib/seo/metadata'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildPageMetadata({ path: '', locale: locale as Locale, title: dict.seo.home.title, description: dict.seo.home.description })
}

/** /[locale] — the KINNSO creator front door (replaces the old redirect to /articles). */
export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const guides = await getPublishedGuides()
  return <HomeView locale={locale as Locale} t={messages.home} guides={guides} />
}
