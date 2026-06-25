import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type {
  AffiliateProgramStatus,
  MissionDraftInput,
  MissionSource,
  MissionType,
  ParticipantReviewAction,
  ParticipantStatus,
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
  validateSubmission,
} from '@/lib/missions/validation'
import { meetsTier, type GatedTier, type Tier } from '@/lib/contribution/tiers'

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

type LocaleOption = {
  locale?: string
}

type CreateMissionOptions = LocaleOption & {
  publish?: boolean
}

type JoinMissionInput = LocaleOption & {
  missionId: string
  applicationNote?: string | null
}

type ReviewParticipantInput = LocaleOption & {
  participantId: string
  action: ParticipantReviewAction
  reviewNote?: string | null
}

type ReviewSubmissionInput = LocaleOption & {
  submissionId: string
  action: SubmissionReviewAction
  feedback?: string | null
}

type UpdateSettlementInput = LocaleOption & {
  settlementId: string
  status: SettlementStatus
  creatorPayoutStatus: SettlementPaymentStatus
  kinnsoCommissionStatus: SettlementPaymentStatus
  affiliateCommissionAmount?: number | null
  affiliateCommissionStatus?: SettlementPaymentStatus | null
  creatorCommissionAmount?: number | null
  kinnsoCommissionAmount?: number | null
  opsNote?: string | null
}

export type CreatePartnerLinkInput = LocaleOption & {
  missionParticipantId: string
  originalUrl: string
}

const merchantMissionsPath = '/merchants/missions'
const studioMissionsPath = '/studio/missions'
const opsSettlementsPath = '/ops/settlements'
const defaultLocale = 'en'
const localePattern = /^[a-z]{2}(?:-[a-z]{2})?$/

const formError = (message: string): ActionFailure => ({
  ok: false,
  errors: { form: [message] },
})
const incompleteMissionCreationError =
  'Mission creation is incomplete. Please retry or contact ops before publishing again.'

const normalizeLocale = (locale?: string) => {
  const value = locale?.trim().toLowerCase()
  return value && localePattern.test(value) ? value : defaultLocale
}

const localizedPath = (locale: string | undefined, path: string) =>
  `/${normalizeLocale(locale)}${path}`

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
    min_tier: draft.minTier,
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
  'use server'

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
    if (milestoneError) {
      const { data: rolledBackMission, error: rollbackError } = await supabase
        .from('missions')
        .delete()
        .eq('id', mission.id)
        .select('id')
        .maybeSingle()

      if (rollbackError || !rolledBackMission) return formError(incompleteMissionCreationError)

      return formError('Mission milestones could not be created')
    }
  }

  await revalidate([
    localizedPath(options.locale, merchantMissionsPath),
    localizedPath(options.locale, studioMissionsPath),
  ])
  return { ok: true, missionId: mission.id }
}

export async function joinMissionAction(
  input: JoinMissionInput,
): Promise<ActionResult<{ participantId: string }>> {
  'use server'

  const supabase = await getSupabase()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return formError('Sign in is required')

  const opsMember = await getActiveOpsMember(supabase, user.id)
  if (opsMember) return formError('Creator access is required')

  const merchantProfile = await getMerchantProfileForUser(supabase, user.id)
  if (merchantProfile) return formError('Creator access is required')

  const { data: mission, error: missionError } = await supabase
    .from('missions')
    .select('id, mission_type, mission_source, min_tier')
    .eq('id', input.missionId)
    .eq('status', 'published')
    .single()

  if (missionError || !mission) return formError('Mission is not available')

  if (mission.min_tier) {
    const { data: contribution } = await supabase
      .from('creator_contribution')
      .select('tier')
      .eq('creator_id', user.id)
      .maybeSingle()
    const creatorTier = (contribution?.tier as Tier | undefined) ?? 'seed'
    if (!meetsTier(creatorTier, mission.min_tier as GatedTier)) {
      return formError(`This mission requires the ${mission.min_tier} tier`)
    }
  }

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

  await revalidate([localizedPath(input.locale, studioMissionsPath)])
  return { ok: true, participantId: participant.id }
}

