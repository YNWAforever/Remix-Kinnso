// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminPerksView } from '@/components/kinnso/admin/AdminPerksView'
import en from '@/lib/i18n/messages/en'
import type { AdminPerk } from '@/lib/admin/perks-queries'

afterEach(cleanup)

const perk: AdminPerk = {
  id: 'p1', slug: 'klook', partner_name: 'Klook', title: 'Klook Deal', summary: 'Save',
  category: 'Travel', discount_label: '10% off', min_tier: 'pro', redemption_type: 'code',
  redemption_value: 'CODE10', sort_order: 0, active: true,
  created_at: '2026-06-26T00:00:00Z', updated_at: '2026-06-26T00:00:00Z',
}
const noop = async () => ({ ok: true as const, id: 'p1' })
const noopToggle = async () => ({ ok: true as const, id: 'p1', active: false })

describe('AdminPerksView', () => {
  it('lists existing perks with status', () => {
    render(<AdminPerksView t={en.perks} perks={[perk]} onCreate={noop} onUpdate={noop} onToggle={noopToggle} />)
    expect(screen.getByText('Klook Deal')).toBeTruthy()
    expect(screen.getByText(en.perks.admin.statusActive)).toBeTruthy()
  })
  it('shows the empty state with no perks', () => {
    render(<AdminPerksView t={en.perks} perks={[]} onCreate={noop} onUpdate={noop} onToggle={noopToggle} />)
    expect(screen.getByText(en.perks.admin.empty)).toBeTruthy()
  })
  it('opens the create form when New perk is clicked', () => {
    render(<AdminPerksView t={en.perks} perks={[]} onCreate={noop} onUpdate={noop} onToggle={noopToggle} />)
    fireEvent.click(screen.getByText(en.perks.admin.newPerk))
    expect(screen.getByLabelText(en.perks.admin.fieldPartner)).toBeTruthy()
  })
})
