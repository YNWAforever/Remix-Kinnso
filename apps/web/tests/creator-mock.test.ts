import { describe, it, expect } from 'vitest'
import { DnaSchema } from '@kinnso/scan'
import {
  getCreator,
  computeMatch,
  computeBreakdown,
  merchantProfile,
  extendedCreators,
  creatorLocations,
  sampleDna,
} from '@/lib/creator-mock'

describe('getCreator', () => {
  it('returns a known creator by handle', () => {
    const c = getCreator('maywanders')
    expect(c).toBeDefined()
    expect(c?.name).toBe('Maya Wong')
    expect(c?.handle).toBe('maywanders')
    expect(c?.tier).toBe('pro')
  })

  it('returns undefined for an unknown handle', () => {
    expect(getCreator('nobody')).toBeUndefined()
  })
})

describe('computeMatch', () => {
  it('reasons object sums to the score', () => {
    const c = getCreator('maywanders')!
    const m = computeMatch(c)
    const { city_overlap, category_match, tier_fit, audience_fit } = m.reasons
    expect(city_overlap + category_match + tier_fit + audience_fit).toBe(m.score)
  })

  it('every creator: reasons sum equals score and score is 0–100', () => {
    for (const c of extendedCreators) {
      const m = computeMatch(c)
      const sum =
        m.reasons.city_overlap +
        m.reasons.category_match +
        m.reasons.tier_fit +
        m.reasons.audience_fit
      expect(sum).toBe(m.score)
      expect(m.score).toBeGreaterThanOrEqual(0)
      expect(m.score).toBeLessThanOrEqual(100)
    }
  })

  it('exposes a ranked reasonList for the UI', () => {
    const m = computeMatch(getCreator('maywanders')!)
    expect(Array.isArray(m.reasonList)).toBe(true)
    // tier_fit is always pushed
    expect(m.reasonList.some((r) => r.key === 'tier_fit')).toBe(true)
  })
})

describe('merchantProfile', () => {
  it('has the Growth-tier + quota fields', () => {
    expect(merchantProfile.tier === 'free' || merchantProfile.tier === 'growth').toBe(true)
    expect(typeof merchantProfile.searchesLeft).toBe('number')
    expect(typeof merchantProfile.searchLimit).toBe('number')
    expect(typeof merchantProfile.invitesLeft).toBe('number')
    expect(typeof merchantProfile.inviteLimit).toBe('number')
    expect(merchantProfile.searchesLeft).toBeLessThanOrEqual(merchantProfile.searchLimit)
    expect(merchantProfile.invitesLeft).toBeLessThanOrEqual(merchantProfile.inviteLimit)
  })
})

describe('sampleDna', () => {
  it('is a valid @kinnso/scan Dna', () => {
    const parsed = DnaSchema.safeParse(sampleDna)
    expect(parsed.success).toBe(true)
    expect(sampleDna.platforms.every((p) => p.verified === false)).toBe(true)
  })
})

describe('creatorLocations — Fix 1 regression (city label)', () => {
  it('no city label contains a double-space (Hong Kong must not become "Hong  Kong")', () => {
    expect(creatorLocations.every((l) => !/\s{2,}/.test(l.city))).toBe(true)
  })

  it('at least one location city is exactly "Hong Kong" (single space)', () => {
    expect(creatorLocations.some((l) => l.city === 'Hong Kong')).toBe(true)
  })
})

describe('computeBreakdown', () => {
  it('total equals the sum of components (within rounding)', () => {
    const b = computeBreakdown(getCreator('nomadleo')!)
    const sum = b.reach + b.er + b.travel + b.diversity + b.recency
    expect(Math.abs(b.total - sum)).toBeLessThanOrEqual(0.5)
    expect(b.total).toBeGreaterThan(0)
  })
})
