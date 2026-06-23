import type { SinglePostResult } from './fetchers'

export type Confidence = 'verified_signal' | 'needs_review' | 'unavailable'

export function normalizeHandle(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase().replace(/^@/, '').replace(/\/+$/, '')
}

export function resolveConfidence(post: SinglePostResult | null, creatorHandle: string | null): Confidence {
  if (!post) return 'unavailable'
  const author = normalizeHandle(post.authorHandle)
  const expected = normalizeHandle(creatorHandle)
  if (author && expected && author === expected) return 'verified_signal'
  return 'needs_review'
}
