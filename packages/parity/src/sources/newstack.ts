import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { NewStackSource, PublishedArticle } from '../types'

export interface NewStackConfig {
  baseUrl: string
  supabaseUrl: string
  supabaseAnonKey: string
}

export function tallyLocaleCounts(articles: PublishedArticle[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const a of articles) for (const l of a.locales) counts[l] = (counts[l] ?? 0) + 1
  return counts
}

/** PostgREST's `db-max-rows` cap. An unranged SELECT is truncated here, silently. */
const PAGE_SIZE = 1000

/**
 * Read an ENTIRE table via PostgREST. Without an explicit `.range()` the server applies
 * `db-max-rows` (1000 on Supabase) and returns a 200 with a truncated body — which for a
 * parity gate is the worst possible failure mode: every check would silently be measured
 * against the first 1000 rows and still report PASS.
 *
 * The caller must apply a TOTAL `.order(...)` on a unique column. Row order is otherwise
 * unspecified between requests, so successive ranges could overlap or skip rows.
 * The loop stops on the first short page; a final page that is exactly PAGE_SIZE long
 * costs one extra empty request, which is the cheap side of the trade.
 */
async function fetchAllPages<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Supabase ${label} query failed: ${error.message}`)
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return rows
  }
}

/** A sitemap index lists other sitemaps; a urlset lists pages. They are scraped alike. */
const isSitemapIndex = (xml: string) => /<sitemapindex[\s>]/i.test(xml)

const locHrefs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())

const locPathnames = (xml: string) => locHrefs(xml).map((href) => new URL(href).pathname)

/**
 * Fetches one sitemap document, or null when the route does not exist (404).
 *
 * Only 404 means "absent". Any other non-OK status throws, because a 5xx during shard
 * enumeration is a transient failure, and reading it as "no more shards" would silently
 * truncate the URL set — every URL in the unread shards would then be reported missing by
 * sitemap-superset. Same principle as fetchAllPages: a partial read is the worst failure
 * mode for a gate, because it still reports.
 */
async function fetchSitemapXmlIfPresent(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'user-agent': 'kinnso-parity' } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Sitemap fetch failed for ${url}: HTTP ${res.status}`)
  return res.text()
}

/** As above, but a missing document is itself an error: a shard named by an index must exist. */
async function fetchSitemapXml(url: string): Promise<string> {
  const xml = await fetchSitemapXmlIfPresent(url)
  if (xml === null) throw new Error(`Sitemap fetch failed for ${url}: HTTP 404`)
  return xml
}

/**
 * Only exists so a server that answers 200 to every /sitemap/<n>.xml cannot spin forever.
 * SITEMAP_CHUNK is 40,000 URLs per shard, so this bound is 4M URLs — far past any corpus
 * this gate will ever see. Hitting it throws rather than returning what was read so far.
 */
const MAX_SITEMAP_SHARDS = 100

/**
 * Walk /sitemap/0.xml, /sitemap/1.xml, … until one 404s. This is the shape apps/web
 * actually serves: generateSitemaps() produces the route /sitemap/[__metadata_id__] and
 * nothing at /sitemap.xml, so there is no index document to enumerate the shards for us.
 */
async function enumerateShardUrls(base: string): Promise<Set<string>> {
  const urls = new Set<string>()
  for (let i = 0; i < MAX_SITEMAP_SHARDS; i++) {
    const url = `${base}/sitemap/${i}.xml`
    const doc = await fetchSitemapXmlIfPresent(url)
    if (doc === null) {
      if (i === 0) {
        throw new Error(
          `Neither ${base}/sitemap.xml nor ${url} exists, so the new stack publishes no ` +
            'discoverable URLs. Reporting that as an empty site would make sitemap-superset ' +
            'call every expected URL missing, so it fails here instead.',
        )
      }
      return urls
    }
    if (isSitemapIndex(doc)) {
      throw new Error(`Sitemap shard ${url} is a sitemap index; nested indexes are not supported.`)
    }
    for (const path of locPathnames(doc)) urls.add(path)
  }
  throw new Error(
    `Stopped after ${MAX_SITEMAP_SHARDS} sitemap shards at ${base}. Either the corpus outgrew ` +
      'this bound or the server answers 200 to every /sitemap/<n>.xml; returning a partial set ' +
      'would under-report the site to sitemap-superset.',
  )
}

