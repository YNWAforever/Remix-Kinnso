import { NextResponse } from 'next/server'
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isAgentConfigured } from '@/lib/agent/config'
import { AGENT_MODEL, AGENT_RATE_LIMIT } from '@/lib/agent/policy'
import { makeAgentTools } from '@/lib/agent/tools'
import { appendAgentMessage, type AgentIdentity } from '@/lib/agent/queries'
import { getClientIp } from '@/lib/http/client-ip'
import { isLocale, type Locale } from '@/lib/i18n/config'

// Same streamText/tool-budget shape as app/api/copilot/route.ts (haiku model,
// stepCountIs(5), a handful of read-only search tools) — a real caller is
// synchronously waiting for the stream to start, so this matches the
// copilot's precedent for the same reason rather than the cron job's
// plan-capacity math (app/api/cron/travelpayouts-sync/route.ts). Anon vs
// signed-in identity resolution adds a cheap auth lookup + one rate-limit
// RPC before streamText is even called, not more model latency.
export const maxDuration = 30

const SYSTEM_PROMPT = `You are the KINNSO travel agent. Help travellers plan trips using
only the search tools available to you (searchGuides, searchArticles,
searchExperiences) — never invent a place, guide, or experience that a search didn't
return. When you recommend a bookable experience, mention it can be booked directly on
KINNSO. Keep answers concise and conversational.`

function lastUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user')
  if (!last) return ''
  const parts = (last as { parts?: Array<{ type: string; text?: string }> }).parts ?? []
  return parts.filter((p) => p.type === 'text').map((p) => p.text ?? '').join(' ').trim()
}

export async function POST(req: Request) {
  if (!isAgentConfigured()) return NextResponse.json({ error: 'unconfigured' }, { status: 503 })

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const body = (await req.json().catch(() => ({}))) as {
    messages?: UIMessage[]; locale?: unknown; anonSessionId?: unknown
  }
  const messages = body.messages ?? []
  const locale: Locale = typeof body.locale === 'string' && isLocale(body.locale) ? body.locale : 'en'

  let identity: AgentIdentity
  if (user) {
    identity = { travelerUserId: user.id }
  } else {
    const anonSessionId = typeof body.anonSessionId === 'string' ? body.anonSessionId : ''
    if (!anonSessionId) return NextResponse.json({ error: 'missing_anon_session_id' }, { status: 400 })
    identity = { anonSessionId }
  }

  const ip = await getClientIp()
  const { data: allowed, error: rateLimitError } = await supabase.rpc('check_and_increment_agent_rate_limit', {
    p_ip: ip,
    p_max_requests: AGENT_RATE_LIMIT.maxRequests,
    p_window_seconds: AGENT_RATE_LIMIT.windowSeconds,
  })
  if (rateLimitError) {
    console.error('[agent] rate limit check failed', rateLimitError)
    return NextResponse.json({ error: 'rate_limit_check_failed' }, { status: 500 })
  }
  if (!allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const text = lastUserText(messages)
  if (text) await appendAgentMessage(supabase, identity, 'user', text)

  const tools = makeAgentTools(supabase, locale)

  // Same rationale as the copilot route: this try/catch only guards
  // synchronous setup errors; gateway/auth/credit failures resolve lazily
  // during the stream and are surfaced via onError instead.
  try {
    const result = streamText({
      model: AGENT_MODEL,
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(5),
      onError: ({ error }) => {
        console.error('[agent] stream error', error)
      },
      onFinish: async ({ text: out }: { text: string }) => {
        if (out) await appendAgentMessage(supabase, identity, 'assistant', out)
      },
    })
    return result.toUIMessageStreamResponse()
  } catch {
    return NextResponse.json({ error: 'gateway' }, { status: 502 })
  }
}
