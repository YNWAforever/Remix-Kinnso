import type { Locator, Page } from '@playwright/test'
import type { R710RouteId } from './r7-10-routes'

export interface AxeException {
  routeId: R710RouteId
  ruleId: string
  target: string
  reason: string
  owner: string
  reviewWhen: string
}

type AxeTargetPart = string | readonly string[]

export interface AxeViolationNode {
  target: readonly AxeTargetPart[]
}

export interface AxeViolation {
  id: string
  impact?: string | null
  help?: string
  helpUrl?: string
  nodes: readonly AxeViolationNode[]
}

export const AXE_EXCEPTIONS: readonly AxeException[] = []

type UnapprovedViolation<T extends AxeViolation> = Omit<T, 'nodes'> & {
  nodes: Array<T['nodes'][number]>
}

export function unapprovedViolations<T extends AxeViolation>(
  routeId: R710RouteId,
  violations: readonly T[],
  exceptions: readonly AxeException[] = AXE_EXCEPTIONS,
): Array<UnapprovedViolation<T>> {
  return violations.flatMap((violation) => {
    const nodes = violation.nodes.filter((node) => !exceptions.some((exception) => (
      exception.routeId === routeId
      && exception.ruleId === violation.id
      && exception.target === node.target.join(' > ')
    )))

    return nodes.length > 0 ? [{ ...violation, nodes }] : []
  })
}

export function formatAxeViolations(routeId: R710RouteId, violations: readonly AxeViolation[]): string {
  return violations.flatMap((violation) => violation.nodes.map((node) => (
    `[${routeId}] ${violation.id} (${violation.impact ?? 'unknown'}) at ${node.target.join(' > ')}${violation.help ? `: ${violation.help}` : ''}${violation.helpUrl ? ` (${violation.helpUrl})` : ''}`
  ))).join('\n')
}

export async function tabTo(page: Page, locator: Locator, maxTabs = 60): Promise<void> {
  const target = await locator.evaluate((element) => {
    const html = element as HTMLElement
    const label = html.getAttribute('aria-label') ?? (html as HTMLInputElement).labels?.[0]?.textContent?.trim() ?? html.textContent?.trim()
    return label ? `${html.tagName.toLowerCase()}[${label.replace(/\s+/g, ' ').slice(0, 120)}]` : html.tagName.toLowerCase()
  })
  const visited: string[] = []

  for (let tabs = 0; tabs < maxTabs; tabs += 1) {
    await page.keyboard.press('Tab')
    const active = await page.evaluate(() => {
      const html = document.activeElement as HTMLElement | null
      if (!html) return 'none'
      const label = html.getAttribute('aria-label') ?? (html as HTMLInputElement).labels?.[0]?.textContent?.trim() ?? html.textContent?.trim()
      return label ? `${html.tagName.toLowerCase()}[${label.replace(/\s+/g, ' ').slice(0, 120)}]` : html.tagName.toLowerCase()
    })
    visited.push(active)
    if (await locator.evaluate((element) => document.activeElement === element)) return
  }

  throw new Error(`Unable to reach ${target} within ${maxTabs} Tab presses; visited: ${visited.join(' -> ')}`)
}

export interface FocusStyleSnapshot {
  outlineStyle: string
  outlineWidth: string
  outlineColor: string
  boxShadow: string
}

function hasVisibleColor(value: string): boolean {
  const colors = value.match(/(?:rgba?|hsla?)\([^)]*\)|#[\da-f]{3,8}\b|\btransparent\b/gi) ?? []
  return colors.some((color) => {
    const normalized = color.trim().toLowerCase()
    if (normalized === 'transparent') return false
    if (normalized.startsWith('#')) {
      const alpha = normalized.length === 5 || normalized.length === 9 ? normalized.at(-1) : undefined
      return alpha === undefined || alpha !== '0'
    }
    if (normalized.startsWith('rgba') || normalized.startsWith('hsla')) {
      const body = normalized.slice(normalized.indexOf('(') + 1, -1)
      const alpha = body.includes('/')
        ? body.slice(body.lastIndexOf('/') + 1).trim()
        : body.split(',').at(-1)?.trim()
      return alpha !== undefined && Number(alpha) > 0
    }
    return true
  })
}

function hasNonzeroExtent(boxShadow: string): boolean {
  const geometry = boxShadow.replace(/(?:rgba?|hsla?)\([^)]*\)|#[\da-f]{3,8}\b|\btransparent\b/gi, '')
  return [...geometry.matchAll(/-?(?:\d+|\d*\.\d+)(?:px|em|rem|pt|pc|vh|vw|vmin|vmax|%)/gi)]
    .some((match) => Number.parseFloat(match[0]) !== 0)
}

