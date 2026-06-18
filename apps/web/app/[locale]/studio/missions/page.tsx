import { notFound, redirect } from 'next/navigation'
import { CreatorMissionsView, type CreatorMissionCard } from '@/components/kinnso/pages/CreatorMissionsView'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { joinMissionAction } from '@/lib/missions/actions'
import { listCreatorMissions } from '@/lib/missions/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string }>
type CreatorMissionRow = {
  id: string
  title: string | null
  summary: string | null
  mission_source: string | null
  mission_type: string | null
  status: string | null
  paid_fee_amount: number | null
  paid_fee_currency: string | null
  affiliate_network_programs?: { default_commission_description?: string | null } | Array<{ default_commission_description?: string | null }> | null
  mission_participants?: Array<{ id: string; status: string | null; creator_id: string | null }> | null
  affiliate_partner_links?: Array<{ id: string; partner_url: string | null }> | null
}

const missionSource = (source: string | null): CreatorMissionCard['missionSource'] =>
  source === 'travelpayouts' ? 'travelpayouts' : 'merchant'

const missionType = (type: string | null): CreatorMissionCard['missionType'] => {
  if (type === 'hybrid' || type === 'paid') return type
  return 'coupon_affiliate'
}

const programCompensation = (program: CreatorMissionRow['affiliate_network_programs']) => {
  const row = Array.isArray(program) ? program[0] : program
  return row?.default_commission_description?.trim() || 'Affiliate commission'
}

const formatCompensation = (row: CreatorMissionRow) => {
  if (typeof row.paid_fee_amount === 'number') {
    return `${row.paid_fee_currency ?? 'HKD'} ${row.paid_fee_amount}`
  }
  return programCompensation(row.affiliate_network_programs)
}

function mapCreatorMission(row: CreatorMissionRow, creatorId: string): CreatorMissionCard {
  const participant = row.mission_participants?.find((item) => item.creator_id === creatorId) ?? null

  return {
    id: row.id,
    title: row.title ?? '',
    summary: row.summary ?? '',
    missionSource: missionSource(row.mission_source),
    missionType: missionType(row.mission_type),
    status: row.status ?? 'published',
    participant: participant ? { id: participant.id, status: participant.status ?? 'active' } : null,
    partnerLinks: (row.affiliate_partner_links ?? []).map((link) => ({
      id: link.id,
      partnerUrl: link.partner_url ?? '',
    })),
    compensation: formatCompensation(row),
  }
}

export default async function StudioMissionsPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const { data } = await listCreatorMissions(supabase, user.id)
  const missions = ((data ?? []) as unknown as CreatorMissionRow[]).map((row) =>
    mapCreatorMission(row, user.id),
  )

  async function join(missionId: string) {
    'use server'
    await joinMissionAction({ missionId, locale: loc })
  }

  async function createLink(missionId: string) {
    'use server'
    void missionId
  }

  return <CreatorMissionsView t={messages.missions} missions={missions} onJoin={join} onCreateLink={createLink} />
}
