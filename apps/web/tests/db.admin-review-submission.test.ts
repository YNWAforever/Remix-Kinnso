import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_0_admin_review_submission.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.0 admin_review_submission RPC', () => {
  it('applies after the events-table migration', () => {
    expect(matches[0] > '20260819090000').toBe(true)
  })

  it('gates on the admin rank, matching every other state-mutating ops RPC', () => {
    expect(sql).toContain('create or replace function public.admin_review_submission(')
    expect(sql).toContain("if not public.is_active_ops_role('admin') then raise exception 'forbidden' using errcode = '42501'; end if;")
  })

  it('requires a reason for reject and request_revision, matching validateReason\'s own rules', () => {
    expect(sql).toContain("if p_action in ('reject', 'request_revision') and coalesce(btrim(p_reason_category), '') = '' then raise exception 'reason_required'; end if;")
  })

  it('rejects an unknown action', () => {
    expect(sql).toContain("if p_action not in ('approve', 'reject', 'request_revision') then raise exception 'bad_action'; end if;")
  })

  it('locks the row and CASes on submitted, matching admin_set_settlement_status\'s for-update shape', () => {
    expect(sql).toContain('select status into v_status from public.mission_milestone_submissions where id = p_submission_id for update')
    expect(sql).toContain('if not found then raise exception \'not_found\'; end if;')
    expect(sql).toContain("if v_status <> 'submitted' then raise exception 'stale_status'; end if;")
  })

  it('computes the next status via the same rule as reviewSubmission()', () => {
    expect(sql).toContain("v_next_status := case p_action when 'approve' then 'approved' when 'request_revision' then 'revision_requested' else 'rejected' end;")
  })

  it('updates the submission, writes a review event, and appends an audit log entry in one transaction', () => {
    expect(sql).toContain('update public.mission_milestone_submissions set status = v_next_status, merchant_feedback = coalesce(p_reason_text, merchant_feedback), reviewed_at = now(), reviewed_by = auth.uid() where id = p_submission_id')
    expect(sql).toContain("insert into public.mission_review_events (submission_id, actor_type, actor_id, action, reason_category, reason_text) values (p_submission_id, 'ops', auth.uid(), p_action, p_reason_category, p_reason_text)")
    expect(sql).toContain("perform public.ops_audit_log_append('mission_submission', p_submission_id, 'submission.' || p_action, p_reason_text, jsonb_build_object('from', v_status, 'to', v_next_status, 'reason_category', p_reason_category))")
  })

  it('revokes from every client role except an authenticated grant', () => {
    expect(sql).toContain('revoke all on function public.admin_review_submission(uuid, text, text, text) from public, anon')
    expect(sql).toContain('grant execute on function public.admin_review_submission(uuid, text, text, text) to authenticated')
  })
})
