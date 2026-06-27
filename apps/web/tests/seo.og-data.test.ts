import { describe, it, expect } from 'vitest'
import { truncate, pickNiches } from '@/lib/seo/og/data'

describe('truncate', () => {
  it('returns the string unchanged when within the limit', () => {
    expect(truncate('Kyoto Tea Houses', 40)).toBe('Kyoto Tea Houses')
  })
  it('cuts and adds an ellipsis past the limit', () => {
    const out = truncate('a'.repeat(60), 20)
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('pickNiches', () => {
  it('keeps at most 3 by default', () => {
    expect(pickNiches(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c'])
  })
  it('returns all when fewer than the cap', () => {
    expect(pickNiches(['a'])).toEqual(['a'])
  })
})
