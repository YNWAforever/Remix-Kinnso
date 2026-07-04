import { headers } from 'next/headers'

/**
 * Best-effort caller IP for rate limiting. Vercel sets `x-forwarded-for`; the
 * first entry is the original client. Falls back to a fixed key when absent
 * (e.g. local dev without a proxy in front) so the rate limiter still
 * functions, just shared across all local requests in that case.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers()
  const forwardedFor = h.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  const realIp = h.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}
