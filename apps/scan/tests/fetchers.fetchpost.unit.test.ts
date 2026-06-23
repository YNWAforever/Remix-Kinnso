import { describe, expect, it } from 'vitest'
import { FakeFetcher } from '../src/fetchers'

describe('FakeFetcher.fetchPost', () => {
  it('returns a deterministic post for instagram', async () => {
    const f = new FakeFetcher()
    const post = await f.fetchPost('instagram', 'Cabc')
    expect(post).toEqual({ authorHandle: 'fake_ig_user', engagementCount: 1234, postUrl: 'https://www.instagram.com/p/Cabc/' })
  })
  it('returns a deterministic post for threads', async () => {
    const f = new FakeFetcher()
    const post = await f.fetchPost('threads', 'Xyz')
    expect(post?.authorHandle).toBe('fake_threads_user')
  })
  it('returns null when configured to fail that platform', async () => {
    const f = new FakeFetcher({}, ['instagram'])
    expect(await f.fetchPost('instagram', 'Cabc')).toBeNull()
  })
  it('lets an override set the author handle', async () => {
    const f = new FakeFetcher({}, [], { instagram: { authorHandle: 'traveler', engagementCount: 9, postUrl: null } })
    expect((await f.fetchPost('instagram', 'x'))?.authorHandle).toBe('traveler')
  })
})
