import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every `*-kinnso-<name>` Tailwind utility used in application source must
 * resolve to a `--color-kinnso-<name>` token defined in globals.css.
 *
 * This exists because three tokens were referenced but never defined:
 * `kinnso-line` (130 uses across 35 files), `kinnso-border` (11) and
 * `kinnso-bg-muted` (1). Under Tailwind v4 an undefined token produces no class
 * at all, so `border border-kinnso-line` rendered a border with no colour --
 * silently invisible, and impossible to notice from source review because the
 * markup looks completely correct.
 *
 * Key-parity style checks cannot catch this: the token is absent, not wrong.
 * The only durable guard is to compare what the source *uses* against what the
 * stylesheet *defines*.
 */

const webRoot = resolve(__dirname, '..')
const cssPath = join(webRoot, 'app/globals.css')
const SOURCE_ROOTS = ['app', 'components'] as const
const SOURCE_EXT = /\.(tsx|ts)$/

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (SOURCE_EXT.test(entry)) out.push(full)
  }
  return out
}

/**
 * Colour utilities only. `font-kinnso-*` or a spacing scale would resolve
 * against a different token namespace, so they are deliberately not matched.
 */
const UTILITY = /\b(?:bg|text|border|ring|outline|divide|from|to|via|fill|stroke|accent|caret|decoration|placeholder|shadow)-kinnso-([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)(?:\/\d+)?/g

describe('kinnso colour token coverage', () => {
  const css = readFileSync(cssPath, 'utf8')
  const defined = new Set(
    [...css.matchAll(/--color-kinnso-([A-Za-z0-9]+):/g)].map((m) => m[1]),
  )

  it('defines the canonical border token the editorial layer relies on', () => {
    // Guards the specific swap this test was written for: `kinnso-edge` is the
    // real border token, `kinnso-line` never existed.
    expect(defined.has('edge')).toBe(true)
    expect(defined.has('line')).toBe(false)
  })

  it('every kinnso colour utility used in source resolves to a defined token', () => {
    const missing = new Map<string, string[]>()

    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFiles(join(webRoot, root))) {
        const text = readFileSync(file, 'utf8')
        for (const match of text.matchAll(UTILITY)) {
          const name = match[1]
          if (defined.has(name)) continue
          const rel = file.slice(webRoot.length + 1).split(sep).join('/')
          missing.set(name, [...(missing.get(name) ?? []), rel])
        }
      }
    }

    // Report the token AND where it is used, so a failure is actionable without
    // re-running a grep.
    const report = [...missing.entries()].map(
      ([name, files]) => `kinnso-${name} (${files.length} uses, e.g. ${files[0]})`,
    )
    expect(report).toEqual([])
  })
})
