import { getAuthorizationContext, type ServerSupabase } from './authorization-context'
import type { ViewerRole } from './viewer-role-policy'

export type { ViewerRole } from './viewer-role-policy'

export async function resolveViewerRole(
  supabase: ServerSupabase,
): Promise<ViewerRole> {
  return (await getAuthorizationContext(supabase)).role
}
