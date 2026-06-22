// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { CreatorMissionsView, type CreatorMissionCard } from '@/components/kinnso/pages/CreatorMissionsView'
import en from '@/lib/i18n/messages/en'

afterEach(() => {
  cleanup()
  refreshMock.mockReset()
})

const baseAvailable: CreatorMissionCard = {
  id: 'm1',
  title: 'Boutique hotels program',
  summary: 'Join and create tracked links.',
  missionSource: 'merchant',
  missionType: 'coupon_affiliate',
  status: 'published',
  participant: null,
  partnerLinks: [],
  programUrl: null,
  compensation: '12% commission',
  milestoneCount: 0,
  submittedCount: 0,
}

const baseMine: CreatorMissionCard = {
  ...baseAvailable,
  id: 'm9',
  title: 'Summer in Shibuya',
  participant: { id: 'p9', status: 'active' },
  missionType: 'hybrid',
  compensation: 'HK$5,000 + 15% commission',
  milestoneCount: 3,
  submittedCount: 1,
}

describe('CreatorMissionsView', () => {
  it('renders an available mission and calls join', () => {
    const onJoin = vi.fn()
    render(<CreatorMissionsView locale="en" t={en.missions} missions={[baseAvailable]} onJoin={onJoin} />)
    expect(screen.getByText('Boutique hotels program')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.missions.joinMission }))
    expect(onJoin).toHaveBeenCalledWith('m1')
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })

  it('shows join action errors returned by the server', async () => {
    const onJoin = vi.fn(async () => ({ ok: false, errors: { form: ['Creator access is required'] } }))
    render(<CreatorMissionsView locale="en" t={en.missions} missions={[baseAvailable]} onJoin={onJoin} />)
    fireEvent.click(screen.getByRole('button', { name: en.missions.joinMission }))
    expect((await screen.findByRole('alert')).textContent).toContain('Creator access is required')
  })

  it('disables actions while pending and refreshes after success', async () => {
    let resolveJoin!: (result: { ok: true }) => void
    const onJoin = vi.fn(() => new Promise<{ ok: true }>((resolve) => { resolveJoin = resolve }))
    render(<CreatorMissionsView locale="en" t={en.missions} missions={[baseAvailable]} onJoin={onJoin} />)
    const button = screen.getByRole('button', { name: en.missions.joinMission })
    fireEvent.click(button)
    expect(button).toHaveProperty('disabled', true)
    resolveJoin({ ok: true })
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
  })

  it('only disables the mission whose action is in flight', () => {
    const onJoin = vi.fn(() => new Promise<{ ok: true }>(() => {}))
    render(
      <CreatorMissionsView
        locale="en"
        t={en.missions}
        missions={[
          { ...baseAvailable, id: 'm1', missionType: 'coupon_affiliate' },
          { ...baseAvailable, id: 'm2', title: 'Paid reel', missionType: 'paid' },
        ]}
        onJoin={onJoin}
      />,
    )
    const joinButton = screen.getByRole('button', { name: en.missions.joinMission })
    const applyButton = screen.getByRole('button', { name: en.missions.applyMission })
    fireEvent.click(joinButton)
    expect(joinButton).toHaveProperty('disabled', true)
    expect(applyButton).toHaveProperty('disabled', false)
  })

  it('uses apply copy for paid missions', () => {
    const onJoin = vi.fn()
    render(
      <CreatorMissionsView
        locale="en"
        t={en.missions}
        missions={[{ ...baseAvailable, id: 'm2', missionType: 'paid' }]}
        onJoin={onJoin}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: en.missions.applyMission }))
    expect(onJoin).toHaveBeenCalledWith('m2')
  })

  it('renders joined missions under My missions with progress and no join button', () => {
    render(<CreatorMissionsView locale="en" t={en.missions} missions={[baseMine]} onJoin={vi.fn()} />)
    expect(screen.getByText('Summer in Shibuya')).toBeTruthy()
    expect(screen.getByText(`1 / 3 ${en.missions.milestoneProgress}`)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.missions.applyMission })).toBeNull()
  })

  it('shows an empty state for each band', () => {
    render(<CreatorMissionsView locale="en" t={en.missions} missions={[]} onJoin={vi.fn()} />)
    expect(screen.getByText(en.missions.myMissionsEmpty)).toBeTruthy()
    expect(screen.getByText(en.missions.availableEmpty)).toBeTruthy()
  })

  it('links each card to its detail page', () => {
    render(<CreatorMissionsView locale="en" t={en.missions} missions={[baseMine, baseAvailable]} onJoin={vi.fn()} />)
    const links = screen.getAllByRole('link', { name: en.missions.viewDetails })
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/en/studio/missions/m9', '/en/studio/missions/m1']),
    )
  })
})
