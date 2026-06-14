/* eslint-disable no-console */
// TEMPORARY DIAGNOSTIC — remove before merge.
// The `queries.detail` author assertion fails only on CI's fresh local stack
// (passes on hosted). This dumps the seeded author data through BOTH the anon
// client (RLS-applied — what getArticleDetail sees) and the service_role client
// (raw seeded data) to tell "data missing" apart from "RLS hiding".
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

describe('DEBUG author resolution (temporary)', () => {
  it('dumps articles.authors + article_authors via anon and service_role', async () => {
    const anon = createClient(url, anonKey)
    const svc = createClient(url, serviceKey)

    const anonArticle = await anon.from('articles').select('url, authors').eq('url', 'ramen-guide').maybeSingle()
    const anonAuthors = await anon.from('article_authors').select('slug, locale, is_active, name')
    const svcArticle = await svc.from('articles').select('url, authors').eq('url', 'ramen-guide').maybeSingle()
    const svcAuthors = await svc.from('article_authors').select('slug, locale, is_active, name')

    console.log('DBG service_role env present:', Boolean(serviceKey))
    console.log('DBG anon articles.authors:', JSON.stringify(anonArticle.data), 'err:', JSON.stringify(anonArticle.error))
    console.log('DBG anon article_authors:', JSON.stringify(anonAuthors.data), 'err:', JSON.stringify(anonAuthors.error))
    console.log('DBG svc  articles.authors:', JSON.stringify(svcArticle.data), 'err:', JSON.stringify(svcArticle.error))
    console.log('DBG svc  article_authors:', JSON.stringify(svcAuthors.data), 'err:', JSON.stringify(svcAuthors.error))

    expect(true).toBe(true)
  })
})
