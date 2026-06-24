import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { AboutView } from '@/components/kinnso/pages/AboutView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  return <AboutView locale={locale as Locale} t={messages.about} />
}
