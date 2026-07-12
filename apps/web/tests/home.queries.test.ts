import { describe, it, expect, vi } from 'vitest'

const { publicClientMock } = vi.hoisted(() => ({ publicClientMock: vi.fn() }))
vi.mock('@/lib/supabase/public', () => ({ createSupabasePublicClient: publicClientMock }))

import {
  getPlatformStats,
  getPublishedTestimonials, getUpcomingSessions, STAT_THRESHOLDS, MIN_VISIBLE_STATS, shuffle
} from '@/lib/home/queries'

describe('getPlatformStats', () => {
  it('maps the RPC row to camelCase numbers, including completed_bookings', async () => {
    publicClientMock.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: [{ active_creators: 12, published_guides: 48, destinations: 9, completed_bookings: 4, upcoming_sessions: 6 }],
        error: null,
      })),
    })
    expect(await getPlatformStats()).toEqual({
      activeCreators: 12, publishedGuides: 48, destinations: 9, completedBookings: 4, upcomingSessions: 6,
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
  it('maps upcoming_sessions alongside the existing stats', async () => {
    publicClientMock.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: [{ active_creators: 12, published_guides: 48, destinations: 9, completed_bookings: 4, upcoming_sessions: 6 }],
        error: null,
      })),
    })
    expect(await getPlatformStats()).toEqual({
      activeCreators: 12, publishedGuides: 48, destinations: 9, completedBookings: 4, upcomingSessions: 6,
    })
  })
})

describe('getPublishedTestimonials', () => {
  it('reads published rows for the locale OR all-locale rows (no DB-side ordering/limit)', async () => {
    const or = vi.fn(() => Promise.resolve({
      data: [{ id: 't1', quote: 'q', author_name: 'Mei', author_role: 'creator' }],
      error: null,
    }))
    const eq = vi.fn(() => ({ or }))
    const select = vi.fn(() => ({ eq }))
    publicClientMock.mockReturnValue({ from: vi.fn(() => ({ select })) })

    const rows = await getPublishedTestimonials('zh-hk')
    expect(eq).toHaveBeenCalledWith('status', 'published')
    expect(or).toHaveBeenCalledWith('locale.is.null,locale.eq.zh-hk')
    expect(rows).toEqual([{ id: 't1', quote: 'q', authorName: 'Mei', authorRole: 'creator' }])
  })

  it('filters by author_role when given', async () => {
    const eqRole = vi.fn(() => Promise.resolve({
      data: [{ id: 't2', quote: 'q2', author_name: 'Sam', author_role: 'creator' }],
      error: null,
    }))
    const or = vi.fn(() => ({ eq: eqRole }))
    const eq = vi.fn(() => ({ or }))
    const select = vi.fn(() => ({ eq }))
    publicClientMock.mockReturnValue({ from: vi.fn(() => ({ select })) })

    await getPublishedTestimonials('en', 'creator')
    expect(eqRole).toHaveBeenCalledWith('author_role', 'creator')
  })

  it('shuffles the pool and caps the result at 3, never inventing or duplicating rows', async () => {
    const or = vi.fn(() => Promise.resolve({
      data: [
        { id: 't1', quote: 'q1', author_name: 'A', author_role: 'creator' },
        { id: 't2', quote: 'q2', author_name: 'B', author_role: 'creator' },
        { id: 't3', quote: 'q3', author_name: 'C', author_role: 'creator' },
        { id: 't4', quote: 'q4', author_name: 'D', author_role: 'creator' },
        { id: 't5', quote: 'q5', author_name: 'E', author_role: 'creator' },
      ],
      error: null,
    }))
    const eq = vi.fn(() => ({ or }))
    const select = vi.fn(() => ({ eq }))
    publicClientMock.mockReturnValue({ from: vi.fn(() => ({ select })) })

    const rows = await getPublishedTestimonials('en')
    expect(rows).toHaveLength(3)
    const allIds = ['t1', 't2', 't3', 't4', 't5']
    for (const r of rows) expect(allIds).toContain(r.id)
    expect(new Set(rows.map((r) => r.id)).size).toBe(3)
  })

  it('returns fewer than 3 when the filtered pool itself has fewer than 3 rows', async () => {
    const or = vi.fn(() => Promise.resolve({
      data: [{ id: 't1', quote: 'q1', author_name: 'A', author_role: 'creator' }],
      error: null,
    }))
    const eq = vi.fn(() => ({ or }))
    const select = vi.fn(() => ({ eq }))
    publicClientMock.mockReturnValue({ from: vi.fn(() => ({ select })) })

    expect(await getPublishedTestimonials('en')).toHaveLength(1)
  })
})

describe('shuffle', () => {
  it('is a pure permutation of the input (same elements, same length)', () => {
    const input = [1, 2, 3, 4, 5]
    const result = shuffle(input, () => 0.5)
    expect(result).toHaveLength(5)
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('does not mutate the input array', () => {
    const input = [1, 2, 3]
    shuffle(input, () => 0.5)
    expect(input).toEqual([1, 2, 3])
  })

  it('produces the expected order for a fixed rand source (rand always 0 -> always swap with index 0)', () => {
    const result = shuffle([1, 2, 3, 4], () => 0)
    expect(result).toEqual([2, 3, 4, 1])
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
      activeCreators: 5, publishedGuides: 10, destinations: 3, completedBookings: 3, upcomingSessions: 1,
    })
    expect(MIN_VISIBLE_STATS).toBe(2)
  })
})
