/** Truncate to `max` chars, appending an ellipsis (counted within `max`). */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

/** First `max` niches for the OG chip row. */
export function pickNiches(niches: string[], max = 3): string[] {
  return niches.slice(0, max)
}
