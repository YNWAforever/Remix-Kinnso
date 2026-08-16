import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getSettlementsQueue } from '@/lib/admin/creators-queries'
import { isSettlementStatus, isSettlementSource } from '@/lib/admin/creators-validation'
import { setSettlementStatus } from '@/lib/admin/creators-actions'
import { CreatorPayoutsView } from '@/components/kinnso/admin/creators/CreatorPayoutsView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Search = { status?: string; source?: string }

export default async function CreatorsPayoutsPage({
  params, searchParams,
}: { params: Promise<{ locale: string }>; searchParams: Promise<Search> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const sp = await searchParams
  const status = sp.status && isSettlementStatus(sp.status) ? sp.status : undefined
  const source = sp.source && isSettlementSource(sp.source) ? sp.source : undefined
  const queue = await getSettlementsQueue(supabase, { status, source })
  return (
    <CreatorPayoutsView
      t={messages.creators}
      locale={loc}
      queue={queue}
      status={status}
      source={source}
      action={setSettlementStatus}
    />
  )
}
