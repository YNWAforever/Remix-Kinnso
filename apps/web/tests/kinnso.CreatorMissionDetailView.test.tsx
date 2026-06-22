// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { CreatorMissionDetailView } from '@/components/kinnso/pages/CreatorMissionDetailView'
import type { CreatorMissionDetail } from '@/lib/missions/detail'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const base: CreatorMissionDetail = {
  id: 'm1', title: 'Summer in Shibuya', summary: 'Make a reel.', missionSource: 'merchant',
  missionType: 'paid', status: 'published', compensation: 'HKD 5000', couponCode: null, couponUrl: null,
  partnerLinks: [], participantStatus: null, cta: 'apply',
  milestones: [{ id: 'a', title: 'Main reel', description: 'A reel', dueAt: '2026-07-02T00:00:00Z', state: 'none', signal: null }],
}

const render1 = (mission: CreatorMissionDetail, props: Partial<{ onJoin: () => unknown; onApply: (n: string) => unknown }> = {}) =>
  render(
    <CreatorMissionDetailView
      locale="en"
      t={en.missionDetail}
      mission={mission}
      onJoin={props.onJoin ?? vi.fn()}
      onApply={props.onApply ?? vi.fn()}
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
      ...base, participantStatus: 'active', cta: 'active',
      milestones: [
        { id: 'a', title: 'Main reel', description: 'A reel', dueAt: null, state: 'submitted', signal: 'verified_signal' },
        { id: 'b', title: 'Wrap-up', description: '', dueAt: null, state: 'none', signal: null },
      ],
    })
    expect(screen.getByText('Main reel')).toBeTruthy()
    expect(screen.getByText('Wrap-up')).toBeTruthy()
    expect(screen.getByText(en.missionDetail.milestonesHeading)).toBeTruthy()
  })
})
