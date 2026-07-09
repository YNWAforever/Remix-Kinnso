import { describe, it, expect } from 'vitest'
import { LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'

const KEYS = [
  'formHeading', 'ratingLabel', 'bodyLabel', 'bodyPlaceholder', 'submitCta',
  'submittingCta', 'submitted', 'alreadyReviewed', 'genericError',
  'ratingAverageLabel', 'countLabel', 'emptyState', 'anonymousReviewer',
] as const

describe('reviews i18n', () => {
  for (const locale of LOCALES) {
    it(`${locale} defines every reviews.* key`, async () => {
      const dict = await getDictionary(locale)
      for (const key of KEYS) {
        expect(dict.reviews[key], `${locale}.reviews.${key}`).toBeTruthy()
      }
    })
  }
})
