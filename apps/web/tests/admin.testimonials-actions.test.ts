import { describe, it, expect, vi, beforeEach } from 'vitest'

const { gateMock, serverClientMock, revalidateMock } = vi.hoisted(() => ({
  gateMock: vi.fn(async () => ({ ok: true, user: { id: 'ops1' } })),
  serverClientMock: vi.fn(),
  revalidateMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: gateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: serverClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))

import {
  createTestimonialAction,
  updateTestimonialAction,
  setTestimonialStatusAction,
  deleteTestimonialAction,
} from '@/lib/admin/testimonials-actions'
import type { TestimonialInput } from '@/lib/admin/testimonials-validation'

const input: TestimonialInput = {
  quote: 'KINNSO paid me for what I already knew.',
  authorName: 'Mei',
  authorRole: 'creator',
  locale: null,
  sortOrder: 0,
}

/** Chainable stub capturing insert/update/delete payloads; `row: null` models "no row matched" (stale id / RLS). */
function makeClient(opts: { row?: unknown; error?: unknown } = {}) {
  const row = 'row' in opts ? opts.row : { id: 't1' }
  const calls: { insert?: Record<string, unknown>; update?: Record<string, unknown>; deleted?: boolean } = {}
  const client = {
    from: () => ({
      insert: (r: Record<string, unknown>) => {
        calls.insert = r
        return { select: () => ({ single: async () => ({ data: row, error: opts.error ?? null }) }) }
      },
      update: (r: Record<string, unknown>) => {
        calls.update = r
        return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: row, error: opts.error ?? null }) }) }) }
      },
      delete: () => {
        calls.deleted = true
        return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: row, error: opts.error ?? null }) }) }) }
      },
    }),
  }
  return { client, calls }
}

beforeEach(() => {
  vi.clearAllMocks()
  gateMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } })
})

describe('createTestimonialAction', () => {
  it('rejects a non-ops caller BEFORE writing', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required'] } } as never)
    const { client, calls } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await createTestimonialAction('en', input)
    expect(r.ok).toBe(false)
    expect(calls.insert).toBeUndefined()
  })
  it('rejects invalid input BEFORE writing', async () => {
    const { client, calls } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await createTestimonialAction('en', { ...input, quote: ' ' })
    expect(r.ok).toBe(false)
    expect(calls.insert).toBeUndefined()
  })
  it('maps camelCase input to snake_case columns and leaves status to the draft default', async () => {
    const { client, calls } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await createTestimonialAction('en', input)
    expect(r.ok).toBe(true)
    expect(calls.insert).toEqual({
      quote: 'KINNSO paid me for what I already knew.',
      author_name: 'Mei',
      author_role: 'creator',
      locale: null,
      sort_order: 0,
    })
    // admin list + all 7 locale homepages (ISR) refresh
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/testimonials')
    expect(revalidateMock).toHaveBeenCalledWith('/zh-hk')
  })
})

describe('updateTestimonialAction', () => {
  it('returns a form error when no row matched', async () => {
    const { client } = makeClient({ row: null })
    serverClientMock.mockResolvedValue(client)
    const r = await updateTestimonialAction('en', 't-stale', input)
    expect(r.ok).toBe(false)
  })
})

describe('setTestimonialStatusAction', () => {
  it('publishes a testimonial', async () => {
    const { client, calls } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await setTestimonialStatusAction('en', 't1', 'published')
    expect(r.ok).toBe(true)
    expect(calls.update).toEqual({ status: 'published' })
  })
  it('rejects a status outside draft/published WITHOUT writing', async () => {
    const { client, calls } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await setTestimonialStatusAction('en', 't1', 'archived' as never)
    expect(r.ok).toBe(false)
    expect(calls.update).toBeUndefined()
  })
})

describe('deleteTestimonialAction', () => {
  it('deletes and reports ok', async () => {
    const { client, calls } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await deleteTestimonialAction('en', 't1')
    expect(r.ok).toBe(true)
    expect(calls.deleted).toBe(true)
  })
  it('returns a form error when nothing was deleted', async () => {
    const { client } = makeClient({ row: null })
    serverClientMock.mockResolvedValue(client)
    const r = await deleteTestimonialAction('en', 't-stale')
    expect(r.ok).toBe(false)
  })
})
