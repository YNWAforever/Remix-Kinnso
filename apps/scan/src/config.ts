import { DEFAULT_LLM_URL } from './llm'

export interface ScanConfig {
  port: number
  supabaseUrl: string
  anonKey: string
  serviceRoleKey: string
  rapidApiKey: string
  youtubeApiKey: string
  llmApiKey: string
  llmModel: string
  llmBaseUrl: string
  fixtureMode: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ScanConfig {
  const req = (k: string): string => {
    const v = env[k]
    if (!v) throw new Error(`Missing env ${k}`)
    return v
  }
  return {
    port: Number(env.PORT ?? 8788),
    supabaseUrl: req('SUPABASE_URL'),
    anonKey: req('SUPABASE_ANON_KEY'),
    serviceRoleKey: req('SUPABASE_SERVICE_ROLE_KEY'),
    rapidApiKey: env.RAPIDAPI_KEY ?? '',
    youtubeApiKey: env.YOUTUBE_API_KEY ?? '',
    // Provider-agnostic LLM config. LLM_* are the canonical names; the legacy
    // OPENROUTER_* names are still honoured as a fallback so existing
    // deployments keep working. Point LLM_BASE_URL at any OpenAI-compatible
    // chat-completions endpoint (OpenRouter, OpenCode Zen, …) to switch.
    llmApiKey: env.LLM_API_KEY ?? env.OPENROUTER_API_KEY ?? '',
    llmModel: env.LLM_MODEL ?? env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet',
    llmBaseUrl: env.LLM_BASE_URL ?? DEFAULT_LLM_URL,
    fixtureMode: env.SCAN_FIXTURE_MODE === '1',
  }
}
