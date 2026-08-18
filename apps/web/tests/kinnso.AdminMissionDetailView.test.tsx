// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { MissionDetailView } from '@/components/kinnso/admin/missions/MissionDetailView'

afterEach(cleanup)

// Task 8 (not yet landed) adds these keys to lib/i18n/messages/*.ts. This fallback lets the
// component be built and tested now; real values will override it automatically once Task 8
// ships (object spread -- real en.missionsOps values win over these placeholders).
const PENDING_I18N_FALLBACK = {
  colMission: 'colMission', colCreator: 'colCreator', colVerification: 'colVerification', colActions: 'colActions',
  waitingOnCreator: 'waitingOnCreator',
  actApprove: 'actApprove', actReject: 'actReject', actRequestRevision: 'actRequestRevision',
  actCancel: 'actCancel', actApply: 'actApply',
  reasonCategoryPlaceholder: 'reasonCategoryPlaceholder',
  reasonFormat: 'reasonFormat', reasonKeyMessage: 'reasonKeyMessage', reasonCompliance: 'reasonCompliance',
  reasonQuality: 'reasonQuality', reasonOther: 'reasonOther',
}
const t = { ...PENDING_I18N_FALLBACK, ...en.missionsOps }

const detail = {
  mission: { id: 'mission-1', title: 'Summer Coupon Push', missionSource: 'travelpayouts', missionType: 'coupon_affiliate', status: 'published', merchantProfileId: null },
  participants: [{ id: 'p1', creatorId: 'creator-1', status: 'active', source: 'application', applicationNote: null, approvedAt: null }],
  milestones: [{ id: 'm1', title: 'Post proof', description: '', dueAt: null, sortOrder: 0 }],
  submissions: [{
    submissionId: 's1', missionId: 'mission-1', missionTitle: 'Summer Coupon Push',
    creatorId: 'creator-1', status: 'submitted' as const, submittedAt: '2026-08-19T00:00:00Z',
    reviewDeadline: '2026-08-21T00:00:00Z', confidenceStatus: 'verified_signal' as const,
  }],
}

describe('MissionDetailView', () => {
  it('shows a travelpayouts-sourced mission (proving the analytics widening reaches here)', () => {
    render(<MissionDetailView t={t as never} locale="en" detail={detail} reviewAction={vi.fn()} />)
    // The page heading and the (redundant, single-mission) submission row both legitimately
    // render the mission title -- assert presence, not uniqueness.
    expect(screen.getAllByText('Summer Coupon Push').length).toBeGreaterThan(0)
  })

  it('shows a submitted row with live review actions', () => {
    render(<MissionDetailView t={t as never} locale="en" detail={detail} reviewAction={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: t.actApprove }).length).toBeGreaterThan(0)
  })

  it('calls reviewAction with approve, the submission id, and this mission\'s id when clicked', async () => {
    const reviewAction = vi.fn().mockResolvedValue({ ok: true, id: 's1' })
    render(<MissionDetailView t={t as never} locale="en" detail={detail} reviewAction={reviewAction} />)
    fireEvent.click(screen.getByRole('button', { name: t.actApprove }))
    expect(reviewAction).toHaveBeenCalledWith('en', 's1', 'approve', null, null, 'mission-1')
  })

  it('shows a waiting-on-creator badge instead of buttons for a revision_requested row', () => {
    const revising = {
      ...detail,
      submissions: [{ ...detail.submissions[0], status: 'revision_requested' as const }],
    }
    render(<MissionDetailView t={t as never} locale="en" detail={revising} reviewAction={vi.fn()} />)
    expect(screen.getByText(t.waitingOnCreator)).toBeTruthy()
    expect(screen.queryByRole('button', { name: t.actApprove })).toBeNull()
  })
})
