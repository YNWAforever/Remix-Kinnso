import { describe, it, expect } from 'vitest'
import { LOCALES } from '../config'
import { getDictionary } from '../dictionaries'
import en from '../messages/en'

/** Recursively collect dotted key paths, sorted. */
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix]
  return Object.entries(obj as Record<string, unknown>)
    .flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k))
    .sort()
}

const GROUPS = ['studio', 'creatorProfile', 'merchants'] as const

describe('i18n locale parity for new creator-profile groups', () => {
  const enPaths = Object.fromEntries(
    GROUPS.map((g) => [g, keyPaths((en as Record<string, unknown>)[g])]),
  )

  it('en defines the three new groups', () => {
    for (const g of GROUPS) {
      expect(enPaths[g].length).toBeGreaterThan(0)
    }
  })

  for (const locale of LOCALES) {
    it(`${locale} has identical keys to en for each group`, async () => {
      const dict = (await getDictionary(locale)) as Record<string, unknown>
      for (const g of GROUPS) {
        expect(keyPaths(dict[g])).toEqual(enPaths[g])
      }
    })
  }
})
