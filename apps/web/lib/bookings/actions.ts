'use server'

import { getStripeClient } from '@/lib/stripe/client'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formError, type ActionResult } from '@/lib/admin/result'

/** Maps the booking RPCs' raised error codes to friendly, surfaceable messages. */
const FRIENDLY: Record<string, string> = {
  bad_transition: 'This booking is not confirmed yet, so it can’t be marked complete.',
  not_found: 'Booking not found.',
  forbidden: 'You don’t have access to this booking.',
  settlement_not_found: 'This booking has no settlement record yet. Please contact engineering.',
  reason_required: 'A reason is required.',
  reason_too_long: 'The reason is too long (500 characters max).',
  refund_id_required: 'A Stripe refund id is required.',
  no_change: 'No changes were provided.',
  bad_status: 'That is not a valid settlement status.',
  bad_leg_status: 'That is not a valid payout/commission status.',
  no_creator_leg: 'This booking has no creator commission leg to update.',
}

/** Find the first known error code mentioned in the RPC error message. */
function mapRpcError(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? ''
  for (const [code, friendly] of Object.entries(FRIENDLY)) {
    if (message.includes(code)) return friendly
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Marks a confirmed booking as completed. `mark_booking_completed` is
 * SECURITY DEFINER and itself enforces that the caller owns the experience's
 * merchant profile — this action does not duplicate that check.
 */
export async function markBookingCompletedAction(
  bookingId: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('mark_booking_completed', { p_booking_id: bookingId })
  if (error) return formError(mapRpcError(error))
  return { ok: true, id: bookingId }
}

/**
 * Ops-only: cancels a booking and issues its Stripe refund. The Stripe refund
 * is created FIRST — only once it succeeds do we call
 * `admin_cancel_and_refund_booking` (itself SECURITY DEFINER, enforcing
 * `is_active_ops_role('admin')`) with the real refund id.
 *
 * If the RPC then fails, the Stripe refund has already gone through and
 * cannot be un-done from here. This is a documented, accepted reconciliation
 * gap (PD-R3B-5), not an oversight: rather than adding retry/rollback logic
 * for this phase, we surface the discrepancy plainly so ops knows to
 * reconcile manually.
 */
export async function adminCancelAndRefundBookingAction(input: {
  bookingId: string
  stripePaymentIntentId: string
  reason: string
}): Promise<ActionResult<{ id: string; stripeRefundId: string }>> {
  const stripe = getStripeClient()

  let refundId: string
  try {
    const refund = await stripe.refunds.create({ payment_intent: input.stripePaymentIntentId })
    refundId = refund.id
  } catch {
    return formError('Stripe refund failed. No changes were made to the booking.')
  }

  const supabase = await createSupabaseServerClient()
  // `admin_cancel_and_refund_booking` (migration 20260704170000, Task 4) is not
  // yet in packages/db/types.ts's generated RPC union — types were last
  // regenerated after Tasks 2-3 landed (mark_booking_completed and
  // admin_set_booking_settlement_status are both present) but before Task 4's
  // migration was applied live. Cast the name narrowly here rather than
  // widening the shared `.rpc()` typing; delete this cast the next time
  // `pnpm --filter @kinnso/db gen` runs against a DB with this migration applied.
  const { error } = await supabase.rpc(
    'admin_cancel_and_refund_booking' as Parameters<typeof supabase.rpc>[0],
    {
      p_booking_id: input.bookingId,
      p_stripe_refund_id: refundId,
      p_reason: input.reason,
    },
  )

  if (error) {
    return formError(
      `Stripe refund ${refundId} succeeded, but updating the booking failed: ${mapRpcError(error)} Reconcile manually.`,
    )
  }

  return { ok: true, id: input.bookingId, stripeRefundId: refundId }
}

/**
 * Ops-only: sets one or more legs of a booking's settlement status.
 * `admin_set_booking_settlement_status` is SECURITY DEFINER and itself
 * enforces `is_active_ops_role('admin')` plus every status-transition rule.
 */
export async function adminSetBookingSettlementStatusAction(input: {
  settlementId: string
  status?: string
  merchantPayoutStatus?: string
  creatorCommissionStatus?: string
  kinnsoCommissionStatus?: string
  allowRevert?: boolean
  reason: string
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('admin_set_booking_settlement_status', {
    p_id: input.settlementId,
    p_status: input.status,
    p_merchant_payout_status: input.merchantPayoutStatus,
    p_creator_commission_status: input.creatorCommissionStatus,
    p_kinnso_commission_status: input.kinnsoCommissionStatus,
    p_allow_revert: input.allowRevert ?? false,
    p_reason: input.reason,
  })
  if (error) return formError(mapRpcError(error))
  return { ok: true, id: input.settlementId }
}
