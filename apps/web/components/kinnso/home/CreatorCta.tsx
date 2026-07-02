import Link from 'next/link'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/**
 * Section 9 — creator recruitment. Moss band for editorial contrast with the
 * ink agent band; paper-on-moss text with a paper button (clay would fight
 * the moss). Sun dots are decorative accents only.
 */
export function CreatorCta({ locale, t }: { locale: Locale; t: Messages['home'] }) {
  const bullets = [t.creatorBullet1, t.creatorBullet2, t.creatorBullet3]
  return (
    <section className="bg-kinnso2-moss py-16 md:py-24">
      <div className="k2-container">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-kinnso2-paper/70">{t.creatorEyebrow}</p>
        <h2 className="k2-display mt-4 max-w-2xl text-3xl font-semibold text-kinnso2-paper md:text-4xl">{t.creatorHeading}</h2>
        <ul className="mt-6 max-w-2xl space-y-3">
          {bullets.map((b) => (
            <li key={b} className="flex gap-3 leading-relaxed text-kinnso2-paper/85">
              <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-kinnso2-sun" />
              {b}
            </li>
          ))}
        </ul>
        <Link
          href={`/${locale}/sign-up`}
          className="mt-8 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] bg-kinnso2-paper px-6 py-2.5 text-sm font-semibold tracking-wide text-kinnso2-ink transition hover:bg-white"
        >
          {t.creatorCta}
        </Link>
      </div>
    </section>
  )
}
