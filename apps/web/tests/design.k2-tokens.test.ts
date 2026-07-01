import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// R1A token contract: the kinnso2-* editorial system must exist ALONGSIDE the
// legacy kinnso-* system (legacy is removed only in R1C's final task). String
// assertions on globals.css keep this executable without a CSS pipeline.
// NOTE: token declarations in globals.css use exactly one space after the colon
// so these substring checks hold.
const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

describe('kinnso2 editorial design tokens (R1A)', () => {
  it.each([
    ['--color-kinnso2-paper', '#FAF6EF'],
    ['--color-kinnso2-ink', '#26201A'],
    ['--color-kinnso2-clay', '#B9482B'],
    ['--color-kinnso2-clay-deep', '#93361F'],
    ['--color-kinnso2-sand', '#E8DCC8'],
    ['--color-kinnso2-moss', '#4A5D43'],
    ['--color-kinnso2-sun', '#D99A2B'],
    ['--color-kinnso2-line', '#D8CDBB'],
  ])('defines %s: %s', (token, hex) => {
    expect(css).toContain(`${token}: ${hex}`)
  })

  it('keeps the legacy kinnso-* tokens until the R1C sweep', () => {
    expect(css).toContain('--color-kinnso-orange: #F26A1F')
    expect(css).toContain('--color-kinnso-cream: #F8F1E6')
  })
})
