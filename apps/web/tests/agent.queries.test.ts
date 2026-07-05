import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appendAgentMessage } from '@/lib/agent/queries'

const state = vi.hoisted(() => ({ lastInsert: null as unknown }))

function makeClient() {
  return {
    from: () => ({
      insert: (v: unknown) => { state.lastInsert = v; return Promise.resolve({ error: null }) },
    }),
  }
}

beforeEach(() => { state.lastInsert = null })

describe('appendAgentMessage', () => {
  it('inserts a traveler_user_id-keyed row when signed in', async () => {
    await appendAgentMessage(makeClient() as never, { travelerUserId: 'u1' }, 'user', 'hi')
    expect(state.lastInsert).toMatchObject({ traveler_user_id: 'u1', anon_session_id: null, role: 'user', content: 'hi' })
  })

  it('inserts an anon_session_id-keyed row when anon', async () => {
    await appendAgentMessage(makeClient() as never, { anonSessionId: 'session-1' }, 'assistant', 'hello')
    expect(state.lastInsert).toMatchObject({ traveler_user_id: null, anon_session_id: 'session-1', role: 'assistant', content: 'hello' })
  })

  it('throws a descriptive error when the insert fails', async () => {
    const client = { from: () => ({ insert: () => Promise.resolve({ error: { message: 'boom' } }) }) }
    await expect(appendAgentMessage(client as never, { travelerUserId: 'u1' }, 'user', 'hi')).rejects.toThrow(/appendAgentMessage failed/)
  })
})
