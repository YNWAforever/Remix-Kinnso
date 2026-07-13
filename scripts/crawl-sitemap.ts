import { pathToFileURL } from 'node:url'

const DEFAULT_BASE_URL = 'https://remix-kinnso-web.vercel.app'
const LOC_PATTERN = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi
const DETAIL_ERROR_TITLES = [
  "We couldn't load this page",
  '暫時未能載入此頁面',
  '暫時無法載入此頁面',
  '暂时无法加载此页面',
  'ไม่สามารถโหลดหน้านี้ได้',
  '페이지를 불러올 수 없습니다',
  'このページを読み込めませんでした',
]

export type CrawlFailure = {
  url: string
  status?: number
  error?: string
}

export type CrawlSitemapOptions = {
  baseUrl: string
  fetchImpl?: typeof fetch
  concurrency?: number
}

export type CrawlSitemapResult = {
  /** Number of page URLs listed by the sitemap that were requested. */
  checked: number
  failures: CrawlFailure[]
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim()
}

function extractLocs(xml: string): string[] {
  const locs: string[] = []
  for (const match of xml.matchAll(LOC_PATTERN)) {
    const loc = decodeXml(match[1] ?? '')
    if (loc) locs.push(loc)
  }
  return locs
}

function resolveUrl(value: string, parentUrl: string): string {
  try {
    return new URL(value, parentUrl).href
  } catch {
    return value
  }
}

function sitemapUrlFor(baseUrl: string): string {
  const normalized = baseUrl.trim()
  if (/\/sitemap(?:\/\d+)?\.xml(?:[?#].*)?$/i.test(normalized)) return normalized
  return new URL('/sitemap.xml', normalized).href
}

function networkFailure(url: string): CrawlFailure {
  // Keep transport details (which can include request metadata) out of logs.
  return { url, error: 'NetworkError' }
}

function isBrandedErrorShell(body: string): boolean {
  const normalized = body
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
  return DETAIL_ERROR_TITLES.some((title) => normalized.includes(title.toLocaleLowerCase()))
}

/**
 * Fetch the sitemap index/shards, then request each page URL listed by them.
 * Sitemap documents are visited once and page URLs are de-duplicated before the
 * bounded worker pool checks their final response status.
 */
export async function crawlSitemap({
  baseUrl,
  fetchImpl = fetch,
  concurrency = 8,
}: CrawlSitemapOptions): Promise<CrawlSitemapResult> {
  const failures: CrawlFailure[] = []
  const visitedSitemaps = new Set<string>()
  const pageUrls = new Set<string>()
  const rootSitemap = sitemapUrlFor(baseUrl)

  const visitSitemap = async (url: string): Promise<void> => {
    if (visitedSitemaps.has(url)) return
    visitedSitemaps.add(url)

    let response: Response
    try {
      response = await fetchImpl(url, { redirect: 'follow' })
    } catch {
      failures.push(networkFailure(url))
      return
    }

    if (response.status >= 400) {
      failures.push({ url, status: response.status })
      return
    }

    let xml: string
    try {
      xml = await response.text()
    } catch {
      failures.push(networkFailure(url))
      return
    }

    const locs = extractLocs(xml)
    const isSitemapIndex = /<sitemapindex\b/i.test(xml)
    const isUrlset = /<urlset\b/i.test(xml)

    if (isSitemapIndex) {
      await Promise.all(locs.map((loc) => visitSitemap(resolveUrl(loc, url))))
      return
    }

    if (isUrlset) {
      for (const loc of locs) pageUrls.add(resolveUrl(loc, url))
      return
    }

    // Be tolerant of valid XML with no namespace/root marker while preserving
    // the sitemap protocol's conventional .xml shard naming.
    const nestedSitemaps: string[] = []
    for (const loc of locs) {
      const resolved = resolveUrl(loc, url)
      if (/\.xml(?:$|[?#])/i.test(resolved)) nestedSitemaps.push(resolved)
      else pageUrls.add(resolved)
    }
    await Promise.all(nestedSitemaps.map((nested) => visitSitemap(nested)))
  }

  await visitSitemap(rootSitemap)

  const pages = [...pageUrls]
  const requestedConcurrency = Number.isFinite(concurrency) ? Math.floor(concurrency) : 8
  const workerCount = Math.min(Math.max(1, requestedConcurrency), pages.length || 1)
  let cursor = 0
  const pageFailures: Array<CrawlFailure | undefined> = new Array(pages.length)

  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++
      if (index >= pages.length) return
      const url = pages[index]
      try {
        const response = await fetchImpl(url, { redirect: 'follow' })
        if (response.status >= 400) pageFailures[index] = { url, status: response.status }
        else {
          let body: string
          try {
            body = await response.text()
          } catch {
            pageFailures[index] = networkFailure(url)
            continue
          }
          if (isBrandedErrorShell(body)) pageFailures[index] = { url, error: 'HtmlErrorShell' }
        }
      } catch {
        pageFailures[index] = networkFailure(url)
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  failures.push(...pageFailures.filter((failure): failure is CrawlFailure => Boolean(failure)))

  return { checked: pages.length, failures }
}

async function runCli(): Promise<void> {
  const result = await crawlSitemap({ baseUrl: process.env.BASE_URL ?? DEFAULT_BASE_URL })
  console.log(`Checked ${result.checked} sitemap URLs`)
  for (const failure of result.failures) {
    const detail = failure.status === undefined ? failure.error ?? 'Failed' : String(failure.status)
    console.error(`${failure.url} ${detail}`)
  }
  if (result.failures.length > 0) process.exitCode = 1
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void runCli()
}
