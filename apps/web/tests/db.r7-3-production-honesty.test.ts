import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), '../../supabase/migrations')
const file = readdirSync(migrationsDir).find((name) => name.endsWith('_r7_3_production_honesty.sql'))

expect(file).toBeTruthy()

const sql = readFileSync(join(migrationsDir, file!), 'utf8')

describe('R7.3 production-honesty migration', () => {
  it('captures the structural, recompute, listing-policy, and editorial contracts', () => {
    expect(sql).toContain('alter table public.guides alter column cover_url drop not null')
    expect(sql).toContain('select count(*)::int from public.guide_saves')
    expect(sql).toContain('add column if not exists is_listed boolean not null default false')
    expect(sql).toContain('create or replace function public.admin_set_creator_listed')
    expect(sql).toContain("perform public.ops_audit_log_append('creator'")
    expect(sql).toMatch(/revoke all on function public\.admin_set_creator_listed\(uuid, boolean, text\) from public, anon/)
    expect(sql).toMatch(/grant execute on function public\.admin_set_creator_listed\(uuid, boolean, text\) to authenticated/)
    expect(sql).toContain('create trigger creators_protect_is_listed')
    expect(sql).toContain("'kinnso-editorial'")
  })
})