export function hasMeaningfulFocusIndicator(
  baseline: FocusStyleSnapshot,
  focused: FocusStyleSnapshot,
): boolean {
  const outlineChanged = baseline.outlineStyle !== focused.outlineStyle
    || baseline.outlineWidth !== focused.outlineWidth
    || baseline.outlineColor !== focused.outlineColor
  const hasVisibleOutline = !['none', 'hidden'].includes(focused.outlineStyle)
    && Number.parseFloat(focused.outlineWidth) > 0
    && hasVisibleColor(focused.outlineColor)

  if (outlineChanged && hasVisibleOutline) return true

  return baseline.boxShadow !== focused.boxShadow
    && focused.boxShadow !== 'none'
    && hasVisibleColor(focused.boxShadow)
    && hasNonzeroExtent(focused.boxShadow)
}
export interface LayoutShiftEntry {
  value: number
  startTime: number
  hadRecentInput: boolean
}

export function calculateCLS(entries: readonly LayoutShiftEntry[]): number {
  let maximum = 0
  let sessionStart = 0
  let sessionValue = 0
  let previousStart = 0

  for (const entry of entries
    .filter((candidate) => !candidate.hadRecentInput)
    .sort((left, right) => left.startTime - right.startTime)) {
    const continuesSession = sessionValue > 0
      && entry.startTime - previousStart < 1_000
      && entry.startTime - sessionStart <= 5_000

    if (continuesSession) {
      sessionValue += entry.value
    } else {
      sessionStart = entry.startTime
      sessionValue = entry.value
    }
    previousStart = entry.startTime
    maximum = Math.max(maximum, sessionValue)
  }

  return maximum
}

export async function installLayoutShiftObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type BrowserLayoutShiftEntry = {
      value: number
      startTime: number
      hadRecentInput: boolean
    }
    type ObserverState = 'ready' | 'unsupported' | 'failed'
    const target = window as typeof window & {
      __r710LayoutShifts?: BrowserLayoutShiftEntry[]
      __r710LayoutShiftObserverState?: ObserverState
    }
    const entries: BrowserLayoutShiftEntry[] = []
    target.__r710LayoutShifts = entries

    if (!('PerformanceObserver' in window)) {
      target.__r710LayoutShiftObserverState = 'unsupported'
      return
    }

    try {
      new PerformanceObserver((list) => {
        try {
          for (const entry of list.getEntries()) {
            const layoutShift = entry as PerformanceEntry & Partial<BrowserLayoutShiftEntry>
            if (typeof layoutShift.value === 'number') {
              entries.push({
                value: layoutShift.value,
                startTime: layoutShift.startTime,
                hadRecentInput: layoutShift.hadRecentInput === true,
              })
            }
          }
        } catch {
          target.__r710LayoutShiftObserverState = 'failed'
        }
      }).observe({ type: 'layout-shift', buffered: true })
      target.__r710LayoutShiftObserverState = 'ready'
    } catch {
      target.__r710LayoutShiftObserverState = 'failed'
    }
  })
}

export async function readCLS(page: Page): Promise<number> {
  const observation = await page.evaluate(() => {
    const target = window as typeof window & {
      __r710LayoutShifts?: LayoutShiftEntry[]
      __r710LayoutShiftObserverState?: 'ready' | 'unsupported' | 'failed'
    }
    return {
      entries: target.__r710LayoutShifts ?? [],
      state: target.__r710LayoutShiftObserverState,
    }
  })
  if (observation.state === 'unsupported') throw new Error('Layout-shift observation is unsupported')
  if (observation.state !== 'ready') throw new Error('Layout-shift observation failed')

  return calculateCLS(observation.entries)
}

export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, viewportWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))

  if (scrollWidth > viewportWidth) {
    throw new Error(`Document horizontal overflow: scrollWidth ${scrollWidth} exceeds viewport width ${viewportWidth}`)
  }
}

export async function waitForRoute(
  page: Page,
  route: import('./r7-10-routes').R710Route,
) {
  const response = await page.goto(route.path)
  const status = response?.status()
  if (status !== 200) {
    throw new Error(`[${route.id}] expected HTTP 200 for ${route.path}, received ${status ?? 'no response'}`)
  }
  await page.getByRole(route.ready.role, { level: route.ready.level }).first().waitFor({ state: 'visible' })
  return response
}

/**
 * Fonts loaded, in-viewport images decoded, two animation frames passed. Used before
 * any layout assertion so a measurement is not taken mid-paint. Deliberately polls
 * rather than sleeping: a fixed timeout is both slower and flakier, and the
 * no-fixed-sleeps meta-test forbids one.
 */
export async function waitForVisualSettlement(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.waitForFunction(() => Array.from(document.images)
    .filter((image) => {
      const bounds = image.getBoundingClientRect()
      return bounds.bottom > 0 && bounds.right > 0 && bounds.top < window.innerHeight && bounds.left < window.innerWidth
    })
    .every((image) => image.complete))
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}
