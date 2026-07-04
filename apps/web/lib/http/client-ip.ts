import { headers } from 'next/headers'

/**
 * Best-effort caller IP for rate limiting — not a security boundary
 * (`x-forwarded-for` is client-spoofable without a trusted proxy validating
 * it; anti-abuse throttling only, Stripe enforces the real financial
 * guardrails downstream). Vercel sets `x-forwarded-for`; the first entry is
 * the original client. Falls back to a fixed `'unknown'` key when both
 * headers are absent, so the rate limiter still functions rather than
 * throwing — but in production this would mean every such caller shares one
 * rate-limit bucket and could false-positive-block each other; acceptable
 * only because Vercel is expected to always set `x-forwarded-for`.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers()
  const forwardedFor = h.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  const realIp = h.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}
