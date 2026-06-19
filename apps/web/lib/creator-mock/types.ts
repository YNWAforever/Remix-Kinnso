// Typed contract for the creator-profile surfaces. Field names are lifted
// verbatim from redesign-kinnso-layout-only/src/mocks/{kinnso,creatorProfile}.ts
// and src/lib/matchScore.ts. The DNA *core* is the real @kinnso/scan `Dna`;
// everything here is the mock metrics overlay that the rich report needs but
// `Dna`/creator_dna does not capture.

// ─── Tier (kinnso.ts) ─────────────────────────────────────────
export type Tier = 'seed' | 'rising' | 'pro' | 'elite'

export interface TierMetaEntry {
  label: string
  scoreMin: number
  payout: string
  commission: string
  tone: string
}

// ─── Creator (kinnso.ts) ──────────────────────────────────────
export interface Creator {
  handle: string
  name: string
  homeCity: string
  category: string
  tier: Tier
  score: number
  guides: number
  avatar: string
}

// ─── Mission / Offer / EarningTx / TickerItem (kinnso.ts) ──────
export interface Mission {
  id: string
  merchant: string
  category: string
  title: string
  brief: string
  cities: string[]
  tier: Tier
  payout: number
  commission: number
  travelWindow: string
  deadline: string
  status: 'open' | 'in_progress' | 'completed' | 'expired'
}

export interface Offer {
  id: string
  merchant: string
  description: string
  commission: number
  tier: Tier
  category: string
  logo: string
}

export interface EarningTx {
  id: string
  type: 'mission_payout' | 'affiliate_commission'
  label: string
  amount: number
  currency: 'HKD'
  status: 'pending' | 'cleared' | 'paid_out'
  date: string
}

export interface TickerItem {
  handle: string
  amount: number
  label: string
  ago: string
}

// ─── CreatorPost / CreatorLocation / CreatorPlaceTag (creatorProfile.ts) ──
export interface CreatorPost {
  id: string
  creatorHandle: string
  platform: 'instagram' | 'threads' | 'youtube'
  postUrl: string
  thumbnail: string
  caption: string
  postedAt: string
  likes: number
  comments: number
  saves: number
  views: number
  isTravel: boolean
  city?: string
  placeName?: string
}

export interface CreatorLocation {
  creatorHandle: string
  city: string
  country: string // ISO-2
  countryName: string
  flag: string
  lat: number
  lon: number
  postCount: number
  firstVisited: string
  lastVisited: string
}

export interface CreatorPlaceTag {
  creatorHandle: string
  placeName: string
  placeType: 'restaurant' | 'hotel' | 'attraction' | 'neighbourhood' | 'cafe'
  city: string
  country: string
  source: 'geotag' | 'caption_ner' | 'vision' | 'hashtag'
  visitCount: number
  totalEngagement: number
}

export interface EngagementHistoryPoint {
  creatorHandle: string
  month: string // "Jan", "Feb", …
  dnaScore: number
  er: number // engagement rate ~0.03–0.11 (data.ts clamps to this range)
  posts: number
}

// ─── ExtendedCreator (creatorProfile.ts) ──────────────────────
export interface ExtendedCreator extends Creator {
  bio: string
  banner: string
  followerIg: number
  followerTh: number
  followerYt: number
  totalReach: number
  driven90dReach: number
  drivenGmv: number
  countries: number
  cities: number
  contentMix: { tag: string; pct: number; color: string }[]
  audience: { hk: number; tw: number; sg: number; other: number }
  topTags: { tag: string; weight: number }[]
  primaryAudienceCountry: 'HK' | 'TW' | 'SG' | 'JP' | 'Other'
  primaryAudiencePct: number
  er: number
  lastPostedAt: string
}

// ─── ScoreBreakdown (creatorProfile.ts) ───────────────────────
export interface ScoreBreakdown {
  reach: number
  er: number
  travel: number
  diversity: number
  recency: number
  total: number
}

// ─── Merchant profile — EXTENDED with tier + quotas (this slice) ──
// Base fields from creatorProfile.ts `merchantProfile`; the redesign typed it
// inline. We name it + add the Growth-tier quota fields the spec calls for.
export interface MerchantProfile {
  id: string
  name: string
  city: string
  country: string
  category: string
  // Narrowed to the keys that ExtendedCreator.audience actually tracks (hk/tw/sg).
  // 'JP' / 'Other' removed: neither maps to a real audience key, so they would
  // silently fall through to the c.audience.other default in computeMatch.
  primaryAudience: 'HK' | 'TW' | 'SG'
  budgetTier: Tier
  // NEW (Slice 1, mock UI-only — §8/§10 of the design spec):
  tier: 'free' | 'growth'
  searchesLeft: number
  searchLimit: number
  invitesLeft: number
  inviteLimit: number
}

// ─── Match scoring (matchScore.ts) ────────────────────────────
export interface MatchReason {
  key: 'city_overlap' | 'category_match' | 'tier_fit' | 'audience_fit'
  label: string
  icon: string
  value: number
}

// Reasons-as-object form the spec mandates ({ city_overlap, category_match,
// tier_fit, audience_fit }), alongside the ranked array the UI renders.
export interface MatchReasonBreakdown {
  city_overlap: number
  category_match: number
  tier_fit: number
  audience_fit: number
}

export interface MatchResult {
  score: number // 0–100
  reasons: MatchReasonBreakdown
  reasonList: MatchReason[]
}

// ─── Working-with shorthand (creatorProfile.ts) ───────────────
export interface MerchantWorkingWith {
  handle: string
  missionTitle: string
  status: 'in_progress' | 'delivered' | 'completed'
}

// ─── Guide (kinnso.ts — cross-phase reconciliation) ───────────
// Consumed by Phase 2A GuideCard and Phase 4 CreatorProfileView.
export interface Guide {
  slug: string
  title: string
  cover: string
  city: string
  saves: number
  creatorHandle: string
}

export interface FeedItem {
  id: string
  creatorHandle: string
  creatorName: string
  avatar: string
  image: string
  caption: string
  city: string
  saves: number
  postedAgo: string
}
