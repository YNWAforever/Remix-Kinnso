import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LegacyPostBundle, UpsertPayload } from '../src/types'
import { legacyPost } from './fixtures/legacyPost'

const state = vi.hoisted(() => ({
  bundles: new Map<number, LegacyPostBundle>(),
  ids: [] as number[],
  upserts: [] as Array<UpsertPayload & { warnings?: unknown[] }>,
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('../src/reader', () => ({
  LegacyReader: class {
    async fetchPostBundle(id: number) { return state.bundles.get(id) ?? null }
    async allPostIds(afterId: number) {
      if (afterId > 0) return []
      return state.ids
    }
    async close() {}
  },
}))
vi.mock('../src/upserter', () => ({
  Upserter: class {
    async upsert(payload: UpsertPayload & { warnings?: unknown[] }) {
      state.upserts.push(payload)
      return { skipped: false }
    }
    async syncDelete() {}
  },
}))

import { makeSync } from '../src/sync'

const cfg = {
  legacy: { host: 'unused', port: 3306, database: 'unused', user: 'unused', password: 'unused' },
  supabaseUrl: 'http://unused.local',
  serviceRoleKey: 'unused',
  cdnBase: 'https://cdn.x',
}

describe('mixed publication sync', () => {
  beforeEach(() => {
    state.bundles.clear()
    state.ids.length = 0
    state.upserts.length = 0
  })

  it('backfills an invalid article with warnings and continues to the next valid article', async () => {
    const invalid = structuredClone(legacyPost)
    invalid.post.id = 900011
    invalid.post.slug = 'invalid-guide'
    invalid.translations = invalid.translations.map((translation) => translation.locale === 'en'
      ? { ...translation, content: JSON.stringify([{ type: 'text', content: '<p>Too short</p>' }]) }
      : translation)
    const valid = structuredClone(legacyPost)
    valid.post.id = 900012
    valid.post.slug = 'valid-guide'
    state.bundles.set(invalid.post.id, invalid)
    state.bundles.set(valid.post.id, valid)
    state.ids.push(invalid.post.id, valid.post.id)

    const sync = makeSync(cfg)
    const result = await sync.backfill()

    expect(result).toEqual({ total: 2, skipped: 0, warnings: 2 })
    expect(state.upserts[0]!.warnings).toContainEqual(expect.objectContaining({
      articleSlug: 'invalid-guide',
      locale: 'en',
      code: 'translation_too_shallow',
    }))
    expect(state.upserts).toHaveLength(2)
    expect(state.upserts[0]!.article.published_at).toBeNull()
    expect(state.upserts[0]!.translations).toHaveLength(2)
    expect(state.upserts[1]!.article.slug).toBe('valid-guide')
    expect(state.upserts[1]!.article.published_at).not.toBeNull()
    expect(state.upserts[1]!.warnings).toEqual([])
  })
})
