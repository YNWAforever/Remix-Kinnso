import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_2_admin_settle_payout_batch.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.2 admin_mark_payout_paid / admin_cancel_payout RPCs', () => {
  it('applies after admin_create_payout_batch', () => {
    expect(matches[0] > '20260816090200').toBe(true)
  })

  it('mark-paid is a plain CAS on pending, gated on admin, with no decision row', () => {
    // Scoped to admin_mark_payout_paid's own text (everything before admin_cancel_payout's
    // definition begins), not the whole file: admin_cancel_payout legitimately DOES insert
    // into creator_payout_decisions (see the "cancel ... writes a cancelled decision" test
    // below), and both functions live in this same migration file per the plan's file
    // layout, so a whole-file check here would fail regardless of what admin_mark_payout_paid
    // itself does.
    const markPaidSql = sql.split('create or replace function public.admin_cancel_payout(')[0]
    expect(sql).toContain('create or replace function public.admin_mark_payout_paid(p_batch_id uuid, p_reason text)')
    expect(sql).toContain("if not public.is_active_ops_role('admin') then")
    expect(sql).toContain("if v_status <> 'pending' then raise exception 'bad_transition'; end if")
    expect(sql).toContain("set status = 'paid', paid_at = now(), updated_at = now()")
    expect(markPaidSql).not.toContain('insert into public.creator_payout_decisions')
  })

  it('mark-paid raises not_found for a missing batch', () => {
    expect(sql).toContain('if not found then raise exception \'not_found\'; end if')
  })

  it('cancel is idempotency-keyed the same way create is', () => {
    expect(sql).toContain('create or replace function public.admin_cancel_payout(')
    expect(sql).toContain("v_hash := md5(concat_ws('|', p_batch_id::text, 'cancel'))")
    expect(sql).toContain("raise exception 'idempotency_conflict'")
  })

  it('cancel only accepts a pending batch and writes a cancelled decision that supersedes the approval', () => {
    expect(sql).toContain("if v_status <> 'pending' then raise exception 'bad_transition'; end if")
    expect(sql).toContain("set status = 'cancelled', cancelled_at = now(), updated_at = now()")
    expect(sql).toContain("decision_kind = 'approved'")
    expect(sql).toContain('supersedes_decision_id')
    expect(sql).toContain("'cancelled'")
  })

  it('both audit their transition', () => {
    expect(sql).toContain("ops_audit_log_append('payout_batch', p_batch_id, 'payout_batch.paid'")
    expect(sql).toContain("ops_audit_log_append('payout_batch', p_batch_id, 'payout_batch.cancel'")
  })

  it('revokes public and anon execute on both', () => {
    expect(sql).toContain('revoke all on function public.admin_mark_payout_paid(uuid, text) from public, anon')
    expect(sql).toContain('revoke all on function public.admin_cancel_payout(uuid, text, text) from public, anon')
  })
})
