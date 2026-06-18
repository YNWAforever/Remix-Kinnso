import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { MerchantsCreatorsView } from '@/components/kinnso/pages/MerchantsCreatorsView'
import { merchantProfile } from '@/lib/creator-mock'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

/**
 * /[locale]/merchants/creators — merchant creator search (ungated this slice).
 *
 * The merchant tier + search/invite quotas come from the mock `merchantProfile`
 * (UI-only — no real tier resolution, quota persistence, billing, or gating).
 */
export default async function MerchantsCreatorsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  return (
    <MerchantsCreatorsView
      merchant={merchantProfile}
      locale={locale as Locale}
      t={{ ...messages.merchants, creatorProfile: messages.creatorProfile }}
    />
  )
}
