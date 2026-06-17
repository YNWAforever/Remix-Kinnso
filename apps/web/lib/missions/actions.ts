'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type {
  MissionDraftInput,
  MissionSource,
  MissionType,
  ParticipantReviewAction,
  PartnerLinkRequest,
  SettlementPaymentStatus,
  SettlementStatus,
  SubmissionReviewAction,
  ValidationErrors,
} from '@/lib/missions/types'
import { nextJoinStatus, reviewParticipant, reviewSubmission } from '@/lib/missions/state'
import {
  validateMissionDraft,
  validatePartnerLinkRequest,
  validateSettlementUpdate,
} from '@/lib/missions/validation'

type MissionInsert = Database['public']['Tables']['missions']['Insert']
type MissionMilestoneInsert = Database['public']['Tables']['mission_milestones']['Insert']
type ParticipantInsert = Database['public']['Tables']['mission_participants']['Insert']
type SettlementUpdate = Database['public']['Tables']['mission_settlements']['Update']
type Supabase = SupabaseClient<Database>

type ActionFailure = { ok: false; errors: ValidationErrors }
type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

type BuildMissionInsertInput = {
  input: MissionDraftInput
  merchantProfileId: string | null
  opsMemberId: string | null
  publish: boolean
}

type BuildParticipantInsertInput = {
  missionId: string
  creatorId: string
  missionType: MissionType
  missionSource: MissionSource
  applicationNote?: string | null
}

type CreateMissionOptions = {
  publish?: boolean
}

type JoinMissionInput = {
  missionId: string
  applicationNote?: string | null
}

type ReviewParticipantInput = {
  participantId: string
  action: ParticipantReviewAction
  reviewNote?: string | null
}

type ReviewSubmissionInput = {
  submissionId: string
  action: SubmissionReviewAction
  feedback?: string | null
}

type UpdateSettlementInput = {
  settlementId: string
  status: SettlementStatus
  creatorPayoutStatus: SettlementPaymentStatus
  kinnsoCommissionStatus: SettlementPaymentStatus
  affiliateCommissionAmount: number | null
  affiliateCommissionStatus?: SettlementPaymentStatus | null
  creatorCommissionAmount?: number | null
  kinnsoCommissionAmount?: number | null
  opsNote?: string | null
}

const merchantMissionsPath = '/merchants/missions'
const studioMissionsPath = '/studio/missions'
const opsSettlementsPath = '/ops/settlements'

const formError = (message: string): ActionFailure => ({
  ok: false,
  errors: { form: [message] },
})

async function getSupabase() {
  const { createSupabaseServerClient } = await import('@/lib/supabase/server')
  return createSupabaseServerClient()
}

async function revalidate(paths: string[]) {
  const { revalidatePath } = await import('next/cache')
  paths.forEach((path) => revalidatePath(path))
}

async function getAuthenticatedUser(supabase: Supabase) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null
  return user
}

async function getActiveOpsMember(supabase: Supabase, userId: string) {
  const { data, error } = await supabase
    .from('kinnso_ops_members')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) return null
  return data
}

