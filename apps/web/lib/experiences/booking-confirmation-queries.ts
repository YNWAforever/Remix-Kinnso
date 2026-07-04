import { createSupabasePublicClient } from '@/lib/supabase/public'

export type BookingConfirmation = {
  bookingId: string
  status: 'pending_payment' | 'confirmed' | 'completed' | 'cancelled' | 'refunded'
  qty: number
  totalAmount: number
  currency: string
  experienceTitle: string
  experienceSlug: string
}

/**
 * Reads a single booking back by its (unguessable, Stripe-generated) checkout
 * session id via a SECURITY DEFINER RPC — the sanctioned anon-read exception
 * for guest confirmations (design spec §D-R3-2), reused uniformly for
 * signed-in travelers too so the confirmation page never has to branch on
 * auth state.
 */
export async function getBookingByCheckoutSession(sessionId: string): Promise<BookingConfirmation | null> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .rpc('get_booking_by_checkout_session', { p_session_id: sessionId })
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    bookingId: data.booking_id as string,
    status: data.status as BookingConfirmation['status'],
    qty: data.qty as number,
    totalAmount: Number(data.total_amount),
    currency: data.currency as string,
    experienceTitle: data.experience_title as string,
    experienceSlug: data.experience_slug as string,
  }
}
