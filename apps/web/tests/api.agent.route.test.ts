import { describe, it, expect, vi, beforeEach } from 'vitest'

const { streamTextMock, getUserMock, rpcMock, getClientIpMock, configuredMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn(() => ({ toUIMessageStreamResponse: () => new Response('stream', { status: 200 }) })),
  getUserMock: vi.fn(async () => ({ data: { user: null } })),
  rpcMock: vi.fn(async () => ({ data: true, error: null })),
  getClientIpMock: vi.fn(async () => '1.2.3.4'),
  configuredMock: vi.fn(() => true),
}))

vi.mock('ai', () => ({
  streamText: streamTextMock,
  stepCountIs: (n: number) => n,
  convertToModelMessages: (m: unknown) => m,
  tool: (def: unknown) => def,
}))
vi.mock('@/lib/agent/config', () => ({ isAgentConfigured: configuredMock }))
vi.mock('@/lib/http/client-ip', () => ({ getClientIp: getClientIpMock }))
vi.mock('@/lib/agent/queries', () => ({ appendAgentMessage: vi.fn(async () => {}) }))
vi.mock('@/lib/agent/tools', () => ({ makeAgentTools: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock }, rpc: rpcMock }),
}))

import { POST } from '@/app/api/agent/route'

function req(body: unknown) {
  return new Request('http://localhost/api/agent', { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  streamTextMock.mockClear()
  getUserMock.mockResolvedValue({ data: { user: null } })
  rpcMock.mockResolvedValue({ data: true, error: null })
  configuredMock.mockReturnValue(true)
})

describe('POST /api/agent', () => {
  it('503s when the gateway is unconfigured', async () => {
    configuredMock.mockReturnValueOnce(false)
    const res = await POST(req({ messages: [], locale: 'en', anonSessionId: 'sess-1' }))
    expect(res.status).toBe(503)
  })

  it('400s when anon and no anonSessionId is provided', async () => {
    const res = await POST(req({ messages: [], locale: 'en' }))
    expect(res.status).toBe(400)
  })

  it('429s when the IP rate limit is exceeded', async () => {
    rpcMock.mockResolvedValueOnce({ data: false, error: null })
    const res = await POST(req({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }], locale: 'en', anonSessionId: 'sess-1' }))
    expect(res.status).toBe(429)
    expect(streamTextMock).not.toHaveBeenCalled()
  })

  it('streams for an anon caller with a valid anonSessionId, rate-limit passing', async () => {
    const res = await POST(req({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'plan a Tokyo trip' }] }], locale: 'en', anonSessionId: 'sess-1' }))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('check_and_increment_agent_rate_limit', { p_ip: '1.2.3.4', p_max_requests: 20, p_window_seconds: 3600 })
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    const arg = (streamTextMock.mock.calls[0] as unknown[])[0] as { model: string }
    expect(arg.model).toBe('anthropic/claude-haiku-4.5')
  })

  it('streams for a signed-in traveller without requiring anonSessionId', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'traveler-1' } } } as never)
    const res = await POST(req({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }], locale: 'en' }))
    expect(res.status).toBe(200)
  })
})
