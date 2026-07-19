import { describe, expect, it } from 'vitest'
import { formatDestinationInventoryCount } from '@/lib/i18n/destination-inventory'

describe('formatDestinationInventoryCount', () => {
  it('uses singular and plural English inventory labels', () => {
    expect(formatDestinationInventoryCount('en', 'guides', 1)).toBe('1 guide')
    expect(formatDestinationInventoryCount('en', 'guides', 2)).toBe('2 guides')
    expect(formatDestinationInventoryCount('en', 'experiences', 1)).toBe('1 experience')
    expect(formatDestinationInventoryCount('en', 'experiences', 2)).toBe('2 experiences')
  })

  it('formats guides naturally in every configured non-English locale', () => {
    expect(formatDestinationInventoryCount('zh-hk', 'guides', 2)).toBe('2 篇攻略')
    expect(formatDestinationInventoryCount('zh-tw', 'guides', 2)).toBe('2 篇攻略')
    expect(formatDestinationInventoryCount('zh-cn', 'guides', 2)).toBe('2 篇攻略')
    expect(formatDestinationInventoryCount('ja', 'guides', 2)).toBe('2件のガイド')
    expect(formatDestinationInventoryCount('ko', 'guides', 2)).toBe('가이드 2개')
    expect(formatDestinationInventoryCount('th', 'guides', 2)).toBe('คู่มือ 2 รายการ')
  })
})
