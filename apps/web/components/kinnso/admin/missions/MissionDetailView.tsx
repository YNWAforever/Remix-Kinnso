'use client'
import { useState, useTransition, useEffect, useRef } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { MissionDetail, ReviewQueueRow } from '@/lib/admin/mission-review-queries'
import type { ActionResult } from '@/lib/admin/result'
import type { SubmissionReviewAction } from '@/lib/missions/types'

type T = Messages['missionsOps']
type ReviewActionFn = (
  locale: Locale,
  submissionId: string,
  action: SubmissionReviewAction,
  reasonCategory: string | null,
  reasonText: string | null,
  missionId: string | null,
) => Promise<ActionResult<{ id: string }>>

const REASON_OPTIONS = (t: T): Array<{ value: string; label: string }> => [
  { value: 'format', label: t.reasonFormat },
  { value: 'key_message', label: t.reasonKeyMessage },
  { value: 'compliance', label: t.reasonCompliance },
  { value: 'quality', label: t.reasonQuality },
  { value: 'other', label: t.reasonOther },
]

// Only reject/request_revision open the reason-capture modal; approve fires immediately.
type PendingAction = { row: ReviewQueueRow; kind: 'reject' | 'request_revision' } | null

export function MissionDetailView({
  t, locale, detail, reviewAction,
}: {
  t: T
  locale: Locale
  detail: MissionDetail
  reviewAction: ReviewActionFn
}) {
  const [pending, setPending] = useState<PendingAction>(null)
  const [reasonCategory, setReasonCategory] = useState('')
  const [reasonText, setReasonText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const selectRef = useRef<HTMLSelectElement>(null)

  // Focus the reason-category select when the confirm dialog opens.
  useEffect(() => { if (pending) selectRef.current?.focus() }, [pending])

  const open = (row: ReviewQueueRow, kind: 'reject' | 'request_revision') => {
    setPending({ row, kind })
    setReasonCategory('')
    setReasonText('')
    setError(null)
  }
  const cancel = () => {
    setPending(null)
    setReasonCategory('')
    setReasonText('')
    setError(null)
  }

  const approve = (row: ReviewQueueRow) => {
    setError(null)
    startTransition(async () => {
      const res = await reviewAction(locale, row.submissionId, 'approve', null, null, detail.mission.id)
      if (!res.ok) setError(res.errors.form?.[0] ?? null)
    })
  }

  const confirm = () => {
    if (!pending) return
    if (!reasonCategory) {
      setError(t.reasonCategoryPlaceholder)
      return
    }
    startTransition(async () => {
      const res = await reviewAction(
        locale,
        pending.row.submissionId,
        pending.kind,
        reasonCategory,
        reasonText.trim() || null,
        detail.mission.id,
      )
      if (res.ok) cancel()
      else setError(res.errors.form?.[0] ?? null)
    })
  }

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
              <tr key={row.submissionId} className="border-b border-kinnso-line/60 align-top">
                <td className="py-2 font-bold text-kinnso-ink">{row.missionTitle}</td>
                <td className="py-2 text-kinnso-muted">{row.creatorId ? row.creatorId.slice(0, 8) : '—'}</td>
                <td className="py-2 text-kinnso-muted">{row.confidenceStatus ?? '—'}</td>
                <td className="py-2">
                  {row.status === 'revision_requested' ? (
                    <span className="rounded-full bg-kinnso-line/40 px-2 py-1 text-xs font-bold text-kinnso-muted">
                      {t.waitingOnCreator}
                    </span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => approve(row)}
                        disabled={isPending}
                        className="rounded-md bg-kinnso-orange px-2 py-1 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {t.actApprove}
                      </button>
                      <button
                        type="button"
                        onClick={() => open(row, 'reject')}
                        disabled={isPending}
                        className="rounded-md border border-kinnso-line px-2 py-1 text-xs font-bold text-kinnso-ink disabled:opacity-50"
                      >
                        {t.actReject}
                      </button>
                      <button
                        type="button"
                        onClick={() => open(row, 'request_revision')}
                        disabled={isPending}
                        className="rounded-md border border-kinnso-line px-2 py-1 text-xs font-bold text-kinnso-ink disabled:opacity-50"
                      >
                        {t.actRequestRevision}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Reject / request-revision confirm panel -- mirrors CreatorPayoutsView's money-action modal. */}
      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-confirm-title"
          onKeyDown={(e) => { if (e.key === 'Escape') cancel() }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <p id="review-confirm-title" className="mb-3 text-sm font-bold text-kinnso-ink">
              {pending.kind === 'reject' ? t.actReject : t.actRequestRevision}
            </p>
            <p className="mb-2 text-xs text-kinnso-muted">{pending.row.missionTitle}</p>
            <select
              ref={selectRef}
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              aria-label={t.reasonCategoryPlaceholder}
              className="mb-2 w-full rounded-md border border-kinnso-line p-2 text-sm"
            >
              <option value="">{t.reasonCategoryPlaceholder}</option>
              {REASON_OPTIONS(t).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              className="mb-2 w-full rounded-md border border-kinnso-line p-2 text-sm"
              rows={3}
            />
            {error && <p className="mb-2 text-xs font-bold text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancel}
                disabled={isPending}
                className="rounded-md border border-kinnso-line px-3 py-1 text-sm font-bold text-kinnso-ink"
              >
                {t.actCancel}
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={isPending || !reasonCategory}
                className="rounded-md bg-kinnso-orange px-3 py-1 text-sm font-bold text-white disabled:opacity-50"
              >
                {t.actApply}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MissionDetailView
