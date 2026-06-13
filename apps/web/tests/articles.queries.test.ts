import { describe, it, expect } from 'vitest'
import { getArticleByUrl } from '@/lib/articles/queries'

describe('getArticleByUrl', () => {
  it('returns a published article with its requested-locale translation', async () => {
    const a = await getArticleByUrl('pub-article', 'en')
    expect(a?.url).toBe('pub-article')
    expect(a?.translation?.title).toBe('Published EN')
  })
  it('returns null for an unpublished article', async () => {
    expect(await getArticleByUrl('draft-article', 'en')).toBeNull()
  })
})
