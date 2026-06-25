import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRecentMessages, appendMessage, countUserMessagesToday, archiveThread } from '@/lib/copilot/queries'

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  count: 0,
  lastInsert: null as unknown,
  lastUpdate: null as unknown,
  filters: [] as Array<[string, unknown]>,
}))

function makeClient() {
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (v: unknown) => { state.lastInsert = v; return Promise.resolve({ error: null }) },
    update: (v: unknown) => { state.lastUpdate = v; return b },
    eq: (col: string, val: unknown) => { state.filters.push([col, val]); return b },
    gte: (col: string, val: unknown) => { state.filters.push([col, val]); return b },
    order: () => b,
    limit: () => Promise.resolve({ data: state.rows }),
  }
  // count head-select resolves directly
  const countB: Record<string, unknown> = {
    select: () => countB,
    eq: () => countB,
    gte: () => Promise.resolve({ count: state.count }),
  }
  return {
    from: (table: string) => {
      void table
      // archiveThread chains update().eq().eq() and must resolve; getRecentMessages chains to limit();
      // countUserMessagesToday chains select(head)->eq->gte. Use a permissive builder.
      return {
        ...b,
        select: (_cols?: unknown, opts?: { head?: boolean }) => (opts?.head ? countB : b),
        update: (v: unknown) => { state.lastUpdate = v; const u: Record<string, unknown> = { eq: () => u, then: (r: (x: unknown) => void) => r({ error: null }) }; return u },
      }
    },
  }
}

beforeEach(() => { state.rows = []; state.count = 0; state.lastInsert = null; state.lastUpdate = null; state.filters = [] })

describe('copilot queries', () => {
  it('getRecentMessages returns rows', async () => {
    state.rows = [{ id: 'm1', role: 'user', content: 'hi', created_at: 't' }]
    const out = await getRecentMessages(makeClient() as never, 'c1')
    expect(out).toHaveLength(1)
    expect(out[0].content).toBe('hi')
  })

  it('appendMessage inserts the creator_id, role and content', async () => {
    await appendMessage(makeClient() as never, 'c1', 'assistant', 'hello')
    expect(state.lastInsert).toMatchObject({ creator_id: 'c1', role: 'assistant', content: 'hello' })
  })

  it('countUserMessagesToday returns the count', async () => {
    state.count = 7
    expect(await countUserMessagesToday(makeClient() as never, 'c1')).toBe(7)
  })

  it('archiveThread sets archived true', async () => {
    await archiveThread(makeClient() as never, 'c1')
    expect(state.lastUpdate).toEqual({ archived: true })
  })
})
