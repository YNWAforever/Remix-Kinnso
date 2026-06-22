import { notFound, redirect } from 'next/navigation'
import { CreatorMissionsView, type CreatorMissionCard } from '@/components/kinnso/pages/CreatorMissionsView'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { creatorMissionProgress } from '@/lib/missions/list'
import { joinMissionAction } from '@/lib/missions/actions'
import { listCreatorMerchantMissions } from '@/lib/missions/queries'
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
  affiliate_commission_rate: number | null
  creator_commission_rate: number | null
  kinnso_commission_rate: number | null
  paid_fee_amount: number | null
  paid_fee_currency: string | null
  affiliate_network_programs?: {
    default_commission_description?: string | null
    program_url?: string | null
  } | Array<{
    default_commission_description?: string | null
    program_url?: string | null
  }> | null
  mission_milestones?: Array<{ id: string }> | null
  mission_participants?: Array<{
    id: string
    status: string | null
    creator_id: string | null
    mission_milestone_submissions?: Array<{ status: string | null; mission_milestone_id: string }> | null
  }> | null
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

const merchantAffiliateCompensation = (row: CreatorMissionRow) => {
  if (typeof row.creator_commission_rate === 'number' && typeof row.affiliate_commission_rate === 'number') {
    return `Affiliate commission ${row.creator_commission_rate}% creator / ${row.affiliate_commission_rate}% total`
  }
  return 'Affiliate commission'
}

const programUrl = (program: CreatorMissionRow['affiliate_network_programs']) => {
  const row = Array.isArray(program) ? program[0] : program
  return row?.program_url?.trim() || null
}

const paidCompensation = (row: CreatorMissionRow) =>
  typeof row.paid_fee_amount === 'number'
    ? `${row.paid_fee_currency ?? 'HKD'} ${row.paid_fee_amount}`
    : null

const formatCompensation = (row: CreatorMissionRow) => {
  const paid = paidCompensation(row)
  const affiliate = row.mission_source === 'travelpayouts'
    ? programCompensation(row.affiliate_network_programs)
    : merchantAffiliateCompensation(row)

  if (row.mission_type === 'hybrid' && paid) {
    return `${paid} + ${affiliate}`
  }
  return paid ?? affiliate
}

function mapCreatorMission(row: CreatorMissionRow, creatorId: string): CreatorMissionCard {
  const participant = row.mission_participants?.find((item) => item.creator_id === creatorId) ?? null
  const { milestoneCount, submittedCount } = creatorMissionProgress(
    row.mission_milestones,
    participant?.mission_milestone_submissions,
  )

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
    programUrl: programUrl(row.affiliate_network_programs),
    compensation: formatCompensation(row),
    milestoneCount,
    submittedCount,
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

  const role = await resolveViewerRole(supabase)
  if (role !== 'creator') notFound()

  const { data } = await listCreatorMerchantMissions(supabase)
  const missions = ((data ?? []) as unknown as CreatorMissionRow[]).map((row) =>
    mapCreatorMission(row, user.id),
  )

  async function join(missionId: string) {
    'use server'
    return joinMissionAction({ missionId, locale: loc })
  }

  return <CreatorMissionsView t={messages.missions} missions={missions} onJoin={join} />
}
