// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin' }))

import { AdminShell } from '@/components/kinnso/admin/AdminShell'
import { AdminDashboardView } from '@/components/kinnso/admin/AdminDashboardView'

describe('AdminShell', () => {
  it('renders the three nav links with correct hrefs and the children', () => {
    render(<AdminShell locale="en" t={en.admin}><p>child-content</p></AdminShell>)
    expect((screen.getByRole('link', { name: en.admin.navDashboard }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin')
    expect((screen.getByRole('link', { name: en.admin.navPerks }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin/perks')
    expect((screen.getByRole('link', { name: en.admin.navUsers }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin/users')
    expect(screen.getByText('child-content')).toBeTruthy()
  })
})

describe('AdminDashboardView', () => {
  it('renders the overview counts', () => {
    render(<AdminDashboardView t={en.admin} overview={{ creators: 5, merchants: 2, ops: 1, perksActive: 3, perksTotal: 4, redemptions: 7 }} />)
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText(en.admin.statCreators)).toBeTruthy()
  })
})
