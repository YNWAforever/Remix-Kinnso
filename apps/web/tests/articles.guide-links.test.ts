import { beforeEach, describe, expect, it, vi } from 'vitest'

const orSpy = vi.fn()
const limitSpy = vi.fn().mockResolvedValue({ data: [] })
const chain: Record<string, unknown> = {}
Object.assign(chain, {
  select: vi.fn(() => chain), eq: vi.fn(() => chain),
  or: orSpy.mockImplementation(() => chain),
  order: vi.fn(() => chain), limit: limitSpy,
})
const fromMock = vi.fn(() => chain)
vi.mock('@/lib/supabase/public', () => ({ createSupabasePublicClient: () => ({ from: fromMock }) }))

import { getGuidesForRegions } from '@/lib/guides/queries'

beforeEach(() => { fromMock.mockClear(); orSpy.mockClear(); limitSpy.mockClear().mockResolvedValue({ data: [] }) })

describe('getGuidesForRegions', () => {
  it('returns [] without querying when no usable region strings', async () => {
    expect(await getGuidesForRegions([])).toEqual([])
    expect(await getGuidesForRegions(['', ' ', 'x'])).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })
  it('builds a sanitized ilike-or filter over guide cities', async () => {
    await getGuidesForRegions(['Tokyo', 'Hong Kong, (HK)'])
    expect(orSpy).toHaveBeenCalledWith('city.ilike.%Tokyo%,city.ilike.%Hong Kong HK%')
  })
  it('never throws — returns [] on query failure', async () => {
    limitSpy.mockRejectedValueOnce(new Error('boom'))
    expect(await getGuidesForRegions(['Tokyo'])).toEqual([])
  })
})
