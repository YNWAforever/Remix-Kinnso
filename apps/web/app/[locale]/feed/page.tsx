import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { FeedView } from '@/components/kinnso/pages/FeedView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function FeedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  return <FeedView locale={locale as Locale} t={messages.feed} />
}
