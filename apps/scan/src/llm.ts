import type { LlmClient, LlmMessage } from '@kinnso/scan'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export class OpenRouterClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {
    if (!apiKey) throw new Error('OpenRouterClient: OPENROUTER_API_KEY is required')
  }

  async complete(messages: LlmMessage[]): Promise<string> {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, messages }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenRouter returned HTTP ${res.status}: ${text}`)
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content) {
      throw new Error('OpenRouter response contained no text content')
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
