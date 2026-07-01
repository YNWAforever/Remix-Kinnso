// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
afterEach(cleanup)

import { TeamDirectoryView } from '@/components/kinnso/admin/team/TeamDirectoryView'
import en from '@/lib/i18n/messages/en'

const members = [
  { id: 'm1', displayName: 'Alice', userId: 'u1', role: 'owner',     status: 'active',    joinedAt: '2026-01-01T00:00:00Z' },
  { id: 'm2', displayName: 'Bob',   userId: 'u2', role: 'moderator', status: 'suspended', joinedAt: '2026-02-01T00:00:00Z' },
]

describe('TeamDirectoryView', () => {
  it('renders column headers', () => {
    render(<TeamDirectoryView t={en.team} members={members} />)
    expect(screen.getByText(en.team.colName)).toBeTruthy()
    expect(screen.getByText(en.team.colRole)).toBeTruthy()
    expect(screen.getByText(en.team.colStatus)).toBeTruthy()
  })
  it('renders each member display name', () => {
    render(<TeamDirectoryView t={en.team} members={members} />)
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })
  it('renders role labels', () => {
    render(<TeamDirectoryView t={en.team} members={members} />)
    expect(screen.getByText(en.team.roleOwner)).toBeTruthy()
    expect(screen.getByText(en.team.roleModerator)).toBeTruthy()
  })
  it('renders status labels', () => {
    render(<TeamDirectoryView t={en.team} members={members} />)
    expect(screen.getByText(en.team.statusActive)).toBeTruthy()
    expect(screen.getByText(en.team.statusSuspended)).toBeTruthy()
  })
})
