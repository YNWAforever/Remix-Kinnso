import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

/**
 * Cookie-less anon Supabase client for PUBLIC reads (published guides etc.).
 * Using this instead of the cookie-bound server client keeps RSC routes that
 * only read public data statically optimizable (no `cookies()` => no forced
 * dynamic rendering).
 */
export function createSupabasePublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
  return createClient<Database>(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
