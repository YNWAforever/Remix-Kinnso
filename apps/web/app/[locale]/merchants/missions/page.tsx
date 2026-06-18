import { notFound, redirect } from 'next/navigation'
import { MerchantMissionsView, type MerchantMissionRow } from '@/components/kinnso/pages/MerchantMissionsView'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getMerchantProfile, listMerchantMissions } from '@/lib/missions/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string }>
type MerchantMissionData = {
  id: string
  title: string | null
  status: string | null
  mission_participants?: Array<{ id: string; status: string | null }> | null
  mission_settlements?: Array<{ id: string; status: string | null }> | null
}

function mapMerchantMission(row: MerchantMissionData): MerchantMissionRow {
  const participants = row.mission_participants ?? []

  return {
    id: row.id,
    title: row.title ?? '',
    status: row.status ?? 'draft',
    participantCount: participants.length,
    pendingCount: participants.filter((participant) => participant.status === 'applied').length,
    settlementStatus: row.mission_settlements?.[0]?.status ?? null,
  }
}

export default async function MerchantMissionsPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const { data: merchantProfile } = await getMerchantProfile(supabase, user.id)
  if (!merchantProfile) return <MerchantMissionsView t={messages.missions} missions={[]} />

  const { data } = await listMerchantMissions(supabase, merchantProfile.id)
  const missions = ((data ?? []) as unknown as MerchantMissionData[]).map(mapMerchantMission)

  return <MerchantMissionsView t={messages.missions} missions={missions} />
}
