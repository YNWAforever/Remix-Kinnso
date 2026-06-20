// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StudioEarningsView } from '@/components/kinnso/pages/StudioEarningsView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('StudioEarningsView', () => {
  it('renders the empty state when there are no earnings', () => {
    render(<StudioEarningsView t={en.studioEarnings} totals={[]} items={[]} />)
    expect(screen.getByText(en.studioEarnings.empty)).toBeTruthy()
  })

  it('renders per-currency totals and a per-mission breakdown', () => {
    render(
      <StudioEarningsView
        t={en.studioEarnings}
        totals={[{ currency: 'USD', paid: 120, pending: 30 }]}
        items={[{ id: 's1', missionTitle: 'Hotel program', missionType: 'coupon_affiliate', currency: 'USD', amount: 120, payoutStatus: 'paid' }]}
      />,
    )
    expect(screen.getByText('USD')).toBeTruthy()
    expect(screen.getByText('Hotel program')).toBeTruthy()
    expect(screen.getAllByText(en.studioEarnings.paid).length).toBeGreaterThan(0)
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })
})
