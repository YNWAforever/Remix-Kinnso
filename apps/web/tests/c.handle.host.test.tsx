// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
// vi.mock factories are hoisted above module-scope consts, so declare the
// notFound spy via vi.hoisted to make it available inside the factory.
const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), notFound }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}))

import CreatorPublicPage, { generateMetadata } from '@/app/[locale]/c/[handle]/page'
import { getCreator } from '@/lib/creator-mock'

describe('/[locale]/c/[handle] host', () => {
  it('renders the public profile for a known handle', async () => {
    const ui = await CreatorPublicPage({ params: Promise.resolve({ locale: 'en', handle: 'maywanders' }) })
    render(ui)
    const creator = getCreator('maywanders')!
    expect(screen.getByRole('heading', { level: 1, name: creator.name })).toBeTruthy()
  })

  it('builds SEO metadata from the creator', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en', handle: 'maywanders' }) })
    const creator = getCreator('maywanders')!
    expect(meta.title).toContain(creator.name)
    expect(meta.title).toContain(String(creator.score))
  })

  it('calls notFound for an unknown handle', async () => {
    await expect(
      CreatorPublicPage({ params: Promise.resolve({ locale: 'en', handle: 'ghost' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