async function getMerchantProfileForUser(supabase: Supabase, userId: string) {
  const { data, error } = await supabase
    .from('merchant_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return null
  return data
}

async function assertMissionBelongsToMerchant(
  supabase: Supabase,
  missionId: string,
  merchantProfileId: string,
) {
  const { data, error } = await supabase
    .from('missions')
    .select('id')
    .eq('id', missionId)
    .eq('merchant_profile_id', merchantProfileId)
    .maybeSingle()

  return !error && Boolean(data)
}

export function buildMissionInsert({
  input: draft,
  merchantProfileId,
  opsMemberId,
  publish,
}: BuildMissionInsertInput): MissionInsert {
  return {
    merchant_profile_id: merchantProfileId,
    created_by_ops_member_id: opsMemberId,
    mission_source: draft.missionSource,
    mission_type: draft.missionType,
    visibility: draft.visibility,
    status: publish ? 'published' : 'draft',
    published_at: publish ? new Date().toISOString() : null,
    title: draft.title,
    summary: draft.summary,
    coupon_code: draft.couponCode,
    coupon_url: draft.couponUrl,
    affiliate_commission_rate: draft.affiliateCommissionRate,
    kinnso_commission_rate: draft.kinnsoCommissionRate,
    creator_commission_rate: draft.creatorCommissionRate,
    paid_fee_amount: draft.paidFeeAmount,
    paid_fee_currency: draft.paidFeeCurrency,
    affiliate_network_program_id: draft.affiliateNetworkProgramId,
  }
}

export function buildParticipantInsert({
  missionId,
  creatorId,
  missionType,
  missionSource,
  applicationNote = null,
}: BuildParticipantInsertInput): ParticipantInsert {
  const next = nextJoinStatus({ missionType, missionSource })

  return {
    mission_id: missionId,
    creator_id: creatorId,
    status: next.status,
    source: next.source,
    application_note: applicationNote,
    approved_at: next.status === 'active' ? new Date().toISOString() : null,
  }
}

export async function createMissionAction(
  input: MissionDraftInput,
  options: CreateMissionOptions = {},
): Promise<ActionResult<{ missionId: string }>> {
  const validation = validateMissionDraft(input)
  if (!validation.ok) return validation

  const supabase = await getSupabase()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return formError('Sign in is required')

  let merchantProfileId: string | null = null
  let opsMemberId: string | null = null

  if (input.missionSource === 'travelpayouts') {
    const opsMember = await getActiveOpsMember(supabase, user.id)
    if (!opsMember) return formError('Active ops member access is required')
    opsMemberId = opsMember.id
  } else {
    const merchantProfile = await getMerchantProfileForUser(supabase, user.id)
    if (!merchantProfile) return formError('Merchant profile is required')
    merchantProfileId = merchantProfile.id
  }

  const missionPayload = buildMissionInsert({
    input,
    merchantProfileId,
    opsMemberId,
    publish: options.publish ?? false,
  })

  const { data: mission, error: missionError } = await supabase
    .from('missions')
    .insert(missionPayload)
    .select('id')
    .single()

  if (missionError || !mission) return formError('Mission could not be created')

  if (input.milestones.length > 0) {
    const milestones: MissionMilestoneInsert[] = input.milestones.map((milestone, index) => ({
      mission_id: mission.id,
      title: milestone.title,
      description: milestone.description,
      due_at: null,
      sort_order: index,
    }))

    const { error: milestoneError } = await supabase.from('mission_milestones').insert(milestones)
    if (milestoneError) return formError('Mission milestones could not be created')
  }

  await revalidate([merchantMissionsPath, studioMissionsPath])
  return { ok: true, missionId: mission.id }
}

export async function joinMissionAction(
  input: JoinMissionInput,
): Promise<ActionResult<{ participantId: string }>> {
  const supabase = await getSupabase()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return formError('Sign in is required')

  const { data: mission, error: missionError } = await supabase
    .from('missions')
    .select('id, mission_type, mission_source')
    .eq('id', input.missionId)
    .eq('status', 'published')
    .single()

  if (missionError || !mission) return formError('Mission is not available')

  const participantPayload = buildParticipantInsert({
    missionId: mission.id,
    creatorId: user.id,
    missionType: mission.mission_type as MissionType,
    missionSource: mission.mission_source as MissionSource,
    applicationNote: input.applicationNote,
  })

  const { data: participant, error: participantError } = await supabase
    .from('mission_participants')
    .insert(participantPayload)
    .select('id')
    .single()

  if (participantError || !participant) return formError('Mission could not be joined')

  await revalidate([studioMissionsPath])
  return { ok: true, participantId: participant.id }
}

export async function reviewParticipantAction(
  input: ReviewParticipantInput,
): Promise<ActionResult<{ status: string }>> {
  const supabase = await getSupabase()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return formError('Sign in is required')

  const merchantProfile = await getMerchantProfileForUser(supabase, user.id)
  if (!merchantProfile) return formError('Merchant profile is required')

  const { data: participant, error: participantError } = await supabase
    .from('mission_participants')
    .select('id, mission_id, status')
    .eq('id', input.participantId)
    .single()

  if (participantError || !participant) return formError('Participant was not found')

  const ownsMission = await assertMissionBelongsToMerchant(
    supabase,
    participant.mission_id,
    merchantProfile.id,
  )
  if (!ownsMission) return formError('Merchant access is required')

  let nextStatus: string
  try {
    nextStatus = reviewParticipant(
      participant.status as Parameters<typeof reviewParticipant>[0],
      input.action,
    )
  } catch (error) {
    return formError(error instanceof Error ? error.message : 'Participant could not be reviewed')
  }

  const { error: updateError } = await supabase
    .from('mission_participants')
    .update({
      status: nextStatus,
      merchant_review_note: input.reviewNote ?? null,
      approved_at: nextStatus === 'active' ? new Date().toISOString() : null,
    })
    .eq('id', input.participantId)

  if (updateError) return formError('Participant review could not be saved')

  await revalidate([merchantMissionsPath])
  return { ok: true, status: nextStatus }
}

export async function reviewSubmissionAction(
  input: ReviewSubmissionInput,
): Promise<ActionResult<{ status: string }>> {
  const supabase = await getSupabase()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return formError('Sign in is required')

  const merchantProfile = await getMerchantProfileForUser(supabase, user.id)
  if (!merchantProfile) return formError('Merchant profile is required')

  const { data: submission, error: submissionError } = await supabase
    .from('mission_milestone_submissions')
    .select('id, status, mission_participant_id')
    .eq('id', input.submissionId)
    .single()

  if (submissionError || !submission) return formError('Submission was not found')

  const { data: participant, error: participantError } = await supabase
    .from('mission_participants')
    .select('mission_id')
    .eq('id', submission.mission_participant_id)
    .single()

  if (participantError || !participant) return formError('Participant was not found')

  const ownsMission = await assertMissionBelongsToMerchant(
    supabase,
    participant.mission_id,
    merchantProfile.id,
  )
  if (!ownsMission) return formError('Merchant access is required')

  let nextStatus: string
  try {
    nextStatus = reviewSubmission(
      submission.status as Parameters<typeof reviewSubmission>[0],
      input.action,
    )
  } catch (error) {
    return formError(error instanceof Error ? error.message : 'Submission could not be reviewed')
  }

  const { error: updateError } = await supabase
    .from('mission_milestone_submissions')
    .update({
      status: nextStatus,
      merchant_feedback: input.feedback ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('id', input.submissionId)

  if (updateError) return formError('Submission review could not be saved')

  await revalidate([merchantMissionsPath])
  return { ok: true, status: nextStatus }
}

export async function updateSettlementAction(
  input: UpdateSettlementInput,
): Promise<ActionResult<{ settlementId: string }>> {
  const supabase = await getSupabase()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return formError('Sign in is required')

  const opsMember = await getActiveOpsMember(supabase, user.id)
  const validation = validateSettlementUpdate({
    actorIsOps: Boolean(opsMember),
    status: input.status,
    creatorPayoutStatus: input.creatorPayoutStatus,
    kinnsoCommissionStatus: input.kinnsoCommissionStatus,
    affiliateCommissionAmount: input.affiliateCommissionAmount,
  })
  if (!validation.ok) return validation
  if (!opsMember) return formError('Active ops member access is required')

  const update: SettlementUpdate = {
    status: input.status,
    creator_payout_status: input.creatorPayoutStatus,
    kinnso_commission_status: input.kinnsoCommissionStatus,
    affiliate_commission_amount: input.affiliateCommissionAmount,
    affiliate_commission_status: input.affiliateCommissionStatus,
    creator_commission_amount: input.creatorCommissionAmount,
    kinnso_commission_amount: input.kinnsoCommissionAmount,
    ops_note: input.opsNote,
    updated_by_ops_member_id: opsMember.id,
  }

  const { error } = await supabase
    .from('mission_settlements')
    .update(update)
    .eq('id', input.settlementId)

  if (error) return formError('Settlement update could not be saved')

  await revalidate([opsSettlementsPath])
  return { ok: true, settlementId: input.settlementId }
}

export async function createPartnerLinkAction(
  input: PartnerLinkRequest,
): Promise<ActionResult> {
  const validation = validatePartnerLinkRequest(input)
  if (!validation.ok) return validation

  return {
    ok: false,
    errors: { form: ['Travelpayouts adapter is added in Task 4'] },
  }
}
