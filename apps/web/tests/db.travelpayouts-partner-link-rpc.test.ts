import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('_restore_travelpayouts_partner_link_rpc.sql'))

expect(matches).toHaveLength(1)

const sql = readFileSync(join(migrationsDir, matches[0]), 'utf8')
const compact = sql.toLowerCase().replaceAll(/\s+/g, ' ')

describe('Travelpayouts partner-link persistence migration', () => {
  it('restores the trigger guard without weakening ordinary authenticated inserts', () => {
    expect(compact).toContain(
      'create or replace function app_private.prepare_affiliate_partner_link_insert()',
    )
    expect(compact).toContain(
      "current_setting('app.bypass_partner_link_prepare', true) = 'on'",
    )
    expect(compact).toContain("new.external_status := 'pending'")
    expect(compact).toContain("new.sub_id := 'pending:' || gen_random_uuid()::text")
  })

  it('creates the exact audited RPC signature', () => {
    expect(compact).toContain(
      'create or replace function public.create_travelpayouts_partner_link( p_affiliate_network_program_id uuid, p_mission_id uuid, p_mission_participant_id uuid, p_original_url text, p_partner_url text, p_sub_id text )',
    )
    expect(compact).toContain('returns table(id uuid, partner_url text)')
    expect(compact).toContain('security definer')
    expect(compact).toContain('set search_path = public')
  })

  it('derives and verifies the authenticated creator SubID', () => {
    expect(compact).toContain('v_actor_id uuid := auth.uid()')
    expect(compact).toContain("'kinnso_m_' || replace(p_mission_id::text, '-', '')")
    expect(compact).toContain("'_p_' || replace(p_mission_participant_id::text, '-', '')")
    expect(compact).toContain("'_c_' || replace(v_actor_id::text, '-', '')")
    expect(compact).toContain('if btrim(p_sub_id) <> v_expected_sub_id then')
  })

  it('accepts only HTTPS Travelpayouts links carrying the exact SubID', () => {
    expect(compact).toContain("v_original_url !~* '^https://[^[:space:]]+$'")
    expect(compact).toContain(
      "v_partner_url !~* '^https://([a-z0-9-]+\\.)?tp\\.st/[^[:space:]]*$'",
    )
    expect(compact).toContain(
      "v_partner_url !~ ('[?&]sub_id=' || v_expected_sub_id || '(&|#|$)')",
    )
  })

  it('revalidates ownership and active Travelpayouts mission state', () => {
    expect(compact).toContain('participant.creator_id = v_actor_id')
    expect(compact).toContain("participant.status = 'active'")
    expect(compact).toContain("mission.status = 'published'")
    expect(compact).toContain("mission.mission_source = 'travelpayouts'")
    expect(compact).toContain("program.network = 'travelpayouts'")
    expect(compact).toContain("program.status = 'active'")
  })

  it('opens the bypass only after validation and persists idempotently', () => {
    const validationIndex = compact.indexOf("raise exception 'partner link is not allowed'")
    const bypassIndex = compact.indexOf(
      "set_config('app.bypass_partner_link_prepare', 'on', true)",
    )
    expect(validationIndex).toBeGreaterThan(-1)
    expect(bypassIndex).toBeGreaterThan(validationIndex)
    expect(compact).toContain('on conflict (network, sub_id, original_url) do nothing')
    expect(compact).toContain("link.external_status = 'success'")
  })

  it('revokes public and anon execution and grants only authenticated execution', () => {
    expect(compact).toContain(
      'revoke all on function public.create_travelpayouts_partner_link( uuid, uuid, uuid, text, text, text ) from public, anon, authenticated',
    )
    expect(compact).toContain(
      'grant execute on function public.create_travelpayouts_partner_link( uuid, uuid, uuid, text, text, text ) to authenticated',
    )
    expect(compact).not.toContain(
      'grant execute on function public.create_travelpayouts_partner_link( uuid, uuid, uuid, text, text, text ) to anon',
    )
  })
})
