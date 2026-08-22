import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260822090000_r12_2_receipt_cashback_schema.sql'),
  'utf8',
)

describe('R12.2 receipt-cashback schema foundation', () => {
  it('adds receipt_cashback to mission_type and a nullable max_receipts_per_creator cap', () => {
    expect(sql).toContain("mission_type in ('coupon_affiliate', 'hybrid', 'paid', 'receipt_cashback')")
    expect(sql).toContain('add column max_receipts_per_creator integer')
  })

  it('adds a repeatable flag to mission_milestones', () => {
    expect(sql).toContain('add column repeatable boolean not null default false')
  })

  it('denormalizes milestone_repeatable onto submissions via a before-insert trigger', () => {
    expect(sql).toContain('add column milestone_repeatable boolean not null default false')
    expect(sql).toContain('before insert on public.mission_milestone_submissions')
    expect(sql).toContain('select repeatable into new.milestone_repeatable')
  })

  it('replaces the flat unique constraint with a partial index scoped to non-repeatable milestones', () => {
    expect(sql).toContain('drop constraint')
    expect(sql).toContain('create unique index mission_milestone_submissions_unique_non_repeatable')
    expect(sql).toContain('on public.mission_milestone_submissions (mission_milestone_id, mission_participant_id)')
    expect(sql).toContain('where not milestone_repeatable')
  })

  it('auto-creates a repeatable milestone whenever a receipt_cashback mission is inserted', () => {
    expect(sql).toContain('after insert on public.missions')
    expect(sql).toContain("if new.mission_type = 'receipt_cashback' then")
    expect(sql).toContain('insert into public.mission_milestones (mission_id, title, description, repeatable)')
    expect(sql).toContain('true);')
  })
})
