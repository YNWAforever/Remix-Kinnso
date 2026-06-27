import type { Metadata } from 'next'
import { DEFAULT_LOCALE, LOCALES, type Locale, type UrlCategory } from '@/lib/i18n/config'

export const OG_LOCALE: Record<Locale, string> = {
  en: 'en_US', 'zh-hk': 'zh_HK', 'zh-tw': 'zh_TW', 'zh-cn': 'zh_CN', ja: 'ja_JP', ko: 'ko_KR', th: 'th_TH',
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.kinnso.ai'

const abs = (l: string, path: string) => `${SITE_URL}/${l}${path}` // path is '' or starts with '/'

/**
 * URL of the branded default OG card (the `[locale]/opengraph-image` file-convention
 * route). Marketing pages are child segments that define their own `openGraph`, which
 * replaces the inherited card, so they must reference this explicitly. Single place to
 * update if that route ever moves. (Guide/creator pages have their own colocated
 * opengraph-image route and don't use this.)
 */
export const defaultOgImagePath = (locale: Locale): string => abs(locale, '/opengraph-image')

/** canonical (current locale) + hreflang map (given locales) + x-default → DEFAULT_LOCALE. */
function hreflangFor(pathFor: (l: Locale) => string, current: Locale, locales: readonly Locale[]) {
  const languages: Record<string, string> = {}
  for (const l of locales) languages[l] = pathFor(l)
  languages['x-default'] = pathFor(DEFAULT_LOCALE)
  return { canonical: pathFor(current), languages }
}

// ---------- Articles (existing surface; refactored to bare titles via hreflangFor) ----------

export interface ArticleMetaInput {
  urlCategory: UrlCategory; url: string; locale: Locale; presentLocales: readonly Locale[]
  title: string | null; metaTitle: string | null; summary: string | null; metaDescription: string | null
  ogImage: string | null; publishedAt: string | null; editAt: string | null; isCoupon: boolean
}

const articlePath = (l: string, c: string, u: string) => abs(l, `/articles/${c}/${u}`)

export function buildArticleMetadata(i: ArticleMetaInput): Metadata {
  const heading = i.metaTitle ?? i.title ?? ''
  const description = (i.metaDescription && i.metaDescription.trim()) || i.summary || ''
  const { canonical, languages } = hreflangFor((l) => articlePath(l, i.urlCategory, i.url), i.locale, i.presentLocales)
  const index = !(i.isCoupon && i.locale === DEFAULT_LOCALE)
  return {
    title: heading,
    description,
    alternates: { canonical, languages },
    openGraph: {
      type: 'article', url: canonical, title: heading, description,
      images: i.ogImage ? [i.ogImage] : [],
      publishedTime: i.publishedAt ?? undefined,
      modifiedTime: i.editAt ?? i.publishedAt ?? undefined,
      locale: OG_LOCALE[i.locale],
    },
    robots: { index, follow: true, 'max-image-preview': 'large' },
  }
}

export interface ListingMetaInput {
  urlCategory: UrlCategory | null; locale: Locale; presentLocales: readonly Locale[]; title: string
}

export function buildListingMetadata(i: ListingMetaInput): Metadata {
  const seg = i.urlCategory ? `/articles/${i.urlCategory}` : '/articles'
  const { canonical, languages } = hreflangFor((l) => abs(l, seg), i.locale, i.presentLocales)
  return {
    title: i.title,
    alternates: { canonical, languages },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
  }
}

// ---------- New: marketing pages, guides, creators, noindex ----------

export interface PageMetaInput {
  path: string; locale: Locale; title: string; description: string
  type?: 'website' | 'article' | 'profile'
}

export function buildPageMetadata(i: PageMetaInput): Metadata {
  const { canonical, languages } = hreflangFor((l) => abs(l, i.path), i.locale, LOCALES)
  const ogImage = defaultOgImagePath(i.locale)
  return {
    title: i.title,
    description: i.description,
    alternates: { canonical, languages },
    openGraph: {
      type: i.type ?? 'website', url: canonical, title: i.title, description: i.description,
      siteName: 'KINNSO', locale: OG_LOCALE[i.locale], images: [ogImage],
    },
    twitter: { card: 'summary_large_image', title: i.title, description: i.description, images: [ogImage] },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
  }
}

export function buildGuideMetadata(i: { slug: string; locale: Locale; title: string; description: string }): Metadata {
  const { canonical, languages } = hreflangFor((l) => abs(l, `/g/${i.slug}`), i.locale, LOCALES)
  return {
    title: i.title,
    description: i.description,
    alternates: { canonical, languages },
    openGraph: {
      type: 'article', url: canonical, title: i.title, description: i.description,
      siteName: 'KINNSO', locale: OG_LOCALE[i.locale],
    },
    twitter: { card: 'summary_large_image', title: i.title, description: i.description },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
  }
}

export function buildCreatorMetadata(i: { handle: string; locale: Locale; name: string; bio: string }): Metadata {
  const title = `${i.name} (@${i.handle})`
  const description = i.bio || `Travel creator @${i.handle} on KINNSO.`
  const { canonical, languages } = hreflangFor((l) => abs(l, `/c/${i.handle}`), i.locale, LOCALES)
  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      type: 'profile', url: canonical, title, description,
      siteName: 'KINNSO', locale: OG_LOCALE[i.locale],
    },
    twitter: { card: 'summary_large_image', title, description },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
  }
}

export function noindexMetadata(title?: string): Metadata {
  return { ...(title ? { title } : {}), robots: { index: false, follow: false } }
}
