import { describe, expect, it } from 'vitest'
import { parseProofUrl } from '@/lib/missions/proof-url'

describe('parseProofUrl', () => {
  it('parses an Instagram post URL', () => {
    expect(parseProofUrl('https://www.instagram.com/p/Cabc123/')).toEqual({ platform: 'instagram', id: 'Cabc123' })
  })
  it('parses an Instagram reel URL', () => {
    expect(parseProofUrl('https://instagram.com/reel/Xyz789')).toEqual({ platform: 'instagram', id: 'Xyz789' })
  })
  it('parses a Threads post URL', () => {
    expect(parseProofUrl('https://www.threads.net/@traveler/post/C9postID')).toEqual({ platform: 'threads', id: 'C9postID' })
  })
  it('accepts threads.com host', () => {
    expect(parseProofUrl('https://threads.com/@x/post/abc')).toEqual({ platform: 'threads', id: 'abc' })
  })
  it('returns null for an unsupported (YouTube) URL', () => {
    expect(parseProofUrl('https://youtu.be/dQw4w9WgXcQ')).toBeNull()
  })
  it('returns null for a non-URL string', () => {
    expect(parseProofUrl('not a url')).toBeNull()
  })
  it('returns null for an Instagram profile URL with no post id', () => {
    expect(parseProofUrl('https://www.instagram.com/traveler/')).toBeNull()
  })
})
