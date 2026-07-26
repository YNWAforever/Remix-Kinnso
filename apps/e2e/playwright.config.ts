import { defineConfig, devices } from '@playwright/test'
import {
  PROFILE_ENQUIRIES_LOCAL_DUMMY_SECRET,
  resolveProfileEnquiriesLocalConfig,
} from './profile-enquiries-local'

const local = resolveProfileEnquiriesLocalConfig(process.env)
const port = new URL(local.baseURL).port || '3000'

Object.assign(process.env, {
  SUPABASE_URL: local.supabaseUrl,
  SUPABASE_ANON_KEY: local.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
  SUPABASE_DB_CONTAINER: local.dbContainer,
})

export default defineConfig({
  testDir: './specs',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  timeout: process.env.CI ? 120_000 : 30_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: local.baseURL, trace: 'on-first-retry' },
  webServer: {
    command: `pnpm --filter web exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: local.baseURL,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: local.supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
      ENQUIRY_SUBMISSION_SECRET: PROFILE_ENQUIRIES_LOCAL_DUMMY_SECRET,
      VERCEL: '1',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})