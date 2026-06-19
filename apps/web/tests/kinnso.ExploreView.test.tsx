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
    expect(screen.getByText(guides[0].title)).toBeTruthy()
    expect(
      screen.getAllByRole('link').some((a) => a.getAttribute('href') === `/en/g/${guides[0].slug}`),
    ).toBe(true)
  })
})
