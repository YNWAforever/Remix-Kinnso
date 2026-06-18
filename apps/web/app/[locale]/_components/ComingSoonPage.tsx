import Link from 'next/link'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function ComingSoonPage({
  locale,
  title,
  t,
}: {
  locale: Locale
  title: string
  t: Messages['comingSoon']
}) {
  return (
    <main className="flex min-h-[70vh] items-center">
      <section className="k-container py-16">
        <div className="max-w-2xl">
          <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{t.heading}</span>
          <h1 className="mt-5 text-4xl font-black tracking-tight text-kinnso-ink md:text-5xl">{title}</h1>
          <p className="mt-4 text-lg text-kinnso-muted">{t.body}</p>
          <Link href={`/${locale}`} className="k-btn-primary mt-8">
            {t.back}
          </Link>
        </div>
      </section>
    </main>
  )
}
