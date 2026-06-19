// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

afterEach(cleanup)

const { getPublishedGuidesMock } = vi.hoisted(() => ({ getPublishedGuidesMock: vi.fn() }))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('@/lib/guides/queries', () => ({ getPublishedGuides: getPublishedGuidesMock }))

import FeedPage from '@/app/[locale]/feed/page'

beforeEach(() => {
  getPublishedGuidesMock.mockReset()
  getPublishedGuidesMock.mockResolvedValue([
    { slug: 'kyoto-temples', title: 'Kyoto Temples', cover: 'https://img.example/k.jpg', city: 'Kyoto', saves: 88, creatorHandle: 'rin' },
  ])
})

describe('/[locale]/feed host', () => {
  it('renders real published guides as feed cards', async () => {
    const ui = await FeedPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Kyoto Temples')).toBeTruthy()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/en/g/kyoto-temples')
  })
})
