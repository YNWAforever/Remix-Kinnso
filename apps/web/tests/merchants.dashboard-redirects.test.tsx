// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
  permanentRedirect: (url: string) => { throw new Error(`permanentRedirect:${url}`) },
}))

import PostStub from '@/app/[locale]/merchants/post/page'
import MissionsStub from '@/app/[locale]/merchants/missions/page'
import MissionDetailStub from '@/app/[locale]/merchants/missions/[missionId]/page'
import CreatorsStub from '@/app/[locale]/merchants/creators/page'
import InsightsStub from '@/app/[locale]/merchants/insights/page'

const params = <T extends Record<string, string>>(extra?: T) =>
  Promise.resolve({ locale: 'en', ...(extra as T) })

describe('legacy merchant routes 308 to /merchants/dashboard/*', () => {
  it('post', async () => {
    await expect(PostStub({ params: params() })).rejects.toThrow(
      'permanentRedirect:/en/merchants/dashboard/post')
  })
  it('missions', async () => {
    await expect(MissionsStub({ params: params() })).rejects.toThrow(
      'permanentRedirect:/en/merchants/dashboard/missions')
  })
  it('missions/[missionId] preserves the id', async () => {
    await expect(MissionDetailStub({ params: params({ missionId: 'm-123' }) })).rejects.toThrow(
      'permanentRedirect:/en/merchants/dashboard/missions/m-123')
  })
  it('creators', async () => {
    await expect(CreatorsStub({ params: params() })).rejects.toThrow(
      'permanentRedirect:/en/merchants/dashboard/creators')
  })
  it('insights', async () => {
    await expect(InsightsStub({ params: params() })).rejects.toThrow(
      'permanentRedirect:/en/merchants/dashboard/insights')
  })
  it('invalid locale is notFound, not redirected', async () => {
    await expect(PostStub({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('notFound')
  })
})
