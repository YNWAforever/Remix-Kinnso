// apps/web/tests/kinnso.agent-page.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { getUserMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async () => ({ data: { user: null } })),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}))
vi.mock('@/lib/agent/config', () => ({ isAgentConfigured: () => true }))
vi.mock('@/components/kinnso/pages/AgentChatView', () => ({
  AgentChatView: (p: { configured: boolean; viewerSignedIn: boolean; anonSessionId: string }) => (
    <div data-testid="chat-view" data-configured={String(p.configured)} data-signed-in={String(p.viewerSignedIn)} data-anon-session={p.anonSessionId} />
  ),
}))

import AgentPage from '@/app/[locale]/agent/page'

beforeEach(() => { getUserMock.mockResolvedValue({ data: { user: null } }) })

describe('/[locale]/agent host', () => {
  it('renders AgentChatView with viewerSignedIn=false and a generated anonSessionId for an anon visitor', async () => {
    const ui = await AgentPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    const view = screen.getByTestId('chat-view')
    expect(view.getAttribute('data-signed-in')).toBe('false')
    expect(view.getAttribute('data-anon-session')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('renders AgentChatView with viewerSignedIn=true for a signed-in traveller', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'traveler-1' } } })
    const ui = await AgentPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByTestId('chat-view').getAttribute('data-signed-in')).toBe('true')
  })
})
