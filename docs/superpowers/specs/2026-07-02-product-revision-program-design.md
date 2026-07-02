# KINNSO Product Revision Program — Master Design

**Date:** 2026-07-02
**Status:** Approved program design (each phase gets its own spec + plan)
**Source:** `kinnso_revised_product_spec_framework.md` v1.0 (July 2026), reconciled against the live codebase
**Scope:** apps/web (product app), supabase/migrations, plus one scheduled sync job

---

## 1. Why this program exists

The revised product spec repositions KINNSO as a dual-sided, traveller-inclusive
marketplace: *"the AI travel creator marketplace — where creators turn their stories into
bookable guides, and merchants turn those guides into direct revenue."* A full survey of
the codebase (2026-07-02, 8-surface audit) found the product today is a creator-recruiting
platform with affiliate link-out monetisation. The largest gaps:

1. **No booking infrastructure at all** — money flows via Travelpayouts link-out +
   merchant-funded missions, settled manually by ops. Affiliate conversion-event
   ingestion (`normalizeTravelpayoutsAction`) exists but has no production caller.
2. **AI Agent serves the wrong audience** — the live copilot is creator-only
   (`/api/copilot` returns 403 for non-creators) and cannot query site content; the
   public `/agent` page still says the copilot "ships in a later release".
3. **Homepage is 100% creator-recruiting** — fake scan widget, mock-data social proof
   (`lib/creator-mock`), travellers/merchants get one card each.
4. **Community Sessions are total greenfield** — no tables, routes, or strings.
5. **Merchants cannot self-serve** — no sign-up path creates `merchant_profiles` rows;
   no public merchant directory/profiles; no experience-listing entity.
6. **Social proof is absent or fake** — no platform stats, testimonials, or reviews.

What already aligns with the spec and is kept: the guides system (creator CRUD +
publish), the articles system (7-locale translations, strong SEO), creator onboarding
(AI scan → DNA → profile), the contribution-tier backbone (seed/rising/pro/elite), the
missions/settlements machinery, and the ops/admin console (Phases 10–13).

## 2. Locked decisions (user-approved 2026-07-02)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Meaning of "bookable" | **Real direct booking** — availability, checkout, payments on-platform |
| D2 | Traveller identity | **Traveller accounts as a first-class role + guest checkout** (email-only booking allowed) |
| D3 | Brand surface | **Full redesign** — new visual direction and new IA; the market-passport/ticket motif is retired |
| D4 | Community Sessions | **Full P1 per spec** — listing, detail, RSVP + email capture, third-party live embed, replay playback; native player deferred |
| D5 | Payments | **Stripe, platform collects** — KINNSO takes the full amount via Stripe Checkout; merchant/creator shares settle through the existing ops payout-queue pattern; Stripe Connect deferred |
| D6 | Sequencing | **Positioning first, transact second** (phases R1→R6 below) |

## 3. Positioning and product loops

Adopt the spec's positioning verbatim. All three loops terminate in an on-platform
booking:

- **Creator loop:** publish guide/article/session → surfaced by explore + AI agent →
  traveller books an embedded experience → creator commission lands in the payout queue
  → creator publishes more.
- **Merchant loop:** self-serve sign-up → list experiences → creators embed them →
  travellers book → "Booked via [Creator]" attribution dashboard → merchant invests more.
- **Traveller loop:** lands via SEO/social → browses guides/articles/destinations → AI
  agent assists → books via Stripe → post-trip review (R6) → social proof recruits the
  next traveller.

## 4. Information architecture (target state)

