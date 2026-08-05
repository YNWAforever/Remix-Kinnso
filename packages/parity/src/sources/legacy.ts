import type { LegacySource } from '../types'
import { createFixtureLegacySource } from '../fixtures/baseline'

export interface LegacyConfig {
  sitemapUrl?: string
  mysqlDsn?: string
}

/** Default = fixture baseline (this env). --legacy-sitemap / --legacy-mysql are cutover-only. */
export async function createLegacySource(cfg: LegacyConfig): Promise<LegacySource> {
  if (cfg.mysqlDsn) return createMysqlLegacySource(cfg.mysqlDsn)
  if (cfg.sitemapUrl) return createSitemapLegacySource(cfg.sitemapUrl)
  return createFixtureLegacySource()
}

/** Legacy sitemap mode: baseline URL set is the legacy sitemap's <loc> entries. */
function createSitemapLegacySource(sitemapUrl: string): LegacySource {
  return {
    async expectedUrlPaths() {
      const xml = await (await fetch(sitemapUrl)).text()
      return new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname))
    },
    async localeCounts() {
      return {} // not derivable from a sitemap -> row-counts check self-skips (warn)
    },
    async redirectSamples() {
      return [] // supplied via fixtures or MySQL at cutover
    },
    async negativePaths() {
      return []
    },
  }
}

export const MYSQL_MODE_NOT_IMPLEMENTED =
  '--legacy-mysql is NOT implemented — do not use it as a cutover gate. Its baseline queries ' +
  '(published URL paths, per-locale post_translations counts) are still TODO in ' +
  'src/sources/legacy.ts, so every check would compare against an EMPTY baseline, pass ' +
  'vacuously, and certify a cutover that was never verified. Use --legacy-sitemap, or ' +
  'implement the queries first.'

/**
 * Legacy MySQL mode (real production cutover only — master spec §8) — NOT IMPLEMENTED.
 *
 * The queries were left as stubs returning empty sets. Empty baselines make every check
 * vacuously true (nothing to cover, nothing to count, nothing to redirect), so the gate
 * would have exited 0 while proving nothing. Refusing to construct the source is the only
 * safe behaviour: a gate that cannot measure must fail, not pass.
 */
function createMysqlLegacySource(_dsn: string): LegacySource {
  throw new Error(MYSQL_MODE_NOT_IMPLEMENTED)
}
