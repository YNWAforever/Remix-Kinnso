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

/**
 * Legacy MySQL mode (real production cutover only — master spec §8).
 * mysql2 is imported dynamically so the package installs/typechecks without a live DB.
 * Exercised only against production; logic is unit-tested via the fixture source.
 */
function createMysqlLegacySource(dsn: string): LegacySource {
  async function withConn<T>(fn: (conn: import('mysql2/promise').Connection) => Promise<T>): Promise<T> {
    const mysql = await import('mysql2/promise')
    const conn = await mysql.createConnection(dsn)
    try {
      return await fn(conn)
    } finally {
      await conn.end()
    }
  }
  return {
    async expectedUrlPaths() {
      // TODO(cutover): SELECT published posts from the legacy schema and build
      // /{locale}/articles/{segment}/{url}. See README "Legacy mode".
      return withConn(async () => new Set<string>())
    },
    async localeCounts() {
      // TODO(cutover): SELECT locale, COUNT(*) FROM post_translations of published posts.
      return withConn(async () => ({}))
    },
    async redirectSamples() {
      return []
    },
    async negativePaths() {
      return []
    },
  }
}
