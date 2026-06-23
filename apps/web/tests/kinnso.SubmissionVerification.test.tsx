// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { channelMock, fromMock, retryMock } = vi.hoisted(() => ({
  channelMock: vi.fn(),
  fromMock: vi.fn(),
  retryMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
    from: fromMock,
  }),
}))
vi.mock('@/lib/missions/verify-client', () => ({
  startVerification: vi.fn(),
  retryVerification: retryMock,
}))

import { SubmissionVerification } from '@/components/kinnso/SubmissionVerification'
import en from '@/lib/i18n/messages/en'

afterEach(() => { cleanup(); vi.clearAllMocks() })

const jobSelect = (row: unknown) => ({
  select: () => ({ eq: () => ({ single: async () => ({ data: row }) }) }),
})

describe('SubmissionVerification', () => {
  it('shows the verifying state for a queued job', async () => {
    fromMock.mockReturnValue(jobSelect({ id: 'job-1', status: 'queued', confidence_status: null, error: null }))
    render(<SubmissionVerification jobId="job-1" t={en.missionDetail} />)
    await waitFor(() => expect(screen.getByText(en.missionDetail.verifying)).toBeTruthy())
  })

  it('shows the verified signal when ready + verified_signal', async () => {
    fromMock.mockReturnValue(jobSelect({ id: 'job-1', status: 'ready', confidence_status: 'verified_signal', error: null }))
    render(<SubmissionVerification jobId="job-1" t={en.missionDetail} />)
    await waitFor(() => expect(screen.getByText(en.missionDetail.verifiedSignal)).toBeTruthy())
  })

  it('shows the failure + retry on a failed job', async () => {
    fromMock.mockReturnValue(jobSelect({ id: 'job-1', status: 'failed', confidence_status: null, error: 'boom' }))
    render(<SubmissionVerification jobId="job-1" t={en.missionDetail} />)
    await waitFor(() => expect(screen.getByRole('button', { name: en.missionDetail.retry })).toBeTruthy())
  })
})
