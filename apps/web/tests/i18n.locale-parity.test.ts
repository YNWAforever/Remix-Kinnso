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
