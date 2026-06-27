/** Truncate to `max` chars, appending an ellipsis (counted within `max`). */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

/** First `max` niches for the OG chip row. */
export function pickNiches(niches: string[], max = 3): string[] {
  return niches.slice(0, max)
}

/**
 * Returns a creator-supplied image URL only if it is safe to fetch server-side
 * from the OG route — must be https and NOT an internal/loopback/link-local host.
 * Blind-SSRF hardening: the guide OG card renders `<img src>` which satori fetches
 * on the server. Anything rejected falls back to the brand-color backdrop.
 */
export function safeImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return undefined
  }
  if (u.protocol !== 'https:') return undefined
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return undefined
  if (/^127\./.test(host)) return undefined // loopback
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return undefined // private
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return undefined // private 172.16-31
  if (/^169\.254\./.test(host)) return undefined // link-local + cloud metadata
  if (/^0\./.test(host)) return undefined
  return u.toString()
}
