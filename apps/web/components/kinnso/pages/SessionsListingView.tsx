import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import SessionCard from '@/components/kinnso/SessionCard'
import type { PublicSession } from '@/lib/sessions/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

function SessionGrid({ locale, sessions }: { locale: Locale; sessions: PublicSession[] }) {
  return (
    <div className="mt-8 grid gap-5 md:grid-cols-3">
      {sessions.map((s) => <SessionCard key={s.id} session={s} locale={locale} />)}
    </div>
  )
}

export function SessionsListingView({
  locale, t, upcoming, replays,
}: {
  locale: Locale
  t: Messages['sessions']
  upcoming: PublicSession[]
  replays: PublicSession[]
}) {
  return (
    <div className="bg-kinnso-cream font-sans">
      <SectionShell className="flex min-h-[40vh] items-center">
        <div>
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h1 className="k2-display mt-4 text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{t.title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{t.body}</p>
        </div>
      </SectionShell>

      <SectionShell className="k2-hairline">
        <h2 className="k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.upcomingHeading}</h2>
        {upcoming.length === 0 ? (
          <p className="mt-6 text-kinnso-ink/70">{t.emptyUpcoming}</p>
        ) : (
          <SessionGrid locale={locale} sessions={upcoming} />
        )}
      </SectionShell>

      {replays.length > 0 ? (
        <SectionShell className="k2-hairline">
          <h2 className="k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.replaysHeading}</h2>
          <SessionGrid locale={locale} sessions={replays} />
        </SectionShell>
      ) : null}
    </div>
  )
}

export default SessionsListingView
