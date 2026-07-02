// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { MerchantsLandingView } from '@/components/kinnso/pages/MerchantsLandingView'

afterEach(cleanup)

describe('MerchantsLandingView', () => {
  it('renders the merchant hub with links to post/creators/missions and a for-merchants pointer', () => {
    render(<MerchantsLandingView locale="en" t={en.merchantsLanding} />)
    expect(screen.getByRole('heading', { name: en.merchantsLanding.hubTitle })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: en.merchantsLanding.cardsHeading })).toBeTruthy()
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links).toContain('/en/merchants/post')
    expect(links).toContain('/en/merchants/creators')
    expect(links).toContain('/en/merchants/missions')
    expect(links).toContain('/en/for-merchants')
  })
})
