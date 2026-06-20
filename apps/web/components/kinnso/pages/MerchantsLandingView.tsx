import Link from 'next/link'
import { ArrowRight, FileText, Send, Users } from 'lucide-react'
import MissionCard from '@/components/kinnso/MissionCard'
import { RouteStamp, TicketCard, TicketDivider } from '@/components/kinnso/MarketPassport'
import { missions } from '@/lib/creator-mock'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function MerchantsLandingView({ locale, t }: { locale: Locale; t: Messages['merchantsLanding'] }) {
  const p = (path: string) => `/${locale}${path}`
  const steps = [
    { n: 1, title: t.step1Title, desc: t.step1Desc, icon: <FileText aria-hidden="true" className="h-5 w-5" /> },
    { n: 2, title: t.step2Title, desc: t.step2Desc, icon: <Users aria-hidden="true" className="h-5 w-5" /> },
    { n: 3, title: t.step3Title, desc: t.step3Desc, icon: <Send aria-hidden="true" className="h-5 w-5" /> },
  ]
  return (
    <main>
      {/* HERO — paper/ink mission-ticket composition */}
      <section className="k-page-band py-20 md:py-28">
        <div className="k-container">
          <RouteStamp>{t.heroPill}</RouteStamp>
          <h1 className="k-display mt-4 max-w-3xl">{t.heroTitle}</h1>
          <p className="mt-5 max-w-xl text-lg text-kinnso-muted">{t.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={p('/merchants/post')} className="k-btn-primary inline-flex">
              {t.postCta} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
            </Link>
            <Link href={p('/merchants/creators')} className="k-btn-ghost inline-flex">
              {t.browseCta}
            </Link>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="k-container py-16">
        <h2 className="k-section-title text-center">{t.howHeading}</h2>
        <p className="mt-2 text-center text-kinnso-muted">{t.howSub}</p>
        <ol className="mt-10 grid gap-4 md:grid-cols-3" aria-label={t.howHeading}>
          {steps.map((s) => (
            <li key={s.n}>
              <TicketCard className="h-full p-5">
                <div className="flex items-center justify-between">
                  <span className="k-mono text-3xl font-black text-kinnso-orange">0{s.n}</span>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orange">{s.icon}</span>
                </div>
                <TicketDivider className="my-3" />
                <h3 className="text-lg font-bold text-kinnso-ink">{s.title}</h3>
                <p className="mt-1 text-sm text-kinnso-muted">{s.desc}</p>
              </TicketCard>
            </li>
          ))}
        </ol>
      </section>

      {/* SAMPLE MISSIONS */}
      <section className="k-container pb-8">
        <h2 className="k-section-title">{t.samplesHeading}</h2>
        <p className="mt-1 text-kinnso-muted">{t.samplesSub}</p>
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {missions.map((m) => (
            <MissionCard key={m.id} m={m} href={p(`/merchants/creators`)} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="k-container pb-20">
        <TicketCard className="p-8 text-center">
          <h2 className="text-2xl font-black text-kinnso-ink">{t.ctaTitle}</h2>
          <p className="mt-2 text-kinnso-muted">{t.ctaDesc}</p>
          <Link href={p('/merchants/post')} className="k-btn-primary mt-5 inline-flex">{t.ctaButton} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" /></Link>
        </TicketCard>
      </section>
    </main>
  )
}

export default MerchantsLandingView
