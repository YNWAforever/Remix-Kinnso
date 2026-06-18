import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'https://remix-kinnso-web.vercel.app'

export default defineConfig({
  testDir: './specs',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0, // tolerate cold-isolate redirect-map timeout
  // The onboarding journey chains 3 sequential 30s waits plus cold next-dev
  // route compilation, which cannot fit Playwright's default 30s per-test cap.
  timeout: process.env.CI ? 120_000 : 30_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
