import { notFound } from 'next/navigation'
import { AdminAnalyticsView } from '@/components/kinnso/admin/analytics/AdminAnalyticsView'
import { filterAnalyticsRows, parseAnalyticsDashboardFilters, toAnalyticsReportWindow } from '@/lib/admin/analytics-dashboard'
import { getTravellerAnalyticsReport } from '@/lib/admin/analytics-queries'
import { requireOpsPage } from '@/lib/admin/guard'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function AdminAnalyticsPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ locale: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const filters = parseAnalyticsDashboardFilters(await searchParams)
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)

  try {
    const report = await getTravellerAnalyticsReport(supabase, toAnalyticsReportWindow(filters))
    return <AdminAnalyticsView locale={loc} t={messages.admin} filters={filters} report={{ ...report, rows: filterAnalyticsRows(report.rows, filters) }} error={null} />
  } catch {
    return <AdminAnalyticsView locale={loc} t={messages.admin} filters={filters} report={null} error="unavailable" />
  }
}
