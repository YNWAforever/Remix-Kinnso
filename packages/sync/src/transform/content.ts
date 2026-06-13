import { cdnUrl } from './arrays'

export type Block = Record<string, unknown> & { type: string; id: string }

const IMG_KEYS = ['image', 'thumbnail', 'original']

function rewriteImages(value: unknown, cdn: string): unknown {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((v) => rewriteImages(v, cdn))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = IMG_KEYS.includes(k) && typeof v === 'string' ? cdnUrl(v, cdn) : rewriteImages(v, cdn)
    }
    return out
  }
  return value
}

/** Parse legacy content JSON text → array of blocks with stable ids + CDN-rewritten images. Stored verbatim otherwise. */
export function normalizeContent(raw: string | null | undefined, cdn: string): Block[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return [] // caller logs; other locales still render
  }
  if (!Array.isArray(parsed)) return []
  return parsed.map((b, i) => {
    const block = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>
    const rewritten = rewriteImages(block, cdn) as Record<string, unknown>
    return { ...rewritten, type: String(block.type ?? 'unknown'), id: `block-${i}` } as Block
  })
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

export function deriveSummary(blocks: Block[], max = 160): string {
  for (const b of blocks) {
    const c = b['content']
    if (typeof c === 'string' && c.trim()) {
      const text = stripHtml(c)
      return text.length > max ? text.slice(0, max).trimEnd() + '…' : text
    }
  }
  return ''
}