export function createNewStackSource(cfg: NewStackConfig): NewStackSource {
  const base = cfg.baseUrl.replace(/\/$/, '')
  const sb = createClient<Database>(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false } })
  const headers = { 'user-agent': 'kinnso-parity' }
  let cache: PublishedArticle[] | null = null

  async function publishedArticles(): Promise<PublishedArticle[]> {
    if (cache) return cache
    // RLS gates this to visible (published, not-expired, not-deleted) rows only.
    // `url` is unique per article, so ordering by it gives the total order paging needs.
    const data = await fetchAllPages('articles', (from, to) =>
      sb
        .from('articles')
        .select('url, category, is_coupon, article_translations(locale)')
        .order('url')
        .range(from, to))
    cache = data.map((a) => ({
      url: a.url,
      category: a.category as string,
      isCoupon: !!a.is_coupon,
      locales: ((a.article_translations ?? []) as Array<{ locale: string }>).map((t) => t.locale),
    }))
    return cache
  }

  return {
    publishedArticles,
    async localeCounts() {
      return tallyLocaleCounts(await publishedArticles())
    },
    async seoRedirects() {
      // `from_path` is the redirect's unique key — same total-order requirement as above.
      return await fetchAllPages('seo_redirects', (from, to) =>
        sb.from('seo_redirects').select('from_path, to_path').order('from_path').range(from, to))
    },
    async sitemapUrls() {
      // apps/web/app/sitemap.ts exports generateSitemaps(), so the only sitemap route Next
      // emits is /sitemap/[__metadata_id__], prerendered as /sitemap/0.xml. There is NO
      // /sitemap.xml — which is why apps/web/app/robots.ts advertises /sitemap/0.xml.
      //
      // This used to fetch /sitemap.xml unconditionally and scrape it. `.text()` on the 404
      // page yields zero <loc> matches, so it returned an EMPTY set and sitemap-superset
      // reported every expected URL missing. That phantom failure fires precisely at
      // cutover, when --legacy-mysql supplies the first production-sized expected set.
      //
      // /sitemap.xml is still tried first, and both document types are handled, so the gate
      // keeps working if an index is ever served there.
      const root = await fetchSitemapXmlIfPresent(`${base}/sitemap.xml`)
      if (root === null) return await enumerateShardUrls(base)
      if (!isSitemapIndex(root)) return new Set(locPathnames(root))

      const shards = locHrefs(root)
      if (shards.length === 0) {
        throw new Error(
          `${base}/sitemap.xml is a sitemap index with no shards. Treating that as "the site ` +
            'publishes nothing" would make sitemap-superset report every expected URL missing.',
        )
      }

      const urls = new Set<string>()
      for (const shard of shards) {
        // Sequential and fail-fast. A partial read is the worst outcome for a gate: every
        // URL in the unread shard would be reported missing. Same principle as fetchAllPages.
        const doc = await fetchSitemapXml(shard)
        if (isSitemapIndex(doc)) {
          throw new Error(`Sitemap shard ${shard} is itself an index; nested indexes are not supported.`)
        }
        for (const path of locPathnames(doc)) urls.add(path)
      }
      return urls
    },
    async status(path) {
      return (await fetch(`${base}${path}`, { redirect: 'manual', headers })).status
    },
    async html(path) {
      return await (await fetch(`${base}${path}`, { headers })).text()
    },
    async redirect(path) {
      const res = await fetch(`${base}${path}`, { redirect: 'manual', headers })
      return { status: res.status, location: res.headers.get('location') }
    },
  }
}
