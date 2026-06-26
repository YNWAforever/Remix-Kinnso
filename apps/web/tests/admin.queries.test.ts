import { describe, it, expect } from 'vitest'
import { getAdminOverview } from '@/lib/admin/queries'

function client(counts: Record<string, number>) {
  return {
    from: (table: string) => ({
      select: () => {
        const b: Record<string, unknown> = {
          eq: () => b,
          then: (res: (v: { count: number }) => void) => res({ count: counts[table] ?? 0 }),
        }
        return b
      },
    }),
  }
}

describe('getAdminOverview', () => {
  it('returns creators/merchants/ops counts', async () => {
    const o = await getAdminOverview(client({ creators: 3, merchant_profiles: 2, kinnso_ops_members: 1 }) as never)
    expect(o).toEqual({ creators: 3, merchants: 2, ops: 1 })
  })
})
