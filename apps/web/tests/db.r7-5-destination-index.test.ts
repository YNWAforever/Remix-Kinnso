import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260719161738_r7_5_destination_index.sql',
)

describe('R7.5 destination index migration', () => {
  it('creates a read-only, invoker-secured published inventory view', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()

    expect(sql).toContain('create view public.destination_index')
    expect(sql).toContain('with (security_invoker = true)')
    expect(sql).toContain("where status = 'published'")
    expect(sql).toContain('guide_count')
    expect(sql).toContain('experience_count')
    expect(sql).toContain('latest_published_at')
    expect(sql).toContain('revoke all on public.destination_index from anon, authenticated')
    expect(sql).toContain(String.raw`regexp_replace(lower(observed_city), '\s+', ' ', 'g')`)
    expect(sql).toContain(String.raw`regexp_replace(lower(btrim(term.value)), '\s+', ' ', 'g')`)

    const grants = [...sql.matchAll(/grant\s+([^;]+?)\s+on\s+public\.destination_index\s+to\s+anon,\s*authenticated/g)]
      .map(([, privileges]) => privileges.trim().replace(/\s+/g, ' '))
    expect(grants).toEqual(['select'])
  })
})
