// apps/web/tests/destinations.queries.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ list: [] as unknown[], single: null as unknown }))
const orderSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: (col: string, opts: unknown) => { orderSpy(col, opts); return builder },
        maybeSingle: async () => ({ data: state.single }),
        then: (onF: (v: { data: unknown }) => unknown) =>
          Promise.resolve({ data: state.list }).then(onF),
      }
      return builder
    },
  }),
}))

import { getPublishedDestinations, getDestinationBySlug, getDestinationsForSitemap } from '@/lib/destinations/queries'

const row = {
  slug: 'tokyo', name: 'Tokyo', hero_image_url: 'https://example.com/tokyo.jpg',
  description: 'Neon nights and quiet shrines.', match_terms: ['Tokyo', 'Shibuya', 'Shinjuku'],
}

beforeEach(() => {
  state.list = []
  state.single = null
  orderSpy.mockClear()
})

describe('getPublishedDestinations', () => {
  it('maps published rows ordered by sort_order ascending', async () => {
    state.list = [row]
    const result = await getPublishedDestinations()
    expect(result).toEqual([{
      slug: 'tokyo', name: 'Tokyo', heroImageUrl: 'https://example.com/tokyo.jpg',
      description: 'Neon nights and quiet shrines.', matchTerms: ['Tokyo', 'Shibuya', 'Shinjuku'],
    }])
    expect(orderSpy).toHaveBeenCalledWith('sort_order', { ascending: true })
  })

  it('returns [] when there are no published destinations', async () => {
    state.list = []
    expect(await getPublishedDestinations()).toEqual([])
  })

  it('defaults matchTerms to [] when the row has none', async () => {
    state.list = [{ ...row, match_terms: null }]
    const result = await getPublishedDestinations()
    expect(result[0].matchTerms).toEqual([])
  })
})

describe('getDestinationBySlug', () => {
  it('returns the mapped destination when a published row exists', async () => {
    state.single = row
    const dest = await getDestinationBySlug('tokyo')
    expect(dest?.name).toBe('Tokyo')
  })

  it('returns null when no row matches', async () => {
    state.single = null
    expect(await getDestinationBySlug('nowhere')).toBeNull()
  })
})

describe('getDestinationsForSitemap', () => {
  it('returns published slugs with a lastmod', async () => {
    state.list = [{ slug: 'tokyo', published_at: '2026-07-01T00:00:00Z' }]
    expect(await getDestinationsForSitemap()).toEqual([{ slug: 'tokyo', lastmod: '2026-07-01T00:00:00Z' }])
  })
  it('returns [] when there are no published destinations', async () => {
    state.list = []
    expect(await getDestinationsForSitemap()).toEqual([])
  })
})
