// apps/web/tests/bookings.actions.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { rpcMock, createServerClientMock, stripeRefundsCreateMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  createServerClientMock: vi.fn(),
  stripeRefundsCreateMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createServerClientMock,
}))

vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: () => ({ refunds: { create: stripeRefundsCreateMock } }),
}))

import {
  adminCancelAndRefundBookingAction,
  adminSetBookingSettlementStatusAction,
  markBookingCompletedAction,
} from '@/lib/bookings/actions'

beforeEach(() => {
  rpcMock.mockReset()
  createServerClientMock.mockReset()
  stripeRefundsCreateMock.mockReset()
})

describe('markBookingCompletedAction', () => {
  it('returns a friendly error when the RPC reports bad_transition', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: { message: 'bad_transition' } })

    const result = await markBookingCompletedAction('booking-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form?.[0]).toMatch(/not confirmed yet/i)
  })

  it('returns a friendly error when the RPC reports not_found', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: { message: 'not_found' } })

    const result = await markBookingCompletedAction('booking-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form?.[0]).toMatch(/not found/i)
  })

  it('returns a friendly error when the RPC reports forbidden', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: { message: 'forbidden' } })

    const result = await markBookingCompletedAction('booking-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form?.[0]).toMatch(/don.t have access/i)
  })

  it('falls back to a generic error for an unmapped failure', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: { message: 'something_else' } })

    const result = await markBookingCompletedAction('booking-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form?.[0]).toMatch(/something went wrong/i)
  })

  it('calls mark_booking_completed with the booking id and returns ok+id on success', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: null })

    const result = await markBookingCompletedAction('booking-1')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.id).toBe('booking-1')
    expect(rpcMock).toHaveBeenCalledWith('mark_booking_completed', { p_booking_id: 'booking-1' })
  })
})

describe('adminCancelAndRefundBookingAction', () => {
  it('does not call the RPC if the Stripe refund call fails', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    stripeRefundsCreateMock.mockRejectedValue(new Error('stripe down'))

    const result = await adminCancelAndRefundBookingAction({
      bookingId: 'booking-1',
      stripePaymentIntentId: 'pi_123',
      reason: 'traveller requested cancellation',
    })

    expect(result.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls the RPC with the real Stripe refund id on success', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    stripeRefundsCreateMock.mockResolvedValue({ id: 're_abc123' })
    rpcMock.mockResolvedValue({ error: null })

    const result = await adminCancelAndRefundBookingAction({
      bookingId: 'booking-1',
      stripePaymentIntentId: 'pi_123',
      reason: 'traveller requested cancellation',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.id).toBe('booking-1')
      expect(result.stripeRefundId).toBe('re_abc123')
    }
    expect(rpcMock).toHaveBeenCalledWith('admin_cancel_and_refund_booking', {
      p_booking_id: 'booking-1',
      p_stripe_refund_id: 're_abc123',
      p_reason: 'traveller requested cancellation',
    })
  })

  it('surfaces the reconciliation gap plainly when the RPC fails after a successful refund', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    stripeRefundsCreateMock.mockResolvedValue({ id: 're_abc123' })
    rpcMock.mockResolvedValue({ error: { message: 'not_found' } })

    const result = await adminCancelAndRefundBookingAction({
      bookingId: 'booking-1',
      stripePaymentIntentId: 'pi_123',
      reason: 'traveller requested cancellation',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.form?.[0]).toContain('re_abc123')
      expect(result.errors.form?.[0]).toMatch(/reconcile manually/i)
    }
  })
})

describe('adminSetBookingSettlementStatusAction', () => {
  it('calls the RPC with all fields mapped to their p_ args, defaulting optionals', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: null })

    const result = await adminSetBookingSettlementStatusAction({
      settlementId: 'settlement-1',
      status: 'paid',
      reason: 'manual reconciliation',
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.id).toBe('settlement-1')
    expect(rpcMock).toHaveBeenCalledWith('admin_set_booking_settlement_status', {
      p_id: 'settlement-1',
      p_status: 'paid',
      p_merchant_payout_status: undefined,
      p_creator_commission_status: undefined,
      p_kinnso_commission_status: undefined,
      p_allow_revert: false,
      p_reason: 'manual reconciliation',
    })
  })

  it('passes allowRevert through when explicitly set', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: null })

    await adminSetBookingSettlementStatusAction({
      settlementId: 'settlement-1',
      merchantPayoutStatus: 'pending',
      allowRevert: true,
      reason: 'correcting a mistaken payout mark',
    })

    expect(rpcMock).toHaveBeenCalledWith(
      'admin_set_booking_settlement_status',
      expect.objectContaining({ p_allow_revert: true, p_merchant_payout_status: 'pending' }),
    )
  })

  it('returns a friendly error when the RPC reports bad_transition', async () => {
    createServerClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ error: { message: 'bad_transition' } })

    const result = await adminSetBookingSettlementStatusAction({
      settlementId: 'settlement-1',
      status: 'not_started',
      reason: 'revert attempt',
    })

    expect(result.ok).toBe(false)
  })
})
