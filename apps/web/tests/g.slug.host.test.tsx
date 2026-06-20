// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('next/navigation', () => ({ notFound }))

import { guides } from '@/lib/creator-mock'

describe('/[locale]/g/[slug] host', () => {
  it('renders a known guide and links back to its creator profile', async () => {
    const route = await import('@/app/[locale]/g/[slug]/page')
    const guide = guides[0]
    const ui = await route.default({ params: Promise.resolve({ locale: 'en', slug: guide.slug }) })

    render(ui)

    expect(screen.getByRole('heading', { level: 1, name: guide.title })).toBeTruthy()
    expect(screen.getByRole('link', { name: `@${guide.creatorHandle}` }).getAttribute('href')).toBe(
      `/en/c/${guide.creatorHandle}`,
    )
    expect(document.querySelector('.k-route-stamp')).toBeTruthy()
  })
})
