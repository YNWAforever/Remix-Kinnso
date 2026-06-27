// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

import { AdminUsersView } from '@/components/kinnso/admin/AdminUsersView'
import en from '@/lib/i18n/messages/en'
import type { AdminUsers } from '@/lib/admin/users-queries'

afterEach(cleanup)
const users: AdminUsers = {
  creators: [{ id: 'c1', display_name: 'Ada', handle: 'ada', status: 'active', created_at: '2026-01-01T00:00:00Z' }],
  merchants: [{ id: 'm1', company_name: 'Klook', status: 'active', tier: 'free', created_at: '2026-01-01T00:00:00Z' }],
  ops: [{ id: 'o1', user_id: 'u1', display_name: 'Opsy', status: 'active', created_at: '2026-01-01T00:00:00Z' }],
}
const ok = async (_k: unknown, id: string, status: 'active' | 'suspended') => ({ ok: true as const, id, status })
const okTier = async (id: string, tier: 'free' | 'growth') => ({ ok: true as const, id, tier })

describe('AdminUsersView', () => {
  it('lists all three sections', () => {
    render(<AdminUsersView t={en.users} locale="en" users={users} onSetStatus={ok} onSetMerchantTier={okTier} />)
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.getByText('Klook')).toBeTruthy()
    expect(screen.getByText('Opsy')).toBeTruthy()
  })
  it('suspends an active row (its button flips to Activate) and reconciles via router.refresh', async () => {
    refreshMock.mockClear()
    render(<AdminUsersView t={en.users} locale="en" users={users} onSetStatus={ok} onSetMerchantTier={okTier} />)
    fireEvent.click(screen.getAllByText(en.users.suspend)[0]) // creator
    await waitFor(() => expect(screen.getAllByText(en.users.activate).length).toBeGreaterThan(0))
    expect(refreshMock).toHaveBeenCalled()
  })
  it('shows the guard error when a suspend fails', async () => {
    const fail = async () => ({ ok: false as const, errors: { form: ['You cannot suspend the last active ops member.'] } })
    render(<AdminUsersView t={en.users} locale="en" users={users} onSetStatus={fail} onSetMerchantTier={okTier} />)
    fireEvent.click(screen.getAllByText(en.users.suspend)[2]) // ops row
    await waitFor(() => expect(screen.getByText(/last active ops/i)).toBeTruthy())
  })
  it('changing a merchant tier control calls onSetMerchantTier', async () => {
    refreshMock.mockClear()
    const spy = vi.fn(okTier)
    render(<AdminUsersView t={en.users} locale="en" users={users} onSetStatus={ok} onSetMerchantTier={spy} />)
    const select = screen.getByLabelText(`${en.users.tierLabel} Klook`) as HTMLSelectElement
    expect(select.value).toBe('free')
    fireEvent.change(select, { target: { value: 'growth' } })
    await waitFor(() => expect(spy).toHaveBeenCalledWith('m1', 'growth'))
    expect(refreshMock).toHaveBeenCalled()
  })
})
