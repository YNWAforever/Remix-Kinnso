import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260801090000_r8_0_measurement_baseline.sql',
)

describe('R8.0 private traveller analytics ledger migration', () => {
  const sql = () => readFileSync(migration, 'utf8').toLowerCase()

  it('creates only the minimal private event ledger and its retry key', () => {
    const text = sql()
    const ledgerStart = text.indexOf('create table public.traveller_analytics_events')
    const ledgerDefinition = text.slice(ledgerStart, text.indexOf('create index', ledgerStart))
    expect(text).toContain('create table public.traveller_analytics_events')
    expect(text).toContain('client_event_id uuid not null')
    expect(text).toContain('journey_id uuid not null')
    expect(text).toContain('unique (journey_id, client_event_id)')
    expect(text).toContain('account_id uuid')
    for (const eventName of [
      'journey_started',
      'entity_viewed',
      'agent_started',
      'booking_cta_clicked',
      'waitlist_submitted',
      'checkout_started',
      'signup_started',
      'signup_completed',
    ]) {
      expect(text).toContain(`'${eventName}'`)
    }
    for (const prohibitedColumn of ['email', 'ip', 'user_agent', 'prompt', 'title', 'query', 'jsonb']) {
      expect(ledgerDefinition).not.toMatch(new RegExp(`\\b${prohibitedColumn}\\b`, 'i'))
    }
  })

  it('locks both private tables to the service role', () => {
    const text = sql()
    for (const tableName of ['traveller_analytics_events', 'traveller_analytics_rate_limits']) {
      expect(text).toContain(`alter table public.${tableName} enable row level security`)
      expect(text).toContain(`revoke all on table public.${tableName} from public, anon, authenticated`)
      expect(text).toContain(`grant all on table public.${tableName} to service_role`)
    }
  })

  it('uses a fixed, narrow throttle and eight-day retention', () => {
    const text = sql()
    expect(text).toContain('check_and_increment_traveller_analytics_rate_limit')
    expect(text).toContain('security definer')
    expect(text).toContain('set search_path = public')
    expect(text).toContain('120')
    expect(text).toContain('600')
    expect(text).toContain("interval '8 days'")
    expect(text).toContain('purge_traveller_analytics_events')
    expect(text).toContain('grant execute on function public.purge_traveller_analytics_events() to service_role')
  })

  it('exposes only an ops-gated aggregate report to authenticated callers', () => {
    const text = sql()
    expect(text).toContain('admin_traveller_analytics_report')
    expect(text).toContain('stable')
    expect(text).toContain('if not public.is_active_ops() then')
    expect(text).toContain("interval '7 days'")
    expect(text).toContain('insufficient_sample')
    expect(text).toContain('sample_floor constant integer := 10')
    expect(text).toContain('count(distinct')
    expect(text).toContain('booking_state')
    expect(text).toContain('revoke all on function public.admin_traveller_analytics_report')
    expect(text).toContain('grant execute on function public.admin_traveller_analytics_report(timestamptz, timestamptz) to authenticated')
  })
})
