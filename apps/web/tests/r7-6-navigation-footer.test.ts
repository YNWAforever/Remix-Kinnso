// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import ja from '@/lib/i18n/messages/ja'
import ko from '@/lib/i18n/messages/ko'
import th from '@/lib/i18n/messages/th'
import zhCn from '@/lib/i18n/messages/zh-cn'
import zhHk from '@/lib/i18n/messages/zh-hk'
import zhTw from '@/lib/i18n/messages/zh-tw'

const EXCLUDED_SOURCE_DIRECTORIES = new Set([
  '.next',
  '.turbo',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
])

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return EXCLUDED_SOURCE_DIRECTORIES.has(entry.name) ? [] : sourceFiles(path)
    }
    return [path]
  })
}

describe('R7.6 navigation and footer acceptance', () => {
  it('walks the full web tree while excluding generated, dependency, and test-artifact directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'kinnso-r7-6-guard-'))
    const excluded = ['.next', 'node_modules', 'coverage', 'playwright-report', 'test-results']
    try {
      mkdirSync(join(root, 'content'))
      writeFileSync(join(root, 'content', 'copy.md'), 'marketplace copy')
      excluded.forEach((directory) => {
        mkdirSync(join(root, directory))
        writeFileSync(join(root, directory, 'ignored.ts'), 'generated artifact')
      })

      const files = sourceFiles(root)
        .map((file) => relative(root, file).replaceAll('\\', '/'))

      expect(files).toContain('content/copy.md')
      excluded.forEach((directory) => {
        expect(files).not.toContain(`${directory}/ignored.ts`)
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('removes the pre-pivot English product line from app source', () => {
    const forbidden = ['AI Travel', 'Content Studio'].join(' ')
    const webRoot = resolve(process.cwd())
    const source = sourceFiles(webRoot)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')

    expect(source).not.toContain(forbidden)
  })

  it.each([
    ['en', en, 'For Creators', 'The AI travel creator marketplace · Hong Kong · Taipei · Tokyo'],
    ['zh-hk', zhHk, '創作者專區', 'AI 旅遊創作者市集 · 香港 · 台北 · 東京'],
    ['zh-tw', zhTw, '創作者專區', 'AI 旅遊創作者市集 · 香港 · 台北 · 東京'],
    ['zh-cn', zhCn, '创作者专区', 'AI 旅行创作者平台 · 香港 · 台北 · 东京'],
    ['ja', ja, 'クリエイターの方へ', 'AI旅行クリエイターマーケットプレイス · 香港 · 台北 · 東京'],
    ['ko', ko, '크리에이터 안내', 'AI 여행 크리에이터 마켓플레이스 · 홍콩 · 타이베이 · 도쿄'],
    ['th', th, 'สำหรับครีเอเตอร์', 'มาร์เก็ตเพลสครีเอเตอร์ท่องเที่ยว AI · ฮ่องกง · ไทเป · โตเกียว'],
  ])('%s exposes complete R7.6 navigation/footer copy', (_locale, dictionary, forCreators, tagline) => {
    expect(dictionary.nav.linkForCreators).toBe(forCreators)
    expect(dictionary.nav.signUp.length).toBeGreaterThan(0)
    expect(dictionary.footer.tagline).toBe(tagline)
    expect(dictionary.footer.colTravellers.length).toBeGreaterThan(0)
    expect(dictionary.footer.lTrips.length).toBeGreaterThan(0)
    expect(dictionary.footer.lSaved.length).toBeGreaterThan(0)
  })
})
