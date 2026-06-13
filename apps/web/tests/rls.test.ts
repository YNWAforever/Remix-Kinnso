import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)

describe('articles RLS', () => {
  it('anon sees only published, in-window, non-deleted articles', async () => {
    const { data, error } = await anon.from('articles').select('slug')
    expect(error).toBeNull()
    const slugs = (data ?? []).map((r) => r.slug).sort()
    expect(slugs).toEqual(['pub-article'])
  })
})
