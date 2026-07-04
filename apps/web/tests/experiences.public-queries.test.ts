// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const fromMock = vi.fn()
vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({ from: fromMock }),
}))

import { getExperienceBySlug, getExperiencesForSitemap, listPublishedExperiencesForMerchant } from '@/lib/experiences/public-queries'

beforeEach(() => { fromMock.mockReset() })

describe('getExperienceBySlug', () => {
  it('returns null when the experience is missing or not published (RLS)', async () => {
    const maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })
    expect(await getExperienceBySlug('nope')).toBeNull()
  })

  it('joins the owning merchant via the public view (two-query, not an embed)', async () => {
    const expRow = {
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', price_amount: 480, currency: 'HKD',
      duration_minutes: 120, cover_url: 'https://x/y.jpg', merchant_profile_id: 'm1',
      published_at: '2026-07-01T00:00:00Z',
    }
    const merchantRow = { id: 'm1', slug: 'acme-travel', company_name: 'Acme Travel' }
    const expMaybeSingle = vi.fn(() => Promise.resolve({ data: expRow, error: null }))
    const merchantMaybeSingle = vi.fn(() => Promise.resolve({ data: merchantRow, error: null }))
    fromMock
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: expMaybeSingle })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: merchantMaybeSingle })) })) })

    const result = await getExperienceBySlug('sunset-tour')
    expect(fromMock).toHaveBeenNthCalledWith(1, 'experiences')
    expect(fromMock).toHaveBeenNthCalledWith(2, 'merchant_public_profiles')
    expect(result).toEqual({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: 'https://x/y.jpg', publishedAt: '2026-07-01T00:00:00Z',
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
  })

  it('returns null if the owning merchant is missing from the public view (defensive)', async () => {
    const expRow = { id: 'e1', slug: 's', title: 'T', summary: null, description: null, city: 'HK', price_amount: 1, currency: 'HKD', duration_minutes: null, cover_url: null, merchant_profile_id: 'm1', published_at: null }
    const expMaybeSingle = vi.fn(() => Promise.resolve({ data: expRow, error: null }))
    const merchantMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    fromMock
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: expMaybeSingle })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: merchantMaybeSingle })) })) })
    expect(await getExperienceBySlug('s')).toBeNull()
  })
})

describe('listPublishedExperiencesForMerchant', () => {
  it('lists published experiences scoped to one merchant id', async () => {
    const order = vi.fn(() => Promise.resolve({
      data: [{ id: 'e1', slug: 'sunset-tour', title: 'Sunset tour', summary: null, description: null, city: 'HK', price_amount: 480, currency: 'HKD', duration_minutes: null, cover_url: null, merchant_profile_id: 'm1', published_at: '2026-07-01T00:00:00Z' }],
      error: null,
    }))
    const eq2 = vi.fn(() => ({ order }))
    const eq1 = vi.fn(() => ({ eq: eq2 }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq: eq1 })) })
    const rows = await listPublishedExperiencesForMerchant('m1')
    expect(eq1).toHaveBeenCalledWith('merchant_profile_id', 'm1')
    expect(eq2).toHaveBeenCalledWith('status', 'published')
    expect(rows[0].title).toBe('Sunset tour')
  })
})

describe('getExperiencesForSitemap', () => {
  it('returns slug + lastmod pairs for published experiences', async () => {
    const order = vi.fn(() => Promise.resolve({ data: [{ slug: 'sunset-tour', published_at: '2026-07-01T00:00:00Z' }], error: null }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq: vi.fn(() => ({ order })) })) })
    expect(await getExperiencesForSitemap()).toEqual([{ slug: 'sunset-tour', lastmod: '2026-07-01T00:00:00Z' }])
  })
})
