import { expect, test, type Page } from '@playwright/test'
import {
  assertNoHorizontalOverflow,
  clippedElements,
  installLayoutShiftObserver,
  isExcepted,
  readCLS,
  waitForRoute,
  waitForVisualSettlement,
  type ElementBox,
} from '../r7-10-accessibility'
import { R7_10_ROUTES, type R710Route } from '../r7-10-routes'

/**
 * Story 21: viewports and zoom.
 *
 * These MODEL zoom rather than drive it. Playwright cannot operate native browser
 * chrome zoom, so:
 *   - WCAG 1.4.4 Resize text -> root font-size scaled to 200% at 1280px wide
 *   - WCAG 1.4.10 Reflow     -> viewport narrowed to 320 CSS px
 * 320px is the standard's own definition of reflow, not an approximation of it. Do not
 * read these as proof that native browser zoom behaves identically.
 */
const WIDTHS = [380, 768, 1280, 1440] as const

async function measureTextBoxes(page: Page): Promise<ElementBox[]> {
  return page.evaluate(() => Array.from(
    document.querySelectorAll<HTMLElement>('main :is(p, h1, h2, h3, h4, li, dd, dt, button, a)'),
  )
    .filter((element) => element.getClientRects().length > 0 && Boolean(element.textContent?.trim()))
    .map((element) => {
      const first = String(element.className || '').split(/\s+/)[0]
      return {
        label: `${element.tagName.toLowerCase()}${first ? `.${first}` : ''}`,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }
    }))
}

test.describe('R7.10 viewports and zoom', () => {
  for (const route of R7_10_ROUTES as readonly R710Route[]) {
    for (const width of WIDTHS) {
      test(`${route.id}: no overflow and stable layout at ${width}px`, async ({ page }) => {
        test.skip(isExcepted(route.id, 'viewport-overflow'), 'recorded in A11Y_EXCEPTIONS')
        await page.setViewportSize({ width, height: 900 })
        await installLayoutShiftObserver(page)
        await waitForRoute(page, route)
        await waitForVisualSettlement(page)

        await assertNoHorizontalOverflow(page)
        await expect(page.getByRole(route.ready.role, { level: route.ready.level }).first()).toBeVisible()

        if (!isExcepted(route.id, 'viewport-cls')) {
          expect(await readCLS(page), `${route.id} at ${width}px must keep unexpected CLS at or below 0.1`)
            .toBeLessThanOrEqual(0.1)
        }
      })
    }

    test(`${route.id}: text stays unclipped at 200% (WCAG 1.4.4)`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'text-200'), 'recorded in A11Y_EXCEPTIONS')
      await page.setViewportSize({ width: 1280, height: 900 })
      await waitForRoute(page, route)
      await waitForVisualSettlement(page)

      // Baseline first. Some elements are deliberately truncated at EVERY size --
      // `line-clamp` on card summaries, for instance -- and reporting those would bury
      // the real signal under intentional design. WCAG 1.4.4 concerns content lost BY
      // resizing, so only an element that becomes clipped when the text scales counts.
      const before = await measureTextBoxes(page)

      // Models browser text zoom. Applied after load so it cannot affect hydration.
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
      await waitForVisualSettlement(page)
      const after = await measureTextBoxes(page)

      expect(before.length, `${route.id} measured no text — selector or route is wrong`).toBeGreaterThan(0)
      // Compared index-by-index, so repeated labels (six `h2.k2-display`, say) cannot
      // mask each other the way a label set would.
      expect(after.length, `${route.id} element set changed under zoom; indexes cannot be compared`)
        .toBe(before.length)

      const clipped = (box: ElementBox) => clippedElements([box]).length > 0
      const newlyClipped = after
        .map((box, index) => ({ box, index }))
        .filter(({ box, index }) => clipped(box) && !clipped(before[index]))
        .map(({ box }) => box.label)

      expect(newlyClipped, `${route.id} clips text at 200% that was intact at 100%`).toEqual([])
      await assertNoHorizontalOverflow(page)
    })

    test(`${route.id}: reflows at 320px without horizontal scrolling (WCAG 1.4.10)`, async ({ page }) => {
      test.skip(isExcepted(route.id, 'reflow-320'), 'recorded in A11Y_EXCEPTIONS')
      await page.setViewportSize({ width: 320, height: 900 })
      await waitForRoute(page, route)
      await waitForVisualSettlement(page)

      await assertNoHorizontalOverflow(page)
      // "No content loss" is not decidable from outside, so assert the specific things
      // a reflowed page must retain rather than pretending to prove the general claim.
      await expect(page.getByRole(route.ready.role, { level: route.ready.level }).first()).toBeVisible()
      await expect(page.getByRole('main')).toHaveCount(1)
      await expect(page.getByRole('banner')).toHaveCount(1)
    })
  }
})
