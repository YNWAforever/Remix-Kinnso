// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { FeedView } from '@/components/kinnso/pages/FeedView'
import type { Guide } from '@/lib/creator-mock'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const guide = (over: Partial<Guide> = {}): Guide => ({
  slug: 'tokyo-eats',
  title: 'Tokyo Eats',
  cover: 'https://img.example/cover.jpg',
  city: 'Tokyo',
  saves: 1234,
  creatorHandle: 'mei',
  ...over,
})

describe('FeedView', () => {
  it('renders real guides as feed cards linking to the guide detail', () => {
    render(<FeedView locale="en" t={en.feed} items={[guide()]} />)
    expect(screen.getByText('Tokyo Eats')).toBeTruthy()
    expect(screen.getByText('@mei')).toBeTruthy()
    expect(screen.getByText(/1,234 saves/)).toBeTruthy()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/en/g/tokyo-eats')
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })

  it('shows the empty state when there are no items', () => {
    render(<FeedView locale="en" t={en.feed} items={[]} />)
    expect(screen.getByText(en.feed.empty)).toBeTruthy()
  })
})
