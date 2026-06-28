import type { UIMessage } from 'ai'

// `useChat` posts the ENTIRE conversation on every turn, so an attacker (or a
// runaway client) can grow the payload unbounded and feed it straight to the
// LLM — defeating the per-tier daily limit and driving cost/DoS. These caps
// bound both the message COUNT and the total text size before we ever call the
// model.
export const MAX_COPILOT_MESSAGES = 100
export const MAX_COPILOT_TOTAL_CHARS = 50_000

export type CopilotMessagesResult =
  | { ok: true; messages: UIMessage[] }
  | { ok: false; reason: 'invalid' | 'too_large' }

export function validateCopilotMessages(raw: unknown): CopilotMessagesResult {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, reason: 'invalid' }
  if (raw.length > MAX_COPILOT_MESSAGES) return { ok: false, reason: 'too_large' }

  let total = 0
  for (const message of raw) {
    const parts = (message as { parts?: Array<{ text?: unknown }> } | null)?.parts
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (typeof part?.text === 'string') total += part.text.length
      }
    }
    // Defensively account for any top-level string `.content` some clients send.
    const content = (message as { content?: unknown } | null)?.content
    if (typeof content === 'string') total += content.length
  }
  if (total > MAX_COPILOT_TOTAL_CHARS) return { ok: false, reason: 'too_large' }

  return { ok: true, messages: raw as UIMessage[] }
}
