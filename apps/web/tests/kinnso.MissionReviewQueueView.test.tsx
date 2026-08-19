// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { MissionReviewQueueView } from '@/components/kinnso/admin/missions/MissionReviewQueueView'

afterEach(cleanup)

const PENDING_I18N_FALLBACK = {
  colMission: 'colMission', colCreator: 'colCreator', colVerification: 'colVerification', colActions: 'colActions',
  queueTitle: 'queueTitle', queueSubtitle: 'queueSubtitle', queueEmpty: 'queueEmpty',
  waitingOnCreator: 'waitingOnCreator',
  actApprove: 'actApprove', actReject: 'actReject', actRequestRevision: 'actRequestRevision',
  actCancel: 'actCancel', actApply: 'actApply',
  reasonCategoryPlaceholder: 'reasonCategoryPlaceholder',
  reasonFormat: 'reasonFormat', reasonKeyMessage: 'reasonKeyMessage', reasonCompliance: 'reasonCompliance',
  reasonQuality: 'reasonQuality', reasonOther: 'reasonOther',
}
const t = { ...PENDING_I18N_FALLBACK, ...en.missionsOps }

const rows = [
  { submissionId: 's1', missionId: 'm1', missionTitle: 'Summer Coupon Push', creatorId: 'creator-1', status: 'submitted' as const, submittedAt: '2026-08-19T00:00:00Z', reviewDeadline: '2026-08-21T00:00:00Z', confidenceStatus: 'verified_signal' as const },
  { submissionId: 's2', missionId: 'm2', missionTitle: 'HK Ramen Guide', creatorId: 'creator-2', status: 'revision_requested' as const, submittedAt: '2026-08-18T00:00:00Z', reviewDeadline: '2026-08-20T00:00:00Z', confidenceStatus: null },
]

describe('MissionReviewQueueView', () => {
  it('renders one row per queue item', () => {
    render(<MissionReviewQueueView t={t as never} locale="en" rows={rows} reviewAction={vi.fn()} />)
    expect(screen.getByText('Summer Coupon Push')).toBeTruthy()
    expect(screen.getByText('HK Ramen Guide')).toBeTruthy()
  })

  it('shows the empty state with no rows', () => {
    render(<MissionReviewQueueView t={t as never} locale="en" rows={[]} reviewAction={vi.fn()} />)
    expect(screen.getByText(t.queueEmpty)).toBeTruthy()
  })

  it('gives the revision_requested row a waiting badge, not action buttons', () => {
    render(<MissionReviewQueueView t={t as never} locale="en" rows={rows} reviewAction={vi.fn()} />)
    const revisionRow = screen.getByText('HK Ramen Guide').closest('tr')!
    expect(revisionRow.textContent).toContain(t.waitingOnCreator)
  })

  it('calls reviewAction with each row\'s own mission id, not a shared page-level id', async () => {
    const reviewAction = vi.fn().mockResolvedValue({ ok: true, id: 's1' })
    render(<MissionReviewQueueView t={t as never} locale="en" rows={rows} reviewAction={reviewAction} />)
    const summerRow = screen.getByText('Summer Coupon Push').closest('tr')!
    const approveBtn = summerRow.querySelector('button')!
    approveBtn.click()
    expect(reviewAction).toHaveBeenCalledWith('en', 's1', 'approve', null, null, 'm1')
  })
})
