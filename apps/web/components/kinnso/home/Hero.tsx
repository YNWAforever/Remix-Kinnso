import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
// The Guide TYPE still lives in creator-mock until the R1C sweep relocates it.
import type { Guide } from '@/lib/creator-mock'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/**
 * Section 1 — hero. Imagery is REAL published guide covers (editorial collage
 * of up to 3). With fewer than 3 covers we render a purely typographic hero —
 * no empty frames, no stock photography, no Unsplash hotlinks anywhere on the
 * rebuilt homepage. Primary CTA targets /explore until R4 flips it to the
 * live AI agent.
 */
export function Hero({ locale, t, guides }: { locale: Locale; t: Messages['home']; guides: Guide[] }) {
  const p = (path: string) => `/${locale}${path}`
  const covers = guides.filter((g) => g.cover).slice(0, 3)
  const showCollage = covers.length >= 3
  return (
    <section className="border-b border-kinnso-edge bg-kinnso-cream">
      <div className={`k2-container grid gap-12 py-16 md:py-24 ${showCollage ? 'lg:grid-cols-[1.1fr_0.9fr]' : ''}`}>
        <div className="flex flex-col justify-center">
          <Eyebrow>{t.heroEyebrow}</Eyebrow>
          <h1 className="k2-display mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-kinnso-ink md:text-6xl">
            {t.heroTitle}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-kinnso-ink/70">{t.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {/* → /explore until R4: the live agent then becomes the primary planning entry. */}
            <Link href={p('/explore')} className="k2-btn-primary">
              {t.heroPrimaryCta} <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link href={p('/creators')} className="k2-btn-ghost">{t.heroSecondaryCta}</Link>
          </div>
        </div>
        {showCollage ? (
          <div className="grid grid-cols-2 gap-3 self-center">
            <div className="row-span-2 overflow-hidden rounded-[4px] border border-kinnso-edge bg-kinnso-cream2">
              <img
                src={covers[0].cover}
                alt={covers[0].title}
                width={640}
                height={880}
                loading="eager"
                className="h-full w-full object-cover"
              />
            </div>
            {covers.slice(1).map((g) => (
              <div key={g.slug} className="aspect-[4/3] overflow-hidden rounded-[4px] border border-kinnso-edge bg-kinnso-cream2">
                <img
                  src={g.cover}
                  alt={g.title}
                  width={640}
                  height={480}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
