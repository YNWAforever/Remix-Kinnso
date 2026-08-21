// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { OfferClaimCard } from '@/components/kinnso/OfferClaimCard'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const offer = {
  id: 'offer-1', title: 'Free dessert with any main', terms: 'One per visitor',
  discountKind: 'item', discountValue: 1, merchantName: 'Bloom Tea House',
  validTo: '2027-06-01T00:00:00.000Z',
}

describe('OfferClaimCard', () => {
  beforeEach(() => cleanup())

  it('calls onClaim with the offer, creator, guide, and source', async () => {
    const onClaim = vi.fn(async () => ({ ok: true, claimId: 'claim-1' }))
    render(
      <OfferClaimCard
        t={{ claimButton: 'Claim this offer', validThrough: 'Valid through' }}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={onClaim}
      />,
    )
    fireEvent.click(screen.getByText('Claim this offer'))
    await waitFor(() => expect(onClaim).toHaveBeenCalledWith('offer-1', 'creator-1', 'guide-1', 'guide'))
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
})