```
/                         New 10-section dual-sided homepage (full redesign)
/explore                  Guides listing (re-skinned; stays the guides home)
/destinations             Destination browse (designed placeholder in R1 → real in R6)
/articles                 Existing article system (re-skinned; + guide/experience embeds)
/sessions                 Community Sessions: upcoming, RSVP, replays (R5)
/agent                    Traveller AI Agent (waitlist in R1 → live chat in R4)
/creators + /c/[handle]   Creator directory + profiles (existing, re-skinned)
/merchants + /m/[slug]    NEW public merchant directory + merchant profiles (R2)
/experiences/[slug]       NEW experience pages with booking CTA (R2; bookable in R3)
/for-creators             NEW creator acquisition landing (split out of /creators)
/for-merchants            NEW merchant acquisition landing (replaces current /merchants landing)
/trips                    NEW traveller account area: bookings, saves (R3)
/studio/*                 Creator dashboard (unchanged home, new skin)
/merchants/dashboard/*    Merchant app consolidated here (301s from /merchants/missions, /merchants/post, /merchants/creators, /merchants/insights) (R2)
```

Rules:
- **Content URLs never move.** `/articles/...`, `/g/[slug]`, `/c/[handle]` are the
  organic-acquisition assets; the redesign re-skins them in place.
- `/merchants` is repurposed from merchant-facing landing to public directory; the
  acquisition pitch moves to `/for-merchants`; the merchant app moves under
  `/merchants/dashboard/*` with 301 redirects (R2).
- Nav (all roles): Explore, Destinations, Articles, Sessions, AI Agent, Creators,
  Merchants, plus For Creators / For Merchants placement decided in R1's design.
  Role-specific items (Studio, Merchant dashboard) keep the current client-side
  `useViewerRole` pattern so public pages stay statically generated.
- Placeholder routes reuse the existing `ComingSoonPage` pattern
  (`app/[locale]/_routeHost.tsx`), but with designed, on-brand content.

### 4.1 Homepage (spec §5.2, with two honesty adaptations)

Sections in order: 1 Hero (traveller-first) · 2 Social-proof bar · 3 How it works
(3-step, audience toggle) · 4 Featured guides · 5 AI Agent block · 6 Articles highlight ·
7 Community Sessions · 8 Merchant value prop → /for-merchants · 9 Creator CTA →
/for-creators · 10 Footer.

Adaptations:
- **AI Agent block is a waitlist CTA with value framing until R4 ships** (the spec's own
  rule: never feature a non-live agent).
- **Sessions section renders only when real sessions exist** (unlocks in R5). No empty
  carousels, no zeros: the social-proof bar shows real counts with "growing fast"
  placeholders below a display threshold.
- All mock-data components are removed from public pages: `ScanWidget` (fake 1.6 s scan),
  `PassportHeroStack` (hardcoded payouts/scores), `MerchantsLandingView` sample missions,
  and the dead `EarningsTicker`.

### 4.2 Visual direction

Full redesign: new design tokens, typography, and component set replacing the
market-passport/ticket language, keeping Tailwind v4 `@theme` + shadcn/ui conventions.
Brand voice per spec §1.3: warm, knowledgeable, insider-feeling, action-oriented;
English-default with Cantonese-friendly HK copy allowances. The concrete visual language
is R1's own design exploration — this document only fixes that R1 delivers the system
and every later phase builds in it.

## 5. Data model and architecture additions

House rules apply to every item: new timestamped migrations only (never edit shipped
ones), RLS on all tables, public reads via `createSupabasePublicClient()` (anon),
money writes via audited `SECURITY DEFINER` RPCs gated like the existing admin RPCs,
regenerate `@kinnso/db` types after each migration.

