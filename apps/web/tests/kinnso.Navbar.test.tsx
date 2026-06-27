// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/en',
  useSearchParams: () => new URLSearchParams(),
}))

import { Navbar } from '@/components/kinnso/Navbar'
import en from '@/lib/i18n/messages/en'

describe('Navbar', () => {
  it('locale-prefixes the nav links and logo', () => {
    render(<Navbar locale="en" role="anon" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.linkCreators }).getAttribute('href')).toBe('/en/creators')
    expect(screen.getByRole('link', { name: 'KINNSO' }).getAttribute('href')).toBe('/en')
  })

  it('anon shows Sign in + Apply CTA → /en/sign-up', () => {
    render(<Navbar locale="en" role="anon" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.signIn }).getAttribute('href')).toBe('/en/sign-in')
    expect(screen.getByRole('link', { name: en.nav.ctaApply }).getAttribute('href')).toBe('/en/sign-up')
  })

  it('creator shows Open Studio → /en/studio; merchant shows Missions queue + Post a Mission', () => {
    render(<Navbar locale="en" role="creator" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.ctaOpenStudio }).getAttribute('href')).toBe('/en/studio')
    cleanup()
    render(<Navbar locale="en" role="merchant" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.linkMissions }).getAttribute('href')).toBe('/en/merchants/missions')
    expect(screen.getByRole('link', { name: en.nav.ctaPostMission }).getAttribute('href')).toBe('/en/merchants/post')
    // Find Creators now points at the real gated creator-search surface.
    expect(screen.getAllByRole('link', { name: en.nav.linkFindCreators })[0].getAttribute('href')).toBe('/en/merchants/creators')
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

  it('connects the mobile menu button to the collapsible menu region only while it is open', () => {
    render(<Navbar locale="en" role="anon" t={en.nav} />)
    const button = screen.getByRole('button', { name: en.nav.menuToggle })
    // Collapsed: not expanded, and no controlled region referenced (it isn't rendered yet).
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-controls')).toBeNull()
    // Expanded: the menu mounts and the button references its real id.
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('aria-controls')).toBe('kinnso-mobile-menu')
    expect(document.getElementById('kinnso-mobile-menu')).toBeTruthy()
  })
})
