const STATUSES = ['onboarding', 'active', 'suspended', 'banned'] as const
export type CreatorStatus = (typeof STATUSES)[number]

const TIERS = ['seed', 'rising', 'pro', 'elite']
const DNA = ['published', 'draft', 'none']

export function isCreatorStatus(s: string): s is CreatorStatus {
  return (STATUSES as readonly string[]).includes(s)
}

/** null when valid; otherwise a DB-style error key the action maps to localized copy. */
export function validateReason(reason: string): string | null {
  const r = (reason ?? '').trim()
  if (!r) return 'reason_required'
  if (r.length > 500) return 'reason_too_long'
  return null
}

export function validateBulkIds(ids: string[]): string | null {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) return 'bad_bulk'
  return null
}

export interface DirectoryParams {
  search?: string
  statuses?: string[]
  tiers?: string[]
  dna?: 'published' | 'draft' | 'none'
  verified?: boolean
}

type RawSearchParams = {
  q?: string
  status?: string
  tier?: string
  dna?: string
  verified?: string
}

const csv = (v: string | undefined, allowed: string[]): string[] | undefined => {
  if (!v) return undefined
  const parts = v.split(',').map((s) => s.trim()).filter((s) => allowed.includes(s))
  return parts.length ? parts : undefined
}

/** Map raw URL search params to validated RPC inputs (invalid values dropped). */
export function normalizeDirectoryParams(raw: RawSearchParams): DirectoryParams {
  const search = raw.q?.trim() || undefined
  const statuses = csv(raw.status, STATUSES as unknown as string[])
  const tiers = csv(raw.tier, TIERS)
  const dna = DNA.includes(raw.dna ?? '') ? (raw.dna as DirectoryParams['dna']) : undefined
  const verified = raw.verified === 'true' ? true : raw.verified === 'false' ? false : undefined
  return { search, statuses, tiers, dna, verified }
}

export const SETTLEMENT_STATUSES = ['not_started', 'pending', 'partially_paid', 'paid', 'disputed'] as const
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number]

export const LEG_STATUSES = ['pending', 'paid'] as const
export type LegStatus = (typeof LEG_STATUSES)[number]

export function isSettlementStatus(s: string): s is SettlementStatus {
  return (SETTLEMENT_STATUSES as readonly string[]).includes(s)
}

export function isLegStatus(s: string): s is LegStatus {
  return (LEG_STATUSES as readonly string[]).includes(s)
}
