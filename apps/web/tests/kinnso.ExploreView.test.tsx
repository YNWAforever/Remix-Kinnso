// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { guides } from '@/lib/creator-mock'
import { ExploreView } from '@/components/kinnso/pages/ExploreView'

afterEach(cleanup)

describe('ExploreView', () => {
  it('renders the explore heading and a card per guide', () => {
    render(<ExploreView locale="en" t={en.explore} guides={guides} />)
    expect(screen.getByRole('heading', { level: 1, name: en.explore.heading })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: en.explore.gridHeading })).toBeTruthy()
    const guideHeadings = screen.getAllByRole('heading', { level: 3 })
    expect(guideHeadings).toHaveLength(guides.length)
    const firstGuideHeading = screen.getByRole('heading', { level: 3, name: guides[0].title })
    expect(firstGuideHeading.closest('a')).toHaveAttribute('href', `/en/g/${guides[0].slug}`)
    expect(document.querySelector('.k2-card')).toBeTruthy()
  })
})
