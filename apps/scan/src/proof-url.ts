export type ProofPlatform = 'instagram' | 'threads'

export type ParsedProofUrl = { platform: ProofPlatform; id: string }

export function parseProofUrl(input: string): ParsedProofUrl | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./i, '').toLowerCase()
  const parts = url.pathname.split('/').filter(Boolean)

  if (host === 'instagram.com') {
    const i = parts.findIndex((p) => p === 'p' || p === 'reel' || p === 'reels')
    if (i >= 0 && parts[i + 1]) return { platform: 'instagram', id: parts[i + 1] }
    return null
  }

  if (host === 'threads.net' || host === 'threads.com') {
    const i = parts.findIndex((p) => p === 'post')
    if (i >= 0 && parts[i + 1]) return { platform: 'threads', id: parts[i + 1] }
    return null
  }

  return null
}
