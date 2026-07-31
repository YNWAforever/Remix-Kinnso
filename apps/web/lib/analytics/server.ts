import 'server-only'

import { travellerAnalyticsPayloadSchema, type TravellerAnalyticsPayload } from '@/lib/analytics/contracts'
import { getAnalyticsMode } from '@/lib/analytics/config'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

const MAX_REQUEST_BYTES = 8_192
const MAX_CLOCK_SKEW_MS = 15 * 60 * 1_000

export class AnalyticsRequestError extends Error {
  constructor(
    readonly code: 'invalid_request' | 'payload_too_large',
    readonly status: 400 | 413,
  ) {
    super(code)
  }
}

function declaredBodyIsTooLarge(request: Request) {
  const contentLength = request.headers.get('content-length')
  if (!contentLength) return false
  const parsedLength = Number(contentLength)
  return Number.isFinite(parsedLength) && parsedLength > MAX_REQUEST_BYTES
}

function hasAllowedTimestampSkew(occurredAt: string) {
  return Math.abs(Date.now() - new Date(occurredAt).getTime()) <= MAX_CLOCK_SKEW_MS
}

export async function parseAnalyticsRequest(request: Request): Promise<TravellerAnalyticsPayload> {
  if (declaredBodyIsTooLarge(request)) {
    throw new AnalyticsRequestError('payload_too_large', 413)
  }

  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    throw new AnalyticsRequestError('payload_too_large', 413)
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    throw new AnalyticsRequestError('invalid_request', 400)
  }

  const parsed = travellerAnalyticsPayloadSchema.safeParse(body)
  if (!parsed.success || !hasAllowedTimestampSkew(parsed.data.occurredAt)) {
    throw new AnalyticsRequestError('invalid_request', 400)
  }

  return parsed.data
}

export async function persistTravellerAnalyticsEvent(
  payload: TravellerAnalyticsPayload,
  accountId: string | null,
): Promise<'stored' | 'duplicate' | 'discarded'> {
  if (getAnalyticsMode() !== 'production') return 'discarded'

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('traveller_analytics_events')
    .upsert(
      {
        client_event_id: payload.clientEventId,
        journey_id: payload.journeyId,
        consent_version: payload.consentVersion,
        event_name: payload.event,
        occurred_at: payload.occurredAt,
        locale: payload.locale,
        route_key: payload.routeKey,
        entity_type: payload.entityType ?? null,
        entity_id: payload.entityId ?? null,
        booking_state: payload.bookingState ?? 'off',
        authenticated: accountId !== null,
        outcome: payload.outcome ?? null,
        error_category: payload.errorCategory ?? null,
        account_id: accountId,
      },
      { onConflict: 'journey_id,client_event_id', ignoreDuplicates: true },
    )
    .select('id')

  if (error) throw new Error('analytics_persistence_failed')
  return data && data.length > 0 ? 'stored' : 'duplicate'
}
