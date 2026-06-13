import { NextRequest, NextResponse } from 'next/server'
import { resolveRequest } from '@/lib/redirects/resolve'

// Module-level cache of the locale-agnostic seo_redirects map (cold-isolate refresh).
let cache: { map: Map<string, string>; at: number } | null = null
const TTL_MS = 60 * 60 * 1000 // 1h

async function getRedirects(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
  const map = new Map<string, string>()
  if (base && key) {
    try {
      const res = await fetch(`${base}/rest/v1/seo_redirects?select=from_path,to_path`, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
      })
      if (res.ok) for (const r of (await res.json()) as Array<{ from_path: string; to_path: string }>) {
        map.set(r.from_path, r.to_path)
      }
    } catch { /* non-fatal: fall back to locale-guard only */ }
  }
  cache = { map, at: Date.now() }
  return map
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const decision = resolveRequest(pathname, await getRedirects())
  if (decision.type === 'redirect') {
    const url = req.nextUrl.clone()
    url.pathname = decision.location
    url.search = decision.status === 301 ? '' : req.nextUrl.search
    return NextResponse.redirect(url, decision.status)
  }
  return NextResponse.next()
}

export const config = {
  // Skip api, next internals, metadata files, and anything with a file extension.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)'],
}
