// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { missions } from '@/lib/creator-mock'
import { MerchantsLandingView } from '@/components/kinnso/pages/MerchantsLandingView'

afterEach(cleanup)

describe('MerchantsLandingView', () => {
  it('renders the hero, a sample mission, and CTAs to post + browse', () => {
    render(<MerchantsLandingView locale="en" t={en.merchantsLanding} />)
    expect(screen.getByRole('heading', { name: en.merchantsLanding.heroTitle })).toBeTruthy()
    expect(screen.getByText(missions[0].title)).toBeTruthy()
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links).toContain('/en/merchants/post')
    expect(links).toContain('/en/merchants/creators')
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })
})
