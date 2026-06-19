import Link from 'next/link'
import { ArrowRight, MapPin, Sparkles, Trophy, Wallet } from 'lucide-react'
import CreatorCard from '@/components/kinnso/CreatorCard'
import { creators } from '@/lib/creator-mock'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function CreatorsLandingView({ locale, t }: { locale: Locale; t: Messages['creatorsLanding'] }) {
  const p = (path: string) => `/${locale}${path}`
  const steps = [
    { n: 1, title: t.step1Title, desc: t.step1Desc, icon: <Sparkles className="h-5 w-5" /> },
    { n: 2, title: t.step2Title, desc: t.step2Desc, icon: <MapPin className="h-5 w-5" /> },
    { n: 3, title: t.step3Title, desc: t.step3Desc, icon: <Trophy className="h-5 w-5" /> },
    { n: 4, title: t.step4Title, desc: t.step4Desc, icon: <Wallet className="h-5 w-5" /> },
  ]
  const featured = creators.slice(0, 6)
  return (
    <main>
      {/* HERO */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-kinnso-orangeDark via-kinnso-orange to-kinnso-amber" />
        <div className="absolute inset-0 -z-10 bg-black/25" />
        <div className="k-container py-20 text-white md:py-24">
          <span className="k-pill bg-white/15 text-white backdrop-blur">{t.heroPill}</span>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">{t.heroTitle}</h1>
          <p className="mt-5 max-w-xl text-lg text-white/90">{t.heroSubtitle}</p>
          <Link href={p('/sign-up')} className="k-btn-primary mt-8 inline-flex bg-white text-kinnso-ink hover:bg-white/90">
            {t.applyCta} <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="k-container py-16">
        <h2 className="k-section-title text-center">{t.howHeading}</h2>
        <p className="mt-2 text-center text-kinnso-muted">{t.howSub}</p>
        <div className="mt-10 grid gap-4 md:grid-cols-4">
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

      {/* FEATURED CREATORS */}
      <section className="k-container pb-8">
        <h2 className="k-section-title">{t.featuredHeading}</h2>
        <p className="mt-1 text-kinnso-muted">{t.featuredSub}</p>
        <div className="no-scrollbar mt-6 -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
          {featured.map((c) => <CreatorCard key={c.handle} c={c} locale={locale} />)}
        </div>
      </section>

      {/* CTA */}
      <section className="k-container pb-20">
        <div className="k-card bg-kinnso-cream2 p-8 text-center">
          <h2 className="text-2xl font-black text-kinnso-ink">{t.ctaTitle}</h2>
          <p className="mt-2 text-kinnso-muted">{t.ctaDesc}</p>
          <Link href={p('/sign-up')} className="k-btn-primary mt-5 inline-flex">{t.ctaButton} <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </div>
      </section>
    </main>
  )
}

export default CreatorsLandingView
