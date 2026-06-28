import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mutable mock state, read fresh on each query call.
const state = vi.hoisted(() => ({ list: [] as unknown[], single: null as unknown }))

vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        // queries chain one or more .order() calls, then await the builder (thenable)
        order: () => builder,
        // getGuideBySlug awaits .maybeSingle()
        maybeSingle: async () => ({ data: state.single }),
        then: (onF: (v: { data: unknown }) => unknown) =>
          Promise.resolve({ data: state.list }).then(onF),
      }
      return builder
    },
  }),
}))

import { mapRowToGuide, getPublishedGuides, getGuideBySlug, getGuidesForSitemap } from '@/lib/guides/queries'
import { guides as mockGuides } from '@/lib/creator-mock'

const row = {
  slug: 'kyoto-tea',
  title: 'Kyoto Tea Houses',
  cover_url: 'https://example.com/kyoto.jpg',
  city: 'Kyoto',
  saves_count: 42,
  creator_handle: 'teafan',
}

beforeEach(() => {
  state.list = []
  state.single = null
})

describe('mapRowToGuide', () => {
  it('maps a db row to the public Guide shape', () => {
    expect(mapRowToGuide(row)).toEqual({
      slug: 'kyoto-tea',
      title: 'Kyoto Tea Houses',
      cover: 'https://example.com/kyoto.jpg',
      city: 'Kyoto',
      saves: 42,
      creatorHandle: 'teafan',
    })
  })
})

describe('getPublishedGuides', () => {
  it('returns only DB guides (no mock seed appended)', async () => {
    state.list = [row]
    const result = await getPublishedGuides()
    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('kyoto-tea')
    expect(result.some((g) => g.slug === mockGuides[0].slug)).toBe(false)
  })

  it('returns an empty array when the DB has no published guides', async () => {
    state.list = []
    expect(await getPublishedGuides()).toEqual([])
  })
})

describe('getGuideBySlug', () => {
  it('returns the db guide (source: db) when a row exists, threading published_at', async () => {
    state.single = { ...row, creator_name: 'Tea Fan', summary: 'Lovely tea houses.', published_at: '2026-06-02T00:00:00Z' }
    const guide = await getGuideBySlug('kyoto-tea')
    expect(guide?.slug).toBe('kyoto-tea')
    expect(guide?.source).toBe('db')
    expect(guide?.publishedAt).toBe('2026-06-02T00:00:00Z')
  })

  it('defaults publishedAt to null when the row has no published_at', async () => {
    state.single = { ...row, creator_name: 'Tea Fan', summary: null }
    const guide = await getGuideBySlug('kyoto-tea')
    expect(guide?.publishedAt).toBeNull()
  })

  it('returns null for a slug not in the database (no mock fallback)', async () => {
    state.single = null
    expect(await getGuideBySlug(mockGuides[0].slug)).toBeNull()
  })
})

describe('getGuidesForSitemap', () => {
  it('returns published slugs with a lastmod', async () => {
    state.list = [{ slug: 'kyoto-tea', published_at: '2026-06-02T00:00:00Z' }]
    const rows = await getGuidesForSitemap()
    expect(rows).toEqual([{ slug: 'kyoto-tea', lastmod: '2026-06-02T00:00:00Z' }])
  })
  it('returns [] when there are no published guides', async () => {
    state.list = []
    expect(await getGuidesForSitemap()).toEqual([])
  })
})
