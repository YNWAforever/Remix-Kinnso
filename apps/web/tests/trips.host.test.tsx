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
  colQty: 'Qty',
  colStatus: 'Status',
  colAmount: 'Amount',
  statusPendingPayment: 'Awaiting payment',
  statusConfirmed: 'Confirmed',
  statusCompleted: 'Completed',
  statusCancelled: 'Cancelled',
  statusRefunded: 'Refunded',
  bookedOnLabel: 'Booked on',
  savedGuidesTitle: 'Saved guides',
  savedGuidesEmpty: "You haven't saved any guides yet.",
  savedExperiencesTitle: 'Saved experiences',
  savedExperiencesEmpty: "You haven't saved any experiences yet.",
  reviewCta: 'Leave a review',
  reviewedLabel: 'Reviewed',
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
    expect(screen.getByText('2')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Hidden Waterfall Hike' })
    expect(link.getAttribute('href')).toBe('/en/experiences/hidden-waterfall-hike')
  })

  it('renders a booking row with a null bookingDate: falls back to "Booked on <createdAt>" (RLS hides past availability dates)', () => {
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
    expect(screen.getByText(/Booked on/)).toBeInTheDocument()
  })

  it('renders plain text (not a link) when experienceSlug is empty — the experience was unpublished after booking', () => {
    render(
      <TravelerTripsView
        locale="en"
        t={messages}
        bookings={[
          {
            id: 'b3',
            experienceTitle: 'Now-Unlisted Tour',
            experienceSlug: '',
            merchantName: 'Vanished Ventures',
            status: 'completed',
            qty: 1,
            totalAmount: 300,
            currency: 'HKD',
            bookingDate: null,
            createdAt: '2026-06-01T00:00:00Z',
          },
        ]}
      />,
    )
    expect(screen.getByText('Now-Unlisted Tour')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Now-Unlisted Tour' })).toBeNull()
  })
})
