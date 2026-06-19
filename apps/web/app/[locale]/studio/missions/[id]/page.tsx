import { notFound } from 'next/navigation'
import { ComingSoonPage } from '../../../_components/ComingSoonPage'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'

export default async function StudioMissionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  return (
    <ComingSoonPage
      locale={locale as Locale}
      title={messages.studioHome.missionsTitle}
      t={messages.comingSoon}
    />
  )
}
