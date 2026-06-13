import type { MetadataRoute } from 'next'
import { getPublishedForSitemap } from '@/lib/articles/queries'
import { LOCALES, URL_CATEGORIES, toUrlCategory } from '@/lib/i18n/config'
import { SITE_URL } from '@/lib/seo/metadata'

export const revalidate = 21600 // 6h

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rows = await getPublishedForSitemap()
  const out: MetadataRoute.Sitemap = []

  // hub + category pages per locale
  for (const l of LOCALES) {
    out.push({ url: `${SITE_URL}/${l}/articles`, changeFrequency: 'daily', priority: 0.6 })
    for (const c of URL_CATEGORIES) {
      out.push({ url: `${SITE_URL}/${l}/articles/${c}`, changeFrequency: 'daily', priority: 0.6 })
    }
  }

  // detail pages: present locales only
  for (const a of rows) {
    const c = toUrlCategory(a.category)
    if (!c) continue
    const lastModified = a.lastmod ? new Date(a.lastmod) : undefined
    for (const l of a.locales) {
      out.push({ url: `${SITE_URL}/${l}/articles/${c}/${a.url}`, lastModified, changeFrequency: 'weekly', priority: 0.8 })
    }
  }
  return out
}
