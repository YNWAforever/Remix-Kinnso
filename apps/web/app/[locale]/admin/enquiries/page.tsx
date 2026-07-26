import { notFound } from 'next/navigation'
import { AdminEnquiriesView } from '@/components/kinnso/admin/AdminEnquiriesView'
import { requireOpsPage } from '@/lib/admin/guard'
import { setEnquiryStatusAction } from '@/lib/admin/enquiries-actions'
import { listAdminEnquiries, type EnquiryStatusFilter, type EnquiryTypeFilter } from '@/lib/admin/enquiries-queries'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function queueFilters(searchParams: Record<string, string | string[] | undefined>) {
  const statusValue = first(searchParams.status)
  const typeValue = first(searchParams.type)
  const status: EnquiryStatusFilter = statusValue === 'resolved' || statusValue === 'spam' ? statusValue : 'active'
  const type: EnquiryTypeFilter = typeValue === 'creator_collab' || typeValue === 'merchant_contact' ? typeValue : 'all'
  return { status, type }
}

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function AdminEnquiriesPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ locale: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const filters = queueFilters(await searchParams)
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const enquiries = await listAdminEnquiries(supabase, filters)

  async function onSetStatus(id: string, status: 'new' | 'in_progress' | 'resolved' | 'spam', reason: string) {
    'use server'
    return setEnquiryStatusAction(loc, id, status, reason)
  }

  return <AdminEnquiriesView locale={loc} t={messages.enquiriesAdmin} enquiries={enquiries} filters={filters} onSetStatus={onSetStatus} />
}
