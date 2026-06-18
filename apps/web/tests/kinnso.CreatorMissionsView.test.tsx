// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreatorMissionsView } from '@/components/kinnso/pages/CreatorMissionsView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const missions = [{
  id: 'm1',
  title: 'Travelpayouts hotel program',
  summary: 'Join and create tracked links.',
  missionSource: 'travelpayouts' as const,
  missionType: 'coupon_affiliate' as const,
  status: 'published',
  participant: null,
  partnerLinks: [],
  compensation: 'Affiliate commission',
}]

describe('CreatorMissionsView', () => {
  it('renders auto-join mission cards and calls join', () => {
    const onJoin = vi.fn()
    render(<CreatorMissionsView t={en.missions} missions={missions} onJoin={onJoin} onCreateLink={vi.fn()} />)
    expect(screen.getByText('Travelpayouts hotel program')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.missions.joinMission }))
    expect(onJoin).toHaveBeenCalledWith('m1')
  })
})
