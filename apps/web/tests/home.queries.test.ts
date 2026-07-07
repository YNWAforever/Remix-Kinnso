import { describe, it, expect, vi } from 'vitest'

const { publicClientMock } = vi.hoisted(() => ({ publicClientMock: vi.fn() }))
vi.mock('@/lib/supabase/public', () => ({ createSupabasePublicClient: publicClientMock }))

import {
  getPlatformStats,
  getPublishedTestimonials,
  getUpcomingSessions,
  STAT_THRESHOLDS,
  MIN_VISIBLE_STATS,
} from '@/lib/home/queries'

describe('getPlatformStats', () => {
  it('maps the RPC row to camelCase numbers, including completed_bookings', async () => {
    publicClientMock.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: [{ active_creators: 12, published_guides: 48, destinations: 9, completed_bookings: 4 }],
        error: null,
      })),
    })
    expect(await getPlatformStats()).toEqual({
      activeCreators: 12, publishedGuides: 48, destinations: 9, completedBookings: 4,
    })
  })
  it('degrades to null on RPC failure (stats bar hides; homepage stays up)', async () => {
    publicClientMock.mockReturnValue({ rpc: vi.fn(async () => ({ data: null, error: { message: 'boom' } })) })
    expect(await getPlatformStats()).toBeNull()
  })
  it('returns null when the RPC yields no row', async () => {
    publicClientMock.mockReturnValue({ rpc: vi.fn(async () => ({ data: [], error: null })) })
    expect(await getPlatformStats()).toBeNull()
  })
})

describe('getPublishedTestimonials', () => {
  it('reads published rows for the locale OR all-locale rows, ordered, capped at 3', async () => {
    const limit = vi.fn(async () => ({
      data: [{ id: 't1', quote: 'q', author_name: 'Mei', author_role: 'creator' }],
      error: null,
    }))
    const order2 = vi.fn(() => ({ limit }))
    const order1 = vi.fn(() => ({ order: order2 }))
    const or = vi.fn(() => ({ order: order1 }))
    const eq = vi.fn(() => ({ or }))
    const select = vi.fn(() => ({ eq }))
    publicClientMock.mockReturnValue({ from: vi.fn(() => ({ select })) })

    const rows = await getPublishedTestimonials('zh-hk')
    expect(eq).toHaveBeenCalledWith('status', 'published')
    expect(or).toHaveBeenCalledWith('locale.is.null,locale.eq.zh-hk')
    expect(order1).toHaveBeenCalledWith('sort_order', { ascending: true })
    expect(limit).toHaveBeenCalledWith(3)
    expect(rows).toEqual([{ id: 't1', quote: 'q', authorName: 'Mei', authorRole: 'creator' }])
  })

  it('filters by author_role when given', async () => {
    const limit = vi.fn(async () => ({
      data: [{ id: 't2', quote: 'q2', author_name: 'Sam', author_role: 'creator' }],
      error: null,
    }))
    const eqRole = vi.fn(() => ({ limit }))
    const order2 = vi.fn(() => ({ limit, eq: eqRole }))
    const order1 = vi.fn(() => ({ order: order2 }))
    const or = vi.fn(() => ({ order: order1 }))
    const eq = vi.fn(() => ({ or }))
    const select = vi.fn(() => ({ eq }))
    publicClientMock.mockReturnValue({ from: vi.fn(() => ({ select })) })

    await getPublishedTestimonials('en', 'creator')
    expect(eqRole).toHaveBeenCalledWith('author_role', 'creator')
  })
})

describe('getUpcomingSessions (R5)', () => {
  it('queries community_sessions for scheduled+live rows, joins host handle, and returns the UpcomingSession contract including slug', async () => {
    const sessionRow = { id: 's1', slug: 'tokyo-ramen-ama', title: 'Tokyo ramen AMA', starts_at: '2027-01-15T18:00:00.000Z', host_creator_id: 'creator-1' }
    const limit = vi.fn(async () => ({ data: [sessionRow], error: null }))
    const order = vi.fn(() => ({ limit }))
    const inStatus = vi.fn(() => ({ order }))
    const selectSessions = vi.fn(() => ({ in: inStatus }))

    const inIds = vi.fn(async () => ({ data: [{ id: 'creator-1', handle: 'sora' }], error: null }))
    const selectCreators = vi.fn(() => ({ in: inIds }))

    publicClientMock.mockReturnValue({
      from: vi.fn((table: string) => (table === 'community_sessions' ? { select: selectSessions } : { select: selectCreators })),
    })

    const result = await getUpcomingSessions()
    expect(inStatus).toHaveBeenCalledWith('status', ['scheduled', 'live'])
    expect(order).toHaveBeenCalledWith('starts_at', { ascending: true })
    expect(limit).toHaveBeenCalledWith(3)
    expect(inIds).toHaveBeenCalledWith('id', ['creator-1'])
    expect(result).toEqual([{ id: 's1', slug: 'tokyo-ramen-ama', title: 'Tokyo ramen AMA', hostHandle: 'sora', startsAt: '2027-01-15T18:00:00.000Z' }])
  })

  it('drops a session whose host is not yet publicly readable rather than showing a broken handle', async () => {
    const sessionRow = { id: 's1', slug: 'x', title: 'X', starts_at: '2027-01-01T00:00:00.000Z', host_creator_id: 'creator-1' }
    const limit = vi.fn(async () => ({ data: [sessionRow], error: null }))
    publicClientMock.mockReturnValue({
      from: vi.fn((table: string) =>
        table === 'community_sessions'
          ? { select: () => ({ in: () => ({ order: () => ({ limit }) }) }) }
          : { select: () => ({ in: async () => ({ data: [], error: null }) }) },
      ),
    })
    expect(await getUpcomingSessions()).toEqual([])
  })

  it('degrades to [] on any query error, same reads-never-crash stance as getPublishedGuides', async () => {
    publicClientMock.mockReturnValue({
      from: vi.fn(() => ({ select: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) })),
    })
    expect(await getUpcomingSessions()).toEqual([])
  })
})

describe('display thresholds (locked R1B decisions + R3C addition)', () => {
  it('exports the honesty thresholds as constants', () => {
    expect(STAT_THRESHOLDS).toEqual({
      activeCreators: 5, publishedGuides: 10, destinations: 3, completedBookings: 3,
    })
    expect(MIN_VISIBLE_STATS).toBe(2)
  })
})
