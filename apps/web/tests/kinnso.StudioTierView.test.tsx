// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { StudioTierView } from '@/components/kinnso/pages/StudioTierView'
import { progressToNext } from '@/lib/contribution/tiers'

afterEach(cleanup)

const events = [
  { id: 'e1', eventType: 'mission_verified' as const, points: 40, createdAt: '2026-06-20T00:00:00Z' },
  { id: 'e2', eventType: 'guide_published' as const, points: 15, createdAt: '2026-06-19T00:00:00Z' },
]

describe('StudioTierView', () => {
  it('renders current tier, all four tiers, and points history', () => {
    render(<StudioTierView t={en.tier} contribution={progressToNext(55)} events={events} />)
    expect(screen.getByText('Tier & contribution')).toBeTruthy()
    expect(screen.getByText('All tiers')).toBeTruthy()
    // all four ladder labels present
    expect(screen.getByText('Seed')).toBeTruthy()
    expect(screen.getByText('Pro')).toBeTruthy()
    expect(screen.getByText('Elite')).toBeTruthy()
    // history rows by event label
    expect(screen.getByText('Mission verified')).toBeTruthy()
    expect(screen.getByText('Guide published')).toBeTruthy()
  })

  it('shows the empty history state when there are no events', () => {
    render(<StudioTierView t={en.tier} contribution={progressToNext(0)} events={[]} />)
    expect(
      screen.getByText('No points yet — publish a guide or complete a mission to get started.'),
    ).toBeTruthy()
  })
})
