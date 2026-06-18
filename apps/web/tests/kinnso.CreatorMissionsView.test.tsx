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
  programUrl: null,
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

  it('shows join action errors returned by the server', async () => {
    const onJoin = vi.fn(async () => ({
      ok: false,
      errors: { form: ['Creator access is required'] },
    }))
    render(<CreatorMissionsView t={en.missions} missions={missions} onJoin={onJoin} onCreateLink={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: en.missions.joinMission }))

    expect((await screen.findByRole('alert')).textContent).toContain('Creator access is required')
  })

  it('uses apply copy for paid missions while calling the join action', () => {
    const onJoin = vi.fn()
    render(
      <CreatorMissionsView
        t={en.missions}
        missions={[{ ...missions[0], id: 'm2', title: 'Paid reel mission', missionType: 'paid' }]}
        onJoin={onJoin}
        onCreateLink={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: en.missions.applyMission }))
    expect(onJoin).toHaveBeenCalledWith('m2')
  })

  it('generates partner links from the active participant and program URL', () => {
    const onCreateLink = vi.fn()
    render(
      <CreatorMissionsView
        t={en.missions}
        missions={[{
          ...missions[0],
          participant: { id: 'participant-1', status: 'active' },
          programUrl: 'https://example.com/hotel',
        }]}
        onJoin={vi.fn()}
        onCreateLink={onCreateLink}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: en.missions.generatePartnerLink }))
    expect(onCreateLink).toHaveBeenCalledWith('participant-1', 'https://example.com/hotel')
  })
})
