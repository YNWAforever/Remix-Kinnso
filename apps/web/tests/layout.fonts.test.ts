import { describe, it, expect, vi } from 'vitest'

// next/font/google factories are not callable under vitest (no SWC font
// transform) — stub them, same pattern as tests/layout.siteChrome.test.tsx.
// Each stub echoes the `variable` option it was called with, so the assertions
// below bind layout.tsx's option strings to the var(--font-*) references that
// globals.css uses.
vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: (o: { variable: string }) => ({ variable: o.variable }),
  DM_Sans: (o: { variable: string }) => ({ variable: o.variable }),
  JetBrains_Mono: (o: { variable: string }) => ({ variable: o.variable }),
  Fraunces: (o: { variable: string }) => ({ variable: o.variable }),
  Inter: (o: { variable: string }) => ({ variable: o.variable }),
}))

import { fontVariables } from '@/app/layout'

describe('R1A typography wiring', () => {
  it('exposes Fraunces + Inter variables alongside the legacy fonts', () => {
    for (const v of ['--font-fraunces', '--font-inter', '--font-bricolage', '--font-dm-sans', '--font-jetbrains-mono']) {
      expect(fontVariables).toContain(v)
    }
  })
})
