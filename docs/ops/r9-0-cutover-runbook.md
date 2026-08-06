# Legacy cutover runbook (R9.0)

The ordered procedure for cutting over from the legacy Laravel site to the new stack, and how to
read what the gate tells you. This makes the cutover *provable*; it does not flip DNS.

## Before you start

The gate reads legacy MySQL over the public internet. Confirm the TLS mode first, because a server
with no TLS reports as `Server does not support secure connection`, which names neither the cause
nor the variable that fixes it:

```bash
pnpm --filter @kinnso/sync preflight
```

`LEGACY_DB_SSL` defaults to `require` (encrypt, accept an unverified cert). Use `verify-ca` with
`LEGACY_DB_SSL_CA` where you have the CA; use `disable` **only** when the legacy server has no TLS
at all. `LEGACY_DB_TIMEZONE` must name the zone the legacy DATETIME columns were written in — they
carry no zone, and a wrong value silently shifts every `published_at`.

The `--legacy-mysql` DSN carries host, port, credentials and database **only**. A DSN containing
`ssl`, `sslmode` or `useSSL` is rejected rather than ignored, so you cannot end up believing a TLS
setting applied when it did not.

## The procedure

### 1. Ingest the legacy redirect map

```bash
curl -sS -X POST "$APPS_SYNC_URL/redirects" \
  -H "x-admin-token: $SYNC_ADMIN_TOKEN" \
  -H 'Content-Type: text/plain' \
  --data-binary @redirect.php
```

Responds `{ ok: true, parsed, written }`. `written` is lower than `parsed` when the file repeats a
`from_path` — the first entry wins, matching the legacy router's first-match-wins order.

`apps/web/proxy.ts` reads `seo_redirects` at request time and serves **301**s from it. Nothing else
in production writes that table, so skipping this step means every legacy URL 404s. Idempotent:
re-run freely after a partial failure.

### 2. Backfill the articles

```bash
curl -sS -X POST "$APPS_SYNC_URL/backfill" -H "x-admin-token: $SYNC_ADMIN_TOKEN"
```

High timeout; apps/sync paginates 200/batch internally. Do this **after** step 1 so a redirect
already exists for anything the publication gate drops in step 3.

### 3. Run the parity gate

```bash
pnpm --filter @kinnso/parity parity \
  --legacy-mysql "$LEGACY_DSN" \
  --base-url https://www.kinnso.ai
```

## Exit codes

| Code | Meaning | What to do |
|------|---------|-----------|
| `0` | Every check passed. | Proceed. |
| `1` | The gate ran and **found a parity failure**. | Read the report. Do not cut over. |
| `2` | **The gate never ran.** | Fix the configuration and re-run. |

**Exit 2 is not a soft pass.** It means the baseline could not be measured, so nothing was verified.
Treating it as "close enough" is precisely the failure this phase exists to remove — the mode used
to return empty sets, and an empty baseline makes every check vacuously true. The gate now refuses
to build on:

- an empty scan, or a corpus where nothing is visible on the new stack;
- a scan shorter than `livePostCount()` (truncated — it would under-report drift while looking healthy);
- a locale fan-out exceeding the SQL translation ceiling (the baseline invented a locale);
- an article whose category has no URL segment (aggregated into one error, never a dropped path —
  dropping would silently shrink the baseline);
- a DSN carrying TLS settings.

## Abort conditions

Do not cut over if any of these appear:

- **`sitemap-superset` failure.** An expected legacy URL is missing from the new sitemap. This is
  the check that consumes the baseline — note `url-coverage` does **not**; it only probes what the
  new stack itself claims to publish.
- **`row-counts` failure.** Per-locale visible-translation counts disagree with the baseline. It
  fails in **either** direction — more is as wrong as fewer.
- **`redirects` failure.** A sampled legacy redirect does not resolve as expected.
- **`negative-404` failure.** Something that should be gone is still served.
- **`seo-loss` failure.** See below.

## Reading `seo-loss`

This check exists because `isPostLive` is not the publication predicate. `validatePublication`
unpublishes an article when a locale has fewer than three visible blocks, fewer than 150 words, an
invalid external link, or no active named author — so the legacy site can serve a URL the new stack
will deliberately refuse to publish.

Those URLs are invisible to every other check: absent from the new stack, so `url-coverage` never
sees them; absent from the expected set, so `sitemap-superset` never sees them either. Without this
check they are a silent 404 on cutover day.

A `seo-loss` failure means **N URLs go dark with no redirect**. Two numbers are reported — paths and
distinct articles — because `published_at` is nulled article-wide, so one thin locale takes every
other locale of the same article down with it. Each row names the `legacyPostId` and the verbatim
warning codes, so you can see whether to fix the content or accept the loss.

To resolve, either fix the content in legacy and re-run step 2, or add a redirect for the URL and
re-run step 1. A loss whose locale-stripped path (`/articles/{segment}/{url}`) matches a
`seo_redirects.from_path` is forgiven — the URL still resolves with a 301, so no link rots. Match on
the locale-stripped form: `from_path` is locale-agnostic and `apps/web/lib/redirects/resolve.ts`
strips the locale before looking it up.

## Reading `redirects`

`--legacy-mysql` samples the rows step 1 ingested, read through the same Supabase client the
newstack checks use. The sampled target is **locale-prefixed** (`/en/articles/...`) because that is
what `resolve.ts` emits; `seo_redirects.to_path` itself is locale-agnostic.

If this check emits no rows at all, the redirect map was never sampled — treat that as a
misconfiguration, not a pass.

## A note on the sitemap

**There is no `/sitemap.xml`.** `apps/web/app/sitemap.ts` exports `generateSitemaps`, so the only
sitemap route Next emits is `/sitemap/[__metadata_id__]`, prerendered as `/sitemap/0.xml` — which
is why `apps/web/app/robots.ts` advertises `/sitemap/0.xml` and not an index.

So the gate enumerates `/sitemap/0.xml`, `/sitemap/1.xml`, … until one 404s. Only a 404 ends the
walk; any other status **fails**, because a 5xx read as "no more shards" would silently truncate
the URL set and `sitemap-superset` would report every URL in the unread shards as missing. That is
a phantom failure, not a real one. `/sitemap.xml` is still tried first — and both a `urlset` and a
`sitemapindex` are handled there — so the gate keeps working if one is ever introduced.

Two earlier drafts of this section were wrong, in opposite directions: the first said the shards
only appear past 40,000 URLs (`SITEMAP_CHUNK`), the second said `/sitemap.xml` serves an index at
any size. It serves nothing. The consequence was that the scrape ran against a 404 page, found
zero `<loc>` elements, and reported the site as publishing **no URLs at all**.
