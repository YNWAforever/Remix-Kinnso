import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  creators: [] as unknown[],
  guides: [] as unknown[],
  single: null as unknown,
}))

vi.mock('@/lib/supabase/public', () => {
  const make = (resolveData: () => unknown, single?: () => unknown) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      not: () => builder,
      in: () => builder,
      // queries chain one or more .order() calls, then await the builder (thenable)
      order: () => builder,
      maybeSingle: async () => ({ data: single ? single() : null }),
      then: (onF: (v: { data: unknown }) => unknown) =>
        Promise.resolve({ data: resolveData() }).then(onF),
    }
    return builder
  }
  return {
    createSupabasePublicClient: () => ({
      from: (table: string) =>
        table === 'creators'
          ? make(() => state.creators, () => state.single)
          : make(() => state.guides),
    }),
  }
})

import { getPublicCreators, getCreatorByHandle, getCreatorPublicNames, getCreatorsForSitemap } from '@/lib/creators/queries'

const creatorRow = {
  id: 'c1',
  handle: 'maya',
  display_name: 'Maya Wanders',
  bio: 'Slow travel in Asia.',
  public_profile: {
    niches: ['Coffee', 'City Walk'],
    content_pillars: ['Cafes'],
    tone: ['calm'],
    audience_geos: ['HK', 'TW'],
    audience_locales: ['zh-HK'],
    languages: ['en', 'zh-HK'],
    platforms: [{ platform: 'instagram', verified: false }],
  },
}

beforeEach(() => {
  state.creators = []
  state.guides = []
  state.single = null
})

describe('getPublicCreators', () => {
  it('maps creators and tallies published guides by creator_id', async () => {
    state.creators = [creatorRow]
    state.guides = [{ creator_id: 'c1' }, { creator_id: 'c1' }, { creator_id: 'cX' }]
    const result = await getPublicCreators()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      handle: 'maya',
      name: 'Maya Wanders',
      bio: 'Slow travel in Asia.',
      niches: ['Coffee', 'City Walk'],
      guideCount: 2,
    })
  })

  it('returns an empty array when no creators are published', async () => {
    state.creators = []
    expect(await getPublicCreators()).toEqual([])
  })
})

describe('getCreatorByHandle', () => {
  it('returns a PublicCreator with projection + published guides', async () => {
    state.single = creatorRow
    state.guides = [
      { slug: 'osaka', title: 'Osaka', cover_url: 'x', city: 'Osaka', saves_count: 3, creator_handle: 'maya' },
    ]
    const creator = await getCreatorByHandle('maya')
    expect(creator?.handle).toBe('maya')
    expect(creator?.profile.platforms[0]).toEqual({ platform: 'instagram', verified: false })
    expect(creator?.guides).toHaveLength(1)
    expect(creator?.guides[0].slug).toBe('osaka')
  })

  it('returns null for an unknown handle', async () => {
    state.single = null
    expect(await getCreatorByHandle('nobody')).toBeNull()
  })
})

describe('getCreatorPublicNames', () => {
  it('maps ids to display_name (falling back to handle)', async () => {
    state.creators = [
      { id: 'c1', handle: 'maya', display_name: 'Maya Wanders' },
      { id: 'c2', handle: 'leo', display_name: null },
    ]
    const map = await getCreatorPublicNames(['c1', 'c2'])
    expect(map.get('c1')).toEqual({ name: 'Maya Wanders', handle: 'maya' })
    expect(map.get('c2')).toEqual({ name: 'leo', handle: 'leo' })
  })

  it('omits ids with no public row and dedupes/ignores empties', async () => {
    state.creators = [{ id: 'c1', handle: 'maya', display_name: 'Maya Wanders' }]
    const map = await getCreatorPublicNames(['c1', 'c1', '', 'unknown'])
    expect(map.size).toBe(1)
    expect(map.get('unknown')).toBeUndefined()
  })

  it('returns an empty map for no ids', async () => {
    expect((await getCreatorPublicNames([])).size).toBe(0)
  })
})

describe('getCreatorsForSitemap', () => {
  it('returns active handles with a lastmod', async () => {
    state.creators = [{ handle: 'maya', created_at: '2026-06-03T00:00:00Z' }]
    const rows = await getCreatorsForSitemap()
    expect(rows).toEqual([{ handle: 'maya', lastmod: '2026-06-03T00:00:00Z' }])
  })
  it('returns [] when there are no active creators', async () => {
    state.creators = []
    expect(await getCreatorsForSitemap()).toEqual([])
  })
})
