import type { Locale } from './config'

type InventoryKind = 'guides' | 'experiences'
type InventoryCountFormatter = (count: number) => string

const destinationInventoryFormatters: Record<Locale, Record<InventoryKind, InventoryCountFormatter>> = {
  en: {
    guides: (count) => `${count} ${count === 1 ? 'guide' : 'guides'}`,
    experiences: (count) => `${count} ${count === 1 ? 'experience' : 'experiences'}`,
  },
  'zh-hk': {
    guides: (count) => `${count} 篇攻略`,
    experiences: (count) => `${count} 個體驗`,
  },
  'zh-tw': {
    guides: (count) => `${count} 篇攻略`,
    experiences: (count) => `${count} 個體驗`,
  },
  'zh-cn': {
    guides: (count) => `${count} 篇攻略`,
    experiences: (count) => `${count} 个体验`,
  },
  ja: {
    guides: (count) => `${count}件のガイド`,
    experiences: (count) => `${count}件の体験`,
  },
  ko: {
    guides: (count) => `가이드 ${count}개`,
    experiences: (count) => `체험 ${count}개`,
  },
  th: {
    guides: (count) => `คู่มือ ${count} รายการ`,
    experiences: (count) => `ประสบการณ์ ${count} รายการ`,
  },
}

export function formatDestinationInventoryCount(locale: Locale, kind: InventoryKind, count: number): string {
  return destinationInventoryFormatters[locale][kind](count)
}
