import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

// Plain anon client so this helper is testable in Node without Next's
// request-scoped `cookies()`. RLS still hides unpublished/expired rows.
const db = () =>
  createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!,
  )

export async function getArticleByUrl(url: string, locale: string) {
  const { data } = await db()
    .from('articles')
    .select('*, article_translations(*)')
    .eq('url', url)
    .maybeSingle()
  if (!data) return null
  const translation =
    (data.article_translations ?? []).find((t) => t.locale === locale) ?? null
  return { ...data, translation }
}
