import { describe, it, expect } from 'vitest'
import { gateDecision } from '@/lib/auth/gate'

describe('gateDecision', () => {
  // ---- creator/* paths ----
  it('allows an authenticated user to access /en/creator', () => {
    expect(gateDecision('/en/creator', true)).toEqual({ type: 'allow' })
  })

  it('allows an authenticated user on a deep creator path', () => {
    expect(gateDecision('/zh-hk/creator/settings', true)).toEqual({ type: 'allow' })
  })

  it('redirects an unauthenticated user from /en/creator to /en/sign-in', () => {
    expect(gateDecision('/en/creator', false)).toEqual({
      type: 'redirect',
      location: '/en/sign-in',
    })
  })

  it('redirects an unauthenticated user from /ja/creator/profile to /ja/sign-in', () => {
    expect(gateDecision('/ja/creator/profile', false)).toEqual({
      type: 'redirect',
      location: '/ja/sign-in',
    })
  })

  it('redirects an unauthenticated user from /ko/creator to /ko/sign-in', () => {
    expect(gateDecision('/ko/creator', false)).toEqual({
      type: 'redirect',
      location: '/ko/sign-in',
    })
  })

  it('redirects unauthenticated users from merchant mission creation', () => {
    expect(gateDecision('/en/merchants/post', false)).toEqual({
      type: 'redirect',
      location: '/en/sign-in',
    })
  })

  it('redirects unauthenticated users from merchant mission list', () => {
    expect(gateDecision('/zh-hk/merchants/missions', false)).toEqual({
      type: 'redirect',
      location: '/zh-hk/sign-in',
    })
  })

  it('redirects unauthenticated users from creator missions', () => {
    expect(gateDecision('/ja/studio/missions', false)).toEqual({
      type: 'redirect',
      location: '/ja/sign-in',
    })
  })

  it('redirects unauthenticated users from ops settlement queue', () => {
    expect(gateDecision('/en/ops/settlements', false)).toEqual({
      type: 'redirect',
      location: '/en/sign-in',
    })
  })

  // ---- non-creator paths — always allow regardless of auth ----
  it('allows any user on a public path', () => {
    expect(gateDecision('/en/articles', false)).toEqual({ type: 'allow' })
  })

  it('allows a non-authenticated user on sign-in', () => {
    expect(gateDecision('/en/sign-in', false)).toEqual({ type: 'allow' })
  })

  it('allows a non-authenticated user on sign-up', () => {
    expect(gateDecision('/en/sign-up', false)).toEqual({ type: 'allow' })
  })

  it('allows auth callback regardless of auth state', () => {
    expect(gateDecision('/en/auth/callback', false)).toEqual({ type: 'allow' })
  })

  // ---- edge: locale prefix extraction ----
  it('handles all 7 locales', () => {
    for (const locale of ['en', 'zh-hk', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th']) {
      expect(gateDecision(`/${locale}/creator`, false)).toEqual({
        type: 'redirect',
        location: `/${locale}/sign-in`,
      })
    }
  })

  // ---- edge: no locale prefix — should not match creator gate ----
  it('allows /creator (no locale prefix) — locale guard in proxy handles the prefix', () => {
    expect(gateDecision('/creator', false)).toEqual({ type: 'allow' })
  })
})
