// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import HomeView from '@/components/kinnso/pages/HomeView'
import en from '@/lib/i18n/messages/en'

const sampleGuides = [
  { slug: 'real-osaka', title: 'Real Osaka Guide', cover: '/a.jpg', city: 'Osaka', saves: 12, creatorHandle: 'mei' },
  { slug: 'real-seoul', title: 'Real Seoul Guide', cover: '/b.jpg', city: 'Seoul', saves: 7, creatorHandle: 'jun' },
]

describe('HomeView', () => {
  it('renders hero, how-it-works, and locale-correct CTAs', () => {
    render(<HomeView locale="en" t={en.home} guides={sampleGuides} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Trips that pay their way.' })).toBeTruthy()
    expect(screen.getByText('Creator route / HK -> JP -> TW')).toBeTruthy()
    expect(document.querySelector('.k-ticket')).toBeTruthy()
    expect(screen.getByText(en.home.howHeading)).toBeTruthy()
    expect(screen.getByText(en.home.step1Title)).toBeTruthy()
    expect(screen.getByRole('link', { name: en.home.applyCta }).getAttribute('href')).toBe('/en/sign-up')
    expect(screen.getByRole('link', { name: en.home.travelersCta }).getAttribute('href')).toBe('/en/explore')
    expect(screen.getByRole('link', { name: en.home.merchantsCta }).getAttribute('href')).toBe('/en/merchants/post')
  })

  it('renders a card per real guide and links to the guide detail', () => {
    render(<HomeView locale="en" t={en.home} guides={sampleGuides} />)
    expect(screen.getByText('Real Osaka Guide')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Real Osaka Guide/ }).getAttribute('href')).toBe('/en/g/real-osaka')
  })

  it('shows the empty note when there are no guides', () => {
    render(<HomeView locale="en" t={en.home} guides={[]} />)
    expect(screen.getByText(en.home.featuredEmpty)).toBeTruthy()
  })

  it('the see-all link points to /explore', () => {
    render(<HomeView locale="en" t={en.home} guides={[]} />)
    expect(screen.getByRole('link', { name: new RegExp(en.home.featuredSeeAll) }).getAttribute('href')).toBe('/en/explore')
  })

  it('does not render the fabricated earnings ticker or partner-logo wall', () => {
    render(<HomeView locale="en" t={en.home} guides={[]} />)
    expect(screen.queryByLabelText('Recent creator payouts')).toBeNull()
    expect(screen.queryByText(en.home.merchantWall)).toBeNull()
  })
})
