import { describe, expect, it } from 'vitest'
import { parseProofUrl } from '../src/proof-url'

describe('parseProofUrl (worker)', () => {
  it('parses an Instagram post', () => {
    expect(parseProofUrl('https://www.instagram.com/p/Cabc/')).toEqual({ platform: 'instagram', id: 'Cabc' })
  })
  it('parses a Threads post', () => {
    expect(parseProofUrl('https://www.threads.net/@u/post/Xyz')).toEqual({ platform: 'threads', id: 'Xyz' })
  })
  it('rejects unsupported', () => {
    expect(parseProofUrl('https://youtu.be/x')).toBeNull()
  })
})
