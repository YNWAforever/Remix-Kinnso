import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAdminOverview } from '@/lib/admin/queries'
import { AdminDashboardView } from '@/components/kinnso/admin/AdminDashboardView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function AdminDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)
  const supabase = await createSupabaseServerClient()
  const overview = await getAdminOverview(supabase)
  return <AdminDashboardView t={messages.admin} overview={overview} />
}
