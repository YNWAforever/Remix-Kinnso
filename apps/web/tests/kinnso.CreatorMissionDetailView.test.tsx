// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/missions/verify-client', () => ({
  startVerification: vi.fn(async () => ({ error: 'unconfigured' as const })),
  retryVerification: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
    from: vi.fn().mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
    }),
  }),
}))

import { CreatorMissionDetailView } from '@/components/kinnso/pages/CreatorMissionDetailView'
import type { CreatorMissionDetail, MilestoneRow } from '@/lib/missions/detail'
import type { KinnsoActionResult } from '@/components/kinnso/action-result'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const baseMilestone: MilestoneRow = {
  id: 'a', title: 'Main reel', description: 'A reel', dueAt: '2026-07-02T00:00:00Z',
  state: 'none', signal: null, submissionId: null, proofUrl: null, notes: null,
  merchantFeedback: null, canSubmit: false, verification: null,
}

const base: CreatorMissionDetail = {
  id: 'm1', title: 'Summer in Shibuya', summary: 'Make a reel.', missionSource: 'merchant',
  missionType: 'paid', status: 'published', compensation: 'HKD 5000', couponCode: null, couponUrl: null,
  partnerLinks: [], participantId: null, participantStatus: null, cta: 'apply',
  milestones: [baseMilestone],
}

function activeMissionWithMilestone(
  milestoneOverrides: Partial<MilestoneRow> = {},
): CreatorMissionDetail {
  return {
    ...base,
    id: 'm1',
    cta: 'active',
    participantId: 'p1',
    participantStatus: 'active',
    milestones: [{
      ...baseMilestone,
      id: 'ms1',
      title: 'Post a reel',
      description: 'A reel',
      canSubmit: false,
      state: 'none',
      ...milestoneOverrides,
    }],
  }
}

const render1 = (
  mission: CreatorMissionDetail,
  props: Partial<{
    onJoin: () => KinnsoActionResult | Promise<KinnsoActionResult>
    onApply: (n: string) => KinnsoActionResult | Promise<KinnsoActionResult>
    onSubmitMilestone: (input: { milestoneId: string; proofUrl: string; notes: string }) => Promise<{ ok: true; submissionId: string } | { ok: false; errors?: Record<string, string[]> }>
  }> = {},
) =>
  render(
    <CreatorMissionDetailView
      locale="en"
      t={en.missionDetail}
      mission={mission}
      onJoin={props.onJoin ?? vi.fn()}
      onApply={props.onApply ?? vi.fn()}
      onSubmitMilestone={props.onSubmitMilestone ?? vi.fn(async () => ({ ok: false as const }))}
    />,
  )

describe('CreatorMissionDetailView', () => {
  it('renders a back link to the missions list', () => {
    render1(base)
    const link = screen.getByRole('link', { name: new RegExp(en.missionDetail.back) })
    expect(link.getAttribute('href')).toBe('/en/studio/missions')
  })

  it('shows the join button for a coupon mission and calls onJoin', () => {
    const onJoin = vi.fn()
    render1({ ...base, missionType: 'coupon_affiliate', cta: 'join' }, { onJoin })
    fireEvent.click(screen.getByRole('button', { name: en.missionDetail.join }))
    expect(onJoin).toHaveBeenCalledTimes(1)
  })

  it('shows the apply note + button and calls onApply with the note', () => {
    const onApply = vi.fn()
    render1(base, { onApply })
    fireEvent.change(screen.getByLabelText(en.missionDetail.applyNoteLabel), { target: { value: 'I fit because…' } })
    fireEvent.click(screen.getByRole('button', { name: en.missionDetail.apply }))
    expect(onApply).toHaveBeenCalledWith('I fit because…')
  })

  it('shows the awaiting notice for an applied participant and no apply button', () => {
    render1({ ...base, participantStatus: 'applied', cta: 'awaiting' })
    expect(screen.getByText(en.missionDetail.awaitingTitle)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.missionDetail.apply })).toBeNull()
  })

  it('renders the milestone list for an active participant', () => {
    render1({
      ...base, participantId: 'p1', participantStatus: 'active', cta: 'active',
      milestones: [
        { id: 'a', title: 'Main reel', description: 'A reel', dueAt: null, state: 'submitted', signal: 'verified_signal', submissionId: 'sub1', proofUrl: null, notes: null, merchantFeedback: null, canSubmit: false, verification: null },
        { id: 'b', title: 'Wrap-up', description: '', dueAt: null, state: 'none', signal: null, submissionId: null, proofUrl: null, notes: null, merchantFeedback: null, canSubmit: false, verification: null },
      ],
    })
    expect(screen.getByText('Main reel')).toBeTruthy()
    expect(screen.getByText('Wrap-up')).toBeTruthy()
    expect(screen.getByText(en.missionDetail.milestonesHeading)).toBeTruthy()
  })

  it('renders a submit form for a submittable milestone and calls onSubmitMilestone', async () => {
    const onSubmitMilestone = vi.fn(async () => ({ ok: true as const, submissionId: 'sub-1' }))
    const mission = activeMissionWithMilestone({ canSubmit: true, state: 'none' })
    render(
      <CreatorMissionDetailView
        locale="en" t={en.missionDetail} mission={mission}
        onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={onSubmitMilestone}
      />,
    )
    fireEvent.change(screen.getByLabelText(en.missionDetail.proofUrlLabel), {
      target: { value: 'https://www.instagram.com/p/Cabc/' },
    })
    fireEvent.click(screen.getByRole('button', { name: en.missionDetail.submitMilestone }))
    await waitFor(() => expect(onSubmitMilestone).toHaveBeenCalledWith({
      milestoneId: mission.milestones[0].id, proofUrl: 'https://www.instagram.com/p/Cabc/', notes: '',
    }))
  })

  it('shows merchant feedback and a Resubmit button when revision was requested', () => {
    const mission = activeMissionWithMilestone({ canSubmit: true, state: 'revision_requested', merchantFeedback: 'Add the coupon code' })
    render(<CreatorMissionDetailView locale="en" t={en.missionDetail} mission={mission} onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()} />)
    expect(screen.getByText('Add the coupon code')).toBeTruthy()
    expect(screen.getByRole('button', { name: en.missionDetail.resubmitMilestone })).toBeTruthy()
  })

  it('does not render a form once approved', () => {
    const mission = activeMissionWithMilestone({ canSubmit: false, state: 'approved' })
    render(<CreatorMissionDetailView locale="en" t={en.missionDetail} mission={mission} onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()} />)
    expect(screen.queryByLabelText(en.missionDetail.proofUrlLabel)).toBeNull()
  })
})

describe('CreatorMissionDetailView tier lock', () => {
  it('shows the locked notice and hides join when lockedTier is set', () => {
    const onJoin = vi.fn()
    render(
      <CreatorMissionDetailView
        locale="en"
        t={en.missionDetail}
        mission={{ ...base, missionType: 'coupon_affiliate', cta: 'join' }}
        onJoin={onJoin}
        onApply={vi.fn()}
        onSubmitMilestone={vi.fn(async () => ({ ok: false as const }))}
        lockedTier="pro"
        gating={{ locked: en.missions.locked, lockedHelp: en.missions.lockedHelp }}
      />,
    )
    expect(screen.getByText(en.missions.locked)).toBeTruthy()
    expect(screen.getByText('Pro')).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.missionDetail.join })).toBeNull()
    expect(onJoin).not.toHaveBeenCalled()
  })
})
