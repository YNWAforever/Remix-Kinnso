// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
})
