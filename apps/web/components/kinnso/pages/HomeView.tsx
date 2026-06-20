import Link from "next/link";
import { ArrowRight, MapPin, Sparkles, Trophy, Wallet } from "lucide-react";
import ScanWidget from "@/components/kinnso/ScanWidget";
import EarningsTicker from "@/components/kinnso/EarningsTicker";
import CreatorCard from "@/components/kinnso/CreatorCard";
import PassportHeroStack from "@/components/kinnso/PassportHeroStack";
import { RouteMarkers, RouteStamp, TicketCard } from "@/components/kinnso/MarketPassport";
import { creators, merchantLogos } from "@/lib/creator-mock";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/en";

export function HomeView({ locale, t }: { locale: Locale; t: Messages["home"] }) {
  const p = (path: string) => `/${locale}${path}`;
  const steps = [
    { n: 1, marker: "SCAN", title: t.step1Title, desc: t.step1Desc, icon: <Sparkles aria-hidden="true" className="h-5 w-5" /> },
    { n: 2, marker: "CITY", title: t.step2Title, desc: t.step2Desc, icon: <MapPin aria-hidden="true" className="h-5 w-5" /> },
    { n: 3, marker: "MATCH", title: t.step3Title, desc: t.step3Desc, icon: <Trophy aria-hidden="true" className="h-5 w-5" /> },
    { n: 4, marker: "EARN", title: t.step4Title, desc: t.step4Desc, icon: <Wallet aria-hidden="true" className="h-5 w-5" /> },
  ];
  const featured = creators.slice(0, 6);

  return (
    <div>
      <section className="k-page-band relative isolate overflow-hidden">
        <div className="k-container grid gap-12 py-16 md:grid-cols-[1.05fr_0.95fr] md:py-24">
          <div>
            <RouteStamp>{t.heroPill}</RouteStamp>
            <h1 className="k-display mt-5 max-w-3xl text-5xl font-black leading-[0.92] text-kinnso-ink md:text-7xl">
              {t.heroTitle}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-kinnso-muted">{t.heroSubtitle}</p>
            <div className="mt-8 max-w-xl"><ScanWidget /></div>
            <Link href={p("/sign-up")} className="k-btn-primary mt-6 inline-flex">
              {t.applyCta} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
            </Link>
          </div>
          <PassportHeroStack />
        </div>
      </section>

      <EarningsTicker />

      <section className="k-page-band border-t border-kinnso-edge py-16">
        <div className="k-container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="k-display text-3xl font-black text-kinnso-ink md:text-4xl">{t.howHeading}</h2>
            <p className="mt-3 text-kinnso-muted">{t.howSub}</p>
          </div>
          <RouteMarkers className="mx-auto mt-8 max-w-3xl" points={steps.map((s) => s.marker)} />
          <ol className="mt-8 grid gap-4 md:grid-cols-4">
            {steps.map((s) => (
              <TicketCard key={s.n} as="li" className="p-5">
                <div className="flex items-center justify-between">
                  <span className="k-mono text-3xl font-black text-kinnso-orange">0{s.n}</span>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orange">{s.icon}</span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-kinnso-ink">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-kinnso-muted">{s.desc}</p>
              </TicketCard>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-y border-kinnso-edge bg-white py-10">
        <div className="k-container">
          <p className="text-center text-xs font-bold uppercase tracking-[0.14em] text-kinnso-muted">{t.merchantWall}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {merchantLogos.map((m) => (
              <RouteStamp key={m}>{m}</RouteStamp>
            ))}
          </div>
        </div>
      </section>

      <section className="k-page-band py-16">
        <div className="k-container">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="k-display text-3xl font-black text-kinnso-ink md:text-4xl">{t.featuredHeading}</h2>
              <p className="mt-2 text-kinnso-muted">{t.featuredSub}</p>
            </div>
            <Link href={p("/feed")} className="hidden text-sm font-bold text-kinnso-orange hover:text-kinnso-orangeDark md:inline">{t.featuredSeeAll} →</Link>
          </div>
          <div className="no-scrollbar mt-6 -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
            {featured.map((c) => <CreatorCard key={c.handle} c={c} locale={locale} />)}
          </div>
        </div>
      </section>

      <section className="k-page-band pb-20">
        <div className="k-container grid gap-5 md:grid-cols-2">
          <TicketCard className="overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=1600&auto=format&fit=crop"
              alt="Traveler checking a saved city guide"
              width={800}
              height={400}
              loading="lazy"
              className="aspect-[2/1] w-full object-cover"
            />
            <div className="p-6">
              <h3 className="k-display text-2xl font-black text-kinnso-ink">{t.travelersTitle}</h3>
              <p className="mt-2 text-kinnso-muted">{t.travelersDesc}</p>
              <Link href={p("/explore")} className="k-btn-primary mt-4 inline-flex">{t.travelersCta} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" /></Link>
            </div>
          </TicketCard>
          <TicketCard className="overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1556761175-5973dc0f32e7?q=80&w=1600&auto=format&fit=crop"
              alt="Merchant team preparing a creator mission"
              width={800}
              height={400}
              loading="lazy"
              className="aspect-[2/1] w-full object-cover"
            />
            <div className="p-6">
              <h3 className="k-display text-2xl font-black text-kinnso-ink">{t.merchantsTitle}</h3>
              <p className="mt-2 text-kinnso-muted">{t.merchantsDesc}</p>
              <Link href={p("/merchants/post")} className="k-btn-primary mt-4 inline-flex">{t.merchantsCta} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" /></Link>
            </div>
          </TicketCard>
        </div>
      </section>
    </div>
  );
}

export default HomeView;
