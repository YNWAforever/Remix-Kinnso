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

export function createNewStackSource(cfg: NewStackConfig): NewStackSource {
  const base = cfg.baseUrl.replace(/\/$/, '')
  const sb = createClient<Database>(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false } })
  const headers = { 'user-agent': 'kinnso-parity' }
  let cache: PublishedArticle[] | null = null

  async function publishedArticles(): Promise<PublishedArticle[]> {
    if (cache) return cache
    // RLS gates this to visible (published, not-expired, not-deleted) rows only.
    const { data, error } = await sb.from('articles').select('url, category, is_coupon, article_translations(locale)')
    if (error) throw new Error(`Supabase articles query failed: ${error.message}`)
    cache = (data ?? []).map((a) => ({
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
      const { data, error } = await sb.from('seo_redirects').select('from_path, to_path')
      if (error) throw new Error(`Supabase seo_redirects query failed: ${error.message}`)
      return data ?? []
    },
    async sitemapUrls() {
      const xml = await (await fetch(`${base}/sitemap.xml`, { headers })).text()
      return new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname))
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
