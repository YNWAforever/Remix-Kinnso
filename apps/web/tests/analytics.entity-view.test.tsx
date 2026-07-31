// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import * as analyticsClient from '@/lib/analytics/client'
import { AnalyticsEntityView } from '@/components/kinnso/analytics/AnalyticsEntityView'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('AnalyticsEntityView', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubEnv('NEXT_PUBLIC_ANALYTICS_MODE', 'production')
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn()
        .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
        .mockReturnValue('22222222-2222-4222-8222-222222222222'),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 202 })))
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('stays silent before consent', async () => {
    render(<AnalyticsEntityView locale="en" routeKey="guide_detail" entityType="guide" entityId="guide-123" />)
    await flush()

    expect(fetch).not.toHaveBeenCalled()
  })

  it('emits one entity view containing only the approved metadata after consent', async () => {
    analyticsClient.grantAnalyticsConsent('en')
    await flush()
    vi.mocked(fetch).mockClear()
    const track = vi.spyOn(analyticsClient, 'trackTravellerEvent')

    render(<AnalyticsEntityView locale="en" routeKey="guide_detail" entityType="guide" entityId="guide-123" />)

    await waitFor(() => {
      expect(track).toHaveBeenCalledOnce()
    })
    expect(track).toHaveBeenCalledWith('entity_viewed', {
      locale: 'en',
      routeKey: 'guide_detail',
      entityType: 'guide',
      entityId: 'guide-123',
    })
    await flush()
    expect(fetch).toHaveBeenCalledOnce()
  })
})
