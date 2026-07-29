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
