// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import ja from '@/lib/i18n/messages/ja'
import ko from '@/lib/i18n/messages/ko'
import th from '@/lib/i18n/messages/th'
import zhCn from '@/lib/i18n/messages/zh-cn'
import zhHk from '@/lib/i18n/messages/zh-hk'
import zhTw from '@/lib/i18n/messages/zh-tw'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

describe('R7.6 navigation and footer acceptance', () => {
  it('removes the pre-pivot English product line from app source', () => {
    const forbidden = ['AI Travel', 'Content Studio'].join(' ')
    const webRoot = resolve(process.cwd())
    const source = ['app', 'components', 'lib']
      .flatMap((directory) => sourceFiles(join(webRoot, directory)))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')

    expect(source).not.toContain(forbidden)
  })

  it.each([
    ['en', en, 'The AI travel creator marketplace · Hong Kong · Taipei · Tokyo'],
    ['zh-hk', zhHk, 'AI 旅遊創作者市集 · 香港 · 台北 · 東京'],
    ['zh-tw', zhTw, 'AI 旅遊創作者市集 · 香港 · 台北 · 東京'],
    ['zh-cn', zhCn, 'AI 旅行创作者平台 · 香港 · 台北 · 东京'],
    ['ja', ja, 'AIトラベルクリエイターマーケットプレイス · 香港 · 台北 · 東京'],
    ['ko', ko, 'AI 여행 크리에이터 마켓플레이스 · 홍콩 · 타이베이 · 도쿄'],
    ['th', th, 'มาร์เก็ตเพลสครีเอเตอร์ท่องเที่ยว AI · ฮ่องกง · ไทเป · โตเกียว'],
  ])('%s exposes complete R7.6 navigation/footer copy', (_locale, dictionary, tagline) => {
    expect(dictionary.nav.linkForCreators.length).toBeGreaterThan(0)
    expect(dictionary.nav.signUp.length).toBeGreaterThan(0)
    expect(dictionary.footer.tagline).toBe(tagline)
    expect(dictionary.footer.colTravellers.length).toBeGreaterThan(0)
    expect(dictionary.footer.lTrips.length).toBeGreaterThan(0)
    expect(dictionary.footer.lSaved.length).toBeGreaterThan(0)
  })
})
