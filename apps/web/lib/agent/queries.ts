import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

/** Exactly one of travelerUserId/anonSessionId must be set — mirrors
 *  agent_messages' own mutually-exclusive-identity CHECK constraint. */
export type AgentIdentity = { travelerUserId: string; anonSessionId?: never } | { travelerUserId?: never; anonSessionId: string }

export async function appendAgentMessage(
  supabase: Client,
  identity: AgentIdentity,
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: unknown,
): Promise<void> {
  const { error } = await supabase.from('agent_messages').insert({
    traveler_user_id: identity.travelerUserId ?? null,
    anon_session_id: identity.anonSessionId ?? null,
    role,
    content,
    tool_calls: (toolCalls as never) ?? null,
  })
  if (error) throw new Error(`appendAgentMessage failed: ${error.message}`)
}
