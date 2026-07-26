import { notFound } from 'next/navigation'
import { AdminEnquiriesView } from '@/components/kinnso/admin/AdminEnquiriesView'
import { requireOpsPage } from '@/lib/admin/guard'
import { setEnquiryStatusAction } from '@/lib/admin/enquiries-actions'
import { listAdminEnquiries, type AdminEnquiryCursor, type EnquiryStatusFilter, type EnquiryTypeFilter } from '@/lib/admin/enquiries-queries'
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

function queueCursor(searchParams: Record<string, string | string[] | undefined>): AdminEnquiryCursor | null {
  const createdAt = searchParams.cursorCreatedAt
  const id = searchParams.cursorId
  if (typeof createdAt !== 'string' || typeof id !== 'string' || !ISO_TIMESTAMP.test(createdAt) || !UUID.test(id) || Number.isNaN(Date.parse(createdAt))) return null
  return { createdAt, id }
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
  const rawSearchParams = await searchParams
  const filters = queueFilters(rawSearchParams)
  const cursor = queueCursor(rawSearchParams)
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const result = await listAdminEnquiries(supabase, filters, cursor)
  const enquiries = result.slice(0, 25)
  const lastVisible = enquiries.at(-1)
  const nextCursor = result.length > 25 && lastVisible ? { createdAt: lastVisible.createdAt, id: lastVisible.id } : null

  async function onSetStatus(id: string, status: 'new' | 'in_progress' | 'resolved' | 'spam', reason: string) {
    'use server'
    return setEnquiryStatusAction(loc, id, status, reason)
  }

  return <AdminEnquiriesView locale={loc} t={messages.enquiriesAdmin} enquiries={enquiries} filters={filters} nextCursor={nextCursor} onSetStatus={onSetStatus} />
}