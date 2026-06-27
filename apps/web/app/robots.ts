import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/metadata'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: [
        '/*/studio', '/*/admin', '/*/ops',
        '/*/sign-in', '/*/sign-up', '/*/creator$',
        '/*/merchants/post', '/*/merchants/missions', '/*/merchants/creators', '/*/merchants/insights',
      ],
    }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
