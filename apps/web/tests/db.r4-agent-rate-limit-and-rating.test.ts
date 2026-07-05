import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260705120000_r4_agent_rate_limit_and_rating_rpc.sql'),
  'utf8',
)

describe('agent rate limit + rating migration', () => {
  it('creates a dedicated agent_rate_limits table, separate from checkout_rate_limits', () => {
    expect(sql).toContain('create table public.agent_rate_limits')
    expect(sql).not.toContain('checkout_rate_limits')
  })
  it('check_and_increment_agent_rate_limit mirrors the checkout RPC shape', () => {
    expect(sql).toContain('create or replace function public.check_and_increment_agent_rate_limit')
    expect(sql).toContain('security definer')
    expect(sql).toContain('grant execute on function public.check_and_increment_agent_rate_limit')
  })
  it('rate_agent_message validates the rating value and checks ownership before updating', () => {
    expect(sql).toContain('create or replace function public.rate_agent_message')
    expect(sql).toContain("if p_rating not in ('up','down')")
    expect(sql).toContain('v_traveler_user_id != auth.uid()')
    expect(sql).toContain('v_anon_session_id != p_anon_session_id')
    expect(sql).toContain("and role = 'assistant'")
  })
})
