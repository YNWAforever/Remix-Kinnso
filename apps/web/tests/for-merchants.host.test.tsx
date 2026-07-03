// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { ForMerchantsView } from '@/components/kinnso/pages/ForMerchantsView'

afterEach(cleanup)

describe('ForMerchantsView', () => {
  it('renders hero, steps, and CTAs → /merchants/apply; hides empty testimonials strip', () => {
    render(<ForMerchantsView locale="en" t={en.forMerchants} testimonials={[]} />)
    expect(screen.getByRole('heading', { level: 1, name: en.forMerchants.heroTitle })).toBeTruthy()
    const applyLinks = screen.getAllByRole('link', { name: en.forMerchants.heroCtaPrimary })
    expect(applyLinks.every((l) => l.getAttribute('href') === '/en/merchants/apply')).toBe(true)
    const contactLink = screen.getByRole('link', { name: en.forMerchants.heroCtaSecondary })
    expect(contactLink.getAttribute('href')).toBe('/en/contact')
    expect(document.getElementById('for-merchants-testimonials')).toBeNull()
  })

  it('shows the testimonials strip when quotes exist', () => {
    render(<ForMerchantsView locale="en" t={en.forMerchants} testimonials={[{ id: '1', quote: 'Great', authorName: 'A', authorRole: 'merchant' }]} />)
    expect(document.getElementById('for-merchants-testimonials')).toBeTruthy()
  })
})
