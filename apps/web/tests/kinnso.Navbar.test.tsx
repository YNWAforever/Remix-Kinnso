// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

let mockPathname = '/en'

afterEach(() => {
  cleanup()
  mockPathname = '/en'
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}))

import { Navbar } from '@/components/kinnso/Navbar'
import en from '@/lib/i18n/messages/en'

describe('Navbar (R1A editorial IA)', () => {
  it('renders the traveller-first base anchors for all roles, locale-prefixed', () => {
    render(<Navbar locale="en" role="anon" t={en.nav} />)
    const expected = [
      [en.nav.linkExplore, '/en/explore'],
      [en.nav.linkDestinations, '/en/destinations'],
      [en.nav.linkArticles, '/en/articles'],
      [en.nav.linkSessions, '/en/sessions'],
      [en.nav.linkAgent, '/en/agent'],
      [en.nav.linkCreators, '/en/creators'],
    ] as const
    for (const [name, href] of expected) {
      expect(screen.getByRole('link', { name }).getAttribute('href')).toBe(href)
    }
    expect(screen.getByRole('link', { name: 'KINNSO' }).getAttribute('href')).toBe('/en')
  })

  it('shows a For Merchants link → /en/merchants (href swaps to /for-merchants in R1C)', () => {
    render(<Navbar locale="en" role="anon" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.linkForMerchants }).getAttribute('href')).toBe('/en/merchants')
  })

  it('anon shows Sign in + Apply CTA → /en/sign-up', () => {
    render(<Navbar locale="en" role="anon" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.signIn }).getAttribute('href')).toBe('/en/sign-in')
    expect(screen.getByRole('link', { name: en.nav.ctaApply }).getAttribute('href')).toBe('/en/sign-up')
  })

  it('creator shows Open Studio; merchant keeps queue + creator search + insights + Post a Mission', () => {
    render(<Navbar locale="en" role="creator" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.ctaOpenStudio }).getAttribute('href')).toBe('/en/studio')
    cleanup()
    render(<Navbar locale="en" role="merchant" t={en.nav} />)
    expect(screen.getAllByRole('link', { name: en.nav.linkMissions })[0].getAttribute('href')).toBe('/en/merchants/missions')
    expect(screen.getByRole('link', { name: en.nav.ctaPostMission }).getAttribute('href')).toBe('/en/merchants/post')
    expect(screen.getAllByRole('link', { name: en.nav.linkFindCreators })[0].getAttribute('href')).toBe('/en/merchants/creators')
    expect(screen.getAllByRole('link', { name: en.nav.linkInsights })[0].getAttribute('href')).toBe('/en/merchants/insights')
  })

  it('creator-pending renders the pending pill CTA → /en/creators/apply', () => {
    render(<Navbar locale="en" role="creator-pending" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.ctaPending }).getAttribute('href')).toBe('/en/creators/apply')
  })

  it('does not render a Travelers/feed anchor (consolidated into /explore)', () => {
    render(<Navbar locale="en" role="anon" t={en.nav} />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).not.toContain('/en/feed')
    expect(hrefs).toContain('/en/explore')
  })

  it('renders the locale switcher', () => {
    render(<Navbar locale="en" role="anon" t={en.nav} />)
    expect(screen.getByLabelText(en.nav.language)).toBeTruthy()
  })

  it('uses localized text for the mobile menu toggle label', () => {
    render(<Navbar locale="en" role="anon" t={en.nav} />)
    expect(screen.getByRole('button', { name: en.nav.menuToggle })).toBeTruthy()
  })

  it('connects the mobile menu button to the collapsible region only while it is open', () => {
    render(<Navbar locale="en" role="anon" t={en.nav} />)
    const button = screen.getByRole('button', { name: en.nav.menuToggle })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-controls')).toBeNull()
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('aria-controls')).toBe('kinnso-mobile-menu')
    expect(document.getElementById('kinnso-mobile-menu')).toBeTruthy()
  })

  it('marks the matching base anchor with aria-current="page" and leaves siblings unmarked', () => {
    mockPathname = '/en/explore'
    render(<Navbar locale="en" role="anon" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.linkExplore }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: en.nav.linkDestinations }).getAttribute('aria-current')).toBeNull()
  })

  it('prefix-matches nested paths for aria-current (e.g. /creators/apply → Creators)', () => {
    mockPathname = '/en/creators/apply'
    render(<Navbar locale="en" role="anon" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.linkCreators }).getAttribute('aria-current')).toBe('page')
  })

  it('merchant sub-row owns the active state on /merchants/creators; base Creators stays inactive', () => {
    mockPathname = '/en/merchants/creators'
    render(<Navbar locale="en" role="merchant" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.linkFindCreators }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: en.nav.linkCreators }).getAttribute('aria-current')).toBeNull()
  })

  it('merchant does not get a For Merchants link (desktop or tray)', () => {
    render(<Navbar locale="en" role="merchant" t={en.nav} />)
    expect(screen.queryByRole('link', { name: en.nav.linkForMerchants })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.nav.menuToggle }))
    expect(screen.queryByRole('link', { name: en.nav.linkForMerchants })).toBeNull()
  })

  it('merchant deep-links render in the desktop sub-row and again in the open mobile tray', () => {
    render(<Navbar locale="en" role="merchant" t={en.nav} />)
    expect(screen.getAllByRole('link', { name: en.nav.linkMissions }).length).toBeGreaterThanOrEqual(1)
    fireEvent.click(screen.getByRole('button', { name: en.nav.menuToggle }))
    expect(screen.getAllByRole('link', { name: en.nav.linkMissions }).length).toBeGreaterThanOrEqual(2)
  })
})
