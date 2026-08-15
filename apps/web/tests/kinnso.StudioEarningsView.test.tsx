// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StudioEarningsView } from '@/components/kinnso/pages/StudioEarningsView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const empty = { missions: [], bookings: [], tracked: [], totals: [] }

const missions = [
  {
    id: 'ms1',
    missionTitle: 'Tokyo ramen crawl',
    missionType: 'paid',
    missionSource: 'merchant',
    currency: 'HKD',
    amount: 1200,
    payoutStatus: 'pending' as const,
  },
]
const bookings = [
  { id: 'bs1', experienceTitle: 'Sunset harbour walk', currency: 'HKD', amount: 80.5, payoutStatus: 'paid' as const },
]
const tracked = [
  { id: 'ev1', missionTitle: 'Flight deals', currency: 'USD', grossAmount: 15.25, eventState: 'processing' },
]

describe('StudioEarningsView', () => {
  it('shows a per-section empty state when the creator has nothing', () => {
    render(<StudioEarningsView t={en.studioEarnings} data={empty} />)
    expect(screen.getByText(en.studioEarnings.missionsEmpty)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.bookingsEmpty)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.trackedEmpty)).toBeTruthy()
  })

  it('renders booking commission even when there are no mission settlements', () => {
    render(<StudioEarningsView t={en.studioEarnings} data={{ ...empty, bookings }} />)
    expect(screen.getByText('Sunset harbour walk')).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.missionsEmpty)).toBeTruthy()
  })

  it('renders all three sections with their headings', () => {
    render(
      <StudioEarningsView
        t={en.studioEarnings}
        data={{ missions, bookings, tracked, totals: [{ currency: 'HKD', paid: 80.5, pending: 1200 }] }}
      />,
    )
    expect(screen.getByText(en.studioEarnings.missionsHeading)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.bookingsHeading)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.trackedHeading)).toBeTruthy()
    expect(screen.getByText('Tokyo ramen crawl')).toBeTruthy()
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })

  it('states that tracked volume is not payable', () => {
    render(<StudioEarningsView t={en.studioEarnings} data={{ ...empty, tracked, totals: [] }} />)
    expect(screen.getByText(en.studioEarnings.trackedNote)).toBeTruthy()
    // The row itself IS shown — it is real, recorded volume.
    expect(screen.getByText('Flight deals')).toBeTruthy()
  })

  it('renders no totals card when the only money is tracked, not payable', () => {
    render(<StudioEarningsView t={en.studioEarnings} data={{ ...empty, tracked, totals: [] }} />)
    // A totals card renders a ReceiptRow labelled t.paid; the mission/booking tables are
    // empty here, so no status badge can supply that text either. Its absence proves the
    // USD tracked row did not manufacture a USD totals card.
    expect(screen.queryByText(en.studioEarnings.paid)).toBeNull()
    expect(screen.queryByText(en.studioEarnings.pending)).toBeNull()
  })
})
