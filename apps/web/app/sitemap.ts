import type { MetadataRoute } from 'next'
import { getPublishedForSitemap } from '@/lib/articles/queries'
import { getGuidesForSitemap } from '@/lib/guides/queries'
import { getCreatorsForSitemap } from '@/lib/creators/queries'
import { LOCALES, URL_CATEGORIES, toUrlCategory } from '@/lib/i18n/config'
import { SITE_URL } from '@/lib/seo/metadata'

export const revalidate = 21600 // 6h

const MARKETING_PATHS = ['', '/explore', '/creators', '/agent', '/about', '/contact', '/merchants', '/legal/creator-terms']

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, guides, creators] = await Promise.all([
    getPublishedForSitemap(), getGuidesForSitemap(), getCreatorsForSitemap(),
  ])
  const out: MetadataRoute.Sitemap = []

  // marketing + articles hub/category per locale
  for (const l of LOCALES) {
    for (const p of MARKETING_PATHS) {
      out.push({ url: `${SITE_URL}/${l}${p}`, changeFrequency: 'weekly', priority: p === '' ? 0.8 : 0.5 })
    }
    out.push({ url: `${SITE_URL}/${l}/articles`, changeFrequency: 'daily', priority: 0.6 })
    for (const c of URL_CATEGORIES) {
      out.push({ url: `${SITE_URL}/${l}/articles/${c}`, changeFrequency: 'daily', priority: 0.6 })
    }
  }

  // article detail: present locales only
  for (const a of articles) {
    const c = toUrlCategory(a.category)
    if (!c) continue
    const lastModified = a.lastmod ? new Date(a.lastmod) : undefined
    for (const l of a.locales) {
      out.push({ url: `${SITE_URL}/${l}/articles/${c}/${a.url}`, lastModified, changeFrequency: 'weekly', priority: 0.8 })
    }
  }

  // guides + creators: single-language content under every locale prefix (self-canonical + page-head hreflang)
  for (const g of guides) {
    const lastModified = g.lastmod ? new Date(g.lastmod) : undefined
    for (const l of LOCALES) {
      out.push({ url: `${SITE_URL}/${l}/g/${g.slug}`, lastModified, changeFrequency: 'weekly', priority: 0.7 })
    }
  }
  for (const cr of creators) {
    const lastModified = cr.lastmod ? new Date(cr.lastmod) : undefined
    for (const l of LOCALES) {
      out.push({ url: `${SITE_URL}/${l}/c/${cr.handle}`, lastModified, changeFrequency: 'weekly', priority: 0.6 })
    }
  }
  return out
}
