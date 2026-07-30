import { expect, test } from '@playwright/test'
import {
  calculateCLS,
  formatAxeViolations,
  hasMeaningfulFocusIndicator,
  installLayoutShiftObserver,
  readCLS,
  type FocusStyleSnapshot,
} from '../r7-10-accessibility'

test('axe diagnostics include rule, impact, target, and help URL', () => {
  expect(formatAxeViolations('home', [{
    id: 'color-contrast', impact: 'serious', help: 'Contrast help',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.12/color-contrast',
    nodes: [{ target: ['main', '.card'] }],
  }])).toContain('https://dequeuniversity.com/rules/axe/4.12/color-contrast')
})

test('CLS includes a shift exactly five seconds after its session begins', () => {
  expect(calculateCLS([
    { value: 0.01, startTime: 0, hadRecentInput: false },
    { value: 0.01, startTime: 900, hadRecentInput: false },
    { value: 0.01, startTime: 1_800, hadRecentInput: false },
    { value: 0.01, startTime: 2_700, hadRecentInput: false },
    { value: 0.01, startTime: 3_600, hadRecentInput: false },
    { value: 0.01, startTime: 4_500, hadRecentInput: false },
    { value: 0.04, startTime: 5_000, hadRecentInput: false },
  ])).toBeCloseTo(0.1)
})

test('CLS refuses to report a zero score when layout-shift observation setup fails', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'PerformanceObserver', { configurable: true, value: undefined }))
  await installLayoutShiftObserver(page)
  await page.goto('about:blank')
  await expect(readCLS(page)).rejects.toThrow(/layout.shift.*(unsupported|failed)|(unsupported|failed).*layout.shift/i)
})

test('focus indicator requires a focus-induced visible outline or ring', async () => {
  const base: FocusStyleSnapshot = {
    outlineStyle: 'none', outlineWidth: '0px', outlineColor: 'rgba(0, 0, 0, 0)', boxShadow: 'none',
  }
  const cases: Array<{ name: string; baseline: FocusStyleSnapshot; focused: FocusStyleSnapshot; expected: boolean }> = [
    {
      name: 'accepts a changed opaque outline with width', baseline: base,
      focused: { ...base, outlineStyle: 'solid', outlineWidth: '2px', outlineColor: 'rgb(194, 65, 12)' }, expected: true,
    },
    {
      name: 'accepts a changed opaque focus ring with spread', baseline: base,
      focused: { ...base, boxShadow: 'rgb(194, 65, 12) 0px 0px 0px 2px' }, expected: true,
    },
    {
      name: 'rejects unchanged permanent decorative shadow',
      baseline: { ...base, boxShadow: 'rgb(0, 0, 0) 0px 2px 8px 0px' },
      focused: { ...base, boxShadow: 'rgb(0, 0, 0) 0px 2px 8px 0px' }, expected: false,
    },
    {
      name: 'rejects a zero-width outline', baseline: base,
      focused: { ...base, outlineStyle: 'solid', outlineWidth: '0px', outlineColor: 'rgb(194, 65, 12)' }, expected: false,
    },
    {
      name: 'rejects a transparent outline', baseline: base,
      focused: { ...base, outlineStyle: 'solid', outlineWidth: '2px', outlineColor: 'rgba(194, 65, 12, 0)' }, expected: false,
    },
    {
      name: 'rejects a zero-extent ring', baseline: base,
      focused: { ...base, boxShadow: 'rgb(194, 65, 12) 0px 0px 0px 0px' }, expected: false,
    },
    {
      name: 'rejects a transparent ring', baseline: base,
      focused: { ...base, boxShadow: 'rgba(194, 65, 12, 0) 0px 0px 0px 2px' }, expected: false,
    },
  ]

  for (const { name, baseline, focused, expected } of cases) {
    expect(hasMeaningfulFocusIndicator(baseline, focused), name).toBe(expected)
  }
})
