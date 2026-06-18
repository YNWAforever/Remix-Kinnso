import { redirect } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import type { RouteHostProps } from '../../_routeHost'

export { generateStaticParams } from '../../_routeHost'

export default async function CreatorApplyPage({ params }: RouteHostProps) {
  const { locale } = await params
  redirect(`/${isLocale(locale) ? (locale as Locale) : 'en'}/creator`)
}
