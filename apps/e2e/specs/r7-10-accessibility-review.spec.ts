import { expect, test } from '@playwright/test'
import {
  calculateCLS,
  formatAxeViolations,
  installLayoutShiftObserver,
  readCLS,
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
