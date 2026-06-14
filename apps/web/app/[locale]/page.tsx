import { notFound, redirect } from 'next/navigation'
import { isLocale } from '@/lib/i18n/config'

// The locale root has no content of its own — the articles experience lives at
// /{locale}/articles. Redirect there so the bare domain (/) -> /{locale} (proxy
// locale guard) -> /{locale}/articles resolves to a real page instead of a 404.
export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  redirect(`/${locale}/articles`)
}
