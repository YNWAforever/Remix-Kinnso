import { notFound, permanentRedirect } from 'next/navigation'
import { isLocale } from '@/lib/i18n/config'

// R2B: the merchant app moved under /merchants/dashboard/* (design spec D-R2-5).
// In-repo 308 stub — deterministic, testable, no seo_redirects DB dependency.
export default async function LegacyMerchantPostPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  permanentRedirect(`/${locale}/merchants/dashboard/post`)
}
