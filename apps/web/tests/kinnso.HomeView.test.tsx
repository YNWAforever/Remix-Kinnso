// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import HomeView from '@/components/kinnso/pages/HomeView'
import { creators } from '@/lib/creator-mock'
import en from '@/lib/i18n/messages/en'

describe('HomeView', () => {
  it('renders hero, how-it-works, a featured creator, and locale-correct CTAs', () => {
    render(<HomeView locale="en" t={en.home} />)
    expect(screen.getByRole('heading', { level: 1, name: en.home.heroTitle })).toBeTruthy()
    expect(screen.getByText(en.home.howHeading)).toBeTruthy()
    expect(screen.getByText(en.home.step1Title)).toBeTruthy()
    // Featured carousel: a known mock creator + locale-prefixed link
    const firstFeatured = creators[0]
    const card = screen.getByRole('link', { name: new RegExp(firstFeatured.name) })
    expect(card.getAttribute('href')).toBe(`/en/c/${firstFeatured.handle}`)
    // CTAs
    expect(screen.getByRole('link', { name: en.home.applyCta }).getAttribute('href')).toBe('/en/sign-up')
    expect(screen.getByRole('link', { name: en.home.travelersCta }).getAttribute('href')).toBe('/en/explore')
    expect(screen.getByRole('link', { name: en.home.merchantsCta }).getAttribute('href')).toBe('/en/merchants/post')
  })
})
