// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

import HomeView from '@/components/kinnso/pages/HomeView'
import en from '@/lib/i18n/messages/en'

const guides = [
  { slug: 'real-osaka', title: 'Real Osaka Guide', cover: '/a.jpg', city: 'Osaka', saves: 12, creatorHandle: 'mei' },
  { slug: 'real-seoul', title: 'Real Seoul Guide', cover: '/b.jpg', city: 'Seoul', saves: 7, creatorHandle: 'jun' },
  { slug: 'real-tokyo', title: 'Real Tokyo Guide', cover: '/c.jpg', city: 'Tokyo', saves: 5, creatorHandle: 'aki' },
]
const stats = { activeCreators: 12, publishedGuides: 48, destinations: 9, completedBookings: 4 }
const testimonials = [
  { id: 't1', quote: 'KINNSO paid me for what I already knew.', authorName: 'Mei', authorRole: 'creator' as const },
]
const articles = [
  {
    url: 'osaka-food-streets', category: 'destination', thumbnails: ['/th.jpg'], rating: null,
    published_at: '2026-06-01T00:00:00Z', edit_at: null, title: 'Osaka food streets', summary: 'Where locals actually eat.',
  },
]
// hostHandle intentionally distinct from any guides[].creatorHandle above ('aki' collided
// with the real-tokyo guide's `@aki` card text, making the assertion below ambiguous).
const sessions = [{ id: 's1', title: 'Tokyo briefing', hostHandle: 'sora', startsAt: '2026-08-01T10:00:00Z' }]

const base = { locale: 'en' as const, t: en.home, guides, stats, testimonials, articles, sessions }

describe('HomeView (R1B 10-section homepage)', () => {
  it('renders the locked hero with both CTAs and a real-cover collage', () => {
    const { container } = render(<HomeView {...base} />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Real creators. Real places. Book the trip you actually want.' }),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: new RegExp(en.home.heroPrimaryCta) }).getAttribute('href')).toBe('/en/explore')
    expect(screen.getByRole('link', { name: en.home.heroSecondaryCta }).getAttribute('href')).toBe('/en/creators')
    expect(container.querySelector('img[src="/a.jpg"]')).toBeTruthy()
  })

  it('renders passing stats and the testimonial pull-quote with its role label', () => {
    render(<HomeView {...base} />)
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText(en.home.statGuides)).toBeTruthy()
    expect(screen.getByText(/KINNSO paid me for what I already knew\./)).toBeTruthy()
    expect(screen.getByText(new RegExp(`Mei.*${en.home.roleCreator}`))).toBeTruthy()
  })

  it('renders guides as editorial cards linking to guide detail routes', () => {
    render(<HomeView {...base} />)
    expect(screen.getByRole('link', { name: /Real Osaka Guide/ }).getAttribute('href')).toBe('/en/g/real-osaka')
    expect(screen.getByRole('link', { name: new RegExp(en.home.featuredSeeAll) }).getAttribute('href')).toBe('/en/explore')
  })

  it('renders the articles highlight linking into /articles/<category>/<url>', () => {
    render(<HomeView {...base} />)
    expect(screen.getByRole('link', { name: /Osaka food streets/ }).getAttribute('href')).toBe(
      '/en/articles/destinations/osaka-food-streets',
    )
  })

  it('renders sessions when real ones exist', () => {
    render(<HomeView {...base} />)
    expect(screen.getByText(en.home.sessionsHeading)).toBeTruthy()
    expect(screen.getByText('Tokyo briefing')).toBeTruthy()
    expect(screen.getByText('@sora')).toBeTruthy()
  })

  it('merchant and creator CTAs land on their locked routes', () => {
    render(<HomeView {...base} />)
    expect(screen.getByRole('link', { name: en.home.merchantCta }).getAttribute('href')).toBe('/en/for-merchants')
    expect(screen.getByRole('link', { name: en.home.creatorCta }).getAttribute('href')).toBe('/en/for-creators')
    expect(screen.getByRole('link', { name: new RegExp(en.home.agentCta) }).getAttribute('href')).toBe('/en/agent')
  })

  it('data-gates every proof section: nothing fake when the data is empty', () => {
    const { container } = render(
      <HomeView {...base} guides={[]} stats={null} testimonials={[]} articles={[]} sessions={[]} />,
    )
    expect(screen.getByText(en.home.featuredEmpty)).toBeTruthy()
    expect(screen.queryByText(en.home.sessionsHeading)).toBeNull()
    expect(screen.queryByText(en.home.articlesHeading)).toBeNull()
    expect(container.querySelector('blockquote')).toBeNull()
    expect(container.querySelector('img')).toBeNull() // typographic hero, no empty frames
  })

  it('contains no Unsplash imagery and no legacy mock widgets', () => {
    const { container } = render(<HomeView {...base} />)
    expect(container.querySelector('img[src*="unsplash"]')).toBeNull()
    expect(container.querySelector('.k-ticket')).toBeNull()
  })
})
