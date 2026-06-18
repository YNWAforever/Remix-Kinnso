// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MerchantMissionsView } from '@/components/kinnso/pages/MerchantMissionsView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('MerchantMissionsView', () => {
  it('shows mission status and participant counts', () => {
    render(<MerchantMissionsView t={en.missions} missions={[{
      id: 'm1',
      title: 'Paid reel campaign',
      status: 'published',
      participantCount: 2,
      pendingCount: 1,
      settlementStatus: 'pending',
    }]} />)
    expect(screen.getByText('Paid reel campaign')).toBeTruthy()
    expect(screen.getByText(/2/)).toBeTruthy()
    expect(screen.getByText(/pending/i)).toBeTruthy()
  })
})
