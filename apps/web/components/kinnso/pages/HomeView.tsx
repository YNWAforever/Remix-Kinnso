import Link from "next/link";
import { ArrowRight, MapPin, Sparkles, Trophy, Wallet } from "lucide-react";
import ScanWidget from "@/components/kinnso/ScanWidget";
import EarningsTicker from "@/components/kinnso/EarningsTicker";
import CreatorCard from "@/components/kinnso/CreatorCard";
import { creators, merchantLogos } from "@/lib/creator-mock";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/en";

export function HomeView({ locale, t }: { locale: Locale; t: Messages["home"] }) {
  const p = (path: string) => `/${locale}${path}`;
  const steps = [
    { n: 1, title: t.step1Title, desc: t.step1Desc, icon: <Sparkles className="h-5 w-5" /> },
    { n: 2, title: t.step2Title, desc: t.step2Desc, icon: <MapPin className="h-5 w-5" /> },
    { n: 3, title: t.step3Title, desc: t.step3Desc, icon: <Trophy className="h-5 w-5" /> },
    { n: 4, title: t.step4Title, desc: t.step4Desc, icon: <Wallet className="h-5 w-5" /> },
  ];
  const featured = creators.slice(0, 6);

  return (
    <div>
      {/* HERO */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-kinnso-orangeDark via-kinnso-orange to-kinnso-amber" />
        <div className="absolute inset-0 -z-10 opacity-25 mix-blend-overlay" style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1502920917128-1aa500764cbd?q=80&w=2000&auto=format&fit=crop')",
          backgroundSize: "cover", backgroundPosition: "center",
        }} />
        <div className="absolute inset-0 -z-10 bg-black/30" />
        <div className="k-container py-20 text-white md:py-28">
          <div className="grid items-start gap-12 md:grid-cols-2">
            <div>
              <span className="k-pill bg-white/15 text-white backdrop-blur">{t.heroPill}</span>
              <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">{t.heroTitle}</h1>
              <p className="mt-5 max-w-xl text-lg text-white/90">{t.heroSubtitle}</p>
              <div className="mt-8 max-w-xl"><ScanWidget /></div>
              <Link href={p("/sign-up")} className="k-btn-primary mt-6 inline-flex bg-white text-kinnso-ink hover:bg-white/90">
                {t.applyCta} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
            <div className="hidden md:block" />
          </div>
        </div>
      </section>

      <EarningsTicker />

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

      {/* MERCHANT WALL */}
      <section className="border-y border-kinnso-cream2 bg-white py-10">
        <div className="k-container">
          <p className="text-center text-xs font-bold uppercase tracking-wider text-kinnso-muted">{t.merchantWall}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {merchantLogos.map((m) => (
              <span key={m} className="k-pill bg-kinnso-cream2 text-kinnso-ink px-4 py-2 text-sm">{m}</span>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED CREATORS */}
      <section className="k-container py-16">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="k-section-title">{t.featuredHeading}</h2>
            <p className="mt-1 text-kinnso-muted">{t.featuredSub}</p>
          </div>
          <Link href={p("/feed")} className="hidden text-sm font-bold text-kinnso-orange hover:text-kinnso-orangeDark md:inline">{t.featuredSeeAll} →</Link>
        </div>
        <div className="no-scrollbar mt-6 -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
          {featured.map((c) => <CreatorCard key={c.handle} c={c} locale={locale} />)}
        </div>
      </section>

      {/* TWO LANE SPLIT */}
      <section className="k-container pb-20">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="k-card overflow-hidden">
            <div className="aspect-[2/1] bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=1600&auto=format&fit=crop')" }} />
            <div className="p-6">
              <h3 className="text-2xl font-black text-kinnso-ink">{t.travelersTitle}</h3>
              <p className="mt-2 text-kinnso-muted">{t.travelersDesc}</p>
              <Link href={p("/explore")} className="k-btn-primary mt-4 inline-flex">{t.travelersCta} <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </div>
          </div>
          <div className="k-card overflow-hidden">
            <div className="aspect-[2/1] bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1556761175-5973dc0f32e7?q=80&w=1600&auto=format&fit=crop')" }} />
            <div className="p-6">
              <h3 className="text-2xl font-black text-kinnso-ink">{t.merchantsTitle}</h3>
              <p className="mt-2 text-kinnso-muted">{t.merchantsDesc}</p>
              <Link href={p("/merchants/post")} className="k-btn-primary mt-4 inline-flex">{t.merchantsCta} <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default HomeView;
