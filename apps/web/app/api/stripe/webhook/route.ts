import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/stripe/client'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signature || !webhookSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const rawBody = await req.text()
  let event: Stripe.Event
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('[stripe:webhook] signature verification failed', err)
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status === 'paid' && session.payment_intent) {
      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id
      const supabase = createSupabaseServiceClient()
      const { error } = await supabase.rpc('confirm_booking_from_webhook', {
        p_stripe_payment_intent_id: paymentIntentId,
        p_stripe_checkout_session_id: session.id,
      })
      if (error) {
        console.error('[stripe:webhook] confirm_booking_from_webhook failed', error)
        return NextResponse.json({ ok: false, error: 'confirmation failed' }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
