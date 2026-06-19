import Link from 'next/link'
import { ArrowRight, FileText, Send, Users } from 'lucide-react'
import MissionCard from '@/components/kinnso/MissionCard'
import { missions } from '@/lib/creator-mock'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function MerchantsLandingView({ locale, t }: { locale: Locale; t: Messages['merchantsLanding'] }) {
  const p = (path: string) => `/${locale}${path}`
  const steps = [
    { n: 1, title: t.step1Title, desc: t.step1Desc, icon: <FileText className="h-5 w-5" /> },
    { n: 2, title: t.step2Title, desc: t.step2Desc, icon: <Users className="h-5 w-5" /> },
    { n: 3, title: t.step3Title, desc: t.step3Desc, icon: <Send className="h-5 w-5" /> },
  ]
  return (
    <main>
      {/* HERO */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-kinnso-ink via-kinnso-ink to-kinnso-orangeDark" />
        <div className="k-container py-20 text-white md:py-24">
          <span className="k-pill bg-white/15 text-white backdrop-blur">{t.heroPill}</span>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">{t.heroTitle}</h1>
          <p className="mt-5 max-w-xl text-lg text-white/90">{t.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={p('/merchants/post')} className="k-btn-primary inline-flex bg-white text-kinnso-ink hover:bg-white/90">
              {t.postCta} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link href={p('/merchants/creators')} className="k-btn-primary inline-flex bg-white/10 text-white hover:bg-white/20">
              {t.browseCta}
            </Link>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="k-container py-16">
        <h2 className="k-section-title text-center">{t.howHeading}</h2>
        <p className="mt-2 text-center text-kinnso-muted">{t.howSub}</p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="k-card p-5">
              <div className="flex items-center justify-between">
                <span className="k-mono text-3xl font-black text-kinnso-orange">0{s.n}</span>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orange">{s.icon}</span>
              </div>
              <h3 className="mt-3 text-lg font-bold text-kinnso-ink">{s.title}</h3>
              <p className="mt-1 text-sm text-kinnso-muted">{s.desc}</p>
            </div>
          ))}
        </div>
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
        <div className="k-card bg-kinnso-cream2 p-8 text-center">
          <h2 className="text-2xl font-black text-kinnso-ink">{t.ctaTitle}</h2>
          <p className="mt-2 text-kinnso-muted">{t.ctaDesc}</p>
          <Link href={p('/merchants/post')} className="k-btn-primary mt-5 inline-flex">{t.ctaButton} <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </div>
      </section>
    </main>
  )
}

export default MerchantsLandingView
