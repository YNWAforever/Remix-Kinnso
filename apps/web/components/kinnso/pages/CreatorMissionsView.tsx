'use client'

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
  compensation: string
}

type CreatorMissionsViewProps = {
  t: Messages['missions']
  missions: CreatorMissionCard[]
  onJoin: (missionId: string) => void | Promise<void>
  onCreateLink: (missionId: string) => void | Promise<void>
}

export function CreatorMissionsView({
  t,
  missions,
  onJoin,
  onCreateLink,
}: CreatorMissionsViewProps) {
  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.missionQueue}</h1>
      <div className="mt-6 grid gap-4">
        {missions.map((mission) => (
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
                <button type="button" className="k-btn-primary text-sm" onClick={() => void onJoin(mission.id)}>
                  {t.joinMission}
                </button>
              )}
              {mission.missionSource === 'travelpayouts' && mission.participant?.status === 'active' && (
                <button type="button" className="k-btn-ghost text-sm" onClick={() => void onCreateLink(mission.id)}>
                  {t.generatePartnerLink}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  )
}
