import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

/**
 * Service-role Supabase client — bypasses RLS entirely. The Stripe webhook is
 * the ONE documented exception permitted to use this (design spec §4.5); no
 * other request path in this codebase may import this file.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient<Database>(url!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
