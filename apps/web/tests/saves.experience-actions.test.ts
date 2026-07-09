import { describe, expect, it, vi } from 'vitest'

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
      if (table !== 'experience_saves') throw new Error(`unexpected table ${table}`)
      return {
        upsert: upsertMock,
        delete: () => ({ eq: () => ({ eq: deleteEqMock }) }),
      }
    },
  }),
}))

import { saveExperienceAction, unsaveExperienceAction } from '@/lib/saves/experience-actions'

describe('saveExperienceAction', () => {
  it('requires sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const result = await saveExperienceAction('en', 'e1')
    expect(result).toEqual({ ok: false, errors: { form: ['Sign in is required'] } })
  })

  it('upserts the save for a signed-in traveller and revalidates /trips', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const result = await saveExperienceAction('en', 'e1')
    expect(result).toEqual({ ok: true, experienceId: 'e1' })
    expect(upsertMock).toHaveBeenCalledWith(
      { experience_id: 'e1', traveler_user_id: 'u1' },
      { onConflict: 'experience_id,traveler_user_id' },
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/trips')
  })
})

describe('unsaveExperienceAction', () => {
  it('requires sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const result = await unsaveExperienceAction('en', 'e1')
    expect(result).toEqual({ ok: false, errors: { form: ['Sign in is required'] } })
  })

  it('deletes the save for a signed-in traveller', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const result = await unsaveExperienceAction('en', 'e1')
    expect(result).toEqual({ ok: true, experienceId: 'e1' })
  })
})
