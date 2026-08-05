import { NextResponse } from 'next/server'

import {
  AnalyticsRequestError,
  parseAnalyticsRequest,
  persistTravellerAnalyticsEvent,
} from '@/lib/analytics/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const MAX_REQUESTS_PER_WINDOW = 120
const RATE_LIMIT_WINDOW_SECONDS = 600

function unavailableResponse() {
  return NextResponse.json({ accepted: false, error: 'unavailable' }, { status: 503 })
}

export async function POST(request: Request) {
  let payload
  try {
    payload = await parseAnalyticsRequest(request)
  } catch (error) {
    if (error instanceof AnalyticsRequestError) {
      const responseError = error.status === 413 ? 'payload_too_large' : 'invalid_request'
      return NextResponse.json({ accepted: false, error: responseError }, { status: error.status })
    }
    return unavailableResponse()
  }

  // Preview/test ingestion is an explicit no-write mode. Keep parsing and
  // semantic validation active, but never create a Supabase client or touch
  // the rate-limit ledger outside production.
  if (process.env.ANALYTICS_INGEST_MODE !== 'production') {
    return NextResponse.json({ accepted: true }, { status: 202 })
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { data: allowed, error: throttleError } = await supabase.rpc(
      'check_and_increment_traveller_analytics_rate_limit',
      {
        p_journey_id: payload.journeyId,
        p_max_requests: MAX_REQUESTS_PER_WINDOW,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      },
    )

    if (throttleError) return unavailableResponse()
    if (!allowed) {
      return NextResponse.json({ accepted: false, error: 'rate_limited' }, { status: 429 })
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError) return unavailableResponse()

    await persistTravellerAnalyticsEvent(payload, user?.id ?? null)
    return NextResponse.json({ accepted: true }, { status: 202 })
  } catch {
    return unavailableResponse()
  }
}
