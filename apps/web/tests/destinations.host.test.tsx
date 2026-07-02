// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

import DestinationsPage, { generateMetadata } from '@/app/[locale]/destinations/page'
import { MARKETING_PATHS } from '@/lib/seo/routes'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/destinations host', () => {
  it('renders the designed editorial placeholder (not the bare ComingSoonPage)', async () => {
    const ui = await DestinationsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.destinationsSoon.title })).toBeTruthy()
    expect(screen.getByText(en.destinationsSoon.eyebrow)).toBeTruthy()
    expect(screen.getByText(en.destinationsSoon.body)).toBeTruthy()
    expect(screen.getByRole('link', { name: en.destinationsSoon.cta }).getAttribute('href')).toBe('/en/articles/destinations')
    expect(screen.queryByText(en.comingSoon.heading)).toBeNull()
  })

  it('is noindexed and stays out of MARKETING_PATHS', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(MARKETING_PATHS).not.toContain('/destinations')
  })

  it('404s unknown locales', async () => {
    await expect(DestinationsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
