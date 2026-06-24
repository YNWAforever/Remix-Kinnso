import Link from 'next/link'
import { ArrowRight, Sparkles, Lightbulb, Wand2 } from 'lucide-react'
import { RouteStamp, TicketCard } from '@/components/kinnso/MarketPassport'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function AgentCopilotView({ locale, t }: { locale: Locale; t: Messages['agent'] }) {
  const p = (path: string) => `/${locale}${path}`
  const values = [
    { title: t.value1Title, desc: t.value1Desc, icon: <Sparkles aria-hidden="true" className="h-5 w-5" /> },
    { title: t.value2Title, desc: t.value2Desc, icon: <Lightbulb aria-hidden="true" className="h-5 w-5" /> },
    { title: t.value3Title, desc: t.value3Desc, icon: <Wand2 aria-hidden="true" className="h-5 w-5" /> },
  ]
  return (
    <main>
      {/* HERO */}
      <section className="k-page-band py-20 md:py-28">
        <div className="k-container">
          <RouteStamp>{t.heroPill}</RouteStamp>
          <h1 className="k-display mt-4 max-w-3xl">{t.heroTitle}</h1>
          <p className="mt-5 max-w-xl text-lg text-kinnso-muted">{t.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={p('/sign-up')} className="k-btn-primary inline-flex">
              {t.heroCta} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
            </Link>
            <Link href={p('/creators')} className="k-btn-ghost inline-flex">{t.heroSecondaryCta}</Link>
          </div>
          <p className="mt-4 text-sm text-kinnso-muted">{t.comingNote}</p>
        </div>
      </section>

      {/* VALUE PROPS */}
      <section className="k-container py-16">
        <h2 className="k-section-title text-center">{t.valuesHeading}</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {values.map((v) => (
            <TicketCard key={v.title} className="h-full p-5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orange">{v.icon}</span>
              <h3 className="mt-4 text-lg font-bold text-kinnso-ink">{v.title}</h3>
              <p className="mt-1 text-sm text-kinnso-muted">{v.desc}</p>
            </TicketCard>
          ))}
        </div>
      </section>

      {/* TIER TEASER */}
      <section className="k-container pb-8">
        <TicketCard className="p-8">
          <h2 className="text-2xl font-black text-kinnso-ink">{t.tiersHeading}</h2>
          <p className="mt-2 max-w-2xl text-kinnso-muted">{t.tiersSub}</p>
        </TicketCard>
      </section>

      {/* CTA */}
      <section className="k-container pb-20">
        <TicketCard className="p-8 text-center">
          <h2 className="text-2xl font-black text-kinnso-ink">{t.ctaTitle}</h2>
          <p className="mt-2 text-kinnso-muted">{t.ctaDesc}</p>
          <Link href={p('/sign-up')} className="k-btn-primary mt-5 inline-flex">
            {t.ctaButton} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
          </Link>
        </TicketCard>
      </section>
    </main>
  )
}

export default AgentCopilotView
