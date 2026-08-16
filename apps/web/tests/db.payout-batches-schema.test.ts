import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_2_payout_batches_and_decisions.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.2 payout batches and decisions schema', () => {
  it('applies after R10.1 settlement minting', () => {
    expect(matches[0] > '20260815100300').toBe(true)
  })

  it('creates both tables', () => {
    expect(sql).toContain('create table public.creator_payout_batches')
    expect(sql).toContain('create table public.creator_payout_decisions')
  })

  it('constrains batch status to the three-state lifecycle', () => {
    expect(sql).toContain("check (status in ('pending', 'paid', 'cancelled'))")
  })

  it('constrains batch amount to be positive', () => {
    expect(sql).toContain('check (amount > 0)')
  })

  it('allows only one pending batch per creator and currency', () => {
    expect(sql).toContain(
      "create unique index creator_payout_batches_one_pending_uniq on public.creator_payout_batches (creator_id, currency) where status = 'pending'",
    )
  })

  it('constrains decision_kind to approved or cancelled', () => {
    expect(sql).toContain("check (decision_kind in ('approved', 'cancelled'))")
  })

  it('enforces one row per idempotency key', () => {
    expect(sql).toContain(
      'create unique index creator_payout_decisions_idempotency_key_uniq on public.creator_payout_decisions (idempotency_key)',
    )
  })

  it('revokes all client access to both tables — writes are RPC-only', () => {
    expect(sql).toContain('revoke all on public.creator_payout_batches from public, anon, authenticated')
    expect(sql).toContain('revoke all on public.creator_payout_decisions from public, anon, authenticated')
  })

  it('blocks a batch update once it has left pending', () => {
    expect(sql).toContain("if old.status <> 'pending' then")
    expect(sql).toContain("raise exception 'batch_immutable'")
  })

  it('blocks any update or delete on a decision row', () => {
    expect(sql).toContain('before update on public.creator_payout_decisions')
    expect(sql).toContain('before delete on public.creator_payout_decisions')
    expect(sql).toContain("raise exception 'decision_immutable'")
  })
})
