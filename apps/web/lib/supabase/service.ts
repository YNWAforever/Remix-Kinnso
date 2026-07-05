import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

/**
 * Service-role Supabase client — bypasses RLS entirely. Two documented
 * exceptions are permitted to use this: the Stripe webhook (design spec §4.5)
 * and the Travelpayouts cron sync route (`app/api/cron/travelpayouts-sync`,
 * D-R3-9) — both are non-user-facing, shared-secret-gated, server-to-server
 * routes with a narrow, auditable set of writes. No other request path in
 * this codebase may import this file.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient<Database>(url!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
