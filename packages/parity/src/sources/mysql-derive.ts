import type { LegacyPostBundle } from '@kinnso/sync'
import { isPostLive } from '@kinnso/sync'
import { LOCALES } from '../locales'
import {
  projectLegacyArticle,
  UnroutableCategoryError,
  type ProjectedArticle,
  type PublicArticleView,
} from './mysql-baseline'

/**
 * Errors that mean the baseline could not be MEASURED. The CLI maps these to exit 2
 * (misconfiguration), which is distinct from exit 1 (measured, and it failed). A gate
 * that cannot measure must never report success — that is the property the
 * MYSQL_MODE_NOT_IMPLEMENTED refusal was protecting, and it survives these changes.
 */
export class EmptyBaselineError extends Error {
  name = 'EmptyBaselineError'
}
export class ScanIncompleteError extends Error {
  name = 'ScanIncompleteError'
}
export class TranslationCeilingExceededError extends Error {
  name = 'TranslationCeilingExceededError'
}

export interface SeoLossEntry {
  view: PublicArticleView
  reason: 'publication_gate' | 'date_unparseable'
  /** Locale-fanned paths that legacy served and the new stack will not. */
  paths: string[]
  /** Paths covered by a redirect row, so the URL still resolves (301). */
  rescuedPaths: string[]
  unrescuedPaths: string[]
  /** Verbatim warning codes from the transform, so the operator sees WHY. */
  reasonCodes: string[]
}

export interface MysqlBaselineSnapshot {
  scanned: number
  livePostCount: number
  expectedUrlPaths: Set<string>
  localeCounts: Record<string, number>
  seoLoss: SeoLossEntry[]
  negativePaths: string[]
  boundaryExcluded: PublicArticleView[]
  /** Provenance, echoed so a report can be reproduced. */
  now: string
  cdnBase: string
  legacyTimezone: string
}

/** The slice of LegacyReader the derivation needs; lets tests pass a fake with no pool. */
export interface BaselineReader {
  streamPostBundles(opts?: { pageSize?: number }): AsyncGenerator<LegacyPostBundle, void, void>
  livePostCount(): Promise<number>
  legacyTranslationCeiling(): Promise<Record<string, number>>
  sampleNonLivePostIds(limit?: number): Promise<number[]>
  fetchPostBundle(id: number): Promise<LegacyPostBundle | null>
}

export interface DeriveOptions {
  cdnBase: string
  legacyTimezone: string
  now: Date
  windowGuardMs?: number
  negativeSample?: number
  pageSize?: number
  /** Redirect rows, injected so this module never opens a Supabase client of its own. */
  redirects: () => Promise<Array<{ from_path: string; to_path: string }>>
}

