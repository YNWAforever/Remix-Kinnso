// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { AdminAnalyticsView } from '@/components/kinnso/admin/analytics/AdminAnalyticsView'

afterEach(cleanup)

const filters = { window: '7d' as const, locale: 'all' as const, entity: 'all' as const, booking: 'all' as const }
const report = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-08T00:00:00.000Z',
  timezone: 'UTC' as const,
  attributionWindowDays: 7 as const,
  rows: [
    { metricKey: 'entity_to_cta', locale: 'en', entityType: 'guide', bookingState: 'off', numerator: 2, denominator: 10, rate: 0.2, sampleCount: 10, status: 'ok', attributionWindowDays: 7 },
    { metricKey: 'entity_to_cta', locale: 'zh-hk', entityType: 'experience', bookingState: 'on', numerator: 1, denominator: 4, rate: null, sampleCount: 4, status: 'insufficient_sample', attributionWindowDays: 7 },
  ],
}

describe('AdminAnalyticsView', () => {
  it('renders active window/filter links and the aggregate table', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={report} error={null} />)
    expect(screen.getByRole('link', { name: en.admin.analyticsWindow7d }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: en.admin.analyticsWindow24h }).getAttribute('href')).toContain('window=24h')
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: en.admin.analyticsMetric })).toBeTruthy()
  })

  it('shows a rate only for ok rows and explains insufficient samples', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={report} error={null} />)
    expect(screen.getByText('20%')).toBeTruthy()
    expect(screen.getByText(en.admin.analyticsInsufficientSample)).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('renders generic unavailable and zero-data copy without raw identifiers', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={null} error="unavailable" />)
    expect(screen.getByRole('alert')).toHaveTextContent(en.admin.analyticsUnavailable)
    expect(screen.queryByText('journey-id')).toBeNull()
  })

  it('renders an explicit empty state when the aggregate adapter returns no rows', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={{ ...report, rows: [] }} error={null} />)
    expect(screen.getByText(en.admin.analyticsEmpty)).toBeTruthy()
  })

  it('preserves every current query value when a filter control changes one value', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={{ window: '24h', locale: 'zh-hk', entity: 'experience', booking: 'on' }} report={report} error={null} />)
    expect(screen.getByRole('link', { name: en.admin.analyticsWindow7d }).getAttribute('href'))
      .toBe('/en/admin/analytics?window=7d&locale=zh-hk&entity=experience&booking=on')
    expect(screen.getByRole('link', { name: 'en' }).getAttribute('href'))
      .toBe('/en/admin/analytics?window=24h&locale=en&entity=experience&booking=on')
    expect(screen.getByRole('link', { name: en.admin.analyticsEntityGuide }).getAttribute('href'))
      .toBe('/en/admin/analytics?window=24h&locale=zh-hk&entity=guide&booking=on')
    expect(screen.getByRole('link', { name: en.admin.analyticsBookingOff }).getAttribute('href'))
      .toBe('/en/admin/analytics?window=24h&locale=zh-hk&entity=experience&booking=off')
  })

  it('keeps observed-zero aggregate rows and their honest sample-floor cells visible', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={{
      ...report,
      rows: [{ ...report.rows[0], numerator: 0, denominator: 0, sampleCount: 0, rate: null, status: 'insufficient_sample' }],
    }} error={null} />)
    expect(screen.getByText(en.admin.analyticsObservedZero)).toBeTruthy()
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText(en.admin.analyticsInsufficientSample)).toBeTruthy()
    expect(screen.getAllByText('0')).toHaveLength(2)
  })

  it('renders a localized neutral value for valid dimensionless rows', () => {
    expect(en.admin.analyticsNotApplicable).toBe('—')
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={{
      ...report,
      rows: [{ ...report.rows[0], entityType: null }],
    }} error={null} />)
    expect(screen.getByText(en.admin.analyticsNotApplicable)).toBeTruthy()
    expect(screen.queryByText(en.admin.analyticsMetricUnknown)).toBeNull()
  })

  it('groups filters with visible labels and uniquely named reset links', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={report} error={null} />)
    expect(screen.getByRole('group', { name: en.admin.analyticsWindow })).toBeTruthy()
    expect(screen.getByRole('group', { name: en.admin.analyticsLocale })).toBeTruthy()
    expect(screen.getByRole('group', { name: en.admin.analyticsEntityType })).toBeTruthy()
    expect(screen.getByRole('group', { name: en.admin.analyticsBookingState })).toBeTruthy()
    expect(screen.getByRole('link', { name: `${en.admin.analyticsLocale}: ${en.admin.analyticsAll}` })).toBeTruthy()
    expect(screen.getByRole('link', { name: `${en.admin.analyticsEntityType}: ${en.admin.analyticsAll}` })).toBeTruthy()
    expect(screen.getByRole('link', { name: `${en.admin.analyticsBookingState}: ${en.admin.analyticsAll}` })).toBeTruthy()
  })

  it('maps untrusted aggregate dimensions to localized unknown copy without rendering raw identifiers', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={{
      ...report,
      rows: [{ ...report.rows[0], metricKey: 'journey-id', locale: 'account-id', entityType: 'event-id', bookingState: 'raw-metadata' }],
    }} error={null} />)
    expect(screen.getAllByText(en.admin.analyticsMetricUnknown)).toHaveLength(4)
    expect(screen.queryByText('journey-id')).toBeNull()
    expect(screen.queryByText('account-id')).toBeNull()
    expect(screen.queryByText('event-id')).toBeNull()
    expect(screen.queryByText('raw-metadata')).toBeNull()
  })
})
