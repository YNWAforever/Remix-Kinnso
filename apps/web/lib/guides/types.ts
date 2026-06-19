import type { Guide } from '@/lib/creator-mock'

/** Raw form input from the GuideForm. */
export interface GuideInput {
  title: string
  city: string
  coverUrl: string
  summary: string
}

/** A row in the My-guides list (owner view). */
export interface GuideListItem {
  id: string
  slug: string
  title: string
  city: string
  cover: string
  status: 'draft' | 'published'
}

/** Detail-page shape: the public Guide plus detail-only fields. */
export interface GuideDetail extends Guide {
  summary: string | null
  creatorName: string | null
  source: 'db' | 'mock'
}
