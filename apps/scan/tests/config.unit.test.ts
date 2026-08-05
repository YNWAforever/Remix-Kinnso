import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config'

const REQUIRED = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
} satisfies NodeJS.ProcessEnv

function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...REQUIRED, ...extra }
}

describe('loadConfig', () => {
  it('throws when a required Supabase env is missing', () => {
    expect(() => loadConfig({ SUPABASE_URL: 'x' })).toThrow('Missing env SUPABASE_ANON_KEY')
  })

  it('defaults the port and fixture mode', () => {
    const cfg = loadConfig(env())
    expect(cfg.port).toBe(8788)
    expect(cfg.fixtureMode).toBe(false)
  })

  // Regression: the CORS origin used to be read straight off process.env in
  // server.ts with a `?? '*'` fallback, bypassing the required-env mechanism
  // entirely — so a production deploy that simply forgot WEB_ORIGIN silently
  // accepted every origin.
  describe('webOrigin', () => {
    it('defaults to * outside production so local dev needs no setup', () => {
      expect(loadConfig(env()).webOrigin).toBe('*')
      expect(loadConfig(env({ NODE_ENV: 'development' })).webOrigin).toBe('*')
      expect(loadConfig(env({ NODE_ENV: 'test' })).webOrigin).toBe('*')
    })

    it('is required in production', () => {
      expect(() => loadConfig(env({ NODE_ENV: 'production' }))).toThrow('Missing env WEB_ORIGIN')
    })

    it('uses WEB_ORIGIN when set, in every environment', () => {
      const origin = 'https://remix-kinnso-web.vercel.app'
      expect(loadConfig(env({ WEB_ORIGIN: origin })).webOrigin).toBe(origin)
      expect(loadConfig(env({ NODE_ENV: 'production', WEB_ORIGIN: origin })).webOrigin).toBe(origin)
    })

    it('rejects an empty WEB_ORIGIN in production rather than falling back to *', () => {
      expect(() => loadConfig(env({ NODE_ENV: 'production', WEB_ORIGIN: '' }))).toThrow(
        'Missing env WEB_ORIGIN',
      )
    })
  })
})
