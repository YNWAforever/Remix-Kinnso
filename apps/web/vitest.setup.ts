import { config } from 'dotenv'

// Load test env (created locally from the hosted project, or in CI from
// `supabase status`). See README / CI for the required keys:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
config({ path: '.env.test' })

if (!process.env.SUPABASE_URL) {
  throw new Error('Set apps/web/.env.test (SUPABASE_URL etc.) before running integration tests')
}
