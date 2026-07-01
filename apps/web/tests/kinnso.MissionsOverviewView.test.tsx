// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Messages } from '@/lib/i18n/messages/en'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin/missions' }))

import { MissionsOverviewView } from '@/components/kinnso/admin/missions/MissionsOverviewView'

const t = {
  title: 'Missions', subtitle: 'Every merchant mission, platform-wide.',
  tabOverview: 'Overview', tabDirectory: 'Directory',
  kpiTotal: 'Total missions', kpiPublished: 'Published', kpiDraft: 'Draft', kpiPaused: 'Paused',
  kpiCompleted: 'Completed', kpiCancelled: 'Cancelled', kpiOpenForApplications: 'Open for applications',
  kpiSubmissionsAwaitingReview: 'Awaiting review',
  trendMissionsCreated: 'Missions created', trendSubmissionsReviewed: 'Submissions reviewed', trendEmpty: 'No data yet',
  atRiskTitle: 'At risk', atRiskEmpty: 'Nothing at risk right now',
  reasonPublishedNoParticipants: 'Published, no participants', reasonStalledSubmissions: 'Stalled submission',
  reasonVerificationFailed: 'Verification failed',
} as unknown as Messages['missionsOps']

describe('MissionsOverviewView', () => {
  it('renders KPI values and an at-risk row', () => {
    render(
      <MissionsOverviewView
        t={t}
        locale="en"
        overview={{
          kpis: { total: 6, byStatus: { published: 4 }, byType: {}, byVisibility: {}, openForApplications: 4, submissionsAwaitingReview: 2 },
          missionsCreated: [], submissionsReviewed: [],
          atRisk: [{ id: 'm1', title: 'Tokyo Winter Stays Showcase', merchantName: 'Sunrise Stays HK', reason: 'stalled_submissions' }],
        }}
      />,
    )
    expect(screen.getByText('6')).toBeTruthy()
    expect(screen.getByText('Tokyo Winter Stays Showcase')).toBeTruthy()
    expect(screen.getByText('Stalled submission')).toBeTruthy()
  })

  it('shows the empty-state copy when nothing is at risk', () => {
    render(
      <MissionsOverviewView
        t={t}
        locale="en"
        overview={{
          kpis: { total: 0, byStatus: {}, byType: {}, byVisibility: {}, openForApplications: 0, submissionsAwaitingReview: 0 },
          missionsCreated: [], submissionsReviewed: [], atRisk: [],
        }}
      />,
    )
    expect(screen.getByText('Nothing at risk right now')).toBeTruthy()
  })
})
