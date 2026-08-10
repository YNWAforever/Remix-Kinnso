import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import {
  AXE_EXCEPTIONS,
  formatAxeViolations,
  unapprovedViolations,
} from '../r7-10-accessibility'
import { R7_10_ROUTES } from '../r7-10-routes'

test('R7.10 route manifest declares the exact browser coverage contract', () => {
  expect(R7_10_ROUTES).toHaveLength(9)
  expect(R7_10_ROUTES.map((route) => route.path)).toEqual([
    '/en',
    '/en/explore',
    '/en/g/r7-smoke-tokyo-guide',
    '/en/experiences/r7-smoke-tokyo-experience',
    '/en/articles/dining/ramen-guide',
    '/en/for-creators',
    '/en/for-merchants',
    '/en/creators',
    '/en/merchants',
  ])
  expect(new Set(R7_10_ROUTES.map((route) => route.id)).size).toBe(R7_10_ROUTES.length)
  expect(new Set(R7_10_ROUTES.map((route) => route.path)).size).toBe(R7_10_ROUTES.length)
  expect(R7_10_ROUTES.every((route) => route.ready.role === 'heading' && route.ready.level === 1)).toBe(true)
})

test('R7.10 axe exception ledger starts empty', () => {
  expect(AXE_EXCEPTIONS).toEqual([])
})

test('R7.10 axe filtering removes only exactly approved nodes', () => {
  const violation = {
    id: 'color-contrast',
    impact: 'serious',
    help: 'Elements must meet minimum color contrast ratio thresholds',
    nodes: [
      { target: ['main', '.approved-node'] },
      { target: ['main', '.unapproved-node'] },
    ],
  } as const
  const exceptions = [
    {
      routeId: 'home' as const,
      ruleId: 'color-contrast',
      target: 'main > .approved-node',
      reason: 'Recorded for a scoped fixture',
      owner: 'Accessibility',
      reviewWhen: 'Before release',
    },
  ]

  const remaining = unapprovedViolations('home', [violation], exceptions)

  expect(remaining).toHaveLength(1)
  expect(remaining[0]?.nodes).toEqual([{ target: ['main', '.unapproved-node'] }])
  expect(formatAxeViolations('home', remaining)).toBe(
    '[home] color-contrast (serious) at main > .unapproved-node: Elements must meet minimum color contrast ratio thresholds',
  )
})

test('R7.10 axe helpers accept direct axe results', () => {
  type AxeViolations = Awaited<ReturnType<AxeBuilder['analyze']>>['violations']
  const axeViolations = [] as AxeViolations

  expect(unapprovedViolations('home', axeViolations)).toEqual([])
})
