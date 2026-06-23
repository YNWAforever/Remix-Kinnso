// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Footer from '@/components/kinnso/Footer'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('Footer', () => {
  it('renders translated column titles and locale-prefixed links', () => {
    render(<Footer locale="ja" t={en.footer} />)
    expect(screen.getByText(en.footer.colCreators)).toBeTruthy()
    expect(screen.getByRole('link', { name: en.footer.lStudio }).getAttribute('href')).toBe('/ja/studio')
    expect(screen.getByRole('link', { name: en.footer.lAbout }).getAttribute('href')).toBe('/ja/about')
  })

  it('routes "How it works" to the merchant landing, not a pricing page', () => {
    render(<Footer locale="en" t={en.footer} />)
    expect(screen.getByRole('link', { name: en.footer.lPricing }).getAttribute('href')).toBe('/en/merchants')
  })

  it('does not render duplicate dead links to /about', () => {
    render(<Footer locale="en" t={en.footer} />)
    // About is the single honest link; the old Case studies / Press / Contact duplicates are gone.
    const aboutLinks = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/en/about')
    expect(aboutLinks).toHaveLength(1)
    expect(screen.queryByText(en.footer.lCaseStudies)).toBeNull()
    expect(screen.queryByText(en.footer.lPress)).toBeNull()
    expect(screen.queryByText(en.footer.lContact)).toBeNull()
  })

  it('does not render non-functional social labels', () => {
    render(<Footer locale="en" t={en.footer} />)
    expect(screen.queryByText('Instagram')).toBeNull()
    expect(screen.queryByText('WhatsApp')).toBeNull()
  })
})
