import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  buildSubId,
  createTravelpayoutsPartnerLinks,
  normalizeTravelpayoutsAction,
} from '@/lib/missions/travelpayouts'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Travelpayouts adapter', () => {
  it('builds stable creator tracking sub_id', () => {
    expect(buildSubId({ missionId: 'm1', participantId: 'p1', creatorId: 'c1' })).toBe('kinnso_m_m1_p_p1_c_c1')
  })

  it('creates partner links with server-side token and marker', async () => {
    vi.stubEnv('TRAVELPAYOUTS_API_TOKEN', 'test-token')
    vi.stubEnv('TRAVELPAYOUTS_PROJECT_ID', '197987')
    vi.stubEnv('TRAVELPAYOUTS_MARKER', '339296')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'success',
      status: 200,
      result: {
        links: [{ url: 'https://example.com/hotel', code: 'success', partner_url: 'https://tp.st/abc' }],
      },
    })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createTravelpayoutsPartnerLinks({
      links: [{ url: 'https://example.com/hotel', subId: 'creator-sub' }],
      shorten: true,
    })

    expect(result).toEqual([{ originalUrl: 'https://example.com/hotel', partnerUrl: 'https://tp.st/abc', status: 'success' }])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.travelpayouts.com/links/v1/create',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Access-Token': 'test-token' }),
      }),
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      trs: 197987,
      marker: 339296,
      shorten: true,
      links: [{ url: 'https://example.com/hotel', sub_id: 'creator-sub' }],
    })
  })

  it('maps non-success partner link codes to failed', async () => {
    vi.stubEnv('TRAVELPAYOUTS_API_TOKEN', 'test-token')
    vi.stubEnv('TRAVELPAYOUTS_PROJECT_ID', '197987')
    vi.stubEnv('TRAVELPAYOUTS_MARKER', '339296')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result: {
        links: [{
          url: 'https://example.com/hotel',
          code: 'invalid_url',
          message: 'Unsupported link',
        }],
      },
    }))))

    await expect(createTravelpayoutsPartnerLinks({
      links: [{ url: 'https://example.com/hotel', subId: 'creator-sub' }],
    })).resolves.toEqual([{
      originalUrl: 'https://example.com/hotel',
      partnerUrl: '',
      status: 'failed',
      message: 'Unsupported link',
    }])
  })

  it('throws for missing server-side configuration without exposing configured secrets', async () => {
    vi.stubEnv('TRAVELPAYOUTS_API_TOKEN', 'test-token')
    vi.stubEnv('TRAVELPAYOUTS_PROJECT_ID', '')
    vi.stubEnv('TRAVELPAYOUTS_MARKER', '339296')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(createTravelpayoutsPartnerLinks({
      links: [{ url: 'https://example.com/hotel', subId: 'creator-sub' }],
    })).rejects.toThrow('Missing required environment variable: TRAVELPAYOUTS_PROJECT_ID')
    await expect(createTravelpayoutsPartnerLinks({
      links: [{ url: 'https://example.com/hotel', subId: 'creator-sub' }],
    })).rejects.not.toThrow('test-token')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects more than 10 links before calling the API', async () => {
    vi.stubEnv('TRAVELPAYOUTS_API_TOKEN', 'test-token')
    vi.stubEnv('TRAVELPAYOUTS_PROJECT_ID', '197987')
    vi.stubEnv('TRAVELPAYOUTS_MARKER', '339296')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(createTravelpayoutsPartnerLinks({
      links: Array.from({ length: 11 }, (_, index) => ({
        url: `https://example.com/hotel-${index}`,
        subId: `creator-sub-${index}`,
      })),
    })).rejects.toThrow('Travelpayouts accepts no more than 10 links per request')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when the partner link API returns a non-OK response', async () => {
    vi.stubEnv('TRAVELPAYOUTS_API_TOKEN', 'test-token')
    vi.stubEnv('TRAVELPAYOUTS_PROJECT_ID', '197987')
    vi.stubEnv('TRAVELPAYOUTS_MARKER', '339296')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })))

    await expect(createTravelpayoutsPartnerLinks({
      links: [{ url: 'https://example.com/hotel', subId: 'creator-sub' }],
    })).rejects.toThrow('Travelpayouts partner link request failed: 429')
  })

  it('normalizes Travelpayouts finance/statistics actions', () => {
    expect(normalizeTravelpayoutsAction({
      action_id: '100:123',
      campaign_id: 100,
      action_state: 'paid',
      sub_id: 'kinnso_m_m1_p_p1_c_c1',
      price: '100.00',
      profit: '8.50',
      currency: 'usd',
      booked_at: '2026-06-18 10:00:00',
      updated_at: '2026-06-18 11:00:00',
    })).toMatchObject({
      externalActionId: '100:123',
      externalProgramId: '100',
      eventState: 'paid',
      subId: 'kinnso_m_m1_p_p1_c_c1',
      priceAmount: 100,
      profitAmount: 8.5,
      currency: 'usd',
      bookedAt: '2026-06-18 10:00:00',
      updatedAt: '2026-06-18 11:00:00',
    })
  })

  it('normalizes Travelpayouts fallback finance/statistics fields', () => {
    expect(normalizeTravelpayoutsAction({
      action_id: '100:456',
      campaign_id: '100',
      state: 'confirmed',
      sub_id: 'kinnso_m_m2_p_p2_c_c2',
      price_usd: '99.20',
      paid_profit_usd: '7.35',
      date: '2026-06-19',
    })).toMatchObject({
      externalActionId: '100:456',
      externalProgramId: '100',
      eventState: 'confirmed',
      subId: 'kinnso_m_m2_p_p2_c_c2',
      priceAmount: 99.2,
      profitAmount: 7.35,
      currency: 'usd',
      bookedAt: '2026-06-19',
    })
  })

  it('lowercases provided Travelpayouts currency values', () => {
    expect(normalizeTravelpayoutsAction({
      action_id: '100:789',
      action_state: 'paid',
      price: '100.00',
      profit: '8.50',
      currency: 'HKD',
    })).toMatchObject({
      currency: 'hkd',
    })
  })
})
