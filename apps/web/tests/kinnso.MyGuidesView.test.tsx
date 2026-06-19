// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { MyGuidesView } from '@/components/kinnso/pages/MyGuidesView'
import type { GuideListItem } from '@/lib/guides/types'

afterEach(cleanup)

const items: GuideListItem[] = [
  { id: '1', slug: 'a', title: 'Alpha Guide', city: 'Tokyo', cover: 'https://x/y.jpg', status: 'published' },
  { id: '2', slug: 'b', title: 'Beta Guide', city: 'Osaka', cover: 'https://x/z.jpg', status: 'draft' },
]

describe('MyGuidesView', () => {
  it('renders a row per guide with an edit link', () => {
    render(<MyGuidesView locale="en" t={en.studioGuides} guides={items} />)
    expect(screen.getByText('Alpha Guide')).toBeTruthy()
    expect(screen.getByText('Beta Guide')).toBeTruthy()
    expect(
      screen.getAllByRole('link').some((a) => a.getAttribute('href') === '/en/studio/guides/2/edit'),
    ).toBe(true)
  })

  it('shows the empty state when there are no guides', () => {
    render(<MyGuidesView locale="en" t={en.studioGuides} guides={[]} />)
    expect(screen.getByText(en.studioGuides.emptyTitle)).toBeTruthy()
  })
})
