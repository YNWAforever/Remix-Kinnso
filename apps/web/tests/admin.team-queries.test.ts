import { describe, it, expect, vi, beforeEach } from 'vitest'

type RpcResult = { data: unknown; error: { message: string } | null }
const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (): Promise<RpcResult> => ({ data: null, error: null })),
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))

import { getTeamMembers, getTeamOverview } from '@/lib/admin/team-queries'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

const supabase = { rpc: rpcMock } as unknown as SupabaseClient<Database>

const RAW = [
  { id: 'm1', display_name: 'Alice', user_id: 'u1', role: 'owner',     status: 'active',    joined_at: '2026-01-01T00:00:00Z' },
  { id: 'm2', display_name: 'Bob',   user_id: 'u2', role: 'moderator', status: 'active',    joined_at: '2026-02-01T00:00:00Z' },
  { id: 'm3', display_name: 'Carol', user_id: 'u3', role: 'analyst',   status: 'suspended', joined_at: '2026-03-01T00:00:00Z' },
]

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: RAW, error: null })
})

describe('getTeamMembers', () => {
  it('calls admin_list_ops_members and maps the payload', async () => {
    const rows = await getTeamMembers(supabase)
    expect(rpcMock).toHaveBeenCalledWith('admin_list_ops_members')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ id: 'm1', displayName: 'Alice', userId: 'u1', role: 'owner', status: 'active', joinedAt: '2026-01-01T00:00:00Z' })
  })
  it('returns [] when the RPC returns an empty array', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null })
    expect(await getTeamMembers(supabase)).toHaveLength(0)
  })
  it('throws when the RPC returns an error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    await expect(getTeamMembers(supabase)).rejects.toMatchObject({ message: 'forbidden' })
  })
})

describe('getTeamOverview', () => {
  it('aggregates byRole counts from the member list', async () => {
    const overview = await getTeamOverview(supabase)
    expect(overview.members).toHaveLength(3)
    expect(overview.byRole).toEqual({ owner: 1, moderator: 1, analyst: 1, admin: 0 })
    expect(overview.pendingInvites).toBe(0) // always 0 in 12A
  })
})
