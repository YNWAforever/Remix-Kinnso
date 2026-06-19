import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { MerchantsLandingView } from '@/components/kinnso/pages/MerchantsLandingView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function MerchantsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  return <MerchantsLandingView locale={locale as Locale} t={messages.merchantsLanding} />
}