export async function reviewParticipantAction(
  input: ReviewParticipantInput,
): Promise<ActionResult<{ status: string }>> {
  'use server'

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

  const { data: updatedParticipant, error: updateError } = await supabase
    .from('mission_participants')
    .update({
      status: nextStatus,
      merchant_review_note: input.reviewNote ?? null,
      approved_at: nextStatus === 'active' ? new Date().toISOString() : null,
    })
    .eq('id', input.participantId)
    .eq('status', participant.status)
    .select('status')
    .maybeSingle()

  if (updateError || !updatedParticipant) {
    return formError('Participant review could not be saved')
  }

  await revalidate([localizedPath(input.locale, merchantMissionsPath)])
  return { ok: true, status: updatedParticipant.status }
}

export async function reviewSubmissionAction(
  input: ReviewSubmissionInput,
): Promise<ActionResult<{ status: string }>> {
  'use server'

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

  const { data: updatedSubmission, error: updateError } = await supabase
    .from('mission_milestone_submissions')
    .update({
      status: nextStatus,
      merchant_feedback: input.feedback ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('id', input.submissionId)
    .eq('status', submission.status)
    .select('status')
    .maybeSingle()

  if (updateError || !updatedSubmission) {
    return formError('Submission review could not be saved')
  }

  await revalidate([localizedPath(input.locale, merchantMissionsPath)])
  return { ok: true, status: updatedSubmission.status }
}

export async function updateSettlementAction(
  input: UpdateSettlementInput,
): Promise<ActionResult<{ settlementId: string }>> {
  'use server'

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
    updated_by_ops_member_id: opsMember.id,
  }
  if (input.affiliateCommissionAmount !== undefined) {
    update.affiliate_commission_amount = input.affiliateCommissionAmount
  }
  if (input.affiliateCommissionStatus !== undefined) {
    update.affiliate_commission_status = input.affiliateCommissionStatus
  }
  if (input.creatorCommissionAmount !== undefined) {
    update.creator_commission_amount = input.creatorCommissionAmount
  }
  if (input.kinnsoCommissionAmount !== undefined) {
    update.kinnso_commission_amount = input.kinnsoCommissionAmount
  }
  if (input.opsNote !== undefined) {
    update.ops_note = input.opsNote
  }

  const { data: settlement, error } = await supabase
    .from('mission_settlements')
    .update(update)
    .eq('id', input.settlementId)
    .select('id')
    .maybeSingle()

  if (error || !settlement) return formError('Settlement update could not be saved')

  await revalidate([localizedPath(input.locale, opsSettlementsPath)])
  return { ok: true, settlementId: settlement.id }
}

export type SubmitMilestoneInput = {
  missionId: string
  milestoneId: string
  participantId: string
  proofUrl: string
  notes?: string | null
  locale?: string
}

const RESUBMITTABLE = new Set(['pending', 'submitted', 'revision_requested'])

export async function submitMilestoneAction(
  input: SubmitMilestoneInput,
): Promise<ActionResult<{ submissionId: string }>> {
  'use server'

  const validation = validateSubmission({ proofUrl: input.proofUrl, notes: input.notes })
  if (!validation.ok) return { ok: false, errors: validation.errors }

  const supabase = await getSupabase()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return formError('Sign in is required')

  const { data: participant, error: participantError } = await supabase
    .from('mission_participants')
    .select('id, creator_id, status, mission_id')
    .eq('id', input.participantId)
    .maybeSingle()

  if (participantError || !participant) return formError('Mission participation was not found')
  if (participant.creator_id !== user.id) return formError('Creator access is required')
  if (participant.status !== 'active') return formError('Mission is not active')

  const proofUrls = [input.proofUrl.trim()]
  const notes = input.notes ?? null
  const submittedAt = new Date().toISOString()

  const { data: existing } = await supabase
    .from('mission_milestone_submissions')
    .select('id, status')
    .eq('mission_milestone_id', input.milestoneId)
    .eq('mission_participant_id', input.participantId)
    .maybeSingle()

  if (existing) {
    if (!RESUBMITTABLE.has(existing.status ?? '')) return formError('This milestone has already been reviewed')
    const { data: updated, error: updateError } = await supabase
      .from('mission_milestone_submissions')
      .update({ status: 'submitted', proof_urls: proofUrls, notes, submitted_at: submittedAt })
      .eq('id', existing.id)
      .select('id')
      .single()
    if (updateError || !updated) return formError('Submission could not be saved')
    await revalidate([localizedPath(input.locale, studioMissionsPath)])
    return { ok: true, submissionId: updated.id }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('mission_milestone_submissions')
    .insert({
      mission_milestone_id: input.milestoneId,
      mission_participant_id: input.participantId,
      proof_urls: proofUrls,
      notes,
      status: 'submitted',
      submitted_at: submittedAt,
    })
    .select('id')
    .single()

  if (insertError || !inserted) return formError('Submission could not be saved')
  await revalidate([localizedPath(input.locale, studioMissionsPath)])
  return { ok: true, submissionId: inserted.id }
}

export async function createPartnerLinkAction(
  input: CreatePartnerLinkInput,
): Promise<ActionResult<{ link: { id: string; partner_url: string } }>> {
  'use server'

  const supabase = await getSupabase()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return formError('Sign in is required')

  const { data: participant, error: participantError } = await supabase
    .from('mission_participants')
    .select('id, mission_id, creator_id, status')
    .eq('id', input.missionParticipantId)
    .eq('creator_id', user.id)
    .maybeSingle()

  if (participantError || !participant) return formError('Participant was not found')

  const { data: mission, error: missionError } = await supabase
    .from('missions')
    .select('id, affiliate_network_program_id, mission_source, status')
    .eq('id', participant.mission_id)
    .maybeSingle()

  if (
    missionError ||
    !mission ||
    mission.status !== 'published' ||
    mission.mission_source !== 'travelpayouts' ||
    !mission.affiliate_network_program_id
  ) {
    return formError('Mission is not available')
  }

  const { data: program, error: programError } = await supabase
    .from('affiliate_network_programs')
    .select('id, network, status')
    .eq('id', mission.affiliate_network_program_id)
    .maybeSingle()

  if (programError || !program || program.network !== 'travelpayouts') {
    return formError('Affiliate program is not available')
  }

  const validation = validatePartnerLinkRequest({
    programStatus: program.status as AffiliateProgramStatus,
    participantStatus: participant.status as ParticipantStatus,
    originalUrl: input.originalUrl,
  })
  if (!validation.ok) return validation

  const { data: existingLink, error: existingLinkError } = await supabase
    .from('affiliate_partner_links')
    .select('id, partner_url')
    .eq('network', 'travelpayouts')
    .eq('mission_id', mission.id)
    .eq('mission_participant_id', participant.id)
    .eq('creator_id', user.id)
    .eq('original_url', input.originalUrl)
    .eq('external_status', 'success')
    .maybeSingle()

  if (existingLinkError) return formError('Partner link could not be loaded')
  if (existingLink) return { ok: true, link: existingLink }

  const { buildSubId, createTravelpayoutsPartnerLinks } = await import('@/lib/missions/travelpayouts')
  const subId = buildSubId({
    missionId: mission.id,
    participantId: participant.id,
    creatorId: user.id,
  })

  let partnerUrl: string | null = null
  let failureReason = 'no partner link returned'
  try {
    const [link] = await createTravelpayoutsPartnerLinks({
      shorten: true,
      links: [{ url: input.originalUrl, subId }],
    })
    if (link?.status === 'success' && link.partnerUrl) partnerUrl = link.partnerUrl
    else if (link?.message) failureReason = link.message
  } catch (err) {
    failureReason = err instanceof Error ? err.message : String(err)
  }

  if (!partnerUrl) {
    // Surface the real Travelpayouts reason (HTTP status / API message) rather than
    // swallowing it. The access token is never present in these reasons, so it is safe
    // to log and return.
    console.error('[createPartnerLinkAction] Travelpayouts link generation failed:', failureReason)
    return formError(`Travelpayouts partner link could not be generated: ${failureReason}`)
  }

  // Persist via the SECURITY DEFINER RPC (granted to `authenticated`). It re-validates
  // ownership + active mission/program state and inserts as definer, so no service-role
  // key is required in the app environment.
  const { data, error } = await supabase.rpc('create_travelpayouts_partner_link', {
    p_affiliate_network_program_id: mission.affiliate_network_program_id,
    p_mission_id: mission.id,
    p_mission_participant_id: participant.id,
    p_original_url: input.originalUrl,
    p_partner_url: partnerUrl,
    p_sub_id: subId,
  })

  const saved = Array.isArray(data) ? data[0] : data
  if (error || !saved) return formError('Partner link could not be saved')

  await revalidate([localizedPath(input.locale, studioMissionsPath)])
  return { ok: true, link: saved }
}
