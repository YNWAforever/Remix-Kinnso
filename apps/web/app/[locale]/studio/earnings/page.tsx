import { notFound, redirect } from 'next/navigation'
import { StudioEarningsView } from '@/components/kinnso/pages/StudioEarningsView'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { summarizeCreatorEarnings, toCreatorEarningItem, type CreatorSettlementRow } from '@/lib/missions/earnings'
import { listCreatorSettlements } from '@/lib/missions/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string }>

export default async function StudioEarningsPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const role = await resolveViewerRole(supabase)
  if (role !== 'creator') notFound()

  const { data } = await listCreatorSettlements(supabase)
  const items = ((data ?? []) as unknown as CreatorSettlementRow[]).map(toCreatorEarningItem)
  const totals = summarizeCreatorEarnings(items)

  return <StudioEarningsView t={messages.studioEarnings} totals={totals} items={items} />
}
