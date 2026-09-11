import { readdir } from 'node:fs/promises'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import {
  A11Y_EXCEPTIONS,
  AXE_EXCEPTIONS,
  formatAxeViolations,
  unapprovedViolations,
} from '../r7-10-accessibility'
import { R7_10_OFF_SPECS, R7_10_PREVIEW_SPECS } from '../r7-10-specs'
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

// Exact contents, not merely shape: a suppression must appear in a diff and be argued
// for in review, the same standard AXE_EXCEPTIONS is held to. The reason text below is
// transcribed independently from r7-10-accessibility.ts's NAVBAR_OVERFLOW_REASON (not
// imported) so that editing a reason there without touching this file fails this test.
const NAVBAR_OVERFLOW_REASON = "Shared Navbar.tsx desktop chrome (baseAnchors nav + "
  + "audienceAnchors/LocaleSwitcher/CTA, both gated xl:flex) renders starting exactly at "
  + "the xl breakpoint (1280px). CSS pins min-width media queries to a nominal 16px root "
  + "font-size, so the breakpoint does not move when text is zoomed, but the rem-sized "
  + "gaps/padding/type inside the nav do scale -- at 200% zoom the row that barely fits "
  + "at 1280px/100% needs roughly double its width (document scrollWidth grows to "
  + "~2324-2479px against the 1280px viewport). Needs a redesign of how the desktop nav "
  + "degrades under text zoom (an overflow/priority-nav pattern, container-query-driven "
  + "breakpoints, or fewer top-row items), not a token or class change."

test('R7.10 a11y exception ledger has exactly the approved entries', () => {
  expect(A11Y_EXCEPTIONS).toEqual([
    {
      routeId: 'home',
      check: 'text-200',
      reason: NAVBAR_OVERFLOW_REASON,
      owner: 'Design',
      reviewWhen: 'Before public launch',
    },
    {
      routeId: 'explore',
      check: 'text-200',
      reason: `${NAVBAR_OVERFLOW_REASON} Explore also has its own, separate issue: `
        + "ExploreControls.tsx's lg:grid-cols-[14rem_minmax(0,1fr)] destination-filter "
        + "sidebar column is sized in rem, so it grows from 224px to 448px at 200% zoom and "
        + "steals space from the adjoining 3-column guide-card grid in "
        + "ExploreDiscovery.tsx, shrinking each GuideCard's content column to ~78px -- too "
        + "narrow for its eyebrow/title text even once wrapped. Needs a redesigned filter "
        + "layout (a fixed-px sidebar width, fewer grid columns at high zoom, or a "
        + "collapsible filter panel), not a contained CSS change.",
      owner: 'Design',
      reviewWhen: 'Before public launch',
    },
    {
      routeId: 'guide',
      check: 'text-200',
      reason: NAVBAR_OVERFLOW_REASON,
      owner: 'Design',
      reviewWhen: 'Before public launch',
    },
    {
      routeId: 'experience',
      check: 'text-200',
      reason: NAVBAR_OVERFLOW_REASON,
      owner: 'Design',
      reviewWhen: 'Before public launch',
    },
    {
      routeId: 'article',
      check: 'text-200',
      reason: NAVBAR_OVERFLOW_REASON,
      owner: 'Design',
      reviewWhen: 'Before public launch',
    },
    {
      routeId: 'creator-landing',
      check: 'text-200',
      reason: NAVBAR_OVERFLOW_REASON,
      owner: 'Design',
      reviewWhen: 'Before public launch',
    },
    {
      routeId: 'merchant-landing',
      check: 'text-200',
      reason: NAVBAR_OVERFLOW_REASON,
      owner: 'Design',
      reviewWhen: 'Before public launch',
    },
    {
      routeId: 'creator-directory',
      check: 'text-200',
      reason: `${NAVBAR_OVERFLOW_REASON} creator-directory also has its own, separate `
        + "issue: CreatorsLandingView.tsx's creator-bio preview "
        + '(<p className="mt-3 line-clamp-2">{c.bio}</p>) is clamped to 2 lines; a short '
        + "bio that fits on 1 line at 100% zoom needs 3 lines at 200% zoom and is newly "
        + "truncated by the clamp for the first time. The full bio stays reachable via the "
        + "profile link, so nothing is permanently lost, but it's a product/design call "
        + "whether to raise the clamp or resize the card at high zoom rather than a "
        + "code-only fix.",
      owner: 'Design',
      reviewWhen: 'Before public launch',
    },
    {
      routeId: 'merchant-directory',
      check: 'text-200',
      reason: NAVBAR_OVERFLOW_REASON,
      owner: 'Design',
      reviewWhen: 'Before public launch',
    },
  ])
})

test('every a11y exception carries a reason, an owner and a review date', () => {
  for (const entry of A11Y_EXCEPTIONS) {
    expect(entry.reason.trim(), `${entry.routeId}/${entry.check} needs a reason`).not.toBe('')
    expect(entry.owner.trim(), `${entry.routeId}/${entry.check} needs an owner`).not.toBe('')
    expect(entry.reviewWhen.trim(), `${entry.routeId}/${entry.check} needs a review date`).not.toBe('')
  }
})

// A spec file that no config selects runs nowhere and protects nothing. That has
// already happened here once: r7-10-accessibility-review.spec.ts matched only the
// default config, which nothing runs any more. This makes it a failure, not a silence.
test('every R7.10 spec on disk is selected by a config', async () => {
  const names = (await readdir(new URL('.', import.meta.url)))
    .filter((name) => /^r7-10-.*\.spec\.ts$/.test(name))
    .sort()

  expect(names.length, 'scan matched nothing — glob or path is wrong').toBeGreaterThan(3)

  const registered = new Set<string>([...R7_10_OFF_SPECS, ...R7_10_PREVIEW_SPECS])
  expect(names.filter((name) => !registered.has(name))).toEqual([])
})
