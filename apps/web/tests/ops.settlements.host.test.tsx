// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

const { listOpsSettlementsMock, notFoundMock, resolveViewerRoleMock } = vi.hoisted(() => ({
  listOpsSettlementsMock: vi.fn(async () => ({ data: [] })),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  resolveViewerRoleMock: vi.fn(async () => 'merchant'),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) }),
}))

vi.mock('@/lib/auth/viewer-role', () => ({
  resolveViewerRole: resolveViewerRoleMock,
}))

vi.mock('@/lib/missions/queries', () => ({
  listOpsSettlements: listOpsSettlementsMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
  }),
}))

import OpsSettlementsPage from '@/app/[locale]/ops/settlements/page'

describe('/[locale]/ops/settlements host', () => {
  it('returns not found for authenticated non-ops viewers', async () => {
    resolveViewerRoleMock.mockResolvedValueOnce('merchant')

    await expect(
      OpsSettlementsPage({ params: Promise.resolve({ locale: 'en' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(listOpsSettlementsMock).not.toHaveBeenCalled()
  })
})
