import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface MerchantMissionRow {
  missionId: string
  title: string
  status: string
  invited: number
  applied: number
  active: number
  rejected: number
  approvedSubmissions: number
}

export interface MerchantInsights {
  missionsPublished: number
  perMission: MerchantMissionRow[]
  totals: { participants: number; invited: number; accepted: number; approvedSubmissions: number }
  inviteAcceptRate: number | null
}

interface RawMerchantInsights {
  missions_published: number
  per_mission: {
    mission_id: string; title: string; status: string
    invited: number; applied: number; active: number; rejected: number; approved_submissions: number
  }[]
  totals: { participants: number; invited: number; accepted: number; approved_submissions: number }
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0))

export async function getMerchantInsights(supabase: Client): Promise<MerchantInsights> {
  const { data, error } = await supabase.rpc('merchant_insights')
  if (error || !data) throw error ?? new Error('merchant_insights returned no data')
  const raw = data as unknown as RawMerchantInsights

  const invited = num(raw.totals?.invited)
  return {
    missionsPublished: num(raw.missions_published),
    perMission: (raw.per_mission ?? []).map((r) => ({
      missionId: r.mission_id,
      title: r.title,
      status: r.status,
      invited: num(r.invited),
      applied: num(r.applied),
      active: num(r.active),
      rejected: num(r.rejected),
      approvedSubmissions: num(r.approved_submissions),
    })),
    totals: {
      participants: num(raw.totals?.participants),
      invited,
      accepted: num(raw.totals?.accepted),
      approvedSubmissions: num(raw.totals?.approved_submissions),
    },
    inviteAcceptRate: invited > 0 ? num(raw.totals?.accepted) / invited : null,
  }
}
