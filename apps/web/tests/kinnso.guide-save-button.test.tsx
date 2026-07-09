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
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('GuideSaveButton', () => {
  it('routes an anon click to sign-in without calling any save action', () => {
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={false} t={en.guideSave} />)
    fireEvent.click(screen.getByRole('button'))
    expect(pushMock).toHaveBeenCalledWith('/en/sign-in')
    expect(saveGuideActionMock).not.toHaveBeenCalled()
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
