import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

describe('booking_settlements trigger (integration, requires real Supabase project)', () => {
  it('auto-creates a settlement row with a null creator leg for a direct booking', async () => {
    const supabase = createClient(url, serviceKey)

    const { data: experience } = await supabase
      .from('experiences')
      .select('id, currency')
      .eq('status', 'published')
      .limit(1)
      .single()
    if (!experience) return // no published experience in this environment; skip

    const { data: availability } = await supabase
      .from('experience_availability')
      .select('id')
      .eq('experience_id', experience.id)
      .eq('status', 'open')
      .limit(1)
      .single()
    if (!availability) return

    const { data: booking } = await supabase
      .from('bookings')
      .insert({
        experience_id: experience.id,
        availability_id: availability.id,
        guest_email: 'r3b-trigger-test@example.com',
        qty: 1,
        unit_amount: 1000,
        total_amount: 1000,
        currency: experience.currency,
        status: 'pending_payment',
        stripe_checkout_session_id: `cs_test_r3b_${Date.now()}`,
        source_surface: 'experience_page',
      })
      .select('id')
      .single()
    expect(booking).toBeTruthy()

    await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', booking!.id)

    const { data: settlement } = await supabase
      .from('booking_settlements')
      .select('*')
      .eq('booking_id', booking!.id)
      .single()

    expect(settlement?.kinnso_commission_amount).toBe(100)
    expect(settlement?.creator_commission_amount).toBeNull()
    expect(settlement?.creator_commission_status).toBeNull()
    expect(settlement?.merchant_payout_amount).toBe(900)

    // cleanup
    await supabase.from('booking_settlements').delete().eq('booking_id', booking!.id)
    await supabase.from('bookings').delete().eq('id', booking!.id)
  })
})
