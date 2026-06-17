import type {
  MissionDraftInput,
  PartnerLinkRequest,
  SettlementUpdateInput,
  ValidationErrors,
  ValidationResult,
} from '@/lib/missions/types'

const isBlank = (value: string | null | undefined) => value == null || value.trim() === ''

const addError = (errors: ValidationErrors, field: string, error: string) => {
  errors[field] = [...(errors[field] ?? []), error]
}

const validateNonNegative = (
  errors: ValidationErrors,
  field: string,
  value: number | null,
  required = false,
) => {
  if (value == null) {
    if (required) addError(errors, field, 'required')
    return
  }

  if (value < 0) addError(errors, field, 'non-negative')
}

const resultFrom = (errors: ValidationErrors): ValidationResult => ({
  ok: Object.keys(errors).length === 0,
  errors,
})

export const validateMissionDraft = (input: MissionDraftInput): ValidationResult => {
  const errors: ValidationErrors = {}

  if (isBlank(input.title)) addError(errors, 'title', 'required')
  if (isBlank(input.summary)) addError(errors, 'summary', 'required')

  if (input.missionSource === 'merchant' && input.missionType !== 'paid') {
    if (isBlank(input.couponCode)) addError(errors, 'couponCode', 'required')
    if (isBlank(input.couponUrl)) addError(errors, 'couponUrl', 'required')
    validateNonNegative(errors, 'affiliateCommissionRate', input.affiliateCommissionRate, true)
    validateNonNegative(errors, 'kinnsoCommissionRate', input.kinnsoCommissionRate, true)
    validateNonNegative(errors, 'creatorCommissionRate', input.creatorCommissionRate, true)
  }

  if (input.missionSource === 'travelpayouts') {
    if (input.missionType !== 'coupon_affiliate') addError(errors, 'missionType', 'coupon_affiliate')
    if (isBlank(input.affiliateNetworkProgramId)) {
      addError(errors, 'affiliateNetworkProgramId', 'required')
    }
  }

  if (input.missionType === 'paid' || input.missionType === 'hybrid') {
    validateNonNegative(errors, 'paidFeeAmount', input.paidFeeAmount, true)
    if (isBlank(input.paidFeeCurrency)) addError(errors, 'paidFeeCurrency', 'required')
    if (input.milestones.length === 0) addError(errors, 'milestones', 'at least one')
  }

  return resultFrom(errors)
}

export const validatePartnerLinkRequest = (input: PartnerLinkRequest): ValidationResult => {
  const errors: ValidationErrors = {}

  if (input.programStatus !== 'active') addError(errors, 'programStatus', 'active')
  if (input.participantStatus !== 'active') addError(errors, 'participantStatus', 'active')
  if (isBlank(input.originalUrl)) addError(errors, 'originalUrl', 'required')

  return resultFrom(errors)
}

export const validateSettlementUpdate = (input: SettlementUpdateInput): ValidationResult => {
  const errors: ValidationErrors = {}

  if (!input.actorIsOps) addError(errors, 'actorIsOps', 'ops')
  validateNonNegative(errors, 'affiliateCommissionAmount', input.affiliateCommissionAmount)

  return resultFrom(errors)
}
