// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - server-only is a Next.js runtime marker; this workspace does not install its types.
import 'server-only'

const partnerLinksEndpoint = 'https://api.travelpayouts.com/links/v1/create'
const maxLinksPerRequest = 10

export type TravelpayoutsLinkInput = {
  url: string
  subId: string
}

export type TravelpayoutsLinkResult = {
  originalUrl: string
  partnerUrl: string
  status: 'success' | 'failed'
  message?: string
}

export type TravelpayoutsAction = {
  externalActionId: string | null
  externalProgramId: string | null
  eventState: string | null
  subId: string | null
  priceAmount: number | null
  profitAmount: number | null
  currency: string | null
  bookedAt: string | null
  updatedAt: string | null
  raw: Record<string, unknown>
}

type BuildSubIdInput = {
  missionId: string
  participantId: string
  creatorId: string
}

type CreateTravelpayoutsPartnerLinksInput = {
  links: TravelpayoutsLinkInput[]
  shorten?: boolean
}

type TravelpayoutsPartnerLinkResponse = {
  result?: {
    links?: Array<{
      url?: string
      code?: string
      partner_url?: string
      message?: string
      error?: string
    }>
  }
}

export const buildSubId = ({ missionId, participantId, creatorId }: BuildSubIdInput) => {
  // Travelpayouts SubIDs accept only [0-9A-Za-z_] (max 4096 chars). UUID hyphens are
  // rejected — which both fails link creation AND would break per-creator attribution —
  // so strip them. The value stays unique and deterministic; reconciliation matches it
  // verbatim (affiliate_partner_links.sub_id ↔ affiliate_network_events.sub_id), so the
  // format is opaque and needs no parser change.
  const stripHyphens = (id: string) => id.replace(/-/g, '')
  return `kinnso_m_${stripHyphens(missionId)}_p_${stripHyphens(participantId)}_c_${stripHyphens(creatorId)}`
}

const requireEnv = (name: string) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const requireNumericEnv = (name: string) => {
  const value = requireEnv(name)
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`Environment variable must be numeric: ${name}`)
  return parsed
}

/**
 * True when all three Travelpayouts env vars are present and project/marker are
 * numeric — i.e. createTravelpayoutsPartnerLinks() will not throw on missing
 * config. Used by the offers UI to show a "setup pending" note instead of a
 * broken link button.
 */
export const isTravelpayoutsConfigured = (): boolean => {
  // Match requireEnv/requireNumericEnv semantics: trimmed, non-empty, and numeric.
  // (Number('') === 0 is finite, so guard against blank-but-present vars too.)
  const isNumericEnv = (value: string | undefined): boolean => {
    const trimmed = value?.trim()
    return Boolean(trimmed) && Number.isFinite(Number(trimmed))
  }
  return (
    Boolean(process.env.TRAVELPAYOUTS_API_TOKEN?.trim()) &&
    isNumericEnv(process.env.TRAVELPAYOUTS_PROJECT_ID) &&
    isNumericEnv(process.env.TRAVELPAYOUTS_MARKER)
  )
}

const toNullableString = (value: unknown) => {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

const toNullableNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const toCurrency = (value: unknown) => toNullableString(value)?.toLowerCase() ?? 'usd'

const toEventState = (value: unknown) => {
  switch (toNullableString(value)?.toLowerCase()) {
    case 'paid':
      return 'paid'
    case 'processing':
      return 'processing'
    case 'cancelled':
    case 'canceled':
      return 'cancelled'
    default:
      return 'unknown'
  }
}

export async function createTravelpayoutsPartnerLinks({
  links,
  shorten = true,
}: CreateTravelpayoutsPartnerLinksInput): Promise<TravelpayoutsLinkResult[]> {
  if (links.length > maxLinksPerRequest) {
    throw new Error('Travelpayouts accepts no more than 10 links per request')
  }

  const token = requireEnv('TRAVELPAYOUTS_API_TOKEN')
  const trs = requireNumericEnv('TRAVELPAYOUTS_PROJECT_ID')
  const marker = requireNumericEnv('TRAVELPAYOUTS_MARKER')

  const response = await fetch(partnerLinksEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Access-Token': token,
    },
    body: JSON.stringify({
      trs,
      marker,
      shorten,
      links: links.map(({ url, subId }) => ({ url, sub_id: subId })),
    }),
  })

  if (!response.ok) {
    // Include the response body — it carries the real reason (e.g. "Unauthorized",
    // "invalid marker"). The access token is sent in the request header, never echoed
    // back here, so this is safe to surface.
    const body = await response.text().catch(() => '')
    throw new Error(`Travelpayouts partner link request failed: ${response.status} ${body}`.trim())
  }

  const json = await response.json() as TravelpayoutsPartnerLinkResponse
  const resultLinks = json.result?.links ?? []

  return resultLinks.map((link, index) => {
    const message = link.message ?? link.error
    const result: TravelpayoutsLinkResult = {
      originalUrl: link.url ?? links[index]?.url ?? '',
      partnerUrl: link.partner_url ?? '',
      status: link.code === 'success' ? 'success' : 'failed',
    }
    if (message) result.message = message
    return result
  })
}

export function normalizeTravelpayoutsAction(raw: Record<string, unknown>): TravelpayoutsAction {
  return {
    externalActionId: toNullableString(raw.action_id),
    externalProgramId: toNullableString(raw.campaign_id),
    eventState: toEventState(raw.action_state ?? raw.state),
    subId: toNullableString(raw.sub_id),
    priceAmount: toNullableNumber(raw.price ?? raw.price_usd ?? raw.price_amount),
    profitAmount: toNullableNumber(raw.profit ?? raw.paid_profit_usd ?? raw.profit_amount),
    currency: toCurrency(raw.currency),
    bookedAt: toNullableString(raw.booked_at ?? raw.created_at ?? raw.date),
    updatedAt: toNullableString(raw.updated_at),
    raw,
  }
}
