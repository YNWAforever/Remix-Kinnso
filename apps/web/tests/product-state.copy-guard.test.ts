import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const forbidden = ['Coming Soon', 'Live now', 'coming soon']
const sourceRoots = ['app', 'components']
const excludedDirectories = new Set(['tests', '__tests__', 'messages', 'dictionaries', 'locales'])

function listTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      return excludedDirectories.has(entry.name) ? [] : listTsxFiles(path)
    }

    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : []
  })
}

describe('product-state claim copy', () => {
  it('contains no feature-state claims outside the shared state dictionaries', () => {
    const violations = sourceRoots
      .flatMap((root) => listTsxFiles(join(process.cwd(), root)))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8')
        const displayPath = relative(process.cwd(), file).split(sep).join('/')

        return forbidden
          .filter((phrase) => source.includes(phrase))
          .map((phrase) => `${displayPath}: ${JSON.stringify(phrase)}`)
      })

    expect(violations, `Forbidden feature-state claims:\n${violations.join('\n')}`).toEqual([])
    // Whole-tree scan: reads every .tsx under app/ and components/, so the 5s
    // default is the wrong budget. It timed out in full runs while passing
    // alone, which reads as flakiness rather than as a test that is simply slow.
  }, 15_000)
})
