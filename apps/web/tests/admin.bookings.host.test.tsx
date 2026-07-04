// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminBookingsView } from '@/components/kinnso/admin/bookings/AdminBookingsView'

afterEach(cleanup)

const messages = {
  title: 'Bookings & Settlements',
  empty: 'No bookings yet.',
  colExperience: 'Experience',
  colMerchantPayout: 'Merchant payout',
  colCreatorCommission: 'Creator commission',
  colKinnsoCommission: 'Kinnso commission',
  colStatus: 'Status',
  noCreatorLeg: 'No creator (direct booking)',
  markPaidButton: 'Mark all paid',
  reasonPlaceholder: 'Reason (required)',
  actionFailed: 'Action failed. Try again.',
}

describe('AdminBookingsView', () => {
  it('shows "No creator (direct booking)" when the creator leg is null', () => {
    render(
      <AdminBookingsView
        locale="en"
        t={messages}
        settlements={[
          {
            id: 's1',
            bookingId: 'b1',
            experienceTitle: 'Hidden Waterfall Hike',
            status: 'pending',
            merchantPayoutStatus: 'pending',
            merchantPayoutAmount: 900,
            creatorCommissionStatus: null,
            creatorCommissionAmount: null,
            kinnsoCommissionStatus: 'pending',
            kinnsoCommissionAmount: 100,
            currency: 'HKD',
          },
        ]}
        onMarkPaid={vi.fn()}
      />,
    )
    expect(screen.getByText('No creator (direct booking)')).toBeInTheDocument()
  })

  it('renders the empty state', () => {
    render(
      <AdminBookingsView
        locale="en"
        t={messages}
        settlements={[]}
        onMarkPaid={vi.fn()}
      />,
    )
    expect(screen.getByText('No bookings yet.')).toBeInTheDocument()
  })

  it('gives each row\'s mark-paid button a per-row accessible name', () => {
    render(
      <AdminBookingsView
        locale="en"
        t={messages}
        settlements={[
          {
            id: 's1',
            bookingId: 'b1',
            experienceTitle: 'Hidden Waterfall Hike',
            status: 'pending',
            merchantPayoutStatus: 'pending',
            merchantPayoutAmount: 900,
            creatorCommissionStatus: null,
            creatorCommissionAmount: null,
            kinnsoCommissionStatus: 'pending',
            kinnsoCommissionAmount: 100,
            currency: 'HKD',
          },
          {
            id: 's2',
            bookingId: 'b2',
            experienceTitle: 'Sunset Kayak Tour',
            status: 'pending',
            merchantPayoutStatus: 'pending',
            merchantPayoutAmount: 500,
            creatorCommissionStatus: 'pending',
            creatorCommissionAmount: 50,
            kinnsoCommissionStatus: 'pending',
            kinnsoCommissionAmount: 60,
            currency: 'HKD',
          },
        ]}
        onMarkPaid={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Mark all paid Hidden Waterfall Hike' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark all paid Sunset Kayak Tour' })).toBeInTheDocument()
  })
})
