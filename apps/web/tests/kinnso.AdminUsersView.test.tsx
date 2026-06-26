// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminUsersView } from '@/components/kinnso/admin/AdminUsersView'
import en from '@/lib/i18n/messages/en'
import type { AdminUsers } from '@/lib/admin/users-queries'

afterEach(cleanup)
const users: AdminUsers = {
  creators: [{ id: 'c1', display_name: 'Ada', handle: 'ada', status: 'active', created_at: '2026-01-01T00:00:00Z' }],
  merchants: [{ id: 'm1', company_name: 'Klook', contact_email: 'e@k.com', status: 'active', created_at: '2026-01-01T00:00:00Z' }],
  ops: [{ id: 'o1', user_id: 'u1', display_name: 'Opsy', status: 'active', created_at: '2026-01-01T00:00:00Z' }],
}
const ok = async (_k: unknown, id: string, status: 'active' | 'suspended') => ({ ok: true as const, id, status })

describe('AdminUsersView', () => {
  it('lists all three sections', () => {
    render(<AdminUsersView t={en.users} users={users} onSetStatus={ok} />)
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.getByText('Klook')).toBeTruthy()
    expect(screen.getByText('Opsy')).toBeTruthy()
  })
  it('suspends an active row (its button flips to Activate)', async () => {
    render(<AdminUsersView t={en.users} users={users} onSetStatus={ok} />)
    fireEvent.click(screen.getAllByText(en.users.suspend)[0]) // creator
    await waitFor(() => expect(screen.getAllByText(en.users.activate).length).toBeGreaterThan(0))
  })
  it('shows the guard error when a suspend fails', async () => {
    const fail = async () => ({ ok: false as const, errors: { form: ['You cannot suspend the last active ops member.'] } })
    render(<AdminUsersView t={en.users} users={users} onSetStatus={fail} />)
    fireEvent.click(screen.getAllByText(en.users.suspend)[2]) // ops row
    await waitFor(() => expect(screen.getByText(/last active ops/i)).toBeTruthy())
  })
})
