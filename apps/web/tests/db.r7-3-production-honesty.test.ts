import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), '../../supabase/migrations')
const file = readdirSync(migrationsDir).find((name) => name.endsWith('_r7_3_production_honesty.sql'))

expect(file).toBeTruthy()

const sql = readFileSync(join(migrationsDir, file!), 'utf8')
const liveTestPath = join(process.cwd(), 'tests/r7-3-creator-listing.rls.test.ts')
const liveTest = readFileSync(liveTestPath, 'utf8')
const liveConfigPath = join(process.cwd(), 'tests/helpers/r7-3-local-live-config.ts')
const liveConfig = readFileSync(liveConfigPath, 'utf8')

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

  it('locks the creator row before deriving audited listing metadata', () => {
    expect(sql).toContain('select is_listed into v_from from public.creators where id = p_id for update')
  })

  it('requires explicit local-only opt-in before constructing a service-role client', () => {
    expect(liveConfig).toContain('RUN_R7_3_LOCAL_LIVE_TESTS')
    expect(liveTest).toContain('resolveR73LocalLiveConfig')
    expect(liveTest).toMatch(/const svc\s*=\s*liveConfig\s*\?\s*createClient/)
    expect(liveTest).toMatch(/:\s*null/)
  })

  it('executes the migration recompute against a drifted local guide with a real save', () => {
    expect(liveConfig).toContain('SUPABASE_DB_CONTAINER')
    expect(liveTest).toContain('runPsql(recomputeSql)')
    expect(liveTest).toContain("expect(afterRecompute.data!.saves_count).toBe(1)")
  })
})
