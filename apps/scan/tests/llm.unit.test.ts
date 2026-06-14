import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenRouterClient, FakeLlm } from '../src/llm'
import type { LlmMessage } from '@kinnso/scan'

const MESSAGES: LlmMessage[] = [{ role: 'user', content: 'Generate DNA.' }]

describe('OpenRouterClient', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('throws on construction when apiKey is empty', () => {
    expect(() => new OpenRouterClient('', 'some-model')).toThrow('OPENROUTER_API_KEY is required')
  })

  it('sends Authorization header with Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'hello' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new OpenRouterClient('or-key', 'anthropic/claude-3.5-sonnet')
    await client.complete(MESSAGES)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer or-key')
  })

  it('sends the model and messages in request body', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new OpenRouterClient('or-key', 'openai/gpt-4o')
    await client.complete(MESSAGES)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('openai/gpt-4o')
    expect(body.messages).toEqual(MESSAGES)
  })

  it('returns the text content from choices[0].message.content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'the dna text' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    )
    const result = await new OpenRouterClient('key', 'model').complete(MESSAGES)
    expect(result).toBe('the dna text')
  })

  it('throws on non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('bad', { status: 401 })))
    await expect(new OpenRouterClient('key', 'model').complete(MESSAGES)).rejects.toThrow(
      'OpenRouter returned HTTP 401'
    )
  })

  it('throws when choices[0] content is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
    await expect(new OpenRouterClient('key', 'model').complete(MESSAGES)).rejects.toThrow(
      'no text content'
    )
  })
})

describe('FakeLlm', () => {
  it('resolves with valid DNA JSON by default', async () => {
    const text = await new FakeLlm().complete(MESSAGES)
    const parsed = JSON.parse(text)
    expect(parsed.bio).toBeTruthy()
    expect(Array.isArray(parsed.niches)).toBe(true)
  })

  it('rejects when shouldFail=true', async () => {
    await expect(new FakeLlm(undefined, true).complete(MESSAGES)).rejects.toThrow(
      'simulated LLM failure'
    )
  })

  it('returns the provided custom response string', async () => {
    const custom = '{"bio":"custom","niches":[],"content_pillars":[]}'
    expect(await new FakeLlm(custom).complete(MESSAGES)).toBe(custom)
  })
})
