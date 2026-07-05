// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

const { getExperiencesForCityMock } = vi.hoisted(() => ({ getExperiencesForCityMock: vi.fn() }))
vi.mock('@/lib/experiences/public-queries', () => ({ getExperiencesForCity: getExperiencesForCityMock }))

import { ArticleExperienceLinks } from '@/components/kinnso/articles/ArticleExperienceLinks'
import en from '@/lib/i18n/messages/en'

const experience = (slug: string) => ({
  id: slug, slug, title: `Experience ${slug}`, summary: null, description: null, city: 'Tokyo',
  priceAmount: 1000, currency: 'JPY', durationMinutes: null, coverUrl: null, publishedAt: null,
  merchant: { slug: 'm', companyName: 'M' },
})

describe('ArticleExperienceLinks', () => {
  it('renders nothing when no experiences match any region', async () => {
    getExperiencesForCityMock.mockResolvedValue([])
    const jsx = await ArticleExperienceLinks({ locale: 'en', regions: ['Osaka'], t: en.article })
    const { container } = render(jsx)
    expect(container.innerHTML).toBe('')
  })

  it('renders up to 3 experience cards from the first region with matches, linking with ?src=article', async () => {
    getExperiencesForCityMock.mockResolvedValueOnce([experience('a'), experience('b')])
    const jsx = await ArticleExperienceLinks({ locale: 'en', regions: ['Tokyo'], t: en.article })
    render(jsx)
    expect(screen.getByText(en.article.experiencesNearbyHeading)).toBeTruthy()
    const link = screen.getByRole('link', { name: /Experience a/ })
    expect(link.getAttribute('href')).toBe('/en/experiences/a?src=article')
  })
})
