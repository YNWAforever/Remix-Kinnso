import { describe, it, expect, vi, afterEach } from 'vitest'
import { createNewStackSource } from '../src/sources/newstack'

/**
 * `apps/web/app/sitemap.ts` exports generateSitemaps, so Next serves /sitemap.xml as a
 * <sitemapindex> over /sitemap/<id>.xml shards — and apps/web/app/robots.ts points search
 * engines at /sitemap/0.xml rather than /sitemap.xml, which is the tell.
 *
 * sitemapUrls() scraped <loc> without distinguishing the two documents, so against an
 * index it returned the SHARD urls. sitemap-superset then compares article paths against
 * a set containing only `/sitemap/0.xml` and reports EVERY expected URL missing — a
 * phantom failure that fires precisely at cutover, when --legacy-mysql supplies the first
 * production-sized expected set.
 */

const source = (fetchImpl: typeof fetch) => {
  vi.stubGlobal('fetch', fetchImpl)
  return createNewStackSource({
    baseUrl: 'https://kinnso.test',
    supabaseUrl: 'https://db.test',
    supabaseAnonKey: 'anon',
  })
}

const xmlResponse = (body: string) => ({ ok: true, status: 200, text: async () => body }) as unknown as Response

const urlset = (...paths: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
    .map((p) => `<url><loc>https://kinnso.test${p}</loc></url>`)
    .join('')}</urlset>`

const sitemapindex = (...shards: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${shards
    .map((s) => `<sitemap><loc>https://kinnso.test${s}</loc></sitemap>`)
    .join('')}</sitemapindex>`

afterEach(() => vi.unstubAllGlobals())

describe('sitemapUrls with a flat urlset', () => {
  it('returns the article paths directly', async () => {
    const ns = source(async () => xmlResponse(urlset('/en/articles/dining/a', '/ja/articles/dining/a')))
    expect([...(await ns.sitemapUrls())].sort()).toEqual([
      '/en/articles/dining/a',
      '/ja/articles/dining/a',
    ])
  })
})

describe('sitemapUrls with a sitemapindex', () => {
  it('follows every shard and returns the union, not the shard URLs', async () => {
    const fetched: string[] = []
    const ns = source(async (input: RequestInfo | URL) => {
      const url = String(input)
      fetched.push(url)
      if (url.endsWith('/sitemap.xml')) return xmlResponse(sitemapindex('/sitemap/0.xml', '/sitemap/1.xml'))
      if (url.endsWith('/sitemap/0.xml')) return xmlResponse(urlset('/en/articles/dining/a'))
      return xmlResponse(urlset('/en/articles/dining/b'))
    })

    const urls = await ns.sitemapUrls()

    expect([...urls].sort()).toEqual(['/en/articles/dining/a', '/en/articles/dining/b'])
    // The shard documents themselves must never appear as "URLs the site publishes".
    expect(urls.has('/sitemap/0.xml')).toBe(false)
    expect(fetched).toHaveLength(3)
  })

  it('deduplicates a URL that appears in more than one shard', async () => {
    const ns = source(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/sitemap.xml')) return xmlResponse(sitemapindex('/sitemap/0.xml', '/sitemap/1.xml'))
      return xmlResponse(urlset('/en/articles/dining/a'))
    })
    expect((await ns.sitemapUrls()).size).toBe(1)
  })

  // Same principle as fetchAllPages: a partial read is the worst failure mode for a gate,
  // because sitemap-superset would report every URL in the missing shard as absent.
  it('throws rather than returning a partial set when a shard cannot be read', async () => {
    const ns = source(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/sitemap.xml')) return xmlResponse(sitemapindex('/sitemap/0.xml', '/sitemap/1.xml'))
      if (url.endsWith('/sitemap/0.xml')) return xmlResponse(urlset('/en/articles/dining/a'))
      return { ok: false, status: 503, text: async () => '' } as unknown as Response
    })
    await expect(ns.sitemapUrls()).rejects.toThrow(/sitemap\/1\.xml|shard/i)
  })

  it('throws on an index with no shards rather than reporting an empty site', async () => {
    const ns = source(async () => xmlResponse(sitemapindex()))
    await expect(ns.sitemapUrls()).rejects.toThrow()
  })

  it('does not recurse into a shard that is itself an index', async () => {
    // Nested indexes are not part of the protocol Next emits; treating one as a urlset
    // would silently yield zero URLs, so it must fail loudly instead.
    const ns = source(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/sitemap.xml')) return xmlResponse(sitemapindex('/sitemap/0.xml'))
      return xmlResponse(sitemapindex('/sitemap/nested.xml'))
    })
    await expect(ns.sitemapUrls()).rejects.toThrow()
  })
})
