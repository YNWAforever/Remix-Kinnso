// apps/web/tests/seo.jsonld.test.ts (add this describe block; keep any existing content in the file)
import { describe, it, expect } from 'vitest'
import { sessionEventJsonLd } from '@/lib/seo/jsonld'

describe('sessionEventJsonLd', () => {
  it('builds an Event with a VirtualLocation pointed at the embed URL', () => {
    const ld = sessionEventJsonLd({
      name: 'Tokyo ramen AMA', description: 'Ask away.', url: 'https://www.kinnso.ai/en/sessions/tokyo-ramen-ama',
      startDate: '2027-01-15T18:00:00.000Z', status: 'scheduled', embedUrl: 'https://youtu.be/abc123', hostName: 'Sora',
    })
    expect(ld).toMatchObject({
      '@context': 'https://schema.org', '@type': 'Event',
      name: 'Tokyo ramen AMA', startDate: '2027-01-15T18:00:00.000Z',
      eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      location: { '@type': 'VirtualLocation', url: 'https://youtu.be/abc123' },
      performer: { '@type': 'Person', name: 'Sora' },
    })
  })

  it('falls back to the session page url as the location when no embed is set yet', () => {
    const ld = sessionEventJsonLd({
      name: 'A', description: 'B', url: 'https://www.kinnso.ai/en/sessions/a',
      startDate: '2027-01-15T18:00:00.000Z', status: 'scheduled', embedUrl: null, hostName: null,
    })
    expect((ld.location as Record<string, unknown>).url).toBe('https://www.kinnso.ai/en/sessions/a')
    expect(ld.performer).toBeUndefined()
  })

  it('maps a cancelled session to EventCancelled', () => {
    const ld = sessionEventJsonLd({
      name: 'A', description: 'B', url: 'https://www.kinnso.ai/en/sessions/a',
      startDate: '2027-01-15T18:00:00.000Z', status: 'cancelled', embedUrl: null, hostName: null,
    })
    expect(ld.eventStatus).toBe('https://schema.org/EventCancelled')
  })
})
