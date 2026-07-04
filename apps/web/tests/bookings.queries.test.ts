import { describe, expect, it, vi } from 'vitest'

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}))

vi.mock('@supabase/supabase-js', () => ({}))

import { listMerchantBookings } from '@/lib/bookings/queries'

function chainable(result: unknown) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'order', 'in']
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

describe('listMerchantBookings', () => {
  it('maps a null creator to the "Direct" label and masks the guest email', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            id: 'b1',
            status: 'confirmed',
            qty: 2,
            total_amount: 900,
            currency: 'HKD',
            traveler_user_id: null,
            guest_email: 'traveler@example.com',
            creator_id: null,
            created_at: '2026-07-04T00:00:00Z',
            experiences: { title: 'Hidden Waterfall Hike' },
          },
        ],
        error: null,
      }),
    )

    const rows = await listMerchantBookings(supabaseMock as never, 'merchant-profile-1')

    expect(rows[0].creatorLabel).toBe('Direct')
    // maskGuestEmail('traveler@example.com') -> first 2 chars of the local part,
    // asterisks padding out the rest of the local-part length, then the untouched domain.
    expect(rows[0].travelerLabel).toBe('tr******@example.com')
    expect(rows[0].travelerLabel).not.toBe('traveler@example.com')
    expect(rows[0].experienceTitle).toBe('Hidden Waterfall Hike')
  })

  it('labels the traveler with the creator display name, or handle if no display name, when a creator is attached', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            id: 'b2',
            status: 'completed',
            qty: 1,
            total_amount: 450,
            currency: 'HKD',
            traveler_user_id: 'user-1',
            guest_email: null,
            creator_id: 'creator-1',
            created_at: '2026-07-03T00:00:00Z',
            experiences: { title: 'Night Market Food Tour' },
            creators: { handle: 'foodie_hana', display_name: 'Hana' },
          },
        ],
        error: null,
      }),
    )

    const rows = await listMerchantBookings(supabaseMock as never, 'merchant-profile-1')

    expect(rows[0].creatorLabel).toBe('Hana')
    expect(rows[0].travelerLabel).toBe('user-1')
  })
})