export async function deriveMysqlBaseline(
  reader: BaselineReader,
  opts: DeriveOptions,
): Promise<MysqlBaselineSnapshot> {
  const windowGuardMs = opts.windowGuardMs ?? 600_000
  const negativeSample = opts.negativeSample ?? 25
  const projectOpts = { legacyTimezone: opts.legacyTimezone, now: opts.now, windowGuardMs }

  const livePostCount = await reader.livePostCount()

  const projected: ProjectedArticle[] = []
  const unroutable: Array<{ legacyPostId: number; category: string; url: string }> = []
  let scanned = 0

  for await (const bundle of reader.streamPostBundles({ pageSize: opts.pageSize })) {
    scanned++
    const p = projectLegacyArticle(bundle, opts.cdnBase, projectOpts)
    if (p.canonicalPath === null) {
      unroutable.push({ legacyPostId: p.view.legacyPostId, category: p.view.category, url: p.view.url })
    }
    projected.push(p)
  }

  // Aggregate rather than throwing on the first: one error means one cutover attempt,
  // not N. Checked before the empty test so the real cause is the one reported.
  if (unroutable.length > 0) throw new UnroutableCategoryError(unroutable)

  if (scanned === 0) {
    throw new EmptyBaselineError(
      'The legacy scan yielded no posts, so every check would compare against an empty ' +
        'baseline and pass vacuously. Refusing to certify a cutover that was never measured.',
    )
  }

  // A scan that stopped early would under-report drift while looking healthy.
  if (scanned !== livePostCount) {
    throw new ScanIncompleteError(
      `Scanned ${scanned} posts but the legacy database reports ${livePostCount} live posts. ` +
        'The scan was truncated, so the baseline is incomplete and cannot certify a cutover.',
    )
  }

  const visible = projected.filter((p) => p.visible)
  if (visible.length === 0) {
    throw new EmptyBaselineError(
      `Scanned ${scanned} posts but none are visible on the new stack, so the expected URL set ` +
        'is empty and every check would pass vacuously.',
    )
  }

  const expectedUrlPaths = new Set<string>()
  const localeCounts: Record<string, number> = {}
  for (const p of visible) {
    for (const path of p.paths) expectedUrlPaths.add(path)
    // Tallied from the SAME snapshot as expectedUrlPaths, never a separate query, so the
    // two methods cannot describe different sets.
    for (const locale of p.view.locales) localeCounts[locale] = (localeCounts[locale] ?? 0) + 1
  }

  // Independent upper bound from SQL. The baseline is built in TypeScript, so exceeding
  // the ceiling means the fan-out invented a locale.
  const ceiling = await reader.legacyTranslationCeiling()
  for (const [locale, count] of Object.entries(localeCounts)) {
    const max = ceiling[locale] ?? 0
    if (count > max) {
      throw new TranslationCeilingExceededError(
        `Baseline counts ${count} visible "${locale}" translations but legacy holds at most ${max}. ` +
          'The baseline fan-out is wrong; it would fail row-counts against a correct new stack.',
      )
    }
  }

  const redirectRows = await opts.redirects()
  const redirectFrom = new Set(redirectRows.map((r) => r.from_path))

  const seoLoss: SeoLossEntry[] = projected
    .filter((p) => p.suppression === 'publication_gate' || p.suppression === 'date_unparseable')
    .map((p) => {
      // A loss path is rescued only when its LOCALE-STRIPPED form is a redirect source:
      // seo_redirects.from_path is locale-agnostic and resolve.ts strips the locale first.
      const rescued = p.canonicalPath !== null && redirectFrom.has(p.canonicalPath)
      return {
        view: p.view,
        reason: p.suppression as 'publication_gate' | 'date_unparseable',
        paths: p.paths,
        rescuedPaths: rescued ? p.paths : [],
        unrescuedPaths: rescued ? [] : p.paths,
        reasonCodes: [...new Set(p.warnings.filter((w) => w.kind === 'publication').map((w) => w.code))],
      }
    })

  const rescuedPaths = new Set(seoLoss.flatMap((e) => e.rescuedPaths))

  // Negatives must 404. A rescued path 301s, so asserting 404 on it would fail wrongly.
  const negativeFromWindow = projected
    .filter((p) => p.suppression === 'not_yet_published' || p.suppression === 'expired')
    .flatMap((p) => p.paths)

  // A locale with no translation row is a real 404 the gate should assert.
  const missingTranslation = visible.flatMap((p) =>
    p.canonicalPath === null
      ? []
      : LOCALES.filter((l) => !p.view.locales.includes(l)).map((l) => `/${l}${p.canonicalPath}`),
  )

  const nonLive = await collectNonLiveNegatives(reader, opts, projectOpts, negativeSample)

  const negativePaths = [
    ...new Set([...negativeFromWindow, ...missingTranslation, ...nonLive]),
  ]
    .filter((path) => !expectedUrlPaths.has(path) && !rescuedPaths.has(path))
    .sort()
    .slice(0, negativeSample * 3)

  return {
    scanned,
    livePostCount,
    expectedUrlPaths,
    localeCounts,
    seoLoss,
    negativePaths,
    boundaryExcluded: projected.filter((p) => p.suppression === 'window_boundary').map((p) => p.view),
    now: opts.now.toISOString(),
    cdnBase: opts.cdnBase,
    legacyTimezone: opts.legacyTimezone,
  }
}

/**
 * Draft / soft-deleted articles, as negative fixtures. The SQL predicate is only a
 * candidate generator — every row is re-asserted with `!isPostLive` in TypeScript, so a
 * SQL/TS disagreement drops the row rather than producing a wrong assertion.
 */
async function collectNonLiveNegatives(
  reader: BaselineReader,
  opts: DeriveOptions,
  projectOpts: { legacyTimezone: string; now: Date; windowGuardMs: number },
  limit: number,
): Promise<string[]> {
  const ids = await reader.sampleNonLivePostIds(limit)
  const out: string[] = []
  for (const id of ids) {
    const bundle = await reader.fetchPostBundle(id)
    if (!bundle || isPostLive(bundle.post)) continue
    const p = projectLegacyArticle(bundle, opts.cdnBase, projectOpts)
    out.push(...p.paths)
  }
  return out
}
