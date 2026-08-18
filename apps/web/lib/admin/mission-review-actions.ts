import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'
import type { SubmissionReviewAction } from '@/lib/missions/types'

const reviewQueuePath = (locale: Locale) => `/${locale}/admin/missions/review`

/** DB raise-message → friendly copy. admin_review_submission raises these bare messages. */
const FRIENDLY: Record<string, string> = {
  forbidden: 'Active ops access is required.',
  bad_action: 'Invalid review action.',
  reason_required: 'A reason category is required for this action.',
  bad_reason_category: 'Invalid reason category.',
  not_found: 'That submission no longer exists. Refresh and try again.',
  stale_status: 'This submission has already been reviewed. Refresh and try again.',
}

const mapError = (message: string, fallback: string): string => {
  const key = Object.keys(FRIENDLY).find((k) => message.includes(k))
  return key ? FRIENDLY[key] : fallback
}

/**
 * Ops review decision on a mission milestone submission, via the audited
 * admin_review_submission RPC. `reasonCategory` is pre-validated here (present whenever
 * `action !== 'approve'`) as defense-in-depth/better UX -- the RPC enforces the same rule
 * server-side with its own `reason_required` raise, so this check can never be bypassed
 * by skipping the action layer.
 *
 * Note: only the review-queue path is revalidated. Revalidating the mission detail page
 * would need the mission id, which this action does not receive (by the task's own
 * signature) -- adding one was out of scope for this task, so it is flagged here rather
 * than invented.
 */
export async function reviewSubmissionOpsAction(
  locale: Locale,
  submissionId: string,
  action: SubmissionReviewAction,
  reasonCategory: string | null,
  reasonText: string | null,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  if (action !== 'approve' && !reasonCategory?.trim()) return formError(FRIENDLY.reason_required)

  const { error } = await supabase.rpc('admin_review_submission', {
    p_submission_id: submissionId,
    p_action: action,
    p_reason_category: reasonCategory,
    p_reason_text: reasonText,
  })
  if (error) {
    console.error('[admin:missions] reviewSubmissionOpsAction failed', error)
    return formError(mapError(error.message, 'Submission could not be reviewed'))
  }
  revalidatePath(reviewQueuePath(locale))
  return { ok: true, id: submissionId }
}
