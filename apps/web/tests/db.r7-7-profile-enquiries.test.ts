import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260726090000_r7_7_profile_enquiries.sql',
)

describe('R7.7 profile enquiries migration', () => {
  const sql = () => readFileSync(migration, 'utf8').toLowerCase()

  it('adds constrained avatar and follower projection support', () => {
    expect(sql()).toContain('add column if not exists avatar_url text')
    expect(sql()).toContain('creator_public_profile_json')
    expect(sql()).toContain("'followers'")
    expect(sql()).toContain("jsonb_typeof(p->'followers') = 'number'")
  })

  it('creates typed enquiries with exactly one matching target', () => {
    expect(sql()).toContain('create table public.enquiries')
    expect(sql()).toContain("type in ('creator_collab','merchant_contact')")
    expect(sql()).toContain("status in ('new','in_progress','resolved','spam')")
    expect(sql()).toContain('creator_id uuid')
    expect(sql()).toContain('merchant_profile_id uuid')
    expect(sql()).toContain('on delete restrict')
  })

  it('exposes writes only through narrow RPCs', () => {
    const text = sql()
    expect(text).toContain('alter table public.enquiries enable row level security')
    expect(text).toContain('revoke all on table public.enquiries from public, anon, authenticated')
    expect(text).toContain('create or replace function public.submit_enquiry')
    expect(text).toContain('create or replace function public.admin_set_enquiry_status')
    expect(text).toContain("ops_audit_log_append('enquiry'")
    expect(text).not.toMatch(/grant\s+insert\s+on\s+(?:table\s+)?public\.enquiries/)
    expect(text).not.toMatch(/grant\s+update\s+on\s+(?:table\s+)?public\.enquiries/)
  })

  it('exposes only published guide metadata from booking attribution', () => {
    const text = sql()
    expect(text).toContain('function public.get_attributed_guides_for_merchant')
    expect(text).toContain("b.status in ('confirmed','completed')")
    expect(text).toContain("g.status = 'published'")
    expect(text).toContain('grant execute on function public.get_attributed_guides_for_merchant')
  })
})
