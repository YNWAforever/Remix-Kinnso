// apps/web/tests/saves.guide-actions.test.ts
import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'

const { getUserMock, upsertMock, deleteEqMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } })),
  upsertMock: vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null })),
  deleteEqMock: vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null })),
}))
const revalidatePathMock = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table !== 'guide_saves') throw new Error(`unexpected table ${table}`)
      return {
        upsert: upsertMock,
        delete: () => ({ eq: () => ({ eq: deleteEqMock }) }),
      }
    },
  }),
}))

import { saveGuideAction, unsaveGuideAction } from '@/lib/saves/guide-actions'

describe('saveGuideAction', () => {
  it('requires sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const result = await saveGuideAction('en', 'g1')
    expect(result).toEqual({ ok: false, errors: { form: ['Sign in is required'] } })
  })

  it('upserts the save for a signed-in traveller and revalidates /trips', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const result = await saveGuideAction('en', 'g1')
    expect(result).toEqual({ ok: true, guideId: 'g1' })
    expect(upsertMock).toHaveBeenCalledWith(
      { guide_id: 'g1', traveler_user_id: 'u1' },
      { onConflict: 'guide_id,traveler_user_id' },
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/trips')
  })
})

describe('unsaveGuideAction', () => {
  it('requires sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const result = await unsaveGuideAction('en', 'g1')
    expect(result).toEqual({ ok: false, errors: { form: ['Sign in is required'] } })
  })

  it('deletes the save for a signed-in traveller', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const result = await unsaveGuideAction('en', 'g1')
    expect(result).toEqual({ ok: true, guideId: 'g1' })
  })
})
