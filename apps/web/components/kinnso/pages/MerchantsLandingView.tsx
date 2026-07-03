import Link from 'next/link'
import { ArrowRight, FileText, LineChart, Users } from 'lucide-react'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** R1C: /merchants is the merchant HUB (mock sample-missions grid removed —
 *  master spec §4.1; acquisition copy lives at /for-merchants to avoid
 *  duplicate content). R2 turns this route into the public merchant directory. */
export function MerchantsLandingView({ locale, t }: { locale: Locale; t: Messages['merchantsLanding'] }) {
  const p = (path: string) => `/${locale}${path}`
  const cards = [
    { title: t.cardPostTitle, body: t.cardPostBody, href: p('/merchants/dashboard/post'), icon: <FileText aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardCreatorsTitle, body: t.cardCreatorsBody, href: p('/merchants/dashboard/creators'), icon: <Users aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardMissionsTitle, body: t.cardMissionsBody, href: p('/merchants/dashboard/missions'), icon: <LineChart aria-hidden="true" className="h-5 w-5" /> },
  ]
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.heroPill}</Eyebrow>
        <h1 className="k2-display mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-5xl">{t.hubTitle}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{t.hubSub}</p>
      </SectionShell>

      <SectionShell className="k2-hairline">
        <h2 className="sr-only">{t.cardsHeading}</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="group">
              <EditorialCard title={c.title} footer={<span className="inline-flex items-center gap-1 text-sm font-semibold text-kinnso-orangeDark">{t.cardOpen} <ArrowRight aria-hidden="true" className="h-4 w-4" /></span>}>
                <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orangeDark">{c.icon}</span>
                {c.body}
              </EditorialCard>
            </Link>
          ))}
        </div>
      </SectionShell>

      <SectionShell className="k2-hairline">
        <p className="max-w-2xl leading-relaxed text-kinnso-ink/70">{t.newHereNote}</p>
        <Link href={p('/for-merchants')} className="k2-btn-ghost mt-6">{t.newHereCta}</Link>
      </SectionShell>
    </main>
  )
}

export default MerchantsLandingView
