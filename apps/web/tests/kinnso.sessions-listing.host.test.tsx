// apps/web/tests/kinnso.sessions-listing.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { getUpcomingSessionsListMock, getReplaySessionsMock } = vi.hoisted(() => ({
  getUpcomingSessionsListMock: vi.fn(async () => []),
  getReplaySessionsMock: vi.fn(async () => []),
}))
vi.mock('@/lib/sessions/public-queries', () => ({
  getUpcomingSessionsList: getUpcomingSessionsListMock,
  getReplaySessions: getReplaySessionsMock,
}))

import SessionsPage from '@/app/[locale]/sessions/page'
import { MARKETING_PATHS } from '@/lib/seo/routes'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/sessions listing host', () => {
  it('is a real public page now, in MARKETING_PATHS', () => {
    expect(MARKETING_PATHS).toContain('/sessions')
  })

  it('renders an empty state when there are no upcoming sessions or replays', async () => {
    const ui = await SessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText(en.sessions.emptyUpcoming)).toBeTruthy()
  })

  it('renders upcoming sessions linking to their detail page', async () => {
    getUpcomingSessionsListMock.mockResolvedValueOnce([{
      id: 's1', slug: 'tokyo-ramen-ama', title: 'Tokyo ramen AMA', description: 'Ask away.',
      type: 'ask_a_creator', startsAt: '2027-01-15T18:00:00.000Z', durationMinutes: 45,
      embedUrl: null, replayUrl: null, destinationTags: ['Tokyo'], status: 'scheduled',
      host: { handle: 'sora', displayName: 'Sora' },
    }])
    const ui = await SessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('link', { name: /Tokyo ramen AMA/ }).getAttribute('href')).toBe('/en/sessions/tokyo-ramen-ama')
  })

  it('renders a separate replays section for ended sessions with a replay', async () => {
    getReplaySessionsMock.mockResolvedValueOnce([{
      id: 's2', slug: 'kyoto-temples-recap', title: 'Kyoto temples recap', description: 'The replay.',
      type: 'destination_briefing', startsAt: '2026-12-01T09:00:00.000Z', durationMinutes: 30,
      embedUrl: null, replayUrl: 'https://youtu.be/xyz', destinationTags: ['Kyoto'], status: 'ended',
      host: { handle: 'nina', displayName: 'Nina' },
    }])
    const ui = await SessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText(en.sessions.replaysHeading)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Kyoto temples recap/ }).getAttribute('href')).toBe('/en/sessions/kyoto-temples-recap')
  })

  it('404s unknown locales', async () => {
    vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
    await expect(SessionsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
