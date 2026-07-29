// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { guides } from '@/lib/creator-mock'
import { ExploreView } from '@/components/kinnso/pages/ExploreView'
import type { Destination } from '@/lib/destinations/queries'

const destinations: Destination[] = [
  {
    slug: 'tokyo',
    name: 'Tokyo',
    matchTerms: ['\u6771\u4eac'],
    guideCount: 2,
    experienceCount: 0,
    heroImageUrl: null,
    description: null,
    latestPublishedAt: null,
  },
]

beforeEach(() => {
  window.history.replaceState({}, '', '/en/explore')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  cleanup()
})

describe('ExploreView', () => {
  it('renders the explore heading and a card per guide', () => {
    render(<ExploreView locale="en" t={en.explore} guides={guides} destinations={destinations} />)
    expect(screen.getByRole('heading', { level: 1, name: en.explore.heading })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: en.explore.gridHeading })).toBeTruthy()
    const guideHeadings = screen.getAllByRole('heading', { level: 3 })
    expect(guideHeadings).toHaveLength(guides.length)
    const firstGuideHeading = screen.getByRole('heading', { level: 3, name: guides[0].title })
    expect(firstGuideHeading.closest('a')).toHaveAttribute('href', `/en/g/${guides[0].slug}`)
    expect(document.querySelector('.k2-card')).toBeTruthy()
  })

  it('filters by canonical destination and replaces the current URL', () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    render(<ExploreView
      locale="en"
      t={en.explore}
      guides={[
        { ...guides[0], slug: 'tokyo', city: '\u6771\u4eac' },
        { ...guides[1], slug: 'seoul', city: 'Seoul' },
      ]}
      destinations={[
        ...destinations,
        {
          ...destinations[0],
          slug: 'seoul',
          name: 'Seoul',
          matchTerms: [],
          guideCount: 1,
        },
      ]}
    />)
    fireEvent.click(screen.getByRole('radio', { name: 'Tokyo' }))
    expect(screen.getByRole('heading', { level: 3, name: guides[0].title })).toBeVisible()
    expect(screen.queryByRole('heading', { level: 3, name: guides[1].title })).not.toBeInTheDocument()
    expect(replaceSpy).toHaveBeenLastCalledWith(
      window.history.state,
      '',
      '/en/explore?destination=tokyo',
    )
  })

  it('debounces card-field search, resets page, and announces the result count', async () => {
    vi.useFakeTimers()
    const paginatedGuides = Array.from({ length: 13 }, (_, index) => ({
      ...guides[0],
      slug: `guide-${index}`,
      title: `Guide ${index}`,
      creatorHandle: index === 0 ? 'unique-alpha' : `creator-${index}`,
    }))
    render(<ExploreView
      locale="en"
      t={en.explore}
      guides={paginatedGuides}
      destinations={destinations}
    />)
    fireEvent.click(screen.getByRole('button', { name: en.explore.loadMore }))
    expect(window.location.search).toBe('?page=2')
    fireEvent.change(screen.getByRole('searchbox', { name: en.explore.searchLabel }), {
      target: { value: paginatedGuides[0].creatorHandle },
    })
    expect(window.location.search).toBe('?page=2')
    await vi.advanceTimersByTimeAsync(250)
    expect(window.location.search).toContain('q=unique-alpha')
    expect(window.location.search).not.toContain('page=')
    expect(screen.getByRole('status')).toHaveTextContent('1')
  })

  it('restores valid direct URL state after hydration', async () => {
    window.history.replaceState({}, '', '/en/explore?destination=tokyo&page=2')
    render(<ExploreView
      locale="en"
      t={en.explore}
      guides={Array.from({ length: 13 }, (_, index) => ({
        ...guides[0],
        slug: `tokyo-${index}`,
        title: `Tokyo ${index}`,
        city: 'Tokyo',
      }))}
      destinations={destinations}
    />)
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Tokyo' })).toBeChecked())
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(13)
  })

  it('reveals twelve cards, loads the thirteenth, and persists page=2', () => {
    render(<ExploreView
      locale="en"
      t={en.explore}
      guides={Array.from({ length: 13 }, (_, index) => ({
        ...guides[0],
        slug: `guide-${index}`,
        title: `Guide ${index}`,
      }))}
      destinations={destinations}
    />)
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(12)
    fireEvent.click(screen.getByRole('button', { name: en.explore.loadMore }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(13)
    expect(window.location.search).toBe('?page=2')
    expect(screen.queryByRole('button', { name: en.explore.loadMore })).not.toBeInTheDocument()
  })

  it('keeps controls visible in filtered-empty state and resets all state', async () => {
    vi.useFakeTimers()
    render(<ExploreView locale="en" t={en.explore} guides={guides} destinations={destinations} />)
    fireEvent.change(screen.getByRole('searchbox', { name: en.explore.searchLabel }), {
      target: { value: 'definitely-no-match' },
    })
    await vi.advanceTimersByTimeAsync(250)
    expect(screen.getByText(en.explore.emptyFilteredTitle)).toBeVisible()
    expect(screen.getByRole('searchbox', { name: en.explore.searchLabel })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: en.explore.resetFilters }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(guides.length)
    expect(window.location.search).toBe('')
  })
})
