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
  signup_completed: CommonMetadata & { routeKey: 'sign_up'; outcome: 'success' }
}

function getPublicAnalyticsMode() {
  return getAnalyticsMode({ NEXT_PUBLIC_ANALYTICS_MODE: process.env.NEXT_PUBLIC_ANALYTICS_MODE })
}

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function getStorageValue(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function setStorageValue(storage: Storage | null, key: string, value: string): boolean {
  try {
    storage?.setItem(key, value)
    return storage !== null
  } catch {
    return false
  }
}

function removeStorageValue(storage: Storage | null, key: string): void {
  try {
    storage?.removeItem(key)
  } catch {
    // Measurement storage is optional and must never interrupt product flows.
  }
}

function randomUuid(): string | null {
  return typeof window === 'undefined' || typeof window.crypto?.randomUUID !== 'function'
    ? null
    : window.crypto.randomUUID()
}

export function hasAnalyticsConsent(): boolean {
  if (getPublicAnalyticsMode() === 'disabled') return false
  return getStorageValue(getStorage(), CONSENT_KEY) === 'accepted'
}

export function grantAnalyticsConsent(locale: Locale): void {
  if (getPublicAnalyticsMode() === 'disabled') return
  const storage = getStorage()
  const journeyId = randomUuid()
  if (!storage || !journeyId) return

  if (!setStorageValue(storage, CONSENT_KEY, 'accepted')) return
  if (!setStorageValue(storage, CONSENT_VERSION_KEY, 'v1')) return
  if (!setStorageValue(storage, JOURNEY_KEY, journeyId)) return
  trackTravellerEvent('journey_started', { locale, routeKey: 'journey' })
}

export function revokeAnalyticsConsent(): void {
  const storage = getStorage()
  removeStorageValue(storage, CONSENT_KEY)
  removeStorageValue(storage, CONSENT_VERSION_KEY)
  removeStorageValue(storage, JOURNEY_KEY)
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
  const journeyId = getStorageValue(storage, JOURNEY_KEY)
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
