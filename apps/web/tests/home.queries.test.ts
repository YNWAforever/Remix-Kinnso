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
  it('maps the RPC row to camelCase numbers', async () => {
    publicClientMock.mockReturnValue({
      rpc: vi.fn(async () => ({ data: [{ active_creators: 12, published_guides: 48, destinations: 9 }], error: null })),
    })
    expect(await getPlatformStats()).toEqual({ activeCreators: 12, publishedGuides: 48, destinations: 9 })
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

describe('getUpcomingSessions (R5 stub)', () => {
  it('returns an empty list so the homepage Sessions section data-gates off', async () => {
    expect(await getUpcomingSessions()).toEqual([])
  })
})

describe('display thresholds (locked R1B decisions)', () => {
  it('exports the honesty thresholds as constants', () => {
    expect(STAT_THRESHOLDS).toEqual({ activeCreators: 5, publishedGuides: 10, destinations: 3 })
    expect(MIN_VISIBLE_STATS).toBe(2)
  })
})