| Entity | Phase | Shape (high level) |
|--------|-------|--------------------|
| `traveler_profiles` | R3 | `user_id` PK → auth.users, display_name, locale, marketing_opt_in. `ViewerRole` gains `'traveler'` (default for sign-ups with no creator/merchant row). Guest bookings need no row. |
| `experiences` | R2 | merchant_profile_id, slug, title, description, city/destination, price_amount + currency (HKD-first), duration, media, status draft/published/paused. Public read of published; merchant-owned CRUD. |
| `experience_availability` | R3 | Date-slot rows with capacity (calendar of bookable dates, seats remaining). Deliberately not a scheduling engine. |
| `bookings` | R3 | experience_id, availability_id, traveler_user_id OR guest_email, qty, unit/total amounts, currency, status `pending_payment → confirmed → completed / cancelled / refunded`, stripe_payment_intent_id, **attribution: creator_id, guide_id, source_surface**. Plus `booking_events` audit trail (ops_audit_log conventions). |
| Booking commission ledger | R3 | Bookings feed the existing ops payout queue (`/admin/creators/payouts`). Exact shape (`booking_settlements` sibling vs generalising `mission_settlements`) is R3-spec territory; invariants fixed here: per-currency, audited, transition-matrix RPC, never summed across currencies. |
| `community_sessions` + `session_rsvps` | R5 | host creator, type (destination briefing / ask-a-creator / merchant spotlight / new-creator intro), starts_at, duration, embed_url, replay_url, status scheduled/live/ended, destination tags. RSVP = email + optional user_id (CRM capture). Table names avoid the `affiliate_network_events` and auth-session collisions. |
| `platform_stats` RPC | R1 | Security-definer counts: active creators, published guides, distinct destinations, completed bookings (0 until R3 — threshold-gated display). |
| `testimonials` | R1 | Curated, ops-console-managed; surfaced on homepage and both landing pages. |
| `guide_saves` | R6 | Real join table; trigger keeps the denormalised `guides.saves_count` honest. |
| `reviews` | R6 | Post-booking only (confirmed bookings can review) → `aggregateRating` JSON-LD on experiences and guides. |
| Cross-links | R1 → R6 | R1: heuristic city/tag matching embeds guide cards in articles ("Planning a trip here?"). R6: better matching + editorial override table, plus experience embeds. |

### 5.1 Payments (Stripe, platform collects)

- **Stripe Checkout (hosted)** for v1 — least PCI surface, fastest build.
- `/api/stripe/webhook` route confirms/cancels bookings. The Stripe signature is the
  auth gate; this route is the **one sanctioned exception** to the
  no-service-role-in-request-paths rule (documented here deliberately). Webhook handling
  must be idempotent (unique on payment_intent/event id).
- Refunds are an ops-console action (audited RPC + Stripe refund call).
- Stripe Connect (auto-split at charge time) is explicitly deferred; the platform
  collects and ops settles shares through the payout queue as today.

### 5.2 Traveller AI Agent (R4)

New `/api/agent` route + policy, fully separate from the creator copilot (different
audience, auth, quota, system prompt; `copilot_messages` and its RLS are not reused).
Anon-accessible with IP-based rate limits and a cheap model; retrieval tools over
published guides, articles, and experiences (destination/dates/style → ranked
recommendations with links to bookable slots). Traveller sign-in unlocks saved history.
Spec's "Agent v2" (full itinerary assembly) is out of program scope. The creator copilot
is untouched.

### 5.3 Repair job: affiliate ingestion (R3)

Wire the existing `normalizeTravelpayoutsAction()` to a scheduled sync job that pulls
Travelpayouts actions into `affiliate_network_events`, so affiliate attribution works
alongside direct-booking attribution. Replace the placeholder catalog program ids with
real Travelpayouts campaign ids as part of this task.

## 6. Phase decomposition

Each phase = own brainstorm-lite/spec + plan + implementation cycle; per-slice squash
PRs titled "Phase RN — …" (same operating model as Phases 10–13).

### R1 — Redesign & Repositioning
New design system + full visual redesign; 10-section homepage; new nav/footer IA;
`/for-creators` + `/for-merchants` landings; `platform_stats` RPC + social-proof bar;
`testimonials` table + ops CRUD; article→guide cross-link module (heuristic);
mock-data removal; `/agent` page → honest waitlist; designed placeholders for
`/destinations` and `/sessions`; SEO plumbing (MARKETING_PATHS, metadata, JSON-LD,
sitemap) — content URLs untouched. Exit: all 10 homepage sections live; zero mock data
on public pages.

