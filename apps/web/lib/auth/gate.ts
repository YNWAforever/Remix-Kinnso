import { LOCALES } from '@/lib/i18n/config'

export type GateDecision =
  | { type: 'allow' }
  | { type: 'redirect'; location: string }

/**
 * Pure function — given a pathname and whether a session exists,
 * decide whether to allow the request or redirect to sign-in.
 *
 * Matches locale-prefixed paths that require a signed-in viewer.
 * Paths without a recognised locale prefix are always allowed (the
 * locale guard in proxy.ts will add the prefix first).
 *
 * @param pathname  The full request pathname (e.g. "/en/creator/settings")
 * @param hasSession  Whether a valid Supabase session exists for this request
 */
export function gateDecision(pathname: string, hasSession: boolean): GateDecision {
  // Parse locale from the first path segment.
  const parts = pathname.split('/')  // ['', 'en', 'creator', ...]
  const maybeLocale = parts[1] ?? ''

  // Only gate paths that start with a known locale.
  if (!(LOCALES as readonly string[]).includes(maybeLocale)) {
    return { type: 'allow' }
  }

  const rest = parts.slice(2).join('/')  // 'creator' | 'creator/settings' | 'articles' | ...

  const gatedPrefixes = [
    'creator',
    'creator/',
    'merchants/post',
    'merchants/missions',
    'merchants/missions/',
    'studio/missions',
    'ops/settlements',
  ]
  const needsAuth = gatedPrefixes.some((prefix) =>
    rest === prefix || rest.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`),
  )

  if (needsAuth) {
    if (hasSession) return { type: 'allow' }
    return { type: 'redirect', location: `/${maybeLocale}/sign-in` }
  }

  return { type: 'allow' }
}
