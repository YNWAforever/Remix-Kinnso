// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

const captured = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }))
const mocks = vi.hoisted(() => ({
  guides: vi.fn(async () => [{ slug: 'tokyo', title: 'Tokyo', cover: null, city: 'Tokyo', saves: 0, creatorHandle: 'ada' }]),
  destinations: vi.fn(async () => [{
    slug: 'tokyo', name: 'Tokyo', matchTerms: ['東京'], guideCount: 1, experienceCount: 0,
    heroImageUrl: null, description: null, latestPublishedAt: null,
  }]),
}))

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/lib/guides/queries', () => ({ getPublishedGuides: mocks.guides }))
vi.mock('@/lib/destinations/queries', () => ({ getPublishedDestinations: mocks.destinations }))
vi.mock('@/components/kinnso/pages/ExploreView', () => ({
  ExploreView: (props: Record<string, unknown>) => {
    captured.props = props
    return <div data-testid="explore-view" />
  },
}))

import ExplorePage, { revalidate } from '@/app/[locale]/explore/page'
import ExploreLoading from '@/app/[locale]/explore/loading'

describe('/[locale]/explore host', () => {
  beforeEach(() => { captured.props = null; vi.clearAllMocks() })

  it('loads guides and canonical destinations for the static view', async () => {
    render(await ExplorePage({ params: Promise.resolve({ locale: 'en' }) }))
    expect(mocks.guides).toHaveBeenCalledOnce()
    expect(mocks.destinations).toHaveBeenCalledOnce()
    expect(captured.props).toMatchObject({
      locale: 'en',
      guides: await mocks.guides.mock.results[0].value,
      destinations: await mocks.destinations.mock.results[0].value,
    })
    expect(revalidate).toBe(300)
  })

  it('passes an empty destination list through for graceful unfiltered browsing', async () => {
    mocks.destinations.mockResolvedValueOnce([])
    render(await ExplorePage({ params: Promise.resolve({ locale: 'en' }) }))
    expect(captured.props?.destinations).toEqual([])
  })

  it('renders a labelled skeleton structure without visible copy', () => {
    const { container } = render(<ExploreLoading />)
    expect(container.querySelector('[data-explore-skeleton="true"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-guide-card-skeleton="true"]')).toHaveLength(6)
  })

  it('rejects an unknown locale', async () => {
    await expect(ExplorePage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})