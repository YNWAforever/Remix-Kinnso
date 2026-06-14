import { describe, it, expect } from 'vitest'
import { parseArgs } from '../src/cli'

describe('parseArgs', () => {
  it('reads flags and trims a trailing slash off base-url', () => {
    const cfg = parseArgs(
      ['--base-url', 'https://live.test/', '--supabase-url', 'https://db.test', '--supabase-anon-key', 'anon', '--sample', '5', '--json', '--fail-fast'],
      {},
    )
    expect(cfg).toMatchObject({
      baseUrl: 'https://live.test',
      supabaseUrl: 'https://db.test',
      supabaseAnonKey: 'anon',
      sample: 5,
      json: true,
      failFast: true,
    })
  })

  it('falls back to env vars and defaults', () => {
    const cfg = parseArgs([], {
      NEXT_PUBLIC_SUPABASE_URL: 'https://env-db.test',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'env-anon',
    })
    expect(cfg.baseUrl).toBe('https://remix-kinnso-web.vercel.app')
    expect(cfg.supabaseUrl).toBe('https://env-db.test')
    expect(cfg.supabaseAnonKey).toBe('env-anon')
    expect(cfg.sample).toBe(3)
    expect(cfg.json).toBe(false)
  })

  it('captures legacy-mode flags', () => {
    const cfg = parseArgs(['--legacy-sitemap', 'https://legacy.test/sitemap.xml'], {})
    expect(cfg.legacySitemap).toBe('https://legacy.test/sitemap.xml')
  })
})
