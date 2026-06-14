import type { Check, CheckResult } from '../types'
import { detailPath } from '../url'
import { extractJsonLd, extractHreflangs, extractMeta } from '../html'
import { DEFAULT_LOCALE } from '../locales'

/**
 * Deep-parse a sample of detail pages. Asserts: Article JSON-LD with dateModified,
 * BreadcrumbList, og:type=article, hreflang covers all present locales + x-default (reciprocity),
 * and x-default points at the default locale.
 * (FAQPage is asserted on the flagship by Playwright, not in this bulk pass.)
 */
export const structuredData: Check = async ({ newstack, sample }) => {
  const articles = (await newstack.publishedArticles()).slice(0, Math.max(1, sample))
  const out: CheckResult[] = []
  for (const a of articles) {
    for (const locale of a.locales) {
      const path = detailPath(locale, a.category, a.url)
      if (!path) continue
      const html = await newstack.html(path)
      const ld = extractJsonLd(html)
      const types = new Set(ld.map((o) => o['@type']))
      const article = ld.find((o) => o['@type'] === 'Article')
      const push = (label: string, ok: boolean, detail: string) =>
        out.push({ check: 'structured-data', target: `${path} ${label}`, status: ok ? 'pass' : 'fail', detail })

      push('Article', !!article, article ? 'present' : 'no Article JSON-LD')
      push('Article.dateModified', !!article?.['dateModified'], String(article?.['dateModified'] ?? '(missing)'))
      push('BreadcrumbList', types.has('BreadcrumbList'), `types: ${[...types].join(',') || '(none)'}`)

      const ogType = extractMeta(html, 'property', 'og:type')
      push('og:type', ogType === 'article', String(ogType ?? '(missing)'))

      const hreflangs = extractHreflangs(html)
      const expected = new Set<string>([...a.locales, 'x-default'])
      const got = new Set(hreflangs.keys())
      const reciprocal = [...expected].every((l) => got.has(l))
      push('hreflang', reciprocal, `expected ${[...expected].sort().join(',')} got ${[...got].sort().join(',') || '(none)'}`)

      const xdef = hreflangs.get('x-default') ?? ''
      push('x-default', xdef.includes(`/${DEFAULT_LOCALE}/`), xdef || '(missing)')
    }
  }
  return out
}
