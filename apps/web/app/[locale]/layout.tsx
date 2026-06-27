import '../globals.css'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, htmlLang, LOCALES, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { SiteChrome } from '@/components/kinnso/SiteChrome'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL, OG_LOCALE } from '@/lib/seo/metadata'
import { organizationJsonLd, websiteJsonLd } from '@/lib/seo/jsonld'
import { fontVariables } from '../layout'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const loc = locale as Locale
  const dict = await getDictionary(loc)
  const languages: Record<string, string> = {}
  for (const l of LOCALES) languages[l] = `${SITE_URL}/${l}`
  languages['x-default'] = `${SITE_URL}/${DEFAULT_LOCALE}`
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: dict.seo.brandTitle, template: '%s · KINNSO' },
    description: dict.seo.brandDescription,
    alternates: { canonical: `${SITE_URL}/${loc}`, languages },
    openGraph: { type: 'website', siteName: 'KINNSO', locale: OG_LOCALE[loc] },
    twitter: { card: 'summary_large_image' },
  }
}

export default async function LocaleLayout({
  children, params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)
  const ld = [
    organizationJsonLd({ url: SITE_URL, logo: `${SITE_URL}/favicon.ico` }),
    websiteJsonLd({
      url: `${SITE_URL}/${loc}`, locale: htmlLang(loc),
      searchUrlTemplate: `${SITE_URL}/${loc}/articles?q={search_term_string}`,
    }),
  ]
  return (
    <html lang={htmlLang(loc)} className={`h-full antialiased ${fontVariables}`}>
      <body className="min-h-full flex flex-col font-sans bg-cream text-ink">
        <JsonLd data={ld} />
        <SiteChrome locale={loc} nav={messages.nav} footer={messages.footer}>
          {children}
        </SiteChrome>
      </body>
    </html>
  )
}
