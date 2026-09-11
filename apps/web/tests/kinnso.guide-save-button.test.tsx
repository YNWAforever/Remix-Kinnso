// apps/web/tests/kinnso.guide-save-button.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { pushMock, refreshMock } = vi.hoisted(() => ({ pushMock: vi.fn(), refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, refresh: refreshMock }) }))

const { saveGuideActionMock, unsaveGuideActionMock } = vi.hoisted(() => ({
  saveGuideActionMock: vi.fn(async () => ({ ok: true, guideId: 'g1' })),
  unsaveGuideActionMock: vi.fn(async () => ({ ok: true, guideId: 'g1' })),
}))
vi.mock('@/lib/saves/guide-actions', () => ({
  saveGuideAction: saveGuideActionMock,
  unsaveGuideAction: unsaveGuideActionMock,
}))

import { GuideSaveButton } from '@/components/kinnso/GuideSaveButton'
import { safeNext } from '@/lib/auth/safe-next'
import en from '@/lib/i18n/messages/en'

afterEach(() => {
  cleanup()
  pushMock.mockClear()
})

describe('GuideSaveButton', () => {
  it('routes an anon click to sign-in carrying this guide as the return destination', () => {
    window.history.replaceState({}, '', '/en/g/kowloon-noodles')
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={false} t={en.guideSave} />)
    fireEvent.click(screen.getByRole('button'))

    expect(pushMock).toHaveBeenCalledWith('/en/sign-in?next=%2Fen%2Fg%2Fkowloon-noodles')
    expect(saveGuideActionMock).not.toHaveBeenCalled()
  })

  it('preserves the query string of the page it interrupted', () => {
    window.history.replaceState({}, '', '/en/g/kowloon-noodles?from=explore')
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={false} t={en.guideSave} />)
    fireEvent.click(screen.getByRole('button'))

    const href = pushMock.mock.calls.at(-1)?.[0] as string
    const next = new URLSearchParams(href.split('?')[1]).get('next')
    expect(safeNext(next ?? undefined, 'en')).toBe('/en/g/kowloon-noodles?from=explore')
  })

  it('falls back to a bare sign-in when the current page is not under this locale', () => {
    // Defence in depth: the destination must be vouched for, never reflected.
    window.history.replaceState({}, '', '/zh-hk/g/kowloon-noodles')
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={false} t={en.guideSave} />)
    fireEvent.click(screen.getByRole('button'))

    expect(pushMock).toHaveBeenCalledWith('/en/sign-in')
  })

  it('shows "Sign in to save" (not "Save") for an anon viewer, and conveys toggle state via aria-pressed', () => {
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={false} t={en.guideSave} />)
    expect(screen.getByRole('button', { name: en.guideSave.signInToSave })).toBeInTheDocument()
  })

  it('sets aria-pressed to reflect the saved state for a signed-in traveller', () => {
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={true} signedIn={true} t={en.guideSave} />)
    expect(screen.getByRole('button', { name: en.guideSave.saved })).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls saveGuideAction and flips to the saved label for a signed-in traveller', async () => {
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={true} t={en.guideSave} />)
    fireEvent.click(screen.getByRole('button', { name: en.guideSave.save }))
    await waitFor(() => expect(saveGuideActionMock).toHaveBeenCalledWith('en', 'g1'))
    await screen.findByRole('button', { name: en.guideSave.saved })
    expect(refreshMock).toHaveBeenCalled()
  })

  it('calls unsaveGuideAction when already saved', async () => {
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={true} signedIn={true} t={en.guideSave} />)
    fireEvent.click(screen.getByRole('button', { name: en.guideSave.saved }))
    await waitFor(() => expect(unsaveGuideActionMock).toHaveBeenCalledWith('en', 'g1'))
    await screen.findByRole('button', { name: en.guideSave.save })
  })
})
