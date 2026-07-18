import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GuideInput } from '@/lib/guides/types'

const { getUserMock, maybeSingleMock, notFoundMock, redirectMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  notFoundMock: vi.fn(),
  redirectMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: maybeSingleMock,
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    return {
      auth: { getUser: getUserMock },
      from: vi.fn(() => query),
    }
  },
}))

import StudioEditGuidePage from '@/app/[locale]/studio/guides/[id]/edit/page'

beforeEach(() => {
  vi.clearAllMocks()
  getUserMock.mockResolvedValue({ data: { user: { id: 'creator-1' } } })
})

describe('StudioEditGuidePage', () => {
  it('normalizes a nullable stored cover to the form empty-string boundary', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        id: 'guide-1',
        title: 'Honest guide',
        city: 'Hong Kong',
        cover_url: null,
        summary: 'A useful guide summary',
      },
    })

    const result = await StudioEditGuidePage({
      params: Promise.resolve({ locale: 'en', id: 'guide-1' }),
    }) as ReactElement<{ initial: GuideInput }>

    expect(result.props.initial.coverUrl).toBe('')
    expect(notFoundMock).not.toHaveBeenCalled()
    expect(redirectMock).not.toHaveBeenCalled()
  })
})
