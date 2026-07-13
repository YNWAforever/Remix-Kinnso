import { describe, expect, it } from 'vitest'
import { crawlSitemap } from '../../../scripts/crawl-sitemap'

const sitemapUrl = 'https://example.test/sitemap.xml'

function xmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/xml' },
  })
}

function pageResponse(status = 200, body = '<html>ok</html>') {
  return new Response(body, { status, headers: { 'content-type': 'text/html' } })
}

describe('crawlSitemap', () => {
  it('crawls every page listed by a flat urlset', async () => {
    const pageUrls = [
      'https://example.test/en/g/guide-one',
      'https://example.test/en/experiences/experience-one',
    ]
    const seen: string[] = []
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input, init) => {
        const url = String(input)
        seen.push(url)
        expect(init?.redirect).toBe('follow')
        if (url === sitemapUrl) {
          return xmlResponse(
            `<urlset>${pageUrls.map((pageUrl) => `<url><loc>${pageUrl}</loc></url>`).join('')}</urlset>`,
          )
        }
        return pageResponse()
      },
    })

    expect(result).toEqual({ checked: 2, failures: [] })
    expect(seen).toContain(sitemapUrl)
    expect(seen).toEqual(expect.arrayContaining(pageUrls))
  })

  it('recursively follows an indexed sitemap shard', async () => {
    const shardUrl = 'https://example.test/sitemap/0.xml'
    const pageUrl = 'https://example.test/en/g/shard-guide'
    const seen: string[] = []
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input, init) => {
        const url = String(input)
        seen.push(url)
        expect(init?.redirect).toBe('follow')
        if (url === sitemapUrl) return xmlResponse(`<sitemapindex><sitemap><loc>${shardUrl}</loc></sitemap></sitemapindex>`)
        if (url === shardUrl) return xmlResponse(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`)
        return pageResponse()
      },
    })

    expect(result).toEqual({ checked: 1, failures: [] })
    expect(seen).toContain(shardUrl)
    expect(seen).toContain(pageUrl)
  })

  it('de-duplicates sitemap shards and page URLs', async () => {
    const shardUrl = 'https://example.test/sitemap/0.xml'
    const pageUrl = 'https://example.test/en/g/repeated-guide'
    const seen: string[] = []
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input) => {
        const url = String(input)
        seen.push(url)
        if (url === sitemapUrl) {
          return xmlResponse(
            `<sitemapindex><sitemap><loc>${shardUrl}</loc></sitemap><sitemap><loc>${shardUrl}</loc></sitemap></sitemapindex>`,
          )
        }
        if (url === shardUrl) {
          return xmlResponse(
            `<urlset><url><loc>${pageUrl}</loc></url><url><loc>${pageUrl}</loc></url></urlset>`,
          )
        }
        return pageResponse()
      },
    })

    expect(result).toEqual({ checked: 1, failures: [] })
    expect(seen.filter((url) => url === shardUrl)).toHaveLength(1)
    expect(seen.filter((url) => url === pageUrl)).toHaveLength(1)
  })

  it('records a final 500 without exposing the response body', async () => {
    const pageUrl = 'https://example.test/en/g/broken-guide'
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input) => {
        if (String(input) === sitemapUrl) return xmlResponse(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`)
        return pageResponse(500, 'private response body')
      },
    })

    expect(result.checked).toBe(1)
    expect(result.failures).toEqual([{ url: pageUrl, status: 500 }])
    expect(JSON.stringify(result)).not.toContain('private response body')
  })

  it('flags a branded error shell returned with a successful status', async () => {
    const pageUrl = 'https://example.test/en/g/error-shell'
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input) => {
        if (String(input) === sitemapUrl) return xmlResponse(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`)
        return pageResponse(200, `<main><h1>We couldn't load this page</h1></main>`)
      },
    })

    expect(result.checked).toBe(1)
    expect(result.failures).toEqual([{ url: pageUrl, error: 'HtmlErrorShell' }])
  })

  it('records rejected fetches as NetworkError without the thrown message', async () => {
    const pageUrl = 'https://example.test/en/experiences/unreachable'
    const result = await crawlSitemap({
      baseUrl: 'https://example.test',
      fetchImpl: async (input) => {
        if (String(input) === sitemapUrl) return xmlResponse(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`)
        throw new Error('private socket details')
      },
    })

    expect(result.checked).toBe(1)
    expect(result.failures).toEqual([{ url: pageUrl, error: 'NetworkError' }])
    expect(JSON.stringify(result)).not.toContain('private socket details')
  })
})
