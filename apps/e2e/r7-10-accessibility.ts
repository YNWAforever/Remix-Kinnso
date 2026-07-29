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
    `[${routeId}] ${violation.id} (${violation.impact ?? 'unknown'}) at ${node.target.join(' > ')}${violation.help ? `: ${violation.help}` : ''}`
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
