import { notFound, redirect } from 'next/navigation'
import { OpsSettlementView, type OpsSettlementRow } from '@/components/kinnso/pages/OpsSettlementView'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { updateSettlementAction } from '@/lib/missions/actions'
import { listOpsSettlements } from '@/lib/missions/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string }>
type OpsSettlementData = {
  id: string
  status: string | null
  creator_payout_status: string | null
  kinnso_commission_status: string | null
  missions?: { title?: string | null } | Array<{ title?: string | null }> | null
}

function mapOpsSettlement(row: OpsSettlementData): OpsSettlementRow {
  const mission = Array.isArray(row.missions) ? row.missions[0] : row.missions

  return {
    id: row.id,
    missionTitle: mission?.title ?? 'Untitled mission',
    status: row.status ?? 'pending',
    creatorPayoutStatus: row.creator_payout_status ?? 'pending',
    kinnsoCommissionStatus: row.kinnso_commission_status ?? 'pending',
  }
}

export default async function OpsSettlementsPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const role = await resolveViewerRole(supabase)
  if (role !== 'ops') notFound()

  const { data } = await listOpsSettlements(supabase)
  const settlements = ((data ?? []) as unknown as OpsSettlementData[]).map(mapOpsSettlement)

  async function markPaid(settlementId: string, status: 'paid') {
    'use server'
    return updateSettlementAction({
      settlementId,
      status,
      creatorPayoutStatus: 'paid',
      kinnsoCommissionStatus: 'paid',
      locale: loc,
    })
  }

  return <OpsSettlementView locale={loc} t={messages.ops} settlements={settlements} onUpdate={markPaid} />
}
