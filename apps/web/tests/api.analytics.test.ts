import { afterEach, describe, expect, it, vi } from 'vitest'

const { parseMock, persistMock, serverClientMock, rpcMock, getUserMock } = vi.hoisted(() => ({
  parseMock: vi.fn(),
  persistMock: vi.fn(),
  serverClientMock: vi.fn(),
  rpcMock: vi.fn(),
  getUserMock: vi.fn(),
}))

vi.mock('@/lib/analytics/server', () => ({
  AnalyticsRequestError: class AnalyticsRequestError extends Error {
    constructor(readonly code: string, readonly status: number) {
      super(code)
    }
  },
  parseAnalyticsRequest: parseMock,
  persistTravellerAnalyticsEvent: persistMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: serverClientMock,
}))

import { POST } from '@/app/api/analytics/route'

const payload = {
  clientEventId: '00000000-0000-4000-8000-000000000001',
  journeyId: '00000000-0000-4000-8000-000000000002',
  consentVersion: 'v1' as const,
  event: 'journey_started' as const,
  occurredAt: '2026-08-01T00:00:00.000Z',
  locale: 'en' as const,
  routeKey: 'home',
}

afterEach(() => vi.resetAllMocks())

function request() {
  return new Request('http://kinnso.test/api/analytics', { method: 'POST', body: JSON.stringify(payload) })
}

describe('POST /api/analytics', () => {
  it('uses the server-authenticated account ID after a successful journey throttle', async () => {
    parseMock.mockResolvedValue(payload)
    rpcMock.mockResolvedValue({ data: true, error: null })
    getUserMock.mockResolvedValue({ data: { user: { id: 'account-1' } }, error: null })
    serverClientMock.mockResolvedValue({ rpc: rpcMock, auth: { getUser: getUserMock } })
    persistMock.mockResolvedValue('stored')

    const response = await POST(request())

    expect(response.status).toBe(202)
    expect(rpcMock).toHaveBeenCalledWith('check_and_increment_traveller_analytics_rate_limit', {
      p_journey_id: payload.journeyId,
      p_max_requests: 120,
      p_window_seconds: 600,
    })
    expect(persistMock).toHaveBeenCalledWith(payload, 'account-1')
    await expect(response.json()).resolves.toEqual({ accepted: true })
  })

  it('returns a product-safe 503 without persistence details when analytics storage fails', async () => {
    parseMock.mockResolvedValue(payload)
    rpcMock.mockResolvedValue({ data: true, error: null })
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    serverClientMock.mockResolvedValue({ rpc: rpcMock, auth: { getUser: getUserMock } })
    persistMock.mockRejectedValue(new Error('database connection leaked detail'))

    const response = await POST(request())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ accepted: false, error: 'unavailable' })
  })

  it('returns 429 without service persistence when the journey throttle rejects', async () => {
    parseMock.mockResolvedValue(payload)
    rpcMock.mockResolvedValue({ data: false, error: null })
    serverClientMock.mockResolvedValue({ rpc: rpcMock, auth: { getUser: getUserMock } })

    const response = await POST(request())

    expect(response.status).toBe(429)
    expect(persistMock).not.toHaveBeenCalled()
  })
})
