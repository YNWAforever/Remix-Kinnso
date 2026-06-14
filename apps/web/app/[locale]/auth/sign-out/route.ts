import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isLocale, DEFAULT_LOCALE } from '@/lib/i18n/config'

/**
 * GET /[locale]/auth/sign-out
 *
 * Signs the current user out and redirects to the sign-in page.
 * Using GET (not POST) keeps it linkable from server-rendered HTML
 * (a plain <a> tag works; no JS form required). The Supabase session
 * cookie is cleared server-side, so the proxy gate will block
 * subsequent requests to /creator/* immediately.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: rawLocale } = await params
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE

  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()

  return NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url))
}
