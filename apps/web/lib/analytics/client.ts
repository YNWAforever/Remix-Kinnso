'use client'

import type { Locale } from '@/lib/i18n/config'
import { travellerAnalyticsPayloadSchema, type TravellerAnalyticsEventName } from '@/lib/analytics/contracts'
import { getAnalyticsMode } from '@/lib/analytics/config'

export const CONSENT_KEY = 'kinnso.analytics.consent.v1'
export const CONSENT_VERSION_KEY = 'kinnso.analytics.consent-version.v1'
export const JOURNEY_KEY = 'kinnso.analytics.journey.v1'

type CommonMetadata = { locale: Locale }
type ExperienceMetadata = CommonMetadata & {
  routeKey: 'experience_detail'
  entityType: 'experience'
  entityId: string
}

export type TravellerAnalyticsMetadataByEvent = {
  journey_started: CommonMetadata & { routeKey: 'journey' }
  entity_viewed: CommonMetadata & (
    | { routeKey: 'guide_detail'; entityType: 'guide'; entityId: string }
    | { routeKey: 'experience_detail'; entityType: 'experience'; entityId: string }
    | { routeKey: 'creator_profile'; entityType: 'creator'; entityId: string }
    | { routeKey: 'article_detail'; entityType: 'article'; entityId: string }
  )
  agent_started: CommonMetadata & { routeKey: 'agent' }
  booking_cta_clicked: ExperienceMetadata & { bookingState: 'off' | 'on' }
  waitlist_submitted: ExperienceMetadata & { bookingState: 'off'; outcome: 'submitted' }
  checkout_started: ExperienceMetadata & { bookingState: 'on'; outcome: 'created' }
  signup_started: CommonMetadata & { routeKey: 'sign_up' }
  signup_completed: CommonMetadata & { routeKey: 'sign_up' }
}

function getPublicAnalyticsMode() {
  return getAnalyticsMode({ NEXT_PUBLIC_ANALYTICS_MODE: process.env.NEXT_PUBLIC_ANALYTICS_MODE })
}

function getStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function randomUuid(): string | null {
  return typeof window === 'undefined' || typeof window.crypto?.randomUUID !== 'function'
    ? null
    : window.crypto.randomUUID()
}

export function hasAnalyticsConsent(): boolean {
  if (getPublicAnalyticsMode() === 'disabled') return false
  return getStorage()?.getItem(CONSENT_KEY) === 'accepted'
}

export function grantAnalyticsConsent(locale: Locale): void {
  if (getPublicAnalyticsMode() === 'disabled') return
  const storage = getStorage()
  const journeyId = randomUuid()
  if (!storage || !journeyId) return

  storage.setItem(CONSENT_KEY, 'accepted')
  storage.setItem(CONSENT_VERSION_KEY, 'v1')
  storage.setItem(JOURNEY_KEY, journeyId)
  trackTravellerEvent('journey_started', { locale, routeKey: 'journey' })
}

export function revokeAnalyticsConsent(): void {
  const storage = getStorage()
  storage?.removeItem(CONSENT_KEY)
  storage?.removeItem(CONSENT_VERSION_KEY)
  storage?.removeItem(JOURNEY_KEY)
}

async function postWithOneRetry(payload: unknown): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      })
      if (response.status < 500 || attempt === 1) return
    } catch {
      if (attempt === 1) return
    }
  }
}

export function trackTravellerEvent<Event extends TravellerAnalyticsEventName>(
  event: Event,
  metadata: TravellerAnalyticsMetadataByEvent[Event],
): void {
  if (!hasAnalyticsConsent() || getPublicAnalyticsMode() === 'disabled') return
  const storage = getStorage()
  const journeyId = storage?.getItem(JOURNEY_KEY)
  if (!journeyId) return
  const clientEventId = randomUuid()
  if (!clientEventId) return

  const payload = {
    clientEventId,
    journeyId,
    consentVersion: 'v1' as const,
    event,
    occurredAt: new Date().toISOString(),
    ...metadata,
  }
  if (!travellerAnalyticsPayloadSchema.safeParse(payload).success) return

  void postWithOneRetry(payload)
}
