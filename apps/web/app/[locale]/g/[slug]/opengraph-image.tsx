import { ImageResponse } from 'next/og'
import { getGuideBySlug } from '@/lib/guides/queries'
import { loadOgFonts } from '@/lib/seo/og/fonts'
import { GuideCard, DefaultCard, OG_SIZE } from '@/lib/seo/og/card'
import { truncate } from '@/lib/seo/og/data'

export const alt = 'KINNSO guide'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug } = await params
  const guide = await getGuideBySlug(slug)
  const fonts = await loadOgFonts()
  const card = guide
    ? <GuideCard title={truncate(guide.title, 70)} city={guide.city} handle={guide.creatorHandle} cover={guide.cover || undefined} />
    : <DefaultCard title="Guide" subtitle="KINNSO" />
  return new ImageResponse(card, { ...OG_SIZE, fonts })
}
