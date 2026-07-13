// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { optionalQuery, optionalValue } from '@/lib/resilience/optional'

afterEach(() => vi.restoreAllMocks())

describe('optional module containment', () => {
  it('returns the async fallback and logs only a safe error name', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(optionalQuery('experience-availability', async () => {
      throw new Error('secret database detail')
    }, [])).resolves.toEqual([])
    expect(log).toHaveBeenCalledWith('optional-module-failed', {
      module: 'experience-availability', errorName: 'Error',
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret database detail')
  })

  it('returns the sync fallback when JSON-LD construction throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(optionalValue('guide-jsonld', () => { throw new TypeError('bad') }, [])).toEqual([])
  })
})
