// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))
vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({ from: fromMock }),
}))

import { listPublicAvailability } from '@/lib/experiences/public-availability-queries'

beforeEach(() => fromMock.mockReset())

describe('listPublicAvailability', () => {
  it('maps rows to camelCase and computes remaining capacity', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({
              order: () => Promise.resolve({
                data: [{ id: 'a1', date: '2026-08-01', capacity: 10, booked_count: 3 }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })
    const rows = await listPublicAvailability('exp1')
    expect(rows).toEqual([{ id: 'a1', date: '2026-08-01', remaining: 7 }])
  })

  it('clamps remaining to zero rather than going negative', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({
              order: () => Promise.resolve({
                data: [{ id: 'a1', date: '2026-08-01', capacity: 5, booked_count: 5 }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })
    const rows = await listPublicAvailability('exp1')
    expect(rows[0].remaining).toBe(0)
  })

  it('propagates errors', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({ order: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }),
          }),
        }),
      }),
    })
    await expect(listPublicAvailability('exp1')).rejects.toBeTruthy()
  })
})
