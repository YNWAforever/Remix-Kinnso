import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(resolve(process.cwd(), '../..', '.github/workflows/ci.yml'), 'utf8')
const startupStep = workflow.match(
  /- name: Start scan worker \(fixture mode\) and web app[\s\S]*?(?=\n\s{6}- name:)/,
)?.[0]

describe('CI product-state startup contract', () => {
  it('starts the E2E server in the locked Agent ON and Booking OFF state', () => {
    expect(startupStep).toContain("AGENT_LIVE: 'true'")
    expect(startupStep).toContain("BOOKING_LIVE: 'false'")
    expect(startupStep).toContain("VERCEL: '1'")
  })

  it('bounds the readiness wait so a failed background server cannot hang CI', () => {
    expect(startupStep).toContain('wait-on --timeout 120000')
  })
})
