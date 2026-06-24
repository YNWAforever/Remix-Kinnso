// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PublicCreator } from '@/lib/creators/queries'

const creator: PublicCreator = {
  handle: 'maya',
  name: 'Maya Wanders',
  bio: 'Slow travel.',
  profile: { niches: ['Coffee'], content_pillars: [], tone: [], audience_geos: [], audience_locales: [], languages: [], platforms: [] },
  guides: [],
}

vi.mock('@/lib/creators/queries', () => ({
  getCreatorByHandle: vi.fn(async (h: string) => (h === 'maya' ? creator : null)),
}))

const notFoundError = new Error('NEXT_NOT_FOUND')
vi.mock('next/navigation', () => ({ notFound: () => { throw notFoundError } }))

import CreatorPublicPage from '@/app/[locale]/c/[handle]/page'

describe('/[locale]/c/[handle] host', () => {
  it('renders the real profile for a known handle', async () => {
    const ui = await CreatorPublicPage({ params: Promise.resolve({ locale: 'en', handle: 'maya' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: 'Maya Wanders' })).toBeInTheDocument()
    expect(screen.getAllByText('@maya')[0]).toBeInTheDocument()
  })

  it('calls notFound for an unknown handle', async () => {
    await expect(
      CreatorPublicPage({ params: Promise.resolve({ locale: 'en', handle: 'ghost' }) }),
    ).rejects.toBe(notFoundError)
  })
})
