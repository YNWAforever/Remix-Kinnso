'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'
import type { Locale } from '@/lib/i18n/config'
import type { PublicOffer } from '@/lib/offers/public-queries'
import { getCurrentJourneyId, trackTravellerEvent } from '@/lib/analytics/client'

type ClaimOffer = (
  offerId: string, creatorId: string, guideId: string | null, source: 'guide' | 'profile',
  locale?: Locale, journeyId?: string | null,
) => Promise<{ ok: boolean; claimId?: string; errors?: Record<string, string[]> }>

export function OfferClaimCard({
  t, locale, offer, creatorId, guideId, source, onClaim,
}: {
  t: { claimButton: string; validThrough: string }
  locale: Locale
  offer: PublicOffer
  creatorId: string
  guideId: string | null
  source: 'guide' | 'profile'
  onClaim: ClaimOffer
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    trackTravellerEvent('offer_viewed', {
      locale, routeKey: source === 'guide' ? 'guide_detail' : 'creator_profile',
      entityType: 'offer', entityId: offer.id,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function claim() {
    startTransition(async () => {
      const journeyId = getCurrentJourneyId()
      const result = await onClaim(offer.id, creatorId, guideId, source, locale, journeyId)
      if (result.ok && result.claimId) {
        trackTravellerEvent('offer_claimed', {
          locale, routeKey: source === 'guide' ? 'guide_detail' : 'creator_profile',
          entityType: 'offer', entityId: offer.id,
        })
        router.push(`/${locale}/offers/${result.claimId}`)
      }
    })
  }

  return (
    <div className="rounded-lg border border-kinnso-line p-4 max-w-md">
      <p className="font-bold text-kinnso-ink">{offer.title}</p>
      <p className="mt-1 text-sm text-kinnso-muted">
        {offer.merchantName} · {t.validThrough} {new Date(offer.validTo).toLocaleDateString(locale, { timeZone: 'UTC' })}
      </p>
      <button
        disabled={isPending}
        onClick={claim}
        className="mt-3 rounded-full bg-kinnso-orange px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        {t.claimButton}
      </button>
    </div>
  )
}
