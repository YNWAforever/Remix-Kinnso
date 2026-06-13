export interface SyncConfig {
  legacy: { host: string; port: number; database: string; user: string; password: string }
  supabaseUrl: string
  serviceRoleKey: string
  cdnBase: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SyncConfig {
  const req = (k: string) => {
    const v = env[k]
    if (!v) throw new Error(`Missing env ${k}`)
    return v
  }
  return {
    legacy: {
      host: req('LEGACY_DB_HOST'),
      port: Number(env.LEGACY_DB_PORT ?? 3306),
      database: env.LEGACY_DB_DATABASE ?? 'kinnso',
      user: req('LEGACY_DB_USERNAME'),
      password: req('LEGACY_DB_PASSWORD'),
    },
    supabaseUrl: req('SUPABASE_URL'),
    serviceRoleKey: req('SUPABASE_SERVICE_ROLE_KEY'),
    cdnBase: (env.CDN_BASE_URL ?? '').replace(/\/$/, ''),
  }
}