### R2 — Merchant supply
Merchant self-serve application (sign-up → ops review queue in the existing admin
console, <48 h target); `experiences` + merchant listing CRUD; public `/merchants`
directory, `/m/[slug]` profiles, `/experiences/[slug]` pages with "booking opens soon"
state; merchant app consolidation under `/merchants/dashboard/*` + 301s. **Kick off
Stripe HK account/KYC at R2 start** (long lead item). Exit: a merchant can go from
sign-up to a published experience without ops writing SQL; seeded real merchants across
hero destinations.

### R3 — Booking MVP
Traveller role + guest checkout; availability calendar; Stripe Checkout + webhook;
`/trips`; merchant booking pipeline (pending/confirmed/completed) with "Booked via
[Creator]"; booking commission ledger → existing payout queue; embedded experience CTAs
in guides and articles (spec §6.3 loop made real); Travelpayouts ingestion wiring;
bookings count joins the social-proof bar. Exit: a traveller can discover → book → pay;
a creator sees the commission; a merchant sees the attributed booking.

### R4 — Traveller AI Agent v1
`/api/agent` + public chat at `/agent`; retrieval over guides/articles/experiences;
homepage block flips waitlist → "Try AI Agent". Exit: agent satisfaction instrumentation
in place.

### R5 — Community Sessions P1
Tables + `/sessions` listing/detail; RSVP email capture; third-party live embed; replay
playback; creator Studio scheduler; ops session management; Event JSON-LD; homepage
Sessions section unlocks.

### R6 — Loops & proof
Real saves; post-booking reviews + `aggregateRating`; `/destinations` browse goes real;
cross-link automation + editorial overrides; testimonial rotation. Decide here whether
the existing tier taxonomy (seed/rising/pro/elite, already wired into gating) adopts the
spec's marketing names (Explorer/Navigator/Pathfinder/Ambassador) — cosmetic rename,
deferred deliberately.

## 7. Cross-cutting conventions (every phase)

- Every UI string added to ALL 7 locale files (`lib/i18n/messages/*.ts`); new groups
  registered in the parity test.
- Locale pages: `await params` → `isLocale` guard → `notFound()` → `getDictionary`.
- Public reads anon + RLS; money/state writes via audited SECURITY DEFINER RPCs
  (`is_active_ops()` for ops surfaces; owner-RLS for user surfaces); the Stripe webhook
  is the sole documented service-role exception.
- Vitest unit/host tests per surface; e2e specs in apps/e2e for the booking funnel.
- Sitemap/robots/JSON-LD updated with every new public route; private trees noindexed.
- Conventional Commits with scope; squash-merged "Phase RN — …" PRs.

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Supply cold start (booking UI, no inventory) | R2 exit criterion: seeded real merchants/experiences across 5 hero destinations before R3 ships publicly (spec §10.3 seed-&-scaffold). |
| Full-redesign scope creep | R1 spec locks tokens/components before page builds; R2 doesn't start until all 10 homepage sections ship. |
| Stripe readiness (KYC lead time, webhook bugs) | Start KYC at R2 kickoff; webhook idempotency + signature verification are R3 acceptance criteria. |
| Agent cost/abuse (anon endpoint) | IP rate limits, cheap model, retrieval-grounded output only, hard daily caps. |
| SEO regression during redesign | Content URLs frozen; 301s for moved merchant routes; sitemap/parity tests green each phase. |
| Homepage promises outpacing product | Waitlist CTA for agent until R4; Sessions section data-gated until R5; threshold-gated stats. |

## 9. Success metrics (spec §12, "Phase 1" = end of R4)

North star: 500 bookings completed · 30 active creators · 20 active merchants.
Leading: 100+ guides, 25+ articles, 10+ sessions hosted (post-R5), 500+ agent trips
initiated, guide→booking conversion ≥3%. Quality: guide rating ≥4.2/5 (post-R6 reviews),
creator 30-day retention ≥60%, merchant 30-day retention ≥50%, agent satisfaction ≥4.0/5.

## 10. Out of scope (this program)

Stripe Connect auto-splits · AI Agent v2 itinerary assembly · native session player ·
mobile app · merchant advertising tier · group trip planning · multi-network affiliate
support · tier-name rename (decided in R6, executed later if chosen).
