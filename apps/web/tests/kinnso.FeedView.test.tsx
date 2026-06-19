// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { feedItems } from '@/lib/creator-mock'
import { FeedView } from '@/components/kinnso/pages/FeedView'

afterEach(cleanup)

describe('FeedView', () => {
  it('renders the feed heading and an item per mock feed entry', () => {
    render(<FeedView locale="en" t={en.feed} />)
    expect(screen.getByRole('heading', { name: en.feed.heading })).toBeTruthy()
    expect(screen.getByText(feedItems[0].caption)).toBeTruthy()
    expect(screen.getAllByText(feedItems[0].creatorHandle).length).toBeGreaterThan(0)
  })
})
