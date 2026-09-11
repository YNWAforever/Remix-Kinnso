import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A Tailwind utility naming a token that does not exist produces no class at
 * all under Tailwind v4 — so `border border-kinnso-line` rendered a border with
 * no colour, and `<Button>` rendered with no background. Both look completely
 * correct in source, which is why review never caught either.
 *
 * Key-parity style checks cannot catch this class of bug: the token is absent,
 * not wrong. The only durable guard is to compare what source *uses* against
 * what globals.css *defines*.
 *
 * Two deliberate design choices here, both learned the hard way while writing
 * this file:
 *
 *  - Plain literal regexes. A `new RegExp(String.raw`...${names}...`)` version
 *    silently matched nothing and the suite passed anyway, proving nothing.
 *  - Every scan asserts it actually matched something. A scan that quietly
 *    matches nothing passes forever — the same false confidence this file
 *    exists to remove.
 */

const webRoot = resolve(__dirname, '..')
const cssPath = join(webRoot, 'app/globals.css')
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
 * Walked once and shared. Re-walking per describe cost enough to trip the 5s
 * per-test timeout in a full run — the same defect this repo already hit in
 * media.source-contract.
 */
const appSources = [
  ...sourceFiles(join(webRoot, 'app')),
  ...sourceFiles(join(webRoot, 'components')),
]
const uiSources = sourceFiles(join(webRoot, 'components/ui'))
const css = readFileSync(cssPath, 'utf8')

/** Colour utilities only; a font or spacing scale resolves elsewhere. */
const KINNSO_UTILITY =
  /(?:bg|text|border|ring|outline|divide|from|to|via|fill|stroke|accent|caret|decoration|placeholder|shadow)-kinnso-([A-Za-z0-9]+)/g

/**
 * shadcn's second vocabulary. Spelled out rather than matched loosely, or it
 * would match every ordinary utility like `bg-white`.
 */
const SHADCN_UTILITY =
  /(?:bg|text|border|ring|outline|divide|fill|stroke)-(background|foreground|primary|secondary|muted|accent|destructive|popover|card|input|ring|border)(-foreground)?/g

function scan(files: string[], marker: string, pattern: RegExp) {
  const seen = new Set<string>()
  const where = new Map<string, string>()
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    if (!text.includes(marker)) continue
    for (const match of text.matchAll(pattern)) {
      const name = `${match[1]}${match[2] ?? ''}`
      seen.add(name)
      if (!where.has(name)) where.set(name, file.slice(webRoot.length + 1).split(sep).join('/'))
    }
  }
  return { seen, where }
}

const report = (missing: string[], where: Map<string, string>, prefix: string) =>
  missing.map((name) => `${prefix}${name} (e.g. ${where.get(name)})`)

describe('kinnso colour token coverage', () => {
  const defined = new Set(
    [...css.matchAll(/--color-kinnso-([A-Za-z0-9]+):/g)].map((m) => m[1]),
  )

  it('defines the canonical border token the editorial layer relies on', () => {
    // The specific swap this file was written for: `kinnso-edge` is the real
    // border token; `kinnso-line` was used 130 times and never existed.
    expect(defined.has('edge')).toBe(true)
    expect(defined.has('line')).toBe(false)
  })

  it('every kinnso colour utility used in source resolves to a defined token', () => {
    const { seen, where } = scan(appSources, '-kinnso-', KINNSO_UTILITY)

    expect(seen.size, 'scan matched nothing — regex or path is wrong').toBeGreaterThan(5)
    expect(seen.has('edge'), 'expected the app to use a kinnso-edge utility').toBe(true)

    const missing = [...seen].filter((name) => !defined.has(name))
    expect(report(missing, where, 'kinnso-')).toEqual([])
  })
})

describe('shadcn primitive token coverage', () => {
  const defined = new Set([...css.matchAll(/--color-([a-z-]+):/g)].map((m) => m[1]))

  it('every shadcn token used by components/ui resolves to a defined token', () => {
    const { seen, where } = scan(uiSources, '-', SHADCN_UTILITY)

    expect(seen.size, 'scan matched nothing — regex or path is wrong').toBeGreaterThan(5)
    expect(seen.has('primary'), 'expected components/ui to use bg-primary').toBe(true)

    const missing = [...seen].filter((name) => !defined.has(name))
    expect(report(missing, where, '--color-')).toEqual([])
  })

  it('keeps the shadcn aliases pointed at canonical kinnso values', () => {
    // Aliases, not a second palette: if these drift the app grows two colour
    // systems that disagree.
    expect(css).toMatch(/--color-primary:\s*#B94000/) // kinnso-orange
    expect(css).toMatch(/--color-ring:\s*#B94000/)
    expect(css).toMatch(/--color-input:\s*#DED5C7/) // kinnso-edge
    expect(css).toMatch(/--color-border:\s*#DED5C7/)
    expect(css).toMatch(/--color-destructive:\s*#D24A3B/) // kinnso-red
  })
})
