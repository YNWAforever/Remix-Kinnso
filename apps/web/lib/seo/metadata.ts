import type { Metadata } from 'next'
import { DEFAULT_LOCALE, type Locale, type UrlCategory } from '@/lib/i18n/config'

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.kinnso.ai'

export interface ArticleMetaInput {
  urlCategory: UrlCategory; url: string; locale: Locale; presentLocales: readonly Locale[]
  title: string | null; metaTitle: string | null; summary: string | null; metaDescription: string | null
  ogImage: string | null; publishedAt: string | null; editAt: string | null; isCoupon: boolean
}

const detailPath = (l: string, c: string, u: string) => `${SITE_URL}/${l}/articles/${c}/${u}`

export function buildArticleMetadata(i: ArticleMetaInput): Metadata {
  const heading = i.metaTitle ?? i.title ?? ''
  const description = (i.metaDescription && i.metaDescription.trim()) || i.summary || ''
  const canonical = detailPath(i.locale, i.urlCategory, i.url)

  const languages: Record<string, string> = {}
  for (const l of i.presentLocales) languages[l] = detailPath(l, i.urlCategory, i.url)
  languages['x-default'] = detailPath(DEFAULT_LOCALE, i.urlCategory, i.url)

  const index = !(i.isCoupon && i.locale === DEFAULT_LOCALE)

  return {
    title: `${heading} - Kinnso`,
    description,
    alternates: { canonical, languages },
    openGraph: {
      type: 'article', url: canonical, title: heading, description,
      images: i.ogImage ? [i.ogImage] : [],
      publishedTime: i.publishedAt ?? undefined,
      modifiedTime: i.editAt ?? i.publishedAt ?? undefined,
      locale: i.locale,
    },
    robots: { index, follow: true, 'max-image-preview': 'large' },
  }
}

export interface ListingMetaInput {
  urlCategory: UrlCategory | null; locale: Locale; presentLocales: readonly Locale[]; title: string
}

export function buildListingMetadata(i: ListingMetaInput): Metadata {
  const seg = i.urlCategory ? `/articles/${i.urlCategory}` : '/articles'
  const canonical = `${SITE_URL}/${i.locale}${seg}`
  const languages: Record<string, string> = {}
  for (const l of i.presentLocales) languages[l] = `${SITE_URL}/${l}${seg}`
  languages['x-default'] = `${SITE_URL}/${DEFAULT_LOCALE}${seg}`
  return {
    title: `${i.title} - Kinnso`,
    alternates: { canonical, languages },
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
  }
}
