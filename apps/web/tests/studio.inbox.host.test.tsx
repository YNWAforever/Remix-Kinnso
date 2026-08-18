// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// NOTE: Task 7 (not yet landed) adds a `notifications` key to lib/i18n/messages/*.ts -- the
// real en.ts doesn't have one yet. If this test used the real getDictionary, StudioInboxView
// would receive `t={undefined}` and crash on `t.heading` during render. Mocking
// '@/lib/i18n/dictionaries' to layer a PENDING_I18N_FALLBACK notifications stub onto the real
// en messages (same fallback shape used in kinnso.StudioInboxView.test.tsx) keeps this host
// test exercising the real page/component wiring without depending on Task 7.
const notifications = [
  {
    id: 'n1', notificationType: 'payout_batch.paid', entityType: 'payout_batch', entityId: 'b1',
    payload: { currency: 'HKD', amount: 1500 }, readAt: null, createdAt: '2026-08-17T00:00:00Z',
  },
]

const { getNotificationsMock, requireCreatorPageMock } = vi.hoisted(() => ({
  getNotificationsMock: vi.fn(async () => [] as unknown[]),
  requireCreatorPageMock: vi.fn(async () => ({ user: { id: 'c1' } })),
}))
vi.mock('@/lib/notifications/queries', () => ({ getNotifications: getNotificationsMock }))
vi.mock('@/lib/admin/guard', () => ({ requireCreatorPage: requireCreatorPageMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({}) }))
vi.mock('@/lib/i18n/dictionaries', () => ({
  getDictionary: async () => ({
    ...(await import('@/lib/i18n/messages/en')).default,
    notifications: {
      heading: 'heading', subtitle: 'subtitle', empty: 'empty',
      'submission.approved': 'submission.approved',
      'submission.rejected': 'submission.rejected',
      'submission.revision_requested': 'submission.revision_requested',
      'settlement.created': 'settlement.created',
      'payout_batch.created': 'payout_batch.created',
      'payout_batch.paid': 'Paid out {amount} {currency}',
      'payout_batch.cancelled': 'payout_batch.cancelled',
    },
  }),
}))

import StudioInboxPage from '@/app/[locale]/studio/inbox/page'

beforeEach(() => {
  getNotificationsMock.mockClear().mockResolvedValue(notifications)
  requireCreatorPageMock.mockClear()
})
afterEach(cleanup)

describe('/[locale]/studio/inbox host', () => {
  it('renders the inbox for an active creator, with the payload interpolated into the notification text', async () => {
    const ui = await StudioInboxPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(getNotificationsMock).toHaveBeenCalled()
    expect(requireCreatorPageMock).toHaveBeenCalled()
    expect(screen.getByText('heading')).toBeTruthy()
    expect(screen.getByRole('link').textContent).toContain('Paid out 1500 HKD')
  })

  it('shows the empty state when the creator has no notifications', async () => {
    getNotificationsMock.mockResolvedValue([])
    const ui = await StudioInboxPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('empty')).toBeTruthy()
  })
})
