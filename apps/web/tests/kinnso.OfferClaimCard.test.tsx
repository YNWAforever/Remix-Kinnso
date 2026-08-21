// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { OfferClaimCard } from '@/components/kinnso/OfferClaimCard'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const { trackTravellerEventMock, getCurrentJourneyIdMock } = vi.hoisted(() => ({
  trackTravellerEventMock: vi.fn(),
  getCurrentJourneyIdMock: vi.fn(() => null as string | null),
}))
vi.mock('@/lib/analytics/client', () => ({
  trackTravellerEvent: trackTravellerEventMock,
  getCurrentJourneyId: getCurrentJourneyIdMock,
}))

const offer = {
  id: 'offer-1', title: 'Free dessert with any main', terms: 'One per visitor',
  discountKind: 'item', discountValue: 1, merchantName: 'Bloom Tea House',
  validTo: '2027-06-01T00:00:00.000Z',
}

describe('OfferClaimCard', () => {
  beforeEach(() => {
    cleanup()
    trackTravellerEventMock.mockClear()
    getCurrentJourneyIdMock.mockReset()
    getCurrentJourneyIdMock.mockReturnValue(null)
  })

  it('calls onClaim with the offer, creator, guide, source, locale, and journey id', async () => {
    const onClaim = vi.fn(async () => ({ ok: true, claimId: 'claim-1' }))
    render(
      <OfferClaimCard
        t={{ claimButton: 'Claim this offer', validThrough: 'Valid through' }}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={onClaim}
      />,
    )
    fireEvent.click(screen.getByText('Claim this offer'))
    await waitFor(() => expect(onClaim).toHaveBeenCalledWith('offer-1', 'creator-1', 'guide-1', 'guide', 'en', null))
  })

  it('renders the offer title and merchant name', () => {
    render(
      <OfferClaimCard
        t={{ claimButton: 'Claim this offer', validThrough: 'Valid through' }}
        locale="en" offer={offer} creatorId="creator-1" guideId={null} source="profile"
        onClaim={vi.fn()}
      />,
    )
    expect(screen.getByText('Free dessert with any main')).toBeInTheDocument()
    expect(screen.getByText(/Bloom Tea House/)).toBeInTheDocument()
  })

  it('fires offer_viewed on mount with the correct metadata for a guide-sourced offer', () => {
    render(
      <OfferClaimCard
        t={{ claimButton: 'Claim this offer', validThrough: 'Valid through' }}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={vi.fn()}
      />,
    )
    expect(trackTravellerEventMock).toHaveBeenCalledWith('offer_viewed', {
      locale: 'en', routeKey: 'guide_detail', entityType: 'offer', entityId: 'offer-1',
    })
  })

  it('fires offer_viewed on mount with routeKey creator_profile for a profile-sourced offer', () => {
    render(
      <OfferClaimCard
        t={{ claimButton: 'Claim this offer', validThrough: 'Valid through' }}
        locale="en" offer={offer} creatorId="creator-1" guideId={null} source="profile"
        onClaim={vi.fn()}
      />,
    )
    expect(trackTravellerEventMock).toHaveBeenCalledWith('offer_viewed', {
      locale: 'en', routeKey: 'creator_profile', entityType: 'offer', entityId: 'offer-1',
    })
  })

  it('fires offer_claimed only after a successful claim', async () => {
    getCurrentJourneyIdMock.mockReturnValue('11111111-1111-4111-8111-111111111111')
    const onClaim = vi.fn(async () => ({ ok: true, claimId: 'claim-1' }))
    render(
      <OfferClaimCard
        t={{ claimButton: 'Claim this offer', validThrough: 'Valid through' }}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={onClaim}
      />,
    )
    trackTravellerEventMock.mockClear()
    fireEvent.click(screen.getByText('Claim this offer'))
    await waitFor(() => expect(trackTravellerEventMock).toHaveBeenCalledWith('offer_claimed', {
      locale: 'en', routeKey: 'guide_detail', entityType: 'offer', entityId: 'offer-1',
    }))
  })

  it('does not fire offer_claimed when the claim fails', async () => {
    const onClaim = vi.fn(async () => ({ ok: false, errors: { form: ['This offer could not be claimed'] } }))
    render(
      <OfferClaimCard
        t={{ claimButton: 'Claim this offer', validThrough: 'Valid through' }}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={onClaim}
      />,
    )
    trackTravellerEventMock.mockClear()
    fireEvent.click(screen.getByText('Claim this offer'))
    await waitFor(() => expect(onClaim).toHaveBeenCalled())
    expect(trackTravellerEventMock).not.toHaveBeenCalledWith('offer_claimed', expect.anything())
  })
})
