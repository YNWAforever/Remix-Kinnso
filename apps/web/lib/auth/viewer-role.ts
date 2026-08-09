import { getAuthorizationContext, type ServerSupabase } from './authorization-context'
import type { ViewerRole } from './viewer-role-policy'

export type { ViewerRole } from './viewer-role-policy'

export async function resolveViewerRole(
  supabase: ServerSupabase,
): Promise<ViewerRole> {
  const context = await getAuthorizationContext(supabase)
  if (context.role === 'indeterminate') {
    throw new Error('Unable to determine authorization context')
  }
  return context.role
}
