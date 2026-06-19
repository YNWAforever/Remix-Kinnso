# Front-of-House Slice 3e — Real Feed — design

**Date:** 2026-06-20
**Status:** Approved (design); pending spec review → implementation plan
**Repo:** `kinnso-v3` (web app `apps/web`)
**Builds on:** Slice 3b (the `/feed` hub + `feed` i18n group), Slice 3c (`getPublishedGuides()` real-guides read). Independent of Slice 3d.

---

## Goal

Replace the mock `/feed` with **real published guides** rendered in the existing stream layout. This removes the last fake content on a primary public nav destination, making the homepage→feed path show actual creator-authored guides. Reuses the read path Slice 3c already shipped — **no new query, schema, or migration**.

## Scope decision (locked)

| Decision | Choice |
|---|---|
| Feed data source | **Reuse `getPublishedGuides()`** (real DB guides + ambient mock seed, ordered `published_at desc`). No new query. |
| Creator display | Key off **`@creatorHandle`** + an **initials avatar** — the `Guide` list shape has no display name, avatar, or timestamp (those belong to a future creators-enrichment slice). |
| `postedAgo` | **Dropped** — no per-guide timestamp in the list shape; avoids locale relative-time work. |
| `/creators` + homepage featured | **Out of scope** — stay mock (rich creator cards need creators-table enrichment). |
| Migration | **None.** Web-only read wiring. |

## Architecture

```
/feed  (ISR, revalidate = 300)  ── getPublishedGuides() ──► Guide[]  ──► FeedView(items, locale)
                                     (real DB guides + seed)            stream cards → /g/[slug]
```

`/feed` mirrors `/explore`: it switches from a static page importing mock `feedItems` to an **ISR** server page that awaits `getPublishedGuides()`. Publishing a guide already calls `revalidatePath('/explore')`; this slice adds `/feed` to that revalidation so new guides surface immediately (5-minute ISR backstop otherwise).

## Components

### `app/[locale]/feed/page.tsx` (modify)
- Add `export const revalidate = 300`.
- `const guides = await getPublishedGuides()` → `<FeedView locale items={guides} t={messages.feed} />`.

### `components/kinnso/pages/FeedView.tsx` (modify)
- Prop changes from `{ locale, t }` to `{ locale, t, items: Guide[] }`.
- Renders each guide as a stream card (keeps the current card visual language) **wrapped in a `Link` to `/${locale}/g/${slug}`**:
  - cover `<img>` (from `guide.cover`),
  - an **initials avatar** circle derived from `creatorHandle` (no avatar data exists),
  - `@{creatorHandle}`,
  - the guide **title** as the caption,
  - `city` + `saves` (existing `savesLabel`).
- **Empty state** (`feed.empty`) when `items` is empty.
- No longer imports `feedItems`.

### Mock cleanup
- Remove the now-unused `feedItems` import from `FeedView`.
- Delete the `feedItems` array (and its `FeedItem` type if unused elsewhere) from `lib/creator-mock` **only if** no other module consumes it (verify during implementation; leave it if something else does).

## i18n

The `feed` group already has `pill`, `heading`, `subtitle`, `savesLabel`. Add **`feed.empty`** across all 7 locales; extend the `i18n.locale-parity` `GROUPS` is **not** needed (`feed` is already listed) — only the new key is added, and parity guards it automatically.

## Testing

- `FeedView` (jsdom): renders a real guide item (title + `@handle` + `/g/[slug]` link + saves), and the empty state when `items=[]`.
- `/feed` host (jsdom, mocking `getPublishedGuides`): renders cards from returned guides; non-array/empty handled.
- i18n parity: `feed.empty` present in all locales.
- Full gate: typecheck, lint, `vitest run`, `next build` — confirm `/feed` is now **ISR (`revalidate`)** rather than fully static, and `/explore` / `/g/[slug]` are unaffected.

## Out of scope (YAGNI)

- Real featured-creator cards on `/creators` + homepage (needs creators-table enrichment: public handle/avatar/bio + RLS + onboarding capture).
- Creator display names, avatars, and relative timestamps in the feed (list shape lacks them).
- Feed filtering/pagination, infinite scroll, per-user personalization.
- A distinct feed query separate from `getPublishedGuides` (reuse is sufficient).

## Risks & assumptions

- **Overlap with `/explore`:** the feed reuses `getPublishedGuides`, so it shows the same guides as `/explore`, in a stream layout. Accepted — the layouts differ and this removes the fake `feedItems`.
- **Sparse cards:** handle-only + initials avatar is intentional given the data; not a regression (the mock had richer fields, but they were fake).
- **ISR change:** `/feed` moves from static to revalidated — same, already-accepted change `/explore` made in Slice 3c.
