import { describe, expect, it } from 'vitest'
import { filterAnalyticsRows, parseAnalyticsDashboardFilters, toAnalyticsReportWindow } from '@/lib/admin/analytics-dashboard'

describe('parseAnalyticsDashboardFilters', () => {
  it('uses safe defaults', () => {
    expect(parseAnalyticsDashboardFilters({})).toEqual({ window: '7d', locale: 'all', entity: 'all', booking: 'all' })
  })

  it('accepts only allowlisted values and drops arbitrary strings', () => {
    expect(parseAnalyticsDashboardFilters({ window: '24h', locale: 'zh-hk', entity: 'experience', booking: 'on' }))
      .toEqual({ window: '24h', locale: 'zh-hk', entity: 'experience', booking: 'on' })
    expect(parseAnalyticsDashboardFilters({ window: '30d', locale: 'DROP TABLE', entity: 'unknown', booking: 'maybe' }))
      .toEqual({ window: '7d', locale: 'all', entity: 'all', booking: 'all' })
  })

  it('uses the first value when Next supplies a string array', () => {
    expect(parseAnalyticsDashboardFilters({ window: ['24h', '7d'], locale: ['en'] })).toMatchObject({ window: '24h', locale: 'en' })
  })
})

describe('toAnalyticsReportWindow', () => {
  const now = new Date('2026-08-08T12:00:00.000Z')

  it('returns exact UTC ISO boundaries for both presets', () => {
    expect(toAnalyticsReportWindow({ window: '24h', locale: 'all', entity: 'all', booking: 'all' }, now))
      .toEqual({ from: '2026-08-07T12:00:00.000Z', to: '2026-08-08T12:00:00.000Z' })
    expect(toAnalyticsReportWindow({ window: '7d', locale: 'all', entity: 'all', booking: 'all' }, now))
      .toEqual({ from: '2026-08-01T12:00:00.000Z', to: '2026-08-08T12:00:00.000Z' })
  })
})

describe('filterAnalyticsRows', () => {
  const rows = [
    { metricKey: 'entity_to_cta', locale: 'en', entityType: 'guide', bookingState: 'off', numerator: 2, denominator: 10, rate: 0.2, sampleCount: 10, status: 'ok', attributionWindowDays: 7 },
    { metricKey: 'entity_to_cta', locale: 'zh-hk', entityType: 'experience', bookingState: 'on', numerator: 1, denominator: 4, rate: null, sampleCount: 4, status: 'insufficient_sample', attributionWindowDays: 7 },
  ] as const

  it('keeps only rows matching every selected dimension', () => {
    expect(filterAnalyticsRows([...rows], { window: '7d', locale: 'en', entity: 'guide', booking: 'off' })).toEqual([rows[0]])
    expect(filterAnalyticsRows([...rows], { window: '7d', locale: 'all', entity: 'all', booking: 'all' })).toEqual(rows)
  })
})
