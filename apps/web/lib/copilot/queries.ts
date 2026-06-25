import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface CopilotMessageRow {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

/** The creator's active (non-archived) thread, oldest first. */
export async function getRecentMessages(supabase: Client, creatorId: string, limit = 50): Promise<CopilotMessageRow[]> {
  const { data } = await supabase
    .from('copilot_messages')
    .select('id, role, content, created_at')
    .eq('creator_id', creatorId)
    .eq('archived', false)
    .order('created_at', { ascending: true })
    .limit(limit)
  return (data ?? []) as CopilotMessageRow[]
}

export async function appendMessage(
  supabase: Client,
  creatorId: string,
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: unknown,
): Promise<void> {
  await supabase.from('copilot_messages').insert({
    creator_id: creatorId,
    role,
    content,
    tool_calls: (toolCalls as never) ?? null,
  })
}

/** Count this creator's USER messages since UTC midnight (the daily rate-limit window). */
export async function countUserMessagesToday(supabase: Client, creatorId: string): Promise<number> {
  const now = new Date()
  const startIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const { count } = await supabase
    .from('copilot_messages')
    .select('id', { count: 'exact', head: true })
    .eq('creator_id', creatorId)
    .eq('role', 'user')
    .gte('created_at', startIso)
  return count ?? 0
}

/** Start a "New chat": archive the creator's current active thread (history is kept). */
export async function archiveThread(supabase: Client, creatorId: string): Promise<void> {
  await supabase
    .from('copilot_messages')
    .update({ archived: true })
    .eq('creator_id', creatorId)
    .eq('archived', false)
}
