'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { actionErrorMessage, actionSucceeded, type KinnsoActionResult } from '@/components/kinnso/action-result'
import { MissionCompensationSummary } from '@/components/kinnso/MissionCompensationSummary'
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import type { Messages } from '@/lib/i18n/messages/en'

export type CreatorMissionCard = {
  id: string
  title: string
  summary: string
  missionSource: 'merchant' | 'travelpayouts'
  missionType: 'coupon_affiliate' | 'hybrid' | 'paid'
  status: string
  participant: { id: string; status: string } | null
  partnerLinks: Array<{ id: string; partnerUrl: string }>
  programUrl: string | null
  compensation: string
}

type CreatorMissionsViewProps = {
  t: Messages['missions']
  missions: CreatorMissionCard[]
  onJoin: (missionId: string) => KinnsoActionResult | Promise<KinnsoActionResult>
  onCreateLink: (missionParticipantId: string, originalUrl: string) => KinnsoActionResult | Promise<KinnsoActionResult>
}

export function CreatorMissionsView({
  t,
  missions,
  onJoin,
  onCreateLink,
}: CreatorMissionsViewProps) {
  const router = useRouter()
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const getJoinLabel = (missionType: CreatorMissionCard['missionType']) => (
    missionType === 'coupon_affiliate' ? t.joinMission : t.applyMission
  )

  const runAction = async (action: () => KinnsoActionResult | Promise<KinnsoActionResult>) => {
    setActionError(null)
    setIsPending(true)
    try {
      const result = await action()
      setActionError(actionErrorMessage(result))
      if (actionSucceeded(result)) router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.missionQueue}</h1>
      {actionError && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {actionError}
        </p>
      )}
      <div className="mt-6 grid gap-4">
        {missions.map((mission) => {
          const activeParticipantId = mission.participant?.status === 'active' ? mission.participant.id : null
          const programUrl = mission.programUrl

          return (
            <article key={mission.id} className="k-card p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <h2 className="text-lg font-bold text-kinnso-ink">{mission.title}</h2>
                  <p className="text-sm text-kinnso-muted">{mission.summary}</p>
                  <MissionCompensationSummary text={mission.compensation} />
                </div>
                <MissionStatusBadge status={mission.participant?.status ?? mission.status} />
              </div>
              {mission.partnerLinks.length > 0 && (
                <ul className="mt-4 space-y-1 text-sm text-kinnso-muted">
                  {mission.partnerLinks.map((link) => (
                    <li key={link.id} className="truncate">{link.partnerUrl}</li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {!mission.participant && (
                  <button type="button" className="k-btn-primary text-sm" disabled={isPending} onClick={() => void runAction(() => onJoin(mission.id))}>
                    {getJoinLabel(mission.missionType)}
                  </button>
                )}
                {mission.missionSource === 'travelpayouts' && activeParticipantId && programUrl && (
                  <button
                    type="button"
                    className="k-btn-ghost text-sm"
                    disabled={isPending}
                    onClick={() => void runAction(() => onCreateLink(activeParticipantId, programUrl))}
                  >
                    {t.generatePartnerLink}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </main>
  )
}
