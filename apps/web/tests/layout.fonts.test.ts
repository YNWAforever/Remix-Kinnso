import { describe, it, expect, vi } from 'vitest'

// next/font/google factories are not callable under vitest (no SWC font
// transform) — stub them to `{ variable }`, same pattern as
// tests/layout.siteChrome.test.tsx.
vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ variable: 'font-bricolage' }),
  DM_Sans: () => ({ variable: 'font-dm-sans' }),
  JetBrains_Mono: () => ({ variable: 'font-jetbrains-mono' }),
  Fraunces: () => ({ variable: 'font-fraunces' }),
  Inter: () => ({ variable: 'font-inter' }),
}))

import { fontVariables } from '@/app/layout'

describe('R1A typography wiring', () => {
  it('exposes Fraunces + Inter variables alongside the legacy fonts', () => {
    for (const v of ['font-fraunces', 'font-inter', 'font-bricolage', 'font-dm-sans', 'font-jetbrains-mono']) {
      expect(fontVariables).toContain(v)
    }
  })
})
