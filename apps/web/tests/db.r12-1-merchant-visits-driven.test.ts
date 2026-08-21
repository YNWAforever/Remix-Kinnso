import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821120300_r12_1_merchant_visits_driven.sql'),
  'utf8',
)

describe('merchant_insights visits_driven widening', () => {
  it('adds a visits_driven key with separate redemptions and attributed_bookings counts', () => {
    expect(sql).toContain("'visits_driven', coalesce((")
    expect(sql).toContain("'redemptions', r.redemptions")
    expect(sql).toContain("'attributed_bookings', r.attributed_bookings")
  })

  it('keeps merchant_insights a zero-arg function (pure additive change, no signature change)', () => {
    expect(sql).toContain('create or replace function public.merchant_insights()')
    expect(sql).not.toContain('drop function public.merchant_insights')
  })

  it('scopes both counts to the calling merchant via v_merchant, not another merchant_id', () => {
    // merchant_insights() takes no parameters -- it resolves the caller's own merchant
    // into v_merchant from auth.uid() against merchant_profiles, same as every other
    // key in this function. The new subquery must reuse that same variable rather than
    // trusting a caller-supplied merchant id.
    expect(sql).toContain('mo.merchant_profile_id = v_merchant')
    expect(sql).toContain('orr.merchant_profile_id = v_merchant')
    expect(sql).toContain('e.merchant_profile_id = v_merchant')
  })

  it('does not merge the two counts into one number', () => {
    expect(sql).not.toContain('redemptions + attributed_bookings as')
    expect(sql).not.toMatch(/'visits',\s*r\.redemptions\s*\+\s*r\.attributed_bookings/)
  })

  it('leaves the existing missions_published, per_mission, and totals keys untouched', () => {
    expect(sql).toContain("'missions_published', (")
    expect(sql).toContain("'per_mission', coalesce((")
    expect(sql).toContain("'totals', (")
  })
})
