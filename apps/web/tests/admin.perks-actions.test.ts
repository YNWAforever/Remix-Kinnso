import { describe, it, expect, vi, beforeEach } from 'vitest'

const { gateMock, serverClientMock } = vi.hoisted(() => ({
  gateMock: vi.fn(async () => ({ ok: true, user: { id: 'ops1' } })),
  serverClientMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: gateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: serverClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createPerkAction, updatePerkAction, togglePerkActiveAction } from '@/lib/admin/perks-actions'
import type { PerkInput } from '@/lib/admin/perks-validation'

const input: PerkInput = {
  partnerName: 'Klook', title: 'Klook Deal', summary: 'Save', category: 'Travel',
  discountLabel: '10% off', minTier: null, redemptionType: 'code',
  redemptionValue: 'CODE10', sortOrder: 0, active: true,
}

/** Captures the insert/update payload and returns a configurable result. */
function makeClient(opts: { existingSlugs?: string[]; insert?: unknown; updateError?: unknown } = {}) {
  const calls: { insert?: Record<string, unknown>; update?: Record<string, unknown> } = {}
  const client = {
    from: () => ({
      select: () => ({
        // listing existing slugs for uniqueness
        then: (r: (v: { data: unknown }) => void) =>
          r({ data: (opts.existingSlugs ?? []).map((slug) => ({ slug })) }),
      }),
      insert: (row: Record<string, unknown>) => {
        calls.insert = row
        return { select: () => ({ single: async () => ({ data: opts.insert ?? { id: 'new' }, error: null }) }) }
      },
      update: (row: Record<string, unknown>) => {
        calls.update = row
        return { eq: async () => ({ error: opts.updateError ?? null }) }
      },
    }),
  }
  return { client, calls }
}

beforeEach(() => {
  gateMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } })
})

describe('createPerkAction', () => {
  it('rejects a non-ops caller before writing', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required'] } } as never)
    const { client } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await createPerkAction('en', input)
    expect(r.ok).toBe(false)
  })
  it('returns field errors for invalid input (no write)', async () => {
    const { client } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await createPerkAction('en', { ...input, partnerName: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.partnerName).toBeTruthy()
  })
  it('derives a unique slug and inserts', async () => {
    const { client, calls } = makeClient({ existingSlugs: ['klook-deal'] })
    serverClientMock.mockResolvedValue(client)
    const r = await createPerkAction('en', input)
    expect(r.ok).toBe(true)
    expect(calls.insert?.slug).toBe('klook-deal-2')
    expect(calls.insert?.redemption_value).toBe('CODE10')
  })
})

describe('updatePerkAction', () => {
  it('writes an updated_at stamp on success', async () => {
    const { client, calls } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await updatePerkAction('en', 'p1', input)
    expect(r.ok).toBe(true)
    expect(calls.update?.updated_at).toBeTruthy()
  })
  it('returns a form error when the update fails', async () => {
    const { client } = makeClient({ updateError: { message: 'boom' } })
    serverClientMock.mockResolvedValue(client)
    const r = await updatePerkAction('en', 'p1', input)
    expect(r.ok).toBe(false)
  })
})

describe('togglePerkActiveAction', () => {
  it('flips active and returns it', async () => {
    const { client, calls } = makeClient()
    serverClientMock.mockResolvedValue(client)
    const r = await togglePerkActiveAction('en', 'p1', false)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.active).toBe(false)
    expect(calls.update?.active).toBe(false)
  })
})
