// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PublicCreator } from '@/lib/creators/queries'

const relatedQueries = vi.hoisted(() => ({
  articles: vi.fn(async () => { throw new Error('articles unavailable') }),
  sessions: vi.fn(async () => { throw new Error('sessions unavailable') }),
}))

const creator = {
  id: 'creator-1', handle: 'maya', name: 'Maya Wanders', bio: 'Slow travel.', avatarUrl: null,
  profile: { niches: ['Coffee'], content_pillars: [], tone: [], audience_geos: [], audience_locales: [], languages: [], platforms: [] },
  guides: [],
} as unknown as PublicCreator

vi.mock('@/lib/creators/queries', () => ({
  getCreatorByHandle: vi.fn(async (handle: string) => (handle === 'maya' ? creator : null)),
}))
vi.mock('@/lib/articles/queries', () => ({ getPublishedArticlesForCreator: relatedQueries.articles }))
vi.mock('@/lib/sessions/public-queries', () => ({ getPublicSessionsForCreator: relatedQueries.sessions }))

const notFoundError = new Error('NEXT_NOT_FOUND')
vi.mock('next/navigation', () => ({ notFound: () => { throw notFoundError } }))

import CreatorPublicPage from '@/app/[locale]/c/[handle]/page'

describe('/[locale]/c/[handle] optional query boundaries', () => {
  it('keeps the required creator profile rendered when independent related queries fail', async () => {
    const ui = await CreatorPublicPage({ params: Promise.resolve({ locale: 'en', handle: 'maya' }) })
    render(ui)

    expect(screen.getByRole('heading', { level: 1, name: 'Maya Wanders' })).toBeInTheDocument()
    expect(relatedQueries.articles).toHaveBeenCalledWith('maya', 'en')
    expect(relatedQueries.sessions).toHaveBeenCalledWith('creator-1')
  })
})
