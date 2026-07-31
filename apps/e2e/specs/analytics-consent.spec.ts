import { expect, test } from '@playwright/test'

const LOCAL_BASE_URL = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/
const PROHIBITED_PAYLOAD_KEYS = /email|ip|user-agent|prompt|query/i

function isApprovedAnalyticsE2eTarget(): boolean {
  const baseURL = process.env.E2E_BASE_URL ?? ''
  return LOCAL_BASE_URL.test(baseURL) || process.env.ANALYTICS_E2E_TEST_MODE === 'true'
}

function assertApprovedAnalyticsE2eTarget(): void {
  if (!isApprovedAnalyticsE2eTarget()) {
    throw new Error(
      'analytics-consent.spec.ts only runs against localhost or an explicitly test-mode Preview (set ANALYTICS_E2E_TEST_MODE=true).',
    )
  }
}

test.describe('analytics consent privacy boundary', () => {
  test.beforeEach(() => {
    assertApprovedAnalyticsE2eTarget()
  })

  test('sends only the opted-in journey payload and stops after revocation', async ({ page }) => {
    const payloads: unknown[] = []

    await page.route('**/api/analytics', async (route) => {
      const request = route.request()
      payloads.push(request.postDataJSON())
      await route.fulfill({ status: 202, contentType: 'application/json', body: '{"status":"discarded"}' })
    })

    await page.goto('/en/explore')
    await expect(page.getByRole('dialog', { name: 'Help improve KINNSO' })).toBeVisible()
    expect(payloads).toHaveLength(0)

    await page.getByRole('button', { name: 'Accept measurement' }).click()
    await expect.poll(() => payloads.length).toBeGreaterThan(0)

    expect(payloads[0]).toMatchObject({ event: 'journey_started', consentVersion: 'v1' })
    for (const payload of payloads) {
      expect(JSON.stringify(payload)).not.toMatch(PROHIBITED_PAYLOAD_KEYS)
    }

    await page.getByRole('button', { name: 'Change measurement preference' }).click()
    const requestCountAfterRevocation = payloads.length

    const response = await page.goto('/en/explore?after-consent-revocation=1')
    expect(response?.ok()).toBeTruthy()
    await page.waitForTimeout(250)
    expect(payloads).toHaveLength(requestCountAfterRevocation)
  })

  test('keeps public navigation usable when ingest returns 503', async ({ page }) => {
    let analyticsRequests = 0

    await page.route('**/api/analytics', async (route) => {
      analyticsRequests += 1
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' })
    })

    await page.goto('/en/explore')
    await page.getByRole('button', { name: 'Accept measurement' }).click()
    await expect.poll(() => analyticsRequests).toBeGreaterThan(0)

    const response = await page.goto('/en')
    expect(response?.ok()).toBeTruthy()
    await expect(page.getByRole('banner')).toBeVisible()
  })
})
