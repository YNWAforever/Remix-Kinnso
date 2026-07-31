import { afterEach, describe, expect, it, vi } from 'vitest'

const { serviceClientMock, serviceFromMock, serviceUpsertMock, serviceSelectMock } = vi.hoisted(() => ({
  serviceClientMock: vi.fn(),
  serviceFromMock: vi.fn(),
  serviceUpsertMock: vi.fn(),
  serviceSelectMock: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: serviceClientMock,
}))

import { parseAnalyticsRequest, persistTravellerAnalyticsEvent } from '@/lib/analytics/server'
import type { TravellerAnalyticsPayload } from '@/lib/analytics/contracts'

const originalMode = process.env.ANALYTICS_INGEST_MODE

function validPayload(overrides: Partial<TravellerAnalyticsPayload> & Record<string, unknown> = {}): TravellerAnalyticsPayload {
  return {
    clientEventId: '00000000-0000-4000-8000-000000000001',
    journeyId: '00000000-0000-4000-8000-000000000002',
    consentVersion: 'v1',
    event: 'checkout_started',
    occurredAt: new Date().toISOString(),
    locale: 'en',
    routeKey: 'experience_detail',
    entityType: 'experience',
    entityId: 'experience_1',
    bookingState: 'on',
    outcome: 'success',
    ...overrides,
  }
}

afterEach(() => {
  vi.resetAllMocks()
  if (originalMode === undefined) delete process.env.ANALYTICS_INGEST_MODE
  else process.env.ANALYTICS_INGEST_MODE = originalMode
})

describe('parseAnalyticsRequest', () => {
  it('rejects a measured body over 8 KiB before JSON handling', async () => {
    const request = new Request('http://kinnso.test/api/analytics', {
      method: 'POST',
      body: `${JSON.stringify(validPayload())}${' '.repeat(8_193)}`,
    })

    await expect(parseAnalyticsRequest(request)).rejects.toMatchObject({
      status: 413,
      code: 'payload_too_large',
    })
    expect(serviceClientMock).not.toHaveBeenCalled()
  })

  it('rejects prohibited data before any service write', async () => {
    const request = new Request('http://kinnso.test/api/analytics', {
      method: 'POST',
      body: JSON.stringify(validPayload({ email: 'traveller@example.com' })),
    })

    await expect(parseAnalyticsRequest(request)).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
    })
    expect(serviceClientMock).not.toHaveBeenCalled()
  })

  it.each([-16 * 60 * 1000, 16 * 60 * 1000])(
    'rejects event timestamps outside the fifteen-minute skew window (%i ms)',
    async (offset) => {
      const request = new Request('http://kinnso.test/api/analytics', {
        method: 'POST',
        body: JSON.stringify(validPayload({ occurredAt: new Date(Date.now() + offset).toISOString() })),
      })

      await expect(parseAnalyticsRequest(request)).rejects.toMatchObject({
        status: 400,
        code: 'invalid_request',
      })
    },
  )
})

describe('persistTravellerAnalyticsEvent', () => {
  it('discards validated events in test mode without creating a service client', async () => {
    process.env.ANALYTICS_INGEST_MODE = 'test'

    await expect(persistTravellerAnalyticsEvent(validPayload(), null)).resolves.toBe('discarded')
    expect(serviceClientMock).not.toHaveBeenCalled()
  })

  it('upserts a flat, server-linked row idempotently in production', async () => {
    process.env.ANALYTICS_INGEST_MODE = 'production'
    serviceSelectMock.mockResolvedValue({ data: [{ id: 'ledger-row-1' }], error: null })
    serviceUpsertMock.mockReturnValue({ select: serviceSelectMock })
    serviceFromMock.mockReturnValue({ upsert: serviceUpsertMock })
    serviceClientMock.mockReturnValue({ from: serviceFromMock })

    await expect(persistTravellerAnalyticsEvent(validPayload(), '00000000-0000-4000-8000-000000000003')).resolves.toBe('stored')
    expect(serviceFromMock).toHaveBeenCalledWith('traveller_analytics_events')
    expect(serviceUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticated: true,
        account_id: '00000000-0000-4000-8000-000000000003',
        entity_id: 'experience_1',
      }),
      { onConflict: 'journey_id,client_event_id', ignoreDuplicates: true },
    )
  })
})
