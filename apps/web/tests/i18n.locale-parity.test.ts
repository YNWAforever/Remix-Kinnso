import { describe, it, expect } from 'vitest'
import { LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import en from '@/lib/i18n/messages/en'

/** Recursively collect dotted key paths, sorted. */
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix]
  return Object.entries(obj as Record<string, unknown>)
    .flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k))
    .sort()
}

// Every top-level group in the en dictionary is parity-checked — nothing can be
// forgotten (R1C carry-forward #6: 'agent', 'breadcrumb', 'categories' were live
// but unregistered under the old hand list).
const GROUPS = Object.keys(en).sort() as (keyof typeof en)[]

describe('i18n locale parity for new creator-profile groups', () => {
  const enPaths = Object.fromEntries(
    GROUPS.map((g) => [g, keyPaths((en as unknown as Record<string, unknown>)[g])]),
  )

  it('en defines the three new groups', () => {
    for (const g of GROUPS) {
      expect(enPaths[g].length).toBeGreaterThan(0)
    }
  })

  it('defines the complete Explore discovery contract', () => {
    expect(Object.keys(en.explore).sort()).toEqual([
      'activeFilters', 'allDestinations', 'closeFilters', 'destinationFilterLabel',
      'emptyFilteredBody', 'emptyFilteredTitle', 'emptyNote', 'filters',
      'filtersDescription', 'gridHeading', 'heading', 'loadMore', 'mostSaved',
      'newest', 'pill', 'resetFilters', 'resultsLabel', 'savesLabel',
      'searchLabel', 'searchPlaceholder', 'showResults', 'sortLabel', 'subtitle',
    ].sort())
  })

  it('states the analytics trust metadata in every locale', async () => {
    const dictionaries = await Promise.all(LOCALES.map(async (locale) => [locale, await getDictionary(locale)] as const))
    for (const [locale, dict] of dictionaries) {
      expect(dict.admin.analyticsRetentionNote, `${locale} retention note`).toMatch(/8/)
      expect(dict.admin.analyticsAttributionNote, `${locale} attribution note`).toMatch(/7/)
      expect(dict.admin.analyticsSampleFloorNote, `${locale} sample-floor note`).toMatch(/10/)
    }
    expect(en.admin.analyticsRetentionNote).toBe('Analytics data is retained for 8 days.')
    expect(en.admin.analyticsAttributionNote).toBe('Attribution uses a 7-day window.')
    expect(en.admin.analyticsSampleFloorNote).toBe('Rates are withheld when the denominator is below 10.')
  })

  it('explains observed-zero aggregates and non-interpretable insufficient rates in every locale', async () => {
    const semanticMarkers: Record<string, string[]> = {
      en: ['observed aggregate', 'insufficient samples', 'not interpretable rates'],
      'zh-hk': ['觀察到的匯總', '樣本不足', '無法解讀'],
      'zh-tw': ['觀察到的彙總', '樣本不足', '無法解讀'],
      'zh-cn': ['观察到的聚合', '样本不足', '无法解读'],
      ja: ['観測された集計', 'サンプル不足', '解釈できません'],
      ko: ['관찰된 집계', '표본 부족', '해석할 수 없습니다'],
      th: ['ค่ารวมที่สังเกตได้', 'ตัวอย่างไม่เพียงพอ', 'ตีความไม่ได้'],
    }
    const dictionaries = await Promise.all(LOCALES.map(async (locale) => [locale, await getDictionary(locale)] as const))
    for (const [locale, dict] of dictionaries) {
      for (const marker of semanticMarkers[locale]) {
        expect(dict.admin.analyticsObservedZero, `${locale} observed-zero copy`).toContain(marker)
      }
    }
    expect(en.admin.analyticsObservedZero).toBe('Zero is an observed aggregate; insufficient samples are not interpretable rates.')
  })

  for (const locale of LOCALES) {
    it(`${locale} has identical keys to en for each group`, async () => {
      const dict = (await getDictionary(locale)) as unknown as Record<string, unknown>
      for (const g of GROUPS) {
        expect(dict[g], `${locale} is missing group "${g}"`).toBeDefined()
        expect(keyPaths(dict[g])).toEqual(enPaths[g])
      }
    })
  }
})
