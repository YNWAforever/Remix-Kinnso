// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpsSettlementView } from '@/components/kinnso/pages/OpsSettlementView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('OpsSettlementView', () => {
  const settlement = {
    id: 's1',
    missionTitle: 'Affiliate booking',
    status: 'pending',
    creatorPayoutStatus: 'pending',
    kinnsoCommissionStatus: 'pending',
  }

  it('lets ops update settlement rows', () => {
    const onUpdate = vi.fn()
    render(<OpsSettlementView t={en.ops} settlements={[settlement]} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('button', { name: en.ops.markPaid }))
    expect(onUpdate).toHaveBeenCalledWith('s1', 'paid')
  })

  it('shows update errors returned by the server', async () => {
    const onUpdate = vi.fn(async () => ({
      ok: false,
      errors: { form: ['Active ops member access is required'] },
    }))
    render(<OpsSettlementView t={en.ops} settlements={[settlement]} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('button', { name: en.ops.markPaid }))

    expect((await screen.findByRole('alert')).textContent).toContain('Active ops member access is required')
  })
})
