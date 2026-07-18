// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { EntityMedia } from '@/components/kinnso/media/EntityMedia'
import { entityMediaHue, isApprovedEntityMediaUrl } from '@/lib/media/entity-media'

afterEach(cleanup)

describe('entity media policy', () => {
  it('approves only HTTPS media on the verified CDN host', () => {
    expect(isApprovedEntityMediaUrl('https://cdn.kinnso.ai/guides/a.jpg')).toBe(true)
    expect(isApprovedEntityMediaUrl('https://picsum.photos/seed/a/800/600')).toBe(false)
    expect(isApprovedEntityMediaUrl('http://cdn.kinnso.ai/a.jpg')).toBe(false)
    expect(isApprovedEntityMediaUrl('https://cdn.kinnso.ai.example.com/a.jpg')).toBe(false)
    expect(isApprovedEntityMediaUrl('not a URL')).toBe(false)
    expect(isApprovedEntityMediaUrl(null)).toBe(false)
  })

  it('derives a stable hue from normalized entity text', () => {
    expect(entityMediaHue('Tokyo|Ramen')).toBe(entityMediaHue('Tokyo|Ramen'))
    expect(entityMediaHue('  TOKYO|RAMEN  ')).toBe(entityMediaHue('Tokyo|Ramen'))
  })
})

describe('EntityMedia', () => {
  it('renders a decorative placeholder when media is absent', () => {
    const { container } = render(
      <EntityMedia src={null} title="Tokyo ramen" location="Tokyo" alt="Tokyo ramen" sizes="100vw" />,
    )

    const placeholder = container.querySelector('[data-media-placeholder="true"]')
    expect(placeholder).toBeTruthy()
    expect(placeholder?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders approved media with its accessible name and no placeholder', () => {
    const { container } = render(
      <EntityMedia
        src="https://cdn.kinnso.ai/guides/tokyo-ramen.jpg"
        title="Tokyo ramen"
        location="Tokyo"
        alt="Tokyo ramen bowl"
        sizes="100vw"
      />,
    )

    expect(screen.getByRole('img', { name: 'Tokyo ramen bowl' })).toBeTruthy()
    expect(container.querySelector('[data-media-placeholder="true"]')).toBeNull()
  })
})
