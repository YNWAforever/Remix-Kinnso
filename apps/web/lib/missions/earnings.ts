export type CreatorSettlementMission = {
  title: string | null
  mission_type: string | null
  mission_source: string | null
}

export type CreatorSettlementRow = {
  id: string
  creator_payout_status: string | null
  amount_currency: string | null
  creator_commission_amount: number | null
  paid_fee_amount: number | null
  missions: CreatorSettlementMission | CreatorSettlementMission[] | null
}

export type CreatorEarningItem = {
  id: string
  missionTitle: string
  missionType: string
  currency: string
  amount: number
  payoutStatus: 'paid' | 'pending'
}

export type EarningsCurrencyTotal = {
  currency: string
  paid: number
  pending: number
}

const DEFAULT_CURRENCY = 'USD'

export function toCreatorEarningItem(row: CreatorSettlementRow): CreatorEarningItem {
  const mission = Array.isArray(row.missions) ? row.missions[0] ?? null : row.missions
  const amount = (row.creator_commission_amount ?? 0) + (row.paid_fee_amount ?? 0)

  return {
    id: row.id,
    missionTitle: mission?.title ?? '',
    missionType: mission?.mission_type ?? '',
    currency: (row.amount_currency ?? DEFAULT_CURRENCY).toUpperCase(),
    amount,
    payoutStatus: row.creator_payout_status === 'paid' ? 'paid' : 'pending',
  }
}

export function summarizeCreatorEarnings(items: CreatorEarningItem[]): EarningsCurrencyTotal[] {
  const byCurrency = new Map<string, EarningsCurrencyTotal>()

  for (const item of items) {
    const entry = byCurrency.get(item.currency) ?? { currency: item.currency, paid: 0, pending: 0 }
    if (item.payoutStatus === 'paid') entry.paid += item.amount
    else entry.pending += item.amount
    byCurrency.set(item.currency, entry)
  }

  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency))
}
