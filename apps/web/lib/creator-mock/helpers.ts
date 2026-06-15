import {
  extendedCreators,
  creatorLocations,
  merchantProfile,
} from './data'
import type {
  ExtendedCreator,
  ScoreBreakdown,
  MerchantProfile,
  MatchResult,
  MatchReason,
} from './types'

// ─── getCreator (creatorProfile.ts, verbatim) ─────────────────
export function getCreator(handle: string): ExtendedCreator | undefined {
  return extendedCreators.find((c) => c.handle === handle)
}

// ─── computeBreakdown (creatorProfile.ts, verbatim math) ──────
export function computeBreakdown(c: ExtendedCreator): ScoreBreakdown {
  const MAX = 1_000_000
  const erNorm = Math.min(c.er / 0.12, 1)
  const travelShare = 0.68 // fixed mock placeholder — carried verbatim from the source matchScore mock; does not vary per creator
  const countryDiv = Math.min(1, c.countries / 10)
  const recency = 0.71 // fixed mock placeholder — carried verbatim from the source matchScore mock; does not vary per creator
  const reach = (30 * Math.log(Math.max(2, c.totalReach))) / Math.log(MAX)
  const er = 25 * erNorm
  const travel = 20 * travelShare
  const diversity = 15 * countryDiv
  const rec = 10 * recency
  return {
    reach: +reach.toFixed(1),
    er: +er.toFixed(1),
    travel: +travel.toFixed(1),
    diversity: +diversity.toFixed(1),
    recency: +rec.toFixed(1),
    total: +(reach + er + travel + diversity + rec).toFixed(1),
  }
}

// ─── computeMatch (matchScore.ts, verbatim math) ──────────────
const CATEGORY_AFFINITY: Record<string, string[]> = {
  Hotels: ['Hotels', 'City Walk', 'Wellness', 'Photography'],
  Food: ['Food', 'Coffee', 'City Walk'],
  Activities: ['Family', 'City Walk', 'Photography'],
  eSIM: ['City Walk', 'Photography', 'Hotels', 'Food', 'Family', 'Coffee'],
}

export function computeMatch(
  c: ExtendedCreator,
  m: MerchantProfile = merchantProfile,
): MatchResult {
  // 1. City overlap (0–40)
  const creatorCities = creatorLocations
    .filter((l) => l.creatorHandle === c.handle)
    .map((l) => l.city)
  const cityHit = creatorCities.find((x) => x.toLowerCase() === m.city.toLowerCase())
  const cityOverlap = cityHit ? 40 : creatorCities.length > 0 ? 12 : 0

  // 2. Category match (0–30)
  const wanted = CATEGORY_AFFINITY[m.category] ?? [m.category]
  const categoryMatch = wanted.includes(c.category) ? 30 : 12

  // 3. Tier fit (0–20)
  const tierFit = c.score >= 80 ? 20 : c.score >= 70 ? 14 : 8

  // 4. Audience fit (0–10)
  const targetCountryKey = m.primaryAudience.toLowerCase() as keyof typeof c.audience
  const pct = c.audience[targetCountryKey] ?? c.audience.other // defensive-only: unreachable for a type-legal primaryAudience ('HK'|'TW'|'SG')
  const audienceFit = pct >= 40 ? 10 : pct >= 25 ? 7 : 4

  const reasonList: MatchReason[] = []
  if (cityHit) reasonList.push({ key: 'city_overlap', label: `Covers ${cityHit}`, icon: '🏙', value: cityOverlap })
  if (categoryMatch >= 30) reasonList.push({ key: 'category_match', label: `${c.category} creator`, icon: '🎯', value: categoryMatch })
  reasonList.push({ key: 'tier_fit', label: `${c.tier.charAt(0).toUpperCase() + c.tier.slice(1)} tier`, icon: '📊', value: tierFit })
  if (pct >= 25) reasonList.push({ key: 'audience_fit', label: `${pct}% ${m.primaryAudience} audience`, icon: '👥', value: audienceFit })

  return {
    score: cityOverlap + categoryMatch + tierFit + audienceFit,
    reasons: {
      city_overlap: cityOverlap,
      category_match: categoryMatch,
      tier_fit: tierFit,
      audience_fit: audienceFit,
    },
    reasonList,
  }
}
