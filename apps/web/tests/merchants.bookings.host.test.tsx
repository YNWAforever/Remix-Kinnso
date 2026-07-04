// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MerchantBookingsView } from '@/components/kinnso/pages/MerchantBookingsView'

afterEach(cleanup)

const messages = {
  title: 'Bookings',
  empty: 'No bookings yet.',
  colExperience: 'Experience',
  colTraveler: 'Traveller',
  colCreator: 'Booked via',
  colQty: 'Qty',
  colAmount: 'Amount',
  colStatus: 'Status',
  directLabel: 'Direct',
  markCompleteButton: 'Mark completed',
  statusPendingPayment: 'Awaiting payment',
  statusConfirmed: 'Confirmed',
  statusCompleted: 'Completed',
  statusCancelled: 'Cancelled',
  statusRefunded: 'Refunded',
}

describe('MerchantBookingsView', () => {
  it('renders the empty state with zero bookings', () => {
    render(
      <MerchantBookingsView locale="en" t={messages} bookings={[]} onComplete={vi.fn()} />,
    )
    expect(screen.getByText('No bookings yet.')).toBeInTheDocument()
  })

  it('renders a booking row with "Direct" attribution and a working complete button for confirmed bookings', () => {
    render(
      <MerchantBookingsView
        locale="en"
        t={messages}
        bookings={[
          {
            id: 'b1',
            experienceTitle: 'Hidden Waterfall Hike',
            status: 'confirmed',
            qty: 2,
            totalAmount: 900,
            currency: 'HKD',
            travelerLabel: 'tr***@example.com',
            creatorLabel: 'Direct',
            createdAt: '2026-07-04T00:00:00Z',
          },
        ]}
        onComplete={vi.fn()}
      />,
    )
    expect(screen.getByText('Hidden Waterfall Hike')).toBeInTheDocument()
    expect(screen.getByText('Direct')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark completed' })).toBeInTheDocument()
  })

  it('does not render a complete button for a pending_payment booking', () => {
    render(
      <MerchantBookingsView
        locale="en"
        t={messages}
        bookings={[
          {
            id: 'b2',
            experienceTitle: 'Hidden Waterfall Hike',
            status: 'pending_payment',
            qty: 1,
            totalAmount: 450,
            currency: 'HKD',
            travelerLabel: 'tr***@example.com',
            creatorLabel: 'Direct',
            createdAt: '2026-07-04T00:00:00Z',
          },
        ]}
        onComplete={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Mark completed' })).not.toBeInTheDocument()
  })
})
