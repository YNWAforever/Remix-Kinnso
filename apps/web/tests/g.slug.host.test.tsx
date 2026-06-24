// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('next/navigation', () => ({ notFound }))

vi.mock('@/lib/guides/queries', () => ({
  getGuideBySlug: vi.fn(async () => ({
    slug: 'kyoto-tea',
    title: 'Kyoto Tea Houses',
    cover: 'https://example.com/kyoto.jpg',
    city: 'Kyoto',
    saves: 5,
    creatorHandle: 'teafan',
    creatorName: 'Tea Fan',
    summary: 'Lovely tea houses.',
    source: 'db',
  })),
}))

describe('/[locale]/g/[slug] host', () => {
  it('renders a known guide and links the author to /c/[handle]', async () => {
    const route = await import('@/app/[locale]/g/[slug]/page')
    const ui = await route.default({ params: Promise.resolve({ locale: 'en', slug: 'kyoto-tea' }) })

    render(ui)

    expect(screen.getByRole('heading', { level: 1, name: 'Kyoto Tea Houses' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '@teafan' }).getAttribute('href')).toBe('/en/c/teafan')
    expect(document.querySelector('.k-route-stamp')).toBeTruthy()
  })
})
