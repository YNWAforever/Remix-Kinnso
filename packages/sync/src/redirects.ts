import type { SeoRedirect } from './types'

// Matches: Route::redirectI18n('/from', '/to'[, 301]);  (single or double quotes)
const RE = /redirectI18n\(\s*(['"])(.*?)\1\s*,\s*(['"])(.*?)\3\s*(?:,\s*(\d{3}))?\s*\)/g

export function parseRedirectsPhp(php: string): SeoRedirect[] {
  const out: SeoRedirect[] = []
  for (const m of php.matchAll(RE)) {
    out.push({ from_path: m[2], to_path: m[4], status_code: m[5] ? Number(m[5]) : 301 })
  }
  return out
}
