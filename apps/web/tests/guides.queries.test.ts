import { describe, it, expect } from 'vitest'
import { mapRowToGuide, mergeWithSeed } from '@/lib/guides/queries'
import { guides as mockGuides } from '@/lib/creator-mock'

const row = {
  slug: 'kyoto-tea',
  title: 'Kyoto Tea Houses',
  cover_url: 'https://example.com/kyoto.jpg',
  city: 'Kyoto',
  saves_count: 42,
  creator_handle: 'teafan',
}

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

describe('mergeWithSeed', () => {
  it('puts db guides first, then mock seed, deduped by slug', () => {
    const db = [mapRowToGuide(row)]
    const merged = mergeWithSeed(db, mockGuides)
    expect(merged[0].slug).toBe('kyoto-tea')
    expect(merged.length).toBe(db.length + mockGuides.length)
  })
  it('drops a seed guide whose slug a db guide already uses', () => {
    const clash = mapRowToGuide({ ...row, slug: mockGuides[0].slug })
    const merged = mergeWithSeed([clash], mockGuides)
    expect(merged.filter((g) => g.slug === mockGuides[0].slug)).toHaveLength(1)
    expect(merged[0].title).toBe('Kyoto Tea Houses')
  })
})
