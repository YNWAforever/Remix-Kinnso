import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import {
  assertNoHorizontalOverflow,
  calculateCLS,
  formatAxeViolations,
  installLayoutShiftObserver,
  readCLS,
  tabTo,
  unapprovedViolations,
  waitForRoute,
} from '../r7-10-accessibility'
import { AXE_EXCEPTIONS } from '../r7-10-accessibility'
import { R7_10_ROUTES, type R710Route } from '../r7-10-routes'

async function waitForVisualSettlement(page: Parameters<typeof installLayoutShiftObserver>[0]) {
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

async function expectVisibleFocus(locator: Parameters<typeof tabTo>[1]) {
  await expect(locator).toBeFocused()
  await expect(locator).toHaveCSS('outline-style', 'solid')
}

test('CLS uses the largest input-free session window instead of a page-lifetime sum', () => {
  expect(calculateCLS([
    { value: 0.04, startTime: 0, hadRecentInput: false },
    { value: 0.04, startTime: 900, hadRecentInput: false },
    { value: 0.04, startTime: 1800, hadRecentInput: false },
    { value: 0.04, startTime: 2700, hadRecentInput: false },
    { value: 0.04, startTime: 3600, hadRecentInput: false },
    { value: 0.04, startTime: 4500, hadRecentInput: false },
    { value: 0.04, startTime: 5400, hadRecentInput: false },
    { value: 1, startTime: 5500, hadRecentInput: true },
  ])).toBeCloseTo(0.24)
})

test.describe('R7.10 rendered accessibility contracts', () => {
  for (const route of R7_10_ROUTES) {
    test(`${route.id}: zero critical or serious axe findings`, async ({ page }) => {
      await waitForRoute(page, route)
      const results = await new AxeBuilder({ page }).analyze()
      const relevant = results.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious',
      )
      const unapproved = unapprovedViolations(route.id, relevant, AXE_EXCEPTIONS)

      expect(unapproved, formatAxeViolations(route.id, unapproved)).toEqual([])
    })

    test(`${route.id}: remains usable without overflow or unexpected CLS at 380px`, async ({ page }) => {
      await page.setViewportSize({ width: 380, height: 844 })
      await installLayoutShiftObserver(page)
      await waitForRoute(page, route)
      await waitForVisualSettlement(page)

      await assertNoHorizontalOverflow(page)
      expect(await readCLS(page), `${route.id} must keep unexpected CLS at or below 0.1`).toBeLessThanOrEqual(0.1)
    })
  }
})

const DESKTOP_PRIMARY_HREFS = [
  '/en/explore', '/en/destinations', '/en/articles', '/en/agent', '/en/creators',
  '/en/merchants', '/en/for-creators', '/en/for-merchants', '/en/sign-in', '/en/sign-up',
] as const
const MOBILE_PRIMARY_HREFS = [
  '/en/explore', '/en/destinations', '/en/articles', '/en/agent', '/en/creators',
  '/en/merchants', '/en/for-creators', '/en/for-merchants', '/en/sign-in', '/en/sign-up',
] as const
const LOCALE_SWITCHER = { role: 'combobox' as const, name: 'Language' }

test('desktop header advances one Tab through explicit links and LocaleSwitcher', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await waitForRoute(page, R7_10_ROUTES[0] as R710Route)
  const header = page.getByRole('banner')
  const assertControl = async (control: ReturnType<typeof header.locator>) => {
    await expect(control).toBeFocused()
    await expect(control).toBeVisible()
  }

  const logo = header.getByRole('link', { name: 'KINNSO', exact: true })
  await tabTo(page, logo)
  await assertControl(logo)
  for (const href of DESKTOP_PRIMARY_HREFS.slice(0, 8)) {
    await page.keyboard.press('Tab')
    await assertControl(header.locator(`a[href="${href}"]`))
  }
  await page.keyboard.press('Tab')
  await assertControl(header.getByRole(LOCALE_SWITCHER.role, { name: LOCALE_SWITCHER.name }))
  for (const href of DESKTOP_PRIMARY_HREFS.slice(8)) {
    await page.keyboard.press('Tab')
    await assertControl(header.locator(`a[href="${href}"]`))
  }

  await page.goto('/en')
  const explore = header.locator('a[href="/en/explore"]')
  await tabTo(page, explore)
  await expectVisibleFocus(explore)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/en\/explore$/)
})

for (const route of R7_10_ROUTES.filter((entry) => 'mobileHeaderJourney' in entry && entry.mobileHeaderJourney)) {
  test(`${route.id}: mobile header keeps primary destinations inside its named dialog`, async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 844 })
    await waitForRoute(page, route)

    const trigger = page.getByRole('button', { name: /menu/i })
    const triggerControl = page.locator('[data-slot="dialog-trigger"]')
    await tabTo(page, trigger)
    await expectVisibleFocus(trigger)
    await page.keyboard.press('Enter')
    await expect(triggerControl).toHaveAttribute('aria-expanded', 'true')

    const dialog = page.getByRole('dialog', { name: /menu/i })
    await expect(dialog).toBeVisible()
    const primaryHrefs = MOBILE_PRIMARY_HREFS
    for (const href of primaryHrefs) await expect(dialog.locator(`a[href="${href}"]`)).toBeVisible()

    const assertFocusedDialogControl = async (control: ReturnType<typeof dialog.locator>) => {
      await expect(control).toBeFocused()
      await expect(control).toBeVisible()
      expect(await control.evaluate((element) => element.closest('[role="dialog"]') !== null)).toBe(true)
    }
    const assertFocusIsInDialog = async (href: string) => {
      await assertFocusedDialogControl(dialog.locator(`a[href="${href}"]`))
    }

    await tabTo(page, dialog.locator(`a[href="${primaryHrefs[0]}"]`))
    await assertFocusIsInDialog(primaryHrefs[0])
    for (const href of primaryHrefs.slice(1, 8)) {
      await page.keyboard.press('Tab')
      await assertFocusIsInDialog(href)
    }
    await page.keyboard.press('Tab')
    await assertFocusedDialogControl(dialog.getByRole(LOCALE_SWITCHER.role, { name: LOCALE_SWITCHER.name }))
    for (const href of primaryHrefs.slice(8)) {
      await page.keyboard.press('Tab')
      await assertFocusIsInDialog(href)
    }
    await page.keyboard.press('Shift+Tab')
    await assertFocusIsInDialog(primaryHrefs[8])
    await page.keyboard.press('Shift+Tab')
    await assertFocusedDialogControl(dialog.getByRole(LOCALE_SWITCHER.role, { name: LOCALE_SWITCHER.name }))
    for (const href of primaryHrefs.slice(0, 8).reverse()) {
      await page.keyboard.press('Shift+Tab')
      await assertFocusIsInDialog(href)
    }

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(triggerControl).toBeFocused()
  })
}
