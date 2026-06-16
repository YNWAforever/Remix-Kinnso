import '../globals.css'
import { notFound } from 'next/navigation'
import { isLocale, htmlLang, LOCALES, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { SiteChrome } from '@/components/kinnso/SiteChrome'
import { fontVariables } from '../layout'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children, params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  return (
    <html lang={htmlLang(locale as Locale)} className={`h-full antialiased ${fontVariables}`}>
      <body className="min-h-full flex flex-col font-sans bg-cream text-ink">
        <SiteChrome locale={locale as Locale} nav={messages.nav} footer={messages.footer}>
          {children}
        </SiteChrome>
      </body>
    </html>
  )
}
