import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(resolve(process.cwd(), '../..', '.github/workflows/ci.yml'), 'utf8')
const verificationWorkflow = readFileSync(resolve(process.cwd(), '../..', '.github/workflows/verify.yml'), 'utf8')
const previewSmokeJob = verificationWorkflow.match(/  preview-smoke:[\s\S]*$/)?.[0]
const startupStep = workflow.match(
  /- name: Start scan worker \(fixture mode\)[\s\S]*?(?=\n\s{6}- name:)/,
)?.[0]

describe('CI product-state startup contract', () => {
  it('keeps the fixture scan worker separate from the Playwright-owned web server', () => {
    expect(startupStep).toContain('SCAN_FIXTURE_MODE=1 pnpm --filter @kinnso/scan-app start &')
    expect(startupStep).not.toContain('pnpm --filter web dev &')
    expect(startupStep).toContain('http://localhost:8788/health')
    expect(startupStep).not.toContain('http://localhost:3000')
  })

  it('bounds the readiness wait so a failed background server cannot hang CI', () => {
    expect(startupStep).toContain('wait-on --timeout 120000')
  })

  it('runs the original Agent ON and Booking OFF smoke journey through the R7.10 OFF server', () => {
    expect(workflow).toContain("AGENT_LIVE: 'true'")
    expect(workflow).toContain("BOOKING_LIVE: 'false'")
    expect(workflow).toContain("R7_10_BOOKING_STATE: 'off'")
    expect(workflow).toContain('pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts')
  })

  it('runs R7.10 accessibility checks in isolated Booking OFF and test-keyed Booking ON states', () => {
    expect(workflow).toContain("R7_10_BOOKING_STATE: 'off'")
    expect(workflow).toContain("R7_10_BOOKING_STATE: 'on'")
    expect(workflow).toContain('secrets.STRIPE_SECRET_KEY')
    expect(workflow).toContain('secrets.STRIPE_WEBHOOK_SECRET')
    expect(workflow).toContain('playwright.r7-10.config.ts')
  })

  it('retains Playwright failure evidence', () => {
    expect(workflow).toContain('apps/e2e/test-results/')
    expect(workflow).toContain('apps/e2e/playwright-report/')
  })

  it('runs read-only manifest smoke only after a successful KINNSO Preview deployment', () => {
    expect(previewSmokeJob).toContain('preview-smoke:')
    expect(previewSmokeJob).toContain("github.event.deployment_status.environment == 'Preview'")
    expect(previewSmokeJob).toContain("github.event.deployment_status.state == 'success'")
    expect(previewSmokeJob).toContain("contains(github.event.deployment_status.environment_url, 'remix-kinnso-web')")
    expect(previewSmokeJob).toContain('E2E_BASE_URL: ${{ github.event.deployment_status.environment_url }}')
    expect(previewSmokeJob).toContain('pnpm --filter @kinnso/e2e e2e r7-10-preview-smoke')
    expect(previewSmokeJob).not.toContain('secrets.')
    expect(previewSmokeJob).not.toContain('NEXT_PUBLIC_SUPABASE_')
  })
})
