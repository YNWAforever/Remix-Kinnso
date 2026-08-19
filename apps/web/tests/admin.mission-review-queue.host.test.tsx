// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { roleMock, getUserMock, queueMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
  queueMock: vi.fn(async () => []),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: async () => {
    const { data: { user } } = await getUserMock()
    return { user: user ? { id: user.id } : null, role: await roleMock(), merchantId: null }
  },
}))
vi.mock('@/lib/admin/mission-review-queries', () => ({ getReviewQueue: queueMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

import MissionReviewQueuePage from '@/app/[locale]/admin/missions/review/page'

beforeEach(() => { roleMock.mockResolvedValue('ops'); getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } }); queueMock.mockClear() })
afterEach(cleanup)

describe('/[locale]/admin/missions/review host', () => {
  it('renders the queue for ops', async () => {
    const ui = await MissionReviewQueuePage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(queueMock).toHaveBeenCalled()
  })

  it('notFounds a non-ops user', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(MissionReviewQueuePage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
