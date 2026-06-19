import type { LlmClient, LlmMessage } from '@kinnso/scan'

/**
 * Default endpoint when LLM_BASE_URL is unset. OpenRouter's OpenAI-compatible
 * chat-completions URL — kept as the fallback for backward compatibility.
 */
export const DEFAULT_LLM_URL = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * Generic OpenAI-compatible chat-completions client.
 *
 * Works with any provider that exposes the OpenAI `/chat/completions` shape
 * (Bearer auth, `{ model, messages }` request, `choices[0].message.content`
 * response) — OpenRouter, OpenCode Zen, OpenAI, etc. The endpoint is injected
 * via `baseUrl` so the worker stays provider-agnostic; swap providers by
 * setting `LLM_BASE_URL` (+ `LLM_API_KEY` / `LLM_MODEL`) in the environment,
 * no code change required.
 */
export class ChatCompletionsClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string = DEFAULT_LLM_URL
  ) {
    if (!apiKey) throw new Error('ChatCompletionsClient: LLM API key is required')
  }

  async complete(messages: LlmMessage[]): Promise<string> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, messages }),
    })

    if (!res.ok) {
      // The body is the provider's error payload (status/message) — never the
      // API key, which travels only in the Authorization header.
      const text = await res.text().catch(() => '')
      throw new Error(`LLM endpoint returned HTTP ${res.status}: ${text}`)
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content) {
      throw new Error('LLM response contained no text content')
    }
    return content
  }
}

/**
 * Fake LLM for tests and fixture mode.
 * Returns a hard-coded valid DNA JSON string by default.
 */
export class FakeLlm implements LlmClient {
  constructor(
    private readonly response?: string,
    private readonly shouldFail = false
  ) {}

  async complete(_messages: LlmMessage[]): Promise<string> {
    if (this.shouldFail) throw new Error('FakeLlm: simulated LLM failure')
    return (
      this.response ??
      JSON.stringify({
        bio: 'A travel and food creator based in Hong Kong.',
        niches: ['travel', 'food'],
        content_pillars: ['Hidden gems', 'Local cuisine'],
        tone: ['warm', 'informative'],
        audience: { top_geos: ['HK', 'JP'], top_locales: ['zh-hk', 'en'] },
        platforms: [
          { platform: 'instagram', followers: 5000, avg_engagement: 3.2, verified: false },
        ],
        languages: ['zh-hk', 'en'],
      })
    )
  }
}
