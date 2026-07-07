// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

import { Hero } from '@/components/kinnso/home/Hero'
import { StatsBar } from '@/components/kinnso/home/StatsBar'
import en from '@/lib/i18n/messages/en'

const guide = (slug: string, cover = `/covers/${slug}.jpg`) => ({
  slug, title: `Guide ${slug}`, cover, city: 'Osaka', saves: 3, creatorHandle: 'mei',
})

describe('Hero (section 1)', () => {
  it('renders the locked headline, sub, and both CTAs', () => {
    render(<Hero locale="en" t={en.home} guides={[]} />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Real creators. Real places. Book the trip you actually want.' }),
    ).toBeTruthy()
    expect(screen.getByText('Discover guides from trusted travel creators. Plan with AI. Book in one place.')).toBeTruthy()
    expect(screen.getByRole('link', { name: new RegExp(en.home.heroPrimaryCta) }).getAttribute('href')).toBe('/en/explore')
    expect(screen.getByRole('link', { name: en.home.heroSecondaryCta }).getAttribute('href')).toBe('/en/creators')
  })

  it('renders an editorial collage from REAL guide covers when 3+ exist', () => {
    const { container } = render(<Hero locale="en" t={en.home} guides={[guide('a'), guide('b'), guide('c'), guide('d')]} />)
    const imgs = container.querySelectorAll('img')
    expect(imgs.length).toBe(3)
    expect(imgs[0].getAttribute('src')).toBe('/covers/a.jpg')
  })

  it('renders a purely typographic hero with fewer than 3 covers — no empty frames, no stock photos', () => {
    const { container } = render(<Hero locale="en" t={en.home} guides={[guide('a'), guide('b', '')]} />)
    expect(container.querySelectorAll('img').length).toBe(0)
  })
})

describe('StatsBar (section 2 — threshold-gated honesty)', () => {
  const t = en.home
  it('renders nothing when stats are unavailable', () => {
    const { container } = render(<StatsBar locale="en" t={t} stats={null} />)
    expect(container.innerHTML).toBe('')
  })
  it('renders nothing when fewer than 2 stats pass their thresholds', () => {
    const { container } = render(
      <StatsBar locale="en" t={t} stats={{ activeCreators: 12, publishedGuides: 3, destinations: 2, completedBookings: 0, upcomingSessions: 0 }} />,
    )
    expect(container.innerHTML).toBe('')
  })
  it('renders only stats at/above threshold — never zeros', () => {
    render(
      <StatsBar locale="en" t={t} stats={{ activeCreators: 12, publishedGuides: 48, destinations: 0, completedBookings: 0, upcomingSessions: 0 }} />,
    )
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('48')).toBeTruthy()
    expect(screen.getByText(t.statCreators)).toBeTruthy()
    expect(screen.queryByText(t.statDestinations)).toBeNull()
    expect(screen.queryByText(t.statCompletedBookings)).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
  })
  it('renders all four when all pass (boundary values count as passing)', () => {
    render(
      <StatsBar locale="en" t={t} stats={{ activeCreators: 5, publishedGuides: 10, destinations: 3, completedBookings: 3, upcomingSessions: 0 }} />,
    )
    expect(screen.getByText(t.statCreators)).toBeTruthy()
    expect(screen.getByText(t.statGuides)).toBeTruthy()
    expect(screen.getByText(t.statDestinations)).toBeTruthy()
    expect(screen.getByText(t.statCompletedBookings)).toBeTruthy()
  })
  it('shows the upcoming-sessions stat once it meets its threshold (1)', () => {
    render(<StatsBar locale="en" t={t} stats={{ activeCreators: 12, publishedGuides: 48, destinations: 9, completedBookings: 4, upcomingSessions: 1 }} />)
    expect(screen.getByText(en.home.statUpcomingSessions)).toBeTruthy()
  })
})
