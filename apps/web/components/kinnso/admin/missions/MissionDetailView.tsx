import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { MissionDetail } from '@/lib/admin/mission-review-queries'
import type { ActionResult } from '@/lib/admin/result'
import type { SubmissionReviewAction } from '@/lib/missions/types'
import { SubmissionQueueRow } from '@/components/kinnso/admin/missions/SubmissionQueueRow'

type T = Messages['missionsOps']
type ReviewActionFn = (
  locale: Locale,
  submissionId: string,
  action: SubmissionReviewAction,
  reasonCategory: string | null,
  reasonText: string | null,
  missionId: string | null,
) => Promise<ActionResult<{ id: string }>>

export function MissionDetailView({
  t, locale, detail, reviewAction,
}: {
  t: T
  locale: Locale
  detail: MissionDetail
  reviewAction: ReviewActionFn
}) {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-kinnso-ink">{detail.mission.title}</h1>
      <p className="mb-4 text-sm text-kinnso-muted">
        {detail.mission.missionSource} · {detail.mission.missionType} · {detail.mission.status}
      </p>

      {detail.submissions.length === 0 ? (
        <p className="py-8 text-center text-sm text-kinnso-muted">—</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-kinnso-muted">
            <tr className="border-b border-kinnso-line">
              <th className="py-2 font-bold">{t.colMission}</th>
              <th className="py-2 font-bold">{t.colCreator}</th>
              <th className="py-2 font-bold">{t.colVerification}</th>
              <th className="py-2 font-bold">{t.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {detail.submissions.map((row) => (
              <SubmissionQueueRow key={row.submissionId} t={t} locale={locale} row={row} reviewAction={reviewAction} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default MissionDetailView
