import Link from 'next/link'
import { ArrowRight, Inbox, PenSquare, Sparkles, Tag, Target, Wallet } from 'lucide-react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import { RouteStamp, TicketCard } from '@/components/kinnso/MarketPassport'

export function StudioHomeView({ locale, t }: { locale: Locale; t: Messages['studioHome'] }) {
  const p = (path: string) => `/${locale}${path}`
  const tools = [
    { href: '/studio/scan', title: t.scanTitle, desc: t.scanDesc, live: true, icon: <Sparkles aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/missions', title: t.missionsTitle, desc: t.missionsDesc, live: true, icon: <Target aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/earnings', title: t.earningsTitle, desc: t.earningsDesc, live: true, icon: <Wallet aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/offers', title: t.offersTitle, desc: t.offersDesc, live: true, icon: <Tag aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/inbox', title: t.inboxTitle, desc: t.inboxDesc, live: false, icon: <Inbox aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/guides', title: t.guidesTitle, desc: t.guidesDesc, live: true, icon: <PenSquare aria-hidden="true" className="h-5 w-5" /> },
  ]
  return (
    <main>
      <section className="k-container py-12">
        <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{t.pill}</span>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-kinnso-ink md:text-5xl">{t.heading}</h1>
        <p className="mt-3 max-w-2xl text-lg text-kinnso-muted">{t.subtitle}</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <TicketCard key={tool.href} as={Link} href={p(tool.href)} className="group p-6 transition hover:border-kinnso-orange">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orange">{tool.icon}</span>
                <RouteStamp className={tool.live ? 'bg-kinnso-orange/10 text-kinnso-orange' : 'bg-kinnso-cream2 text-kinnso-muted'}>
                  {tool.live ? t.liveBadge : t.soonBadge}
                </RouteStamp>
              </div>
              <h2 className="mt-4 text-xl font-bold text-kinnso-ink">{tool.title}</h2>
              <p className="mt-1 text-sm text-kinnso-muted">{tool.desc}</p>
              <span className="mt-4 inline-flex items-center text-sm font-bold text-kinnso-orange">
                {t.open} <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </TicketCard>
          ))}
        </div>
      </section>
    </main>
  )
}

export default StudioHomeView
