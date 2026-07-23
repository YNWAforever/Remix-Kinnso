// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Footer from '@/components/kinnso/Footer'
import en from '@/lib/i18n/messages/en'
import ja from '@/lib/i18n/messages/ja'

afterEach(cleanup)

describe('Footer (R1A editorial IA)', () => {
  it('renders the new Explore column with locale-prefixed links', () => {
    render(<Footer locale="ja" bookingLive={false} t={en.footer} />)
    expect(screen.getByText(en.footer.colExplore)).toBeTruthy()
    expect(screen.getByRole('link', { name: en.footer.lGuides }).getAttribute('href')).toBe('/ja/explore')
    expect(screen.getByRole('link', { name: en.footer.lDestinations }).getAttribute('href')).toBe('/ja/destinations')
    expect(screen.getByRole('link', { name: en.footer.lArticles }).getAttribute('href')).toBe('/ja/articles')
    expect(screen.getByRole('link', { name: en.footer.lSessions }).getAttribute('href')).toBe('/ja/sessions')
  })

  it('keeps the Creators column (Apply / Studio / Missions / Earnings)', () => {
    render(<Footer locale="en" bookingLive={false} t={en.footer} />)
    expect(screen.getByText(en.footer.colCreators)).toBeTruthy()
    expect(screen.getByRole('link', { name: en.footer.lApply }).getAttribute('href')).toBe('/en/sign-up')
    expect(screen.getByRole('link', { name: en.footer.lStudio }).getAttribute('href')).toBe('/en/studio')
    expect(screen.getByRole('link', { name: en.footer.lMissions }).getAttribute('href')).toBe('/en/studio/missions')
    expect(screen.getByRole('link', { name: en.footer.lEarnings }).getAttribute('href')).toBe('/en/studio/earnings')
  })

  it('routes "How it works" to the merchant landing, not a pricing page', () => {
    render(<Footer locale="en" bookingLive={false} t={en.footer} />)
    expect(screen.getByRole('link', { name: en.footer.lPricing }).getAttribute('href')).toBe('/en/for-merchants')
    expect(screen.getByRole('link', { name: en.footer.lPostMission }).getAttribute('href')).toBe('/en/merchants/post')
  })

  it('links the For Creators label to the creator landing', () => {
    render(<Footer locale="en" bookingLive={false} t={en.footer} />)
    expect(screen.getByRole('link', { name: en.footer.lForCreators }).getAttribute('href')).toBe('/en/for-creators')
  })

  it('keeps the Company column honest (single /about, no Case studies / Press)', () => {
    render(<Footer locale="en" bookingLive={false} t={en.footer} />)
    const aboutLinks = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/en/about')
    expect(aboutLinks).toHaveLength(1)
    expect(screen.queryByText('Case studies')).toBeNull()
    expect(screen.queryByText('Press')).toBeNull()
    expect(screen.getByRole('link', { name: en.footer.lContact }).getAttribute('href')).toBe('/en/contact')
    expect(screen.getByRole('link', { name: en.footer.lLegal }).getAttribute('href')).toBe('/en/legal/creator-terms')
  })

  it('renders tagline + rights and no non-functional social labels', () => {
    render(<Footer locale="en" bookingLive={false} t={en.footer} />)
    expect(screen.getByText(en.footer.tagline)).toBeTruthy()
    expect(screen.getByText(en.footer.rights)).toBeTruthy()
    expect(screen.queryByText('Instagram')).toBeNull()
    expect(screen.queryByText('WhatsApp')).toBeNull()
  })
  it('routes public Post a mission through the auth-aware entry', () => {
    render(<Footer locale="en" bookingLive={false} t={en.footer} />)
    expect(
      screen.getByRole('link', { name: en.footer.lPostMission }).getAttribute('href'),
    ).toBe('/en/merchants/post')
  })

  it('omits traveller links while booking is not live', () => {
    render(<Footer locale="en" bookingLive={false} t={en.footer} />)
    expect(screen.queryByText(en.footer.colTravellers)).toBeNull()
    expect(screen.queryByRole('link', { name: en.footer.lTrips })).toBeNull()
    expect(screen.queryByRole('link', { name: en.footer.lSaved })).toBeNull()
  })

  it('renders localized Trips and Saved links only while booking is live', () => {
    render(<Footer locale="ja" bookingLive t={ja.footer} />)
    expect(screen.getByText(ja.footer.colTravellers)).toBeTruthy()
    expect(screen.getByRole('link', { name: ja.footer.lTrips }).getAttribute('href'))
      .toBe('/ja/trips')
    expect(screen.getByRole('link', { name: ja.footer.lSaved }).getAttribute('href'))
      .toBe('/ja/trips#saved')
  })
})
