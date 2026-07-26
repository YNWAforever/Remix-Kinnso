import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  creators: [] as unknown[],
  guides: [] as unknown[],
  single: null as unknown,
  selects: [] as string[],
  creatorError: null as unknown,
  guideError: null as unknown,
}))

vi.mock('@/lib/supabase/public', () => {
  const make = (resolveData: () => unknown, resolveError: () => unknown, single?: () => unknown) => {
    const builder: Record<string, unknown> = {
      select: (columns: string) => { state.selects.push(columns); return builder },
      eq: () => builder,
      not: () => builder,
      in: () => builder,
      // queries chain one or more .order() calls, then await the builder (thenable)
      order: () => builder,
      maybeSingle: async () => ({ data: single ? single() : null, error: resolveError() }),
      then: (onF: (v: { data: unknown }) => unknown) =>
        Promise.resolve({ data: resolveData(), error: resolveError() }).then(onF),
    }
    return builder
  }
  return {
    createSupabasePublicClient: () => ({
      from: (table: string) =>
        table === 'creators'
          ? make(() => state.creators, () => state.creatorError, () => state.single)
          : make(() => state.guides, () => state.guideError),
    }),
  }
})

import { getPublicCreators, getCreatorByHandle, getCreatorPublicNames, getCreatorsForSitemap, getPublishedGuidesForCreator } from '@/lib/creators/queries'

const creatorRow = {
  id: 'c1',
  is_listed: false,
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
  state.selects = []
  state.creatorError = null
  state.guideError = null
})

describe('getPublicCreators', () => {
  it('shares guide-or-override eligibility with the sitemap', async () => {
    state.creators = [
      { ...creatorRow, id: 'with-guide', handle: 'with-guide', is_listed: false },
      { ...creatorRow, id: 'override', handle: 'override', is_listed: true },
      { ...creatorRow, id: 'hidden', handle: 'hidden', is_listed: false },
    ]
    state.guides = [{ creator_id: 'with-guide' }]

    expect((await getPublicCreators()).map((c) => c.handle)).toEqual(['with-guide', 'override'])
    expect((await getCreatorsForSitemap()).map((c) => c.handle)).toEqual(['with-guide', 'override'])
  })

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
  it('keeps a directly returned active hidden creator renderable', async () => {
    state.single = { ...creatorRow, id: 'hidden', handle: 'hidden', is_listed: false }
    state.guides = []
    expect((await getCreatorByHandle('hidden'))?.handle).toBe('hidden')
  })

  it('keeps the core creator independent from its published guides enrichment', async () => {
    state.single = creatorRow
    state.guides = [
      { slug: 'osaka', title: 'Osaka', cover_url: 'x', city: 'Osaka', saves_count: 3, creator_handle: 'maya' },
    ]
    const creator = await getCreatorByHandle('maya')
    expect(creator?.handle).toBe('maya')
    expect(creator?.profile.platforms[0]).toEqual({ platform: 'instagram', verified: false })
    expect(creator?.guides).toEqual([])
    expect((await getPublishedGuidesForCreator('c1'))[0].slug).toBe('osaka')
  })

  it('throws an explicit Supabase error from the creator guides query', async () => {
    const error = { code: 'PGRST205', message: 'guides schema unavailable' }
    state.guideError = error
    await expect(getPublishedGuidesForCreator('c1')).rejects.toBe(error)
  })

  it('selects a stable creator id and avatar URL and only retains real follower counts', async () => {
    state.single = {
      ...creatorRow,
      avatar_url: 'https://images.example.test/maya.jpg',
      public_profile: {
        ...creatorRow.public_profile,
        platforms: [
          { platform: 'instagram', verified: true, followers: 12500 },
          { platform: 'youtube', verified: false, followers: -1 },
          { platform: 'threads', verified: false, followers: Number.POSITIVE_INFINITY },
        ],
      },
    }

    const creator = await getCreatorByHandle('maya')

    expect(state.selects[0]).toContain('id')
    expect(state.selects[0]).toContain('avatar_url')
    expect(creator).toMatchObject({ id: 'c1', avatarUrl: 'https://images.example.test/maya.jpg' })
    expect(creator?.profile.platforms).toEqual([
      { platform: 'instagram', verified: true, followers: 12500 },
      { platform: 'youtube', verified: false },
      { platform: 'threads', verified: false },
    ])
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
    state.creators = [{ id: 'c1', is_listed: true, handle: 'maya', created_at: '2026-06-03T00:00:00Z' }]
    const rows = await getCreatorsForSitemap()
    expect(rows).toEqual([{ handle: 'maya', lastmod: '2026-06-03T00:00:00Z' }])
  })
  it('returns [] when there are no active creators', async () => {
    state.creators = []
    expect(await getCreatorsForSitemap()).toEqual([])
  })
})
