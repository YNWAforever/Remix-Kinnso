// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TravelerTripsView } from '@/components/kinnso/pages/TravelerTripsView'

afterEach(cleanup)

const messages = {
  title: 'Your trips',
  empty: 'No bookings yet — once you book an experience, it’ll show up here.',
  colExperience: 'Experience',
  colMerchant: 'Merchant',
  colStatus: 'Status',
  colAmount: 'Amount',
  statusPendingPayment: 'Awaiting payment',
  statusConfirmed: 'Confirmed',
  statusCompleted: 'Completed',
  statusCancelled: 'Cancelled',
  statusRefunded: 'Refunded',
  savesTabTitle: 'Saved',
  savesTabComingSoon: 'Coming soon.',
}

describe('TravelerTripsView', () => {
  it('renders the empty state', () => {
    render(<TravelerTripsView locale="en" t={messages} bookings={[]} />)
    expect(screen.getByText(/No bookings yet/)).toBeInTheDocument()
  })

  it('renders a booking row', () => {
    render(
      <TravelerTripsView
        locale="en"
        t={messages}
        bookings={[
          {
            id: 'b1',
            experienceTitle: 'Hidden Waterfall Hike',
            experienceSlug: 'hidden-waterfall-hike',
            merchantName: 'Sunrise Stays HK',
            status: 'confirmed',
            qty: 2,
            totalAmount: 900,
            currency: 'HKD',
            bookingDate: '2026-08-01',
            createdAt: '2026-07-04T00:00:00Z',
          },
        ]}
      />,
    )
    expect(screen.getByText('Hidden Waterfall Hike')).toBeInTheDocument()
    expect(screen.getByText('Sunrise Stays HK')).toBeInTheDocument()
  })

  it('renders a booking row with a null bookingDate without crashing', () => {
    render(
      <TravelerTripsView
        locale="en"
        t={messages}
        bookings={[
          {
            id: 'b2',
            experienceTitle: 'City Food Crawl',
            experienceSlug: 'city-food-crawl',
            merchantName: 'Tasty Trails',
            status: 'pending_payment',
            qty: 1,
            totalAmount: 450,
            currency: 'HKD',
            bookingDate: null,
            createdAt: '2026-07-04T00:00:00Z',
          },
        ]}
      />,
    )
    expect(screen.getByText('City Food Crawl')).toBeInTheDocument()
    expect(screen.getByText('Awaiting payment')).toBeInTheDocument()
  })

  it('shows the saves tab as empty/coming-soon, not faked (D-R3-5)', () => {
    render(<TravelerTripsView locale="en" t={messages} bookings={[]} />)
    expect(screen.getByText('Coming soon.')).toBeInTheDocument()
  })
})
