import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)

describe('articles RLS', () => {
  it('anon sees only published, in-window, non-deleted articles', async () => {
    const { data, error } = await anon.from('articles').select('slug')
    expect(error).toBeNull()
    const slugs = (data ?? []).map((r) => r.slug)
    // Plan 3 adds more published fixtures; assert the RLS gate by inclusion/exclusion
    // rather than exact equality (Plan 1 used exact equality when pub-article was the only published row).
    expect(slugs).toContain('pub-article')
    expect(slugs).not.toContain('draft-article')   // unpublished -> RLS-hidden
    expect(slugs).not.toContain('expired-article') // end_at in the past -> RLS-hidden
  })
})
