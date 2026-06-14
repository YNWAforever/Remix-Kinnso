export interface ScanConfig {
  port: number
  supabaseUrl: string
  anonKey: string
  serviceRoleKey: string
  rapidApiKey: string
  youtubeApiKey: string
  openRouterApiKey: string
  openRouterModel: string
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
    openRouterApiKey: env.OPENROUTER_API_KEY ?? '',
    openRouterModel: env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet',
    fixtureMode: env.SCAN_FIXTURE_MODE === '1',
  }
}
