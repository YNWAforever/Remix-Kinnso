// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

import { StudioOffersView, type AffiliateOfferCard } from '@/components/kinnso/pages/StudioOffersView'
import en from '@/lib/i18n/messages/en'

afterEach(() => { cleanup(); refreshMock.mockReset() })

const offer = (over: Partial<AffiliateOfferCard> = {}): AffiliateOfferCard => ({
  id: 'm1',
  title: 'Hotels affiliate',
  summary: 'Earn on every booking.',
  category: 'Hotels',
  compensation: 'Up to 7% commission',
  programUrl: 'https://example.com/hotels',
  participant: null,
  partnerLinks: [],
  ...over,
})

describe('StudioOffersView', () => {
  it('renders the empty state when there are no offers', () => {
    render(<StudioOffersView t={en.studioOffers} offers={[]} onJoin={vi.fn()} onCreateLink={vi.fn()} />)
    expect(screen.getByText(en.studioOffers.empty)).toBeTruthy()
  })

  it('joins an offer the creator has not joined', () => {
    const onJoin = vi.fn()
    render(<StudioOffersView t={en.studioOffers} offers={[offer()]} onJoin={onJoin} onCreateLink={vi.fn()} />)
    expect(screen.getByText('Hotels affiliate')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.studioOffers.join }))
    expect(onJoin).toHaveBeenCalledWith('m1')
  })

  it('generates a partner link from an active participant and program URL', () => {
    const onCreateLink = vi.fn()
    render(
      <StudioOffersView
        t={en.studioOffers}
        offers={[offer({ participant: { id: 'p1', status: 'active' } })]}
        onJoin={vi.fn()}
        onCreateLink={onCreateLink}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: en.studioOffers.generateLink }))
    expect(onCreateLink).toHaveBeenCalledWith('p1', 'https://example.com/hotels')
  })

  it('renders generated links with a copy affordance', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <StudioOffersView
        t={en.studioOffers}
        offers={[offer({ participant: { id: 'p1', status: 'active' }, partnerLinks: [{ id: 'l1', partnerUrl: 'https://tp.link/abc' }] })]}
        onJoin={vi.fn()}
        onCreateLink={vi.fn()}
      />,
    )
    expect(screen.getByText('https://tp.link/abc')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.studioOffers.copy }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://tp.link/abc'))
  })
})
