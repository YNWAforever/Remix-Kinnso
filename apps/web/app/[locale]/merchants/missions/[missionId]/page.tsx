import { notFound, redirect } from 'next/navigation'
import { MissionDetailView, type MissionDetail } from '@/components/kinnso/pages/MissionDetailView'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { reviewParticipantAction, reviewSubmissionAction } from '@/lib/missions/actions'
import { getMerchantProfile, listMerchantMissions } from '@/lib/missions/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string; missionId: string }>
type MerchantMissionDetailData = {
  id: string
  title: string | null
  mission_participants?: Array<{
    id: string
    status: string | null
    creator_id: string | null
    mission_milestone_submissions?: Array<{
      id: string
      status: string | null
      mission_social_snapshots?: Array<{ confidence_status: string | null }> | null
    }> | null
  }> | null
}

function creatorName(creatorId: string | null) {
  return creatorId ? `Creator ${creatorId.slice(0, 8)}` : 'Creator'
}

function socialSignalStatus(
  snapshots: Array<{ confidence_status: string | null }> | null | undefined,
): MissionDetail['submissions'][number]['snapshotStatus'] {
  const statuses = snapshots?.map((snapshot) => snapshot.confidence_status) ?? []
  if (statuses.includes('verified_signal')) return 'verified_signal'
  if (statuses.includes('needs_review')) return 'needs_review'
  return 'unavailable'
}

function mapMissionDetail(row: MerchantMissionDetailData): MissionDetail {
  const participants = row.mission_participants ?? []

  return {
    id: row.id,
    title: row.title ?? '',
    participants: participants.map((participant) => ({
      id: participant.id,
      creatorName: creatorName(participant.creator_id),
      status: participant.status ?? 'applied',
    })),
    submissions: participants.flatMap((participant) =>
      (participant.mission_milestone_submissions ?? []).map((submission) => ({
        id: submission.id,
        creatorName: creatorName(participant.creator_id),
        status: submission.status ?? 'pending',
        snapshotStatus: socialSignalStatus(submission.mission_social_snapshots),
      })),
    ),
  }
}

export default async function MerchantMissionDetailPage({ params }: { params: Params }) {
  const { locale, missionId } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const { data: merchantProfile } = await getMerchantProfile(supabase, user.id)
  if (!merchantProfile) notFound()

  const { data } = await listMerchantMissions(supabase, merchantProfile.id)
  const row = ((data ?? []) as unknown as MerchantMissionDetailData[]).find((mission) => mission.id === missionId)
  if (!row) notFound()

  async function reviewParticipant(participantId: string, action: 'approve' | 'reject') {
    'use server'
    return reviewParticipantAction({ participantId, action, locale: loc })
  }

  async function reviewSubmission(submissionId: string, action: 'approve' | 'request_revision' | 'reject') {
    'use server'
    return reviewSubmissionAction({ submissionId, action, locale: loc })
  }

  return (
    <MissionDetailView
      t={messages.missions}
      mission={mapMissionDetail(row)}
      onReviewParticipant={reviewParticipant}
      onReviewSubmission={reviewSubmission}
    />
  )
}
