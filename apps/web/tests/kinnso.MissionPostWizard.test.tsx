// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionPostWizard } from '@/components/kinnso/pages/MissionPostWizard'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('MissionPostWizard', () => {
  it('shows coupon fields for coupon affiliate missions', () => {
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: en.missions.typeCoupon }))
    expect(screen.getByLabelText(en.missions.couponCode)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.creatorCommissionRate)).toBeTruthy()
  })

  it('shows paid fee and milestone fields for paid missions', () => {
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: en.missions.typePaid }))
    expect(screen.getByLabelText(en.missions.paidFeeAmount)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.milestoneTitle)).toBeTruthy()
  })

  it('submits a draft payload', () => {
    const onSubmit = vi.fn()
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Test mission' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Mission summary' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'TEST10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com/test' } })
    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Test mission' }), { publish: false })
  })

  it('blocks invalid draft payloads', () => {
    const onSubmit = vi.fn()
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Test mission' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Mission summary' } })
    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))
    expect(screen.getByRole('alert')).toHaveTextContent(en.missions.validationError)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows server action errors', async () => {
    const onSubmit = vi.fn(async () => ({ ok: false, errors: { form: ['Merchant profile is required'] } }))
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Test mission' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Mission summary' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'TEST10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com/test' } })
    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Merchant profile is required'))
  })

  it('prevents duplicate submissions while pending', async () => {
    let resolveSubmit: () => void = () => {}
    const onSubmit = vi.fn(
      () =>
        new Promise<{ ok: false; errors: { form: string[] } }>((resolve) => {
          resolveSubmit = () => resolve({ ok: false, errors: { form: ['Retry after fixing the issue'] } })
        }),
    )
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Test mission' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Mission summary' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'TEST10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com/test' } })

    const saveDraft = screen.getByRole('button', { name: en.missions.saveDraft })
    fireEvent.click(saveDraft)
    fireEvent.click(saveDraft)

    await waitFor(() => expect(saveDraft).toBeDisabled())
    expect(onSubmit).toHaveBeenCalledTimes(1)

    resolveSubmit()
    await waitFor(() => expect(saveDraft).not.toBeDisabled())
  })

  it('keeps submit actions disabled after a successful create', async () => {
    const onSubmit = vi.fn(async () => ({ ok: true }))
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Test mission' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Mission summary' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'TEST10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com/test' } })

    const saveDraft = screen.getByRole('button', { name: en.missions.saveDraft })
    fireEvent.click(saveDraft)

    await waitFor(() => expect(saveDraft).toBeDisabled())
    fireEvent.click(saveDraft)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
