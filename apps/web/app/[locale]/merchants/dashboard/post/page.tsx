import { notFound } from 'next/navigation'
import { MissionPostWizard } from '@/components/kinnso/pages/MissionPostWizard'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createMissionAction } from '@/lib/missions/actions'
import type { MissionDraftInput } from '@/lib/missions/types'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function MerchantPostPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  async function submitMission(input: MissionDraftInput, opts: { publish: boolean }) {
    'use server'
    return createMissionAction(input, { publish: opts.publish, locale })
  }

  return <MissionPostWizard locale={locale} t={messages.missions} onSubmit={submitMission} />
}
