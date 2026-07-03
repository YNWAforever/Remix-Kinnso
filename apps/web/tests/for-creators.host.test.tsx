// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { ForCreatorsView } from '@/components/kinnso/pages/ForCreatorsView'

afterEach(cleanup)

describe('ForCreatorsView', () => {
  it('renders hero, steps, and CTA → /sign-up; hides empty testimonials strip', () => {
    render(<ForCreatorsView locale="en" t={en.forCreators} testimonials={[]} />)
    expect(screen.getByRole('heading', { level: 1, name: en.forCreators.heroTitle })).toBeTruthy()
    const applyLinks = screen.getAllByRole('link', { name: en.forCreators.heroCtaPrimary })
    expect(applyLinks[0].getAttribute('href')).toBe('/en/sign-up')
    expect(document.getElementById('for-creators-testimonials')).toBeNull()
  })

  it('shows the testimonials strip when quotes exist', () => {
    render(<ForCreatorsView locale="en" t={en.forCreators} testimonials={[{ id: '1', quote: 'Great', authorName: 'A', authorRole: 'creator' }]} />)
    expect(document.getElementById('for-creators-testimonials')).toBeTruthy()
  })
})
