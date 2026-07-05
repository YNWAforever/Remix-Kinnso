'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export type RateAgentMessageResult = { ok: true } | { ok: false }

export async function rateAgentMessageAction(
  messageId: string,
  rating: 'up' | 'down',
  anonSessionId: string | null,
): Promise<RateAgentMessageResult> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('rate_agent_message', {
    p_message_id: messageId,
    p_rating: rating,
    p_anon_session_id: anonSessionId,
  })
  if (error) {
    console.error('[agent:rate] rate_agent_message failed', error)
    return { ok: false }
  }
  return { ok: true }
}
