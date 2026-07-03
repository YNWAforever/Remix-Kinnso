'use server'

import { isLocale, type Locale } from '@/lib/i18n/config'
import { createSupabasePublicClient } from '@/lib/supabase/public'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export type WaitlistResult = { ok: true } | { ok: false; error: 'invalid' | 'failed' }

/**
 * Anon-writable, insert-only waitlist join (RLS: agent_waitlist_public_insert —
 * a documented §7 deviation, see the R1C migration header). Unique-violation
 * (23505) is a success: joining twice is a no-op, and this doubles as an
 * email-enumeration shield — the response never reveals whether an address was
 * already on the list. `hp` is the form honeypot: bots that fill it get a fake
 * success and no insert. Per-IP rate limiting is a recorded R4 carry-forward.
 */
export async function joinAgentWaitlistAction(locale: Locale, email: string, hp?: string): Promise<WaitlistResult> {
  if (hp) return { ok: true }
  const normalized = String(email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(normalized) || normalized.length > 254) return { ok: false, error: 'invalid' }

  const supabase = createSupabasePublicClient()
  const { error } = await supabase
    .from('agent_waitlist')
    .insert({ email: normalized, locale: isLocale(locale) ? locale : null })
  if (error && error.code !== '23505') {
    console.error('[agent:waitlist] join failed', error)
    return { ok: false, error: 'failed' }
  }
  return { ok: true }
}
