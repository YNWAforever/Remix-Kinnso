import type { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  resolveViewerRoleFromFacts,
  type ViewerRole,
} from './viewer-role-policy'

export type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export type AuthorizationUser = { id: string }

export type AuthorizationContext = {
  user: AuthorizationUser | null
  role: ViewerRole
  merchantId: string | null
}

export async function getAuthorizationContext(
  supabase: ServerSupabase,
): Promise<AuthorizationContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, role: 'anon', merchantId: null }
  }

  const { data: ops } = await supabase
    .from('kinnso_ops_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  const { data: merchant } = await supabase
    .from('merchant_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: creator } = await supabase
    .from('creators')
    .select('status')
    .eq('id', user.id)
    .maybeSingle()

  const merchantId = merchant && typeof merchant.id === 'string' ? merchant.id : null

  return {
    user: { id: user.id },
    role: resolveViewerRoleFromFacts({
      authenticated: true,
      hasActiveOps: Boolean(ops),
      hasMerchantProfile: Boolean(merchant),
      hasActiveCreator: creator?.status === 'active',
    }),
    merchantId,
  }
}
