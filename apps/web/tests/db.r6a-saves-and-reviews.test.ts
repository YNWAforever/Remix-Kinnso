import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260706090000_r6a_saves_and_reviews.sql'),
  'utf8',
)

describe('R6A guide_saves + experience_saves migration', () => {
  it('creates guide_saves with a uuid PK, FK columns, and a uniqueness constraint', () => {
    expect(sql).toContain('create table public.guide_saves')
    expect(sql).toContain('guide_id uuid not null references public.guides(id) on delete cascade')
    expect(sql).toContain('traveler_user_id uuid not null references auth.users(id) on delete cascade')
    expect(sql).toContain('unique (guide_id, traveler_user_id)')
  })

  it('guide_saves RLS: owner-scoped, no anon grant, direct auth.uid() equality (not a subquery)', () => {
    expect(sql).toContain('create policy guide_saves_owner_all on public.guide_saves')
    expect(sql).toContain('using (traveler_user_id = auth.uid())')
    expect(sql).toContain('with check (traveler_user_id = auth.uid())')
    expect(sql).toMatch(/revoke all on public\.guide_saves from anon, authenticated/)
    expect(sql).toMatch(/grant select, insert, delete on public\.guide_saves to authenticated/)
  })

  it('adds experiences.saves_count and creates experience_saves with the same shape', () => {
    expect(sql).toContain('alter table public.experiences add column saves_count integer not null default 0')
    expect(sql).toContain('create table public.experience_saves')
    expect(sql).toContain('experience_id uuid not null references public.experiences(id) on delete cascade')
    expect(sql).toContain('unique (experience_id, traveler_user_id)')
    expect(sql).toContain('create policy experience_saves_owner_all on public.experience_saves')
  })

  it('both save tables get a count-sync trigger, and the trigger functions have no client-role grant', () => {
    expect(sql).toMatch(/create trigger guide_saves_sync_count_trigger\s+after insert or delete on public\.guide_saves/)
    expect(sql).toContain('update public.guides set saves_count = saves_count + 1 where id = new.guide_id')
    expect(sql).toContain('update public.guides set saves_count = greatest(saves_count - 1, 0) where id = old.guide_id')
    expect(sql).toMatch(/create trigger experience_saves_sync_count_trigger\s+after insert or delete on public\.experience_saves/)
    expect(sql).toContain('update public.experiences set saves_count = saves_count + 1 where id = new.experience_id')
    expect(sql).toContain('update public.experiences set saves_count = greatest(saves_count - 1, 0) where id = old.experience_id')
    expect(sql).toMatch(/revoke all on function public\.guide_saves_sync_count\(\) from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/revoke all on function public\.experience_saves_sync_count\(\) from public, anon, authenticated, service_role/)
  })

  it('both save tables index traveler_user_id for the /trips saved-list queries, matching this codebase\'s per-FK-index convention', () => {
    expect(sql).toContain('create index guide_saves_traveler_idx on public.guide_saves(traveler_user_id, created_at desc)')
    expect(sql).toContain('create index experience_saves_traveler_idx on public.experience_saves(traveler_user_id, created_at desc)')
  })
})
