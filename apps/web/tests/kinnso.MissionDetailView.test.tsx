// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionDetailView } from '@/components/kinnso/pages/MissionDetailView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('MissionDetailView', () => {
  const mission = {
    id: 'm1',
    title: 'Hybrid mission',
    participants: [{ id: 'p1', creatorName: 'Creator One', status: 'applied' }],
    submissions: [],
  }

  it('lets merchant approve an applicant', () => {
    const onReviewParticipant = vi.fn()
    render(<MissionDetailView t={en.missions} mission={mission} onReviewParticipant={onReviewParticipant} onReviewSubmission={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: en.missions.approve }))
    expect(onReviewParticipant).toHaveBeenCalledWith('p1', 'approve')
  })

  it('shows review errors returned by the server', async () => {
    const onReviewParticipant = vi.fn(async () => ({
      ok: false,
      errors: { form: ['Merchant access is required'] },
    }))
    render(<MissionDetailView t={en.missions} mission={mission} onReviewParticipant={onReviewParticipant} onReviewSubmission={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: en.missions.approve }))

    expect((await screen.findByRole('alert')).textContent).toContain('Merchant access is required')
  })
})
