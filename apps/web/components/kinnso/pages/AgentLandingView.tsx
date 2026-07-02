import Link from 'next/link'
import { CalendarRange, Compass, MapPinned } from 'lucide-react'
import { AgentWaitlistForm } from '@/components/kinnso/agent/AgentWaitlistForm'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/**
 * R1C honest traveller-agent waitlist (master spec §4.1: never feature a
 * non-live agent as live). Value framing + real email capture; R4 replaces
 * this page with the live chat surface.
 */
export function AgentLandingView({ locale, t }: { locale: Locale; t: Messages['agent'] }) {
  const p = (path: string) => `/${locale}${path}`
  const points = [
    { title: t.point1Title, body: t.point1Body, icon: <MapPinned aria-hidden="true" className="h-5 w-5" /> },
    { title: t.point2Title, body: t.point2Body, icon: <CalendarRange aria-hidden="true" className="h-5 w-5" /> },
    { title: t.point3Title, body: t.point3Body, icon: <Compass aria-hidden="true" className="h-5 w-5" /> },
  ]
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.eyebrow}</Eyebrow>
        <h1 className="k2-display mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{t.title}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{t.body}</p>
      </SectionShell>

      <SectionShell className="k2-hairline">
        <h2 className="sr-only">{t.pointsHeading}</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {points.map((pt) => (
            <EditorialCard key={pt.title} title={pt.title}>
              <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orangeDark">{pt.icon}</span>
              {pt.body}
            </EditorialCard>
          ))}
        </div>
      </SectionShell>

      <section className="bg-kinnso-ink py-16 md:py-24">
        <div className="k2-container">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-kinnso-amber">{t.formHeading}</p>
          <h2 className="k2-display mt-4 max-w-2xl text-3xl font-semibold text-kinnso-cream md:text-4xl">{t.formBody}</h2>
          <div className="mt-8"><AgentWaitlistForm locale={locale} t={t} /></div>
        </div>
      </section>

      <SectionShell>
        <p className="max-w-2xl leading-relaxed text-kinnso-ink/70">{t.honestNote}</p>
        <div className="mt-6 flex flex-wrap gap-4">
          <Link href={p('/explore')} className="k2-btn-primary">{t.exploreCta}</Link>
          <Link href={p('/articles')} className="k2-btn-ghost">{t.articlesCta}</Link>
        </div>
      </SectionShell>
    </main>
  )
}

export default AgentLandingView
