// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { OpsSettlementView } from '@/components/kinnso/pages/OpsSettlementView'
import en from '@/lib/i18n/messages/en'

afterEach(() => {
  cleanup()
  refreshMock.mockReset()
})

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
    render(<OpsSettlementView locale="en" t={en.ops} settlements={[settlement]} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('button', { name: en.ops.markPaid }))
    expect(onUpdate).toHaveBeenCalledWith('s1', 'paid')
  })

  it('shows update errors returned by the server', async () => {
    const onUpdate = vi.fn(async () => ({
      ok: false,
      errors: { form: ['Active ops member access is required'] },
    }))
    render(<OpsSettlementView locale="en" t={en.ops} settlements={[settlement]} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('button', { name: en.ops.markPaid }))

    expect((await screen.findByRole('alert')).textContent).toContain('Active ops member access is required')
  })

  it('disables mark-paid while pending and refreshes after success', async () => {
    let resolveUpdate!: (result: { ok: true }) => void
    const onUpdate = vi.fn(() => new Promise<{ ok: true }>((resolve) => {
      resolveUpdate = resolve
    }))
    render(<OpsSettlementView locale="en" t={en.ops} settlements={[settlement]} onUpdate={onUpdate} />)

    const button = screen.getByRole('button', { name: en.ops.markPaid })
    fireEvent.click(button)

    expect(button).toHaveProperty('disabled', true)
    resolveUpdate({ ok: true })
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
  })

  it('links back to home off the ops island', () => {
    render(<OpsSettlementView locale="en" t={en.ops} settlements={[settlement]} onUpdate={vi.fn()} />)
    expect(screen.getByRole('link', { name: en.ops.backHome }).getAttribute('href')).toBe('/en')
  })
})
