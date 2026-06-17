export type MissionType = 'coupon_affiliate' | 'hybrid' | 'paid'

export type MissionSource = 'merchant' | 'travelpayouts'

export type MissionVisibility = 'open' | 'private'

export type MissionJoinSource = 'open_join' | 'affiliate_network_join' | 'application'

export type ParticipantStatus = 'applied' | 'active' | 'rejected'

export type ParticipantReviewAction = 'approve' | 'reject'

export type SubmissionStatus = 'pending' | 'submitted' | 'revision_requested' | 'approved' | 'rejected'

export type SubmissionReviewAction = 'approve' | 'request_revision' | 'reject'

export type AffiliateProgramStatus = 'active' | 'inactive' | 'paused'

export type SettlementStatus = 'pending' | 'partially_paid' | 'paid'

export type SettlementPaymentStatus = 'pending' | 'paid'

export type ValidationErrors = Record<string, string[]>

export type ValidationResult = {
  ok: boolean
  errors: ValidationErrors
}

export type MissionMilestoneInput = {
  title: string
  description: string
}

export type MissionDraftInput = {
  missionSource: MissionSource
  missionType: MissionType
  visibility: MissionVisibility
  title: string
  summary: string
  couponCode: string | null
  couponUrl: string | null
  affiliateCommissionRate: number | null
  kinnsoCommissionRate: number | null
  creatorCommissionRate: number | null
  paidFeeAmount: number | null
  paidFeeCurrency: string | null
  affiliateNetworkProgramId: string | null
  milestones: MissionMilestoneInput[]
}

export type PartnerLinkRequest = {
  programStatus: AffiliateProgramStatus
  participantStatus: ParticipantStatus
  originalUrl: string
}

export type SettlementUpdateInput = {
  actorIsOps: boolean
  status: SettlementStatus
  creatorPayoutStatus: SettlementPaymentStatus
  kinnsoCommissionStatus: SettlementPaymentStatus
  affiliateCommissionAmount: number | null
}
