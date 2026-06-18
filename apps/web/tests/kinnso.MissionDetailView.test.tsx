// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionDetailView } from '@/components/kinnso/pages/MissionDetailView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('MissionDetailView', () => {
  it('lets merchant approve an applicant', () => {
    const onReviewParticipant = vi.fn()
    render(<MissionDetailView t={en.missions} mission={{
      id: 'm1',
      title: 'Hybrid mission',
      participants: [{ id: 'p1', creatorName: 'Creator One', status: 'applied' }],
      submissions: [],
    }} onReviewParticipant={onReviewParticipant} onReviewSubmission={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: en.missions.approve }))
    expect(onReviewParticipant).toHaveBeenCalledWith('p1', 'approve')
  })
})
