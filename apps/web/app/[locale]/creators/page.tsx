import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { CreatorsLandingView } from '@/components/kinnso/pages/CreatorsLandingView'
import { getPublicCreators } from '@/lib/creators/queries'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function CreatorsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const creators = await getPublicCreators()
  return <CreatorsLandingView locale={locale as Locale} t={messages.creatorsLanding} creators={creators} />
}
