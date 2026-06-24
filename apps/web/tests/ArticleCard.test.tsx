// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ArticleCard } from '@/components/ArticleCard'

afterEach(cleanup)

describe('ArticleCard', () => {
  it('wraps the whole card in a single link with a decorative read arrow', () => {
    render(<ArticleCard href="/en/articles/destinations/kyoto-tea" title="Kyoto Tea" summary="Lovely tea houses." />)
    const link = screen.getByRole('link', { name: 'Kyoto Tea' })
    expect(link.getAttribute('href')).toBe('/en/articles/destinations/kyoto-tea')
    expect(link.querySelector('[aria-hidden="true"]')?.textContent).toContain('→')
  })
})
