'use client'

import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import { SocialSignalBadge } from '@/components/kinnso/SocialSignalBadge'
import type { Messages } from '@/lib/i18n/messages/en'

type ReviewParticipantAction = 'approve' | 'reject'
type ReviewSubmissionAction = 'approve' | 'request_revision' | 'reject'
type SocialSignalStatus = 'verified_signal' | 'needs_review' | 'unavailable'

export type MissionDetail = {
  id: string
  title: string
  participants: Array<{ id: string; creatorName: string; status: string }>
  submissions: Array<{ id: string; creatorName?: string; status: string; snapshotStatus?: SocialSignalStatus }>
}

type MissionDetailViewProps = {
  t: Messages['missions']
  mission: MissionDetail
  onReviewParticipant: (participantId: string, action: ReviewParticipantAction) => void | Promise<void>
  onReviewSubmission: (submissionId: string, action: ReviewSubmissionAction) => void | Promise<void>
}

export function MissionDetailView({
  t,
  mission,
  onReviewParticipant,
  onReviewSubmission,
}: MissionDetailViewProps) {
  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{mission.title}</h1>

      <section className="mt-6">
        <h2 className="text-lg font-bold text-kinnso-ink">{t.participants}</h2>
        <div className="mt-3 divide-y divide-kinnso-cream2 overflow-hidden rounded-2xl border border-kinnso-cream2 bg-white shadow-kinnso">
          {mission.participants.map((participant) => (
            <article key={participant.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold text-kinnso-ink">{participant.creatorName}</h3>
                <MissionStatusBadge status={participant.status} />
              </div>
              {participant.status === 'applied' && (
                <div className="flex gap-2">
                  <button type="button" className="k-btn-primary text-sm" onClick={() => void onReviewParticipant(participant.id, 'approve')}>
                    {t.approve}
                  </button>
                  <button type="button" className="k-btn-ghost text-sm" onClick={() => void onReviewParticipant(participant.id, 'reject')}>
                    {t.reject}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {mission.submissions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.submitMilestone}</h2>
          <div className="mt-3 divide-y divide-kinnso-cream2 overflow-hidden rounded-2xl border border-kinnso-cream2 bg-white shadow-kinnso">
            {mission.submissions.map((submission) => (
              <article key={submission.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h3 className="font-bold text-kinnso-ink">{submission.creatorName ?? submission.id}</h3>
                  <div className="flex flex-wrap gap-2">
                    <MissionStatusBadge status={submission.status} />
                    <SocialSignalBadge status={submission.snapshotStatus ?? 'unavailable'} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="k-btn-primary text-sm" onClick={() => void onReviewSubmission(submission.id, 'approve')}>
                    {t.approve}
                  </button>
                  <button type="button" className="k-btn-ghost text-sm" onClick={() => void onReviewSubmission(submission.id, 'request_revision')}>
                    {t.requestRevision}
                  </button>
                  <button type="button" className="k-btn-ghost text-sm" onClick={() => void onReviewSubmission(submission.id, 'reject')}>
                    {t.reject}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
