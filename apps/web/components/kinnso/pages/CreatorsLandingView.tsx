import Link from 'next/link'
import { ArrowRight, MapPin, Sparkles, Trophy, Wallet } from 'lucide-react'
import { RouteStamp, TicketCard, TicketDivider } from '@/components/kinnso/MarketPassport'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function CreatorsLandingView({ locale, t }: { locale: Locale; t: Messages['creatorsLanding'] }) {
  const p = (path: string) => `/${locale}${path}`
  const steps = [
    { n: 1, title: t.step1Title, desc: t.step1Desc, icon: <Sparkles aria-hidden="true" className="h-5 w-5" /> },
    { n: 2, title: t.step2Title, desc: t.step2Desc, icon: <MapPin aria-hidden="true" className="h-5 w-5" /> },
    { n: 3, title: t.step3Title, desc: t.step3Desc, icon: <Trophy aria-hidden="true" className="h-5 w-5" /> },
    { n: 4, title: t.step4Title, desc: t.step4Desc, icon: <Wallet aria-hidden="true" className="h-5 w-5" /> },
  ]
  return (
    <main>
      {/* HERO — Market Passport k-page-band */}
      <section className="k-page-band py-20 md:py-28">
        <div className="k-container">
          <RouteStamp>{t.heroPill}</RouteStamp>
          <h1 className="k-display mt-4 max-w-3xl">{t.heroTitle}</h1>
          <p className="mt-5 max-w-xl text-lg text-kinnso-muted">{t.heroSubtitle}</p>
          <Link href={p('/sign-up')} className="k-btn-primary mt-8 inline-flex">
            {t.applyCta} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* HOW IT WORKS — route timeline */}
      <section className="k-container py-16">
        <h2 className="k-section-title text-center">{t.howHeading}</h2>
        <p className="mt-2 text-center text-kinnso-muted">{t.howSub}</p>
        <ol className="mt-10 grid gap-4 md:grid-cols-4" aria-label={t.howHeading}>
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

      {/* CTA */}
      <section className="k-container pb-20">
        <TicketCard className="p-8 text-center">
          <h2 className="text-2xl font-black text-kinnso-ink">{t.ctaTitle}</h2>
          <p className="mt-2 text-kinnso-muted">{t.ctaDesc}</p>
          <Link href={p('/sign-up')} className="k-btn-primary mt-5 inline-flex">{t.ctaButton} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" /></Link>
        </TicketCard>
      </section>
    </main>
  )
}

export default CreatorsLandingView
