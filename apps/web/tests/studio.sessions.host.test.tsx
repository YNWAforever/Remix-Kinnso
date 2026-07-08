// apps/web/tests/studio.sessions.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))

const { getUserMock, fromMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } })),
  fromMock: vi.fn(() => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) })),
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock }, from: fromMock }) }))

import StudioSessionsPage from '@/app/[locale]/studio/sessions/page'

beforeEach(() => { getUserMock.mockResolvedValue({ data: { user: null } }) })

describe('/studio/sessions host', () => {
  it('redirects anon to sign-in', async () => {
    await expect(StudioSessionsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })

  it('scopes the query to the signed-in creator\'s own sessions', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'creator-1' } } })
    const eqMock = vi.fn(() => ({ order: async () => ({ data: [], error: null }) }))
    fromMock.mockReturnValueOnce({ select: () => ({ eq: eqMock }) })
    await StudioSessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(eqMock).toHaveBeenCalledWith('host_creator_id', 'creator-1')
  })

  it('renders the empty state for a creator with no sessions yet', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'creator-1' } } })
    const ui = await StudioSessionsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('link', { name: /New session/ })).toBeTruthy()
  })
})
