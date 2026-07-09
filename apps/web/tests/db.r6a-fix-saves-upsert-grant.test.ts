import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260706093000_r6a_fix_saves_upsert_grant.sql'),
  'utf8',
)

describe('R6A fix: grant update on guide_saves/experience_saves for upsert', () => {
  it('grants update to authenticated on both save tables (needed for INSERT ... ON CONFLICT DO UPDATE)', () => {
    expect(sql).toContain('grant update on public.guide_saves to authenticated')
    expect(sql).toContain('grant update on public.experience_saves to authenticated')
  })
})
