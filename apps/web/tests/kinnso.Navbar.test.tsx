// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/en' }))

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

  it('creator shows Open Studio → /en/studio; merchant shows Find Creators + Post a Mission', () => {
    render(<Navbar locale="en" role="creator" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.ctaOpenStudio }).getAttribute('href')).toBe('/en/studio')
    cleanup()
    render(<Navbar locale="en" role="merchant" t={en.nav} />)
    expect(screen.getByRole('link', { name: en.nav.linkFindCreators }).getAttribute('href')).toBe('/en/merchants/creators')
    expect(screen.getByRole('link', { name: en.nav.ctaPostMission }).getAttribute('href')).toBe('/en/merchants/post')
  })

  it('renders the locale switcher', () => {
    render(<Navbar locale="en" role="anon" t={en.nav} />)
    expect(screen.getByLabelText(en.nav.language)).toBeTruthy()
  })
})
