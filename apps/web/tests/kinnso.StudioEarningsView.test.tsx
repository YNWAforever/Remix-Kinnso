// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StudioEarningsView } from '@/components/kinnso/pages/StudioEarningsView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const empty = { missions: [], bookings: [], tracked: [], totals: [] }

const missions = [
  {
    id: 'ms1',
    missionTitle: 'Tokyo ramen crawl',
    missionType: 'paid',
    missionSource: 'merchant',
    currency: 'HKD',
    amount: 1200,
    payoutStatus: 'pending' as const,
  },
]
const bookings = [
  { id: 'bs1', experienceTitle: 'Sunset harbour walk', currency: 'HKD', amount: 80.5, payoutStatus: 'paid' as const },
]
const tracked = [
  { id: 'ev1', missionTitle: 'Flight deals', currency: 'USD', grossAmount: 15.25, eventState: 'processing' },
]

// Task 10 (a later task in this plan, not yet landed) adds these i18n keys to en.studioEarnings.
// Until then they're `undefined` at runtime, and @testing-library/dom's getByText throws
// synchronously on an undefined matcher rather than treating it as "not found" (see
// kinnso.CreatorPayoutBatchesView.test.tsx, Task 7, for the full explanation). Supply a stable
// placeholder string per pending key so the two payout-batches tests below can genuinely
// exercise the component now; spread order means real en.studioEarnings values always win once
// Task 10 adds them, so this fallback becomes fully inert dead code at that point (safe to
// delete then — reverting every `t={t}` in this describe block to `t={en.studioEarnings}` is
// the whole cleanup, though the existing five tests never needed it in the first place).
const PENDING_I18N_FALLBACK = {
  payoutBatchesHeading: 'payoutBatchesHeading', payoutBatchesEmpty: 'payoutBatchesEmpty',
  colTarget: 'colTarget', batchCancelled: 'batchCancelled',
}
const t = { ...PENDING_I18N_FALLBACK, ...en.studioEarnings }

const payoutBatches = [
  {
    id: 'b1', currency: 'HKD', amount: 1500, status: 'pending' as const, targetAt: '2026-08-23T00:00:00Z',
    createdAt: '2026-08-16T00:00:00Z', paidAt: null, cancelledAt: null,
  },
]

describe('StudioEarningsView', () => {
  it('shows a per-section empty state when the creator has nothing', () => {
    render(<StudioEarningsView t={en.studioEarnings} locale="en" data={empty} payoutBatches={[]} />)
    expect(screen.getByText(en.studioEarnings.missionsEmpty)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.bookingsEmpty)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.trackedEmpty)).toBeTruthy()
  })

  it('renders booking commission even when there are no mission settlements', () => {
    render(<StudioEarningsView t={en.studioEarnings} locale="en" data={{ ...empty, bookings }} payoutBatches={[]} />)
    expect(screen.getByText('Sunset harbour walk')).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.missionsEmpty)).toBeTruthy()
  })

  it('renders all three sections with their headings', () => {
    render(
      <StudioEarningsView
        t={en.studioEarnings}
        locale="en"
        data={{ missions, bookings, tracked, totals: [{ currency: 'HKD', paid: 80.5, pending: 1200 }] }}
        payoutBatches={[]}
      />,
    )
    expect(screen.getByText(en.studioEarnings.missionsHeading)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.bookingsHeading)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.trackedHeading)).toBeTruthy()
    expect(screen.getByText('Tokyo ramen crawl')).toBeTruthy()
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })

  it('states that tracked volume is not payable', () => {
    render(<StudioEarningsView t={en.studioEarnings} locale="en" data={{ ...empty, tracked, totals: [] }} payoutBatches={[]} />)
    expect(screen.getByText(en.studioEarnings.trackedNote)).toBeTruthy()
    // The row itself IS shown — it is real, recorded volume.
    expect(screen.getByText('Flight deals')).toBeTruthy()
  })

  it('renders no totals card when the only money is tracked, not payable', () => {
    render(<StudioEarningsView t={en.studioEarnings} locale="en" data={{ ...empty, tracked, totals: [] }} payoutBatches={[]} />)
    // A totals card renders a ReceiptRow labelled t.paid; the mission/booking tables are
    // empty here, so no status badge can supply that text either. Its absence proves the
    // USD tracked row did not manufacture a USD totals card.
    expect(screen.queryByText(en.studioEarnings.paid)).toBeNull()
    expect(screen.queryByText(en.studioEarnings.pending)).toBeNull()
  })

  it('renders a payout batches section when batches exist', () => {
    render(<StudioEarningsView t={t} locale="en" data={empty} payoutBatches={payoutBatches} />)
    expect(screen.getByText(t.payoutBatchesHeading)).toBeTruthy()
    // Currency and amount render as adjacent text nodes within one cell ("HKD" then the
    // locale-formatted amount); match on the currency substring rather than the full text so
    // this doesn't depend on Number.prototype.toLocaleString()'s locale-dependent formatting.
    expect(screen.getByText(/HKD/)).toBeTruthy()
  })

  it('shows the empty state with no payout batches', () => {
    render(<StudioEarningsView t={t} locale="en" data={empty} payoutBatches={[]} />)
    expect(screen.getByText(t.payoutBatchesEmpty)).toBeTruthy()
  })
})
