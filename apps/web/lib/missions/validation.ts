import type {
  MissionDraftInput,
  PartnerLinkRequest,
  ValidationErrors,
  ValidationResult,
} from '@/lib/missions/types'
import { parseProofUrl } from '@/lib/missions/proof-url'

const isBlank = (value: string | null | undefined) => value == null || value.trim() === ''

const addError = (errors: ValidationErrors, field: string, error: string) => {
  errors[field] = [...(errors[field] ?? []), error]
}

const isNonNegativeNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const validateNonNegative = (
  errors: ValidationErrors,
  field: string,
  value: unknown,
  required = false,
) => {
  if (value == null) {
    if (required) addError(errors, field, 'required')
    return
  }

  if (!isNonNegativeNumber(value)) addError(errors, field, 'non-negative')
}

const resultFrom = (errors: ValidationErrors): ValidationResult =>
  Object.keys(errors).length === 0 ? { ok: true, errors: {} } : { ok: false, errors }

const isAbsoluteHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export const validateMissionDraft = (input: MissionDraftInput): ValidationResult => {
  const errors: ValidationErrors = {}

  if (isBlank(input.title)) addError(errors, 'title', 'required')
  if (isBlank(input.summary)) addError(errors, 'summary', 'required')

  if (
    input.missionSource === 'merchant' &&
    input.missionType !== 'paid' &&
    input.missionType !== 'receipt_cashback'
  ) {
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

  if (
    input.missionType === 'paid' ||
    input.missionType === 'hybrid' ||
    input.missionType === 'receipt_cashback'
  ) {
    validateNonNegative(errors, 'paidFeeAmount', input.paidFeeAmount, true)
    if (isBlank(input.paidFeeCurrency)) addError(errors, 'paidFeeCurrency', 'required')
  }

  // receipt_cashback missions get their single repeatable milestone auto-created by a DB
  // trigger at mission-insert time (see
  // supabase/migrations/20260822090000_r12_2_receipt_cashback_schema.sql), so unlike
  // paid/hybrid missions the merchant is never asked to enter one here.
  if (input.missionType === 'paid' || input.missionType === 'hybrid') {
    if (input.milestones.length === 0) addError(errors, 'milestones', 'at least one')
  }

  if (input.missionType === 'receipt_cashback' && input.maxReceiptsPerCreator != null) {
    if (!Number.isInteger(input.maxReceiptsPerCreator) || input.maxReceiptsPerCreator < 1) {
      addError(errors, 'maxReceiptsPerCreator', 'positive-integer')
    }
  }

  return resultFrom(errors)
}

export const validatePartnerLinkRequest = (input: PartnerLinkRequest): ValidationResult => {
  const errors: ValidationErrors = {}

  if (input.programStatus !== 'active') addError(errors, 'programStatus', 'active')
  if (input.participantStatus !== 'active') addError(errors, 'participantStatus', 'active')
  if (isBlank(input.originalUrl)) {
    addError(errors, 'originalUrl', 'required')
  } else if (!isAbsoluteHttpsUrl(input.originalUrl)) {
    addError(errors, 'originalUrl', 'https')
  }

  return resultFrom(errors)
}

export const validateSubmission = (input: { proofUrl: string; notes?: string | null }): ValidationResult => {
  const errors: ValidationErrors = {}
  const url = (input.proofUrl ?? '').trim()

  if (isBlank(url)) {
    addError(errors, 'proofUrl', 'required')
  } else if (!/^https?:\/\//i.test(url)) {
    addError(errors, 'proofUrl', 'url')
  } else if (!parseProofUrl(url)) {
    addError(errors, 'proofUrl', 'unsupported')
  }

  if ((input.notes ?? '').length > 1000) {
    addError(errors, 'notes', 'too_long')
  }

  return resultFrom(errors)
}
