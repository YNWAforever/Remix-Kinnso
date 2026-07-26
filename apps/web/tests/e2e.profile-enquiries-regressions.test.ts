import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanupOwnedEnquiries } from '../../e2e/profile-enquiries-cleanup'

const e2e = (file: string) => readFileSync(resolve(import.meta.dirname, '../../e2e', file), 'utf8')

describe('profile enquiries Playwright isolation', () => {
  it('keeps the shared config reusable and puts local opt-in before a non-reused profile server starts', () => {
    const base = e2e('playwright.config.ts')
    const profile = e2e('playwright.profile-enquiries.config.ts')
    const localBoundary = e2e('profile-enquiries-local.ts')

    expect(base).not.toContain('resolveProfileEnquiriesLocalConfig')
    expect(localBoundary).toContain("if (env[PROFILE_ENQUIRIES_LOCAL_OPT_IN] !== '1')")
    expect(profile).toContain('const local = resolveProfileEnquiriesLocalConfig(process.env)')
    expect(profile.indexOf('const local = resolveProfileEnquiriesLocalConfig(process.env)')).toBeLessThan(profile.indexOf('webServer:'))
    expect(profile).toContain('reuseExistingServer: false')
  })

  it('deletes a creator-only submission discovered during teardown when normal ID capture never ran', async () => {
    const trackedIds: string[] = []
    const calls: string[] = []
    const result = await cleanupOwnedEnquiries(
      async (emails) => {
        expect(emails).toEqual(['creator@example.test', 'merchant@example.test'])
        return { data: [{ id: 'creator-enquiry-id' }], error: null }
      },
      ['creator@example.test', 'merchant@example.test'],
      trackedIds,
      async (ids) => { calls.push(`audit:${ids.join(',')}`); return { error: null } },
      async (ids) => { calls.push(`enquiries:${ids.join(',')}`); return { error: null } },
    )

    expect(trackedIds).toEqual(['creator-enquiry-id'])
    expect(calls).toEqual(['audit:creator-enquiry-id', 'enquiries:creator-enquiry-id'])
    expect(result.errors).toEqual([])
  })
})